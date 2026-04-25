# Forgot-PIN recovery (kid-friendly)

**Decided 2026-04-25.** Marcus + Claude.

Kids forget PINs constantly. Email reset is useless for an 8-year-old. We
ship a two-tier recovery flow:

## Tier 1 — game-progress challenge (primary)

Returning player taps their chip → enters wrong PIN twice → on the third
attempt the shake-error screen offers **"I forgot my secret number"**.

Tapping it shows 3 multiple-choice questions drawn from the player's own
game state. Pool is split into **early-game** (work from session 1) and
**mid-/late-game** (need progress).

### Early-game pool (work from the very first session)

| Question | Source |
|---|---|
| "Which animal did you pick when you signed up?" | `early.signupAvatar` (one of the 8 emoji on the picker) + 3 emoji distractors |
| "Which one is your first pet?" (visual cards) | 3 identical sprite cards of the first pet, each with a different painted name tag. Kid taps the card whose tag matches the name they chose. Correct = `early.firstAnimalName`, distractors from a 20-name pool. Sprite from `early.firstAnimalSpriteSrc`. |
| "What kind of animal was the FIRST one to arrive?" | `early.firstAnimalSpecies` (cat / dog / fox / bunny / bat / parrot / snake) + 3 species distractors |

**The first animal arrives WITHOUT a name tag** — the kid has to name
it themselves before the arrival popup closes. That makes the
"first-animal-name" question much stronger as a recovery anchor than
a system-assigned name would be: the kid genuinely chose those
letters, so they remember them. Wire into the arrival flow as: name
field on the arrival popup, save to `early.firstAnimalName` +
`early.firstAnimalSpriteSrc`, fall back to a random name only if the
kid hard-skips.

**Recovery anchor + photo-feature onboarding (one moment, two jobs):**
Right after the kid names the pet, the game says something like:
> *"Remember [Pet Name]'s name — if you ever forget your secret code,
> [Pet Name] will help you get back in!"*

That makes the recovery flow feel friendly and gives the kid a
mnemonic instead of a security mechanism.

Then we introduce the **photo feature** in the same beat: the kid
takes a photo of [Pet Name] (with the painted name tag in frame), and
the photo lands on the **memory wall** in their room. Two wins:
1. The photo + name tag is a permanent visual memory aid for the
   recovery question — even if the kid forgets the name, the photo
   has it.
2. The kid learns the photo mechanic (which is also used elsewhere:
   adopter scrapbook, garden moments, etc.) at the natural moment
   when they have a reason to use it.

The photo isn't a recovery secret — it's not used to log them in. The
recovery flow still uses the visual-card MCQ. The photo just helps
them remember the answer if they ever need to.

### Mid-/late-game pool (need progress)

| Question | Source |
|---|---|
| "Who did you most recently send your animal home with?" | `adopters.recentlyPlacedIds[0]` + 3 distractors from `adopters.householdLabels` |
| "Which apprentice did you most recently welcome to the centre?" | `apprentices.apprentices` (most-recent recruit) — distractors are the other 2 canonical apprentices |
| "Which of these charms have you NOT unlocked yet?" | A locked charm from `charms.unlockedCharms` complement + 3 unlocked distractors |

Pool is checked in order; we pick up to 3 with deterministic shuffle
seeded by `(username, attemptIndex)` so reloading the same attempt
doesn't re-roll the dice but a fresh attempt does.

**Pass thresholds:**

- **3 / 3 correct** → unlock + force PIN reset (new PIN required)
- **2 / 3 correct** → fall through to Tier 2 (hint)
- **0–1 / 3 correct** → "Ask a grown-up to help" — show parent-help
  screen (not built yet, parked)

**Why this works:** real player knows the answers cold. A sibling
guessing has no idea who the user adopted out yesterday or which
apprentice they bonded with. Brand-new players (< 1 hour of progress)
fall through to Tier 2 automatically since the question pool is empty.

## Tier 2 — PIN hint (fallback)

Captured at signup, right after the PIN is set. Free-text up to ~60
chars.

