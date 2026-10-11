/**
 * ride-comfort.ts
 *
 * How the van's speed changes, and how much whoever is in the back feels it.
 * Ported from the speed and jostle lines of drive-spike.html's step().
 *
 * Speed. Holding "go" drives towards the gear's speed at ACCEL; letting go
 * slows at BRAKE; the handbrake slams on at HANDBRAKE. When something ahead
 * caps the speed (traffic, in the spike) and the child has not braked for it,
 * the van stops itself at EMERGENCY. There is never contact and never an
 * accident (docs/driving-rebuild-2026-10-11.md, "When she does not brake, the
 * van does, hard"); the self-stop is the cost, felt in the back.
 *
 * Jostle. Hard deceleration (the handbrake, or the self-stop) and the child's
 * own swerving add to it; it settles at SETTLE_PER_S while the driving is
 * smooth. Easing off "go" is ordinary slowing and costs nothing. Only the
 * child's lane change counts as a swerve, never the road moving under the van
 * (lane-motion.ts's swerveMps already makes that split).
 *
 * How this sits with drive-state.ts's jostleComfort. That function is the
 * existing seed: `cargoComfort`, 100 calm down to 0, hit by a severity. The
 * spike counts the other way, `jostle`, 0 calm up to 100. They are the same
 * quantity: comfort = 100 - jostle. stepComfort works on cargoComfort by
 * passing this frame's net jostle to jostleComfort as the severity, so the
 * existing function is the one that clamps and both stay true; stepJostle is
 * the spike's direction, defined through it. What the spike adds is that the
 * severity is per second of driving, and can be negative: calm driving heals.
 * No Phaser — unit-tested.
 */
import { jostleComfort } from './drive-state';

/** m/s² */
export const ACCEL = 9;
export const BRAKE = 14;
export const HANDBRAKE = 34;
/** How hard the van stops itself when the child has not braked. */
export const EMERGENCY = 26;

/** Jostle per (m/s of sideways swerve) per second. */
export const SWERVE_JOSTLE = 1.6;
/** Jostle per (m/s² of hard deceleration) per second. */
export const DECEL_JOSTLE = 0.5;
/** How fast it settles while the driving is smooth, per second. */
export const SETTLE_PER_S = 6;

export interface SpeedInput {
  /** Current speed, m/s. */
  v: number;
  /** "Go" speed if holding, else 0 (road-gears.ts's GEAR_SPEED_MPS). */
  target: number;
  /** The fastest the van may go given what is ahead; Infinity for nothing. */
  speedCap: number;
  handbrake: boolean;
  dt: number;
}

export interface SpeedStep {
  v: number;
  /** Hard deceleration this step, m/s², for the jostle: 0 for ordinary slowing. */
  hardDecel: number;
  /** The van braked for the child. */
  emergency: boolean;
}

export function stepSpeed({ v, target, speedCap, handbrake, dt }: SpeedInput): SpeedStep {
  if (v > speedCap) {
    // Something is ahead and the child has not braked: the van does it.
    return { v: Math.max(speedCap, v - EMERGENCY * dt), hardDecel: EMERGENCY, emergency: true };
  }
  if (handbrake) return { v: Math.max(0, v - HANDBRAKE * dt), hardDecel: HANDBRAKE, emergency: false };
  if (v < target) return { v: Math.min(target, speedCap, v + ACCEL * dt), hardDecel: 0, emergency: false };
  return { v: Math.max(target, v - BRAKE * dt), hardDecel: 0, emergency: false };
}

/** Net jostle added over dt seconds; negative while settling. */
export function jostleDelta(swerveMps: number, hardDecel: number, dt: number): number {
  return (swerveMps * SWERVE_JOSTLE + hardDecel * DECEL_JOSTLE - SETTLE_PER_S) * dt;
}

/** cargoComfort (100 calm) after dt seconds of this driving. */
export function stepComfort(comfort: number, swerveMps: number, hardDecel: number, dt: number): number {
  return jostleComfort(comfort, jostleDelta(swerveMps, hardDecel, dt));
}

/** The spike's jostle (0 calm) after dt seconds: 100 - comfort. */
export function stepJostle(jostle: number, swerveMps: number, hardDecel: number, dt: number): number {
  return 100 - stepComfort(100 - jostle, swerveMps, hardDecel, dt);
}
