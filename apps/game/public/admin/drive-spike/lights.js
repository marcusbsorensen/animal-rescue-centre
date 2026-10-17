// lights.js — Trikey's toucan crossings of the A28 in the drive spike.
//
// Why it exists: Trikey crosses the A28 only at the lights (18A), and she used
// to ride straight over. Marcus, 2026-10-13 (62A): she stops, the child
// presses the crossing button, and she rides over when the green signal
// shows. It is the habit a child should copy, so the crossing is a real UK
// toucan (the kind a cyclist may ride across): signal heads for the A28,
// stop lines and zig-zags on the carriageway, a push-button box on a pole on
// each kerb with a WAIT lamp and the green-cycle-and-green-man figure.
//
// The contract (drive-spike.html and lights.check.mjs call it):
//   create(route, world)  once per route: finds her crossings of the A28 on
//                          it (a run of route class 'crossing' whose middle
//                          is inside the A28 as drawn) and lays out each.
//   step(L, dt, car, throttle) every frame, before the van moves: runs each
//                          crossing's lights and the A28's traffic there, and
//                          returns { speedCap, nudge, events } for her.
//   press(L, car)         the button (the P key): the crossing ahead of her
//                          within PRESS_REACH. Returns whether it counted.
//   hit(L, x, y)          a tap at canvas CSS px: whether it is on a box,
//                          which then presses it.
//   drawGround / draw     the markings (after the roads), then the A28's
//                          traffic, the signal heads and the boxes.
//
// How it is kept safe. Along the A28 everything is reasoned in x, metres
// from her path along each vehicle's own direction of travel (her path is
// x = 0, the crossing is |x| < BAND, the stop line's near edge -STOP_LINE):
//   - she cannot ride onto the carriageway unless the figure is green: her
//     speed cap brings her front to rest KERB_BACK short of the kerb, gently,
//     as the van pulls up at a gate. Holding go there only nudges her
//     forward against the brakes, drawn and not ridden;
//   - the lights go to amber only after a press. On amber each vehicle that
//     can stop at the line at AMBER_STOP does, and one too close goes on
//     through, as in real life. Nothing ever brakes harder than HARD; a
//     vehicle on red is capped to stand with its front at -STOP_FRONT;
//   - the figure goes green only when no vehicle is between its stop line
//     and the far side of the crossing, and every lane's first vehicle near
//     the line has stopped, after an ALL_RED pause;
//   - the traffic's green comes back only when she is clear of the
//     carriageway, or, if she never sets off, after the figure has shown for
//     IDLE_FIGURE seconds with her standing still short of the kerb (then
//     she presses again).
// lights.check.mjs proves all of it over many seeds and her real routes.

import * as traffic from './traffic.js';

const BAND = 2;            // half the crossing's width along the A28, m (a toucan is 4 m or more)
const STOP_LINE = 3.7;     // the stop line's crossing-side edge, m before her path
const LINE_W = 0.3;
const STOP_FRONT = STOP_LINE + LINE_W + 0.4;   // where a stopping vehicle's front stands
const GAP = 2.5;           // bumper to bumper, as traffic.js
const KERB_BACK = 0.6;     // her front stands this far short of the kerb
const TRIKE_STOP = 2.5;    // m/s²: her gentle stop at the kerb, the van's PULL_UP
const NUDGE_RISE = 10, NUDGE_FALL = 5;   // 1/s: the nudge against the brakes
export const PRESS_REACH = 45;  // m: she may press from this far before the kerb
const ACTIVE_BEFORE = 400, ACTIVE_AFTER = 250;   // m of her route where a crossing runs
const REACH = 170;         // m of the A28 driven each side of the crossing
const SPACING = 75;        // mean m between vehicles in a lane
const MPH = 0.44704;
// The cycle, seconds. Press to green is PRESS_DELAY + AMBER + the last
// vehicle settling + ALL_RED: about 5 to 6 s.
const PRESS_DELAY = 0.6, MIN_GREEN = 3, AMBER = 3, ALL_RED = 1, CLEAR_RED = 1, RED_AMBER = 1.5;
const IDLE_FIGURE = 15;
const AMBER_STOP = 4.5;    // m/s²: on amber a vehicle stops if it can at this
const HARD = 6;            // m/s²: no vehicle is ever planned to brake harder
const SETTLED_V = 0.3, SETTLED_M = 25, SETTLE_CLEAR = 3, CREEP_V = 1;
const PLAN_STOP = 2.2;     // m/s²: how gently a vehicle plans its stop at the line, at least
const PROMPT_AFTER = 0.5, PROMPT_EVERY = 9;   // s: the toast to press, once stopped

export const STOP = { LINE: STOP_LINE, FRONT: STOP_FRONT, BAND, KERB_BACK };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** traffic.js's: the speed from which braking at `rate`, starting next frame,
 *  stops within `room`. */
