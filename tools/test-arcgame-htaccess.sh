#!/usr/bin/env bash
#
# Checks the three sets of Apache rules against a real Apache, locally:
#   apps/game/public/.htaccess    the game, at https://play.arcgame.app
#   tools/site-holding/.htaccess  arcgame.app until the website exists (302 to the game)
#   site/.htaccess                the website at arcgame.app (it replaces the holding rules)
#
#   tools/test-arcgame-htaccess.sh            test the existing apps/game/dist
#   PORT=8090 tools/test-arcgame-htaccess.sh  pick another port (default 8089; the website's
#                                             layout is served on the next one up, SITE_PORT)
#   SITE_DIR=~/x/site tools/test-arcgame-htaccess.sh   test the website in that folder
#
# SITE_DIR is the website's folder, the one with its .htaccess in it. Left unset, it is the first of
# $REPO/site (where it will live once merged) and $REPO/../arc-site-wt/site (the website's own
# worktree) that holds a .htaccess. If neither does, the website's checks are skipped and the summary
# says so. A SITE_DIR that was set but has no .htaccess is an error, not a skip.
#
# macOS ships Apache 2.4 (/usr/sbin/httpd, modules in /usr/libexec/apache2). This starts it from a
# scratch config on 127.0.0.1 and a high port, with AllowOverride All, and sends requests with chosen
# Host headers. It changes nothing in the repo and talks to nothing but 127.0.0.1. The layout is the
# WORST CASE for the host, with the game's folder INSIDE the site's, and it is built twice, once under
# the holding rules (port PORT) and once under the website's (port SITE_PORT):
#
#   public_html/             Host arcgame.app, www.arcgame.app, arcgame.co.uk, www.arcgame.co.uk
#     .htaccess              the holding rules   (site_html/: the website's own files and .htaccess)
#     .well-known/...        a certificate-check file
#     play/                  Host play.arcgame.app (and any name no vhost knows): a copy of the build
#     plain/                 Host plain.arcgame.app: a folder with no .htaccess of its own
#
# The website's strict CSP and its caching are tied to the host name arcgame.app. The risk the
# website's checks are built around is those reaching the game's requests through the shared parent
# folder, so every game request is made under both layouts: it must carry none of the website's
# security headers, and its whole response head must match what it gets under the holding rules.
#
# The mime types file is EMPTY on purpose, so a content type can only come from the .htaccess.
# It cannot show how 20i's own Apache is configured; that is the first thing to look at if a rule
# behaves differently on the host.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$REPO/apps/game/dist"
HOLDING="${HOLDING_DIR:-$REPO/tools/site-holding}"   # HOLDING_DIR=: test another folder (used to check the test can fail)
PORT="${PORT:-8089}"
SITE_PORT="${SITE_PORT:-$((PORT + 1))}"
HTTPD=/usr/sbin/httpd
GAME=play.arcgame.app
SITE=arcgame.app
[ -x "$HTTPD" ] || { echo "No $HTTPD on this machine; read the rules by eye instead." >&2; exit 2; }
[ -f "$DIST/.htaccess" ] || { echo "No $DIST/.htaccess. Build first." >&2; exit 2; }
[ -f "$HOLDING/.htaccess" ] || { echo "No $HOLDING/.htaccess." >&2; exit 2; }
# The website's folder: SITE_DIR if given (and then it must be right), else the first usual place
# that has a .htaccess, else none and the website's checks are skipped.
if [ -n "${SITE_DIR:-}" ]; then
  [ -f "$SITE_DIR/.htaccess" ] || { echo "No $SITE_DIR/.htaccess. SITE_DIR is the website's folder, the one holding its .htaccess." >&2; exit 2; }
  SITE_DIR="$(cd "$SITE_DIR" && pwd)"
else
  SITE_DIR=""
  for c in "$REPO/site" "$REPO/../arc-site-wt/site"; do
    if [ -f "$c/.htaccess" ]; then SITE_DIR="$(cd "$c" && pwd)"; break; fi
  done
fi
for p in "$PORT" ${SITE_DIR:+"$SITE_PORT"}; do
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$p/"; then
    echo "Something already answers on port $p; set PORT= (the website's checks use the next port up, or SITE_PORT)." >&2; exit 2
  fi
done

S="$(mktemp -d "${TMPDIR:-/tmp}/arcgame-htaccess.XXXXXX")"
PID=""
stop() {
  if [ -n "$PID" ]; then kill -TERM "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; fi
  rm -rf "$S"
}
trap stop EXIT

