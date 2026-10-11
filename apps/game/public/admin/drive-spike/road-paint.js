// road-paint.js — the road's surface and its painted lines, by hand rather than by ruler.
//
// Why it exists: the spike drew every road as one flat grey stroke with crisp
// white lines, and next to scenery.js's painted ground it looked computer
// drawn. Marcus, 2026-10-11: "add suitable tarmac / grit / dust to the road
// surface, and make the white lane lines less perfect". This file is paint
// only: road geometry, widths and lane positions stay the page's.
//
// The contract: drive-spike.html calls load() once in boot() and draw() from
// drawRoads(). draw() returns false when ?road=0 (the old flat look, kept for
// comparison) and drawRoads then draws as before. ?road=1 is subtle and the
// default; ?road=2 is the stronger grit, wear and line imperfection.
//
// Coordinates and drawing are scenery.js's: world metres, ctx already turned
// by the camera. Nothing here is drawn in screen space.
//
// How it is built, so the next person can change it:
//   - Textures are painted once at load onto offscreen canvases and used as
//     patterns scaled to world metres. Because ctx is in world space when we
//     fill, the grit is anchored to the ground and streams past as she
//     drives; a screen-fixed texture would make the road look still while the
//     world turns.
//   - The graph's edges are joined into chains (runs of road between
//     junctions, one class each), and every mark is seeded by distance along
//     its chain, so it is identical every frame and every drive.
//   - Each chain is cut into runs of about RUN_M, and each run turns its marks
//     into one Path2D per layer at load. A frame joins the runs in view into
//     one path per layer (rebuilt only when the view leaves the set it was
//     built for) and fills each once: a dozen fills a frame, whatever the map.
//   - Where a mark would sit on another road's surface at a junction it is
//     left out, so edge lines break across a junction's mouth.

const LEVEL = (() => {
  const q = new URLSearchParams(location.search).get('road');
  return q === '0' ? 0 : q === '2' ? 2 : 1;
})();

/** How hard everything is pushed at each level. */
const T = LEVEL === 2
  ? { grit: 1.8, mottle: 1.7, rag: 1.7, wear: 1.5, wob: 2, widthVar: 0.25, breakAt: 0.8, fadeAt: 0.5, dashSkip: 0.08, patchGap: 0.6 }
  : { grit: 1, mottle: 1, rag: 1, wear: 1, wob: 1, widthVar: 0.15, breakAt: 0.9, fadeAt: 0.62, dashSkip: 0.03, patchGap: 1 };

/** Texture pixels per world metre. At the closest zoom a metre is ~70 device
 *  pixels, so grit is magnified about twice: soft, which suits the paint. */
const K = 32;
const RUN_M = 60;

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
/** Smooth 1D value noise in [0,1) along a road, lattice `scale` metres. */
function noise1(s, scale, salt) {
  const g = s / scale, i = Math.floor(g), f = g - i, u = f * f * (3 - 2 * f);
  const a = hash(i, salt, 7) / 4294967296, b = hash(i + 1, salt, 7) / 4294967296;
  return a + (b - a) * u;
}
/** Tileable 2D value noise in [0,1): a `cells` x `cells` lattice that wraps. */
function tnoise(x, y, cells, salt) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const v = (i, j) => hash(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, salt) / 4294967296;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * sx;
  const b = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * sx;
  return a + (b - a) * sy;
}
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

// ------------------------------------------------------------------- colours

function hex(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mix(a, b, f) {
  const p = hex(a), q = hex(b);
  return '#' + p.map((v, i) => Math.round(v + (q[i] - v) * f).toString(16).padStart(2, '0')).join('');
}
const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };

/** Which surface a road gets. `kind` is the carriageway ('dual', 'divided',
 *  'single') a later job will tag trunk edges with; every trunk edge is drawn
 *  as dual today, so it changes nothing yet. */
export function surfaceFor(cls, kind) {
  if (cls === 'track') return 'track';
  if (cls === 'trunk' || cls === 'primary' || cls === 'secondary') return 'main';
  if (cls === 'tertiary') return 'worn';
  return 'old';
}

/** Base tones. Main roads are newer, darker and smoother; lanes and estate
 *  roads older and greyer-pale; a farm track is earth. */
const BASE = { main: '#56595a', worn: '#686a67', old: '#7a7972', track: '#a08660' };
/** Summer bleaches and dries, winter is damp and dark, autumn a little dark. */
const SEASON_SHIFT = { spring: 0, summer: 0.1, autumn: -0.04, winter: -0.12 };
const DUST = { spring: '#bdae8c', summer: '#d2c198', autumn: '#a8946f', winter: '#9a958c' };
/** scenery.js's grass and tufts, so the track's middle and the trunk's strip
 *  match the verge beside them. */
const GRASS = {
  spring: ['#9ec96a', '#86b456', '#b4d982'], summer: ['#8fbb5c', '#78a54c', '#a8cd70'],
  autumn: ['#98a95c', '#82924c', '#b3b874'], winter: ['#b7c1a6', '#a2ad92', '#d6dccb'],
};
const PAINT = '#f1e7cd';   // warm off-white, as old road paint goes
const LEAVES = ['#c8762e', '#b5532a', '#d9a441', '#8c5a2b', '#a8452a'];

function base(fam, season) {
  const b = BASE[fam], f = SEASON_SHIFT[season] || 0;
  return f >= 0 ? mix(b, fam === 'track' ? '#e8d6ac' : '#d8d2c2', f) : mix(b, '#2a2a2c', -f);
}

