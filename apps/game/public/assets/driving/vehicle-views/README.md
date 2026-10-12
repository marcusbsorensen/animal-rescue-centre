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
`ambulance`, `fireengine`.

## How each image is drawn

- 512 x 512 px, transparent background, the game's painted style (thin dark
  outline, soft fills), no baked shadow.
- Centred left to right. The vehicle's body (mirrors aside) is **400 px
  wide**: the window scales the image so those 400 px are the vehicle's real
  width, so a tractor and a car come out at their true sizes.
- The bottoms of the wheels sit on the baseline **y = 470**. That line is
  put on the road.
- Seen level, from about a driver's eye height, not from above.

## index.json

The window only asks for the files listed in `index.json`, so a missing
picture never shows as a failed request in the console. After adding a file,
add its name:

    { "views": ["car-red-rear.png", "car-red-front.png"] }

Until a vehicle's picture is listed, the window draws a plain one in the
vehicle's colour (a rounded box with a darker outline, two wheels, lights and
a number plate).
