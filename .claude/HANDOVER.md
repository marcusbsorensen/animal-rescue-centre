# A.R.C. UI direction — handover 2026-09-03

## Goal
Ship A.R.C. as an iPad/iPhone app for 7–10 year olds. Current arc: make it
look like one finished product rather than four stitched together.

## State
All on `main`, pushed (`b92a47a`). 344 tests, typecheck clean, 36 lint
warnings (0 errors). Nothing is behind a flag.

**Verified** at 874x402 — the app's real WKWebView viewport, so Chrome
captures are geometrically faithful:
- Every title, plate and button is on the chrome surface. `createButton` and
  `createPillTitle` are deleted; the bevel is gone from the game.
- Depot and SupplyRun are warmed into the game's world — palette, sky, road,
  board, cards. They were a *fourth* visual language the audit never saw.
- The edges are swept. `e2e/ux-review.spec.ts` is at **0 FAIL / 86 WARN**
  over 42 scene/viewport pairs, down from 3/107; L3 has no findings at all.
- Six webfonts self-hosted, Chalkboard SE dropped, so Mac and iPad agree.

**Unverified on device.** Everything since the chrome merge has only been
seen in Chrome. Corridor, Dog Room, kitchen and garden were checked on an
iPhone 17 Pro simulator before that; nothing has been since.

## Files
- `docs/ui-next-steps-2026-09-02.md` — the ranked queue. **Read first**; it
  carries the detail this note omits and marks items 1–5 done.
- `.claude/TRAPS.md` — read before touching the harness or the simulator.
- `apps/game/src/ui/UIButton.ts` — the chrome helpers. `createChromeButton`'s
  `variant` and `anchor` docs carry the rules the sweep applied.
- `apps/game/src/ui/constants.ts` — `CHROME`, `FONTS.ui`, `SAFE_MARGIN`,
  `MIN_TAP`, `EDGE_CONTROL_INSET`.
- `apps/game/src/ui/layout.ts:274` — `railEdgeInset`, and the note on why the
  right-hand tab stays flush.
- `apps/game/e2e/chrome-buttons.spec.ts` — shoots the overlays
  `ui-audit.spec.ts` never opens; extend it rather than writing another.

## Decisions made
- **Painted is diegetic only.** Sign boards are objects in the world. Anything
  floating above it is chrome: cream paper, hairline, soft shadow.
- **Chrome type is a system face.** `ui-rounded` first, no webfont in the
  stack, so it cannot fall through mid-load.
- **Tone is decoration, never signal.** The words carry meaning; colour only
  reinforces. Success and danger inks sit 1.12:1 apart — forced, since both
  must clear AA on cream.
- **Buttons are one surface at two weights.** `plate` is paper, `filled` is
  ink and paper swapped, so emphasis costs no new colour. Plate holds up on
  the cream canvas — drawn and looked at, not argued.
- **The sign fold is dropped.** `d22ef1a` stays on `side-nav-prototype` as
  history. Unlooked-at CSS on ten screens is what this arc avoids.

## Next step
Typography: 41 F1-F5 (font size), 15 F6 (rounded sans-serif) and 11 F7
(ALL-CAPS body text) are two thirds of the remaining 86 warnings and are one
job. Queue item 2's leftover sits inside it — hoisting the type scale out of
23 per-screen copies into `fonts.css`.

## Traps
- **Read `.claude/TRAPS.md` before the harness.** Playwright needs
  `ARC_BROWSER_CHANNEL=chrome`; WebGL is dead in the Claude browser pane.
- **`EDGE_CONTROL_INSET` only fits a `MIN_TAP`-sized control.** Centring
  anything larger on it puts the control back inside the margin. Use
  `createChromeButton`'s `anchor`, which measures first.
- **`animalCard()` destroys the card it returns.** Read
  `animalCardContainer` instead. Cost four blank captures.
- **`scene-walk.spec.ts` only reaches a scene's first screen.** Passing it is
  not the same as having been looked at.
- **The Games popup lays a full-screen dismiss rectangle over the scene** —
  open it last, or every later click goes to it.
- **The Phaser paths in LoginScene/SignupScene are switched off**, not merely
  unused: `USE_OVERLAY = true` returns before they run.
- **Do not judge a typeface or an icon from a Mac screenshot.** That is how
  the audit described a font that never reached the device, and how a
  malformed asset was blamed on scaling code.
- Bash `cd` does not persist between calls; use absolute paths.

## Parked, with a price
The side-nav tab is flush to the right edge. Insetting it for consistency
costs 16px of a play box whose whole claim is that room art fits it —
696x402, 1.77 against art authored at 1.78. That edge is not scored by the
harness. Marcus's call, not a bug to fix quietly.
