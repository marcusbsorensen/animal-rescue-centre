#!/usr/bin/env bash
# regen-animal-gaps-2026-09-05.sh — fill every remaining hole in the animal
# sprite set, so that ALL animals have ALL ten poses.
#
# The gap, measured against `SPECIES_VARIANTS` in game-logic rather than
# against the folder listing (which is how it stayed hidden):
#
#   hedgehog      6 declared variants, ZERO variant sprites   → 60
#   raccoon       walking only, 9 poses missing               →  9
#   skunk         walking only, 9 poses missing               →  9
#   base playing  the species-level fallback never got one    →  8
#                                                              ───
#                                                               86
#
# `hedgehog-brown` is the standard morph the species-level fallback already
# depicts, so those ten are COPIED from it rather than generated — free,
# instant, and it makes the standard morph pixel-identical to the fallback,
# which is what it is meant to be. That leaves 76 generations.
#
# Pipeline per sprite, lifted from regen-hedgehog.sh:
#   1. gpt-image-regen.sh with [pose anchor, character lock, style refs]
#   2. rembg  → clean transparent cut-out (fur and spine edges), via
#      tools/rembg-cut.py because the venv has no [cli] extra
#   3. sips -Z → final PNG in public/assets/animals/
#
# OpenAI rather than Manus, per manus-sprite-rules.md Rule 6: every sprite
# here has to sit in a set that already exists, and images/edits takes the
# references as multipart upload so there is no URL fetch to fail silently.
#
# Usage:
#   tools/regen-animal-gaps-2026-09-05.sh --pilot        # 3 sprites, one per phase
#   tools/regen-animal-gaps-2026-09-05.sh                # all 86
#   tools/regen-animal-gaps-2026-09-05.sh base-playing   # one phase
#   tools/regen-animal-gaps-2026-09-05.sh hedgehog tunnel
#
# Env:
#   FORCE=1             regenerate even if the final file already exists
#   GPT_IMAGE_QUALITY   low | medium | high  (default medium — the setting
#                       the existing set was drawn at, so it matches)
#   REMBG_PY            python with rembg importable
#                       (default ~/.arc-rembg-venv/bin/python)

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
DRAFTS="$ROOT/asset-drafts/gaps-2026-09-05"
GEN="$ROOT/tools/gpt-image-regen.sh"
REMBG_PY="${REMBG_PY:-$HOME/.arc-rembg-venv/bin/python}"
REMBG_CUT="$ROOT/tools/rembg-cut.py"
FORCE="${FORCE:-0}"
export GPT_IMAGE_QUALITY="${GPT_IMAGE_QUALITY:-medium}"
export GPT_IMAGE_MODEL="${GPT_IMAGE_MODEL:-gpt-image-1.5}"

mkdir -p "$DRAFTS"

made=0; skipped=0; failed=0
FAILED_LIST=()

# ── shared style anchor ────────────────────────────────────────
# Same voice as regen-play-poses.sh, because these join that set.
STYLE="Painterly children's-book illustration in chibi style (large rounded head about 45% of body, expressive large eyes, soft visible outlines, warm saturated palette, gentle soft shading). Transparent background, NO floor shadow, NO scenery, NO props unless the pose names one. NOT photo-realistic, NOT glossy 3D, NOT cartoon-flat, NOT anthropomorphised — no clothes, no human posture. Match the hand-painted style of the reference images exactly. The FIRST reference is the POSE ANCHOR: match its body geometry (angle, limb positions, head direction). The SECOND reference is the CHARACTER LOCK: match that individual's face shape, proportions and markings. Remaining references lock the painterly style. A single animal, centred and isolated, with at least 10% clearance above and below."

