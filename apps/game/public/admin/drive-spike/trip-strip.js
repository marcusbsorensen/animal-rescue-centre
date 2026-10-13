// trip-strip.js — how far to the destination, and the sights on the way.
//
// Lily, 2026-10-12, first: "we need a countdown or indicator to show us how
// close we are to our destination". Then, playing it: "the trip strip needs
// to be vertical instead of horizontal, and it needs some milestones / sights
// from along the way as landmarks for the kids to orient themselves on the
// journey".
//
// So the strip is a little road up the left edge of the road view: where she
// set off at the bottom, the destination's flag and name at the top, and the
// van's own icon climbing it as she drives, because the van drives up the
// screen and up is onward. Beside it, at their places along the journey, the
// sights she will pass: a church, the station, the car wash where the tube
// man waves, a farm. They come from the real map (landmarks.json, read from
// OpenStreetMap), so the strip's order is the road's order. Each one also has
// a painted fingerpost at the roadside in the world, on her side of the road,
// pointing to the side the sight is on and naming it, so the strip and the
// road match: as the van's icon passes the church's icon, the van passes the
// church's sign, and its icon pops. The distance still to go is written
// small under the destination's name for the grown-up.
//
// Contract with drive-spike.html:
//   create(wrap, look)           builds the strip in #wrap, returns T. look is
//                                the page's ?strip=: 'a', 'b' or 'c' for the
//                                three directions Marcus is choosing between
//                                (see "The compact strips" below), anything
//                                else the strip as it is
//   load(T)                      fetches landmarks.json; without it there are
//                                no sights and the strip still works
//   setVan(T, src)               the van's own top-down picture, pointing up
//   setRoute(T, r)               a new drive. r = { route (points {x, y, s}),
//                                nodes (the graph node of each point), graph,
//                                total (metres to the stopping point), from,
//                                dest (anchor ids), nameOf(anchorId),
//                                toWorld(fx, fy) -> {x, y}, atDistance(s),
//                                roadHalfAt(s) (metres, centreline to kerb) }
//   layout(T, g)                 where it sits. g = { left, top, w, h, roadH,
//                                clearTop, look } in #wrap's px: left/top the
//                                canvas's corner, w x h its size, roadH the
//                                road view above the dashboard, clearTop the
//                                bottom of the chips, look the look-ahead
//                                window's outside when fully open (canvas px)
//                                or null. Cheap to call every frame.
//   update(T, u)                 u = { s, arrived, reduce }. Every frame;
//                                writes only what changed.
//   drawSigns(ctx, T, view)      the fingerposts, under the world transform
//                                (view as scenery.js documents it)
//
// Which sights a drive shows: of those within their reach of the road (the
// data's metres; a tower is seen from further than a school) and not at the
// start or the destination, the best ranked and nearest, at most six and no
// two closer along the road than a ninth of the drive, so their icons never
// touch. A drive with fewer than three looks again a little further out and
// closer together, and then counts the corners where it turns at a junction
// ("Crossroads", "The corner"), which is how a child gives directions in open
// country.

const DATA_URL = '/assets/driving/landmarks.json';
const MAX_MARKS = 6, MIN_MARKS = 3;
const END_CLEAR_M = 30;          // a sight this near the start or the end is the place itself
const INK = '#33241a';           // the painted world's outline (crossings.js)
const CREAM = '#fffaf0';

// --------------------------------------------------------------------- DOM

const CSS = `
#trip { position: absolute; left: 0; top: 0; width: 62px; height: 300px; pointer-events: none; z-index: 1;
  color: #3a3226; --icon: 22px; --road: 10px; --van: 14px; }
#trip.hidden { visibility: hidden; }
#trip .tPanel { position: absolute; inset: 0; border-radius: 14px; background: rgba(255,252,246,.86);
  box-shadow: 0 2px 6px rgba(0,0,0,.18); transition: background-color .4s, box-shadow .4s; }
#trip .tHead { position: absolute; left: 0; top: 0; width: max-content; display: flex; align-items: flex-start; gap: 2px;
  padding: 5px 10px 5px 0; border-radius: 14px; background: rgba(255,252,246,.95);
  box-shadow: 0 2px 6px rgba(0,0,0,.14); transition: background-color .4s, box-shadow .4s; }
#trip .tFlag { flex: none; width: 20px; height: 28px; transform-origin: 3.5px 27px; }
#trip .tLabel { display: flex; flex-direction: column; line-height: 1.1; padding-top: 2px; max-width: 100px; }
#trip .tName { font-size: 13px; font-weight: 800; }
#trip .tLeft { font-size: 10.5px; font-weight: 700; color: #7a6a52; }
#trip .tRoad { position: absolute; left: calc(50% - var(--road) / 2); width: var(--road); border-radius: 5px;
  background: #6c6f6b; box-shadow: inset 0 0 0 1px rgba(46,17,8,.25); }
#trip .tRoad::after { content: ""; position: absolute; left: calc(50% - .5px); top: 6px; bottom: 6px; width: 1px;
  background: repeating-linear-gradient(180deg, #f7f2e4 0 5px, transparent 5px 10px); }
#trip .tDone { position: absolute; left: 0; right: 0; bottom: 0; height: 0; border-radius: 0 0 5px 5px;
  background: rgba(255,252,246,.55); }
#trip .tStart { position: absolute; left: 50%; bottom: -4px; width: 12px; height: 12px; margin-left: -6px;
  border-radius: 50%; background: #e8dcc0; box-shadow: inset 0 0 0 1.5px ${INK}; }
#trip .tVan { position: absolute; left: 50%; bottom: 0; width: var(--van); margin-left: calc(var(--van) / -2);
  filter: drop-shadow(0 1px 1px rgba(46,17,8,.45)); z-index: 2; }
#trip .tMark { position: absolute; width: var(--icon); height: var(--icon); }
#trip .tMark img { display: block; width: 100%; height: 100%; transition: opacity .4s; }
#trip .tMark.pair { height: calc(var(--icon) * 1.6); }
#trip .tMark.pair img { width: 80%; height: 50%; margin: 0 auto; }
#trip .tMark.passed img { opacity: .5; }
#trip .tMark.next img { filter: drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 3px #e9b93c); }
#trip .tMark.pop img { animation: tPop .5s ease-out; }
#trip.arrived .tPanel, #trip.arrived .tHead { background: rgba(255,240,196,.97);
  box-shadow: 0 0 0 2px #e6cf9f, 0 2px 10px rgba(214,160,40,.45); }
#trip.arrived .tFlag { animation: tWave .5s ease-in-out 4 alternate; }
#trip .tSparks { position: absolute; left: 12px; top: 9px; width: 0; height: 0; }
#trip .spark { position: absolute; left: -5px; top: -5px; width: 10px; height: 10px; color: #e0a92e;
  font-size: 11px; line-height: 10px; opacity: 0; }
#trip.arrived .spark { animation: tSpark 1.3s ease-out forwards; }
#trip.arrived .spark:nth-child(2) { animation-delay: .15s; }
#trip.arrived .spark:nth-child(3) { animation-delay: .3s; }
@keyframes tWave { from { transform: rotate(-7deg); } to { transform: rotate(7deg); } }
@keyframes tSpark { 0% { opacity: 0; transform: translate(0, 0) scale(.4); }
  30% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1.1); } }
@keyframes tPop { 0% { transform: scale(1); } 35% { transform: scale(1.35); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) {
  #trip.arrived .tFlag, #trip .tMark.pop img { animation: none; }
  #trip.arrived .spark { animation: none; opacity: 1; transform: translate(var(--dx), var(--dy)); }
  #trip .tPanel, #trip .tHead, #trip .tMark img { transition: none; }
}`;

const SVG_NS = 'http://www.w3.org/2000/svg';
/** An element with attributes and children, built without parsing markup. */
function el(tag, attrs = {}, kids = [], ns = null) {
  const e = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) e.append(k);
  return e;
}

function flag() {
  const s = (tag, a) => el(tag, a, [], SVG_NS);
  return el('svg', { class: 'tFlag', viewBox: '0 0 18 26', 'aria-hidden': 'true' }, [
    s('rect', { x: 2, y: 2, width: 2.2, height: 23, rx: 1.1, fill: '#6b4a2b' }),
    s('path', { d: 'M4 3 L16.5 7.2 L4 11.6 Z', fill: '#8c3044', stroke: '#fffcf6', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }),
    s('circle', { cx: 3.1, cy: 2.4, r: 1.7, fill: '#e0b94e' }),
  ], SVG_NS);
}

