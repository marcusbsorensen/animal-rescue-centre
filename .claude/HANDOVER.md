# A.R.C. on a phone — handover 2026-08-30

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree on `main`, pushed, level with origin. Typecheck clean, lint 0
errors, 1127 tests pass. e2e 6/6, `visual.spec.ts` green. UX harness at
**2 FAIL / 94 WARN** across 42 scene/viewport combinations, down from 27 FAIL.

**Verified.** Review items 13, 14 and 15 are closed, and phases 0–3 and 5
before them. F1-F5, L3, T4, T1-T3, L7, L8, L9 and F10 are all at 0 FAIL. Every
change was measured against the harness before and after, rule by rule, rather
than against the summary line.

**Unverified.** Nothing has run on a physical iPad, and nobody has *tapped*
anything on a device. **The finished nav bar has never been seen unoccluded** —
entering `GameScene` in a test raises an arrival card, and dismissing it
triggers an in-canvas re-auth panel, because `seedFakeSession` writes a token
Supabase rejects. The icons were confirmed by display-list position instead.

## Files
- `.claude/TRAPS.md` — read first. Long-lived gotchas live there, not here.
- `apps/game/src/ui/ux-geometry.ts` — pairwise layout predicates;
  `__tests__/ux-geometry.test.ts` holds the review's own geometry and is the
  only thing that says whether a check still catches anything.
- `apps/game/e2e/ux-review.spec.ts` — the harness. Needs
  `ARC_BROWSER_CHANNEL=chrome`; writes `e2e/__ux__/ux-report.json`.
- `apps/game/public/admin/_short-landscape.css` — one file, all 21 DOM screens.
- `apps/game/src/ui/sprites.ts` — the size contract, stated at the top.
- `docs/nav-icon-commission-log-2026-08-30.md` — what the icon set cost, and
  what Manus got right and wrong.

## Decisions made
- **The box you ask for is the box that gets drawn.** The 2x multiplier and
  `SPRITE_RENDER_SCALE` are gone. Still read `displayWidth` for anything placed
  off an animal. WalkScene's `collarBasis` and ToyPickerView's `rowBasis` keep
  the old half-size number because hand-tuned fraction tables key to them.
- **T4 measures shapes, not bounding boxes.** A rotated control's box is bigger
  than the control, and the old rule also *skipped* pairs whose boxes
  overlapped — so a tilted control whose box swallowed its neighbour was exempt
  from the check entirely.
- **Stacked controls are reported, not scored** — nothing can tell a card
  carrying a button from a stray overlap.
- **The icon commission went to Manus**, overriding `manus-sprite-rules.md`
  Rule 6, with references uploaded as attachments rather than URLs and a STOP
  check demanding a description before drawing. Rule 6 still stands generally.
- **Nav icons draw at 38–42px**, not the 46–54 the brief assumed. Judge at 38.
- **Hidden beats reworded**: paths' `.path-criteria` chips stay hidden rather
  than take review 15's replacement wording, because every count in them was
  invented. That supersedes the review.
- **Flavour words stay** — "Farewell, friend", charm names, accelerator/brake.

## Next step
**L6 on AccountScene**, tablet and desktop — the only rule still failing.
21 interactive elements against a limit of 12 (PASS is 8). It needs a decision
about what to cut, group or paginate on the stats/badges screen, then the cut
itself. Not a threshold to nudge. Re-run the harness after and check L7 still
holds 42/42.

## Traps
- **Bash `cd` persists between calls** — cost a Playwright run again today.
- **Do not loosen a harness threshold without re-running
  `src/ui/__tests__/ux-geometry.test.ts`.**
- Everything else that bit this session is in `.claude/TRAPS.md`: the overlay
  iframes, `_short-landscape.css`'s first section applying at every viewport,
  `manus_download_output` filename collisions, and bounding boxes vs shapes.
