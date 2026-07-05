/**
 * drive-state.ts
 *
 * Pure, serialisable state for the PTV (Pet Transport Vehicle) drive. No
 * Phaser imports — this is the data + rules layer that carries across the
 * hybrid-camera drive's two modes (top-down travel and cab events), so it
 * can be handed between scenes via the registry and unit-tested in isolation.
 */

/**
 * Gear selection. Reverse (-1) for negotiating an obstacle/crash; three
 * forward gears (1..3) selected from the gear stick. No neutral — a caring
 * transport is always gently rolling, never stalled mid-road.
 */
export type Gear = -1 | 1 | 2 | 3;

/** Reverse gear constant. */
export const REVERSE: Gear = -1;

/** Forward gears, low → high. */
export const FORWARD_GEARS: readonly Gear[] = [1, 2, 3];

/** Gear stick order, bottom (R) → top (3), for cycling with the arrows. */
export const GEAR_ORDER: readonly Gear[] = [-1, 1, 2, 3];

/** Number of lanes on the (placeholder) 3-lane PTV road. The road-system
 *  slice makes this per-route (single vs dual carriageway); until then it's
 *  a shared constant. */
export const NUM_LANES = 3;

export type DriveType = 'vet' | 'adoption' | 'rewilding' | 'delivery' | 'demo';

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
    gear: 1, // pull away in first gear
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

/** Move the gear stick up (+1, toward 3) or down (-1, toward R), clamped. */
export function cycleGear(gear: Gear, dir: -1 | 1): Gear {
  const idx = GEAR_ORDER.indexOf(gear);
  const next = Math.max(0, Math.min(GEAR_ORDER.length - 1, idx + dir));
  return GEAR_ORDER[next];
}

/** Human-friendly gear label for the stick / HUD ('R', '1', '2', '3'). */
export function gearLabel(gear: Gear): string {
  return gear === REVERSE ? 'R' : String(gear);
}

/**
 * Road-scroll rate (pixels per drive tick) for a gear. Forward gears ramp
 * *exponentially* — third gear is a lot quicker than first, per Marcus's
 * eyeball. Reverse creeps backward (negative), slower than any forward gear.
 */
export function gearScrollRate(gear: Gear): number {
  switch (gear) {
    case -1: return -2.6; // reverse — negative scroll, gentle
    case 1: return 3.2;
    case 2: return 7.2;
    case 3: return 15;
  }
}