# ── the ten poses, described once ──────────────────────────────
pose_rule() {
  case "$1" in
    arriving)  echo "Sitting on all fours, facing 3/4 to camera-right, uncertain worried wide eyes, a little hunched. Newly arrived and unsure." ;;
    sheltered) echo "A content settled resting pose, gentle happy expression, facing 3/4 to camera-right. Safe and calm." ;;
    eating)    echo "Head down, snuffling at a small scatter of food on the ground, facing 3/4 to camera-right, absorbed and content." ;;
    sleeping)  echo "Curled up asleep, eyes closed, body relaxed and softly rounded, peaceful. No bed, no cushion." ;;
    walking)   echo "Mid-stride, body low and stretched forward, legs moving, facing RIGHT." ;;
    playing)   echo "PLAY POSE — front low and rear raised in an inviting play-bow, bright excited eyes, mouth slightly open in a happy grin, tail up. The universal 'let's play!' body language." ;;
    sick)      echo "Lying low on its belly, head down, half-closed sad eyes, droopy and subdued. Unwell but recoverable — pitiful, never frightening." ;;
    scared)    echo "Tucked small and low, ears back, wide frightened eyes, body pulled in on itself. Afraid, not threatening." ;;
    grumpy)    echo "Sitting half-hunched, narrowed eyes, small frown, sulky and put-out. All four feet down." ;;
    growling)  echo "A defensive pose: body low and tense, warning face, mouth slightly open. Kid-appropriate — cross, never scary." ;;
    *) echo "UNKNOWN POSE: $1" >&2; return 1 ;;
  esac
}

# ── one sprite: generate, matte, resize ────────────────────────
# make <final-path> <draft-stem> <size> <prompt> <ref...>
make() {
  local final="$1"; shift
  local stem="$1"; shift
  local size="$1"; shift
  local prompt="$1"; shift

  if [ -f "$final" ] && [ "$FORCE" != "1" ]; then
    echo "   · exists, skipping ($(basename "$final"))"
    skipped=$((skipped+1)); return 0
  fi
  for r in "$@"; do
    if [ ! -f "$r" ]; then
      echo "   ✗ missing reference $r" >&2
      FAILED_LIST+=("$(basename "$final") — missing ref $(basename "$r")")
      failed=$((failed+1)); return 1
    fi
  done

  local raw="$DRAFTS/$stem-raw.png"
  local cut="$DRAFTS/$stem-cut.png"

  if ! "$GEN" "$raw" "$prompt" "$@" >/dev/null 2>"$DRAFTS/$stem.err"; then
    echo "   ✗ generate failed — $(head -3 "$DRAFTS/$stem.err" | tr '\n' ' ')" >&2
    FAILED_LIST+=("$(basename "$final") — generate")
    failed=$((failed+1)); return 1
  fi
  if ! "$REMBG_PY" "$REMBG_CUT" "$raw" "$cut" >/dev/null 2>"$DRAFTS/$stem.rembg.err"; then
    echo "   ✗ rembg failed" >&2
    FAILED_LIST+=("$(basename "$final") — rembg")
    failed=$((failed+1)); return 1
  fi
  cp "$cut" "$final"
  sips -Z "$size" "$final" >/dev/null 2>&1
  echo "   ✓ $(basename "$final")  ${size}px"
  made=$((made+1))
}

