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
- **The DOM screens are laid out with `@container`, not `@media`.** Grepping
  for `@media` across `public/admin/` returns nothing and will convince you
  they have no responsive rules at all. They have plenty — keyed on **width
  only**: a `>= 900px` branch and a `<= 420px` "iPhone" branch. A landscape
  phone is 780x360, so it matches neither and falls through to the base
  rules, whose `clamp()` minimums are sized for a tall viewport. That is one
  defect with 21 instances: 7 screens mounted by `AuthOverlay` and 14 by
  `InGameOverlay` (`src/game-overlay/InGameOverlay.ts`), all clones sharing
  `.welcome-inner` / `.intro` / `.signs-on-stake` / `.cta-stack`.
  `public/admin/_short-landscape.css` is the height branch; it is linked
  from the 7 auth screens only, **after** each page's inline `<style>` so it
  wins on document order. Do not move that `<link>` above the `<style>`.
- **The standalone web clip only gets 312 of the 13 mini's 360 landscape
  points.** A 48pt strip along the bottom is left as bare `#fef9ef` and
  never painted into. Measured off a screenshot on 2026-08-29; cause not
  found, and `index.html` has no safe-area handling at all, so it is not
  explicit padding. **Measure the phone at 780x312.** At 360 everything
  looks 48pt roomier than it is — that is what hid `PLAY!` coming out 43px
  tall, under the game's own 48px touch floor.
- **`xcrun simctl terminate <udid> com.apple.webapp` is the only reliable
  way to reload a Home Screen web clip.** Pressing HOME and tapping the icon
  *resumes* it: stale CSS, stale DOM, previous stage still showing. You will
  test the build from twenty minutes ago and conclude your fix did nothing.
- **Rotating the simulator still needs Marcus.** `osascript` is refused
  assistive access — confirmed, it answers "osascript is not allowed to send
  keystrokes (1002)" — and there is no `simctl` verb. Ask him for Cmd+Left.
- **The mock pages understate the live screens.** `arrival.html` renders one
  choice standing alone; the live arrival card renders more, and on a phone
  the second one is below the fold. `signup.html` and `login.html` keep
  later stages behind a `hidden` class, so measuring them on load never sees
  the PIN keypad — which shipped offering 1-6 with 7/8/9/0/delete/confirm
  off-screen. `tools/measure-screens.mjs` now toggles those stages; it still
  cannot conjure live data.
- **`overflow-y: auto` alone sets `overflow-x` to `auto` too.** Not
  `visible` — the spec forbids one axis being visible while the other is
  not. That turned signup's animal picker into a sideways scroller with its
  fourth column off the edge. State both axes.
- **The scroll container for these screens is `.device > *`, not `body`.**
  `document.body.scrollHeight` reports "content == viewport, no overflow" on
  a screen whose buttons are 391px below the fold.
- **On a landscape iPhone the tap frame is the portrait buffer, as on iPad.**
  Rotate the raw 1080x2340 screenshot with `sips -r 270` to read it, then a
  control at upright pixel `(X, Y)` is tapped at point
  `((1080 - Y) / 3, X / 3)`. Verified across a full signup.
- **`simctl io screenshot` returns the portrait buffer even when the
  device is in landscape**, so the whole picture — Safari's chrome
  included — arrives rotated 90°. Tap coordinates are in that same
  rotated frame, so a control at image `(u, v)` is tapped at `(u, v)`,
  not at its on-screen position. To convert a measurement back to screen
  coordinates on a landscape iPad: `screenX = deviceH - v`,
  `screenY = u`. Verified against `getPlayArea` maths, which matched to
  within a few points.
- **A freshly created simulator needs its own access grant** before
  screenshot/tap will work, and only Marcus can give it, from the
  simulator panel. Creating and booting the device is not enough — plan
  around a device that is already granted, or ask.
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
- **Getting a headless browser into GameScene takes three things.**
  (1) Mint a session: POST the `signup` Edge Function with the anon key
  from `.env.local` and write the returned `session` object into
  `localStorage` as `arc_session` (via Playwright's `addInitScript`, so
  it lands before the app boots). (2) Skip the intro map:
  `arc_skip_intro = 'true'` and `arc_intro_played = '1'` —
  `arc_intro_seen` is not a key and setting it does nothing. (3) An
  injected session still lands on `MainMenuScene`, which waits on a
  painted CONTINUE tap. Stop every active scene, then
  `scene.start('GameScene')` — starting it without stopping the others
  leaves MainMenuScene rendering on top.
- Playwright needs `ARC_BROWSER_CHANNEL=chrome`; the bundled downloads
  stall. Scripts must live **inside `apps/game/`** to resolve
  `@playwright/test` — one in a scratch directory fails with
  ERR_MODULE_NOT_FOUND. `playwright install webkit` stalls too — do not wait on it, use
  the simulator's Safari instead.
- WebGL does not initialise in the Claude browser pane. Use Playwright or
  the simulator, not `preview_*`.
- `@arc/game-logic` has `main: src/index.ts` and `noEmit`, so there is no
  `dist/`. To run a node script against it, use `apps/game/node_modules/.bin/tsx`.
- `playwright` is not installed as a bare package — import from
  `@playwright/test`.
- **The chrome and the views used to centre on different origins.** The
  HUD centred 600px on the whole screen; the views centre their titles on
  `getPlayArea`. On an iPad that put the shelter pill on top of "Cat
  Room" on every screen in the game. Both now use the play area — add
  anything to the top strip and centre it the same way, or the collision
  comes straight back.
- **`renderView()` draws the rail and the HUD.** Do not call
  `renderHUD()` beside it. Four call sites used to, 37 did not, and every
  count in the top strip went stale on feed, heal, adopt and welcome.
- The ux-review harness has a history of false findings. Verify against source first.
- `GameScene` shows an arrival card or the corridor depending on state, so
  its measurements move between runs.
- `createPillTitle` draws into a Graphics object, which contributes nothing
  to `getBounds()`. Use `title.height`.
- A scripted whole-file rewrite ate eleven files on 27 Aug by dropping the
  buffer tail. Assert on length after any such edit.
- Root `pnpm build` excludes `@arc/admin` on purpose; its build refuses
  without `ARC_ADMIN_LOCAL_BUILD=1`.
