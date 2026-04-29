#!/usr/bin/env python3
"""
Convert Birchington OSM (Overpass JSON) -> game-coordinate SVG.

Reads:  manus-output/birchie-osm/birchington.json
Writes: apps/game/public/admin/scene-assets/birchie-map/birchie-roads.svg

Output layout:
  - Real OSM (Birchington centre + Minnis Bay) — coast, roads, green
  - Stylised destination zones drawn programmatically:
      Wyx Park: south-east extension panel (off-OSM, game-world geography)
      Westgate Golf Club: east extension panel
  - A.R.C. plot drawn from real OSM polygon (NNW-rotated naturally)

Lat/lng -> canvas via simple linear projection with latitude correction
so 1px W-E ~= 1px N-S in real metres for the OSM portion.

Stylised zones are placed in the right-hand part of the canvas
(beyond the OSM bbox) and labelled, with simplified roads connecting
them to Birchington proper.
"""
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
OSM = ROOT / "manus-output/birchie-osm/birchington.json"
OUT = ROOT / "apps/game/public/admin/scene-assets/birchie-map/birchie-roads.svg"

# OSM bbox: Minnis Bay -> Birchington centre. Stylised zones added east of this.
LAT_MIN, LAT_MAX = 51.3760, 51.3855
LON_MIN, LON_MAX = 1.2780, 1.3160

LAT_M_PER_DEG = 111000
LON_M_PER_DEG = 111000 * math.cos(math.radians(51.4))
REAL_W_M = (LON_MAX - LON_MIN) * LON_M_PER_DEG
REAL_H_M = (LAT_MAX - LAT_MIN) * LAT_M_PER_DEG

# Canvas — width covers OSM + stylised east extension.
# OSM portion = 0..1800px (real-aspect); stylised east strip = 1800..2400px.
OSM_W = 1800
EXTENSION_W = 600
SVG_W = OSM_W + EXTENSION_W
SVG_H = int(OSM_W * REAL_H_M / REAL_W_M)


def project(lat, lon):
    """Lat/lon -> canvas px (north up, west left), aspect-correct."""
    x = (lon - LON_MIN) / (LON_MAX - LON_MIN) * OSM_W
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


# Road simplification — what to keep
KEEP_ROAD_CLASSES = {
    "trunk", "primary", "secondary", "tertiary", "unclassified",
    "residential", "service", "footway", "track", "pedestrian", "path",
}

# Roads we want to drop unless they're named or have a class we care about
DROP_UNNAMED_CLASSES = {"service"}


