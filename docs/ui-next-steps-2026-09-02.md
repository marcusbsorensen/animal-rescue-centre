# A.R.C. UI — what is left, ranked

**Written 2026-09-02**, after the chrome surface landed and all twenty
pill titles moved onto it. Successor to `ui-audit-2026-08-31.md`, which
is still the reasoning; this is the queue.

Counts are exact and re-measured today. Judgements are mine.

---

## Where the audit's seven findings actually stand

| | Finding | State |
|---|---|---|
| §1 | Three visual languages | **Four, and three of them are gone.** Titles, plates and every button are one surface; `createButton` and `createPillTitle` are deleted. Depot and SupplyRun — the fourth language the audit never saw — are warmed up. The HUD and the nav bar are what is left. |
| §2 | 39 font stacks | **Done, and the finding was wrong twice.** The 24 shipping screens' *stacks* were already consistent; the variance was in two mockups, and the real network defect (36 screens fetching from fonts.googleapis.com) is fixed. The variance was in the **sizes** — 22 of them on the canvas, 252 sub-16 declarations on the DOM. Both now have a floor and a name. |
| §3 | Text on painted art | **Two of unknown.** Garden and species room are plated. Nobody has enumerated the rest. |
| §4 | Raw colour literals | **Untouched.** 658 raw `0xRRGGBB` against 287 `COLOURS.` uses — still about 70%. (The audit's 610/276 used a narrower grep; the ratio is what matters.) |
| §5 | Controls at the screen edge | **Done.** `ux-review.spec.ts` has no L3 finding left, from 1 FAIL and 15 WARN. The rule grew a second half — `createChromeButton`'s `anchor` — because `EDGE_CONTROL_INSET` only lands a control that is exactly `MIN_TAP`. |
| §6 | Kitchen ignores the play area | **Done.** |
| §7 | Emoji standing in for art | **Untouched.** Needs art, not code. |

---

## Decisions — all three settled 2026-09-02

1. **Depot and SupplyRun join the game's world.** Warmed up fully, not
   just their chrome. The Depot is a workbench in the corridor's own
   browns; the supply run is a daytime drive on `DRIVE_COLOURS`, the
   palette `PtvDriveScene` already uses. The commit lists the six defects
   the change exposed — all of them invisible while the grounds were dark.

2. **`chrome-views` merged to `main`.** Not behind a flag; this changes
   what a child sees.

3. **The sign fold is dropped.** `d22ef1a` stays on `side-nav-prototype`
   as history and is not coming to `main`. Live CSS on twelve DOM screens
   with ten never looked at is the thing this whole arc has been avoiding.
   Do not pick it up again without a reason that did not exist today.

---

## The queue

### 1. ~~See the chrome on a device~~ — the font question is answered
**Done 2026-09-02.** `ui-rounded` resolves in the app's WKWebView: 187.86px
against a 178.29px nonexistent-family baseline and 186.12px for plain
`system-ui`. The chrome renders in the rounded face on device, so the
sixteen screens are not carrying a shared mistake.

Two things fell out of the same probe:
- `"SF Pro Rounded"` by name does **not** resolve on iOS — it measures
  identical to a font that does not exist. Harmless, since `ui-rounded`
  precedes it, but it is not doing the work anyone would assume.
- The app's viewport is **874x402**, exactly what the harness shoots at.
  So Chrome captures at that size are geometrically faithful, which is
  what makes the whole capture workflow trustworthy for layout.

**Seen on device 2026-09-02**, iPhone 17 Pro simulator, landscape:
corridor, Dog Room, kitchen and garden all render the chrome surface
correctly in the rounded face. The kitchen's §6 fix is visible — art
stops at the play column instead of running under the rail — and the
garden's arrows sit clear of both edges. Nothing differs from the Chrome
captures, which is the useful result: the harness can be trusted.

Reached by seeding the session with the harness's own `mintRealSession`
into a temporary `public/__devsession.js`, the app-side equivalent of
`installSession`. Probe and seed both reverted; no token was committed.

Two things only the device showed:
- **The animal details card is white glass** with three flat buttons —
  one of the fourteen in-game overlays the audit never covered, and a
  large piece of §1 still outstanding.
- **The kitchen's Garden button icon really is broken**, not a capture
  artefact: two dots where the walk glyph should be. See item 4.

### 2. ~~Finish §2 on the DOM screens~~ — done
**Done 2026-09-02**, and it was not the job the audit described. See
`ca8c4fe` and `18342d9`. Three things worth carrying forward:

- The audit's "500 declarations, 39 stacks" counted two design mockups
  that never mount. The 24 shipping screens shared one value per property.
- The actual defect was the network: 36 screens still linked
  fonts.googleapis.com for Fredoka, Quicksand, Kalam and Gochi Hand, long
  after the canvas stopped. Device IP to Google on every cold launch — the
  Kids Category review risk `fonts.css` already names — and fallback
  typography until the request landed, permanently when offline.
- "TYPE YOUR NAME renders in system sans" was a misreading. It was
  Chalkboard SE, a macOS-only face that never reached the device. Dropped,
  so captures now tell the truth about the shipping typeface.

~~**Still open here:** the type scale is declared once *per screen*.~~
**Done 2026-09-03**, in item 6 below. The four families are in
`fonts.css`; the drift had already started (`tunnel.html` had lost
`--sign-title-font`, silently, because a missing custom property inherits
rather than errors).

### 3. ~~Retire `createButton`'s bevel~~ — done, bar two screens
**Done 2026-09-02.** 56 call sites across 22 files, all but the four in
DepotScene and SupplyRunScene, which are the deep-purple screens decision 1
is about. `createButton` stays until those move.

`createChromeButton` carries two weights on one surface — `plate` is the
cream paper, `filled` is the ink and the paper swapped. The dozen
`bgColour`s are gone, and what they carried splits in two: *which button
matters* is now weight, *which button is which* was always the icon and the
label.

The rule the sweep applied, written on `variant` in the source:

- **Plate by default**, on painted art and on bare cream alike. The worry
  that a plate would vanish on the game's own cream was drawn and looked at,
  not argued: a button carries a drop shadow as well as a hairline and reads
  as something raised. The "nearly invisible on flat-cream scenes" note
  further down is about title plates, which have only the hairline.
- **Filled for the one action a screen is for.** Two side by side spends
  the emphasis.
- **Filled throughout on a surface that is already a plate** — the left
  rail, the Games popup, the animal card. A plate there is a frame inside
  a frame.

Three things fell out of it:

- **The icon set has two kinds, and only one survives on paper.**
  `icon-back`, `icon-accept` and `icon-walk` are white line drawings made
  when every button had a dark fill. `iconStyle: 'glyph'` tints them to
  whatever ink the button is already setting its label in, so one asset
  reads dark on the plate and cream on the filled button. The painterly
  icons keep their own colours; tint multiplies, which is right for line
  art and ruinous for anything painted.
- **The Phaser PIN keypads set white type on `#f5efe4` — 1.06:1.** Both
  LoginScene and SignupScene. Behind `USE_OVERLAY = true`, so no child has
  seen it, but it is what renders the day the DOM board fails. Fixed by the
  conversion.
- **`animalCard()` destroys the card it is asked for.** It calls
  `destroyAnimalCard()` and returns a fresh empty container, so reading the
  card through it deletes the card. Cost four blank captures. Read
  `animalCardContainer` instead.

### 4. ~~The kitchen's Garden button icon~~ — done, and it was the asset
**Done 2026-09-02**, and the diagnosis above was wrong twice over.

Not `createButton`'s icon scaling: `icon-walk.png` had 69x34 of drawn
content adrift in a 128x128 frame and off-centre, so scaling the *frame* to
a 24px box drew the paw at 13x6px. Cropped to its content, centred, and
scaled to the ~70% the rest of the set fills.

And not only the kitchen — WalkScene draws the same key on "Let's go!". The
nav bar looked fine because it never draws `icon-walk` at all: `nav-play.png`
exists and wins the fallback chain ahead of it. So "the nav bar draws the
same key correctly" was comparing against something that never ran.

### 5. ~~Sweep the edges with the harness holding it~~ — done
**Done 2026-09-03.** 3 FAIL / 107 WARN → **0 FAIL / 86 WARN**, and L3, the
edge rule this item is about, has no findings at all.

Four things were in the margin: the arrivals pull-tab flush at x=0 (its
inset was `safeAreaLeft` alone, which is zero in one of the two landscape
orientations); the three Back buttons positioned by guessed half-widths of
53/58/59 against drawn widths of 108/119/121; four DOM clamps flooring at
10 or 12 across twelve sign screens and the tunnel overlay; and the rail
card's Welcome button 4px from the card body, the game's only T4 failure.

`EDGE_CONTROL_INSET` was not enough on its own, which is worth knowing
before reaching for it: it lands the outer edge on `SAFE_MARGIN` for a
control exactly `MIN_TAP` in that axis and nowhere else. PtvDrive's Back
button is 52 tall and centring it on the constant left 14px. The second
half of the rule is `createChromeButton`'s `anchor` — name an edge and the
button measures itself and puts that edge on the coordinate you wrote.

**Two things deliberately left:**
- **The side-nav tab is still flush to the right edge.** Insetting it costs
  16px of a play box whose whole claim is that room art fits it — 696x402,
  1.77 against art authored at 1.78. That edge is not scored by the harness.
  If it is ever worth the 16, the art fit is what pays; decide it there.
- **Moving the rail shifted the corridor's fractionally-anchored sprites**,
  which put one arriving animal 8px from another control. A new T4 warning,
  in the sprite-placement system rather than at an edge.

**What is left, re-measured 2026-09-03 after item 6:** 7 T4, 5 L9, 4 L8,
3 L6. The three F rules are at zero. What remains is layout — and four of
those nineteen are the corridor's fractionally-anchored sprites, already
named above.

### 6. ~~Typography~~ — done, and the floor was the whole finding
**Done 2026-09-03.** 86 WARN → **19**, 0 FAIL held. Nothing left under
F1-F5, F6 or F7.

The 41 F1-F5 warnings were one number. Every one read "smallest 14px" —
not one screen under it and not one over it, because `MIN_FONT.small` was
14, the checklist's *warn* mark, and 104 call sites sat exactly on it. A
floor set at the bottom of the comfortable range stops being a minimum and
becomes the default. It is 16 now, the pass mark, in two places that name
each other: `MIN_FONT.small` for the canvas and `--fs-floor` in
`fonts.css` for the DOM.

Underneath it the canvas had **22 distinct font sizes across 329 call
sites**, each picked at the point of writing. `TYPE` names the steps;
the 110 sub-16 literals are on `TYPE.caption` and the 58 already on
`MIN_FONT.small` came with the constant. The steps above `lead` are named
but not swept onto — that is the job left, and it is aesthetic rather than
accessibility.

On the DOM, only the **first term** of each `clamp()` moved. The shapes
were right: a sign title that grows to 21px on a tall viewport is doing
what a container query is for. Three clamps had a maximum *below* their
own minimum (`clamp(14px, 1.5cqh, 13px)`), which CSS silently resolves to
the minimum — invisible until something enumerated them.

Four things worth carrying:

- **`_short-landscape.css` is where the phone's type comes from.** It is
  linked after every page and wins on the short viewport, so the first
  pass — 237 declarations across 24 files — left the phone still at 14 and
  the review still reporting it. Edit that sheet *with* the pages.
- **F6 was scoring emoji.** Ten of its eleven findings were single glyphs
  (🔊 🐾 🌾 💊), which render from the system emoji font whatever family
  is named. The eleventh was the rewilding ceremony's own lettering and
  Lily's signature, in the handwritten faces `FONTS.chalk` exists to name.
  The rule knows about the game's three registers now — rounded, hand,
  and the one monospace string (the friend code, where 0/O has to be told
  apart).
- **Forty `add.text` calls named no family**, so Phaser's `Courier`
  default drew them. Harmless today because all forty hold emoji; a latent
  trap the moment one gains a letter.
- **`e2e/dom-type.spec.ts` reaches 25 DOM screens.** `ux-review.spec.ts`
  measures what GameScene can open, which is twelve — charm-select shipped
  at a flat 14px and pre-drive's vehicle locks at 11px, and no harness
  could have said so.

**Seen on device 2026-09-03**, iPhone 17 Pro simulator, Mobile Safari via
the `mintRealSession` seed page: menu, intro and corridor all render in
Nunito/Kalam/Gochi Hand at the new floor, with the hoisted families
resolving from `fonts.css`. Portrait only — landscape needs Marcus's
Cmd+Left — so this confirms the *faces and sizes*, not the landscape
layout, which the Chrome harness already covers at the true 874x402.

### 7. ~~Composition~~ — most of a review applied, four items left
**2026-09-04.** A subagent reviewed the layout of fourteen screens against
the measured report and the source. Its findings, and what happened to them.

**Two were about the instrument, and both were right.**
- **16 of 42 pairs were one stuck frame.** Growing the viewport never
  reached Phaser's Scale Manager, and the suite ran small → larger →
  largest, the only order that hides it. Eight tablet captures and eight
  desktop ones were byte-identical. Every iPad judgement in three sessions
  came from that frame. `resizeGameTo` polls until Phaser agrees now, and
  throws with both numbers rather than continuing.
- **The suite never shot a shipping viewport.** 812x375 belongs to no
  target. It runs 874x402 (the app) and 812x325 (the clip) now, which
  surfaced two FAILs on viewports that had never been measured.

**Fixed, system-wide:**
- **Three vertical centre-lines became one.** Title 473, HUD pills 458, nav
  bar 437 — the bar centred on the screen while everything else centres on
  the play area, and the two HUD pills were each placed 6px from centre
  while being 160 and 130 wide. On an iPad the bar was 148px out.
- **`SPACE`, `PAGE_MARGIN`, and `TITLE_CY` for all 29 titles.** There were 17
  outer margins, 18 radii and 8 title y-values.
- **One exit control** — bottom-left, "Back". It had five placements and
  four labels.
- **`contentTopFor` and `bandCentreY`.** Moving the titles broke two screens
  because each held the title's y *twice*, and that shape kept recurring:
  Social's tab row, the kitchen's panel, Account's `pillsBottom`. Blocks
  take the bottom of the block above them now.

**Fixed, per screen:** SupplyRun's cards overlapped by 31px so a tap started
the wrong run (the Depot carried the same bug unfired); "Supplies" sat 13.5px
above the four labels beside it; the kitchen's tray was sized to the screen
and covered three of four drop targets; Social's tabs were the only
square-cornered controls in the game; the rail tab was centred on the wrong
box; Account's title overlapped its card by half a pixel; the tunnel's art
printed over its own heading; and **the sign column had never been centred on
any of the twelve screens that use it** — a block child with `margin: 0`
under a parent whose `text-align: center` does nothing for it.

**The four that were left are done — 2026-09-04.** ux-review went 2 FAIL /
18 WARN → **2 FAIL / 16 WARN**; the two that cleared are the corridor's, and
the two that remain are the paths screen's L3, which nothing here touched.

- **The corridor's animals overlap the door signs.** Not an art decision in
  the end. The arrivals were the one block in the game that never got "a
  block takes the bottom of the block above it", because they are anchored
  rather than stacked — and on a short viewport `anchorSpaceFor` compresses
  the anchor space to the play band while the sprite stays 55% of that band,
  so the gap from the sign row to the floor (0.43 of the band) was smaller
  than the animal standing in it. The arrival is capped by its own headroom
  now, floored at `MIN_TAP`, keeping `MIN_TAP_GAP` off the signs, and steps
  sideways into the nearest gap where even that will not fit. The anchors
  keep x and their staggered depth in y. **Shrinking turned out to be the
  honest fix**: an animal at a door at the back of the corridor is behind the
  signs, and one drawn nearly door-height was never in perspective.
- **PtvDrive's picker** has a title plate at `TITLE_CY` with the destination
  on the subtitle line, chrome-plate unlock chips, and a building that fills
  the band from the title to the bays with its base running under the tarmac
  — the slab draws after it, so the car park crops its ground line. Stacked
  strictly above the bays it measured 141px, *smaller* than the 185 it
  replaced; the crop is what buys the height back.
- **The map's tab strip** is gone. The tabs float over the map as chrome
  plates, the map has its 67px back, and the tabs hide on the A.R.C. site
  stage, which carries its own "Back to map" — one exit control.
- **`createPanel` is deleted.** All 17 callers took `createChromePlate`.
  Three carried valence in the border and it moved to the ink; one carried
  *selection* in the fill, so the plate gained the `variant: 'plate' |
  'filled'` pair the button already had.

**One finding measured false.** "waiting" on the rail tab was called ~58px in
a 56px tab; measured, it is 55.8. Widening would have cost 4px of a play box
already at 1.73 against art authored at 1.78.

**Also still open:** the tablet and desktop *captures* remain one frame even
though their measurements are now right — `renderer.snapshot()` hangs on a
throttled rAF and `preserveDrawingBuffer` would mean changing the shipped
config for a test. So the iPad cannot be *looked* at yet, only measured.

### 7b. What the composition pass left behind
Two things, both recorded rather than fixed, because both are decisions
rather than coordinates.

- **The drive picker's forecourt flanks are bare** either side of the
  building — the part of "55% of the top half" that a layout change cannot
  reach. It is a car park, and a car park has furniture: `decor-barrier`,
  `decor-bollard`, `decor-cone` and `decor-cones-three` are already painted
  and already loaded by that scene. Whether the flanks want dressing or are
  simply forecourt is Marcus's call; nothing is broken either way.
- ~~**The side-nav layout is the real fix for the class of bug item 7's
  first entry belongs to.**~~ **Shipped 2026-09-04.** It is the default
  layout; `?sideRail=0` puts the bottom bar back and the choice is
  remembered, because the bar is what three sessions of measurement were
  taken against.

  The play box goes 768x362 (aspect 2.12) → 752x402 (1.87 against art
  authored at 1.78), the anchor rect and the art rect are the same rect,
  and `anchorSpaceFor`'s compromise has nothing left to correct. Room,
  Kitchen and Garden were converted with it, which was the last of the
  design note's "other views".

  **The chrome was redesigned with it** — Marcus's brief, 2026-09-04: a
  colour per nav destination, the room title left-aligned onto the rail,
  the world's state as wordless icon chips beneath it, one player panel
  top-right in place of the vertical pull-tab, and the two sounds as
  separate toggles with a long-press volume. See the commit; the reasoning
  is on the code.

  ux-review holds at 2 FAIL / 14 WARN, better than the bottom bar's 16, and
  five of the fixes in that pass were findings the harness produced the
  first time it measured this layout.

  **Still open, and now the load-bearing one: cover versus contain.** The
  room background is `setDisplaySize(play.w, play.h)` — a stretch, not a
  fit. At 696 wide it was a 2.8% squash; at 752 it is a 5.2% stretch, so
  losing the tab moved the box *past* the art's shape rather than towards
  it. Both are invisible beside the bottom bar's 19%, and the real answer
  is a uniform fit that crops, which has no stretch at any aspect. Taking
  it means resolving anchors against the drawn art rect rather than the
  play box, which is why it is not something to do in passing.

  Also still open from the design note: the right-hand and bottom safe
  insets for the other landscape orientation, whether an iPad wants this
  layout at all, and whether a 7-year-old can work a vertical rail — the
  last of which is not a thing arithmetic answers.

- **An effects icon is missing.** The sound toggles carry words because
  `icon-music-on`/`off` exist and nothing does for effects. Pair the ask
  with the forecourt flanks and item 10's emoji furniture — one
  commission, three jobs.

### 8. Enumerate the rest of §3
Two instances are plated; nobody knows the denominator. The species room
one had never been *seen* — it took fixing the walk harness to find it.
Now that `ui-audit.spec.ts` and `scene-walk.spec.ts` both pass end to
end, the captures exist to go through.

### 9. Use the palette
658 raw literals against 287 token uses. Invisible individually,
compounding across screens, and entirely mechanical now that `hexNum`
exists to bridge `COLOURS` into the Phaser side.

### 10b. ~~The interface icons~~ — drawn, 2026-09-04
**Marcus's brief:** the set does not work at small sizes, the "cute
cottage" detail being the reason. Confirmed exactly: every button icon
renders at **24-26px** (`UIButton.ts:196,454`) and the set was painted at
128px, so five-sixths of every icon was thrown away before a child saw
it. A painted commission would have failed the same way, which is why
these are **drawn** — `tools/icons/icon-set.mjs`, 53 icons as geometry on
a 24px grid with a 2px stroke, rasterised at 4x by `build-icons.mjs`.

They are white on transparency and take their colour at draw time, which
is the system that already existed for three assets: `iconStyle: 'glyph'`
tints to the button's ink, so one file is dark on a plate and cream on a
filled button. **Glyph is the default now**; `artwork` is the exception.

Three call sites had been written for icons carrying their own colour and
broke the moment the set was white — the status chips never tinted, the
audio discs tinted only when *off*, and the rail's inactive discs sat at
0.55 alpha (1.9:1 under a white icon). All three fixed; see the commit.

**Closed two art gaps on the way:** `nav-map`, which the rail had been
drawing as a lettered disc, and an effects icon — the two sound toggles
wore the same music note because nothing had been drawn for effects.

**Still painted, deliberately:** the animal portraits, the four
`icon-resolve-*`, the species door signs and `sundial`. Those are content
at 128-512px, not interface, and flattening them would lose real quality.
`PAINTED_CHIP_ICONS` in HUDView is the guard for the one that shares a
chip with the drawn set.

### 10c. ~~Buildings for the destinations~~ — commissioned, 2026-09-04
All ten arrivals have art. Briefed against the real vernacular of
Birchington-on-Sea and the Isle of Thanet rather than generic cottage —
knapped flint with red brick quoins and dressings, Kent peg tiles, black
tarred weatherboarding, oast cowls, stuccoed seaside villas with canted
bays, and a nod to Birchington's 1870s bungalows.

- Five **buildings** as flat front elevations, matching
  `site-arc-building.png`'s ink-and-watercolour hand:
  `site-{vet,village-hall,bramble-farm,cove-harbour,pinebark-medical}-building.png`.
- Five **habitat vignettes** — Marcus's call that a wild destination is
  the place itself, not a structure: `site-<id>-place.png`. The arrival
  tries `-place` then `-building`, and a habitat gets a chalk pull-in
  rather than tarmac bays, because four white-lined parking spaces across
  a moor say retail park.

Three layout defects fell out of putting real art in the slot, all
recorded on the code: the message plate printed across every shopfront
(it is at the top now — the building carries its own sign and that is the
one thing the message must not cover); `setDisplaySize(target, target)`
squashed anything not square; and the building was fitted strictly above
the message at 158px on an 874-wide screen, where the drive picker had
already settled that a building runs down behind its own tarmac.

**What is left here:** the buildings are one render each and have not been
seen on a device. The A.R.C. building is a slightly softer, lighter hand
than the five new ones — they read as a set with each other, and the
question of whether A.R.C. wants re-rendering to match is Marcus's.

### 10. Retire the emoji furniture
§7. Needs commissioned art for anything missing, so it is a lead-time
item — worth starting the ask early even though the code is last.

**Four of the six jobs are done** (2026-09-04 — see 10b and 10c). What is
left:

1. ~~A music note / effects icon for the sound toggles.~~ Drawn.
2. **The drive picker's forecourt flanks** (item 7b) — still bare.
3. **This item's emoji furniture** — the in-world props, which are the
   part that genuinely wants painting rather than drawing.
4. ~~`nav-map`.~~ Drawn.
5. ~~A building per destination.~~ Commissioned, all ten.
6. **A pin icon per destination.** The map pins still carry the same
   emoji this item wants retired. Lower priority: a 21px emoji in a cream
   disc reads acceptably. Now that `icon-set.mjs` exists, these are
   probably *drawn* alongside the interface set rather than painted.

### 11. ~~The map becomes the mission hub~~ — shipped, bar the art
**Done 2026-09-04.** Every pin is a place, tapping one drives there, and
arriving opens what is inside. ux-review holds at **2 FAIL / 14 WARN**,
the same as the side-nav baseline; 1199 tests, typecheck clean, no new
lint warnings.

The rail is **Home / Care / Walk / Map**. Social is the village hall on
the map. Heal opens the map with the poorly animal aboard.

**Six things it turned out to need that the plan below did not list.**

- **The drive had no end.** `drive.progress` clamped at 1 and the road
  kept scrolling — invisible while the only way in was `?ptvDemo=1` and
  the only way out was Back. `renderArrival` is the mirror of
  `renderParking`: the van comes off the road, swings into a bay and
  stops in front of the building, then "Go inside" hands back. Marcus's
  call, and the right one — the arrival is a beat, not a transition.
- **`applyRoadSwitch` runs 180ms after `switchRoad` schedules it**, and
  it rebuilds `vanGfx` at road geometry *without going through
  `renderView`*. A road change beginning in the last moments of a route
  therefore landed on top of the freshly-drawn forecourt and swapped the
  parked van for a road one. Every number in the arrival was correct and
  the arrival was demonstrably the last thing to render, which is what
  made it expensive. Both halves are guarded on `phase === 'travel'` now.
- **Three tables held the same positions and two of them disagreed.**
  `destinations.ts`'s abstract `mapX/mapY` (coast at the bottom),
  `birchie-places.ts`'s `BIRCHIE_PLACES` (coast at the top), and
  `map.html`'s own `ARC_PLOT_SVG_X/Y`. The last is the only one derived
  from anything — the real OSM plot polygon — so it won: `arc` is
  `fx 0.1811, fy 0.3541`, `ARC_PLACE` reads it, and the other two are
  gone. **The GPS had been starting every route a tenth of the map east
  of the building.**
- **Half the destinations were in the sea.** Cove Harbour and Sea Cliffs
  were in open water and Moorland was on the waterline; nothing had ever
  drawn them, so nothing had ever said so. All ten are placed against the
  drawn map now. Still Marcus's to nudge — but there is one set to nudge
  and it is on land.
- **The tab strip ate the pins under it**, and it sat in the Dynamic
  Island's band (x 14–50pt) besides. The tabs are top-right now, and a
  pin that would fall under chrome or off the frame comes inside —
  measured after layout, because a pin is as wide as its *name* and
  "Pinebark Medical" was reading "Pinebark Medic".
- **The old painted cutscene carried real rewards** — +1 happiness, the
  first-drive flag, three charm events — and it was the only drive in the
  game that ever finished, so it was the only place that could pay out.
  They are on `rewardSafeDrive` now, which every arrival calls.

**What is left on this item.**

- **`openDriveOverlay` has no caller.** 828 lines of `drive-overlay.html`
  and its mount, kept rather than deleted because the cutscene's arrival
  beat is what Marcus asked for and the per-destination forecourts are
  unpainted. Decide it on a device: delete, or revive as a painted layer
  in front of the Phaser arrival. Do not leave it in this state.
- **Art, and it is the whole remaining gap** — see the commission list
  below. A destination with no building draws a chrome signboard with its
  emoji and name, which is honest and is not a forecourt.
- **The map extent is `contain`, not `cover`.** On an 874x402 phone that
  means the frame shows ~76% of the map's width at level 0 against the
  56% the model asks for, so the reach progression reads more in the zoom
  than in the pin count. Cover would honour the width and crop the
  height, which drops Wetlands off the bottom of the 812x325 clip. The
  real answer is an aspect-aware extent; the current one is correct and
  merely generous.

---

### 11 (original brief, kept for the reasoning)
**Marcus's brief, 2026-09-04.** Social comes off the rail and becomes a
place on the map — a village hall. Map takes its slot. Destinations show
on the map and build up in number *and in reach* as the level rises.
Tapping one drives there. The vet becomes one of them, so taking a poorly
animal to the vet is a journey rather than a button on its card.

The rail stays four: **Home / Care / Walk / Map**, which is exactly what
fits (see `NavRailView`'s four-not-five arithmetic).

**This is mostly wiring, not building.** Three finished things are sitting
unreached, and this is the feature that connects them:

- **`openMapOverlay()` has no caller** (`GameScene.ts:1388`) — the map is
  unreachable from any game UI.
- **`PtvDriveScene` has no `scene.start` anywhere.** The whole driving
  engine is reachable only under `?ptvDemo=1` (`main.ts:52`).
- **`getAvailableDestinations(level)`** is written, exported and used
  **only by tests** (`packages/game-logic/src/destinations.ts:187`).

And the contract between map and game is already specified from both ends,
with the middle missing:

- GameScene **sends** `{ context, playerLevel }` to the overlay on init
  (`GameScene.ts:1408`) — and `map.html` ignores it.
- GameScene **listens** for `drive-to` with `payload.destinationId`,
  resolves it through `getDestination`, and then shows a
  **"Drive to X coming soon!" toast** (`GameScene.ts:1392-1399`).
- `map.html` **never posts `drive-to`**. Its only outbound message is
  `open-tunnel` (`map.html:1191`).

**What exists to build on**

- `DESTINATIONS` — `packages/game-logic/src/destinations.ts:54`. Nine
  places with `id, label, emoji, kind, description, distance, unlockLevel,
  mapX/mapY, suitableSpecies`. Unlock levels 0-10. This is the model the
  brief describes and it is already written.
- `BIRCHIE_PLACES` — `src/driving/birchie-places.ts:28`. Nine `fx/fy`
  fractions of the map image, **keyed by the same ids**. Its header flags
  the positions as provisional, and warns that `destinations.ts`'s
  `mapX/mapY` is a *different, non-matching* abstract layout — so pick one
  and delete the other rather than letting two disagree.
- `map.html`'s pin layer — `#pin-layer` at `map.html:805`, `.pin` CSS at
  307, `placePins()` at 1147 draws exactly **one** hardcoded pin (the
  A.R.C. building) whose click switches stage locally.

**The shape of the work**

1. `placePins()` takes a list instead of a constant, positions from `fx/fy`,
   and posts `drive-to` on tap. It already receives `playerLevel` on init;
   it needs to start reading it.
2. GameScene's `drive-to` handler replaces its toast with
   `scene.start('PtvDriveScene', ...)` — the destination id is already
   resolved there.
3. Social becomes a destination (village hall) and comes off the rail. It
   is trivially movable: `SocialScene` is self-contained, takes no payload,
   has one entry point and one `scene.start('GameScene')` back.
4. The vet becomes a destination; the animal card's Heal sends you to the
   map rather than straight to `VetScene` (`GameScene.ts:997`).
5. Reach: both the pin count and the visible map extent grow with level.
   Locked pins stay visible so a child can see what she is working towards.

**One thing to tidy while in here: there are four unrelated "unlocks at
level N" tables** — `SUPPLY_DESTINATIONS` (`supply-runs.ts:22`),
`VEHICLE_DEFS` (`crate-stacking.ts:146`), `DESTINATIONS`
(`destinations.ts:54`) and `MODE_UNLOCK_LEVELS` (`depot-inventory.ts:175`)
— and `DepotScene.ts:325` hardcodes its number in the label rather than
reading its own table. The supply-run destinations and the world
destinations overlap by name (`bramble_farm` / `Bramble Farm`) and are two
different records of the same three places.

---

## Smaller things, carried

- **The garden's count line** sits at y=95, inside the HUD's second row
  (phase and weather pills, y 78..106), which draws on top of it. Its x
  is fixed. Its y wants deciding with the HUD, not locally.
- **"Garden — Quiet nook" abuts the "0 in care" pill.** Longest title in
  the game against the HUD's 600px-centred gap. The chrome plate is 20px
  narrower than the pill it replaced, so this is better than it was — but
  any longer title collides.
- **LoginScene and SignupScene are converted but unlooked-at.** The walk
  harness starts a scene without `unmountAuth()`, so the DOM sign boards
  sit over them. They are live fallbacks from MainMenuScene and
  ForgotPinScene, not dead code.
- **The chrome plate is nearly invisible on the flat-cream scenes** —
  Account, Friends, Social. Text clears 12.56:1 so nothing is unreadable,
  and strengthening the plate would cost legibility over painted art,
  which is the case it exists for. Understated, not broken. Recorded so
  it is not "discovered" again.

## Housekeeping

- ~~`createPillTitle` has no callers. Delete it.~~ Deleted.
- ~~`createButton` is the last bevel.~~ Deleted; no callers.
- ~~`createPanel` has 20 call sites left; they want `createChromePlate`.~~
  Deleted 2026-09-04; all 17 remaining callers converted.
- `e2e/visual.spec.ts`'s `main-menu` baseline was stale — failing at
  `2660130` before this session touched anything, so it had stopped
  catching regressions. Re-shot 2026-09-03 with `ARC_BROWSER_CHANNEL=chrome`,
  which is not the pinned bundled Chromium the config says the baselines
  were shot against. CI ignores that spec, so this is a local check only.
- `e2e/chrome-buttons.spec.ts` shoots the overlays `ui-audit.spec.ts` never
  opens — the animal card, its More grid, the Games popup. The Phaser login
  keypad in it needs `USE_OVERLAY` flipped to false by hand and skips itself
  otherwise.

## Environment, so it is not rediscovered a third time

- Playwright's bundled browsers do not install on this machine — the
  headless shell stalls and `chromium-1217` is missing its Framework.
  `ARC_BROWSER_CHANNEL=chrome` is the supported way round and works.
- WebGL does not initialise in the Claude browser pane; Phaser sticks in
  BootScene with "Framebuffer status: Incomplete Attachment". Use
  Playwright or the simulator.
- Both of these were already in `.claude/TRAPS.md` and were rediscovered
  the slow way anyway. Read it first.
