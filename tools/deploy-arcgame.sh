#!/usr/bin/env bash
#
# A.R.C. on 20i. Modelled on the Interfulgent hub's tools/deploy.sh (same rsync flags, same
# "second pass must find nothing" check, same DEPLOY_TARGET test hook). Two deploys:
#
#   THE GAME      https://play.arcgame.app    apps/game/dist       -> the play subdomain's folder
#   THE SITE      https://arcgame.app         tools/site-holding/  -> public_html   (--site)
#
#   tools/deploy-arcgame.sh --game-dir play.arcgame.app           build, leak-check, show what would change, ask, upload, purge
#       (play.arcgame.app is the play subdomain's folder on the host, from the ssh home: ~/play.arcgame.app,
#        beside public_html. It is passed in, never assumed.)
#   tools/deploy-arcgame.sh --game-dir <folder> --dry-run         the same up to the question; nothing is uploaded or purged
#   tools/deploy-arcgame.sh --site --game-dir <folder>            the holding folder (the site later) to public_html, protecting the game
#   --yes                                                         do not ask (needed when there is no terminal)
#   --purge-only                                                  purge the CDN and check the live site; no build, no upload
#   --skip-build                                                  use the apps/game/dist that is already there (the checks still run)
#   --allow-dirty                                                 go ahead although the working tree has uncommitted changes
#                                                                 (the game is built from the working tree, so those changes would ship)
#   --keep <path>                                                 (--site) also protect <path> inside public_html; repeatable
#   --site-dir <folder>                                           (--site) deploy this local folder instead of tools/site-holding
#   --allow-many-deletes                                          (--site) go ahead although more than 50 files would be deleted
#
# THE GAME'S FOLDER IS A SETTING WITH NO DEFAULT: --game-dir <folder>, or $ARC_GAME_REMOTE_DIR. It is
# the play subdomain's document root on the host (a path from the account's home, or absolute). The
# script refuses to run without it, and refuses, before it builds anything, if on the host that folder
#   - does not exist (it NEVER creates one: no mkdir on the host, ever),
#   - is public_html itself, or the home folder, or holds either of them,
#   - or is outside the account's home.
# The game deploy therefore cannot run rsync --delete into public_html. These checks are read-only
# (`cd <folder> && pwd -P` over ssh). The SITE deploy needs the same setting, to know where the game is.
#
# THE SITE DEPLOY keeps /.well-known/ (certificate checks) and the game's folder if it sits inside
# public_html (found from the setting above, on the host), and any --keep path. --delete removes
# everything else that is not in the folder, 20i's placeholder index.php included. If it would delete
# more than 50 files it stops: something that should be protected probably is not.
#
# Order of work for the game; anything that fails before "uploading" stops everything:
#   1. the host checks above
#   2. pnpm --filter @arc/game build
#   3. dist sanity (index.html, 404.html, sw.js, manifest, .htaccess)
#   4. tools/leak-check.mjs --public-config (the service-role key and admin password are not in
#      the build; the Supabase URL and anon key are, and the URL is not a local one)
#   5. rsync -rlc --delete apps/game/dist/ arcgame:<folder>/   (dry run first, then ask)
#   6. a second dry run, which must find nothing left to change
#   7. purge the 20i CDN, then fetch the live site and say whether it shows this build
#
# The host: SSH alias `arcgame` in ~/.ssh/config. Files in .well-known/ stay on the host (certificate
# checks).
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
#   DEPLOY_TARGET=<folder>   upload into that local folder instead of the host (standing in for the game's
#                            folder, or for public_html with --site); no host checks, no question, no purge
#   DEPLOY_DIST=<folder>     use that folder as the build (needs --skip-build; for testing on a scratch copy)
#   DEPLOY_SSH=<command>     the ssh to use for the read-only host checks (a fake, in tests)
#   RSYNC=<command>          the rsync to use (a fake, in tests)
#   LIVE_URL=<url>           the address the final check fetches (default the game's or the site's real address)
#   ARC_20I_API_BASE=<url>   the API address (default https://api.20i.com)
#   ARC_ENV_FILE=<file>      the env file leak-check reads
#
# The .htaccess files are checked against a local Apache by tools/test-arcgame-htaccess.sh, and this
# script's guards by tools/test-deploy-arcgame.sh.
set -euo pipefail