export function create(wrap, look) {
  if (LOOKS.includes(look)) return createHud(wrap, look);
  if (!document.getElementById('tripStripCss')) {
    const st = el('style', { id: 'tripStripCss' });
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const T = {
    data: null, degree: null, degreeOf: null, marks: [], signs: [], total: 1,
    geo: null, key: '', vanY: null, text: null, arrived: false, vanAspect: 2,
  };
  T.done = el('div', { class: 'tDone' });
  T.marksEl = el('div', { class: 'tMarks' });
  T.van = el('img', { class: 'tVan', alt: '' });
  T.road = el('div', { class: 'tRoad' }, [T.done, el('div', { class: 'tStart' }), T.van]);
  T.name = el('span', { class: 'tName' }, ['—']);
  T.left = el('span', { class: 'tLeft' });
  const spark = (dx, dy) => el('span', { class: 'spark', style: `--dx:${dx}px;--dy:${dy}px` }, ['✦']);
  T.head = el('div', { class: 'tHead' }, [flag(), el('div', { class: 'tLabel' }, [T.name, T.left]),
    el('span', { class: 'tSparks', 'aria-hidden': 'true' }, [spark(-12, -9), spark(11, -8), spark(-4, 13)])]);
  T.el = el('div', { id: 'trip', class: 'hidden', role: 'img', 'aria-label': 'on the way' },
    [el('div', { class: 'tPanel' }), T.road, T.marksEl, T.head]);
  wrap.appendChild(T.el);
  return T;
}

export async function load(T) {
  try {
    const res = await fetch(DATA_URL);
    if (res.ok) T.data = await res.json();
  } catch { /* no sights: the strip still shows the van and the flag */ }
}

export function setVan(T, src) {
  T.van.onload = () => {
    if (T.van.naturalWidth) T.vanAspect = T.van.naturalHeight / T.van.naturalWidth;
    T.key = '';
  };
  T.van.src = src;
}

// ----------------------------------------------------------- choosing sights

/** The nearest point of the route to (x, y): its distance, how far along
 *  the route it is, and which side it is on (-1 left, +1 right, as the
 *  page's laneOffset counts them). */
function nearest(route, x, y) {
  let best = null;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
    const d = Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
    if (!best || d < best.d) {
      const cross = dx * (y - a.y) - dy * (x - a.x);
      best = { d, s: a.s + t * (b.s - a.s), side: cross >= 0 ? 1 : -1 };
    }
  }
  return best;
}

function pick(cands, length, gapK) {
  const gap = Math.max(90, length / 9) * gapK;
  const out = [];
  for (const c of cands) {
    if (out.length >= MAX_MARKS) break;
    if (out.every(o => Math.abs(o.s - c.s) >= gap)) out.push(c);
  }
  return out;
}

/** The junctions a child would give directions by: a crossroads (four or
 *  more roads meet), and a corner where the route turns off at a junction
 *  of three (the heading 20 m either side differs by more than 50 degrees). */
function corners(T, r, length) {
  const g = r.graph;
  if (T.degreeOf !== g) {
    T.degree = new Uint8Array(g.nodes.length);
    for (const [i, j] of g.edges) if (i >= 0 && j >= 0) { T.degree[i]++; T.degree[j]++; }
    T.degreeOf = g;
  }
  const out = [];
  for (let k = 1; k < r.route.length - 1; k++) {
    const n = r.nodes[k], p = r.route[k];
    if (T.degree[n] < 3 || p.s < END_CLEAR_M * 2 || p.s > length - END_CLEAR_M * 2) continue;
    const a = r.atDistance(Math.max(0, p.s - 20)), b = r.atDistance(Math.min(length, p.s + 20));
    const h0 = Math.atan2(p.y - a.y, p.x - a.x), h1 = Math.atan2(b.y - p.y, b.x - p.x);
    const turn = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
    if (Math.abs(turn) < 50 * Math.PI / 180 && T.degree[n] < 4) continue;
    out.push({ id: 'corner-' + n, kind: 'junction', name: T.degree[n] >= 4 ? 'Crossroads' : 'The corner',
      rank: 4, s: p.s, d: 0, side: turn < 0 ? -1 : 1, near: 0 });
  }
  return out;
}

/** The sights this drive passes, in the order she passes them. */
export function choose(T, r) {
  const length = r.route[r.route.length - 1].s;
  const all = [];
  for (const m of T.data?.landmarks ?? []) {
    if (m.anchor && (m.anchor === r.from || m.anchor === r.dest)) continue;
    const name = m.anchor ? r.nameOf(m.anchor) : m.name;
    if (!name) continue;
    const w = r.toWorld(m.at[0], m.at[1]);
    const n = nearest(r.route, w.x, w.y);
    if (!n || n.s < END_CLEAR_M || n.s > length - END_CLEAR_M) continue;
    const reach = m.reach ?? 100;
    all.push({ id: m.id, kind: m.kind, name, rank: m.rank ?? 2, with: m.with ?? null,
      s: n.s, d: n.d, side: n.side, near: n.d / reach });
  }
  // A sight next door to another (the data's `with`: Fishy Bones beside Car
  // Wash Wahoo!) is not spaced out from it: it rides on that one's sign, an
  // arm of its own, and stands beside its icon on the strip.
  const ids = new Set(all.map(c => c.id));
  const guest = c => c.with && ids.has(c.with);
  const hosts = all.filter(c => !guest(c));
  const order = (a, b) => a.rank - b.rank || a.near - b.near;
  let got = pick(hosts.filter(c => c.near <= 1).sort(order), length, 1);
  if (got.length < MIN_MARKS) got = pick(hosts.filter(c => c.near <= 1.6).sort(order), length, 0.6);
  if (got.length < MIN_MARKS) {
    const more = corners(T, r, length).filter(c => got.every(o => Math.abs(o.s - c.s) >= 120));
    got = pick([...got, ...more], length, 0.6);
  }
  for (const g of got) g.also = all.find(c => guest(c) && c.with === g.id) ?? null;
  return got.sort((a, b) => a.s - b.s);
}

export function setRoute(T, r) {
  T.total = Math.max(1, r.total);
  T.marks = r.route.length > 1 ? choose(T, r) : [];
  if (T.look) { setRouteHud(T, r); return; }
  T.name.textContent = r.nameOf(r.dest) ?? r.dest;
  T.el.classList.remove('arrived');
  T.arrived = false;
  T.text = null; T.vanY = null;
  T.signs = signsFor(T, r);
  T.marksEl.replaceChildren(...T.marks.map(m => {
    // A pair stands one above the other, the one she passes first lower.
    const both = m.also ? [m, m.also].sort((a, b) => b.s - a.s) : [m];
    m.el = el('div', { class: 'tMark' + (m.also ? ' pair' : ''), title: both.map(b => b.name).join(' and ') },
      both.map(b => el('img', { alt: '', src: iconURL(b.kind) })));
    m.state = '';
    return m.el;
  }));
  T.key = '';
  window.__trip = T;   // which sights this drive shows, for a test
}

/** The signs stand on her side of the road, just past the kerb, and point
 *  to the side the sight is on. */
function signsFor(T, r) {
  return T.marks.map(m => {
    const p = r.atDistance(m.s), lat = -(r.roadHalfAt(m.s) + 0.6);
    return { ...m, x: p.x - Math.sin(p.h) * lat, y: p.y + Math.cos(p.h) * lat, h: p.h,
      board: signBoard(m.kind, m.name, m.side), board2: m.also && signBoard(m.also.kind, m.also.name, m.also.side) };
  });
}

// ------------------------------------------------------------------ layout

/** Upright the strip is narrow, so it never crowds the road; held sideways
 *  there is room, and it grows with the screen's height. */
function sizes(w, h) {
  const icon = w > h ? Math.max(22, Math.min(32, Math.round(h / 25))) : 20;
  const road = Math.round(icon * 0.46);
  return { icon, road, van: Math.round(icon * 0.72), width: icon * 2 + road + 10 };
}

export function layout(T, g) {
  if (T.look) { layoutHud(T, g); return; }
  const S = sizes(g.w, g.h);
  const x = g.left + 8;
  // Below the chips, and below the look-ahead window wherever it would open
  // over the strip or its labels (across the whole top, held upright).
  let top = g.clearTop + 8;
  if (g.look && g.look.x < x - g.left + S.width + 160) top = Math.max(top, g.top + g.look.y + g.look.h + 8);
  const bottom = g.top + g.roadH - 10;
  const key = [x, top, bottom, S.icon, T.vanAspect].map(v => Math.round(v * 10)).join(',');
  if (key === T.key) return;
  T.key = key;
  const H = Math.max(120, bottom - top);
  Object.assign(T.el.style, { left: x + 'px', top: top + 'px', width: S.width + 'px', height: H + 'px' });
  T.el.style.setProperty('--icon', S.icon + 'px');
  T.el.style.setProperty('--road', S.road + 'px');
  T.el.style.setProperty('--van', S.van + 'px');
  // The flag's pole stands on the end of the road, its name beside it.
  T.head.style.paddingLeft = (S.width / 2 - 3.4) + 'px';
  // The road runs from under the flag's foot to just above the bottom.
  const roadTop = 30, roadBottom = H - 12, len = Math.max(40, roadBottom - roadTop);
  Object.assign(T.road.style, { top: roadTop + 'px', height: len + 'px' });
  const vanH = S.van * T.vanAspect;
  T.geo = { len, vanH };
  // Each sight's icon level with the van icon's middle when the van is at it,
  // on the side of the road it is on.
  const run = Math.max(0, len - vanH);
  for (const m of T.marks) {
    const y = roadTop + len - (vanH / 2 + run * Math.min(1, m.s / T.total));
    const left = m.side < 0 ? 3 : S.width - S.icon - 3;
    const h = m.also ? S.icon * 1.6 : S.icon;
    Object.assign(m.el.style, { left: left + 'px', top: (y - h / 2) + 'px' });
  }
  T.vanY = null;
  T.el.classList.remove('hidden');
}

