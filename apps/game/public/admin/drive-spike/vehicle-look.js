// vehicle-look.js — makes the vehicles on the driving spike look alive: an
// ink outline round each one, and tyres whose tread turns as it drives.
//
// Marcus, 2026-10-11: "it's jarring to see the wheels from the artwork NOT
// moving while the vehicle is advancing on the road", and "we need a black
// outline around each vehicle's contour since that's the visual language for
// the landscape features like hedges, and for all the animals".
//
// The outline. Each sprite is shrunk once to OUTLINE_RES pixels a metre (the
// most a phone ever draws it at) and an outlined copy made on an offscreen
// canvas: ink wherever the sprite's alpha is within the outline's width (a
// distance transform), the sprite on top. Drawing it is still one drawImage. Its weight is the hedges'
// in scenery.js as it lands on screen: their ink is a 0.36m stroke round each
// lobe with the body filled over it, so 0.18m shows. Being in metres, it
// scales with the camera's zoom as the hedges' does. Below 2m wide it thins
// in proportion, or the trikey and the scooter drown in it. The same
// silhouette, in shadow colour, is the vehicle's shadow.
//
// The tyres. wheels.json holds, per sprite, the rectangles where a tyre shows
// from above, in fractions of the image. They were found by detect() below
// (dark, grey pixel clusters along the sides) and corrected by eye with
// ?wheels=debug. Inside each rectangle only the tyre's own pixels are touched:
// a mask of them is taken once, and tread bands in a darker and lighter tone
// of that tyre's colour are laid over it, pre-drawn at PHASES offsets round
// one pitch. Each frame picks the offset from the distance driven, so the
// tread moves exactly with the road and is still when the vehicle is. Past a
// third of a pitch a frame the bands would strobe backwards (the wagon wheel),
// so they cross-fade to the average of every offset, which is what a fast
// tyre's blur looks like, and back as it slows.
//
// A patch's `kind` is `tread` (bands, the default), `chevron` (a tractor's
// painted lugs, which scroll themselves) or `thin` (the trikey's bicycle
// wheel: one glint going round). `loose` widens the mask for a tyre painted
// browner than rubber (Big Tilly's). Sprites with no tyre showing, such as
// the oncoming cars, have no entry.
//
// Contract:
//   load()                                   -> Promise, once in boot()
//   prepare(name, img, metresW)               build ahead of the first draw
//   shadow(ctx, name, img, metresW, w, h)     ctx at the shadow's centre, turned
//   body(ctx, name, img, metresW, w, h, m)    ctx at the vehicle's centre, turned
//                                             so the image's up is up; m = { key,
//                                             odo: metres driven, nose: 'up'|'down' }
// w, h are the plain sprite's size in the caller's units (metres or pixels);
// the outline and shadow grow past it by the outline's width. body() and
// shadow() return false when the art is not ready, so the caller draws its own
// stand-in.
//
// Comparison switches for Marcus, chosen by looking:
//   ?outline=0|1|2|3 none, 0.65 of the hedges' weight (default: Marcus,
//                    2026-10-12, the vans are smaller and finer-drawn than
//                    the hedges' blobs), the hedges' weight, heavier
//   ?wheels=0|1|debug  off, on (default), on with each tyre patch outlined
//   ?tread=road|top  which way the bands run. road (default) moves them front
//                    to back with the road, as asked; top is what a real
//                    tyre's top does, back to front.

const Q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
const OUTLINE_M = [0, 0.117, 0.18, 0.3][Q.get('outline') === null ? 1 : Number(Q.get('outline'))] ?? 0.117;
const WHEELS = Q.get('wheels') ?? '1';
const TREAD_SIGN = Q.get('tread') === 'top' ? -1 : 1;

/** Warm near-black: the hedges' inks are dark greens and the trees' their own
 *  crowns darkened; a brown-black sits with both without reading as a colour. */
const INK = '#2b2520';
const SHADOW_COLOUR = 'rgb(40,46,38)';   // scenery.js's, at the same alpha
const SHADOW_ALPHA = 0.22;

