/**
 * drive-state.ts
 *
 * Pure, serialisable state for the PTV (Pet Transport Vehicle) drive. No
 * Phaser imports — this is the data + rules layer that carries across the
 * hybrid-camera drive's two modes (top-down travel and cab events), so it
 * can be handed between scenes via the registry and unit-tested in isolation.
 *
 * Slice 1 (this file's first cut) only needs the travel-mode essentials:
 * vehicle, lane, discrete speed, and route progress. Later slices layer in
 * `events`, `cargoComfort` deltas and weather without changing this shape.
 */

/** Discrete speed steps. Kids pick a gear, not an analogue throttle. */
export type SpeedStep = 0 | 1 | 2; // 0 = crawl, 1 = steady, 2 = brisk

/** Number of lanes on the PTV road. A gentle 3-lane UK two-way-feel road. */
export const NUM_LANES = 3;

/** Highest speed step. `SpeedStep` runs 0..MAX_SPEED_STEP inclusive. */
export const MAX_SPEED_STEP = 2;

/**
 * Why the player is driving. Kept a loose string for MVP so `drive-state`
 * doesn't couple to `destinations.ts`; Slice 6 maps real destination kinds
 * onto these when GameScene launches the scene.
 */
export type DriveType = 'vet' | 'adoption' | 'rewilding' | 'delivery' | 'demo';

export interface DriveState {
  /** Vehicle id — 'henry' is the only asset-complete cab for MVP. */
  vehicle: string;
  driveType: DriveType;
  /** Destination id from `destinations.ts`, or '' in demo/standalone. */
  destinationId: string;
  /** Current lane, 0 (left) .. NUM_LANES-1 (right). */
  lane: number;
  /** Discrete speed step, 0..MAX_SPEED_STEP. */
  speedStep: SpeedStep;
  /** Cargo comfort 0..100 (unused in Slice 1; carried for later slices). */
  cargoComfort: number;
  /** Weather token; 'clear' until a dedicated weather slice applies effects. */
  weather: string;
  /** Route progress 0..1. Reaches 1 at the destination. */
  progress: number;
}

export interface CreateDriveStateOptions {
  vehicle?: string;
  driveType?: DriveType;
  destinationId?: string;
  weather?: string;
}

/** Build a fresh drive state with sensible MVP defaults. */
export function createDriveState(opts: CreateDriveStateOptions = {}): DriveState {
  return {
    vehicle: opts.vehicle ?? 'henry',
    driveType: opts.driveType ?? 'demo',
    destinationId: opts.destinationId ?? '',
    lane: Math.floor(NUM_LANES / 2), // start in the middle lane
    speedStep: 1, // start at a steady cruise
    cargoComfort: 100,
    weather: opts.weather ?? 'clear',
    progress: 0,
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

/** Step the speed up (+1) or down (-1), clamped to 0..MAX_SPEED_STEP. */
export function changeSpeed(step: SpeedStep, dir: -1 | 1): SpeedStep {
  const next = step + dir;
  if (next < 0) return 0;
  if (next > MAX_SPEED_STEP) return MAX_SPEED_STEP;
  return next as SpeedStep;
}

/** Human-friendly label for a speed step (Lily-facing HUD copy). */
export function speedLabel(step: SpeedStep): string {
  switch (step) {
    case 0: return 'Slow';
    case 1: return 'Steady';
    case 2: return 'Brisk';
  }
}

/**
 * Road-scroll rate (pixels per drive tick) for a speed step. Step 0 still
 * creeps forward so the world never feels frozen; the ramp is gentle — this
 * is a caring transport, not a race.
 */
export function speedScrollRate(step: SpeedStep): number {
  switch (step) {
    case 0: return 1.4;
    case 1: return 3.2;
    case 2: return 5.4;
  }
}
