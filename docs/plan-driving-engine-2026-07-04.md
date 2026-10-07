# Implementation plan — Real-time PTV driving engine in Phaser

> Status: Implementation scoping, 2026-07-04. Turns the approved
> [`drive-hybrid-camera-2026-05-19.md`](drive-hybrid-camera-2026-05-19.md)
> proposal into a concrete, sequenced build. Grounded in the current code,
> not the stale status docs. Scope is the **PTV drive only** — Supply Runs
> stay arcade, Depot is untouched.
>
> **Progress check, 2026-10-07 (commit `6869c50`).** Slice 1 is built and has
> grown past its brief. Slice 6 is partly built. Slices 2 to 5 are not built.
> §0 carries both dates; each slice in §2 has a status line; §1 notes where the
> built files differ from the plan. The plan text is otherwise unchanged.

---

## 0. Where the code actually is today (verified 2026-07-04, rechecked 2026-10-07)

On 2026-07-04 the driving system was heavily *designed and mocked* and almost
nothing was a real Phaser scene. The second column is that snapshot; the third
is the recheck on 2026-10-07. "Built, not wired" means code and tests exist and
no game code calls it.

| Layer | 2026-07-04 | 2026-10-07 | Path |
|---|---|---|---|
| **Crate-stacking logic** | ✅ Built, exported from game-logic index, has tests | **Built, not wired.** 32 test cases pass. Exported by `export * from './crate-stacking'` in `packages/game-logic/src/index.ts`. No file in `apps/game/src` calls it, except that `PtvDriveScene` reads `VEHICLE_DEFS` for the vehicle picker. The matrix has 8 species (hedgehog added 2026-07-04) | `packages/game-logic/src/crate-stacking.ts` |
| **Charms logic** | ✅ Built (unlock rules, equip, per-vehicle defaults), wired into GameScene charm events | **Built and wired**, unchanged: `GameScene.fireCharmEvent` and `openCharmSelectOverlay` | `packages/game-logic/src/charms.ts` |
| **Mirror-mood sprite lookup** | ✅ Built (pure path lookup) + PNGs on disk | **Built, not wired.** No file imports `mirror-mood-sprites.ts`. 28 PNGs (7 species × happy, neutral, stressed, sleeping) plus `index.json`; there is no hedgehog set | `apps/game/src/driving/mirror-mood-sprites.ts`, `apps/game/public/assets/driving/mirror-moods/*.png` |
| **Map destinations** | ✅ Built (`DESTINATIONS`, incl. PTV kinds like `vet-general`, `training-*`, `pet-show`) — but "Drive here!" only toasts | **Built and wired.** "Drive here!" posts `drive-to` and `GameScene.driveTo` starts `PtvDriveScene` (since commit `b1c0935`, 2026-09-04) | `packages/game-logic/src/destinations.ts` |
| **Pre-drive mockup** (vehicle pick + crate-load grid + adjacency badges) | 🟡 HTML/CSS mockup only, 897 lines, **not mounted anywhere** | **Mockup, mounted nowhere** (now 891 lines; no entry in `InGameOverlay.ts`). Its vehicle-pick half was rebuilt natively as the `select` phase of `PtvDriveScene`. The crate-load grid half has no native counterpart | `apps/game/public/admin/pre-drive.html` |
| **Cockpit mockup** (per-vehicle painted cab, windscreen, rear-view mirror w/ cargo grid + charm, hedgehog-sign warning, mode-ptv/supply switch, speed classes) | 🟡 HTML/CSS/JS mockup, 2613 lines, **not mounted anywhere** | **Unchanged.** 2613 lines; no file in `apps/game/src` references it | `apps/game/public/admin/cockpit.html` |
| **Drive overlay** (3-stage CTA → drive → arrival, the "slice C" vet-run) | ✅ **Live** — mounted by `GameScene.openDriveOverlay()`, drives the scripted first vet-run | **Built, no caller since 2026-09-04** (the comment on `openDriveOverlay` says so). Heal opens the map instead, and the rewards moved to `GameScene.rewardSafeDrive`. Its page is still listed in `InGameOverlay.ts` | `apps/game/public/admin/drive-overlay.html` |
| **Charm-select overlay** | ✅ Live, mounted by `GameScene.openCharmSelectOverlay()` | **Unchanged**, built and wired | `apps/game/public/admin/charm-select.html` |
| **Supply Run** (pseudo-3D, cargo-free) | ✅ **Live, real Phaser scene** — the pattern to mirror | **Unchanged.** `SupplyRunScene` is in the scene list in `apps/game/src/main.ts` | `apps/game/src/scenes/SupplyRunScene.ts` |
| **PTV top-down travel mode** | ❌ Does not exist in any form | **Built and wired.** `PtvDriveScene` (first commit `eb0c8f6`, 2026-07-05) runs the phases `select` → `parking` → `travel` → `arrival`. It carries at most one passenger and no crates | `apps/game/src/scenes/PtvDriveScene.ts` |
| **PTV cab/windscreen event mode as a Phaser scene** | ❌ Only the HTML mockup exists | **Unchanged.** `PtvDriveScene` has no cab phase and its header says "No cab/events/cargo yet". The event model `drive-events.ts` is built and tested, and only its test file imports it | `apps/game/src/driving/drive-events.ts` |
| **Camera-dive transition** | ❌ Does not exist | **Unchanged.** Does not exist | — |
| **Drive state** | Planned to hold `grid: CrateGrid` (§1) | **Built without a grid.** `DriveState` holds `vehicle: string`, `driveType`, `destinationId`, `lane`, `gear`, `cargoComfort`, `weather`, `progress` and `carriesAnimals` | `apps/game/src/driving/drive-state.ts` |

