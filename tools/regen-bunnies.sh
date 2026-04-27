#!/usr/bin/env bash
# regen-bunnies.sh — batch-regen the bunny library per Marcus's review:
#   - angora, lop, rex: FULL 9-state chibi regen (too photographic)
#   - dutch: targeted fixes on 5 sprites
#   - spotted: targeted fixes on 2 sprites
#
# Total: 34 sprites ~= $1.43 at medium quality.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
REGEN="$ROOT/apps/game/public/admin/regen-v3-sprites"
SCRIPT="$ROOT/tools/gpt-image-regen.sh"
export GPT_IMAGE_QUALITY="${GPT_IMAGE_QUALITY:-medium}"
export GPT_IMAGE_MODEL="${GPT_IMAGE_MODEL:-gpt-image-1.5}"

STYLE_BASE="Painterly children's-book illustration in chibi style (large rounded head about 45% of body, expressive large eyes, soft visible outlines, warm saturated palette). Transparent PNG background, NO floor shadow, NO background scenery, single bunny centred. NOT photo-realistic, NOT anthropomorphised (no scarves, no crossed arms, no human-like sitting). NO WATERMARKS, NO text. The FIRST reference image is a pose anchor — match its body geometry (body angle, feet position, ear position, head direction) precisely. The remaining references lock the chibi PAINTERLY STYLE and proportions."

# Canonical pose anchors — clean chibi bunnies from the installed assets.
# These are the geometry templates every variant-state combination will match.
pose_anchor() {
  case "$1" in
    arriving)  echo "$ASSETS/bunny-dutch-sheltered.png" ;;
    sheltered) echo "$ASSETS/bunny-dutch-sheltered.png" ;;
    eating)    echo "$ASSETS/bunny-spotted-eating.png" ;;
    sleeping)  echo "$ASSETS/bunny-lionhead-sleeping.png" ;;
    walking)   echo "$ASSETS/bunny-arctic-walking.png" ;;
    growling)  echo "$ASSETS/bunny-spotted-growling.png" ;;
    grumpy)    echo "$ASSETS/bunny-arctic-grumpy.png" ;;
    scared)    echo "$ASSETS/bunny-arctic-scared.png" ;;
    sick)      echo "$ASSETS/bunny-arctic-sick.png" ;;
    *) return 1 ;;
  esac
}

# Per-state pose rule with explicit body geometry
pose_rule() {
  case "$1" in
    arriving)  echo "Bunny sitting on all fours, facing 3/4 to camera-right, looking insecure/uncertain with wide worried eyes, ears slightly back. Next to a folded soft chunky knitted BLANKET (NOT a box, NOT a gift) proportionately sized — the bunny could snuggle in it." ;;
    sheltered) echo "Bunny in a classic loaf-sitting pose, content expression, facing 3/4 to camera-right. NO objects, NO props, just the bunny on transparent background." ;;
    eating)    echo "Bunny sitting up on haunches with front paws in a neutral bunny position, nibbling a small piece of food (carrot, lettuce or pellet). Facing 3/4 to camera-right." ;;
    sleeping)  echo "Bunny curled up asleep with eyes closed, body low, ears flat against the back, peaceful expression. On transparent background, no bed." ;;
    walking)   echo "Bunny mid-HOP (bunnies hop, not walk), body stretched forward, back paws tucked, front paws reaching, ears streaming back, facing RIGHT." ;;
    growling)  echo "Bunny in a defensive pose: body low and tense, ears flat back, small teeth bared slightly (kid-appropriate warning). Facing 3/4 to camera-right. No human-like gestures." ;;
    grumpy)    echo "Bunny sitting with ears half-back, narrowed eyes, small frown, sulky expression. All four paws on the ground. NO arms akimbo, NO standing on hind legs, NO human postures, NO scarves or accessories." ;;
    scared)    echo "Bunny crouched low, body pressed to the ground, ears FLAT against the back, wide frightened eyes, tail tucked. Genuine fear posture." ;;
    sick)      echo "Bunny lying down on its side or belly, head low, half-closed sad eyes, droopy ears. Unwell but recoverable — pitiful, not scary. NO bed or cushion underneath." ;;
    *) echo "UNKNOWN" >&2; return 1 ;;
  esac
}

