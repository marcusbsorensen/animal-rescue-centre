#!/usr/bin/env python3
"""
Convert Birchington OSM (Overpass JSON) -> game-coordinate SVG.

Reads:  manus-output/birchie-osm/birchington.json
Writes: apps/game/public/admin/scene-assets/birchie-map/birchie-roads.svg

Output layout (2026-05-03 overhaul):
  - Wider OSM bounds (51.355..51.390 N, 1.270..1.360 E) covering:
      Birchington-on-Sea + Minnis Bay (north-west)
      Westgate-on-Sea + Westgate & Birchington Golf Club (east)
      Quex Park (south-east)
      open countryside south of the town
  - All features rendered from REAL OSM data at true geographic positions.
  - A.R.C. plot drawn from real OSM polygon (id 4598299).
  - Two stylised painted markers (no real OSM equivalent):
      Petrol station at the real MFG Birchington (Esso) on Canterbury Rd.
      Wash Bandits inflatable car-wash man — placeholder location west of
      the petrol station, on the A28; Marcus will refine.

Lat/lng -> canvas via simple linear projection with latitude correction
so 1px W-E ~= 1px N-S in real metres.
"""
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
OSM = ROOT / "manus-output/birchie-osm/birchington.json"
OUT = ROOT / "apps/game/public/admin/scene-assets/birchie-map/birchie-roads.svg"

# OSM bbox: extends south to capture Quex Park countryside, east to
# Westgate Golf Club, west of Birchington town limits, north into the sea.
LAT_MIN, LAT_MAX = 51.355, 51.390
LON_MIN, LON_MAX = 1.270, 1.360

LAT_M_PER_DEG = 111000
LON_M_PER_DEG = 111000 * math.cos(math.radians(51.37))
REAL_W_M = (LON_MAX - LON_MIN) * LON_M_PER_DEG
REAL_H_M = (LAT_MAX - LAT_MIN) * LAT_M_PER_DEG

# Canvas — aspect-correct to real metres (W-E vs N-S).
SVG_W = 1800
SVG_H = int(SVG_W * REAL_H_M / REAL_W_M)


def project(lat, lon):
    """Lat/lon -> canvas px (north up, west left), aspect-correct."""
    x = (lon - LON_MIN) / (LON_MAX - LON_MIN) * SVG_W
    y = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * SVG_H
    return x, y


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


def xml_attr(s):
    if not s:
        return ""
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def way_to_path_d(pts):
    if not pts:
        return ""
    parts = []
    for i, (lat, lon) in enumerate(pts):
        x, y = project(lat, lon)
        parts.append(f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}")
    return "".join(parts)


def way_to_polygon_points(pts):
    return " ".join(f"{project(lat, lon)[0]:.1f},{project(lat, lon)[1]:.1f}" for lat, lon in pts)


KEEP_ROAD_CLASSES = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
    "residential", "service", "footway", "track", "pedestrian", "path",
    "living_street", "cycleway",
}

DROP_UNNAMED_CLASSES = {"service"}

# Real OSM polygons we want to specially label as destination zones.
SPECIAL_LABELS = {
    547934584: ("Quex Park", "park"),
    1135354687: ("Westgate Golf Club", "golf"),
}


