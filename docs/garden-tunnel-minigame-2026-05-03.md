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
- Sound: hollow underground rumble + scurrying sounds + a happy
  pop-up when each animal reaches its destination.

## Open questions

1. **Where do the animals actually GO when they use the tunnel?**
   Just visual flavour ("they popped out in the wild and came
   back!") or does it have a real gameplay effect (e.g., the fox
   gains 5 happiness per successful tunnel run; the hedgehog
   gains foraging income)?
2. **Should the puzzle reset on each play or be persistent?**
   A persistent "you laid pipe yesterday, here's how it works
   today" is more grown-up; a daily fresh puzzle is more friendly
   for repeat dipping in.
3. **Multi-player friend interaction?** Friends could send you
   "puzzle of the day" challenges over the friends system.
4. **Special tile types** — bridges (one tunnel goes OVER another
   without connecting), one-way valves, diggable-by-the-player
   blank tiles?
5. **Scoring** — par moves (Marcus liked golf-like par scoring
   in the design discussions). Min rotations to solve?
6. **Entry point UX** — locked via spatial-layout decision: the
   tunnel mouth lives on the A.R.C. site map at the bottom of
   the central path (south end, where the building's staff area
   meets the path). Tap that hatch → tunnel grid overlay. May
   ALSO be discoverable via in-habitat hatches at higher tiers
   for variety.

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
