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
 * No Phaser — unit-tested.
 */

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

export function gearsFor(roadClass: string): readonly ForwardGear[] {
  return GEAR_OK[roadClass] ?? ALL_GEARS;
}

export function gearVerdict(roadClass: string, gear: ForwardGear, speedMps: number): GearVerdict {
  const roadName = ROAD_NAME[roadClass] ?? roadClass;
  const ok = gearsFor(roadClass);
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
 */
export function speedCameraFires(roadClass: string, gear: ForwardGear, speedMps: number): boolean {
  const v = gearVerdict(roadClass, gear, speedMps);
  return !v.ok && v.problem === 'too-fast';
}
