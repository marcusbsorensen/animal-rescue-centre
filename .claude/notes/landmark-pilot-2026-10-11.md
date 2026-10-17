# Landmark pilot, 2026-10-11: station, car wash with Steve, petrol pump

**Status: NOT SUBMITTED.** The pre-submit credit check failed the stop rule, so no Manus task was created, nothing was uploaded, and there is no task id. The brief below is finished and reconciled, and is ready to send in one call once the balance is confirmed. Source rules: `docs/manus-sprite-rules.md` (2, 6, 7, 8), `.claude/notes/van-repaint-2026-10-09.md` (how a brief is built), `docs/naming-places.md`, `docs/world-coherence-rule-2026-10-11.md`.

| | |
|---|---|
| Manus task | none (not submitted) |
| Submission time | none |
| Credits, pre-check | 04:17 UTC (05:17 BST), 2026-10-11: **47,544 booked since the 2026-09-29 grant of 40,000, so about -7,544 by ledger arithmetic** (the brief expected about +9,800) |
| Credits, post-check | 04:23 UTC (05:23 BST): about **47,882 booked, about -7,882** (see section 1). Falling, not steady |
| Files committed | this note only |

## 1. The credit check

`manus_credit_usage` is a ledger, not a balance. I read the first page (100 rows), which runs back past the grant, so everything above the 2026-09-29 "Manus Pro +40,000" row is spend since it: 66 cost rows, **47,544**, no refunds among them. 40,000 minus 47,544 is **-7,544**.

- **Against the 9,800 in the brief.** 9,800 corresponds to 30,200 spent. 17,344 more has been booked since that figure was worked out. It is the Pfish decor batch: 21 tasks, 10,466 credits, in the 20 minutes up to 04:17 UTC, the last row stamped two seconds before I read the clock. Before it, Pfish had already booked about 15,500 on 2026-10-10.
- **Still drawing.** Six minutes later the six newest rows were the same Pfish tasks re-stamped at higher totals: S7-3 333 to 410, S8-2 517 to 634, S7-2 390 to 430, S10-3 468 to 529, S6-2 628 to 664, S8-1 506 to 513. That is +338 in six minutes from six rows alone. The second read fetched only six rows, so the other fifteen tasks in the burst, if they also grew, are not in the post figure of about 47,882.
- **What the ledger cannot show.** Daily or bonus credits, add-on packs, anything carried over from before 09-29 (the page I did not read holds the early-September Pfish costs and refunds). The true balance may be better than the arithmetic. Neither I nor the API can see it; the Manus usage page can. The rule in the task is to stop when the pre-check suggests materially less than 9,800, and this suggests nothing left, so I stopped.
- **Budget it was held against:** 1,500 expected, 2,500 hard stop.

## 2. To send it (about five minutes once the balance is known)

1. Read the balance on the Manus usage page. Send only if at least about 3,000 is genuinely free and Pfish is not still running (it was, at 04:23 UTC).
2. `manus_upload_file` for each of the five rasters in section 5. They are palette PNGs, 130 KB in all, so about 175 KB of base64 has to be passed through the tool call, which is a large call. No smaller route exists: the tool takes base64 only, and Rule 6 says the originals, not copies.
3. `manus_create_task`: profile `manus-1.6-max`; title "A.R.C. map landmarks pilot: Birchie station, Steve's car wash, petrol pump (painted to match the ships and tractors)"; `message.content` the text in section 6 plus the five uploaded files as file parts. The earlier commissions linked URLs, so there is no previous file-attachment call in this repo to copy; check the part shape against the tool's own schema.
4. One `manus_get_task` and one `manus_credit_usage` afterwards. Do not poll. Stop at 2,500 by `manus_stop_task` only if a single look shows it passed.
5. Retrieve with `manus_download_output` into `manus-output/landmark-pilot/`, never into the repo. Take only the final four files.

## 3. What I corrected in the May brief (`docs/manus-prompts-birchie-map-landmarks-2026-05-19.md`)

