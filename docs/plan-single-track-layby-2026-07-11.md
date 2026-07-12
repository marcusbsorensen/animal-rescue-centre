# Build plan — single-track road with passing places (lay-bys)

_2026-07-11. Implementation blueprint (from a code-architect pass over the real
engine). Design intent: `docs/driving-road-types-2026-07-11.md` §2._

## Model the road
`RoadConfig` currently splits direction into `playerLanes` / `oncomingLanes`.
Single-track is **1 lane SHARED both ways**, so add a flag rather than a new
lane scheme:
- `RoadConfig.shared?: boolean`; `totalLanes()` must still return 1.
- Helper `hasOncoming(c) = c.oncomingLanes > 0 || !!c.shared`.
- New `ROADS['single-track']`: `playerLanes 1, oncomingLanes 0, divider 'line',
  shared true`. With `oncomingLanes 0`, the centre-line + median code falls
  through to "nothing drawn" — correct (single-track has no centre markings),
  free.
- Replace the `oncomingLanes >= 1/>0` "is there oncoming?" checks
  (PtvDriveScene ~1127/1143/1490) with `hasOncoming(config)`.
- `canOvertake()` must return false on `shared` roads — the only passing
  mechanic here is lay-bys.

## Lay-bys — procedural (like the scenery/centre-line bands)
Everything in the travel view is a deterministic function of `scrollY`, not real
GPS. Do lay-bys the same way, near `isOvertakingZone` in `drive-render.ts`:
- `LAYBY_SPACING` (~900px), `LAYBY_LEN` (~150px); `layByZoneIndex(scrollY,y)`,
  `layBySide(zone)` (alternates left/right, UK-style), `layByBand(scrollY,zone)`.
- `layByPocketCentreX(geo, side)` — the X just outside the lane edge that a
  vehicle tweens to when pulling in.
- Extend `drawRoadForConfig` with a `config.shared` block drawing tapered tarmac
  bulges per zone (reuse the firstK/lastK band loop). Real-map lay-by positions
  are a later slice; procedural for now.

## Meeting / give-way logic
- Oncoming spawns **in lane 0** (same lane as the player), **one active car at a
  time** (mirrors the existing single-carriageway "one leader" simplification).
- New pure module `driving/single-track.ts` + tests: `decideGiveWay(vanY,
  oncomingY, scrollY)` → whichever vehicle is nearer its own lay-by gives way
  (pull in ahead, or reverse to one behind). Same exact `(scrollY,y)` frame for
  both vehicles, so it's arithmetic not guesswork.
- Scene `this.meeting` state machine: detect (gap under a react threshold) →
  decide → drive the oncoming-car AI or prompt the player → resolve → clear.
  Cleared on road switch / rebuild alongside `overtaking`.

## Reuse, don't reinvent (the no-crash guarantees already exist)
- Oncoming brake-and-hold: the overtake code already caps player speed to 0 and
  holds the oncoming car's world position — widen its trigger from `overtaking`
  to also fire on `meeting.giveWay === 'player'`.
- Reverse-stop: the reverse branch already refuses to shunt traffic behind —
  add a "stop once inside the target lay-by band" condition.
- Sideways pull-in: extract `glideToLane`'s tween body into `glideToX(x,dir)`,
  target a pocket X instead of a lane centre.
- Oncoming car pulling into its pocket: reuse `moveCarToLane`'s tween shape.
- Feedback: reuse `bumpBlocked` + `showRoadBanner`/popup for narration.

## Build sequence (each playable via the demo `cycleRoad()` button)
1. Config plumbing (`shared`, `hasOncoming`, ROADS entry, ROAD_CYCLE) — no
   behaviour change to other roads.
2. Lay-by geometry + rendering, no gameplay (bulges scroll past, alternating).
3. Oncoming spawns into the shared lane (passes through van for now).
4. `single-track.ts` give-way decision + unit tests, isolated.
5. No-crash safety net first: everyone stops nose-to-nose safely.
6. Oncoming-gives-way path (AI pulls into pocket, waits, resumes).
7. Player-gives-way, pull-in-ahead path (+ banner).
8. Player-gives-way, reverse-to-lay-by path (reverse auto-stops at the pocket).
9. Polish: banner copy, sfx, tuning spacing/detection/speed.
10. (Later slice) wire into the real Birchie route once single-track ways are
    tagged in the graph.

## Design decisions (Marcus, 2026-07-11) — all settled
1. **Give-way:** decide from the maths — whoever is nearer a lay-by gives way
   (pull in ahead, or reverse to one behind). Bias toward the player giving way
   early on, the oncoming car more at higher difficulty.
2. **Reverse cue:** a **pulsing backward arrow** drawn at the lay-by behind the
   van **plus a banner** ("Back up to the lay-by!").
3. **Difficulty:** **gate single-track behind a player level** (unlocks once
   ordinary overtaking is mastered).
4. **Passing scope:** **oncoming meetings only** for slice 1; lay-by-past-a-slow-
   leader (same-direction) is a later addition.
5. **Oncoming density:** **one active oncoming vehicle at a time**.
6. **Where it appears:** **demo road-cycle button first**; wiring single-track
   into the real Birchie route (map-data tagging) is a separate later slice.
