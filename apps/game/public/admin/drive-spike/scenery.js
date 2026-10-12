// scenery.js — what the driving spike draws beside the road.
//
// The contract below is what drive-spike.html calls. Everything is placed
// from the child's own map (birchie-roads.svg), so a wood on the map is a wood
// beside the road, a field is a field, and the sea is where the land is not.
//
// Coordinates. Everything here is in world metres, the same frame as the
// route: x east, y south, origin at the map's top-left. One pixel of the
// child's map (birchie-roads.svg, viewBox 1800 x 1121) is WORLD.metresPerMapPx
// metres on both axes, so a map polygon converts with mapToWorld().
//
// Drawing. Both draw functions are called with ctx already transformed into
// world metres and rotated by the camera, so a path drawn at world (x, y) lands
// in the right place on screen. Draw nothing in screen space here.
//
// How it is built, so the next person can change it:
//   - load() parses the map once, indexes its polygons and the graph's roads,
//     and places every object: the real buildings, hedges round fields and
//     along country roads, trees in woods, parks, verges, hedgerows and back
//     gardens.
//   - The real buildings are OpenStreetMap's (buildings.json, written by
//     tools/osm-buildings.py): houses, farmhouses and barns, shops, the
//     churches, schools and the station, each drawn from its own footprint
//     with a roof for its kind. One that stands in a road's verge is moved
//     back out of it (never more than PUSH_MAX), or left out. Farmyards are
//     yard ground; a farmyard with no mapped buildings gets a farmhouse and
//     barns of its own, and the farms get silos and bales.
//   - Houses are generated along residential roads, along any road where the
//     map has gardens or OSM has a housing area, and only where OSM has no
//     buildings: a real building keeps them REAL_GAP away.
//   - Every placement is seeded by its position (or by the graph edge it hangs
//     off), so the same place has the same trees on every drive.
//   - Nothing is placed within (road half-width + VERGE_M) of any graph edge.
//   - Objects are bucketed into CELL_M cells. Each cell turns its objects into
//     cached Path2D batches the first time it is seen, per season; a frame only
//     touches the cells within view.radius.
//   - The camera looks straight down and the world rotates, so everything is
//     drawn from directly above: canopies not trunks, roofs not walls.
//   - Shadows are drawn in world space, view.sun times each object's height,
//     into one offscreen layer and laid down at a single alpha, so where two
//     shadows overlap they do not double-darken. Nothing has a baked shadow.

/**
 * @typedef {Object} View
 * @property {number} cx       world x the camera centres on (metres)
 * @property {number} cy       world y the camera centres on (metres)
 * @property {number} radius   metres from (cx, cy) to beyond the screen corner
 * @property {number} camH     camera heading, radians, world frame
 * @property {number} ppm      pixels per metre at the current zoom
 * @property {'spring'|'summer'|'autumn'|'winter'} season
 * @property {{x:number, y:number}} sun  shadow offset in world metres per
 *           metre of object height. Fixed in the world, so shadows stay put
 *           while the camera turns. The van's shadow uses the same vector.
 */

const MAP_URL = '/admin/scene-assets/birchie-map/birchie-roads.svg';
const MAP_W = 1800, MAP_H = 1121;
/** The real buildings, farmyards, churchyards and housing areas beside the
 *  roads, in world metres (tools/osm-buildings.py writes it). */
const BUILDINGS_URL = '/assets/driving/buildings.json';

/** Cell size of the spatial grid, metres. */
const CELL_M = 100;

/** Half the drawn width of each road class, metres. The trunk is the wider of
 *  the page's two big-road trials (4 x 5m lanes + 1.6m strip). */
const ROAD_HALF = { trunk: 10.8, secondary: 5, tertiary: 5, unclassified: 4.5, residential: 4, track: 2.5 };
/** Nothing may stand closer than this to a road's edge. */
const VERGE_M = 2.2;

/** How far a crown of radius r reaches once its lobes and ink are drawn. */
const crownReach = r => r * 1.04 + 0.25;

/** Object heights, metres: shadows fall view.sun times these. */
const H = { canopy: 8, canopyLow: 4.5, house: 7, hedge: 1.5, wall: 0.9, fence: 1.6, glass: 5, hut: 2.4 };

/** Real buildings: eaves and ridge heights by kind, metres. */
const BH = {
  house: [5, 8], flats: [8.5, 12], farmhouse: [5.5, 9], barn: [5, 8], church: [8, 13], school: [4.5, 4.5],
  station: [5, 8], retail: [6, 9], industrial: [6.5, 8.5], workshop: [5, 6.5], garage: [2.4, 2.4],
  shed: [2.2, 2.7], caravan: [2.8, 3], glasshouse: [3.5, 4.5], canopy: [5, 5], hall: [5, 8], other: [4.5, 6.5],
};
const TOWER_H = 18, SPIRE_H = 31, SILO_H = 12;
/** A real building in a verge is moved back this far at most, else left out. */
const PUSH_MAX = 4;
/** A generated house keeps this clear of a real building (box to box), and
 *  this far from a real house's middle, so it fills only unmapped streets. */
const REAL_GAP = 6, REAL_NEAR = 18;

const SHADOW_COLOUR = 'rgb(40,46,38)';
const SHADOW_ALPHA = 0.22;   // the van's own shadow alpha, so they agree

// ------------------------------------------------------------------ palettes

/** Ground colours by season. Each season is visibly itself: autumn ploughed
 *  and russet, winter frosted pale (no snow: the spike has no weather, and
 *  silence on weather is allowed), spring fresh, summer deep and golden. */
const GROUND = {
  spring: { sea: '#9fcdd5', seaInk: '#6fa3ae', sand: '#e6d4a2', grass: '#9ec96a', tuftD: '#86b456', tuftL: '#b4d982',
    park: '#a8d274', meadow: '#a9c66e', garden: '#a4cd70', wood: '#6e9446', pitchA: '#a2cd6c', pitchB: '#92c060',
    pasture: '#a6cf6c', allot: '#a58a62', hard: '#cfc6b0', pool: '#7cc6e0', poolInk: '#4d97b3', yard: '#d9d2bd',
    farmyard: '#c4b28e', grit: '#a8966f', gritL: '#ddd0b0' },
  summer: { sea: '#97cbd6', seaInk: '#679fac', sand: '#ead8a6', grass: '#8fbb5c', tuftD: '#78a54c', tuftL: '#a8cd70',
    park: '#97c463', meadow: '#b3bf68', garden: '#93c060', wood: '#5b8340', pitchA: '#92c35e', pitchB: '#82b352',
    pasture: '#98c35e', allot: '#9a7f58', hard: '#d3cab3', pool: '#79c4df', poolInk: '#4d97b3', yard: '#ddd5bf',
    farmyard: '#cfbd96', grit: '#b09d74', gritL: '#e4d8b8' },
  autumn: { sea: '#93c1cb', seaInk: '#6595a1', sand: '#dfcd9e', grass: '#98a95c', tuftD: '#82924c', tuftL: '#b3b874',
    park: '#9eb062', meadow: '#b0a764', garden: '#9cae60', wood: '#86713f', pitchA: '#9db462', pitchB: '#8ea656',
    pasture: '#a0ad62', allot: '#8f6e4c', hard: '#cbc1aa', pool: '#76b9d0', poolInk: '#4b8ea8', yard: '#d4ccb6',
    farmyard: '#b9a682', grit: '#98865f', gritL: '#d4c7a6' },
  winter: { sea: '#a3c4cc', seaInk: '#7598a2', sand: '#ddd3b6', grass: '#b7c1a6', tuftD: '#a2ad92', tuftL: '#d6dccb',
    park: '#bec7ad', meadow: '#c2c4aa', garden: '#bbc4a9', wood: '#8d8670', pitchA: '#c0c9b0', pitchB: '#b2bca2',
    pasture: '#c3cab4', allot: '#b8ad99', hard: '#cfcabd', pool: '#9ccfdf', poolInk: '#6aa0b4', yard: '#d9d5c9',
    farmyard: '#c9c0ad', grit: '#a89f8c', gritL: '#e2dccd',
    ice: '#dcedf2', iceInk: '#9cc3cf' },
};

/** What a field looks like in each season. u is the field's own random draw,
 *  so a field stays the same crop all season. Rows are drill rows or furrows;
 *  tram is the pair of wheel tracks a tractor leaves through a growing crop. */
function cropFor(season, arable, u) {
  if (!arable) return { fill: GROUND[season].pasture, rows: null };
  switch (season) {
    case 'spring':
      return u < 0.65
        ? { fill: '#a8865f', rows: '#8fbc59', sp: 1.7, w: 0.55, tram: '#93714d' }
        : { fill: '#9ac462', rows: '#88b354', sp: 2.0, w: 0.4, tram: '#a98b62' };
    case 'summer':
      return u < 0.6 ? { fill: '#e2c46a', rows: '#d0ae57', sp: 1.3, w: 0.35, tram: '#b99847' }
        : u < 0.82 ? { fill: '#e9d699', rows: '#d9c282', sp: 1.3, w: 0.3, tram: '#c4a86a' }
        : { fill: '#7da74f', rows: '#6c9445', sp: 1.8, w: 0.5, tram: '#9a8a5a' };
    case 'autumn':
      return u < 0.65 ? { fill: '#9a6e47', rows: '#7c5434', sp: 1.5, w: 0.6 }
        : u < 0.88 ? { fill: '#d4bd84', rows: '#c0a266', sp: 1.1, w: 0.3 }
        : { fill: '#8e6944', rows: '#8aa955', sp: 1.7, w: 0.35 };
    default: // winter: frost on plough and on winter cereal
      return u < 0.6 ? { fill: '#d6d1c1', rows: '#bab29f', sp: 1.5, w: 0.55 }
        : { fill: '#c2cab0', rows: '#a9b598', sp: 1.7, w: 0.4 };
  }
}

/** Broadleaf canopies. Winter has none: those trees are bare crowns. */
const LEAF = {
  spring: ['#7fb24f', '#8dbd57', '#74a649', '#93c262'],
  summer: ['#4f7c3a', '#5b8a41', '#477239', '#64904a'],
  autumn: ['#b8622d', '#c9852f', '#d6a73a', '#9c5a2c', '#ad7b33', '#c46d34', '#8e8a3c'],
};
const BLOSSOM = ['#eab6c6', '#f2d4de', '#f5efe6'];
const CONIFER = ['#3f603c', '#48694a', '#38573a'];
const BARE = { limb: '#5f4f42', twig: '#7a6858', haze: 'rgba(120,100,84,0.36)' };

const HEDGE = {
  spring: { fill: '#5f8f3e', ink: '#3c5b28', hl: '#80b055', dots: '#f6f2e6' },   // hawthorn in flower
  summer: { fill: '#4b7a35', ink: '#2e4a21', hl: '#679a47', dots: '#3b6229' },
  autumn: { fill: '#7b7838', ink: '#4c4321', hl: '#a2874a', dots: '#b5602d' },
  winter: { fill: '#86786a', ink: '#5a4c40', hl: '#a39586', dots: '#6b5c4f' },   // bare twigs
};
/** Garden hedges are privet and stay green all year; darker in winter. */
const PRIVET = { fill: '#4f7740', ink: '#30482a', hl: '#6a9356' };
const PRIVET_WINTER = { fill: '#4a6a40', ink: '#2f4329', hl: '#62805a' };

const ROOFS = [
  { base: '#a8634b', kind: 'tile' },    // terracotta
  { base: '#8c5946', kind: 'tile' },    // dark clay tile
  { base: '#6b7179', kind: 'slate' },   // slate
  { base: '#7b6a5d', kind: 'tile' },    // weathered brown
  { base: '#5f6670', kind: 'slate' },   // blue slate
];
const WALLS = { brick: { fill: '#a3654c', ink: '#6a3b2b' }, flint: { fill: '#c4bdaf', ink: '#7c7568' } };
const FENCE = '#8b6a4a';
const GLASS = { fill: '#cfe2df', ink: '#5f8380', ridge: '#9ab9b5', hl: '#f0f8f6' };

// Real buildings. Barns and works have metal roofs: weathered green-grey,
// rust, galvanised, dark green, blue-grey. Flat roofs are felt or asphalt
// with a paler parapet; schools and big shops have roof lights.
const METAL = [{ base: '#8a958c', kind: 'metal' }, { base: '#9c6247', kind: 'metal' }, { base: '#a9aeae', kind: 'metal' },
  { base: '#62786a', kind: 'metal' }, { base: '#7f8b97', kind: 'metal' }];
const SLATES = ROOFS.filter(r => r.kind === 'slate').concat([{ base: '#7d838a', kind: 'slate' }]);
const TILES = ROOFS.filter(r => r.kind === 'tile').concat([{ base: '#b0735a', kind: 'tile' }, { base: '#9a6a52', kind: 'tile' }]);
const ROOFS_R = TILES.concat(SLATES);
const FLAT = [{ base: '#a9a6a0', parapet: '#cfcbc2' }, { base: '#8f8d88', parapet: '#bdb9b0' }, { base: '#b7b2a6', parapet: '#d9d4c8' }];
const FELT = ['#6f6c66', '#7b7770', '#64625e'];
const CARAVAN = ['#ece6d6', '#e3e7df', '#efe8da', '#dde5da', '#e9e3d1'];
const STONE = { fill: '#bdb4a2', ink: '#6c6457', lead: '#9ba1a0', spire: '#727a7e' };
const AWNING = [['#c9564b', '#f3ede0'], ['#4f7f5a', '#efe6cf'], ['#3f6c99', '#f1ede4'], ['#c98f34', '#f6efe0'], ['#6b4f7d', '#f2ece2']];
const SILO = { fill: '#c3c7c6', ink: '#6e7473', seam: '#9da3a2', cap: '#8a908f' };
const BALE = { straw: '#d9b865', strawInk: '#a07f3a', wrap: '#33402f', wrapInk: '#1d241b' };
const HEADSTONE = { fill: '#b8b5ac', ink: '#6f6c64' };
const DRIVE = ['#d6ccb4', '#cfc8b8', '#a5a29b'];   // gravel, paving, tarmac

function mix(hex, toward, f) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(toward.slice(1), 16);
  const ch = (v, s) => (v >> s) & 255;
  const m = s => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * f);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}
const darken = (h, f) => mix(h, '#1c1a14', f);
const lighten = (h, f) => mix(h, '#fffbea', f);

// ---------------------------------------------------------- seeded randomness

function hash(a, b, c) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A generator seeded by a world position (to the decimetre) and a salt. */
const rngAt = (x, y, salt) => rng(hash(Math.round(x * 10), Math.round(y * 10), salt));

/** Smooth value noise in [0,1), lattice `scale` metres. */
function noise(x, y, scale, salt) {
  const gx = x / scale, gy = y / scale, ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy;
  const v = (i, j) => hash(i, j, salt) / 4294967296;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * sx;
  const b = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * sx;
  return a + (b - a) * sy;
}

// ------------------------------------------------------------ the map's shapes

function parseTransform(str) {
  const m = new DOMMatrix();
  if (!str) return m;
  for (const [, fn, args] of str.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    if (fn === 'translate') m.translateSelf(a[0], a[1] || 0);
    else if (fn === 'scale') m.scaleSelf(a[0], a[1] ?? a[0]);
    else if (fn === 'rotate') {
      if (a.length >= 3) { m.translateSelf(a[1], a[2]); m.rotateSelf(a[0]); m.translateSelf(-a[1], -a[2]); }
      else m.rotateSelf(a[0]);
    } else if (fn === 'matrix') m.multiplySelf(new DOMMatrix(a));
    else if (fn === 'skewX') m.skewXSelf(a[0]);
    else if (fn === 'skewY') m.skewYSelf(a[0]);
  }
  return m;
}

/** The element's full transform to map pixels: every ancestor's, outermost first. */
function elementMatrix(el) {
  const chain = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) chain.push(n);
  const m = new DOMMatrix();
  for (let i = chain.length - 1; i >= 0; i--) m.multiplySelf(parseTransform(chain[i].getAttribute('transform')));
  return m;
}

/** An SVG path's d as flat rings of map-pixel points. Curves are sampled. */
function flattenD(d) {
  const toks = d.match(/[MmLlHhVvQqCcTtSsZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const rings = [];
  let ring = null, x = 0, y = 0, sx = 0, sy = 0, cmd = 'M', i = 0;
  const num = () => Number(toks[i++]);
  const isNum = () => i < toks.length && !/[A-Za-z]/.test(toks[i]);
  const push = (px, py) => { ring.push(px, py); x = px; y = py; };
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') {
      if (ring && ring.length >= 6) rings.push(ring);
      ring = null; x = sx; y = sy;
      continue;
    }
    if (!isNum()) { i++; continue; }
    if (C === 'M') {
      if (ring && ring.length >= 6) rings.push(ring);
      ring = []; push(ox + num(), oy + num()); sx = x; sy = y;
      cmd = rel ? 'l' : 'L';
    } else {
      if (!ring) { ring = [x, y]; sx = x; sy = y; }
      if (C === 'L') push(ox + num(), oy + num());
      else if (C === 'H') push(ox + num(), y);
      else if (C === 'V') push(x, oy + num());
      else if (C === 'Q' || C === 'T') {
        const qx = C === 'Q' ? ox + num() : x, qy = C === 'Q' ? oy + num() : y;
        const ex = ox + num(), ey = oy + num(), x0 = x, y0 = y;
        for (let k = 1; k <= 6; k++) {
          const t = k / 6, u = 1 - t;
          push(u * u * x0 + 2 * u * t * qx + t * t * ex, u * u * y0 + 2 * u * t * qy + t * t * ey);
        }
      } else if (C === 'C' || C === 'S') {
        const c1x = C === 'C' ? ox + num() : x, c1y = C === 'C' ? oy + num() : y;
        const c2x = ox + num(), c2y = oy + num(), ex = ox + num(), ey = oy + num(), x0 = x, y0 = y;
        for (let k = 1; k <= 8; k++) {
          const t = k / 8, u = 1 - t;
          push(u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
            u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey);
        }
      } else { i++; }
    }
  }
  if (ring && ring.length >= 6) rings.push(ring);
  return rings;
}

