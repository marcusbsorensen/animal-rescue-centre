/**
 * traffic-sim.ts
 *
 * Pure lane/speed helpers for the decorative traffic. No Phaser — so the
 * lane-speed rules and lane preferences are unit-testable; the per-tick
 * position resolution (which needs live coordinates) lives in the scene.
 *
 * Convention: lane 0 is the slow (left) lane, the highest lane index is the
 * fast (overtaking) lane. Vehicles go faster in the fast lane and slower in
 * the slow lane, UK-motorway style.
 */
import { NUM_LANES } from './drive-state';
import type { TrafficProfile } from './traffic';

/**
 * Speed multiplier for a lane: the slow lane drags, the fast lane flies.
 * Single-lane roads return 1 (no fast/slow distinction).
 */
export function laneSpeedFactor(lane: number, numLanes: number = NUM_LANES): number {
  if (numLanes <= 1) return 1;
  const t = Math.max(0, Math.min(1, lane / (numLanes - 1))); // 0 slow … 1 fast
  return 0.72 + 0.56 * t; // slow lane ≈ 0.72×, fast lane ≈ 1.28×
}

/**
 * The lane a vehicle naturally prefers, by how nippy it is: tractors and
 * lorries hug the slow lane, cars and emergency vehicles favour the fast lane.
 */
export function preferredLane(profile: TrafficProfile, numLanes: number = NUM_LANES): number {
  if (numLanes <= 1) return 0;
  // relSpeed spans ~0.28 (tractor) … 1.6 (emergency). Map to a lane.
  const t = Math.max(0, Math.min(1, (profile.relSpeed - 0.4) / 1.0));
  return Math.round(t * (numLanes - 1));
}

/**
 * A vehicle's absolute pace (px/tick) = its own nippiness × the reference
 * cruising speed × its lane's factor. So the same car is quicker when it's in
 * the fast lane than when it's in the slow lane.
 */
export function carAbsoluteSpeed(
  profile: TrafficProfile,
  lane: number,
  refSpeed: number,
  numLanes: number = NUM_LANES,
): number {
  return profile.relSpeed * refSpeed * laneSpeedFactor(lane, numLanes);
}
