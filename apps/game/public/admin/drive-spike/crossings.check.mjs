// crossings.check.mjs — proof that no animal is ever touched.
//
//   node apps/game/public/admin/drive-spike/crossings.check.mjs
//
// Drives crossings.js with seeded random inputs (throttle held and released,
// gears, handbrake, lane swaps, some drivers who watch the road and some who
// do not) for 50 seeds x 20 simulated minutes on synthetic routes that mix
// small roads with main roads and a dual carriageway, laid across the child's
// map so the species follow its fields, woods and water, in every season.
// Then 12 seeds on real routes of the Birchie graph. The van is stepped as
// drive-spike.html's step() does it, self-stop included, and the contact test
// is in world space: the van's rectangle against every animal's body as
// drawn (crossings.js draws them at storybook size, side on and upright on
// the screen, with a glow under each, and that box is what a child sees the
// van stop short of). The page's camera is stepped too, since a side-on
// animal's box is square to it; a third of the drivers hold the phone
// sideways.
//
// Asserts: no contact ever; crossings only on residential, unclassified and
// track; no hedgehog in winter; ducklings only in spring. Prints the counts.

import * as crossings from './crossings.js';
import { readFileSync } from 'node:fs';

// ----------------------------------------------------- the page's constants

const ASPECT = 1800 / 1121, METRES_PER_UNIT = 3900;
const ROAD_M = { secondary: 10, tertiary: 10, unclassified: 9, residential: 8, track: 5 };
const LANE_M = 5, TRUNK_LANE_M = 5, RESERVATION_M = 1.6, TRUNK_M = 4 * TRUNK_LANE_M + RESERVATION_M;
const roadWidth = cls => cls === 'trunk' ? TRUNK_M : (ROAD_M[cls] ?? 8);
const GEARS = { 1: 7, 2: 13, 3: 20 };
const ACCEL = 9, BRAKE = 14, HANDBRAKE = 34, EMERGENCY = 26;
const PULL_UP = 2.5, STOP_SHORT_M = 6, ARRIVED_WAIT_S = 3.5;
const VAN_W = 2.4, VAN_L = 2.4 * 1131 / 561;   // henry's top-down sprite aspect
const METRES_PER_MAP_PX = METRES_PER_UNIT / 1121;
const mapToWorld = (px, py) => ({ x: px * METRES_PER_MAP_PX, y: py * METRES_PER_MAP_PX });
const SMALL = new Set(['residential', 'unclassified', 'track']);
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------- route, as the page builds it

function makeRoute(graph, path, edgeCls) {
  const pts = path.map(i => ({ x: graph.nodes[i][0] * ASPECT * METRES_PER_UNIT, y: graph.nodes[i][1] * METRES_PER_UNIT, s: 0 }));
  for (let i = 1; i < pts.length; i++) {
    pts[i].s = pts[i - 1].s + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    pts[i].cls = edgeCls.get(path[i - 1] * 4096 + path[i]) ?? 'tertiary';
  }
  pts[0].cls = pts[1].cls;
  const seg = s => { let i = 1; while (i < pts.length - 1 && pts[i].s < s) i++; return i; };
  const classAtS = s => pts[Math.min(seg(s), pts.length - 1)].cls;
  const atDistance = s => {
    if (s <= 0) return { x: pts[0].x, y: pts[0].y, h: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) };
    const i = seg(s), a = pts[i - 1], b = pts[i], t = (s - a.s) / Math.max(1e-6, b.s - a.s);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  const laneOffset = (lane, s) => {
    const cls = s == null ? null : classAtS(s);
    if (cls === 'trunk') return -(RESERVATION_M / 2 + (lane === 0 ? 1.5 : 0.5) * TRUNK_LANE_M);
    if (cls === 'track') return 0;
    const q = (cls ? roadWidth(cls) : 2 * LANE_M) / 4;
    return lane === 0 ? -q : q;
  };
  return { length: pts[pts.length - 1].s, atDistance, laneOffset, roadClassAt: classAtS, laneWidth: LANE_M };
}

/** A serpentine across the map: rows ~5 km long joined by short climbs, the
 *  road class changing every 0.5-1.2 km, a gentle kink now and then (so there
 *  are corners near crossings), nodes every ~48 m as in the real graph. */
