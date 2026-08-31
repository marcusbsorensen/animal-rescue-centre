# Landscape relayout — nav down the side

**Status:** proposal, not started. Written 2026-08-31 from Marcus's
suggestion after seeing GameScene on a landscape iPhone for the first
time.

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

## The catch, and it is a real one

**Room backgrounds are stretched, not fitted.** `CorridorView.ts:64`:

```
bg.setDisplaySize(play.w, height - 40);
```

No `cover`, no `contain`, no aspect preservation. The painted room is
squashed to whatever box it is given.

The play box aspect goes **3.59 → 1.91** — it nearly halves. Every
room painting is authored for a long, letterbox-shaped space and would
be vertically stretched by roughly 1.9x. Corridors would look like they had
been squeezed from the sides; the animals, sized from the same box, would
stretch with them.

So this is not a UI move. **It is a change to how room art is fitted**,
and that has to be decided before any chrome moves.

Three options, in increasing cost:

1. **Fit with `cover` and crop.** Keep the art's aspect, fill the taller
   box, lose the left and right edges of each painting. Cheap, but the
   rooms were composed for their full width — door signs sit near the
   edges and are what a child taps.
2. **Fit with `contain` and fill the margin.** Keep the whole painting,
   letterbox it, paint the surround (wall colour, floor continuation).
   No art re-authoring, but the gained height is partly given back.
3. **Re-paint the rooms for the new aspect.** Correct, and the largest
   job by far.

The anchors themselves are **not** the problem, contrary to first
impressions. `RoomAnchors` stores them as 0..1 fractions of the
background (`lib/RoomAnchors.ts:21`), so they follow whatever box the art
is drawn into. The layout.ts warning is about art and anchors using the
*same* box, which the views already do. Whichever fitting option is
chosen, anchors come along — provided the background keeps being drawn
into the play box rather than, as now, `height - 40`.

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

## Suggested sequence

1. **Decide the art fitting** (the three options above). Nothing else can
   start until this is settled — everything downstream depends on it.
2. **Prototype the corridor only**, on a device, with the chosen fitting.
   One view, no commitment, real thumbs.
3. Move `navHeightFor` / `HUD_HEIGHT` out of `playAreaFor` and introduce
   a `navRailWidthFor`, keeping the pure-function-plus-tests shape.
4. Port the remaining views; each lays out from `playAreaFor` already, so
   this should be mechanical once step 1 is right.
5. Re-walk the whole flow on the simulator. The harness measures shapes
   and will not catch a stretched room.

## Files this touches

- `apps/game/src/ui/layout.ts` — `playAreaFor`, `railBoundsFor`, `navHeightFor`
- `apps/game/src/game-views/NavBarView.ts` — the bar and the FAB
- `apps/game/src/game-views/LeftRailView.ts` — arrivals, if it moves right
- `apps/game/src/game-views/HUDView.ts` — the top status
- `apps/game/src/game-views/CorridorView.ts` and siblings — background fitting
- `apps/game/src/ui/safe-area.ts` — right inset, for the other orientation
