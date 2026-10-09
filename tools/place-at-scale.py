#!/usr/bin/env python3
"""place-at-scale.py — put every animal on its canvas at the size it really is.

    python3 tools/place-at-scale.py --out /tmp/scaled              # all 600
    python3 tools/place-at-scale.py --species dog --out /tmp/scaled
    python3 tools/place-at-scale.py --src asset-drafts/batch-restyle --out ...

Writes new files; overwrites nothing. Run `tools/check-sprite-scale.py` over
the output to confirm, then copy in when Marcus says so.

**Why this is a post-process and not a line in the brief.** Scale cannot be
bought from the generator, because `install-restyled.py` crops each sprite to
its subject and rebuilds a square canvas 6% larger (`MARGIN`, line 55) — so
whatever size the model drew, the installed sprite ends up filling its canvas.
Measured over the 90-cat pilot: all 90 landed between 0.9434 and 0.9453 of
their canvas on the long side, a spread of 0.002, which is the constant and
not the drawing. A scale clause in the prompt would be deleted here.

So the generator is asked for the one thing only it can give — the animal
whole, alone, large and on clean alpha — and the size is set afterwards,
arithmetically, from `SPECIES_SIZE` in the game source. Relative size then
costs nothing per sprite and a new species needs no measuring: give it a
number and re-run.

**Bottom-aligned, not centred.** `createAnimalSprite` contain-fits the whole
texture into a box (`sprites.ts:124`), so when every canvas is the same size
and the subject sits a fixed share of it above the floor, a row of them drawn
to one line stands on that line. Centring, which is what install does now,
leaves a bat floating at the middle of its box while a dog's feet reach the
bottom.

Downsamples only: at 1024 the largest subject wants 819px and arrives at
~950, so nothing is ever enlarged.
"""
import argparse
import importlib.util
import os
import sys

import numpy as np
from PIL import Image

# Reuses the table, the cap, the foot margin and the pending/variant figures
# from the checker, so the placer and the check cannot disagree. The hyphen in
# the filename is why this is not a plain import.
_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    'check_sprite_scale', os.path.join(_HERE, 'check-sprite-scale.py'))
chk = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(chk)

ROOT = chk.ROOT
SIZE = 512
COLOURS = 256


def place(src, want, size=SIZE):
    """Crop to the subject, then set it down at `want` of a square canvas."""
    im = Image.open(src).convert('RGBA')
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.nonzero(a > 8)
    if len(ys) < 64:
        return None, 'subject too small — empty or failed render'
    im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    long_px = max(im.size)
    scale = (want * size) / long_px
    new = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
    if scale > 1.02:
        return None, f'would enlarge x{scale:.2f} — subject drawn too small to place'
    im = im.resize(new, Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    floor = size - round(chk.FOOT_MARGIN * size) - im.height
    canvas.alpha_composite(im, ((size - im.width) // 2, max(0, floor)))
    return canvas.quantize(colors=COLOURS, method=Image.FASTOCTREE), None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=chk.ASSETS, help='where the sprites are now')
    ap.add_argument('--out', required=True, help='where to write the placed sprites')
    ap.add_argument('--species')
    ap.add_argument('--size', type=int, default=SIZE)
    args = ap.parse_args()

    table = chk.species_size()
    src = args.src if os.path.isabs(args.src) else os.path.join(ROOT, args.src)
    os.makedirs(args.out, exist_ok=True)

    done = failed = 0
    for f in sorted(os.listdir(src)):
        if not f.endswith('.png'):
            continue
        base = f[:-8] + '.png' if f.endswith('-raw.png') else f
        stem, _, pose = base[:-4].rpartition('-')
        if pose not in chk.POSES or not stem:
            continue
        if args.species and not (stem == args.species or stem.startswith(args.species + '-')):
            continue
        want = chk.target(stem, table)
        if want is None:
            print(f'  ! {base}: no scale for species "{stem.split("-")[0]}"')
            failed += 1
            continue
        img, err = place(os.path.join(src, f), want, args.size)
        if err:
            print(f'  ! {base}: {err}')
            failed += 1
            continue
        img.save(os.path.join(args.out, base), optimize=True)
        done += 1

    print(f'{done} placed · {failed} failed → {args.out}')
    print(f'verify: python3 tools/check-sprite-scale.py --src {args.out}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
