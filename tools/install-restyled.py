#!/usr/bin/env python3
"""install-restyled.py — take batch output from drafts to installed sprites.

    python3 tools/install-restyled.py --dry-run          # what would change
    python3 tools/install-restyled.py --stage-only       # write staged-512/, install nothing
    python3 tools/install-restyled.py                    # install over the originals
    python3 tools/install-restyled.py --species cat      # one species

`batch-restyle.py fetch` writes 1024px RGBA PNGs and then tells you in prose
to "matte, resize to 512, copy over the originals". This is that step, so it
is done the same way twice.

**What it does and why each part is there.**

*No matting.* gpt-image-2 with `background: transparent` already returns a
clean alpha — measured across the 90-cat pilot, zero painted backdrops and
zero soft-edge halos. `rembg-cut.py` is still the tool for output that needs
it (the serial path, or any model that paints a background), but running it
here would only resample an already-clean edge.

*Square canvas with a 6% margin.* `sprites.ts:131` contain-fits, so a sprite
whose subject touches the edge is drawn at a different effective scale from
one that does not. Squaring first makes every sprite's scale depend on the
animal rather than on how tightly the model happened to crop.

*512px.* What the set already is.

*256-colour palette.* The existing sprites are mode=P and average 64KB. The
raw RGBA lands at ~290KB, so 600 of them would add about 140MB to a game
that is served over the web. Octree-256 brings them to ~60KB — in line with
what is already there — and costs at most 0.036 on any axis the style audit
measures, mean 0.014. That is below the run-to-run variance of the generator
itself, so it is not a quality decision, only a file-size one.

*A backup, always.* The original is copied to `--backup-dir` before it is
overwritten, because the source sprite IS the reference the restyle was
generated from. Losing it means the next round has nothing to redraw from.
"""
import argparse
import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'apps/game/public/assets/animals')
DRAFTS = os.path.join(ROOT, 'asset-drafts/batch-restyle')

POSES = {'arriving', 'sheltered', 'eating', 'sleeping', 'walking',
         'playing', 'sick', 'scared', 'grumpy', 'growling'}

SIZE = 512
MARGIN = 1.06      # square canvas is 6% larger than the subject's long edge
COLOURS = 256


def convert(src):
    """Raw batch PNG → the 512px palette sprite the game loads."""
    im = Image.open(src).convert('RGBA')
    a = np.array(im)[..., 3]
    ys, xs = np.nonzero(a > 16)
    if len(ys) < 64:
        return None, 'subject too small — likely an empty or failed render'
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    side = int(max(im.size) * MARGIN)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    out = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    # FASTOCTREE is the only quantiser Pillow offers for RGBA without
    # libimagequant, which this Python is not built with.
    return out.quantize(colors=COLOURS, method=Image.FASTOCTREE), None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--drafts', default=DRAFTS, help='where the *-raw.png live')
    ap.add_argument('--species', help='only stems matching this species')
    ap.add_argument('--backup-dir', default=None,
                    help='default: asset-drafts/pre-restyle-backup-<n>')
    ap.add_argument('--stage-only', action='store_true',
                    help='write <drafts>/staged-512/ and stop')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    raws = sorted(f for f in os.listdir(args.drafts) if f.endswith('-raw.png'))
    jobs = []
    for f in raws:
        stem, _, pose = f[:-8].rpartition('-')
        if pose not in POSES or not stem:
            continue                      # probe files and other strays
        if args.species and not (stem == args.species or stem.startswith(args.species + '-')):
            continue
        jobs.append((f, f'{stem}-{pose}.png'))
    if not jobs:
        sys.exit(f'nothing to install from {args.drafts}')

    skipped = [f for f in raws if not any(f == j[0] for j in jobs)]
    print(f'{len(jobs)} sprites to install from {args.drafts}')
    if skipped:
        print(f'  ignoring {len(skipped)}: {", ".join(skipped[:4])}'
              f'{" …" if len(skipped) > 4 else ""}')

    missing = [dst for _, dst in jobs if not os.path.exists(os.path.join(ASSETS, dst))]
    if missing:
        print(f'  {len(missing)} would be NEW files (no original to replace): '
              f'{", ".join(missing[:4])}')
    if args.dry_run:
        for src, dst in jobs[:6]:
            print(f'  {src} → {dst}')
        print(f'  … {len(jobs)} total')
        return

    stage = os.path.join(args.drafts, 'staged-512')
    os.makedirs(stage, exist_ok=True)
    backup = args.backup_dir
    if not args.stage_only:
        if not backup:
            n = 1
            while os.path.exists(os.path.join(ROOT, f'asset-drafts/pre-restyle-backup-{n}')):
                n += 1
            backup = os.path.join(ROOT, f'asset-drafts/pre-restyle-backup-{n}')
        os.makedirs(backup, exist_ok=True)

    done = failed = 0
    for src, dst in jobs:
        img, err = convert(os.path.join(args.drafts, src))
        if err:
            print(f'  ! {dst}: {err}')
            failed += 1
            continue
        img.save(os.path.join(stage, dst), optimize=True)
        if not args.stage_only:
            original = os.path.join(ASSETS, dst)
            if os.path.exists(original):
                shutil.copy2(original, os.path.join(backup, dst))
            shutil.copy2(os.path.join(stage, dst), original)
        done += 1

    total = sum(os.path.getsize(os.path.join(stage, dst)) for _, dst in jobs
                if os.path.exists(os.path.join(stage, dst)))
    print(f'\n{done} converted · {failed} failed · {total // 1024} KB '
          f'({total // max(1, done) // 1024} KB each)')
    print(f'staged in {stage}')
    if args.stage_only:
        print('nothing installed (--stage-only)')
    else:
        print(f'installed over {ASSETS}')
        print(f'originals backed up to {backup}')
        print('\nverify: python3 tools/verify-animal-set.py')


if __name__ == '__main__':
    main()