/** Any filled SVG shape as rings of map pixels, before its transform. */
function shapeRings(el) {
  const n = el.tagName.toLowerCase(), f = k => Number(el.getAttribute(k) || 0);
  if (n === 'path') return flattenD(el.getAttribute('d') || '');
  if (n === 'polygon') {
    const p = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
    return p.length >= 6 ? [p] : [];
  }
  if (n === 'rect') {
    const x = f('x'), y = f('y'), w = f('width'), h = f('height');
    return [[x, y, x + w, y, x + w, y + h, x, y + h]];
  }
  if (n === 'ellipse' || n === 'circle') {
    const cx = f('cx'), cy = f('cy'), rx = n === 'circle' ? f('r') : f('rx'), ry = n === 'circle' ? f('r') : f('ry');
    const r = [];
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; r.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
    return [r];
  }
  return [];
}

/** A polygon in world metres: rings, bbox, a cached Path2D, and a band index
 *  so a point-in-polygon test only looks at the edges that cross its row. */
const BAND_M = 10;
function makePoly(rings, layer, kind) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const path = new Path2D();
  for (const r of rings) {
    path.moveTo(r[0], r[1]);
    for (let k = 2; k < r.length; k += 2) path.lineTo(r[k], r[k + 1]);
    path.closePath();
    for (let k = 0; k < r.length; k += 2) {
      x0 = Math.min(x0, r[k]); x1 = Math.max(x1, r[k]); y0 = Math.min(y0, r[k + 1]); y1 = Math.max(y1, r[k + 1]);
    }
  }
  const nb = Math.max(1, Math.ceil((y1 - y0) / BAND_M) + 1);
  const bands = Array.from({ length: nb }, () => []);
  const ex = [];
  for (const r of rings) {
    const n = r.length / 2;
    for (let k = 0; k < n; k++) {
      const ax = r[2 * k], ay = r[2 * k + 1], bx = r[(2 * k + 2) % r.length], by = r[(2 * k + 3) % r.length];
      const id = ex.length / 4;
      ex.push(ax, ay, bx, by);
      const b0 = Math.floor((Math.min(ay, by) - y0) / BAND_M), b1 = Math.floor((Math.max(ay, by) - y0) / BAND_M);
      for (let b = Math.max(0, b0); b <= Math.min(nb - 1, b1); b++) bands[b].push(id);
    }
  }
  return { rings, layer, kind, path, bbox: [x0, y0, x1, y1], edges: new Float64Array(ex), bands, z: 0 };
}

function inPoly(p, x, y) {
  const [x0, y0, x1, y1] = p.bbox;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const list = p.bands[Math.floor((y - y0) / BAND_M)];
  if (!list) return false;
  const e = p.edges;
  let inside = false;
  for (let k = 0; k < list.length; k++) {
    const o = list[k] * 4, ay = e[o + 1], by = e[o + 3];
    if ((ay > y) !== (by > y)) {
      const ax = e[o], bx = e[o + 2];
      if (x < ax + (y - ay) * (bx - ax) / (by - ay)) inside = !inside;
    }
  }
  return inside;
}

function ringArea(r) {
  let a = 0;
  for (let k = 0; k < r.length; k += 2) {
    const j = (k + 2) % r.length;
    a += r[k] * r[j + 1] - r[j] * r[k + 1];
  }
  return Math.abs(a) / 2;
}

/** Z order of the ground, bottom to top. groundAt() returns the topmost. */
const Z = { land: 0, farm: 1, farmyard: 1.5, green: 2, wood: 3, estate: 4, golf: 5, clump: 6, bunker: 7, pool: 8, yard: 9 };
const SEA = { layer: 'sea', kind: 'sea' };
const LAND = { layer: 'land', kind: 'land' };

// ------------------------------------------------------------------ geometry

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return qx * qx + qy * qy;
}

/** An oriented box: centre, unit axis along u, half extents. */
function obb(x, y, ux, uy, hu, hv) { return { x, y, ux, uy, hu, hv }; }
function obbCorners(b) {
  const vx = -b.uy, vy = b.ux;
  return [
    [b.x - b.ux * b.hu - vx * b.hv, b.y - b.uy * b.hu - vy * b.hv],
    [b.x + b.ux * b.hu - vx * b.hv, b.y + b.uy * b.hu - vy * b.hv],
    [b.x + b.ux * b.hu + vx * b.hv, b.y + b.uy * b.hu + vy * b.hv],
    [b.x - b.ux * b.hu + vx * b.hv, b.y - b.uy * b.hu + vy * b.hv],
  ];
}
function obbOverlap(a, b, gap) {
  for (const [ax, ay] of [[a.ux, a.uy], [-a.uy, a.ux], [b.ux, b.uy], [-b.uy, b.ux]]) {
    const ra = Math.abs(a.ux * ax + a.uy * ay) * a.hu + Math.abs(-a.uy * ax + a.ux * ay) * a.hv;
    const rb = Math.abs(b.ux * ax + b.uy * ay) * b.hu + Math.abs(-b.uy * ax + b.ux * ay) * b.hv;
    if (Math.abs((b.x - a.x) * ax + (b.y - a.y) * ay) > ra + rb + gap) return false;
  }
  return true;
}
function obbPointDist(b, x, y) {
  const dx = x - b.x, dy = y - b.y;
  const u = Math.abs(dx * b.ux + dy * b.uy) - b.hu, v = Math.abs(-dx * b.uy + dy * b.ux) - b.hv;
  return Math.hypot(Math.max(0, u), Math.max(0, v));
}

/** Convex hull (monotone chain) of [x,y] points. */
function hull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function polyTo(path, pts) {
  path.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) path.lineTo(pts[k][0], pts[k][1]);
  path.closePath();
}

/** Sutherland–Hodgman clip of a flat ring against an axis-aligned box in a
 *  rotated (u, v) frame. Returns a flat world ring or null. */
function clipRingUV(ring, ux, uy, u0, u1, v0, v1) {
  let pts = [];
  for (let k = 0; k < ring.length; k += 2) {
    const x = ring[k], y = ring[k + 1];
    pts.push([x * ux + y * uy, -x * uy + y * ux]);
  }
  const clip = (inside, inter) => {
    const out = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length], ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(inter(a, b));
    }
    pts = out;
  };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  clip(p => p[0] >= u0, (a, b) => lerp(a, b, (u0 - a[0]) / (b[0] - a[0])));
  if (pts.length) clip(p => p[0] <= u1, (a, b) => lerp(a, b, (u1 - a[0]) / (b[0] - a[0])));
  if (pts.length) clip(p => p[1] >= v0, (a, b) => lerp(a, b, (v0 - a[1]) / (b[1] - a[1])));
  if (pts.length) clip(p => p[1] <= v1, (a, b) => lerp(a, b, (v1 - a[1]) / (b[1] - a[1])));
  if (pts.length < 3) return null;
  const out = [];
  for (const [u, v] of pts) out.push(u * ux - v * uy, u * uy + v * ux);
  return out;
}

/** Where the line {p : p.n = c} is inside the rings, as intervals of p.u.
 *  Even-odd, so holes and multiple rings come out right. */
function lineSpans(rings, ux, uy, c) {
  const nx = -uy, ny = ux, hits = [];
  for (const r of rings) {
    for (let k = 0; k < r.length; k += 2) {
      const j = (k + 2) % r.length;
      const da = r[k] * nx + r[k + 1] * ny - c, db = r[j] * nx + r[j + 1] * ny - c;
      if ((da > 0) !== (db > 0)) {
        const t = da / (da - db);
        const x = r[k] + (r[j] - r[k]) * t, y = r[k + 1] + (r[j + 1] - r[k + 1]) * t;
        hits.push(x * ux + y * uy);
      }
    }
  }
  hits.sort((a, b) => a - b);
  const spans = [];
  for (let k = 0; k + 1 < hits.length; k += 2) spans.push([hits[k], hits[k + 1]]);
  return spans;
}

/** buildings.json's ring: integers in q metres, the first point absolute and
 *  every later one a step from the last. Returns a flat world ring. */
function decodeRing(a, q, from = 1) {
  const r = [];
  let x = a[from], y = a[from + 1];
  r.push(x * q, y * q);
  for (let k = from + 2; k + 1 < a.length; k += 2) { x += a[k]; y += a[k + 1]; r.push(x * q, y * q); }
  return r;
}

/** Area-weighted middle of a flat ring. */
function ringCentroid(r) {
  let a = 0, cx = 0, cy = 0;
  for (let k = 0; k < r.length; k += 2) {
    const j = (k + 2) % r.length, f = r[k] * r[j + 1] - r[j] * r[k + 1];
    a += f; cx += (r[k] + r[j]) * f; cy += (r[k + 1] + r[j + 1]) * f;
  }
  if (Math.abs(a) < 1e-9) return [r[0], r[1]];
  return [cx / (3 * a), cy / (3 * a)];
}

/** The smallest oriented box round a flat ring, u along its longer side. */
function ringObb(r) {
  const pts = [];
  for (let k = 0; k < r.length; k += 2) pts.push([r[k], r[k + 1]]);
  const h = hull(pts);
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const [ax, ay] = h[i], [bx, by] = h[(i + 1) % h.length], l = Math.hypot(bx - ax, by - ay);
    if (l < 1e-6) continue;
    const ux = (bx - ax) / l, uy = (by - ay) / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of h) {
      const u = x * ux + y * uy, v = -x * uy + y * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ux, uy, u0, u1, v0, v1 };
  }
  if (!best) return obb(r[0], r[1], 1, 0, 0.5, 0.5);
  const { ux, uy, u0, u1, v0, v1 } = best, mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
  const cx = mu * ux - mv * uy, cy = mu * uy + mv * ux;
  return (u1 - u0) >= (v1 - v0) ? obb(cx, cy, ux, uy, (u1 - u0) / 2, (v1 - v0) / 2)
    : obb(cx, cy, -uy, ux, (v1 - v0) / 2, (u1 - u0) / 2);
}

/** Point in a flat ring, even-odd. */
function inRing(r, x, y) {
  let c = false;
  for (let k = 0, n = r.length; k < n; k += 2) {
    const ax = r[k], ay = r[k + 1], bx = r[(k + 2) % n], by = r[(k + 3) % n];
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) c = !c;
  }
  return c;
}

function flatTo(path, r, dx = 0, dy = 0) {
  path.moveTo(r[0] + dx, r[1] + dy);
  for (let k = 2; k < r.length; k += 2) path.lineTo(r[k] + dx, r[k + 1] + dy);
  path.closePath();
}

/** A flat ring into a path wound the way hull() winds (positive area), so
 *  shadow pieces can share one path and one nonzero fill with no holes. */
function posTo(path, r, dx = 0, dy = 0) {
  let a = 0;
  for (let k = 0; k < r.length; k += 2) { const j = (k + 2) % r.length; a += r[k] * r[j + 1] - r[j] * r[k + 1]; }
  if (a >= 0) { flatTo(path, r, dx, dy); return; }
  path.moveTo(r[r.length - 2] + dx, r[r.length - 1] + dy);
  for (let k = r.length - 4; k >= 0; k -= 2) path.lineTo(r[k] + dx, r[k + 1] + dy);
  path.closePath();
}

/** A footprint's shadow at height h: the ring swept along the sun, every
 *  piece wound the same way. */
function sweepTo(path, r, sx, sy) {
  posTo(path, r); posTo(path, r, sx, sy);
  for (let k = 0; k < r.length; k += 2) {
    const j = (k + 2) % r.length;
    posTo(path, [r[k], r[k + 1], r[j], r[j + 1], r[j] + sx, r[j + 1] + sy, r[k] + sx, r[k + 1] + sy]);
  }
}

// ------------------------------------------------------------------------ load

/**
 * Called once at boot, after the graph has loaded.
 * @param {{ graph: object, mapToWorld: (px:number, py:number) => {x:number, y:number},
 *           metresPerMapPx: number }} world
 * @returns {Promise<object>} whatever drawGround/drawObjects need
 */
