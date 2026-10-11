# Fleet canon — how the vehicles are drawn

Decisions that bind every view of every vehicle. If a drawing disagrees with
this file, the drawing is wrong.

Why it exists, in Marcus's words: *"You can bet your boots that autistic kids
will spot that stuff doesn't match when seen from different viewpoints, so
consistency is key."*

## 1. The portrait is the master — except for the camera

For each character ONE picture decides the livery, and it is the side portrait
at `apps/game/public/assets/driving/vehicles/vehicle-<name>.png`. Each
character has exactly one, so it gives a single answer where the top-downs
cannot — Henry's front, rear and side top-downs were once three different
colours.

Liveries, repainted 2026-10-09 (`ad49610`) and measured, not remembered:

| Character | Body and roof | Luma |
|---|---|---|
| Henry | maroon (142, 52, 54) | 79 |
| Bea | slate blue (74, 112, 164) | 107 |
| Spark | leaf green (116, 156, 102) | 138 |
| Trikey | soft lilac (180, 152, 196) | ~165 |
| Big Tilly | coral cab, oak bed, open from above | 192 |

**The exception is the camera.** For that the REAR top-down is the reference —
see section 3.

## 2. Length comes from the portrait too

Decided 2026-10-11, and it reverses part of the "one true scale" pass of
2026-10-08. That pass lengthened the top-downs to real-vehicle proportions,
which fixed the fleet contradicting itself between views and immediately
created the opposite fault: the portraits are chunky children's-book vans, so
realistic top-downs disagreed with them. Marcus, looking at the result: *"I
don't see how the roof could be that long given the proportions on the
portrait."*

Each top-down's length-over-width matches its portrait's length-over-height:

| Character | target L/W | was |
|---|---|---|
| Henry | 2.02 | 2.33–2.40 |
| Bea | 2.23 | 2.45–2.50 |
| Spark | 1.88 | 2.92 |
| Big Tilly | 1.79 | 2.81 |

**Width never changes.** `PtvDriveScene` scales by `img.width`, so holding
width constant keeps on-screen size right and alters only length.

**Shorten the middle, keep the ends.** Never squash. A straight scale at these
factors turns round lamps into ovals and thins the ink line along one axis.
Remove length from the uniform middle where roof, flank slivers, skirt and
waistline run straight, and let the wheels sit closer together — a shorter
wheelbase is what a shorter van has. The same rule applied in reverse when they
were lengthened. `tools/shorten-topdown.py` does it.

## 3. The REAR top-down sets the camera

Decided 2026-10-11. Marcus, on the front views: *"That is not the same vehicle
being seen from the front and the back. The back view is much better,
undistorted, and we don't see much of the front beyond what we imagine we would
see from that angle."*

This confirms by eye what a camera audit found in September and nobody acted
on: `bea-rear` and `big-tilly-rear` were already classed "camera right, leave
alone", while the fronts sat in the "flat plan view" group.

The faults in the fronts all follow from a flat plan view given a taper:

- They **thin towards the back**.
- Bea's front shows a **line near the top reading as the rear hatch** — a face
  that a forward-tilted camera cannot see.
- Spark's front shows what looks like a **black sunroof**, which is actually his
  blacked-out rear window, again seen from an angle that cannot see it.

So: the rear views are correct and are the reference. The fronts of Bea, Spark
and Big Tilly are to be redrawn to that camera. Nothing visible from a
slightly forward-tilted overhead view may show a face that camera cannot reach.

**Built, awaiting approval to install** (2026-10-11): `tools/redraw-fronts.py`.
Each front is scaled row by row to its rear's silhouette along the roof, so the
two have one body width; the mirrors are lifted off and put back unscaled; the
hatch (Bea) and the rear window (Spark) are painted out. Big Tilly's side
windows are on the flank, which this camera cannot see, so they come out too.

## 4. Windows: the animal space is tinted, the cab is clear

Decided 2026-10-11, resolving Spark's rear window being black from above and
clear in his portrait.

**Tinted is canon, and it is canon for a reason the game can tell a child:**
animals travel better behind tinted or frosted glass. It gives them privacy
from faces at the window, keeps the heat down, and keeps a frightened animal
calmer. Real animal-transport vehicles do this.

So the dark rear glass in the top-downs is CORRECT and the portraits are what
must change. The cab windscreen and cab side windows stay clear — the child
needs to see who is driving.

Trikey is unaffected; her basket is open to the air.

**The one treatment** (`tools/tint-glass.py`): smoked charcoal, neutral, fully
opaque. Base RGB (53, 55, 54), the diagonal sheen streaks rising to about
(102, 102, 103). It is Spark's rear window in his top-down, pixel for pixel, so
there is no second colour to keep in step. Clear glass is the pale mottled
blue-grey of the windscreens, RGB (138, 160, 180) to (196, 210, 220).

Only Spark's portrait has rear side glass to tint. Bea and Henry are panel vans
with a cab window and nothing aft of it, and Big Tilly's bed is open, so their
portraits are unchanged. Against this section, and not yet decided:
`vehicle-topdown-henry-rear` has two CLEAR teal rear-door windows, and
`vehicle-topdown-spark-rear` a DARK windscreen slot at its far end.

## 5. Markings that belong to one view only

- **Henry's red paw-heart is on the REAR DOOR only.** Decided 2026-10-06 and it
  is not a fault to be corrected away. His master is a side view, so it can
  never contradict a rear-door marking, and the paw is the app icon's own mark.
  It must not appear on any roof.
- **Door badges and flank lettering are side-only.** They belong on elevations,
  never pasted onto a roof.
- **Roof motifs echo the flank.** Added 2026-10-11 because the long plain roofs
  read as bland from above, which is the view a child spends most time looking
  at. The motif is extracted from the master portrait's own artwork rather than
  redrawn, so the roof carries literally the same marks as the flank.

## 6. Open

- **Big Tilly's front cab could not be shortened by cutting** — it is windscreen,
  mirrors, side windows, pillars and tyres with no plain section to remove, and
  every trial cut tore a side window. Built, awaiting approval to install:
  the side windows come out (flank, section 3), then the roof and bonnet are
  cut. The front is 738x1849, L/W 2.505, against the rear's 2.516, so the two
  agree. 1.79 is not reached and cannot be: it leaves 161 rows below the bed,
  less than her windscreen, and buys a bed of about 1:1, a 2x2 load.
- **Trikey's two top-downs** are still cobalt clay with a terracotta cargo box
  against a lilac portrait, and are a redraw rather than a recolour.
- **Thirty-one traffic sprites are still claymation** — both ambulances, the
  bus, the tractors, the skiptrucks and the rest. Repaints exist locally but
  uninstalled and unchecked.
