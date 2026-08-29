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

## Not fixed — the decision waiting for Marcus
`InGameOverlay` mounts **fourteen more DOM screens** from `public/admin/` —
arrival, conflict, vet, adoption, adoption-office, rewilding, adopters,
visitor, badge, map, drive-overlay, tunnel, charm-select (plus paths, which
is fixed). Same family, same clone structure, same width-only container
queries, and `_short-landscape.css` is **not linked from any of them**.

At the 312pt a phone actually gets: `adoption` is 716, `rewilding` 720,
`arrival` 444, `vet` 397, `conflict` 387. Across the whole 21-screen family
`tools/measure-screens.mjs` reports **99 sub-48px tap targets** and zero
unreachable controls — but the mocks understate the live screens: on the
device the live arrival card has a second choice below the fold that the
static page does not render.

Fixing those fourteen is the obvious next piece of work. It was outside the
scope agreed this session.

## Files
- `.claude/TRAPS.md` — gotchas. **Read first.** Six new ones today, including
  the 312pt viewport and how to reload a web clip.
- `apps/game/public/admin/_short-landscape.css` — the height branch. One file,
  linked from seven pages, after their inline `<style>`.
- `apps/game/tools/measure-screens.mjs` — the audit. Run it before and after
  any change to these screens; `--boxes <page> <w> <h>` shows where the
  height goes.
- `docs/ux-review-2026-08-29.md` — the review. "Making the animals the visual
  focus" and "Per-pet information panel" still unstarted.
- `apps/game/src/ui/sprites.ts:120` — the `* 2` that Phase 2 removes.

## Decisions made
- **Height branch, not a rewrite.** The screens' responsive system was sound;
  it just had no height axis. `@container welcome (max-height: 520px)`.
- **One stylesheet, not seven inline copies.** The screens are clones and
  seven copies would drift within a month.
- **Compress, and rearrange where compressing was not enough.** welcome's two
  account pills share a row; welcome-new puts its photo beside the steps;
  menu puts the badge beside the stats; the PIN keypad sits beside its
  prompt. All use width that was going spare on a landscape phone.
- **Key size beats key layout.** The keypad kept its familiar 3×4 phone shape
  and full-size keys rather than shrinking to fit vertically.
- **312, not 360, is the phone budget.** Every measurement is against that.

## Next step
Ask Marcus whether to extend `_short-landscape.css` to the fourteen in-game
overlays. If yes, that is the job: link the sheet, run
`tools/measure-screens.mjs`, fix per-screen, and walk the game on
`ARC-13mini` again — feeding, healing, the details popup and the conflict
screen were never reached. If no, Phase 2 is next: remove the `* 2` from
`apps/game/src/ui/sprites.ts:120` and re-scale the ~12 call sites.

Still unmeasured on a phone: the Phaser side — the rail tab, the HUD, the
play area, room animals. The morning's handover records the Cat Room cat
landing outside the play area and the HUD printing "N in care" beside an XP
bar measuring `totalRescued`; neither was touched today.

## Traps worth repeating here
- Reload a web clip with `xcrun simctl terminate <udid> com.apple.webapp`.
  HOME + tapping the icon resumes it stale, and you will test the old build.
- Measure the phone at **780x312**, not 780x360.
- Rotating the simulator needs Marcus — `osascript` is refused.
- `renderView()` draws the rail **and** the HUD. Do not call `renderHUD()`
  beside it.
