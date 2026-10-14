# The driving game, rebuilt — design 2026-10-11

Marcus's design, given in conversation on 2026-10-11 after watching Lily play
her favourite driving game and comparing it with ours. None of it was written
down anywhere before this file. The reference is a 35-second screen recording
of a hyper-casual city driving game; the measurements below come from that
recording frame by frame, not from memory.

## What was wrong

The scene drew a straight corridor and scrolled rows of it towards the player.
Measured on a 390pt phone: the carriageway was 44px wide, 11% of the screen,
and the van 16 x 27px, 4% of it. A quarter of the screen was opaque control
slabs — a gear column, a horn, a brake and a handbrake — sitting on top of the
world. Junctions arrived as a "Which way? Left / Right" prompt.

Marcus on the earlier version: *"quite a mess with roads going off at all
angles and difficult to manoeuvre, not at all the smooth and entertaining
driving game Lily and I had in mind."*

## The model

**The vehicle never moves and the world rotates underneath it.** Measured
across 33 frames of the reference: the car sits at 53.5% across and 59% down
the screen in every single one. It never translates. A bend is the world
turning, and the car rotates only a few degrees within the frame.

**Steering is on rails.** The route steers itself. There is no junction
decision and no way to leave the road. Marcus: *"the turning left and right can
be done automatically by the game until we create a more advanced level where
they're expected to read the map, the mini GPS on a running basis and make
decisions based on that."* That advanced level is a later tier, not a
cancellation — the GPS stays on screen.

**The child controls speed and lane, not direction.**

| Input | Does |
|---|---|
| Hold anywhere | Go. Releasing stops. This is how Lily already plays. |
| Gear 1 / 2 / 3 | How fast "go" is |
| Handbrake | Slam on, for when she is about to hit something |
| Swipe left / right | Change lane, which is how overtaking happens |

**The guide line.** A line from the vehicle's nose along the route ahead,
which the reference draws and never lets you turn off. Ours is switchable,
because a younger child cannot read the road fast enough without it and an
older one finds it babyish. Marcus's idea, and it is better than the
reference. The route it draws is the one the GPS already computes. The switch
is on the driving screen itself, a brass knob on the dashboard beside the GPS,
on by default and remembered on the device (Marcus, 2026-10-11: the game has
no settings screen). Its colour is gold, with a dark brown edge, on the road,
on the GPS's route and on the switch's face, so "your way" is one colour
(Marcus, 2026-10-14: the blue had begun to read as water, since 69A painted
the real ditches and ponds blue). It is a saturated yellow gold, further from
the beige of the dust and the sand-coloured farm tracks and from the amber
glow of the crossing animals than an orange one; the edge is what makes it
read on a pale track. Defined once, as `GUIDE` in `drive-spike/dashboard.js`.

*The edge, widened and darkened (Marcus, 2026-10-14, 79A).* The line did not
stand out from village lanes, tarmac and houses (gold against the ground was
about 1.8:1 there, and the edge about 2.2:1). The edge is now a near-black brown,
`#1c1104` at 95%, 1.5 m wide round the 0.85 m line (it was `#3a2606` at 72%,
1.25 m), and the gold is drawn at full strength (it was 92%); the gold itself,
`#f4c20d`, is unchanged. The GPS's route and the switch's face take the same
edge (`GUIDE.edge`, `edgeW`, `lineW`), so "your way" still reads as one line.
Target: at every point along the route, the larger of gold-against-ground and
edge-against-ground is at least 3:1 (WCAG contrast of the colours read from the
canvas, the ground read with the guide switched off, so it is the real ground
and not a guess). Measured along Henry's whole route, moorland to Pinebark
Medical (7986 m, 159 stops, every road class on the map), and Trikey's, Hog
Hospital to Bramble Farm (1511 m, 59 stops): the worst place was 2.29:1 for
Henry (a farm track, 800 m in) and 2.64:1 for Trikey (a track, 275 m in) before,
and is now 3.28:1 for Henry (the dual carriageway, 2050 m) and 3.49:1 for
Trikey (a track, 450 m). Winter, autumn and spring on Henry's route are no
lower than 3.28:1. Contact sheet: `docs/img/strip-labels/contact.jpg`.

## Why top-down, and why that is not a compromise

The reference is low-poly 3D, so rotating the world is free. Ours is painted
sprites. A top-down painting rotates for free too — a roof is a roof at any
angle — but a building painted in three-quarter view has to stay upright while
the ground turns under it, and that fight cannot be won with painted art. So
the fully top-down camera is the thing that makes the rotation affordable.
Trees are canopies, not trunks.

**Shadows are drawn in world space, not baked into the sprite.** The fleet is
painted with the light from one side. Rotate the sprite and the sun rotates
with it, which is the detail that would give the whole thing away.

## Gears are about choosing a speed for the circumstances

Not about learning a gearbox. The graph already carries an OSM road class on
every edge, so the right gear for the road is a lookup rather than new content.

| Road | Gears | Getting it wrong |
|---|---|---|
| Dual carriageway (`trunk`) | 2–3 | First gear has traffic beeping and pulling up right behind |
| Main / country road (`secondary`, `tertiary`) | any | — |
| Lane, houses (`unclassified`, `residential`) | 1–2 | Too fast |
| Farm track, rewilding approach (`track`) | 1 | A dust storm the animals breathe, shown on screen |