/** Narrower than this, metres, the outline thins in proportion. */
const OUTLINE_FULL_W = 2;

/** Pixels per metre the copies are built at: zoom 1.6 on a 2x screen is 70. */
const OUTLINE_RES = 80;
const PHASES = 12;
/** Tread pitch, metres, by kind. Coarser than a real tyre's so the bands
 *  read at phone size; the chevrons are a tractor's lugs. */
const PITCH = { tread: 0.2, chevron: 0.32, thin: 0.55 };
/** Per-frame travel, in pitches, over which the bands fade to blur. */
const BLUR_FROM = 0.22, BLUR_TO = 0.36;

let table = {};
const built = new Map();    // name|metresW -> entry
const motion = new Map();   // key -> { odo, rate, seen }
let sweep = 0;

export async function load() {
  try {
    const res = await fetch(new URL('./wheels.json', import.meta.url));
    if (res.ok) table = await res.json();
  } catch { /* no table: outlines only */ }
  if (typeof window !== 'undefined') window.__vehicleLook = { table, detect, built, motion, OUTLINE_M, WHEELS };
}

/** Build a sprite's copies now, so its first appearance does not stall. */
export function prepare(name, img, metresW) { return entry(name, img, metresW); }

function entry(name, img, metresW) {
  if (!img || !img.complete || !img.naturalWidth || typeof document === 'undefined') return null;
  const k = name + '|' + metresW.toFixed(3);
  let e = built.get(k);
  if (!e) { e = build(name, img, metresW); built.set(k, e); }
  return e;
}

/** Shrink in halves, so a 1800px painting does not alias at 200px. */
function shrink(img, cw, ch) {
  let src = img, sw = img.naturalWidth, sh = img.naturalHeight;
  while (sw / 2 > cw * 1.2) {
    sw = Math.round(sw / 2); sh = Math.round(sh / 2);
    const c = canvas(sw, sh), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, sw, sh);
    src = c;
  }
  const c = canvas(cw, ch), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, cw, ch);
  return c;
}

const rgb = c => c.startsWith('#')
  ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
  : c.match(/\d+/g).slice(0, 3).map(Number);

/** Squared distance to the nearest zero, in place: Felzenszwalb and
 *  Huttenlocher's transform, a column pass then a row pass. */
function edt(f, W, H) {
  const n = Math.max(W, H), line = new Float64Array(n), out = new Float64Array(n);
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  const pass = (len) => {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s;
      while ((s = ((line[q] + q * q) - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])) <= z[k]) k--;
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      out[q] = (q - v[k]) * (q - v[k]) + line[v[k]];
    }
  };
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) line[y] = f[y * W + x];
    pass(H);
    for (let y = 0; y < H; y++) f[y * W + x] = out[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) line[x] = f[y * W + x];
    pass(W);
    for (let x = 0; x < W; x++) f[y * W + x] = out[x];
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function build(name, img, metresW) {
  const cw = Math.max(8, Math.round(metresW * OUTLINE_RES));
  const ch = Math.max(8, Math.round(cw * img.naturalHeight / img.naturalWidth));
  const base = shrink(img, cw, ch);
  // At the full weight the trikey's handlebars and the scooter drowned in ink.
  const r = OUTLINE_M * Math.min(1, metresW / OUTLINE_FULL_W) * cw / metresW;
  const pad = Math.ceil(r) + 1;
  const W = cw + 2 * pad, H = ch + 2 * pad;
  const out = canvas(W, H), g = out.getContext('2d');
  g.drawImage(base, pad, pad);
  // Dilate by distance: every pixel within r of the sprite is ink, with a
  // half-pixel ramp at r for a smooth edge. Stamping the sprite round a
  // circle did the same at 0.6ms a stamp, 100ms for Big Tilly.
  const px = g.getImageData(0, 0, W, H), d = px.data;
  const d2 = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) d2[i] = d[i * 4 + 3] > 127 ? 0 : 1e20;
  edt(d2, W, H);
  const ink = g.createImageData(W, H), dark = g.createImageData(W, H);
  const [ir, ig, ib] = rgb(INK), [sr, sg, sb] = rgb(SHADOW_COLOUR);
  for (let i = 0; i < W * H; i++) {
    const a = r > 0 ? Math.min(1, Math.max(0, r + 0.5 - Math.sqrt(d2[i]))) : 0;
    const o = i * 4, own = d[o + 3] / 255;
    ink.data[o] = ir; ink.data[o + 1] = ig; ink.data[o + 2] = ib; ink.data[o + 3] = 255 * a;
    dark.data[o] = sr; dark.data[o + 1] = sg; dark.data[o + 2] = sb; dark.data[o + 3] = 255 * Math.max(a, own);
  }
  g.putImageData(ink, 0, 0);
  g.drawImage(base, pad, pad);
  const shadow = canvas(W, H);
  shadow.getContext('2d').putImageData(dark, 0, 0);
  const tyres = WHEELS === '0' ? [] : (table[name] ?? []).map(p => tyre(base, p, metresW / cw)).filter(Boolean);
  return { name, cw, ch, pad, out, shadow, tyres, patches: table[name] ?? [] };
}

