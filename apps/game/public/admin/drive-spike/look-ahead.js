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
// Under reduced motion it does not slide: it is there or it is not.
//
// What is in it (decision 54B, Marcus, after Lily asked to see why she
// cannot overtake): the road ahead seen from behind her van, at the eye
// height of whoever drives it, looking forward along her route from where
// she has poked out to. The back of the vehicle she follows is on the
// left, her lane and the oncoming lane run ahead, and anything coming
// towards her shows its front. "We are not showing a rear view mirror or
// anything that comes from the top": no mirror, nothing from above.
// behind-view.js draws the picture; this file places the camera, the
// window, the ring and the sign.
//
// As she eases out the camera moves right, out to the oncoming lane and a
// little past it, so the vehicle in front slides left and the oncoming road
// opens up. Eased out all the way, it looks towards whatever makes the
// overtake unsafe (a vehicle coming, a bend, the road ending, a farm track)
// and narrows in on it until it reads, ringed in amber (and, when a vehicle
// coming is still small, shown close up in a round magnifier beside the
// ring), with the same wait or go sign as the one by the centre line. While
// only part of the window is in, the picture is centred on that part.
//
// It never covers the van: its height gives way to keep clear of the van's
// roof. The page fades the label chips while it covers them.
//
// Contract with drive-spike.html:
//   create(route)               route = { atDistance(s), laneOffset(lane, s), length() }
//   step(LA, dt, p, reduce)     p: how far she is poking out, 0..1 (0 = closed)
//   rect(LA, w, h, vanTop)      the window's outside as it is now, or null
//                               when shut, { x, y, w, h }
//   draw(ctx, LA, w, h, s, world, paint)
//       s = { van: { s, front, id }, reason: { s, lat, r } | null,
//             horizon, safe, vanTop, season, sun, reduce }
//       reason is what makes lane 1 unsafe, at distance s along the route,
//       lat metres off the centreline, r metres round; horizon is how far
//       along the route the camera aims when nothing does. world = {
//       ground(g, view, radius): the page's ground and roads into g under a
//       transform the window has set; scenery, traffic, footprint(T, w) }.
//       paint = { frame(ctx, x, y, w, h, b) -> screen, glass(ctx, screen) }:
//       the dashboard's bezel and glass, or null for a plain one. Returns
//       the window's outside, or null when shut.

import * as behind from './behind-view.js';

const ASPECT = 16 / 9;
const TOP = 6;               // px from the screen's top
const SIDE = 8;              // px from the screen's side
const BEZEL = 11;            // px, the painted frame
const CLEAR_OF_VAN = 14;     // px kept between the window and the van's roof
const MIN_INNER_H = 70;      // smaller than this and the window stays shut

/** Eye heights, metres above the road, of whoever drives each van. */
const EYE = { trikey: 1.1, henry: 1.6, bea: 1.6, spark: 1.6, 'big-tilly': 2.4 };
const BEHIND_M = 1;          // the eye is this far behind her van's tail (her van itself is not drawn)
const AIM_M = 32;            // the camera looks at the route this far ahead
const PAST_M = 0.7;          // eased out all the way, the eye is this far past the oncoming lane's middle
const HFOV = 68 * Math.PI / 180;   // across the window, before it narrows in on a reason
const F0 = 0.5 / Math.tan(HFOV / 2);
const ZOOM_MAX = 1.7;        // how far it may narrow in on a reason: no further, so the vehicle in front stays in
const REASON_PX = 30;        // and it narrows until the reason is about this wide on screen
const HORIZON = 0.42;        // the horizon's height, as a share of the window from the top

const OPEN_RATE = 14;        // per second: how closely the slide follows her
const SNAP = 0.12;           // reduced motion: open past this much of a look

