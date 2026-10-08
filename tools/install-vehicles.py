#!/usr/bin/env python3
"""install-vehicles.py — take repainted vehicle sprites from drafts to installed.

    python3 tools/install-vehicles.py --in manus-output/vehicles-livery --dry-run
    python3 tools/install-vehicles.py --in manus-output/vehicles-livery --stage-only
    python3 tools/install-vehicles.py --in manus-output/vehicles-livery
    python3 tools/install-vehicles.py --in <dir> --only henry,spark

This is `install-restyled.py` for `assets/driving/topdown/`. That tool was
written for animals and three of its assumptions are wrong for vehicles, so it
is not reused; the two that hold (a 256-colour palette, a backup before any
overwrite) are kept.

**What did not carry over.**

*Square 512px canvas with a margin.* PtvDriveScene scales every vehicle by
`img.width` (`setScale(vanW * VEHICLE_SIZE / img.width)`). The 42 sprites are
cropped tight to the vehicle, so width IS the vehicle's width and the
VEHICLE_SIZE table means something. Squaring would make `img.width` the
vehicle's long edge plus 6%, and every vehicle would draw about 0.6x as wide
as before. Vehicles are 0.5-0.7 as wide as they are tall, and the side
elevations 2:1; they stay that shape, tight-cropped, at the size they arrive.

*The species-pose filename scheme and `assets/animals`.* Vehicle files are
already named for what they replace (`vehicle-topdown-<name>.png`).

*Straight installation.* An animal needs no geometry. A top-down vehicle does,
and doing it wrong has already happened here once: one taper applied to every
file double-skews the ones that were drawn correctly. So the geometry step is
`skew-topdown.py` itself, imported rather than copied, which means its
ALREADY_CORRECT / TOO_STEEP / SIDE_ELEVATION sets are the single source of
truth and cannot drift from this tool.

**What it does, in order.**

1. *Gate.* Each sprite is compared with the one it replaces: silhouette IoU on
   the tight crops must reach `--min-iou`, and the same silhouette flipped
   (top-to-bottom for top-downs, left-to-right for side elevations) must NOT
   match better. That catches a drifted outline and a reversed vehicle, which
   a colour pass can do silently. A rejected sprite is reported and skipped;
   nothing else is held up. `--no-gate` for a deliberate redesign.
2. *Geometry*, per file, from skew-topdown's rules: skewed, or cropped only.
3. *256-colour palette*, FASTOCTREE, as install-restyled does. The installed
   set is mode P at 256; the 2026-09-06 installs were measured against this
   quantiser (mean RGB error 3.0 against 3.07 here).
4. *Opaque body.* Palette entries at alpha >= 240 are made 255; the soft edge
   is left alone. The quantiser leaves a body at 253-254, and Spark came back
   from the generator at 252 across the whole body, a vehicle you can faintly
   see tarmac through.
5. *Backup.* Every original is copied to `--backup-dir` and checked byte for
   byte BEFORE anything is overwritten. A backup file that already exists is
   never replaced: a second run would otherwise swap the true originals for
   the first run's output. Backups under `asset-drafts/` are gitignored, so
   for an original that was never committed (the 2026-09-06 pilot installs)
   this copy is the only one.
6. *Verify.* Each installed file is reopened and checked for size, mode,
   palette, tight crop and an opaque body.
"""
import argparse
import importlib.util
import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'apps/game/public/assets/driving/topdown')
STAGE = os.path.join(ROOT, 'asset-drafts/vehicles-staged')

COLOURS = 256
MIN_IOU = 0.90
SOLID_FROM = 240        # body alpha at or above this is lifted to 255
GATE_SIZE = 256         # silhouettes are compared on a normalised square

_spec = importlib.util.spec_from_file_location(
    'skew_topdown', os.path.join(ROOT, 'tools', 'skew-topdown.py'))
st = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(st)


def rule_for(stem):
    """(taper, why) for this sprite, or (None, why) when it must not be installed."""
    if stem in st.SIDE_ELEVATION:
        return 1.0, 'side elevation, cropped only'
    if stem in st.TOO_STEEP:
        return None, 'TOO_STEEP: needs a redraw, a warp cannot fix it'
    if stem in st.ALREADY_CORRECT:
        return 1.0, 'camera already right, cropped only'
    return st.TAPER, f'skewed at {st.TAPER}'


