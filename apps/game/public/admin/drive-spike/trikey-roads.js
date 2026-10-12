/**
 * trikey-roads.js — Trikey's own roads for the drive spike.
 *
 * The rule (Marcus 15D/18A; docs/driving-rebuild-2026-10-11.md, "The A28 as
 * it really is"): Trikey never rides along the A28; she crosses its 30–40 mph
 * stretches only at the lights or a zebra, and its dual carriageway only by a
 * bridge or a tunnel, of which there are none. A crossing at road level of a
 * dual carriageway "teaches something very dangerous to kids".
 *
 * The game routes her by that rule in `src/driving/trikey-links.ts` (her
 * graph: the game graph without the A28, her paths from trikey-links.json,
 * each A28 junction split by side, the sides joined only at the crossings
 * marked for her) and `road-router.ts` (its weights and its Dijkstra). This
 * is that code line for line in plain JS, which the spike page and the node
 * checks can load; `src/driving/__tests__/trikey-spike-roads.test.ts` holds
 * the two to the same graph and the same route between every two places, so
 * the spike cannot drift from the game.
 */

export const CROSSING_CLASS = 'crossing';

// road-router.ts: the map is wider than tall; the router's class preferences.
const ASPECT = 1800 / 1121;
const CLASS_MULT = { trunk: 0.6, secondary: 0.75, tertiary: 0.85, track: 2.2 };
// route-path.ts
const METRES_PER_UNIT = 3900;

function segLen(a, b) { return Math.hypot((a[0] - b[0]) * ASPECT, a[1] - b[1]); }
function roadWeight(g, a, b, cls) { return segLen(g.nodes[a], g.nodes[b]) * (CLASS_MULT[cls] ?? 1); }
function pairKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }

/**
 * Her graph (trikey-links.ts trikeyGraph): the game graph without the A28,
 * plus her links, with each A28 junction split by side and the permitted
 * crossings joining the sides. Throws where the data does not fit the graph,
 * rather than route her across a road she must not cross.
 * @returns {{ nodes: number[][], edges: [number, number, string][], anchors: Record<string, number>,
 *   crossings: { id: string, type: string, at: number[], stretch: string, pavementM: number, north: number, south: number }[],
 *   baseNode: number[] }}
 */
