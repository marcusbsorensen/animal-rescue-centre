import { describe, it, expect } from 'vitest';
import { VEHICLE_DEFS, type VehicleType } from '@arc/game-logic';
import { graph, adj, carriageways, trikeyLinksFile } from './real-graph';
import { shortestPath, type RoadGraph } from '../road-router';
import { routeBetween } from '../route-path';
import {
  CROSSING_CLASS, TRIKEY, buildTrikeyAdjacency, createRoadNetworks, crossingsOnRoute, trikeyGraph, type TrikeyLinksFile,
} from '../trikey-links';

// ── Trikey by rule 18A ──
//
// She never rides along the A28, crosses it only at the pelican at The Square
// and the lights at St Mildred's Road, and may use the paths and tracks a car
// cannot. Measured on the installed graph and trikey-links.json, every ordered
// pair of the 15 named places (210 pairs).

const names = Object.keys(graph.anchors);
const pairs = names.flatMap((from) => names.filter((to) => to !== from).map((to) => [from, to] as const));
const net = createRoadNetworks(graph, trikeyLinksFile);
const trike = net.forVehicle(TRIKEY);
const tg = trikeyGraph(graph, trikeyLinksFile);
const cars = (Object.keys(VEHICLE_DEFS) as VehicleType[]).filter((v) => v !== TRIKEY);

describe('her graph', () => {
  it('has no trunk edge at all', () => {
    expect(tg.edges.some((e) => e[2] === 'trunk')).toBe(false);
  });

  it('has exactly the two crossings marked for her, neither on the dual carriageway', () => {
    expect(tg.crossings.map((c) => [c.id, c.type, c.stretch, c.pavementM])).toEqual([
      ['osm-343468116', 'pelican', 'single', 106],                  // The Square
      ['osm-667266151', 'traffic-light junction', 'divided', 17],  // St Mildred's Road
    ]);
    expect(tg.edges.filter((e) => e[2] === CROSSING_CLASS)).toHaveLength(2);
  });

  it('joins the two sides of an A28 junction only by a crossing', () => {
    // The node in the data's numbering: a side copy stands for its junction.
    const idOf = (i: number) => (tg.baseNode[i] >= 0 ? tg.baseNode[i] : i);
    for (const j of trikeyLinksFile.a28Junctions) {
      const sideNodes = tg.baseNode.flatMap((b, i) => (b === j.node ? [i] : []));
      expect(sideNodes).toHaveLength(j.north.length && j.south.length ? 2 : 1);
      for (const n of sideNodes) {
        const across = tg.edges.filter((e) => e[2] !== CROSSING_CLASS && (e[0] === n || e[1] === n)).map((e) => idOf(e[0] === n ? e[1] : e[0]));
        const side = j.north.includes(across[0]) ? j.north : j.south;
        expect([...new Set(across)].sort(), `junction ${j.node} at node ${n}`).toEqual(side.slice().sort());
      }
    }
  });

  it('weights a crossing by its pavement, not by the line drawn', () => {
    const a = buildTrikeyAdjacency(tg);
    for (const c of tg.crossings) {
      expect(a[c.north].find((x) => x.to === c.south)!.w).toBeCloseTo(c.pavementM / 3900, 12);
      expect(a[c.south].find((x) => x.to === c.north)!.w).toBeCloseTo(c.pavementM / 3900, 12);
    }
  });

  it('puts Bramble Farm on the south side of its junction, where its farm-link is', () => {
    expect(tg.anchors['bramble-farm']).toBe(852);
    expect(tg.edges.filter((e) => e[0] === 852 || e[1] === 852)).toEqual([[1426, 852, 'farm-link']]);
  });
});

