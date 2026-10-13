// lights.check.mjs — proof that Trikey's toucan crossings of the A28 are safe.
//
//   node apps/game/public/admin/drive-spike/lights.check.mjs [runs] [first seed]
//
// The rule (Marcus 62A, 2026-10-13): at the lights Trikey stops at the kerb by
// herself, the child presses the button, and she rides over when the green
// cycle shows. lights.js runs each crossing's lights and the A28's traffic
// there. This drives it on her real routes through both crossings she uses
// (trikey-roads.js over the Birchie graph, drawn and ridden where the page
// draws them: clearOfA28 at the page's A28 widths), with her stepped exactly
// as drive-spike.html's step() steps the van, self-stop included, and a child
// at the controls who does what a child does: presses early on the way, late,
// over and over, or not for a long while; holds go against the red; dawdles
// on the green; stops halfway over; pulls the handbrake. Each run starts her
// some way short of a crossing and ends when she is well past it.
//
// Asserts, every frame:
//   - no vehicle's front ever goes past its stop line while its light is red
//     or red-and-amber, unless it was too close to stop on amber and went on
//     through (which real life allows; counted and reported);
//   - no vehicle is ever on the crossing while Trikey is on the carriageway,
//     and none is between its stop line and the far side of the crossing;
//   - Trikey never rides onto the carriageway unless the green cycle shows,
//     and her stop at the kerb is never felt as rough;
//   - the lights never leave green for the traffic without a press;
//   - nothing deadlocks: every press brings the green cycle, every run gets
//     her over, no vehicle stands for ever, no two vehicles overlap.
// Prints the closest any vehicle came to her, and the press-to-green times.

import { readFileSync } from 'node:fs';
import * as trikeyRoads from './trikey-roads.js';
import * as lights from './lights.js';

const RUNS = Number(process.argv[2] ?? 600);
const FIRST = Number(process.argv[3] ?? 1);
const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const base = load('../../assets/driving/birchie-graph.json');
const links = load('../../assets/driving/trikey-links.json');
const cwJson = load('../../assets/driving/trunk-carriageways.json');

// ------------------------------------------------------- the page's constants

const ASPECT = 1800 / 1121, MPU = 3900;
const LANE_M = 5, ISLAND_M = 1.2;
const GEARS = { 1: 3.5, 2: 6.5, 3: 10 };       // hers: half of every gear
const ACCEL = 9, BRAKE = 14, HANDBRAKE = 34, EMERGENCY = 26, ENGINE_EASE = 4;
const TOP_OUT = 3.5, TOP_PULL = 0.18, FELT_S = 0.1;
const TRIKEY_W = 0.75 * 2.4 / 1.75, TRIKEY_L = TRIKEY_W * 869 / 454;
const toWorld = (fx, fy) => ({ x: fx * ASPECT * MPU, y: fy * MPU });

const cwRec = new Map();
for (const c of cwJson.edges) {
  const e = base.edges[c.edge];
  if (e && e[2] === 'trunk' && e[0] === c.nodes[0] && e[1] === c.nodes[1]) cwRec.set(c.edge, c);
}
// drive-spike.html's roadWidth for the A28.
const trunkHalf = k => {
  const c = cwRec.get(k);
  if (!c || c.kind === 'dual') return (4 * 5 + 1.6) / 2;
  if (c.kind === 'divided') return (2 * Math.max(1, c.lanes) * LANE_M + ISLAND_M) / 2;
  return 10 / 2;
};
const a28Of = k => {
  const c = cwRec.get(k) ?? null;
  return { kind: c?.kind ?? 'dual', lanes: c?.lanes ?? 2, mph: c?.maxspeedMph ?? 30, half: trunkHalf(k) };
};

const R = trikeyRoads.create(base, links);
const shown = trikeyRoads.clearOfA28(R, trunkHalf, toWorld);

/** The page's toPolyline for her: each point where she rides it. */
function polyline(path) {
  const pts = trikeyRoads.routePoints(R, shown, path).map(p => ({ x: p.x, y: p.y, s: 0, cls: p.cls }));
  for (let i = 1; i < pts.length; i++) pts[i].s = pts[i - 1].s + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  pts[0].cls = pts[1]?.cls ?? 'tertiary';
  return pts;
}
function atDistanceOf(p) {
  return s => {
    if (s <= 0) return { x: p[0].x, y: p[0].y, h: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) };
    let i = 1;
    while (i < p.length - 1 && p[i].s < s) i++;
    const a = p[i - 1], b = p[i], t = (s - a.s) / Math.max(1e-6, b.s - a.s);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: Math.atan2(b.y - a.y, b.x - a.x) };
  };
}

