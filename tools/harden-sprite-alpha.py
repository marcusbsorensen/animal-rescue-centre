#!/usr/bin/env python3
"""
harden-sprite-alpha.py — remove the soft, warm-tinted halo/shadow that painterly
gpt-image sprites carry around their edges.

The sprites render on a soft beige background; even after keying to transparency
the edge keeps a wide band of low-alpha, cream-tinted pixels. That band is
invisible on beige gravel but shows as an ugly beige box on grey tarmac / sand.

The fix: harden the alpha edge. Alpha at or below `lo` -> fully transparent;
at or above `hi` -> fully opaque; in between, rescaled 0..255. This drops the
faint halo (and any soft baked ground shadow, which is also low-alpha) while
leaving the solid body — and its interior claymation shading — untouched.
Finally re-crop to the alpha bounding box so sizing stays tight.

Usage:
    tools/harden-sprite-alpha.py <file-or-glob> [more...] [--lo 130] [--hi 210]

Defaults (lo=130, hi=210) were tuned against the driving fleet over tarmac.
Overwrites each file in place; the uncropped raw *.png remains the source.
"""
import sys, glob
from PIL import Image


def harden(path: str, lo: int, hi: int) -> str:
    img = Image.open(path).convert("RGBA")
    px = img.load()
    w, h = img.size
    span = max(1, hi - lo)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= lo:
                a2 = 0
            elif a >= hi:
                a2 = 255
            else:
                a2 = round((a - lo) / span * 255)
            if a2 != a:
                px[x, y] = (r, g, b, a2)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    img.save(path)
    return f"{path}  -> {img.size[0]}x{img.size[1]}"


def main(argv: list[str]) -> int:
    lo, hi, files = 130, 210, []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--lo":
            lo = int(argv[i + 1]); i += 2
        elif a == "--hi":
            hi = int(argv[i + 1]); i += 2
        else:
            files.extend(glob.glob(a)); i += 1
    if not files:
        print("no files matched", file=sys.stderr)
        return 1
    for f in sorted(files):
        print(harden(f, lo, hi))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
