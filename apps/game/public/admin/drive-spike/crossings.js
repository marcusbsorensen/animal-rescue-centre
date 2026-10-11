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
// small road. The animal waits on the verge until the van is close enough to
// see it at the lane zoom, and only steps out if the van can still stop short
// of it at well under the page's emergency rate. From that moment until the
// last animal is off the far kerb the whole carriageway at that place is
// closed, and speedCap keeps the van's nose short of it. If the van is
// already too close (a route that starts beside one), the animal stays in the
// hedge and crosses behind the van. crossings.check.mjs drives this with
// random inputs and measures the gap in world space.
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

/** The rate the cap is computed at, below the page's EMERGENCY of 26 m/s², so
 *  frame stepping never carries the van past the line. And the stricter rate
 *  an animal checks before stepping out at all. */
const CAP_DECEL = 22;
const COMMIT_DECEL = 18;

/** Along the road, how far either side of the crossing's centre is closed:
 *  the widest body (a deer's length is across the road; its width is along
 *  it), its wobble, and a clear metre in front of the bumper. */
const ZONE_HALF_M = 1.9;
const VERGE_M = 1.3;          // where an animal waits, beyond the kerb

/** The warning sign stands this far before the zone: far enough to be read
 *  first, near enough to be on screen just before the animal is. */
const SIGN_BEFORE_M = 22;

/** Bodies, true to life in metres. len along the animal, wid across it, hgt
 *  for the shadow, r for the clearance check, speed in m/s while walking. */
const SPECIES = {
  hedgehog: { len: 0.25, wid: 0.16, hgt: 0.14, r: 0.14, speed: 1.3 },
  rabbit:   { len: 0.40, wid: 0.18, hgt: 0.22, r: 0.21, speed: 2.0 },
  pheasant: { len: 0.80, wid: 0.20, hgt: 0.32, r: 0.42, speed: 1.4 },
  duck:     { len: 0.55, wid: 0.25, hgt: 0.25, r: 0.29, speed: 1.2 },
  duckling: { len: 0.14, wid: 0.09, hgt: 0.08, r: 0.08, speed: 1.2 },
  deer:     { len: 1.15, wid: 0.34, hgt: 0.85, r: 0.60, speed: 1.7 },
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
    case 'wood': return [one('deer')];
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
        lastS = sx;
        xing.crossings.push(makeCrossing(route, world, site, sx));
      }
    }
  }
  if (typeof window !== 'undefined') window.__crossings = xing;   // for a test, as window.__drive
  return xing;
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
    ...a, k, sp: SPECIES[a.kind], d: 0, alpha: 1,
    gap: a.kind === 'duckling' ? 0.24 : k === 0 ? 0 : 0.7,
    phase: r() * 6.28,
  }));
  // Followers queue behind the leader, deeper in the verge.
  let back = 0;
  for (const a of party) { back += a.gap; a.back = a.k === 0 ? 0 : back; a.d = -a.back; }
  const sign = route.atDistance(Math.max(1, s - ZONE_HALF_M - SIGN_BEFORE_M));
  const signLat = -((route.roadClassAt(Math.max(1, s - ZONE_HALF_M - SIGN_BEFORE_M)) === 'track'
    ? 2.5 : 2 * Math.abs(route.laneOffset(0, Math.max(1, s - ZONE_HALF_M - SIGN_BEFORE_M)))) + 0.9);
  return {
    s, x: p.x, y: p.y, h: p.h, halfW, side, cls, place: site.place, seed: site.seed,
    species: party[0]?.kind ?? (['houses', 'park', 'hedge'].includes(site.place) ? 'hedgehog' : null), party,
    sign: { x: sign.x, y: sign.y, h: sign.h, lat: signLat, hog: ['houses', 'park', 'hedge'].includes(site.place) },
    state: party.length ? 'wait' : 'none', t: 0, script: null,
    forced: false, moving: false, praised: false,
    pauses: [0.5 + r() * 0.8, r() < 0.6 ? 0.3 + r() * 0.8 : 0], midFrac: 0.3 + r() * 0.35,
  };
}

