/**
 * birchie-places.ts
 *
 * Positions on the Birchie vector map (`birchie-roads.svg`, the OSM-derived
 * network shown on the town map), as fractions 0..1 of the map image
 * (fx left→right, fy top→bottom; the sea is at the top).
 *
 * **The destinations' own positions live on the destination.** They used to
 * be here *and* in `destinations.ts` as an abstract `mapX`/`mapY` layout that
 * did not match the real map — coastal places sat at the bottom there, where
 * the sea is at the top here — and two tables of the same thing disagreeing
 * is what puts a GPS route and a map pin in different places. The abstract
 * pair had no readers and is gone; `fx`/`fy` on `DestinationDef` is the one
 * set, and `placeFor` reads it.
 *
 * What is left here is what is not a destination: A.R.C.'s verified anchor
 * and the fixed speed cameras.
 *
 * The positions remain PROVISIONAL as geography — Marcus to nudge them
 * against the real town — but there is now only one set to nudge.
 */

import { getDestination } from '@arc/game-logic';

export interface MapPoint {
  /** Fraction across the map, 0 (west) .. 1 (east). */
  fx: number;
  /** Fraction down the map, 0 (north/sea) .. 1 (south/inland). */
  fy: number;
}

/** Look up a destination's map position, falling back to the town centre. */
export function placeFor(destinationId: string): MapPoint {
  const d = getDestination(destinationId);
  return d ? { fx: d.fx, fy: d.fy } : { fx: 0.5, fy: 0.5 };
}

/**
 * A.R.C. — up by the beach huts on the Grenham Bay seafront, and the start of
 * every route the drive code builds.
 *
 * Read from the `arc` destination rather than written here, because it was
 * written here: this constant used to hold 0.28,0.31 while `map.html` drew the
 * building from the real OSM plot polygon at 0.181,0.354, so the GPS set off
 * from a field a tenth of the map east of the centre. The plot won.
 */
export const ARC_PLACE: MapPoint = placeFor('arc');

export interface NamedPlace extends MapPoint {
  name: string;
}

/**
 * Fixed speed-camera locations on the map (provisional, like the places above —
 * easy to nudge). A camera only appears on a drive when the route actually
 * passes near it, so you meet the same cameras at the same spots each time.
 */
export const CAMERA_PLACES: NamedPlace[] = [
  { name: 'Birchie entrance', fx: 0.33, fy: 0.36 },
  { name: 'Town exit (east)', fx: 0.55, fy: 0.34 },
  { name: 'Minnis Road seafront', fx: 0.20, fy: 0.30 },
];
