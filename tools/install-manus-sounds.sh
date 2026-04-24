#!/usr/bin/env bash
# Install Manus-delivered sound pack into the game's audio asset path.
#
# Manus delivered a ZIP via email (arc-sounds-complete.zip) — download it
# from the Gmail thread, drop it into ~/Downloads, then run this script.
# It extracts, runs Manus's INSTALL.sh, and promotes the OGG files into
# /apps/game/public/assets/audio/ so the game picks them up.

set -euo pipefail
ROOT="/Users/marcus/Projects/animal-rescue-centre"
DOWNLOADS="$HOME/Downloads"
STAGE="$ROOT/manus-output/sounds/arc-sounds-ogg"
LIVE="$ROOT/apps/game/public/assets/audio"

ZIP=$(ls -t "$DOWNLOADS"/arc-sounds-complete*.zip 2>/dev/null | head -1 || true)
if [ -z "$ZIP" ]; then
  echo "⚠️  No arc-sounds-complete.zip found in ~/Downloads."
  echo "   Grab it from the Gmail thread 'A.R.C. game — sound commission'"
  echo "   and drop it in ~/Downloads, then re-run this script."
  exit 1
fi

echo "📦 Found $ZIP"
echo "📂 Extracting..."
mkdir -p "$STAGE"
unzip -o -q "$ZIP" -d "$ROOT/manus-output/sounds"

# Manus organises into subfolders: voice/ animal/ ui/ music/
# The game's AssetLoader expects all audio at /assets/audio/ (flat).
# We'll promote everything there with a sensible filename convention.
mkdir -p "$LIVE"

copy_in() {
  local src_dir="$1" prefix="$2"
  if [ ! -d "$STAGE/$src_dir" ]; then return; fi
  for f in "$STAGE/$src_dir"/*.ogg; do
    [ -e "$f" ] || continue
    local name=$(basename "$f")
    # Strip any existing prefix duplication
    local target="$LIVE/${prefix}${name#${prefix}}"
    cp "$f" "$target"
  done
}

copy_in "voice"   "voice-"
copy_in "animal"  ""          # animal/cat-meow.ogg → audio/cat-meow.ogg
copy_in "ui"      ""          # ui/ui-paw-tap.ogg   → audio/ui-paw-tap.ogg
copy_in "music"   ""          # music/music-play.ogg→ audio/music-play.ogg

# Keep manifest for reference
[ -f "$STAGE/manifest.json" ] && cp "$STAGE/manifest.json" "$LIVE/sound-manifest.json"

echo "✅ Installed to $LIVE"
echo "📊 Total OGG files: $(ls "$LIVE"/*.ogg 2>/dev/null | wc -l | tr -d ' ')"
echo ""
echo "Commit + push when you're happy with the set:"
echo "  git add apps/game/public/assets/audio/"
echo "  git commit -m 'Add Manus-delivered sound pack (55 OGGs)'"
echo "  git push"