// ------------------------------------------------------------------ textures

function canvas(S) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  return [c, c.getContext('2d')];
}
/** Call fn at (x, y) and at its wrapped copies, so a mark near an edge
 *  continues on the far side and the tile has no seam. */
function wrap(S, x, y, r, fn) {
  for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
    const px = x + ox, py = y + oy;
    if (px + r < 0 || py + r < 0 || px - r > S || py - r > S) continue;
    fn(px, py);
  }
}
/** Soft blotches of two tones over the tile: the low-frequency variation
 *  that makes a surface read as painted rather than printed. */
function mottle(g, S, cells, dark, light, amp, salt) {
  const R = 128, [c, m] = canvas(R), img = m.createImageData(R, R), d = img.data;
  const D = hex(dark), L = hex(light);
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const n = 0.65 * tnoise(x / R * cells, y / R * cells, cells, salt) + 0.35 * tnoise(x / R * cells * 2, y / R * cells * 2, cells * 2, salt + 1);
    const t = (n - 0.5) * 2, col = t < 0 ? D : L, k = (y * R + x) * 4;
    d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = Math.min(255, Math.abs(t) * amp * 255);
  }
  m.putImageData(img, 0, 0);
  g.drawImage(c, 0, 0, S, S);
}
/** Patchy alpha: blotches of one colour that come and go. */
function patches(g, S, cells, col, lo, hi, alpha, salt) {
  const R = 128, [c, m] = canvas(R), img = m.createImageData(R, R), d = img.data, C = hex(col);
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const n = 0.6 * tnoise(x / R * cells, y / R * cells, cells, salt) + 0.4 * tnoise(x / R * cells * 3, y / R * cells * 3, cells * 3, salt + 1);
    const k = (y * R + x) * 4, a = clamp01((n - lo) / (hi - lo));
    d[k] = C[0]; d[k + 1] = C[1]; d[k + 2] = C[2]; d[k + 3] = a * a * (3 - 2 * a) * alpha * 255;
  }
  m.putImageData(img, 0, 0);
  g.drawImage(c, 0, 0, S, S);
}
function dots(g, S, r, n, rmin, rmax, colour, salt) {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S, rad = rmin + r() * (rmax - rmin);
    g.fillStyle = colour(r);
    wrap(S, x, y, rad, (px, py) => { g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill(); });
  }
}

function tarmacTile(fam, season) {
  const S = 512, [c, g] = canvas(S), r = rng(hash(fam.length, 11, season.length));
  const b = base(fam, season);
  g.fillStyle = b; g.fillRect(0, 0, S, S);
  const m = fam === 'main' ? 0.7 : fam === 'worn' ? 1 : 1.25;
  mottle(g, S, 6, mix(b, '#1e1f22', 0.5), mix(b, '#e9e2cf', 0.5), 0.13 * m * T.mottle, 21);
  mottle(g, S, 24, mix(b, '#1e1f22', 0.4), mix(b, '#e9e2cf', 0.4), 0.08 * m * T.mottle, 23);
  if (season === 'summer') mottle(g, S, 5, b, DUST.summer, 0.22 * T.mottle, 27);
  // Grit: the aggregate showing through, dark and light chips.
  const n = (fam === 'main' ? 7000 : 9000) * T.grit;
  dots(g, S, r, n, 0.5, 1.3, rr => rr() < 0.65 ? rgba(mix(b, '#141518', 0.3 + rr() * 0.3), 0.3 + rr() * 0.4) : rgba(mix(b, '#f3ecda', 0.2 + rr() * 0.25), 0.2 + rr() * 0.25));
  dots(g, S, r, (fam === 'main' ? 400 : 1200) * T.grit, 1, 2.2, rr => rgba(mix(b, rr() < 0.6 ? '#e6dcc4' : '#3a3734', 0.2 + rr() * 0.25), 0.5));
  if (fam === 'old') {
    // Hairline cracks in old tarmac, wandering, wrapped round the tile.
    g.lineCap = 'round';
    for (let i = 0; i < 7 * T.grit; i++) {
      let x = r() * S, y = r() * S, a = r() * Math.PI * 2;
      const pts = [[x, y]];
      for (let k = 0; k < 10; k++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 9; y += Math.sin(a) * 9; pts.push([x, y]); }
      g.strokeStyle = rgba(mix(b, '#1a1a1c', 0.55), 0.4); g.lineWidth = 0.9;
      for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
        g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)); g.stroke();
      }
    }
  }
  if (season === 'winter') {
    // Salt and grit spread for frost: a sparse speckle, not a frosting.
    dots(g, S, r, 260 * T.grit, 0.5, 1.1, rr => rgba('#f4f1ea', 0.25 + rr() * 0.25));
    dots(g, S, r, 300 * T.grit, 0.6, 1.3, rr => rgba('#8a6f55', 0.35 + rr() * 0.2));
  }
  return c;
}

