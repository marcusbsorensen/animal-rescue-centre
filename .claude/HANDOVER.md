# A.R.C. UI direction — handover 2026-09-02

## Goal
Ship A.R.C. as an iPad/iPhone app for 7–10 year olds. Current arc: make it
look like one finished product rather than three stitched together.

## State
**On `main`** (`5cd5c67`): the audit, the chrome surface, GardenView, and the
side-nav layout behind `?sideRail=1` defaulting off.

**On `chrome-views`** (`dce99fc`), pushed, unmerged, six commits ahead. 336
tests, typecheck clean, 38 lint warnings (unchanged baseline, 0 errors).
- Every titled screen is on the chrome surface. `createPillTitle` has no callers.
- All six webfonts self-hosted; zero requests to googleapis/gstatic.
- Chalkboard SE dropped, so Mac and iPad render the sign screens alike.

**Verified.** Chrome captures at 874x402 for all sixteen screens, plus corridor,
Dog Room, kitchen and garden on an iPhone 17 Pro simulator. `ui-rounded` and
Kalam both confirmed resolving by canvas probe, not by eye.

**On `side-nav-prototype` only, deliberately.** The sign fold, `d22ef1a`, kept
off `main`: live CSS on twelve DOM screens with ten never looked at, and `main`
deploys.

## Files
- `docs/ui-next-steps-2026-09-02.md` — the ranked queue and three open
  decisions. **Read this first**; it carries the detail this note omits.
- `docs/ui-audit-2026-08-31.md` — the original seven findings. §2 in it is
  wrong; the queue says how.
- `.claude/TRAPS.md` — read before touching the harness or the simulator.
- `apps/game/src/ui/constants.ts` — `CHROME` (fill/stroke/four inks),
  `FONTS.ui`, `TITLE_CY`, `EDGE_CONTROL_INSET`.
- `apps/game/src/ui/UIButton.ts:354` `createChromePlate`, `:402`
  `createChromeTitle`, `:504` `createChromeCircleButton`.
- `scripts/fetch-fonts.py` — regenerates `apps/game/public/fonts/`.

## Decisions made
- **Painted = diegetic only.** Sign boards are objects in the world and keep
  their painted look. Everything floating above it is chrome and shares
  `CHROME`: cream paper, hairline border, soft shadow.
- **Chrome type is a system face.** `ui-rounded` first, no webfont in the stack,
  so it cannot fall through mid-load.
- **Tone is decoration, never signal.** Success and danger inks sit 1.12:1
  apart — forced, since both must clear AA on a light plate. The words carry
  the meaning; colour only reinforces.
- **Captures must match the device.** Dropping Chalkboard SE cost a nicer face
  on the Mac and bought screenshots that tell the truth.

## Next step
Queue item 3: retire `createButton`'s bevel. 57 call sites across 24 files, the
largest remaining piece of §1. Add `createChromeButton` beside the other chrome
helpers in `apps/game/src/ui/UIButton.ts`, then sweep. Item 4 — the kitchen's
Garden button rendering its icon as two dots — is that same function's icon
scaling and belongs in the same pass.

## Traps
- **Read `.claude/TRAPS.md` before the harness.** It records that Playwright's
  bundled browsers stall (`ARC_BROWSER_CHANNEL=chrome` is the way round) and
  that WebGL is dead in the Claude browser pane. Both were rediscovered the
  slow way anyway.
- **Do not judge a typeface from a Mac screenshot** without measuring. That is
  how the audit's §2 came to describe a font that never reached the device.
  Canvas-measure against a nonexistent-family baseline instead.
- **To reach the game on the simulator, seed the session**, do not log in:
  `mintRealSession()` from `e2e/helpers.ts` into a temporary
  `public/__devsession.js`. Delete it after — it holds a live token.
- Simulator screenshots return in the portrait framebuffer with landscape
  content rotated. `PIL Image.transpose(ROTATE_90)` to read them; taps use the
  unrotated 402x874 space.
- Bash `cd` does not persist between calls; use absolute paths.
