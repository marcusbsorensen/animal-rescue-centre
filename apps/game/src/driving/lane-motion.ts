/**
 * lane-motion.ts
 *
 * Where across the road the van rides, in metres from the route's centreline,
 * negative to the left (UK, keep left). Ported from drive-spike.html's
 * laneOffset() and the lane half of its step().
 *
 * Two lanes matter to the child. Lane 0 is ours, the taught one. Lane 1 is the
 * overtaking side: the oncoming lane on an ordinary road, and the fast lane on
 * the dual carriageway, where the road is two lanes each way and both of ours
 * sit left of the grass strip. A farm track is single and unmarked, so the van
 * drives down its middle whichever lane is asked for.
 *
 * Two things move the van sideways and only one of them is a swerve. `laneT`
 * is the child's choice, 0 to 1 across, eased at SIDESTEP_MPS: that is what the
 * animals feel and what stepLane reports as swerveMps. `base` is the road's own
 * shape moving under the van (a lane widening, joining the dual carriageway),
 * eased separately and never counted, because following the road is not rough
 * driving (docs/driving-rebuild-2026-10-11.md, "Following the road is not a
 * swerve").
 *
 * The dual carriageway's width is on trial (the same doc): `zoom` keeps true
 * 5 m lanes and world-camera.ts pulls back, `narrow` keeps the camera and
 * shrinks the lanes to 3 m. Both are here so either can be chosen.
 * No Phaser — unit-tested.
 */

/** An ordinary lane, metres. A 5 m lane draws 110 px at the spike's scale. */
export const LANE_M = 5;

/** Road widths in metres by OSM class; the trunk's comes from trunkWidth(). */
export const ROAD_M: Readonly<Record<string, number>> = {
  secondary: 10, tertiary: 10, unclassified: 9, residential: 8, track: 5,
};
/** Width of a class the table does not know. */
export const DEFAULT_ROAD_M = 8;

export type BigRoadMode = 'zoom' | 'narrow';
/** Lane width on the dual carriageway in each trial. */
export const TRUNK_LANE_M: Readonly<Record<BigRoadMode, number>> = { zoom: 5, narrow: 3 };
/** The grass strip between the two carriageways. */
export const RESERVATION_M = 1.6;

/** How fast the child's lane change crosses the road, metres per second. */
export const SIDESTEP_MPS = 7;
/** How fast the van follows the road's own shape moving under it. */
export const BASE_FOLLOW_MPS = 4;

export type Lane = 0 | 1;

/** Four lanes and the reservation. */
export function trunkWidth(mode: BigRoadMode): number {
  return 4 * TRUNK_LANE_M[mode] + RESERVATION_M;
}

export function roadWidth(cls: string, mode: BigRoadMode): number {
  return cls === 'trunk' ? trunkWidth(mode) : (ROAD_M[cls] ?? DEFAULT_ROAD_M);
}

/** Lateral offset of a lane's centre from the route's centreline, metres,
 *  negative to the left. With no class it answers for an ordinary two-lane
 *  road of LANE_M lanes, which is what the spike's traffic module assumes. */
export function laneOffset(lane: Lane, cls: string | null, mode: BigRoadMode = 'zoom'): number {
  if (cls === 'trunk') {
    const w = TRUNK_LANE_M[mode];
    return -(RESERVATION_M / 2 + (lane === 0 ? 1.5 : 0.5) * w);
  }
  if (cls === 'track') return 0;
  const quarter = (cls ? roadWidth(cls, mode) : 2 * LANE_M) / 4;   // a lane is half the road
  return lane === 0 ? -quarter : quarter;
}

export interface LaneState {
  /** Lane the child asked for. */
  want: Lane;
  /** 0..1 across from lane 0 to lane 1, the child's own sidestep. */
  t: number;
  /** Lane 0's offset as the van has followed it; null before the first step. */
  base: number | null;
}

export function createLaneState(): LaneState {
  return { want: 0, t: 0, base: null };
}

export interface LaneStep {
  state: LaneState;
  /** Where the van now rides, metres from the centreline. */
  offset: number;
  /** Sideways speed from the child's lane change only, m/s. Feeds the jostle. */
  swerveMps: number;
}

/**
 * Advance the lane by dt seconds. off0 and off1 are lane 0's and lane 1's
 * offsets where the van is now (laneOffset(0, cls), laneOffset(1, cls)).
 */
export function stepLane(prev: LaneState, off0: number, off1: number, dt: number): LaneStep {
  const span = Math.abs(off1 - off0) || LANE_M;
  const stepT = (SIDESTEP_MPS * dt) / span;
  const dT = Math.max(-stepT, Math.min(stepT, prev.want - prev.t));
  const t = prev.t + dT;
  let base = prev.base ?? off0;
  const follow = BASE_FOLLOW_MPS * dt;
  base += Math.max(-follow, Math.min(follow, off0 - base));
  return {
    state: { want: prev.want, t, base },
    offset: base + t * (off1 - off0),
    swerveMps: dt > 0 ? (Math.abs(dT) * span) / dt : 0,
  };
}
