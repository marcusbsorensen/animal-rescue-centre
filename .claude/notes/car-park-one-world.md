# The car park: one vehicle, whole, in one world

Branch `claude/car-park-uncropped`, 2026-10-09. Based on `claude/crate-loading` at `f835b2b`. Not pushed.

Marcus's two instructions this note answers:

1. "We need to stay within the 3D world or simulated 3D world of the game at all times. We don't show cropped versions of things. Instead, we work with real scenes with real interactions in them." Now `docs/manus-sprite-rules.md` Rule 8.
2. "We don't need to show other vehicles in the parking lot. We can just zoom in on the one that is currently being loaded. but also have some arrows next to it so that the child can quickly move to the next parking lot with the next vehicle in it in case they want to load fewer or more animals, then we don't need the metaphor of the rest of the building, nor the road showing in front of the vehicle since we're just zoomed in on that for the loading game."

## 1. What is in the branch

| File | What it does now |
|---|---|
| `apps/game/src/driving/car-park.ts` | One bay: tarmac, two side lines and a head line measured in metres off the vehicle's own width, the vehicle parked whole in the middle of the ground. No neighbours, no kerb, no gravel strip, no road. Draws the two arrows when given `onVehicleChange`. |
| `apps/game/src/driving/fleet-art.ts` | `VEHICLE_VISIBLE_FRAC` is 1 (was 0.78). New `wholeVehicleHeight()` and `minScaleForBays()`: how tall a vehicle must be drawn for its bays to be tappable, one formula shared with `fitLoadBed`'s growth. |
| `apps/game/src/driving/forecourt.ts` | `drawApron(..., { kerb: false })`. `drawVehicleShadow` now throws the vehicle's own silhouette instead of an oval. |
| `packages/game-logic/src/vehicle-change.ts` (new) | `VEHICLES_BY_ROOM`, `vehicleNeighbours()`, `changeVehicle()`. Exported from the package index. |
| `packages/game-logic/src/__tests__/vehicle-change.test.ts` (new) | 19 tests. |
| `apps/game/src/driving/__tests__/fleet-art.test.ts` | Rewritten where the kerb was the premise, with the reasons in the file. Net 17 more tests than before. |
| `apps/game/tools/shoot-car-park.mjs` (new) | Photographs the screen and prints whether the vehicle is whole. Walks the arrows by plate, real mouse or keyboard. |
| `docs/manus-sprite-rules.md` | Rule 8. |
| `crate-loading-view.ts` | Untouched, as asked. |

`pnpm typecheck` passes. `pnpm test`: game-logic 903 passed (19 new), game 448 passed (17 new over the 431 baseline). Lint has no errors and no warnings in the files touched.

## 2. Why Henry was cut off

Three decisions stacked, all in the code that draws the picture:

1. **`VEHICLE_VISIBLE_FRAC = 0.78`.** The loading view fitted the vehicle to `(column.h - 42) / 0.78`, a box 28% taller than the column the child could see.
2. **The far kerb and 42px of gravel** took the top of the column, so the ground ended before the vehicle did.
3. **`setCrop` at `park.kerbY - 2`**, in `crate-loading-view.ts`'s `drawVehicle`, cut the sprite where the tarmac stopped.

Measured before the change, 820x620: Henry drawn 161x376 from y=158, tarmac ending at about y=428, so 106px of 376 (28%) gone: bonnet, lamps and most of the windscreen. At 1024x700 the same, 622px drawn into a visible band of 484. It was not a fixed-height cell and not a mask. It was a deliberate trade of bumper for backdrop, documented in `fleet-art.ts` as "what goes is the bumper", and the trade is the thing Marcus has now ruled out.

The fix is the design change Marcus asked for. With no backdrop to pay for, the fraction is 1, the vehicle is fitted to the column less a margin of ground fore and aft (`carParkBackdropH`, 4% of the column a side, 8 to 20px), and parked in the middle of it (`vehicleParkTop`). A test holds the fraction at 1.

**Result, from the page's own display list** (`tools/shoot-car-park.mjs`, `cropped` is `GameObject.isCropped`):

| Vehicle | 820x620 | 1024x700 |
|---|---|---|
| Trikey | 132x309, whole | 208x487, whole |
| Henry | 132x309, whole | 209x487, whole |
| Bea | 132x323, whole (5px of ground each end) | 199x487, whole |
| Big Tilly | 110x309, whole | 174x487, whole |
| Spark | 123x361, **cropped** at the ground edge | 167x487, whole |

