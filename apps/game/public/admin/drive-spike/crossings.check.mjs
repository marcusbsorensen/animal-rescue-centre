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
// van stop short of). The page's camera is stepped too, as the page has it
// (pageCamera: the road it shows ahead, its zoom and its aim), since an
// animal steps out only once it is on screen and a side-on animal's box is
// square to the camera; a third of the drivers hold the phone sideways.
// Then real drives between the places, with the default van and with
// Trikey, for how often the rarer animals are out (60A; DRIVES=250 a season).
//
// Asserts: no contact ever; crossings only on residential, unclassified and
// track; no hedgehog in winter; ducklings only in spring; a deer on about
// one real drive in ten with either van. Prints the counts.

import * as crossings from './crossings.js';
import * as trikeyRoads from './trikey-roads.js';
import { readFileSync } from 'node:fs';

// ----------------------------------------------------- the page's constants

const ASPECT = 1800 / 1121, METRES_PER_UNIT = 3900;
const ROAD_M = { secondary: 10, tertiary: 10, unclassified: 9, residential: 8, track: 5 };
const LANE_M = 5, TRUNK_LANE_M = 5, RESERVATION_M = 1.6, TRUNK_M = 4 * TRUNK_LANE_M + RESERVATION_M;
const roadWidth = cls => cls === 'trunk' ? TRUNK_M : (ROAD_M[cls] ?? 8);
const GEARS = { 1: 7, 2: 13, 3: 20 };
const ACCEL = 9, BRAKE = 14, HANDBRAKE = 34, EMERGENCY = 26, ENGINE_EASE = 4, TOP_OUT = 3.5, TOP_PULL = 0.18;
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

function newCar() { return { zoom: null, s: 0, lane: 0, laneT: 0, base: null, laneWant: 0, v: 0, gear: 2, length: VAN_L, width: VAN_W, camH: null }; }

// ------------------------------------------------------- the page's camera

/** drive-spike.html's camera as the page has it now, measured there at
 *  390x844 upright and 844x390 held sideways: the dashboard takes the
 *  bottom 152 px (72 sideways); the van sits 75% down the road view above
 *  it (86% sideways, raised until its tail and 16 px of road behind it clear
 *  the dashboard), so the road shown ahead of it is vanY / ppm; the chips end
 *  66 px down either way; held sideways every zoom is 0.75 of upright. The
 *  zoom is the page's zoomTarget: by speed and by road, pulled back to 0.72
 *  in a town when upright (59A) but not where an animal is about to cross,
 *  in at the gate, out before the dual carriageway; eased, out quicker than
 *  in. The camera aims 20 m up the route, or 0.7 of the road shown, at most
 *  28 m. In portrait that is 26-30 m of road ahead in second and third gear,
 *  where the old model of it here showed 20.6 m. */
const SCREEN = {
  upright: { roadH: 844 - 152, pin: 0.75, zoomX: 1 },
  sideways: { roadH: 390 - 72, pin: 0.86, zoomX: 0.75 },
};
const CHIPS_PX = 66, BEHIND_PX = 16;
const ZOOM_FAST = 0.66, ZOOM_STILL = { lane: 1.35, road: 1.15 }, ZOOM_ARRIVE = 1.6, ARRIVE_ZOOM_M = 120;
const BIG_ROAD_ZOOM = 0.62, ZOOM_TOWN = 0.72, TOWN_AHEAD_M = 30, TOWN_EASE = 1.5;
const LOOKAHEAD_M = 20, LOOKAHEAD_MAX_M = 28, CAM_EASE = 3.4;
const ZOOM_LANES = new Set(['residential', 'unclassified', 'track', 'path', 'crossing']);

/** scenery.js's townAt, from the buildings.json it reads: 1 inside a housing
 *  area, else by how many town buildings stand within 45 m (8 make a street). */