function earthTile(season) {
  const S = 512, [c, g] = canvas(S), r = rng(hash(5, 13, season.length));
  const b = base('track', season);
  g.fillStyle = b; g.fillRect(0, 0, S, S);
  mottle(g, S, 5, mix(b, '#3b2d1e', 0.5), mix(b, '#efe2c0', 0.5), 0.3 * T.mottle, 31);
  mottle(g, S, 20, mix(b, '#3b2d1e', 0.4), mix(b, '#efe2c0', 0.4), 0.14 * T.mottle, 33);
  // Gravel pressed into the earth: a small dark underside, then the stone.
  for (let i = 0; i < 2600 * T.grit; i++) {
    const x = r() * S, y = r() * S, rad = 0.8 + r() * 1.8;
    const stone = mix(r() < 0.5 ? '#cfc4ad' : '#9a9182', b, 0.25 + r() * 0.3);
    wrap(S, x, y, rad + 1, (px, py) => {
      g.fillStyle = rgba(mix(b, '#2e2316', 0.6), 0.45); g.beginPath(); g.arc(px + 0.5, py + 0.7, rad, 0, 7); g.fill();
      g.fillStyle = stone; g.beginPath(); g.arc(px, py, rad, 0, 7); g.fill();
    });
  }
  dots(g, S, r, 5000 * T.grit, 0.4, 0.9, rr => rgba(rr() < 0.5 ? '#4a3a28' : '#e2d3ad', 0.3 + rr() * 0.3));
  return c;
}

/** The dust, gravel and litter that gathers along a road's edge. Mostly
 *  transparent, so the band it fills breaks up into the verge. */
function vergeTile(fam, season) {
  const S = 512, [c, g] = canvas(S), r = rng(hash(fam.length, 17, season.length));
  const dust = DUST[season];
  for (let i = 0; i < 420; i++) {
    const x = r() * S, y = r() * S, rad = 6 + r() * 14;
    wrap(S, x, y, rad, (px, py) => {
      const gr = g.createRadialGradient(px, py, 0, px, py, rad);
      gr.addColorStop(0, rgba(dust, 0.32)); gr.addColorStop(1, rgba(dust, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, rad, 0, 7); g.fill();
    });
  }
  dots(g, S, r, 3200 * T.grit, 0.6, 1.8, rr => rgba(mix(rr() < 0.5 ? '#d8cdb4' : '#7c7466', dust, rr() * 0.4), 0.55 + rr() * 0.35));
  if (fam === 'old' || fam === 'track') {
    // Twigs and bits of hedge.
    g.lineCap = 'round';
    for (let i = 0; i < 160; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI, l = 3 + r() * 6;
      g.strokeStyle = rgba(r() < 0.6 ? '#5a4632' : '#7b6a3e', 0.7); g.lineWidth = 0.8;
      wrap(S, x, y, l, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
    }
  }
  if (season === 'autumn') {
    for (let i = 0; i < 700 * T.grit; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI, rl = 2.2 + r() * 1.8;
      const col = LEAVES[(r() * LEAVES.length) | 0];
      wrap(S, x, y, rl, (px, py) => {
        g.save(); g.translate(px, py); g.rotate(a);
        g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, rl, rl * 0.55, 0, 0, 7); g.fill();
        g.strokeStyle = rgba('#5a3418', 0.5); g.lineWidth = 0.4; g.stroke();
        g.restore();
      });
    }
  }
  if (season === 'winter') dots(g, S, r, 300 * T.grit, 0.6, 1.4, rr => rgba('#f2efe8', 0.3 + rr() * 0.3));
  return c;
}

/** Polished patches where tyres run (pale), or the ruts of a track (dark). */
function wearTile(col, salt, alpha) {
  const S = 512, [c, g] = canvas(S);
  patches(g, S, 7, col, 0.28, 0.62, alpha, salt);
  return c;
}

function grassTile(season) {
  const S = 256, [c, g] = canvas(S), r = rng(hash(3, 19, season.length));
  const [gr, d, l] = GRASS[season];
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  mottle(g, S, 4, d, l, 0.4, 41);
  g.lineCap = 'round'; g.lineWidth = 0.9;
  for (let i = 0; i < 700; i++) {
    const x = r() * S, y = r() * S, col = r() < 0.5 ? d : l;
    g.strokeStyle = col;
    wrap(S, x, y, 5, (px, py) => {
      g.beginPath();
      for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + (k - 1.5) * 0.5; g.moveTo(px, py); g.lineTo(px + Math.cos(a) * 4, py + Math.sin(a) * 4); }
      g.stroke();
    });
  }
  return c;
}

/** Road paint: warm off-white, speckled through where it has worn. */
function paintTile() {
  const S = 256, [c, g] = canvas(S), r = rng(hash(9, 23, 1));
  g.fillStyle = PAINT; g.fillRect(0, 0, S, S);
  mottle(g, S, 6, '#cfc4a8', '#fffaf0', 0.35, 51);
  g.globalCompositeOperation = 'destination-out';
  patches(g, S, 5, '#000000', 0.45, 0.9, 0.45 * T.wear, 53);
  dots(g, S, r, 1500 * T.grit, 0.5, 1.3, rr => rgba('#000000', 0.5 + rr() * 0.5));
  g.globalCompositeOperation = 'source-over';
  return c;
}

/** Patch repairs: newer, darker, smoother tarmac. */
function patchTile(season) {
  const S = 256, [c, g] = canvas(S), r = rng(hash(7, 29, season.length));
  const b = mix(base('main', season), '#1c1d20', 0.16);
  g.fillStyle = b; g.fillRect(0, 0, S, S);
  mottle(g, S, 4, mix(b, '#111', 0.4), mix(b, '#ddd', 0.3), 0.1, 61);
  dots(g, S, r, 1500, 0.4, 0.9, rr => rgba(mix(b, '#eee', 0.3), 0.3 + rr() * 0.3));
  return c;
}

