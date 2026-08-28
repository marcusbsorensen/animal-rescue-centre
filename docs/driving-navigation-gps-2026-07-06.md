# PTV navigation + GPS — design & plan (2026-07-06)

Marcus's requirements (2026-07-06): the PTV drive must let you **turn corners at
junctions, negotiate roundabouts, and park at the destination**, guided by a
**mini GPS screen** that routes precisely over the **Birchie vector map** (the
real geography, fields to sea).

This turns the drive from an endless straight road into **route navigation
across Birchie**. It's the largest single feature in the driving engine.

## Data we already have (verified)

- **`apps/game/public/admin/scene-assets/birchie-map/birchie-roads.svg`** — an
  OSM-derived road network. viewBox `0 0 1800 1121`, **1,417 `<path>`s**, tagged
  with `data-name` (e.g. "Canterbury Road"), `data-ref` (e.g. "A28"), and
  `data-cls` (`trunk` / `residential` / `footway` / gardens / grass). Routable.
- **`DESTINATIONS`** (`destinations.ts`) each carry `mapX`/`mapY` percentages
  (ARC 50,68; Bramble Farm 22,52; Cove Harbour 14,82; …). Every mission has a
  real endpoint on the map.
- The existing `map.html` renders this world with POI pins — reference for the
  GPS look.

## The architectural fork (needs Marcus's call)

How do **corners and roundabouts** render, given the drive is strict top-down?

- **A — Discrete turn events (recommended).** Keep the current straight-scroll
  as the "cruise". At each junction the GPS says "turn left"; the player steers
  and the whole world **rotates 90° over ~1s** (like the car-park exit turn),
  then resumes cruising in the new heading. A roundabout is a small dedicated
  view: a circular road you go around and take the Nth exit (GPS-guided). Arrival
  is a **parking interaction** (the car-park start, reversed). Reuses everything
  built; each turn is a bounded transition. Buildable in slices.
- **B — Continuous curving world.** The van drives a true 2D path on the map;
  the world translates/rotates continuously through bends and roundabouts. Most
  immersive, far the hardest (path-following camera, curved-road rendering,
  physics). High effort, high risk, hard to verify.

Recommendation: **A**. It delivers real corners/roundabouts/parking and a precise
GPS without a physics rewrite, and each piece is a bounded, testable slice.

## Route model (both options share this)

1. **Road graph.** Parse `birchie-roads.svg` once into nodes (junctions) + edges
   (road segments, with name/ref/class). Build offline into a JSON the game loads
   (a `tools/build-road-graph.ts`), so we don't parse 1,417 paths at runtime.
2. **Routing.** Shortest path ARC(mapX,mapY) → destination(mapX,mapY) on the
   graph (prefer trunk/A-roads, like real sat-nav). Pure + unit-testable.
3. **Instruction list.** Fold the route into driving beats: `straight(dist)`,
   `turn(left|right, road-name)`, `roundabout(exit-n, road-name)`, `arrive`.
   Drives both the GPS ("Turn left onto Canterbury Road") and the scene events.
4. **GPS overlay.** A corner mini-map: the Birchie map, the route highlighted,
   a moving position dot, and the next instruction. "Precise" = positions come
   straight from the graph/route.

## Phased build (each a shippable slice, verifiable by Marcus)

1. **GPS mini-map overlay (static).** Render the Birchie map small in a corner
   with ARC + the chosen destination pinned and a straight route line + a
   position dot that advances with `drive.progress`. No routing yet — proves the
   overlay + coordinate mapping. *(Most self-contained; good first slice.)*
2. **Road graph + routing.** `build-road-graph.ts` → graph JSON; pure router
   ARC→destination; GPS shows the real route polyline. Unit-tested.
3. **Instruction list + GPS turn prompts.** Turn-by-turn text + the "next turn"
   banner, synced to progress.
4. **Junction turns in the drive.** The 90° world-rotate turn event at each
   junction, triggered by the route; steer left/right to comply.
5. **Roundabouts.** The circular roundabout view + take-the-Nth-exit.
6. **Destination parking.** Arrival parking interaction (car-park start,
   reversed) — reverse/handbrake into the bay; ends the mission.

## Risks / notes

- **Can't self-verify visually** (the Phaser harness won't render the canvas for
  me). Every slice needs Marcus's eyeball; I'll keep logic pure + unit-tested and
  lean on that + his testing.
- **Turn rendering feel** (option A's 90° rotate) is the make-or-break — prototype
  it against a placeholder before polishing, same as the car-park turn.
- **Collision-safety still holds** on every navigation route with animals aboard
  (never an actual crash) — turns/roundabouts must also be collision-safe.
- Scope: this is 6 slices; realistically several sessions. The GPS overlay
  (slice 1) is the natural place to start and de-risks the coordinate mapping.