mkdir -p "$S/public_html"
cp -Rc "$DIST" "$S/public_html/play" 2>/dev/null || cp -R "$DIST" "$S/public_html/play"
cp "$HOLDING/.htaccess" "$S/public_html/.htaccess"
mkdir -p "$S/public_html/.well-known/acme-challenge" "$S/public_html/plain"
printf 'token-body' > "$S/public_html/.well-known/acme-challenge/token"
printf '<html>plain folder</html>' > "$S/public_html/plain/index.html"
: > "$S/empty.types"
# Probes the build does not contain today.
printf 'RIFF....WEBPVP8 ' > "$S/public_html/play/probe.webp"
printf '<?php echo "placeholder";' > "$S/public_html/play/index.php"

# The same layout again under the website's rules: its files and .htaccess on top, the game's folder
# (a copy of the one above, probes included) inside, the same two neighbours. shots/ is what the
# website's README says never to upload. The extra probes are file types its caching rules name but
# the site has none of today.
if [ -n "$SITE_DIR" ]; then
  mkdir -p "$S/site_html"
  cp -R "$SITE_DIR/." "$S/site_html/"
  rm -rf "$S/site_html/shots"
  cp -R "$S/public_html/play" "$S/site_html/play"
  mkdir -p "$S/site_html/.well-known/acme-challenge" "$S/site_html/plain"
  printf 'token-body' > "$S/site_html/.well-known/acme-challenge/token"
  printf '<html>plain folder</html>' > "$S/site_html/plain/index.html"
  printf '<svg xmlns="http://www.w3.org/2000/svg"/>' > "$S/site_html/probe.svg"
  printf 'ICO' > "$S/site_html/probe.ico"
  printf 'JPEG' > "$S/site_html/probe.jpeg"
  printf '<html>htm</html>' > "$S/site_html/probe.htm"
fi

M=/usr/libexec/apache2
cat > "$S/httpd.conf" <<EOF
ServerRoot "/usr"
ServerName 127.0.0.1
Listen 127.0.0.1:$PORT
PidFile "$S/httpd.pid"
ErrorLog "$S/error.log"
LogLevel warn
LoadModule mpm_prefork_module $M/mod_mpm_prefork.so
LoadModule unixd_module $M/mod_unixd.so
LoadModule authz_core_module $M/mod_authz_core.so
LoadModule log_config_module $M/mod_log_config.so
LoadModule filter_module $M/mod_filter.so
LoadModule mime_module $M/mod_mime.so
LoadModule dir_module $M/mod_dir.so
LoadModule autoindex_module $M/mod_autoindex.so
LoadModule headers_module $M/mod_headers.so
LoadModule rewrite_module $M/mod_rewrite.so
LoadModule deflate_module $M/mod_deflate.so
TypesConfig "$S/empty.types"
# The types a server always has. Left out on purpose: .webmanifest, .mp3, .webp, .woff2,
# which the .htaccess must supply itself.
AddType text/html .html
AddType text/css .css
AddType text/javascript .js
AddType application/json .json
AddType image/png .png
AddType image/svg+xml .svg
<Directory />
  AllowOverride None
  Require all denied
</Directory>
<Directory "$S/public_html">
  AllowOverride All
  Require all granted
  Options FollowSymLinks Indexes
</Directory>
# The first virtual host is the one any unknown Host name gets.
<VirtualHost 127.0.0.1:$PORT>
  ServerName $GAME
  DocumentRoot "$S/public_html/play"
</VirtualHost>
<VirtualHost 127.0.0.1:$PORT>
  ServerName $SITE
  ServerAlias www.arcgame.app arcgame.co.uk www.arcgame.co.uk
  DocumentRoot "$S/public_html"
</VirtualHost>
<VirtualHost 127.0.0.1:$PORT>
  ServerName plain.arcgame.app
  DocumentRoot "$S/public_html/plain"
</VirtualHost>
EOF
if [ -n "$SITE_DIR" ]; then
cat >> "$S/httpd.conf" <<EOF
# The website's layout, on its own port. The names are the same as above; the Host header picks
# the virtual host, and the last one reaches the website's folder under names that look like ours
# but are not, to see that nothing is matched by prefix or suffix.
Listen 127.0.0.1:$SITE_PORT
# Two listeners need an accept mutex, and Apache's default one is in /private/var/run, which this
# user cannot write to.
Mutex "file:$S" default
AddType image/jpeg .jpg .jpeg
AddType image/x-icon .ico
<Directory "$S/site_html">
  AllowOverride All
  Require all granted
  Options FollowSymLinks Indexes
