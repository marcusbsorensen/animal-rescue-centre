// crossings.js — small wild animals crossing the small lanes.
//
// The contract below (create, step, draw) is what drive-spike.html calls.
//
// Marcus, 2026-10-11: on the small lanes the camera comes in close so she can
// see small animals crossing — hedgehogs, rabbits, pheasants and the like. She
// slows or stops for them; if she does not, the van stops itself, the same
// rule as for traffic. Never an accident.
//
// Positions are distances along the route (s, metres) and lateral offsets
// from its centreline (metres, negative to the left), as in traffic.js.
//
// How it keeps the promise. A crossing is a place on a straight stretch of
// small road. The animal waits on the verge, on screen, until the van is
// close, and only steps out if the van can still stop short of it at well
// under the page's emergency rate. From that moment until the last animal is
// off the far kerb the whole carriageway at that place is closed, and
// speedCap keeps the van's nose short of it. If the van is already too close
// (a route that starts beside one), the animal stays on the verge and crosses
// behind the van. The animals are drawn far larger than life, so a child can
// see them on a phone, and the gap that counts is to the body as drawn:
// crossings.check.mjs drives this with random inputs and measures that gap
// in world space.
//
// Where. Every small-road edge of the graph is a candidate, and a hash of its
// midpoint's position decides whether it has a crossing, so a place has the
// same animals whichever way and however often she drives past. Edges are
// ~48 m, so the midpoint is ~24 m from any corner and the van, stopped for
// it, is still on the same straight segment.
//
// Who. The child's map (birchie-roads.svg) says what is beside the road:
// water, wood, field, park, or houses. Season facts used, all on the
// meteorological calendar world.season follows:
//   hedgehogs hibernate, so none in winter (roughly November to March);
//   ducklings only in spring; mallards, rabbits, pheasants and roe deer are
//   about all year.

const SMALL = new Set(['residential', 'unclassified', 'track']);

/** About one crossing per 300 m of small road: edges are ~48 m. */
const SITE_CHANCE = 0.16;
const MIN_EDGE_M = 36;        // the midpoint needs 18 m of straight each side
const SPACING_M = 110;        // never two crossings closer than this on a route
const START_CLEAR_M = 35;     // none where the van sets off...
const END_CLEAR_M = 45;       // ...or where it pulls up

/** How far ahead of the van's nose an animal starts to cross, by the van's
 *  speed. The lane zoom shows about 14 m ahead of the nose standing and 20 m
 *  at 13 m/s; she sees the animal waiting on the verge before this. Close
 *  enough that a child who stops when it steps out still has it well inside
 *  the screen once the camera has come in (16 m at 13 m/s leaves ~10 m after
 *  braking), and far enough that the van can always stop for it. */
function triggerGap(v) { return 8 + 0.6 * v; }

/** But never before she has had a moment to see it waiting. Held sideways,
 *  or at speed before the camera has pulled back, the screen can show less
 *  road than triggerGap, and an animal would step out from above the top
 *  edge. So it waits until it has been on screen this long; if by then the
 *  van could not stop, it crosses behind instead. The page puts the metres
 *  shown ahead of the van on van.view.ahead. */
const SEEN_S = 0.35;

/** The rate the cap is computed at, below the page's EMERGENCY of 26 m/s², so
 *  frame stepping never carries the van past the line. And the stricter rate
 *  an animal checks before stepping out at all. */
const CAP_DECEL = 22;
const COMMIT_DECEL = 18;

/** Along the road, how far either side of the crossing's centre is closed:
 *  half the widest drawn body along the road (a deer, turned a little as it
 *  looks about), its wobble, and a clear metre in front of the bumper. */
const ZONE_HALF_M = 1.9;

/** The warning sign stands this far before the zone: far enough to be read
 *  first, near enough to be on screen just before the animal is. */
const SIGN_BEFORE_M = 22;

/** Bodies as drawn, in metres. The page draws vehicles about 1.37 times true
 *  width, but at that a rabbit is still 16px at the lane zoom on a 390-wide
 *  phone (PPM 22 x 1.35 = 29.7 px/m), a smudge. So they are storybook size:
 *  a hedgehog or rabbit about 38px nose to tail, a deer near 70px. dl and dw
 *  are the whole drawing, ink and every frame of its animation included,
 *  measured in a browser off the pixels drawn (1 cm grid, plus a margin);
 *  ox centres the drawing on that box. It is this box the van keeps clear
 *  of, not the animal's real size. hgt lifts the shadow; speed is m/s. */
const SPECIES = {
  hedgehog: { dl: 1.29, dw: 0.95, ox: -0.03, hgt: 0.28, speed: 1.3 },
  rabbit:   { dl: 1.33, dw: 0.83, ox: 0.04, hgt: 0.32, speed: 2.0 },
  pheasant: { dl: 1.84, dw: 0.75, ox: 0.28, hgt: 0.36, speed: 1.4 },
  duck:     { dl: 1.41, dw: 0.85, ox: -0.03, hgt: 0.3, speed: 1.2 },
  duckling: { dl: 0.70, dw: 0.49, ox: -0.05, hgt: 0.14, speed: 1.2 },
  deer:     { dl: 2.3, dw: 0.98, ox: -0.17, hgt: 0.9, speed: 1.7 },
};

// ------------------------------------------------------------ deterministic

