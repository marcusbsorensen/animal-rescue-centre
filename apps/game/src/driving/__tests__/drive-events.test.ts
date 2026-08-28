import { describe, it, expect } from 'vitest';
import {
  generateRoute,
  pickNextEvent,
  resolveEvent,
  type DriveEvent,
} from '../drive-events';
import { NUM_LANES } from '../drive-state';

describe('drive-events', () => {
  describe('generateRoute', () => {
    it('is deterministic for a given seed', () => {
      expect(generateRoute(42)).toEqual(generateRoute(42));
    });

    it('produces different routes for different seeds', () => {
      const a = generateRoute(1);
      const b = generateRoute(2);
      // At least the positions or types should differ somewhere.
      expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
    });

    it('always finishes with an arrival at position 1', () => {
      for (const seed of [1, 7, 99, 12345]) {
        const route = generateRoute(seed);
        const last = route[route.length - 1];
        expect(last.type).toBe('arrival');
        expect(last.at).toBe(1);
        // Exactly one arrival.
        expect(route.filter((e) => e.type === 'arrival')).toHaveLength(1);
      }
    });

    it('places events in ascending position, within the mid-route band', () => {
      const route = generateRoute(7);
      for (let i = 1; i < route.length; i++) {
        expect(route[i].at).toBeGreaterThanOrEqual(route[i - 1].at);
      }
      for (const e of route.filter((x) => x.type !== 'arrival')) {
        expect(e.at).toBeGreaterThanOrEqual(0.15);
        expect(e.at).toBeLessThanOrEqual(0.85);
      }
    });

    it('assigns valid lanes and honours eventCount', () => {
      const route = generateRoute(3, { eventCount: 3 });
      expect(route.filter((e) => e.type !== 'arrival')).toHaveLength(3);
      for (const e of route) {
        expect(e.lane).toBeGreaterThanOrEqual(0);
        expect(e.lane).toBeLessThan(NUM_LANES);
      }
    });

    it('defaults to hedgehog-only events for MVP', () => {
      const route = generateRoute(11);
      for (const e of route.filter((x) => x.type !== 'arrival')) {
        expect(e.type).toBe('hedgehog-crossing');
      }
    });

    it('honours an allowedTypes restriction', () => {
      const route = generateRoute(11, { allowedTypes: ['traffic-light'], eventCount: 2 });
      for (const e of route.filter((x) => x.type !== 'arrival')) {
        expect(e.type).toBe('traffic-light');
      }
    });
  });

  describe('pickNextEvent', () => {
    const events: DriveEvent[] = [
      { id: 'a', type: 'hedgehog-crossing', at: 0.3, lane: 0, resolved: false },
      { id: 'b', type: 'hedgehog-crossing', at: 0.6, lane: 1, resolved: false },
      { id: 'c', type: 'arrival', at: 1, lane: 1, resolved: false },
    ];

    it('returns the earliest unresolved event ahead of progress', () => {
      expect(pickNextEvent(events, 0)?.id).toBe('a');
      expect(pickNextEvent(events, 0.4)?.id).toBe('b');
      expect(pickNextEvent(events, 0.7)?.id).toBe('c');
    });

    it('skips resolved events', () => {
      const withResolved = events.map((e) => (e.id === 'a' ? { ...e, resolved: true } : e));
      expect(pickNextEvent(withResolved, 0)?.id).toBe('b');
    });

    it('returns undefined when nothing remains ahead', () => {
      expect(pickNextEvent(events, 1.01)).toBeUndefined();
      const allResolved = events.map((e) => ({ ...e, resolved: true }));
      expect(pickNextEvent(allResolved, 0)).toBeUndefined();
    });
  });

  describe('resolveEvent', () => {
    it('rewards braking for the hedgehog with kindness + happiness, no harm', () => {
      const good = resolveEvent('hedgehog-crossing', true);
      expect(good.kindness).toBe(1);
      expect(good.happiness).toBe(1);
      expect(good.cargoComfort).toBe(0);
      expect(good.narrate).toContain('hedgehog');
    });

    it('penalises a miss with comfort only — never harms the animal', () => {
      const bad = resolveEvent('hedgehog-crossing', false);
      expect(bad.cargoComfort).toBeLessThan(0);
      expect(bad.happiness).toBe(0);
      expect(bad.kindness).toBe(0);
      // Gentle, not punishing.
      expect(bad.narrate.length).toBeGreaterThan(0);
    });

    it('treats arrival as a calm settle, not pass/fail', () => {
      expect(resolveEvent('arrival', true).cargoComfort).toBeGreaterThan(0);
      expect(resolveEvent('arrival', false).cargoComfort).toBeGreaterThan(0);
    });

    it('covers every event type', () => {
      for (const t of ['hedgehog-crossing', 'level-crossing', 'traffic-light', 'roadside-animal', 'arrival'] as const) {
        const out = resolveEvent(t, true);
        expect(out).toHaveProperty('cargoComfort');
        expect(out).toHaveProperty('narrate');
      }
    });
  });
});
