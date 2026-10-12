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

**Merged 2026-10-12 01:00 (5e30f76; all checks green: game 1050, game-logic
1193, typecheck, traffic and crossings checks, e2e 4/4):** a28-model (TS
speeds/zoom by carriageway, Trikey 18A: 6 of 14 places, 44 of 210 pairs
reachable, worst detour +1,637 m), tube-man (`/admin/tube-man.html`),
side-view crossing animals with a gait-synced glow (hedgehog and fox only;
the rest wait for art), road paint (`?road=0|1|2`, 1 default), gears first
pass (pulsing knob, drum numeral, clunk, lurch; its lock is overruled by
30A). Earlier: vehicle outlines at 0.65, turning tread, port answers,
trunk-carriageways.json, trikey-links.json. The tractor is drawn nose-first
both ways (checked). Screenshots: session scratchpad `merge-shots/`.

**30A, Marcus 2026-10-12: every gear works on every road**, like a bike's; a
wrong gear costs (speed camera, jostle, dust; traffic queues if too slow on
the dual). Recorded in the gears section of `docs/driving-rebuild-2026-10-11.md`
and memory `arc-consequences-not-locks`.

**Answered after the merges:** 31A road paint medium (`?road=1`, already the
default); 32A the crossing glow a soft halo about twice the animal's width,
still gait-synced; 33A the gear knob pulses ONLY when her gear does not suit
the road (in 2nd on a main road nothing pulses): check both gear branches do
this when merging, since their prompts left it ambiguous, and record 31A/33A
in `docs/driving-rebuild-2026-10-11.md` then; 34A tube man approved for the
west car wash; 35 rabbit B, duck B, duckling B, pheasant B (wattle painted
out), deer C; 36A used as painted. A local agent is installing the five
animals and the halo in `crossings.js`.

**In flight (cloud; check with RemoteTrigger list_runs and git ls-remote,
merge, run the checks, screenshot for Marcus):**
- `arc-van-upkeep` (`trig_012zZPH77nGzTcAEouSRpmER`) → `claude/van-upkeep`: game-logic model for fuel, charge, wear, dirt (decisions 22–28), part codes fixed, doc with questions for Marcus.
- `arc-spike-gears-free-a28` (`trig_01EmunpNJbeLDAeqG6CiTfBA`) → `claude/spike-gears-free-a28`: the spike's gear lock removed with consequences instead; the A28 drawn by kind (dual/divided/single), big-road zoom only on the real dual.
- `arc-road-gears-30a` (`trig_01CkM72E5nfVhfpiohMX53tA`) → `claude/road-gears-30a`: 30A in `road-gears.ts` and `PtvDriveScene.ts`; run the e2e locally after merging.
- A local agent painting rabbit, duck, duckling, pheasant and deer candidates with ComfyUI into the session scratchpad `crossing-art/` (contact.png) for Marcus to choose; nothing goes in the repo until he picks. (FreqShift's agent cancelled `arcx_rabbit_p0_s23` overnight; it is being re-queued.)

Still to do: port the look work (outlines, wheels, road paint, side-view animals, tube man) into the port plan; place names for the stations and workshop (allude, never name).

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
