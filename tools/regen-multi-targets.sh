#!/usr/bin/env bash
# regen-multi-targets.sh — cross-species targeted fix batch
#   - 2 bunny fixes (dutch-sick, angora-growling)
#   - 3 fox fixes (arctic-arriving crop; cross + marble crates → blankets)
#   - 1 dog fix (dalmatian-walking: younger, no collar)
#   - 9 macaw sprites (full redo — more expressive face/beak/wings)
#   - 9 hognose sprites (full redo with varied body postures)

# Don't use -e so one bad reference doesn't kill the whole batch
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
REGEN="$ROOT/apps/game/public/admin/regen-v3-sprites"
SCRIPT="$ROOT/tools/gpt-image-regen.sh"
export GPT_IMAGE_QUALITY="${GPT_IMAGE_QUALITY:-medium}"
export GPT_IMAGE_MODEL="${GPT_IMAGE_MODEL:-gpt-image-1.5}"

STYLE_BASE="Painterly children's-book illustration in chibi style (large rounded head about 45% of body, expressive large eyes, soft visible outlines, warm saturated palette). Transparent PNG background, NO floor shadow, NO background scenery. NOT photo-realistic, NOT anthropomorphised. NO watermarks, NO text. Match the style and proportions of the reference images exactly."

# ── BUNNY FIXES ───────────────────────────────────────────────

echo "[1/24] bunny-dutch-sick — chibi style, not photorealistic"
tools/gpt-image-regen.sh \
  "$REGEN/bunny-dutch-sick.png" \
  "$STYLE_BASE A Dutch bunny with black-and-white markings (white blaze up forehead, white saddle around shoulders/front body, black back/flanks/hindquarters, white paws, upright ears), lying down sadly on its side or belly, head low, half-closed sad eyes, droopy ears. Unwell but recoverable. NO bed, NO cushion. Must be in the same chibi painterly style as the reference images." \
  "$ASSETS/bunny-dutch-sheltered.png" \
  "$ASSETS/bunny-dutch-eating.png" \
  "$ASSETS/bunny-arctic-sick.png" 2>&1 | sed 's/^/   /'

echo "[2/24] bunny-angora-growling — chibi style"
tools/gpt-image-regen.sh \
  "$REGEN/bunny-angora-growling.png" \
  "$STYLE_BASE An ANGORA bunny with EXTREMELY LONG FLUFFY HAIR covering the entire body like a cloud of soft wool (distinctive sheep-like puffy coat), short ears peeking through fluff, cream or light-grey, very round silhouette. Defensive pose: body low and tense, ears flat back, small teeth bared slightly (kid-appropriate warning). NO human gestures. Chibi painterly style matching references." \
  "$REGEN/bunny-angora-sheltered.png" \
  "$REGEN/bunny-angora-eating.png" \
  "$ASSETS/bunny-spotted-growling.png" \
  "$ASSETS/bunny-arctic-walking.png" 2>&1 | sed 's/^/   /'

# ── FOX FIXES ─────────────────────────────────────────────────

echo "[3/24] fox-arctic-arriving — fully visible crate, not cropped"
tools/gpt-image-regen.sh \
  "$REGEN/fox-arctic-arriving.png" \
  "$STYLE_BASE An arctic fox (pure white with slight cream shading, thick fluffy winter coat, rounder shorter ears, dark eyes and nose, fluffy curled tail), sitting next to a worn wooden or cardboard pet crate. CRITICAL: the CRATE MUST BE FULLY VISIBLE AND CENTRED IN THE COMPOSITION — do NOT crop it off any edge. Arctic fox looking insecure/uncertain, wide worried eyes, ears slightly back. Crate proportionate to the fox — fox could fit inside." \
  "$ASSETS/fox-arctic-sheltered.png" \
  "$ASSETS/fox-arctic-eating.png" \
  "$ASSETS/fox-arctic-walking.png" 2>&1 | sed 's/^/   /'

