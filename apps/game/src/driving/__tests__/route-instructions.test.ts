import { describe, it, expect } from 'vitest';
import {
  buildManeuvers,
  simplifyRoute,
  nextManeuver,
  maneuverText,
  type RoutePoint,
} from '../route-instructions';

const P = (fx: number, fy: number): RoutePoint => ({ fx, fy });

describe('route-instructions', () => {
  describe('simplifyRoute', () => {
    it('collapses a jittery-but-straight run to its endpoints', () => {
      const route = [P(0.1, 0.5), P(0.2, 0.5), P(0.3, 0.5), P(0.4, 0.5), P(0.5, 0.5)];
      expect(simplifyRoute(route)).toEqual([P(0.1, 0.5), P(0.5, 0.5)]);
    });
    it('keeps a genuine corner', () => {
      const route = [P(0.1, 0.5), P(0.3, 0.5), P(0.5, 0.5), P(0.5, 0.7), P(0.5, 0.9)];
      const s = simplifyRoute(route);
      expect(s).toContainEqual(P(0.5, 0.5)); // the corner is kept
      expect(s.length).toBeLessThan(route.length);
    });
  });

  describe('buildManeuvers', () => {
    it('a straight route is just depart + arrive', () => {
      const m = buildManeuvers([P(0.1, 0.5), P(0.5, 0.5), P(0.9, 0.5)]);
      expect(m.map((x) => x.kind)).toEqual(['depart', 'arrive']);
    });

    it('east then south (screen-down) is a right turn', () => {
      // heading east, then turning to head down the screen = turn right
      const m = buildManeuvers([P(0.2, 0.5), P(0.5, 0.5), P(0.5, 0.8)]);
      const turns = m.filter((x) => x.kind === 'turn');
      expect(turns).toHaveLength(1);
      expect(turns[0].turn).toBe('right');
      expect(turns[0].atProgress).toBeGreaterThan(0);
      expect(turns[0].atProgress).toBeLessThan(1);
    });

    it('east then north (screen-up) is a left turn', () => {
      const m = buildManeuvers([P(0.2, 0.5), P(0.5, 0.5), P(0.5, 0.2)]);
      const turns = m.filter((x) => x.kind === 'turn');
      expect(turns).toHaveLength(1);
      expect(turns[0].turn).toBe('left');
    });

    it('distinguishes a bear (slight) from a full turn', () => {
      // a ~20-30° deviation should be "slight", a 90° a full turn
      const slight = buildManeuvers([P(0.2, 0.5), P(0.5, 0.5), P(0.8, 0.58)]);
      const t = slight.filter((x) => x.kind === 'turn');
      // small deflection: either nothing or a slight turn, never a full 'right'
      for (const x of t) expect(x.turn).toMatch(/slight/);
    });

    it('always starts with depart and ends with arrive', () => {
      const m = buildManeuvers([P(0.1, 0.1), P(0.5, 0.5), P(0.9, 0.2), P(0.9, 0.9)]);
      expect(m[0].kind).toBe('depart');
      expect(m[m.length - 1].kind).toBe('arrive');
      expect(m[m.length - 1].atProgress).toBe(1);
    });

    it('handles a degenerate 1-point route', () => {
      expect(buildManeuvers([P(0.5, 0.5)]).map((x) => x.kind)).toEqual(['depart', 'arrive']);
    });
  });

  describe('nextManeuver', () => {
    const m = buildManeuvers([P(0.2, 0.5), P(0.5, 0.5), P(0.5, 0.8), P(0.8, 0.8)]);
    it('returns the upcoming turn, skipping depart', () => {
      const n = nextManeuver(m, 0);
      expect(n?.kind).toBe('turn');
    });
    it('returns arrive once all turns are behind us', () => {
      expect(nextManeuver(m, 0.999)?.kind).toBe('arrive');
    });
  });

  describe('maneuverText', () => {
    it('is kid-friendly', () => {
      expect(maneuverText({ kind: 'depart', atProgress: 0 })).toBe('Off we go!');
      expect(maneuverText({ kind: 'arrive', atProgress: 1 })).toBe("You're here!");
      expect(maneuverText({ kind: 'turn', turn: 'left', atProgress: 0.5 })).toBe('Turn left');
      expect(maneuverText({ kind: 'turn', turn: 'slight-right', atProgress: 0.5 })).toBe('Bear right');
    });
  });
});
