#!/usr/bin/env bash
# gpt-image-regen.sh — call OpenAI's gpt-image with reference images (character-lock)
# to regenerate a single sprite. Reads OPENAI_API_KEY from .env.local.
#
# Usage:
#   tools/gpt-image-regen.sh <output.png> <"prompt"> <ref1.png> [ref2.png ...]
#
# Env:
#   GPT_IMAGE_MODEL   — gpt-image-1.5 | gpt-image-2 (default: gpt-image-1.5)
#                       Note: gpt-image-2 requires org verification
#                       (platform.openai.com → Settings → Organization → Verify).
#   GPT_IMAGE_QUALITY — low | medium | high (default: medium)
#   GPT_IMAGE_SIZE    — 1024x1024 | 512x512 (default: 1024x1024)
#
# Cost (rough):
#   low ≈ $0.011/img · medium ≈ $0.042/img · high ≈ $0.167/img

set -euo pipefail

if [ "${#}" -lt 3 ]; then
  echo "Usage: $0 <output.png> <prompt> <ref1.png> [ref2.png ...]" >&2
  exit 1
fi

OUTPUT_PATH="$1"; shift
PROMPT="$1"; shift

# Resolve project root from script location + load env
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${OPENAI_API_KEY:-}" ] && [ -f "$ROOT/.env.local" ]; then
  KEY_LINE="$(grep '^OPENAI_API_KEY=' "$ROOT/.env.local" | head -1 || true)"
  if [ -n "$KEY_LINE" ]; then
    export OPENAI_API_KEY="${KEY_LINE#OPENAI_API_KEY=}"
  fi
fi
if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "ERROR: OPENAI_API_KEY not set (not in env, not in $ROOT/.env.local)" >&2
  exit 2
fi
# Optional: OpenAI-Organization header (required once org is verified and
# we want to route requests through gpt-image-2). Read from .env.local if
# not already in env.
if [ -z "${OPENAI_ORG_ID:-}" ] && [ -f "$ROOT/.env.local" ]; then
  ORG_LINE="$(grep '^OPENAI_ORG_ID=' "$ROOT/.env.local" | head -1 || true)"
  [ -n "$ORG_LINE" ] && export OPENAI_ORG_ID="${ORG_LINE#OPENAI_ORG_ID=}"
fi

MODEL="${GPT_IMAGE_MODEL:-gpt-image-1.5}"
QUALITY="${GPT_IMAGE_QUALITY:-medium}"
SIZE="${GPT_IMAGE_SIZE:-1024x1024}"

# Build the curl command — use -F for multipart; image[] for multiple refs
CURL_ARGS=(
  -s -X POST "https://api.openai.com/v1/images/edits"
  -H "Authorization: Bearer $OPENAI_API_KEY"
)
# Add org header if we have one (required once org is verified for gpt-image-2)
if [ -n "${OPENAI_ORG_ID:-}" ]; then
  CURL_ARGS+=(-H "OpenAI-Organization: $OPENAI_ORG_ID")
fi
CURL_ARGS+=(
  -F "model=$MODEL"
  -F "prompt=$PROMPT"
  -F "size=$SIZE"
  -F "quality=$QUALITY"
  -F "background=transparent"
  -F "output_format=png"
  -F "n=1"
)
for REF in "$@"; do
  if [ ! -f "$REF" ]; then
    echo "ERROR: reference missing: $REF" >&2
    exit 3
  fi
  CURL_ARGS+=(-F "image[]=@$REF")
done

# Call the API — keep response as JSON for error inspection
RESP_FILE="$(mktemp -t gpt-image-resp.XXXXXX).json"
trap 'rm -f "$RESP_FILE"' EXIT

HTTP_CODE="$(curl "${CURL_ARGS[@]}" -o "$RESP_FILE" -w "%{http_code}")"

if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: HTTP $HTTP_CODE from OpenAI" >&2
  # Extract error message without exposing the full response body's sensitive parts
  python3 -c "
import json, sys
try:
  d = json.load(open('$RESP_FILE'))
  e = d.get('error', {})
  print('  message:', e.get('message', '(none)'), file=sys.stderr)
  print('  type:   ', e.get('type', '(none)'), file=sys.stderr)
  print('  code:   ', e.get('code', '(none)'), file=sys.stderr)
except Exception as ex:
  print('  (could not parse response)', ex, file=sys.stderr)
"
  exit 4
fi

# Pull b64_json -> decode -> write
python3 <<PYEOF
import json, base64, sys
with open('$RESP_FILE') as f:
  d = json.load(f)
data = d.get('data', [])
if not data:
  print('ERROR: empty data[] in response', file=sys.stderr)
  sys.exit(5)
b64 = data[0].get('b64_json') or data[0].get('url')
if not b64:
  print('ERROR: no b64_json or url in data[0]', file=sys.stderr)
  sys.exit(6)
# Assume b64_json for now (gpt-image-2 default)
with open('$OUTPUT_PATH', 'wb') as f:
  f.write(base64.b64decode(b64))
PYEOF

SIZE_KB=$(du -k "$OUTPUT_PATH" | cut -f1)
echo "OK: wrote $OUTPUT_PATH (${SIZE_KB} KB, quality=$QUALITY, size=$SIZE)"
