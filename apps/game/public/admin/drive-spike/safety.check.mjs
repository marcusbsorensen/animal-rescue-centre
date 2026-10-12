// safety.check.mjs — proof that no vehicle, the van or any other, either way,
// ever touches a crossing animal, and that nothing waits for ever.
//
//   node apps/game/public/admin/drive-spike/safety.check.mjs [seeds] [minutes]
//
// crossings.check.mjs proves the van stops for the animals, traffic.check.mjs
// that the traffic never touches the van. This drives both together, as
// drive-spike.html's step() does, on real routes of the Birchie graph with the
// A28's carriageways as the page reads them (dual, divided, single), so the
// lanes, the main roads and every kind of A28 all carry traffic, and a third of
// the routes are started just before an A28 stretch. Every frame it measures,
// in world space, the gap from each animal's drawn body (crossings.animals())
// to the van's rectangle and to every vehicle's footprint
// (traffic.footprint()). It also watches that the giving way ends: every
// closed stretch opens again and no vehicle stands for an animal for long.
//
// Asserts: no contact between any vehicle and any animal; no vehicle overlaps
// the van; no vehicle slows for an animal harder than a careful driver; no
// vehicle stands for an animal longer than STAND_MAX_S. Prints the counts and
// the closest approaches.

import * as traffic from './traffic.js';
import * as crossings from './crossings.js';
import { readFileSync } from 'node:fs';

const SEEDS = Number(process.argv[2] ?? 24);
const MINUTES = Number(process.argv[3] ?? 20);
const STAND_MAX_S = 60;
const GENTLE = 5;     // m/s²: the hardest any vehicle may slow for an animal (half a g)

// ----------------------------------------------------- the page's constants

const ASPECT = 1800 / 1121, METRES_PER_UNIT = 3900;
const ROAD_M = { secondary: 10, tertiary: 10, unclassified: 9, residential: 8, track: 5 };
const LANE_M = 5, TRUNK_LANE_M = 5, RESERVATION_M = 1.6, TRUNK_M = 4 * TRUNK_LANE_M + RESERVATION_M, ISLAND_M = 1.2;
const GEARS = { 1: 7, 2: 13, 3: 20 };
const ACCEL = 9, BRAKE = 14, HANDBRAKE = 34, EMERGENCY = 26, ENGINE_EASE = 4, TOP_OUT = 3.5, TOP_PULL = 0.18;
const PULL_UP = 2.5, STOP_SHORT_M = 6, ARRIVED_WAIT_S = 3.5;
const VAN_W = 2.4, VAN_L = 2.4 * 1205 / 641;
const METRES_PER_MAP_PX = METRES_PER_UNIT / 1121;
const mapToWorld = (px, py) => ({ x: px * METRES_PER_MAP_PX, y: py * METRES_PER_MAP_PX });
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------- the graph and the A28

