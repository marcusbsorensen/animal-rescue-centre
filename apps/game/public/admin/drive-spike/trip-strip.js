// trip-strip.js — how far to the destination, and the sights on the way.
//
// Lily, 2026-10-12, first: "we need a countdown or indicator to show us how
// close we are to our destination". Then, playing it: "the trip strip needs
// to be vertical instead of horizontal, and it needs some milestones / sights
// from along the way as landmarks for the kids to orient themselves on the
// journey". Marcus, 2026-10-13: "much too intrusive on the screen and there is
// wasted space on the left hand side ... more translucent, more compact, and a
// little bit less like small children's fairy tale drawings ... this is for
// eight, nine-year-olds" (71A, of three directions).
//
// So the strip is a slim rail of frosted glass flush with the left edge of the
// road view: where she set off at the bottom, the destination's disc at the
// top, and the van's own icon climbing it as she drives, because the van drives
// up the screen and up is onward. On it, at their places along the journey, the
// sights she will pass, each a flat pictogram on a disc coloured by what kind
// of place it is, as a map's key or a sat-nav does: a church, the station, the
// car wash, a farm. They come from the real map (landmarks.json, read from
// OpenStreetMap), so the strip's order is the road's order. Beside the rail
// are two tags: the destination's name with the distance still to go (small,
// for the grown-up), and the next sight's with how far it is. Each sight also
// has a painted fingerpost at the roadside in the world, on her side of the
// road, pointing to the side the sight is on and naming it, so the strip and
// the road match: as the van's icon passes the church's disc, the van passes
// the church's sign, and its disc dims.
//
// The rail is a military strip map (Marcus, 2026-10-14, 80A and 81A): the
// route as one line, read upward the way the van travels. Where she turns, the
// line bends into a small arrow pointing off to the side she turns to, and
// after a very small gap the line carries on straight above it. Where she
// goes round a roundabout, a small ring on the line with the exit arm leaving
// at the angle she actually exits by, as UK roundabout signs draw it (a double
// mini-roundabout as two small rings close together), then a gap and the line
// again. The roundabouts are the map's real ones, from OpenStreetMap
// (roundabouts.json); a loop of roads that looks round is not one (96A). Only
// turns and roundabouts: no stubs for the side roads she passes, and an
// ordinary bend in a road is not a turn (junctions()).
// The tags set one word to a line (Marcus, 2026-10-14), so the longest word
// and not the longest name sets how far they reach towards the right.
//
// Animals wait on the verge on her side, which is where the tags sit. The page
// gives the strip their boxes (u.animals), and any part of it over one goes
// nearly clear until the animal has gone by: she sees it whole, the rail with
// its marks, and the tags.
//
// Contract with drive-spike.html:
//   create(wrap)                 builds the strip in #wrap, returns T
//   load(T)                      fetches landmarks.json and roundabouts.json;
//                                without them there are no sights and no
//                                roundabouts, and the strip still works
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
//   update(T, u)                 u = { s, arrived, animals }. Every frame;
//                                writes only what changed. animals: boxes
//                                {x0, y0, x1, y1} in the canvas's px, one for
//                                each animal on the screen.
//   drawSigns(ctx, T, view)      the fingerposts, under the world transform
//                                (view as scenery.js documents it)
//
// Which sights a drive shows: of those within their reach of the road (the
// data's metres; a tower is seen from further than a school) and not at the
// start or the destination, the best ranked and nearest, at most six and no
// two closer along the road than a ninth of the drive, so their discs never
// touch. A drive with fewer than three looks again a little further out and
// closer together, and then counts the corners where it turns at a junction
// ("Crossroads", "The corner"), which is how a child gives directions in open
// country.