/** The leader's distance walked from its waiting spot at time t: to the
 *  kerb, a pause, part way, maybe another pause, then across and on into the
 *  far verge far enough that the last of a family is off the road too. */
function buildScript(c) {
  const lead = c.party[0], v = lead.sp.speed;
  const kerb = VERGE_M - 0.15, mid = VERGE_M + c.midFrac * 2 * c.halfW;
  const end = 2 * VERGE_M + 2 * c.halfW + 0.6 + c.party[c.party.length - 1].back;
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
function latOf(c, a, d) { return c.side * (c.halfW + VERGE_M - d); }

/** True while any of the party is on the carriageway or about to be. */
function onRoad(c) {
  const last = c.party[c.party.length - 1];
  return last.d < 2 * c.halfW + VERGE_M + last.sp.r + 0.15;
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
      if (c.s - nose <= triggerGap(van.v)) {
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
        events.push('stopped-for-animal');
      }
    }
    if (c.t > total) {
      for (const a of c.party) a.alpha = Math.max(0, 1 - (c.t - total) / 1.2);
      if (c.t > total + 1.2) c.state = 'gone';
    }
  }
  return { speedCap, events };
}

/** Every animal's body in world metres, for the check and for traffic.js if
 *  it wants to give way too: {x, y, r, kind, s, lat, crossing}. */
export function animals(xing) {
  const out = [];
  for (const c of xing.crossings) {
    if (c.state === 'none' || c.state === 'gone') continue;
    for (const a of c.party) out.push({ ...bodyAt(c, a, xing.t), r: a.sp.r, kind: a.kind, crossing: c });
  }
  return out;
}

/** Where an animal is, with a little wobble along the road: they do not walk
 *  ruler-straight. Bounded by 0.12 m, inside ZONE_HALF_M. */
function bodyAt(c, a, t) {
  const lat = latOf(c, a, a.d);
  const ds = 0.12 * Math.sin(a.d * 1.7 + a.phase);
  const hx = Math.cos(c.h), hy = Math.sin(c.h);
  const nx = Math.cos(c.h + Math.PI / 2), ny = Math.sin(c.h + Math.PI / 2);
  return { x: c.x + hx * ds + nx * lat, y: c.y + hy * ds + ny * lat, s: c.s + ds, lat };
}

/** Which closed stretches the van must stay out of, for anything else that
 *  wants to know (traffic.js). [{s0, s1}] in route metres. */
export function closed(xing) {
  return xing.crossings.filter(c => c.state === 'go' && c.blocking)
    .map(c => ({ s0: c.s - ZONE_HALF_M, s1: c.s + ZONE_HALF_M }));
}

function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

// ------------------------------------------------------------------ drawing

let HOG_SIGN = null;
if (typeof Image !== 'undefined') {
  HOG_SIGN = new Image();
  HOG_SIGN.src = new URL('../../assets/driving/topdown/decor/decor-sign-hedgehog.png', import.meta.url).href;
}

const SHADOW = 'rgba(40,46,38,.22)';

/** Called with ctx in world metres, rotated by the camera, after traffic and
 *  before the van. Shadows along view.sun, as scenery.js and traffic.js. */
export function draw(ctx, xing, view) {
  const lw = 1.1 / view.ppm;
  const r2 = (view.radius + 4) ** 2;
  for (const c of xing.crossings) {
    const sg = c.sign;
    const sx = sg.x + Math.cos(sg.h + Math.PI / 2) * sg.lat, sy = sg.y + Math.sin(sg.h + Math.PI / 2) * sg.lat;
    if ((sx - view.cx) ** 2 + (sy - view.cy) ** 2 < r2) drawSign(ctx, sg, sx, sy, c.species, view, lw);
    if (c.state === 'none' || c.state === 'gone') continue;
    if ((c.x - view.cx) ** 2 + (c.y - view.cy) ** 2 > r2) continue;
    const dir = c.h + (c.side < 0 ? Math.PI / 2 : -Math.PI / 2);   // facing across
    for (let k = c.party.length - 1; k >= 0; k--) {
      const a = c.party[k];
      if (a.alpha <= 0) continue;
      const b = bodyAt(c, a, xing.t);
      const walking = c.state === 'go' && c.t > 0 && isWalking(c);
      ctx.save();
      ctx.globalAlpha = a.alpha;
      // Shadow first, in world space along the sun, so it stays put as the
      // camera turns.
      ctx.save();
      ctx.translate(b.x + view.sun.x * a.sp.hgt, b.y + view.sun.y * a.sp.hgt);
      ctx.rotate(dir);
      ctx.fillStyle = SHADOW;
      shadowShape(ctx, a);
      ctx.restore();
      ctx.translate(b.x, b.y);
      ctx.rotate(dir);
      const bob = walking ? Math.sin(xing.t * 14 + a.phase) : 0;
      DRAW[a.kind](ctx, a, lw, bob);
      ctx.restore();
    }
  }
}

