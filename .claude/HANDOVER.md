# A.R.C. UI direction — handover 2026-09-02

The chrome surface exists and every titled screen in the game is on it.
`createPillTitle` has no callers left. Nothing has been seen on a device.

## Goal
Ship A.R.C. as an iPad/iPhone app for 7–10 year olds. Current arc: make
it look like one finished product rather than three stitched together.

## State
**On `main`** (`5cd5c67`): the audit, the chrome surface, GardenView, and
the side-nav layout behind `?sideRail=1` defaulting off.

**On `chrome-views`** (`2f5c323`), pushed, unmerged: corridor, room and
kitchen onto the chrome surface, then the remaining twenty pill titles
across twelve files. 336 tests, typecheck clean, 38 lint warnings
(unchanged baseline, 0 errors).
- `ui/constants.ts` — `FONTS.ui`, `CHROME` (fill/stroke/four inks),
  `hexNum`, `EDGE_CONTROL_INSET`, `TITLE_CY`.
- `ui/UIButton.ts` — `createChromePlate`, `createChromeTitle` (with
  `tone`), `createChromeCircleButton`.
- `ui/__tests__/chrome.test.ts` — 16 tests holding the decisions.

**On `side-nav-prototype` only, deliberately.** The two-board sign fold,
`d22ef1a`, **kept off `main`**: it is live CSS on twelve DOM screens with
ten never looked at, and `main` deploys. Sweep the ten before it moves.

**Verified by capture** at 874x402 through the Chrome channel: the four
game views, and ten of the twelve scenes via `scene-walk.spec.ts`.
LoginScene and SignupScene could not be seen — the walk starts a scene
without `unmountAuth()`, so the DOM sign boards sit over them.

**Unverified anywhere.** No simulator run since the chrome landed, and no
physical hardware. `FONTS.ui` leads with `ui-rounded`, a WebKit generic
that has only ever been resolved by Chrome here. Sixteen screens depend
on it.

## Files
- `docs/ui-next-steps-2026-09-02.md` — the queue. Read first.
- `docs/ui-audit-2026-08-31.md` — the seven findings and the reasoning.
- `docs/landscape-relayout-2026-08-31.md` — side-nav and its open list.
- `.claude/TRAPS.md` — the simulator section is load-bearing, and read
  the Playwright lines before touching the harness.
- `src/ui/constants.ts` — `CHROME`, `FONTS`, `COLOURS`, `MIN_TAP`,
  `EDGE_CONTROL_INSET`.
- `src/ui/UIButton.ts:354` `createChromePlate`, `:402` `createChromeTitle`,
  `:485` `createChromeCircleButton`.
- `e2e/ui-audit.spec.ts` — shoots the screens at 874x402.

## Decisions made
- **Painted = diegetic only.** The hand-painted wood language belongs to
  the sign screens, because those boards are artwork — objects in the
  world. Everything non-diegetic (HUD, nav, panels, view titles, buttons)
  is chrome and gets `CHROME`: warm cream paper, hairline border, soft
  shadow — the surface the left rail was already drawing, promoted from
  one view's local styling. Cream rather than white glass on purpose:
  non-diegetic does not have to mean generic.
- **Chrome type is a friendly *system* font**, not a webfont — `FONTS.ui`
  starts `ui-rounded` / SF Pro Rounded and reaches for no webfont at all,
  which is what a test now holds. A stack that starts at a face iOS always
  has cannot fall through, which is the whole failure mode behind login's
  system-sans button.
- **No room art needs re-painting.** All 27 backgrounds are 16:9.
- **Four rail items, not five.** Supplies moved into Care.

## Next step
**`docs/ui-next-steps-2026-09-02.md`** — the ranked queue, three
decisions that come before more code, and where each of the audit's seven
findings actually stands. Read that rather than this section.

The short version: get the chrome onto a simulator before converting
anything else, because sixteen screens now depend on `ui-rounded`
resolving in WKWebView the way it does in Chrome, and nobody has looked.

## Traps
- **Read `.claude/TRAPS.md` before reaching for the harness.** It already
  records that Playwright's bundled downloads stall and that
  `ARC_BROWSER_CHANNEL=chrome` is the supported way round it, and that
  WebGL does not initialise in the Claude browser pane. Both were
  rediscovered the slow way this session.
- **`osascript` cannot rotate the simulator** — ask Marcus for Cmd+Left,
  then re-`attach` and re-`openurl`: the flip can leave the device at the
  Home Screen in portrait, and the first capture after it lies.
- **Never judge layout in simulator Safari** — its chrome makes the
  viewport ~64pt shorter than the shell's 874x402. Build the app
  (`VITE_SIDE_RAIL=1 pnpm build:ios`).
- **`ui-audit.spec.ts` and `scene-walk.spec.ts` both pass end to end.**
  The audit spec used to throw at step 09-room (`viewMode` set without
  `currentRoomSpecies`), which cost every screen after it too. Fixed; if
  it regresses, that is the shape to look for.
- **`_short-landscape.css` pins `.secondary-row` `position: sticky`**,
  lifting buttons out of any board they are meant to sit on.
- Text objects with `.setInteractive()` get a glyph-sized hit area. The
  garden's arrows were the last of those; `createChromeCircleButton`
  floors the hit area at `MIN_TAP` independently of what is drawn.
- Bash `cd` does not persist between calls; use absolute paths.
