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
const CLASS_MULT: Record<string, number> = { trunk: 0.6, secondary: 0.75, tertiary: 0.85 };

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
