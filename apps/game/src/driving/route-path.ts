/**
 * route-path.ts
 *
 * A route as the rotating-world drive sees it: a polyline in world metres with
 * the distance along it at every point, so the van's progress is a number of
 * metres rather than a fraction, and its position and heading at any distance
 * are a lookup. Ported from drive-spike.html's toPolyline / atDistance /
 * classAtS.
 *
 * The node path comes from road-router.ts's own Dijkstra, so the GPS and the
 * drive agree on the road. That router gently prefers bigger roads, where the
 * spike's private Dijkstra used plain length; on the same two nodes the two
 * can pick different roads, and the router's is the one the child's map shows.
 *
 * The road class comes from the edges the route actually uses, not from a
 * nearest-edge search, which can flicker between two roads at a junction.
 * No Phaser — unit-tested against the real Birchie graph.
 */
import { shortestPath, type Adjacency, type RoadGraph } from './road-router';

/** The map is 1800x1121 over roughly 6.2km x 3.9km. One unit of fy is this
 *  many metres, and fx is scaled by the aspect to match, the same convention
 *  as road-router.ts so a route computed there lands here unchanged. */
export const MAP_ASPECT = 1800 / 1121;
export const METRES_PER_UNIT = 3900;

/** What an edge with no known class is treated as, as in the spike. */
export const DEFAULT_ROAD_CLASS = 'tertiary';

export interface RouteVertex {
  x: number;
  y: number;
  /** Distance along the route to this vertex, metres. */
  s: number;
  /** Class of the segment that ENDS at this vertex; vertex 0 copies vertex 1. */
  cls: string;
}

export interface RoutePath {
  /** Graph node indices, in driving order. */
  nodes: number[];
  points: RouteVertex[];
  /** Total length, metres. */
  length: number;
}

export interface RoutePose {
  x: number;
  y: number;
  /** Radians, world frame: 0 along +x, PI/2 along +y (down the map). */
  heading: number;
}

/** A graph node (map fractions) in world metres. */
export function nodeToWorld(fx: number, fy: number): { x: number; y: number } {
  return { x: fx * MAP_ASPECT * METRES_PER_UNIT, y: fy * METRES_PER_UNIT };
}

/** OSM class of the edge between two nodes, either way round. */
export function edgeClassLookup(g: RoadGraph): (a: number, b: number) => string | undefined {
  const m = new Map<number, string>();
  const n = g.nodes.length;
  for (const [a, b, cls] of g.edges) {
    if (a < 0 || b < 0 || a >= n || b >= n) continue;
    m.set(a * n + b, cls);
    m.set(b * n + a, cls);
  }
  return (a, b) => m.get(a * n + b);
}

/** A node path to a world-space polyline with cumulative distance. */
export function routePathFromNodes(
  g: RoadGraph,
  nodes: number[],
  classOf: (a: number, b: number) => string | undefined = edgeClassLookup(g),
): RoutePath {
  if (nodes.length < 2) throw new Error('a route needs at least two nodes');
  const points: RouteVertex[] = nodes.map((i) => ({ ...nodeToWorld(g.nodes[i][0], g.nodes[i][1]), s: 0, cls: DEFAULT_ROAD_CLASS }));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    b.s = a.s + Math.hypot(b.x - a.x, b.y - a.y);
    b.cls = classOf(nodes[i - 1], nodes[i]) ?? DEFAULT_ROAD_CLASS;
  }
  points[0].cls = points[1].cls;
  return { nodes: nodes.slice(), points, length: points[points.length - 1].s };
}

/** The route between two graph nodes, by road-router.ts's pathfinding, or null
 *  when they are not joined by road (or are the same node). */
export function routeBetween(g: RoadGraph, adj: Adjacency, from: number, to: number): RoutePath | null {
  const nodes = shortestPath(adj, from, to);
  if (!nodes || nodes.length < 2) return null;
  return routePathFromNodes(g, nodes);
}

/** Index i of the segment (points[i-1] -> points[i]) that s falls on. A
 *  distance exactly at a vertex belongs to the segment arriving there, as in
 *  the spike. Binary search: a long route has a few hundred vertices and this
 *  runs several times a frame. */
function segmentAt(p: RouteVertex[], s: number): number {
  let lo = 1, hi = p.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (p[mid].s < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Position and heading at distance s along the route, clamped to its ends.
 *  The heading is the segment's own, so it snaps at every vertex: that snap is
 *  what world-camera.ts exists to hide. */
export function atDistance(route: RoutePath, s: number): RoutePose {
  const p = route.points;
  const c = Math.max(0, Math.min(route.length, s));
  const i = segmentAt(p, c);
  const a = p[i - 1], b = p[i];
  const t = (c - a.s) / Math.max(1e-6, b.s - a.s);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    heading: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

/** The OSM road class at distance s: the class of the segment s falls on. */
export function roadClassAt(route: RoutePath, s: number): string {
  const c = Math.max(0, Math.min(route.length, s));
  return route.points[segmentAt(route.points, c)].cls;
}
