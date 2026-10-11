import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DESTINATIONS, mapExtentFor } from '@arc/game-logic';
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

// ── The map on a screen: the pins land where the SVG draws them ──────────────
//
// map.html lays HTML pins over a drawing the SVG places for itself, and the two
// agreed only when the stage was the map's own shape (1800:1121). The page
// assumed `meet` while the SVG root said `slice` (2026-05-18 to 2026-10-11), so on
// an iPhone in landscape (874x402) the A.R.C. stamp stood 73px right and 20px
// below its own plot, and every pin with it, while the test above, which reads
// the data, passed. The data was right and the screen was not.
//
// What follows runs the page's own geometry (the block marked "screen geometry" in
// map.html, as written, in a vm with a stubbed document) and holds it to the SVG
// the page loads: the root's own viewBox and preserveAspectRatio, worked through
// SVG 1.1 section 7.8 here, written out separately from map-fit.js. A change to the
// SVG's attribute, to the page's arithmetic or to map-fit.js that makes them
// disagree fails here, at the stage sizes the game is played on and some it is not.

const ADMIN = path.join(__dirname, '../../../public/admin');
const svgText = fs.readFileSync(path.join(MAP, 'birchie-roads.svg'), 'utf8');
const mapHtml = fs.readFileSync(path.join(ADMIN, 'map.html'), 'utf8');
const introHtml = fs.readFileSync(path.join(ADMIN, 'intro.html'), 'utf8');
const mapFitSource = fs.readFileSync(path.join(ADMIN, 'map-fit.js'), 'utf8');

interface View { x: number; y: number; w: number; h: number }
interface Placed { x: number; y: number; w: number; h: number; sx: number; sy: number }
interface MapFitApi {
  parseViewBox(text: unknown): View | null;
  parsePreserveAspectRatio(text: unknown): { alignX: number | null; alignY: number | null; slice: boolean };
  place(box: { w: number; h: number }, view: View, par: unknown): Placed;
  toBox(placed: Placed, view: View, ux: number, uy: number): { x: number; y: number };
  readRoot(el: unknown): { view: View; par: unknown } | null;
}
interface Pt { x: number; y: number }
interface Transform { k: number; tx: number; ty: number }
interface PageGeometry {
  /** Stage pixels: after the frame's zoom and pan (the CSS transform on the SVG). */
  pin(fx: number, fy: number): Pt;
  /** The same point before that transform: where the SVG puts it in its own box. */
  inBox(fx: number, fy: number): Pt;
  transform(): Transform;
  setExtent(e: { cx: number; cy: number; half: number }): void;
}

// map-fit.js is a plain script the pages load with <script src>: run it the same way.
const sandbox: { self?: unknown; MapFit?: MapFitApi } = {};
sandbox.self = sandbox;
vm.runInNewContext(mapFitSource, sandbox);
const MapFit = sandbox.MapFit as MapFitApi;

/** The attributes the installed SVG gives its own root. */
const rootAttrs: Record<string, string> = {};
for (const m of (svgText.match(/<svg\b[^>]*>/) ?? [''])[0].matchAll(/\s([\w:-]+)="([^"]*)"/g)) rootAttrs[m[1]] = m[2];

function rootElement(attrs: Record<string, string>) {
  return { localName: 'svg', getAttribute: (n: string) => (n in attrs ? attrs[n] : null) };
}

/**
 * SVG 1.1 section 7.8, step by step, for a viewport of `vp` pixels and a root with
 * these attributes. Deliberately not map-fit.js: the viewBox-to-viewport matrix
 * as the spec writes it, and its inverse.
 */
