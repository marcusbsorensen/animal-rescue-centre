#!/usr/bin/env bash
# Regenerate 30 adopter-household walking-pose sprites (wave-1) via gpt-image-regen.sh.
# 10 signature households × 3 poses (front-walking, side-walking, waving).
# Skip-if-exists guard: reruns are free.
set -uo pipefail
# NOTE: deliberately NOT using -e so a moderation-block on one sprite doesn't
# abort the entire batch. Each failed sprite is logged + tallied at the end.
FAILED=()

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGEN="$ROOT/tools/gpt-image-regen.sh"
CAST="$ROOT/apps/game/public/admin/scene-assets/cast"
VAR="$CAST/variants"
WORKDIR="$ROOT/manus-output/cast-walking-poses/adopters-wave-1-gpt"
STAGE="$CAST/adopters-walking"

mkdir -p "$WORKDIR" "$STAGE"

STYLE='Painted watercolour storybook matching the in-game cast portraits exactly. Reference treatment: Julia Donaldson / Raymond Briggs / Aardman-adjacent illustration. Small realistic eyes set into soft painted faces. Warm ink outlines, soft colour washes, painted imperfections. Natural human proportions even for child characters — NOT chibi, NOT big-headed.

BLOCKLIST (do not render any of these, will be rejected): anime · manga · chibi · big-eyed kawaii · vector flat-shading · cel-shading · photorealism · 3D · cartoon-sweet / Disney / Pixar / generic children'"'"'s-cartoon faces.

The face treatment matters most: small eyes, understated expression, painted softly like a children'"'"'s-picture-book illustrator would — NOT big-eyed anime.'

SHARED='1024×1024 PNG, transparent background. ≥10% clearance above the tallest head and below the lowest feet. Full body (head to feet). NO painted pavement / road / zebra crossing / kerb / grass / tarmac / cobbles / any ground context — only a small soft-edged oval cast shadow directly beneath the feet; everything else beneath the shadow is fully transparent. Wardrobe MUST be identical across this household'"'"'s 3 poses — same colours, same details, same accessories.'

POSE_FRONT='POSE: Front-facing, mid-stride, one leg forward, arms relaxed and natural, walking toward the viewer. Groups walk side-by-side. Keep expressions warm and natural.'
POSE_SIDE='POSE: Profile facing screen-right, mid-stride, one arm forward + one back, one leg forward + one back. Groups walk in a line/row from the side. Wardrobe IDENTICAL to the front pose — same colours, same patterns, same painted details. No drift.'
POSE_WAVE='POSE: Front-facing, standing still. At least ONE member waves with a big smile; others smile warmly. Wardrobe IDENTICAL to front pose.'

# Character descriptions per household
PRIYA='CHARACTER: Pri Kaur — 32, British-South-Asian woman, warm brown skin, soft painted face, calm friendly expression. She is seated in a manual wheelchair in all 3 poses; in the front and side "walking" poses she is rolling her wheelchair forward; in the side pose her wheelchair is in profile moving screen-right. Signature: teal headscarf wrapped around her head, soft neutral cardigan, laptop bag slung over the side of her wheelchair.'

FINN='CHARACTER: Finn — a young man in his late 20s, a keen runner, pale freckled skin, short ginger hair, lean athletic build, friendly cheerful expression. Wardrobe (IDENTICAL across 3 poses): bright running kit — neon-yellow technical tee, knee-length black running shorts, mud-spattered white trainers, small running watch on left wrist. DOG: an energetic medium brown-and-white dog (collie-mix) at his side in ALL 3 poses — trotting beside him in the walking poses, sitting next to his leg in the waving pose.'

WALKERS='CHARACTERS: Chris & Jamie Walker — two men, a couple, both he/him. Chris: broad-shouldered white carpenter, stubble, a yellow pencil tucked behind his right ear, plaid work-shirt with sleeves rolled up, brown work trousers, sturdy tan work boots. Jamie: noticeably SHORTER than Chris, warm-toned skin, calm quiet demeanour, wearing a sage-green henley, dark jeans, grey trainers, a simple leather watch. Identical wardrobe across all 3 poses. They walk/stand side-by-side in each pose, comfortable with each other.'

