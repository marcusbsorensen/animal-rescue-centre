# Driving vehicles — art restyle

_2026-07-09. Marcus: the top-down vehicles are "too illustrator-style" and don't
match the rest of the game scenes (inside/around the white Art Deco ARC building)._

## Diagnosis

- The game world (ARC exterior, cast, animals, scene backgrounds) is **painterly
  storybook — Aardman / Raymond Briggs**: soft rounded forms, gentle brush
  outlines, hand-painted texture, warm saturated palette. Made via
  `tools/gpt-image-regen.sh` (OpenAI gpt-image-1.5, reference-locked).
- The current top-down vehicles (`vehicle-topdown-*.png`) were ComfyUI Flux —
  cleaner, flatter, vector/illustrator feel. That's the clash.

**Direction:** regenerate the vehicles through the same OpenAI painterly pipeline
that built the world (also honours the "OpenAI only for continuity-critical
sprites" rule). NOT ComfyUI.

## This round — style exploration (needs Marcus's pick)

Generate **2 distinct candidate sets**, each = {car, truck, tractor}, top-down
(nose up), on a keyable/transparent background, matching the painterly world.
Two directions so Marcus can choose, e.g.:

- **Set A** — closest to the cast/animal brushwork: soft hand-painted, warm,
  storybook.
- **Set B** — a chunkier Aardman claymation take: bolder rounded forms, stronger
  hand-modelled feel.

Deliverable: a side-by-side contact sheet (both sets, ideally over the actual
road) for Marcus to confirm the direction. **Do not overwrite the live vehicle
assets** until he picks. Must read well small (drawn ~72px wide in-game): clear
silhouettes over fine detail.

## DECISION (2026-07-09): Set B — Aardman claymation, UNBRANDED

Marcus picked **Set B** (chunky hand-modelled plasticine look). **No baked-in
branding** this round — strip the ARC lettering / heart / paw that Set B added
unprompted; ARC paw-print livery is a **separate later pass**, applied only to
Henry and ARC's own vehicles, never to generic traffic.

Production look locked to Set B's claymation aesthetic, plain painted bodywork.
Henry (the player van) will need a matching claymation restyle later **with** its
heart-paw badge — flag so it doesn't become the odd one out once traffic changes.

## Backlog — being produced in the locked style now

- **Open-top double-decker bus** (spring/summer only): a famous Thanet-coast
  feature. Half-open top deck. Its route **starts and ends next to The Dip in
  Birchie**. Wire as a seasonal special on coastal/main roads.
- **Bin trucks** (refuse lorries) on some **side roads**. First pass read as a
  plain truck; regenerating with wheelie bins on the rear lifter + hopper +
  hazard chevrons so it's unmistakable from above.
- **Skip flatbed truck** — a flatbed truck with an EMPTY bed, plus a set of
  separate **overflowing skip** sprites (weird/funny varied contents) that the
  game drops onto the bed and swaps skip-to-skip. Composable: flatbed sprite +
  interchangeable skip overlay at a fixed bed anchor. Skips should be
  kid-friendly funny (old sofa + springs, rubber-duck mountain, garden gnomes &
  a flamingo, bathtub sticking out, teddies + traffic cone, wonky Christmas
  tree, etc.).

All produced in the confirmed Set B claymation style, unbranded.

## Status of the confirmed set (2026-07-09)

Approved: car, truck, tractor, open-top double-decker bus, bin lorry (v3, now
obviously a refuse truck), skip flatbed + 5 skips.

**Decisions (2026-07-09):**
1. **Skips — standardise container AND replace all contents.** All five sit in
   the same proper industrial metal skip; only the contents vary. CONTENTS MUST
   BE INANIMATE, NON-PERSONIFIED junk — Lily cares for objects, so no toys,
   teddies, ducks, robots, gnomes, or anything with a face/personhood (it reads
   as cherished things being dumped and distresses her). Use building/garden/
   renovation debris; humour from absurd overflow (bathtub/ladder sticking out).
   All five original skips (which had ducks/robot/teddies/gnome) are being redone.
2. **Full rollout — GO.** Wire the whole claymation fleet in, with car colour
   variants, Henry restyle (keeping his heart-paw), the skip-swap overlay, the
   seasonal open-top bus (spring/summer, Thanet coast, route starts/ends by The
   Dip), and bin lorries + skip truck on side roads.

**Halo / ground-shadow fix (2026-07-09):** the painterly sprites carried a wide
band of low-alpha, cream-tinted edge pixels (a soft render-background halo /
baked ground shadow). Invisible on beige gravel, but an ugly beige box on grey
tarmac and sand. Fixed by hardening the alpha edge (drop low-alpha halo, keep the
solid body) via new tool `tools/harden-sprite-alpha.py` (lo 130 / hi 210),
applied to every `final/*-keyed.png` and re-cropped. Verified clean on tarmac,
gravel and sand. Sprites are now clean cutouts with NO ground shadow — add a
soft shadow **in-engine** (a consistent dark ellipse under each vehicle) during
wiring so it's correct on every surface, rather than baking it into the art.

**Wiring refinements (Marcus, 2026-07-09):**
- **Skip fills the whole flatbed** — the skip overlay is scaled to cover the
  entire bed, not a small centred lump. And **sometimes the flatbed runs empty**
  (a chance of no skip).
- **Proportionate vehicle sizes** — a strict hierarchy: motorbike (smallest) <
  car < van (Henry / pickup / ambulance) < truck / bus / tractor-with-trailer /
  bin lorry / skip truck. **Buses are the longest.** Set via per-kind size
  factors; long vehicles also need length-aware collision spacing so they don't
  overlap the vehicle ahead.
- **Dropshadow drawn in-engine, moving with each vehicle** (a soft dark ellipse
  under the sprite) so it looks right on tarmac, gravel and sand alike.

**Sequence:**
- Phase 1 (art, delegated): standardise skips 2/3/5; car colour variants (red,
  blue; keep yellow); Henry claymation **with** heart-paw badge (continuity —
  ref the current henry sprite); claymation pickup, ambulance, motorbike.
- Phase 2 (code): add traffic kinds bus / binlorry / skiptruck (+ profiles,
  which roads they spawn on), skip-swap overlay child on the flatbed, seasonal
  bus + The Dip routing, side-road spawning for bin lorry & skip truck; replace
  the live `vehicle-topdown-*.png`; verify in-engine; commit.

## Reference files

- World style: `apps/game/public/admin/scene-assets/arc-exterior.png`,
  `.../scene-assets/cast/*`, `apps/game/public/assets/animals/*`.
- Driving backdrops: `apps/game/public/assets/driving/topdown/site-arc-building.png`,
  `.../site-gravel.png`.
- Current (to replace): `apps/game/public/assets/driving/topdown/vehicle-topdown-*.png`.
- Pipeline: `tools/gpt-image-regen.sh <out.png> <prompt> <ref…>`; key with
  `tools/comfy-key-vehicle.py` if generated on a flat colour.
