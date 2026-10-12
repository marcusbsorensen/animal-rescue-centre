#!/usr/bin/env python3
"""
osm-buildings.py - the real buildings and farmyards beside the driving
spike's roads, from OpenStreetMap, for drive-spike/scenery.js to draw.

    python3 -I tools/osm-buildings.py

Reads:  manus-output/birchie-osm/birchington.json (the Overpass export that
        tools/osm-to-svg.py drew birchie-roads.svg from; not in git)
        apps/game/public/assets/driving/birchie-graph.json (the game's roads)
Writes: apps/game/public/assets/driving/buildings.json

Projection. The same as tools/osm-to-svg.py's project() (lat/lon to map
pixels of birchie-roads.svg), then drive-spike.html's mapToWorld() (one map
pixel is 3900/1121 metres on both axes). So a building lands in world metres,
x east and y south from the map's top-left, where the spike's roads are: the
graph's roads sit on the OSM roads they came from to a median 0.7 m.

What is kept. Every building with a vertex within KEEP_M of a game road, and
every farmyard, churchyard and housing area (landuse=residential) within
KEEP_M: the housing areas say where the town really is where its houses are
not mapped, so the spike may fill those streets with houses of its own. Beach huts are left out (the map
places its own row at the bay), and so are sheds under SHED_MIN_M2 and
anything under MIN_M2. No names, addresses or any other tag ships: only a
kind and a shape (docs/naming-places.md: the game alludes, never names).

Kinds come from the building tag, the shop or amenity on it, and where it
stands: a building in a farmyard is a farm building, a small one in a housing
area is a house, a big one in an industrial estate is a shed of the works.

Shapes are simplified (Douglas-Peucker, SIMPLIFY_M), squared to their
oriented bounding box when they nearly fill it, and quantised to Q metres.

Format (compact on purpose):
  { "v": 1, "q": 0.1, "kinds": [...], "areas": [...],
    "b": [[kind, x0, y0, dx1, dy1, dx2, dy2, ...], ...],
    "a": [[area, x0, y0, dx1, dy1, ...], ...] }
Coordinates are integers in units of q metres; the first point is absolute
and every later one is the step from the point before. Rings are open (the
last point joins the first). kind and area index the lists of names.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).parent.parent
OSM = ROOT / "manus-output/birchie-osm/birchington.json"
GRAPH = ROOT / "apps/game/public/assets/driving/birchie-graph.json"
OUT = ROOT / "apps/game/public/assets/driving/buildings.json"

# osm-to-svg.py's bounds and canvas, and the spike's metres per map pixel.
LAT_MAX, LAT_SPAN, LON_MIN, LON_SPAN = 51.390, 0.035, 1.270, 0.090
SVG_W, SVG_H = 1800, 1121
MPP = 3900 / 1121

KEEP_M = 100        # how far from a game road a building is still in view
MIN_M2 = 9
SHED_MIN_M2 = 16
SIMPLIFY_M = 0.35
SQUARE_FILL = 0.9   # area / bounding-box area above which a shape is squared
Q = 0.1

KINDS = ["house", "flats", "farmhouse", "barn", "church", "school", "station", "retail",
         "industrial", "workshop", "garage", "shed", "caravan", "glasshouse", "canopy", "hall", "other"]
AREAS = ["farmyard", "churchyard", "housing"]

RESIDENTIAL = {"house", "detached", "semidetached_house", "terrace", "bungalow", "residential", "cabin"}
SHOPS_AMENITY = {"restaurant", "fast_food", "cafe", "pub", "bar", "pharmacy", "bank", "dentist", "doctors",
                 "veterinary", "cinema"}
HALL_AMENITY = {"community_centre", "social_facility", "library", "townhall", "fire_station", "toilets",
                "childcare", "shelter"}
MOTOR = {"car_repair", "car_wash", "fuel", "car", "tyres"}


def project(lat, lon):
    return ((lon - LON_MIN) / LON_SPAN * SVG_W * MPP, (LAT_MAX - lat) / LAT_SPAN * SVG_H * MPP)


def ring_of(el):
    pts = [project(g["lat"], g["lon"]) for g in el["geometry"]]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def area(r):
    return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2


def centroid(r):
    return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)


def inside(r, x, y):
    c = False
    for i in range(len(r)):
        ax, ay = r[i]
        bx, by = r[(i + 1) % len(r)]
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            c = not c
    return c


def seg_dist(px, py, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy
    t = max(0.0, min(1.0, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) if l2 else 0.0
    return math.hypot(a[0] + dx * t - px, a[1] + dy * t - py)


def simplify(pts, tol):
    """Douglas-Peucker on a closed ring: split at the two most distant points."""
    if len(pts) <= 4:
        return pts
    far = max(range(len(pts)), key=lambda k: (pts[k][0] - pts[0][0]) ** 2 + (pts[k][1] - pts[0][1]) ** 2)

    def dp(seq):
        if len(seq) < 3:
            return seq
        a, b = seq[0], seq[-1]
        k, d = max(((k, seg_dist(seq[k][0], seq[k][1], a, b)) for k in range(1, len(seq) - 1)), key=lambda t: t[1])
        if d <= tol:
            return [a, b]
        left, right = dp(seq[:k + 1]), dp(seq[k:])
        return left[:-1] + right

    one = dp(pts[:far + 1])
    two = dp(pts[far:] + [pts[0]])
    out = one[:-1] + two[:-1]
    return out if len(out) >= 3 else pts


def hull(pts):
    pts = sorted(set(pts))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def obb(pts):
    """Minimum-area oriented box: (area, corners)."""
    h = hull(pts)
    best = None
    for i in range(len(h)):
        ax, ay = h[i]
        bx, by = h[(i + 1) % len(h)]
        l = math.hypot(bx - ax, by - ay)
        if l < 1e-6:
            continue
        ux, uy = (bx - ax) / l, (by - ay) / l
        us = [p[0] * ux + p[1] * uy for p in h]
        vs = [-p[0] * uy + p[1] * ux for p in h]
        a = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or a < best[0]:
            u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
            corners = [(u * ux - v * uy, u * uy + v * ux) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
            best = (a, corners)
    return best


def main():
    osm = json.loads(OSM.read_text())
    graph = json.loads(GRAPH.read_text())
    nodes = [(fx * SVG_W * MPP, fy * SVG_H * MPP) for fx, fy in graph["nodes"]]
    segs = [(nodes[i], nodes[j]) for i, j, _ in graph["edges"] if 0 <= i < len(nodes) and 0 <= j < len(nodes)]
    G = 50
    grid = {}
    for k, (a, b) in enumerate(segs):
        for gx in range(int((min(a[0], b[0]) - KEEP_M) // G), int((max(a[0], b[0]) + KEEP_M) // G) + 1):
            for gy in range(int((min(a[1], b[1]) - KEEP_M) // G), int((max(a[1], b[1]) + KEEP_M) // G) + 1):
                grid.setdefault((gx, gy), []).append(k)

    def road_dist(x, y):
        return min((seg_dist(x, y, *segs[k]) for k in grid.get((int(x // G), int(y // G)), [])), default=1e9)

    def near_road(r):
        return min(road_dist(x, y) for x, y in r) < KEEP_M

    els = [e for e in osm["elements"] if e.get("type") == "way" and len(e.get("geometry", [])) >= 3]
    lu = {}
    for e in els:
        t = e.get("tags", {})
        k = t.get("landuse")
        if k in ("farmyard", "residential", "retail", "commercial", "industrial", "religious"):
            r = ring_of(e)
            if len(r) >= 3:
                xs, ys = [p[0] for p in r], [p[1] for p in r]
                lu.setdefault(k, []).append((r, (min(xs), min(ys), max(xs), max(ys))))

    def landuse_at(x, y, kinds):
        for k in kinds:
            for r, (x0, y0, x1, y1) in lu.get(k, []):
                if x0 <= x <= x1 and y0 <= y <= y1 and inside(r, x, y):
                    return k
        return None

    def near_farmyard(x, y, m):
        for r, (x0, y0, x1, y1) in lu.get("farmyard", []):
            if x0 - m <= x <= x1 + m and y0 - m <= y <= y1 + m:
                if inside(r, x, y) or min(seg_dist(x, y, r[i], r[(i + 1) % len(r)]) for i in range(len(r))) < m:
                    return True
        return False

    def kind_of(t, r, a):
        b = t.get("building", "yes")
        shop, amen = t.get("shop"), t.get("amenity")
        cx, cy = centroid(r)
        if b == "beach_huts":
            return None
        if b == "shed" and a < SHED_MIN_M2:
            return None
        if b in ("church", "chapel", "cathedral") or amen == "place_of_worship":
            return "church"
        if b in ("school", "kindergarten") or amen in ("school", "kindergarten", "prep_school"):
            return "school"
        if b == "train_station":
            return "station"
        if b == "static_caravan":
            return "caravan"
        if b == "greenhouse":
            return "glasshouse"
        if b in ("roof", "carport"):
            return "canopy"
        if b in ("garage", "garages"):
            return "garage"
        if b == "shed":
            return "shed"
        if shop in MOTOR or amen in MOTOR:
            return "workshop"
        if b in ("farm_auxiliary", "barn", "stable", "cowshed", "sty"):
            return "barn"
        if b == "farm":
            return "farmhouse"
        in_yard = near_farmyard(cx, cy, 0)
        if b in RESIDENTIAL:
            return "farmhouse" if in_yard or (b == "house" and near_farmyard(cx, cy, 25)) else "house"
        if b == "apartments":
            return "flats"
        if b in ("retail", "commercial", "kiosk", "supermarket", "office") or shop or amen in SHOPS_AMENITY:
            return "retail"
        if amen in HALL_AMENITY or b in ("public", "pavilion", "civic", "hall", "community_centre"):
            return "hall"
        if b in ("industrial", "warehouse", "works"):
            return "industrial"
        if b == "lifeguardhut":
            return "shed"
        # building=yes and the rest: by where it stands and how big it is
        if in_yard:
            return "barn"
        where = landuse_at(cx, cy, ("industrial", "retail", "commercial", "residential"))
        if where == "industrial":
            return "industrial"
        if where in ("retail", "commercial"):
            return "retail"
        if where == "residential":
            return "house" if a < 320 else "flats" if a < 900 else "hall"
        if near_farmyard(cx, cy, 40):
            return "barn" if a > 60 else "shed"
        return "house" if a < 260 else "barn" if a < 3000 else "industrial"

    def encode(r):
        q = [(round(x / Q), round(y / Q)) for x, y in r]
        out = [q[0][0], q[0][1]]
        for k in range(1, len(q)):
            out += [q[k][0] - q[k - 1][0], q[k][1] - q[k - 1][1]]
        return out

    counts = {}
    b_out = []
    for e in els:
        t = e.get("tags", {})
        if "building" not in t:
            continue
        r = ring_of(e)
        if len(r) < 3:
            continue
        a = area(r)
        if a < MIN_M2 or not near_road(r):
            continue
        k = kind_of(t, r, a)
        if not k:
            continue
        s = simplify(r, SIMPLIFY_M)
        if len(s) > 4:
            ba, corners = obb(s)
            if ba > 0 and area(s) / ba >= SQUARE_FILL:
                s = corners
        elif len(s) == 4:
            ba, corners = obb(s)
            if ba > 0 and area(s) / ba >= 0.97:
                s = corners
        if len(s) < 3 or area(s) < MIN_M2:
            continue
        b_out.append([KINDS.index(k)] + encode(s))
        counts[k] = counts.get(k, 0) + 1

    a_out = []
    for e in els:
        t = e.get("tags", {})
        kind = "farmyard" if t.get("landuse") == "farmyard" else "churchyard" if (
            t.get("landuse") in ("religious", "cemetery") or t.get("amenity") == "grave_yard") else (
            "housing" if t.get("landuse") == "residential" else None)
        if not kind:
            continue
        r = ring_of(e)
        if len(r) < 3 or not near_road(r):
            continue
        s = simplify(r, 2.0 if kind == "housing" else 0.8)
        a_out.append([AREAS.index(kind)] + encode(s))
        counts[kind] = counts.get(kind, 0) + 1

    # Sorted for a stable file: by kind, then position.
    b_out.sort(key=lambda b: (b[0], b[2], b[1]))
    a_out.sort(key=lambda b: (b[0], b[2], b[1]))
    doc = {"v": 1, "q": Q, "kinds": KINDS, "areas": AREAS, "b": b_out, "a": a_out}
    OUT.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size} bytes, {len(b_out)} buildings, {len(a_out)} areas")
    print(" ", ", ".join(f"{k} {v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    main()
