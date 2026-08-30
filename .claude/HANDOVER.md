# A.R.C. on a phone — handover 2026-08-30

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree, 4 commits today. Typecheck clean, lint 0 errors / 38 warnings,
1084 tests pass (was 1030).

**Verified.** The animal card replaces `AnimalDetailsPopup` — measured against
the live display list at 812×325, 812×375 and 1024×768: nothing on either face
falls off screen, one container at depth 800. Review Phase 0 is closed: all
three blocking exits are on screen at rest at five viewports. Adoption's and
rewilding's `← Not yet` were already pinned in `7cc0808`; paths' `← Back to
Luna` now sits 270..319 with 6px clear. `ErrorOverlay.showBlocking` was already
child-safe.

**Unverified.** `e2e/visual.spec.ts` still red on a stale baseline, four
sessions old. Nothing has run on a physical iPad. Nobody has *tapped* the card
on a device — handlers were fired through Phaser's emitter, not real touch. The
card's story face is sparse on an iPad; only checked on the clip.

## Files
- `.claude/TRAPS.md` — read first.
- `apps/game/src/ui/animal-card-layout.ts` — the card's geometry, Phaser-free.
- `apps/game/src/game-views/AnimalCard.ts` — the three faces and the action list.
- `apps/game/src/game-views/__tests__/animal-card.test.ts` — 50 arithmetic
  tests; where the next card invariant goes.
- `apps/game/public/admin/_short-landscape.css:342` — the paths block of the
  height branch shared by all 21 DOM screens.
- `apps/game/tools/measure-screens.mjs` — the DOM-screen harness. Needs
  `ARC_BROWSER_CHANNEL=chrome` and a dev server on :5173.

## Decisions made
- **The card is a fixed size; the action count no longer touches it.**
  `animalCardLayout` takes only the viewport. Two primary actions and More are
  always in the same three places; conditionals live on a More face whose grid
  is computed from the box. That is the property the old panel lacked.
- **Unavailable actions are shown greyed with the reason**, not hidden.
  `canGoOnWalk` is now defined in terms of `walkBlockReason` so rule and
  explanation cannot drift.
- **Paths was compressed, not pinned.** Sticky is bounded by the parent box, so
  pinning `.paths-footer` floated it *up* over the cards. Height came out of
  the plaque's padding instead.
- **`measure-screens.mjs` left as is.** It excuses controls inside a scrolling
  ancestor, which is why it passed the Paths exit while it hung 8px off the
  bottom. Widening it is review Phase 5 item (c) and lights up every picker
  item on 23 screens, so it needs its own triage budget.

## Next step
Phase 2 of the review — the sprite contract. Findings 5 and 6: every label that
decorates an animal is drawn *inside* the animal, and six of eight animal names
are illegible. Phase 1 is done; `ui/layout.ts` exists and the views use it.

## Traps
- **A `sticky` exit is bounded by its parent box.** Give the parent slack or
  take the height out of the layout instead.
- **`createButton` grows past the `width` you ask for** — 28px padding each
  side. Fine in a centred row, an overlap in a fixed-cell grid.
- **Walk is offered to a sick animal**, and the audio button is 53–87% covered
  by the plaque on paths, adopters and tunnel. Both pre-existing, both left.
- **Truncating a grep and concluding from it** produced a wrong claim about
  ErrorOverlay. Read the whole match before calling something open.
- **The app is 812×375; the web clip is 812×325.** Say which you mean.
