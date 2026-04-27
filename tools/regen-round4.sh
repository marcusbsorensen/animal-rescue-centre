#!/usr/bin/env bash
# regen-round4.sh — cross-species fix batch from Marcus's review
#   Bunnies (3): spotted-walking fatter; dutch-sheltered chibi+paw-colour; angora-grumpy chibi
#   Birds (5):   re-compose arriving sprites — branch enters from CENTRE-BOTTOM
#                (for anchor consistency); bodies stay the same.
#   Snakes (4):  hognose scared (not melted); walking (no extra-tail-from-head);
#                sheltered (eyes OPEN, distinct from sleeping);
#                (growling keeps cobra flare — anatomically correct)
#   Foxes (2):   cross-grumpy + cross-scared — transparent backgrounds
#   Dogs (17):   beagle 4 regens (arriving/growling/scared/sick);
#                chocolate-grumpy (actually grumpy not scared);
#                collie sleeping+walking (transparent);
#                terrier-grumpy (match set colour/face);
#                pug FULL 9 (arriving with blanket in mouth).

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
REGEN="$ROOT/apps/game/public/admin/regen-v3-sprites"
SCRIPT="$ROOT/tools/gpt-image-regen.sh"
export GPT_IMAGE_QUALITY="${GPT_IMAGE_QUALITY:-medium}"
export GPT_IMAGE_MODEL="${GPT_IMAGE_MODEL:-gpt-image-1.5}"

STYLE_BASE="Painterly children's-book illustration in chibi style (large rounded head about 45% of body, expressive large eyes, soft visible outlines, warm saturated palette). Transparent PNG background, NO floor shadow, NO background scenery. NOT photo-realistic, NOT anthropomorphised. NO watermarks, NO text. Match the style and proportions of the reference images."

# Helper: pick best existing regen-or-asset path (prefers asset)
pick() {
  local name="$1"
  if [ -f "$REGEN/$name" ]; then echo "$REGEN/$name"
  elif [ -f "$ASSETS/$name" ]; then echo "$ASSETS/$name"
  else echo ""
  fi
}

i=0
total=31

# ── BUNNIES (3) ─────────────────────────────────────────────

i=$((i+1)); echo "[$i/$total] bunny-spotted-walking — fatter body matching set"
"$SCRIPT" "$REGEN/bunny-spotted-walking.png" \
  "$STYLE_BASE A spotted bunny (white base with scattered dark-brown/black spots all over body and head, upright ears) in a mid-HOP pose facing RIGHT. CRITICAL: the bunny must be PLUMP AND FAT to match the other spotted bunny sprites in the set (which show a very round chubby body) — NOT slim, NOT athletic. Round chunky silhouette." \
  "$(pick bunny-spotted-sheltered.png)" \
  "$(pick bunny-spotted-eating.png)" \
  "$(pick bunny-spotted-sleeping.png)" 2>&1 | sed 's/^/   /'

i=$((i+1)); echo "[$i/$total] bunny-dutch-sheltered — chibi + matching paw colour"
"$SCRIPT" "$REGEN/bunny-dutch-sheltered.png" \
  "$STYLE_BASE A Dutch bunny in chibi painterly style, distinctive black-and-white markings: WHITE blaze up forehead, WHITE saddle around shoulders/front body, BLACK back/flanks/hindquarters, WHITE paws matching the paw-colour of the other Dutch sprites in the reference set exactly, upright ears. Classic bunny loaf-sitting pose, content expression. No objects." \
  "$(pick bunny-dutch-eating.png)" \
  "$(pick bunny-dutch-walking.png)" \
  "$(pick bunny-dutch-sleeping.png)" 2>&1 | sed 's/^/   /'

i=$((i+1)); echo "[$i/$total] bunny-angora-grumpy — chibi style"
"$SCRIPT" "$REGEN/bunny-angora-grumpy.png" \
  "$STYLE_BASE An ANGORA bunny with EXTREMELY LONG FLUFFY HAIR covering the entire body like a cloud of soft wool, short ears peeking through fluff, cream/light-grey, very round silhouette. Sulky grumpy pose: sitting on all fours (NOT standing on hind legs, NO arms akimbo, NO human postures), ears slightly back, narrowed eyes, small frown. Chibi painterly style matching refs." \
  "$(pick bunny-angora-sheltered.png)" \
  "$(pick bunny-angora-eating.png)" \
  "$(pick bunny-arctic-walking.png)" 2>&1 | sed 's/^/   /'

