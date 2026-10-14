#!/usr/bin/env python3
"""
osm-trees.py - the real single trees and tree rows round the driving spike's
roads, from OpenStreetMap, for drive-spike/scenery.js (Marcus, 107A).

    python3 -I tools/osm-trees.py

Reads:  nothing but this file. The extract is small (42 trees, 4 rows), so
        it is embedded below as it came, latitude and longitude, rather than
        kept in manus-output/ as osm-nature.py's are.
Writes: apps/game/public/assets/driving/trees.json

Source. OpenStreetMap contributors, ODbL 1.0
(https://www.openstreetmap.org/copyright): an Overpass extract of
natural=tree nodes and natural=tree_row ways in osm-to-svg.py's box, OSM base
2026-10-14T12:14:06Z, as TREES_QUERY below asks. Only positions ship: no
names, species or other tags.

Projection. Exactly osm-nature.py's (and so osm-buildings.py's): osm-to-svg.py's
project() to map pixels of birchie-roads.svg, then drive-spike.html's
mapToWorld(), so x is metres east and y metres south of the map's top-left,
where the spike's roads are.

The real trees are too few to carry the look on their own. scenery.js adds
the rest, seeded by position so they are the same on every drive: crowns
filling the real woods and scrub (nature.json and the map's woodland),
hedgerow standards along the lanes' hedges every 20 to 60 m, and woodland
round the game's own wooded places (Deep Forest, Woodland, Wilderwood, the
little wood, Pinebark). See docs/driving-rebuild-2026-10-11.md, 107A.

Format (compact on purpose, as nature.json):
  { "v": 1, "source": "...", "q": 1, "kinds": ["tree", "row"],
    "p": [x0, y0, dx1, dy1, ...],                 single trees, one run
    "l": [[kind, x0, y0, dx1, dy1, ...], ...] }   tree rows (kind 1)
Coordinates are integers in units of q metres; the first point is absolute
and every later one is the step from the point before.
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT = ROOT / "apps/game/public/assets/driving/trees.json"

# osm-to-svg.py's bounds and canvas, and the spike's metres per map pixel
# (as osm-nature.py).
LAT_MAX, LAT_SPAN, LON_MIN, LON_SPAN = 51.390, 0.035, 1.270, 0.090
SVG_W, SVG_H = 1800, 1121
MPP = 3900 / 1121
Q = 1

OSM_BASE = "2026-10-14T12:14:06Z"
BBOX = f"{LAT_MAX - LAT_SPAN:.3f},{LON_MIN:.3f},{LAT_MAX:.3f},{LON_MIN + LON_SPAN:.3f}"
TREES_QUERY = f"""[out:json][timeout:60];
(
  node["natural"="tree"]({BBOX});
  way["natural"="tree_row"]({BBOX});
);
out geom;"""

# The extract, in full: [lat, lon] per tree, and per row its points.
EXTRACT = {"trees": [[51.377136, 1.332414], [51.377222, 1.332621], [51.3774, 1.332566], [51.377454, 1.33232], [51.377525, 1.332546],
                     [51.378325, 1.319513], [51.378661, 1.32143], [51.378057, 1.356045], [51.378092, 1.35628], [51.378222, 1.356544],
                     [51.378319, 1.356486], [51.378391, 1.356424], [51.378402, 1.356565], [51.378468, 1.356039], [51.378473, 1.356451],
                     [51.378492, 1.356306], [51.378545, 1.358809], [51.378552, 1.356494], [51.378555, 1.356396], [51.378637, 1.358987],
                     [51.378874, 1.358834], [51.379141, 1.35901], [51.379536, 1.358859], [51.379661, 1.359029], [51.379817, 1.358896],
                     [51.37994, 1.358901], [51.380126, 1.358898], [51.380177, 1.359076], [51.380288, 1.359071], [51.380456, 1.358918],
                     [51.380493, 1.359121], [51.380757, 1.359709], [51.380775, 1.359287], [51.380943, 1.359748], [51.376797, 1.310736],
                     [51.376759, 1.310726], [51.376715, 1.310717], [51.377274, 1.31111], [51.377215, 1.311102], [51.377057, 1.311085],
                     [51.377127, 1.311077], [51.380305, 1.287007]],
           "rows": [[[51.355421, 1.321177], [51.352181, 1.319971], [51.351975, 1.321359]],
                    [[51.370139, 1.279712], [51.369415, 1.279583]],
                    [[51.364226, 1.274539], [51.365172, 1.273849]],
                    [[51.371605, 1.357079], [51.371583, 1.357186], [51.371948, 1.357433], [51.37226, 1.357614], [51.372556, 1.35777],
                     [51.372827, 1.357877], [51.3731, 1.357985], [51.373325, 1.358126], [51.373434, 1.358194]]]}


def project(lat, lon):
    return ((lon - LON_MIN) / LON_SPAN * SVG_W * MPP, (LAT_MAX - lat) / LAT_SPAN * SVG_H * MPP)


def encode(pts):
    q = [(round(x / Q), round(y / Q)) for x, y in pts]
    out = [q[0][0], q[0][1]]
    for k in range(1, len(q)):
        out += [q[k][0] - q[k - 1][0], q[k][1] - q[k - 1][1]]
    return out


def main():
    # Sorted south then east, so the file is stable however the extract came.
    trees = sorted((project(lat, lon) for lat, lon in EXTRACT["trees"]), key=lambda p: (round(p[1]), round(p[0])))
    rows = [[1] + encode([project(lat, lon) for lat, lon in r]) for r in EXTRACT["rows"]]
    rows.sort(key=lambda r: (r[2], r[1]))
    source = ("OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). "
              f"Overpass extract of natural=tree and natural=tree_row (OSM base {OSM_BASE}), embedded in "
              "tools/osm-trees.py and projected as tools/osm-to-svg.py does.")
    doc = {"v": 1, "source": source, "q": Q, "kinds": ["tree", "row"], "p": encode(trees), "l": rows}
    OUT.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size} bytes, {len(trees)} trees, {len(rows)} rows")


if __name__ == "__main__":
    main()
