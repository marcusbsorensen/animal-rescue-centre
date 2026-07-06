#!/usr/bin/env python3
"""
comfy-key-vehicle.py — turn a ComfyUI top-down vehicle render (painted on a
flat chroma background) into a clean transparent game sprite.

Steps: sample the background colour from the image corners, chroma-key it to
transparent with a soft feather, optionally rotate so the van points "up"
(front toward the top), autocrop to the sprite, and save an RGBA PNG.

Only depends on Pillow (the one image lib on this machine).

Usage:
    python3 tools/comfy-key-vehicle.py IN.png OUT.png [--rotate 0|90|180|270]
                                       [--pad 8] [--tin 70] [--tout 135]
"""
import argparse
import sys
from PIL import Image


def sample_bg(im: Image.Image) -> tuple[int, int, int]:
    """Median-ish background colour from the four corners."""
    w, h = im.size
    pts = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3),
           (w // 2, 2), (w // 2, h - 3)]
    px = im.load()
    rs = sorted(px[x, y][0] for x, y in pts)
    gs = sorted(px[x, y][1] for x, y in pts)
    bs = sorted(px[x, y][2] for x, y in pts)
    mid = len(pts) // 2
    return (rs[mid], gs[mid], bs[mid])


def key_out(im: Image.Image, bg: tuple[int, int, int], t_in: float, t_out: float) -> Image.Image:
    """Alpha = 0 within t_in of bg, 255 beyond t_out, linear ramp between."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    br, bg_, bb = bg
    span = max(1.0, t_out - t_in)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dist = ((r - br) ** 2 + (g - bg_) ** 2 + (b - bb) ** 2) ** 0.5
            if dist <= t_in:
                px[x, y] = (r, g, b, 0)
            elif dist >= t_out:
                pass  # keep opaque
            else:
                alpha = int(255 * (dist - t_in) / span)
                px[x, y] = (r, g, b, alpha)
    return im


def autocrop(im: Image.Image, pad: int) -> Image.Image:
    bbox = im.split()[3].getbbox()  # bbox of non-zero alpha
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(im.width, r + pad); b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("infile")
    ap.add_argument("outfile")
    ap.add_argument("--rotate", type=int, default=0, choices=[0, 90, 180, 270])
    ap.add_argument("--pad", type=int, default=8)
    ap.add_argument("--tin", type=float, default=70.0)
    ap.add_argument("--tout", type=float, default=135.0)
    args = ap.parse_args()

    im = Image.open(args.infile).convert("RGBA")
    bg = sample_bg(im)
    im = key_out(im, bg, args.tin, args.tout)
    if args.rotate:
        im = im.rotate(-args.rotate, expand=True)  # clockwise
    im = autocrop(im, args.pad)
    im.save(args.outfile)
    print(f"bg={bg}  ->  {args.outfile}  {im.size}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