function isWalking(c) {
  let t = c.t;
  for (const l of c.script) { if (t <= l.dur) return l.d1 !== l.d0; t -= l.dur; }
  return false;
}

function shadowShape(ctx, a) {
  const { len, wid } = a.sp;
  ctx.beginPath();
  if (a.kind === 'pheasant') {
    ctx.ellipse(0.02, 0, 0.17, wid / 2, 0, 0, Math.PI * 2);
    ctx.moveTo(-0.1, 0.03); ctx.lineTo(-0.55, 0.01); ctx.lineTo(-0.55, -0.01); ctx.lineTo(-0.1, -0.03);
  } else ctx.ellipse(0, 0, len / 2, wid / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Flat fill, darker ink outline, a little wash: the game's register. */
function blob(ctx, x, y, rx, ry, fill, ink, lw, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  if (ink) { ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.stroke(); }
}
function wash(ctx, x, y, rx, ry, colour, alpha) {
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = colour; ctx.fill(); ctx.restore();
}

/** Top-down bodies, nose along +x, in metres. */
const DRAW = {
  hedgehog(ctx, a, lw) {
    // A spiky oval: the spines are the outline.
    ctx.beginPath();
    const n = 22;
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * Math.PI * 2, rr = k % 2 ? 0.86 : 1;
      const x = Math.cos(t) * 0.115 * rr - 0.01, y = Math.sin(t) * 0.08 * rr;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.fillStyle = '#7b5b3d'; ctx.fill();
    ctx.strokeStyle = '#3b2a1b'; ctx.lineWidth = lw; ctx.stroke();
    wash(ctx, -0.03, -0.015, 0.06, 0.04, '#b08c62', 0.55);
    blob(ctx, 0.095, 0, 0.042, 0.034, '#d8c29c', '#5a4430', lw);   // face
    blob(ctx, 0.135, 0, 0.011, 0.011, '#2a1d14', null, lw);         // nose
  },
  rabbit(ctx, a, lw, bob) {
    const s = 1 + 0.06 * Math.max(0, bob);                           // the hop
    blob(ctx, -0.18, 0, 0.035, 0.035, '#f4efe4', '#6d5a44', lw);    // scut
    blob(ctx, -0.03, 0, 0.16 * s, 0.09, '#9a8263', '#4d3e2c', lw);
    wash(ctx, -0.06, -0.02, 0.09, 0.045, '#c2ab88', 0.5);
    blob(ctx, 0.12, 0, 0.065, 0.055, '#9a8263', '#4d3e2c', lw);     // head
    blob(ctx, 0.04, -0.03, 0.07, 0.018, '#8a7356', '#4d3e2c', lw, -0.25); // ears laid back
    blob(ctx, 0.04, 0.03, 0.07, 0.018, '#8a7356', '#4d3e2c', lw, 0.25);
    blob(ctx, 0.175, 0, 0.012, 0.012, '#3a2b20', null, lw);
  },
  pheasant(ctx, a, lw) {
    const cock = a.look === 'cock';
    // Long barred tail behind.
    ctx.beginPath();
    ctx.moveTo(-0.1, 0.035); ctx.lineTo(-0.56, 0.012); ctx.lineTo(-0.56, -0.012); ctx.lineTo(-0.1, -0.035); ctx.closePath();
    ctx.fillStyle = cock ? '#9a6a36' : '#8f7a5a'; ctx.fill();
    ctx.strokeStyle = '#4a321a'; ctx.lineWidth = lw; ctx.stroke();
    ctx.strokeStyle = 'rgba(60,40,20,.6)';
    for (let x = -0.18; x > -0.52; x -= 0.07) { ctx.beginPath(); ctx.moveTo(x, -0.025); ctx.lineTo(x, 0.025); ctx.stroke(); }
    blob(ctx, 0.02, 0, 0.16, 0.095, cock ? '#b8662c' : '#a48a64', '#4a321a', lw);
    wash(ctx, -0.02, -0.03, 0.09, 0.04, cock ? '#d99a5a' : '#c7ae86', 0.5);
    if (cock) {
      blob(ctx, 0.155, 0, 0.022, 0.05, '#f2ede2', null, lw);         // white neck ring
      blob(ctx, 0.19, 0, 0.045, 0.04, '#2e4d40', '#1b2d25', lw);     // green head
      blob(ctx, 0.2, -0.022, 0.018, 0.012, '#c8322b', null, lw);     // red wattles
      blob(ctx, 0.2, 0.022, 0.018, 0.012, '#c8322b', null, lw);
    } else blob(ctx, 0.18, 0, 0.042, 0.037, '#a48a64', '#4a321a', lw);
    blob(ctx, 0.235, 0, 0.014, 0.01, '#d9c27a', null, lw);           // beak
  },
  duck(ctx, a, lw) {
    const drake = a.look === 'drake';
    blob(ctx, 0, 0, 0.22, 0.115, drake ? '#cfc8b8' : '#9b7b55', drake ? '#5d5446' : '#4d3a24', lw);
    wash(ctx, -0.05, 0, 0.12, 0.07, drake ? '#8b7a64' : '#6f5435', 0.45);   // folded wings
    if (drake) blob(ctx, 0.14, 0, 0.035, 0.07, '#7a4a35', null, lw);        // chestnut breast
    blob(ctx, 0.2, 0, 0.055, 0.05, drake ? '#2f6a42' : '#8c6e4c', drake ? '#1d3d28' : '#4d3a24', lw);
    blob(ctx, 0.27, 0, 0.035, 0.02, drake ? '#e0c24a' : '#d48a3a', '#6a5020', lw);  // bill
  },
  duckling(ctx, a, lw) {
    blob(ctx, 0, 0, 0.06, 0.042, '#d9b84a', '#7a6324', lw);
    wash(ctx, -0.01, 0, 0.035, 0.022, '#7a6334', 0.45);
    blob(ctx, 0.05, 0, 0.026, 0.024, '#6b5326', '#4a3a18', lw);
    blob(ctx, 0.078, 0, 0.012, 0.008, '#3a2e18', null, lw);
  },
  deer(ctx, a, lw, bob) {
    const nod = 0.015 * bob;
    blob(ctx, -0.03, 0, 0.42, 0.165, '#9c6b40', '#4a3018', lw);
    wash(ctx, 0, 0, 0.3, 0.08, '#c19066', 0.45);                     // the sunlit back
    blob(ctx, -0.42, 0, 0.07, 0.1, '#f1e8d8', '#7a6a55', lw);        // white rump
    blob(ctx, 0.43 + nod, 0, 0.07, 0.06, '#9c6b40', '#4a3018', lw);   // neck
    blob(ctx, 0.52 + nod, 0, 0.1, 0.06, '#94643b', '#4a3018', lw);    // head
    blob(ctx, 0.47 + nod, -0.065, 0.04, 0.022, '#8a5a34', '#4a3018', lw, 0.6);  // ears
    blob(ctx, 0.47 + nod, 0.065, 0.04, 0.022, '#8a5a34', '#4a3018', lw, -0.6);
    blob(ctx, 0.615 + nod, 0, 0.016, 0.02, '#2a1c12', null, lw);      // nose
  },
};

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