const TOWN = (() => {
  const B = JSON.parse(readFileSync(new URL('../../assets/driving/buildings.json', import.meta.url)));
  const ring = a => {
    const r = []; let x = a[1], y = a[2];
    r.push([x * B.q, y * B.q]);
    for (let k = 3; k + 1 < a.length; k += 2) { x += a[k]; y += a[k + 1]; r.push([x * B.q, y * B.q]); }
    return r;
  };
  const KINDS = new Set(['house', 'flats', 'retail', 'church', 'school', 'station', 'hall']);
  const cell = (x, y) => Math.floor(x / 50) + ',' + Math.floor(y / 50);
  const put = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  const blds = new Map(), housing = new Map();
  for (const a of B.b) {
    if (!KINDS.has(B.kinds[a[0]])) continue;
    const r = ring(a), cx = r.reduce((n, p) => n + p[0], 0) / r.length, cy = r.reduce((n, p) => n + p[1], 0) / r.length;
    put(blds, cell(cx, cy), [cx, cy]);
  }
  for (const a of B.a) {
    if (B.areas[a[0]] !== 'housing') continue;
    const r = ring(a);
    const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    for (let i = Math.floor(box[0] / 50); i <= Math.floor(box[2] / 50); i++) {
      for (let j = Math.floor(box[1] / 50); j <= Math.floor(box[3] / 50); j++) put(housing, i + ',' + j, r);
    }
  }
  return { blds, housing };
})();
function inRing(r, x, y) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, ay] = r[i], [bx, by] = r[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c;
  }
  return c;
}
function townAt(x, y) {
  if ((TOWN.housing.get(Math.floor(x / 50) + ',' + Math.floor(y / 50)) ?? []).some(r => inRing(r, x, y))) return 1;
  let n = 0;
  for (let i = Math.floor((x - 45) / 50); i <= Math.floor((x + 45) / 50); i++) {
    for (let j = Math.floor((y - 45) / 50); j <= Math.floor((y + 45) / 50); j++) {
      for (const [bx, by] of TOWN.blds.get(i + ',' + j) ?? []) if ((bx - x) ** 2 + (by - y) ** 2 < 45 * 45 && ++n >= 8) return 1;
    }
  }
  return Math.max(0, n - 1) / 7;
}
/** The page's townHere: 0 held sideways, on a farm track, and where an
 *  animal is about to cross. */
function townHere(car, route, xing) {
  if (car.sideways || route.roadClassAt(car.s) === 'track') return 0;
  if (xing.crossings.some(c => c.state !== 'none' && c.state !== 'gone' && c.s > car.s - 5 && c.s - car.s < 60)) return 0;
  const a = route.atDistance(car.s), b = route.atDistance(Math.min(route.length, car.s + TOWN_AHEAD_M));
  return Math.max(townAt(a.x, a.y), townAt(b.x, b.y));
}

/** The page's zoom, view and camera heading after a step, onto car.view
 *  (what crossings.js reads the next frame, as the page draws it) and
 *  car.camH. toGo is from before the step, as the page's. */
function pageCamera(car, route, xing, dt, toGo) {
  const S = car.sideways ? SCREEN.sideways : SCREEN.upright;
  const big = s => route.roadClassAt(Math.min(route.length, s)) === 'trunk';
  const townNow = townHere(car, route, xing);
  car.town = (car.town ?? townNow) + (townNow - (car.town ?? townNow)) * (1 - Math.exp(-TOWN_EASE * dt));
  const still = ZOOM_LANES.has(route.roadClassAt(car.s)) ? ZOOM_STILL.lane : ZOOM_STILL.road;
  let zt = still + (ZOOM_FAST - still) * Math.min(1, car.v / GEARS[3]);
  if (car.town > 0) zt += (Math.min(zt, ZOOM_TOWN) - zt) * car.town;
  if (toGo < ARRIVE_ZOOM_M) zt += (ZOOM_ARRIVE - zt) * (1 - toGo / ARRIVE_ZOOM_M);
  if (big(car.s) || big(car.s + 40)) zt = Math.min(zt, BIG_ROAD_ZOOM);
  car.zoom = car.zoom == null ? zt : car.zoom * Math.exp(Math.log(zt / car.zoom) * (1 - Math.exp(-(zt < car.zoom ? 1.5 : 0.7) * dt)));
  const pos = route.atDistance(car.s);
  const aimM = Math.min(LOOKAHEAD_MAX_M, Math.max(LOOKAHEAD_M, 0.7 * (car.view?.ahead ?? 0)));
  const aheadP = route.atDistance(Math.min(route.length - 1, car.s + aimM));
  const aim = Math.atan2(aheadP.y - pos.y, aheadP.x - pos.x);
  if (car.camH == null) car.camH = aim;
  else { const d = aim - car.camH; car.camH += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, CAM_EASE * dt); }
  const ppm = 22 * car.zoom * S.zoomX;
  const vanY = Math.min(S.roadH * S.pin, S.roadH - car.length * ppm / 2 - BEHIND_PX);
  car.view = { ahead: vanY / ppm, ppm, chipsPx: CHIPS_PX };
}

