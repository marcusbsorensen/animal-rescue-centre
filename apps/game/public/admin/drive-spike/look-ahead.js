// look-ahead.js — the look-ahead window over the top of the road view.
//
// Lily, 2026-10-12: "we need to see more ahead on the road as we don't know
// why we can't overtake, so maybe have a 16:9 style view that opens up at
// the very top of the screen to give us a preview of what we can see when
// we peek out behind the vehicle in front". Marcus, the same day: it
// "could slide in from the right at the top so it's anchored to the
// movement she is making with the vehicle, with the back of the vehicle
// ahead moving to the left on the look-ahead panel".
//
// So while she pokes out to look (37A), a 16:9 window framed in the GPS's
// painted bezel slides in from the right edge at the top, as far in as she
// is poking out: it opens as she eases out and closes as she eases back.
// It is a second camera into the same top-down world, turned with the main
// camera, so the road in it runs the way the road on screen runs. Eased
// out a little, it sits close behind the vehicle in front; eased out all
// the way, it pulls back along the oncoming lane until it frames whatever
// makes the overtake unsafe (a vehicle coming, a bend, the road ending),
// ringed (and, when it is far enough to be small, shown close up in a round
// magnifier beside the ring), with the same wait or go sign as the one by
// the centre line. As
// she eases out its camera moves out to the oncoming lane and on past it,
// so the vehicle in front slides left across it and the oncoming lane and
// the road beyond open up on its right; while only part of the window is
// in, the picture is centred on that part. Under reduced motion it does
// not slide: it is there or it is not.
//
// It never covers the van: its height gives way to keep clear of the van's
// roof. The page fades the label chips while it covers them.
//
// Contract with drive-spike.html:
//   create(route)               route = { atDistance(s), laneOffset(lane, s), length() }
//   step(LA, dt, p, reduce)     p: how far she is poking out, 0..1 (0 = closed)
//   rect(LA, w, h, vanTop)      the window's outside as it is now, or null
//                               when shut, { x, y, w, h }
//   draw(ctx, LA, w, h, s, drawWorld, paint)
//       s = { camH, van: { s, x, y, front }, reason: { s, lat, r } | null,
//             horizon, safe, vanTop, season, sun, reduce }
//       reason is what makes lane 1 unsafe, at distance s along the route,
//       lat metres off the centreline, r metres round; horizon is how far
//       along the route to show when nothing does. drawWorld(view, roadR)
//       draws the world under a transform the window has set, as the main
//       view's is drawn. paint = { frame(ctx, x, y, w, h, b) -> screen,
//       glass(ctx, screen) }: the dashboard's bezel and glass, or null for
//       a plain one. Returns the window's outside, or null when shut.

const ASPECT = 16 / 9;
const TOP = 6;               // px from the screen's top
const SIDE = 8;              // px from the screen's side
const BEZEL = 11;            // px, the painted frame
const CLEAR_OF_VAN = 14;     // px kept between the window and the van's roof
const MIN_INNER_H = 70;      // smaller than this and the window stays shut

/** The two framings she moves between as she eases out. */
const CLOSE = { ahead: 28, ppmMin: 3.2, ppmMax: 6 };   // close behind the vehicle in front
const FAR = { ppmMin: 1.15, ppmMax: 6, margin: 15 };   // out to the reason
/** Eased out all the way, everything in the window has slid this share of
 *  its width to the left, on top of the camera moving out to the oncoming
 *  lane: the vehicle in front goes left, the road beyond opens on its
 *  right. */
const SLIDE = 0.07;

const OPEN_RATE = 14;        // per second: how closely the slide follows her
const SNAP = 0.12;           // reduced motion: open past this much of a look

export function create(route) {
  return { route, p: 0, q: 0, t: 0, cam: null };
}

/** p is how far she is poking out, 0 to 1. q is how far the window is in. */
export function step(LA, dt, p, reduce) {
  LA.p = p;
  LA.t += dt; LA.dt = dt;
  if (reduce) LA.q = p > SNAP ? 1 : 0;
  else LA.q += (p - LA.q) * (1 - Math.exp(-OPEN_RATE * dt));
  if (LA.q < 0.004) { LA.q = 0; LA.cam = null; }
}

