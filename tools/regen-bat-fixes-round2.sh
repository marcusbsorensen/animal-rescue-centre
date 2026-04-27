#!/usr/bin/env bash
# Round-2 bat fixes from Marcus's review:
#   - bat-longeared-grumpy   — must be HANGING upside-down (was sitting)
#   - bat-longeared-sick     — NOT on a branch (just belly-down on ground)
#   - bat-fruit-walking      — not angry, shorter muzzle (not fox-like)
#   - bat-fruit-growling     — shorter muzzle
#   - bat-fruit-eating       — smaller ears (matching other fruit)
#   - bat-fruit-sick         — warm yellow-light-orange, not red-orange
#   - bat-brown-sick         — less red, more light brown
#   - bat-pipistrelle-eating — lighter brown (not chocolate)
#   - bat-white-eating       — smaller ears
#
# Every prompt now EXPLICITLY calls out the feature to match/avoid from
# the character references, and uses "resting/suspended" moderation-safe
# language where the pose is upside-down.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
REGEN="$ROOT/apps/game/public/admin/regen-v3-sprites"
SCRIPT="$ROOT/tools/gpt-image-regen.sh"
export GPT_IMAGE_QUALITY="${GPT_IMAGE_QUALITY:-medium}"
export GPT_IMAGE_MODEL="${GPT_IMAGE_MODEL:-gpt-image-1.5}"

STYLE_BASE="Painterly children's-book illustration in chibi style (large rounded head about 45% of body, expressive large eyes, soft visible outlines, warm saturated palette). Transparent PNG background, NO floor shadow, NO background scenery, single bat centred. NOT photo-realistic, NOT anthropomorphised. The FIRST reference image is a pose anchor — match its body geometry precisely. The remaining references are character anchors — match fur colour, face shape, ear SIZE, and proportions exactly."

echo "[1/9] bat-longeared-grumpy — HANGING + drooped ears"
P1="$STYLE_BASE This bat is a long-eared bat with ENORMOUS pointed ears, delicate translucent wings, medium-brown fur. The bat is resting upside-down suspended from a perch by its feet at the TOP-CENTRE of the frame, body vertical with head pointing down. Ears drooped downward (looking grumpy), narrowed eyes, small frown. Wings folded symmetrically. Fur tone must match the other long-eared references — medium-brown, NOT chestnut, NOT dark-brown."
"$SCRIPT" "$REGEN/bat-longeared-grumpy.png" "$P1" \
  "$ASSETS/bat-longeared-sleeping.png" \
  "$ASSETS/bat-longeared-arriving.png" \
  "$ASSETS/bat-longeared-eating.png" \
  "$ASSETS/bat-longeared-walking.png" 2>&1 | sed 's/^/   /'

echo "[2/9] bat-longeared-sick — belly-down on ground, NO branch"
P2="$STYLE_BASE This bat is a long-eared bat with ENORMOUS pointed ears, delicate wings, medium-brown fur. The bat is LYING BELLY-DOWN on an imaginary flat ground, body horizontal across the frame, head pointing LEFT, wings splayed OUT symmetrically to left and right. Big ears drooping to the sides of the head. Half-closed sad eyes, pitiful unwell expression. CRITICAL: NO branch, NO perch, NO object under the bat — just the bat on empty transparent background (the ground is implied, not drawn). Fur tone: medium-brown matching the long-eared references."
"$SCRIPT" "$REGEN/bat-longeared-sick.png" "$P2" \
  "$REGEN/bat-brown-sick.png" \
  "$ASSETS/bat-longeared-sleeping.png" \
  "$ASSETS/bat-longeared-arriving.png" \
  "$ASSETS/bat-longeared-eating.png" 2>&1 | sed 's/^/   /'

echo "[3/9] bat-fruit-walking — not angry, shorter muzzle"
P3="$STYLE_BASE This bat is a golden-orange fruit bat with short child-like snout (NOT a long fox-like muzzle — match the SHORT snout shape in bat-fruit-sheltered and bat-fruit-sleeping references), big round eyes, reddish-brown fluffy fur, tan wings. The bat is in mid-FLIGHT: body horizontal centred in the frame, wings spread SYMMETRICALLY wide, head facing RIGHT, tail extended behind. Expression: neutral-happy / curious (NOT angry, NOT intense). Soft friendly eyes, small closed or slightly-open mouth. Bats fly, they do not walk."
"$SCRIPT" "$REGEN/bat-fruit-walking.png" "$P3" \
  "$ASSETS/bat-brown-walking.png" \
  "$ASSETS/bat-fruit-sheltered.png" \
  "$ASSETS/bat-fruit-sleeping.png" \
  "$ASSETS/bat-fruit-growling.png" 2>&1 | sed 's/^/   /'

echo "[4/9] bat-fruit-growling — shorter muzzle"
P4="$STYLE_BASE This bat is a golden-orange fruit bat with SHORT child-like snout (NOT a long fox-like muzzle — match the snout shape from bat-fruit-sheltered references), big eyes, reddish-brown fluffy fur, tan wings. The bat is resting upside-down suspended from a perch by its feet at the top-centre, body vertical, head down, wings spread wide symmetrically in a warning display (not wrapped), small teeth bared, ears flat. Kid-appropriate warning, not scary."
"$SCRIPT" "$REGEN/bat-fruit-growling.png" "$P4" \
  "$ASSETS/bat-fruit-sheltered.png" \
  "$ASSETS/bat-fruit-sleeping.png" \
  "$ASSETS/bat-pipistrelle-growling.png" \
  "$ASSETS/bat-brown-growling.png" 2>&1 | sed 's/^/   /'

