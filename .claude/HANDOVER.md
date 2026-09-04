# A.R.C. UI direction — handover 2026-09-03

## Goal
Ship A.R.C. as an iPad/iPhone app for 7–10 year olds. Current arc: make it
look like one finished product rather than four stitched together.

## State
All on `main` and pushed. 365 tests, typecheck clean, 36 lint warnings,
0 errors. Nothing behind a flag.

**`e2e/ux-review.spec.ts` is at 2 FAIL / 18 WARN over 56 pairs** — and the
count went *up* because the instrument was wrong, not the game. It measured
a stuck frame on 16 of its old 42 pairs, and it had never shot a viewport
this game ships to. Both fixed; the two FAILs are new information from the
874x402 and 812x325 rows nobody had measured. Typography is at zero.

- Every title, plate and button is on the chrome surface; the bevel is gone.
- Depot and SupplyRun are warmed into the game's world.
- **The type floor is 16 and lives in two named places** — `MIN_FONT.small`
  for the canvas, `--fs-floor` in `fonts.css` for the DOM. It was 14, the
  checklist's *warn* mark, and 104 call sites sat exactly on it.
- **`TYPE` is six steps.** 22 sizes across 329 sites; 178 type sites are on
  the scale and 47 emoji keep their literals, because sizing a rock is not
  typography.
- **`SPACE`, `PAGE_MARGIN`, `TITLE_CY`, `contentTopFor`, `bandCentreY`.**
  There were 17 outer margins, 18 radii and 8 title y-values.
- **One vertical axis**, one exit control, one title line.
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
Four items from the composition review are left, and they are listed with
their reasons in queue item 7. In order:

1. **The corridor's animals overlap the door signs** — 60% on the phone.
   This is the one that needs *you*, not a coordinate: the signs hang on
   doors painted into the background, so they cannot move independently of
   the art. The question is where an arriving animal stands.
2. **PtvDrive's picker** — 55% of its top half is bare, and its caption and
   level chips use Phaser `backgroundColor` blocks (20 such sites, 10 in
   that file) rather than a plate.
3. **The map's tab strip** — the only dark chrome surface in the game, 67px
   of a 402px screen for two controls.
4. **`createPanel`'s last 17 call sites** want `createChromePlate`.

Two things are measured and waiting on a decision:
- **Caveat reads at 72% of every other face**, so `TYPE.caption` means about
  11.6px in it. `font-size-adjust: 0.49` fixes it and is verified, but it
  widens text 37% across ~50 rules on 20 screens. Your call, and it belongs
  with the paths/rewilding screen work.
- **The tablet and desktop captures are still one frame** even though their
  measurements are right, so the iPad can be measured but not looked at.

## Traps
- **`?embed=1` is not the same as adding `body.embed` after load.** The mock
  keeps its `data-size`, the container query sees the wrong box, and the
  whole short-landscape branch silently does not apply.
- **`_short-landscape.css` wins on the phone.** A sweep of the `.html`
  files alone leaves the phone on the old values.
- **A block child does not centre because its parent says `text-align:
  center`.** That is why the sign column was 42px out on twelve screens.
- **Phaser's default `fontFamily` is `Courier`** — name one even for a glyph.
- **`EDGE_CONTROL_INSET` only fits a `MIN_TAP`-sized control.** Use
  `createChromeButton`'s `anchor`, which measures first.
- **`animalCard()` destroys the card it returns.** Use `animalCardContainer`.
- **`scene-walk.spec.ts` only reaches a scene's first screen.**
- **The Games popup lays a full-screen dismiss rect over the scene** — open
  it last, or every later click goes to it.
- **LoginScene/SignupScene's Phaser paths are switched off**, not unused.
- **Never judge a typeface or an icon from a Mac screenshot.** Measure.