// ------------------------------------------------------------------ update

function distanceText(m) {
  if (m >= 1000) return (m / 1000).toFixed(1) + ' km';
  return (m >= 100 ? Math.round(m / 10) * 10 : Math.round(m)) + ' m';
}

export function update(T, u) {
  if (T.look) { updateHud(T, u); return; }
  if (!T.geo) return;
  const p = Math.min(1, u.s / T.total);
  const run = Math.max(0, T.geo.len - T.geo.vanH);
  const y = Math.round(p * run * 2) / 2;
  if (y !== T.vanY) {
    T.vanY = y;
    T.van.style.transform = `translateY(${-y}px)`;
    T.done.style.height = (y + T.geo.vanH / 2) + 'px';
  }
  let next = null;
  for (const m of T.marks) {
    const passed = u.s >= m.s;
    if (!passed && !next) next = m;
    const state = [passed && 'passed', m === next && 'next'].filter(Boolean).join(' ');
    if (state !== m.state) {
      // Passing it: a small pop, as the van passes its sign.
      const pop = passed && m.state !== '' && !m.state.includes('passed') && !u.reduce;
      m.el.className = 'tMark ' + state + (m.also ? ' pair' : '') + (pop ? ' pop' : '');
      m.state = state;
    }
  }
  const text = u.arrived ? 'here' : distanceText(Math.max(0, T.total - u.s));
  if (text !== T.text) {
    T.text = text;
    T.left.textContent = text;
    T.el.setAttribute('aria-label', u.arrived ? 'arrived at ' + T.name.textContent
      : T.name.textContent + ', ' + text + ' to go' + (next ? ', next ' + next.name : ''));
  }
  if (u.arrived && !T.arrived) { T.arrived = true; T.el.classList.add('arrived'); }
}

// ------------------------------------------------------- the compact strips
//
// Marcus, 2026-10-13: "much too intrusive on the screen and there is wasted
// space on the left hand side ... more translucent, more compact, and a
// little bit less like small children's fairy tale drawings ... this is for
// eight, nine-year-olds." Three directions for him to choose between, by
// ?strip=, the strip above staying until he picks:
//   a  a slim frosted rail flush with the left edge, the whole drive, with
//      the destination and the next sight named in tags beside it
//   b  no panel at all: a thin outlined line floating over the verge with
//      ringed markers on it, its two names in haloed text
//   c  a short capsule at the top left that holds the whole drive, and grows
//      a card naming the next sight only while it is near
// All three use the same sights (choose()) and signs, and draw each sight as
// a flat pictogram on a disc coloured by what kind of place it is, as a
// map's key or a sat-nav does, instead of the painted icons. Translucent
// panels are dark tinted glass, so the white on them reads over pale grass
// and dark tarmac alike; the line in b carries its own dark outline.

const LOOKS = ['a', 'b', 'c'];
const NEAR_M = 300;   // c: the card opens when the next sight is this close

const HUD_CSS = `
#trip.hud { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 1; color: #fff;
  font-weight: 800; --disc: 18px; --van: 12px; --w: 30px; }
#trip.hud.hidden { visibility: hidden; }
#trip.hud .hPanel { position: absolute; inset: 0; }
#trip.hud .hRail { position: absolute; left: calc(var(--w) / 2 - 1.5px); width: 3px; border-radius: 2px;
  background: rgba(255,255,255,.38); }
#trip.hud .hDone { position: absolute; left: 0; right: 0; bottom: 0; height: 0; border-radius: 2px; background: #f4c04e; }
#trip.hud .tVan { position: absolute; left: 50%; bottom: 0; width: var(--van); margin-left: calc(var(--van) / -2);
  filter: drop-shadow(0 0 1px rgba(0,0,0,.7)) drop-shadow(0 1px 2px rgba(0,0,0,.45)); z-index: 3; }
#trip.hud .hMark, #trip.hud .hDest { position: absolute; left: calc(var(--w) / 2 - var(--disc) / 2);
  width: var(--disc); height: var(--disc); border-radius: 50%; z-index: 2;
  box-shadow: 0 0 0 1.5px #fff, 0 1px 3px rgba(0,0,0,.45); transition: opacity .3s, transform .3s; }
#trip.hud .hMark img, #trip.hud .hDest img { display: block; width: 100%; height: 100%; border-radius: 50%; }
#trip.hud .hMark.passed { opacity: .45; transform: scale(.7); }
#trip.hud .hMark.next { transform: scale(1.25); box-shadow: 0 0 0 2px #f4c04e, 0 1px 4px rgba(0,0,0,.5); }
#trip.hud .hTag { position: absolute; display: flex; align-items: center; gap: 6px; white-space: nowrap;
  line-height: 1.1; transition: opacity .3s; }
#trip.hud .hTag .hTxt { display: flex; flex-direction: column; }
#trip.hud .hName { font-size: 12.5px; }
#trip.hud .hLeft { font-size: 10.5px; font-weight: 700; opacity: .85; font-variant-numeric: tabular-nums; }
#trip.hud .hBar { display: none; }
#trip.hud .nTag img { display: none; }
#trip.hud .nTag.none { opacity: 0; }
#trip.hud.arrived .dTag .hLeft { color: #f4c04e; opacity: 1; }

/* a: the frosted rail. */
#trip.la .hPanel { border-radius: 0 12px 12px 0; background: rgba(20,24,30,.48);
  -webkit-backdrop-filter: blur(6px) saturate(1.2); backdrop-filter: blur(6px) saturate(1.2);
  box-shadow: inset -1px 0 0 rgba(255,255,255,.14); }
#trip.la .hTag { padding: 3px 9px 4px; border-radius: 9px; background: rgba(20,24,30,.58);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
#trip.la .nTag::before { content: ""; position: absolute; left: -5px; top: calc(50% - 5px);
  border: 5px solid transparent; border-left: 0; border-right-color: rgba(20,24,30,.58); }

/* b: no panel; everything carries its own outline. */
#trip.lb .hRail { width: 4px; left: calc(var(--w) / 2 - 2px); background: rgba(255,255,255,.9);
  box-shadow: 0 0 0 1.5px rgba(16,20,26,.6), 0 1px 4px rgba(0,0,0,.35); }
#trip.lb .hDone { background: #f4c04e; }
#trip.lb .hTag { text-shadow: 1px 0 1px #14161b, -1px 0 1px #14161b, 0 1px 1px #14161b, 0 -1px 1px #14161b,
  0 0 4px rgba(10,12,16,.9), 0 1px 8px rgba(10,12,16,.6); }
#trip.lb .hName { font-size: 13px; }
#trip.lb .hMark:not(.next):not(.passed) { transform: scale(.85); }

/* c: the capsule, and the card it grows. */
#trip.lc { --disc: 8px; }
#trip.lc .hPanel { border-radius: 999px; background: rgba(20,24,30,.5);
  -webkit-backdrop-filter: blur(6px) saturate(1.2); backdrop-filter: blur(6px) saturate(1.2);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }
#trip.lc .hMark { box-shadow: 0 0 0 1.5px #fff; background: rgba(20,24,30,.9); }
#trip.lc .hMark img { display: none; }
#trip.lc .hMark.next { background: #f4c04e; box-shadow: 0 0 0 1.5px #fff; transform: scale(1.3); }
#trip.lc .hDest { width: 20px; height: 20px; left: calc(var(--w) / 2 - 10px); }
#trip.lc .hTag { padding: 3px 9px 4px; border-radius: 9px; background: rgba(20,24,30,.58);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
#trip.lc .nTag { padding: 5px 10px 6px 5px; border-radius: 14px; transform-origin: 0 50%;
  transition: opacity .25s, transform .25s; }
#trip.lc .nTag img { display: block; width: 30px; height: 30px; border-radius: 50%; box-shadow: 0 0 0 1.5px #fff; }
#trip.lc .nTag .hName { font-size: 13.5px; }
#trip.lc .nTag .hBar { display: block; height: 3px; margin-top: 3px; border-radius: 2px; background: rgba(255,255,255,.25); }
#trip.lc .nTag .hBar i { display: block; height: 100%; border-radius: 2px; background: #f4c04e; transform-origin: 0 0; }
#trip.lc .nTag.none { opacity: 0; transform: scale(.6, .9); }
@media (prefers-reduced-motion: reduce) {
  #trip.hud .hMark, #trip.hud .hTag, #trip.lc .nTag { transition: none; }
}`;

