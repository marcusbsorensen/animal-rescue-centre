#!/usr/bin/env bash
# Regenerate the 17 problematic bats via GPT Image 1.5 with tighter
# anchor-geometry consistency.
#
# V2 improvements (over first pass):
#   1. Each call now includes a CANONICAL POSE ANCHOR reference as the first
#      image[] — picked from already-approved sprites so body-geometry
#      (feet position, body angle, wing symmetry) locks across all
#      variants for the same state.
#   2. Prompts now bake in explicit body geometry ("head pointing straight
#      down", "feet centred at top", "body horizontal facing right") not
#      just the broader pose type.
#
# This gives the anchor system predictable geometry: e.g. every hanging
# bat's feet land at the top-centre, every sitting bat's base lands at the
# bottom-centre, every flying bat's body is horizontal-centred.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
REGEN="$ROOT/apps/game/public/admin/regen-v3-sprites"
OUT="$REGEN"
SCRIPT="$ROOT/tools/gpt-image-regen.sh"
export GPT_IMAGE_QUALITY="${GPT_IMAGE_QUALITY:-medium}"
export GPT_IMAGE_MODEL="${GPT_IMAGE_MODEL:-gpt-image-1.5}"

# Universal style prefix — chibi, painterly, transparent, no floor shadow
STYLE="Painterly children's-book illustration in chibi style (large rounded head about 45% of body, expressive large eyes, soft visible outlines, warm saturated palette). Transparent PNG background, NO floor shadow, NO background scenery, single bat centred. NOT photo-realistic, NOT anthropomorphised. Match the fur colour, face shape, ear style, and chibi proportions of the CHARACTER reference images EXACTLY — those are the same individual bat in different states. The FIRST reference image is a pose anchor — match its exact BODY GEOMETRY (body angle, feet position, wing symmetry, head direction) precisely, only change the variant's markings and the expression to fit the target state."

# Per-state pose rule with EXPLICIT body geometry for anchor consistency
pose_rule() {
  case "$1" in
    arriving)  echo "The bat is SITTING RIGHT-SIDE-UP on the ground, body facing 3/4 toward camera-right, both feet flat on a ground-level baseline, head centred over body. Looks insecure and unsettled — wide worried eyes, body slightly lowered, ears slightly back. Small folded soft cloth or pouch beside the bat (proportionate size). NOT hanging. NOT happy." ;;
    sheltered) echo "The bat is HANGING UPSIDE-DOWN: body VERTICAL, head pointing STRAIGHT DOWN, feet clearly visible gripping at the TOP-CENTRE of the frame, wings folded SYMMETRICALLY around the body (not asymmetric). Calm, settled, content expression." ;;
    eating)    echo "The bat is SITTING RIGHT-SIDE-UP on the ground, body facing 3/4 to camera-right, both feet flat on a ground-level baseline, holding a small piece of food (fruit or insect) in its wing-fingers, nibbling happily. Head slightly bent toward the food." ;;
    sleeping)  echo "The bat is HANGING UPSIDE-DOWN: body VERTICAL, head pointing STRAIGHT DOWN, feet at TOP-CENTRE, wings wrapped TIGHT around body like a cloak (fully covering like a cocoon), eyes closed peacefully. SYMMETRIC wing wrap." ;;
    walking)   echo "The bat is in mid-FLIGHT: body HORIZONTAL centred in the frame, wings SPREAD WIDE SYMMETRICALLY to left and right mid-flap, head facing RIGHT, tail extended behind. NOT walking — bats FLY." ;;
    growling)  echo "The bat is HANGING UPSIDE-DOWN: body vertical, head pointing straight down, feet at top-centre, wings SPREAD WIDE SYMMETRICALLY in a warning display (not wrapped around the body), small teeth bared, ears flat. Kid-appropriate threat, not horror." ;;
    grumpy)    echo "The bat is HANGING UPSIDE-DOWN: body vertical, head pointing straight down, feet at top-centre, wings folded loosely, ears drooped, narrowed eyes, small frown. SYMMETRIC wing position. Sulky but still cute." ;;
    scared)    echo "The bat is HANGING UPSIDE-DOWN: body vertical, head pointing straight down, feet at top-centre, wings wrapped TIGHT and SYMMETRICALLY around body covering it completely, huge worried eyes peeking out." ;;
    sick)      echo "The bat is LYING BELLY-DOWN on the ground, body HORIZONTAL across the frame, head pointing LEFT, wings splayed OUT SYMMETRICALLY to left and right (not wrapped), half-closed sad eyes, tiny drooping ears. Unwell but recoverable — pitiful, not scary. NOT hanging." ;;
    *) echo "UNKNOWN STATE: $1" >&2; return 1 ;;
  esac
}