/** A small integer hash, so a place always rolls the same dice. */
function hash(a, b, c = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), s | 1) + 0x6d2b79f5) >>> 0; return ((s ^ (s >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- the map

/** The child's map, read once. Groups farmland, woodland, green-areas and
 *  pools as polygons in map pixels. Without it every crossing is chosen as
 *  if on an ordinary lane between hedges. */
const MAP_URL = new URL('../scene-assets/birchie-map/birchie-roads.svg', import.meta.url);
async function loadText(url) {
  if (url.protocol === 'file:') return (await import('node:fs/promises')).readFile(url, 'utf8');
  const res = await fetch(url);
  if (!res.ok) throw new Error('map ' + res.status);
  return res.text();
}
function parseMap(svg) {
  const out = {};
  for (const id of ['farmland', 'woodland', 'green-areas', 'pools']) {
    const start = svg.indexOf('<g id="' + id + '"');
    if (start < 0) { out[id] = []; continue; }
    const body = svg.slice(start, svg.indexOf('</g>', start));
    const polys = [];
    for (const m of body.matchAll(/\sd="([^"]+)"/g)) {
      for (const sub of m[1].split(/(?=M)/)) {
        const nums = sub.match(/-?\d+(?:\.\d+)?/g);
        if (!nums || nums.length < 6) continue;
        const pts = [];
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push([+nums[i], +nums[i + 1]]);
        polys.push(withBox(pts));
      }
    }
    for (const m of body.matchAll(/<ellipse\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+rx="([\d.]+)"\s+ry="([\d.]+)"/g)) {
      const [cx, cy, rx, ry] = m.slice(1).map(Number);
      const pts = [];
      for (let k = 0; k < 24; k++) pts.push([cx + rx * Math.cos(k * Math.PI / 12), cy + ry * Math.sin(k * Math.PI / 12)]);
      polys.push(withBox(pts));
    }
    out[id] = polys;
  }
  return out;
}
function withBox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { pts, x0, y0, x1, y1 };
}
/** Map pixels from (px, py) to the nearest polygon of a group, 0 inside. */
function distTo(polys, px, py, within) {
  let best = Infinity;
  for (const p of polys) {
    if (px < p.x0 - within || px > p.x1 + within || py < p.y0 - within || py > p.y1 + within) continue;
    const q = p.pts;
    let inside = false;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
      const [ax, ay] = q[i], [bx, by] = q[j];
      if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) inside = !inside;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
    if (inside) return 0;
  }
  return best;
}

let MAP = null;
try { MAP = parseMap(await loadText(MAP_URL)); } catch { MAP = null; }

// ---------------------------------------------------------------- the sites

/** Every candidate place in the world, once per graph: midpoints of small
 *  road edges that the hash picks, with what lives there. */
const SITES = new WeakMap();
function sitesFor(world) {
  let s = SITES.get(world.graph);
  if (s) return s;
  const o = world.mapToWorld(0, 0), mpp = world.mapToWorld(1, 0).x - o.x;
  const { nodes, edges } = world.graph;
  const list = [], grid = new Map();
  for (const [i, j, cls] of edges) {
    if (!SMALL.has(cls) || !nodes[i] || !nodes[j]) continue;
    const a = world.mapToWorld(nodes[i][0] * 1800, nodes[i][1] * 1121);
    const b = world.mapToWorld(nodes[j][0] * 1800, nodes[j][1] * 1121);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < MIN_EDGE_M) continue;
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const seed = hash(Math.round(x * 10), Math.round(y * 10));
    if (seed / 4294967296 >= SITE_CHANCE) continue;
    const site = {
      x, y, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len, cls, seed,
      place: placeOf(cls, (x - o.x) / mpp, (y - o.y) / mpp, seed),
    };
    list.push(site);
    const key = Math.floor(x / 50) + ',' + Math.floor(y / 50);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(site);
  }
  s = { list, grid };
  SITES.set(world.graph, s);
  return s;
}

/** What is beside the road, from the child's map (distances in map pixels,
 *  one is ~3.5 m). Water wins, then wood, then houses, then fields. */
function placeOf(cls, px, py, seed) {
  const u = (hash(seed, 7) % 1000) / 1000;
  if (MAP) {
    if (distTo(MAP.pools, px, py, 25) <= 25) return 'water';
    if (distTo(MAP.woodland, px, py, 10) <= 10) return 'wood';
  }
  if (cls === 'residential') return 'houses';
  if (MAP) {
    if (distTo(MAP.farmland, px, py, 8) <= 8) return 'field';
    if (distTo(MAP['green-areas'], px, py, 8) <= 8) return 'park';
  }
  return u < 0.4 ? 'hedge' : 'field';
}

/** Who crosses at a place in a season. Hedgehogs by houses, parks and
 *  hedges; rabbits and pheasants by fields; ducks by water; a deer by woods.
 *  An empty party is a hedgehog place in winter: the sign stays, the
 *  hedgehog is asleep. */
function partyFor(place, season, seed) {
  const r = rng(hash(seed, 11));
  const one = (kind, look) => ({ kind, look: look ?? '' });
  switch (place) {
    case 'water': {
      if (season === 'spring') {
        const n = 4 + Math.floor(r() * 4);
        return [one('duck', 'hen'), ...Array.from({ length: n }, () => one('duckling'))];
      }
      return r() < 0.6 ? [one('duck', 'hen'), one('duck', 'drake')] : [one('duck', r() < 0.5 ? 'hen' : 'drake')];
    }
    // A roe buck's antlers are what tell a child it is a deer; he casts them
    // in late autumn and they are only buds until spring.
    case 'wood': return [one('deer', season !== 'winter' && r() < 0.6 ? 'buck' : 'doe')];
    case 'houses': case 'park': case 'hedge':
      return season === 'winter' ? [] : [one('hedgehog')];
    default:
      return r() < 0.55 ? [one('rabbit')] : [one('pheasant', r() < 0.7 ? 'cock' : 'hen')];
  }
}

