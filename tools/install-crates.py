#!/usr/bin/env python3
"""Install the six crate sprites.

256px: a bay draws at 48-110px depending on the grid and the window, so 256
carries a 2x retina bay with room to spare and costs a fraction of the 1024
source. Octree-256 quantisation to match the rest of the art pipeline, with
near-opaque palette entries forced fully opaque — the quantiser otherwise
leaves bodies at alpha 252-254, which is the bug the vehicle installs hit.

    python3 tools/install-crates.py                        # manus-output/crates/<name>.png
    python3 tools/install-crates.py --src manus-output/crates-v2 --suffix=-v2

The six must share ONE footprint in the source (round 3: 932x932 at 46px on
all four sides, zero spread). The crop below is to each drawing's own bounding
box, so a set whose footprints differ installs at six different scales. The
second invocation above is how round 3 went in without overwriting the
round-2 originals.
"""
import argparse
import os

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--src', default='/Users/marcus/Projects/animal-rescue-centre/manus-output/crates')
ap.add_argument('--suffix', default='', help="source filename suffix before .png, e.g. -v2")
args = ap.parse_args()
SRC = args.src
DST = '/Users/marcus/Projects/animal-rescue-centre/apps/game/public/assets/driving/crates'
SIZE = 256
NAMES = ['crate-standard', 'crate-secure', 'crate-quiet',
         'crate-ventilated-basket', 'crate-warm-vivarium', 'crate-perch-carrier']

os.makedirs(DST, exist_ok=True)
total = 0
for n in NAMES:
    s = os.path.join(SRC, n + args.suffix + '.png')
    if not os.path.exists(s):
        print(f'  MISSING {n}')
        continue
    im = Image.open(s).convert('RGBA')
    # Crop to the drawing, then letterbox square so every crate occupies the
    # same fraction of its texture — the grid relies on them matching.
    a = np.array(im)
    ys, xs = np.nonzero(a[..., 3] > 16)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    sq = sq.resize((SIZE, SIZE), Image.LANCZOS)

    q = sq.convert('RGB').quantize(colors=256, method=Image.FASTOCTREE)
    out = q.convert('RGBA')
    alpha = np.array(sq)[..., 3]
    alpha = np.where(alpha >= 240, 255, alpha)      # no see-through bodies
    o = np.array(out)
    o[..., 3] = alpha
    Image.fromarray(o).save(os.path.join(DST, n + '.png'), optimize=True)
    kb = os.path.getsize(os.path.join(DST, n + '.png')) // 1024
    total += kb
    print(f'  {kb:>4} KB  {n}.png')
print(f'{total} KB for six')
