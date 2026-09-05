#!/usr/bin/env bash
# restyle-animals-2026-09-05.sh — bring all 600 animal sprites to one register.
#
# The audit (tools/audit-animal-style.py) found the set is a gradient rather
# than two camps: 1.65σ to 5.81σ from the target with no clean break
# anywhere, so there is no subset to fix. Marcus, 2026-09-05, chose the
# target — `snake-python-sheltered.png` — and chose to redo all 600.
#
# **Reference strategy.** Each sprite is redrawn from ITSELF plus the
# target: reference 1 is the sprite as it stands, which already carries the
# right species, the right individual markings and the right pose;
# reference 2 is the style target. The instruction is "redraw the animal in
# reference 1, in the painting style of reference 2". That keeps the pose
# table out of it entirely — the pose is whatever the animal is already
# doing — and removes the whole class of error where a re-described pose
# comes back subtly different.
#
# **What the sprites must not contain** is in docs/sprite-pose-spec-2026-09-05.md,
# which was written from what the game actually composites. The three that
# have burned us before, per Marcus:
#   walking  → NO collar. WalkScene draws it as vector; the player picks it.
#   eating   → NO bowl or food. The bowl is painted into bg-kitchen.png.
#   arriving → NO prop. It is becoming a separate composited object.
# The old brief in tools/analyze-set-consistency.sh:78 REQUIRES a bowl and
# is the root cause of the third. Fix that file before grading anything.
#
# Usage:
#   tools/restyle-animals-2026-09-05.sh --pilot          # 6 sprites, mixed
#   tools/restyle-animals-2026-09-05.sh                  # all 600
#   tools/restyle-animals-2026-09-05.sh cat dog          # named species
#   tools/restyle-animals-2026-09-05.sh --pose walking   # one pose, all species
#
# Env: FORCE=1 · GPT_IMAGE_QUALITY (default medium) · REMBG_PY

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
DRAFTS="$ROOT/asset-drafts/restyle-2026-09-05"
GEN="$ROOT/tools/gpt-image-regen.sh"
REMBG_PY="${REMBG_PY:-$HOME/.arc-rembg-venv/bin/python}"
REMBG_CUT="$ROOT/tools/rembg-cut.py"
TARGET="$ASSETS/snake-python-sheltered.png"
FORCE="${FORCE:-0}"
export GPT_IMAGE_QUALITY="${GPT_IMAGE_QUALITY:-medium}"
export GPT_IMAGE_MODEL="${GPT_IMAGE_MODEL:-gpt-image-1.5}"

mkdir -p "$DRAFTS"
made=0; skipped=0; failed=0
FAILED_LIST=()

POSES=(arriving sheltered eating sleeping walking playing sick scared grumpy growling)

# ── the register, described from what the target actually does ──
STYLE="Redraw the animal from the FIRST reference image in the painting style of the SECOND reference image. \
KEEP from the first reference: the species, the individual's exact markings and colouring, its proportions, and its POSE and body geometry unchanged. \
TAKE from the second reference only the way it is PAINTED. \
That style is: a warm dark ink line of VARIABLE weight that thickens where forms overlap or turn away and thins to nothing on the lit edge — never a uniform traced outline; \
real painted surface texture, so fur reads as painted strands and scales as painted scales and nothing is a flat fill; \
form modelled in soft washes with genuine occlusion shadow where one part of the body crosses another, light from the upper left; \
a warm limited palette, muted and pigment-like rather than bright and saturated. \
The animal KEEPS an expressive readable eye — iris, round pupil, one specular highlight — in proportion to the head, not enlarged and not glossy. \
NO blushed cheeks, NO cel shading, NO flat vector fills, NO plastic sheen, NO glow, NO vignette, NO gradient. \
Transparent background, no ground, no floor, NO baked drop shadow. \
A single animal, centred, at least 10% clearance above and below."

# ── the prohibitions, per pose, from docs/sprite-pose-spec-2026-09-05.md ──
pose_ban() {
  case "$1" in
    walking)   echo "CRITICAL: the neck and chest must be COMPLETELY BARE — no collar, no lead, no harness, no tag, no bandana, no ribbon. The game draws the collar itself and the player chooses its colour." ;;
    eating)    echo "CRITICAL: NO bowl, NO dish, NO plate, NO mat, NO food, NO scattered kibble anywhere in the image. The animal is head-down in the act of eating at an implied spot on the ground. The bowl is painted into the kitchen background and the food is a separate sprite the player drags." ;;
    arriving)  echo "CRITICAL: NO box, NO crate, NO carrier, NO blanket, NO pouch, NO toy, NO prop of any kind. The animal alone, uncertain and a little hunched. Arrival props are separate composited objects." ;;
    playing)   echo "CRITICAL: NO ball, NO feather, NO yarn, NO leaves, NO bell, NO toy of any kind. The paws and mouth are EMPTY. Toys are drawn separately by the game." ;;
    sleeping)  echo "CRITICAL: NO bed, NO basket, NO cushion, NO blanket, NO floating Z's. The animal curled and asleep on nothing." ;;
    sick)      echo "CRITICAL: NO bandage, NO thermometer, NO ice pack, NO bed, NO blanket, NO text, NO sad-face icon. Low and subdued, pitiful and never frightening." ;;
    *)         echo "CRITICAL: NO objects of any kind — no branch, no perch, no cushion, no prop. The animal alone." ;;
  esac
}