# ── FOXES (2) — transparency fixes ─────────────────────────

i=$((i+1)); echo "[$i/$total] fox-cross-grumpy — transparent background"
"$SCRIPT" "$REGEN/fox-cross-grumpy.png" \
  "$STYLE_BASE A cross fox (red-orange body, dark-brown stripe down forehead and spine crossing stripe across shoulders forming 'cross', white chest, white tail tip), sitting in a proper animal grumpy posture (NO human posture, NO arms akimbo, NO standing on hind legs) — ears flat back, narrowed eyes, small frown, tail tight against body. CRITICAL: FULLY TRANSPARENT PNG BACKGROUND — no coloured rectangle, no scenery, just the fox." \
  "$(pick fox-cross-sheltered.png)" \
  "$(pick fox-cross-eating.png)" \
  "$(pick fox-cross-walking.png)" 2>&1 | sed 's/^/   /'

i=$((i+1)); echo "[$i/$total] fox-cross-scared — transparent background"
"$SCRIPT" "$REGEN/fox-cross-scared.png" \
  "$STYLE_BASE A cross fox (red-orange body, dark-brown forehead/spine cross pattern, white chest, white tail tip) in a scared pose: low crouched, ears flat, tail tucked with white tip visible, wide worried eyes. CRITICAL: FULLY TRANSPARENT PNG BACKGROUND — no colour, no scenery, just the fox." \
  "$(pick fox-cross-sheltered.png)" \
  "$(pick fox-cross-eating.png)" \
  "$(pick fox-cross-walking.png)" 2>&1 | sed 's/^/   /'

# ── SNAKES (4) — hognose fixes ─────────────────────────────

i=$((i+1)); echo "[$i/$total] snake-hognose-scared — playing-dead but not melted"
"$SCRIPT" "$REGEN/snake-hognose-scared.png" \
  "$STYLE_BASE A hognose snake (sandy-tan with darker brown saddle blotches, upturned pig-like snout, medium body) in the signature 'playing dead' defensive pose — body flipped onto its BACK with the belly (pale cream-white) exposed UPWARDS, head turned sideways with tongue lolling out the mouth. IMPORTANT: the body must be a clear recognisable SNAKE SHAPE (cylindrical tube, not melted or amorphous). One or two loose coils in a natural shape. Kid-amusing playing-dead pose, proper snake anatomy." \
  "$(pick snake-hognose-arriving.png)" \
  "$(pick snake-hognose-grumpy.png)" \
  "$(pick snake-hognose-sheltered.png)" 2>&1 | sed 's/^/   /'

i=$((i+1)); echo "[$i/$total] snake-hognose-walking — no extra-tail-from-head"
"$SCRIPT" "$REGEN/snake-hognose-walking.png" \
  "$STYLE_BASE A hognose snake (sandy-tan with darker brown saddle blotches, upturned pig-like snout) SLITHERING horizontally: body in a single clean S-CURVE across the frame, head forward facing RIGHT with tongue flicking out. CRITICAL: the snake has ONE HEAD at one end and ONE TAIL at the other — do NOT draw anything resembling a second tail coming out of the head. Clean, anatomically correct snake with a single continuous body from head to tail-tip." \
  "$(pick snake-hognose-arriving.png)" \
  "$(pick snake-hognose-grumpy.png)" \
  "$(pick snake-hognose-eating.png)" 2>&1 | sed 's/^/   /'

i=$((i+1)); echo "[$i/$total] snake-hognose-sheltered — eyes OPEN (distinct from sleeping)"
"$SCRIPT" "$REGEN/snake-hognose-sheltered.png" \
  "$STYLE_BASE A hognose snake (sandy-tan with darker brown saddle blotches, upturned pig-like snout) in a RELAXED OPEN COIL, head resting on top of one of the coils. CRITICAL: EYES MUST BE CLEARLY OPEN AND ALERT (not closed, not slitted) — this distinguishes the sheltered sprite from the sleeping one. Content resting-while-awake expression, tongue maybe slightly visible." \
  "$(pick snake-hognose-arriving.png)" \
  "$(pick snake-hognose-grumpy.png)" 2>&1 | sed 's/^/   /'

# ── DOGS (17) ───────────────────────────────────────────────

