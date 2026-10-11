# Porting the drive onto the rotating world — plan 2026-10-11

The spec is `docs/driving-rebuild-2026-10-11.md`; the proof is
`apps/game/public/admin/drive-spike.html`. This file says how the game's own
scene, `apps/game/src/scenes/PtvDriveScene.ts` (3,593 lines), gets from what it
ships today to that model without the game ever being unplayable in between.
It is a plan and nothing else. No code changed with it.

Read against `claude/crate-loading` at `ae2444b`. A bare line number (`:2293`)
is in `PtvDriveScene.ts`; everything else names its file. **Line numbers in the
old handover have drifted**: the `-rear` trap it puts at `:511` is now `:513-515`
(preload) and `:775` (the draw), and `VEHICLE_PARK_ANGLE` has moved from `:1105`
to `:134`. Trust these, at this commit, and nothing older.

Words used below:

- **The corridor** — today's travel renderer: a straight road drawn per screen
  row and scrolled down past a van that stays put (`drive-render.ts`).
- **The world** — the spike's model: the van pinned at 53.5% across and 59%
  down, the map's own roads drawn under it, the whole thing rotated so the
  route points up.
- **The model modules** — `route-path.ts`, `world-camera.ts`, `lane-motion.ts`,
  `road-gears.ts`, `ride-comfort.ts`, being extracted from the spike by another
  job. **None of them exists on any branch yet** (checked against every
  `origin/*` at the time of writing), so what this plan says they provide is
  read off the spike, not off them.

## 1. Inventory

Every responsibility the scene has, where it is, and what happens to it.
KEEP is untouched. RE-HOME keeps the behaviour but moves it, or changes what
drives it. REPLACE is done by the world instead. DELETE goes with nothing in
its place.

### Setting up

| Responsibility | Lines | Verdict | Why |
|---|---|---|---|
| The init contract (`PtvDriveInit`: destination, level, `returnTo`, `returnData`, `cargo`, `preloadAnimalIds`, `poorlyAnimalIds`, `collect`) | 222-275 | KEEP | GameScene calls it twice (`GameScene.ts:1992-2005`, `:2061-2072`). The world changes nothing a caller sends or gets back. |
| `init`, and the dev overrides `?dest`, `?level`, `?cargo`, `?sick` | 562-617, 637-680 | KEEP | Unrelated to how the road is drawn. `init` must also reset the world's state. |
| Self-loading art: fleet top-downs and their `-rear`s, traffic, decor, species, crates, GPS map, road graph | 490-560 | KEEP | The scenery job will add its own keys here. Missing files already fail softly (`:559`). |
| `create`: retina text, scene music, the root container, a guard that logs a render failure | 688-706 | KEEP | |
| `renderView`, the switch between phases | 730-764 | RE-HOME | The switch stays. `vanSizeForLane` (`:749-751`) sizes the van from the corridor's lane for *every* phase and goes when the corridor does. |
| `cleanup` | 708-718 | RE-HOME | Must also tear down the world's objects and its `update` hook. |
| `VEHICLE_SIZE`, width relative to Henry | 110-117 | KEEP off the road; RE-HOME on it | The picker, departure and arrival keep it. On the road the world sizes in metres (question 9). |
| `VEHICLE_SPEED`, a multiplier per vehicle on the gear's rate | 122-128 | RE-HOME | A decision already made ("Trikey crawls, Spark zips", `:3277`). It moves onto the world's metres-per-second gears; question 10 asks how it sits with the road-gear table. |
| `VEHICLE_PARK_ANGLE` | 130-140 | KEEP | Forecourt only. Its comment (`:130-133`) says Bea and Spark need a 180° flip; every value is 0. Stale comment, not this port's to fix. |
| `VEHICLE_HORN` and `playHorn` | 145-151, 3257-3259 | KEEP | The horn's sounds stay; where its button goes is question 1. |
| `makeVan`: rear sprite on the road, front in the bays, scaled by `img.width` | 769-786 | RE-HOME | The rear stays right: the world draws the van nose-up, and the rear top-down is the camera reference (`docs/fleet-canon.md` §3). The scale moves from the corridor's lane width (`:780`) to metres. |

### Before the road

