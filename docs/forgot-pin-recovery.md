# Forgot-PIN recovery (kid-friendly)

**Decided 2026-04-25.** Marcus + Claude.

Kids forget PINs constantly. Email reset is useless for an 8-year-old. We
ship a two-tier recovery flow:

## Tier 1 — game-progress challenge (primary)

Returning player taps their chip → enters wrong PIN twice → on the third
attempt the shake-error screen offers **"I forgot my secret number"**.

Tapping it shows 3 multiple-choice questions drawn from the player's own
game state, e.g.:

| Question | Source |
|---|---|
| "Which animal did you adopt out most recently?" | `adopters.recentlyPlaced[0]` + 3 distractors from other animals never met |
| "What's your apprentice called?" | `apprentices.bondedTo` (Rhubarb / Amara / Kofi) — pick 1 of 3 |
| "Which of these have you NOT unlocked yet?" | `charms.locked[0]` + 3 unlocked distractors |

Question pool grows with progress. Pick 3 at random per attempt.

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