# Per-variant breed description
variant_desc() {
  case "$1" in
    brown)       echo "warm chestnut-brown bat with rich glossy fur, rounded face, small pointed ears, tiny pink nose" ;;
    fruit)       echo "larger golden-orange fruit bat with fox-like pointy face, big eyes, reddish-brown fluffy fur, tan wings" ;;
    longeared)   echo "long-eared bat with ENORMOUS pointed ears (nearly as tall as body), delicate translucent wings, medium-brown fur, small pointy face" ;;
    pipistrelle) echo "TINY pipistrelle bat, the smallest bat species, dark brown fluffy fur, small neat ears, snubby little face" ;;
    white)       echo "pure-white Honduran-style bat, fluffy cotton-ball body, pale translucent pink-tinted wings, small leaf-shaped nose, big dark eyes, yellow/orange nose and ear rim details" ;;
    *) echo "UNKNOWN VARIANT: $1" >&2; return 1 ;;
  esac
}

# Canonical pose anchor per state — pick an already-approved sprite whose
# body geometry we want every other variant's same-state sprite to match.
# For `sick`, use the new GPT-generated bat-brown-sick (Marcus approved its
# belly-down geometry) from the regen folder, not the old rejected asset.
pose_anchor() {
  case "$1" in
    arriving)  echo "$ASSETS/bat-pipistrelle-arriving.png" ;;
    sheltered) echo "$ASSETS/bat-brown-sheltered.png" ;;
    eating)    echo "$ASSETS/bat-longeared-eating.png" ;;
    sleeping)  echo "$ASSETS/bat-fruit-sleeping.png" ;;
    walking)   echo "$ASSETS/bat-brown-walking.png" ;;
    growling)  echo "$ASSETS/bat-pipistrelle-growling.png" ;;
    grumpy)    echo "$ASSETS/bat-brown-grumpy.png" ;;
    scared)    echo "$ASSETS/bat-pipistrelle-scared.png" ;;
    sick)      echo "$REGEN/bat-brown-sick.png" ;;
    *) return 1 ;;
  esac
}

# Pick up to 3 character refs of the same variant (excluding the target
# state — we're replacing that sprite).
pick_char_refs() {
  local variant="$1"
  local exclude_state="$2"
  local refs=()
  for state in sheltered eating walking growling arriving sleeping grumpy scared sick; do
    [ "$state" = "$exclude_state" ] && continue
    local f="$ASSETS/bat-$variant-$state.png"
    if [ -f "$f" ]; then
      refs+=("$f")
      [ "${#refs[@]}" -ge 3 ] && break
    fi
  done
  printf '%s\n' "${refs[@]}"
}

BATS=(
  "brown:sick"
  "fruit:arriving"
  "fruit:eating"
  "fruit:walking"
  "fruit:grumpy"
  "fruit:scared"
  "fruit:sick"
  "longeared:sheltered"
  "pipistrelle:eating"
  "pipistrelle:sleeping"
  "pipistrelle:sick"
  "white:arriving"
  "white:eating"
  "white:sleeping"
  "white:walking"
  "white:scared"
  "white:sick"
)

i=0
total="${#BATS[@]}"
for pair in "${BATS[@]}"; do
  i=$((i+1))
  variant="${pair%%:*}"
  state="${pair##*:}"
  out="$OUT/bat-$variant-$state.png"
  breed=$(variant_desc "$variant")
  pose=$(pose_rule "$state")
  prompt="${STYLE} This bat is a ${breed}. ${pose}"

  # Build refs: pose anchor FIRST (most important), then character refs
  anchor=$(pose_anchor "$state")
  refs=("$anchor")
  while IFS= read -r r; do refs+=("$r"); done < <(pick_char_refs "$variant" "$state")

  if [ ! -f "$anchor" ]; then
    echo "[$i/$total] bat-$variant-$state: POSE ANCHOR MISSING ($anchor) — skipping" >&2
    continue
  fi

  echo "[$i/$total] bat-$variant-$state  (pose=$(basename "$anchor" .png) + ${#refs[@]} refs)"
  "$SCRIPT" "$out" "$prompt" "${refs[@]}" 2>&1 | sed 's/^/   /'
done

echo ""
echo "Done. Generated $total sprites → $OUT"
