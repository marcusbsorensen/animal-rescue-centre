# Fuel, the workshop and the car wash — what exists, 2026-10-12

Marcus, 2026-10-11: "part of the driving game, as the levels go on, will also
involve tanking fuel at one of the two local garages, and sometimes a visit to
the workshop for repairs, and also visiting the car wash with the inflatable
guy (which needs better animated artwork)". The rules are being asked
(questions 22–29 in the session of 2026-10-11/12); this page is the inventory
they rest on, so nobody has to search again.

## Nothing runs yet

- `packages/game-logic/src/crate-stacking.ts:225, 257-261`: `fuelCost` per
  vehicle (Trikey 0, Henry 5, Bea 10, Big Tilly 20, Spark 5 coins), unread.
- `apps/game/src/scenes/PtvDriveScene.ts:245`: `economy` is passed in and
  never read; `GameScene.rewardSafeDrive` (`:662`) is where a drive is paid.
- `apps/game/src/driving/drive-events.ts`: no fuel or wash event type.
- Supply Runs: `supply-runs.ts:80-99` damage tiers are shown; `getRepairCost`
  is test-only, and its part codes do not match `depot-inventory.ts`.
- No wear, service, breakdown, wash, dirt-on-vehicle or charging code.
- The only coin sink is the vet (20 coins, `GameScene.ts:2330`), and it is
  free when she has under 20.

## Levels

Player level only: `progression.ts:41`, 5 × level rescues to the next.
Vehicles unlock at Trikey 0, Henry 2, Bea 5, Big Tilly 10, Spark 12
(`VEHICLE_DEFS.unlockLevel`); destinations by `destinations.ts:75`.

## Places (OSM, `manus-output/birchie-osm/birchington.json`, ways only)

| Real | Where | Note |
|---|---|---|
| Esso / MFG, 361 Canterbury Rd | 51.36884, 1.29968 (map ≈ .33, .61) | car wash beside it; Fishbone Grill next door; the tube man's reference was filmed here (`public/admin/scene-assets/reference/birchie-west-entrance/`) |
| BP, Canterbury Rd, Westgate | 51.37963, 1.35314 (map ≈ .92, .30) | automatic car wash beside it |
| Station Garage, 5 Minnis Rd | 51.37655, 1.30232 (map ≈ .36, .38) | car repairs, beside the vet |

No public charging points in the data. The map (`birchie-roads.svg:851-885`)
draws one static "Petrol Station" about 0.75 km from the real one and a
static "Suds 'n' Steve's" wash pictogram; neither is on a road or tappable.
In-game names allude and never name (`docs/naming-places.md`).

## Art

- Henry's painted dashboard has a fuel gauge, needle painted straight up
  (`dashboard-henry-ptv.png`; measured at `drive-spike/dashboard.js:50`).
- Tube man: only vendor reference (photo, 38 s video, 8 stills) and the
  README spec — blue dungarees, red shirt, blue cap, right arm flaps, left
  stays low, janky with no easing. No game art. The old animated "Steve"
  (a man with a sponge, not a tube man) is in git at `2b91d5d^`.
- The Manus landmark brief (`.claude/notes/landmark-pilot-2026-10-11.md`)
  was never sent (credit overdrawn).

## Earlier designs to weigh

`docs/ptv-pet-transport-vehicle.md`: petrol station `:359-370` (pump
mini-beat, pay in coins, running dry means a tow and a coin penalty), wash
`:473-476` (one coin, a small mood lift, "Lily will love the inflatable
guy"), tube man `:348-357`. `docs/original-depot-supply-spec.md:50`: repairs
paid with Depot parts "rather than cash sinks".

## Decided (Marcus, 2026-10-12)

- **Places (22A):** as in real life. Two petrol stations, the Esso/MFG on
  Canterbury Road (west) and the BP towards Westgate (east), each with a car
  wash; the tube man stands at the west one. The workshop is the Station
  Garage on Minnis Road, beside the vet. In-game names allude, never name.
- **Fuel (23A):** the gauge falls with distance, faster for bigger vans. At a
  quarter tank the gauge glows and the GPS offers the nearer station. Ignored,
  the van runs dry, pulls onto the verge with its hazard lights on and is
  towed: time and coins lost, and the animals aboard grow restless.
- **Paying (24A):** fuel and the wash in coins; repairs with Depot parts, as
  the original Depot spec said (its part codes must first be made to match
  `depot-inventory.ts`).
- **Workshop (25A):** wear builds with distance and with rough driving (hard
  stops, the van stopping itself, kerbs). A spanner light comes on; until the
  service the ride is bumpier for the animals. Supply-run damage is mended
  there too.
- **Car wash (26A, extended):** the van gets dirty outside on farm tracks and
  in winter, AND inside from the animals it carries: one that is sick or
  moulting, one that makes a mess, two that squabble. A wash costs a coin and
  the animals perk up. (Inside dirt links to animal needs and to
  `crate-stacking.ts` `feelingToward`; how the inside is cleaned is still to
  be asked.)
- **Spark and Trikey (27A+B):** Spark has a battery gauge and charges at
  A.R.C.'s own charger or at either petrol station (both have chargers now,
  though the May OSM data predates them). Trikey needs no fuel, only the
  workshop for the odd puncture.
- **When (28A):** fuel from level 2 (Henry, the first van that uses fuel),
  the car wash from level 4, the workshop from level 6.
- **Tube man (29A):** painted in the game's style from the README (blue
  dungarees, red shirt, blue cap) and animated in code: the tube sways and
  buckles, the right arm flaps, the left stays low; janky, never the same
  twice.

## Crossing animals (20, 21A, same day)

Vehicle outlines at 0.65 of the hedges' weight (the vans are smaller and more
finely drawn than the hedges). The crossing animals become the game's own
painted animals in side view, with a much finer contour than the vehicles,
and a pulsing highlight on the road beneath each so a young player spots it
at once. The pulse keeps time with the animal's gait: a rabbit hops across, a
hedgehog shuffles, stops and shuffles again, a fox bounds.