// ---------------------------------------------------------------- the contract

/** Fresh crossings for a new route. Finds the sites the route drives through,
 *  on straight small-road stretches, at least SPACING_M apart.
 *  @param {Route} route @param {World} world */
export function create(route, world) {
  const xing = { route, world, crossings: [], t: 0 };
  if (!world?.graph) return xing;
  const { grid } = sitesFor(world);
  const seen = new Set();
  let lastS = -Infinity;
  for (let s = START_CLEAR_M; s < route.length - END_CLEAR_M; s += 1) {
    if (!SMALL.has(route.roadClassAt(s))) continue;
    const p = route.atDistance(s);
    const hx = Math.cos(p.h), hy = Math.sin(p.h);
    const cx = Math.floor(p.x / 50), cy = Math.floor(p.y / 50);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (const site of grid.get(gx + ',' + gy) ?? []) {
        if (seen.has(site)) continue;
        if (Math.hypot(site.x - p.x, site.y - p.y) > 1.2) continue;
        if (Math.abs(site.dx * hx + site.dy * hy) < 0.98) continue;   // crossing it, not along it
        seen.add(site);
        const sx = s + (site.x - p.x) * hx + (site.y - p.y) * hy;
        if (sx - lastS < SPACING_M || sx > route.length - END_CLEAR_M) continue;
        // Straight for the van stopped in front of it and the animals beyond.
        const before = route.atDistance(sx - 16).h, after = route.atDistance(sx + 6).h;
        if (Math.abs(wrap(before - p.h)) > 0.02 || Math.abs(wrap(after - p.h)) > 0.02) continue;
        if (!SMALL.has(route.roadClassAt(sx))) continue;
        // The same road for SETTLED_M before it. Where a road narrows the page
        // eases the van in at 4 m/s, so for a while it rides over the verge,
        // where the animal waits nose to the kerb.
        if (!sameRoadBefore(route, sx)) continue;
        lastS = sx;
        xing.crossings.push(makeCrossing(route, world, site, sx));
      }
    }
  }
  if (typeof window !== 'undefined') window.__crossings = xing;   // for a test, as window.__drive
  return xing;
}

const SETTLED_M = 45;   // the widest change, a dual carriageway's 8.3 m, at 20 m/s
function sameRoadBefore(route, s) {
  const cls = route.roadClassAt(s);
  for (let k = 5; k <= SETTLED_M; k += 5) if (route.roadClassAt(Math.max(0, s - k)) !== cls) return false;
  return true;
}

function makeCrossing(route, world, site, s) {
  const p = route.atDistance(s);
  const cls = route.roadClassAt(s);
  const halfW = cls === 'track' ? 2.5 : 2 * Math.abs(route.laneOffset(0, s));
  const r = rng(hash(site.seed, 3));
  // The verge it sets out from. Mostly the near one: at the lane zoom with
  // the van standing in the left lane the far verge of a 9 m lane is just off
  // the screen's right edge, and an animal should be seen before it steps out.
  const side = r() < 0.75 ? -1 : 1;
  const party = partyFor(site.place, world.season, site.seed).map((a, k) => ({
    ...a, k, sp: SPECIES[a.kind], d: 0, alpha: 1, phase: r() * 6.28,
  }));
  // Followers queue nose to tail behind the leader, deeper in the verge;
  // ducklings huddle a little closer than that.
  let back = 0;
  for (let k = 1; k < party.length; k++) {
    const a = party[k], b = party[k - 1];
    back += a.kind === 'duckling' ? (a.sp.dl + b.sp.dl) / 2 - 0.06 : (a.sp.dl + b.sp.dl) / 2 + 0.25;
    a.back = back;
  }
  if (party[0]) party[0].back = 0;
  for (const a of party) a.d = -a.back;
  const sign = route.atDistance(Math.max(1, s - ZONE_HALF_M - SIGN_BEFORE_M));
  const signLat = -((route.roadClassAt(Math.max(1, s - ZONE_HALF_M - SIGN_BEFORE_M)) === 'track'
    ? 2.5 : 2 * Math.abs(route.laneOffset(0, Math.max(1, s - ZONE_HALF_M - SIGN_BEFORE_M)))) + 0.9);
  return {
    s, x: p.x, y: p.y, h: p.h, halfW, side,
    // The leader waits with its nose just short of the kerb, in plain sight
    // and in front of the hedge (scenery.js's begin about 2.8 m beyond it).
    verge: party[0] ? party[0].sp.dl / 2 + 0.15 : 1, cls, place: site.place, seed: site.seed,
    species: party[0]?.kind ?? (['houses', 'park', 'hedge'].includes(site.place) ? 'hedgehog' : null), party,
    sign: { x: sign.x, y: sign.y, h: sign.h, lat: signLat, hog: ['houses', 'park', 'hedge'].includes(site.place) },
    state: party.length ? 'wait' : 'none', t: 0, seen: 0, script: null,
    forced: false, moving: false, praised: false,
    pauses: [0.5 + r() * 0.8, r() < 0.6 ? 0.3 + r() * 0.8 : 0], midFrac: 0.3 + r() * 0.35,
  };
}

/** The leader's distance walked from its waiting spot at time t: to the
 *  kerb, a pause, part way, maybe another pause, then across and on into the
 *  far verge far enough that the last of a family is off the road too. */
