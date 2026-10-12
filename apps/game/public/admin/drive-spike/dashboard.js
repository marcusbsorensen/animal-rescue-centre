// dashboard.js — the vehicle's own dashboard, a strip along the bottom of the
// driving spike that holds the gears, the handbrake, the horn and the guide
// line's switch.
//
// Decided by Marcus, 2026-10-11 (docs/driving-port-plan-2026-10-11.md,
// section 5, question 1): the controls live in a strip below the van, styled
// as the vehicle's own cockpit dashboard rather than as buttons over the
// world. The van sits three quarters of the way down the road view (Lily,
// 2026-10-12), with a strip of road behind it, so the strip covers only road
// already driven.
//
// Every vehicle has its own painted dashboard (Marcus, 2026-10-12, 53:
// Trikey C, Bea B, Big Tilly B, Spark B, and Henry's), and the strip is
// the one for the vehicle being driven (the page's ?van=). Only the dash
// itself is used: "we are not showing a rear view mirror or anything that
// comes from the top, just the dash at the bottom of the screen".
//
// A painting is a whole cab, far wider than a phone held upright and far
// taller than a strip held sideways, so it is not drawn whole. The strip is
// built from it: the dash's plain surface and trim run along the strip, and
// the painted instruments are cut out and placed where each shape of phone
// has room, each at its own proportions. VANS says, for each vehicle, where
// each piece sits in its painting (measured off the painting itself;
// cockpit-slots-henry.json predates Henry's final layout, putting the
// speedometer at 500,600, which is the ignition key, so it is not used) and
// which kind of readout each instrument is: a needle (Henry, Bea), LED
// digits (Big Tilly), a screen with digits and a battery bar (Spark), or a
// painted arrow sliding along a cloth strip (Trikey, who has no dash at all,
// only a handlebar and a basket, so she has her own layout).
//
// Contract with drive-spike.html:
//   load(van)                 -> Promise<dash>; van is the page's ?van=,
//                             Henry's for anything unknown
//   height(dash, w, h)        the strip's height in CSS px on a w x h canvas
//   draw(ctx, dash, w, h, s)  draws the strip; s = { v, gear, tooFast,
//                             gearHint, handbrake, guide, jostle, x, y, camH,
//                             route, s, roads, charge? }; guide is whether
//                             the guide line is on, tooFast whether the gear
//                             in use is too fast for the road (its numeral
//                             reddens), gearHint the knob to glow, or 0;
//                             charge (0..1) is Spark's battery, if known
//   hit(dash, x, y)           'gear1' | 'gear2' | 'gear3' | 'horn' |
//                             'handbrake' | 'guide' on a control, 'dash'
//                             elsewhere on the strip, null above it
//   honk(dash)                the horn: a short two-note beep (Trikey's is
//                             her bicycle bell)
//   clunk(dash, dir)          a gear change, up (1) or down (-1): a clunk
//                             and a twitch of the comfort gauge
//   windowFrame(ctx, dash, x, y, w, h, b) -> screen
//   windowGlass(ctx, screen)  the GPS's bezel and glass round any window
//                             over the road (the look-ahead window)
//
// The gears (Marcus, 2026-10-12, 30A): he had not noticed them at all, so
// the gear in use is also a big painted number in a window by the
// speedometer (on Trikey, in her thumb shifter's dial), rolling over like an
// odometer drum when it changes; the knob for a gear that suits the road
// glows and pulses when she is in one that does not. Every gear works on
// every road (Marcus, 2026-10-12): nothing is dimmed or refused; a wrong
// gear costs what the page says it costs. The page decides all of that; the
// dashboard only draws it and makes the noises.
//
// The guide line's switch (Marcus, 2026-10-11, answer 11C: the game has no
// settings screen, so it lives on the driving screen) is a knob with a
// little road-and-arrow on it, lit when the line is on. It sits on the dash
// face beside the GPS, whose route the line draws, and not on the console
// with the gears and horn, where a child's thumb is all the time. The page
// owns the on/off state; the dashboard only draws it and reports the tap.

/** The colours of the fittings the strip adds (knob rings, panels, screws):
 *  brass on the wooden dashboards, chrome on Big Tilly's steel, satin
 *  silver on Spark's pale grey. */
const BRASS = {
  ring: ['#f8df9c', '#d2a446', '#85601d'],
  panel: ['#f1d48a', '#c99a3c', '#8a6420'],
  inset: ['#3b1d0c', '#5e3418'],
  screw: ['#fbe7ae', '#a37a2c'],
};
const CHROME = {
  ring: ['#f6f7f6', '#b4b9bc', '#555b5f'],
  panel: ['#eef0f0', '#a3a8ab', '#5a6064'],
  inset: ['#1c1d1f', '#34373a'],
  screw: ['#f7f8f8', '#7a8186'],
};
const SILVER = {
  ring: ['#ffffff', '#cfd4d8', '#858d94'],
  panel: ['#fbfbfc', '#c8cdd1', '#8a9298'],
  inset: ['#9aa1a7', '#b9bfc4'],
  screw: ['#ffffff', '#8e959b'],
};

/** Each vehicle's dashboard: its painting, and where each piece sits in it,
 *  in the painting's own pixels. Henry's is the whole painted cab; the
 *  others are their paintings' dash bands at the same 1920 wide, with plain
 *  surface swatches under the band where the painted surface is too figured
 *  to run along a strip (Bea's burl, Big Tilly's busy steel); Trikey's is a
 *  sheet of cut-out pieces. */
const VANS = {
  henry: {
    art: '/assets/driving/dashboard-henry-ptv.png',
    src: {
      trim: { x: 300, y: 439, w: 220, h: 62 },      // the maroon trim along the dash's top
      face: { x: 300, y: 501, w: 220, h: 344 },     // plain wood of the dash face
      lip: { x: 300, y: 845, w: 220, h: 22 },       // the face's bottom edge
      console: { x: 650, y: 900, w: 500, h: 150 },  // the centre console's grain
      speedo: { cx: 959, cy: 624, r: 139 },
      fuel: { cx: 960, cy: 832, r: 59 },
      // The GPS frame's right edge is hidden behind a folded paper map, so the
      // frame is rebuilt from its left half and that half's mirror image.
      gps: { x: 1138, y: 517, w: 230, h: 291, border: 49, mirror: 'left' },
      comfort: { x: 1636, y: 517, w: 174, h: 290,
        arch: { cx: 87, cy: 80, r: 46, bottom: 188 } },   // the window, in the crop's own pixels
    },
    faceStretch: 3,
    /** The painted dial: 0 sits at 141.6 degrees (clockwise from 3 o'clock)
     *  and 80 at 40.5, so 80 mph sweeps 258.9 degrees. Its painted needle is
     *  taken out when it loads (makeSpeedoFace). */
    speed: { kind: 'needle', zero: 141.6, sweep: 258.9, max: 80, paintedNeedle: true },
    needle: '#a3401f',
    theme: BRASS,
  },
  bea: {
    art: '/assets/driving/dashboard-bea.png',
    src: {
      trim: { x: 300, y: 8, w: 220, h: 52 },        // the walnut rail along the top
      face: { x: 22, y: 472, w: 636, h: 356 },      // plain walnut (swatch under the band)
      lip: { x: 300, y: 400, w: 220, h: 26 },       // the brass-lined bottom edge
      console: { x: 702, y: 472, w: 636, h: 356 },  // darker plain walnut
      speedo: { cx: 958, cy: 194, r: 138 },
      fuel: { cx: 956, cy: 394, r: 51 },
      gps: { x: 1143, y: 87, w: 445, h: 285, border: 48 },
      comfort: { x: 1645, y: 87, w: 167, h: 283,
        arch: { cx: 83.5, cy: 67.5, r: 51.5, bottom: 251 } },
    },
    faceStretch: 1,
    /** Bea's numerals are not quite evenly spaced, so the needle goes by her
     *  own ticks: [mph, degrees clockwise from 3 o'clock]. */
    speed: { kind: 'needle', ticks: [[0, 141.8], [10, 175.5], [20, 206.2], [30, 238.2],
      [40, 270.8], [50, 301.2], [60, 333.5], [70, 364.2], [80, 396]] },
    needle: '#b8893a',
    theme: BRASS,
  },
  'big-tilly': {
    art: '/assets/driving/dashboard-big-tilly.png',
    src: {
      trim: { x: 1550, y: 10, w: 220, h: 56 },      // the riveted top rail, between lamps
      face: { x: 22, y: 436, w: 636, h: 282 },      // plain steel (swatch under the band)
      lip: { x: 200, y: 367, w: 220, h: 45 },       // the riveted bottom rail
      console: { x: 22, y: 436, w: 636, h: 282 },
      speedo: { cx: 959, cy: 194, r: 128 },         // the big centre gauge, cleared of digits
      fuel: { cx: 731, cy: 321, r: 51 },
      gps: { x: 1140, y: 99, w: 407, h: 264, border: 37 },
      comfort: { x: 1646, y: 102, w: 158, h: 252,
        arch: { cx: 79, cy: 75, r: 54, bottom: 180 } },
    },
    trimTile: true, lipTile: true, faceStretch: 1,
    consoleTint: 'rgba(14,14,16,.38)',
    /** LED digits on the centre gauge's dark face, where the painted ones
     *  were: a block 0.78 of the radius wide, a touch above centre. */
    speed: { kind: 'leds' },
    theme: CHROME,
  },
  spark: {
    art: '/assets/driving/dashboard-spark.png',
    src: {
      trim: { x: 200, y: 12, w: 220, h: 48 },
      face: { x: 180, y: 65, w: 380, h: 335 },
      lip: { x: 200, y: 403, w: 220, h: 23 },
      console: { x: 180, y: 65, w: 380, h: 335 },
      // One bezel holds two screens: the speed's (left) and the map's
      // (right). Each is rebuilt whole from its outer half and its mirror.
      screen: { x: 751, y: 111, w: 216, h: 259, border: 25, mirror: 'left' },
      gps: { x: 1356, y: 111, w: 182, h: 259, border: 25, mirror: 'right' },
      comfort: { x: 1601, y: 96, w: 190, h: 288,
        arch: { cx: 98, cy: 93, r: 52, bottom: 181.5 } },
    },
    faceStretch: 2,
    consoleTint: 'rgba(60,66,76,.16)',
    /** A screen a little wider than tall: speed digits under an arc, and a
     *  battery bar (Spark has a battery, not a fuel tank). */
    speed: { kind: 'screen', aspect: 1.2, full: 50 },
    theme: SILVER,
  },
  trikey: {
    art: '/assets/driving/dashboard-trikey.png',
    layout: 'handlebar',
    src: {
      sage: { x: 30, y: 2, w: 396, h: 106 },        // the painting's paper behind the handlebar
      bar: { x: 436, y: 3, w: 76, h: 77 },          // a straight length of the handlebar
      bell: { x: 518, y: 0, w: 145, h: 130 },
      arrow: { x: 667, y: 0, w: 81, h: 97 },        // the painter's wooden arrow, pointing up
      // Trikey A's thumb shifter; the gear number shows in its dial.
      shifter: { x: 752, y: 0, w: 146, h: 152, face: { cx: 74, cy: 66, r: 29 } },
      // The comfort dial, cleared of its clock face; face is the window.
      dial: { x: 902, y: 0, w: 188, h: 211, ring: 87, face: { cx: 93, cy: 116, r: 63 } },
      // The map holder, rebuilt whole from its right half (the GO flag's
      // pole stood on its left corner).
      gps: { x: 1211, y: 0, w: 117, h: 313, border: 36, mirror: 'right' },
      cloth: { x: 0, y: 317, w: 460, h: 112 },
      wicker: { x: 466, y: 319, w: 476, h: 222 },   // the basket's weave
      rim: { x: 950, y: 318, w: 226, h: 38 },      // the basket's rim, straightened
    },
    /** The cloth reads 0 5 10 15 20 (mph) from x0 to x1 in its own pixels;
     *  the arrow's tip rides at row tip. A trike crawls (docs/driving-port-
     *  plan, question 10: half of every gear), so past 20 it stays at the
     *  cloth's end. */
    speed: { kind: 'cloth', mph: 20, x0: 64, x1: 390, tip: 71 },
    horn: 'bell',
    theme: BRASS,
  },
};

