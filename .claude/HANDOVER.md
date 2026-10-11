# A.R.C. driving rebuild — handover 2026-10-11, evening

## Goal
Rebuild the driving game on the model of Lily's favourite driving game: the van
pinned, the world rotating underneath, steering on rails, the child controlling
speed and lane. Spec: `docs/driving-rebuild-2026-10-11.md`. Port plan for the
real scene: `docs/driving-port-plan-2026-10-11.md` (section 5 holds Marcus's
answers to all twelve questions).

## State
**Verified, on `claude/crate-loading`, pushed.** The spike
(`/admin/drive-spike.html`, `pnpm dev`) now has: scenery placed from the
child's own map with seasons (`drive-spike/scenery.js`), traffic that can never
touch the van, proved over 50 seeds × 20 simulated minutes
(`traffic.js`, `traffic.check.mjs`), Henry's painted dashboard with live
speedometer, GPS and comfort gauge and the gear/handbrake/horn
(`dashboard.js`), speed-and-place zoom, pulling up at named destinations, true
vehicle widths (Henry default), the landscape layout. The pure TS model is in
`apps/game/src/driving/` (`route-path`, `world-camera`, `lane-motion`,
`road-gears`, `ride-comfort`), brought up to the zoom/pull-up decisions.
Port steps 1–4 are merged (dead picker, "Which way?" and the junction prompt
gone, the loop on `update`); `e2e/collection-drive.spec.ts` passes 4/4 in real
Chrome on this Mac (the cloud cannot run it: no `.env.local`). Trikey routing (`buildAdjacency(g, 'pedal-trike')`)
and the guide-line preference (`lib/guide-line-preference.ts`, URL only) are
merged. Game 1005 tests, game-logic 1193, typecheck clean.

Crossings are merged (`0858458`): the check passes, 0 contacts over 1,240
simulated minutes, closest 1.1 m. But on a phone the animals are specks (a
rabbit is a few pixels), hence the routine below. The root-test worry is
closed: the routine could not reproduce the timeouts in 5 runs, and CI run
#481 on main runs and passes every package including the app.

**Merged 2026-10-11 night (all checks green, e2e 4/4):** vehicle outlines
(now 0.65 of the hedges' weight, `vehicle-look.js`), turning tyre tread,
crossing animals (still too small, being replaced), port answers Q5–Q8/Q10 in
`PtvDriveScene.ts`. Road data committed: `assets/driving/trunk-carriageways.json`
(what each A28 edge really is) and `trikey-links.json` (Trikey's extra paths
and the two crossings she may use). The routine `arc-spike-road-paint` died at
the five-hour usage limit (cloud routines share Marcus's limit) and lost its
work; every prompt now says push early and often.

**In flight (check each with RemoteTrigger list_runs and git ls-remote on the
claude branches; merge, run the checks, screenshot for Marcus):**
- `arc-spike-road-paint-2` (`trig_01QsJEGA5ZPtBBPBkQnp5JkH`) → `claude/spike-road-paint`: tarmac, grit, dust, earth tracks, hand-painted lines; `?road=0|1|2`. Owns drawRoads.
- `arc-a28-model` (`trig_01EChsKzNshhu76p6D2E8fTz`) → `claude/a28-model`: TS speeds and zoom by carriageway kind, Trikey rule 18A (expect 6 of 14, 44 pairs, +1,637 m), `crossingsOnRoute`, `reachableFor`.
- `arc-spike-animals-sideview` (`trig_01QGTXAMchbhPVPqKMxgZodF`) → `claude/spike-animals-sideview`: the game's own side-view hedgehog and fox, fine contour, gait-synced pulsing glow (21A); toast backing; ducklings clear of the HUD; tractor nose check.
- `arc-tube-man` (`trig_01PE1q1ndQi4zjw69ZpaUHz9`) → `claude/tube-man`: `/admin/tube-man.html`, the rig animated in code (29A).
- `arc-spike-gears` (`trig_01FoxWx92DsELVMBoTcJyXzg`) → `claude/spike-gears`: 30A, gears allowed per road, the right knob pulses, a big numeral, clunk and lurch.
- A local agent painting rabbit, duck, duckling, pheasant and deer candidates with ComfyUI into the session scratchpad `crossing-art/` (contact.png) for Marcus to choose; nothing goes in the repo until he picks.

After the A28 model and the road paint land: a spike job drawing the A28 by kind (dual / divided / single). Not yet started: the fuel, workshop, wash and charging model (decisions 22–28 in `docs/fuel-workshop-carwash-2026-10-12.md`).

## Open questions for Marcus (ask numbered, lettered, recommendation marked)
1. **Answered 15D, with a condition**: crossing a dual carriageway only by a
   bridge or tunnel, never at road level (a child would copy it). The options
   agent is re-measuring D on that rule from the OSM data; then a routine
   implements it (trike-only extra edges as an overlay, NOT by regenerating
   the map with `osm-to-svg.py`). The earlier measurements: Trikey
   reaches 6 of 14 places from A.R.C. as built; crossing a dual carriageway
   for at most 60 m (never riding along it) adds Cove Harbour (7); cycle paths
   and farm tracks add Village Hall (7); both together 8 of 14. Map:
   `.../c124365a-79a7-4b32-87ef-f47f8231944e/scratchpad/trikey-options.png`
   (scripts beside it). Whatever he picks, the places she still cannot reach
   need a "too far for Trikey" answer in the picker.
2. **Disk, answered 16A: leave it all.** 81 GB free at 20:36 BST.
2. ~~The guide-line switch~~ — answered (13C) and done: a switch on the driving
   screen, on the spike's dashboard beside the GPS (G on a keyboard), on by
   default. When the scene is ported it should call `setGuideLine()` in
   `apps/game/src/lib/guide-line-preference.ts`, which the spike already shares
   a storage key with.

## Next steps, in order
1. Merge the four routines above as they land; run the checks, the game
   tests and (for port-answers) the e2e locally; show Marcus the look
   switches side by side and ask which strength.
2. Act on his answers to 15 (Trikey) and 16 (disk).
3. The look work (outlines, turning wheels, road paint, readable animals)
   will need porting to the Phaser scene too: add it to the port plan once
   he has chosen.
4. Port plan step 5: the world behind `?drive=world`, from the TS modules.
5. Marcus drives the spike on a phone and judges the feel.

## Traps
- **Work account cloud env is `env_01XEuhfALG2Bm8UZiSSGr96Q`**, not the one in
  `~/.claude/CLAUDE.md`. Strip connectors after every create.
- **The built-in browser pane pauses animation while hidden**: the spike looks
  frozen. Use the Playwright MCP; its screenshots save only under
  `.playwright-mcp/` (gitignored).
- **`cockpit-slots-henry.json` does not match the painting** (its speedometer
  is the ignition key). `dashboard.js` measures off the painting instead.
- **Camera on hairpins**: a few real corners turn the route up to 150°, where
  the camera moves up to 7.7° in a frame against <1° elsewhere. Smooth it if it
  feels jerky.
- **The disk filled to 402 MB free once tonight.** Big users are other
  sessions' temp folders (pfish-ios 11 GB, uncubed-integration 9.7 GB), Xcode
  DerivedData 12 GB and CoreSimulator 16 GB. Nothing was deleted.
- Older traps (rsync breaking `xcodebuild -exportArchive`, the ASC key limits,
  Phaser canvas blank in the built-in browser, `install-vehicles.py` taper,
  `osm-to-svg.py` regenerating the map, Manus overdrawn) still apply:
  `.claude/handovers/2026-10-10-accumulated.md`.
