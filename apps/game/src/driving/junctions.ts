/**
 * junctions.ts
 *
 * Pure junction detection for real turning (see
 * docs/plan-turning-junctions-2026-07-12.md). No Phaser — unit-tested.
 *
 * Sibling to road-transition.ts: where that maps road-class boundaries to
 * world-space merge zones, this maps route JUNCTIONS to world-space decision
 * points. The crucial distinction it draws — and the reason turning can't just
 * reuse the GPS manoeuvre list — is between:
 *   • a genuine FORK (a graph node where more than two real roads meet): the
 *     player must choose, and a wrong choice is possible → `isChoice: true`.
 *   • a cosmetic BEND (a degree-2 node where the through-road just changes
 *     heading): there's no alternative, so it stays a fully-automatic sweep,
 *     exactly like today → `isChoice: false`.
 *
 * World-Y for each junction is derived with road-transition.ts's shared
 * `worldYForProgress`, so the on-road view and the GPS read the same clock.
 */
import { nearestNode, shortestPath, type RoadGraph, type Adjacency, type RoutePoint } from './road-router';
import { turnAt, type TurnDir } from './route-instructions';
import { worldYForProgress } from './road-transition';

// Aspect-correct x the same way route-instructions does, so lengths/fractions
// here match the GPS's progress basis exactly.
const ASPECT = 1800 / 1121;

/**
 * Road classes that don't count as a "real" alternative at a fork — driveways,
 * farm tracks, footpaths. A degree-3 node whose third edge is one of these is
 * still just a through-road for our purposes (we don't pester the player to
 * "choose" a dead-end track). Tunable once eyeballed against live routes.
 */
export const MINOR_CLASSES = new Set(['track', 'service', 'path', 'footway', 'cycleway', 'steps', 'driveway']);

export interface RouteJunction {
  /** Graph node index this junction sits on. */
  nodeIndex: number;
  /** Fraction along the route (0..1), aspect-corrected length — same basis as
   *  the GPS manoeuvres. */
  atProgress: number;
  /** World-space Y where the junction sits (for the on-road mouth + window). */
  worldY: number;
  /** The route's own turn through the node, or null if it passes straight. */
  turn: TurnDir | null;
  /** Real-road edges meeting here (minor stubs excluded). */
  realDegree: number;
  /** A genuine fork the player must steer (realDegree > 2), vs a cosmetic bend. */
  isChoice: boolean;
}

/** Build the incident real-road degree of every node from the edge list. */
function realDegrees(g: RoadGraph): number[] {
  const deg = new Array(g.nodes.length).fill(0);
  for (const [a, b, cls] of g.edges) {
    if (a < 0 || b < 0 || a >= g.nodes.length || b >= g.nodes.length) continue;
    if (MINOR_CLASSES.has(cls)) continue;
    deg[a]++; deg[b]++;
  }
  return deg;
}

function pt(g: RoadGraph, i: number): RoutePoint {
  return { fx: g.nodes[i][0], fy: g.nodes[i][1] };
}

/**
 * Detect the junctions a route passes through. Returns one entry per interior
 * node that is either a genuine fork OR a real bend (straight-through non-forks
 * produce nothing). Empty if the route can't be built.
 */
export function buildRouteJunctions(g: RoadGraph, adj: Adjacency, from: RoutePoint, to: RoutePoint): RouteJunction[] {
  if (g.nodes.length === 0) return [];
  const s = nearestNode(g, from.fx, from.fy);
  const t = nearestNode(g, to.fx, to.fy);
  const path = shortestPath(adj, s, t);
  if (!path || path.length === 0) return [];

  // The GPS polyline is [from, ...pathNodes, to]; interior vertex k (1..len-2)
  // is exactly pathNodes[k-1], so a junction's graph identity is unambiguous.
  const poly: RoutePoint[] = [from, ...path.map((i) => pt(g, i)), to];
  const deg = realDegrees(g);

  // Aspect-corrected cumulative length for progress fractions (matches the GPS).
  const ap = (p: RoutePoint): [number, number] => [p.fx * ASPECT, p.fy];
  const cum = [0];
  for (let i = 1; i < poly.length; i++) {
    const [ax, ay] = ap(poly[i - 1]), [bx, by] = ap(poly[i]);
    cum.push(cum[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  const total = cum[cum.length - 1] || 1;

  const out: RouteJunction[] = [];
  for (let k = 1; k < poly.length - 1; k++) {
    const nodeIndex = path[k - 1];
    const turn = turnAt(poly[k - 1], poly[k], poly[k + 1]);
    const realDegree = deg[nodeIndex];
    const isChoice = realDegree > 2;
    if (!isChoice && turn === null) continue; // straight through a non-fork — nothing to do
    const atProgress = cum[k] / total;
    out.push({ nodeIndex, atProgress, worldY: worldYForProgress(atProgress), turn, realDegree, isChoice });
  }
  return out;
}

/** The next junction at or after `progress` (any kind). */
export function nextJunction(junctions: RouteJunction[], progress: number): RouteJunction | undefined {
  return junctions.find((j) => j.atProgress >= progress - 1e-6);
}

/** The next junction the player must actively steer (a real fork). */
export function nextChoiceJunction(junctions: RouteJunction[], progress: number): RouteJunction | undefined {
  return junctions.find((j) => j.isChoice && j.atProgress >= progress - 1e-6);
}

/**
 * The world-Y window around a junction in which a tap counts as "for" this
 * junction — generous by design (no split-second reflex test for an 8-year-old).
 * `half` is the half-width in world-px each side of the junction's world-Y.
 */
export function decisionWindow(j: RouteJunction, half = 220): { top: number; bottom: number } {
  return { top: j.worldY - half, bottom: j.worldY + half };
}

/** Whether `worldY` (e.g. the van's world position) is inside a junction's
 *  decision window. */
export function inDecisionWindow(j: RouteJunction, worldY: number, half = 220): boolean {
  return worldY >= j.worldY - half && worldY <= j.worldY + half;
}
