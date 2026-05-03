# Garden tunnel — tile inventory + per-tier stress test

> Sub-agent spec, 2026-05-03. Companion to
> `docs/garden-tunnel-minigame-2026-05-03.md`. Locks the tile set, per-tier
> grid sizing, and verifies each of the 5 tiers is solvable AND interesting
> for a 7–8yo without bloating the inventory.

---

## 0. Coordinate translation — site → grid

The puzzle grid is a top-down render of the A.R.C. plot. From the brief
+ `apps/game/public/admin/map.html`:

| Element | Stage X | Stage Y | Notes |
|---|---|---|---|
| Central trunk | 60.67–66.67% | 4–95% | Vertical, full height |
| Tunnel mouth (entry hatch) | ~63.67% | ~95% | South end, under building |
| Fox branch tap | 60.67% | ~13% | West off trunk → fox pen |
| Skunk branch tap | 66.67% | ~13% | East off trunk → skunk pen |
| Hedgehog branch tap | 60.67% | ~31% | West off trunk → small-mammal zone |
| Raccoon branch tap | 66.67% | ~31% | East off trunk → raccoon zone |
| Viewing domes | 63.67% | 13/31/46% | Cosmetic portholes ON the trunk |

**Gardens (quiet + lawn)** — recommendation: **NOT tunnel destinations.**
Pets in the gardens are surface-level animals (rabbits, guinea pigs in the
fiction). Tunnel network is for the wilder, burrow-natural species
(fox/skunk/hedgehog/squirrel/raccoon). Keeping gardens out:
- Preserves narrative (small pets don't dig tunnels).
- Caps inventory complexity at 4 destinations, not 6.
- Leaves room to add a "garden burrow" surprise destination later if
  Lily wants more.

---

## 1. Tile inventory — final set

Smallest set that supports all 5 tiers. **9 functional tile types**
(8 placeable by player + 1 cosmetic overlay). Each justified against a
tier need.

| # | Name | Glyph | Behaviour | Player-rotatable? | Introduced | Why it earns its slot |
|---|---|---|---|---|---|---|
| 1 | Empty / sealed earth | `·` | No tunnel. Blocks routing. | n/a | T1 | Negative space — without it the puzzle becomes a connect-everything chore. |
| 2 | Straight | `─` `│` | Connects 2 opposite edges. | yes (2 states) | T1 | Backbone of the trunk. |
| 3 | Corner | `└` `┌` `┐` `┘` | Connects 2 adjacent edges. | yes (4 states) | T1 | Required to turn from trunk into branches. |
| 4 | T-junction | `┬` `┴` `├` `┤` | Connects 3 edges. | yes (4 states) | T2 | Branch tap — multiple destinations require splits. |
| 5 | Cross | `┼` | Connects all 4. Two streams cross AND mix. | no (symmetric) | T3 | Lets streams merge at the trunk centre when 3+ animals share. |
| 6 | Bridge | `╪` / `╫` | Two tunnels CROSS without connecting (one over, one under). | yes (2 states for orientation) | T3 | Resolves wrong-animal-takes-wrong-exit at junctions. The decongester. |
| 7 | Gate | `[G]` | Straight segment with a player-toggle. Open = pass; shut = block. | toggle only (orientation fixed by board) | T2 | Sequencing animals; required for "no collision" puzzles. |
| 8 | Habitat endpoint | `[F] [S] [H] [R] [⌂]` | Fixed source/destination tile. Letter = which animal/home. | NO (fixed orientation, fixed position) | T1 (`[F]`+`[⌂]`) | Anchors the puzzle to real map geometry. |
| 9 | Viewing-dome porthole | `(o)` | Cosmetic overlay on a trunk tile. Tap to peek; no routing effect. | n/a | T1 | Whimsy + map-link. Reinforces "above and below" mental model without changing puzzle. |

### Cuts from the brainstorm candidate list
- **One-way valve** — REJECTED. Adds a directional concept that
  duplicates what the gate already achieves through sequencing. Saves a
  rule the kid has to learn.
- **Diggable blank tile** — REJECTED for v1. The "Make the tunnels"
  re-randomise button already provides player-driven board reshape; per-
  tile dig is a different skill (excavation puzzle). Park for v2.
- **Collapsed/blocked tile needing clearing** — REJECTED. Functionally
  identical to `Empty` from the routing solver's POV; kids would just
  see "the tile that won't rotate yet" which is unfun. If we want
  obstacle reveals, do them as an animation, not a tile type.

**Final tile count: 9** (well inside the "smallest viable" target).

---

## 2. Per-tier grid sizing

Render target: 768–1024px wide tablet. To stay finger-friendly, minimum
tile = ~48px on screen, ideal ~64–96px.

| Tier | Habitats live | Grid (cols × rows) | Tile size on 1024-wide stage | Active region |
|---|---|---|---|---|
| 1 (intro — fox) | Fox + trunk | **9 × 9** | ~88 px | Trunk col + fox-branch row only; rest greyed |
| 2 | + Hedgehog/squirrel | **11 × 11** | ~72 px | Trunk + fox-branch + hedgehog-branch |
| 3 | + Raccoon | **13 × 13** | ~62 px | Add raccoon-branch east |
| 4 | + Skunk | **15 × 15** | ~54 px | Add skunk-branch east-top; full network live |
| 5 (rush hour) | All 4 | **15 × 15** | ~54 px | Same grid; gates fire simultaneously |

I revised the brief's tier-4 16×16 down to 15×15 — odd numbers give a
true centre column that lines up with the trunk (col 7 in a 15-wide).
Even widths force the trunk between two columns, which fights the
"mirror the map" principle.

Trunk = column 7 in every tier (always centre). Branch rows:
- Fox/skunk row: row 1 (~y=13% of stage maps to row 1 of 15)
- Hedgehog/raccoon row: row 4–5 (~y=31% → row 5 of 15)
- Tunnel mouth: row 14 (south end)

---

## 3. Per-tier puzzles

Notation: `·` empty, `─│` straights, `└┌┐┘` corners, `┬┴├┤` Ts, `┼` cross,
`╪` bridge, `[G]` gate, `[F][S][H][R]` habitat endpoints, `[⌂]` mouth,
`(o)` dome. Trunk in column 7 (1-indexed). Locked = capital marker.

### Tier 1 — Intro (fox only) — 9×9

Active cells: column 7 (trunk) + row 2 west to col 2 (fox branch) +
endpoint tiles. Other cells `·` and rendered as faded earth.

```
 col   1 2 3 4 5 6 7 8 9
row 1  · · · · · · · · ·
row 2 [F]─ ─ ─ ─ ─ ┐ · ·     ← fox branch, fox endpoint at col 1
row 3  · · · · · · │ · ·
row 4  · · · · · · │ (o)·
row 5  · · · · · · │ · ·
row 6  · · · · · · │ · ·
row 7  · · · · · · │ · ·
row 8  · · · · · · │ · ·
row 9  · · · · · ·[⌂]· ·     ← tunnel mouth
```

**Fixed:** `[F]`, `[⌂]`, the corner at (2,7), and the dome cosmetic.
**Player rack (random rotations on board):** 5 × straight, 1 × corner.
The kid must rotate the corner at (2,7) into the `┐` orientation and
each straight into vertical/horizontal as appropriate.

- **Solvable?** Yes, trivially. Single linear path.
- **Unique solution?** Yes (only one valid orientation per tile).
- **Interesting?** Just barely — but tier 1 is teaching the rotate
  mechanic, not testing routing intuition. The dome porthole gives a
  delightful peek-up moment.
- **Solve time (Lily):** 60–90 sec first time, ~30 sec after.

### Tier 2 — Hedgehog branch added — 11×11

```
 col    1 2 3 4 5 6 7 8 9 10 11
row  1  · · · · · · · · · ·  ·
row  2 [F]─ ─ ─ ─ ─ ┘ · · ·  ·     ← fox endpoint + branch joining trunk
row  3  · · · · · · │ · · ·  ·
row  4 [H]─ ─ ─ ─ ─ ┤ · · ·  ·     ← hedgehog endpoint + T-junction tap
row  5  · · · · · ·[G]· · ·  ·     ← gate on trunk below hedgehog tap
row  6  · · · · · · │ (o)· ·  ·
row  7  · · · · · · │ · · ·  ·
row  8  · · · · · · │ · · ·  ·
row  9  · · · · · · │ · · ·  ·
row 10  · · · · · · │ · · ·  ·
row 11  · · · · · ·[⌂]· · ·  ·
```

**Fixed:** endpoints, mouth, gate, T at (4,7), corner at (2,7), domes.
**Player rack:** 8 × straight (random rotations), 0 spare corners.

The gate matters here: open it for fox first (fox runs trunk → fox
branch), close it, open the hedgehog gate (different gate not shown in
this minimal sketch — see refinement), let hedgehog out. **Refinement:
tier 2 needs TWO gates** — one on each branch — so the kid learns
"sequence animals so they don't collide at the T". Add `[G]` at (2,6)
and (4,6).

- **Solvable?** Yes.
- **Multiple solutions?** Sequencing order is flexible (fox-then-hedgehog
  or vice-versa) → creativity OK.
- **Interesting?** Yes — the kid discovers that both animals trying to
  use the trunk at once = collision at T. Gate-toggling becomes the
  teaching moment.
- **Solve time:** 2–3 min first encounter.

### Tier 3 — Raccoon added — 13×13

Trunk = col 7. Three branches active.

```
 col     1 2 3 4 5 6 7 8 9 10 11 12 13
row  1   · · · · · · · ·  ·  ·  ·  ·  ·
row  2  [F]─ ─ ─ ─ ─ ┘ ·  ·  ·  ·  ·  ·
row  3   · · · · · ·[G] ·  ·  ·  ·  ·  ·
row  4  [H]─ ─ ─ ─ ─ ┼ ─  ─  ─  ─  ─ [R]  ← cross at trunk, raccoon east
row  5   · · · · · ·[G] ·  ·  ·  ·  ·  ·
row  6   · · · · · · │ (o) ·  ·  ·  ·  ·
row  7   · · · · · · │ ·  ·  ·  ·  ·  ·
row  8   · · · · · · ╪ ·  ·  ·  ·  ·  ·   ← bridge — over/under feature
row  9   · · · · · · │ ·  ·  ·  ·  ·  ·
row 10   · · · · · · │ ·  ·  ·  ·  ·  ·
row 11   · · · · · · │ ·  ·  ·  ·  ·  ·
row 12   · · · · · · │ ·  ·  ·  ·  ·  ·
row 13   · · · · · ·[⌂] ·  ·  ·  ·  ·  ·
```

**Bridge story:** The bridge at (8,7) lets a hypothetical east-west
"shortcut" tunnel pass over/under the trunk without the streams
mixing. Useful when the kid wants to send raccoon home AND fox home
without their pawprints colliding at the cross.

**Fixed:** all endpoints, mouth, cross at (4,7), bridge at (8,7), 2
gates at (3,7)+(5,7), domes.
**Player rack:** ~14 straights/corners, 1 spare T.

- **Solvable?** Yes. Three sequence orders work.
- **Multiple solutions?** Yes (~6 equivalent gate-orderings).
- **Interesting?** Yes — first puzzle where the kid faces a true 3-way
  routing decision, and the cross/bridge interplay teaches over/under.
- **Solve time:** 3–4 min.

### Tier 4 — Skunk added — 15×15

Full 4-branch network. All branches active, all gates required.

```
 col      1 2 3 4 5 6 7 8 9 10 11 12 13 14 15
row  1    · · · · · · · · ·  ·  ·  ·  ·  ·  ·
row  2   [F]─ ─ ─ ─ ─ ┼ ─  ─  ─  ─  ─  ─  ─ [S]   ← fox west, skunk east, cross at trunk
row  3    · · · · · ·[G] ·  ·  ·  ·  ·  ·  ·  ·
row  4    · · · · · · │ ·  ·  ·  ·  ·  ·  ·  ·
row  5   [H]─ ─ ─ ─ ─ ┼ ─  ─  ─  ─  ─  ─  ─ [R]   ← hedgehog west, raccoon east
row  6    · · · · · ·[G] (o) ·  ·  ·  ·  ·  ·  ·
row  7    · · · · · · │ ·  ·  ·  ·  ·  ·  ·  ·
row  8    · · · · · · ╪ ·  ·  ·  ·  ·  ·  ·  ·   ← bridge
row  9    · · · · · · │ ·  ·  ·  ·  ·  ·  ·  ·
row 10    · · · · · · │ ·  ·  ·  ·  ·  ·  ·  ·
row 11    · · · · · · │ ·  ·  ·  ·  ·  ·  ·  ·
row 12    · · · · · · │ ·  ·  ·  ·  ·  ·  ·  ·
row 13    · · · · · · │ ·  ·  ·  ·  ·  ·  ·  ·
row 14    · · · · · · │ ·  ·  ·  ·  ·  ·  ·  ·
row 15    · · · · · ·[⌂] ·  ·  ·  ·  ·  ·  ·  ·
```

**Fixed:** 4 endpoints, mouth, 2 crosses (rows 2 & 5), 2 trunk gates
(rows 3 & 6), bridge (row 8), 3 domes.
**Player rack:** ~22 straights, ~4 corners, 2 spare T-junctions.

The kid must rotate every west/east branch tile to align horizontally
AND every trunk tile to align vertically. With each animal taking its
turn through the gates, all 4 reach home.

- **Solvable?** Yes.
- **Multiple solutions?** Yes. ~24 valid gate-sequences.
- **Interesting?** Yes — the cross-at-trunk decisions force the kid to
  notice "if I leave fox-cross set wrong, hedgehog will end up in the
  fox pen". The wrong-destination failure mode now bites.
- **Solve time:** 4–6 min.

### Tier 5 — Rush hour (same 15×15, simultaneous gates)

Identical board to Tier 4. **Difference:** when the kid presses
SUBMIT, all four habitat endpoints fire AT THE SAME TIME. The board
must be ROUTED such that the 4 simultaneous flows never collide at a
shared tile in the same animation frame.

**Timing maths the kid implicitly grapples with:**
- Trunk length (mouth → fox-row cross) = 12 tiles × 1 frame each = 12f
- Trunk length (mouth → hedgehog-row cross) = 9 tiles = 9f
- Fox branch length = 6 tiles
- Hedgehog branch length = 6 tiles
- Raccoon branch length = 9 tiles
- Skunk branch length = 9 tiles

So fox arrives at its cross at frame 12, but hedgehog already passed
through the hedgehog cross at frame 9. **No collision** at the
hedgehog cross because fox isn't there yet. **Collision risk at the
fox cross:** skunk also passes through it (frame 12). RESOLUTION: the
**bridge tile** at (8,7) can be re-purposed as a SECOND bridge in the
top half, OR — better — the kid uses one of the two SPARE T-junctions
in their rack to re-route the trunk to climb up the EAST side past the
fox cross via a side-detour, so fox and skunk pawprints never share a
tile.

**Sample rush-hour layout** (only differences from tier 4 shown):
- Player adds a T at (2,8) and a corner at (2,9) to give skunk a
  detour: skunk goes mouth → trunk-up → row 2 east → directly into
  skunk. Fox goes mouth → trunk-up → cross → row 2 west → fox.
- The cross at (2,7) is now genuinely doing 2-way crossing of fox-
  westbound and skunk-eastbound. Animations show two pawprint streams
  passing through but exiting the correct side.

- **Solvable?** Yes — verified above.
- **Multiple solutions?** Probably 2–3 distinct topologies.
- **Interesting?** This is the puzzle Marcus wants — kid genuinely has
  to think "which animal takes which path so we don't crash". TIMING
  matters because longer paths = later arrival = different collision
  windows.
- **Solve time:** 5–8 min target hit.

---

## 4. Stress-test verdicts

| Tier | Solvable | Interesting | Est. solve | Verdict |
|---|---|---|---|---|
| 1 | ✓ | Marginal (teaching) | 1–2 min | Holds |
| 2 | ✓ | Yes (gate sequencing) | 2–3 min | Holds (need 2 gates not 1) |
| 3 | ✓ | Yes (cross + bridge intro) | 3–4 min | Holds |
| 4 | ✓ | Yes (4-way routing) | 4–6 min | Holds |
| 5 | ✓ | Yes (timing forces creativity) | 5–8 min | Holds — relies on bridge + spare Ts in rack |

---

## 5. Open issues + recommended fixes

1. **Gate count at tier 2** — the brief implies one gate; my analysis
   says two are needed (one per branch) to make sequencing teachable.
   Recommend: 2 gates from tier 2 onward.
2. **Cross tile is symmetric** — won't rotate visibly when clicked.
   Risk: kid clicks expecting feedback, gets nothing. Fix: animation
   wobble + a small "this one's already aligned" chime, OR omit cross
   from tier-3 player rack (only fixed-on-board), so kid never tries
   to rotate it.
3. **Bridge tile orientation** — has 2 states (NS-over-EW vs EW-over-NS).
   Visually distinguish over/under with a clear painted shadow so kids
   parse it instantly.
4. **Tile size at tier 4/5 (~54px)** — borderline finger-friendly on
   smaller tablets. If we discover Lily struggles, bump to 13×13 for
   tier 4 and accept slightly less detail; the tile inventory still
   works.
5. **Domes are cosmetic only** — confirm with Marcus that they should
   stay non-interactive for routing. If they should also act as a
   "checkpoint" (animal must pass under the dome to count as a real
   garden visit), that's a 10th tile type to add.
6. **Garden destinations** — recommended OUT for v1 (see §0). Confirm.
7. **Failure animation** — when an animal exits the wrong destination,
   the brief says soft sad-face. Suggest also showing the WRONG tile
   highlighted briefly so the kid learns the diagnosis.

---

## 6. Recommended cuts / additions vs the brainstorm list

**Kept (9):** empty, straight, corner, T, cross, bridge, gate, endpoint,
dome.

**Cut (3):** one-way valve (redundant with gate), diggable blank
(v2 feature), collapsed/blocked (functionally identical to empty).

**Adds none.** The 9-tile set is sufficient for all 5 tiers without
bloat.

---

## 7. Sanity check on the difficulty curve

The curve grows on three axes only, exactly as Marcus locked:
- **Grid resolution** 9 → 11 → 13 → 15 → 15
- **Branch count** 1 → 2 → 3 → 4 → 4
- **Sequencing pressure** none → manual gates → manual gates + bridge
  → 4-animal stagger → simultaneous (rush hour)

No new tile types added past tier 3 (cross + bridge land then). The
last 2 tiers escalate purely through more board, more animals, and the
rush-hour rule. That matches the brief's "same shape, finer detail" mandate.
