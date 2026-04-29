# A.R.C. site Tier 1 — Manus brief (draft)

**Status:** Draft for Marcus's review before sending to Manus.

The Tier 1 commission delivers everything we need to render the A.R.C.
plot at game launch: the painted Art Deco main building (with rooftop
aviary visible from the start), the three on-site trees, the central
path with viewing domes, and a small library of ground texture tiles.
Future tiers add the small-mammal enclosures, the snake basking patch,
the hedgehog leaf piles, etc. — none of which Tier 1 needs to paint.

Scope per Rule 7 (`docs/manus-sprite-rules.md`): everything is either
**top-down ground texture** or **front-elevation stamp**. No isometric.
No 3/4 mixing. Each piece briefed in isolation; Manus paints the lot
in a single sitting so brushwork stays unified.

## Style anchors

If Manus cannot fetch these URLs, STOP and report back — do not
generate from description alone.

1. **Brushwork & palette**:
   `https://animal-rescue-centre.vercel.app/admin/scene-assets/cast/30-two-houses.png`
   The canonical painted-watercolour treatment. Soft warm palette, visible
   brush texture, simple confident ink outlines. Julia-Donaldson /
   Raymond-Briggs / Aardman-adjacent. Match this style exactly.

2. **In-game lawn garden**:
   `https://animal-rescue-centre.vercel.app/assets/bg/garden-lawn-summer-morning.png`
   The kid sees this scene inside the game when she lets pets out. The
   Tier 1 lawn-garden ground tile must echo it — sunny lawn, white picket
   fence, painted tree, flowerbeds, bird bath.

3. **In-game quiet garden**:
   `https://animal-rescue-centre.vercel.app/assets/bg/garden-quiet-summer-afternoon.png`
   The other in-game garden — hedged nook, archway, ferns, log seating.
   Tier 1 quiet-garden tile echoes this.

4. **Map composition reference**:
   `https://animal-rescue-centre.vercel.app/admin/scene-assets/reference/birchie-style-direction/fantasy-kingdom.jpg`
   Note ONLY for hybrid-projection direction — see how each building is
   front-on while the ground is top-down. Use that convention. Do not
   match the rendering style itself (too video-game-clean for our target).

5. **Modular stamp vocabulary**:
   `https://animal-rescue-centre.vercel.app/admin/scene-assets/reference/birchie-style-direction/map-builder.jpg`
   Direction reference for "buildings as discrete painted stamps with
   transparent backgrounds." Each cottage is its own little elevation
   painting on its own transparent canvas. Match the architecture of
   that approach.

6. **Architectural direction — Birchington Art Deco**:
   The main building takes its cues from the Twentieth Century B&B on
   Minnis Road (Birchington Heritage Trust Raven Award 2019) and the
   white rounded-corner houses at 148 Minnis Road and the Waves cafe on
   The Promenade. Search reference: "Twentieth Century B&B Birchington
   Art Deco" — white render, horizontal banding, curved metal-frame
   windows, a rounded corner, often a flat roof.

## Deliverables

### A. Front-elevation stamps (transparent PNG)

**1. `arc-main-building.png` — 768 × 768 px**

The painted Art Deco rescue centre. **One painted scene** (not multiple
small stamps), because the main building, entrance canopy, and rooftop
aviary are visually integrated — paint them as one piece for stylistic
coherence.

Composition (front-elevation view, as if standing on Canute Road
looking at the front of the building):

- **Building**: 2-storey Art Deco. White rendered walls. Distinctive
  ROUNDED CORNER on one side (signature feature). Horizontal banding
  detail at floor levels. Curved metal-frame windows arranged as
  Art-Deco horizontal strips. Flat roof. A tall thin chimney or
  vent-pipe somewhere as a decorative vertical accent.
- **Front facade signage**: a large painted **A.R.C. paw-print emblem**
  prominently on the front wall (centred between/above the canopy and
  the upper windows). Soft brown/charcoal paw, painted not vector,
  generous size — visible from across the road, this is the building's
  identity mark.
