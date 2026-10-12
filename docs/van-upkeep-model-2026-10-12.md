# Van upkeep — the model, 2026-10-12

Fuel, charging, wear and dirt on A.R.C.'s rescue vans, built from Marcus's
decisions 22–28 (`docs/fuel-workshop-carwash-2026-10-12.md`, "Decided"). This
is the pure game-logic layer only: no scene, art or UI calls it yet.

- Code: `packages/game-logic/src/van-upkeep.ts` (exported from `index.ts`)
- Tests: `packages/game-logic/src/__tests__/van-upkeep.test.ts` (67)
- Also changed: `supply-runs.ts` repair part codes (24A), `merge-save.ts`
  (a `vanUpkeep` merge rule)

## What it does

Each vehicle has one small, serialisable upkeep record:

| Field | Range | Meaning |
|---|---|---|
| `energy` | 0–1 | Fuel in the tank, or charge in Spark's battery. Trikey stays at 1 |
| `wear` | 0–1 | Wear from distance and rough driving; the spanner light comes on at 0.6 |
| `dirtOutside` | 0–1 | Mud, salt and grime. Washed off at a station |
| `dirtInside` | 0–1 | Fur, mess and scattered bedding. Kept separate; **how it is cleaned is not decided** |
| `lowWarned` | bool | The quarter-tank warning has fired since the last fill |
| `puncture` | bool | Trikey has a flat |
| `supplyDamage` | 0–100 | Supply-run damage waiting for the workshop, on `DAMAGE_THRESHOLDS`' scale |

**A drive updates it** from what happened on the drive: the distance on each
OSM road class (`trunk` … `track`), the hard stops, the times the van stopped
itself and the kerbs, the weather and season, and who was aboard (the crate
grid, with its `poorly` flags). **A visit resets it** for a price: the pump or
charger (coins), the car wash (one coin, the animals perk up), the workshop
(Depot parts).

Each mechanic has its level gate (28A). Below the gate it does not run: the
drive leaves those numbers alone and the visit is refused as `not-yet`, free.

- **Fuel (23A).** The gauge falls with distance, faster for bigger vans. At a
  quarter a `low` event fires **once** (it stays quiet until a fill takes the
  tank above the quarter again) and says how far along the drive it fired.
  `nearerStation({ 'station-west': km, 'station-east': km })` picks the
  station for the GPS from distances the scene measures. Ignored, the tank
  empties: a `ran-dry` event, the drive stops there (`kmDriven`), and `tow`
  says what it costs: coins, in-game minutes, and a happiness drop for each
  animal aboard (restless, never hurt). The tow leaves a splash in the tank.
- **Spark (27A).** Same model with a battery (`energy: 'battery'` on its
  events). Charges at A.R.C.'s charger (free, slow) or at either station
  (coins, quicker). A pump fill is quicker than any charge.
- **Trikey (27B).** No fuel, no wear, no wash. From level 6 it can get a
  puncture: a per-km chance (higher on a farm track) and a per-kerb chance,
  drawn from a **seeded `rng`** the scene passes in. Without an rng there is
  no puncture. A flat Trikey can still be ridden, just bumpier.
- **Wear (25A).** Builds per km (by road class, bigger vans faster) and per
  rough event (her own hard stop, the van stopping itself, a kerb). The
  `spanner-on` event fires once when it crosses 0.6. While the light is on,
  `rideRoughness(...)` returns 1.5: multiply the jostle by it.
- **Dirt (26A).** Outside: per km, a lot on farm tracks, more in rain, snow
  and winter. Inside: per km for each animal aboard that is poorly, moulting
  or messy, and for each pair of orthogonal neighbours that squabble
  (`pairFeeling` 'stressed' because the species disagree; a healthy animal
  giving a poorly one space is `needsQuiet`, not a squabble, and makes no
  mess). Crossing 0.5 fires `dirty-outside` / `dirty-inside` once.
- **Paying (24A).** Fuel and the wash in coins; the workshop in Depot parts.
  `payCoins` never takes more than she holds (the vet's precedent; open
  question 3). `canAffordParts` / `spendParts` read and spend
  `DepotInventory.parts`.