const MPH = 2.237;

/** The strip's height in CSS px, before any safe-area inset. Each is the
 *  least that fits controls a small child's finger can hit (TARGET, against
 *  a floor of 56) plus the instruments: two tiers upright, one row sideways. */
const STRIP = { port: 152, land: 72 };
const TARGET = 58;   // every control's touch area is at least this wide and tall
const GEAR_WIN = { port: 44, land: 42 };   // the gear number's window, wide

const INK = '#2e1108';                   // the painting's outline brown
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const FONT = '"Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';

/** How many metres of map the GPS screen's height shows: about 240 m ahead
 *  of the van. Wider, and the van's dot covers more road than the road view
 *  shows ahead, so a turn hidden under the dot makes the route seem to leave
 *  it the wrong way. */
const GPS_SPAN_M = 360;

/** The fittings' colours for whatever is being drawn now: set from the
 *  dashboard at the top of each exported drawing call. */
let T = BRASS;

// ---------------------------------------------------------------- loading

export async function load(van = 'henry') {
  const V = VANS[van] ?? VANS.henry;
  const img = new Image();
  img.src = V.art;
  await img.decode();
  return {
    V,
    img,
    speedo: V.src.speedo ? makeSpeedoFace(img, V) : null,
    speedFrame: V.src.screen ? makeFrame(img, V.src.screen) : null,
    gpsFrame: makeFrame(img, V.src.gps),
    needle: { a: dialAngle(V, 0), vel: 0 },
    pointer: { x: 0, vel: 0 },   // Trikey's arrow along her cloth, 0..1
    comfort: { level: 1, wave: 0, t: 0, lastJostle: 0 },
    lever: 0,
    hornAt: -1e9,
    drum: { n: 0, prev: 0, at: -1e9, dir: 1 },   // the gear window's roll
    last: performance.now(),
    reduce: matchMedia('(prefers-reduced-motion: reduce)'),
    L: null, bg: null,
  };
}

function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** The speedometer's face, round. Henry's still has its painted needle, so
 *  that is taken out, so a live one can be drawn over it: the needle's tail
 *  runs out across the 0, so it is covered by a copy of the dial's blank
 *  bottom turned round to lie over it; the hub and the arrow head are
 *  covered by the face's own cream; then the 0 and its tick are put back.
 *  The other paintings were cleared before they were saved. */
function makeSpeedoFace(img, V) {
  const { cx, cy, r } = V.src.speedo, size = 2 * r;
  const raw = offscreen(size, size);
  raw.getContext('2d').drawImage(img, cx - r, cy - r, size, size, 0, 0, size, size);

  const c = offscreen(size, size), g = c.getContext('2d');
  g.beginPath(); g.arc(r, r, r, 0, TAU); g.clip();
  g.drawImage(raw, 0, 0);
  if (!V.speed.paintedNeedle) return c;

  const tail = V.speed.zero * DEG, blank = 100 * DEG;
  g.save();
  g.translate(r, r);
  g.rotate(tail); g.beginPath(); g.rect(42, -12, 70, 24); g.rotate(-tail);
  g.clip();
  g.rotate(tail - blank); g.translate(-r, -r);
  g.drawImage(raw, 0, 0);
  g.restore();

  const cream = g.createRadialGradient(r, r, 0, r, r, 58);
  cream.addColorStop(0, 'rgba(254,241,216,1)');
  cream.addColorStop(0.78, 'rgba(252,236,208,1)');
  cream.addColorStop(1, 'rgba(251,234,205,0)');
  g.fillStyle = cream;
  g.beginPath(); g.arc(r, r, 58, 0, TAU); g.fill();

  // The 0 as the painter drew the others: an upright oval, not a typeface.
  g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath();
  g.ellipse(r + Math.cos(tail) * 85, r + Math.sin(tail) * 85, 8, 12.5, 0, 0, TAU);
  g.stroke();
  g.beginPath();
  g.moveTo(r + Math.cos(tail) * 102, r + Math.sin(tail) * 102);
  g.lineTo(r + Math.cos(tail) * 112, r + Math.sin(tail) * 112);
  g.stroke();
  return c;
}

/** A frame for nine-slicing, whole and symmetrical where the painting hides
 *  one side: 'left' rebuilds it from its left half (s is that half) and the
 *  half's mirror image, 'right' from its right half; otherwise the frame is
 *  taken as painted. */
function makeFrame(img, s) {
  if (!s.mirror) {
    const c = offscreen(s.w, s.h);
    c.getContext('2d').drawImage(img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
    return c;
  }
  const c = offscreen(2 * s.w, s.h), g = c.getContext('2d');
  const at = s.mirror === 'left' ? 0 : s.w;
  g.drawImage(img, s.x, s.y, s.w, s.h, at, 0, s.w, s.h);
  g.translate(2 * s.w, 0); g.scale(-1, 1);
  g.drawImage(img, s.x, s.y, s.w, s.h, at, 0, s.w, s.h);
  return c;
}

// ----------------------------------------------------------------- layout

function safeAreaBottom() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sab'));
  return Number.isFinite(v) ? v : 0;
}

const gearsAt = (x, y) => ({
  plate: { x, y, w: 3 * TARGET + 8, h: TARGET },
  knobs: [1, 2, 3].map(n => ({
    id: 'gear' + n, n, cx: x + 4 + (n - 0.5) * TARGET, cy: y + TARGET / 2, r: 24,
    hit: { x: x + 4 + (n - 1) * TARGET, y, w: TARGET, h: TARGET },
  })),
});

const guideAt = (x, y) => ({
  x, y, w: TARGET, h: TARGET, cx: x + TARGET / 2, cy: y + TARGET / 2, r: 22,
  hit: { x, y, w: TARGET, h: TARGET },
});

const hornAt = (x, y, h = TARGET) => ({
  cx: x + TARGET / 2, cy: y + h / 2, r: 24, hit: { x, y, w: TARGET, h },
});

/** Where everything sits, for one canvas size. */
function layout(dash, w, h) {
  const key = w + 'x' + h;
  if (dash.L && dash.L.key === key) return dash.L;
  const L = dash.V.layout === 'handlebar' ? layoutHandlebar(dash, w, h) : layoutDash(dash, w, h);
  L.key = key;
  L.brake.hit = { x: L.brake.x, y: L.brake.y, w: L.brake.w, h: L.brake.h };
  const gs = dash.V.src.gps, b = gs.border * L.gps.h / gs.h;
  L.gps.b = b;
  L.gpsScreen = { x: L.gps.x + b, y: L.gps.y + b, w: L.gps.w - 2 * b, h: L.gps.h - 2 * b, r: b * 0.45 };
  if (L.screen) {
    const ss = dash.V.src.screen, sb = ss.border * L.screen.h / ss.h;
    L.screen.b = sb;
    L.screenIn = { x: L.screen.x + sb, y: L.screen.y + sb, w: L.screen.w - 2 * sb, h: L.screen.h - 2 * sb, r: sb * 0.45 };
  }
  dash.L = L; dash.bg = null;
  return L;
}

/** A dashboard with a dash. Held upright the strip has two tiers, the dash
 *  face with the instruments and the console below it with the controls,
 *  each instrument above the control it answers to: the speedometer over
 *  the gears, the GPS over the horn, the cargo comfort over the handbrake.
 *  Held sideways there is width to spare and no height, so it is one row,
 *  gears under the left thumb and handbrake under the right. */
