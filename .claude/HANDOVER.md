# A.R.C. UI direction — handover 2026-09-03

## Goal
Ship A.R.C. as an iPad/iPhone app for 7–10 year olds. Current arc: make it
look like one finished product rather than four stitched together.

## State
All on `main`, **not yet pushed** — five commits on top of `2660130`, the
last of them this note. 362 tests, typecheck clean, 36 lint warnings,
0 errors. Nothing behind a flag.

**`e2e/ux-review.spec.ts` is at 0 FAIL / 19 WARN** over 42 scene/viewport
pairs, down from 3/107 two sessions ago and 0/86 this morning. F1-F5, F6
and F7 are all at zero; what is left is T4, L6, L8, L9 — layout, not type.

- Every title, plate and button is on the chrome surface; the bevel is gone.
- Depot and SupplyRun are warmed into the game's world.
- **The type floor is 16 and lives in two named places** — `MIN_FONT.small`
  for the canvas, `--fs-floor` in `fonts.css` for the DOM. It was 14, the
  checklist's *warn* mark, and 104 call sites sat exactly on it.
- Six webfonts self-hosted, and the four DOM families now declared once in
  `fonts.css` rather than copied into 23 screens.

**Seen on device 2026-09-03**, iPhone 17 Pro simulator, Mobile Safari:
menu, intro and corridor render in Nunito/Kalam/Gochi Hand at the new
floor. **Portrait only** — landscape needs Marcus's Cmd+Left — so the faces
and sizes are confirmed and the landscape layout is not. Chrome at 874x402
covers that, and is trustworthy for it.

## Files
- `docs/ui-next-steps-2026-09-02.md` — the ranked queue, items 1–6 done.
  **Read first**; it carries the detail this note omits.
- `.claude/TRAPS.md` — read before the harness, the CSS or the simulator.
- `apps/game/src/ui/constants.ts` — `TYPE`, `MIN_FONT`, `CHROME`, `FONTS`.
  The reasoning for the floor is on `MIN_FONT.small`.
- `apps/game/public/fonts/fonts.css` — the DOM families and `--fs-floor`.
- `apps/game/public/admin/_short-landscape.css` — where the phone's type
  actually comes from. Edit it *with* the pages, not after.
- `apps/game/e2e/dom-type.spec.ts` — holds the floor on 25 DOM screens,
  twelve of which `ux-review.spec.ts` structurally cannot open.
- `apps/game/src/ui/UIButton.ts` — `createChromeButton`'s `variant` and
  `anchor` docs carry the rules the edge sweep applied.

## Decisions made
- **Painted is diegetic only.** Sign boards are objects in the world;
  anything floating above it is chrome — cream paper, hairline, soft shadow.
- **Chrome type is a system face.** `ui-rounded` first, no webfont in the
  stack, so it cannot fall through mid-load.
- **The game has three type registers and no more.** Rounded for the
  chrome, handwritten (Kalam, Gochi Hand, Caveat) for the painted world,
  and monospace for the one string a child reads off one screen and types
  into another. F6 knows about all three now.
- **Only the floor of a `clamp()` moves.** The shapes were right — a sign
  title growing to 21px on a tall viewport is what a container query is
  for. Nothing shrank; nothing stopped scaling.
- **Tone is decoration, never signal.** The words carry it.
- **Buttons are one surface at two weights.** `plate` is paper, `filled` is
  ink and paper swapped.
- **The sign fold is dropped.** `d22ef1a` stays on `side-nav-prototype`.
- **The side-nav tab stays flush to the right edge.** Insetting it costs
  16px of the play box whose whole claim is that room art fits it. Marcus's
  call to change.

## Next step
The canvas still carries **227 bare px strings across 20 distinct sizes**,
16 to 72. Three of those sizes are `TYPE`'s own steps written as literals;
the other seventeen are the continuum the scale exists to replace — 17, 19,
22, 26, 30, 34, 36, 38, 42, 44, 46. Collapsing them is the rest of the same
job, and unlike the floor it is aesthetic rather than accessibility: it
wants looking at rather than measuring, and it will move things. Everything
else on the queue (§3 enumeration, the 658 raw colour literals, the emoji
furniture) is untouched.

## Traps
- **`_short-landscape.css` wins on the phone.** A sweep of the `.html`
  files alone leaves the phone on the old values.
- **Phaser's default `fontFamily` is `Courier`** — name one even for a glyph.
- **`EDGE_CONTROL_INSET` only fits a `MIN_TAP`-sized control.** Use
  `createChromeButton`'s `anchor`, which measures first.
- **`animalCard()` destroys the card it returns.** Use `animalCardContainer`.
- **`scene-walk.spec.ts` only reaches a scene's first screen.**
- **The Games popup lays a full-screen dismiss rect over the scene** — open
  it last, or every later click goes to it.
- **LoginScene/SignupScene's Phaser paths are switched off**, not unused.
- **Never judge a typeface or an icon from a Mac screenshot.** Measure.