- **Wrong but safe.** Nothing is locked out. A clean van may go through the
  wash (the animals enjoy it, same coin). A van may be serviced before its
  light comes on (no parts, wear back to nought). A fuel van at A.R.C.'s
  charger, or Spark at the workshop, is refused as `not-here`, free. A
  punctured Trikey still rides.

### The repair part codes (24A)

`getRepairCost` asked for `polish`, `panel_filler`, `gasket` and similar,
none of which the Depot ever hands out. Each damage tier now asks for the
Depot's three `category: 'part'` items. Tools are never spent: a spanner is
not used up by a repair.

| Tier | At | Was | Now |
|---|---|---|---|
| Scratches | 10 | polish 1 | rusty_bolt 1 |
| Dents | 20 | panel_filler 1, polish 1 | rusty_bolt 1, shiny_cog 1 |
| Rattles | 35 | bolts 2, wrench_kit 1 | rusty_bolt 2 |
| Broken lights | 45 | bulb_set 1, wiring 1 | copper_wire 1 |
| Suspension | 60 | spring_kit 2, bolts 4 | shiny_cog 1, rusty_bolt 2 |
| Engine trouble | 75 | spark_plugs 2, oil_can 1, gasket 1 | shiny_cog 2, copper_wire 1 |
| Bodywork | 85 | panel_filler 3, welding_kit 1, paint 2 | rusty_bolt 2, shiny_cog 1 |
| Total write-off | 95 | engine_rebuild 1, chassis_parts 4, … | rusty_bolt 3, shiny_cog 2, copper_wire 2 |

Tiers add up (as before), so a 36-damage run costs 4 bolts and 1 cog. A
Depot session gives 1–6 items, about half of them common parts.

## The tunables

All in `UPKEEP_TUNABLES` at the top of `van-upkeep.ts`, all provisional. "A
drive" = 2.5 km (Birchie is about 4 km across).

