# A.R.C. multi-platform — handover 2026-08-29

> Save sync is finished and real, and `feat/ptv-driving-engine` is merged to
> main — which is what closes the anon-key hole in production. **The app now
> runs on the iPad simulator and signs up against production for real**, so the
> app-bound-domains question is settled. What is left is a physical device,
> which needs Marcus at the keyboard.

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
- *Ran on the iPad simulator (iPad Air 11-inch M4, iOS 26.5, Xcode 26.6).* Clean
  boot — no 404s, no `NSURLError`, none of the loader failures the `build-ios.mjs`
  header warns about. Landscape lock confirmed in `Info.plist` for both idioms.
  The app fills the screen; black bars in `simctl` screenshots are framebuffer
  padding, not a layout gap.
- **`limitsNavigationsToAppBoundDomains: true` does NOT block the edge
  functions.** Measured from the WebKit networking log during a real signup:
  `OPTIONS` → 200 preflight, `POST` → 200 (signup, 1031 ms), second `POST` → 200
  (initial save). The user row, a session expiring exactly 90 days out, and a
  `game_states` row at version 0 were all created; the app reached the menu with
  the friend code matching the row. Test player then deleted, cascade verified.
- *Both ceremonies verified on device.* Adoption rendered "A forever home for
  Rosie", Priya "Pri" Kaur, the real dalmatian sprite, Priya's cast portrait and
  "Dear Ceremonytest". Rewilding rendered "Farewell, Rosie" at "Bond: 60%". The
  pre-fix build was A/B'd in the same run and produced "Farewell, Luna / Dear
  Lily / Bond: Champion", so the fix is confirmed rather than assumed.

**Placeholder-data audit (2026-08-28), all fixed in `c483ecb`.** The login.html
chips bug was not a one-off. Five more shipping overlays were showing a real
child hand-written design data. Two failure shapes, and the second is the one to
watch for:
1. *A guard that treats "empty" as "no answer"* — login.html. Findable by
   grepping for guards.
2. *A payload the host sends correctly to a page with no listener at all* —
   `adoption.html`, `rewilding.html`. **Grepping for guards will never find
   these.** The tell is a `mountInGame`/`postToFrame` payload whose keys appear
   nowhere in the target HTML. `grep -c "addEventListener('message'"` across
   `public/admin/*.html` is the cheap check; both scored 0.

The worst of it: every adoption ceremony in the game read "A forever home for
Luna … Dear Lily, thank you for loving Luna", whichever animal a child had
actually rehomed to whichever family. `forgot-pin.html` ran its whole recovery
quiz on a demo snapshot nothing ever replaced, so a locked-out child was asked to
identify a cat called Marmalade and could not pass by construction.
`paths.html`'s "Not for collies" lock is **load-bearing** — the click handler
returns early on `.path-state-locked` — so the rewild path was dead for foxes and
hedgehogs too. It is still locked, because no rewildable-species rule exists in
game-logic to unlock it against; that rule is unwritten game design, not a bug.

**Still not done:**
- **Real eligibility logic for `paths.html`.** Its criteria lists are hidden, not
  deleted — they are the design target. "Bond 3+" / "Bond 5 (3/5)" imply a 1-5
  scale; bond is 0-100 (`game-logic/bond.ts`). Nothing computes walk counts or
  traits. And the rewild card needs a real species rule before it can unlock.
- **`friends.html` never renders friends.** `AuthOverlay` sends `joinCode` and
  `recruited` but never `friends`, so the list always takes its fallback branch.
  Harmless only because that fallback array is empty — putting one demo row back
  in it recreates the login.html bug exactly.
- Nothing has run on a *physical* device. The simulator needs no signing, so it
  proved the bundle and the network path but not provisioning. `pnpm ios` builds
  and opens Xcode; signing and a device are Marcus's to do.
- **A 400 from `signup` is completely silent.** A name containing digits is
  correctly rejected by `signup/index.ts:21` (letters only), and the child sees
  nothing at all — no toast, no shake, no text. Three frames captured after the
  tap were byte-identical. They would tap "I'm sure it's safe" forever. Found
  while testing; deliberately not fixed, since it is its own piece of work.
