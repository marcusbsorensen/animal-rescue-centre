# A.R.C. on a phone — handover 2026-08-31

This session did three things, not one: took the repo public, hardened
every abusable endpoint, and got the game tapped on iOS. Only the third
serves the goal; the first two were forced by the first.

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, usable by 7–10 year
olds. Current arc: make it work on a phone.

## State
Clean tree on `main`, level with `origin/main`. Typecheck clean, lint 0
errors / 38 pre-existing warnings, 1137 tests pass, CI green.

**Verified.** The repo is public and Actions runs again — it was a
spending limit on private-repo minutes, never the code. The real iOS
build has been driven by hand through the whole account flow on an
iPhone 17 Pro simulator. Four UX fixes found that way are shipped, each
re-walked on the device: a taken name now answers on the name screen,
"Tap your picture" follows the real chip count, "Couldn't find you in
the list" is gone on a fresh device, and the account plank hides behind
the keyboard rather than being sliced. Rate limiting is Postgres-backed,
per-name and per-address, on `login`, `get-pin-hint`, `signup` and
`send-gift`, plus 5-per-hour per friendship on gifts — all exercised
against production.

**Unverified.** Nothing has run on physical hardware, and GameScene has
never been touched by hand on iOS; everything above stops at the account
screens. The harness still reports **3 FAIL / 100 WARN**.

## Files
- `.claude/TRAPS.md` — read first; the simulator section is load-bearing.
- `supabase/functions/_shared/rate-limit.ts` — check/peek/bump, `clientIp`.
- `supabase/migrations/00007`–`00009` — limiter, peek, its off-by-one.
- `apps/game/public/admin/signup.html` — name check, keyboard handling.
- `apps/game/src/lib/auth.ts` — `checkUsername`, fails open.
- `apps/game/e2e/ux-review.spec.ts` — harness. Needs `ARC_BROWSER_CHANNEL=chrome`.

## Decisions made
- **Rotation, not reversion, for a leaked secret.** Going public made the
  committed harness pair permanent. Rotated; both halves in `.env.local`.
- **Rate limiting belongs in the database** — a module-level Map is
  per-isolate and Supabase recycles isolates. Failures only. A success
  clears the name key but never an address key: clearing that would let
  someone with one valid account spray, log in, and repeat.
- **`revoke execute` is load-bearing** — PostgREST publishes `public`
  functions as RPCs the shipped anon key can call.
- **Address budgets are deliberately loose** (60/15min). Addresses are
  shared, so a child behind an attacked one is locked out too; accepted.
- **Signup's name oracle is capped, not closed.** Telling a child only
  "no" is worse. Revisit if users exceed one family.

## Next step
Get into GameScene on iOS and tap the left rail — where the 3 harness
FAILs live (two controls 4px apart against a MIN_TAP_GAP of 12; the
collapsed pull-tab at `x=0` reading as a 50px inset) and where nothing
has been touched by hand.

## Traps
- All of `.claude/TRAPS.md`, especially: boot one simulator not three;
  re-`attach` after a reboot; `px = 402 - yl, py = xl`.
- **Fixing the iframe is not fixing the flow.** `login.html` stopped
  sending `not-in-chips` and the note persisted — `LoginScene.ts` was
  re-supplying it as a default. Re-walk on the device.
- **Capacitor resizes the web view**, so keyboard detection via
  `innerHeight - visualViewport.height` silently does nothing.
- `visitors.test.ts:53` is flaky: a 10ms wall-clock tolerance that loses
  under full-suite load. Passes alone. A task chip has the diagnosis.
- Queued, untouched: `add-friend` has no limit (the gate the gift pair cap
  leans on); `forgot-pin.html` and `news.html` never linked
  `_short-landscape.css`; the portrait nav overlap below ~460px; the
  fourteen-scene resize-handler leak.
