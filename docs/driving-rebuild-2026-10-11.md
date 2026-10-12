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
no settings screen).

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
the traffic behind her. The knob that suits the road pulses as a hint she may
ignore.

*In the real game (2026-10-12, `claude/road-gears-30a`):* `road-gears.ts` says
it as pure functions: `suitingGears`/`bestGear` (the road's top suiting gear,
by A28 carriageway too), `gearFit`, `gearCosts` (speed camera, a jostle
multiplier, sooner self-stops, `queue`, `dust`) and the knob prompt
(`stepGearHint`/`pickGear`: 0.6 s after a mismatch, hushed once she picks a
suiting gear, back on a new road). `ride-comfort.ts` takes the multiplier, the
sooner stops (still EMERGENCY, so still rough) and the gear's soft pull near
its top. `PtvDriveScene` glows the knob (steady, with a toast, under reduced
motion), knocks the animals harder while too fast, brakes itself sooner behind
traffic, draws the dust and beeps the queue once a stretch. Nothing refuses,
dims or caps a gear by road. Not yet ported: the big numeral, clunk and lurch.

**How the road prompts her (30A, Marcus, 2026-10-12, first pass; the lock in
it is superseded by the paragraph above).** He had not noticed the gears at
all. In the wrong gear for the road, the knob for the right one glows and
pulses; the gear shows as a big number on the dashboard; a change gives a
clunk and a small lurch. His words, before he overruled the lock: *"what will
be most noticeable and annoying for her is that the speed of the vehicle is
limited to the gear that one is in. So one does need to go up to gear three in
order to go at the highest speed."* The first pass also dimmed the knobs above
the road's top gear and held the van to that gear's speed; that lock is
dropped, and a gear above the road's top one costs what the table says
instead.

**What the spike does now (2026-10-12).** Every gear works on every road in
`drive-spike.html`: the gear sets the van's speed wherever she is, nothing is
dimmed or refused, and the knob that suits the road still pulses until she
picks a suiting gear or ignores it. Too fast for the road (third on a lane,
among houses or on the A28's 30–40 mph stretches; second or third on a farm
track) flashes the speed camera once per stretch of road, a white flash and
a little camera in the corner (a "speed camera!" note instead of the flash
under reduced motion); while she is going faster than the road's own gear
would take her the comfort gauge falls (the animals jostled), and on a farm
track a dust cloud trails the van. The van's own hard stops for traffic and
crossing animals still count as rough driving, and at speed they come
sooner. First gear on the dual carriageway gets the traffic queueing behind
and "beep beep!". The A28 is drawn stretch by stretch from
`trunk-carriageways.json`: the dual carriageway as before, the divided road
through Birchington to Westgate as a two-way road with a narrow kerbed island
and two lanes each way (her right-hand lane is an overtaking lane, the
oncoming traffic is across the island; where there is one lane each way she
cannot change lane across the kerb), and the single stretch through The
Square as an ordinary main road with a centre line. Only near the dual
carriageway does the camera pull out and the chip say "dual carriageway";
elsewhere the A28 is a "main road". The single stretch no longer spills over
the house street beside it at Westgate, and where the A28 bends on a point of
that street the A28's lines now stop at its edge. "to A28 town" in the dev
tools jumps to the divided and single stretches in turn.

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

**Small animals cross the small lanes.** Marcus's idea, and the reason the
camera comes in close on them: hedgehogs, rabbits, pheasants and the like
cross in front of the van; she slows or stops, and if she does not, the van
stops itself, as it does for traffic. Never an accident.

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
