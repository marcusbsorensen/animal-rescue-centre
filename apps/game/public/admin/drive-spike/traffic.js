// traffic.js — other road users in the driving spike.
//
// The contract below is what drive-spike.html calls. traffic.check.mjs drives
// it under plain node against a synthetic route and proves the one rule that
// is never crossed: nothing ever overlaps the van, whatever the child does.
//
// The route is a polyline in world metres. A position on it is s, the distance
// along it in metres; route.atDistance(s) gives {x, y, h} with h the heading in
// radians. A lateral offset of route.laneOffset(lane, s) metres to the left of
// the direction of travel puts something in a lane: lane 0 is ours (keep left),
// lane 1 is the overtaking side — the oncoming lane on an ordinary road, our
// own fast lane on the dual carriageway (`trunk`). On a `track` both lanes are
// the middle of a single unmarked road. laneOffset is always called with s,
// because the answer depends on the road class there.
//
// How the never-an-accident rule is kept. Everything is reasoned along the
// route, in s, by lane:
//   - the van's speedCap keeps it able to stop behind whatever is ahead in a
//     lane it occupies (stopping at 20 m/s² against the page's 26), and before
//     an oncoming vehicle that is itself stopping for it
//   - every vehicle behind the van that shares its lane assumes the van could
//     stop dead this instant and keeps its own stopping distance (20 m/s²)
//   - oncoming vehicles brake for the van whenever it is in their lane
//   - laneBlocked keeps the van out of the oncoming lane unless the whole
//     overtake fits before the next oncoming vehicle, and never near a sharp
//     bend, on a track, or across the ends of the dual carriageway
//   - the one move the page does not let us refuse is the child swiping BACK
//     to lane 0 while something is alongside. Then step() sets van.laneWant
//     back to 1 (the van stays out until there is room, then returns by
//     itself) and the vehicle alongside eases off to make that room. This
//     writes to the van object, which the contract does not document: see the
//     commit message for the field the page should grow instead.
//   - no animal is ever hurt (Marcus, 2026-10-12: "make SURE that the crossing
//     animals on the road are not run over by vehicles coming in the other
//     direction!"). The page passes crossings.js's closed stretches, where an
//     animal is on the road or stepping onto it; every vehicle, either way,
//     slows at a careful driver's ANIMAL_STOP and stands short of the stretch
//     until it opens. crossings.js lets an animal step out only when every
//     vehicle can still do that, so the stop is always a gentle one.

/**
 * @typedef {Object} Route
 * @property {number} length                     metres
 * @property {(s:number) => {x:number, y:number, h:number}} atDistance
 * @property {(lane:0|1, s?:number) => number} laneOffset  metres from the centreline
 * @property {(s:number) => string} roadClassAt  OSM class of the road at s
 * @property {number} laneWidth                  metres
 */

/**
 * @typedef {Object} Van
 * @property {number} s        distance along the route, metres
 * @property {number} lane     current lateral offset, metres (eases between lanes)
 * @property {0|1} laneWant    the lane the child has asked for
 * @property {number} v        speed, metres per second
 * @property {number} length   metres
 * @property {number} width    metres
 * @property {number} [laneT]  0..1 across from lane 0 to lane 1 (the page has it)
 * @property {number} [gear]   1..3 (the page has it; used for the beep)
 */

/**
 * @typedef {Object} TrafficResult
 * @property {number} speedCap     the fastest the van may go this frame without
 *           touching anything. Infinity when the road ahead is clear. If the van
 *           is faster, the spike brakes it hard itself — there is never an
 *           accident, and the hard stop is what jostles the animals.
 * @property {boolean} laneBlocked the overtaking lane is not safe now. The
 *           spike refuses a swipe into it and, if the van is already there,
 *           brings it back, which also counts as a swerve.
 * @property {string[]} events     one-off moments for the HUD, e.g. 'close'
 *           for a clean overtake (the reference's "CLOSE!"), 'beep' for a
 *           queue behind a van in first gear on a dual carriageway.
 */

// ------------------------------------------------------------------ the art

import * as look from './vehicle-look.js';

const TOPDOWN = '/assets/driving/topdown/vehicle-topdown-';

/** Which way each sprite's nose points in the image, checked by eye one by one
 *  (2026-10-11). The fronts that come in pairs are painted from the front, so
 *  they face down the image the way oncoming traffic comes at the camera; the
 *  rears face up, driving away. The three single sprites have no pair and are
 *  all nose-up: the bus (mirrors and windscreen at the top), the bin lorry (cab
 *  at the top, bins hanging off the bottom) and the scooter (handlebars at the
 *  top). Never assume — the old game's trap was exactly this.
 *
 *  | sprite            | nose | aspect h/w |  | sprite             | nose | aspect |
 *  |-------------------|------|------------|--|--------------------|------|--------|
 *  | car-red           | down | 1.51       |  | car-red-rear       | up   | 1.65   |
 *  | car-blue          | down | 1.38       |  | car-blue-rear      | up   | 1.60   |
 *  | car-yellow        | down | 1.34       |  | car-yellow-rear    | up   | 1.61   |
 *  | pickup            | down | 1.60       |  | pickup-rear        | up   | 1.56   |
 *  | truck             | down | 1.83       |  | truck-rear         | up   | 1.73   |
 *  | tractor (green)   | down | 1.32       |  | tractor-rear       | up   | 1.45   |
 *  | tractor-red       | down | 1.32       |  | tractor-red-rear   | up   | 1.45   |
 *  | tractor-blue      | down | 1.32       |  | tractor-blue-rear  | up   | 1.45   |
 *  | ambulance         | down | 1.85       |  | ambulance-rear     | up   | 1.79   |
 *  | fireengine        | down | 1.49       |  | fireengine-rear    | up   | 1.75   |
 *  | bus (only one)    | up   | 2.11       |  | spark-rear (van)   | up   | 1.88   |
 *  | binlorry (one)    | up   | 1.68       |  | spark (front)      | down | 1.89   |
 *  | motorbike (one)   | up   | 2.17       |  |                    |      |        |
 *
 *  Aspect is the opaque body's height over its width, measured from the PNGs
 *  (they are cropped to the body). Length is width times this, so nothing is
 *  squashed and the physics knows each length before any image has loaded. */
