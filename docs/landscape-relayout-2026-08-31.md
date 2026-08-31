# Landscape relayout — nav down the side

**Status:** prototyped behind `?sideRail=1`, measured in Chrome at
874x402, not yet seen on a device. Written 2026-08-31 from Marcus's
suggestion after seeing GameScene on a landscape iPhone for the first
time; the art-fitting section was corrected the same day after the
numbers in it were checked against the files.

## The idea

Move the bottom nav bar to a vertical rail on the left, icons only.
Left-align the status currently centred at the top. Show pet info
pop-ups on the right. Leave the centre to the room.

Conceptually it splits cleanly:

| Edge | Holds | Why |
|---|---|---|
| Left | Navigation — Home, Care, Supplies, Walk, Social | What the child *does* |
| Right | Arrivals, pet info panels | What the child is *told* |
| Centre | The room | The thing being played |

## Why it is worth doing

Vertical is the scarce resource in landscape and we spend it freely.

On an iPhone 17 Pro (874x402pt), today:

- `HUD_HEIGHT` 110 + `NAV_HEIGHT_SHORT` 78 = **188pt of chrome**, top and bottom
- play area **768x214** — 53% of the screen height for the actual game

With navigation moved to a ~72pt left rail and the HUD absorbed into it:

- play area **752x394** — 98% of the height
- **+180pt of vertical, an 84% taller play box**, for 16pt of width

That is the largest single gain available to the play area, and it costs
almost nothing horizontally: 874pt across is plentiful, 402 down is not.

## The catch that was not one

**Corrected 2026-08-31, after measuring.** This section used to say room
art would be squashed ~1.9x by the move and costed a re-paint of all 27
backgrounds off the back of it. That was wrong, and the error is worth
recording because it is an easy one to repeat.

The 3.59 figure is what `playAreaFor(874, 402)` returns — 768x214. It is
**not** the aspect the art was authored at, and no background is ever
drawn into that box. `playAreaFor` governs anchors and animal sizing;
the art is drawn to `play.w x (height - 40)`, deliberately, so it bleeds
behind the chrome.

Measured, from the files and from the running scene:

| | Art drawn into | Aspect | Against art's 1.78 |
|---|---|---|---|
| Bottom bar (today) | 768 x 362 | 2.12 | **1.19x stretch** |
| Side rail | 696 x 402 | 1.73 | **1.03x** |

All 27 backgrounds on disk are 16:9 — `1280x720` or `800x446`, uniformly.
So the side rail draws the rooms **closer to their own shape than the
current layout does**, and the fitting question mostly dissolves: at a 3%
squash neither `cover` (which crops) nor `contain` (which gives the
height back) earns its cost. Leave the fit alone.

Visible room area goes from 768x214 to 696x402 — **1.70x more room on
screen**.

## The quieter prize

`anchorSpaceFor` describes itself as "a compromise, not a free win": on a
short viewport the art fills the screen while anchors resolve against the
play band, so an animal the art puts on the painted floor stands a little
above that floor line. That exists because the art rect and the anchor
rect are different rects.

Under the side rail they are the same rect, and the compromise has
nothing left to correct. That is arguably worth more than the height.

## Second catch: thumb reach

Held in landscape, a child's thumbs sit near the bottom two corners. A
rail spanning the full height puts its top items where small hands
cannot go without regripping — worse for a 7-year-old than an adult.

The rail's controls should cluster in the **lower two-thirds** or be
bottom-anchored, not distributed evenly top to bottom. This is the part
most likely to be designed wrong on a desktop and only discovered on a
device.

## Open questions

- **Does the Supplies FAB survive?** It is a raised centre button
  (`NavBarView.ts:9`, `fabY = barY + fabLift`), a pattern that means
  nothing in a vertical rail. It also deserves asking whether *Supplies*
  earns the most prominent slot at all — the primary loop is caring for
  animals, not restocking the depot.