- **The 401 path (`f8ae9b2`) is still unverified on device.** Deleting the user
  mid-session did not trigger it — entering the game makes no server call, so the
  stale token is never presented. Needs a save to be provoked.
- **Safe-area insets untested.** The iPad has no notch, so this run never touched
  `SAFE_MARGIN` / `env(safe-area-inset-*)`. That needs an iPhone simulator.
- Depot/SupplyRun overflow in landscape — cards run under the back button. A design
  call: scrolling list or two-column grid.
- Three UX findings left open on purpose (28px phase pill, T4, L6 counts).

**Already red, and was before any of this:** `e2e/visual.spec.ts` — `main-menu.png`
baseline is 438 commits stale (2026-04-18). Regenerate with
`pnpm --filter @arc/game test:visual:update` once the landscape layout settles.

**Merged to main.** `be5699f` brings ninety commits over from
`feat/ptv-driving-engine`: the driving engine, the 22 August security audit, save
sync phases 1 and 2, the iOS shell, the landscape UX pass, and the art and audio
size work. Trees are identical, working tree clean, all four CI steps green on main.
The branch is left in place and is now two commits behind.

*A 401 used to be indistinguishable from a flaky connection* (`f8ae9b2`). Every
token minted before the audit has no `sessions` row, so those clients are refused
from the moment this ships — and the old code told them their wifi was down, then
failed every save behind a retry toast that could not work. A 401 now clears the
session and sends the child to sign-in.

*The whole returning-player entrance was broken, and had been from the start.*
Two defects, both found by running the simulator, both fixed here. First, the
"I already have an account" plank on signup stage A had **never** had a working
handler: the selector was scoped `#stage-select …`, but the button lives in
`.cta-stack`, a *sibling* of `#stage-select`, so it matched nothing and the `?.`
swallowed it. `e73ecab` had already fixed a different wrong selector on the same
button. It is now bound by `id`, which cannot be broken by moving it in the DOM.
Second, `login.html` guarded chip repopulation on `usernames.length`, so an empty
list — the honest answer on a fresh install — skipped the block entirely and left
the four hardcoded design chips (**Lily, Sam, Rosie, Mia**, "2 hours ago") in the
page. A child's first launch showed four accounts that do not exist, and tapping
one ran a real login that could only fail. That guard also meant
`adaptTypeNameButton()` always counted 4 placeholders, so the first-run "TYPE YOUR
NAME" CTA was permanently demoted to "Not here? Type your name" and the branch the
code describes was unreachable. Both verified on device: the plank now navigates,
and the screen it reaches has no fake chips and the big CTA back.

## Files
- `packages/game-logic/src/merge-save.ts` — `mergeSaveState`; per-field rules in the header.
- `apps/game/src/game-state/localSave.ts` — three IndexedDB records: live, `::rejected`, `::base`.
- `apps/game/src/game-state/loadSaveState.ts` — `handleConflict` and `reconcileWithLocal`, the two places a divergence surfaces.
- `supabase/functions/save-game/index.ts:80` — the three `expectedVersion` cases; `conflict()` at the bottom.
- `supabase/functions/_shared/session.ts` — `requireSession` / `createSession`; token rides in `x-arc-session`.
- `apps/game/src/ui/constants.ts` — `MIN_TAP`, `MIN_TAP_GAP`, `bottomAnchorY`; `SAFE_MARGIN` still needs `env(safe-area-inset-*)`.
- `apps/game/src/game-state/loadSaveState.ts` — `isUnauthorised` / `requireSignIn`, the 401 path.
- `apps/game/public/admin/signup.html` — `#have-account-btn` (~1777) and its handler (~1982); `hint-safe-btn` at 2348 is what actually fires `signup-complete`.
- `apps/game/public/admin/login.html` — the `init` handler (~1634) and `adaptTypeNameButton()` (~1483). The four placeholder chips at ~1370 are still there on purpose, for opening the page directly for design review.
- `supabase/functions/signup/index.ts:21` — the letters-only username rule. Server-side 400s are still invisible to the child; the signup NEXT button now checks the same rule client-side.
- `apps/game/public/admin/adoption.html` / `rewilding.html` — `renderCeremony()` / `renderFarewell()`, driven by `init`. Both had no listener at all before `c483ecb`.
- `apps/game/src/scenes/GameScene.ts` — `openAdoptionOverlay` / `openRewildingOverlay` resolve the household and sprite and pass display data, not just ids.
- `apps/game/public/admin/forgot-pin.html` — the demo `snapshot` (~927) and the embed guard at the bottom that skips the quiz.

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
**Resolve the three issues found while verifying the ceremonies** (branch
`fix/ceremony-portrait-and-taps` is already cut from `da365cd`, empty):