/** How much a pixel looks like tyre rubber: dark and grey. Soft-edged so the
 *  mask feathers rather than steps. */
function rubber(r, g, b, limit = 0.44, greyLimit = 0.52) {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
  const sat = mx > 0 ? (mx - mn) / mx : 0;
  const dark = Math.min(1, Math.max(0, (limit - mx) / 0.1));
  const grey = Math.min(1, Math.max(0, (greyLimit - sat) / 0.14));
  return dark * grey;
}

/** One tyre patch: its masked pixels with tread bands at each phase, and the
 *  average of them all for speed. */
function tyre(base, p, mPerPx) {
  const x = Math.max(0, Math.floor(p.x * base.width)), y = Math.max(0, Math.floor(p.y * base.height));
  const w = Math.min(base.width - x, Math.ceil(p.w * base.width)), h = Math.min(base.height - y, Math.ceil(p.h * base.height));
  if (w < 2 || h < 2) return null;
  const data = base.getContext('2d').getImageData(x, y, w, h);
  const d = data.data;
  // A tractor's lugs catch the light, and the whole lug has to move, not just
  // the dark between them; a sun-browned tyre (Big Tilly's) is not so dark.
  const limits = p.kind === 'chevron' ? [0.56, 0.7] : p.loose ? [0.62, 0.52] : [0.44, 0.52];
  let sr = 0, sgr = 0, sb = 0, sw = 0;
  for (let i = 0; i < d.length; i += 4) {
    const m = rubber(d[i], d[i + 1], d[i + 2], ...limits) * d[i + 3] / 255;
    sr += d[i] * m; sgr += d[i + 1] * m; sb += d[i + 2] * m; sw += m;
    d[i + 3] = Math.round(d[i + 3] * m);
  }
  if (sw < 3) return null;
  const col = [sr / sw, sgr / sw, sb / sw];
  const mask = canvas(w, h);
  mask.getContext('2d').putImageData(data, 0, 0);
  const kind = p.kind ?? 'tread';
  const frames = [];
  let pitchPx = PITCH[kind] / mPerPx;
  if (kind === 'chevron') {
    // A tractor's lugs are painted, and bands laid over them would leave the
    // painted ones standing still. So the art itself scrolls, by up to one
    // lug pitch: the tread repeats each lug, so a shift of a pitch is no
    // shift, and the wrap does not show.
    pitchPx = lugPitch(data, mask, w, h) ?? pitchPx;
    for (let k = 0; k < PHASES; k++) frames.push(scroll(base, mask, x, y, w, h, pitchPx, k / PHASES));
  } else {
    for (let k = 0; k < PHASES; k++) frames.push(bands(mask, kind, col, pitchPx, k / PHASES));
  }
  const blur = canvas(w, h), bg = blur.getContext('2d');
  frames.forEach((f, i) => { bg.globalAlpha = 1 / (i + 1); bg.drawImage(f, 0, 0); });
  return { fx: x, fy: y, w, h, kind, pitch: pitchPx * mPerPx, frames, blur };
}