echo "[4/24] fox-cross-arriving — worn tartan blanket (not crate)"
tools/gpt-image-regen.sh \
  "$REGEN/fox-cross-arriving.png" \
  "$STYLE_BASE A cross fox (red-orange body, DARK BROWN stripe down forehead and spine crossing with stripe across shoulders forming a 'cross', white chest, white tail tip, classic fox build), sitting insecurely next to a WORN OLD TARTAN BLANKET (traditional red/green plaid, slightly rumpled, proportionately small enough that the fox is the main focus — NOT a crate, NOT a big box). Wide worried eyes, ears slightly back. The fox could HOLD PART OF THE BLANKET GENTLY IN ITS MOUTH like bringing a comfort object from home." \
  "$REGEN/fox-cross-sheltered.png" \
  "$REGEN/fox-cross-eating.png" \
  "$REGEN/fox-cross-walking.png" 2>&1 | sed 's/^/   /'

echo "[5/24] fox-marble-arriving — worn knitted blanket (different from cross)"
tools/gpt-image-regen.sh \
  "$REGEN/fox-marble-arriving.png" \
  "$STYLE_BASE A marble fox (pale cream/white base with irregular grey-black marbling patches on head/back/tail, dark 'bandit mask' around eyes, fluffy bushy marbled tail), sitting insecurely next to a WORN CHUNKY-KNIT BLANKET in stone-grey and cream stripes, slightly rumpled and proportionately small (NOT a crate, NOT a big box — the fox is the focal point). Wide worried eyes, ears slightly back. Dark facial mask clearly visible." \
  "$REGEN/fox-marble-sheltered.png" \
  "$REGEN/fox-marble-walking.png" \
  "$REGEN/fox-marble-scared.png" 2>&1 | sed 's/^/   /'

# ── DOG FIX ───────────────────────────────────────────────────

echo "[6/24] dog-dalmatian-walking — younger, NO collar"
tools/gpt-image-regen.sh \
  "$REGEN/dog-dalmatian-walking.png" \
  "$STYLE_BASE A YOUNG dalmatian dog (white coat with distinctive black spots all over, floppy ears, bright eyes, no greying — puppy-to-young-adult age, NOT an older dog). Mid-stride walking pose, side view, HEAD FACING RIGHT, one front paw lifted. NO COLLAR (player adds collars in-game). No leash, no accessories. Chibi proportions matching the reference images. Playful energetic expression." \
  "$ASSETS/dog-dalmatian-sheltered.png" \
  "$ASSETS/dog-dalmatian-eating.png" \
  "$ASSETS/dog-golden-walking.png" 2>&1 | sed 's/^/   /'

# ── MACAW FULL REDO — more expressive face/beak/wings ────────

echo "─── Macaw full 9-state redo (more expressive) ───"
MACAW_BASE="$STYLE_BASE Blue-and-yellow macaw (Ara ararauna): BRIGHT TURQUOISE-BLUE back/wings/tail, BRIGHT YELLOW chest/belly, green forehead, white bare facial patch with fine black feather-line striations, BLACK beak, young adult. CRITICAL: the face, beak, and wings must be HIGHLY EXPRESSIVE to clearly communicate the emotional/activity state — not a blank neutral pose. Use beak-open/closed, eye-shape, wing-position, body-tilt to read the state at a glance. NO red feathers anywhere."

MACAW_REFS_STYLE=(
  "$ASSETS/parrot-macaw-eating.png"
  "$ASSETS/parrot-macaw-sleeping.png"
  "$ASSETS/parrot-macaw-grumpy.png"
)

echo "[7/24] parrot-macaw-arriving — cautious, expressive worry"
tools/gpt-image-regen.sh "$REGEN/parrot-macaw-arriving.png" \
  "$MACAW_BASE State: ARRIVING — clearly looking INSECURE/NERVOUS/WORRIED. Eyes wide and slightly droopy, beak partly open in a small anxious vocalisation, wings pulled tightly against body for comfort, head tilted slightly, perched on a small worn wooden perch or beside a proportionate blanket (NOT a gift-like box). Body posture slightly crouched." \
  "${MACAW_REFS_STYLE[@]}" 2>&1 | sed 's/^/   /'

echo "[8/24] parrot-macaw-sheltered — content, relaxed"
tools/gpt-image-regen.sh "$REGEN/parrot-macaw-sheltered.png" \
  "$MACAW_BASE State: SHELTERED — clearly looking CONTENT/RELAXED. Eyes half-closed and peaceful, beak closed in a neutral soft expression, wings tucked neatly, feathers fluffed slightly, sitting upright proudly. NO objects." \
  "${MACAW_REFS_STYLE[@]}" 2>&1 | sed 's/^/   /'

