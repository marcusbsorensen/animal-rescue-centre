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

**Running.** `batch_6a9c74a6ab58819095862285f88d018d` — the cat species
pilot, 90 sprites, $9.86, submitted 2026-09-05 20:59, expires 20:59 the
following day. Validated and `in_progress` with 90 total and 0 failed, so
the request shape is proven at scale, not just on the two-line probe.
Marcus chose one species before the rest: nine characters across ten poses
each says more than four prototypes can.

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
Fetch the cats and let Marcus judge them.

    python3 tools/batch-restyle.py status batch_6a9c74a6ab58819095862285f88d018d
    python3 tools/batch-restyle.py fetch  batch_6a9c74a6ab58819095862285f88d018d

That writes 90 raw PNGs to `asset-drafts/batch-restyle/`. They still need
matting with `tools/rembg-cut.py` and resizing to 512 before they replace
anything — `restyle-animals-2026-09-05.sh:restyle()` has the three lines.
Build a contact sheet from them (`tools/sheets/s5_animal_matrix.py`) so nine
characters × ten poses can be judged as a set, which is the whole point of
piloting a species rather than four sprites.

The open question the cats answer is the chroma lift. If it reads wrong at
sheet scale, fix it in post rather than in the prompt — a measured
desaturation on the fetched PNGs is deterministic and free, and three rounds
say the prompt will not do it.

Then the remaining 510: `submit` per species, or all at once for $55.90.

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
**Running.** Manus task `JPi3P3qMaoYsZzFGJ2siXb`, batch 1 of 3 (13 files),
repaint only. Batches 2 and 3 are listed below.

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