function buildScript(c) {
  const lead = c.party[0], v = lead.sp.speed;
  const last = c.party[c.party.length - 1];
  const kerb = 0.35, mid = c.verge + c.midFrac * 2 * c.halfW;
  const end = c.verge + 2 * c.halfW + last.sp.dl / 2 + 0.6 + last.back;
  const legs = [];
  let d = 0;
  const walk = (to) => { legs.push({ d0: d, d1: to, dur: (to - d) / v }); d = to; };
  const wait = (dur) => { if (dur > 0) legs.push({ d0: d, d1: d, dur }); };
  walk(kerb); wait(c.pauses[0]); walk(mid); wait(c.pauses[1]); walk(end);
  return legs;
}
function scriptAt(legs, t) {
  for (const l of legs) {
    if (t <= l.dur) return l.d0 + (l.d1 - l.d0) * (t / l.dur);
    t -= l.dur;
  }
  return legs[legs.length - 1].d1;
}

/** Lateral offset of a party member walking d metres from its start. */
function latOf(c, a, d) { return c.side * (c.halfW + c.verge - d); }

/** True while any of the party is on the carriageway or about to be. */
function onRoad(c) {
  const last = c.party[c.party.length - 1];
  return last.d < 2 * c.halfW + c.verge + last.sp.dl / 2 + 0.15;
}

/** What the page's toast says when she stops by herself: words for her,
 *  not an event id. The only event step() reports. */
const THANKS = { hedgehog: '🦔', rabbit: '🐇', pheasant: '🐦', duck: '🦆', deer: '🦌' };
function thanks(c) {
  return 'Thank you for waiting! ' + (c.party.some(a => a.kind === 'duckling') ? '🦆🐥🐥' : THANKS[c.species]);
}

/** Advance the animals and report what they mean for the van.
 *  @returns {{ speedCap: number, events: string[] }} speedCap as in traffic.js:
 *  the fastest the van may go this frame without reaching an animal; the page
 *  brakes hard itself if she has not. */
export function step(xing, dt, van) {
  xing.t += dt;
  let speedCap = Infinity;
  const events = [];
  const L = van.length || 4.8;
  const nose = van.s + L / 2, tail = van.s - L / 2;
  for (const c of xing.crossings) {
    if (c.state === 'none' || c.state === 'gone') continue;
    const gap = c.s - ZONE_HALF_M - nose;    // room before the closed stretch
    if (c.state === 'wait') {
      const ahead = van.view?.ahead;
      if (ahead == null || c.s - van.s < ahead - c.party[0].sp.dl / 2) c.seen += dt;   // all of it, even turned
      if (c.s - nose <= triggerGap(van.v) && c.seen >= SEEN_S) {
        if (gap >= van.v * van.v / (2 * COMMIT_DECEL) + 0.5) {
          c.state = 'go'; c.blocking = true; c.moving = van.v > 0.5;
        } else c.state = 'late';
      }
    }
    if (c.state === 'late' && tail > c.s + ZONE_HALF_M + 1) { c.state = 'go'; c.blocking = false; }
    if (c.state !== 'go') continue;

    if (!c.script) c.script = buildScript(c);
    c.t += dt;
    const lead = scriptAt(c.script, c.t);
    for (const a of c.party) a.d = lead - a.back;
    const total = c.script.reduce((n, l) => n + l.dur, 0);

    if (c.blocking && !onRoad(c)) c.blocking = false;
    if (c.blocking) {
      const cap = gap <= 0 ? 0 : Math.min(Math.sqrt(2 * CAP_DECEL * gap), gap / Math.max(dt, 1e-3));
      speedCap = Math.min(speedCap, cap);
      if (van.v > cap + 1e-9) c.forced = true;       // the page brakes for her now
      if (van.v > 0.5) c.moving = true;
      if (van.v < 0.25 && c.moving && !c.forced && !c.praised) {
        c.praised = true;
        events.push(thanks(c));
      }
    }
    if (c.t > total) {
      for (const a of c.party) a.alpha = Math.max(0, 1 - (c.t - total) / 1.2);
      if (c.t > total + 1.2) c.state = 'gone';
    }
  }
  return { speedCap, events };
}

/** Every animal's drawn body in world metres, for the check and for
 *  traffic.js if it wants to give way too: a box len along the animal's
 *  heading h and wid across it, centred on (x, y), as drawn this frame.
 *  r is half the width, for anything that wants a circle.
 *  {x, y, h, len, wid, r, kind, s, lat, crossing} */
export function animals(xing) {
  const out = [];
  for (const c of xing.crossings) {
    if (c.state === 'none' || c.state === 'gone') continue;
    const walking = isWalking(c);
    for (const a of c.party) {
      const p = pose(c, a, xing.t, walking);
      out.push({ x: p.x, y: p.y, h: p.h, len: a.sp.dl, wid: a.sp.dw, r: a.sp.dw / 2,
        kind: a.kind, s: p.s, lat: p.lat, crossing: c });
    }
  }
  return out;
}

/** Where an animal is and which way it faces. A wobble along the road, as
 *  they do not walk ruler-straight (bounded by 0.12 m, inside ZONE_HALF_M);
 *  a waddle or a scurry while walking; and a look up and down the road
 *  while it waits. The box's centre is the drawing's, so what the check
 *  measures is what she sees. */
/** Strides a second (radians) for the animals whose body moves as they go;
 *  a duck's waddle is all in its turn. A stride is FRAMES pictures. */
const GAIT = { hedgehog: 22, rabbit: 8, pheasant: 11, deer: 7 };
const FRAMES = 8;
const TAU = Math.PI * 2;