| Responsibility | Lines | Verdict | Why |
|---|---|---|---|
| The picker: the fleet at true scale in bays, cones and unlock chips, Back | 1033-1177 | KEEP | Not the road. |
| `pickAndDepart` and `driveTogether` | 1186-1263 | RE-HOME | Unchanged, except that it ends by asking "Which way?" (`:1228`), which goes (next row but one). |
| The loading screen and its rules: `loadableCargo`, `renderLoading`, `afterLoadTap`, `changeBay`, `putIntoCrate`, `askForCrate`, `placeIntoBay`, `setOffFromLoading` | 1268-1586 | KEEP | Not the road. `setOffFromLoading` writes `drive.crateGrid` (`:1574`), which the world carries and does not read. |
| `renderSelect` and `makeVehicleCard`, the old card picker | 1588-1713 | DELETE | Nothing calls them. The only reference to either is `:1630`, inside `renderSelect` itself. |
| The departure forecourt (phase `parking`, after a load) and `pullOutOfBay` | 1723-1824, 2186-2203 | RE-HOME | Stays. Its "Let's go!" ends in "Which way?" (`:2201`), which goes. |
| "Which way? Left / Right" at departure, `showTurnChoice` and `turnAndGo` | 2221-2291 | DELETE | Spec, *steering is on rails*: "there is no junction decision". It was never a decision anyway: the answer reaches `beginTravel(_dir)` and is thrown away (`:2293`). |
| `beginTravel` and `animateVanEntry` | 2293-2314 | RE-HOME | The entry tween ends at the world's pin (0.535 w, 0.59 h) rather than at the corridor's 0.72 h (`:814`). `computeRouteProfile` is no longer needed here (see "Road follows the map"). |

### On the road

