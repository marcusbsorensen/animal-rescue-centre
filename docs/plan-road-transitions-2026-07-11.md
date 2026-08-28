# Build plan — smooth road-type transitions (merge/split)

_2026-07-11. Implementation blueprint (code-architect pass over the real engine).
Design intent: `docs/driving-road-types-2026-07-11.md` §1._

## Key insight
`scrollY` and `drive.progress` are the SAME signal rescaled
(`progress = scrollY * 0.0004`), both accumulated from `rate` each tick. So route
class-boundaries (`RoadClassRun.untilProgress`) convert to absolute world-Y up
front, and a screen row `y` maps to `worldY = scrollY + (vanY - y)`. That lets the
transition be **precomputed as a world-space zone** and the road drawn at
**different widths on different rows of the same frame** (narrows toward the top as
you approach) — which is exactly what a merge needs.

## Approach — two decoupled concerns
- **Rendering (continuous, cosmetic):** during a transition, draw the road in
  ~8px horizontal bands; per band compute `t` and draw a `RoadGeometry`
  interpolated between the from/to configs (lerp `roadLeft`/`roadWidth`/
  `medianUnits`; `laneWidth` is config-independent so lanes DROP, not squeeze) +
  a surface-colour lerp. Reuses the existing banded centre-line pattern. As the
  median shrinks to ~0, fade in the single-carriageway centre line; draw a few
  merge chevrons in the disappearing lane.
- **Gameplay (stepped):** `this.roadConfig` flips once at a **drop point** ~70%
  through the zone — but vehicles are pre-merged into a valid lane before then,
  so the flip is inert. This lets us DELETE the flash-cover entirely (it only
  existed to hide the discontinuity this design removes).

## New/changed
- New pure `driving/road-transition.ts` (+ tests): `buildRoadTransitions(profile,
  roadIdForClass, zoneLen)`, `worldYForRow`, zone lookups. Hoist
  `PROGRESS_PER_SCROLL = 0.0004` and `roadIdForClass`/`CLASS_TO_ROAD` out of the
  scene into shared modules.
- `drive-render.ts`: `blendRoadGeometry(from,to,t)`, extract a `drawRoadBand`
  helper, add `drawTransitionRoad(...)` + `drawMergeMarkings(...)`.
- `PtvDriveScene.ts`: `roadTransitions` state; `beginTravel` builds them; new
  `drawRoad()` picks banded-vs-static; tick loop steps config at the drop point;
  new `stepRoadConfig` replaces `applyRoadSwitch` (no teardown/respawn, no cover);
  **delete** `switchRoad`/`applyRoadSwitch`/the cover/`roadSwitching`; pre-merge
  vehicles via `maybeMergeVehicleLane` (reuses `moveCarToLane`; new
  `moveOncomingToLane`; van uses `glideToLane` + the existing speed-cap when the
  target lane is blocked — never a hard stop/crash).

## Which lane survives
Nearside lane (index 0) always survives; offside/median-adjacent lanes merge in
(matches the lane-0=slow convention). Oncoming mirrors: their near (median-side)
lane merges away so oncoming converges across a single painted line instead of a
grass reservation — falls out of the geometry blend, no special case.

## Build sequence
1. `road-transition.ts` + hoist `roadIdForClass` (measure the smallest real
   class-gap on live routes before fixing `ZONE_LEN`; `smoothRuns` min 0.08 ≈ 200
   world-px, so keep zones under that).
2. `blendRoadGeometry` + tests.
3. `drawTransitionRoad` behind a `?mergeDemo=1` dev flag (visual only).
4. `drawMergeMarkings` + banner.
5. Wire into `beginTravel`/`drawRoad`/tick; add `stepRoadConfig`; delete the flash.
6. Vehicle pre-merge (traffic + oncoming + van).
7. Overtake↔merge-zone guard (cancel overtake on zone entry).
8. Cleanup; keep `cycleRoad()` as an instant cut.
9. Polish: tune zone length/markings; test split (single→dual), coast-road
   (oncoming 1→0), rural-track (surface-only).

## Open questions for Marcus
1. Pace — `ZONE_LEN` ~500–600 world-px (~3–4s at gear 2)? slower/more dramatic?
2. Markings — chevrons + "lanes merge" banner, or markings-only (quieter)? Does
   the coast-road case (losing the oncoming side) need any merge framing?
3. A deliberate "hang back / give way" teaching beat during a merge, or always
   frictionless?
4. Overtake-in-progress at a merge zone: auto-cancel (default), or delay the
   merge until the overtake finishes?
5. `cycleRoad()` dev toggle: instant cut (default) or animate too?
6. Split ("lane opens up"): quiet line fade-in (default) or an explicit "lane
   starts" chevron?