</Directory>
<VirtualHost 127.0.0.1:$SITE_PORT>
  ServerName $GAME
  DocumentRoot "$S/site_html/play"
</VirtualHost>
<VirtualHost 127.0.0.1:$SITE_PORT>
  ServerName $SITE
  ServerAlias www.arcgame.app arcgame.co.uk www.arcgame.co.uk
  DocumentRoot "$S/site_html"
</VirtualHost>
<VirtualHost 127.0.0.1:$SITE_PORT>
  ServerName plain.arcgame.app
  DocumentRoot "$S/site_html/plain"
</VirtualHost>
<VirtualHost 127.0.0.1:$SITE_PORT>
  ServerName lookalike.test
  ServerAlias notarcgame.app notarcgame.co.uk arcgame.app.evil.test www.arcgame.app.evil.test arcgame.co.uk.evil.test
  DocumentRoot "$S/site_html"
</VirtualHost>
EOF
fi

"$HTTPD" -t -f "$S/httpd.conf" >"$S/configtest.log" 2>&1 || { echo "Apache rejected the scratch config:" >&2; head -5 "$S/configtest.log" >&2; exit 2; }
# Own session: Apache signals its whole process group when it stops, and that would take this
# script (and whatever shell started it) down with it.
perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' "$HTTPD" -f "$S/httpd.conf" -D FOREGROUND >"$S/out.log" 2>&1 &
PID=$!
up=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/"; then up=1; break; fi
  sleep 0.25
done
[ "$up" = 1 ] || { echo "Apache did not start:" >&2; head -10 "$S/out.log" "$S/error.log" >&2; exit 2; }

PASS=0; FAIL=0
AT="$PORT"   # the port get() asks: PORT for the holding layout, SITE_PORT for the website's
get() { # host path [curl args...] -> headers in $S/h, body in $S/b
  local host="$1" path="$2"; shift 2
  curl -sS -D "$S/h" -o "$S/b" -H "Host: $host" "$@" "http://127.0.0.1:$AT$path"
}
status() { head -1 "$S/h" | awk '{print $2}'; }
header() { grep -i "^$1:" "$S/h" | head -1 | sed 's/^[^:]*: *//' | tr -d '\r'; }
expect() { # label wanted got
  if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); printf '  ok    %s\n' "$1"
  else FAIL=$((FAIL + 1)); printf '  FAIL  %s\n          wanted: %s\n          got:    %s\n' "$1" "$2" "$3"; fi
}
expect_has() { # label substring got
  case "$3" in
    *"$2"*) PASS=$((PASS + 1)); printf '  ok    %s\n' "$1" ;;
    *) FAIL=$((FAIL + 1)); printf '  FAIL  %s\n          wanted to contain: %s\n          got:               %s\n' "$1" "$2" "$3" ;;
  esac
}
expect_lacks() { # label substring got
  case "$3" in
    *"$2"*) FAIL=$((FAIL + 1)); printf '  FAIL  %s\n          should not contain: %s\n          got:                %s\n' "$1" "$2" "$3" ;;
    *) PASS=$((PASS + 1)); printf '  ok    %s\n' "$1" ;;
  esac
}

# =================================================================================================
echo "THE GAME ($GAME): hostname"
get "$GAME" / ;                               expect "play.arcgame.app / : no redirect" 200 "$(status)"
get "$GAME" '/?utm=1' ;                       expect "with a query: no redirect" 200 "$(status)"
get www.play.arcgame.app '/a/b?x=1' ;         expect "www.play.arcgame.app: status" 301 "$(status)"; expect "www.play.arcgame.app: location" "https://play.arcgame.app/a/b?x=1" "$(header location)"
get arcgame-app.stackstaging.com / ;          expect "a preview host name: no redirect" 200 "$(status)"
get notarcgame.co.uk / ;                      expect "lookalike notarcgame.co.uk: no redirect" 200 "$(status)"
get arcgame.co.uk.evil.test / ;               expect "arcgame.co.uk.evil.test: no redirect" 200 "$(status)"
get 127.0.0.1:$PORT / ;                       expect "an address with a port: no redirect" 200 "$(status)"
echo "THE GAME's files asked for under the site's names (the play folder is inside public_html)"
get "$SITE" '/play/admin/menu.html?x=1&y=2' ; expect "arcgame.app/play/... : status" 301 "$(status)"; expect "arcgame.app/play/... : the game's rule wins, path and query kept" "https://play.arcgame.app/admin/menu.html?x=1&y=2" "$(header location)"
get www.arcgame.co.uk /play/a ;               expect "www.arcgame.co.uk/play/... : status" 301 "$(status)"; expect "www.arcgame.co.uk/play/... : location" "https://play.arcgame.app/a" "$(header location)"
get ARCGAME.APP /play/ ;                      expect "ARCGAME.APP/play/ in capitals: status" 301 "$(status)"
get arcgame.co.uk:8089 /play/a ;              expect "arcgame.co.uk:8089/play/a: status" 301 "$(status)"

