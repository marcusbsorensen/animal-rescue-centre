// behind-view.js — the look-ahead window's picture: the road ahead seen from
// behind her van, at a driver's eye height (decision 54B).
//
// Lily asked to see why she cannot overtake; the top-down window answered it
// from above. Marcus, 2026-10-12: show it from behind her van instead, "we
// are not showing a rear view mirror or anything that comes from the top".
// So the camera sits in her van, at the eye height of whoever drives it,
// at the lateral position she has poked out to, looking forward along her
// route: the back of the vehicle she follows on the left, her lane and the
// oncoming lane ahead, and the front of anything coming towards her.
//
// How it is drawn, so the next person can change it (Canvas 2D only):
//   - The ground is the top-down world, projected. The page draws its own
//     ground and roads (scenery.js's fields, road-paint.js's tarmac and
//     lines) into two small offscreen textures turned so the camera looks up
//     them: a fine one for the first NEAR.z1 metres and a coarse one out to
//     FAR.z1. Each row of the picture below the horizon is one depth on the
//     ground, so it is one drawImage of one row of a texture, stretched to
//     the width that depth covers: the scanline ("mode 7") way. The
//     textures are not repainted every frame: each is read shifted by how
//     far the eye has gone since it was painted, and the next is painted
//     into a spare a band a frame (see NEAR, FAR and ground()).
//   - Above the horizon a painted sky, a few soft clouds and a low line of
//     hills, all fixed in the world by bearing so they turn with the road.
//     A haze lies along the horizon so the end of the textures never shows.
//   - Everything upright is drawn after the ground, far to near: trees as a
//     trunk and a crown, hedges and garden walls as upright strips, houses
//     as boxes with a pitched roof (only the faces turned to the camera),
//     and the traffic as a box whose near end is the vehicle's painted rear
//     or front (vehicle-views/, see its README), or a plain one in the
//     vehicle's colour until the painting exists.
//   - It is drawn at a reduced internal size into its own canvas and scaled
//     into the window; the size adapts so a frame of it stays near BUDGET_MS.
//
// Coordinates: the world is the page's (metres, x east, y south). The camera
// frame is X to the right of the camera, Z forward, Y up from the road.
//
// Contract:
//   create()                          -> BV
//   render(BV, cam, world, size)      draws BV.out; returns { project, scale,
//                                     ms } or null before the world is ready
//     cam   = { x, y, yaw, eye, f, cx, yH }  world position, heading
//             (radians, world frame), eye height (m); focal length, principal
//             point and horizon row as fractions of the output's width/height
//     world = { ground(g, view, radius), scenery, traffic, footprint, season }
//     size  = { w, h } CSS px of the window's screen
//   vehicleAt(BV, x, y)               the drawn vehicle nearest a world point
//   drawVehicleAt(ctx, BV, v, k)      that vehicle again, k times larger, in
//                                     internal px (for the magnifier)

/** The two ground textures: depth z0..z1 and L either side of the eye,
 *  metres, at k px per metre. Each is repainted only when the eye has gone
 *  more than slackZ forward or slackX sideways, or turned more than rot
 *  radians, since it was painted; in between, each row is read from it
 *  shifted by how far the eye has moved and turned (exact for moving, and
 *  for turning off only by a sliver of the row's own depth). */
const NEAR = { z0: -1, z1: 62, L: 26, k: 5.5, slackZ: 14, slackX: 5, rot: 2 * Math.PI / 180, bands: 2 };
const FAR = { z0: -2, z1: 320, L: 170, k: 0.95, slackZ: 30, slackX: 22, rot: 3 * Math.PI / 180, bands: 8 };
const SCENERY_M = 170;     // upright scenery is drawn out to here
const TRAFFIC_M = 320;     // and traffic out to here
const NEAR_CLIP = 0.8;     // metres in front of the eye
const CELL_M = 100;        // scenery.js's CELL_M: its objects are bucketed in these
const MAX_W = 480;         // internal px across, at best
const MIN_SCALE = 0.45;    // of the window's CSS size, at worst
const BUDGET_MS = 5;       // what a frame of this may cost before it shrinks

const VIEWS = '/assets/driving/vehicle-views/';

export function create() {
  const BV = { out: canvas(), near: null, far: null, scale: 0.8, avg: 0, views: null, imgs: new Map(), drawn: [] };
  loadIndex(BV);
  return BV;
}

/** Only the files index.json lists are asked for, so a painting that does
 *  not exist yet never shows as a failed request. */
