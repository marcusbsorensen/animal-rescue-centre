// ── World-Map Destinations ───────────────────────────────────
// The map is the mission hub: every place a child can drive to is
// here, with the position it occupies on the Birchie map, the level
// it opens at, and — the part that makes it a hub rather than a
// picture — what is waiting when she arrives.
//
// This module is the single source of truth. `map.html` is a static
// page and cannot import it, so GameScene *sends* the list into the
// overlay on init; the map draws whatever it is given and holds no
// table of its own.
//
// Note: a separate `DestinationDef` lives in ./supply-runs for the
// legacy supply-run picker. This one is broader. It's re-exported
// from index.ts as `MapDestinationDef` to avoid a name clash.

export type DestinationKind =
  | 'supply-run'
  | 'rewilding-habitat'
  | 'adoption-home'
  | 'visit-home'
  | 'village-hall'
  // ── Added 2026-04-24 per Marcus's brainstorm. See
  // ── docs/ptv-pet-transport-vehicle.md §"PTV destinations"
  // ── for the full design.
  | 'vet-general'           // normal vet (Greystone / Haven)
  | 'vet-prosthetics'       // specialist prosthetics / mobility
  | 'training-guide-dog'
  | 'training-sniffer'
  | 'training-parrot'
  | 'training-rewilding-prep'
  | 'pet-show';             // village fête → national championship

export type RewildingHabitat =
  | 'moorland'
  | 'woodland'
  | 'sea-cliffs'
  | 'deep-forest'
  | 'wetlands';

/**
 * What opens when the van has parked.
 *
 * The drive is the corridor between rooms, so every destination names
 * the room at the end of it. A destination with no arrival is a pin
 * that wastes a journey, which is the thing the "coming soon!" toast
 * was doing.
 */
export type ArrivalKind =
  | 'home'       // A.R.C. — the centre itself; arriving is going home
  | 'vet'        // the treatment popup, for the animal in the back
  | 'social'     // the village hall: friends, gifts, the leaderboard
  | 'supply'     // load up and run the supplies home
  | 'rewilding'; // the release ceremony, in the habitat it belongs to

export interface DestinationDef {
  id: string;
  label: string;
  emoji: string;
  kind: DestinationKind;
  description: string;
  /** km (cosmetic, drives the drive-length) */
  distance: number;
  unlockLevel: number;
  /**
   * Position on the Birchie map, as a fraction of the map image:
   * `fx` 0 (west) .. 1 (east), `fy` 0 (north/sea) .. 1 (south/inland).
   *
   * These *are* the driving positions — `birchie-places.ts`'s
   * `placeFor` reads them, and the pins on `map.html` are drawn from
   * them. There used to be a second, abstract `mapX`/`mapY` layout
   * here that disagreed with the real geography (it put the coast at
   * the bottom, where the sea is at the top); it had no readers and
   * is gone, so the GPS and the map can no longer drift apart.
   *
   * Placed against the drawn map on 2026-09-04, not guessed: the
   * previous set had Cove Harbour and Sea Cliffs out at sea and
   * Moorland on the waterline, which the pins made obvious the moment
   * anything drew them. Each one now sits on the ground its
   * description claims — the harbour on the west shore, the cliffs on
   * the north-east coast, the woods in the Wyx Park greens.
   *
   * Nudging them is still Marcus's call; the point is that there is
   * one set to nudge and it is on land.
   */
  fx: number;
  fy: number;
  /** What opens once the van has parked. */
  arrival: ArrivalKind;
  /** For rewilding-habitat destinations, which species belong here */
  suitableSpecies?: string[];
}