export function create(route) {
  return { route, p: 0, q: 0, t: 0, cam: null, bv: null };
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
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/** A point lat metres off the route's centreline at distance d. */
function along(route, d, lat) {
  const p = route.atDistance(d);
  return { x: p.x - Math.sin(p.h) * lat, y: p.y + Math.cos(p.h) * lat };
}

/** Where the camera is and what it looks at, for how far out she is (e),
 *  eased so a reason appearing or going does not jump the picture. */
function camera(LA, s, iw, cxFrac) {
  const { laneOffset, length } = LA.route;
  const end = length() - 1;
  const e = smooth(clamp(LA.p, 0, 1));
  const latAt = d => {
    const a = laneOffset(0, clamp(d, 0, end)), b = laneOffset(1, clamp(d, 0, end));
    return a + e * (b - a + Math.sign(b - a) * PAST_M);
  };
  const sEye = clamp(2 * s.van.s - s.van.front - BEHIND_M, 0, end);
  const eye = along(LA.route, sEye, latAt(sEye));
  const sAim = clamp(sEye + AIM_M, 0, end);
  const aim = along(LA.route, sAim, latAt(sAim));
  let yaw = Math.atan2(aim.y - eye.y, aim.x - eye.x);
  let f = F0;
  // Eased out past halfway, it turns and narrows in on what blocks her.
  const eFar = smooth(clamp((e - 0.5) / 0.5, 0, 1));
  let spot = null;
  if (s.reason) {
    const sr = clamp(s.reason.s, 0, end);
    spot = { ...along(LA.route, sr, s.reason.lat), r: s.reason.r };
    const dx = spot.x - eye.x, dy = spot.y - eye.y, dist = Math.hypot(dx, dy);
    if (eFar > 0 && dist > 4) {
      const rel = wrap(Math.atan2(dy, dx) - yaw);
      const want = clamp(REASON_PX * dist / (2 * spot.r * iw), F0, F0 * ZOOM_MAX);
      f = Math.exp(lerp(Math.log(F0), Math.log(want), eFar));
      // Keep it inside the middle of what the narrower view shows.
      const lim = Math.atan2(0.32, f);
      if (Math.abs(rel) > lim) yaw += (rel - Math.sign(rel) * lim) * eFar;
    }
  }
  const target = { yaw, f };
  if (!LA.cam) LA.cam = target;
  else {
    const k = 1 - Math.exp(-7 * (LA.dt ?? 1 / 60));
    LA.cam = { yaw: LA.cam.yaw + wrap(target.yaw - LA.cam.yaw) * k, f: Math.exp(lerp(Math.log(LA.cam.f), Math.log(target.f), k)) };
  }
  return {
    cam: { x: eye.x, y: eye.y, yaw: LA.cam.yaw, eye: EYE[s.van.id] ?? EYE.henry, f: LA.cam.f, cx: cxFrac, yH: HORIZON },
    spot, e,
  };
}

export function draw(ctx, LA, w, h, s, world, paint) {
  const R0 = rect(LA, w, h, s.vanTop);
  if (!R0) return null;
  if (!LA.bv) LA.bv = behind.create();

  // The frame, then the picture inside it.
  const R = paint ? paint.frame(ctx, R0.x, R0.y, R0.w, R0.h, BEZEL) : inset(R0);
  // While it is still sliding in, only its left part is on screen: the
  // picture is centred on that part, so the road shows from the first
  // sliver and slides left with the window as she eases out.
  const visR = Math.min(R.x + R.w, w - SIDE - BEZEL);
  const cxFrac = clamp(((R.x + visR) / 2 - R.x) / R.w, 0, 1);
  const { cam, spot, e } = camera(LA, s, R.w, cxFrac);
  const shot = behind.render(LA.bv, cam, { ...world, season: s.season, sun: s.sun }, { w: R.w, h: R.h });

  ctx.save();
  screenPath(ctx, R); ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(LA.bv.out.el, R.x, R.y, R.w, R.h);

  // What makes it unsafe, ringed: amber, breathing unless reduced motion.
  const sr = clamp(R.h * 0.11, 12, 18);
  const toScreen = (x, y) => [R.x + x / shot.scale, R.y + y / shot.scale];
  if (spot && !s.safe) {
    const v = behind.vehicleAt(LA.bv, spot.x, spot.y, spot.r + 2);
    let pt = null, rr = 0;
    if (v) {
      const k = shot.P.f / v.nZ;
      pt = [shot.P.cx + k * v.nX, shot.P.yH + k * (shot.P.eye - v.H / 2)];
      rr = Math.max(v.Wd, v.H) * 0.75 * k / shot.scale;
    } else {
      const p = shot.project(spot.x, spot.y, 0.5);
      if (p) { pt = [p.x, p.y]; rr = spot.r * p.k / shot.scale; }
    }
    if (pt) {
      let [x, y] = toScreen(pt[0], pt[1]);
      const beat = s.reduce ? 0 : 0.5 + 0.5 * Math.sin(LA.t * 2 * Math.PI * 1.1);
      const r = clamp(rr, 11, R.h * 0.36) + 3 * beat;   // a bend close by would ring the whole window
      x = clamp(x, R.x + 6, visR - 6); y = clamp(y, R.y + 6, R.y + R.h - 6);
      ring(ctx, x, y, r);
      // Far up the road, a vehicle coming is a few pixels across, so it is
      // also shown close up in a round magnifier beside its ring, joined
      // to it: the same picture, larger, never a view from above.
      const rb = clamp(R.h * 0.3, 32, 72);
      const wpx = v ? v.Wd * shot.P.f / v.nZ / shot.scale : 99;
      if (v && e > 0.55 && wpx < rb * 0.45) {
        const a = clamp((e - 0.55) / 0.3, 0, 1);
        const gap = r + rb + 12;
        // To the right of the ring where there is room, clear of the vehicle
        // in front on the left and of the sign at the bottom right.
        let bx = x + gap;
        if (bx + rb > visR - 6) bx = x - gap;
        bx = clamp(bx, R.x + rb + 6, visR - rb - 6);
        const by = clamp(y + rb * 0.2, R.y + rb + 6, R.y + R.h - rb - 2 * sr - 14);
        const m = clamp(rb * 1.1 / (v.Wd * shot.P.f / v.nZ), 1.5, 14);   // screen px per internal px
        ctx.save();
        ctx.globalAlpha = a;
        const d = Math.hypot(bx - x, by - y) || 1, ux = (bx - x) / d, uy = (by - y) / d;
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#e2a23b';
        ctx.beginPath(); ctx.moveTo(x + ux * r, y + uy * r); ctx.lineTo(bx - ux * rb, by - uy * rb); ctx.stroke();
        ctx.save();
        ctx.beginPath(); ctx.arc(bx, by, rb, 0, Math.PI * 2); ctx.clip();
        ctx.translate(bx, by); ctx.scale(m, m); ctx.translate(-pt[0], -pt[1]);
        ctx.drawImage(LA.bv.out.el, 0, 0);
        behind.drawVehicleAt(ctx, LA.bv, shot.P, v, m);
        ctx.restore();
        ring(ctx, bx, by, rb);
        ctx.restore();
      }
    }
  }
  // The same wait or go sign as by the centre line, at the right of what is
  // in so far, so it shows from the first sliver.
  cue(ctx, visR - sr - 8, R.y + R.h - sr - 8, sr, s.safe);
  if (paint) paint.glass(ctx, R);
  ctx.restore();
  LA.drawn = { R0, R, ms: shot.ms, scale: shot.scale, prof: LA.bv.prof, f: cam.f, yaw: cam.yaw, eye: cam.eye };
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