echo "[5/9] bat-fruit-eating — smaller ears matching other fruit"
P5="$STYLE_BASE This bat is a golden-orange fruit bat with reddish-brown fluffy fur, short child-like snout, SMALL rounded ears (match the ear SIZE and shape of bat-fruit-sheltered and bat-fruit-sleeping references — NOT larger than those). The bat is SITTING RIGHT-SIDE-UP on the ground, body facing 3/4 to camera-right, both feet flat on a ground-level baseline, holding a small piece of fruit in its wing-fingers, nibbling happily. Head slightly bent toward the food. Ear size MUST match the references exactly — not exaggerated."
"$SCRIPT" "$REGEN/bat-fruit-eating.png" "$P5" \
  "$ASSETS/bat-fruit-sheltered.png" \
  "$ASSETS/bat-fruit-sleeping.png" \
  "$ASSETS/bat-fruit-growling.png" \
  "$ASSETS/bat-brown-eating.png" 2>&1 | sed 's/^/   /'

echo "[6/9] bat-fruit-sick — warm yellow-light-orange, not red-orange"
P6="$STYLE_BASE This bat is a golden fruit bat with WARM YELLOW-LIGHT-ORANGE fur (NOT red-orange, NOT dark-orange — a soft warm golden / light yellow-orange tone like the fur in bat-fruit-sheltered). Small child-like snout, not fox-like. The bat is LYING BELLY-DOWN on imaginary flat ground, body horizontal, head pointing LEFT, wings splayed symmetrically to left and right. Half-closed sad eyes, tiny drooped ears. NO branch, NO perch, NO object under the bat. Pitiful but recoverable."
"$SCRIPT" "$REGEN/bat-fruit-sick.png" "$P6" \
  "$REGEN/bat-brown-sick.png" \
  "$ASSETS/bat-fruit-sheltered.png" \
  "$ASSETS/bat-fruit-sleeping.png" \
  "$ASSETS/bat-fruit-growling.png" 2>&1 | sed 's/^/   /'

echo "[7/9] bat-brown-sick — less red, more light brown"
P7="$STYLE_BASE This bat is a warm LIGHT-BROWN bat (NOT red-brown, NOT chestnut, NOT dark-brown — a warm light brown tone matching the fur colour in bat-brown-sheltered and bat-brown-eating references exactly). Small rounded face, small pointed ears, tiny pink nose. The bat is LYING BELLY-DOWN on imaginary flat ground, body horizontal, head pointing LEFT, wings splayed symmetrically. Half-closed sad eyes, drooping ears. NO branch, NO object. Pitiful expression. Fur tone MUST match the character references — not redder, not darker."
"$SCRIPT" "$REGEN/bat-brown-sick.png" "$P7" \
  "$ASSETS/bat-brown-sheltered.png" \
  "$ASSETS/bat-brown-eating.png" \
  "$ASSETS/bat-brown-walking.png" \
  "$ASSETS/bat-brown-sleeping.png" 2>&1 | sed 's/^/   /'

echo "[8/9] bat-pipistrelle-eating — lighter brown, not chocolate"
P8="$STYLE_BASE This bat is a TINY pipistrelle bat (smallest bat species) with LIGHTER DARK-BROWN fluffy fur (NOT chocolate-brown, NOT too-dark — match the fur tone of bat-pipistrelle-sheltered and bat-pipistrelle-arriving references exactly, which are on the lighter side of dark-brown), small neat pointed ears, snubby little face. The bat is SITTING RIGHT-SIDE-UP on the ground, body facing 3/4 to camera-right, both feet on ground-level baseline, holding a small piece of food in wing-fingers, nibbling. Fur tone MUST match the pipistrelle character references — lighter than chocolate."
"$SCRIPT" "$REGEN/bat-pipistrelle-eating.png" "$P8" \
  "$ASSETS/bat-pipistrelle-sheltered.png" \
  "$ASSETS/bat-pipistrelle-arriving.png" \
  "$ASSETS/bat-pipistrelle-walking.png" \
  "$ASSETS/bat-pipistrelle-scared.png" 2>&1 | sed 's/^/   /'

echo "[9/9] bat-white-eating — smaller ears matching other white"
P9="$STYLE_BASE This bat is a pure-white Honduran-style bat, fluffy cotton-ball body, pale pink-tinted wings, small leaf-shaped nose, big dark eyes, yellow/orange nose and ear-rim details. SMALL ROUNDED EARS — match the ear SIZE in bat-white-sheltered, bat-white-growling, bat-white-grumpy references exactly (NOT larger than those). The bat is SITTING RIGHT-SIDE-UP on the ground, body facing 3/4 to camera-right, both feet on ground-level baseline, holding a small piece of fruit in wing-fingers, nibbling. Ear size must NOT be exaggerated — strictly match references."
"$SCRIPT" "$REGEN/bat-white-eating.png" "$P9" \
  "$ASSETS/bat-white-sheltered.png" \
  "$ASSETS/bat-white-growling.png" \
  "$ASSETS/bat-white-grumpy.png" \
  "$ASSETS/bat-brown-eating.png" 2>&1 | sed 's/^/   /'

echo ""
echo "Done. 9 fix sprites written to $REGEN"