function syntheticGraph(seed) {
  const r = rng(seed * 7 + 1);
  const CLASSES = ['tertiary', 'residential', 'unclassified', 'track', 'secondary', 'unclassified', 'trunk', 'residential', 'track'];
  const nodes = [], edges = [], path = [];
  const y0 = 250 + r() * 300, rowGap = 180 + r() * 250;
  let x = 250 + r() * 200, y = y0, dir = 1, row = 0, cls = CLASSES[0], left = 0;
  const push = (px, py) => { nodes.push([px / (ASPECT * METRES_PER_UNIT), py / METRES_PER_UNIT]); return nodes.length - 1; };
  let prev = push(x, y);
  path.push(prev);
  while (row < 6 && y < 3700) {
    const climbing = (dir > 0 && x > 5900) || (dir < 0 && x < 300);
    let nx = x, ny = y;
    if (climbing) { ny += 48; if (ny - (y0 + row * rowGap) >= rowGap) { row++; dir = -dir; } }
    else { nx += dir * 48; ny += (r() < 0.12 ? (r() - 0.5) * 40 : 0); }
    if (left <= 0) { cls = CLASSES[(r() * CLASSES.length) | 0]; left = 500 + r() * 700; }
    left -= 48;
    const id = push(nx, ny);
    edges.push([prev, id, cls]);
    path.push(id);
    prev = id; x = nx; y = ny;
  }
  return { graph: { nodes, edges, anchors: {} }, path };
}

function edgeClasses(graph) {
  const m = new Map();
  for (const [i, j, c] of graph.edges) { m.set(i * 4096 + j, c); m.set(j * 4096 + i, c); }
  return m;
}

// ---------------------------------------------------------------- the van

function newCar() { return { s: 0, lane: 0, laneT: 0, base: null, laneWant: 0, v: 0, gear: 2, length: VAN_L, width: VAN_W, camH: null }; }

/** drive-spike.html's step(), less the camera: the same order, the same caps. */
function stepCar(car, route, xing, dt, input, stats) {
  const x = crossings.step(xing, dt, car);
  const cap = x.speedCap;
  stats.praised += x.events.length;   // its only event is the thanks for stopping
  const toGo = route.length - car.s;
  const arriveCap = Math.sqrt(2 * PULL_UP * Math.max(0, toGo - STOP_SHORT_M));
  const target = Math.min(input.throttle ? GEARS[car.gear] : 0, arriveCap);
  if (car.v > cap) { car.v = Math.max(cap, car.v - EMERGENCY * dt); stats.emergencyFrames++; }
  else if (input.handbrake) car.v = Math.max(0, car.v - HANDBRAKE * dt);
  else if (car.v < target) car.v = Math.min(target, cap, car.v + ACCEL * dt);
  else car.v = Math.max(target, car.v - BRAKE * dt);
  car.s = Math.min(route.length - STOP_SHORT_M, car.s + car.v * dt);

  const off0 = route.laneOffset(0, car.s), off1 = route.laneOffset(1, car.s);
  const span = Math.abs(off1 - off0) || LANE_M;
  const stepT = 7 * dt / span;
  car.laneT += Math.max(-stepT, Math.min(stepT, car.laneWant - car.laneT));
  if (car.base == null) car.base = off0;
  car.base += Math.max(-4 * dt, Math.min(4 * dt, off0 - car.base));
  car.lane = car.base + car.laneT * (off1 - off0);
  // What the page's camera shows ahead of the van at the zoom for this
  // speed, less the page's easing: upright on a 390x844 phone, or held
  // sideways (844x390: the van lower, the camera pulled back by 0.75).
  // crossings.js waits for an animal to be on screen, below the chips,
  // before it steps out.
  const zoom = 1.35 + (0.66 - 1.35) * Math.min(1, car.v / GEARS[3]);
  const ppm = 22 * zoom * (car.sideways ? 0.75 : 1);
  car.view = { ahead: (car.sideways ? 254.4 : 408.28) / ppm, ppm, chipsPx: car.sideways ? 68 : 104 };
  const pos = route.atDistance(car.s);
  // The page's camera: aimed at the route 20 m ahead, eased at 3.4 a second.
  const aheadP = route.atDistance(Math.min(route.length - 1, car.s + 20));
  const aim = Math.atan2(aheadP.y - pos.y, aheadP.x - pos.x);
  if (car.camH == null) car.camH = aim;
  else { const d = aim - car.camH; car.camH += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, 3.4 * dt); }
  car.x = pos.x + Math.cos(pos.h + Math.PI / 2) * car.lane;
  car.y = pos.y + Math.sin(pos.h + Math.PI / 2) * car.lane;
  car.h = pos.h;
  return toGo <= STOP_SHORT_M + 0.5 && car.v < 0.2;
}