export const SPRITES = {
  'car-red': { nose: 'down', aspect: 1.51 }, 'car-red-rear': { nose: 'up', aspect: 1.65 },
  'car-blue': { nose: 'down', aspect: 1.38 }, 'car-blue-rear': { nose: 'up', aspect: 1.60 },
  'car-yellow': { nose: 'down', aspect: 1.34 }, 'car-yellow-rear': { nose: 'up', aspect: 1.61 },
  'pickup': { nose: 'down', aspect: 1.60 }, 'pickup-rear': { nose: 'up', aspect: 1.56 },
  'truck': { nose: 'down', aspect: 1.83 }, 'truck-rear': { nose: 'up', aspect: 1.73 },
  'tractor': { nose: 'down', aspect: 1.32 }, 'tractor-rear': { nose: 'up', aspect: 1.45 },
  'tractor-red': { nose: 'down', aspect: 1.32 }, 'tractor-red-rear': { nose: 'up', aspect: 1.45 },
  'tractor-blue': { nose: 'down', aspect: 1.32 }, 'tractor-blue-rear': { nose: 'up', aspect: 1.45 },
  'ambulance': { nose: 'down', aspect: 1.85 }, 'ambulance-rear': { nose: 'up', aspect: 1.79 },
  'fireengine': { nose: 'down', aspect: 1.49 }, 'fireengine-rear': { nose: 'up', aspect: 1.75 },
  'bus': { nose: 'up', aspect: 2.11 },
  'binlorry': { nose: 'up', aspect: 1.68 },
  'motorbike': { nose: 'up', aspect: 2.17 },
};

/** The kinds, from the old game's catalogue (src/driving/traffic.ts), with
 *  real widths in metres. `height` is for the shadow only. `pair` means the
 *  skin has a -rear sprite for same-direction traffic. */
const KINDS = {
  car: { width: 1.8, height: 1.5, skins: ['car-red', 'car-blue', 'car-yellow'], pair: true, colour: '#6a9fd0' },
  pickup: { width: 2.0, height: 1.8, skins: ['pickup'], pair: true, colour: '#e08a3c' },
  truck: { width: 2.5, height: 3.0, skins: ['truck'], pair: true, colour: '#cf6b52' },
  tractor: { width: 2.4, height: 2.6, skins: ['tractor', 'tractor-red', 'tractor-blue'], pair: true, colour: '#4e9f3d' },
  motorbike: { width: 0.8, height: 1.3, skins: ['motorbike'], pair: false, colour: '#d85a3a' },
  bus: { width: 2.5, height: 3.8, skins: ['bus'], pair: false, colour: '#d23c34' },
  binlorry: { width: 2.5, height: 3.2, skins: ['binlorry'], pair: false, colour: '#3f8f83' },
  ambulance: { width: 2.3, height: 2.7, skins: ['ambulance'], pair: true, colour: '#f0d040' },
  fireengine: { width: 2.5, height: 3.0, skins: ['fireengine'], pair: true, colour: '#d8392b' },
};

// ------------------------------------------------------------- what drives where

/** Road classes grouped by what traffic they carry. */
const GROUP = {
  trunk: 'trunk', secondary: 'main', tertiary: 'main', primary: 'main',
  unclassified: 'lane', residential: 'lane', track: 'track',
};
const groupAt = (cls) => GROUP[cls] ?? 'main';

/** Per group: kind -> [weight, cruising speed m/s]. Speeds sit under what the
 *  van's allowed gears can do there (7 / 13 / 20 m/s), so there is usually
 *  something to catch: tractors and the bin lorry on the lanes, cars and vans
 *  on the main roads, the odd bus or lorry. The weights are the old game's,
 *  with the specials (bus, bin lorry) kept to the roads they belong to. */
const MIX = {
  trunk: { car: [8, 15], pickup: [3, 14], truck: [3, 12.5], bus: [1, 12.5], ambulance: [0.3, 16], fireengine: [0.2, 15] },
  main: { car: [7, 11], pickup: [3, 10], truck: [2, 9], tractor: [2.5, 5.5], bus: [1, 8.5], motorbike: [1.5, 10.5], ambulance: [0.2, 12], fireengine: [0.15, 11] },
  lane: { car: [4, 7.5], pickup: [2, 7], tractor: [3, 4.5], binlorry: [1.5, 4], motorbike: [1, 7.5] },
  track: { tractor: [1, 3.5] },
};
/** Mean metres between same-direction vehicles, and between oncoming ones. */
const SPACING = { trunk: 95, main: 115, lane: 160, track: 280 };
const ONC_SPACING = { trunk: 110, main: 125, lane: 180 };   // none on a track

// ------------------------------------------------------------ the safety numbers

const GAP = 2.5;          // bumper to bumper, metres, never less
const VAN_STOP = 20;      // the van's stopping rate we plan on (the page brakes at 26)
const VAN_APPROACH = 12;  // how hard the van closes on a slower vehicle before the cap bites
const FOLLOW_STOP = 20;   // a vehicle behind the van can stop at this, and assumes the van stops dead
const ONC_STOP = 10;      // an oncoming vehicle's hard stop
const SPAWN_AHEAD = 215, SPAWN_ONC = 235, SPAWN_BEHIND = 75;
const DESPAWN_BEHIND = 95, DESPAWN_AHEAD = 340;
const IN_VIEW = 70;       // metres from the van inside which nothing pops in or out
const BEND_M = 60;        // no overtaking this close before a sharp bend
const BEND_DEG = 30;
const OWN_BEND_M = 45;    // in our own second lane, back in this far before a sharp bend or its end      // a "sharp bend": the route turns more than this within 30 m
const CORNER_DEG = 22;    // past this, oncoming traffic takes a corner one at a time with the van
const LANE_CHANGE_S = 0.7;
const ANIMAL_STOP = 3.5;  // how hard a vehicle slows for a crossing animal, m/s²: a careful driver
const ANIMAL_GAP = 1.2;   // and where it stands, this far short of the closed stretch
const GEAR_V = { 1: 7, 2: 13, 3: 20 };