| May said | Now | Why |
|---|---|---|
| Style: "match the A.R.C. Art Deco building exactly" (`arc-main-building.png`), palette cream `#fef9ef`, honey `#f0c870`, sage `#a8c890`, red `#d63838` | Style target is the five watercolour rasters, described in words with numbers measured on them (section 6) | Marcus's decision today. The five differ from the building: almost no outline, soft coral red (201,83,75) not (214,56,56), median saturation 0.28 to 0.53 |
| Station, petrol station, car wash drawn **top-down or top-down 3/4** | **Straight-on elevation** for all three | Rule 7 (buildings, props, characters are front elevations) and the rasters are side elevations. Plan view is one of the three idioms the pilot removes. May's own wiring table puts them in the same slots as the elevation POIs |
| Asset 1: a whole forecourt with tarmac and tyre marks, two pumps, shop, canopy, "P" sign, 400x280 | **One petrol pump**, 36x34 map units, no ground | Marcus chose "the petrol pump". The slot is 36x34 units, where a forecourt could not read. Painted tarmac breaks Rule 2. A "P" is a parking sign; a fuel drop replaces it |
| Asset 2: "Steve" a uniformed man with a sponge, yellow shirt, blue dungarees, blue cap, with a wash bay and a hanging sign "SUDS 'N' STEVE'S" | Steve is the **inflatable tube-man**: blue dungarees, red shirt, blue cap, one arm waving, red "CAR WASH" down the tube, black fan base. Beside a small red hatchback. No wash bay, no sign | `docs/ptv-pet-transport-vehicle.md` ("Wavy-arm guy"), `scene-assets/reference/birchie-west-entrance/README.md`, and the SVG's own comment at the car wash. May's Steve is a different character. The map draws the name "Suds 'n' Steve's" as a label |
| Asset 12: sign "BIRCHIE STATION", platform strip with a bench, rails out of both ends, 300x180 | No painted text; no platform, rails or ground; a canopy on iron posts says "station" instead; **no train** (the old icon was a carriage, hence "reads as a bus") | Text on a 60-unit sprite is 3px on screen and a misspelling is a defect in a child's map; Rule 2 forbids ground |
| Pixel sizes 400x280, 500x400, 300x180 | **240x160, 240x192, 144x136** | Four times the live slots (section 4). The five rasters are drawn at 3.3 to 4.8 times their on-map size, so four times is the same density |
| Filenames `*-topdown.png` | `birchie-station.png`, `suds-n-steve.png`, `petrol-pump.png` | No longer top-down. Matches the rasters' names |
| SVG placements: pump (380,738), wash (500,673), tractors y=920 and y=900 | Pump marker (378,754), car wash (486,687), station marker (770,470); tractors at (712,834) and (1257,851) | The landmarks moved in `2b91d5d` and `2af5ff4`. The sizes of the five rasters in the SVG are unchanged |
| Painted ground, soft shadow nowhere stated | **No ground and no shadow** | The five float without one. Rule 2 would allow a small oval shadow; matching the neighbours wins, and the SVG can draw one |
| Verify with magenta and black backgrounds | Composite on `#fef9ef` and `#808080` and look for a fringe | Same test, on the colours the map pieces actually meet |
| No seasonal consideration | One neutral state, see section 7 | `docs/world-coherence-rule-2026-10-11.md` |
| The doc's other briefs echo real local businesses | Not touched. None of these three names a real business; the brief carries no place or business name | `docs/naming-places.md`. The SVG's `#wash-bandits` id is not repeated in the brief |

## 4. The slots, read from the live SVG (`birchie-roads.svg`, viewBox 1800x1121, `xMidYMid meet`)

| Piece | In the SVG now | Slot used | Delivered |
|---|---|---|---|
| Station | marker `translate(770,470)`, icon at `translate(0,-44)`: train pictogram x 740-800, y 414-448, so 60x34. Label 22px below | 60x40 | 240x160 |
| Car wash | `#wash-bandits` at `translate(486,687) scale(1.15)`: pictogram about 43x33. The SVG comment says the painted Steve "wants him beside a car, ~60x48". Label 14px at y 720 | 60x48 | 240x192 |
| Petrol pump | `.fuel-marker` at `translate(378,754)`, icon `scale(1.3)`: about 36x33. Label 14px at y+34 | 36x34 | 144x136 |

