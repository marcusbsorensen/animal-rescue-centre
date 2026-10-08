# Animal sprite set — handover 2026-09-05

Replaces the 2026-09-04 UI/map handover, which is committed and pushed.
Its open queue is still open and lives in `docs/ui-next-steps-2026-09-02.md`
(items 8, 9, 10).

## Goal
Every animal drawn in every pose, and the whole set in one visual register —
the one `snake-python-sheltered.png` is in. Marcus chose that target and chose
all 600 sprites in one pass.

## State
**Done and verified.** 600/600 sprites present, 0 missing, 0 unhealthy
(`python3 tools/verify-animal-set.py`). The 86 gaps are filled: 60 hedgehog
variants (its 6 declared morphs had zero art and every hedgehog rendered the
same), 9 raccoon, 9 skunk, 8 base `playing`. Four pre-existing matte failures
fixed by re-matting alone — `cat-black-arriving`, `cat-siamese-growling`,
`fox-fennec-sleeping`, `fox-marble-sick` had painted backgrounds, two of them
a transparency checkerboard drawn as pixels.

**Committed and pushed.** All of the above, plus the tools, is on `main` at
`5fee345`. The working tree is clean.

**Cat pilot done, awaiting Marcus's word.** `batch_6a9c74a6ab58819095862285f88d018d`
returned 90/90 with 0 failures in 25 minutes, not the 24-hour window. Fetched
and staged at 512 in `asset-drafts/batch-restyle/staged-512/`; NOT installed.
Measured across all 90: ink 0.764 → 0.913 against a target of 0.923, and its
spread HALVED, 0.170 → 0.099 — the set is consistently inked, not just better
inked. Zero painted backdrops, zero halos. Poses and markings held; the box
is gone from `arriving` and the bowl from `eating`.

**The chroma worry is retired.** Across 90 sprites saturation went 0.357 →
0.383 against the target's 0.360. The ginger cat that cost three prompt
rounds was one sprite behaving oddly, not the set drifting. No desaturation
pass is needed.

**Still open on the cats:** `cat-white` is the laggard at ink 0.677 against
the set's 0.913 — nearly double its own 0.384 before, so the KEY LINE clause
works on pale animals but does not finish the job. All ten weakest sprites in
the batch are cat-white. Worth knowing before the other pale long-haired
characters go through.

**Settled after five rounds.** The prompt is round 2 plus the volume clause
and nothing else. Three attempts to improve it failed and are reverted, each
recorded in `batch-restyle.py` at the clause it touched:
- the volume clause itself does nothing measurable (ginger modelling
  0.126 → 0.122 against a target of 0.201). Kept because it is free.
- a pigment-named PALETTE cost the key line — "shadow is never the same hue
  darker" reads as "do not go dark", ink 0.961 → 0.681 — and moved no
  saturation at all.
- a geometric eating pose ("hips level with the shoulders") brought the head
  up with the back, so the cat stood instead of eating.

**Corrected.** Saturation is not a target to chase. 0.360 is the reference
snake's brownness, not a property of the style, and `audit-animal-style.py`
excludes `sat_mean` from its distance for that reason. What is true is that
the restyle lifts chroma about 0.12 on every prototype — a question for
Marcus's eye on the fetched cats, not a number to hit.

**Unverified.** Whether failed batch requests bill. Assumed not; not checked
against the invoice.

## Files
- `docs/sprite-pose-spec-2026-09-05.md` — the pose contract. Read first.
- `tools/batch-restyle.py` — submit/status/fetch. Holds `STYLE`, `STRIP`,
  `POSE_RESTATE`. The place to edit the prompt.
- `tools/audit-animal-style.py` — the style measurement. `--ref-file` picks
  the target.
