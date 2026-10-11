/**
 * road-router.ts
 *
 * Pure router over the Birchie road graph (birchie-graph.json, written offline
 * by tools/simplify-road-graph.py, which also writes the road layer of
 * birchie-roads.svg from the same graph, so the roads a child sees are the
 * roads the van can drive).
 * Nodes are map fractions [fx, fy]; edges carry a road class. Dijkstra finds a
 * road-following route between two map points, gently preferring bigger roads
 * (like real sat-nav). Falls back to a straight line if the points can't be
 * connected on the network, so the GPS never draws nothing.
 *
 * Routing can be vehicle-aware: an adjacency built for a vehicle leaves out the
 * roads that vehicle must not use (Trikey, the pedal trike, never rides the
 * A28). Built with no vehicle, every road is in, as it always was, the A28
 * two-way whatever OSM's oneway says (trunk-carriageways.ts). Trikey's whole
 * network, her paths and the two crossings she may use, is trikey-links.ts.
 */
import type { VehicleType } from '@arc/game-logic';
import type { Carriageway, TrunkCarriageways } from './trunk-carriageways';

export interface RoadGraph {
  nodes: [number, number][];
  edges: [number, number, string][];
}

export interface RoutePoint {
  fx: number;
  fy: number;
}

export type Adjacency = { to: number; w: number }[][];

// The map is wider than tall (1800x1121); scale fx so distances are real.
const ASPECT = 1800 / 1121;
const CLASS_MULT: Record<string, number> = { trunk: 0.6, secondary: 0.75, tertiary: 0.85, track: 2.2 };

function segLen(a: [number, number], b: [number, number]): number {
  return Math.hypot((a[0] - b[0]) * ASPECT, a[1] - b[1]);
}

/** The routing weight of an edge: its length, scaled by how much the router
 *  prefers its class. In map units, as segLen. */
export function roadWeight(g: RoadGraph, a: number, b: number, cls: string): number {
  return segLen(g.nodes[a], g.nodes[b]) * (CLASS_MULT[cls] ?? 1);
}

/**
 * Road classes a vehicle never routes over. Trikey never rides along the A28
 * (OSM `trunk`), whatever stretch of it: rule 18A, port plan 2026-10-11,
 * section 5, answer 10. Where she may cross it is trikey-links.ts.
 */
export const ROADS_BARRED: Partial<Record<VehicleType, readonly string[]>> = {
  'pedal-trike': ['trunk'],
};

/** Whether a vehicle may drive a road of this class. No vehicle: every road. */
export function roadAllowedFor(vehicle: VehicleType | undefined, roadClass: string): boolean {
  if (!vehicle) return true;
  return !(ROADS_BARRED[vehicle]?.includes(roadClass) ?? false);
}

/**
 * Build a weighted adjacency list once per graph (and per vehicle, when one is
 * given: roads it may not use are left out, so every route over this adjacency
 * avoids them, and a place reachable only by such a road is unreachable).
 */
export function buildAdjacency(g: RoadGraph, vehicle?: VehicleType): Adjacency {
  const adj: Adjacency = g.nodes.map(() => []);
  for (const [a, b, cls] of g.edges) {
    if (a < 0 || b < 0 || a >= g.nodes.length || b >= g.nodes.length) continue;
    if (!roadAllowedFor(vehicle, cls)) continue;
    const w = roadWeight(g, a, b, cls);
    adj[a].push({ to: b, w });
    adj[b].push({ to: a, w });
  }
  return adj;
}

/** Index of the graph node closest to a map point. */
export function nearestNode(g: RoadGraph, fx: number, fy: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < g.nodes.length; i++) {
    const [x, y] = g.nodes[i];
    const d = Math.hypot((x - fx) * ASPECT, y - fy);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Minimal binary min-heap of [priority, node].
class MinHeap {
  private a: [number, number][] = [];
  get size(): number { return this.a.length; }
  push(p: number, n: number): void {
    const a = this.a; a.push([p, n]);
    let i = a.length - 1;
    while (i > 0) { const par = (i - 1) >> 1; if (a[par][0] <= a[i][0]) break; [a[par], a[i]] = [a[i], a[par]]; i = par; }
  }
  pop(): [number, number] | undefined {
    const a = this.a; if (a.length === 0) return undefined;
    const top = a[0]; const last = a.pop()!;
    if (a.length) { a[0] = last; let i = 0; const n = a.length; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < n && a[l][0] < a[s][0]) s = l; if (r < n && a[r][0] < a[s][0]) s = r; if (s === i) break; [a[s], a[i]] = [a[i], a[s]]; i = s; } }
    return top;
  }
}