echo "[9/24] parrot-macaw-eating — focused, enjoying food"
tools/gpt-image-regen.sh "$REGEN/parrot-macaw-eating.png" \
  "$MACAW_BASE State: EATING — clearly FOCUSED AND ENJOYING. One foot raised holding a nut/fruit, beak open reaching/nibbling the food, eye bright with interest, head bent toward food, wings steady at sides." \
  "${MACAW_REFS_STYLE[@]}" 2>&1 | sed 's/^/   /'

echo "[10/24] parrot-macaw-sleeping — deeply asleep"
tools/gpt-image-regen.sh "$REGEN/parrot-macaw-sleeping.png" \
  "$MACAW_BASE State: SLEEPING — clearly DEEPLY ASLEEP. Standing on ONE foot (classic parrot sleep stance), head turned back and tucked INTO back feathers, eye fully closed, beak hidden, feathers fluffed for warmth. Peaceful." \
  "${MACAW_REFS_STYLE[@]}" 2>&1 | sed 's/^/   /'

echo "[11/24] parrot-macaw-walking (=flying) — dynamic mid-flight"
tools/gpt-image-regen.sh "$REGEN/parrot-macaw-walking.png" \
  "$MACAW_BASE State: WALKING (for birds = FLYING). Mid-flight pose with wings SPREAD WIDE showing yellow underwing + blue top, long tail trailing behind, head facing RIGHT with focused alert eye, beak closed in determined flight. Dynamic and cheerful — a bird clearly in its element." \
  "${MACAW_REFS_STYLE[@]}" 2>&1 | sed 's/^/   /'

echo "[12/24] parrot-macaw-growling — expressive warning"
tools/gpt-image-regen.sh "$REGEN/parrot-macaw-growling.png" \
  "$MACAW_BASE State: GROWLING — clearly in a WARNING display. Feathers PUFFED UP making the body look bigger, wings slightly SPREAD for threat, beak WIDE OPEN in a squawk with pink tongue visible, eyes FIERCE and narrowed, body leaning forward aggressively. Kid-appropriate but unmistakably a bird saying 'back off'." \
  "${MACAW_REFS_STYLE[@]}" 2>&1 | sed 's/^/   /'

echo "[13/24] parrot-macaw-grumpy — expressive sulk"
tools/gpt-image-regen.sh "$REGEN/parrot-macaw-grumpy.png" \
  "$MACAW_BASE State: GRUMPY — clearly SULKING. Feathers slightly ruffled, beak turned DOWN in a tight closed frown, eye NARROWED looking sideways with one eyebrow-like feather lifted (judgemental side-eye), head turned away slightly, body hunched." \
  "${MACAW_REFS_STYLE[@]}" 2>&1 | sed 's/^/   /'

echo "[14/24] parrot-macaw-scared — expressive fear"
tools/gpt-image-regen.sh "$REGEN/parrot-macaw-scared.png" \
  "$MACAW_BASE State: SCARED — clearly FRIGHTENED. Body PRESSED LOW AND SLEEK (feathers flattened tight against body, not fluffed), wings tight against body, eyes WIDE OPEN AND HUGE with visible whites, beak slightly open in a nervous gasp, head slightly ducked. Real palpable fear." \
  "${MACAW_REFS_STYLE[@]}" 2>&1 | sed 's/^/   /'

echo "[15/24] parrot-macaw-sick — expressive pitiful illness"
tools/gpt-image-regen.sh "$REGEN/parrot-macaw-sick.png" \
  "$MACAW_BASE State: SICK — clearly UNWELL AND PITIFUL. Young adult (NOT old-man face!). Feathers fluffed and slightly messy, eyes half-closed and sleepy-sad, beak tilted down with a small droop, head low and drooping, body hunched on perch, wings loose at sides. Looks poorly but recoverable." \
  "${MACAW_REFS_STYLE[@]}" 2>&1 | sed 's/^/   /'

# ── HOGNOSE FULL REDO — varied body postures per state ───────

