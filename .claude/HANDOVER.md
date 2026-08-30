# A.R.C. on a phone — handover 2026-08-30

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree, 13 commits today. Typecheck clean, lint 0 errors, 1120 tests
pass (was 1084). e2e smoke 3/3, `visual.spec.ts` green on a re-baselined
main menu, ux harness 42 scene/viewport combinations with F10 clean.

**Verified.** Review phases 0–3 and 5 are closed. The sprite contract
landed and was measured against HEAD in Chrome at three viewports across
the room, corridor, garden and five minigame scenes: every animal is the
size it was, and what moved moved because the old maths was wrong. The
harness now looks at what is *beside* a thing, and caught a defect on its
own — DepotScene's third build-mode card hanging off a landscape phone —
which is fixed and re-measured. Text renders at device resolution in the
five scenes that were drawing it at 1x; F10 went from 12 failing
combinations to none.

**Unverified.** Nothing has run on a physical iPad. Nobody has *tapped* the
animal card on a device — handlers were fired through Phaser's emitter, not
real touch. The card's story face is sparse on an iPad. The visual suite is
one screenshot of one screen and covers none of what moved.

## Files
- `.claude/TRAPS.md` — read first.
- `apps/game/src/ui/sprites.ts` — the size contract, stated at the top.
- `apps/game/src/ui/ux-geometry.ts` — the pairwise layout predicates, with
  `__tests__/ux-geometry.test.ts` holding the review's own geometry.
- `apps/game/e2e/ux-review.spec.ts` — the harness that uses them. Needs
  `ARC_BROWSER_CHANNEL=chrome`. Writes `e2e/__ux__/ux-report.json`.
- `apps/game/src/ui/layout.ts` — `animalBoxFor`, `clampAnimalIntoBand`, the
  play band. Phaser-free, so unit-testable.
- `apps/game/src/game-views/AnimalCard.ts` — the three faces and the actions.
- `docs/nav-icon-brief-2026-08-30.md` — the icon commission, **not sent**.

## Decisions made
- **The box you ask for is the box that gets drawn.** The 2x multiplier is
  gone and `SPRITE_RENDER_SCALE` with it. Callers still read `displayWidth`
  for anything positioned off an animal — square art in a 5:4 box is drawn
  narrower than the box, and an anchor's `scale` multiplies again.
- **Two call sites deliberately kept the old half-size number**, because a
  table of hand-tuned fractions is keyed to it: WalkScene's `collarBasis`
  and ToyPickerView's `rowBasis`. Both say so in place.
- **The review's own L7 rule would have missed the defect it was written
  for.** "Centre outside the viewport" passes a Paths exit hanging 8px off
  the bottom. `reachability` splits unreachable from spilling from
  below-the-fold, and it is the middle one that bites.
- **Stacked controls are reported and not scored.** One control entirely
  inside another is sometimes a card carrying a button and sometimes a Back
  button that landed on one, and nothing measurable tells them apart — the
  tree does not, because `createButton` makes the hit rectangle and the
  label siblings.
- **The unused `assets/ui/` art stays.** 17 of 21 files are referenced
  nowhere, but they total 264KB against a 108MB bundle.
- **The icon commission should go to OpenAI, not Manus.** Marcus asked for
  a Manus brief; `docs/manus-sprite-rules.md` Rule 6 says anything that has
  to sit in an existing set goes through `tools/gpt-image-regen.sh`. The
  brief is written to work either way and says so at the top. His call.
- **Text resolution is set once per scene, not per style.** `useRetinaText`
  wraps the scene's own text factory in `create()`. A list of call sites
  that each have to remember a property grows a new entry every time
  someone adds a label; this cannot be forgotten because there is nothing
  to remember. Five scenes have it; the rest are a one-line addition each,
  left until the mechanism was confirmed in a real browser.

## Next step
Phase 4 — icons and words. Item 13 is drafted and waiting on Marcus.

Item 14 (type sizes and reading age) now has a real worklist: 30 text runs
under 14px, all of them game copy, in `e2e/__ux__/ux-report.json` under
`offenders.smallText`. **It was 54 and half of it was the mock pages' own
dev chrome** — that is fixed, so the list can be worked straight through.
The smallest are 10.5px ("Let them settle in their own time"), the Paths
criteria are all 11px, and the three exits Phase 0 made *reachable* are
still 12px against an 18px target for button labels. "Designed by Lily age
8" is 11.25px, the smallest thing on the main menu.

Item 15 is nearly nothing: four unique targets under 48px across all 42
combinations — one 160x28 rectangle in GameScene and three 220x44 buttons
in the tunnel overlay.

## Traps
- **A `sticky` exit is bounded by its parent box.** Give the parent slack or
  take the height out of the layout instead.
- **`createButton` grows past the `width` you ask for** — 28px padding each
  side. Fine in a centred row, an overlap in a fixed-cell grid.
- **Walk is offered to a sick animal**, and the audio button is 53–87%
  covered by the plaque on paths, adopters and tunnel. Both pre-existing.
- **The kitchen and the toy picker are not sized for a short viewport** — a
  184px animal in the kitchen and a 240px one inside a 265px panel. Both
  found while measuring, both left.
- **`cd` persists between Bash calls**, and it cost two playwright runs
  today: one from the repo root, one from `test-results/`. Use absolute
  paths.
- **The app is 812×375; the web clip is 812×325.** Say which you mean.
