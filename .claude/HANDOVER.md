# A.R.C. on a phone — handover 2026-08-30

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree, one commit today. Typecheck clean, lint 0 errors / 38 warnings,
1084 tests pass (1030 + 54 new).

**Verified.** The animal card replaces `AnimalDetailsPopup`. Measured against
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
Phase 0 of the review — the two dead ends — is the highest-value work left and
is not finished. `_short-landscape.css` makes `.secondary-row` and `.footer-row`
sticky, which should have unblocked adoption's `← Not yet, let me hug her first`,
but **nothing has re-measured it since**, and paths.html's `← Back to Luna`
(`:1331`) is a bare `.link-btn` that may not be in a sticky row at all. Measure
both before assuming. `ErrorOverlay.showBlocking` still has no "Keep playing"
button and still prints `e.message` — that one is definitely open.

## Traps
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