function layoutDash(dash, w, h) {
  const V = dash.V, S = V.src;
  const sab = safeAreaBottom();
  const land = w > h;
  const H = (land ? STRIP.land : STRIP.port) + sab;
  const top = h - H, m = 12;
  const L = { land, H, top };
  const comfortAspect = S.comfort.w / S.comfort.h;
  // The speed readout is a round dial, or Spark's screen, a little wider.
  const screen = V.speed.kind === 'screen';
  const speedAt = (x, y, sz) => (screen
    ? (L.screen = { x, y, w: sz * V.speed.aspect, h: sz })
    : { cx: x + sz / 2, cy: y + sz / 2, r: sz / 2 });
  const rightOf = sp => (screen ? L.screen.x + L.screen.w : sp.cx + sp.r);

  if (land) {
    L.trim = [top, top + 8];
    L.face = [top + 8, h];
    const y = top + 11, rh = TARGET;
    L.speedo = speedAt(m, y, rh);
    if (S.fuel) L.fuel = { cx: m + rh + 5, cy: y + rh - 12, r: 12 };
    const edge = L.fuel ? L.fuel.cx + 12 : rightOf(L.speedo);
    const cw = rh * comfortAspect;
    L.comfort = { x: w - m - cw, y, w: cw, h: rh };
    L.brake = { x: L.comfort.x - 14 - 68, y, w: 68, h: rh };
    const hx = L.brake.x - 14 - TARGET;
    L.horn = hornAt(hx, y, rh);
    // The gear number sits between the speedometer and the knobs it answers
    // to, if the guide switch still clears the horn; on a very narrow phone
    // held sideways it gives way and the lit knob alone says the gear.
    const wx = edge + 8, ww = GEAR_WIN.land;
    const fits = wx + ww + 10 + 3 * TARGET + 8 + 14 + TARGET + 10 <= hx;
    if (fits) L.gearWin = { x: wx, y, w: ww, h: rh };
    L.gears = gearsAt(fits ? wx + ww + 10 : edge + 14, y);
    // The guide switch sits just left of the GPS whose route it draws.
    const sx = L.gears.plate.x + L.gears.plate.w + 14;
    L.guide = guideAt(sx, y);
    const a = sx + TARGET + 10, b = hx - 14;
    const gw = Math.max(80, Math.min(rh * 3.4, b - a));
    L.gps = { x: (a + b - gw) / 2, y, w: gw, h: rh };
    // On a very narrow phone held sideways (568 wide and under) the controls
    // take all the room and the GPS, which is only to look at, gives way.
    L.noGps = b - a < 64;
  } else {
    L.trim = [top, top + 10];
    L.face = [top + 10, top + 84];
    L.lip = [top + 84, top + 90];
    L.console = [top + 90, h];
    const ay = top + 15, ah = 64;
    L.speedo = speedAt(m, ay, ah);
    if (S.fuel) L.fuel = { cx: m + ah + 6, cy: ay + ah - 13, r: 13 };
    const edge = L.fuel ? L.fuel.cx + 13 : rightOf(L.speedo);
    const cw = ah * comfortAspect;
    L.comfort = { x: w - m - cw, y: ay, w: cw, h: ah };
    // The gear number beside the speedometer, over the knobs it answers to;
    // then the guide switch, centred on the dash face, just left of the GPS.
    L.gearWin = { x: edge + 8, y: ay, w: GEAR_WIN.port, h: ah };
    const sx = L.gearWin.x + L.gearWin.w + 8;
    L.guide = guideAt(sx, L.face[0] + (L.face[1] - L.face[0] - TARGET) / 2);
    const a = sx + TARGET + 10, b = L.comfort.x - 10;
    const gw = Math.max(80, Math.min(ah * 3.4, b - a));
    L.gps = { x: (a + b - gw) / 2, y: ay, w: gw, h: ah };
    // On a phone 340 wide and under the GPS gives way here too.
    L.noGps = b - a < 64;

    const by = top + 92;
    L.gears = gearsAt(m, by);
    L.brake = { x: w - m - 68, y: by, w: 68, h: TARGET };
    const hx = (L.gears.plate.x + L.gears.plate.w + L.brake.x) / 2 - TARGET / 2;
    L.horn = hornAt(hx, by);
  }
  return L;
}

/** Trikey has no dash: the strip is her handlebar against the painting's
 *  paper, and, held upright, the basket below it. On the handlebar, left to
 *  right: the cloth strip with its arrow (her speed), her thumb shifter
 *  (the gear number shows in its dial), the guide switch and the map
 *  holder (the GPS). In the basket: the gears, her bell (the horn), the
 *  comfort dial and the brake. Held sideways it is all one row along the
 *  handlebar, in the same order as the other dashboards. */
function layoutHandlebar(dash, w, h) {
  const S = dash.V.src;
  const sab = safeAreaBottom();
  const land = w > h;
  const H = (land ? STRIP.land : STRIP.port) + sab;
  const top = h - H, m = 12;
  const L = { land, H, top, handlebar: true };
  const clothAspect = S.cloth.w / S.cloth.h, shiftAspect = S.shifter.w / S.shifter.h;

  if (land) {
    L.face = [top, h];
    const y = top + 7, rh = TARGET, cy = y + rh / 2;
    L.bar = { cy, th: 13 };
    // From the right: the comfort dial, the brake, the bell.
    const roomy = w >= 700, d = roomy ? rh - 2 : 42, gap = roomy ? 14 : 10;
    L.dial = { x: w - m - d, y: cy - d / 2, w: d, h: d };
    L.brake = { x: L.dial.x - gap - 68, y, w: 68, h: rh };
    const hx = L.brake.x - gap - TARGET;
    L.horn = hornAt(hx, y, rh);
    // From the left: the cloth, the shifter, the gears, the guide switch.
    // On a narrow phone the cloth shortens, then the shifter gives way (as
    // the gear window does on the others) and the cloth takes what is left.
    const sh = rh - 4, sw = sh * shiftAspect;
    const rest = 3 * TARGET + 8 + 14 + TARGET + 10;
    let ch = Math.min(40, (hx - m - 8 - sw - 10 - rest) / clothAspect);
    const fits = ch >= 26;
    if (!fits) ch = Math.max(20, Math.min(40, (hx - m - 14 - rest) / clothAspect));
    const cw = ch * clothAspect;
    L.cloth = { x: m, y: cy - ch / 2, w: cw, h: ch };
    let gx = m + cw + 14;
    if (fits) {
      L.gearWin = { x: m + cw + 8, y: cy - sh / 2, w: sw, h: sh };
      gx = L.gearWin.x + sw + 10;
    }
    L.gears = gearsAt(gx, y);
    const sx = L.gears.plate.x + L.gears.plate.w + 14;
    L.guide = guideAt(sx, y);
    const a = sx + TARGET + 10, b = hx - 14;
    const gw = Math.max(80, Math.min(rh * 3.4, b - a));
    L.gps = { x: (a + b - gw) / 2, y, w: gw, h: rh };
    L.noGps = b - a < 64;
  } else {
    L.face = [top, top + 85];
    L.lip = [top + 85, top + 92];
    L.console = [top + 92, h];
    const cy = top + 44;
    L.bar = { cy, th: 15 };
    const by = top + 93;
    L.gears = gearsAt(m, by);
    L.brake = { x: w - m - 68, y: by, w: 68, h: TARGET };
    // The bell and the comfort dial share what the gears and brake leave;
    // on a phone under about 380 wide that is too little for both, so the
    // dial hangs at the handlebar's right end instead, and the cloth and
    // shifter there are a little smaller to keep room for the map holder.
    const g0 = L.gears.plate.x + L.gears.plate.w, room = L.brake.x - g0;
    const below = room - TARGET - 10 >= 36;
    if (below) {
      const d = Math.min(52, room - TARGET - 10);
      const x0 = g0 + (room - (TARGET + 6 + d)) / 2;
      L.horn = hornAt(x0, by);
      L.hornPanel = { x: x0, y: by, w: TARGET, h: TARGET };
      L.dial = { x: x0 + TARGET + 6, y: by + (TARGET - d) / 2, w: d, h: d };
    } else {
      const x0 = g0 + (room - TARGET) / 2;
      L.horn = hornAt(x0, by);
      L.hornPanel = { x: x0, y: by, w: TARGET, h: TARGET };
      const d = 40;
      L.dial = { x: w - m - d, y: cy - d / 2 + 4, w: d, h: d };
    }

    // The cloth takes about a third of the width, as much as the shifter,
    // guide and map holder leave it.
    const cw = below ? Math.max(104, Math.min(170, w * 0.32)) : 96, ch = cw / clothAspect;
    L.cloth = { x: m, y: cy - ch / 2, w: cw, h: ch };
    const sh = below ? 56 : 46, sw = sh * shiftAspect;
    L.gearWin = { x: m + cw + 6, y: cy - sh / 2 + 2, w: sw, h: sh };
    const sx = L.gearWin.x + sw + 8;
    L.guide = guideAt(sx, cy - TARGET / 2);
    const a = sx + TARGET + 10, b = below ? w - m : L.dial.x - 8;
    L.gps = { x: a, y: cy - 32, w: Math.min(b - a, 64 * 3.4), h: 64 };
    L.noGps = b - a < 64;
  }
  return L;
}

export function height(dash, w, h) { return layout(dash, w, h).H; }

const inside = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export function hit(dash, x, y) {
  const L = dash.L;
  if (!L || y < L.top) return null;
  for (const k of L.gears.knobs) if (inside(k.hit, x, y)) return k.id;
  if (inside(L.horn.hit, x, y)) return 'horn';
  if (inside(L.brake.hit, x, y)) return 'handbrake';
  if (inside(L.guide.hit, x, y)) return 'guide';
  return 'dash';
}

