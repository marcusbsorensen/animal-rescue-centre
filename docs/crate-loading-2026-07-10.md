# Crate loading — stack the ARC van (animal compatibility)

_2026-07-10. Marcus's idea, captured for later. Updated 2026-10-07 to record what the code now settles. The original design text is kept; each part carries its state._

> **Status, checked 2026-10-07 against commit `6869c50`** (the statements below describe that commit, not any later working-tree change). The first version of this note said "not yet built". Two things are true now:
>
> - **The rules engine is built and tested.** `packages/game-logic/src/crate-stacking.ts` holds the compatibility matrix, the crate types, the five vehicle grids, adjacency, placement preview, the drive gate and the arrival-happiness calculation. `packages/game-logic/src/__tests__/crate-stacking.test.ts` has 32 test cases; all 32 passed on 2026-10-07.
> - **The loading screen is designed and unbuilt.** No file in `apps/game/src` calls a crate-stacking function. The one use of the module in the app is `PtvDriveScene` importing `VEHICLE_DEFS` to draw the vehicle picker.
>
> Labels used below: **built, not wired** = code and tests exist and no game code calls it. **Designed, not built** = written down here only. **Decided in code** = a question the code already answers; no separate written decision from Marcus was found. **Decided against** = the engine's design excludes it.

## Where each part stands

| Part | State | Where to look |
|---|---|---|
| Compatibility matrix, 8 species, symmetric, species-based | Built, not wired | `crate-stacking.ts`: `MATRIX`, `getCompatibility` |
| Six crate types and the species each suits | Built, not wired | `CRATE_DEFS`, `getPreferredCrates`, `isCrateSuitable` |
| Vehicle capacity as a grid (five vehicles) | Built. The picker card prints slots and fuel | `VEHICLE_DEFS`; `PtvDriveScene.makeVehicleCard` prints `Slots N` |
| Adjacency, placement preview, drive gate, stressed count | Built, not wired | `neighbourIndices`, `previewPlacement`, `isDriveable`, `countStressedAdjacencies` |
| Arrival happiness | Built, not wired | `calculateArrivalHappinessDelta` |
| Staging shelf, drag-and-drop, loading view, crate sprites | Designed, not built | No scene exists; no file with `crate` in its name under `apps/game/public/assets` |
| Handing a loaded grid to the drive | Designed, not built | `GameScene.driveTo(destinationId, animalId?)` passes one optional animal id and no grid; `PtvDriveScene` phases are `select`, `parking`, `travel`, `arrival` |

The engine's scoring, for reference: +3 for a suitable crate, −10 for an unsuitable one; for each N/S/E/W neighbour, −15 blocked, −5 stressed, +1 same species. The full tables are in [`ptv-pet-transport-vehicle.md`](ptv-pet-transport-vehicle.md).

## Concept

Before a vet run, the player **loads animal crates into the ARC vehicle** through
its open loading door(s), stacking them into the cargo bay — while paying
attention to **which animals can safely be next to one another**. A packing
puzzle that feeds the driving mini-game (load up → drive to the vet).

_State: designed, not built. The rules for "which animals can be next to one another" are built, not wired._

## Core loop

1. A set of animals **need the vet** (surfaced from the rescue roster / a
   needs-vet flag).
   _Designed, not built. `GameScene.driveTo` takes a destination and at most one animal id._
2. The player sees the chosen vehicle from a **loading angle** (side or rear ¾,
   **door(s) open**), showing the cargo bay as a grid of crate slots.
   _Designed, not built. No loading-view art exists. The grid shapes exist as data in `VEHICLE_DEFS`._
3. **Drag each animal's crate** from a staging shelf into a bay slot, stacking
   them to fit.
   _Designed, not built. `crate-stacking.ts` has no place, remove or swap function and no model of a staging shelf. A caller edits `CrateGrid.crates` itself and calls `previewPlacement` first._
4. **Compatibility rules** constrain placement — some animals can't be adjacent.
   A bad placement is refused gently (a wobble + "they wouldn't like that"),
   never a punishing fail: consistent with the no-harm-to-animals ethos in the
   driving game.
   _Rules built, not wired. Two docs describe the refusal differently. This note refuses at placement. `ptv-pet-transport-vehicle.md` lets the player place anything, shows ⚠ / 🚫 between neighbours, and disables the Drive button while any pair is blocked. The engine supports both: `previewPlacement` returns `'blocked'` for a placement the screen could refuse, and `isDriveable` returns false for a grid the screen should not let depart. Which one the loading screen uses is open._
5. Once everything's loaded safely, the van is ready → hand off to the drive to
   the vet (the `vet` destination, "Bay Road Vets").
   _Designed, not built. This note first named `pinebark-medical` as the vet. In `packages/game-logic/src/destinations.ts` the vet is `id: 'vet'` (`kind: 'vet-general'`, `arrival: 'vet'`); `pinebark-medical` is a supply-run stop (`kind: 'supply-run'`, `arrival: 'supply'`)._

## Mechanics — the original list, with what the code does

- **Compatibility matrix** — _built, not wired._ Pure, data-driven and unit-tested, as asked (`MATRIX`, `getCompatibility`). It is species-based and symmetric: it answers "do a cat and a bunny mix", and takes no individual animal. The axes in the original list:
  - Predator/prey — _built._ Blocked pairs include cat–bunny, dog–bunny, fox–bunny, cat–parrot and snake with every species except bat and snake. Dog–cat is `stressed`, not blocked. The roster has no mouse.
  - Size / crush — _not in the engine._ Neither crates nor animals have a size or weight.
  - Temperament — _not in the engine._ Nothing per-animal is read: `calculateArrivalHappinessDelta` accepts `animalsById` and discards it (`void animalsById`).
  - "Must travel alone" species — _not in the engine._ No species is flagged to travel alone.