- **Where does the arrivals rail go?** It is on the left today and was
  just fixed to clear the Dynamic Island (`c7a173e`). Under this proposal
  it moves right and that work moves with it.
- **What happens on iPad?** At ≥1133 wide the rail already stands open at
  280pt and vertical is not scarce. The side-nav may be a phone-only
  layout, which means two arrangements to maintain.
- **The notch swaps sides.** Info.plist allows both landscape
  orientations; the Dynamic Island is on the left in one and the right in
  the other. Whichever edge holds navigation needs the inset applied, and
  `ui/safe-area.ts` currently only feeds the left.

## What has been built

A prototype behind `?sideRail=1`, default off. `?sideRail=0` turns it
back off and the choice is remembered in `localStorage`, because
retyping a query string into mobile Safari to compare two layouts is the
friction that stops the comparison being made.

- `ui/layout.ts` — `NAV_RAIL_WIDTH`, the `sideNav` switch, and
  `playAreaFor` / `railBoundsFor` / `anchorSpaceFor` branching on it.
- `game-views/NavRailView.ts` — the vertical rail.
- `game-views/CorridorView.ts` — art drawn into the play box.
- `e2e/side-rail.spec.ts` — shoots both layouts at 874x402 and measures
  the display list. `game-views/__tests__/side-nav-layout.test.ts` holds
  the geometry.

Decisions taken while building it:

- **Four rail items, not five.** A cell is 56 (MIN_TAP + 8) and gaps are
  MIN_TAP_GAP, so five need 328 of 402: bottom-anchored, the stack still
  starts 16% down, which is not reachable. Four need 260 and start 33%
  down — the lower two-thirds this doc asked for. So "bottom-weighted
  rail" and "five nav items" were never compatible.
- **Supplies is the item that went**, into Care. The FAB gave the least
  important of the five the most prominent control in the game.
- **The labels stayed.** This doc proposed icons only; the bar's 15/16px
  type is at the readability floor for a 7-11 year old and was
  explicitly not traded for layout before. 72pt fits "Social" at 15px.
- **The HUD still draws, but no longer reserves.** Its ink is two shallow
  rows ending at y 106 while `HUD_HEIGHT` reserved 110 of a 402pt screen.
  It now floats over the art, spread to the play area's edges rather than
  boxed into a centred 600.

## Still open

- **The right-hand inset.** The arrivals rail moved to the right edge and
  `ui/safe-area.ts` only reads `left`. In the other landscape orientation
  the Dynamic Island lands on that edge.
- **The bottom inset.** The rail's last control sits 10pt off the bottom;
  the web clip reports `safe-area-inset-bottom: 20px`. Same missing
  reading, same fix.
- **The other views.** Only the corridor draws into the play box so far.
  Room, Kitchen and Garden still use `height - 40`, and KitchenView draws
  at full `width` rather than `play.w`, so it runs under the rail.
- **The kitchen folds when it no longer needs to.** `twoColumn` keys on
  viewport height, so at 402 it still folds sideways even though the band
  is now 402 rather than 137.
- **iPad.** At >=1133 wide the arrivals rail stands open at 280 and
  vertical is not scarce, so this may be a phone-only layout — two
  arrangements to maintain.
- **Real thumbs.** Everything above is measured geometry. Whether a
  7-year-old can work the rail is not a thing arithmetic answers.

## Files this touches

- `apps/game/src/ui/layout.ts` — `playAreaFor`, `railBoundsFor`, `navHeightFor`
- `apps/game/src/game-views/NavBarView.ts` — the bar and the FAB
- `apps/game/src/game-views/LeftRailView.ts` — arrivals, if it moves right
- `apps/game/src/game-views/HUDView.ts` — the top status
- `apps/game/src/game-views/CorridorView.ts` and siblings — background fitting
- `apps/game/src/ui/safe-area.ts` — right inset, for the other orientation