# Keeping the unbuilt wardrobe system possible costs nothing to ask for.
CLEAR_NECK="Leave the neck, the back and the top of the head clean and unobstructed."

restyle() {   # restyle <stem> <pose>
  local stem="$1" pose="$2"
  local src="$ASSETS/$stem-$pose.png"
  local stamp="$DRAFTS/$stem-$pose"
  [ -f "$src" ] || { echo "   · no source $stem-$pose"; return 0; }
  if [ -f "$stamp.done" ] && [ "$FORCE" != "1" ]; then
    echo "   · done already ($stem-$pose)"; skipped=$((skipped+1)); return 0
  fi
  # The original is kept, because the source IS the reference and a failed
  # run must not eat it.
  [ -f "$stamp-before.png" ] || cp "$src" "$stamp-before.png"

  if ! "$GEN" "$stamp-raw.png" \
       "$STYLE $(pose_ban "$pose") $CLEAR_NECK" \
       "$stamp-before.png" "$TARGET" >/dev/null 2>"$stamp.err"; then
    echo "   ✗ $stem-$pose — $(head -2 "$stamp.err" | tr '\n' ' ')" >&2
    FAILED_LIST+=("$stem-$pose generate"); failed=$((failed+1)); return 1
  fi
  if ! "$REMBG_PY" "$REMBG_CUT" "$stamp-raw.png" "$stamp-cut.png" >/dev/null 2>&1; then
    echo "   ✗ $stem-$pose — rembg" >&2
    FAILED_LIST+=("$stem-$pose rembg"); failed=$((failed+1)); return 1
  fi
  cp "$stamp-cut.png" "$src"
  sips -Z 512 "$src" >/dev/null 2>&1
  touch "$stamp.done"
  echo "   ✓ $stem-$pose"
  made=$((made+1))
}

all_stems() {
  python3 - "$ASSETS" <<'PY'
import os, sys, re
POSES = {'arriving','sheltered','eating','sleeping','walking',
         'playing','sick','scared','grumpy','growling'}
stems = set()
for f in os.listdir(sys.argv[1]):
    if f.endswith('.png'):
        stem, _, pose = f[:-4].rpartition('-')
        if pose in POSES and stem:
            stems.add(stem)
print('\n'.join(sorted(stems)))
PY
}

# ── entry ──
[ -x "$REMBG_PY" ] || { echo "no python at $REMBG_PY" >&2; exit 2; }
[ -f "$TARGET" ] || { echo "missing style target $TARGET" >&2; exit 2; }

ONE_POSE=""
if [ "${1:-}" = "--pose" ]; then ONE_POSE="$2"; shift 2; fi

start=$(date +%s)
if [ "${1:-}" = "--pilot" ]; then
  echo "PILOT — six sprites chosen to exercise every risk before the full run."
  # one per named failure mode, one pale animal, one already-close, one far
  restyle dog-golden walking      # collar risk
  restyle cat-ginger eating       # bowl risk
  restyle bunny-lop arriving      # prop risk
  restyle cat-white sheltered     # pale: furthest group in the ranking
  restyle parrot-macaw sheltered  # most saturated in the set
  restyle snake-corn sheltered    # already close — must not get worse
else
  if [ "$#" -gt 0 ]; then
    STEMS=()
    for sp in "$@"; do
      while IFS= read -r s; do
        [ "$s" = "$sp" ] || [[ "$s" == "$sp-"* ]] && STEMS+=("$s")
      done < <(all_stems)
    done
  else
    STEMS=(); while IFS= read -r s; do STEMS+=("$s"); done < <(all_stems)
  fi
  total=$(( ${#STEMS[@]} * ${#POSES[@]} )); n=0
  echo "restyling ${#STEMS[@]} characters (~$total sprites)"
  for stem in "${STEMS[@]}"; do
    echo "── $stem"
    for pose in "${POSES[@]}"; do
      [ -n "$ONE_POSE" ] && [ "$pose" != "$ONE_POSE" ] && continue
      n=$((n+1)); restyle "$stem" "$pose"
    done
  done
fi

echo ""
echo "── made $made · skipped $skipped · failed $failed · $(( $(date +%s) - start ))s"
[ "${#FAILED_LIST[@]}" -gt 0 ] && printf '   ! %s\n' "${FAILED_LIST[@]}"
echo "Originals kept as *-before.png in asset-drafts/restyle-2026-09-05/."
echo "Re-measure with: python3 tools/audit-animal-style.py --ref-file snake-python-sheltered.png"