// --------------------------------------------------------------------- set-up

/** A fresh set of traffic for a new route. Called on every route change.
 *  @param {Route} route
 *  @param {{random?: () => number}} [opts] a seeded random for the check */
export function create(route, opts = {}) {
  const T = {
    route, rand: opts.random ?? Math.random,
    vehicles: [], nextId: 1, ready: false, lastVanS: 0, time: 0,
    nextGap: 0, nextOncGap: 0, behindTimer: 4, beepCooldown: 0,
    hold: false, pendingReturn: false, blocker: null,
    imgs: null, last: null,
  };
  T.closed = [];
  survey(T);
  return T;
}

/** Walk the route once: where the tracks and dual carriageways are, where it
 *  turns and by how much. Everything later is a lookup in these lists. */
function survey(T) {
  const r = T.route, L = r.length;
  T.tracks = []; T.trunks = []; T.vertices = []; T.bends = []; T.boundaries = [];
  let prevCls = null, open = null, prevH = null, prevOnc = null;
  for (let s = 0; s <= L; s += 1) {
    // Where lane 1 stops being our own and becomes the oncoming lane (the
    // A28 from divided to single), the van must not carry it across.
    const onc = lane1Oncoming(T, s);
    if (prevOnc !== null && onc !== prevOnc && !T.boundaries.includes(s)) T.boundaries.push(s);
    prevOnc = onc;
    const cls = r.roadClassAt(s);
    if (cls !== prevCls) {
      if (open) { open.list.push([open.a, s]); open = null; }
      if (cls === 'track') open = { list: T.tracks, a: s };
      if (cls === 'trunk') open = { list: T.trunks, a: s };
      if (prevCls !== null && (cls === 'track' || prevCls === 'track' || cls === 'trunk' || prevCls === 'trunk')) T.boundaries.push(s);
      prevCls = cls;
    }
    const h = r.atDistance(s).h;
    if (prevH !== null) {
      const turn = wrap(h - prevH);
      if (Math.abs(turn) > 1e-4) T.vertices.push({ s: s - 0.5, turn });
    }
    prevH = h;
  }
  if (open) open.list.push([open.a, L + 1000]);
  for (const v of T.vertices) {
    let sum = 0;
    for (const u of T.vertices) if (Math.abs(u.s - v.s) <= 15) sum += u.turn;
    if (Math.abs(sum) * 180 / Math.PI > BEND_DEG) T.bends.push(v.s);
  }
  // One at a time round a sharp corner. The route is straight segments, so at
  // a corner the van's tail, drawn along the new heading, swings back across
  // the old segment's oncoming lane. Oncoming traffic waits for the van there,
  // as a car would at a blind bend on a narrow road.
  T.zones = [];
  for (const v of T.vertices) {
    let sum = 0;
    for (const u of T.vertices) if (Math.abs(u.s - v.s) <= 8) sum += u.turn;
    const turn = Math.min(Math.abs(sum), 2.2);
    if (turn * 180 / Math.PI < CORNER_DEG) continue;
    const z = 2.7 + 4.6 * Math.tan(turn / 2) + 1.5;
    const sharp = turn * 180 / Math.PI > BEND_DEG, trunk = r.roadClassAt(v.s) === 'trunk';
    const last = T.zones[T.zones.length - 1];
    if (last && v.s - z <= last.b) { last.b = Math.max(last.b, v.s + z); last.sharp ||= sharp; last.trunk &&= trunk; }
    else T.zones.push({ a: v.s - z, b: v.s + z, sharp, trunk });
  }
}

// ------------------------------------------------------------------ geometry

function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Route position, extended straight past both ends so nothing piles up at
 *  the start point. */
function at(T, s) {
  if (s >= 0) return T.route.atDistance(s);
  const p = T.route.atDistance(0);
  return { x: p.x + Math.cos(p.h) * s, y: p.y + Math.sin(p.h) * s, h: p.h };
}
const clsAt = (T, s) => T.route.roadClassAt(clamp(s, 0, T.route.length));
const off = (T, lane, s) => T.route.laneOffset(lane, clamp(s, 0, T.route.length));
const inAny = (list, a, b) => list.some(([x, y]) => x <= b && y >= a);
const anyPoint = (list, a, b) => list.some(x => x >= a && x <= b);

/** Whether lane 1 at s is the oncoming lane: on an ordinary road it is the
 *  mirror of our lane 0. On the dual carriageway, and on a stretch of the A28
 *  split by a kerbed island, lane 1 is our own (or there is none) and the
 *  oncoming traffic is beyond the strip or the island. Read off the page's
 *  lane geometry, so a road the page draws divided needs no class of its own. */
function lane1Oncoming(T, s) {
  if (clsAt(T, s) === 'trunk') return false;
  return Math.abs(off(T, 0, s) + off(T, 1, s)) < 0.5;
}

/** Where a vehicle's lateral position should be at s. Same direction: our
 *  lane 0. Oncoming: the mirror of our lane 0, which is lane 1 on an
 *  ordinary road, and on the dual carriageway or a divided road the far
 *  side beyond the grass strip or the island. */
function lateralTarget(T, w, s) {
  if (w.dir > 0) return off(T, 0, s);
  return -off(T, 0, s);
}

/** On a polyline the inside of a corner is shorter than the centreline: two
 *  things in a lane at different s can be closer in the world than their s
 *  says. This is how much closer, at most, for a stretch of route. */
function cornerExtra(T, a, b, lat) {
  // A corner just ahead of the pair counts in part, growing as they near it,
  // so a following gap opens smoothly instead of the cap jumping at a bend.
  let sum = 0;
  for (const v of T.vertices) {
    if (v.s >= a - 6 && v.s <= b + 6) sum += Math.abs(v.turn);
    else if (v.s > b + 6 && v.s < b + 31) sum += Math.abs(v.turn) * (1 - (v.s - b - 6) / 25);
  }
  if (sum < 1e-3) return 0;
  // Up to a 155° hairpin, which the real graph has where a lane leaves the A28.
  return Math.min(40, 2 * (Math.abs(lat) + 1.4) * Math.tan(Math.min(sum, 2.7) / 2));
}