function createHud(wrap, look) {
  if (!document.getElementById('tripHudCss')) {
    const st = el('style', { id: 'tripHudCss' });
    st.textContent = HUD_CSS;
    document.head.appendChild(st);
  }
  const T = {
    look, data: null, degree: null, degreeOf: null, marks: [], signs: [], total: 1,
    geo: null, key: '', vanY: null, text: null, arrived: false, vanAspect: 2, next: undefined, nextText: null,
    near: null, bar: null,
  };
  const tag = (cls, kids) => el('div', { class: 'hTag ' + cls }, kids);
  T.done = el('div', { class: 'hDone' });
  T.van = el('img', { class: 'tVan', alt: '' });
  T.road = el('div', { class: 'hRail' }, [T.done, T.van]);
  T.marksEl = el('div', { class: 'hMarks' });
  T.destDisc = el('div', { class: 'hDest' }, [el('img', { alt: '', src: glyphURL('finish') })]);
  T.name = el('span', { class: 'hName' }, ['—']);
  T.left = el('span', { class: 'hLeft' });
  T.destTag = tag('dTag', [el('span', { class: 'hTxt' }, [T.name, T.left])]);
  T.nextImg = el('img', { alt: '' });
  T.nextName = el('span', { class: 'hName' });
  T.nextLeft = el('span', { class: 'hLeft' });
  T.barFill = el('i');
  T.nextTag = tag('nTag none', [T.nextImg, el('span', { class: 'hTxt' }, [T.nextName, T.nextLeft, el('span', { class: 'hBar' }, [T.barFill])])]);
  T.el = el('div', { id: 'trip', class: 'hud l' + look + ' hidden', role: 'img', 'aria-label': 'on the way' },
    [el('div', { class: 'hPanel' }), T.road, T.marksEl, T.destDisc, T.destTag, T.nextTag]);
  wrap.appendChild(T.el);
  return T;
}

function setRouteHud(T, r) {
  T.name.textContent = r.nameOf(r.dest) ?? r.dest;
  T.el.classList.remove('arrived');
  T.arrived = false;
  T.text = null; T.vanY = null; T.next = undefined; T.nextText = null; T.near = null; T.bar = null;
  T.signs = signsFor(T, r);
  T.marksEl.replaceChildren(...T.marks.map(m => {
    // A pair shares one disc on the strip, as it shares one post.
    m.el = el('div', { class: 'hMark', title: [m, m.also].filter(Boolean).map(b => b.name).join(' and ') },
      [el('img', { alt: '', src: glyphURL(m.kind) })]);
    m.state = '';
    return m.el;
  }));
  T.key = '';
  window.__trip = T;
}

/** Each direction's sizes: a little bigger held sideways, where there is room. */
function hudSizes(look, w, h) {
  const land = w > h;
  if (look === 'c') return { w: land ? 30 : 26, disc: 8, van: land ? 14 : 12 };
  const disc = land ? Math.max(20, Math.min(26, Math.round(h / 34))) : 18;
  return { w: disc + 12, disc, van: Math.round(disc * 0.7) };
}

function layoutHud(T, g) {
  const S = hudSizes(T.look, g.w, g.h);
  // a hugs the edge; b floats just in from it; c sits under the chips.
  const x = g.left + (T.look === 'a' ? 0 : T.look === 'b' ? 4 : 8);
  let top = g.clearTop + 8;
  if (g.look && g.look.x < x - g.left + S.w + 160) top = Math.max(top, g.top + g.look.y + g.look.h + 8);
  let bottom = g.top + g.roadH - 10;
  if (T.look === 'c') bottom = Math.min(bottom, top + Math.max(140, Math.min(230, g.roadH * 0.3)));
  const key = [T.look, x, top, bottom, S.w, S.disc, T.vanAspect].map(v => typeof v === 'number' ? Math.round(v * 10) : v).join(',');
  if (key === T.key) return;
  T.key = key;
  const H = Math.max(110, bottom - top);
  Object.assign(T.el.style, { left: x + 'px', top: top + 'px', width: S.w + 'px', height: H + 'px' });
  T.el.style.setProperty('--w', S.w + 'px');
  T.el.style.setProperty('--disc', S.disc + 'px');
  T.el.style.setProperty('--van', S.van + 'px');
  // The destination's disc at the top, the rail from under it to the bottom.
  const destD = T.look === 'c' ? 20 : S.disc + 4;
  T.destDisc.style.width = T.destDisc.style.height = destD + 'px';
  T.destDisc.style.left = (S.w / 2 - destD / 2) + 'px';
  T.destDisc.style.top = (T.look === 'b' ? 0 : 5) + 'px';
  const roadTop = (T.look === 'b' ? 0 : 5) + destD + 6, roadBottom = H - (T.look === 'c' ? 12 : 8);
  const len = Math.max(40, roadBottom - roadTop);
  Object.assign(T.road.style, { top: roadTop + 'px', height: len + 'px' });
  const vanH = S.van * T.vanAspect;
  T.geo = { len, vanH, roadTop, w: S.w, destD };
  const run = Math.max(0, len - vanH);
  for (const m of T.marks) {
    m.y = roadTop + len - (vanH / 2 + run * Math.min(1, m.s / T.total));
    m.el.style.top = (m.y - S.disc / 2) + 'px';
  }
  // The destination's name beside its disc.
  const tagX = S.w + (T.look === 'b' ? 2 : 5);
  Object.assign(T.destTag.style, { left: tagX + 'px', top: (T.look === 'b' ? -2 : 3) + 'px' });
  T.next = undefined;   // re-place the next sight's tag
  T.vanY = null;
  T.el.classList.remove('hidden');
}

function updateHud(T, u) {
  if (!T.geo) return;
  const G = T.geo;
  const p = Math.min(1, u.s / T.total);
  const run = Math.max(0, G.len - G.vanH);
  const y = Math.round(p * run * 2) / 2;
  if (y !== T.vanY) {
    T.vanY = y;
    T.van.style.transform = `translateY(${-y}px)`;
    T.done.style.height = (y + G.vanH / 2) + 'px';
  }
  let next = null;
  for (const m of T.marks) {
    const passed = u.s >= m.s;
    if (!passed && !next) next = m;
    const state = passed ? 'passed' : m === next ? 'next' : '';
    if (state !== m.state) { m.el.className = 'hMark ' + state; m.state = state; }
  }
  if (next !== T.next) {
    T.next = next;
    if (next) {
      T.nextName.textContent = next.also ? next.name + ' & ' + next.also.name : next.name;
      T.nextImg.src = glyphURL(next.kind);
      // Level with its disc, but never over the destination's name.
      const tagX = G.w + (T.look === 'b' ? 2 : T.look === 'c' ? 6 : 8);
      const h = T.look === 'c' ? 44 : 32;
      const yy = Math.max(G.destD + 22, next.y - h / 2);
      Object.assign(T.nextTag.style, { left: tagX + 'px', top: yy + 'px' });
    }
  }
  const togo = next ? next.s - u.s : 0;
  const nextText = next ? distanceText(togo) : '';
  if (nextText !== T.nextText) { T.nextText = nextText; T.nextLeft.textContent = next ? 'in ' + nextText : ''; }
  // a and b always name the next sight; c only while it is near.
  const show = !!next && !u.arrived && (T.look !== 'c' || togo <= NEAR_M);
  if (show !== T.near) { T.near = show; T.nextTag.classList.toggle('none', !show); }
  if (T.look === 'c' && show) {
    const bar = Math.round((1 - togo / NEAR_M) * 50) / 50;
    if (bar !== T.bar) { T.bar = bar; T.barFill.style.transform = `scaleX(${Math.max(0.02, bar)})`; }
  }
  const text = u.arrived ? 'here' : distanceText(Math.max(0, T.total - u.s));
  if (text !== T.text) {
    T.text = text;
    T.left.textContent = text;
    T.el.setAttribute('aria-label', u.arrived ? 'arrived at ' + T.name.textContent
      : T.name.textContent + ', ' + text + ' to go' + (next ? ', next ' + next.name : ''));
  }
  if (u.arrived && !T.arrived) { T.arrived = true; T.el.classList.add('arrived'); }
}

// --------------------------------------------------------------- pictograms

/** What kind of place, by the colour of its disc: getting about (blue), old
 *  buildings and the town's own (plum), shops and fun (orange), the
 *  emergency services (red), the countryside (green), the A.R.C. and the
 *  vet's (teal), anything else (slate). */
const GLYPH_COLOUR = {
  station: '#2d6cb5', 'rail-bridge': '#2d6cb5', 'over-rail': '#2d6cb5', petrol: '#2d6cb5', 'car-wash': '#2d6cb5',
  harbour: '#2d6cb5', junction: '#55606e', mast: '#55606e',
  church: '#7d3a5e', clock: '#7d3a5e', 'poppy-clock': '#7d3a5e', tower: '#7d3a5e', hall: '#7d3a5e', school: '#7d3a5e',
  shop: '#c4672a', chippy: '#c4672a', play: '#c4672a', 'beach-huts': '#c4672a', caravans: '#c4672a',
  'fire-station': '#c23a2c',
  park: '#3c8040', wood: '#3c8040', wild: '#3c8040', golf: '#3c8040', farm: '#3c8040', horses: '#3c8040', glasshouse: '#3c8040',
  home: '#1f8077', vet: '#1f8077', finish: '#1d2128',
};

