import { describe, it, expect } from 'vitest';
import { VEHICLE_DEFS, type VehicleType } from '@arc/game-logic';
import { graph, adj, carriageways, onewayCheck, trikeyLinksFile } from './real-graph';
import { buildAdjacency, shortestPath, type Adjacency } from '../road-router';
import { routeBetween } from '../route-path';
import { TRIKEY, createRoadNetworks } from '../trikey-links';

// ── Every vehicle but Trikey routes as it always did ──
//
// The A28 data changes how the road is drawn and timed, not where a car can
// go: trunk edges stay two-way for routing, whatever OSM's oneway says. Every
// ordered pair of the 15 named places (210 pairs), for every vehicle.

const names = Object.keys(graph.anchors);
const pairs = names.flatMap((from) => names.filter((to) => to !== from).map((to) => [from, to] as const));
const net = createRoadNetworks(graph, trikeyLinksFile);
const cars = (Object.keys(VEHICLE_DEFS) as VehicleType[]).filter((v) => v !== TRIKEY);

describe('every other vehicle routes as before', () => {
  it('uses the game graph and every road, the A28 two-way', () => {
    for (const v of cars) {
      const roads = net.forVehicle(v);
      expect(roads.graph.nodes).toBe(graph.nodes);
      expect(roads.graph.edges).toBe(graph.edges);
      expect(roads.adj).toEqual(adj);
    }
  });

  it('routes all 210 pairs, none changed in length', () => {
    let total = 0;
    for (const v of cars) {
      const roads = net.forVehicle(v);
      total = 0;
      for (const [f, t] of pairs) {
        const s = graph.anchors[f], e = graph.anchors[t];
        const r = routeBetween(roads.graph, roads.adj, s, e);
        expect(r, `${v} ${f} -> ${t}`).not.toBeNull();
        expect(r!.nodes, `${v} ${f} -> ${t}`).toEqual(shortestPath(buildAdjacency(graph, v), s, e));
        total += r!.length;
      }
    }
    // Pinned on claude/crate-loading before this change: 210 routes, 868,538.9 m in all.
    expect(total).toBeCloseTo(868538.947, 2);
  });

  it('would lose places if OSM\'s oneway were followed, which is why it is not', () => {
    const directed: Adjacency = graph.nodes.map(() => []);
    graph.edges.forEach(([a, b], i) => {
      const w = adj[a].find((x) => x.to === b)!.w;
      const one = carriageways.carriagewayOf(i)?.oneway;
      if (!one || one[0] === a) directed[a].push({ to: b, w });
      if (!one || one[0] === b) directed[b].push({ to: a, w });
    });
    const lost = pairs.filter(([f, t]) => !shortestPath(directed, graph.anchors[f], graph.anchors[t]));
    expect(lost).toHaveLength(onewayCheck.pairsUnreachable);
    expect(lost.length).toBeGreaterThan(0);
    expect(pairs.filter(([f, t]) => !shortestPath(adj, graph.anchors[f], graph.anchors[t]))).toEqual([]);
  });
});