/** Dijkstra node path from s to t, or null if unreachable. */
export function shortestPath(adj: Adjacency, s: number, t: number): number[] | null {
  const n = adj.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  dist[s] = 0;
  const pq = new MinHeap(); pq.push(0, s);
  while (pq.size) {
    const [d, u] = pq.pop()!;
    if (u === t) break;
    if (d > dist[u]) continue;
    for (const { to, w } of adj[u]) {
      const nd = d + w;
      if (nd < dist[to]) { dist[to] = nd; prev[to] = u; pq.push(nd, to); }
    }
  }
  if (dist[t] === Infinity) return null;
  const path: number[] = [];
  for (let u = t; u !== -1; u = prev[u]) path.push(u);
  return path.reverse();
}

export interface RoadClassRun {
  roadClass: string;
  /** Progress fraction (0..1) at which this run of road ends. */
  untilProgress: number;
  /** On a trunk run, what the A28 really is there, when the profile was built
   *  with the carriageway data. */
  carriageway?: Carriageway;
}

/** Shortest run, as a progress fraction, the profile keeps; see smoothRuns. */
const PROFILE_MIN_SPAN = 0.08;

/** Runs are the same road when class, and on the A28 kind and limit, agree. */
function sameRoad(a: RoadClassRun, b: RoadClassRun): boolean {
  return a.roadClass === b.roadClass
    && a.carriageway?.kind === b.carriageway?.kind
    && a.carriageway?.maxspeedMph === b.carriageway?.maxspeedMph;
}

/**
 * The road-class profile along a route: consecutive runs of the same OSM road
 * class (trunk / residential / track …), each ending at a progress fraction.
 * Lets the drive switch road *type* where the map changes (e.g. joining the
 * A-road becomes a dual carriageway). Progress is by aspect-corrected length,
 * matching the drive's own progress.
 *
 * Given the carriageway data, trunk runs also split where the A28 changes
 * kind or limit, so a speed verdict can tell the dual carriageway from the
 * road through The Square.
 */
export function routeProfile(
  g: RoadGraph, adj: Adjacency, from: RoutePoint, to: RoutePoint, carriageways?: TrunkCarriageways,
): RoadClassRun[] {
  if (g.nodes.length === 0) return [];
  const s = nearestNode(g, from.fx, from.fy);
  const t = nearestNode(g, to.fx, to.fy);
  const path = shortestPath(adj, s, t);
  if (!path || path.length < 2) return [];

  const ec = new Map<string, string>();
  for (const [a, b, cls] of g.edges) ec.set(a < b ? `${a}-${b}` : `${b}-${a}`, cls);
  const classOf = (a: number, b: number) => ec.get(a < b ? `${a}-${b}` : `${b}-${a}`) ?? 'unclassified';

  const pts: RoutePoint[] = [from, ...path.map((i) => ({ fx: g.nodes[i][0], fy: g.nodes[i][1] })), to];
  // Class per segment of `pts` (path.length+1 segments). The two stub segments
  // (from→firstNode, lastNode→to) inherit the adjacent edge's class.
  const segEdge: [number, number][] = [[path[0], path[1]]];
  for (let i = 0; i < path.length - 1; i++) segEdge.push([path[i], path[i + 1]]);
  segEdge.push([path[path.length - 2], path[path.length - 1]]);
  const segClass = segEdge.map(([a, b]) => classOf(a, b));

  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) lens.push(segLen([pts[i - 1].fx, pts[i - 1].fy], [pts[i].fx, pts[i].fy]));
  const total = lens.reduce((a, b) => a + b, 0) || 1;

  const ends: number[] = [];
  let cum = 0;
  for (const l of lens) { cum += l; ends.push(cum / total); }

  const runs: RoadClassRun[] = [];
  for (let i = 0; i < segClass.length; i++) {
    if (runs.length && runs[runs.length - 1].roadClass === segClass[i]) runs[runs.length - 1].untilProgress = ends[i];
    else runs.push({ roadClass: segClass[i], untilProgress: ends[i] });
  }
  const smoothed = smoothRuns(runs, PROFILE_MIN_SPAN);
  if (!carriageways) return smoothed;

  // Split each trunk run where the A28 changes kind or limit, after the class
  // smoothing, so the classes along the route are exactly what they were
  // without the data. Inside a run, a segment the smoothing absorbed (not
  // trunk itself) takes the carriageway before it, or the first one after.
  const segCarriageway = segEdge.map(([a, b], i) => (segClass[i] === 'trunk' ? carriageways.between(a, b) ?? undefined : undefined));
  const out: RoadClassRun[] = [];
  let seg = 0;
  for (let r = 0; r < smoothed.length; r++) {
    const run = smoothed[r];
    const start = r === 0 ? 0 : smoothed[r - 1].untilProgress;
    const inRun: number[] = [];
    for (; seg < segClass.length && ends[seg] <= run.untilProgress + 1e-9; seg++) inRun.push(seg);
    if (run.roadClass !== 'trunk') { out.push(run); continue; }
    const subs: RoadClassRun[] = [];
    let last = inRun.map((i) => segCarriageway[i]).find(Boolean);
    for (const i of inRun) {
      last = segCarriageway[i] ?? last;
      const sub: RoadClassRun = { roadClass: 'trunk', untilProgress: ends[i] - start };
      if (last) sub.carriageway = last;
      if (subs.length && sameRoad(subs[subs.length - 1], sub)) subs[subs.length - 1].untilProgress = sub.untilProgress;
      else subs.push(sub);
    }
    if (subs.length === 0) { out.push(run); continue; }
    subs[subs.length - 1].untilProgress = run.untilProgress - start;
    for (const sub of smoothRuns(subs, PROFILE_MIN_SPAN)) out.push({ ...sub, untilProgress: sub.untilProgress + start });
  }
  return out;
}

