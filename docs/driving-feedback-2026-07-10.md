# Driving playtest feedback — 2026-07-10 (Marcus)

From playtesting the claymation build.

## 1. Initial / pre-drive screen — match the pre-drive mockup (BIG)
The start screen (ARC house + bare parking strip with just Henry) should match the
**`admin/pre-drive.html`** layout for visual consistency with the tunnel/site game:
warm wooden-panel cards, a "Where are we going?" destination card, and a **"Which
vehicle?" picker** showing the fleet — Trikey, Henry, Bea, Big Tilly, Spark — each
with Slots / Fuel / unlock-level. **Scope to confirm with Marcus:** full functional
vehicle picker vs. a visual reskin of the current single-bay start.

## 2. Car too small in the car park + orientation unclear
Henry in the parking bay is too small and it's not clear he's facing the right way.
Make him bigger and unambiguously nose-up. (Quick fix within the current parking
render, independent of #1.)

## 3. Parking → drive transition (change the feel)
Current: on Turn Left/Right the car turns that way, then ends up facing up on the
gravel, then the screen swaps — feels odd. **Wanted:** the car **drives off the
LEFT/RIGHT edge** of the screen; then the road screen appears and the vehicle
**drives on from the bottom in 1st gear** into position.

## 4. Reversing must not shunt traffic
On the road, reversing currently **pushes vehicles behind the van backwards**.
Instead they should all **come to a stop** (no accidents); the van can't reverse
through them. The player then drives forward in a lane to get around obstacles.

## 5. Overtaking near-miss with animals aboard
When overtaking, if a collision is about to happen **and there are animals in the
car**, the **oncoming vehicle stops AND the player's car stops** (no crash) — then
the player waits for a **gap in the traffic** to pull back into their correct lane.
(Extends the existing "oncoming waits while overtaking" with a hard stop + a
forward cap so the van can't ram the held oncoming queue.)

## Plan
- #2, #3, #4, #5 are contained mechanics/render fixes — do now, verify in-engine.
- #1 is a larger feature (mockup: `admin/pre-drive.html`) — confirm scope first.