- `tools/verify-animal-set.py` — completeness + health.
- `tools/sheets/s5_animal_matrix.py`, `s6_style_audit.py` — the two sheets.
- `tools/regen-animal-gaps-2026-09-05.sh` — how the 86 were made.
- `tools/rembg-cut.py` — the venv has rembg but not its `[cli]` extra.
- `tools/install-restyled.py` — drafts → installed sprites. Crops, squares
  with a 6% margin, 512, 256-colour palette, backs up the original first.
  No matting: gpt-image-2 already returns clean alpha, measured over 90.

## Decisions made
- **Target is `snake-python-sheltered.png`**, not the base snake, whose ten
  poses are three different styles (internal spread 2.21σ).
- **Mammals keep an expressive eye.** Line, texture, shading, palette move;
  faces do not.
- **The sprite draws the animal; the game draws what the player chose.** No
  collar on `walking` (vector, `WalkScene.ts:585`), no bowl on `eating`
  (painted into `bg-kitchen.png`), no toy on `playing`. Also mechanical:
  `sprites.ts:131` contain-fits, so a baked prop shrinks the animal.
- **Arrival props become separate composited objects**, chosen to match the
  rolled `ARRIVAL_STORIES` entry. Not started.
- **OpenAI, not Manus** (`manus-sprite-rules.md` Rule 6), and **gpt-image-2 at
  high** — gpt-image-1.5 actively flattens the art.
- **Batch API**, $0.1096/image vs $0.2192. 600 serial would be ~20 hours.

## Next step
Marcus has seen the 9×10 sheet and has not yet said install-or-not. When he
does:

    python3 tools/install-restyled.py --dry-run
    python3 tools/install-restyled.py            # backs up first
    python3 tools/verify-animal-set.py

Then the remaining 510: `submit --species <name>` per species, or all at
once for $55.90. The cat batch took 25 minutes, so the 24h completion window
is a ceiling rather than an estimate.

## Traps
- **`images: [{"image_url": ...}]`** is the Batch shape for `/v1/images/edits`.
  The documented `input_reference` fails with "Missing required parameter:
  'images'". Established by probe `batch_6a9c19bb…`; a bare URL string, a
  `type` key and singular `image` all fail differently.
- **A style reference image is drawn as content.** Passing the python as a
  second reference produced a snake and a cat nose to nose. Style must be
  words only.
- **Removing an object takes the pose with it.** Deleting the bowl gave a
  rear-up pounce (confusable with `playing`); demanding rear-down brought
  back scattered kibble. Took three iterations — the fix is in `POSE_RESTATE`
  with the reasoning, do not re-derive it.
- **`tools/analyze-set-consistency.sh` used to require the bowl** (line 78).
  Corrected, along with `arriving`, `walking`, and a `playing` rule it never
  had. It is the grader; a stale rule there marks correct sprites wrong.
- **Always pilot before a batch.** Every round caught something real: the
  first restyle pilot showed gpt-image-1.5 degrading the set, the two-image
  batch caught the wrong parameter name.
- **Check the deployment before submitting.** The batch reads its sources
  from `animal-rescue-centre.vercel.app` by URL, so a sprite committed but
  not yet deployed is a request spent restyling the old art, or a 404. The
  check is a HEAD over every `image_url` in `requests.jsonl` plus a shasum
  against the local file; all 90 cats were verified current before submit.
- **A stated prohibition moves the model less than a stated property, but a
  stated property moves more than intended.** KEY LINE worked because
  "BLACK, on every animal" is checkable. The same trick applied to the
  palette and to the eating pose over-corrected into a different fault each
  time. Three rounds of evidence: state the property, then measure whether
  it took something else with it.
- **`scared`/`grumpy`/`growling` are never rendered.** `ConflictView.ts:86`
  maps all four conflict types to `sheltered`/`sleeping`/`eating`, so the
  "bickering about toys" screen draws both animals content. Proposed mapping
  is in the spec doc; six lines, not yet applied.

---

# Top-down vehicles — clay to line-and-wash (opened 2026-09-06)

