# Garden tunnel mini-game

> Marcus 2026-05-03 — what was originally just a fox tunnel becomes
> a shared underground network for ALL garden-habitat animals,
> turned into a pipe-building / tile-rotation puzzle.

## The pivot

Original concept:
- **Fox tunnel** — a single-purpose underground passage from the fox
  pen to somewhere off-pen (foraging area, north-edge "wild"). Sole
  purpose: swift access for the fox.

New concept:
- **Garden tunnel network** — same underground concept, but ALL
  animals with a garden habitat can use it: fox, skunk, hedgehog,
  raccoon (and potentially the lawn / quiet garden pets).
- The tunnel network has **gates** the player opens and shuts to
  let one animal type through at a time.
- Routing the network is a **pipe-rotation puzzle mini-game**: a
  grid of square tunnel tiles, click each to rotate 90°, build the
  right connections so each animal gets from its habitat to the
  habitat it's heading to.

## Why it works

- **Teaches logic + spatial reasoning** without feeling like school.
- **Reinforces the matching theme** at the heart of A.R.C. — the
  player learns that the *right animal to the right place* is what
  makes the centre work, exactly the same lesson as adoption
  matching, just rendered as plumbing.
- **Differentiated activity** — most of the game is animal-care
  loops (feed, play, walk, bond). A pipe-puzzle is a brain-break
  with a different success criterion. Like the kitchen mini-game.
- **Solo or guided** — easy puzzles introduce the mechanic; later
  ones layer gates + scheduling for replay value.
- **Story-honest** — animals genuinely DO move between habitats at
  A.R.C. (foxes go to the wild, hedgehogs to the woodland zone,
  raccoons to the trees). The tunnel network is the painted-storybook
  excuse for that motion to be visible.

## Mechanics — first sketch

### The grid

- A grid of square tiles, each ~80px on a tablet (so a 6×4 or 7×5
  grid fits the screen comfortably).
- Each tile holds **one tunnel segment**:
  - Straight (├ or ─)
  - Corner (└ ┌ ┐ ┘)
  - T-junction (┬ ┴ ├ ┤)
  - Cross (✚)
  - Empty (no tunnel — sealed earth)
- Click a tile → rotates 90° clockwise.
- Some tiles are **fixed** (the puzzle's "givens" — usually the
  habitat exits + the destination entrances).

### The animals

- Each level has 1–4 **animal sources** and matching **destinations**.
- Animals are coloured pawprints that "flow" through the tunnel
  once the gates are opened. The flow is animated; the kid watches
  the network light up as their pawprints travel.
- **Wrong destination** = the animal pops out the wrong side and
  the level fails (gentle sad-face, retry). Marcus wants the failure
  state to be soft — kids can replay infinitely; nothing is lost.

### The gates

- Some tiles are **gates** (painted as little wooden underground
  doors). The player toggles each gate open / shut.
- Multiple animals can flow simultaneously IF the network has no
  conflicts. Otherwise the puzzle requires staged opening — one
  animal first, then another.
- Higher levels add **timing** constraints (e.g., the fox needs to
  be back in its pen before the hedgehog leaves its burrow).

### Win condition

- All animals reach the right destination AND nobody hits a dead-end
  or the wrong destination. "Tick-stamp" + a satisfying chime + a
  small XP nudge.

## Tier / level pacing — TIGHTLY PEGGED to habitat unlocks

The tunnel mini-game grows alongside the actual aboveground habitat
unlocks (Marcus 2026-05-03 clarification). When a habitat unlocks,
its tunnel section unlocks at the same time so the kid is always
looking after animals whose outdoor habitats are actually available.

| Stage | Aboveground habitat unlock | Tunnel additions |
|---|---|---|
| **Intro** | Fox arrives (T6) | First puzzle — rebuild the fox tunnel only. 1 source, 1 destination, single straight run, ~6 rotatable tiles. Teaches the rotate-and-connect mechanic. |
| Tier 2 | Hedgehog/squirrel zone (T2)* | Tunnel branches off into the small-mammal zone. 2 sources, 2 destinations. Gates introduced. |
| Tier 3 | Raccoon zone (T3) | 3 animals share the network. Timing windows / staged gate opening. |
| Tier 4 | Skunk zone | All 4 garden-habitat animals routing simultaneously. |
| Tier 5 (expert) | All habitats live | "Rush-hour" mode — ALL animal entry gates open at the SAME TIME when the kid submits their layout attempt. They have to ensure no animals clash, no one ends up at the wrong destination. |

*Note the unlock order in the docs is fox=T6, hedgehog=T2 — so
the actual progression in-game will be fox → hedgehog → raccoon →
skunk based on player level + arrival sequence, not the table
order above. The point is each tunnel section unlocks WITH its
matching habitat, never before.

### Difficulty progression — SAME layout, finer detail

Critically, the SHAPE of the tunnel network always mirrors the
actual aboveground A.R.C. site. We do NOT abstract the layout —
the kid's spatial learning of where the habitats are
(fox-skunk at top, hedgehog/raccoon middle, gardens lower, building
south) must be REINFORCED by the tunnel game, not contradicted.

