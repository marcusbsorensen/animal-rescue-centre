/**
 * road-config.ts
 *
 * Pure description of a stretch of road: how many lanes run in the player's
 * direction, how many oncoming, the surface, and how the two directions are
 * divided. Lane indices run 0..total-1 left → right; the player's lanes are the
 * leftmost (UK drives on the left), oncoming lanes are to the right of the
 * divide.
 */

export type RoadSurface = 'tarmac' | 'gravel' | 'sand';
export type RoadDivider = 'line' | 'reservation';

export interface RoadConfig {
  id: string;
  label: string;
  /** Lanes in the player's direction (1 = country lane, 2 = dual carriageway). */
  playerLanes: number;
  /** Lanes coming the other way (0 = single-track, 1 = lane, 2 = dual). */
  oncomingLanes: number;
  surface: RoadSurface;
  /** Dashed centre line, or a grass central reservation (dual carriageways). */
  divider: RoadDivider;
}

/** Birchie's roads. Most are single carriageways; the Thanet Way is the dual. */
export const ROADS = {
  'country-lane': {
    id: 'country-lane', label: 'Country lane',
    playerLanes: 1, oncomingLanes: 1, surface: 'tarmac', divider: 'line',
  },
  'thanet-way': {
    id: 'thanet-way', label: 'Thanet Way',
    playerLanes: 2, oncomingLanes: 2, surface: 'tarmac', divider: 'reservation',
  },
  'rural-track': {
    id: 'rural-track', label: 'Rural track',
    playerLanes: 1, oncomingLanes: 1, surface: 'gravel', divider: 'line',
  },
  'coast-road': {
    id: 'coast-road', label: 'Coast road',
    playerLanes: 1, oncomingLanes: 0, surface: 'sand', divider: 'line',
  },
} as const satisfies Record<string, RoadConfig>;

export type RoadId = keyof typeof ROADS;

/** Total lanes across both directions. */
export function totalLanes(c: RoadConfig): number {
  return c.playerLanes + c.oncomingLanes;
}

/** Whether a lane index belongs to the player's direction. */
export function isPlayerLane(c: RoadConfig, lane: number): boolean {
  return lane < c.playerLanes;
}

/** The highest player-lane index (the fast/overtaking lane on the player's
 *  side, nearest the centre). */
export function fastPlayerLane(c: RoadConfig): number {
  return c.playerLanes - 1;
}

/** Median width in lane-units inserted between the two directions (only dual
 *  carriageways with a reservation have a real gap). */
export function medianUnits(c: RoadConfig): number {
  return c.oncomingLanes > 0 && c.divider === 'reservation' ? 0.8 : 0;
}
