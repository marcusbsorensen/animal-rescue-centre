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
// see them on a phone, and the gap that counts is to the body as drawn, with
// the glow under it: crossings.check.mjs drives this with random inputs and
// measures that gap in world space.
//
// How they look (Marcus, 2026-10-12, 21A). The game's own painted animals,
// side on, standing upright on the screen however the road turns, with no
// more than a hairline added to their own painted contour, and a warm glow
// on the road under each that pulses in time with how it goes: a rabbit
// hops and pauses, a hedgehog shuffles, stops, sniffs and shuffles again, a
// fox bounds. Where the painting does not exist yet, the old top-down shape
// stands in, with the same gait and glow. The glow is a soft halo about
// twice the animal's width (Marcus, 2026-10-12, 32A). Marcus, 2026-10-13: each
// stands with its feet on a soft shadow sized to it, and the glow is light
// on the road round that shadow, thin enough to see the tarmac through. Marcus,
// 2026-10-14, 93B: the glow is a soft gold edge with a faint darker line just
// outside it, so it reads on pale ground (frost, sand, straw) as well as tarmac.
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
//   about all year;
//   red foxes are about all year too, along hedges and field edges, in woods
//   and in towns, mostly at dusk and after dark. They are on the roads most
//   in autumn, when the cubs leave home, and in winter, the mating season.
//   The spike has no time of day, so the dusk shows only as foxes being
//   fewer than the rabbits beside a field.

const SMALL = new Set(['residential', 'unclassified', 'track']);

/** About one crossing per 300 m of small road: edges are ~48 m. */
const SITE_CHANCE = 0.16;
const MIN_EDGE_M = 36;        // the midpoint needs 18 m of straight each side
const SPACING_M = 110;        // never two crossings closer than this on a route
/** A field site this close to a wood is by the woods, and a deer may cross
 *  there instead (Marcus, 55A). Within WOOD_PLACE_M the place is the wood's
 *  own. Sites are only ever on small roads, never the A28. */
const WOOD_NEAR_M = 90, WOOD_PLACE_M = 35;
/** The rarer animals. Marcus, 2026-10-13 (60A): the drake was out on one
 *  drive in a hundred or more and a deer on one in forty; each should be
 *  about one in ten.
 *  The child's map is coarse: its woods, one pond no lane passes, and garden
 *  swimming pools, where the ducks had been crossing. So the real water and
 *  woods beside the lanes come from OpenStreetMap (nature.json, written by
 *  tools/osm-nature.py), and every small-road edge beside water
 *  (WATER_NEAR_M) or along a wood's edge (WOOD_EDGE_M) is a place they may
 *  cross as well as the hash's sites, but only on a drive when they do, so
 *  the lanes are no more stop-start for it. On each drive the ducks are out
 *  at a water place with DUCKS_OUT, most often by still water (a pond, a
 *  reservoir, the marsh), less by running water (a ditch, a drain, the
 *  stream), at the first such place the route passes; a deer is out with
 *  DEER_OUT, at the first wood or scrub edge, or field by the woods. Either
 *  way, once a drive at most. Places of one kind are at least
 *  NATURE_SPACING_M apart. A residential street beside a wood is not a
 *  deer's crossing. */
const WATER_NEAR_M = 40, WOOD_EDGE_M = 40, NATURE_SPACING_M = 150;
const DUCKS_OUT = { still: 0.6, running: 0.2 }, DEER_OUT = 0.17;
const STILL_WATER = new Set(['pond', 'lake', 'basin', 'wetland']);
/** Drives so far. Which ducks are at the water and whether a deer is out
 *  change from drive to drive; counted from 0 in node so the checks repeat,
 *  from a random start in the browser so a reload is a new drive. */
let driveNo = typeof window === 'undefined' ? 0 : Math.floor(Math.random() * 1e9);
const START_CLEAR_M = 35;     // none where the van sets off...
const END_CLEAR_M = 45;       // ...or where it pulls up

/** How far ahead of the van's nose an animal starts to cross, by the van's
 *  speed. The van should come to rest about one van length short of it, so
 *  it crosses mid-screen where she is looking (Marcus, 2026-10-12, 39A: it
 *  used to set out ~10 m ahead, and once the camera had come in it crossed
 *  up under the chips). So it sets out when a child who lets go a moment
 *  after it moves (REACT_S, then the page's BRAKE) stops LET_GO_SPARE_M
 *  more than a van length short of its line; if she does not, the van stops
 *  itself SELF_STOP_SPARE_M less than a van length short (stopAt). Never so
 *  near the van could not stop (COMMIT_DECEL). */
const REACT_S = 0.3, LET_GO = 14, LET_GO_SPARE_M = 0.25, SELF_STOP_SPARE_M = 0.25;
function stopShort(c, L) { return Math.max(L + LET_GO_SPARE_M, c.near + 0.5); }
/** How far a child who lets go REACT_S after it moves takes to stop from v. */
function letGoRun(v) { return REACT_S * v + v * v / (2 * LET_GO); }
function triggerGap(c, v, L) { return stopShort(c, L) + letGoRun(v); }
/** The speed from which letGoRun is room: letGoRun's inverse. */
function letGoSpeed(room) { return room <= 0 ? 0 : LET_GO * (Math.sqrt(REACT_S * REACT_S + 2 * room / LET_GO) - REACT_S); }

/** The van slows for an animal waiting ahead (39A, every gear). It can only
 *  step out once it has been seen and is clear of the chips, and at speed
 *  the screen shows less road than triggerGap: in second and third it
 *  stepped out late and the van's own stop caught her even when she let go
 *  at once. So the van eases, at APPROACH_DECEL, gentler than letting go and
 *  so never felt in the back, to the speed at which the animal is on the
 *  screen by triggerGap (as the page's view shows it now); nearer, to the
 *  speed from which letting go still stops short; never below CREEP, so a
 *  van whose animal cannot step out (something coming the other way, or
 *  held under the chips) still rolls on by.
 *  And never faster than KERB_V, first gear's speed, however much road the
 *  screen shows: upright, the page now shows 26-30 m ahead in second and
 *  third, so the animal was always on screen in time, the van never eased,
 *  and it stepped out with the van at full speed, where a frame or a
 *  moment's reaction is a metre: the stops ran from 3.9 to 5.4 m. Eased to
 *  the same speed in every gear, the van stops the same distance short in
 *  every gear (Marcus, 39A), and the van slows for an animal waiting at the
 *  kerb as a careful driver would. */
const APPROACH_DECEL = 6, CREEP = 2, SEEN_SPARE_M = 0.3, KERB_V = 7;
function approachCap(c, van, nose, L, t) {
  const dist = c.s - nose;
  const room = dist - stopShort(c, L);
  const v = van.view;
  let vOk = KERB_V;
  if (v?.ahead != null && v.ppm) {
    const shown = v.ahead - chipsPx(v, t) / v.ppm - L / 2 - c.top - SEEN_SPARE_M;
    vOk = Math.min(KERB_V, Math.max(CREEP, letGoSpeed(shown - stopShort(c, L))));
  }
  const far = Math.sqrt(vOk * vOk + 2 * APPROACH_DECEL * Math.max(0, dist - triggerGap(c, vOk, L)));
  return Math.max(CREEP, Math.min(far, letGoSpeed(room)));
}

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

/** Every other vehicle on the road, both ways, gives way too (Marcus,
 *  2026-10-12: "make SURE that the crossing animals on the road are not run
 *  over by vehicles coming in the other direction!"). traffic.js stops each
 *  one short of closed() at a careful driver's 3.5 m/s², ANIMAL_GAP short of
 *  it. An animal steps out only when every vehicle coming either way can do
 *  that at TRAFFIC_DECEL, a little gentler, from a frame later
 *  (TRAFFIC_LAG s), with TRAFFIC_SLACK m to spare for a corner beyond; one
 *  in the stretch or too close to stop and it waits on the verge until it
 *  has gone by. Its stop is traffic.js's to keep, whatever this decides:
 *  this only makes sure that stop is a gentle one. */
const TRAFFIC_DECEL = 3, TRAFFIC_LAG = 0.06, TRAFFIC_GAP = 1.2, TRAFFIC_SLACK = 3;

/** Whether no vehicle but the van (others: {s, L, v, dir}) is in the way of
 *  crossing c now. */
function trafficClear(c, others) {
  const s0 = c.s - c.near, s1 = c.s + c.far;
  for (const w of others) {
    const ahead = w.s + w.dir * w.L / 2, behind = w.s - w.dir * w.L / 2;
    // Gone by: its tail is past the stretch.
    if (w.dir > 0 ? behind > s1 + 1 : behind < s0 - 1) continue;
    const room = (w.dir > 0 ? s0 - ahead : ahead - s1) - TRAFFIC_GAP - TRAFFIC_SLACK;
    if (room <= 0 || w.v * TRAFFIC_LAG + w.v * w.v / (2 * TRAFFIC_DECEL) > room) return false;
  }
  return true;
}

/** Along the road, how far either side of the crossing's centre is closed
 *  is worked out for each crossing from its party (zoneOf): the drawn
 *  bodies and glows, a family's line, the wobble, and a clear metre in front
 *  of the bumper. */
const CLEAR_M = 1;

/** A side-on animal stands upright on the screen, so where the camera looks
 *  a little off the road's line its box turns against the road by that
 *  much. The camera aims 20 m ahead and the road is straight only 6 m past a
 *  crossing, but by the time the van is close it has long settled:
 *  crossings.check.mjs measured 0.03 at most within 6 m of an animal, and
 *  fails if it is ever more than this. */