**Key correction to the stale docs (2026-07-04):** `extracted-driving-spec.md` says "no PTV
exists yet." That was already only half-true — the crate-stacking *engine*,
charms, mirror moods and destinations were all built and tested; what was
missing was the **Phaser presentation layer** (top-down travel + cab events +
transition) plus the pre-drive loader wiring. This plan builds that layer.
_Update 2026-10-07: top-down travel is now built (`PtvDriveScene`). Still
missing: cab events, the camera-dive transition, and the loader wiring that
would feed a `CrateGrid` into the drive._

**Two overlay/scene conventions exist in the codebase — we choose between them:**
1. **HTML iframe overlay** mounted over a running scene via
   `mountInGame(page, handlers, initPayload)` in
   `apps/game/src/game-overlay/InGameOverlay.ts`. Used by drive-overlay,
   tunnel, charm-select, arrival, map. Message protocol: iframe posts
   `{source:'arc-...', type, payload}` up; host posts `init` down.
2. **Native Phaser scene** registered in the scene list. Used by
   SupplyRunScene, DepotScene, etc.

The hybrid-camera drive **must be a native Phaser scene**, not an iframe: the
camera dive, the road scroll, and the shared-state carry across modes all
need per-frame control and the Phaser camera/tween system. The existing
mockups become **art/CSS reference and asset sources**, not the runtime.

---

## 1. Files to create / modify

### New files (Phaser scene + state)