/** The four corners of a box len x wid centred on (x, y), turned to h. */
function corners(x, y, h, len, wid) {
  const c = Math.cos(h), s = Math.sin(h), l = len / 2, w = wid / 2;
  return [[l, w], [-l, w], [-l, -w], [l, -w]].map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
}
function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
/** Do two convex quads overlap? Separating axes: their edge normals. */
function overlap(A, B) {
  for (const Q of [A, B]) for (let i = 0; i < 4; i++) {
    const [ax, ay] = Q[i], [bx, by] = Q[(i + 1) % 4], nx = ay - by, ny = bx - ax;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, y] of A) { const d = x * nx + y * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const [x, y] of B) { const d = x * nx + y * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}
/** Clearance from the van's rectangle to the animal's drawn box, metres, as
 *  crossings.animals() gives it this frame (turn, waddle and all); <= 0 is
 *  contact. Exact for two convex quads apart: the nearest pair is a corner of
 *  one against an edge of the other. */
function clearance(car, a) {
  // Far apart, the bounding circles' gap is near enough and much cheaper.
  const far = Math.hypot(a.x - car.x, a.y - car.y) - Math.hypot(car.length, car.width) / 2 - Math.hypot(a.len, a.wid) / 2;
  if (far > 3) return far;
  const V = corners(car.x, car.y, car.h, car.length, car.width), A = corners(a.x, a.y, a.h, a.len, a.wid);
  if (overlap(V, A)) return 0;
  let best = Infinity;
  for (const [P, Q] of [[V, A], [A, V]]) for (const p of P) for (let i = 0; i < 4; i++) best = Math.min(best, segDist(p, Q[i], Q[(i + 1) % 4]));
  return best;
}

// --------------------------------------------------------------- the driving

const totals = {
  seeds: 0, minutes: 0, routes: 0, crossings: 0, crossed: 0, late: 0, sleeping: 0,
  praised: 0, selfStops: 0, emergencyFrames: 0, families: 0, contacts: 0, minClear: Infinity, skew: 0, minClearSide: {}, lateBy: {},
  offSmall: 0, winterHogs: 0, ducklingsOutOfSpring: 0, bySpecies: {}, byPlace: {}, bySeason: {}, bodies: {},
};
const fail = [];

