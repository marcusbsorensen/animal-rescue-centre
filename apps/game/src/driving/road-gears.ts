/**
 * road-gears.ts
 *
 * Which gears suit which road, and what getting it wrong costs. The gearbox is
 * about choosing a speed for the circumstances, not learning a gearbox, and
 * the graph already carries an OSM class on every edge, so the right gear is a
 * lookup rather than new content. The table is docs/driving-rebuild-2026-10-11.md
 * ("Gears are about choosing a speed"), and the data is drive-spike.html's
 * GEAR_OK / ROAD_NAME / TOO_FAST / TOO_SLOW.
 *
 * A van that is barely moving is never told off: pulling away in third on a
 * lane is not speeding. That is the spike's `v < 1` rule, kept.
 * The A28 is not one road (trunk-carriageways.ts). A trunk edge with its
 * carriageway known is judged by that: the real dual carriageway keeps the
 * dual's gears, and the divided and single stretches at 30–40 mph fit the gears
 * whose speed is within their limit, so third through The Square is too fast.
 * A trunk edge with no record (no data loaded) is judged as before, as a dual
 * carriageway.
 *
 * Every gear works on every road (30A, Marcus, 2026-10-12): "Any gear is
 * available in any car at any time, but that doesn't mean that it's correct
 * for the road that one is on. The same with bicycle gears that might be more
 * familiar to children." So nothing here refuses, dims or caps a gear: the
 * gear sets the top speed wherever she is, the suiting gears are advice, and a
 * wrong gear costs what gearCosts says. The knob prompt (stepGearHint) is a
 * hint she may ignore. The spike's lock (gearTop) is not ported.
 * No Phaser — unit-tested.
 */
import type { Carriageway } from './trunk-carriageways';

export type ForwardGear = 1 | 2 | 3;

/** "Go" speed in each gear, metres per second (about 16, 29 and 45 mph). */
export const GEAR_SPEED_MPS: Readonly<Record<ForwardGear, number>> = { 1: 7, 2: 13, 3: 20 };

/** Below this speed no gear is wrong. */
export const VERDICT_MIN_SPEED_MPS = 1;

export const ROAD_NAME: Readonly<Record<string, string>> = {
  trunk: 'dual carriageway', secondary: 'main road', tertiary: 'country road',
  unclassified: 'lane', residential: 'houses', track: 'farm track',
};

export const GEAR_OK: Readonly<Record<string, readonly ForwardGear[]>> = {
  trunk: [2, 3], secondary: [1, 2, 3], tertiary: [1, 2, 3],
  unclassified: [1, 2], residential: [1, 2], track: [1],
};

/** The word on the road chip when too fast or too slow. */
export const TOO_FAST: Readonly<Record<string, string>> = { track: 'dust!', unclassified: 'too fast', residential: 'slow down' };
export const TOO_SLOW: Readonly<Record<string, string>> = { trunk: 'beeping' };

/** What it costs, for the scene to show. 'dust' is the dust storm the animals
 *  breathe on a farm track; 'queue' is traffic beeping and pulling up right
 *  behind (the only road where too slow exists); 'speeding' is plain too fast
 *  on a lane or among houses. */
export type GearCost = 'dust' | 'queue' | 'speeding';

export type GearVerdict =
  | { ok: true; roadName: string }
  | { ok: false; roadName: string; problem: 'too-fast' | 'too-slow'; label: string; cost: GearCost };

const ALL_GEARS: readonly ForwardGear[] = [1, 2, 3];

export const MPS_PER_MPH = 0.44704;

/** What a trunk edge that is not the dual carriageway is called on the chip. */
export const A_ROAD_NAME = 'main road';

/** Whether this edge is a trunk edge we know to be other than a dual
 *  carriageway. */
function isLesserTrunk(roadClass: string, c: Carriageway | null | undefined): c is Carriageway {
  return roadClass === 'trunk' && !!c && c.kind !== 'dual';
}

/** The gears that fit a road. On a trunk edge whose carriageway is known: the
 *  gears whose "go" speed is within its limit, and on the dual carriageway not
 *  first, where traffic queues behind her. */
export function gearsFor(roadClass: string, carriageway?: Carriageway | null): readonly ForwardGear[] {
  if (roadClass === 'trunk' && carriageway) {
    const limit = carriageway.maxspeedMph * MPS_PER_MPH;
    const within = ALL_GEARS.filter((g) => GEAR_SPEED_MPS[g] <= limit);
    const suiting = carriageway.kind === 'dual' ? within.filter((g) => GEAR_OK.trunk.includes(g)) : within;
    // A stretch slower than first's "go" (no such limit on the A28 today)
    // still suits first rather than nothing.
    return suiting.length ? suiting : [ALL_GEARS[0]];
  }
  return GEAR_OK[roadClass] ?? ALL_GEARS;
}