async function loadIndex(BV) {
  BV.views = new Set();
  try {
    const r = await fetch(VIEWS + 'index.json');
    if (r.ok) for (const v of (await r.json()).views ?? []) BV.views.add(v);
  } catch { /* no index: every vehicle is drawn plain */ }
}
function viewImage(BV, file) {
  if (!BV.views || !BV.views.has(file)) return null;
  let im = BV.imgs.get(file);
  if (im === undefined) {
    im = new Image();
    im.onerror = () => BV.imgs.set(file, null);
    im.src = VIEWS + file;
    BV.imgs.set(file, im);
  }
  return im && im.complete && im.naturalWidth ? im : null;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------------------------------------------------------------- the frame

export function render(BV, cam, world, size) {
  if (globalThis.__bvFlush) BV.out.g.getImageData(0, 0, 1, 1);
  const t0 = performance.now();
  // The internal size: the window's, scaled down to keep within budget.
  const sc = Math.min(BV.scale, MAX_W / size.w);
  const W = Math.max(64, Math.round(size.w * sc)), H = Math.max(36, Math.round(size.h * sc));
  const O = BV.out;
  if (O.el.width !== W || O.el.height !== H) { O.el.width = W; O.el.height = H; }
  const g = O.g;
  g.setTransform(1, 0, 0, 1, 0, 0);

  const f = cam.f * W, cx = cam.cx * W, yH = Math.round(cam.yH * H), eye = cam.eye;
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  // World to camera: X right of the camera, Z forward.
  const toCam = (x, y) => {
    const dx = x - cam.x, dy = y - cam.y;
    return [-dx * sy + dy * cy, dx * cy + dy * sy];
  };
  const P = { W, H, f, cx, yH, eye, toCam, season: world.season };

  sky(g, P, cam.yaw);
  const tA = performance.now();
  ground(BV, g, P, cam, world);
  haze(g, P);
  const tB = performance.now();

  // Everything upright, far to near.
  const items = [];
  if (world.scenery && !world.scenery.failed) gatherScenery(items, P, world.scenery, cam);
  BV.drawn = [];
  if (world.traffic) gatherTraffic(BV, items, P, world, cam);
  items.sort((a, b) => b.z - a.z);
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const it of items) it.draw(g);

  // A canvas defers its drawing; a test sets __bvFlush to count the real
  // cost of this frame, the textures' painting included, here.
  if (globalThis.__bvFlush) g.getImageData(0, 0, 1, 1);
  const ms = performance.now() - t0;
  BV.prof = { sky: tA - t0, ground: tB - tA, upright: performance.now() - tB, items: items.length, tex: BV.texMs, bands: BV.bandsPainted };
  // Keep near the budget: shrink quickly when over, grow back slowly.
  BV.avg = BV.avg ? BV.avg * 0.9 + ms * 0.1 : ms;
  if (BV.avg > BUDGET_MS * 1.2) BV.scale = Math.max(MIN_SCALE, BV.scale * 0.94);
  else if (BV.avg < BUDGET_MS * 0.6) BV.scale = Math.min(1, BV.scale * 1.01);

  /** A world point (h metres up) to the window's internal px, or null when
   *  it is behind the eye. */
  const project = (x, y, h = 0) => {
    const [X, Z] = toCam(x, y);
    if (Z < NEAR_CLIP) return null;
    return { x: cx + f * X / Z, y: yH + f * (eye - h) / Z, z: Z, k: f / Z };
  };
  return { project, scale: W / size.w, ms, W, H, P };
}

// ------------------------------------------------------------------- the sky

const SKY = {
  spring: ['#9fcbe6', '#dcecf0'], summer: ['#8cc3e6', '#e3f0ee'],
  autumn: ['#a6c3d6', '#ebe6da'], winter: ['#b6c8d4', '#e9ecea'],
};
const HILLS = {
  spring: '#8fb27f', summer: '#87a876', autumn: '#a3a07a', winter: '#aab3a6',
};
const HAZE = {
  spring: '220,234,236', summer: '226,238,234', autumn: '233,229,216', winter: '231,234,232',
};

function sky(g, P, yaw) {
  const { W, H, yH, f, cx } = P;
  const [top, low] = SKY[P.season] || SKY.summer;
  const gr = g.createLinearGradient(0, 0, 0, yH + 1);
  gr.addColorStop(0, top); gr.addColorStop(1, low);
  g.fillStyle = gr; g.fillRect(0, 0, W, yH + 1);
  // Screen x of a bearing: fixed in the world, so the sky turns with the road.
  const ax = a => cx + f * Math.tan(wrap(a - yaw));
  const half = Math.atan2(Math.max(cx, W - cx), f) + 0.3;
  // A few soft clouds.
  g.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < 9; i++) {
    const a = i * 0.71 + 0.3;
    if (Math.abs(wrap(a - yaw)) > half) continue;
    const x = ax(a), y = yH * (0.18 + 0.5 * frac(i * 0.37)), s = W * (0.05 + 0.04 * frac(i * 0.61));
    g.beginPath();
    g.ellipse(x, y, s * 1.6, s * 0.42, 0, 0, Math.PI * 2);
    g.ellipse(x - s * 0.6, y - s * 0.2, s * 0.7, s * 0.45, 0, 0, Math.PI * 2);
    g.ellipse(x + s * 0.5, y - s * 0.28, s * 0.8, s * 0.5, 0, 0, Math.PI * 2);
    g.fill();
  }
  // A low line of far hills, by bearing.
  g.fillStyle = HILLS[P.season] || HILLS.summer;
  g.beginPath(); g.moveTo(0, yH + 1);
  const step = Math.max(4, W / 48);
  for (let x = 0; x <= W + step; x += step) {
    const a = yaw + Math.atan2(x - cx, f);
    const hgt = 0.5 + 0.3 * Math.sin(a * 3.1) + 0.2 * Math.sin(a * 7.3 + 1) + 0.12 * Math.sin(a * 17 + 2);
    g.lineTo(x, yH - Math.max(0, hgt) * H * 0.06);
  }
  g.lineTo(W, yH + 1); g.closePath(); g.fill();
}
const frac = x => x - Math.floor(x);
function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

