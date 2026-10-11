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

**In flight when this was written (check each):**
- Cloud routine `arc-spike-crossings` (`trig_01LPfUtH7kVsS6LCutYBPpBE`) →
  branch `claude/spike-crossings`: small animals crossing the lanes. Merge it
  (touches only `drive-spike/crossings*`), run `node
  apps/game/public/admin/drive-spike/crossings.check.mjs`, look at a crossing.
- A local agent measuring Trikey's options; its map lands at
  `.../c124365a-79a7-4b32-87ef-f47f8231944e/scratchpad/trikey-options.png`.

**Unverified / stalled.** Cloud routine `arc-root-test-green`
(`trig_01E4R1AHt19BD28baNAxfvDg`, run `cse_01BsYeppy1KaNNVWxUpbpjwb`) went idle
after 10 minutes and pushed nothing. Read its log with
`RemoteTrigger get_run_log` (only the main session has that tool), then re-run.

## Open questions for Marcus (ask numbered, lettered, recommendation marked)
1. **Trikey cannot reach 8 of 14 places without dual carriageways**: the trunk
   roads split the map into islands; bramble-farm and goose-end-farm are reached
   only by trunk. Show the options map above. Options being measured: no trunk
   ever / crossing a dual carriageway but never riding along it / cycle paths
   from the real map. Plus: Trikey simply does not serve unreachable places.
2. **The guide-line switch has nowhere to live**: the game has no settings
   screen; reduced motion is only a `?motion=` URL switch. A) a small grown-ups'
   settings page behind a parent gate holding both (recommended), B) URL only
   for now, C) a switch on the driving screen.

## Next steps, in order
1. Merge crossings; show Marcus the Trikey map and ask 1–2.
2. Port the answers that touch `PtvDriveScene.ts` (now free of other jobs):
   2A reduced motion drops shake, judder and the speed camera's white flash;
   3A Park and Reverse go; 4A a speed camera fires on "too fast for this road"
   (`road-gears.ts`); 5A supply runs carry no animals (`GameScene.ts:~1985`,
   `carriesAnimals`); pass the vehicle to `buildAdjacency(this.gpsGraph,
   vehicleId)` (~line 2320). One cloud routine can take these, one commit each.
3. Port plan step 5: the world behind `?drive=world`, from the TS modules.
4. Marcus drives the spike on a phone and judges the feel.

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
