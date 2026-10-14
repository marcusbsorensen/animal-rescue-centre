#!/usr/bin/env bash
#
# A.R.C. web game: build, check, and publish to 20i (arcgame.app).
# Modelled on the Interfulgent hub's tools/deploy.sh (same rsync flags, same
# "second pass must find nothing" check, same DEPLOY_TARGET test hook).
#
#   tools/deploy-arcgame.sh              build, leak-check, show what would change, ask, upload, purge
#   tools/deploy-arcgame.sh --dry-run    the same up to the question; nothing is uploaded or purged
#   tools/deploy-arcgame.sh --yes        do not ask (needed when there is no terminal)
#   tools/deploy-arcgame.sh --purge-only purge the CDN and check the live site; no build, no upload
#   --skip-build                         use the apps/game/dist that is already there (the checks still run)
#   --allow-dirty                        go ahead although the working tree has uncommitted changes
#                                        (the build is of the working tree, so those changes would ship)
#
# Order of work, and anything that fails before "uploading" stops everything:
#   1. pnpm --filter @arc/game build
#   2. dist sanity (index.html, 404.html, sw.js, manifest, .htaccess)
#   3. tools/leak-check.mjs --public-config (the service-role key and admin password are not in
#      the build; the Supabase URL and anon key are, and the URL is not a local one)
#   4. rsync -rlc --delete apps/game/dist/ arcgame:public_html/   (dry run first, then ask)
#   5. a second dry run, which must find nothing left to change
#   6. purge the 20i CDN, then fetch the live site and say whether it shows this build
#
# The host: SSH alias `arcgame` in ~/.ssh/config. The docroot is public_html. Files in
# .well-known/ stay on the host (certificate checks), and --delete removes everything else that
# is not in the build, which includes 20i's placeholder index.php on the first deploy.
#
# CDN purge. 20i documents one way to purge its CDN: the "Purge Everything" button under
# Manage Hosting > Manage > Edge Caching. It publishes no API call for it. The hub's deploy.sh
# has no purge step either. So by default this script prints those button steps. If a 20i API key
# is available it also tries a purge-by-URL of the entry files (an UNVERIFIED route, copied from a
# third-party client, never run against the real API); if that fails it falls back to the steps.
# The key is read from $ARC_20I_API_KEY, or from the macOS keychain item "arc-20i-api-key":
#     security add-generic-password -s arc-20i-api-key -a "$USER" -w     (prompts for the key)
# It is passed to curl on stdin, so it is in no argument list, and it is never printed.
#
# Test hooks (nothing here is needed for a real deploy):
#   DEPLOY_TARGET=<folder>   upload into that folder (standing in for public_html) instead of the host;
#                            no question is asked and no purge is done
#   DEPLOY_DIST=<folder>     use that folder as the build (needs --skip-build; for testing on a scratch copy)
#   LIVE_URL=<url>           the address the final check fetches (default https://arcgame.app)
#   ARC_20I_API_BASE=<url>   the API address (default https://api.20i.com)
#   ARC_ENV_FILE=<file>      the env file leak-check reads
#
# The .htaccess is checked against a local Apache by tools/test-arcgame-htaccess.sh.
set -euo pipefail

REMOTE_HOST="${DEPLOY_REMOTE_HOST:-arcgame}"          # Host entry in ~/.ssh/config
RSYNC="${RSYNC:-/opt/homebrew/bin/rsync}"             # Apple's openrsync is too old for these flags
TARGET="${DEPLOY_TARGET:-}"
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=20"
SITE_URL="https://arcgame.app"
LIVE_URL_GIVEN="${LIVE_URL:-}"
LIVE_URL="${LIVE_URL:-$SITE_URL}"
PACKAGE_ID="${ARC_20I_PACKAGE_ID:-981c98df9aeca87b}"  # the 20i package that holds arcgame.app
KEYCHAIN_SERVICE="arc-20i-api-key"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${DEPLOY_DIST:-$REPO/apps/game/dist}"

DRY=0; YES=0; SKIP_BUILD=0; ALLOW_DIRTY=0; PURGE_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --yes) YES=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --purge-only) PURGE_ONLY=1 ;;
    -h|--help) sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: unknown option $arg" >&2; exit 2 ;;
  esac
done

WORK="$(mktemp -d "${TMPDIR:-/tmp}/arcgame-deploy.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# ---- the CDN: purge, then look at the live site --------------------------------

print_manual_purge() {
  cat <<'EOF'
==> CDN purge, by hand (about a minute):
      1. my.20i.com > Manage Hosting > arcgame.app > Manage > Edge Caching
      2. Click "Purge Everything".
    Until then visitors may be served the old index.html. Run
    `tools/deploy-arcgame.sh --purge-only` afterwards to see whether the live site is on the new build.
EOF
}

