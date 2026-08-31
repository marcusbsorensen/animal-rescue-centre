# A.R.C. on a phone — handover 2026-08-31

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, usable by 7–10 year
olds. Current arc: make it work on a phone.

## State
Clean tree on `main` at `3d94335`, **7 commits unpushed**. Typecheck clean,
lint 0 errors / 38 pre-existing warnings, 1137 tests pass. UX harness at
**3 FAIL / 100 WARN** across 42 combinations.

**Verified.** The nav bar has been seen unoccluded in a real signed-in
session — five controls, all carrying art, bar inside the viewport at
812x375, 812x325 and 1024x768. The twelve sign-on-stake screens were
rebuilt to respect gravity and re-shot at all three viewports.

**Unverified.** Nothing has run on a physical device, and nobody has
*tapped* anything on one. The simulator got as far as the menu in real iOS
WebKit, signed in, landscape — then tap coordinates could not be resolved.

**Found, not fixed.** The 3 harness FAILs, all GameScene's left rail:
the collapsed pull-tab is 56x150 at `x=0` (deliberate, but the web clip
reports a 50px left safe-area inset), and two stacked rail controls sit
4px apart against a MIN_TAP_GAP of 12. Also: nav tabs overlap by 14px
below ~460px width (portrait only, which Info.plist refuses — but the web
build has no rotate prompt); `forgot-pin.html` and `news.html` never
linked `_short-landscape.css`; the fourteen-scene resize-handler leak is
still its own task.

## Files
- `.claude/TRAPS.md` — read first.
- `apps/game/e2e/helpers.ts` — `mintRealSession`/`installSession`.
- `apps/game/e2e/nav-bar.spec.ts` — the nav bar, seen not inferred. 18s.
- `apps/game/e2e/ux-review.spec.ts` — the harness. Needs `ARC_BROWSER_CHANNEL=chrome`.
- `apps/game/public/admin/_signpost-physics.css` — sign geometry, all 12 screens.
- `apps/game/tools/shoot-signposts.mjs` — shoots those 12 at 3 viewports.

## Decisions made
- **A fake token is not a session.** `seedFakeSession` 401s `load-game`,
  raising the re-auth scrim at depth 10000; the harness walks every scene
  child, so it was measuring the sign-in panel and calling it GameScene
  (mobile reported 4 interactive, real answer 11). 0 FAIL / 94 WARN was
  never a baseline. The harness mints a real session now.
- **Nothing on screen that could not be a sketch of something real**
  (Marcus, this session). Animals only where they stand on something also
  drawn. The fox and dog are deleted, not repositioned. Two posts, because
  one could not hold the board. The menu facade is `cover` with faded
  edges — a die-cut outline is a sticker.
- The grass tuft is one 3:1 painting: stretching it crops it into turf
  slabs. Tried, reverted. Posts move to the grass instead.
- Earlier and still standing: L6 counts controls not instances; the box
  you ask for is the box that gets drawn; T4 measures shapes.

## Next step
Push the seven commits.

## Traps
- **Bash `cd` persists between calls.**
- **`git add public/admin/*.html` sweeps up scratch pages** — it shipped a
  session-installing page into `9b1c1ba`, removed at `e418453`.
- TRAPS' simulator rotation arithmetic was derived on an iPad and does not
  carry to a landscape iPhone 17 Pro. Re-derive before tapping.
- The token guard rejects bare `cat`, heredocs and unbounded `grep`.