export async function load(world) {
  const t0 = performance.now();
  const { graph, mapToWorld } = world;
  const W = mapToWorld(MAP_W, MAP_H);
  const S = {
    world, width: W.x, height: W.y, polys: [], fields: [], polyGrid: null,
    gx: Math.ceil(W.x / CELL_M), gy: Math.ceil(W.y / CELL_M), cells: [],
    land: null, counts: {}, shadow: null, frame: null,
  };
  for (let k = 0; k < S.gx * S.gy; k++) {
    S.cells.push({ trees: [], houses: [], hedges: [], walls: [], glass: [], huts: [], blds: [], silos: [], bales: [], stones: [],
      fieldIds: new Set(), cache: null, gcache: null });
  }

  // ---- the map, and the real buildings beside its roads
  const bdataP = fetch(BUILDINGS_URL).then(r => (r.ok ? r.json() : null)).catch(() => null);
  let doc = null;
  try {
    const txt = await (await fetch(MAP_URL)).text();
    doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('map did not parse');
  } catch (err) {
    console.warn('scenery: no map, drawing roads on grass only', err);
    S.failed = true;
    return S;
  }

  /** Every filled shape under an element, in world metres, transforms honoured. */
  const shapesIn = (root, filter) => {
    const out = [];
    if (!root) return out;
    for (const el of root.querySelectorAll('path, rect, ellipse, circle, polygon')) {
      if (filter && !filter(el)) continue;
      const m = elementMatrix(el);
      const rings = shapeRings(el).map(r => {
        const w = new Array(r.length);
        for (let k = 0; k < r.length; k += 2) {
          const px = m.a * r[k] + m.c * r[k + 1] + m.e, py = m.b * r[k] + m.d * r[k + 1] + m.f;
          const p = mapToWorld(px, py);
          w[k] = p.x; w[k + 1] = p.y;
        }
        return w;
      }).filter(r => r.length >= 6);
      if (rings.length) out.push({ el, rings });
    }
    return out;
  };
  const add = (rings, layer, kind) => {
    const p = makePoly(rings, layer, kind);
    p.z = Z[layer];
    S.polys.push(p);
    return p;
  };

  const landEl = doc.getElementById('land');
  for (const s of shapesIn(landEl ? { querySelectorAll: () => [landEl] } : null)) S.land = add(s.rings, 'land', 'land');
  for (const s of shapesIn(doc.getElementById('farmland'))) add(s.rings, 'farm', 'farm');
  for (const s of shapesIn(doc.getElementById('green-areas'))) add(s.rings, 'green', s.el.getAttribute('data-kind') || 'grass');
  for (const s of shapesIn(doc.getElementById('woodland'))) add(s.rings, 'wood', 'wood');
  const dest = doc.getElementById('destinations');
  for (const s of shapesIn(dest)) {
    const id = s.el.getAttribute('id') || '', fill = (s.el.getAttribute('fill') || s.el.parentNode.getAttribute('fill') || '').toLowerCase();
    if (id.includes('park')) add(s.rings, 'estate', 'estate');               // Wyx Park: wooded parkland
    else if (id.includes('golf')) add(s.rings, 'golf', 'golf');
    else if (fill === '#7ea671') add(s.rings, 'clump', 'clump');             // tree clumps on the course
    else if (fill === '#f0e0a8') add(s.rings, 'bunker', 'bunker');
  }
  for (const s of shapesIn(doc.getElementById('pools'), el => (el.getAttribute('fill') || el.parentNode.getAttribute('fill')) !== '#a8d8e8' && el.getAttribute('stroke') !== 'none')) {
    const p = add(s.rings, 'pool', 'pool');
    p.big = s.rings.reduce((a, r) => a + ringArea(r), 0) > 600;
  }
  // Glasshouse Acres: the fenced yard is ground, each bay is a glasshouse.
  const gh = doc.getElementById('glasshouse-acres');
  const ghShapes = shapesIn(gh, el => el.tagName.toLowerCase() === 'rect');
  const glassBays = [];
  ghShapes.forEach((s, k) => {
    if (k < 2) add(s.rings, 'yard', 'yard');
    else glassBays.push(s.rings[0]);
  });

  // Farmyards are yard ground, not fields. The map draws each as farmland, so
  // its own polygon becomes the yard; churchyards are grass with graves.
  // Housing areas are not ground: they say where the town is.
  // Each map polygon keeps the number it had before the yards and
  // churchyards were added, so its fields keep their crops and hedges.
  S.polys.slice().sort((a, b) => a.z - b.z).forEach((p, k) => { p.seedId = k; });
  const bdata = await bdataP;
  const housing = [];
  if (bdata) {
    const farmPolys0 = S.polys.filter(p => p.layer === 'farm');
    for (const a of bdata.a) {
      const kind = bdata.areas[a[0]], ring = decodeRing(a, bdata.q);
      if (ring.length < 6) continue;
      if (kind === 'housing') { housing.push(makePoly([ring], 'housing', 'housing')); continue; }
      if (kind === 'churchyard') { add([ring], 'green', 'churchyard'); continue; }
      const yb = makePoly([ring], 'farmyard', 'farmyard').bbox;
      const same = farmPolys0.find(p => !p.yard && p.bbox.every((v, k) => Math.abs(v - yb[k]) < 2.5));
      if (same) { same.layer = 'farmyard'; same.kind = 'farmyard'; same.z = Z.farmyard; same.yard = true; }
      else add([ring], 'farmyard', 'farmyard');
    }
  }

  S.polys.sort((a, b) => a.z - b.z);
  S.polys.forEach((p, k) => { p.id = k; });

  // Polygon grid for groundAt().
  S.polyGrid = Array.from({ length: S.gx * S.gy }, () => []);
  for (const p of S.polys) {
    const [x0, y0, x1, y1] = p.bbox;
    for (let j = Math.max(0, Math.floor(y0 / CELL_M)); j <= Math.min(S.gy - 1, Math.floor(y1 / CELL_M)); j++) {
      for (let i = Math.max(0, Math.floor(x0 / CELL_M)); i <= Math.min(S.gx - 1, Math.floor(x1 / CELL_M)); i++) S.polyGrid[j * S.gx + i].push(p);
    }
  }
  const groundAt = (x, y) => {
    const i = Math.floor(x / CELL_M), j = Math.floor(y / CELL_M);
    if (i < 0 || j < 0 || i >= S.gx || j >= S.gy) return SEA;
    const list = S.polyGrid[j * S.gx + i];
    for (let k = list.length - 1; k >= 0; k--) if (inPoly(list[k], x, y)) return list[k];
    return SEA;
  };
  S.groundAt = groundAt;

  // ---- roads, from the graph: the page's widths, so nothing lands on one
  const RG = 50, rgx = Math.ceil(S.width / RG) + 1, rgy = Math.ceil(S.height / RG) + 1;
  const roadGrid = Array.from({ length: rgx * rgy }, () => []);
  const nodeW = graph.nodes.map(([fx, fy]) => mapToWorld(fx * MAP_W, fy * MAP_H));
  const roads = [];
  const REACH = 12;   // biggest object radius a query may ask about
  for (let k = 0; k < graph.edges.length; k++) {
    const [i, j, cls] = graph.edges[k];
    if (i < 0 || j < 0 || i >= nodeW.length || j >= nodeW.length) continue;
    // The page's own half-width when it gives one (world.roadHalf), so the
    // A28's narrower stretches keep their verges; ROAD_HALF otherwise.
    const a = nodeW[i], b = nodeW[j], half = world.roadHalf?.(k, cls) ?? ROAD_HALF[cls] ?? 4;
    const seg = { ax: a.x, ay: a.y, bx: b.x, by: b.y, half, cls, i, j };
    roads.push(seg);
    const pad = half + VERGE_M + REACH;
    for (let gyy = Math.max(0, Math.floor((Math.min(a.y, b.y) - pad) / RG)); gyy <= Math.min(rgy - 1, Math.floor((Math.max(a.y, b.y) + pad) / RG)); gyy++) {
      for (let gxx = Math.max(0, Math.floor((Math.min(a.x, b.x) - pad) / RG)); gxx <= Math.min(rgx - 1, Math.floor((Math.max(a.x, b.x) + pad) / RG)); gxx++) {
        if (segDist2((gxx + 0.5) * RG, (gyy + 0.5) * RG, a.x, a.y, b.x, b.y) <= (pad + RG * 0.7072) ** 2) roadGrid[gyy * rgx + gxx].push(seg);
      }
    }
  }
  /** True when a disc of radius r at (x, y) keeps VERGE_M clear of every road. */
  const roadClear = (x, y, r) => {
    const gxx = Math.floor(x / RG), gyy = Math.floor(y / RG);
    if (gxx < 0 || gyy < 0 || gxx >= rgx || gyy >= rgy) return true;
    for (const s of roadGrid[gyy * rgx + gxx]) {
      const lim = s.half + VERGE_M + r;
      if (segDist2(x, y, s.ax, s.ay, s.bx, s.by) < lim * lim) return false;
    }
    return true;
  };
  S.roadClear = roadClear;

  // ---- occupancy: houses and trees, so nothing stands in anything else
  const OG = 25, ogx = Math.ceil(S.width / OG) + 1, ogy = Math.ceil(S.height / OG) + 1;
  const houseGrid = Array.from({ length: ogx * ogy }, () => []);
  const treeGrid = Array.from({ length: ogx * ogy }, () => []);
  const near = (grid, x, y, fn) => {
    const ci = Math.floor(x / OG), cj = Math.floor(y / OG);
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      if (i < 0 || j < 0 || i >= ogx || j >= ogy) continue;
      for (const o of grid[j * ogx + i]) if (fn(o)) return true;
    }
    return false;
  };
  const put = (grid, x, y, o) => {
    const i = Math.floor(x / OG), j = Math.floor(y / OG);
    if (i >= 0 && j >= 0 && i < ogx && j < ogy) grid[j * ogx + i].push(o);
  };
  const cellOf = (x, y) => {
    const i = Math.floor(x / CELL_M), j = Math.floor(y / CELL_M);
    return i < 0 || j < 0 || i >= S.gx || j >= S.gy ? null : S.cells[j * S.gx + i];
  };
  /** A building in every occupancy cell its box covers, so a big shed is
   *  found from any side of it. */
  const putBox = (grid, o) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of obbCorners(o.box)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let j = Math.max(0, Math.floor(y0 / OG)); j <= Math.min(ogy - 1, Math.floor(y1 / OG)); j++) {
      for (let i = Math.max(0, Math.floor(x0 / OG)); i <= Math.min(ogx - 1, Math.floor(x1 / OG)); i++) grid[j * ogx + i].push(o);
    }
  };

  // ---- housing areas (OSM landuse=residential): where the town really is
  const housingGrid = Array.from({ length: S.gx * S.gy }, () => []);
  for (const p of housing) {
    const [x0, y0, x1, y1] = p.bbox;
    for (let j = Math.max(0, Math.floor(y0 / CELL_M)); j <= Math.min(S.gy - 1, Math.floor(y1 / CELL_M)); j++) {
      for (let i = Math.max(0, Math.floor(x0 / CELL_M)); i <= Math.min(S.gx - 1, Math.floor(x1 / CELL_M)); i++) housingGrid[j * S.gx + i].push(p);
    }
  }
  const inHousing = (x, y) => {
    const i = Math.floor(x / CELL_M), j = Math.floor(y / CELL_M);
    if (i < 0 || j < 0 || i >= S.gx || j >= S.gy) return false;
    return housingGrid[j * S.gx + i].some(p => inPoly(p, x, y));
  };
  S.inHousing = inHousing;   // and for townAt(), the page's camera

  /** The nearest road to (x, y), looking about 50m round: the closest point
   *  on it, its direction and half-width. */
  const roadNear = (x, y) => {
    const gxx = Math.floor(x / RG), gyy = Math.floor(y / RG);
    let best = null;
    for (let j = gyy - 1; j <= gyy + 1; j++) for (let i = gxx - 1; i <= gxx + 1; i++) {
      if (i < 0 || j < 0 || i >= rgx || j >= rgy) continue;
      for (const s of roadGrid[j * rgx + i]) {
        const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
        let t = l2 ? ((x - s.ax) * dx + (y - s.ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = s.ax + dx * t, py = s.ay + dy * t, d = Math.hypot(x - px, y - py);
        if (!best || d < best.d) { const l = Math.sqrt(l2) || 1; best = { d, px, py, ux: dx / l, uy: dy / l, half: s.half }; }
      }
    }
    return best;
  };

  // ---- the real buildings (OpenStreetMap). One that stands in a road's
  // verge is moved straight back out of it, and the buildings it then runs
  // into (its own extension, the rest of its terrace) go back with it.
  const BC = { real: 0, pushed: 0, dropped: 0, farmGen: 0, silos: 0, bales: 0, stones: 0, drives: 0 };
  /** How far a ring moved by (dx, dy) reaches into a road's keep-clear band
   *  at its worst point, and which way is out: from that road towards the
   *  building's middle (mx, my). Infinity when a road runs through it. */
  const vergeNeed = (ring, mx, my, dx, dy) => {
    let worst = 0, ox = 0, oy = 0;
    const n = ring.length;
    for (let k = 0; k < n; k += 2) {
      const ax = ring[k] + dx, ay = ring[k + 1] + dy, bx = ring[(k + 2) % n] + dx, by = ring[(k + 3) % n] + dy;
      const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.2));
      for (let t = 0; t < m; t++) {
        const x = ax + (bx - ax) * t / m, y = ay + (by - ay) * t / m;
        const gxx = Math.floor(x / RG), gyy = Math.floor(y / RG);
        if (gxx < 0 || gyy < 0 || gxx >= rgx || gyy >= rgy) continue;
        for (const s of roadGrid[gyy * rgx + gxx]) {
          const sx = s.bx - s.ax, sy = s.by - s.ay, l2 = sx * sx + sy * sy;
          let u = l2 ? ((x - s.ax) * sx + (y - s.ay) * sy) / l2 : 0;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const px = s.ax + sx * u, py = s.ay + sy * u;
          let nx = mx + dx - px, ny = my + dy - py;
          const nl = Math.hypot(nx, ny);
          if (nl < 0.5) return { need: Infinity, ox: 0, oy: 0 };
          nx /= nl; ny /= nl;
          const need = s.half + VERGE_M + 0.05 - ((x - px) * nx + (y - py) * ny);
          if (need > worst) { worst = need; ox = nx; oy = ny; }
        }
      }
    }
    return { need: worst, ox, oy };
  };
  /** Move (dx, dy) on until the ring is clear of every verge; null if that
   *  takes more than PUSH_MAX. */
  const clearOf = (ring, mx, my, dx, dy) => {
    for (let it = 0; it < 6; it++) {
      const v = vergeNeed(ring, mx, my, dx, dy);
      if (v.need <= 0) return [dx, dy];
      if (!Number.isFinite(v.need)) return null;
      dx += v.ox * (v.need + 0.05); dy += v.oy * (v.need + 0.05);
      if (Math.hypot(dx, dy) > PUSH_MAX) return null;
    }
    return null;
  };
  const shift = (box, dx, dy) => obb(box.x + dx, box.y + dy, box.ux, box.uy, box.hu, box.hv);
  const realIn = [];
  if (bdata) {
    for (const a of bdata.b) {
      const ring = decodeRing(a, bdata.q);
      if (ring.length < 6) continue;
      const [mx, my] = ringCentroid(ring);
      realIn.push({ kind: bdata.kinds[a[0]], ring, mx, my, box0: ringObb(ring), d: [0, 0], gone: false });
    }
  }
  {
    const TG = 30, tg = new Map();
    for (const o of realIn) {
      const i = Math.floor(o.mx / TG), j = Math.floor(o.my / TG), key = i * 4099 + j;
      if (!tg.has(key)) tg.set(key, []);
      tg.get(key).push(o);
    }
    const around = (o, fn) => {
      const ci = Math.floor(o.mx / TG), cj = Math.floor(o.my / TG);
      for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) for (const p of tg.get(i * 4099 + j) || []) if (p !== o && !p.gone) fn(p);
    };
    const queue = [];
    for (const o of realIn) {
      const d = clearOf(o.ring, o.mx, o.my, 0, 0);
      if (!d) { o.gone = true; continue; }
      o.d = d;
      if (Math.hypot(d[0], d[1]) > 0.01) queue.push(o);
    }
    // What a moved building now runs into goes back with it (once or twice).
    const moved = new Set(queue);
    for (let qi = 0; qi < queue.length && qi < 4 * realIn.length; qi++) {
      const m = queue[qi];
      if (m.gone) continue;
      const len = Math.hypot(m.d[0], m.d[1]), px = m.d[0] / len, py = m.d[1] / len;
      const mb = shift(m.box0, m.d[0], m.d[1]);
      around(m, n => {
        if (obbOverlap(m.box0, n.box0, -0.3)) return;                 // touching already, as mapped
        if (!obbOverlap(mb, shift(n.box0, n.d[0], n.d[1]), -0.3)) return;
        const deficit = len - (n.d[0] * px + n.d[1] * py);
        if (deficit <= 0) return;
        const d = clearOf(n.ring, n.mx, n.my, n.d[0] + px * deficit, n.d[1] + py * deficit);
        if (!d) { n.gone = true; return; }
        n.d = d; moved.add(n); queue.push(n);
      });
    }
    // A moved building that still overlaps another is left out.
    for (const m of moved) {
      if (m.gone) continue;
      const mb = shift(m.box0, m.d[0], m.d[1]);
      let clash = false;
      around(m, n => { if (!clash && !obbOverlap(m.box0, n.box0, -0.4) && obbOverlap(mb, shift(n.box0, n.d[0], n.d[1]), -0.4)) clash = true; });
      if (clash) m.gone = true;
      else BC.pushed++;
    }
  }

  /** A building record: its footprint, box, the axis its ridge runs along,
   *  and how it is roofed. real is false for the farm buildings made up for
   *  a farmyard OSM has none mapped in. */
  const blds = [];
  const makeBuilding = (kind, ring, real) => {
    const box = ringObb(ring), [cx, cy] = ringCentroid(ring), area = ringArea(ring);
    const seed = hash(Math.round(cx * 10), Math.round(cy * 10), 301), r = rng(seed);
    const rect = ring.length === 8 && Math.abs(area - 4 * box.hu * box.hv) < 0.05 * area;
    const rn = roadNear(cx, cy);
    const b = { bld: true, real, kind, ring, box, cx, cy, area, rect, seed, road: rn && rn.d < 45 ? rn : null };
    // The ridge runs along the long side, except that a house near a road
    // has its ridge along the road, as a street's roofs do.
    let ax = box.ux, ay = box.uy;
    const homely = kind === 'house' || kind === 'farmhouse' || kind === 'retail' || kind === 'flats' || kind === 'hall' || kind === 'station';
    if (homely && b.road && box.hu / Math.max(0.5, box.hv) < 2.4 && Math.abs(box.ux * b.road.ux + box.uy * b.road.uy) < Math.SQRT1_2) {
      ax = -box.uy; ay = box.ux;
    }
    b.rbox = ax === box.ux && ay === box.uy ? box : obb(box.x, box.y, ax, ay, box.hv, box.hu);
    [b.he, b.hr] = BH[kind] || BH.other;
    // Roofs by kind. Neighbouring houses tend to share a roof, as streets do.
    const street = ROOFS_R[Math.floor(noise(cx, cy, 45, 303) * ROOFS_R.length * 0.999)];
    const pick = list => list[(r() * list.length) | 0];
    b.form = 'pitched';
    switch (kind) {
      case 'house':
        b.roof = r() < 0.88 ? street : pick(ROOFS_R);
        b.hipped = rect && b.rbox.hu > 3.5 && r() < 0.32;
        b.chimney = r() < 0.7 ? (r() < 0.5 ? -1 : 1) : 0;
        break;
      case 'farmhouse':
        b.roof = r() < 0.7 ? pick(TILES) : pick(SLATES); b.chimney = 2; b.hipped = rect && r() < 0.25;
        break;
      case 'flats': b.roof = pick(SLATES); b.hipped = rect; if (area > 700) { b.form = 'flat'; b.flat = pick(FLAT); } break;
      case 'barn': case 'industrial': case 'workshop':
        b.roof = kind === 'barn' && r() < 0.2 ? pick(TILES) : pick(METAL);
        if (kind !== 'barn' && !rect && area > 400) { b.form = 'flat'; b.flat = pick(FLAT); b.lights = true; }
        break;
      case 'church': b.form = 'church'; b.roof = SLATES[0]; break;
      case 'school': b.form = 'flat'; b.flat = FLAT[0]; b.lights = area > 120; break;
      case 'station': b.roof = SLATES[1]; b.chimney = 2; break;
      case 'retail':
        if (area < 260) { b.roof = r() < 0.6 ? pick(SLATES) : street; b.chimney = r() < 0.5 ? 1 : 0; }
        else { b.form = 'flat'; b.flat = pick(FLAT); b.lights = r() < 0.6; }
        if (rect && b.road && b.road.d < 26 && r() < 0.8) b.awning = AWNING[(r() * AWNING.length) | 0];
        break;
      case 'garage': b.form = 'flat'; b.flat = { base: pick(FELT), parapet: '#99958c' }; break;
      case 'shed': b.form = 'flat'; b.flat = { base: r() < 0.5 ? pick(FELT) : '#8b6a4a', parapet: '#a08a70' }; break;
      case 'caravan': b.form = 'caravan'; b.fill = pick(CARAVAN); break;
      case 'glasshouse': b.form = 'glass'; break;
      case 'canopy': b.form = 'canopy'; break;
      default:   // hall, other
        if (rect && area < 450) { b.roof = r() < 0.6 ? pick(SLATES) : pick(TILES); b.hipped = r() < 0.4; }
        else { b.form = 'flat'; b.flat = pick(FLAT); b.lights = area > 200; }
    }
    if (b.form === 'pitched' && !rect && area > 1600) { b.form = 'flat'; b.flat = pick(FLAT); b.lights = true; }
    if (kind === 'church') {
      // The tower at the west end, inside the footprint; a spire on the big
      // parish church, a flat leaded top on a middling one, a bellcote on a
      // chapel.
      const { ux, uy, hu, hv } = b.rbox, w = ux > 0 ? -1 : 1;
      const ts = Math.max(2.4, Math.min(7, 2 * hv * 0.9, 2 * hu * 0.4));
      if (area < 220) b.tower = { box: obb(cx + ux * w * (hu - 1.4), cy + uy * w * (hu - 1.4), ux, uy, 0.7, 0.7), top: 'bell' };
      else {
        // the westernmost spot along the axis where the whole tower stands on the footprint
        for (let t = hu - ts / 2 - 0.2; t > -hu + ts / 2; t -= 0.5) {
          const tb = obb(b.rbox.x + ux * w * t, b.rbox.y + uy * w * t, ux, uy, ts / 2, ts / 2);
          if (obbCorners(tb).concat([[tb.x, tb.y]]).every(([x, y]) => inRing(ring, x, y))) { b.tower = { box: tb, top: area >= 450 ? 'spire' : 'flat' }; break; }
        }
      }
    }
    if (b.awning && b.road) {
      // Along the face towards the road, just inside the footprint.
      const { ux, uy, hu, hv } = b.rbox, vx = -uy, vy = ux;
      const tx = b.road.px - b.rbox.x, ty = b.road.py - b.rbox.y;
      const du = tx * ux + ty * uy, dv = tx * vx + ty * vy;
      const alongU = Math.abs(dv) / hv >= Math.abs(du) / hu;     // the road is off a long face
      const s = alongU ? Math.sign(dv) || 1 : Math.sign(du) || 1, D = 1.1;
      const P = (a, c) => [b.rbox.x + ux * a + vx * c, b.rbox.y + uy * a + vy * c];
      b.awningPts = alongU
        ? [P(-hu + 0.3, s * hv), P(hu - 0.3, s * hv), P(hu - 0.3, s * (hv - D)), P(-hu + 0.3, s * (hv - D))]
        : [P(s * hu, -hv + 0.3), P(s * hu, hv - 0.3), P(s * (hu - D), hv - 0.3), P(s * (hu - D), -hv + 0.3)];
      b.awningLen = alongU ? 2 * hu - 0.6 : 2 * hv - 0.6;
    }
    return b;
  };
  for (const o of realIn) {
    if (o.gone) { BC.dropped++; continue; }
    const ring = o.d[0] || o.d[1] ? o.ring.map((v, k) => v + o.d[k & 1]) : o.ring;
    const b = makeBuilding(o.kind, ring, true);
    blds.push(b);
    putBox(houseGrid, b);
    BC.real++;
  }

  // ---- farmsteads: a farmyard OSM has no buildings in gets a farmhouse and
  // barns of its own; every farm with a big barn may get silos and bales
  const silos = [], bales = [];
  const yards = S.polys.filter(p => p.layer === 'farmyard');
  for (const y of yards) {
    const ring = y.rings.reduce((a, r) => (ringArea(r) > ringArea(a) ? r : a), y.rings[0]);
    const yb = ringObb(ring), area = ringArea(ring), r = rng(hash(Math.round(yb.x), Math.round(yb.y), 311));
    const inYard = (x, yy) => inPoly(y, x, yy);
    const fits = (box, gap) => {
      const pts = obbCorners(box);
      for (const k of [0, 1, 2, 3]) pts.push([(pts[k][0] + pts[(k + 1) % 4][0]) / 2, (pts[k][1] + pts[(k + 1) % 4][1]) / 2]);
      pts.push([box.x, box.y]);
      return pts.every(([x, yy]) => inYard(x, yy) && roadClear(x, yy, 0.6)) && !near(houseGrid, box.x, box.y, h => obbOverlap(h.box, box, gap));
    };
    const mine = blds.filter(b => b.real && inYard(b.cx, b.cy));
    if (!mine.length && area > 500) {
      const want = area < 1500 ? [[15, 8]] : area < 5000 ? [[26, 12.5], [15, 8]] : [[34, 15], [24, 12], [16, 9]];
      const made = [];
      const tryPlace = (L, W, kind, order) => {
        for (let t = 0; t < 80; t++) {
          const [a, c, rot] = order(t);
          const ux = rot ? -yb.uy : yb.ux, uy = rot ? yb.ux : yb.uy;
          const box = obb(yb.x + yb.ux * a - yb.uy * c, yb.y + yb.uy * a + yb.ux * c, ux, uy, L / 2, W / 2);
          if (!fits(box, 3)) continue;
          const b = makeBuilding(kind, obbCorners(box).flat(), false);
          blds.push(b); putBox(houseGrid, b); made.push(b); BC.farmGen++;
          return b;
        }
        return null;
      };
      // The farmhouse nearest the road, the barns anywhere in the yard.
      if (area > 1200) {
        const spots = [];
        for (let a = -yb.hu + 6; a <= yb.hu - 6; a += 3) for (let c = -yb.hv + 5; c <= yb.hv - 5; c += 3) {
          const x = yb.x + yb.ux * a - yb.uy * c, yy = yb.y + yb.uy * a + yb.ux * c, rn = roadNear(x, yy);
          spots.push([a, c, rn ? rn.d : 99]);
        }
        spots.sort((p, q) => p[2] - q[2]);
        tryPlace(10 + r() * 2.5, 7.5 + r() * 1.2, 'farmhouse', t => (spots[t] ? [spots[t][0], spots[t][1], false] : [0, 0, false]));
      }
      for (const [L, W] of want) {
        tryPlace(L, W, 'barn', () => [(r() - 0.5) * 2 * Math.max(0, yb.hu - L / 2), (r() - 0.5) * 2 * Math.max(0, yb.hv - W / 2), r() < 0.25]);
      }
    }
    // Silos beside the biggest barn, and a stack of bales along it.
    const barns = blds.filter(b => (b.kind === 'barn') && inYard(b.cx, b.cy) && b.area > 110).sort((p, q) => q.area - p.area);
    const big = barns[0];
    if (!big) continue;
    const { ux, uy, hu, hv } = big.box, vx = -uy, vy = ux;
    const at = (a, c) => [big.box.x + ux * a + vx * c, big.box.y + uy * a + vy * c];
    const free = (x, yy, rad) => inYard(x, yy) && roadClear(x, yy, rad + 0.5)
      && !near(houseGrid, x, yy, h => obbPointDist(h.box, x, yy) < rad + 0.8)
      && !silos.some(s => Math.hypot(s.x - x, s.y - yy) < s.r + rad + 0.5);
    if (r() < 0.75) {
      const rad = 2.4 + r() * 0.9, n = r() < 0.5 ? 2 : 1, end = r() < 0.5 ? -1 : 1;
      for (const e of [end, -end]) {
        const got = [];
        for (let k = 0; k < n; k++) {
          const [x, yy] = at(e * (hu + rad + 1.2), (k - (n - 1) / 2) * (2 * rad + 0.6));
          if (free(x, yy, rad)) got.push({ x, y: yy, r: rad, seed: hash(Math.round(x * 10), Math.round(yy * 10), 313) });
        }
        if (got.length) { silos.push(...got); BC.silos += got.length; break; }
      }
    }
    if (r() < 0.7) {
      const side = r() < 0.5 ? -1 : 1, n = 3 + ((r() * 6) | 0), wrapped = r() < 0.4;
      for (let k = 0; k < n; k++) {
        const row = k % 2, col = (k / 2) | 0;
        const [x, yy] = at(-hu * 0.6 + col * 1.65 + row * 0.8, side * (hv + 1.6 + row * 1.5));
        if (free(x, yy, 0.8)) { bales.push({ x, y: yy, wrapped, seed: hash(Math.round(x * 10), Math.round(yy * 10), 317) }); BC.bales++; }
      }
    }
  }

  // ---- churchyards: headstones in rows facing east, clear of the church
  const stones = [];
  for (const p of S.polys) {
    if (p.kind !== 'churchyard') continue;
    const [x0, y0, x1, y1] = p.bbox;
    for (let y = y0 + 1.5; y < y1; y += 2.4) {
      for (let x = x0 + 1.2; x < x1; x += 1.5) {
        const r = rngAt(x, y, 321);
        const sx = x + (r() - 0.5) * 0.35, sy = y + (r() - 0.5) * 0.5;
        if (r() > 0.62 || noise(sx, sy, 9, 323) < 0.3) continue;
        if (!inPoly(p, sx, sy) || !roadClear(sx, sy, 1)) continue;
        if (near(houseGrid, sx, sy, h => obbPointDist(h.box, sx, sy) < 2.2)) continue;
        const a = (r() - 0.5) * 0.12;
        stones.push({ box: obb(sx, sy, Math.sin(a), Math.cos(a), 0.36, 0.16), seed: hash(Math.round(sx * 10), Math.round(sy * 10), 325) });
      }
    }
  }
  BC.stones = stones.length;

  // ---- fields: big farmland polygons split into field-sized blocks, each its
  // own crop and drill direction, with a hedge on every block boundary
  const hedgePieces = [];       // [x1,y1,x2,y2, kind]
  const hedgeSeen = new Set();
  const HG = 4;
  const hedgeKey = (x, y) => Math.floor(x / HG) * 100003 + Math.floor(y / HG);
  const hedgeNear = (x, y) => {
    const i = Math.floor(x / HG), j = Math.floor(y / HG);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (hedgeSeen.has((i + di) * 100003 + (j + dj))) return true;
    return false;
  };
  const addHedgeRun = (ax, ay, bx, by, kind, checkDup, okFn) => {
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / 3));
    for (let k = 0; k < n; k++) {
      const x1 = ax + (bx - ax) * k / n, y1 = ay + (by - ay) * k / n;
      const x2 = ax + (bx - ax) * (k + 1) / n, y2 = ay + (by - ay) * (k + 1) / n;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      if (!roadClear(mx, my, 1.4) || !roadClear(x1, y1, 1.4) || !roadClear(x2, y2, 1.4)) continue;
      if (checkDup && hedgeNear(mx, my)) continue;
      if (okFn && !okFn(mx, my)) continue;
      const g = groundAt(mx, my);
      if (g === SEA || g.layer === 'pool' || g.layer === 'wood' || g.layer === 'estate' || g.layer === 'farmyard') continue;
      if (near(houseGrid, mx, my, h => obbPointDist(h.box, mx, my) < 2)) continue;
      hedgePieces.push([x1, y1, x2, y2, kind]);
      hedgeSeen.add(hedgeKey(mx, my));
    }
  };

  const farmPolys = S.polys.filter(p => p.layer === 'farm');
  for (const p of farmPolys) {
    const r = rng(hash(p.seedId, 77, 1));
    const th = r() * Math.PI, ux = Math.cos(th), uy = Math.sin(th);
    const bu = 150 + r() * 80, bv = 120 + r() * 70;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const ring of p.rings) for (let k = 0; k < ring.length; k += 2) {
      const u = ring[k] * ux + ring[k + 1] * uy, v = -ring[k] * uy + ring[k + 1] * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const ou = r() * bu, ov = r() * bv;
    p.blockLines = [];
    for (let bi = Math.floor((u0 - ou) / bu); bi * bu + ou < u1; bi++) {
      for (let bj = Math.floor((v0 - ov) / bv); bj * bv + ov < v1; bj++) {
        const bu0 = bi * bu + ou, bv0 = bj * bv + ov;
        const rings = [];
        for (const ring of p.rings) {
          const c = clipRingUV(ring, ux, uy, bu0, bu0 + bu, bv0, bv0 + bv);
          if (c && ringArea(c) > 30) rings.push(c);
        }
        const area = rings.reduce((a, c) => a + ringArea(c), 0);
        if (area < 400) continue;
        const fr = rng(hash(p.seedId, bi * 131 + bj, 2));
        const along = fr() < 0.5;
        const f = makePoly(rings, 'field', 'field');
        f.arable = fr() < 0.72;
        f.u = fr();
        f.rowAngle = th + (along ? 0 : Math.PI / 2) + (fr() - 0.5) * 0.06;
        f.parent = p;
        S.fields.push(f);
      }
    }
    // Hedges on the inner block boundaries, where they fall inside the polygon.
    for (let bi = Math.floor((u0 - ou) / bu) + 1; bi * bu + ou < u1; bi++) {
      // line u = const: direction v
      for (const [s0, s1] of lineSpans(p.rings, -uy, ux, -(bi * bu + ou))) {
        // lineSpans with direction (-uy,ux) measures along v; its normal is -u
        const a = { x: (bi * bu + ou) * ux - s0 * uy, y: (bi * bu + ou) * uy + s0 * ux };
        const b = { x: (bi * bu + ou) * ux - s1 * uy, y: (bi * bu + ou) * uy + s1 * ux };
        p.blockLines.push([a.x, a.y, b.x, b.y]);
      }
    }
    for (let bj = Math.floor((v0 - ov) / bv) + 1; bj * bv + ov < v1; bj++) {
      for (const [s0, s1] of lineSpans(p.rings, ux, uy, bj * bv + ov)) {
        const c = bj * bv + ov;
        p.blockLines.push([s0 * ux - c * uy, s0 * uy + c * ux, s1 * ux - c * uy, s1 * uy + c * ux]);
      }
    }
  }
  // The pitches are mown in stripes: the same row machinery as a field.
  for (const p of S.polys) {
    if (p.layer !== 'green' || p.kind !== 'pitch') continue;
    const r = rng(hash(p.seedId, 91, 3));
    // Stripe along the pitch's longest edge.
    let best = 0, ang = 0;
    for (const ring of p.rings) for (let k = 0; k < ring.length; k += 2) {
      const j = (k + 2) % ring.length, dx = ring[j] - ring[k], dy = ring[j + 1] - ring[k + 1], l = dx * dx + dy * dy;
      if (l > best) { best = l; ang = Math.atan2(dy, dx); }
    }
    const f = makePoly(p.rings, 'field', 'pitch');
    f.pitch = true; f.u = r(); f.rowAngle = ang; f.parent = p;
    S.fields.push(f);
  }
  S.fields.forEach((f, k) => {
    f.id = k;
    const [x0, y0, x1, y1] = f.bbox;
    for (let j = Math.max(0, Math.floor(y0 / CELL_M)); j <= Math.min(S.gy - 1, Math.floor(y1 / CELL_M)); j++) {
      for (let i = Math.max(0, Math.floor(x0 / CELL_M)); i <= Math.min(S.gx - 1, Math.floor(x1 / CELL_M)); i++) S.cells[j * S.gx + i].fieldIds.add(k);
    }
  });

  // ---- houses: along residential roads, and along any other ordinary road
  // where the map itself has a garden, set back behind a front garden
  const houses = [];
  /** Town is where the map has gardens: three or more within a cell or its
   *  neighbours. Houses go along ordinary roads there too, not only along
   *  the graph's few residential edges. */
  const gardenCount = S.cells.map((_, k) => S.polyGrid[k].filter(p => p.kind === 'garden').length);
  const isTown = (x, y) => {
    const ci = Math.floor(x / CELL_M), cj = Math.floor(y / CELL_M);
    let n = 0;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      if (i >= 0 && j >= 0 && i < S.gx && j < S.gy) n += gardenCount[j * S.gx + i];
    }
    return n >= 3;
  };
  const HOUSE_GROUND = new Set(['land', 'garden', 'grass']);
  for (const s of roads) {
    if (s.cls === 'trunk' || s.cls === 'track') continue;
    const dx = s.bx - s.ax, dy = s.by - s.ay, len = Math.hypot(dx, dy);
    if (len < 20) continue;
    const ux = dx / len, uy = dy / len;
    for (const side of [-1, 1]) {
      const r = rng(hash(Math.min(s.i, s.j) * 4099 + Math.max(s.i, s.j), side + 5, 11));
      const vx = -uy * side, vy = ux * side;
      let t = 9 + r() * 4;
      while (t < len - 9) {
        const semi = r() < 0.3;
        const w = semi ? 12 + r() * 2.5 : 7 + r() * 3.2;
        const d = 6.5 + r() * 2.5;
        const front = 3.5 + r() * 3;
        const tc = t + w / 2;
        if (tc + w / 2 > len - 8) break;
        const off = s.half + VERGE_M + front + d / 2;
        const cx = s.ax + ux * tc + vx * off, cy = s.ay + uy * tc + vy * off;
        const g = groundAt(cx, cy);
        const box0 = obb(cx - vx * front / 2, cy - vy * front / 2, ux, uy, w / 2, (d + front) / 2);
        const ok = (s.cls === 'residential' || isTown(cx, cy) || inHousing(cx, cy) ? HOUSE_GROUND.has(g.kind) : g.kind === 'garden')
          && !near(houseGrid, cx, cy, h => h.bld && (obbOverlap(h.box, box0, REAL_GAP)
            || (h.kind === 'house' && Math.hypot(h.cx - cx, h.cy - cy) < REAL_NEAR)));
        const box = obb(cx, cy, ux, uy, w / 2, d / 2);
        let placed = false;
        if (ok && r() < 0.9) {
          const pts = obbCorners(box);
          pts.push([cx, cy]);
          for (const k of [0, 1, 2, 3]) pts.push([(pts[k][0] + pts[(k + 1) % 4][0]) / 2, (pts[k][1] + pts[(k + 1) % 4][1]) / 2]);
          if (pts.every(([x, y]) => roadClear(x, y, 0.3)) && !near(houseGrid, cx, cy, h => obbOverlap(h.box, box, 1.2))) {
            // The plot: front garden to the pavement, back garden behind.
            let back = 0;
            for (const want of [16, 11, 6, 2]) {
              const bx = cx + vx * (d / 2 + want), by = cy + vy * (d / 2 + want);
              const pb = [[bx - ux * w / 2, by - uy * w / 2], [bx + ux * w / 2, by + uy * w / 2], [bx, by]];
              const gb = groundAt(bx, by);
              const plot = obb(cx + vx * (d + want) / 2, cy + vy * (d + want) / 2, ux, uy, w / 2, want / 2);
              if (pb.every(([x, y]) => roadClear(x, y, 0)) && gb !== SEA && gb.layer !== 'pool'
                && !near(houseGrid, bx, by, h => h.bld && obbOverlap(h.box, plot, 0.3))) { back = want; break; }
            }
            const hr = rng(hash(Math.round(cx * 10), Math.round(cy * 10), 13));
            const hipped = !semi && hr() < 0.4;
            const house = {
              box, w, d, semi, hipped, ux, uy, vx, vy, front, back,
              roof: ROOFS[(hr() * ROOFS.length) | 0], chimney: hr() < 0.75 ? (hr() < 0.5 ? -1 : 1) : 0,
              boundary: hr() < 0.35 ? 'brick' : hr() < 0.55 ? 'flint' : hr() < 0.8 ? 'privet' : 'none',
              seed: hash(Math.round(cx * 10), Math.round(cy * 10), 14),
            };
            houses.push(house);
            put(houseGrid, cx, cy, house);
            placed = true;
          }
        }
        t += placed ? w + 0.8 + r() * 2.5 : 4 + r() * 6;
        if (placed && r() < 0.12) t += 8 + r() * 10;   // the odd gap: a drive, a path
      }
    }
  }

  // Front boundaries (low walls, privet) and back fences, so the town has edges.
  const walls = [];
  for (const h of houses) {
    const { box, w, d, ux, uy, vx, vy, front, back } = h;
    const fx = box.x - vx * (d / 2 + front - 0.9), fy = box.y - vy * (d / 2 + front - 0.9);
    const pathAt = (h.seed % 7 - 3) / 10 * w;   // where the garden path meets the pavement
    const runs = [[-w / 2, pathAt - 0.7], [pathAt + 0.7, w / 2]];
    for (const [a, b] of runs) {
      if (b - a < 0.6) continue;
      const x1 = fx + ux * a, y1 = fy + uy * a, x2 = fx + ux * b, y2 = fy + uy * b;
      if (!roadClear(x1, y1, 0.8) || !roadClear(x2, y2, 0.8)) continue;
      if (h.boundary === 'brick' || h.boundary === 'flint') walls.push({ x1, y1, x2, y2, kind: h.boundary });
      else if (h.boundary === 'privet') hedgePieces.push([x1, y1, x2, y2, 'privet']);
    }
    if (back >= 6) {
      const bx = box.x + vx * (d / 2 + back), by = box.y + vy * (d / 2 + back);
      const c = [[box.x - ux * w / 2 + vx * d / 2, box.y - uy * w / 2 + vy * d / 2],
        [bx - ux * w / 2, by - uy * w / 2], [bx + ux * w / 2, by + uy * w / 2],
        [box.x + ux * w / 2 + vx * d / 2, box.y + uy * w / 2 + vy * d / 2]];
      for (let k = 0; k < 3; k++) {
        const [x1, y1] = c[k], [x2, y2] = c[k + 1];
        if (roadClear(x1, y1, 0.2) && roadClear(x2, y2, 0.2)) walls.push({ x1, y1, x2, y2, kind: 'fence' });
      }
    }
  }

  // ---- hedges: along country roads first, then field and block boundaries
  // (skipping any that would double one already along the road)
  const COUNTRY = new Set(['farm', 'land', 'grass', 'meadow']);
  for (const s of roads) {
    if (s.cls === 'trunk' || s.cls === 'residential') continue;
    const dx = s.bx - s.ax, dy = s.by - s.ay, len = Math.hypot(dx, dy);
    if (len < 16) continue;
    const ux = dx / len, uy = dy / len;
    for (const side of [-1, 1]) {
      const vx = -uy * side, vy = ux * side, off = s.half + VERGE_M + 1.6;
      const r = rng(hash(Math.min(s.i, s.j) * 4099 + Math.max(s.i, s.j), side + 5, 21));
      let t = 6;
      while (t < len - 6) {
        const run = 25 + r() * 70, gap = r() < 0.25 ? 4 + r() * 8 : 0;   // a field gate now and then
        const t1 = Math.min(len - 6, t + run);
        const ax = s.ax + ux * t + vx * off, ay = s.ay + uy * t + vy * off;
        const bx = s.ax + ux * t1 + vx * off, by = s.ay + uy * t1 + vy * off;
        addHedgeRun(ax, ay, bx, by, 'field', false, (x, y) => {
          const g = groundAt(x, y);
          if (!COUNTRY.has(g.kind)) return false;
          // only out of town: no house within 30m
          return !near(houseGrid, x, y, h => Math.hypot(h.box.x - x, h.box.y - y) < 30);
        });
        t = t1 + gap;
      }
    }
  }
  for (const p of farmPolys) {
    for (const ring of p.rings) {
      for (let k = 0; k < ring.length; k += 2) {
        const j = (k + 2) % ring.length;
        addHedgeRun(ring[k], ring[k + 1], ring[j], ring[j + 1], 'field', true);
      }
    }
    for (const [ax, ay, bx, by] of p.blockLines) addHedgeRun(ax, ay, bx, by, 'field', true);
  }

  // ---- trees
  const trees = [];
  /** Place a tree if it is clear of roads, water, houses and (unless dense)
   *  other trees. kind: 'broad' | 'conifer'. */
  const addTree = (x, y, r, kind, dense) => {
    if (x < 0 || y < 0 || x > S.width || y > S.height) return false;
    if (!roadClear(x, y, crownReach(r))) return false;
    const g = groundAt(x, y);
    if (g === SEA || g.layer === 'pool' || g.layer === 'bunker' || g.kind === 'pitch' || g.layer === 'yard' || g.layer === 'farmyard') return false;
    if (near(houseGrid, x, y, h => obbPointDist(h.box, x, y) < r * 0.75)) return false;
    if (!dense && near(treeGrid, x, y, t => (t.x - x) ** 2 + (t.y - y) ** 2 < ((t.r + r) * 0.62) ** 2)) return false;
    const t = { x, y, r, kind, seed: hash(Math.round(x * 10), Math.round(y * 10), 31) };
    trees.push(t);
    put(treeGrid, x, y, t);
    return true;
  };

  // Woods: a jittered lattice, dense enough that the crowns run together.
  const woodish = S.polys.filter(p => p.layer === 'wood' || p.layer === 'estate' || p.layer === 'clump');
  for (const p of woodish) {
    const sp = p.layer === 'estate' ? 6.2 : 5.4;
    const [x0, y0, x1, y1] = p.bbox;
    for (let j = Math.floor(y0 / sp); j * sp <= y1; j++) {
      for (let i = Math.floor(x0 / sp); i * sp <= x1; i++) {
        const r = rng(hash(i, j, 41));
        const x = (i + 0.5 + (r() - 0.5) * 0.9) * sp, y = (j + 0.5 + (r() - 0.5) * 0.9) * sp;
        if (groundAt(x, y) !== p) continue;
        if (p.layer === 'estate') {
          // Parkland: woods in clumps with open glades and lone trees between.
          const n = noise(x, y, 70, 5);
          if (n < 0.32 && r() > 0.06) continue;
        }
        const conifer = r() < 0.12;
        // Near a road a wood's edge trees are smaller, so the wood still
        // reaches the verge instead of stopping short of it.
        let rad = conifer ? 2.4 + r() * 1.2 : 2.9 + r() * 1.8;
        while (rad > 1.6 && !roadClear(x, y, crownReach(rad))) rad -= 0.5;
        addTree(x, y, rad, conifer ? 'conifer' : 'broad', true);
      }
    }
  }

  // Scattered: parks, greens, verges, gardens, open land. One lattice over the map.
  const SCATTER = { park: 0.4, recreation_ground: 0.22, village_green: 0.3, golf: 0.18, meadow: 0.08, grass: 0.24,
    garden: 0.22, allotments: 0.03, playground: 0.12, land: 0.08, sports_centre: 0 };
  {
    const sp = 12;
    for (let j = 0; j * sp < S.height; j++) {
      for (let i = 0; i * sp < S.width; i++) {
        const r = rng(hash(i, j, 51));
        const x = (i + 0.5 + (r() - 0.5) * 0.95) * sp, y = (j + 0.5 + (r() - 0.5) * 0.95) * sp;
        const g = groundAt(x, y);
        let p = SCATTER[g.kind];
        // Open land gets its trees in loose groups, as the countryside does,
        // rather than a sprinkle of singles.
        if (g.kind === 'land') { const n = noise(x, y, 90, 7); p = 0.03 + 0.4 * Math.max(0, n - 0.55) / 0.45; }
        if (!p || r() > p) continue;
        const conifer = r() < 0.1;
        addTree(x, y, conifer ? 2.2 + r() * 1.3 : 3 + r() * 2.6, conifer ? 'conifer' : 'broad', false);
      }
    }
  }

  // Hedgerow trees, every so often along a field hedge.
  for (const [x1, y1, x2, y2, kind] of hedgePieces) {
    if (kind !== 'field') continue;
    const r = rngAt(x1, y1, 61);
    if (r() > 0.07) continue;
    addTree((x1 + x2) / 2 + (r() - 0.5) * 2, (y1 + y2) / 2 + (r() - 0.5) * 2, 3 + r() * 2.4, 'broad', false);
  }

  // Verge trees along the bigger roads, an avenue on the dual carriageway.
  for (const s of roads) {
    if (s.cls === 'track' || s.cls === 'residential') continue;
    const dx = s.bx - s.ax, dy = s.by - s.ay, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    for (const side of [-1, 1]) {
      const r = rng(hash(Math.min(s.i, s.j) * 4099 + Math.max(s.i, s.j), side + 5, 71));
      for (let t = 10; t < len - 10; t += 9 + r() * 8) {
        const rad = 2.8 + r() * 2;
        const off = s.half + VERGE_M + rad + 0.5 + r() * 2;
        const x = s.ax + ux * t - uy * side * off, y = s.ay + uy * t + ux * side * off;
        const g = groundAt(x, y);
        const p = s.cls === 'trunk' ? 0.6 : (g.kind === 'grass' || g.kind === 'land' || g.kind === 'park' || g.kind === 'recreation_ground') ? 0.14 : 0;
        if (r() < p) addTree(x, y, rad, r() < 0.08 ? 'conifer' : 'broad', false);
      }
    }
  }

  // A tree in some back gardens.
  for (const h of houses) {
    if (h.back < 9) continue;
    const r = rng(h.seed ^ 0x5bd1);
    if (r() > 0.45) continue;
    const t = h.d / 2 + h.back * (0.55 + r() * 0.3), a = (r() - 0.5) * h.w * 0.6;
    addTree(h.box.x + h.vx * t + h.ux * a, h.box.y + h.vy * t + h.uy * a, 2.3 + r() * 1.4, r() < 0.2 ? 'conifer' : 'broad', false);
  }

  // Yews round the churchyard, just inside its edge.
  for (const p of S.polys) {
    if (p.kind !== 'churchyard') continue;
    for (const ring of p.rings) {
      const [mx, my] = ringCentroid(ring);
      for (let k = 0; k < ring.length; k += 2) {
        const j = (k + 2) % ring.length, len = Math.hypot(ring[j] - ring[k], ring[j + 1] - ring[k + 1]);
        for (let t = 4; t < len - 3; t += 9) {
          const x = ring[k] + (ring[j] - ring[k]) * t / len, y = ring[k + 1] + (ring[j + 1] - ring[k + 1]) * t / len;
          const l = Math.hypot(mx - x, my - y) || 1, r = rngAt(x, y, 327);
          if (r() < 0.6) addTree(x + (mx - x) / l * 2.6, y + (my - y) / l * 2.6, 2 + r() * 0.9, 'conifer', false);
        }
      }
    }
  }

  // ---- a drive to each real house from its road, beside it where there is
  // room, else a path to its front; a path to each church door
  for (const b of blds) {
    if (!b.real || !b.road || !(b.kind === 'house' || b.kind === 'farmhouse' || b.kind === 'church')) continue;
    const rn = b.road, church = b.kind === 'church';
    if (rn.d > (church ? 45 : 30)) continue;
    let nx = b.cx - rn.px, ny = b.cy - rn.py;
    const nl = Math.hypot(nx, ny);
    if (nl < 1) continue;
    nx /= nl; ny /= nl;
    const tx = -ny, ty = nx, { ux, uy, hu, hv } = b.box;
    const ext = (ax, ay) => Math.abs(ax * ux + ay * uy) * hu + Math.abs(-ax * uy + ay * ux) * hv;
    const front = ext(nx, ny), lat = ext(tx, ty), edge = nl - rn.half + 0.6, r = rng(b.seed ^ 0x3d);
    // a strip `off` across from the middle, from the road's edge to `to` (along n from the middle, negative is towards the road)
    const strip = (off, to, wid) => {
      const ax = b.cx + tx * off - nx * edge, ay = b.cy + ty * off - ny * edge, zx = b.cx + tx * off + nx * to, zy = b.cy + ty * off + ny * to;
      return [[ax - tx * wid / 2, ay - ty * wid / 2], [ax + tx * wid / 2, ay + ty * wid / 2], [zx + tx * wid / 2, zy + ty * wid / 2], [zx - tx * wid / 2, zy - ty * wid / 2]];
    };
    const clear = (pts, self) => {
      const [a, b1, c, d] = pts, out = [];
      for (let k = 0; k <= 8; k++) for (const [p, q] of [[a, d], [b1, c]]) out.push([p[0] + (q[0] - p[0]) * k / 8, p[1] + (q[1] - p[1]) * k / 8]);
      return out.every(([x, y]) => !near(houseGrid, x, y, h => (self || h !== b) && obbPointDist(h.box, x, y) < 0.35));
    };
    if (edge - front < 1.2) continue;   // the house is at the road's edge already
    let drive = null;
    if (!church) {
      const side = r() < 0.5 ? -1 : 1;
      for (const sd of [side, -side]) {
        const pts = strip(sd * (lat + 1.7), front * 0.3, 2.8);
        if (clear(pts, true)) { drive = pts; break; }
      }
    }
    if (!drive) {
      const pts = strip(church ? 0 : (r() - 0.5) * lat * 0.6, -front + 0.1, church ? 1.8 : 1.2);
      if (clear(pts, false)) drive = pts;
    }
    if (drive) { b.drive = drive; b.driveCol = church ? DRIVE[0] : DRIVE[(r() * DRIVE.length) | 0]; BC.drives++; }
  }

  // ---- Glasshouse Acres: each bay cut into sections so none sits on a road
  const glass = [];
  for (const ring of glassBays) {
    const pts = [];
    for (let k = 0; k < 8; k += 2) pts.push([ring[k], ring[k + 1]]);
    const ex = pts[1][0] - pts[0][0], ey = pts[1][1] - pts[0][1], len = Math.hypot(ex, ey);
    const fx = pts[3][0] - pts[0][0], fy = pts[3][1] - pts[0][1], dep = Math.hypot(fx, fy);
    const ux = ex / len, uy = ey / len, n = Math.max(1, Math.round(len / 24));
    for (let k = 0; k < n; k++) {
      const a = len * k / n, b = len * (k + 1) / n - 0.8;
      const cx = pts[0][0] + ux * (a + b) / 2 + fx / 2, cy = pts[0][1] + uy * (a + b) / 2 + fy / 2;
      const box = obb(cx, cy, ux, uy, (b - a) / 2, dep / 2 - 0.4);
      if (obbCorners(box).concat([[cx, cy]]).every(([x, y]) => roadClear(x, y, 0.3))) glass.push({ box });
    }
  }

  // ---- beach huts at Minnis Bay: a real-sized row between the map's markers
  const huts = [];
  const hutEls = doc.getElementById('beach-huts') ? [...doc.getElementById('beach-huts').children] : [];
  const marks = hutEls.map(g => {
    const m = elementMatrix(g);
    const p = mapToWorld(m.e + m.c * 5, m.f + m.d * 5);   // centre of the hut's rect
    const fill = g.querySelector('rect')?.getAttribute('fill') || '#d95b5b';
    return { x: p.x, y: p.y, a: Math.atan2(m.b, m.a), fill };
  });
  for (let k = 0; k + 1 < marks.length; k++) {
    const a = marks[k], b = marks[k + 1], len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.floor(len / 3.4);
    for (let q = 0; q < n; q++) {
      const t = q / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      if (groundAt(x, y) === SEA || !roadClear(x, y, 1.6)) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      huts.push({ box: obb(x, y, Math.cos(ang), Math.sin(ang), 1.2, 1.4), fill: marks[(k + q) % marks.length].fill });
    }
  }

  // ---- bucket everything into cells
  for (const t of trees) cellOf(t.x, t.y)?.trees.push(t);
  for (const h of houses) cellOf(h.box.x, h.box.y)?.houses.push(h);
  for (const p of hedgePieces) cellOf((p[0] + p[2]) / 2, (p[1] + p[3]) / 2)?.hedges.push(p);
  for (const w of walls) cellOf((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2)?.walls.push(w);
  for (const g of glass) cellOf(g.box.x, g.box.y)?.glass.push(g);
  for (const h of huts) cellOf(h.box.x, h.box.y)?.huts.push(h);
  for (const b of blds) cellOf(b.cx, b.cy)?.blds.push(b);
  for (const s of silos) cellOf(s.x, s.y)?.silos.push(s);
  for (const b of bales) cellOf(b.x, b.y)?.bales.push(b);
  for (const s of stones) cellOf(s.box.x, s.box.y)?.stones.push(s);

  S.counts = {
    trees: trees.length, conifers: trees.filter(t => t.kind === 'conifer').length, houses: houses.length,
    hedgeMetres: Math.round(hedgePieces.reduce((a, p) => a + Math.hypot(p[2] - p[0], p[3] - p[1]), 0)),
    walls: walls.length, fields: S.fields.length, polygons: S.polys.length, glasshouses: glass.length, huts: huts.length,
    buildings: BC.real, buildingsMoved: BC.pushed, buildingsLeftOut: BC.dropped, farmBuildingsMade: BC.farmGen,
    silos: BC.silos, bales: BC.bales, headstones: BC.stones, drives: BC.drives, farmyards: yards.length,
    loadMs: Math.round(performance.now() - t0),
  };
  window.__scenery = S.counts;   // for a headless check
  return S;
}