**Every gear works on every road (30A, Marcus, 2026-10-12).** "Any gear is
available in any car at any time, but that doesn't mean that it's correct for
the road that one is on. The same with bicycle gears that might be more
familiar to children." The gear sets the top speed, so the fastest speed
needs third; the "Gears" column is what suits the road, never a lock. A wrong
gear is allowed and costs what the right-hand column says: too fast for the
road flashes the speed camera (`speedCameraFires` in `road-gears.ts`), jostles
the animals harder and makes the van's own hard stops (for traffic, for a
crossing animal) come sooner and more often; too slow on the big road queues
the traffic behind her. While her gear does not suit the road, the knob that
suits it pulses as a hint she may ignore (33A below).

**How the road prompts her (30A, Marcus, 2026-10-12, first pass; the lock in
it is superseded by the rule above).** He had not noticed the gears at all. In
the wrong gear for the road, the knob for the right one glows and pulses; the
gear shows as a big number on the dashboard; a change gives a clunk and a
small lurch. His words, before he overruled the lock: *"what will be most
noticeable and annoying for her is that the speed of the vehicle is limited to
the gear that one is in. So one does need to go up to gear three in order to
go at the highest speed."* The first pass also dimmed the knobs above the
road's top gear and held the van to that gear's speed; that lock is dropped,
and a gear above the road's top one costs what the table says instead.

**Decided after the first builds (Marcus, 2026-10-12).** 31A: the road surface
at medium strength (`?road=1`, the default). 33A: the knob pulses only when
her gear does not suit the road. In second on a main road, where every gear
suits, nothing pulses; the first builds also pulsed the road's best gear
(third there) when hers suited but was not the best, and picking any suiting
gear hushed it until the next road. Both the spike and the real game now pulse
a knob only while her gear does not suit the road, and stop the moment she
picks one that does.

**What the spike does now (2026-10-12).** Every gear works on every road in
`drive-spike.html`: the gear sets the van's speed wherever she is, nothing is
dimmed or refused, and while her gear does not suit the road the road's best
knob pulses until she picks a gear that suits (33A); she may ignore it. Too
fast for the road (third on a lane, among houses or on the A28's 30–40 mph
stretches; second or third on a farm track) flashes the speed camera once per
stretch of road, a white flash and a little camera in the corner (a "speed
camera!" note instead of the flash under reduced motion); while she is going
faster than the road's own gear would take her the comfort gauge falls (the
animals jostled), and on a farm track a dust cloud trails the van. The van's
own hard stops for traffic and crossing animals still count as rough driving,
and at speed they come sooner. First gear on the dual carriageway gets the
traffic queueing behind and "beep beep!". The A28 is drawn stretch by stretch
from `trunk-carriageways.json`: the dual carriageway as before, the divided
road through Birchington to Westgate as a two-way road with a narrow kerbed
island and two lanes each way (her right-hand lane is an overtaking lane, the
oncoming traffic is across the island; where there is one lane each way she
cannot change lane across the kerb), and the single stretch through The Square
as an ordinary main road with a centre line. Only near the dual carriageway
does the camera pull out and the chip say "dual carriageway"; elsewhere the
A28 is a "main road". The single stretch no longer spills over the house
street beside it at Westgate, and where the A28 bends on a point of that
street the A28's lines now stop at its edge. "to A28 town" in the dev tools
jumps to the divided and single stretches in turn.

**What the real game does now (2026-10-12, `claude/road-gears-30a`).** The
same rule, in `road-gears.ts` as pure functions: `suitingGears`/`bestGear`
(the road's top suiting gear, by A28 carriageway too), `gearFit`, `gearCosts`
(speed camera, a jostle multiplier, sooner self-stops, `queue`, `dust`) and
the knob prompt (`stepGearHint`: the best knob, 0.6 s after her gear stops
suiting the road, and only while it does not suit, 33A). `ride-comfort.ts`
takes the multiplier, the sooner stops (still EMERGENCY, so still rough) and
the gear's soft pull near its top. `PtvDriveScene` glows the knob (steady,
with a toast, under reduced motion), knocks the animals harder while too fast,
brakes itself sooner behind traffic, draws the dust and beeps the queue once a
stretch. Nothing refuses, dims or caps a gear by road. Not yet ported: the big
numeral, clunk and lurch.

## Lane discipline, and being allowed to be naughty

Marcus: *"Lily loves speeding and overtaking and generally doing slightly
naughty things on the road."* So keeping left is the default and the taught
behaviour, and overtaking is available **when the road conditions permit it**.
The reference rewards a near miss with "CLOSE!" and a 😱 — praise for skill,
not a score. Ours should do the same for a clean overtake.

## Two modes, and the line that is never crossed

**No animal is ever hurt and there is never a road accident.** Not a
difficulty setting. The penalties below are the whole consequence model.

**Carrying animals.** Emergency braking and swerving disturb them. Enough of
it and the vehicle pulls over at the side of the road until they settle, and
the driver does something to help them. The cost is time and care.
`jostleComfort` in `src/driving/drive-state.ts` is the existing seed of this.

**Delivery race, nothing alive aboard.** The child may drive as badly as they
like. The cost is cargo: animal food spilled across the road, crates out of
the back with the hay and carrots. Small, and always recoverable — go back for
more supplies, or pick a vehicle the load does not fall out of. Nobody pulls
over to look after a sack of carrots.

