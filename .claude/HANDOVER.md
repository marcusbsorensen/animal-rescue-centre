# A.R.C. UI direction — handover 2026-09-04

## Goal
Ship A.R.C. as an iPad/iPhone app for 7–10 year olds. Current arc: make it
look like one finished product rather than four stitched together.

## State
All on `main` and pushed. 365 tests, typecheck clean, 35 lint warnings,
0 errors. **Side-nav is the layout now** — `?sideRail=0` puts the bottom
bar back, and that is the only flag.

**`e2e/ux-review.spec.ts` is at 2 FAIL / 14 WARN over 56 pairs**, measuring
the new layout — better than the 16 WARN the bottom bar scored. The two
FAILs are the paths screen's L3 on phone and clip and are untouched.

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
- **Side-nav shipped, and its chrome was redesigned with it**: a colour per
  nav destination, the room title left-aligned onto the rail, the world's
  state as wordless icon chips under it, one player panel top-right in
  place of the vertical pull-tab, and the two sounds as separate toggles
  with a long-press volume. Room, Kitchen and Garden draw into the play box.
- **Messages in the middle of a room are translucent** —
  `CHROME.fillAlphaOverArt`.

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
- `apps/game/src/game-views/CorridorView.ts` — `SIGN_GAP`, `nearestClearX`
  and `signRowW` hold the arrival's and the signs' relationships.
- `apps/game/src/game-views/HUDView.ts` — `renderSideNavHeader` is the
  whole top of the game; the strip above it is the bottom-bar path.
- `apps/game/src/game-views/NavRailView.ts` — the coloured rail, and why
  its column starts below the header.
- `docs/landscape-relayout-2026-08-31.md` — the layout's design note. Its
  "Still open" list is still accurate bar the views, which are done.
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
- **Colour reinforces; it never carries.** The nav rail's four hues are
  brand hues each destination's icon is already painted in, and the labels
  stay — so a child who does not see red and green apart loses nothing.
- **A message in the middle of a room is translucent; a title at its edge
  is not.** `CHROME.fillAlphaOverArt`, and 0.84 is a contrast limit rather
  than a taste.

## Next step
Queue items 7b, 8, 9 and 10.

**The one that wants Marcus and a device.** Everything below the layout is
measured geometry. Whether a 7-year-old can work a vertical rail — reach
it with a thumb, tell four coloured cells apart, find the long-press on a
sound pill — is not a thing arithmetic answers, and it is the question the
whole layout now rests on. `VITE_SIDE_RAIL=0 pnpm build:ios` builds the
bottom bar for a side-by-side.

**Open, and now load-bearing: cover versus contain.** The room background
is `setDisplaySize(play.w, play.h)` — a stretch, not a fit. At 696 wide it
was a 2.8% squash; at 752 it is a 5.2% stretch, so losing the arrivals tab
moved the box *past* the art's shape rather than towards it. Both are
invisible beside the bottom bar's 19%, and the real answer is a uniform
fit that crops, which has no stretch at any aspect. **Taking it means
resolving anchors against the drawn art rect rather than the play box** —
which is why it is not something to do in passing.

**Also open, from the design note.** The right-hand safe inset for the
other landscape orientation (`ui/safe-area.ts` only reads `left`), the
bottom inset, and whether an iPad wants this layout at all — at >=1024 the
arrivals rail stands open and vertical is not scarce, so this may be a
phone-only layout and two arrangements to maintain.

**Art that is missing, and it is one commission for three jobs:** an
effects icon for the sound toggle (which carries a word because
`icon-music-on`/`off` exist and nothing does for effects), the drive
picker's forecourt flanks, and item 10's emoji furniture.

**Settled, so they are not re-litigated:** the forecourt flanks get
commissioned art rather than the existing road furniture; Caveat's
`font-size-adjust: 0.49` goes with the paths/rewilding work, not before —
it widens text 37% across ~50 rules on 20 screens, which is why it belongs
where those screens are already open.

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
- **`rg src/ …` from the repo root silently matches nothing** — `src/` is
  under `apps/game/`. With `2>/dev/null` on the end it reports zero hits
  rather than an error, which is how this session concluded `setSideNav`
  had no callers when it has one in `main.ts`. Check the cwd before
  believing an empty result.
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
