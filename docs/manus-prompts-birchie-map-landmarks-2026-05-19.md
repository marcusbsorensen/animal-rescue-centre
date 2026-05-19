# Manus prompt list — Birchie map landmarks (painted PNG set)

**Output directory:** `/Users/marcus/Projects/animal-rescue-centre/manus-output/birchie-map-landmarks/`

Replaces all the in-SVG vector icons + the three existing ship PNGs on the
Birchie overview map. The current SVG markers (golf flag, tree, train,
bouncy castle, barn, house, fuel pump, car-wash character) and the three
Manus-painted ships from the previous round all read as inconsistent.
This batch standardises everything on the **same painted-watercolour
storybook style as the ARC Art Deco building** so every landmark on the
map feels like it belongs to the same world.

## Master style brief (apply to every asset)

**Reference:** `/Users/marcus/Projects/animal-rescue-centre/apps/game/public/admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-main-building.png`
(the painted Art Deco rescue-centre building — cream walls, sage dome,
blue-grey windows, soft natural shadows, watercolour edges, no hard
linework). **Match its style exactly.**

- Hand-painted watercolour storybook feel — visible brushstrokes, soft
  natural shadows, no hard cartoon outlines
- Warm friendly kid-coded palette (think Beatrix Potter meets modern
  village). Reference colours:
  - Cream / paper: `#fef9ef`
  - Honey amber: `#f0c870`
  - Sage green: `#a8c890`
  - Weathered brown: `#7b5c3a`
  - Deep brown: `#3a2613`
  - Soft sky blue: `#a0cfff`
  - Red accent: `#d63838`
- **Transparent PNG. NO white halo, NO grey checkerboard background,
  NO opaque rectangle behind the subject.** The previous cargo-ship-small
  delivery had a hard grey rectangle baked into the alpha — that must
  not happen again. The asset's silhouette must be clean against ANY
  background colour.
- Top-down or 3/4 view as specified per asset (map landmarks read as
  top-down icons; ships and tractors are side-on)
- Resolution + filename as specified per asset

---

## The asset list

### 1. `petrol-station-topdown.png` — 400×280 px, transparent PNG, top-down

Painted top-down view of a small village petrol station. A tarmac
forecourt with two cream-and-red pumps facing the road, hoses
hanging neatly, a flat-roofed cream shop building (sage-green tile
canopy) tucked at one side, a yellow round forecourt sign on a tall
pole (paint a stylised "P" or fuel droplet on the sign — no brand
names). Painted weathered tarmac with subtle tyre marks. Warm
painted-storybook style matching the ARC building reference.

### 2. `suds-n-steves-topdown.png` — 500×400 px, transparent PNG, top-down 3/4

A cheerful uniformed character (call him Steve) standing beside a
shiny red hatchback car, mid-scrub with a yellow sponge — water
spraying, bubbles flying everywhere, suds dripping off the car bonnet.
Steve has a blue cap, yellow shirt, blue dungarees, exaggerated
joyful grin (comedy-coded). Behind him: a small cream wash bay
with a sage-green tile roof and a hanging shop sign reading
"SUDS 'N' STEVE'S". Painted watercolour storybook style matching
the ARC building reference. Steve should be deliberately a bit
bigger than realistic relative to the car — character first, scale
second.

### 3. `ship-cargo-large.png` — 600×200 px, transparent PNG, side view facing left

Painted side view of a stylised storybook cargo container ship in
dark navy blue (`#324664`-ish). Bright shipping containers stacked
two-high across the deck in red, yellow, blue, and orange. A cream
bridge cabin towards the stern with rows of small windows. Single
funnel with a red band near the top. White foam at the waterline.
Warm painted watercolour style matching the ARC building reference.
**Important: the painted hull must be a continuous solid silhouette —
no transparent gaps between containers, no see-through windows that
would reveal the map behind the ship when it animates over the sea.**

### 4. `ship-cargo-small.png` — 480×170 px, transparent PNG, side view facing left

Same style as the large cargo ship but smaller and simpler — just
three or four containers stacked in one row, one bridge cabin, one
funnel. Dark navy hull (`#324664`). Same "no holes in the hull"
requirement as #3.

### 5. `ship-passenger-ferry.png` — 540×220 px, transparent PNG, side view facing left

Painted side view of a friendly passenger ferry. Multiple decks of
cream-coloured superstructure with rows of small soft-blue windows,
red waterline stripe, two cream funnels with red caps. Cheerful
storybook style. Foam wake at the bow. Solid silhouette — same
no-holes requirement as the cargo ships.

### 6. `tractor-classic-west.png` — 200×120 px, transparent PNG, side view facing LEFT

Painted side view of a small classic red farm tractor — big chunky
black rear tyres, smaller front tyres, tall exhaust stack with a
puff of grey smoke, cream cab with two tiny side windows. Friendly
cartoon proportions but painted in watercolour storybook style
matching the ARC building reference. **Facing LEFT (the tractor's
nose / driving direction is to the LEFT).**

### 7. `tractor-with-trailer-east.png` — 280×120 px, transparent PNG, side view facing RIGHT

Painted side view of a blue farm tractor pulling a green hay
trailer. Trailer carries three or four golden straw bales stacked
on top. Tractor has a cream cab with windows, big black rear
tyres, a small exhaust. Storybook proportions. **Facing RIGHT
(nose / driving direction is to the RIGHT).**

### 8. `glasshouse-acres-topdown.png` — 320×180 px, transparent PNG, top-down

Painted top-down view of a small Thanet-style glasshouse complex.
Six long pitched-glass roofs in parallel, glass with a soft
blue-green tint and subtle reflections, dark gable ridges down the
centre of each roof, cream service building / shed at one end with
a small chimney, narrow tarmac yard with a couple of stacked
wooden crates. Sage-green hedge or low wall around the perimeter.
Painted watercolour style matching the ARC reference.