That split is the point. The game teaches that *how you drive depends on who
is in the back*, which is a better lesson than "drive carefully" and lets Lily
have the fast one.

## What is proved, and where

`apps/game/public/admin/drive-spike.html` — a plain-canvas spike, no Phaser,
open at `/admin/drive-spike.html`. It drives the real 937-node Birchie graph,
so the roads in it are the roads on the child's map.

Measured in the spike against the game today:

| | Reference | Spike | Game today |
|---|---|---|---|
| Vehicle width | 13.5% of screen | 13.6% | 4.1% |
| Vehicle length | 13% of height | 12.7% | 3.2% |
| Lane width | — | 110px | 28px |
| Controls over the world | none | none | ~25% of screen |

**The one thing the spike found that the design did not predict.** The route is
straight segments between graph nodes, so its tangent snaps by up to **55° at a
corner** — measured. Pointed straight at the camera that is violent, and it is
very likely what "difficult to manoeuvre" actually was. Two lines fix it: aim
the camera at the route 20m ahead rather than at the segment underfoot, and
ease towards that aim rather than jumping to it. Measured again after:
**1° per frame-sample, against the route's 7°**. The van is then drawn at the
difference between its own heading and the camera's, which is exactly what
gives the reference its look — the world swings, the vehicle barely turns.

## Decided later the same day

**When she does not brake, the van does, hard.** Holding "go" into the back of
a slower vehicle never ends in contact: the van stops itself at 26 m/s², and
that stop counts as rough driving — the animals are jostled, or on a delivery
run the cargo shifts. Braking for herself is the skill; the self-stop is the
cost of not doing it. Marcus chose this over a gentle cruise-control that
would cost nothing and make the handbrake pointless.

**The dual carriageway keeps its true width and the camera zooms out for it.**
Four 5 m lanes and a grass strip, 21.6 m, would fill a 390 pt screen, so the
camera eases out to 0.62 as the van approaches one: the van shrinks a little
and she sees further ahead at the road's top speed. Marcus chose this over
narrowing the big road's lanes to 3 m, after seeing both side by side: narrow
lanes would have made the biggest road's lanes narrower than a country
road's, which is the mismatch a child spots. "to big road" in the spike jumps
to a route that uses one.

**The camera's distance follows speed and place.** Marcus, 2026-10-11: going
fast is for overview and seeing far ahead; going slowly, on the small lanes
and pulling up at a farm or a rewilding site, is for detail, such as a small
animal crossing the road. In the spike the zoom runs from 0.66 at top speed
to 1.15 standing on a main road and 1.35 standing on a lane, house street or
track, rising to 1.6 over the last 120 m to a destination, and never closer
than the dual carriageway's 0.62 allows. It eases out quicker than in. 1 is
the scale measured against the reference, the van 13.6% of the screen's
width.

**The van pulls up at the destination on its own**, as the route steers on
its own: within about 80 m at top speed it lowers the speed she can ask for
and stops at the gate, gently, so it costs no jostle. The place is named, and
the next drive sets off from there.

**What happens at a roadside stop.** Marcus and Lily, 2026-10-11. There are
two reasons to pull over, and the care depends on the animal and the weather:

- *Rough driving.* The animals are unsettled. The driver opens the back and
  either calms each one by touch, stroking it or talking to it in its crate
  until it settles, or gives it what it needs: water, a treat, a blanket.
  Which one depends on the species and on the day: a blanket in the cold,
  water in the heat.
- *A squabble.* Lily: sometimes you have to pull over because the animals
  have started growling at one another. That is a social problem between
  them, not a driving one, and the fix is to rearrange the crates. It should
  be rare when the crates were loaded with care, and more common when the
  child took chances with the arrangement. This joins the drive to the
  crate puzzle: `packages/game-logic/src/crate-stacking.ts` already rates
  every pair of neighbours `happy`, `stressed` or `blocked`
  (`feelingToward`), so a load with stressed neighbours is what makes a
  squabble likely on the road.

**Controls, and the rest of the port plan's questions.** Answered 2026-10-11;
the full table is in `docs/driving-port-plan-2026-10-11.md` section 5. The
gear, handbrake and horn live in a strip along the bottom, below the van,
styled as the vehicle's own cockpit dashboard. Park and Reverse are gone. In
landscape the van sits lower and the camera pulls back. Every vehicle is drawn
at its true width relative to Henry. Supply runs are the delivery race.

**The trip strip and the chips (2026-10-13, decided).** The trip strip
(`drive-spike/trip-strip.js`, Lily 2026-10-12) is the drive up the left edge
of the road view: the destination at the top, the van climbing, the sights on
the way from `landmarks.json`, each matched by a fingerpost at the roadside.
Marcus found it too intrusive, wasting the left column, and too picture-book
for 8 to 9 year olds; and the chips at the top looked like wireframe
placeholders. Three directions for each were built behind URL parameters
(screenshots of the chosen ones and both contact sheets are in
`docs/img/strip-and-chips/`). Marcus chose:
- **71A:** the slim frosted rail flush with the left edge is the trip strip.
  Sights are flat pictograms on discs coloured by kind, with a tag for the
  destination (and the distance to go) and one for the next sight.
- **72B:** the road-sign badges are the chips. The road chip takes the
  colours of that road's real signs, and a wrong gear shows a red warning
  triangle.
