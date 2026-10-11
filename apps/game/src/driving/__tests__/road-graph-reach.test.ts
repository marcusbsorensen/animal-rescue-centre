import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DESTINATIONS } from '@arc/game-logic';
import { buildAdjacency, nearestNode, routePolyline, shortestPath, type RoadGraph } from '../road-router';
import { buildRouteJunctions } from '../junctions';
import { ARC_PLACE, placeFor } from '../birchie-places';

// ── The road graph the game drives, against the places it sends a child ──
//
// Everything here reads the INSTALLED files, the ones the game loads, and the
// game's own router (road-router.ts) and junction finder (junctions.ts), not a
// replica. tools/simplify-road-graph.py has its own replica for the report; this
// is the check that runs with the tests, so a place added without a road, or a
// pin nudged off the network, fails here and not in a child's hands.
//
// Why it exists: for months Cove Harbour and Deep Forest had no road to them.
// The router found nothing, fell back to a straight line, and the GPS drew that
// line across the fields. Nothing noticed, because nothing asked.

const DRIVING = path.join(__dirname, '../../../public/assets/driving');
const MAP = path.join(__dirname, '../../../public/admin/scene-assets/birchie-map');

interface InstalledGraph extends RoadGraph {
  /** Junction-to-junction chains, the lines the map draws. */
  roads?: [string, number[]][];
}

const graph: InstalledGraph = JSON.parse(fs.readFileSync(path.join(DRIVING, 'birchie-graph.json'), 'utf8'));
const adj = buildAdjacency(graph);

// The map is 1800 x 1121 units; the graph holds fractions of it.
const MAP_W = 1800;
const MAP_H = 1121;

describe('every destination can be driven to from the shelter', () => {
  it('starts from the shelter, which is one of the destinations', () => {
    expect(DESTINATIONS.some((d) => d.id === 'arc')).toBe(true);
  });

  it.each(DESTINATIONS.map((d) => [d.id]))('%s', (id) => {
    const from = ARC_PLACE;
    const to = placeFor(id);

    // Reachable: the node the shelter snaps to and the node this place snaps to
    // are joined by road. This is the question road-router.ts answers each drive.
    const route = shortestPath(adj, nearestNode(graph, from.fx, from.fy), nearestNode(graph, to.fx, to.fy));
    expect(route, `no road from A.R.C. to ${id}: the GPS would draw a straight line across the fields`).not.toBeNull();

    // And the drive can be built from it, the way PtvDriveScene builds it.
    const polyline = routePolyline(graph, adj, from, to);
    expect(polyline.length, `${id}: the router fell back to [from, to]`).toBeGreaterThan(2);
    expect(Array.isArray(buildRouteJunctions(graph, adj, from, to))).toBe(true);
  });

  it('parks the van at the pin: no pin is far from the road it drives to', () => {
    // The route runs to the nearest node and then straight to the pin, so a pin
    // far from any road leaves the van parked well short of it. Hog Hospital and
    // Wilderwood were 54 and 104 units out. The furthest now is Goose End Farm,
    // at 36; 40 leaves it room and catches a pin that has been put in a field.
    const MAX_UNITS = 40;
    const far: string[] = [];
    for (const d of DESTINATIONS) {
      const [nx, ny] = graph.nodes[nearestNode(graph, d.fx, d.fy)];
      const units = Math.hypot((nx - d.fx) * MAP_W, (ny - d.fy) * MAP_H);
      if (units > MAX_UNITS) far.push(`${d.id} (${units.toFixed(0)})`);
    }
    expect(far, 'destinations further than 40 map units from the nearest road').toEqual([]);
  });
});

// ── One graph, drawn and driven ──────────────────────────────────────────
//
// The roads a child SEES come from birchie-roads.svg, in four places (map.html,
// the GPS panel in PtvDriveScene, intro.html, birchie-map.html). The roads the
// van DRIVES come from birchie-graph.json. They were separate files for months,
// and disagreed: 141 footpaths and service roads were drawn that no route could
// use. The graph now carries `roads`, the chains the map draws, and the SVG's
// road layer is written from them. This keeps the two the same lines.

/** Each drawn road as [class, points], in file order. The trunk is drawn twice
 *  (a dark outline under the gold), so its outline group is skipped. */
function drawnRoads(svg: string): [string, [number, number][]][] {
  const out: [string, [number, number][]][] = [];
  for (const m of svg.matchAll(/<g id="roads-([a-z-]+)"[^>]*>([\s\S]*?)<\/g>/g)) {
    if (m[1] === 'trunk-outline') continue;
    for (const p of m[2].matchAll(/<path\b[^>]*\bd="([^"]+)"/g)) {
      const pts = [...p[1].matchAll(/(-?[0-9.]+),(-?[0-9.]+)/g)].map((q) => [Number(q[1]), Number(q[2])] as [number, number]);
      out.push([m[1], pts]);
    }
  }
  return out;
}

describe('what the map draws is what the van drives', () => {
  const svg = fs.readFileSync(path.join(MAP, 'birchie-roads.svg'), 'utf8');

  it('the graph carries the roads it is drawn from', () => {
    expect(graph.roads, 'birchie-graph.json has no `roads`: it is not a tools/simplify-road-graph.py candidate').toBeDefined();
  });

  it('every edge is in exactly one road', () => {
    const seen = new Set<string>();
    for (const [, nodes] of graph.roads ?? []) {
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = Math.min(nodes[i], nodes[i + 1]);
        const b = Math.max(nodes[i], nodes[i + 1]);
        const key = `${a}-${b}`;
        expect(seen.has(key), `edge ${key} is in two roads`).toBe(false);
        seen.add(key);
      }
    }
    const edges = new Set(graph.edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
    expect(seen).toEqual(edges);
  });

  it('the SVG draws exactly the graph\'s roads: no more, no fewer, none moved', () => {
    const drawn = drawnRoads(svg);
    const roads = graph.roads ?? [];
    expect(drawn.length, 'roads drawn against roads in the graph').toBe(roads.length);
    // Same order within a class: the tool writes them in the graph's order.
    const byClass = (list: [string, unknown][], cls: string) => list.filter(([c]) => c === cls);
    for (const cls of new Set(roads.map(([c]) => c))) {
      const want = byClass(roads, cls) as [string, number[]][];
      const got = byClass(drawn, cls) as [string, [number, number][]][];
      expect(got.length, `${cls} roads drawn`).toBe(want.length);
      want.forEach(([, nodes], i) => {
        const pts = got[i][1];
        expect(pts.length, `${cls} road ${i}: points`).toBe(nodes.length);
        nodes.forEach((n, k) => {
          expect(Math.abs(pts[k][0] - graph.nodes[n][0] * MAP_W), `${cls} road ${i}, point ${k}, x`).toBeLessThan(0.06);
          expect(Math.abs(pts[k][1] - graph.nodes[n][1] * MAP_H), `${cls} road ${i}, point ${k}, y`).toBeLessThan(0.06);
        });
      });
    }
  });

  it('draws no class of road the van cannot take', () => {
    // Footpaths, cycleways, pedestrian streets and service roads were drawn and
    // never driven. The drawn classes are the graph's classes.
    const driven = new Set(graph.edges.map(([, , cls]) => cls));
    for (const [cls] of drawnRoads(svg)) expect(driven.has(cls), `${cls} is drawn but not driven`).toBe(true);
  });
});