export function trikeyGraph(base, links) {
  const nBase = base.nodes.length;
  const nodes = [...base.nodes.map(p => [p[0], p[1]]), ...links.extraNodes];
  const baseNode = nodes.map((_, i) => (i < nBase ? i : -1));
  const known = nodes.length;
  const check = (n, what) => {
    if (!Number.isInteger(n) || n < 0 || n >= known) throw new Error(`trikey-links: ${what} names node ${n}, which does not exist`);
  };

  const split = new Set(links.edgeSplits.map(s => pairKey(s.edge[0], s.edge[1])));
  const raw = [];
  for (const [a, b, cls] of base.edges) {
    if (cls === 'trunk' || split.has(pairKey(a, b))) continue;
    raw.push([a, b, cls]);
  }
  for (const s of links.edgeSplits) {
    const chain = [s.edge[0], ...s.insert, s.edge[1]];
    chain.forEach(n => check(n, `split of ${s.edge.join('-')}`));
    for (let i = 1; i < chain.length; i++) raw.push([chain[i - 1], chain[i], s.class]);
  }
  for (const [a, b, cls] of links.extraEdges) {
    check(a, `${cls} edge`); check(b, `${cls} edge`);
    raw.push([a, b, cls]);
  }

  const sides = new Map();
  for (const j of links.a28Junctions) {
    check(j.node, 'a28Junctions');
    const keeps = j.south.length > 0 ? 'south' : 'north';
    const other = keeps === 'south' ? 'north' : 'south';
    const node = { north: undefined, south: undefined };
    node[keeps] = j.node;
    if (j[other].length > 0) {
      node[other] = nodes.length;
      nodes.push([base.nodes[j.node][0], base.nodes[j.node][1]]);
      baseNode.push(j.node);
    }
    sides.set(j.node, { north: new Set(j.north), south: new Set(j.south), node });
  }
  const sideNode = (n, side, what) => {
    const s = sides.get(n);
    if (!s) return n;
    const out = s.node[side];
    if (out === undefined) throw new Error(`trikey-links: ${what} reaches A28 junction ${n} on its ${side} side, which has no road`);
    return out;
  };
  const end = (n, from) => {
    const s = sides.get(n);
    if (!s) return n;
    if (s.north.has(from)) return sideNode(n, 'north', `edge ${n}-${from}`);
    if (s.south.has(from)) return sideNode(n, 'south', `edge ${n}-${from}`);
    throw new Error(`trikey-links: A28 junction ${n} does not say which side ${from} is on`);
  };
  const edges = raw.map(([a, b, cls]) => [end(a, b), end(b, a), cls]);

  const crossings = [];
  for (const c of links.crossings) {
    if (!c.usedByRoutes) continue;
    if (!c.north || !c.south || c.pavementM === undefined) throw new Error(`trikey-links: crossing ${c.osmNodes[0]} is marked for her but has no ends`);
    if (c.stretch === 'dual') throw new Error(`trikey-links: crossing ${c.osmNodes[0]} is on the dual carriageway`);
    const crossingEnd = (e, side) => {
      check(e.node, 'crossing');
      if (e.arm) return sideNode(e.node, e.arm, `crossing ${c.osmNodes[0]}`);
      if (sides.has(e.node)) throw new Error(`trikey-links: crossing ${c.osmNodes[0]} ends at A28 junction ${e.node} without saying which arm (${side})`);
      return e.node;
    };
    const crossing = {
      id: `osm-${c.osmNodes[0]}`, type: c.type, at: c.at, stretch: c.stretch, pavementM: c.pavementM,
      north: crossingEnd(c.north, 'north'), south: crossingEnd(c.south, 'south'),
    };
    crossings.push(crossing);
    edges.push([crossing.north, crossing.south, CROSSING_CLASS]);
  }

  const anchors = { ...(base.anchors ?? {}) };
  for (const f of links.farms) {
    if (anchors[f.place] === f.node && sides.has(f.node)) anchors[f.place] = sideNode(f.node, f.side, f.place);
  }
  return { nodes, edges, anchors, crossings, baseNode };
}

/** Her adjacency (trikey-links.ts buildTrikeyAdjacency): her graph weighted
 *  as the router weights any road, never a trunk edge, and each crossing by
 *  its pavement length. Entries are { to, w }. */
export function adjacency(tg) {
  const n = tg.nodes.length;
  const adj = tg.nodes.map(() => []);
  for (const [a, b, cls] of tg.edges) {
    if (cls === CROSSING_CLASS || cls === 'trunk') continue;
    if (a < 0 || b < 0 || a >= n || b >= n) continue;
    const w = roadWeight(tg, a, b, cls);
    adj[a].push({ to: b, w });
    adj[b].push({ to: a, w });
  }
  for (const c of tg.crossings) {
    const w = c.pavementM / METRES_PER_UNIT;
    adj[c.north].push({ to: c.south, w });
    adj[c.south].push({ to: c.north, w });
  }
  return adj;
}

/** road-router.ts's Dijkstra, its binary heap included, so a tie breaks the
 *  same way: the node path from s to t, or null. */
export function shortestPath(adj, s, t) {
  const n = adj.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  dist[s] = 0;
  const a = [[0, s]];
  const push = (p, v) => {
    a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) { const par = (i - 1) >> 1; if (a[par][0] <= a[i][0]) break; [a[par], a[i]] = [a[i], a[par]]; i = par; }
  };
  const pop = () => {
    const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0; const m = a.length;
      for (;;) { const l = 2 * i + 1, r = l + 1; let k = i; if (l < m && a[l][0] < a[k][0]) k = l; if (r < m && a[r][0] < a[k][0]) k = r; if (k === i) break; [a[k], a[i]] = [a[i], a[k]]; i = k; }
    }
    return top;
  };
  while (a.length) {
    const [d, u] = pop();
    if (u === t) break;
    if (d > dist[u]) continue;
    for (const { to, w } of adj[u]) {
      const nd = d + w;
      if (nd < dist[to]) { dist[to] = nd; prev[to] = u; push(nd, to); }
    }
  }
  if (dist[t] === Infinity) return null;
  const path = [];
  for (let u = t; u !== -1; u = prev[u]) path.push(u);
  return path.reverse();
}