echo "THE GAME: home page"
get "$GAME" / ;                               expect_has "/ serves index.html, not index.php" 'id="game-container"' "$(cat "$S/b")"

echo "THE GAME: 404 page, no SPA rewrite"
get "$GAME" /no/such/page ;                   expect "/no/such/page: status" 404 "$(status)"; expect_has "/no/such/page: body is 404.html" "Lost animal" "$(cat "$S/b")"
get "$GAME" /assets/animals/missing.png ;     expect "missing art: status" 404 "$(status)"
get "$GAME" /index.html/extra ;               expect "index.html/extra: status" 404 "$(status)"

echo "THE GAME: no directory listings"
for d in /assets/ /assets/animals/ /admin/ /fonts/ /data/; do
  get "$GAME" "$d"
  expect "$d : status" 403 "$(status)"
  expect_lacks "$d : no listing" "Index of" "$(cat "$S/b")"
done

echo "THE GAME: dev-only pages are not in the build"
for f in /admin/cockpit.html /admin/cast-gallery.html /admin/anchors.html /admin/drive-spike.html /admin/drive-spike/lights.js /admin/voice-booth.html /mockups/menus.html /assets/samples/bg-corridor.png /assets/samples/cat-happy.png; do
  get "$GAME" "$f" ; expect "$f : not served" 404 "$(status)"
done
for f in /admin/menu.html /admin/tunnel.html /admin/login.html /admin/signup.html /admin/map.html /admin/drive-overlay.html; do
  get "$GAME" "$f" ; expect "$f : still served" 200 "$(status)"
done

echo "THE GAME: caching, pages and data revalidate"
for f in / /index.html /sw.js /sw-cache-cleanup.js /manifest.webmanifest /asset-manifest.json /404.html; do
  get "$GAME" "$f"; expect "$f : cache-control" "no-cache" "$(header cache-control)"
done
wb="$(cd "$DIST" && ls workbox-*.js | head -1)"
get "$GAME" "/$wb" ;                          expect "/$wb : cache-control" "no-cache" "$(header cache-control)"
adminhtml="$(cd "$DIST/admin" && ls *.html | head -1)"
get "$GAME" "/admin/$adminhtml" ;             expect "/admin/$adminhtml : cache-control" "no-cache" "$(header cache-control)"
admincss="$(cd "$DIST/admin" && ls *.css | head -1)"
get "$GAME" "/admin/$admincss" ;              expect "/admin/$admincss : cache-control" "no-cache" "$(header cache-control)"
datajson="$(cd "$DIST/data" && ls *.json | head -1)"
get "$GAME" "/data/$datajson" ;               expect "/data/$datajson : cache-control" "no-cache" "$(header cache-control)"