- **73A:** no gear or speed chip, as the dashboard's gear window and
  speedometer already show them. The lane and road chips stay, and the quiet
  `dev` chip. Where the road has no lanes (a cycle path, a farm track, a
  track, a path, and Trikey's crossing, which `laneOffset()` also takes as
  laneless) the lane chip is not shown and the road chip stands alone (Marcus,
  2026-10-14); it read "left lane" there.

The other looks, and `?strip=` and `?chips=`, are gone. The wrong-gear
warning is its own plate after the road chip (a red triangle and what it
costs: "slow down", "dust!", "beeping"), so the road chip keeps its road's
colours and nothing else in the row moves when it comes and goes; the gear
knob on the dashboard still pulses only when the gear does not suit the road
(33A). The handbrake is shown by the dashboard's lever, not a chip.

*Animals waiting on the verge.* At 390x844 the rail itself stays clear of an
animal waiting on her side of the road, but its tags do not: the
destination's tag sat over a fox and a hedgehog (in play-tests of both vans)
while the van was 9 to 11 m short of them, and the next sight's tag sits
wherever its sight is on the rail. At 1280x800 nothing reaches them, the verge
being far from the left edge. So the page gives the strip each animal's box
(`crossings.animals()`, through the world's transform) and any part of the
strip over one (rail, destination tag, next tag) goes to a tenth of its
strength until the animal has gone by. It comes back only once the animal's
glow is 10 px clear, so a breathing glow does not make it flicker.

**Strip name labels, and the strip as a map (Marcus, 2026-10-14).** Marcus:
"Constrain the strip name labels so they never protrude that far toward the
right, one word per line as we have vertical space spare but not horizontal
space to be generous with."
- Each sight's or destination's label sets one word to a line with the distance
  on a line of its own below, and is as wide as its longest word and no wider
  (`width: max-content` over blocks that do not wrap). An ampersand stays with
  the word after it ("& Fishy"). Of the 64 names the strip can show (every
  sight, every destination, the pair "Car Wash Wahoo! & Fishy Bones" and the
  two corners, "Crossroads" and "The corner"), the longest word is
  "Chartmeadow", 89.6 px at 390 x 844, which makes "Chartmeadow School" the
  widest label at 104 px, its right edge at 143 px of 390. The tallest is the
  pair, five lines at 90 px.
- Taller labels must not collide. The next sight's tag still sits level with its
  disc, but where that would put it over the destination's tag (the last sight
  before the destination) it sits just below that tag, 6 px clear, its pointer
  on its disc where that is within reach, and it never goes below the foot of
  the strip. Where the strip is too short for both, the destination's tag, the
  grown-up's, stays and the next sight's is left out. The nearer sight is the
  one labelled, always: only the next sight has a tag.
- The ghosting over animals on the verge is unchanged, and covers the taller
  tags and the rail with its marks: each goes to 10% while an animal is within
  3 px, and back once it is 10 px clear.

The rail is drawn as a military strip map (80A and 81A, Marcus, 2026-10-14). The
route is one line, read upward the way the van travels:
- *A turn* (80A): the line bends into a small arrow pointing off to the side she
  turns to, square for a right angle and leaning forward for a gentler turn, and
  after a small gap (one line width) the line carries on straight above it. The
  arrowhead is 2.5 line widths long, the line 3 px.
- *A roundabout* (81A): a small ring on the line, the exit arm leaving it at the
  angle she actually exits by, measured from the way she entered (straight on is
  up), with an arrowhead, as UK roundabout signs draw it; then a gap, and the
  line again. A double mini-roundabout is two small rings close together on the
  line (a line width apart), the arm leaving the upper, as the UK sign draws it.
  Only a real roundabout is drawn (96A, below).
- Only turns and roundabouts (80A): no stubs for the side roads she passes, and
  an ordinary bend in a road is not a turn. A turn is a junction (three or more
  roads meet) where the route's heading changes by 30 degrees or more, 20 m
  before to 20 m after; junctions less than 20 m apart along the route (the
  corners the route makes round Trikey's lights) are taken as one, and a jog
  that comes back is no turn. A roundabout is not found from the road graph's
  shape: it is a real one, from OpenStreetMap (96A, below). A turn at a
  roundabout is the roundabout's exit, and no turn mark of its own.
- The rail is as wide as its discs need, and as the arrows for a left turn need
  from the line in the middle: 31 px at 390 x 844 (it was 30), 39 at 1280 x 800.
- Collisions. A mark never sits under a sight's disc (the sight is what she looks
  for), nor off either end of the line: it moves up to 5 px along the rail
  (less than the length of its own arrow) to clear one, and if it cannot it is
  left out. Where two marks would crowd each other (their arrows and the gap
  closer than a line width) the nearer junction wins: the next she will meet
  first, then the one she has just passed; the other comes back when the nearer
  is behind her. One exception (94A, which Marcus confirmed): a roundabout is
  never left out for a turn. On this map every roundabout had a turn within
  about a hundred metres, which on the rail is the same pixels, and the van's
  own icon hides a mark that close ahead, so strictly nearer-wins would never
  show a roundabout (checked over 200 of Henry's routes and 120 of Trikey's, in
  steps of 25 m). Marks and the labels cannot meet, as the arrows stay inside
  the rail. A roundabout may also move further than a turn, up to 28 px, to
  clear a sight's disc (96A, below). How many marks are drawn is under 95A,
  below; the marks ahead of the van come back as it passes.