// ------------------------------------------------------------------ geometry

let P = null;   // everything load() builds; null at ?road=0

/** Segment index holding distance s along a chain. */
function seg(ch, s) {
  const ss = ch.ss;
  let lo = 0, hi = ss.length - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ss[m] <= s) lo = m; else hi = m - 1; }
  return lo;
}

/** The chain's centreline from sa to sb shifted sideways by off(s) metres,
 *  as a flat [x, y, x, y...] list. At a sharp corner the outside goes round
 *  in an arc, as the old round-jointed stroke did, and the inside stops at
 *  the true corner: points that would run past it are taken back, so an
 *  offset line never loops over itself in an X (nor a band into a hole). */
function side(ch, sa, sb, step, off) {
  const { xs, ys, ss, tx, ty, mx, my, turn } = ch;
  const nseg = ss.length - 1, out = [];
  let k = seg(ch, sa), lx = 0, ly = 0, have = false;
  const push = (qx, qy) => { out.push(qx, qy); lx = qx; ly = qy; have = true; };
  const put = (s, kk) => {
    const dx = tx[kk], dy = ty[kk], u = s - ss[kk], o = off(s);
    const qx = xs[kk] + dx * u - dy * o, qy = ys[kk] + dy * u + dx * o;
    if (have && (qx - lx) * dx + (qy - ly) * dy <= 1e-4) return;   // still behind the corner
    push(qx, qy);
  };
  const corner = (s, v) => {
    const o = off(s), px = xs[v], py = ys[v];
    if (turn[v] < 0.3) { push(px + mx[v] * o, py + my[v] * o); return; }
    const ax = tx[v - 1], ay = ty[v - 1], bx = tx[v], by = ty[v];
    if (o * (ax * by - ay * bx) > 0) {
      // Inside: the two offset lines meet at the unclamped mitre point.
      let nx = -(ay + by), ny = ax + bx;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      const f = Math.min(6, 1 / Math.max(0.17, nx * -ay + ny * ax));
      const ix = px + nx * f * o, iy = py + ny * f * o;
      while (out.length >= 2 && (out[out.length - 2] - ix) * ax + (out[out.length - 1] - iy) * ay > -1e-4) out.length -= 2;
      push(ix, iy);
    } else {
      // Outside: an arc from one segment's normal to the next.
      const a0 = Math.atan2(ax, -ay);
      let da = Math.atan2(bx, -by) - a0;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const m = Math.max(2, Math.ceil(Math.abs(da) / 0.25));
      for (let i = 0; i <= m; i++) { const a = a0 + da * i / m; push(px + Math.cos(a) * o, py + Math.sin(a) * o); }
    }
  };
  put(sa, k);
  let s = sa;
  while (s < sb - 1e-6) {
    let ns = Math.min(sb, s + step);
    if (k < nseg - 1 && ns >= ss[k + 1] - 1e-6) {
      if (ss[k + 1] < sb - 1e-6) { s = ss[k + 1]; k++; corner(s, k); continue; }
      ns = sb;
    }
    put(ns, k); s = ns;
  }
  return out;
}

/** A filled band between offsets lo(s) and hi(s), into path. */
function band(path, ch, sa, sb, step, lo, hi) {
  if (sb - sa < 0.05) return;
  const a = side(ch, sa, sb, step, hi), b = side(ch, sa, sb, step, lo);
  if (a.length < 4 || b.length < 4) return;
  path.moveTo(a[0], a[1]);
  for (let i = 2; i < a.length; i += 2) path.lineTo(a[i], a[i + 1]);
  for (let i = b.length - 2; i >= 0; i -= 2) path.lineTo(b[i], b[i + 1]);
  path.closePath();
}

/** Where along [sa, sb] a mark at offset off(s) is clear of every other road
 *  meeting this chain's ends, as a list of [from, to]. */
function clear(ch, sa, sb, off) {
  const near = 45;
  if ((!ch.nbA.length || sa > near) && (!ch.nbB.length || sb < ch.len - near)) return [[sa, sb]];
  const res = [];
  let start = null;
  for (let s = sa; ; s = Math.min(sb, s + 0.4)) {
    const ok = !covered(ch, s, off(s));
    if (ok && start === null) start = s;
    if (!ok && start !== null) { res.push([start, s]); start = null; }
    if (s >= sb) break;
  }
  if (start !== null) res.push([start, sb]);
  return res;
}
function covered(ch, s, o) {
  const list = s < 45 ? ch.nbA : s > ch.len - 45 ? ch.nbB : null;
  if (!list || !list.length) return false;
  const k = seg(ch, s), u = s - ch.ss[k];
  const x = ch.xs[k] + ch.tx[k] * u - ch.ty[k] * o, y = ch.ys[k] + ch.ty[k] * u + ch.tx[k] * o;
  for (const [ax, ay, bx, by, h] of list) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? clamp01(((x - ax) * dx + (y - ay) * dy) / L) : 0;
    const ex = ax + dx * t - x, ey = ay + dy * t - y;
    if (ex * ex + ey * ey < (h + 0.15) * (h + 0.15)) return true;
  }
  return false;
}
/** band(), but only where the band's middle is clear of other roads. */
function bandClear(path, ch, sa, sb, step, lo, hi) {
  for (const [a, b] of clear(ch, sa, sb, s => (lo(s) + hi(s)) / 2)) band(path, ch, a, b, step, lo, hi);
}