function stopSpeed(room, rate, dt) {
  if (room <= 0) return 0;
  return rate * (-dt + Math.sqrt(dt * dt + 2 * room / rate));
}
/** traffic.js's Intelligent Driver Model. */
function idm(v, v0, gap, dv) {
  const a = 1.6, b = 2.4, T = 1.2, s0 = GAP;
  const free = 1 - Math.pow(v / Math.max(0.5, v0), 4);
  if (!isFinite(gap)) return a * free;
  const sStar = s0 + Math.max(0, v * T + v * dv / (2 * Math.sqrt(a * b)));
  return a * (free - Math.pow(sStar / Math.max(0.1, gap), 2));
}
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), s | 1) + 0x6d2b79f5) >>> 0; return ((s ^ (s >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ layout

const trunkAdj = new WeakMap();
/** The A28 through a point: the trunk edges of the game graph walked each
 *  way from the nearest one, straightest first, REACH and a little more,
 *  as a polyline in world metres. */
function a28Line(graph, toWorld, M) {
  let adj = trunkAdj.get(graph);
  if (!adj) {
    adj = new Map();
    graph.edges.forEach(([a, b, c], k) => {
      if (c !== 'trunk' || !graph.nodes[a] || !graph.nodes[b]) return;
      for (const [u, v] of [[a, b], [b, a]]) { if (!adj.has(u)) adj.set(u, []); adj.get(u).push([v, k]); }
    });
    trunkAdj.set(graph, adj);
  }
  const at = n => { const w = toWorld(graph.nodes[n][0], graph.nodes[n][1]); return [w.x, w.y]; };
  let best = null;
  graph.edges.forEach(([a, b, c], k) => {
    if (c !== 'trunk' || !graph.nodes[a] || !graph.nodes[b]) return;
    const p = at(a), q = at(b), dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy || 1;
    const t = clamp(((M[0] - p[0]) * dx + (M[1] - p[1]) * dy) / L2, 0, 1);
    const d = Math.hypot(M[0] - p[0] - dx * t, M[1] - p[1] - dy * t);
    if (!best || d < best.d) best = { d, a, b, k };
  });
  if (!best) return null;
  const walk = (prev, from) => {
    const out = [];
    let len = 0, p = prev, u = from;
    while (len < REACH + 60) {
      const here = at(u), back = at(p);
      const h0 = Math.atan2(here[1] - back[1], here[0] - back[0]);
      let next = null, turn = Infinity;
      for (const [v] of adj.get(u) ?? []) {
        if (v === p) continue;
        const nx = at(v), d = Math.abs(Math.atan2(Math.sin(Math.atan2(nx[1] - here[1], nx[0] - here[0]) - h0), Math.cos(Math.atan2(nx[1] - here[1], nx[0] - here[0]) - h0)));
        if (d < turn) { turn = d; next = v; }
      }
      if (next === null || turn > 1.2) break;
      const nx = at(next);
      len += Math.hypot(nx[0] - here[0], nx[1] - here[1]);
      out.push(nx);
      p = u; u = next;
    }
    return out;
  };
  const pts = [...walk(best.b, best.a).reverse(), at(best.a), at(best.b), ...walk(best.a, best.b)];
  const qs = [0];
  for (let i = 1; i < pts.length; i++) qs.push(qs[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, qs, len: qs[qs.length - 1], edge: best.k };
}
/** Where on the polyline: its point, its unit tangent and left normal. */
function lineAt(P, q) {
  q = clamp(q, 0, P.len);
  let i = 1;
  while (i < P.pts.length - 1 && P.qs[i] < q) i++;
  const a = P.pts[i - 1], b = P.pts[i], L = P.qs[i] - P.qs[i - 1] || 1, t = (q - P.qs[i - 1]) / L;
  const tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx, ty, lx: ty, ly: -tx };
}
function project(P, x, y) {
  let best = null;
  for (let i = 1; i < P.pts.length; i++) {
    const a = P.pts[i - 1], b = P.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L2, 0, 1);
    const d = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
    if (!best || d < best.d) best = { d, q: P.qs[i - 1] + t * Math.sqrt(L2) };
  }
  return best.q;
}

/**
 * Her crossings on a route.
 * @param {{ points: {s:number, cls:string}[], length: number, atDistance: (s:number) => {x:number, y:number, h:number} }} route
 * @param {{ graph, toWorld: (fx:number, fy:number) => {x:number, y:number}, insideA28: (x:number, y:number) => boolean,
 *   a28Of: (edge:number) => { kind: string, lanes: number, mph: number, half: number }, lane: number, island: number,
 *   seed?: number, sound?: boolean }} world
 */
export function create(route, world) {
  const L = { crossings: [], time: 0, rand: rng(world.seed ?? (Math.random() * 2 ** 32)), nextId: 1,
    sound: world.sound ?? typeof window !== 'undefined', onPhase: null };
  const P = route.points;
  for (let i = 1; i < P.length; i++) {
    if (P[i].cls !== 'crossing' || P[i - 1].cls === 'crossing' && i > 1) continue;
    let j = i;
    while (j + 1 < P.length && P[j + 1].cls === 'crossing') j++;
    // The carriageway: the longest run of the crossing's points inside the A28.
    let run = null, cur = null;
    for (let s = P[i - 1].s; s <= P[j].s; s += 0.1) {
      const p = route.atDistance(s);
      if (world.insideA28(p.x, p.y)) { if (!cur) cur = { a: s, b: s }; cur.b = s; }
      else if (cur) { if (!run || cur.b - cur.a > run.b - run.a) run = cur; cur = null; }
    }
    if (cur && (!run || cur.b - cur.a > run.b - run.a)) run = cur;
    if (!run || run.b - run.a < 3) continue;
    const A = route.atDistance(run.a), B = route.atDistance(run.b);
    const M = [(A.x + B.x) / 2, (A.y + B.y) / 2];
    const line = a28Line(world.graph, world.toWorld, M);
    if (!line) continue;
    const q0 = project(line, M[0], M[1]);
    const rec = world.a28Of(line.edge);
    const at0 = lineAt(line, q0);
    const sigma = (A.x - at0.x) * at0.lx + (A.y - at0.y) * at0.ly >= 0 ? 1 : -1;
    // Lanes: each way, keeping left. Divided: the data's lanes either side
    // of the island; single, one each way down the middle of each half.
    const lanes = [];
    for (const d of [1, -1]) {
      if (rec.kind === 'divided') {
        for (let k = 0; k < Math.max(1, rec.lanes); k++) lanes.push({ d, off: world.island / 2 + world.lane * (k + 0.5) });
      } else lanes.push({ d, off: rec.half / 2 });
    }
    L.crossings.push({
      id: L.crossings.length, sA: run.a, sB: run.b, line, q0, sigma, half: rec.half, kind: rec.kind, island: world.island,
      vmax: (rec.mph || 30) * MPH, lanes: lanes.map(l => ({ ...l, due: 0 })),
      phase: 'green', t: 0, greenFor: MIN_GREEN, ready: 0, idle: 0, pressAt: null, pressToGreen: [], unused: 0,
      active: false, vehicles: [], atLine: 0, prompted: null, glow: 0, nudge: 0, pips: 0, pipT: 0,
      hits: [], art: null,
    });
  }
  return L;
}

// ------------------------------------------------------------------ the cycle

/** What the A28's traffic sees, and what the boxes show. */
export function signal(C) {
  switch (C.phase) {
    case 'green': case 'demand': return 'green';
    case 'amber': return 'amber';
    case 'redamber': return 'redamber';
    default: return 'red';
  }
}
export const figureGreen = C => C.phase === 'cross';
export const waitLit = C => C.phase === 'demand' || C.phase === 'amber' || C.phase === 'red';

function goTo(L, C, phase) {
  const from = C.phase;
  C.phase = phase; C.t = 0;
  if (phase === 'cross') { C.pressToGreen.push(L.time - C.pressAt); C.idle = 0; C.pips = 0; C.pipT = 0; }
  if (phase === 'green') C.greenFor = 0;
  if (phase === 'red') C.ready = 0;
  L.onPhase?.(C, from, phase);
  // A press while the lights were going back to the traffic is kept.
  if (phase === 'green' && C.pending) { C.pending = false; goTo(L, C, 'demand'); }
}

/** The crossing ahead of her: the first she is not yet clear of. */
function ahead(L, car) {
  const rear = car.s - (car.length ?? 2) / 2;
  return L.crossings.find(C => rear < C.sB + 0.3) ?? null;
}

export function press(L, car, C = ahead(L, car)) {
  if (!C || car.s < C.sA - PRESS_REACH || car.s - (car.length ?? 2) / 2 > C.sB) return false;
  if (C.phase === 'cross') return false;
  if (C.phase === 'green') { C.pressAt = L.time; goTo(L, C, 'demand'); }
  else if ((C.phase === 'clear' || C.phase === 'redamber') && !C.pending) { C.pending = true; C.pressAt = L.time; }
  beep(L);
  return true;
}

/** Whether a tap (canvas CSS px) is on a box drawn last frame, and press it. */
export function hit(L, x, y, car) {
  for (const C of L.crossings) {
    for (const r of C.hits) {
      if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) { press(L, car, C); return true; }
    }
  }
  return false;
}

/** The lights, the traffic and her, for one frame. */
export function step(L, dt, car, throttle) {
  L.time += dt;
  const out = { speedCap: Infinity, nudge: 0, events: [] };
  const mine = ahead(L, car);
  for (const C of L.crossings) {
    const on = car.s > C.sA - ACTIVE_BEFORE && car.s < C.sB + ACTIVE_AFTER;
    if (!on) {
      if (C.active) { C.active = false; C.vehicles = []; C.phase = 'green'; C.greenFor = MIN_GREEN; }
      continue;
    }
    if (!C.active) { C.active = true; populate(L, C); }
    cycle(L, C, dt, car, C === mine);
    drive(L, C, dt);
  }
  if (mine && mine.active) {
    const C = mine, len = car.length ?? 2;
    const front = car.s + len / 2, rear = car.s - len / 2;
    const entered = front > C.sA;
    const stopAt = C.sA - KERB_BACK - len / 2;
    if (C.phase !== 'cross' && !entered) out.speedCap = Math.sqrt(2 * TRIKE_STOP * Math.max(0, stopAt - car.s));
    const atLine = !entered && car.s > stopAt - 0.4 && car.v < 0.15 && C.phase !== 'cross';
    C.atLine = atLine ? C.atLine + dt : 0;
    // After she has stopped and nobody has pressed: the box glows, and a
    // toast says to press it.
    const want = atLine && C.phase === 'green';
    if (!atLine) C.prompted = null;
    if (want && C.atLine > PROMPT_AFTER && (C.prompted === null || C.atLine - C.prompted > PROMPT_EVERY)) {
      out.events.push('press-button'); C.prompted = C.atLine;
    }
    C.glow = clamp(C.glow + (want ? 2.5 : -4) * dt, 0, 1);
    const push = atLine && throttle;
    C.nudge = clamp(C.nudge + (push ? NUDGE_RISE : -NUDGE_FALL) * dt, 0, 1);
    out.nudge = C.nudge;
    // The crossing's beeping while the figure is green and she is yet to
    // cross, for a few seconds.
    if (C.phase === 'cross' && rear < C.sA + 1 && C.pips < 6) {
      C.pipT -= dt; C.pips += dt;
      if (C.pipT <= 0) { C.pipT = 0.42; pip(L); }
    }
  }
  for (const C of L.crossings) if (C !== mine) { C.glow = 0; C.nudge = 0; }
  return out;
}

function cycle(L, C, dt, car, mine) {
  C.t += dt;
  if (signal(C) === 'green') C.greenFor += dt;
  const len = car.length ?? 2;
  const front = car.s + len / 2, rear = car.s - len / 2;
  switch (C.phase) {
    case 'demand':
      if (C.t >= PRESS_DELAY && C.greenFor >= MIN_GREEN) goTo(L, C, 'amber');
      break;
    case 'amber':
      if (C.t >= AMBER) goTo(L, C, 'red');
      break;
    case 'red':
      C.ready = clear(C) ? C.ready + dt : 0;
      if (C.ready >= ALL_RED) goTo(L, C, 'cross');
      break;
    case 'cross': {
      // Green until she is clear of the carriageway; and if she never sets
      // off, after IDLE_FIGURE seconds standing still short of the kerb.
      if (mine && rear > C.sB + 0.2) { goTo(L, C, 'clear'); break; }
      if (!mine) { goTo(L, C, 'clear'); break; }
      const still = front <= C.sA && car.v < 0.1;
      C.idle = still ? C.idle + dt : 0;
      if (C.idle >= IDLE_FIGURE) { C.unused++; goTo(L, C, 'clear'); }
      break;
    }
    case 'clear':
      if (C.t >= CLEAR_RED) goTo(L, C, 'redamber');
      break;
    case 'redamber':
      if (C.t >= RED_AMBER) goTo(L, C, 'green');
      break;
  }
}

/** x of a vehicle's front and rear: metres from her path along its way. */
const frontX = (C, w) => w.d * (w.q - C.q0) + w.L / 2;

/** Nothing between its stop line and the far side of the crossing, and every
 *  lane held: the vehicle nearest its line standing, or pulling up on its
 *  plan either still SETTLE_CLEAR back (one arriving at the back of an empty
 *  lane, plainly stopping) or creeping the last metres. Those behind are on
 *  red and capped to stop. */
function clear(C) {
  const nearest = C.lanes.map(() => null);
  for (const w of C.vehicles) {
    const xf = frontX(C, w), xr = xf - w.L;
    if (xf > -STOP_LINE && xr < BAND + 0.5) return false;
    if (xf <= -STOP_LINE && xf > -STOP_LINE - SETTLED_M && (!nearest[w.li] || xf > nearest[w.li].xf)) nearest[w.li] = { w, xf };
  }
  for (const n of nearest) {
    if (!n || n.w.v <= SETTLED_V) continue;
    const room = -STOP_FRONT - n.xf;
    if (n.w.through || (room < SETTLE_CLEAR && n.w.v > CREEP_V) || n.w.v * n.w.v / (2 * Math.max(0.01, room)) > n.w.brake + 0.05) return false;
  }
  return true;
}

// ------------------------------------------------------------------ traffic

function newVehicle(L, C, li, xf, v) {
  const lane = C.lanes[li];
  const k = traffic.mainRoadVehicle(L.rand, lane.d * C.sigma < 0);
  const w = { id: 'x' + L.nextId++, li, d: lane.d, off: lane.off, ...k, pace: 0.9 + L.rand() * 0.2, v: 0, through: false, decided: false };
  w.q = C.q0 + lane.d * (xf - w.L / 2);
  w.v = v ?? Math.min(C.vmax, w.cruise * w.pace);
  return w;
}
/** The x where a lane's traffic comes on: REACH back, or the A28's end. */
function startX(C, d) { return -Math.min(REACH, d > 0 ? C.q0 : C.line.len - C.q0); }
function endX(C, d) { return Math.min(REACH, d > 0 ? C.line.len - C.q0 : C.q0); }

function populate(L, C) {
  C.vehicles = [];
  C.lanes.forEach((lane, li) => {
    let x = startX(C, lane.d) + 6 + L.rand() * SPACING;
    while (x < endX(C, lane.d) - 6) {
      const w = newVehicle(L, C, li, x);
      C.vehicles.push(w);
      x += w.L + 12 + -Math.log(1 - L.rand()) * (SPACING - 12);
    }
    lane.due = -Math.log(1 - L.rand()) * SPACING / 11;
  });
}

function drive(L, C, dt) {
  const sig = signal(C);
  const byLane = C.lanes.map(() => []);
  for (const w of C.vehicles) byLane[w.li].push(w);
  for (const list of byLane) {
    list.sort((a, b) => frontX(C, b) - frontX(C, a));
    for (let i = 0; i < list.length; i++) {
      const w = list[i], lead = i > 0 ? list[i - 1] : null;
      const xf = frontX(C, w);
      const v0 = Math.min(C.vmax, w.cruise * w.pace);
      let gap = Infinity, dv = 0;
      if (lead) { gap = frontX(C, lead) - lead.L - xf; dv = w.v - lead.v; }
      let a = idm(w.v, v0, gap, dv);
      let cap = lead ? stopSpeed(gap - GAP + lead.v * lead.v / (2 * HARD), HARD, dt) : Infinity;
      // The lights. Past its line a vehicle goes on; on amber one that can
      // stop at AMBER_STOP does; on red every one not already going stops.
      const room = -STOP_FRONT - xf;
      if (sig === 'green') { w.decided = false; w.through = false; }
      else if (!w.decided) {
        w.decided = true;
        w.through = xf > -STOP_FRONT + 0.01 || (sig === 'amber' && w.v * w.v / (2 * AMBER_STOP) > room);
        // Its stop: steady, at what it needs or PLAN_STOP if gentler.
        w.brake = clamp(w.v * w.v / (2 * Math.max(0.1, room)), PLAN_STOP, HARD);
      }
      if (sig !== 'green' && !w.through) cap = Math.min(cap, stopSpeed(room, w.brake, dt));
      w.v = Math.max(0, Math.min(Math.max(w.v - HARD * dt, w.v + a * dt), cap));
    }
  }
  for (const w of C.vehicles) w.q += w.d * w.v * dt;
  C.vehicles = C.vehicles.filter(w => frontX(C, w) - w.L < endX(C, w.d) - 1);
  // New traffic at the far end of each lane, never into the back of a queue.
  C.lanes.forEach((lane, li) => {
    lane.due -= dt;
    if (lane.due > 0) return;
    const x0 = startX(C, lane.d);
    let last = Infinity;
    for (const w of byLane[li]) if (C.vehicles.includes(w)) last = Math.min(last, frontX(C, w) - w.L);
    if (last < x0 + 30) { lane.due = 0.5; return; }
    const w = newVehicle(L, C, li, x0 + 6);
    let v = w.v;
    if (isFinite(last)) v = Math.min(v, stopSpeed(last - (x0 + 6) - GAP, 3, 0));
    if (sig !== 'green') v = Math.min(v, stopSpeed(-STOP_FRONT - (x0 + 6), 3, 0));
    w.v = v;
    C.vehicles.push(w);
    lane.due = -Math.log(1 - L.rand()) * SPACING / Math.max(4, w.cruise);
  });
}

/** Where a vehicle is in the world: centre, heading, size. For drawing and
 *  for the check. */
export function footprint(C, w) {
  const p = lineAt(C.line, w.q);
  const off = w.d * w.off;
  return { x: p.x + p.lx * off, y: p.y + p.ly * off, h: Math.atan2(w.d * p.ty, w.d * p.tx), L: w.L, W: w.W };
}

/** Every vehicle at every crossing, with its x from her path, for the check. */
export function vehicles(L) {
  const out = [];
  for (const C of L.crossings) for (const w of C.vehicles) out.push({ C, w, xf: frontX(C, w) });
  return out;
}

// ------------------------------------------------------------------ sound

let audio = null;
function tone(L, f, len, gain, type = 'sine') {
  if (!L.sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime + 0.01;
    const env = audio.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    env.gain.setValueAtTime(gain, t0 + len - 0.02);
    env.gain.linearRampToValueAtTime(0, t0 + len);
    env.connect(audio.destination);
    const o = audio.createOscillator();
    o.type = type; o.frequency.value = f;
    o.connect(env); o.start(t0); o.stop(t0 + len + 0.02);
  } catch { /* no sound is fine: WAIT still lights */ }
}
/** The button's soft beep. */
function beep(L) { tone(L, 880, 0.09, 0.07); }
/** The crossing's beeping while the figure is green: soft, not shrill. */
function pip(L) { tone(L, 1180, 0.07, 0.035, 'triangle'); }

// ------------------------------------------------------------------ drawing

const INK = '#33241a';
const PAINT = '#f4efe2';

/** The markings, painted once per crossing as paths in world metres: stop
 *  lines, the crossing's two broken lines, the zig-zags along each kerb and
 *  the middle, and the red blister paving on each kerb where she waits. */
function markings(C) {
  const paint = new Path2D(), tactile = new Path2D(), dots = new Path2D();
  const P = (q, lat) => { const p = lineAt(C.line, q); return [p.x + p.lx * lat, p.y + p.ly * lat]; };
  // A quad from q0..q1 and lat0..lat1, its corners a hair off true.
  let n = 0;
  const wob = () => { n++; return 0.035 * Math.sin(n * 12.9898 + C.id * 7.1); };
  const quad = (path, qa, qb, la, lb) => {
    const c = [P(qa + wob(), la + wob()), P(qb + wob(), la + wob()), P(qb + wob(), lb + wob()), P(qa + wob(), lb + wob())];
    path.moveTo(c[0][0], c[0][1]); for (let i = 1; i < 4; i++) path.lineTo(c[i][0], c[i][1]); path.closePath();
  };
  const strip = (path, pts, w) => {   // a line of width w through world points
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L * w / 2, ny = (bx - ax) / L * w / 2;
      path.moveTo(ax + nx, ay + ny); path.lineTo(bx + nx, by + ny); path.lineTo(bx - nx, by - ny); path.lineTo(ax - nx, ay - ny); path.closePath();
    }
  };
  const h = C.half, isl = C.kind === 'divided' ? C.island / 2 : 0;
  for (const lane of [1, -1]) {
    // Each way's stop line across its own half, from the middle to the kerb.
    const q = C.q0 - lane * (STOP_LINE + LINE_W / 2);
    quad(paint, q - LINE_W / 2, q + LINE_W / 2, lane * (isl + 0.15), lane * (h - 0.25));
    // The zig-zags: along the kerb and the middle, from the stop line back.
    for (const lat of [lane * (h - 0.55), lane * (isl + 0.35)]) {
      const pts = [];
      const x0 = STOP_LINE + LINE_W + 0.4, x1 = x0 + 16;
      for (let x = x0, k = 0; x <= x1 + 1e-6; x += 2, k++) pts.push(P(C.q0 - lane * x, lat + (k % 2 ? 0.18 : -0.18) * lane));
      strip(paint, pts, 0.14);
    }
  }
  // The crossing's edges: two lines of broken paint across the carriageway.
  for (const e of [-BAND, BAND]) {
    for (let lat = -h + 0.4; lat < h - 0.4; lat += 0.9) {
      if (Math.abs(lat + 0.25) < isl + 0.05) continue;
      quad(dots, C.q0 + e - 0.12, C.q0 + e + 0.12, lat, lat + 0.5);
    }
  }
  // Red blister paving on each kerb, the width of the crossing.
  for (const sd of [1, -1]) {
    quad(tactile, C.q0 - BAND + 0.3, C.q0 + BAND - 0.3, sd * (h + 0.05), sd * (h + 1.25));
    for (let q = C.q0 - BAND + 0.6; q < C.q0 + BAND - 0.4; q += 0.42) {
      for (let lat = h + 0.3; lat < h + 1.1; lat += 0.38) {
        const [x, y] = P(q, sd * lat);
        dots.moveTo(x + 0.06, y); dots.arc(x, y, 0.06, 0, Math.PI * 2);
      }
    }
  }
  return { paint, tactile, dots };
}