const CAM_SKEW = 0.12;
export const CAMERA_SKEW = CAM_SKEW;

/** The HUD chips and the dev row along the top of the screen, css px:
 *  van.view.chipsPx if the page gives it, else the bottom of the page's
 *  #top, read now and then (reading it every frame would force a layout),
 *  else 104, measured at 390x844 (68 held sideways). Once it has been seen,
 *  an animal waits to step out until all of it, and all of its family, is
 *  below them. */
const CHIPS_PX = 104;
let chipsRead = { at: -Infinity, px: CHIPS_PX };
function chipsPx(view, t) {
  if (view.chipsPx != null) return view.chipsPx;
  if (typeof document === 'undefined') return CHIPS_PX;
  if (t - chipsRead.at > 1) {
    const el = document.getElementById('top');
    chipsRead = { at: t, px: el ? el.getBoundingClientRect().bottom : CHIPS_PX };
  }
  return chipsRead.px;
}

/** The warning sign stands this far before the zone: far enough to be read
 *  first, near enough to be on screen just before the animal is. */
const SIGN_BEFORE_M = 22;

/** The page's pixels per metre at the standing lane zoom, held upright: PPM
 *  22 x ZOOM_STILL.lane 1.35 in drive-spike.html. The sizes below are css px
 *  there, on a 390x844 phone, turned into metres by it; the page's zoom
 *  scales them from there like everything else. */
const LANE_PPM = 22 * 1.35;

/** The game's own painted animals (assets/animals): side on, facing right,
 *  512x512 with their own thin painted line. Art still being painted drops
 *  in by filename; until a file is there that species is drawn top down as
 *  before (TOPDOWN). len is the painting's length nose to tail (tail
 *  included) in css px at LANE_PPM: a hedgehog's body 44px, a rabbit's the
 *  same, a fox clearly bigger, ducklings small but plain. The painting is
 *  fitted inside len x len*tall, so the box the van keeps clear of is known
 *  before any picture has loaded, and in node, where none ever does. files
 *  are by look; '' is for every look not listed. */
const ART = {
  hedgehog: { len: 44, tall: 0.75, files: {
    brown: 'hedgehog-brown-walking.png', chocolate: 'hedgehog-chocolate-walking.png',
    'salt-and-pepper': 'hedgehog-salt-and-pepper-walking.png', blonde: 'hedgehog-blonde-walking.png',
  } },
  rabbit:   { len: 44, tall: 0.95, files: { '': 'rabbit-walking.png' } },
  fox:      { len: 68, tall: 0.9, files: { '': 'fox-red-walking.png' } },
  // The other of each pair (Marcus, 52A): a drake beside the hen mallard, a
  // hen pheasant beside the cock, a roe doe beside the buck.
  pheasant: { len: 58, tall: 0.8, files: { '': 'pheasant-walking.png', hen: 'pheasant-hen-walking.png' } },
  duck:     { len: 42, tall: 0.95, files: { '': 'duck-walking.png', drake: 'drake-walking.png' } },
  duckling: { len: 24, tall: 1.0, files: { '': 'duckling-walking.png' } },
  deer:     { len: 86, tall: 1.15, files: { '': 'deer-walking.png', doe: 'deer-doe-walking.png' } },
};
for (const k in ART) { ART[k].L = ART[k].len / LANE_PPM; ART[k].H = ART[k].L * ART[k].tall; }

/** The stand-ins, top down, in metres. dl and dw are the whole drawing, ink
 *  and every frame of its stride included, measured in a browser off the
 *  pixels drawn (1 cm grid, plus a margin); ox centres the drawing on that
 *  box. hgt lifts the shadow. The fox has no measured drawing of its own:
 *  its painting is in the game, so this is only for a failed load. */
const TOPDOWN = {
  hedgehog: { dl: 1.29, dw: 0.95, ox: -0.03, hgt: 0.28 },
  rabbit:   { dl: 1.33, dw: 0.83, ox: 0.04, hgt: 0.32 },
  fox:      { dl: 2.2, dw: 0.8, ox: 0.14, hgt: 0.5 },
  pheasant: { dl: 1.84, dw: 0.75, ox: 0.28, hgt: 0.36 },
  duck:     { dl: 1.41, dw: 0.85, ox: -0.03, hgt: 0.3 },
  duckling: { dl: 0.70, dw: 0.49, ox: -0.05, hgt: 0.14 },
  deer:     { dl: 2.3, dw: 0.98, ox: -0.17, hgt: 0.9 },
};

/** How each goes, procedurally, from its one pose. speed is the average
 *  across the road in m/s, pauses included, which is what the crossing's
 *  timing is built on; stride is the ground one cycle covers; move is the
 *  part of a cycle spent moving, the rest stopped. In metres of the drawn
 *  animal, so a big storybook hedgehog shuffles in big storybook steps.
 *    shuffle: a few quick steps, stop, sniff, again (hedgehog)
 *    hop:     arcs of lift, pitched nose up then down, squashed on landing
 *    waddle:  steady, rocking side to side (ducks; the ducklings quicker)
 *    strut:   short dashes, leaning in, a stop to look between, and now and
 *             then a run for it (pheasant) */
const GAIT = {
  hedgehog: { type: 'shuffle', speed: 1.1, stride: 0.75, move: 0.55 },
  rabbit:   { type: 'hop', speed: 1.7, stride: 1.05, move: 0.42, lift: 0.42, squash: 0.2, pitch: 0.22 },
  fox:      { type: 'hop', speed: 3.0, stride: 1.9, move: 0.82, lift: 0.3, squash: 0.08, pitch: 0.14 },
  deer:     { type: 'hop', speed: 4.2, stride: 3.6, move: 0.86, lift: 0.3, squash: 0.08, pitch: 0.2, most: 3 },
  pheasant: { type: 'strut', speed: 1.3, stride: 1.3, move: 0.45, run: 2.2 },
  duck:     { type: 'waddle', speed: 1.0, rock: 0.13, hz: 2.0 },
  duckling: { type: 'waddle', speed: 1.0, rock: 0.17, hz: 3.1 },
};

/** Biggest lift, squash and turn any gait gives, for the boxes. */
const MAX_SWELL = 1.14, MAX_STRETCH = 0.08;
const WOBBLE_M = 0.12, FOLLOW_WOBBLE_M = 0.1;

/** The glow under each, in fractions of the animal's length: a soft halo
 *  on the road under its feet, about twice as wide as the animal (Marcus,
 *  2026-10-12, 32A). */
const GLOW_RX = 1.0, GLOW_RY = 0.38;
/** The shadow each painted animal stands on, from its painting's feet: as long
 *  as the feet are far apart, a little more (SHADOW_LEN), never less than
 *  SHADOW_MIN of its width, as deep as SHADOW_DEPTH of that, and the feet
 *  stand SHADOW_SEAT of the shadow's half depth above its middle. In the air
 *  it keeps to the ground, a little smaller and paler. */
const SHADOW_LEN = 1.25, SHADOW_MIN = 0.62, SHADOW_DEPTH = 0.16, SHADOW_SEAT = 0.45;
const SHADOW_AIR_M = 0.28, SHADOW_AIR_SMALL = 0.18, SHADOW_AIR_PALE = 0.3;

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
/** From (px, py) to the nearest polygon of a group, 0 inside, in the
 *  group's own units. A polygon marked open is a line: a stream or a ditch,
 *  with no inside. */
function distTo(polys, px, py, within) {
  let best = Infinity;
  for (const p of polys) {
    if (px < p.x0 - within || px > p.x1 + within || py < p.y0 - within || py > p.y1 + within) continue;
    const q = p.pts;
    let inside = false;
    for (let i = p.open ? 1 : 0, j = p.open ? 0 : q.length - 1; i < q.length; j = i++) {
      const [ax, ay] = q[i], [bx, by] = q[j];
      if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) inside = !inside;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
    if (inside && !p.open) return 0;
  }
  return best;
}

let MAP = null;
try { MAP = parseMap(await loadText(MAP_URL)); } catch { MAP = null; }

/** The real water and woods beside the small roads (nature.json, from
 *  OpenStreetMap by tools/osm-nature.py), in metres from the map's top-left,
 *  which is MAP_M metres to a map pixel: { water, wood }, each a list of
 *  polygons as parseMap's, the waterways open. Without it the child's map
 *  stands in: its woods, and for water its pools, as before; so too for the
 *  water if nature.json has none. */
const MAP_M = 3900 / 1121;
const NATURE_URL = new URL('../../assets/driving/nature.json', import.meta.url);
const WATERS = new Set(['pond', 'lake', 'basin', 'wetland', 'stream', 'river', 'ditch', 'drain']);
function parseNature(doc) {
  const ring = a => {
    const r = []; let x = a[1], y = a[2];
    r.push([x * doc.q, y * doc.q]);
    for (let k = 3; k + 1 < a.length; k += 2) { x += a[k]; y += a[k + 1]; r.push([x * doc.q, y * doc.q]); }
    return r;
  };
  const out = { water: [], wood: [] };
  for (const a of doc.a) out[WATERS.has(doc.kinds[a[0]]) ? 'water' : 'wood'].push({ ...withBox(ring(a)), kind: doc.kinds[a[0]] });
  for (const l of doc.l) out.water.push({ ...withBox(ring(l)), open: true, kind: doc.kinds[l[0]] });
  return out;
}
let NATURE = null;
try { NATURE = parseNature(JSON.parse(await loadText(NATURE_URL))); } catch { NATURE = null; }