/** Ragged-edge wobble, metres, along s. */
function rag(s, salt, amp) {
  return amp * ((noise1(s, 2.6, salt) - 0.5) * 1.3 + (noise1(s, 0.7, salt + 1) - 0.5) * 0.7);
}

function buildChains(graph, nodeXY) {
  const N = graph.nodes.length, xy = graph.nodes.map(nodeXY);
  const adj = Array.from({ length: N }, () => []);
  const seen = new Set(), edges = [];
  for (const [i, j, cls] of graph.edges) {
    if (i < 0 || j < 0 || i >= N || j >= N || i === j) continue;
    const key = Math.min(i, j) * 65536 + Math.max(i, j);
    if (seen.has(key)) continue;
    seen.add(key);
    const k = edges.length;
    edges.push(cls); adj[i].push({ j, cls, k }); adj[j].push({ j: i, cls, k });
  }
  const used = new Uint8Array(edges.length), chains = [];
  const isBreak = n => adj[n].length !== 2 || adj[n][0].cls !== adj[n][1].cls;
  const walk = (n, e) => {
    const nodes = [n];
    let cur = n;
    for (;;) {
      used[e.k] = 1; nodes.push(e.j); cur = e.j;
      if (isBreak(cur)) break;
      const nx = adj[cur].find(x => !used[x.k]);
      if (!nx) break;
      e = nx;
    }
    chains.push({ nodes, cls: e.cls });
  };
  for (let n = 0; n < N; n++) if (isBreak(n)) for (const e of adj[n]) if (!used[e.k]) walk(n, e);
  for (let n = 0; n < N; n++) for (const e of adj[n]) if (!used[e.k]) walk(n, e);
  return { chains, xy };
}

function makeChain(c, xy, roadWidth) {
  const pts = [];
  for (const n of c.nodes) {
    const [x, y] = xy[n];
    if (pts.length && Math.hypot(x - pts[pts.length - 1][0], y - pts[pts.length - 1][1]) < 0.05) continue;
    pts.push([x, y]);
  }
  if (pts.length < 2) return null;
  const n = pts.length;
  const xs = new Float64Array(n), ys = new Float64Array(n), ss = new Float64Array(n);
  const tx = new Float64Array(n - 1), ty = new Float64Array(n - 1), mx = new Float64Array(n), my = new Float64Array(n);
  const turn = new Float64Array(n);
  for (let i = 0; i < n; i++) { xs[i] = pts[i][0]; ys[i] = pts[i][1]; }
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i], dy = ys[i + 1] - ys[i], l = Math.hypot(dx, dy);
    tx[i] = dx / l; ty[i] = dy / l; ss[i + 1] = ss[i] + l;
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 2, i);
    let nx = -(ty[a] + ty[b]), ny = tx[a] + tx[b];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    const cosH = nx * -ty[b] + ny * tx[b];      // cos of half the turn
    const f = 1 / Math.max(0.5, cosH);          // mitre, clamped at twice the offset
    mx[i] = nx * f; my[i] = ny * f;
    turn[i] = Math.acos(Math.max(-1, Math.min(1, tx[a] * tx[b] + ty[a] * ty[b])));
  }
  const first = c.nodes[0], last = c.nodes[c.nodes.length - 1];
  return {
    cls: c.cls, fam: surfaceFor(c.cls), half: roadWidth(c.cls) / 2,
    xs, ys, ss, tx, ty, mx, my, turn, len: ss[n - 1],
    first, last, seed: hash(Math.min(first, last), Math.max(first, last), c.nodes.length),
    nbA: [], nbB: [],
  };
}

/** Each chain end learns the segments of the other roads that meet it there,
 *  so its marks can stop at their edge. */
function linkJunctions(chains) {
  const at = new Map();
  for (const ch of chains) for (const end of [0, 1]) {
    const node = end ? ch.last : ch.first;
    if (!at.has(node)) at.set(node, []);
    at.get(node).push([ch, end]);
  }
  const near = (ch, end) => {
    const out = [], n = ch.xs.length;
    for (let i = 0; i < n - 1; i++) {
      const s0 = end ? ch.len - ch.ss[i + 1] : ch.ss[i];
      if (s0 > 60) continue;
      out.push([ch.xs[i], ch.ys[i], ch.xs[i + 1], ch.ys[i + 1], ch.half]);
    }
    return out;
  };
  for (const list of at.values()) {
    for (const [ch, end] of list) for (const [o, oe] of list) {
      if (o === ch && oe === end) continue;
      if (o === ch) continue;
      (end ? ch.nbB : ch.nbA).push(...near(o, oe));
    }
  }
}

// ------------------------------------------------------------- marks per run

const LANE_PAINT_W = 0.28, EDGE_PAINT_W = 0.3, TRUNK_EDGE_W = 0.25;

/** One painted line along a run: continuous, or dashed [on, gap]. Width,
 *  wobble, wear and breaks all come from distance along the chain. */