def main():
    src = json.loads(OSM.read_text())

    roads = {cls: [] for cls in KEEP_ROAD_CLASSES}
    coastline = []
    green = []
    pools = []
    arc_plot_polygon = None

    for el in src["elements"]:
        if el.get("type") != "way" or "geometry" not in el:
            continue
        tags = el.get("tags", {})
        pts = [(g["lat"], g["lon"]) for g in el["geometry"]]
        if not any(LAT_MIN <= la <= LAT_MAX and LON_MIN <= lo <= LON_MAX for la, lo in pts):
            continue
        name = tags.get("name", "")

        if "highway" in tags:
            cls = tags["highway"]
            if cls not in roads:
                cls = "residential"
            # Drop unnamed minor-class roads to reduce clutter
            if cls in DROP_UNNAMED_CLASSES and not name:
                continue
            roads[cls].append({"name": name, "pts": pts, "id": el["id"]})
        elif tags.get("natural") == "coastline":
            coastline.append({"pts": pts})
        elif tags.get("leisure") in ("park", "garden", "recreation_ground", "playground", "sports_centre", "pitch", "common"):
            green.append({"name": name, "kind": tags["leisure"], "pts": pts})
        elif tags.get("landuse") in ("grass", "meadow", "recreation_ground"):
            green.append({"name": name, "kind": tags["landuse"], "pts": pts})
        elif tags.get("leisure") == "swimming_pool":
            pools.append({"pts": pts})

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
    out.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SVG_W} {SVG_H}" width="{SVG_W}" height="{SVG_H}">')
    out.append("<!-- Birchie geography: real OSM (Minnis Bay -> Birchington centre)")
    out.append("     + stylised game-world destination zones (Wyx Park, Westgate Golf Club).")
    out.append(f"     OSM portion: lat {LAT_MIN}..{LAT_MAX}, lon {LON_MIN}..{LON_MAX}")
    out.append(f"     ({REAL_W_M:.0f}m W-E x {REAL_H_M:.0f}m N-S real). -->")

    out.append(f'<rect id="sea-bg" width="{SVG_W}" height="{SVG_H}" fill="#bfdde3"/>')

    # Land
    if coastline:
        all_coast = []
        for c in coastline:
            all_coast.extend(c["pts"])
        all_coast.sort(key=lambda p: p[1])
        d_parts = []
        for i, (lat, lon) in enumerate(all_coast):
            x, y = project(lat, lon)
            d_parts.append(f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}")
        # Extend land east across the stylised zone, wrapping around bottom
        d = "".join(d_parts) + f"L{SVG_W},{all_coast[-1][1] and 50}L{SVG_W},{SVG_H}L0,{SVG_H}Z"
        # Better: just continue the last coastline point to the right edge at same height
        last_lat, last_lon = all_coast[-1]
        last_x, last_y = project(last_lat, last_lon)
        d = "".join(d_parts) + f"L{SVG_W},{last_y:.0f}L{SVG_W},{SVG_H}L0,{SVG_H}Z"
        out.append(f'<path id="land" d="{d}" fill="#dec98a"/>')
    else:
        out.append(f'<rect id="land" width="{SVG_W}" height="{SVG_H}" fill="#dec98a"/>')

    # Vertical divider between OSM and stylised extension (subtle)
    out.append(
        f'<line x1="{OSM_W}" y1="0" x2="{OSM_W}" y2="{SVG_H}" '
        f'stroke="#c8b58a" stroke-width="0.5" stroke-dasharray="2 4" opacity="0.5"/>'
    )

    # Green areas (real OSM)
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

    # Pools
    out.append('<g id="pools" fill="#7cc6e0" stroke="#4d97b3" stroke-width="1.5">')
    for p in pools:
        d = way_to_path_d(p["pts"]) + " Z"
        out.append(f"  <path d=\"{d}\"/>")
    out.append("</g>")

    # Roads
    road_styles = {
        "trunk":        ('#f0c870', 16, ''),
        "primary":      ('#f0c870', 14, ''),
        "secondary":    ('#f0d894', 12, ''),
        "tertiary":     ('#f0e3b0', 10, ''),
        "unclassified": ('#f6ecc7', 8, ''),
        "residential":  ('#fdf6dc', 8, ''),
        "service":      ('#fdf6dc', 5, ''),
        "footway":      ('#e8d49a', 3, ' stroke-dasharray="4 3"'),
        "track":        ('#e8d49a', 4, ' stroke-dasharray="4 3"'),
        "pedestrian":   ('#f0e3b0', 8, ''),
        "path":         ('#e8d49a', 3, ' stroke-dasharray="4 3"'),
    }

    for cls, ways in roads.items():
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
                f'data-cls="{cls}" d="{d}"/>'
            )
        out.append("</g>")

    # ---- Stylised destination zones (game-world geography) ----
    # Background pad for the east extension strip
    out.append(
        f'<rect x="{OSM_W}" y="0" width="{EXTENSION_W}" height="{SVG_H}" '
        f'fill="#dec98a"/>'
    )

    # Buffer zone: open countryside between Birchington and Wyx/Westgate
    # (a few hedgerow strips + a long winding country road)
    out.append('<g id="buffer-zone" stroke="#9ab07a" stroke-width="2" fill="none" stroke-dasharray="6 4" opacity="0.7">')
    bx = OSM_W + 30
    for y in range(80, SVG_H - 80, 60):
        out.append(f'  <path d="M{bx},{y} q 80 -10, 160 0 t 160 0 t 160 0"/>')
    out.append("</g>")

    # The country lane (B2049-style) winding east from Birchington to Wyx and Westgate
    lane_d = (
        f"M{OSM_W - 40},{SVG_H * 0.55:.0f} "
        f"Q {OSM_W + 80},{SVG_H * 0.6:.0f} "
        f"{OSM_W + 220},{SVG_H * 0.65:.0f} "
        f"T {OSM_W + EXTENSION_W - 80},{SVG_H * 0.7:.0f}"
    )
    out.append(
        '<g id="east-lane" stroke="#fdf6dc" stroke-width="9" stroke-linecap="round" '
        'fill="none">'
    )
    out.append(f'  <path id="east-lane-trunk" data-name="Quex Road" d="{lane_d}"/>')
    out.append("</g>")

    # Branch up to Westgate (north-east)
    westgate_lane = (
        f"M{OSM_W + 250},{SVG_H * 0.62:.0f} "
        f"Q {OSM_W + 350},{SVG_H * 0.5:.0f} "
        f"{OSM_W + EXTENSION_W - 60},{SVG_H * 0.4:.0f}"
    )
    out.append(
        f'<path id="westgate-lane" data-name="Westgate Lane" d="{westgate_lane}" '
        f'stroke="#fdf6dc" stroke-width="9" stroke-linecap="round" fill="none"/>'
    )

    # Wyx Park — stylised SE zone
    wyx_x = OSM_W + 80
    wyx_y = SVG_H * 0.72
    wyx_w = 380
    wyx_h = SVG_H * 0.27
    out.append('<g id="wyx-park">')
    out.append(
        f'  <rect x="{wyx_x}" y="{wyx_y}" width="{wyx_w}" height="{wyx_h}" '
        f'fill="#7ea366" stroke="#5a7a4f" stroke-width="3" rx="14"/>'
    )
    # Tree clusters inside
    import random
    rnd = random.Random(42)
    for _ in range(28):
        tx = wyx_x + 20 + rnd.random() * (wyx_w - 40)
        ty = wyx_y + 20 + rnd.random() * (wyx_h - 40)
        r = 9 + rnd.random() * 7
        out.append(
            f'  <circle cx="{tx:.0f}" cy="{ty:.0f}" r="{r:.0f}" '
            f'fill="#5a7a4f" stroke="#3e5a35" stroke-width="1"/>'
        )
    # Label
    out.append(
        f'  <text x="{wyx_x + wyx_w/2:.0f}" y="{wyx_y + 36:.0f}" '
        f'font-family="Fredoka, sans-serif" font-size="26" font-weight="700" '
        f'fill="#fef9ef" text-anchor="middle" paint-order="stroke" '
        f'stroke="#3a3a3a" stroke-width="3">Wyx Park</text>'
    )
    out.append("</g>")

    # Westgate Golf Club — east zone
    wgc_x = OSM_W + 220
    wgc_y = SVG_H * 0.18
    wgc_w = 340
    wgc_h = SVG_H * 0.30
    out.append('<g id="westgate-golf">')
    out.append(
        f'  <rect x="{wgc_x}" y="{wgc_y}" width="{wgc_w}" height="{wgc_h}" '
        f'fill="#9bc28b" stroke="#6a8f5d" stroke-width="3" rx="14"/>'
    )
    # Fairway suggestions
    for fy in range(int(wgc_y) + 30, int(wgc_y + wgc_h) - 10, 36):
        out.append(
            f'  <ellipse cx="{wgc_x + wgc_w/2:.0f}" cy="{fy}" '
            f'rx="{wgc_w/2 - 30:.0f}" ry="10" fill="#a8d49d" opacity="0.6"/>'
        )
    # A few sand bunkers
    for bx_i, by_i in [(wgc_x + 60, wgc_y + 50), (wgc_x + wgc_w - 80, wgc_y + 110), (wgc_x + wgc_w/2, wgc_y + wgc_h - 40)]:
        out.append(
            f'  <ellipse cx="{bx_i:.0f}" cy="{by_i:.0f}" rx="22" ry="14" '
            f'fill="#f0e3b0" stroke="#c8a85c" stroke-width="1.5"/>'
        )
    # Label
    out.append(
        f'  <text x="{wgc_x + wgc_w/2:.0f}" y="{wgc_y + wgc_h/2:.0f}" '
        f'font-family="Fredoka, sans-serif" font-size="22" font-weight="700" '
        f'fill="#fef9ef" text-anchor="middle" paint-order="stroke" '
        f'stroke="#3a3a3a" stroke-width="3">Westgate Golf Club</text>'
    )
    out.append("</g>")

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
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")
    print(f"  canvas: {SVG_W}x{SVG_H}px (OSM 0..{OSM_W}, extension {OSM_W}..{SVG_W})")
    print(
        f"  {sum(len(v) for v in roads.values())} OSM roads, {len(green)} OSM green, "
        f"{len(pools)} pools, {1 if arc_plot_polygon else 0} A.R.C. plot polygon, "
        f"+ stylised Wyx Park + Westgate Golf Club"
    )


if __name__ == "__main__":
    main()