// ---------------------------------------------------------------- the ground

/** One band of a ground texture (band i of B.bands, by depth): the
 *  top-down ground and roads painted into canvas T from pose, turned so the
 *  camera looks up it: u across (left to right), v down (far at the top). */
function paintBand(T, B, pose, world, i) {
  const tw = Math.round(2 * B.L * B.k), th = Math.round((B.z1 - B.z0) * B.k);
  if (T.el.width !== tw || T.el.height !== th) { T.el.width = tw; T.el.height = th; }
  const g = T.g, k = B.k, s = Math.sin(pose.yaw), c = Math.cos(pose.yaw);
  const za = B.z0 + (B.z1 - B.z0) * i / B.bands, zb = B.z0 + (B.z1 - B.z0) * (i + 1) / B.bands;
  const v0 = Math.floor((B.z1 - zb) * k), v1 = Math.ceil((B.z1 - za) * k);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.beginPath(); g.rect(0, v0, tw, v1 - v0); g.clip();
  g.fillStyle = '#8fbf6a'; g.fillRect(0, v0, tw, v1 - v0);
  // u = k (X + L), v = k (z1 - Z), with X = -dx s + dy c, Z = dx c + dy s.
  const a = -k * s, cc = k * c, b = -k * c, d = -k * s;
  g.setTransform(a, b, cc, d, k * B.L - (a * pose.x + cc * pose.y), k * B.z1 - (b * pose.x + d * pose.y));
  const zm = (za + zb) / 2;
  const view = {
    cx: pose.x + c * zm, cy: pose.y + s * zm, radius: Math.hypot(B.L, (zb - za) / 2) + 4,
    camH: pose.yaw, ppm: k, season: world.season, sun: world.sun,
  };
  world.ground(g, view, view.radius);
  g.restore();
}

/** Where the eye is in the frame a texture was painted from, { X, Z }, how
 *  far it has turned since, { sin, cos }, and how much of the slack that
 *  uses up (1 = all of it). */
function offset(pose, B, cam) {
  const dx = cam.x - pose.x, dy = cam.y - pose.y, s = Math.sin(pose.yaw), c = Math.cos(pose.yaw);
  const X = -dx * s + dy * c, Z = dx * c + dy * s;
  const d = wrap(cam.yaw - pose.yaw);
  const used = Math.max(Math.abs(d) / B.rot, Math.abs(X) / B.slackX, Z / B.slackZ, -Z / 0.5);
  return { X, Z, sin: Math.sin(d), cos: Math.cos(d), used };
}

/** A ground texture: the one being read (front), and the next one being
 *  painted into (back) a band a frame, from where the eye was when it was
 *  started; they swap when it is done. Painting starts when the front is
 *  half used up, so the back is ready long before the front runs out, and
 *  no frame paints more than one band. Only the very first is painted at
 *  once. */
function texture(BV, name) {
  return BV[name] || (BV[name] = { front: canvas(), back: canvas(), pose: null, job: null });
}
function canvas() {
  const el = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas');
  return { el, g: el.getContext('2d') };
}

function ground(BV, g, P, cam, world) {
  const { W, H, yH, f, eye } = P;
  const t0 = performance.now();
  const here = { x: cam.x, y: cam.y, yaw: cam.yaw };
  const tN = texture(BV, 'nearTex'), tF = texture(BV, 'farTex');
  // The near texture is painted at once the first time; the far one, never:
  // until its first is done, the rows beyond the near one are left plain.
  if (!tN.pose) {
    for (let i = 0; i < NEAR.bands; i++) paintBand(tN.front, NEAR, here, world, i);
    tN.pose = here;
  }
  for (const [t, B] of [[tN, NEAR], [tF, FAR]]) {
    if (!t.job && (!t.pose || offset(t.pose, B, cam).used > 0.5)) t.job = { pose: here, band: 0 };
  }
  // One band a frame: the far texture's first, then the two by turns.
  const t = tF.job && (!tF.pose || !tN.job || (BV.turn = !BV.turn)) ? tF : tN.job ? tN : null;
  if (t) {
    const B = t === tN ? NEAR : FAR;
    paintBand(t.back, B, t.job.pose, world, t.job.band++);
    BV.bandsPainted = (BV.bandsPainted || 0) + 1;
    if (t.job.band >= B.bands) {
      [t.front, t.back] = [t.back, t.front];
      t.pose = t.job.pose; t.job = null;
    }
  }
  if (globalThis.__bvFlush && t) t.back.g.getImageData(0, 0, 1, 1);
  BV.texMs = performance.now() - t0;
  BV.near = tN.front; BV.far = tF.front;
  const oN = offset(tN.pose, NEAR, cam), oF = tF.pose && offset(tF.pose, FAR, cam);
  g.fillStyle = '#8fbf6a'; g.fillRect(0, yH, W, H - yH);
  g.imageSmoothingEnabled = true;
  // One row of the picture is one depth on the ground. In the frame its
  // texture was painted from, a point (X, Z) of the row is at
  //   X' = o.X + Z sin + X cos,   Z' = o.Z + Z cos - X sin,
  // and the last term, a sliver of the row's depth, is let go so that the
  // row is still one row of the texture.
  for (let y = yH + 1; y < H; y++) {
    const Z = eye * f / (y + 0.5 - yH), Zn = eye * f / (y + 1.5 - yH);
    // The far texture under the whole row, unless the near one covers it.
    const near = oN.Z + Z * oN.cos < NEAR.z1 - 2;
    if (oF && (!near || !row(g, P, BV.near, NEAR, oN, Z, Zn, y, true))) row(g, P, BV.far, FAR, oF, Z, Zn, y, false);
    if (near) row(g, P, BV.near, NEAR, oN, Z, Zn, y, false);
  }
}