/** Metres from map pixel (px, py) to the nearest water, and to the nearest
 *  wood (0 inside it), looking no further than within metres. */
function waterDist(px, py, within) {
  if (NATURE?.water.length) return distTo(NATURE.water, px * MAP_M, py * MAP_M, within);
  return MAP ? distTo(MAP.pools, px, py, within / MAP_M) * MAP_M : Infinity;
}
/** The kind of the nearest real water: a pond, a ditch and so on. */
function waterKind(px, py, within) {
  let best = Infinity, kind = null;
  for (const p of NATURE?.water ?? []) {
    const d = distTo([p], px * MAP_M, py * MAP_M, within);
    if (d < best) { best = d; kind = p.kind; }
  }
  return kind;
}
function woodDist(px, py, within) {
  if (NATURE) return distTo(NATURE.wood, px * MAP_M, py * MAP_M, within);
  return MAP ? distTo(MAP.woodland, px, py, within / MAP_M) * MAP_M : Infinity;
}

// ---------------------------------------------------------------- the sites

/** Every candidate place in the world, once per graph: midpoints of small
 *  road edges that the hash picks, and those beside real water or along a
 *  wood's edge (extra: 'water' or 'wood'; there only on a drive when the
 *  ducks or the deer are, create), with what lives there. */
const SITES = new WeakMap();
function sitesFor(world) {
  let s = SITES.get(world.graph);
  if (s) return s;
  const o = world.mapToWorld(0, 0), mpp = world.mapToWorld(1, 0).x - o.x;
  const { nodes, edges } = world.graph;
  const list = [], grid = new Map(), extras = [];
  for (const [i, j, cls] of edges) {
    if (!SMALL.has(cls) || !nodes[i] || !nodes[j]) continue;
    const a = world.mapToWorld(nodes[i][0] * 1800, nodes[i][1] * 1121);
    const b = world.mapToWorld(nodes[j][0] * 1800, nodes[j][1] * 1121);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < MIN_EDGE_M) continue;
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const px = (x - o.x) / mpp, py = (y - o.y) / mpp;
    const seed = hash(Math.round(x * 10), Math.round(y * 10));
    const picked = seed / 4294967296 < SITE_CHANCE;
    const place = placeOf(cls, px, py, seed);
    const edge = cls !== 'residential' && woodDist(px, py, WOOD_EDGE_M) <= WOOD_EDGE_M;
    const water = place === 'water' && !!NATURE?.water.length;   // real water, not the pools standing in
    if (!picked && !water && !edge) continue;
    const site = {
      x, y, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len, cls, seed, place,
      byWood: (place === 'field' || place === 'hedge') && woodDist(px, py, WOOD_NEAR_M) <= WOOD_NEAR_M,
      extra: picked ? null : water ? 'water' : 'wood',
      water: water ? waterKind(px, py, WATER_NEAR_M) : null,
    };
    if (site.extra) { extras.push(site); continue; }
    list.push(site);
  }
  // The extra places thinned, by the hash, to one of a kind in
  // NATURE_SPACING_M: a lane beside a wood the whole way is one place.
  extras.sort((p, q) => p.seed - q.seed);
  for (const site of extras) {
    if (list.some(q => q.extra === site.extra && Math.hypot(q.x - site.x, q.y - site.y) < NATURE_SPACING_M)) continue;
    list.push(site);
  }
  for (const site of list) {
    const key = Math.floor(site.x / 50) + ',' + Math.floor(site.y / 50);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(site);
  }
  s = { list, grid };
  SITES.set(world.graph, s);
  return s;
}

/** What is beside the road (px, py in map pixels): real water, then a wood,
 *  then houses, then fields, from nature.json and the child's map. */
function placeOf(cls, px, py, seed) {
  const u = (hash(seed, 7) % 1000) / 1000;
  // The child's pools stand in only without real water: at about 87 m, as
  // they did.
  const nearWater = NATURE?.water.length ? WATER_NEAR_M : 25 * MAP_M;
  if (waterDist(px, py, nearWater) <= nearWater) return 'water';
  if (woodDist(px, py, WOOD_PLACE_M) <= WOOD_PLACE_M) return 'wood';
  if (cls === 'residential') return 'houses';
  if (MAP) {
    if (distTo(MAP.farmland, px, py, 8) <= 8) return 'field';
    if (distTo(MAP['green-areas'], px, py, 8) <= 8) return 'park';
  }
  return u < 0.4 ? 'hedge' : 'field';
}

/** Whether the ducks at a water place are out on this drive: on a pond most
 *  drives (it is their home), by a ditch, a drain or a stream less often (at
 *  the child's pools, standing in, every drive, as before). */
function duckOut(site, drive) {
  if (!NATURE?.water.length) return true;
  return hash(site.seed, 17, drive.seed) / 4294967296 < (STILL_WATER.has(site.water) ? DUCKS_OUT.still : DUCKS_OUT.running);
}
/** Where the drive's deer may cross: a wood, a wood's edge, or a field or a
 *  hedge by the woods; never in a street. */
function deerPlace(site) {
  return site.cls !== 'residential' && (site.place === 'wood' || site.byWood || site.extra === 'wood');
}

/** How likely a fox is, against the place's usual animal, by season: most
 *  in autumn (the cubs leaving home) and winter (the mating season). */
const FOX = { spring: 0.1, summer: 0.08, autumn: 0.18, winter: 0.22 };

/** Who crosses at a place in a season. Hedgehogs by houses, parks and
 *  hedges; rabbits and pheasants by fields and woods; ducks by water; the
 *  drive's deer (if it has one out) at the first wood or wood's edge it
 *  passes, or a field or hedge by the woods, never in a street; a fox now and then anywhere but
 *  the water, a little less by houses. An empty party is a hedgehog place in
 *  winter with no fox about: the sign stays, the hedgehog is asleep. A place
 *  keeps its animal from drive to drive, except the water's ducks and the
 *  deer (drive, 55A). */
function partyFor(site, season, drive = { seed: 0 }, deer = false) {
  const { place, seed } = site;
  const r = rng(hash(seed, 11));
  const d = rng(hash(seed, 13, drive.seed));
  const one = (kind, look) => ({ kind, look: look ?? '' });
  const fox = r() < (FOX[season] ?? 0.1) * (place === 'houses' || place === 'park' ? 0.6 : 1);
  // A roe buck's antlers are what tell a child it is a deer; he casts them
  // in late autumn and they are only buds until spring, so in winter every
  // deer is drawn as the doe. Otherwise buck and doe about half and half.
  if (deer) return [one('deer', season !== 'winter' && d() < 0.5 ? 'buck' : 'doe')];
  switch (place) {
    case 'water': {
      // Only the hen mallard leads ducklings; a drake crosses alone or walks
      // with a hen. In spring most often a hen and her ducklings.
      if (season === 'spring' && d() < 0.75) {
        const n = 4 + Math.floor(d() * 4);
        return [one('duck', 'hen'), ...Array.from({ length: n }, () => one('duckling'))];
      }
      const u = d();
      return u < 0.4 ? [one('duck', 'hen'), one('duck', 'drake')] : [one('duck', u < 0.7 ? 'hen' : 'drake')];
    }
    case 'wood':
      return fox || r() < 0.2 ? [one('fox')] : r() < 0.5 ? [one('rabbit')] : [one('pheasant', r() < 0.5 ? 'cock' : 'hen')];
    case 'houses': case 'park': case 'hedge': {
      if (fox) return [one('fox')];
      // Wild hedgehogs here are brown; now and then a darker or a paler one.
      const u = r();
      return season === 'winter' ? []
        : [one('hedgehog', u < 0.7 ? 'brown' : u < 0.82 ? 'chocolate' : u < 0.93 ? 'salt-and-pepper' : 'blonde')];
    }
    default:
      if (fox) return [one('fox')];
      return r() < 0.55 ? [one('rabbit')] : [one('pheasant', r() < 0.5 ? 'cock' : 'hen')];
  }
}

// ---------------------------------------------------------------- the contract

/** Fresh crossings for a new route. Finds the sites the route drives through,
 *  on straight small-road stretches, at least SPACING_M apart. The drive's
 *  rarer animals have the first claim: its ducks, if they are out today at
 *  the first water place it passes, and its deer at the first place by the
 *  woods; the usual places where there is room around them.
 *  @param {Route} route @param {World} world */
export function create(route, world) {
  const xing = { route, world, crossings: [], t: 0 };
  if (!world?.graph) return xing;
  const { grid } = sitesFor(world);
  const drive = { seed: hash(driveNo++, 41) };
  drive.deer = rng(hash(drive.seed, 43))() < DEER_OUT;
  const seen = new Set(), cands = [];
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
        if (sx > route.length - END_CLEAR_M) continue;
        // Straight for the van stopped in front of it and the animals beyond.
        const before = route.atDistance(sx - 16).h, after = route.atDistance(sx + 6).h;
        if (Math.abs(wrap(before - p.h)) > 0.02 || Math.abs(wrap(after - p.h)) > 0.02) continue;
        if (!SMALL.has(route.roadClassAt(sx))) continue;
        if (!settledBefore(route, sx)) continue;
        cands.push({ site, sx, same: settledBefore(route, sx, true) });
      }
    }
  }
  // An extra place, or the water's, with nothing out today is no crossing
  // at all: no sign, and it keeps no other from the route.
  const pond = cands.find(c => c.site.place === 'water');
  const ducks = pond && duckOut(pond.site, drive) ? pond : null;
  const room = (keep, c) => keep.every(k => Math.abs(k.sx - c.sx) >= SPACING_M);
  const keep = ducks ? [ducks] : [];
  const deer = drive.deer ? cands.find(c => deerPlace(c.site) && room(keep, c)) : null;
  if (deer) { deer.deer = true; keep.push(deer); }
  for (const c of cands) {
    if (c === ducks || c === deer || c.site.extra || c.site.place === 'water' || !c.same) continue;
    if (room(keep, c)) keep.push(c);
  }
  keep.sort((a, b) => a.sx - b.sx);
  for (const c of keep) xing.crossings.push(makeCrossing(route, world, c.site, c.sx, drive, !!c.deer));
  if (typeof window !== 'undefined') window.__crossings = xing;   // for a test, as window.__drive
  return xing;
}