KUMAR_ISHII='CHARACTERS: A warm family group of three in a children'"'"'s picture-book illustration — two mothers and their young daughter on a cheerful family outing. Dr. Ishii (one mum, about 50, Japanese-British woman, black hair in a low bun, light-teal hospital scrubs with a stethoscope around her neck, white trainers — she is a vet). Priti (the other mum, about 48, British-Indian woman, warm brown skin, shoulder-length dark hair, soft plum cardigan over a cream blouse, navy trousers, flat brown shoes, a small notebook tucked in her cardigan pocket). Amara (their daughter, about 9, warm brown skin, curly dark hair with a yellow headband, light-blue short-sleeve tee, olive-green cargo shorts, red low-top sneakers, a couple of small leaf fragments caught in her hair and painted mud smudges on her knees from climbing trees). Identical wardrobe across all 3 poses. The three walk side-by-side in a loving family group, Amara between her two mums.'

THEO_GRANDKIDS='CHARACTERS: A warm multigenerational family group of three in a children'"'"'s storybook illustration — a grandfather and his two young grandchildren on a cheerful family outing. Grandpa Theo (about 70, Black British man, short grey hair, warm lined face with a gentle fatherly smile, corduroy trousers in warm tan, a soft olive-green cardigan over a cream shirt, brown leather shoes, a wooden pipe tucked in his cardigan pocket). Kofi (the elder grandchild, about 10, warm brown skin, short dark hair, round dark-framed glasses PRESERVED, pale-blue knit jumper, mustard-yellow shorts, white trainers). Zuri (the younger grandchild, about 7, warm brown skin, two small puffs of dark curly hair, a coral-pink dress with small white flowers, green leggings, white sneakers, and a colourful paper butterfly-wings backpack strapped to her back). Identical wardrobe across 3 poses. In the walking poses the grandfather warmly holds the nearest grandchild'"'"'s hand — a sweet storybook family moment.'

BENJI='CHARACTER: Benji — a cheerful nature-loving child nature-club member (about 10 years old), pale freckled skin, sandy-brown tousled hair, gentle warm smile (shy but friendly). Wardrobe (IDENTICAL across 3 poses): a forest-green field jacket over a cream tee, brown cargo trousers, sturdy hiking boots, a small canvas satchel over one shoulder for his nature-spotting notebook. Family-friendly storybook child character in a children'"'"'s picture book style.'

WIRI_HARPER='CHARACTERS: Wiri and Harper — a warm adult couple in a children'"'"'s storybook illustration. Wiri (tall adult man, Maori heritage, warm brown skin, short dark hair, a carved green pounamu pendant on a cord around his neck, wearing a park-ranger'"'"'s olive-green coat, khaki trousers, sturdy boots). Harper (adult, androgynous, slightly shorter than Wiri but still tall, short ash-blonde undercut hair, conservation-biologist look, wearing a plaid field shirt in muted blue-and-cream, tan trousers, hiking boots, a metal clipboard ever-present in one hand). Identical wardrobe across 3 poses. They walk or stand side-by-side with Wiri slightly taller than Harper — preserve this height difference.'

PERERA='CHARACTERS: Perera-Fernando family of four. Ranjith (he/him, 44, Sri Lankan British civil engineer, warm brown skin, black hair with a little grey at the temples, rectangular wire glasses, a soft blue button-down shirt, tan chinos, brown leather shoes). Shanthi (she/her, 42, Sri Lankan British primary teacher, warm brown skin, shoulder-length dark hair, a warm mustard-yellow cardigan over a cream blouse, a long navy skirt, flat brown shoes). Twins Arjun & Anoushka (both 9, warm brown skin, identical tousled dark hair). MATCHING RAIN BOOTS IN DIFFERENT COLOURS: Arjun in yellow rain boots + grey tee + dark shorts; Anoushka in red rain boots + yellow tee + dark leggings. Identical wardrobe across 3 poses. Walk side-by-side, parents either side, twins in the middle.'

ESTRADA='CHARACTERS: A warm big-family group of SIX people in a cheerful children'"'"'s picture-book style — the Estrada family parents and four of their children on a happy family walk. Tomasz (dad, about 38, tall, warm-toned skin, dark-brown hair, short dark stubble, wearing a dark-red henley, grey jeans, brown boots). Luz (mum, about 36, also tall, warm-toned skin, glossy dark-brown bob haircut, wearing a soft-cream loose flowing tunic-style top over dark leggings and flat tan shoes — the tunic has a gently rounded silhouette at the waist in ALL 3 poses). FOUR children in the composition (approx ages 4, 7, 8, 10). ALL four children share the SAME SIGNATURE HAIRCUT — tousled dark-brown curls on top with cleaner shorter sides. Cheerful children in mixed cosy storybook clothes: red jumper, green tee, blue tee, yellow tee. Identical wardrobe across 3 poses. Warm, bustling family group energy — parents at either end of the group, children tucked in between.'

