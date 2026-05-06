# A.R.C. — level progression overview

> Pulled live from the codebase 2026-05-03. **Use this as the single
> source of truth when reviewing pacing or designing new unlocks.**
> If a system below is missing a level gate, that probably means it
> ships unlocked from L1 — sometimes intentional, sometimes a gap to
> close.

## Levelling rule

Level N requires **5 × N total rescues** to advance.

| Level | Rescues to reach next | Cumulative |
|---|---|---|
| 1 → 2 | 5 | 5 |
| 2 → 3 | 10 | 15 |
| 3 → 4 | 15 | 30 |
| 4 → 5 | 20 | 50 |
| 5 → 6 | 25 | 75 |
| 6 → 7 | 30 | 105 |
| 7 → 8 | 35 | 140 |
| 8 → 9 | 40 | 180 |
| 9 → 10 | 45 | 225 |

Source: `getRequiredRescuesForLevel` in `packages/game-logic/src/progression.ts`.

## Master unlock table

Everything that's level-gated, side-by-side. Read down the column for what a player has access to at that level. **★ = newly unlocked at that level.**

| System | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10+ |
|---|---|---|---|---|---|---|---|---|---|---|
| **Animal species** | cat, dog | ★ fox, bunny | ★ bat, parrot | ★ snake | (all 7) | (all 7) | (all 7) | (all 7) | (all 7) | (all 7) |
| **Max shelter capacity** | 2 | 4 | 6 | 8 | 10 | 12 (cap) | 12 | 12 | 12 | 12 |
| **Max arrivals queue** | 1 | 1 | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 3 |
| **Tasks per phase budget** | 12 | 12 | ★ 10 | 10 | 10 | ★ 8 | 8 | 8 | ★ 6 | 6 |
| **Apprentice system** | locked | ★ unlocked | available | available | available | available | available | available | available | available |
| **PTV destinations** | A.R.C., Bramble Farm | (same) | ★ Moorland, Woodland | (same) | ★ Cove Harbour | (same) | ★ Sea Cliffs | ★ Deep Forest | ★ Wetlands | ★ Pinebark Medical |
| **Supply Run depots** | Bramble Farm | (same) | (same) | (same) | ★ Cove Harbour | (same) | (same) | (same) | (same) | ★ Pinebark Medical |
| **Charity grant: Wildlife Trust** | — | — | — | — | — | — | — | — | — | ★ qualifies (£40 if 5+ rewildings) |
| **Tunnel mini-game** | ★ tier 1 (fox only) | tier 1 | tier 1 | ★ tier 2 (hedgehog only) | tier 2 | ★ tier 3 (raccoon only) | tier 3 | ★ tier 4 (skunk only) | tier 4 | ★ tier 5 (all 4 animals side-by-side) |

## Per-system detail

### Species unlock schedule

```
L1: cat, dog                              (the starting two — domestic)
L2: + fox, bunny                          (wild + small mammal)
L3: + bat, parrot                         (flying)
L4: + snake                               (reptile)
L5+: all 7 species available
```

Apprentice **Kofi** (recruitable from L2+) provides an "early peek" at the next species in the unlock order — adds parrot at L2 if recruited (otherwise parrot waits until L3), adds snake at L3 if recruited (otherwise snake waits until L4).

Source: `getSpeciesUnlocksForLevel` in `progression.ts`.

### Shelter capacity

`getMaxShelterAnimals(level)` = `min(2 × level, 12)`. So:
- L1 → 2 animals
- L2 → 4
- L3 → 6
- L4 → 8
- L5 → 10
- L6+ → 12 (hard cap)

Apprentice **Amara** adds `extraCatSlots` on top of the base for cats only — recruited Amara at L4 means 9 cats capacity instead of 8 (other species still at base).

### PTV destinations (drive-overlay world map)

| Destination | id | Unlocks at | Map position | Real-world inspiration |
|---|---|---|---|---|
| A.R.C. | `arc` | L0 | Centre of map | Marcus's house in Birchington |
| Bramble Farm | `bramble-farm` | L0 | NW | Goose End Farm |
| Moorland | `moorland` | L3 | NE | Wyx Park (rewilding habitat — fox) |
| Woodland | `woodland` | L3 | E | Wyx Park (rewilding — bunny, hedgehog, squirrel) |
| Cove Harbour | `cove-harbour` | L5 | SW | Margate harbour (fish supply) |
| Sea Cliffs | `sea-cliffs` | L7 | E coast | (rewilding — parrot, seabird) |
| Deep Forest | `deep-forest` | L8 | NE far | (rewilding — bat) |
| Wetlands | `wetlands` | L9 | S | (rewilding — snake) |
| Pinebark Medical | `pinebark-medical` | L10 | NW far | Specialist vet supply |

