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
  `electric-minibus`→`spark` — NEW claymation sprites (generating now). Until they
  land, missing keys fall back to Henry's sprite (soft-fail in `makeVan`).
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
- Art for Trikey/Bea/Big Tilly/Spark: generating (subagent) → keyed sprites into
  `assets/driving/topdown/` when ready.
- Then: capacity/fuel only cosmetic in the drive for now; slots/cols/rows feed the
  future crate-loading game ([[project_crate_loading]]).
- Destination card currently shows the drive's `destinationId`; aligning the
  drive destinations (birchie-places) with `DESTINATIONS` is a follow-up.