/** The painted lugs' spacing, px: the lag at which the tyre's row-by-row
 *  brightness best matches itself. null if nothing repeats. */
function lugPitch(data, mask, w, h) {
  const d = data.data, row = new Float64Array(h);
  for (let r = 0; r < h; r++) {
    let sum = 0, n = 0;
    for (let c = 0; c < w; c++) {
      const i = (r * w + c) * 4, m = d[i + 3] / 255;
      sum += (d[i] + d[i + 1] + d[i + 2]) * m; n += m;
    }
    row[r] = n > 0.5 ? sum / n : NaN;
  }
  const ok = [...row].filter(v => !Number.isNaN(v));
  const mean = ok.reduce((a, b) => a + b, 0) / (ok.length || 1);
  let best = null, bestC = 0.2;
  for (let lag = Math.max(3, Math.round(h * 0.05)); lag < h * 0.45; lag++) {
    let num = 0, da = 0, db = 0;
    for (let r = 0; r + lag < h; r++) {
      const a = row[r] - mean, b = row[r + lag] - mean;
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      num += a * b; da += a * a; db += b * b;
    }
    const c = num / Math.sqrt(da * db || 1);
    if (c > bestC) { bestC = c; best = lag; }
  }
  return best;
}

/** The tyre's own art moved down by phase of a pitch, kept to its rubber. */
function scroll(base, mask, x, y, w, h, pitchPx, phase) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const s = phase * pitchPx;
  g.drawImage(base, x, y, w, h, 0, s, w, h);
  g.drawImage(base, x, y, w, h, 0, s - pitchPx, w, h);
  return c;
}

const tone = (c, f) => f < 0
  ? `rgb(${c.map(v => Math.round(v * (1 + f))).join()})`
  : `rgb(${c.map(v => Math.round(v + (255 - v) * f)).join()})`;

/** The tread over a tyre's own pixels. The patch is the top of a cylinder seen
 *  from above, so bands bunch towards its ends: a band at arc length a sits at
 *  R sin(a/R) from the middle. phase runs 0..1 down the image. */
function bands(mask, kind, col, pitchPx, phase) {
  const w = mask.width, h = mask.height;
  const c = canvas(w, h), g = c.getContext('2d');
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const R = h * 0.62, cy = h / 2, half = R * Math.PI / 2;
  const yAt = a => cy + R * Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, a / R)));
  const dark = tone(col, -0.5), light = tone(col, 0.32);
  for (let a = -half - pitchPx * 2 + phase * pitchPx; a < half + pitchPx; a += pitchPx) {
    if (kind === 'thin') {
      // A bicycle wheel is too thin for bands: one glint going round.
      g.fillStyle = light; g.globalAlpha = 0.85;
      g.fillRect(0, yAt(a), w, Math.max(1, yAt(a + pitchPx * 0.18) - yAt(a)));
      continue;
    }
    const y0 = yAt(a), y1 = yAt(a + pitchPx * 0.45), y2 = yAt(a + pitchPx * 0.58);
    g.globalAlpha = 0.55; g.fillStyle = dark; g.fillRect(0, y0, w, y1 - y0);
    g.globalAlpha = 0.4; g.fillStyle = light; g.fillRect(0, y1, w, y2 - y1);
  }
  return c;
}

/** The shadow, cast from the outlined silhouette. ctx is at the shadow's
 *  centre and turned like the body. */
export function shadow(ctx, name, img, metresW, w, h) {
  const e = entry(name, img, metresW);
  if (!e) return false;
  const u = w / e.cw;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * SHADOW_ALPHA;
  ctx.drawImage(e.shadow, -w / 2 - e.pad * u, -h / 2 - e.pad * u, e.shadow.width * u, e.shadow.height * u);
  ctx.globalAlpha = a;
  return true;
}

export function body(ctx, name, img, metresW, w, h, m) {
  const e = entry(name, img, metresW);
  if (!e) return false;
  const u = w / e.cw;
  ctx.drawImage(e.out, -w / 2 - e.pad * u, -h / 2 - e.pad * u, e.out.width * u, e.out.height * u);
  if (e.tyres.length) wheels(ctx, e, w, h, u, m);
  if (WHEELS === 'debug') debug(ctx, e, w, h);
  return true;
}

