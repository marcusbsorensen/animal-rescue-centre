# A.R.C. UI direction — handover 2026-09-04 (map hub + art)

## Goal
Ship A.R.C. as an iPad/iPhone app for 7–10 year olds. Current arc: make it
look like one finished product rather than four stitched together.

## State
All on `main`, **not yet pushed**. 1199 tests (827 game-logic, 365 game,
7 badges), typecheck clean, 34 lint warnings in `apps/game` and 12
pre-existing in `packages/game-logic`, 0 errors. **Side-nav is the layout
now** — `?sideRail=0` puts the bottom bar back, and that is the only flag.

**`e2e/ux-review.spec.ts` is at 2 FAIL / 14 WARN over 56 pairs**, measuring
the new layout — better than the 16 WARN the bottom bar scored. The two
FAILs are the paths screen's L3 on phone and clip and are untouched.

- **The interface icons are drawn, not painted.**
  `tools/icons/icon-set.mjs` is 53 icons as geometry on a 24px grid;
  `node tools/icons/build-icons.mjs --sheet` rebuilds them and a contact
  sheet showing each at 96px *and* at 24. They are white and take their
  colour from `iconStyle: 'glyph'`, which is now the **default** —
  `artwork` is the exception for the animal portraits, `icon-resolve-*`,
  the species door signs and `sundial`. The painted set was authored at
  128px and drawn at 24.
- **Every destination has art.** Five buildings as flat elevations
  (`site-<id>-building.png`) and five habitat vignettes
  (`site-<id>-place.png`), briefed against real Birchington/Thanet
  vernacular — knapped flint with brick quoins, Kent peg tiles, tarred
  weatherboard, oast cowls, stuccoed seaside villas. A habitat gets a
  chalk pull-in rather than tarmac bays.
- **The map is the mission hub.** Every pin is a place, tapping one
  drives there, and arriving opens what is inside. The rail is **Home /
  Care / Walk / Map**; Social is the village hall on the map; Heal opens
  the map with the poorly animal aboard. `openMapOverlay`,
  `PtvDriveScene` and `getAvailableDestinations` were all finished and
  unreachable, and this is what connects them.
- **The drive has an end.** `renderArrival` is the mirror of
  `renderParking` — the van comes off the road, parks in a bay in front
  of the building, and "Go inside" hands back. Before this, progress
  clamped at 1 and the road kept scrolling.
- **There is one set of map positions.** The abstract `mapX/mapY` and
  `BIRCHIE_PLACES` are gone; `fx/fy` on the destination is it, seeded
  from the real OSM plot for A.R.C. The GPS had been starting every
  route a tenth of the map east of the building.
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
- **Messages in the middle of a room are translucent**
  (`CHROME.fillAlphaOverArt`) and sit on `MESSAGE_BOTTOM_FRAC` — 0.65 of
  the play box, which is the garden's bird bath line.
- **The nav discs carry their destination's colour**, sized from the cell
  so the label always fits inside its own tap target. The two sound
  toggles are wordless discs: full colour on, grey and struck through off.

Earlier arc, still true: every title, plate and button is on the chrome
surface and the bevel is gone; the type floor is 16 in `MIN_FONT.small` and
`--fs-floor`; `TYPE` is six steps; `SPACE`, `PAGE_MARGIN`, `TITLE_CY`,
`contentTopFor` and `bandCentreY` hold the geometry; one vertical axis, one
exit control, one title line.

**Seen on device 2026-09-03**, iPhone 17 Pro simulator, Mobile Safari,
portrait only. Landscape is confirmed by Chrome at 874x402 and by the
harness, not by a device.

## Files
- `docs/ui-next-steps-2026-09-02.md` — the ranked queue. Items 1–7 and 11
  done; **8, 9 and 10 are what is left**. Read first.
- `.claude/TRAPS.md` — read before the harness, the CSS or the simulator.
- `packages/game-logic/src/destinations.ts` — the destination model, and
  the single source of the map positions. `mapExtentFor` is the reach.
- `apps/game/public/admin/map.html` — `placePins`, `mapTransform` and the
  destination card. Holds no table; the host sends the list on `init`.
- `apps/game/src/scenes/PtvDriveScene.ts` — `renderArrival` is the far end
  of a journey, and the `phase === 'travel'` guards on `switchRoad` /
  `applyRoadSwitch` are why the parked van stays parked.
- `apps/game/src/scenes/GameScene.ts` — `openMapOverlay`, `driveTo`,
  `handleArrival`, `rewardSafeDrive`.
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
- **Arriving opens the place.** The drive is the corridor between rooms,
  so every destination names the room at the end of it. A pin with no
  arrival wastes a journey, which is what the "coming soon!" toast was.