/** Draw one row of the picture, at depth Z, from texture T. With onlyIfAll,
 *  draw it only if T covers the whole row, and say whether it did. */
function row(g, P, T, B, o, Z, Zn, y, onlyIfAll) {
  const { W, f, cx } = P;
  const Zt = o.Z + Z * o.cos;
  if (Zt >= B.z1) return false;
  const v = (B.z1 - Zt) * B.k, vh = Math.max(0.6, (Z - Zn) * B.k);
  // The row covers X from (0 - cx) Z / f to (W - cx) Z / f: what of that
  // the texture holds, drawn to where it lands.
  const sh = o.X + Z * o.sin;
  const A0 = -cx * Z / f, A1 = (W - cx) * Z / f;
  const X0 = Math.max((-B.L - sh) / o.cos, A0), X1 = Math.min((B.L - sh) / o.cos, A1);
  if (X1 <= X0) return false;
  if (onlyIfAll && (X0 > A0 || X1 < A1)) return false;
  const u0 = (sh + X0 * o.cos + B.L) * B.k, u1 = (sh + X1 * o.cos + B.L) * B.k;
  const d0 = cx + f * X0 / Z, d1 = cx + f * X1 / Z;
  g.drawImage(T.el, u0, Math.max(0, v), u1 - u0, Math.min(vh, T.el.height - v), d0, y, d1 - d0, 1.02);
  return true;
}

function haze(g, P) {
  const { W, H, yH } = P;
  const c = HAZE[P.season] || HAZE.summer;
  const span = Math.max(6, (H - yH) * 0.32);
  const gr = g.createLinearGradient(0, yH - span * 0.5, 0, yH + span);
  gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(0.35, `rgba(${c},.85)`);
  gr.addColorStop(0.55, `rgba(${c},.55)`); gr.addColorStop(1, `rgba(${c},0)`);
  g.fillStyle = gr; g.fillRect(0, yH - span * 0.5, W, span * 1.5);
}

/** How much a thing this far away is washed into the haze, 0 to 1. */
const fog = Z => clamp((Z - 70) / 160, 0, 0.75);

// ------------------------------------------------------------------ scenery

const LEAF = {
  spring: ['#7fb24f', '#8dbd57', '#74a649', '#93c262'],
  summer: ['#4f7c3a', '#5b8a41', '#477239', '#64904a'],
  autumn: ['#b8622d', '#c9852f', '#d6a73a', '#9c5a2c', '#ad7b33', '#c46d34', '#8e8a3c'],
};
const CONIFER = ['#3f603c', '#48694a', '#38573a'];
const HEDGE = {
  spring: { fill: '#5f8f3e', ink: '#3c5b28', hl: '#80b055' },
  summer: { fill: '#4b7a35', ink: '#2e4a21', hl: '#679a47' },
  autumn: { fill: '#7b7838', ink: '#4c4321', hl: '#a2874a' },
  winter: { fill: '#86786a', ink: '#5a4c40', hl: '#a39586' },
};
const PRIVET = { fill: '#4f7740', ink: '#30482a', hl: '#6a9356' };
const WALL_TONE = { brick: ['#a3654c', '#6a3b2b'], flint: ['#c4bdaf', '#7c7568'], fence: ['#8b6a4a', '#5a4430'] };
const HOUSE_WALLS = ['#eadfc8', '#e4d3b4', '#d9c9ad', '#f0e6d2', '#c98f6c'];
const INK = '#2d3527';

/** A world point h metres up, in the picture's px, or null behind the eye. */
function proj(P, X, Z, h) {
  return [P.cx + P.f * X / Z, P.yH + P.f * (P.eye - h) / Z];
}
/** Clip the ground segment (X,Z) a..b to in front of the eye. */
function clipSeg(ax, az, bx, bz) {
  if (az < NEAR_CLIP && bz < NEAR_CLIP) return null;
  if (az < NEAR_CLIP) { const t = (NEAR_CLIP - az) / (bz - az); ax += (bx - ax) * t; az = NEAR_CLIP; }
  else if (bz < NEAR_CLIP) { const t = (NEAR_CLIP - bz) / (az - bz); bx += (ax - bx) * t; bz = NEAR_CLIP; }
  return [ax, az, bx, bz];
}
/** Whether ground point (X, Z), reach metres round, can be in the picture. */
function inFrustum(P, X, Z, reach, far) {
  if (Z + reach < NEAR_CLIP || Z - reach > far) return false;
  const zz = Math.max(Z, 0.5);
  return X + reach > -P.cx * zz / P.f - 1 && X - reach < (P.W - P.cx) * zz / P.f + 1;
}