| Path | Purpose |
|---|---|
| `apps/game/src/scenes/PtvDriveScene.ts` | The hybrid-camera drive scene. Owns both camera modes (top-down travel + cab event), the dive transition, the drive loop, and HUD. Mirror the structure of `SupplyRunScene.ts` (phase enum, `renderView`, drive timer, cleanup on shutdown). |
| `apps/game/src/scenes/PtvLoadScene.ts` *(or reuse pre-drive iframe — see §3)* | Vehicle pick + crate-stacking loading grid. Feeds a validated `CrateGrid` into `PtvDriveScene`. |
| `apps/game/src/driving/drive-state.ts` | Shared, serialisable PTV drive state that carries across both camera modes: `vehicle`, `grid: CrateGrid`, `driveType`, `destinationId`, `speedStep` (0–2), `cargoComfort` (0–100), `weather`, `events: DriveEvent[]`, `eventCursor`. Pure module, no Phaser import. |
| `apps/game/src/driving/drive-events.ts` | Pure event model + generator: `DriveEvent` type (`hedgehog-crossing`, `level-crossing`, `traffic-light`, `roadside-animal`, `car-wash`, `petrol-station`, `arrival`), placement along the route, and resolution → happiness/comfort/coin deltas. Consumes weather + destination distance. |
| `apps/game/src/driving/drive-render.ts` *(optional)* | Top-down road + lane + marker rendering helpers, so `PtvDriveScene` stays readable. Analogous to the road-draw block inside SupplyRunScene. |
| `packages/game-logic/src/__tests__/drive-events.test.ts` | Unit tests for event generation + resolution deltas (deterministic with a seed). |

_Built versus planned, 2026-10-07:_ `PtvDriveScene.ts`, `drive-state.ts`, `drive-events.ts` and `drive-render.ts` exist at the paths above. `PtvLoadScene.ts` was not created: the vehicle-pick half was built inside `PtvDriveScene` instead. `drive-state.ts` has no `grid`, `speedStep`, `events` or `eventCursor`; it carries the fields listed in §0. The events test is at `apps/game/src/driving/__tests__/drive-events.test.ts`, not under `packages/game-logic`.

### Files to modify

| Path | Change |
|---|---|
| `apps/game/src/scenes/GameScene.ts` | (a) In the map handler (currently line ~1186, `if (action === 'drive-to')` → toast), replace the "coming soon" toast with `this.scene.start('PtvDriveScene', { destinationId, driveType, animals, economy, level, weather })`. (b) Add `openPtvLoadOverlay()` if PtvLoadScene is an iframe (mirror `openTunnelOverlay`/`openCharmSelectOverlay`). (c) On drive completion, read back `updatedEconomy` / `updatedAnimals` from the registry (existing pattern at lines 220–244) and apply arrival-happiness deltas + fuel spend. (d) Fire charm events `drive-completed`, `drive-completed-with-comfort`, `first-rewilding-drive` etc. via the existing `fireCharmEvent` helper. |
| `apps/game/src/main.ts` (scene registry) | Register `PtvDriveScene` (and `PtvLoadScene` if native) in the Phaser scene list. |
| `apps/game/src/game-overlay/InGameOverlay.ts` | Only if we keep pre-drive as an iframe: add `'pre-drive'` to `InGamePage`, `PAGE_URLS`, and `'arc-pre-drive'` to `VALID_SOURCES`. Otherwise no change. |
| `packages/game-logic/src/index.ts` | Re-export anything the scene needs that isn't already exported (crate-stacking is already `export *`; charms + destinations already re-exported). Likely no change. |
| `packages/game-logic/src/crate-stacking.ts` | Only if we wire the two TODO bonuses (sibling adjacency, recovering-animal-near-dog) — deferred, not required for MVP. |

_Built versus planned, 2026-10-07:_
- (a) Done, as `GameScene.driveTo`, which starts `PtvDriveScene` from the map's `drive-to` action.
- (b) Not done. `PtvLoadScene` does not exist.
- (c) Partly done. The return from a drive goes through `GameScene.rewardSafeDrive`: a flat +1 happiness for the one passenger, plus the `drive-completed`, `drive-completed-with-comfort` and `first-vet-run` charm events. No arrival-happiness delta and no fuel spend is applied.
- (d) See (c).
- `main.ts`: done. `PtvDriveScene` is in the scene list.
- `InGameOverlay.ts`: not done. There is no `'pre-drive'` page.
- `crate-stacking.ts` TODO bonuses: not done.

### Assets already on disk (no commission needed for MVP)