| Responsibility | Lines | Verdict | Why |
|---|---|---|---|
| `renderTravel`: the corridor, the van at 0.72 h, HUD, GPS, input, loop | 788-826 | REPLACE | The world. |
| The road drawn row by row, merge bands, the side-road mouth | 2433-2464 | REPLACE | Spec, *what was wrong*: "a straight corridor … the carriageway was 44px wide". The world draws the graph's own edges. |
| Road follows the map: `computeRouteProfile`, `profileRoadId`, `switchRoad` (a flash over the screen), `applyRoadSwitch` (re-lays out lanes and traffic), the auto-follow in the loop | 2324-2419, 3320-3323 | REPLACE | In the world the road under the van *is* the edge's class (spike `classAtS`), so a dual carriageway is wide where it is wide, with no flash and no re-layout. Spike, `step`: "following the road is not a swerve". |
| The road-name banner | 2421-2429 | RE-HOME | Saying which road she has joined survives (the spike's road chip does the same job). It fires when the class under the van changes. |
| Junction prompt: `updateJunctionPrompt`, `showJunctionChoice` (◀ ▶ on the verges), `resolveJunction`, `steer` | 2470-2527, 3012-3015 | DELETE | Spec: "the route steers itself". The GPS stays; choosing at junctions is a later tier and `junctions.ts` is kept for it (section 2). |
| `turnWorld`, a 90° rotation of `worldLayer` about the van, then a snap back to 0 and a respawn | 2536-2584 | REPLACE | The world never snaps back: it rotates every frame. The technique — one container rotated about the van's screen point (`:2554-2561`) — is the seam (section 3). |
| Scenery: eight random trees and hedges, recycled top to bottom | 2588-2608 | REPLACE | Spec, *still open*: placed from the child's map. The scenery job. |
| Roadside decor: random cones, signs, bollards, barriers | 2612-2626, 2640-2653 | REPLACE | The scenery job. |
| Fixed speed cameras: projected onto the route, spawned at their progress, flash in third gear | 887-892, 2630-2638, 3299-3317, 3563-3581 | RE-HOME | `CAMERA_PLACES` are map points, so in the world they are simply placed in it. What fires one is question 7. |
| Traffic: road-gated picking, spawning, recycling, lane-aware speeds, overtaking each other, the van's speed cap behind a slower vehicle | 2664-2819, 3394-3559 | REPLACE | The traffic job, against the spike's contract (`drive-spike/traffic.js`: `speedCap`, `laneBlocked`, `events`). |
| Shadows: two screen-space ellipses under every vehicle | 2725-2746 | REPLACE | Spec: "shadows are drawn in world space". The spike swings them with a fixed sun (`SUN`, `drawVan`). |
| Lane changes and overtaking into the oncoming lane: `moveLane`, `canOvertake`, `glideToLane`, `laneBlockedAt`, `oncomingBlockedAt`, `bumpBlocked` | 3017-3118 | REPLACE | `lane-motion.ts`. The spike has two lanes, ours and the overtaking side, and eases between them at 7 m/s of sidestep. |
| Lane tap zones, left and right halves of the screen | 2995-3008 | REPLACE | Spec, input table: hold anywhere to go, swipe to change lane. |
| Keyboard: arrows/A/D steer, up/down gear, R reverse, space handbrake, H horn | 2970-2993 | REPLACE | The spike's keys: space go, arrows lane, 1-3 gear, B handbrake. H for the horn survives if the horn does. |
| Gear stick: 3 / 2 / 1 / P / R slab on the right | 2913-2966, 3130-3144 | REPLACE | Spec: gears 1/2/3 say "how fast go is"; releasing stops. Part of the "~25% of screen" of slabs. Where gears live is question 1; whether P and R survive is question 6. |
| Handbrake: a toggle that drops into Park, blocks gear changes and says "Release the handbrake first!" | 3146-3223 | REPLACE | Spec: "slam on, for when she is about to hit something". The spike holds it while pressed. |
| `emergencyBrake`: jostle 15, screen shake, judder, "Hold on!" | 2867-2910 | RE-HOME | The jostle feeds `ride-comfort.ts`; the shake and popup are question 5. |
| Horn button | 3225-3254 | RE-HOME | Question 1. |
| HUD title pill "Practice Drive" | 2824-2835 | DELETE | Every drive is a real journey since GameScene started the scene (`GameScene.ts:1955-1957`), and the spec puts nothing over the world. |
| Road-type toggle button and `cycleRoad`, `ROAD_CYCLE` | 197, 2848-2853, 3120-3128 | DELETE | A demo for looking at road types; in the world the road is the map's. |
| Hint line naming the old controls | 2859-2864 | REPLACE | The controls it names are gone. |
| Back button | 2837-2846 | KEEP | |
| The drive loop: a 50 ms timer, px per tick, progress `+= rate * 0.0004` | 3263-3392 | REPLACE | The world needs a per-frame `update(time, delta)` in metres per second (spike `frame`/`step`). At 20 Hz a rotating world turns in visible steps (risk 6). |
| Arrival when progress reaches 1 | 3381, 2160-2183 | RE-HOME | Fires on `s >= route length` instead. `beginArrival`'s kill-everything guard (`:2178-2179`) exists because of `switchRoad`'s delayed re-layout; it is cheap and stays. |
| `cargoComfort` written by the handbrake (−15) and a speed camera (−6) | 2874, 3573 | REPLACE | `ride-comfort.ts` (spec, *two modes*). Note that it never leaves the scene: `finishArrival` sends `crateGrid` and not comfort (`:2144-2150`), and GameScene gives +1 for "the safe drive" whatever happened (`GameScene.ts:510-513`, `:662-673`). |

### The GPS

| Responsibility | Lines | Verdict | Why |
|---|---|---|---|
| The panel: the Birchie map, pins, draggable, clamped on screen | 835-869, 899-913, 931-941 | KEEP | Spec: "the GPS stays on screen". |
| The route: `routePolyline`, cumulative length, manoeuvres | 873-886 | KEEP | `road-router.ts` and `route-instructions.ts` are "already right" (spec). The guide line draws this same route. |
| Route line fading behind the dot, `routePointAt` | 944-967, 990-1004 | KEEP | Driven by `drive.progress`, which becomes distance over route length (section 2, `route-path.ts`). |
| Turn banner, "Turn left soon / now!" | 915-929, 969-988 | KEEP | On rails it narrates what the van is about to do. Its redraw hard-codes the box (`:987`) separately from where it is first drawn (`:916-919`); keep them in step if either moves. |

### Leaving, audio, saves

| Responsibility | Lines | Verdict | Why |
|---|---|---|---|
| The arrival forecourt, "Go inside" / "Lift her in", the collection load, `finishArrival` | 1847-2151 | KEEP | Not the road. `docs/collection-drives-2026-10-09.md` reuses all of it unchanged. |
| `exit` | 3585-3592 | KEEP | |
| Music (`walk`, "until a PTV track lands") and sound effects; `food_wrong` stands in for brake, bump, camera and a wrong turn | 695, 2524, 2875, 3113, 3174, 3565 | KEEP | No new sounds in this port. |
| Saves | none | KEEP | The scene writes nothing. GameScene saves before it starts the drive (`GameScene.ts:1985`, `:2059`) and after admitting a collected animal (`GameScene.ts:506`). |

### Asked about, and not in the scene

- **Mirrors and mirror moods.** `mirror-mood-sprites.ts` has no caller anywhere.
  The mirror PNGs are empty frames, "cockpit furniture" (handover
  `2026-10-10-accumulated.md:358-362`). Nothing to port.
- **The dashboard.** `dashboard-henry-ptv.png` is art with no code.
- **Fuel.** `fuelCost` exists (`packages/game-logic/src/crate-stacking.ts:225`,
  `:257-261`) and is shown only on the dead card (`:1680`). Nothing charges it;
  `economy` is accepted (`:226`) and never read.
- **Drive events** (hedgehog crossing, level crossing, traffic light, roadside
  animal). `drive-events.ts` has tests and no caller.
- **Weather.** Stored (`:566`, `drive-state.ts:105`), never used.

## 2. What the world needs from the old

| Module | Today | After the port |
|---|---|---|
| `road-router.ts` | GPS route, road-class profile, junctions | **Reused unchanged.** The world's route must be *its* path, weighted by road class (`CLASS_MULT`, `:28`). The spike runs its own unweighted Dijkstra (`drive-spike.html`, `shortestPath`), and the two disagree: for 2 of the 14 destinations, `pinebark-medical` and `sea-cliffs`, 19 of the route's nodes differ (measured, below). The router's polyline also includes the short stubs from each map point to its nearest node (`road-router.ts:189-190`); the spike's does not. |
| `route-instructions.ts` | GPS turns, camera placement | **Reused unchanged.** Its progress is aspect-corrected length (`:109-113`), which is proportional to the spike's metres (both scale `fx` by 1800/1121), so `s / length` of the same polyline is the same clock. |
| `birchie-places.ts` | A.R.C.'s anchor, destinations, camera spots | **Reused unchanged.** |
| `junctions.ts` | The fork prompt | **Kept for the later tier**, unused by the scene. `isChoice`, `side` and `atProgress` are what reading the GPS at junctions will need. `worldY` (`:105`) and `decisionWindow` / `inDecisionWindow` (`:125-133`) are the corridor's clock and become dead. |
| `drive-state.ts` | Gear, lane, comfort, crate grid, progress | **Feeds the new ones.** `crateGrid`, `progress`, `carriesAnimals`, `driveTypeFor` (also used by GameScene) stay. `Gear` with P and R, and `gearScrollRate` in px per tick (`:178-186`), give way to `road-gears.ts`. `NUM_LANES`, `clampLane`, `shiftLane` (`:42`, `:142-151`) are a three-lane placeholder and go dead. `jostleComfort` (`:164`) is the seed the spec names for `ride-comfort.ts`. |
| `road-config.ts` | Lanes, surface and divider per road type | **Feeds, then dead.** The world works from the OSM class (spike `ROAD_M`, `laneOffset`). The labels ("Thanet Way") may survive in the banner. |
| `road-transition.ts` | World-Y of merge zones | **Dead.** It exists to convert progress into the corridor's screen rows (`PROGRESS_PER_SCROLL`, `:21`, is the loop's `0.0004`). |
| `drive-render.ts` | Every corridor drawing | **Dead except `DRIVE_COLOURS`**, which `SupplyRunScene.ts:6` imports, so the file cannot simply be deleted. `isOvertakingZone` (`:162`) encodes the corridor's dashed/solid centre line every 440 px and goes with it. The procedural vehicle draws are fallbacks the traffic job may or may not want. |
| `traffic.ts` | The catalogue: kinds, sizes, weights, the seasonal bus | **Feeds the traffic job.** Its `relSpeed` is a fraction of the player's speed (`:8-9`), which the world, in metres per second, has to turn into absolute speeds. |
| `traffic-sim.ts` | Lane speeds, slow vehicles kept out of the fast lane | **Feeds the traffic job**, then dead. |
| `fleet-art.ts` | Sprite keys, beds, picker layout, real widths | **Reused unchanged.** `VEHICLE_WIDTH_M` (`:563`) and `LANE_WIDTH_M` 3.3 (`:590`) disagree with the spike's 2.4 m van in 5 m lanes; question 9. |
| `forecourt.ts`, `car-park.ts`, `crate-loading-view.ts` | Picker, car park, loading screen | **Reused unchanged.** |
| `drive-events.ts`, `mirror-mood-sprites.ts` | Nothing | **Untouched.** Candidates for later slices, not this one. |
| `@arc/game-logic`: crate loading, `VEHICLE_DEFS`, destinations, collection calls | Loading screen and arrival | **Reused unchanged.** The drive's inputs and outputs do not change. |

