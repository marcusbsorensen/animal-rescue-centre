# A.R.C. on a phone — handover 2026-08-30

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree on `main`, six commits today, not pushed (37+ ahead of origin).
Typecheck clean, lint 0 errors, 1120 tests pass. e2e 6/6, `visual.spec.ts`
green. Harness at **2 FAIL / 95 WARN** across 42 scene/viewport combinations,
down from 27 FAIL.

**Verified.** Review phases 0–3 and 5 are closed. The sprite contract was
measured against HEAD in Chrome at three viewports, across the room, corridor,
garden and five minigame scenes: every animal is the size it was, and what moved
moved because the old maths was wrong. The harness now checks relations between
elements, and caught DepotScene's third card hanging off a landscape phone.

**Unverified.** Nothing has run on a physical iPad, and nobody has *tapped* the
animal card on a device — handlers were fired through Phaser's emitter, not real
touch. `visual.spec.ts` is one screenshot of one screen and covers none of what
moved.

**Review item 13 (nav icons) is closed.** All five badges were commissioned
from Manus and installed: `nav-home` (A.R.C. building, the cottage is retired),
`nav-care` (food bowl), `nav-social` (gift), `nav-play` (paw, now in the badge)
and the new `fab-supplies` (crate), which replaces `fab-arc`'s lettered plaque.
Display-list inspection in Chrome confirms all five draw in `GameScene`. **The
finished bar has never been seen unoccluded** — entering `GameScene` in a test
raises an arrival card, and dismissing it triggers an in-canvas re-auth panel,
because `seedFakeSession` writes a token Supabase rejects. See
`docs/nav-icon-commission-log-2026-08-30.md`.

## Files
- `.claude/TRAPS.md` — read first.
- `apps/game/src/ui/sprites.ts` — the size contract, stated at the top.
- `apps/game/src/ui/ux-geometry.ts` — pairwise layout predicates;
  `__tests__/ux-geometry.test.ts` holds the review's own geometry.
- `apps/game/e2e/ux-review.spec.ts` — the harness. Needs
  `ARC_BROWSER_CHANNEL=chrome`; writes `e2e/__ux__/ux-report.json`.
- `docs/nav-icon-brief-2026-08-30.md` — icon commission. **Sent, delivered,
  installed**; outcome in `docs/nav-icon-commission-log-2026-08-30.md`.
- `tools/badge-postprocess.py` — cuts a Manus render down to the set's badge
  geometry (238px disc, 9px margin, clean alpha). Handles alpha, magenta or an
  opaque field.

## Decisions made
- **The box you ask for is the box that gets drawn.** The 2x multiplier and
  `SPRITE_RENDER_SCALE` are gone. Still read `displayWidth` for anything placed
  off an animal: square art in a 5:4 box draws narrower, and an anchor's
  `scale` multiplies again.
- **Two call sites keep the old half-size number** — WalkScene's `collarBasis`,
  ToyPickerView's `rowBasis` — because hand-tuned fraction tables are keyed to
  them. Both say so in place.
- **The review's own L7 rule would have missed the defect it was written for.**
  "Centre outside the viewport" passes an exit hanging 8px off. `reachability`
  splits unreachable / spilling / below-the-fold; the middle one bites.
- **Stacked controls are reported, not scored.** Nothing can tell a card
  carrying a button from a stray overlap — `createButton` makes the hit
  rectangle and its label siblings.
- **Text resolution is set once per scene** (`ui/retina-text.ts`), not per style.
  Five scenes have it; the rest are one line each.
- **The icon commission went to Manus after all**, on Marcus's instruction,
  overriding `manus-sprite-rules.md` Rule 6. Rule 6's stated failure mode is
  Manus proceeding from the text when it cannot fetch references, so the
  references were **uploaded as attachments** rather than passed as URLs, and
  the brief opened with a STOP check demanding a description of each one first.
  Manus described details absent from the brief, so it was genuinely looking.
  **Rule 6 stands** — but for a set-match with uploaded references and a STOP
  check, Manus cleared it. The one failure was a judgement call, not drift: a
  faithful, detailed building that did not survive being shrunk to a thumbnail.
- **Icons are drawn at 38-42px, not the 46-54px the brief assumed** (the FAB is
  42, not 68). Judge any future badge at 38px.

## Next step
Two things are left, and **both want Marcus, not a mechanical pass**:

1. **Item 14's reading-age half** — deliberately reserved for his voice. No
   wording has been touched.
2. **L6 on AccountScene** — the only failing rule left, on tablet and desktop.
   21 interactive elements against a limit of 12 (PASS is 8). Fixing it means
   deciding what to cut, group or paginate on the stats/badges screen. That is
   an information-architecture call, not a threshold to nudge.

Everything else in the review's fix order is closed: F1-F5, L3, T4 and T1-T3
are all at 0 FAIL.

## Traps
- **Bash `cd` persists between calls** — cost two Playwright runs today. Use
  absolute paths.
- **Do not loosen a harness threshold without re-running
  `src/ui/__tests__/ux-geometry.test.ts`** — it is the only thing that says
  whether a check still catches anything.
- **`e2e/__ux__/*.png` can show a scene other than its filename.** Trust
  `ux-report.json`.
- **T4 mismeasures any wide control under a rotated ancestor.**
  `getBoundingClientRect` returns the axis-aligned box of a rotated element, so
  arrival's pills — 300x48 under `.arrival-plaque`'s 0.8 degree tilt — report
  52.2px tall and eat 4.2px out of the gap either side. A real 12px gap read as
  7.8px. Verified live: `cssRowGap` 12px, `layoutGap` 12, `offsetHeight` 48,
  `rectHeight` 52.2. Do not add whitespace to satisfy it; the fix belongs in
  the harness. The number also moves with the card's content, because a
  narrower pill loses less to the tilt.
- **The in-game overlay screens are mounted in IFRAMES** (`arrival.html?embed=1`
  and friends), each sized to the viewport and untransformed. Querying the
  top-level document for `.choice-pill` or any overlay class finds nothing —
  go through `iframe.contentDocument`.
- **`_short-landscape.css` is not all short-landscape.** Its first section
  (the sticky rules pinning `.wave-wrap` / `.release-wrap` / `.secondary-row` /
  `.footer-row`) sits OUTSIDE the `@container (max-height: 520px)` block on
  purpose, so it applies at every viewport. A change there is not a phone-only
  change.
