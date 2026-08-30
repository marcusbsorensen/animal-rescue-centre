# A.R.C. on a phone — handover 2026-08-31

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree on `main` at `85289a2`, **not yet pushed**. Typecheck clean, lint
0 errors / 38 pre-existing warnings, 1137 tests pass. UX harness at
**0 FAIL / 94 WARN** across 42 scene/viewport combinations.

**Verified.** L6 is closed, and with it the whole harness fix list — review
items 13, 14, 15 and phases 0–3 and 5 before them. Three rows moved and they
are all the badge wall (AccountScene 21→2 on tablet and desktop, 6→2 on
mobile); every other screen's count is byte-identical, GameScene still WARNs
at 9, L7 still holds 42/42. Checked row by row against the report, not
against the summary line.

**Unverified.** Nothing has run on a physical iPad, and nobody has *tapped*
anything on a device. **The finished nav bar has never been seen unoccluded**
— entering `GameScene` in a test raises an arrival card, and dismissing it
triggers an in-canvas re-auth panel, because `seedFakeSession` writes a token
Supabase rejects. The icons were confirmed by display-list position instead.

**Found, not fixed.** Fourteen scenes register a resize handler on the
game-wide ScaleManager and none remove it; thirteen pass an anonymous
closure, so they cannot. Most call `scene.restart()`, so stale handlers
restart scenes that are not running. Spawned as its own task, with the file
list in the prompt. Not verified against Phaser's source yet.

## Files
- `.claude/TRAPS.md` — read first. Long-lived gotchas live there, not here.
- `apps/game/src/ui/ux-geometry.ts` — pairwise predicates;
  `groupRepeatedTiles` is the L6 one. `__tests__/ux-geometry.test.ts` holds
  the review's own geometry and is the only thing that says whether a check
  still catches anything.
- `apps/game/e2e/ux-review.spec.ts` — the harness. Needs
  `ARC_BROWSER_CHANNEL=chrome`; writes `e2e/__ux__/ux-report.json`.
- `apps/game/public/admin/_short-landscape.css` — one file, all 21 DOM screens.
- `apps/game/src/ui/sprites.ts` — the size contract, stated at the top.

## Decisions made
- **L6 counts controls, not instances of one control.** A run collapses only
  when all three hold: `clipped`, same size, even grid. `clipped` is the one
  doing the work — a browsable collection's length is content, not chrome —
  so a nav bar of five tabs stays five. The badge wall was never a defect;
  `landscape-ux-2026-08-27.md:110` said so by eye and the harness had not
  caught up. Deleting badges would have been tuning the game to the rule.
- **The box you ask for is the box that gets drawn.** `SPRITE_RENDER_SCALE`
  is gone. Still read `displayWidth` for anything placed off an animal.
  WalkScene's `collarBasis` and ToyPickerView's `rowBasis` keep the old
  half-size number because hand-tuned fraction tables key to them.
- **T4 measures shapes, not bounding boxes**; **stacked controls are
  reported, not scored**.
- **Hidden beats reworded**: paths' `.path-criteria` chips stay hidden rather
  than take review 15's wording, because every count in them was invented.
- **Flavour words stay** — "Farewell, friend", charm names, accelerator/brake.

## Next step
Push `85289a2`, then get the nav bar seen unoccluded on a device — the one
piece of the phone work that has never been looked at. `seedFakeSession`
minting a token Supabase rejects is what blocks it; TRAPS has the recipe for
reaching real iOS WebKit without a build.

## Traps
- **Bash `cd` persists between calls** — cost a Playwright run twice already.
- **Do not loosen a harness threshold without re-running
  `src/ui/__tests__/ux-geometry.test.ts`.** L6 was fixed by changing what is
  counted, with eight new cases asserting crowded screens still count one
  control at a time. That is the bar; a threshold nudge is not.
- The token guard here rejects bare `cat`, heredocs and unbounded `grep`.
  Use Read/Edit/Write, or `grep -e PATTERN … | head`.
- Everything else is in `.claude/TRAPS.md`.