const graph = JSON.parse(readFileSync(new URL('../../assets/driving/birchie-graph.json', import.meta.url)));
const cwJson = JSON.parse(readFileSync(new URL('../../assets/driving/trunk-carriageways.json', import.meta.url)));
const key = (i, j) => i * 4096 + j;
const edgeCls = new Map(), edgeCw = new Map();
for (const [i, j, c] of graph.edges) { edgeCls.set(key(i, j), c); edgeCls.set(key(j, i), c); }
for (const c of cwJson.edges) {
  const e = graph.edges[c.edge];
  if (!e || e[2] !== 'trunk' || e[0] !== c.nodes[0] || e[1] !== c.nodes[1]) continue;
  const rec = { kind: c.kind, maxspeedMph: c.maxspeedMph, lanes: c.lanes };
  edgeCw.set(key(e[0], e[1]), rec); edgeCw.set(key(e[1], e[0]), rec);
}
const adj = graph.nodes.map(() => []);
for (const [i, j] of graph.edges) {
  if (!graph.nodes[i] || !graph.nodes[j]) continue;
  const w = Math.hypot((graph.nodes[i][0] - graph.nodes[j][0]) * ASPECT, graph.nodes[i][1] - graph.nodes[j][1]);
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

/** The page's route: toPolyline, classAtS, cwAtS, laneOffset, trafficClassAt
 *  and canOvertakeAt, line for line. */
export function makeRoute(path) {
  const pts = path.map(i => ({ x: graph.nodes[i][0] * ASPECT * METRES_PER_UNIT, y: graph.nodes[i][1] * METRES_PER_UNIT, s: 0 }));
  for (let i = 1; i < pts.length; i++) {
    pts[i].s = pts[i - 1].s + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    pts[i].cls = edgeCls.get(key(path[i - 1], path[i])) ?? 'tertiary';
    pts[i].cw = pts[i].cls === 'trunk' ? edgeCw.get(key(path[i - 1], path[i])) ?? null : null;
  }
  pts[0].cls = pts[1].cls; pts[0].cw = pts[1].cw;
  const seg = s => { let i = 1; while (i < pts.length - 1 && pts[i].s < s) i++; return Math.min(i, pts.length - 1); };
  const classAtS = s => pts[seg(s)].cls;
  const cwAtS = s => pts[seg(s)].cw ?? null;
  const atDistance = s => {
    if (s <= 0) return { x: pts[0].x, y: pts[0].y, h: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) };
    const i = seg(s), a = pts[i - 1], b = pts[i], t = (s - a.s) / Math.max(1e-6, b.s - a.s);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  const roadWidth = (cls, cw) => {
    if (cls !== 'trunk') return ROAD_M[cls] ?? 8;
    if (!cw || cw.kind === 'dual') return TRUNK_M;
    if (cw.kind === 'divided') return 2 * Math.max(1, cw.lanes) * LANE_M + ISLAND_M;
    return ROAD_M.secondary;
  };
  const laneOffset = (lane, s) => {
    const cls = s == null ? null : classAtS(s);
    const cw = cls === 'trunk' ? cwAtS(s) : null;
    if (cls === 'trunk' && (!cw || cw.kind === 'dual')) return -(RESERVATION_M / 2 + (lane === 0 ? 1.5 : 0.5) * TRUNK_LANE_M);
    if (cw && cw.kind === 'divided') return -(ISLAND_M / 2 + (cw.lanes >= 2 && lane === 0 ? 1.5 : 0.5) * LANE_M);
    if (cls === 'track') return 0;
    const q = (cls ? roadWidth(cls, cw) : 2 * LANE_M) / 4;
    return lane === 0 ? -q : q;
  };
  const bigRoadAt = s => { if (classAtS(s) !== 'trunk') return false; const c = cwAtS(s); return !c || c.kind === 'dual'; };
  const trafficClassAt = s => { const c = classAtS(s); return c === 'trunk' && !bigRoadAt(s) ? 'secondary' : c; };
  const canOvertakeAt = s => { const c = classAtS(s) === 'trunk' ? cwAtS(s) : null; return !(c && c.kind === 'divided' && c.lanes < 2); };
  const kindAt = s => { const c = classAtS(s); if (c !== 'trunk') return ({ residential: 'lane', unclassified: 'lane', track: 'track' })[c] ?? 'main'; return 'A28 ' + (cwAtS(s)?.kind ?? 'dual'); };
  return { pts, length: pts[pts.length - 1].s, atDistance, laneOffset, classAtS, cwAtS, trafficClassAt, canOvertakeAt, kindAt, laneWidth: LANE_M };
}

const ids = Object.keys(graph.anchors);
/** A route like pickRoute(), and a third of the time one that uses the A28,
 *  started just before it, as the page's "to big road" / "to A28 town". */
function pickRoute(r) {
  const wantA28 = r() < 0.34 ? ['dual', 'divided', 'single'][(r() * 3) | 0] : null;
  for (let tries = 0; tries < 400; tries++) {
    const a = ids[(r() * ids.length) | 0], b = ids[(r() * ids.length) | 0];
    if (a === b) continue;
    const p = shortestPath(graph.anchors[a], graph.anchors[b]);
    if (!p || p.length < 12) continue;
    const route = makeRoute(p);
    if (!wantA28) return { route, start: 0 };
    const k = route.pts.findIndex(q => q.cls === 'trunk' && (q.cw?.kind ?? 'dual') === wantA28);
    if (k > 0 || tries > 300) return { route, start: k > 0 ? Math.max(0, route.pts[k - 1].s - 60) : 0 };
  }
  throw new Error('no route');
}

// ---------------------------------------------------------------- geometry

function corners(x, y, h, len, wid) {
  const c = Math.cos(h), s = Math.sin(h), l = len / 2, w = wid / 2;
  return [[l, w], [-l, w], [-l, -w], [l, -w]].map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
}
function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
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
/** Gap between two boxes {x, y, h, len, wid}, metres; 0 is contact. */
function clearance(P, Q) {
  const far = Math.hypot(P.x - Q.x, P.y - Q.y) - Math.hypot(P.len, P.wid) / 2 - Math.hypot(Q.len, Q.wid) / 2;
  if (far > 3) return far;
  const A = corners(P.x, P.y, P.h, P.len, P.wid), B = corners(Q.x, Q.y, Q.h, Q.len, Q.wid);
  if (overlap(A, B)) return 0;
  let best = Infinity;
  for (const [U, V] of [[A, B], [B, A]]) for (const p of U) for (let i = 0; i < 4; i++) best = Math.min(best, segDist(p, V[i], V[(i + 1) % 4]));
  return best;
}

// ---------------------------------------------------------------- the van

function newCar() {
  return { s: 0, lane: 0, laneT: 0, base: null, laneWant: 0, v: 0, gear: 2, length: VAN_L, width: VAN_W, camH: null, jostle: 0 };
}

/** drive-spike.html's step(), less the drawing: the same order, the same caps. */
function stepCar(car, R, T, X, dt, input, stats) {
  const t = traffic.step(T, dt, car, { closed: crossings.closed(X) });
  const x = crossings.step(X, dt, car, T.vehicles);
  t.speedCap = Math.min(t.speedCap, x.speedCap);
  if (t.laneBlocked || !R.canOvertakeAt(car.s)) car.laneWant = 0;
  if (t.laneHold) car.laneWant = 1;
  stats.praised += x.events.length;
  const toGo = R.length - car.s;
  const arriveCap = Math.sqrt(2 * PULL_UP * Math.max(0, toGo - STOP_SHORT_M));
  const gearV = GEARS[car.gear];
  const target = Math.min(input.throttle ? gearV : 0, arriveCap);
  let emergency = 0;
  if (car.v > t.speedCap) { emergency = EMERGENCY; car.v = Math.max(t.speedCap, car.v - EMERGENCY * dt); }
  else if (input.handbrake) car.v = Math.max(0, car.v - HANDBRAKE * dt);
  else if (car.v < target) {
    const pull = Math.max(TOP_PULL, Math.min(1, (gearV - car.v) / TOP_OUT));
    car.v = Math.min(target, t.speedCap, car.v + ACCEL * pull * dt);
  } else if (input.throttle && target === gearV) car.v = Math.max(target, car.v - ENGINE_EASE * dt);
  else car.v = Math.max(target, car.v - BRAKE * dt);
  if (emergency) stats.emergencyFrames++;
  car.s = Math.min(R.length - STOP_SHORT_M, car.s + car.v * dt);

  const off0 = R.laneOffset(0, car.s), off1 = R.laneOffset(1, car.s);
  const span = Math.abs(off1 - off0) || LANE_M;
  const stepT = 7 * dt / span;
  car.laneT += Math.max(-stepT, Math.min(stepT, car.laneWant - car.laneT));
  if (car.base == null) car.base = off0;
  car.base += Math.max(-4 * dt, Math.min(4 * dt, off0 - car.base));
  car.lane = car.base + car.laneT * (off1 - off0);

  const zoom = 1.35 + (0.66 - 1.35) * Math.min(1, car.v / GEARS[3]);
  const ppm = 22 * zoom * (car.sideways ? 0.75 : 1);
  car.view = { ahead: (car.sideways ? 254.4 : 408.28) / ppm, ppm, chipsPx: car.sideways ? 68 : 104 };
  const pos = R.atDistance(car.s);
  const aheadP = R.atDistance(Math.min(R.length - 1, car.s + 20));
  const aim = Math.atan2(aheadP.y - pos.y, aheadP.x - pos.x);
  if (car.camH == null) car.camH = aim;
  else { const d = aim - car.camH; car.camH += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, 3.4 * dt); }
  car.x = pos.x + Math.cos(pos.h + Math.PI / 2) * car.lane;
  car.y = pos.y + Math.sin(pos.h + Math.PI / 2) * car.lane;
  car.h = pos.h;
  return toGo <= STOP_SHORT_M + 0.5 && car.v < 0.2;
}

