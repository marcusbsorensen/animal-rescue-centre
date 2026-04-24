#!/usr/bin/env bash
# Regenerate the 9 apprentice walking-pose sprites (v2) via gpt-image-regen.sh.
# See task brief in session for full rationale. Run from repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGEN="$ROOT/tools/gpt-image-regen.sh"
REFDIR="$ROOT/apps/game/public/admin/mockup-assets/cast/apprentices"
WORKDIR="$ROOT/manus-output/cast-walking-poses/apprentices-gpt-v2"
STAGE="$ROOT/apps/game/public/admin/mockup-assets/cast/apprentices-walking"

mkdir -p "$WORKDIR" "$STAGE"

STYLE='Painted watercolour storybook matching the in-game cast portraits exactly. Reference treatment: Julia Donaldson / Raymond Briggs / Aardman-adjacent illustration. Small realistic eyes set into soft painted faces. Warm ink outlines, soft colour washes, painted imperfections. Natural human proportions even for child characters — NOT chibi, NOT big-headed.

BLOCKLIST (do not render any of these, will be rejected): anime · manga · chibi · big-eyed kawaii · vector flat-shading · cel-shading · photorealism · 3D · cartoon-sweet / Disney / Pixar / generic children'"'"'s-cartoon faces.

The face treatment matters most: small eyes, understated expression, painted softly like a children'"'"'s-picture-book illustrator would — NOT big-eyed anime.'

SHARED='1024×1024 PNG, transparent background. ≥10% clearance above head and below feet. Full body (head to feet). NO painted pavement / road / zebra crossing / kerb / grass / any ground context — only a small soft-edged oval cast shadow directly beneath the feet; everything else beneath the shadow is fully transparent. Wardrobe MUST be identical across this character'"'"'s 3 poses.'

RHUBARB='CHARACTER: Rhubarb — 8 years old, genderqueer androgynous child, COOL & CYNICAL personality. Expression: slight knowing smirk — NOT a big smile. Hair: unruly long blonde hair tumbling past shoulders. Wardrobe (IDENTICAL across all 3 poses): army-camo cargo shorts, grey-black skater Converse sneakers, faded dark-grey rock-band tee with a small painted skull motif on the chest, black headphones hanging round the neck. Build: small for age. Body language: slightly guarded, hip cocked.'

AMARA='CHARACTER: Amara — 9 years old, WARM & FRIENDLY tomboy, always mid-adventure. Expression: big open smile, delighted to see the viewer. Skin: warm brown. Hair: curly dark hair with a yellow headband, 1–2 small leaf fragments / tiny twigs caught in a curl (she climbs trees, things stick to her). Wardrobe (IDENTICAL across all 3 poses): light-blue short-sleeve tee with tiny painted flower-patches, olive-green cargo shorts with pocket details, red low-top sneakers. MESS DETAILS (IDENTICAL across all 3 poses): muddy warm-brown / ochre smudges on BOTH KNEES from crawling + climbing; 1–2 small leaf fragments stuck to the shirt or hem of shorts; 1–2 leaf bits tangled in her hair. Painted softly, not cartoon-gross — just enough to read as "careless outdoor mess" — she'"'"'s happy with it, not grubby. Body language: energetic, slightly wild — just came down from a tree.'

KOFI='CHARACTER: Kofi — 10 years old, GEEKY, earnest, slightly awkward. Expression: small careful smile, earnest and thoughtful, not cocky. Face: round dark-framed glasses — ALWAYS PRESERVED in every sprite. Skin: warm brown. Hair: short dark hair. Wardrobe (IDENTICAL across all 3 poses): pale-blue knit jumper, mustard-yellow shorts, white low-top sneakers with small red accents. Body language: stands a little stiffly, careful.'

POSE_FRONT='POSE: Front-facing, mid-stride, one leg forward, arms relaxed and natural. Walking toward the viewer. Keep expression consistent with character personality.'
POSE_SIDE='POSE: Profile facing screen-right, mid-stride, one arm forward + one back, one leg forward + one back. Wardrobe IDENTICAL to the character'"'"'s front pose — same colours, same patterns, same painted details, same mess (Amara). No drift. Keep expression consistent with character personality.'
POSE_WAVE='POSE: Front-facing, standing still, one arm raised mid-wave, the other arm relaxed at the side. Wardrobe IDENTICAL to front pose. Keep expression consistent with character personality.'

RHU_REFS=("$REFDIR/rhubarb-cat-lap.png" "$REFDIR/rhubarb-feeding.png" "$REFDIR/rhubarb-skateboarding-garden.png")
AMA_REFS=("$REFDIR/amara-cat-shoulder.png" "$REFDIR/amara-climbing.png" "$REFDIR/amara-treat.png")
KOF_REFS=("$REFDIR/kofi-parrot-arm.png" "$REFDIR/kofi-reading-aloud.png" "$REFDIR/kofi-snake-nose.png")

gen() {
  local outname="$1"; shift
  local charblock="$1"; shift
  local pose="$1"; shift
  local refs=("$@")
  local prompt="$STYLE

$charblock

$pose

$SHARED"
  local out="$WORKDIR/$outname"
  echo ">>> Generating $outname"
  "$REGEN" "$out" "$prompt" "${refs[@]}"
  cp "$out" "$STAGE/$outname"
  echo "    staged -> $STAGE/$outname"
}

# Rhubarb
gen "rhubarb-walking-front.png" "$RHUBARB" "$POSE_FRONT" "${RHU_REFS[@]}"
gen "rhubarb-walking-side.png"  "$RHUBARB" "$POSE_SIDE"  "${RHU_REFS[@]}"
gen "rhubarb-waving.png"        "$RHUBARB" "$POSE_WAVE"  "${RHU_REFS[@]}"

# Amara
gen "amara-walking-front.png" "$AMARA" "$POSE_FRONT" "${AMA_REFS[@]}"
gen "amara-walking-side.png"  "$AMARA" "$POSE_SIDE"  "${AMA_REFS[@]}"
gen "amara-waving.png"        "$AMARA" "$POSE_WAVE"  "${AMA_REFS[@]}"

# Kofi
gen "kofi-walking-front.png" "$KOFI" "$POSE_FRONT" "${KOF_REFS[@]}"
gen "kofi-walking-side.png"  "$KOFI" "$POSE_SIDE"  "${KOF_REFS[@]}"
gen "kofi-waving.png"        "$KOFI" "$POSE_WAVE"  "${KOF_REFS[@]}"

echo "ALL DONE"