describe('where she can go', () => {
  it('reaches 6 of the 14 places from A.R.C.', () => {
    expect(net.reachableFor(TRIKEY, 'arc')).toEqual(['bay-chapel', 'deep-forest', 'pinebark-medical', 'wetlands', 'wilderwood', 'woodland']);
    expect(net.reachableFor(TRIKEY, 'arc')).toEqual(trikeyLinksFile.result.fromArc);
    expect(net.canReach(TRIKEY, 'arc', 'vet')).toBe(false);
    expect(net.canReach(TRIKEY, 'arc', 'woodland')).toBe(true);
  });

  it('reaches 44 of the 210 pairs, on these islands', () => {
    const reach = pairs.filter(([f, t]) => net.canReach(TRIKEY, f, t));
    expect(reach).toHaveLength(44);
    for (const [f, t] of reach) expect(shortestPath(trike.adj, trike.graph.anchors[f], trike.graph.anchors[t]), `${f} -> ${t}`).not.toBeNull();
    const islands: string[][] = [];
    for (const n of names) if (!islands.flat().includes(n)) islands.push([n, ...net.reachableFor(TRIKEY, n)].sort());
    expect(islands.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))).toEqual([
      ['arc', 'bay-chapel', 'deep-forest', 'pinebark-medical', 'wetlands', 'wilderwood', 'woodland'],
      ['bramble-farm', 'hog-hospital'],
      ['cove-harbour'],
      ['goose-end-farm'],
      ['moorland'],
      ['sea-cliffs'],
      ['vet'],
      ['village-hall'],
    ]);
  });

  it('is never more than 1,637 m further than a car would go', () => {
    let worst = -Infinity;
    const worstPairs: string[] = [];
    for (const [f, t] of pairs) {
      if (!net.canReach(TRIKEY, f, t)) continue;
      const hers = routeBetween(trike.graph, trike.adj, trike.graph.anchors[f], trike.graph.anchors[t])!;
      const car = routeBetween(graph, adj, graph.anchors[f], graph.anchors[t])!;
      const d = Math.round(hers.length - car.length);
      if (d > worst) { worst = d; worstPairs.length = 0; }
      if (d === worst) worstPairs.push(`${f} -> ${t}`);
    }
    expect(worst).toBe(1637);
    expect(worst).toBe(trikeyLinksFile.result.worstDetourM);
    expect(worstPairs).toContain('wilderwood -> bay-chapel');
  });

  it('answers for every other vehicle that every place is in reach', () => {
    for (const v of cars) expect(net.reachableFor(v, 'arc'), v).toHaveLength(14);
    expect(net.reachableFor(undefined, 'arc')).toHaveLength(14);
    expect(net.reachableFor(TRIKEY, 'nowhere')).toEqual([]);
  });
});

describe('the crossings on her routes', () => {
  const routes = pairs.flatMap(([f, t]) => {
    const r = routeBetween(trike.graph, trike.adj, trike.graph.anchors[f], trike.graph.anchors[t]);
    return r ? [{ f, t, r }] : [];
  });

  it('never rides an A28 edge, and crosses only at her two crossings', () => {
    const allowed = new Set(tg.crossings.map((c) => `${c.north}-${c.south}`));
    for (const { f, t, r } of routes) {
      for (let i = 1; i < r.nodes.length; i++) {
        const a = r.nodes[i - 1], b = r.nodes[i];
        const ba = tg.baseNode[a], bb = tg.baseNode[b];
        if (ba >= 0 && bb >= 0 && r.points[i].cls !== CROSSING_CLASS) expect(carriageways.between(ba, bb), `${f} -> ${t}`).toBeNull();
        expect(r.points[i].cls, `${f} -> ${t}`).not.toBe('trunk');
        if (r.points[i].cls === CROSSING_CLASS) expect(allowed.has(`${a}-${b}`) || allowed.has(`${b}-${a}`)).toBe(true);
      }
    }
  });

  it('marks each one, in order, where she reaches the kerb', () => {
    const used = new Map<string, number>();
    for (const { f, t, r } of routes) {
      const xs = crossingsOnRoute(trike, r);
      expect(xs.length, `${f} -> ${t}`).toBe(r.points.filter((p) => p.cls === CROSSING_CLASS).length);
      for (let i = 1; i < xs.length; i++) expect(xs[i].s).toBeGreaterThan(xs[i - 1].s);
      for (const x of xs) {
        used.set(x.id, (used.get(x.id) ?? 0) + 1);
        expect(x.s).toBeGreaterThan(0);
        expect(x.s).toBeLessThan(r.length);
        const k = r.points.findIndex((p) => p.s === x.s);
        expect(r.points[k + 1].cls).toBe(CROSSING_CLASS);
        expect([r.points[k].x, r.points[k].y]).toEqual([x.x, x.y]);
      }
    }
    // The Square's pelican joins A.R.C.'s island across the A28; St Mildred's
    // Road's lights carry the ride between Pinebark Medical and Bay Chapel.
    expect(Object.fromEntries(used)).toEqual({ 'osm-343468116': 18, 'osm-667266151': 2 });
    const there = crossingsOnRoute(trike, routes.find((x) => x.f === 'pinebark-medical' && x.t === 'bay-chapel')!.r);
    const back = crossingsOnRoute(trike, routes.find((x) => x.f === 'bay-chapel' && x.t === 'pinebark-medical')!.r);
    expect(there.map((x) => x.id)).toEqual(['osm-667266151']);
    expect(back.map((x) => x.id)).toEqual(['osm-667266151']);
    expect([there[0].towards, back[0].towards]).toEqual(['north', 'south']);
  });

  it('finds none on a car\'s route', () => {
    const car = net.forVehicle('small-van');
    expect(car.crossings).toEqual([]);
    const r = routeBetween(car.graph, car.adj, graph.anchors.arc, graph.anchors.vet)!;
    expect(crossingsOnRoute(car, r)).toEqual([]);
  });
});