function specTransform(vp: { w: number; h: number }, attrs: Record<string, string>) {
  const vb = (attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
  const [align, meetOrSlice = 'meet'] = (attrs.preserveAspectRatio ?? 'xMidYMid meet').trim().split(/\s+/);
  let sx = vp.w / vb[2], sy = vp.h / vb[3];
  if (align !== 'none') {
    const s = meetOrSlice === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
    sx = s; sy = s;
  }
  let tx = -vb[0] * sx, ty = -vb[1] * sy;
  if (align !== 'none') {
    if (align.startsWith('xMid')) tx += (vp.w - vb[2] * sx) / 2;
    else if (align.startsWith('xMax')) tx += vp.w - vb[2] * sx;
    if (align.endsWith('YMid')) ty += (vp.h - vb[3] * sy) / 2;
    else if (align.endsWith('YMax')) ty += vp.h - vb[3] * sy;
  }
  return {
    to: (x: number, y: number): Pt => ({ x: tx + sx * x, y: ty + sy * y }),
    from: (x: number, y: number): Pt => ({ x: (x - tx) / sx, y: (y - ty) / sy }),
    scale: sx,
  };
}

/** The page's geometry block, run as written, for a stage of w x h whose SVG has `attrs`. */
function pageGeometry(w: number, h: number, attrs: Record<string, string>): PageGeometry {
  const begin = mapHtml.indexOf('// ── begin screen geometry ──');
  const end = mapHtml.indexOf('// ── end screen geometry ──');
  expect(begin, 'map.html lost its "begin screen geometry" marker').toBeGreaterThan(-1);
  expect(end, 'map.html lost its "end screen geometry" marker').toBeGreaterThan(begin);
  const stage = { getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }) };
  const obj = {
    offsetWidth: w,
    offsetHeight: h,
    // placePins() puts a transform on the object, so its rect carries the last
    // call's zoom. Reading it made every second call undo the one before.
    getBoundingClientRect: () => { throw new Error('the geometry read the object\'s transformed rect'); },
    contentDocument: { documentElement: rootElement(attrs) },
  };
  const ctx = vm.createContext({
    MapFit,
    document: { getElementById: (id: string) => (id === 'osm-svg' ? obj : id === 'world-stage' ? stage : null) },
  });
  vm.runInContext('var extent = { cx: 0.5, cy: 0.5, half: 0.5 };', ctx);
  vm.runInContext(mapHtml.slice(begin, end), ctx);
  return {
    pin: vm.runInContext('(fx, fy) => fracToScreen(fx, fy, mapTransform())', ctx),
    inBox: vm.runInContext(
      '(fx, fy) => { const t = mapTransform(); const p = fracToScreen(fx, fy, t); return { x: (p.x - t.tx) / t.k, y: (p.y - t.ty) / t.k }; }',
      ctx,
    ),
    transform: vm.runInContext('() => { const t = mapTransform(); return { k: t.k, tx: t.tx, ty: t.ty }; }', ctx),
    setExtent: vm.runInContext('(e) => { extent = e; }', ctx),
  };
}

// Stage shapes: the map's own, the device the game is tested on, the narrowest plate it
// supports, an iPad, a desktop, 16:9, and four that are nobody's screen, to show the
// fix is the arithmetic and not tuned to one.
const STAGES: [string, number, number][] = [
  ['the map\'s own shape', 1800, 1121],
  ['iPhone landscape', 874, 402],
  ['narrowest plate', 812, 375],
  ['iPad-ish', 1024, 700],
  ['desktop', 1440, 900],
  ['16:9', 1920, 1080],
  ['extreme wide, 5:1', 2400, 480],
  ['extreme wide, 12:1', 1800, 150],
  ['extreme tall, 1:2', 480, 960],
  ['extreme tall, 1:6', 200, 1200],
];

const MAP_VIEW = MapFit.parseViewBox(rootAttrs.viewBox) as View;
const arc = DESTINATIONS.find((d) => d.id === 'arc');