// ---------------------------------------------------------------- drawing

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }

/** The painting's own soft shadow under a raised piece. */
function shadowOf(g, path, dy = 2) {
  g.save();
  g.translate(0.8, dy);
  path(); g.fillStyle = 'rgba(46,17,8,.32)'; g.fill();
  g.restore();
}

/** One band of a surface along the strip: the painted patch scaled to the
 *  band's height, stretched a little along it, and laid end to end with
 *  every other copy mirrored so the joins meet grain to grain. */
function woodBand(g, img, s, y0, y1, w, stretch) {
  const bh = y1 - y0, tw = s.w * (bh / s.h) * stretch;
  g.save();
  g.beginPath(); g.rect(0, y0, w, bh); g.clip();
  let flip = false;
  for (let x = 0; x < w; x += tw) {
    g.save();
    if (flip) { g.translate(x + tw, y0); g.scale(-1, 1); } else g.translate(x, y0);
    g.drawImage(img, s.x, s.y, s.w, s.h, 0, 0, tw + 0.6, bh);
    g.restore();
    flip = !flip;
  }
  g.restore();
}

/** A trim along the strip: Henry's plain ones are stretched to the width;
 *  a riveted one is laid end to end, so its rivets stay round. */
function trimBand(g, img, s, y0, y1, w, tile) {
  if (tile) woodBand(g, img, s, y0, y1, w, 1);
  else g.drawImage(img, s.x, s.y, s.w, s.h, 0, y0, w, y1 - y0);
}

/** Nine-slice: corners kept, edges and middle stretched. */
function nine(g, src, sb, dx, dy, dw, dh, db) {
  const sw = src.width, sh = src.height;
  const xs = [0, sb, sw - sb, sw], ys = [0, sb, sh - sb, sh];
  const X = [dx, dx + db, dx + dw - db, dx + dw], Y = [dy, dy + db, dy + dh - db, dy + dh];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    g.drawImage(src, xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j],
      X[i], Y[j], X[i + 1] - X[i] + 0.4, Y[j + 1] - Y[j] + 0.4);
  }
}

/** A cut-out piece of the painting, drawn into a box. */
function piece(g, img, s, x, y, w, h) {
  g.drawImage(img, s.x, s.y, s.w, s.h, x, y, w, h);
}

function screw(g, x, y, r) {
  circle(g, x, y, r);
  const s = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  s.addColorStop(0, T.screw[0]); s.addColorStop(1, T.screw[1]);
  g.fillStyle = s; g.fill();
  g.lineWidth = 0.8; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.moveTo(x - r * 0.6, y + r * 0.25); g.lineTo(x + r * 0.6, y - r * 0.25); g.stroke();
}

/** Everything that does not move, painted once per canvas size. */
function paintBackground(dash, L, w, dpr) {
  const c = offscreen(w * dpr, L.H * dpr), g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, -L.top * dpr);
  g.imageSmoothingQuality = 'high';
  if (L.handlebar) paintHandlebar(dash, L, w, g);
  else paintDash(dash, L, w, g);

  // The gear gate, the handbrake's boot and the guide line's switch plate:
  // sunk panels with metal edges, so each control's whole touch area reads
  // as part of the dash.
  sunkPanel(g, L.gears.plate);
  sunkPanel(g, L.brake);
  sunkPanel(g, L.guide);
  if (L.hornPanel) sunkPanel(g, L.hornPanel);
  if (L.gearWin && !L.handlebar) gearBezel(g, L.gearWin);
  const B = L.brake;
  screw(g, B.x + 16, B.y + B.h - 14, 6);
  return c;
}

function paintDash(dash, L, w, g) {
  const V = dash.V, S = V.src, img = dash.img;
  woodBand(g, img, S.face, L.face[0], L.face[1], w, V.faceStretch ?? 3);
  if (L.console) {
    woodBand(g, img, S.console, L.console[0], L.console[1], w, 1);
    if (V.consoleTint) {
      g.fillStyle = V.consoleTint; g.fillRect(0, L.console[0], w, L.console[1] - L.console[0]);
    }
    // The dash overhangs the console, so the console's top is in its shade.
    const sh = g.createLinearGradient(0, L.console[0], 0, L.console[0] + 10);
    sh.addColorStop(0, 'rgba(46,17,8,.45)'); sh.addColorStop(1, 'rgba(46,17,8,0)');
    g.fillStyle = sh; g.fillRect(0, L.console[0], w, 10);
    trimBand(g, img, S.lip, L.lip[0], L.lip[1], w, V.lipTile);
  }
  trimBand(g, img, S.trim, L.trim[0], L.trim[1], w, V.trimTile);

  // The speedometer, cleaned of its painted readout, and the fuel gauge
  // beside it; or Spark's speed screen.
  if (L.screen) {
    const R = L.screen;
    shadowOf(g, () => rr(g, R.x, R.y, R.w, R.h, R.b * 0.6));
    nine(g, dash.speedFrame, S.screen.border, R.x, R.y, R.w, R.h, R.b);
  } else {
    const Sp = L.speedo;
    shadowOf(g, () => circle(g, Sp.cx, Sp.cy, Sp.r));
    g.drawImage(dash.speedo, Sp.cx - Sp.r, Sp.cy - Sp.r, 2 * Sp.r, 2 * Sp.r);
  }
  if (L.fuel) {
    const F = L.fuel, fs = S.fuel;
    shadowOf(g, () => circle(g, F.cx, F.cy, F.r), 1.5);
    g.save(); circle(g, F.cx, F.cy, F.r); g.clip();
    g.drawImage(img, fs.cx - fs.r, fs.cy - fs.r, 2 * fs.r, 2 * fs.r, F.cx - F.r, F.cy - F.r, 2 * F.r, 2 * F.r);
    g.restore();
  }

  // The GPS frame, stretched to the room there is.
  const G = L.gps;
  if (!L.noGps) {
    shadowOf(g, () => rr(g, G.x, G.y, G.w, G.h, G.b * 0.3));
    nine(g, dash.gpsFrame, S.gps.border, G.x, G.y, G.w, G.h, G.b);
  }

  // The cargo-comfort gauge, painted plate and all.
  const C = L.comfort, cs = S.comfort;
  shadowOf(g, () => rr(g, C.x, C.y, C.w, C.h, C.w * 0.06));
  g.save(); rr(g, C.x, C.y, C.w, C.h, C.w * 0.06); g.clip();
  g.drawImage(img, cs.x, cs.y, cs.w, cs.h, C.x, C.y, C.w, C.h);
  g.restore();
}

/** Trikey's strip: the painting's paper with her handlebar across it and,
 *  held upright, her basket below, its rim between. */
function paintHandlebar(dash, L, w, g) {
  const S = dash.V.src, img = dash.img;
  woodBand(g, img, S.sage, L.face[0], L.face[1], w, 1);
  if (L.console) {
    woodBand(g, img, S.wicker, L.console[0], L.console[1], w, 1);
    const sh = g.createLinearGradient(0, L.console[0], 0, L.console[0] + 12);
    sh.addColorStop(0, 'rgba(46,17,8,.4)'); sh.addColorStop(1, 'rgba(46,17,8,0)');
    g.fillStyle = sh; g.fillRect(0, L.console[0], w, 12);
    woodBand(g, img, S.rim, L.lip[0] - 2, L.lip[1] + 2, w, 1);
  }
  // The handlebar, with its shadow on the paper.
  const B = L.bar, y0 = B.cy - B.th / 2;
  g.save();
  g.fillStyle = 'rgba(46,17,8,.18)';
  g.fillRect(0, y0 + 3, w, B.th);
  g.restore();
  woodBand(g, img, S.bar, y0, y0 + B.th, w, 5);

  // The cloth strip, tied round the handlebar.
  const Cl = L.cloth;
  g.save(); g.shadowColor = 'rgba(46,17,8,.3)'; g.shadowOffsetY = 2; g.shadowBlur = 3;
  piece(g, img, S.cloth, Cl.x, Cl.y, Cl.w, Cl.h);
  g.restore();

  // The thumb shifter, clamped on the bar.
  if (L.gearWin) {
    const W = L.gearWin;
    g.save(); g.shadowColor = 'rgba(46,17,8,.32)'; g.shadowOffsetY = 2; g.shadowBlur = 3;
    piece(g, img, S.shifter, W.x, W.y, W.w, W.h);
    g.restore();
  }

  // The map holder, stretched to the room there is.
  const G = L.gps;
  if (!L.noGps) {
    shadowOf(g, () => rr(g, G.x, G.y, G.w, G.h, G.b * 0.5));
    nine(g, dash.gpsFrame, S.gps.border, G.x, G.y, G.w, G.h, G.b);
  }

  // The comfort dial, hanging by its ring.
  const D = L.dial, ds = S.dial, k = (D.w / 2) / ds.ring;
  const dw = ds.w * k, dh = ds.h * k;
  const dx = D.x + D.w / 2 - ds.face.cx * k, dy = D.y + D.h / 2 - ds.face.cy * k;
  g.save(); g.shadowColor = 'rgba(46,17,8,.3)'; g.shadowOffsetY = 2; g.shadowBlur = 3;
  piece(g, img, ds, dx, dy, dw, dh);
  g.restore();
  L.comfortWin = { cx: D.x + D.w / 2, cy: D.y + D.h / 2, r: ds.face.r * k };
}

/** The gear number's window: a bezel round a cream drum, like the
 *  speedometer's face, with two screws. */
function gearBezel(g, W) {
  shadowOf(g, () => rr(g, W.x, W.y, W.w, W.h, 10), 1.5);
  rr(g, W.x, W.y, W.w, W.h, 10);
  const br = g.createLinearGradient(W.x, W.y, W.x + W.w, W.y + W.h);
  br.addColorStop(0, T.ring[0]); br.addColorStop(0.45, T.ring[1]); br.addColorStop(1, T.ring[2]);
  g.fillStyle = br; g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
  screw(g, W.x + W.w / 2, W.y + 4.5, 2.4);
  screw(g, W.x + W.w / 2, W.y + W.h - 4.5, 2.4);
}