## 3. What cannot be whole, and why that is the layout's to fix

**Spark at 820x620 is still cropped, and every vehicle on a landscape phone.** This is arithmetic, not a bug.

`wholeVehicleHeight` is how tall a vehicle has to be drawn for its bays to reach the 40px tap floor. It does not depend on the screen:

| Vehicle | Whole height needed | Column at 820x620 (334) | Column at 1024x700 (526) |
|---|---|---|---|
| Trikey | 273 | fits | fits |
| Henry | 255 | fits | fits |
| Bea | 323 | fits with 5px each end | fits |
| Big Tilly | 308 | fits | fits |
| Spark | **361** | **27px short** | fits |

Spark is the longest vehicle (2.92:1) with the narrowest bed as a share of her width, so she needs the most height. To give every vehicle its full 13px of ground at 820x620 the column would need 387px (Spark) and 349px (Bea): 53px and 15px more than the 334 the layout hands out. On a landscape phone (874x402) the column is 144px and every vehicle needs 255 to 361, so every one overflows. **Before my change this was already the case on the phone**: the lorry's lower bays spill over the tray label and below the ground in the `before` capture. It is not a regression, and it is the one place where Marcus's "nothing is cropped" and the project's 40px tap floor cannot both hold with the present layout.

When they collide `fitLoadBed` still keeps the bays at the floor, pins the vehicle's rear to the top of the ground so the bays are whole, and the front runs off. I did not weaken that: the floor protects the children, and I will not make that trade silently.

A test lists the one exception (`NOT_YET_WHOLE`), so the day the layout gives Spark her height the test fails and says to delete the entry, and a new vehicle that does not fit is a failure rather than a surprise.

## 4. Decisions for Marcus (recommendation first)

1. **Spark at 820x620 (and the phone): how should the collision between "nothing cropped" and the 40px tap floor resolve?**
   - **A. Give the column the height (recommended for 820x620).** 387px for Spark. Keeps both principles. It is a change to `crate-loading-view.ts`'s layout: `wholeVehicleHeight(id, cols, rows) + carParkBackdropH` is the number to ask for, so the layout can size the column per vehicle instead of guessing.
   - B. Relax the bay floor to about 34px. The 48px hit areas are unchanged and overlap each other by about 6px, entirely inside the 8px gap between bays, never over a drawn bay. Spark then needs 311px and stands whole at 820x620 with 11px of ground each end (at a floor of 36 she needs 328, with 3px). Every vehicle's bays shrink with it, not only hers, and it is a rule change for a children's tap target, so it is his call.
   - C. Leave it cropped on those screens. The current state.
   - The phone needs an answer of its own under any of these: 144px of column cannot hold a 255px vehicle.
