// traffic.check.mjs — proves traffic.js never lets anything touch the van.
//
//   node apps/game/public/admin/drive-spike/traffic.check.mjs [seeds] [minutes]
//
// Drives traffic.js against a synthetic route (straights, a 90-degree bend, a
// dual carriageway, a farm track) with the van stepped exactly as
// drive-spike.html's step() steps it, emergency stop included, and a child at
// the controls who presses things at random: go, stop, gears, handbrake,
// swipes either way, at any moment. Every frame it checks, in world space with
// the footprints the page draws, that no vehicle overlaps the van. Exits
// non-zero on any failure.

import * as traffic from './traffic.js';

const SEEDS = Number(process.argv[2] ?? 50);
const FIRST = Number(process.env.FIRST ?? 1);
const MINUTES = Number(process.argv[3] ?? 20);

// ------------------------------------------------- constants copied from the page

const LANE_M = 5;
const ROAD_M = { secondary: 10, tertiary: 10, unclassified: 9, residential: 8, track: 5 };
const TRUNK_LANE_M = { zoom: 5, narrow: 3.0 };
const RESERVATION_M = 1.6;
const VAN_W_M = 2.4;
const VAN_ASPECT = 1205 / 641;           // spark-rear.png
const GEARS = { 1: 7, 2: 13, 3: 20 };
const ACCEL = 9, BRAKE = 14, HANDBRAKE = 34;
const EMERGENCY = 26;

// ------------------------------------------------------------- the synthetic route

/** Legs as [length m, turn before it in degrees (left +), class]. */
const LEGS = [
  [300, 0, 'tertiary'],
  [260, 90, 'tertiary'],          // the 90-degree bend
  [220, -20, 'secondary'],
  [900, 0, 'trunk'],              // the dual carriageway
  [250, 15, 'trunk'],
  [260, 0, 'secondary'],
  [300, -35, 'residential'],
  [380, 0, 'track'],              // the farm track
  [200, 25, 'track'],
  [280, 0, 'unclassified'],
  [320, -90, 'tertiary'],
  [400, 0, 'secondary'],
];

function buildRoute() {
  const pts = [{ x: 0, y: 0, s: 0, cls: LEGS[0][2] }];
  let h = 0, x = 0, y = 0, s = 0;
  for (const [len, turn, cls] of LEGS) {
    h -= turn * Math.PI / 180;         // y is south, so a left turn is negative
    x += Math.cos(h) * len; y += Math.sin(h) * len; s += len;
    pts.push({ x, y, s, cls });
  }
  return pts;
}

function makeRoute(bigRoad) {
  const route = buildRoute();
  const routeLen = route[route.length - 1].s;
  // classAtS and atDistance are the page's, line for line.
  function classAtS(s) {
    const p = route; let i = 1;
    while (i < p.length - 1 && p[i].s < s) i++;
    return p[Math.min(i, p.length - 1)].cls;
  }
  function atDistance(s) {
    const p = route;
    if (s <= 0) return { x: p[0].x, y: p[0].y, h: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) };
    let i = 1;
    while (i < p.length - 1 && p[i].s < s) i++;
    const a = p[i - 1], b = p[i];
    const t = (s - a.s) / Math.max(1e-6, b.s - a.s);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  function roadWidth(cls) { return cls === 'trunk' ? 4 * TRUNK_LANE_M[bigRoad] + RESERVATION_M : (ROAD_M[cls] ?? 8); }
  function laneOffset(lane, s) {
    const cls = s == null ? null : classAtS(s);
    if (cls === 'trunk') {
      const w = TRUNK_LANE_M[bigRoad];
      return -(RESERVATION_M / 2 + (lane === 0 ? 1.5 : 0.5) * w);
    }
    if (cls === 'track') return 0;
    const quarter = (cls ? roadWidth(cls) : 2 * LANE_M) / 4;
    return lane === 0 ? -quarter : quarter;
  }
  return { route, routeLen, classAtS, atDistance, laneOffset };
}

