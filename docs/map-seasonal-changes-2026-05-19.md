# Overview map — seasonal changes

> Status: Approved for build, 2026-05-19. The world map
> (`birchie-roads.svg`) should change with the in-game season, which
> the game already tracks (`calendar.ts`: spring/summer/autumn/winter).

## Mechanism

- `map.html`'s existing `applySeason()` is extended to also set a
  `data-season` attribute on the world-map SVG root.
- The SVG carries a `<style>` block keyed on `[data-season="…"]` that
  retints the big land/sea groups and toggles seasonal layers.
- **Cross-fade**, not snap: `transition: fill 1.1s` on retinted groups,
  `transition: opacity 1.1s` on show/hide layers. Changing the
  attribute animates everything smoothly.

## Per-season retinting (cross-faded fills)

| Group | Spring | Summer | Autumn | Winter |
|---|---|---|---|---|
| `#sea-bg` | bright blue | warm turquoise | grey-blue | steel-blue |
| `#land` | warm tan | warm tan | tan | frost-pale tan |
| `#farmland` | young green | gold-green | pale gold stubble | frost-grey |
| `#green-areas` | fresh green | lush green | amber-green | sage-grey |
| `#woodland` | light green | deep green | rust/orange | bare brown |

## Seasonal layers (cross-faded opacity)

- `#deco-blossom` — drifting pink petals (spring only)
- `#deco-leaves` — drifting orange leaves (autumn only)
- `#deco-snow` — drifting snowflakes (winter only)
- summer: no decoration layer

## Winter-only additions

- `#winter-snowcaps` — white snow caps on every pitched roof
  (glasshouse, Birchie Station, Jolly Jim's, Wyx Farm Shop)
- `#winter-ice` — pale ice sheet over the SW pond
- `#winter-grotto` — Santa's grotto at Wyx Park (the real Quex Park
  runs one every December)
- `#winter-snowmen` — two snowmen out in the farmland fields

## Beach huts at Minnis Bay

- New `#beach-huts` — a row of colourful painted huts on the Minnis
  Bay sands.
- Visible spring / summer / autumn; **hidden in winter** (cross-faded).
- Where they stand (2026-10-11): on the long green grass strip along the
  Minnis Bay shore, west of the A.R.C. plot (SVG x 33 to 190, y 375 to
  414), each tilted to the strip's slope. They were first drawn as a
  straight row across the Grenham Bay headland, the first two in the sea.
  The season CSS names `#beach-huts`, so the group keeps that id.

## Seasonal vehicle behaviour

| Vehicle | Spring | Summer | Autumn | Winter |
|---|---|---|---|---|
| Tractors (`.tractor-west/east`) | working | working | working | **off** |
| Cargo ships (`.ship-anim`, `.ship-anim-3`) | yes | yes | yes | yes |
| Cruise ship / ferry (`.ship-anim-2`) | yes | yes | yes | **off** |

Tractors are wrapped in a `.tractor-wrap` group so the seasonal opacity
cross-fade doesn't fight the existing per-field driving animation
(whose keyframes already animate opacity at the field edges).

### Where the tractors run (2026-10-11)

Each tractor works one farm field, at full size (80x44 and 100x42), and the
run is the strip its visible body sweeps (the PNGs carry transparent margins),
declared as `data-run="x0 y0 x1 y1"` on its `.tractor-wrap`:

| Tractor | Field (farmland polygon) | Strip | Travel |
|---|---|---|---|
| west (`tractor-classic.png`, travels west) | 24, south of Goose End | x 536-774, y 838-874 | 194 |
| east (`tractor-with-trailer.png`, travels east) | 17, south-east | x 1272-1486, y 854-890 | 143 |

Before this the west tractor crossed a road at x 439-451 and ran along another
at 618-704, and the east one ended on a road at 1522-1603: the runs (420 and
330) were longer than the fields they were drawn for. The new strips are wholly
inside one field, at least 4 units from any road's drawn edge, and not under a
park, wood, pond or the golf course. `map-tractors-and-labels.test.ts` holds
all of that, and the tractors' size, so a road edit or a shrink fails there.
A run that could not fit would be reported, not shrunk (Marcus's decision).

**The winter switch** is `svg[data-season="winter"] .tractor-wrap { opacity: 0 }`
in the SVG's own `<style>`; `map.html` sets `data-season` on the SVG root
(`applySeasonToWorldSvg`, from `?season=`, the host's `season` message or the real
month), and the test above checks the rule and the call. Verified live in all four
seasons (computed opacity of both wraps: 1, 1, 1 in spring, summer, autumn; 0 in
winter, with the ferry and the beach huts, which follow the same rule). `intro.html`
embeds the bare SVG with no season, so its tractors work all year; the drive scene
spawns tractors all year too (a separate job).

## Labels (2026-10-11)

The SVG's own label sizes are in map units, 22 for a place and 14 for a service
stop, which is 8px and 5px at the iPhone's full-map frame (874x402). `map.html`
sets every `text.poi-label` at a screen size instead (18px a place, 16px the rest,
the type floor `--fs-floor`), whatever the frame's zoom, with a cream fill and a
dark halo, and places it by one rule: **pins first.** See "Names and labels" in
`map.html`, and the `.claude/TRAPS.md` entry of the same date for what still
collides. The SVG gives each label `data-tier`, and `data-for` naming the
`.poi-icon` it stands beside; the three bay names sit after the ships in the
document so a ship passes under a name. Santa's Grotto's label has its place all
year and is only shown in winter, so a change of season moves no other text.

## Default

`map.html` always sets `data-season`; if it can't resolve the in-game
season it infers from the real-world calendar month (UK). The SVG's
bare fills (no attribute) remain a summery fallback.
