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

## Tier / level pacing

- **Tier 1 (intro):** 1 animal source → 1 destination, 3×3 grid,
  3 fixed tiles + 4 rotatable. Almost-impossible to get wrong, just
  to teach the rotate-and-connect mechanic.
- **Tier 2:** 2 animals, gates introduced, 4×4 grid.
- **Tier 3:** 3 animals + timing windows, 5×5 grid.
- **Tier 4 (expert):** 4 animals + multiple gates + "rush hour"
  scheduling, 6×6 grid.

Unlock progression — tier 1 unlocks at L4 (when fox is unlocked?
Or L2 with the hedgehog/squirrel zone?), each tier unlocks 2-3
levels above the previous.

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

1. **Where does the tunnel network live in the game UX?** Possible
   entry points:
   - From the A.R.C. site map: tap the central path or the painted
     gate at the top of the path → tunnel grid overlay.
   - From inside a habitat view (lawn/quiet/hedgehog/etc): tap a
     painted tunnel-entrance hole in the ground.
   - Standalone "Tunnel" tab in the kid's main menu.
   I'd suggest BOTH the in-habitat entrance AND a map-level entry
   point — discovery + repeat play.
2. **Where do the animals actually GO when they use the tunnel?**
   Just visual flavour ("they popped out in the wild and came
   back!") or does it have a real gameplay effect (e.g., the fox
   gains 5 happiness per successful tunnel run; the hedgehog
   gains foraging income)?
3. **Should the puzzle reset on each play or be persistent?**
   A persistent "you laid pipe yesterday, here's how it works
   today" is more grown-up; a daily fresh puzzle is more friendly
   for repeat dipping in.
4. **Multi-player friend interaction?** Friends could send you
   "puzzle of the day" challenges over the friends system.
5. **Special tile types** — bridges (one tunnel goes OVER another
   without connecting), one-way valves, diggable-by-the-player
   blank tiles?
6. **Scoring** — par moves (Marcus liked golf-like par scoring
   in the design discussions). Min rotations to solve?

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
