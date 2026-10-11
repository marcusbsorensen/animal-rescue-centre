import { describe, it, expect } from 'vitest';
import { shortestPath, type RoadGraph } from '../road-router';
import {
  atDistance, nodeToWorld, roadClassAt, routeBetween, routePathFromNodes, METRES_PER_UNIT, MAP_ASPECT,
} from '../route-path';
import { adj, anchorRoutes, graph } from './real-graph';

// A route is metres along a polyline, built from road-router.ts's own node
// path, so the drive and the GPS can never disagree about which road it is.

// An L: 0.1 map-height east, then 0.1 south. East leg 0.1*aspect*3900 m.
const L: RoadGraph = {
  nodes: [[0, 0], [0.1, 0], [0.1, 0.1]],
  edges: [[0, 1, 'residential'], [1, 2, 'trunk']],
};
const EAST = 0.1 * MAP_ASPECT * METRES_PER_UNIT;
const SOUTH = 0.1 * METRES_PER_UNIT;

describe('route-path on a known shape', () => {
  const r = routePathFromNodes(L, [0, 1, 2]);

  it('measures cumulative distance in metres', () => {
    expect(r.points.map((p) => p.s)).toEqual([0, EAST, EAST + SOUTH]);
    expect(r.length).toBeCloseTo(EAST + SOUTH, 9);
  });

  it('places and points the van along each segment', () => {
    const mid = atDistance(r, EAST / 2);
    expect(mid.x).toBeCloseTo(EAST / 2, 9);
    expect(mid.y).toBe(0);
    expect(mid.heading).toBe(0);
    expect(atDistance(r, EAST + 10).heading).toBeCloseTo(Math.PI / 2, 12);
  });

  it('gives a vertex to the segment arriving at it, and clamps past the ends', () => {
    expect(atDistance(r, EAST).heading).toBe(0);
    expect(atDistance(r, -50)).toEqual({ x: 0, y: 0, heading: 0 });
    const end = atDistance(r, r.length + 50);
    expect(end.x).toBeCloseTo(EAST, 9);
    expect(end.y).toBeCloseTo(SOUTH, 9);
  });

  it('knows the road class from the edges it uses, either way round', () => {
    expect(roadClassAt(r, 1)).toBe('residential');
    expect(roadClassAt(r, EAST + 1)).toBe('trunk');
    const back = routePathFromNodes(L, [2, 1, 0]);
    expect(roadClassAt(back, 1)).toBe('trunk');
    expect(roadClassAt(back, back.length - 1)).toBe('residential');
  });

  it('refuses a route of one node', () => {
    expect(() => routePathFromNodes(L, [0])).toThrow();
  });
});

describe('route-path on the real Birchie graph', () => {
  const routes = anchorRoutes();

  it('builds a route between every pair of named places', () => {
    expect(routes.length).toBe(15 * 14);
  });

  it("follows road-router.ts's node path, node for node", () => {
    const arc = graph.anchors.arc, vet = graph.anchors.vet;
    const r = routeBetween(graph, adj, arc, vet)!;
    expect(r.nodes).toEqual(shortestPath(adj, arc, vet));
    r.nodes.forEach((n, i) => {
      const w = nodeToWorld(graph.nodes[n][0], graph.nodes[n][1]);
      expect(r.points[i].x).toBe(w.x);
      expect(r.points[i].y).toBe(w.y);
    });
  });

  it('is continuous: every metre along every route is within a metre of the last', () => {
    let worst = 0;
    for (const { route } of routes) {
      let prev = atDistance(route, 0);
      for (let s = 1; s <= route.length; s += 1) {
        const here = atDistance(route, s);
        worst = Math.max(worst, Math.hypot(here.x - prev.x, here.y - prev.y));
        prev = here;
      }
    }
    expect(worst).toBeLessThanOrEqual(1 + 1e-6);
  });

  it('only ever reports a class the graph has', () => {
    const classes = new Set(graph.edges.map((e) => e[2]));
    for (const { route } of routes) for (const p of route.points) expect(classes.has(p.cls)).toBe(true);
  });

  it('returns null for two nodes that are the same', () => {
    expect(routeBetween(graph, adj, graph.anchors.arc, graph.anchors.arc)).toBeNull();
  });
});
