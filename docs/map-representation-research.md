# Map representation — research task (parked, blocking)

**Status:** Open. The current `apps/game/public/admin/map.html` has serious
visual issues. Before we wire the map into `InGameOverlay` (status doc
follow-up #8) we need to settle on a representational style that works
for kids and matches A.R.C.'s painted-storybook treatment.

This file is the brief for the research itself — not the design.

## The map's job in A.R.C.

The world map shows Birchington / "Birchie" — a real coastal Kent
village we've fictionalised. Things that need to live on it:

- **The Rescue Centre** itself — primary anchor
- **Bay Road Vets** — first vet destination
- **5 supply-run depots** — Goose End Farm, Wyx Park pet show ground,
  Rock On Music Academy, the Viking Road households, etc.
- **The 32 adopter households** — clusters by area
- **Hedgehog-crossing hotspots** — animation flag for driving scenes
- **Player-route lines** — current PTV route, recent trips
- **Status pins** — sick animal awaiting vet run, supply low at depot,
  adoption application pending

Constraints:

- The reader is a 6–9-year-old.
- The art system is painted watercolour storybook (not vector clean,
  not isometric pixel-art).
- Real coastal geography needs to read truthfully (sea to the north,
  Minnis Bay, the Old Town, etc.) — Lily knows this map IRL.
- Map is opened often during a session (every drive, every supply run),
  so it must be fast to scan, not a separate destination in itself.
- Will sit inside an iframe overlay over the Phaser scene (same pattern
  as auth + admin pages).

## What's wrong with the current `map.html`

To document during the research itself — capture screenshots and
specific complaints. Likely candidates from prior conversations:

- Painted geography reads as patchy / inconsistent across zoom levels
- Pin placement is hard to gauge against the soft watercolour wash
- Signposts and labels fight the painted style
- Zoom levels behave inconsistently (pin density, pin scale)
- No clear visual hierarchy between "where things are" and "where I'm
  being told to look right now"

(Re-verify by opening `map.html` standalone before starting the research.)

## Research questions

1. **Genre comparables** — how do other kid-facing simulation /
   management games render their world maps?
   - *Stardew Valley* (community map)
   - *Animal Crossing: New Horizons* (island map, Nook-shop pin maps)
   - *Bluey: The Videogame* (kid age band match)
   - *My Time at Sandrock / Portia* (settlement map)
   - *Toca Life World* (closest kid-game age match)
   - *Sneaky Sasquatch* (cosy painted style)
   - Cosy mobile management games (*Cats & Soup*, *Spirit City*)
   - Storybook apps (*Sago Mini*, *Toca Boca World map*)

2. **Treatment options** to evaluate against the painted-storybook
   style:
   - **Hand-painted illustrated map** with stylised landmarks and
     hand-lettered labels (Stardew-style)
   - **Soft cartoon top-down** with simplified shapes and large icons
     (Toca-style)
   - **Faux-3D axonometric** — diagonal projection, buildings have
     painted facades (Animal Crossing-style)
   - **Schematic / pictorial hybrid** — geographically inaccurate
     but legible like a treasure map (less truthful re Birchie
     geography)
   - **Layered painting + flat overlay** — painted base, vector pins
     and route lines on top (most pragmatic)

3. **Pin / marker design** — how do these games avoid the "vector pins
   on painted bg" mismatch?
   - Painted polaroid-style markers (we already use this elsewhere)
   - Hand-drawn arrows with shadows
   - Animated bouncing icons
   - Flag posts / signpost pictograms

4. **Zoom + interaction** — how do they handle zoom levels?
   - Discrete zoom snaps vs continuous pinch-zoom
   - Pin density culling
   - Smart label fading
   - "Mini-map in a corner + full map on tap" vs single shared map

5. **Routing / pathfinding** — how do they show "you are going from A
   to B"?
   - Animated dashed path
   - Painted breadcrumb trail
   - "Cute vehicle moving along the route" preview

6. **Status / attention pins** — how do they say "look here, something
   needs you"?
   - Pulse animation
   - "!" sticker overlay
   - Coloured halo
   - Sound-cue + camera nudge

## Deliverable

A short doc — `docs/map-treatment.md` — with:

1. A page of annotated screenshots from 4–6 comparable games.
2. A recommendation for which treatment family to pursue.
3. A pin / marker / route specification that fits the painted style.
4. A list of issues from the current `map.html` we'll fix in the
   redo, plus issues we'll consciously park.

Once that lands, the actual map redo becomes a normal art-and-wiring
task: brief Manus or OpenAI for the painted base; build the overlay
in `apps/game/public/admin/map.html` with the chosen pin/route style;
wire to `InGameOverlay`.

## Effort estimate

- Research + writeup: 1–2 hours of focused web/image research +
  screenshot annotation.
- Repaint of base map: half a day (Manus or OpenAI), depending on
  whether we keep the existing geography or restart.
- Pin / route layer: 2–4 hours of HTML + CSS once spec is locked.
- InGameOverlay wiring: 1–2 hours.
