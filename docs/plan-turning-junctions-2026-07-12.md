# Build plan — real turning at junctions

_2026-07-12. Implementation blueprint (code-architect pass over the real
engine). Design intent / investigation: `docs/driving-turning-junctions-2026-07-12.md`._

## Key decision: the "junction card" (branch-and-snap), not curvature or world-rotation

Three ways to make turning real, weighed against this being a gentle scroller
built for an 8-year-old:

- **(a) Curving/branching road geometry.** Give `RoadGeometry` heading and
  lateral offset as functions of progress; lanes bend, junctions are real
  branches in the render. Truest to a "real" driving game, but it turns every
  lane/traffic/overtake/lay-by/merge calculation in `drive-render.ts` and
  `PtvDriveScene.ts` (all currently "X is a function of a fixed lane index")
  into a function of curvature too. Biggest build by far, and it invalidates
  the straight-lane assumption every other slice (lay-bys, merges) depends on.
- **(b) Rotate-the-world.** Track the van's real heading and (x,y) in world
  space; rotate road/scenery/traffic around the fixed van each frame as it
  turns. Same order of cost as (a) — everything that currently reasons in
  "lane index + vertical scroll" (traffic weaving, oncoming spawn, overtake
  gating, the lay-by/merge slices) would need a heading-aware rewrite.
- **(c) Junction card (recommended).** The road stays a vertical scroller.
  As a real fork approaches, a side-road opening (a procedural "mouth" in the
  verge, drawn the same way as the lay-by bulges) slides up the screen at the
  junction's true world-Y. The player taps left/right/straight at the
  decision point. On a take, one short flourish (reuse `turnAndGo`'s
  rotate-and-reposition tween, generalised to mid-route) re-orients the van
  and the road config swaps to the branch's type — then it's a straight
  scroller again, just now on a different road. No continuous heading state
  anywhere; the "turn" is a single instantaneous re-frame, exactly like the
  existing forecourt turn already does once, just repeated at each real fork.

**Recommendation: (c).** It reuses three patterns already proven in this
codebase — the lay-by procedural bulge (`docs/plan-single-track-layby-2026-07-11.md`),
the world-space banded zone (`road-transition.ts`), and the forecourt turn
flourish (`showTurnChoice`/`turnAndGo`) — instead of inventing a heading model
the rest of the engine doesn't have. It costs a fork's-worth of extra art/logic
per junction, not a rewrite of the whole render/traffic/lane stack, and it
still delivers the actual goal: the player makes a real steering decision at
the right moment, sees the road visibly open the way the GPS says, and gets it
wrong sometimes with a graceful recovery.

## The geometry/heading model this needs

No heading field is added to `RoadConfig`/`RoadGeometry` — geometry stays a
cross-section. What's new is a **junction zone**, modelled the same way
`road-transition.ts` models a merge zone:

- New pure module `driving/junctions.ts` (+ tests), sibling to
  `road-transition.ts`:
  - `RouteJunction { atProgress: number; turn: TurnDir; isChoice: boolean;
    nodeIndex: number; worldY: number }` — `isChoice` is the important new
    idea: **not every turn in `buildManeuvers()` is a real decision.** A
    graph node of degree 2 is just the through-road bending (the route has no
    alternative there) — render it as a cosmetic sweep, no tap needed, exactly
    like today's auto-advance. A node of degree > 2 is a genuine fork — a
    wrong tap is possible, so it needs a player decision and a reroute path.
  - `buildRouteJunctions(graph, adj, path, maneuvers)`: cross-references the
    Dijkstra `path` (already have the node indices from `road-router.ts`'s
    `shortestPath`, currently discarded after `routePolyline` maps them to
    points) with `adj[node].length` (degree) and `buildManeuvers()`'s
    `atProgress`/`turn`, tagging each maneuver `isChoice` where its node's
    degree > 2 (and, per design decision below, where a non-route edge at
    that node is a "real" road class, not a driveway/track stub).
  - `worldYForProgress`/`worldYForRow` (already in `road-transition.ts`) are
    reused as-is — a junction's `atProgress` converts to `worldY` the same way
    a merge boundary does.
  - `nextJunction(junctions, progress)` mirrors `nextManeuver`.
  - `decisionWindowAt(zone)`: a generous world-px window (wide — forgiving for
    an 8-year-old, no split-second reflex test) either side of `worldY` in
    which a tap is "for" this junction.