/** The places she can ride to from a place (trikey-links.ts reachableFor),
 *  sorted, not counting the place itself. */
export function reachableFrom(R, from) {
  R.reach ??= new Map();
  let out = R.reach.get(from);
  if (out) return out;
  const start = R.tg.anchors[from];
  const seen = new Set(start === undefined ? [] : [start]);
  const stack = [...seen];
  while (stack.length) for (const { to } of R.adj[stack.pop()]) if (!seen.has(to)) { seen.add(to); stack.push(to); }
  out = Object.entries(R.tg.anchors).filter(([p, n]) => p !== from && seen.has(n)).map(([p]) => p).sort();
  R.reach.set(from, out);
  return out;
}

/** No links at all (trikey-links.ts NO_TRIKEY_LINKS): her graph is then the
 *  game graph without the A28. */
export const NO_LINKS = { extraNodes: [], extraEdges: [], edgeSplits: [], a28Junctions: [], farms: [], crossings: [] };

/** Her roads, built once: { tg, adj }. */
export function create(base, links) {
  const tg = trikeyGraph(base, links);
  return { tg, adj: adjacency(tg), base, links };
}

/**
 * A drive for her: from `fromId` (where she pulled up) when given, else from
 * a place she can ride somewhere from, to a place she can reach from there.
 * A place out of her reach is never chosen: it is too far for Trikey.
 * @returns {{ from: string, to: string, path: number[] } | null}
 */
export function pickTrip(R, rand, fromId) {
  const places = Object.keys(R.tg.anchors);
  let from = fromId;
  if (!from || !reachableFrom(R, from).length) {
    const starts = places.filter(p => reachableFrom(R, p).length);
    if (!starts.length) return null;
    from = starts[(rand() * starts.length) | 0];
  }
  const ends = reachableFrom(R, from);
  const to = ends[(rand() * ends.length) | 0];
  const path = shortestPath(R.adj, R.tg.anchors[from], R.tg.anchors[to]);
  return path ? { from, to, path } : null;
}

/** What the spike drives a class of her graph as. Her cycleways, bridleways,
 *  paths and the short links joining them to the roads are 'path': one
 *  unmarked lane down the middle, and no motor traffic. Her crossing of the
 *  A28 at the lights is 'crossing', driven as a path. Every road keeps its
 *  own class. */
const PATH_CLASSES = new Set(['cycleway', 'bridleway', 'path', 'footway', 'snap-link', 'farm-link']);
export function drivingClass(cls) {
  return PATH_CLASSES.has(cls) ? 'path' : cls;
}

/**
 * Her paths for the painter and the GPS: the edges of her graph that are not
 * a road of the game graph (nor a stretch of one she rides split in two, nor
 * a crossing), in her graph's node numbers, classed by drivingClass.
 */
export function extraEdges(R) {
  const { tg, base, links } = R;
  const basePairs = new Set(base.edges.map(([a, b]) => pairKey(a, b)));
  const splitPairs = new Set();
  for (const s of links.edgeSplits) {
    const chain = [s.edge[0], ...s.insert, s.edge[1]];
    for (let i = 1; i < chain.length; i++) splitPairs.add(pairKey(chain[i - 1], chain[i]));
  }
  const raw = n => (tg.baseNode[n] >= 0 ? tg.baseNode[n] : n);
  const out = [];
  for (const [a, b, cls] of tg.edges) {
    if (cls === CROSSING_CLASS) continue;
    const k = pairKey(raw(a), raw(b));
    if (basePairs.has(k) || splitPairs.has(k)) continue;
    out.push([a, b, drivingClass(cls)]);
  }
  return out;
}

