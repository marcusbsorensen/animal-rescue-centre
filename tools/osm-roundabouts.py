#!/usr/bin/env python3
"""
osm-roundabouts.py - the real roundabouts of the driving spike's map, from
OpenStreetMap, for drive-spike/trip-strip.js: the rail draws a roundabout only
where there is one (Marcus, 96A, 2026-10-14).

    python3 -I tools/osm-roundabouts.py

Reads:  manus-output/birchie-osm/roundabouts/birchington-roundabouts.json (the
        Overpass export, not in git, as QUERY below asks)
        apps/game/public/assets/driving/birchie-graph.json (the game's roads)
Writes: apps/game/public/assets/driving/roundabouts.json

Projection. The same as tools/osm-nature.py: osm-to-svg.py's project() to map
pixels of birchie-roads.svg, then drive-spike.html's mapToWorld(), so x is
metres east and y metres south of the map's top-left, where the spike's roads
are (the graph's node [fx, fy] is at fx * SVG_W * MPP, fy * SVG_H * MPP).

What is kept.
  - highway=mini_roundabout nodes, and junction=roundabout ways (a ring of
    road; none on this map). A mini-roundabout within DOUBLE_M of another is
    one double mini-roundabout (two rings, the UK sign draws it as two small
    rings close together), at the pair's middle.
  - junction=circular ways are listed apart, as `notRoundabouts`, and are not
    roundabouts: on this map they are a residential loop (Broadley Avenue, a
    one-way street that goes round a green) and two service-road circles (a
    private car park and a driveway), which no one gives way on. The strip does
    not draw them. (They are not what the strip's old geometry detector found
    either: it found a triangle of roads at Birchington station and one off the
    A28 at the Margate end.)

Each place also says where it snaps to in the game graph, for the record:
the nearest node of any degree (a mini-roundabout is where a road with a side
road or two meets; the graph is a skeleton and may carry only the main road
through it, so the node is a pass-through of degree 2) and the nearest junction
(three or more roads). The strip snaps again, at run time, to whichever graph
the van drives, within snapM.

Format (compact on purpose, as nature.json):
  { "v": 1, "source": "...", "snapM": 20, "graph": "birchie-graph.json",
    "places": [ { "osm": [ids], "kind": "mini" | "ring", "rings": 1 | 2,
                  "at": [x, y], "dir": "clockwise" | ..., "apart": metres between a double's
                  two, "snap": {...}, "each": [one snap for each osm id] }, ... ],
    "notRoundabouts": [ { "osm": id, "why": "...", "at": [x, y], "m": perimeter }, ... ] }
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).parent.parent
OSM = ROOT / "manus-output/birchie-osm/roundabouts/birchington-roundabouts.json"
GRAPH = ROOT / "apps/game/public/assets/driving/birchie-graph.json"
OUT = ROOT / "apps/game/public/assets/driving/roundabouts.json"

# osm-to-svg.py's bounds and canvas, and the spike's metres per map pixel.
LAT_MAX, LAT_SPAN, LON_MIN, LON_SPAN = 51.390, 0.035, 1.270, 0.090
SVG_W, SVG_H = 1800, 1121
MPP = 3900 / 1121

SNAP_M = 20       # trip-strip.js: a roundabout belongs to a graph node this near, and to none further
DOUBLE_M = 25     # minis this close are one double mini-roundabout

# What birchington-roundabouts.json is: run at https://overpass-api.de/api/interpreter
# and saved as it comes.
BBOX = f"{LAT_MAX - LAT_SPAN:.3f},{LON_MIN:.3f},{LAT_MAX:.3f},{LON_MIN + LON_SPAN:.3f}"
QUERY = f"""[out:json][timeout:60];
(
  node["highway"="mini_roundabout"]({BBOX});
  way["junction"~"^(roundabout|circular)$"]({BBOX});
);
out geom;"""


def project(lat, lon):
    return ((lon - LON_MIN) / LON_SPAN * SVG_W * MPP, (LAT_MAX - lat) / LAT_SPAN * SVG_H * MPP)


def loop_facts(el):
    """A way's outline in world metres: its middle, its length round, and how
    round it is (4 pi area / perimeter squared, 1 for a circle)."""
    pts = [project(g["lat"], g["lon"]) for g in el["geometry"]]
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    per = sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(len(pts)))
    area = abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
                   for i in range(len(pts)))) / 2
    return (cx, cy), per, 4 * math.pi * area / (per * per)


def main():
    graph = json.loads(GRAPH.read_text())
    nodes = [(fx * SVG_W * MPP, fy * SVG_H * MPP) for fx, fy in graph["nodes"]]
    degree = [0] * len(nodes)
    for i, j, _ in graph["edges"]:
        if i >= 0 and j >= 0:
            degree[i] += 1
            degree[j] += 1

    def snap(x, y):
        by = sorted((math.hypot(x - a, y - b), k) for k, (a, b) in enumerate(nodes))
        d, k = by[0]
        out = {"node": k, "m": round(d, 1), "deg": degree[k]}
        j = next(((dd, kk) for dd, kk in by if degree[kk] >= 3), None)
        out["junction"] = {"node": j[1], "m": round(j[0], 1)}
        out["on"] = d <= SNAP_M
        return out

    if not OSM.exists():
        raise SystemExit(f"no {OSM.relative_to(ROOT)}. Its query:\n{QUERY}")
    doc = json.loads(OSM.read_text())
    base = doc.get("osm3s", {}).get("timestamp_osm_base", "?")
    minis, rings, circular = [], [], []
    for e in doc["elements"]:
        t = e.get("tags", {})
        if e["type"] == "node" and t.get("highway") == "mini_roundabout":
            x, y = project(e["lat"], e["lon"])
            minis.append({"id": e["id"], "xy": (x, y), "dir": t.get("direction", "")})
        elif e["type"] == "way" and t.get("junction") == "roundabout":
            (x, y), per, rnd = loop_facts(e)
            rings.append({"id": e["id"], "xy": (x, y), "per": per, "dir": ""})
        elif e["type"] == "way" and t.get("junction") == "circular":
            (x, y), per, rnd = loop_facts(e)
            circular.append({"osm": e["id"], "why": f"junction=circular, highway={t.get('highway')}"
                                                    f"{', ' + t['name'] if t.get('name') else ''}"
                                                    f"{', service=' + t['service'] if t.get('service') else ''}"
                                                    f": a {round(per)} m loop, not a roundabout",
                             "at": [round(x, 1), round(y, 1)], "m": round(per), "round": round(rnd, 2)})

    # Mini-roundabouts within DOUBLE_M of each other are one double.
    minis.sort(key=lambda m: (m["xy"][0], m["xy"][1]))
    used, places = set(), []
    for k, m in enumerate(minis):
        if k in used:
            continue
        group = [m]
        used.add(k)
        for k2 in range(k + 1, len(minis)):
            o = minis[k2]
            if k2 not in used and math.hypot(o["xy"][0] - m["xy"][0], o["xy"][1] - m["xy"][1]) <= DOUBLE_M:
                group.append(o)
                used.add(k2)
        x = sum(g["xy"][0] for g in group) / len(group)
        y = sum(g["xy"][1] for g in group) / len(group)
        places.append({"osm": [g["id"] for g in group], "kind": "mini", "rings": min(2, len(group)),
                       "at": [round(x, 1), round(y, 1)], "dir": group[0]["dir"],
                       "apart": round(math.hypot(group[0]["xy"][0] - group[-1]["xy"][0],
                                                 group[0]["xy"][1] - group[-1]["xy"][1]), 1),
                       "snap": snap(x, y), "each": [{"osm": g["id"], **snap(*g["xy"])} for g in group]})
    for r in rings:
        places.append({"osm": [r["id"]], "kind": "ring", "rings": 1, "at": [round(r["xy"][0], 1), round(r["xy"][1], 1)],
                       "dir": r["dir"], "snap": snap(*r["xy"])})
    circular.sort(key=lambda c: c["osm"])

    source = ("OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). "
              f"Overpass extract (birchington-roundabouts.json, OSM base {base}; in manus-output/birchie-osm/roundabouts/, "
              "not in git), projected as tools/osm-roundabouts.py does, as tools/osm-nature.py does.")
    out = {"v": 1, "source": source, "snapM": SNAP_M, "graph": "birchie-graph.json",
           "places": places, "notRoundabouts": circular}
    OUT.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size} bytes, {len(places)} places "
          f"({sum(p['rings'] for p in places)} rings), {len(circular)} loops left out")
    for p in places:
        s = p["snap"]
        print(f"  {'+'.join(map(str, p['osm']))}: {p['kind']}, {p['rings']} ring(s) at {p['at']}; "
              f"nearest graph node {s['node']} (degree {s['deg']}) {s['m']} m, "
              f"nearest junction {s['junction']['node']} {s['junction']['m']} m; "
              f"{'snapped' if s['on'] else 'not on the graph (further than ' + str(SNAP_M) + ' m)'}")
        if len(p.get("each", [])) > 1:
            print("    each: " + "; ".join(f"{q['osm']} -> node {q['node']} {q['m']} m (junction {q['junction']['node']} {q['junction']['m']} m)"
                                          for q in p["each"]) + f"; {p['apart']} m apart")
    for c in circular:
        print(f"  not a roundabout: {c['osm']} at {c['at']}: {c['why']}")


if __name__ == "__main__":
    main()
