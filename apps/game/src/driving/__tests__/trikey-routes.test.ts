import { describe, it, expect } from 'vitest';
import { VEHICLE_DEFS, type VehicleType } from '@arc/game-logic';
import { graph, adj } from './real-graph';
import { buildAdjacency, roadAllowedFor, routePolyline, routeProfile, shortestPath, vehicleRouteAdjacency, type RoadGraph } from '../road-router';
import { ARC_PLACE, placeFor } from '../birchie-places';
import { routeBetween } from '../route-path';

// ── Trikey avoids dual carriageways ──
//
// Trikey (pedal-trike) is half the speed of every gear; on a trunk road first
// gear is already too slow, so she would be too slow in every gear. Marcus,
// 2026-10-11 (driving port plan, section 5, answer 10): her routes avoid them.
// Measured on the installed Birchie graph, every ordered pair of its 15 named
// anchors (210 routes).

const names = Object.keys(graph.anchors);
const pairs = names.flatMap((from) => names.filter((to) => to !== from).map((to) => [from, to] as const));
const trikeAdj = buildAdjacency(graph, 'pedal-trike');

function edgeClass(g: RoadGraph): (a: number, b: number) => string | undefined {
  const m = new Map<string, string>();
  for (const [a, b, cls] of g.edges) { m.set(`${a}-${b}`, cls); m.set(`${b}-${a}`, cls); }
  return (a, b) => m.get(`${a}-${b}`);
}

describe('roadAllowedFor', () => {
  it('bars only trunk, and only for Trikey', () => {
    expect(roadAllowedFor('pedal-trike', 'trunk')).toBe(false);
    for (const cls of ['secondary', 'tertiary', 'unclassified', 'residential', 'track']) {
      expect(roadAllowedFor('pedal-trike', cls)).toBe(true);
    }
    for (const v of Object.keys(VEHICLE_DEFS) as VehicleType[]) {
      if (v !== 'pedal-trike') expect(roadAllowedFor(v, 'trunk')).toBe(true);
    }
    expect(roadAllowedFor(undefined, 'trunk')).toBe(true);
  });

  it('on a toy chain whose only link is trunk, Trikey has no route and gets the straight-line fallback', () => {
    const g: RoadGraph = { nodes: [[0, 0.5], [0.3, 0.5], [0.6, 0.5]], edges: [[0, 1, 'residential'], [1, 2, 'trunk']] };
    expect(shortestPath(buildAdjacency(g), 0, 2)).toEqual([0, 1, 2]);
    expect(shortestPath(buildAdjacency(g, 'pedal-trike'), 0, 2)).toBeNull();
    const from = { fx: 0, fy: 0.5 }, to = { fx: 0.6, fy: 0.5 };
    expect(routePolyline(g, buildAdjacency(g, 'pedal-trike'), from, to)).toEqual([from, to]);
  });
});