# ── phase 1: the eight species-level `playing` sprites ─────────
# The base tier is 128px art in an older, rounder hand. Marcus, 2026-09-05:
# draw these in the modern painted style at 512 instead of matching the
# legacy siblings — `snake` and `hedgehog` are already 512, so that tier is
# mixed anyway and this is the direction of travel.
#
# Character lock is the base's OWN sprite, so the generic cat stays the
# generic cat's colours; the pose anchor is a named variant's accepted
# `playing`, which carries both the pose and the target style.
play_anchor() {
  case "$1" in
    cat)      echo "$ASSETS/cat-ginger-playing.png" ;;
    dog)      echo "$ASSETS/dog-golden-playing.png" ;;
    fox)      echo "$ASSETS/fox-red-playing.png" ;;
    bunny)    echo "$ASSETS/bunny-lop-playing.png" ;;
    bat)      echo "$ASSETS/bat-brown-playing.png" ;;
    parrot)   echo "$ASSETS/parrot-macaw-playing.png" ;;
    snake)    echo "$ASSETS/snake-corn-playing.png" ;;
    hedgehog) echo "$ASSETS/hedgehog-walking.png" ;;   # no variant to borrow
  esac
}
play_pose() {
  case "$1" in
    cat)      echo "CAT PLAY POUNCE — low crouch pressed to the ground, rear raised, back legs tensed to spring, tail high and stiff, pupils huge and round, ears forward, staring intently ahead." ;;
    dog)      echo "DOG PLAY BOW — front paws and chest flat to the ground, rear and tail HIGH, tail wagging, bright excited eyes, tongue lolling in a happy open grin, ears forward. Facing 3/4 to camera-right." ;;
    fox)      echo "FOX PLAY SLINK — body stretched LOW and forward hugging the ground, front paws spread, ears pricked, one front paw raised mid-step, tail low but fluffy, a mischievous slightly smug look." ;;
    bunny)    echo "BUNNY BINKY — caught MID-AIR in a binky jump, all four legs splayed in different directions, body twisting mid-turn, ears flopping, eyes bright with pure joy." ;;
    bat)      echo "BAT PLAYFUL HANG — hanging upside-down from a small perch, wings SPREAD WIDE upward and outward in excitement, small open-mouthed grin, bright eyes, one foot raised as if waving." ;;
    parrot)   echo "PARROT PLAY POSE — head COCKED SIDEWAYS curiously, wings partly FLARED in a 'look at me!' display, one foot raised with toes curled, beak slightly open as if chatting." ;;
    snake)    echo "SNAKE CURIOUS EXPLORING — body in a LOOSE OPEN S-CURVE on the ground (not coiled, not defensive), head raised slightly in gentle curiosity, pink tongue flicking, bright alert eye. Inviting, never threatening." ;;
    hedgehog) echo "HEDGEHOG PLAY SCAMPER — front end low and rear slightly raised in an inviting play-bounce, spines relaxed and flat, bright happy eyes, tiny mouth open in a small grin, one front foot lifted mid-step." ;;
  esac
}

phase_base_playing() {
  local only="${1:-}"
  echo "══ phase: base playing  (species-level fallback, 512px modern)"
  for s in cat dog fox bunny bat parrot snake hedgehog; do
    [ -n "$only" ] && [ "$s" != "$only" ] && continue
    echo "── $s-playing"
    local anchor; anchor="$(play_anchor "$s")"
    local refs=("$anchor")
    for st in sheltered walking sleeping eating; do
      [ -f "$ASSETS/$s-$st.png" ] && refs+=("$ASSETS/$s-$st.png")
      [ "${#refs[@]}" -ge 4 ] && break
    done
    make "$ASSETS/$s-playing.png" "$s-playing" 512 \
      "$STYLE Subject: the species-level generic $s, matching the colouring and markings of the character-lock reference. Pose for this sprite: $(play_pose "$s")" \
      "${refs[@]}"
  done
}

# ── phase 2: the six hedgehog variants ─────────────────────────
# Real African pygmy hedgehog colour morphs. `brown` is the standard and is
# what the fallback already draws, so it is copied rather than generated.
hog_colour() {
  case "$1" in
    albino)          echo "ALBINO morph: pure WHITE spines with no banding at all, pale pink skin, PINK nose, distinctive RED-PINK eyes, white face fur." ;;
    blonde)          echo "BLONDE morph: pale cream and light-sand spines with soft faint banding, very pale tan face fur, dark eyes, pale pink-brown nose." ;;
    salt-and-pepper) echo "SALT-AND-PEPPER morph: crisp GREY-and-WHITE banded spines giving a peppered look, a darker grey mask across the eyes, dark grey-black nose, grey-white face fur." ;;
    pinto)           echo "PINTO morph: PIEBALD — irregular patches of pure white spines scattered among the normal brown-banded ones, with matching irregular white patches in the face fur. Asymmetric and distinctive." ;;
    chocolate)       echo "CHOCOLATE morph: rich dark chocolate-brown spines with warm cream banding, warm milk-brown face fur, dark brown nose, dark eyes." ;;
  esac
}

