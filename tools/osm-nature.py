#!/usr/bin/env python3
"""
osm-nature.py - the real water and woods beside the driving spike's small
roads, from OpenStreetMap, for drive-spike/crossings.js: ducks cross where
there is water, deer at the edges of woods (Marcus, 60A).

    python3 -I tools/osm-nature.py

Reads:  manus-output/birchie-osm/birchington.json (the Overpass export that
        tools/osm-to-svg.py drew birchie-roads.svg from; not in git): its
        woods. It has no water: no pond, stream, ditch or drain at all.
        manus-output/birchie-osm/birchington-nature.json, if it is there (not
        in git either): an Overpass export of the water, wetland, scrub and
        woods in the same box, `out geom`, as NATURE_QUERY below asks.
        apps/game/public/assets/driving/birchie-graph.json (the game's roads)
Writes: apps/game/public/assets/driving/nature.json

Projection. The same as tools/osm-buildings.py: osm-to-svg.py's project()
to map pixels of birchie-roads.svg, then drive-spike.html's mapToWorld(), so
x is metres east and y metres south of the map's top-left, where the spike's
roads are.

What is kept. Only what lies within KEEP_M of a small game road
(residential, unclassified, track: the only roads crossings.js puts animals
on), since nothing else can be beside a crossing: ponds, lakes, reservoirs
and basins, wetland (the marsh), streams, rivers, ditches and drains (the
marsh dykes), woods and scrub. Swimming pools are not water here: no duck
walks to a garden pool. No names or other tags ship, only a kind and a
shape.

Shapes are simplified (Douglas-Peucker, SIMPLIFY_M) and quantised to Q
metres; a long waterway is cut to the stretches near a small road.

Format (compact on purpose, as buildings.json):
  { "v": 1, "q": 1, "kinds": [...],
    "a": [[kind, x0, y0, dx1, dy1, ...], ...],   areas, rings open
    "l": [[kind, x0, y0, dx1, dy1, ...], ...] }  lines (waterways)
Coordinates are integers in units of q metres; the first point is absolute
and every later one is the step from the point before. kind indexes kinds.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).parent.parent
OSM = ROOT / "manus-output/birchie-osm/birchington.json"
OSM_NATURE = ROOT / "manus-output/birchie-osm/birchington-nature.json"
GRAPH = ROOT / "apps/game/public/assets/driving/birchie-graph.json"
OUT = ROOT / "apps/game/public/assets/driving/nature.json"

# osm-to-svg.py's bounds and canvas, and the spike's metres per map pixel.
LAT_MAX, LAT_SPAN, LON_MIN, LON_SPAN = 51.390, 0.035, 1.270, 0.090
SVG_W, SVG_H = 1800, 1121
MPP = 3900 / 1121

# What birchington-nature.json is: run at https://overpass-api.de/api/interpreter
# and saved as it comes.
BBOX = f"{LAT_MAX - LAT_SPAN:.3f},{LON_MIN:.3f},{LAT_MAX:.3f},{LON_MIN + LON_SPAN:.3f}"
NATURE_QUERY = f"""[out:json][timeout:90];
(
  way["waterway"~"^(stream|brook|river|canal|ditch|drain)$"]({BBOX});
  way["natural"~"^(water|wetland|wood|scrub)$"]({BBOX});
  way["landuse"~"^(basin|reservoir|forest)$"]({BBOX});
  relation["natural"~"^(water|wetland|wood|scrub)$"]({BBOX});
);
out geom;"""

SMALL = {"residential", "unclassified", "track"}
KEEP_M = 100        # crossings.js looks at most this far from a small road
SIMPLIFY_M = 1.5
Q = 1

KINDS = ["pond", "lake", "basin", "wetland", "stream", "river", "ditch", "drain", "wood", "scrub"]


def project(lat, lon):
    return ((lon - LON_MIN) / LON_SPAN * SVG_W * MPP, (LAT_MAX - lat) / LAT_SPAN * SVG_H * MPP)


def seg_dist(px, py, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy
    t = max(0.0, min(1.0, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) if l2 else 0.0
    return math.hypot(a[0] + dx * t - px, a[1] + dy * t - py)


def simplify(pts, tol, closed):
    """Douglas-Peucker; a closed ring is split at the two most distant points."""
    if len(pts) <= (4 if closed else 2):
        return pts

    def dp(seq):
        if len(seq) < 3:
            return seq
        a, b = seq[0], seq[-1]
        k, d = max(((k, seg_dist(seq[k][0], seq[k][1], a, b)) for k in range(1, len(seq) - 1)), key=lambda t: t[1])
        if d <= tol:
            return [a, b]
        return dp(seq[:k + 1])[:-1] + dp(seq[k:])

    if not closed:
        return dp(pts)
    far = max(range(len(pts)), key=lambda k: (pts[k][0] - pts[0][0]) ** 2 + (pts[k][1] - pts[0][1]) ** 2)
    out = dp(pts[:far + 1])[:-1] + dp(pts[far:] + [pts[0]])[:-1]
    return out if len(out) >= 3 else pts


def kind_of(t):
    w = t.get("waterway")
    if w in ("stream", "brook"):
        return "stream", False
    if w in ("river", "canal"):
        return "river", False
    if w in ("ditch", "drain"):
        return w, False
    n, lu = t.get("natural"), t.get("landuse")
    if n == "water" or lu in ("basin", "reservoir"):
        if t.get("water") in ("river", "canal", "stream", "ditch", "drain"):
            return "river", True
        if lu in ("basin", "reservoir") or t.get("water") in ("basin", "reservoir", "wastewater"):
            return "basin", True
        if t.get("leisure") == "swimming_pool" or t.get("water") == "swimming_pool":
            return None, True
        return ("lake" if t.get("water") == "lake" else "pond"), True
    if n == "wetland":
        return "wetland", True
    if n == "wood" or lu == "forest":
        return "wood", True
    if n == "scrub":
        return "scrub", True
    return None, True


def rings_of(el):
    """The element's outline(s) in world metres: a way's geometry, or a
    relation's outer members."""
    if el.get("type") == "way":
        return [[project(g["lat"], g["lon"]) for g in el.get("geometry", [])]]
    out = []
    for m in el.get("members", []):
        if m.get("type") == "way" and m.get("role", "outer") in ("outer", "") and m.get("geometry"):
            out.append([project(g["lat"], g["lon"]) for g in m["geometry"]])
    return out