function pose(c, a, t, walking) {
  const lat = latOf(c, a, a.d);
  const ds = 0.12 * Math.sin(a.d * 1.7 + a.phase);
  const hx = Math.cos(c.h), hy = Math.sin(c.h);
  let yaw = 0, frame = 0;
  if (!walking) yaw = (a.kind === 'duckling' ? 0.12 : 0.3) * Math.sin(t * 1.4 + a.phase);
  else {
    if (a.kind === 'duck' || a.kind === 'duckling') yaw = 0.12 * Math.sin(t * 9 + a.phase);
    else if (a.kind === 'hedgehog') yaw = 0.05 * Math.sin(t * 22 + a.phase);
    const f = GAIT[a.kind];
    if (f) frame = ((Math.round((t * f + a.phase) / TAU * FRAMES) % FRAMES) + FRAMES) % FRAMES;
  }
  return {
    x: c.x + hx * ds - hy * lat, y: c.y + hy * ds + hx * lat, s: c.s + ds, lat,
    h: c.h + (c.side < 0 ? Math.PI / 2 : -Math.PI / 2) + yaw, frame,
    lift: a.kind === 'rabbit' ? Math.max(0, Math.sin(frame / FRAMES * TAU)) : 0,
  };
}

/** Which closed stretches the van must stay out of, for anything else that
 *  wants to know (traffic.js). [{s0, s1}] in route metres. */
export function closed(xing) {
  return xing.crossings.filter(c => c.state === 'go' && c.blocking)
    .map(c => ({ s0: c.s - ZONE_HALF_M, s1: c.s + ZONE_HALF_M }));
}

function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

function isWalking(c) {
  if (c.state !== 'go' || !c.script) return false;
  let t = c.t;
  for (const l of c.script) { if (t <= l.dur) return l.d1 !== l.d0; t -= l.dur; }
  return false;
}

// ------------------------------------------------------------------ drawing

let HOG_SIGN = null;
if (typeof Image !== 'undefined') {
  HOG_SIGN = new Image();
  HOG_SIGN.src = new URL('../../assets/driving/topdown/decor/decor-sign-hedgehog.png', import.meta.url).href;
}

const SHADOW = 'rgba(40,46,38,.22)';

/** The contour every animal shares with the hedges: a dark warm ink, stroked
 *  under the fill at the hedges' 0.36 m so 0.18 m of it shows. Ducklings get
 *  a finer line, or they would be more ink than duckling. */
const INK = '#33241a';
const INK_W = 0.36, INK_W_SMALL = 0.2;

/** Each animal is described once and painted from that twice: the parts as
 *  one silhouette, stroked and filled in ink, so the contour runs round the
 *  whole animal and not between its parts, as on a hedge; then the parts in
 *  colour, with the details only this second time. */
let pctx = null, inking = false;
const P = {
  get paint() { return !inking; },
  e(x, y, rx, ry, rot, fill) {
    if (inking) { pctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); pctx.ellipse(x, y, rx, ry, rot, 0, TAU); return; }
    pctx.beginPath(); pctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    pctx.fillStyle = fill; pctx.fill();
  },
  /** A detail: colour only, no contour. */
  dab(x, y, rx, ry, rot, fill) { if (!inking) P.e(x, y, rx, ry, rot, fill); },
  /** A closed outline from a flat [x0, y0, x1, y1, ...] list, scaled and moved. */
  poly(pts, fill, ox = 0, oy = 0, sx = 1, sy = 1) {
    if (!inking) pctx.beginPath();
    pctx.moveTo(ox + pts[0] * sx, oy + pts[1] * sy);
    for (let i = 2; i < pts.length; i += 2) pctx.lineTo(ox + pts[i] * sx, oy + pts[i + 1] * sy);
    pctx.closePath();
    if (!inking) { pctx.fillStyle = fill; pctx.fill(); }
  },
};

/** Called with ctx in world metres, rotated by the camera, after traffic and
 *  before the van. Shadows along view.sun, as scenery.js and traffic.js. */
export function draw(ctx, xing, view) {
  const r2 = (view.radius + 4) ** 2;
  const lw = 1.1 / view.ppm;
  for (const c of xing.crossings) {
    const sg = c.sign;
    const sx = sg.x + Math.cos(sg.h + Math.PI / 2) * sg.lat, sy = sg.y + Math.sin(sg.h + Math.PI / 2) * sg.lat;
    if ((sx - view.cx) ** 2 + (sy - view.cy) ** 2 < r2) drawSign(ctx, sg, sx, sy, c.species, view, lw);
    if (c.state === 'none' || c.state === 'gone') continue;
    if ((c.x - view.cx) ** 2 + (c.y - view.cy) ** 2 > r2) continue;
    const walking = isWalking(c);
    for (let k = c.party.length - 1; k >= 0; k--) {
      const a = c.party[k];
      if (a.alpha <= 0) continue;
      const p = pose(c, a, xing.t, walking), sp = a.sp, im = spriteOf(a, p.frame);
      if (!im) continue;
      // Shadow first, in world space along the sun, so it stays put as the
      // camera turns; a hopping rabbit's leaves it behind. A plain oval: a
      // second picture per animal measured as dear as the first.
      const hgt = sp.hgt + 0.3 * p.lift;
      ctx.save();
      ctx.translate(p.x + view.sun.x * hgt, p.y + view.sun.y * hgt);
      ctx.rotate(p.h);
      ctx.globalAlpha = a.alpha;
      ctx.fillStyle = SHADOW;
      ctx.beginPath();
      ctx.ellipse(0, 0, sp.dl * 0.4, sp.dw * 0.36, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.h);
      ctx.globalAlpha = a.alpha;
      ctx.drawImage(im.body, -im.w / 2, -im.h / 2, im.w, im.h);
      ctx.restore();
    }
  }
}

