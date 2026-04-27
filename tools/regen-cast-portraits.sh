#!/usr/bin/env bash
# Generate neutral "catalogue" portraits for all 30 rehoming-cast households.
# Source of truth for character descriptions is docs/rehoming-cast.md.
# Style: Aardman / Raymond Briggs painted chibi, matching the animal sprites.
# After generation, downscale each to 512px for the game bundle.
set -uo pipefail

ROOT="/Users/marcus/Projects/animal-rescue-centre"
OUT_DIR="$ROOT/apps/game/public/admin/scene-assets/cast"
mkdir -p "$OUT_DIR"
export GPT_IMAGE_QUALITY=medium
export GPT_IMAGE_MODEL=gpt-image-1.5

STYLE="Painterly storybook children's-book illustration in warm chibi style (Aardman / Raymond Briggs aesthetic). Soft rounded proportions with slightly oversized head (~40%), gentle brush outlines, hand-painted textures, warm saturated palette. Transparent PNG background, NO floor, NO scene background, NO shadows on ground. FULL-BODY portrait — render the figure(s) from head to feet on a single shared ground line. CRITICAL FRAMING: all figures must be rendered ENTIRELY within the canvas — heads fully visible with at least 10% empty space ABOVE the tallest head, feet fully visible with at least 10% empty space BELOW the feet. Do NOT crop tops of heads or bottoms of feet. Zoom out if needed. Figure(s) standing facing camera with a small friendly smile. Match the painted chibi brushwork, warmth, and character depth of the reference animal sprites exactly — these are humans drawn in the same children's-book world as those animals."

REFS=(
  "$ROOT/apps/game/public/assets/animals/dog-golden-sheltered.png"
  "$ROOT/apps/game/public/assets/animals/cat-ginger-sheltered.png"
  "$ROOT/apps/game/public/assets/animals/bunny-lionhead-sheltered.png"
)

gen() {
  local id="$1" desc="$2"
  local out="$OUT_DIR/${id}.png"
  if [ -f "$out" ]; then
    echo "=== SKIP $id (already exists) ==="
    return
  fi
  echo "=== Generating $id ==="
  "$ROOT/tools/gpt-image-regen.sh" "$out" "$STYLE $desc" "${REFS[@]}" 2>&1 | tail -3
}

# ── Solo adopters ─────────────────────────────────────────────────────────
gen "01-priya" \
  "A South Asian British woman, 32 years old, sitting in a lightweight manual wheelchair. Teal headscarf framing her face, warm brown eyes, subtle smile. Neat blouse, laptop bag strap over one shoulder. Professional warmth."

gen "02-jan" \
  "A gentle 45-year-old man of Swedish-Portuguese heritage, medium skin, soft dark hair, short-trimmed beard. Chunky wool cardigan in oatmeal with a tiny bee pin on the lapel. Slight happy crinkles by the eyes. Calm soft-spoken demeanour."

gen "03-nova" \
  "A non-binary British-Nigerian illustrator, 22 years old, warm dark brown skin. Short undercut hair dyed partly copper. Paint-splattered oversized dungarees over a loose t-shirt. Holding a studio mug. Gentle half-smile, easy stance."

gen "04-babcia" \
  "A warm Polish grandmother, Babcia Basia, 72 years old. Rosy-cheeked pale skin, white hair in a neat bun. Flowered apron over a soft cardigan, wooden walking cane in one hand, the other tucked in an apron pocket (biscuit crumbs peeking out). Very kind smile."

gen "05-finn" \
  "A trans man, 29 years old, Irish, freckled pale skin, short windswept ginger hair. Athletic build in a running vest and jogging shorts, mud on the trainers. Small happy smile, water bottle in hand. Active energy."

gen "06-hiro" \
  "A 62-year-old Japanese man, retired fisherman, weathered warm skin, short grey hair. Discreet hearing aids in both ears. Cream linen shirt under a navy cardigan, a hardcover library book tucked under one arm. Gentle quiet smile. Gentle posture."

gen "18-tali" \
  "A 35-year-old Ashkenazi Jewish British woman, pottery teacher. Pale-olive skin, curly dark hair pulled up in a loose headscarf, clay dust streaks on her apron. Warm smile, hands slightly dusty at her sides."

