# Front / rear vehicle sprites (perspective fix)

_2026-07-10. From Marcus's orientation review._

## Problem
Some top-down vehicle sprites were rendered from a **front-¾ angle**, not straight
overhead — you see grille, headlights and windscreen. The game uses ONE sprite per
vehicle and rotates it 180° for oncoming traffic. Rotating a front-¾ sprite puts the
front detail at the back with no matching rear detail, so it looks like the vehicle
is **lifting off and flying toward us** instead of driving away.

## Decision (Marcus)
Don't flatten them — a front-detailed view is *good* for oncoming traffic (it's
coming at us, we should see its face). Instead, use a **front/rear pair** for the
affected vehicles:
- **Same-direction** (the player's own vehicle + traffic going our way, driving
  away up-screen) → a **rear-view** sprite (we see the back), drawn nose-up.
- **Oncoming** (opposite lane, coming toward us, down-screen) → the **existing
  front-view** sprite, used **as drawn** (no 180° spin).

True top-down sprites (the ones Marcus did NOT flag) look fine either way and keep
a single sprite.

## To do
1. Get Marcus's flagged list (the front-¾ vehicles) from the orientation tool.
2. Render **rear-view** claymation sprites for each flagged vehicle (nose-up, we see
   the back — tailgate/rear doors/lights, no windscreen), matching the fleet style.
3. Rendering change: a vehicle can carry a `rear` sprite (same-direction) and a
   `front` sprite (oncoming). Same-direction traffic + player van use `rear` at
   angle 0; oncoming uses `front` at angle 0 (already faces down). Vehicles without
   a pair keep today's single-sprite + 180° behaviour.

## Flagged list (Marcus, 2026-07-10) — front-¾, need rear views
henry, car-red, car-blue, car-yellow, tractor, ambulance, bus, trikey, big-tilly.
(12/21 are true top-down and keep a single sprite: pickup, truck, motorbike,
binlorry, skiptruck-*, bea, spark, etc.)

The current sprite for each flagged vehicle = the FRONT / oncoming view (front
faces down). Add a `<key>-rear` top-down sprite (nose-up, back visible) for
same-direction. Rendering: same-direction traffic + player van → `-rear` at angle
0; oncoming (flagged kinds) → the front sprite at angle 0 (no 180° spin);
non-flagged oncoming keeps the existing 180° flip.

## Also requested: side + back ELEVATION views of the ARC fleet
Trikey, Henry, Bea, Big Tilly, Spark — side-profile and rear-elevation views (for
the picker cards and the future crate-loading loading-door view). Distinct from the
top-down rear views above. Framing/use to confirm with Marcus.

## Notes
- Applies to the player's chosen fleet vehicle too (we always see its back), so
  flagged fleet vehicles need a rear view for the on-road/bay view; the front view
  can still front the picker card.