What each new module has to give the scene, as the spike does it:

- `route-path.ts` — the router's polyline in metres, with `atDistance(s)`
  (position and heading), `classAt(s)`, `laneOffset(lane, s)` and the length.
- `world-camera.ts` — the camera's heading, aimed 20 m ahead and eased at 3.4
  per second, so a 55° corner arrives as about 1° per sample (spec, *the one
  thing the spike found*); the zoom; the van's small angle in the frame.
- `lane-motion.ts` — the lane she asked for, the eased lateral offset, and the
  split between her swerve (counted) and the road moving under her (free).
- `road-gears.ts` — speed per gear, the gears that suit each road, and what
  getting it wrong is called.
- `ride-comfort.ts` — jostle from swerving and hard deceleration, settling while
  she drives smoothly, and the 26 m/s² self-stop that counts as rough driving.

## 3. Seams

### Where the world plugs in

One branch of `renderView` (`:761-763`) and one loop. Everything before travel
(picker, loading, departure forecourt) and after it (`beginArrival` onwards) is
untouched. Between them the contract is small: in, `vehicleId`, the
destination, `drive`; out, `drive.progress`, comfort, and a call to
`beginArrival`.

The route must be built where the road is drawn, not in `beginTravel`. The
collection e2e jumps straight onto the road with `d.phase = 'travel';
d.renderView()` and never calls `beginTravel`
(`apps/game/e2e/collection-drive.spec.ts:165-170`).