gen "19-linny" \
  "A 28-year-old British-Chinese woman (Hong Kong heritage), food blogger. Straight black bob, bright neon-pink jacket over a black t-shirt. Small camera round her neck, notebook and pen in one hand. Playful curious grin."

gen "20-lei" \
  "A 58-year-old Native Hawaiian woman, ukulele teacher, warm brown skin, greying curly dark hair with a pink hibiscus tucked behind one ear. Soft embroidered blouse, cane resting against her leg. Kind gentle smile with a hint of recent sadness."

gen "21-mara" \
  "A 45-year-old Senegalese British seamstress, deep brown skin, warm booming presence. Wearing a bright patterned boubou, a tape measure draped around her neck. Big warm generous smile, hands on hips."

gen "29-wenna" \
  "A 56-year-old Cornish lighthouse keeper, Morwenna, pale weathered salt-kissed skin, red-pink cheeks, messy windblown greying auburn hair. Chunky hand-knit Aran jumper, waterproof work trousers, rubber boots. Hands in pockets. Independent grin, slightly windblown."

# ── Couples ───────────────────────────────────────────────────────────────
gen "07-patel-greens" \
  "Two adults side by side. Left: Anjali Patel-Green, 38, Welsh-Indian woman (she/her), medium-brown skin, warm chatty smile, bright fuchsia shawl. Right: Sam Patel-Green, 36, non-binary (they/them), pale skin, close-cropped dark hair, quiet gentle half-smile, earth-tone layers. They stand close, balancing each other's energy."

gen "08-walkers" \
  "A gay couple, two men side by side. Left: Chris Walker, 42, broad-shouldered carpenter, pale skin, stubble, pencil tucked behind one ear, flannel shirt. Right: Jamie Walker, 40, shorter, shaven head, calm alert posture, service-dog-handler vibe, neat polo shirt. Easy partnership, warm smiles."

gen "09-okonkwo-harts" \
  "A couple. Left: Mel Okonkwo-Hart, 35, tall Ghanaian-English woman, warm dark brown skin, bright head wrap, teacher's cardigan, huge warm laugh. Right: Alex Okonkwo-Hart, 37, pale white chef, striped apron with a smudge of flour on his nose, wavy chestnut hair. First-time pet parents vibe."

gen "10-dani-rex" \
  "A couple in a farmhouse yard. Left: Dani, 28, tomboy woman, athletic climber build, freckled pale skin, short windblown brown hair, rugby shirt and dungarees, climbing calluses visible. Right: Rex, 27, shorter gentle-soft VFX-artist man, warm olive skin, hand-knit jumper, round glasses. Relaxed grin together."

gen "22-yilmaz" \
  "A Turkish British couple. Left: Cem Yılmaz, 38, bakery owner, olive skin, bushy black mustache, flour-dusted apron over a shirt. Right: Leyla Yılmaz, 36, nurse, warm brown skin, kind tired eyes, practical trainers, soft cardigan with a nurse's lanyard. Warm cozy energy."

gen "23-wiri-harper" \
  "A couple in outdoorsy work clothes. Left: Wiri Ngata, 36, tall Maori man, warm brown skin, shoulder-length dark hair pulled back, pounamu jade pendant round his neck, park ranger's khaki coat. Right: Harper Stone, 34, non-binary conservation biologist (they/them), pale freckled skin, short messy hair, clipboard under one arm, field vest with pockets. Steady warm pair."

# ── Families ──────────────────────────────────────────────────────────────
gen "11-vargas-chen" \
  "A family of four. Maya (she/her, 39, Mexican-Filipina teacher) in bright scarves; Kai (he/him, 41, British-Chinese architect) in a waistcoat; daughter Lucia (she/her, 11, football kit, hair tied back); son Ronan (he/him, 8, holding a plushie). Warm active family energy, arms around each other."

gen "12-odenkirks" \
  "A mother and teenage son. Helen Odenkirk, 45, white author, ink-stained fingers, warm smile, walking cane in one hand. Beside her stands Bo, 13, her autistic son, tall for his age with noise-cancelling headphones around his neck, holding a thick animal-field-guide book. Quiet predictable gentleness between them."

