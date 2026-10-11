# A.R.C. driving rebuild — handover 2026-10-11

## Goal
Rebuild the driving game on the model of Lily's favourite driving game: the
vehicle pinned to one spot, the world rotating underneath it, steering on
rails, the child controlling speed and lane. The full design is in
`docs/driving-rebuild-2026-10-11.md` — read that first, it is the spec.

## State
**Verified.** TestFlight build 2 uploaded and processing (delivery UUID
`4a08a332`); nobody has played it yet. The driving spike runs at
`/admin/drive-spike.html` with `pnpm dev`: real 937-node graph, camera rotation
eased to 1° per sample against the route's 7°, van 13.6% of screen width
against 4.1% in the game. Branch `claude/crate-loading` pushed, 34 commits
ahead of `main`, not merged.

**Unverified.** Marcus has not driven the spike. Nothing of the rebuild has
touched the game yet — `PtvDriveScene` is untouched and still ships the old
corridor renderer.

**Blocked.** Three edge functions undeployed (`load-game`, `send-gift`,
`claim-gift`); gift badges need RLS keyed on `auth.uid()`. Seasons cannot use the
real date until the garden has autumn art.

## Files
- `docs/driving-rebuild-2026-10-11.md` — the rebuild spec. Everything Marcus
  said on 2026-10-11, which existed nowhere before.
- `apps/game/public/admin/drive-spike.html` — the spike. Plain canvas, no Phaser.
- `apps/game/src/driving/drive-render.ts` — the 539-line corridor renderer the
  rebuild replaces.
- `apps/game/src/driving/road-router.ts`, `route-instructions.ts` — the route
  maths the guide line draws; correct already, reuse it.
- `apps/game/src/driving/drive-state.ts` — `jostleComfort` seeds the
  animal-disturbance model.
- `docs/fleet-canon.md`, `naming-places.md`, `world-coherence-rule-2026-10-11.md`,
  `animal-exits.md` — standing rules, all current.
- `.claude/handovers/2026-10-10-accumulated.md` — the old 615-line file. History.

## Decisions made
- **Go straight to the rotation rebuild**, no interim scale fix.
- **Turning is automatic** for now; reading the GPS at junctions is a later tier.
- **Gears stay** — they are choosing a speed for the road, not a gearbox lesson.
  Road class drives it and the graph already carries it.
- **No animal is ever hurt and there is never an accident.** Rough driving with
  animals aboard costs a roadside stop; on a delivery run it costs cargo.
- **Fully top-down**, because a painted three-quarter building cannot stay
  upright while the ground rotates. Shadows draw in world space for that reason.
- Rear top-down is still the camera reference; the portrait is still the master
  for livery and length (`docs/fleet-canon.md`).

## Next step
Add scenery to the spike — top-down canopies, roofs and hedges placed in world
space — because without it there is no sense of speed and Marcus cannot judge
the feel. Then traffic, then the dual carriageway's 20m width, which fills the
screen at this zoom.

## Traps
- **Homebrew rsync 3.5.1 breaks `xcodebuild -exportArchive`.** `scripts/testflight.mjs`
  runs Xcode with `/opt/homebrew/bin` off PATH. Bites every iOS project here.
- **The ASC API key cannot mint certificates or create app records.**
- **The built-in browser screenshots the Phaser canvas blank.** Use the
  Playwright MCP for anything visual; `browser_run_code_unsafe` gives `page.mouse`
  for clicking into a canvas.
- **Never install the top-downs through `install-vehicles.py`** — its 0.88 taper
  skews the roof motifs. Re-run `tools/decorate-roof.py`.
- **`tools/osm-to-svg.py` would regenerate the whole map**, losing the
  simplification and the hand-placed landmarks.
- **Manus is overdrawn** by roughly 7,500 credits. Read the usage page first.