echo "─── Hognose full 9-state redo (varied postures) ───"
HOG_BASE="$STYLE_BASE Hognose snake: sandy-tan base with darker brown saddle blotches, distinctive UPTURNED PIG-LIKE SNOUT (signature feature), dark eyes, medium body proportions (not too fat, not too slim). CRITICAL: each state must have a DISTINCTIVE BODY POSTURE, not just a face-expression change — the whole snake shape and coil differs per state. Chibi painterly style matching the reference."

HOG_REFS=(
  "$ASSETS/snake-hognose-arriving.png"
  "$ASSETS/snake-hognose-grumpy.png"
)

echo "[16/24] snake-hognose-arriving (keeping existing accepted one — skipping)"

echo "[17/24] snake-hognose-sheltered — relaxed open coil"
tools/gpt-image-regen.sh "$REGEN/snake-hognose-sheltered.png" \
  "$HOG_BASE State: SHELTERED — body in a RELAXED OPEN COIL, head resting ON TOP OF one of the coils looking sleepy-content. Upturned snout visible. Very different body-posture from arriving/grumpy." \
  "${HOG_REFS[@]}" 2>&1 | sed 's/^/   /'

echo "[18/24] snake-hognose-eating — S-curve with head reaching food"
tools/gpt-image-regen.sh "$REGEN/snake-hognose-eating.png" \
  "$HOG_BASE State: EATING — body in an ELONGATED S-CURVE, head stretched forward with upturned snout reaching a small prey item or food pellet, mouth slightly open. Body posture clearly different from arriving/grumpy." \
  "${HOG_REFS[@]}" 2>&1 | sed 's/^/   /'

echo "[19/24] snake-hognose-sleeping — tight neat coil"
tools/gpt-image-regen.sh "$REGEN/snake-hognose-sleeping.png" \
  "$HOG_BASE State: SLEEPING — body in a TIGHT NEAT SPIRAL COIL, head nestled into the centre of the coils, eyes closed, very peaceful. Body forms a near-circular compact shape." \
  "${HOG_REFS[@]}" 2>&1 | sed 's/^/   /'

echo "[20/24] snake-hognose-walking — slithering S-curve moving right"
tools/gpt-image-regen.sh "$REGEN/snake-hognose-walking.png" \
  "$HOG_BASE State: WALKING (snakes SLITHER). Body in a wide S-CURVE moving horizontally across the frame, head forward facing RIGHT with upturned snout, tongue flicking out, dynamic motion. Body posture clearly different from the other states." \
  "${HOG_REFS[@]}" 2>&1 | sed 's/^/   /'

echo "[21/24] snake-hognose-growling — signature 'cobra bluff' pose"
tools/gpt-image-regen.sh "$REGEN/snake-hognose-growling.png" \
  "$HOG_BASE State: GROWLING — the DISTINCTIVE HOGNOSE DEFENSIVE BLUFF POSE: body in a loose defensive coil, HEAD AND NECK RAISED HIGH AND FLATTENED like a tiny cobra hood, mouth open showing pink tongue, eyes fierce. Kid-appropriate. Dramatic body shape very different from other states." \
  "${HOG_REFS[@]}" 2>&1 | sed 's/^/   /'

echo "[22/24] snake-hognose-grumpy (keeping existing accepted one — skipping)"

echo "[23/24] snake-hognose-scared — 'playing dead' belly-up"
tools/gpt-image-regen.sh "$REGEN/snake-hognose-scared.png" \
  "$HOG_BASE State: SCARED — the HOGNOSE'S FAMOUS 'PLAYING DEAD' DEFENSIVE POSE. Body flopped on its BACK with belly exposed upward, tongue hanging out, coils loose and untidy. A unique hognose behaviour — different body posture from all other states. Kid-amusing rather than scary." \
  "${HOG_REFS[@]}" 2>&1 | sed 's/^/   /'

echo "[24/24] snake-hognose-sick — slack stretched-out body"
tools/gpt-image-regen.sh "$REGEN/snake-hognose-sick.png" \
  "$HOG_BASE State: SICK — body SLACK AND STRETCHED-OUT in a loose wavy line (not coiled), head drooping low to the ground, eyes half-closed, upturned snout visible but droopy. Body posture clearly different from sleeping (which is coiled) and arriving." \
  "${HOG_REFS[@]}" 2>&1 | sed 's/^/   /'

echo ""
echo "Done. 22 sprites regenerated (2 hognose skipped as already good) → $REGEN"
