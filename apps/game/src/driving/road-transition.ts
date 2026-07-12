/**
 * road-transition.ts
 *
 * Pure geometry for smooth road-type changes (dual → single carriageway and
 * back). No Phaser — so the world-space maths is unit-testable; the actual
 * banded drawing lives in drive-render.ts and the scene wiring in the scene.
 *
 * Key insight (see docs/plan-road-transitions-2026-07-11.md): `scrollY` and
 * `drive.progress` are the SAME signal rescaled — both accumulate from `rate`
 * each tick, and `progress = scrollY * PROGRESS_PER_SCROLL`. So a route
 * class-boundary (an `untilProgress`) converts to an absolute world-Y once, up
 * front, and each screen row maps back to a world-Y. That lets the road be
 * drawn at DIFFERENT widths on different rows of the same frame — a real merge,
 * narrowing toward the top as you approach — instead of a hard flash-and-swap.
 */
import type { RoadClassRun } from './road-router';
import type { RoadId } from './road-config';

/** `drive.progress` advances as `scrollY * this` each tick — they are the same
 *  signal (mirror of the scene's `progress += rate * 0.0004`). */
export const PROGRESS_PER_SCROLL = 0.0004;

/** World-Y of a point at a given route progress (0..1). Larger progress = later
 *  on the route = larger world-Y. */
export function worldYForProgress(progress: number): number {
  return progress / PROGRESS_PER_SCROLL;
}

/**
 * World-Y of a screen row `y` during travel. The van sits at `vanY` and shows
 * world-Y = `scrollY`; rows above it (smaller `y`) are further ahead down the
 * route (larger world-Y), rows below are behind.
 */
export function worldYForRow(scrollY: number, vanY: number, y: number): number {
  return scrollY + (vanY - y);
}

export interface RoadTransition {
  /** Road we're leaving. */
  fromRoad: RoadId;
  /** Road we're entering. */
  toRoad: RoadId;
  /** World-Y of the class boundary — the centre of the merge zone. */
  centreWorldY: number;
  /** Full length of the merge zone in world-px; it spans centre ± len/2. */
  zoneLen: number;
}

/**
 * Build one merge zone per road-class change along a route, each centred on the
 * boundary's world-Y. Consecutive runs of the same rendered road produce no
 * zone (a class change that maps to the same RoadId is inert).
 */
export function buildRoadTransitions(
  profile: RoadClassRun[],
  roadIdForClass: (cls: string) => RoadId,
  zoneLen: number,
): RoadTransition[] {
  const zones: RoadTransition[] = [];
  for (let i = 1; i < profile.length; i++) {
    const fromRoad = roadIdForClass(profile[i - 1].roadClass);
    const toRoad = roadIdForClass(profile[i].roadClass);
    if (fromRoad === toRoad) continue;
    zones.push({
      fromRoad,
      toRoad,
      centreWorldY: worldYForProgress(profile[i - 1].untilProgress),
      zoneLen,
    });
  }
  return zones;
}

export interface TransitionSample {
  zone: RoadTransition;
  /** Blend factor across the zone: 0 at the near (from) edge, 1 at the far
   *  (to) edge. Row geometry = lerp(fromGeo, toGeo, t). */
  t: number;
}

/**
 * If `worldY` lies inside a transition zone, return the zone and its blend `t`
 * (0 = from geometry, 1 = to geometry). Rows with a larger world-Y (further
 * ahead, higher on screen) are further into the `to` road, so the merge is
 * drawn narrowing toward the top. Returns null outside every zone.
 */
export function transitionAt(zones: RoadTransition[], worldY: number): TransitionSample | null {
  for (const zone of zones) {
    const start = zone.centreWorldY - zone.zoneLen / 2;
    const end = zone.centreWorldY + zone.zoneLen / 2;
    if (worldY >= start && worldY <= end) {
      return { zone, t: (worldY - start) / zone.zoneLen };
    }
  }
  return null;
}

/**
 * The point ~`dropFraction` through a zone (default 0.7) where the live
 * `roadConfig` flips from `from` to `to`. By then vehicles have been pre-merged
 * into a valid lane, so the flip is inert and needs no flash cover.
 */
export function dropWorldY(zone: RoadTransition, dropFraction = 0.7): number {
  return zone.centreWorldY - zone.zoneLen / 2 + zone.zoneLen * dropFraction;
}