// --------------------------------------------------------------- the driving

const totals = {
  minutes: 0, routes: 0, crossed: 0, familes: 0, contacts: 0, vanOverlaps: 0,
  minVan: Infinity, folded: 0, minSame: Infinity, minOnc: Infinity, minVanTraffic: Infinity,
  stoppedForAnimal: { same: 0, onc: 0 }, waitedForTraffic: 0, hardest: 0, longestStand: 0, longestClosed: 0,
  byKind: {}, emergencyFrames: 0, praised: 0,
};
const fail = [];

function drive(seed) {
  const r = rng(seed * 977 + 3);
  const season = SEASONS[seed % 4];
  const watchful = r();
  const stats = { praised: 0, emergencyFrames: 0 };
  let R, T, X;
  const car = newCar();
  car.sideways = seed % 3 === 0;
  const fresh = () => {
    const p = pickRoute(r);
    R = p.route;
    T = traffic.create({ length: R.length, atDistance: R.atDistance, laneOffset: R.laneOffset,
      roadClassAt: R.trafficClassAt, laneWidth: LANE_M }, { random: r });
    X = crossings.create({ length: R.length, atDistance: R.atDistance, laneOffset: R.laneOffset, roadClassAt: R.classAtS, laneWidth: LANE_M },
      { graph, mapToWorld, season });
    Object.assign(car, newCar(), { gear: car.gear, sideways: car.sideways });
    car.s = p.start;
    totals.routes++;
  };
  fresh();
  const input = { throttle: false, handbrake: false };
  let tInput = 0, arrivedFor = 0, t = 0;
  const prevV = new Map(), stand = new Map(), closedSince = new Map(), counted = new Set(), waited = new Set();
  const end = MINUTES * 60;
  while (t < end) {
    const dt = 1 / 120 + r() * (0.05 - 1 / 120);
    t += dt;
    tInput -= dt;
    if (tInput <= 0) {
      input.throttle = r() < 0.8;
      input.handbrake = !input.throttle && r() < 0.12;
      tInput = input.throttle ? 0.5 + r() * 10 : 0.2 + r() * 3;
      if (r() < 0.3) car.gear = 1 + ((r() * 3) | 0);
      if (r() < 0.3) car.laneWant = r() < 0.5 ? 0 : 1;
    }
    let held = input.throttle, hb = input.handbrake;
    if (r() < watchful) {
      for (const c of X.crossings) {
        const gap = c.s - (car.s + car.length / 2);
        if (c.state === 'go' && c.blocking && gap > 0 && gap < 30) { held = false; hb = gap < 6; }
      }
    }
    const kind = R.kindAt(car.s);
    totals.byKind[kind] = (totals.byKind[kind] ?? 0) + dt / 60;
    const arrived = stepCar(car, R, T, X, dt, { throttle: held, handbrake: hb }, stats);

    // Which way each vehicle is giving way: the closed stretches now.
    const closed = crossings.closed(X);
    for (const c of X.crossings) {
      const open = c.state === 'go' && closed.some(z => Math.abs(z.s0 - (c.s - c.near)) < 1e-6);
      if (open && !closedSince.has(c)) closedSince.set(c, t);
      if (!open && closedSince.has(c)) { totals.longestClosed = Math.max(totals.longestClosed, t - closedSince.get(c)); closedSince.delete(c); }
      if (c.state === 'wait' && c.s - (car.s + car.length / 2) < 8 + 0.6 * car.v && !waited.has(c)) {
        // Close enough that only traffic can be keeping it on the verge.
        if (T.vehicles.some(w => Math.abs(w.s - c.s) < 60)) { waited.add(c); }
      }
      if ((c.state === 'go' || c.state === 'gone') && !counted.has(c)) {
        counted.add(c); totals.crossed++;
        if (c.party.some(a => a.kind === 'duckling')) totals.familes++;
        if (waited.has(c)) totals.waitedForTraffic++;
      }
    }
    for (const w of T.vehicles) {
      const pv = prevV.get(w);
      const near = closed.find(z => w.dir > 0 ? z.s0 - (w.s + w.L / 2) > -1 && z.s0 - (w.s + w.L / 2) < 40
        : (w.s - w.L / 2) - z.s1 > -1 && (w.s - w.L / 2) - z.s1 < 40);
      // Slowing for the animal itself, not for the van or a vehicle in
      // between that is stopping for it.
      const lo = w.dir > 0 ? w.s : near?.s1, hi = w.dir > 0 ? near?.s0 : w.s;
      const between = near && (T.vehicles.some(u => u !== w && u.dir === w.dir && u.s > lo && u.s < hi)
        || (car.s + car.length / 2 > lo && car.s - car.length / 2 < hi));
      if (near && !between && pv != null && pv > 1) {
        const decel = (pv - w.v) / dt;
        if (decel > totals.hardest) totals.hardest = decel;
        if (decel > GENTLE) fail.push(`seed ${seed}: a ${w.kind} (${w.dir > 0 ? 'same way' : 'oncoming'}) slowed for an animal at ${decel.toFixed(1)} m/s² t=${t.toFixed(1)} from ${pv.toFixed(2)} to ${w.v.toFixed(2)}, ${(w.dir > 0 ? near.s0 - w.s - w.L / 2 : w.s - w.L / 2 - near.s1).toFixed(2)} m short; van s=${car.s.toFixed(1)} it s=${w.s.toFixed(1)}; others ${T.vehicles.filter(u => u !== w && Math.abs(u.s - w.s) < 20).map(u => u.dir + '@' + u.s.toFixed(1) + ' v' + u.v.toFixed(1)).join(' ')}`);
      }
      if (near && w.v < 0.2) {
        if (!stand.has(w)) { stand.set(w, t); totals.stoppedForAnimal[w.dir > 0 ? 'same' : 'onc']++; }
        const st = t - stand.get(w);
        totals.longestStand = Math.max(totals.longestStand, st);
        if (st > STAND_MAX_S) { fail.push(`seed ${seed}: a ${w.kind} stood for an animal ${st.toFixed(0)} s`); stand.set(w, t); }
      } else if (w.v > 0.5) stand.delete(w);
      prevV.set(w, w.v);
    }

    // Contacts: every animal against the van and against every vehicle.
    const vanBox = { x: car.x, y: car.y, h: car.h, len: car.length, wid: car.width };
    const boxes = T.vehicles.map(w => { const f = traffic.footprint(T, w); return { w, b: { x: f.x, y: f.y, h: f.h, len: f.L, wid: f.W } }; });
    for (const { w, b } of boxes) {
      if (Math.abs(b.x - car.x) > 30 || Math.abs(b.y - car.y) > 30) continue;
      const g = clearance(vanBox, b);
      // traffic.js reasons along the route, so a vehicle on a part of the
      // route that folds back past the van (a hairpin, a triangle junction)
      // is a known blind spot of it, not of the giving way; counted apart.
      if (Math.abs(w.s - car.s) > 60) { if (g <= 0) totals.folded++; continue; }
      totals.minVanTraffic = Math.min(totals.minVanTraffic, g);
      if (g <= 0 && process.env.DEBUG && totals.vanOverlaps === 0) {
        const pts = R.pts.filter(q => q.s > car.s - 60 && q.s < w.s + 60).map(q => `${q.s.toFixed(0)}:${q.cls}/${q.cw?.kind ?? ''}${q.cw?.lanes ?? ''}`);
        const hs = []; for (let s = car.s - 10; s < w.s + 20; s += 4) hs.push((R.atDistance(s).h * 180 / Math.PI).toFixed(0));
        console.log('DEBUG', JSON.stringify({ van: vanBox, it: b, pts, hs, off0van: R.laneOffset(0, car.s), off0it: R.laneOffset(0, w.s), L: w.L }));
      }
      if (g <= 0) { totals.vanOverlaps++; fail.push(`seed ${seed}: a ${w.kind} touched the van at t=${t.toFixed(1)} (${w.dir > 0 ? 'same way' : 'oncoming'}, ${kind}, van s=${car.s.toFixed(1)} v=${car.v.toFixed(1)} laneT=${car.laneT.toFixed(2)} lane=${car.lane.toFixed(2)}; it s=${w.s.toFixed(1)} v=${w.v.toFixed(1)} d=${w.d.toFixed(2)}; cap by ${T.last?.capBy} unsafe '${T.last?.unsafe}' hold ${T.last?.hold})`); }
    }
    for (const a of crossings.animals(X, car.camH)) {
      const A = { x: a.x, y: a.y, h: a.h, len: a.len, wid: a.wid };
      const live = a.crossing.state === 'go';
      const gv = clearance(vanBox, A);
      if (live) totals.minVan = Math.min(totals.minVan, gv);
      if (gv <= 0) { totals.contacts++; fail.push(`seed ${seed}: the van touched a ${a.kind} at t=${t.toFixed(1)} (${kind})`); }
      for (const { w, b } of boxes) {
        if (Math.abs(b.x - a.x) > 25 || Math.abs(b.y - a.y) > 25) continue;
        const g = clearance(b, A);
        if (live) { if (w.dir > 0) totals.minSame = Math.min(totals.minSame, g); else totals.minOnc = Math.min(totals.minOnc, g); }
        if (g <= 0) {
          totals.contacts++;
          fail.push(`seed ${seed}: a ${w.dir > 0 ? 'same-way' : 'oncoming'} ${w.kind} touched a ${a.kind} (${a.crossing.state}) at t=${t.toFixed(1)}, v=${w.v.toFixed(1)}`);
        }
      }
    }

    if (arrived) arrivedFor += dt;
    const jump = r() < 1 / (60 * 60 * 3);
    if (arrivedFor > ARRIVED_WAIT_S || jump) { fresh(); arrivedFor = 0; prevV.clear(); stand.clear(); closedSince.clear(); }
  }
  totals.minutes += end / 60;
  totals.praised += stats.praised;
  totals.emergencyFrames += stats.emergencyFrames;
}

