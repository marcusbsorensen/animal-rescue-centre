#!/usr/bin/env bash
# regen-2026-08-29.sh — bring the last four mixed-fidelity characters up to 512px.
#
# Four characters ship with a mix of 512px art and surviving 128px originals, so
# the same animal changes fidelity as its state changes. This regenerates every
# remaining 128px pose, plus two corrections found while checking the sets.
#
#   dog-dalmatian  7  arriving eating growling grumpy scared sick sleeping
#                  1  playing      — correction: shipped sprite wears a collar
#   dog-beagle     5  eating grumpy sheltered sleeping walking
#   bunny-spotted  6  arriving eating grumpy scared sheltered sick
#   bunny-dutch    2  eating sleeping
#                  1  scared       — correction: off-pattern face (see below)
#   = 22 sprites, ~$0.92 at medium.
#
# dog-dalmatian-sheltered was generated separately as the pilot and is NOT
# regenerated here — see asset-drafts/char-refs/dog-dalmatian-sheltered-pilot-raw.png.
#
# Reference strategy is two-part per sprite: a POSE ANCHOR (a sibling variant at
# the same state, already 512px) fixes geometry and framing; a CHARACTER LOCK
# (the target's own good sprites) fixes identity. See docs/sprite-brief-2026-08-29.md.
#
# Lessons baked in from the pilot, do not quietly drop them:
#   - Dalmatian canon is the BOLD BLACK EYE PATCH (per dog-dalmatian-playing).
#     dog-dalmatian-walking has no patch and must never be used as a reference —
#     including it is what made the first pilot drop the patch entirely.
#   - State markings in VIEWER-relative terms. Dog-relative wording gets mirrored.
#   - bunny `playing` is bipedal by design across all seven variants. It is a
#     deliberate convention for that state, not drift — but it teaches the wrong
#     body plan, so it is never used as a character-lock reference.
#
# Output goes to regen-v3-sprites/ for review. Nothing touches live assets here;
# promote separately after review. Post-process with tools/frame-to-target.py.
#
# Usage: tools/regen-2026-08-29.sh [name ...]     (no args = all 22)
#        e.g. tools/regen-2026-08-29.sh dog-beagle-eating

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
REFS="$ROOT/asset-drafts/char-refs"
OUT="$ROOT/apps/game/public/admin/regen-v3-sprites"
SCRIPT="$ROOT/tools/gpt-image-regen.sh"
export GPT_IMAGE_QUALITY="${GPT_IMAGE_QUALITY:-medium}"
export GPT_IMAGE_MODEL="${GPT_IMAGE_MODEL:-gpt-image-1.5}"
export GPT_IMAGE_SIZE="${GPT_IMAGE_SIZE:-1024x1024}"

mkdir -p "$OUT"

style_base() {  # $1 = dog | bunny
  echo "Painterly children's-book illustration in chibi style (large rounded head about 45% of body, expressive large eyes, soft visible outlines, warm saturated palette). Transparent background, NO floor shadow, NO background scenery, single $1 centred. NOT photo-realistic, NOT anthropomorphised. NO watermarks, NO text, NO labels, NO colour swatches, NO multiple views — output ONE single $1 only. The FIRST reference image is the POSE ANCHOR: match its body geometry (body angle, leg and paw position, ear position, head direction) and its framing precisely. The REMAINING references are the CHARACTER: match that exact animal's face, colouring and markings."
}

dog_pose() {
  case "$1" in
    arriving)  echo "Insecure/cautious arrival, sitting next to a worn folded knitted blanket (NOT a box) or an old squeaky toy, wide worried eyes, head tilted." ;;
    eating)    echo "Head down at a full food bowl, tail up, content and absorbed. Facing 3/4 to camera-right." ;;
    growling)  echo "STANDING SQUARELY ON ALL FOUR LEGS, body level and tense, head forward and low, facing the viewer. Lips slightly raised showing small teeth, ears back. Kid-appropriate. CRITICAL: this is NOT a play-bow — do NOT lower the chest, do NOT raise the hindquarters, do NOT wag. The character reference images show a play-bow; copy their MARKINGS only, never their body geometry. The pose anchor is authoritative for the body." ;;
    grumpy)    echo "Sulking, NOT scared: lying with chin on paws, big disapproving eyes looking up, unimpressed expression, ears slightly back. NOT a fearful crouch." ;;
    playing)   echo "Play-bow: chest and front legs down, hindquarters and tail up, mouth open in a happy grin, all four paws on the ground. Energetic and joyful." ;;
    scared)    echo "Low crouched, tail tucked, ears flat, wide worried eyes." ;;
    sheltered) echo "Sitting upright and settled, content relaxed expression, facing 3/4 to camera-right. No props." ;;
    sick)      echo "Lying down head on paws, droopy sad eyes, tail limp, unwell but recoverable. NO warping perspective." ;;
    sleeping)  echo "Curled on its side asleep, eyes closed, body relaxed and low, peaceful. NO bed or cushion." ;;
    walking)   echo "Mid-stride, side view, HEAD FACING RIGHT, one front paw lifted. Playful energetic expression." ;;
    *) return 1 ;;
  esac
}