/** The road settled under the van before s. Where a road narrows the page
 *  eases the van in at 4 m/s, so for a while it rides over the verge, where
 *  the animal waits nose to the kerb: from 20 m/s that takes 5 m of road for
 *  each metre its lane moves, SETTLED_M for a dual carriageway's 8.3 m. One
 *  that moves it less settles sooner: from a country road onto a lane the
 *  lane moves 0.25 m. The usual places keep the old rule, the same road for
 *  all of SETTLED_M (same), so they stay where she knows them and no more
 *  often; the rarer animals' places need only the road settled, or the
 *  ducks could never cross the lane by the pond Trikey rides past, 25 m on
 *  from a country road. */
const SETTLED_M = 45;
function settledBefore(route, s, same = false) {
  const cls = route.roadClassAt(s), lane = route.laneOffset(0, s);
  for (let k = 5; k <= SETTLED_M; k += 5) {
    const b = Math.max(0, s - k);
    if (route.roadClassAt(b) !== cls && (same || k < 5 * Math.abs(route.laneOffset(0, b) - lane) + 5)) return false;
  }
  return true;
}

function makeCrossing(route, world, site, s, drive, deer = false) {
  const p = route.atDistance(s);
  const cls = route.roadClassAt(s);
  const halfW = cls === 'track' ? 2.5 : 2 * Math.abs(route.laneOffset(0, s));
  const r = rng(hash(site.seed, 3));
  // The verge it sets out from. Mostly the near one: at the lane zoom with
  // the van standing in the left lane the far verge of a 9 m lane is just off
  // the screen's right edge, and an animal should be seen before it steps out.
  // A family always the near one, or its line would wait off the screen.
  const nearSide = r() < 0.75;
  const party = partyFor(site, world.season, drive, deer).map((a, k) => ({
    ...a, k, d: 0, alpha: 1, phase: r() * 6.28, file: fileOf(a.kind, a.look),
    // Half its length across the road, painted or stand-in, whichever is longer.
    half: Math.max(ART[a.kind].L, TOPDOWN[a.kind].dl) / 2,
  }));
  // Followers wait behind the leader on a slant: back into the verge and
  // back along it towards the van, so a family waits in a wobbly line in
  // plain sight, below the chips at the top of the screen and inside its
  // left edge. They cross in single file (Marcus, 2026-10-12: "they do not
  // cross roads like a big front"): each walks the trail of the one in
  // front, down the slant to where the leader stepped off and then along
  // her line across the road (trailOf). back is how far behind the leader
  // along that trail; ducklings keep closer, now and then one lags.
  let back = 0;
  for (let k = 1; k < party.length; k++) {
    const a = party[k], b = party[k - 1];
    a.gap = a.kind === 'duckling' ? (a.half + b.half) * 0.9 + (r() < 0.25 ? 0.25 + 0.35 * r() : 0) : a.half + b.half + 0.25;
    back += a.gap;
    a.back = back; a.along = -back * Math.SQRT1_2;
  }
  if (party[0]) { party[0].back = 0; party[0].along = 0; party[0].gap = 0; }
  for (const a of party) a.d = -a.back;
  const side = nearSide || party.length > 1 ? -1 : 1;
  const zone = zoneOf({ party });
  const signS = Math.max(1, s - zone.near - SIGN_BEFORE_M);
  const sign = route.atDistance(signS);
  const signLat = -((route.roadClassAt(signS) === 'track' ? 2.5 : 2 * Math.abs(route.laneOffset(0, signS))) + 0.9);
  const c = {
    s, x: p.x, y: p.y, h: p.h, halfW, side,
    // The leader waits with its nose just short of the kerb, in plain sight
    // and in front of the hedge (scenery.js's begin about 2.8 m beyond it);
    // a big one further back (waitBack).
    verge: party[0] ? waitBack(party[0]) : 1, cls, place: site.place, seed: site.seed,
    species: party[0]?.kind ?? (['houses', 'park', 'hedge'].includes(site.place) ? 'hedgehog' : null), party,
    sign: { x: sign.x, y: sign.y, h: sign.h, lat: signLat,
      hog: ['houses', 'park', 'hedge'].includes(site.place) && party[0]?.kind !== 'deer' },
    state: party.length ? 'wait' : 'none', t: 0, seen: 0, script: null, leg: null,
    forced: false, moving: false, praised: false,
    pauses: [0.5 + r() * 0.8, r() < 0.6 ? 0.3 + r() * 0.8 : 0], midFrac: 0.3 + r() * 0.35,
    // A pheasant now and then loses its nerve half way and runs for it.
    run: party[0]?.kind === 'pheasant' && r() < 0.4,
    ...zone,
  };
  return c;
}

/** How far along the road the crossing's drawn party reaches from its
 *  centre: top, the farthest point up the road (what must be on screen
 *  below the chips before it steps out); near and far, the stretch closed
 *  to the van and to anything coming the other way, a clear metre each. */
function zoneOf(c) {
  // A follower waiting on the verge towards the van is off the carriageway
  // (further out than the leader, who waits as any animal beside the road
  // does), and walks onto the road only on the leader's line, so only the
  // line counts towards the van: it stops a van length short of the family
  // as of anyone else.
  let near = 0, far = 0;
  for (const a of c.party) {
    const e = reachOf(a.kind) + (a.k ? FOLLOW_WOBBLE_M : 0);
    near = Math.max(near, e); far = Math.max(far, e + Math.max(0, a.along));
  }
  return { near: near + CLEAR_M, far: far + CLEAR_M, top: far };
}

/** The leader's legs: to the kerb, a pause, part way, maybe another pause,
 *  then across and on into the far verge far enough that the last of a
 *  family is off the road too. Each walking leg is a whole number of its
 *  gait's cycles (n), so a hop or a shuffle ends where the leg does. */
function buildScript(c) {
  const lead = c.party[0], g = GAIT[lead.kind];
  const last = c.party[c.party.length - 1];
  const kerb = c.verge - lead.half + 0.2, mid = c.verge + c.midFrac * 2 * c.halfW;
  const end = c.verge + 2 * c.halfW + last.half + 0.6 + last.back;
  const legs = [];
  let d = 0;
  const walk = (to, run) => {
    const dist = to - d;
    let n = g.stride && !run ? Math.max(1, Math.round(dist / g.stride)) : 1;
    if (g.most) n = Math.min(n, g.most);
    legs.push({ d0: d, d1: to, dur: dist / (run ? g.speed * g.run : g.speed), n, run: !!run });
    d = to;
  };
  const wait = (dur) => { if (dur > 0) legs.push({ d0: d, d1: d, dur, n: 1, run: false }); };
  walk(kerb); wait(c.pauses[0]); walk(mid); wait(c.pauses[1]); walk(end, c.run);
  return legs;
}

/** The leg the party is on at the crossing's time, the time into it and
 *  the leg before, or null before it has set off. */
function legNow(c) {
  if (c.state !== 'go' || !c.script) return null;
  let t = c.t;
  for (let i = 0; i < c.script.length; i++) {
    const l = c.script[i];
    if (t <= l.dur || i === c.script.length - 1) return { l, tl: Math.min(t, l.dur), prev: c.script[i - 1] ?? null };
    t -= l.dur;
  }
  return null;
}

const smooth = u => u * u * (3 - 2 * u);

/** Where in its gait an animal of this kind is, tl seconds into leg l.
 *  p is how far along the leg (0 to 1): it moves on a hop or a shuffle and
 *  stands still on the pause, so its place across the road follows the
 *  gait. lift (m), sq (squash) and st (stretch), tilt (radians, nose up)
 *  and pulse (0 to 1, what the glow keeps time with). Waddles and runs are
 *  steady across the road; their rock is drawn from the clock (looks). */