### Five ways for a Phaser scene to draw a rotating world, measured

Measured for this plan: Phaser 3.80.1, the floor of `^3.80.1` in
`apps/game/package.json:21`; WebGL, a 390x844 canvas, the real 937-node graph, a 3.74 km
route from A.R.C. to Bramble Farm, the camera eased as the spike eases it, 600
frames after warm-up, CPU time per frame including `gl.finish()`. Roads only:
no scenery, no traffic. Headless Chromium 1194 with SwiftShader on a 2.1 GHz
Xeon, then the same at 4x CPU throttle as a rough stand-in for a phone. The
harness lives in this session's scratchpad and is not committed. **These
figures rank the options; they are not a phone's frame times.**

| Option | p50 | p95 | worst | 4x p50 | 4x p95 | 4x worst |
|---|---|---|---|---|---|---|
| **A. One container rotated per frame; the road re-stroked each frame from the edges near the van** | 0.9 ms | 1.6 | 14.2 | 1.6 | 7.6 | 11.4 |
| B. One container rotated per frame; the whole map stroked once into one Graphics | 28.4 | 51.5 | 76.3 | 95.8 | 134.8 | 218.0 |
| C. One container rotated per frame; the road baked lazily into 512 px tile textures | 0.1 | 1.1 | 12.2 | 0.3 | 2.2 | 54.3 |
| D. B drawn into a screen-sized RenderTexture each frame | 35.2 | 53.1 | 78.1 | — | — | — |
| E. The spike's own Canvas-2D drawing into a CanvasTexture, uploaded each frame | 5.3 | 9.0 | 24.9 | 15.9 | 29.5 | 50.6 |

What the numbers say:

- **Phaser does not cache a Graphics.** Its WebGL renderer turns every stroke
  into triangles again on every frame, so a Graphics holding the whole map (B)
  costs 28 ms whether or not anything in it changed. A RenderTexture of it (D)
  pays the same and adds a copy. Both are out.
- **Running the spike's drawing code unchanged (E)** is the tempting shortcut,
  because the scenery and traffic modules are written against a Canvas-2D `ctx`
  (`drive-spike/traffic.js`, `draw(ctx, traffic, view)`; `drive-spike/scenery.js`,
  `drawGround`, `drawObjects`). It is already at 15.9 ms at 4x with roads
  alone, before a single tree. Out.
- **Tiles (C)** are the cheapest per frame, but a tile costs 0.8 ms to bake
  (2.6 ms at 4x), the first frame bakes about 30 of them (54 ms at 4x), and
  whether their edges show a seam when rotated is untested.
- **A** is cheap, simple, and the spike's own approach (`drawRoads`: about 970
  edges culled by distance each frame).

