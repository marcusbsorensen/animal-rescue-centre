# A.R.C. on a phone — handover 2026-08-30

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree, 13 commits today. Typecheck clean, lint 0 errors, 1120 tests pass
(was 1084). e2e smoke 3/3, `visual.spec.ts` green on a re-baselined main menu,
ux harness 42 scene/viewport combinations with F10 clean.

**Verified.** Review phases 0–3 and 5 are closed. The sprite contract landed and
was measured against HEAD in Chrome at three viewports across the room,
corridor, garden and five minigame scenes — every animal is the size it was, and
what moved moved because the old maths was wrong. The harness now checks
relations between elements, and caught DepotScene's third build-mode card
hanging off a landscape phone; fixed and re-measured. Text renders at device
resolution in the five scenes that were drawing it at 1x.

**Unverified.** Nothing has run on a physical iPad. Nobody has *tapped* the
animal card on a device — handlers were fired through Phaser's emitter, not real
touch. The card's story face is sparse on an iPad. `visual.spec.ts` is one
screenshot of one screen and covers none of what moved.

## Files
- `.claude/TRAPS.md` — read first.
- `apps/game/src/ui/sprites.ts` — the size contract, stated at the top.
- `apps/game/src/ui/ux-geometry.ts` — pairwise layout predicates;
  `__tests__/ux-geometry.test.ts` holds the review's own geometry.
- `apps/game/e2e/ux-review.spec.ts` — the harness. Needs
  `ARC_BROWSER_CHANNEL=chrome`. Writes `e2e/__ux__/ux-report.json`.
- `apps/game/src/ui/retina-text.ts` — `useRetinaText(scene)`, one line per scene.
- `apps/game/src/ui/layout.ts` — the play band and animal sizing, Phaser-free.
- `docs/nav-icon-brief-2026-08-30.md` — icon commission, **not sent**.

## Decisions made
- **The box you ask for is the box that gets drawn.** The 2x multiplier and
  `SPRITE_RENDER_SCALE` are gone. Still read `displayWidth` for anything placed
  off an animal: square art in a 5:4 box draws narrower than the box, and an
  anchor's `scale` multiplies again.
- **Two call sites deliberately keep the old half-size number**, because a table
  of hand-tuned fractions is keyed to it: WalkScene's `collarBasis` and
  ToyPickerView's `rowBasis`. Both say so in place.
- **The review's own L7 rule would have missed the defect it was written for.**
  "Centre outside the viewport" passes a Paths exit hanging 8px off the bottom.
  `reachability` splits unreachable / spilling / below-the-fold; the middle one
  is the one that bites.
- **Stacked controls are reported, not scored.** One control inside another is
  sometimes a card carrying a button — and the tree cannot tell, because
  `createButton` makes the hit rectangle and the label siblings.
- **Text resolution is set once per scene, not per style.** Five scenes have
  `useRetinaText`; the rest are one line each, left until the mechanism was
  confirmed in a browser.
- **The icon commission belongs to OpenAI, not Manus** — `manus-sprite-rules.md`
  Rule 6, because every piece must match an existing set. Brief works either way.

## Next step
Review item 14, the mechanical half only: raise the `clamp()` floors in
`apps/game/public/admin/*.html` to 14px and button labels to 18px, working the
30 entries under `offenders.smallText` in `e2e/__ux__/ux-report.json`. Smallest
first — 10.5px Paths copy, the 11px Paths criteria, then the 12px exit labels.
**Leave the wording alone**; the reading-age pass wants Marcus's voice.

## Traps
- **Bash `cd` persists between calls** — cost two Playwright runs today, one
  from the repo root and one from `test-results/`. Use absolute paths.
- **Do not loosen a harness threshold without re-running
  `src/ui/__tests__/ux-geometry.test.ts`.** It holds the review's real geometry
  and is the only thing that says whether a check still catches anything.
- **`e2e/__ux__/*.png` can show a scene other than its filename.** Trust
  `ux-report.json`, not the screenshots.