/** drive-spike.html's step(), less the camera: the same order, the same caps. */
function stepCar(car, route, xing, dt, input, stats) {
  const x = crossings.step(xing, dt, car);
  const cap = x.speedCap;
  car.xCap = cap;
  stats.praised += x.events.length;   // its only event is the thanks for stopping
  const toGo = route.length - car.s;
  const arriveCap = Math.sqrt(2 * PULL_UP * Math.max(0, toGo - STOP_SHORT_M));
  const gearV = GEARS[car.gear];
  const target = Math.min(input.throttle ? gearV : 0, arriveCap);
  let capped = 0;
  if (car.v > cap) { const v0 = car.v; car.v = Math.max(cap, car.v - EMERGENCY * dt); capped = (v0 - car.v) / dt; }
  else if (input.handbrake) car.v = Math.max(0, car.v - HANDBRAKE * dt);
  else if (car.v < target) {
    const pull = Math.max(TOP_PULL, Math.min(1, (gearV - car.v) / TOP_OUT));
    car.v = Math.min(target, cap, car.v + ACCEL * pull * dt);
  } else if (input.throttle && target === gearV) car.v = Math.max(target, car.v - ENGINE_EASE * dt);
  else car.v = Math.max(target, car.v - BRAKE * dt);
  // Felt as a hard stop as the page counts it: harder than letting go, over 0.1 s.
  car.felt = (car.felt ?? 0) + (capped - (car.felt ?? 0)) * (1 - Math.exp(-dt / 0.1));
  if (capped > 0 && car.felt > BRAKE + 0.5) stats.emergencyFrames++;
  car.s = Math.min(route.length - STOP_SHORT_M, car.s + car.v * dt);

  const off0 = route.laneOffset(0, car.s), off1 = route.laneOffset(1, car.s);
  const span = Math.abs(off1 - off0) || LANE_M;
  const stepT = 7 * dt / span;
  car.laneT += Math.max(-stepT, Math.min(stepT, car.laneWant - car.laneT));
  if (car.base == null) car.base = off0;
  car.base += Math.max(-4 * dt, Math.min(4 * dt, off0 - car.base));
  car.lane = car.base + car.laneT * (off1 - off0);
  pageCamera(car, route, xing, dt, toGo);
  const pos = route.atDistance(car.s);
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
  offSmall: 0, fileStray: 0, outLate: 0, eased: 0, rest: [], restForced: [], restCareful: [], restByGear: {}, scripted: {}, outSlow: [], outFast: [], winterHogs: 0, ducklingsOutOfSpring: 0, bySpecies: {}, byPlace: {}, bySeason: {}, bodies: {},
};
const fail = [];

/** driver, for the scripted drivers: holds go in one gear the whole way and
 *  lets go react seconds after an animal steps out ahead (Infinity: never,
 *  so the van stops itself), then sets off again once it is across. */