Neighbours on the map (`<image>` lines 1020 to 1066): cargo-ship-large 180x60, passenger-ferry 160x65, cargo-ship-small 135x48, tractor-classic 80x44, tractor-with-trailer 100x42.

Measured on the five (opaque pixels): median HSV saturation 0.28 to 0.53 (ferry 0.03); 200 to 220 colours; 1 to 2% of canvas semi-transparent; darkest 8% between (25,46,79) and (72,57,62); no pure black. Dominant colours: navy (50,70,100), wash blue (123,164,223), tractor coral (201,83,75) to (227,131,124), ferry stripe (218,52,53), cream (244,250,210), stone grey (127,131,132), tan (197,164,127).

## 5. Attachments (originals, `apps/game/public/admin/scene-assets/birchie-map/`)

| File | Size | sha256 (first 12) |
|---|---|---|
| `cargo-ship-large.png` | 600x200 | 39c719a65e38 |
| `cargo-ship-small.png` | 480x170 | 5cbb63ffb232 |
| `passenger-ferry.png` | 540x220 | 626eedda50a9 |
| `tractor-classic.png` | 360x200 | 127ed34cb94c |
| `tractor-with-trailer.png` | 480x200 | 1deac4ade3aa |

**Not attached: the tube-man photograph.** `scene-assets/reference/birchie-west-entrance/thumbnail.jpg` is the plan of record for Steve's design, but it is a vendor's product shot with the company's name captioned across the tube and a copyright watermark across the middle, in a warehouse. A crop would drop the caption and the mark and keep the warehouse. Steve has no painted art to match, so Rule 6's continuity stakes are low, and the brief describes him in words from the PTV doc instead. If Marcus wants the face matched, crop the head and torso (about x 190-490, y 85-500 of the 1280x720 frame) and attach it as "the figure only, ignore the photo".

## 6. The brief as prepared (not sent)

