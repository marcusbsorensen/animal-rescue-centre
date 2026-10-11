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

## Tier 2 — PIN clue (fallback)

**Changed 2026-10-11.** The clue is picked from a fixed list, never typed.

It was free text of up to 100 characters, stored as typed on the `users`
row and returned by `get-pin-hint` to anyone who knew the player's name.
A child could write anything about themselves in it. Migration `00010` blanked every typed
hint and `00011` drops the column.

### Signup

After the PIN is set and confirmed, the child sees "Where do your numbers
come from?" and taps one of six clues:

| Code | Words shown |
|---|---|
| `birthday` | A birthday |
| `year` | A year |
| `pet` | About a pet |
| `shirt` | A shirt number |
| `pattern` | A shape on the keypad |
| `favourite` | My favourite numbers |

None of them points at where a child lives or can be found (no phone
numbers, house numbers or schools). Only the code is sent and stored
(`users.pin_hint_code`, with a check constraint that accepts these six
and nothing else). The list is `PIN_HINT_CHOICES` in
`packages/game-logic/src/pin-hints.ts`; the signup page, the Edge
Functions and the constraint each hold a copy, and `pin-hints.test.ts`
fails if any copy differs.

### Forgot-PIN screen

`get-pin-hint` returns `{ found, hintCode, hint }`, where `hint` is the
words. The screen shows "Here is the clue you picked for your secret
code." with the words, or "There is no clue saved for your secret code."
Accounts made before 2026-10-11 have no clue saved.

## What we build

### Logic (`packages/game-logic/src/pin-hints.ts`)

`PIN_HINT_CHOICES`, `isPinHintCode(value)` and `pinHintText(code)`.

### Game state (`packages/game-logic/src/forgot-pin.ts`)

```ts
export interface RecoveryQuestion { prompt: string; options: string[]; correct: number; }
export function buildRecoveryQuestions(state: GameState): RecoveryQuestion[]
```

Returns 3 questions if there's enough progress, or `[]` if not.

### UI

- **Signup**: extra step after PIN entry; the child taps one of the six
  clues. Doesn't advance until one is picked.
- **Login**: after 3 wrong PIN attempts, "I forgot my secret number"
  link appears under the keypad.
- **Forgot-PIN screen** (`forgot-pin.html`): 3 MCQ → pass / try
  hint / parent help.

### Database

- `users.pin_hint_code` column, one of the six codes or null
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
