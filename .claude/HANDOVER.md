# A.R.C. UI direction — handover 2026-09-02

## Goal
Ship A.R.C. as an iPad/iPhone app for 7–10 year olds. Current arc: make it
look like one finished product rather than three stitched together.

## State
**On `main`** (`1ff6873`): the whole chrome conversion, merged 2026-09-02 —
the audit, the surface, GardenView, the self-hosted fonts, and the side-nav
layout behind `?sideRail=1` defaulting off.

**On `main`**, one commit past the merge. 344 tests, typecheck clean, 36
lint warnings (two below the old baseline, 0 errors).
- Depot and SupplyRun warmed into the game's world — the fourth visual
  language the audit never saw. Not just their chrome: palette, sky, road,
  board, cards.
- `createButton` and `createPillTitle` are both deleted. Every button in the
  game is `createChromeButton`; the bevel is gone.
- The edges are swept. `ux-review.spec.ts` is at **0 FAIL / 86 WARN** over
  42 scene/viewport pairs, down from 3/107, and the L3 edge rule has no
  findings left at all.

**Verified.** Chrome captures at 874x402 for the sixteen titled screens, the
animal card and its More grid, the Games popup, the Phaser PIN keypad, and
both phases of Depot and SupplyRun. Corridor, Dog Room, kitchen and garden
also seen on an iPhone 17 Pro simulator. `ui-rounded` and Kalam confirmed
resolving by canvas probe, not by eye.

**Dropped, on purpose.** The sign fold, `d22ef1a`, stays on
`side-nav-prototype` as history. Live CSS on twelve DOM screens with ten
never looked at; decided against 2026-09-02.

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
Typography is what is left in the harness: 41 F1-F5 (font size), 15 F6
(rounded sans-serif) and 11 F7 (ALL-CAPS body text) are two thirds of the
remaining 86 warnings and are one job. Item 2's leftover sits inside it —
hoisting the type scale out of 23 per-screen copies into `fonts.css`.

Otherwise the queue's items 6 (enumerate §3), 7 (use the palette: 658 raw
literals against 287 token uses) and 8 (retire the emoji furniture, which
needs commissioned art and so wants starting early).

**No decisions are open**, but one is parked with a price on it: the
side-nav tab is flush to the right edge, and insetting it costs the 696px
play box that room art finally fits. See item 5 in the queue.

## Traps
- **Read `.claude/TRAPS.md` before the harness.** It records that Playwright's
  bundled browsers stall (`ARC_BROWSER_CHANNEL=chrome` is the way round) and
  that WebGL is dead in the Claude browser pane. Both were rediscovered the
  slow way anyway.
- **`EDGE_CONTROL_INSET` only works for a `MIN_TAP`-sized control.** It is
  `SAFE_MARGIN + MIN_TAP / 2`, so centring anything larger on it puts the
  control back inside the margin. Use `createChromeButton`'s `anchor`, which
  measures the control first.
- **`animalCard()` destroys the card.** It calls `destroyAnimalCard()` and
  returns a fresh empty container, so reading the card through it deletes
  what you were reading. Use `animalCardContainer`.
- **`scene-walk.spec.ts` only reaches a scene's first screen.** The Depot's
  board and the supply run's road were never in a capture until
  `chrome-buttons.spec.ts` started their phases directly. A scene that
  passes the walk is not a scene that has been looked at.
- **The Phaser paths in LoginScene and SignupScene are switched off**, not
  merely unused: `const USE_OVERLAY = true as boolean` mounts the DOM sign
  board and returns before any of it runs. Flip it by hand to see them.
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
