// trikey-routes.check.mjs — Trikey's routes in the drive spike keep off the A28.
//
//   node apps/game/public/admin/drive-spike/trikey-routes.check.mjs [trips]
//
// The rule (Marcus 15D/18A; docs/driving-rebuild-2026-10-11.md, "The A28 as
// it really is"): Trikey never rides along the A28, crosses its 30-40 mph
// stretches only at the lights or a zebra, and its dual carriageway only by a
// bridge or tunnel (there are none). The spike routes her over her own graph
// (trikey-roads.js, the game's trikey-links.ts in plain JS). This walks:
//   - every ordered pair of the 15 places: each she can reach is routed and
//     judged by a28Breaches, from the game graph's own A28 edges and the
//     data's junction sides (a step along a trunk edge, a step across an A28
//     edge's line anywhere but at a permitted crossing, or passing through an
//     A28 junction from one side to the other), and no step is a trunk edge
//     of her graph;
//   - the page's own pick of a drive (pickTrip), [trips] times, each
//     following on from where the last pulled up as the page does: every
//     destination is one she can reach, every route is judged the same way;
//   - as drawn: where the page draws and drives her route (clearOfA28, the
//     A28 at the page's widths), no metre of it but the crossing at the
//     lights itself lies on the A28.
// Fails on any breach, if a place she cannot reach is ever picked, or if any
// of her riding is drawn on the A28.
import { readFileSync } from 'node:fs';
import * as trikeyRoads from './trikey-roads.js';

const TRIPS = Number(process.argv[2] ?? 2000);
const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const base = load('../../assets/driving/birchie-graph.json');
const links = load('../../assets/driving/trikey-links.json');
const cwJson = load('../../assets/driving/trunk-carriageways.json');
const R = trikeyRoads.create(base, links);
const { tg } = R;

const fail = [];
const edgeClass = new Map();
for (const [a, b, c] of tg.edges) { edgeClass.set(a * 8192 + b, c); edgeClass.set(b * 8192 + a, c); }
// The page's A28 widths (drive-spike.html roadWidth): the dual 4 lanes of
// 5 m and a 1.6 m strip; divided, its lanes each way of 5 m and a 1.2 m
// island; single, a 10 m main road. A trunk edge with no record is a dual.
const cwRec = new Map();
for (const c of cwJson.edges) {
  const e = base.edges[c.edge];
  if (e && e[2] === 'trunk' && e[0] === c.nodes[0] && e[1] === c.nodes[1]) cwRec.set(c.edge, c);
}
const trunkHalf = k => {
  const c = cwRec.get(k);
  if (!c || c.kind === 'dual') return (4 * 5 + 1.6) / 2;
  if (c.kind === 'divided') return (2 * Math.max(1, c.lanes) * 5 + 1.2) / 2;
  return 10 / 2;
};
const ASPECT = 1800 / 1121, MPU = 3900;
const shown = trikeyRoads.clearOfA28(R, trunkHalf, (fx, fy) => ({ x: fx * ASPECT * MPU, y: fy * MPU }));
const drawn = { metres: 0, onA28: 0, worst: [], over: new Map() };

function judge(path, label, stats) {
  for (let i = 1; i < path.length; i++) {
    const c = edgeClass.get(path[i - 1] * 8192 + path[i]);
    if (c === undefined) fail.push(`${label}: step ${path[i - 1]}-${path[i]} is not an edge of her graph`);
    else if (c === 'trunk') fail.push(`${label}: rides a trunk edge ${path[i - 1]}-${path[i]}`);
    if (c === trikeyRoads.CROSSING_CLASS) {
      const x = tg.crossings.find(k => (k.north === path[i - 1] && k.south === path[i]) || (k.south === path[i - 1] && k.north === path[i]));
      stats.crossings.set(x.id, (stats.crossings.get(x.id) ?? 0) + 1);
      stats.crossingKinds.add(`${x.id} ${x.type} on the ${x.stretch} stretch`);
    }
    if (c && c !== 'trunk') stats.classes[trikeyRoads.drivingClass(c)] = (stats.classes[trikeyRoads.drivingClass(c)] ?? 0) + 1;
  }
  for (const why of trikeyRoads.a28Breaches(R, path)) fail.push(`${label}: ${why}`);
  // As drawn, the page's way over a crossing included (crossingPath): every
  // metre but the straight walk over at the lights.
  let on = 0;
  for (let i = 1; i < path.length; i++) {
    const via = shown.crossingPath(path[i - 1], path[i]);
    const pts = [shown.routeAt(path[i - 1]), ...(via ? via.pts : []), shown.routeAt(path[i])];
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k - 1], q = pts[k], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (via && k === via.over + 1) {
        const id = tg.crossings.find(c => (c.north === path[i - 1] && c.south === path[i]) || (c.south === path[i - 1] && c.north === path[i])).id;
        drawn.over.set(id, L);
        continue;
      }
      for (let u = 0.5; u < L; u += 1) {
        drawn.metres++;
        if (shown.insideA28(p[0] + (q[0] - p[0]) * u / L, p[1] + (q[1] - p[1]) * u / L)) on++;
      }
    }
  }
  if (on) { drawn.onA28 += on; if (drawn.worst.length < 5) drawn.worst.push(`${label} ${on} m`); }
}

