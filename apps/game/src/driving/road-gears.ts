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
    return carriageway.kind === 'dual' ? within.filter((g) => GEAR_OK.trunk.includes(g)) : within;
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