phase_hedgehog() {
  local only="${1:-}"
  echo "══ phase: hedgehog variants  (6 declared, 0 drawn — 512px)"

  # brown = the standard morph the fallback already is. Copy it.
  if [ -z "$only" ] || [ "$only" = "brown" ]; then
    echo "── hedgehog-brown  (copied from the species fallback)"
    for p in arriving sheltered eating sleeping walking playing sick scared grumpy growling; do
      local src="$ASSETS/hedgehog-$p.png"
      local dst="$ASSETS/hedgehog-brown-$p.png"
      if [ ! -f "$src" ]; then
        echo "   ✗ no $src yet — run base-playing first" >&2
        FAILED_LIST+=("hedgehog-brown-$p — source $p missing")
        failed=$((failed+1)); continue
      fi
      if [ -f "$dst" ] && [ "$FORCE" != "1" ]; then
        echo "   · exists, skipping (hedgehog-brown-$p.png)"; skipped=$((skipped+1)); continue
      fi
      cp "$src" "$dst"
      echo "   ✓ hedgehog-brown-$p.png  (copy)"
      made=$((made+1))
    done
  fi

  for v in albino blonde salt-and-pepper pinto chocolate; do
    [ -n "$only" ] && [ "$v" != "$only" ] && continue
    echo "── hedgehog-$v"
    for p in arriving sheltered eating sleeping walking playing sick scared grumpy growling; do
      local anchor="$ASSETS/hedgehog-$p.png"
      local refs=("$anchor" "$ASSETS/hedgehog-sheltered.png")
      [ -f "$ASSETS/hedgehog-walking.png" ] && refs+=("$ASSETS/hedgehog-walking.png")
      make "$ASSETS/hedgehog-$v-$p.png" "hedgehog-$v-$p" 512 \
        "$STYLE Subject: a chibi HEDGEHOG with a domed back of short spines, small pointed furry face, tiny nose, round eyes, small rounded ears and little legs — the SAME hedgehog character as the references, but recoloured. Colouring for this sprite: $(hog_colour "$v") Keep the face shape, body proportions and spine geometry identical to the references; change ONLY the colouring. CRITICAL: the back must read clearly as SHORT POINTED SPINES — individual banded quills with visible pointed tips and soft shadow separating them — NOT soft fur, NOT a fluffy or downy ball. Keep the spine density, the direction they lie in, and the crisp painted edge of the references. On pale morphs the spines still need tip definition and shadow between them so the quill texture reads against the light colour. Pose for this sprite: $(pose_rule "$p")" \
        "${refs[@]}"
    done
  done
}

# ── phase 3: the tunnel's two, raccoon and skunk ───────────────
# Both have a single `walking` sprite and appear only in the garden tunnel.
# Fox is the pose anchor throughout — closest body plan in the existing set.
phase_tunnel() {
  local only="${1:-}"
  echo "══ phase: tunnel cast  (raccoon + skunk, 9 poses each, 512px)"
  for a in raccoon skunk; do
    [ -n "$only" ] && [ "$a" != "$only" ] && continue
    echo "── $a"
    local subject
    case "$a" in
      raccoon) subject="a chibi RACCOON: grey-and-black fur, a distinctive BLACK BANDIT MASK across the eyes, a pale muzzle, small rounded ears, dexterous little front paws, and a thick RINGED tail with alternating dark and pale bands." ;;
      skunk)   subject="a chibi SKUNK: glossy BLACK fur with a bold WHITE STRIPE running from the forehead down the back and splitting into two stripes along the body, a small pointed face with a white blaze, tiny rounded ears, and a large bushy black-and-white plume tail carried high." ;;
    esac
    for p in arriving sheltered eating sleeping playing sick scared grumpy growling; do
      local anchor="$ASSETS/fox-red-$p.png"
      local refs=("$anchor" "$ASSETS/$a-walking.png" "$ASSETS/fox-red-sheltered.png")
      make "$ASSETS/$a-$p.png" "$a-$p" 512 \
        "$STYLE Subject: $subject Match the exact individual in the character-lock reference — its markings, face and proportions. Pose for this sprite: $(pose_rule "$p")" \
        "${refs[@]}"
    done
  done
}