bunny_pose() {
  case "$1" in
    arriving)  echo "Bunny sitting on all fours, facing 3/4 to camera-right, looking insecure/uncertain with wide worried eyes, ears slightly back. Next to a folded soft chunky knitted BLANKET (NOT a box, NOT a gift), proportionately sized." ;;
    eating)    echo "Bunny sitting up on haunches with front paws in a neutral bunny position, nibbling a small piece of food (carrot, lettuce or pellet). Facing 3/4 to camera-right." ;;
    grumpy)    echo "Bunny sitting with ears half-back, narrowed eyes, small frown, sulky. All four paws on the ground. NO arms akimbo, NO standing on hind legs, NO human postures, NO scarves." ;;
    scared)    echo "Bunny crouched low, body pressed to the ground, ears FLAT against the back, wide frightened eyes, tail tucked. Genuine fear posture. All four paws down." ;;
    sheltered) echo "Bunny in a classic loaf-sitting pose, content expression, facing 3/4 to camera-right. NO objects, NO props." ;;
    sick)      echo "Bunny lying on its side or belly, head low, half-closed sad eyes, droopy ears. Unwell but recoverable — pitiful, not scary. NO bed or cushion underneath." ;;
    sleeping)  echo "Bunny curled up asleep with eyes closed, body low, ears flat against the back, peaceful. No bed." ;;
    *) return 1 ;;
  esac
}

# Character description + any identity-critical clauses.
character() {
  case "$1" in
    dog-dalmatian) echo "A YOUNG dalmatian, pure white coat with distinctive black spots all over the body and head, floppy ears, bright brown eyes, puppy-to-young-adult age (NOT an older dog).

CRITICAL IDENTITY FEATURES — copy these EXACTLY from the close-up reference, they are the character's signature:
1. A BOLD, LARGE, FULLY SOLID BLACK PATCH covering the whole area around the eye on the VIEWER'S LEFT side of the face, reaching from above the brow, around the entire eye, and down onto the cheek. A big solid block of pure black, like a pirate eye-patch. NOT a thin ring, NOT soft shading, NOT grey.
2. The opposite floppy ear (VIEWER'S RIGHT) is SOLID PURE BLACK, fully filled.
Both markings are pure black, never brown. Ignore any brown colouring in the character sheet." ;;
    dog-beagle) echo "A young adult beagle (tri-colour: chestnut-tan head with a WHITE BLAZE up the muzzle and forehead, BLACK SADDLE over the back, white chest, white paws and white tail tip, long floppy chestnut ears, short smooth coat), chibi proportions matching the reference set." ;;
    bunny-spotted) echo "A SPOTTED bunny with a WHITE base coat and SCATTERED DARK BROWN spots all over the body and head, brown-tipped upright ears. CRITICAL: the body must be PLUMP, ROUND AND CHUBBY to match the rest of the set — NOT slim, NOT athletic, NOT leggy." ;;
    bunny-dutch) echo "A DUTCH bunny with the classic Dutch pattern: a BLACK head with a clean WHITE BLAZE running up the centre of the forehead between the eyes, WHITE saddle around the shoulders and chest, BLACK from the back and flanks through the hindquarters, WHITE paws, upright BLACK ears. CRITICAL: the face is BLACK with a WHITE central blaze — do NOT draw a white face with black patches around the eyes." ;;
    *) return 1 ;;
  esac
}