Source: `DESTINATIONS` array in `destinations.ts`.

### Supply Run depots

Same set, narrower scope (just supply collection, not rewilding):

| Depot | Unlocks at | What you collect |
|---|---|---|
| Bramble Farm Supplies | L0 | Hay, straw, feed, bedding |
| Cove Harbour Fish Market | L5 | Fresh fish (cats, foxes, bats) |
| Pinebark Medical Wholesale | L10 | Bandages, medicines, equipment |

Source: `SUPPLY_RUNS` in `supply-runs.ts`.

### Apprentice recruitment

- **Minimum level: L2** (`APPRENTICE_MIN_LEVEL = 2` in `apprentices.ts`).
- Eligible apprentices: **Rhubarb** (cat/dog focus, household 30), **Amara** (cat focus, household 13), **Kofi** (parrot/snake/exotic focus, household 14).
- Each must have been encountered as an adopter household before they're recruitable (via `RECRUITABLE_HOUSEHOLDS` set).
- Recruitment unlocks an `apprenticeUnlocks` bag with the apprentice-specific bonus (`extraCatSlots` for Amara, `extraSpeciesSlots` for Kofi, etc.).

### Tasks-per-phase budget (pacing softener)

`baseTasksPerPhase(level)` — how much work fills a single morning/afternoon/evening/night phase. Drops as the kid levels up so the rhythm doesn't get repetitive:

```
L1-2:  12 tasks per phase
L3-5:  10 tasks
L6-8:  8 tasks
L9+:   6 tasks
```

### Charity grants (passive income)

The Wildlife Trust grant qualifies at **L10 if the player has done ≥5 rewildings** (`charity.ts`). No other charities have level gates currently — they qualify on activity alone (donations from happy adopters, etc.).

### Tunnel mini-game (5-tier pipe-rotation puzzle)

A pipe-rotation puzzle where the kid rebuilds the underground
tunnel network so animals can be let out to play. Tiers 1–4 are
each a SINGLE-animal puzzle that gradually introduces new path
shapes; tier 5 is the multi-animal coordination tier where all
four trunks are placed side-by-side at simpler topologies.

| Tier | Levels | Animal | Templates |
|---|---|---|---|
| **1** | L1–3 | fox | straight, z-east, z-west, approach-north (4) |
| **2** | L4–5 | hedgehog | straight, z-east, approach-north, over-the-top (4) |
| **3** | L6–7 | raccoon | straight, z-west, approach-north (3) |
| **4** | L8–9 | skunk | straight, z-west (2) |
| **5** | L10+ | fox + hedgehog + raccoon + skunk | all four trunks side-by-side at simpler topologies |

`openTunnelOverlay` in `GameScene.ts` picks the tier from the
player's current level (L1–3 → 1, L4–5 → 2, L6–7 → 3, L8–9 → 4,
L10+ → 5) and passes it via `?tier=N` to the iframe, whose
`urlTier` parser routes to the matching `generateTierN` function.

Layout MIRRORS the aboveground site geometry — each animal's
trunk runs UP from the building's tunnel-mouth at the south end,
turning west/east at the top to its pen. Single-animal tiers
re-use one trunk slot with template variation; tier 5 lights up
all four trunks at once.

Each successful run = animals let out to play (feeds the existing
happiness/bond loop). Failed routes = "fox got lost — try again?"
gentle retry, no destructive consequence.

Daily randomisation: tile rotations re-roll at dawn, persist all
day. Kid override via "Re-dig tunnels" button gives a small
centre-infrastructure reward (+10 coins currently).

Design specs:
- `docs/garden-tunnel-minigame-2026-05-03.md` — full design doc
- `docs/garden-tunnel-tile-inventory-2026-05-03.md` — tile inventory + level pack stress-test