// Every route of hers over a crossing: each ordered pair of places she can
// ride between whose route goes over one.
const routes = [];
for (const from of Object.keys(R.tg.anchors)) {
  for (const to of trikeyRoads.reachableFrom(R, from)) {
    const path = trikeyRoads.shortestPath(R.adj, R.tg.anchors[from], R.tg.anchors[to]);
    if (!path) continue;
    const pts = polyline(path);
    if (!pts.some(p => p.cls === 'crossing')) continue;
    const kinds = lights.create({ points: pts, length: pts[pts.length - 1].s, atDistance: atDistanceOf(pts) }, {
      graph: base, toWorld, insideA28: shown.insideA28, a28Of, lane: LANE_M, island: ISLAND_M, sound: false,
    }).crossings.map(c => c.kind);
    routes.push({ from, to, pts, kinds });
  }
}

// ------------------------------------------------------------- geometry

function corners(x, y, h, L, W) {
  const c = Math.cos(h), s = Math.sin(h), l = L / 2, w = W / 2;
  return [[x + c * l - s * w, y + s * l + c * w], [x + c * l + s * w, y + s * l - c * w],
    [x - c * l + s * w, y - s * l - c * w], [x - c * l - s * w, y - s * l + c * w]];
}
function segPt(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
function overlap(A, B) {
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const pa = A.map(p => p[0] * nx + p[1] * ny), pb = B.map(p => p[0] * nx + p[1] * ny);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}
function gap(A, B) {
  if (overlap(A, B)) return 0;
  let d = Infinity;
  for (let i = 0; i < 4; i++) for (const p of A) d = Math.min(d, segPt(p, B[i], B[(i + 1) % 4]));
  for (let i = 0; i < 4; i++) for (const p of B) d = Math.min(d, segPt(p, A[i], A[(i + 1) % 4]));
  return d;
}

// ------------------------------------------------------------- the runs

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), s | 1) + 0x6d2b79f5) >>> 0; return ((s ^ (s >>> 14)) >>> 0) / 4294967296; };
}

const fail = [];
const stats = {
  runs: 0, frames: 0, seconds: 0, crossings: new Map(), presses: 0, pressesCounted: 0, cycles: 0,
  closest: Infinity, closestOn: Infinity, closestOnBand: Infinity, minGap: Infinity, maxDecel: 0,
  pressToGreen: [], throughOnAmber: 0, throughAfterRed: 0, stoppedAtLine: 0, rough: 0, nudges: 0,
  idleTimeouts: 0, prompts: 0, longestStand: 0, vehicles: 0, longestRun: 0, noPressGreen: 0,
  queueMax: 0, waits: { amber: [], red: [] },
};
const BEHAVIOURS = ['early', 'atLine', 'late', 'mash', 'dawdle', 'halfway', 'pushRed', 'brakes'];