function drive(seed, newRouteFn, season, label, driver = null, T = 20 * 60) {
  const r = rng(seed * 31 + 5);
  const watchful = r();                      // how often this driver watches the road
  const careful = seed % 5 === 2;
  const stats = { praised: 0, emergencyFrames: 0 };
  let { route } = newRouteFn(r);
  const world = () => ({ graph: newRouteFn.graph(), mapToWorld, season });
  let xing = crossings.create(route, world());
  const car = newCar();
  car.sideways = driver ? driver.sideways : seed % 3 === 0;
  if (driver) car.gear = driver.gear;
  const input = { throttle: false, handbrake: false };
  let tInput = 0, arrivedFor = 0, t = 0;
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
    // A careful driver (one seed in five) slows to a crawl on seeing an
    // animal waiting ahead, creeps up in first, and stops the moment it
    // steps out: where the van then rests is where she watches it cross.
    if (careful) {
      for (const c of xing.crossings) {
        const gap = c.s - (car.s + car.length / 2);
        if (c.state === 'wait' && c.party.length && c.seen > 0 && gap > 0 && gap < 18) { held = car.v < 1.2; hb = false; car.gear = 1; }
        if (c.state === 'go' && c.blocking && gap > 0 && gap < 30) { held = false; hb = true; }
      }
    }
    if (driver) {
      car.gear = driver.gear; held = true; hb = false;
      for (const c of xing.crossings) {
        if (c.state === 'go' && c.blocking && c._outAt != null && t - c._outAt >= driver.react) held = false;
      }
    }
    const arrived = stepCar(car, route, xing, dt, { throttle: held, handbrake: hb }, stats);

    for (const a of crossings.animals(xing, car.camH)) {
      if (!(a.len > 0 && a.wid > 0)) { totals.contacts++; fail.push(`${label}: ${a.kind} has no drawn body`); continue; }
      totals.bodies[a.kind] ??= `${a.len.toFixed(2)}x${a.wid.toFixed(2)} m`;
      // Single file: a duckling on the road keeps to its mother's line.
      if (a.kind === 'duckling' && a.crossing.state === 'go' && Math.abs(a.lat) < a.crossing.halfW) {
        totals.fileStray = Math.max(totals.fileStray, Math.abs(a.s - a.crossing.s));
      }
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
    // How far ahead of the nose an animal set out, by the van's speed then.
    for (const c of xing.crossings) {
      if (c.state === 'go' && c.blocking && !c._out) {
        c._out = true; c._outAt = t; c._gear = car.gear; c._v = car.v; c._peak = 0;
        if (c.stopAt < car.length - 0.3) totals.outLate++;
        (car.v < 2 ? totals.outSlow : totals.outFast).push(c.s - (car.s + car.length / 2));
      }
    }
    for (const c of xing.crossings) if (c._out && !c._rest) c._peak = Math.max(c._peak, car.felt ?? 0);
    // Eased for an animal waiting ahead: crossings.js's cap below the gear's
    // speed while it waits and nothing is on the road.
    for (const c of xing.crossings) {
      if (c.state === 'wait' && c.party.length && !c._eased && c.s > car.s && car.xCap < GEARS[car.gear] - 0.5
        && !xing.crossings.some(o => o.state === 'go' && o.blocking)) { c._eased = true; totals.eased++; }
    }
    // Where the van came to rest for a crossing: its nose to the animal's line.
    if (car.v < 0.05) for (const c of xing.crossings) {
      if (c.state === 'go' && c.blocking && !c._rest) {
        c._rest = true;
        const d = c.s - (car.s + car.length / 2);
        if (d > 0 && d < 30) {
          const stop = { d, forced: !!c.forced, peak: c._peak, v: c._v };
          if (driver) {
            const k = `gear ${driver.gear} ${driver.sideways ? 'sideways' : 'upright '} ${driver.react === Infinity ? 'never lets go' : `lets go after ${driver.react} s`}`;
            (totals.scripted[k] ??= []).push(stop);
          } else {
            totals.rest.push(d); if (c.forced) totals.restForced.push(d); if (careful) totals.restCareful.push(d);
            const k = c._v < 2 ? 'creeping' : `gear ${c._gear}`;
            (totals.restByGear[k] ??= []).push(stop);
          }
        }
      }
    }

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
  if (driver) return;
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

// Scripted drivers, for where the van stops in each gear (39A): go held in
// one gear, letting go 0.3 s after an animal steps out, or never.
for (const gear of [1, 2, 3]) for (const sideways of [false, true]) for (const react of [0.3, Infinity]) {
  for (let seed = 201; seed <= 206; seed++) {
    let g = null;
    const fn = (r) => {
      const syn = syntheticGraph(seed * 1000 + ((r() * 1e6) | 0));
      g = syn.graph;
      return { route: makeRoute(g, syn.path, edgeClasses(g)) };
    };
    fn.graph = () => g;
    drive(seed, fn, SEASONS[seed % 4], `scripted gear ${gear} seed ${seed}`, { gear, sideways, react }, 4 * 60);
  }
}

// Real drives (60A): how often the rarer animals are out on a drive, as the
// page picks its drives: between the places at random, each from where the
// last pulled up, with the default van on the roads and with Trikey on hers
// (trikey-roads.js), DRIVES a season in every season.
const DRIVES = Number(process.env.DRIVES ?? 250);
const trike = trikeyRoads.create(real, JSON.parse(readFileSync(new URL('../../assets/driving/trikey-links.json', import.meta.url))));
const trikeShown = (() => {
  const cw = JSON.parse(readFileSync(new URL('../../assets/driving/trunk-carriageways.json', import.meta.url)));
  const rec = new Map();
  for (const c of cw.edges) { const e = real.edges[c.edge]; if (e && e[2] === 'trunk' && e[0] === c.nodes[0] && e[1] === c.nodes[1]) rec.set(c.edge, c); }
  const half = k => { const c = rec.get(k); return !c || c.kind === 'dual' ? TRUNK_M / 2 : c.kind === 'divided' ? (2 * Math.max(1, c.lanes) * LANE_M + 1.2) / 2 : ROAD_M.secondary / 2; };
  return trikeyRoads.clearOfA28(trike, half, (fx, fy) => ({ x: fx * ASPECT * METRES_PER_UNIT, y: fy * METRES_PER_UNIT }));
})();
/** Her route as the page draws and drives it (routePoints), as makeRoute's. */
function trikeRoute(path) {
  const pts = trikeyRoads.routePoints(trike, trikeShown, path).map(p => ({ x: p.x, y: p.y, s: 0, cls: p.cls }));
  const g = { nodes: pts.map(p => [p.x / (ASPECT * METRES_PER_UNIT), p.y / METRES_PER_UNIT]) };
  const cls = new Map(pts.map((p, i) => [(i - 1) * 4096 + i, p.cls]));
  return makeRoute(g, pts.map((p, i) => i), cls);
}
function realTrip(r, from, van) {
  let best = null;
  for (let k = 0; k < 40; k++) {
    if (van === 'trikey') {
      const trip = trikeyRoads.pickTrip(trike, r, from);
      if (!trip || trip.path.length < 2) continue;
      best = { route: trikeRoute(trip.path), to: trip.to };
      if (trip.path.length >= 12 && best.route.length > 1200) break;
    } else {
      const a = from ?? ids[(r() * ids.length) | 0], b = ids[(r() * ids.length) | 0];
      if (a === b) continue;
      const p = shortestPath(real.anchors[a], real.anchors[b]);
      if (!p || p.length < 12) continue;
      best = { route: makeRoute(real, p, realCls), to: b };
      if (best.route.length > 1200) break;
    }
  }
  return best;
}
const rarity = {};
for (const van of ['henry', 'trikey']) {
  const T = rarity[van] = { drives: 0, km: 0, drake: 0, deer: 0, family: 0, places: 0, animals: 0, bySeason: {} };
  const r = rng(van === 'trikey' ? 7 : 3);
  for (const season of SEASONS) {
    const Z = T.bySeason[season] = { drives: 0, drake: 0, deer: 0, family: 0 };
    let from = null;
    for (let d = 0; d < DRIVES; d++) {
      const trip = realTrip(r, from, van);
      if (!trip) { from = null; continue; }
      from = trip.to;
      const xg = crossings.create(trip.route, { graph: real, mapToWorld, season });
      const all = xg.crossings.flatMap(c => c.party);
      const has = { drake: all.some(a => a.kind === 'duck' && a.look === 'drake'), deer: all.some(a => a.kind === 'deer'), family: all.some(a => a.kind === 'duckling') };
      T.drives++; Z.drives++; T.km += trip.route.length / 1000;
      for (const k of ['drake', 'deer', 'family']) if (has[k]) { T[k]++; Z[k]++; }
      T.places += xg.crossings.length;
      T.animals += xg.crossings.filter(c => c.party.length).length;
    }
  }
}

console.log(`seeds ${totals.seeds} (50 synthetic + 12 on the Birchie graph), ${totals.minutes} simulated minutes, ${totals.routes} routes`);
console.log(`crossing places on the routes driven ${totals.crossings} (${totals.sleeping} hedgehog places asleep in winter), animals crossed ${totals.crossed}`);
console.log(`by species ${JSON.stringify(totals.bySpecies)}`);
console.log(`mother ducks leading ducklings (spring) ${totals.families}; on the road a duckling strayed at most ${totals.fileStray.toFixed(2)} m off her line`);
if (totals.fileStray > 0.4) fail.push(`a duckling strayed ${totals.fileStray.toFixed(2)} m off its mother's line: they cross abreast`);
console.log(`by place ${JSON.stringify(totals.byPlace)}`);
console.log(`crossed by season ${JSON.stringify(totals.bySeason)}`);
console.log(`she stopped by herself ${totals.praised}, the van stopped itself ${totals.selfStops} (${totals.emergencyFrames} hard-braking frames), crossed behind the van ${totals.late}`);
console.log(`crossed behind the van, by species and how the phone was held ${JSON.stringify(totals.lateBy)}`);
{
  const q = (xs, f) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(f * (a.length - 1))].toFixed(1) : 'n/a'; };
  console.log(`where the van came to rest for a crossing, nose to the animal's line: median ${q(totals.rest, 0.5)} m (10% ${q(totals.rest, 0.1)}, 90% ${q(totals.rest, 0.9)}; ${totals.rest.length} stops); when it stopped itself median ${q(totals.restForced, 0.5)} m; a careful driver who creeps up and stops as it steps out median ${q(totals.restCareful, 0.5)} m (10% ${q(totals.restCareful, 0.1)}, 90% ${q(totals.restCareful, 0.9)}; ${totals.restCareful.length}); the van is ${VAN_L.toFixed(1)} m long`);
  const dist = (stops) => {
    const ds = stops.map(x => x.d), forced = stops.filter(x => x.forced).length;
    const peak = stops.reduce((m, x) => Math.max(m, x.peak), 0);
    const rough = stops.filter(x => x.peak > BRAKE + 0.5).length;
    return `${String(stops.length).padStart(4)} stops: 10% ${q(ds, 0.1)}, median ${q(ds, 0.5)}, 90% ${q(ds, 0.9)} m; the van stopped itself ${forced}, felt as rough ${rough}; hardest felt ${peak.toFixed(1)} m/s²`;
  };
  console.log(`where the van came to rest, nose to the animal's line, by the gear when it stepped out (random drivers):`);
  for (const k of Object.keys(totals.restByGear).sort()) console.log(`  ${k.padEnd(10)} ${dist(totals.restByGear[k])}`);
  console.log(`scripted drivers, go held in one gear:`);
  for (const k of Object.keys(totals.scripted).sort()) console.log(`  ${k.padEnd(42)} ${dist(totals.scripted[k])}`);
  console.log(`how far ahead of the nose an animal set out: van creeping or standing median ${q(totals.outSlow, 0.5)} m (${totals.outSlow.length}), moving median ${q(totals.outFast, 0.5)} m (${totals.outFast.length}); stepped out late (the van's own stop nearer than a van length) ${totals.outLate}; the van eased for an animal waiting ahead ${totals.eased} times`);
}
console.log(`contacts ${totals.contacts}, closest the van came to a crossing animal's drawn body ${totals.minClear.toFixed(2)} m`);
console.log(`closest while it blocked the road: upright ${totals.minClearSide.upright?.toFixed(2)} m, sideways ${totals.minClearSide.sideways?.toFixed(2)} m; the camera turned at most ${totals.skew.toFixed(2)} rad off a crossing's line within 6 m of it (crossings.js allows ${crossings.CAMERA_SKEW})`);
console.log(`drawn bodies measured (box across x along, first seen): ${Object.entries(totals.bodies).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`crossings off the small roads ${totals.offSmall}, hedgehogs in winter ${totals.winterHogs}, ducklings outside spring ${totals.ducklingsOutOfSpring}`);
{
  const per = (n, of) => n ? `1 in ${(of / n).toFixed(1)}` : 'none';
  console.log(`real drives, ${DRIVES} a season (60A): the rarer animals out on a drive, and crossing places per km`);
  for (const [van, T] of Object.entries(rarity)) {
    console.log(`  ${van.padEnd(6)} ${T.drives} drives, ${T.km.toFixed(0)} km: drake ${per(T.drake, T.drives)}, deer ${per(T.deer, T.drives)}, duck family ${per(T.family, T.bySeason.spring.drives)} spring drives; ${(T.places / T.km).toFixed(2)} places a km, ${(T.animals / T.km).toFixed(2)} with an animal out`);
    console.log(`         by season ${Object.entries(T.bySeason).map(([k, z]) => `${k} drake ${z.drake}, deer ${z.deer}, families ${z.family} of ${z.drives}`).join('; ')}`);
    // About one drive in ten (Marcus, 60A).
    if (T.deer < T.drives / 15 || T.deer > T.drives / 6) fail.push(`${van}: a deer on ${per(T.deer, T.drives)} drives, not about one in ten`);
  }
}
if (totals.skew > crossings.CAMERA_SKEW) fail.push(`the camera turned ${totals.skew.toFixed(2)} rad off a crossing, more than crossings.js's CAM_SKEW allows for`);
if (fail.length || !totals.crossed || !totals.selfStops || !totals.praised || !totals.families) {
  console.error('FAIL\n' + fail.slice(0, 20).join('\n'));
  if (!totals.crossed || !totals.selfStops || !totals.praised || !totals.families) console.error('the check did not exercise crossings, self-stops and praise');
  process.exit(1);
}
console.log(`PASS: ${totals.contacts} contacts between the van and any animal.`);