So difficulty doesn't come from "different shape per level". It
comes from:
1. **Smaller, more detailed tiles** at higher tiers — the player
   sees more of the network's nuance, makes finer-grained routing
   decisions.
2. **Extra branch tunnels** added as more habitats come online
   (skunk branch, raccoon branch, etc.) — the network LITERALLY
   grows the same way the aboveground site grows.
3. **Simultaneous gate opening** at tier 5 — the toughest level
   because all animals leave AT ONCE when the player submits.

## Tree roots as natural obstacles (Marcus 2026-05-04)

The 6 painted trees rooted in the gardens above (3 in quiet, 3
in lawn) cast TREE-ROOT obstacles below ground. Each tree's roots
become a small irregular blob of "sealed earth" tiles in the grid
beneath it that the tunnel network can't pass through. This
gives natural obstacles the player has to route AROUND, perfectly
aligned with the spatial overlay so the kid sees WHY they can't
dig a tunnel right there.

Mechanics:
- Each tree contributes 1-3 root-blocked tiles, centred on the
  tile beneath the tree's painted trunk position.
- Roots render as a different fill (mossy-brown earth with painted
  root tendrils) — visually distinct from regular sealed earth
  tiles so the kid sees "this is a tree's roots".
- Kid can't rotate or modify root tiles (they're like FIXED empty
  tiles — permanent obstacles).
- In the spatial overlay, the tree's painted canopy + trunk shows
  ABOVE the root-blocked tiles below — direct visual link.

Tier introduction:
- Tier 1 (fox only) — no roots (keep the intro mechanic-pure).
- Tier 2+ — roots appear under the trees in lawn + quiet gardens
  as the tunnel network grows past those gardens. Forces detours
  + rewards the player for reading the aboveground overlay.

## Aboveground overlay (Marcus 2026-05-04)

The puzzle grid is rendered with a SEMI-OPAQUE GHOST of the
A.R.C. site map drawn ON TOP of the tunnel grid (~30% opacity).
The kid sees both layers at once: their tunnels below + the
buildings, paths, gardens and habitats above. Kids who find
the dual-layer confusing can hide it via a toggle button in
the header (default: ON).

REWARD: when all animals successfully complete their routes,
the overlay fades to fully transparent for ~3 seconds, revealing
the kid's tunnel network in full glory. A small celebration of
the spatial reasoning the kid just did.

(Future polish: when an animal arrives at its destination on
an OUTbound run, swap to the WALKING-sprite version of that
animal so the kid sees them strolling into their enclosure.)

## Spatial layout — match the aboveground site

The tunnel network's geometry on screen mirrors the A.R.C. site
map's actual layout (Marcus 2026-05-03 — kids' spatial learning):

- **Central trunk tunnel** runs vertically down the middle, exactly
  where the aboveground central path runs (stage x=60.67%–66.67%
  on the current map). The tunnel goes from the building's south
  side (the entry point — the kid descends into the tunnels via
  a hatch in the staff area) all the way north to the back of
  the plot.
- **Branch tunnels** go LEFT and RIGHT off the trunk to each
  habitat:
  - Top branches → fox pen (left-of-trunk top) + skunk pen (right-of-
    trunk top)
  - Middle branches → hedgehog/squirrel zone (left) + raccoon
    zone (right)
- **Habitat entry/exit points** sit at the actual map position of
  each habitat — fox tunnel entrance is at the fox pen's south
  edge, etc.
- **Tunnel mouth on the map** — once the tunnel is unlocked, the
  central path on the A.R.C. site map gets a small painted tunnel-
  hatch detail at its south end (where the building's staff area
  meets the path). Tap to enter the puzzle.

This means the puzzle grid IS a top-down rendering of the actual
plot, just zoomed in to show the underground. Building / habitats
fade to ghost outlines so the kid can see "above and below" at
once. Reinforces, doesn't contradict, the spatial mental model.

## Visual + tone

- Same painted-storybook palette. Tunnel walls = warm earth-brown
  watercolour; tunnel floors = pale dirt; gates = wooden plank
  doors with little iron hinges.
- Animals as small painted pawprints flowing through, NOT realistic
  animals — that keeps the rendering performant and reads cleanly
  at small grid scales.

## Audio

### Background music — "joyfully mechanical gnome tinkering" (Marcus 2026-05-03)

Bespoke loop for the tunnel mini-game. Vibe brief:

- **Underground feel** — woody, earthy, slightly muffled / damp,
  like you're under a few feet of soil. Nothing brassy or open.
- **Pieces-being-put-together** — the rhythm should evoke
  construction / tinkering. Small mechanical clicks and clinks
  woven into the melody, like watching a gnome assemble a clockwork
  trinket.
- **Not scary at all** — no minor-key tension, no horror tropes,
  no "deep dark dungeon" stuff. Bright and warm despite being
  underground.
- **Joyfully mechanical** — playful, maybe a bit jaunty, with a
  sense that the player is solving a delightful little contraption.