gen "13-kumar-ishii" \
  "A family of three. Dr. Ishii (she/her, 50, Japanese woman, vet scrubs peeking under a cardigan). Her wife Priti (she/her, 48, Indian woman, accountant, notebook in one hand). Their daughter Amara (9, tomboy with short dark hair, covered in leaves from tree-climbing, muddy knees, broad grin). Warm two-mum family."

gen "14-theo-grandkids" \
  "An older Black British grandfather with two grandchildren. Theo, 70, retired librarian, rich dark brown skin, short grey hair, gentle smile, corduroy jacket with elbow patches. Beside him: Kofi (he/him, 10, bespectacled, curious), Zuri (she/her, 7, butterfly-wings backpack, delighted smile). Weekend visitor energy."

gen "24-perera-fernando" \
  "A Sri Lankan British family of four. Dad Ranjith (he/him, 44, glasses, button-down shirt, mild smile, civil engineer vibe). Mum Shanthi (she/her, 42, primary teacher, cardigan, warm smile). Twin nine-year-olds Arjun (he/him) and Anoushka (she/her) in matching rain boots (different colours). Gentle family."

# ── Housemates ────────────────────────────────────────────────────────────
gen "25-bramble-house" \
  "Four mature students in a shared house. Zoya, 28, Ukrainian-British botany PhD, pink dyed hair, plant-soil on her hands. Bruno, 31, Brazilian architecture student, tall, warm brown skin, quiet demeanour. Sadia, 26, British-Bangladeshi medical student, hijab, stethoscope peeking from a bag. Obi, 27, Nigerian-British philosophy PhD (they/them), non-binary, gentle glasses, book in hand. Standing together, dissertation-era student energy."

# ── Institutional adopters ────────────────────────────────────────────────
gen "26-aisha-childrens-home" \
  "A 38-year-old Somali-British woman, Ms. Aisha Hassan, care-worker. Warm brown skin, hijab in soft earth tones, soft cardigan, children's-home lanyard. Tea mug in one hand, children's-drawing folder under the other arm. Very warm gentle smile."

gen "27-tomas-care-home" \
  "A 52-year-old Spanish-British nurse, Tomás Rivera. Warm tan skin, short salt-and-pepper hair, thick round glasses, nurse scrubs under a knit cardigan. An inherited pocket watch on a chain. Kind patient smile."

gen "28-iris-teacher" \
  "A 29-year-old Romanian-British primary school teacher, Ms. Iris Popescu. Fair skin, round glasses, light brown hair in a loose bun, pencil tucked behind one ear. Cardigan over a dress with animal-pattern fabric, laminated animal poster under her arm. Warm enthusiastic grin."

# ── Return visitors ───────────────────────────────────────────────────────
gen "15-khans" \
  "A returning family dropping off donations. South Asian British family: mum, dad, two kids. Mum in a soft shawl, dad in a jumper, kids aged 9 and 12 holding a box of cat toys and a bag of pet food between them. Big happy smiles, they've come back with gifts for the centre."

gen "16-tata" \
  "A 55-year-old Brazilian-Portuguese farmer, Ana 'Tata' Silva. Warm tan skin, wavy greying dark hair tied back under a straw hat, work shirt rolled up at the sleeves, denim overalls, muddy knees from farmwork. Kind tough smile, experienced handler vibe."

gen "17-benji" \
  "A 24-year-old trans Scottish guy, Ben 'Benji' Mackenzie. Pale freckled skin, auburn hair, patchy short beard. Outdoors camper vibe: fleece jacket with woodland patches, a rolled photo tucked into his shirt pocket (wildlife reports). Camera round neck. Gentle warm smile."