/** The road's name on the chip: a divided or single stretch of the A28 is a
 *  main road, not a dual carriageway. */
export function roadNameFor(roadClass: string, carriageway?: Carriageway | null): string {
  if (isLesserTrunk(roadClass, carriageway)) return A_ROAD_NAME;
  return ROAD_NAME[roadClass] ?? roadClass;
}

export function gearVerdict(
  roadClass: string, gear: ForwardGear, speedMps: number, carriageway?: Carriageway | null,
): GearVerdict {
  const roadName = roadNameFor(roadClass, carriageway);
  const ok = gearsFor(roadClass, carriageway);
  if (ok.includes(gear) || speedMps < VERDICT_MIN_SPEED_MPS) return { ok: true, roadName };
  if (gear > Math.max(...ok)) {
    return {
      ok: false, roadName, problem: 'too-fast',
      label: TOO_FAST[roadClass] ?? 'too fast',
      cost: roadClass === 'track' ? 'dust' : 'speeding',
    };
  }
  return {
    ok: false, roadName, problem: 'too-slow',
    label: TOO_SLOW[roadClass] ?? 'too slow',
    cost: 'queue',
  };
}

/**
 * Whether a speed camera catches her: it fires on "too fast for this road",
 * the same verdict as the road chip's, not on a fixed gear. Too slow is never
 * a camera's business, and a van barely moving is never caught. Marcus,
 * 2026-10-11 (docs/driving-port-plan-2026-10-11.md section 5, answer 7).
 * On the A28 "this road" is the carriageway underfoot: third gear is fine on
 * the 50 mph dual carriageway and too fast on the 30 mph road through The
 * Square.
 */
export function speedCameraFires(
  roadClass: string, gear: ForwardGear, speedMps: number, carriageway?: Carriageway | null,
): boolean {
  const v = gearVerdict(roadClass, gear, speedMps, carriageway);
  return !v.ok && v.problem === 'too-fast';
}

// ── 30A: advice, never a lock ───────────────────────────────

/** The gears that suit a road: gearsFor under the name the rule uses. */
export const suitingGears = gearsFor;

/** The gear the prompt asks for: the road's top suiting gear, because what
 *  she feels is the speed (drive-spike.html's gearBest). */
export function bestGear(roadClass: string, carriageway?: Carriageway | null): ForwardGear {
  return Math.max(...gearsFor(roadClass, carriageway)) as ForwardGear;
}

/** Whether a gear suits the road, or is too fast or too slow for it, whatever
 *  the van's speed (gearVerdict adds the "barely moving is never told off"
 *  rule on top). */
export type GearFit = 'ok' | 'too-fast' | 'too-slow';

export function gearFit(roadClass: string, gear: ForwardGear, carriageway?: Carriageway | null): GearFit {
  const ok = gearsFor(roadClass, carriageway);
  if (ok.includes(gear)) return 'ok';
  return gear > Math.max(...ok) ? 'too-fast' : 'too-slow';
}

export const isTooFast = (roadClass: string, gear: ForwardGear, carriageway?: Carriageway | null): boolean =>
  gearFit(roadClass, gear, carriageway) === 'too-fast';

export const isTooSlow = (roadClass: string, gear: ForwardGear, carriageway?: Carriageway | null): boolean =>
  gearFit(roadClass, gear, carriageway) === 'too-slow';

/** The fastest the van goes in a gear, m/s, on any road. The road never lowers
 *  it: that would be the lock 30A dropped. */
export function gearTopSpeed(gear: ForwardGear): number {
  return GEAR_SPEED_MPS[gear];
}

/** How much harder the animals are jostled while she is too fast for the road
 *  (ride-comfort.ts multiplies the jostle by it). */
export const TOO_FAST_JOSTLE = 1.5;

/** How much sooner the van's own hard stops come while too fast: the distance
 *  at which it brakes itself for what is ahead is this much longer. */
export const TOO_FAST_STOP_SOONER = 1.6;

/**
 * What the wrong gear costs right now, for the scene to show. Built on
 * gearVerdict, so a van barely moving costs nothing. Nothing here crashes and
 * no animal is ever hurt; the dearest cost is a rougher ride.
 */