```text
FOUR pictures in one task: three painted landmarks for a children's game map, and one check sheet. The players are autistic children aged 3 to 8, so clarity and sameness beat decoration. Read the whole brief before drawing. Make exactly the files asked for: no alternatives, no extra variants, no extra files.

=== WHAT THIS IS, AND WHY ===
The game has a map of a seaside village. Its landmarks are drawn three different ways at once (flat vector icons, painted watercolour pieces, plan-view vector) and the map reads as unfinished. We are replacing the three worst flat icons with painted pieces that sit BESIDE five painted pieces that already exist, so the whole map reads as one hand. The three: the village railway station (the old icon reads as a bus), the car wash with its inflatable figure Steve, and a petrol pump. This is a pilot: a larger set follows only if these three sit comfortably beside the five.

=== STOP CONDITION: READ FIRST ===
Five files are ATTACHED to this message (not linked). They are the paintings the new three must sit beside:
  1. cargo-ship-large.png        600 x 200
  2. cargo-ship-small.png        480 x 170
  3. passenger-ferry.png         540 x 220
  4. tractor-classic.png         360 x 200
  5. tractor-with-trailer.png    480 x 200
Open all five before drawing. If you cannot open any of them, STOP and tell me which: do not draw from this description alone. In your first reply, say which of the five you opened.
HOW THEY ARE USED: they go, unaltered, on the check sheet, and they show the hand to match. They are NOT subjects. No ship, boat, container, funnel, sea, tractor, farm machine or wheeled farm vehicle appears in any of the three new pictures, and no shape is copied from them. The style is described below in words, with numbers measured on them.

=== THE HAND, IN WORDS AND NUMBERS ===
Loose watercolour storybook: soft transparent washes with visible pigment pooling and a few lifted-paper highlights; simple, blocky, friendly shapes; small details DRAWN with a fine brush, not modelled; crisp, slightly irregular edges. Almost no outline: the cargo ships carry a thin dark-navy edge, the ferry none, the tractor only dark warm-grey on its tyres. Never black.
Measured on the five (opaque pixels):
- Muted washes, not paint-pot colour: median HSV saturation 0.28 to 0.53 on the coloured pieces (the white ferry 0.03).
- Colours in use: navy (50,70,100) and deeper (33,56,89); wash blue (123,164,223) and (96,131,175); soft coral red on the tractor (201,83,75) to (227,131,124); the ferry's stripe red (218,52,53); cream (244,250,210) to (253,246,223); stone grey (127,131,132); warm tan (197,164,127) and terracotta (203,127,86).
- The darkest 8% of opaque pixels sit between about (25,46,79) and (72,57,62). Nothing is pure black.
- Edges: 97% or more of the silhouette is fully opaque (alpha 250 or more), and only 1 to 2% of the whole canvas is semi-transparent: a clean, slightly rough edge, not a feather.
- 200 to 220 distinct colours each. The finished files are quantised to 256, so avoid grain, noise and soft gradients that would band.
- View: straight-on ELEVATION at eye level, like the ships and the tractors. Flat. No perspective, no top-down, no view from above, no isometric.
- No sun: no hard cast shadow, no glare, no rim light.
BLOCKLIST (will be rejected): anime, chibi, kawaii, flat vector shading, cel-shading, 3D render, plasticine, glossy or specular highlights, photorealism, pixel art, sci-fi.

=== RULES FOR ALL THREE ===
- Transparent PNG, RGBA, fully clear outside the painted piece. No white halo, grey checkerboard or rectangle behind the subject. Test it: composite on #fef9ef and on #808080; no light or dark fringe on either.
- NO ground and NO shadow of any kind: no tarmac, road, forecourt, pavement, kerb, grass, platform, rails, painted or soft shadow. The five neighbours float without one and so do these; the map draws the ground. Everything under the piece is transparent.
- Each piece is drawn WHOLE and large in its canvas: the painted silhouette comes within 12 px of the canvas edge on its longer side and leaves at least 8 px clear on every side. Nothing is cut off by the canvas.
- NO TEXT, except Steve's tube lettering named below. No lettered signs, no station name, no brand. The map writes every name itself. Boards stay blank.
- No real business, brand, charity or place name anywhere in the art.
- SEASON-NEUTRAL: the map changes with the seasons, so these must say no month and no weather. No snow, frost, ice, leaves, blossom, flowers, bunting, wreaths, fairy lights, puddles, rain or mist. Lamps off, windows plain glass, no night glow. Bare, clean roofs.

=== THE THREE, ONE BY ONE ===
Filenames (exact), canvas in pixels. On the map each is shown at one quarter of this size, in map units.

1. birchie-station.png, 240 x 160. A small village RAILWAY STATION BUILDING, front elevation, the facade facing us. It must read as a station at a glance, not as a bus, a house or a shed.
   - Cream walls (about (244,250,210)); a pitched roof of clay tiles in the tractor's soft coral red (about (201,83,75)), a plain clean ridge, no chimney smoke.
   - Two tall arched windows with pale blue glass (about (123,164,223)) in sage-green frames.
   - A round station clock, white face and plain dark hands showing three o'clock, centred in the front gable.
   - A flat canopy along the front on two slim dark-grey iron posts, with a blank wooden name board hung under it (no letters) and one black bench beneath. The canopy is what says "station".
   - No train, no carriage, no rails, no platform surface, no people.

2. suds-n-steve.png, 240 x 192. STEVE, an inflatable fan-powered tube-man, standing beside a small red hatchback car, both in side elevation, as one little scene.
   - Steve: a tall, soft, slightly bent tube body in blue (about (123,164,223)) for his dungarees; a red shirt collar and sleeves (about (218,52,53)); a round pink cartoon head with a big friendly open smile and two plain dot eyes; a soft blue cap. One arm raised and waving (his right), the other low by his side. He stands on a small black fan base. Red capital letters C A R  W A S H run down the tube, one under another, spelled exactly so, in a plain hand-painted sans. He is floppy and friendly, not rigid, not scary.
   - Steve is about one and a half times as tall as the car.
   - The car: small, rounded, soft coral red (about (201,83,75)), pale blue glass, grey tyres, cream hubs, facing LEFT, with a few round pale blue-white soap bubbles on its roof and bonnet and a few drifting from Steve's arm. No hose, no wash building, no gantry, no sign.
   - The fan base and the car's wheels rest on one level line.

3. petrol-pump.png, 144 x 136. ONE classic village petrol pump, standing alone, front elevation.
   - Tall rounded body in honey amber (about (227,176,75)) with a darker amber cap; a cream panel near the top holding two plain round dials with no numerals; a black hose looping from one side to a nozzle resting in its holder on the other.
   - A small round sign on top: a blank cream disc with one red fuel-drop shape painted on it. No letter.
   - No forecourt, kiosk, canopy, car, second pump, brand or text.

=== THE CHECK SHEET ===
check-sheet.png, 1800 px wide. Draw all eight pieces in one row at map scale, each at its on-map size times 2, with the five attached files unaltered (scaled only). On-map sizes in map units (width x height): cargo-ship-large 180x60, cargo-ship-small 135x48, passenger-ferry 160x65, tractor-classic 80x44, tractor-with-trailer 100x42, birchie-station 60x40, suds-n-steve 60x48, petrol-pump 36x34.
Panel A: the row on cream #fef9ef. Panel B: the same row on mid grey #808080. Panel C: the same row at times 1, the real size, on cream. Label each piece with its filename in small plain type under it. The check sheet is a viewing aid, not art: no scene, no ground.

=== DELIVERY ===
Exactly four files, attached in the final message: birchie-station.png, suds-n-steve.png, petrol-pump.png, check-sheet.png. Do not attach anything else.
In your reply give, for each of the three: the pixel size; the share of canvas pixels that are fully opaque and the share that are semi-transparent; the median HSV saturation of its opaque pixels; the colour of its darkest 8%; and its number of distinct colours. List which of the five attachments you opened. Tell me everything you decided that I did not specify.
One pass. If your self-check fails a piece, redo that piece ONCE and no more. Do not make variants.

=== SELF-CHECK BEFORE DELIVERY ===
For each piece ask: "Does this look painted by the same hand as the five attached? Would a child know what it is at 60 pixels wide? Is there any text, ground, shadow, season or weather cue, ship or tractor? Is anything cut off? Is there a halo on cream or grey?" If any answer is wrong, redo that piece once.
```