/** The one of two lateral offsets further from the centreline: the corner
 *  between two things is as short as it is for the one more on the inside,
 *  which on the A28's wide carriageways is often the van. */
const wider = (a, b) => Math.abs(a) > Math.abs(b) ? a : b;

/** A vehicle's footprint in the world: a rigid body from its rear axle point
 *  on the route to its front one, so it cuts a corner the way a car does.
 *  @returns {{x:number, y:number, h:number, L:number, W:number}} h is the
 *  direction it is travelling in */
export function footprint(T, w) {
  const f = at(T, w.s + w.dir * w.L / 2), r = at(T, w.s - w.dir * w.L / 2);
  const fx = f.x + Math.cos(f.h + Math.PI / 2) * w.d, fy = f.y + Math.sin(f.h + Math.PI / 2) * w.d;
  const rx = r.x + Math.cos(r.h + Math.PI / 2) * w.d, ry = r.y + Math.sin(r.h + Math.PI / 2) * w.d;
  return { x: (fx + rx) / 2, y: (fy + ry) / 2, h: Math.atan2(fy - ry, fx - rx), L: w.L, W: w.W };
}

// ------------------------------------------------------------------ vehicles

function pickKind(T, group) {
  const mix = MIX[group];
  if (!mix) return null;
  let total = 0;
  for (const k in mix) total += mix[k][0];
  let t = T.rand() * total;
  for (const k in mix) { t -= mix[k][0]; if (t < 0) return k; }
  return Object.keys(mix)[0];
}

function spawn(T, kind, dir, s) {
  // Never into the middle of an animal crossing, or so near one it could
  // not stop for it.
  if (T.closed.some(z => s > z.s0 - 45 && s < z.s1 + 45)) return null;
  const K = KINDS[kind];
  const base = K.skins[(T.rand() * K.skins.length) | 0];
  const skin = dir > 0 && K.pair ? base + '-rear' : base;
  const W = K.width, L = W * SPRITES[skin].aspect;
  const w = {
    id: T.nextId++, kind, skin, dir, s, W, L, H: K.height,
    pace: 0.9 + T.rand() * 0.2, v: 0, d: 0, pass: null, yieldTo: 0,
  };
  w.d = lateralTarget(T, w, s);
  w.v = desired(T, w);
  T.vehicles.push(w);
  return w;
}

/** How fast a vehicle wants to go where it is, looking a little ahead so it
 *  slows before a lane or a track rather than on it. */
function desired(T, w) {
  const look = w.s + w.dir * 25;
  const v = Math.min(cruise(T, w, w.s), cruise(T, w, look));
  if (w.yieldTo > 0) return w.yieldTo;
  return v;
}
function cruise(T, w, s) {
  const g = groupAt(clsAt(T, s));
  const entry = MIX[g]?.[w.kind];
  let v = entry ? entry[1] : { trunk: 12, main: 9, lane: 6, track: 3.5 }[g];
  if (w.kind === 'tractor') v = Math.min(v, 5.5);
  return v * w.pace;
}

/** The van's footprint along the route. */
function vanBox(van) {
  return { rear: van.s - van.length / 2, front: van.s + van.length / 2 };
}

// ---------------------------------------------------------------------- step

/** Advance the traffic and report what it means for the van.
 *  @param {{closed?: {s0:number, s1:number}[]}} [world] what else is on the
 *  road: closed, the stretches crossings.closed() reports, where an animal is
 *  crossing. Every vehicle stops short of them.
 *  @returns {TrafficResult} */