REMOTE_HOST="${DEPLOY_REMOTE_HOST:-arcgame}"          # Host entry in ~/.ssh/config
RSYNC="${RSYNC:-/opt/homebrew/bin/rsync}"             # Apple's openrsync is too old for these flags
SSH_BIN="${DEPLOY_SSH:-ssh}"
TARGET="${DEPLOY_TARGET:-}"
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=20"
GAME_URL="https://play.arcgame.app"
SITE_URL="https://arcgame.app"
LIVE_URL_GIVEN="${LIVE_URL:-}"
PACKAGE_ID="${ARC_20I_PACKAGE_ID:-981c98df9aeca87b}"  # the 20i package that holds arcgame.app
KEYCHAIN_SERVICE="arc-20i-api-key"
MAX_DELETES=50
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${DEPLOY_DIST:-$REPO/apps/game/dist}"
SITE_LOCAL_DIR="$REPO/tools/site-holding"
GAME_REMOTE_DIR="${ARC_GAME_REMOTE_DIR:-}"           # no default, on purpose

DRY=0; YES=0; SKIP_BUILD=0; ALLOW_DIRTY=0; PURGE_ONLY=0; SITE=0; ALLOW_MANY=0
KEEP=()
need_value() { [ "$1" -ge 2 ] || { echo "ERROR: $2 needs a value." >&2; exit 2; }; }
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --yes) YES=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --purge-only) PURGE_ONLY=1 ;;
    --site) SITE=1 ;;
    --allow-many-deletes) ALLOW_MANY=1 ;;
    --game-dir) need_value $# "$1"; GAME_REMOTE_DIR="$2"; shift ;;
    --game-dir=*) GAME_REMOTE_DIR="${1#--game-dir=}" ;;
    --site-dir) need_value $# "$1"; SITE_LOCAL_DIR="$2"; shift ;;
    --site-dir=*) SITE_LOCAL_DIR="${1#--site-dir=}" ;;
    --keep) need_value $# "$1"; KEEP+=("$2"); shift ;;
    --keep=*) KEEP+=("${1#--keep=}") ;;
    -h|--help) sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: unknown option $1" >&2; exit 2 ;;
  esac
  shift
done

WORK="$(mktemp -d "${TMPDIR:-/tmp}/arcgame-deploy.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

refuse() { echo "ERROR: $*" >&2; exit 2; }

if [ "$SITE" = 1 ]; then LIVE_BASE="$SITE_URL"; else LIVE_BASE="$GAME_URL"; fi
LIVE_URL="${LIVE_URL:-$LIVE_BASE}"

# ---- the CDN: purge, then look at the live site --------------------------------

print_manual_purge() {
  cat <<'EOF'
==> CDN purge, by hand (about a minute):
      1. my.20i.com > Manage Hosting > the package for arcgame.app > Manage > Edge Caching
      2. Click "Purge Everything".
    Until then visitors may be served old pages. Run `tools/deploy-arcgame.sh --purge-only`
    (add --site for arcgame.app) afterwards to see whether the live site is up to date.
EOF
}

purge_cdn() { # $1 base url, the rest: paths under it ("" is the front door)
  local base_url="$1"; shift
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
  local api="${ARC_20I_API_BASE:-https://api.20i.com}" auth path code bad=0
  auth="$(printf '%s' "$key" | base64 | tr -d '\n')"
  key=""
  for path in "$@"; do
    # The header goes in on stdin (curl -K -), so it is never in a process listing.
    code="$(printf 'header = "Authorization: Bearer %s"\n' "$auth" | curl -sS -K - --max-time 30 \
      -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d "{\"url\":\"$base_url/$path\"}" \
      "$api/package/$PACKAGE_ID/web/purgeCdnByUrl" 2>/dev/null || true)"
    case "$code" in
      2??) echo "    purged $base_url/$path" ;;
      *) echo "    $base_url/$path: the API answered ${code:-no reply}"; bad=1 ;;
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

purge_game() { purge_cdn "$GAME_URL" "" index.html sw.js manifest.webmanifest asset-manifest.json; }
purge_site() { purge_cdn "$SITE_URL" ""; }

tls_note() { # $1 curl exit code
  if [ "$1" = 60 ] || [ "$1" = 35 ] || [ "$1" = 51 ] || [ "$1" = 58 ]; then
    echo "    That is a certificate or TLS problem. Until 20i's certificate for this name is live, do not tell anyone the address."
  fi
}