const GLYPH_CACHE = new Map();
/** A kind's pictogram on its disc, as an image URL, painted once at 64 px. */
function glyphURL(kind) {
  if (!GLYPH_CACHE.has(kind)) {
    const N = 64, k = N / 24;
    const fg = document.createElement('canvas');
    fg.width = fg.height = N;
    const f = fg.getContext('2d');
    // The pictogram in a 24 box, shrunk into the disc's middle.
    f.translate(N / 2, N / 2); f.scale(k * 0.66, k * 0.66); f.translate(-12, -12);
    f.fillStyle = f.strokeStyle = '#fff';
    f.lineJoin = 'round'; f.lineCap = 'round'; f.lineWidth = 2.4;
    paintGlyph(f, kind);
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    g.fillStyle = GLYPH_COLOUR[kind] ?? '#55606e';
    g.beginPath(); g.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2); g.fill();
    g.drawImage(fg, 0, 0);
    GLYPH_CACHE.set(kind, c.toDataURL());
  }
  return GLYPH_CACHE.get(kind);
}

/** Each kind as one flat white shape in a 24 x 24 box, bold enough to read
 *  at 18 px: the pictograms of a map's key, not a picture of the place. A
 *  hole is cut with `cut`. */
function paintGlyph(g, kind) {
  const P = (...pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };
  const R = (x, y, w, h, r = 0.6) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  const C = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const L = (...pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
  const cut = fn => { g.save(); g.globalCompositeOperation = 'destination-out'; fn(); g.restore(); };
  switch (kind) {
    case 'church':
      R(3, 12, 10, 9); P(2, 12.5, 8, 7.5, 14, 12.5); R(13, 8, 7, 13); P(12.5, 8.5, 16.5, 1.5, 20.5, 8.5);
      cut(() => { g.beginPath(); g.moveTo(15, 21); g.lineTo(15, 16.5); g.arc(16.5, 16.5, 1.5, Math.PI, 0); g.lineTo(18, 21); g.fill(); });
      break;
    case 'clock': case 'poppy-clock':
      R(7, 3, 10, 18, 1); P(6, 4, 12, 0, 18, 4);
      cut(() => C(12, 10, 3.6));
      if (kind === 'poppy-clock') { C(12, 10, 2.2); } else { g.lineWidth = 1.4; L(12, 10, 12, 7.8); L(12, 10, 13.8, 10.8); }
      break;
    case 'station':
      R(6, 2.5, 12, 15, 3);
      cut(() => { R(8, 4.8, 8, 5.2, 1); C(9, 14, 1.3); C(15, 14, 1.3); });
      g.lineWidth = 2.2; L(8.5, 18, 6.5, 21.5); L(15.5, 18, 17.5, 21.5);
      break;
    case 'rail-bridge': case 'over-rail':
      g.beginPath(); g.moveTo(2, 9); g.lineTo(22, 9); g.lineTo(22, 21); g.lineTo(18, 21);
      g.arc(12, 21, 6, 0, Math.PI, true); g.lineTo(2, 21); g.closePath(); g.fill();
      g.lineWidth = 1.6; L(2, 6, 22, 6);
      for (let x = 4; x <= 20; x += 4) L(x, 3.8, x, 6);
      break;
    case 'beach-huts':
      for (const x of [1.5, 9, 16.5]) { R(x, 11, 6, 10, 0.3); P(x - 0.6, 11.4, x + 3, 7, x + 6.6, 11.4); }
      break;
    case 'petrol':
      R(5, 3, 10, 18, 1.5);
      cut(() => R(7, 5.5, 6, 5, 0.6));
      g.lineWidth = 2; g.beginPath(); g.moveTo(15, 9); g.lineTo(18, 9); g.lineTo(18, 17); g.quadraticCurveTo(18, 19, 20, 19); g.stroke();
      break;
    case 'car-wash':
      R(3, 13, 18, 5.5, 2); P(6, 13.2, 8.5, 9, 15.5, 9, 18, 13.2); C(7.5, 19, 2); C(16.5, 19, 2);
      for (const x of [6, 12, 18]) { g.beginPath(); g.moveTo(x, 1.5); g.quadraticCurveTo(x + 2, 5, x, 6.3); g.quadraticCurveTo(x - 2, 5, x, 1.5); g.fill(); }
      break;
    case 'chippy':
      g.beginPath(); g.ellipse(10.5, 12, 7.5, 4.6, 0, 0, Math.PI * 2); g.fill();
      P(16, 12, 22, 7, 22, 17);
      cut(() => C(6.5, 11, 1.1));
      break;
    case 'shop':
      R(4, 11, 16, 10, 0.4);
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(3 + i * 4.5, 7); g.lineTo(7.5 + i * 4.5, 7); g.lineTo(7.5 + i * 4.5, 10); g.arc(5.25 + i * 4.5, 10, 2.25, 0, Math.PI); g.fill(); }
      R(3, 5, 18, 2.6, 0.6);
      cut(() => R(10, 15, 4, 6, 0.4));
      break;
    case 'tower':
      R(7, 6, 10, 15, 0.4);
      for (const x of [7, 10.75, 14.5]) R(x, 3, 2.5, 3.6, 0.2);
      cut(() => { g.beginPath(); g.moveTo(10.5, 21); g.lineTo(10.5, 16.5); g.arc(12, 16.5, 1.5, Math.PI, 0); g.lineTo(13.5, 21); g.fill(); R(11, 9, 2, 3.2, 1); });
      break;
    case 'play':
      g.lineWidth = 2.2; L(3, 21, 7, 4, 11, 21); L(13, 21, 17, 4, 21, 21); L(5, 4, 19, 4);
      g.lineWidth = 1.3; L(12, 4, 12, 14);
      R(9.5, 14, 5, 2, 0.6);
      break;
    case 'caravans':
      R(2, 6, 16, 11, 3.5);
      cut(() => R(5, 8.5, 5, 3.5, 0.6));
      C(8.5, 18, 2.4); g.lineWidth = 2; L(18, 15, 22, 16.5);
      break;
    case 'school':
      R(3, 11, 18, 10, 0.4); P(1.5, 11.5, 12, 4, 22.5, 11.5);
      cut(() => { C(12, 10.4, 1.7); R(10.3, 15.5, 3.4, 5.5, 0.4); R(5, 13.5, 3, 3, 0.3); R(16, 13.5, 3, 3, 0.3); });
      break;
    case 'fire-station':
      g.beginPath(); g.moveTo(12, 1.5);
      g.bezierCurveTo(14, 6, 19, 8, 19, 14); g.bezierCurveTo(19, 18.5, 15.8, 22, 12, 22);
      g.bezierCurveTo(8.2, 22, 5, 18.5, 5, 14.5); g.bezierCurveTo(5, 11, 7, 9.5, 8, 7.5);
      g.bezierCurveTo(8.5, 10, 9.5, 11, 10.5, 11.5); g.bezierCurveTo(10.5, 8, 11, 4.5, 12, 1.5); g.fill();
      cut(() => { g.beginPath(); g.moveTo(12, 12); g.bezierCurveTo(13, 15, 15, 16, 15, 18); g.bezierCurveTo(15, 19.8, 13.6, 20.5, 12, 20.5); g.bezierCurveTo(10.4, 20.5, 9, 19.8, 9, 18); g.bezierCurveTo(9, 16, 11, 15, 12, 12); g.fill(); });
      break;
    case 'golf':
      g.lineWidth = 1.8; L(9, 21, 9, 2.5); P(9.6, 2.5, 19, 6, 9.6, 9.5);
      g.beginPath(); g.ellipse(9, 21, 6, 1.6, 0, 0, Math.PI * 2); g.fill();
      C(17, 18.5, 1.8);
      break;
    case 'farm':
      P(3, 21, 3, 11, 6.5, 6, 12, 3.5, 17.5, 6, 21, 11, 21, 21);
      cut(() => { R(8.5, 13, 7, 8, 0.2); });
      g.lineWidth = 1.4; L(8.5, 13, 15.5, 21); L(15.5, 13, 8.5, 21); g.strokeRect(8.5, 13, 7, 8);
      break;
    case 'hall':
      P(2, 8, 12, 2.5, 22, 8); R(2.5, 8, 19, 2, 0.2); R(2, 19, 20, 2.5, 0.2);
      for (const x of [4, 8.6, 13.2, 17.8]) R(x, 11, 2.2, 7.5, 0.2);
      break;
    case 'junction':
      g.lineWidth = 4; g.lineCap = 'butt'; L(12, 2, 12, 22); L(2, 12, 22, 12);
      break;
    case 'horses':
      g.lineWidth = 3.4; g.beginPath(); g.arc(12, 11, 6.5, Math.PI * 0.9, Math.PI * 0.1); g.stroke();
      L(5.6, 12.2, 6.3, 20); L(18.4, 12.2, 17.7, 20);
      break;
    case 'wood': case 'wild':
      P(8, 2, 14, 15, 2, 15); R(7, 15, 2, 6, 0.3);
      P(17, 6, 22, 17, 12, 17); R(16, 17, 2, 4, 0.3);
      break;
    case 'park':
      C(12, 9, 7); R(10.8, 14, 2.4, 8, 0.4);
      break;
    case 'glasshouse':
      P(2, 11, 12, 3, 22, 11); R(2, 11, 20, 10, 0.3);
      cut(() => { for (const x of [4, 9, 14]) R(x, 13, 3.4, 6.5, 0.2); R(19, 13, 1.4, 6.5, 0.2); });
      break;
    case 'mast':
      g.lineWidth = 1.8; L(6.5, 21.5, 12, 4, 17.5, 21.5); L(8.5, 15.5, 15.5, 15.5); L(10, 10, 14, 10); L(8.5, 15.5, 14, 10); L(15.5, 15.5, 10, 10);
      C(12, 3.5, 2);
      break;
    case 'home':
      R(4, 11, 16, 10, 0.4); P(2, 11.5, 12, 3, 22, 11.5);
      cut(() => { g.beginPath(); g.ellipse(12, 17.5, 2.6, 2.1, 0, 0, Math.PI * 2); g.fill();
        for (const [x, y] of [[8.9, 14.4], [11, 13], [13, 13], [15.1, 14.4]]) C(x, y, 1); });
      break;
    case 'vet':
      R(9, 3, 6, 18, 1); R(3, 9, 18, 6, 1);
      break;
    case 'harbour':
      g.lineWidth = 2.4; L(12, 7, 12, 21); L(8, 10, 16, 10);
      g.beginPath(); g.arc(12, 13, 8, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
      g.beginPath(); g.arc(12, 4.6, 2.3, 0, Math.PI * 2); g.stroke();
      break;
    case 'finish':
      // A chequered flag: where she is going.
      g.lineWidth = 1.8; L(5, 22, 5, 2.5);
      g.save(); g.beginPath(); g.rect(6, 3, 14, 10); g.clip();
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) g.fillRect(6 + i * 3.5, 3 + j * 3.34, 3.5, 3.34);
      g.restore();
      g.lineWidth = 1; g.strokeRect(6, 3, 14, 10);
      break;
    default:
      C(12, 12, 4.5);
  }
}