- The 10% ghosting applies to the marks as they are part of the rail.

**Smaller discs for the sights that are not next (95A).** Marcus, 2026-10-14. At
the start of a drive about half of the turns and roundabouts were drawn, and a
good share of the rest were under a sight's disc, so a sight that is not the
next one is now drawn at 0.75 of the disc (13.5 px at 390 x 844, it was 18),
keeping its white ring; the next sight's disc is as it was (1.25 times the disc,
gold ring). A mark clears a sight's disc by that disc's own size, so which marks
are drawn changes when the next sight changes as well as when she passes a mark
(`SMALL_DISC` in `trip-strip.js`). Measured at the start of every drive that
"new route" can give, at 390 x 844: 202 of Henry's (852 marks) and 44 of
Trikey's (172), as the 55% and 47% were (marks drawn over marks there are):

| | Henry | Trikey |
|---|---|---|
| Before 95A and 96A (geometry detector, old discs) | 54.0% (460 of 852) | 48.8% (84 of 172) |
| With the real roundabouts (96A), old discs | 62.8% (536 of 854) | 54.2% (104 of 192) |
| And the smaller discs, 0.75 (95A) | 65.8% (562 of 854) | 58.9% (113 of 192) |
| For the record, discs at 0.85 and at 0.65 | 64.8% and 66.7% | 58.3% and 59.4% |

Most of the rise is the real roundabouts, which are drawn on every route through
them (84 and 18) where the geometry detector's were rarely seen. The turns alone,
Henry: 454 of 824 (55.1%) before, 478 of 770 (62.1%) now; Trikey: 80 of 162
(49.4%) before, 95 of 174 (54.6%) now. The discs were less of the cause than
thought: a mark is 11 to 13 px tall with its arrow and gap, so it needs a clear
band that tall beside each sight's disc, and a smaller disc only trims the
disc's half of that. Taking a quarter off the discs wins three to five points,
and a further tenth off wins one more. What stays out is the 212 of Henry's 854
(25%) and 72 of Trikey's 192 (38%) with no clear band within 5 px of their
place, and the 80 of Henry's and 7 of Trikey's that a nearer mark took. Drawing more would take a wider nudge for turns (a
mark further from its place), which has not been done.

**Real roundabouts only (96A).** Marcus, 2026-10-14. The strip first found
roundabouts from the road graph's shape (a small closed loop of roads, round
enough, with three or more roads leaving it), because `birchie-graph.json` has
no `junction=roundabout` tag, and they were never checked against the real
roads. Now they are, with a fresh Overpass export (OSM base 2026-10-14T10:43:12Z,
ODbL, gitignored: `manus-output/birchie-osm/roundabouts/birchington-roundabouts.json`;
its query is in `tools/osm-roundabouts.py`). The map has no `junction=roundabout`
way at all. It has four `highway=mini_roundabout` nodes and three
`junction=circular` ways:

- *The geometry detector's two were not roundabouts*, and not the circular loops
  either. One was a triangle of three small roads by Birchington station (Station
  Approach and its neighbours; graph nodes 358, 359, 524; 141 m round; 51.3774 N,
  1.3018 E), the other the triangle of the A28 (Canterbury Road), George V
  Avenue and a service road at the Margate end of the map (nodes 736, 800, 810;
  119 m round; 51.3810 N, 1.3593 E). The nearest real roundabout to them is
  about 520 m and 330 m away.
- *The three `junction=circular` ways are loops, not roundabouts*, and are not
  drawn: 30890501, the Broadley Avenue loop (residential, 65 m round, one way
  round a green), 147963811 (a 53 m private service-road circle, 5 mph) and
  889383024 (a 24 m driveway circle). No one gives way on them.
  `roundabouts.json` keeps them as `notRoundabouts`, so they are not found again.
- *The four mini-roundabouts* are what `tools/osm-roundabouts.py` writes to
  `assets/driving/roundabouts.json` (small; an ODbL source line in it; positions
  projected as `osm-nature.py` does). The strip snaps each, at run time and for
  whichever graph the van drives, to the nearest node of the graph if within
  20 m, and otherwise leaves it out; any node at the same spot counts too
  (Trikey's graph splits the A28's junctions by side). Two minis within 25 m are
  one double mini-roundabout, drawn as two small rings close together, with the
  arm leaving the upper.

| OSM node | Where | Graph node | Snap | Nearest junction (3+ roads) | On a drive? |
|---|---|---|---|---|---|
| 1610678576 (51.37390, 1.30704) | The Square, Birchington (Canterbury Road, Park Lane, Station Road) | 480 (4 roads) | 0.2 m | 480, 0.2 m | Henry 84 of 202, Trikey 18 of 44 |
| 303467654 (51.37367, 1.31069) | Park Road, Farrar Road, Cornford Road | 157 (2 roads) | 0.2 m | 824, 92.6 m | no drive |
| 5617220766 (51.37794, 1.35888) and 29028903 (51.37804, 1.35897), 12.6 m apart: the double | the Margate edge of the map, by Maynard Avenue and Westfield Road | 73 (2 roads) | 0.1 m and 12.6 m (6.3 m from their middle, where it is drawn) | 736, 335 m and 324 m | no drive |

