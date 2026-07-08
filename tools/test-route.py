#!/usr/bin/env python3
"""Offline routing test: Dijkstra A.R.C. -> each destination on the graph."""
import json, heapq, math
from PIL import Image, ImageDraw

g = json.load(open('apps/game/public/assets/driving/birchie-graph.json'))
nodes = g['nodes']; edges = g['edges']

# adjacency with euclidean weight (fractions scaled by aspect for real distance)
AR = 1800.0 / 1121.0
adj = [[] for _ in nodes]
def dist(a, b):
    ax, ay = nodes[a]; bx, by = nodes[b]
    return math.hypot((ax - bx) * AR, ay - by)
for a, b, cls in edges:
    w = dist(a, b)
    # gently prefer bigger roads (trunk cheapest per unit) like real sat-nav
    mult = {'trunk': 0.6, 'secondary': 0.75, 'tertiary': 0.85}.get(cls, 1.0)
    adj[a].append((b, w * mult)); adj[b].append((a, w * mult))

def nearest(fx, fy):
    best, bd = 0, 1e9
    for i, (x, y) in enumerate(nodes):
        d = math.hypot((x - fx) * AR, y - fy)
        if d < bd: bd, best = d, i
    return best

def route(s, t):
    D = [1e18] * len(nodes); prev = [-1] * len(nodes); D[s] = 0
    pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == t: break
        if d > D[u]: continue
        for v, w in adj[u]:
            nd = d + w
            if nd < D[v]: D[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    if D[t] >= 1e17: return None
    path = []; u = t
    while u != -1: path.append(u); u = prev[u]
    return path[::-1]

places = {'arc': (0.28, 0.31), 'bramble-farm': (0.16, 0.56), 'cove-harbour': (0.14, 0.24),
    'pinebark-medical': (0.66, 0.44), 'moorland': (0.10, 0.44), 'woodland': (0.86, 0.60),
    'sea-cliffs': (0.68, 0.19), 'deep-forest': (0.84, 0.68), 'wetlands': (0.40, 0.86)}

im = Image.open('/tmp/gm2/birchie-roads.svg.png').convert('RGBA'); W, H = im.size
d = ImageDraw.Draw(im)
arc = nearest(*places['arc'])
ok = 0
for name, (fx, fy) in places.items():
    if name == 'arc': continue
    t = nearest(fx, fy)
    p = route(arc, t)
    status = 'OK' if p else 'NO ROUTE'
    print(f'{name:18s} {status}' + (f'  ({len(p)} hops)' if p else ''))
    if p:
        ok += 1
        pts = [(nodes[i][0] * W, nodes[i][1] * H) for i in p]
        d.line(pts, fill=(200, 30, 30), width=5)
for name, (fx, fy) in places.items():
    x, y = fx * W, fy * H; r = 12
    col = (30, 120, 160) if name == 'arc' else (230, 170, 30)
    d.ellipse([x - r, y - r, x + r, y + r], fill=col, outline=(255, 255, 255), width=3)
print(f'routed {ok}/{len(places) - 1}')
im.convert('RGB').save('/tmp/routes.png'); print('-> /tmp/routes.png')
