import { describe, it, expect } from 'vitest';
import { jostleComfort } from '../drive-state';
import {
  ACCEL, BRAKE, EMERGENCY, HANDBRAKE, PULL_UP, SETTLE_PER_S, STOP_SHORT_M,
  advanceAlong, arrivalCap, hasArrived, jostleDelta, stepComfort, stepJostle, stepSpeed,
  DECEL_JOSTLE, SWERVE_JOSTLE, TOP_OUT, TOP_PULL, gearPull, knockComfort, soonerCap,
} from '../ride-comfort';
import { GEAR_SPEED_MPS, TOO_FAST_JOSTLE, TOO_FAST_STOP_SOONER } from '../road-gears';

const DT = 1 / 60;

describe('speed', () => {
  const base = { v: 0, target: 13, speedCap: Infinity, handbrake: false, dt: DT };

  it('accelerates towards the gear speed at ACCEL and never past it', () => {
    expect(stepSpeed(base)).toEqual({ v: ACCEL * DT, hardDecel: 0, emergency: false });
    expect(stepSpeed({ ...base, v: 12.99 }).v).toBe(13);
  });

  it('letting go slows at BRAKE, and that is not hard deceleration', () => {
    expect(stepSpeed({ ...base, v: 13, target: 0 })).toEqual({ v: 13 - BRAKE * DT, hardDecel: 0, emergency: false });
  });

  it('the handbrake slams on at HANDBRAKE', () => {
    expect(stepSpeed({ ...base, v: 13, handbrake: true })).toEqual({ v: 13 - HANDBRAKE * DT, hardDecel: HANDBRAKE, emergency: false });
    expect(stepSpeed({ ...base, v: 0.1, handbrake: true }).v).toBe(0);
  });

  it('when the child has not braked for something ahead, the van stops itself at 26 m/s²', () => {
    expect(EMERGENCY).toBe(26);
    const s = stepSpeed({ ...base, v: 20, target: 20, speedCap: 5 });
    expect(s).toEqual({ v: 20 - EMERGENCY * DT, hardDecel: EMERGENCY, emergency: true });
    // and never below what is ahead allows
    expect(stepSpeed({ ...base, v: 5.1, target: 20, speedCap: 5 }).v).toBe(5);
    // holding go behind it does not creep past
    expect(stepSpeed({ ...base, v: 5, target: 20, speedCap: 5 }).v).toBe(5);
  });

  it('the self-stop wins over the handbrake while the van is over the cap', () => {
    expect(stepSpeed({ ...base, v: 20, speedCap: 5, handbrake: true }).emergency).toBe(true);
  });

  it('from gear 3, a 15 m/s self-stop takes about 0.58 s and is never contact', () => {
    let s = { v: 20, hardDecel: 0, emergency: false }, t = 0;
    while (s.v > 5) { s = stepSpeed({ v: s.v, target: 20, speedCap: 5, handbrake: false, dt: DT }); t += DT; }
    expect(t).toBeCloseTo(15 / 26, 1);
    expect(s.v).toBe(5);
  });
});

describe('jostle', () => {
  it('a swerve and hard deceleration add; smooth driving settles it', () => {
    expect(jostleDelta(7, 0, 1)).toBeCloseTo(7 * 1.6 - SETTLE_PER_S, 12);
    expect(jostleDelta(0, EMERGENCY, 1)).toBeCloseTo(13 - SETTLE_PER_S, 12);
    expect(jostleDelta(0, 0, 1)).toBe(-SETTLE_PER_S);
  });

  it('one self-stop from gear 3 with a lane change leaves a mark that settles in seconds', () => {
    let j = 0;
    for (let i = 0; i < 35; i++) j = stepJostle(j, 0, EMERGENCY, DT);    // ~0.58 s self-stop
    for (let i = 0; i < 43; i++) j = stepJostle(j, 7, 0, DT);            // 5 m lane change
    expect(j).toBeGreaterThan(5);
    for (let i = 0; i < 2 * 60; i++) j = stepJostle(j, 0, 0, DT);
    expect(j).toBe(0);
  });

  it('stays within 0..100', () => {
    let j = 0;
    for (let i = 0; i < 60 * 30; i++) j = stepJostle(j, 7, HANDBRAKE, DT);
    expect(j).toBe(100);
    expect(stepJostle(0, 0, 0, DT)).toBe(0);
  });

  it('is cargoComfort counted the other way: comfort = 100 - jostle, through jostleComfort', () => {
    for (const [c, sw, d] of [[100, 7, 0], [40, 0, 26], [3, 0, 0], [99, 2, 34]]) {
      const delta = jostleDelta(sw, d, DT);
      expect(stepComfort(c, sw, d, DT)).toBe(jostleComfort(c, delta));
      expect(stepJostle(100 - c, sw, d, DT)).toBeCloseTo(100 - stepComfort(c, sw, d, DT), 12);
    }
  });

  it('easing off "go" never jostles anyone', () => {
    const s = stepSpeed({ v: 20, target: 0, speedCap: Infinity, handbrake: false, dt: DT });
    expect(s.hardDecel).toBe(0);
    expect(BRAKE).toBe(14);
  });
});