// ---------------------------------------------------------------- per frame

/** The buildings that make a street a town's or a village's: a farm's barns
 *  and sheds, a glasshouse or a caravan by a lane do not. */
const TOWN_KINDS = new Set(['house', 'flats', 'retail', 'church', 'school', 'station', 'hall']);
const TOWN_R = 45;      // metres round the point that count
const TOWN_FULL = 8;    // this many such buildings within TOWN_R is a street; one alone is not

/** How much (x, y) is in a town or village, 0 to 1, for the page's camera
 *  (Marcus, 2026-10-12, 59A: held upright, the camera is so close that the
 *  houses either side barely show): 1 inside an OSM housing area
 *  (buildings.json's landuse=residential), else how near the real houses,
 *  shops, churches and the like within TOWN_R come to TOWN_FULL, a lone
 *  cottage counting for nothing. 0 before loading. */
export function townAt(S, x, y) {
  if (!S || S.failed || !S.cells || !S.inHousing) return 0;
  if (S.inHousing(x, y)) return 1;
  let n = 0;
  const i0 = Math.max(0, Math.floor((x - TOWN_R) / CELL_M)), i1 = Math.min(S.gx - 1, Math.floor((x + TOWN_R) / CELL_M));
  const j0 = Math.max(0, Math.floor((y - TOWN_R) / CELL_M)), j1 = Math.min(S.gy - 1, Math.floor((y + TOWN_R) / CELL_M));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    for (const b of S.cells[j * S.gx + i].blds ?? []) {
      if (b.real && TOWN_KINDS.has(b.kind) && (b.cx - x) ** 2 + (b.cy - y) ** 2 < TOWN_R * TOWN_R && ++n >= TOWN_FULL) return 1;
    }
  }
  return Math.max(0, n - 1) / (TOWN_FULL - 1);
}