/** Each animal is painted once per frame of its stride into a small canvas
 *  and drawn from there: a dozen ellipses and a wide stroke per animal per
 *  frame cost a phone about a millisecond, a picture almost nothing. Baked
 *  finer than the closest zoom at a pixel ratio of 2 (22 x 1.6 x 2 px/m),
 *  so it is only ever drawn smaller. */
const SPRITE_PPM = 80;
const sprites = new Map();
function spriteOf(a, frame) {
  const key = a.kind + a.look + frame;
  let im = sprites.get(key);
  if (im !== undefined) return im;
  const sp = a.sp, shape = DRAW[a.kind], g = Math.sin(frame / FRAMES * TAU);
  const cw = Math.ceil(sp.dl * SPRITE_PPM) + 4, ch = Math.ceil(sp.dw * SPRITE_PPM) + 4;
  const make = () => {
    // A page canvas, not an OffscreenCanvas: drawing one of those onto the
    // page's canvas measured slower than painting the animal afresh.
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; return cv;
  };
  const body = make();
  if (!body) { sprites.set(key, null); return null; }
  pctx = body.getContext('2d');
  pctx.translate(cw / 2, ch / 2);
  pctx.scale(SPRITE_PPM, SPRITE_PPM);
  pctx.translate(sp.ox, 0);
  inking = true;
  pctx.beginPath(); shape(a, g);
  pctx.lineJoin = 'round';
  pctx.lineWidth = a.kind === 'duckling' ? INK_W_SMALL : INK_W;
  pctx.strokeStyle = INK; pctx.stroke();
  pctx.fillStyle = INK; pctx.fill();
  inking = false;
  shape(a, g);
  pctx = null;
  im = { body, w: cw / SPRITE_PPM, h: ch / SPRITE_PPM };
  sprites.set(key, im);
  return im;
}

/** The hedgehog's spiny outline, a unit ellipse with every other point
 *  pulled in. */
const SPINES = [];
for (let k = 0; k < 30; k++) {
  const t = (k / 30) * TAU, rr = k % 2 ? 0.88 : 1;
  SPINES.push(Math.cos(t) * rr, Math.sin(t) * rr);
}
/** Pale spine tips in rows across its back. */
const HOG_FLECKS = [];
for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) {
  const x = -0.38 + j * 0.1 + (i % 2) * 0.05, y = -0.165 + i * 0.11;
  if (((x + 0.06) / 0.3) ** 2 + (y / 0.215) ** 2 < 1) HOG_FLECKS.push(x, y);
}
/** A pheasant's tail, tapering to a point behind it. */
const TAIL = [-0.14, 0.08, -0.96, 0.032, -1.0, 0, -0.96, -0.032, -0.14, -0.08];

/** Top-down bodies, nose along +x, in metres at the drawn scale. g is where
 *  it is in its stride, -1 to 1, 0 standing. */
