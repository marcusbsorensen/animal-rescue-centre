#!/usr/bin/env bash
# audit-all-variants.sh — run analyze-set-consistency.sh across every
# species × variant in the installed sprite set. Collects per-variant
# JSON into one aggregated report at asset-drafts/sprite-audit.json.
#
# Usage: tools/audit-all-variants.sh [species.variant]
#   Pass an optional filter to run only one variant (e.g. cat.ginger).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/apps/game/public/assets/animals"
OUT="$ROOT/asset-drafts/sprite-audit.json"
SCRIPT="$ROOT/tools/analyze-set-consistency.sh"

FILTER="${1:-}"

# Full variant list — matches SPECIES_VARIANTS in packages/game-logic
declare -a VARIANTS=(
  cat.ginger cat.black cat.calico cat.grey cat.siamese cat.white cat.tuxedo cat.tortie
  dog.golden dog.dalmatian dog.chocolate dog.beagle dog.husky dog.pug dog.collie dog.terrier
  fox.red fox.arctic fox.silver fox.cross fox.marble fox.fennec
  bunny.dutch bunny.lop bunny.lionhead bunny.rex bunny.angora bunny.spotted bunny.arctic
  bat.brown bat.fruit bat.longeared bat.pipistrelle bat.white
  parrot.budgie parrot.cockatiel parrot.grey parrot.macaw parrot.lovebird
  snake.corn snake.python snake.king snake.garter snake.hognose
)

STATES=(arriving sheltered eating sleeping walking growling grumpy scared sick)

mkdir -p "$(dirname "$OUT")"
echo "[" > "$OUT"
FIRST=1

i=0
total="${#VARIANTS[@]}"
for entry in "${VARIANTS[@]}"; do
  i=$((i+1))
  species="${entry%%.*}"
  variant="${entry##*.}"
  label="$entry"

  if [ -n "$FILTER" ] && [ "$FILTER" != "$label" ]; then continue; fi

  sprites=()
  for state in "${STATES[@]}"; do
    f="$ASSETS/${species}-${variant}-${state}.png"
    [ -f "$f" ] && sprites+=("$f")
  done

  if [ "${#sprites[@]}" -lt 3 ]; then
    echo "[$i/$total] $label: only ${#sprites[@]} sprites, skipping" >&2
    continue
  fi

  echo "[$i/$total] $label (${#sprites[@]} sprites)..." >&2
  result=$("$SCRIPT" "$label" "${sprites[@]}" 2>/dev/null || echo '{"label":"'"$label"'","error":"analyzer failed"}')

  [ "$FIRST" -eq 1 ] && FIRST=0 || echo "," >> "$OUT"
  echo "$result" >> "$OUT"
done

echo "]" >> "$OUT"
echo ""
echo "Done. Audit written to $OUT"

# Summary: count outliers per variant
python3 <<PYEOF
import json
try:
  with open('$OUT') as f: data = json.load(f)
except Exception as e:
  print('Could not parse audit:', e); exit(0)

print()
print(f"── Audit summary ({len(data)} variants) ──")
total_outliers = 0
major = 0
minor = 0
for entry in sorted(data, key=lambda d: -len(d.get('outliers', []))):
  out = entry.get('outliers', [])
  if not out: continue
  lbl = entry.get('label', '?')
  counts = {'major': sum(1 for o in out if o.get('severity') == 'major'),
            'minor': sum(1 for o in out if o.get('severity') == 'minor')}
  major += counts['major']; minor += counts['minor']
  total_outliers += len(out)
  print(f"  {lbl}: {len(out)} outlier(s) [{counts['major']} major, {counts['minor']} minor]")

print()
print(f"TOTAL: {total_outliers} outliers ({major} major, {minor} minor)")
PYEOF