- `drive-render.ts`: `drawJunctionMouth(gfx, geo, scrollY, vanY, zone)` —
  a tapered gap in the verge/hedge on `zone.side`, widening as
  `worldYForRow(...)` approaches `zone.worldY`, drawn with the exact same
  banded/tapered technique as the lay-by bulges (`isOvertakingZone`-style
  zone maths) and the transition zone's per-row blend. This is the piece that
  makes the fork visually real without any curvature.

## Surfacing junctions & gating progress

Today `drive.progress` is a pure odometer (`progress += rate*0.0004`, `PtvDriveScene.ts`
~1786) that never waits for the player. New behaviour, scoped to `isChoice`
junctions only (sweeps stay fully automatic, unchanged):

- The tick loop (`startDriveLoop`) checks, each frame: is `worldYForRow(scrollY,
  vanY, vanY)` inside the `decisionWindowAt` of the next `isChoice` junction?
  If so, show the prompt (`showJunctionChoice()`, new — mirrors
  `showTurnChoice`/`turnAndGo` but overlaid on the live travel view rather
  than the forecourt) and accept a tap.
- **Progress itself is never hard-frozen** (see Design Decisions #1) — it's a
  *soft* window: the van keeps rolling at the current gear rate right through
  the fork's world-Y (freezing would read as the game breaking, not a
  decision beat, to an 8-year-old). A tap inside the window applies the branch
  immediately; if the window closes with no tap, the default (straight-on if
  available, else mildest branch) applies automatically and the wrong-turn/
  reroute path (below) kicks in exactly as if the player had tapped it
  themselves — one code path handles both a wrong tap and a timeout.
- Taking a branch swaps `roadConfig` via the existing `switchRoad(id)` (or,
  once `docs/plan-road-transitions-2026-07-11.md` lands in the scene, the
  banded `stepRoadConfig`) — the branch's road class is already known from the
  graph edge the player just took, so there's no guessing what road they're
  now on.

## Wrong-turn / rerouting

`routePolyline`/`routeProfile`/`buildManeuvers` are pure functions of `(graph,
adj, from, to)` — `beginTravel`/`renderGps` currently call them exactly once
with `from = ARC_PLACE`. Rerouting doesn't need new pathfinding logic, only
**calling the same functions again with a new `from`**:

- Retain the fraction-space polyline. `renderGps` currently computes `polyFrac`
  (real map-fraction `RoutePoint[]`) purely as a stepping stone to panel
  pixels and discards it — store it as `this.gpsRoutePtsFrac` so the van's
  current map fraction can be read back at any time (`routePointAt`'s
  fraction-space twin, or `projectToRoute`'s inverse via the last-taken node).
- On a wrong turn/timeout-default: call a new `rerouteFrom(currentFrac)` that
  re-runs `computeRouteProfile`/`renderGps`'s route-building block (extract it
  into a shared `buildRoute(from, to)` helper used by both `beginTravel` and
  `rerouteFrom`) with `from = currentFrac` instead of `ARC_PLACE`, rebuilding
  `roadProfile`, `gpsManeuvers`, `gpsRoutePts`(+`gpsRoutePtsFrac`), and the new
  `routeJunctions` in one go.
- **Progress re-anchoring.** `drive.progress` stays "0..1 along the CURRENT
  active route" — on reroute it's reset toward 0 relative to the new polyline,
  and `worldYForProgress` needs an anchor: add `anchorScrollY` (the `scrollY`
  at the moment of reroute) to `junctions.ts`/`road-transition.ts`'s zone
  builders, so `worldY = anchorScrollY + progress/PROGRESS_PER_SCROLL` — the
  van's screen position doesn't jump, only the route bookkeeping resets.
  (`road-transition.ts`'s current `worldYForProgress` assumes anchor 0, which
  is fine for the first route; this generalises it for the second.)
