# The car park: one vehicle, whole, in one world

Branch `claude/car-park-uncropped`, 2026-10-09. Based on `claude/crate-loading` at `f835b2b`. Not pushed. Two commits: `bd52d6a` (the single-bay car park, arrows, overflow rule, Rule 8, Trikey audit) and the second-round commit on top of it (Spark whole, the picker at true scale, Trikey's brief).

Marcus's instructions this note answers:

1. "We need to stay within the 3D world or simulated 3D world of the game at all times. We don't show cropped versions of things. Instead, we work with real scenes with real interactions in them." Now `docs/manus-sprite-rules.md` Rule 8.
2. "We don't need to show other vehicles in the parking lot. We can just zoom in on the one that is currently being loaded. but also have some arrows next to it so that the child can quickly move to the next parking lot with the next vehicle in it in case they want to load fewer or more animals, then we don't need the metaphor of the rest of the building, nor the road showing in front of the vehicle since we're just zoomed in on that for the loading game."
3. Round two: Spark option A (the 40px floor does not move); the arrows skip locked vehicles; Trikey's load area is a rear rack behind the saddle carrying two crates in line; and the picker's equal-height thumbnails are to be fixed at true relative scale.

## 1. What is in the branch

| File | What it does now |
|---|---|
| `apps/game/src/driving/car-park.ts` | One bay: tarmac, two side lines and a head line measured in metres off the vehicle's own width, the vehicle parked whole. No neighbours, no kerb, no gravel strip, no road. **The ground may be taller than the column**: where a vehicle will not stand in the column with the tarmac she is owed in front of her, her rear rises above the column (`vehicleParkTop`, `PARK_CEILING`) and the tarmac begins just above her head line. Draws the two arrows when given `onVehicleChange`. |
| `apps/game/src/driving/fleet-art.ts` | `VEHICLE_VISIBLE_FRAC` is 1 (was 0.78). `wholeVehicleHeight()` and `minScaleForBays()`. **New: `pickerLayout()`**, the picker's true-scale arithmetic, and `vehicleLengthM()`. |
| `apps/game/src/driving/forecourt.ts` | `drawApron(..., { kerb: false })`. `drawVehicleShadow` throws the vehicle's own silhouette instead of an oval, and now returns what it drew. |
| `apps/game/src/scenes/PtvDriveScene.ts` | **`renderPicker` draws the five at true relative scale** using `pickerLayout`, each with its shadow; `pickAndDepart` takes the shadow with the vehicle when it drives out. Nothing else in the file changed. |
| `packages/game-logic/src/vehicle-change.ts` (new) | `VEHICLES_BY_ROOM`, `vehicleNeighbours()`, `changeVehicle()`. Exported from the package index. |
| `apps/game/src/driving/__tests__/fleet-art.test.ts` | Rewritten where the kerb was the premise, with the reasons in the file. New describes for the arrows, the park-top rule and the picker. |
| `packages/game-logic/src/__tests__/vehicle-change.test.ts` (new) | 19 tests. |
| `apps/game/tools/shoot-car-park.mjs` (new) | Photographs the screen and prints whether the vehicle is whole. Walks the arrows by plate, real mouse or keyboard; `--picker` photographs the picker. |
| `docs/manus-sprite-rules.md` | Rule 8. |
| `crate-loading-view.ts` | Untouched, as asked. |
| `.claude/HANDOVER.md` | Untouched, as asked. |

## 2. Why Henry was cut off

Three decisions stacked, all in the code that draws the picture:

1. **`VEHICLE_VISIBLE_FRAC = 0.78`.** The loading view fitted the vehicle to `(column.h - 42) / 0.78`, a box 28% taller than the column the child could see.
2. **The far kerb and 42px of gravel** took the top of the column, so the ground ended before the vehicle did.
3. **`setCrop` at `park.kerbY - 2`**, in `crate-loading-view.ts`'s `drawVehicle`, cut the sprite where the tarmac stopped.

Measured before the change, 820x620: Henry drawn 161x376 from y=158, tarmac ending at about y=428, so 106px of 376 (28%) gone: bonnet, lamps and most of the windscreen. It was not a fixed-height cell and not a mask. It was a deliberate trade of bumper for backdrop, documented in `fleet-art.ts` as "what goes is the bumper", and the trade is the thing Marcus ruled out.

The fix is the design change Marcus asked for. With no backdrop to pay for, the fraction is 1, the vehicle is fitted to the column less a margin of ground fore and aft (`carParkBackdropH`, 4% of the column a side, 8 to 20px), and parked with that margin in front of her (`vehicleParkTop`). A test holds the fraction at 1.

## 3. Spark whole, paid for: the ground is taller than the column

**Spark's bays need her drawn 361px tall at the 40px tap floor, and the floor does not move.** `wholeVehicleHeight`, which does not depend on the screen:

| Vehicle | Whole height needed | With her margin (13px each end) |
|---|---|---|
| Trikey | 273 | 299 |
| Henry | 255 | 281 |
| Bea | 323 | 349 |
| Big Tilly | 308 | 334 |
| Spark | 361 | **387** |

At 820x620 the loading view hands the car park a column 335px tall (`y` 93 to 428). `crate-loading-view.ts` is not mine to edit, so the column is still 335. What changed is that the ground is no longer limited to it. Between the top of the screen (less the 16px `SAFE_MARGIN`) and the bottom of the column there are 412px, and Spark needs 387. She is parked with her 13px of tarmac in front of her and her rear rises 39px above the top of the column, into the band beside the Back button and the title plate; the tarmac begins just above her head line. Her rear is the narrow end of her and her painted body ends at about x=281 while the title plate begins at x=290 (and Back ends at 124, she begins at 174), so nothing stands behind chrome. A test holds that clearance at 820x620, 1024x700 and 874x402 (`keeps the risen rear clear of the Back button and the title`; it allows the title 125px either side of the middle, the real plate is 120).

**If you would rather the layout give the column**, the number to ask it for is `wholeVehicleHeight(id, cols, rows) + carParkBackdropH(...)`: 387px for Spark. A column that tall makes the rise a no-op, so nothing here needs undoing.

**Bea's ground.** She used to stand with 5px of tarmac in front of her; she now has the full 13 (her rear rises 1px above the column). **The other three are unaffected**: Trikey, Henry and Big Tilly are fitted to the 309px box and stand in the middle of the column exactly where they stood (a test, `moves only the vehicles whose room ran out`, asserts that the only two that move are Bea and Spark).

The exception test that recorded Spark as cropped is gone; `stands every vehicle whole on the ground` has no exception list, and says why in the file.

| Vehicle | 820x620 | 1024x700 |
|---|---|---|
| Trikey | 132x309, whole | 208x487, whole |
| Henry | 132x309, whole | 209x487, whole |
| Bea | 132x323, whole, 13px in front | 199x487, whole |
| Big Tilly | 110x309, whole | 174x487, whole |
| Spark | 123x361, **whole**, rear risen to y=54 | 167x487, whole |

**What is still not whole: the landscape phone (874x402).** The column is 145px and every vehicle needs 255 to 361, so the ground (145 plus the 77px above the column) is shorter than every one of them. What the rising rear buys there is that the bays are now whole and tappable: they used to spill over the tray label and below the ground. The front of each vehicle still runs off. A test records it (`keeps every bay whole on a landscape phone, where the front of the vehicle still runs off`). Only the layout can fix it: a 145px column cannot hold a 255px vehicle.

## 4. Decisions

Decided by Marcus: Spark option A (above); locked vehicles are skipped by the arrows (built that way, `playerLevel` option, locked vehicles keep showing in the picker); Trikey's load area is a rear rack (section 8).

Still open, both small:

1. **Bea to Spark is "more" but both hold six.** The tie is broken by unlock level, so Spark follows Bea. The plate says "6 spaces" so nothing is hidden. Say if Spark should come first (she costs 5 fuel against Bea's 10).
2. **The panel heading for a vehicle change.** A notice with `level: null` draws the heading "Wait a Moment", which is wrong for "Trikey has 2 spaces, so Clementine is waiting to board again." The notice type has no `heading`; adding an optional one is a small change in `crate-loading-view.ts`. Suggest "Trikey Has 2 Spaces".

And one that follows from the rack decision: **should the portrait gain the rack too?** The rack is in the top-downs and not in the portrait, and the portrait is the master. A side view that carries no rack beside two top-downs that do is the mismatch Marcus's own rule names ("autistic kids will spot that stuff doesn't match when seen from different viewpoints"). Recommend a small separate repaint of the portrait to add it.

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

`VehicleDirection` (`'fewer' | 'more'`) is exported from `car-park.ts`. Leave out `onVehicleChange` and no arrows are drawn, so a screen that is not wired shows no control that does nothing. Nothing else in the view needs to change: `drawVehicleShadow` finds out which vehicle it is shading from a note `drawCarPark` leaves on the container, and `drawVehicle` reads `park.parkTop` and `park.kerbY`, which now account for the risen rear (Spark's `kerbY` is below her nose, so nothing is cropped).

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

**The loading screen's car park.** Ground, vehicle, shadow, bay lines and arrows all share the top-down projection. The shadow is the sprite's own outline, so Trikey's thin frame is shaded as a frame and a van's wheels stand in shadow; the old oval left the four corners bare, which is what floating looks like. The bay is measured in metres off the vehicle's own width (`VEHICLE_WIDTH_M`).

**True relative scale, with one vehicle at a time.** The proportions of every sprite are untouched and `VEHICLE_WIDTH_M` is still the single source of metres. But the *zoom* differs per vehicle on the loading screen, and it has to: the tap floor needs 40px bays, so Trikey is drawn at 176px to the metre and Big Tilly at 48 (820x620). With nothing else on screen there is nothing to compare size against, so on that screen the felt difference between vehicles is carried by capacity (2 bays, then 4, 6, 6, 8) and by the arrows' "N spaces". **The comparison of size now lives in the picker, which is why it had to be fixed (section 7).**

**Still not fixable in code, or not in these files:**

- **A bird's-eye A.R.C. building does not exist.** `site-arc-building.png` is a front elevation. Until a plan-view building is commissioned the picker's building (it stands behind the tarmac wherever there is room for it) is a mixed projection under Rule 8.
- **The exit road at the bottom of the picker is 43px.** At the picker's scale (25 to 33px to the metre) that is a road about 1.3m wide, narrower than a vehicle. It was already that, it is behind the vehicles, and the no-cargo departure tweens a vehicle onto it, so I left it. A truthful road would be a lane of about 100px; the loading screen dropped its road for the same arithmetic.
- **Trikey is the only vehicle not in the fleet's style** (section 8). In the picker she now stands beside four painted vehicles at true scale and the difference is visible even at 18px wide.
- **The landscape phone's loading screen** (section 3).

## 7. The picker is at true relative scale

**What was wrong.** `PtvDriveScene.renderPicker` fitted every sprite to `bayH * 0.62`, so all five stood the same height: 108px at 820x620 and 122px at 1024x700, a 1.75m trike as tall as a 6.5m lorry. That is a fleet comparison built by thumbnailing every sprite into a fixed cell, the mistake the handover records ("One true scale", 2026-10-08), and now that the loading screen zooms each vehicle to its own bay the picker is the only place the fleet's relative size can be seen. They also floated on the tarmac with no shadow.

**What it does now** (`pickerLayout` in `fleet-art.ts`, drawn by `renderPicker`):

- **One scale for all five**, in pixels to the metre, driven by `VEHICLE_WIDTH_M` and each sprite's own aspect. The scale is the biggest at which the longest vehicle (Big Tilly, 6.5m) stands whole in the band, so nobody is drawn smaller than they need to be.
- **Reversed in against one head line**, rears level, so their lengths hang from a common edge and can be compared by eye. Names sit in a row under the longest.
- **Each stands on the tarmac with its own outline thrown to one side as a shadow**, the same `drawVehicleShadow` as the loading screen. The shadow goes with the vehicle when a no-cargo pick drives it out (checked with a real mouse click: the vehicle and both shadow layers moved the same 189px).
- **Nothing cropped**: every vehicle is whole inside its bay and the band. A test holds it at four sizes.
- **The tarmac is as wide as the five bays and no wider**, a car park with a fleet in it, not a slab with five thumbnails.
- **Locked vehicles** keep the grey tint, the cone (now at the mouth of the bay) and the unlock chip (now in its own row under the longest vehicle, where nobody's nose reaches). They are not tappable, as before.

**The numbers**, drawn size of each vehicle (width x length, px) and the tap target:

| | 820x620 | 1024x700 | 1024x768 | 874x402 (phone) |
|---|---|---|---|---|
| Scale | 24.5 px/m | 29.1 | 33.2 | 25.9 |
| Trikey | 18x43 | 22x51 | 25x58 | 19x45 |
| Henry | 43x100 | 51x119 | 58x135 | 45x106 |
| Bea | 44x108 | 52x128 | 60x146 | 47x114 |
| Spark | 49x143 | 58x170 | 66x194 | 52x151 |
| Big Tilly | 56x158 | 67x188 | 76x214 | 60x167 |
| Smallest tap target | 58 x 236 | 58 x 266 | 58 x 292 | 58 x 245 |

**True scale and a usable tap target both hold, with one caveat to be plain about.** The tap target is the whole bay, never the vehicle's outline, and no bay is narrower than 64px (target 58 after a 3px margin a side) against the 48px floor, so the smallest vehicle's target is 58px wide by the full height of the band. What is small is the *picture*: Trikey is 18px wide and 43px long at 820x620, drawn from a 364x851 sprite. At that size she reads as a tiny trike with an orange box, which is the point of the comparison, but it is a small thing to recognise and is the one number Marcus may want to look at. The vehicles are the only thing drawn true: no bay is narrower than 64px, so the painted space round the small ones is a little wider than a real space would be (Trikey's own bay at this scale would be 34px).

**The building costs the vehicles half their size.** With it, the band at 620px tall is 236px; without it, 448. So below 560px of height the building comes off and the tarmac takes the room (as the loading screen did first), which is what the 874x402 column shows: the same scale as 820x620 with the building. Marcus may prefer the other trade (no building at any size, vehicles about 2.3 times as big: Trikey 43x100 at 820x620, Big Tilly 132x370). It is one constant, `PICKER_BUILDING_MIN_H`.

**Does the picker become redundant?** For choosing a vehicle on a trip with animals, yes in function, no in practice, so do not delete it. With cargo, `pickAndDepart` opens the loading screen and the arrows do the choosing. But with **no cargo** the picker is the only way to choose a vehicle and it pulls straight out onto the road; it is the **only place locked vehicles appear**, coned off with their unlock level; and the loading screen's **Back** returns to it. It also now carries the only side-by-side size comparison in the game. Skipping it for cargo trips would be a change in `PtvDriveScene.init` (start at `phase = 'loading'` on the smallest unlocked vehicle that holds everyone offered; `vehicleNeighbours` and `VEHICLES_BY_ROOM` make it a few lines).

## 8. Trikey (audit and brief; nothing commissioned, no Manus call)

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

### 8.4 Bicycle or trike, and what she carries

**Her art shows a trike, in every file.** The earlier note that her portrait is a two-wheeled bicycle does not hold at full size. Enlarged, the portrait has **three wheels**: a large front wheel under the wicker basket, and at the back two wheels side by side in the three-quarter view, the near one under a blue mudguard with a red reflector and the far one largely hidden behind the chain guard and crank, grey tyre, lighter spokes. It is a chain-driven step-through trike, with bicycle-style pedals mid-frame. At thumbnail size the far rear wheel merges with the frame and reads as a bicycle with a stray wheel, which is how the question arose.

**Decided by Marcus, 2026-10-09: her load area is a rear rack behind the saddle, over the back axle, carrying two crates in line.** That matches her 1x2 grid exactly (one crate wide, two long). Her front wicker basket stays a basket and is not cargo. The portrait's character is canon: duck-egg blue frame, wicker basket, brown saddle, wooden spoked wheels, GO pennant, three wheels. **The terracotta box in her current top-downs is dropped.**

What that changes against the files as they stand:

| | Portrait (the master) | Top-downs today | Top-downs to be |
|---|---|---|---|
| Carries | Wicker basket over the front wheel, with a map | Large open terracotta box at the rear | **Rear rack behind the saddle, two crates in line; the basket stays a basket** |
| Frame | Duck-egg blue, saturation 0.22 | Cobalt, 0.83 front and 0.58 rear | Duck-egg blue |
| Wheels | Wooden spoked, dark grey tyres | Solid black rubber balloon tyres | Wooden spoked, dark grey tyres |
| Saddle, flag | Brown saddle, cream "GO!" pennant on a pole | Neither visible | Both |
| Pedals | Brown, orange reflectors | Blue (front), terracotta (rear) | Brown, orange reflectors |

The rack is in the top-downs and not in the portrait, which is a mismatch the portrait can fix with a small separate repaint (section 4).

### 8.5 The brief, ready to send

Not sent. Before it is: (1) check the reference URLs serve the committed files, with a `HEAD` over each and a `shasum` against the local file (the repainted fleet was committed 2026-10-08, `b829999` and `a08ab96`; the animal batch had to do the same, `.claude/HANDOVER.md` "Check the deployment before submitting"); (2) decide the three choices the brief makes that Marcus has not stated, marked below as `[choice]`; (3) Rule 6 says continuity work goes to OpenAI `/v1/images/edits`, and the fleet repaint went through Manus by Marcus's explicit choice on 2026-09-06, so which to use again is his decision.

Pasting everything between the rules:

---

**Trikey: two top-down views, repainted to the fleet's style, with a rear rack**

**References (fetch before drawing; publicly reachable):**

The portrait (the master; this is the vehicle):
- https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-trikey.png

The style anchors, the four finished top-down vehicles, front views (nose down) and rear views:
- https://animal-rescue-centre.vercel.app/assets/driving/topdown/vehicle-topdown-henry.png
- https://animal-rescue-centre.vercel.app/assets/driving/topdown/vehicle-topdown-bea.png
- https://animal-rescue-centre.vercel.app/assets/driving/topdown/vehicle-topdown-spark.png
- https://animal-rescue-centre.vercel.app/assets/driving/topdown/vehicle-topdown-big-tilly.png
- https://animal-rescue-centre.vercel.app/assets/driving/topdown/vehicle-topdown-henry-rear.png
- https://animal-rescue-centre.vercel.app/assets/driving/topdown/vehicle-topdown-bea-rear.png
- https://animal-rescue-centre.vercel.app/assets/driving/topdown/vehicle-topdown-spark-rear.png
- https://animal-rescue-centre.vercel.app/assets/driving/topdown/vehicle-topdown-big-tilly-rear.png

If you cannot fetch these URLs, STOP and report back. Do not generate from description alone.

**What to make.** Two transparent PNGs, with exactly these filenames:
- `vehicle-topdown-trikey.png`: the front view, seen from ahead and above, front wheel and handlebars at the bottom of the picture, the rear rack at the top.
- `vehicle-topdown-trikey-rear.png`: the rear view, seen from behind and above, the rear rack nearest the camera at the bottom of the picture, handlebars at the top.

**The vehicle.** Trikey is the three-wheeled step-through tricycle in the portrait, drawn from above. Keep everything the portrait shows: a duck-egg blue frame (about RGB 140, 169, 180); a wicker basket over the front wheel with a folded map in it, which stays a basket and is not cargo; a brown saddle; wooden spoked wheels with dark grey tyres; brown pedals with orange reflectors; a chain guard on the near side; a bell on the handlebars; a cream pennant lettered GO in brown on a pole. She has three wheels: one at the front, two at the back, side by side.

**The rear rack.** Behind the saddle, over the back axle, a flat rear rack that carries two crates in line, one behind the other along her length. Draw the rack empty: the game puts the crates on it. The deck is clear and unobstructed, about 78% of her width and about 28% of her length, at her rear end, with a low rail round it. `[choice]` The rail is the same duck-egg blue as the frame and the deck is natural wood slats, to match the oak bed on Big Tilly. `[choice]` The pennant pole stands at the rack's rear corner, as in the portrait it stands at the rear mudguard. Do not draw any box, crate or trailer. The terracotta box in the earlier sprite is not part of her.

**Size.** She is 0.75 metres wide at her widest (the handlebars) and about 1.75 metres long, so the picture is about 2.34 times as long as it is wide. Make the two files the same width, to within 1%. The canvas is the silhouette: no transparent padding, nothing cut off.

**Camera.** The same as the four finished vehicles: an elevated bird's-eye view, the far end of the vehicle drawn about 88% as wide as the near end.

**Style.** Match the four finished vehicles exactly: line and wash. A hand-inked, slightly wobbly warm brown-black outline (about RGB 43 to 57, 31 to 35, 19 to 29), watercolour washes with dry-brush streaks and paper grain, and details drawn rather than modelled. A muted palette. The blocklist, which will be rejected: plasticine, claymation, a 3D render, glossy or specular highlights, moulded rubber, soft modelled shading.

**Ground.** Do not paint any pavement, road surface, grass, kerb or ground context, and no cast shadow under her: the game draws the ground and the shadow. Transparent background everywhere else.

**Self-check before delivering.** For each of the two pictures ask: "would someone looking at this instantly recognise it as the same vehicle as the portrait, drawn in the same style as the four finished top-down vehicles?" Then check the two files are the same width, and that the rack has room for two crates in line. If not, redo that picture before shipping.

---

**Acceptance, measured on what comes back** (ours, not part of the brief):

- An 8-bit palette PNG with fewer than about 200 distinct colours.
- Native detail (`tools/audit-animal-style.py`, `detail_native`) at or above about 0.10.
- Front and rear widths within 1% of each other, and an aspect near 1:2.34.
- The frame in the same hue family and saturation in both views and in the portrait (about saturation 0.22, hue 196).
- Camera: far end about 88% of the near end (or flat, and run through `tools/skew-topdown.py` at 0.88).
- Then, in code: re-measure `VEHICLE_BED['pedal-trike']` against the rack's deck and `VEHICLE_BED_SOURCE['pedal-trike']` against the file, update `PAINTED_BODY` in `fleet-art.test.ts`, and take `warnOnStaleBed` as the check that nothing was missed.

## 9. Verification

Real Chrome under Playwright (`channel: 'chrome'`), against Vite from this worktree. Screenshots are in the session scratchpad, `car-park-uncropped/`.

Round one: `after-trikey-*` and `after-bigtilly-*` at 820x620 and 1024x700; `after-henry-*` against `before-henry-*`; `before-picker-*`.

Round two: `spark-whole-820x620.png` (Spark, whole, rear risen between Back and the title), `picker-after-820x620.png` and `picker-after-1024x700.png` (the five at true relative scale), and `picker-after-874x402.png` (the phone, no building).

**The arrows in the loading-screen captures are drawn by the harness, not by the loading view**, because the view is not wired (it passes no `onVehicleChange`). The harness calls the same `drawVehicleArrows` that `drawCarPark` calls, with the column and vehicle rectangle `drawCarPark` records on the container, and wires `onVehicleChange` to `changeVehicle` and `renderView` exactly as section 5 does.

Exercised end to end: plate presses by emitted event and by a **real mouse click**; the left and right arrow keys; animals aboard, stepped down lorry, Spark, Bea, Henry, Trikey, with the returned animals named in the panel; no wrap at either end; no double fire after redraw; a no-cargo pick in the picker by real mouse click, vehicle and shadow driving out together.

Not verified: a real iPad or phone (the in-app simulator was not used), and the layout at any size other than 820x620, 1024x700, 1024x768 (picker numbers only) and 874x402.

## 10. Things to clean up when you wire it

`crate-loading-view.ts` still describes the old picture. Stale, and left alone as asked:

- Around lines 1424 to 1438: "the rest of the fleet in the bays either side", "paid for in bumper, not in bays", "cut off at the kerb".
- The `drawVehicle` doc: "cut off where the tarmac is" and "reads as driving out of the picture".
- `RAW_COLUMNS` in `fleet-art.test.ts` is measured off the layout (x 24, y 93, columns 542x527, 424x335 and 455x145). If the layout changes, re-measure it.

Two traps worth promoting to `.claude/TRAPS.md` when the other branch is merged (I did not edit it, to avoid a conflict at the file's tail):

- **`car-park.ts` now imports `ui/UIButton`, which imports Phaser**, so any test that imports it needs `vi.mock('phaser', () => ({ default: {} }))`, as `crate-loading-view.test.ts` does. `fleet-art.test.ts` has one.
- **`getBounds()` on a cropped Phaser image returns the uncropped size.** Check `isCropped`, or a harness will report a whole vehicle that is not.

## 11. The picker has no building, and the band follows the fleet

Branch `claude/picker-no-building`, 2026-10-09, based on `claude/crate-loading` at `855f340`. Not
pushed. Touches the picker parts of `fleet-art.ts`, `PtvDriveScene.ts`, `fleet-art.test.ts` and
`tools/shoot-car-park.mjs`; `car-park.ts` and `crate-loading-view.ts` untouched, as asked.

### 11.1 The decision

**Marcus, 9 October 2026: the A.R.C. building comes off the vehicle picker at every size.** Section 7
offered it as a trade and this is the answer. Two reasons, both pointing the same way:

- **It cost the vehicles half their size.** At 620px tall the band they had with it was 236px; without
  it, 448.
- **The picker is the only screen where the fleet's true relative scale is visible**, because the
  loading screen zooms each vehicle to fill its own bay. The comparison is now the screen's job, and
  the building was taking the room the comparison needs.

It was also the last front elevation standing among plan-view vehicles — the Rule 8 mismatch already
taken off the loading screen.

`PICKER_BUILDING_MIN_H` (560) is gone: the answer no longer depends on the screen. **The `building`
flag on `PickerLayout` is kept as the seam**, always false, with the decision and these figures
recorded on it. The decision was about this painting, not about buildings: `site-arc-building.png` is
a front elevation, and the day a roof-down one exists the picker is where it goes back. Set the flag
true for the screens with room for it and `drawForecourt` draws it, as it still can. Nothing else has
to be reinstated.

### 11.2 The fault the removal exposed, and the fix

With the band 90% taller, three tests failed. Two were stale premises and were rewritten. The third
was real: **at 1024x768 the lorry left a 14.3px gap between her nose and the chip row where the
layout allows at most 6** (`PICKER_CHIP_ROW − PICKER_CHIP_H`).

**The cause was the picker becoming width-bound.** The scale answers to two limits, and either can be
the tighter one:

| 1024x768 | px to the metre |
|---|---|
| What the band's height allows | 78.6 |
| What five bays across the screen allow (`min(width×0.92, 1080) − 32`) | **76.7** |

The width won, so about 12px of the reclaimed height could not be spent on a vehicle. It did not
disappear: the band was still `roadY − 30 − apronTop`, a share of the screen, and the chip row and the
names hung off the *bottom* of it. The unspendable height therefore sat as dead ground under the
noses — a gap below the fleet, which Marcus's rules call a fault twice over (no large empty band;
more space below content than above it).

**The fix: the rows follow the fleet's drawn extent.** `pickerLayout` now finds the scale against the
band there *could* be, and then sizes the band to what the fleet actually is:

```ts
const bandMax = Math.round(roadY - 30 - apronTop);
const rows = PICKER_PAD_TOP + PICKER_CHIP_ROW + PICKER_LABEL_H + PICKER_PAD_BOTTOM;
let p = (bandMax - rows) / longest;          // what the height allows
if (total(p) > usable) { /* halve to the width's answer */ }
const apronH = Math.round(longest * p) + rows;   // the band is the fleet
```

**Why this and not the alternatives.** Widening the apron past 92% of the viewport would also have
closed the 1024x768 gap, but only there, by crowding the frame, and it leaves the same fault waiting
at the next viewport where the width binds. Shrinking the fleet to match the band gives back the size
the decision just bought. This one is general: whichever limit binds, the longest vehicle's nose lands
on the chip row (the gap is now 3.0 to 3.3px at all four viewports, against an allowance of 6), and
what the width would not let her spend stays *below* the tarmac as gravel — the ground between the car
park and the road, where more space below content than above it is what the rules ask for. The band
at 1024x768 is 574px against the 585 there is; at the other three the height binds and the band is
all of it.

No assertion was weakened. `gives the longest vehicle all the room there is` is untouched and passes,
and two tests were added that hold the fix: `ends the band where the fleet ends, not at a share of
the screen` (all four sizes) and `is capped by the width at 1024x768, and loses no height to it`.

### 11.3 The fleet, drawn (width x length in px, measured in real Chrome)

**The figures below are the final ones, with both the building and the exit road gone** (section 12).
Where the two decisions differ the building's own figure is given in brackets.

| | 820x620 | 1024x700 | 1024x768 | 874x402 (phone) |
|---|---|---|---|---|
| Scale | **61.0 px/m** (was 24.5; 57.3 with the road) | **73.6** (29.1; 68.8) | **76.8** (33.2; 76.8) | **27.4** (25.9; 25.9) |
| Trikey | 46x107 | 55x129 | 58x135 | 21x48 |
| Henry | 107x249 | 129x301 | 134x314 | 48x112 |
| Bea | 110x269 | 132x324 | 138x339 | 49x121 |
| Spark | 122x356 | 147x430 | 154x449 | 55x160 |
| Big Tilly | 140x393 | 169x475 | 177x496 | 63x177 |
| Band (apron) | 471 (was 236; 448) | 553 (266; 522) | 574 (292; 574) | 255 (245; 245) |

**2.5 times the size at 820x620**: the building bought 236px of band against 448, and the road the
last 23 on top. 1024x768 gains nothing from the road, because five bays across already cap its scale
and it has height it cannot spend; the landscape phone gains the road's 28px, which is the only thing
that has ever moved it.

**A bonus worth knowing: at 820x620 and above the bays are now true to scale as well as the vehicles.**
Every bay is wider than the 64px floor at these scales, so the painted lines are each vehicle's own
space in metres. The floor still bites on the landscape phone (Trikey's true bay there is 36px and she
is given 64), so the caveat in section 7 now applies only to screens under about 500px tall.

### 11.4 What the bigger vehicles do to the rest of the picker

Checked at all four viewports, in real Chrome.

- **Nothing is cropped and nothing leaves the frame.** All five report `cropped: false, inFrame: true`
  at 820x620, 1024x700, 1024x768 and 874x402.
- **The silhouette shadows scale with the vehicles** and are not cropped: `drawVehicleShadow` crops
  only when the box is shorter than the sprite's own aspect, and the picker's box never is.
- **The cone and the unlock chip still work.** The chip stands in its own row between the longest nose
  and the names, where nobody's nose reaches; the cone stands at the mouth of the bay, straddling the
  tarmac's near edge, and clears the road at every size (a test holds that).
- **The locked grey tint reads differently at this size. Looked at, and deliberately kept.**
  `setTint(0x707070)` is a multiply, so a vehicle keeps her hue and loses her light. On an 18px trike
  that read as grey; on a 140px lorry it reads as a *dulled* red lorry rather than a grey one.
  **Marcus's decision, 9 October 2026: that is the one to keep** — the child sees the vehicle she is
  working towards in its real colours, muted, and the cone and the "L10" chip are what say locked.
  **So this is not a bug and grey was not the intention.** It was considered against the alternative
  (a second copy of the sprite over the first with `setTintFill(0x8a8a8a)` at about 0.45 alpha, the
  trick `drawVehicleShadow` uses with black, which is the only way to desaturate without a shader),
  and the dulled livery won. Do not "fix" it.
- **The departing vehicle used to stop half out of the frame, and now does not.** `pickAndDepart`
  aimed her *centre* at `roadY − 6`, which was a few pixels of overhang at the old size; at the new one
  Big Tilly is 393px long and most of a lorry hung below the bottom of a 620px screen while the game
  asked "Which way?". It now aims her **nose**, and her length decides where her centre lands, so she
  pulls out of her bay and waits whole. (Where her nose stops changed again when the road went:
  section 12.)
- **The departing vehicle no longer wears her own name across the cab.** The picker's container is
  never depth-sorted — its children's depths run 0, 0, 20, 0, 30 down the list, in the order they were
  added — so a vehicle at depth 30 still rendered *under* a name label at depth 0 added after her. The
  names are now added before the vehicles, so at rest nothing changes (no nose reaches that row) and a
  departing lorry drives over her name, which is what a lorry does to paint on tarmac. **Worth
  promoting to TRAPS.md: in this scene `setDepth` does not order anything; insertion order does.**

### 11.5 The exit road is 0.7m wide — the question, which Marcus has since answered

**Answered on 9 October 2026: drop it.** The measurements below are what the decision was made on;
what was done about it is section 12.

Section 6 recorded the road at 43px, about 1.3m at the old scale. At the new one:

| | 820x620 | 1024x700 | 1024x768 | 874x402 |
|---|---|---|---|---|
| Road, px | 43.4 | 49.0 | 53.8 | 28.1 |
| Road, metres | **0.76** | **0.71** | **0.70** | 1.09 |

**It is narrower than Trikey's handlebars (0.75m) and under a third of Big Tilly's width.** It no
longer reads as a road a vehicle drives onto; it reads as a painted strip at the foot of the car park.
A truthful lane is 3.3m, which is 190px at 820x620 and 253px at 1024x768 — and the fleet needs 448 of
that screen's 620, so a truthful lane does not fit. This is the same arithmetic that took the road off
the loading screen.

I left it in the first commit, because the picker's departure flow was built on it, and recommended
keeping the strip as a signpost. **Marcus went the other way, on this note's own arithmetic: a thing
that does not read as a road should not be drawn as one, and the loading screen already handles
having no room for a road by not having one.** The two screens now agree. Section 12 is what that
took.

### 11.6 Two smaller things, one fixed

1. **The two biggest vehicles were the wrong way round on screen, and now are not** (fixed in the
   second commit). The bays followed `VEHICLE_DEFS` order, which puts Big Tilly (6.5m) fourth and
   Spark (5.9m) fifth, so the line stepped up, up, up, down. It was invisible when they were all
   108px tall. `pickerLayout` now returns the bays through `fleetBySize` — **sorted on the art's own
   numbers, not listed**, so a sixth vehicle cannot land in the middle of the row — and
   `renderPicker` draws the bays in the order it is handed rather than indexing them by the
   definition's position.

   **It is the same order as the vehicle-change arrows**, which Marcus ordered by capacity with
   unlock level breaking Bea and Spark's tie (`VEHICLES_BY_ROOM`): drawn 43, 100, 103, 115, 132 at
   820x620, against capacities 2, 4, 6, 6, 8. So there is no second ordering to maintain, and a child
   who learns the fleet's order on one screen keeps it on the other. The two are derived separately —
   this from the art, that from the rules — so a test holds them to each other
   (`parks them in the order the vehicle-change arrows walk`). One oddity to expect in the coned
   bays: the unlock chips now read L5, L12, L10 left to right, because size, not unlock level, is
   what the row is sorted on.
2. **The landscape phone's car park is a 369px strip in 874px of gravel.** Its scale is capped by
   402px of height, so the spare width cannot be spent on vehicles, and spending it on wider bays
   would make the painted spaces less true, not more. It is a small car park on a gravel site, which
   is at least a scene rather than an empty band. Only a taller viewport fixes it.

### 11.7 Verification

Real Chrome under Playwright, against Vite from this worktree, port 5234. `tools/shoot-car-park.mjs`
gained `--picker-only`, `--level`, `--cargo` and `--depart`: `--level 3` is how a coned bay and its
chip are seen, and `--depart animal-lorry --cargo ''` clicks the lorry's bay with a real mouse and
photographs where she stops.

Screenshots in the session scratchpad, `picker-no-building/`:
`nobuilding-picker-820x620.png`, `nobuilding-picker-1024x700.png`, `nobuilding-picker-1024x768.png`,
`nobuilding-picker-874x402.png`, `locked-picker-820x620.png`, `locked-picker-874x402.png`,
`depart-depart-820x620.png`.

`pnpm -r typecheck` green. `pnpm -r test`: 925 game-logic and 559 apps/game, all passing (550 before;
the picker describe went from 23 to 32 tests).

**Lint has one error and it is not mine**: `car-park.ts:521` adds a tween straight to the scene
(`scene.tweens.add` in the arrow plate's press animation), which the reduced-motion rule forbids
outside the legacy list, and `car-park.ts` is not on that list. It is there at `855f340`, before this
branch, and `car-park.ts` belongs to the other agent, so I left it. It wants `stateTween` or
`decorativeTween` from `ui/tween.ts`.

## 12. No exit road either, and she leaves through the bottom of the frame

Second and third commits on `claude/picker-no-building`, 2026-10-09. Section 11 is the first.

### 12.1 What Marcus decided

Both of section 11's open questions, and they went opposite ways:

- **The locked grey tint stays dulled.** Recorded in 11.4; do not "fix" it to grey.
- **The exit road comes off the picker.** Against this note's own recommendation, and on this note's
  own arithmetic: at the scale the fleet is now drawn the road is 0.70 to 0.76 of a metre, narrower
  than Trikey's handlebars, and **a thing that does not read as a road should not be drawn as one**.
  The loading screen already handles having no room for a road by not having one, so the two screens
  now agree.

Also in these commits: the bays are in size order (11.6), and the `setDepth` finding is written into
`.claude/TRAPS.md`.

### 12.2 What moved off `roadY`

The road was the near edge everything below the bays measured itself against. Four things did:

| Measured against the road | Now |
|---|---|
| `pickerLayout`'s band: `roadY − 30 − apronTop` | `height − PICKER_EXIT_GROUND − apronTop`. 48px of gravel at the near edge: a cone at a locked bay is 34px tall and stands 4px below the tarmac, so it reaches 21px down, and the rest is ground enough that the car park ends in a surface rather than at the frame. |
| `drawForecourt` drawing the road and returning `roadY` | Draws no road, returns `groundBottom` (the frame). The gravel it starts with already covered the frame, so taking the road off left ground, not a hole. |
| `pickAndDepart` aiming her nose at the middle of the road | Aims it at `height − PICKER_EXIT_MARGIN` (8), the edge of the site. |
| The test `keeps the cone clear of the lane` | Asks instead that the car park ends on ground: `height − (apron.y + apron.h) ≥ PICKER_EXIT_GROUND`, and the cone inside the frame. |

Nothing else was anchored to it. The chip row and the names were already measured off the apron's own
bottom, and the apron's bottom is the fleet's extent (11.2), so they followed without touching.
**`renderParking`, the "Time for a drive!" start prompt, keeps its own road** at `height * 0.88`: it
is a different screen with a different vehicle size, and it was not in the decision.

### 12.3 The departure: pull out, ask, leave

The flow is now three steps, and the middle one is the question:

1. **The pick pulls her out of her bay** to the car park's exit, nose 8px off the bottom of the frame,
   **whole and still in the picture**. Measured at 820x620: Big Tilly stands at y 219 to 612 of 620.
2. **"Which way?" is asked while she is standing there** — out of her bay, with somewhere to go. The
   question had to move: asking it mid-exit is a question about something already happening, and
   asking it once she is gone is a question about a vehicle the child cannot see.
3. **The answer sends her out through the bottom of the frame.** Her centre goes a whole length past
   the bottom edge, which clears her rear of it by half a length however she is angled, and she swings
   18° and drifts a seventh of the screen the way she is going, so Left and Right are two different
   pictures rather than one animation behind two buttons. The forecourt has no road to turn along; the
   90° turn belongs to the screen that has one.

**The question is taken away the moment it is answered**, on both screens. A vehicle driving out of
the picture under a plate still asking which way she is going is the screen contradicting itself.

**Reduced motion was the trap here, and it is why the departure is a `stateTween`.** The end state is
load-bearing: everything after the tween assumes an empty forecourt. `stateTween` applies the end
value at once under reduced motion and still calls back — **but only a value it can read, and a
relative `` `+=${dy}` `` is a string it leaves alone.** Written the old way, a child with reduced
motion would have got the callback with the lorry still sitting in her bay. So `driveTogether` gives
each target — the vehicle and both shadow layers — its own absolute number. Verified with Chrome under
`prefers-reduced-motion: reduce`: 60ms after the answer, `arrived` is true and her top edge is at 805
on a 620px screen.

Measured at all four viewports, with the lorry as the hard case:

| | 820x620 | 1024x700 | 1024x768 | 874x402 |
|---|---|---|---|---|
| Waiting at the exit (top, height, frame) | 219, 393, 620 | 217, 475, 700 | 264, 496, 768 | 217, 177, 402 |
| Whole and in frame | yes | yes | yes | yes |
| Top edge when the flow says gone | 805 | 923 | 1001 | 485 |

### 12.4 Verification

Real Chrome under Playwright, port 5234. `tools/shoot-car-park.mjs` gained `--turn left|right` and
`--reduced` on top of `--picker-only`, `--level`, `--cargo` and `--depart`. `--turn` stubs out
`beginTravel` before answering, so the forecourt is still on screen to measure once she has left —
otherwise the travel phase rebuilds the container the instant the tween completes and there is
nothing to look at.

Screenshots in the session scratchpad, `picker-no-building/`:

| File | What it shows |
|---|---|
| `noroad-picker-820x620.png` | The picker, no building, no road, bays in size order |
| `noroad-picker-1024x700.png`, `noroad-picker-1024x768.png`, `noroad-picker-874x402.png` | The same at the other three |
| `locked-picker-820x620.png`, `locked-picker-874x402.png` | Bea, Spark and Big Tilly coned off with their chips, at the new scale |
| `exit-depart-820x620.png` | Big Tilly waiting at the exit, whole, with "Which way?" |
| `exit-leaving-820x620.png` | Mid-departure: she is going out through the bottom edge, the question gone |
| `exit-gone-820x620.png` | The forecourt after she has left |
| `reduced-gone-820x620.png` | The same under `prefers-reduced-motion: reduce` |

`pnpm -r typecheck` green. `pnpm -r test`: 925 game-logic and 565 apps/game (550 at the branch point).
The picker describe is 38 tests, from 23.

**Lint still has the one error that is not mine**: `car-park.ts:521`, a tween added straight to the
scene outside the reduced-motion legacy list. It is there at `855f340` and the file belongs to the
other agent.

### 12.5 One thing I would look at next

**The two desktop viewports are now width-bound**, 820x620 as well as 1024x768: five bays across the
screen decide the scale, not the height. The band follows the fleet so none of it is wasted, but it
does mean a taller screen buys those two nothing — 1024x768 draws the same 76.8px to the metre it did
before the road came off. The only lever left is `usable`, the apron's 92% of the viewport width, and
widening it crowds the frame. Worth knowing before anybody asks why a bigger window did not make the
lorry bigger.