## Goal
The 42 sprites in `assets/driving/topdown/` plus three decor pieces
(`decor-bollard`, `decor-cone`, `decor-speed-camera`) are 3D/claymation
renders and the only art in the game that is not drawn. Everything else in
the driving set — the five side-view vehicle portraits, the five mirrors,
the dashboard, every `site-*` building, seven of the ten decor pieces — is
already line-and-wash. 45 files to convert.

## State
**Manus task `JPi3P3qMaoYsZzFGJ2siXb`** carries all of it. One thread, four
messages: pilot 6, a camera round (reverted), batch 1, batch 2 + batch 3.

- **Batch 1 — 13 files, in hand** at `manus-output/vehicles-batch1/`.
  detail 0.210 -> 0.310 against drawn anchors at 0.308; silhouette IoU
  0.926-0.985 against source, orientation correct on all 13, alpha clean.
  Twelve good. `car-blue` came back grey (sat 0.807 -> 0.298 where nothing
  else moved more than a fifth) and was re-rolled in batch 2.
- **Batches 2 and 3 — RETRIEVED 2026-10-06.** The re-attach worked: the new
  signed links carry a policy valid to 2026-10-31. All 42 repainted sprites
  are at `manus-output/vehicles-all/`, taking the LAST url per filename
  (later messages supersede earlier ones — car-blue was re-rolled).
  `scratchpad/fetch-manus.py` does it; three dropped on http 000, a
  connection drop rather than a 403, and came down on a retry.
  The links expire, so re-download from a fresh `manus_list_output_messages`
  rather than reusing a saved url.
- **TRAP: "last attachment wins" is wrong for a REJECTED round.** It is right
  for a re-roll (car-blue) and for a re-attach, but the camera round sits
  between the pilot and the batches, and for the five pilot files its output
  is the LAST attachment. Taking it silently installs the artwork that was
  reverted — Bea as a featureless slab, Henry's tyres as blobs. Skip any
  attachment whose workspace path contains `animal_rescue_sprite_camera_fix`;
  the good version of `bea`, `car-red`, `henry`, `henry-rear` and `tractor` is
  `animal_rescue_sprite_pilot`. `scratchpad/fix-reverted.py` does this.

**Decided 2026-10-06, and both depart from the repaint brief:**
- The ambulance, blue car and yellow car **do not match front to rear in the
  SOURCE art** — different bodies, roofs and windows, not a repaint fault.
  "Copy the geometry exactly" preserved the mismatch faithfully. Marcus chose
  to fix them: keep the repainted front, redraw each rear to be the same
  vehicle.
- The **bus is a design fault, not a paint fault**: seats run wall to wall
  with no aisle for seven rows, ~35 passengers, all drawn facing the viewer
  when from overhead you would see heads and shoulders, and facing backwards
  relative to the nose. Marcus chose an open-top bus with a central gangway,
  two seats a side, about five rows, passengers seen from above facing
  forward.

**Decided 2026-10-06 — THE PORTRAIT IS THE MASTER.** Marcus: "You can bet your
boots that autistic kids will spot that stuff doesn't match when seen from
different viewpoints so Consistency is Key." An audit of every view found the
problem is far wider than the three pairs above: all five fleet characters
disagree with themselves across viewpoints, on livery and in places on what
the vehicle is.

For each character ONE picture is the master and every other view is brought
to it. The master is the portrait (`driving/vehicles/vehicle-<name>.png`),
chosen because each character has exactly one, so it gives a single answer —
the top-downs cannot do that job, as Henry's front, rear and side top-downs
are three different colours.

The liveries, read off the drawings rather than remembered:

