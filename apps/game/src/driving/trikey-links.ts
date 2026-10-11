/**
 * trikey-links.ts
 *
 * Trikey's own road network, by rule 18A (docs/driving-rebuild-2026-10-11.md,
 * "The A28 as it really is"; port plan section 5, answer 10). Marcus: a
 * crossing at road level of a dual carriageway "teaches something very
 * dangerous to kids", and nothing the game makes normal on the road should be
 * dangerous for a child to copy. So Trikey:
 *
 * - never rides along the A28 (no trunk edge at all);
 * - crosses it only at the lights the data marks as hers: the pelican at The
 *   Square and the lights at St Mildred's Road. Never on the dual carriageway,
 *   which has no bridge or tunnel;
 * - may use the cycleways, bridleways, paths and tracks a car cannot.
 *
 * The data is trikey-links.json beside birchie-graph.json. Its nodes 0..936 are
 * the graph's own and 937.. its extra nodes, so her graph is the game graph
 * extended, and a route over it draws with the same code as anyone else's.
 *
 * The A28 junctions. Where a side road meets the A28 the graph has one node,
 * on the A28 itself; without the trunk edges a side road north and one south
 * would still meet there, and she would cross at road level wherever two side
 * roads face each other. So each junction node is split by side: the node
 * keeps its south side (or its north, where it has no south) and the other
 * side gets a copy at the same spot, appended after the extra nodes. The two
 * sides join only by a crossing edge, of class 'crossing', weighted by the
 * crossing's pavement length.
 *
 * Every other vehicle routes as before: trunk two-way (trunk-carriageways.ts).
 * No Phaser — unit-tested against the real data.
 */
import type { VehicleType } from '@arc/game-logic';
import { buildAdjacency, nearestNode, shortestPath, type Adjacency, type RoadGraph, type RoutePoint } from './road-router';
import { METRES_PER_UNIT, type RoutePath } from './route-path';

export const TRIKEY: VehicleType = 'pedal-trike';

/** The class of the edge that carries her over the A28 at the lights. */
export const CROSSING_CLASS = 'crossing';

type Side = 'north' | 'south';

interface CrossingEndFile {
  node: number;
  arm?: Side;
}

export interface TrikeyLinksFile {
  extraNodes: [number, number][];
  extraEdges: ([number, number, string] | [number, number, string, string])[];
  edgeSplits: { edge: [number, number]; class: string; insert: number[]; at: number[] }[];
  a28Junctions: { node: number; north: number[]; south: number[] }[];
  farms: { place: string; node: number; side: Side }[];
  crossings: {
    osmNodes: number[];
    type: string;
    at: [number, number];
    stretch: string;
    north: CrossingEndFile | null;
    south: CrossingEndFile | null;
    pavementM?: number;
    usedByRoutes: boolean;
  }[];
}

/** A crossing she may use, as an edge of her graph. */
export interface TrikeyCrossing {
  /** From the first OSM node of the crossing, e.g. 'osm-343468116'. */
  id: string;
  /** pelican, signalled crossing, traffic-light junction … as OSM has it. */
  type: string;
  /** Map fractions of the crossing itself. */
  at: [number, number];
  /** The A28 stretch it crosses: 'single' or 'divided', never 'dual'. */
  stretch: string;
  pavementM: number;
  /** Her graph's nodes at the north and south ends. */
  north: number;
  south: number;
}

export interface TrikeyGraph extends RoadGraph {
  /** Places by node, as the game graph's, with a farm on an A28 junction put
   *  on the side its farm-link reaches. */
  anchors: Record<string, number>;
  crossings: TrikeyCrossing[];
  /** The game graph's node each of hers stands for: itself for the game's,
   *  the junction for a side copy, -1 for an extra node. */
  baseNode: number[];
}

/**
 * Her graph: the game graph without the A28, plus her links, with each A28
 * junction split by side and the two permitted crossings joining the sides.
 * Throws where the data does not fit the graph, rather than route her across
 * a road she must not cross.
 */
