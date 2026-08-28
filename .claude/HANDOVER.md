# A.R.C. multi-platform — handover 2026-08-28

> One thing this session: the server side of save sync is real. Migrations
> applied, four functions deployed, a 409 watched happening in both directions.

## Goal
Ship A.R.C. as an iPad/iPhone app plus a web fallback: one account, progress synced
across all three.

## State
**Done and verified this session** — against the linked project `arc`
(`bdptplvksniheaqjitek`), not a local stack:
- *Migrations applied.* `00005_sessions` **and** `00006_game_state_version`. The
  handover said one was pending; two were. Remote history is now 00001–00006.
- *Four functions deployed.* `save-game`, `load-game`, `login`, `signup`. The first
  two had **never been deployed** — the deployed list was three entries long. `login`
  was still the pre-sessions version from 12 May, so the four had to go together or
  `requireSession` would have read an empty table and 401'd every save.
- *Two-device sync exercised.* Throwaway player, two sessions, collision driven from
  both sides, player deleted. 29 assertions, 0 failures. The 409 carries the winner's
  state; the rejected write leaves the stored row untouched; the loser's re-send on
  the returned version lands. → `docs/save-sync-deploy-2026-08-28.md`
- Database is back to its one pre-existing row (Marcus), zero sessions.

**Verified previously** (27 Aug, unit/e2e only): save sync phase 1 client side,
landscape UX pass, `conflicts.test.ts` flake fix. → `docs/save-sync-2026-08-27.md`,
`docs/landscape-ux-2026-08-27.md`

**Still not done:**
- *Five functions undeployed:* `add-friend`, `send-gift`, `claim-gift`,
  `create-showcase`, `get-showcase`. The client on this branch calls all five;
  friends, gifts and showcases are broken until they go up. Same 22 Aug audit commit,
  same shape, no migration needed.
- Nothing has run on iOS hardware.
- Phase 2 (merging two divergent shelters, rather than just noticing) not started.

**Already red before all this:** `e2e/visual.spec.ts` — `main-menu.png` baseline is
438 commits stale (2026-04-18). Regenerate with
`pnpm --filter @arc/game test:visual:update` once the landscape layout settles.

**Nothing is committed.** Everything from 27 and 28 August is in the working tree on
`feat/ptv-driving-engine`. `main` is still the 4 July merge, so whatever Vercel serves
is a client that writes `game_states` directly with the anon key — the hole the
22 August audit closed. That closes for real when this branch ships.

## Files
- `supabase/migrations/00006_game_state_version.sql` — version column + `game_states_touch` trigger.
- `supabase/functions/save-game/index.ts:80` — the three `expectedVersion` cases; `conflict()` at the bottom.
- `supabase/functions/_shared/session.ts` — `requireSession` / `createSession`; token rides in `x-arc-session`.
- `apps/game/src/game-state/localSave.ts` — IndexedDB store; live save plus `::rejected` copy.
- `apps/game/src/game-state/loadSaveState.ts:64` — cached version; `handleConflict` at the bottom.
- `apps/game/src/ui/constants.ts` — `MIN_TAP`, `MIN_TAP_GAP`, `bottomAnchorY`; `SAFE_MARGIN` still needs `env(safe-area-inset-*)`.
- `apps/game/e2e/ux-review.spec.ts:44` — landscape viewports; report carries failing elements with geometry.

## Decisions made
- **Capacitor** for iOS; landscape-locked in `Info.plist`; **Kids Category**, so never a
  third-party analytics or ads SDK, not even temporarily.
- `version` and `updated_at` are set by a DB trigger, never by the request — a
  caller-supplied version could be anything, defeating the point of having one.
- An **unversioned** save still gets the old last-write-wins path. A browser running
  cached pre-versioning JS would otherwise be unable to save at all.
- **Newest save wins**, on the server clock. Phase 1 applies that bluntly (one re-send
  after a rejection) and keeps the losing copy on the device. Merging is phase 2.
- `MIN_TAP` applies to the **hit area**, not the drawn art.
- Three UX findings left open deliberately — the 28px phase pill (placeholder handler),
  T4 between a painted animal and a nav tab, L6 interactive counts. Reasoning in the doc.
- Depot/SupplyRun overflow in landscape (cards run under the back button). Needs a
  scrolling list or a two-column grid — a design call, so not taken.

## Next step
Pick one:
1. Deploy the remaining five functions, so the branch's client is whole.
2. Commit the working tree — two sessions of work is a lot to be holding unversioned.
3. iOS hardware run (needs Xcode signing; Marcus's hands on the keyboard).

## Traps
- **Check `supabase functions list` before assuming anything is deployed.** Committed
  is not deployed; this branch had five months of divergence.
- `supabase db push` and `functions deploy` do **not** need Docker. The
  `WARNING: Docker is not running` on deploy is noise.
- A malformed JSON body answers **500**, not 400 — `req.json()` throws inside the try.
  Unreachable from the real client, but confusing in logs.
- Playwright needs `ARC_BROWSER_CHANNEL=chrome`; the bundled Chromium download stalls.
- WebGL does not initialise in the Claude browser pane. Use Playwright, not `preview_*`.
- The ux-review harness has a history of false findings. Verify against source first.
- `GameScene` shows an arrival card or the corridor depending on state, so its
  measurements move between runs.
- `createPillTitle` draws into a Graphics object, which contributes nothing to
  `getBounds()`. Use `title.height`, or your next row lands inside the pill.
- A scripted whole-file rewrite ate eleven files on 27 Aug by dropping the buffer
  tail. Assert on length after any such edit.
- A `Response` body can only be read once — a test reusing one rejection object across
  two calls fails for the wrong reason.
- Root `pnpm build` excludes `@arc/admin` on purpose; its build refuses without
  `ARC_ADMIN_LOCAL_BUILD=1`.