def main():
    graph = json.loads(GRAPH.read_text())
    nodes = [(fx * SVG_W * MPP, fy * SVG_H * MPP) for fx, fy in graph["nodes"]]
    segs = [(nodes[i], nodes[j]) for i, j, c in graph["edges"]
            if c in SMALL and 0 <= i < len(nodes) and 0 <= j < len(nodes)]
    G = 50
    grid = {}
    for k, (a, b) in enumerate(segs):
        for gx in range(int((min(a[0], b[0]) - KEEP_M) // G), int((max(a[0], b[0]) + KEEP_M) // G) + 1):
            for gy in range(int((min(a[1], b[1]) - KEEP_M) // G), int((max(a[1], b[1]) + KEEP_M) // G) + 1):
                grid.setdefault((gx, gy), []).append(k)

    def road_dist(x, y):
        return min((seg_dist(x, y, *segs[k]) for k in grid.get((int(x // G), int(y // G)), [])), default=1e9)

    def near(x, y):
        return road_dist(x, y) < KEEP_M

    ends = sorted({p for seg in segs for p in seg})

    els, seen = [], set()
    sources = [OSM] + ([OSM_NATURE] if OSM_NATURE.exists() else [])
    for src in sources:
        for e in json.loads(src.read_text())["elements"]:
            key = (e.get("type"), e.get("id"))
            if key in seen:
                continue
            seen.add(key)
            els.append(e)

    def encode(pts):
        q = [(round(x / Q), round(y / Q)) for x, y in pts]
        out = [q[0][0], q[0][1]]
        for k in range(1, len(q)):
            out += [q[k][0] - q[k - 1][0], q[k][1] - q[k - 1][1]]
        return out

    counts = {}
    a_out, l_out = [], []
    for e in els:
        kind, area = kind_of(e.get("tags", {}))
        if not kind:
            continue
        for r in rings_of(e):
            if len(r) < 2:
                continue
            if area:
                if len(r) > 1 and r[0] == r[-1]:
                    r = r[:-1]
                if len(r) < 3:
                    continue
                # A ring beside a road, or one a road runs through (a lane
                # through a wood): any vertex near, or a road node inside.
                if not any(near(x, y) for x, y in r) and not any(inside(r, *n) for n in ends_in(ends, r)):
                    continue
                s = simplify(r, SIMPLIFY_M, True)
                if len(s) >= 3:
                    a_out.append([KINDS.index(kind)] + encode(s))
                    counts[kind] = counts.get(kind, 0) + 1
            else:
                # Only the stretches near a road, each with a point either side
                # so the line runs on past the road.
                keep = [near(x, y) for x, y in r]
                runs, cur = [], []
                for k, p in enumerate(r):
                    if keep[k] or (k + 1 < len(r) and keep[k + 1]) or (k and keep[k - 1]):
                        cur.append(p)
                    elif cur:
                        runs.append(cur)
                        cur = []
                if cur:
                    runs.append(cur)
                for run in runs:
                    s = simplify(run, SIMPLIFY_M, False)
                    if len(s) >= 2:
                        l_out.append([KINDS.index(kind)] + encode(s))
                        counts[kind] = counts.get(kind, 0) + 1

    a_out.sort(key=lambda b: (b[0], b[2], b[1]))
    l_out.sort(key=lambda b: (b[0], b[2], b[1]))
    doc = {"v": 1, "q": Q, "kinds": KINDS, "a": a_out, "l": l_out}
    OUT.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size} bytes, {len(a_out)} areas, {len(l_out)} lines"
          f" (from {', '.join(p.name for p in sources)})")
    print(" ", ", ".join(f"{k} {v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1])))
    if not OSM_NATURE.exists():
        print(f"  no {OSM_NATURE.relative_to(ROOT)}: woods only, no water. Its query:\n{NATURE_QUERY}")


def inside(r, x, y):
    c = False
    for i in range(len(r)):
        ax, ay = r[i]
        bx, by = r[(i + 1) % len(r)]
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            c = not c
    return c


def ends_in(ends, r):
    """The small roads' nodes inside r's bounding box."""
    xs, ys = [p[0] for p in r], [p[1] for p in r]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    return [n for n in ends if x0 <= n[0] <= x1 and y0 <= n[1] <= y1]


if __name__ == "__main__":
    main()
