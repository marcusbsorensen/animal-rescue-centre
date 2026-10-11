import { describe, it, expect } from 'vitest';
import {
  buildAdjacency,
  nearestNode,
  shortestPath,
  routePolyline,
  roadClassAt,
  type RoadGraph,
} from '../road-router';

// A tiny graph: a chain 0-1-2-3 across the map, plus an isolated node 4.
const G: RoadGraph = {
  nodes: [[0.0, 0.5], [0.3, 0.5], [0.6, 0.5], [0.9, 0.5], [0.5, 0.9]],
  edges: [
    [0, 1, 'residential'],
    [1, 2, 'residential'],
    [2, 3, 'trunk'],
  ],
};

describe('road-router', () => {
  it('finds the nearest node to a point', () => {
    expect(nearestNode(G, 0.31, 0.52)).toBe(1);
    expect(nearestNode(G, 0.88, 0.5)).toBe(3);
    expect(nearestNode(G, 0.5, 0.88)).toBe(4);
  });

  it('routes along the chain', () => {
    const adj = buildAdjacency(G);
    expect(shortestPath(adj, 0, 3)).toEqual([0, 1, 2, 3]);
  });

  it('returns null for an unreachable node', () => {
    const adj = buildAdjacency(G);
    expect(shortestPath(adj, 0, 4)).toBeNull();
  });

  it('routePolyline includes the real endpoints and the road nodes', () => {
    const adj = buildAdjacency(G);
    const poly = routePolyline(G, adj, { fx: 0.02, fy: 0.5 }, { fx: 0.88, fy: 0.5 });
    expect(poly[0]).toEqual({ fx: 0.02, fy: 0.5 });
    expect(poly[poly.length - 1]).toEqual({ fx: 0.88, fy: 0.5 });
    // passes through the chain nodes
    expect(poly.some((p) => p.fx === 0.3)).toBe(true);
    expect(poly.some((p) => p.fx === 0.6)).toBe(true);
  });

  it('falls back to a straight line when the network cannot connect', () => {
    const adj = buildAdjacency(G);
    // from near the chain to the isolated node → straight [from, to]
    const from = { fx: 0.0, fy: 0.5 };
    const to = { fx: 0.5, fy: 0.9 };
    expect(routePolyline(G, adj, from, to)).toEqual([from, to]);
  });

  it('handles an empty graph with a straight line', () => {
    const empty: RoadGraph = { nodes: [], edges: [] };
    const from = { fx: 0.1, fy: 0.1 };
    const to = { fx: 0.9, fy: 0.9 };
    expect(routePolyline(empty, buildAdjacency(empty), from, to)).toEqual([from, to]);
  });
});

describe('roadClassAt', () => {
  const profile = [
    { roadClass: 'residential', untilProgress: 0.2 },
    { roadClass: 'trunk', untilProgress: 0.7 },
    { roadClass: 'track', untilProgress: 1 },
  ];

  it('gives the run the progress falls in', () => {
    expect(roadClassAt(profile, 0)).toBe('residential');
    expect(roadClassAt(profile, 0.2)).toBe('residential');
    expect(roadClassAt(profile, 0.21)).toBe('trunk');
    expect(roadClassAt(profile, 0.99)).toBe('track');
  });

  it('holds the last run beyond the end, and knows nothing without a profile', () => {
    expect(roadClassAt(profile, 1.2)).toBe('track');
    expect(roadClassAt([], 0.5)).toBeUndefined();
  });
});
