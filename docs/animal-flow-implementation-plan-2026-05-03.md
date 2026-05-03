# Animal-flow implementation plan

> Marcus 2026-05-03 — building toward the fully functioning multi-exit
> animal flow per [`docs/animal-flow-analysis-2026-05-03.md`](animal-flow-analysis-2026-05-03.md)
> and [`docs/animal-exits.md`](animal-exits.md).
> 
> Goal: turn the centre from a one-way pipe (animals arrive, never
> leave) into a working asset system where every animal has a
> realistic exit and the kid sees throughput at every level.

## Success criteria

- A new player at L1 can sign up, welcome an animal, and **rehome** it
  through a working adoption flow within their first 5 minutes of play
- A returning player at L3+ can rewild a species back to its habitat
- A returning player at L5+ can take an animal as a pet (capped)
- A returning player at L10+ can offer permanent vet care for an
  elderly + sick animal
- The shelter never permanently fills because all 4 exits are working
- `store.rehomed` and `store.rewilded` actually increment when the
  exit fires (today they're declared and never written)
- Adopter households refresh sustainably so the kid doesn't run out
  after 30 successful adoptions

## Architecture overview

```
                    ┌─── ARRIVALS (existing) ─────┐
                    │  GameScene.spawnNewAnimal() │
                    │  + arrival overlay           │
                    └─────────────┬────────────────┘
                                  ↓
                    ┌─── SHELTER (existing) ──────┐
                    │  store.animals[]             │
                    │  bonding, feeding, walks,    │
                    │  vet visits                  │
                    └─────────────┬────────────────┘
                                  ↓
              ┌──────────────────┼──────────────────┐
              ↓                  ↓                  ↓
     ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
     │ EXIT 1         │ │ EXIT 2         │ │ EXIT 3         │
     │ Adoption       │ │ Rewilding      │ │ Player's pet   │
     │ → 32 households│ │ → habitats     │ │ → favourites[] │
     │ → rehomed++    │ │ → rewilded++   │ │ (capped)       │
     └────────────────┘ └────────────────┘ └────────────────┘
              ↓
     ┌────────────────┐
     │ EXIT 4         │
     │ Vet permanent  │
     │ care           │
     │ → vetCare++    │
     └────────────────┘
```

### State extensions needed (`GameStateStore`)

| Field | Type | Why |
|---|---|---|
| `rehomed` | `RehomedEntry[]` | exists in spec; not actually populated. Will be `{animalId, householdId, atMs, animal: AnimalSummary}[]` for the photo wall |
| `rewilded` | `RewildedEntry[]` | exists; same shape — `{animalId, habitatId, atMs, animal}` |
| `playerFavourites` | `Animal[]` | NEW — kid's pet animals, removed from `animals[]` but still in save |
| `petsOnLoan` | `OnLoanEntry[]` | NEW — high-experience pets sent to sister A.R.C. for training. `{petId, sentAtMs, returnAtMs?, sisterArcName}` |
| `permanentVetCare` | `VetCareEntry[]` | NEW — animals living full-time at the vet's |
| `householdAdoptionState` | `Map<HouseholdId, HouseholdAdoptionState>` | NEW — per-household last-adopted-at + capacity for cooldowns + refresh |

### New modules

| Module | Lines | Owns |
|---|---|---|
| `packages/game-logic/src/adoption.ts` | ~250 | `Applicant`, `MatchOutcome`, `score()`, `pickApplicants()`, `commitAdoption()`, household refresh logic |
| `packages/game-logic/src/rewilding.ts` | ~150 | `canRewild()`, `commitRewild()`, habitat-saturation seasonal modifiers |
| `packages/game-logic/src/pets.ts` | ~150 | `getMaxActivePets(level)`, `tryAddFavourite()`, `sendOnLoan()`, `recallFromLoan()` |
| `packages/game-logic/src/vet-care.ts` | ~120 | `isElderly()`, `canOfferVetCare()`, `commitVetCare()`, vet-care charity grant |
| `packages/game-logic/src/animal-exits.ts` | ~80 | thin orchestrator; one function per exit that: removes from `animals[]`, increments counter, fires charm/badge/grant hooks |

### New scenes / iframe pages

| Page | Purpose |
|---|---|
| `apps/game/public/admin/adoption-office.html` | The L1 adoption office — picks 5 hand-curated households, drag-drop animal onto a card, confirm, animation |
| `apps/game/public/admin/rewilding.html` (already exists as mockup) | Wire to live data — pick eligible animal + habitat, drive-overlay handoff, release scene |
| `apps/game/public/admin/pet-cap-warning.html` | Painted "your pet rooms are full — send one to a sister A.R.C. to make space?" prompt |
| `apps/game/public/admin/vet-permanent-care.html` | Painted "settled into the vet's room" emotional beat |
| `apps/game/src/scenes/AdoptionScene.ts` | Hosts the adoption iframe |

## Dependency graph

```
[Phase 1] adoption.ts MVP + adoption-office.html
   ↓
[Phase 2] rewilding.ts + wire existing rewilding.html
   ↓                       ↘
[Phase 3] pets.ts + cap     ↘
   ↓                         ↘
[Phase 4] vet-care.ts        ↘
   ↓                          ↘
[Phase 5] household refresh   →  [Phase 6] full adoption-matching mini-game
                                    ↓
[Phase 7] sibling pairs / returns / behavioural quirks
   ↓
[Phase 8] habitat saturation + seasonal rewilding modifiers
```

Phases 1-4 are the must-ship core. Phases 5-8 are sustainability +
richness layers that the agent's analysis recommends but aren't
blocking the basic playable loop.

## Build order — phased

### Phase 1 — adoption MVP (the L1 unblock) · est. 1.5 days

The most-impactful single fix per the agent. Currently the shelter
fills in 90 seconds at L1 with no exit. This unblocks Lily's testing.

**Code:**
- New `packages/game-logic/src/adoption.ts`:
  ```ts
  export interface Applicant {
    householdId: HouseholdId;
    name: string;
    avatarSrc: string;
    blurb: string;
    speciesPreferences: Species[];
    capacity: number;
  }
  export interface RehomedEntry {
    animalId: string;
    animalName: string;
    species: Species;
    householdId: HouseholdId;
    atMs: number;
  }
  // L1 curtailed roster — 5 hand-picked safe households
  // (per agent: Babcia, Pri, Hiro, Nova, Anjali+Sam)
  export const L1_CURTAILED_HOUSEHOLDS: HouseholdId[] = [
    '01-babcia', '02-pri', '06-hiro', '03-nova', '08-anjali-sam',
  ];
  export function getEligibleApplicants(
    animal: Animal,
    store: GameStateStore,
  ): Applicant[];
  export function commitAdoption(
    animal: Animal,
    householdId: HouseholdId,
    store: GameStateStore,
  ): RehomedEntry;
  ```
- Update `GameStateStore` to populate `rehomed[]` (already declared)
- New `packages/game-logic/src/animal-exits.ts` orchestrator
- New `apps/game/public/admin/adoption-office.html` iframe page (drag-drop or tap-to-pick)
- New `apps/game/src/scenes/AdoptionScene.ts` mounting it
- Wire from `AnimalDetailsPopup.ts` — add "Find them a home" button when
  `bond ≥ 0.6 + health = 'well' + level >= 1`

**Tests:** ~15 unit tests covering the eligibility filter + commit transactions + the rehomed counter.

**Visual:** 5 painted household cards (we already have all 32 cast
portraits in `scene-assets/cast/`). Tap-to-adopt for v1; drag-drop for v2.

**Counts as success when:** Lily can sign up, welcome a cat, bond
with it, tap "find them a home", pick a household card, and see the
cat removed from her shelter list with `rehomed++`.

### Phase 2 — rewilding wired · est. 0.5 day

Existing `rewilding.html` mockup + `destinations.ts` data + drive-overlay
flow already exist. Wire the gap.

**Code:**
- New `packages/game-logic/src/rewilding.ts`:
  ```ts
  export function canRewild(
    animal: Animal,
    store: GameStateStore,
  ): { ok: boolean; reason?: string; suggestedHabitats: DestinationDef[] };
  export function commitRewild(
    animal: Animal,
    habitat: DestinationDef,
    store: GameStateStore,
  ): RewildedEntry;
  ```
- Wire `rewilding.html` to take live animal + habitat data (currently
  hardcoded mockup)
- Add rewild button in `AnimalDetailsPopup` for eligible species at
  unlocked habitat levels

**Tests:** ~10 unit tests — eligibility per species, cap on active
rewildings, counter increment.

**Counts as success when:** kid at L3 can rewild a fox to Moorland
via the existing drive-overlay, fox is removed, `rewilded++`, charm
unlock fires.

### Phase 3 — pet + cap + on-loan · est. 1 day

Per agent: hard cap of 3 (4 at L10) + Marcus's on-loan-to-sister-A.R.C.
mechanic for overflow.

**Code:**
- New `packages/game-logic/src/pets.ts`:
  ```ts
  export function getMaxActivePets(level: number): number;
  // L1-9: 3, L10+: 4
  export function tryAddFavourite(
    animal: Animal,
    store: GameStateStore,
  ): { ok: boolean; needsLoan?: boolean; reason?: string };
  export function sendOnLoan(
    petId: string,
    sisterArcName: string,
    store: GameStateStore,
  ): OnLoanEntry;
  export function recallFromLoan(petId: string, store: GameStateStore): void;
  ```
- New iframe `pet-cap-warning.html` — painted "your pet rooms are
  full" prompt + sister A.R.C. picker
- Wire from `AnimalDetailsPopup` — "Make my pet" button when bond ≥ 0.9
- 3 sister A.R.C.s as named places: e.g. "Beachside Animal Sanctuary",
  "Reculver Wildlife Trust", "Margate Pet Refuge". Each can host up to
  N pets-on-loan with painted thank-you postcards arriving back in the
  mail every few in-game weeks.

**Tests:** ~12 tests — cap by level, on-loan transition, recall.

**Counts as success when:** kid at L5 with bond ≥ 0.9 cat can tap
"Make my pet" → cat moves to favourites; with 3 pets already, taps
again → painted "send Pickle to Reculver Wildlife Trust to make
space" prompt fires + works.

### Phase 4 — vet permanent care · est. 1 day

Per [`docs/animal-exits.md`](animal-exits.md). The 4th exit, gated
to old + chronically sick + low-bond animals.

**Code:**
- Add `Animal.chronicIllness?: boolean` and `Animal.elderly?: boolean`
  fields (or computed on the fly from `ageDays + species`)
- New `packages/game-logic/src/vet-care.ts`:
  ```ts
  export function isElderly(species: Species, ageDays: number): boolean;
  export function canOfferVetCare(
    animal: Animal,
    store: GameStateStore,
  ): { ok: boolean; reason?: string };
  export function commitVetCare(
    animal: Animal,
    store: GameStateStore,
  ): VetCareEntry;
  ```
- New iframe `vet-permanent-care.html` — painted "settled into vet's
  room" emotional beat (sun on window, soft bed, gentle music)
- Wire from existing `vet.html` — add "Stay here for full-time care"
  option alongside "treat" and "discharge" when conditions met
- Add "Compassionate Carer" charm to charms.ts, unlocked on first
  vet-care decision
- Add 4th charity grant: "Senior Animal Care Foundation" — qualifies
  if `permanentVetCare.length >= 3`

**Manus task:** 1 painted scene of the vet's full-time-care room
(~80 credits) + a memorial polaroid template (~50 credits)

**Counts as success when:** kid at L4 with an elderly + sick + low-
bond animal sees the new "Stay here for full-time care" option in
the vet popup; tap → painted scene + memorial polaroid added to wall.

### Phase 5 — household refresh + cooldowns · est. 1 day

Per agent: layered cooldowns (14-30 days), one new family per quiet
level (doubles as L4/L6/L8 content fix), failed-adoption returns,
3 institutional households as perpetually-open safety valves.

**Code:**
- Add `householdAdoptionState: Map<HouseholdId, { lastAdoptedAtMs?: number; capacity: number; petsAtHousehold: string[] }>` to store
- Update `getEligibleApplicants()` from Phase 1 to filter by cooldown
  + capacity remaining
- Three new cast households marked as "institutional":
  - **Sunnybrook Sanctuary** (always open, bonded-pair specialists)
  - **Oak Lodge Senior Care** (always open, takes elderly animals
    that aren't sick enough for permanent vet care)
  - **Mrs Popescu's Year 3 Class** (opens at L5, takes well-bonded
    classroom-friendly cats/bunnies for short-stay programmes)
- New cast household + adopter unlock at every "quiet" level (L4, L6,
  L8 + L11+) — ramps the adopter pool with the kid's progression
- Failed-adoption returns: low-quality matches return after a week
  with `previouslyAdopted` flag and -0.1 bond penalty (per agent)

**Tests:** ~15 tests — cooldown windows, capacity caps, institutional
always-open, return-after-bad-match flow.

### Phase 6 — full adoption-matching mini-game · est. 2 days

Replace the curtailed L1 office with the full design from
[`docs/adoption-matching.md`](adoption-matching.md):

- 3 applicant cards (good + ok + ok-or-bad) per the adoption pick
- Drag-and-drop matching
- Score-based outcomes (good/ok/bad)
- Vignette reveals
- Educational sticker on bad outcomes
- Charity tie-in (good adoption → grant bonus)
- Apprentice voice-over narration (only if recruited)

This is the polished version of Phase 1 — Phase 1 ships first as
the unblock, then this layers on as quality. Starts gating at L4+
(per the matching design doc) once the kid has had time to bond with
multiple animals.

### Phase 7 — special-case animals · est. 1.5 days

Per agent's recommendation order:
1. **Sibling pairs** (already exist in spawn logic — wire the
   "must-rehome-together" rule into adoption commit)
2. **Returns** (animals coming back from a failed adoption — already
   designed in Phase 5; surface in arrival queue with `previouslyAdopted`
   tag + lower starting bond)
3. **Pregnant animals** — temporary cap-burst when kittens/pups arrive
4. **Behavioural-issue animals** — only specialist households accept
5. **Bonded cross-species pairs** — must-adopt-together rule across
   species

### Phase 8 — habitat saturation + seasonal rewilding · est. 0.5 day

Per agent: keep habitats infinite but add a **seasonal modifier** —
out-of-season releases get half XP and a gentle apprentice line about
it being "a tough time of year for them." Reads from the existing
`store.calendar.currentSeason`.

## Cross-cutting work

These touch every phase:

- **State migration** — adding new fields to `GameStateStore` requires
  a `loadSaveState` migration that defaults missing fields. Already
  has a migration pattern (see `loadSaveState.ts`).
- **Save-state persistence** — Supabase `game_states.state` JSON
  column already stores arbitrary state shape; just expand.
- **Photo-wall integration** — every exit deposits a polaroid:
  - Adoption: "{Name} found a forever home with the {Surname}s"
  - Rewilding: "{Name} returned to the {Habitat}"
  - Pet: "{Name} is staying with us forever"
  - On-loan: "{Name} is helping out at {Sister A.R.C.}"
  - Vet care: "{Name} is being looked after at the vets"
- **Charm + badge unlocks** — each exit type has charm-event triggers
  that already exist in `charms.ts`. Phase work just fires the events.
- **Audio** — each exit has a small SFX cue. All the species sounds +
  voice clips already exist in the audio pack.

## Risk register

| Risk | Mitigation |
|---|---|
| Phase 1 adoption office could over-spec; v1 should be a tap-to-confirm not full drag-drop | Start with tap-to-confirm. Drag-drop in Phase 6. |
| Cap of 3 pets feels punishing for kids who fall in love with everything | On-loan mechanic with painted postcard returns softens it; pets-on-loan still "belong" to the kid emotionally |
| Vet permanent care could read as euthanasia despite framing | Visual is sun-on-window + soft bed + memorial polaroid; copy never mentions death; if testing flags it as upsetting we can rename ("permanent guests at the vet's") |
| Household refresh could feel like a Netflix carousel — adopters disappear arbitrarily | Cooldown messaging: "the {Surnames} just adopted! They'll be back in 2 weeks for another visit." Painted notification on photo wall. |
| Counters update logic could double-count or miss-count | All exits go through `animal-exits.ts` orchestrator; impossible to bypass; ~10 tests per exit covering edge cases |

## Estimate summary

| Phase | Est. | Cumulative | Key deliverable |
|---|---|---|---|
| 1 | 1.5d | 1.5d | adoption MVP — Lily can rehome animals |
| 2 | 0.5d | 2.0d | rewilding wired live |
| 3 | 1.0d | 3.0d | pet cap + on-loan |
| 4 | 1.0d | 4.0d | vet permanent care |
| 5 | 1.0d | 5.0d | household refresh + safety valves |
| 6 | 2.0d | 7.0d | adoption-matching mini-game (polished) |
| 7 | 1.5d | 8.5d | special-case animals |
| 8 | 0.5d | 9.0d | seasonal rewilding modifier |

**Phases 1-4 = 4 days = the playable multi-exit loop.** That's
the priority for unblocking Lily.

**Phases 5-8 = 5 more days** = sustainability + richness for long-term
play.

## Recommended start order

1. **Phase 1 first** — single biggest unblock. Ship the adoption MVP
   today/tomorrow.
2. **Phase 2 next** — half a day, opens up rewilding which Lily
   already has art for.
3. **Phase 3** — pet cap is critical to prevent the infinite-pet
   problem the agent flagged.
4. **Phase 4** — vet care can wait a few days; ship after the first
   3 are stable.
5. **Phases 5-8** — schedule across the next sprint based on
   playtesting feedback.

## Phase 1 ready-to-go ticket

If you want to kick off NOW, here's the first task spec (small enough
to one-shot):