def main():
    src = json.loads(OSM.read_text())

    roads = {cls: [] for cls in KEEP_ROAD_CLASSES}
    coastline = []
    green = []
    woodland = []
    pools = []
    farmland = []
    arc_plot_polygon = None
    special_polygons = []  # (label, kind, pts)
    petrol_stations = []   # (name, lat, lon)

    for el in src["elements"]:
        if el.get("type") != "way" or "geometry" not in el:
            continue
        tags = el.get("tags", {})
        pts = [(g["lat"], g["lon"]) for g in el["geometry"]]
        if not pts:
            continue
        # bbox cull (keep anything that has at least one vertex inside)
        if not any(LAT_MIN <= la <= LAT_MAX and LON_MIN <= lo <= LON_MAX for la, lo in pts):
            continue
        name = tags.get("name", "")
        eid = el["id"]

        if eid in SPECIAL_LABELS:
            label, kind = SPECIAL_LABELS[eid]
            special_polygons.append({"label": label, "kind": kind, "pts": pts, "id": eid})
            # Don't also render as plain green — but note Quex Park IS leisure=park
            # so we let it render twice for now (same fill) — actually skip:
            continue

        if "highway" in tags:
            cls = tags["highway"]
            if cls not in roads:
                cls = "residential"
            if cls in DROP_UNNAMED_CLASSES and not name:
                continue
            roads[cls].append({"name": name, "pts": pts, "id": eid, "ref": tags.get("ref", "")})
        elif tags.get("natural") == "coastline":
            coastline.append({"pts": pts})
        elif tags.get("natural") == "wood" or tags.get("landuse") == "forest":
            woodland.append({"name": name, "pts": pts})
        elif tags.get("leisure") in ("park", "garden", "recreation_ground", "playground", "sports_centre", "pitch", "common", "golf_course", "nature_reserve"):
            green.append({"name": name, "kind": tags["leisure"], "pts": pts})
        elif tags.get("landuse") in ("grass", "meadow", "recreation_ground", "village_green", "allotments", "cemetery"):
            green.append({"name": name, "kind": tags["landuse"], "pts": pts})
        elif tags.get("landuse") in ("farmland", "farmyard", "orchard"):
            farmland.append({"name": name, "kind": tags["landuse"], "pts": pts})
        elif tags.get("leisure") == "swimming_pool":
            pools.append({"pts": pts})

        if tags.get("amenity") == "fuel":
            clat = sum(p[0] for p in pts) / len(pts)
            clon = sum(p[1] for p in pts) / len(pts)
            petrol_stations.append({
                "name": name or tags.get("brand", "Petrol"),
                "brand": tags.get("brand", ""),
                "lat": clat, "lon": clon,
            })

        # ARC plot detection — same as before
        if (
            tags.get("landuse") == "grass"
            and not name
            and len(pts) >= 5
        ):
            clat = sum(p[0] for p in pts) / len(pts)
            clon = sum(p[1] for p in pts) / len(pts)
            if abs(clat - 51.37827) < 0.001 and abs(clon - 1.28632) < 0.001:
                arc_plot_polygon = pts

    out = []
    out.append('<?xml version="1.0" encoding="UTF-8"?>')
    out.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {SVG_W} {SVG_H}" width="{SVG_W}" height="{SVG_H}" '
        # 'meet' (contain/letterbox) so the A.R.C. plot is always
        # visible regardless of viewport aspect — slice/cover crops
        # the left ~18% on portrait viewports, hiding the plot.
        f'preserveAspectRatio="xMidYMid meet">'
    )
    out.append("<!-- Birchie geography: real OSM, wider bounds (2026-05-03 overhaul).")
    out.append(f"     bbox lat {LAT_MIN}..{LAT_MAX}, lon {LON_MIN}..{LON_MAX}")
    out.append(f"     ({REAL_W_M:.0f}m W-E x {REAL_H_M:.0f}m N-S real). -->")

    # Sea base — entire canvas. The land path painted on top covers
    # everything south of the coastline, leaving sea only at the top.
    out.append(f'<rect id="sea-bg" width="{SVG_W}" height="{SVG_H}" fill="#bfdde3"/>')

    # Land — derived from the coastline ways. Stitch them by longitude
    # then close down the south + sides so the south of the canvas is
    # land (not sea).
    if coastline:
        all_coast = []
        for c in coastline:
            all_coast.extend(c["pts"])
        all_coast.sort(key=lambda p: p[1])
        d_parts = []
        for i, (lat, lon) in enumerate(all_coast):
            x, y = project(lat, lon)
            d_parts.append(f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}")
        last_x, last_y = project(*all_coast[-1])
        first_x, first_y = project(*all_coast[0])
        d = (
            "".join(d_parts)
            + f"L{SVG_W},{last_y:.1f}"
            + f"L{SVG_W},{SVG_H}"
            + f"L0,{SVG_H}"
            + f"L0,{first_y:.1f}Z"
        )
        out.append(f'<path id="land" d="{d}" fill="#dec98a"/>')
    else:
        out.append(f'<rect id="land" width="{SVG_W}" height="{SVG_H}" fill="#dec98a"/>')

    # Farmland — soft warm wash so the south doesn't read as void
    out.append('<g id="farmland" fill="#e8d6a3" stroke="#c8b07a" stroke-width="1" opacity="0.85">')
    for f in farmland:
        d = way_to_path_d(f["pts"])
        if not d:
            continue
        out.append(f'  <path d="{d} Z"/>')
    out.append("</g>")

    # Green areas (real OSM) — parks, gardens, recreation, allotments
    out.append('<g id="green-areas" fill="#a8c890" stroke="#78a06a" stroke-width="1.5">')
    for g in green:
        d = way_to_path_d(g["pts"])
        if not d:
            continue
        sl = slug(g["name"]) or f"green-{g['kind']}"
        out.append(
            f'  <path id="{sl}" data-name="{xml_attr(g["name"])}" '
            f'data-kind="{g["kind"]}" d="{d} Z"/>'
        )
    out.append("</g>")

    # Woodland — darker green
    out.append('<g id="woodland" fill="#7ea366" stroke="#5a7a4f" stroke-width="1.5">')
    for w in woodland:
        d = way_to_path_d(w["pts"])
        if not d:
            continue
        sl = slug(w["name"]) or "wood"
        out.append(f'  <path id="{sl}" d="{d} Z"/>')
    out.append("</g>")

    # Special destination polygons (Quex Park, Westgate Golf Club) —
    # real OSM polygons styled as the "named destinations" of the map.
    out.append('<g id="destinations">')
    for sp in special_polygons:
        d = way_to_path_d(sp["pts"]) + " Z"
        sl = slug(sp["label"])
        if sp["kind"] == "golf":
            fill, stroke = "#9bc28b", "#6a8f5d"
        else:
            fill, stroke = "#7ea366", "#5a7a4f"
        out.append(
            f'  <path id="dest-{sl}" data-name="{xml_attr(sp["label"])}" '
            f'd="{d}" fill="{fill}" stroke="{stroke}" stroke-width="3"/>'
        )
    out.append("</g>")

    # Pools
    out.append('<g id="pools" fill="#7cc6e0" stroke="#4d97b3" stroke-width="1.5">')
    for p in pools:
        d = way_to_path_d(p["pts"]) + " Z"
        out.append(f"  <path d=\"{d}\"/>")
    out.append("</g>")

    # Roads — main A-roads first (drawn under), residential on top
    road_styles = {
        "motorway":     ('#f0a850', 18, ''),
        "trunk":        ('#f0c870', 16, ''),
        "primary":      ('#f0c870', 14, ''),
        "secondary":    ('#f0d894', 12, ''),
        "tertiary":     ('#f0e3b0', 10, ''),
        "unclassified": ('#f6ecc7', 8, ''),
        "residential":  ('#fdf6dc', 8, ''),
        "living_street":('#fdf6dc', 7, ''),
        "service":      ('#fdf6dc', 5, ''),
        "footway":      ('#e8d49a', 3, ' stroke-dasharray="4 3"'),
        "track":        ('#e8d49a', 4, ' stroke-dasharray="4 3"'),
        "pedestrian":   ('#f0e3b0', 8, ''),
        "path":         ('#e8d49a', 3, ' stroke-dasharray="4 3"'),
        "cycleway":     ('#d8e6c0', 3, ' stroke-dasharray="3 3"'),
    }

    # Render in this order so trunks sit visually under residentials
    road_render_order = [
        "motorway", "trunk", "primary", "secondary", "tertiary",
        "unclassified", "residential", "living_street", "pedestrian",
        "service", "track", "footway", "path", "cycleway",
    ]
    for cls in road_render_order:
        ways = roads.get(cls, [])
        if not ways:
            continue
        fill, width, dash = road_styles[cls]
        out.append(
            f'<g id="roads-{cls}" stroke="{fill}" stroke-width="{width}" '
            f'fill="none" stroke-linecap="round" stroke-linejoin="round"{dash}>'
        )
        for w in ways:
            d = way_to_path_d(w["pts"])
            if not d:
                continue
            sl = slug(w["name"]) or f"r-{w['id']}"
            out.append(
                f'  <path id="{sl}" data-name="{xml_attr(w["name"])}" '
                f'data-cls="{cls}" data-ref="{xml_attr(w["ref"])}" d="{d}"/>'
            )
        out.append("</g>")

    # ── Labels for the destination polygons ───────────────────────────
    for sp in special_polygons:
        clat = sum(p[0] for p in sp["pts"]) / len(sp["pts"])
        clon = sum(p[1] for p in sp["pts"]) / len(sp["pts"])
        cx, cy = project(clat, clon)
        out.append(
            f'<text x="{cx:.0f}" y="{cy:.0f}" '
            f'font-family="Fredoka, sans-serif" font-size="26" font-weight="700" '
            f'fill="#fef9ef" text-anchor="middle" paint-order="stroke" '
            f'stroke="#3a3a3a" stroke-width="3.5">{xml_attr(sp["label"])}</text>'
        )

    # ── Petrol station markers (real OSM amenity=fuel) ────────────────
    out.append('<g id="petrol-stations">')
    for ps in petrol_stations:
        cx, cy = project(ps["lat"], ps["lon"])
        # Only render if inside canvas
        if cx < 0 or cx > SVG_W or cy < 0 or cy > SVG_H:
            continue
        # Painted marker: rounded square + cream pump glyph
        out.append(
            f'  <g transform="translate({cx:.0f},{cy:.0f})">'
            f'<rect x="-14" y="-14" width="28" height="28" rx="5" '
            f'fill="#e3b04b" stroke="#7b5c3a" stroke-width="2"/>'
            f'<text x="0" y="5" font-family="Fredoka, sans-serif" font-size="18" '
            f'font-weight="700" fill="#fef9ef" text-anchor="middle" '
            f'paint-order="stroke" stroke="#3a3a3a" stroke-width="2">P</text>'
            f'<text x="0" y="-22" font-family="Fredoka, sans-serif" font-size="13" '
            f'font-weight="600" fill="#fef9ef" text-anchor="middle" '
            f'paint-order="stroke" stroke="#3a3a3a" stroke-width="2.5">'
            f'{xml_attr(ps["brand"] or "Petrol")}</text></g>'
        )
    out.append("</g>")

    # ── Wash Bandits — placeholder inflatable car-wash man.
    # No OSM equivalent. Marcus will refine the position later. Place
    # it just west of the MFG Birchington petrol station (Canterbury
    # Rd / A28 west exit), at roughly 51.3690 N, 1.2950 E.
    wb_lat, wb_lon = 51.3690, 1.2950
    wbx, wby = project(wb_lat, wb_lon)
    if 0 <= wbx <= SVG_W and 0 <= wby <= SVG_H:
        out.append(
            f'<g id="wash-bandits" transform="translate({wbx:.0f},{wby:.0f})">'
            f'<circle cx="0" cy="0" r="14" fill="#ff6b9a" stroke="#7b5c3a" stroke-width="2"/>'
            f'<text x="0" y="5" font-family="Fredoka, sans-serif" font-size="16" '
            f'font-weight="700" fill="#fef9ef" text-anchor="middle" '
            f'paint-order="stroke" stroke="#3a3a3a" stroke-width="2">W</text>'
            f'<text x="0" y="-22" font-family="Fredoka, sans-serif" font-size="13" '
            f'font-weight="600" fill="#fef9ef" text-anchor="middle" '
            f'paint-order="stroke" stroke="#3a3a3a" stroke-width="2.5">'
            f'Wash Bandits</text></g>'
        )

    # A.R.C. plot — real OSM polygon
    if arc_plot_polygon:
        pts_str = way_to_polygon_points(arc_plot_polygon)
        out.append(
            f'<polygon id="arc-plot" data-name="A.R.C. site" points="{pts_str}" '
            f'fill="#e3b04b" fill-opacity="0.55" stroke="#7b5c3a" '
            f'stroke-width="3" stroke-dasharray="6 4"/>'
        )
        clat = sum(p[0] for p in arc_plot_polygon) / len(arc_plot_polygon)
        clon = sum(p[1] for p in arc_plot_polygon) / len(arc_plot_polygon)
        cx, cy = project(clat, clon)
        out.append(
            f'<text x="{cx:.0f}" y="{cy:.0f}" font-family="Fredoka, sans-serif" '
            f'font-size="22" font-weight="700" fill="#3a3a3a" text-anchor="middle" '
            f'paint-order="stroke" stroke="#fef9ef" stroke-width="3">A.R.C.</text>'
        )

    out.append("</svg>")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(out))
    n_roads = sum(len(v) for v in roads.values())
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")
    print(f"  canvas: {SVG_W}x{SVG_H}px")
    print(
        f"  {n_roads} roads, {len(green)} green, {len(woodland)} woodland, "
        f"{len(farmland)} farmland, {len(special_polygons)} destinations, "
        f"{len(pools)} pools, {len(petrol_stations)} petrol, "
        f"{1 if arc_plot_polygon else 0} A.R.C. plot"
    )

    # Useful for updating map.html constants:
    if arc_plot_polygon:
        clat = sum(p[0] for p in arc_plot_polygon) / len(arc_plot_polygon)
        clon = sum(p[1] for p in arc_plot_polygon) / len(arc_plot_polygon)
        cx, cy = project(clat, clon)
        # Anchor at south end of plot for the building stamp
        max_lat = max(p[0] for p in arc_plot_polygon)
        min_lat = min(p[0] for p in arc_plot_polygon)
        # South = lower lat
        south_x, south_y = project(min_lat, clon)
        print(f"  ARC centre svg: ({cx:.0f}, {cy:.0f})")
        print(f"  ARC south-edge svg: ({south_x:.0f}, {south_y:.0f})")
        print(f"  Suggested map.html constants: SVG_VIEW_W={SVG_W} SVG_VIEW_H={SVG_H}")
        print(f"  ARC_PLOT_SVG_X={south_x:.0f} ARC_PLOT_SVG_Y={south_y:.0f}")


if __name__ == "__main__":
    main()
