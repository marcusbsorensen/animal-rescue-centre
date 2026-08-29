# A.R.C. on a phone — handover 2026-08-29 (evening)

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback, with an interface that
works for 7–10 year olds. Current arc: make it usable on a phone, working
through `docs/ux-review-2026-08-29.md`.

## State
Clean tree, 10 commits ahead of this morning. Typecheck clean, lint 0 errors /
38 warnings, 1013 tests pass.

**Verified** — `tools/measure-screens.mjs` passes clean on all 21 DOM screens
at five viewport sizes, and the flow welcome → signup → name → animal → PIN →
hint → menu → intro → corridor → Cat Room → rail was walked on an ARC-13mini
simulator in the standalone web clip. Before today: `PLAY!` sat 27px below the
fold, the PIN keypad offered only 1–6 so no account could be created on a
phone, and arrival showed one of its three choices.

**Unverified** — whether the shipped Capacitor build gets the full 812×375
(the web clip gives 812×325); `e2e/visual.spec.ts` is still red on a stale
baseline, untouched today.

## Files
- `.claude/TRAPS.md` — read first; several new entries today.
- `apps/game/public/admin/_short-landscape.css` — the height branch. Linked
  from all 21 screens, **after** each page's inline `<style>`.
- `apps/game/tools/measure-screens.mjs` — the audit. `--boxes <page> <w> <h>`
  shows where the height goes.
- `apps/game/src/game-views/LeftRailView.ts` — rail overlay, clipped on phone.
- `apps/game/src/ui/layout.ts` — `getPlayArea`; the nav band overlap starts here.
- `apps/game/src/ui/sprites.ts:120` — the `* 2` that Phase 2 removes.

## Decisions made
- **A height branch, not a rewrite.** The `@container` system was sound; it had
  no height axis. The query is **unnamed** on purpose — pages use `welcome`,
  `adopt`, `rewild`, `office`, `scene`, `tunnel`, or none, so
  `@container welcome` silently missed three of them.
- **One stylesheet, not 21 inline copies** — they are clones and would drift.
- **Ceremonies keep their length; their action gets pinned.** 700px of
  portraits and promises is what the game builds towards; compressing it would
  gut the moment. Sticky at `z:40`, because the plaques are `z:20`.
- **Key size beats vertical fit.** The PIN keypad kept its 3×4 shape and
  full-size keys, and moved beside the prompt instead.
- **812×325 CSS px is the phone budget**, measured by an on-page probe. The
  missing 50px is OS-reserved — a `fixed; bottom:0` marker lands at its top.

## Next step
Get the bottom nav band off the animals. In the corridor it covers both cats
from the chest down; in the Cat Room it covers "No animals here yet." Start at
`getPlayArea` in `apps/game/src/ui/layout.ts` and the nav band's own height.
Log in as `Testy` / PIN `1234` — the account is live with two animals waiting.

## Traps
- **Reload a web clip with `xcrun simctl terminate <udid> com.apple.webapp`.**
  HOME + tapping the icon *resumes* it stale — you will test the old build and
  conclude your fix did nothing. This cost the most time today.
- **Measure at 812×325 CSS px**, not the 780×360 device points the simulator
  panel reports.
- Rotating the simulator needs Marcus — `osascript` is refused assistive access.
- `renderView()` draws the rail **and** the HUD. Do not call `renderHUD()`
  beside it.
