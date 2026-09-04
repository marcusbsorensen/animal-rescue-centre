# A.R.C. UI direction — handover 2026-09-04

## Goal
Ship A.R.C. as an iPad/iPhone app for 7–10 year olds. Current arc: make it
look like one finished product rather than four stitched together.

## State
All on `main` and pushed. 365 tests, typecheck clean, 35 lint warnings,
0 errors. One thing is behind a flag and it matters: **`?sideRail=1`**.

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
Queue items 7b, 8, 9 and 10. Item 1 below is the work; 2 and 3 are settled
and recorded so they are not re-litigated.

**Decided 2026-09-04:**

1. **Make side-nav the default.** Reviewed at Marcus's ask; the survey is
   in queue item 7b. It is a live prototype on `main` behind `?sideRail=1`
   (`main.ts:65`, remembered in `localStorage`, `VITE_SIDE_RAIL=1` for the
   native build) — **not** a branch. `side-nav-prototype` holds the sign
   fold and is 48 commits behind; do not go looking there for it.
   `docs/landscape-relayout-2026-08-31.md` is the design note.

   The play box goes 768x362 (aspect **2.12**, letterboxed) → 696x402
   (**1.73**, against room art authored at 1.78), and `anchorSpaceFor`'s
   compromise stops existing. **The entire visible cost is that Room,
   Kitchen and Garden keep the old art rect and show cream margins against
   the rail** — they size from `height - 40` and KitchenView draws at full
   `width`; it is the same treatment `CorridorView` already had. Every DOM
   overlay, every standalone scene and the animal card are pixel-identical
   in both layouts.

   Still unanswered: the right-hand safe inset for the other landscape
   orientation, the bottom inset, whether iPad wants this at all, and
   whether a 7-year-old can work a vertical rail — which is not a thing
   arithmetic answers, and is the one that wants Marcus and a device.

2. **The drive picker's forecourt flanks: commission proper art.** Marcus's
   call — not the existing road furniture. A lead-time item; pair the ask
   with queue item 10's emoji furniture so one commission covers both.

3. **Caveat: do it with the paths/rewilding work, not before.** It reads at
   72% of every other face, so `TYPE.caption` means about 11.6px in it.
   `font-size-adjust: 0.49` fixes it and is verified, but widens text 37%
   across ~50 rules on 20 screens — which is why it goes where those
   screens are already open.

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
