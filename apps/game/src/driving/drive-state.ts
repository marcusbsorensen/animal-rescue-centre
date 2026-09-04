/**
 * drive-state.ts
 *
 * Pure, serialisable state for the PTV (Pet Transport Vehicle) drive. No
 * Phaser imports — this is the data + rules layer that carries across the
 * hybrid-camera drive's two modes (top-down travel and cab events), so it
 * can be handed between scenes via the registry and unit-tested in isolation.
 */

import { getDestination } from '@arc/game-logic';

/**
 * Gear selection: Park holds the vehicle still (e.g. stopped for a hedgehog
 * crossing), Reverse for negotiating an obstacle, and three forward gears
 * (1..3).
 */
export type Gear = 'P' | 'R' | 1 | 2 | 3;

/** Park — fully stopped. */
export const PARK: Gear = 'P';
/** Reverse. */
export const REVERSE: Gear = 'R';

/** Forward gears, low → high. */
export const FORWARD_GEARS: readonly Gear[] = [1, 2, 3];

/**
 * Gear stick order, bottom → top: Reverse, Park, then the forward gears. Park
 * sits between Reverse and 1st, so you drop into it straight from first gear
 * without passing through Reverse.
 */
export const GEAR_ORDER: readonly Gear[] = ['R', 'P', 1, 2, 3];

/** Whether a gear holds the vehicle stationary. */
export function isStopped(gear: Gear): boolean {
  return gear === PARK;
}

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
 * mapping matters beyond flavour: `carriesAnimals` gates whether the
 * drive is collision-safe, and a supply run is the one trip with
 * nobody in the back.
 */
export function driveTypeFor(destinationId: string): DriveType {
  switch (getDestination(destinationId)?.arrival) {
    case 'vet':       return 'vet';
    case 'rewilding': return 'rewilding';
    case 'supply':    return 'delivery';
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
  /** Selected gear (-1 reverse, 1..3 forward). */
  gear: Gear;
  /** Cargo comfort 0..100 (unused in Slice 1; carried for later slices). */
  cargoComfort: number;
  /** Weather token; 'clear' until a dedicated weather slice applies effects. */
  weather: string;
  /** Route progress 0..1. Reaches 1 at the destination. */
  progress: number;
  /**
   * Whether animals are aboard. When true the drive is COLLISION-SAFE: the game
   * never lets the van actually hit another vehicle (you slow and tuck in
   * behind, you can't swerve into a car). Only animal-free supply runs allow
   * real crashes/chaos.
   */
  carriesAnimals: boolean;
}

export interface CreateDriveStateOptions {
  vehicle?: string;
  driveType?: DriveType;
  destinationId?: string;
  weather?: string;
  /** Defaults to true — the PTV carries animals, so the drive is collision-safe. */
  carriesAnimals?: boolean;
}

/** Build a fresh drive state with sensible MVP defaults. */
export function createDriveState(opts: CreateDriveStateOptions = {}): DriveState {
  return {
    vehicle: opts.vehicle ?? 'henry',
    driveType: opts.driveType ?? 'demo',
    destinationId: opts.destinationId ?? '',
    lane: Math.floor(NUM_LANES / 2), // start in the middle lane
    gear: 1, // pull away in first gear
    cargoComfort: 100,
    weather: opts.weather ?? 'clear',
    progress: 0,
    carriesAnimals: opts.carriesAnimals ?? true,
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

/** Move the gear stick up (+1, toward 3) or down (-1, toward P), clamped. */
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

/** Human-friendly gear label for the stick / HUD ('P','R','1','2','3'). */
export function gearLabel(gear: Gear): string {
  return String(gear);
}

/**
 * Road-scroll rate (pixels per drive tick) for a gear. Park and Neutral hold
 * still (0). Forward gears ramp *exponentially* — third is a lot quicker than
 * first, per Marcus's eyeball. Reverse creeps backward (negative).
 */
export function gearScrollRate(gear: Gear): number {
  switch (gear) {
    case 'P': return 0;   // park — stopped
    case 'R': return -2.6; // reverse — gentle backward creep
    case 1: return 3.2;
    case 2: return 7.2;
    case 3: return 15;
  }
}
