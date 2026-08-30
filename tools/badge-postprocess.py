#!/usr/bin/env python3
"""Turn a Manus badge render into a set-matching 256x256 nav icon.

The nav badges are a disc on transparency. `nav-home.png` is the exemplar:
a 256 canvas whose alpha bbox is (9, 9, 247, 247) — a disc of diameter 238
centred with a 9px margin. Three of the five icons currently shipped
(nav-social, nav-care, fab-arc) are fully opaque instead, with white or grey
corners; this script normalises everything to nav-home's geometry.

Manus may deliver transparency, or a flat magenta field, or an opaque
background of some other flat colour. All three are handled: the disc is
located from whatever separates it from its surround, then re-cut to a clean
circle so the edge is ours rather than the model's.

    python3 tools/badge-postprocess.py IN.png OUT.png [--inspect]
"""

import sys
from PIL import Image, ImageDraw, ImageFilter

TARGET = 256
# nav-home.png's geometry, measured from the shipped file.
MARGIN = 9
DIAMETER = TARGET - 2 * MARGIN  # 238
SUPERSAMPLE = 8  # antialias the mask by cutting it large and downscaling


def find_disc(im):
    """Return (cx, cy, r) of the badge in image coordinates.

    Prefers real alpha. Falls back to keying the background colour sampled
    from the corners, which covers both the magenta fallback and an opaque
    white/grey field.
    """
    w, h = im.size
    alpha = im.split()[3]
    bbox = alpha.getbbox()
    opaque = alpha.histogram()[129:]
    opaque = sum(opaque)

    used_alpha = bbox is not None and opaque < 0.92 * w * h
    if used_alpha:
        x0, y0, x1, y1 = bbox
    else:
        px = im.load()
        corners = [px[1, 1], px[w - 2, 1], px[1, h - 2], px[w - 2, h - 2]]
        bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
        # Tolerance is generous: these renders have soft, slightly noisy fields.
        tol = 46
        mask = Image.new("L", (w, h), 0)
        mp = mask.load()
        for y in range(h):
            for x in range(w):
                r, g, b, _ = px[x, y]
                if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > tol:
                    mp[x, y] = 255
        # Drop specks so a stray pixel cannot widen the bbox.
        mask = mask.filter(ImageFilter.MedianFilter(5))
        bbox = mask.getbbox()
        if bbox is None:
            raise SystemExit("could not locate the badge against its background")
        x0, y0, x1, y1 = bbox

    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    r = min(x1 - x0, y1 - y0) / 2
    return cx, cy, r, ("alpha" if used_alpha else "keyed")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    inspect = "--inspect" in sys.argv
    if len(args) != 2:
        raise SystemExit(__doc__)
    src, dst = args

    im = Image.open(src).convert("RGBA")
    cx, cy, r, how = find_disc(im)

    if inspect:
        ratio = (2 * r) / max(im.size)
        print(f"{src}: size={im.size} via={how} centre=({cx:.0f},{cy:.0f}) "
              f"r={r:.0f} disc/canvas={ratio:.3f} (target {DIAMETER/TARGET:.3f})")

    # Crop a square exactly around the disc, then pad to nav-home's proportion.
    pad = r * (TARGET / DIAMETER)
    box = (round(cx - pad), round(cy - pad), round(cx + pad), round(cy + pad))
    cut = im.crop(box)  # crop() zero-fills anything outside the source

    big = TARGET * SUPERSAMPLE
    cut = cut.resize((big, big), Image.LANCZOS)

    mask = Image.new("L", (big, big), 0)
    inset = MARGIN * SUPERSAMPLE
    ImageDraw.Draw(mask).ellipse(
        (inset, inset, big - inset - 1, big - inset - 1), fill=255
    )

    out = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    out.paste(cut, (0, 0), mask)
    out = out.resize((TARGET, TARGET), Image.LANCZOS)

    # A keyed background leaves a rim of blended background colour just inside
    # the cut. Pull the edge in by a hair so none of it survives.
    if how == "keyed":
        trim = Image.new("L", (big, big), 0)
        bite = inset + SUPERSAMPLE * 2
        ImageDraw.Draw(trim).ellipse(
            (bite, bite, big - bite - 1, big - bite - 1), fill=255
        )
        trim = trim.resize((TARGET, TARGET), Image.LANCZOS)
        out.putalpha(Image.composite(out.split()[3], trim, trim.point(lambda v: 255 if v == 255 else 0)))

    out.save(dst)
    a = out.split()[3]
    print(f"wrote {dst} {out.size} via={how} "
          f"alpha_bbox={a.getbbox()} opaque={sum(a.histogram()[129:])}")


if __name__ == "__main__":
    main()
