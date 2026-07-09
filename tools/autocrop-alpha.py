#!/usr/bin/env python3
"""autocrop-alpha.py — crop a transparent PNG to its alpha bounding box.
Usage: python3 tools/autocrop-alpha.py IN.png OUT.png [--pad 8]
"""
import argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("infile")
ap.add_argument("outfile")
ap.add_argument("--pad", type=int, default=8)
args = ap.parse_args()

im = Image.open(args.infile).convert("RGBA")
bbox = im.split()[3].getbbox()
if bbox:
    l, t, r, b = bbox
    l = max(0, l - args.pad); t = max(0, t - args.pad)
    r = min(im.width, r + args.pad); b = min(im.height, b + args.pad)
    im = im.crop((l, t, r, b))
im.save(args.outfile)
print(f"{args.infile} -> {args.outfile} {im.size}")