function sunkPanel(g, P) {
  shadowOf(g, () => rr(g, P.x, P.y, P.w, P.h, 12), 1.5);
  rr(g, P.x, P.y, P.w, P.h, 12);
  const br = g.createLinearGradient(0, P.y, 0, P.y + P.h);
  br.addColorStop(0, T.panel[0]); br.addColorStop(0.5, T.panel[1]); br.addColorStop(1, T.panel[2]);
  g.fillStyle = br; g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
  rr(g, P.x + 3.5, P.y + 3.5, P.w - 7, P.h - 7, 9);
  const wal = g.createLinearGradient(0, P.y, 0, P.y + P.h);
  wal.addColorStop(0, T.inset[0]); wal.addColorStop(1, T.inset[1]);
  g.fillStyle = wal; g.fill(); g.lineWidth = 1; g.stroke();
}

// ------------------------------------------------------------- live parts

/** Where the needle points for a speed: along the dial's own ticks where it
 *  has them, else evenly from zero over its sweep. */
function dialAngle(V, mph) {
  const sp = V.speed;
  if (sp.ticks) {
    const t = sp.ticks, last = t[t.length - 1][0];
    const m = Math.max(0, Math.min(last + 4, mph));
    let i = 1;
    while (i < t.length - 1 && t[i][0] < m) i++;
    const [m0, a0] = t[i - 1], [m1, a1] = t[i];
    return (a0 + (m - m0) * (a1 - a0) / (m1 - m0)) * DEG;
  }
  if (sp.kind !== 'needle') return 0;
  const m = Math.max(0, Math.min(sp.max + 4, mph));
  return (sp.zero + m * sp.sweep / sp.max) * DEG;
}

/** The needle rides a spring, so it swings past and settles like a real one;
 *  under reduced motion it glides straight to the speed instead. */
function stepNeedle(V, n, mph, dt, reduce) {
  const target = dialAngle(V, mph);
  if (reduce) { n.a += (target - n.a) * (1 - Math.exp(-12 * dt)); n.vel = 0; return; }
  n.vel += (150 * (target - n.a) - 12 * n.vel) * dt;
  n.a += n.vel * dt;
  // The stop pin under the 0: a hard stop knocks the needle back off it.
  const rest = dialAngle(V, 0);
  if (n.a < rest) { n.a = rest; n.vel = Math.abs(n.vel) * 0.3; }
}

function drawNeedle(g, Sp, a, src, colour) {
  const k = Sp.r / src.r;
  g.save();
  g.translate(Sp.cx, Sp.cy); g.rotate(a);
  const path = () => {
    g.beginPath();
    g.moveTo(-26 * k, -4.5 * k); g.lineTo(76 * k, -2.6 * k); g.lineTo(76 * k, -8 * k);
    g.lineTo(100 * k, 0); g.lineTo(76 * k, 8 * k); g.lineTo(76 * k, 2.6 * k);
    g.lineTo(-26 * k, 4.5 * k); g.closePath();
  };
  g.save(); g.translate(1.2, 1.2); path(); g.fillStyle = 'rgba(46,17,8,.25)'; g.fill(); g.restore();
  path(); g.fillStyle = colour; g.fill();
  g.lineWidth = Math.max(0.7, 2.2 * k); g.strokeStyle = INK; g.stroke();
  circle(g, 0, 0, 16 * k);
  const hub = g.createRadialGradient(-5 * k, -5 * k, 0, 0, 0, 16 * k);
  hub.addColorStop(0, '#fbe3a0'); hub.addColorStop(1, '#a8792a');
  g.fillStyle = hub; g.fill(); g.stroke();
  circle(g, 0, 0, 5 * k); g.fillStyle = '#6f4a1c'; g.fill();
  g.restore();
}

/** Seven-segment digits, as on Big Tilly's centre gauge: segments a to g. */
const SEGS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

function segment(g, id, x, y, w, h, t) {
  const hw = w - t, hh = (h - 3 * t) / 2;
  const bars = {
    a: [x + t / 2, y, hw, t], g: [x + t / 2, y + t + hh, hw, t], d: [x + t / 2, y + 2 * t + 2 * hh, hw, t],
    f: [x, y + t / 2, t, hh + t], b: [x + w - t, y + t / 2, t, hh + t],
    e: [x, y + 1.5 * t + hh, t, hh + t], c: [x + w - t, y + 1.5 * t + hh, t, hh + t],
  };
  const [bx, by, bw, bh] = bars[id];
  rr(g, bx + 0.6, by + 0.6, bw - 1.2, bh - 1.2, Math.min(bw, bh) * 0.45);
}

/** Big Tilly's speed in amber LED digits on the gauge's dark face, where the
 *  painted ones were, the unlit segments faintly showing as real ones do. */
function drawLeds(g, Sp, mph) {
  const n = Math.min(99, Math.round(Math.max(0, mph)));
  const dh = Sp.r * 0.6, dw = dh * 0.54, t = Math.max(1.4, dh * 0.13), gap = dw * 0.32;
  const x0 = Sp.cx - Sp.r * 0.02 - (2 * dw + gap) / 2, y0 = Sp.cy - Sp.r * 0.03 - dh / 2;
  g.save();
  g.translate(Sp.cx, Sp.cy); g.transform(1, 0, -0.1, 1, 0, 0); g.translate(-Sp.cx, -Sp.cy);
  const cells = [n >= 10 ? Math.floor(n / 10) : -1, n % 10];
  cells.forEach((d, i) => {
    const x = x0 + i * (dw + gap);
    for (const s of 'abcdefg') {
      const on = d >= 0 && SEGS[d].includes(s);
      segment(g, s, x, y0, dw, dh, t);
      if (on) {
        g.save(); g.shadowColor = 'rgba(255,150,40,.9)'; g.shadowBlur = Sp.r * 0.28;
        g.fillStyle = '#ffb648'; g.fill(); g.restore();
        g.fillStyle = 'rgba(255,232,170,.55)'; g.fill();
      } else {
        g.fillStyle = 'rgba(255,170,70,.08)'; g.fill();
      }
    }
  });
  g.restore();
}

/** Spark's speed screen: the speed in digits under an arc that fills with
 *  it, and the battery's charge in a bar below, in the screen's cool ink. */
function drawSparkScreen(g, R, mph, charge, full) {
  const ink = '#2f3b3c', faint = 'rgba(47,59,60,.16)';
  g.save();
  rr(g, R.x, R.y, R.w, R.h, R.r); g.clip();
  const cx = R.x + R.w / 2, cy = R.y + R.h * 0.56, ar = Math.min(R.w * 0.4, R.h * 0.44);
  const a0 = Math.PI * 1.08, a1 = Math.PI * 1.92, f = Math.max(0, Math.min(1, mph / full));
  g.lineCap = 'round'; g.lineWidth = Math.max(2, ar * 0.13);
  g.strokeStyle = faint; g.beginPath(); g.arc(cx, cy, ar, a0, a1); g.stroke();
  if (f > 0.005) { g.strokeStyle = ink; g.beginPath(); g.arc(cx, cy, ar, a0, a0 + (a1 - a0) * f); g.stroke(); }
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = `700 ${Math.round(R.h * 0.38)}px "SF Pro Rounded", ${FONT}`;
  g.fillText(String(Math.round(Math.max(0, mph))), cx, cy + R.h * 0.08);
  g.font = `600 ${Math.max(6, Math.round(R.h * 0.12))}px ${FONT}`;
  g.fillStyle = 'rgba(47,59,60,.7)';
  g.fillText('mph', cx, cy + R.h * 0.2);
  // The battery: a body with a nub, five cells, lit for the charge.
  const bw = R.w * 0.42, bh = Math.max(6, R.h * 0.15), bx = cx - bw / 2, by = R.y + R.h - bh - R.h * 0.08;
  rr(g, bx, by, bw, bh, bh * 0.25); g.lineWidth = 1.2; g.strokeStyle = ink; g.stroke();
  g.fillStyle = ink; g.fillRect(bx + bw, by + bh * 0.3, Math.max(1.5, bw * 0.06), bh * 0.4);
  const cells = 5, lit = Math.max(1, Math.round(charge * cells)), cg = 1.2;
  const cw = (bw - 2 * 2 - (cells - 1) * cg) / cells;
  for (let i = 0; i < cells; i++) {
    g.fillStyle = i < lit ? (charge < 0.25 ? '#c4562f' : ink) : faint;
    g.fillRect(bx + 2 + i * (cw + cg), by + 2, cw, bh - 4);
  }
  glass(g, R);
  g.restore();
}

/** Trikey's speed: the painter's wooden arrow slides along the cloth to
 *  the speed, on a soft spring, and points up at it. */
function drawCloth(g, L, dash, mph, dt, reduce) {
  const S = dash.V.src, sp = dash.V.speed, Cl = L.cloth, k = Cl.h / S.cloth.h, p = dash.pointer;
  const want = Math.max(0, Math.min(1.07, mph / sp.mph));
  if (reduce) { p.x += (want - p.x) * (1 - Math.exp(-10 * dt)); p.vel = 0; }
  else {
    p.vel += (90 * (want - p.x) - 13 * p.vel) * dt;
    p.x = Math.max(0, p.x + p.vel * dt);
  }
  const tipX = Cl.x + (sp.x0 + (sp.x1 - sp.x0) * p.x) * k, tipY = Cl.y + sp.tip * k;
  const a = S.arrow, ah = Cl.h * 0.4, aw = ah * a.w / a.h;
  g.save(); g.shadowColor = 'rgba(46,17,8,.35)'; g.shadowOffsetY = 1.5; g.shadowBlur = 2;
  piece(g, dash.img, a, tipX - aw / 2, tipY - 1, aw, ah);
  g.restore();
}