describe('Trikey routes on the Birchie graph', () => {
  it('never uses a trunk edge', () => {
    const cls = edgeClass(graph);
    let routed = 0;
    for (const [from, to] of pairs) {
      const path = shortestPath(trikeAdj, graph.anchors[from], graph.anchors[to]);
      if (!path) continue;
      routed++;
      for (let i = 1; i < path.length; i++) {
        expect(cls(path[i - 1], path[i]), `${from} -> ${to}`).not.toBe('trunk');
      }
    }
    expect(routed).toBe(44);
  });

  it('leaves every other vehicle routing exactly as before, all 210 pairs', () => {
    for (const v of Object.keys(VEHICLE_DEFS) as VehicleType[]) {
      if (v === 'pedal-trike') continue;
      const vAdj = buildAdjacency(graph, v);
      expect(vAdj, v).toEqual(adj);
      for (const [from, to] of pairs) {
        const s = graph.anchors[from], t = graph.anchors[to];
        expect(shortestPath(vAdj, s, t), `${v} ${from} -> ${to}`).toEqual(shortestPath(adj, s, t));
      }
    }
  });

  // Pinned so it cannot change silently. Without trunk the network falls into
  // islands; a pair is reachable only inside one. Which island each anchor
  // sits on is the whole unreachable list (166 of 210 pairs): change the map
  // or the rule and this must be updated on purpose. A decision for Marcus.
  it('pins which places Trikey can reach from which', () => {
    const islands = new Map<string, string[]>();
    for (const n of names) {
      const key = names.find((m) => m === n || shortestPath(trikeAdj, graph.anchors[m], graph.anchors[n]) !== null)!;
      islands.set(key, [...(islands.get(key) ?? []), n]);
    }
    expect([...islands.values()].map((v) => v.sort()).sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))).toEqual([
      ['arc', 'bay-chapel', 'deep-forest', 'pinebark-medical', 'wetlands', 'wilderwood', 'woodland'],
      ['hog-hospital', 'moorland'],
      ['bramble-farm'],
      ['cove-harbour'],
      ['goose-end-farm'],
      ['sea-cliffs'],
      ['vet'],
      ['village-hall'],
    ]);
    const unreachable = pairs.filter(([f, t]) => shortestPath(trikeAdj, graph.anchors[f], graph.anchors[t]) === null);
    expect(unreachable).toHaveLength(166);
  });

  it('pins how much longer the trunk-free routes are', () => {
    const changed: string[] = [];
    let same = 0;
    for (const [from, to] of pairs) {
      const trike = routeBetween(graph, trikeAdj, graph.anchors[from], graph.anchors[to]);
      if (!trike) continue;
      const before = routeBetween(graph, adj, graph.anchors[from], graph.anchors[to])!;
      const d = Math.round(trike.length - before.length);
      if (d === 0) same++;
      else changed.push(`${from} -> ${to} ${d > 0 ? '+' : ''}${d}`);
    }
    expect(same).toBe(34);
    expect(changed).toEqual([
      'arc -> pinebark-medical +550',
      'arc -> wilderwood +1637',
      'pinebark-medical -> arc +550',
      'pinebark-medical -> bay-chapel +212',
      'pinebark-medical -> wilderwood -753',
      'bay-chapel -> pinebark-medical +212',
      'bay-chapel -> wilderwood +1637',
      'wilderwood -> arc +1637',
      'wilderwood -> pinebark-medical -753',
      'wilderwood -> bay-chapel +1637',
    ]);
  });
});

// What the drive routes Trikey over, from A.R.C. (PtvDriveScene.routeAdjacency).
describe('vehicleRouteAdjacency', () => {
  const route = (to: string) => vehicleRouteAdjacency(graph, trikeAdj, adj, ARC_PLACE, placeFor(to));

  it('keeps Trikey on her own roads where they reach, and off the dual carriageway', () => {
    for (const to of ['woodland', 'wilderwood', 'deep-forest', 'wetlands']) {
      const r = route(to);
      expect(r.reachable, to).toBe(true);
      expect(r.adj, to).toBe(trikeAdj);
      const profile = routeProfile(graph, r.adj, ARC_PLACE, placeFor(to));
      expect(profile.length, to).toBeGreaterThan(0);
      expect(profile.map((p) => p.roadClass), to).not.toContain('trunk');
    }
  });

  it('falls back to every road where she cannot reach, rather than no route at all', () => {
    for (const to of ['vet', 'village-hall', 'bramble-farm', 'cove-harbour', 'goose-end-farm', 'moorland', 'sea-cliffs', 'hog-hospital']) {
      const r = route(to);
      expect(r.reachable, to).toBe(false);
      expect(r.adj, to).toBe(adj);
      const line = routePolyline(graph, r.adj, ARC_PLACE, placeFor(to));
      expect(line, to).toEqual(routePolyline(graph, adj, ARC_PLACE, placeFor(to)));
      expect(line.length, to).toBeGreaterThan(2); // on the roads, not a straight line
    }
  });

  it('changes nothing for a vehicle routed over every road', () => {
    const r = vehicleRouteAdjacency(graph, adj, adj, ARC_PLACE, placeFor('vet'));
    expect(r).toEqual({ adj, reachable: true });
  });
});
