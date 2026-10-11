// Steve, the car wash's inflatable tube man (decision 29A).
//
// Contract:
//   const steve = create(seed, { reducedMotion })
//   steve.step(dt)                      // seconds; any frame rate
//   steve.draw(ctx, x, y, scale, opts)  // x,y = centre of the fan base on the
//                                       // ground, scale = pixels per metre
//
// Model units are metres (he is about 5.4 m tall), so the driving world can
// pass BASE_PPM * zoom straight in. Painted in code, not a sprite, because the
// whole point is that his shape changes every frame.
//
// Rig: an angle chain. Each tube segment has an absolute angle (0 = straight
// up, positive leans to screen right) pulled by a spring towards its parent's
// angle plus a target bend. Springing to the parent rather than holding a
// relative angle makes the upper tube lag, so a lean travels up him like a
// whip. Gravity acts as on an inverted pendulum; air pressure (`P`) sets the
// spring strength, so letting the air out is all a collapse needs.

const TAU = Math.PI * 2;

// Sizes in metres.
const FAN_W = 0.78;
const FAN_H = 0.46;
const N = 10;               // body segments, fan to collar
const SEG = 0.4;
const TUBE_W = 0.62;
const HEAD_RX = 0.5;
const HEAD_RY = 0.54;
const ARM_N = 4;
const ARM_SEG = 0.3;
const ARM_W = 0.25;
const SHOULDER = N - 1;     // arms leave the top segment

// The palette follows the brief's colour pulls; the ink is the warm
// dark brown of the painted animals' contours, not black.
const INK = '#3b2a24';
const BLUE = { edge: '#3f5f9c', shade: '#5a82c4', base: '#7ba4df', light: '#a9c7ee', hi: '#e2eefb' };
const RED = { edge: '#8f2127', shade: '#b52c30', base: '#da3435', light: '#ee6a5c', hi: '#ffc0b0' };
const CAP = { edge: '#33558f', shade: '#4d75b8', base: '#6a97d9', light: '#9dbdea', hi: '#dce9fa' };
const SKIN = { shade: '#e6ae94', base: '#f8d6c2', hi: '#fff1e8', blush: 'rgba(240,120,120,0.45)' };
const HAIR = '#5b3a2a';
const FAN = { edge: '#1d1d22', side: '#34343c', top: '#5a5a66', hi: '#8a8a98', grille: '#1a1a1f' };