/** Heading-up, like the road view: the route ahead points up the screen and
 *  turns as the world does, so left on the GPS is left on the road. */
function drawGps(g, L, s) {
  if (L.noGps) return;
  const R = L.gpsScreen;
  g.save();
  rr(g, R.x, R.y, R.w, R.h, R.r); g.clip();
  g.fillStyle = '#b5d197'; g.fillRect(R.x, R.y, R.w, R.h);

  const ppm = R.h / GPS_SPAN_M;
  const vx = R.x + R.w / 2, vy = R.y + R.h * 0.68;
  const reach = Math.hypot(R.w, R.h) / ppm;
  g.save();
  g.translate(vx, vy); g.rotate(-s.camH - Math.PI / 2); g.scale(ppm, ppm); g.translate(-s.x, -s.y);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const near = (ax, ay, bx, by) => {
    const mx = (ax + bx) / 2 - s.x, my = (ay + by) / 2 - s.y;
    return mx * mx + my * my < reach * reach * 1.5;
  };
  if (s.roads) {
    for (const pass of [0, 1]) {
      g.strokeStyle = pass ? '#fbf6e8' : 'rgba(80,70,50,.45)';
      for (const [ax, ay, bx, by, cls] of s.roads) {
        if (!near(ax, ay, bx, by)) continue;
        const px = cls === 'trunk' ? 3.2 : cls === 'track' ? 1.2 : 2;
        g.lineWidth = (px + (pass ? 0 : 1.4)) / ppm;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
    }
  }
  // The route: driven part faded, the rest in the guide line's blue.
  const pts = s.route || [];
  let i = 1;
  while (i < pts.length - 1 && pts[i].s < s.s) i++;
  if (pts.length > 1) {
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (let j = 1; j < i; j++) g.lineTo(pts[j].x, pts[j].y);
    g.lineTo(s.x, s.y);
    g.strokeStyle = 'rgba(120,110,100,.55)'; g.lineWidth = 2.4 / ppm; g.stroke();
    g.beginPath(); g.moveTo(s.x, s.y);
    for (let j = i; j < pts.length; j++) g.lineTo(pts[j].x, pts[j].y);
    g.strokeStyle = 'rgba(46,17,8,.5)'; g.lineWidth = 4.4 / ppm; g.stroke();
    g.strokeStyle = '#4a7ad6'; g.lineWidth = 3 / ppm; g.stroke();
    const end = pts[pts.length - 1];
    circle(g, end.x, end.y, 4.2 / ppm);
    g.fillStyle = '#8c3044'; g.fill(); g.lineWidth = 1.3 / ppm; g.strokeStyle = '#fffcf6'; g.stroke();
  }
  g.restore();

  // The van, always at the same spot, always pointing up.
  circle(g, vx, vy, 3.8);
  g.fillStyle = '#4b8b3b'; g.fill(); g.lineWidth = 1.3; g.strokeStyle = '#fffcf6'; g.stroke();
  g.beginPath(); g.moveTo(vx, vy - 8); g.lineTo(vx - 2.8, vy - 4); g.lineTo(vx + 2.8, vy - 4); g.closePath();
  g.fillStyle = '#fffcf6'; g.fill();

  glass(g, R);
  g.restore();
}

/** The glass over a screen: a soft highlight across it and the bezel's
 *  shade along its top. Drawn inside the screen's clip. */
function glass(g, R) {
  const gl = g.createLinearGradient(R.x, R.y, R.x + R.w * 0.6, R.y + R.h);
  gl.addColorStop(0, 'rgba(255,255,255,.28)'); gl.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.fillRect(R.x, R.y, R.w, R.h);
  const inner = g.createLinearGradient(0, R.y, 0, R.y + 5);
  inner.addColorStop(0, 'rgba(46,17,8,.35)'); inner.addColorStop(1, 'rgba(46,17,8,0)');
  g.fillStyle = inner; g.fillRect(R.x, R.y, R.w, 5);
}

/** A window over the road framed like the GPS, for the look-ahead window
 *  (Lily, 2026-10-12): the GPS's own painted bezel nine-sliced to any size,
 *  with the painting's soft shadow under it. x, y, w, h are its outside in
 *  CSS px and b the bezel's width. Returns the screen inside the bezel,
 *  { x, y, w, h, r }, for the page to draw into; windowGlass() then puts
 *  the glass over it, inside the same clip. */
export function windowFrame(ctx, dash, x, y, w, h, b) {
  shadowOf(ctx, () => rr(ctx, x, y, w, h, b * 0.3), 3);
  nine(ctx, dash.gpsFrame, dash.V.src.gps.border, x, y, w, h, b);
  return { x: x + b, y: y + b, w: w - 2 * b, h: h - 2 * b, r: b * 0.45 };
}
export function windowGlass(ctx, R) { glass(ctx, R); }

function mix(a, b, t) {
  const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}

function comfortColour(level) {
  if (level > 0.7) return mix('#e2a93a', '#76b052', Math.min(1, (level - 0.7) / 0.2));
  if (level > 0.35) return mix('#d1603a', '#e2a93a', (level - 0.35) / 0.35);
  return '#c9512f';
}

/** Cargo comfort: the window fills with calm green when the animals are
 *  settled and drains through amber to red as the driving unsettles them
 *  (car.jostle, 0 calm .. 100 unsettled), and the face in it goes from a
 *  smile to a wobble. A rough moment makes the level slosh, except under
 *  reduced motion. The window is the comfort plate's arch, or Trikey's
 *  round dial. */
function drawComfort(g, L, src, c, jostle, dt, reduce) {
  let ax, ay, ar, ab, clip, fy;
  if (L.comfortWin) {
    const W = L.comfortWin;
    ax = W.cx; ay = W.cy; ar = W.r; ab = W.cy + W.r; fy = W.cy - W.r * 0.05;
    clip = () => circle(g, W.cx, W.cy, W.r);
  } else {
    const C = L.comfort, k = C.h / src.comfort.h, A = src.comfort.arch;
    ax = C.x + A.cx * k; ay = C.y + A.cy * k; ar = A.r * k; ab = C.y + A.bottom * k; fy = ay + ar * 0.1;
    clip = () => {
      g.beginPath();
      g.moveTo(ax - ar, ab); g.lineTo(ax - ar, ay); g.arc(ax, ay, ar, Math.PI, 0); g.lineTo(ax + ar, ab);
      g.closePath();
    };
  }
  const want = 1 - Math.max(0, Math.min(100, jostle)) / 100;
  c.level += (want - c.level) * (1 - Math.exp(-5 * dt));
  if (reduce) c.wave = 0;
  else {
    c.wave = Math.min(1, c.wave + Math.max(0, jostle - c.lastJostle) * 0.04) * Math.exp(-1.6 * dt);
    c.t += dt;
  }
  c.lastJostle = jostle;

  g.save();
  clip(); g.clip();
  const topY = ay - ar, full = ab - topY;
  const lvl = ab - c.level * full;
  const amp = c.wave * 3;
  g.beginPath(); g.moveTo(ax - ar, ab);
  for (let x = -1; x <= 1.001; x += 0.25) {
    g.lineTo(ax + x * ar, lvl + Math.sin(c.t * 9 + x * 2.4) * amp * x);
  }
  g.lineTo(ax + ar, ab); g.closePath();
  g.fillStyle = comfortColour(c.level); g.fill();
  g.strokeStyle = 'rgba(255,252,240,.6)'; g.lineWidth = 1; g.stroke();

  // The face: a smile at rest, flat in the middle, a wobble when unsettled.
  const fr = ar * 0.72;
  g.fillStyle = INK;
  circle(g, ax - fr * 0.38, fy - fr * 0.2, Math.max(1, fr * 0.13)); g.fill();
  circle(g, ax + fr * 0.38, fy - fr * 0.2, Math.max(1, fr * 0.13)); g.fill();
  const curve = (c.level - 0.5) * 2;
  g.beginPath();
  if (c.level < 0.3) {
    g.moveTo(ax - fr * 0.42, fy + fr * 0.42);
    g.quadraticCurveTo(ax - fr * 0.2, fy + fr * 0.22, ax, fy + fr * 0.42);
    g.quadraticCurveTo(ax + fr * 0.2, fy + fr * 0.62, ax + fr * 0.42, fy + fr * 0.42);
  } else {
    g.moveTo(ax - fr * 0.42, fy + fr * 0.36);
    g.quadraticCurveTo(ax, fy + fr * (0.36 + curve * 0.42), ax + fr * 0.42, fy + fr * 0.36);
  }
  g.lineWidth = Math.max(1, fr * 0.12); g.lineCap = 'round'; g.strokeStyle = INK; g.stroke();
  g.restore();
}

/** A chunky knob with a cream face, as a dash this age would have; lit it
 *  glows amber and sits a touch lower, as if pressed in. Returns where its
 *  face is, for whatever is printed on it. */
function knobBody(g, k, lit, warm = 0) {
  const { cx, r } = k, cy = k.cy + (lit ? 1.2 : 0);
  shadowOf(g, () => circle(g, cx, cy, r), lit ? 1.2 : 2.6);
  circle(g, cx, cy, r);
  const ring = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, T.ring[0]); ring.addColorStop(0.45, T.ring[1]); ring.addColorStop(1, T.ring[2]);
  g.fillStyle = ring; g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();

  const fr = r * 0.76;
  g.save();
  if (lit) { g.shadowColor = 'rgba(255,186,64,.95)'; g.shadowBlur = 14; }
  circle(g, cx, cy, fr);
  const face = g.createRadialGradient(cx - fr * 0.3, cy - fr * 0.35, 0, cx, cy, fr);
  if (lit) { face.addColorStop(0, '#fff4c4'); face.addColorStop(0.55, '#ffc145'); face.addColorStop(1, '#e88a1a'); }
  else { face.addColorStop(0, mix('#fef5e2', '#fff1c0', warm)); face.addColorStop(1, mix('#e9d3ab', '#ffc65a', warm)); }
  g.fillStyle = face; g.fill();
  g.restore();
  circle(g, cx, cy, fr); g.lineWidth = 1; g.strokeStyle = 'rgba(46,17,8,.6)'; g.stroke();
  return { cx, cy, r, fr };
}