/** An upright strip along a ground segment, from h0 to h1 metres up. */
function strip(g, P, s, h0, h1) {
  const [a0x, a0y] = proj(P, s[0], s[1], h0), [a1x, a1y] = proj(P, s[0], s[1], h1);
  const [b0x, b0y] = proj(P, s[2], s[3], h0), [b1x, b1y] = proj(P, s[2], s[3], h1);
  g.beginPath(); g.moveTo(a0x, a0y); g.lineTo(a1x, a1y); g.lineTo(b1x, b1y); g.lineTo(b0x, b0y); g.closePath();
  return [a1x, a1y, b1x, b1y];
}

function gatherScenery(items, P, S, cam) {
  const R = SCENERY_M;
  // The cells under the frustum's bounding box.
  const fx = Math.cos(cam.yaw), fy = Math.sin(cam.yaw);
  const xs = [cam.x, cam.x + fx * R], ys = [cam.y, cam.y + fy * R];
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - R) / CELL_M)), i1 = Math.min(S.gx - 1, Math.floor((Math.max(...xs) + R) / CELL_M));
  const j0 = Math.max(0, Math.floor((Math.min(...ys) - R) / CELL_M)), j1 = Math.min(S.gy - 1, Math.floor((Math.max(...ys) + R) / CELL_M));
  const lw = Math.max(0.6, P.W / 480);
  const season = P.season;
  const hedgeC = HEDGE[season] || HEDGE.summer;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = S.cells[j * S.gx + i];
    if (!c) continue;
    // Is the cell anywhere near the frustum?
    const [CX, CZ] = P.toCam((i + 0.5) * CELL_M, (j + 0.5) * CELL_M);
    if (!inFrustum(P, CX, CZ, CELL_M * 0.75, R)) continue;

    for (const t of c.trees) {
      const [X, Z] = P.toCam(t.x, t.y);
      if (Z < 2 || !inFrustum(P, X, Z, t.r, R)) continue;
      items.push({ z: Z, draw: g => tree(g, P, X, Z, t, season, lw) });
    }
    for (const h of c.hedges) {
      const [ax, az] = P.toCam(h[0], h[1]), [bx, bz] = P.toCam(h[2], h[3]);
      const s = clipSeg(ax, az, bx, bz);
      if (!s || !inFrustum(P, (s[0] + s[2]) / 2, (s[1] + s[3]) / 2, Math.hypot(s[2] - s[0], s[3] - s[1]) / 2, R)) continue;
      const C = h[4] === 'privet' ? PRIVET : hedgeC, top = h[4] === 'privet' ? 1.4 : 1.6;
      items.push({ z: Math.max(s[1], s[3]) * 0.5 + Math.min(s[1], s[3]) * 0.5, draw: g => {
        const tp = strip(g, P, s, 0, top);
        g.fillStyle = C.fill; g.fill();
        g.lineWidth = lw; g.strokeStyle = C.ink; g.stroke();
        g.lineWidth = lw * 1.4; g.strokeStyle = C.hl;
        g.beginPath(); g.moveTo(tp[0], tp[1] + lw * 1.2); g.lineTo(tp[2], tp[3] + lw * 1.2); g.stroke();
        fade(g, P, Math.min(s[1], s[3]));
      } });
    }
    for (const w of c.walls) {
      const [ax, az] = P.toCam(w.x1, w.y1), [bx, bz] = P.toCam(w.x2, w.y2);
      const s = clipSeg(ax, az, bx, bz);
      if (!s || Math.min(s[1], s[3]) > 90) continue;
      if (!inFrustum(P, (s[0] + s[2]) / 2, (s[1] + s[3]) / 2, Math.hypot(s[2] - s[0], s[3] - s[1]) / 2, R)) continue;
      const [fill, ink] = WALL_TONE[w.kind] || WALL_TONE.fence;
      items.push({ z: (s[1] + s[3]) / 2, draw: g => {
        strip(g, P, s, 0, w.kind === 'fence' ? 1.1 : 0.9);
        g.globalAlpha = w.kind === 'fence' ? 0.7 : 1;
        g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = ink; g.stroke();
        g.globalAlpha = 1;
      } });
    }
    for (const h of c.houses) {
      const [X, Z] = P.toCam(h.box.x, h.box.y);
      const reach = Math.hypot(h.box.hu, h.box.hv);
      if (Z - reach < 2 || !inFrustum(P, X, Z, reach, R)) continue;
      items.push({ z: Z, draw: g => house(g, P, h, lw) });
    }
  }
}

/** Wash something already drawn towards the haze: a pale veil over its last
 *  path, so far things recede without going see-through. */
function fade(g, P, Z) {
  const a = fog(Z);
  if (a <= 0.02) return;
  g.fillStyle = `rgba(${HAZE[P.season] || HAZE.summer},${a})`; g.fill();
}