/** Cells within the view, with a margin for objects overhanging their cell. */
function visibleCells(S, view) {
  const key = view.cx + ',' + view.cy + ',' + view.radius;
  if (S.frame && S.frame.key === key) return S.frame.cells;
  const r = view.radius + 14, out = [];
  const i0 = Math.max(0, Math.floor((view.cx - r) / CELL_M)), i1 = Math.min(S.gx - 1, Math.floor((view.cx + r) / CELL_M));
  const j0 = Math.max(0, Math.floor((view.cy - r) / CELL_M)), j1 = Math.min(S.gy - 1, Math.floor((view.cy + r) / CELL_M));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const nx = Math.max(i * CELL_M, Math.min(view.cx, (i + 1) * CELL_M)), ny = Math.max(j * CELL_M, Math.min(view.cy, (j + 1) * CELL_M));
    if ((nx - view.cx) ** 2 + (ny - view.cy) ** 2 <= r * r) out.push(S.cells[j * S.gx + i]);
  }
  S.frame = { key, cells: out };
  return out;
}

function inView(bbox, view) {
  const r = view.radius;
  return bbox[2] >= view.cx - r && bbox[0] <= view.cx + r && bbox[3] >= view.cy - r && bbox[1] <= view.cy + r;
}

/** A batch of paths keyed by how they are painted. Order of first use is the
 *  draw order within a pass. */
