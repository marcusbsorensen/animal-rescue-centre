# Pre-drive vehicle picker

_2026-07-10. Marcus: build the full picker (matches `admin/pre-drive.html`)._

## Data (already exists — wire, don't reinvent)
- `packages/game-logic/src/crate-stacking.ts` → `VEHICLE_DEFS` (Trikey, Henry,
  Bea, Big Tilly, Spark) with `slots, cols, rows, fuelCost, unlockLevel`, and
  `getAvailableVehicles(level)`.
- `packages/game-logic/src/destinations.ts` → `DESTINATIONS` (label, emoji,
  description, distance, unlockLevel).
- Player level: `PtvDriveInit.level` (already plumbed). Demo default high so all
  vehicles show; real game passes the player's level.

## Flow
`select` (new initial phase) → `parking` (chosen vehicle in the forecourt) →
drive-off transition → `travel`. The picker's "Let's go!" advances select→parking.

## Picker UI (match the mockup, claymation-themed)
- **Where are we going?** card — destination emoji, name, description, distance.
- **Which vehicle?** grid — one card per vehicle: top-down claymation sprite,
  name, `Slots N` · `Fuel N` · `L{n}+` chips; a "Selected!" badge on the choice;
  locked vehicles (`unlockLevel > level`) dimmed with an "Unlocks L{n}" chip and
  not selectable.
- Tap a card to select; "Let's go!" proceeds with the chosen vehicle.

## Vehicle → sprite mapping
`VEHICLE_SPRITE: Record<VehicleType, string>` → top-down claymation keys.
- `small-van` → `vehicle-topdown-henry` (exists).
- `pedal-trike`→`trikey`, `long-van`→`bea`, `animal-lorry`→`big-tilly`,
  `electric-minibus`→`spark` — new claymation sprites. _Update 2026-10-07: all
  four are on disk in `apps/game/public/assets/driving/topdown/` as
  `vehicle-topdown-trikey`, `-bea`, `-big-tilly` and `-spark`, each with a
  `-rear` variant. `makeVan` still falls back to Henry's sprite, then to a drawn
  van, for any key that fails to load._
The chosen vehicle's sprite is used on the road (`makeVan`) and in its card.

## Proportional sizing (2026-07-10)
Fleet vehicles are sized relative to Henry (=1.0) via `VEHICLE_SIZE`: pedal-trike
0.55, Henry 1.0, Bea 1.12, Spark 1.18, Big Tilly 1.3. Applied on the road
(`makeVan`), in the picker cards (biggest fills the slot, others scale down), and
in the forecourt bay. Follow-up: give the A.R.C. forecourt genuinely
different-sized bays (a graduated row) to match — Marcus noted the car park has
different space sizes for exactly this reason.

**Speed differentials:** `VEHICLE_SPEED` multiplies the gear's rate per vehicle,
so the same gear ≠ the same speed — pedal-trike 0.5 (crawls flat-out), Henry 1.0,
Bea 0.95, Big Tilly 0.8 (lumbers), Spark 1.15 (zippy EV). Applied to the drive
loop's `gearRate`.

## Status
- Art for Trikey/Bea/Big Tilly/Spark: **done.** The keyed sprites are in
  `assets/driving/topdown/` (checked 2026-10-07).
- Slots, cols, rows and fuel — **checked 2026-10-07 against `6869c50`.**
  - `slots`, `fuelCost` and `unlockLevel` are printed as text on each card
    (`Slots N    Fuel N    L{n}+`, in `PtvDriveScene.makeVehicleCard`).
  - Nothing deducts the fuel, and nothing limits the animals aboard by slots.
    The drive carries at most one animal (`GameScene.driveTo(destinationId,
    animalId?)`) and no crates.
  - `cols` and `rows` are read by `driving/crate-loading-view.ts`, which lays
    that many bays on the chosen vehicle's painted load bed. _(Was "read by no
    file in `apps/game/src`" when checked on 2026-10-07; the loading screen
    landed after.)_
  - **Grid shapes re-cut 2026-10-09**: Trikey 1×2, Henry 2×2, Bea 2×3,
    Big Tilly 2×4 (**eight slots, down from nine**), Spark 2×3. Nothing in the
    fleet is more than two crates wide now, because every one of them is
    painted two to three times longer than it is wide. Tilly's card prints
    `Slots 8`, which is correct and wants no special handling.
  - `cols` and `rows` are the grid shape a `CrateGrid` carries into the
    crate-stacking engine (`neighbourIndices`, `previewPlacement`). That engine
    is **built and wired** into the loading screen: see
    [`crate-loading-2026-07-10.md`](crate-loading-2026-07-10.md) for what the
    code settles and what is still only a design. (This note first linked a
    `[[project_crate_loading]]` memory note; it is not in the repository or the
    project memory folder.)
- The picker tests the unlock level inline (`v.unlockLevel > this.playerLevel`)
  and does not call `getAvailableVehicles(level)`.
- Destination card currently shows the drive's `destinationId`; aligning the
  drive destinations (birchie-places) with `DESTINATIONS` is a follow-up.
