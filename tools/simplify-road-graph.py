#!/usr/bin/env python3
"""
simplify-road-graph.py - make the simpler Birchie road graph, and draw the map from it.

Reads the OpenStreetMap import in tools/road-graph-source/ (never writes to it)
and writes candidate graphs, a report and comparison images to
tools/road-graph-candidates/. Deterministic: no randomness, sorted iteration,
so a re-run is byte-identical.

INSTALLED: candidate D (2026-10-11, Marcus's choice over C, which leaves A.R.C.
  on a bare headland with the towns gone). The game runs
  apps/game/public/assets/driving/birchie-graph.json = birchie-graph.D.json, and
  the roads it draws are the road layer of
  apps/game/public/admin/scene-assets/birchie-map/birchie-roads.svg, written by
  `--svg`. To install a different candidate, or after changing this tool:
      python3 tools/simplify-road-graph.py --svg --no-images --out /tmp/x
      cp /tmp/x/birchie-graph.D.json apps/game/public/assets/driving/birchie-graph.json
      cp /tmp/x/birchie-roads.D.svg  apps/game/public/admin/scene-assets/birchie-map/birchie-roads.svg
  and run `pnpm --filter @arc/game test`: road-graph-reach.test.ts checks every
  destination is reachable and that the map draws exactly the graph's roads.
  The `--svg` map is the LIVE birchie-roads.svg with only its road layer
  replaced (landmarks, labels, seasons and animations are carried through byte
  for byte, and asserted), so it is safe to run after the art changes. It is
  not a road-only file and must never be written over the map from a stale copy.
  MOVING A PIN changes the graph: each pin snaps to its nearest node and that
  node is protected, so a pin moved to a new node keeps a different stub and
  prunes another. The hog hospital and Wilderwood sit exactly ON the nodes D
  already protects (a track's end, a point on the south lane), which is why D is
  unchanged by placing them. Move a pin, and re-run, re-install and re-test.

THE SOURCE (tools/road-graph-source/)
  birchie-graph.osm.json   the graph as it shipped until 2026-10-11: 2,475 edges,
                           extracted from the OSM roads in birchie-roads.svg by a
                           tools/build-road-graph.py that is gone (retired, git has
                           it): roads sampled every 14 map units, shared points
                           snapped to 13, dangling ends bridged within 18.
  birchie-roads.osm.svg    the road layer of birchie-roads.svg as it was then: the
                           12 road classes, every road. This is where the service
                           road Cove Harbour follows comes from; the live map has
                           dropped it.
  These are inputs, not outputs. Nothing regenerates them. Anything that reads
  "the full graph" or "today" in this tool means them, not the installed files.

WHY
  The graph was OpenStreetMap imported wholesale: 2,475 edges, 503 junctions,
  mostly residential closes, farm tracks and unclassified lanes. A child aged
  3-8 cannot read it, and a route through it asked them to steer at ~28 forks.
  The map the child SEES (birchie-roads.svg: map.html, the in-drive GPS panel,
  intro.html, birchie-map.html) was also a separate thing from the graph the van
  DRIVES, so the two disagreed: 141 footpaths, service roads, cycleways and
  pedestrian streets were drawn that no route could use. The decision behind this
  tool is ONE graph for both. Each candidate is one file, and --svg writes the map
  to draw from it.

OUTPUT FORMAT (version 2, a superset of version 1)
  nodes    [[fx, fy], ...]          unchanged encoding, so road-router.ts,
  edges    [[a, b, cls], ...]       junctions.ts and every test read it as is
  roads    [[cls, [n0, n1, ...]]]   NEW: each maximal run of one class between
                                    two junctions or ends. This is what the
                                    map draws. Every consecutive pair in a road
                                    is an edge and every edge is in exactly one
                                    road (asserted on write), so what is drawn
                                    and what is driven cannot differ.
  anchors  {id: nodeIndex}          the node each destination snaps to
  meta     title, and the synthetic links (see FIXES)

  Node indices are renumbered. Nothing persists them (a route is rebuilt each
  drive; the unit tests build their own graphs), so a candidate is a drop-in
  replacement for the file.

THE LEVERS, in order of safety
  collapse  Fold degree-2 chains into one road. Lossless, and changes nothing
            visible (it is the same lines): the clutter is junctions, not
            geometry points. It is what makes the count honest.
  tracks    Farm tracks are not rescue-van roads, except where one is the only
            road to a destination (Cove Harbour, Moorland and the hog hospital).
  stubs     Prune dead-end stubs shorter than a threshold, unless they lead to a
            destination or run off the edge of the map.
  access    Keep a road of a dropped class only where it is the cheapest way to
            join a destination, or two pieces that matter, to the shelter.
  streets   Add back the busiest residential streets (runs of blocks that carry
            on straight), so towns still read as towns.

FIXES (a finding about today's graph, not a lever)
  The shipped graph is not a connected road network, and the skeleton cannot be
  kept without repairing it. Every candidate except A (which changes nothing)
  adds a few short straight links, each recorded in meta.links and drawn red:
    heal    The A28 (trunk) is in four pieces, with gaps of 9, 23 and 27 map
            units, so it cannot be driven end to end. Joined, nearest gap first.
    repair  Cove Harbour sits in a component of farm tracks and Deep Forest in a
            housing estate, each ~55-60 map units short of the main network:
            today the router finds no road to either and the GPS draws a
            straight line across the fields. Each is joined to the nearest node
            of the main network.

REACHABILITY
  Checked with a replica of the game's own router (road-router.ts): nearest
  node, then Dijkstra with the same class multipliers. A destination is
  reachable when the node it snaps to is in the shelter's component. Anchor
  nodes (the nodes destinations snap to today) are protected, so pruning can
  never move where a destination snaps to. Destinations are parsed from
  packages/game-logic/src/destinations.ts at run time, so a place added later
  that has no road shows up here.

  python3 tools/simplify-road-graph.py              build everything
  python3 tools/simplify-road-graph.py --svg        also write birchie-roads.<key>.svg: the whole
                                                    map, the live birchie-roads.svg with ONLY its
                                                    road layer replaced (asserted: every byte
                                                    outside the road layer is the live file's)
  python3 tools/simplify-road-graph.py --check F    verify any graph file (exit 1 if a
                                                    destination cannot be reached)

Deps: Pillow and cairosvg (images only).
"""
import argparse
import collections
import heapq
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / 'tools/road-graph-source'
GRAPH_IN = SOURCE_DIR / 'birchie-graph.osm.json'          # the OSM import: the full graph (see THE SOURCE)
OSM_ROADS_IN = SOURCE_DIR / 'birchie-roads.osm.svg'       # its road layer as drawn: the full set of roads
SVG_IN = ROOT / 'apps/game/public/admin/scene-assets/birchie-map/birchie-roads.svg'   # the LIVE map: landmarks, labels, seasons
DEST_TS = ROOT / 'packages/game-logic/src/destinations.ts'
OUT_DIR = ROOT / 'tools/road-graph-candidates'