/** The warm glow the crossing animals are picked out with, amber like a lit
 *  knob, behind a knob the road is asking for. */
const HINT_GLOW = '255,176,52';

/** A gear knob: its number, and a pip for each gear. hint is how strongly it
 *  glows to be picked (0 to 1). */
function knob(g, k, lit, { hint = 0 } = {}) {
  const at = { cx: k.cx, cy: k.cy, r: k.r * (1 + 0.08 * hint) };
  const { cx, cy, r } = knobBody(g, at, lit, hint);
  if (hint > 0) {
    circle(g, cx, cy, r + 1.8);
    g.lineWidth = 3.2; g.strokeStyle = `rgba(255,226,140,${0.55 + 0.45 * hint})`; g.stroke();
  }
  g.fillStyle = lit ? '#3a1a06' : '#5a4330';
  g.font = `700 ${Math.round(r * 0.86)}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(k.n), cx, cy - r * 0.12);
  // A pip for each gear, for a child who does not read numbers yet.
  for (let i = 0; i < k.n; i++) {
    circle(g, cx + (i - (k.n - 1) / 2) * r * 0.24, cy + r * 0.47, Math.max(1.3, r * 0.075));
    g.fill();
  }
}

/** The glow behind a knob the road is asking for, drawn under every knob so
 *  it spills evenly onto the gate either side. */
function knobHalo(g, k, hint) {
  const r = k.r * (1 + 0.08 * hint);
  g.save();
  g.shadowColor = `rgba(${HINT_GLOW},${hint})`; g.shadowBlur = 22;
  circle(g, k.cx, k.cy, r + 6);
  const band = g.createRadialGradient(k.cx, k.cy, r, k.cx, k.cy, r + 6);
  band.addColorStop(0, `rgba(255,236,170,${hint})`); band.addColorStop(1, `rgba(${HINT_GLOW},${0.85 * hint})`);
  g.fillStyle = band; g.fill(); g.fill();
  g.restore();
}

/** The gear number, big enough to read at a glance, on a cream drum that
 *  rolls over when the gear changes: up for an up-change, down for a
 *  down-change, as an odometer's would. Under reduced motion the numbers
 *  cross-fade instead. In a gear too fast for the road, the number is the
 *  needle's red. On Trikey the number rolls in her shifter's round dial
 *  (round: { cx, cy, r }), over its own painted glass. */
function drawGearWindow(g, W, d, gear, over, now, reduce, round) {
  if (d.n !== gear) {
    d.prev = d.n || gear; d.dir = gear > d.prev ? 1 : -1; d.n = gear; d.at = d.n === d.prev ? -1e9 : now;
  }
  let D;
  g.save();
  if (round) {
    D = { x: round.cx - round.r, y: round.cy - round.r, w: 2 * round.r, h: 2 * round.r };
    circle(g, round.cx, round.cy, round.r); g.clip();
  } else {
    const b = 4.5;
    D = { x: W.x + b, y: W.y + b + 3, w: W.w - 2 * b, h: W.h - 2 * b - 6 };
    rr(g, D.x, D.y, D.w, D.h, 6); g.clip();
    const face = g.createLinearGradient(0, D.y, 0, D.y + D.h);
    face.addColorStop(0, '#d9bf92'); face.addColorStop(0.22, '#fef5e2');
    face.addColorStop(0.7, '#f6e7c8'); face.addColorStop(1, '#cdb184');
    g.fillStyle = face; g.fillRect(D.x, D.y, D.w, D.h);
  }

  const p = Math.min(1, (now - d.at) / 240), e = 1 - (1 - p) ** 3;
  const cx = D.x + D.w / 2, cy = D.y + D.h / 2;
  const numeral = (n, dy, alpha) => {
    if (alpha <= 0) return;
    g.globalAlpha = alpha;
    g.fillStyle = over && n === gear ? '#a3401f' : '#3a1a06';
    g.font = `700 ${Math.round(D.h * (round ? 0.8 : 0.74))}px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), cx, cy - D.h * (round ? 0.02 : 0.07) + dy);
    // The knobs' pips, so the number reads without reading.
    if (!round) {
      for (let i = 0; i < n; i++) {
        circle(g, cx + (i - (n - 1) / 2) * 6, cy + D.h * 0.36 + dy, 1.7); g.fill();
      }
    }
    g.globalAlpha = 1;
  };
  if (p >= 1) numeral(gear, 0, 1);
  else if (reduce) { numeral(d.prev, 0, 1 - e); numeral(gear, 0, e); }
  else { numeral(d.prev, -d.dir * e * D.h, 1); numeral(gear, d.dir * (1 - e) * D.h, 1); }

  // The drum curves away top and bottom.
  const shade = g.createLinearGradient(0, D.y, 0, D.y + D.h);
  const sa = round ? 0.22 : 0.38;
  shade.addColorStop(0, `rgba(46,17,8,${sa})`); shade.addColorStop(0.2, 'rgba(46,17,8,0)');
  shade.addColorStop(0.8, 'rgba(46,17,8,0)'); shade.addColorStop(1, `rgba(46,17,8,${sa})`);
  g.fillStyle = shade; g.fillRect(D.x, D.y, D.w, D.h);
  g.restore();
  if (!round) { rr(g, D.x, D.y, D.w, D.h, 6); g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke(); }
}

/** The guide line's switch: the same knob with a little road on its face.
 *  Lit, the road carries the line in the guide's blue, ending in an arrow,
 *  as the road view does; unlit, the road is plain with its dashed centre,
 *  so what the switch does can be read off the knob without words. */
function drawGuideSwitch(g, G, on) {
  const { cx, cy, fr } = knobBody(g, G, on);
  const top = cy - fr * 0.8, foot = cy + fr * 0.8, hw0 = fr * 0.5, hw1 = fr * 0.2;
  g.beginPath();
  g.moveTo(cx - hw0, foot); g.lineTo(cx - hw1, top); g.lineTo(cx + hw1, top); g.lineTo(cx + hw0, foot);
  g.closePath();
  g.fillStyle = on ? '#4a3b31' : '#8b7a66'; g.fill();
  g.lineWidth = 1; g.strokeStyle = INK; g.stroke();
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (on) {
    const lw = Math.max(1.8, fr * 0.16), headTop = cy - fr * 0.9, headBase = cy - fr * 0.36, hh = fr * 0.34;
    g.strokeStyle = '#78a9ff'; g.lineWidth = lw;
    g.beginPath(); g.moveTo(cx, foot - fr * 0.08); g.lineTo(cx, headBase + 1); g.stroke();
    g.beginPath(); g.moveTo(cx, headTop); g.lineTo(cx - hh, headBase); g.lineTo(cx + hh, headBase); g.closePath();
    g.fillStyle = '#78a9ff'; g.fill();
    g.lineWidth = 1; g.strokeStyle = '#1f3f87'; g.stroke();
  } else {
    g.strokeStyle = '#f2ead8'; g.lineWidth = Math.max(1.4, fr * 0.1); g.setLineDash([fr * 0.2, fr * 0.22]);
    g.beginPath(); g.moveTo(cx, foot - fr * 0.06); g.lineTo(cx, top + fr * 0.06); g.stroke();
    g.setLineDash([]);
  }
}

/** The horn: a maroon button in a metal ring, with a little bugle on it. */
function drawHorn(g, H, down) {
  const r = H.r, cx = H.cx, cy = H.cy + (down ? 1.4 : 0);
  shadowOf(g, () => circle(g, cx, cy, r), down ? 1.2 : 2.6);
  circle(g, cx, cy, r);
  const ring = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, T.ring[0]); ring.addColorStop(0.45, T.ring[1]); ring.addColorStop(1, T.ring[2]);
  g.fillStyle = ring; g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
  const fr = r * 0.78;
  circle(g, cx, cy, fr);
  const dome = g.createRadialGradient(cx - fr * 0.35, cy - fr * 0.4, 0, cx, cy, fr);
  if (down) { dome.addColorStop(0, '#a8455a'); dome.addColorStop(1, '#4e1420'); }
  else { dome.addColorStop(0, '#d0697c'); dome.addColorStop(0.5, '#93334a'); dome.addColorStop(1, '#5e1a28'); }
  g.fillStyle = dome; g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(46,17,8,.7)'; g.stroke();

  // The bugle: mouthpiece, tube, bell; and sound when pressed.
  const u = r / 24;
  g.save(); g.translate(cx - 2 * u, cy);
  g.fillStyle = '#fbeacd'; g.strokeStyle = '#fbeacd'; g.lineCap = 'round';
  circle(g, -9 * u, 0, 2.6 * u); g.fill();
  g.lineWidth = 2.6 * u; g.beginPath(); g.moveTo(-8 * u, 0); g.lineTo(1 * u, 0); g.stroke();
  g.beginPath(); g.moveTo(0, -1.6 * u); g.lineTo(7 * u, -6.5 * u); g.lineTo(7 * u, 6.5 * u); g.lineTo(0, 1.6 * u);
  g.closePath(); g.fill();
  g.lineWidth = 1.6 * u;
  for (const [i, rad] of [[0, 5], [1, 9]]) {
    g.globalAlpha = down ? 1 : 0.55 - i * 0.15;
    g.beginPath(); g.arc(8 * u, 0, rad * u, -0.7, 0.7); g.stroke();
  }
  g.restore();
}