- The graph is a skeleton: at two of the three the node carries only the main
  road through, so "nearest junction" (three roads or more) would put the
  roundabout 92 m or 330 m from the real one. The strip snaps to the nearest
  node of any degree within 20 m instead.
- Only The Square is ever seen. The other two are on dead-end spurs that no
  drive between the 15 places passes (the nearest drive is 91 m and 700 m from
  them for Henry, 240 m and 1.3 km for Trikey), so they were checked on made-up
  routes through the node. The drives through The Square are those between the
  town side (the A.R.C., the vet, the village hall, bramble-farm, cove-harbour,
  goose-end-farm) and the rest; Henry's exits are 36, 45, 98 and 127 degrees
  either way, Trikey's 39 and -101 (the heading 20 m after against the heading
  20 m before, as for a turn).
- *The Poppy Clock*, a rank-1 sight, stands 30 m from The Square's roundabout,
  so it is a sight on every drive through it and its disc covers the
  roundabout's place. So a roundabout may move up to 28 px (a turn, 5) to stand
  just clear of a sight's disc, and then it is drawn on every drive through The
  Square, all 84 and 18; without that none of the 84 was drawn at the start of
  a drive.
  This costs position: the ring can sit up to a disc and a mark (about 22 px)
  from its place on the rail, 330 m on a six-kilometre drive. The other choice
  is to leave the roundabout out when a sight is on it.
- The geometry detector is gone (`findRings` and its loop, roundness and road
  constants), not kept as a fallback.

Screenshots of all of this, and the gold line and the lane chip, are in
`docs/img/strip-labels/contact.jpg`; of the real roundabouts as the van
approaches, and the smaller discs before and after, in
`docs/img/strip-roundabouts/contact.jpg`.

**Small animals cross the small lanes.** Marcus's idea, and the reason the
camera comes in close on them: hedgehogs, rabbits, pheasants and the like
cross in front of the van; she slows or stops, and if she does not, the van
stops itself, as it does for traffic. Never an accident.

**What the spike does now (asked 2026-10-12).**
- Every vehicle stops for a crossing animal, both ways, not only the van:
  cars, tractors and buses slow gently and wait short of it, then go on once
  it is across. An animal waits on the verge until everything coming either
  way can stop for it. `safety.check.mjs` drives the animals and the traffic
  together on the real Birchie roads, the A28's dual, divided and single
  stretches included, and finds no vehicle ever touches an animal.
- Behind a slower vehicle the van's gap breathes: it drifts back and in by
  up to a metre and a half, slowly and unevenly, so the two do not move in
  lockstep. Settling in behind something no longer counts as a hard stop or
  rattles the animals in the back; only a real hard stop does.
- Poking out to look (37A): the further she swipes right, or the longer she
  holds →, the further the van eases out towards the centre line to see past
  what is in front. Let go before halfway and it eases back; past halfway it
  overtakes, but only if the road allows. While she looks, a small round
  sign by the centre line says go (green, an arrow) or wait (amber, two
  bars). It never eases out into anything coming the other way.
- The look-ahead window seen from behind her van (54B). While she pokes
  out, the 16:9 window that slides in at the top shows the road ahead from
  just behind her van at the driver's eye height (Trikey 1.1 m, Henry, Bea
  and Spark 1.6 m, Big Tilly 2.4 m), from where she has poked out to: the
  back of the vehicle she follows on the left, her lane and the oncoming
  lane, and the front of anything coming. As she eases out the eye moves
  right, so the vehicle in front slides left; fully out it turns and
  narrows in on what blocks her, ringed in amber (a small car coming also
  close up in a round magnifier), with the wait or go sign. Marcus: no
  rear-view mirror, nothing from above. The ground is the top-down
  ground and roads projected onto the road a row at a time; trees, hedges,
  walls, houses and the real buildings from the map (each at its own eave
  and ridge height) stand up beside it; the traffic is the painted back
  (going her way) or front (coming) of each vehicle, 26 pictures in
  `assets/driving/vehicle-views/` (its README and `index.json` say how they
  are sized), scaled to the vehicle's real width and distance, with a plain
  one in its colour until a picture has loaded. The red and blue tractors
  are the green one hue-shifted, so the three match. The tractor is the modern
  four-wheel-drive one (75D, Marcus, 2026-10-13): Set A front d, with chunky
  lugged 4WD front tyres, and the rear's seat turned to face forward.
  `drive-spike/behind-view.js` draws it.
- On the A28's divided stretch her right-hand lane is hers to use; it was
  being refused near every bend as if it were the oncoming lane.
- Each animal's shadow sits under its feet, with a small dark spot where it
  touches the road; a hopping rabbit leaves it behind on the road. Marcus,
  2026-10-13: the golden glow was too bright and sandy, and the deer floated
  above a small shadow. Each painted animal now stands on one soft shadow
  sized from its painting's feet (found from the picture's alpha: about as
  long as the feet are far apart, a little more), its hooves, paws or feet on
  the shadow's upper middle, and kept on the ground in a hop, a little smaller
  and paler; the deer's bound is lower (0.3 m). The glow (32A: about twice the
  animal's width, pulsing with the gait) was light laid on the road with the
  `screen` blend, round the shadow, which does nothing on pale ground (the
  frosted winter verge, sand and straw tracks). Marcus, 2026-10-14 (93B),
  chose the edge glow from three: a soft gold edge with a faint darker outer
  line, chosen because it reads on pale ground. A screen layer lights dark
  ground, a colour layer turns any ground gold at its own lightness, and the
  dark line outlines the edge on pale ground. The footprint is the same as
  before, so `crossings.check.mjs` measures the same body, and it holds still
  under reduced motion. The other two, a thin ring and a deeper gold, are gone.