// ------------------------------------------------------------- the signs

const SIGN_H = 1.6;   // metres: how tall the post is, for its shadow

/** The fingerposts, in world space: each upright to the road at its place,
 *  so it reads the right way up as she drives past, and sized in screen
 *  pixels, a little smaller when the camera is pulled back. */
export function drawSigns(ctx, T, view) {
  if (!T.signs.length) return;
  // On a big screen held sideways the signs grow with it, as the strip does.
  const big = Math.max(1, Math.min(1.4, view.radius * view.ppm / 930));
  const k = Math.max(0.6, Math.min(1, 0.55 + 0.45 * view.ppm / 22)) * big;
  const px = k / view.ppm;
  for (const g of T.signs) {
    if (Math.hypot(g.x - view.cx, g.y - view.cy) > view.radius + 20) continue;
    // Its boards, the lowest first, one above the other on the post (two
    // when a sight next door shares it). Each stands over the verge: its
    // point reaches back towards the road when the sight is across it.
    const boards = [];
    let top = 12 * px;
    for (const [B, side] of [[g.board2, g.also?.side], [g.board, g.side]]) {
      if (!B) continue;
      const bw = B.w * px, bh = B.h * px;
      boards.push({ B, x: side > 0 ? -bw + 9 * px : -bw + 5 * px, y: -top - bh, w: bw, h: bh });
      top += bh + 3 * px;
    }
    const post = 12 * px + (boards.length > 1 ? boards[0].h + 3 * px : 0);
    const x0 = Math.min(...boards.map(b => b.x)), x1 = Math.max(...boards.map(b => b.x + b.w));
    const yTop = boards[boards.length - 1].y;
    ctx.save();
    ctx.translate(g.x + view.sun.x * SIGN_H, g.y + view.sun.y * SIGN_H);
    ctx.rotate(g.h + Math.PI / 2);
    ctx.fillStyle = 'rgba(40,46,38,.24)';
    ctx.beginPath(); ctx.roundRect(x0, yTop, x1 - x0, -yTop, 5 * px); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.h + Math.PI / 2);
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.roundRect(-2.2 * px, -post - 2 * px, 4.4 * px, post + 3.5 * px, 1.5 * px); ctx.fill();
    ctx.fillStyle = '#8a6440';
    ctx.fillRect(-1.1 * px, -post - 1 * px, 2.2 * px, post + 1.6 * px);
    for (const b of boards) ctx.drawImage(b.B.canvas, b.x, b.y, b.w, b.h);
    ctx.restore();
  }
}

/** One fingerpost board, painted once: the sight's icon over its name on
 *  cream, pointed on the side the sight is on. Narrow, so it fits on the
 *  verge between the kerb and the trip strip. */
function signBoard(kind, name, side) {
  const S = 2, ICON = 22, PAD = 5, TIP = 8, WRAP = 66, LINE = 12;
  const FONT = '800 10.5px Nunito, system-ui, -apple-system, sans-serif';
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = FONT;
  const lines = [];
  for (const word of name.split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && g.measureText(lines[last] + ' ' + word).width <= WRAP) lines[last] += ' ' + word;
    else lines.push(word);
  }
  const tw = Math.max(ICON, ...lines.map(l => g.measureText(l).width));
  const bw = Math.ceil(tw + 2 * PAD), w = bw + TIP, h = Math.ceil(PAD + ICON + 2 + lines.length * LINE + 4);
  c.width = w * S; c.height = h * S;
  g.scale(S, S);
  // The board from x0 to x1, and its point beyond it towards the sight.
  const x0 = side > 0 ? 1 : TIP, x1 = x0 + bw - 1, r = 4, tipY = Math.min(h / 2, PAD + ICON / 2 + 4);
  g.beginPath();
  if (side > 0) {
    g.moveTo(x0 + r, 1); g.lineTo(x1, 1); g.lineTo(x1, tipY - 8); g.lineTo(w - 1, tipY); g.lineTo(x1, tipY + 8);
    g.lineTo(x1, h - 1); g.lineTo(x0 + r, h - 1);
    g.arcTo(x0, h - 1, x0, h - 1 - r, r); g.lineTo(x0, 1 + r); g.arcTo(x0, 1, x0 + r, 1, r);
  } else {
    g.moveTo(x0, 1); g.lineTo(x1 - r, 1); g.arcTo(x1, 1, x1, 1 + r, r); g.lineTo(x1, h - 1 - r);
    g.arcTo(x1, h - 1, x1 - r, h - 1, r); g.lineTo(x0, h - 1); g.lineTo(x0, tipY + 8); g.lineTo(1, tipY);
    g.lineTo(x0, tipY - 8);
  }
  g.closePath();
  g.fillStyle = CREAM; g.fill();
  // A painted edge just inside, as a fingerpost's.
  g.save(); g.clip();
  g.strokeStyle = 'rgba(140,48,68,.4)'; g.lineWidth = 3.4; g.stroke();
  g.restore();
  g.lineWidth = 1.5; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
  const mid = x0 + bw / 2;
  g.save(); g.translate(mid - ICON / 2, PAD); g.scale(ICON / 24, ICON / 24); paintIcon(g, kind); g.restore();
  g.fillStyle = '#3a3226'; g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, k) => g.fillText(l, mid, PAD + ICON + 2 + LINE * (k + 0.5)));
  return { canvas: c, w, h };
}

// ------------------------------------------------------------------ icons

const ICON_CACHE = new Map();
/** A kind's icon as an image URL for the strip, painted once at 4x. */
function iconURL(kind) {
  const key = kind;
  if (!ICON_CACHE.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    g.scale(4, 4);
    paintIcon(g, kind);
    ICON_CACHE.set(key, c.toDataURL());
  }
  return ICON_CACHE.get(key);
}

/** Each kind, painted in a 24 x 24 box in the world's style: soft fills and
 *  a thin dark outline, shapes a child names on sight. */