/** Trikey's horn is her bell, the painted one, in its own sunk plate:
 *  pressed, it dips and rings. */
function drawBell(g, H, down, dash) {
  const s = dash.V.src.bell, bw = H.r * 1.9, bh = bw * s.h / s.w;
  const x = H.cx - bw / 2, y = H.cy - bh / 2 + (down ? 1.5 : 0);
  g.save(); g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowOffsetY = down ? 1 : 2.5; g.shadowBlur = 3;
  piece(g, dash.img, s, x, y, bw, bh);
  g.restore();
  if (!down) return;
  g.save();
  g.strokeStyle = '#fbeacd'; g.lineCap = 'round'; g.lineWidth = 1.8;
  const cy = y + bh * 0.4;
  for (const side of [-1, 1]) {
    for (const rad of [bw * 0.56, bw * 0.7]) {
      g.beginPath(); g.arc(H.cx, cy, rad, side < 0 ? Math.PI - 0.45 : -0.45, side < 0 ? Math.PI + 0.45 : 0.45); g.stroke();
    }
  }
  g.restore();
}

/** The handbrake: a lever with a red grip that rises while held, and a red
 *  lamp on its plate that lights. Held is braking, as in the page. */
function drawHandbrake(g, B, t, on) {
  const px = B.x + 16, py = B.y + B.h - 14;
  const ang = (-26 - 36 * t) * DEG, len = 46;
  g.save();
  g.translate(px, py); g.rotate(ang);
  const arm = () => rr(g, -5, -4.5, len * 0.6, 9, 4.5);
  shadowOf(g, arm, 2.5);
  arm();
  const steel = g.createLinearGradient(0, -4.5, 0, 4.5);
  steel.addColorStop(0, '#e4dfcf'); steel.addColorStop(1, '#7c776a');
  g.fillStyle = steel; g.fill(); g.lineWidth = 1.4; g.strokeStyle = INK; g.stroke();
  const grip = () => rr(g, len * 0.4, -7.5, len * 0.6, 15, 7.5);
  shadowOf(g, grip, 2.5);
  grip();
  const rub = g.createLinearGradient(0, -7.5, 0, 7.5);
  rub.addColorStop(0, '#d2687c'); rub.addColorStop(0.5, '#93334a'); rub.addColorStop(1, '#5e1a28');
  g.fillStyle = rub; g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
  g.strokeStyle = 'rgba(46,17,8,.55)'; g.lineWidth = 1.1;
  for (let i = 1; i <= 3; i++) {
    const x = len * 0.44 + i * len * 0.12;
    g.beginPath(); g.moveTo(x, -5.5); g.lineTo(x, 5.5); g.stroke();
  }
  circle(g, len + 0.5, 0, 4.4);
  g.fillStyle = '#e0b85a'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke();
  g.restore();
  screw(g, px, py, 4.2);

  const lx = B.x + B.w - 13, ly = B.y + B.h - 12;
  g.save();
  if (on) { g.shadowColor = 'rgba(255,70,40,.95)'; g.shadowBlur = 12; }
  circle(g, lx, ly, 5);
  g.fillStyle = on ? '#ff5a35' : '#6a2418'; g.fill();
  g.restore();
  circle(g, lx, ly, 5); g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke();
  if (on) { circle(g, lx - 1.5, ly - 1.6, 1.4); g.fillStyle = '#ffd9c8'; g.fill(); }
}

export function draw(ctx, dash, w, h, s) {
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - dash.last) / 1000));
  dash.last = now;
  const reduce = dash.reduce.matches;
  const V = dash.V;
  T = V.theme;
  const L = layout(dash, w, h);
  const dpr = ctx.getTransform().a || 1;
  if (!dash.bg || dash.bgDpr !== dpr) { dash.bg = paintBackground(dash, L, w, dpr); dash.bgDpr = dpr; }

  // The dash's top edge throws a little shade back onto the road.
  const sh = ctx.createLinearGradient(0, L.top - 7, 0, L.top);
  sh.addColorStop(0, 'rgba(46,17,8,0)'); sh.addColorStop(1, 'rgba(46,17,8,.3)');
  ctx.fillStyle = sh; ctx.fillRect(0, L.top - 7, w, 7);
  ctx.drawImage(dash.bg, 0, L.top, w, L.H);

  const mph = s.v * MPH;
  switch (V.speed.kind) {
    case 'needle':
      stepNeedle(V, dash.needle, mph, dt, reduce);
      drawNeedle(ctx, L.speedo, dash.needle.a, V.src.speedo, V.needle);
      break;
    case 'leds': drawLeds(ctx, L.speedo, mph); break;
    case 'screen': drawSparkScreen(ctx, L.screenIn, mph, s.charge ?? 0.8, V.speed.full); break;
    case 'cloth': drawCloth(ctx, L, dash, mph, dt, reduce); break;
  }
  drawGps(ctx, L, s);
  drawComfort(ctx, L, V.src, dash.comfort, s.jostle, dt, reduce);
  // The prompt pulses about once a second, and holds steady under reduced
  // motion.
  const pulse = reduce ? 0.85 : 0.3 + 0.7 * (0.5 - 0.5 * Math.cos(now / 1000 * TAU));
  for (const k of L.gears.knobs) if (k.n === s.gearHint) knobHalo(ctx, k, pulse);
  for (const k of L.gears.knobs) {
    knob(ctx, k, k.n === s.gear, { hint: k.n === s.gearHint ? pulse : 0 });
  }
  if (L.gearWin) {
    let round = null;
    if (L.handlebar) {
      const W = L.gearWin, f = V.src.shifter.face, k = W.w / V.src.shifter.w;
      round = { cx: W.x + f.cx * k, cy: W.y + f.cy * k, r: f.r * k };
    }
    drawGearWindow(ctx, L.gearWin, dash.drum, s.gear, !!s.tooFast, now, reduce, round);
  }
  drawGuideSwitch(ctx, L.guide, s.guide !== false);
  const down = now - dash.hornAt < 260;
  if (V.horn === 'bell') drawBell(ctx, L.horn, down, dash);
  else drawHorn(ctx, L.horn, down);
  dash.lever += ((s.handbrake ? 1 : 0) - dash.lever) * (1 - Math.exp(-28 * dt));
  drawHandbrake(ctx, L.brake, dash.lever, s.handbrake);
}

// ------------------------------------------------------------------- horn

let audio = null;

/** Two soft notes, not a blare: some of the children this is for find a
 *  sudden loud sound hard, so the horn is a polite beep-beep. Trikey's is
 *  her bicycle bell, ting-ting, as gentle. */
export function honk(dash) {
  dash.hornAt = performance.now();
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime + 0.01;
    if (dash.V.horn === 'bell') { ring(t0); return; }
    const out = audio.createGain(); out.gain.value = 0.1;
    const lp = audio.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    lp.connect(out); out.connect(audio.destination);
    for (const start of [0, 0.17]) {
      const env = audio.createGain();
      env.gain.setValueAtTime(0, t0 + start);
      env.gain.linearRampToValueAtTime(1, t0 + start + 0.012);
      env.gain.setValueAtTime(1, t0 + start + 0.1);
      env.gain.linearRampToValueAtTime(0, t0 + start + 0.13);
      env.connect(lp);
      for (const f of [392, 494]) {
        const o = audio.createOscillator();
        o.type = 'triangle'; o.frequency.value = f;
        o.connect(env); o.start(t0 + start); o.stop(t0 + start + 0.14);
      }
    }
  } catch { /* no sound is fine; the toast still says beep */ }
}

/** A bicycle bell: two light strikes, each a few bell-like partials that
 *  die away. */
function ring(t0) {
  const out = audio.createGain(); out.gain.value = 0.06;
  out.connect(audio.destination);
  for (const start of [0, 0.16]) {
    for (const [f, a, d] of [[2093, 1, 0.5], [2740, 0.5, 0.35], [4180, 0.25, 0.2]]) {
      const o = audio.createOscillator(), env = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      env.gain.setValueAtTime(0, t0 + start);
      env.gain.linearRampToValueAtTime(a, t0 + start + 0.004);
      env.gain.exponentialRampToValueAtTime(0.001, t0 + start + d);
      o.connect(env); env.connect(out);
      o.start(t0 + start); o.stop(t0 + start + d + 0.02);
    }
  }
}

// ------------------------------------------------------------ gear change

/** A short mechanical clunk: a low thump with a knock of noise on top, a
 *  shade deeper for a down-change. The animals feel it as a twitch of the
 *  comfort gauge, which settles straight away; not under reduced motion. */
export function clunk(dash, dir) {
  if (!dash.reduce.matches) dash.comfort.wave = Math.min(1, dash.comfort.wave + 0.3);
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime + 0.01;
    const out = audio.createGain(); out.gain.value = 0.16;
    out.connect(audio.destination);

    const thump = audio.createOscillator(), te = audio.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(dir > 0 ? 150 : 120, t0);
    thump.frequency.exponentialRampToValueAtTime(50, t0 + 0.09);
    te.gain.setValueAtTime(0, t0);
    te.gain.linearRampToValueAtTime(1, t0 + 0.005);
    te.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
    thump.connect(te); te.connect(out);
    thump.start(t0); thump.stop(t0 + 0.13);

    const n = Math.ceil(audio.sampleRate * 0.05);
    const buf = audio.createBuffer(1, n, audio.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
    const knock = audio.createBufferSource(); knock.buffer = buf;
    const bp = audio.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = dir > 0 ? 1300 : 1000; bp.Q.value = 2.5;
    const ke = audio.createGain(); ke.gain.value = 0.7;
    knock.connect(bp); bp.connect(ke); ke.connect(out);
    knock.start(t0 + 0.004);
  } catch { /* no sound is fine; the number still rolls over */ }
}