export function step(T, dt, van, world = {}) {
  const events = [];
  T.closed = world.closed ?? [];
  if (!T.ready || Math.abs(van.s - T.lastVanS) > 40) reset(T, van);
  T.lastVanS = van.s;
  T.time += dt;
  T.beepCooldown = Math.max(0, T.beepCooldown - dt);

  const vb = vanBox(van);
  const off0 = off(T, 0, van.s), off1 = off(T, 1, van.s);
  const span = off1 - off0;
  const laneT = typeof van.laneT === 'number' ? van.laneT
    : Math.abs(span) < 1e-3 ? (van.laneWant ? 1 : 0) : clamp((van.lane - off0) / span, 0, 1);

  // ---- 1. may the van be in the overtaking lane, and may it come back?
  const unsafe = laneUnsafe(T, van, vb, laneT);
  const inLane1 = laneT > 0.001;
  if (T.pendingReturn && van.laneWant === 1 && !inLane1) T.pendingReturn = false;
  const wantsBack = inLane1 && (van.laneWant === 0 || unsafe || T.pendingReturn);
  // Once a return is under way the caps on both sides already hold the gaps,
  // so only something actually alongside turns it round.
  const underway = laneT < 0.999 && van.laneWant === 0;
  const blocker = wantsBack ? returnBlocker(T, van, vb, dt, underway) : null;
  let laneBlocked = unsafe !== '';
  T.hold = false; T.blocker = null;
  if (blocker) {
    // Something is alongside: stay out until there is room. The van comes
    // back by itself once there is.
    if (van.laneWant === 0 || unsafe) T.pendingReturn = true;
    van.laneWant = 1;
    laneBlocked = false;
    T.hold = true; T.blocker = blocker;
  } else if (T.pendingReturn && inLane1) {
    van.laneWant = 0; T.pendingReturn = false;
  }
  const want = laneBlocked ? 0 : van.laneWant;

  // Which lanes the van is in or moving into this frame, and the band of road
  // it sweeps sideways.
  const occ0 = laneT < 0.999 || want === 0;
  const occ1 = laneT > 0.001 || want === 1;
  const tgtLat = off0 + want * span;
  const bandLo = Math.min(van.lane, tgtLat) - van.width / 2;
  const bandHi = Math.max(van.lane, tgtLat) + van.width / 2;
  const conflicts = (w) => {
    const latHit = w.d + w.W / 2 + 0.3 > bandLo && w.d - w.W / 2 - 0.3 < bandHi;
    if (latHit) return true;
    if (w.dir > 0) return occ0;
    return occ1 && lane1Oncoming(T, w.s);
  };

  // ---- 2. the vehicles move
  for (const w of T.vehicles) {
    w.yieldTo = 0;
    if (T.blocker === w) {
      // Make room for the van to come back in: drop back if the van is ahead,
      // pull on if it is behind.
      w.yieldTo = van.s >= w.s ? Math.max(0, van.v - 3) : Math.max(cruise(T, w, w.s), van.v + 3);
    }
  }
  const same = T.vehicles.filter(w => w.dir > 0).sort((a, b) => a.s - b.s);
  const onc = T.vehicles.filter(w => w.dir < 0).sort((a, b) => b.s - a.s);
  const newV = new Map();
  same.forEach((w, i) => newV.set(w, sameSpeed(T, w, same[i + 1], van, vb, conflicts(w), dt)));
  onc.forEach((w, i) => newV.set(w, oncSpeed(T, w, onc[i + 1], van, vb, conflicts(w), dt)));
  for (const w of T.vehicles) {
    w.v = newV.get(w);
    w.s += w.dir * w.v * dt;
    const tgt = lateralTarget(T, w, w.s);
    w.d += clamp(tgt - w.d, -4 * dt, 4 * dt);
  }

  // ---- 3. the van's cap, against where everything is now
  let speedCap = Infinity, capBy = '';
  for (const w of T.vehicles) {
    if (!conflicts(w)) continue;
    const wRear = w.s - w.L / 2, wFront = w.s + w.L / 2;
    if (w.dir > 0) {
      if (w.s < van.s) continue;   // behind: it keeps off us, not we off it
      const g = wRear - vb.front - GAP - cornerExtra(T, vb.front, wRear, wider(w.d, van.lane));
      // Close in hard, then settle at a following gap that breathes: it
      // drifts out and back by a metre or so, slowly and unevenly, so the van
      // does not move in lockstep with the vehicle in front (Marcus,
      // 2026-10-12). Never nearer than the band; below it the cap falls
      // away as before.
      const band = 3 + 0.4 * w.v, want = band + breath(T.time, w.id);
      // (The approach is rounded off near the gap, so the gap moving does
      // not jerk the cap.)
      const cap = g >= want ? w.v + Math.sqrt(2 * VAN_APPROACH * (g - want) + ROUND * ROUND) - ROUND
        : g >= 0 ? Math.max(0, w.v - Math.min(FOLLOW_DROP, FOLLOW_EASE * (want - g)))
        : Math.max(0, Math.min(w.v - FOLLOW_DROP, w.v + 1.5 * g));
      if (cap < speedCap) { speedCap = Math.max(0, cap); capBy = 'lead'; }
    } else {
      if (wFront < vb.rear) continue;   // gone past
      const g = wRear - vb.front - GAP - cornerExtra(T, vb.front, wRear, wider(w.d, van.lane));
      const theirs = w.v * dt + w.v * w.v / (2 * ONC_STOP);
      const cap = stopSpeed(g - theirs, VAN_STOP, dt);
      if (cap < speedCap) { speedCap = cap; capBy = 'oncoming'; }
    }
  }
  // An oncoming vehicle already committed to a sharp corner has it: the van
  // waits short of it. (Oncoming traffic only commits when the van is far
  // enough off not to arrive first, so this rarely bites.)
  for (const z of T.zones) {
    if (z.trunk || z.b < vb.rear || z.a > vb.front + 80 || vb.front > z.a) continue;
    if (T.vehicles.some(w => w.dir < 0 && w.zone === z)) {
      const cap = stopSpeed(z.a - vb.front - 1, VAN_STOP, dt);
      if (cap < speedCap) { speedCap = cap; capBy = 'corner'; }
    }
  }
  // Nor round a sharp bend, where the corner of the road folds lane 0 and
  // lane 1 into each other. (laneBlocked has called it back long before; this
  // is for when something alongside has kept it out.)
  if (laneT > 0.001) {
    const z = T.zones.find(z => z.sharp && z.b > vb.rear && z.a - vb.front < 70);
    if (z) {
      const cap = Math.sqrt(2 * VAN_APPROACH * Math.max(0, z.a - vb.front - 6));
      if (cap < speedCap) { speedCap = cap; capBy = 'bend'; }
    }
  }
  // The van must not carry the overtaking lane into a track or across either
  // end of the dual carriageway, where the lanes move under it.
  if (laneT > 0.001) {
    const b = T.boundaries.find(x => x > vb.front - 7);
    if (b !== undefined && b - vb.front < 70) {
      // Short of the line by more than half a bus, so nothing still alongside
      // is yet moving sideways onto the new road.
      const cap = Math.sqrt(2 * VAN_APPROACH * Math.max(0, b - vb.front - 6));
      if (cap < speedCap) { speedCap = cap; capBy = 'lane ends'; }
    }
  }

  // ---- 4. moments
  for (const w of same) {
    const wRear = w.s - w.L / 2, wFront = w.s + w.L / 2;
    if (vb.front < wRear) w.pass = 'behind';
    else if (w.pass === 'behind' && laneT > 0.5) w.pass = 'alongside';
    else if (w.pass === 'alongside' && laneT < 0.5 && vb.rear > wFront) {
      w.pass = 'done'; events.push('close');
    }
  }
  if (clsAt(T, van.s) === 'trunk' && (van.gear === 1 || (van.gear == null && van.v < 8))
      && van.v < 8.5 && T.beepCooldown === 0) {
    const q = same.find(w => w.s < van.s && conflicts(w) && vb.rear - (w.s + w.L / 2) < 22
      && desired(T, w) > w.v + 1.5);
    if (q) { events.push('beep'); T.beepCooldown = 4.5; }
  }

  // ---- 5. arrivals and departures
  populate(T, van, vb, dt);

  T.last = { speedCap, capBy, laneBlocked, hold: T.hold, laneT, unsafe };
  return { speedCap, laneBlocked, laneHold: T.hold, events };
}