| Character | Master livery, read off the drawing | Master's view | Views to bring to it |
|---|---|---|---|
| Henry | cream body AND CREAM ROOF; oak wood-grain flank panel painted with pink and sage flowers; maroon lower skirt; cream oval badge lettered "A.R.C." in maroon serif on the door; chrome grille, round headlamps, chrome hubcaps; 1960s small-van shape | side, facing left | 5 files |
| Bea | ivory upper AND CREAM ROOF; chocolate-brown lower half, a deep band from the waistline down; gold pinstripe scrollwork with dusky-pink roses on the cream flank; "Bea" in small script on the door; chrome grille, brass hubcaps; 1970s van shape | side, facing left | 2 top-downs |
| Big Tilly | bright red cab and chassis, RED CAB ROOF; natural oak slatted flatbed, OPEN from above, with stake sides; red drop-side panel lettered "Big Tilly ♥" in cream script; chrome grille; cream hubs with red centres; knobbly tyres; curtains and a potted plant in the cab | three-quarter, facing right | 2 top-downs |
| Spark | white modern van, WHITE ROOF; green LIGHTNING-BOLT flash along the lower flank; "Spark" in green on the upper flank; black wheels | side, facing left | 2 top-downs |
| Trikey | pale blue frame, wicker basket, brown saddle, cream tyres, "GO!" flag on a pole | side, facing right | 2 top-downs + her own portrait |

**The roofs are the thing a side view hides, and they decide the top-downs.**
Read off the roof edges: Henry CREAM, Bea CREAM, Spark WHITE, Big Tilly RED
cab with an OPEN wooden bed behind it. Three of the four are therefore pale
from above, which means the existing pale top-downs were broadly right and
the fault is narrower than a first colour audit suggested — that audit was
measuring backgrounds, wicker and passengers, not bodywork.

What is actually wrong, per character: Henry is missing the oak flank panel
and maroon skirt at the edges, and carries a red paw badge the master does
not have; Bea has no brown anywhere, and her front and rear disagree with
each other as well; Spark's accent is BLUE where the master is GREEN; and Big
Tilly is a solid red slab where from above you should be looking down into an
open wooden load bed. Tilly is the largest piece of work.

**The red paw-heart on Henry's rear STAYS.** Decided by Marcus 2026-10-06.
It is not a fault and must not be "corrected" away. His master portrait is a
SIDE view, so it never shows his back and therefore cannot contradict a
rear-door marking. The flanks take the master's A.R.C. oval and painted
flowers; the rear door keeps the paw, which is also the app icon's own mark.

**Henry's five files are not five top-downs.** `henry` and `henry-rear` are
genuine overhead views. `henry-side-left` and `henry-side-right` are SIDE
ELEVATIONS (mirror images of each other) in cream with blue windows, orange
wheels and a red paw-heart panel — the same viewpoint as his master portrait,
so for those two the job is close to transcribing the master. `henry-side` is
a side elevation too, but of a DIFFERENT VAN: modern, sliding side door,
wrong proportions, painted salmon. That one needs a redraw, not a recolour,
and should be briefed separately from the recolours.

A brief must still name each roof explicitly rather than let the renderer
infer it from a side view, and must say which markings are SIDE-ONLY — door
badges and flank lettering belong on the elevations, not pasted onto a roof.

Two further traps in the masters. Big Tilly's portrait is drawn on a visible
paper panel the other four do not have, which a renderer will copy if it is
not told to drop it. And Trikey's portrait measures as tan and cream because
the wicker basket and the cat sitting in it dominate the pixel count — her
FRAME is pale blue. Measure the vehicle, not the image.

**13 top-downs, plus Trikey's portrait.** The mirrors
(`driving/mirrors/mirror-*.png`) and `dashboard-henry-ptv.png` LOOK like
missing views and are not: the mirrors are rear-view mirror FRAMES with empty
glass — cockpit furniture, not pictures of the vehicle — and the dashboard is
Henry's cab interior. None of them carries livery, so none is in scope. They
are already in character, each in its own way: Henry's brass oval, Bea's
ornate dark circle with scrollwork matching her gold trim, Big Tilly's
industrial steel rectangle, Spark's plain modern one, Trikey's brass circle
with blue glass. Checked 2026-10-06; leave them alone.