function wheels(ctx, e, w, h, u, m) {
  // Travel this frame, smoothed a little so a frame's jitter does not flick
  // between bands and blur. A jump (a new route, back from off screen) is
  // not travel.
  const now = performance.now();
  let s = motion.get(m.key);
  if (!s) { s = { odo: m.odo, rate: 0, seen: now, name: e.name }; motion.set(m.key, s); }
  let d = Math.abs(m.odo - s.odo);
  if (d > 3) d = 0;
  s.rate += (d - s.rate) * 0.3; s.odo = m.odo; s.seen = now;
  if (now - sweep > 2000) {
    sweep = now;
    for (const [k, v] of motion) if (now - v.seen > 2000) motion.delete(k);
  }
  // Bands move front to back: down the image for a nose-up sprite.
  const dir = (m.nose === 'down' ? -1 : 1) * TREAD_SIGN;
  const a0 = ctx.globalAlpha;
  for (const t of e.tyres) {
    const per = s.rate / t.pitch;
    const b = Math.min(1, Math.max(0, (per - BLUR_FROM) / (BLUR_TO - BLUR_FROM)));
    const x = -w / 2 + t.fx * u, y = -h / 2 + t.fy * u, tw = t.w * u, th = t.h * u;
    if (b < 1) {
      let p = (dir * m.odo / t.pitch) % 1;
      if (p < 0) p += 1;
      ctx.drawImage(t.frames[Math.floor(p * PHASES) % PHASES], x, y, tw, th);
    }
    if (b > 0) { ctx.globalAlpha = a0 * b; ctx.drawImage(t.blur, x, y, tw, th); ctx.globalAlpha = a0; }
  }
}

function debug(ctx, e, w, h) {
  ctx.save();
  ctx.strokeStyle = '#ff00d0'; ctx.lineWidth = w / 60;
  for (const p of e.patches) ctx.strokeRect(-w / 2 + p.x * w, -h / 2 + p.y * h, p.w * w, p.h * h);
  ctx.restore();
}

// ------------------------------------------------------------- the detector

/** Find a sprite's visible tyres: clusters of dark, grey pixels that lie along
 *  its sides (or down its middle, for a single-track machine). Run from the
 *  console, window.__vehicleLook.detect(img), to rebuild wheels.json; the
 *  table is then corrected by eye, so this is a starting point, not the
 *  truth. Returns rectangles in fractions of the image. */
export function detect(img, { single = false } = {}) {
  const W = 160, H = Math.round(W * img.naturalHeight / img.naturalWidth);
  const c = shrink(img, W, H), d = c.getContext('2d').getImageData(0, 0, W, H).data;
  const on = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) on[i] = d[i * 4 + 3] > 200 && rubber(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) > 0.5 ? 1 : 0;
  const seen = new Uint8Array(W * H), found = [];
  for (let i = 0; i < W * H; i++) {
    if (!on[i] || seen[i]) continue;
    const stack = [i]; seen[i] = 1;
    let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, sx = 0;
    while (stack.length) {
      const j = stack.pop(), x = j % W, y = (j / W) | 0;
      n++; sx += x;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const k of [j - 1, j + 1, j - W, j + W]) {
        if (k < 0 || k >= W * H || seen[k] || !on[k]) continue;
        if (Math.abs((k % W) - x) > 1) continue;
        seen[k] = 1; stack.push(k);
      }
    }
    const cx = sx / n / W, bh = (y1 - y0 + 1) / H;
    if (n < W * H * 0.0015 || bh < 0.03) continue;
    const side = cx < 0.3 || cx > 0.7, mid = single && Math.abs(cx - 0.5) < 0.15;
    if (!side && !mid) continue;
    found.push({ x: +((x0 - 1) / W).toFixed(3), y: +((y0 - 1) / H).toFixed(3),
      w: +((x1 - x0 + 3) / W).toFixed(3), h: +((y1 - y0 + 3) / H).toFixed(3), n });
  }
  return found;
}