/** How much further back than the band the van sits behind a leader, metres:
 *  three slow swells with unrelated periods, so it never repeats and never
 *  looks like a wobble, phased by the leader so each follow is its own.
 *  0 to BREATH_M. */
const BREATH_M = 1.4;
const FOLLOW_EASE = 0.45;   // 1/s: how quickly the van drifts to the gap it wants
const ROUND = 2;            // m/s: how gently the approach meets the following gap
const FOLLOW_DROP = 1;      // m/s: and at most this much slower than the leader as it drops back
function breath(t, id) {
  const p = id * 2.399;
  const u = 0.5 * Math.sin(t * 2 * Math.PI / 9.7 + p) + 0.3 * Math.sin(t * 2 * Math.PI / 15.3 + 1.7 * p)
    + 0.2 * Math.sin(t * 2 * Math.PI / 6.1 + 2.9 * p);
  return BREATH_M * (0.5 + 0.5 * u);
}

/** The fastest speed from which a stop at `rate` fits in `room` metres,
 *  counting the one frame of travel before the brakes bite. */
function stopSpeed(room, rate, dt) {
  if (room <= 0) return 0;
  return rate * (-dt + Math.sqrt(dt * dt + 2 * room / rate));
}

/** A same-direction vehicle's speed for this frame: comfortable following
 *  (IDM) under a hard cap that can always stop behind what is ahead. */
function sameSpeed(T, w, aiLead, van, vb, conflictsVan, dt) {
  const front = w.s + w.L / 2;
  let lead = null;
  if (aiLead) lead = { rear: aiLead.s - aiLead.L / 2, v: aiLead.v, van: false, d: aiLead.d };
  if (conflictsVan && van.s > w.s && (!lead || vb.rear < lead.rear)) lead = { rear: vb.rear, v: van.v, van: true, d: van.lane };
  const v0 = desired(T, w);
  let gap = Infinity, dv = 0;
  if (lead) {
    gap = lead.rear - front - cornerExtra(T, front, lead.rear, wider(w.d, lead.d));
    dv = w.v - lead.v;
  }
  // An animal crossing ahead: slowed for at a steady ANIMAL_STOP and no
  // harder (the following model would brake hard once close).
  const z = animalRoom(T, w, front);
  let v = w.v + clamp(idm(w.v, v0, gap, dv), -9, 2) * dt;
  if (lead) {
    const room = gap - (lead.van ? GAP : 1);
    // Behind the van: assume it stops dead this instant. Behind traffic: it
    // brakes no harder than we can.
    const cap = lead.van ? stopSpeed(room, FOLLOW_STOP, dt)
      : stopSpeed(room + lead.v * lead.v / 16, 8, dt);
    v = Math.min(v, cap);
  }
  if (isFinite(z)) v = Math.min(v, stopSpeed(z, ANIMAL_STOP, dt));
  return clamp(v, 0, 40);
}

/** An oncoming vehicle's speed: it follows the one in front of it, waits at
 *  the end of a track it cannot fit down, and stops for the van whenever the
 *  van is on its side of the road. */
function oncSpeed(T, w, aiLead, van, vb, conflictsVan, dt) {
  const front = w.s - w.L / 2;   // lower s
  const v0 = desired(T, w);
  let gap = Infinity, dv = 0, cap = Infinity;
  if (aiLead) {
    const g = front - (aiLead.s + aiLead.L / 2);
    gap = g; dv = w.v - aiLead.v;
    cap = Math.min(cap, stopSpeed(g - 1 + aiLead.v * aiLead.v / 16, 8, dt));
  }
  // A single-track road ahead of it: wait at the end rather than meet the van
  // where there is no room to pass. (Out of view it simply turns off.)
  const tr = T.tracks.find(([a, b]) => b <= front + 0.01 && b > front - 200);
  if (tr) {
    const g = front - (tr[1] + 12);
    if (g < gap) { gap = g; dv = w.v; }
    cap = Math.min(cap, stopSpeed(g, 4, dt));
  }
  // A sharp corner: go only if it is clear before the van could get there.
  w.zone = null;
  for (const z of T.zones) {
    if (z.trunk || z.a > w.s + w.L / 2 || z.b < front - 120) continue;   // far side, behind it, or far
    if (vb.rear > z.b || vb.front < z.a - 200) continue;      // the van is past it, or far
    const inside = front < z.b;
    const canStop = front - z.b - 1 > w.v * dt + w.v * w.v / (2 * ONC_STOP);
    if (inside || !canStop) { w.zone = z; continue; }           // committed
    const clearIn = travelTime(w.s + w.L / 2 - z.a, w.v, desired(T, w), 1.2);
    const vanIn = vb.front >= z.a ? 0 : travelTime(z.a - vb.front, van.v, 20);
    if (vanIn > clearIn + 1) { if (front - z.b < 25) w.zone = z; continue; }
    const g = front - z.b - 1;
    if (g < gap) { gap = g; dv = w.v; }
    cap = Math.min(cap, stopSpeed(g, ONC_STOP, dt));
  }
  if (conflictsVan && vb.front < w.s + w.L / 2) {
    const g = front - vb.front - GAP - cornerExtra(T, vb.front, front, wider(w.d, van.lane));
    if (g < gap) { gap = g; dv = w.v + van.v; }
    const vans = van.v * dt + van.v * van.v / (2 * 26);
    cap = Math.min(cap, stopSpeed(g - vans, ONC_STOP, dt));
  }
  const z = animalRoom(T, w, front);
  if (isFinite(z)) cap = Math.min(cap, stopSpeed(z, ANIMAL_STOP, dt));
  let v = w.v + clamp(idm(w.v, v0, gap, dv), -9, 2) * dt;
  return clamp(Math.min(v, cap), 0, 40);
}

/** Metres a vehicle may still go before the nearest closed stretch ahead of
 *  it (Infinity when none), its nose `front` stopping ANIMAL_GAP short, and
 *  more on the inside of a corner. A stretch it is already past is behind
 *  it; one it is somehow in is 0, so it stands where it is. */