# Beagle — keep sheltered/eating/sleeping/walking/grumpy; regen 4
for state in arriving growling scared sick; do
  i=$((i+1))
  case "$state" in
    arriving) pose="insecure/cautious arrival, sitting next to a worn folded knitted blanket (NOT a box) or an old squeaky toy, wide worried eyes, head tilted" ;;
    growling) pose="low warning pose: lips slightly raised showing small teeth, ears back, body tense. Kid-appropriate" ;;
    scared)   pose="low crouched, tail tucked, ears flat, wide worried eyes" ;;
    sick)     pose="lying down head on paws, droopy sad eyes, tail limp, unwell but recoverable. NO warping perspective" ;;
  esac
  echo "[$i/$total] dog-beagle-$state"
  "$SCRIPT" "$REGEN/dog-beagle-$state.png" \
    "$STYLE_BASE A young adult beagle (tri-colour: white, tan and black patches, classic beagle markings, long floppy ears, short smooth coat), chibi proportions matching reference set. NO COLLAR. $pose" \
    "$ASSETS/dog-beagle-sheltered.png" \
    "$ASSETS/dog-beagle-eating.png" \
    "$ASSETS/dog-beagle-walking.png" \
    "$ASSETS/dog-beagle-grumpy.png" 2>&1 | sed 's/^/   /'
done

i=$((i+1)); echo "[$i/$total] dog-chocolate-grumpy — actually grumpy not scared"
"$SCRIPT" "$REGEN/dog-chocolate-grumpy.png" \
  "$STYLE_BASE A young chocolate labrador (solid rich chocolate-brown coat, floppy ears, young adult — NOT aged). CRITICAL: must look GRUMPY, not scared. Classic lab sulk: lying down with chin on paws, big sad-disapproving amber eyes looking up with an unimpressed/annoyed expression, one eyebrow raised, ears slightly back. NOT a scared/fearful crouch — a sulking, judgemental pose. Chibi painterly style." \
  "$(pick dog-chocolate-sheltered.png)" \
  "$(pick dog-chocolate-eating.png)" \
  "$(pick dog-chocolate-sleeping.png)" 2>&1 | sed 's/^/   /'

i=$((i+1)); echo "[$i/$total] dog-collie-sleeping — transparent bg"
"$SCRIPT" "$REGEN/dog-collie-sleeping.png" \
  "$STYLE_BASE A young border collie (black-and-white rough coat: black head/back/ears, white blaze up forehead, white chest, white paws, white tail tip, amber eyes) curled up asleep peacefully, chibi proportions. CRITICAL: FULLY TRANSPARENT PNG BACKGROUND — no grass, no floor, no shadow, no scenery, just the dog on transparent background." \
  "$(pick dog-collie-sheltered.png)" \
  "$(pick dog-collie-eating.png)" \
  "$(pick dog-collie-arriving.png)" 2>&1 | sed 's/^/   /'

i=$((i+1)); echo "[$i/$total] dog-collie-walking — transparent bg"
"$SCRIPT" "$REGEN/dog-collie-walking.png" \
  "$STYLE_BASE A young border collie (black-and-white rough coat same as references — black head/back, white blaze, white chest/paws/tail-tip, amber eyes) mid-stride walking, HEAD FACING RIGHT, NO COLLAR. CRITICAL: FULLY TRANSPARENT PNG BACKGROUND — no grass, no floor, no shadow, no path, just the dog on transparent background." \
  "$(pick dog-collie-sheltered.png)" \
  "$(pick dog-collie-eating.png)" \
  "$(pick dog-collie-arriving.png)" 2>&1 | sed 's/^/   /'

i=$((i+1)); echo "[$i/$total] dog-terrier-grumpy — match set colour/face"
"$SCRIPT" "$REGEN/dog-terrier-grumpy.png" \
  "$STYLE_BASE A young jack russell terrier — MATCH the exact coat pattern, face shape, and colour of the terrier references in this batch (white body with tan patches, small compact frame, folded button ears, specific face structure from refs). Grumpy pose: sitting with a pouty-sulky expression, ears half-drooped, one eyebrow cocked, cheeky terrier sass. Chibi painterly style." \
  "$(pick dog-terrier-sheltered.png)" \
  "$(pick dog-terrier-eating.png)" \
  "$(pick dog-terrier-walking.png)" \
  "$(pick dog-terrier-arriving.png)" 2>&1 | sed 's/^/   /'