function gaitOf(kind, l, tl, prev) {
  const g = GAIT[kind];
  const G = { p: 1, lift: 0, sq: 0, st: 0, tilt: 0, pulse: 0, moving: false, steady: false };
  if (l.d1 === l.d0) {
    // A pause: a hopper has just landed, still squashed and the glow swelling.
    if (g.type === 'hop' && prev && prev.d1 !== prev.d0) { G.sq = g.squash * Math.exp(-tl / 0.07); G.pulse = Math.exp(-tl / 0.3); }
    return G;
  }
  G.moving = true;
  if (g.type === 'waddle' || l.run) { G.p = tl / l.dur; G.steady = true; return G; }
  const cyc = l.dur / l.n, x = Math.min(l.n - 1e-9, tl / cyc), k = Math.floor(x), f = x - k;
  const scale = Math.min(1, (l.d1 - l.d0) / l.n / g.stride);   // a short leg, a small step
  if (f < g.move) {
    const u = f / g.move;
    if (g.type === 'hop') {
      G.p = (k + u) / l.n;
      G.lift = g.lift * scale * 4 * u * (1 - u);
      G.tilt = g.pitch * scale * Math.cos(Math.PI * u);   // nose up off the ground, down to land
      G.st = MAX_STRETCH * scale * Math.sin(Math.PI * u);
      const since = k > 0 || (prev && prev.d1 !== prev.d0) ? (f + 1 - g.move) * cyc : Infinity;
      G.sq = g.squash * Math.exp(-since / 0.07);
      G.pulse = Math.max(Math.exp(-since / 0.3), 0.25 * Math.sin(Math.PI * u));
    } else {
      G.p = (k + smooth(u)) / l.n;
      G.pulse = Math.sin(Math.PI * u);
      if (g.type === 'shuffle') G.lift = 0.012 * Math.abs(Math.sin(3 * Math.PI * u));   // the scurry
      else { G.tilt = -0.12 * Math.sin(Math.PI * u); G.lift = 0.015 * Math.sin(Math.PI * u); }   // head-bob
    }
  } else {
    const w = (f - g.move) / (1 - g.move), since = (f - g.move) * cyc;
    G.p = (k + 1) / l.n; G.moving = false;
    if (g.type === 'hop') { G.sq = g.squash * Math.exp(-since / 0.07); G.pulse = Math.exp(-since / 0.3); }
    else if (g.type === 'shuffle') G.tilt = 0.07 * Math.sin(4 * Math.PI * w);   // a sniff
  }
  return G;
}

/** How far a follower is behind the leader along the trail now: each gap
 *  closes up a little and opens again at its own slow pace, so the file
 *  stretches and bunches unevenly; never longer than back, which the
 *  closed stretch and the script are built on. */
const FILE_BREATHE = 0.22;
function backNow(c, k) {
  let b = 0;
  for (let j = 1; j <= k; j++) {
    const m = c.party[j];
    b += m.gap * (1 - FILE_BREATHE * (0.5 + 0.5 * Math.sin(c.t * (0.8 + (m.phase % 0.9)) + m.phase)));
  }
  return b;
}

/** Where on its trail a party member is, d metres along it from the
 *  leader's start: across the road on her line once d >= 0, and before that
 *  down the slant it waited on. Across (metres, as d) and along the road
 *  (metres from her line, negative towards the van). */
function trailOf(d) {
  return d >= 0 ? { x: d, s: 0 } : { x: d * Math.SQRT1_2, s: d * Math.SQRT1_2 };
}

/** Latitude of a party member walking d metres from its start. */
function latOf(c, a, d) { return c.side * (c.halfW + c.verge - d); }

/** True while any of the party is on the carriageway or about to be. */
function onRoad(c) {
  const last = c.party[c.party.length - 1];
  return last.d < 2 * c.halfW + c.verge + last.half + 0.15;
}

/** What the page's toast says when she stops by herself: words for her,
 *  not an event id. The only event step() reports. */
const THANKS = { hedgehog: '🦔', rabbit: '🐇', pheasant: '🐦', duck: '🦆', deer: '🦌', fox: '🦊' };
function thanks(c) {
  return 'Thank you for waiting! ' + (c.party.some(a => a.kind === 'duckling') ? '🦆🐥🐥' : THANKS[c.species]);
}

/** Advance the animals and report what they mean for the van.
 *  @param {{s:number, L:number, v:number, dir:number}[]} [others] the other
 *  vehicles on the road (traffic.js's T.vehicles): an animal steps out only
 *  when all of them can stop for it, as well as the van
 *  @returns {{ speedCap: number, events: string[] }} speedCap as in traffic.js:
 *  the fastest the van may go this frame without reaching an animal; the page
 *  brakes hard itself if she has not. */
