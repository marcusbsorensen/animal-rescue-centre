#!/usr/bin/env bash
# Fix the 4 bats Marcus flagged from the v2 pass:
#   - bat-fruit-grumpy    (face orientation wrong when hanging)
#   - bat-longeared-sheltered (colour tone off vs other longeared)
#   - bat-pipistrelle-eating  (too dark vs other pipistrelle)
#   - bat-pipistrelle-sleeping (too dark vs other pipistrelle)
#
# Root cause of the colour drifts: the v2 pose anchor was from a DIFFERENT-
# coloured variant (brown-sheltered anchoring longeared, etc.), so colour
# bled in. Fix: pick pose anchors that are (a) the same variant where
# possible, or (b) the closest-coloured variant.
#
# Root cause of fruit-grumpy face: the brown-grumpy pose anchor shows a
# fruit-bat-unlike face shape. Fix: keep it as pose anchor but add
# bat-fruit-sheltered (also hanging) so character face-when-hanging locks.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
REGEN="$ROOT/apps/game/public/admin/regen-v3-sprites"
OUT="$REGEN"
SCRIPT="$ROOT/tools/gpt-image-regen.sh"
export GPT_IMAGE_QUALITY="${GPT_IMAGE_QUALITY:-medium}"
export GPT_IMAGE_MODEL="${GPT_IMAGE_MODEL:-gpt-image-1.5}"

STYLE="Painterly children's-book illustration in chibi style (large rounded head about 45% of body, expressive large eyes, soft visible outlines, warm saturated palette). Transparent PNG background, NO floor shadow, NO background scenery, single bat centred. NOT photo-realistic, NOT anthropomorphised. Match the fur colour, face shape, ear style, and chibi proportions of the CHARACTER reference images EXACTLY — those are the same individual bat in different states. The FIRST reference image is a pose anchor — match its exact BODY GEOMETRY (body angle, feet position, wing symmetry, head direction) precisely."

# ── 1. bat-fruit-grumpy — fix face orientation ─────────────────
# Pose anchor: bat-brown-grumpy (good hanging grumpy geometry)
# Character refs: all other accepted fruit bats, including fruit-sheltered
# which is the best face-when-hanging reference for the fruit variant.
PROMPT_FG="${STYLE} This bat is a larger golden-orange fruit bat with fox-like pointy face, big eyes, reddish-brown fluffy fur, tan wings. The bat is HANGING UPSIDE-DOWN: body vertical, head pointing STRAIGHT DOWN toward the bottom of the frame, feet at top-centre, wings folded loosely but SYMMETRIC, ears drooped, narrowed eyes, small frown. Sulky but cute.

CRITICAL FACE ORIENTATION: because the bat is hanging upside-down, its FACE must appear upside-down in the image — the eyes are LOWER than the forehead (which is closest to the feet at top), and the chin/mouth points DOWN toward the bottom of the frame. Match how the face is oriented in the bat-fruit-sheltered reference image (that bat is also hanging — use its face orientation exactly). Do NOT render the face as if the bat were sitting right-side-up."

# ── 2. bat-longeared-sheltered — colour tone fix ───────────────
# Use bat-longeared-sleeping as pose anchor (SAME variant, hanging pose)
# instead of bat-brown-sheltered (different variant, brown-ward drift).
PROMPT_LS="${STYLE} This bat is a long-eared bat with ENORMOUS pointed ears (nearly as tall as body), delicate translucent wings, MEDIUM-BROWN fur (NOT dark brown, NOT chestnut — the lighter medium-brown tone shown in the character references), small pointy face. The bat is HANGING UPSIDE-DOWN: body VERTICAL, head pointing STRAIGHT DOWN, feet clearly visible gripping at the TOP-CENTRE of the frame, wings folded SYMMETRICALLY around the body. Calm, settled, content expression. CRITICAL: fur tone must match the other long-eared bat sprites in the character references — not browner, not darker."

# ── 3. bat-pipistrelle-eating — colour tone fix ────────────────
# Pipistrelle is DARK brown. Use bat-brown-eating as pose anchor (closer
# in tone than longeared) + pipistrelle character refs dominate.
PROMPT_PE="${STYLE} This bat is a TINY pipistrelle bat (smallest bat species), dark reddish-brown fluffy fur, small neat pointed ears, snubby little face, tiny dark eyes. The bat is SITTING RIGHT-SIDE-UP on the ground, body facing 3/4 to camera-right, both feet flat on a ground-level baseline, holding a small piece of food in its wing-fingers, nibbling happily. Head slightly bent toward the food. CRITICAL: fur tone must match the LIGHTER DARK-BROWN shown in the pipistrelle character references — NOT too dark, NOT black, match bat-pipistrelle-sheltered and bat-pipistrelle-arriving exactly."

# ── 4. bat-pipistrelle-sleeping — colour tone fix ──────────────
# Pose anchor: bat-longeared-sleeping (same-pose, closer tone than fruit)
PROMPT_PS="${STYLE} This bat is a TINY pipistrelle bat (smallest bat species), dark reddish-brown fluffy fur, small neat pointed ears, snubby little face. The bat is HANGING UPSIDE-DOWN: body VERTICAL, head pointing STRAIGHT DOWN, feet at TOP-CENTRE, wings wrapped TIGHT around body like a cocoon (symmetric), eyes closed peacefully. CRITICAL: fur tone must match the LIGHTER DARK-BROWN of the other pipistrelle sprites in the references — NOT too dark, NOT black."

echo "[1/4] bat-fruit-grumpy (face orientation fix)"
"$SCRIPT" "$OUT/bat-fruit-grumpy.png" "$PROMPT_FG" \
  "$ASSETS/bat-brown-grumpy.png" \
  "$ASSETS/bat-fruit-sheltered.png" \
  "$ASSETS/bat-fruit-sleeping.png" \
  "$ASSETS/bat-fruit-growling.png" 2>&1 | sed 's/^/   /'

echo "[2/4] bat-longeared-sheltered (colour tone fix)"
"$SCRIPT" "$OUT/bat-longeared-sheltered.png" "$PROMPT_LS" \
  "$ASSETS/bat-longeared-sleeping.png" \
  "$ASSETS/bat-longeared-arriving.png" \
  "$ASSETS/bat-longeared-eating.png" \
  "$ASSETS/bat-longeared-grumpy.png" 2>&1 | sed 's/^/   /'

echo "[3/4] bat-pipistrelle-eating (colour tone fix)"
"$SCRIPT" "$OUT/bat-pipistrelle-eating.png" "$PROMPT_PE" \
  "$ASSETS/bat-brown-eating.png" \
  "$ASSETS/bat-pipistrelle-sheltered.png" \
  "$ASSETS/bat-pipistrelle-arriving.png" \
  "$ASSETS/bat-pipistrelle-walking.png" 2>&1 | sed 's/^/   /'

echo "[4/4] bat-pipistrelle-sleeping (colour tone fix)"
"$SCRIPT" "$OUT/bat-pipistrelle-sleeping.png" "$PROMPT_PS" \
  "$ASSETS/bat-longeared-sleeping.png" \
  "$ASSETS/bat-pipistrelle-sheltered.png" \
  "$ASSETS/bat-pipistrelle-arriving.png" \
  "$ASSETS/bat-pipistrelle-walking.png" 2>&1 | sed 's/^/   /'

echo ""
echo "Done. 4 fix sprites written to $OUT"
