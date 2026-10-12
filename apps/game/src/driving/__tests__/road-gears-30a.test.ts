import { describe, it, expect } from 'vitest';
import {
  GEAR_SPEED_MPS, HINT_DELAY_S, NO_GEAR_COSTS, TOO_FAST_JOSTLE, TOO_FAST_STOP_SOONER,
  bestGear, createGearHint, gearCosts, gearFit, gearRoadKey, gearTopSpeed, isTooFast, isTooSlow,
  stepGearHint, suitingGears, gearsFor, speedCameraFires,
  type ForwardGear, type GearHintState,
} from '../road-gears';
import type { Carriageway, CarriagewayKind } from '../trunk-carriageways';
import { carriageways } from './real-graph';

// docs/driving-rebuild-2026-10-11.md, "Every gear works on every road (30A,
// Marcus, 2026-10-12)": any gear, any road; the table is advice and a wrong
// gear costs what its right-hand column says.

const ROADS = ['trunk', 'secondary', 'tertiary', 'unclassified', 'residential', 'track', 'service'];
const GEARS: ForwardGear[] = [1, 2, 3];
const MOVING = 10;

function cw(kind: CarriagewayKind, maxspeedMph: number): Carriageway {
  return { edge: 0, nodes: [0, 1], kind, maxspeedMph, lanes: 2, oneway: null, lengthM: 100, osmWays: [] };
}

describe('every gear works on every road', () => {
  it('a gear\'s top speed is the same on every road: the road never lowers it', () => {
    for (const g of GEARS) expect(gearTopSpeed(g)).toBe(GEAR_SPEED_MPS[g]);
    // so the fastest speed needs third
    expect(Math.max(...GEARS.map(gearTopSpeed))).toBe(gearTopSpeed(3));
  });

  it('every gear on every road has a verdict and costs, never a refusal', () => {
    for (const r of ROADS) for (const g of GEARS) {
      const c = gearCosts(r, g, MOVING);
      expect(Object.keys(c).sort()).toEqual(Object.keys(NO_GEAR_COSTS).sort());
      expect(['ok', 'too-fast', 'too-slow']).toContain(gearFit(r, g));
    }
  });

  it('suitingGears is gearsFor, and every road suits at least one gear', () => {
    expect(suitingGears).toBe(gearsFor);
    for (const r of ROADS) expect(suitingGears(r).length).toBeGreaterThan(0);
    for (const k of ['dual', 'divided', 'single'] as CarriagewayKind[]) {
      for (const mph of [5, 10, 20, 30, 40, 50, 60, 70]) {
        expect(suitingGears('trunk', cw(k, mph)).length).toBeGreaterThan(0);
      }
    }
  });

  it('a stretch slower than first still suits first rather than nothing', () => {
    expect(suitingGears('trunk', cw('single', 10))).toEqual([1]);
    expect(gearFit('trunk', 1, cw('single', 10))).toBe('ok');
    expect(gearFit('trunk', 2, cw('single', 10))).toBe('too-fast');
  });
});

describe('bestGear: the road\'s top suiting gear', () => {
  it.each([
    ['trunk', 3], ['secondary', 3], ['tertiary', 3],
    ['unclassified', 2], ['residential', 2], ['track', 1], ['service', 3],
  ] as [string, ForwardGear][])('%s → %s', (r, g) => {
    expect(bestGear(r)).toBe(g);
  });

  it('follows the A28\'s carriageway', () => {
    expect(bestGear('trunk', cw('dual', 50))).toBe(3);
    expect(bestGear('trunk', cw('single', 30))).toBe(2);
    expect(bestGear('trunk', cw('divided', 40))).toBe(2);
    expect(bestGear('trunk', cw('dual', 40))).toBe(2);
  });

  it('on the real A28 the best gear always suits it', () => {
    for (const c of carriageways.all) expect(suitingGears('trunk', c)).toContain(bestGear('trunk', c));
  });
});

describe('gearFit', () => {
  it('reads the table, whatever the speed', () => {
    expect(gearFit('trunk', 1)).toBe('too-slow');
    expect(gearFit('trunk', 2)).toBe('ok');
    expect(gearFit('residential', 3)).toBe('too-fast');
    expect(gearFit('track', 2)).toBe('too-fast');
    expect(gearFit('secondary', 1)).toBe('ok');
    expect(isTooFast('unclassified', 3)).toBe(true);
    expect(isTooFast('unclassified', 2)).toBe(false);
    expect(isTooSlow('trunk', 1)).toBe(true);
    expect(isTooSlow('track', 1)).toBe(false);
  });

  it('on the A28: third is too fast through The Square, first too slow on the dual', () => {
    expect(gearFit('trunk', 3, cw('single', 30))).toBe('too-fast');
    expect(gearFit('trunk', 1, cw('single', 30))).toBe('ok');
    expect(gearFit('trunk', 1, cw('dual', 50))).toBe('too-slow');
    expect(gearFit('trunk', 3, cw('dual', 50))).toBe('ok');
  });
});

