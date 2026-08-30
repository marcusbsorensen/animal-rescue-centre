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
  `public/admin/_short-landscape.css` is the height branch, linked from all
  21, **after** each page's inline `<style>` so it wins on document order.
  Do not move that `<link>` above the `<style>`. **Its `@container` query is
  deliberately unnamed** — the pages do not share a `container-name` (it is
  `welcome`, `adopt`, `rewild`, `office`, `scene` or `tunnel` by page, and
  map/charm-select/drive-overlay declare none), so naming it `welcome`
  silently excluded adoption, rewilding and adoption-office.
- **The Capacitor app gets 812x375; the Home Screen web clip gets 812x325.**
  Measured 2026-08-29 with an on-page probe inside the shipped app on
  ARC-13mini: `inner 812x375`, `visual 812x375`, `client 812x375`,
  `safe-area-inset-bottom 0px`, `standalone false`, dpr 3, and a
  `fixed; bottom:0` marker flush on the screen edge. So the 50px the clip
  loses is a PWA-only reservation, and `contentInset: 'never'` in
  `capacitor.config.ts` is what buys it back. **Say which one you are
  measuring.** Both fall under the 480 short-viewport branch in
  `ui/layout.ts`, so both compress the chrome; the app just has 50px more
  band (187 against 137).
  To re-measure: append a fixed-position div to `apps/game/index.html`
  that prints the numbers, `pnpm build:ios`, rebuild the Xcode project,
  launch, screenshot, then revert the file. You cannot run JS in the app
  without Safari Web Inspector, which needs Marcus.
- **The web clip's CSS viewport is 812x325, not the 780x360 the simulator
  panel reports.** Measured with an on-page probe (a fixed div printing
  `innerHeight` etc., screenshotted — you cannot run JS in a clip):
  `inner 812x325`, `screen 375x812`, safe insets `t0 b20 l50 r50`,
  `standalone true`, dpr 3. So CSS px and device points differ here, and a
  50px strip of the landscape screen sits below the viewport. iOS paints the
  body background into it, which is why it looks like the page's own
  unused space — but a `position:fixed; bottom:0` marker lands at the *top*
  of that strip, so it is OS-reserved and **not recoverable by layout**.
  **Measure the phone at 812x325.** Whether the shipped Capacitor build has
  the same limit is unverified — it configures its own WKWebView.
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
- **The Phaser views have a play *band*, not just a play column.**
  `playAreaFor` in `src/ui/layout.ts` returns x/y/w/h; the y/h half is
  new as of 2026-08-29. Laying content out against `scene.scale.height`
  puts it under the HUD (drawn into uiContainer) or the nav bar (drawn
  into navContainer) — both added after gameContainer, so they cover it
  *and* take the tap. Below 480px of viewport height the nav bar
  compresses from 96 to 78; `navBarMetrics(height)` is the single source
  for the bar's geometry and the band is computed from it. Do not
  hard-code a bar height in NavBarView again — they used to be
  independent and that is the pair that drifts.
- **`createButton` grows past the `width` you ask for.** It sizes to
  `max(text.width + icon + 56, options.width)` — 28px of padding each
  side — so a label wider than `width - 56` silently widens the button.
  That is invisible in a centred row and an overlap in a fixed-cell
  grid: the animal card's More face gives each action a 168px cell, and
  `Vet (Sniffly Nose)` with an icon wanted 196. Keep grid labels short,
  put variable-length data in the caption instead of the label, and read
  the drawn width off the display list rather than trusting the number
  you passed.
- **The animal card is not in `gameContainer`.** It has its own
  container at depth 800, created by `GameScene.animalCard()` and taken
  down by `closePopup` *and* `clearView`. Removing the `clearView` call
  would leave a card floating over a view it no longer describes.
- **`createAnimalSprite` draws inside the box it is handed** — as of
  `9d40b94`. It used to render at 2x it (`SPRITE_RENDER_SCALE`, now
  deleted), which is where the "ask for half of what you want" numbers in
  older commits and comments come from. **Still read
  `sprite.displayWidth/displayHeight` for anything positioned off an
  animal**: the art is square and most boxes are 5:4, so the animal is
  drawn narrower than the box, and an anchor's own `scale` multiplies the
  result. Size animals with `animalBoxFor(play, base)`, where `base` is
  now the drawn size.
  Two call sites are deliberately still on the old half-size basis
  because a table of hand-tuned fractions is keyed to it — WalkScene's
  `collarBasis` (the collar overlay's anchor fractions) and
  ToyPickerView's `rowBasis` (the toy row's y). Both say so in place.
- **`resolveAnchor` puts the *drawn* box's feet on the anchor mark**, so
  animals in the corridor and garden sit 9–40px higher than they did
  before `9d40b94`. That is the fix, not a regression: the mark is a feet
  position and the sprite used to hang half a box below it.
- **A third of the hand-authored anchors resolve below the nav bar, on
  every device including an iPad.** They are fractions of background art
  that is drawn behind the bar, so 32 of the 100 put an animal's feet
  under it at 1024x768 and 59 sit below 0.7. `anchorSpaceFor` narrows
  this on a short viewport by resolving anchors into the band instead of
  the art rect, and `clampAnimalIntoBand` closes the rest. The clamp is
  the guarantee, not the anchor file — there is a test asserting the raw
  anchors still run under the bar, which will fail if they are ever
  re-authored.