export function trikeyGraph(base: RoadGraph & { anchors?: Record<string, number> }, links: TrikeyLinksFile): TrikeyGraph {
  const nBase = base.nodes.length;
  const nodes: [number, number][] = [...base.nodes.map((p) => [p[0], p[1]] as [number, number]), ...links.extraNodes];
  const baseNode = nodes.map((_, i) => (i < nBase ? i : -1));
  const known = nodes.length;
  const check = (n: number, what: string) => {
    if (!Number.isInteger(n) || n < 0 || n >= known) throw new Error(`trikey-links: ${what} names node ${n}, which does not exist`);
  };

  // Every edge she may ride, before the junctions are split.
  const split = new Set(links.edgeSplits.map((s) => pairKey(s.edge[0], s.edge[1])));
  const raw: [number, number, string][] = [];
  for (const [a, b, cls] of base.edges) {
    if (cls === 'trunk' || split.has(pairKey(a, b))) continue;
    raw.push([a, b, cls]);
  }
  for (const s of links.edgeSplits) {
    const chain = [s.edge[0], ...s.insert, s.edge[1]];
    chain.forEach((n) => check(n, `split of ${s.edge.join('-')}`));
    for (let i = 1; i < chain.length; i++) raw.push([chain[i - 1], chain[i], s.class]);
  }
  for (const [a, b, cls] of links.extraEdges) {
    check(a, `${cls} edge`); check(b, `${cls} edge`);
    raw.push([a, b, cls]);
  }

  // Split each A28 junction by side.
  const sides = new Map<number, { north: Set<number>; south: Set<number>; node: Record<Side, number | undefined> }>();
  for (const j of links.a28Junctions) {
    check(j.node, 'a28Junctions');
    const keeps: Side = j.south.length > 0 ? 'south' : 'north';
    const other: Side = keeps === 'south' ? 'north' : 'south';
    const node: Record<Side, number | undefined> = { north: undefined, south: undefined };
    node[keeps] = j.node;
    if (j[other].length > 0) {
      node[other] = nodes.length;
      nodes.push([base.nodes[j.node][0], base.nodes[j.node][1]]);
      baseNode.push(j.node);
    }
    sides.set(j.node, { north: new Set(j.north), south: new Set(j.south), node });
  }
  const sideNode = (n: number, side: Side, what: string): number => {
    const s = sides.get(n);
    if (!s) return n;
    const out = s.node[side];
    if (out === undefined) throw new Error(`trikey-links: ${what} reaches A28 junction ${n} on its ${side} side, which has no road`);
    return out;
  };
  const end = (n: number, from: number): number => {
    const s = sides.get(n);
    if (!s) return n;
    if (s.north.has(from)) return sideNode(n, 'north', `edge ${n}-${from}`);
    if (s.south.has(from)) return sideNode(n, 'south', `edge ${n}-${from}`);
    throw new Error(`trikey-links: A28 junction ${n} does not say which side ${from} is on`);
  };
  const edges: [number, number, string][] = raw.map(([a, b, cls]) => [end(a, b), end(b, a), cls]);

  const crossings: TrikeyCrossing[] = [];
  for (const c of links.crossings) {
    if (!c.usedByRoutes) continue;
    if (!c.north || !c.south || c.pavementM === undefined) throw new Error(`trikey-links: crossing ${c.osmNodes[0]} is marked for her but has no ends`);
    if (c.stretch === 'dual') throw new Error(`trikey-links: crossing ${c.osmNodes[0]} is on the dual carriageway`);
    const crossingEnd = (e: CrossingEndFile, side: Side) => {
      check(e.node, 'crossing');
      if (e.arm) return sideNode(e.node, e.arm, `crossing ${c.osmNodes[0]}`);
      if (sides.has(e.node)) throw new Error(`trikey-links: crossing ${c.osmNodes[0]} ends at A28 junction ${e.node} without saying which arm (${side})`);
      return e.node;
    };
    const crossing: TrikeyCrossing = {
      id: `osm-${c.osmNodes[0]}`, type: c.type, at: c.at, stretch: c.stretch, pavementM: c.pavementM,
      north: crossingEnd(c.north, 'north'), south: crossingEnd(c.south, 'south'),
    };
    crossings.push(crossing);
    edges.push([crossing.north, crossing.south, CROSSING_CLASS]);
  }

  const anchors = { ...(base.anchors ?? {}) };
  for (const f of links.farms) {
    if (anchors[f.place] === f.node && sides.has(f.node)) anchors[f.place] = sideNode(f.node, f.side, f.place);
  }
  return { nodes, edges, anchors, crossings, baseNode };
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Her adjacency: her graph weighted as the router weights any road, with
 *  each crossing weighted by its pavement length rather than the line drawn. */
export function buildTrikeyAdjacency(tg: TrikeyGraph): Adjacency {
  const adj = buildAdjacency({ nodes: tg.nodes, edges: tg.edges.filter((e) => e[2] !== CROSSING_CLASS) }, TRIKEY);
  for (const c of tg.crossings) {
    const w = c.pavementM / METRES_PER_UNIT;
    adj[c.north].push({ to: c.south, w });
    adj[c.south].push({ to: c.north, w });
  }
  return adj;
}

export interface CrossingOnRoute {
  id: string;
  type: string;
  /** Distance along the route to where she reaches the kerb, metres. */
  s: number;
  /** World metres of that kerb, as route-path's points. */
  x: number;
  y: number;
  /** Which way she crosses. */
  towards: Side;
}

/**
 * The A28 crossings on a route over her graph, in order: where she must stop
 * and wait for the green man. Empty for a route that does not cross, and for
 * any route over a graph without crossings.
 */
export function crossingsOnRoute(tg: { crossings: readonly TrikeyCrossing[] }, route: RoutePath): CrossingOnRoute[] {
  const out: CrossingOnRoute[] = [];
  for (let i = 1; i < route.nodes.length; i++) {
    const a = route.nodes[i - 1], b = route.nodes[i];
    for (const c of tg.crossings) {
      const southward = a === c.north && b === c.south;
      if (!southward && !(a === c.south && b === c.north)) continue;
      const p = route.points[i - 1];
      out.push({ id: c.id, type: c.type, s: p.s, x: p.x, y: p.y, towards: southward ? 'south' : 'north' });
    }
  }
  return out;
}

/** The roads a vehicle routes over: its graph and adjacency, and the A28
 *  crossings on it (none but Trikey's). */
export interface VehicleRoads {
  graph: RoadGraph & { anchors: Record<string, number> };
  adj: Adjacency;
  crossings: readonly TrikeyCrossing[];
}

export interface RoadNetworks {
  /** Trikey's network for her, the game graph with every road (trunk two-way)
   *  for every other vehicle, and for no vehicle. Built once each. */
  forVehicle(vehicle?: VehicleType): VehicleRoads;
  /** The places a vehicle can reach from a place, sorted, not counting the
   *  place itself. For the vehicle picker's "too far for Trikey". */
  reachableFor(vehicle: VehicleType | undefined, from: string): string[];
  /** Whether a vehicle can reach one place from another. */
  canReach(vehicle: VehicleType | undefined, from: string, to: string): boolean;
}

export function createRoadNetworks(
  base: RoadGraph & { anchors?: Record<string, number> },
  links: TrikeyLinksFile,
): RoadNetworks {
  let all: VehicleRoads | undefined;
  let trike: VehicleRoads | undefined;
  const reach = new Map<string, Set<string>>();
  const forVehicle = (vehicle?: VehicleType): VehicleRoads => {
    if (vehicle === TRIKEY) {
      if (!trike) {
        const graph = trikeyGraph(base, links);
        trike = { graph, adj: buildTrikeyAdjacency(graph), crossings: graph.crossings };
      }
      return trike;
    }
    all ??= { graph: { ...base, anchors: base.anchors ?? {} }, adj: buildAdjacency(base), crossings: [] };
    return all;
  };
  const reachable = (vehicle: VehicleType | undefined, from: string): Set<string> => {
    const roads = forVehicle(vehicle);
    const key = `${roads === trike ? TRIKEY : ''}|${from}`;
    let out = reach.get(key);
    if (!out) {
      out = new Set();
      const start = roads.graph.anchors[from];
      if (start !== undefined) {
        const seen = componentOf(roads.adj, start);
        for (const [place, n] of Object.entries(roads.graph.anchors)) if (place !== from && seen.has(n)) out.add(place);
      }
      reach.set(key, out);
    }
    return out;
  };
  return {
    forVehicle,
    reachableFor: (vehicle, from) => [...reachable(vehicle, from)].sort(),
    canReach: (vehicle, from, to) => reachable(vehicle, from).has(to),
  };
}

/** Every node joined to start. */
function componentOf(adj: Adjacency, start: number): Set<number> {
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    for (const { to } of adj[stack.pop()!]) if (!seen.has(to)) { seen.add(to); stack.push(to); }
  }
  return seen;
}