function tree(g, P, X, Z, t, season, lw) {
  const k = P.f / Z, r = t.r;
  const [bx, by] = proj(P, X, Z, 0);
  const conifer = t.kind === 'conifer';
  const top = conifer ? 3.2 * r + 1 : 2.2 + 2 * r * 0.95;
  const trunkW = Math.max(0.4, r * 0.12) * k;
  const crownY = P.yH + P.f * (P.eye - (conifer ? 1.2 : 2.2 + r * 0.95)) / Z;
  g.fillStyle = '#6b5443';
  g.fillRect(bx - trunkW / 2, crownY, trunkW, by - crownY);
  const pick = (list) => list[t.seed % list.length];
  if (conifer) {
    const tipY = P.yH + P.f * (P.eye - top) / Z;
    g.beginPath(); g.moveTo(bx, tipY); g.lineTo(bx + r * k, crownY); g.lineTo(bx - r * k, crownY); g.closePath();
    g.fillStyle = pick(CONIFER);
  } else {
    g.beginPath(); g.ellipse(bx, crownY, r * k, r * 0.95 * k, 0, 0, Math.PI * 2);
    if (season === 'winter') {
      g.fillStyle = 'rgba(120,100,84,0.42)'; g.fill();
      g.lineWidth = Math.max(0.5, 0.12 * k); g.strokeStyle = '#5f4f42';
      g.beginPath();
      for (const a of [-0.9, -0.3, 0.35, 0.95]) { g.moveTo(bx, crownY + r * 0.5 * k); g.lineTo(bx + Math.sin(a) * r * 0.8 * k, crownY - Math.cos(a) * r * 0.75 * k); }
      g.stroke();
      return;
    }
    g.fillStyle = pick(LEAF[season] || LEAF.summer);
  }
  g.fill();
  g.lineWidth = lw; g.strokeStyle = INK; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1;
  fade(g, P, Z);
}

/** A house: a box with a pitched roof, ridge along its longer side. Only the
 *  faces turned to the eye are drawn, which for a box is all it needs. */
function house(g, P, h, lw) {
  const b = h.box, eave = 4.6, ridge = 7.2;
  const along = b.hu >= b.hv;   // ridge along u
  const corner = (su, sv) => P.toCam(b.x + b.ux * b.hu * su - b.uy * b.hv * sv, b.y + b.uy * b.hu * su + b.ux * b.hv * sv);
  // Corners in the camera frame, counter-clockwise round the box.
  const C = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  if (C.some(p => p[1] < NEAR_CLIP)) return;
  const [EX, EZ] = [0, 0];   // the eye, in its own frame
  const wallsTone = HOUSE_WALLS[h.seed % HOUSE_WALLS.length];
  const roof = h.roof?.base || '#8c5946';
  const face = (pts, fill) => {
    g.beginPath();
    pts.forEach(([X, Z, y], i) => { const [sx, sy] = proj(P, X, Z, y); if (i) g.lineTo(sx, sy); else g.moveTo(sx, sy); });
    g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  };
  const cx = (C[0][0] + C[2][0]) / 2, cz = (C[0][1] + C[2][1]) / 2;
  // Walls: the side from C[i] to C[i+1] faces the eye when the eye is on
  // its outside.
  for (let i = 0; i < 4; i++) {
    const A = C[i], B = C[(i + 1) % 4];
    const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
    const nx = mx - cx, nz = mz - cz;
    if (nx * (EX - mx) + nz * (EZ - mz) <= 0) continue;
    // Gable end: the wall runs up to the ridge.
    const gable = along ? (i === 1 || i === 3) : (i === 0 || i === 2);
    const pts = [[A[0], A[1], 0], [B[0], B[1], 0], [B[0], B[1], eave]];
    if (gable) pts.push([mx, mz, ridge]);
    pts.push([A[0], A[1], eave]);
    face(pts, i % 2 ? shade(wallsTone, 0.9) : wallsTone);
    // Two windows and, low on the road side, nothing fancier.
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (len > 4) {
      for (const t of [0.27, 0.73]) for (const [y0, y1] of [[1.1, 2.2], [3.0, 4.0]]) {
        const q = (u, v) => [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, v];
        const d = 0.55 / len;
        g.beginPath();
        [[t - d, y0], [t + d, y0], [t + d, y1], [t - d, y1]].forEach(([u, v], j) => {
          const [X, Z, y] = q(u, v); const [sx, sy] = proj(P, X, Z, y);
          if (j) g.lineTo(sx, sy); else g.moveTo(sx, sy);
        });
        g.closePath(); g.fillStyle = '#5f6e74'; g.fill();
        g.lineWidth = lw * 0.8; g.strokeStyle = '#f4ecdc'; g.stroke();
      }
    }
  }
  // Roof slopes: either side of the ridge. A slope faces the eye when the
  // eye is outside its plane.
  const mid = (P1, P2) => [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2];
  const sides = along ? [[0, 1, 3, 2], [2, 3, 1, 0]] : [[1, 2, 0, 3], [3, 0, 2, 1]];
  for (const [a, b2, oa, ob] of sides) {
    const A = C[a], B = C[b2];
    const RA = mid(A, C[oa]), RB = mid(B, C[ob]);
    // Outward normal of the slope: away from the ridge and up.
    const ox = (A[0] + B[0]) / 2 - (RA[0] + RB[0]) / 2, oz = (A[1] + B[1]) / 2 - (RA[1] + RB[1]) / 2;
    const run = Math.hypot(ox, oz) || 1, rise = ridge - eave;
    const n = [ox / run * rise, oz / run * rise, run];   // (X, Z, up)
    const ex = 0 - (A[0] + B[0]) / 2, ez = 0 - (A[1] + B[1]) / 2, ey = P.eye - eave;
    if (n[0] * ex + n[1] * ez + n[2] * ey <= 0) continue;
    face([[A[0], A[1], eave], [B[0], B[1], eave], [RB[0], RB[1], ridge], [RA[0], RA[1], ridge]], roof);
  }
  g.beginPath();
  const top0 = proj(P, ...mid(C[0], along ? C[3] : C[1]), ridge), top1 = proj(P, ...mid(along ? C[1] : C[3], C[2]), ridge);
  g.moveTo(top0[0], top0[1]); g.lineTo(top1[0], top1[1]);
  g.lineWidth = lw * 1.3; g.strokeStyle = shade(roof, 0.7); g.stroke();
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  return `rgb(${Math.round(r * f)},${Math.round(gg * f)},${Math.round(b * f)})`;
}

