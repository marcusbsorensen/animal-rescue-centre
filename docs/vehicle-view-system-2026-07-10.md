# Vehicle view system — storybook 3/4 presentation

> **CORRECTION (2026-07-10): this elaborate 3/4-front/back/side + destination
> system was an OVER-INTERPRETATION and is NOT the plan.** Marcus clarified: all
> vehicles are one consistent **flat top-down** view (bird's-eye from straight
> above) with only a **slight forward bias** so a little more of the front shows
> than the back — exactly like the existing small cars / Henry / tractor. No
> isometric/3-quarter angle, no separate front/rear/side sprites, no destination
> facades in this pass. The strong-3/4 Bea/Spark were rejected for looking like
> they drive diagonally; re-rendered flat. Flagged nose-down sprites just need a
> 180° flip to nose-up (front at top). Kept below only for history.

_2026-07-10. Marcus's direction: move the driving game from flat top-down to
context-appropriate 3/4 / side views, with street-level destinations._

## View per context
| Context | Vehicle view |
|---|---|
| Parked in the ARC forecourt | **3/4 FRONT** (facing us) |
| Pulling out of ARC (turn left / right) | **SIDE** (drives off that side) |
| Main driving screen — player + same-direction traffic | **3/4 BACK** (driving away) |
| Oncoming traffic | **3/4 FRONT** (coming toward us) |
| Pulling in at a destination | **SIDE** |
| Parked at a destination | **3/4 FRONT** (like ARC) |

## Destinations
Each destination gets **street-level building art** (an elevation/facade like the
A.R.C. building) for the pull-in / arrival scene.

## Confirmed (Marcus, 2026-07-10)
- **Keep the top-down scrolling road** (lanes / overtaking / GPS unchanged); only
  the vehicles become 3/4 sprites — 3/4-back when driving your way, 3/4-front when
  oncoming/parked. No perspective/behind-the-car redesign.
- **Sequence:** fleet views first → traffic → destinations. Verify each stage.

## Art program (once confirmed)
Per FLEET vehicle (Trikey, Henry, Bea, Big Tilly, Spark): 3/4-front, 3/4-back,
side (one side, flip for the other). Per TRAFFIC kind: 3/4-back (same-dir) +
3/4-front (oncoming). Destination facades per destination. Suggested order:
1. Fleet 3/4-front + 3/4-back (picker + forecourt + on-road player).
2. Traffic 3/4-back / 3/4-front (fixes the "flying off" flip issue).
3. Fleet side views (pull-out / pull-in transitions).
4. Destination street-level facades.

## Supersedes
The earlier front/rear plan (`vehicle-front-rear-2026-07-10.md`) is folded into
this: "front view" = 3/4-front (oncoming/parked), "rear view" = 3/4-back (driving).
