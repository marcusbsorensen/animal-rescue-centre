# A.R.C. UI direction — handover 2026-08-31

The chrome surface exists and the garden is its first consumer. Fifteen
more views to convert, and the sign-fold sweep is still open.

## Goal
Ship A.R.C. as an iPad/iPhone app for 7–10 year olds. Current arc: make
it look like one finished product rather than three stitched together.

## State
**Committed.** `72f4647` on branch `side-nav-prototype`, not merged to
`main`. Side-nav layout behind `?sideRail=1`, default off. Verified in
the real Capacitor app on an iPhone 17 Pro sim — rail clears the Dynamic
Island and the home indicator.

**Uncommitted, and the new work.** The chrome surface — audit §1's answer
— plus `GardenView` converted onto it. 334 tests, typecheck clean, 38
lint warnings (unchanged baseline, 0 errors).
- `ui/constants.ts` — `FONTS.ui` (system-rounded, no webfont), `CHROME`
  (the one non-diegetic surface, drawn from `COLOURS`), `hexNum`,
  `EDGE_CONTROL_INSET`.
- `ui/UIButton.ts` — `createChromePlate`, `createChromeTitle`,
  `createChromeCircleButton`, beside the pill/panel they replace.
- `game-views/GardenView.ts` — title off `createPillTitle`, empty state
  onto a plate, arrows into chrome circles with real hit areas.
- `ui/__tests__/chrome.test.ts` — 13 tests holding the decisions.

**Uncommitted, older.** The two-board sign fold in `public/admin/`
`_short-landscape.css` + `_signpost-physics.css`: landscape splits the
stake into information-left / actions-right on one central post pair.
Scoped `:has(> .cta-stack)`, so it lands on **twelve** screens —
adopters, conflict, friends, forgot-pin, login, menu, news, vet, welcome,
paths, welcome-new, signup. Only welcome and login looked at; ten unswept.

**Verified by capture**, at 874x402 through the Chrome channel: both
garden zones, and the right arrow answering a tap. Before/after sit in
`e2e/__audit__/08-garden-BEFORE-chrome.jpg` and `08-garden.png`.

**Unverified.** No physical hardware, no simulator run since the chrome
landed. Menu, the species room, the 14 in-game overlay screens and
Walk/Depot/Drive/Social/Account are unaudited.

## Files
- `docs/ui-audit-2026-08-31.md` — the seven findings, ranked. Read first.
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
Convert the remaining fifteen `createPillTitle` callers — CorridorView,
RoomView, KitchenView and twelve scenes. `createChromeTitle` takes the
same shape of call minus the colour options, so it is mechanical. Do
CorridorView and RoomView first: they already share `TITLE_CY` and the
play-area origin with the garden, so the three read as one product the
moment they match.

Then the two things the garden pass surfaced but did not fix:
- **The garden's count line** (`GardenView.ts`, "2 pets living their best
  life") is at y=95, inside the HUD's second row (phase and weather pills,
  y 78..106), which draws on top of it. Its x is fixed; its y wants
  deciding with the other titles, not locally.
- **"Garden — Quiet nook" abuts the "0 in care" pill.** It is the longest
  title in the game and the HUD's 600px-centred gap barely holds it. The
  chrome plate is 20px narrower than the pill it replaced, so this is
  better than it was, not worse — but a longer title anywhere will collide.

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
- **`e2e/ui-audit.spec.ts` fails at step 09-room**, and did before this
  work: it sets `viewMode = 'room'` without a species, so `renderRoom`
  throws on `species.charAt`. Everything up to and including the garden
  shoots fine.
- **`_short-landscape.css` pins `.secondary-row` `position: sticky`**,
  lifting buttons out of any board they are meant to sit on.
- Text objects with `.setInteractive()` get a glyph-sized hit area. The
  garden's arrows were the last of those; `createChromeCircleButton`
  floors the hit area at `MIN_TAP` independently of what is drawn.
- Bash `cd` does not persist between calls; use absolute paths.