export function paintIcon(g, kind) {
  g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 1.3; g.strokeStyle = INK;
  const P = (pts, fill) => {
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath(); g.fillStyle = fill; g.fill(); g.stroke();
  };
  const R = (x, y, w, h, fill, r = 0.8) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); g.stroke(); };
  const C = (x, y, r, fill) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.stroke(); };
  const L = (...pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
  const ground = (fill = '#a6cf6c') => { g.beginPath(); g.ellipse(12, 21.2, 10.5, 2.3, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
  const tree = (x, y, r, fill = '#7aa65a') => { R(x - 0.9, y, 1.8, 21 - y, '#7a5a3a', 0.5); C(x, y - r * 0.2, r, fill); };
  const pine = (x, y, w, h, fill) => { R(x - 0.8, y + h - 1, 1.6, 21 - (y + h - 1), '#7a5a3a', 0.4); P([x, y, x + w / 2, y + h, x - w / 2, y + h], fill); };
  const arch = (x, w, top, fill) => {   // a doorway with a round top, standing on the ground line
    g.beginPath(); g.moveTo(x, 21); g.lineTo(x, top + w / 2); g.arc(x + w / 2, top + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, 21);
    g.fillStyle = fill; g.fill(); g.stroke();
  };
  switch (kind) {
    case 'church':
      ground();
      R(3.5, 13, 9, 8, '#efe3c8'); P([2.8, 13.2, 8, 9.5, 13, 13.2], '#b5523b');
      R(12, 8, 6.5, 13, '#e8dcc0'); P([11.6, 8.2, 15.25, 1.2, 18.9, 8.2], '#6f7f8f');
      arch(13.7, 3.1, 16, '#6b4a2b');
      C(15.25, 11.6, 1.2, '#cfe5ea');
      break;
    case 'clock':
      ground('#d9d2bd');
      R(8, 7, 8, 14, '#d9c7a4'); P([7, 7.3, 12, 2, 17, 7.3], '#6f7f8f');
      C(12, 11.2, 3.1, CREAM); L(12, 11.2, 12, 9); L(12, 11.2, 13.6, 11.9);
      arch(10.4, 3.2, 16, '#6b4a2b');
      break;
    case 'station':
      L(1.5, 21.5, 22.5, 21.5);
      R(2.5, 9.5, 12.5, 8.5, '#c4562f', 1.5); R(13.5, 5.5, 7, 12.5, '#8c3044', 1);
      R(15, 7.2, 4, 3.6, '#cfe5ea', 0.6); R(4.5, 5.5, 3, 4.2, '#4a4040', 0.6);
      C(6.8, 19, 2.3, '#3a3226'); C(16.2, 19, 2.3, '#3a3226');
      g.fillStyle = '#f2d36b'; g.beginPath(); g.arc(2.6, 13.5, 1.1, 0, Math.PI * 2); g.fill();
      break;
    case 'rail-bridge': case 'over-rail':
      g.beginPath(); g.moveTo(2, 9); g.lineTo(22, 9); g.lineTo(22, 21); g.lineTo(18, 21);
      g.arc(12, 21, 6, 0, Math.PI, true); g.lineTo(2, 21); g.closePath();
      g.fillStyle = '#b36a4e'; g.fill(); g.stroke();
      g.strokeStyle = 'rgba(51,36,26,.35)'; L(2.5, 13, 5.5, 13); L(18.5, 13, 21.5, 13); L(3.5, 17, 5.5, 17); L(18.5, 17, 20.5, 17);
      g.strokeStyle = INK;
      // The railway along its top: two rails on their sleepers.
      g.fillStyle = '#7a5a3a';
      for (let x = 3; x <= 21; x += 3) g.fillRect(x - 0.6, 4.6, 1.2, 4);
      L(2, 5.6, 22, 5.6); L(2, 7.6, 22, 7.6);
      break;
    case 'beach-huts':
      g.beginPath(); g.ellipse(12, 21.4, 11, 2.2, 0, 0, Math.PI * 2); g.fillStyle = '#ead8a6'; g.fill();
      for (const [x, col] of [[2, '#e86f5a'], [9, '#f2c94c'], [16, '#5aa9e6']]) {
        R(x, 11, 6, 10, col, 0.4); P([x - 0.6, 11.2, x + 3, 7.5, x + 6.6, 11.2], CREAM);
        g.fillStyle = 'rgba(255,250,240,.7)'; g.fillRect(x + 1.1, 12, 1.1, 8.5); g.fillRect(x + 3.8, 12, 1.1, 8.5);
        R(x + 2, 15.5, 2, 5.5, 'rgba(51,36,26,.18)', 0.3);
      }
      break;
    case 'petrol':
      ground('#cfc6b0');
      R(6.5, 5, 9, 16, '#3f8f5a', 1.2); R(8.3, 7, 5.4, 4.4, CREAM, 0.6);
      R(5.5, 19.5, 11, 2, '#6c6f6b', 0.4);
      g.beginPath(); g.moveTo(15.5, 12); g.quadraticCurveTo(20, 12, 19.5, 17); g.stroke();
      R(18, 7.5, 2.6, 4.5, '#3a3226', 0.6); L(19.3, 12, 19.3, 9.5);
      break;
    case 'car-wash': {
      ground('#cfc6b0');
      // The wash's arch with its blue brush and bubbles...
      R(1.5, 7, 2.4, 14, '#5aa9e6', 0.6); R(10.6, 7, 2.4, 14, '#5aa9e6', 0.6); R(1, 6, 12.5, 3, '#5aa9e6', 1);
      R(5, 10.5, 4.5, 9.5, '#8fc3ec', 2);
      g.strokeStyle = 'rgba(51,36,26,.45)'; L(5.6, 13, 8.9, 13); L(5.6, 15.5, 8.9, 15.5); L(5.6, 18, 8.9, 18);
      g.strokeStyle = INK;
      C(3.5, 3.6, 1.4, '#e8f4fb'); C(6.8, 2.6, 1.1, '#e8f4fb'); C(9.6, 3.8, 1.5, '#e8f4fb');
      // ...and Steve, the tube man, waving her in with his right arm: blue
      // dungarees, red shirt, blue cap.
      const tube = (w, col, pts) => { g.lineWidth = w; g.strokeStyle = col; g.beginPath(); g.moveTo(pts[0], pts[1]); g.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); g.stroke(); };
      for (const [w, inner] of [[3.6, false], [2.2, true]]) {
        tube(inner ? w - 0.8 : w, inner ? '#d13b2f' : INK, [19.5, 11.5, 22, 9.5, 23, 5.2]);    // the right arm, up
        tube(inner ? w - 0.8 : w, inner ? '#d13b2f' : INK, [18.4, 12.2, 16.6, 13.5, 15.8, 15.6]); // the left, low
        tube(w + 0.6, inner ? '#3a6fb3' : INK, [18.5, 21, 20, 17.5, 18.8, 14.5]);              // dungarees
        tube(w + 0.6, inner ? '#d13b2f' : INK, [18.8, 14.8, 17.8, 12, 19, 9.6]);               // shirt
      }
      g.lineWidth = 1; g.strokeStyle = INK;
      C(19.2, 7.9, 1.8, '#f4d2a8');
      R(17.4, 5.4, 3.6, 1.6, '#3a6fb3', 0.6);
      g.lineWidth = 1.3;
      break;
    }
    case 'poppy-clock':
      // The clock memorial on the Square: stone, its face one big red poppy
      // with the hands meeting at the dark heart, and small poppies carved
      // below.
      ground('#d9d2bd');
      R(4.5, 19, 15, 2.4, '#bdb6a6', 0.4); R(6.5, 16.8, 11, 2.4, '#c9c2b2', 0.4);
      R(7, 5, 10, 12, '#d8d1c1', 0.5); P([6.4, 5.3, 12, 1.2, 17.6, 5.3], '#b9b2a2');
      g.lineWidth = 0.9;
      for (const [dx, dy] of [[0, -2.2], [2.2, 0], [0, 2.2], [-2.2, 0]]) C(12 + dx, 10 + dy, 2.5, '#d42a2a');
      g.fillStyle = '#d42a2a'; g.beginPath(); g.arc(12, 10, 2.3, 0, Math.PI * 2); g.fill();
      C(12, 10, 1.2, '#2b1d1a');
      g.lineWidth = 1.1; g.strokeStyle = CREAM; L(12, 10, 12, 6.4); L(12, 10, 14.3, 11.3);
      g.strokeStyle = INK; g.lineWidth = 0.8;
      for (const x of [9.4, 14.6]) { C(x, 14.7, 0.95, '#d42a2a'); g.fillStyle = '#2b1d1a'; g.beginPath(); g.arc(x, 14.7, 0.35, 0, Math.PI * 2); g.fill(); }
      g.lineWidth = 1.3;
      break;
    case 'chippy':
      // Fish and chips: a battered fish beside a paper cone of chips.
      ground();
      for (const [x, top] of [[14.2, 6], [16.2, 4.5], [18.2, 5.5], [20.2, 7]]) R(x - 0.8, top, 1.6, 8, '#f2c94c', 0.4);
      P([12.8, 10.5, 22.6, 10.5, 20, 21, 15.4, 21], CREAM);
      g.save(); g.clip();
      g.fillStyle = '#d13b2f'; for (const x of [14.5, 17.3, 20.1]) g.fillRect(x, 10, 1.3, 11);
      g.restore();
      P([12.8, 10.5, 22.6, 10.5, 20, 21, 15.4, 21], 'rgba(0,0,0,0)');
      P([4.2, 14, 1, 10.6, 1, 17.4], '#d99a45');
      g.beginPath(); g.ellipse(9.2, 14, 6, 3.4, -0.12, 0, Math.PI * 2); g.fillStyle = '#e3ad55'; g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,240,200,.7)'; for (const [x, y] of [[7, 13], [9.5, 12.4], [11.5, 14.6], [8, 15.4]]) { g.beginPath(); g.arc(x, y, 0.7, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = INK; g.beginPath(); g.arc(13.2, 13.1, 0.7, 0, Math.PI * 2); g.fill();
      break;
    case 'shop':
      ground();
      R(4, 11, 16, 10, '#efe3c8'); P([2.5, 11.5, 12, 4.5, 21.5, 11.5], '#b5523b');
      for (let i = 0; i < 4; i++) {
        g.beginPath(); g.moveTo(4 + i * 4, 11.5); g.lineTo(8 + i * 4, 11.5); g.arc(6 + i * 4, 11.5, 2, 0, Math.PI);
        g.fillStyle = i % 2 ? CREAM : '#c4562f'; g.fill(); g.stroke();
      }
      R(10, 15.5, 4, 5.5, '#6b4a2b', 0.5); C(6.8, 17.5, 1.5, '#d13b2f'); C(17.2, 17.5, 1.5, '#7cc36a');
      break;
    case 'tower':
      ground();
      R(8.5, 6.5, 7, 14.5, '#e6dccb', 0.5);
      for (let x = 8.5; x < 15.5; x += 2.4) R(x, 3.8, 1.6, 2.9, '#e6dccb', 0.2);
      R(10.8, 9, 2.4, 3.6, '#6b4a2b', 1.2);
      arch(10.6, 2.8, 16.2, '#6b4a2b');
      break;
    case 'play':
      ground();
      R(3, 12, 18, 9, '#e86f5a', 2); R(2.5, 7, 4.5, 6, '#f2c94c', 2); R(17, 7, 4.5, 6, '#f2c94c', 2);
      R(9, 9, 6, 4, '#5aa9e6', 2);
      arch(9, 6, 15, '#5aa9e6');
      break;
    case 'caravans':
      ground();
      R(2.5, 7.5, 16, 10.5, CREAM, 3); g.fillStyle = '#5aa9e6'; g.fillRect(3.2, 13, 14.6, 1.6);
      R(5, 9.5, 4.5, 3, '#cfe5ea', 0.6); R(12, 9.5, 3.5, 6.5, '#e8dcc0', 0.5);
      L(18.5, 16, 22, 17.5); C(9, 18.8, 2.2, '#3a3226');
      break;
    case 'school':
      ground();
      R(3, 11, 18, 10, '#d99a6c', 0.5); P([2, 11.3, 12, 4.5, 22, 11.3], '#8c3044');
      C(12, 8.6, 1.6, CREAM);
      R(10.3, 15.5, 3.4, 5.5, '#6b4a2b', 0.5); R(4.7, 13.5, 3.5, 3, '#cfe5ea', 0.4); R(15.8, 13.5, 3.5, 3, '#cfe5ea', 0.4);
      break;
    case 'fire-station':
      L(1.5, 21.5, 22.5, 21.5);
      R(1.5, 9.5, 21, 8.5, '#d13b2f', 1.5); R(15, 6.5, 7, 4, '#d13b2f', 1); R(16, 7.5, 5, 2.6, '#cfe5ea', 0.5);
      g.lineWidth = 1; L(2.5, 7.5, 14, 7.5); L(2.5, 5.5, 14, 5.5);
      for (let x = 4; x < 14; x += 2.5) L(x, 5.5, x, 7.5);
      g.lineWidth = 1.3; C(6, 19, 2.3, '#3a3226'); C(18, 19, 2.3, '#3a3226');
      g.fillStyle = '#5aa9e6'; g.beginPath(); g.arc(18.5, 5.8, 1.2, 0, Math.PI * 2); g.fill();
      break;
    case 'golf':
      g.beginPath(); g.ellipse(12, 19.5, 10, 3.6, 0, 0, Math.PI * 2); g.fillStyle = '#7cc36a'; g.fill(); g.stroke();
      g.beginPath(); g.ellipse(12, 19.5, 1.8, 0.8, 0, 0, Math.PI * 2); g.fillStyle = '#3a3226'; g.fill();
      L(12, 19.3, 12, 3); P([12, 3, 19, 5.6, 12, 8.4], '#d13b2f');
      C(17, 18.5, 1, CREAM);
      break;
    case 'farm':
      ground();
      P([3.5, 12, 7, 7.5, 17, 7.5, 20.5, 12, 20.5, 21, 3.5, 21], '#b5523b');
      P([2.5, 12.3, 7, 6.6, 17, 6.6, 21.5, 12.3], '#7a3a2b');
      R(8.5, 14, 7, 7, CREAM, 0.3); L(8.5, 14, 15.5, 21); L(15.5, 14, 8.5, 21);
      break;
    case 'hall':
      ground();
      R(3.5, 11, 17, 10, '#efe3c8', 0.5); P([2.5, 11.3, 12, 4, 21.5, 11.3], '#6f7f8f');
      C(12, 8.7, 1.5, '#cfe5ea'); R(10, 15, 4, 6, '#3f6e8c', 0.5);
      g.fillStyle = '#e86f5a';
      for (const x of [5.5, 8, 16, 18.5]) { g.beginPath(); g.moveTo(x - 1, 12.2); g.lineTo(x + 1, 12.2); g.lineTo(x, 14); g.fill(); }
      break;
    case 'junction':
      ground();
      R(11, 4, 2.2, 17, CREAM, 0.6);
      P([3, 6, 10.5, 6, 12.2, 7.6, 10.5, 9.2, 3, 9.2], CREAM);
      P([21, 11, 13.6, 11, 11.9, 12.6, 13.6, 14.2, 21, 14.2], CREAM);
      C(12.1, 3.6, 1.2, '#d13b2f');
      break;
    case 'horses': {
      ground();
      R(2, 16, 20, 1.6, '#c9a26b', 0.4); R(4, 13.5, 1.8, 7.5, '#c9a26b', 0.4); R(18, 13.5, 1.8, 7.5, '#c9a26b', 0.4);
      // A horseshoe hung over the paddock rail.
      const shoe = () => { g.beginPath(); g.arc(12, 9, 5, Math.PI * 0.95, Math.PI * 0.05); g.moveTo(7.1, 9.8); g.lineTo(7.4, 13.5); g.moveTo(16.9, 9.8); g.lineTo(16.6, 13.5); g.stroke(); };
      g.lineWidth = 3.4; g.strokeStyle = INK; shoe();
      g.lineWidth = 1.9; g.strokeStyle = '#b8bec4'; shoe();
      g.lineWidth = 1.3; g.strokeStyle = INK;
      break;
    }
    case 'wood': case 'wild':
      ground();
      pine(7.5, 4, 9, 13, '#5f8f4a'); pine(16.5, 6.5, 8, 11.5, '#7aa65a'); pine(12, 9, 7, 10, '#6b9c52');
      break;
    case 'park':
      ground();
      tree(9, 9.5, 5.6); tree(17.5, 12.5, 3.6, '#8fbb5c');
      R(13, 18.2, 6, 1.4, '#a87c4f', 0.3);
      break;
    case 'glasshouse':
      ground();
      R(2.5, 11, 19, 10, '#dcedf2', 0.3);
      for (let x = 2.5; x < 21; x += 4.75) P([x, 11, x + 2.375, 7, x + 4.75, 11], '#cfe5ea');
      g.strokeStyle = 'rgba(51,36,26,.45)';
      for (let x = 7.25; x < 21; x += 4.75) L(x, 11, x, 21);
      L(2.5, 16, 21.5, 16);
      g.strokeStyle = INK; g.fillStyle = '#7cc36a';
      g.fillRect(4, 18, 3, 2.5); g.fillRect(9, 18, 3, 2.5); g.fillRect(14, 18, 3, 2.5);
      break;
    case 'mast':
      ground();
      L(8, 21, 12, 3, 16, 21); L(9.3, 15, 14.7, 15); L(10.5, 9.5, 13.5, 9.5); L(9.3, 15, 13.5, 9.5); L(14.7, 15, 10.5, 9.5);
      L(8, 21, 14.7, 15); L(16, 21, 9.3, 15);
      C(12, 3, 1.4, '#d13b2f');
      break;
    case 'home':
      ground();
      R(4, 11, 16, 10, '#efe3c8', 0.5); P([2.5, 11.3, 12, 4, 21.5, 11.3], '#3f6e8c');
      // A paw on the wall: it is A.R.C.
      g.fillStyle = '#8c3044';
      g.beginPath(); g.ellipse(12, 17.3, 2.4, 2, 0, 0, Math.PI * 2); g.fill();
      for (const [x, y] of [[9.2, 14.4], [11, 13.1], [13, 13.1], [14.8, 14.4]]) { g.beginPath(); g.arc(x, y, 0.95, 0, Math.PI * 2); g.fill(); }
      break;
    case 'vet':
      ground();
      R(3.5, 9, 17, 12, '#f4f1ea', 1);
      g.fillStyle = '#4b8b3b'; g.fillRect(10.4, 11, 3.2, 8.4); g.fillRect(7.8, 13.6, 8.4, 3.2);
      R(2.5, 7, 19, 2.6, '#4b8b3b', 0.8);
      break;
    case 'harbour':
      g.beginPath(); g.ellipse(12, 20.5, 11, 2.8, 0, 0, Math.PI * 2); g.fillStyle = '#9fcdd5'; g.fill();
      P([3, 15, 21, 15, 18, 19.5, 6, 19.5], '#c4562f');
      L(12, 15, 12, 3); P([12.8, 4, 19, 13.5, 12.8, 13.5], CREAM); P([11.2, 6, 11.2, 13.5, 6, 13.5], '#f2c94c');
      break;
    default:
      ground(); C(12, 13, 5, '#e8dcc0');
  }
}
