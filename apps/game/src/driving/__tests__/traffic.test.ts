import { describe, it, expect } from 'vitest';
import {
  TRAFFIC_PROFILES,
  pickTrafficKind,
  pickFrom,
  isBusSeason,
  overtakesPlayer,
  type TrafficKind,
} from '../traffic';

describe('road-gated specials', () => {
  it('pickTrafficKind never returns a special (bus/binlorry/skiptruck)', () => {
    const specials = new Set(['bus', 'binlorry', 'skiptruck']);
    for (let i = 0; i <= 100; i++) {
      expect(specials.has(pickTrafficKind(i / 100))).toBe(false);
    }
  });

  it('pickFrom only returns kinds from its pool', () => {
    const pool: TrafficKind[] = ['tractor', 'binlorry', 'skiptruck'];
    for (let i = 0; i <= 50; i++) {
      expect(pool).toContain(pickFrom(pool, i / 50));
    }
    expect(pickFrom([], 0.5)).toBe('car'); // empty pool falls back
  });

  it('isBusSeason is spring/summer only (Mar–Aug)', () => {
    expect([3, 4, 5, 6, 7, 8].every(isBusSeason)).toBe(true);
    expect([1, 2, 9, 10, 11, 12].some(isBusSeason)).toBe(false);
  });
});

describe('traffic', () => {
  describe('TRAFFIC_PROFILES', () => {
    it('defines every kind with sane fields', () => {
      for (const kind of Object.keys(TRAFFIC_PROFILES) as TrafficKind[]) {
        const p = TRAFFIC_PROFILES[kind];
        expect(p.kind).toBe(kind);
        expect(p.relSpeed).toBeGreaterThan(0);
        expect(p.widthFactor).toBeGreaterThan(0);
        expect(p.lengthFactor).toBeGreaterThan(0);
        expect(p.weight).toBeGreaterThan(0);
      }
    });

    it('tractors are the slowest, emergency the fastest', () => {
      const speeds = Object.values(TRAFFIC_PROFILES).map((p) => p.relSpeed);
      expect(TRAFFIC_PROFILES.tractor.relSpeed).toBe(Math.min(...speeds));
      expect(TRAFFIC_PROFILES.emergency.relSpeed).toBe(Math.max(...speeds));
    });

    it('only the motorbike weaves between lanes', () => {
      for (const kind of Object.keys(TRAFFIC_PROFILES) as TrafficKind[]) {
        expect(TRAFFIC_PROFILES[kind].zigzag).toBe(kind === 'motorbike');
      }
    });
  });

  describe('pickTrafficKind', () => {
    it('returns a valid kind across the whole 0..1 range', () => {
      for (let r = 0; r < 1; r += 0.017) {
        expect(TRAFFIC_PROFILES).toHaveProperty(pickTrafficKind(r));
      }
    });

    it('is deterministic for a given input', () => {
      expect(pickTrafficKind(0.5)).toBe(pickTrafficKind(0.5));
    });

    it('clamps out-of-range inputs instead of throwing', () => {
      expect(TRAFFIC_PROFILES).toHaveProperty(pickTrafficKind(-1));
      expect(TRAFFIC_PROFILES).toHaveProperty(pickTrafficKind(2));
    });

    it('favours common kinds — cars appear far more often than emergencies', () => {
      const counts: Record<string, number> = {};
      const N = 2000;
      for (let i = 0; i < N; i++) {
        const k = pickTrafficKind(i / N);
        counts[k] = (counts[k] ?? 0) + 1;
      }
      expect(counts.car).toBeGreaterThan(counts.emergency);
    });
  });

  describe('overtakesPlayer', () => {
    it('is true only for faster-than-player kinds', () => {
      expect(overtakesPlayer('emergency')).toBe(true);
      expect(overtakesPlayer('motorbike')).toBe(true);
      expect(overtakesPlayer('car')).toBe(false);
      expect(overtakesPlayer('tractor')).toBe(false);
    });
  });
});
