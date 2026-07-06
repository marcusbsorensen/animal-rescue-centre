import { describe, it, expect } from 'vitest';
import { laneSpeedFactor, preferredLane, carAbsoluteSpeed } from '../traffic-sim';
import { TRAFFIC_PROFILES } from '../traffic';
import { NUM_LANES } from '../drive-state';

describe('traffic-sim', () => {
  describe('laneSpeedFactor', () => {
    it('rises from the slow lane to the fast lane', () => {
      const slow = laneSpeedFactor(0);
      const fast = laneSpeedFactor(NUM_LANES - 1);
      expect(slow).toBeLessThan(1);
      expect(fast).toBeGreaterThan(1);
      expect(fast).toBeGreaterThan(slow);
    });
    it('is monotonic across lanes', () => {
      let prev = -Infinity;
      for (let l = 0; l < NUM_LANES; l++) {
        const f = laneSpeedFactor(l);
        expect(f).toBeGreaterThan(prev);
        prev = f;
      }
    });
    it('returns 1 for a single-lane road (no fast/slow)', () => {
      expect(laneSpeedFactor(0, 1)).toBe(1);
    });
  });

  describe('preferredLane', () => {
    it('puts the tractor in the slow lane and the ambulance in the fast lane', () => {
      expect(preferredLane(TRAFFIC_PROFILES.tractor)).toBe(0);
      expect(preferredLane(TRAFFIC_PROFILES.emergency)).toBe(NUM_LANES - 1);
    });
    it('keeps preferences within lane bounds', () => {
      for (const p of Object.values(TRAFFIC_PROFILES)) {
        const l = preferredLane(p);
        expect(l).toBeGreaterThanOrEqual(0);
        expect(l).toBeLessThan(NUM_LANES);
      }
    });
    it('collapses to lane 0 on a single-lane road', () => {
      expect(preferredLane(TRAFFIC_PROFILES.car, 1)).toBe(0);
    });
  });

  describe('carAbsoluteSpeed', () => {
    const REF = 7.2;
    it('makes a vehicle faster in the fast lane than the slow lane', () => {
      const p = TRAFFIC_PROFILES.car;
      const slow = carAbsoluteSpeed(p, 0, REF);
      const fast = carAbsoluteSpeed(p, NUM_LANES - 1, REF);
      expect(fast).toBeGreaterThan(slow);
    });
    it('keeps a tractor slower than a car in the same lane', () => {
      const lane = 1;
      expect(carAbsoluteSpeed(TRAFFIC_PROFILES.tractor, lane, REF))
        .toBeLessThan(carAbsoluteSpeed(TRAFFIC_PROFILES.car, lane, REF));
    });
  });
});
