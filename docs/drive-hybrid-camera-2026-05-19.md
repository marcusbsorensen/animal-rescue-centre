# Drive — hybrid camera proposal (top-down + cab)

> Status: Design capture, 2026-05-19. Marcus's proposal + Claude's
> assessment. Concerns the **PTV drive** specifically (see
> [`driving-systems.md`](driving-systems.md) for how the three vehicle
> systems differ). Not yet planned for implementation.

## The problem with a single-camera drive

A scrolling pseudo-3D road (scenery rushing toward/past the camera) is
hard to do well: the perspective maths are fiddly, lane-changing feels
imprecise, and constant scrolling can be mildly nauseating — a real
issue for the target player (8-year-old, long sessions).

## Marcus's proposal — two camera modes

Split the drive into two views, each used for what it's good at:

### 1. Top-down travel mode — "negotiating the road"

Bird's-eye view. The vehicle is a sprite the player nudges between
lanes; the player controls speed and reacts to other road users,
junctions, and signals.

- Left/right is literally left/right — no fake perspective, no
  twitchy controls. Same readable space as the tunnel mini-game grid.
- The "verbs of driving" live here: steer, pace, yield, indicate.
- Other vehicles, a junction, a level crossing, a traffic light all
  visible ahead as the road scrolls gently downward.

### 2. Cab / windscreen event mode — "the moments of the journey"

First-person view from inside the cab, looking out through the
windscreen. Used when the drive reaches a **specific scripted event**
on or beside the road.

- The scene through the windscreen is a **static painted tableau** —
  no scrolling, so no nausea, and it can be richly painted (matches
  ARC's storybook aesthetic).
- The player engages with the event: brake for a hedgehog, wait at a
  crossing, honk, wave, look. Care decisions, not reflexes.
- This view IS the cockpit — it naturally rehouses the parked
  rear-view-mirror charm-dangle work.

## Claude's assessment — this is a sound instinct

The two modes pair elegantly: **top-down = the verbs of driving**,
**cab = the moments of the journey**. Each mode does the one thing it
is good at and nothing else. It sidesteps the hard pseudo-3D problem
entirely and removes the nausea risk. Recommended.

### What makes or breaks it: the transition

The switch between modes must feel like one continuous drive, not two
separate screens:

- **Into the cab**: as the vehicle reaches an event marker in
  top-down, the camera *dives* down into the cab over ~0.5s — a
  "leaning in to look" zoom, not a hard cut.
- **Back out**: pull up and back to the bird's-eye.
- Event markers should be **visible ahead** in top-down (a hedgehog
  icon, a crossing-gate icon) so the kid sees the moment coming and
  the switch never surprises them.

### State carries across both modes

Speed, the vehicle identity, and the cargo (crates of animals) persist
across the switch. The cab view can show the rear-view mirror with the
charm dangle + a glimpse of the crates behind — continuity, and it
un-parks the cockpit-mirror feature.

### Keep it gentle (8-year-old)

- Top-down speed: 2–3 discrete steps (slow / cruise), not a continuous
  throttle. PTV carries caring cargo — arguably no "fast" at all.
- Lane changes snap to lanes; no free-drag steering.
- Events are about *judgement and care* (when to brake, when to wait),
  never twitch reflexes.

### Scope — which systems

- **PTV drive** → adopt the hybrid. It is the caring, event-driven
  journey this design is built for.
- **Supply Runs** → leave as the deliberate fast 3-lane arcade mode.
  Chaos is the point there and there are no "stop and engage" events,
  so the hybrid would dilute its tonal contrast.
- **The Depot** → unaffected (stationary puzzle).

## Suggested build order (when greenlit)

1. Top-down travel mode as a standalone scene — vehicle sprite, lanes,
   gentle scroll, speed control, a couple of dummy other-vehicles.
2. Event markers + the dive transition into a placeholder cab.
3. Cab view: painted windscreen frame + one event type (hedgehog
   crossing) as the vertical slice.
4. Port the existing cockpit / charm-mirror work into the cab view.
5. Author the remaining event types (level crossing, traffic light,
   roadside animal, weather).

## Open questions for Marcus

- Does the drive still include the **crate-stacking** adjacency puzzle
  (per `ptv-pet-transport-vehicle.md`), and if so, is that a pre-drive
  loading screen, or does it surface as a cab-view event?
- How long should one PTV drive be — how many events per trip? Suggest
  2–3 events plus arrival, ~60–90 seconds total.
- Should other road users be purely decorative, or can mishandling
  them (not yielding) have a gentle consequence (a comfort-drop on the
  cargo, like the existing hedgehog-brake charm logic)?