export function step(xing, dt, van, others = []) {
  xing.t += dt;
  if (van.camH != null) xing.camH = van.camH;
  let speedCap = Infinity;
  const events = [];
  const L = van.length || 4.8;
  const nose = van.s + L / 2, tail = van.s - L / 2;
  for (const c of xing.crossings) {
    if (c.state === 'none' || c.state === 'gone') continue;
    const gap = c.s - c.near - nose;    // room before the closed stretch
    if (c.state === 'wait') {
      // Seen once it is on the screen; out from under the chips when all of
      // the party is below them (metres ahead of the van, as view.ahead).
      const v = van.view;
      if (v?.ahead == null || c.s - van.s < v.ahead) c.seen += dt;
      const clear = v?.ahead == null || !v.ppm || c.s + c.top - van.s < v.ahead - chipsPx(v, xing.t) / v.ppm;
      // A frame early rather than a frame late: the van moves on v dt after
      // this, and setting out that much past triggerGap brought her stop, and
      // the van's own, that much nearer.
      if (c.s - nose - van.v * dt <= triggerGap(c, van.v, L) && c.seen >= SEEN_S && clear) {
        if (gap < van.v * van.v / (2 * COMMIT_DECEL) + 0.5) c.state = 'late';
        else if (trafficClear(c, others)) {
          c.state = 'go'; c.blocking = true; c.moving = van.v > 0.5;
          // Where the van stops itself: a little under a van length short,
          // or, if it set out late, short of where she would stop had she
          // let go in time, so that stop is never the van's; never nearer
          // than the closed stretch.
          c.stopAt = Math.max(c.near, Math.min(L - SELF_STOP_SPARE_M, c.s - nose - letGoRun(van.v) - 2 * LET_GO_SPARE_M));
          // And while it is on the road the van does not speed up towards
          // it: holding go, it rolls on at the speed it had, no faster.
          c.vGo = Math.max(van.v, CREEP);
        }
        // else something is coming the other way, or is between the van and
        // it: it waits for that to go by.
      }
    }
    if (c.state === 'late' && tail > c.s + c.far && trafficClear(c, others)) { c.state = 'go'; c.blocking = false; }
    if (c.state === 'wait' && c.party.length && c.s > nose) speedCap = Math.min(speedCap, approachCap(c, van, nose, L, xing.t));
    if (c.state !== 'go') continue;

    if (!c.script) c.script = buildScript(c);
    c.t += dt;
    c.leg = legNow(c);
    const { l, tl, prev } = c.leg;
    const lead = l.d0 + (l.d1 - l.d0) * gaitOf(c.party[0].kind, l, tl, prev).p;
    for (const a of c.party) a.d = lead - backNow(c, a.k);
    const total = c.script.reduce((n, l) => n + l.dur, 0);

    if (c.blocking && !onRoad(c)) c.blocking = false;
    if (c.blocking) {
      const room = c.s - (c.stopAt ?? c.near) - nose;
      const cap = room <= 0 ? 0 : Math.min(Math.sqrt(2 * CAP_DECEL * room), room / Math.max(dt, 1e-3));
      speedCap = Math.min(speedCap, cap, c.vGo ?? Infinity);
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

/** Every animal's drawn body in world metres, glow included, for the check
 *  and for traffic.js if it wants to give way too: a box len along h and
 *  wid across it, centred on (x, y), as drawn this frame. A painted animal
 *  stands upright on the screen, so its box is square to the camera
 *  (camH, the page's camera heading; the road's own heading without one).
 *  r is half the width, for anything that wants a circle.
 *  {x, y, h, len, wid, r, kind, s, lat, crossing} */
export function animals(xing, camH = xing.camH) {
  const out = [];
  for (const c of xing.crossings) {
    if (c.state === 'none' || c.state === 'gone') continue;
    for (const a of c.party) {
      const p = pose(c, a, xing.t, camH ?? c.h), b = p.box;
      out.push({ x: b.x, y: b.y, h: b.h, len: b.len, wid: b.wid, r: b.wid / 2,
        kind: a.kind, s: p.s, lat: p.lat, crossing: c });
    }
  }
  return out;
}

/** How an animal looks this moment: its gait (gaitOf, from the party's
 *  leg), the rock of a waddle and the lean of a run from the clock, and
 *  while it waits a look about and a gentle glow. */
function looks(c, a, t) {
  const g = GAIT[a.kind];
  const G = c.leg ? gaitOf(a.kind, c.leg.l, c.leg.tl, c.leg.prev)
    : { p: 0, lift: 0, sq: 0, st: 0, tilt: 0, pulse: 0, moving: false, steady: false };
  const V = { lift: G.lift, sq: G.sq, st: G.st, tilt: G.tilt, rock: 0, pulse: G.pulse, moving: G.moving, gentle: false };
  if (G.steady) {
    const ph = TAU * (c.leg.l.run ? 4 : g.hz) * t + a.phase, s = Math.sin(ph);
    if (g.type === 'waddle') { V.rock = g.rock * s; V.lift = 0.02 * Math.abs(s); }
    else { V.tilt = -0.12; V.lift = 0.04 * Math.abs(s); }     // a pheasant's run, leaning in
    V.pulse = Math.abs(s);
  } else if (!G.moving && G.pulse < 0.3) {
    // Waiting, or stopped: a slow look about, and the glow breathing.
    V.gentle = true;
    if (!c.leg || g.type !== 'shuffle') V.tilt = 0.04 * Math.sin(t * 1.3 + a.phase);
    V.pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + a.phase);
  }
  return V;
}

/** Where an animal is and how it is drawn. A wobble along the road, as
 *  they do not walk ruler-straight; a family's line wobbles a little more.
 *  The box is the whole drawing as drawn, so what the check measures is
 *  what she sees. */
function pose(c, a, t, camH) {
  const tr = trailOf(a.d);
  const lat = latOf(c, a, tr.x);
  const ds = WOBBLE_M * Math.sin(a.d * 1.7 + a.phase) + (a.k ? FOLLOW_WOBBLE_M * Math.sin(a.d * 3.1 + 2 * a.phase) : 0);
  const hx = Math.cos(c.h), hy = Math.sin(c.h);
  const V = looks(c, a, t);
  const s = c.s + tr.s + ds;
  const at = (ss, ll) => ({ x: c.x + hx * (ss - c.s) - hy * ll, y: c.y + hy * (ss - c.s) + hx * ll });
  // The glow fades as the animal leaves the far kerb behind.
  const past = a.d - (c.verge + 2 * c.halfW + a.half);
  const fade = c.state === 'go' ? Math.max(0, Math.min(1, 1 - past)) : 1;
  const pic = usesArt(a) ? picture(a) : null;
  if (pic) {
    // Side on and upright: x across the screen, y up it, from the feet.
    const fit = fitOf(a, pic), B = boundOf(a.kind);
    const fs = s - B.back;
    const f = at(fs, lat);
    const w = fit.w * (1 + V.sq - V.st / 2), h = fit.h * (1 - V.sq + V.st);
    const th = Math.abs(V.tilt) + Math.abs(V.rock);
    const L = ART[a.kind].L, swell = glowSwell(V) * haloOf(c, a);
    const gx = GLOW_RX * L * swell, gy = GLOW_RY * L * swell;
    const half = Math.max(w / 2 + h * Math.sin(th), gx) + HAIR_M;
    const lo = Math.max(gy, w * Math.sin(th) / 2) + HAIR_M, hi = V.lift + h * Math.cos(th) + w * Math.sin(th) + HAIR_M;
    const ux = Math.cos(camH), uy = Math.sin(camH), mid = (hi - lo) / 2;
    // Facing the way it goes across the screen; the paintings face right.
    const dir = -c.side * (Math.cos(c.h - camH) < 0 ? -1 : 1);
    return {
      art: pic, s, lat, V, fx: f.x, fy: f.y, w, h, dir, fade, gx, gy, up: f.x * ux + f.y * uy,
      box: { x: f.x + ux * mid, y: f.y + uy * mid, h: camH + Math.PI / 2, len: 2 * half, wid: hi + lo },
    };
  }
  // The stand-in, top down: turned the way it goes, a waddle in its turn, a
  // hop as a step towards the camera.
  const sp = TOPDOWN[a.kind], g = GAIT[a.kind];
  let yaw = 0;
  if (V.gentle) yaw = (a.kind === 'duckling' ? 0.12 : 0.3) * Math.sin(t * 1.4 + a.phase);
  else if (V.rock) yaw = V.rock;
  else if (a.kind === 'hedgehog' && V.moving) yaw = 0.05 * Math.sin(t * 22 + a.phase);
  const scale = 1 + 0.25 * V.lift / sp.dl;
  let frame = 0;
  if (V.moving) {
    // Its legs: a hopper by where it is in the hop, the rest by the clock.
    const ph = g.type === 'hop' ? (V.lift / Math.max(1e-6, g.lift)) * TAU / 4 : t * STRIDE_RATE[a.kind] + a.phase;
    frame = ((Math.round(ph / TAU * FRAMES) % FRAMES) + FRAMES) % FRAMES;
  }
  const swell = glowSwell(V);
  const gx = 0.62 * sp.dl * swell, gy = 0.72 * sp.dw * swell;
  const p = at(s, lat);
  const h = c.h + (c.side < 0 ? Math.PI / 2 : -Math.PI / 2) + yaw;
  return {
    art: null, s, lat, V, fx: p.x, fy: p.y, h, frame, scale, fade, gx, gy, up: p.x * Math.cos(camH) + p.y * Math.sin(camH),
    box: { x: p.x, y: p.y, h, len: Math.max(sp.dl * scale, 2 * gx), wid: Math.max(sp.dw * scale, 2 * gy) },
  };
}

/** A stand-in's legs, in strides a second (radians). A stride is FRAMES
 *  pictures. */
const STRIDE_RATE = { hedgehog: 22, rabbit: 8, fox: 9, pheasant: 11, duck: 0, duckling: 0, deer: 7 };
const FRAMES = 8;
const TAU = Math.PI * 2;

/** The glow's size and strength. It swells with the pulse when the animal
 *  is on the move, breathes gently while it waits, and under reduced motion
 *  holds still. */
function glowSwell(V) {
  if (reducedMotion()) return 1.05;
  return V.gentle ? 1 + 0.035 * V.pulse : 1 + (MAX_SWELL - 1) * V.pulse;
}
/** The halo's size, as a share of its full size. Full while the animal is
 *  out on the road, blooming as it sets off. While it waits on the verge,
 *  and as it steps off the far kerb, it is the size the glow was before the
 *  halo, so beside the road it reaches no further into the carriageway than
 *  that did: a van may pass it there, and crossings.check.mjs measures the
 *  halo as part of the body (full size on the verge put it in the lane). */
const HALO_VERGE = 0.56, HALO_BLOOM_S = 0.4;
function haloOf(c, a) {
  if (c.state !== 'go') return HALO_VERGE;
  const off = c.verge + 2 * c.halfW + a.half - a.d;   // metres until its body is off the far kerb
  // A follower still coming down the verge keeps the verge size until it
  // reaches the leader's line.
  const u = Math.max(0, Math.min(1, c.t / HALO_BLOOM_S, off, (a.d + 0.1) / 0.5));
  return HALO_VERGE + (1 - HALO_VERGE) * smooth(u);
}
function glowAlpha(V) {
  if (reducedMotion()) return 0.8;
  return V.gentle ? 0.6 + 0.15 * V.pulse : 0.6 + 0.4 * V.pulse;
}

/** The most an animal of this kind reaches along the road from its centre,
 *  either way, in any frame, painted or stand-in, with the camera turned
 *  as far as CAM_SKEW. back is how far a painting's feet sit behind its
 *  centre, so the drawing is centred where the animal is. Once per kind. */
const BOUNDS = {};
function boundOf(kind) {
  if (BOUNDS[kind]) return BOUNDS[kind];
  const g = GAIT[kind], A = ART[kind], sp = TOPDOWN[kind];
  const th = Math.max(g.pitch ?? 0, g.type === 'strut' ? 0.12 : 0, g.type === 'shuffle' ? 0.07 : 0, 0.04) + (g.rock ?? 0);
  const w = A.L * (1 + (g.squash ?? 0)), h = A.H * (1 + MAX_STRETCH), lift = Math.max(g.lift ?? 0, 0.04);
  const half = Math.max(w / 2 + h * Math.sin(th), GLOW_RX * A.L * MAX_SWELL) + HAIR_M;
  const lo = Math.max(GLOW_RY * A.L * MAX_SWELL, w * Math.sin(th) / 2) + HAIR_M;
  const hi = lift + h + w * Math.sin(th) + HAIR_M;
  const art = (hi + lo) / 2 + half * Math.sin(CAM_SKEW);
  // The stand-in turns with the road, so the camera does not matter to it;
  // it turns as much as 0.3 looking about.
  const sc = 1 + 0.25 * (g.lift ?? 0) / sp.dl, yaw = 0.3;
  const lx = Math.max(sp.dl * sc, 2 * 0.62 * sp.dl * MAX_SWELL) / 2, ly = Math.max(sp.dw * sc, 2 * 0.72 * sp.dw * MAX_SWELL) / 2;
  const top = ly * Math.cos(yaw) + lx * Math.sin(yaw);
  // Waiting it stands still, but for a look about, with its halo at the
  // verge's size; and upright on the screen, so turned by however far the
  // camera is from the road's line, which far from the van, or with the van
  // coming round a bend, can be any way at all. No point of it is further
  // from its feet than wait.
  const wHalf = Math.max(A.L / 2 + A.H * Math.sin(0.04), GLOW_RX * A.L * 1.035 * HALO_VERGE) + HAIR_M;
  const wait = Math.hypot(wHalf, A.H + A.L * Math.sin(0.04) + HAIR_M);
  return (BOUNDS[kind] = { reach: Math.max(art, top) + WOBBLE_M, back: (hi - lo) / 2, wait });
}
function reachOf(kind) { return boundOf(kind).reach; }

/** How far beyond the kerb an animal waits, to its feet: its nose just short
 *  of the kerb, or for a big one far enough back that, turned any way with
 *  the camera, it is drawn clear of anything passing, whose side keeps
 *  KERB_GAP_M from the kerb (a 2.5 m lorry in the 4 m lane of an 8 m street
 *  keeps 0.75 m). A deer waited with its nose at the kerb, and seen from a
 *  van coming round a bend, or from one far behind, its head was drawn over
 *  a car going by the other way: it stands back at the wood's edge. */
const KERB_GAP_M = 0.5;
function waitBack(a) { return Math.max(a.half + 0.15, boundOf(a.kind).wait - KERB_GAP_M); }

/** Which stretches every other vehicle must stay out of (traffic.js): where
 *  an animal is on the road or setting out, whether or not the van is
 *  stopped for it. [{s0, s1}] in route metres. */
export function closed(xing) {
  return xing.crossings.filter(c => c.state === 'go' && onRoad(c))
    .map(c => ({ s0: c.s - c.near, s1: c.s + c.far }));
}

function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

// ------------------------------------------------------------------ the art

/** Under reduced motion the glow holds still: ?motion=reduce (or =full), else
 *  the player's own choice under the game's key (lib/motion-preference.ts),
 *  else what the device says. */
const MOTION_Q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('motion') : null;
const MOTION_SAVED = (() => { try { return typeof localStorage !== 'undefined' ? localStorage.getItem('arc_motion') : null; } catch { return null; } })();
const MOTION_MQ = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
function reducedMotion() {
  if (MOTION_Q) return MOTION_Q === 'reduce';
  if (MOTION_SAVED === 'reduced' || MOTION_SAVED === 'full') return MOTION_SAVED === 'reduced';
  return !!MOTION_MQ?.matches;
}

const ART_DIR = new URL('../../assets/animals/', import.meta.url);
function fileOf(kind, look) { const f = ART[kind].files; return f[look] ?? f[''] ?? Object.values(f)[0]; }

/** The paintings, by file: ok is null while loading, then true or false.
 *  Each is fetched the first time an animal needs it. In node there are no
 *  pictures, so whether the file is there decides, which is what a browser
 *  would find. */
const PICS = new Map();
if (ART_DIR.protocol === 'file:') {
  const { existsSync } = await import('node:fs');
  for (const k in ART) for (const f of Object.values(ART[k].files)) PICS.set(f, { ok: existsSync(new URL(f, ART_DIR)), kind: k });
}
function picture(a) {
  let e = PICS.get(a.file);
  if (e) return e;
  e = { ok: null, kind: a.kind };
  PICS.set(a.file, e);
  if (typeof Image === 'undefined') { e.ok = false; return e; }
  const img = new Image();
  img.onload = () => { try { measure(e, img); e.ok = true; } catch { e.ok = false; } };
  img.onerror = () => { e.ok = false; };
  img.src = new URL(a.file, ART_DIR).href;
  return e;
}
/** True unless the painting is known to be missing: one still loading is
 *  measured as if drawn, and simply not drawn yet. */
function usesArt(a) { return picture(a).ok !== false; }

/** The painting's size as drawn, fitted in its box by the painted part. */
function fitOf(a, e) {
  const A = ART[a.kind];
  if (!e.bw) return { w: A.L, h: A.H };
  const k = Math.min(A.L / e.bw, A.H / e.bh);
  return { w: e.bw * k, h: e.bh * k };
}

/** The extra edge, so a painted animal parts from the tarmac: a warm dark
 *  hairline, about half a css px at the lane zoom, under its own line. */
const FOOT_BAND = 0.07;
const HAIR_INK = '#2e2016';
const SPRITE_PPM = 80;
const HAIR_PX = 1.4, PAD_PX = 3;
const HAIR_M = PAD_PX / SPRITE_PPM;

/** Find the painted part of a 512x512 picture and bake it once, at
 *  SPRITE_PPM for its drawn size (finer than the closest zoom at a pixel
 *  ratio of 2, so only ever drawn smaller), with the hairline round it. */
function measure(e, img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const low = new Int16Array(W).fill(-1);       // each column's lowest painted row
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[(y * W + x) * 4 + 3] < 24) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    low[x] = y;
  }
  if (x1 < 0) throw new Error('empty');
  Object.assign(e, { bx: x0, by: y0, bw: x1 - x0 + 1, bh: y1 - y0 + 1 });
  // Where it stands: the columns whose lowest row is within FOOT_BAND of the
  // painting's lowest are its feet (a foot lifted mid-step is further up and
  // left out). drop is how far the feet's mean row is above the lowest, and
  // fa to fb the feet's reach along the painting, both as shares of it.
  let nf = 0, sum = 0, fa = x1, fb = x0;
  for (let x = x0; x <= x1; x++) if (low[x] >= y1 - FOOT_BAND * e.bh) { nf++; sum += low[x]; if (x < fa) fa = x; fb = x; }
  Object.assign(e, { drop: (y1 - sum / nf) / e.bh, fa: (fa - x0) / e.bw, fb: (fb + 1 - x0) / e.bw });
  const fit = fitOf({ kind: e.kind }, e);
  const dw = Math.round(fit.w * SPRITE_PPM), dh = Math.round(fit.h * SPRITE_PPM);
  const cw = dw + 2 * PAD_PX, ch = dh + 2 * PAD_PX;
  const sil = document.createElement('canvas'); sil.width = cw; sil.height = ch;
  const sg = sil.getContext('2d');
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(img, x0, y0, e.bw, e.bh, PAD_PX, PAD_PX, dw, dh);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = HAIR_INK; sg.fillRect(0, 0, cw, ch);
  const out = document.createElement('canvas'); out.width = cw; out.height = ch;
  const og = out.getContext('2d');
  og.imageSmoothingQuality = 'high';
  og.globalAlpha = 0.5;
  for (let k = 0; k < 8; k++) og.drawImage(sil, Math.round(Math.cos(k * TAU / 8) * HAIR_PX * 10) / 10, Math.round(Math.sin(k * TAU / 8) * HAIR_PX * 10) / 10);
  og.globalAlpha = 1;
  og.drawImage(img, x0, y0, e.bw, e.bh, PAD_PX, PAD_PX, dw, dh);
  e.baked = out;
}