- **Gnome-with-magic-tools** flavour — a touch of whimsy / sparkle
  in the high frequencies (tiny bell-like ornaments, soft chimes)
  hinting at the magic.

Reference moods to draw from (NOT to copy):
- The toymaker scenes in old animations (think Disney's Geppetto
  workshop, or Pixar's robotic-but-warm soundtracks).
- Early Zelda secret-room jingles for the chime quality.
- Studio Ghibli underground scenes (e.g. Castle in the Sky's
  laputa interior music) for the warmth-while-buried feel.

### SFX

- **Tile rotation:** subtle wooden creak / small mechanical click
  when a tile is rotated.
- **Gate toggle:** soft wooden door swing + latch click.
- **Animal flow:** scurrying-pads sound while pawprints travel
  the tunnel.
- **Animal arrives at correct destination:** happy pop-up chime
  (warm, not shrill).
- **"Make the tunnels" override button:** crisp small-shovel
  digging sound (re-randomising = the gnome is rebuilding the
  contraption from scratch).
- **Win state:** all animals arrived = a brief jaunty fanfare,
  same gnome-tinkering palette but a touch more triumphant.

### Asset commissioning

To be commissioned later via Manus or a human composer when the
mini-game ships. For now this section is the brief.

## Decisions LOCKED 2026-05-03 (Marcus)

### 1. Gameplay effect — REAL — the animals get out to play

A successful tunnel run = the kid has let the animals out to play.
That feeds back into the existing "let outside" / happiness loop:
each animal whose path completes correctly gets the same kind of
happiness/bond bump they'd get from being let out into the garden.
A failed routing means the animals don't get out that day —
nothing destructive, just a missed-opportunity nudge.

### 2. Daily randomisation + override button

Tiles randomise once per in-game day at dawn and stay put the rest
of that day (the kid can replay/iterate on the same puzzle within
the day). At the next dawn, fresh tile rotations.

Kid can override at any point with a **"Make the tunnels" button**
that re-randomises early. This is a small reward-loop button: the
override gives a small bonus to the centre (NOT the animals) —
e.g. extra coins, supplies, or a charm-progress nudge. The exact
reward is TBD but the principle is "centre infrastructure benefits,
animals don't get extra happiness from the override".

### 3. No multi-player on this mini-game

Tunnel game stays solo. Friends system not wired in. (Future
revisit if it ever feels under-used.)

### 4. Special tile types — YES, sub-agent to spec

Bridges, one-way valves, diggable-by-player blank tiles all sound
good. A sub-agent will (a) design the full tile inventory across
all 5 tiers, (b) stress-test that each tier's puzzles are solvable
and interesting with the inventory available, (c) confirm we have
what we need without over-stuffing the set.

### 5. No par moves / no scoring

Kids should click freely and experiment without perfectionism
breathing down their neck. Saves us calculating par scores too.
Win-state is binary: all animals reached the right destination =
celebration. Otherwise: gentle retry.

### 6. Entry point UX

Tunnel mouth lives on the A.R.C. site map at the bottom of the
central path (south end, where the building's staff area meets
the path). Tap that painted hatch → tunnel grid overlay. May also
be discoverable via in-habitat hatches at higher tiers for variety.

## Implementation backlog (high level)

- [ ] **Spec:** a fuller spec following the brainstorming flow —
      grid serialisation format, tile-rotation state machine,
      animal-flow pathfinding (BFS over connected pipe segments).
- [ ] **Lock the entry-point UX** (open question #1).
- [ ] **`packages/game-logic/src/tunnel.ts`** — pure logic for
      tile-rotation, connectivity, multi-source pathfinding,
      gate-toggle state. TDD'd, no Phaser deps. Should mirror
      `crate-stacking.ts` in style and rigour.
- [ ] **`apps/game/public/admin/tunnel.html`** — iframe page for
      the painted UI. Iterate on the visuals before scene wiring.
- [ ] **`TunnelScene.ts`** — Phaser scene mounting the iframe,
      same pattern as the adoption-office and rewilding flows.
- [ ] **Asset commissions:** painted tile set (~24 tile variants
      for straight / corner / T / cross / gates / endpoints, with
      a couple of seasonal tints), animal pawprint sprites,
      cosmetic decoration tiles (mushrooms growing on tunnel walls,
      worms crossing the floor, etc.).
- [ ] **Level pack:** start with 8-10 hand-designed puzzles,
      tested with Lily.
- [ ] **Audio:** hollow underground rumble, scurrying pads,
      satisfying pop on completion.

## Connection to other systems

- Animal happiness — successful tunnel runs nudge the right
  animal's happiness up.
- Apprentice unlocks — Kofi reads tunnel-engineering books;
  recruiting Kofi unlocks the harder tier puzzles.
- Charm system — "Tunnel architect" charm unlocks at first
  4-animal puzzle solved.
- Map view — when the tunnel is unlocked, the central path on
  the A.R.C. site map gets a small painted tunnel-mouth detail
  with a paw-print walking into it (a discovery gift).