const DRAW = {
  hedgehog(a, g) {
    const w = 0.05 * g;                                             // the scurry
    P.e(0.2 + w, 0.22, 0.065, 0.045, 0, '#c99d73');                // feet under the skirt
    P.e(0.2 - w, -0.22, 0.065, 0.045, 0, '#c99d73');
    P.e(-0.2 - w, 0.22, 0.065, 0.045, 0, '#c99d73');
    P.e(-0.2 + w, -0.22, 0.065, 0.045, 0, '#c99d73');
    P.poly(SPINES, '#6b4a2e', -0.05, 0, 0.37, 0.27);
    if (P.paint) {
      P.dab(-0.02, 0.04, 0.24, 0.13, 0, '#5a3d25');
      for (let i = 0; i < HOG_FLECKS.length; i += 2) P.dab(HOG_FLECKS[i], HOG_FLECKS[i + 1], 0.038, 0.015, 0, '#ead3a2');
    }
    P.e(0.29, 0, 0.15, 0.115, 0, '#e4c696');                        // the pale face
    if (P.paint) {
      P.dab(0.33, 0.062, 0.024, 0.024, 0, '#1d140e');
      P.dab(0.33, -0.062, 0.024, 0.024, 0, '#1d140e');
    }
    P.e(0.435, 0, 0.032, 0.032, 0, '#1d140e');                      // nose
  },
  rabbit(a, g) {
    const l = Math.max(0, g);                                       // 0 crouched, 1 mid-hop
    P.e(-0.25 - 0.1 * l, 0.15, 0.16, 0.06, -0.1, '#7f6345');        // hind feet, kicking out
    P.e(-0.25 - 0.1 * l, -0.15, 0.16, 0.06, 0.1, '#7f6345');
    P.e(-0.06, 0, 0.3 + 0.03 * l, 0.2, 0, '#9c7c58');
    if (P.paint) P.dab(-0.1, -0.05, 0.18, 0.08, 0, '#bc9b73');      // sunlit back
    P.e(-0.37 - 0.04 * l, 0, 0.075, 0.075, 0, '#f6f1e6');           // white scut
    P.e(0.27, 0, 0.15, 0.13, 0, '#a5845f');
    // Long ears, laid back and a little apart: they are what says rabbit.
    P.e(0.08, 0.1, 0.21, 0.058, -0.5, '#8f7050');
    P.e(0.08, -0.1, 0.21, 0.058, 0.5, '#8f7050');
    if (P.paint) {
      P.dab(0.1, 0.09, 0.14, 0.024, -0.5, '#d6a597');
      P.dab(0.1, -0.09, 0.14, 0.024, 0.5, '#d6a597');
      P.dab(-0.08, 0.2, 0.04, 0.035, -0.5, '#3a2b1f');              // black ear tips
      P.dab(-0.08, -0.2, 0.04, 0.035, 0.5, '#3a2b1f');
      P.dab(0.31, 0.092, 0.022, 0.022, 0, '#1d140e');
      P.dab(0.31, -0.092, 0.022, 0.022, 0, '#1d140e');
      P.dab(0.405, 0, 0.026, 0.022, 0, '#d48c88');
    }
  },
  pheasant(a, g) {
    const cock = a.look === 'cock';
    const bob = 0.035 * g;                                          // the head goes as it walks
    P.poly(TAIL, cock ? '#b07a3e' : '#9b8462');
    if (P.paint) for (let x = -0.3; x > -0.92; x -= 0.12) P.dab(x, 0, 0.013, 0.07 + x * 0.04, 0, '#4d3218');
    P.e(0, 0, 0.26, 0.17, 0, cock ? '#b9652a' : '#ab8e66');
    if (P.paint) {
      P.dab(-0.06, 0, 0.17, 0.11, 0, cock ? '#d08a48' : '#c4ab84');   // folded wings
      for (let i = 0; i < 6; i++) P.dab(-0.16 + (i >> 1) * 0.1, (i & 1 ? 1 : -1) * 0.06, 0.026, 0.015, 0, cock ? '#5e3417' : '#5e4a30');
      if (cock) P.dab(0.16, 0, 0.024, 0.08, 0, '#f4efe4');           // white neck ring
    }
    P.e(0.25 + bob, 0, 0.1, 0.085, 0, cock ? '#2f5d4f' : '#a38763');
    if (P.paint && cock) {
      P.dab(0.27 + bob, 0.048, 0.045, 0.025, 0, '#cf3a2c');          // red wattles
      P.dab(0.27 + bob, -0.048, 0.045, 0.025, 0, '#cf3a2c');
    }
    if (P.paint) {
      P.dab(0.29 + bob, 0.05, 0.016, 0.016, 0, '#1d140e');
      P.dab(0.29 + bob, -0.05, 0.016, 0.016, 0, '#1d140e');
    }
    P.e(0.36 + bob, 0, 0.045, 0.024, 0, '#e2cf8a');                 // beak
  },
  duck(a) {
    const drake = a.look === 'drake';
    P.e(-0.4, 0, 0.07, 0.06, 0, drake ? '#2b2b2b' : '#7a5a36');      // tail
    P.e(-0.05, 0, 0.36, 0.22, 0, drake ? '#d9d3c6' : '#a68056');
    if (P.paint) {
      P.dab(-0.12, 0.085, 0.24, 0.1, -0.05, drake ? '#a39a88' : '#80603b');   // folded wings
      P.dab(-0.12, -0.085, 0.24, 0.1, 0.05, drake ? '#a39a88' : '#80603b');
      P.dab(-0.03, 0.16, 0.07, 0.028, 0, '#3d63b5');                 // the blue flash
      P.dab(-0.03, -0.16, 0.07, 0.028, 0, '#3d63b5');
      if (drake) {
        P.dab(0.2, 0, 0.075, 0.16, 0, '#7b4028');                    // chestnut breast
        P.dab(0.23, 0, 0.02, 0.1, 0, '#f4f1ea');                     // white collar
      } else for (let i = 0; i < 5; i++) P.dab(-0.3 + i * 0.1, (i & 1 ? 0.04 : -0.04), 0.03, 0.016, 0, '#5e4127');
    }
    P.e(0.31, 0, 0.13, 0.115, 0, drake ? '#2f7448' : '#9d7752');
    if (P.paint) {
      P.dab(0.33, 0.07, 0.02, 0.02, 0, '#1d140e');
      P.dab(0.33, -0.07, 0.02, 0.02, 0, '#1d140e');
    }
    P.e(0.45, 0, 0.085, 0.05, 0, drake ? '#e6c544' : '#df8a3a');     // bill
  },
  duckling(a) {
    P.e(-0.02, 0, 0.16, 0.12, 0, '#e6c450');
    if (P.paint) P.dab(-0.06, 0, 0.085, 0.06, 0, '#8a6630');          // the brown back
    P.e(0.15, 0, 0.085, 0.078, 0, '#ecce58');
    if (P.paint) {
      P.dab(0.17, 0.045, 0.015, 0.015, 0, '#2a1e12');
      P.dab(0.17, -0.045, 0.015, 0.015, 0, '#2a1e12');
    }
    P.e(0.24, 0, 0.035, 0.024, 0, '#5a4526');
  },
  deer(a, g) {
    const nod = 0.03 * g, w = 0.07 * g;                             // legs, under the flanks
    P.e(0.28 + w, 0.22, 0.075, 0.065, 0, '#7d4f2b');
    P.e(0.28 - w, -0.22, 0.075, 0.065, 0, '#7d4f2b');
    P.e(-0.55 - w, 0.2, 0.075, 0.065, 0, '#7d4f2b');
    P.e(-0.55 + w, -0.2, 0.075, 0.065, 0, '#7d4f2b');
    P.e(-0.18, 0, 0.6, 0.25, 0, '#a5693a');
    if (P.paint) {
      P.dab(-0.16, -0.02, 0.42, 0.1, 0, '#c58d5c');                 // the sunlit back
      P.dab(-0.7, 0, 0.075, 0.13, 0, '#f3ebdd');                     // white rump
    }
    P.e(0.46, 0, 0.24, 0.1, 0, '#a5693a');                           // neck
    if (a.look === 'buck') {                                         // short forked antlers
      P.e(0.66 + nod, 0.12, 0.13, 0.034, -0.65, '#eadcbc');
      P.e(0.66 + nod, -0.12, 0.13, 0.034, 0.65, '#eadcbc');
      P.e(0.62 + nod, 0.2, 0.06, 0.03, 0.4, '#eadcbc');
      P.e(0.62 + nod, -0.2, 0.06, 0.03, -0.4, '#eadcbc');
    }
    P.e(0.74 + nod, 0.17, 0.13, 0.06, -0.8, '#94592f');              // big ears
    P.e(0.74 + nod, -0.17, 0.13, 0.06, 0.8, '#94592f');
    if (P.paint) {
      P.dab(0.74 + nod, 0.17, 0.085, 0.03, -0.8, '#e2b99a');
      P.dab(0.74 + nod, -0.17, 0.085, 0.03, 0.8, '#e2b99a');
    }
    P.e(0.82 + nod, 0, 0.19, 0.13, 0, '#9c6034');
    P.e(0.98 + nod, 0, 0.09, 0.075, 0, '#9c6034');                   // muzzle
    if (P.paint) {
      P.dab(0.82 + nod, 0.08, 0.028, 0.028, 0, '#1d140e');
      P.dab(0.82 + nod, -0.08, 0.028, 0.028, 0, '#1d140e');
      P.dab(0.97 + nod, 0, 0.065, 0.05, 0, '#e9d9c4');               // pale muzzle
    }
    P.e(1.05 + nod, 0, 0.04, 0.045, 0, '#2a1c12');                   // nose
  },
};

