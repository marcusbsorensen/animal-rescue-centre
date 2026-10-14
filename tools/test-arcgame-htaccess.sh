#!/usr/bin/env bash
#
# Checks apps/game/public/.htaccess against a real Apache, locally.
#
#   tools/test-arcgame-htaccess.sh            test the existing apps/game/dist
#   PORT=8090 tools/test-arcgame-htaccess.sh  pick another port (default 8089)
#
# macOS ships Apache 2.4 (/usr/sbin/httpd, modules in /usr/libexec/apache2). This starts it from a
# scratch config on 127.0.0.1 and a high port, with AllowOverride All, serving a copy-on-write copy
# of the build, sends requests with chosen Host headers, and stops it again. It changes nothing in
# the repo and talks to nothing but 127.0.0.1.
#
# The mime types file is EMPTY on purpose, so a content type can only come from the .htaccess.
# It cannot show how 20i's own Apache is configured; that is the first thing to look at if a rule
# behaves differently on the host.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$REPO/apps/game/dist"
PORT="${PORT:-8089}"
HTTPD=/usr/sbin/httpd
[ -x "$HTTPD" ] || { echo "No $HTTPD on this machine; read the rules by eye instead." >&2; exit 2; }
[ -f "$DIST/.htaccess" ] || { echo "No $DIST/.htaccess. Build first." >&2; exit 2; }
if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; then
  echo "Something already answers on port $PORT; set PORT=." >&2; exit 2
fi

S="$(mktemp -d "${TMPDIR:-/tmp}/arcgame-htaccess.XXXXXX")"
PID=""
stop() {
  if [ -n "$PID" ]; then kill -TERM "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; fi
  rm -rf "$S"
}
trap stop EXIT

cp -Rc "$DIST" "$S/docroot" 2>/dev/null || cp -R "$DIST" "$S/docroot"
: > "$S/empty.types"
# Probes the build does not contain today.
printf 'RIFF....WEBPVP8 ' > "$S/docroot/probe.webp"
printf '<?php echo "placeholder";' > "$S/docroot/index.php"

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
DocumentRoot "$S/docroot"
<Directory />
  AllowOverride None
  Require all denied
</Directory>
<Directory "$S/docroot">
  AllowOverride All
  Require all granted
  Options FollowSymLinks Indexes
