# Van upkeep — the model, 2026-10-12

Fuel, charging, wear and dirt on A.R.C.'s rescue vans, built from Marcus's
decisions 22–28 (`docs/fuel-workshop-carwash-2026-10-12.md`, "Decided") and
his answers to this model's ten questions (below, "Decided"). This is the pure
game-logic layer only: no scene, art or UI calls it yet.

- Code: `packages/game-logic/src/van-upkeep.ts` (exported from `index.ts`)
- Tests: `packages/game-logic/src/__tests__/van-upkeep.test.ts` (110: 67, then 43 more for Marcus's answers)
- Also changed: `supply-runs.ts` repair part codes (24A), `merge-save.ts`
  (a `vanUpkeep` merge rule)

## What it does

Each vehicle has one small, serialisable upkeep record:

| Field | Range | Meaning |
|---|---|---|
| `energy` | 0–1 | Fuel in the tank, or charge in Spark's battery. Trikey stays at 1 |
| `wear` | 0–1 | Wear from distance and rough driving; the spanner light comes on at 0.6 |
| `dirtOutside` | 0–1 | Mud, salt and grime. Washed off at a station. Trikey too |
| `dirtInside` | 0–1 | Fur, mess and scattered bedding. Vans only. Cleaned four ways (answer 1) |
| `lowWarned` | bool | The quarter-tank warning has fired since the last fill |
| `puncture` | bool | Trikey has a flat |
| `supplyDamage` | 0–100 | Supply-run damage waiting for the workshop, on `DAMAGE_THRESHOLDS`' scale |

**A drive updates it** from what happened on the drive: the distance on each
OSM road class (`trunk` … `track`), the hard stops, the times the van stopped
itself and the kerbs, the weather and season, and who was aboard (the crate
grid, with its `poorly` flags). **A visit resets it** for a price: the pump or
charger (coins), the car wash (one coin, inside and out, the animals perk up), the
hoover (one coin, inside only), cleaning by hand at A.R.C. (free, time), the
workshop (service or valet, Depot parts).

Each mechanic has its level gate (28A). Below the gate it does not run: the
drive leaves those numbers alone and the visit is refused as `not-yet`, free.

- **Fuel (23A).** The gauge falls with distance, faster for bigger vans. At a
  quarter a `low` event fires **once** (it stays quiet until a fill takes the
  tank above the quarter again) and says how far along the drive it fired.
  `nearerStation({ 'station-west': km, 'station-east': km })` picks the
  station for the GPS from distances the scene measures. Ignored, the tank
  empties: a `ran-dry` event, the drive stops there (`kmDriven`), and `tow`
  says what it costs: coins, in-game minutes, and a happiness drop for each
  animal aboard (restless, never hurt). The tow takes her to the **nearer
  station** (`tow.to`, answer 5), not on to where she was going; she fills
  there and drives on. Pass `stationKmAt(atKm)` on the drive report so the
  model can pick the station from where she stopped. The tow also leaves a
  splash in the tank, as a safety net if she drives off without filling.
- **Spark (27A).** Same model with a battery (`energy: 'battery'` on its
  events). Charges at A.R.C.'s charger (free, slow; answer 6) or at either station
  (coins, quicker). A pump fill is quicker than any charge.
- **Trikey (27B, answer 7).** No fuel and no wear. It gathers outside dirt
  like a van (tracks, rain, snow, winter) and can go through the car wash,
  outside only, for the same coin; it has no inside. From level 6 it can get a
  puncture: a per-km chance (higher on a farm track) and a per-kerb chance,
  drawn from a **seeded `rng`** the scene passes in. Without an rng there is
  no puncture. A flat Trikey can still be ridden, just bumpier.
- **Wear (25A).** Builds per km (by road class, bigger vans faster) and per
  rough event (her own hard stop, the van stopping itself, a kerb). The
  `spanner-on` event fires once when it crosses 0.6. While the light is on,
  `rideRoughness(...)` returns 1.5: multiply the jostle by it.
- **Dirt (26A, answers 2 and 9).** Outside: per km, a lot on farm tracks,
  more in rain, snow and winter. Only seen: it costs nothing. Inside: per km
  for each animal aboard that is poorly, moulting (`isMoulting`: cats, dogs,
  bunnies and foxes in spring and autumn, from the drive's `season`) or
  messy (a tummy ache: `conditionsFromIllnesses(store.sickAnimals)`), and
  for each pair of orthogonal neighbours that squabble
  (`pairFeeling` 'stressed' because the species disagree; a healthy animal
  giving a poorly one space is `needsQuiet`, not a squabble, and makes no
  mess). Crossing 0.5 fires `dirty-outside` / `dirty-inside` once. A dirty
  inside makes each animal aboard a little less happy on arrival
  (`arrivalHappinessEach`, also on `applyDrive`'s result: −3).
- **Cleaning the inside (answer 1).** Four ways, all to nought: `cleanByHand`
  at A.R.C. (free, 15 min, a care beat: sweep, fresh bedding), `hoover` at
  either station (1 coin, inside only), `valet` at the workshop (Depot parts,
  from level 6), or the `wash` (1 coin, inside and out together). Hand and
  hoover open with the wash at level 4.
- **Paying (24A, answers 3 and 4).** Fuel, the wash and the hoover in coins;
  the workshop in Depot parts. `payCoins` never takes more than she holds,
  and she still gets the whole fill or wash (answer 3). `service` and `valet`
  take the Depot parts bag (`depot.inventory.parts`) and either pay from it
  (`partsLeft` to write back) or, if anything is short, return
  `refused: 'need-parts'` with the bill and `missingParts`: the workshop
  sends her to the Depot first (answer 4). Nothing is mended and nothing is
  spent; the spanner light stays on and the van still drives, bumpier. It is
  all or nothing: the workshop does not mend half a van.
- **Wrong but safe.** Nothing is locked out. A clean van may go through the
  wash (the animals enjoy it, same coin), and a clean inside may be swept or
  hoovered again (same price). A van may be serviced before its light comes
  on (no parts, wear back to nought). A fuel van at A.R.C.'s charger, or
  Spark at the workshop, is refused as `not-here`, free. A punctured Trikey
  still rides, and so does a van the workshop sent to the Depot.

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
| `INSIDE_DIRT_PER_KM_SICK` / `_MOULTING` / `_MESSY` / `_SQUABBLE` | 0.05 / 0.04 / 0.08 / 0.04 | One sick passenger: dirty inside in ~4 drives; a moulting one ~5; a tummy ache (sick + messy) ~2; a squabbling pair ~5 |
| `DIRTY_AT` | 0.5 | Either kind "dirty" |
| `DIRTY_INSIDE_ARRIVAL_HAPPINESS` | −3 | Each animal, on arrival, while the inside is dirty (the tow is −8) |
| `WASH_COINS` | 1 | Decision 26A |
| `WASH_PERK_HAPPINESS` | +5 | Each animal aboard |
| `WASH_MINUTES` | 10 | |
| `HAND_CLEAN_MINUTES` | 15 | Free |
| `HOOVER_COINS` / `HOOVER_MINUTES` | 1 / 5 | |
| `VALET_PARTS` / `VALET_MINUTES` | rusty_bolt 1 / 20 | |

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
   On `ran-dry`, the verge, hazards and tow beat to the nearer station, then
   apply `towCost(grid, { 'station-west': km, 'station-east': km })` (or read
   `tow` from `applyDrive`, which asks `report.stationKmAt`).
   Pass `season` and `conditions: conditionsFromIllnesses(store.sickAnimals)`
   so moulting and tummy aches feed the inside dirt.
   On each handbrake, self-stop (ride-comfort.ts's `EMERGENCY`) or kerb:
   `applyRoughEvent(upkeep, 'hard-stop' | 'self-stop' | 'kerb', ...)`.
   Or, simpler: one `applyDrive(upkeep, report)` at the end of the drive with
   the legs and the counts (the low warning then cannot show mid-drive).
4. **On arrival:** apply `arrivalHappinessEach` to each animal aboard.
5. **At a station / A.R.C. / the workshop:** `refuel` (with `to` < 1 for a
   pump released early), `wash`, `hoover`, `cleanByHand`, `service` and
   `valet` (these two take `depot.inventory.parts`). Each returns the new
   upkeep, `coins` (pass through `payCoins`), `parts` and `partsLeft` (write
   back to `depot.inventory.parts`), `minutes` to advance the clock and
   `happinessEach` for the animals aboard, or `refused`. On `need-parts`,
   tell her the workshop needs `missingParts` from the Depot.
6. **After a supply run:** `recordSupplyRunDamage(upkeep, run.damages, level)`
   on the van that drove it.
7. **Coins:** `GameScene.rewardSafeDrive` (`:662`) pays no coins for a drive;
   supply runs are the income. Prices above assume that.

## Missing from the game

- **Moulting** is not an animal condition in the game; the model works it
  out from species and season (`isMoulting`). Included: cat, dog, bunny,
  fox. Left out of the game's eight: bat, parrot, snake, hedgehog.
- **Makes a mess** comes from the vet's `tummy_ache` (`MESSY_ILLNESSES`).
- **Sick** exists: `GameStateStore.sickAnimals`, already carried onto each
  crate as `poorly`. Used as is.
- **Which van a supply run uses.** `SupplyRunState` names no vehicle, so the
  scene must say which van's upkeep takes the damage.
- **Distance by road class.** The router knows each edge's OSM class and
  length; the drive scene will need to tally them.
- **Stations, the workshop and A.R.C.'s charger as places on the map.**
  Ids only here (`station-west`, `station-east`, `workshop`, `arc-charger`);
  their in-game names are still to be chosen with Marcus.

## Decided (Marcus, 2026-10-12)

His answers to the ten questions this doc first asked (numbered 42–51 in the
conversation).

1. **Cleaning the inside: all four ways exist.** By hand at A.R.C., a short
   care beat (sweep, fresh bedding), free, takes a little time. A
   coin-operated hoover at the petrol station (both stations), one coin,
   inside only. A valet at the workshop, paid in Depot parts. And the car
   wash cleans inside and out together for its one coin. So the hoover is the
   cheap inside-only choice and the wash the do-everything one.
2. **B.** Inside dirt makes the animals a little less happy on arrival;
   outside dirt is only seen.
3. **A.** If she cannot pay for fuel or the wash, she pays what she has and
   still gets the fill (as built).
4. **C.** If she lacks the Depot parts, the workshop sends her to the Depot
   first; the van keeps its spanner light meanwhile and stays driveable
   (bumpier). The model says so as a result, not a silent refusal.
5. **B.** When she runs dry, the tow takes her to the nearer petrol station
   (not on to her destination); she fills there. Time and coins lost and the
   animals restless, as decided in 23A.
6. **A.** Spark's charge at A.R.C. is free and slow (as built).
7. **B.** Trikey can go through the car wash, outside only (a pedal trike
   through the wash is a joke Lily may love). Trikey gathers outside dirt
   (tracks, winter) and can be washed; still no fuel.
8. **A.** Supply-run damage below level 6 is shown at the end of the run and
   forgotten (as built).
9. **A.** Moulting by species and season (cats, dogs, bunnies, foxes in
   spring and autumn), and mess from the vet's `tummy_ache`; both feed inside
   dirt. Of the game's species, the four he named are in; bats, parrots,
   snakes and hedgehogs are not.
10. **A.** Keep the tunable numbers; tune after playing.

## Still open

- **Numbers to feel out in play (10).** In particular the new ones: −3
  happiness for a dirty inside, a 15-minute hand clean, a 1-bolt valet. And
  moulting now runs half the year: two moulting dogs aboard in spring make
  the inside dirty in ~2–3 drives, which may be too often.
- **Does the hand clean or the hoover cheer the animals, like the wash?**
  Built: no, only the wash perks them up.
- **The hoover costs the same coin as the wash**, which does more. Marcus
  called the hoover "the cheap" choice: it is quicker (5 min against 10) but
  not cheaper in coins, since one coin is the smallest price. Leave it, or
  make the hoover free?
- **The splash after the tow.** The tow drops her at the station to fill,
  but still leaves a splash in the tank in case the scene lets her drive off
  without filling. Keep as a safety net, or drop it?
- **Snakes shedding, parrots moulting** could later join moulting if wanted.
- The in-game names of the stations, workshop and A.R.C.'s charger.