- Ducklings follow their mother across in a loose single file, never
  abreast.
- The van stops about a van length short of a crossing animal (39A), so it
  crosses mid-screen rather than up under the labels, in every gear: it
  eases, gently enough not to be felt, towards an animal waiting on the
  verge, to a speed at which the animal is on screen in time to step out.
  Letting go a moment after it moves stops her about 5 m short; if she does
  not, the van stops itself about 4.4 m short, and that still counts as rough
  driving (`crossings.check.mjs` reports the stops by gear).
- The camera fix (2026-10-13). The checks modelled the old camera (20.6 m of
  road ahead in second gear, upright); the page now shows 26-30 m in second
  and third, the van 75% down the road view above the dashboard. So the
  animal was always on screen in time, the van never eased, and it stepped
  out with the van at full speed: the stops ran from 3.9 to 5.4 m. Now the
  van eases, gently, to first gear's speed for an animal waiting at the
  kerb in every gear, and the animal sets out a frame early rather than a
  frame late: upright, letting go stops her 5.1-5.5 m short and the van's
  own stop is 4.5-4.6 m, in every gear. Held sideways the screen shows too
  little road above the van for that in first gear (about 8 m below the
  chips at the lane zoom); the van creeps and stops 3.5-4.5 m short there.
  Both checks now model the page's camera as measured on it (390x844 and
  844x390), its town pull-back included.
- Rarer animals, more often (60A, 2026-10-13). The drake was out on one
  drive in a hundred or more and a deer on one in forty; each should be
  about one in ten.
  The child's map is coarse: its woods, one pond no lane passes, and garden
  swimming pools, which were where the ducks crossed. So the real water and
  woods beside the lanes come from OpenStreetMap (ODbL; Marcus ran the
  Overpass query, 64A): `tools/osm-nature.py` writes
  `assets/driving/nature.json`, the ponds, reservoirs, basins, ditches,
  drains and the Brooksend stream, the woods and the scrub within 100 m of
  a lane. Every lane within 40 m of water, or along a wood's or scrub's
  edge, is a place the ducks or a deer may cross, as well as the usual
  places, but only on a drive when they do, so drives are no more
  stop-start: once a drive at most, the ducks are out at the first water
  place it passes (on three drives in five by still water, one in five by
  a ditch or the stream), and a deer (on about one drive in six) at the
  first wood's edge or field by the woods. On those drives they have the
  first claim, and a usual place too near them gives way. In two runs of
  1,000 drives each: the drake on 1 in 8-9 with Henry and 1 in 9-12 with
  Trikey (hers by the pond on the lane she rides from the country road), a
  deer on 1 in 11-12 and 1 in 9, a duck family on about 1 spring drive in
  7 and 1 in 9; crossings a kilometre as before (Henry 0.82-0.84, Trikey
  1.01-1.02, against 0.85 and 1.00).
  A big animal waits further back from the kerb (a deer at the wood's edge,
  about 3.3 m), so that drawn upright however the camera turns it is never
  drawn over a car going by. Still the sexes mixed, and only the duck leads
  ducklings, in loose single file.
- The water is drawn (69A, 2026-10-13). Marcus: "Draw the real ponds,
  ditches and reservoirs along the lanes in the painted style, so you can
  see where the ducks come from." `scenery.js` paints `nature.json`'s water
  on the ground, under the roads, hedges, trees and buildings, in each
  season's colours: ditches and drains as narrow dark water with a soft
  sheen, damp green banks and clumps of reeds and rushes, following the
  real lines; the stream a little wider, with bulrushes in summer and
  autumn; ponds rounded, reeds in the shallows, a few lily pads in summer
  and thin ice in winter; farm reservoirs straight-sided on a mown
  embankment with a crest path and the dark liner at the waterline; the one
  small basin mostly dry, rushes round a puddle. Where a ditch meets a road
  it goes under it: a small concrete headwall at the road's edge on each
  side the water comes out, and a short mapped piece that crosses a road is
  taken for the culvert itself, since `nature.json` keeps no tunnel tags.
  Where the projection lays a waterway along under a lane (the stream
  beside the marsh track), it is moved out to the verge, as a building in
  a verge is. No tree stands in water. The look-ahead window's ground is
  this same ground, so the water lies flat in it too. Screenshots:
  `docs/img/water-scenery/contact.jpg`.
  The ducks do not yet come from the water's side: `crossings.js` sets them
  out from the near verge three times in four (a family always), whichever
  side the water is on, so on real drives about half the duck crossings
  start on the side away from the water.
- Where the route folds back on itself (the A28 bends on a point of the
  Westgate house street the route drove earlier) traffic on the far part was
  being drawn over the van. Such a place is now used one side at a time, the
  van first, and `safety.check.mjs` counts every overlap, wherever the vehicle
  is along the route: none.

**Following the road is not a swerve.** Only the child's own lane change feeds
the jostle model; the van drifting outward as a lane widens or the road
becomes a dual carriageway is the road moving under it, and is free.

