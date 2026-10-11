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
reference. The route it draws is the one the GPS already computes.

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

## Still open

- Scenery. The spike draws roads on grass and nothing else, so there is no
  sense of speed beyond the lane markings. Top-down canopies, roofs, hedges.
- The dual carriageway at 20m fills the screen at this zoom. Either narrow it
  or pull the camera back on the bigger roads.
- Traffic, which overtaking needs to be about anything.
- Where the gear, handbrake and lane controls live now that they may not sit
  on the carriageway.
- The advanced tier: the child reads the GPS and chooses at junctions.
