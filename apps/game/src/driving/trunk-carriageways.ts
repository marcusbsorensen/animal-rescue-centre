/**
 * trunk-carriageways.ts
 *
 * What each trunk edge of the Birchie graph really is. In UK OSM
 * `highway=trunk` means a primary A-road, not a dual carriageway, and the game
 * had drawn and timed every trunk edge as one. Here the A28 is 1.7 km of real
 * dual carriageway at 50 mph west of Brooksend, 2.0 km divided (two one-way
 * carriageways at 30–40 mph, Birchington to Westgate) and 3.4 km of ordinary
 * two-way A-road through The Square (docs/driving-rebuild-2026-10-11.md, "The
 * A28 as it really is").
 *
 * The data is trunk-carriageways.json beside birchie-graph.json, one record per
 * trunk edge, keyed by the edge's index into the graph's edges array.
 *
 * `oneway` is carried but must not be used for routing. The graph draws each
 * split stretch as one line that keeps to one carriageway, so following the
 * OSM direction edge by edge makes those stretches one-directional and cuts
 * three places off for cars (the file's own `checks`). Trunk edges route
 * two-way; kind, maxspeedMph and lanes are for drawing and speed.
 * No Phaser — unit-tested against the real data.
 */
import type { RoadGraph } from './road-router';

/** dual: the real dual carriageway. divided: two one-way carriageways at
 *  30–40 mph. single: an ordinary two-way A-road. */
export type CarriagewayKind = 'dual' | 'divided' | 'single';

export interface Carriageway {
  /** Index into the graph's edges array. */
  edge: number;
  /** That edge's [a, b], as the graph writes it. */
  nodes: [number, number];
  kind: CarriagewayKind;
  maxspeedMph: number;
  lanes: number;
  /** OSM direction as [from, to], null where OSM is two-way. Not for routing. */
  oneway: [number, number] | null;
  lengthM: number;
  osmWays: number[];
}

export interface TrunkCarriagewaysFile {
  edges: Carriageway[];
}

export interface TrunkCarriageways {
  /** The record for a graph edge, or null for an edge that is not trunk. */
  carriagewayOf(edgeIndex: number): Carriageway | null;
  /** The record for the edge between two nodes, either way round, or null. */
  between(a: number, b: number): Carriageway | null;
  readonly all: readonly Carriageway[];
}

const KINDS: ReadonlySet<string> = new Set(['dual', 'divided', 'single']);

/**
 * Read trunk-carriageways.json. Given the graph, it is checked against it:
 * every record must name a trunk edge by its own nodes, and every trunk edge
 * must have a record, so a graph rebuilt without rebuilding this file fails
 * loudly rather than timing the wrong road.
 */
export function parseTrunkCarriageways(json: TrunkCarriagewaysFile, graph?: RoadGraph): TrunkCarriageways {
  const byEdge = new Map<number, Carriageway>();
  const byPair = new Map<string, Carriageway>();
  for (const c of json.edges) {
    if (!KINDS.has(c.kind)) throw new Error(`trunk edge ${c.edge}: unknown kind ${c.kind}`);
    if (graph) {
      const e = graph.edges[c.edge];
      if (!e || e[2] !== 'trunk' || e[0] !== c.nodes[0] || e[1] !== c.nodes[1]) {
        throw new Error(`trunk edge ${c.edge}: does not match the graph's edge ${JSON.stringify(e)}`);
      }
    }
    const rec: Carriageway = {
      edge: c.edge, nodes: [c.nodes[0], c.nodes[1]], kind: c.kind,
      maxspeedMph: c.maxspeedMph, lanes: c.lanes, oneway: c.oneway ?? null,
      lengthM: c.lengthM, osmWays: c.osmWays ?? [],
    };
    byEdge.set(c.edge, rec);
    byPair.set(pairKey(c.nodes[0], c.nodes[1]), rec);
  }
  if (graph) {
    graph.edges.forEach((e, i) => {
      if (e[2] === 'trunk' && !byEdge.has(i)) throw new Error(`trunk edge ${i} has no carriageway record`);
    });
  }
  const all = [...byEdge.values()];
  return {
    carriagewayOf: (i) => byEdge.get(i) ?? null,
    between: (a, b) => byPair.get(pairKey(a, b)) ?? null,
    all,
  };
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Whether a carriageway is the real dual carriageway, the one road the big-road
 *  zoom and the dual's gears belong to. */
export function isDual(c: Carriageway | null | undefined): boolean {
  return c?.kind === 'dual';
}
