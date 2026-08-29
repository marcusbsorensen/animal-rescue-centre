# A.R.C. UI — handover 2026-08-29 (evening)

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback. Current arc: make the
interface fit 7–10 year olds, animals first, working through
`docs/ux-review-2026-08-29.md`.

## State
Clean tree, 7 commits ahead of the morning's handover. Typecheck clean, lint
0 errors / 38 warnings, 1013 tests.

**The game has now run on a phone for the first time** — iPhone 13 mini
simulator, landscape, as a Home Screen web clip (standalone, no browser
chrome). Walked end to end: welcome → create account → name → animal → PIN →
confirm → hint → safety check → menu → intro map → into the game and the
first arrival card. Everything above works on the phone.

**Fixed this session, all verified on the device and at five viewport sizes:**
- The seven auth/menu screens had every primary control below the fold on a
  landscape phone. `PLAY!` was 27px under, `CONTINUE!` 77px, `START PLAYING!`
  332px. Reachable by scrolling — the `body.embed` rule already handles that
  — but nothing told a child to scroll. Fixed by
  `public/admin/_short-landscape.css`, a height branch beside the existing
  width ones.
- The grass clump (z:4) painted over the CTA stack (z:2), covering
  "New? Create account" completely. Stack now z:9, sign z:7.
- The PIN keypad offered **1–6 only** on a phone. 7, 8, 9, 0, delete and
  confirm were off-screen, so an account could not be created at all.
  Keypad now sits beside the prompt.
- The animal picker showed four of eight animals, then two.
- `welcome-new` clipped `START PLAYING!` on **iPad Air 11" and iPad mini**.
- No `apple-touch-icon`, so the Home Screen icon was a grey letter "A".

## Fixed since: the fourteen in-game overlays
`InGameOverlay` mounts arrival, conflict, vet, adoption, adoption-office,
rewilding, adopters, visitor, badge, map, drive-overlay, tunnel and
charm-select from the same `public/admin/` family. All now fit, verified at
five sizes.

The one that mattered: on **arrival** — the first decision the game asks a
child to make, about an animal that has just turned up frightened — only the
first of three choices was on screen. Same on conflict and vet. Those three
now put the scene beside the words.

Two things that fix turned up, both worth remembering:
- **The pages do not share a `container-name`.** It is `welcome`, `adopt`,
  `rewild`, `office`, `scene` or `tunnel` by page, and map, charm-select and
  drive-overlay declare none. `@container welcome (...)` silently missed
  adoption, rewilding and adoption-office — linked to the sheet, getting
  nothing from it. The query is now unnamed.
- **109 controls were under the 48px floor**, because that floor lives in
  each page's own inline `<style>` and these pages never had one.

The two ceremonies keep their length — 700px of portraits, promises and
parting gifts is what the whole game builds towards — and their action is
pinned to the bottom instead, at `z:40` because the plaques are `z:20` with a
transform. That rule is deliberately outside the height branch: "WAVE THEM
OFF!" was clipped on an iPad mini too.

## What the phone walk found in the Phaser side — the next job
Everything below is `GameScene` / `LeftRailView`, untouched by the CSS work,
and seen on the device rather than measured:

- **The bottom nav band sits on the animals.** In the corridor the two cats
  are covered from the chest down by Home/Care/Supplies/Walk/Social. In the
  Cat Room it covers "No animals here yet." This is the review's central
  point — animals as the visual focus — failing on a phone.
- **The rail overlay is clipped at the bottom.** It opens, and reads
  "Biscuit the tortie cat — Found shivering under a car in the rain", but the
  button that takes her in is off the bottom edge. You can meet the animal
  and not rescue her.
- **The HUD contradicts the rail.** HUD says "0 in care" while the rail says
  "2 waiting" — the morning's known "two quantities in one pill" issue,
  confirmed on a phone.

Not reached on the device: feeding, healing, the details popup, the conflict
screen in play. The account `Testy` / PIN 1234 exists on the live Supabase
with two animals waiting, so the next session can log straight in.

## Files
- `.claude/TRAPS.md` — gotchas. **Read first.** Several new ones today,
  including the real viewport size and how to reload a web clip.
- `apps/game/public/admin/_short-landscape.css` — the height branch. One file,
  linked from all 21 screens, **after** their inline `<style>` so it wins on
  document order. The `@container` query is deliberately unnamed.
- `apps/game/tools/measure-screens.mjs` — the audit. Run it before and after
  any change to these screens; `--boxes <page> <w> <h>` shows where the
  height goes.
- `docs/ux-review-2026-08-29.md` — the review. "Making the animals the visual
  focus" and "Per-pet information panel" still unstarted.
- `apps/game/src/ui/sprites.ts:120` — the `* 2` that Phase 2 removes.

## Decisions made
- **Height branch, not a rewrite.** The screens' responsive system was sound;
  it just had no height axis. `@container (max-height: 520px)`, unnamed so it
  matches whatever each page calls its container.
- **One stylesheet, not 21 inline copies.** The screens are clones and the
  copies would drift within a month.
- **Compress, and rearrange where compressing was not enough.** welcome's two
  account pills share a row; welcome-new puts its photo beside the steps;
  menu puts the badge beside the stats; the PIN keypad sits beside its
  prompt. All use width that was going spare on a landscape phone.
- **Key size beats key layout.** The keypad kept its familiar 3×4 phone shape
  and full-size keys rather than shrinking to fit vertically.
- **812x325 CSS px is the phone budget**, measured with an on-page probe in
  the web clip — not the 780x360 device points the simulator panel reports.
  Every measurement is against that.
- **A ceremony keeps its length; its action gets pinned.** Compressing the
  adoption and rewilding screens would have gutted them.

## Next step
The Phaser side on a phone, in the order the walk hit them:
1. Get the nav band off the animals — `GameScene` / `CorridorView` /
   `RoomView`, and `getPlayArea` in `apps/game/src/ui/layout.ts`.
2. Make the rail overlay's arrival card reachable — `LeftRailView.ts`.
3. Drop the HUD's "N in care" label; the rail already says it.

Then Phase 2: remove the `* 2` from `apps/game/src/ui/sprites.ts:120` and
re-scale the ~12 call sites (`ConflictView` already halves its boxes and says
so in a comment).

Still open, not chased: the web clip gives the app **812x325 CSS px** of a
812x375 landscape screen. A `position:fixed; bottom:0` marker lands at the
top of the unpainted strip, so the missing 50px is OS-reserved and not
recoverable by layout. Whether the shipped Capacitor build has the same
limit is **unverified** — it configures its own WKWebView, so it may get the
full 375. Worth one native build to find out before designing around 325
permanently.

## Traps worth repeating here
- Reload a web clip with `xcrun simctl terminate <udid> com.apple.webapp`.
  HOME + tapping the icon resumes it stale, and you will test the old build.
- Measure the phone at **812x325 CSS px**, not 780x360.
- Rotating the simulator needs Marcus — `osascript` is refused.
- `renderView()` draws the rail **and** the HUD. Do not call `renderHUD()`
  beside it.
