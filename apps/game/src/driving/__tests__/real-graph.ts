/**
 * The installed Birchie road graph and a deterministic set of routes over it,
 * shared by the rotating-world tests so every claim is measured on the roads
 * the child actually drives, not a toy. Every ordered pair of the graph's 15
 * named anchors (A.R.C., the vet, the farms, the wild places): 210 routes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildAdjacency, type RoadGraph } from '../road-router';
import { routeBetween, type RoutePath } from '../route-path';
import type { TrikeyLinksFile } from '../trikey-links';
import { parseTrunkCarriageways, type TrunkCarriageways, type TrunkCarriagewaysFile } from '../trunk-carriageways';

export const graph = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../public/assets/driving/birchie-graph.json'), 'utf8'),
) as RoadGraph & { anchors: Record<string, number> };

export const adj = buildAdjacency(graph);

function readAsset<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../../../public/assets/driving', name), 'utf8')) as T;
}

/** What each trunk edge really is: dual, divided or single (trunk-carriageways.json). */
export const carriagewaysFile = readAsset<TrunkCarriagewaysFile & { summary: { trunkEdges: number; byKind: Record<string, number> } }>('trunk-carriageways.json');
export const carriageways = parseTrunkCarriageways(carriagewaysFile, graph);

/** Trikey's extra paths, junction sides and crossings (trikey-links.json). */
export const trikeyLinksFile = readAsset<TrikeyLinksFile & {
  result: { fromArc: string[]; pairs: number; worstDetourM: number; islands: string[][] };
}>('trikey-links.json');

/** The file's own check of what following OSM's oneway would do to cars. */
export const onewayCheck = (carriagewaysFile as unknown as { checks: { carWithOneway: { pairsUnreachable: number } } }).checks.carWithOneway;

/** Every ordered pair's route; given the carriageway data, trunk segments carry it. */
export function anchorRoutes(trunk?: TrunkCarriageways): { from: string; to: string; route: RoutePath }[] {
  const out: { from: string; to: string; route: RoutePath }[] = [];
  const names = Object.keys(graph.anchors);
  for (const from of names) for (const to of names) {
    if (from === to) continue;
    const route = routeBetween(graph, adj, graph.anchors[from], graph.anchors[to], trunk);
    if (route) out.push({ from, to, route });
  }
  return out;
}

/** Signed turn at every interior vertex, radians, with the distance it is at. */
export function vertexTurns(route: RoutePath): { s: number; turn: number }[] {
  const p = route.points;
  const out: { s: number; turn: number }[] = [];
  for (let i = 2; i < p.length; i++) {
    const h1 = Math.atan2(p[i - 1].y - p[i - 2].y, p[i - 1].x - p[i - 2].x);
    const h2 = Math.atan2(p[i].y - p[i - 1].y, p[i].x - p[i - 1].x);
    out.push({ s: p[i - 1].s, turn: Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)) });
  }
  return out;
}