describe('pulling up at the destination', () => {
  const TOP = GEAR_SPEED_MPS[3];

  it('lowers the speed she can ask for to sqrt(2 * 2.5 * (toGo - 6))', () => {
    expect([PULL_UP, STOP_SHORT_M]).toEqual([2.5, 6]);
    expect(arrivalCap(6 + 80)).toBeCloseTo(TOP, 12);   // top speed is allowed until 86 m out
    expect(arrivalCap(6 + 10)).toBeCloseTo(Math.sqrt(50), 12);
    expect(arrivalCap(6)).toBe(0);
    expect(arrivalCap(2)).toBe(0);
    // far out, nothing changes
    expect(stepSpeed({ v: TOP, target: TOP, speedCap: Infinity, handbrake: false, dt: DT, toGo: 200 }).v).toBe(TOP);
    // inside it, holding go slows the van like easing off does, at BRAKE, not hard
    const s = stepSpeed({ v: TOP, target: TOP, speedCap: Infinity, handbrake: false, dt: DT, toGo: 46 });
    expect(s).toEqual({ v: TOP - BRAKE * DT, hardDecel: 0, emergency: false });
    // and accelerating never goes past it
    expect(stepSpeed({ v: 9.9, target: TOP, speedCap: Infinity, handbrake: false, dt: DT, toGo: 26 }).v).toBe(10);
  });

  it('with no destination given, stepSpeed is unchanged', () => {
    expect(stepSpeed({ v: TOP, target: TOP, speedCap: Infinity, handbrake: false, dt: DT }).v).toBe(TOP);
  });

  for (const fps of [30, 60, 120]) {
    it(`from 20 m/s holding go, stops 6 m short with no jostle added (${fps} fps)`, () => {
      const dt = 1 / fps, length = 600;
      let s = 300, v = TOP, j = 0, t = 0, arrivedAt = -1;
      while (t < 20) {
        const toGo = length - s;
        const step = stepSpeed({ v, target: TOP, speedCap: Infinity, handbrake: false, dt, toGo });
        expect(step.hardDecel).toBe(0);
        expect(step.emergency).toBe(false);
        v = step.v;
        s = advanceAlong(s, v, dt, length);
        j = stepJostle(j, 0, step.hardDecel, dt);
        if (arrivedAt < 0 && hasArrived(length - s, v)) arrivedAt = t;
        t += dt;
      }
      expect(j).toBe(0);
      expect(length - s).toBeCloseTo(STOP_SHORT_M, 6);
      expect(v).toBeLessThan(0.01);
      // it pulls up in about the time a 2.5 m/s² stop from where it starts slowing takes
      expect(arrivedAt).toBeGreaterThan(0);
      expect(arrivedAt).toBeLessThan((300 - 80 - 6) / TOP + TOP / PULL_UP + 0.5);
    });
  }

  it('never rolls past the stopping point', () => {
    expect(advanceAlong(590, 20, 1, 600)).toBe(594);
    expect(advanceAlong(500, 20, 1, 600)).toBe(520);
    expect(hasArrived(6.4, 0.1)).toBe(true);
    expect(hasArrived(6.4, 0.3)).toBe(false);
    expect(hasArrived(7, 0)).toBe(false);
  });
});

