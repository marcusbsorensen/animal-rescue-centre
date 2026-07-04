#!/usr/bin/env bash
# regen-hedgehog.sh — generate the hedgehog species-level fallback sprites
# (9 in-game states) via OpenAI gpt-image, then matte to transparent with
# rembg. The hedgehog was added as a real species on 2026-07-04; these are
# the species-level fallbacks so the game draws a real hedgehog before the
# 54 per-variant sprites land.
#
# Pipeline per state:
#   1. gpt-image-regen.sh with [pose-anchor bunny, approved-hedgehog char
#      lock, style ref] → 1024px painted PNG (opaque background)
#   2. rembg → clean transparent cut-out (handles fuzzy spine/fur edges)
#   3. sips -Z 128 → final 128px sprite in public/assets/animals/
#
# The approved character-lock reference (CHAR_REF) keeps every state looking
# like the SAME hedgehog — the known continuity risk when each state is a
# separate generation.
#
# Requires: OPENAI_API_KEY in .env.local, and rembg on REMBG_BIN.
# Usage: REMBG_BIN=/path/to/rembg tools/regen-hedgehog.sh [state ...]
#        (no args = all 9 states)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
DRAFTS="$ROOT/asset-drafts/hedgehog"
SCRIPT="$ROOT/tools/gpt-image-regen.sh"
CHAR_REF="$ROOT/asset-drafts/hedgehog-test/hedgehog-sheltered-cut.png"
REMBG_BIN="${REMBG_BIN:-rembg}"
export GPT_IMAGE_QUALITY="${GPT_IMAGE_QUALITY:-medium}"
export GPT_IMAGE_MODEL="${GPT_IMAGE_MODEL:-gpt-image-1.5}"

mkdir -p "$DRAFTS"

STYLE_BASE="Children's-book chibi illustration: large rounded head ~45% of body, big expressive dark eyes, soft clean visible outlines, warm flat saturated palette, gentle soft shading (NOT glossy 3D render). Plain flat background, no glow, no vignette, no scenery, no floor shadow — single hedgehog centred and isolated. NOT photo-realistic, NOT anthropomorphised (no clothes, no human posture). The FIRST reference image is a POSE ANCHOR — match its body geometry (angle, feet, head direction). The SECOND reference is the CHARACTER — match this exact hedgehog's face, colouring and spine pattern. Remaining references lock the painterly chibi style. Subject: a cute chibi HEDGEHOG with a domed back of short brown-and-cream SPINES, small pointed tan furry face, tiny black nose, round dark eyes, small rounded ears, little legs."

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

pose_rule() {
  case "$1" in
    arriving)  echo "Hedgehog sitting on all fours, facing 3/4 to camera-right, uncertain/worried wide eyes, spines slightly raised. Next to a folded chunky knitted BLANKET (NOT a box) it could snuggle into." ;;
    sheltered) echo "Hedgehog in a content loaf pose, gentle happy expression, facing 3/4 to camera-right. No props, transparent background." ;;
    eating)    echo "Hedgehog snuffling head-down at a small scatter of mealworms/insects on the ground, facing 3/4 to camera-right, content." ;;
    sleeping)  echo "Hedgehog curled into a snug ball, eyes closed, spines relaxed over its back, peaceful. No bed." ;;
    walking)   echo "Hedgehog mid-scurry, body low and stretched forward, little legs moving, facing RIGHT." ;;
    growling)  echo "Hedgehog in a defensive pose: body low and tense, SPINES RAISED and erect, small warning face (kid-appropriate). Facing 3/4 to camera-right." ;;
    grumpy)    echo "Hedgehog sitting half-hunched, spines slightly up, narrowed eyes, small frown, sulky. All four legs down. No human postures." ;;
    scared)    echo "Hedgehog rolled into a TIGHT DEFENSIVE BALL, spines fully erect all over, only a frightened nose and eye peeking out. Classic hedgehog fear response." ;;
    sick)      echo "Hedgehog lying low on its belly, head down, half-closed sad eyes, spines flat, droopy. Unwell but recoverable — pitiful, not scary. No cushion." ;;
    *) echo "UNKNOWN" >&2; return 1 ;;
  esac
}

STATES=("$@")
if [ "${#STATES[@]}" -eq 0 ]; then
  STATES=(arriving sheltered eating sleeping walking growling grumpy scared sick)
fi

for state in "${STATES[@]}"; do
  anchor="$(pose_anchor "$state")"
  rule="$(pose_rule "$state")"
  raw="$DRAFTS/hedgehog-$state-raw.png"
  cut="$DRAFTS/hedgehog-$state-cut.png"
  final="$ASSETS/hedgehog-$state.png"

  echo "──▶ $state"
  "$SCRIPT" "$raw" "$STYLE_BASE Pose for this sprite: $rule" \
    "$anchor" "$CHAR_REF" "$ASSETS/fox-arctic-sheltered.png"

  "$REMBG_BIN" i "$raw" "$cut"
  cp "$cut" "$final"
  sips -Z 128 "$final" >/dev/null 2>&1
  echo "   wrote $final"
done

echo "Done. Review with the admin sprite grid before committing."
