#!/usr/bin/env python3
"""Composite each overflowing skip onto the flatbed (filling the bed), plus an
empty variant, so the skip truck can pick a random load like the car picks a
colour. Output straight into the live driving asset dir."""
import sys
from PIL import Image

FINAL = "/Users/marcus/Projects/animal-rescue-centre/apps/game/public/admin/vehicle-restyle/final"
LIVE = "/Users/marcus/Projects/animal-rescue-centre/apps/game/public/assets/driving/topdown"

# Bed fill params (fractions of the truck sprite): centre and target width.
BED_CX = 0.50
BED_CY = 0.60      # centre of the bed, measured from the top
BED_W = 0.80       # skip width as a fraction of truck width (slightly over the rails)

truck = Image.open(f"{FINAL}/skiptruck-keyed.png").convert("RGBA")
W, H = truck.size


def crop_bbox(im):
    bb = im.getbbox()
    return im.crop(bb) if bb else im


# Empty flatbed variant.
crop_bbox(truck).save(f"{LIVE}/vehicle-topdown-skiptruck-empty.png")

for i in range(1, 6):
    skip = Image.open(f"{FINAL}/skip-{i}-keyed.png").convert("RGBA")
    tw = int(W * BED_W)
    scale = tw / skip.width
    th = int(skip.height * scale)
    skip2 = skip.resize((tw, th), Image.LANCZOS)
    base = truck.copy()
    x = int(W * BED_CX) - tw // 2
    y = int(H * BED_CY) - th // 2
    base.alpha_composite(skip2, (x, y))
    crop_bbox(base).save(f"{LIVE}/vehicle-topdown-skiptruck-{i}.png")
    print(f"skiptruck-{i}: skip {skip.size} -> {(tw, th)} at ({x},{y})")

print("empty + 5 loaded variants written to LIVE")