export interface GearCosts {
  /** Too fast for this road: a speed camera passed now flashes. The scene
   *  still fires each camera once (it is passed once). */
  speedCamera: boolean;
  /** Multiplier on the jostle the animals feel: TOO_FAST_JOSTLE while too
   *  fast, else 1. */
  jostleScale: number;
  /** Multiplier on the distance at which the van brakes itself for traffic or
   *  a crossing animal: TOO_FAST_STOP_SOONER while too fast, else 1. Those
   *  stops still count as rough driving. */
  stopSooner: number;
  /** Too slow on the dual carriageway: traffic queues behind her, beeping. */
  queue: boolean;
  /** Too fast on a farm track: a dust cloud the animals breathe, to draw. */
  dust: boolean;
}

export const NO_GEAR_COSTS: Readonly<GearCosts> = {
  speedCamera: false, jostleScale: 1, stopSooner: 1, queue: false, dust: false,
};

export function gearCosts(
  roadClass: string, gear: ForwardGear, speedMps: number, carriageway?: Carriageway | null,
): GearCosts {
  const v = gearVerdict(roadClass, gear, speedMps, carriageway);
  if (v.ok) return { ...NO_GEAR_COSTS };
  if (v.problem === 'too-slow') return { ...NO_GEAR_COSTS, queue: true };
  return {
    speedCamera: true, jostleScale: TOO_FAST_JOSTLE, stopSooner: TOO_FAST_STOP_SOONER,
    queue: false, dust: v.cost === 'dust',
  };
}

// ── The knob prompt ─────────────────────────────────────────

/** The prompt waits this long after a mismatch before the knob glows, so a
 *  short stretch of another road at a junction does not flicker it. */
export const HINT_DELAY_S = 0.6;

/** A key that changes when the road's suiting gears might: the class, and on
 *  the A28 the carriageway underfoot. A new key un-hushes the prompt. */
export function gearRoadKey(roadClass: string, carriageway?: Carriageway | null): string {
  return roadClass === 'trunk' && carriageway
    ? `${roadClass}:${carriageway.kind}:${carriageway.maxspeedMph}`
    : roadClass;
}

export interface GearHintState {
  /** gearRoadKey of the road the prompt was last judged on. */
  roadKey: string | null;
  /** The knob it wants to glow, 0 for none. */
  want: ForwardGear | 0;
  /** How long it has wanted it, seconds. */
  t: number;
  /** She picked a suiting gear while it glowed: quiet for this road. */
  hushed: boolean;
  /** The road's suiting gears, as of the last step (for pickGear). */
  suiting: readonly ForwardGear[];
}

export function createGearHint(): GearHintState {
  return { roadKey: null, want: 0, t: 0, hushed: false, suiting: ALL_GEARS };
}

export interface GearHintInput {
  roadClass: string;
  carriageway?: Carriageway | null;
  gear: ForwardGear;
  dt: number;
  /** The drive is over: no prompt. */
  arrived?: boolean;
}

export interface GearHintStep {
  state: GearHintState;
  /** The knob to pulse now, 0 for none. */
  knob: ForwardGear | 0;
}

/**
 * One step of the knob prompt (drive-spike.html's gearHint, without the lock).
 * It wants the road's best gear whenever she is in another, unless she has
 * already picked a suiting gear for this road while it glowed; it glows once
 * it has wanted the same knob for HINT_DELAY_S. A new road un-hushes it.
 */
export function stepGearHint(prev: GearHintState, { roadClass, carriageway, gear, dt, arrived = false }: GearHintInput): GearHintStep {
  const roadKey = gearRoadKey(roadClass, carriageway);
  const suiting = gearsFor(roadClass, carriageway);
  const hushed = roadKey === prev.roadKey ? prev.hushed : false;
  const best = bestGear(roadClass, carriageway);
  const fits = suiting.includes(gear);
  const want: ForwardGear | 0 = arrived || gear === best || (fits && hushed) ? 0 : best;
  const t = want && want === prev.want ? prev.t + dt : 0;
  const state: GearHintState = { roadKey, want, t, hushed, suiting };
  return { state, knob: t >= HINT_DELAY_S ? want : 0 };
}

/**
 * She picked a gear (the same one she is in counts, as a tap on it does). If
 * the knob was glowing and the gear suits the road, the prompt hushes until
 * the road changes. Never refuses the gear: the scene always takes it.
 */
export function pickGear(state: GearHintState, gear: ForwardGear, glowing: boolean): GearHintState {
  if (glowing && state.suiting.includes(gear)) return { ...state, hushed: true, want: 0, t: 0 };
  return state;
}
