/**
 * route-instructions.ts
 *
 * Pure turn-by-turn logic for the GPS. Given a route polyline (fractional map
 * coords from road-router), simplify away the sampling jitter, then classify
 * the major heading changes into kid-friendly manoeuvres ("Turn left",
 * "Bear right", "You've arrived!"). No Phaser — unit-tested.
 */
import type { RoutePoint } from './road-router';
export type { RoutePoint } from './road-router';

// The map is wider than tall; scale x so angles/distances are geographically
// real rather than skewed by the viewBox aspect.
const ASPECT = 1800 / 1121;

export type TurnDir =
  | 'slight-left' | 'left' | 'sharp-left'
  | 'slight-right' | 'right' | 'sharp-right';
export type ManeuverKind = 'depart' | 'turn' | 'arrive';

export interface Maneuver {
  kind: ManeuverKind;
  /** Present when kind === 'turn'. */
  turn?: TurnDir;
  /** Fraction along the route (0..1) where the manoeuvre happens. */
  atProgress: number;
}

/** Turns gentler than this (degrees) are "straight on" and not announced. */
const TURN_MIN_DEG = 22;

function aspectPt(p: RoutePoint): [number, number] {
  return [p.fx * ASPECT, p.fy];
}

/**
 * Ramer–Douglas–Peucker simplification, so the many small sampled segments of
 * a routed polyline collapse to the handful of real corners. `epsilon` is in
 * aspect-corrected fractional units.
 */
export function simplifyRoute(route: RoutePoint[], epsilon = 0.012): RoutePoint[] {
  if (route.length <= 2) return route.slice();
  const pts = route.map(aspectPt);

  const keep = new Array(route.length).fill(false);
  keep[0] = true;
  keep[route.length - 1] = true;

  const stack: [number, number][] = [[0, route.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      // Perpendicular distance from point i to segment a→b.
      const d = Math.abs((px - ax) * dy - (py - ay) * dx) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > epsilon && idx > 0) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  return route.filter((_, i) => keep[i]);
}

/** Classify a signed turn angle (degrees) into a direction, or null if straight. */
function classify(angleDeg: number, cross: number): TurnDir | null {
  const mag = Math.abs(angleDeg);
  if (mag < TURN_MIN_DEG) return null;
  const right = cross > 0; // screen y is down: in×out > 0 means turning right
  const sev = mag < 45 ? 'slight-' : mag > 115 ? 'sharp-' : '';
  return (sev + (right ? 'right' : 'left')) as TurnDir;
}

/**
 * Build the manoeuvre list for a route: depart, the significant turns (with the
 * progress fraction where each happens), and arrive.
 */
export function buildManeuvers(route: RoutePoint[]): Maneuver[] {
  if (route.length < 2) return [{ kind: 'depart', atProgress: 0 }, { kind: 'arrive', atProgress: 1 }];

  const simp = simplifyRoute(route);
  const pts = simp.map(aspectPt);

  // Cumulative aspect-corrected length for progress fractions.
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[cum.length - 1] || 1;

  const out: Maneuver[] = [{ kind: 'depart', atProgress: 0 }];
  for (let i = 1; i < pts.length - 1; i++) {
    const inx = pts[i][0] - pts[i - 1][0], iny = pts[i][1] - pts[i - 1][1];
    const outx = pts[i + 1][0] - pts[i][0], outy = pts[i + 1][1] - pts[i][1];
    const inLen = Math.hypot(inx, iny), outLen = Math.hypot(outx, outy);
    if (inLen < 1e-6 || outLen < 1e-6) continue;
    const dot = (inx * outx + iny * outy) / (inLen * outLen);
    const cross = inx * outy - iny * outx;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    const turn = classify(angle, cross);
    if (turn) out.push({ kind: 'turn', turn, atProgress: cum[i] / total });
  }
  out.push({ kind: 'arrive', atProgress: 1 });
  return out;
}

/** The next manoeuvre at or after `progress` (a turn or the arrival). */
export function nextManeuver(maneuvers: Maneuver[], progress: number): Maneuver | undefined {
  return maneuvers.find((m) => m.kind !== 'depart' && m.atProgress >= progress - 1e-6);
}

/**
 * Project a target map point onto the route: the progress fraction (0..1) of
 * the nearest point on the polyline, and the distance to it (aspect-corrected
 * fractional units). Used to place fixed-location props (speed cameras) at the
 * point where the route passes them, and to decide if the route passes near
 * enough to show them at all.
 */
export function projectToRoute(route: RoutePoint[], fx: number, fy: number): { atProgress: number; dist: number } {
  if (route.length === 0) return { atProgress: 0, dist: Infinity };
  if (route.length === 1) {
    return { atProgress: 0, dist: Math.hypot((route[0].fx - fx) * ASPECT, route[0].fy - fy) };
  }
  const pts = route.map(aspectPt);
  const tx = fx * ASPECT, ty = fy;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[cum.length - 1] || 1;

  let bestDist = Infinity, bestLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay;
    const segLen2 = dx * dx + dy * dy || 1;
    let t = ((tx - ax) * dx + (ty - ay) * dy) / segLen2;
    t = Math.max(0, Math.min(1, t));
    const projx = ax + dx * t, projy = ay + dy * t;
    const d = Math.hypot(tx - projx, ty - projy);
    if (d < bestDist) {
      bestDist = d;
      bestLen = cum[i - 1] + Math.hypot(dx, dy) * t;
    }
  }
  return { atProgress: bestLen / total, dist: bestDist };
}

/** Kid-friendly text for a manoeuvre. */
export function maneuverText(m: Maneuver): string {
  if (m.kind === 'depart') return 'Off we go!';
  if (m.kind === 'arrive') return "You're here!";
  switch (m.turn) {
    case 'slight-left': return 'Bear left';
    case 'left': return 'Turn left';
    case 'sharp-left': return 'Sharp left!';
    case 'slight-right': return 'Bear right';
    case 'right': return 'Turn right';
    case 'sharp-right': return 'Sharp right!';
    default: return 'Keep going';
  }
}

/** A short arrow glyph for a manoeuvre (for the GPS banner). */
export function maneuverArrow(m: Maneuver): string {
  if (m.kind === 'arrive') return '★';
  if (m.kind === 'depart') return '▲';
  return m.turn?.includes('left') ? '◀' : '▶';
}