describe('the map on a screen', () => {
  it('the SVG root says how the map is drawn, in attributes the page can read', () => {
    expect(MAP_VIEW, 'the root has no usable viewBox').not.toBeNull();
    expect(MAP_VIEW.w).toBe(MAP_W);
    expect(MAP_VIEW.h).toBe(MAP_H);
  });

  it('is `meet`: the whole map is on the screen, because every destination has to be', () => {
    // `slice` fills the stage and crops the map. mapExtentFor() promises that every
    // unlocked pin is in the frame, a pin is a tap target, and at 874x402 (2.17:1
    // against a map of 1.61:1) slice throws away a third of the height, with Wetlands
    // and the two new placements below the fold. It was set on 2026-05-18 to stop the
    // stage's gradient showing as bars either side of the map; the stage is now the
    // colour of the SVG's own sea, so `meet` has no bars to see.
    const par = MapFit.parsePreserveAspectRatio(rootAttrs.preserveAspectRatio);
    expect(par.slice, `birchie-roads.svg says preserveAspectRatio="${rootAttrs.preserveAspectRatio}": it crops the map`).toBe(false);
  });

  describe('the A.R.C. stamp is on its drawn plot', () => {
    // arc-plot is the dashed outline the stamp stands on; the stamp's foot is its southern corner.
    const plot = (svgText.match(/id="arc-plot"[^>]*\bpoints="([^"]+)"/)?.[1] ?? '')
      .trim().split(/\s+/).map((p) => p.split(',').map(Number) as [number, number]);

    function distToPlotUnits(p: Pt): number {
      let best = Infinity;
      for (let i = 0; i < plot.length - 1; i++) {
        const [ax, ay] = plot[i], [bx, by] = plot[i + 1];
        const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len)) : 0;
        best = Math.min(best, Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy)));
      }
      return best;
    }

    it('the plot is in the file and the destination stands on it, in the data', () => {
      expect(plot.length, 'no arc-plot polygon in the SVG').toBeGreaterThan(3);
      expect(arc, 'no `arc` destination').toBeDefined();
      expect(distToPlotUnits({ x: (arc?.fx ?? 0) * MAP_W, y: (arc?.fy ?? 0) * MAP_H })).toBeLessThan(4);
    });

    it.each(STAGES)('%s (%i x %i): the stamp stands on the plot as the SVG draws it', (_name, w, h) => {
      const drawn = specTransform({ w, h }, rootAttrs);
      const pin = pageGeometry(w, h, rootAttrs).pin(arc?.fx ?? 0, arc?.fy ?? 0);
      // Back out to map units through the SVG's own transform: where, on the drawing, is the stamp?
      const onMap = drawn.from(pin.x, pin.y);
      const units = distToPlotUnits(onMap);
      expect(units, `the stamp is ${(units * drawn.scale).toFixed(0)}px from its plot`).toBeLessThan(4);
    });
  });

  describe('every pin is where the data puts it, on the drawing', () => {
    it.each(STAGES)('%s (%i x %i)', (_name, w, h) => {
      const drawn = specTransform({ w, h }, rootAttrs);
      const page = pageGeometry(w, h, rootAttrs);
      const off: string[] = [];
      const roads = drawnRoads(svgText);
      const far: string[] = [];
      for (const d of DESTINATIONS) {
        const onMap = drawn.from(page.pin(d.fx, d.fy).x, page.pin(d.fx, d.fy).y);
        const units = Math.hypot(onMap.x - d.fx * MAP_W, onMap.y - d.fy * MAP_H);
        if (units > 0.05) off.push(`${d.id} ${(units * drawn.scale).toFixed(1)}px`);
        // And on a road the child can see: the DRAWN roads, found from where the pin is on screen.
        let best = Infinity;
        for (const [, pts] of roads) {
          for (let i = 0; i < pts.length - 1; i++) {
            const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
            const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
            const t = len ? Math.max(0, Math.min(1, ((onMap.x - ax) * dx + (onMap.y - ay) * dy) / len)) : 0;
            best = Math.min(best, Math.hypot(onMap.x - (ax + t * dx), onMap.y - (ay + t * dy)));
          }
        }
        if (best > 40) far.push(`${d.id} ${best.toFixed(0)} units`);
      }
      expect(off, 'pins off the place the data puts them, on the drawing').toEqual([]);
      expect(far, 'pins more than 40 units from a drawn road, on screen').toEqual([]);
    });
  });

  describe('follows the SVG, whatever it says', () => {
    // The page reads the attribute; it must not assume one. Every alignment, both fits, and "none".
    // Compared in the SVG's own box, before the frame's zoom: the part the attribute decides.
    const FITS = [
      'xMidYMid meet', 'xMidYMid slice', 'xMinYMin meet', 'xMaxYMax slice', 'xMinYMax meet',
      'xMaxYMin slice', 'xMidYMin meet', 'xMinYMid slice', 'none',
    ];
    const SAMPLE: Pt[] = [{ x: 0, y: 0 }, { x: 326, y: 397 }, { x: 1800, y: 1121 }, { x: 900, y: 560.5 }];
    it.each(FITS)('preserveAspectRatio="%s": the page and the spec agree at every stage', (par) => {
      const attrs = { ...rootAttrs, preserveAspectRatio: par };
      for (const [name, w, h] of STAGES) {
        const drawn = specTransform({ w, h }, attrs);
        const page = pageGeometry(w, h, attrs);
        for (const p of SAMPLE) {
          const want = drawn.to(p.x, p.y);
          const got = page.inBox(p.x / MAP_W, p.y / MAP_H);
          expect(got.x, `${name} ${w}x${h} ${par} x of (${p.x},${p.y})`).toBeCloseTo(want.x, 6);
          expect(got.y, `${name} ${w}x${h} ${par} y of (${p.x},${p.y})`).toBeCloseTo(want.y, 6);
        }
      }
    });

    it('a viewBox that is not at the origin is followed too', () => {
      const attrs = { ...rootAttrs, viewBox: '100 50 1600 1000', preserveAspectRatio: 'xMidYMid meet' };
      const drawn = specTransform({ w: 874, h: 402 }, attrs);
      const page = pageGeometry(874, 402, attrs);
      // Fractions are of the viewBox: its centre is fraction .5, whatever its origin.
      const want = drawn.to(100 + 800, 50 + 500);
      const got = page.inBox(0.5, 0.5);
      expect(got.x).toBeCloseTo(want.x, 6);
      expect(got.y).toBeCloseTo(want.y, 6);
    });
  });

  describe('against a real browser', () => {
    // Chrome's getScreenCTM() on the SVG root, for the A.R.C. plot's anchor (326, 397) in an
    // object the size of the viewport (map.html?embed=1), measured 2026-10-11. The spec
    // transform above and map-fit.js are held to these, so neither is only checked against
    // the other.
    const CHROME: Record<string, Record<string, [number, number]>> = {
      meet: {
        '874x402': [231.2, 142.4], '812x375': [214.0, 132.8], '1024x700': [185.4, 257.0],
        '1440x900': [260.8, 319.2], '2400x480': [954.2, 170.0], '480x960': [86.9, 436.4],
      },
      slice: {
        '874x402': [158.3, 121.6], '812x375': [147.1, 113.7], '1024x700': [153.6, 247.9],
        '1440x900': [259.1, 318.7], '2400x480': [434.6, 21.9], '480x960': [-251.6, 339.9],
      },
    };
    for (const [fit, sizes] of Object.entries(CHROME)) {
      it.each(Object.entries(sizes))(`${fit} at %s`, (size, [cx, cy]) => {
        const [w, h] = size.split('x').map(Number);
        const attrs = { ...rootAttrs, preserveAspectRatio: `xMidYMid ${fit}` };
        const spec = specTransform({ w, h }, attrs).to(326, 397);
        const page = pageGeometry(w, h, attrs).inBox(326 / MAP_W, 397 / MAP_H);
        for (const got of [spec, page]) {
          expect(Math.abs(got.x - cx), `x ${got.x.toFixed(2)} against Chrome's ${cx}`).toBeLessThan(0.15);
          expect(Math.abs(got.y - cy), `y ${got.y.toFixed(2)} against Chrome's ${cy}`).toBeLessThan(0.15);
        }
      });
    }
  });

  describe('the frame the level asks for', () => {
    // placePins() puts translate(tx,ty) scale(k) on the SVG and the pins on the stage at
    // fracToScreen(). They have to be the same point: a pin on the zoomed drawing is
    // tx + k times where the SVG put it in its box.
    it.each([0, 3, 6, 10].flatMap((level) => STAGES.slice(1, 6).map(([n, w, h]) => [level, n, w, h] as const)))(
      'level %i, %s (%i x %i)',
      (level, _name, w, h) => {
        const page = pageGeometry(w, h, rootAttrs);
        const extent = mapExtentFor(level);
        page.setExtent(extent);
        const t = page.transform();
        const inBox = specTransform({ w, h }, rootAttrs); // the SVG in its box, before the CSS transform
        for (const d of DESTINATIONS) {
          const box = inBox.to(d.fx * MAP_W, d.fy * MAP_H);
          const want = { x: t.tx + t.k * box.x, y: t.ty + t.k * box.y };
          const got = page.pin(d.fx, d.fy);
          expect(Math.abs(got.x - want.x), `${d.id} x`).toBeLessThan(1e-6);
          expect(Math.abs(got.y - want.y), `${d.id} y`).toBeLessThan(1e-6);
        }
        // The frame is centred on the extent.
        const c = page.pin(extent.cx, extent.cy);
        expect(c.x).toBeCloseTo(w / 2, 6);
        expect(c.y).toBeCloseTo(h / 2, 6);
      },
    );

    it('is the same on the second call: a resize does not undo the frame', () => {
      const page = pageGeometry(874, 402, rootAttrs);
      page.setExtent(mapExtentFor(0));
      const first = page.transform();
      const second = page.transform();
      expect(second).toEqual(first);
    });
  });

  describe('the pages wire it up and do not carry their own copy', () => {
    it('map.html loads map-fit.js and asks the SVG, with no viewBox or fit of its own', () => {
      expect(mapHtml).toMatch(/<script src="map-fit\.js"><\/script>/);
      expect(mapHtml).toMatch(/MapFit\.readRoot\(/);
      expect(mapHtml).toMatch(/MapFit\.place\(/);
      expect(mapHtml, 'map.html holds the viewBox again').not.toMatch(/SVG_VIEW_[WH]\s*=\s*\d/);
      expect(mapHtml, 'map.html computes its own contain/cover').not.toMatch(/Math\.(min|max)\(\s*r\.width/);
    });

    it('intro.html does the same for its stamp', () => {
      expect(introHtml).toMatch(/<script src="map-fit\.js"><\/script>/);
      expect(introHtml).toMatch(/MapFit\.readRoot\(/);
      expect(introHtml, 'intro.html holds the viewBox again').not.toMatch(/SVG_VIEW_[WH]\s*=\s*\d/);
    });
  });

  describe('map-fit.js reads the attribute', () => {
    it('parses the forms the SVG allows', () => {
      expect(MapFit.parsePreserveAspectRatio('xMidYMid meet')).toEqual({ alignX: 0.5, alignY: 0.5, slice: false });
      expect(MapFit.parsePreserveAspectRatio('xMinYMax slice')).toEqual({ alignX: 0, alignY: 1, slice: true });
      expect(MapFit.parsePreserveAspectRatio('xMidYMid')).toEqual({ alignX: 0.5, alignY: 0.5, slice: false });
      expect(MapFit.parsePreserveAspectRatio('none').alignX).toBeNull();
      expect(MapFit.parsePreserveAspectRatio(null)).toEqual({ alignX: 0.5, alignY: 0.5, slice: false });
      expect(MapFit.parsePreserveAspectRatio('nonsense slice')).toEqual({ alignX: 0.5, alignY: 0.5, slice: false });
      expect(MapFit.parseViewBox('0,0,1800,1121')).toEqual({ x: 0, y: 0, w: 1800, h: 1121 });
      expect(MapFit.parseViewBox('0 0 0 10')).toBeNull();
      expect(MapFit.readRoot({ localName: 'html', getAttribute: () => null })).toBeNull();
    });
  });
});