function line(R, ch, r0, r1, off, w, dash, salt) {
  const sd = ch.seed + salt * 977;
  const wob = s => off + 0.045 * T.wob * ((noise1(s, 2.3, sd + 1) - 0.5) * 1.4 + (noise1(s, 0.9, sd + 2) - 0.5) * 0.6);
  const wmul = s => 1 + T.widthVar * 2 * (noise1(s, 3.1, sd + 3) - 0.5) * 1.4;
  if (!dash) {
    // Worn thin, then broken, where this noise runs high.
    const thin = s => {
      const v = noise1(s, 11, sd + 5);
      return v < 0.7 ? 1 : v > T.breakAt + 0.04 ? 0 : v > T.breakAt - 0.04 ? (T.breakAt + 0.04 - v) / 0.08 * 0.55 : 1 - 0.45 * (v - 0.7) / (T.breakAt - 0.74);
    };
    const bucket = s => { const v = noise1(s, 17, sd + 7); return v > T.fadeAt + 0.22 ? 2 : v > T.fadeAt ? 1 : 0; };
    const hw = s => w / 2 * wmul(s) * thin(s);
    // Split [r0, r1] where the fade bucket changes, each piece to its layer.
    let a = r0, b0 = bucket(r0);
    for (let s = r0 + 1; ; s = Math.min(r1, s + 1)) {
      const b = s >= r1 ? -1 : bucket(s);
      if (b !== b0) {
        bandClear(R.get('paint' + b0), ch, a, s, 0.5, t => wob(t) - hw(t), t => wob(t) + hw(t));
        a = s; b0 = b;
      }
      if (s >= r1) break;
    }
    return;
  }
  const [on, gap] = dash, period = on + gap;
  const phase = (ch.seed % 1000) / 1000 * period;
  for (let k = Math.ceil((r0 - phase) / period); phase + k * period < r1; k++) {
    const c = phase + k * period;
    if (c - on < 0 || c + on > ch.len) continue;
    const r = rng(hash(ch.seed, k, salt));
    if (r() < T.dashSkip) continue;
    const j = 0.4 * T.wob;
    const s0 = c - on / 2 + (r() - 0.5) * j, s1 = c + on / 2 + (r() - 0.5) * j;
    // Uneven ends: each edge of the dash starts and stops a little apart.
    const e = 0.16 * T.wob, la = s0 + (r() - 0.5) * e, lb = s1 + (r() - 0.5) * e;
    const ra = s0 + (r() - 0.5) * e, rb = s1 + (r() - 0.5) * e;
    if (covered(ch, s0, off) || covered(ch, s1, off) || covered(ch, c, off)) continue;
    const dw = 1 + (r() - 0.5) * T.widthVar * 1.2;
    const fade = noise1(c, 17, ch.seed + salt * 977 + 7) + (r() - 0.5) * 0.25;
    const b = fade > T.fadeAt + 0.22 ? 2 : fade > T.fadeAt ? 1 : 0;
    const hw = s => w / 2 * dw * wmul(s);
    const L = side(ch, la, lb, 0.4, s => wob(s) + hw(s)), Rr = side(ch, ra, rb, 0.4, s => wob(s) - hw(s));
    if (L.length < 4 || Rr.length < 4) continue;
    // Each end is a brush lifting off: bulged or dragged a little at its middle.
    const tip = s => side(ch, s, s + 0.01, 1, wob);
    const e1 = tip(Math.min(ch.len - 0.02, Math.max(0, (lb + rb) / 2 + (r() - 0.3) * 0.12 * T.wob)));
    const e0 = tip(Math.min(ch.len - 0.02, Math.max(0, (la + ra) / 2 - (r() - 0.3) * 0.12 * T.wob)));
    const p = R.get('paint' + b);
    p.moveTo(L[0], L[1]);
    for (let i = 2; i < L.length; i += 2) p.lineTo(L[i], L[i + 1]);
    p.lineTo(e1[0], e1[1]);
    for (let i = Rr.length - 2; i >= 0; i -= 2) p.lineTo(Rr[i], Rr[i + 1]);
    p.lineTo(e0[0], e0[1]);
    p.closePath();
  }
}