// ------------------------------------------------------------------ traffic

/** Each skin's colour and shape for the plain picture. */
const PLAIN = {
  'car-red': { body: '#c94b3d' }, 'car-blue': { body: '#4f80c2' }, 'car-yellow': { body: '#e3bf45' },
  pickup: { body: '#e08a3c' }, truck: { body: '#cf6b52', glass: 0.22 },
  tractor: { body: '#4e9f3d', tractor: true }, 'tractor-red': { body: '#c8463a', tractor: true },
  'tractor-blue': { body: '#3f74b8', tractor: true },
  motorbike: { body: '#d85a3a', bike: true }, bus: { body: '#d23c34', glass: 0.3 },
  binlorry: { body: '#3f8f83', glass: 0.2 }, ambulance: { body: '#f2ead2', stripe: '#3f8f5a', glass: 0.25 },
  fireengine: { body: '#d8392b', glass: 0.25 },
};
const typeOf = skin => skin.replace(/-rear$/, '');

function gatherTraffic(BV, items, P, world, cam) {
  for (const w of world.traffic.vehicles) {
    const fp = world.footprint(world.traffic, w);
    const [X, Z] = P.toCam(fp.x, fp.y);
    if (Z - fp.L / 2 < NEAR_CLIP + 0.5 || !inFrustum(P, X, Z, fp.L, TRAFFIC_M)) continue;
    // Going her way, she sees its back; coming at her, its front.
    const hx = Math.cos(fp.h), hy = Math.sin(fp.h);
    const away = hx * Math.cos(cam.yaw) + hy * Math.sin(cam.yaw) >= 0;
    const sgn = away ? -1 : 1;   // the near end is the back of one going away
    const [nX, nZ] = P.toCam(fp.x + hx * sgn * fp.L / 2, fp.y + hy * sgn * fp.L / 2);
    const [fX, fZ] = P.toCam(fp.x - hx * sgn * fp.L / 2, fp.y - hy * sgn * fp.L / 2);
    if (nZ < NEAR_CLIP + 0.3) continue;
    const v = { w, fp, nX, nZ, fX, fZ, away, type: typeOf(w.skin), H: w.H || 1.5, Wd: fp.W };
    BV.drawn.push(v);
    // One passing right by the eye (the eye is out where she is looking,
    // not where a vehicle would have to miss it) fades away rather than
    // filling the window.
    const a = clamp((nZ - 2) / 5, 0, 1);
    if (a <= 0) continue;
    items.push({ z: nZ + 0.01, draw: g => { g.globalAlpha = a; vehicle(g, BV, P, v, 1); g.globalAlpha = 1; } });
  }
}