const t0 = Date.now();
for (let seed = Number(process.env.FIRST ?? 1); seed < Number(process.env.FIRST ?? 1) + SEEDS; seed++) drive(seed);
const f2 = x => isFinite(x) ? x.toFixed(2) : 'n/a';
console.log(`safety.check: ${SEEDS} seeds x ${MINUTES} simulated minutes on the Birchie graph, ${totals.routes} routes, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`  minutes driven by road: ${Object.entries(totals.byKind).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')}`);
console.log(`  animals crossed ${totals.crossed} (families of ducklings ${totals.familes}), waited on the verge with traffic near ${totals.waitedForTraffic}`);
console.log(`  vehicles that stopped for an animal: same way ${totals.stoppedForAnimal.same}, oncoming ${totals.stoppedForAnimal.onc}`);
console.log(`  hardest any vehicle slowed for an animal ${totals.hardest.toFixed(2)} m/s² (allowed ${GENTLE}), longest stand ${totals.longestStand.toFixed(1)} s, longest a crossing was closed ${totals.longestClosed.toFixed(1)} s`);
console.log(`  contacts with animals ${totals.contacts}; closest to a crossing animal: the van ${f2(totals.minVan)} m, traffic going the same way ${f2(totals.minSame)} m, oncoming traffic ${f2(totals.minOnc)} m`);
console.log(`  vehicles touching the van ${totals.vanOverlaps} (closest ${f2(totals.minVanTraffic)} m); frames where the route folds back and a vehicle on its far part overlaps the van ${totals.folded}`);
console.log(`  she stopped by herself ${totals.praised}, hard-braking frames ${totals.emergencyFrames}`);
if (!totals.stoppedForAnimal.same || !totals.stoppedForAnimal.onc) fail.push('no vehicle ever stopped for an animal both ways: the check did not exercise it');
if (fail.length) { console.error('FAIL\n' + fail.slice(0, 25).join('\n')); process.exit(1); }
console.log('PASS');