describe('gearCosts: what the wrong gear costs', () => {
  it('nothing in a suiting gear', () => {
    for (const r of ROADS) for (const g of suitingGears(r)) expect(gearCosts(r, g, MOVING)).toEqual(NO_GEAR_COSTS);
  });

  it('nothing while barely moving, whatever the gear', () => {
    for (const r of ROADS) for (const g of GEARS) expect(gearCosts(r, g, 0.5)).toEqual(NO_GEAR_COSTS);
  });

  it('too fast on a lane: the camera, a harder jostle and sooner stops, no dust', () => {
    expect(gearCosts('unclassified', 3, MOVING)).toEqual({
      speedCamera: true, jostleScale: TOO_FAST_JOSTLE, stopSooner: TOO_FAST_STOP_SOONER, queue: false, dust: false,
    });
    expect(gearCosts('residential', 3, MOVING).speedCamera).toBe(true);
  });

  it('too fast on a farm track also throws up dust the animals breathe', () => {
    for (const g of [2, 3] as ForwardGear[]) {
      expect(gearCosts('track', g, MOVING)).toMatchObject({ speedCamera: true, dust: true, jostleScale: TOO_FAST_JOSTLE });
    }
    expect(gearCosts('track', 1, MOVING).dust).toBe(false);
  });

  it('too slow on the dual carriageway queues the traffic, and costs nothing else', () => {
    expect(gearCosts('trunk', 1, MOVING)).toEqual({ ...NO_GEAR_COSTS, queue: true });
    expect(gearCosts('trunk', 1, MOVING, cw('dual', 50)).queue).toBe(true);
    expect(gearCosts('trunk', 1, MOVING, cw('single', 30)).queue).toBe(false);
  });

  it('dust only ever on a farm track, the queue only ever on the trunk road', () => {
    for (const r of ROADS) for (const g of GEARS) {
      const c = gearCosts(r, g, MOVING);
      if (c.dust) expect(r).toBe('track');
      if (c.queue) expect(r).toBe('trunk');
    }
  });

  it('agrees with speedCameraFires everywhere', () => {
    for (const r of ROADS) for (const g of GEARS) for (const v of [0, 0.5, 5, 20]) {
      expect(gearCosts(r, g, v).speedCamera).toBe(speedCameraFires(r, g, v));
    }
    for (const c of carriageways.all) for (const g of GEARS) {
      expect(gearCosts('trunk', g, MOVING, c).speedCamera).toBe(speedCameraFires('trunk', g, MOVING, c));
    }
  });

  it('the costs make it rougher, never gentler', () => {
    expect(TOO_FAST_JOSTLE).toBeGreaterThan(1);
    expect(TOO_FAST_STOP_SOONER).toBeGreaterThan(1);
  });
});

// ── The knob prompt ──

/** Drive `secs` on one road in one gear, in 1/60 s steps. */
function drive(state: GearHintState, roadClass: string, gear: ForwardGear, secs: number, carriageway?: Carriageway | null) {
  let knob: ForwardGear | 0 = 0;
  const n = Math.round(secs * 60);
  for (let i = 0; i < n; i++) ({ state, knob } = stepGearHint(state, { roadClass, carriageway, gear, dt: 1 / 60 }));
  return { state, knob };
}