// ------------------------------------------------------------------- geometry

function corners(b) {
  const c = Math.cos(b.h), s = Math.sin(b.h), hl = b.L / 2, hw = b.W / 2;
  return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([u, v]) =>
    [b.x + c * u - s * v, b.y + s * u + c * v]);
}
/** Separating-axis test on two rectangles: the largest gap along any axis
 *  (negative means they overlap). */
function separation(A, B) {
  const pa = corners(A), pb = corners(B);
  let best = -Infinity;
  for (const h of [A.h, A.h + Math.PI / 2, B.h, B.h + Math.PI / 2]) {
    const ax = Math.cos(h), ay = Math.sin(h);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, y] of pa) { const d = x * ax + y * ay; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const [x, y] of pb) { const d = x * ax + y * ay; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    best = Math.max(best, b0 - a1, a0 - b1);
  }
  return best;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------- one run

function run(seed) {
  const rand = mulberry32(seed * 7919 + 13);
  const bigRoad = seed % 2 ? 'narrow' : 'zoom';
  const R = makeRoute(bigRoad);
  const trf = traffic.create({
    length: R.routeLen, atDistance: R.atDistance, laneOffset: R.laneOffset,
    roadClassAt: R.classAtS, laneWidth: LANE_M,
  }, { random: mulberry32(seed) });

  // The bends and tracks the rules talk about, measured independently of
  // traffic.js from the legs above.
  const bends = [], tracks = [];
  { let s = 0; for (const [len, turn, cls] of LEGS) { if (Math.abs(turn) > 30 && cls !== 'trunk') bends.push(s); if (cls === 'track') tracks.push([s, s + len]); s += len; } }

  const car = { s: 0, lane: 0, laneT: 0, base: null, laneWant: 0, v: 0, gear: 2, road: 'tertiary', jostle: 0 };
  let throttle = false, handbrake = false, hbTimer = 0, nextInput = 0;
  const out = {
    frames: 0, overlaps: 0, minSep: Infinity, close: 0, beep: 0, emergencies: 0,
    enteredOnTrack: 0, enteredNearBend: 0, lane1OnTrack: 0, holds: 0,
    oncomingPasses: 0, overtakes: 0, blockedFrames: 0, maxVehicles: 0, wraps: 0,
    worst: null,
  };
  let wasEmergency = false, holdWas = false;
  const seenAhead = new Map(), oracle = new Map();
  out.expectedClose = 0;
  let t = 0;
  const end = MINUTES * 60;

  while (t < end) {
    const dt = 0.008 + rand() * 0.042;     // 8–50 ms frames, the page clamps at 50
    t += dt;

    // The child.
    if (t >= nextInput) {
      // Every third seed is the naughtiest child: foot down, mostly third
      // gear, swiping all the time.
      const wild = seed % 3 === 0;
      nextInput = t + (wild ? 0.1 + rand() * 1.2 : 0.15 + rand() * 2.8);
      const r = wild ? 0.2 + rand() * 0.8 : rand();
      if (wild) throttle = true;
      if (r < 0.32) throttle = true;
      else if (r < 0.42) throttle = false;
      else if (r < 0.57) car.gear = wild && rand() < 0.6 ? 3 : 1 + ((rand() * 3) | 0);
      else if (r < 0.78) car.laneWant = 1;
      else if (r < 0.90) car.laneWant = 0;
      else { handbrake = true; hbTimer = 0.1 + rand() * 0.9; }
    }
    if (handbrake) { hbTimer -= dt; if (hbTimer <= 0) handbrake = false; }

    // ---- the page's step(), line for line
    car.length = VAN_W_M * VAN_ASPECT;
    car.width = VAN_W_M;
    const laneTBefore = car.laneT;
    const res = traffic.step(trf, dt, car);
    if (res.laneBlocked) car.laneWant = 0;
    for (const ev of res.events) { if (ev === 'close') out.close++; if (ev === 'beep') out.beep++; }
    if (res.laneBlocked) out.blockedFrames++;

    // The check's own idea of a clean overtake, to hold 'close' to: a vehicle
    // that was ahead, that the van got past while out in lane 1, and that is
    // behind the van when it is back in lane 0. Taken at the moment traffic.js
    // looks, between its step and the van's. A vehicle traffic.js retired this very frame is still looked at once,
    // where it was moved to: it may have been passed this frame.
    const live = new Set(trf.vehicles);
    for (const w of new Set([...oracle.keys(), ...trf.vehicles])) {
      if (w.dir < 0) continue;
      const st = oracle.get(w);
      const vf = car.s + car.length / 2, vr = car.s - car.length / 2;
      if (w.s - w.L / 2 > vf) oracle.set(w, 'ahead');
      else if (st === 'ahead' && car.laneT > 0.5) oracle.set(w, 'out');
      else if (st === 'out' && car.laneT < 0.5 && vr > w.s + w.L / 2) { oracle.set(w, 'done'); out.expectedClose++; }
      if (!live.has(w)) oracle.delete(w);
    }

    const target = throttle ? GEARS[car.gear] : 0;
    let emergency = 0;
    if (car.v > res.speedCap) {
      emergency = EMERGENCY;
      car.v = Math.max(res.speedCap, car.v - EMERGENCY * dt);
    } else if (handbrake) car.v = Math.max(0, car.v - HANDBRAKE * dt);
    else if (car.v < target) car.v = Math.min(target, res.speedCap, car.v + ACCEL * dt);
    else car.v = Math.max(target, car.v - BRAKE * dt);
    if (emergency && !wasEmergency) {
      out.emergencies++;
      const k = 'em:' + trf.last.capBy + (car.laneT > 0.01 ? ' (van in lane 1)' : '');
      out[k] = (out[k] ?? 0) + 1;
    }
    wasEmergency = !!emergency;

    car.s += car.v * dt;
    if (car.s > R.routeLen - 40) { car.s = 0; out.wraps++; }

    const off0 = R.laneOffset(0, car.s), off1 = R.laneOffset(1, car.s);
    const span = Math.abs(off1 - off0) || LANE_M;
    const stepT = 7 * dt / span;
    const dT = Math.max(-stepT, Math.min(stepT, car.laneWant - car.laneT));
    car.laneT += dT;
    if (car.base == null) car.base = off0;
    car.base += Math.max(-4 * dt, Math.min(4 * dt, off0 - car.base));
    car.lane = car.base + car.laneT * (off1 - off0);

    const pos = R.atDistance(car.s);
    const nx = Math.cos(pos.h + Math.PI / 2), ny = Math.sin(pos.h + Math.PI / 2);
    car.x = pos.x + nx * car.lane; car.y = pos.y + ny * car.lane;
    car.heading = pos.h;
    // ---- end of the page's step()

    out.frames++;
    const hold = trf.last?.hold;
    if (hold && !holdWas) out.holds++;
    holdWas = hold;

    // Overtaking where it is not allowed: the van moving out into lane 1.
    // (Not counting the van going back out because something came alongside
    // while it was returning: that is the safety hold, not an overtake.)
    if (car.laneT > laneTBefore + 1e-9 && !trf.last.hold) {
      const front = car.s + car.length / 2;
      if (tracks.some(([a, b]) => car.s >= a && car.s <= b)) out.enteredOnTrack++;
      if (bends.some(b => front > b - 60 && car.s - car.length / 2 < b + 5)) {
        out.enteredNearBend++;
      }
    }
    if (car.laneT > 0.5 && tracks.some(([a, b]) => car.s - car.length / 2 >= a && car.s <= b)) out.lane1OnTrack++;

    // The absolute rule: nothing overlaps the van, ever.
    const vanBox = { x: car.x, y: car.y, h: car.heading, L: car.length, W: car.width };
    out.maxVehicles = Math.max(out.maxVehicles, trf.vehicles.length);
    for (const w of trf.vehicles) {
      const fp = traffic.footprint(trf, w);
      if (Math.abs(fp.x - car.x) > 30 || Math.abs(fp.y - car.y) > 30) continue;
      const sep = separation(vanBox, fp);
      if (sep < out.minSep) out.minSep = sep;
      if (sep < 0) {
        out.overlaps++;
        if (!out.worst || sep < out.worst.sep) out.worst = {
          sep, t: +t.toFixed(2), vanS: +car.s.toFixed(1), vanLaneT: +car.laneT.toFixed(2), vanV: +car.v.toFixed(1),
          kind: w.kind, dir: w.dir, s: +w.s.toFixed(1), v: +w.v.toFixed(1), d: +w.d.toFixed(2), vanLane: +car.lane.toFixed(2),
          cls: R.classAtS(car.s), hold,
        };
      }
    }
    // Passes, counted from vehicles going from ahead of the van to behind it.
    for (const w of trf.vehicles) {
      const ahead = w.s > car.s;
      const prev = seenAhead.get(w);
      if (prev === true && !ahead) {
        if (w.dir < 0) out.oncomingPasses++; else out.overtakes++;
      }
      seenAhead.set(w, ahead);
    }
  }
  return out;
}

