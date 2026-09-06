#!/usr/bin/env python3
"""skew-topdown.py — put every top-down sprite on one camera, deterministically.

    python3 tools/skew-topdown.py --in manus-output/vehicles-pilot --out /tmp/skewed
    python3 tools/skew-topdown.py --in <dir> --out <dir> --taper 0.88
    python3 tools/skew-topdown.py --in <dir> --out <dir> --contact-sheet /tmp/s.jpg

The road scene is a bird's-eye view from an ELEVATED camera, so every vehicle
on it should be slightly narrower at the far end (top of the image) than at
the near end (bottom). Marcus, 2026-09-06: the existing 42 are drawn from
three different cameras — some pure overhead plan with no skew at all, some
correct, and the tractors and fire engine so steep they read as taking off.

**Why this is a warp rather than a prompt.** Asking the image model to change
the camera worked — and cost the drawing. In the pilot's second round the
skew arrived correctly and Bea came back as a featureless slab with her
wings, lamps and grille gone, and Henry lost his tyres. A projective warp
cannot drift: it is the same transform on every file, the artwork is carried
through unchanged, and the result is consistent across the set BY
CONSTRUCTION rather than by the model remembering.

**What it cannot do.** A warp changes the skew; it cannot invent geometry
that was never drawn. A sprite drawn as a pure plan gains its taper but
still shows no end face, and a sprite drawn too steep still shows too much
of one. Those two remain redraws. What this fixes is the skew, which is
what most of the set is missing.

`--taper` is the far-end width as a fraction of the near-end width. 0.88 was
chosen against `vehicle-topdown-henry-rear`, the one Marcus identified as
having the camera right; 0.94 is barely visible and 0.82 starts to look
like a vehicle tipping backwards.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

TAPER = 0.88
PAD = 0.12          # margin added before warping, so corners are not clipped

# Applying one taper to every file double-skews the ones that were already
# right. Caught on the road capture: the travel phase draws `henry-rear`,
# which is the sprite Marcus named as HAVING the camera correct, and it went
# through the warp anyway — 0.88 on top of a skew it already had. These keep
# their own geometry.
ALREADY_CORRECT = {
    'vehicle-topdown-henry-rear', 'vehicle-topdown-bea-rear',
    'vehicle-topdown-big-tilly', 'vehicle-topdown-big-tilly-rear',
    'vehicle-topdown-pickup',
}

# And the ones drawn too steep cannot be fixed by narrowing them — they need
# less end face, which is a redraw. Warping them only makes them narrower
# while still reading as tilted, so they are left alone and listed instead.
TOO_STEEP = {
    'vehicle-topdown-tractor', 'vehicle-topdown-tractor-red',
    'vehicle-topdown-tractor-blue', 'vehicle-topdown-tractor-rear',
    'vehicle-topdown-tractor-red-rear', 'vehicle-topdown-tractor-blue-rear',
    'vehicle-topdown-fireengine', 'vehicle-topdown-fireengine-rear',
}


def _coeffs(dst, src):
    """PIL's PERSPECTIVE maps OUTPUT (x, y) back to INPUT, so solve dst→src."""
    a, b = [], []
    for (dx, dy), (sx, sy) in zip(dst, src):
        a.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy]); b.append(sx)
        a.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy]); b.append(sy)
    return np.linalg.solve(np.array(a, dtype=float), np.array(b, dtype=float))


def skew(path, taper=TAPER, pad=PAD):
    """Narrow the top of the image to `taper` of the bottom, keeping the art."""
    im = Image.open(path).convert('RGBA')
    alpha = np.array(im)[..., 3]
    ys, xs = np.nonzero(alpha > 16)
    if len(ys) < 64:
        return None
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    m = int(max(im.size) * pad)
    canvas = Image.new('RGBA', (im.width + 2 * m, im.height + 2 * m), (0, 0, 0, 0))
    canvas.alpha_composite(im, (m, m))
    w, h = canvas.size
    inset = w * (1 - taper) / 2
    dst = [(inset, 0), (0, h), (w, h), (w - inset, 0)]
    src = [(0, 0), (0, h), (w, h), (w, 0)]
    out = canvas.transform((w, h), Image.PERSPECTIVE, _coeffs(dst, src), Image.BICUBIC)
    # re-crop: the warp leaves transparent wedges at the top corners
    a2 = np.array(out)[..., 3]
    ys, xs = np.nonzero(a2 > 16)
    return out.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='src', required=True)
    ap.add_argument('--out', dest='dst', required=True)
    ap.add_argument('--taper', type=float, default=TAPER)
    ap.add_argument('--contact-sheet', metavar='PATH',
                    help='also write a before/after sheet here')
    ap.add_argument('--all', action='store_true',
                    help='warp every file, ignoring ALREADY_CORRECT and TOO_STEEP')
    args = ap.parse_args()

    files = sorted(f for f in os.listdir(args.src) if f.endswith('.png'))
    if not files:
        sys.exit(f'no PNGs in {args.src}')
    os.makedirs(args.dst, exist_ok=True)

    done, skipped, passed, steep = [], [], [], []
    for f in files:
        stem = f[:-4]
        if not args.all and stem in TOO_STEEP:
            steep.append(f)
            continue
        taper = 1.0 if (not args.all and stem in ALREADY_CORRECT) else args.taper
        out = skew(os.path.join(args.src, f), taper)
        if out is None:
            skipped.append(f)
            continue
        out.save(os.path.join(args.dst, f))
        (passed if taper == 1.0 else done).append(f)
    print(f'{len(done)} skewed at taper {args.taper} → {args.dst}')
    if passed:
        print(f'  {len(passed)} already had the camera right, copied unchanged: '
              f'{", ".join(x[:-4] for x in passed)}')
    if steep:
        print(f'  {len(steep)} too steep for a warp to fix — these need redrawing: '
              f'{", ".join(x[:-4] for x in steep)}')
    if skipped:
        print(f'  skipped {len(skipped)} with no subject: {", ".join(skipped)}')
    done = done + passed

    if args.contact_sheet and done:
        c, pad, lab, left = 210, 6, 15, 58
        sheet = Image.new('RGB', (left + len(done) * (c + pad) + pad,
                                  lab + pad + 2 * (c + pad) + pad), (247, 244, 238))
        d = ImageDraw.Draw(sheet)
        for i, f in enumerate(done):
            d.text((left + i * (c + pad) + 2, 2), f[:-4][-22:], fill=(60, 54, 48))
        for row, base in enumerate((args.src, args.dst)):
            y = lab + pad + row * (c + pad)
            d.text((3, y + c // 2 - 5), ('before', 'skewed')[row], fill=(60, 54, 48))
            for i, f in enumerate(done):
                im = Image.open(os.path.join(base, f)).convert('RGBA')
                im.thumbnail((c, c), Image.LANCZOS)
                x = left + i * (c + pad)
                bg = Image.new('RGBA', (c, c), (255, 255, 255, 255))
                bg.alpha_composite(im, ((c - im.width) // 2, (c - im.height) // 2))
                sheet.paste(bg.convert('RGB'), (x, y))
                d.rectangle([x, y, x + c, y + c], outline=(214, 208, 196))
        sheet.convert('RGB').save(args.contact_sheet, quality=72)
        print(f'  sheet → {args.contact_sheet}')


if __name__ == '__main__':
    main()