- Feedback: reuse `showRoadBanner` for a cheerful "Let's find another way!"
  beat (mirrors a real sat-nav's "recalculating" — legible and fun for a kid,
  not a failure state), then `redrawGpsRoute`/`updateGpsInstruction` refresh
  from the new maneuvers. No score/time penalty (see Design Decisions #7).
- The router always finds a path from wherever the van now is (falls back to
  a straight line even if disconnected), so a wrong turn can never strand the
  drive — it only ever produces a (possibly longer) valid route.

## Coupling the on-road view and the GPS dot

Today they're independently derived from the same scalar `drive.progress` but
via two different code paths that can silently drift (the original bug: GPS
said turn, road stayed straight). The fix is architectural, not a new sync
mechanism: **one `routeJunctions` list (+ one active polyline) drives both.**

- The render-side decision window test (`worldYForRow(...)` vs `zone.worldY`,
  driving whether the mouth is drawn/open and whether the tap prompt shows)
  and the GPS-side "which edge is next" (what `routePointAt`/`nextManeuver`
  walk along) both read the SAME `RouteJunction`/polyline state — there is no
  second, independently-advancing GPS clock. When the player's tap resolves a
  junction, that single event updates `roadConfig` (view) and the active
  polyline/maneuvers (GPS) together, in the same handler.
- Because `worldYForProgress`/`worldYForRow` (from `road-transition.ts`) are
  the shared conversion between the render world (`scrollY`) and the
  router/GPS world (`progress`), reusing them here (rather than reinventing a
  parallel timing system) is what actually guarantees agreement — it's the
  same reasoning the road-transitions plan already used for merge zones,
  applied to junction zones.

## Reuse, don't reinvent (no-crash guarantees already exist)

- **Turn flourish:** generalise `turnAndGo`'s rotate+reposition tween (currently
  forecourt-only, `_dir` discarded in `beginTravel`) into a `takeBranch(dir)`
  usable mid-route, not just at the start.
- **Road-type swap:** reuse `switchRoad`/`applyRoadSwitch` (or the banded
  `stepRoadConfig` once the road-transitions slice lands) for the branch's
  road class — no new swap mechanism.
- **Banner/toast:** reuse `showRoadBanner` for both "Left here!" prompts and
  the "let's find another way!" reroute beat.
