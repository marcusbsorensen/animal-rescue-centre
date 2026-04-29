# Map representation — research task (parked, blocking)

**Status:** Open. The current `apps/game/public/admin/map.html` has serious
visual issues. Before we wire the map into `InGameOverlay` (status doc
follow-up #8) we need to settle on a representational style that works
for kids and matches A.R.C.'s painted-storybook treatment.

This file is the brief for the research itself — not the design.

## Two artefacts, not one

Marcus's clarification (2026-04-29): there are **two** map renderings,
and they have different jobs. They share data (same coordinates, same
landmark IDs, same route lines) but render very differently:

### 1. The main world map — discovered over time

A storybook artefact. Lily opens it from the rescue-centre HUD or
menu. It's where she:

- **Sees the world she's in** — Birchie as a coherent place, not a
  list of menu options.
- **Discovers landmarks** — fog-of-war / undrawn / "?"-icon zones
  reveal as she earns access (first vet run unlocks Bay Road Vets,
  first rewilding unlocks the moorland, etc.).
- **Browses past trips** — recent route trails as faint paint marks.
- **Reads status** — pulsing pins for sick animals, full depots,
  pending adoption applications.
- **Earns a sense of progress** — "look how much of Birchie I know
  now" as the discovered area grows.

Tonally rich: hand-lettering, painted watercolour, illustrated
landmarks, decorative ornament. Worth dwelling on. Discoverable.

### 2. The in-vehicle GPS — utilitarian, derivable

A dashboard satnav. Shown live during a PTV / Supply Run drive. Its
job is decision-support while the kid is "driving":

- **Where am I right now** — vehicle pin advancing along the route.
- **Where am I going** — destination highlighted, ETA in seconds.
- **What's coming up** — hedgehog crossings ahead, fuel stops,
  speeding zones, the car-wash inflatable on this leg.
- **Quick re-route** — tap a different destination to swap.

Should be readable from a glance while the dashboard owns the rest of
the screen. Heavy decoration is a *negative* here — it competes with
the cockpit. Should feel like the same world as the main map, but
flattened, simplified, and high-contrast for at-speed glanceability.

**Important: the GPS is a derivative of the main map**, not a
standalone artefact. We pick the main-map treatment first; the GPS
variant is then a stripped-down render of the same data — same
coordinate system, same landmark IDs, same route line, but with
fewer landmarks visible (only those on or adjacent to the current
route), simplified label chrome, and a vehicle pin layered on top.

This means the design work fans out:

1. Pick the **main-map treatment** (one of the three options below).
2. Define the **discovery system** for the main map (fog reveal,
   "?"-icons, unlock triggers).
3. Derive the **GPS variant** as a simplified render of the chosen
   main-map treatment.

## What needs to live on the world map

- **The Rescue Centre** itself — primary anchor
- **Bay Road Vets** — first vet destination
- **5 supply-run depots** — Goose End Farm, Wyx Park pet show ground,
  Rock On Music Academy, the Viking Road households, etc.
- **The 32 adopter households** — clusters by area
- **Hedgehog-crossing hotspots** — animation flag for driving scenes
- **Player-route lines** — current PTV route, recent trips
- **Status pins** — sick animal awaiting vet run, supply low at depot,
  adoption application pending
- **Discovery state** — undiscovered landmarks shown as fog / "?"
  icons / undrawn until unlocked.

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
