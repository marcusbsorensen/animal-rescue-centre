# Adoption-matching mini-game — design

> Status: Design draft, 2026-04-29. Not yet implemented.
> Triggered by `future-features-lily.md` §4 ("Animal exit points").
> Open to Marcus + Lily review before any code is written.

## Why this exists

Lily will accumulate animals faster than she can bond with them.
Without an exit path the shelter overflows, the gameplay becomes a
hoarding sim, and the moral message inverts — animal welfare becomes
"keep them all" instead of "find them the right home".

Adoption matching is the first exit path. It also bolts onto two
other open problems:

- **Revenue** — adoption fees are the natural extension of donation
  income (`charity.ts` already exists, untapped).
- **Education** — every match is an opportunity to teach what makes
  a "right home" for a species (and what doesn't).
- **Cast utility** — the 32 painted households were always meant to
  receive animals; right now they exist as scenery in the corridor
  arrival popups. Adoption matching activates them.

## Pitch in one paragraph

When an animal is well, bonded enough to leave, and not the player's
favourite, the player can walk it out to the **Adoption Office** in
the corridor. The office shows two or three painted **applicant
cards** — adopter households from the existing 32-family roster, each
with a brief profile (species preference, home type, activity level,
quirks). The player drags the animal onto the card they think fits
best. The game plays a small painted vignette of the handover, awards
an adoption fee, and either (a) the household stays "happy" — visible
later in arrival popups and the friends scene — or (b) the animal
comes back a week later with a gentle educational message about why
the match didn't work.

## Player flow

1. **Eligibility check** — `canBeAdopted(animal)` returns true when:
   - `bond ≥ 0.6` (they're known and named)
   - `health = 'well'`
   - Animal is not in `playerFavourites` (Lily's own pets — bond ≥ 0.9)
   - Player has reached level 4 (gates the office to mid-game)
2. **Walk-to-office trigger** — eligible animals get a small painted
   "ready to find a home?" speech-bubble icon when the player taps
   them. Tapping the bubble starts the walk-to-office cinematic
   (reuses WalkScene with a fixed destination).
3. **Adoption Office screen** — full-viewport iframe over Phaser, in
   the same painted-storybook treatment as the auth screens. Layout:
   - Top: the animal sprite on a painted polaroid, name + species + a
     single trait line ("loves cuddles", "needs lots of space").
   - Middle: 3 applicant cards (painted-storybook household portraits
     with a written profile sticker beside each).
   - Bottom: drag-target hint ("Drag your friend onto the family that
     feels right").
4. **Drag-and-drop matching** — touch + mouse. Drop on a card → the
   card flips to a painted vignette: family + animal in their home.
   Adoption fee dropped onto a coin pile, sound cue.
5. **Outcome reveal** — three timing modes:
   - **Good match** (preference + traits align) — vignette is happy,
     fee is full, household opinion +1.
   - **OK match** (preference align, traits mismatch) — vignette is
     neutral, fee is full, animal stays.
   - **Bad match** (preference clash) — vignette is gentle-sad, fee
     is half (refund), animal returns next week with a "didn't
     settle" speech bubble. Educational sticker explains the why.

## Match logic

Pure module: `packages/game-logic/src/adoption.ts`. Inputs:

```ts
interface Applicant {
  householdId: HouseholdId;       // 01..32 from rehoming-cast.md
  speciesPreferences: Species[];   // can be more than one
  excludedSpecies?: Species[];     // allergies, fear, etc.
  activityLevel: 'low' | 'medium' | 'high';
  homeType: 'flat' | 'house-no-garden' | 'house-with-garden' | 'farm';
  quirks?: AdopterQuirk[];         // e.g. 'has-young-kids', 'works-from-home', 'has-existing-cat'
}

interface AnimalForAdoption {
  species: Species;
  variant: string;
  activityNeed: 'low' | 'medium' | 'high';
  spaceNeed: 'flat-ok' | 'needs-garden' | 'needs-acres';
  socialQuirks?: AnimalQuirk[];    // e.g. 'shy', 'energetic', 'good-with-children', 'must-be-only-pet'
}
```

Match scoring `score(applicant, animal): MatchOutcome`:

```ts
type MatchOutcome =
  | { kind: 'good'; reasons: string[] }
  | { kind: 'ok'; reasons: string[] }
  | { kind: 'bad'; reasons: string[] };
```

Rules (deterministic, kid-readable):

- **Hard reject (`bad`)** — applicant species preference excludes the
  animal, or animal `must-be-only-pet` collides with `has-existing-cat`,
  or `needs-acres` collides with `flat`.
- **Hard accept (`good`)** — species in preference list AND
  activity/space needs satisfied AND no quirk clashes.
- **`ok`** — species matches but one soft quirk mismatches (energetic
  animal in low-activity home, shy animal in young-kids home).

Each reason is a kid-friendly sentence that the office can render
verbatim ("Mrs Estrada loves cats!", "Henry needs a garden — the
Patel-Greens don't have one yet").

## Picking the 3 applicants

Pure helper `pickApplicants(roster, animal, rng): Applicant[]`:

- Always include 1 `good` candidate (so the optimal answer exists).
- Always include 1 `ok` candidate (so there's a choice with a
  trade-off).
- Include 1 `bad` candidate **only at level ≥ 6** — early on, every
  visible card should be at least an `ok` so kids feel competent.
  Replace the `bad` slot with a second `ok` until level 6.

Roster rotates so the same applicant doesn't appear back-to-back
unless they're the only fit. Track `lastSeenAt` per household.

## Educational layer

Every `bad` outcome surfaces a one-line lesson sticker, drawn from a
small dictionary keyed on the failure reason:

- "Some dogs need a garden to run in. Flats can be tricky for
  energetic pups."
- "Cats and pet rats sometimes don't get on. Pickle would worry."
- "Young kids and shy bunnies need careful introductions — let's
  find a quieter home."

These are the same sentences `score()` already emits as `reasons`,
so the educational layer comes free.

## Revenue layer

Tie into `charity.ts` (existing, untapped):

- `good` adoption: full fee + a small bonus to the **Charity Grants**
  pool ("good matches make us trustworthy — donations went up!").
- `ok` adoption: full fee.
- `bad` adoption that returns: half fee refunded, **no** grant bonus.

Suggested fees by species (rough):

| Species | Fee (coins) |
|---|---|
| Cat / Dog | 50 |
| Bunny / Parrot | 35 |
| Snake / Bat / Fox | 20 (rare-species bonus) |
| Hedgehog (rewilding) | 0 (no fee, but generates Wildlife Trust grant) |

## UI — painted-storybook treatment

Reuse the patterns already shipped:

- **Polaroid frame** for the animal portrait (matches the photo-to-wall
  arrival treatment).
- **Sticker chips** for trait lines (matches the name-collision
  suggestions in signup).
- **Painted house cards** for applicants — pull straight from
  `cast/01..32-*.png`, framed in a torn-paper rectangle with a
  hand-lettered name + sticker-style profile.
- **Yellow back-sticker** for the "actually, not yet" exit (matches
  auth-screen nav).
- **Painted coin-drop** sound + sprite on fee award (reuse from
  supply-run reward).

Animation budget:
- Card hover bob (CSS).
- Drag-cursor: animal sprite follows pointer with a slight wobble.
- Drop: card flips to vignette over ~600ms.
- Fee: coin sprites fall onto pile with bounce.

No new art commissions for the office itself in v1 — paint reuse
only. Vignette art for outcomes can stage in v2.

## Apprentice involvement

Lily's apprentices (Rhubarb / Amara / Kofi) deliver the adoption
narration. Pick the apprentice whose specialty fits the species:
Rhubarb for cats + dogs, Amara for bunnies + small mammals, Kofi for
parrots + snakes + exotics. Apprentice sprite stands in the corner
of the office, speech-bubbles the lesson stickers.

## Failure modes / edge cases

- **No eligible applicants** — show a "no families looking for {species}
  this week" sticker. Animal stays. Try again in a few in-game days.
- **All 3 cards are `bad`** — should be impossible by construction
  (good + ok + ok-or-bad). Add an assertion + fall-back regen.
- **Animal returns** — re-enter the corridor as if newly arrived,
  but tagged `previouslyAdopted`. Bond drops by 0.1 from the trauma
  of an unsettled placement. Educational sticker shows on re-entry.
- **Player closes the office mid-drag** — preserve animal state, no
  fee, no household opinion change.

## What's NOT in v1

- **Multi-animal applicants** ("we'd like two siblings adopted
  together") — v2.
- **Specialised programmes** (guide dogs, hearing dogs, rare-breed,
  research, zoos) — v2.
- **Rewilding** — separate mini-game for wild species
  (`future-features-lily.md` §4 second sub-section).
- **Adoption pre-application backlog** — v1 is "applicants appear
  fresh each session". A queue + waiting-list comes later.
- **Charity grant tier-up animations** — `charity.ts` already
  computes grants; v1 just adds to the pool, no new UI.

## Implementation order

1. **Pure logic first** — `adoption.ts` + tests (target ~25 unit
   tests covering all match-rule branches, applicant-picker
   distributions, return-after-bad-match flow).
2. **Roster wiring** — annotate the 32 households in
   `rehoming-cast.md` with `Applicant` profile data. Probably wants
   its own JSON file (`packages/game-logic/data/adopters.json`)
   with the painted-cast row as the source of truth.
3. **Office mockup HTML** — `apps/game/public/admin/adoption.html`
   (renamed from the existing stub). Iframe-overlay pattern. Drag
   + drop with painted polaroids + sticker chips.
4. **Eligibility surfacing** — speech-bubble icon on eligible animals
   in CorridorView, walk-to-office trigger.
5. **Outcome reveal** — vignette art (paint reuse first, commission
   bespoke vignettes only if v1 holds up under play).
6. **Charity tie-in** — wire fees + grant bonus to `charity.ts`.
7. **Return-flow** — animal re-enters with `previouslyAdopted` tag.

## Estimated scope

- Logic + tests: half a day.
- Roster annotation: 1–2 hours of writing per household profile (32
  × ~5min) — could be done in one sitting with Lily naming the
  quirks.
- Office mockup: a day of HTML + CSS for the painted treatment.
- Wiring into the game scene: half a day.
- Vignette art (v1, paint reuse): 0.
- Total to "playable v1 in mockup": ~2–3 dev days.

## Open questions for Marcus + Lily

1. **Trigger pacing** — should every eligible animal pop the
   speech-bubble immediately, or should the corridor drip-feed at
   most one adoption-ready prompt per in-game day? (Lean: drip-feed,
   to avoid choice paralysis.)
2. **Failure penalty** — is "animal comes back, bond -0.1" the right
   weight for a `bad` adoption, or should it be heavier so kids feel
   the consequence? Lighter so the educational sticker carries it?
3. **Apprentice gating** — does the office need an apprentice present
   to operate? (Could tie unlock to recruiting any apprentice.)
4. **Visual hierarchy** — is the office a separate room (door in the
   corridor), a popup, or a full-viewport overlay? (Spec assumes
   overlay; could just as easily be a corridor door + sub-scene.)
5. **Tutorial** — first-time-only painted explanation from Rhubarb,
   or just let kids figure it out? (Lean: short Rhubarb intro on the
   first eligible animal, never again.)