function blob(ctx, x, y, rx, ry, fill, ink, lw) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = fill; ctx.fill();
  if (ink) { ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.stroke(); }
}

/** A warning sign on its post at the left verge, seen from above: the post's
 *  shadow along the sun, and the plate turned to face the van so it reads.
 *  The painted hedgehog sign where hedgehogs cross, a drawn triangle else. */
function drawSign(ctx, sg, x, y, species, view, lw) {
  const W = 1.1, POST = 2.1;
  ctx.save();
  ctx.strokeStyle = SHADOW; ctx.lineWidth = 0.09; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + view.sun.x * POST, y + view.sun.y * POST); ctx.stroke();
  // The plate stands across the road facing the van, so from above its
  // shadow is a thin band: the plate's width, stretched along the sun from
  // its bottom edge's height to its top's.
  const ax = Math.cos(sg.h + Math.PI / 2) * W / 2, ay = Math.sin(sg.h + Math.PI / 2) * W / 2;
  const lo = POST - W * 0.87, hi = POST;
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.moveTo(x - ax + view.sun.x * lo, y - ay + view.sun.y * lo);
  ctx.lineTo(x + ax + view.sun.x * lo, y + ay + view.sun.y * lo);
  ctx.lineTo(x + view.sun.x * hi, y + view.sun.y * hi);
  ctx.closePath(); ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(sg.h + Math.PI / 2);   // the plate's top points down the road
  blob(ctx, 0, W * 0.25, 0.05, 0.05, '#6b6b66', '#3a3a36', lw);   // post top
  if (sg.hog && HOG_SIGN && HOG_SIGN.complete && HOG_SIGN.naturalWidth) {
    // The painting's triangle sits in its top 64%; the rest is clear.
    const iw = HOG_SIGN.naturalWidth, ih = HOG_SIGN.naturalHeight;
    const sw = iw * 0.86, sh = ih * 0.6, h = W * sh / sw;
    ctx.drawImage(HOG_SIGN, iw * 0.07, ih * 0.05, sw, sh, -W / 2, -h * 0.62, W, h);
  } else {
    triangle(ctx, W); ctx.fillStyle = '#c8402e'; ctx.fill();
    ctx.strokeStyle = '#7a2216'; ctx.lineWidth = lw; ctx.stroke();
    triangle(ctx, W * 0.62, W * 0.06); ctx.fillStyle = '#f6f0e2'; ctx.fill();
    glyph(ctx, species, W);
  }
  ctx.restore();
}
function triangle(ctx, w, dy = 0) {
  const h = w * 0.866;
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.62 + dy); ctx.lineTo(w / 2, h * 0.38 + dy); ctx.lineTo(-w / 2, h * 0.38 + dy); ctx.closePath();
}
/** A small black side-on figure for the drawn sign, so it says which animal. */
function glyph(ctx, species, W) {
  const k = W / 1.1;
  ctx.save(); ctx.scale(k, k); ctx.translate(0, 0.12);
  ctx.fillStyle = '#231d18';
  const e = (x, y, rx, ry, r = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, r, 0, Math.PI * 2); ctx.fill(); };
  if (species === 'deer') {
    e(0, 0, 0.13, 0.06); e(0.14, -0.1, 0.035, 0.07, 0.4); e(0.17, -0.16, 0.05, 0.03);
    ctx.fillRect(-0.1, 0.03, 0.025, 0.1); ctx.fillRect(0.08, 0.03, 0.025, 0.1);
  } else if (species === 'duck' || species === 'duckling') {
    e(0, 0.03, 0.12, 0.065); e(0.1, -0.06, 0.045, 0.045); e(0.16, -0.055, 0.04, 0.015);
  } else if (species === 'pheasant') {
    e(0, 0.03, 0.09, 0.06); e(0.08, -0.05, 0.035, 0.035); e(-0.16, 0, 0.11, 0.018, -0.35);
  } else if (species === 'hedgehog') {
    e(0, 0.03, 0.12, 0.075); e(0.13, 0.06, 0.05, 0.025, 0.3);
  } else {   // rabbit, and the default
    e(-0.02, 0.04, 0.11, 0.07); e(0.08, -0.03, 0.05, 0.045); e(0.07, -0.11, 0.018, 0.06, -0.2);
  }
  ctx.restore();
}