def silhouette(im):
    """Tight-cropped alpha mask resampled to a fixed square, so size drops out."""
    a = np.array(im.convert('RGBA'))[..., 3] > 16
    ys, xs = np.nonzero(a)
    c = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    sq = Image.fromarray((c * 255).astype('uint8')).resize((GATE_SIZE, GATE_SIZE))
    return np.array(sq) > 127


def iou(a, b):
    return (a & b).sum() / max(1, (a | b).sum())


def gate(src_path, ref_path, side, min_iou):
    """(ok, why). Compare the new art with the sprite it replaces."""
    new = silhouette(Image.open(src_path))
    ref = silhouette(Image.open(ref_path))
    same = iou(new, ref)
    flipped = iou(new[:, ::-1] if side else new[::-1], ref)
    axis = 'left-right' if side else 'top-bottom'
    if same < min_iou:
        return False, f'silhouette IoU {same:.3f} < {min_iou:.2f}: outline has drifted'
    if flipped > same:
        return False, f'reads as reversed {axis}: IoU {same:.3f} as drawn, {flipped:.3f} flipped'
    return True, f'IoU {same:.3f} (flipped {flipped:.3f})'


def translucent_body(im):
    """True when the body itself is see-through (median alpha under 255)."""
    a = np.array(im.convert('RGBA'))[..., 3]
    return bool(np.median(a[a > 16]) < 255)


def solid_palette(pal):
    """Make every nearly-opaque palette entry fully opaque.

    FASTOCTREE clusters colour and alpha together, so an interior colour that
    shares a cluster with a soft-edge pixel comes out at alpha 253 or 254, and
    a source whose whole body sits at 252 (Spark) keeps it. Measured on the
    2026-09-06 installs, only 14% of the body was exactly 255. One level in 255
    is invisible, but a body should be opaque, so the lift is made on the
    palette: edge entries below SOLID_FROM keep their soft alpha."""
    rgba = np.array(pal.getpalette('RGBA'), dtype=np.uint8).reshape(-1, 4)
    rgba[rgba[:, 3] >= SOLID_FROM, 3] = 255
    pal.putpalette(rgba.flatten().tolist(), 'RGBA')
    return pal


