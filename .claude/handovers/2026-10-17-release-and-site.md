# Release branch and the website — handover 2026-10-17

Supersedes `.claude/HANDOVER.md` (14 Oct) for everything below. That file is
left alone because other sessions read it. Longer than 60 lines because this
day covered two unrelated things: finishing 154A and getting arcgame.app ready.

## Goal
Get `claude/crate-loading` merged to main as one release Marcus approves, and
arcgame.app live on 20i with the game at play.arcgame.app.

## State
**Verified.** `claude/crate-loading` at `8a37b2d`, pushed, not merged.
`claude/arcgame-site` at `e4f20ca`, pushed. All gates green on the release
branch: game 1979, game-logic 1486, edge-functions 180, badges 18, typecheck,
lint, check:sprites.
- **154A is done** — the empty "Last visit" and "Sprout" labels are hidden, a
  child can type a friend's code, add-friend is rate limited, and the gift
  inbox and board are read by the server, which is why gifts never arrived.
- **Join codes** went from 18,000 to 135,000 (150 animals, same WORD-NNN
  shape). 18,000 was a ceiling on accounts, not only a guessing risk.
- **All three website `[check]` claims** are now true in code.
- **`site/.htaccess` passes under real Apache.** The test caught two faults
  that would have shipped: the caching did nothing, and a missing
  `/.well-known/` file answered 301, which breaks certificate renewal.
- **The support URLs are live** — I fetched all three myself; `/arc/` carries
  `id="reports"`.

**Unverified.** `apps/game/e2e/` and `e2e-compat/` are correct by reading
only; they need a local Supabase stack and have not run since the signup and
gift changes. Nothing of today has run against production.

**Open, and Marcus's call.** The published privacy notice says "The game asks
for no email address, from a child or from a grown-up, and keeps none." True
today, false the day the parent account ships. Either narrow it now or retract
it later. The hub owns that page and has been told.

## Files
- `docs/driving-rebuild-2026-10-11.md` — the driving spec, untouched today.
- `supabase/functions/_shared/gift-messages.ts` — the fifteen codes send-gift
  will take. `parent-account` has its own copy; see below.
- `supabase/functions/_shared/crypto.ts` — `JOIN_CODE_ANIMALS`, with the rules
  for adding more beside it.
- `apps/game/public/admin/friends.html` + `src/auth-overlay/AuthOverlay.ts` —
  the friends board and the new code box.
- `tools/test-arcgame-htaccess.sh` — takes `SITE_DIR` now and tests the
  website's rules in the worst-case nested layout.
- `/Users/marcus/Projects/arc-site-wt` — worktree on `claude/arcgame-site`.
  Remove it once that branch merges.

## Decisions made
- **The add-friend limit counts wrong guesses, not right ones**, so a class of
  thirty swapping real codes never meets it. 20 per 15 minutes, per account and
  per address. No migration: `rate_limits` takes any key.
- **Signup requires a name off the list.** The cost is that a cached old build
  cannot make a NEW account; signing in is untouched. The refusal carries the
  names under both `names` and `suggestions`, because the old build only reads
  the second.
- **The site says "a player is never asked for an email address"**, not "it
  never asks", so a parent account cannot make it false.
- **Gifts carry one of fifteen codes.** The screen always offered only those;
  the server took any string and the inbox printed it raw.

## Next step
Rebuild `apps/game/dist` — it is from 14 Oct, one deploy test fails on it, and
nothing can be deployed from it. Then ask Marcus whether to open the release PR.

## Traps
- **Homebrew's node@24 is broken** (missing libsimdjson). Prefix everything
  with `export PATH=/usr/local/bin:$PATH` for node v22.16.0. `brew reinstall
  node@24` would fix it; Marcus has not run it.
- **`pnpm test` does not run the e2e specs.** Three of them were broken for
  hours today by server changes and nothing said so. Check `apps/game/e2e/`
  and `e2e-compat/` by hand after any function change.
- **A test that sends an invalid value hides the gap it should catch.** Two
  unit fixtures and four e2e calls sent `messagePresetCode: 'hello'`, which was
  never one of the fifteen. That is how the free-text hole survived.
- **`parent-account` (~/Projects/arc-parent-account) is based on `12394fa`**
  and another session is editing it live — do not merge from that worktree.
  It kept all of today's add-friend work. Conflicts: `send-gift/index.ts`
  (take its side, it validates the gift type too), `send-gift.test.ts`
  (trivial), `SocialScene.ts` (take its side, or `message` is undeclared).
  `signup` does not conflict. It uses migrations 00022–00028 while the release
  stops at 00021, so a new release migration numbered 00022 collides.
- **20i has a proxy in front.** Every host-tied rule depends on Apache seeing
  `Host: arcgame.app`; if the proxy rewrites it there is no CSP and no
  redirects. Everything is inside `<IfModule>`, so a missing `mod_headers`
  skips the rules silently.
- **Vite on 5173 is Lily's.** Never start or stop it.
- **Never push to main, never deploy, no db push without Marcus's go.**
