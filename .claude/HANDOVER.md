# A.R.C. on a phone — handover 2026-08-29 (night)

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree, 11 commits ahead of this morning. Typecheck clean, lint 0 errors /
38 warnings, 1030 tests pass.

**Verified, on the device.** The Capacitor build runs on ARC-13mini and gets
**812×375** — not the web clip's 812×325. Measured with an on-page probe in
the shipped app: `inner 812x375`, `visual 812x375`, `client 812x375`,
`safe-area-inset-bottom 0px`, `standalone false`, dpr 3. A `fixed; bottom:0`
marker sits flush on the screen edge. `contentInset: 'never'` is doing its
job and the 50px the web clip loses is a PWA-only tax. **The two-session
question is closed: the app has 50px more height than the clip.**

Walked on the device: signup (name → animal → PIN → confirm → hint → hint
safety) → menu → intro map → arrival card → corridor → rail → welcome →
Cat Room. The PIN keypad offers all ten digits. The arrival card shows all
three choices and its "Did you know?" panel. In the corridor both arriving
cats stand clear of the nav bar; in the Cat Room the welcomed cat renders
whole with her name pill and status chips above it. This morning the same
two screens drew an arrival from the chest down and a room cat 288px tall
with its name pill below the bottom of the screen.

**Also verified** — the display list measured at both 812×375 and 812×325:
nothing in the corridor, a species room, the kitchen or the garden falls
under the bar, under the rail, or off screen.

**Unverified** — `e2e/visual.spec.ts` is still red on a stale baseline,
untouched for three sessions, and today moved pixels so it needs
regenerating. Nothing has been checked on an iPad *device* — only at iPad
dimensions in Playwright.

## Files
- `.claude/TRAPS.md` — read first.
- `apps/game/src/ui/layout.ts` — the layout contract: `playAreaFor`
  (x/y/w/h), `navBarMetrics`, `anchorSpaceFor`, `animalBoxFor`,
  `clampAnimalIntoBand`, `SPRITE_RENDER_SCALE`.
- `apps/game/src/game-views/__tests__/play-area.test.ts` — 28 arithmetic
  tests over the real anchor file. Where the next invariant goes.
- `apps/game/src/game-views/AnimalDetailsPopup.ts:148` — the next job.

## Decisions made
- **A height axis on the play area, not per-view fixes.** Views were
  already told to respect `play.x`/`play.w`; they now get `y`/`h` too.
- **480 as the short-viewport breakpoint**, mirroring the rail's 1024.
  Both the app (375) and the web clip (325) are below it; every iPad is
  above, so nothing on an iPad moves.
- **The bar loses height; the type does not.** Nav 96 → 78. Labels stay at
  15/16px, the readability floor for this age.
- **The anchor space compresses; the art still fills the screen.** So on a
  phone an animal the art puts on the painted floor stands a little above
  that line. The one place the trade is visible.
- **The clamp is the guarantee, not the anchor data.** 32 of the 100
  anchors resolve below the band even on an iPad; a test asserts that, so
  if they are ever re-authored the clamp can go.
- **The kitchen folds sideways rather than compressing.** Three 48px
  targets plus MIN_TAP_GAP need 168px; the clip's band is 137.

## Next step
`AnimalDetailsPopup` — the same defect, in the one view not touched today,
and now quantified. Its `panelH` is capped at `height - 32` and its
placement clamps against `height - 80`, both measured from the screen
rather than from the band, so at 812×375 the panel spans y40..332 at its
*smallest* (one action row, no speech bubble) against a nav bar starting
at 297. Every configuration overlaps. Seen on the device: tapping an
arrival opened its popup with Feed and Play partly behind the bar.

The file's own comment says the real answer is the panel redesign in
`docs/ux-review-2026-08-29.md` — eight buttons in one popup — and it is
right: capping harder just moves the overflow inside the panel. Do the
redesign rather than the arithmetic.

Then: regenerate the `visual.spec.ts` baseline, which today's change
invalidates anyway.

## Traps
- **Reload a web clip with `xcrun simctl terminate <udid> com.apple.webapp`.**
  HOME + tapping the icon *resumes* it stale.
- **The app is 812×375; the web clip is 812×325.** Measure against the one
  you mean. Both are below the 480 short-viewport branch.
- Rotating the simulator needs Marcus — `osascript` is refused assistive
  access.
- `renderView()` draws the rail **and** the HUD. Do not call `renderHUD()`
  beside it.
- **The play band and the nav bar must move together.** Both are computed
  in `ui/layout.ts`; do not hard-code a bar height in `NavBarView` again.
