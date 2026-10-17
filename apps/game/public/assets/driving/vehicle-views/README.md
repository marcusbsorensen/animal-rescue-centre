# vehicle-views

Painted views of the traffic from straight behind and straight in front, for
the drive spike's look-ahead window (decision 54B). The window looks forward
from behind the player's van at a driver's eye height, so a vehicle going her
way shows its **rear** and one coming towards her shows its **front**.

## Files

One pair per traffic skin, named after the top-down sprite without `-rear`:

    <type>-rear.png    the back, as seen following it
    <type>-front.png   the front, as seen coming towards you

`<type>` is one of: `car-red`, `car-blue`, `car-yellow`, `pickup`, `truck`,
`tractor`, `tractor-red`, `tractor-blue`, `motorbike`, `bus`, `binlorry`,
`ambulance`, `fireengine`. 26 files, about 700 KB in all.

`tractor-red-*` and `tractor-blue-*` are the green tractor's pictures with a
hue shift on the bodywork only (tyres, glass, metal, seat, hubs, lamps and
the dark outline are the green one's), so the three match exactly. Do not
paint them separately.

## How each image is drawn

- 256 x 256 px, transparent background, the game's painted style (thin dark
  outline, soft fills), no baked shadow (the window lays one under each
  vehicle). Saved as a 256-colour PNG with alpha, 15 to 40 KB each.
- Centred left to right. The bottoms of the wheels sit on the baseline
  **y = 235**; that line is put on the road, at the near end of the vehicle.
- The opaque body, mirrors and wide tyres included, is as wide as the vehicle
  really is (traffic.js KINDS, `width`), so a tractor and a car come out at
  their true sizes. How many pixels that is differs a little from picture to
  picture, so each file's is listed in `index.json`.
- Seen level, from about a driver's eye height, not from above.
- The art was painted at 512 px; the pictures here are those halved, which is
  as large as the window ever draws them (the magnifier included).

## index.json

The window only asks for the files listed in `index.json`, so a missing
picture never shows as a failed request in the console. After adding a
file, add it with where its wheels meet the road, how wide its body is, and
the vehicle's real width:

    { "size": 256, "views": {
      "car-red-rear.png": { "anchor": [128, 235], "bodyPx": 230, "widthM": 1.8, "side": "#db6957" }
    } }

- `anchor`: the ground-contact centre, in the picture's px (x is the middle
  of the body, y the baseline).
- `bodyPx`: the opaque body's width in px. The window scales the picture so
  that these px are the vehicle's width in the world.
- `widthM`: that width in metres, from traffic.js. A record of what the
  picture was cut to; the window uses the live width of the vehicle itself.
- `side`: the colour of the vehicle's flank, which the window lays along its
  length when it can see a side (taken from the `-rear` picture).

Pictures are loaded when first needed, and until one has loaded (or if it is
missing) the window draws a plain one in the vehicle's colour (a rounded box
with a darker outline, two wheels, lights and a number plate).