Source files:
- `packages/game-logic/src/tunnel.ts` — pure logic (TDD'd)
- `apps/game/public/admin/tunnel.html` — painted iframe page
- `apps/game/src/scenes/TunnelScene.ts` + `GameScene.openTunnelOverlay()` — scene wiring

Implementation status (2026-05-06):
- All 5 tier generators are LIVE in `tunnel.ts` and the iframe
  mirror. Test the layout via URL param: `?tier=1` … `?tier=5`.
- Tiers 1–4 are single-animal: each picks one of its templates per
  daily seed and renders just that animal's trunk + decoy padding
  (so the puzzle reads as a real puzzle, not a single line).
- Tier 5 places all four trunks side-by-side at simpler topologies
  for the multi-animal coordination beat.
- The animation pipeline (`runAnimalAnimations` in `tunnel.html`)
  iterates `puzzle.animals` sequentially in tiers 1–4 (one animal)
  and across all four in tier 5. Future: parallel firing + collision
  detection for the rush-hour feel.

### Charm system (PTV mirror customisation)

Charms have NO level gate — they unlock on event triggers (first vet run, first hedgehog brake, first cat adoption, etc.) which are themselves level-gated indirectly via species unlocks. Three charm-counts have specific thresholds:

- **Silver Horseshoe** — 10 drives without a comfort drop
- **Reflective Safety Star** — 5 clean hedgehog brakes
- **Golden Driving Medal** — 100 total drives

Source: `CHARMS` in `charms.ts`.

## Pacing assessment — gaps + risks

### Reading the table

- **L1 (start)**: small + safe. 2 cats/dogs max, 1 arrival queue, cat/dog only, A.R.C. + Bramble Farm only. Apprentice locked.
- **L2 (first big jump)**: apprentice system unlocks + foxes + bunnies. Big "look how much more I can do" moment. **Healthy pacing.**
- **L3**: bats + parrots + first rewilding destinations. Another solid step.
- **L4**: snakes — but no other unlocks. **Quiet level**, mostly capacity growth (8 animals).
- **L5**: Cove Harbour (fish supply). Single unlock. **Quiet.**
- **L6**: just shelter cap to 12 + tasks-per-phase drop to 8. **No new content.** ⚠ Risk: kid feels the level-up is empty.
- **L7**: Sea Cliffs. Single unlock.
- **L8**: Deep Forest. Single unlock.
- **L9**: Wetlands + tasks-per-phase drop to 6. **Quiet content-wise** but the snake-rewilding is new.
- **L10**: Pinebark Medical + Charity grant qualifier. **Climactic** — this is the "long-term player" milestone.

### Recommended additions to make L4–L9 more exciting

These are gaps to consider when designing the next pass:

1. **L4** — give snakes their own thing (a special habitat unlock? new vet feature?)
2. **L6** — currently empty. Suggested unlock: a second adopter zone (Eastfield Road retail cluster?), or a new vehicle (Bea? Trikey?)
3. **L7** — bundle Sea Cliffs with a new gameplay mechanic (e.g. "rewilding ceremony" cinematic on first sea-cliff release)
4. **L8-9** — sparse. Could host the **adoption-matching mini-game** unlock (currently spec'd but no level gate).
5. **L10+** — what's beyond? Currently the table ends. Suggested:
   - L11+: Lily's "future mammals" (hedgehog, squirrel, skunk, raccoon — per `docs/future-features-lily.md`)
   - L12+: lizards (separate from snakes — predator/prey)
   - L15+: pet-show events at Wyx Park (per `docs/ptv-pet-transport-vehicle.md`)
   - L20+: charity board / rescue centre branding / shop merch?

### Other systems with no level gate

These are unlocked from L1 — confirm intentional or flag for level gating:

- **Garden lawn + quiet garden** — kid has both gardens immediately. Could gate quiet garden behind L2 to give a "your centre is growing" beat.
- **Conflict mechanic** — fires whenever incompatibility is detected, regardless of level. Could disable or simplify at L1 to ease in.
- **Decorations + toys** — placeable from L1.
- **Walk system** — walks available from L1.
- **Vet system** — sick animals can arrive from L1.
- **Adoption mechanic** — currently spec'd in `docs/adoption-matching.md` but no level gate. Suggested: L4+ when the kid has had time to bond with a few animals first.

## Source files

| Concern | File |
|---|---|
| Levelling formula | `packages/game-logic/src/progression.ts` |
| Species unlocks | `packages/game-logic/src/progression.ts` |
| Shelter capacity | `packages/game-logic/src/progression.ts` |
| PTV destinations | `packages/game-logic/src/destinations.ts` |
| Supply runs | `packages/game-logic/src/supply-runs.ts` |
| Apprentice gating | `packages/game-logic/src/apprentices.ts` |
| Tasks/phase | `packages/game-logic/src/time.ts` |
| Charity grants | `packages/game-logic/src/charity.ts` |
| Charms (event-gated) | `packages/game-logic/src/charms.ts` |
