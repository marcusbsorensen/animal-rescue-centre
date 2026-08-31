# A.R.C. on a phone — handover 2026-08-31

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree on `main` at `e418453`. `abac4e2` is pushed; the six commits
after it are not. Typecheck clean, lint 0 errors / 38 pre-existing
warnings, 1137 tests pass. UX harness at **3 FAIL / 100 WARN** across 42
scene/viewport combinations — see below, the FAILs are new information,
not a regression.

**Verified.** The nav bar has been seen unoccluded, by eye, in a real
signed-in session: five controls, all carrying art, bar inside the
viewport at 812x375, 812x325 and 1024x768. `e2e/nav-bar.spec.ts` is the
proof and re-runs in 18s. The sign-on-stake screens were rebuilt to
respect gravity and re-shot at all three viewports.

**Unverified.** Nothing has run on a physical iPad, and nobody has
*tapped* anything on a device. The simulator route got as far as the menu
in real iOS WebKit, signed in, in landscape — and then **tap coordinates
could not be resolved**: the panel reports a 402x874 portrait space, and
neither that frame nor the derived landscape one hit CONTINUE. TRAPS'
rotation arithmetic was written for an iPad and has not been re-derived
for a landscape iPhone 17 Pro.

**Found, not fixed.**
- Three harness FAILs, all GameScene's left rail, all previously hidden
  behind the sign-in scrim: the collapsed pull-tab is 56x150 at `x=0`
  (deliberate — `railBoundsFor` returns `x: 0` in all three modes — but
  the web clip reports a 50px left safe-area inset, so nearly the whole
  tab sits under the sensor housing), and two stacked rail controls are
  4px apart against a MIN_TAP_GAP of 12.
- Fourteen scenes register a resize handler on the game-wide ScaleManager
  and none remove it; thirteen pass an anonymous closure, so they cannot.
  Spawned as its own task. Not verified against Phaser's source yet.
- The nav tabs overlap by 14px below ~460px of width. Only portrait
  reaches it, which `Info.plist` refuses — but the web build has no
  rotate prompt.
- `forgot-pin.html` and `news.html` never linked `_short-landscape.css`.

## Files
- `.claude/TRAPS.md` — read first. Long-lived gotchas live there, not here.
- `apps/game/e2e/helpers.ts` — `mintRealSession` / `installSession`.
  `seedFakeSession` is the old one and only right for scenes that never
  load a save.
- `apps/game/e2e/nav-bar.spec.ts` — the nav bar, seen rather than
  inferred. Walks in through CONTINUE and the intro tap.
- `apps/game/e2e/ux-review.spec.ts` — the harness. Needs
  `ARC_BROWSER_CHANNEL=chrome`; writes `e2e/__ux__/ux-report.json`.
- `apps/game/public/admin/_signpost-physics.css` — sign geometry for all
  twelve sign-on-stake screens. `_short-landscape.css` is the height
  branch for twenty.
- `apps/game/tools/shoot-signposts.mjs` — shoots those twelve at the
  three shipping viewports.
- `apps/game/src/ui/sprites.ts` — the size contract, stated at the top.

## Decisions made
- **A fake token is not a session.** `seedFakeSession` 401s `load-game`,
  which raises the re-auth scrim at depth 10000, and the harness walks
  every scene child — so it has been measuring the sign-in panel and
  calling it GameScene (mobile: 4 interactive reported, 11 real). The
  harness now mints a real session. 0 FAIL / 94 WARN was not a baseline;
  it was a screen with a panel over it.
- **Nothing on screen that could not be a sketch of something real.**
  Marcus 2026-08-31. Animals are drawn only where they stand on
  something also drawn — the sign's top edge, the grass at the posts.
  The fox and dog are gone rather than repositioned. The board gets a
  second post because one could not hold it. The menu's facade is
  `cover` with faded edges rather than `contain`, because a die-cut
  outline is a sticker.
- **L6 counts controls, not instances of one control**; **the box you ask
  for is the box that gets drawn**; **T4 measures shapes, not bounding
  boxes**; **hidden beats reworded**; **flavour words stay**.

## Next step
Push the six unpushed commits, then either re-derive the tap frame for a
landscape iPhone (the game is up in Safari on the booted simulator, one
tap from the corridor) or take the three rail FAILs, which are the first
real findings the harness has produced since it stopped lying.

## Traps
- **Bash `cd` persists between calls.**
- **Do not loosen a harness threshold without re-running
  `src/ui/__tests__/ux-geometry.test.ts`.**
- **`git add public/admin/*.html` sweeps up scratch pages.** It shipped a
  session-installing page into `9b1c1ba`; removed in `e418453`.
- The token guard here rejects bare `cat`, heredocs and unbounded `grep`.
  Use Read/Edit/Write, or `grep -e PATTERN … | head`.
- Everything else is in `.claude/TRAPS.md`.
