# A.R.C. multi-platform — handover 2026-08-29 (late)

> The three issues left behind by the ceremony session are resolved, on
> branch `fix/ceremony-portrait-and-taps` (5 commits, **not yet merged to
> main**). The "dead Welcome button" was not a dead button and not a
> hit-area problem — it was a handler writing into an orphaned copy of the
> animal, and the same bug class can bite any future callback that
> captures an `Animal`. See **Traps**.

## Goal
Ship A.R.C. as an iPad/iPhone app plus a web fallback: one account, progress synced
across all three.

## What this session did
Branch `fix/ceremony-portrait-and-taps`, cut from `da365cd`:

- `f2ec406` **Rewilding's portrait no longer collapses.** `.portrait-wrap`
  had no declared width inside a column flex container with
  `align-items: center`, so the frame's `width: 100%` resolved against an
  indefinite width. Chrome guessed generously (322x242); iOS WebKit
  resolved it to ~0 and `aspect-ratio: 4/3` erased the frame entirely.
  adoption.html never had the bug only because `.portrait-row` declares
  its width. Reproduced *and* verified in Mobile Safari on the iPad
  simulator; adoption.html re-checked on the same engine, unchanged.
- `84f1425` **The hedgehog set is 512px instead of 128px.** Not the
  one-file problem the last note assumed — see **Art resolution** below.
- `4bbce6a` **`tools/optimise-sprites.ts` no longer degrades art.** Its
  header claimed re-running was a no-op. It is not: sharp re-derives the
  palette from the previous palette, so `cat-ginger-sheltered.png` goes
  56 → 48 → 41 → 37 KB over three runs. The old "never make a file
  bigger" guard cannot catch this because each degraded pass genuinely is
  smaller. One run while shipping the hedgehogs silently rewrote all 514
  other animal PNGs and reported the loss as a 4 MB saving.
- `192ca6a` **The Welcome buttons actually welcome the animal.** Root
  cause in **Traps**.
- `752dcf3` `tools/sim-band.mjs` — crops the simulator letterbox so a
  coordinate read off a screenshot converts into a correct tap.

Gates after all five: typecheck, lint (0 errors), **983 tests**, production
build. Working tree clean.

## State
Everything in the previous handover's State section still holds (migrations
00001–00006 applied, all nine Edge Functions deployed, save sync phases 1
and 2 exercised, social functions smoke-tested, both ceremonies verified on
device). Two claims in it were **wrong** and are corrected here:

- **"The app fills the screen; black bars in `simctl` screenshots are
  framebuffer padding, not a layout gap."** They are a real gap. Measured
  from inside the web view: `screen.width/height` reports **820x1180** —
  the simulator device is in **portrait**, and the landscape-locked app is
  letterboxed into an 820x570-point band with 305-point bars. The page
  renders at 1180x820 CSS px scaled by 0.695. Rotating the simulator to
  landscape (Cmd+Left) removes this; there is no `simctl` equivalent, so
  it needs a human. It is worth doing before trusting any layout
  measurement taken on that simulator.
- **"The Welcome button and the room doors ignore taps."** The **door
  signs respond fine** — verified by tapping the DOG sign and entering the
  Dog Room. Only the Welcome button was affected, and not for any
  hit-area reason.

## Still not done
- **Real eligibility logic for `paths.html`.** Unchanged. Criteria lists are
  hidden, not deleted — they are the design target. "Bond 3+" / "Bond 5
  (3/5)" imply a 1-5 scale; bond is 0-100 (`game-logic/bond.ts`). Nothing
  computes walk counts or traits, and the rewild card needs a real species
  rule before it can unlock.
- **`friends.html` never renders friends.** Unchanged. `AuthOverlay` sends
  `joinCode` and `recruited` but never `friends`, so the list always takes
  its fallback branch. Harmless only because that fallback array is empty.
- **21 sprite poses are still 128px and need a new commission** — see
  **Art resolution**.
- Nothing has run on a *physical* device. `pnpm ios` builds and opens
  Xcode; signing and a device are Marcus's to do.
- **A 400 from `signup` is completely silent.** Unchanged. A name
  containing digits is rejected by `signup/index.ts:21` and the child sees
  nothing — no toast, no shake, no text.
- **The 401 path (`f8ae9b2`) is now partly exercised.** A fake session in
  Safari reached GameScene fine (entering the game makes no server call),
  and the first *save* 401'd and cleared the session back to the menu —
  which is the intended behaviour, observed for the first time. Not a
  substitute for a real stale-token test on device.
- **Safe-area insets untested.** The iPad has no notch. Needs an iPhone
  simulator.
- Depot/SupplyRun overflow in landscape — cards run under the back button.
  A design call: scrolling list or two-column grid.
- Three UX findings left open on purpose (28px phase pill, T4, L6 counts).

**Already red, and was before any of this:** `e2e/visual.spec.ts` —
`main-menu.png` baseline is 438 commits stale (2026-04-18). Regenerate with
`pnpm --filter @arc/game test:visual:update` once the landscape layout settles.

## Art resolution
The last note guessed `dog-dalmatian-sheltered.png` was one file lost in the
art-size work. The real picture, from measuring every sprite:

- 450 sprites are 512px; **71 are not**.
- Most of the small ones are **unreachable**: the bare `cat-*`, `dog-*`,
  `fox-*`, `bat-*`, `bunny-*`, `snake-*`, `parrot-*` sets are fallbacks
  that `getAnimalTextureKey` only reaches if a variant has *no* art at
  all, and every species always gets a variant from `pickRandomVariant`.
- **Reachable and now fixed:** the whole `hedgehog` set (9 poses).
  `SPECIES_VARIANTS` declares six hedgehog variants but **no hedgehog
  variant art has ever existed**, so every hedgehog in the game fell
  through to the 128px base sprites. The 1024px originals were sitting
  unshipped in `asset-drafts/hedgehog/` and `asset-drafts/hedgehog-test/`
  the whole time. Alpha bounding boxes matched the shipped 128px files to
  within 0.4% on all nine poses, so nothing moved.
- **Reachable and still outstanding, needs a Manus commission:**
  `dog-dalmatian` (8 poses), `dog-beagle` (5), `bunny-spotted` (6),
  `bunny-dutch` (2) — 21 in total. There is **no unshipped source** for
  these: `asset-drafts/admin-review/regen-v3-sprites/` covers exactly the
  poses that are already 512, so regen-v3 is fully shipped. Follow
  `docs/manus-sprite-rules.md`; the 2752px `*-reference.png` files in
  `manus-variants/` are the identity anchors.

## Files
- `apps/game/src/scenes/GameScene.ts` — `welcomeArrivals()` (the fix, with
  the full explanation in its docstring); `tickAllNeeds` at ~475 is what
  breaks object identity.
- `packages/game-logic/src/needs.ts:18` — `tickNeeds` returns `{...animal}`.
- `apps/game/public/admin/rewilding.html` — `.portrait-wrap` (~242) now
  declares `width: 100%`; the comment there says why.
- `tools/optimise-sprites.ts` — the `isPalette` skip is load-bearing.
- `tools/sim-band.mjs` — simulator screenshot → app band + tap conversion.
- `packages/game-logic/src/merge-save.ts` — `mergeSaveState`; per-field rules in the header.
- `apps/game/src/game-state/localSave.ts` — three IndexedDB records: live, `::rejected`, `::base`.
- `apps/game/src/game-state/loadSaveState.ts` — `handleConflict` / `reconcileWithLocal`; `isUnauthorised` / `requireSignIn` is the 401 path.
- `supabase/functions/save-game/index.ts:80` — the three `expectedVersion` cases; `conflict()` at the bottom.
- `supabase/functions/_shared/session.ts` — `requireSession` / `createSession`; token rides in `x-arc-session`.
- `apps/game/src/ui/constants.ts` — `MIN_TAP`, `MIN_TAP_GAP`, `bottomAnchorY`; `SAFE_MARGIN` still needs `env(safe-area-inset-*)`.
- `apps/game/public/admin/signup.html` — `#have-account-btn` (~1777) and its handler (~1982).
- `apps/game/public/admin/login.html` — `init` (~1634), `adaptTypeNameButton()` (~1483). The four placeholder chips at ~1370 are deliberate, for opening the page directly for design review.
- `supabase/functions/signup/index.ts:21` — the letters-only username rule.
- `apps/game/public/admin/forgot-pin.html` — the demo `snapshot` (~927) and the embed guard at the bottom.

## Decisions made
Unchanged from the previous note: Capacitor for iOS, landscape-locked, Kids
Category (never a third-party analytics or ads SDK, fonts self-hosted);
`version`/`updated_at` server-owned by DB trigger; unversioned saves keep
last-write-wins; three-way merge not newest-wins; economy reconciles
additively; the child is told nothing about a merge; an animal keeps the
furthest-along `state` and higher `bondLevel`; `MIN_TAP` applies to the hit
area, not the drawn art.

New this session:
- **Resolve an `Animal` against the store by id at callback time.** Do not
  act on one captured in a closure. See Traps.
- `optimise-sprites.ts` skips anything already palette-indexed and within
  `--max`, so a stray re-run is a genuine no-op.

## Next step
1. **Merge `fix/ceremony-portrait-and-taps` to main** (Marcus's call — the
   previous session merged `feat/ptv-driving-engine` with `be5699f`).
2. **Audit for the same stale-capture bug elsewhere.** `welcomeArrivals`
   fixed the two sites that mutate a captured animal, but any callback that
   *reads* a captured `Animal` is showing data up to 2 seconds stale, and
   any future one that writes will fail the same silent way. The candidates
   are the `onShowAnimalDetails` / popup callbacks and anything in
   `AnimalDetailsPopup`, `GardenView`, `RoomView` that takes an `Animal`
   parameter rather than an id.
3. Commission the 21 remaining sprite poses (dalmatian, beagle,
   bunny-spotted, bunny-dutch).
4. Physical device run (provisioning only, Marcus's hands).
5. Surface *server*-side signup 400s — `login.html` has `shakeError`,
   signup needs the same `auth-error` wiring.
6. iPhone simulator pass for safe-area insets.
7. The Depot/SupplyRun landscape design call.
8. Regenerate the visual baseline once landscape settles.

## Traps
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