# Breed descriptions (chibi painterly style only)
variant_desc() {
  case "$1" in
    angora)  echo "an ANGORA bunny with EXTREMELY LONG FLUFFY HAIR covering the entire body like a cloud of soft wool (distinctive sheep-like puffy coat), short ears peeking through the fluff, cream or light-grey coloured fur, very round/spherical silhouette" ;;
    lop)     echo "a LOP bunny with LONG FLOPPY EARS drooping DOWN AND OUTWARD past the face (signature lop feature — ears do NOT stand upright), medium-length warm-brown fur, round body, sweet expression. NO accessories, NO scarves, NO clothing" ;;
    rex)     echo "a REX bunny with SHORT VELVETY PLUSH FUR (distinctive 'teddy-bear' coat — short and dense, NOT long or fluffy), compact rounded body, short upright ears, warm milk-chocolate brown colour" ;;
    dutch)   echo "a DUTCH bunny with distinctive BLACK-AND-WHITE markings: WHITE blaze up the forehead, WHITE saddle around the shoulders and front body, BLACK from the back/flanks to the hindquarters, WHITE paws, standing upright ears" ;;
    spotted) echo "a SPOTTED bunny with a WHITE base coat and SCATTERED DARK BROWN/BLACK spots all over the body and head, standing upright ears, plump round body" ;;
    *) echo "UNKNOWN" >&2; return 1 ;;
  esac
}

# Pick character refs from the variant's own good sprites; fall back to
# other bunnies' good sprites to lock chibi style when variant is fully
# photographic.
pick_char_refs() {
  local variant="$1"
  local exclude_state="$2"
  local refs=()
  # First pass: variant's own sprites
  for state in sheltered eating walking growling arriving sleeping grumpy scared sick; do
    [ "$state" = "$exclude_state" ] && continue
    local f="$ASSETS/bunny-$variant-$state.png"
    [ -f "$f" ] && refs+=("$f")
    [ "${#refs[@]}" -ge 2 ] && break
  done
  # Always add a style anchor from a known-chibi bunny (lionhead or arctic
  # sprites that passed Marcus's review) to lock the painterly chibi style
  refs+=("$ASSETS/bunny-arctic-walking.png")
  printf '%s\n' "${refs[@]}"
}

# Firing list:
# Format: variant:state[,state,...]
# - 'full' = all 9 states (for photographic variants)
# - listed states = targeted fixes
JOBS=(
  "angora:full"       # whole set photographic
  "lop:full"          # whole set photographic + scarf/arms
  "rex:full"          # whole set photographic
  "dutch:walking,arriving,growling,scared,grumpy"  # 5 targeted
  "spotted:sleeping,growling"                      # 2 targeted
)

STATES_FULL=(arriving sheltered eating sleeping walking growling grumpy scared sick)

echo "Plan:" >&2
for job in "${JOBS[@]}"; do
  variant="${job%%:*}"
  scope="${job##*:}"
  if [ "$scope" = "full" ]; then
    echo "  $variant: all 9 states" >&2
  else
    echo "  $variant: $scope" >&2
  fi
done
echo "" >&2

i=0
for job in "${JOBS[@]}"; do
  variant="${job%%:*}"
  scope="${job##*:}"
  if [ "$scope" = "full" ]; then
    states=("${STATES_FULL[@]}")
  else
    IFS=',' read -ra states <<< "$scope"
  fi

  breed=$(variant_desc "$variant")
  for state in "${states[@]}"; do
    i=$((i+1))
    out="$REGEN/bunny-$variant-$state.png"
    pose=$(pose_rule "$state")
    anchor=$(pose_anchor "$state")
    if [ ! -f "$anchor" ]; then
      echo "[$i] bunny-$variant-$state: anchor missing ($anchor), skipping" >&2
      continue
    fi
    prompt="$STYLE_BASE This bunny is $breed. $pose"
    refs=("$anchor")
    while IFS= read -r r; do refs+=("$r"); done < <(pick_char_refs "$variant" "$state")

    echo "[$i] bunny-$variant-$state  (anchor=$(basename "$anchor" .png), ${#refs[@]} refs)"
    "$SCRIPT" "$out" "$prompt" "${refs[@]}" 2>&1 | sed 's/^/   /'
  done
done

echo ""
echo "Done. $i bunny sprites regenerated → $REGEN"