- **The arrival is a beat, not a transition.** Marcus, 2026-09-04: we see
  the vehicle pull in and park in front of the building, and *then* what
  is inside. Hence the mirror of the departure rather than a cut.
- **A tap opens a card; "Drive here!" starts the drive.** A journey is
  minutes long and a stray finger on a map full of pins should not cost
  one. The card is also where a locked pin says *when*, rather than *no*.
- **The vet and the village hall are never locked.** A poorly animal can
  arrive on a child's first day, and Social was a permanent tab before it
  moved onto the map.
- **`map.html` holds no destination table.** It is static and cannot
  import `destinations.ts`, so the host sends the list and the page draws
  what it is given.

## Next step
**Item 8 — enumerate the rest of §3** (text on painted art; two instances
plated, denominator unknown), then **item 9** (658 raw colour literals
against 287 token uses, mechanical now `hexNum` exists). Both are in
`docs/ui-next-steps-2026-09-02.md`.

**Ahead of either, three things that want Marcus and a device:**

- **The new art has never been seen on a device.** The icons are the
  whole interface and the buildings are one render each. This is the
  session's biggest unverified claim.
- **A.R.C.'s own building is a softer, lighter hand** than the five new
  ones. They read as a set with each other; whether A.R.C. wants
  re-rendering to match is a taste call.

- **`openDriveOverlay` has no caller.** 828 lines of `drive-overlay.html`
  plus its mount, kept rather than deleted: the cutscene's arrival beat is
  the thing Marcus asked for, and the per-destination forecourts are
  unpainted. Look at the Phaser arrival on a device, then delete it or
  revive it as a painted layer in front. Do not leave it as it is.
- **The art ask is down from six jobs to three** — see item 10.
  `nav-map`, the effects icon and all ten destination places are done.
  What is left is the drive picker's forecourt flanks, item 10's in-world
  emoji furniture, and a pin icon per destination (probably *drawn*
  alongside the interface set now that `icon-set.mjs` exists).

**Also open on the map itself, and neither is broken:**

- **The extent is `contain`.** On an 874x402 phone that shows ~76% of the
  map's width at level 0 against the 56% `mapExtentFor` asks for, so the
  reach progression reads more in the zoom than in the pin count. `cover`
  would honour the width and crop the height, which drops Wetlands off
  the 812x325 clip. An aspect-aware extent is the real answer.
- **The pin positions are placed, not surveyed.** All ten are on the
  ground their description claims — the previous set had two in the sea —
  but they are Marcus's to nudge, and there is now only one set to nudge.

**Still open from the layout work, and unchanged by the above:**

- **Cover versus contain** *for the room background*. It is stretched to
  the play box, not fitted — a 5.2% horizontal stretch at 752x402 against
  art authored at 1.78. The real answer is a uniform fit that crops, which
  means resolving anchors against the drawn art rect rather than the play
  box.
- **The right-hand and bottom safe insets** for the other landscape
  orientation — `ui/safe-area.ts` only reads `left`.
- **Whether an iPad wants this layout at all**, and **whether a
  seven-year-old can work a vertical rail** — the second is not a thing
  arithmetic answers and is the one that wants Marcus and a device.
  `VITE_SIDE_RAIL=0 pnpm build:ios` builds the bottom bar for a
  side-by-side.

**Settled, so they are not re-litigated:** the forecourt flanks get
commissioned art rather than the existing road furniture; Caveat's
`font-size-adjust: 0.49` goes with the paths/rewilding work, not before.

## Traps
- **A white icon needs somewhere to take its colour from.** Three call
  sites had been written for painted icons carrying their own colours and
  broke silently when the set became white line art: the status chips
  never tinted, the audio discs tinted only when *off*, and the nav
  rail's inactive discs sat at 0.55 alpha (1.9:1 under white). Anything
  new that draws an icon has to say what tints it.
- **Two identical blocks, and `str.replace` takes the first.**
  `renderParking` and `renderArrival` share their bay geometry verbatim,
  and a scripted edit aimed at the arrival landed in the departure. The
  typecheck caught it only because the new code referenced a variable the
  departure did not have. Anchor scripted edits on something unique.
- **When a Phaser object has the wrong properties and the code that sets
  them is provably right, look for a second writer.** `applyRoadSwitch`
  rebuilds `vanGfx` without going through `renderView`, on a 180ms delay,
  so it landed after the arrival and replaced the parked van with a road
  one. A `console.log` showed the arrival applying the correct scale to
  an object that was then thrown away. Guarded on the phase now — the
  timer was not the only way back in, so killing timers did not help.
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