# Pug full 9-state redo
PUG_BASE="$STYLE_BASE A young chibi pug (fawn-tan coat with black mask on face, short pushed-in snub nose, curly tail, small compact stocky body, big round dark expressive eyes). NO COLLAR. Match chibi proportions of other good dogs in the references (golden retriever, dalmatian)."
PUG_REFS=(
  "$(pick dog-golden-sheltered.png)"
  "$(pick dog-golden-walking.png)"
  "$(pick dog-dalmatian-sheltered.png)"
)
for state in arriving sheltered eating sleeping walking growling grumpy scared sick; do
  i=$((i+1))
  case "$state" in
    arriving) pose="sitting insecurely HOLDING an old knitted blanket gently in its MOUTH (comfort object from home), wide worried eyes" ;;
    sheltered) pose="sitting content, classic pug loaf pose with front paws together, relaxed happy expression. NO objects" ;;
    eating)   pose="eating from a proportionate food bowl, focused" ;;
    sleeping) pose="curled up asleep, compact round ball, snub nose visible, snoring slightly" ;;
    walking)  pose="mid-stride walking, side view, HEAD FACING RIGHT, short legs in motion, curly tail up" ;;
    growling) pose="low warning pose with wrinkled snub muzzle, small teeth showing, ears back" ;;
    grumpy)   pose="grumpy pug sulk: sitting hunched with ears back, narrowed eyes, pouty pushed-in face — classic grumpy-pug energy" ;;
    scared)   pose="low crouched with tail tucked, bulging big dark eyes, ears flat" ;;
    sick)     pose="lying down head on paws, droopy sad dark eyes, ears limp, unwell but recoverable" ;;
  esac
  echo "[$i/$total] dog-pug-$state"
  "$SCRIPT" "$REGEN/dog-pug-$state.png" \
    "$PUG_BASE $pose" \
    "${PUG_REFS[@]}" 2>&1 | sed 's/^/   /'
done

# ── BIRDS (5 arriving) — re-compose branch entry from centre-bottom ──

bird_arriving() {
  local variant="$1"
  local breed="$2"
  i=$((i+1))
  echo "[$i/$total] parrot-$variant-arriving — branch entering from centre-bottom"
  local ref1="$(pick parrot-$variant-arriving.png)"
  local ref2="$(pick parrot-$variant-sheltered.png)"
  local ref3="$(pick parrot-$variant-eating.png)"
  "$SCRIPT" "$REGEN/parrot-$variant-arriving.png" \
    "$STYLE_BASE $breed Keep the BIRD'S BODY, expression, pose, proportions, and colouring EXACTLY as shown in the first reference image (parrot-$variant-arriving) — do not change the bird itself.

CRITICAL BRANCH LAYOUT: Replace/redraw the perch so the branch ENTERS THE FRAME FROM THE CENTRE OF THE BOTTOM EDGE of the image (not from a side edge). The branch rises up from the bottom-centre and then curves/forks so the bird can sit on it at a position matching where it currently is. The branch can:
- go diagonally up and curve left or right to form a perch, OR
- fork into two branches with the bird sitting in the V, OR
- have a natural bend/twist with the bird perched in the curve.

Whatever layout you choose, the branch MUST visually start at the centre of the bottom edge of the frame (this is critical for anchor consistency across all 5 bird arriving sprites). Transparent background everywhere else." \
    "$ref1" \
    "$ref2" \
    "$ref3" 2>&1 | sed 's/^/   /'
}

bird_arriving budgie     "A budgie (small parakeet, yellow-green body with black barring on wings/nape, bright blue cheek spots, small pale beak, dark eye)."
bird_arriving cockatiel  "A cockatiel (grey body, white wing bars, yellow face/head, orange cheek circles, tall yellow-and-grey crest, long grey tail)."
bird_arriving grey       "An African grey parrot (silvery-grey plumage, bright red tail, white bare facial patch with fine black feather-lines, pale yellow eye, dark curved beak)."
bird_arriving macaw      "A blue-and-yellow macaw (turquoise-blue back/wings/tail, golden-yellow chest/belly, green forehead, white bare face with fine black feather-lines, black beak)."
bird_arriving lovebird   "A peach-faced lovebird (green back/wings/rump, peach/orange face and throat, small pale beak, amber eye, plump round body)."

echo ""
echo "Done. $i sprites regenerated → $REGEN"