for (let run = 0; run < RUNS; run++) {
  const seed = FIRST + run;
  const rand = rng(seed * 7919 + 13);
  // Half the runs on each crossing: few of her routes use the divided one.
  const pool = routes.filter(r => r.kinds.includes(run % 2 ? 'divided' : 'single'));
  const route = pool[((run / 2) | 0) % pool.length];
  const pts = route.pts, atDistance = atDistanceOf(pts), length = pts[pts.length - 1].s;
  const L = lights.create({ points: pts, length, atDistance }, {
    graph: base, toWorld, insideA28: shown.insideA28, a28Of, lane: LANE_M, island: ISLAND_M, seed, sound: false,
  });
  if (!L.crossings.length) { fail.push(`${route.from}->${route.to}: a crossing class on the route but no crossing found`); continue; }
  const C0 = L.crossings.find(c => c.kind === (run % 2 ? 'divided' : 'single'));
  const key = `${C0.kind} ${Math.round(C0.sB - C0.sA)} m`;
  stats.crossings.set(key, (stats.crossings.get(key) ?? 0) + 1);
  const how = BEHAVIOURS[run % BEHAVIOURS.length];
  const dt = run % 5 === 4 ? 1 / 30 : 1 / 60;
  // Her state, as the page's car.
  const car = { s: Math.max(0, C0.sA - (40 + rand() * 260)), v: 0, length: TRIKEY_L, felt: 0 };
  let gear = rand() < 0.6 ? 1 : rand() < 0.7 ? 2 : 3, throttle = true, handbrake = false;
  const pressAt = how === 'early' ? 5 + rand() * 38 : null;    // metres before the kerb
  const waitFor = how === 'late' ? 8 + rand() * 22 : how === 'pushRed' ? 4 + rand() * 6 : rand() * 3;
  const dawdle = how === 'dawdle' ? 3 + rand() * 20 : 0;
  let pressedEver = false, greenAt = null, dawdled = false, stopT = 0, haltT = 0, stand = new Map(), prevFront = new Map();
  let phaseLog = [], wasOn = false, t = 0, enteredOnce = false, pressing = false, owed = 0;
  const phaseAt = {};
  L.onPhase = (C, from, to) => {
    phaseLog.push(to);
    // A demand only from a press: one counted this frame, or one kept while
    // the lights went back to the traffic.
    if (to === 'demand' && (from !== 'green' || !(pressing || owed-- > 0))) fail.push(`seed ${seed}: the lights were asked for without a press`);
    if (to === 'amber' && from !== 'demand') fail.push(`seed ${seed}: amber from ${from}, not after a press`);
    if (to === 'amber') stats.cycles++;
    phaseAt[to] = L.time;
    if (to === 'cross') {
      stats.waits.amber.push(phaseAt.amber - C.pressAt);
      stats.waits.red.push(L.time - phaseAt.red);
    }
  };
  const press = () => {
    stats.presses++;
    const C = L.crossings.find(c => car.s - car.length / 2 < c.sB + 0.3);
    const kept = C && (C.phase === 'clear' || C.phase === 'redamber') && !C.pending;
    pressing = true;
    if (lights.press(L, car)) { stats.pressesCounted++; pressedEver = true; if (kept) owed++; }
    pressing = false;
  };
  const LIMIT = 240;
  let done = false;
  for (t = 0; t < LIMIT; t += dt) {
    const C = L.crossings.find(c => car.s - car.length / 2 < c.sB + 0.3) ?? null;
    const front = car.s + car.length / 2, rear = car.s - car.length / 2;
    if (!C) { done = true; break; }
    // The child.
    const toKerb = C.sA - front;
    const stopped = car.v < 0.15 && toKerb < 1.2 && toKerb >= 0;
    stopT = stopped && C.phase !== 'cross' ? stopT + dt : 0;
    throttle = true; handbrake = false;
    if (how === 'early' && toKerb < pressAt && !pressedEver && toKerb > 0) press();
    if (stopT > waitFor && C.phase === 'green') press();
    if (how === 'mash' && toKerb < 30 && rand() < 0.08) press();
    if (how === 'pushRed') throttle = true;
    else if (stopped && C.phase !== 'cross') throttle = rand() < 0.3;   // fidgeting on the go
    if (C.phase === 'cross') {
      greenAt ??= t;
      if (how === 'dawdle' && !dawdled && t - greenAt < dawdle && front <= C.sA) throttle = false;
    } else { if (greenAt !== null) dawdled = true; greenAt = null; }
    if (how === 'halfway' && front > (C.sA + C.sB) / 2 && haltT < 4) { throttle = false; haltT += dt; }
    if (how === 'brakes' && rand() < 0.01) handbrake = true;
    if (rand() < 0.002) gear = 1 + ((rand() * 3) | 0);
    // The page's step(): the lights first, then her.
    const out = lights.step(L, dt, car, throttle);
    if (out.events.includes('press-button')) stats.prompts++;
    if (out.nudge > 0.5) stats.nudges++;
    const gearV = GEARS[gear];
    const target = throttle ? gearV : 0;
    let capped = 0;
    if (car.v > out.speedCap) {
      const v0 = car.v;
      car.v = Math.max(out.speedCap, car.v - EMERGENCY * dt);
      capped = (v0 - car.v) / dt;
    } else if (handbrake) car.v = Math.max(0, car.v - HANDBRAKE * dt);
    else if (car.v < target) {
      const pull = Math.max(TOP_PULL, Math.min(1, (gearV - car.v) / TOP_OUT));
      car.v = Math.min(target, out.speedCap, car.v + ACCEL * pull * dt);
    } else if (throttle && target === gearV) car.v = Math.max(target, car.v - ENGINE_EASE * dt);
    else car.v = Math.max(target, car.v - BRAKE * dt);
    car.felt += (capped - car.felt) * (1 - Math.exp(-dt / FELT_S));
    if (capped > 0 && car.felt > BRAKE + 0.5) stats.rough++;
    const prevS = car.s;
    car.s = Math.min(length - 6, car.s + car.v * dt);
    if (car.s >= length - 6 - 1e-6 && car.v > 0) car.v = 0;
    stats.frames++;

    // Judge the frame.
    const f1 = car.s + car.length / 2, r1 = car.s - car.length / 2;
    for (const D of L.crossings) {
      const on = f1 > D.sA && r1 < D.sB;
      if (on && D.phase !== 'cross') fail.push(`seed ${seed} ${route.from}->${route.to}: on the carriageway while the lights are ${D.phase} (t ${t.toFixed(2)})`);
      if (prevS + car.length / 2 <= D.sA && f1 > D.sA) {
        enteredOnce = true;
        if (!lights.figureGreen(D)) fail.push(`seed ${seed}: rode onto the crossing without the green cycle`);
      }
      if (D === C && stopped && D.phase === 'green' && !wasOn) { stats.stoppedAtLine++; wasOn = true; }
      const sig = lights.signal(D);
      const P = atDistance(car.s);
      const me = corners(P.x, P.y, P.h, car.length, TRIKEY_W);
      const lanes = new Map();
      for (const w of D.vehicles) {
        const xf = w.d * (w.q - D.q0) + w.L / 2, xr = xf - w.L;
        const was = prevFront.get(w);
        prevFront.set(w, { xf, v: w.v });
        if (was) {
          const decel = (was.v - w.v) / dt;
          stats.maxDecel = Math.max(stats.maxDecel, decel);
          if (was.xf <= -lights.STOP.LINE && xf > -lights.STOP.LINE && sig !== 'green') {
            if (!w.through) fail.push(`seed ${seed}: a ${w.kind} went past its stop line on ${sig}`);
            else if (sig === 'amber') stats.throughOnAmber++;
            else stats.throughAfterRed++;
          }
        } else stats.vehicles++;
        if (sig !== 'green' && !w.through && xf > -lights.STOP.LINE + 1e-6) fail.push(`seed ${seed}: a ${w.kind} stands past its stop line on ${sig}`);
        if (on && xf > -lights.STOP.BAND && xr < lights.STOP.BAND) fail.push(`seed ${seed}: a ${w.kind} on the crossing while Trikey is on it`);
        if (on && xf > -lights.STOP.LINE && xr < lights.STOP.BAND + 0.5) fail.push(`seed ${seed}: a ${w.kind} past its line while Trikey is on the carriageway`);
        const fp = lights.footprint(D, w);
        const g = gap(me, corners(fp.x, fp.y, fp.h, fp.L, fp.W));
        stats.closest = Math.min(stats.closest, g);
        if (on) stats.closestOn = Math.min(stats.closestOn, g);
        if (g === 0) fail.push(`seed ${seed}: a ${w.kind} touched Trikey`);
        const st = w.v < 0.05 ? (stand.get(w) ?? 0) + dt : 0;
        stand.set(w, st);
        stats.longestStand = Math.max(stats.longestStand, st);
        if (!lanes.has(w.li)) lanes.set(w.li, []);
        lanes.get(w.li).push([xf, xr, w]);
      }
      for (const list of lanes.values()) {
        list.sort((a, b) => b[0] - a[0]);
        stats.queueMax = Math.max(stats.queueMax, list.filter(([xf, , w]) => xf < 0 && w.v < 0.3).length);
        for (let i = 1; i < list.length; i++) {
          const gp = list[i - 1][1] - list[i][0];
          stats.minGap = Math.min(stats.minGap, gp);
          if (gp < 0) fail.push(`seed ${seed}: two vehicles overlap in a lane (${gp.toFixed(2)} m)`);
        }
      }
    }
    if (rear > C0.sB + 30) { done = true; break; }
  }
  stats.runs++; stats.seconds += t; stats.longestRun = Math.max(stats.longestRun, t);
  if (!done) fail.push(`seed ${seed} ${route.from}->${route.to} (${how}): not over the crossing in ${LIMIT} s (phase ${C0.phase}, s ${car.s.toFixed(1)} of kerb ${C0.sA.toFixed(1)})`);
  for (const D of L.crossings) {
    stats.pressToGreen.push(...D.pressToGreen);
    for (const x of D.pressToGreen) if (x > 12) fail.push(`seed ${seed}: press to green took ${x.toFixed(1)} s`);
  }
  for (const D of L.crossings) stats.idleTimeouts += D.unused;
  if (stats.longestStand > 90) fail.push(`seed ${seed}: a vehicle stood ${stats.longestStand.toFixed(0)} s`);
  if (fail.length > 30) break;
}