**Recommendation: A.** One `Container` holds the world in metres; every frame
it is translated, rotated and scaled so the van's world point lands on the pin.
Roads are one `Graphics` inside it, cleared and re-stroked from the edges near
the van. Scenery and traffic are `Image`s inside it, which cost a transform
each and nothing more. The van, its shadow and the HUD sit outside it. This is
the technique the scene already uses for its 640 ms junction turn (`:2554-2561`),
made permanent. Keep C in reserve for the day scenery pushes A over budget on a
real phone. No custom pipeline: nothing measured needs one, and the game is
`Phaser.AUTO` (`main.ts:131`), which can fall back to Canvas, where a WebGL
pipeline draws nothing.

### What follows from A

- **The scenery and traffic jobs have to hand back state, not drawing.** Their
  spike contracts end in `draw(ctx, …)`, which Phaser cannot call except
  through option E. The scene needs positions, headings, kinds and sizes in
  metres, and makes the Phaser objects itself.
- **Visual checks need real Chrome.** The in-app browser draws Phaser's WebGL
  canvas blank (handover `2026-10-10-accumulated.md:429-430`). Use Playwright
  with `chromium.launch({ channel: 'chrome' })` (`:434-436`). This cloud
  container has no Chrome channel, only the bundled Chromium, which is what the
  figures above were taken with.

## 4. Order of work

Each step ships alone and leaves the game drivable from the map to the arrival
plaque. "Depends" marks a step that waits on another job.

Every step is checked with `pnpm --filter @arc/game test`, `pnpm --filter
@arc/game-logic test`, the type check, and `apps/game/e2e/collection-drive.spec.ts`
in real Chrome at 812x375 and 820x620. That spec and
`apps/game/src/__tests__/collection-wiring.test.ts` read the scene's private
names (`phase`, `vehicleId`, `renderView`, `cargo`, `collect`, `container.list`;
regexes over `setOffFromLoading` and `beginCollectionLoad`), so a step that
renames any of them updates the test in the same commit.

1. **Delete the dead card picker** (`:1588-1713`). Check: nothing references
   `renderSelect` or `makeVehicleCard`.
2. **Remove "Which way?" at departure** (`:2221-2291`). The van pulls out of
   the picker or the forecourt and the road follows, as it does when the
   question is answered today, since the answer is discarded (`:2293`). Check:
   picker → road and loading → forecourt → road in real Chrome, with reduced
   motion on and off (`driveTogether` is a `stateTween`).
3. **Remove the junction prompt** (`:2470-2527`, `:3012-3015`, the mouth at
   `:2444-2452`). The corridor then runs straight through every fork, which is
   what doing nothing already does (`:2474`). Check: a full drive to `woodland`
   arrives with no prompt shown.
4. **Move the loop onto `update(time, delta)`**, still the corridor, speeds in
   per-second terms. Check: the time to arrival at a fixed gear is the same as
   before, within a frame, measured in real Chrome.
5. **The world, behind `?drive=world`**, roads only. The van pinned at 0.535 /
   0.59, the camera eased, the route from `road-router.ts`, hold-to-go and the
   keyboard, the GPS dot on `s / length`, arrival at the end of the route. The
   corridor stays the default. The existing gear, handbrake and horn panels
   stay as they are until question 1 is answered. **Depends on** `route-path.ts`
   and `world-camera.ts`. Check: unit tests that the world's polyline is the
   GPS's for all 14 destinations and that the camera turns no more than ~1° a
   frame through the worst corner; screenshots at 390x844, 820x620 and 812x375;
   the frame-time harness of section 3 run inside the real scene.
6. **Lanes and comfort.** Swipe to change lane, the handbrake held rather than
   toggled, the self-stop, jostle written to `drive.cargoComfort`. **Depends
   on** `lane-motion.ts` and `ride-comfort.ts`. Check: unit tests that the road
   widening under the van adds no jostle and that a lane change does.
7. **Traffic.** **Depends on** the traffic job. Carry these decisions over from
   the scene: specials by road (the leader on a single carriageway, the
   seaside bus only in season, `:2664-2673`); slow vehicles kept out of the fast
   lane (`traffic-sim.ts:47-48`); with animals aboard she never swerves into
   another vehicle (`:3037-3042`); no overtaking across a solid line (`:3053`).
   Check: holding "go" into a slower vehicle for a minute never closes the gap
   to zero, read from the scene's state rather than a screenshot.
8. **Scenery and world-space shadows.** **Depends on** the scenery job. Check:
   frame times again; if A is over budget on a phone, switch the road to tiles
   (C) in this step and look for seams.