const DATA_URL = '/assets/driving/landmarks.json';
const ROUNDS_URL = '/assets/driving/roundabouts.json';
const MAX_MARKS = 6, MIN_MARKS = 3;
const END_CLEAR_M = 30;          // a sight this near the start or the end is the place itself
const INK = '#33241a';           // the painted world's outline (crossings.js)
const CREAM = '#fffaf0';
const GHOST_PAD = 3, GHOST_OUT = 10;   // px round a part that an animal must reach to ghost it, and clear of to bring it back
const TURN_MIN = 30 * Math.PI / 180;   // a junction is a turn when the route's heading changes by this much or more
const SNAP_M = 20;                     // a real roundabout belongs to the graph node nearest it, if within this (roundabouts.json's snapM says the same)
const SAME_SPOT_M = 1.5;               // graph nodes this near the snapped one are the same spot (her graph splits the A28's junctions by side)
const CORNER_GAP_M = 20;               // junction nodes closer along the route than this are one corner
const SMALL_DISC = 0.75;               // a sight that is not next is drawn at this share of the disc (95A); the next sight's is 1.25 times the disc
const DOUBLE_GAP = 1;                  // px (at a line width of 3) between the two rings of a double mini-roundabout
// A mark may sit a few px off its place on the rail (less than the length of its own arrow) to clear a sight's disc or another mark.
const NUDGES = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
// A roundabout may move further, to stand clear of a sight's disc: the one real roundabout on the map, the mini-roundabout in Birchington's Square, is 30 m from the Poppy Clock, a sight on every drive past it, and a ring under the clock's disc would never be seen.
const ROUND_NUDGES = [0, ...Array.from({ length: 28 }, (_, i) => [i + 1, -(i + 1)]).flat()];
const nudgesOf = j => (j.kind === 'round' ? ROUND_NUDGES : NUDGES);
const TAG_GAP = 6;                     // px between the destination's tag and the next sight's, when they would meet
const SVGNS = 'http://www.w3.org/2000/svg';

// --------------------------------------------------------------------- DOM

// Translucent parts are dark tinted glass, so the white on them reads over
// pale grass and dark tarmac alike.
const CSS = `
#trip { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 1; color: #fff;
  font-weight: 800; --disc: 18px; --van: 12px; --w: 30px; }
#trip.hidden { visibility: hidden; }
#trip .hPanel { position: absolute; inset: 0; border-radius: 0 12px 12px 0; background: rgba(20,24,30,.48);
  -webkit-backdrop-filter: blur(6px) saturate(1.2); backdrop-filter: blur(6px) saturate(1.2);
  box-shadow: inset -1px 0 0 rgba(255,255,255,.14); }
/* The rail is two drawings of the one route, laid over each other: the line
   to come in translucent white, and the same in gold, cut off at the van. */
#trip .hRail { position: absolute; left: 0; width: var(--w); }
#trip .hRail svg { position: absolute; left: 0; top: 0; overflow: visible; }
#trip .rBase { color: #fff; opacity: .5; }
#trip .rDone { color: #f4c04e; }
#trip .tVan { position: absolute; left: 50%; bottom: 0; width: var(--van); margin-left: calc(var(--van) / -2);
  filter: drop-shadow(0 0 1px rgba(0,0,0,.7)) drop-shadow(0 1px 2px rgba(0,0,0,.45)); z-index: 3; }
#trip .hMark, #trip .hDest { position: absolute; left: calc(var(--w) / 2 - var(--disc) / 2);
  width: var(--disc); height: var(--disc); border-radius: 50%; z-index: 2;
  box-shadow: 0 0 0 1.5px #fff, 0 1px 3px rgba(0,0,0,.45); transition: opacity .3s, transform .3s; }
#trip .hMark img, #trip .hDest img { display: block; width: 100%; height: 100%; border-radius: 50%; }
#trip .hMark { transform: scale(var(--small, .75)); }
#trip .hMark.passed { opacity: .45; transform: scale(.7); }
#trip .hMark.next { transform: scale(1.25); box-shadow: 0 0 0 2px #f4c04e, 0 1px 4px rgba(0,0,0,.5); }
/* A tag sets one word to a line and the distance on a line of its own below,
   so it is as wide as its longest word and no wider. */
#trip .hTag { position: absolute; width: max-content; line-height: 1.12; padding: 3px 7px 4px; border-radius: 9px;
  background: rgba(20,24,30,.58); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); transition: opacity .3s; }
#trip .hTxt, #trip .hName { display: block; }
#trip .hName { font-size: 12.5px; }
#trip .hW, #trip .hLeft { display: block; white-space: nowrap; }
#trip .hLeft { margin-top: 1px; font-size: 10.5px; font-weight: 700; opacity: .85; font-variant-numeric: tabular-nums; }
#trip .nTag::before { content: ""; position: absolute; left: -5px; top: var(--car, calc(50% - 5px));
  border: 5px solid transparent; border-left: 0; border-right-color: rgba(20,24,30,.58); }
#trip.arrived .dTag .hLeft { color: #f4c04e; opacity: 1; }

/* Over an animal waiting on the verge, a part of the strip is all but gone. */
#trip .hPanel, #trip .hRail, #trip .hMarks, #trip .hDest { transition: opacity .25s; }
#trip.gRail .hPanel, #trip.gRail .hRail, #trip.gRail .hMarks, #trip.gRail .hDest { opacity: .1; }
#trip.gDest .dTag, #trip.gNext .nTag { opacity: .1; }
#trip .nTag.none { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  #trip .hMark, #trip .hTag, #trip .hPanel, #trip .hRail, #trip .hMarks, #trip .hDest { transition: none; }
}`;