</Directory>
EOF

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
get() { # host path [curl args...] -> headers in $S/h, body in $S/b
  local host="$1" path="$2"; shift 2
  curl -sS -D "$S/h" -o "$S/b" -H "Host: $host" "$@" "http://127.0.0.1:$PORT$path"
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

echo "Redirects (curl does not follow them)"
get arcgame.co.uk / ;                         expect "co.uk / : status" 301 "$(status)"; expect "co.uk / : location" "https://arcgame.app/" "$(header location)"
get www.arcgame.co.uk '/admin/menu.html?x=1&y=2' ; expect "www.co.uk deep link + query: status" 301 "$(status)"; expect "www.co.uk deep link + query: location" "https://arcgame.app/admin/menu.html?x=1&y=2" "$(header location)"
get ARCGAME.CO.UK /a ;                        expect "co.uk in capitals: status" 301 "$(status)"
get arcgame.co.uk:8089 /a ;                   expect "co.uk with a port: status" 301 "$(status)"
get www.arcgame.app '/a%20b/c?x=1' ;          expect "www.app encoded path: status" 301 "$(status)"; expect "www.app encoded path: location" "https://arcgame.app/a%20b/c?x=1" "$(header location)"
get arcgame.app / ;                           expect "arcgame.app / : no redirect" 200 "$(status)"
get arcgame.app '/?utm=1' ;                   expect "arcgame.app with a query: no redirect" 200 "$(status)"
get arcgame-app.stackstaging.com / ;          expect "a preview host name: no redirect" 200 "$(status)"
get notarcgame.co.uk / ;                      expect "lookalike notarcgame.co.uk: no redirect" 200 "$(status)"
get arcgame.co.uk.evil.test / ;               expect "arcgame.co.uk.evil.test: no redirect" 200 "$(status)"

echo "Home page"
get arcgame.app / ;                           expect_has "/ serves index.html, not index.php" 'id="game-container"' "$(cat "$S/b")"

echo "404 page, no SPA rewrite"
get arcgame.app /no/such/page ;               expect "/no/such/page: status" 404 "$(status)"; expect_has "/no/such/page: body is 404.html" "Lost animal" "$(cat "$S/b")"
get arcgame.app /assets/animals/missing.png ; expect "missing art: status" 404 "$(status)"
get arcgame.app /index.html/extra ;           expect "index.html/extra: status" 404 "$(status)"

echo "No directory listings"
for d in /assets/ /assets/animals/ /admin/ /fonts/ /data/; do
  get arcgame.app "$d"
  expect "$d : status" 403 "$(status)"
  expect_lacks "$d : no listing" "Index of" "$(cat "$S/b")"
done

echo "Caching: pages and data revalidate"
for f in / /index.html /sw.js /manifest.webmanifest /asset-manifest.json /404.html; do
  get arcgame.app "$f"; expect "$f : cache-control" "no-cache" "$(header cache-control)"
done
wb="$(cd "$DIST" && ls workbox-*.js | head -1)"
get arcgame.app "/$wb" ;                       expect "/$wb : cache-control" "no-cache" "$(header cache-control)"
adminhtml="$(cd "$DIST/admin" && ls *.html | head -1)"
get arcgame.app "/admin/$adminhtml" ;          expect "/admin/$adminhtml : cache-control" "no-cache" "$(header cache-control)"
admincss="$(cd "$DIST/admin" && ls *.css | head -1)"
get arcgame.app "/admin/$admincss" ;           expect "/admin/$admincss : cache-control" "no-cache" "$(header cache-control)"
datajson="$(cd "$DIST/data" && ls *.json | head -1)"
get arcgame.app "/data/$datajson" ;            expect "/data/$datajson : cache-control" "no-cache" "$(header cache-control)"

echo "Caching: Vite's hashed bundles are immutable"
hashed=0
for f in "$DIST"/assets/*; do
  [ -f "$f" ] || continue
  hashed=$((hashed + 1))
  n="$(basename "$f")"
  get arcgame.app "/assets/$n"
  expect "/assets/$n : cache-control" "public, max-age=31536000, immutable" "$(header cache-control)"
done
expect_has "found the hashed bundles to test" "3" "$hashed"
get arcgame.app "/assets/$(cd "$DIST/assets" && ls index-*.js | head -1)?v=1" ; expect "hashed bundle with a query string" "public, max-age=31536000, immutable" "$(header cache-control)"

echo "Caching: unhashed art is NOT immutable"
png="$(cd "$DIST" && find assets -mindepth 2 -name '*.png' | head -1)"
get arcgame.app "/$png" ;                      expect "/$png : cache-control" "public, max-age=3600" "$(header cache-control)"
mp3="$(cd "$DIST" && find assets -name '*.mp3' | head -1)"
get arcgame.app "/$mp3" ;                      expect "/$mp3 : cache-control" "public, max-age=3600" "$(header cache-control)"
get arcgame.app /fonts/nunito-700-latin.woff2 ; expect "woff2 : cache-control" "public, max-age=3600" "$(header cache-control)"
get arcgame.app /icons/icon-192.png ;          expect "icon : cache-control" "public, max-age=3600" "$(header cache-control)"
mkdir -p "$S/docroot/assets/sub" && : > "$S/docroot/assets/sub/x-abcdefgh.js" && : > "$S/docroot/assets/sub/y-abcdefgh.png"
get arcgame.app /assets/sub/y-abcdefgh.png ;   expect "hash-shaped name in a sub-folder is not immutable" "public, max-age=3600" "$(header cache-control)"

echo "Content types (the types file is empty: these come from the .htaccess)"
get arcgame.app /manifest.webmanifest ;        expect_has "webmanifest" "application/manifest+json" "$(header content-type)"
get arcgame.app "/$mp3" ;                      expect "mp3" "audio/mpeg" "$(header content-type)"
get arcgame.app /probe.webp ;                  expect "webp" "image/webp" "$(header content-type)"
get arcgame.app /fonts/nunito-700-latin.woff2 ; expect "woff2" "font/woff2" "$(header content-type)"

echo "Compression"
js="$(cd "$DIST/assets" && ls phaser-*.js | head -1)"
get arcgame.app "/assets/$js" -H 'Accept-Encoding: gzip' ; expect "phaser chunk with Accept-Encoding: gzip" "gzip" "$(header content-encoding)"

echo
if [ "$FAIL" = 0 ]; then echo "htaccess: $PASS checks passed."; else echo "htaccess: $FAIL FAILED, $PASS passed."; fi
echo "(Stock macOS mime.types for comparison: $(for e in webmanifest mp3 webp woff2; do grep -q -w "$e" /private/etc/apache2/mime.types && printf '%s=yes ' "$e" || printf '%s=NO ' "$e"; done))"
[ "$FAIL" = 0 ]