/** Where the window sits fully in, for a w x h screen: across the top held
 *  upright; at the top right held sideways, where the chips keep the left. */
function home(w, h, vanTop) {
  let ow = w > h ? Math.min(w * 0.44, 600) : w - 2 * SIDE;
  let oh = ow / ASPECT;
  const room = vanTop - CLEAR_OF_VAN - TOP;
  if (oh > room) { oh = room; ow = oh * ASPECT; }
  if (oh - 2 * BEZEL < MIN_INNER_H) return null;
  return { x: w - SIDE - ow, y: TOP, w: ow, h: oh };
}

export function rect(LA, w, h, vanTop) {
  if (LA.q <= 0) return null;
  const H = home(w, h, vanTop);
  if (!H) return null;
  // Slid in from the right edge by q of the way.
  return { ...H, x: w + (H.x - w) * LA.q };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = t => t * t * (3 - 2 * t);

/** One framing: the stretch of route from sA to sB at latAt(s) metres off
 *  the centreline, fitted into the window's screen (iw x ih px), in the
 *  window's own frame (metres, x right, y down the screen, from the van).
 *  When it will not fit at ppmMin, the keep end stays in. */
function frameOf(LA, s, sA, sB, latAt, iw, ih, lim, keepFar, extra) {
  const { atDistance } = LA.route;
  const c = Math.cos(s.rot), sn = Math.sin(s.rot);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, near = null, far = null;
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const d = sA + (sB - sA) * i / n;
    const p = atDistance(d), lat = latAt(d);
    const wx = p.x - Math.sin(p.h) * lat - s.van.x, wy = p.y + Math.cos(p.h) * lat - s.van.y;
    const x = wx * c - wy * sn, y = wx * sn + wy * c;
    if (i === 0) near = { x, y };
    if (i === n) far = { x, y };
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  // And the reason itself, ring and all, so the ring is never cut off.
  if (extra) {
    const wx = extra.x - s.van.x, wy = extra.y - s.van.y;
    const x = wx * c - wy * sn, y = wx * sn + wy * c, r = extra.pad;
    x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r);
    if (keepFar) far = { x, y };
  }
  const m = 12;   // px kept clear inside the bezel
  const fit = Math.min((iw - 2 * m) / Math.max(1, x1 - x0), (ih - 2 * m) / Math.max(1, y1 - y0));
  const ppm = clamp(fit, lim.ppmMin, lim.ppmMax);
  let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (fit < ppm) {
    const k = keepFar ? far : near;
    const hw = iw / 2 / ppm - m / ppm, hh = ih / 2 / ppm - m / ppm;
    cx = clamp(cx, k.x - hw, k.x + hw);
    cy = clamp(cy, k.y - hh, k.y + hh);
  }
  return { cx, cy, ppm, keep: keepFar ? far : near };
}