/** An element with attributes and children, built without parsing markup. */
function el(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) e.append(k);
  return e;
}

/** An SVG element with attributes. */
function sv(tag, attrs = {}) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** One drawing of the route: its line, the roundabouts' rings and the
 *  arrowheads, in the colour the drawing is given (currentColor). */
function railDrawing(cls) {
  const svg = sv('svg', { class: cls, 'aria-hidden': 'true' });
  const line = sv('path', { fill: 'none', stroke: 'currentColor', 'stroke-linejoin': 'round' });
  const ring = sv('path', { fill: 'none', stroke: 'currentColor' });
  const head = sv('path', { fill: 'currentColor' });
  svg.append(line, ring, head);
  return { svg, line, ring, head };
}

/** A name set one word to a line. An ampersand stays with the word after it
 *  ("& Fishy"), as it is not a word. */
export function setWords(node, name) {
  const words = [];
  for (const w of name.split(' ')) {
    if (words.length && words[words.length - 1] === '&') words[words.length - 1] = '& ' + w;
    else words.push(w);
  }
  node.replaceChildren(...words.flatMap((w, i) => (i ? [' ', el('span', { class: 'hW' }, [w])] : [el('span', { class: 'hW' }, [w])])));
}

export function create(wrap) {
  if (!document.getElementById('tripStripCss')) {
    const st = el('style', { id: 'tripStripCss' });
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const T = {
    data: null, rounds: null, degree: null, degreeOf: null, roundAt: null, roundsOf: null, snaps: [], marks: [], signs: [], junctions: [], total: 1,
    geo: null, at: null, key: '', vanY: null, text: null, arrived: false, vanAspect: 2,
    next: undefined, railNext: undefined, nextAt: null, nextText: null, shown: null, ghost: '', np: -1, shownMarks: 0, fits: true,
  };
  const tag = (cls, kids) => el('div', { class: 'hTag ' + cls }, kids);
  T.rails = [railDrawing('rBase'), railDrawing('rDone')];
  T.van = el('img', { class: 'tVan', alt: '' });
  T.road = el('div', { class: 'hRail' }, [T.rails[0].svg, T.rails[1].svg, T.van]);
  T.marksEl = el('div', { class: 'hMarks' });
  T.destDisc = el('div', { class: 'hDest' }, [el('img', { alt: '', src: glyphURL('finish') })]);
  T.name = el('span', { class: 'hName' }, ['—']);
  T.left = el('span', { class: 'hLeft' });
  T.destTag = tag('dTag', [el('span', { class: 'hTxt' }, [T.name, T.left])]);
  T.nextName = el('span', { class: 'hName' });
  T.nextLeft = el('span', { class: 'hLeft' });
  T.nextTag = tag('nTag none', [el('span', { class: 'hTxt' }, [T.nextName, T.nextLeft])]);
  T.el = el('div', { id: 'trip', class: 'hidden', role: 'img', 'aria-label': 'on the way' },
    [el('div', { class: 'hPanel' }), T.road, T.marksEl, T.destDisc, T.destTag, T.nextTag]);
  wrap.appendChild(T.el);
  // The tags' heights depend on the font, which may arrive after the first drawing.
  document.fonts?.ready.then(() => { T.next = undefined; });
  return T;
}

export async function load(T) {
  const get = async url => {
    try {
      const res = await fetch(url);
      return res.ok ? await res.json() : null;
    } catch { return null; }   // no sights, or no roundabouts: the strip still shows the van, the flag and the turns
  };
  [T.data, T.rounds] = await Promise.all([get(DATA_URL), get(ROUNDS_URL)]);
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
  degrees(T, r.graph);
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

/** How many roads meet at each node of the graph, once per graph. */
function degrees(T, g) {
  if (T.degreeOf !== g) {
    T.degree = new Uint8Array(g.nodes.length);
    for (const [i, j] of g.edges) if (i >= 0 && j >= 0) { T.degree[i]++; T.degree[j]++; }
    T.degreeOf = g;
  }
  return T.degree;
}

// ------------------------------------------------- turns and roundabouts

/** The map's real roundabouts (roundabouts.json, from OpenStreetMap by
 *  tools/osm-roundabouts.py: Marcus, 96A, 2026-10-14), each on the graph node
 *  nearest it. The road data has no junction=roundabout tag, and the strip's
 *  first try, a loop of roads found from the geometry, picked a triangle of
 *  roads at Birchington station and another off the A28, which are no
 *  roundabouts. A place further than SNAP_M from every node of the graph is
 *  not on this map's roads and is not drawn. The nodes are of any degree: the
 *  graph is a skeleton and may carry only the main road through a
 *  mini-roundabout, so the node there has two roads, not three. Her graph
 *  splits the A28's junctions by side, so the nodes at the same spot all
 *  count. Once per graph.
 *  @returns {Map<number, object>} graph node -> the place (roundabouts.json's) */
function snapRoundabouts(T, r) {
  const g = r.graph;
  if (T.roundsOf === g) return T.roundAt;
  const xy = g.nodes.map(([fx, fy]) => r.toWorld(fx, fy));
  const at = new Map(), snaps = [];
  for (const p of T.rounds?.places ?? []) {
    let best = -1, bd = Infinity;
    xy.forEach((q, i) => {
      const d = Math.hypot(q.x - p.at[0], q.y - p.at[1]);
      if (d < bd) { bd = d; best = i; }
    });
    snaps.push({ osm: p.osm, node: best, m: +bd.toFixed(1), on: best >= 0 && bd <= (T.rounds.snapM ?? SNAP_M) });
    if (!snaps[snaps.length - 1].on) continue;
    xy.forEach((q, i) => { if (Math.hypot(q.x - xy[best].x, q.y - xy[best].y) <= SAME_SPOT_M) at.set(i, p); });
  }
  T.roundAt = at; T.roundsOf = g; T.snaps = snaps;
  return at;
}

/** The turns and roundabouts of this drive, in the order she meets them
 *  (Marcus, 2026-10-14, 80A and 81A). Nothing else: a side road she passes
 *  straight by is no mark, and a road's own bends are not turns.
 *  - a turn is a junction (three or more roads meet) where the route's heading
 *    changes by TURN_MIN or more, 20 m before to 20 m after (junctions less
 *    than CORNER_GAP_M apart are taken as one corner). side -1 left, +1
 *    right; ang is the heading change in radians.
 *  - a roundabout is a real one (snapRoundabouts) the route passes through;
 *    ang is the heading 20 m after against the heading 20 m before, so 0 is
 *    straight on, as a roundabout sign draws it. rings is 2 for a double
 *    mini-roundabout. A turn at a roundabout is the roundabout's exit, not a
 *    turn. */
export function junctions(T, r, length) {
  const deg = degrees(T, r.graph), P = r.route, N = r.nodes;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const head = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const far = s => s < END_CLEAR_M * 2 || s > length - END_CLEAR_M * 2;
  const out = [], inRound = new Set(), places = snapRoundabouts(T, r);
  for (let k = 1; k < P.length - 1; k++) {
    const place = places.get(N[k]);
    if (!place) continue;
    const a = k;
    let b = k;
    while (b + 1 < P.length - 1 && places.get(N[b + 1]) === place) b++;
    k = b;
    const s = (P[a].s + P[b].s) / 2;
    if (far(s)) continue;
    // The way in is the heading 20 m before it, the way out 20 m after, as for a turn.
    const before = r.atDistance(Math.max(0, P[a].s - 20)), after = r.atDistance(Math.min(length, P[b].s + 20));
    const ang = wrap(head(P[b], after) - head(before, P[a]));
    out.push({ id: 'round-' + a, kind: 'round', rings: place.rings === 2 ? 2 : 1, s, side: ang < 0 ? -1 : 1, ang });
    for (let i = a; i <= b; i++) inRound.add(i);
  }
  const at = [];   // the junction nodes on the route, in order
  for (let k = 1; k < P.length - 1; k++) if (deg[N[k]] >= 3 && !inRound.has(k) && !far(P[k].s)) at.push(k);
  // Junction nodes only a few metres apart (the points the route makes round a
  // pair of lights, say) are one corner, taken together: its heading 20 m
  // before the first to 20 m after the last.
  for (let i = 0; i < at.length;) {
    let j = i;
    while (j + 1 < at.length && P[at[j + 1]].s - P[at[j]].s < CORNER_GAP_M) j++;
    const first = P[at[i]], last = P[at[j]];
    const a = r.atDistance(Math.max(0, first.s - 20)), b = r.atDistance(Math.min(length, last.s + 20));
    const turn = wrap(head(last, b) - head(a, first));
    if (Math.abs(turn) >= TURN_MIN) out.push({ id: 'turn-' + at[i], kind: 'turn', s: (first.s + last.s) / 2, side: turn < 0 ? -1 : 1, ang: turn });
    i = j + 1;
  }
  return out.sort((a, b) => a.s - b.s);
}

/** One mark's drawing, in px about the point (0, 0) that the line reaches
 *  from below. line(x, y) is the rest of the line's stroke from there (for a
 *  turn, the bend and its stem; for a roundabout, the exit arm), ring(x, y)
 *  the roundabout's ring, head(x, y) the arrowhead, which is 2.5 line widths
 *  long (Marcus, 2026-10-14). up is how far above (0, 0) the mark reaches
 *  before the line carries on, with its small gap; dn how far below; foot
 *  where the line from below ends. lw is the line's width in px. */
export function markShape(j, lw) {
  const u = lw / 3, gap = lw, hl = 2.5 * lw, hw = 1.1 * lw;
  const f = v => +v.toFixed(2);
  // An arm leaving along (dx, dy) from r0 out, a stem and then the arrowhead,
  // from a ring whose middle is oy above the point (0, 0).
  const arm = (dx, dy, r0, stem, oy = 0) => {
    const k = r0 + stem, nx = -dy, ny = dx, e = lw / 2;
    const E = [dx * k, dy * k - oy], tip = [dx * (k + hl), dy * (k + hl) - oy];
    return {
      from: [dx * r0, dy * r0 - oy], E, tip,
      a: [E[0] + nx * hw, E[1] + ny * hw], b: [E[0] - nx * hw, E[1] - ny * hw],
      edge: [[E[0] + nx * e, E[1] + ny * e], [E[0] - nx * e, E[1] - ny * e]],
    };
  };
  const heads = (A, ox, oy) => `M${f(ox + A.tip[0])} ${f(oy + A.tip[1])}L${f(ox + A.a[0])} ${f(oy + A.a[1])}L${f(ox + A.b[0])} ${f(oy + A.b[1])}Z`;
  if (j.kind === 'turn') {
    // The line bends into the arrow, pointing off to the side she turns to:
    // square to the road for a right angle, leaning forward for a gentler turn.
    const phi = Math.min(Math.PI / 2, Math.max(Math.PI / 4, Math.abs(j.ang)));
    const dx = j.side * Math.sin(phi), dy = -Math.cos(phi), r = 3.5 * u;
    const A = arm(dx, dy, r, u);
    const ys = [A.tip[1], A.a[1], A.b[1], A.edge[0][1], A.edge[1][1]];
    return {
      up: -Math.min(...ys) + gap, dn: r, foot: r,
      line: (ox, oy) => `Q${f(ox)} ${f(oy)} ${f(ox + dx * r)} ${f(oy + dy * r)}L${f(ox + A.E[0])} ${f(oy + A.E[1])}`,
      ring: () => '', head: (ox, oy) => heads(A, ox, oy),
    };
  }
  // A roundabout: a small ring on the line, and the exit arm at the angle she
  // takes it by, up being 0 and right positive. A double mini-roundabout is two
  // such rings close together, one above the other along the line (the van
  // meets the lower first), the arm leaving the upper, as UK signs draw it.
  const rc = 3 * u, rw = 2 * u, two = j.rings === 2;
  const h = two ? rc + rw / 2 + DOUBLE_GAP * u / 2 : 0;   // each ring's middle is this far above and below (0, 0)
  const th = Math.max(-(two ? 1.77 : 2.4), Math.min(two ? 1.77 : 2.4, j.ang));
  const A = arm(Math.sin(th), -Math.cos(th), rc, 1.5 * u, h);
  const ys = [A.tip[1], A.a[1], A.b[1], A.edge[0][1], A.edge[1][1], -h - rc - rw / 2];
  const ringAt = (ox, oy) => `M${f(ox - rc)} ${f(oy)}a${f(rc)} ${f(rc)} 0 1 0 ${f(2 * rc)} 0a${f(rc)} ${f(rc)} 0 1 0 ${f(-2 * rc)} 0`;
  return {
    up: -Math.min(...ys) + gap, dn: Math.max(h + rc + rw / 2, ...ys), foot: h + rc,
    line: (ox, oy) => `M${f(ox + A.from[0])} ${f(oy + A.from[1])}L${f(ox + A.E[0])} ${f(oy + A.E[1])}`,
    ring: (ox, oy) => two ? ringAt(ox, oy + h) + ringAt(ox, oy - h) : ringAt(ox, oy),
    head: (ox, oy) => heads(A, ox, oy),
  };
}

/** Whether mark j, drawn with its middle at road-local y, is on the line and
 *  clear of every sight's disc: the next sight's (the biggest, and its ring a
 *  little over) and the others' (smaller, 95A, so more marks fit). */
function clearOfDiscs(T, j, y) {
  const G = T.geo;
  return y - j.up >= 0 && y + j.dn <= G.len
    && T.marks.every(m => {
      const my = m.y - G.roadTop, R = m === T.railNext ? G.discNext : G.discSmall;
      return !(y - (j.up - G.lw) < my + R && y + j.dn > my - R);
    });
}

/** The rail's line with its marks, drawn in both of its drawings. Marks that
 *  would crowd each other are not all drawn: the nearer junction to the van
 *  wins, the next she will meet first, then the one she has just passed. A
 *  mark that is left out comes back when the ones that crowded it are behind
 *  her. np is how many marks she has passed. The rail is drawn again when she
 *  passes a mark and when the next sight changes (T.railNext), as the next
 *  sight's disc is the one that is bigger.
 *
 *  One exception to nearer-wins: a roundabout is never left out for a turn.
 *  On the Birchie map each roundabout has a turn within about a hundred
 *  metres (at a drive's scale on the rail, the same pixels) and the van's own
 *  icon covers a mark that close ahead, so the nearer would always win and no
 *  roundabout would ever be seen. The turn is the lesser mark: it returns
 *  when the roundabout is behind her. Roundabouts and turns each still go
 *  by nearer-wins among themselves. */
export function drawRail(T, np) {
  const G = T.geo, f = v => +v.toFixed(2), cx = G.w / 2, J = T.junctions;
  const order = [];
  for (let k = np; k < J.length; k++) order.push(J[k]);
  for (let k = np - 1; k >= 0; k--) order.push(J[k]);
  order.sort((a, b) => (a.kind === 'round' ? 0 : 1) - (b.kind === 'round' ? 0 : 1));   // stable: nearer-first within each kind
  const kept = [];
  for (const j of J) j.blocked = !nudgesOf(j).some(d => clearOfDiscs(T, j, j.y + d));   // no place within reach of its own
  for (const j of order) {
    for (const d of nudgesOf(j)) {
      const y = j.y + d;
      if (!clearOfDiscs(T, j, y)) continue;
      if (kept.every(q => y - j.up - G.lw >= q.at + q.dn || q.at - q.up - G.lw >= y + j.dn)) { j.at = y; kept.push(j); break; }
    }
  }
  kept.sort((a, b) => b.at - a.at);
  for (const j of J) j.shown = false;
  for (const j of kept) j.shown = true;
  let line = `M${f(cx)} ${f(G.len)}`, ring = '', head = '';
  for (const j of kept) {
    line += `L${f(cx)} ${f(j.at + j.foot)}${j.shape.line(cx, j.at)}M${f(cx)} ${f(j.at - j.up)}`;
    ring += j.shape.ring(cx, j.at);
    head += j.shape.head(cx, j.at);
  }
  line += `L${f(cx)} 0`;
  T.shownMarks = kept.length;
  for (const R of T.rails) {
    R.line.setAttribute('d', line); R.ring.setAttribute('d', ring); R.head.setAttribute('d', head);
  }
}

export function setRoute(T, r) {
  T.total = Math.max(1, r.total);
  const length = r.route.length > 1 ? r.route[r.route.length - 1].s : 0;
  T.marks = r.route.length > 1 ? choose(T, r) : [];
  T.junctions = r.route.length > 1 ? junctions(T, r, length) : [];
  setWords(T.name, r.nameOf(r.dest) ?? r.dest);
  T.el.classList.remove('arrived');
  T.arrived = false;
  T.text = null; T.vanY = null; T.next = undefined; T.nextText = null; T.shown = null; T.np = -1;
  T.signs = signsFor(T, r);
  T.marksEl.replaceChildren(...T.marks.map(m => {
    // A pair shares one disc on the strip, as it shares one post.
    m.el = el('div', { class: 'hMark', title: [m, m.also].filter(Boolean).map(b => b.name).join(' and ') },
      [el('img', { alt: '', src: glyphURL(m.kind) })]);
    m.state = '';
    return m.el;
  }));
  T.key = '';
  window.__trip = T;   // which sights and marks this drive shows, for a test
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

/** The rail's width, its discs and its line, a little bigger held sideways,
 *  where there is room. The rail is as wide as its discs need, and no wider
 *  than the arrows for a left turn need: an arrow reaches 12 line-widths / 3
 *  from the line (a bend, a short stem and the head), and the line is in the
 *  middle, so the arrow must clear the screen's edge. */
function sizes(w, h) {
  const disc = w > h ? Math.max(20, Math.min(26, Math.round(h / 34))) : 18;
  const lw = Math.max(3, Math.round(disc / 6)), u = lw / 3;
  return { w: Math.max(disc + 12, Math.ceil(2 * (12 * u + 3.5))), disc, van: Math.round(disc * 0.7), lw };
}

export function layout(T, g) {
  const S = sizes(g.w, g.h);
  // Flush with the road view's edge, below the chips, and below the
  // look-ahead window wherever it would open over the strip or its tags
  // (across the whole top, held upright).
  const x = g.left;
  let top = g.clearTop + 8;
  if (g.look && g.look.x < S.w + 160) top = Math.max(top, g.top + g.look.y + g.look.h + 8);
  const bottom = g.top + g.roadH - 10;
  const key = [x, g.top, top, bottom, S.w, S.disc, T.vanAspect].map(v => Math.round(v * 10)).join(',');
  if (key === T.key) return;
  T.key = key;
  const H = Math.max(110, bottom - top);
  Object.assign(T.el.style, { left: x + 'px', top: top + 'px', width: S.w + 'px', height: H + 'px' });
  T.el.style.setProperty('--w', S.w + 'px');
  T.el.style.setProperty('--disc', S.disc + 'px');
  T.el.style.setProperty('--van', S.van + 'px');
  // The destination's disc at the top, the rail from under it to the bottom.
  const destD = S.disc + 4;
  T.destDisc.style.width = T.destDisc.style.height = destD + 'px';
  T.destDisc.style.left = (S.w / 2 - destD / 2) + 'px';
  T.destDisc.style.top = '5px';
  const roadTop = 5 + destD + 6, roadBottom = H - 8;
  const len = Math.max(40, roadBottom - roadTop);
  Object.assign(T.road.style, { top: roadTop + 'px', height: len + 'px' });
  for (const R of T.rails) {
    R.svg.setAttribute('width', S.w); R.svg.setAttribute('height', len);
    R.line.setAttribute('stroke-width', S.lw); R.ring.setAttribute('stroke-width', +(S.lw * 2 / 3).toFixed(2));
  }
  const vanH = S.van * T.vanAspect;
  T.geo = { len, vanH, roadTop, w: S.w, destD, lw: S.lw };
  // Where it is in #wrap, and where the canvas is, for keeping clear of animals.
  T.at = { x, y: top, w: S.w, h: H, left: g.left, top: g.top, dest: { x: S.w + 5, y: 3 } };
  const run = Math.max(0, len - vanH);
  for (const m of T.marks) {
    m.y = roadTop + len - (vanH / 2 + run * Math.min(1, m.s / T.total));
    m.el.style.top = (m.y - S.disc / 2) + 'px';
  }
  // The turns and roundabouts, on the line at their places. One that would be
  // under a sight's disc (its ring, and a little over) or off either end of the
  // line moves a few px to clear it, and if it cannot is left out: the sight is
  // what she looks for.
  // The next sight's disc is 1.25 times the disc and a gold ring: it keeps the
  // room it had (the disc's radius and 3.5 px). The others are SMALL_DISC of
  // the disc with their white ring and 2 px over.
  T.geo.discNext = S.disc / 2 + 3.5;
  T.geo.discSmall = (S.disc / 2 + 1.5) * SMALL_DISC + 2;
  T.el.style.setProperty('--small', SMALL_DISC);
  for (const j of T.junctions) {
    j.shape = markShape(j, S.lw);
    j.up = j.shape.up; j.dn = j.shape.dn; j.foot = j.shape.foot;
    j.y = len - (vanH / 2 + run * Math.min(1, j.s / T.total));
  }
  T.np = -1; T.railNext = undefined;   // draw the rail again
  // The destination's name beside its disc.
  Object.assign(T.destTag.style, { left: T.at.dest.x + 'px', top: T.at.dest.y + 'px' });
  T.next = undefined;   // re-place the next sight's tag
  T.vanY = null;
  T.el.classList.remove('hidden');
}

// ------------------------------------------------------------------ update

function distanceText(m) {
  if (m >= 1000) return (m / 1000).toFixed(1) + ' km';
  return (m >= 100 ? Math.round(m / 10) * 10 : Math.round(m)) + ' m';
}

/** The next sight's tag, level with its disc, one word to a line. Never over
 *  the destination's tag: where the two would meet (the last sight before the
 *  destination) it sits just below that one, its pointer still on its disc
 *  where that is within reach, and never below the foot of the strip. Where
 *  the strip is too short for both, the nearer, the next sight, is left out
 *  (T.fits) and the destination's tag, which is the grown-up's, stays. */
function placeNext(T) {
  const n = T.next, A = T.at, h = T.nextTag.offsetHeight;
  const below = A.dest.y + T.destTag.offsetHeight + TAG_GAP, ceil = A.h - h - 2;
  const y = Math.max(below, Math.min(n.y - h / 2, ceil));
  T.fits = below <= ceil + 0.5;
  T.nextAt = { x: T.geo.w + 8, y };
  Object.assign(T.nextTag.style, { left: T.nextAt.x + 'px', top: y + 'px' });
  T.nextTag.style.setProperty('--car', Math.max(4, Math.min(h - 14, n.y - y - 5)) + 'px');
}

export function update(T, u) {
  if (!T.geo) return;
  const G = T.geo;
  const p = Math.min(1, u.s / T.total);
  const run = Math.max(0, G.len - G.vanH);
  const y = Math.round(p * run * 2) / 2;
  if (y !== T.vanY) {
    T.vanY = y;
    T.van.style.transform = `translateY(${-y}px)`;
    // The gold drawing of the line shows as far as the van's middle.
    T.rails[1].svg.style.clipPath = `inset(${+(G.len - y - G.vanH / 2).toFixed(1)}px 0 0 0)`;
  }
  let next = null;
  for (const m of T.marks) {
    const passed = u.s >= m.s;
    if (!passed && !next) next = m;
    const state = passed ? 'passed' : m === next ? 'next' : '';
    if (state !== m.state) { m.el.className = 'hMark ' + state; m.state = state; }
  }
  let np = 0;
  while (np < T.junctions.length && u.s >= T.junctions[np].s) np++;
  if (np !== T.np || next !== T.railNext) { T.np = np; T.railNext = next; drawRail(T, np); }
  const moved = next !== T.next;
  if (moved) {
    T.next = next;
    T.nextText = null;
    if (next) setWords(T.nextName, next.also ? next.name + ' & ' + next.also.name : next.name);
  }
  const togo = next ? next.s - u.s : 0;
  const nextText = next ? distanceText(togo) : '';
  if (nextText !== T.nextText) { T.nextText = nextText; T.nextLeft.textContent = next ? 'in ' + nextText : ''; }
  if (moved && next) placeNext(T);
  const show = !!next && !u.arrived && T.fits !== false;
  if (show !== T.shown) { T.shown = show; T.nextTag.classList.toggle('none', !show); }
  const text = u.arrived ? 'here' : distanceText(Math.max(0, T.total - u.s));
  if (text !== T.text) {
    T.text = text;
    T.left.textContent = text;
    T.el.setAttribute('aria-label', u.arrived ? 'arrived at ' + T.name.textContent
      : T.name.textContent + ', ' + text + ' to go' + (next ? ', next ' + next.name : ''));
  }
  if (u.arrived && !T.arrived) { T.arrived = true; T.el.classList.add('arrived'); }
  keepClear(T, u.animals);
}

/** Any part of the strip over an animal goes all but clear (gRail, gDest,
 *  gNext), so the animal waiting on the verge is seen whole. The parts are
 *  the rail, the destination's tag and the next sight's, each padded a little,
 *  against each animal's box (its glow too); the tags' sizes are read only while there is an
 *  animal on the screen, which is seldom. */
function keepClear(T, animals) {
  let ghost = '';
  if (animals && animals.length && T.at) {
    const A = T.at, parts = [['gRail', A.x, A.y, A.w, A.h]];
    parts.push(['gDest', A.x + A.dest.x, A.y + A.dest.y, T.destTag.offsetWidth, T.destTag.offsetHeight]);
    if (T.shown && T.nextAt) parts.push(['gNext', A.x + T.nextAt.x, A.y + T.nextAt.y, T.nextTag.offsetWidth, T.nextTag.offsetHeight]);
    for (const [cls, x, y, w, h] of parts) {
      // A glow breathes, so a part already ghosted comes back only once well clear.
      const pad = T.ghost.includes(cls) ? GHOST_OUT : GHOST_PAD;
      const hit = animals.some(a => a.x0 + A.left < x + w + pad && a.x1 + A.left > x - pad
        && a.y0 + A.top < y + h + pad && a.y1 + A.top > y - pad);
      if (hit) ghost += ' ' + cls;
    }
  }
  if (ghost !== T.ghost) {
    T.ghost = ghost;
    T.el.classList.remove('gRail', 'gDest', 'gNext');
    for (const c of ghost.split(' ')) if (c) T.el.classList.add(c);
  }
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

/** Each kind, painted in a 24 x 24 box in the world's style, for its
 *  fingerpost's board: soft fills and a thin dark outline, shapes a child
 *  names on sight. */
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