1. **Rewilding's animal portrait frame collapses to a stub.** Pre-existing —
   A/B'd against `c483ecb~1` and it collapses there too. `.portrait-frame`
   (`rewilding.html:246`) is `width:100%; max-width: clamp(200px, 48cqw, 320px);
   aspect-ratio: 4/3`. Adoption's near-identical frame renders fine, so compare
   the two containers. Not urgent on its own — nothing can reach this page.
2. **`dog-dalmatian-sheltered.png` is 128×128**; its siblings
   (`dog-collie-sheltered`, `fox-red-walking`) are 512×512. Probably lost in the
   art-size work. Check `asset-drafts/` or `manus-output/` for a full-res source
   before assuming it must be regenerated. It renders large in the adoption
   ceremony, so it will look soft.
3. **The Welcome button and the room doors ignore taps.** The nav bar and animal
   sprites at the same measured coordinates work fine, so it is not the
   coordinate mapping. Likely the same landscape hit-area family as the
   Depot/SupplyRun overflow.

Then, in rough order: physical device run (Marcus's hands, provisioning only);
surface the *server*-side signup 400s (still silent — `login.html` has
`shakeError`, signup needs the same `auth-error` wiring); iPhone simulator pass
for safe-area insets; the Depot/SupplyRun landscape design call; regenerate the
visual baseline once landscape settles.

## Traps
- **`window.__PHASER_GAME__` is exposed and NOT dev-gated** (`src/main.ts:100`),
  and the store is on the registry as `'gameStore'`. From Safari Web Inspector,
  `gs.openAdoptionOverlay(a, '01-pri-kaur')` / `gs.openRewildingOverlay(a)` open
  either ceremony instantly — `private` is TypeScript-only. **There is no other
  dev shortcut**: no `?debug`/`?cheat`/`?seed`, no dev menu, no keyboard hooks
  (only `?dialogueDemo` and `?ptvDemo` exist). `cockpit.html` is a driving
  mockup, not a console. Finding this out cost most of a session.
- **Rewilding has no gameplay route at all.** `openRewildingOverlay` fires only
  from `'aspire-rewild'`, and `paths.html`'s rewild card is hard-locked — the
  click handler returns early on `.path-state-locked`. To see that page you must
  drive it from the console or a temporary build.
- **Adoption needs bond ≥ 50 and state ≠ 'pet'** (`AnimalDetailsPopup.ts:78`), and
  bond hitting 100 flips the animal to `'pet'` and *removes* the Paths button —
  so the usable window is bond 50–99. Feed is +3 and closes the popup, i.e. two
  taps per 3 points: roughly 32 taps from a fresh animal. Instrument the build
  instead.
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
  **`id` is not a universal column here** — `sessions` keys on `token`, and
  `friendships` and `showcase_links` have no `id` either. `user_id` is the safe
  probe for all three. This trap fired three times in one session.
- **The simulator's landscape content is letterboxed into a portrait framebuffer.**
  `simctl io … screenshot` returns 1640×2360 for an iPad Air in landscape, with the
  real screen as a band inside it. Tap coordinates still map as
  `y_pt = y_px / 2360 * 1180` over the *whole* buffer, bars included. Do not eyeball
  button positions off a rendered screenshot — measure the pixels and convert, or you
  will land in the gap between two planks and read a working button as a dead one.
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
