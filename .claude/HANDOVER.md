# A.R.C. on a phone — handover 2026-08-30

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree, three commits today. Typecheck clean, lint 0 errors / 38 warnings,
1084 tests pass (1030 + 54 new).

**Verified.** Phase 0 of the review is closed. All three blocking exits are on
screen at 812×325, 812×375, 956×440, 1133×744 and 1194×834, measured at rest:
adoption's and rewilding's "← Not yet" are pinned `sticky` (that landed in
`7cc0808`), paths' "← Back to Luna" now sits 270..319 with 6px clear after the
plaque gave up 24px of padding on short viewports. `ErrorOverlay.showBlocking`
was already child-safe — raw errors are logged rather than rendered, and the
connection failure already offers "Back to the menu". I said otherwise in
yesterday's handover; that was a grep truncated at 8 lines, not a finding.

The animal card replaces `AnimalDetailsPopup`. Measured against
the live display list at 812×325, 812×375 and 1024×768 with a throwaway
Playwright spec: nothing on the main face or the More face falls off screen at
any of them, and the card is one container at depth 800. Screenshotted all
three faces on the 812×325 web clip — the tightest viewport — and they read
cleanly.

**Unverified.** `e2e/visual.spec.ts` is still red on a stale baseline, now four
sessions old. Nothing has run on a physical iPad. The story face is sparse on an
iPad; only checked on the clip. Nobody has tapped the new card on a device — the
handlers were fired through Phaser's own event emitter, not through real touch.

## Files
- `.claude/TRAPS.md` — read first.
- `apps/game/src/ui/animal-card-layout.ts` — the card's geometry, Phaser-free.
  `animalCardLayout(width, height)` and `moreGridLayout(card, count)`.
- `apps/game/src/game-views/AnimalCard.ts` — the three faces and the action list.
- `apps/game/src/game-views/__tests__/animal-card.test.ts` — 50 arithmetic tests;
  where the next invariant goes.
- `apps/game/src/ui/layout.ts` — the play-band contract the rest of the game uses.

## Decisions made
- **Fixed size, computed grid.** The old panel added its contents up and
  overflowed; the card takes only the viewport, and the More grid is sized
  from the box rather than the box from the grid. `animalCardLayout` has no
  animal parameter, which is the guarantee.
- **Three columns on the More face, not six full-width rows.** Six rows of 48
  plus gaps is 328px against the 261 a compact card has. Three columns leave
  each cell room for a two-line label *and* the reason it is unavailable.
- **Unavailable actions are shown, greyed, with the reason.** `canGoOnWalk` is
  now defined in terms of a new `walkBlockReason` in game-logic so the rule and
  its explanation cannot disagree. Grooming and vet reasons are local to the
  card because their predicates already were.
- **Hearts are drawn, not typed.** `♥` falls through to the colour emoji font on
  iOS, which would make hue the difference between a filled and an empty heart
  rather than fill.
- **No "Did you know?" prefix on the fact line.** Measured: the longest shipped
  fact renders 470px at 15px inside the 528 available; the prefix adds ~98px and
  pushes those facts down to 13px, under the readability floor.
- **The card is a modal at depth 800.** It dims and swallows the HUD and the nav
  bar. The old popup drew at depth 0 and left both lit and tappable behind it.

## Next step
Phase 2 of the review — the sprite contract — is the next block of real work:
findings 5 and 6, every label that decorates an animal being drawn *inside* the
animal, and six of eight animal names being illegible. Phase 1 (one layout
authority) is effectively done — `ui/layout.ts` exists and the views use it.

Two smaller things found while measuring, neither blocking:
- **The audio button is 53% covered by the plaque on paths** at 812×375, and
  53-87% on adopters and tunnel. `.top-strip { z-index: 20 }` in the short
  branch was meant to lift it and does not fully.
- **`tools/measure-screens.mjs` cannot see a control that is inside a
  scrolling ancestor and below the fold at rest.** `inOwnScroller` excuses it,
  so the one exit on the Paths screen passed the harness while hanging 8px off
  the bottom. Widening the check is review Phase 5 item (c); it will light up
  every picker item on 23 screens, so it needs the triage budget to go with it.

## Traps
- **A `sticky` exit is bounded by its parent box.** `.secondary-row` works
  because its parent has 120px of padding below it; `.paths-footer` is the last
  child of a plaque with none, so `bottom: 4px` floated it *up* over the cards.
  Give the parent slack or take the height out of the layout instead.
- **`createButton` grows past the width you ask for** — 28px padding each side.
  Fine in a centred row, an overlap in a fixed-cell grid.
- **Walk is offered to a sick animal.** `canGoOnWalk` never checked illness and
  still does not; the card makes it visible rather than causing it. Left alone
  deliberately — it is a game-rules decision, not a layout one.
- **The app is 812×375; the web clip is 812×325.** Say which you mean.
- **Bash `cd` persists between calls.** Use absolute paths.
- The pnpm store can vanish mid-session; `pnpm install --frozen-lockfile` from
  the repo root fixes it in seconds.
- Rotating the simulator needs Marcus — `osascript` is refused assistive access.
- `renderView()` draws the rail **and** the HUD. Never call `renderHUD()` beside it.