export function drawGround(ctx, L, view) {
  for (const C of L.crossings) {
    const m = lineAt(C.line, C.q0);
    if (Math.hypot(m.x - view.cx, m.y - view.cy) > view.radius + 40) continue;
    C.marks ??= markings(C);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#b5534a'; ctx.fill(C.marks.tactile);
    ctx.fillStyle = PAINT; ctx.fill(C.marks.paint);
    ctx.globalAlpha = 0.85;
    ctx.fill(C.marks.dots);
    ctx.restore();
  }
}

/** The boxes and signal heads, painted once per look at twice size: each
 *  stands upright on the screen like the trip strip's fingerposts, sized in
 *  CSS px, its foot at the kerb. */
const BOX = { w: 38, h: 58, pole: 30 };
const HEAD = { w: 18, h: 46, pole: 34 };
const ART = new Map();
function art(key, w, h, paint) {
  let c = ART.get(key);
  if (c || typeof document === 'undefined') return c;
  const S = 3;
  c = document.createElement('canvas'); c.width = w * S; c.height = h * S;
  const g = c.getContext('2d'); g.scale(S, S);
  paint(g);
  ART.set(key, c);
  return c;
}
function roundRect(g, x, y, w, h, r, fill, stroke, lw = 1.6) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
/** The push-button box: the figure panel (the red man standing, or the green
 *  cycle and green man), the WAIT lamp, the big button. */
