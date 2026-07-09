/**
 * traffic.ts
 *
 * Pure catalogue + picker for decorative other road users. No Phaser import —
 * profiles (relative speed, size, behaviour) are data so they can be tuned and
 * unit-tested; the drawing lives in `drive-render.ts`.
 *
 * `relSpeed` is the vehicle's pace as a fraction of the player's: < 1 means we
 * overtake it (it drifts down the screen), > 1 means it overtakes us (drifts
 * up). Sizes are fractions of the player van's footprint.
 */

export type TrafficKind =
  | 'car'
  | 'pickup'
  | 'truck'
  | 'tractor'
  | 'motorbike'
  | 'emergency';

export interface TrafficProfile {
  kind: TrafficKind;
  /** Pace relative to the player (1 = same speed). */
  relSpeed: number;
  /** Body width as a fraction of the van's width. */
  widthFactor: number;
  /** Body length as a fraction of the van's length. */
  lengthFactor: number;
  /** Base body colour. */
  colour: number;
  /** Motorbikes weave between lanes. */
  zigzag: boolean;
  /** Relative likelihood of being picked (higher = more common). */
  weight: number;
}

// widthFactor is relative to the player van Henry (= 1.0), which sets the size
// hierarchy: motorbike < car < van (pickup/ambulance) < tractor < truck. Sprites
// scale by width and keep their own aspect, so length follows the artwork.
export const TRAFFIC_PROFILES: Record<TrafficKind, TrafficProfile> = {
  // Ordinary cars — the bread-and-butter traffic, smaller than the van.
  car: { kind: 'car', relSpeed: 0.75, widthFactor: 0.80, lengthFactor: 0.9, colour: 0x6a9fd0, zigzag: false, weight: 5 },
  // Pick-ups — van-ish, a bit longer.
  pickup: { kind: 'pickup', relSpeed: 0.7, widthFactor: 0.90, lengthFactor: 1.15, colour: 0x9a7a55, zigzag: false, weight: 3 },
  // Trucks — the biggest of the everyday traffic.
  truck: { kind: 'truck', relSpeed: 0.55, widthFactor: 1.08, lengthFactor: 1.9, colour: 0xcf6b52, zigzag: false, weight: 3 },
  // Tractors — very slow; we sail past them. Big wheels, so read chunky.
  tractor: { kind: 'tractor', relSpeed: 0.28, widthFactor: 1.02, lengthFactor: 1.4, colour: 0x4e9f3d, zigzag: false, weight: 2 },
  // Motorbikes — smallest of all, nippy and weave between lanes.
  motorbike: { kind: 'motorbike', relSpeed: 1.25, widthFactor: 0.42, lengthFactor: 0.7, colour: 0x333333, zigzag: true, weight: 2 },
  // Emergency vehicles — van-sized, fast, overtaking us.
  emergency: { kind: 'emergency', relSpeed: 1.6, widthFactor: 0.92, lengthFactor: 1.2, colour: 0xe8443a, zigzag: false, weight: 1 },
};

const ALL_KINDS = Object.keys(TRAFFIC_PROFILES) as TrafficKind[];

/** Total pick weight, precomputed. */
const TOTAL_WEIGHT = ALL_KINDS.reduce((sum, k) => sum + TRAFFIC_PROFILES[k].weight, 0);

/**
 * Weighted pick of a traffic kind. `rand` is a 0..1 value (pass a seeded RNG
 * for determinism). Common kinds (cars) come up more often than rare ones
 * (emergency).
 */
export function pickTrafficKind(rand: number): TrafficKind {
  let ticket = Math.max(0, Math.min(0.9999999, rand)) * TOTAL_WEIGHT;
  for (const k of ALL_KINDS) {
    ticket -= TRAFFIC_PROFILES[k].weight;
    if (ticket < 0) return k;
  }
  return 'car';
}

/** Whether a kind overtakes the player (drifts up the screen) rather than
 *  being overtaken. */
export function overtakesPlayer(kind: TrafficKind): boolean {
  return TRAFFIC_PROFILES[kind].relSpeed > 1;
}
