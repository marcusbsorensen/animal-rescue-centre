# Overtaking on single carriageways — design

_2026-07-09. Marcus's request: steering should work on single carriageways so
Lily can overtake, with automatic safety so she can never actually crash head-on._

## The three behaviours (Marcus's words)

1. **Overtake when clear** — left/right steering works on a single carriageway so
   she can pull out and overtake when there's no oncoming traffic.
2. **Bounce back on an unsafe pull-out** — if she pulls out to overtake when an
   oncoming vehicle is already in the space she'd move into, her van turns back
   in automatically, like it bounces off (no damage).
3. **Oncoming stops and waits** — if she's made it into the oncoming lane but
   there's no space to pull back in yet, the oncoming traffic stops and waits
   until she pulls back into her own lane.

## Decision taken

- **Overtaking is gated by the centre-line markings** (Marcus chose "only where
  dashed"). Double-solid = refused with the little bounce; dashed = permitted
  (if the oncoming lane is also clear). This keeps faith with the realistic
  markings already built and teaches the real rule.

## Lane model (already in place)

Global lane indices `0..total-1`, left→right. Player holds `0..playerLanes-1`;
oncoming holds the rest. Country lane: lane 0 (player) + lane 1 (oncoming).
`laneCentreX(geo, lane)` maps any global index to screen x.

Overtaking crosses from the fast player lane (`playerLanes-1`) into the first
oncoming lane (`playerLanes`). It only applies where there IS an oncoming lane
painted with a line — i.e. `oncomingLanes >= 1 && divider === 'line'`. So:

| Road | Overtake into oncoming? |
|------|--------------------------|
| Country lane (1+1, line) | yes |
| Rural track (1+1, line) | yes |
| Coast road (1+0, line) | no oncoming lane to use |
| Thanet Way (2+2, reservation) | no — grass median; the two player lanes already interchange |

## Mechanics

New scene flag `overtaking: boolean` — true while the van sits in the oncoming
lane. `drive.lane` stays within the player's own lanes throughout (so the
existing clamps and traffic logic are untouched); the van is simply _rendered_
in the oncoming lane while `overtaking` is true.

**Pull out (tap towards the centre from the fast lane):**
- refuse (bounce) if the centre line is solid at the van's position, or an
  oncoming car is within the danger window of the target lane;
- otherwise glide across, `overtaking = true`.

**Pull back (tap towards the kerb while overtaking):**
- refuse (bounce) if a same-direction car is beside the van in the home lane —
  she has to wait for the gap;
- otherwise glide home, `overtaking = false`.
- The return check is enforced **always** (even on animal-free "go nuts" routes):
  the whole point of behaviour 3 is that she returns only into real space.

**Oncoming waits (behaviour 3):** while `overtaking`, any oncoming car in the
overtake lane that is behind the van (above it on screen, approaching) is held
in a neat queue a safe gap above the van instead of driving through it. When she
pulls back in, they resume. Queue spacing reuses the recycle gap so they don't
stack.

**Markings gate** is single-sourced: `isOvertakingZone(scrollY, y)` in
`drive-render.ts` computes the same dashed/solid band the renderer draws, so the
rule the player sees is exactly the rule enforced.

## Edge cases

- Road switches to a reservation road (Thanet Way) mid-overtake → force
  `overtaking = false` and van home on the rebuild.
- Solid-line stretch reached _while_ already overtaking → she may still complete
  her return; markings only gate _starting_ an overtake.