- **Front entrance canopy**: small streamline-moderne curved canopy
  over the double doors, with hand-lettered text on the canopy fascia
  reading **"ANIMAL RESCUE CENTRE"** — full title spelled out, painted
  storybook hand-lettering (not vector typography). The canopy fascia
  is a natural sign band — the lettering should sit on it like a
  painted shop sign.
- **Rooftop aviary** (Tier-4 feature, painted now even though parrots
  unlock later): a curved mesh-dome cage on top of the flat roof,
  large enough to be a striking silhouette feature. Empty for now (we
  add a parrot stamp later when T4 unlocks). Match the Art Deco curve
  language — the dome should look like the building's continuation,
  not a bolted-on greenhouse.
- **Flagpole** beside or in front of the building flying a small
  **A.R.C. paw-print flag** (cream or pale-amber background with the
  same brown paw-print on it — matching the front facade emblem).
- **No painted PTV / vehicle in the commission** — the forecourt
  stays empty of vehicles. The existing
  `/assets/driving/vehicle-henry.png` sprite gets dropped over the
  top via SVG positioning later. Paint the parking bays + gravel
  forecourt only.
- **Front forecourt** painted in front of the building: gravel/asphalt
  parking with 3-4 painted parking bay lines (no vehicles), painted
  pavement leading to the canopied entrance. This portion is
  **slightly tilted top-down** to suggest the ground in front of the
  building — the building stands behind it.
- **Ambient touches**: a small painted "Welcome" sandwich-board sign
  near the entrance, a couple of pot plants or planters beside the
  door.

The whole thing on transparent background, comfortable margin around
the painting, painted-watercolour brushwork matching reference #1.

**2. `arc-tree-oak.png` — 256 × 384 px**
**3. `arc-tree-ash.png` — 256 × 384 px**
**4. `arc-tree-horse-chestnut.png` — 256 × 384 px**

Three painted mature British native deciduous trees, each a different
species so the on-site grove reads as natural rather than three clones:

- **Oak** (`Quercus robur`) — wide spreading rounded crown,
  characteristic deeply-lobed leaves, sturdy gnarly trunk
- **Ash** (`Fraxinus excelsior`) — taller more upright crown, finer
  pinnate leaves, smoother grey trunk
- **Horse chestnut** (`Aesculus hippocastanum`) — domed dense crown,
  large palmate leaves, occasional white "candle" flower spikes
  (paint a few flowering for early-summer character)

Front-elevation: trunk + full canopy visible. Transparent background,
no ground. Painted style matching reference #1. Each tree centred in
its 256×384 canvas with comfortable margin.

These are the three real trees on the green plot (visible from
satellite). They become hedgehog hibernacula + squirrel boxes when
Tier 2 (and the squirrel future tier) unlocks; for now they're just
trees.

**5. `viewing-dome-stamp.png` — 192 × 192 px**

A single low Art-Deco glass viewing dome — polished metal frame,
glass top, ~1.2m diameter painted at scale to match the path width
on the map. Front-elevation view (we see the curved canopy from the
side, with a hint of the glass interior). Transparent background.

This stamp gets reused 3 times along the central path (the SVG
positions them, Manus paints one and we duplicate).

### B. Top-down ground textures (opaque PNG, tileable)

Each ~512 × 512 px square, designed to tile seamlessly so we can fill
arbitrary SVG regions with them. Painted-watercolour brushwork with
intentional irregularity — these are NOT vector tiles, they should
feel hand-painted with brush marks visible.

**6. `texture-grass.png`** — soft sage-green painted grass. Subtle
brush variation, no obvious repeat seams, occasional tiny white/yellow
flower marks. The default ground for the A.R.C. plot's empty zones.

**7. `texture-gravel.png`** — warm-tan painted gravel/parking surface.
Visible little stones suggested with darker dots. Used for the front
forecourt and the central path.