9. **Road gears.** The per-road gear feedback. **Depends on** `road-gears.ts`
   and on question 7.
10. **Controls off the carriageway**, once question 1 is answered.
11. **Make the world the default.** Only after Marcus has driven it on a phone.
    `?drive=corridor` keeps the old one for one release.
12. **Delete the corridor**: the scene's corridor code, `road-transition.ts`,
    all of `drive-render.ts` but `DRIVE_COLOURS`, the corridor's parts of
    `junctions.ts`, and `traffic-sim.ts` and `road-config.ts` if nothing reads
    them by then. Check: the import graph, the type check, every test.

Steps 1-4 depend on nothing and can start now.

## 5. Open questions for Marcus

Recommendation first. None of these is answered by the code or the docs.

1. **Where do gear, handbrake, lane and horn controls live?** (spec, still open)
   (a) **Recommended:** a strip along the bottom edge. The van sits 59% down,
   so the 41% below it is road already driven, the least useful view to cover.
   (b) Small floating buttons at the screen's sides, over the verges.
   (c) Gear chosen before setting off, with only the handbrake on screen.
   And does the horn stay?
2. **ANSWERED 2026-10-11: zoom.** The camera eases out for the dual carriageway, and the zoom also follows speed and place; see the spec's *Decided later the same day*. The narrow trial is gone from the spike. Was: **The dual carriageway: zoom or narrow?** (spec, still open) No
   recommendation from the code: steps 5-8 support both behind one setting, as
   the spike does. One fact to weigh: zoom changes the van's size on screen,
   and the reference "keeps its car one size throughout" (spike, `bigRoad`
   comment).
3. **ANSWERED 2026-10-11 by Marcus and Lily**: calming by touch, or water, a treat or a blanket by species and weather; and a squabble means rearranging the crates. See the spec. Was: **What does the driver do to help the animals at a roadside stop?** (spec,
   still open) (a) **Recommended:** the grid she loaded opens, with each
   animal's face (the loading screen draws them already, `gridFace` in
   `crate-loading-view.ts:1367`), and she taps the unsettled ones to calm them.
   (b) She waits while they settle, shown in a mirror (the frames are painted,
   unused). (c) Something you and Lily have in mind.
4. **Landscape.** The game runs landscape on phones (the e2e drives at 812x375).
   The spike was measured portrait, capped at 430 wide. At 812x375 the van's
   pin at 59% down leaves 221 px, 10 m, of road ahead: 0.8 s in second gear,
   against 1.7 s on a 390x844 portrait screen. (a) **Recommended:** in
   landscape, pin the van lower and zoom out until at least the portrait's
   view ahead shows. (b) Ask for the phone to be turned for the drive. (c)
   Accept less road ahead.
5. **Reduced motion.** The world rotates continuously; the motion setting
   (`lib/motion-preference.ts`) exists for exactly the children this is for.
   (a) **Recommended:** the rotation stays, because the road bending *is* the
   information, but the screen shake (`:2878`), the judder and the full-screen
   white flash of a speed camera (`:3567`) go. (b) A north-up map with the van
   turning instead: a second renderer, which `ui/tween.ts:33-35` rules out on
   principle.
6. **Do Park and Reverse survive?** The spec's controls have neither; today
   both are on the stick (`:2917`), Reverse "for negotiating an obstacle"
   (`drive-state.ts:13-16`). (a) **Recommended:** drop both: releasing is
   stopping, and nothing on rails needs to back up. (b) Keep them.
7. **Speed cameras.** Today one flashes if she passes it in third gear,
   whatever the road (`:3299`). The road-gear table now says what is too fast
   where. (a) **Recommended:** a camera fires on "too fast for this road". (b)
   Third gear, as now. (c) Drop the cameras; the road-gear feedback covers it.
8. **Which drive is the delivery race?** A supply trip today goes through this
   scene with the shelter's animals as cargo (`GameScene.ts:1985-1990`), then
   opens `SupplyRunScene` on arrival (`GameScene.ts:536-541`). `carriesAnimals`
   is never false (`:563` does not set it). **Recommended:** decide before the
   delivery branch of `ride-comfort.ts` is wired; until then every drive is the
   animals-aboard mode, as now.
