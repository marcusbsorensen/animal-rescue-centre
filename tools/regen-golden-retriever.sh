#!/usr/bin/env bash
# Regenerate all 9 golden retriever states + 1 sample PLAY-BOW pose to
# fix the fuzzy/coloured-pencil style mismatch with the rest of the set.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
REGEN="$ROOT/apps/game/public/admin/regen-v3-sprites"
export GPT_IMAGE_QUALITY=medium
export GPT_IMAGE_MODEL=gpt-image-1.5

STYLE="Painterly children's-book illustration in chibi style (large rounded head about 45% of body, expressive large eyes, soft visible outlines, warm saturated palette). Transparent PNG background, NO floor shadow, NO background. NOT photo-realistic, NOT fuzzy like coloured pencil, NOT cartoon-flat. Match the hand-painted chibi style of the reference images exactly — clean painterly with soft cel-shading, NOT the soft-fuzzy-shaded look."

BREED="A YOUNG adult golden retriever: warm blonde-gold coat (a clean warm gold, not too orange, not too yellow), long feathery floppy ears, feathery tail, friendly broad rounded chibi face, dark soulful round eyes, pink tongue often visible, classic friendly retriever. Fur is rendered in SMOOTH PAINTERLY strokes — NOT fuzzy, NOT coloured-pencil-shaded. NO COLLAR."

REFS=(
  "$ASSETS/dog-dalmatian-sheltered.png"
  "$ASSETS/dog-husky-sheltered.png"
  "$REGEN/dog-chocolate-sheltered.png"
  "$REGEN/dog-collie-sheltered.png"
)

i=0
for state in arriving sheltered eating sleeping walking growling grumpy scared sick; do
  i=$((i+1))
  case "$state" in
    arriving) pose="insecure/uncertain arrival, sitting next to a worn folded knitted blanket, wide worried eyes. NOT happy, NOT smiling." ;;
    sheltered) pose="content sitting upright, bright friendly expression, tail visible behind, ears relaxed. No objects." ;;
    eating) pose="happily eating from a proportionate food bowl, head down, tail up, floppy ears forward." ;;
    sleeping) pose="sprawled on side asleep, all paws relaxed, peaceful expression. NO bed, NO floor, just the dog." ;;
    walking) pose="mid-stride walking, side-on view, HEAD FACING RIGHT, one front paw lifted, tail swishing. NO COLLAR." ;;
    growling) pose="low warning pose: lips slightly raised showing teeth, ears back, body tense. Kid-appropriate." ;;
    grumpy) pose="lying on belly with chin on paws, big disapproving sad-eye stare, ears slightly back. Classic sulk." ;;
    scared) pose="low crouched, tail tucked, ears flat, wide worried eyes." ;;
    sick) pose="lying down head on paws, droopy eyes, ears limp, tail still. Unwell but recoverable." ;;
  esac
  echo "[$i/10] dog-golden-$state"
  tools/gpt-image-regen.sh "$REGEN/dog-golden-$state.png" \
    "$STYLE $BREED $pose" \
    "${REFS[@]}" 2>&1 | sed 's/^/   /'
done

# Sample 10th state: PLAYING (play-bow pose for golden retriever)
echo "[10/10] dog-golden-playing (SAMPLE — new state)"
tools/gpt-image-regen.sh "$REGEN/dog-golden-playing.png" \
  "$STYLE $BREED CLASSIC PLAY BOW POSE: front paws and chest lowered flat to the ground, rear end and tail raised high in the air, tail wagging enthusiastically, big bright excited eyes looking forward, tongue lolling out in a happy open-mouth grin, ears perked. The universally-recognised 'let's play!' dog posture. Facing 3/4 to camera-right." \
  "${REFS[@]}" 2>&1 | sed 's/^/   /'

echo ""
echo "Done — 10 golden retriever sprites written to $REGEN"
