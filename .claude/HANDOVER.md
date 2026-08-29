# A.R.C. on a phone — handover 2026-08-29 (late)

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree, 11 commits ahead of this morning. Typecheck clean, lint 0 errors /
38 warnings, 1030 tests pass.

**Verified** — the play area has a height axis and the four Phaser views
lay out inside it. Measured against the live display list at 812×325 and
1024×768: nothing in the corridor, a species room, the kitchen or the
garden falls under the nav bar, under the rail, or off the screen. Before
today: an arriving dog rendered y158..306 against a bar starting at 229,
and the two cats in the Cat Room rendered 256 and 288px tall with their
name pills at y358 and y370, below the bottom of a 325px screen.

**Unverified** — none of this has been on a device. The measurements are
from Playwright at the web clip's CSS size, not from the simulator, and
whether the shipped Capacitor build gets 812×325 or something else is
still open. `e2e/visual.spec.ts` is still red on a stale baseline,
untouched for three sessions.

## Files
- `.claude/TRAPS.md` — read first.
- `apps/game/src/ui/layout.ts` — the whole layout contract: `playAreaFor`
  (now x/y/w/h), `navBarMetrics`, `anchorSpaceFor`, `animalBoxFor`,
  `clampAnimalIntoBand`, `SPRITE_RENDER_SCALE`.
- `apps/game/src/game-views/__tests__/play-area.test.ts` — 28 arithmetic
  tests over the real anchor file. Where to add the next invariant.
- `apps/game/src/game-views/KitchenView.ts` — the two-column short layout.
- `apps/game/src/ui/sprites.ts:130` — the `* 2`, now reading the constant.

## Decisions made
- **A height axis on the play area, not per-view fixes.** The `@container`
  work fixed the DOM screens; this is the Phaser twin of it. Views were
  already told to respect `play.x`/`play.w`; they now get `y`/`h` too.
- **480 as the short-viewport breakpoint**, mirroring the rail's 1024.
  Every iPhone in landscape is shorter (tallest, a 17 Pro Max, is 440),
  every iPad taller (shortest, an iPad mini, is 744). Nothing above the
  line moves, so the iPad keeps the layout it has.
- **The bar loses height; the type does not.** Nav 96 → 78 by trimming the
  tab box (54 still clears MIN_TAP by 6) and the bottom margin. Labels stay
  at 15/16px, which is the readability floor for this age.
- **The anchor space compresses; the art still fills the screen.** So an
  animal the art puts on the painted floor now stands a little above that
  floor line on a phone. Deliberate — the alternative is blank strips
  behind the chrome — but it is the one place this trade is visible.
- **The clamp is the guarantee, not the anchor data.** 32 of the 100
  anchors resolve below the band even on an iPad. A test asserts that is
  still true, so if the anchors are ever re-authored the clamp can go.
- **The kitchen folds sideways rather than compressing.** Three 48px
  targets plus MIN_TAP_GAP need 168px against a 137px band. Squeezing them
  put "Quick feed" and "Garden" 8px apart, which for a child aiming at one
  and hitting the other is the same as being too small.

## Next step
Get this on a device. Everything above is Playwright at 812×325, and the
open question the handover has carried for two sessions — whether the
Capacitor build gets the same viewport as the web clip — is now the thing
gating whether any of it is real. Serve with `vite --host 0.0.0.0` and use
the simulator recipe in TRAPS.md, or build and check `cap sync`. Log in as
`Testy` / PIN `1234`; the account has two animals waiting.

After that, from the ux-review: the arrival card's "Did you know?" fact
panel is clipped at the bottom of a 325px viewport (seen in passing, not
measured), and the garden is crowded on a phone — arrows, zone dots, a
three-row footer and the animals all inside 137px. Neither is hidden, both
are tight.

## Traps
- **Reload a web clip with `xcrun simctl terminate <udid> com.apple.webapp`.**
  HOME + tapping the icon *resumes* it stale.
- **Measure at 812×325 CSS px**, not the 780×360 device points the
  simulator panel reports.
- Rotating the simulator needs Marcus — `osascript` is refused assistive
  access.
- `renderView()` draws the rail **and** the HUD. Do not call `renderHUD()`
  beside it.
- **The play band and the nav bar must move together.** They are both
  computed in `ui/layout.ts` now; do not hard-code a bar height in
  `NavBarView` again.
