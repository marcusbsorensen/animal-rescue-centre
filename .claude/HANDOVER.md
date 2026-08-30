# A.R.C. on a phone — handover 2026-08-30

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree, 7 commits today. Typecheck clean, lint 0 errors (38 warnings in
the game, 12 in game-logic), 1094 tests pass (was 1084). e2e smoke 3/3 and
`visual.spec.ts` green again — its baseline predated the painted main menu
and had been red for four sessions.

**Verified.** Review phases 0–3 are closed. The sprite contract landed:
`createAnimalSprite` draws inside the box it is handed, and that was
measured against HEAD in Chrome at 1024×768, 812×375 and 812×325 by walking
the display list in the room, the corridor, the garden and the five minigame
scenes. Every animal came out the size it was; the things that moved moved
because the old maths was wrong.

**Unverified.** Nothing has run on a physical iPad. Nobody has *tapped* the
animal card on a device — handlers were fired through Phaser's emitter, not
real touch. The card's story face is sparse on an iPad. The visual suite is
one screenshot of one screen; it does not cover any of what moved today.

## Files
- `.claude/TRAPS.md` — read first.
- `apps/game/src/ui/sprites.ts` — the size contract, stated at the top.
- `apps/game/src/ui/__tests__/sprites.test.ts` — what stops it regressing.
- `apps/game/src/ui/layout.ts` — `animalBoxFor`, `clampAnimalIntoBand`, the
  play band. Phaser-free, so unit-testable.
- `apps/game/src/game-views/AnimalCard.ts` — the three faces and the actions.
- `apps/game/public/admin/_short-landscape.css` — the height branch shared by
  all 21 DOM screens.
- `apps/game/tools/measure-screens.mjs` — the DOM-screen harness. Needs
  `ARC_BROWSER_CHANNEL=chrome` and a dev server on :5173.

## Decisions made
- **The box you ask for is the box that gets drawn.** The multiplier is gone
  and `SPRITE_RENDER_SCALE` with it. Callers still read `displayWidth` for
  anything positioned off an animal — square art in a 5:4 box is drawn
  narrower than the box, and an anchor's `scale` multiplies again.
- **Two call sites deliberately kept the old half-size number**, because a
  table of hand-tuned fractions is keyed to it: WalkScene's `collarBasis`
  and ToyPickerView's `rowBasis`. Both say so in place. Re-basing either
  means rescaling fractions that can only be checked by looking at them.
- **The anchor is a feet position, and now behaves like one.** Corridor and
  garden animals sit 9–40px higher on a phone as a result. The clamp is
  still the guarantee, not the anchor file.
- **The dead `anchor` argument came off `onShowAnimalDetails`.** GameScene
  has dropped it since AnimalCard replaced the popup, so it was a wrong
  number that a future reader would have "fixed" to no effect.
- **The unused `assets/ui/` art stays.** 17 of the 21 files are referenced
  nowhere, but they total 264KB against a 108MB bundle, so moving them out
  of the essential tier buys nothing. `ui-bond-icon.png` is superseded by
  drawn hearts, which scale and have no caption baked into them.

## Next step
Phase 4 of the review — icons and words. Item 14 (copy pass on the overlay
screens for reading age; `clamp()` floors to 14px, button labels to 18px)
and item 15 (floor the raw-rectangle hit areas at `MIN_TAP`) are code. Item
13 needs art commissioned — `fab-supplies`, `nav-social`, a single-object
`nav-care` — so it needs Marcus. Phase 5 is the harness: a pairwise overlap
check is what would have caught most of findings 1–9 without a human
looking.

## Traps
- **A `sticky` exit is bounded by its parent box.** Give the parent slack or
  take the height out of the layout instead.
- **`createButton` grows past the `width` you ask for** — 28px padding each
  side. Fine in a centred row, an overlap in a fixed-cell grid.
- **Walk is offered to a sick animal**, and the audio button is 53–87%
  covered by the plaque on paths, adopters and tunnel. Both pre-existing.
- **The kitchen and the toy picker are not sized for a short viewport** — a
  184px animal in the kitchen and a 240px one inside a 265px panel. Both
  found while measuring today, both left.
- **`cd` persists between Bash calls**, and it cost two runs today: a
  playwright invocation from the repo root and one from `test-results/`.
  Use absolute paths.
- **The app is 812×375; the web clip is 812×325.** Say which you mean.