function boxArt(green, wait) {
  return art(`box:${green}:${wait}`, BOX.w, BOX.h, g => {
    roundRect(g, 1, 1, BOX.w - 2, BOX.h - 2, 6, '#f1c232', INK, 1.8);
    roundRect(g, 3.5, 3.5, BOX.w - 7, 4, 2, 'rgba(255,255,255,.35)');
    // The figure panel.
    roundRect(g, 5, 7, BOX.w - 10, 21, 3.5, '#20201e', INK, 1.2);
    if (green) {
      bike(g, 13, 18.5, '#57e07a');
      man(g, 27.5, 17.5, '#57e07a', true);
    } else {
      bike(g, 13, 18.5, '#3a3f38');
      man(g, 27.5, 17.5, '#ff4a3c', false);
    }
    // WAIT.
    roundRect(g, 7, 31, BOX.w - 14, 10, 2.5, wait ? '#3b1d10' : '#2a2622', INK, 1);
    g.font = '900 8.2px Nunito, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (wait) { g.shadowColor = 'rgba(255,120,60,.95)'; g.shadowBlur = 5; }
    g.fillStyle = wait ? '#ffb04a' : '#5c4b3e';
    g.fillText('WAIT', BOX.w / 2, 36.4);
    g.shadowBlur = 0;
    // The button.
    g.beginPath(); g.arc(BOX.w / 2, 49, 6, 0, Math.PI * 2);
    g.fillStyle = '#d9dcd8'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.arc(BOX.w / 2 - 1.5, 47.5, 2.2, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.8)'; g.fill();
  });
}
/** A cycle, side on, centred at (x, y), about 13 px across. */
function bike(g, x, y, col) {
  g.save(); g.strokeStyle = col; g.lineWidth = 1.5; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.arc(x - 3.6, y + 2.6, 2.8, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(x + 3.6, y + 2.6, 2.8, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(x - 3.6, y + 2.6); g.lineTo(x - 0.6, y - 1.6); g.lineTo(x + 2.6, y - 1.6); g.lineTo(x + 3.6, y + 2.6);
  g.moveTo(x - 0.6, y - 1.6); g.lineTo(x, y + 2.6); g.lineTo(x + 2.6, y - 1.6);
  g.moveTo(x - 1.6, y - 2.8); g.lineTo(x + 0.4, y - 2.8); g.moveTo(x + 2.6, y - 1.6); g.lineTo(x + 2.2, y - 3.6); g.lineTo(x + 3.4, y - 3.6);
  g.stroke(); g.restore();
}
/** A figure: walking (green) or standing (red), centred at (x, y). */
function man(g, x, y, col, walking) {
  g.save(); g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = 2;
  g.beginPath(); g.arc(x, y - 6.2, 1.9, 0, Math.PI * 2); g.fill();
  g.beginPath();
  if (walking) {
    g.moveTo(x - 0.3, y - 3.6); g.lineTo(x + 0.4, y + 1.6);
    g.moveTo(x + 0.4, y + 1.6); g.lineTo(x - 2.4, y + 6.2);
    g.moveTo(x + 0.4, y + 1.6); g.lineTo(x + 3, y + 6.2);
    g.moveTo(x - 0.1, y - 2.6); g.lineTo(x - 3, y + 0.6);
    g.moveTo(x - 0.1, y - 2.6); g.lineTo(x + 2.8, y);
  } else {
    g.moveTo(x, y - 3.6); g.lineTo(x, y + 1.8);
    g.moveTo(x - 0.9, y + 1.6); g.lineTo(x - 1.1, y + 6.3);
    g.moveTo(x + 0.9, y + 1.6); g.lineTo(x + 1.1, y + 6.3);
    g.moveTo(x - 1.4, y - 3); g.lineTo(x - 2.2, y + 1.6);
    g.moveTo(x + 1.4, y - 3); g.lineTo(x + 2.2, y + 1.6);
  }
  g.stroke(); g.restore();
}
/** A signal head for the A28's traffic on its black backboard with the white
 *  edge: red, amber, green. */
function headArt(sig) {
  return art(`head:${sig}`, HEAD.w, HEAD.h, g => {
    roundRect(g, 1, 1, HEAD.w - 2, HEAD.h - 2, 3, '#1b1b1a', INK, 1.4);
    roundRect(g, 2.6, 2.6, HEAD.w - 5.2, HEAD.h - 5.2, 2, null, '#f2efe6', 1.2);
    const lit = { red: sig === 'red' || sig === 'redamber', amber: sig === 'amber' || sig === 'redamber', green: sig === 'green' };
    const lamps = [['red', '#ff3b2f', '#4a1a16'], ['amber', '#ffb21f', '#4a3512'], ['green', '#3ee06a', '#173b20']];
    lamps.forEach(([k, on, off], i) => {
      const y = 9.5 + i * 13.5;
      g.beginPath(); g.arc(HEAD.w / 2, y, 5, 0, Math.PI * 2);
      if (lit[k]) { g.shadowColor = on; g.shadowBlur = 7; }
      g.fillStyle = lit[k] ? on : off; g.fill(); g.shadowBlur = 0;
    });
  });
}
let GLOW = null;
function glowArt() {
  if (GLOW || typeof document === 'undefined') return GLOW;
  const n = 128, c = document.createElement('canvas'); c.width = n; c.height = n;
  const g = c.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  // crossings.js's halo: warm and bright in the middle, feathering through amber.
  gr.addColorStop(0, 'rgba(255,236,160,.95)');
  gr.addColorStop(0.4, 'rgba(255,212,118,.8)');
  gr.addColorStop(0.7, 'rgba(246,176,80,.42)');
  gr.addColorStop(0.9, 'rgba(238,150,58,.12)');
  gr.addColorStop(1, 'rgba(238,150,58,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  return (GLOW = c);
}

/** The A28's traffic at each crossing (as traffic.js draws its own), then
 *  the signal heads and the boxes, upright, the furthest up the screen
 *  first. view.reduce holds the glow still; view.dpr maps the boxes to CSS
 *  px for hit(). */
export function draw(ctx, L, view) {
  const shown = [];
  for (const C of L.crossings) {
    C.hits = [];
    if (!C.active) continue;
    const m = lineAt(C.line, C.q0);
    if (Math.hypot(m.x - view.cx, m.y - view.cy) > view.radius + 60) continue;
    for (const w of C.vehicles) {
      const fp = footprint(C, w);
      if ((fp.x - view.cx) ** 2 + (fp.y - view.cy) ** 2 > (view.radius + 12) ** 2) continue;
      shown.push({ ...fp, skin: w.skin, kind: w.kind, w: w.W, H: w.H, id: w.id, odo: w.q * w.d });
    }
  }
  traffic.drawBodies(ctx, shown, view);
  // Every look painted at once, the first time, so no press pays for one.
  if (!ART.size) {
    for (const g of [false, true]) for (const w of [false, true]) boxArt(g, w);
    for (const s of ['green', 'amber', 'red', 'redamber']) headArt(s);
  }

  const k = Math.max(0.75, Math.min(1.15, 0.6 + 0.4 * view.ppm / 22));
  const px = k / view.ppm;
  const items = [];
  for (const C of L.crossings) {
    if (!C.active) continue;
    const at = (q, lat) => { const p = lineAt(C.line, q); return { x: p.x + p.lx * lat, y: p.y + p.ly * lat }; };
    const sig = signal(C);
    // A head for each way at its stop line, on its own nearside kerb.
    for (const d of [1, -1]) items.push({ kind: 'head', C, ...at(C.q0 - d * (STOP_LINE + 0.4), d * (C.half + 0.7)), art: headArt(sig) });
    // A box on each kerb, on the right of whoever waits there.
    for (const sd of [C.sigma, -C.sigma]) {
      items.push({ kind: 'box', C, near: sd === C.sigma, ...at(C.q0 - sd * 1.3, sd * (C.half + 0.8)), art: boxArt(figureGreen(C), waitLit(C)) });
    }
  }
  const ux = Math.cos(view.camH), uy = Math.sin(view.camH);
  items.sort((a, b) => (b.x * ux + b.y * uy) - (a.x * ux + a.y * uy));
  const dpr = view.dpr ?? 1;
  const t = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
  for (const it of items) {
    if (Math.hypot(it.x - view.cx, it.y - view.cy) > view.radius + 10) continue;
    const S = it.kind === 'box' ? BOX : HEAD;
    const w = S.w * px, h = S.h * px, pole = S.pole * px;
    ctx.save();
    // The shadow along the sun, as the fingerposts'.
    ctx.translate(it.x + view.sun.x * 2.2, it.y + view.sun.y * 2.2);
    ctx.rotate(view.camH + Math.PI / 2);
    ctx.fillStyle = 'rgba(40,46,38,.22)';
    ctx.beginPath(); ctx.roundRect(-w / 2, -pole - h, w, h, 4 * px); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(view.camH + Math.PI / 2);
    if (it.kind === 'box' && it.near && it.C.glow > 0.01) {
      // The glow: gentle breathing, or held still under reduced motion.
      const breathe = view.reduce ? 1 : 0.86 + 0.14 * Math.sin(t * 2 * Math.PI * 0.7);
      const r = 1.25 * Math.max(w, h) * (view.reduce ? 1 : 0.95 + 0.08 * Math.sin(t * 2 * Math.PI * 0.7));
      ctx.globalAlpha = it.C.glow * breathe;
      const gl = glowArt();
      if (gl) ctx.drawImage(gl, -r, -pole - h / 2 - r, 2 * r, 2 * r);
      ctx.globalAlpha = 1;
    }
    // The pole, inked like the fingerposts'.
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.roundRect(-2.4 * px, -pole - 2 * px, 4.8 * px, pole + 3.5 * px, 1.5 * px); ctx.fill();
    ctx.fillStyle = '#7d8580';
    ctx.fillRect(-1.2 * px, -pole - 1 * px, 2.4 * px, pole + 1.6 * px);
    if (it.art) ctx.drawImage(it.art, -w / 2, -pole - h, w, h);
    if (it.kind === 'box') {
      // Where a tap lands on it, in CSS px, a little generous.
      const pts = [[-w / 2, -pole - h], [w / 2, -pole - h], [-w / 2, 0], [w / 2, 0]].map(([a, b]) => {
        const g = ctx.getTransform(), p = new DOMPoint(a, b).matrixTransform(g);
        return [p.x / dpr, p.y / dpr];
      });
      const pad = 12;
      it.C.hits.push({ x0: Math.min(...pts.map(p => p[0])) - pad, x1: Math.max(...pts.map(p => p[0])) + pad,
        y0: Math.min(...pts.map(p => p[1])) - pad, y1: Math.max(...pts.map(p => p[1])) + pad, near: it.near });
    }
    ctx.restore();
  }
}
