#!/usr/bin/env python3
"""
build-road-graph.py — extract a routable road graph from birchie-roads.svg.

Parses the drivable road <path>s (absolute polylines in the 1800x1121 viewBox),
samples them into points, snaps shared endpoints into junction nodes, and emits
a compact JSON graph (node positions as 0..1 map fractions + edges) that the GPS
router loads. Also renders a verification PNG of the graph over the map.

Deps: svgpathtools (present on this machine). Offline data-prep, run by hand.
"""
import json
import re
import math
from svgpathtools import parse_path

SVG = 'apps/game/public/admin/scene-assets/birchie-map/birchie-roads.svg'
OUT = 'apps/game/public/assets/driving/birchie-graph.json'
VIEW_W, VIEW_H = 1800.0, 1121.0
DRIVABLE = {'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
            'residential', 'living_street', 'track'}
SAMPLE_STEP = 14.0   # viewBox units between sampled points along a road
SNAP = 13.0          # junction snap tolerance (viewBox units) — heals gaps
BRIDGE = 18.0        # connect near-but-unmerged endpoints (junction healing)

svg = open(SVG).read()

# Each drivable path: capture its class + d. Roads are drawn as outline+fill
# duplicates, so dedupe identical d strings.
paths = []
seen_d = set()
for m in re.finditer(r'<path\b([^>]*)>', svg):
    attrs = m.group(1)
    cls_m = re.search(r'data-cls="([^"]*)"', attrs)
    d_m = re.search(r'\bd="([^"]+)"', attrs)
    if not cls_m or not d_m:
        continue
    cls = cls_m.group(1)
    if cls not in DRIVABLE:
        continue
    d = d_m.group(1)
    if d in seen_d:
        continue
    seen_d.add(d)
    paths.append((cls, d))

print(f'drivable paths (deduped): {len(paths)}')

# Sample each path into points (viewBox coords).
def sample(d):
    try:
        p = parse_path(d)
    except Exception:
        return []
    total = p.length(error=1e-2)
    if total <= 0:
        return []
    n = max(2, int(total / SAMPLE_STEP) + 1)
    pts = []
    for i in range(n + 1):
        z = p.point(p.ilength(min(total, total * i / n), s_tol=1e-2)) if False else p.point(i / n)
        pts.append((z.real, z.imag))
    return pts

# Snap points to a grid so shared junctions merge into one node.
node_index = {}
nodes = []  # (x, y)
def node_id(x, y):
    key = (round(x / SNAP), round(y / SNAP))
    if key in node_index:
        return node_index[key]
    nid = len(nodes)
    node_index[key] = nid
    nodes.append((x, y))
    return nid

edges = []  # (a, b, cls)
edge_seen = set()
for cls, d in paths:
    pts = sample(d)
    prev = None
    for (x, y) in pts:
        if not (0 <= x <= VIEW_W and 0 <= y <= VIEW_H):
            prev = None  # skip out-of-frame stretches
            continue
        nid = node_id(x, y)
        if prev is not None and prev != nid:
            key = (min(prev, nid), max(prev, nid))
            if key not in edge_seen:
                edge_seen.add(key)
                edges.append((prev, nid, cls))
        prev = nid

# Junction healing: a road that dead-ends near another road almost always
# meets it at a junction the sampling missed. Bridge each dangling endpoint
# (degree 1) to the nearest node within BRIDGE units.
from math import hypot
deg = [0] * len(nodes)
for a, b, _ in edges:
    deg[a] += 1; deg[b] += 1
dangling = [i for i in range(len(nodes)) if deg[i] == 1]
bridged = 0
for i in dangling:
    xi, yi = nodes[i]
    best, bd = -1, BRIDGE
    for j in range(len(nodes)):
        if j == i:
            continue
        d = hypot(xi - nodes[j][0], yi - nodes[j][1])
        if d < bd:
            key = (min(i, j), max(i, j))
            if key not in edge_seen:
                bd, best = d, j
    if best >= 0:
        key = (min(i, best), max(i, best))
        edge_seen.add(key)
        edges.append((i, best, 'unclassified'))
        bridged += 1
print(f'bridged {bridged} dangling endpoints')

# Emit fractions of the viewBox so the graph matches birchie-places.
frac_nodes = [[round(x / VIEW_W, 5), round(y / VIEW_H, 5)] for (x, y) in nodes]
graph = {
    'nodes': frac_nodes,
    'edges': [[a, b, cls] for (a, b, cls) in edges],
}
json.dump(graph, open(OUT, 'w'))
print(f'nodes: {len(nodes)}  edges: {len(edges)}  ->  {OUT}')

# Verification render: graph over the map.
try:
    from PIL import Image, ImageDraw
    im = Image.open('/tmp/gm2/birchie-roads.svg.png').convert('RGBA')
    # /tmp/gm2 is the stretched square (1800x1800); fractions still map linearly.
    W, H = im.size
    d = ImageDraw.Draw(im)
    for (a, b, cls) in edges:
        ax, ay = frac_nodes[a]; bx, by = frac_nodes[b]
        col = (200, 60, 40) if cls == 'trunk' else (40, 90, 160)
        d.line([ax * W, ay * H, bx * W, by * H], fill=col, width=3)
    im.convert('RGB').save('/tmp/road_graph.png')
    print('verification -> /tmp/road_graph.png')
except Exception as e:
    print('render skipped:', e)