- **Three 48px tap targets do not fit a landscape phone's play band.**
  48*3 plus two MIN_TAP_GAPs is 168px against 137. The kitchen folds
  sideways instead (message left, controls right); anything else that
  wants three stacked buttons has the same arithmetic to answer.
- **Controls hidden under the chrome are not always a phone problem.**
  Found while measuring: the garden's "New upgrade available" button was
  at `height - 85` against a bar starting at `height - 96`, and its left
  zone-arrow at `x = 30` inside the 56px the collapsed rail reserves.
  Both had been unreachable on every viewport for as long as they had
  existed. Measure the display list rather than trusting that a tall
  screen is fine.
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
- The ux-review harness has a history of false findings. Verify against
  source first. Its pairwise checks (L7/L8/L9, added 2026-08-30) took four
  passes to stop lying: a masked or scrolling ancestor means below-the-fold
  rather than unreachable, a sticky exit over a scrolling list is the phase
  0 fix rather than a collision, and **ancestry does not identify a label**
  — `createButton` adds the hit rectangle and the text to one container as
  siblings, so scoring contained text produced 140 findings of buttons
  wearing their own labels. The predicates are in `src/ui/ux-geometry.ts`
  with unit tests holding the review's own geometry; change a threshold and
  those tests say whether it still catches anything.
- **L6 collapses a scrolling grid of identical tiles into one control**, as
  of 2026-08-31 — `groupRepeatedTiles` in `src/ui/ux-geometry.ts`. The
  condition doing the work is `clipped`, which for a Phaser object is
  `masked || obj.mask != null`. That is a proxy for "this is a browsable
  collection", and it is only as good as the assumption that a mask means
  scrolling. A *decorative* mask over a fixed grid of four or more
  same-sized buttons would collapse them too, and that would be a lie.
  Nothing in the game masks anything decoratively today; if something
  starts to, the collapse needs a better test than "is it masked".
  `interactiveCount` and `distinctControlCount` are both in the report, and
  the finding's detail prints the raw number — compare them before
  believing a low count.
- **`e2e/__ux__/*.png` can show a scene other than the one it is named
  for.** Seen on 2026-08-30: `DepotScene-tablet.png` showed the PtvDrive
  vehicle picker while the same run's measurements were unmistakably
  DepotScene's (4 interactive, 11 texts, against PtvDrive's 2 and 11).
  Cause not established. **Trust `ux-report.json`, not the screenshots** —
  or re-shoot the one screen you care about on its own.
- **To measure the running game, walk the display list, not the pixels.**
  A throwaway Playwright spec that seeds a session, starts GameScene,
  writes animals straight into `gs.store.animals`, and recurses
  `gameContainer`/`navContainer`/`uiContainer` calling `getBounds()`
  gives exact rects for every drawn object in a couple of seconds. Two
  things will be on top of the view and have to go first: the in-game
  overlay is a plain `<iframe>` on `document.body`, and ErrorOverlay's
  "please sign in" scrim is a Phaser container at depth 10000 — hide
  anything with `depth >= 9000` in `scene.children.list`.
- `GameScene` shows an arrival card or the corridor depending on state, so
  its measurements move between runs.
- `createPillTitle` draws into a Graphics object, which contributes nothing
  to `getBounds()`. Use `title.height`.
- A scripted whole-file rewrite ate eleven files on 27 Aug by dropping the
  buffer tail. Assert on length after any such edit.
- Root `pnpm build` excludes `@arc/admin` on purpose; its build refuses
  without `ARC_ADMIN_LOCAL_BUILD=1`.
- **`build-ios.mjs` deliberately does not exclude `public/admin/`**, so
  anything dropped in there ships inside the app. A stray folder of
  unquantised sprite masters took the staged bundle from 108 MB to 749 MB
  without a word of complaint — the staging line prints the size, so read
  it. `1231 files (128.6 MB) -> 1227 files (107.8 MB)` is what healthy
  looks like.
- **The pnpm virtual store can vanish mid-session**, leaving
  `apps/game/node_modules` full of dangling symlinks and vite reported as
  MODULE_NOT_FOUND when it worked ten minutes earlier. `pnpm install
  --frozen-lockfile` from the repo root fixes it in seconds. Note the
  store is at the repo root, not in `apps/game`.
- **Bash `cd` persists between calls here.** Two separate incidents this
  session: a `git stash push -- apps/game/src` that resolved to
  `apps/game/apps/game/src` and silently stashed nothing, and a batch of
  `ls` checks that read the wrong tree and looked like a broken install.
  Use absolute paths in anything whose correctness you will act on.
- **`manus_download_output` pulls a task's INPUT attachments alongside its
  outputs, into the same directory.** Reference images uploaded with the brief
  come back down with the renders, and any that share a filename collide —
  last write wins, which is ordering luck, not a guarantee. The 2026-08-30 nav
  icon commission downloaded three files called `nav-home.png` to one path:
  the uploaded reference, v1 and v2. **Verify by dimension or file size, never
  by filename.** Renders were 1024x1024 / ~1MB; references 256x256 / ~85KB.
- **Unquoted URLs containing a query string are glob-expanded by zsh**, so the
  command dies before the request runs and the failure surfaces downstream as
  a JSON decode error that looks like an API fault. Quote the URL, or put it in
  a variable and quote that.