**Trikey is the one exception on substance.** Her portrait is a two-wheeled
bicycle with a basket; both top-downs are a three-wheeled trike with a cargo
box, and she is called Trikey. So her portrait is corrected to a trike FIRST,
keeping its pale blue, and the corrected portrait then becomes her master.

**Consequence for the repaint: for the five fleet characters the repaint and
the livery fix are one job, not two.** Repainting a top-down into the right
style but the wrong livery is work thrown away. The repainted sprite is not
wasted though — it supplies the correct style and camera, and the livery pass
then reads "recolour this sprite to match this reference", which is a far
safer brief than a redraw. It was the from-scratch redraws that returned Bea
as a featureless slab.

Three jobs now queue for Manus, and they go as separate passes rather than
piled onto one message:
1. Trikey's portrait corrected to a trike (gates her other three views).
2. The livery pass, per character, against the master portrait.
3. The bus redesign.

**Six done and installed**, uncommitted, backed up in
`asset-drafts/pre-skew-backup/`: henry, henry-rear, bea, car-red, cone
(painted by Manus, then skewed) and tractor (reverted to its original,
pending a redraw). Raw Manus output is in `manus-output/vehicles-pilot/`
(round 1, the good painting) and `manus-output/vehicles-pilot-v2/` (round 2,
good camera, damaged painting — kept as the evidence, do not install).

## Decisions made
- **Manus, not OpenAI**, chosen by Marcus after `manus-sprite-rules.md`
  Rule 6 was put to him. Rule 6's failure mode did NOT occur on the repaint:
  Manus loaded all ten reference URLs and the silhouette IoU against source
  was 0.94–0.97, so it redrew rather than re-composed.
- **The painting comes from Manus; the camera comes from code.** Asking
  Manus for both in one turn is what returned Bea as a featureless slab.
  Two passes: repaint all 45 first (proven), geometry second (risky, and a
  failure then costs one file rather than the set). Marcus chose this
  sequencing on 2026-09-06.
- **`tools/skew-topdown.py` at taper 0.88**, per-file. Marcus: every vehicle
  needs the same inward skew from bottom to top, as seen from an elevated
  bird's-eye camera. `henry-rear` is the exemplar he named.
- **Marcus wants the end band too**, not only the skew — so the flat
  plan-view group needs a shallow visible end face, which a warp cannot draw.

## The three groups
- **Camera right, leave alone** (`ALREADY_CORRECT` in the tool): henry-rear,
  bea-rear, big-tilly, big-tilly-rear, pickup.
- **Flat plan view, no skew and no end face** — takes the 0.88 warp, and
  still needs a redraw for the band: henry, spark, spark-rear, motorbike,
  bus, binlorry, truck, the six skiptrucks.
- **Too steep, reads as taking off** (`TOO_STEEP`, skipped by the tool):
  all six tractor variants, fireengine, fireengine-rear.

## Next step
1. Poll `manus_get_task JPi3P3qMaoYsZzFGJ2siXb`, download to
   `manus-output/vehicles-batch1/`, check each against its source.
2. Send batches 2 and 3 in the SAME thread — the file lists are regenerated
   by the snippet in the session log, or just diff `topdown/` against
   what is already repainted.
3. `python3 tools/skew-topdown.py --in <batch> --out <staged>` then install.
4. Only then the geometry pass, on the 21 in the two problem groups.

## Traps
- **The in-app browser cannot run Phaser** — WebGL fails with "Framebuffer
  status: Incomplete Attachment", so the preview pane shows a blank canvas.
- **Playwright's bundled browsers are not installed on this machine.**
  `chromium-1217` is a 448KB stub and launching it aborts with SIGABRT;
  `npx playwright install` downloaded 165MB twice and extracted nothing.
  The way through is `chromium.launch({ channel: 'chrome' })`, which uses
  the real Chrome and works. `pnpm test:visual` will not run until the
  install is fixed.
