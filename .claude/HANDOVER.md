# A.R.C. multi-platform — handover 2026-08-28

> Save sync is finished and real: server deployed, phases 1 and 2 both running
> against the live project. Everything on this branch is committed. What is left
> is iOS hardware, which needs Marcus at the keyboard.

## Goal
Ship A.R.C. as an iPad/iPhone app plus a web fallback: one account, progress synced
across all three.

## State
**Verified against the linked project `arc` (`bdptplvksniheaqjitek`), not a local stack:**
- *Migrations applied.* `00005_sessions` **and** `00006_game_state_version`. Remote
  history is 00001–00006.
- *All nine Edge Functions deployed.* `save-game`, `load-game`, `add-friend`,
  `send-gift`, `claim-gift`, `create-showcase`, `get-showcase` had **never been
  deployed**; `login` and `signup` were the pre-sessions versions from May.
- *Save sync phase 1 exercised.* Two sessions on one account, collision driven from
  both sides, 29 assertions. The 409 carries the winner's state, the rejected write
  leaves the stored row untouched, the loser's re-send lands.
  → `docs/save-sync-deploy-2026-08-28.md`
- *Save sync phase 2 built and exercised.* Three-way merge against a `::base`
  ancestor in `localSave`. Live test: two devices each rescued an animal, one spent
  40 coins and the other earned 30, one bought an upgrade — after the real 409 the
  server held all three animals, `totalRescued` 3, 90 coins, both upgrades. Then a
  rehoming on one device survived a feeding on the other. 13 assertions.
  → `docs/save-sync-phase2-2026-08-28.md`
- *Social functions smoke-tested.* Friend by join code, gift sent and claimed,
  showcase published and read back. 17 assertions.
- Local gates: typecheck, lint (0 errors), **979 unit tests**, production build.
- Database is back to its one pre-existing row (Marcus), zero sessions. Every test
  player was deleted.

**Still not done:**
- Nothing has run on iOS hardware. `pnpm ios` builds and opens Xcode; signing and a
  device are Marcus's to do.
- Depot/SupplyRun overflow in landscape — cards run under the back button. A design
  call: scrolling list or two-column grid.
- Three UX findings left open on purpose (28px phase pill, T4, L6 counts).

**Already red, and was before any of this:** `e2e/visual.spec.ts` — `main-menu.png`
baseline is 438 commits stale (2026-04-18). Regenerate with
`pnpm --filter @arc/game test:visual:update` once the landscape layout settles.

**Everything is committed.** Eight commits on `feat/ptv-driving-engine`, working tree
clean. `main` is still the 4 July merge, so whatever Vercel serves is a client that
writes `game_states` directly with the anon key — the hole the 22 August audit
closed. **That closes for real only when this branch ships.** Merging it is the next
decision, not a formality.

## Files
- `packages/game-logic/src/merge-save.ts` — `mergeSaveState`; per-field rules in the header.
- `apps/game/src/game-state/localSave.ts` — three IndexedDB records: live, `::rejected`, `::base`.
- `apps/game/src/game-state/loadSaveState.ts` — `handleConflict` and `reconcileWithLocal`, the two places a divergence surfaces.
- `supabase/functions/save-game/index.ts:80` — the three `expectedVersion` cases; `conflict()` at the bottom.
- `supabase/functions/_shared/session.ts` — `requireSession` / `createSession`; token rides in `x-arc-session`.
- `apps/game/src/ui/constants.ts` — `MIN_TAP`, `MIN_TAP_GAP`, `bottomAnchorY`; `SAFE_MARGIN` still needs `env(safe-area-inset-*)`.

## Decisions made
- **Capacitor** for iOS; landscape-locked in `Info.plist`; **Kids Category**, so never a
  third-party analytics or ads SDK, not even temporarily. Fonts self-hosted for the
  same reason.
- `version` and `updated_at` are server-owned by DB trigger, never by the request.
- An **unversioned** save still gets the old last-write-wins path, so a browser on
  cached pre-versioning JS is not locked out of saving.
- **Three-way merge**, not newest-wins: animals leave by array removal with no
  tombstone, so a two-way merge cannot tell a rescue from an adoption.
- **Economy reconciles additively** (base + both deltas, floored at zero) so both
  devices' earning and spending survive.
- **The child is told nothing** about a merge. If it is right there is nothing to act on.
- An animal keeps the furthest-along `state` and the higher `bondLevel` even when the
  other device wins it.
- `MIN_TAP` applies to the **hit area**, not the drawn art.

## Next step
Marcus's call between:
1. **iOS hardware run** — `pnpm ios`, then signing and a device.
2. **Merge this branch to main** — it is what actually closes the auth hole in production.
3. **Depot/SupplyRun landscape overflow** — the open design call.

## Traps
- **Check `supabase functions list` before assuming anything is deployed.** Committed
  is not deployed; this branch had five months of divergence.
- `supabase db push` and `functions deploy` do **not** need Docker. The
  `WARNING: Docker is not running` on deploy is noise.
- A malformed JSON body answers **500**, not 400 — `req.json()` throws inside the try.
- A PostgREST builder is `PromiseLike`: it has `then`, **not** `catch`. `.catch()` on
  one throws a TypeError. That is what broke `send-gift` after it had already
  inserted the gift.
- Deleting a `users` row cascades sessions, game_states, gifts, friendships and
  showcase_links; `audit_log` keeps its rows with `user_id` nulled, by design.
- `curl … /rest/v1/<table>?select=<column that does not exist>` returns a 4-key error
  object, and `len()` on it reads as "4 rows". Select a real column before believing a count.
- Playwright needs `ARC_BROWSER_CHANNEL=chrome`; the bundled Chromium download stalls.
- WebGL does not initialise in the Claude browser pane. Use Playwright, not `preview_*`.
- `@arc/game-logic` has `main: src/index.ts` and `noEmit`, so there is no `dist/`.
  To run a node script against it, use `apps/game/node_modules/.bin/tsx`.
- The ux-review harness has a history of false findings. Verify against source first.
- `GameScene` shows an arrival card or the corridor depending on state, so its
  measurements move between runs.
- `createPillTitle` draws into a Graphics object, which contributes nothing to
  `getBounds()`. Use `title.height`, or your next row lands inside the pill.
- A scripted whole-file rewrite ate eleven files on 27 Aug by dropping the buffer
  tail. Assert on length after any such edit.
- Root `pnpm build` excludes `@arc/admin` on purpose; its build refuses without
  `ARC_ADMIN_LOCAL_BUILD=1`.