/**
 * Where the spike draws and drives her graph's nodes, in world metres, so that
 * what she rides is seen beside the A28 and never on it. The spike draws the
 * A28 at its true width (the dual 21.6 m), and her paths are the map's lines:
 * a cycleway beside the dual (the only way to Bramble Farm) ran inside it as
 * drawn, so she was seen riding along the dual carriageway for a kilometre.
 * So every node of hers that is not a road of the game graph (her paths, and
 * each A28 junction's side copy) is moved out of the A28 as drawn to
 * `verge` metres past its kerb, on its own side; and each A28 junction node
 * itself, which the game graph's roads share, keeps its place for them and
 * gets, for her route alone (`routeAt`), the kerb on the side she reaches it
 * from. Her crossing at the lights then runs kerb to kerb. Positions only:
 * her graph, its weights and every route stay the game's.
 * @param {(edgeIndex: number) => number} trunkHalf half the A28's drawn width on a game-graph edge
 * @param {(fx: number, fy: number) => {x: number, y: number}} toWorld
 */
export function clearOfA28(R, trunkHalf, toWorld, verge = 2.5) {
  const { tg, base, links } = R;
  const nBase = base.nodes.length;
  const at = tg.nodes.map(([fx, fy]) => { const w = toWorld(fx, fy); return [w.x, w.y]; });
  const segs = [];
  base.edges.forEach(([a, b, c], k) => {
    if (c === 'trunk' && base.nodes[a] && base.nodes[b]) segs.push({ p: at[a], q: at[b], h: trunkHalf(k) + verge });
  });
  /** Out of every A28 segment's drawn width (plus the verge), on the side of
   *  `toward` (a point on the wanted side; the point itself when off the line). */
  const push = (pt, toward, forced = false) => {
    let [x, y] = pt;
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const { p, q, h } of segs) {
        const dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy;
        if (!L2) continue;
        const t = ((x - p[0]) * dx + (y - p[1]) * dy) / L2;
        if (t < -0.02 || t > 1.02) continue;
        const cx = p[0] + dx * t, cy = p[1] + dy * t;
        const nx = -dy / Math.sqrt(L2), ny = dx / Math.sqrt(L2);
        const off = (x - cx) * nx + (y - cy) * ny;
        if (Math.abs(off) >= h - 1e-6) continue;
        const sideOff = Math.abs(off) > 0.05 && !forced ? off : (toward[0] - cx) * nx + (toward[1] - cy) * ny;
        const sgn = sideOff >= 0 ? 1 : -1;
        x = cx + nx * h * sgn; y = cy + ny * h * sgn; moved = true;
      }
      if (!moved) break;
    }
    return [x, y];
  };
  // Each junction side, and where its roads go.
  const mean = ns => { const v = ns.filter(n => at[n]); return v.length ? [v.reduce((s, n) => s + at[n][0], 0) / v.length, v.reduce((s, n) => s + at[n][1], 0) / v.length] : null; };
  const sideOfNode = new Map();   // her node -> the side's neighbours' mean
  for (const j of links.a28Junctions) {
    const keeps = j.south.length > 0 ? 'south' : 'north';
    sideOfNode.set(j.node, mean(j[keeps]));
  }
  for (let n = nBase; n < tg.nodes.length; n++) {
    const jn = tg.baseNode[n];
    if (jn < 0) continue;                                   // an extra node
    const j = links.a28Junctions.find(x => x.node === jn);
    const keeps = j.south.length > 0 ? 'south' : 'north';
    sideOfNode.set(n, mean(j[keeps === 'south' ? 'north' : 'south']));
  }
  const shown = at.map((pt, n) => {
    if (n < nBase) return pt;                               // the game graph's roads stay put
    return push(pt, sideOfNode.get(n) ?? pt, sideOfNode.has(n));
  });
  const kerb = new Map();                                    // junction node -> its own side's kerb
  for (const [n, toward] of sideOfNode) if (n < nBase && toward) kerb.set(n, push(at[n], toward, true));
  const routeAt = n => kerb.get(n) ?? shown[n];
  // The game graph's own roads, without the A28, for the pavement from a
  // crossing's end that stands back from the A28 down to it.
  const roadsOff = base.nodes.map(() => []);
  for (const [a, b, c] of base.edges) {
    if (c === 'trunk' || !at[a] || !at[b]) continue;
    const w = Math.hypot(at[a][0] - at[b][0], at[a][1] - at[b][1]);
    roadsOff[a].push([b, w]); roadsOff[b].push([a, w]);
  }
  const junction = new Set(links.a28Junctions.map(j => j.node));
  /** From node n by its own roads (within 150 m) to the first A28 junction,
   *  the points on the way and that junction's kerb on n's side; [] when n
   *  is at the A28 already or none is that near. */
  const downToA28 = (n, from) => {
    if (n >= nBase || junction.has(n)) return [];
    const dist = new Map([[n, 0]]), prev = new Map(), done = new Set();
    for (;;) {
      let u = -1, best = Infinity;
      for (const [k, d] of dist) if (!done.has(k) && d < best) { best = d; u = k; }
      if (u < 0 || best > 150) return [];
      if (junction.has(u)) {
        const out = [push(at[u], from, true)];
        for (let k = prev.get(u); k !== undefined && k !== n; k = prev.get(k)) out.unshift(at[k]);
        return out;
      }
      done.add(u);
      for (const [v, w] of roadsOff[u]) if (best + w < (dist.get(v) ?? Infinity)) { dist.set(v, best + w); prev.set(v, u); }
    }
  };
  const crossingBy = new Map();
  for (const c of tg.crossings) { crossingBy.set(c.north + '-' + c.south, c); crossingBy.set(c.south + '-' + c.north, c); }
  return {
    /** Every node where the painter draws it: hers moved, the roads' in place. */
    shown,
    /** A route's node n where she rides it: a junction node at its kerb. */
    routeAt,
    /**
     * Her way over a crossing step a -> b, between them: along the pavement
     * to the crossing's own place (the data's `at`, where the lights are),
     * straight over to the far kerb, and along the far pavement; or null for
     * any other step. The data joins the two side roads by one edge whose
     * weight is the pavement's length; drawn as one line it ran diagonally
     * across the A28. Each pavement leg is kept off the road as drawn.
     * @returns {{ pts: number[][], over: number } | null} `over`: the index
     *   in pts of the far kerb, so pts[over - 1] -> pts[over] is the crossing itself
     */
    crossingPath(a, b) {
      const c = crossingBy.get(a + '-' + b);
      if (!c) return null;
      const A = routeAt(a), B = routeAt(b), w = toWorld(c.at[0], c.at[1]), X = [w.x, w.y];
      const P1 = push(X, A, true), P2 = push(X, B, true);
      // Through the given points, a point every 4 m or so, each kept off the
      // A28 on the `toward` side; the first point left out.
      const walk = (seq, toward) => {
        const out = [];
        for (let i = 1; i < seq.length; i++) {
          const p = seq[i - 1], q = seq[i], n = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 4));
          for (let k = 1; k <= n; k++) out.push(push([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n], toward, true));
        }
        return out;
      };
      const first = walk([A, ...downToA28(a, A), P1], A);
      const far = walk([P2, ...downToA28(b, B).reverse(), B], B);
      far.pop();                                             // B itself is the step's end
      return { pts: [...first, P2, ...far], over: first.length };
    },
    /** Whether a point lies inside the A28 as drawn (for a check). */
    insideA28: (x, y) => segs.some(({ p, q, h }) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / L2));
      return Math.hypot(x - p[0] - dx * t, y - p[1] - dy * t) < h - verge - 1e-6;
    }),
  };
}

