# A.R.C. UI direction — handover 2026-09-02

## Goal
Ship A.R.C. as an iPad/iPhone app for 7–10 year olds. Current arc: make it
look like one finished product rather than three stitched together.

## State
**On `main`** (`5cd5c67`): the audit, the chrome surface, GardenView, and the
side-nav layout behind `?sideRail=1` defaulting off.

**On `chrome-views`** (`bfdf77c`), pushed, unmerged, nine commits ahead. 340
tests, typecheck clean, 38 lint warnings (unchanged baseline, 0 errors).
- Every titled screen is on the chrome surface. `createPillTitle` is deleted.
- All six webfonts self-hosted; zero requests to googleapis/gstatic.
- Chalkboard SE dropped, so Mac and iPad render the sign screens alike.
- All 56 buttons are on the chrome surface too, bar the four in DepotScene
  and SupplyRunScene held back on the Depot decision. `createButton` stays
  until those move.

**Verified.** Chrome captures at 874x402 for the sixteen titled screens plus
the animal card, its More grid, the Games popup and the Phaser PIN keypad.
Corridor, Dog Room, kitchen and garden also seen on an iPhone 17 Pro
simulator. `ui-rounded` and Kalam both confirmed resolving by canvas probe,
not by eye.

**On `side-nav-prototype` only, deliberately.** The sign fold, `d22ef1a`, kept
off `main`: live CSS on twelve DOM screens with ten never looked at, and `main`
deploys.

## Files
- `docs/ui-next-steps-2026-09-02.md` — the ranked queue and three open
  decisions. **Read this first**; it carries the detail this note omits.
- `docs/ui-audit-2026-08-31.md` — the original seven findings. §2 in it is
  wrong, and so are §1's parts about the button icon; the queue says how.
- `.claude/TRAPS.md` — read before touching the harness or the simulator.
- `apps/game/src/ui/constants.ts` — `CHROME` (fill/stroke/four inks),
  `FONTS.ui`, `TITLE_CY`, `EDGE_CONTROL_INSET`.
- `apps/game/src/ui/UIButton.ts` — the chrome helpers: `createChromePlate`,
  `createChromeTitle`, `createChromeCircleButton`, `createChromeButton`.
  The `variant` doc on the last one carries the plate/filled rule.
- `apps/game/e2e/chrome-buttons.spec.ts` — shoots the overlays
  `ui-audit.spec.ts` never opens.
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
- **Buttons are the same surface at two weights.** `plate` is the paper,
  `filled` is the ink and paper swapped — so emphasis costs no new colour.
  A plate holds up on the cream canvas; it is a frame-inside-a-frame only
  when it sits on another plate, which is where filled goes instead.

## Next step
Queue item 5, sweeping the edges with `ux-geometry.ts` and
`e2e/ux-review.spec.ts` pointed at every scene — `EDGE_CONTROL_INSET` still
has one user. Or item 2's leftover, hoisting the type scale out of 23 copies
into `fonts.css`, which is contained and mechanical.

**Three decisions are open and two of them gate work** — they are listed at
the top of the queue. Depot and SupplyRun's own language is the one blocking
the last four button call sites.

## Traps
- **Read `.claude/TRAPS.md` before the harness.** It records that Playwright's
  bundled browsers stall (`ARC_BROWSER_CHANNEL=chrome` is the way round) and
  that WebGL is dead in the Claude browser pane. Both were rediscovered the
  slow way anyway.
- **`animalCard()` destroys the card.** It calls `destroyAnimalCard()` and
  returns a fresh empty container, so reading the card through it deletes
  what you were reading. Use `animalCardContainer`.
- **The Games popup lays a full-screen dismiss rectangle over the scene.**
  Nothing shot after it can be clicked — open it last.
- **Do not judge a typeface, or an icon, from a Mac screenshot** without
  measuring. That is how the audit's §2 came to describe a font that never
  reached the device, and how the walk icon's fault was put down to scaling
  code rather than to 69x34 of art in a 128x128 frame.
- **To reach the game on the simulator, seed the session**, do not log in:
  `mintRealSession()` from `e2e/helpers.ts` into a temporary
  `public/__devsession.js`. Delete it after — it holds a live token.
- Simulator screenshots return in the portrait framebuffer with landscape
  content rotated. `PIL Image.transpose(ROTATE_90)` to read them; taps use the
  unrotated 402x874 space.
- Bash `cd` does not persist between calls; use absolute paths.