/** The glow (Marcus, 2026-10-14, 93B): a soft gold edge with a faint darker
 *  line just outside it, round a thin gold fill, baked once at full strength
 *  into the glow's own box and drawn at the animal's glowSwell and glowAlpha.
 *  Three layers, because no one blend shows on every ground. The screen layer
 *  is warm light on a dark ground and does nothing on a pale one. The colour
 *  layer turns any ground gold at its own lightness, so the edge shows on
 *  pale ground (the frosted verge, sand and straw) without muddying a dark
 *  one. The dark line, laid over both, outlines the edge on pale ground. */
const GLOW_BOX_W = 256, GLOW_BOX_H = Math.round(GLOW_BOX_W * GLOW_RY / GLOW_RX);

/** A disc that fades out through the stops [r, 'R,G,B', alpha], in the box's own shape. */
function discPaint(stops) {
  return (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    for (const [r, rgb, a] of stops) gr.addColorStop(r, `rgba(${rgb},${a})`);
    g.setTransform(1, 0, 0, h / w, 0, 0);
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  };
}
/** A soft band all round the box: an ellipse `rx` by `ry` px, stroked `lw` px
 *  wide and blurred by `blur`. The line itself is drawn off the sprite and
 *  only its blur lands on it. */
function bandPaint(rx, ry, lw, blur, rgb, a, passes = 1) {
  return (g, w, h) => {
    g.shadowColor = `rgba(${rgb},${a})`; g.shadowBlur = blur; g.shadowOffsetX = 2 * w;
    g.lineWidth = lw; g.strokeStyle = '#000';
    for (let i = 0; i < passes; i++) { g.beginPath(); g.ellipse(w / 2 - 2 * w, h / 2, rx, ry, 0, 0, TAU); g.stroke(); }
  };
}
function bakeGlow(paint) {
  const cv = document.createElement('canvas'); cv.width = GLOW_BOX_W; cv.height = GLOW_BOX_H;
  paint(cv.getContext('2d'), GLOW_BOX_W, GLOW_BOX_H);
  return cv;
}
/** The glow's layers, each drawn at its peak of the animal's strength. */
let GLOW = null;
function glowLayers() {
  if (GLOW || typeof document === 'undefined') return GLOW;
  return (GLOW = [
    { blend: 'screen', peak: 1, sprite: bakeGlow(discPaint([[0, '255,200,90', 0.1], [0.55, '255,200,90', 0.14], [0.8, '255,204,96', 0.62], [0.93, '255,204,96', 0.26], [1, '255,204,96', 0]])) },
    { blend: 'color', peak: 0.8, sprite: bakeGlow(discPaint([[0, '255,184,50', 0.1], [0.55, '255,184,50', 0.14], [0.8, '255,184,50', 0.62], [0.93, '255,184,50', 0.26], [1, '255,184,50', 0]])) },
    { blend: 'source-over', peak: 0.6, sprite: bakeGlow(bandPaint(122, 42, 2.6, 3, '84,56,22', 0.7)) },
  ]);
}

// ------------------------------------------------------------------ drawing

let HOG_SIGN = null;
if (typeof Image !== 'undefined') {
  HOG_SIGN = new Image();
  HOG_SIGN.src = new URL('../../assets/driving/topdown/decor/decor-sign-hedgehog.png', import.meta.url).href;
}

const SHADOW = 'rgba(40,46,38,.22)';

/** The contour every stand-in shares with the hedges: a dark warm ink, stroked
 *  under the fill at the hedges' 0.36 m so 0.18 m of it shows. Ducklings get
 *  a finer line, or they would be more ink than duckling. */
const INK = '#33241a';
const INK_W = 0.36, INK_W_SMALL = 0.2;

/** Each stand-in is described once and painted from that twice: the parts as
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
 *  before the van. Shadows along view.sun, as scenery.js and traffic.js.
 *  The glows go down first, then the shadows, then the bodies from the top
 *  of the screen down, so a duckling nearer the van stands in front. */
export function draw(ctx, xing, view) {
  const r2 = (view.radius + 4) ** 2;
  const lw = 1.1 / view.ppm;
  xing.camH = view.camH;
  for (const c of xing.crossings) {
    const sg = c.sign;
    const sx = sg.x + Math.cos(sg.h + Math.PI / 2) * sg.lat, sy = sg.y + Math.sin(sg.h + Math.PI / 2) * sg.lat;
    if ((sx - view.cx) ** 2 + (sy - view.cy) ** 2 < r2) drawSign(ctx, sg, sx, sy, c.species, view, lw);
    if (c.state === 'none' || c.state === 'gone') continue;
    if ((c.x - view.cx) ** 2 + (c.y - view.cy) ** 2 > r2) continue;
    const shown = [];
    for (const a of c.party) if (a.alpha > 0) shown.push([a, pose(c, a, xing.t, view.camH)]);
    for (const [a, p] of shown) drawGlow(ctx, a, p, view);
    for (const [a, p] of shown) drawShadow(ctx, a, p, view);
    shown.sort((A, B) => B[1].up - A[1].up);
    for (const [a, p] of shown) drawBody(ctx, a, p, view);
  }
}