function buildRun(ch, r0, r1, trunk) {
  const layers = new Map();
  const R = { get: name => { let p = layers.get(name); if (!p) { p = new Path2D(); layers.set(name, p); } return p; } };
  const { fam, half, seed } = ch;
  const a = Math.max(0, r0 - 0.05), b = Math.min(ch.len, r1 + 0.05);   // a hair of overlap, no seams

  // The surface, its edges a little ragged, with a disc at each junction and
  // sharp corner so the round join the old stroke gave is kept.
  const amp = { main: 0.05, worn: 0.09, old: 0.13, track: 0.22 }[fam] * T.rag;
  const surf = R.get(fam + ':surface');
  band(surf, ch, a, b, 0.8, s => -half - rag(s, seed + 11, amp), s => half + rag(s, seed + 13, amp));
  for (let i = 0; i < ch.xs.length; i++) {
    const s = ch.ss[i];
    if (s < r0 - 0.01 || s >= r1 - 0.01 && !(i === ch.xs.length - 1 && s <= r1 + 0.01)) continue;
    if (i === 0 || i === ch.xs.length - 1 || ch.turn[i] > 0.3) {
      surf.moveTo(ch.xs[i] + half, ch.ys[i]);
      surf.arc(ch.xs[i], ch.ys[i], half, 0, Math.PI * 2, true);   // same winding as the bands
    }
  }

  // Dust and gravel feathering the edge into the verge (and, on old roads,
  // collecting a way in from the edge).
  const [inner, outer] = { main: [0.3, 0.45], worn: [0.55, 0.55], old: [1.0, 0.6], track: [0.5, 0.75] }[fam];
  const vg = R.get(fam + ':verge');
  for (const sgn of [1, -1]) {
    const so = seed + (sgn > 0 ? 21 : 25);
    const lo = s => half - inner * (0.6 + 0.8 * noise1(s, 4.5, so)) + rag(s, so + 1, amp);
    const hi = s => half + outer * (0.6 + 0.8 * noise1(s, 3.7, so + 2)) + rag(s, so + 3, amp);
    if (sgn > 0) bandClear(vg, ch, a, b, 0.8, lo, hi);
    else bandClear(vg, ch, a, b, 0.8, s => -hi(s), s => -lo(s));
  }

  if (fam === 'track') {
    // Two wheel ruts, clearly darker, and the grass strip between them.
    for (const c of [-0.85, 0.85]) {
      const so = seed + (c > 0 ? 31 : 35);
      const mid = s => c + 0.12 * (noise1(s, 6, so) - 0.5) * 2;
      bandClear(R.get('track:ruts'), ch, a, b, 0.6,
        s => mid(s) - 0.27 * (0.7 + 0.6 * noise1(s, 1.4, so + 1)), s => mid(s) + 0.27 * (0.7 + 0.6 * noise1(s, 1.6, so + 2)));
    }
    const gw = s => 0.38 * (0.55 + 0.7 * noise1(s, 2.2, seed + 41)) * clamp01((noise1(s, 13, seed + 43) - 0.12) / 0.15);
    bandClear(R.get('track:grass'), ch, a, b, 0.6,
      s => -gw(s) + 0.08 * (noise1(s, 5, seed + 45) - 0.5), s => gw(s) + 0.08 * (noise1(s, 5, seed + 45) - 0.5));
    return layers;
  }

  // Polished bands where the tyres run: two per lane, wandering and patchy.
  const lanes = ch.cls === 'trunk'
    ? [1, -1].flatMap(sg => [sg * (trunk.reservation / 2 + trunk.lane / 2), sg * (trunk.reservation / 2 + trunk.lane * 1.5)])
    : [half / 2, -half / 2];
  const wear = R.get(fam + ':wear');
  lanes.forEach((lc, li) => {
    for (const d of [-0.8, 0.8]) {
      const so = seed + 51 + li * 8 + (d > 0 ? 4 : 0);
      const mid = s => lc + d + 0.14 * (noise1(s, 7, so) - 0.5) * 2;
      const gate = s => { const g = clamp01((noise1(s, 9, so + 1) - 0.25) / 0.3); return g * g * (3 - 2 * g); };
      bandClear(wear, ch, a, b, 0.7,
        s => mid(s) - 0.4 * (0.6 + 0.7 * noise1(s, 1.3, so + 2)) * gate(s),
        s => mid(s) + 0.4 * (0.6 + 0.7 * noise1(s, 1.5, so + 3)) * gate(s));
    }
  });

  if (fam === 'main') {
    // Patch repairs: squared-off rectangles of newer tarmac, a lane wide or less.
    const r = rng(hash(seed, 61, 0));
    for (let s = 6 + r() * 30; s < ch.len - 6; s += (14 + r() * 36) * T.patchGap) {
      const len = 1.4 + r() * 3.2, lc = lanes[(r() * lanes.length) | 0], c = lc + (r() - 0.5) * 1.6, w = 1 + r() * 2;
      const j = r() * 0.15, ps = seed + Math.round(s * 10);
      if (s < r0 || s >= r1 || covered(ch, s, c) || covered(ch, s + len, c)) continue;
      // Hand-cut, so no side is quite straight, parallel or square to the road.
      const q = rng(ps), e = () => (q() - 0.5) * 0.5;
      const L = side(ch, s + e(), s + len + e(), 0.4, t => c + w / 2 + j * (1 - (t - s) / len) + rag(t, ps + 3, 0.07));
      const Rr = side(ch, s + e(), s + len + e(), 0.4, t => c - w / 2 - j * (t - s) / len + rag(t, ps, 0.07));
      if (L.length < 4 || Rr.length < 4) continue;
      const p = R.get('main:patch');
      p.moveTo(L[0], L[1]);
      for (let i = 2; i < L.length; i += 2) p.lineTo(L[i], L[i + 1]);
      for (let i = Rr.length - 2; i >= 0; i -= 2) p.lineTo(Rr[i], Rr[i + 1]);
      p.closePath();
    }
  }

  if (ch.cls === 'trunk') {
    // The grass strip down the middle, with a kerb line each side of it.
    const hr = trunk.reservation / 2;
    bandClear(R.get('reserve'), ch, a, b, 0.8, s => -hr - rag(s, seed + 71, 0.06), s => hr + rag(s, seed + 73, 0.06));
    line(R, ch, r0, r1, hr + 0.2, TRUNK_EDGE_W, null, 1);
    line(R, ch, r0, r1, -hr - 0.2, TRUNK_EDGE_W, null, 2);
    line(R, ch, r0, r1, hr + trunk.lane, LANE_PAINT_W, [3, 4], 3);
    line(R, ch, r0, r1, -hr - trunk.lane, LANE_PAINT_W, [3, 4], 4);
    line(R, ch, r0, r1, half - 0.4, TRUNK_EDGE_W, null, 5);
    line(R, ch, r0, r1, -(half - 0.4), TRUNK_EDGE_W, null, 6);
  } else {
    line(R, ch, r0, r1, half - 0.4, EDGE_PAINT_W, null, 5);
    line(R, ch, r0, r1, -(half - 0.4), EDGE_PAINT_W, null, 6);
    line(R, ch, r0, r1, 0, LANE_PAINT_W, [3, 4], 7);
  }
  return layers;
}

