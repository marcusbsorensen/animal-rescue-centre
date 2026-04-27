#!/usr/bin/env bash
# Generate the 10th "playing" pose for every breed variant.
# Each species has a signature play-body-language:
#   cat    → pounce crouch with tail stiff, pupils dilated
#   dog    → play bow (front low, rear high, tongue out)
#   fox    → play slink (low forward stretch, mischievous)
#   bunny  → mid-binky (airborne twist of joy)
#   bat    → playful upside-down wing-flare
#   parrot → head cocked sideways + wings flared + foot raised
#   snake  → loose exploring S-curve, tongue flicking curious
#
# Uses per-variant accepted sprites as character refs so markings stay true.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
REGEN="$ROOT/apps/game/public/admin/regen-v3-sprites"
SCRIPT="$ROOT/tools/gpt-image-regen.sh"
export GPT_IMAGE_QUALITY=medium
export GPT_IMAGE_MODEL=gpt-image-1.5

STYLE="Painterly children's-book illustration in chibi style (large rounded head about 45% of body, expressive large eyes, soft visible outlines, warm saturated palette). Transparent PNG background, NO floor shadow, NO background. NOT photo-realistic, NOT fuzzy, NOT cartoon-flat. Match the hand-painted style of the reference images exactly. Every reference shows the same individual animal in a different state — character details (fur colour, markings, face shape, ear size, proportions) must be preserved in this new PLAYING pose."

# Species-wide play pose descriptions
pose_for_species() {
  case "$1" in
    cat)    echo "CAT PLAY POUNCE — low crouch body pressed close to the ground, rear end raised slightly, back legs tensed ready to spring, tail held high and stiff pointing straight up with a slight quiver, pupils huge and dilated (round black eyes), ears forward-alert, mouth closed in concentration, staring intently ahead. The universal 'I'm hunting you' playful pounce pose." ;;
    dog)    echo "DOG PLAY BOW — the classic 'let's play!' posture: front paws and chest lowered FLAT to the ground, rear end and tail raised HIGH in the air, tail wagging enthusiastically, big bright excited eyes looking forward, tongue LOLLING OUT in a happy open-mouth grin, ears perked forward. Facing 3/4 to camera-right." ;;
    fox)    echo "FOX PLAY SLINK — body stretched LOW and FORWARD hugging the ground, front paws spread wide, ears pricked forward, one front paw raised in a half-step, tail held low-but-fluffy, mischievous slightly smug look on the face (slight grin, one eye glinting). The sneaky-playful fox pose." ;;
    bunny)  echo "BUNNY BINKY — captured MID-AIR in a signature binky jump: body airborne above the ground, all four legs splayed out in different directions, body slightly TWISTED mid-turn, ears flopping mid-motion, eyes bright and wide with pure joy, small smile visible. A bunny expressing maximum happiness through its whole-body leap." ;;
    bat)    echo "BAT PLAYFUL HANG — hanging upside-down from a perch but in a playful pose: wings SPREAD WIDE upward/outward in a show of excitement, small open-mouthed grin showing tiny happy teeth, bright sparkling eyes, one foot raised as if waving/saying hi. Playful and friendly." ;;
    parrot) echo "PARROT PLAY POSE — head COCKED SIDEWAYS curiously, wings partially FLARED OUT in a 'look at me!' display, one foot raised and toes curled, beak slightly open as if chatting/whistling, bright eye sparkle. Inviting and showy." ;;
    snake)  echo "SNAKE CURIOUS EXPLORING — body in a LOOSE OPEN S-CURVE on the ground (NOT coiled tight, NOT defensive), head raised slightly off the ground in gentle curiosity, pink tongue flicking out to taste the air, bright alert eye, relaxed body language. The curious-happy snake pose — inviting interaction, NOT threatening." ;;
    *) echo "UNKNOWN" >&2; return 1 ;;
  esac
}

# Pick up to 4 character refs for this variant, preferring its accepted states
pick_refs() {
  local species="$1"
  local variant="$2"
  local refs=()
  for state in sheltered eating walking sleeping arriving scared grumpy sick; do
    local f="$ASSETS/${species}-${variant}-${state}.png"
    [ -f "$f" ] && refs+=("$f")
    [ "${#refs[@]}" -ge 4 ] && break
  done
  printf '%s\n' "${refs[@]}"
}

# All 43 remaining variants (golden retriever handled separately)
VARIANTS=(
  cat:ginger cat:black cat:calico cat:grey cat:siamese cat:white cat:tuxedo cat:tortie
  dog:dalmatian dog:chocolate dog:beagle dog:husky dog:pug dog:collie dog:terrier
  fox:red fox:arctic fox:silver fox:cross fox:marble fox:fennec
  bunny:dutch bunny:lop bunny:lionhead bunny:rex bunny:angora bunny:spotted bunny:arctic
  bat:brown bat:fruit bat:longeared bat:pipistrelle bat:white
  parrot:budgie parrot:cockatiel parrot:grey parrot:macaw parrot:lovebird
  snake:corn snake:python snake:king snake:garter snake:hognose
)

i=0
total=${#VARIANTS[@]}
for pair in "${VARIANTS[@]}"; do
  i=$((i+1))
  species="${pair%%:*}"
  variant="${pair##*:}"
  pose=$(pose_for_species "$species")
  out="$REGEN/${species}-${variant}-playing.png"
  refs=()
  while IFS= read -r r; do refs+=("$r"); done < <(pick_refs "$species" "$variant")
  if [ "${#refs[@]}" -eq 0 ]; then
    echo "[$i/$total] ${species}-${variant}-playing: no refs, skipping" >&2
    continue
  fi
  echo "[$i/$total] ${species}-${variant}-playing  (${#refs[@]} refs)"
  "$SCRIPT" "$out" "$STYLE $pose" "${refs[@]}" 2>&1 | sed 's/^/   /'
done

echo ""
echo "Done — $i playing-pose sprites written to $REGEN"