**8. `texture-lawn-garden.png`** — painted lawn matching the in-game
lawn garden (reference #2): brighter green than `texture-grass`, hint
of flower-bed colour spilling in from the edges. Used to fill the
T1 lawn garden region.

**9. `texture-quiet-garden.png`** — painted hedged-nook ground matching
the in-game quiet garden (reference #3): dappled shade, mossier green,
hint of fern shadow. Used to fill the T1 quiet garden region.

**10. `texture-scrub.png`** — painted rougher ground for the future
fox rewilding pen. Mixed grass + low shrub painted texture. Tier 6
will use this; including in Tier 1 commission so the brushwork stays
unified across the whole site.

### C. (Reserved for later — DO NOT paint in Tier 1)

These are listed so Manus understands the master plan but doesn't paint
them now. They become future commissions:

- **Hedgehog + squirrel zone** (T2 + future): leaf piles + log corners
  + small wooden squirrel boxes attached to the three trees. Shared
  habitat — squirrels arboreal up the trees, hedgehogs at the base.
- **Raccoon enclosure** (T3): right half of small-mammal zone, with
  climbing structures + water bath + dens.
- **Snake wall hatch + basking patch** (T5): hatch on east face of
  main building, small painted basking-patch elevation alongside.
- **Lizard heated annexe** (future): attached to or beside the main
  building, near the snake room but **separate** (snakes predate
  lizards in the wild — must be different husbandry). Sunny eastern
  side. Possibly a small Art Deco glass-and-render extension or
  free-standing painted-glass conservatory.
- **Skunk enclosure** (future): south end of the plot, **adjacent to
  the fox rewilding pen** (similar nocturnal-omnivore scrub habitat)
  and FURTHEST from the main building (smell + visitor flow). Could
  share the southern boundary fence with the fox pen but with a solid
  divider so they don't disturb each other.
- **Fox tunnel exit + scrub burrows** (T6).

## Style discipline (Rule 7 reminder)

- Stamps in section A are **front-elevation** on transparent backgrounds.
- Tiles in section B are **top-down** opaque painted textures.
- Do not mix. The main building stamp is front-on. The forecourt
  beneath it has a slight top-down tilt to suggest ground. Do not
  attempt isometric / 3/4 / "consistent" perspective across the whole
  set.
- Painted-watercolour treatment matching reference #1 (cast portraits)
  exactly. Same brushwork, palette warmth, ink-line weight, colour
  saturation, brush-edge feel.

## Self-check before delivery

For each file: "would someone looking at this instantly recognise it
as the same painted-storybook style as the existing A.R.C. cast
portraits and the in-game garden art?" If not, re-do before shipping.

## Output

OUTPUT LOCATION: Save all 10 files to
`/Users/marcus/Projects/animal-rescue-centre/manus-output/arc-site-tier1-2026-04-29/`
on the local Mac filesystem via Manus Desktop. Create the directory if
it doesn't exist. Use the exact filenames listed above.

---

## Estimate + decision points before sending

- 10 deliverables, ~75-100 credits each = **~800-1000 credits** total.
  This is a substantial commission. Worth it for the foundation of
  every map render going forward.
- Tier 1 unlocks the map renderer (`map.html` rebuild) — once we have
  the textures + stamps, rendering the A.R.C. plot is HTML/CSS work,
  no more AI cost.
- Reserved-list items (T2-T6 + future species) come as smaller
  follow-up commissions when each tier unlocks.

**Decisions locked (Marcus, 2026-04-29):**

1. **Flagpole flag**: A.R.C. paw-print emblem (cream/amber background,
   brown paw matching the facade emblem). No Union Jack — keeps the
   identity unified.
2. **PTV**: not painted into the scene. Forecourt left empty of
   vehicles; existing `/assets/driving/vehicle-henry.png` sprite
   layers on top via SVG positioning.
3. **Building signage**: paw-print emblem prominently on front facade
   AND "ANIMAL RESCUE CENTRE" hand-lettered in full on the entrance
   canopy fascia.
4. **Tree species**: oak, ash, horse chestnut.
5. **Texture-tile size**: 512×512.
