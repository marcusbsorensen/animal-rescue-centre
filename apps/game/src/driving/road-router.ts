/**
 * road-router.ts
 *
 * Pure router over the Birchie road graph (built offline by
 * tools/build-road-graph.py from birchie-roads.svg into birchie-graph.json).
 * Nodes are map fractions [fx, fy]; edges carry a road class. Dijkstra finds a
 * road-following route between two map points, gently preferring bigger roads
 * (like real sat-nav). Falls back to a straight line if the points can't be
 * connected on the network, so the GPS never draws nothing.
 */

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

/** Build a weighted adjacency list once per graph. */
export function buildAdjacency(g: RoadGraph): Adjacency {
  const adj: Adjacency = g.nodes.map(() => []);
  for (const [a, b, cls] of g.edges) {
    if (a < 0 || b < 0 || a >= g.nodes.length || b >= g.nodes.length) continue;
    const w = segLen(g.nodes[a], g.nodes[b]) * (CLASS_MULT[cls] ?? 1);
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
}

/**
 * The road-class profile along a route: consecutive runs of the same OSM road
 * class (trunk / residential / track …), each ending at a progress fraction.
 * Lets the drive switch road *type* where the map changes (e.g. joining the
 * A-road becomes a dual carriageway). Progress is by aspect-corrected length,
 * matching the drive's own progress.
 */
export function routeProfile(g: RoadGraph, adj: Adjacency, from: RoutePoint, to: RoutePoint): RoadClassRun[] {
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
  const segClass: string[] = [classOf(path[0], path[1])];
  for (let i = 0; i < path.length - 1; i++) segClass.push(classOf(path[i], path[i + 1]));
  segClass.push(classOf(path[path.length - 2], path[path.length - 1]));

  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) lens.push(segLen([pts[i - 1].fx, pts[i - 1].fy], [pts[i].fx, pts[i].fy]));
  const total = lens.reduce((a, b) => a + b, 0) || 1;

  const runs: RoadClassRun[] = [];
  let cum = 0;
  for (let i = 0; i < segClass.length; i++) {
    cum += lens[i];
    if (runs.length && runs[runs.length - 1].roadClass === segClass[i]) runs[runs.length - 1].untilProgress = cum / total;
    else runs.push({ roadClass: segClass[i], untilProgress: cum / total });
  }
  return smoothRuns(runs, 0.08);
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
      if (runs[i].roadClass === runs[i - 1].roadClass) { runs[i - 1].untilProgress = runs[i].untilProgress; runs.splice(i, 1); }
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