VIEW_W, VIEW_H = 1800.0, 1121.0
ASPECT = VIEW_W / VIEW_H
# road-router.ts CLASS_MULT, and junctions.ts MINOR_CLASSES. Keep in step.
CLASS_MULT = {'trunk': 0.6, 'secondary': 0.75, 'tertiary': 0.85, 'track': 2.2}
MINOR_CLASSES = {'track', 'service', 'path', 'footway', 'cycleway', 'steps', 'driveway'}
FRAME_TOL = 16.0        # px: a road ending this close to the frame runs off the map
LINK_STEP = 14.0        # px: synthetic links are cut to the graph's own grain
# How the SVG draws each class; the candidates reuse it so the comparison is of
# structure, not of paint. Order is z-order (bottom first). One departure: the
# OSM map painted a track as a thin dashed line in near-farmland cream, which is
# invisible, and a track is now the ONLY road to Cove Harbour, Moorland and the
# hog hospital, so a child could not see the way to a place she can drive to.
# Tracks are a solid mid-brown, 7 wide: the first try, a darker dashed tan 4.5
# wide, still read as a field boundary (the map's fields are outlined in the same
# tan) and vanished at phone size, where one map unit is 0.2 to 0.45 points. Solid,
# because a dash is a point or two long there and breaks into dots.
ROAD_STYLE = [
    ('track', '#a8742f', 7, None),
    ('service', '#fdf6dc', 5, None),
    ('residential', '#fdf6dc', 8, None),
    ('unclassified', '#f6ecc7', 8, None),
    ('tertiary', '#f0e3b0', 10, None),
    ('secondary', '#f0d894', 12, None),
    ('trunk-outline', '#7b4f1a', 20, None),
    ('trunk', '#f5b74a', 14, None),
]
# Classes the SVG draws that the graph builder never took (so no route uses them).
UNDRIVABLE_DRAWN = ('footway', 'path', 'cycleway', 'pedestrian', 'service')


# ───────────────────────────── loading ─────────────────────────────

def load_graph(path):
    g = json.load(open(path))
    nodes = [(float(x), float(y)) for x, y in g['nodes']]
    edges = {}
    for a, b, cls in g['edges']:
        edges[(min(a, b), max(a, b))] = cls
    return nodes, edges


def load_destinations(path=DEST_TS):
    """id, label, fx, fy, unlockLevel for each entry of DESTINATIONS."""
    src = Path(path).read_text()
    start = src.index('export const DESTINATIONS')
    end = src.index('\n];', start)
    body = src[start:end]
    out = []
    for blk in re.split(r'\n  \{\n', body)[1:]:
        m = re.match(r"\s*id: '([a-z0-9-]+)'", blk)
        if not m:
            continue
        def num(key):
            mm = re.search(r'\b' + key + r': ([0-9.]+)', blk)
            return float(mm.group(1)) if mm else None
        lab = re.search(r"\blabel: '([^']*)'", blk)    # some labels are constants: fall back to the id
        out.append({'id': m.group(1), 'label': lab.group(1) if lab else m.group(1).replace('-', ' ').title(),
                    'fx': num('fx'), 'fy': num('fy'), 'level': int(num('unlockLevel') or 0)})
    if not any(d['id'] == 'arc' for d in out) or any(d['fx'] is None or d['fy'] is None for d in out):
        raise SystemExit(f'could not read DESTINATIONS from {path}: the format changed, fix load_destinations')
    return out


# ───────────────────────── router replica ─────────────────────────

def seg_w(nodes, a, b, cls):
    """Edge weight exactly as road-router.ts buildAdjacency."""
    (ax, ay), (bx, by) = nodes[a], nodes[b]
    return math.hypot((ax - bx) * ASPECT, ay - by) * CLASS_MULT.get(cls, 1.0)


def px_len(nodes, a, b):
    (ax, ay), (bx, by) = nodes[a], nodes[b]
    return math.hypot((ax - bx) * VIEW_W, (ay - by) * VIEW_H)


def adjacency(edges):
    adj = collections.defaultdict(dict)
    for (a, b), cls in edges.items():
        adj[a][b] = cls
        adj[b][a] = cls
    return adj


def nearest_node(nodes, fx, fy):
    """road-router.ts nearestNode: first strict minimum in index order."""
    best, bd = 0, math.inf
    for i, (x, y) in enumerate(nodes):
        d = math.hypot((x - fx) * ASPECT, y - fy)
        if d < bd:
            bd, best = d, i
    return best, bd