// The lights alone, no press: an hour at each crossing with her standing
// short of the kerb (she never presses): the traffic's light stays green.
for (const [i, rt] of routes.slice(0, 4).entries()) {
  const pts = rt.pts, atDistance = atDistanceOf(pts);
  const L = lights.create({ points: pts, length: pts[pts.length - 1].s, atDistance }, {
    graph: base, toWorld, insideA28: shown.insideA28, a28Of, lane: LANE_M, island: ISLAND_M, seed: 900 + i, sound: false,
  });
  const C = L.crossings[0];
  const car = { s: C.sA - 10, v: 0, length: TRIKEY_L };
  for (let t = 0; t < 3600; t += 1 / 30) {
    const out = lights.step(L, 1 / 30, car, true);
    car.v = Math.min(3.5, out.speedCap, car.v + 9 / 30);
    car.s += car.v / 30;
    if (lights.signal(C) !== 'green') { fail.push(`no press: the lights went ${lights.signal(C)} at ${rt.from}->${rt.to}`); break; }
    if (car.s + car.length / 2 > C.sA) { fail.push('no press: she rode onto the carriageway'); break; }
    stats.noPressGreen += 1 / 30;
  }
}

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const ptg = stats.pressToGreen;
console.log(`lights.check: ${stats.runs} runs (seeds ${FIRST}-${FIRST + stats.runs - 1}) over ${routes.length} of her routes through a crossing, ${(stats.seconds / 60).toFixed(0)} simulated minutes, ${stats.frames} frames`);
console.log(`  crossings driven: ${[...stats.crossings].map(([k, n]) => `${k} x${n}`).join(', ')}`);
console.log(`  presses ${stats.presses} (counted ${stats.pressesCounted}), light cycles ${stats.cycles}, prompts to press ${stats.prompts}, frames nudging on red ${stats.nudges}, green cycles left unused ${stats.idleTimeouts}`);
console.log(`  press to green: min ${q(ptg, 0).toFixed(1)} s, median ${q(ptg, 0.5).toFixed(1)} s, 90% ${q(ptg, 0.9).toFixed(1)} s, max ${q(ptg, 1).toFixed(1)} s (${ptg.length} greens)`);
console.log(`    of it, press to amber: median ${q(stats.waits.amber, 0.5).toFixed(1)} s, max ${q(stats.waits.amber, 1).toFixed(1)} s; red to green cycle (the lanes stopping and the pause): median ${q(stats.waits.red, 0.5).toFixed(1)} s, 90% ${q(stats.waits.red, 0.9).toFixed(1)} s, max ${q(stats.waits.red, 1).toFixed(1)} s`);
console.log(`  A28 vehicles ${stats.vehicles}; through on amber (too close to stop) ${stats.throughOnAmber}, of them over the line after red ${stats.throughAfterRed}; longest queue ${stats.queueMax}, longest stand ${stats.longestStand.toFixed(1)} s, hardest braking ${stats.maxDecel.toFixed(2)} m/s², closest bumpers ${stats.minGap.toFixed(2)} m`);
console.log(`  closest any vehicle came to Trikey ${stats.closest.toFixed(2)} m; while she was on the carriageway ${stats.closestOn === Infinity ? 'none in reach' : stats.closestOn.toFixed(2) + ' m'}`);
console.log(`  her stop at the kerb felt as rough: ${stats.rough} frames; longest run ${stats.longestRun.toFixed(0)} s`);
console.log(`  no press: ${(stats.noPressGreen / 60).toFixed(0)} minutes with her waiting short of the kerb, the traffic's light green throughout`);
if (fail.length) {
  console.log('FAIL');
  for (const f of [...new Set(fail)].slice(0, 30)) console.log('  ' + f);
  process.exit(1);
}
console.log('PASS: no vehicle past its stop line on red, none on the crossing with her, she never rode on red, no deadlock, no red without a press.');