// ── 30A: the wrong gear for the road (road-gears.ts gearCosts) ──
describe('the wrong gear for the road', () => {
  const base = { v: 0, target: 13, speedCap: Infinity, handbrake: false, dt: DT };

  it('jostles the animals harder while too fast, and settles as fast as ever', () => {
    expect(jostleDelta(2, EMERGENCY, DT, TOO_FAST_JOSTLE)).toBeCloseTo(
      ((2 * SWERVE_JOSTLE + EMERGENCY * DECEL_JOSTLE) * TOO_FAST_JOSTLE - SETTLE_PER_S) * DT,
    );
    expect(jostleDelta(0, 0, 1, TOO_FAST_JOSTLE)).toBe(jostleDelta(0, 0, 1));
    expect(stepComfort(80, 0, EMERGENCY, 0.5, TOO_FAST_JOSTLE)).toBeLessThan(stepComfort(80, 0, EMERGENCY, 0.5));
    expect(stepJostle(20, 0, HANDBRAKE, 0.2, TOO_FAST_JOSTLE)).toBeGreaterThan(stepJostle(20, 0, HANDBRAKE, 0.2));
  });

  it('a single knock lands harder too, and is the same knock in a suiting gear', () => {
    expect(knockComfort(80, 6)).toBe(jostleComfort(80, 6));
    expect(knockComfort(80, 6, TOO_FAST_JOSTLE)).toBe(jostleComfort(80, 6 * TOO_FAST_JOSTLE));
    expect(knockComfort(2, 15, TOO_FAST_JOSTLE)).toBe(0);
  });

  it('the van\'s own hard stops come sooner, and are still hard deceleration', () => {
    // a cap of 10 m/s; at 9 m/s she is under it in a suiting gear
    expect(stepSpeed({ ...base, v: 9, target: 9, speedCap: 10 }).emergency).toBe(false);
    const s = stepSpeed({ ...base, v: 9, target: 9, speedCap: 10, stopSooner: TOO_FAST_STOP_SOONER });
    expect(s.emergency).toBe(true);
    expect(s.hardDecel).toBe(EMERGENCY);
    expect(s.v).toBeCloseTo(Math.max(soonerCap(10, TOO_FAST_STOP_SOONER), 9 - EMERGENCY * DT));
  });

  it('soonerCap wants stopSooner times the stopping distance clear', () => {
    // caps are sqrt(2·a·gap): the stopping distance at the new cap × k is the gap
    const a = 4, gap = 30, cap = Math.sqrt(2 * a * gap);
    const c = soonerCap(cap, 2);
    expect((c * c) / (2 * a) * 2).toBeCloseTo(gap);
    expect(soonerCap(cap, 1)).toBe(cap);
    expect(soonerCap(Infinity, 2)).toBe(Infinity);
    expect(soonerCap(0, 2)).toBe(0);
  });

  it('never makes the van go faster than without it', () => {
    for (const v of [0, 3, 9, 15]) for (const cap of [0, 5, 10, Infinity]) {
      const plain = stepSpeed({ ...base, v, target: 20, speedCap: cap });
      const sooner = stepSpeed({ ...base, v, target: 20, speedCap: cap, stopSooner: TOO_FAST_STOP_SOONER });
      expect(sooner.v).toBeLessThanOrEqual(plain.v + 1e-12);
    }
  });
});

describe('the gear\'s pull near its top speed', () => {
  const base = { v: 0, target: 7, speedCap: Infinity, handbrake: false, dt: DT };

  it('full pull well below the top, a fading pull near it, never none', () => {
    expect(gearPull(0, 7)).toBe(1);
    expect(gearPull(7 - TOP_OUT, 7)).toBe(1);
    expect(gearPull(7 - TOP_OUT / 2, 7)).toBeCloseTo(0.5);
    expect(gearPull(7, 7)).toBe(TOP_PULL);
  });

  it('stepSpeed gains slowly near the gear\'s top, and still gets there', () => {
    const near = stepSpeed({ ...base, v: 6.5, gearTop: 7 });
    expect(near.v - 6.5).toBeCloseTo(ACCEL * gearPull(6.5, 7) * DT);
    expect(near.v - 6.5).toBeLessThan(ACCEL * DT);
    let v = 0;
    for (let i = 0; i < 60 * 10; i++) v = stepSpeed({ ...base, v, gearTop: 7 }).v;
    expect(v).toBe(7);
  });

  it('without a gearTop it accelerates as before', () => {
    expect(stepSpeed({ ...base, v: 6.5 }).v).toBeCloseTo(6.5 + ACCEL * DT);
  });

  it('in first on a main road the needle leans and stops at first\'s top', () => {
    let v = 0;
    for (let i = 0; i < 60 * 10; i++) v = stepSpeed({ ...base, target: GEAR_SPEED_MPS[1], v, gearTop: GEAR_SPEED_MPS[1] }).v;
    expect(v).toBe(GEAR_SPEED_MPS[1]);
  });
});