def verify(path, expect_size):
    """Reopen an installed file. Returns a list of problems (empty is good)."""
    im = Image.open(path)
    problems = []
    if im.size != expect_size:
        problems.append(f'size {im.size} != {expect_size}')
    if im.mode != 'P':
        problems.append(f'mode {im.mode}, installed set is P')
    elif len(im.getpalette()) // 3 > COLOURS:
        problems.append('palette over 256 colours')
    a = np.array(im.convert('RGBA'))[..., 3]
    body = a > 16
    ys, xs = np.nonzero(body)
    if len(ys) == 0:
        return problems + ['no subject']
    h, w = a.shape
    if min(ys.min(), xs.min(), h - 1 - ys.max(), w - 1 - xs.max()) > 2:
        problems.append('not tight-cropped')
    # Raw bodies measure 98.5-99% exactly 255; the remainder is the soft edge.
    if (a[body] == 255).mean() < 0.97:
        problems.append(f'body only {(a[body] == 255).mean():.1%} opaque')
    if (a == 0).mean() < 0.05:
        problems.append('almost no transparent area')
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='src', required=True, help='dir of vehicle-topdown-*.png')
    ap.add_argument('--only', help='comma-separated substrings; install only matching stems')
    ap.add_argument('--assets', default=ASSETS)
    ap.add_argument('--stage', default=STAGE)
    ap.add_argument('--backup-dir', default=None,
                    help='default: asset-drafts/pre-vehicle-install-backup-<n>')
    ap.add_argument('--min-iou', type=float, default=MIN_IOU)
    ap.add_argument('--no-gate', action='store_true', help='skip the silhouette/orientation gate')
    ap.add_argument('--stage-only', action='store_true', help='write the staged files and stop')
    ap.add_argument('--dry-run', action='store_true', help='show the plan, write nothing')
    args = ap.parse_args()

    only = [s for s in (args.only or '').split(',') if s]
    files = sorted(f for f in os.listdir(args.src)
                   if f.startswith('vehicle-topdown-') and f.endswith('.png')
                   and (not only or any(s in f[:-4] for s in only)))
    if not files:
        sys.exit(f'no vehicle-topdown-*.png in {args.src}')

    plan, rejected = [], []
    for f in files:
        stem = f[:-4]
        taper, why = rule_for(stem)
        ref = os.path.join(args.assets, f)
        if taper is None:
            rejected.append((f, why))
            continue
        if not args.no_gate and os.path.exists(ref):
            ok, gwhy = gate(os.path.join(args.src, f), ref, stem in st.SIDE_ELEVATION, args.min_iou)
            if not ok:
                rejected.append((f, gwhy))
                continue
            why += f'; gate {gwhy}'
        plan.append((f, taper, why))

    print(f'{len(plan)} to install from {args.src}')
    for f, taper, why in plan:
        new = '' if os.path.exists(os.path.join(args.assets, f)) else '  [NEW FILE, nothing to back up]'
        print(f'  {f[:-4]:38s} {why}{new}')
    for f, why in rejected:
        print(f'  REJECTED {f[:-4]}: {why}')
    if args.dry_run or not plan:
        print('\nnothing written (--dry-run)' if args.dry_run else '\nnothing to install')
        return

    # Convert everything before touching the game, so one bad file cannot
    # leave a half-installed set.
    os.makedirs(args.stage, exist_ok=True)
    staged = []
    for f, taper, why in plan:
        out = st.skew(os.path.join(args.src, f), taper)
        if out is None:
            print(f'  ! {f}: subject too small, likely an empty or failed render')
            rejected.append((f, 'no subject'))
            continue
        lifted = translucent_body(out)
        pal = solid_palette(out.quantize(colors=COLOURS, method=Image.FASTOCTREE))
        dst = os.path.join(args.stage, f)
        pal.save(dst, optimize=True)
        staged.append((f, pal.size, lifted))
    if args.stage_only:
        print(f'\n{len(staged)} staged in {args.stage}\nnothing installed (--stage-only)')
        return

    backup = args.backup_dir
    if not backup:
        n = 1
        while os.path.exists(os.path.join(ROOT, f'asset-drafts/pre-vehicle-install-backup-{n}')):
            n += 1
        backup = os.path.join(ROOT, f'asset-drafts/pre-vehicle-install-backup-{n}')
    os.makedirs(backup, exist_ok=True)
    clash = [f for f, _, _ in staged if os.path.exists(os.path.join(backup, f))]
    if clash:
        sys.exit(f'refusing to overwrite existing backups in {backup}: {", ".join(clash)}\n'
                 f'(they hold the true originals; pick a new --backup-dir)')

    for f, _, _ in staged:
        original = os.path.join(args.assets, f)
        if os.path.exists(original):
            kept = os.path.join(backup, f)
            shutil.copy2(original, kept)
            with open(original, 'rb') as a, open(kept, 'rb') as b:
                if a.read() != b.read():
                    sys.exit(f'backup of {f} does not match the original; nothing installed')

    bad = 0
    total_old = total_new = 0
    print(f'\n{"file":36s} {"was":>10s} {"now":>10s}  {"w/h was":>8s} {"now":>6s}  {"KB was":>6s} {"now":>4s}')
    for f, size, lifted in staged:
        dst = os.path.join(args.assets, f)
        old = Image.open(dst) if os.path.exists(dst) else None
        old_kb = os.path.getsize(dst) // 1024 if old else 0
        old_sz = old.size if old else None
        if old:
            old.close()
        shutil.copy2(os.path.join(args.stage, f), dst)
        problems = verify(dst, size)
        new_kb = os.path.getsize(dst) // 1024
        total_old += old_kb
        total_new += new_kb
        ar_old = f'{old_sz[0] / old_sz[1]:.3f}' if old_sz else '-'
        print(f'{f[:-4]:36s} {str(old_sz) if old_sz else "-":>10s} {str(size):>10s}  '
              f'{ar_old:>8s} {size[0] / size[1]:>6.3f}  {old_kb:>6d} {new_kb:>4d}'
              f'{"  (source body was see-through, made opaque)" if lifted else ""}'
              f'{"  PROBLEM: " + "; ".join(problems) if problems else ""}')
        bad += bool(problems)
    print(f'\n{len(staged)} installed, {len(rejected)} rejected, {bad} failed verification; '
          f'{total_old} KB -> {total_new} KB')
    print(f'installed over {args.assets}\noriginals backed up to {backup}')
    print('\nPtvDriveScene scales by img.width: a changed w/h shows as a changed on-screen length.')
    if bad:
        sys.exit(1)


if __name__ == '__main__':
    main()