class Batch {
  constructor() { this.passes = []; }
  get(pass, op, style, width = 0, dash = null) {
    const list = this.passes[pass] || (this.passes[pass] = []);
    const key = op + style + width + (dash ? dash.join() : '');
    let b = list.find(e => e.key === key);
    if (!b) { b = { key, op, style, width, dash, path: new Path2D() }; list.push(b); }
    return b.path;
  }
}
function paintPass(ctx, cells, which, pass) {
  for (const c of cells) {
    const list = c[which] && c[which].passes[pass];
    if (!list) continue;
    for (const e of list) {
      if (e.op === 'fill') { ctx.fillStyle = e.style; ctx.fill(e.path); }
      else {
        ctx.strokeStyle = e.style; ctx.lineWidth = e.width;
        if (e.dash) ctx.setLineDash(e.dash);
        ctx.stroke(e.path);
        if (e.dash) ctx.setLineDash([]);
      }
    }
  }
}

// ------------------------------------------------------------------- ground

/** Under the roads: fields, wood floor, grass, water, sea. */
export function drawGround(ctx, S, view) {
  if (!S || S.failed) return;
  const G = GROUND[view.season] || GROUND.autumn;
  const r = view.radius;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // The sea is where the land is not.
  ctx.fillStyle = G.sea;
  ctx.fillRect(view.cx - r, view.cy - r, 2 * r, 2 * r);
  if (S.land) {
    ctx.strokeStyle = G.seaInk; ctx.lineWidth = 15; ctx.stroke(S.land.path);
    ctx.strokeStyle = G.sand; ctx.lineWidth = 13; ctx.stroke(S.land.path);   // a beach on the sea side
    ctx.fillStyle = G.grass; ctx.fill(S.land.path);
  }

  const cells = visibleCells(S, view);
  for (const c of cells) ensureGround(S, c, view.season);

  // Fields, each its own crop, then their rows.
  for (const f of S.fields) {
    if (!inView(f.bbox, view)) continue;
    ctx.fillStyle = f.pitch ? G.pitchA : cropFor(view.season, f.arable, f.u).fill;
    ctx.fill(f.path);
  }
  paintPass(ctx, cells, 'gcache', 0);

  const fillOf = p => {
    switch (p.layer) {
      case 'green':
        return p.kind === 'pitch' ? null
          : p.kind === 'garden' ? G.garden : p.kind === 'meadow' ? G.meadow
          : p.kind === 'allotments' ? G.allot : p.kind === 'sports_centre' || p.kind === 'playground' ? G.hard
          : p.kind === 'grass' ? G.grass : G.park;
      case 'wood': case 'estate': case 'clump': return G.wood;
      case 'golf': return G.park;
      case 'bunker': return GROUND.summer.sand;
      case 'yard': return G.yard;
      case 'farmyard': return G.farmyard;
      default: return null;
    }
  };
  for (const p of S.polys) {
    if (p.layer === 'land' || p.layer === 'farm' || p.layer === 'pool' || !inView(p.bbox, view)) continue;
    const f = fillOf(p);
    if (!f) continue;
    if (p.layer === 'estate') {
      // Parkland grass with the wood floor only under the clumps (the trees cover it).
      ctx.fillStyle = G.park; ctx.fill(p.path);
      continue;
    }
    ctx.fillStyle = f; ctx.fill(p.path);
    if (p.layer === 'bunker') { ctx.strokeStyle = '#b9a56f'; ctx.lineWidth = 0.25; ctx.stroke(p.path); }
  }
  // Water: ponds ice over in winter, as they do on the map.
  for (const p of S.polys) {
    if (p.layer !== 'pool' || !inView(p.bbox, view)) continue;
    const ice = view.season === 'winter' && p.big;
    ctx.fillStyle = ice ? G.ice : G.pool; ctx.fill(p.path);
    ctx.strokeStyle = ice ? G.iceInk : G.poolInk; ctx.lineWidth = 0.35; ctx.stroke(p.path);
  }

  for (let pass = 1; pass < 6; pass++) paintPass(ctx, cells, 'gcache', pass);
  ctx.restore();
}

/** A cell's ground detail: crop rows, grass tufts, leaf litter, garden plots. */
function ensureGround(S, c, season) {
  if (c.gcache && c.gcache.season === season) return;
  const B = new Batch();
  const G = GROUND[season];
  const idx = S.cells.indexOf(c), ci = idx % S.gx, cj = (idx / S.gx) | 0;
  const x0 = ci * CELL_M, y0 = cj * CELL_M, x1 = x0 + CELL_M, y1 = y0 + CELL_M;

  // Rows: drill rows, furrows, mown stripes, and tramlines through crops.
  for (const fid of c.fieldIds) {
    const f = S.fields[fid];
    const ux = Math.cos(f.rowAngle), uy = Math.sin(f.rowAngle), nx = -uy, ny = ux;
    let sp, w, style, tram = null;
    if (f.pitch) { sp = 6; w = 3; style = G.pitchB; }
    else {
      const crop = cropFor(season, f.arable, f.u);
      if (!crop.rows) continue;
      sp = crop.sp; w = crop.w; style = crop.rows; tram = crop.tram || null;
    }
    const cs = [x0 * nx + y0 * ny, x1 * nx + y0 * ny, x0 * nx + y1 * ny, x1 * nx + y1 * ny];
    const c0 = Math.min(...cs), c1 = Math.max(...cs);
    const path = B.get(0, 'stroke', style, w);
    const tpath = tram ? B.get(0, 'stroke', tram, 0.45) : null;
    const lines = [];
    for (let k = Math.floor(c0 / sp); k * sp <= c1; k++) lines.push([k * sp, path]);
    if (tram) for (let k = Math.floor(c0 / 24); k * 24 <= c1; k++) { lines.push([k * 24 - 0.9, tpath]); lines.push([k * 24 + 0.9, tpath]); }
    for (const [c2, p] of lines) {
      for (const [s0, s1] of lineSpans(f.rings, ux, uy, c2)) {
        // Clip the span to the cell (Liang–Barsky on the parameter s).
        const px = nx * c2, py = ny * c2;
        let a = s0, b = s1;
        for (const [o, d, lo, hi] of [[px, ux, x0, x1], [py, uy, y0, y1]]) {
          if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { a = 1; b = 0; } continue; }
          let t0 = (lo - o) / d, t1 = (hi - o) / d;
          if (t0 > t1) [t0, t1] = [t1, t0];
          a = Math.max(a, t0); b = Math.min(b, t1);
        }
        if (b - a < 0.5) continue;
        p.moveTo(px + ux * a, py + uy * a); p.lineTo(px + ux * b, py + uy * b);
      }
    }
  }

  // Tufts on grass so the ground itself streams past: little star-bursts of
  // blades seen from above, darker and lighter.
  const TUFT = { land: 1, grass: 1, park: 0.55, recreation_ground: 0.55, village_green: 0.55, meadow: 1.5, golf: 0.4, estate: 0.8, garden: 0.45 };
  const dark = B.get(1, 'stroke', G.tuftD, 0.1), light = B.get(1, 'stroke', G.tuftL, 0.1);
  const sp = 3.4;
  for (let j = Math.floor(y0 / sp); j * sp < y1; j++) for (let i = Math.floor(x0 / sp); i * sp < x1; i++) {
    const r = rng(hash(i, j, 81));
    const x = (i + r()) * sp, y = (j + r()) * sp;
    const g = S.groundAt(x, y);
    let dens = TUFT[g.kind] || 0;
    if (g.layer === 'farm') {
      // only pasture fields have tufts; crops show their rows instead
      let f = null;
      for (const k of c.fieldIds) { const ff = S.fields[k]; if (!ff.pitch && inPoly(ff, x, y)) { f = ff; break; } }
      dens = f && !f.arable ? 1.1 : 0;
    }
    if (r() > dens * 0.75) continue;
    const p = r() < 0.62 ? dark : light, n = 4 + ((r() * 3) | 0), rot = r() * 6.3, len = 0.22 + r() * 0.22;
    for (let k = 0; k < n; k++) {
      const a = rot + k / n * 6.283, q = len * (0.7 + r() * 0.5);
      p.moveTo(x, y); p.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
    }
  }

  // Autumn: leaves fallen round each broadleaf, outside its canopy.
  if (season === 'autumn') {
    for (const t of c.trees) {
      if (t.kind !== 'broad') continue;
      const r = rng(t.seed ^ 0x77);
      const p = B.get(2, 'fill', LEAF.autumn[(r() * LEAF.autumn.length) | 0]);
      for (let k = 0; k < 7; k++) {
        const a = r() * Math.PI * 2, d = t.r * (0.9 + r() * 0.6), x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d;
        p.moveTo(x + 0.22, y); p.arc(x, y, 0.22, 0, Math.PI * 2);
      }
    }
  }

  // Water: little ripples on the sea and the ponds; streaks on winter ice.
  {
    const ripple = B.get(1, 'stroke', lighten(G.sea, 0.35), 0.16), deep = B.get(1, 'stroke', darken(G.sea, 0.12), 0.16);
    const streak = season === 'winter' ? B.get(1, 'stroke', '#f6fcfd', 0.22) : null;
    const wsp = 5;
    for (let j = Math.floor(y0 / wsp); j * wsp < y1; j++) for (let i = Math.floor(x0 / wsp); i * wsp < x1; i++) {
      const r = rng(hash(i, j, 87));
      const x = (i + r()) * wsp, y = (j + r()) * wsp;
      const g = S.groundAt(x, y);
      if (g !== SEA && g.layer !== 'pool') continue;
      if (streak && g.big) {
        if (r() < 0.5) continue;
        const l = 1 + r() * 2;
        streak.moveTo(x - l * 0.92, y - l * 0.39); streak.lineTo(x + l * 0.92, y + l * 0.39);
        continue;
      }
      if (r() < 0.35) continue;
      const rr = 0.5 + r() * 0.5, p = r() < 0.6 ? ripple : deep;
      p.moveTo(x + Math.cos(0.5) * rr, y + Math.sin(0.5) * rr); p.arc(x, y, rr, 0.5, Math.PI - 0.5);
    }
  }

  // Garden plots: lawn front and back, a path to the door, a patio.
  const lawn = B.get(3, 'fill', mix(G.garden, '#ffffff', 0.06));
  const paving = B.get(4, 'fill', '#d6ccb4');
  for (const h of c.houses) {
    const { box, w, d, ux, uy, vx, vy, front, back } = h;
    const a = d / 2 + front, b = d / 2 + back;
    polyTo(lawn, [
      [box.x - ux * w / 2 - vx * a, box.y - uy * w / 2 - vy * a], [box.x + ux * w / 2 - vx * a, box.y + uy * w / 2 - vy * a],
      [box.x + ux * w / 2 + vx * b, box.y + uy * w / 2 + vy * b], [box.x - ux * w / 2 + vx * b, box.y - uy * w / 2 + vy * b]]);
    const pa = (h.seed % 7 - 3) / 10 * w;
    const qx = box.x + ux * pa, qy = box.y + uy * pa;
    polyTo(paving, [
      [qx - ux * 0.6 - vx * a, qy - uy * 0.6 - vy * a], [qx + ux * 0.6 - vx * a, qy + uy * 0.6 - vy * a],
      [qx + ux * 0.6, qy + uy * 0.6], [qx - ux * 0.6, qy - uy * 0.6]]);
    if (back >= 6) {
      const e = d / 2 + 2.5;
      polyTo(paving, [
        [box.x - ux * w * 0.35 + vx * d / 2, box.y - uy * w * 0.35 + vy * d / 2], [box.x + ux * w * 0.35 + vx * d / 2, box.y + uy * w * 0.35 + vy * d / 2],
        [box.x + ux * w * 0.35 + vx * e, box.y + uy * w * 0.35 + vy * e], [box.x - ux * w * 0.35 + vx * e, box.y - uy * w * 0.35 + vy * e]]);
    }
  }
  // Glasshouse Acres has paths between its bays; the yard polygon is enough.

  // Drives and paths to the real houses and the church doors.
  for (const b of c.blds) if (b.drive) polyTo(B.get(4, 'fill', b.driveCol), b.drive);

  // Farmyards: packed earth and grit, darker and lighter.
  if (S.polyGrid[idx].some(p => p.layer === 'farmyard')) {
    // Worn patches where the tractors turn, from a noise field.
    const dk = B.get(1, 'fill', G.grit), lt = B.get(1, 'fill', G.gritL), worn = B.get(1, 'fill', mix(G.farmyard, G.grit, 0.16)), gs = 1.4;
    for (let j = Math.floor(y0 / gs); j * gs < y1; j++) for (let i = Math.floor(x0 / gs); i * gs < x1; i++) {
      const r = rng(hash(i, j, 331));
      const x = (i + r()) * gs, y = (j + r()) * gs;
      if (S.groundAt(x, y).layer !== 'farmyard') continue;
      const n = noise(x, y, 7, 333);
      if (n > 0.55) { const wr = 0.9 + (n - 0.55) * 2; worn.moveTo(x + wr, y); worn.arc(x, y, wr, 0, Math.PI * 2); }
      const rr = 0.05 + r() * 0.08, p = r() < 0.5 ? dk : lt;
      p.moveTo(x + rr, y); p.arc(x, y, rr, 0, Math.PI * 2);
    }
  }

  c.gcache = { season, passes: B.passes };
}

// ------------------------------------------------------------------ objects

/** Over the roads, under the guide line, traffic and van: hedges, walls,
 *  roofs, canopies, with their world-space shadows. */
export function drawObjects(ctx, S, view) {
  if (!S || S.failed) return;
  const cells = visibleCells(S, view);
  const sunKey = view.sun.x + ',' + view.sun.y;
  for (const c of cells) ensureObjects(c, view.season, view.sun, sunKey);

  // Shadows: every object's, into one opaque layer, laid down at one alpha.
  const cv = ctx.canvas;
  if (!S.shadow) {
    const el = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cv.width, cv.height) : document.createElement('canvas');
    S.shadow = { el, ctx: el.getContext('2d') };
  }
  const sh = S.shadow;
  if (sh.el.width !== cv.width || sh.el.height !== cv.height) { sh.el.width = cv.width; sh.el.height = cv.height; }
  const sc = sh.ctx, m = ctx.getTransform();
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.clearRect(0, 0, sh.el.width, sh.el.height);
  sc.setTransform(m);
  sc.fillStyle = SHADOW_COLOUR; sc.strokeStyle = SHADOW_COLOUR;
  sc.lineCap = 'round'; sc.lineJoin = 'round';
  for (const c of cells) {
    for (const s of c.cache.shadows) {
      if (s.hs) {
        for (const h of s.hs) {
          sc.setTransform(m); sc.translate(view.sun.x * h, view.sun.y * h);
          if (s.width) { sc.lineWidth = s.width; sc.stroke(s.path); } else sc.fill(s.path);
        }
      } else { sc.setTransform(m); sc.fill(s.path); }
    }
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = SHADOW_ALPHA;
  ctx.drawImage(sh.el, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pass = 0; pass < 20; pass++) paintPass(ctx, cells, 'cache', pass);
  ctx.restore();

  prefetch(S, view, sunKey);
}

/** Build the cells just beyond the view a little at a time, so driving into
 *  one never costs a frame. About 2ms of spare time per frame at most. */
function prefetch(S, view, sunKey) {
  const t0 = performance.now(), r = view.radius + 1.6 * CELL_M;
  const i0 = Math.max(0, Math.floor((view.cx - r) / CELL_M)), i1 = Math.min(S.gx - 1, Math.floor((view.cx + r) / CELL_M));
  const j0 = Math.max(0, Math.floor((view.cy - r) / CELL_M)), j1 = Math.min(S.gy - 1, Math.floor((view.cy + r) / CELL_M));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = S.cells[j * S.gx + i];
    const doneG = c.gcache && c.gcache.season === view.season;
    const doneO = c.cache && c.cache.season === view.season && c.cache.sunKey === sunKey;
    if (doneG && doneO) continue;
    if (!doneG) ensureGround(S, c, view.season);
    if (!doneO) ensureObjects(c, view.season, view.sun, sunKey);
    if (performance.now() - t0 > 2) return;
  }
}

/** A pitched roof on a rectangle, from directly above: facets in three tones
 *  by how they face the sun, courses (tile or slate) or corrugations (metal),
 *  ridge and hips, outline and chimneys; and its shadow, eaves at o.he and
 *  ridge at o.hr. Generated and real houses share it, so they match.
 *  o: { hipped, semi, chimney (-1, 1 one end; 2 both), he, hr } */
