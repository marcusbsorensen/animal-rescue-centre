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
 * Pulling up. The van stops at the destination on its own, as the route
 * steers on its own: within the last stretch it lowers the speed she can ask
 * for to arrivalCap(toGo), which a van slowing at PULL_UP can always meet, so
 * it comes to rest STOP_SHORT_M before the end. Lowering the target, not
 * capping the speed, is what keeps it gentle: it slows the way easing off
 * "go" does, and costs no jostle.
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
 * The wrong gear for the road (road-gears.ts, 30A). The gear is never capped
 * by the road; too fast for it costs two things here, both from gearCosts:
 * the jostle is multiplied by `jostleScale`, and the van's own hard stops come
 * sooner (`stopSooner`: it wants that many times its stopping distance clear
 * ahead, so the cap is divided by its square root). Those stops are still
 * EMERGENCY decelerations, so they still count as rough driving.
 *
 * The gear's pull. Near the gear's top speed the van gains its last few m/s
 * slowly (gearPull, drive-spike.html's TOP_OUT / TOP_PULL), so holding go in
 * first is a needle that leans and stops: she feels the gear holding her back.
 * No Phaser — unit-tested.
 */
import { jostleComfort } from './drive-state';

/** m/s² */
export const ACCEL = 9;
export const BRAKE = 14;
export const HANDBRAKE = 34;
/** How hard the van stops itself when the child has not braked. */
export const EMERGENCY = 26;

/** The gentle stop at the destination, m/s², and how far short of the route's
 *  end (the destination's anchor node) the van comes to rest. */
export const PULL_UP = 2.5;
export const STOP_SHORT_M = 6;
/** Arrived: this close to the stopping point, metres, and this slow, m/s. */
export const ARRIVED_SLACK_M = 0.5;
export const ARRIVED_MPS = 0.2;

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
  /** Metres left to the end of the route; omitted, there is no destination. */
  toGo?: number;
  /** The gear's top speed, m/s, for the soft pull near it; omitted, none. */
  gearTop?: number;
  /** gearCosts' stopSooner: 1 in a suiting gear. */
  stopSooner?: number;
}

export interface SpeedStep {
  v: number;
  /** Hard deceleration this step, m/s², for the jostle: 0 for ordinary slowing. */
  hardDecel: number;
  /** The van braked for the child. */
  emergency: boolean;
}

/** The fastest she may ask for with toGo metres left: the speed from which
 *  PULL_UP stops the van STOP_SHORT_M before the end. 20 m/s is allowed until
 *  86 m out. */
export function arrivalCap(toGo: number): number {
  return Math.sqrt(2 * PULL_UP * Math.max(0, toGo - STOP_SHORT_M));
}

/** The last TOP_OUT m/s before the gear's top come on at a fading rate, down
 *  to TOP_PULL of ACCEL at the very top. */
export const TOP_OUT = 3.5;
export const TOP_PULL = 0.18;

/** The fraction of ACCEL the gear gives at speed v below its top. */
export function gearPull(v: number, gearTop: number): number {
  return Math.max(TOP_PULL, Math.min(1, (gearTop - v) / TOP_OUT));
}

/** The cap the van brakes itself to when it wants stopSooner times its
 *  stopping distance clear: caps are sqrt(2·a·gap), so it is cap / sqrt(k). */
export function soonerCap(speedCap: number, stopSooner = 1): number {
  return stopSooner > 1 ? speedCap / Math.sqrt(stopSooner) : speedCap;
}

export function stepSpeed({
  v, target: asked, speedCap: cap0, handbrake, dt, toGo = Infinity, gearTop, stopSooner = 1,
}: SpeedInput): SpeedStep {
  const target = Math.min(asked, arrivalCap(toGo));
  const speedCap = soonerCap(cap0, stopSooner);
  if (v > speedCap) {
    // Something is ahead and the child has not braked: the van does it.
    return { v: Math.max(speedCap, v - EMERGENCY * dt), hardDecel: EMERGENCY, emergency: true };
  }
  if (handbrake) return { v: Math.max(0, v - HANDBRAKE * dt), hardDecel: HANDBRAKE, emergency: false };
  if (v < target) {
    const pull = gearTop === undefined ? 1 : gearPull(v, gearTop);
    return { v: Math.min(target, speedCap, v + ACCEL * pull * dt), hardDecel: 0, emergency: false };
  }
  return { v: Math.max(target, v - BRAKE * dt), hardDecel: 0, emergency: false };
}

/** Net jostle added over dt seconds; negative while settling. jostleScale
 *  (gearCosts', TOO_FAST_JOSTLE while too fast for the road) multiplies what
 *  the driving adds, not how fast it settles. */
export function jostleDelta(swerveMps: number, hardDecel: number, dt: number, jostleScale = 1): number {
  return ((swerveMps * SWERVE_JOSTLE + hardDecel * DECEL_JOSTLE) * jostleScale - SETTLE_PER_S) * dt;
}

/** cargoComfort (100 calm) after dt seconds of this driving. */
export function stepComfort(comfort: number, swerveMps: number, hardDecel: number, dt: number, jostleScale = 1): number {
  return jostleComfort(comfort, jostleDelta(swerveMps, hardDecel, dt, jostleScale));
}

/** The spike's jostle (0 calm) after dt seconds: 100 - comfort. */
export function stepJostle(jostle: number, swerveMps: number, hardDecel: number, dt: number, jostleScale = 1): number {
  return 100 - stepComfort(100 - jostle, swerveMps, hardDecel, dt, jostleScale);
}

/** A single knock to cargoComfort (the handbrake, a speed camera), harder by
 *  jostleScale while too fast for the road. */
export function knockComfort(comfort: number, severity: number, jostleScale = 1): number {
  return jostleComfort(comfort, severity * jostleScale);
}

/** Distance along the route after dt seconds at v, never past the stopping
 *  point STOP_SHORT_M before the end. */
export function advanceAlong(s: number, v: number, dt: number, routeLength: number): number {
  return Math.min(routeLength - STOP_SHORT_M, s + v * dt);
}

/** The van has pulled up at the destination. */
export function hasArrived(toGo: number, v: number): boolean {
  return toGo <= STOP_SHORT_M + ARRIVED_SLACK_M && v < ARRIVED_MPS;
}