/** The glow: warm light on the road round the animal. Every glow goes down
 *  before any shadow, so no glow lightens a shadow. */
function drawGlow(ctx, a, p, view) {
  const layers = glowLayers();
  const k = glowAlpha(p.V) * p.fade * a.alpha;
  if (!layers || k * layers[0].peak < 0.01) return;
  ctx.save();
  ctx.translate(p.fx, p.fy);
  ctx.rotate(p.art ? view.camH + Math.PI / 2 : p.h);
  for (const L of layers) {
    ctx.globalCompositeOperation = L.blend;
    ctx.globalAlpha = Math.min(1, L.peak * k);
    ctx.drawImage(L.sprite, -p.gx, -p.gy, 2 * p.gx, 2 * p.gy);
  }
  ctx.restore();
}

/** The shadow on the road under an animal's feet (Marcus, 2026-10-12: "so it
 *  doesn't look like they are floating"; 2026-10-13: bigger, in proportion
 *  to the animal, and the feet touching it). A painted animal's is one soft
 *  ellipse, sized and seated from where its painting's feet are (measure),
 *  square to the screen like the painting. It stays on the ground when the
 *  animal hops, a little smaller and paler, so the gap under it shows but
 *  never as a different animal's shadow. */
function drawShadow(ctx, a, p, view) {
  const shade = contactSprite();
  if (!shade) return;
  const e = p.art;
  if (e) {
    if (e.fb === undefined) return;     // still loading
    const u = Math.min(1, Math.max(0, p.V.lift) / (SHADOW_AIR_M * p.w));
    const len = Math.max(SHADOW_LEN * (e.fb - e.fa), SHADOW_MIN) * p.w * (1 - SHADOW_AIR_SMALL * u);
    const ry = len * SHADOW_DEPTH;
    const ox = p.dir * ((e.fa + e.fb) / 2 - 0.5) * p.w;
    const oy = SHADOW_SEAT * ry - e.drop * p.h;
    // Never wider than the glow it sits in (smaller on the verge, where the glow is).
    const rx = Math.min(len / 2, p.gx - Math.abs(ox));
    if (rx <= 0) return;
    ctx.save();
    ctx.translate(p.fx, p.fy);
    ctx.rotate(view.camH + Math.PI / 2);
    ctx.globalAlpha = a.alpha * (1 - SHADOW_AIR_PALE * u);
    ctx.drawImage(shade, ox - rx, oy - ry, 2 * rx, 2 * ry);
    ctx.restore();
    return;
  }
  // The stand-in, top down: a short soft cast shadow from the feet along the
  // world's sun, as the hedges' and the vans' fall, and a small darker
  // contact shadow where it stands; in the air the contact shadow shrinks and
  // pales.
  const air = Math.max(0, p.V.lift);
  const sh = 1 / (1 + 3 * air), dark = a.alpha * (0.25 + 0.75 / (1 + 6 * air));
  const sl = Math.hypot(view.sun.x, view.sun.y), ux = view.sun.x / sl, uy = view.sun.y / sl;
  // How far the cast shadow reaches: a little of the animal's height.
  const reach = sl * TOPDOWN[a.kind].hgt * CAST_SHARE;
  const wide = TOPDOWN[a.kind].dw * 0.42;
  ctx.save();
  ctx.translate(p.fx + ux * reach / 2, p.fy + uy * reach / 2);
  ctx.rotate(Math.atan2(uy, ux));
  ctx.globalAlpha = a.alpha * 0.55 * sh;
  ctx.drawImage(shade, -reach / 2 - wide * 0.5, -wide * 0.5, reach + wide, wide);
  ctx.restore();
  ctx.save();
  ctx.translate(p.fx, p.fy);
  const sp = TOPDOWN[a.kind];
  ctx.rotate(p.h);
  const rx = sp.dl * 0.42 * sh, ry = sp.dw * 0.38 * sh;
  ctx.globalAlpha = dark;
  ctx.drawImage(shade, -rx, -ry, 2 * rx, 2 * ry);
  ctx.restore();
}

/** The shadow's soft disc, baked once: dark in the middle where the animal
 *  touches the road, feathered to nothing at the rim; drawn squashed. The
 *  colour is the scenery's shadow (rgb 40,46,38), deeper where it touches. */
const CAST_SHARE = 0.45;
let SHADE = null;
function contactSprite() {
  if (SHADE || typeof document === 'undefined') return SHADE;
  const n = 64, cv = document.createElement('canvas'); cv.width = n; cv.height = n;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, 'rgba(40,46,38,.66)');
  gr.addColorStop(0.45, 'rgba(40,46,38,.52)');
  gr.addColorStop(0.75, 'rgba(40,46,38,.22)');
  gr.addColorStop(1, 'rgba(40,46,38,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  return (SHADE = cv);
}

function drawBody(ctx, a, p, view) {
  ctx.save();
  ctx.translate(p.fx, p.fy);
  ctx.globalAlpha = a.alpha;
  if (p.art) {
    if (!p.art.baked) { ctx.restore(); return; }   // still loading
    // Square to the screen, feet on the ground point, lifted by its hop.
    ctx.rotate(view.camH + Math.PI / 2);
    ctx.translate(0, -p.V.lift);
    ctx.scale(p.dir, 1);
    // Nose up turns about the hind feet, nose down about the front; a
    // waddle rocks about the middle.
    const V = p.V, pivot = V.tilt > 0 ? -p.w / 2 : V.tilt < 0 ? p.w / 2 : 0;
    ctx.translate(pivot, 0); ctx.rotate(-V.tilt); ctx.translate(-pivot, 0);
    ctx.rotate(V.rock);
    const pad = HAIR_M * (p.w / (p.art.baked.width / SPRITE_PPM - 2 * HAIR_M));
    ctx.drawImage(p.art.baked, -p.w / 2 - pad, -p.h - pad, p.w + 2 * pad, p.h + 2 * pad);
  } else {
    const im = spriteOf(a, p.frame);
    if (im) {
      ctx.rotate(p.h);
      ctx.scale(p.scale, p.scale);
      ctx.drawImage(im.body, -im.w / 2, -im.h / 2, im.w, im.h);
    }
  }
  ctx.restore();
}

/** Each stand-in is painted once per frame of its stride into a small canvas
 *  and drawn from there: a dozen ellipses and a wide stroke per animal per
 *  frame cost a phone about a millisecond, a picture almost nothing. Baked
 *  at SPRITE_PPM, so it is only ever drawn smaller. */
const sprites = new Map();
function spriteOf(a, frame) {
  const key = a.kind + a.look + frame;
  let im = sprites.get(key);
  if (im !== undefined) return im;
  const sp = TOPDOWN[a.kind], shape = DRAW[a.kind], g = Math.sin(frame / FRAMES * TAU);
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
  fox(a, g) {
    const w = 0.06 * g;
    P.e(-0.62, 0, 0.36, 0.11, 0, '#d9692a');                         // the brush
    if (P.paint) P.dab(-0.92, 0, 0.08, 0.075, 0, '#f6f1e6');         // white tip
    P.e(0.2 + w, 0.17, 0.07, 0.05, 0, '#2a1c12');                    // dark feet
    P.e(0.2 - w, -0.17, 0.07, 0.05, 0, '#2a1c12');
    P.e(-0.3 - w, 0.17, 0.07, 0.05, 0, '#2a1c12');
    P.e(-0.3 + w, -0.17, 0.07, 0.05, 0, '#2a1c12');
    P.e(-0.05, 0, 0.42, 0.19, 0, '#d9692a');
    if (P.paint) P.dab(-0.08, 0, 0.3, 0.08, 0, '#e98a45');
    P.e(0.42, 0, 0.17, 0.15, 0, '#d9692a');
    P.e(0.36, 0.13, 0.09, 0.05, -0.6, '#2a1c12');                    // ears
    P.e(0.36, -0.13, 0.09, 0.05, 0.6, '#2a1c12');
    P.e(0.6, 0, 0.1, 0.07, 0, '#f3ebdd');                            // white muzzle
    if (P.paint) {
      P.dab(0.47, 0.07, 0.022, 0.022, 0, '#1d140e');
      P.dab(0.47, -0.07, 0.022, 0.022, 0, '#1d140e');
    }
    P.e(0.7, 0, 0.03, 0.03, 0, '#1d140e');                           // nose
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
  } else if (species === 'fox') {
    e(0, 0.03, 0.12, 0.055); e(0.13, -0.04, 0.05, 0.04); e(0.12, -0.1, 0.02, 0.04, 0.2);
    e(-0.17, 0.0, 0.1, 0.035, -0.3);
  } else if (species === 'hedgehog') {
    e(0, 0.03, 0.12, 0.075); e(0.13, 0.06, 0.05, 0.025, 0.3);
  } else {   // rabbit, and the default
    e(-0.02, 0.04, 0.11, 0.07); e(0.08, -0.03, 0.05, 0.045); e(0.07, -0.11, 0.018, 0.06, -0.2);
  }
  ctx.restore();
}