function pitchedRect(B, shadows, box, roof, o, sun, Lx, Ly) {
  const { ux, uy } = box;
  const vx = -uy, vy = ux;
  const hu = box.hu, hv = box.hv, cx = box.x, cy = box.y;
  const P = (a, b) => [cx + ux * a + vx * b, cy + uy * a + vy * b];
  const tone = (nx, ny) => {
    const d = nx * Lx + ny * Ly;
    return d > 0.3 ? lighten(roof.base, 0.22) : d < -0.3 ? darken(roof.base, 0.18) : roof.base;
  };
  const facets = [];
  const rl = o.hipped ? Math.max(0, hu - hv) : hu;     // half length of the ridge
  // the two long facets
  facets.push({ pts: [P(-hu, -hv), P(hu, -hv), P(rl, 0), P(-rl, 0)], n: [-vx, -vy], eave: [P(-hu, -hv), P(hu, -hv)], ridgeSide: -1 });
  facets.push({ pts: [P(-hu, hv), P(hu, hv), P(rl, 0), P(-rl, 0)], n: [vx, vy], eave: [P(-hu, hv), P(hu, hv)], ridgeSide: 1 });
  if (o.hipped) {
    facets.push({ pts: [P(-hu, -hv), P(-hu, hv), P(-rl, 0)], n: [-ux, -uy] });
    facets.push({ pts: [P(hu, -hv), P(hu, hv), P(rl, 0)], n: [ux, uy] });
  }
  const metal = roof.kind === 'metal';
  const rowW = roof.kind === 'slate' ? 0.05 : metal ? 0.06 : 0.07;
  const rowsOf = t => B.get(7, 'stroke', darken(t, roof.kind === 'slate' ? 0.2 : metal ? 0.16 : 0.24), rowW);
  const rows = metal ? rowsOf(roof.base) : null;
  for (const f of facets) {
    const t = tone(f.n[0], f.n[1]);
    polyTo(B.get(6, 'fill', t), f.pts);
    if (!f.eave || metal) continue;
    const rows = rowsOf(t);
    // Tile courses parallel to the eave, clipped to the facet's slope.
    for (let k = 1; k * 0.55 < hv - 0.15; k++) {
      const v = (hv - k * 0.55) * f.ridgeSide;
      const inset = o.hipped ? (hv - Math.abs(v)) : 0;
      const a = P(-hu + inset + 0.1, v), b = P(hu - inset - 0.1, v);
      rows.moveTo(a[0], a[1]); rows.lineTo(b[0], b[1]);
    }
  }
  if (metal) {
    // Corrugations down the slope, and a clear roof-light now and then.
    for (let u = -hu + 0.25; u < hu - 0.1; u += 0.34) {
      const a = P(u, -hv + 0.05), b = P(u, hv - 0.05);
      rows.moveTo(a[0], a[1]); rows.lineTo(b[0], b[1]);
    }
    const lite = B.get(7, 'fill', mix(roof.base, '#e6eeeb', 0.38));
    for (let u = -hu + 4; u < hu - 2; u += 7) {
      for (const sd of [-1, 1]) polyTo(lite, [P(u - 0.4, sd * hv * 0.25), P(u + 0.4, sd * hv * 0.25), P(u + 0.4, sd * hv * 0.75), P(u - 0.4, sd * hv * 0.75)]);
    }
  }
  const ink = darken(roof.base, 0.5);
  const ridge = B.get(8, 'stroke', darken(roof.base, 0.35), 0.18);
  const a = P(-rl, 0), b = P(rl, 0);
  ridge.moveTo(a[0], a[1]); ridge.lineTo(b[0], b[1]);
  if (o.hipped) {
    for (const [p, q] of [[P(-hu, -hv), a], [P(-hu, hv), a], [P(hu, -hv), b], [P(hu, hv), b]]) { ridge.moveTo(p[0], p[1]); ridge.lineTo(q[0], q[1]); }
  }
  if (o.semi) {   // the party wall between a pair of semis
    const p = P(0, -hv), q = P(0, hv);
    ridge.moveTo(p[0], p[1]); ridge.lineTo(q[0], q[1]);
  }
  polyTo(B.get(9, 'stroke', ink, 0.2), obbCorners(box));
  const chims = o.semi ? [-0.15, 0.15] : o.chimney === 2 ? [-0.62, 0.62] : o.chimney ? [o.chimney * 0.62] : [];
  const chimPts = [];
  for (const f of chims) {
    const cc = P(f * hu, 0);
    const cb = obbCorners(obb(cc[0], cc[1], ux, uy, 0.5, 0.38));
    polyTo(B.get(10, 'fill', '#9b5e46'), cb);
    polyTo(B.get(11, 'stroke', '#5c3527', 0.12), cb);
    const pot = B.get(11, 'fill', '#4a3a32');
    pot.moveTo(cc[0] + 0.16, cc[1]); pot.arc(cc[0], cc[1], 0.16, 0, Math.PI * 2);
    for (const p of cb) chimPts.push([p[0] + sun.x * (o.hr + 1), p[1] + sun.y * (o.hr + 1)]);
  }
  const corners = obbCorners(box);
  const sp = new Path2D();
  polyTo(sp, hull(corners.concat(corners.map(([x, y]) => [x + sun.x * o.he, y + sun.y * o.he]),
    [a, b].map(([x, y]) => [x + sun.x * o.hr, y + sun.y * o.hr]))));
  if (chimPts.length) polyTo(sp, hull(chimPts.concat(chimPts.map(([x, y]) => [x - sun.x * 2, y - sun.y * 2]))));
  shadows.push({ path: sp });
}

/** Chords of a flat ring along direction (dx, dy) on the line p.(-dy, dx) = c,
 *  as [x0, y0, x1, y1]. */
function chords(ring, dx, dy, c) {
  const nx = -dy, ny = dx;
  return lineSpans([ring], dx, dy, c).map(([s0, s1]) => [dx * s0 + nx * c, dy * s0 + ny * c, dx * s1 + nx * c, dy * s1 + ny * c]);
}

/** A pitched roof on any footprint: the ridge along rb's u axis through its
 *  middle, the footprint split there into two slopes, courses or
 *  corrugations clipped to the outline. An L-shaped house reads as one roof. */
function pitchedPoly(B, shadows, ring, rb, roof, o, sun, Lx, Ly) {
  const { ux, uy } = rb, vx = -uy, vy = ux;
  const vc = rb.x * vx + rb.y * vy, uc = rb.x * ux + rb.y * uy;
  const tone = (nx, ny) => {
    const d = nx * Lx + ny * Ly;
    return d > 0.3 ? lighten(roof.base, 0.22) : d < -0.3 ? darken(roof.base, 0.18) : roof.base;
  };
  const metal = roof.kind === 'metal';
  const rowW = roof.kind === 'slate' ? 0.05 : metal ? 0.06 : 0.07;
  const rowsOf = t => B.get(7, 'stroke', darken(t, roof.kind === 'slate' ? 0.2 : metal ? 0.16 : 0.24), rowW);
  for (const [v0, v1, sd] of [[-1e7, vc, -1], [vc, 1e7, 1]]) {
    const h = clipRingUV(ring, ux, uy, -1e7, 1e7, v0, v1);
    if (!h) continue;
    const t = tone(vx * sd, vy * sd), rows = rowsOf(t);
    flatTo(B.get(6, 'fill', t), h);
    const line = (q) => { rows.moveTo(q[0], q[1]); rows.lineTo(q[2], q[3]); };
    if (metal) {
      for (let u = -rb.hu + 0.25; u < rb.hu - 0.1; u += 0.34) for (const q of chords(h, vx, vy, -(uc + u))) line(q);
    } else {
      for (let k = 1; k * 0.55 < rb.hv + 0.5; k++) for (const q of chords(h, ux, uy, vc + sd * k * 0.55)) line(q);
    }
  }
  const ridge = B.get(8, 'stroke', darken(roof.base, 0.35), 0.18);
  for (const q of chords(ring, ux, uy, vc)) { ridge.moveTo(q[0], q[1]); ridge.lineTo(q[2], q[3]); }
  flatTo(B.get(9, 'stroke', darken(roof.base, 0.5), 0.2), ring);
  const sp = new Path2D();
  sweepTo(sp, ring, sun.x * (o.he + o.hr) / 2, sun.y * (o.he + o.hr) / 2);
  shadows.push({ path: sp });
}

/** A flat roof: felt or asphalt, a paler parapet, roof lights and plant on
 *  the big ones. */
function flatRoof(B, shadows, b, sun) {
  const f = b.flat, ring = b.ring;
  flatTo(B.get(6, 'fill', f.base), ring);
  flatTo(B.get(7, 'stroke', f.parapet, 0.45), ring);
  const { ux, uy, hu, hv } = b.box, vx = -uy, vy = ux;
  const P = (a, c) => [b.box.x + ux * a + vx * c, b.box.y + uy * a + vy * c];
  const inside = pts => pts.every(([x, y]) => inRing(ring, x, y));
  if (b.lights) {
    const lite = B.get(8, 'fill', '#cbd8d6'), lk = B.get(8, 'stroke', '#7f8c8a', 0.06);
    for (let a = -hu + 3; a < hu - 2; a += 5) for (let c = -hv + 2.5; c < hv - 2; c += 4.5) {
      const pts = [P(a - 0.8, c - 0.5), P(a + 0.8, c - 0.5), P(a + 0.8, c + 0.5), P(a - 0.8, c + 0.5)];
      if (inside(pts)) { polyTo(lite, pts); polyTo(lk, pts); }
    }
  }
  if (b.area > 250) {
    // Plant on the roof: a box or two, off the middle.
    const r = rng(b.seed ^ 0x51), plant = B.get(8, 'fill', '#a3a19b'), pk = B.get(9, 'stroke', '#5f5d58', 0.08);
    for (let k = 0; k < 2; k++) {
      const a = (r() - 0.5) * hu * 1.2, c = (r() - 0.5) * hv * 1.2;
      const pts = [P(a - 0.8, c - 0.55), P(a + 0.8, c - 0.55), P(a + 0.8, c + 0.55), P(a - 0.8, c + 0.55)];
      if (inside(pts)) { polyTo(plant, pts); polyTo(pk, pts); }
    }
  }
  flatTo(B.get(9, 'stroke', darken(f.base, 0.45), 0.2), ring);
  const sp = new Path2D();
  sweepTo(sp, ring, sun.x * b.he, sun.y * b.he);
  shadows.push({ path: sp });
}

/** One real (or farm-made) building, by its form. */
function paintBuilding(B, shadows, b, sun, Lx, Ly) {
  const ring = b.ring;
  switch (b.form) {
    case 'flat': flatRoof(B, shadows, b, sun); break;
    case 'caravan': {
      flatTo(B.get(6, 'fill', b.fill), ring);
      const { ux, uy, hu } = b.box, ridge = B.get(7, 'stroke', darken(b.fill, 0.12), 0.12);
      ridge.moveTo(b.box.x - ux * (hu - 0.4), b.box.y - uy * (hu - 0.4)); ridge.lineTo(b.box.x + ux * (hu - 0.4), b.box.y + uy * (hu - 0.4));
      const vent = obbCorners(obb(b.box.x + ux * hu * 0.4, b.box.y + uy * hu * 0.4, ux, uy, 0.3, 0.3));
      polyTo(B.get(8, 'fill', '#b9b6ad'), vent);
      flatTo(B.get(9, 'stroke', darken(b.fill, 0.45), 0.15), ring);
      const sp = new Path2D(); sweepTo(sp, ring, sun.x * b.he, sun.y * b.he); shadows.push({ path: sp });
      break;
    }
    case 'glass': {
      flatTo(B.get(6, 'fill', GLASS.fill), ring);
      const { ux, uy } = b.box, vx = -uy, vy = ux, vc = b.box.x * vx + b.box.y * vy;
      const ridge = B.get(7, 'stroke', GLASS.ridge, 0.12);
      for (let v = -b.box.hv + 1.6; v < b.box.hv; v += 3.2) for (const q of chords(ring, ux, uy, vc + v)) { ridge.moveTo(q[0], q[1]); ridge.lineTo(q[2], q[3]); }
      flatTo(B.get(9, 'stroke', GLASS.ink, 0.2), ring);
      const sp = new Path2D(); sweepTo(sp, ring, sun.x * b.he, sun.y * b.he); shadows.push({ path: sp });
      break;
    }
    case 'canopy': {
      // On posts: its shadow is the roof moved along the sun, not swept.
      flatTo(B.get(6, 'fill', '#dcdedb'), ring);
      flatTo(B.get(9, 'stroke', '#7c807e', 0.15), ring);
      const sp = new Path2D(); posTo(sp, ring, sun.x * b.he, sun.y * b.he); shadows.push({ path: sp });
      break;
    }
    default: {   // pitched, church
      const o = { hipped: !!b.hipped, chimney: b.chimney || 0, he: b.he, hr: b.hr };
      if (b.rect) pitchedRect(B, shadows, b.rbox, b.roof, o, sun, Lx, Ly);
      else pitchedPoly(B, shadows, ring, b.rbox, b.roof, o, sun, Lx, Ly);
    }
  }
  if (b.awningPts) {
    // A shop's awning along its front, striped across.
    const [A, Bp, C, D] = b.awningPts, [c0, c1] = b.awning, n = Math.max(2, Math.round(b.awningLen / 0.55));
    polyTo(B.get(8, 'fill', c1), b.awningPts);
    const st = B.get(8, 'fill', c0);
    const L = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    for (let k = 0; k < n; k += 2) polyTo(st, [L(A, Bp, k / n), L(A, Bp, (k + 1) / n), L(D, C, (k + 1) / n), L(D, C, k / n)]);
    polyTo(B.get(9, 'stroke', darken(c0, 0.4), 0.08), b.awningPts);
  }
  if (b.tower) paintTower(B, shadows, b, sun, Lx, Ly);
}

/** A church tower from above: stone, with a spire, a leaded flat top and
 *  pinnacles, or a little bellcote on the ridge. */
function paintTower(B, shadows, b, sun, Lx, Ly) {
  const t = b.tower, tb = t.box, pts = obbCorners(tb), sp = new Path2D();
  polyTo(B.get(10, 'fill', STONE.fill), pts);
  const ink = B.get(11, 'stroke', STONE.ink, t.top === 'bell' ? 0.12 : 0.2);
  if (t.top === 'bell') {
    polyTo(ink, pts);
    polyTo(sp, hull(pts.concat(pts.map(([x, y]) => [x + sun.x * (b.hr + 2.5), y + sun.y * (b.hr + 2.5)]))));
    shadows.push({ path: sp });
    return;
  }
  polyTo(sp, hull(pts.concat(pts.map(([x, y]) => [x + sun.x * TOWER_H, y + sun.y * TOWER_H]))));
  if (t.top === 'spire') {
    // A broach spire: an octagon of eight slopes rising to a point, each
    // slope its own tone by how it faces the sun.
    const R = tb.hu * 0.94, rot = Math.atan2(tb.uy, tb.ux) + Math.PI / 8, oct = [];
    for (let k = 0; k < 8; k++) { const a = rot + k / 8 * Math.PI * 2; oct.push([tb.x + Math.cos(a) * R, tb.y + Math.sin(a) * R]); }
    for (let k = 0; k < 8; k++) {
      const a = rot + (k + 0.5) / 8 * Math.PI * 2, d = Math.cos(a) * Lx + Math.sin(a) * Ly;
      const col = d > 0.5 ? lighten(STONE.spire, 0.3) : d > 0 ? lighten(STONE.spire, 0.12) : d > -0.5 ? darken(STONE.spire, 0.08) : darken(STONE.spire, 0.22);
      polyTo(B.get(11, 'fill', col), [[tb.x, tb.y], oct[k], oct[(k + 1) % 8]]);
    }
    const seam = B.get(11, 'stroke', darken(STONE.spire, 0.4), 0.07);
    for (const [x, y] of oct) { seam.moveTo(tb.x, tb.y); seam.lineTo(x, y); }
    polyTo(seam, oct);
    const top = B.get(11, 'fill', '#c9a24a');   // the weathercock's gilt
    top.moveTo(tb.x + 0.22, tb.y); top.arc(tb.x, tb.y, 0.22, 0, Math.PI * 2);
    polyTo(sp, hull(oct.map(([x, y]) => [x + sun.x * TOWER_H, y + sun.y * TOWER_H]).concat([[tb.x + sun.x * SPIRE_H, tb.y + sun.y * SPIRE_H]])));
  } else {
    // A leaded flat top inside a parapet, and a pinnacle at each corner.
    const inner = obbCorners(obb(tb.x, tb.y, tb.ux, tb.uy, tb.hu - 0.5, tb.hv - 0.5));
    polyTo(B.get(11, 'fill', STONE.lead), inner);
    for (const [x, y] of obbCorners(obb(tb.x, tb.y, tb.ux, tb.uy, tb.hu - 0.3, tb.hv - 0.3))) {
      const pin = obbCorners(obb(x, y, tb.ux, tb.uy, 0.3, 0.3));
      polyTo(B.get(11, 'fill', lighten(STONE.fill, 0.15)), pin);
      polyTo(sp, hull(pin.map(([px, py]) => [px + sun.x * TOWER_H, py + sun.y * TOWER_H]).concat(pin.map(([px, py]) => [px + sun.x * (TOWER_H + 2), py + sun.y * (TOWER_H + 2)]))));
    }
  }
  polyTo(ink, pts);
  shadows.push({ path: sp });
}

/** A silo from above: a galvanised drum with a shallow cone, seams to the
 *  cap, lit on the sun's side. */
function paintSilo(B, shadows, s, sun, Lx, Ly) {
  const { x, y, r } = s, circ = [];
  for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; circ.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  const body = B.get(6, 'fill', SILO.fill);
  body.moveTo(x + r, y); body.arc(x, y, r, 0, Math.PI * 2);
  const la = Math.atan2(Ly, Lx), lit = B.get(7, 'fill', lighten(SILO.fill, 0.28)), shade = B.get(7, 'fill', darken(SILO.fill, 0.12));
  lit.moveTo(x, y); lit.arc(x, y, r * 0.96, la - Math.PI / 2, la + Math.PI / 2); lit.closePath();
  shade.moveTo(x, y); shade.arc(x, y, r * 0.96, la + Math.PI * 0.7, la + Math.PI * 1.3); shade.closePath();
  const seam = B.get(8, 'stroke', SILO.seam, 0.06);
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    seam.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3); seam.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97);
  }
  seam.moveTo(x + r * 0.62, y); seam.arc(x, y, r * 0.62, 0, Math.PI * 2);
  const cap = B.get(8, 'fill', SILO.cap);
  cap.moveTo(x + r * 0.28, y); cap.arc(x, y, r * 0.28, 0, Math.PI * 2);
  const ink = B.get(9, 'stroke', SILO.ink, 0.2);
  ink.moveTo(x + r, y); ink.arc(x, y, r, 0, Math.PI * 2);
  const sp = new Path2D();
  polyTo(sp, hull(circ.concat(circ.map(([px, py]) => [px + sun.x * SILO_H, py + sun.y * SILO_H]))));
  shadows.push({ path: sp });
}