### Signup conversation flow

1. Kid types a PIN.
2. **"What's a clue to help you remember it?"** — text input.
3. Kid types a hint.
4. We run `validatePinHint(hint, pin)`. If it leaks (rule list below),
   reject with the matching error message and let them try again.
5. If it passes the leak rules, **gut-check question**:
   > **"Could someone else guess your secret number using this hint?
   > If yes, think of something else."**
   >
   > [I'm sure it's safe →]   [Help me think of something →]
6. **"I'm sure"** → save and continue.
7. **"Help me think"** → show 4 starter ideas drawn from a 20-item
   pool, deterministically keyed by the kid's username so two kids
   don't see the same prompts (otherwise a sibling who knows the
   shared list could reverse-engineer the hint). Implemented as
   `getHintIdeas(seed)` in `auth-validation.ts`. Tap an idea →
   pre-fills the input. Edit-and-save still required.

The reason for the gut-check: the leak rules below catch the obvious
cases ("my pin is 1234"), but they can't catch "the number of teeth in
my mouth" if the kid genuinely has 12 teeth. The kid's own judgement
+ the prompt to reconsider catches the soft cases.

**Hard constraint: the hint must NOT leak the PIN.**

`validatePinHint(hint, pin)` rejects with explanation if the hint:

1. Contains the PIN as a literal substring (`PIN=1234`, hint="my pin
   is 1234" → reject)
2. Contains any 3+ consecutive digits of the PIN
3. Contains the digits in spelled-out form: `1234` → "one two three
   four", "twelve thirty-four", "one thousand two hundred thirty-four"
4. Contains any 3+ digit numeric substring at all (defensive — if hint
   has `[0-9]{3,}`, treat as PIN-leakage risk and reject)
5. Is ONLY digits / contains no letters (forces it to be a real hint)

If validation fails, show: "That hint gives away your secret number.
Try again — your hint should help YOU remember without telling anyone
the number itself."

The hint is shown on the forgot-PIN screen as a quiet line under the
"Try again" button, after the user gets 2/3 on Tier 1, or as the only
recovery option for new players with empty game state.

## What we build

### Logic (`packages/game-logic/src/auth-validation.ts`)

```ts
export function validatePinHint(hint: string, pin: string): { valid: true } | { valid: false; error: string }
```

with unit tests covering: literal PIN, 3-digit substring of PIN,
spelled-out digits, all-digits hint, empty hint, valid hints.

### Game state (`packages/game-logic/src/forgot-pin.ts`)

```ts
export interface RecoveryQuestion { prompt: string; options: string[]; correct: number; }
export function buildRecoveryQuestions(state: GameState): RecoveryQuestion[]
```

Returns 3 questions if there's enough progress, or `[]` if not.

### UI

- **Signup**: extra step after PIN entry, captures the hint + validates
  against the just-set PIN. Doesn't advance until hint is valid.
- **Login**: after 3 wrong PIN attempts, "I forgot my secret number"
  link appears under the keypad.
- **Forgot-PIN screen** (`mockup-forgot-pin.html`): 3 MCQ → pass / try
  hint / parent help.

### Database

- `users.pin_hint` column (nullable for legacy users until they update)
- `users.pin_hash` already exists
- No new tables — recovery questions are derived from existing state.

## Out of scope (parked)

- Tier 3 parent-help screen (would need parent-set verification
  questions during signup — extra friction). Punted to backlog.
- SMS/email-based reset — incompatible with shared family-iPad use case.
- Biometric / device-PIN — depends on PWA / native shell decisions
  later.

## Open questions for Marcus

1. **How many wrong PINs before "I forgot" appears?** Suggested: 3.
2. **Should the recovery flow itself rate-limit?** e.g. only one
   recovery attempt per 5 minutes to stop sibling brute-forcing the
   MCQ. Suggested: yes, with a kid-friendly "Wait a few minutes and
   try again" message.
3. **What happens after successful recovery?** Force a new PIN, or
   keep the same one? Suggested: force new (the reason it was
   forgotten is the kid never used it).
