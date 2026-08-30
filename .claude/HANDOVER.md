# A.R.C. on a phone — handover 2026-08-29

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree, 12 commits ahead of this morning. Typecheck clean, lint 0 errors /
38 warnings, 1030 tests pass.

**Verified on the device.** The Capacitor build gets **812×375**, not the web
clip's 812×325 — probed inside the shipped app on ARC-13mini:
`inner/visual/client 812x375`, `safe-area-inset-bottom 0px`, `standalone
false`, `fixed; bottom:0` flush on the screen edge. The two-session question
is closed. Walked signup → intro → arrival → corridor → rail → welcome → Cat
Room; animals render whole and clear of the nav bar. Also verified against the
live display list at 812×375, 812×325 and 1024×768: nothing in the corridor, a
room, the kitchen or the garden falls under the bar, under the rail, or off
screen.

**Unverified.** `e2e/visual.spec.ts` is red on a stale baseline, untouched for
three sessions, and today moved pixels. Nothing has run on a physical iPad.

## Files
- `.claude/TRAPS.md` — read first.
- `apps/game/src/ui/layout.ts` — the layout contract: `playAreaFor` (x/y/w/h),
  `navBarMetrics`, `anchorSpaceFor`, `animalBoxFor`, `clampAnimalIntoBand`,
  `SPRITE_RENDER_SCALE`.
- `apps/game/src/game-views/__tests__/play-area.test.ts` — 28 arithmetic tests
  over the real anchor file; where the next invariant goes.
- `apps/game/src/game-views/AnimalDetailsPopup.ts:148` — the next job.

## Decisions made
- **A height axis on the play area, not per-view fixes.** Views already
  respected `play.x`/`play.w`; they now get `y`/`h` too.
- **480 is the short-viewport breakpoint**, mirroring the rail's 1024. App
  (375) and clip (325) are below it; every iPad is above, so no iPad layout
  moves. The bar loses height there (96 → 78); the type never does, 15/16px
  being the readability floor for this age.
- **The anchor space compresses; the art still fills the screen.** So on a
  phone an animal stands slightly above its painted floor mark — the one place
  the trade shows. **The clamp, not the anchor data, is the guarantee:** 32 of
  the 100 anchors resolve below the band even on an iPad, and a test says so.
- **The kitchen folds sideways rather than compressing.** Three 48px targets
  plus MIN_TAP_GAP need 168px; the clip's band is 137.

## Next step
Redesign `AnimalDetailsPopup` per `docs/ux-review-2026-08-29.md` — eight
buttons in one popup is the actual problem. It caps `panelH` at `height - 32`
and clamps placement against `height - 80`, both from the screen rather than
the band, so at 812×375 it spans y40..332 at its *smallest* against a bar
starting at 297. Every configuration overlaps. Do not just cap harder — the
file's own comment is right that this moves the overflow inside the panel.

## Traps
- **The app is 812×375; the web clip is 812×325.** Say which you mean.
- **Bash `cd` persists between calls.** `git stash push -- apps/game/src`
  resolved to `apps/game/apps/game/src`, stashed nothing silently, and the
  `pop` restored an unrelated stash into `public/admin/` — which
  `build-ios.mjs` ships, taking the bundle 108 MB → 749 MB. Use absolute paths.
- The pnpm store can vanish mid-session; `pnpm install --frozen-lockfile` from
  the repo root fixes it in seconds.
- Rotating the simulator needs Marcus — `osascript` is refused assistive access.
- `renderView()` draws the rail **and** the HUD. Never call `renderHUD()` beside it.
