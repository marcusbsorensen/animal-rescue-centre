/**
 * birchie-places.ts
 *
 * Real positions of the drive destinations on the Birchie vector map
 * (`birchie-roads.svg`, the OSM-derived network shown on the town map), as
 * fractions 0..1 of the map image (fx left→right, fy top→bottom; the sea is at
 * the top).
 *
 * IMPORTANT — these are PROVISIONAL best-guesses. The destinations' existing
 * `mapX`/`mapY` in `destinations.ts` are an abstract layout that does NOT match
 * the real map (coastal places sit at the bottom there, but the sea is at the
 * top here). Marcus to review/correct each position against the real geography
 * before the GPS routing is treated as accurate. Until then the GPS shows the
 * right map with roughly-placed pins.
 */

export interface MapPoint {
  /** Fraction across the map, 0 (west) .. 1 (east). */
  fx: number;
  /** Fraction down the map, 0 (north/sea) .. 1 (south/inland). */
  fy: number;
}

/** A.R.C. — up by the beach huts on the Grenham Bay seafront (verified spot). */
export const ARC_PLACE: MapPoint = { fx: 0.28, fy: 0.31 };

/** Destination id → map position. Provisional; see file header. */
export const BIRCHIE_PLACES: Record<string, MapPoint> = {
  arc: ARC_PLACE,
  'bramble-farm': { fx: 0.16, fy: 0.56 }, // farmland to the south-west
  'cove-harbour': { fx: 0.14, fy: 0.24 }, // harbour on the west coast (Minnis Bay)
  'pinebark-medical': { fx: 0.66, fy: 0.44 }, // near Birchie Station / town
  moorland: { fx: 0.10, fy: 0.44 }, // open land to the west
  woodland: { fx: 0.86, fy: 0.60 }, // the Wyx Park greens (east)
  'sea-cliffs': { fx: 0.68, fy: 0.19 }, // cliffs on the north-east coast
  'deep-forest': { fx: 0.84, fy: 0.68 }, // south-east woods (on the road network)
  wetlands: { fx: 0.40, fy: 0.86 }, // low-lying ground to the south
};

/** Look up a destination's map position, falling back to the town centre. */
export function placeFor(destinationId: string): MapPoint {
  return BIRCHIE_PLACES[destinationId] ?? { fx: 0.5, fy: 0.5 };
}