9. **How big is each vehicle on the road?** The spike draws every vehicle 2.4 m
   wide in 5 m lanes. The fleet's own widths run from 0.75 m (Trikey) to 2.30 m
   (Big Tilly) against 3.3 m lanes (`fleet-art.ts:563-569`, `:590`). (a)
   **Recommended:** keep their true relative widths with Henry at the spec's
   13.5% of the screen: Trikey about 5.8%, Big Tilly about 17.7%. (b) Every
   vehicle the same size on the road.
10. **Speed per vehicle.** Trikey is 0.5 of every gear (`:123`). On a dual
    carriageway, where first gear is "too slow", is she too slow in every gear?
    (a) **Recommended:** Trikey does not use dual carriageways; her routes
    avoid trunk roads. (b) The table judges her by her own speeds. (c) Keep the
    multiplier and let her be beeped at.
11. **The guide line.** It is switchable (spec). Which way does it start, and
    who switches it? (a) **Recommended:** on by default, switched from the same
    settings as the motion preference, so a parent can set it. (b) A switch on
    the driving screen itself.
12. **When she cannot change lane** (traffic there, a solid line), today the van
    leans towards it and a sound plays (`bumpBlocked`, `:3112-3118`); the spike
    simply refuses. (a) **Recommended:** keep the lean and the sound. (b) Refuse
    silently.

## 6. Risks

1. **Graphics are re-drawn every frame.** One Graphics of the whole map costs
   28 ms a frame (96 ms at 4x); measured in section 3. Mitigated by culling (A)
   and, if needed, tiles (C).
2. **The model is being implemented twice.** The tunnel already is, and "the
   game runs the copy" (handover `:89-90`; confirmed in
   `docs/testflight-and-gap-plan-2026-10-10.md:68`). Here the spike's JS, the TS
   modules and the corridor will all exist at once, and the spike's router
   already disagrees with the game's for 2 of 14 destinations. Step 5's test
   pins the world's route to the GPS's; step 12 removes the corridor; the spike
   should be marked superseded once the modules land, or fixes will go to the
   wrong copy.
3. **Landscape.** 10 m of road ahead at 812x375 (question 4). Unmeasured in the
   spike, which caps its width at 430 px (`resize`).
4. **The spike looks sharper than the game will.** The spike draws at up to 2x
   device pixels (`resize`); the game's canvas is `Phaser.Scale.RESIZE` at 1x
   (`main.ts:133-141`), with only text made retina (`:691`). A screenshot of the
   spike is not evidence of how the road will look in the game.
5. **Pointer contention.** "Hold anywhere" competes with the draggable GPS
   panel, which takes the pointer at depth 60 (`:844`, `:933-941`), and with
   Back. A hold that starts on the GPS drags the GPS instead of going.
6. **The 20 Hz loop.** The corridor moves every 50 ms (`:3267-3269`). A world
   rotated at that rate steps every third frame. Step 4 moves the loop first, on
   its own, so the timing change cannot be confused with the renderer change.
7. **Reduced motion is bypassed today.** The scene calls `this.tweens.add` 22
   times and shakes the camera (`:2878`), where `ui/tween.ts:5-10` says every
   animation should go through `stateTween` or `decorativeTween`. The world has
   to be designed against the motion preference rather than retro-fitted.
8. **Comfort has nowhere to land.** `cargoComfort` never leaves the scene
   (`:2144-2150`) and the arrival rewards a "safe drive" regardless
   (`GameScene.ts:662-673`). Until question 3 and question 8 are answered, the
   whole consequence model of the spec is computed and thrown away.
9. **Painted light rotates with the world.** The fleet is painted lit from one
   side (spec, *why top-down*). The van turns only a few degrees, but traffic
   turns fully with the road, and oncoming vehicles are drawn from their front
   sprites (`:2786-2792`), the views `docs/fleet-canon.md` §3 found to be the
   wrong camera. Thirty-one traffic sprites are still claymation
   (`fleet-canon.md` §6).
10. **Tests reach into the scene.** Step 5 must keep `phase`, `renderView`,
    `vehicleId`, `cargo`, `collect` and a flat `container.list` working, or
    change `collection-drive.spec.ts:165-217` with it.
11. **Tile bakes stutter, if tiles are needed.** 54 ms on the first frame at 4x
    (section 3). Bake during the departure, before the road is shown.
12. **Old line numbers lie.** The handover's `:511` and `:1105` have both moved,
    and `VEHICLE_PARK_ANGLE`'s own comment contradicts its values (`:130-140`).
    Anything this plan cites is true at `ae2444b` only.