# Job list: <species>-<variant>:<state>:<pose-anchor-basename>
JOBS=(
  # dog-dalmatian — sheltered already done as the pilot
  "dog-dalmatian:arriving:dog-golden-arriving.png"
  "dog-dalmatian:eating:dog-golden-eating.png"
  "dog-dalmatian:growling:dog-golden-growling.png"
  "dog-dalmatian:grumpy:dog-golden-grumpy.png"
  "dog-dalmatian:scared:dog-golden-scared.png"
  "dog-dalmatian:sick:dog-golden-sick.png"
  "dog-dalmatian:sleeping:dog-golden-sleeping.png"
  "dog-dalmatian:playing:dog-dalmatian-playing.png"      # collar correction
  # dog-beagle
  "dog-beagle:eating:dog-golden-eating.png"
  "dog-beagle:grumpy:dog-golden-grumpy.png"
  "dog-beagle:sheltered:dog-golden-sheltered.png"
  "dog-beagle:sleeping:dog-golden-sleeping.png"
  "dog-beagle:walking:dog-golden-walking.png"
  # bunny-spotted
  "bunny-spotted:arriving:bunny-arctic-arriving.png"
  "bunny-spotted:eating:bunny-arctic-eating.png"
  "bunny-spotted:grumpy:bunny-arctic-grumpy.png"
  "bunny-spotted:scared:bunny-arctic-scared.png"
  "bunny-spotted:sheltered:bunny-dutch-sheltered.png"
  "bunny-spotted:sick:bunny-arctic-sick.png"
  # bunny-dutch
  "bunny-dutch:eating:bunny-arctic-eating.png"
  "bunny-dutch:sleeping:bunny-lionhead-sleeping.png"
  "bunny-dutch:scared:bunny-arctic-scared.png"           # off-pattern correction
)

# Character-lock references, in order. Deliberate exclusions are documented at
# the top of this file — do not add dog-dalmatian-walking or any bunny playing.
char_refs() {
  case "$1" in
    dog-dalmatian) echo "$ASSETS/dog-dalmatian-playing.png
$REFS/dog-dalmatian-face.png
$REFS/dog-dalmatian-pongo-sheet.png" ;;
    dog-beagle) echo "$ASSETS/dog-beagle-arriving.png
$ASSETS/dog-beagle-growling.png
$ASSETS/dog-beagle-playing.png" ;;
    bunny-spotted) echo "$ASSETS/bunny-spotted-growling.png
$ASSETS/bunny-spotted-walking.png
$ASSETS/bunny-spotted-sleeping.png" ;;
    bunny-dutch) echo "$ASSETS/bunny-dutch-sheltered.png
$ASSETS/bunny-dutch-walking.png
$ASSETS/bunny-dutch-arriving.png" ;;
    *) return 1 ;;
  esac
}

WANTED=("$@")
want() {
  [ "${#WANTED[@]}" -eq 0 ] && return 0
  for w in "${WANTED[@]}"; do [ "$w" = "$1" ] && return 0; done
  return 1
}

i=0; ok=0; failed=()
for job in "${JOBS[@]}"; do
  IFS=':' read -r char state anchor_name <<< "$job"
  name="$char-$state"
  want "$name" || continue
  i=$((i+1))

  species="${char%%-*}"
  anchor="$ASSETS/$anchor_name"
  if [ ! -f "$anchor" ]; then
    echo "[$i] $name — POSE ANCHOR MISSING ($anchor_name), skipping" >&2
    failed+=("$name (missing anchor)"); continue
  fi

  if [ "$species" = "dog" ]; then pose=$(dog_pose "$state"); else pose=$(bunny_pose "$state"); fi
  prompt="$(style_base "$species")

$(character "$char")

Pose (state = $state): $pose
NO COLLAR, no leash, no accessories. No props beyond any named in the pose.
NO CAST SHADOW: the area beneath the animal is FULLY TRANSPARENT. Do not paint a grey ellipse, a soft smudge, or any contact shadow under the body or paws — the whole shipped set is shadowless and the game composites these over different surfaces."

  refs=("$anchor")
  while IFS= read -r r; do [ -n "$r" ] && refs+=("$r"); done < <(char_refs "$char")

  echo "[$i] $name  (anchor=${anchor_name%.png}, ${#refs[@]} refs)"
  if "$SCRIPT" "$OUT/$name.png" "$prompt" "${refs[@]}" 2>&1 | sed 's/^/   /'; then
    ok=$((ok+1))
  else
    failed+=("$name")
  fi
done

echo ""
echo "Generated $ok/$i → $OUT"
if [ "${#failed[@]}" -gt 0 ]; then
  echo "FAILED (${#failed[@]}): ${failed[*]}" >&2
  exit 1
fi