describe('the knob prompt', () => {
  it('stays quiet in the road\'s best gear', () => {
    expect(drive(createGearHint(), 'secondary', 3, 5).knob).toBe(0);
    expect(drive(createGearHint(), 'track', 1, 5).knob).toBe(0);
  });

  it('33A: second on a main road, where every gear suits, pulses nothing', () => {
    expect(drive(createGearHint(), 'secondary', 2, 5).knob).toBe(0);
    expect(drive(createGearHint(), 'secondary', 1, 5).knob).toBe(0);
    expect(drive(createGearHint(), 'tertiary', 2, 5).knob).toBe(0);
  });

  it('33A: a knob pulses exactly when her gear does not suit the road', () => {
    for (const r of ROADS) for (const g of GEARS) {
      const { knob } = drive(createGearHint(), r, g, 1);
      expect(knob !== 0, `${r} in ${g}`).toBe(!suitingGears(r).includes(g));
    }
    for (const c of carriageways.all) for (const g of GEARS) {
      const { knob } = drive(createGearHint(), 'trunk', g, 1, c);
      expect(knob !== 0, `A28 ${c.kind} ${c.maxspeedMph} in ${g}`).toBe(!suitingGears('trunk', c).includes(g));
    }
  });

  it('33A: suiting but not the best is quiet on the A28 too', () => {
    // second on the 50 mph dual suits it; third is its best
    expect(bestGear('trunk', cw('dual', 50))).toBe(3);
    expect(drive(createGearHint(), 'trunk', 2, 3, cw('dual', 50)).knob).toBe(0);
    // first through The Square suits it; second is its best
    expect(drive(createGearHint(), 'trunk', 1, 3, cw('single', 30)).knob).toBe(0);
  });

  it('waits HINT_DELAY_S after a mismatch, then pulses the best knob', () => {
    expect(HINT_DELAY_S).toBe(0.6);
    expect(drive(createGearHint(), 'track', 3, 0.5).knob).toBe(0);
    expect(drive(createGearHint(), 'track', 3, 0.7).knob).toBe(1);
    expect(drive(createGearHint(), 'trunk', 1, 0.7).knob).toBe(3);
    expect(drive(createGearHint(), 'residential', 3, 0.7).knob).toBe(2);
  });

  it('the knob it pulses always suits the road', () => {
    for (const r of ROADS) for (const g of GEARS) {
      const { knob } = drive(createGearHint(), r, g, 1);
      if (knob) expect(suitingGears(r)).toContain(knob);
    }
  });

  it('picking any suiting gear stops it at once, not only the best', () => {
    const { state, knob } = drive(createGearHint(), 'residential', 3, 1);
    expect(knob).toBe(2);
    expect(stepGearHint(state, { roadClass: 'residential', gear: 1, dt: 1 / 60 }).knob).toBe(0);
    expect(stepGearHint(state, { roadClass: 'residential', gear: 2, dt: 1 / 60 }).knob).toBe(0);
  });

  it('a gear that still does not suit keeps it glowing, with no new wait', () => {
    const { state } = drive(createGearHint(), 'track', 3, 1);
    // down to second on a farm track: still too fast, first still pulses
    expect(stepGearHint(state, { roadClass: 'track', gear: 2, dt: 1 / 60 }).knob).toBe(1);
  });

  it('it comes back if she leaves a suiting gear for one that does not', () => {
    let { state } = drive(createGearHint(), 'residential', 1, 1);
    expect(state.want).toBe(0);
    ({ state } = drive(state, 'residential', 3, 0.5));
    expect(stepGearHint(state, { roadClass: 'residential', gear: 3, dt: 1 / 60 }).knob).toBe(0);
    expect(drive(state, 'residential', 3, 0.2).knob).toBe(2);
  });

  it('onto a road her gear suits, it stops; onto one it does not, it waits again', () => {
    const { state } = drive(createGearHint(), 'track', 2, 1);
    expect(drive(state, 'secondary', 2, 1 / 60).knob).toBe(0);
    const s = drive(state, 'secondary', 2, 1).state;
    expect(drive(s, 'track', 2, 0.5).knob).toBe(0);
    expect(drive(s, 'track', 2, 0.7).knob).toBe(1);
  });

  it('a different A28 carriageway is a new road', () => {
    expect(gearRoadKey('trunk', cw('dual', 50))).not.toBe(gearRoadKey('trunk', cw('single', 30)));
    expect(gearRoadKey('trunk')).toBe('trunk');
    expect(gearRoadKey('secondary', cw('single', 30))).toBe('secondary');
    const { state } = drive(createGearHint(), 'trunk', 3, 1, cw('dual', 50));
    expect(state.want).toBe(0);
    // into The Square in third: too fast, second pulses
    expect(drive(state, 'trunk', 3, 0.7, cw('single', 30)).knob).toBe(2);
  });

  it('a short stretch of another road at a junction does not flicker it', () => {
    let { state } = drive(createGearHint(), 'secondary', 3, 1);
    ({ state } = drive(state, 'residential', 3, 0.3));
    const { knob } = drive(state, 'secondary', 3, 0.1);
    expect(knob).toBe(0);
  });

  it('switching the knob it wants restarts the wait', () => {
    let { state } = drive(createGearHint(), 'track', 3, 0.5); // wants 1
    ({ state } = drive(state, 'trunk', 1, 0.3)); // wants 3, 0.3 s in
    expect(state.want).toBe(3);
    expect(state.t).toBeLessThan(HINT_DELAY_S);
  });

  it('is quiet once she has arrived', () => {
    let s = createGearHint();
    let knob: ForwardGear | 0 = 0;
    for (let i = 0; i < 60; i++) ({ state: s, knob } = stepGearHint(s, { roadClass: 'track', gear: 3, dt: 1 / 60, arrived: true }));
    expect(knob).toBe(0);
  });
});
