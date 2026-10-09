#!/usr/bin/env python3
"""Bring Trikey's lilac down to the lightness the fleet's greyscale ladder needs.

    python3 tools/correct-trikey-lilac.py                       # round 2 -> installed
    python3 tools/correct-trikey-lilac.py --dry-run
    python3 tools/correct-trikey-lilac.py --src X.png --out Y.png

The round-2 portrait (`manus-output/trikey-portrait/round2-lilac/`) came back
correct in every respect but one. Its lilac frame measures median
(192, 162, 204), L 174.6, against a brief that asked for (180, 152, 196),
L 165.4. That puts her 17.4 from Big Tilly on the lightness ladder, under the
threshold of 20, and the ladder is what lets a child who cannot tell colours
apart tell the vehicles apart.

This is a palette shift, not a repaint. The portrait is an 8-bit indexed PNG,
and the lilac is its own island in the palette: hue 277-324, with nothing at
all between 324 and 25 (wicker, saddle, wheels and pennant start there) and
four pixels between 180 and 277. So the lilac can be selected by palette entry,
exactly, and nothing else can be caught by accident.

**What changes.** The RGB of the in-band palette entries, by one per-channel
gain chosen so that the lilac median lands on the target. A gain rather than
an offset, so black stays near black and the shading inside the lilac keeps
its proportions; the lightest highlight and the darkest shadow move the same
way as the middle.

**What does not.** Every pixel's palette index, so the geometry is identical.
The whole tRNS table, so every alpha is identical, including the 253-254 that
the quantiser left on 43 entries (21,144 pixels). Every palette entry outside
the band, so wicker, saddle, wheels, pennant and ink are byte-identical. The
tool checks all three after writing and refuses to leave a file behind that
fails them.

The 253-254 alphas are deliberately left alone: the brief was the lilac only.
`install-crates.py` forces entries at alpha >= 240 to 255; if that is wanted
here it is a separate, one-line change, and is invisible at 1% in any case.
"""
import argparse
import colorsys
import os
import sys

import numpy as np
from PIL import Image

ROOT = '/Users/marcus/Projects/animal-rescue-centre'
SRC = f'{ROOT}/manus-output/trikey-portrait/round2-lilac/vehicle-trikey.png'
OUT = f'{ROOT}/apps/game/public/assets/driving/vehicles/vehicle-trikey.png'

TARGET = (180, 152, 196)     # lilac mid-tone: hue 278, saturation 0.22, L 165.4
BAND = (255.0, 330.0)        # degrees; the island is 277-324
MIN_SAT = 0.08               # keeps the grey-teal specks at hue 180 out of it


def hsv(rgb):
    h, s, v = colorsys.rgb_to_hsv(*[c / 255 for c in rgb])
    return h * 360, s, v * 255


def luma(rgb):
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def in_band(rgb):
    h, s, _ = hsv(rgb)
    return BAND[0] <= h <= BAND[1] and s > MIN_SAT


def read(path):
    im = Image.open(path)
    if im.mode != 'P':
        sys.exit(f'{path}: expected an indexed (P) PNG, got {im.mode}')
    pal = np.array(im.getpalette()[:768] + [0] * (768 - len(im.getpalette()))).reshape(-1, 3)
    tr = bytes(im.info.get('transparency', b''))
    alpha = np.full(256, 255, int)
    alpha[:len(tr)] = list(tr)
    return im, pal, tr, alpha


def lilac_median(im, pal, alpha):
    """Pixel-weighted per-channel median of the opaque lilac, as the note measured it."""
    idx = np.array(im)
    counts = np.bincount(idx.ravel(), minlength=256)
    entries = [i for i in range(256) if counts[i] and alpha[i] >= 128 and in_band(pal[i])]
    px = np.concatenate([np.repeat(pal[i][None, :], counts[i], 0) for i in entries])
    return np.median(px, axis=0), entries, counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=SRC)
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    im, pal, tr, alpha = read(args.src)
    med, entries, counts = lilac_median(im, pal, alpha)
    gain = np.array(TARGET) / med
    n_opaque = int(counts[alpha >= 128].sum())
    n_lilac = int(counts[entries].sum())
    print(f'lilac: {len(entries)} palette entries, {n_lilac} px = {100 * n_lilac / n_opaque:.2f}% of opaque')
    print(f'  median now  {tuple(int(v) for v in med)}  L {luma(med):.1f}  hue {hsv(med)[0]:.1f}  sat {hsv(med)[1]:.3f}')
    print(f'  target      {TARGET}  L {luma(TARGET):.1f}  hue {hsv(TARGET)[0]:.1f}  sat {hsv(TARGET)[1]:.3f}')
    print(f'  gain        ({gain[0]:.4f}, {gain[1]:.4f}, {gain[2]:.4f})')

    # Every entry the pixels might use, not only the opaque ones: the soft edge
    # of the frame is lilac too. Fully transparent entries have no pixels worth
    # moving and are left as they came.
    band_all = [i for i in range(256) if counts[i] and alpha[i] > 0 and in_band(pal[i])]
    new_pal = pal.copy()
    for i in band_all:
        new_pal[i] = np.clip(np.rint(pal[i] * gain), 0, 255).astype(int)
    print(f'  shifting {len(band_all)} entries ({len(band_all) - len(entries)} are soft-edge, alpha < 128)')

    if args.dry_run:
        print('dry run: nothing written')
        return

    out = im.copy()
    out.putpalette([int(v) for v in new_pal.reshape(-1)])
    tmp = args.out + '.tmp.png'
    out.save(tmp, transparency=tr, optimize=True)

    # Verify: indices, alpha and every out-of-band entry unchanged.
    chk, pal2, tr2, alpha2 = read(tmp)
    problems = []
    if not np.array_equal(np.array(im), np.array(chk)):
        problems.append('pixel indices changed')
    if tr != tr2:
        problems.append('tRNS (alpha) table changed')
    for i in range(256):
        same = np.array_equal(pal[i], pal2[i])
        if i in band_all and same and not np.array_equal(pal[i], new_pal[i]):
            problems.append(f'entry {i} was not shifted')
        if i not in band_all and not same:
            problems.append(f'entry {i} changed but is outside the band')
    if problems:
        os.remove(tmp)
        sys.exit('REFUSED: ' + '; '.join(problems))
    med2, _, _ = lilac_median(chk, pal2, alpha2)
    os.replace(tmp, args.out)
    print(f'  median after {tuple(int(v) for v in med2)}  L {luma(med2):.1f}  hue {hsv(med2)[0]:.1f}  sat {hsv(med2)[1]:.3f}')
    print(f'wrote {args.out} ({os.path.getsize(args.out) // 1024} KB); indices, alpha and out-of-band palette verified identical')


if __name__ == '__main__':
    main()
