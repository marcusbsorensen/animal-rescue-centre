/**
 * drive-state.ts
 *
 * Pure, serialisable state for the PTV (Pet Transport Vehicle) drive. No
 * Phaser imports — this is the data + rules layer that carries across the
 * hybrid-camera drive's two modes (top-down travel and cab events), so it
 * can be handed between scenes via the registry and unit-tested in isolation.
 */

import { getDestination, type CrateGrid } from '@arc/game-logic';

/**
 * Gear selection: three forward gears (1..3) and nothing else. Park and
 * Reverse were dropped (port plan 2026-10-11, section 5, answer 6): the
 * handbrake is what holds the van still, and nothing on rails needs to back
 * up.
 */
export type Gear = 1 | 2 | 3;

/** Forward gears, low → high. */
export const FORWARD_GEARS: readonly Gear[] = [1, 2, 3];

/** Gear stick order, bottom → top. */
export const GEAR_ORDER: readonly Gear[] = FORWARD_GEARS;

/** Number of lanes on the (placeholder) 3-lane PTV road. The road-system
 *  slice makes this per-route (single vs dual carriageway); until then it's
 *  a shared constant. */
export const NUM_LANES = 3;

export type DriveType = 'vet' | 'adoption' | 'rewilding' | 'delivery' | 'demo';

/**
 * Which kind of drive a destination makes.
 *
 * Read off the destination's `arrival` — what is waiting at the far
 * end is what the journey is for, so the two cannot disagree. The
 * mapping matters beyond flavour: a supply run is the delivery race,
 * the one trip with nobody in the back (`carriesAnimalsFor`).
 */
export function driveTypeFor(destinationId: string): DriveType {
  switch (getDestination(destinationId)?.arrival) {
    case 'vet':       return 'vet';
    case 'rewilding': return 'rewilding';
    case 'supply':    return 'delivery';
    // A collection goes out with an empty bed and comes home with
    // somebody in it. It stays an animals-aboard trip rather than
    // joining the supply runs: half of this journey has an animal in
    // the back, and the drive home is the half she drives.
    case 'collection': return 'adoption';
    // Keepers take an animal in for good, which is the adoption drive's
    // errand: a gentle trip with the animal aboard, ending somewhere it is
    // going to be looked after.
    case 'placement':  return 'adoption';
    // The village hall and going home carry no cargo brief of their
    // own; they are still gentle trips with the animals aboard.
    default:          return 'adoption';
  }
}

export interface DriveState {
  /** Vehicle id — 'henry' is the only asset-complete cab for MVP. */
  vehicle: string;
  driveType: DriveType;
  /** Destination id from `destinations.ts`, or '' in demo/standalone. */
  destinationId: string;
  /** Current lane, 0 (left) .. NUM_LANES-1 (right). */
  lane: number;
  /** Selected gear, 1..3. */
  gear: Gear;
  /** Cargo comfort 0..100 (unused in Slice 1; carried for later slices). */
  cargoComfort: number;
  /**
   * Who is in the back, and which bay each of them is sitting in.
   *
   * Set by the loading screen when the van sets off, and undefined for
   * a drive that never had one — the single-passenger runs the game
   * started with, and the `?ptvDemo=1` boot. **Undefined means "this
   * drive carries no grid", not "an empty grid"**: the arrival only
   * scores crates and neighbours when there was a load to score, so a
   * drive without one lands exactly as it always did.
   *
   * Distinct from `cargoComfort`, which is how roughly the van has been
   * driven. This is who had to sit next to whom for the whole journey,
   * and it is what `calculateArrivalHappinessDelta` reads at the far
   * end.
   */
  crateGrid?: CrateGrid;
  /** Weather token; 'clear' until a dedicated weather slice applies effects. */
  weather: string;
  /** Route progress 0..1. Reaches 1 at the destination. */
  progress: number;
  /**
   * Whether animals are aboard. False only on a supply run, the delivery
   * race: no cargo, no loading screen, nobody's comfort to show. Every drive
   * is collision-safe either way — there is never a road accident
   * (docs/driving-rebuild-2026-10-11.md, "Two modes").
   */
  carriesAnimals: boolean;
}

export interface CreateDriveStateOptions {
  vehicle?: string;
  driveType?: DriveType;
  destinationId?: string;
  weather?: string;
  /** Defaults to `carriesAnimalsFor(driveType)`: true except on a supply run. */
  carriesAnimals?: boolean;
}

/**
 * Whether a kind of drive has animals aboard. Supply runs are the delivery
 * race, with nothing alive aboard; every other drive carries animals.
 * Marcus, 2026-10-11 (docs/driving-port-plan-2026-10-11.md section 5,
 * answer 8).
 */
export function carriesAnimalsFor(driveType: DriveType): boolean {
  return driveType !== 'delivery';
}

/** Build a fresh drive state with sensible MVP defaults. */
export function createDriveState(opts: CreateDriveStateOptions = {}): DriveState {
  const driveType = opts.driveType ?? 'demo';
  return {
    vehicle: opts.vehicle ?? 'henry',
    driveType,
    destinationId: opts.destinationId ?? '',
    lane: Math.floor(NUM_LANES / 2), // start in the middle lane
    gear: 1, // pull away in first gear
    cargoComfort: 100,
    weather: opts.weather ?? 'clear',
    progress: 0,
    carriesAnimals: opts.carriesAnimals ?? carriesAnimalsFor(driveType),
  };
}

/** Clamp a lane index into the valid range. */
export function clampLane(lane: number): number {
  if (lane < 0) return 0;
  if (lane > NUM_LANES - 1) return NUM_LANES - 1;
  return Math.round(lane);
}

/** Move one lane left/right, clamped. Returns the new lane index. */
export function shiftLane(lane: number, dir: -1 | 1): number {
  return clampLane(lane + dir);
}

/** Move the gear stick up (+1, toward 3) or down (-1, toward 1), clamped. */
export function cycleGear(gear: Gear, dir: -1 | 1): Gear {
  const idx = GEAR_ORDER.indexOf(gear);
  const next = Math.max(0, Math.min(GEAR_ORDER.length - 1, idx + dir));
  return GEAR_ORDER[next];
}

/**
 * Apply a jostle to cargo comfort (e.g. slamming the handbrake), clamped to
 * 0..100. `severity` is the comfort hit — bigger = more chaos in the cages.
 */
export function jostleComfort(comfort: number, severity: number): number {
  return Math.max(0, Math.min(100, comfort - severity));
}

/** Human-friendly gear label for the stick / HUD ('1','2','3'). */
export function gearLabel(gear: Gear): string {
  return String(gear);
}

/**
 * Road-scroll rate (pixels per drive tick) for a gear. Forward gears ramp
 * *exponentially* — third is a lot quicker than first, per Marcus's eyeball.
 * Standing still is the handbrake's job, not a gear's.
 */
export function gearScrollRate(gear: Gear): number {
  switch (gear) {
    case 1: return 3.2;
    case 2: return 7.2;
    case 3: return 15;
  }
}
