# Directions desk: writing strip maps for visitors (2026-10-14)

Marcus's idea, 2026-10-14. The child learns to put strip-map symbols together (the notation the driving rail uses, 80A and 81A) and sends the result to visitors and would-be adopters, who use it to find A.R.C. from their house. As she drags symbols into place, the Birchie map draws the line her directions make, so she can see whether they lead to the right place.

## Decisions

- **82A, which junction a symbol means:** the levels teach it. Early levels have only single-choice junctions, so a symbol applies at the next junction. Later levels add counting side roads, then landmarks and distances.
- **83A, a wrong route:** the visitor drives it anyway. The line shows where they end up, they phone A.R.C. a bit lost, and she sends a fix. The visitor still comes. That is a consequence, not a lock.
- **84A, where it lives:** a desk job at A.R.C. Emails from visitors and people hoping to adopt arrive between drives.
- **85A, when:** this note now; a rough spike on the existing Birchie road data once the driving strip settles.

## The notation

These symbols are the same ones the driving rail uses (80A and 81A), so what she reads on a drive is what she writes at the desk.

- **The line:** the route is one line, read upward from the visitor's house to A.R.C.
- **A turn:** the line bends into an arrow off to that side, with a very small gap before the line carries on above. Arrowheads are small.
- **A roundabout:** a small circle with the exit arm at the angle the visitor leaves by, like UK roundabout signs.
- **Side-road stubs:** short grey stubs for side roads passed, introduced at the counting level. The driving rail leaves them out (80A). The desk brings them in because counting is the skill being taught there.
- **Landmarks and distances:** a small tag beside a symbol ("church", "400 m"), introduced late.

## How the live line works

The chain of symbols is carried out on the road graph:

1. Start at the visitor's house and follow the road.
2. At each junction where the next symbol can apply, apply it. Early levels have single-choice junctions; later, the symbol applies at the nth side road or at the landmark.
3. Draw the result as the gold guide line (the driving guide's colour), extending as each symbol is dropped.
4. Where the chain runs out or can't apply, the line stops with a small question mark. Where it leads somewhere else, the line shows that place.

## Level ladder

The difficulty knobs are listed in order. Each level turns up one or two of them.

1. Short routes in which every junction is a T or a single choice.
2. Roundabouts with an exit to choose.
3. Side roads to count ("third left"), with stubs.
4. Landmarks and distances.
5. Visitors with limits, which carry the safe-road rules:
   - a family cycling over must cross the dual carriageway at the lights, never at road level;
   - a horsebox can't take the low bridge;
   - a road is closed for works.
6. Longer routes from the edges of the Birchie map, and a choice of routes where the quicker one wins a little more.
7. Mastery: the live line is hidden. She writes the route from the map alone, sends it, then watches the visitor drive it.

## Rules carried over

- Visitors start from made-up households placed on the Birchie map. The game never asks for, or uses, the child's own address.
- Place names allude to real places and never name them (docs/naming-places.md).
- The look suits 8–9 year olds: confident map and sat-nav styling, nothing picture-book.
- Dragging works by touch. Tapping a symbol and then a slot works too, for children who find dragging fiddly.

## The spike, when it comes

- A plain canvas page beside the driving spike (apps/game/public/admin/), using the same Birchie road data and the guide-line drawing.
- One visitor, one start house, symbols to drag, the live line, and a "send" that animates the visitor along it.
- Levels 1–3 only, with a check that every level's intended route is reachable and that the live line agrees with the route the checker computes.

## Open for later

- What a visit brings: an adoption, a donation, a volunteer.
- How many emails a day, and whether urgent ones exist.
- Whether she can reuse a strip map she wrote before for a neighbour's house.