- `apps/game/public/assets/driving/mirror-moods/{species}-{mood}.png` — 28 PNGs for 7 species (cat, dog, bunny, fox, bat, parrot, snake). _Checked 2026-10-07: there is no hedgehog set, and hedgehog is the eighth species._
- `apps/game/public/assets/driving/dashboard-henry-ptv.png`, `vehicle-henry.png`, `cockpit-slots-henry.json` — Henry cab is asset-complete.
- `apps/game/public/assets/driving/charms/`, `mirrors/`, `vehicles/` — populated.

---

## 2. Build order — vertical slices (each independently playable/testable)

Each slice ends at a state you can boot the game to and *play*. Estimates are
in ideal focused sessions (Marcus's unit — a session ≈ a half-day of build).

### Slice 1 — Top-down travel mode, standalone (2–3 sessions)
**Goal:** boot straight into `PtvDriveScene`, see the PTV sprite on a gently
down-scrolling 3-lane top-down road, nudge it between lanes (snap, no
free-drag), change speed in 2–3 discrete steps, with a couple of dummy
decorative other-vehicles. No events, no cab, no cargo yet.

- Create `PtvDriveScene` with phase `travel`, a drive timer (copy the 50 ms
  `time.addEvent` loop from SupplyRunScene), top-down road render in
  `drive-render.ts` (bird's-eye, NOT the pseudo-3D projection — this is the
  easier flat-grid render the proposal explicitly wants, "same readable space
  as the tunnel grid").
- Lane snap via left/right + touch zones (reuse SupplyRunScene's touch-zone
  pattern but snap-tween like `changeLane`, 120 ms).
- Speed = discrete `speedStep` 0/1/2 mapped to scroll rate; a simple speed
  pill in the HUD.
- **Testable:** drive up and down the road, change lanes, change speed.

_Status 2026-10-07: built, and extended past the brief._ `PtvDriveScene` (commit `eb0c8f6`, 2026-07-05) has the top-down road, snap lane changes and decorative traffic. A vertical gear stick (R, 1, 2, 3, with Park) replaced the planned 0/1/2 `speedStep`. It also gained junction turns, the vehicle picker, the car-park departure and an arrival forecourt.

### Slice 2 — Event markers + the dive transition (2 sessions)
**Goal:** event markers (hedgehog icon, crossing-gate icon) appear ahead on
the top-down road; reaching one triggers a ~0.5 s camera *dive* into a
placeholder cab (solid panel + "leaning in" zoom), then pulls back out.

- Add `drive-events.ts` with a hardcoded 2–3-event route.
- Marker sprites scroll down with the road; on reaching the trigger line,
  pause the travel loop and run a Phaser camera zoom/tween into `phase: 'cab'`
  (placeholder graphics), then reverse on resolve.
- **Testable:** watch a marker approach, dive in, dive back out, continue.

_Status 2026-10-07: not built._ `PtvDriveScene` draws no event markers and has no dive. The event model (`drive-events.ts`) and its tests exist; the scene does not import it.

### Slice 3 — Cab windscreen tableau + one event type (3 sessions)
**Goal:** the cab view is a real painted tableau (static, no scroll) with the
**hedgehog-crossing** event fully playable: red warning triangle (visual-only
fallback per the accessibility rule), release-accelerator-and-brake input,
success = kindness bonus, fail = comfort drop + gentle narrator chide (never
hits the hedgehog).

- Port the cab art from `cockpit.html` (windscreen frame, dashboard, hedgehog
  sign + prompt CSS/SVG) into Phaser sprites/graphics. The Henry dashboard PNG
  already exists.
- Hedgehog resolution deltas live in `drive-events.ts`; wire to `cargoComfort`
  and a pending happiness delta.
- **Testable:** a full one-event drive, brake for the hedgehog, see the
  outcome.

_Status 2026-10-07: not built._ There is no cab phase. The hedgehog outcomes (comfort and narration lines) exist only in `drive-events.ts`, unconnected to a scene.

### Slice 4 — Rear-view mirror + charm dangle (cargo continuity) (1–2 sessions)
**Goal:** un-park the mirror feature. The cab shows the rear-view mirror with
the equipped charm dangling and the live cargo grid (mirror-mood sprites per
animal, mood driven by current comfort/adjacency).

- `mirror-mood-sprites.ts` + `getMoodSpriteUrl` already do the lookup; charm
  state comes from `store.equippedCharm`. Port the `.mirror` block from
  cockpit.html.
- **Testable:** load 2 animals, drive, watch their moods in the mirror.

_Status 2026-10-07: not built._ `mirror-mood-sprites.ts` and 28 mood PNGs exist. No file imports the lookup and no mirror is drawn. The drive carries at most one animal, so there is no cargo grid to show.

### Slice 5 — Pre-drive loader wired to the live crate-stacking engine (2–3 sessions)
**Goal:** the drive is entered from a real loading screen: pick vehicle → drop
animals into the grid → live ⚠/🚫 adjacency badges → Drive button gated by
`isDriveable` → hand the validated `CrateGrid` to `PtvDriveScene`.

- Reuse the crate-stacking engine (`previewPlacement`, `isDriveable`,
  `countStressedAdjacencies`) — all built and tested.
- Fastest path: mount `pre-drive.html` as an iframe overlay (it already has
  the vehicle cards + cargo grid + adjacency badge CSS) and post the grid up;
  slower/cleaner path: native `PtvLoadScene`. **Decision needed — see §5.**
- **Testable:** the full loop — load, validate, drive, arrive, see happiness
  applied.

_Status 2026-10-07: not built. Part of the vehicle-pick half exists in a different form._
- **Built:** the vehicle pick, natively, as the `select` phase of `PtvDriveScene` (cards from `VEHICLE_DEFS`, locked vehicles dimmed). Its "Let's go!" button moves straight from `select` to `parking`. §5 questions 1 and 2 were therefore answered for this half in favour of a native scene, not the iframe.
- **Not built:** the cargo grid, any call to `previewPlacement`, `isDriveable` or `countStressedAdjacencies`, a crate picker, and the hand-off of a `CrateGrid` to the drive. The engine functions this slice names are built and tested and have no caller in `apps/game/src`.
- **Still open:** where the grid lives (§5 question 1) and whether it is an iframe or a native scene (§5 question 2).

### Slice 6 — Arrival + integration into GameScene real events (1–2 sessions)
**Goal:** replace the map "coming soon" toast so adoption-delivery and
rewilding drives actually launch the PTV drive, apply
`calculateArrivalHappinessDelta`, spend fuel, fire charms, and return to the
Centre with the right ceremony (wistful vs jubilant per stress).

- Wire GameScene registry read-back + `fireCharmEvent` (patterns already
  present at lines 220–244 and 1412).
- **Testable:** trigger a real adoption from the game → drive → arrival letter
  reflects the drive quality.

_Status 2026-10-07: partly built._
- **Built:** the map launches the drive (`GameScene.driveTo`, since 2026-09-04); `PtvDriveScene` has an `arrival` phase and returns to `GameScene` with the arrival details; `GameScene.rewardSafeDrive` gives the one passenger a flat +1 happiness and fires the `drive-completed`, `drive-completed-with-comfort` and `first-vet-run` charm events.
- **Not built:** `calculateArrivalHappinessDelta` is not called, fuel is not spent, and the ceremony does not vary with how the animals travelled.

### Slices deferred beyond MVP (author when the core loop is solid)
- **Remaining event types** — level crossing, traffic light, roadside animal,
  car-wash, petrol-station refuel/breakdown, weather effects. Each is a new
  `DriveEvent` handler + a tableau. (~1 session each; car-wash/petrol are
  richer, ~2 each.)
- **Multi-vehicle + crate picker** (species-specific crates) — v2 of the loader.
- **Multi-stop adoption runs (L8+)**, collection drives (inbound), pet-show /
  training destinations.
- **Crate-stacking TODO bonuses** (sibling adjacency, dog-near-recovering).

**MVP = Slices 1–6.** Rough total: **11–15 sessions.**

---

## 3. Port vs build-fresh vs commission

| Element | Verdict | Notes |
|---|---|---|
| Crate-stacking rules, adjacency matrix, arrival happiness | **Port as-is (import)** | `crate-stacking.ts`, tested. Zero rework. |
| Charm unlock/equip/mood-wobble logic | **Port as-is (import)** | `charms.ts`, already wired to GameScene events. |
| Mirror-mood sprite lookup + PNGs | **Port as-is (import + assets)** | `mirror-mood-sprites.ts` + on-disk PNG set. |
| Destinations + world map | **Port as-is (import)** | `destinations.ts` already has PTV kinds. |
| Cab windscreen art, dashboard, mirror frame, hedgehog sign/triangle, charm-hanger | **Port the *design* (re-implement in Phaser)** | `cockpit.html` (2613 lines) is CSS/SVG — cannot iframe it into a scene that needs camera dives. Re-create as Phaser sprites/graphics using it as the visual spec. Henry dashboard PNG exists; other vehicles' painted dashboards must be **commissioned** (Manus/GPT — sprite continuity ⇒ GPT per memory). |
| Pre-drive vehicle-pick + cargo-grid UI | **Port either way** | Cleanest as an iframe (`pre-drive.html` is ready and self-contained, message-bus like the others); or re-build native. It does not need camera control, so the iframe path is viable here — unlike the drive itself. |
| Drive-overlay 3-stage vet-run | **Keep as the fallback/"slice C"** | Still the live scripted first-drive. Leave untouched; the new scene supersedes it only for real map-driven drives. Decide later whether to retire it. |
| Top-down road render | **Build fresh** | The bird's-eye flat render is *new* — SupplyRunScene's road is pseudo-3D projection, deliberately not what the proposal wants for travel mode. Reuse its *loop structure and touch zones*, not its road maths. |
| Camera-dive transition | **Build fresh** | No precedent in the codebase. |
| Painted windscreen tableaux per event (hedgehog, crossing, etc.) | **Commission fresh (GPT-Image)** | Static storybook paintings. Hedgehog first (MVP). |
| Cargo-comfort meter, speed pills | **Build fresh** | Small Phaser HUD; cockpit.html has the visual reference. |

---

## 4. Scope boundaries — confirmed against code

Per the proposal, and verified against `driving-systems.md` + the source:

- **PTV drive → the hybrid.** This plan builds it. ✔
- **Supply Runs → untouched arcade.** `SupplyRunScene.ts` stays exactly as
  is; it is cargo-free, neon/racing, pseudo-3D, and shares only the coin
  economy. We do **not** merge the two engines (the old spec's "reuses PTV
  engine" line is obsolete). ✔ Confirmed: SupplyRunScene imports only
  `supply-runs.ts`, never `crate-stacking.ts`.
- **Depot → unaffected.** `DepotScene.ts` / `depot-board.ts` are a stationary
  tap-collapse puzzle; nothing in this plan touches them. ✔
- **Shared, not duplicated:** vehicle-damage state (PTV jolts + Supply Run
  smashes feed the *same* damage model), Depot parts repair both, coins are
  one economy. Keep those shared; do not fork them.

One thing to watch: the **hedgehog-crossing rule is universal** (both PTV and
Supply Runs must brake). MVP builds it in PTV only; a later pass should lift
the hedgehog event into a shared module both scenes call, so behaviour can't
drift. Flag, don't build yet.

---

## 5. Open questions for Marcus (decisions needed before/at each slice)

_Status 2026-10-07: questions 1 and 2 are answered in code for the vehicle-pick half only (a native scene, not an iframe) and remain open for the crate grid. Question 7 stands: `GameScene.openDriveOverlay` has had no caller since 2026-09-04, and its own comment asks for a decision to delete or revive it._

1. **Crate-stacking placement (Slice 5).** Is the loading grid a **pre-drive
   loading screen** (proposal's leaning, and what `pre-drive.html` mocks), or
   does it surface as a **cab-view event**? Recommend: pre-drive screen —
   simpler, matches the mockup, keeps the cab for *journey moments*.
2. **Pre-drive: iframe or native scene?** Recommend iframe (`pre-drive.html`
   is ready, doesn't need camera control) to save ~1–2 sessions; native only
   if we want it visually unified with the Phaser drive.
3. **Events per trip / trip length.** Proposal suggests 2–3 events + arrival,
   ~60–90 s. Confirm for tuning `drive-events.ts`.
4. **Other road users — decorative or consequential?** Proposal floats a
   gentle comfort-drop for not yielding. Recommend: decorative for MVP,
   consequence deferred (keeps Slice 1 cheap).
5. **Speed steps.** 2 (slow/cruise) or 3? Proposal even floats "no fast at
   all" for caring cargo. Recommend 2 for MVP.
6. **Which vehicles at launch?** MVP is asset-ready for **Henry only**
   (dashboard PNG exists). Others need commissioned painted dashboards. Ship
   Henry-only, or commission Trikey + Bea up front?
7. **Retire drive-overlay.html?** Once the new scene handles vet-runs too, do
   we drop the scripted 3-stage overlay, or keep it as the gentle
   first-ever-drive tutorial? Recommend: keep for the very first drive, switch
   to the scene thereafter.
8. **Copy:** "Drive!" vs "Off we go!" (Lily-facing) — pending Marcus's ear.

---

## 6. Risks — where this can balloon (largest build in the game)

- **The cab tableaux are an art treadmill.** Each event type wants its own
  painted windscreen, and Marcus's Birchie world-building lists *many* future
  events (level crossing, traffic light, duckling trains, toads, car-wash,
  petrol station, per-weather variants). **Mitigation:** MVP ships exactly one
  (hedgehog). Treat every additional tableau as an explicit, separately-costed
  commission, not "part of the drive."
- **The camera-dive transition is the make-or-break, and it's novel.** The
  proposal itself flags it: if the dive feels like a hard scene-cut it breaks
  the "one continuous drive" illusion, and there's no precedent in the
  codebase to copy. **Mitigation:** prototype the dive in Slice 2 against a
  *placeholder* cab before investing in art; if it doesn't feel right, that's
  cheap to discover early.
- **Per-vehicle cab art multiplies work.** cockpit.html already carries five
  per-vehicle dashboard/reflection/charm-coord variants. Supporting all five
  vehicles × N events is a combinatorial art cost. **Mitigation:** Henry-only
  MVP; add vehicles one at a time behind their existing unlock levels.
- **Weather-as-tactics (Marcus-canonical) widens the state matrix.** Overheat,
  fog-jolts, rain-anxiety all modify event outcomes and vehicle choice. Easy
  to let this bleed into every slice. **Mitigation:** keep `weather` in
  `drive-state.ts` from the start as a field, but apply *no* weather effects
  until a dedicated post-MVP slice.
- **Scope creep from the world-building doc.** `ptv-pet-transport-vehicle.md`
  contains an enormous, lovingly-detailed Birchie map (collection drives, pet
  shows, training centres, petrol-station mini-beats, car-wash). All real,
  none MVP. **Mitigation:** this plan's MVP is the *mechanic* (top-down +
  cab + one event + loader + arrival). The map of destinations is content to
  layer on afterward, one drive-type at a time.
- **Two overlay conventions invite inconsistency.** Mixing iframe (pre-drive)
  and native (drive) in one flow means two state-handoff styles. **Mitigation:**
  route all handoff through `drive-state.ts` + the registry, so the boundary is
  one well-defined payload regardless of which side is iframe vs scene.
- **Regression risk to the live vet-run.** drive-overlay.html is currently in
  the real player path (first vet-run). Don't break it while building the new
  scene — leave it mounted until Slice 6 explicitly supersedes it.
