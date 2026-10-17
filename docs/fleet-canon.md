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
| Big Tilly | 1.79 | 2.81 (installed 2.505: see section 6) |

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

**Installed 2026-10-11** (`tools/redraw-fronts.py`; Marcus approved them from
the comparison sheet). Each front is scaled row by row to its rear's silhouette
along the roof, so the two have one body width; the mirrors are lifted off and
put back unscaled; the hatch (Bea) and the rear window (Spark) are painted out.
Big Tilly's side windows are on the flank, which this camera cannot see, so they
come out too. Canvas widths are unchanged (Big Tilly's height went from 2071 to
1849), and the three beds in `fleet-art.ts` were re-measured with them: Big
Tilly's rows are untouched, and Bea's and Spark's are widened to the fleet's
0.855 of the body now that their fronts no longer taper.

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
portraits are unchanged.

**Every view now follows it** (2026-10-11). Spark's portrait is tinted
(`tint-glass.py`); his front's windscreen is clear (`redraw-fronts.py`); and the
two rears that disagreed were finished by `tools/glass-rears.py`:
`vehicle-topdown-henry-rear`'s two rear-door windows are the one tint (a cut of
Spark's own rear window, one from each half of it) and
`vehicle-topdown-spark-rear`'s windscreen slot at its far end is clear glass,
mapped by the function that cleared his front's. Nothing else in either file
moved: the silhouette is byte-identical, Henry's paw-heart is the pixels it
was, and Spark's rear window is untouched.

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
  **Installed 2026-10-11** with `tools/decorate-roof.py`, run on the six files as
  they stand after the fronts and the glass were finished (`36262bb`, `50d138e`),
  because its placement is a share of the roof it finds and the roofs had grown.
  Marcus chose one option per character from twelve candidates:

  | Character | Option | On the roof | Front / rear |
  |---|---|---|---|
  | Henry | **A, garland** | pink flower, leaves, sage flower, leaves, pink flower down the centre line, pink nearest the nose | roof 692 / 764 rows; 3 flowers and 2 leaf sprigs at both ends |
  | Bea | **B, scrollwork twice** | the cargo-panel scroll, then its mirror image, roses outward and flourishes toward the centre, symmetrical about the roof's centre line | roof 739 / 900 rows; one pair at both ends (665 x 123 px each scroll / 810 x 132) |
  | Spark | **A, one flash** | the flank's cream flash down the roof, tip at the nose | roof 652 / 442 rows; one flash at both ends, the same size on both: a 380 x 136 px box, 377 px along and 142 / 137 across |
  | Big Tilly | none | her bed is open and busy from above | |
  | Trikey | none | she has no roof | |

  Henry wears the garland and not option B, the oak inlay. The garland is the
  flank's own pink and sage flowers and leaves lifted off the panel. The inlay is
  a piece of the oak panel, bookmatched about its open end so it has a border on
  every side, and that mirror is the one thing in it that is not on the flank. A
  future session should not swap it in. Bea's scrollwork is the faintest of the
  three at 46px, and Marcus accepted that: *"delicate is her character"*. Her
  whole livery is fine gold scrollwork and roses, so thickening it would make her
  a different vehicle. Do not make it bolder.

  Front and rear carry one treatment: the rear sprite is the front's roof turned
  half way round, so the bolt's tip and Henry's nearest pink flower are at the
  nose in both, and Bea's pair is symmetrical in both. Henry's garland and Bea's
  scrollwork keep the two views in step by their repeat count and their direction
  (the same count at each end), and their size follows their roof: Henry's
  flowers are 1.08x larger on the rear and Bea's scrolls 1.22x longer. That is
  correct and is not to be matched.

  **Spark's flash is one size in both views (fixed 2026-10-11).** A single flash
  has no repeat count to keep the views in step, so its size is all there is to
  disagree, and it did: every size is a share of the roof's own length, and
  Spark's front has its rear window painted out (section 3) so its roof runs on to
  the tail, 652 rows, where his rear's stops at the glass, 442. The rear's flash
  was 0.68 of the front's in length and thickness (at 46 px wide, a flash 14 px
  thick against one 10 px thick). The front has come down to the rear,
  which is the camera reference (section 3) and whose bolt cannot be enlarged
  without pushing it into the glass its roof stops at. `decorate-roof.py` now
  sizes a one-motif design (`SIZED_ONCE`: Spark A and B, Bea A) on both roofs,
  takes the smaller in each direction, and sets the bolt the same distance from the
  nose end of its roof, so the rule holds for whichever file is run first and
  the rear file did not change at all. Measured from the pixels:

  | | Before | After |
  |---|---|---|
  | Front | 195 x 557 px (561 x 201 box) | 142 x 377 px (380 x 136 box) |
  | Rear | 137 x 377 px (380 x 136 box) | unchanged, byte-identical |
  | Front / rear along the roof | 1.48 | 1.00 |
  | Front / rear across | 1.42 | 1.04 (the roof's own taper) |
  | At 46 px wide, across x along | front 14.0 x 40.0, rear 9.8 x 27.1 | front 10.2 x 27.1, rear 9.8 x 27.1 |

  The tip is 31 px from the nose end of the roof in both views. The flash is now
  smaller than his long front roof would carry, and bare paint runs on behind
  it: that is what one bolt that does not change size costs. On the front, a
  flash larger than the rear's 380 x 136 px box is the fault again.

  The six files are 256-colour palette PNGs: the tool merges near-duplicate roof
  shades to make room for the motif's colours, so alpha is byte-identical, the
  canvas is unchanged and the colour outside the motif moves by at most 32 of 255,
  on 11 to 1,236 pixels per file (Henry's front is the 1,236; 55 of them in
  Henry's rear-door glass, at most 17). Henry's rear-door paw-heart is the pixels it was, and no paw-coloured
  pixel appears on any roof. **Re-run the tool, never install these through
  `install-vehicles.py`**: its 0.88 taper would skew them a second time. If a
  roof is redrawn again the motifs must be re-placed, and the tool does it from
  the file it is given, which must be the sprite before any motif (the installed
  files carry one now, and the tool refuses them: its recipe says where the
  motif-free ones are, `git show 011f02a^:<path>`):
  `python3 tools/decorate-roof.py <motif-free file> --design <A|B> --out <path> --check`
  with henry A, bea B, spark A. Spark's two files are run from one folder, because
  each reads the other for the size they share (`--pair`).

## 6. Open

- **Big Tilly's front cab could not be shortened by cutting** — it is windscreen,
  mirrors, side windows, pillars and tyres with no plain section to remove, and
  every trial cut tore a side window. Installed 2026-10-11: the side windows
  come out (flank, section 3), then the roof and bonnet are cut. The front is
  738x1849, L/W 2.505, against the rear's 2.516, so the two agree. 1.79 is not
  reached and cannot be: it leaves 161 rows below the bed, less than her
  windscreen, and buys a bed of about 1:1, a 2x2 load.
- **Trikey's two top-downs** are still cobalt clay with a terracotta cargo box
  against a lilac portrait, and are a redraw rather than a recolour.
- **Thirty-one traffic sprites are still claymation** — both ambulances, the
  bus, the tractors, the skiptrucks and the rest. Repaints exist locally but
  uninstalled and unchecked.