/**
 * The road class at a progress fraction along a profile: the run it falls in,
 * the last run beyond the end, and undefined for an empty profile (no graph,
 * or no route).
 */
export function roadClassAt(profile: readonly RoadClassRun[], progress: number): string | undefined {
  return roadRunAt(profile, progress)?.roadClass;
}

/** The whole run at a progress fraction, carriageway and all; as roadClassAt. */
export function roadRunAt(profile: readonly RoadClassRun[], progress: number): RoadClassRun | undefined {
  for (const run of profile) {
    if (progress <= run.untilProgress + 1e-6) return run;
  }
  return profile[profile.length - 1];
}

/**
 * Dissolve short road-class runs so the drive doesn't flip road types every few
 * seconds where a route briefly touches an A-road. Runs shorter than `minSpan`
 * (progress fraction) are absorbed into a neighbour; adjacent same-class runs
 * then coalesce. Exported for testing.
 */
export function smoothRuns(input: RoadClassRun[], minSpan: number): RoadClassRun[] {
  const runs = input.map((r) => ({ ...r }));
  const startOf = (i: number) => (i === 0 ? 0 : runs[i - 1].untilProgress);
  const coalesce = () => {
    for (let i = 1; i < runs.length; ) {
      if (sameRoad(runs[i], runs[i - 1])) { runs[i - 1].untilProgress = runs[i].untilProgress; runs.splice(i, 1); }
      else i++;
    }
  };
  let guard = 0;
  while (runs.length > 1 && guard++ < 100) {
    let si = 0, sspan = Infinity;
    for (let i = 0; i < runs.length; i++) {
      const span = runs[i].untilProgress - startOf(i);
      if (span < sspan) { sspan = span; si = i; }
    }
    if (sspan >= minSpan) break;
    if (si === 0) { runs.splice(0, 1); }
    else if (si === runs.length - 1) { runs[si - 1].untilProgress = runs[si].untilProgress; runs.splice(si, 1); }
    else {
      const prevSpan = runs[si - 1].untilProgress - startOf(si - 1);
      const nextSpan = runs[si + 1].untilProgress - runs[si].untilProgress;
      if (prevSpan >= nextSpan) runs[si - 1].untilProgress = runs[si].untilProgress;
      runs.splice(si, 1);
    }
    coalesce();
  }
  return runs;
}

/**
 * A road-following route between two map points as a polyline of map fractions.
 * The actual endpoints are included so the line reaches the pins; if the
 * network can't connect them, returns a straight [from, to].
 */
export function routePolyline(g: RoadGraph, adj: Adjacency, from: RoutePoint, to: RoutePoint): RoutePoint[] {
  if (g.nodes.length === 0) return [from, to];
  const s = nearestNode(g, from.fx, from.fy);
  const t = nearestNode(g, to.fx, to.fy);
  const path = shortestPath(adj, s, t);
  if (!path) return [from, to];
  const mid = path.map((i) => ({ fx: g.nodes[i][0], fy: g.nodes[i][1] }));
  return [from, ...mid, to];
}