export function draw(ctx, LA, w, h, s, drawWorld, paint) {
  const R0 = rect(LA, w, h, s.vanTop);
  if (!R0) return null;
  const { atDistance, laneOffset, length } = LA.route;
  const end = length() - 1;
  const rot = -s.camH - Math.PI / 2;
  const st = { ...s, rot };

  // The frame, then the world inside it.
  const R = paint ? paint.frame(ctx, R0.x, R0.y, R0.w, R0.h, BEZEL) : inset(R0);
  const iw = R.w, ih = R.h;

  const e = smooth(clamp(LA.p, 0, 1));
  const off0 = d => laneOffset(0, clamp(d, 0, end));
  const off1 = d => laneOffset(1, clamp(d, 0, end));
  // The camera's lane: hers, moving out to the oncoming lane as she looks.
  const latAt = d => off0(d) + e * (off1(d) - off0(d));
  const sA = clamp(s.van.front - 3, 0, end);
  const close = frameOf(LA, st, sA, clamp(sA + CLOSE.ahead, 0, end), latAt, iw, ih, CLOSE, false);
  const farS = clamp(s.reason ? s.reason.s + FAR.margin : s.horizon, sA + CLOSE.ahead, end);
  let spot = null;
  if (s.reason) {
    const p = atDistance(clamp(s.reason.s, 0, end));
    spot = { x: p.x - Math.sin(p.h) * s.reason.lat, y: p.y + Math.cos(p.h) * s.reason.lat, pad: s.reason.r + 4 };
  }
  const far = frameOf(LA, st, sA, farS, latAt, iw, ih, FAR, true, spot);
  const target = {
    cx: lerp(close.cx, far.cx, e), cy: lerp(close.cy, far.cy, e),
    ppm: Math.exp(lerp(Math.log(close.ppm), Math.log(far.ppm), e)),
  };
  // The slide: the camera moves on to the right, so the picture goes left.
  target.cx += e * SLIDE * iw / target.ppm;
  // Whatever it is framing out to stays in the picture.
  if (e > 0.5) {
    const hw = iw / 2 / target.ppm - 12 / target.ppm, hh = ih / 2 / target.ppm - 12 / target.ppm;
    target.cx = clamp(target.cx, far.keep.x - hw, far.keep.x + hw);
    target.cy = clamp(target.cy, far.keep.y - hh, far.keep.y + hh);
  }
  // Ease towards the framing, so a reason appearing or going does not jump
  // the picture; from the first frame open, start there.
  if (!LA.cam) LA.cam = target;
  else {
    const k = 1 - Math.exp(-7 * (LA.dt ?? 1 / 60));
    LA.cam = {
      cx: lerp(LA.cam.cx, target.cx, k), cy: lerp(LA.cam.cy, target.cy, k),
      ppm: Math.exp(lerp(Math.log(LA.cam.ppm), Math.log(target.ppm), k)),
    };
  }
  const { cy, ppm } = LA.cam;
  // While it is still sliding in, only its left part is on screen: the
  // picture is centred on that part, so the road shows from the first
  // sliver and slides left with the window as she eases out.
  const visR = Math.min(R.x + R.w, w - SIDE - BEZEL);
  const cx = LA.cam.cx + (R.x + R.w / 2 - (R.x + visR) / 2) / ppm;
  // Back from the window's frame to the world.
  const c = Math.cos(rot), sn = Math.sin(rot);
  const wx = s.van.x + cx * c + cy * sn, wy = s.van.y - cx * sn + cy * c;

  ctx.save();
  screenPath(ctx, R); ctx.clip();
  ctx.fillStyle = '#8fbf6a'; ctx.fillRect(R.x, R.y, R.w, R.h);
  ctx.save();
  ctx.translate(R.x + R.w / 2, R.y + R.h / 2);
  ctx.rotate(rot);
  ctx.scale(ppm, ppm);
  ctx.translate(-wx, -wy);
  const radius = Math.hypot(R.w, R.h) / 2 / ppm + 6;
  drawWorld({ cx: wx, cy: wy, radius, camH: s.camH, ppm, season: s.season, sun: s.sun }, radius);
  ctx.restore();

  // What makes it unsafe, ringed: amber, breathing unless reduced motion.
  const toPx = (X, Y) => {
    const dx = X - wx, dy = Y - wy;
    return [R.x + R.w / 2 + (dx * c - dy * sn) * ppm, R.y + R.h / 2 + (dx * sn + dy * c) * ppm];
  };
  const sr = clamp(R.h * 0.11, 12, 18);
  if (spot && !s.safe) {
    const [x, y] = toPx(spot.x, spot.y);
    const beat = s.reduce ? 0 : 0.5 + 0.5 * Math.sin(LA.t * 2 * Math.PI * 1.1);
    const r = Math.max(11, s.reason.r * ppm) + 3 * beat;
    ring(ctx, x, y, r);
    // Pulled far back, a car coming is a few pixels long, so it is also
    // shown close up in a round magnifier beside its ring, joined to it.
    const rb = clamp(ih * 0.3, 32, 72);
    const zoomB = clamp((2 * rb) / (2 * s.reason.r + 14), 4, 9);
    if (e > 0.55 && zoomB > ppm * 1.8) {
      const a = clamp((e - 0.55) / 0.3, 0, 1);
      const gap = r + rb + 12;
      let bx = x + gap;
      if (bx + rb + 6 > visR - 2 * sr - 12) bx = x - gap;
      bx = clamp(bx, R.x + rb + 6, visR - rb - 6);
      const by = clamp(y + rb * 0.4, R.y + rb + 6, R.y + R.h - rb - 6);
      ctx.save();
      ctx.globalAlpha = a;
      const d = Math.hypot(bx - x, by - y) || 1, ux = (bx - x) / d, uy = (by - y) / d;
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#e2a23b';
      ctx.beginPath(); ctx.moveTo(x + ux * r, y + uy * r); ctx.lineTo(bx - ux * rb, by - uy * rb); ctx.stroke();
      ctx.save();
      ctx.beginPath(); ctx.arc(bx, by, rb, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#8fbf6a'; ctx.fillRect(bx - rb, by - rb, 2 * rb, 2 * rb);
      ctx.translate(bx, by); ctx.rotate(rot); ctx.scale(zoomB, zoomB); ctx.translate(-spot.x, -spot.y);
      const rB = rb / zoomB + 4;
      drawWorld({ cx: spot.x, cy: spot.y, radius: rB, camH: s.camH, ppm: zoomB, season: s.season, sun: s.sun }, rB);
      ctx.restore();
      ring(ctx, bx, by, rb);
      ctx.restore();
    }
  }
  // The same wait or go sign as by the centre line, at the right of what is
  // in so far, so it shows from the first sliver.
  cue(ctx, visR - sr - 8, R.y + R.h - sr - 8, sr, s.safe);
  if (paint) paint.glass(ctx, R);
  ctx.restore();
  LA.drawn = { R0, R, ppm, cx: wx, cy: wy };
  return R0;
}

/** An amber ring with a cream rim. */
function ring(ctx, x, y, r) {
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,250,240,.9)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#e2a23b';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}

function inset(R0) {
  return { x: R0.x + BEZEL, y: R0.y + BEZEL, w: R0.w - 2 * BEZEL, h: R0.h - 2 * BEZEL, r: BEZEL * 0.45 };
}
function screenPath(ctx, R) {
  const r = R.r;
  ctx.beginPath();
  ctx.moveTo(R.x + r, R.y);
  ctx.arcTo(R.x + R.w, R.y, R.x + R.w, R.y + R.h, r);
  ctx.arcTo(R.x + R.w, R.y + R.h, R.x, R.y + R.h, r);
  ctx.arcTo(R.x, R.y + R.h, R.x, R.y, r);
  ctx.arcTo(R.x, R.y, R.x + R.w, R.y, r);
  ctx.closePath();
}

/** The wait or go sign (37A): green with an arrow up the road for go, amber
 *  with two bars for wait, a cream rim. No words. Also drawn by the page by
 *  the centre line ahead of the van. */
export function cue(ctx, x, y, r, safe, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = safe ? '#3b9d58' : '#e2a23b'; ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.16); ctx.strokeStyle = '#fffaf0'; ctx.stroke();
  ctx.fillStyle = '#fffaf0';
  if (safe) {
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.62); ctx.lineTo(r * 0.5, -r * 0.05); ctx.lineTo(r * 0.18, -r * 0.05);
    ctx.lineTo(r * 0.18, r * 0.55); ctx.lineTo(-r * 0.18, r * 0.55); ctx.lineTo(-r * 0.18, -r * 0.05);
    ctx.lineTo(-r * 0.5, -r * 0.05); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillRect(-r * 0.38, -r * 0.45, r * 0.26, r * 0.9);
    ctx.fillRect(r * 0.12, -r * 0.45, r * 0.26, r * 0.9);
  }
  ctx.restore();
}
