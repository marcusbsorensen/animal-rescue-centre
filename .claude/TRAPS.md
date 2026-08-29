# A.R.C. — traps

Long-lived gotchas, accumulated across sessions. Split out of HANDOVER.md on
2026-08-29 so the handover can stay short. Add to it; do not prune without
checking the claim still holds.

- **`tickAllNeeds` replaces every `Animal` object every 2 seconds.**
  `store.animals = store.animals.map(tickNeeds)` and `tickNeeds` returns
  `{ ...animal }`. **Any object captured in a closure is an orphan two
  seconds later.** Writing to it succeeds silently and changes nothing the
  game renders from. This is what made the Welcome button look dead: it
  fired, ran its handler, set `state = 'sheltered'` on a copy, and
  incremented the real `totalRescued` — so the child got no animal, no
  error, and an inflated rescue count for every attempt. Always look the
  animal up by id in `store.animals` first; the feed path already does.
  `applySickness` (GameScene ~483) and the Garden/Kitchen views also
  replace elements, so identity is not preservable in general — resolving
  by id is the answer, not trying to keep references stable.
- **Real iOS WebKit is reachable without a build.** Serve the app with
  `vite --host 0.0.0.0`, drop a throwaway page under
  `apps/game/public/admin/` that writes an `arc_session` into
  `localStorage` and redirects to `/` (same origin, so the game picks it
  up), then `xcrun simctl openurl <udid> http://localhost:<port>/admin/<page>.html`.
  Mobile Safari on the simulator is the same engine as the app's WKWebView,
  needs no `cap sync` or Xcode build, and **keeps HMR** — edit, and the
  device reloads. This is how the Welcome bug was found. You still cannot
  run JS in it, so instrument by writing into a fixed DOM div; it shows up
  in the screenshot.
- **The Chrome/Playwright harness is not trustworthy for input testing
  here.** With no Supabase behind it, `ErrorOverlay` (depth 10000,
  `src/ui/ErrorOverlay.ts:136`) puts a full-screen interactive scrim over
  everything and keeps coming back after you destroy it, so every real
  click lands on the scrim while `hitTest` — run against coordinates you
  set by hand — still reports the right object. That combination will tell
  you a working button is dead. Verify input on the simulator.
- **The simulator letterboxes a landscape-locked app when the device is in
  portrait** — 305-point bars on an iPad Air 11-inch (M4). Use
  `node tools/sim-band.mjs <udid> <name> <outdir>`; it prints the offset to
  add back. Rotating to landscape needs Cmd+Left in Simulator.app — there
  is no `simctl` command and `osascript` needs assistive access.
- **`window.__PHASER_GAME__` is exposed and NOT dev-gated**
  (`src/main.ts:100`), store on the registry as `'gameStore'`. From Safari
  Web Inspector, `gs.openAdoptionOverlay(a, '01-pri-kaur')` /
  `gs.openRewildingOverlay(a)` open either ceremony instantly. **There is
  no other dev shortcut** — no `?debug`/`?cheat`/`?seed`, no dev menu, no
  keyboard hooks (only `?dialogueDemo` and `?ptvDemo`). `cockpit.html` is a
  driving mockup, not a console.
- **Rewilding has no gameplay route at all.** `openRewildingOverlay` fires
  only from `'aspire-rewild'`, and `paths.html`'s rewild card is
  hard-locked — the click handler returns early on `.path-state-locked`.
- **Adoption needs bond ≥ 50 and state ≠ 'pet'** (`AnimalDetailsPopup.ts:78`);
  bond hitting 100 flips the animal to `'pet'` and removes the Paths
  button, so the usable window is bond 50–99. Feed is +3 and closes the
  popup — roughly 32 taps from a fresh animal. Instrument the build instead.
- **`tools/optimise-sprites.ts` used to degrade art on every re-run.**
  Fixed in `4bbce6a`, but if you see the animal folder shrink for no
  reason, that is what happened. A dry run should now report
  "523 already quantised, 0 oversized" and no size change.
- **Check `supabase functions list` before assuming anything is deployed.**
  Committed is not deployed.
- `supabase db push` and `functions deploy` do **not** need Docker. The
  `WARNING: Docker is not running` on deploy is noise.
- A malformed JSON body answers **500**, not 400 — `req.json()` throws inside the try.
- A PostgREST builder is `PromiseLike`: it has `then`, **not** `catch`.
- Deleting a `users` row cascades sessions, game_states, gifts, friendships
  and showcase_links; `audit_log` keeps its rows with `user_id` nulled.
- `curl … /rest/v1/<table>?select=<column that does not exist>` returns a
  4-key error object, and `len()` on it reads as "4 rows". **`id` is not a
  universal column here** — `sessions` keys on `token`, `friendships` and
  `showcase_links` have no `id`. `user_id` is the safe probe.
- Playwright needs `ARC_BROWSER_CHANNEL=chrome`; the bundled downloads
  stall. `playwright install webkit` stalls too — do not wait on it, use
  the simulator's Safari instead.
- WebGL does not initialise in the Claude browser pane. Use Playwright or
  the simulator, not `preview_*`.
- `@arc/game-logic` has `main: src/index.ts` and `noEmit`, so there is no
  `dist/`. To run a node script against it, use `apps/game/node_modules/.bin/tsx`.
- `playwright` is not installed as a bare package — import from
  `@playwright/test`, and only from inside `apps/game/` where it resolves.
- The ux-review harness has a history of false findings. Verify against source first.
- `GameScene` shows an arrival card or the corridor depending on state, so
  its measurements move between runs.
- `createPillTitle` draws into a Graphics object, which contributes nothing
  to `getBounds()`. Use `title.height`.
- A scripted whole-file rewrite ate eleven files on 27 Aug by dropping the
  buffer tail. Assert on length after any such edit.
- Root `pnpm build` excludes `@arc/admin` on purpose; its build refuses
  without `ARC_ADMIN_LOCAL_BUILD=1`.