/**
 * A route over her graph as the spike draws and drives it: each node where
 * clearOfA28 shows it (a junction at its kerb), and over a crossing the way
 * by the lights (crossingPath), each point with the node it stands for and
 * the class of the step that ends there (drivingClass; 'crossing' all the
 * way over). The page's toPolyline and safety.check both build from this.
 * @returns {{ x: number, y: number, node: number, cls: string | null }[]}
 */
export function routePoints(R, shown, path) {
  if (!R.edgeClass) {
    R.edgeClass = new Map();
    for (const [a, b, c] of R.tg.edges) { R.edgeClass.set(a * 8192 + b, c); R.edgeClass.set(b * 8192 + a, c); }
  }
  const out = [];
  path.forEach((n, k) => {
    if (k) {
      const via = shown.crossingPath(path[k - 1], n);
      if (via) for (const [x, y] of via.pts) out.push({ x, y, node: path[k - 1], cls: CROSSING_CLASS });
    }
    const [x, y] = shown.routeAt(n);
    out.push({ x, y, node: n, cls: k ? drivingClass(R.edgeClass.get(path[k - 1] * 8192 + n) ?? 'tertiary') : null });
  });
  return out;
}

/**
 * The graph the spike paints on her drive: every road of the game graph as it
 * is, and her paths (extraEdges) where clearOfA28 shows them. A path that
 * ends on an A28 junction node ends instead at a node of its own at that
 * junction's kerb, so the painter never joins it to the A28.
 * @param {(x: number, y: number) => number[]} toMap world metres to map fractions
 */