// ------------------------------------------------------------------- all seeds

const totals = {};
let failed = 0, worst = null;
const t0 = Date.now();
for (let seed = FIRST; seed < FIRST + SEEDS; seed++) {
  const r = run(seed);
  for (const [k, v] of Object.entries(r)) {
    if (typeof v !== 'number') continue;
    if (k === 'minSep') totals[k] = Math.min(totals[k] ?? Infinity, v);
    else if (k === 'maxVehicles') totals[k] = Math.max(totals[k] ?? 0, v);
    else totals[k] = (totals[k] ?? 0) + v;
  }
  const bad = r.overlaps || r.enteredOnTrack || r.enteredNearBend || r.lane1OnTrack;
  if (bad) {
    failed++;
    console.log(`seed ${seed}: overlaps ${r.overlaps}, entered lane 1 on track ${r.enteredOnTrack}, near bend ${r.enteredNearBend}, lane 1 on track ${r.lane1OnTrack}`, r.worst ?? '');
    if (r.worst && (!worst || r.worst.sep < worst.sep)) worst = { seed, ...r.worst };
  }
  if (r.close !== r.expectedClose) { failed++; console.log(`seed ${seed}: ${r.close} 'close' for ${r.expectedClose} clean overtakes`); }
}

const simMin = SEEDS * MINUTES;
console.log(`\ntraffic.check: ${SEEDS} seeds x ${MINUTES} simulated minutes = ${simMin} minutes, ${totals.frames} frames, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  overlaps with the van            ${totals.overlaps}   (closest approach ${totals.minSep.toFixed(2)} m)`);
console.log(`  moved into lane 1 on the track   ${totals.enteredOnTrack}`);
console.log(`  moved into lane 1 near the bend  ${totals.enteredNearBend}`);
console.log(`  in lane 1 on the track           ${totals.lane1OnTrack} frames`);
console.log(`  'close'                          ${totals.close}   (clean overtakes seen by the check: ${totals.expectedClose})`);
console.log(`  'beep'                           ${totals.beep}`);
console.log(`  vehicles passed                  ${totals.overtakes}`);
console.log(`  oncoming vehicles met            ${totals.oncomingPasses}`);
console.log(`  emergency stops by the page      ${totals.emergencies}`);
for (const k of Object.keys(totals).filter(k => k.startsWith('em:')).sort()) console.log(`    ${k.slice(3).padEnd(28)} ${totals[k]}`);
console.log(`  times held out (swipe back refused while alongside) ${totals.holds}`);
console.log(`  most vehicles at once            ${totals.maxVehicles}`);
console.log(`  route laps                       ${totals.wraps}`);
if (worst) console.log('  worst overlap', worst);
if (!totals.close) failed++;
if (failed || totals.overlaps) { console.log(`\nFAIL (${failed} seed failures)`); process.exit(1); }
console.log('\nPASS');
