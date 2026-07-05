import { describe, it, expect } from 'vitest';
import {
  createDriveState,
  clampLane,
  shiftLane,
  cycleGear,
  gearLabel,
  gearScrollRate,
  NUM_LANES,
  GEAR_ORDER,
  REVERSE,
  type Gear,
} from '../drive-state';

describe('drive-state', () => {
  describe('createDriveState', () => {
    it('starts in the middle lane, first gear, full comfort', () => {
      const s = createDriveState();
      expect(s.lane).toBe(Math.floor(NUM_LANES / 2));
      expect(s.gear).toBe(1);
      expect(s.progress).toBe(0);
      expect(s.cargoComfort).toBe(100);
    });

    it('defaults to Henry, demo drive, clear weather', () => {
      const s = createDriveState();
      expect(s.vehicle).toBe('henry');
      expect(s.driveType).toBe('demo');
      expect(s.weather).toBe('clear');
    });

    it('honours provided options', () => {
      const s = createDriveState({
        vehicle: 'bea',
        driveType: 'vet',
        destinationId: 'bay-road-vets',
        weather: 'rain',
      });
      expect(s.vehicle).toBe('bea');
      expect(s.driveType).toBe('vet');
      expect(s.destinationId).toBe('bay-road-vets');
      expect(s.weather).toBe('rain');
    });
  });

  describe('clampLane', () => {
    it('clamps below 0 to 0', () => {
      expect(clampLane(-1)).toBe(0);
      expect(clampLane(-5)).toBe(0);
    });
    it('clamps above the last lane', () => {
      expect(clampLane(NUM_LANES)).toBe(NUM_LANES - 1);
      expect(clampLane(99)).toBe(NUM_LANES - 1);
    });
    it('rounds fractional lanes', () => {
      expect(clampLane(1.4)).toBe(1);
      expect(clampLane(0.6)).toBe(1);
    });
  });

  describe('shiftLane', () => {
    it('moves left and right within bounds', () => {
      expect(shiftLane(1, -1)).toBe(0);
      expect(shiftLane(1, 1)).toBe(2);
    });
    it('does not move past the edges', () => {
      expect(shiftLane(0, -1)).toBe(0);
      expect(shiftLane(NUM_LANES - 1, 1)).toBe(NUM_LANES - 1);
    });
  });

  describe('cycleGear', () => {
    it('steps up through the forward gears', () => {
      expect(cycleGear(1, 1)).toBe(2);
      expect(cycleGear(2, 1)).toBe(3);
    });
    it('steps down and into reverse', () => {
      expect(cycleGear(2, -1)).toBe(1);
      expect(cycleGear(1, -1)).toBe(REVERSE);
    });
    it('clamps at reverse and top gear', () => {
      expect(cycleGear(REVERSE, -1)).toBe(REVERSE);
      expect(cycleGear(3, 1)).toBe(3);
    });
    it('only ever yields a gear in GEAR_ORDER', () => {
      for (const g of GEAR_ORDER) {
        expect(GEAR_ORDER).toContain(cycleGear(g, 1));
        expect(GEAR_ORDER).toContain(cycleGear(g, -1));
      }
    });
  });

  describe('gearLabel', () => {
    it('labels reverse as R and forward gears numerically', () => {
      expect(gearLabel(REVERSE)).toBe('R');
      expect(gearLabel(1)).toBe('1');
      expect(gearLabel(2)).toBe('2');
      expect(gearLabel(3)).toBe('3');
    });
  });

  describe('gearScrollRate', () => {
    it('reverses with a negative rate', () => {
      expect(gearScrollRate(REVERSE)).toBeLessThan(0);
    });
    it('ramps forward gears exponentially (each gap bigger than the last)', () => {
      const g1 = gearScrollRate(1);
      const g2 = gearScrollRate(2);
      const g3 = gearScrollRate(3);
      expect(g1).toBeGreaterThan(0);
      expect(g2).toBeGreaterThan(g1);
      expect(g3).toBeGreaterThan(g2);
      // Exponential, not linear: the 2→3 jump exceeds the 1→2 jump.
      expect(g3 - g2).toBeGreaterThan(g2 - g1);
    });
    it('reverse is gentler than first gear', () => {
      expect(Math.abs(gearScrollRate(REVERSE))).toBeLessThan(gearScrollRate(1));
    });
  });
});