## 7. Seasons (`docs/world-coherence-rule-2026-10-11.md`)

Only the station has a seasonal variant on the map today: `#winter-snowcaps` draws a snow path over the old carriage roof (`M749,418 ... 791,412`, 42 units wide). The car wash and the pump have none. The three are commissioned in **one neutral state**: bare roofs, no flowers, bunting, leaves, puddles or lit windows, no sun or shadow, so none contradicts any season, weather or phase (silence, not a cue). The winter snow stays an SVG overlay. **Whoever installs the station must re-register that cap to the new roof**, or winter will draw snow floating beside a tiled roof. Foam and soap bubbles on the car are not a season cue. Steve's outfit does not change with the year.

## 8. For Marcus, recommendation first

1. **Confirm the real balance before anything is sent.** Recommended: read it on the Manus usage page and send only with at least about 3,000 free and Pfish idle. The ledger says it is overdrawn by about 7,500 and Pfish is still booking.
2. **No painted text on the station or the car wash** (the map writes the names; the one exception is "CAR WASH" down Steve's tube). Recommended. The alternative is a painted "BIRCHIE STATION" board, which will be 3px high at map scale and may come back misspelt.
3. **The car wash slot is 60x48**, as the SVG's own comment says, against the 43x33 pictogram it replaces; it will be the biggest of the three. Recommended: keep 60x48, since Steve is the point of it. Smaller would shrink Steve below the station's clock.
4. **The petrol piece is one pump, not a forecourt.** As decided. A forecourt with kiosk and bunting (the PTV doc's picture) is a different, larger asset for a different slot.
5. **No shadow under any of them**, to match the five. The SVG can draw the soft oval the car wash pictogram already has.