def shortest_path(nodes, adj, s, t):
    dist = {s: 0.0}
    prev = {}
    heap = [(0.0, s)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == t:
            break
        if d > dist.get(u, math.inf):
            continue
        for v, cls in adj.get(u, {}).items():
            nd = d + seg_w(nodes, u, v, cls)
            if nd < dist.get(v, math.inf):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(heap, (nd, v))
    if t not in dist:
        return None
    path = [t]
    while path[-1] != s:
        path.append(prev[path[-1]])
    return path[::-1]


def components(edges):
    """List of (node set, edge key set), largest first, deterministic."""
    adj = adjacency(edges)
    seen = set()
    comps = []
    for n in sorted(adj):
        if n in seen:
            continue
        stack, ns = [n], {n}
        while stack:
            u = stack.pop()
            for v in adj[u]:
                if v not in ns:
                    ns.add(v)
                    stack.append(v)
        seen |= ns
        es = {e for e in edges if e[0] in ns}
        comps.append((ns, es))
    comps.sort(key=lambda c: (-len(c[1]), min(c[0])))
    return comps


# ───────────────────────────── chains ─────────────────────────────

def build_chains(edges, keep_nodes=frozenset()):
    """Maximal one-class paths between key nodes (degree != 2, a class change,
    or a protected node). Returns [(cls, [node, ...])], deterministic."""
    adj = adjacency(edges)

    def is_key(n):
        nb = adj[n]
        if len(nb) != 2 or n in keep_nodes:
            return True
        c = list(nb.values())
        return c[0] != c[1]

    chains, seen = [], set()
    for n in sorted(adj):
        if not is_key(n):
            continue
        for m in sorted(adj[n]):
            if (min(n, m), max(n, m)) in seen:
                continue
            cls = adj[n][m]
            path, prev, cur = [n, m], n, m
            seen.add((min(n, m), max(n, m)))
            while not is_key(cur):
                nxt = [x for x in sorted(adj[cur]) if x != prev][0]
                seen.add((min(cur, nxt), max(cur, nxt)))
                path.append(nxt)
                prev, cur = cur, nxt
            chains.append((cls, path))
    for e in sorted(edges):                    # closed loops with no key node
        if e in seen:
            continue
        a, b = e
        cls = edges[e]
        path, prev, cur = [a, b], a, b
        seen.add(e)
        while cur != a:
            nxt = [x for x in sorted(adj[cur]) if x != prev][0]
            seen.add((min(cur, nxt), max(cur, nxt)))
            path.append(nxt)
            prev, cur = cur, nxt
        chains.append((cls, path))
    return chains


def chain_px(nodes, path):
    return sum(px_len(nodes, path[i], path[i + 1]) for i in range(len(path) - 1))


def chain_keys(path):
    return [(min(path[i], path[i + 1]), max(path[i], path[i + 1])) for i in range(len(path) - 1)]


def degrees(edges):
    d = collections.Counter()
    for a, b in edges:
        d[a] += 1
        d[b] += 1
    return d


def at_frame(nodes, n):
    x, y = nodes[n][0] * VIEW_W, nodes[n][1] * VIEW_H
    return min(x, VIEW_W - x, y, VIEW_H - y) <= FRAME_TOL


# ───────────────────────────── levers ─────────────────────────────

def prune_stubs(nodes, edges, protected, min_len):
    """Repeatedly drop dead-end chains shorter than min_len px, unless they
    reach a protected node or run off the edge of the map."""
    edges = dict(edges)
    while True:
        deg = degrees(edges)
        gone = []
        for cls, path in build_chains(edges, protected):
            a, b = path[0], path[-1]
            if a == b or (deg[a] == 1 and deg[b] == 1):
                continue
            end = a if deg[a] == 1 else b if deg[b] == 1 else None
            if end is None or end in protected or at_frame(nodes, end):
                continue
            if chain_px(nodes, path) < min_len:
                gone.append(path)
        if not gone:
            return edges
        for path in gone:
            for k in chain_keys(path):
                edges.pop(k, None)


def keep_arc_component(edges, arc_node):
    for ns, es in components(edges):
        if arc_node in ns:
            return {e: edges[e] for e in es}
    return {}


WAY_CLASSES = ('service', 'path', 'footway', 'cycleway', 'pedestrian')


def svg_ways(classes=WAY_CLASSES):
    """The map's own roads that never made it into the graph, as (cls, [(x, y)])
    in map units: the real geometry a repair can follow instead of a ruled line."""
    svg = OSM_ROADS_IN.read_text()
    out, seen = [], set()
    for m in re.finditer(r'<path\b([^>]*)>', svg):
        cls = re.search(r'data-cls="([^"]*)"', m.group(1))
        d = re.search(r'\bd="([^"]+)"', m.group(1))
        if cls and d and cls.group(1) in classes and d.group(1) not in seen:
            seen.add(d.group(1))
            pts = [(float(x), float(y)) for x, y in re.findall(r'(-?[0-9.]+),(-?[0-9.]+)', d.group(1))]
            if len(pts) >= 2:
                out.append((cls.group(1), pts))
    return out


def resample(pts, step=LINK_STEP):
    """Points along a polyline at roughly even spacing, ends included."""
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        seg = math.hypot(b[0] - a[0], b[1] - a[1])
        for k in range(1, int(seg // step) + 1):
            t = k * step / seg
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        if math.hypot(out[-1][0] - b[0], out[-1][1] - b[1]) > step / 2:
            out.append(b)
        else:
            out[-1] = b
    return out


def closest(pts, nodes, node_ids):
    """The way point nearest any of node_ids: (distance, node, point index)."""
    best = (math.inf, None, None)
    for k, (x, y) in enumerate(pts):
        for n in node_ids:
            d = math.hypot(x - nodes[n][0] * VIEW_W, y - nodes[n][1] * VIEW_H)
            if d < best[0]:
                best = (d, n, k)
    return best


def bridge_via_way(nodes, comp_nodes, main_nodes, ways, reach=22.0, max_px=160.0):
    """If one of the map's own unrouted roads (a service road, say) touches both
    the stranded component and the main network, return (island node, [(x, y)
    along that road], main node, its class). Following it beats ruling a line
    across a field. None if no road bridges the gap."""
    best = None
    for cls, pts in ways:
        dc, nc, kc = closest(pts, nodes, comp_nodes)
        if dc > reach:
            continue
        dm, nm, km = closest(pts, nodes, main_nodes)
        if dm > reach or kc == km:
            continue
        sub = pts[kc:km + 1] if kc < km else pts[km:kc + 1][::-1]
        length = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(sub, sub[1:]))
        if length <= max_px and (best is None or dc + dm + length < best[0]):
            best = (dc + dm + length, nc, sub, nm, cls)
    return None if best is None else best[1:]


def repair_links(nodes, edges, anchors, arc_node, ways=()):
    """Join each component that holds a destination but not the shelter to the
    main network: along one of the map's own unrouted roads if one bridges the
    gap, otherwise a straight link between the closest pair of nodes.
    Returns (new nodes, new edges, [link records])."""
    nodes, edges, links = list(nodes), dict(edges), []
    while True:
        comps = components(edges)
        main = next(c for c in comps if arc_node in c[0])
        stranded = [c for c in comps if arc_node not in c[0] and any(a in c[0] for a in anchors.values())]
        if not stranded:
            return nodes, edges, links
        comp = stranded[0]
        names = sorted(a_id for a_id, a in anchors.items() if a in comp[0])
        via = bridge_via_way(nodes, sorted(comp[0]), sorted(main[0]), ways)
        if via:
            i, sub, j, way_cls = via
            mids = resample(sub)[1:-1]
            chain = [i]
            for x, y in mids:
                nodes.append((round(x / VIEW_W, 5), round(y / VIEW_H, 5)))
                chain.append(len(nodes) - 1)
            chain.append(j)
            for k in range(len(chain) - 1):
                edges[(min(chain[k], chain[k + 1]), max(chain[k], chain[k + 1]))] = 'unclassified'
            px = round(sum(px_len(nodes, chain[k], chain[k + 1]) for k in range(len(chain) - 1)), 1)
            links.append({'kind': 'repair', 'cls': 'unclassified', 'chain': chain, 'px': px, 'serves': names,
                          'via': f'the map\'s own {way_cls} road'})
            continue
        best = (math.inf, None, None)
        for i in sorted(comp[0]):
            for j in sorted(main[0]):
                d = px_len(nodes, i, j)
                if d < best[0]:
                    best = (d, i, j)
        d, i, j = best
        chain = add_link(nodes, edges, i, j, 'unclassified')
        # A ruled line across a field, not a road anyone drew. It makes the place reachable and
        # that is all it does. Deep Forest's is one: it wants a proper drawn road.
        links.append({'kind': 'repair', 'cls': 'unclassified', 'chain': chain, 'px': round(d, 1), 'serves': names,
                      'via': 'a straight link',
                      'note': 'a straight line across the fields, not a drawn road: wants a proper road drawn for ' + ', '.join(names)})


def apply_fixes(nodes0, edges0, anchors):
    """Heal the skeleton's gaps, then join stranded destinations (see FIXES)."""
    nodes, edges, links = heal_gaps(nodes0, edges0)
    nodes, edges, more = repair_links(nodes, edges, anchors, anchors['arc'], svg_ways())
    return nodes, edges, links + more


HEAL_CLASSES = ('trunk', 'secondary', 'tertiary')
HEAL_PX = 40.0


def add_link(nodes, edges, i, j, cls):
    """A straight link from node i to node j, cut to the graph's own grain.
    Returns the chain of node indices (nodes and edges are extended in place)."""
    d = px_len(nodes, i, j)
    steps = max(1, int(round(d / LINK_STEP)))
    chain = [i]
    for k in range(1, steps):
        t = k / steps
        nodes.append((round(nodes[i][0] + (nodes[j][0] - nodes[i][0]) * t, 5),
                      round(nodes[i][1] + (nodes[j][1] - nodes[i][1]) * t, 5)))
        chain.append(len(nodes) - 1)
    chain.append(j)
    for k in range(len(chain) - 1):
        edges[(min(chain[k], chain[k + 1]), max(chain[k], chain[k + 1]))] = cls
    return chain


def heal_gaps(nodes, edges, classes=HEAL_CLASSES, max_px=HEAL_PX):
    """The A28 is in four pieces in the shipped graph (gaps of 9, 23 and 27
    map units) so the trunk road cannot be driven end to end: routes detour
    down side streets and the road-type profile flickers. Join the pieces of
    each skeleton class where an end lies within max_px of another piece of
    the same class, nearest gap first, never closing a loop between pieces
    already joined."""
    nodes, edges, links = list(nodes), dict(edges), []
    for cls in classes:
        sub = {e: c for e, c in edges.items() if c == cls}
        comps = components(sub)
        piece = {n: i for i, (ns, _) in enumerate(comps) for n in ns}
        deg = degrees(sub)
        cands = []
        for n in sorted(piece):
            if deg[n] != 1:
                continue
            for k in sorted(piece):
                if piece[k] != piece[n]:
                    d = px_len(nodes, n, k)
                    if d <= max_px:
                        cands.append((d, n, k))
        cands.sort()
        uf = list(range(len(comps)))

        def find(x):
            while uf[x] != x:
                uf[x] = uf[uf[x]]
                x = uf[x]
            return x
        for d, n, k in cands:
            a, b = find(piece[n]), find(piece[k])
            if a != b:
                uf[a] = b
                chain = add_link(nodes, edges, n, k, cls)
                links.append({'kind': 'heal', 'cls': cls, 'chain': chain, 'px': round(d, 1), 'serves': [], 'via': 'a straight link'})
    return nodes, edges, links


ACCESS_PENALTY = {'track': 4.0}   # cost multiplier when ADDING a non-kept edge


def connect_pieces(nodes, kept, universe, anchors, arc_node, sig_px):
    """Grow the kept set until every piece that matters touches the shelter's.
    A piece matters if it holds a destination or is at least sig_px long.
    Each step adds the cheapest path of non-kept edges (residential before
    track) from the shelter's piece to the nearest other piece that matters:
    a residential road kept only because nothing else gets you there."""
    kept = dict(kept)
    uni_adj = adjacency(universe)
    anchor_nodes = set(anchors.values())
    while True:
        comps = components(kept)
        main = next((c for c in comps if arc_node in c[0]), None)
        if main is None:                          # the shelter sits on a dropped road
            main = ({arc_node}, set())
        targets = {}
        for idx, (ns, es) in enumerate(comps):
            if arc_node in ns:
                continue
            if ns & anchor_nodes or sum(px_len(nodes, a, b) for a, b in es) >= sig_px:
                for n in ns:
                    targets[n] = idx
        for n in sorted(anchor_nodes):           # a destination whose road was dropped
            if n not in main[0] and n not in targets:
                targets[n] = -1
        if not targets:
            return kept
        dist = {n: 0.0 for n in main[0]}
        prev = {}
        heap = [(0.0, n) for n in sorted(main[0])]
        heapq.heapify(heap)
        hit = None
        while heap:
            d, u = heapq.heappop(heap)
            if d > dist.get(u, math.inf):
                continue
            if u in targets:
                hit = u
                break
            for v, cls in sorted(uni_adj[u].items()):
                key = (min(u, v), max(u, v))
                w = 0.0 if key in kept else px_len(nodes, u, v) * ACCESS_PENALTY.get(cls, 1.0)
                nd = d + w
                if nd < dist.get(v, math.inf):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(heap, (nd, v))
        if hit is None:
            # Nothing left can be reached: drop the unreachable pieces, so no
            # road is kept that the van cannot use.
            return kept
        u = hit
        while u not in main[0]:
            p = prev[u]
            key = (min(u, p), max(u, p))
            kept[key] = universe[key]
            u = p


def edge_betweenness(nodes, edges):
    """Brandes edge betweenness on the chain graph (one edge per road), length
    weighted. Returns {chain index: score}."""
    chains = build_chains(edges)
    cadj = collections.defaultdict(list)
    for ci, (cls, path) in enumerate(chains):
        w = chain_px(nodes, path)
        cadj[path[0]].append((path[-1], w, ci))
        if path[0] != path[-1]:
            cadj[path[-1]].append((path[0], w, ci))
    score = collections.defaultdict(float)
    vs = sorted(cadj)
    for s in vs:
        order, sigma, dist = [], {s: 1.0}, {s: 0.0}
        preds = collections.defaultdict(list)
        heap = [(0.0, s)]
        done = set()
        while heap:
            d, u = heapq.heappop(heap)
            if u in done:
                continue
            done.add(u)
            order.append(u)
            for v, w, ci in cadj[u]:
                nd = d + w
                if nd < dist.get(v, math.inf) - 1e-9:
                    dist[v] = nd
                    sigma[v] = sigma[u]
                    preds[v] = [(u, ci)]
                    heapq.heappush(heap, (nd, v))
                elif abs(nd - dist.get(v, math.inf)) <= 1e-9 and v not in done:
                    sigma[v] += sigma[u]
                    preds[v].append((u, ci))
        delta = collections.defaultdict(float)
        for v in reversed(order):
            for u, ci in preds[v]:
                c = sigma[u] / sigma[v] * (1.0 + delta[v])
                score[ci] += c
                delta[u] += c
    return chains, score


def streets_of(nodes, chains, max_turn=35.0):
    """Join chains end to end wherever two meet at a junction and carry on
    nearly straight (within max_turn degrees), the 'good continuation' that
    makes a run of city blocks one street. Returns a list of chain-index lists.
    Blocks in a grid are separate chains, so this is what recovers a street."""
    ends = collections.defaultdict(list)
    for ci, (cls, path) in enumerate(chains):
        for which, seq in ((0, path), (1, path[::-1])):
            k, acc = 1, 0.0
            while k < len(seq) - 1 and acc < 20.0:
                acc += px_len(nodes, seq[k - 1], seq[k])
                k += 1
            vx = (nodes[seq[k]][0] - nodes[seq[0]][0]) * VIEW_W
            vy = (nodes[seq[k]][1] - nodes[seq[0]][1]) * VIEW_H
            norm = math.hypot(vx, vy) or 1.0
            ends[seq[0]].append((ci, which, (vx / norm, vy / norm)))
    parent = list(range(len(chains)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for node in sorted(ends):
        lst = ends[node]
        pairs = []
        for i in range(len(lst)):
            for j in range(i + 1, len(lst)):
                (ca, wa, va), (cb, wb, vb) = lst[i], lst[j]
                if ca == cb:
                    continue
                turn = math.degrees(math.acos(max(-1.0, min(1.0, -(va[0] * vb[0] + va[1] * vb[1])))))
                if turn <= max_turn:
                    pairs.append((turn, i, j))
        used = set()
        for turn, i, j in sorted(pairs):
            if i not in used and j not in used:
                used.update((i, j))
                parent[find(lst[i][0])] = find(lst[j][0])
    groups = collections.defaultdict(list)
    for ci in range(len(chains)):
        groups[find(ci)].append(ci)
    return [sorted(g) for _, g in sorted(groups.items())]


def add_streets(nodes, kept, universe, max_segments, min_px):
    """Add back the busiest residential streets, so towns still read as towns.
    A street is a run of blocks that carry on straight (streets_of). Grows
    outward from the kept network: each step takes the street with the highest
    mean edge betweenness that touches what is already kept, until the kept
    set reaches max_segments. Betweenness is length-weighted over the whole
    graph, so what comes back are the streets most journeys would use."""
    kept = dict(kept)
    chains, score = edge_betweenness(nodes, universe)
    res = [i for i, (cls, _) in enumerate(chains) if cls == 'residential']
    cand = []
    for grp in streets_of(nodes, [chains[i] for i in res]):
        idx = [res[g] for g in grp]
        length = sum(chain_px(nodes, chains[i][1]) for i in idx)
        if length < min_px:
            continue
        mean_b = sum(score[i] * chain_px(nodes, chains[i][1]) for i in idx) / length
        cand.append((-mean_b, idx[0], idx))
    cand.sort()
    on = {n for e in kept for n in e}
    while len(kept) < max_segments:
        pick = None
        for item in cand:
            idx = item[2]
            nodes_of = {n for i in idx for n in chains[i][1]}
            keys = [k for i in idx for k in chain_keys(chains[i][1]) if k not in kept]
            if nodes_of & on and keys and len(kept) + len(keys) <= max_segments:
                pick = item
                break
        if pick is None:
            break
        cand.remove(pick)
        for i in pick[2]:
            for k in chain_keys(chains[i][1]):
                kept[k] = universe[k]
            on.update(chains[i][1])
    return kept


# ──────────────────────────── candidates ────────────────────────────

# Each candidate is data; build_candidate reads it in this order.
#   keep     classes kept wholesale (None: everything)
#   fixes    heal the A28's gaps, and join stranded destinations (see REPAIR)
#   access   keep whatever else is the cheapest way to reach a destination
#   stubs    prune dead-end stubs shorter than this many map units
#   streets  (max segments, min street length) to add back busy residential streets
CANDIDATES = [
    {'key': 'A', 'title': 'Collapse only',
     'blurb': 'Degree-2 chains folded into roads. Nothing you can drive changes.',
     'keep': None, 'fixes': False, 'access': False, 'stubs': 0, 'streets': None},
    {'key': 'B', 'title': 'Safe levers',
     'blurb': 'A, plus tracks out (bar the one to Cove Harbour), every dead end that leads nowhere out, and the two fixes.',
     'keep': {'trunk', 'secondary', 'tertiary', 'unclassified', 'residential'}, 'fixes': True,
     'access': True, 'stubs': 100000, 'streets': None},
    {'key': 'C', 'title': 'Skeleton + access',
     'blurb': 'Trunk, secondary and tertiary roads. Anything else only where it is the way in.',
     'keep': {'trunk', 'secondary', 'tertiary'}, 'fixes': True,
     'access': True, 'stubs': 90, 'streets': None},
    {'key': 'D', 'title': 'Skeleton + lanes + town streets',
     'blurb': 'C, plus the unclassified country lanes and the busiest through-street of each town.',
     'keep': {'trunk', 'secondary', 'tertiary', 'unclassified'}, 'fixes': True,
     'access': True, 'stubs': 90, 'streets': (1100, 80.0)},
]


def snap_anchors(nodes0, dests):
    """Destinations snap on the ORIGINAL node list and those nodes are protected
    throughout: pruning can then never move where a destination snaps to."""
    return {d['id']: nearest_node(nodes0, d['fx'], d['fy'])[0] for d in dests}


def build_candidate(spec, nodes0, edges0, anchors, fixed):
    """Run one candidate's pipeline. `fixed` is apply_fixes' result, computed
    once. Returns the finished graph as a dict."""
    nodes, edges, links = (fixed if spec['fixes'] else (list(nodes0), dict(edges0), []))
    arc_node = anchors['arc']
    universe = dict(edges)
    if spec['keep'] is not None:
        edges = {e: c for e, c in edges.items() if c in spec['keep']}
    protected = set(anchors.values())
    if spec['stubs']:
        edges = prune_stubs(nodes, edges, protected, spec['stubs'])
    if spec['access']:
        edges = connect_pieces(nodes, edges, universe, anchors, arc_node, sig_px=120.0)
    if spec['streets']:
        edges = add_streets(nodes, edges, universe, *spec['streets'])
    if spec['stubs']:
        edges = prune_stubs(nodes, edges, protected, spec['stubs'])
    if spec['access'] or spec['fixes']:
        # A kept piece the shelter cannot reach is a road the child sees and
        # the van can never use.
        edges = keep_arc_component(edges, arc_node)
    return finish(nodes, edges, anchors, links, spec)


def finish(nodes, edges, anchors, links, spec):
    """Compact node indices, build roads, remap anchors and links."""
    used = sorted({n for e in edges for n in e})
    remap = {old: new for new, old in enumerate(used)}
    new_nodes = [[round(nodes[o][0], 5), round(nodes[o][1], 5)] for o in used]
    cls_of = {(remap[a], remap[b]): c for (a, b), c in edges.items()}
    new_edges = sorted(cls_of)
    keep_nodes = {remap[v] for v in anchors.values() if v in remap}
    roads = [[c, p] for c, p in build_chains(cls_of, keep_nodes)]
    kept_links = []
    for l in links:
        if all(n in remap for n in l['chain']):
            kept_links.append({'kind': l['kind'], 'cls': l['cls'], 'px': l['px'], 'serves': l['serves'],
                               'via': l.get('via', 'a straight link'), 'nodes': [remap[n] for n in l['chain']],
                               **({'note': l['note']} if 'note' in l else {})})
    return {
        'version': 2,
        'candidate': spec['key'],
        'nodes': new_nodes,
        'edges': [[a, b, cls_of[(a, b)]] for a, b in new_edges],
        'roads': roads,
        'anchors': {aid: remap.get(old) for aid, old in anchors.items()},
        'meta': {'title': spec['title'], 'links': kept_links},
    }


# ───────────────────────────── evidence ─────────────────────────────

def graph_from_dict(g):
    nodes = [(x, y) for x, y in g['nodes']]
    edges = {(min(a, b), max(a, b)): c for a, b, c in g['edges']}
    return nodes, edges


def real_degree(edges):
    """junctions.ts realDegrees: minor classes do not make a fork."""
    d = collections.Counter()
    for (a, b), cls in edges.items():
        if cls not in MINOR_CLASSES:
            d[a] += 1
            d[b] += 1
    return d


def evaluate(nodes, edges, dests):
    """Counts, plus the router replica's route to every destination."""
    deg = degrees(edges)
    adj = adjacency(edges)
    rdeg = real_degree(edges)
    stats = {
        'segments': len(edges),
        'roads': len(build_chains(edges)),
        'junctions': sum(1 for d in deg.values() if d >= 3),
        'dead_ends': sum(1 for d in deg.values() if d == 1),
        'geometry_points': sum(1 for d in deg.values() if d == 2),
        'px_total': round(sum(px_len(nodes, a, b) for a, b in edges)),
        'by_class': dict(sorted(collections.Counter(edges.values()).items())),
    }
    arc = next(d for d in dests if d['id'] == 'arc')
    s, _ = nearest_node(nodes, arc['fx'], arc['fy'])
    routes = {}
    for d in dests:
        t, snap = nearest_node(nodes, d['fx'], d['fy'])
        path = shortest_path(nodes, adj, s, t) if (s == t or s in adj) else None
        r = {'snap_px': round(snap * VIEW_H, 1), 'reachable': path is not None}
        if path:
            r['px'] = round(sum(px_len(nodes, path[i], path[i + 1]) for i in range(len(path) - 1)))
            r['forks'] = sum(1 for n in path if rdeg[n] > 2)   # junctions.ts counts every route node, ends included
            cl = collections.Counter()
            for i in range(len(path) - 1):
                cl[edges[(min(path[i], path[i + 1]), max(path[i], path[i + 1]))]] += px_len(nodes, path[i], path[i + 1])
            r['classes'] = {c: round(v) for c, v in sorted(cl.items(), key=lambda kv: -kv[1])}
        routes[d['id']] = r
    stats['routes'] = routes
    stats['reachable'] = sum(1 for r in routes.values() if r['reachable'])
    return stats


def map_extent(dests, level):
    """GameScene's visible frame at a player level: a mirror of mapExtentFor."""
    arc = next(d for d in dests if d['id'] == 'arc')
    open_ = [d for d in dests if d['level'] <= level]
    xs = [d['fx'] for d in open_] or [arc['fx']]
    ys = [d['fy'] for d in open_] or [arc['fy']]
    if any(d['id'] == 'arc' for d in open_):
        ys = ys + [arc['fy'] - 0.08]
    t = max(0.0, min(1.0, level / 10))
    half = min(0.5, max(0.28 + (0.5 - 0.28) * t, max(max(xs) - min(xs), max(ys) - min(ys)) / 2 + 0.06))
    clamp = lambda v: max(half, min(1 - half, v))
    return clamp((min(xs) + max(xs)) / 2), clamp((min(ys) + max(ys)) / 2), half


def junctions_in_window(nodes, edges, win):
    cx, cy, half = win
    return sum(1 for n, d in degrees(edges).items() if d >= 3
               and abs(nodes[n][0] - cx) <= half and abs(nodes[n][1] - cy) <= half)


def drawn_not_driven(svg_text=None):
    """Roads the map drew that the graph never had: no route could use them. Read
    from the OSM layer, because the live map no longer draws them."""
    svg = svg_text if svg_text is not None else OSM_ROADS_IN.read_text()
    c = collections.Counter()
    seen = set()
    for m in re.finditer(r'<path\b([^>]*)>', svg):
        cls = re.search(r'data-cls="([^"]*)"', m.group(1))
        d = re.search(r'\bd="([^"]+)"', m.group(1))
        if cls and d and cls.group(1) in UNDRIVABLE_DRAWN and d.group(1) not in seen:
            seen.add(d.group(1))
            c[cls.group(1)] += 1
    return c


# ───────────────────────────── drawing ─────────────────────────────

FONT_FILES = ['/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/Supplemental/Arial.ttf',
              '/Library/Fonts/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']


def font(size, bold=False):
    from PIL import ImageFont
    for p in FONT_FILES:
        try:
            return ImageFont.truetype(p, size, index=1 if (bold and p.endswith('.ttc')) else 0)
        except OSError:
            continue
    return ImageFont.load_default(size)


def road_markup(nodes, roads):
    """The graph's roads as SVG, in the map's own classes, colours and widths."""
    def d_of(path):
        return 'M' + 'L'.join(f'{nodes[i][0] * VIEW_W:.1f},{nodes[i][1] * VIEW_H:.1f}' for i in path)
    styled = {k for k, *_ in ROAD_STYLE}
    by = collections.defaultdict(list)
    for cls, path in roads:
        by[cls if cls in styled else 'residential'].append(path)
    out = []
    for key, colour, width, dash in ROAD_STYLE:
        cls = 'trunk' if key.startswith('trunk') else key
        if not by.get(cls):
            continue
        attrs = f'stroke="{colour}" stroke-width="{width}" fill="none" stroke-linecap="round" stroke-linejoin="round"'
        if dash:
            attrs += f' stroke-dasharray="{dash}"'
        if key == 'trunk-outline':
            attrs += ' opacity="0.85"'
        out.append(f'<g id="roads-{key}" {attrs}>' + ''.join(f'<path d="{d_of(p)}"/>' for p in by[cls]) + '</g>')
    return '\n'.join(out)


def pin_markup(dests):
    """Numbered pins; the shelter is the blue one."""
    out, n = [], 0
    face = 'font-family="Helvetica,Arial,sans-serif" font-weight="bold" text-anchor="middle"'
    for d in dests:
        x, y = d['fx'] * VIEW_W, d['fy'] * VIEW_H
        if d['id'] == 'arc':
            out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="19" fill="#1c6ea4" stroke="#fff" stroke-width="4"/>'
                       f'<text x="{x:.0f}" y="{y + 7:.0f}" font-size="20" fill="#fff" {face}>A</text>')
        else:
            n += 1
            out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="16" fill="#d6336c" stroke="#fff" stroke-width="3.5"/>'
                       f'<text x="{x:.0f}" y="{y + 6.5:.0f}" font-size="18" fill="#fff" {face}>{n}</text>')
    return ''.join(out)


def link_markup(nodes, links):
    """Synthetic links in red, so each can be looked at and argued with."""
    out = ''
    for l in links:
        pts = ' '.join(f'{nodes[i][0] * VIEW_W:.1f},{nodes[i][1] * VIEW_H:.1f}' for i in l['nodes'])
        out += f'<polyline points="{pts}" fill="none" stroke="#e03131" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
    return out


ROAD_GROUP = '<g id="roads-'
ROAD_BLOCK = re.compile(r'(?:' + re.escape(ROAD_GROUP) + r'[^"]*"[^>]*>.*?</g>\n)+', re.S)


def split_roads(svg):
    """(before, road layer, after). The road layer is the run of <g id="roads-*">
    groups, which the map keeps in one block; this refuses a file where they are
    not, because replacing 'the road layer' would then mean guessing."""
    blocks = list(ROAD_BLOCK.finditer(svg))
    if len(blocks) != 1 or blocks[0].group(0).count(ROAD_GROUP) != svg.count(ROAD_GROUP):
        raise SystemExit('the road groups in the map are not one contiguous block: fix split_roads, do not guess')
    return svg[:blocks[0].start()], blocks[0].group(0), svg[blocks[0].end():]


def splice_roads(svg, markup):
    """The map with its road layer replaced by `markup`. Everything else in the
    file, the landmarks, labels, seasons and animations, is carried through
    byte for byte, and that is asserted: a road swap must never touch art."""
    before, _, after = split_roads(svg)
    out = before + markup.rstrip('\n') + '\n' + after
    again = split_roads(out)
    assert again[0] == before and again[2] == after, 'splice_roads changed something outside the road layer'
    return out


def osm_roads_markup():
    """Today's roads as the map drew them: the OSM layer, every class."""
    return split_roads(OSM_ROADS_IN.read_text())[1]


def map_svg(dests, nodes=None, roads=None, links=()):
    """The whole map, the live one, with its road layer drawn from the graph's
    roads (or, if no graph is given, as OpenStreetMap had it), plus pins, plus
    red links. Only the road layer differs from SVG_IN; pins and links are
    appended after it and are for the comparison images, never for installing
    (--svg passes none)."""
    svg = splice_roads(SVG_IN.read_text(), road_markup(nodes, roads) if roads is not None else osm_roads_markup())
    over = (link_markup(nodes, links) if roads is not None else '') + pin_markup(dests)
    assert svg.rstrip().endswith('</svg>')
    return svg.rstrip()[:-len('</svg>')] + over + '</svg>'


def rasterise(svg_text, width):
    import io
    import cairosvg
    from PIL import Image
    png = cairosvg.svg2png(bytestring=svg_text.encode(), url=str(SVG_IN), output_width=width)
    return Image.open(io.BytesIO(png)).convert('RGB')


def sheet(panels, cols, pw, gap=14, head=146):
    """Panels are (title, [lines], PIL image pw wide). A panel with no title is a
    bare image that fills its cell."""
    from PIL import Image, ImageDraw
    rows = (len(panels) + cols - 1) // cols
    ph = max(p[2].height + (head if p[0] else 0) for p in panels)
    W = cols * pw + (cols + 1) * gap
    H = rows * ph + (rows + 1) * gap
    canvas = Image.new('RGB', (W, H), '#f4efe6')
    d = ImageDraw.Draw(canvas)
    for k, (title, lines, im) in enumerate(panels):
        x = gap + (k % cols) * (pw + gap)
        y = gap + (k // cols) * (ph + gap)
        d.rectangle([x, y, x + pw, y + ph], fill='#ffffff', outline='#d8cfbd')
        if title:
            d.text((x + 12, y + 8), title, font=font(27, True), fill='#1f2933')
            for j, ln in enumerate(lines):
                d.text((x + 12, y + 44 + 24 * j), ln, font=font(18), fill='#52606d')
            canvas.paste(im, (x, y + head))
        else:
            canvas.paste(im, (x, y))
    return canvas


# ───────────────────────────── checks & output ─────────────────────────────

def validate(g):
    """The one-graph guarantee: what is drawn (roads) and what is driven (edges)
    are the same lines; and the file has no orphan nodes (the router snaps to
    every node in the list, drawn or not)."""
    from_roads = set()
    for cls, path in g['roads']:
        for k in chain_keys(path):
            assert k not in from_roads, f'edge {k} is in two roads'
            from_roads.add(k)
    assert from_roads == {(min(a, b), max(a, b)) for a, b, _ in g['edges']}, 'roads and edges differ'
    n = len(g['nodes'])
    assert all(0 <= a < n and 0 <= b < n for a, b, _ in g['edges']), 'edge index out of range'
    assert len({(min(a, b), max(a, b)) for a, b, _ in g['edges']}) == len(g['edges']), 'duplicate edge'
    assert not any(a == b for a, b, _ in g['edges']), 'self loop'
    assert {i for a, b, _ in g['edges'] for i in (a, b)} == set(range(n)), 'orphan nodes'


def median(xs):
    xs = sorted(xs)
    k = len(xs) // 2
    return xs[k] if len(xs) % 2 else (xs[k - 1] + xs[k]) / 2


def summarise(ev, base):
    """Headline numbers that compare a graph with today's."""
    ids = [d for d, r in ev['routes'].items() if d != 'arc' and r['reachable']]
    both = [d for d in ids if base['routes'][d]['reachable']]
    return {
        'forks_median': median([ev['routes'][d]['forks'] for d in ids]),
        'forks_max': max(ev['routes'][d]['forks'] for d in ids),
        'detour_median': round(median([ev['routes'][d]['px'] / base['routes'][d]['px'] for d in both]), 2),
        'detour_max': round(max(ev['routes'][d]['px'] / base['routes'][d]['px'] for d in both), 2),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--graph', default=str(GRAPH_IN), help='the full graph to simplify (read only)')
    ap.add_argument('--out', default=str(OUT_DIR), help='where candidates, report and images go')
    ap.add_argument('--destinations', default=str(DEST_TS), help='the destinations.ts to read (default: the working tree)')
    ap.add_argument('--no-images', action='store_true')
    ap.add_argument('--svg', action='store_true', help='also write birchie-roads.<key>.svg: the map with its roads drawn from the candidate')
    ap.add_argument('--check', metavar='FILE', help='verify reachability of one graph file and exit')
    args = ap.parse_args()
    dests = load_destinations(args.destinations)

    if args.check:
        g = json.load(open(args.check))
        nodes = [(x, y) for x, y in g['nodes']]
        edges = {(min(row[0], row[1]), max(row[0], row[1])): row[2] for row in g['edges']}
        ev = evaluate(nodes, edges, dests)
        bad = [d for d, r in ev['routes'].items() if not r['reachable']]
        print(f"{args.check}: {ev['reachable']}/{len(dests)} destinations reachable from the shelter")
        for d in bad:
            print('  UNREACHABLE:', d)
        sys.exit(1 if bad else 0)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    nodes0, edges0 = load_graph(args.graph)
    anchors = snap_anchors(nodes0, dests)
    fixed = apply_fixes(nodes0, edges0, anchors)
    base = evaluate(nodes0, edges0, dests)
    wins = {lv: map_extent(dests, lv) for lv in (0, 10)}
    results = []
    for spec in CANDIDATES:
        g = build_candidate(spec, nodes0, edges0, anchors, fixed)
        validate(g)
        nodes, edges = graph_from_dict(g)
        ev = evaluate(nodes, edges, dests)
        ev.update(summarise(ev, base))
        ev['win0'] = junctions_in_window(nodes, edges, wins[0])
        ev['px_kept'] = round(100 * ev['px_total'] / base['px_total'])
        results.append((spec, g, ev))
        (out / f"birchie-graph.{spec['key']}.json").write_text(json.dumps(g, separators=(',', ':')) + '\n')
        if args.svg:
            (out / f"birchie-roads.{spec['key']}.svg").write_text(map_svg([], nodes, g['roads'], []))
    base.update(summarise(base, base))
    base['win0'] = junctions_in_window(nodes0, edges0, wins[0])
    base['px_kept'] = 100

    write_report(out / 'report.txt', dests, base, results, wins)
    print((out / 'report.txt').read_text())
    if not args.no_images:
        make_images(out, dests, nodes0, edges0, base, results)


def fmt_counts(ev):
    return f"{ev['segments']:,} segments · {ev['roads']:,} roads · {ev['junctions']} junctions"


def write_report(path, dests, base, results, wins):
    n = len(dests)
    L = []
    L.append('ROAD GRAPH CANDIDATES   (generated by tools/simplify-road-graph.py; do not edit)')
    L.append(f'destinations parsed from destinations.ts: {n}  ({", ".join(d["id"] for d in dests)})')
    L.append(f'level-0 map window (fractions of the map): cx {wins[0][0]:.2f} cy {wins[0][1]:.2f} half {wins[0][2]:.2f}')
    L.append('')
    head = f"{'':24s}{'segments':>9s}{'roads':>7s}{'junct.':>7s}{'dead':>6s}{'reach':>8s}{'forks/route':>13s}{'detour':>13s}{'L0 junct.':>10s}{'road kept':>10s}"
    L.append(head)
    rows = [('today', base)] + [(f"{s['key']} {s['title']}", e) for s, _, e in results]
    for name, e in rows:
        L.append(f"{name[:23]:24s}{e['segments']:>9,}{e['roads']:>7,}{e['junctions']:>7}{e['dead_ends']:>6}"
                 f"{str(e['reachable']) + '/' + str(n):>8s}{'%g / %g' % (e['forks_median'], e['forks_max']):>13s}"
                 f"{'%.2f / %.2f' % (e['detour_median'], e['detour_max']):>13s}{e['win0']:>10}{str(e['px_kept']) + '%':>10s}")
    L.append('  forks/route: decisions (nodes where more than two real roads meet) on the shelter-to-destination route, median / max')
    L.append('  detour: route length against today\'s route, median / max (destinations reachable today)')
    L.append('  L0 junct.: junctions inside the level-0 map window; road kept: share of today\'s road length')
    L.append('')
    L.append('BY CLASS (segments)')
    classes = sorted({c for _, e in rows for c in e['by_class']})
    L.append(f"{'':24s}" + ''.join(f'{c:>13s}' for c in classes))
    for name, e in rows:
        L.append(f"{name[:23]:24s}" + ''.join(f"{e['by_class'].get(c, 0):>13}" for c in classes))
    L.append('')
    L.append('DESTINATIONS   reachable | snap px | route px | forks      (snap: distance from the pin to the node the van drives to)')
    L.append(f"{'':18s}" + ''.join(f'{name.split()[0]:>20s}' for name, _ in rows))
    for d in dests:
        if d['id'] == 'arc':
            continue
        cells = []
        for _, e in rows:
            r = e['routes'][d['id']]
            cells.append(f"{'yes' if r['reachable'] else 'NO':>3s} {r['snap_px']:>5.0f} {r.get('px', 0):>5} {r.get('forks', 0):>3}")
        L.append(f"{d['id']:18s}" + ''.join(f'{c:>20s}' for c in cells))
    L.append('')
    L.append('SYNTHETIC LINKS (drawn red on the images; each is a place the shipped graph has a gap)')
    seen = set()
    for spec, g, _ in results:
        for l in g['meta']['links']:
            key = (l['kind'], l['px'], tuple(l['serves']), l['cls'])
            if key in seen:
                continue
            seen.add(key)
            what = (('stranded destination: ' + ', '.join(l['serves']) + ', along ' + l['via']) if l['kind'] == 'repair'
                    else 'gap in the ' + l['cls'] + ' road, ' + l['via'])
            L.append(f"  {l['kind']:7s} {l['px']:>5} px  {what}" + (' (wants a proper drawn road)' if l.get('note') else ''))
    L.append('')
    dnd = drawn_not_driven()
    L.append('DRAWN TODAY BUT NEVER DRIVEN (in birchie-roads.svg, absent from the graph): '
             + ', '.join(f'{c} {k}' for k, c in sorted(dnd.items())) + f'  = {sum(dnd.values())} roads')
    path.write_text('\n'.join(L) + '\n')


def wrap_text(text, fnt, width):
    from PIL import Image, ImageDraw
    d = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    lines, cur = [], ''
    for w in text.split():
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=fnt) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + [cur]


def legend_image(dests, pw, ph, notes):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (pw, ph), '#ffffff')
    d = ImageDraw.Draw(im)
    y = 10
    d.text((12, y), 'How to read the maps', font=font(24, True), fill='#1f2933')
    y += 42
    names = [dd for dd in dests if dd['id'] != 'arc']
    d.ellipse([12, y, 36, y + 24], fill='#1c6ea4')
    d.text((46, y + 1), 'A.R.C., where every route starts', font=font(18), fill='#1f2933')
    y += 32
    for k, dd in enumerate(names, 1):
        col, row = (k - 1) // 7, (k - 1) % 7
        x = 12 + col * (pw // 2)
        d.ellipse([x, y + row * 28, x + 24, y + row * 28 + 24], fill='#d6336c')
        d.text((x + 12 - 5 * len(str(k)) / 1.0 * 0.9, y + row * 28 + 2), str(k), font=font(15, True), fill='#ffffff')
        d.text((x + 34, y + row * 28 + 2), dd['label'], font=font(17), fill='#1f2933')
    y += 7 * 28 + 14
    for n in notes:
        for ln in wrap_text(n, font(16), pw - 28):
            d.text((14, y), ln, font=font(16), fill='#52606d')
            y += 21
        y += 7
    return im


def make_images(out, dests, nodes0, edges0, base, results):
    pw = 700
    n = len(dests)
    f18 = font(18)
    panels = []
    today = rasterise(map_svg(dests), pw)
    dnd = sum(drawn_not_driven().values())
    panels.append(('Today (as drawn)', [fmt_counts(base),
                                        f"{base['reachable']}/{n} reachable · {base['forks_median']:g} forks per route",
                                        f'{dnd} footpaths and service roads are drawn that no route can use'], today))
    for spec, g, ev in results:
        nodes, _ = graph_from_dict(g)
        im = rasterise(map_svg(dests, nodes, g['roads'], g['meta']['links']), pw)
        lines = [fmt_counts(ev), f"{ev['reachable']}/{n} reachable · {ev['forks_median']:g} forks per route · {ev['px_kept']}% of the road"]
        lines += wrap_text(spec['blurb'], f18, pw - 24)[:2]
        panels.append((f"{spec['key']}  {spec['title']}", lines, im))
    notes = ['Forks per route: the nodes on the shelter-to-destination route where more than two real roads meet, the same test junctions.ts uses to ask the child to steer. Median over the destinations.',
             'Red: a link this tool added. Each one is a gap in today\'s data (the A28 is in four pieces; Cove Harbour and Deep Forest are cut off from the network). They are in meta.links and can be argued with.',
             'Brown: a farm track kept because it is the only road to Cove Harbour, Moorland and the hog hospital. The OSM map painted tracks in near-farmland cream, which would hide them.']
    panels.append(('', [], legend_image(dests, pw, today.height + 146, notes)))
    sheet_im = sheet(panels, 3, pw)
    sheet_im.save(out / 'map-candidates.jpg', quality=78, optimize=True, progressive=True)

    # What a child sees at once on an iPhone: a 375 x 812 window, one map unit to one point.
    wx, wy, ww, wh = 150, 60, 375, 812
    cells = []
    full = [('Today', base, rasterise(map_svg(dests), 1800))]
    for spec, g, ev in results:
        if spec['key'] == 'A':
            continue
        nodes, _ = graph_from_dict(g)
        full.append((f"{spec['key']}  {spec['title']}"[:26], ev, rasterise(map_svg(dests, nodes, g['roads'], g['meta']['links']), 1800)))
    for name, ev, im in full:
        cells.append((name, [f"{ev['win0']} junctions in the level-0 view"], im.crop((wx, wy, wx + ww, wy + wh))))
    sheet(cells, len(cells), ww, head=84).save(out / 'map-candidates-iphone.jpg', quality=80, optimize=True, progressive=True)


if __name__ == '__main__':
    main()