- **Adjacency** — _built._ N/S/E/W neighbours in the grid (`neighbourIndices`). Diagonals are excluded on purpose and a test covers it. "Plus stacked above/below" is _decided against_: the grid has two dimensions only.
- **Stacking** — _decided against._ The grid is flat, a crate can occupy any empty cell and there is no support rule, so crates do not settle or rest on one another. The `[[feedback_ux_principles]]` note this cited is not in the repository or in the project memory folder, so the "gravity-aware placement" principle is unverified here.
- **Capacity per vehicle** — _built as data, not enforced._ `VEHICLE_DEFS`: Trikey 2 slots (1×2), Henry 4 (2×2), Bea 6 (2×3), Big Tilly 8 (2×4), Spark 6 (2×3); `slots` equals `cols × rows` for all five. _Re-cut 2026-10-09:_ the three-across grids turned to two columns to match beds that are all two to three times longer than they are wide, and Big Tilly dropped from nine slots to eight. The engine does not check that a slot index is in range, that a slot is empty, or that `CrateGrid.cols` and `rows` match the vehicle. The caller does.
- **Difficulty by level** — _partly built._ The only level rule is the vehicle `unlockLevel` (0, 2, 5, 10, 12); `getAvailableVehicles(level)` filters on it, and the picker applies the same test inline (`v.unlockLevel > this.playerLevel`). Fewer animals or looser rules at low levels are _designed, not built_.
- **Drag-drop UI** — _designed, not built._ `apps/game/public/admin/pre-drive.html` is a mockup with a cargo grid. Nothing mounts it (it has no entry in `InGameOverlay.ts`).

## Art needed (claymation, OpenAI pipeline — [[feedback_openai_only_sprites]])

- A per-vehicle **loading view**: side or rear ¾ with the loading door(s) open,
  showing the cargo bay/shelves. New art, distinct from the top-down driving
  sprites. _Designed, not built._
- **Crate sprites** with the animal visible/peeking, per animal in the roster. _Designed, not built._

Top-down sprites for all five fleet vehicles exist in `apps/game/public/assets/driving/topdown/`; they are driving sprites, not loading views.

## Connections

- Feeds the **driving mini-game**: load → drive to the vet (`vet`). _The drive exists (`PtvDriveScene`, launched from the map by `GameScene.driveTo`); the load step before it does not._
- Uses the existing **animal roster** and the claymation **vehicle fleet**. _The roster is the eight species in `Species` (`packages/shared-types/src/index.ts`); the fleet is the five entries in `VEHICLE_DEFS`._
- "Animals that need the vet" needs a **source list** (rescue intake / a
  needs-vet flag on animals). _Unverified in this pass whether such a flag exists. `GameScene.driveTo` receives one animal id from its caller._

## Open questions — how each stands (2026-10-07)

1. **Grid/shelf model vs true gravity stacking with weight?** _Decided in code: grid._ `CrateGrid` is a flat `cols × rows` array of slots, adjacency is N/S/E/W, and no weight, support or third dimension exists. The comment above `neighbourIndices` gives the reason as matching "side-by-side in crates" reality. Gravity stacking with weight would be a new design.
2. **Puzzle (find any valid arrangement) or real-time/timed?** _Open._ The engine functions have no clock and no turn state, so either style can use them. The loading flow in `ptv-pet-transport-vehicle.md` describes a drag-and-place flow and mentions no timer.
3. **How are the rules taught to an 8-year-old?** _Open; designed, not built._ `previewPlacement` returns one of three levels, `'happy' | 'stressed' | 'blocked'`, which maps onto the ✓ / ⚠ / 🚫 icons in the PTV doc. The `pre-drive.html` mockup draws ✓ and ! badges at fixed example cells; nothing computes them.
4. **The actual animal set and the compatibility matrix.** _Decided in code._ The set is the eight species in `Species`: cat, dog, fox, bunny, bat, parrot, snake, hedgehog. The matrix is `MATRIX` (8 × 8). It works from species alone, so it needs no individual animals. Hedgehog joined on 2026-07-04 (commit `d3fbc4a`). Per-animal data exists elsewhere (`Animal.siblingId`; `AnimalRelationship` with `sibling`, `friend`, `enemy` and `intolerant`, in `shared-types` and `relationships.ts`) and the engine does not read it.
5. **Loading-view art: side vs rear vs ¾; one per vehicle, or a shared bay?** _Open._ `vehicle-front-rear-2026-07-10.md` asks for side and rear elevation views for "the future crate-loading loading-door view". `vehicle-view-system-2026-07-10.md` then corrected the view plan to flat top-down only. Whether the elevation request still stands is unverified.
6. **Does vehicle choice matter (capacity trade-offs across the fleet)?** _Decided as data; not yet as play._ The five vehicles differ in slots, grid, fuel cost and unlock level. In the game today the choice changes the sprite, the on-screen size and the speed (`VEHICLE_SIZE`, `VEHICLE_SPEED` in `PtvDriveScene.ts`). Slots and fuel are printed on the card, and nothing enforces either.
