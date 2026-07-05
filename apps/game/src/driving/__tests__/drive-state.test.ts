import { describe, it, expect } from 'vitest';
import {
  createDriveState,
  clampLane,
  shiftLane,
  changeSpeed,
  speedLabel,
  speedScrollRate,
  NUM_LANES,
  MAX_SPEED_STEP,
  type SpeedStep,
} from '../drive-state';

describe('drive-state', () => {
  describe('createDriveState', () => {
    it('starts in the middle lane at a steady cruise', () => {
      const s = createDriveState();
      expect(s.lane).toBe(Math.floor(NUM_LANES / 2));
      expect(s.speedStep).toBe(1);
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

  describe('changeSpeed', () => {
    it('steps up and down', () => {
      expect(changeSpeed(0, 1)).toBe(1);
      expect(changeSpeed(1, 1)).toBe(2);
      expect(changeSpeed(2, -1)).toBe(1);
    });
    it('clamps at the floor and ceiling', () => {
      expect(changeSpeed(0, -1)).toBe(0);
      expect(changeSpeed(MAX_SPEED_STEP as SpeedStep, 1)).toBe(MAX_SPEED_STEP);
    });
  });

  describe('speedLabel', () => {
    it('labels every step', () => {
      expect(speedLabel(0)).toBe('Slow');
      expect(speedLabel(1)).toBe('Steady');
      expect(speedLabel(2)).toBe('Brisk');
    });
  });

  describe('speedScrollRate', () => {
    it('never freezes, and increases monotonically with speed', () => {
      const r0 = speedScrollRate(0);
      const r1 = speedScrollRate(1);
      const r2 = speedScrollRate(2);
      expect(r0).toBeGreaterThan(0);
      expect(r1).toBeGreaterThan(r0);
      expect(r2).toBeGreaterThan(r1);
    });
  });
});