### 9. `golf-hole-flag-topdown.png` — 100×100 px, transparent PNG, top-down

A small painted top-down icon of a putting green (lighter green
oval with subtle texture), a dark hole, a thin black flagpole, and
a red triangular flag waving slightly. Tiny sand bunker on one
side. Storybook painted style. Plenty of character despite the
small size.

### 10. `wyx-park-tree-topdown.png` — 120×120 px, transparent PNG, top-down

A painted top-down icon of a stylised broadleaf tree — round canopy
in three shades of sage / forest green with a sunlit highlight on
the top-left, brown trunk just peeking from under the canopy.
Should match the painted style of the existing seasonal trees in
`/admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-tree-*.png`
but viewed from directly above.

### 11. `wyx-park-scarecrow.png` — 200×280 px, transparent PNG, front view

A painted front-view of a friendly scarecrow standing on a wooden
cross — stitched smile, straw hat (a bit battered), red-and-blue
plaid shirt, blue dungarees with a patch on the knee, straw poking
out of the cuffs and ankles, one button eye and one cross-stitch
eye for character. Warm storybook watercolour. Welcoming, not
spooky. (For the interior of Wyx Park.)

### 12. `birchie-station-topdown.png` — 300×180 px, transparent PNG, top-down 3/4

A painted small village railway station building viewed from a
slight 3/4 angle. Red-tiled pitched roof, cream walls, two arched
windows with sage-green frames, a small station clock on the front
gable, a hanging wooden sign reading "BIRCHIE STATION", a strip of
platform along one side with a single black bench. A short stretch
of dark twin rails leaving each end of the platform. Painted
storybook watercolour matching the ARC reference.

### 13. `jolly-jims-bouncy-castle.png` — 280×220 px, transparent PNG, 3/4 view

Painted 3/4-view of a kid-friendly bouncy castle: red, yellow, and
blue inflatable stripes, a star-pattern arch over the entrance,
small golden flags or pennants flapping on each of the four
turrets, a fenced grassy patch underneath. Bright, joyful,
storybook watercolour. (Echoes the real Jungle Jims Ltd — soft-play
near Quex Park.)

### 14. `wyx-farm-shop.png` — 260×220 px, transparent PNG, 3/4 view

Painted 3/4-view of a cream weather-boarded farm shop with a
dark-red corrugated pitched roof. Red barn door with a white X
cross. Hanging wooden sign reading "WYX FARM SHOP". Baskets of
fresh veg outside the door (orange carrots, red apples, an orange
pumpkin). Bunting strung along the eaves. Painted watercolour
storybook style. (Echoes the real Quex Barn farm shop.)

### 15. `birchie-pond-topdown.png` — 140×120 px, transparent PNG, top-down

A painted top-down icon of a small village pond — kidney-shape blue
water with subtle ripple texture, a fringe of reeds around the
edge, one cheerful yellow duck swimming on the surface. Storybook
watercolour. (For the SW farmland pond.)

---

## Asset → SVG wiring (for the implementer after delivery)

After Manus delivers the PNGs, swap the SVG vector icons for
`<image href="..." />` elements:

| Asset | Replaces in `birchie-roads.svg` | Approximate SVG coord |
|---|---|---|
| petrol-station-topdown | `.fuel-marker` group | translate(380, 738), size ~40×28 |
| suds-n-steves-topdown | `#wash-bandits` group | translate(500, 673), size ~60×48 |
| ship-cargo-large | existing `cargo-ship-large.png` | y=50, w=180 h=60 |
| ship-cargo-small | existing `cargo-ship-small.png` | y=185, w=135 h=48 |
| ship-passenger-ferry | existing `passenger-ferry.png` | y=115, w=160 h=65 |
| tractor-classic-west | existing `tractor-classic.png` | y=920, w=80 h=44 |
| tractor-with-trailer-east | existing `tractor-with-trailer.png` | y=900, w=100 h=42 |
| glasshouse-acres-topdown | `#glasshouse-acres` SVG group | translate(840, 1000), size ~155×88 |
| golf-hole-flag-topdown | `.poi-icon` inside Westbeach Golf | size ~40×40, above label |
| wyx-park-tree-topdown | `.poi-icon` inside Wyx Park | size ~40×40, above label |
| birchie-station-topdown | `.poi-icon` inside Birchie Station | size ~60×40, above label |
| jolly-jims-bouncy-castle | `.poi-icon` inside Jolly Jim's | size ~50×40, above label |
| wyx-farm-shop | `.poi-icon` inside Wyx Farm Shop | size ~50×40, above label |
| birchie-pond-topdown | the SW pond ellipse pair | center on (240, 880), size ~50×40 |
| wyx-park-scarecrow | NEW addition — place inside Wyx Park polygon | translate(1000, 770), size ~40×56 |

---

## Final notes for Manus

- Render each asset on a **fully transparent canvas**. Verify by
  toggling the file's background to bright magenta (`#ff00ff`) and
  pure black before delivery — neither should reveal any opaque
  edge halo, grey checkerboard, or rectangular bg around the
  painted subject.
- Padding: leave a 5–10 px transparent margin around the painted
  silhouette on every side of the canvas so soft edge brushstrokes
  don't get clipped when the image is composited.
- Save as PNG-32 (RGBA) with alpha. NO JPEG, NO PNG-8 indexed.
- If a previous delivery had a halo or hard-edge issue (like the
  earlier `cargo-ship-small.png`), please regenerate from scratch
  rather than patching — the painted brushwork needs to extend
  through the alpha gradient at the edges.
