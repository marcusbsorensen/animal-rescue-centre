import { describe, it, expect } from 'vitest';
import { jostleComfort } from '../drive-state';
import {
  ACCEL, BRAKE, EMERGENCY, HANDBRAKE, SETTLE_PER_S,
  jostleDelta, stepComfort, stepJostle, stepSpeed,
} from '../ride-comfort';

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