# ── entry ──────────────────────────────────────────────────────
if [ ! -x "$REMBG_PY" ]; then
  echo "ERROR: no python at $REMBG_PY (set REMBG_PY=)" >&2
  exit 2
fi
if ! "$REMBG_PY" -c 'import rembg' 2>/dev/null; then
  echo "ERROR: rembg not importable by $REMBG_PY" >&2
  exit 2
fi

start=$(date +%s)
if [ "${1:-}" = "--pilot" ]; then
  echo "PILOT — one sprite per phase, to check fidelity before the full run."
  phase_base_playing cat
  echo "── hedgehog-albino (one pose)"
  make "$ASSETS/hedgehog-albino-sheltered.png" "hedgehog-albino-sheltered" 512 \
    "$STYLE Subject: a chibi HEDGEHOG with a domed back of short spines, small pointed furry face, tiny nose, round eyes, small rounded ears and little legs — the SAME hedgehog character as the references, but recoloured. Colouring for this sprite: $(hog_colour albino) Keep the face shape, body proportions and spine geometry identical to the references; change ONLY the colouring. CRITICAL: the back must read clearly as SHORT POINTED SPINES — individual banded quills with visible pointed tips and soft shadow separating them — NOT soft fur, NOT a fluffy or downy ball. Keep the spine density, the direction they lie in, and the crisp painted edge of the references. On pale morphs the spines still need tip definition and shadow between them so the quill texture reads against the light colour. Pose for this sprite: $(pose_rule sheltered)" \
    "$ASSETS/hedgehog-sheltered.png" "$ASSETS/hedgehog-walking.png"
  echo "── raccoon (one pose)"
  make "$ASSETS/raccoon-sheltered.png" "raccoon-sheltered" 512 \
    "$STYLE Subject: a chibi RACCOON: grey-and-black fur, a distinctive BLACK BANDIT MASK across the eyes, a pale muzzle, small rounded ears, dexterous little front paws, and a thick RINGED tail with alternating dark and pale bands. Match the exact individual in the character-lock reference. Pose for this sprite: $(pose_rule sheltered)" \
    "$ASSETS/fox-red-sheltered.png" "$ASSETS/raccoon-walking.png"
else
  PHASES=("$@")
  [ "${#PHASES[@]}" -eq 0 ] && PHASES=(base-playing hedgehog tunnel)
  for ph in "${PHASES[@]}"; do
    case "$ph" in
      base-playing) phase_base_playing ;;
      hedgehog)     phase_hedgehog ;;
      tunnel)       phase_tunnel ;;
      *) echo "unknown phase: $ph (base-playing | hedgehog | tunnel)" >&2; exit 1 ;;
    esac
  done
fi

elapsed=$(( $(date +%s) - start ))
echo ""
echo "── made $made · skipped $skipped · failed $failed · ${elapsed}s"
if [ "${#FAILED_LIST[@]}" -gt 0 ]; then
  printf '   ! %s\n' "${FAILED_LIST[@]}"
fi
echo "Drafts in asset-drafts/gaps-2026-09-05/. Review before committing."
