import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { graph, trikeyLinksFile } from './real-graph';
import { TRIKEY, buildTrikeyAdjacency, createRoadNetworks, trikeyGraph, trikeyPath } from '../trikey-links';

// ── The drive spike routes Trikey as the game does ──
//
// The spike (public/admin/drive-spike.html) is plain JS and cannot load this
// TS, so drive-spike/trikey-roads.js carries trikey-links.ts and the router's
// weights and Dijkstra line for line. These hold the two to the same graph,
// the same weights and the same route between every two places, so Trikey in
// the spike keeps to rule 18A exactly as the game's Trikey does.

const SPIKE = path.join(__dirname, '../../../public/admin/drive-spike/trikey-roads.js');
const HEAVY_MS = 20_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let spike: any;
beforeAll(async () => { spike = await import(pathToFileURL(SPIKE).href); });

describe('drive-spike/trikey-roads.js', () => {
  it('builds her graph exactly as trikey-links.ts does', () => {
    const ts = trikeyGraph(graph, trikeyLinksFile);
    const js = spike.trikeyGraph(graph, trikeyLinksFile);
    expect(js.nodes).toEqual(ts.nodes);
    expect(js.edges).toEqual(ts.edges);
    expect(js.anchors).toEqual(ts.anchors);
    expect(js.crossings).toEqual(ts.crossings);
    expect(js.baseNode).toEqual(ts.baseNode);
    expect(js.edges.some(([, , cls]: [number, number, string]) => cls === 'trunk')).toBe(false);
  });

  it('weights it exactly as buildTrikeyAdjacency does', () => {
    const ts = buildTrikeyAdjacency(trikeyGraph(graph, trikeyLinksFile));
    const js = spike.adjacency(spike.trikeyGraph(graph, trikeyLinksFile));
    expect(js).toEqual(ts);
  });

  it('routes every pair of places as the game routes Trikey, and reaches what the game reaches', () => {
    const nets = createRoadNetworks(graph, trikeyLinksFile);
    const roads = nets.forVehicle(TRIKEY);
    const R = spike.create(graph, trikeyLinksFile);
    const names = Object.keys(graph.anchors);
    let routed = 0;
    for (const from of names) {
      expect(spike.reachableFrom(R, from)).toEqual(nets.reachableFor(TRIKEY, from));
      for (const to of names) {
        if (to === from) continue;
        const js = spike.shortestPath(R.adj, R.tg.anchors[from], R.tg.anchors[to]);
        expect(js).toEqual(trikeyPath(roads, from, to));
        if (js) routed++;
      }
    }
    expect(routed).toBe(44);
  }, HEAVY_MS);

  it('never picks a drive out of her reach, and none of its routes breaks the A28 rule', () => {
    const R = spike.create(graph, trikeyLinksFile);
    let s = 7;
    const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    let from: string | null = null;
    for (let i = 0; i < 300; i++) {
      const trip: { from: string; to: string; path: number[] } = spike.pickTrip(R, rand, from);
      expect(trip).not.toBeNull();
      expect(spike.reachableFrom(R, trip.from)).toContain(trip.to);
      expect(spike.a28Breaches(R, trip.path)).toEqual([]);
      from = trip.to;
    }
  }, HEAVY_MS);
});
