#!/usr/bin/env bash
# analyze-colour-drift.sh — use GPT-4o vision to diagnose how a set of
# "problem" sprites differ from a set of "accepted" sprites, in terms
# of colour / tone / saturation / warmth. Returns structured JSON that
# can be fed back into a regen prompt.
#
# Usage:
#   tools/analyze-colour-drift.sh <accepted1.png> [accepted2.png ...] -- <problem1.png> [problem2.png ...]

set -euo pipefail

# Split args on the `--` separator
ACCEPTED=()
PROBLEMS=()
SEEN_DASH=0
for arg in "$@"; do
  if [ "$arg" = "--" ]; then SEEN_DASH=1; continue; fi
  if [ "$SEEN_DASH" -eq 0 ]; then
    ACCEPTED+=("$arg")
  else
    PROBLEMS+=("$arg")
  fi
done

if [ "${#ACCEPTED[@]}" -eq 0 ] || [ "${#PROBLEMS[@]}" -eq 0 ]; then
  echo "Usage: $0 <accepted1.png> ... -- <problem1.png> ..." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${OPENAI_API_KEY:-}" ] && [ -f "$ROOT/.env.local" ]; then
  KEY_LINE="$(grep '^OPENAI_API_KEY=' "$ROOT/.env.local" | head -1 || true)"
  [ -n "$KEY_LINE" ] && export OPENAI_API_KEY="${KEY_LINE#OPENAI_API_KEY=}"
fi

# Build the JSON payload — content array with text + image_url blocks
python3 <<PYEOF
import json, base64, os, subprocess, sys

accepted = $(printf '%s\n' "${ACCEPTED[@]}" | python3 -c 'import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')
problems = $(printf '%s\n' "${PROBLEMS[@]}" | python3 -c 'import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')

def img_block(path):
  with open(path, 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
  return {
    'type': 'image_url',
    'image_url': { 'url': f'data:image/png;base64,{b64}' }
  }

content = [{
  'type': 'text',
  'text': (
    "You are a colour / tone expert reviewing a children's-book illustration sprite set for consistency. "
    f"I will show you {len(accepted)} ACCEPTED sprites (the target look) followed by {len(problems)} PROBLEM sprites. "
    "The problem sprites are of the SAME character but their fur tone has drifted. "
    "For each problem sprite, tell me CONCRETELY: "
    "(a) how its fur tone differs from the target (hue, saturation, darkness), "
    "(b) the specific direction to shift it (e.g. 'reduce red saturation, add more warm tan, lighten overall by ~15%'), "
    "(c) a one-sentence instruction I can paste into an image-gen prompt to fix it. "
    "Return your analysis as JSON with this shape: "
    '{ "target_tone": "short description", "problems": [ { "file": "name.png", "diagnosis": "...", "shift_direction": "...", "fix_instruction": "..." } ] } '
    "Be specific and terse. No preamble."
  )
}]
content.append({'type': 'text', 'text': f'--- {len(accepted)} ACCEPTED SPRITES (target look) ---'})
for p in accepted:
  content.append({'type': 'text', 'text': os.path.basename(p)})
  content.append(img_block(p))
content.append({'type': 'text', 'text': f'--- {len(problems)} PROBLEM SPRITES ---'})
for p in problems:
  content.append({'type': 'text', 'text': os.path.basename(p)})
  content.append(img_block(p))

payload = {
  'model': 'gpt-4o',
  'messages': [ { 'role': 'user', 'content': content } ],
  'max_tokens': 800,
  'response_format': { 'type': 'json_object' },
}

# POST it
import urllib.request
key = os.environ.get('OPENAI_API_KEY')
if not key:
  print('OPENAI_API_KEY not set', file=sys.stderr); sys.exit(3)

req = urllib.request.Request(
  'https://api.openai.com/v1/chat/completions',
  data=json.dumps(payload).encode(),
  headers={
    'Authorization': f'Bearer {key}',
    'Content-Type': 'application/json',
  },
)
try:
  with urllib.request.urlopen(req, timeout=120) as r:
    resp = json.load(r)
except urllib.error.HTTPError as e:
  print('HTTP', e.code, e.read().decode()[:500], file=sys.stderr)
  sys.exit(4)

msg = resp['choices'][0]['message']['content']
# Pretty-print the JSON analysis
try:
  analysis = json.loads(msg)
  print(json.dumps(analysis, indent=2))
except json.JSONDecodeError:
  print(msg)
PYEOF