SIMEON_KARO='CHARACTERS: Simeon & Karo — Lily'"'"'s Welsh uncle and Polish aunt. Simeon (he/him, Welsh, VERY TALL and slim, tousled mid-brown hair with visible grey flecks, big toothy warm smile, wearing a light-olive henley, dark jeans, brown boots). Karo (she/her, Polish, MUCH SHORTER than Simeon — PRESERVE this dramatic height difference, Simeon towers over her, the top of Karo'"'"'s head is level with Simeon'"'"'s shoulder. Long blonde hair past shoulders, bright blue eyes, red lipstick, flashy large gold statement earrings, a blue denim jacket over a white top, black skinny jeans, white trainers). Identical wardrobe across 3 poses. POPPY the cat (small grey-and-white tabby) appears in all 3 poses: padding alongside their feet in walking poses, HELD IN KARO'"'"'S ARMS in the waving pose. Simeon waves (or both wave) in the waving pose.'

# Reference arrays (use 3 refs; repeat main portrait if variants missing)
PRIYA_REFS=("$CAST/01-priya.png" "$VAR/01-priya-greeting.png" "$CAST/01-priya.png")
FINN_REFS=("$CAST/05-finn.png" "$VAR/05-finn-greeting.png" "$VAR/05-finn-with-dog.png")
WALKERS_REFS=("$CAST/08-walkers.png" "$VAR/08-walkers-greeting.png" "$CAST/08-walkers.png")
KUMAR_REFS=("$CAST/13-kumar-ishii.png" "$VAR/13-kumar-ishii-greeting.png" "$VAR/13-kumar-ishii-with-cat.png")
THEO_REFS=("$CAST/14-theo-grandkids.png" "$VAR/14-theo-grandkids-greeting.png" "$VAR/14-theo-with-dog.png")
BENJI_REFS=("$CAST/17-benji.png" "$VAR/17-benji-greeting.png" "$VAR/17-benji-wild-visit.png")
WIRI_REFS=("$CAST/23-wiri-harper.png" "$VAR/23-wiri-harper-greeting.png" "$CAST/23-wiri-harper.png")
PERERA_REFS=("$CAST/24-perera-fernando.png" "$VAR/24-perera-fernando-greeting.png" "$CAST/24-perera-fernando.png")
ESTRADA_REFS=("$CAST/31-estrada-train.png" "$VAR/31-estrada-train-greeting.png" "$VAR/31-estrada-with-parrot-snake.png")
SIMEON_REFS=("$CAST/32-simeon-karo.png" "$CAST/32-simeon-karo-greeting.png" "$CAST/32-simeon-karo-with-bat-toys.png")

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
  local staged="$STAGE/$outname"
  if [ -s "$out" ]; then
    echo ">>> SKIP $outname (already exists at $out)"
    cp "$out" "$staged"
    return 0
  fi
  echo ">>> Generating $outname"
  if "$REGEN" "$out" "$prompt" "${refs[@]}"; then
    cp "$out" "$staged"
    echo "    staged -> $staged"
  else
    echo "    !! FAILED $outname"
    FAILED+=("$outname")
  fi
}

render_household() {
  local id="$1"; shift
  local char="$1"; shift
  # remaining args are refs
  local refs=("$@")
  gen "${id}-walking-front.png" "$char" "$POSE_FRONT" "${refs[@]}"
  gen "${id}-walking-side.png"  "$char" "$POSE_SIDE"  "${refs[@]}"
  gen "${id}-waving.png"        "$char" "$POSE_WAVE"  "${refs[@]}"
}

render_household "01-priya"           "$PRIYA"          "${PRIYA_REFS[@]}"
render_household "05-finn"            "$FINN"           "${FINN_REFS[@]}"
render_household "08-walkers"         "$WALKERS"        "${WALKERS_REFS[@]}"
render_household "13-kumar-ishii"     "$KUMAR_ISHII"    "${KUMAR_REFS[@]}"
render_household "14-theo-grandkids"  "$THEO_GRANDKIDS" "${THEO_REFS[@]}"
render_household "17-benji"           "$BENJI"          "${BENJI_REFS[@]}"
render_household "23-wiri-harper"     "$WIRI_HARPER"    "${WIRI_REFS[@]}"
render_household "24-perera-fernando" "$PERERA"         "${PERERA_REFS[@]}"
render_household "31-estrada-train"   "$ESTRADA"        "${ESTRADA_REFS[@]}"
render_household "32-simeon-karo"     "$SIMEON_KARO"    "${SIMEON_REFS[@]}"

echo "ALL DONE"
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "FAILED SPRITES (${#FAILED[@]}):"
  for f in "${FAILED[@]}"; do echo "  - $f"; done
else
  echo "No failures."
fi