// ---- every pair of places
const places = Object.keys(tg.anchors);
const pairs = { all: 0, reachable: 0, routed: 0 };
const stats = { crossings: new Map(), crossingKinds: new Set(), classes: {} };
const islands = new Map();
for (const from of places) {
  const reach = trikeyRoads.reachableFrom(R, from);
  const key = [from, ...reach].sort().join(', ');
  islands.set(key, true);
  for (const to of places) {
    if (to === from) continue;
    pairs.all++;
    if (!reach.includes(to)) {
      if (trikeyRoads.shortestPath(R.adj, tg.anchors[from], tg.anchors[to])) fail.push(`${from} -> ${to}: routed although not reachable`);
      continue;
    }
    pairs.reachable++;
    const path = trikeyRoads.shortestPath(R.adj, tg.anchors[from], tg.anchors[to]);
    if (!path) { fail.push(`${from} -> ${to}: reachable but no route`); continue; }
    pairs.routed++;
    judge(path, `${from} -> ${to}`, stats);
  }
}

// ---- the page's own picks, one drive after another
let s = 12345;
const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const picked = new Map();
let fromId = null, trips = 0;
const tripStats = { crossings: new Map(), crossingKinds: new Set(), classes: {} };
for (let i = 0; i < TRIPS; i++) {
  const trip = trikeyRoads.pickTrip(R, rand, fromId);
  if (!trip) { fail.push(`pickTrip found no drive from ${fromId}`); break; }
  if (!trikeyRoads.reachableFrom(R, trip.from).includes(trip.to)) fail.push(`picked ${trip.from} -> ${trip.to}, out of her reach`);
  judge(trip.path, `trip ${i} ${trip.from} -> ${trip.to}`, tripStats);
  picked.set(trip.to, (picked.get(trip.to) ?? 0) + 1);
  trips++;
  // As the page: the next drive sets off from where this one pulled up, and
  // now and then the route button starts a fresh one anywhere.
  fromId = rand() < 0.8 ? trip.to : null;
}

const unreachable = places.filter(p => !places.some(q => q !== p && trikeyRoads.reachableFrom(R, q).includes(p)));
console.log(`trikey-routes.check: her graph ${tg.nodes.length} nodes, ${tg.edges.length} edges (no trunk), ${tg.crossings.length} crossings she may use`);
for (const c of tg.crossings) console.log(`  crossing ${c.id}: ${c.type} on the A28's ${c.stretch} stretch, ${c.pavementM} m of pavement`);
console.log(`  places she can ride between, as islands: ${[...islands.keys()].filter(k => k.includes(',')).map(k => '[' + k + ']').join(' ')}`);
console.log(`  places out of her reach from anywhere: ${unreachable.join(', ') || 'none'}`);
console.log(`  every pair: ${pairs.all} ordered pairs, ${pairs.reachable} in her reach, ${pairs.routed} routed and judged; steps by class ${JSON.stringify(stats.classes)}; over a crossing ${[...stats.crossings].map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}`);
console.log(`  the page's picks: ${trips} drives, to ${[...picked].map(([k, v]) => `${k} ${v}`).join(', ')}; steps by class ${JSON.stringify(tripStats.classes)}; over a crossing ${[...tripStats.crossings].map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}`);
console.log(`  as drawn: ${drawn.metres} m of her routes, on the A28 (outside the crossings at the lights) ${drawn.onA28} m${drawn.worst.length ? ': ' + drawn.worst.join(', ') : ''}; straight over at the lights ${[...drawn.over].map(([k, v]) => `${k} ${v.toFixed(1)} m`).join(', ')}`);
if (drawn.onA28) fail.push(`${drawn.onA28} m of her riding is drawn on the A28`);
console.log(`  A28 breaches: ${fail.length}`);
for (const f of fail.slice(0, 20)) console.log('   ', f);
if (!pairs.routed) fail.push('no pair was routed: the check did not exercise anything');
if (fail.length) { console.log('FAIL'); process.exit(1); }
console.log('PASS: no Trikey route rides along the A28 or crosses it anywhere but at the lights, and every drive picked is one she can reach.');
