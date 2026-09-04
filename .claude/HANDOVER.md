# A.R.C. UI direction — handover 2026-09-04

## Goal
Ship A.R.C. as an iPad/iPhone app for 7–10 year olds. Current arc: make it
look like one finished product rather than four stitched together.

## State
All on `main` (`7d2ef24`), **not yet pushed**. 365 tests, typecheck clean,
35 lint warnings, 0 errors. Nothing behind a flag.

**`e2e/ux-review.spec.ts` is at 2 FAIL / 16 WARN over 56 pairs.** The two
FAILs are the paths screen's L3 on phone and clip, and nothing this session
touched goes near them. Everything the composition review left is done.

- **The corridor's arrivals take the room the sign row leaves them.** They
  were the one block that never got "a block takes the bottom of the block
  above it", because they are anchored rather than stacked.
- **The drive picker has a title line**, chrome unlock chips, and a building
  that stands behind its car park instead of floating in gravel.
- **The map's tab strip is gone** — the tabs float over the map, which has
  its 67px back. That was the last dark surface in the game.
- **`createPanel` is deleted.** All 17 callers took `createChromePlate`,
  which gained `variant: 'plate' | 'filled'` for the one that carried
  selection rather than decoration.

Earlier arc, still true: every title, plate and button is on the chrome
surface and the bevel is gone; the type floor is 16 in `MIN_FONT.small` and
`--fs-floor`; `TYPE` is six steps; `SPACE`, `PAGE_MARGIN`, `TITLE_CY`,
`contentTopFor` and `bandCentreY` hold the geometry; one vertical axis, one
exit control, one title line.

**Seen on device 2026-09-03**, iPhone 17 Pro simulator, Mobile Safari,
portrait only. Landscape is confirmed by Chrome at 874x402 and by the
harness, not by a device.

## Files
- `docs/ui-next-steps-2026-09-02.md` — the ranked queue. Items 1–7 done;
  **7b, 8, 9 and 10 are what is left**. Read first.
- `.claude/TRAPS.md` — read before the harness, the CSS or the simulator.
- `apps/game/src/ui/constants.ts` — `TYPE`, `MIN_FONT`, `CHROME`, `FONTS`.
- `apps/game/src/ui/UIButton.ts` — `createChromePlate`'s `variant` and
  `createChromeButton`'s `variant`/`anchor` carry the rules.
- `apps/game/src/game-views/CorridorView.ts` — `SIGN_GAP` and
  `nearestClearX` hold the arrival's relationship to the door signs.
- `apps/game/public/fonts/fonts.css` — DOM families and `--fs-floor`.
- `apps/game/public/admin/_short-landscape.css` — where the phone's type
  actually comes from. Edit it *with* the pages, not after.

## Decisions made
- **Painted is diegetic only.** Sign boards are objects in the world;
  anything floating above it is chrome — cream paper, hairline, soft shadow.
  The map's tabs moved onto that rule this session.
- **Chrome type is a system face.** `ui-rounded` first, no webfont.
- **Three type registers and no more** — rounded chrome, handwritten world,
  monospace for the one string a child copies between screens.
- **Tone is decoration, never signal. The words carry it.** Where a surface
  was the only channel — the STOP strip, the crossing banner — the meaning
  moved to the ink, not to a coloured plate.
- **One surface at two weights.** `plate` is paper, `filled` is ink and
  paper swapped. `filled` marks *selection*, not emphasis.
- **An arrival is scenery; a door sign is a control.** Where they cannot
  both have the room, the animal gives way — and gets more honest
  perspective for it.
- **The sign fold is dropped.** `d22ef1a` stays on `side-nav-prototype`.

## Next step
Queue items 7b, 8, 9 and 10, and two of them are waiting on Marcus.

**Waiting on a decision:**
1. **The side-nav layout is switched off and is the real fix for a whole
   family of bugs.** `setSideNav` has no caller in `src/` or `e2e/`; the
   live version is `side-nav-prototype`. Under it the anchor rect and the
   art rect are the same rect, so `anchorSpaceFor`'s compromise — anchors
   resolving against the play band while the art fills the screen — has
   nothing left to correct. Every "the animal stands above the painted
   floor" finding is that compromise. **Merging it retires the family;
   this session managed one symptom of it.**
2. **The drive picker's forecourt flanks.** Dress them with the road
   furniture that is already painted and loaded (`decor-barrier`,
   `decor-bollard`, `decor-cone`), or leave them as forecourt. Nothing is
   broken either way.
3. **Caveat reads at 72% of every other face**, so `TYPE.caption` means
   about 11.6px in it. `font-size-adjust: 0.49` fixes it and is verified,
   but it widens text 37% across ~50 rules on 20 screens. Belongs with the
   paths/rewilding screen work.

**Not waiting on anything:** queue item 9 (658 raw colour literals against
287 token uses — mechanical now `hexNum` exists), item 8 (enumerate the
rest of §3 from captures that now exist), item 10 (retire the emoji
furniture, which needs commissioned art and so is a lead-time item).

**Still open, measured:** the tablet and desktop *captures* are one frame
even though their measurements are right — `renderer.snapshot()` hangs on a
throttled rAF and `preserveDrawingBuffer` would mean changing the shipped
config for a test. The iPad can be measured but not looked at.

## Traps
- **`?embed=1` is not the same as adding `body.embed` after load.** The mock
  keeps its `data-size`, the container query sees the wrong box, and the
  whole short-landscape branch silently does not apply.
- **`_short-landscape.css` wins on the phone.** A sweep of the `.html`
  files alone leaves the phone on the old values.
- **A block child does not centre because its parent says `text-align:
  center`.**
- **Phaser's default `fontFamily` is `Courier`** — name one even for a glyph.
- **`EDGE_CONTROL_INSET` only fits a `MIN_TAP`-sized control.** Use
  `createChromeButton`'s `anchor`, which measures first.
- **`animalCard()` destroys the card it returns.** Use `animalCardContainer`.
- **`scene-walk.spec.ts` only reaches a scene's first screen.**
- **The Games popup lays a full-screen dismiss rect over the scene** — open
  it last, or every later click goes to it.
- **LoginScene/SignupScene's Phaser paths are switched off**, not unused.
  Five of the plate conversions are in them and the harness cannot see any
  of them.
- **`grep` trips this session's token guard on alternation; `rg` does not.**
- **Never judge a typeface or an icon from a Mac screenshot.** Measure.

## Looking at it
`python3` + PIL builds a contact sheet straight from
`apps/game/e2e/__ux__/*-phone.png` — fourteen screens at the app's own
874x402. **Do not launch the simulator to look at screens**: it starts the
scene's background music, and the captures are already there and are
geometrically faithful. `xcrun simctl shutdown all` silences a stray one.

For one screen rather than fourteen, a throwaway spec that starts a single
scene and screenshots it runs in **7 seconds** against `ux-review`'s 3.2
minutes, which is what made the picker's composition worth iterating on
rather than guessing at. Reuse `waitForGameReady` / `mintRealSession` /
`installSession` from `e2e/helpers.ts` and the scale-manager poll from
`ux-review.spec.ts:resizeGameTo`; delete it when done.

The tablet and desktop captures are *not* worth looking at — see the note
in queue item 7. Their measurements are right; their pictures are one frame.