live_check_game() {
  # Compare the entry bundle that the live index.html names with the one in dist.
  local want got rc=0
  want="$(grep -o '/assets/index-[A-Za-z0-9_-]*\.js' "$DIST/index.html" | head -1 || true)"
  curl -fsS --max-time 30 -o "$WORK/live.html" "$LIVE_URL/" 2>"$WORK/live.err" || rc=$?
  if [ "$rc" != 0 ]; then
    echo "==> live check: could not fetch $LIVE_URL/ (curl exit $rc)."
    tls_note "$rc"
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

live_check_site() {
  # The site is a redirect today and a website later, so this reports what it answers, not a verdict.
  local rc=0 status loc
  curl -sS --max-time 30 -o /dev/null -D "$WORK/live.hdr" "$LIVE_URL/" 2>"$WORK/live.err" || rc=$?
  if [ "$rc" != 0 ]; then
    echo "==> live check: could not fetch $LIVE_URL/ (curl exit $rc)."
    tls_note "$rc"
    head -c 300 "$WORK/live.err" | head -3 || true
    return 0
  fi
  status="$(head -1 "$WORK/live.hdr" | tr -d '\r')"
  loc="$(awk 'tolower($1) == "location:" { sub(/^[^:]*: */, ""); sub(/\r$/, ""); print; exit }' "$WORK/live.hdr")"
  echo "==> live check: $LIVE_URL/ answers: $status${loc:+ -> $loc}"
}

if [ "$PURGE_ONLY" = 1 ]; then
  if [ "$SITE" = 1 ]; then
    purge_site
    live_check_site
  else
    [ -f "$DIST/index.html" ] || { echo "ERROR: $DIST/index.html missing. Build first (drop --purge-only)." >&2; exit 1; }
    purge_game
    live_check_game
  fi
  exit 0
fi

# ---- 1. where it goes: checks that read the host, and change nothing ------------------------

host_run() { "$SSH_BIN" $SSH_OPTS "$REMOTE_HOST" "$1"; }

GAME_REAL=""; PUBLIC_REAL=""; HOME_REAL=""
PROTECT=()          # paths under public_html the site deploy must not delete, as /name/

check_folder_setting() {
  local d="$GAME_REMOTE_DIR"
  [ -n "$d" ] || refuse "no remote folder for the game. Set ARC_GAME_REMOTE_DIR or pass --game-dir <folder>.
       It is the play subdomain's document root on the host, and there is no default: the script
       must not guess where the game goes. (Once the subdomain exists, the read-only
       \`ssh arcgame 'ls -la ~'\` shows where it is.)"
  case "$d" in
    "~"*|*..*) refuse "--game-dir '$d': no ~ and no .. in it. Give a path from the account's home, or an absolute path." ;;
  esac
  # strip a leading ./ and any trailing slashes, then look for the folders that must never be a game target
  local n="${d#./}"
  while [ "${n%/}" != "$n" ]; do n="${n%/}"; done
  case "$n" in
    ""|"."|"/"|public_html) refuse "--game-dir '$d' is public_html, the home folder or the root. The game deploy never runs rsync --delete there." ;;
  esac
  GAME_REMOTE_DIR="$n"
}

resolve_on_host() {
  local q
  q="$(printf '%q' "$GAME_REMOTE_DIR")"
  GAME_REAL="$(host_run "cd -- $q && pwd -P" 2>/dev/null)" \
    || refuse "the folder '$GAME_REMOTE_DIR' does not exist on the host ($REMOTE_HOST), or cannot be entered. This script never creates one:
       add the play subdomain in My20i first, then pass its real document root."
  HOME_REAL="$(host_run 'cd && pwd -P' 2>/dev/null)" || refuse "could not read the account's home folder over ssh."
  PUBLIC_REAL="$(host_run 'cd public_html && pwd -P' 2>/dev/null)" || refuse "the account has no public_html (or ssh failed)."
  [ -n "$GAME_REAL" ] && [ -n "$HOME_REAL" ] && [ -n "$PUBLIC_REAL" ] || refuse "the host did not answer the folder checks."
  case "$GAME_REAL" in /*) ;; *) refuse "the host gave a relative path ('$GAME_REAL') for the folder." ;; esac
  [ "$GAME_REAL" != "$PUBLIC_REAL" ] || refuse "'$GAME_REMOTE_DIR' is public_html itself ($PUBLIC_REAL). The game deploy never runs rsync --delete there."
  [ "$GAME_REAL" != "$HOME_REAL" ] || refuse "'$GAME_REMOTE_DIR' is the account's home folder ($HOME_REAL)."
  case "$PUBLIC_REAL/" in "$GAME_REAL"/*) refuse "'$GAME_REMOTE_DIR' ($GAME_REAL) contains public_html." ;; esac
  case "$HOME_REAL/" in "$GAME_REAL"/*) refuse "'$GAME_REMOTE_DIR' ($GAME_REAL) contains the account's home folder." ;; esac
  case "$GAME_REAL/" in "$HOME_REAL"/*) ;; *) refuse "'$GAME_REMOTE_DIR' ($GAME_REAL) is outside the account's home ($HOME_REAL)." ;; esac
  echo "==> host: the game's folder is $GAME_REAL (exists; not public_html, not the home folder)"
}

NORMALISED=""
normalise_keep() { # a path under public_html -> $NORMALISED as /a/b/ (not in a subshell: refuse must stop the script)
  local k="$1"
  while [ "${k#/}" != "$k" ]; do k="${k#/}"; done
  while [ "${k%/}" != "$k" ]; do k="${k%/}"; done
  case "$k" in
    ""|*..*|*//*) refuse "--keep '$1' is not a path inside public_html." ;;
  esac
  printf '%s' "$k" | grep -q -E '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$' || refuse "--keep '$1' has characters this script will not put in a filter."
  NORMALISED="/$k/"
}

if [ -z "$TARGET" ]; then
  check_folder_setting
  resolve_on_host
fi

if [ "$SITE" = 1 ]; then
  PROTECT=("/.well-known/")
  if [ -z "$TARGET" ]; then
    case "$GAME_REAL/" in
      "$PUBLIC_REAL"/*)
        rel="${GAME_REAL#"$PUBLIC_REAL"/}"
        normalise_keep "$rel"; PROTECT+=("$NORMALISED")
        echo "==> host: the game's folder is inside public_html, so the site deploy will not touch /${rel}/"
        ;;
      *) echo "==> host: the game's folder is outside public_html; nothing of it is in the way" ;;
    esac
  fi
  for k in ${KEEP[@]+"${KEEP[@]}"}; do normalise_keep "$k"; PROTECT+=("$NORMALISED"); done
fi

# ---- preconditions ---------------------------------------------------------------

cd "$REPO"
if [ "$ALLOW_DIRTY" = 0 ] && [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: the working tree has uncommitted changes, and what is deployed comes from the working tree. Commit first, or pass --allow-dirty." >&2
  exit 1
fi
[ -x "$RSYNC" ] || { echo "ERROR: $RSYNC not found: brew install rsync" >&2; exit 1; }
COMMIT="$(git rev-parse --short HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ "$SITE" = 1 ]; then
  # ---- the site: what is being sent -------------------------------------------------------
  [ -d "$SITE_LOCAL_DIR" ] || refuse "--site-dir '$SITE_LOCAL_DIR' is not a folder."
  SRC="$(cd "$SITE_LOCAL_DIR" && pwd -P)"
  GAME_DIST_REAL="$(cd "$REPO/apps/game" && pwd -P)/dist"
  [ "$SRC" != "$GAME_DIST_REAL" ] && [ ! -e "$SRC/sw.js" ] && [ ! -d "$SRC/assets" ] \
    || refuse "$SRC looks like the game build. The site deploy deletes everything on public_html that it does not hold; the game goes to its own folder."
  [ -s "$SRC/.htaccess" ] || refuse "$SRC has no .htaccess."
  echo "==> the site: $SRC ($(find "$SRC" -type f | wc -l | tr -d ' ') files)"
  echo "==> leak check"
  node "$REPO/tools/leak-check.mjs" --dist "$SRC" \
    || { echo "ERROR: the leak check did not pass. Nothing was uploaded." >&2; exit 1; }
  WHAT="the site at $SITE_URL"
else
  # ---- 2. build -----------------------------------------------------------------------
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

  # ---- 3. dist sanity (protects --delete from an empty or half-built folder) -------------
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

  # ---- 4. leak check -------------------------------------------------------------------
  echo "==> leak check"
  node "$REPO/tools/leak-check.mjs" --dist "$DIST" --public-config \
    || { echo "ERROR: the leak check did not pass. Nothing was uploaded." >&2; exit 1; }
  SRC="$DIST"; WHAT="the game at $GAME_URL"
fi

# ---- 5. what would change ------------------------------------------------------------------

FLAGS=(-rlc --delete --itemize-changes --chmod=D755,F644 --exclude '.DS_Store' --exclude '.well-known/')
for p in ${PROTECT[@]+"${PROTECT[@]}"}; do FLAGS+=(--exclude "$p"); done
if [ -n "$TARGET" ]; then
  mkdir -p "$TARGET"      # a folder on THIS machine, standing in for the host
  DEST="$TARGET/"; RSH=(); DEST_DESC="$TARGET (local)"
elif [ "$SITE" = 1 ]; then
  DEST="$REMOTE_HOST:$PUBLIC_REAL/"; RSH=(-e "ssh $SSH_OPTS"); DEST_DESC="$PUBLIC_REAL (public_html)"
else
  DEST="$REMOTE_HOST:$GAME_REAL/"; RSH=(-e "ssh $SSH_OPTS"); DEST_DESC="$GAME_REAL (the game's folder)"
fi

sync_src() { # $1: "-n" for a dry run, "" otherwise
  local extra=()
  [ -n "$1" ] && extra=("$1")
  "$RSYNC" "${FLAGS[@]}" ${extra[@]+"${extra[@]}"} ${RSH[@]+"${RSH[@]}"} "$SRC/" "$DEST"
}

echo "==> comparing with $DEST_DESC (nothing is changed yet)"
if [ "$SITE" = 1 ]; then echo "    protected, never deleted: ${PROTECT[*]}"; fi
sync_src -n > "$WORK/plan.txt"
NEW="$(grep -c '^>f+++++++++' "$WORK/plan.txt" || true)"
SENT="$(grep -c '^>f' "$WORK/plan.txt" || true)"
GONE="$(grep -c '^\*deleting' "$WORK/plan.txt" || true)"
echo "    $SENT file(s) to send ($NEW new, $((SENT - NEW)) changed), $GONE to delete"
# awk, not grep | head: with pipefail, head closing the pipe early (more than 25 lines) kills the script.
if [ "$GONE" -gt 0 ]; then
  echo "    to delete:"
  awk '/^\*deleting/ { if (++n <= 25) { sub(/^\*deleting  */, "      "); print } }' "$WORK/plan.txt"
  if [ "$GONE" -gt 25 ]; then echo "      ... and $((GONE - 25)) more"; fi
fi
if [ "$((SENT - NEW))" -gt 0 ]; then
  echo "    changed:"
  awk '/^>f/ && !/^>f\+\+\+\+\+\+\+\+\+/ { if (++n <= 15) { sub(/^[^ ]* */, "      "); print } }' "$WORK/plan.txt"
  if [ "$((SENT - NEW))" -gt 15 ]; then echo "      ... and $((SENT - NEW - 15)) more"; fi
fi
if [ "$SITE" = 1 ] && [ "$GONE" -gt "$MAX_DELETES" ] && [ "$ALLOW_MANY" = 0 ]; then
  echo "ERROR: the site deploy would delete $GONE files (more than $MAX_DELETES). A holding page or a website replaces a few; this looks like it would take something that should be protected, the game most of all." >&2
  echo "       Check --game-dir, add --keep <folder> for anything else that lives in public_html, or pass --allow-many-deletes. Nothing was uploaded." >&2
  exit 1
fi

if [ "$DRY" = 1 ]; then
  echo "Dry run: nothing was uploaded or purged. Rerun without --dry-run to deploy $BRANCH @ $COMMIT."
  if [ -z "$TARGET" ]; then echo "(The checks read the host over SSH; they changed nothing.)"; fi
  exit 0
fi

# ---- 6. ask, then upload ----------------------------------------------------------------------

if [ -z "$TARGET" ] && [ "$YES" = 0 ]; then
  if [ ! -t 0 ]; then
    echo "ERROR: there is no terminal to ask on. Pass --yes to go ahead." >&2
    exit 1
  fi
  if [ "$SITE" = 1 ]; then echo "This replaces the contents of public_html, apart from: ${PROTECT[*]}"; fi
  printf 'Upload %s @ %s (%s) to %s and delete the %s file(s) listed above? Type yes to continue: ' \
    "$BRANCH" "$COMMIT" "$WHAT" "$DEST_DESC" "$GONE"
  read -r answer
  [ "$answer" = "yes" ] || { echo "Cancelled. Nothing was uploaded."; exit 1; }
fi

echo "==> uploading $BRANCH @ $COMMIT"
sync_src "" | tail -n 3
echo "==> verifying: a second pass must find nothing to change"
LEFT="$(sync_src -n)"
if [ -n "$LEFT" ]; then
  echo "ERROR: files still differ after the upload:" >&2
  echo "$LEFT" | head -20 >&2
  exit 1
fi

# ---- 7. CDN and the live site ---------------------------------------------------------------------

if [ -n "$TARGET" ]; then
  echo "==> CDN purge: skipped (local target)"
  if [ -n "$LIVE_URL_GIVEN" ]; then
    if [ "$SITE" = 1 ]; then live_check_site; else live_check_game; fi
  fi
elif [ "$SITE" = 1 ]; then
  purge_site
  live_check_site
else
  purge_game
  live_check_game
fi
echo "Deployed $BRANCH @ $COMMIT ($WHAT)."