- **Procedural zone maths:** `drawJunctionMouth` reuses the lay-by bulge/
  banded-row technique (`isOvertakingZone`, the lay-by plan's `layByBand`)
  rather than a new drawing primitive.
- **Collision safety with animals aboard:** a junction zone must guard
  overtaking the same way the road-transitions plan's merge-zone guard does
  (build step 7 there) — cancel `this.overtaking` on entering a junction
  window, never let a turn decision coincide with being out in the oncoming
  lane. Speed through the mouth is uncapped (it's cosmetic, not a hazard) but
  the take-branch flourish should hold `this.drive.gear` steady, not spike it.

## Build sequence (each step playable via `?ptvDemo=1`)

1. `driving/junctions.ts` (+ tests): `buildRouteJunctions`, `isChoice`
   tagging, `nextJunction`, `decisionWindowAt`. Pure — test against a couple
   of real Birchie routes from `birchie-graph.json` fixtures (same pattern as
   the existing `route-instructions`/`road-transition` tests) to confirm it
   correctly separates real forks from cosmetic bends.
2. `drawJunctionMouth` in `drive-render.ts`, behind a `?junctionDemo=1` dev
   flag — a scripted static zone at a fixed `scrollY` so the art/taper can be
   eyeballed and tuned with zero gameplay wiring (mirrors the road-transitions
   plan's step-3 `?mergeDemo=1` precedent).
3. Wire `routeJunctions` into `beginTravel` (built alongside `roadProfile`/
   `gpsManeuvers` from the same polyline) and draw the REAL next junction's
   mouth at its true world-Y in the travel loop — still auto-advance, no tap
   yet. This alone fixes "GPS says turn, road stays straight" even before
   player agency lands: pick a destination whose route has a real fork and
   watch the mouth open exactly as the banner turns urgent.
4. `showJunctionChoice()` prompt + tap-left/right/straight input inside the
   decision window; on a tap, `takeBranch(dir)` (generalised `turnAndGo`) +
   `switchRoad` to the branch's class. Sweeps (`isChoice: false`) untouched.
5. Soft-window gating + timeout default (straight-on) wired to the same
   `takeBranch` path a real tap uses — prove a distracted/no-input pass
   through a fork behaves exactly like an explicit "go straight" tap.
6. `rerouteFrom(currentFrac)` + `gpsRoutePtsFrac` retention + progress
   re-anchoring; wrong-turn and timeout-wrong-default both flow through it.
   Test by deliberately tapping the wrong way at a real fork and watching the
   GPS recompute.
7. Junction-vs-overtake guard (cancel `overtaking` on window entry, mirrors
   the road-transitions merge-zone guard).
8. Polish: banner copy ("Left here!", "Oops, let's find another way!"), sfx,
   tune window width / mouth taper / approach length against a handful of
   real routes; verify interplay with lay-bys and (once built) road-type
   transitions.
9. *(Later slice, explicitly deferred)* actually bending the lane paint
   through the turn / a fuller painted side-road stub — this slice's mouth is
   procedural-only, matching the lay-by precedent of "procedural now, real art
   later."

## Design decisions

_Settled (Marcus, 2026-07-12): #1 soft window (keep rolling); #2 timeout default
= go straight on; #3 cheerful reroute, no penalty. #4 procedural mouth, #5
demo-fork first, #6 filter to real-class forks, #7 zero consequence — taken at
the recommended defaults. All seven below now locked as recommended._


1. **Gate style at a decision junction:** hard-stop until tapped, vs a soft
   window that keeps rolling with a timeout default. **Recommend: soft
   window.** A hard freeze reads as the game breaking to an 8-year-old; a
   generous window with a gentle default is forgiving and never traps her.
2. **Timeout default direction:** go straight-on (matches "you did nothing,
   so you didn't turn") vs auto-follow the GPS-correct branch (never let a
   distracted tap go wrong). **Recommend: straight-on**, paired with the
   cheerful reroute — it's more honest to "real turning" and the reroute means
   it's never actually a problem.
3. **Wrong-turn feedback:** a cheerful audible "recalculating" reroute (real
   sat-nav-style, a fun beat) vs silent instant reroute vs blocking the wrong
   branch outright so it can't be taken. **Recommend: cheerful audible
   reroute** — let the wrong turn happen (exploration is fine, it's a game),
   never wall off player agency.
4. **Junction-mouth visual richness:** simple procedural tapered gap (reuse
   lay-by technique) vs a fuller painted side-road stub now. **Recommend:
   procedural for this slice** — matches the lay-by plan's "procedural now,
   real art later" precedent, keeps this already-largest slice's scope down.
5. **Where junctions first appear:** wire into live Birchie routes
   immediately vs a scripted demo fork first (`?junctionDemo=1`). **Recommend:
   demo-only fork first** (build-sequence steps 1–5), live graph wiring after
   the tap/gate/reroute loop is proven — mirrors both prior plans' sequencing.
6. **Which graph forks count as `isChoice`:** every degree>2 node the route
   passes (Birchie's graph is dense — this could fire on minor
   driveway/track stubs) vs only forks where a non-route edge is a "real"
   class (not a bare `track`/dead-end stub). **Recommend: filter to real-class
   alternatives** — pester the player only at forks that would actually go
   somewhere, tuned once eyeballed against live routes (same spirit as
   `smoothRuns` filtering graph noise for `road-transition.ts`).
7. **Consequence of a wrong turn:** zero consequence beyond a slightly longer
   drive, vs some cost (time, a disappointed NPC line, a score ding).
   **Recommend: zero consequence** — consistent with "gentle, never
   punishing"; the reroute beat is the whole payoff, not a penalty.
