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

**Done, awaiting Marcus's word.** The restyle prompt is at round 2. Key line
is fixed and measured: white cat 0.035 → 0.084, ginger cat 0.020 → 0.101
against the target's 0.050. Modelling improved everywhere except the ginger
cat (0.112 → 0.126 vs target 0.201) — see Next step.

**Not started.** The 600-sprite restyle has not been submitted. Nothing is
committed; `git status` is dirty with the 86 new sprites and the new tools.

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
Add a volume clause to `STYLE` in `tools/batch-restyle.py` for the
smooth-coated animals, whose flat sources give the model nothing to model:
*"the ribcage and haunch are distinct rounded masses with shadow between
them; stripes and patches wrap around the form rather than lying flat on
it."* Apply to `cat-ginger`, `cat-black`, `cat-grey`, `cat-siamese`,
`cat-tuxedo`, `cat-tortie`, `cat-calico`, `dog-dalmatian`, `dog-beagle`,
`dog-pug`, `dog-chocolate`, `dog-terrier` — the long-haired ones
(`cat-white`, `dog-golden`, `dog-collie`, `dog-husky`, `bunny-angora`) already
model well. Re-roll `cat-ginger-eating` to confirm, then
`python3 tools/batch-restyle.py submit` ($65.75, up to 24h).

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
- **`scared`/`grumpy`/`growling` are never rendered.** `ConflictView.ts:86`
  maps all four conflict types to `sheltered`/`sleeping`/`eating`, so the
  "bickering about toys" screen draws both animals content. Proposed mapping
  is in the spec doc; six lines, not yet applied.