echo "THE GAME: caching, Vite's hashed bundles are immutable"
hashed=0
for f in "$DIST"/assets/*; do
  [ -f "$f" ] || continue
  hashed=$((hashed + 1))
  n="$(basename "$f")"
  get "$GAME" "/assets/$n"
  expect "/assets/$n : cache-control" "public, max-age=31536000, immutable" "$(header cache-control)"
done
expect_has "found the hashed bundles to test" "3" "$hashed"
get "$GAME" "/assets/$(cd "$DIST/assets" && ls index-*.js | head -1)?v=1" ; expect "hashed bundle with a query string" "public, max-age=31536000, immutable" "$(header cache-control)"

echo "THE GAME: caching, unhashed art is NOT immutable"
png="$(cd "$DIST" && find assets -mindepth 2 -name '*.png' | head -1)"
get "$GAME" "/$png" ;                         expect "/$png : cache-control" "public, max-age=3600" "$(header cache-control)"
mp3="$(cd "$DIST" && find assets -name '*.mp3' | head -1)"
get "$GAME" "/$mp3" ;                         expect "/$mp3 : cache-control" "public, max-age=3600" "$(header cache-control)"
get "$GAME" /fonts/nunito-700-latin.woff2 ;   expect "woff2 : cache-control" "public, max-age=3600" "$(header cache-control)"
get "$GAME" /icons/icon-192.png ;             expect "icon : cache-control" "public, max-age=3600" "$(header cache-control)"
mkdir -p "$S/public_html/play/assets/sub" && : > "$S/public_html/play/assets/sub/x-abcdefgh.js" && : > "$S/public_html/play/assets/sub/y-abcdefgh.png"
get "$GAME" /assets/sub/y-abcdefgh.png ;      expect "hash-shaped name in a sub-folder is not immutable" "public, max-age=3600" "$(header cache-control)"

echo "THE GAME: content types (the types file is empty: these come from the .htaccess)"
get "$GAME" /manifest.webmanifest ;           expect_has "webmanifest" "application/manifest+json" "$(header content-type)"
get "$GAME" "/$mp3" ;                         expect "mp3" "audio/mpeg" "$(header content-type)"
get "$GAME" /probe.webp ;                     expect "webp" "image/webp" "$(header content-type)"
get "$GAME" /fonts/nunito-700-latin.woff2 ;   expect "woff2" "font/woff2" "$(header content-type)"

echo "THE GAME: compression"
js="$(cd "$DIST/assets" && ls phaser-*.js | head -1)"
get "$GAME" "/assets/$js" -H 'Accept-Encoding: gzip' ; expect "phaser chunk with Accept-Encoding: gzip" "gzip" "$(header content-encoding)"

# =================================================================================================
echo
echo "THE SITE ($SITE): the holding rules"
get "$SITE" / ;                               expect "arcgame.app / : status" 302 "$(status)"; expect "arcgame.app / : location" "https://play.arcgame.app/" "$(header location)"
get "$SITE" /anything/deep/path ;             expect "a deep path: status" 302 "$(status)"; expect "a deep path: goes to the game's front door" "https://play.arcgame.app/" "$(header location)"
get "$SITE" '/?utm=1&x=2' ;                   expect "a query: location has none" "https://play.arcgame.app/" "$(header location)"
get "$SITE" /index.html ;                     expect "/index.html: status" 302 "$(status)"
get "$SITE" /robots.txt ;                     expect "/robots.txt: status" 302 "$(status)"
get ARCGAME.APP / ;                           expect "ARCGAME.APP in capitals: status" 302 "$(status)"
get arcgame.app:8089 / ;                      expect "arcgame.app with a port: status" 302 "$(status)"
echo "THE SITE: it is a temporary redirect, and not remembered"
get "$SITE" / ;                               expect_lacks "no Cache-Control that would keep a 302" "max-age" "$(header cache-control)"; expect "no Expires either" "" "$(header expires)"
echo "THE SITE: arcgame.co.uk and www go to https://arcgame.app (301, path and query kept)"
get arcgame.co.uk / ;                         expect "co.uk / : status" 301 "$(status)"; expect "co.uk / : location" "https://arcgame.app/" "$(header location)"
get www.arcgame.co.uk '/admin/menu.html?x=1&y=2' ; expect "www.co.uk deep link + query: status" 301 "$(status)"; expect "www.co.uk deep link + query: location" "https://arcgame.app/admin/menu.html?x=1&y=2" "$(header location)"
get ARCGAME.CO.UK /a ;                        expect "co.uk in capitals: status" 301 "$(status)"
get arcgame.co.uk:8089 /a ;                   expect "co.uk with a port: status" 301 "$(status)"
get www.arcgame.app '/a%20b/c?x=1' ;          expect "www.app encoded path: status" 301 "$(status)"; expect "www.app encoded path: location" "https://arcgame.app/a%20b/c?x=1" "$(header location)"
echo "THE SITE: /.well-known/ is left alone, on every host"
for h in "$SITE" www.arcgame.app arcgame.co.uk www.arcgame.co.uk; do
  get "$h" /.well-known/acme-challenge/token
  expect "$h /.well-known/acme-challenge/token : status" 200 "$(status)"
  expect "$h /.well-known/acme-challenge/token : the file is served" "token-body" "$(cat "$S/b")"
done
get "$SITE" /.well-known/nothing-here ;       expect "a missing file under .well-known: 404, not a redirect" 404 "$(status)"
get arcgame.co.uk /.well-known/acme-challenge/other ; expect "a missing challenge on co.uk: 404, not a redirect" 404 "$(status)"
get "$SITE" /well-known/token ;               expect "a lookalike path is redirected" 302 "$(status)"
echo "THE SITE: the holding rules cannot loop the game or any folder inside public_html"
get "$GAME" / ;                               expect "play.arcgame.app / (a folder inside public_html): 200, no redirect" 200 "$(status)"
get "$GAME" /assets/ ;                        expect "play.arcgame.app under the same parent: its own rules" 403 "$(status)"
get plain.arcgame.app / ;                     expect "a folder with NO .htaccess of its own: the holding rules are host-tied, 200" 200 "$(status)"
expect_has "plain.arcgame.app serves its own page" "plain folder" "$(cat "$S/b")"
get plain.arcgame.app /missing ;              expect "plain.arcgame.app /missing: 404, no redirect" 404 "$(status)"
echo "THE SITE: Options -Indexes holds"
get plain.arcgame.app /anything-dir/ ;        expect "a folder that does not exist" 404 "$(status)"
mkdir -p "$S/public_html/plain/emptydir"
get plain.arcgame.app /emptydir/ ;            expect "an empty folder inside public_html: 403, no listing" 403 "$(status)"
expect_lacks "no listing" "Index of" "$(cat "$S/b")"

# =================================================================================================
# THE WEBSITE. Its files and .htaccess sit in site_html/ with the game's folder inside, on SITE_PORT.
CSP="default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'"
WANT_SECURITY="Content-Security-Policy: $CSP|Referrer-Policy: strict-origin-when-cross-origin|X-Content-Type-Options: nosniff|"
security_headers() { # the website's three security headers on the response just fetched: sorted, one line, each as many times as sent
  grep -iE '^(content-security-policy|x-content-type-options|referrer-policy):' "$S/h" | tr -d '\r' | LC_ALL=C sort | tr '\n' '|'
}
has_security() { expect "$1: CSP, referrer policy and nosniff, once each" "$WANT_SECURITY" "$(security_headers)"; }
lacks_security() { expect "$1: no CSP, referrer policy or nosniff" "" "$(security_headers)"; }
same_as() { cmp -s "$1" "$S/b" && echo "that file" || echo "something else"; }
pick() { (cd "$SITE_DIR" && find . -type f -name "$1" -not -path './shots/*' | LC_ALL=C sort | head -1 | sed 's|^\./||'); }
head_of() { # port host path [curl args...] -> the response head, minus the lines that differ between two copies of one file
  local port="$1" host="$2" path="$3"; shift 3
  curl -sS -D - -o /dev/null -H "Host: $host" "$@" "http://127.0.0.1:$port$path" \
    | tr -d '\r' | grep -v -i -E '^(date|etag|last-modified|server|keep-alive|connection):' | grep -v '^$'
}
game_untouched() { # path [curl args...]: the game's request under the website's layout is the same as under the holding one
  local path="$1"; shift
  get "$GAME" "$path" "$@"
  lacks_security "game $path"
  expect "game $path : same response head as under the holding rules" "$(head_of "$PORT" "$GAME" "$path" "$@")" "$(head_of "$SITE_PORT" "$GAME" "$path" "$@")"
}

site_checks() {
  local s_css s_webp s_woff2 s_png s_jpg f h d
  AT="$SITE_PORT"
  s_css="$(pick '*.css')"; s_webp="$(pick '*.webp')"; s_woff2="$(pick '*.woff2')"; s_png="$(pick '*.png')"; s_jpg="$(pick '*.jpg')"
  for f in "$s_css" "$s_webp" "$s_woff2" "$s_png" "$s_jpg"; do
    [ -n "$f" ] || expect "the site has a css, webp, woff2, png and jpg file to test with" yes "no, one is missing"
  done

  echo
  echo "THE WEBSITE ($SITE): its own pages, security headers, revalidation (site folder: $SITE_DIR)"
  get "$SITE" / ;                               expect "arcgame.app / : status" 200 "$(status)"; expect "arcgame.app / : is the site's index.html" "that file" "$(same_as "$SITE_DIR/index.html")"
  for f in / /index.html /404.html /probe.htm; do
    get "$SITE" "$f" ;                          has_security "$f"; expect "$f : cache-control" "no-cache" "$(header cache-control)"
  done
  get ARCGAME.APP / ;                           expect "ARCGAME.APP in capitals: status" 200 "$(status)"; has_security "ARCGAME.APP /"
  get arcgame.app:8089 / ;                      expect "arcgame.app with a port: status" 200 "$(status)"; has_security "arcgame.app:8089 /"
  echo "THE WEBSITE: images, CSS and fonts are cached for an hour"
  for f in "/$s_css" "/$s_webp" "/$s_woff2" "/$s_png" "/$s_jpg" /probe.svg /probe.ico /probe.jpeg "/$s_css?v=2"; do
    get "$SITE" "$f" ;                          has_security "$f"; expect "$f : cache-control" "public, max-age=3600" "$(header cache-control)"
  done
  echo "THE WEBSITE: content types (the types file is empty: these come from the .htaccess)"
  get "$SITE" "/$s_webp" ;                      expect "webp" "image/webp" "$(header content-type)"
  get "$SITE" "/$s_woff2" ;                     expect "woff2" "font/woff2" "$(header content-type)"

  echo "THE WEBSITE: the headers are tied to the name arcgame.app, matched whole"
  for h in notarcgame.app arcgame.app.evil.test www.arcgame.app.evil.test; do
    get "$h" / ;                                expect "look-alike $h : status" 200 "$(status)"; lacks_security "look-alike $h"
  done
  for h in notarcgame.co.uk arcgame.co.uk.evil.test; do
    get "$h" / ;                                expect "look-alike $h : not redirected" 200 "$(status)"
  done
  get www.arcgame.app / ;                       lacks_security "www.arcgame.app (it is redirected)"

  echo "THE WEBSITE: arcgame.co.uk and www go to https://arcgame.app (301, path and query kept)"
  get arcgame.co.uk / ;                         expect "co.uk / : status" 301 "$(status)"; expect "co.uk / : location" "https://arcgame.app/" "$(header location)"
  get www.arcgame.co.uk '/admin/menu.html?x=1&y=2' ; expect "www.co.uk deep link + query: status" 301 "$(status)"; expect "www.co.uk deep link + query: location" "https://arcgame.app/admin/menu.html?x=1&y=2" "$(header location)"
  get ARCGAME.CO.UK /a ;                        expect "co.uk in capitals: status" 301 "$(status)"
  get arcgame.co.uk:8089 /a ;                   expect "co.uk with a port: status" 301 "$(status)"
  get www.arcgame.app / ;                       expect "www.app / : status" 301 "$(status)"; expect "www.app / : location" "https://arcgame.app/" "$(header location)"
  get www.arcgame.app '/a%20b/c?x=1' ;          expect "www.app encoded path: status" 301 "$(status)"; expect "www.app encoded path: location" "https://arcgame.app/a%20b/c?x=1" "$(header location)"
  get WWW.ARCGAME.APP:8089 /index.html ;        expect "www.app in capitals, with a port: status" 301 "$(status)"; expect "www.app in capitals, with a port: location" "https://arcgame.app/index.html" "$(header location)"

  echo "THE WEBSITE: /.well-known/ is left alone, on every host"
  for h in "$SITE" www.arcgame.app arcgame.co.uk www.arcgame.co.uk; do
    get "$h" /.well-known/acme-challenge/token
    expect "$h /.well-known/acme-challenge/token : status" 200 "$(status)"
    expect "$h /.well-known/acme-challenge/token : the file is served" "token-body" "$(cat "$S/b")"
  done
  get "$SITE" /.well-known/nothing-here ;       expect "a missing file under .well-known: 404, not a redirect" 404 "$(status)"
  get arcgame.co.uk /.well-known/acme-challenge/other ; expect "a missing challenge on co.uk: 404, not a redirect" 404 "$(status)"
  get arcgame.co.uk /well-known/token ;         expect "a look-alike path on co.uk is redirected" 301 "$(status)"

  echo "THE WEBSITE: the holding page's 302-to-play rule did not come across"
  get "$SITE" '/?utm=1' ;                       expect "arcgame.app /?utm=1 : status" 200 "$(status)"
  get "$SITE" /anything/deep/path ;             expect "a deep path: 404, not a 302" 404 "$(status)"; expect "a deep path: no Location header" "" "$(header location)"

  echo "THE WEBSITE: Options -Indexes holds, and a 404 serves /404.html"
  for d in /assets/ /assets/img/ /assets/fonts/; do
    get "$SITE" "$d" ;                          expect "$d : status" 403 "$(status)"; expect_lacks "$d : no listing" "Index of" "$(cat "$S/b")"
  done
  mkdir -p "$S/site_html/plain/emptydir"
  get plain.arcgame.app /emptydir/ ;            expect "an empty folder next door, with no .htaccess of its own: 403, no listing" 403 "$(status)"; expect_lacks "no listing" "Index of" "$(cat "$S/b")"
  get "$SITE" /no/such/page ;                   expect "/no/such/page : status" 404 "$(status)"; expect "/no/such/page : body is the site's 404.html" "that file" "$(same_as "$SITE_DIR/404.html")"; has_security "/no/such/page"
  get "$SITE" "/assets/img/missing.webp" ;      expect "missing art: status" 404 "$(status)"; expect "missing art: body is the site's 404.html" "that file" "$(same_as "$SITE_DIR/404.html")"
  get "$SITE" /index.html/extra ;               expect "index.html/extra : status" 404 "$(status)"

  echo "THE GAME under the website's .htaccess (the play folder is inside the site's folder)"
  echo "  The website's security headers must not reach it, and each response must be what it is under the holding rules."
  get "$GAME" / ;                               expect "play.arcgame.app / : status" 200 "$(status)"; expect_has "/ serves the game's index.html, not index.php" 'id="game-container"' "$(cat "$S/b")"
  get arcgame-app.stackstaging.com / ;          expect "a preview host name gets the game, status" 200 "$(status)"; lacks_security "a preview host name"
  get "$GAME" /no/such/page ;                   expect "/no/such/page : status" 404 "$(status)"; expect_has "/no/such/page : the game's own 404 page" "Lost animal" "$(cat "$S/b")"
  for f in / /index.html /sw.js /manifest.webmanifest /asset-manifest.json /404.html "/$wb" "/admin/$adminhtml" "/admin/$admincss" "/data/$datajson" \
           "/$png" "/$mp3" /fonts/nunito-700-latin.woff2 /icons/icon-192.png /probe.webp /favicon.svg \
           /no/such/page /assets/ /admin/ /assets/animals/missing.png; do
    game_untouched "$f"
  done
  for f in "$DIST"/assets/*; do
    [ -f "$f" ] || continue
    game_untouched "/assets/$(basename "$f")"
  done
  game_untouched "/assets/$js" -H 'Accept-Encoding: gzip'
  echo "THE GAME's files asked for under the site's names: the game's rule still wins"
  get "$SITE" '/play/admin/menu.html?x=1&y=2' ; expect "arcgame.app/play/... : status" 301 "$(status)"; expect "arcgame.app/play/... : path and query kept" "https://play.arcgame.app/admin/menu.html?x=1&y=2" "$(header location)"
  get www.arcgame.co.uk /play/a ;               expect "www.arcgame.co.uk/play/... : status" 301 "$(status)"; expect "www.arcgame.co.uk/play/... : location" "https://play.arcgame.app/a" "$(header location)"
  echo "THE WEBSITE'S neighbour with no .htaccess of its own"
  get plain.arcgame.app / ;                     expect "plain.arcgame.app / : status" 200 "$(status)"; expect_has "plain.arcgame.app serves its own page" "plain folder" "$(cat "$S/b")"; lacks_security "plain.arcgame.app /"
  AT="$PORT"
}

if [ -n "$SITE_DIR" ]; then
  site_checks
else
  echo
  echo "THE WEBSITE ($SITE): SKIPPED. No site folder found; set SITE_DIR= to the folder holding its .htaccess."
fi

echo
if [ "$FAIL" = 0 ]; then echo "htaccess: $PASS checks passed."; else echo "htaccess: $FAIL FAILED, $PASS passed."; fi
[ -n "$SITE_DIR" ] || echo "(The website's .htaccess was NOT tested: no site folder found, set SITE_DIR=.)"
echo "(Stock macOS mime.types for comparison: $(for e in webmanifest mp3 webp woff2; do grep -q -w "$e" /private/etc/apache2/mime.types && printf '%s=yes ' "$e" || printf '%s=NO ' "$e"; done))"
[ "$FAIL" = 0 ]
