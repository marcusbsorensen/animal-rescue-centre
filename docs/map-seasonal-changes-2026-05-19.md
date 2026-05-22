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
  Bay sands (don't currently exist on the map).
- Visible spring / summer / autumn; **hidden in winter** (cross-faded).

## Seasonal vehicle behaviour

| Vehicle | Spring | Summer | Autumn | Winter |
|---|---|---|---|---|
| Tractors (`.tractor-west/east`) | working | working | working | **off** |
| Cargo ships (`.ship-anim`, `.ship-anim-3`) | yes | yes | yes | yes |
| Cruise ship / ferry (`.ship-anim-2`) | yes | yes | yes | **off** |

Tractors are wrapped in a `.tractor-wrap` group so the seasonal opacity
cross-fade doesn't fight the existing per-field driving animation
(whose keyframes already animate opacity at the field edges).

## Default

`map.html` always sets `data-season`; if it can't resolve the in-game
season it infers from the real-world calendar month (UK). The SVG's
bare fills (no attribute) remain a summery fallback.