// ---------------------------------------------------------------- contract

/** Build the textures and every run's marks. Call once, after the graph is
 *  loaded. world: { graph, nodeXY(node) -> [x, y] metres, roadWidth(cls),
 *  season, trunk: { lane, reservation } }. Does nothing at ?road=0. */
export function load(world) {
  if (LEVEL === 0) return null;
  const t0 = performance.now();
  const season = world.season || 'summer';
  const { chains: raw, xy } = buildChains(world.graph, world.nodeXY);
  const chains = raw.map(c => makeChain(c, xy, world.roadWidth)).filter(Boolean);
  linkJunctions(chains);

  const pat = (c, scale = 1 / K) => {
    const p = world.ctx.createPattern(c, 'repeat');
    p.setTransform(new DOMMatrix().scale(scale));   // tile pixels to world metres
    return p;
  };
  const fams = ['track', 'old', 'worn', 'main'];
  const fill = new Map();
  for (const f of fams) {
    fill.set(f + ':surface', [pat(f === 'track' ? earthTile(season) : tarmacTile(f, season)), 1]);
    fill.set(f + ':verge', [pat(vergeTile(f, season)), f === 'main' ? 0.7 : 0.9]);
    if (f !== 'track') fill.set(f + ':wear', [null, { main: 0.3, worn: 0.65, old: 0.55 }[f] * Math.min(1, 0.7 * T.wear)]);
  }
  const wearP = pat(wearTile(mix(base('worn', season), '#f0eadb', 0.45), 81, 0.8));
  for (const f of ['old', 'worn', 'main']) fill.get(f + ':wear')[0] = wearP;
  fill.set('track:ruts', [pat(wearTile(mix(base('track', season), '#2b1f12', season === 'winter' ? 0.5 : 0.42), 83, 1)), Math.min(1, 0.85 * T.wear)]);
  const grass = pat(grassTile(season));
  fill.set('track:grass', [grass, 1]);
  fill.set('main:patch', [pat(patchTile(season)), 0.7]);
  fill.set('reserve', [grass, 1]);
  const paint = pat(paintTile());
  fill.set('paint0', [paint, 0.95]); fill.set('paint1', [paint, 0.7]); fill.set('paint2', [paint, 0.42]);

  // Low classes first, so at a junction the bigger road's surface lies on top.
  const order = [];
  for (const f of fams) {
    order.push(f + ':surface', f + ':verge');
    if (f === 'track') order.push('track:ruts', 'track:grass');
    else order.push(f + ':wear');
    if (f === 'main') order.push('main:patch', 'reserve');
  }
  order.push('paint2', 'paint1', 'paint0');

  const runs = [];
  for (const ch of chains) {
    const n = Math.max(1, Math.ceil(ch.len / RUN_M));
    for (let i = 0; i < n; i++) {
      const r0 = ch.len * i / n, r1 = ch.len * (i + 1) / n;
      const k0 = seg(ch, r0), k1 = seg(ch, r1);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const pts = [[r0, k0], [r1, k1]];
      for (let k = k0 + 1; k <= k1; k++) pts.push([ch.ss[k], k]);
      for (const [s, k] of pts) {
        const kk = Math.min(k, ch.tx.length - 1), u = s - ch.ss[kk];
        const x = ch.xs[kk] + ch.tx[kk] * u, y = ch.ys[kk] + ch.ty[kk] * u;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      runs.push({
        id: runs.length, x: (x0 + x1) / 2, y: (y0 + y1) / 2,
        r: Math.hypot(x1 - x0, y1 - y0) / 2 + ch.half + 1,
        layers: buildRun(ch, r0, r1, world.trunk),
      });
    }
  }
  P = { runs, fill, order, set: null, joined: null, buildMs: performance.now() - t0 };
  return P;
}

/** Draw every road near (cx, cy). Returns false when there is nothing to
 *  draw with (?road=0, or not loaded), and the page then draws its own. */
export function draw(ctx, cx, cy, radius) {
  if (!P) return false;
  const need = radius * 1.25;
  // Rebuild the joined paths only when a run that must be seen is missing
  // from the set they were built for, which was taken generously wide.
  let rebuild = !P.set;
  if (!rebuild) for (const run of P.runs) {
    const dx = run.x - cx, dy = run.y - cy, rr = need + run.r;
    if (dx * dx + dy * dy < rr * rr && !P.set.has(run.id)) { rebuild = true; break; }
  }
  if (rebuild) {
    const wide = radius * 2;
    P.set = new Set();
    P.joined = new Map();
    for (const run of P.runs) {
      const dx = run.x - cx, dy = run.y - cy, rr = wide + run.r;
      if (dx * dx + dy * dy >= rr * rr) continue;
      P.set.add(run.id);
      for (const [name, path] of run.layers) {
        let j = P.joined.get(name);
        if (!j) { j = new Path2D(); P.joined.set(name, j); }
        j.addPath(path);
      }
    }
  }
  ctx.save();
  for (const name of P.order) {
    const path = P.joined.get(name);
    if (!path) continue;
    const [fill, alpha] = P.fill.get(name);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.fill(path);
  }
  ctx.restore();
  return true;
}