export const DESTINATIONS: DestinationDef[] = [
  // ── Centre ──
  {
    id: 'arc',
    label: 'A.R.C.',
    emoji: '🏡',
    kind: 'adoption-home',
    description: 'Animal Rescue Centre — your home base.',
    distance: 0,
    unlockLevel: 0,
    // Up by the beach huts on the Grenham Bay seafront — and the one
    // position here that is not a guess. It is the centre of the real
    // OSM plot polygon, which `map.html` has always drawn the building
    // stamp from (SVG 326,397 of an 1800x1121 viewBox). `ARC_PLACE` in
    // birchie-places.ts used to carry its own "verified spot" of
    // 0.28,0.31 — a tenth of the map east and half that north of where
    // the building actually is, so the GPS started every route from a
    // field. The drawn plot wins; there is one number now.
    fx: 0.1811,
    fy: 0.3541,
    arrival: 'home',
  },

  // ── The two places that are always open ──
  //
  // Both are level 0 on purpose. A poorly animal can arrive on a
  // child's first day, and a vet she cannot reach until level 3 is a
  // locked door in front of the one job the game asks of her. The
  // hall is level 0 because Social used to be a permanent tab on the
  // rail — moving it onto the map must not take it away.
  {
    id: 'vet',
    label: 'Bay Road Vets',
    emoji: '🩺',
    kind: 'vet-general',
    description: 'Kind hands and a warm blanket for a poorly animal.',
    distance: 6,
    unlockLevel: 0,
    // in the streets back from the seafront, town side
    fx: 0.47,
    fy: 0.44,
    arrival: 'vet',
  },
  {
    id: 'village-hall',
    label: 'Village Hall',
    emoji: '🏛️',
    kind: 'village-hall',
    description: 'Meet your friends, send a gift, see the leaderboard.',
    distance: 5,
    unlockLevel: 0,
    // the older village centre, west of the station
    fx: 0.33,
    fy: 0.55,
    arrival: 'social',
  },

  // ── Supply runs ──
  {
    id: 'bramble-farm',
    label: 'Bramble Farm',
    emoji: '🌾',
    kind: 'supply-run',
    description: 'Hay, straw, feed and bedding for the animals.',
    distance: 12,
    unlockLevel: 0,
    // the fields south-west, off a lane
    fx: 0.18,
    fy: 0.8,
    arrival: 'supply',
  },
  {
    id: 'cove-harbour',
    label: 'Cove Harbour',
    emoji: '🐟',
    kind: 'supply-run',
    description: 'Fresh fish from the dockside market.',
    distance: 18,
    unlockLevel: 5,
    // the west coast at Minnis Bay — on the shore, not in it
    fx: 0.11,
    fy: 0.52,
    arrival: 'supply',
  },
  {
    id: 'pinebark-medical',
    label: 'Pinebark Medical',
    emoji: '💊',
    kind: 'supply-run',
    description: 'Bandages, medicines and vet supplies.',
    distance: 24,
    unlockLevel: 10,
    // the town east of Birchie Station
    fx: 0.72,
    fy: 0.55,
    arrival: 'supply',
  },

  // ── Rewilding habitats ──
  {
    id: 'moorland',
    label: 'Moorland',
    emoji: '🦊',
    kind: 'rewilding-habitat',
    description: 'Open heather moors — home for foxes.',
    distance: 28,
    unlockLevel: 3,
    // the open land running west
    fx: 0.08,
    fy: 0.68,
    arrival: 'rewilding',
    suitableSpecies: ['fox'],
  },
  {
    id: 'woodland',
    label: 'Woodland',
    emoji: '🐿️',
    kind: 'rewilding-habitat',
    description: 'Dappled woods for hedgehogs, squirrels and wild bunnies.',
    distance: 16,
    unlockLevel: 3,
    // the Wyx Park greens
    fx: 0.8,
    fy: 0.88,
    arrival: 'rewilding',
    suitableSpecies: ['bunny', 'hedgehog', 'squirrel'],
  },
  {
    id: 'sea-cliffs',
    label: 'Sea Cliffs',
    emoji: '🐦',
    kind: 'rewilding-habitat',
    description: 'Windy cliffs where seabirds nest.',
    distance: 34,
    // Pulled L7 → L6 (Marcus pacing review 2026-05-03) — fills the previously empty L6.
    unlockLevel: 6,
    // the north-east coast, above Epple Bay
    fx: 0.88,
    fy: 0.34,
    arrival: 'rewilding',
    suitableSpecies: ['parrot', 'seabird'],
  },
  {
    id: 'deep-forest',
    label: 'Deep Forest',
    emoji: '🦇',
    kind: 'rewilding-habitat',
    description: 'Ancient trees and quiet caves — bat country.',
    distance: 40,
    unlockLevel: 8,
    // the deep woods in the south-east corner
    fx: 0.96,
    fy: 0.72,
    arrival: 'rewilding',
    suitableSpecies: ['bat'],
  },
  {
    id: 'wetlands',
    label: 'Wetlands',
    emoji: '🐍',
    kind: 'rewilding-habitat',
    description: 'Reed beds and slow water — perfect for snakes.',
    distance: 22,
    unlockLevel: 9,
    // the low ground south of the town
    fx: 0.45,
    fy: 0.88,
    arrival: 'rewilding',
    suitableSpecies: ['snake'],
  },
];

