#!/usr/bin/env bash
#
# Tests for tools/deploy-arcgame.sh. Nothing here contacts arcgame.app, play.arcgame.app or the 20i host.
#
#   tools/test-deploy-arcgame.sh      (needs a build in apps/game/dist and the root .env.local)
#
# The script is run with a fake ssh and a fake rsync that work on a scratch "home folder" in a temp
# directory, so the host checks (`cd <folder> && pwd -P`), the refusals, and the exact rsync command
# lines can all be exercised and read back. The fake ssh logs every command it is given, which is how
# "it never runs mkdir on the host" is checked. A mock of the 20i API and a plain web server stand in for
# the live addresses. About two minutes.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$REPO/tools/deploy-arcgame.sh"
[ -f "$REPO/apps/game/dist/index.html" ] || { echo "Build first: pnpm --filter @arc/game build" >&2; exit 2; }
S="$(mktemp -d "${TMPDIR:-/tmp}/deploytest.XXXXXX")"
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; rm -rf "$S"; }
trap cleanup EXIT

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); echo "  ok    $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL  $1"; }
expect_rc() { if [ "$2" = "$3" ]; then ok "$1 (exit $3)"; else bad "$1: wanted exit $2, got $3"; fi; }
expect_in() { if grep -q -F -e "$2" "$3"; then ok "$1"; else bad "$1: '$2' not in $(basename "$3")"; fi; }
expect_not_in() { if grep -q -F -e "$2" "$3"; then bad "$1: '$2' is in $(basename "$3")"; else ok "$1"; fi; }
expect_file() { if [ -e "$2" ]; then ok "$1"; else bad "$1: missing $2"; fi; }
expect_no_file() { if [ -e "$2" ]; then bad "$1: $2 exists"; else ok "$1"; fi; }

echo "setup: cloning the real build into a scratch copy"
cp -Rc "$REPO/apps/game/dist" "$S/dist" 2>/dev/null || cp -R "$REPO/apps/game/dist" "$S/dist"
NFILES="$(find "$S/dist" -type f | wc -l | tr -d ' ')"

