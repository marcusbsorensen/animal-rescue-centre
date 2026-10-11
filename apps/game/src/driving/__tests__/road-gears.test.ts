import { describe, it, expect } from 'vitest';
import { GEAR_OK, GEAR_SPEED_MPS, ROAD_NAME, gearVerdict, gearsFor, speedCameraFires, type ForwardGear } from '../road-gears';
import { graph } from './real-graph';

// docs/driving-rebuild-2026-10-11.md, "Gears are about choosing a speed":
//   trunk                    2-3  first gear: traffic beeping, pulling up behind
//   secondary, tertiary      any  -
//   unclassified, residential 1-2 too fast
//   track                    1    a dust storm the animals breathe

const MOVING = 10;

describe('every row of the spec table', () => {
  const cases: [string, ForwardGear, true | ['too-fast' | 'too-slow', string, string]][] = [
    ['trunk', 1, ['too-slow', 'beeping', 'queue']],
    ['trunk', 2, true],
    ['trunk', 3, true],
    ['secondary', 1, true], ['secondary', 2, true], ['secondary', 3, true],
    ['tertiary', 1, true], ['tertiary', 2, true], ['tertiary', 3, true],
    ['unclassified', 1, true], ['unclassified', 2, true],
    ['unclassified', 3, ['too-fast', 'too fast', 'speeding']],
    ['residential', 1, true], ['residential', 2, true],
    ['residential', 3, ['too-fast', 'slow down', 'speeding']],
    ['track', 1, true],
    ['track', 2, ['too-fast', 'dust!', 'dust']],
    ['track', 3, ['too-fast', 'dust!', 'dust']],
  ];
  it.each(cases)('%s in gear %s', (cls, gear, want) => {
    const v = gearVerdict(cls, gear, MOVING);
    expect(v.roadName).toBe(ROAD_NAME[cls]);
    if (want === true) expect(v.ok).toBe(true);
    else expect(v).toMatchObject({ ok: false, problem: want[0], label: want[1], cost: want[2] });
  });
});

describe('gearVerdict', () => {
  it('never tells off a van that is barely moving', () => {
    expect(gearVerdict('track', 3, 0.5).ok).toBe(true);
    expect(gearVerdict('trunk', 1, 0).ok).toBe(true);
    expect(gearVerdict('track', 3, 1).ok).toBe(false);
  });

  it('a class the table does not know takes any gear, under its own name', () => {
    expect(gearsFor('service')).toEqual([1, 2, 3]);
    expect(gearVerdict('service', 3, MOVING)).toEqual({ ok: true, roadName: 'service' });
  });

  it('covers every road class on the real graph', () => {
    for (const cls of new Set(graph.edges.map((e) => e[2]))) {
      expect(GEAR_OK[cls], cls).toBeDefined();
      expect(ROAD_NAME[cls], cls).toBeDefined();
    }
  });

  it('has the spike\'s gear speeds', () => {
    expect(GEAR_SPEED_MPS).toEqual({ 1: 7, 2: 13, 3: 20 });
  });
});

describe('speedCameraFires', () => {
  it('fires on too fast for the road, not on a fixed gear', () => {
    expect(speedCameraFires('residential', 3, MOVING)).toBe(true);
    expect(speedCameraFires('unclassified', 3, MOVING)).toBe(true);
    expect(speedCameraFires('track', 2, MOVING)).toBe(true);
    // Third gear is right for a main road and the dual carriageway.
    expect(speedCameraFires('secondary', 3, MOVING)).toBe(false);
    expect(speedCameraFires('trunk', 3, MOVING)).toBe(false);
  });

  it('never fires on a gear the road suits', () => {
    for (const [cls, ok] of Object.entries(GEAR_OK)) {
      for (const g of ok) expect(speedCameraFires(cls, g, MOVING), `${cls} ${g}`).toBe(false);
    }
  });

  it('never fires for too slow', () => {
    expect(gearVerdict('trunk', 1, MOVING).ok).toBe(false);
    expect(speedCameraFires('trunk', 1, MOVING)).toBe(false);
  });

  it('never fires on a van barely moving, or on a road the table does not know', () => {
    expect(speedCameraFires('track', 3, 0)).toBe(false);
    expect(speedCameraFires('service', 3, MOVING)).toBe(false);
  });
});