purge_cdn() {
  local key="${ARC_20I_API_KEY:-}"
  if [ -z "$key" ] && command -v security >/dev/null 2>&1; then
    key="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null || true)"
  fi
  if [ -z "$key" ]; then
    echo "==> CDN purge: no 20i API key set (\$ARC_20I_API_KEY or keychain item $KEYCHAIN_SERVICE)."
    print_manual_purge
    return 0
  fi
  echo "==> CDN purge: trying the API for the entry files (unverified route)"
  local base="${ARC_20I_API_BASE:-https://api.20i.com}" auth path code bad=0
  auth="$(printf '%s' "$key" | base64 | tr -d '\n')"
  key=""
  for path in "" index.html sw.js manifest.webmanifest asset-manifest.json; do
    # The header goes in on stdin (curl -K -), so it is never in a process listing.
    code="$(printf 'header = "Authorization: Bearer %s"\n' "$auth" | curl -sS -K - --max-time 30 \
      -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d "{\"url\":\"$SITE_URL/$path\"}" \
      "$base/package/$PACKAGE_ID/web/purgeCdnByUrl" 2>/dev/null || true)"
    case "$code" in
      2??) echo "    purged $SITE_URL/$path" ;;
      *) echo "    $SITE_URL/$path: the API answered ${code:-no reply}"; bad=1 ;;
    esac
  done
  auth=""
  if [ "$bad" = 1 ]; then
    echo "    The API route did not work, so the CDN is probably NOT purged."
    print_manual_purge
  else
    echo "    The API accepted every request. The check below shows whether visitors see the new build."
  fi
}

live_check() {
  # Compare the entry bundle that the live index.html names with the one in dist.
  local want got rc=0
  want="$(grep -o '/assets/index-[A-Za-z0-9_-]*\.js' "$DIST/index.html" | head -1 || true)"
  curl -fsS --max-time 30 -o "$WORK/live.html" "$LIVE_URL/" 2>"$WORK/live.err" || rc=$?
  if [ "$rc" != 0 ]; then
    echo "==> live check: could not fetch $LIVE_URL/ (curl exit $rc)."
    if [ "$rc" = 60 ] || [ "$rc" = 35 ] || [ "$rc" = 51 ] || [ "$rc" = 58 ]; then
      echo "    That is a certificate or TLS problem. Until 20i's certificate for arcgame.app is live, do not tell anyone the address."
    fi
    head -c 300 "$WORK/live.err" | head -3 || true
    return 0
  fi
  got="$(grep -o '/assets/index-[A-Za-z0-9_-]*\.js' "$WORK/live.html" | head -1 || true)"
  if [ -n "$want" ] && [ "$got" = "$want" ]; then
    echo "==> live check: $LIVE_URL/ serves this build ($want)."
  else
    echo "==> live check: $LIVE_URL/ names '${got:-no entry bundle}', this build is '$want'."
    echo "    The CDN is probably still holding the old page."
    print_manual_purge
  fi
}

if [ "$PURGE_ONLY" = 1 ]; then
  [ -f "$DIST/index.html" ] || { echo "ERROR: $DIST/index.html missing. Build first (drop --purge-only)." >&2; exit 1; }
  purge_cdn
  live_check
  exit 0
fi

# ---- preconditions ---------------------------------------------------------------