2. **Do the arrows skip vehicles the child has not unlocked?** I built it that way (`playerLevel` option; omit it for the whole fleet), because the picker cones locked vehicles off for the same reason. The cost is that the arrows never show what she is working towards.
3. **Bea to Spark is "more" but both hold six.** The tie is broken by unlock level, so Spark follows Bea. The plate says "6 spaces" so nothing is hidden. Say if Spark should come first (she costs 5 fuel against Bea's 10).
4. **The panel heading for a vehicle change.** A notice with `level: null` draws the heading "Wait a Moment", which is wrong for "Trikey has 2 spaces, so Clementine is waiting to board again." The notice type has no `heading`; adding an optional one is a small change in `crate-loading-view.ts`. Suggest "Trikey Has 2 Spaces".

## 5. What to call when you merge (you wire it; I did not touch the view)

The brief called Bea the small van and Henry the long van. The code has it the other way round, and the capacities are the code's: `small-van` is **Henry, 4 spaces**; `long-van` is **Bea, 6**. Order, fewest first: Trikey 2, Henry 4, Bea 6, Spark 6, Big Tilly 8. (`.claude/HANDOVER.md` says Big Tilly holds 9; that is stale, `VEHICLE_DEFS` says 8.)

**In `crate-loading-view.ts`:**

```ts
// CrateLoadingCallbacks
onVehicleChange: (to: VehicleType, direction: VehicleDirection) => void;
// CrateLoadingState
playerLevel?: number;
// the drawCarPark call, which is already there
const park = drawCarPark(scene, container, {
  width, height, column, chosen: vehicle.id,
  spriteW: fit ? fit.spriteW : column.w * 0.42,
  onVehicleChange: callbacks.onVehicleChange,   // draws the arrows
  playerLevel: state.playerLevel,               // arrows skip locked vehicles
});
```

`VehicleDirection` (`'fewer' | 'more'`) is exported from `car-park.ts`. Leave out `onVehicleChange` and no arrows are drawn, so a screen that is not wired shows no control that does nothing. Nothing else in the view needs to change: `drawVehicleShadow` finds out which vehicle it is shading from a note `drawCarPark` leaves on the container, so the silhouette shadow works with the call as it stands.

**In `PtvDriveScene.renderLoading`:**

```ts
onVehicleChange: (to) => this.changeBay(session, to),
// state: playerLevel: this.playerLevel,

private changeBay(session: LoadingSession, to: VehicleType): void {
  AudioManager.getInstance().playSfx('button_click');
  const out = changeVehicle(session, to);      // from @arc/game-logic
  this.vehicleId = to;
  this.loadSession = out.session;
  this.loadNotice = out.message ? { level: null, text: out.message } : null;
  this.renderView();
}
```

The arrows are rebuilt on every redraw, and the keyboard listeners go with them (the scene's `container.removeAll(true)` destroys the arrows, which let the keys go), so there is nothing to tear down. Verified: in a keyboard walk every press that could move the vehicle moved it exactly one step and none doubled after a redraw.

**The overflow rule, `changeVehicle(session, to)` in `packages/game-logic/src/vehicle-change.ts`.** Returns `{ session, kept, returned, message }`.

- Keeps what fits **in grid order**, row by row, left to right; the rest go back to the waiting area (their crates leave the grid and they are in the tray again, still one tap from being put back).
- **Nobody moves who does not have to.** An animal whose own row and column exist in the new vehicle sits in the same place. Between the two-wide vehicles (all but Trikey) that is everyone: Bea to Spark moves nobody, Henry to Big Tilly only adds rows. An animal whose place has gone takes the lowest empty space.
- **Never seats anybody beside somebody who frightens them**, using the same `previewPlacement` as a tap. This bites more than I expected: in a real run, lorry to Spark returned a snake whose only safe place was the lorry's last row, which Spark does not have. The message uses the existing `describePair` sentence for the pair, then says there is no other space.
- Growing never moves anybody and says nothing (`message` is null). Animals returned on the way down are not reloaded on the way up: the child puts them back.
- The animal in her hand stays in her hand. The input session is never edited.
- Messages, from the tests: "Henry has 4 spaces, so Juniper and Pip are waiting to board again." and "Trikey has 2 spaces, so Pumpkin is waiting to board again."

## 6. One world, one projection: what the picker and car park actually do

**The loading screen's car park (fixed in code).** Ground, vehicle, shadow, bay lines and arrows all share the top-down projection. The shadow is the sprite's own outline, so Trikey's thin frame is shaded as a frame and a van's wheels stand in shadow; the old oval left the four corners bare, which is what floating looks like. The bay is measured in metres off the vehicle's own width (`VEHICLE_WIDTH_M`).

**True relative scale, with one vehicle at a time.** The proportions of every sprite are untouched and `VEHICLE_WIDTH_M` is still the single source of metres. But the *zoom* now differs per vehicle, and it has to: the tap floor needs 40px bays, so Trikey is drawn at 176px to the metre and Big Tilly at 48 (820x620; 277 and 75 at 1024x700). With nothing else on screen there is nothing to compare size against, so the felt difference between vehicles is carried by capacity (2 bays, then 4, 6, 6, 8) and by the arrows' "N spaces", not by pixels. If Marcus wants size felt too, the honest device is a ruler in the ground, not a shared zoom: a shared zoom puts Trikey's two bays at 27px.

**Not fixable in code, or not in these files:**

- **The picker (`PtvDriveScene.renderPicker`) draws all five vehicles the same height**: 108px at 820x620 and 122px at 1024x700, for a 1.75m trike and a 6.5m lorry. That is a thumbnail into a fixed cell, the exact trap in `.claude/HANDOVER.md` "One true scale", and it lives at `PtvDriveScene.ts:~996-1003` (`targetW = min(bw*0.72, bayH*0.62*aspect)`). It also draws no shadows (the vehicles float on the tarmac) and stands the A.R.C. building in front elevation behind a plan-view forecourt. All three are outside my three files. The shadow is the cheap one: `drawVehicleShadow` already takes a texture, so the picker can call it.
- **A bird's-eye A.R.C. building does not exist.** `site-arc-building.png` is a front elevation. Until a plan-view building is commissioned the picker's building is a mixed projection under Rule 8.
- **Trikey is the only vehicle not in the fleet's style** (section 8). The loading screen shows her on her own now, but stepping from Henry to Trikey with the arrow puts a painting beside a plasticine render in consecutive screens.
- **The phone column (144px)** cannot hold any vehicle whole at tappable bays (section 3).

## 7. Does the forecourt picker become redundant?

For choosing a vehicle on a trip with animals, **yes in function, no in practice, so do not delete it.** What I found:

- With cargo, `pickAndDepart` opens the loading screen, and the arrows now do the choosing. The picker is the step before it and could be skipped for cargo trips by starting the scene at `phase = 'loading'` on a default vehicle. That is a change in `PtvDriveScene.init` and needs a default (the smallest unlocked vehicle that holds everyone offered is the obvious one; `vehicleNeighbours` and `VEHICLES_BY_ROOM` make it a few lines).
- With **no cargo** (`this.cargo.length === 0`) the picker is the only way to choose a vehicle, and it pulls straight out onto the road. The arrows do not exist on that path.
- It is the **only place locked vehicles appear**, coned off with their unlock level. The arrows skip them, so retiring the picker removes the child's only view of what comes later.
- The loading screen's **Back** returns to it (`phase = 'select'`), and the comment there says the point of Back is changing your mind about the van. With arrows that reason goes, and Back needs a new meaning or a new destination.
- Its fixed-height thumbnails break true scale (section 6), so if it stays it wants the fix in `renderPicker`.

## 8. Trikey audit (audit only; no art made, no Manus call)

Method: PIL on the files in `apps/game/public/assets/driving/`, the style measurements in `tools/audit-animal-style.py` run on the vehicle files, the pre-repaint fleet recovered from git (`b829999^`) as the claymation baseline, and every file looked at at native size and enlarged. Working files (contact sheets, zooms, metrics) are in the session scratchpad under `audit/`.

### 8.1 The Trikey files

| File | Size, mode | Verdict |
|---|---|---|
| `topdown/vehicle-topdown-trikey.png` | 364x851 RGBA | **Off-style.** Claymation. Used in the picker, the loading screen and the bay. |
| `topdown/vehicle-topdown-trikey-rear.png` | 454x869 RGBA | **Off-style.** Claymation. Used on the road. |
| `vehicles/vehicle-trikey.png` | 1024x512, 8-bit palette | **On-style.** Line-and-wash. The master. |
| `mirrors/mirror-trikey.png` | 420x560, 8-bit palette | In character (brass circle, blue glass), not audited further. |

Those four are all the Trikey art in the repo (`find -ipath "*trikey*"`); the picker has no art of its own. History: re-rendered 2026-07-13 (`91d9d81`, continuous frame), hue-corrected 2026-10-08 (`ba61aa5`, wine-black ink walked to brown, 16% of the front and 12.5% of the rear). Never repainted. Both top-downs are 24-bit RGBA, where every repainted fleet top-down is an 8-bit palette PNG.

### 8.2 What "off-style" looks like in her files

Looked at on the pixels:

- **Plasticine render.** Rolled soft edges on the box, thumb-print mottling across the floor of it (visible in a 2x crop), a glossy sheen running down the blue tube and the grips, moulded black rubber tyres, no ink outline anywhere.
- **Baked ground shadow**: soft brown smudges under the box and the front wheel are in the sprite, against Rule 2.
- **Saturated colour**: frame cobalt RGB(37,140,212), saturation 0.83 on the front; RGB(85,154,203), saturation 0.58 on the rear. The two views do not agree with each other. The portrait's frame is RGB(140,169,180), saturation 0.22: **the top-down is 3.8 times as saturated as the master**.
- **Her front and rear are different widths**: 364 against 454px (19.8% apart, aspects 2.34 and 1.91). The other four agree to within 0.4% (Henry 0.2, Bea 0.0, Spark 0.2, Big Tilly 0.4), which is what the proportion pass bought.

Measured, as support (the animal-set metrics do not separate her cleanly on rim contrast or edge uniformity, and Big Tilly is also an outlier on detail and saturation, so the verdict rests on looking):

| Measure | Trikey front / rear | Fleet before repaint (claymation) | Fleet after repaint |
|---|---|---|---|
| Native detail | 0.066 / 0.113 | 0.051 to 0.092 (Big Tilly 0.106 to 0.122) | 0.102 to 0.226 |
| Distinct colours in the file | 249 / 249 | 241 to 250 | 159 to 197 |
| Share of very dark pixels | 43.6% / 31.5% | 3.6% to 9% (Big Tilly 32 to 35%) | 6% to 14.5% |

Her front sits with the claymation fleet on detail and palette. She is not a half-way case.

### 8.3 What the other four look like

Henry, Bea, Spark and Big Tilly, repainted from their portraits (the portraits are canon):

- A **hand-inked, slightly wobbly warm brown-black key line**: Henry RGB(43,31,29), Bea (52,35,22), Big Tilly (57,32,19).
- **Watercolour washes** with dry-brush streaks and paper grain (enlarged, Henry's roof is flat cream with vertical dry-brush streaks).
- **Muted, pale palette**: the three vans have mean saturation 0.06 to 0.27 across front and rear; Big Tilly's red cab and oak bed 0.56 to 0.58.
- **Details drawn, not modelled**: lamps as amber discs ringed in ink, windows a pale blue-grey wash in an inked frame, Bea's chrome and Spark's green flash as flat accents.
- **No specular highlights, no baked ground shadow**, transparent ground.
- **One camera**: an elevated bird's-eye view, far end at 88% of the near end (`tools/skew-topdown.py`), except the sprites already drawn that way.
- Front and rear agree in width to within 0.4%, and each has a palette of 159 to 197 colours.

### 8.4 Bicycle or trike

**Her art shows a trike, in every file.** The earlier note that her portrait is a two-wheeled bicycle does not hold at full size. Enlarged, the portrait has **three wheels**: a large front wheel under the wicker basket, and at the back two wheels side by side in the three-quarter view, the near one under a blue mudguard with a red reflector and the far one largely hidden behind the chain guard and crank, grey tyre, lighter spokes. It is a chain-driven step-through trike, with bicycle-style pedals mid-frame. At thumbnail size the far rear wheel merges with the frame and reads as a bicycle with a stray wheel, which is how the question arose. Both top-downs show one front wheel and a box on two rear wheels.

So "trike" is already the answer everywhere. What is unsettled is that **the portrait and the top-downs are different trikes**:

| | Portrait (the master) | Top-downs |
|---|---|---|
| Carries | Wicker basket over the front wheel, with a map | Large open terracotta box at the rear, red tail lights |
| Frame | Duck-egg blue, saturation 0.22 | Cobalt, 0.83 front and 0.58 rear |
| Wheels | Wooden spoked wheels, dark grey tyres | Solid black rubber balloon tyres |
| Saddle, flag | Brown saddle, cream "GO!" pennant on a pole | Neither visible |
| Pedals | Brown, orange reflectors | Blue on the front view, terracotta on the rear |

The loading screen puts two crates in `VEHICLE_BED['pedal-trike']`, "the open wooden box behind the saddle". **The master has no box**, so there is nowhere in the canon for the crates to go. That is a design decision to settle before commissioning, not a drawing detail: either the portrait gains a rear box, or the basket becomes the load area.

### 8.5 What a commission brief would have to ask for

Not commissioned. For the day it is, in the order the brief should state it:

1. **Settle the load area first** (8.4), because it changes the silhouette.
2. **Method.** Send the existing sprite and the portrait as references and ask for a repaint to match, as the livery pass did: the repainted sprite supplies the camera and style, and a from-scratch redraw is what returned Bea as a featureless slab. Because her contents change (box or basket), brief it separately from the recolours, as `henry-side` was.
3. **Two files**: front (nose down) and rear. **The same width in both**, within 1%. Width 0.75m and an aspect near 1:2.34 (`VEHICLE_BED_SOURCE` has her at 364x851); the bed fractions in `VEHICLE_BED['pedal-trike']` must be re-measured against whatever comes back.
4. **Camera**: the fleet's, an elevated bird's-eye view, far end 88% of the near end. Either ask for it, or ask for a flat plan and run `tools/skew-topdown.py` at 0.88.
5. **Style, by pointing at the four repainted top-downs**: hand-inked warm brown-black key line (RGB about 43 to 57, 31 to 35, 19 to 29), watercolour wash with dry-brush streaks and paper grain, details drawn rather than modelled. **Blocklist**: plasticine or claymation, 3D render, glossy highlights, moulded rubber, baked shadows.
6. **Livery from the master, not from the old top-down**: duck-egg blue frame (about RGB 140,169,180), wicker, brown saddle, cream "GO!" pennant (seen from above if it shows at all), wooden spoked wheels with dark grey tyres, brown pedals.
7. **Three wheels**: one at the front, two at the back, a chain guard on the near side.
8. **Whole silhouette**, transparent ground, no pavement, no cast shadow beyond what the game draws (Rule 2 and Rule 8). The fleet files carry no transparent padding; keep that.
9. **Rule 1**: public reference URLs on the Vercel deployment for the portrait and the four repainted top-downs, with the "stop if you cannot fetch these" line. **Rule 6** says continuity work goes to OpenAI `/v1/images/edits`; the fleet repaint went through Manus by Marcus's explicit choice on 2026-09-06, so which to use again is his decision.
10. **The self-check line** from Rule 5.
11. **Acceptance, measured not eyed**: an 8-bit palette PNG with fewer than about 200 colours; native detail at or above about 0.10; front and rear widths within 1%; the frame in the same hue family and saturation in both views and in the portrait.

## 9. Verification

Real Chrome under Playwright (`channel: 'chrome'`), against Vite from this worktree. Screenshots are in the session scratchpad, `car-park-uncropped/`:

- The four asked for: `after-trikey-820x620.png`, `after-bigtilly-820x620.png`, `after-trikey-1024x700.png`, `after-bigtilly-1024x700.png`.
- Henry, the vehicle that was cut off: `after-henry-820x620.png`, `after-henry-1024x700.png`, against `before-henry-820x620.png` and `before-henry-1024x700.png`.
- The picker as it stands, for section 6: `before-picker-820x620.png`, `before-picker-1024x700.png`. Also `before-trikey-*` and `before-bigtilly-*`.

**The arrows in those captures are drawn by the harness, not by the loading view**, because the view is not wired (it passes no `onVehicleChange`). The harness calls the same `drawVehicleArrows` that `drawCarPark` calls, with the column and vehicle rectangle `drawCarPark` records on the container, and wires `onVehicleChange` to `changeVehicle` and `renderView` exactly as section 5 does.

Exercised end to end: plate presses by emitted event and by a **real mouse click**; the left and right arrow keys; animals aboard, stepped down lorry, Spark, Bea, Henry, Trikey, with the returned animals named in the panel; no wrap at either end (the dimmed arrow does nothing; repeated presses at Trikey and at Big Tilly changed nothing); no double fire after redraw.

Not verified: a real iPad or phone (the in-app simulator was not used), and the layout at any size other than 820x620, 1024x700 and 874x402.

## 10. Things to clean up when you wire it

`crate-loading-view.ts` still describes the old picture. Stale, and left alone as asked:

- Around lines 1424 to 1438: "the rest of the fleet in the bays either side", "paid for in bumper, not in bays", "cut off at the kerb".
- The `drawVehicle` doc: "cut off where the tarmac is" and "reads as driving out of the picture".
- `RAW_COLUMNS` in `fleet-art.test.ts` is measured off that layout. If the layout changes (section 4, decision 1), re-measure it, and the `NOT_YET_WHOLE` entry goes with it.

Two traps worth promoting to `.claude/TRAPS.md` when the other branch is merged (I did not edit it, to avoid a conflict at the file's tail):

- **`car-park.ts` now imports `ui/UIButton`, which imports Phaser**, so any test that imports it needs `vi.mock('phaser', () => ({ default: {} }))`, as `crate-loading-view.test.ts` does. `fleet-art.test.ts` gained one.
- **`getBounds()` on a cropped Phaser image returns the uncropped size.** Check `isCropped`, or a harness will report a whole vehicle that is not.