function animalRoom(T, w, front) {
  let best = Infinity;
  for (const z of T.closed) {
    if (w.dir > 0) {
      if (w.s - w.L / 2 > z.s1) continue;
      best = Math.min(best, Math.max(0, z.s0 - front - ANIMAL_GAP - cornerExtra(T, front, z.s0, w.d)));
    } else {
      if (w.s + w.L / 2 < z.s0) continue;
      best = Math.min(best, Math.max(0, front - z.s1 - ANIMAL_GAP - cornerExtra(T, z.s1, front, w.d)));
    }
  }
  return best;
}
export const ANIMAL_STOP_RATE = ANIMAL_STOP, ANIMAL_STOP_GAP = ANIMAL_GAP;

/** Seconds to cover d metres from speed v, accelerating at a (the page's
 *  9 m/s² for the van) up to vMax. */
function travelTime(d, v, vMax, a = 9) {
  if (d <= 0) return 0;
  const tUp = Math.max(0, vMax - v) / a, dUp = v * tUp + a * tUp * tUp / 2;
  if (dUp >= d) return (-v + Math.sqrt(v * v + 2 * a * d)) / a;
  return tUp + (d - dUp) / Math.max(0.1, vMax);
}

/** Intelligent Driver Model acceleration: free road, or settling in behind. */
function idm(v, v0, gap, dv) {
  const a = 1.6, b = 2.4, T = 1.2, s0 = GAP;
  const free = 1 - Math.pow(v / Math.max(0.5, v0), 4);
  if (!isFinite(gap)) return a * free;
  const sStar = s0 + Math.max(0, v * T + v * dv / (2 * Math.sqrt(a * b)));
  return a * (free - Math.pow(sStar / Math.max(0.1, gap), 2));
}

/** Why lane 1 is not safe for the van now, or '' when it is. */
function laneUnsafe(T, van, vb, laneT) {
  const vGear = Math.max(van.v, GEAR_V[van.gear] ?? 13);
  const cls = clsAt(T, van.s);
  // The vehicle being overtaken, if any: the nearest one ahead in lane 0 that
  // the van has not yet cleared.
  let target = null;
  for (const w of T.vehicles) {
    if (w.dir < 0 || w.s + w.L / 2 + 6 < vb.rear || w.s - w.L / 2 - vb.front > 80) continue;
    if (!target || w.s < target.s) target = w;
  }
  let need = 3;
  if (target) {
    const rest = (target.s + target.L / 2 + 8) - vb.rear;
    need = Math.max(0, rest) / Math.max(1.5, vGear - target.v) + 2 * LANE_CHANGE_S;
  }
  const horizon = clamp(need * vGear, BEND_M, 160);

  if (cls === 'track' || inAny(T.tracks, vb.rear - 5, vb.front + horizon)) return 'track';
  // Nor across a change of road: a track, either end of the dual
  // carriageway, the A28 from divided to single. From our own second lane
  // only the last OWN_BEND_M count: she may use it until then.
  if (T.boundaries.some(b => b >= vb.rear - 10 && b <= vb.front + horizon
      && (lane1Oncoming(T, b - 1) || b <= vb.front + OWN_BEND_M))) return 'road ends';
  // No overtaking into the oncoming lane near a bend. Where lane 1 is our
  // own (the dual carriageway, the A28's divided stretches with two lanes
  // each way, which in town bend often) a bend only calls her back in just
  // before it, where the corner folds the two lanes together.
  const bendTo = vb.front + 3 + Math.min(horizon, 120);
  if (T.bends.some(b => b >= vb.rear - 10 && b <= bendTo && (lane1Oncoming(T, b) || b <= vb.front + OWN_BEND_M))) return 'bend';
  for (const w of T.vehicles) {
    if (w.dir > 0) continue;
    if (w.s + w.L / 2 < vb.rear - 2) continue;              // already past
    if (!lane1Oncoming(T, w.s) && !lane1Oncoming(T, w.s - w.L)) continue;   // far carriageway
    const D = (w.s - w.L / 2) - vb.front;
    const vo = Math.max(w.v, cruise(T, w, w.s));
    if (D < need * (vGear + vo) + 25) return 'oncoming';
  }
  return '';
}

/** The vehicle in lane 0 that the van cannot move back in beside, or null. */
function returnBlocker(T, van, vb, dt, underway) {
  for (const w of T.vehicles) {
    if (w.dir < 0) continue;
    const wRear = w.s - w.L / 2, wFront = w.s + w.L / 2;
    if (underway) {
      if (wRear < vb.front + 0.5 && wFront > vb.rear - 0.5) return w;
      continue;
    }
    if (wRear >= vb.front) {
      const g = wRear - vb.front - GAP - cornerExtra(T, vb.front, wRear, wider(w.d, van.lane));
      const dv = Math.max(0, van.v - w.v);
      if (g < dv * dv / (2 * VAN_STOP) + dv * dt + 0.5) return w;
    } else if (wFront <= vb.rear) {
      const g = vb.rear - wFront - GAP - cornerExtra(T, wFront, vb.rear, wider(w.d, van.lane));
      if (g < w.v * dt * 2 + w.v * w.v / (2 * FOLLOW_STOP) + 0.5) return w;
    } else return w;
  }
  return null;
}

// ------------------------------------------------------------------ arrivals

function reset(T, van) {
  T.vehicles = [];
  T.ready = true;
  T.pendingReturn = false;
  const g0 = groupAt(clsAt(T, van.s));
  // Same direction: from just out of view to the spawn line.
  for (let s = van.s + 55 + T.rand() * 40; s < van.s + SPAWN_AHEAD; ) {
    const g = groupAt(clsAt(T, s));
    const k = pickKind(T, g);
    if (k) spawn(T, k, +1, s);
    s += SPACING[g] * (0.5 + T.rand());
  }
  for (let s = van.s + 70 + T.rand() * 60; s < van.s + SPAWN_ONC; ) {
    const g = groupAt(clsAt(T, s));
    if (oncomingMayStart(T, s)) { const k = pickKind(T, g); if (k) spawn(T, k, -1, s); }
    s += (ONC_SPACING[g] ?? 150) * (0.5 + T.rand());
  }
  T.nextGap = SPACING[g0] * (0.5 + T.rand());
  T.nextOncGap = (ONC_SPACING[g0] ?? 150) * (0.5 + T.rand());
}