export function vehicleAt(BV, x, y, within = 3) {
  let best = null, bd = within;
  for (const v of BV.drawn) {
    const d = Math.hypot(v.fp.x - x, v.fp.y - y);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

/** One vehicle: its shadow, its side if the eye can see one, then its near
 *  end, painted or plain. */
function vehicle(g, BV, P, v, mag) {
  const { nX, nZ, fX, fZ, Wd, H } = v;
  const C = PLAIN[v.type] || { body: '#8a9aa6' };
  const k = P.f / nZ;
  const [bx, by] = proj(P, nX, nZ, 0);
  const wpx = Wd * k, hpx = H * k;
  const lw = Math.max(0.7, P.W / 480) / mag;
  // The shadow under it, along its length.
  g.fillStyle = 'rgba(40,46,38,.28)';
  const [sx0, sy0] = proj(P, nX, nZ, 0), [sx1, sy1] = proj(P, fX, fZ, 0);
  g.beginPath();
  g.ellipse((sx0 + sx1) / 2, (sy0 + sy1) / 2, Math.abs(sx1 - sx0) / 2 + wpx * 0.55, Math.abs(sy1 - sy0) / 2 + wpx * 0.06, 0, 0, Math.PI * 2);
  g.fill();
  // The side towards the eye, a box from the near end back along its length.
  const side = Math.abs(nX) > Wd / 2 ? (nX > 0 ? -1 : 1) : 0;
  if (side) {
    const off = side * Wd / 2 * 0.98, lift = C.bike ? 0.3 : 0.25;
    const s = [nX + off, nZ, fX + off, fZ];
    if (fZ > NEAR_CLIP) {
      strip(g, P, s, lift, H * 0.92);
      g.fillStyle = shade(C.body, 0.72); g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
    }
  }
  const im = viewImage(BV, `${v.type}-${v.away ? 'rear' : 'front'}.png`);
  if (im) {
    const s = wpx / 400;
    g.drawImage(im, bx - 256 * s, by - 470 * s, 512 * s, 512 * s);
  } else {
    plain(g, bx, by, wpx, hpx, C, v.away, lw);
  }
  fade(g, P, nZ);
}

/** A plain picture of a vehicle's back or front: a rounded box in its colour
 *  with a darker outline, its window, two wheels, lights and a plate. */
function plain(g, bx, by, w, h, C, rear, lw) {
  const ink = shade(C.body, 0.55);
  if (C.bike) {
    // A rider on a motorbike: a narrow body and one wheel.
    g.fillStyle = '#2f2f33'; rr(g, bx - w * 0.14, by - h * 0.45, w * 0.28, h * 0.45, w * 0.1); g.fill();
    g.fillStyle = C.body; rr(g, bx - w * 0.32, by - h * 0.72, w * 0.64, h * 0.38, w * 0.12); g.fill();
    g.lineWidth = lw; g.strokeStyle = ink; g.stroke();
    g.fillStyle = '#e8d9b0'; g.beginPath(); g.arc(bx, by - h * 0.87, w * 0.22, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = rear ? '#d8402e' : '#fff3c4'; g.beginPath(); g.arc(bx, by - h * 0.5, Math.max(0.8, w * 0.08), 0, Math.PI * 2); g.fill();
    return;
  }
  const wheelH = h * (C.tractor ? 0.5 : 0.24), wheelW = w * (C.tractor ? 0.26 : 0.16);
  // Wheels first, peeping out under the body.
  g.fillStyle = '#2c2c30';
  rr(g, bx - w / 2 + w * 0.03, by - wheelH, wheelW, wheelH, wheelW * 0.3); g.fill();
  rr(g, bx + w / 2 - w * 0.03 - wheelW, by - wheelH, wheelW, wheelH, wheelW * 0.3); g.fill();
  if (C.tractor) {
    // A tractor: a narrow bonnet or hitch low down, a tall glass cab on top.
    g.fillStyle = C.body; rr(g, bx - w * 0.22, by - h * 0.55, w * 0.44, h * 0.42, w * 0.05); g.fill();
    g.lineWidth = lw; g.strokeStyle = ink; g.stroke();
    g.fillStyle = 'rgba(205,226,232,.9)'; rr(g, bx - w * 0.3, by - h, w * 0.6, h * 0.46, w * 0.05); g.fill();
    g.strokeStyle = ink; g.stroke();
    g.fillStyle = C.body; g.fillRect(bx - w * 0.33, by - h * 1.02, w * 0.66, h * 0.07);
  } else {
    g.fillStyle = C.body; rr(g, bx - w / 2, by - h * 0.97, w, h * 0.82, w * 0.12); g.fill();
    g.lineWidth = lw; g.strokeStyle = ink; g.stroke();
    if (C.stripe) { g.fillStyle = C.stripe; g.fillRect(bx - w / 2 + lw, by - h * 0.48, w - 2 * lw, h * 0.08); }
    // The back window or the windscreen.
    const gl = C.glass ?? 0.34;
    g.fillStyle = 'rgba(190,214,224,.95)';
    rr(g, bx - w * 0.38, by - h * 0.9, w * 0.76, h * gl, w * 0.06); g.fill();
    g.lineWidth = lw * 0.8; g.strokeStyle = ink; g.stroke();
  }
  // Lights at the corners, and a plate: yellow at the back, white at the
  // front, as in Britain.
  const ly = by - h * (C.tractor ? 0.45 : 0.4), lr = Math.max(0.7, w * 0.07);
  g.fillStyle = rear ? '#d8402e' : '#fff3c4';
  for (const sx of [-1, 1]) {
    g.beginPath();
    if (rear) g.rect(bx + sx * w * 0.36 - lr, ly - lr * 0.7, lr * 2, lr * 1.4);
    else g.arc(bx + sx * w * 0.34, ly, lr, 0, Math.PI * 2);
    g.fill(); g.lineWidth = lw * 0.6; g.strokeStyle = ink; g.stroke();
  }
  g.fillStyle = rear ? '#f2cf3a' : '#f6f4ec';
  g.fillRect(bx - w * 0.15, by - h * 0.3, w * 0.3, h * 0.08);
}

function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** The vehicle again, for the magnifier: ctx is already set so that
 *  internal px land where they should, k times larger. */
export function drawVehicleAt(g, BV, P, v, k) {
  vehicle(g, BV, P, v, k);
}