# ---- fakes -------------------------------------------------------------------------------------
mkdir -p "$S/home"
FAKE_HOME="$(cd "$S/home" && pwd -P)"
cat > "$S/fake-ssh" <<'EOF'
#!/bin/bash
# Stands in for `ssh arcgame <command>`: runs the command in a shell whose home is the scratch folder.
echo "$*" >> "$FAKE_SSH_LOG"
while [ "${1:-}" = "-o" ]; do shift 2; done
shift   # the host
cd "$FAKE_HOME" && HOME="$FAKE_HOME" bash -c "$1"
EOF
cat > "$S/fake-rsync" <<'EOF'
#!/bin/bash
# Logs its arguments, drops the -e option, and turns arcgame:<path> into the scratch home.
echo "ARGS: $*" >> "$FAKE_RSYNC_LOG"
out=(); skip=0
for a in "$@"; do
  if [ "$skip" = 1 ]; then skip=0; echo "RSH: $a" >> "$FAKE_RSYNC_LOG"; continue; fi
  case "$a" in
    -e) skip=1 ;;
    arcgame:/*) out+=("${a#arcgame:}") ;;
    arcgame:*) out+=("$FAKE_HOME/${a#arcgame:}") ;;
    *) out+=("$a") ;;
  esac
done
exec /opt/homebrew/bin/rsync "${out[@]}"
EOF
cat > "$S/answer.py" <<'EOF'
"""Run a command with a pseudo-terminal as stdin and type an answer when it asks. usage: answer.py <answer> <command> [args]"""
import os, pty, select, subprocess, sys
answer, cmd = sys.argv[1], sys.argv[2:]
master, slave = pty.openpty()
proc = subprocess.Popen(cmd, stdin=slave, stdout=slave, stderr=slave, close_fds=True)
os.close(slave)
out, sent = b"", False
while True:
    ready, _, _ = select.select([master], [], [], 120)
    if not ready: break
    try: data = os.read(master, 4096)
    except OSError: break
    if not data: break
    out += data
    if not sent and b"continue:" in out:
        os.write(master, (answer + "\n").encode()); sent = True
proc.wait()
sys.stdout.write(out.decode(errors="replace")); sys.exit(proc.returncode)
EOF
cat > "$S/mock.py" <<'EOF'
import http.server, json, os, sys
LOG = sys.argv[2]; STATUS = int(os.environ.get("MOCK_STATUS", "200"))
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); body = self.rfile.read(n).decode()
        with open(LOG, "a") as f:
            f.write(json.dumps({"path": self.path, "auth": self.headers.get("Authorization"), "body": body}) + "\n")
        self.send_response(STATUS); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b"{}")
    def do_GET(self):   # the "site": a temporary redirect to the game, like the holding .htaccess
        self.send_response(302); self.send_header("Location", "https://play.arcgame.app/"); self.end_headers()
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
EOF
chmod +x "$S/fake-ssh" "$S/fake-rsync"
export FAKE_HOME FAKE_SSH_LOG="$S/ssh.log" FAKE_RSYNC_LOG="$S/rsync.log"
# EVERY run of the script in this test uses the fakes, so a mistake in a test cannot reach the real host.
export DEPLOY_SSH="$S/fake-ssh" RSYNC="$S/fake-rsync" DEPLOY_DIST="$S/dist" LIVE_URL=http://127.0.0.1:8092
unset ARC_20I_API_KEY ARC_20I_API_BASE ARC_GAME_REMOTE_DIR DEPLOY_TARGET
: > "$FAKE_SSH_LOG"; : > "$FAKE_RSYNC_LOG"
reset_logs() { : > "$FAKE_SSH_LOG"; : > "$FAKE_RSYNC_LOG"; }
common=(--skip-build --allow-dirty)
rd() { local name="$1"; shift; "$DEPLOY" "${common[@]}" "$@" > "$S/$name.out" 2>&1 < /dev/null; RC=$?; }
rdy() { local ans="$1" name="$2"; shift 2; python3 -I "$S/answer.py" "$ans" "$DEPLOY" "${common[@]}" "$@" > "$S/$name.out" 2>&1; RC=$?; }

# A scratch host: public_html with 20i's placeholder and a certificate-check folder, and the folders a
# play subdomain might get (one beside public_html, one inside it).
host_reset() {
  rm -rf "$FAKE_HOME"; mkdir -p "$FAKE_HOME/public_html/.well-known/acme-challenge" "$FAKE_HOME/play.arcgame.app" "$FAKE_HOME/public_html/play"
  echo token > "$FAKE_HOME/public_html/.well-known/acme-challenge/t"
  echo '<?php echo "placeholder";' > "$FAKE_HOME/public_html/index.php"
  echo placeholder > "$FAKE_HOME/play.arcgame.app/index.html"
}

# ==============================================================================================
echo "A. the game into a local folder (DEPLOY_TARGET stands in for the game's folder)"
mkdir -p "$S/t1/.well-known/acme-challenge"; echo token > "$S/t1/.well-known/acme-challenge/t"; echo '<?php' > "$S/t1/index.php"
DEPLOY_TARGET="$S/t1" rd a1 --dry-run; expect_rc "dry run" 0 $RC
expect_in "reports the files to send" "$NFILES file(s) to send ($NFILES new, 0 changed), 1 to delete" "$S/a1.out"
expect_in "lists index.php for deletion" "index.php" "$S/a1.out"
expect_not_in "does not list .well-known for deletion" ".well-known" "$S/a1.out"
expect_in "ran the leak check" "leak-check: clean" "$S/a1.out"
expect_in "checked the public config" "VITE_SUPABASE_URL present in the build" "$S/a1.out"
expect_in "says nothing was uploaded" "nothing was uploaded or purged" "$S/a1.out"
[ -f "$S/t1/index.php" ] && [ ! -e "$S/t1/index.html" ] && ok "target untouched by the dry run" || bad "target was changed by a dry run"
DEPLOY_TARGET="$S/t1" rd a2; expect_rc "upload" 0 $RC
expect_in "second pass found nothing, and it says so" "Deployed" "$S/a2.out"
expect_no_file "placeholder index.php removed by --delete" "$S/t1/index.php"
expect_file ".well-known kept" "$S/t1/.well-known/acme-challenge/t"
expect_file ".htaccess arrived" "$S/t1/.htaccess"
[ "$(stat -f %Lp "$S/t1/index.html")" = 644 ] && ok "files are 644" || bad "file mode is $(stat -f %Lp "$S/t1/index.html")"
[ "$(stat -f %Lp "$S/t1/assets")" = 755 ] && ok "folders are 755" || bad "folder mode is $(stat -f %Lp "$S/t1/assets")"
expect_in "purge skipped for a local target" "CDN purge: skipped (local target)" "$S/a2.out"
DEPLOY_TARGET="$S/t1" rd a3 --dry-run; expect_in "a second run finds nothing" "0 file(s) to send (0 new, 0 changed), 0 to delete" "$S/a3.out"
echo '<!-- edited on the host -->' >> "$S/t1/index.html"
DEPLOY_TARGET="$S/t1" rd a4 --dry-run; expect_in "a changed file is reported as changed" "1 file(s) to send (0 new, 1 changed), 0 to delete" "$S/a4.out"
expect_not_in "no host was asked anything" "pwd -P" "$FAKE_SSH_LOG"

echo "B. the leak check, the sanity checks and the build guard stop the deploy"
printf 'VITE_SUPABASE_URL=https://fakefakefake.supabase.co\nVITE_SUPABASE_ANON_KEY=fake-anon-key-value\nVITE_SUPABASE_SERVICE_ROLE_KEY=fake-service-role-value-1234567890\nVITE_ADMIN_PASSWORD=fake-admin-password-xyz\n' > "$S/fake.env"
cp -Rc "$S/dist" "$S/dist-leak" 2>/dev/null || cp -R "$S/dist" "$S/dist-leak"
printf 'x="fake-admin-password-xyz";' > "$S/dist-leak/admin/_planted.js"
mkdir -p "$S/t2"
ARC_ENV_FILE="$S/fake.env" DEPLOY_DIST="$S/dist-leak" DEPLOY_TARGET="$S/t2" rd b1; expect_rc "a planted secret" 1 $RC
expect_in "names the file" "admin/_planted.js" "$S/b1.out"
expect_not_in "does not echo the secret" "fake-admin-password-xyz" "$S/b1.out"
[ -z "$(ls -A "$S/t2")" ] && ok "target still empty" || bad "something was uploaded"
cp -Rc "$S/dist" "$S/dist-no404" 2>/dev/null || cp -R "$S/dist" "$S/dist-no404"; rm "$S/dist-no404/404.html"
DEPLOY_DIST="$S/dist-no404" DEPLOY_TARGET="$S/t2" rd b2; expect_rc "no 404.html" 1 $RC
mkdir -p "$S/tiny"; for f in index.html 404.html sw.js manifest.webmanifest; do echo x > "$S/tiny/$f"; done; cp "$REPO/apps/game/public/.htaccess" "$S/tiny/.htaccess"
DEPLOY_DIST="$S/tiny" DEPLOY_TARGET="$S/t2" rd b3; expect_rc "a tiny build" 1 $RC
expect_in "explains --delete would empty the site" "--delete would empty the site" "$S/b3.out"
cp -Rc "$S/dist" "$S/dist-nohta" 2>/dev/null || cp -R "$S/dist" "$S/dist-nohta"; rm "$S/dist-nohta/.htaccess"
DEPLOY_DIST="$S/dist-nohta" DEPLOY_TARGET="$S/t2" rd b4 --dry-run; expect_rc "no .htaccess in the build: it is added" 0 $RC
expect_in "says it added it" ".htaccess was not in the build; adding it" "$S/b4.out"
echo '# stale' >> "$S/dist-nohta/.htaccess"
DEPLOY_DIST="$S/dist-nohta" DEPLOY_TARGET="$S/t2" rd b5 --dry-run; expect_rc "a stale .htaccess in the build" 1 $RC
"$DEPLOY" --allow-dirty --dry-run > "$S/b6.out" 2>&1 < /dev/null; expect_rc "DEPLOY_DIST without --skip-build" 2 $?
[ -z "$(ls -A "$S/t2")" ] && ok "nothing reached the target in any of those" || bad "a target got files"

# ==============================================================================================
echo "C. the game's folder is a setting with no default"
host_reset; reset_logs
rd c1 --dry-run; expect_rc "no --game-dir and no env var" 2 $RC
expect_in "says why, and that there is no default" "no remote folder for the game" "$S/c1.out"
expect_in "points at the setting" "ARC_GAME_REMOTE_DIR" "$S/c1.out"
[ ! -s "$FAKE_SSH_LOG" ] && [ ! -s "$FAKE_RSYNC_LOG" ] && ok "it did not touch the host or run rsync" || bad "something ran"
ARC_GAME_REMOTE_DIR= rd c2 --dry-run; expect_rc "an empty env var counts as unset" 2 $RC
for bad in '~/x' '~' '../x' 'a/../b' 'public_html/..'; do
  rd c3 --dry-run --game-dir "$bad"; expect_rc "--game-dir '$bad' is refused before anything runs" 2 $RC
done
[ ! -s "$FAKE_SSH_LOG" ] && ok "none of them reached the host" || bad "host was asked: $(head -c 200 "$FAKE_SSH_LOG")"
for pub in public_html ./public_html public_html/ public_html// . / ./; do
  rd c4 --dry-run --game-dir "$pub"; expect_rc "--game-dir '$pub' (public_html, home or root) is refused" 2 $RC
done
expect_in "names public_html" "public_html" "$S/c4.out"
[ ! -s "$FAKE_SSH_LOG" ] && [ ! -s "$FAKE_RSYNC_LOG" ] && ok "the plain names were refused without asking the host" || bad "host was asked"
rd c5 --dry-run --game-dir; expect_rc "--game-dir with no value" 2 $RC

echo "D. the host must already have the folder, and it must be a safe one"
host_reset; reset_logs
rd d1 --dry-run --game-dir nope.arcgame.app; expect_rc "a folder that does not exist on the host" 2 $RC
expect_in "says it does not exist and is never created" "does not exist on the host" "$S/d1.out"
expect_no_file "it was not created" "$FAKE_HOME/nope.arcgame.app"
[ ! -s "$FAKE_RSYNC_LOG" ] && ok "rsync never ran" || bad "rsync ran"
expect_in "it did ask the host (read-only)" "cd -- nope.arcgame.app && pwd -P" "$FAKE_SSH_LOG"
ln -s public_html "$FAKE_HOME/pubalias"; reset_logs
rd d2 --dry-run --game-dir pubalias; expect_rc "a link to public_html" 2 $RC
expect_in "recognised as public_html itself" "is public_html itself" "$S/d2.out"
rd d3 --dry-run --game-dir "$FAKE_HOME/public_html"; expect_rc "public_html by its absolute path" 2 $RC
expect_in "recognised as public_html itself" "is public_html itself" "$S/d3.out"
rd d4 --dry-run --game-dir "$FAKE_HOME"; expect_rc "the home folder by its absolute path" 2 $RC
expect_in "recognised as the home folder" "home folder" "$S/d4.out"
rd d5 --dry-run --game-dir /tmp; expect_rc "a folder outside the home" 2 $RC
expect_in "says it is outside" "outside the account's home" "$S/d5.out"
mkdir -p "$FAKE_HOME/stray" ; echo x > "$FAKE_HOME/afile"
rd d6 --dry-run --game-dir afile; expect_rc "a file, not a folder" 2 $RC
[ ! -s "$FAKE_RSYNC_LOG" ] && ok "rsync never ran for any of them" || bad "rsync ran"
expect_not_in "no mkdir was ever sent to the host" "mkdir" "$FAKE_SSH_LOG"
expect_file "public_html is untouched" "$FAKE_HOME/public_html/index.php"

echo "E. a good folder beside public_html: the exact rsync command, and nothing else"
host_reset; reset_logs
rd e1 --dry-run --game-dir play.arcgame.app; expect_rc "dry run" 0 $RC
expect_in "the host check passed" "the game's folder is $FAKE_HOME/play.arcgame.app" "$S/e1.out"
expect_in "rsync flags" "-rlc --delete --itemize-changes --chmod=D755,F644 --exclude .DS_Store --exclude .well-known/ -n -e" "$FAKE_RSYNC_LOG"
expect_in "rsync goes over ssh with BatchMode" "RSH: ssh -o BatchMode=yes -o ConnectTimeout=20" "$FAKE_RSYNC_LOG"
expect_in "rsync's destination is the game's folder" "$S/dist/ arcgame:$FAKE_HOME/play.arcgame.app/" "$FAKE_RSYNC_LOG"
expect_not_in "rsync never names public_html" "public_html" "$FAKE_RSYNC_LOG"
expect_not_in "no mkdir on the host" "mkdir" "$FAKE_SSH_LOG"
expect_in "the only things asked of the host are cd and pwd" "pwd -P" "$FAKE_SSH_LOG"
expect_in "the play folder is the one asked about" "cd -- play.arcgame.app" "$FAKE_SSH_LOG"
[ "$(cat "$FAKE_HOME/play.arcgame.app/index.html")" = placeholder ] && ok "the dry run changed nothing" || bad "changed by a dry run"
reset_logs
rd e2 --game-dir play.arcgame.app < /dev/null; expect_rc "a real run with no terminal and no --yes" 1 $RC
expect_in "asks for --yes" "Pass --yes" "$S/e2.out"
[ "$(cat "$FAKE_HOME/play.arcgame.app/index.html")" = placeholder ] && ok "nothing uploaded without an answer" || bad "uploaded"
rdy no e3 --game-dir play.arcgame.app; expect_rc "answering no" 1 $RC
expect_in "cancelled" "Cancelled" "$S/e3.out"
[ "$(cat "$FAKE_HOME/play.arcgame.app/index.html")" = placeholder ] && ok "nothing uploaded after no" || bad "uploaded after no"
python3 -I -m http.server 8092 --bind 127.0.0.1 --directory "$FAKE_HOME/play.arcgame.app" > "$S/live.log" 2>&1 & PIDS+=($!)
sleep 1
rdy yes e4 --game-dir play.arcgame.app; expect_rc "answering yes" 0 $RC
expect_in "uploaded" "Deployed" "$S/e4.out"
expect_file "the folder holds the build" "$FAKE_HOME/play.arcgame.app/sw.js"
expect_file "...and its .htaccess" "$FAKE_HOME/play.arcgame.app/.htaccess"
expect_file "public_html is untouched" "$FAKE_HOME/public_html/index.php"
expect_no_file "nothing of the game went into public_html" "$FAKE_HOME/public_html/sw.js"
expect_in "no key: the manual purge steps are printed" "Click \"Purge Everything\"" "$S/e4.out"
expect_in "live check passed against the stand-in" "serves this build" "$S/e4.out"
expect_not_in "no mkdir on the host" "mkdir" "$FAKE_SSH_LOG"
echo "   the env var works, and the flag wins over it"
reset_logs
ARC_GAME_REMOTE_DIR=play.arcgame.app rd e5 --dry-run; expect_rc "the env var alone" 0 $RC
ARC_GAME_REMOTE_DIR=nope rd e6 --dry-run --game-dir play.arcgame.app; expect_rc "the flag overrides the env var" 0 $RC

echo "F. a play folder INSIDE public_html"
host_reset; reset_logs
rd f1 --dry-run --game-dir public_html/play; expect_rc "public_html/play is accepted" 0 $RC
expect_in "destination" "arcgame:$FAKE_HOME/public_html/play/" "$FAKE_RSYNC_LOG"
rdy yes f2 --game-dir public_html/play; expect_rc "upload" 0 $RC
expect_file "the game is in public_html/play" "$FAKE_HOME/public_html/play/sw.js"
expect_file "public_html's placeholder is untouched by a GAME deploy" "$FAKE_HOME/public_html/index.php"
expect_file ".well-known is untouched" "$FAKE_HOME/public_html/.well-known/acme-challenge/t"

# ==============================================================================================
echo "G. the SITE deploy (tools/site-holding to public_html), protecting the game"
host_reset; reset_logs
rd g1 --site --dry-run; expect_rc "--site with no game folder" 2 $RC
expect_in "needs the game's folder" "no remote folder for the game" "$S/g1.out"
[ ! -s "$FAKE_RSYNC_LOG" ] && ok "rsync did not run" || bad "rsync ran"
# The game is already in public_html/play, as after section F.
rdy yes g0 --game-dir public_html/play; expect_rc "(setup: the game uploaded into public_html/play)" 0 $RC
reset_logs
GAME_SUM="$(cd "$FAKE_HOME/public_html/play" && find . -type f | sort | wc -l | tr -d ' ')"
rd g2 --site --dry-run --game-dir public_html/play; expect_rc "site dry run, game nested" 0 $RC
expect_in "works out that the game is inside public_html" "the game's folder is inside public_html, so the site deploy will not touch /play/" "$S/g2.out"
expect_in "rsync protects .well-known and the game's folder" "--exclude .DS_Store --exclude .well-known/ --exclude /.well-known/ --exclude /play/ -n" "$FAKE_RSYNC_LOG"
expect_in "destination is public_html" "arcgame:$FAKE_HOME/public_html/" "$FAKE_RSYNC_LOG"
expect_in "source is the holding folder" "$REPO/tools/site-holding/ arcgame:" "$FAKE_RSYNC_LOG"
expect_in "the plan deletes the placeholder" "index.php" "$S/g2.out"
expect_not_in "...and nothing of the game" "      play/" "$S/g2.out"
expect_in "it lists what is protected" "protected, never deleted: /.well-known/ /play/" "$S/g2.out"
expect_not_in "no mkdir on the host" "mkdir" "$FAKE_SSH_LOG"
[ -f "$FAKE_HOME/public_html/index.php" ] && ok "the dry run changed nothing" || bad "dry run changed public_html"
rdy yes g3 --site --game-dir public_html/play; expect_rc "site upload" 0 $RC
expect_file "the holding .htaccess is in public_html" "$FAKE_HOME/public_html/.htaccess"
cmp -s "$FAKE_HOME/public_html/.htaccess" "$REPO/tools/site-holding/.htaccess" && ok "...and is the committed one" || bad "different .htaccess"
expect_no_file "the placeholder is gone" "$FAKE_HOME/public_html/index.php"
expect_file ".well-known survived" "$FAKE_HOME/public_html/.well-known/acme-challenge/t"
[ "$(cd "$FAKE_HOME/public_html/play" && find . -type f | sort | wc -l | tr -d ' ')" = "$GAME_SUM" ] && ok "the game's $GAME_SUM files survived" || bad "the game lost files"
expect_file "the game's index.html survived" "$FAKE_HOME/public_html/play/index.html"

echo "H. the site deploy when the game's folder is OUTSIDE public_html"
host_reset; reset_logs
rd h1 --site --dry-run --game-dir play.arcgame.app; expect_rc "dry run" 0 $RC
expect_in "says it is outside" "the game's folder is outside public_html" "$S/h1.out"
expect_not_in "no filter for the game's folder" "--exclude /play" "$FAKE_RSYNC_LOG"
expect_in "still protects .well-known" "--exclude /.well-known/ -n" "$FAKE_RSYNC_LOG"

echo "I. the site deploy cannot delete a game it does not know about"
host_reset
# The game is in public_html/play, but the site deploy is told the game is somewhere else.
mkdir -p "$FAKE_HOME/public_html/play" && cp -R "$S/dist/." "$FAKE_HOME/public_html/play/"
before="$(find "$FAKE_HOME/public_html/play" -type f | wc -l | tr -d ' ')"
reset_logs
rd i1 --site --dry-run --game-dir play.arcgame.app; expect_rc "game not protected: refused, even for a dry run" 1 $RC
expect_in "says how many it would delete" "would delete" "$S/i1.out"
expect_in "tells him what to check" "Check --game-dir" "$S/i1.out"
rdy yes i2 --site --game-dir play.arcgame.app; expect_rc "...and for a real run" 1 $RC
[ "$(find "$FAKE_HOME/public_html/play" -type f | wc -l | tr -d ' ')" = "$before" ] && ok "all $before of the game's files are still there" || bad "files were deleted"
expect_file "the placeholder is still there too" "$FAKE_HOME/public_html/index.php"
rd i3 --site --dry-run --game-dir play.arcgame.app --allow-many-deletes; expect_rc "--allow-many-deletes lets a dry run through" 0 $RC
rd i4 --site --dry-run --game-dir play.arcgame.app --keep play; expect_rc "or protecting the folder with --keep" 0 $RC
expect_in "--keep adds a filter" "--exclude /play/" "$FAKE_RSYNC_LOG"
for badkeep in '../x' '/' '' 'a b' 'x;y'; do
  rd i5 --site --dry-run --game-dir play.arcgame.app --keep "$badkeep"; expect_rc "--keep '$badkeep' is refused" 2 $RC
done
rd i6 --site --dry-run --game-dir public_html/play --keep stats --keep /logs/; expect_rc "two --keep paths" 0 $RC
expect_in "both are filtered" "--exclude /play/ --exclude /stats/ --exclude /logs/ -n" "$FAKE_RSYNC_LOG"

echo "J. the site deploy refuses to send the wrong folder"
host_reset; reset_logs
rd j1 --site --dry-run --game-dir play.arcgame.app --site-dir "$REPO/apps/game/dist"; expect_rc "the game's own dist" 2 $RC
expect_in "says it looks like the game build" "looks like the game build" "$S/j1.out"
mkdir -p "$S/notsite"; echo x > "$S/notsite/sw.js"; echo '# x' > "$S/notsite/.htaccess"
rd j2 --site --dry-run --game-dir play.arcgame.app --site-dir "$S/notsite"; expect_rc "a folder with a sw.js" 2 $RC
mkdir -p "$S/nohta"; echo x > "$S/nohta/index.html"
rd j3 --site --dry-run --game-dir play.arcgame.app --site-dir "$S/nohta"; expect_rc "a folder with no .htaccess" 2 $RC
rd j4 --site --dry-run --game-dir play.arcgame.app --site-dir "$S/missing"; expect_rc "a folder that does not exist" 2 $RC
[ ! -s "$FAKE_RSYNC_LOG" ] && ok "rsync never ran for any of them" || bad "rsync ran"

echo "K. the site into a local folder, and the leak check on the site folder"
mkdir -p "$S/pub/.well-known" "$S/pub/play"; echo t > "$S/pub/.well-known/t"; echo g > "$S/pub/play/g"; echo '<?php' > "$S/pub/index.php"
DEPLOY_TARGET="$S/pub" rd k1 --site --keep play; expect_rc "site into a local stand-in for public_html" 0 $RC
expect_file ".htaccess arrived" "$S/pub/.htaccess"
expect_no_file "placeholder removed" "$S/pub/index.php"
expect_file ".well-known kept" "$S/pub/.well-known/t"
expect_file "--keep'd folder kept" "$S/pub/play/g"
mkdir -p "$S/leaky"; cp "$REPO/tools/site-holding/.htaccess" "$S/leaky/"; printf 'fake-admin-password-xyz' > "$S/leaky/page.html"
ARC_ENV_FILE="$S/fake.env" DEPLOY_TARGET="$S/pub" rd k2 --site --site-dir "$S/leaky"; expect_rc "a secret in the site folder stops it" 1 $RC
expect_in "names the file" "page.html" "$S/k2.out"
expect_not_in "...and nothing else about it" "fake-admin-password-xyz" "$S/k2.out"

# ==============================================================================================
echo "L. the CDN purge, against a local mock of the API"
host_reset
cp "$S/dist/index.html" "$FAKE_HOME/play.arcgame.app/index.html"   # the live stand-in on :8092 serves this build's page
FAKEKEY="FAKE-KEY-for-test-123"; FAKEB64="$(printf '%s' "$FAKEKEY" | base64)"
MOCK_STATUS=200 python3 -I "$S/mock.py" 8093 "$S/mock.log" & PIDS+=($!)
MOCKPID=$!
sleep 1
ARC_20I_API_KEY="$FAKEKEY" ARC_20I_API_BASE=http://127.0.0.1:8093 rd l1 --purge-only; expect_rc "game purge-only with a key" 0 $RC
expect_in "the game's addresses are purged" "purged https://play.arcgame.app/asset-manifest.json" "$S/l1.out"
[ "$(wc -l < "$S/mock.log" | tr -d ' ')" = 5 ] && ok "the mock got five requests" || bad "mock got $(wc -l < "$S/mock.log") requests"
expect_in "right path and package" "/package/981c98df9aeca87b/web/purgeCdnByUrl" "$S/mock.log"
expect_in "Bearer base64(key)" "Bearer $FAKEB64" "$S/mock.log"
expect_in "body names the URL" "{\\\"url\\\":\\\"https://play.arcgame.app/sw.js\\\"}" "$S/mock.log"
expect_not_in "output never shows the key" "$FAKEKEY" "$S/l1.out"
expect_not_in "output never shows the encoded key" "$FAKEB64" "$S/l1.out"
expect_not_in "no manual steps when the API accepted" "Purge Everything" "$S/l1.out"
expect_in "live check says it serves this build" "serves this build" "$S/l1.out"
: > "$S/mock.log"
LIVE_URL=http://127.0.0.1:8093 ARC_20I_API_KEY="$FAKEKEY" ARC_20I_API_BASE=http://127.0.0.1:8093 rd l2 --site --purge-only; expect_rc "site purge-only" 0 $RC
[ "$(wc -l < "$S/mock.log" | tr -d ' ')" = 1 ] && ok "one request for the site" || bad "mock got $(wc -l < "$S/mock.log") requests"
expect_in "it purges arcgame.app's front door" "{\\\"url\\\":\\\"https://arcgame.app/\\\"}" "$S/mock.log"
expect_in "the live check reports the redirect" "answers: HTTP/1.0 302 Found -> https://play.arcgame.app/" "$S/l2.out"
kill "$MOCKPID" 2>/dev/null; sleep 0.5
MOCK_STATUS=404 python3 -I "$S/mock.py" 8093 "$S/mock2.log" & PIDS+=($!)
sleep 1
ARC_20I_API_KEY="$FAKEKEY" ARC_20I_API_BASE=http://127.0.0.1:8093 rd l3 --purge-only; expect_rc "API says 404: still exit 0" 0 $RC
expect_in "falls back to the manual steps" "Click \"Purge Everything\"" "$S/l3.out"
expect_in "says the CDN is probably not purged" "probably NOT purged" "$S/l3.out"
expect_not_in "failure output never shows the key" "$FAKEKEY" "$S/l3.out"
ARC_20I_API_KEY="$FAKEKEY" ARC_20I_API_BASE=http://127.0.0.1:1 rd l4 --purge-only; expect_rc "API unreachable: still exit 0" 0 $RC
expect_in "unreachable falls back too" "Click \"Purge Everything\"" "$S/l4.out"

echo "M. the live check"
mkdir -p "$S/old"; printf '<script src="/assets/index-OLDOLD11.js"></script>' > "$S/old/index.html"
python3 -I -m http.server 8094 --bind 127.0.0.1 --directory "$S/old" > "$S/old.log" 2>&1 & PIDS+=($!)
sleep 1
LIVE_URL=http://127.0.0.1:8094 rd m1 --purge-only; expect_rc "stale live site: exit 0" 0 $RC
expect_in "reports the stale page" "still holding the old page" "$S/m1.out"
expect_in "names the old bundle" "index-OLDOLD11.js" "$S/m1.out"
LIVE_URL=http://127.0.0.1:1 rd m2 --purge-only; expect_rc "unreachable live site: exit 0" 0 $RC
expect_in "reports it could not fetch" "could not fetch" "$S/m2.out"

echo "N. the script itself"
if grep -n 'mkdir' "$DEPLOY" | grep -v -e 'TARGET' -e '^[0-9]*: *#' -e 'mktemp' | head -3 | grep -q .; then bad "a mkdir that is not on the local target"; else ok "the only mkdir in the script is the local test target's"; fi
if grep -n -e 'host_run' "$DEPLOY" | grep -q -e 'rm ' -e 'mkdir' -e 'mv ' -e 'cp ' -e ' > '; then bad "host_run is used for more than reading"; else ok "host_run is only used for cd and pwd"; fi
bash -n "$DEPLOY" && ok "bash -n passes" || bad "syntax error"

echo
echo "deploy-test: $PASS ok, $FAIL failed"
[ "$FAIL" = 0 ]