# ── Two-Houses family (Marcus's cameo) ────────────────────────────────────
gen "30-two-houses" \
  "A friendly divorced co-parenting family, three figures standing together. IMPORTANT FRAMING: all three figures must be rendered entirely within the canvas — heads fully visible with generous empty space above, feet fully visible with generous empty space below. Do NOT crop the tops of heads or the bottoms of feet. Zoom out as needed. Leave at least 10% empty space above the tallest head and below the lowest foot. Left: Marcus, 44, Danish man, pale skin, completely bald shaved head, short well-kept dark brown beard that frames a normal visible small friendly closed-lip smile (the mouth and lips are clearly drawn — the beard does not cover or smudge the mouth), bright BLUE eyes, fitness-focused toned build, black athletic t-shirt and neat joggers, kettlebell silhouette by his foot. Right: Gosia, 42, Polish woman, fair skin, bright BLUE eyes, BLONDE hair in a messy top-knot bun, flowered housecoat (dressing gown) over a cosy jumper, slippers. Center (noticeably smaller than the adults, about 3/4 their height): Rhubarb (they/them, only 8 years old, small child), genderqueer androgynous kid with gender-neutral features — definitely NOT feminine-coded. Messy straight windswept surfer-style shoulder-length blonde hair (NOT curly, NOT girly — think skater / surfer kid hair, flat and tousled). Regular neutral blue eyes with normal-size pupils (NOT big sparkly doll eyes, just ordinary kid eyes). Big over-ear headphones around neck, army-camo cargo trousers, a black rock-band t-shirt, beat-up skater Converse, skateboard tucked under one arm. All three smiling, warm co-parenting energy. The parents stand on either side of Rhubarb, not touching each other but both leaning toward the kid. All three stand on the same ground line."

gen "31-estrada-train" \
  "A huge boisterous Polish-Colombian family — 'The Estrada Train'. Ten people in total, all rendered fully within the canvas (heads fully visible with empty space above, feet fully visible with empty space below — do NOT crop). Stand them in a loose rows-and-columns group photo, parents at the back and eight kids arranged in front in a chaotic cluster. PARENTS (back row): Tomasz, 38, tall dad, dark brown hair, thick dark stubble, warm hearty grin, casual shirt and jeans, one arm gently around his wife's shoulders. Luz, 36, tall mum, dark hair in a neat chin-length bob, warmly pregnant (visible bump under a cheerful loose dress), one hand resting on her bump. KIDS (front, eight of them, ages 1-2-4-5-7-9-10-12 distributed evenly — the 8-year-old is Samuel, Lily's best friend, positioned centrally). SIX BOYS and TWO GIRLS. Critical: ALL EIGHT KIDS share the same signature haircut — tousled dark-brown curly hair on top, cleanly trimmed shorter sides (a modern kids' haircut, same style on every single one). Different sizes by age: the 1-year-old toddler is held by an older sibling, the 2-year-old stands unsteadily, the older ones stand proudly. Various mismatched colourful kid clothes — t-shirts with dinosaurs / superheroes / rock bands, cargo shorts, scuffed trainers. Boisterous energy, huge warm chaos, some arms around each other. Everyone smiling, slightly unruly. Polish-Colombian warm tan skin tones across the family. EVERY family member — both parents and all eight kids — has warm BROWN eyes (not blue, not green — all brown). Fit the whole train in frame."

echo ""
echo "=== Generation complete — archiving 1024 originals + downscaling ==="
# Preserve the 1024px originals in cast/original/ — we paid for those,
# keep them for future use (re-downscale at a different size, compare
# detail, feed back as style references, etc.).
ORIG_DIR="$OUT_DIR/original"
mkdir -p "$ORIG_DIR"
for f in "$OUT_DIR"/*.png; do
  size=$(stat -f %z "$f")
  # Skip files that are already the downscaled version
  if [ "$size" -lt 524288 ]; then continue; fi
  name=$(basename "$f")
  # 1. Copy the 1024 original into the archive (if not already there)
  if [ ! -f "$ORIG_DIR/$name" ]; then
    cp "$f" "$ORIG_DIR/$name"
  fi
  # 2. Downscale the working copy to 512 for the game bundle
  sips -Z 512 -s format png "$f" --out "$f.tmp" >/dev/null 2>&1
  [ -f "$f.tmp" ] && mv "$f.tmp" "$f"
done
echo ""
echo "=== All done ==="
echo "-- 512px working copies --"
ls -lh "$OUT_DIR"/*.png 2>/dev/null | wc -l
echo "-- 1024px originals archived --"
ls -lh "$ORIG_DIR"/*.png 2>/dev/null | wc -l