**The A28 as it really is (17A, 18A).** OSM's `highway=trunk` means a
primary A-road, not a dual carriageway, and the game had drawn every trunk
edge as one. Here the A28 is 1.7 km of real dual carriageway at 50 mph (west
of Brooksend), 2.0 km of divided road (two one-way carriageways, 30–40 mph,
Birchington to Westgate) and 3.5 km of ordinary two-way A-road (through The
Square). The game draws each as what it is; the big-road zoom belongs to the
real dual stretch. Trikey never rides along the A28; she crosses its
30–40 mph stretches only at traffic lights or a zebra, waiting for the green,
and the dual stretch only by bridge or tunnel (there are none). Marcus: a
crossing at road level of a dual carriageway "teaches something very
dangerous to kids". Nothing the game makes normal on the road should be
dangerous for a child to copy.

In the spike (`?van=trikey`) she now routes by the same rule as the game:
`drive-spike/trikey-roads.js` is `trikey-links.ts` and the router line for
line (a test holds the two to the same graph and the same route between
every two places), and a place out of her reach is never picked (from
A.R.C. she reaches Bay Chapel, Deep Forest, Pinebark Medical, Wetlands,
Wilderwood and Woodland; Bramble Farm and the Hog Hospital only from each
other). The spike draws the A28 at its true width, and the cycleway that is
her only way to Bramble Farm ran inside the dual as drawn, so she was seen
riding along it: her paths are now drawn and ridden beside the A28, a verge
past its kerb, and her way over it goes down the pavement to the lights and
straight across (15 m at the pelican in The Square, 26 m at the lights at
St Mildred's Road). `trikey-routes.check.mjs` judges every route against
the game graph's own A28 and fails on any metre of her riding drawn on it
but the crossing itself.

**At the lights she stops, presses and waits for green (62A).** Marcus,
2026-10-13: she stops, the child presses the crossing button, and she rides
over when the green signal shows, because it is the habit a child should
copy. Both of her crossings are drawn as UK toucans (the kind a cyclist may
ride over): signal heads for the A28, stop lines, zig-zags and red blister
paving, and on each kerb a push-button box with a WAIT lamp and the green
cycle and green man. She stops at the kerb by herself, gently, as the van
pulls up at a gate (a safety stop, not a consequence); holding go there only
nudges her against the brakes. Once she has stopped and nobody has pressed,
the box glows and a toast says to press it; a tap on the box (or P) lights
WAIT with a soft beep, and a press on the way there counts too. The A28 goes
amber, then red; a vehicle too close to stop on amber goes through. When
every lane is held, after a one-second pause, the figure goes green and the
crossing beeps, and the traffic's green comes back only when she is clear of
the carriageway (or, if she never sets off, after 15 s, and she presses
again). With no press the A28 stays green. Press to green is about 5 s
(at most about 8.5 s). Neither of her crossings is a zebra: both are
signalled (the pelican in The Square and the lights at St Mildred's Road).
At a zebra (63A, Marcus, 2026-10-13) the rider gets off and wheels Trikey
across once the traffic has stopped, as the Highway Code asks of cyclists, the
same way she wheels Trikey onto The Animal Bridge; none of her routes uses a
zebra today, so this is the rule for when one does. The crossing in The Square
is a pelican in real life (one a cyclist should wheel across), but the game
keeps it a toucan she rides over (65B, Marcus, 2026-10-13).
`drive-spike/lights.js`; `lights.check.mjs` proves it.

*Porting it to the game.* `trikey-links.ts` already marks which crossings
she uses and their type; the port needs, per used crossing, the kerb-to-kerb
span along her route and the A28's lanes there (`trunk-carriageways.json`
gives the kind and lanes). In `PtvDriveScene.ts` the lights become a small
state machine stepped in `update` (green, demand, amber, red, cross, clear,
red-and-amber, with lights.js's timings), a speed cap on the van short of the
kerb exactly like the destination pull-up, a tap target on the box (plus P),
and cross traffic on the A28 for the crossing's few hundred metres, separate
from the route's own traffic. The markings and the upright box and heads are
Phaser graphics or a baked texture; the glow must hold still under
prefers-reduced-motion. Port `lights.check.mjs`'s assertions as a vitest
over the pure state machine and traffic step.

**Later levels: fuel, the workshop and the car wash.** Marcus, 2026-10-11:
"part of the driving game, as the levels go on, will also involve tanking
fuel at one of the two local garages, and sometimes a visit to the workshop
for repairs, and also visiting the car wash with the inflatable guy (which
needs better animated artwork)". How each works (what runs the gauge down,
what sends a van to the workshop, when a wash is due, Spark charging rather
than fuelling, Trikey needing neither) is still to be asked.

## Still open

- Fuel, workshop and car wash: the rules above, and the inflatable man's
  animation.
- Scenery. The spike draws roads on grass and nothing else, so there is no
  sense of speed beyond the lane markings. Top-down canopies, roofs, hedges,
  placed from the child's own map (`birchie-roads.svg` has the farmland,
  woodland, parks and sea), so what she drives past is what the map shows.
- Traffic, which overtaking needs to be about anything.
- How likely a squabble is for a given load, and what the rearranging looks
  like at the roadside: the full loading screen again, or a smaller swap.
- Where the gear, handbrake and lane controls live now that they may not sit
  on the carriageway.
- The advanced tier: the child reads the GPS and chooses at junctions.