// ── Species → habitat mapping ────────────────────────────────
// Picks the "natural" habitat for each rewilding-capable species.
// Cats and dogs are intentionally absent — they can't survive wild,
// and the Paths panel disables the rewild card for them. Same logic
// applies here: habitatForSpecies('cat') → undefined.
const SPECIES_HABITATS: Record<string, RewildingHabitat> = {
  fox: 'moorland',
  bat: 'deep-forest',
  snake: 'wetlands',
  parrot: 'sea-cliffs',
  seabird: 'sea-cliffs',
  bunny: 'woodland',
  hedgehog: 'woodland',
  squirrel: 'woodland',
};

export function getDestination(id: string): DestinationDef | undefined {
  return DESTINATIONS.find((d) => d.id === id);
}

export function getAvailableDestinations(playerLevel: number): DestinationDef[] {
  return DESTINATIONS.filter((d) => d.unlockLevel <= playerLevel);
}

/**
 * The tightest the map ever crops, as a half-extent either side of
 * A.R.C. in image fractions. 0.28 shows 56% of each axis — a 1.8x
 * zoom on the whole map, which is the difference between "my corner
 * of Birchie" and "Birchie".
 */
export const MAP_EXTENT_MIN = 0.28;

/** Breathing room left around the outermost pins, in image fractions. */
const MAP_EXTENT_MARGIN = 0.06;

/**
 * Extra room above A.R.C., in image fractions.
 *
 * Every other destination is a 40px disc centred on its position;
 * A.R.C. is the painted building stamp, drawn *upward* from its plot
 * and several times the size. Framing it as a point put the child's
 * own home half off the top of the level-0 map, because the level-0
 * bounding box is dragged south by Bramble Farm and A.R.C. ends up
 * on the frame's edge. It is the one marker with a footprint worth
 * budgeting for.
 */
const ARC_STAMP_HEADROOM = 0.08;

/**
 * The visible span of the map at `playerLevel`: a centre and a
 * half-extent, both in image fractions.
 *
 * The world does not only gain pins — it gains *reach*. At level 0
 * the map is the corner of Birchie a child actually uses; by level 10
 * it is the whole town. Growing the extent as well as the pin count
 * keeps the early map legible at a phone's size instead of eleven
 * pins crowded into 874 points, and gives a level-up something
 * visible to do.
 *
 * Three rules:
 *
 * 1. The span grows with level.
 * 2. It contains every unlocked pin. A child who unlocks Deep Forest
 *    and cannot see it has been handed a destination and a locked
 *    door at once.
 * 3. The frame stays on the image, so the crop never shows blank sea
 *    above the coast.
 *
 * **The frame is centred on the unlocked pins, not on A.R.C.**, and
 * that is the whole difference between a progression and a switch.
 * Centred on A.R.C. — which sits west at fx 0.28 — rule 2 has to pay
 * for the entire width of the map the moment Woodland opens in the
 * east, so the extent went 0.28, 0.28, 0.28, then straight to the
 * full 0.5 at level 3 and never moved again. Framing the set instead
 * costs half as much for the same reach: 0.28 → 0.44 → 0.5.
 *
 * One half-extent covers both axes on purpose: it is a fraction *of
 * each axis*, so the visible box keeps the image's aspect and the
 * zoom stays uniform.
 */
export function mapExtentFor(playerLevel: number): {
  cx: number; cy: number; half: number;
} {
  const open = getAvailableDestinations(playerLevel);
  const arc = getDestination('arc');
  const xs = open.length ? open.map((d) => d.fx) : [arc?.fx ?? 0.5];
  const ys = open.length ? open.map((d) => d.fy) : [arc?.fy ?? 0.5];

  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  // A.R.C. is a building, not a dot — give its stamp its headroom.
  const minY = Math.min(
    ...ys,
    ...(arc && open.some((d) => d.id === 'arc') ? [arc.fy - ARC_STAMP_HEADROOM] : []),
  );

  // Grow from a corner of the town to all of it across levels 0..10.
  const t = Math.max(0, Math.min(1, playerLevel / 10));
  const levelHalf = MAP_EXTENT_MIN + (0.5 - MAP_EXTENT_MIN) * t;

  // The square that holds every open pin with room to breathe.
  const needed = Math.max(maxX - minX, maxY - minY) / 2 + MAP_EXTENT_MARGIN;

  const half = Math.min(0.5, Math.max(levelHalf, needed));

  // Centre on the pins, then keep the frame on the image.
  const clamp = (v: number) => Math.max(half, Math.min(1 - half, v));
  return { cx: clamp((minX + maxX) / 2), cy: clamp((minY + maxY) / 2), half };
}

/** Given a rewilded animal's species, which habitat is it visiting from? */
export function habitatForSpecies(species: string): RewildingHabitat | undefined {
  return SPECIES_HABITATS[species];
}
