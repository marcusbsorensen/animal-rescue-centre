#!/usr/bin/env python3
"""Bring Trikey's ink into the fleet's hue family.

Her sprites carry a magenta cast nothing else in the fleet has: 8.6% of her
front's opaque pixels and 10.5% of her rear's are wine-blacks like rgb(72,0,30)
— red above blue above green, with green at zero. On screen it reads as a pink
halo under her cargo box.

The rest of the fleet inks in warm brown-black, red above green above blue:
Henry (43,31,29), Bea (52,35,22), Big Tilly (57,32,19). Mean hue about 21
degrees at about 0.55 saturation.

So this is a hue correction, not a repaint. Pixels in the magenta band keep
their VALUE — all the shading structure survives — and have their hue walked
round to the fleet's and their saturation pulled down to the fleet's. The blue
frame (hue ~210) and the wicker box (~35) are outside the band and untouched.
"""
import colorsys
import os
import shutil

import numpy as np
from PIL import Image

A = '/Users/marcus/Projects/animal-rescue-centre/apps/game/public/assets/driving/topdown'
BACKUP = '/Users/marcus/Projects/animal-rescue-centre/asset-drafts/pre-trikey-hue-backup'
TARGET_H, TARGET_S = 21.0 / 360.0, 0.55
BAND = (285.0, 352.0)          # magenta through to just short of red

os.makedirs(BACKUP, exist_ok=True)
for name in ('vehicle-topdown-trikey.png', 'vehicle-topdown-trikey-rear.png'):
    src = os.path.join(A, name)
    shutil.copy2(src, os.path.join(BACKUP, name))

    im = Image.open(src).convert('RGBA')
    a = np.array(im).astype(np.float64)
    rgb, alpha = a[..., :3] / 255.0, a[..., 3]

    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    delta = mx - mn
    # hue, vectorised
    h = np.zeros_like(mx)
    nz = delta > 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    ir, ig, ib = (mx == r) & nz, (mx == g) & nz, (mx == b) & nz
    h[ir] = (60 * (((g - b)[ir] / delta[ir]) % 6))
    h[ig] = (60 * (((b - r)[ig] / delta[ig]) + 2))
    h[ib] = (60 * (((r - g)[ib] / delta[ib]) + 4))
    s = np.where(mx > 1e-6, delta / np.maximum(mx, 1e-6), 0.0)
    v = mx

    hit = (alpha > 16) & (h >= BAND[0]) & (h <= BAND[1]) & (s > 0.15)
    n = int(hit.sum())

    out = rgb.copy()
    ys, xs = np.nonzero(hit)
    for y, x in zip(ys, xs):
        # Value kept exactly; hue moved to the fleet's; saturation eased down
        # rather than clamped, so a strongly coloured pixel stays stronger.
        ns = min(s[y, x], TARGET_S) if s[y, x] > TARGET_S else s[y, x]
        out[y, x] = colorsys.hsv_to_rgb(TARGET_H, ns, v[y, x])

    a[..., :3] = np.clip(out * 255.0, 0, 255)
    Image.fromarray(a.astype(np.uint8)).save(src, optimize=True)
    print(f'{name}: recoloured {n} px ({100 * n / (alpha > 16).sum():.1f}% of opaque)')

print(f'originals backed up to {BACKUP}')