| Tunable | Value | In drives |
|---|---|---|
| `TYPICAL_DRIVE_KM` | 2.5 | One drive |
| `FUEL_FROM_LEVEL` / `WASH_FROM_LEVEL` / `WORKSHOP_FROM_LEVEL` | 2 / 4 / 6 | Decision 28A |
| `RANGE_KM` Henry / Bea / Big Tilly / Spark | 12 / 10 / 7.5 / 10 | 4.8 / 4 / 3 / 4 drives a tank: never every drive |
| `LOW_AT` | 0.25 | Henry warns during drive 4; Big Tilly during drive 3 |
| Full tank price | `fuelCost` × drives a tank | Henry 24, Bea 40, Big Tilly 60, Spark 20 at a station (`VEHICLE_DEFS.fuelCost`, unread until now, is reused as coins per drive's worth) |
| `HOME_CHARGE_COINS` | 0 | Spark at A.R.C. is free |
| `REFUEL_MINUTES` / `STATION_CHARGE_MINUTES` / `HOME_CHARGE_MINUTES` | 5 / 30 / 120 | In-game minutes for a full fill, from empty |
| `TOW_COINS` | 10 | About two drives of Henry's fuel |
| `TOW_MINUTES` | 45 | In-game minutes on the verge |
| `TOW_RESTLESS_HAPPINESS` | −8 | Each animal aboard |
| `TOW_SPLASH` | 0.1 | Henry ~1.2 km: enough to reach a pump |
| `WEAR_PER_KM` | 0.010 (trunk) … 0.014 (lanes, houses), 0.03 (track) | Henry on main roads: the light after ~20 gentle drives |
| `WEAR_SIZE` | Henry 1, Bea 1.15, Big Tilly 1.3, Spark 1 | Bigger vans wear faster |
| `WEAR_PER_HARD_STOP` / `_SELF_STOP` / `_KERB` | 0.01 / 0.015 / 0.02 | A hard stop and a self-stop every drive: the light in ~11 drives |
| `SPANNER_AT` | 0.6 | |
| `WORN_ROUGHNESS` / `PUNCTURE_ROUGHNESS` | 1.5 / 1.5 | Jostle multiplier until serviced |
| `SERVICE_MINUTES` | 30 | |
| `SERVICE_PARTS` | rusty_bolt 1, shiny_cog 1 | Plus supply-run tiers when damaged |
| `PUNCTURE_PARTS` | rusty_bolt 1 | |
| `PUNCTURE_PER_KM` / `_TRACK` / `_KERB` | 0.012 / 0.04 / 0.1 | Trikey: one puncture in ~33 lane drives |
| `OUTSIDE_DIRT_PER_TRACK_KM` | 0.25 | 1 km of farm track a trip: dirty in two trips |
| `OUTSIDE_DIRT_PER_KM_RAIN` / `_SNOW` / `_WINTER` / `_BASE` | 0.03 / 0.05 / 0.025 / 0.005 | Winter alone: dirty in ~7 drives; dry summer roads: ~40 |
| `INSIDE_DIRT_PER_KM_SICK` / `_MOULTING` / `_MESSY` / `_SQUABBLE` | 0.05 / 0.04 / 0.08 / 0.04 | One sick passenger: dirty inside in ~4 drives; a messy one ~2–3; a squabbling pair ~5 |
| `DIRTY_AT` | 0.5 | Either kind "dirty" |
| `WASH_COINS` | 1 | Decision 26A |
| `WASH_PERK_HAPPINESS` | +5 | Each animal aboard |
| `WASH_MINUTES` | 10 | |

## What the scene will need to call, and when

Nothing in `apps/game/` was touched. To wire it in:

1. **Save.** The save has no per-vehicle record today. Add `vanUpkeep` to
   the save object; on load, `store.vanUpkeep = migrateFleetUpkeep(saved.vanUpkeep)`
   (an old save becomes a full, clean, unworn fleet); write it back in the
   save. `merge-save.ts` already merges it per vehicle, the side that changed
   a van winning (a tank is a state, not a counter).
2. **Before a drive** (picker, loading screen): `isLow`, `spannerLight`,
   `needsWorkshop`, `isDirtyOutside`, `isDirtyInside`, `rangeLeftKm` for the
   dashboard; `rideRoughness` to scale the jostle for the whole drive.
3. **During the drive**, every few hundred metres: `applyDriveLeg(upkeep,
   { vehicle, level, roadClass, km, weather, season, grid, conditions, rng })`.
   On `low`, glow the gauge and have the GPS offer
   `nearerStation({ 'station-west': routeKm(...), 'station-east': routeKm(...) })`.
   On `ran-dry`, the verge, hazards and tow beat, then apply `towCost(grid)`.
   On each handbrake, self-stop (ride-comfort.ts's `EMERGENCY`) or kerb:
   `applyRoughEvent(upkeep, 'hard-stop' | 'self-stop' | 'kerb', ...)`.
   Or, simpler: one `applyDrive(upkeep, report)` at the end of the drive with
   the legs and the counts (the low warning then cannot show mid-drive).
4. **At a station / A.R.C. / the workshop:** `refuel` (with `to` < 1 for a
   pump released early), `wash`, `service`. Each returns the new upkeep,
   `coins` (pass through `payCoins`), `parts` (check `canAffordParts`, take
   with `spendParts` from `depot.inventory.parts`), `minutes` to advance the
   clock and `happinessEach` for the animals aboard, or `refused`.
5. **After a supply run:** `recordSupplyRunDamage(upkeep, run.damages, level)`
   on the van that drove it.
6. **Coins:** `GameScene.rewardSafeDrive` (`:662`) pays no coins for a drive;
   supply runs are the income. Prices above assume that.

## Missing from the game

- **Moulting.** No such condition. `PassengerCondition.moulting` is an
  input; the scene passes false until it exists.
- **Makes a mess.** No such condition. `PassengerCondition.messy` is an
  input. Nearest existing thing: the vet's `tummy_ache` illness.
- **Sick** exists: `GameStateStore.sickAnimals`, already carried onto each
  crate as `poorly`. Used as is.
- **Which van a supply run uses.** `SupplyRunState` names no vehicle, so the
  scene must say which van's upkeep takes the damage.
- **Distance by road class.** The router knows each edge's OSM class and
  length; the drive scene will need to tally them.
- **Stations, the workshop and A.R.C.'s charger as places on the map.**
  Ids only here (`station-west`, `station-east`, `workshop`, `arc-charger`);
  their in-game names are still to be chosen with Marcus.

## Open questions for Marcus

1. **How does the inside get cleaned?** (26A left it open; the wash does not touch it.)
   - A. At A.R.C., by hand: a short care beat (sweep, fresh bedding), free, takes a little time.
   - B. An extra at the car wash: a hoover for another coin.
   - C. At the workshop, as a valet, for Depot parts.
   - D. The car wash does inside and out together for its one coin.
   - **Recommend A.** It belongs to the care loop like grooming, costs time not coins, and keeps the wash a simple one-coin treat.
2. **Does a dirty van cost anything if she ignores it?** (Not decided; the model only tracks it.)
   - A. No: dirt is only seen, and the wash is a treat.
   - B. Inside dirt makes the animals a little less happy on arrival; outside dirt is only seen.
   - C. Both kinds cost some happiness.
   - **Recommend B.** Inside dirt is what the animals sit in; mud on the outside is part of the fun.
3. **What if she cannot pay for fuel or the wash?**
   - A. She pays what she has and still gets the fill (as built, like the vet being free when she is short).
   - B. She gets only what her coins buy.
   - C. She cannot fill until she has the coins.
   - **Recommend A.** Running dry on purpose because a purse is empty would be locking her out. (C goes against the design rule.)
4. **What if she lacks the Depot parts for the workshop?** (The model gives the bill and does not refuse.)
   - A. The workshop mends it anyway and takes what she has.
   - B. It mends it and the parts are owed, taken from the next Depot sessions.
   - C. It sends her to the Depot first; the van keeps its spanner light meanwhile (still driveable).
   - **Recommend C.** The van still drives (bumpier), which is the cost, and it teaches the Depot-to-workshop link the original spec wanted.
5. **Where does the tow take her?**
   - A. On to where she was going, with a splash of fuel.
   - B. To the nearer station.
   - C. Home to A.R.C.
   - **Recommend A.** A vet run still ends at the vet, and the animals' wait is already the cost. The model leaves a splash in the tank either way.
6. **Spark's charge at A.R.C.: free?** (Built: free and slow, 2 in-game hours from empty.)
   - A. Free and slow (as built).
   - B. A few coins, still slow.
   - **Recommend A.** The home charger is the reason to own an electric van.
7. **Is Trikey ever washed?** (Built: no; it gathers no dirt either.)
   - A. No.
   - B. Yes, outside only (a pedal trike through the wash is a joke Lily might love).
   - **Recommend A** for now; B is a cheap later treat.
8. **Supply-run damage below level 6.** Supply runs start at level 0 and the workshop opens at 6.
   - A. Below 6 the damage is shown at the end of the run and forgotten (as built).
   - B. Kept on the van, and waiting at the workshop when it opens.
   - **Recommend A.** Otherwise a child arrives at level 6 to a huge bill.
9. **Moulting and mess.** Neither condition exists.
   - A. Add them: moulting by species and season (cats, dogs, bunnies, foxes in spring and autumn); mess from the vet's `tummy_ache`.
   - B. Mess only, from `tummy_ache`; no moulting.
   - C. Leave both out; inside dirt comes only from sick animals and squabbles.
   - **Recommend A.** It is cheap and links the van to the seasons and the vet.
10. **The numbers.** Every tunable above is a guess. The main one to check by feel: Henry needs fuel every ~5 drives, a full tank costs 24 coins, and a Bramble Farm supply run pays 50.
    - A. Keep them, tune after playing.
    - B. Make fuel cheaper (e.g. half) until drives pay coins.
    - **Recommend A**, and look again once a drive pays.