cd "$REPO"
if [ "$ALLOW_DIRTY" = 0 ] && [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: the working tree has uncommitted changes, and the build is of the working tree. Commit first, or pass --allow-dirty." >&2
  exit 1
fi
[ -x "$RSYNC" ] || { echo "ERROR: $RSYNC not found: brew install rsync" >&2; exit 1; }
COMMIT="$(git rev-parse --short HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# ---- 1. build -----------------------------------------------------------------------

if [ -n "${DEPLOY_DIST:-}" ] && [ "$SKIP_BUILD" = 0 ]; then
  echo "ERROR: DEPLOY_DIST points at a folder the build does not write to; pass --skip-build." >&2
  exit 2
fi
if [ "$SKIP_BUILD" = 1 ]; then
  echo "==> skipping the build: using the existing $DIST"
else
  echo "==> building $BRANCH @ $COMMIT"
  pnpm --filter @arc/game build
fi

# ---- 2. dist sanity (protects --delete from an empty or half-built folder) -----------

for f in index.html 404.html sw.js manifest.webmanifest; do
  [ -s "$DIST/$f" ] || { echo "ERROR: $DIST/$f is missing or empty. Nothing was uploaded." >&2; exit 1; }
done
if [ ! -f "$DIST/.htaccess" ]; then
  echo "==> .htaccess was not in the build; adding it from apps/game/public/"
  cp "$REPO/apps/game/public/.htaccess" "$DIST/.htaccess"
fi
cmp -s "$REPO/apps/game/public/.htaccess" "$DIST/.htaccess" \
  || { echo "ERROR: $DIST/.htaccess differs from apps/game/public/.htaccess (a stale build?). Nothing was uploaded." >&2; exit 1; }
FILES="$(find "$DIST" -type f | wc -l | tr -d ' ')"
if [ "$FILES" -lt 200 ]; then
  echo "ERROR: the build has only $FILES files; --delete would empty the site. Nothing was uploaded." >&2
  exit 1
fi
echo "==> build: $FILES files, $(du -sh "$DIST" | cut -f1)"

# ---- 3. leak check ---------------------------------------------------------------------

echo "==> leak check"
node "$REPO/tools/leak-check.mjs" --dist "$DIST" --public-config \
  || { echo "ERROR: the leak check did not pass. Nothing was uploaded." >&2; exit 1; }

# ---- 4. what would change ------------------------------------------------------------------

FLAGS=(-rlc --delete --itemize-changes --chmod=D755,F644 --exclude '.DS_Store' --exclude '.well-known/')
if [ -n "$TARGET" ]; then
  mkdir -p "$TARGET"
  DEST="$TARGET/"; RSH=()
else
  DEST="$REMOTE_HOST:public_html/"; RSH=(-e "ssh $SSH_OPTS")
fi

sync_dist() { # $1: "-n" for a dry run, "" otherwise
  local extra=()
  [ -n "$1" ] && extra=("$1")
  "$RSYNC" "${FLAGS[@]}" ${extra[@]+"${extra[@]}"} ${RSH[@]+"${RSH[@]}"} "$DIST/" "$DEST"
}

echo "==> comparing with ${TARGET:-$REMOTE_HOST:public_html} (nothing is changed yet)"
sync_dist -n > "$WORK/plan.txt"
NEW="$(grep -c '^>f+++++++++' "$WORK/plan.txt" || true)"
SENT="$(grep -c '^>f' "$WORK/plan.txt" || true)"
GONE="$(grep -c '^\*deleting' "$WORK/plan.txt" || true)"
echo "    $SENT file(s) to send ($NEW new, $((SENT - NEW)) changed), $GONE to delete"
if [ "$GONE" -gt 0 ]; then
  echo "    to delete:"
  grep '^\*deleting' "$WORK/plan.txt" | head -25 | sed 's/^\*deleting  */      /'
  [ "$GONE" -gt 25 ] && echo "      ... and $((GONE - 25)) more"
fi
if [ "$((SENT - NEW))" -gt 0 ]; then
  echo "    changed:"
  grep '^>f' "$WORK/plan.txt" | grep -v '^>f+++++++++' | head -15 | sed 's/^[^ ]* */      /'
  [ "$((SENT - NEW))" -gt 15 ] && echo "      ... and $((SENT - NEW - 15)) more"
fi

if [ "$DRY" = 1 ]; then
  echo "Dry run: nothing was uploaded or purged. Rerun without --dry-run to deploy $BRANCH @ $COMMIT."
  if [ -z "$TARGET" ]; then echo "(The comparison read the host over SSH; it changed nothing.)"; fi
  exit 0
fi

# ---- 5. ask, then upload ----------------------------------------------------------------------

if [ -z "$TARGET" ] && [ "$YES" = 0 ]; then
  if [ ! -t 0 ]; then
    echo "ERROR: there is no terminal to ask on. Pass --yes to go ahead." >&2
    exit 1
  fi
  printf 'Upload %s @ %s to %s and delete the %s file(s) listed above? Type yes to continue: ' \
    "$BRANCH" "$COMMIT" "$SITE_URL" "$GONE"
  read -r answer
  [ "$answer" = "yes" ] || { echo "Cancelled. Nothing was uploaded."; exit 1; }
fi

echo "==> uploading $BRANCH @ $COMMIT"
sync_dist "" | tail -n 3
echo "==> verifying: a second pass must find nothing to change"
LEFT="$(sync_dist -n)"
if [ -n "$LEFT" ]; then
  echo "ERROR: files still differ after the upload:" >&2
  echo "$LEFT" | head -20 >&2
  exit 1
fi

# ---- 6. CDN and the live site ---------------------------------------------------------------------

if [ -n "$TARGET" ]; then
  echo "==> CDN purge: skipped (local target)"
  if [ -n "$LIVE_URL_GIVEN" ]; then live_check; fi
else
  purge_cdn
  live_check
fi
echo "Deployed $BRANCH @ $COMMIT."