describe('trikeyGraph refuses data that does not fit', () => {
  // A toy: a north road 0-1, the A28 1-2-3 east-west, a south road 2-4.
  const g: RoadGraph & { anchors: Record<string, number> } = {
    nodes: [[0.1, 0], [0.1, 0.1], [0.1, 0.2], [0.3, 0.2], [0.1, 0.3]],
    edges: [[0, 1, 'residential'], [1, 2, 'residential'], [2, 3, 'trunk'], [2, 4, 'residential']],
    anchors: { n: 0, s: 4 },
  };
  const links = (over: Partial<TrikeyLinksFile> = {}): TrikeyLinksFile => ({
    extraNodes: [], extraEdges: [], edgeSplits: [], farms: [],
    a28Junctions: [{ node: 2, north: [1], south: [4] }],
    crossings: [], ...over,
  });

  it('splits a junction so the two sides do not meet', () => {
    const toy = createRoadNetworks(g, links());
    expect(toy.canReach(TRIKEY, 'n', 's')).toBe(false);
    expect(createRoadNetworks(g, links({ a28Junctions: [] })).canReach(TRIKEY, 'n', 's')).toBe(true);
  });

  it('joins them at a crossing marked for her, and not at one that is not', () => {
    const crossing = { osmNodes: [7], type: 'pelican', at: [0.1, 0.2] as [number, number], stretch: 'single', north: { node: 2, arm: 'north' as const }, south: { node: 2, arm: 'south' as const }, pavementM: 12 };
    expect(createRoadNetworks(g, links({ crossings: [{ ...crossing, usedByRoutes: true }] })).canReach(TRIKEY, 'n', 's')).toBe(true);
    expect(createRoadNetworks(g, links({ crossings: [{ ...crossing, usedByRoutes: false }] })).canReach(TRIKEY, 'n', 's')).toBe(false);
    expect(() => trikeyGraph(g, links({ crossings: [{ ...crossing, stretch: 'dual', usedByRoutes: true }] }))).toThrow(/dual carriageway/);
  });

  it('throws on a junction that does not place a neighbour, or a node that does not exist', () => {
    expect(() => trikeyGraph(g, links({ a28Junctions: [{ node: 2, north: [], south: [4] }] }))).toThrow(/which side 1/);
    expect(() => trikeyGraph(g, links({ extraEdges: [[0, 99, 'cycleway']] }))).toThrow(/does not exist/);
  });
});