/** Her node path between two places, or null. */
export function trikeyPath(roads: VehicleRoads, from: string, to: string): number[] | null {
  const s = roads.graph.anchors[from], t = roads.graph.anchors[to];
  if (s === undefined || t === undefined) return null;
  return shortestPath(roads.adj, s, t);
}

/** No links at all: her graph is then the game graph without the A28, which
 *  is what she rode before trikey-links.json existed. */
export const NO_TRIKEY_LINKS: TrikeyLinksFile = {
  extraNodes: [], extraEdges: [], edgeSplits: [], a28Junctions: [], farms: [], crossings: [],
};

/**
 * The roads a drive between two map points runs over: the vehicle's own, or
 * every road where its own cannot join them. `reachable` says which.
 *
 * TODO(Marcus): the vehicle picker should say "too far for Trikey" for a place
 * `reachableFor` leaves out, so she is never sent there. Until it does, a drive
 * to such a place takes the road every other vehicle would, A28 and all,
 * rather than strand her or draw a straight line across the fields.
 */
export function roadsForRoute(
  nets: RoadNetworks, vehicle: VehicleType | undefined, from: RoutePoint, to: RoutePoint,
): { roads: VehicleRoads; reachable: boolean } {
  const own = nets.forVehicle(vehicle);
  const all = nets.forVehicle();
  if (own === all) return { roads: all, reachable: true };
  const s = nearestNode(own.graph, from.fx, from.fy);
  const t = nearestNode(own.graph, to.fx, to.fy);
  return shortestPath(own.adj, s, t) ? { roads: own, reachable: true } : { roads: all, reachable: false };
}
