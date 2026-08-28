# Turning at junctions — current state & what a build needs

_2026-07-12. From a code-explorer pass over the real engine, prompted by
Marcus noticing the GPS announces turns and the dot rounds corners, but there's
no way to actually steer round a bend or take a side road._

## Conclusion: turning is NOT wired — and it's a feature, not a wire-up

The travel view is a **straight vertical treadmill**. The world's only degree of
freedom is vertical scroll (`scrollY += rate`). The GPS half is real and
unit-tested; the driving half is decoupled from it.

## What exists today
- **GPS knows the route.** A Dijkstra path over a pre-built Birchie road graph
  (`road-router.ts` → `routePolyline`), with turns extracted by real geometry
  (`route-instructions.ts`: `simplifyRoute` RDP + `buildManeuvers` heading
  deltas + `classify`). Banners via `updateGpsInstruction()`.
- **The dot** is placed by interpolating a scalar `drive.progress` along the
  polyline (`routePointAt`). But `progress` is just an **odometer** —
  `progress += rate * 0.0004` (`PtvDriveScene.ts` ~1690). It advances no matter
  what; the player can't influence which way it goes.
- **The only "turn"** is a cosmetic flourish leaving the A.R.C. forecourt
  (`showTurnChoice`/`turnAndGo`/`beginTravel`) — and `beginTravel`'s direction
  arg is **discarded** (`_dir`). Once travel starts the side has no effect.
- **No junctions are rendered.** `drive-render.ts` only draws straight vertical
  lanes/surfaces. No branch, side-road opening, curve or intersection. What
  changes mid-drive is only the road *type* (surface/lane count) via
  `switchRoad()` — still a straight road.

So the GPS says "Turn left now!" while the road scrolls dead straight and the
dot rounds the corner on its own.

## What a real turning build needs (substantial)
The current model is heading-less: `RoadConfig` is a cross-section only (lanes,
surface, divider) — no curvature, heading or junction-ahead. To make turning
real:
1. **Road geometry/heading** in the render model — draw a curving/branching road
   (lanes no longer fixed vertical columns) or rotate the world, and render a
   visible side-road opening at each junction. Heavy change to
   `drawRoadForConfig`/`roadGeometry` in `drive-render.ts`.
2. **Surface junctions from the graph** into the travel phase — graph nodes of
   degree > 2 are junctions; expose the upcoming junction (+ correct turn) from
   the router, keyed to `drive.progress`.
3. **A player turn decision** at each junction (prompt or steer input) and gate
   progress on taking the correct branch — vs today's auto-advance. Wrong turns
   need off-route/rerouting handling (`routePolyline` currently routes once).
4. **Couple the on-road view to the route** so the dot and the road agree
   (today they're independent).

## Relevant code map
- `PtvDriveScene.ts` — `showTurnChoice`/`turnAndGo`/`beginTravel` (forecourt-only
  pseudo-turn); GPS block (`redrawGpsRoute`/`updateGpsInstruction`/`routePointAt`);
  travel loop `scrollY += rate`, `progress += rate*0.0004`; `switchRoad`.
- `route-instructions.ts` — turn extraction (exists, tested).
- `road-router.ts` — Dijkstra route + `routePolyline` + `routeProfile`.
- `road-config.ts` — cross-section-only road model (no geometry/heading).
- `drive-render.ts` — straight-road renderer.
- `drive-state.ts` — scalar `progress`, `shiftLane`, `gearScrollRate`.

## Sequencing note
This is a peer of the single-track/lay-by and road-transition slices (see the
other `docs/driving-*` and `docs/plan-*` files) — arguably the biggest of the
three, since it introduces a road-geometry/heading model the straight scroller
has never had. Decision pending: plan/build it as a slice, or defer.