// Fixed physics tick: the rig behaves the same at 30, 60 or 120 fps.
const TICK = 1 / 60;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function create(seed = 1, options = {}) {
  const rnd = mulberry32(seed || 1);
  const r = (lo, hi) => lo + (hi - lo) * rnd();
  const sign = () => (rnd() < 0.5 ? -1 : 1);

  let reduced = !!options.reducedMotion;

  // Body: N tube segments plus the head as a short, softer last link so it
  // nods on its own.
  const a = new Float64Array(N + 1);
  const v = new Float64Array(N + 1);
  const target = new Float64Array(N + 1);
  const kink = new Float64Array(N + 1);
  // Arms. Right is HIS right, the viewer's left, as he faces us: Marcus's
  // unit flaps the right arm (README, 2026-04-24).
  const ra = new Float64Array(ARM_N), rv = new Float64Array(ARM_N);
  const la = new Float64Array(ARM_N), lv = new Float64Array(ARM_N);

  for (let i = 0; i <= N; i++) a[i] = r(-0.02, 0.02);
  for (let i = 0; i < ARM_N; i++) { ra[i] = -1.2; la[i] = 2.6; }

  const s = {
    t: 0,
    acc: 0,
    P: 1,            // air pressure: 1 = fully up, ~0.15 = sagging
    // Sway is sample-and-hold, not a smooth curve: the target jumps and the
    // springs overshoot, which is where the jank comes from.
    swayAmp: 0, swayShape: 0, swayNext: 0,
    kinkUntil: 0, kinkNext: r(0.5, 1.5),
    gustNext: r(0.3, 1.0),
    flapUp: true, flapNext: 0, flapTarget: -1.0, whipNext: r(1.5, 3.5),
    lowTarget: 2.6, lowNext: 0,
    phase: 'up', phaseUntil: r(3.5, 7), foldJoint: 4, foldDir: 1,
    grin: 0,
  };

  function scheduleSway() {
    s.swayAmp = r(0.04, 0.2) * sign();
    // 0 = a C-bend, 1 = an S-bend (lower half one way, upper the other).
    s.swayShape = rnd() < 0.4 ? 1 : 0;
    s.swayNext = s.t + r(0.18, 0.6);
  }

  function updateEvents() {
    const t = s.t;
    if (reduced) {
      // Gentle and predictable: slow sines, no events.
      for (let i = 0; i < N; i++) target[i] = 0.035 * Math.sin(t * 0.9 + i * 0.35) + 0.015 * Math.sin(t * 0.37 + seed);
      target[N] = 0.08 * Math.sin(t * 1.1);
      kink.fill(0);
      s.P = 1;
      s.flapTarget = -1.35 + 0.35 * Math.sin(t * 2.2);
      s.lowTarget = 2.6;
      return;
    }

    if (t >= s.swayNext) scheduleSway();
    for (let i = 0; i < N; i++) {
      const h = i / (N - 1);
      const shape = s.swayShape ? (h < 0.5 ? 1 : -1.2) : 1;
      target[i] = s.swayAmp * shape * (0.3 + h);
    }
    target[N] = -s.swayAmp * 0.8; // the head counters the lean, slightly late

    // Brief buckles somewhere along the tube: the fabric snaps in at a fold.
    if (t >= s.kinkNext) {
      kink.fill(0);
      const j = 2 + Math.floor(rnd() * (N - 3));
      kink[j] = r(0.35, 0.8) * sign();
      s.kinkUntil = t + r(0.08, 0.25);
      s.kinkNext = t + r(0.5, 1.8);
    } else if (t >= s.kinkUntil) {
      kink.fill(0);
    }

    // Gusts kick the whole tube, harder near the top.
    if (t >= s.gustNext) {
      const g = r(1.5, 4.5) * sign();
      for (let i = 0; i <= N; i++) v[i] += g * (0.2 + i / N);
      s.gustNext = t + r(0.35, 1.4);
    }

    // Partial collapse: the air drops, he folds at the waist, the head
    // flops; then the fan wins and he springs back up past straight.
    if (s.phase === 'up' && t >= s.phaseUntil) {
      s.phase = 'sag';
      s.phaseUntil = t + r(0.2, 0.35);
      s.foldJoint = 3 + Math.floor(rnd() * 3);
      s.foldDir = sign();
    } else if (s.phase === 'sag' && t >= s.phaseUntil) {
      s.phase = 'down';
      s.phaseUntil = t + r(0.3, 0.9);
    } else if (s.phase === 'down' && t >= s.phaseUntil) {
      s.phase = 'reinflate';
      s.phaseUntil = t + r(0.35, 0.55);
      for (let i = 0; i <= N; i++) v[i] -= s.foldDir * r(2, 4); // the snap back
    } else if (s.phase === 'reinflate' && t >= s.phaseUntil) {
      s.phase = 'up';
      s.phaseUntil = t + r(3.5, 8.5);
    }
    if (s.phase === 'sag') s.P = Math.max(0.14, s.P - 4.2 * TICK);
    else if (s.phase === 'down') s.P = 0.14;
    else if (s.phase === 'reinflate') s.P = 1.45; // over-pressure, no easing
    else s.P = 1;
    if (s.phase === 'sag' || s.phase === 'down') {
      target[s.foldJoint] += s.foldDir * 1.25;
      target[s.foldJoint + 1] += s.foldDir * 0.5;
      target[N] += s.foldDir * 0.7;
    }

    // Right arm: big flap, flop, big flap, flop, at uneven beats.
    if (t >= s.flapNext) {
      s.flapUp = !s.flapUp;
      s.flapTarget = s.flapUp ? -r(0.35, 1.05) : -r(1.9, 2.5);
      s.flapNext = t + (s.flapUp ? r(0.16, 0.42) : r(0.12, 0.36));
      rv[0] += (s.flapUp ? 1 : -1) * -r(2, 6);
    }
    if (t >= s.whipNext) {
      // A sharp whip: the tip cracks over while the root barely moves.
      const w = r(9, 16) * (rnd() < 0.7 ? -1 : 1);
      rv[ARM_N - 1] += w; rv[ARM_N - 2] += w * 0.6;
      s.whipNext = t + r(1.2, 3.8);
    }
    // Left arm stays low, with the odd twitch.
    if (t >= s.lowNext) {
      s.lowTarget = rnd() < 0.15 ? r(2.0, 2.25) : r(2.45, 2.75);
      s.lowNext = t + r(0.3, 1.2);
    }
  }

  function chainBody() {
    const P = s.P;
    const K = reduced ? 140 : 270;
    const C = reduced ? 14 : 5.5;
    const G = 15 * (1 - 0.75 * Math.min(P, 1));
    for (let i = 0; i <= N; i++) {
      const parent = i === 0 ? 0 : a[i - 1];
      const rel = a[i] - parent;
      const isHead = i === N;
      const stiff = isHead ? 0.45 : 1 - 0.35 * (i / N);
      const k = K * stiff * (0.12 + 0.88 * P);
      const mass = isHead ? 0.4 : (N + 1 - i) / (N + 1);
      let acc = -k * (rel - target[i] - kink[i]) - C * v[i] + G * Math.sin(a[i]) * mass;
      if (!reduced && rnd() < 0.04) acc += r(-60, 60) * (0.3 + i / N); // fabric flutter
      v[i] += acc * TICK;
      a[i] += v[i] * TICK;
      // Clamps keep him from tangling or turning inside out: a joint can
      // only fold so far, and no part of the tube may point at the ground.
      const maxRel = isHead ? 0.9 : i === 0 ? 0.35 : 0.95;
      const nrel = a[i] - parent;
      if (nrel > maxRel || nrel < -maxRel) {
        a[i] = parent + clamp(nrel, -maxRel, maxRel);
        v[i] = (i === 0 ? 0 : v[i - 1]) - 0.3 * (v[i] - (i === 0 ? 0 : v[i - 1]));
      }
      const maxAbs = 2.1;
      if (a[i] > maxAbs || a[i] < -maxAbs) {
        a[i] = clamp(a[i], -maxAbs, maxAbs);
        v[i] *= -0.25;
      }
    }
  }

  function chainArm(ang, vel, rootTarget, side, lowArm) {
    const P = Math.min(s.P, 1.2);
    const K = reduced ? 160 : lowArm ? 220 : 380;
    const C = reduced ? 12 : lowArm ? 9 : 4.5;
    const G = 9 * (1.25 - Math.min(P, 1));
    const body = a[SHOULDER];
    // Out of air, the arms hang regardless of what the wind wants.
    const tgt = rootTarget * P + side * 2.75 * (1 - Math.min(P, 1));
    for (let i = 0; i < ARM_N; i++) {
      const parent = i === 0 ? body : ang[i - 1];
      const want = i === 0 ? tgt : side * (lowArm ? 0.05 : s.flapUp ? -0.12 : 0.1);
      const rel = ang[i] - parent;
      const k = K * (1 - 0.15 * i) * (0.2 + 0.8 * P);
      let acc = -k * (rel - want) - C * vel[i] + G * Math.sin(ang[i]) * 0.6;
      if (!reduced && !lowArm && rnd() < 0.05) acc += r(-80, 80);
      vel[i] += acc * TICK;
      ang[i] += vel[i] * TICK;
      // The root stays on its own side of the body; joints bend but never
      // fold back on themselves.
      if (i === 0) {
        const lo = side < 0 ? -2.95 : 0.25, hi = side < 0 ? -0.15 : 2.95;
        const nrel = ang[0] - body;
        if (nrel < lo || nrel > hi) { ang[0] = body + clamp(nrel, lo, hi); vel[0] *= -0.3; }
      } else {
        const nrel = ang[i] - parent;
        if (nrel > 0.85 || nrel < -0.85) { ang[i] = parent + clamp(nrel, -0.85, 0.85); vel[i] *= -0.3; }
      }
    }
  }

  function tick() {
    s.t += TICK;
    updateEvents();
    chainBody();
    chainArm(ra, rv, s.flapTarget, -1, false);
    chainArm(la, lv, s.lowTarget, 1, true);
    // Grin stretches with how hard he's being thrown about.
    const want = clamp(Math.abs(v[N] - v[N - 1]) / 5 + Math.abs(v[N]) / 12 + (s.P > 1 ? 0.5 : 0), 0, 1);
    s.grin += (want - s.grin) * 0.25;
  }

  function step(dt) {
    s.acc += Math.min(dt, 0.25); // a backgrounded tab mustn't run 10 s of physics
    while (s.acc >= TICK) { s.acc -= TICK; tick(); }
  }

  // ---- drawing --------------------------------------------------------

  // Scratch buffers, reused every frame so drawing allocates nothing.
  const SUB = 3;
  const MAXP = (N + 2) * SUB + 2;
  const cx = new Float64Array(MAXP), cy = new Float64Array(MAXP), cw = new Float64Array(MAXP);
  const nx = new Float64Array(MAXP), ny = new Float64Array(MAXP);
  let cn = 0;
  const px = new Float64Array(N + 2), py = new Float64Array(N + 2), pw = new Float64Array(N + 2);

  // Catmull-Rom through the joints so the fabric reads as one soft tube,
  // even though the motion underneath is jerky.
  function smooth(n) {
    cn = 0;
    for (let i = 0; i < n - 1; i++) {
      const x0 = px[Math.max(i - 1, 0)], y0 = py[Math.max(i - 1, 0)];
      const x1 = px[i], y1 = py[i], x2 = px[i + 1], y2 = py[i + 1];
      const x3 = px[Math.min(i + 2, n - 1)], y3 = py[Math.min(i + 2, n - 1)];
      for (let k = 0; k < SUB; k++) {
        const t = k / SUB, t2 = t * t, t3 = t2 * t;
        cx[cn] = 0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3);
        cy[cn] = 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
        cw[cn] = pw[i] + (pw[i + 1] - pw[i]) * t;
        cn++;
      }
    }
    cx[cn] = px[n - 1]; cy[cn] = py[n - 1]; cw[cn] = pw[n - 1]; cn++;
    for (let i = 0; i < cn; i++) {
      const a0 = Math.max(i - 1, 0), a1 = Math.min(i + 1, cn - 1);
      let dx = cx[a1] - cx[a0], dy = cy[a1] - cy[a0];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      // Left of the direction of travel: the lit side, light from upper left.
      nx[i] = dy; ny[i] = -dx;
    }
  }

  // One fill of the tube at a fraction of its width, shifted towards the lit
  // side. Stacking a few of these is the "painted" shading: dark edge, body
  // colour, a soft light and a highlight stripe.
  function band(ctx, from, to, frac, off, grow) {
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const h = cw[i] * 0.5, o = off * cw[i], e = frac * h + grow;
      ctx.lineTo(cx[i] + nx[i] * (o + e), cy[i] + ny[i] * (o + e));
    }
    for (let i = to; i >= from; i--) {
      const h = cw[i] * 0.5, o = off * cw[i], e = frac * h + grow;
      ctx.lineTo(cx[i] + nx[i] * (o - e), cy[i] + ny[i] * (o - e));
    }
    ctx.closePath();
    ctx.fill();
  }

  function paintTube(ctx, col, from, to, line, detail) {
    ctx.fillStyle = INK; band(ctx, from, to, 1, 0, line);
    ctx.fillStyle = col.edge; band(ctx, from, to, 1, 0, 0);
    ctx.fillStyle = col.shade; band(ctx, from, to, 0.86, -0.05, 0);
    ctx.fillStyle = col.base; band(ctx, from, to, 0.6, -0.12, 0);
    if (detail) {
      ctx.fillStyle = col.light; band(ctx, from, to, 0.3, -0.2, 0);
      ctx.fillStyle = col.hi; band(ctx, from, to, 0.08, -0.26, 0);
    }
  }

  function armPoints(ang, side, ox, oy, S, k) {
    const body = a[SHOULDER];
    const sx = Math.cos(body), sy = Math.sin(body);
    // Shoulder: at the side of the tube, a little below the collar.
    let x = px[k] + side * sx * TUBE_W * 0.32 * S - Math.sin(body) * 0.18 * S;
    let y = py[k] + side * sy * TUBE_W * 0.32 * S + Math.cos(body) * 0.18 * S;
    const L = ARM_SEG * S * (0.85 + 0.15 * Math.min(s.P, 1));
    const out = { n: ARM_N + 1 };
    px[0] = x; py[0] = y; pw[0] = ARM_W * S * 1.15;
    for (let i = 0; i < ARM_N; i++) {
      x += Math.sin(ang[i]) * L;
      y -= Math.cos(ang[i]) * L;
      px[i + 1] = x; py[i + 1] = y; pw[i + 1] = ARM_W * S * (1 - 0.08 * i);
    }
    return out;
  }

  function drawArm(ctx, ang, side, S, line, detail, shoulderX, shoulderY) {
    // Arm geometry overwrites px/py, so the shoulder is passed in.
    const body = a[SHOULDER];
    let x = shoulderX + side * Math.cos(body) * TUBE_W * 0.3 * S;
    let y = shoulderY + side * Math.sin(body) * TUBE_W * 0.3 * S;
    const L = ARM_SEG * S * (0.85 + 0.15 * Math.min(s.P, 1));
    px[0] = x; py[0] = y; pw[0] = ARM_W * S * 1.2;
    for (let i = 0; i < ARM_N; i++) {
      x += Math.sin(ang[i]) * L;
      y -= Math.cos(ang[i]) * L;
      px[i + 1] = x; py[i + 1] = y; pw[i + 1] = ARM_W * S * (1 - 0.07 * i);
    }
    smooth(ARM_N + 1);
    paintTube(ctx, RED, 0, cn - 1, line, detail);
    // A pale mitten at the end, as the reference units have.
    const hr = ARM_W * S * 0.62;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x, y, hr + line, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e9e4df';
    ctx.beginPath(); ctx.arc(x, y, hr, 0, TAU); ctx.fill();
    if (detail) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x - hr * 0.25, y - hr * 0.25, hr * 0.5, 0, TAU); ctx.fill();
    }
  }

  function drawFan(ctx, x, y, S, line, detail) {
    const w = FAN_W * S, h = FAN_H * S, top = h * 0.22;
    ctx.fillStyle = INK;
    ctx.fillRect(x - w / 2 - line, y - h - line, w + line * 2, h + line);
    ctx.fillStyle = FAN.side;
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = FAN.top;
    ctx.fillRect(x - w / 2, y - h, w, top);
    if (detail) {
      ctx.fillStyle = FAN.hi;
      ctx.fillRect(x - w / 2 + w * 0.06, y - h + top * 0.25, w * 0.5, top * 0.3);
      // Grille slots on the front.
      ctx.fillStyle = FAN.grille;
      const gw = w * 0.07, gh = h * 0.42;
      for (let i = 0; i < 5; i++) ctx.fillRect(x - w * 0.3 + i * w * 0.14, y - h * 0.62, gw, gh);
      ctx.fillStyle = FAN.edge;
      ctx.fillRect(x - w / 2, y - h * 0.1, w, h * 0.1);
    }
  }

  function drawHead(ctx, hx, hy, ang, S, line, detail) {
    const rx = HEAD_RX * S, ry = HEAD_RY * S;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    // Ears and a fringe of hair either side, behind the face.
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.ellipse(-rx * 0.98, ry * 0.05, rx * 0.2 + line, ry * 0.22 + line, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(rx * 0.98, ry * 0.05, rx * 0.2 + line, ry * 0.22 + line, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = SKIN.shade;
    ctx.beginPath(); ctx.ellipse(-rx * 0.98, ry * 0.05, rx * 0.2, ry * 0.22, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(rx * 0.98, ry * 0.05, rx * 0.2, ry * 0.22, 0, 0, TAU); ctx.fill();
    // Face: contour, shade, then the lit face offset to the upper left.
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.ellipse(0, 0, rx + line, ry + line, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = SKIN.shade;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = SKIN.base;
    ctx.beginPath(); ctx.ellipse(-rx * 0.07, -ry * 0.05, rx * 0.88, ry * 0.9, 0, 0, TAU); ctx.fill();
    if (detail) {
      ctx.fillStyle = SKIN.hi;
      ctx.beginPath(); ctx.ellipse(-rx * 0.38, -ry * 0.12, rx * 0.22, ry * 0.16, -0.5, 0, TAU); ctx.fill();
    }
    // Hair tufts below the cap.
    ctx.fillStyle = HAIR;
    ctx.beginPath(); ctx.ellipse(-rx * 0.82, -ry * 0.36, rx * 0.2, ry * 0.2, 0.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(rx * 0.82, -ry * 0.36, rx * 0.2, ry * 0.2, -0.5, 0, TAU); ctx.fill();

    // Cap: a dome with a short peak, sitting low over the brow.
    const capY = -ry * 0.42;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.ellipse(0, capY, rx * 1.02 + line, ry * 0.7 + line, 0, Math.PI, TAU); ctx.lineTo(rx * 1.02 + line, capY + ry * 0.12 + line); ctx.lineTo(-rx * 1.02 - line, capY + ry * 0.12 + line); ctx.closePath(); ctx.fill();
    ctx.fillStyle = CAP.shade;
    ctx.beginPath(); ctx.ellipse(0, capY, rx * 1.02, ry * 0.7, 0, Math.PI, TAU); ctx.lineTo(rx * 1.02, capY + ry * 0.12); ctx.lineTo(-rx * 1.02, capY + ry * 0.12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = CAP.base;
    ctx.beginPath(); ctx.ellipse(-rx * 0.1, capY, rx * 0.84, ry * 0.6, 0, Math.PI, TAU); ctx.fill();
    if (detail) {
      ctx.fillStyle = CAP.light;
      ctx.beginPath(); ctx.ellipse(-rx * 0.38, capY - ry * 0.34, rx * 0.3, ry * 0.14, -0.35, 0, TAU); ctx.fill();
      ctx.fillStyle = CAP.edge;
      ctx.fillRect(-rx * 1.02, capY, rx * 2.04, ry * 0.12);
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(0, capY - ry * 0.7, rx * 0.08 + line * 0.5, 0, TAU); ctx.fill();
    }

    // Big eyes like the painted animals': dark, glossy, with a glint.
    const g = s.grin;
    const ex = rx * 0.36, ey = ry * 0.02, er = rx * (0.19 - 0.02 * g);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-ex, ey, er * 1.05 + line * 0.6, er * 1.25 + line * 0.6, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex, ey, er * 1.05 + line * 0.6, er * 1.25 + line * 0.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1c18';
    ctx.beginPath(); ctx.ellipse(-ex + er * 0.08, ey + er * 0.1, er * 0.82, er * 1.0, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex + er * 0.08, ey + er * 0.1, er * 0.82, er * 1.0, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-ex - er * 0.2, ey - er * 0.3, er * 0.32, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(ex - er * 0.2, ey - er * 0.3, er * 0.32, 0, TAU); ctx.fill();
    if (detail) {
      ctx.beginPath(); ctx.arc(-ex + er * 0.3, ey + er * 0.4, er * 0.13, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + er * 0.3, ey + er * 0.4, er * 0.13, 0, TAU); ctx.fill();
      // Brows lift as the grin widens.
      ctx.strokeStyle = HAIR;
      ctx.lineWidth = Math.max(1, rx * 0.06);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(-ex, ey - er * (1.7 + 0.4 * g), er * 0.9, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey - er * (1.7 + 0.4 * g), er * 0.9, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
      ctx.fillStyle = SKIN.blush;
      ctx.beginPath(); ctx.ellipse(-rx * 0.6, ry * 0.3, rx * 0.16, ry * 0.09, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(rx * 0.6, ry * 0.3, rx * 0.16, ry * 0.09, 0, 0, TAU); ctx.fill();
    }

    // Open grin: a D of dark mouth with a strip of teeth and a tongue. It
    // stretches wider and taller the harder he is thrown about.
    const mw = rx * (0.42 + 0.2 * g), mh = ry * (0.2 + 0.16 * g), my = ry * 0.36;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.moveTo(-mw - line, my - line * 0.5); ctx.lineTo(mw + line, my - line * 0.5); ctx.ellipse(0, my, mw + line, mh + line, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a1f24';
    ctx.beginPath(); ctx.moveTo(-mw, my); ctx.lineTo(mw, my); ctx.ellipse(0, my, mw, mh, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
    if (detail) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-mw, my, mw * 2, mh * 0.3);
      ctx.fillStyle = '#f08a96';
      ctx.beginPath(); ctx.ellipse(0, my + mh * 0.95, mw * 0.55, mh * 0.45, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  const LETTERS = ['C', 'A', 'R', '', 'W', 'A', 'S', 'H'];

  function drawLetters(ctx, S, collarIdx) {
    const size = 0.34 * S;
    ctx.font = `700 ${size.toFixed(1)}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = RED.base;
    // Walk down the spine from just under the collar, one letter per step.
    const gap = size * 1.02;
    let want = size * 0.9, run = 0, li = 0;
    for (let i = collarIdx; i > 0 && li < LETTERS.length; i--) {
      const dx = cx[i - 1] - cx[i], dy = cy[i - 1] - cy[i];
      const seg = Math.hypot(dx, dy);
      while (run + seg >= want && li < LETTERS.length) {
        const t = (want - run) / seg;
        const ch = LETTERS[li++];
        if (ch) {
          const lx = cx[i] + dx * t, ly = cy[i] + dy * t;
          ctx.save();
          ctx.translate(lx - nx[i] * cw[i] * 0.04, ly - ny[i] * cw[i] * 0.04);
          ctx.rotate(Math.atan2(-dx, dy));
          // Squash across the tube where it pinches at a kink.
          ctx.scale(Math.min(1, cw[i] / (TUBE_W * S)), 1);
          ctx.fillText(ch, 0, 0);
          ctx.restore();
        }
        want += gap;
      }
      run += seg;
    }
  }

  function draw(ctx, x, y, S, opts = {}) {
    const line = Math.max(0.8, 0.032 * S);
    const detail = S >= 12;  // below this the highlights are sub-pixel noise
    const P = Math.min(s.P, 1.2);

    if (opts.shadow) {
      // Soft ground shadow for the top-down world; it drifts with his lean.
      const lean = Math.sin(a[N - 2]) * 1.2 * S;
      ctx.fillStyle = 'rgba(40,30,25,0.22)';
      ctx.beginPath(); ctx.ellipse(x + lean * 0.4 + 0.25 * S, y + 0.05 * S, FAN_W * 0.9 * S + Math.abs(lean) * 0.3, 0.28 * S, 0, 0, TAU); ctx.fill();
    }

    // Spine, fan to collar. Segments shorten and narrow as the air goes,
    // and the tube pinches where it folds.
    const L = SEG * S * (0.86 + 0.14 * P);
    let bx = x, by = y - FAN_H * S * 0.9;
    px[0] = bx; py[0] = by; pw[0] = TUBE_W * S * 0.92;
    for (let i = 0; i < N; i++) {
      bx += Math.sin(a[i]) * L;
      by -= Math.cos(a[i]) * L;
      const bend = i + 1 < N ? Math.abs(a[i + 1] - a[i]) : 0;
      px[i + 1] = bx; py[i + 1] = by;
      pw[i + 1] = TUBE_W * S * (0.88 + 0.12 * P) * (1 - 0.32 * Math.min(1, bend / 0.9));
    }
    const shoulderX = px[SHOULDER], shoulderY = py[SHOULDER];
    const topX = bx, topY = by;
    const headAng = a[N];

    drawFan(ctx, x, y, S, line, detail);

    // Arms go behind the body so their roots tuck under the tube.
    drawArm(ctx, la, 1, S, line, detail, shoulderX, shoulderY);
    drawArm(ctx, ra, -1, S, line, detail, shoulderX, shoulderY);

    // Re-run the spine (the arms reused the buffers).
    bx = x; by = y - FAN_H * S * 0.9;
    px[0] = bx; py[0] = by; pw[0] = TUBE_W * S * 0.92;
    for (let i = 0; i < N; i++) {
      bx += Math.sin(a[i]) * L;
      by -= Math.cos(a[i]) * L;
      const bend = i + 1 < N ? Math.abs(a[i + 1] - a[i]) : 0;
      px[i + 1] = bx; py[i + 1] = by;
      pw[i + 1] = TUBE_W * S * (0.88 + 0.12 * P) * (1 - 0.32 * Math.min(1, bend / 0.9));
    }
    smooth(N + 1);
    const collar = cn - 1 - Math.round(SUB * 0.9);
    paintTube(ctx, BLUE, 0, cn - 1, line, detail);
    if (detail) {
      // Dungaree bib: a slightly darker top edge, two straps and buttons.
      ctx.fillStyle = BLUE.edge;
      band(ctx, collar - 1, collar, 0.9, 0, 0);
      const bi = collar - SUB;
      ctx.fillStyle = '#f4d35e';
      for (const sgn of [-1, 1]) {
        const o = sgn * cw[bi] * 0.27;
        ctx.beginPath(); ctx.arc(cx[bi] + nx[bi] * o, cy[bi] + ny[bi] * o, cw[bi] * 0.06, 0, TAU); ctx.fill();
      }
    }
    // Red shirt collar between the bib and the chin.
    paintTube(ctx, RED, collar, cn - 1, line, detail);
    if (S * 0.34 >= 4.5) drawLetters(ctx, S, collar - SUB);

    // Crease marks where the fabric folds hard.
    if (detail) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = line * 0.8;
      ctx.lineCap = 'round';
      for (let i = 1; i < N; i++) {
        const bend = a[i] - a[i - 1];
        if (Math.abs(bend) < 0.45) continue;
        const k = i * SUB, side = bend > 0 ? -1 : 1; // inner side of the fold
        const h = cw[k] * 0.5;
        const ox = cx[k] + nx[k] * side * h * 0.95, oy = cy[k] + ny[k] * side * h * 0.95;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox - nx[k] * side * h * 0.45 + (cx[k + 1] - cx[k]) * 0.3, oy - ny[k] * side * h * 0.45 + (cy[k + 1] - cy[k]) * 0.3);
        ctx.stroke();
      }
    }

    const hd = HEAD_RY * S * 0.82;
    drawHead(ctx, topX + Math.sin(headAng) * hd, topY - Math.cos(headAng) * hd, headAng, S, line, detail);
  }

  return {
    step,
    draw,
    setReducedMotion(on) { reduced = !!on; if (on) { s.phase = 'up'; s.phaseUntil = s.t + 5; } },
    get state() { return { t: s.t, P: s.P, phase: s.phase }; },
  };
}