- **Two concurrent `playwright install` runs deadlock** on `__dirlock` and
  neither progresses. Kill one.
- **The travel phase draws the `-rear` sprite** (`PtvDriveScene.ts:511`),
  the picker and forecourt draw the front. A change to a front-view sprite
  is invisible on the road — this is how a uniform taper got applied to
  `henry-rear` unnoticed until the road capture.
- **To photograph a scene**, start it and STOP every other active scene —
  otherwise MainMenuScene's login gate renders on top. `beginTravel(1)` on
  the scene instance jumps past the vehicle picker onto the road.
- **`VEHICLE_PARK_ANGLE` (`PtvDriveScene.ts:1105`)** assumes Henry, Trikey
  and Big Tilly are drawn nose-down and Bea and Spark nose-up. A flipped
  sprite parks backwards in the forecourt.
- **`PtvDriveScene` scales by `img.width`**, so a changed footprint changes
  on-screen size. `VEHICLE_SIZE` may want a look once the set is in.

## Crates — opened 2026-10-07
Marcus: the crate-stacking puzzle should be in the game so children learn to
position animals next to one another in the right order, and it also settles
vehicle design, since the crates have to fit.

**The engine was already built and already tested, and had zero callers.**
`packages/game-logic/src/crate-stacking.ts`, 274 lines, 32 test cases,
exported from the package index, called by nothing under `apps/game/src`. The
drive carries one animal; `PtvDriveScene.ts:204` says it "does not look
inside". So the work was never design, it was wiring.

Capacity was already decided, at `crate-stacking.ts:145`:
Trikey 2 (1x2) L0 - Henry 4 (2x2) L2 - Bea 6 (3x2) L5 -
Big Tilly 9 (3x3) L10 - Spark 6 (3x2) L12.
Spark's distinction is fuel cost 5 against Bea's 10, not capacity, which is
why two vehicles share 6 slots at different unlock levels.

**This is what held the vehicle livery pass.** Big Tilly's open bed has to
read as a 3x3 of nine crates, so its plan proportions had to go into the brief
before it was sent. The other four are closed-roof vans whose crates are never
visible from above, so their liveries were unaffected. `VEHICLE_SIZE` has
Tilly at 1.3x Henry while carrying 2.25x his load; 3x3 against 2x2 wants about
1.5x in each dimension. Trike 0.55 for a 1x2 against Henry's 1.0 for a 2x2 is
consistent, and Spark 1.18 against Bea 1.12 is a 5 percent difference, not a
contradiction - I overstated that at first.

**No crate art exists.** Not one sprite for any of the six types. The six are
standard, secure, quiet, ventilated-basket, warm-vivarium, perch-carrier.
`CrateDef` carries an `emoji` field, which is the placeholder until art lands.

Decided for the art, and both follow from the code rather than taste:
- **Crates are drawn EMPTY.** The animal is composited on top at run time.
  Drawing the occupant in would be 6 types x 9 species = 54 images for 6.
- **Seen from DIRECTLY ABOVE**, open-topped, with a clear uncluttered middle
  for the animal to sit in. That is the grid's own viewpoint and it matches
  looking down into Tilly's bed.

In flight at the time of writing:
- Manus `JPi3P3qMaoYsZzFGJ2siXb` - the 10-file livery pass.
- Manus `fC4SeHdgYgHYTMpGDFKyif` - crate art PILOT OF 2, the plainest crate
  and the hardest one (standard and warm-vivarium), to prove the style across
  both before committing to the other four.
- Branch `claude/crate-loading` - loading screen wiring plus the VEHICLE_SIZE
  fix, and a separate pass reconciling the stale docs against the code.

Docs disagreed with the code: `docs/crate-loading-2026-07-10.md:3` said "not
yet built" and `docs/extracted-driving-spec.md` said the PTV spec was missing,
both wrong.

