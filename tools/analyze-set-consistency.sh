#!/usr/bin/env bash
# analyze-set-consistency.sh — use GPT-4o vision to find outliers within
# a sprite set (one variant, multiple states). Returns JSON listing which
# sprites look consistent with the group and which drift, with concrete
# fix instructions.
#
# Usage:
#   tools/analyze-set-consistency.sh <label> <sprite1.png> [sprite2.png ...]
#
# Output:
#   JSON on stdout. Schema:
#     {
#       "label": "cat.ginger",
#       "consensus": "short description of the group's target look",
#       "consistent": ["cat-ginger-walking.png", ...],
#       "outliers": [
#         { "file": "cat-ginger-sleeping.png",
#           "diagnosis": "...", "severity": "major|minor",
#           "fix_instruction": "..." },
#         ...
#       ]
#     }

set -euo pipefail

if [ "${#}" -lt 2 ]; then
  echo "Usage: $0 <label> <sprite1.png> [sprite2.png ...]" >&2
  exit 1
fi

LABEL="$1"; shift
SPRITES=("$@")

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${OPENAI_API_KEY:-}" ] && [ -f "$ROOT/.env.local" ]; then
  KEY_LINE="$(grep '^OPENAI_API_KEY=' "$ROOT/.env.local" | head -1 || true)"
  [ -n "$KEY_LINE" ] && export OPENAI_API_KEY="${KEY_LINE#OPENAI_API_KEY=}"
fi

python3 <<PYEOF
import json, base64, os, sys, urllib.request

label = $(printf '%s' "$LABEL" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
sprites = $(printf '%s\n' "${SPRITES[@]}" | python3 -c 'import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')

def img_block(path):
  with open(path, 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
  return { 'type': 'image_url', 'image_url': { 'url': f'data:image/png;base64,{b64}' } }

# Build content array
content = [{
  'type': 'text',
  'text': (
    f"You are reviewing a set of children's-book sprite illustrations of the SAME CHARACTER ({label}) "
    f"across different emotional/activity states ({len(sprites)} images). They will be used in a game "
    "where consistency across the set is critical — they must read as the SAME INDIVIDUAL, and sprites "
    "in the same state must share body geometry so a single anchor-point places every variant correctly. "
    "\n\n"
    "SPECIFIC ISSUE PATTERNS to check for (drawn from previous QA rounds on this project):\n"
    "1. FUR / PLUMAGE / SCALE COLOUR DRIFT — tone, saturation, brightness, hue must be consistent across the set. "
    "   Flag any sprite that is noticeably darker, lighter, redder, more-orange, or differently-saturated than its siblings.\n"
    "2. BODY-PART SIZING — ears, muzzle, tail, legs must be proportionally consistent across the set. "
    "   Flag sprites where ears are bigger/smaller than the group, muzzle is longer/shorter (e.g. some breeds "
    "   have been given 'fox-like long muzzles' when the group has 'short child-like snouts'), tail length varies.\n"
    "3. POSTURE INCONSISTENCY — within a single state (e.g. all sprites of the same state across variants), "
    "   the body geometry should match: hanging states must be hanging, sitting states sitting, flying states flying. "
    "   Flag sprites where the posture doesn't match the expected for its state.\n"
    "4. ANTHROPOMORPHISING — no sprite should stand on hind legs with front paws crossed like a human, "
    "   arms akimbo, or any human-like posture. Flag any such sprites.\n"
    "5. FACE ORIENTATION FOR HANGING ANIMALS — when an animal is hanging upside-down, the face should appear "
    "   upside-down in the image (forehead above eyes if mentally rotating to right-way-up). "
    "   Flag hanging sprites with faces drawn right-way-up.\n"
    "6. OBJECT RULES per state:\n"
    "   - arriving: NO prop of any kind — no box, crate, carrier, blanket, pouch or toy. The animal alone, "
    "     uncertain and a little hunched. Arrival props are separate composited objects now, not baked in.\n"
    "   - sheltered: NO OBJECTS — just the animal on transparent background.\n"
    "   - eating: NO bowl, NO dish, NO food, NO mat. Head-down at an implied spot on bare ground. "
    "     The bowl is painted into bg-kitchen.png and the food is a separate draggable sprite; "
    "     a bowl in the sprite double-prints and the dragged food lands in the painted one. "
    "     See docs/sprite-pose-spec-2026-09-05.md.\n"
    "   - sleeping: NO OBJECTS.\n"
    "   - walking: NO OBJECTS, and CRITICALLY no collar, lead, harness, tag or bandana — the neck and chest "
    "     must be bare. WalkScene draws the collar as vector from collar-anchors.json and the player picks "
    "     its colour. (Flying/slithering counts as walking for bats, birds and snakes.)\n"
    "   - playing: NO ball, feather, yarn, leaves, bell or toy. Paws and mouth EMPTY — the game draws "
    "     toys as separate objects near the bottom of the screen.\n"
    "   - growling / grumpy / scared / sick: NO OBJECTS (animals should not be on branches or on cushions).\n"
    "7. EXPRESSION MATCHING STATE — arriving animals should look insecure/uncertain, not happy; "
    "   sick animals should look pitiful, not scary; walking animals should look neutral-happy, not angry.\n"
    "8. FLOOR SHADOWS — no sprite should have a baked-in floor shadow (transparency only).\n"
    "9. STYLE FIDELITY — all must be the same painterly chibi children's-book style; "
    "   flag any that are more photo-realistic, cartoon-flat, or age-drifted (e.g. a young chibi animal "
    "   rendered as an older version of itself).\n"
    "\n"
    "Return JSON with this shape:\n"
    '{ "consensus": "1-2 sentence description of the target look (colour, proportions, style, overall feel)", '
    '  "consistent": [filenames that match consensus], '
    '  "outliers": [ { "file": "x.png", '
    '                  "diagnosis": "what is specifically off — reference the issue pattern number if applicable", '
    '                  "severity": "major" or "minor", '
    '                  "fix_instruction": "single actionable sentence for a regen prompt" } ] } '
    "\n"
    "Be strict on consistency, lenient on state-appropriate variation (closed eyes in sleeping is fine; "
    "bared teeth in growling is fine; splayed wings in flying is fine). "
    "Do flag per-state issues too — e.g. a hanging bat with a right-way-up face, or a sheltered sprite "
    "sitting on a cushion. If everything looks consistent and state-appropriate, return empty outliers."
  )
}]
for p in sprites:
  content.append({'type': 'text', 'text': os.path.basename(p)})
  content.append(img_block(p))

payload = {
  'model': 'gpt-4o',
  'messages': [ { 'role': 'user', 'content': content } ],
  'max_tokens': 1200,
  'response_format': { 'type': 'json_object' },
}

key = os.environ.get('OPENAI_API_KEY')
if not key:
  print('OPENAI_API_KEY not set', file=sys.stderr); sys.exit(3)

req = urllib.request.Request(
  'https://api.openai.com/v1/chat/completions',
  data=json.dumps(payload).encode(),
  headers={ 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json' },
)
try:
  with urllib.request.urlopen(req, timeout=180) as r:
    resp = json.load(r)
except urllib.error.HTTPError as e:
  print('HTTP', e.code, e.read().decode()[:500], file=sys.stderr)
  sys.exit(4)

msg = resp['choices'][0]['message']['content']
try:
  analysis = json.loads(msg)
  analysis['label'] = label
  print(json.dumps(analysis, indent=2))
except json.JSONDecodeError:
  print(msg)
PYEOF