function drive(seed, newRouteFn, season, label) {
  const r = rng(seed * 31 + 5);
  const watchful = r();                      // how often this driver watches the road
  const stats = { praised: 0, emergencyFrames: 0 };
  let { route } = newRouteFn(r);
  const world = () => ({ graph: newRouteFn.graph(), mapToWorld, season });
  let xing = crossings.create(route, world());
  const car = newCar();
  car.sideways = seed % 3 === 0;
  const input = { throttle: false, handbrake: false };
  let tInput = 0, arrivedFor = 0, t = 0;
  const T = 20 * 60;
  const counted = new Set();
  const seasonCount = totals.bySeason[season] ??= 0;

  const account = (xg) => {
    for (const c of xg.crossings) {
      if (counted.has(c)) continue;
      counted.add(c);
      totals.crossings++;
      if (!SMALL.has(route.roadClassAt(c.s)) || !SMALL.has(c.cls)) { totals.offSmall++; fail.push(`${label}: crossing on ${route.roadClassAt(c.s)} at ${c.s.toFixed(0)}`); }
      if (season === 'winter' && c.party.some(a => a.kind === 'hedgehog')) { totals.winterHogs++; fail.push(`${label}: hedgehog in winter`); }
      if (season !== 'spring' && c.party.some(a => a.kind === 'duckling')) { totals.ducklingsOutOfSpring++; fail.push(`${label}: ducklings in ${season}`); }
      if (!c.party.length) totals.sleeping++;
      totals.byPlace[c.place] = (totals.byPlace[c.place] ?? 0) + 1;
    }
  };
  const settle = (xg) => {
    for (const c of xg.crossings) {
      if (c.state === 'gone' && !c._tallied) { c._tallied = true; if (c.forced) totals.selfStops++; }
      if (c.state === 'gone' || (c.state === 'go' && c.script)) {
        if (c._done) continue; c._done = true;
        totals.crossed++;
        totals.bySpecies[c.species] = (totals.bySpecies[c.species] ?? 0) + 1;
        totals.bySeason[season]++;
        if (c.party.some(a => a.kind === 'duckling')) totals.families++;
        if (c._late) totals.late++;
      }
      if (c.state === 'late' && !c._late) { c._late = true; const k = `${c.species} ${car.sideways ? 'sideways' : 'upright'}`; totals.lateBy[k] = (totals.lateBy[k] ?? 0) + 1; }
    }
  };
  account(xing);
  totals.routes++;

  while (t < T) {
    const dt = 1 / 120 + r() * (0.05 - 1 / 120);
    t += dt;
    // Inputs: throttle held and let go, gears, the odd handbrake, lane swaps.
    tInput -= dt;
    if (tInput <= 0) {
      input.throttle = r() < 0.78;
      input.handbrake = !input.throttle && r() < 0.15;
      tInput = input.throttle ? 0.5 + r() * 12 : 0.2 + r() * 3;
      if (r() < 0.3) car.gear = 1 + ((r() * 3) | 0);
      if (r() < 0.25) car.laneWant = r() < 0.5 ? 0 : 1;
    }
    // A watching driver lets go and brakes on seeing an animal step out.
    let held = input.throttle, hb = input.handbrake;
    if (r() < watchful) {
      for (const c of xing.crossings) {
        const gap = c.s - (car.s + car.length / 2);
        if (c.state === 'go' && c.blocking && gap > 0 && gap < 30) { held = false; hb = gap < 6; }
      }
    }
    const arrived = stepCar(car, route, xing, dt, { throttle: held, handbrake: hb }, stats);

    for (const a of crossings.animals(xing, car.camH)) {
      if (!(a.len > 0 && a.wid > 0)) { totals.contacts++; fail.push(`${label}: ${a.kind} has no drawn body`); continue; }
      totals.bodies[a.kind] ??= `${a.len.toFixed(2)}x${a.wid.toFixed(2)} m`;
      const cl = clearance(car, a);
      if (a.crossing.state === 'go' && cl < totals.minClear) totals.minClear = cl;
      if (a.crossing.state === 'go' && a.crossing.blocking) {
        const k = car.sideways ? 'sideways' : 'upright';
        totals.minClearSide[k] = Math.min(totals.minClearSide[k] ?? Infinity, cl);
        if (cl < 6) { const d = car.camH - a.crossing.h; totals.skew = Math.max(totals.skew, Math.abs(Math.atan2(Math.sin(d), Math.cos(d)))); }
      }
      if (cl <= 0) { totals.contacts++; fail.push(`${label}: contact with ${a.kind} at t=${t.toFixed(1)} s=${car.s.toFixed(1)} v=${car.v.toFixed(2)}`); }
    }
    settle(xing);

    // Arrival, then a new route from there; now and then a jump onto a fresh
    // route part way along, as the page's "to big road" button does.
    const jump = r() < 1 / (60 * 60 * 3);   // about every three minutes at 60 fps
    if (arrived) arrivedFor += dt;
    if (arrivedFor > ARRIVED_WAIT_S || jump) {
      ({ route } = newRouteFn(r));
      xing = crossings.create(route, world());
      account(xing); totals.routes++;
      Object.assign(car, newCar(), { gear: car.gear });
      if (jump) car.s = r() * route.length * 0.8;
      arrivedFor = 0;
    }
  }
  totals.praised += stats.praised;
  totals.emergencyFrames += stats.emergencyFrames;
  totals.seeds++; totals.minutes += T / 60;
}