export function paintGraph(R, disp, toMap) {
  const { tg, base } = R;
  const nBase = base.nodes.length;
  const nodes = tg.nodes.map((p, n) => (n < nBase ? p : toMap(...disp.shown[n])));
  const own = new Map();
  const end = n => {
    if (n >= nBase || disp.routeAt(n) === disp.shown[n]) return n;
    if (!own.has(n)) { own.set(n, nodes.length); nodes.push(toMap(...disp.routeAt(n))); }
    return own.get(n);
  };
  const edges = base.edges.concat(extraEdges(R).map(([a, b, c]) => [end(a), end(b), c]));
  return { nodes, edges, anchors: base.anchors };
}

/**
 * Whether a route over her graph keeps the rule, judged from the game
 * graph's own A28 and the data's sides, not from how her graph was built.
 * Returns the reasons it does not (empty when it does):
 *  - a step along an A28 (trunk) edge of the game graph;
 *  - a step that crosses an A28 edge's line anywhere but at a permitted
 *    crossing (lights or a zebra, never on the dual carriageway);
 *  - passing through an A28 junction from one side to the other.
 */
export function a28Breaches(R, path) {
  const { tg, base, links } = R;
  const out = [];
  const trunk = base.edges.filter(([a, b, c]) => c === 'trunk' && base.nodes[a] && base.nodes[b]);
  const trunkPairs = new Set(trunk.map(([a, b]) => pairKey(a, b)));
  const permitted = new Set(tg.crossings.filter(c => c.stretch !== 'dual').map(c => pairKey(c.north, c.south)));
  const side = new Map(links.a28Junctions.map(j => [j.node, j]));
  const raw = n => (tg.baseNode[n] >= 0 ? tg.baseNode[n] : n);
  const xy = n => [tg.nodes[n][0] * ASPECT, tg.nodes[n][1]];
  const cross = (p, q, r, s) => {
    // Proper crossing of segments pq and rs (touching at an end is not one).
    const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const d1 = d(r, s, p), d2 = d(r, s, q), d3 = d(p, q, r), d4 = d(p, q, s);
    const e = 1e-12;
    return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
  };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const k = pairKey(a, b);
    if (permitted.has(k)) continue;
    if (trunkPairs.has(pairKey(raw(a), raw(b)))) { out.push(`rides the A28 from node ${raw(a)} to ${raw(b)}`); continue; }
    const p = xy(a), q = xy(b);
    for (const [ta, tb] of trunk) {
      const r = [base.nodes[ta][0] * ASPECT, base.nodes[ta][1]], s = [base.nodes[tb][0] * ASPECT, base.nodes[tb][1]];
      if (cross(p, q, r, s)) { out.push(`crosses the A28 (${ta}-${tb}) between nodes ${raw(a)} and ${raw(b)}, not at the lights`); break; }
    }
  }
  for (let i = 1; i < path.length - 1; i++) {
    const j = side.get(raw(path[i]));
    if (!j) continue;
    const before = raw(path[i - 1]), after = raw(path[i + 1]);
    const sideOf = n => (j.north.includes(n) ? 'north' : j.south.includes(n) ? 'south' : null);
    const s0 = sideOf(before), s1 = sideOf(after);
    const viaCrossing = permitted.has(pairKey(path[i - 1], path[i])) || permitted.has(pairKey(path[i], path[i + 1]));
    if (s0 && s1 && s0 !== s1 && !viaCrossing) out.push(`passes through A28 junction ${raw(path[i])} from its ${s0} side to its ${s1}`);
  }
  return out;
}