/** A round bale standing on end: straw rolled in a spiral, or wrapped. */
function paintBale(B, shadows, b, sun, Lx, Ly) {
  const { x, y } = b, r = 0.75, c = b.wrapped ? BALE.wrap : BALE.straw, ink = b.wrapped ? BALE.wrapInk : BALE.strawInk;
  const body = B.get(6, 'fill', c);
  body.moveTo(x + r, y); body.arc(x, y, r, 0, Math.PI * 2);
  const roll = B.get(7, 'stroke', b.wrapped ? lighten(c, 0.3) : darken(c, 0.2), 0.05);
  if (b.wrapped) {
    const la = Math.atan2(Ly, Lx);
    roll.moveTo(x + Math.cos(la - 0.8) * r * 0.6, y + Math.sin(la - 0.8) * r * 0.6); roll.arc(x, y, r * 0.6, la - 0.8, la + 0.8);
  } else {
    for (const q of [0.25, 0.48, 0.7]) { roll.moveTo(x + r * q, y); roll.arc(x, y, r * q, 0, Math.PI * 1.7); }
  }
  const ik = B.get(9, 'stroke', ink, 0.1);
  ik.moveTo(x + r, y); ik.arc(x, y, r, 0, Math.PI * 2);
  const circ = [];
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; circ.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  const sp = new Path2D();
  polyTo(sp, hull(circ.concat(circ.map(([px, py]) => [px + sun.x * 1.2, py + sun.y * 1.2]))));
  shadows.push({ path: sp });
}

/** Turn a cell's objects into painted batches and shadow paths. */
function ensureObjects(c, season, sun, sunKey) {
  if (c.cache && c.cache.season === season && c.cache.sunKey === sunKey) return;
  const B = new Batch(), shadows = [];
  const sl = Math.hypot(sun.x, sun.y) || 1;
  const Lx = -sun.x / sl, Ly = -sun.y / sl;     // towards the sun, on the ground

  // Fences and walls (passes 0-1).
  const fence = new Path2D(), wallShadow = new Path2D();
  for (const w of c.walls) {
    if (w.kind === 'fence') {
      B.get(0, 'stroke', FENCE, 0.14).moveTo(w.x1, w.y1);
      B.get(0, 'stroke', FENCE, 0.14).lineTo(w.x2, w.y2);
      fence.moveTo(w.x1, w.y1); fence.lineTo(w.x2, w.y2);
    } else {
      const s = WALLS[w.kind];
      const ink = B.get(0, 'stroke', s.ink, 0.6), fill = B.get(1, 'stroke', s.fill, 0.36);
      ink.moveTo(w.x1, w.y1); ink.lineTo(w.x2, w.y2);
      fill.moveTo(w.x1, w.y1); fill.lineTo(w.x2, w.y2);
      wallShadow.moveTo(w.x1, w.y1); wallShadow.lineTo(w.x2, w.y2);
    }
  }
  shadows.push({ path: fence, hs: [H.fence], width: 0.12 });
  shadows.push({ path: wallShadow, hs: [H.wall * 0.5, H.wall], width: 0.5 });

  // Hedges (passes 2-5): a chain of overlapping lobes, outlined as one mass,
  // a wash on the sun side of each lobe, and the season's detail on top
  // (hawthorn flower, russet leaves, bare twigs).
  const hedgeShadow = new Path2D(), privetShadow = new Path2D();
  const HC = HEDGE[season], PC = season === 'winter' ? PRIVET_WINTER : PRIVET;
  for (const [x1, y1, x2, y2, kind] of c.hedges) {
    const priv = kind === 'privet', col = priv ? PC : HC;
    const bare = !priv && season === 'winter';
    const wid = priv ? 1.0 : bare ? 1.4 : 1.8;
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const ink = B.get(2, 'stroke', col.ink, 0.36), body = B.get(3, 'fill', col.fill);
    const wash = B.get(4, 'fill', col.hl), dark = B.get(5, 'fill', darken(col.fill, 0.14));
    const r = rngAt(x1, y1, 91), n = Math.max(1, Math.round(l / (wid * 0.42)));
    for (let k = 0; k <= n; k++) {
      const t = k / n, s = (r() - 0.5) * wid * 0.22, rr = wid * (0.42 + r() * 0.14);
      const x = x1 + dx * t + nx * s, y = y1 + dy * t + ny * s;
      ink.moveTo(x + rr, y); ink.arc(x, y, rr, 0, Math.PI * 2);
      body.moveTo(x + rr, y); body.arc(x, y, rr, 0, Math.PI * 2);
      if (bare) continue;
      const wr = rr * 0.5, wx = x + Lx * rr * 0.38, wy = y + Ly * rr * 0.38;
      wash.moveTo(wx + wr, wy); wash.arc(wx, wy, wr, 0, Math.PI * 2);
      if (r() < 0.5) {
        const dr = rr * 0.3, ddx = x - Lx * rr * 0.4 + (r() - 0.5) * rr * 0.4, ddy = y - Ly * rr * 0.4 + (r() - 0.5) * rr * 0.4;
        dark.moveTo(ddx + dr, ddy); dark.arc(ddx, ddy, dr, 0, Math.PI * 2);
      }
    }
    if (bare) {
      // Bare hawthorn from above: a tangle of twigs over the brown mass.
      const tw = B.get(5, 'stroke', HC.ink, 0.07);
      for (let k = 0; k < l * 2.2; k++) {
        const t = r(), s = (r() - 0.5) * wid * 0.8, a = r() * Math.PI, q = 0.25 + r() * 0.35;
        const x = x1 + dx * t + nx * s, y = y1 + dy * t + ny * s;
        tw.moveTo(x - Math.cos(a) * q, y - Math.sin(a) * q); tw.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
      }
    } else if (!priv && season !== 'summer') {
      const dots = B.get(5, 'fill', HC.dots);
      for (let k = 0; k < l * (season === 'spring' ? 2.2 : 1.6); k++) {
        const t = r(), s = (r() - 0.5) * wid * 0.75, rr = 0.07 + r() * 0.07;
        const x = x1 + dx * t + nx * s, y = y1 + dy * t + ny * s;
        dots.moveTo(x + rr, y); dots.arc(x, y, rr, 0, Math.PI * 2);
      }
    }
    (priv ? privetShadow : hedgeShadow).moveTo(x1, y1);
    (priv ? privetShadow : hedgeShadow).lineTo(x2, y2);
  }
  shadows.push({ path: hedgeShadow, hs: [H.hedge * 0.5, H.hedge], width: season === 'winter' ? 1.1 : 1.6 });
  shadows.push({ path: privetShadow, hs: [0.6, 1.2], width: 0.9 });

  // Beach huts (not in winter: they are taken in, as on the map).
  if (season !== 'winter') {
    for (const h of c.huts) {
      const pts = obbCorners(h.box);
      polyTo(B.get(6, 'fill', h.fill), pts);
      polyTo(B.get(9, 'stroke', darken(h.fill, 0.45), 0.18), pts);
      const ridge = B.get(8, 'stroke', darken(h.fill, 0.3), 0.14);
      ridge.moveTo((pts[0][0] + pts[3][0]) / 2, (pts[0][1] + pts[3][1]) / 2); ridge.lineTo((pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2);
      const sp = new Path2D();
      polyTo(sp, hull(pts.concat(pts.map(([x, y]) => [x + sun.x * H.hut, y + sun.y * H.hut]))));
      shadows.push({ path: sp });
    }
  }

  // Glasshouses: glass roofs with ridges every few metres.
  for (const g of c.glass) {
    const pts = obbCorners(g.box), { ux, uy, hu, hv } = g.box;
    polyTo(B.get(6, 'fill', GLASS.fill), pts);
    const ridge = B.get(7, 'stroke', GLASS.ridge, 0.12), hl = B.get(7, 'stroke', GLASS.hl, 0.1);
    for (let v = -hv + 2; v < hv; v += 4) {
      const ax = g.box.x - ux * hu - uy * v, ay = g.box.y - uy * hu + ux * v;
      ridge.moveTo(ax, ay); ridge.lineTo(ax + ux * 2 * hu, ay + uy * 2 * hu);
      hl.moveTo(ax + uy * 0.3, ay - ux * 0.3); hl.lineTo(ax + ux * 2 * hu + uy * 0.3, ay + uy * 2 * hu - ux * 0.3);
    }
    polyTo(B.get(9, 'stroke', GLASS.ink, 0.2), pts);
    const sp = new Path2D();
    polyTo(sp, hull(pts.concat(pts.map(([x, y]) => [x + sun.x * H.glass, y + sun.y * H.glass]))));
    shadows.push({ path: sp });
  }

  // Houses (passes 6-11): roof facets in three tones by how they face the sun,
  // tile rows, ridge and hips, outline, chimney.
  for (const h of c.houses) {
    pitchedRect(B, shadows, h.box, h.roof, { hipped: h.hipped, semi: h.semi, chimney: h.chimney, he: H.house * 0.7, hr: H.house }, sun, Lx, Ly);
  }

  // The real buildings, and the farms' own (passes 6-11; church towers,
  // chimneys and silo caps 10-11).
  for (const b of c.blds) paintBuilding(B, shadows, b, sun, Lx, Ly);
  for (const s of c.silos) paintSilo(B, shadows, s, sun, Lx, Ly);
  for (const b of c.bales) paintBale(B, shadows, b, sun, Lx, Ly);
  if (c.stones.length) {
    const fill = B.get(0, 'fill', HEADSTONE.fill), ink = B.get(1, 'stroke', HEADSTONE.ink, 0.05), sp = new Path2D();
    for (const st of c.stones) {
      const pts = obbCorners(st.box);
      polyTo(fill, pts); polyTo(ink, pts);
      polyTo(sp, hull(pts.concat(pts.map(([x, y]) => [x + sun.x * 0.9, y + sun.y * 0.9]))));
    }
    shadows.push({ path: sp });
  }

  // Trees (passes 12-17). Leafy crowns share one outline pass so a wood reads
  // as one mass with crowns in it; winter broadleaves are bare branches.
  const crown = new Path2D(), limbs = new Path2D(), trunks = new Path2D();
  for (const t of c.trees) {
    const r = rng(t.seed);
    if (t.kind === 'conifer') {
      const col = CONIFER[(r() * CONIFER.length) | 0], n = 9, rr = t.r;
      const pts = [];
      const rot = r() * Math.PI;
      for (let k = 0; k < n * 2; k++) {
        const a = rot + k / (n * 2) * Math.PI * 2, d = k % 2 ? rr * 0.72 : rr;
        pts.push([t.x + Math.cos(a) * d, t.y + Math.sin(a) * d]);
      }
      polyTo(B.get(12, 'stroke', darken(col, 0.45), 0.4), pts);
      polyTo(B.get(13, 'fill', col), pts);
      polyTo(crown, pts);
      // the sun-facing half lighter
      const hl = B.get(14, 'fill', lighten(col, 0.18));
      const hp = [];
      for (let k = 0; k <= n; k++) {
        const a = Math.atan2(Ly, Lx) - Math.PI / 2 + k / n * Math.PI, d = (k % 2 ? 0.5 : 0.75) * rr;
        hp.push([t.x + Math.cos(a) * d, t.y + Math.sin(a) * d]);
      }
      hp.push([t.x, t.y]);
      polyTo(hl, hp);
      trunks.moveTo(t.x, t.y); trunks.lineTo(t.x + sun.x * H.canopyLow * 0.6, t.y + sun.y * H.canopyLow * 0.6);
      continue;
    }
    if (season === 'winter') {
      // Bare crown from above: limbs radiating from the trunk, forking to twigs.
      const haze = B.get(13, 'fill', BARE.haze), lp = B.get(16, 'stroke', BARE.limb, 0.42), tp = B.get(17, 'stroke', BARE.twig, 0.14);
      haze.moveTo(t.x + t.r * 0.95, t.y); haze.arc(t.x, t.y, t.r * 0.95, 0, Math.PI * 2);
      const n = 5 + ((r() * 3) | 0), rot = r() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const a = rot + k / n * Math.PI * 2 + (r() - 0.5) * 0.5;
        const ex = t.x + Math.cos(a) * t.r * 0.55, ey = t.y + Math.sin(a) * t.r * 0.55;
        lp.moveTo(t.x, t.y); lp.lineTo(ex, ey);
        limbs.moveTo(t.x, t.y); limbs.lineTo(ex, ey);
        for (const da of [-0.45, 0.4]) {
          const b = a + da + (r() - 0.5) * 0.3, l = t.r * (0.35 + r() * 0.15);
          const fx = ex + Math.cos(b) * l, fy = ey + Math.sin(b) * l;
          tp.moveTo(ex, ey); tp.lineTo(fx, fy);
          for (const db of [-0.4, 0, 0.4]) {
            const c2 = b + db + (r() - 0.5) * 0.3, l2 = t.r * (0.16 + r() * 0.1);
            tp.moveTo(fx, fy); tp.lineTo(fx + Math.cos(c2) * l2, fy + Math.sin(c2) * l2);
          }
          // and a twig off the middle of the branch
          const mx = (ex + fx) / 2, my = (ey + fy) / 2, c3 = b + (r() < 0.5 ? -0.9 : 0.9);
          tp.moveTo(mx, my); tp.lineTo(mx + Math.cos(c3) * t.r * 0.2, my + Math.sin(c3) * t.r * 0.2);
        }
      }
      const dot = B.get(17, 'fill', BARE.limb);
      dot.moveTo(t.x + 0.32, t.y); dot.arc(t.x, t.y, 0.32, 0, Math.PI * 2);
      trunks.moveTo(t.x, t.y); trunks.lineTo(t.x + sun.x * H.canopyLow * 0.6, t.y + sun.y * H.canopyLow * 0.6);
      continue;
    }
    // Leafy crown.
    let col, dots = null;
    if (season === 'spring' && r() < 0.3) { col = BLOSSOM[(r() * BLOSSOM.length) | 0]; dots = '#fff7f2'; }
    else col = LEAF[season][(r() * LEAF[season].length) | 0];
    const thin = season === 'autumn' && r() < 0.35;
    const ink = darken(col, 0.42), base = B.get(13, 'fill', col), outline = B.get(12, 'stroke', ink, 0.42);
    const wash = B.get(14, 'fill', lighten(col, 0.2)), clump = B.get(15, 'fill', darken(col, 0.13));
    const blobs = [];
    if (thin) {
      // Thinning: the crown breaks into clumps and the branches show between.
      const n = 6, rot = r() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const a = rot + k / n * Math.PI * 2, d = t.r * (0.45 + r() * 0.15);
        blobs.push([t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, t.r * (0.36 + r() * 0.12)]);
      }
      blobs.push([t.x, t.y, t.r * 0.32]);
      const lp = B.get(11, 'stroke', BARE.limb, 0.28);
      for (let k = 0; k < 5; k++) {
        const a = rot + 0.6 + k / 5 * Math.PI * 2;
        lp.moveTo(t.x, t.y); lp.lineTo(t.x + Math.cos(a) * t.r * 0.85, t.y + Math.sin(a) * t.r * 0.85);
      }
    } else {
      // A full crown: a lumpy edge from a ring of overlapping lobes.
      blobs.push([t.x, t.y, t.r * 0.8]);
      const n = 7, rot = r() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const a = rot + k / n * Math.PI * 2, d = t.r * 0.52;
        blobs.push([t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, t.r * (0.42 + r() * 0.08)]);
      }
    }
    for (const [x, y, rr] of blobs) {
      outline.moveTo(x + rr, y); outline.arc(x, y, rr, 0, Math.PI * 2);
      base.moveTo(x + rr, y); base.arc(x, y, rr, 0, Math.PI * 2);
      crown.moveTo(x + rr, y); crown.arc(x, y, rr, 0, Math.PI * 2);
      // A wash only on the lobes that face the sun, so the crown reads as
      // one rounded mass lit from one side.
      const facing = ((x - t.x) * Lx + (y - t.y) * Ly) / (t.r * 0.5);
      if (facing > 0.35 || (thin && facing > 0)) {
        const wr = rr * 0.55, wx = x + Lx * rr * 0.3, wy = y + Ly * rr * 0.3;
        wash.moveTo(wx + wr, wy); wash.arc(wx, wy, wr, 0, Math.PI * 2);
      }
    }
    if (!thin) {
      const wr = t.r * 0.32, wx = t.x + Lx * t.r * 0.28, wy = t.y + Ly * t.r * 0.28;
      wash.moveTo(wx + wr, wy); wash.arc(wx, wy, wr, 0, Math.PI * 2);
    }
    // Leaf clumps: a few darker dabs on the shaded side.
    for (let k = 0; k < 4; k++) {
      const a = Math.atan2(-Ly, -Lx) + (r() - 0.5) * 2.2, d = t.r * (0.25 + r() * 0.45), rr = t.r * (0.13 + r() * 0.08);
      const x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d;
      clump.moveTo(x + rr, y); clump.arc(x, y, rr, 0, Math.PI * 2);
    }
    if (dots) {
      const dp = B.get(16, 'fill', dots);
      for (let k = 0; k < 10; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * t.r * 0.85, rr = 0.18 + r() * 0.12;
        const x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d;
        dp.moveTo(x + rr, y); dp.arc(x, y, rr, 0, Math.PI * 2);
      }
    }
    trunks.moveTo(t.x, t.y); trunks.lineTo(t.x + sun.x * H.canopyLow * 0.6, t.y + sun.y * H.canopyLow * 0.6);
  }
  // A crown's shadow is the crown swept from the bottom of the canopy to its top.
  shadows.push({ path: trunks, hs: [0], width: 0.4 });
  shadows.push({ path: crown, hs: [H.canopyLow, (H.canopyLow + H.canopy) / 2, H.canopy] });
  shadows.push({ path: limbs, hs: [H.canopyLow, H.canopy], width: 0.3 });

  // Every plain shadow in the cell in one path, so a street of roofs is one
  // fill a frame rather than one each. All are wound alike (hull, posTo).
  const plain = new Path2D(), swept = [];
  for (const sh of shadows) { if (sh.hs) swept.push(sh); else plain.addPath(sh.path); }
  swept.push({ path: plain });
  c.cache = { season, sunKey, passes: B.passes, shadows: swept };
}