// 50 seeds on synthetic routes, every season.
for (let seed = 1; seed <= 50; seed++) {
  let g = null;
  const fn = (r) => {
    const syn = syntheticGraph(seed * 1000 + ((r() * 1e6) | 0));
    g = syn.graph;
    return { route: makeRoute(g, syn.path, edgeClasses(g)) };
  };
  fn.graph = () => g;
  drive(seed, fn, SEASONS[seed % 4], `synthetic seed ${seed}`);
}

// 12 seeds on real Birchie routes, random destinations, like pickRoute().
const real = JSON.parse(readFileSync(new URL('../../assets/driving/birchie-graph.json', import.meta.url)));
const realCls = edgeClasses(real);
const adj = real.nodes.map(() => []);
for (const [i, j] of real.edges) {
  if (!real.nodes[i] || !real.nodes[j]) continue;
  const w = Math.hypot((real.nodes[i][0] - real.nodes[j][0]) * ASPECT, real.nodes[i][1] - real.nodes[j][1]);
  adj[i].push([j, w]); adj[j].push([i, w]);
}
function shortestPath(s, t) {
  const n = adj.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  dist[s] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === t) break;
    done[u] = 1;
    for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  if (dist[t] === Infinity) return null;
  const p = []; for (let v = t; v >= 0; v = prev[v]) p.push(v);
  return p.reverse();
}
const ids = Object.keys(real.anchors);
for (let seed = 101; seed <= 112; seed++) {
  const fn = (r) => {
    for (;;) {
      const a = ids[(r() * ids.length) | 0], b = ids[(r() * ids.length) | 0];
      if (a === b) continue;
      const p = shortestPath(real.anchors[a], real.anchors[b]);
      if (p && p.length >= 12) return { route: makeRoute(real, p, realCls) };
    }
  };
  fn.graph = () => real;
  drive(seed, fn, SEASONS[seed % 4], `birchie seed ${seed}`);
}

console.log(`seeds ${totals.seeds} (50 synthetic + 12 on the Birchie graph), ${totals.minutes} simulated minutes, ${totals.routes} routes`);
console.log(`crossing places on the routes driven ${totals.crossings} (${totals.sleeping} hedgehog places asleep in winter), animals crossed ${totals.crossed}`);
console.log(`by species ${JSON.stringify(totals.bySpecies)}`);
console.log(`mother ducks leading ducklings (spring) ${totals.families}`);
console.log(`by place ${JSON.stringify(totals.byPlace)}`);
console.log(`crossed by season ${JSON.stringify(totals.bySeason)}`);
console.log(`she stopped by herself ${totals.praised}, the van stopped itself ${totals.selfStops} (${totals.emergencyFrames} hard-braking frames), crossed behind the van ${totals.late}`);
console.log(`crossed behind the van, by species and how the phone was held ${JSON.stringify(totals.lateBy)}`);
console.log(`contacts ${totals.contacts}, closest the van came to a crossing animal's drawn body ${totals.minClear.toFixed(2)} m`);
console.log(`closest while it blocked the road: upright ${totals.minClearSide.upright?.toFixed(2)} m, sideways ${totals.minClearSide.sideways?.toFixed(2)} m; the camera turned at most ${totals.skew.toFixed(2)} rad off a crossing's line within 6 m of it (crossings.js allows ${crossings.CAMERA_SKEW})`);
console.log(`drawn bodies measured (box across x along, first seen): ${Object.entries(totals.bodies).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`crossings off the small roads ${totals.offSmall}, hedgehogs in winter ${totals.winterHogs}, ducklings outside spring ${totals.ducklingsOutOfSpring}`);
if (totals.skew > crossings.CAMERA_SKEW) fail.push(`the camera turned ${totals.skew.toFixed(2)} rad off a crossing, more than crossings.js's CAM_SKEW allows for`);
if (fail.length || !totals.crossed || !totals.selfStops || !totals.praised || !totals.families) {
  console.error('FAIL\n' + fail.slice(0, 20).join('\n'));
  if (!totals.crossed || !totals.selfStops || !totals.praised || !totals.families) console.error('the check did not exercise crossings, self-stops and praise');
  process.exit(1);
}
console.log('PASS');