function oncomingMayStart(T, s) {
  return groupAt(clsAt(T, s)) !== 'track' && !inAny(T.tracks, s - 25, s + 25)
    && Math.abs(s - T.lastVanS) > IN_VIEW;
}

function populate(T, van, vb, dt) {
  // Departures: far behind, far ahead, or a car that would turn down a farm
  // track — it turns off instead, out of sight.
  T.vehicles = T.vehicles.filter(w => {
    const far = Math.abs(w.s - van.s) > IN_VIEW;
    if (w.s < van.s - DESPAWN_BEHIND || w.s > van.s + DESPAWN_AHEAD) return false;
    if (w.s > T.route.length + 60) return false;
    if (far && w.dir > 0 && w.kind !== 'tractor' && inAny(T.tracks, w.s, w.s + 30)) return false;
    if (far && w.dir < 0 && inAny(T.tracks, w.s - 30, w.s)) return false;
    return true;
  });

  // Same direction, ahead: whenever the stretch before the spawn line has
  // opened up by the next spacing.
  const sH = van.s + SPAWN_AHEAD;
  if (sH < T.route.length - 20) {
    const near = T.vehicles.some(w => w.dir > 0 && w.s > sH - T.nextGap && w.s < sH + 30);
    if (!near) {
      const g = groupAt(clsAt(T, sH));
      const k = pickKind(T, g);
      if (k) {
        const w = spawn(T, k, +1, sH);
        const lead = w && T.vehicles.find(u => u !== w && u.dir > 0 && u.s > sH && u.s < sH + 60);
        if (lead) w.v = Math.min(w.v, lead.v);
      }
      T.nextGap = SPACING[g] * (0.5 + T.rand());
    }
  }

  // Oncoming, at their own spawn line.
  const sO = van.s + SPAWN_ONC;
  if (sO < T.route.length && oncomingMayStart(T, sO)) {
    const near = T.vehicles.some(w => w.dir < 0 && w.s > sO - T.nextOncGap && w.s < sO + 30);
    if (!near) {
      const g = groupAt(clsAt(T, sO));
      const k = pickKind(T, g);
      if (k) spawn(T, k, -1, sO);
      T.nextOncGap = (ONC_SPACING[g] ?? 150) * (0.5 + T.rand());
    }
  }

  // On the dual carriageway, faster traffic comes up from behind now and
  // then — which is who beeps at a van dawdling in first.
  T.behindTimer -= dt;
  if (T.behindTimer <= 0) {
    T.behindTimer = 5 + T.rand() * 9;
    const sB = van.s - SPAWN_BEHIND;
    if (sB > 0 && clsAt(T, sB) === 'trunk' && clsAt(T, van.s) === 'trunk'
        && !T.vehicles.some(w => w.dir > 0 && Math.abs(w.s - sB) < 40)) {
      const k = pickKind(T, 'trunk');
      const w = spawn(T, k, +1, sB);
      if (w) w.v = Math.min(w.v, stopSpeed(vb.rear - (sB + w.L / 2) - GAP, FOLLOW_STOP, 0.05));
    }
  }
}

// ---------------------------------------------------------------------- draw

function images(T) {
  if (T.imgs || typeof Image === 'undefined') return T.imgs;
  T.imgs = {};
  for (const name of Object.keys(SPRITES)) {
    const img = new Image();
    // The outline and tread are built as each sprite arrives, not mid-drive.
    img.onload = () => look.prepare(name, img, widthOf(name));
    img.src = TOPDOWN + name + '.png';
    T.imgs[name] = img;
  }
  return T.imgs;
}

/** A skin's width in metres, from the kind it belongs to. */
function widthOf(skin) {
  const base = skin.replace(/-rear$/, '');
  for (const k in KINDS) if (KINDS[k].skins.includes(base)) return KINDS[k].width;
  return 2;
}

/** Called with ctx in world metres, rotated by the camera, after the scenery
 *  and before the van. Shadows use view.sun, as scenery.js does. */
export function draw(ctx, T, view) {
  if (!T.vehicles.length) return;
  const imgs = images(T);
  const r2 = (view.radius + 12) ** 2;
  const shown = [];
  for (const w of T.vehicles) {
    const fp = footprint(T, w);
    if ((fp.x - view.cx) ** 2 + (fp.y - view.cy) ** 2 > r2) continue;
    shown.push([w, fp]);
  }
  // Shadows first, all of them, so no shadow falls across a body. Fixed in
  // the world like the van's: the sun does not turn with the camera. Cast
  // from the outlined silhouette once it is built, an ellipse until then.
  ctx.fillStyle = 'rgba(40,46,38,.22)';
  for (const [w, fp] of shown) {
    ctx.save();
    ctx.translate(fp.x + view.sun.x * w.H, fp.y + view.sun.y * w.H);
    ctx.rotate(fp.h + (SPRITES[w.skin].nose === 'up' ? Math.PI / 2 : -Math.PI / 2));
    if (!look.shadow(ctx, w.skin, imgs?.[w.skin], w.W, fp.W, fp.L)) {
      ctx.beginPath(); ctx.ellipse(0, 0, fp.W * 0.48, fp.L * 0.48, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  for (const [w, fp] of shown) {
    ctx.save();
    ctx.translate(fp.x, fp.y);
    // Turn the sprite so its own nose, up or down the image, points the way
    // the vehicle travels.
    ctx.rotate(fp.h + (SPRITES[w.skin].nose === 'up' ? Math.PI / 2 : -Math.PI / 2));
    // Outlined, with its tyres turning by the distance it has come.
    const m = { key: w.id, odo: w.s * w.dir, nose: SPRITES[w.skin].nose };
    if (!look.body(ctx, w.skin, imgs?.[w.skin], w.W, fp.W, fp.L, m)) {
      ctx.fillStyle = KINDS[w.kind].colour; ctx.fillRect(-fp.W / 2, -fp.L / 2, fp.W, fp.L);
    }
    ctx.restore();
  }
}