> **Task 1.1 — `adoption.ts` module + tests (TDD)**
>
> File: `packages/game-logic/src/adoption.ts`
> Test: `packages/game-logic/src/__tests__/adoption.test.ts`
>
> Implements:
> - `Applicant`, `RehomedEntry` types
> - `L1_CURTAILED_HOUSEHOLDS` constant array (5 IDs, picked with Marcus)
> - `getEligibleApplicants(animal, store)` — filters by species
>   preference + capacity + cooldown
> - `commitAdoption(animal, householdId, store)` — atomic: removes
>   from `store.animals`, pushes to `store.rehomed`, returns
>   `RehomedEntry`
>
> Tests cover:
> - L1 returns curtailed list
> - Filter respects species preference
> - Filter respects capacity
> - Filter respects cooldown
> - Commit removes animal + increments counter
> - Commit is idempotent within same animal
> - Commit fires the rehoming charity grant qualifier
>
> ~250 lines + ~150 lines tests. Half a day.

## Open decisions Marcus needs to make before starting

1. **L1 curtailed-roster confirmation** — agent suggested Babcia, Pri,
   Hiro, Nova, Anjali+Sam. Cross-check against `docs/rehoming-cast.md`
   to confirm these are the right 5 starter households.
2. **Pet cap value at L1-L9** — agent recommended 3. Sound right or
   too tight?
3. **Sister A.R.C. names** — 3 painted "other rescue centres" for
   the on-loan pet system. Suggested: "Beachside Animal Sanctuary",
   "Reculver Wildlife Trust", "Margate Pet Refuge". Other names?
4. **Institutional household names** — Sunnybrook Sanctuary, Oak
   Lodge Senior Care, Mrs Popescu's Year 3 Class. Approve?
5. **Vet-care painted scene** — commission Manus or composite from
   existing vet assets?
6. **Household refresh cooldown duration** — agent suggested 14-30
   days. Pick a value (suggest: 21 in-game days = 3 in-game months).
