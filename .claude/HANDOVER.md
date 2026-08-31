# A.R.C. on a phone — handover 2026-08-31

A long session covering four areas: the repo went public, every abusable
endpoint was hardened, the game was tapped on iOS for the first time, and
the landscape relayout was scoped. Only the last two serve the goal.

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, usable by 7–10 year
olds. Current arc: make it work on a phone.

## State
Clean tree on `main`, level with `origin/main`. Typecheck clean, lint 0
errors / 38 pre-existing warnings, 1137 tests pass, CI green.

**Verified on device.** The real iOS build has been driven by hand
through account creation, the intro map, an arrival and into GameScene on
an iPhone 17 Pro simulator. Four account-flow UX fixes shipped and
re-walked: a taken name is refused on the name screen instead of five
screens later, "Tap your picture" follows the real chip count, "Couldn't
find you in the list" is gone on a fresh device, and the account plank
hides behind the keyboard rather than being sliced. The left rail's
harness FAIL is fixed — it was the Dynamic Island, not a harness artifact.

**Verified against production.** Rate limiting is Postgres-backed,
per-name and per-address, on `login`, `get-pin-hint`, `signup` and
`send-gift`, plus 5-per-hour per friendship on gifts.

**Unverified.** Nothing has run on physical hardware. The other two
harness FAILs — two rail controls 4px apart against a MIN_TAP_GAP of 12 —
have not been examined.

## Files
- `.claude/TRAPS.md` — read first; the simulator section is load-bearing.
- `docs/landscape-relayout-2026-08-31.md` — the scoped proposal and its blocker.
- `apps/game/src/ui/safe-area.ts` — measures `env()` through a probe.
- `apps/game/src/ui/layout.ts` — ambient left inset; `playAreaFor`, `railBoundsFor`.
- `apps/game/src/game-views/CorridorView.ts:64` — the stretch that blocks the relayout.
- `supabase/functions/_shared/rate-limit.ts` — check/peek/bump, `clientIp`.

## Decisions made
- **Rotation, not reversion, for a leaked secret.** Going public made the
  committed harness pair permanent; it was rotated into `.env.local`.
- **Rate limiting belongs in the database.** A module-level Map is
  per-isolate and Supabase recycles isolates. Failures only. A success
  clears the name key but never an address key — clearing that would let
  someone with one valid account spray, log in, and repeat.
- **`revoke execute` is load-bearing** — PostgREST publishes `public`
  functions as RPCs the shipped anon key can call.
- **A peek compares with `<`, a check with `<=`** — they count at
  different moments. Getting this wrong let every address budget run one
  over (fixed in `00009`).
- **The safe-area inset is ambient, not a parameter** — it is a property
  of the device, identical for every caller.
- **Room anchors are not the relayout blocker.** They are 0..1 fractions
  of the background and follow the box. The blocker is that backgrounds
  are *stretched* with no aspect preservation.

## Next step
Decide how room art is fitted — step 1 of the relayout doc. The proposed
side-nav nearly halves the play box aspect (3.59 → 1.91), so every
painted room would be squashed ~1.9x. Pick one of the three costed
options (crop with `cover`, letterbox with `contain` and paint the
surround, or re-paint). Nothing else in that plan can start first.

## Traps
- All of `.claude/TRAPS.md`, especially: boot one simulator not three;
  re-`attach` after a reboot; `px = 402 - yl, py = xl`.
- **The safe area reads 0 straight after the Phaser constructor.** Nothing
  resizes again on a phone sitting still, so a single early reading leaves
  the rail under the notch and the build looks unchanged.
- **Reinstalling the app wipes localStorage**, so the whole account flow
  has to be re-walked to reach GameScene.
- **Fixing the iframe is not fixing the flow** — `LoginScene.ts` was
  re-supplying a default that `login.html` had stopped sending.
- **Capacitor resizes the web view**, so keyboard detection via
  `innerHeight - visualViewport.height` silently does nothing.
- Queued, untouched: `add-friend` has no limit; `forgot-pin.html` and
  `news.html` never linked `_short-landscape.css`; the portrait nav
  overlap below ~460px; the fourteen-scene resize-handler leak.
