#!/usr/bin/env python3
"""regrade-to-source.py — put a restyled sprite's saturation back where the
source sprite's was, without touching hue, value or alpha.

    python3 tools/regrade-to-source.py <restyled.png> --check
    python3 tools/regrade-to-source.py <restyled.png> --out <graded.png>
    python3 tools/regrade-to-source.py --dir <draftsdir> --out-dir <gradeddir>
    python3 tools/regrade-to-source.py --dir <draftsdir> --check

**Why this is a post-process and not a prompt clause.** The 2026-10-09 round's
`STYLE` already said "warm, limited and MUTED ... Lower the saturation from the
reference", and the probe came back 1.14x MORE saturated than its own source
(mean 0.666 -> 0.758). Five rounds of rewording have not moved it. Colour is
the one property of these sprites that can be set arithmetically from art we
already have, so it is set arithmetically and taken out of the prompt.

**What it does.** Histogram-matches the saturation channel: every opaque pixel
of the restyled sprite is moved to the saturation it would have if the
restyled set of saturations were redistributed to match the source's. Hue and
value are carried through untouched in float and only re-quantised at the end.
Matching the whole distribution rather than scaling the mean matters because
the fault is not a uniform lift — the probe's p90 ran further than its median.

**What it does not do.** It cannot put back detail the generator did not draw.
This is a grade, not a restyle; if the drawing is lit rather than drawn, a
regrade leaves it lit and merely less lurid.

**Alpha is asserted, not assumed.** The output's alpha channel is compared byte
for byte with the input's after the file has been written and read back, and
the script fails loudly if a single byte moved. That matters because every
consumer of these sprites measures the animal from its alpha — the bounds
table in `apps/game/src/ui/animal-sprite-bounds.ts`, `check-sprite-scale.py`,
and `install-restyled.py`'s crop — so a grade that nudged the matte would move
every animal on screen.

**Where it sits in the pipeline.** After `fetch`, before `install-restyled.py`:

    python3 tools/submit-animal-restyle.py fetch <batch_id> --group untested
    python3 tools/regrade-to-source.py --dir asset-drafts/.../untested \\
                                       --out-dir asset-drafts/.../untested-graded
    python3 tools/install-restyled.py --drafts .../untested-graded --stage-only

Install quantises to a 256-colour palette (`install-restyled.py:56`), so grade
BEFORE install: matching the distribution first and quantising second gives the
palette a sane distribution to pick from.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'apps/game/public/assets/animals')

ALPHA_MIN = 128      # a pixel is "the animal" for statistics at or above this
BINS = 4096          # saturation resolution for the CDF; 8-bit is too coarse
                     # to separate a median of 0.709 from one of 0.712


# --- colour -----------------------------------------------------------------
# Pillow's HSV conversion is 8-bit in and 8-bit out, which costs about one part
# in 255 of hue on every pixel. These two are float throughout, so the only
# quantisation in the whole grade is the final round back to uint8.

def rgb_to_hsv(rgb):
    """rgb float [0,1] (..., 3) -> h, s, v each float (...)."""
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.zeros_like(mx)
    nz = d > 0
    # which channel is the max decides the 60-degree sector
    im = rgb.argmax(-1)
    with np.errstate(divide='ignore', invalid='ignore'):
        h = np.where(nz & (im == 0), ((g - b) / np.where(d == 0, 1, d)) % 6, h)
        h = np.where(nz & (im == 1), ((b - r) / np.where(d == 0, 1, d)) + 2, h)
        h = np.where(nz & (im == 2), ((r - g) / np.where(d == 0, 1, d)) + 4, h)
    h = h / 6.0
    s = np.where(mx > 0, d / np.where(mx == 0, 1, mx), 0.0)
    return h, s, mx


def scale_chroma(rgb, v, k):
    """Scale each pixel's distance from its own brightest channel by `k`.

    This is exactly "keep hue and value, multiply saturation by k", written
    the way that makes both halves structurally true rather than reconstructed:
    V is the max channel and is left alone, and every channel keeps its
    proportion of the gap to V, which is what hue is. Reconstructing through
    HSV sectors gives bit-identical output on real sprites (measured) but has
    to be trusted; this does not.
    """
    v = v[..., None]
    return v - (v - rgb) * k[..., None]


# --- the grade --------------------------------------------------------------

def _cdf(values, bins=BINS):
    hist, _ = np.histogram(values, bins=bins, range=(0.0, 1.0))
    c = np.cumsum(hist).astype(np.float64)
    return c / c[-1] if c[-1] > 0 else c


def match_lut(src_values, dst_values, bins=BINS):
    """LUT over `bins` saturation buckets carrying dst's distribution to src's.

    Standard histogram specification: for each bucket of the image being
    graded, read off its cumulative probability and find the bucket of the
    target that holds the same cumulative probability.
    """
    c_dst = _cdf(dst_values, bins)
    c_src = _cdf(src_values, bins)
    centres = (np.arange(bins) + 0.5) / bins
    return np.interp(c_dst, c_src, centres)


def stats(values):
    if values.size == 0:
        return dict(n=0, mean=float('nan'), median=float('nan'), p90=float('nan'))
    return dict(n=int(values.size), mean=float(values.mean()),
                median=float(np.median(values)), p90=float(np.percentile(values, 90)))


def regrade(restyled_path, source_path, alpha_min=ALPHA_MIN):
    """Return (rgba_uint8, report). Pure — writes nothing."""
    dst = np.array(Image.open(restyled_path).convert('RGBA'))
    src = np.array(Image.open(source_path).convert('RGBA'))

    d_rgb = dst[..., :3].astype(np.float64) / 255.0
    d_a = dst[..., 3]
    s_rgb = src[..., :3].astype(np.float64) / 255.0
    s_a = src[..., 3]

    d_h, d_s, d_v = rgb_to_hsv(d_rgb)
    _, src_s, _ = rgb_to_hsv(s_rgb)

    d_solid = d_a >= alpha_min
    s_solid = s_a >= alpha_min
    if not d_solid.any() or not s_solid.any():
        sys.exit(f'{os.path.basename(restyled_path)}: nothing opaque to grade')

    lut = match_lut(src_s[s_solid], d_s[d_solid])
    idx = np.clip((d_s * BINS).astype(np.int64), 0, BINS - 1)
    new_s = lut[idx]

    # Applied to every pixel carrying any alpha, not only the solid ones, so
    # the antialiased rim stays the same colour as the body it belongs to.
    touch = d_a > 0
    k = np.where(touch & (d_s > 0), new_s / np.where(d_s > 0, d_s, 1.0), 1.0)

    out = dst.copy()
    out[..., :3] = np.clip(np.rint(scale_chroma(d_rgb, d_v, k) * 255.0), 0, 255).astype(np.uint8)

    # What actually changed, measured rather than claimed.
    a_h, a_s, a_v = rgb_to_hsv(out[..., :3].astype(np.float64) / 255.0)
    hue_d = np.abs(((a_h - d_h + 0.5) % 1.0) - 0.5)
    lit = d_solid & (d_v >= 0.2)      # above the key line and the deep shadow
    report = {
        'source': stats(src_s[s_solid]),
        'before': stats(d_s[d_solid]),
        'after': stats(a_s[d_solid]),
        # Hue and value are preserved by construction; what is left is the
        # final round to uint8, which can only move a pixel that is already
        # nearly black. Both numbers are reported so that is visible.
        'hue_drift_lit': float(hue_d[lit].max()) if lit.any() else 0.0,
        'hue_drift_max': float(hue_d[d_solid].max()),
        'hue_drift_mean': float(hue_d[d_solid].mean()),
        'value_drift': float(np.abs(a_v - d_v)[d_solid].max()),
        'alpha_equal_in_memory': bool(np.array_equal(out[..., 3], d_a)),
    }
    return out, report


def write_and_assert_alpha(out, restyled_path, out_path):
    """Write, read back, and refuse to leave a file whose alpha moved."""
    before = np.array(Image.open(restyled_path).convert('RGBA'))[..., 3]
    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or '.', exist_ok=True)
    Image.fromarray(out, 'RGBA').save(out_path, optimize=True)
    after = np.array(Image.open(out_path).convert('RGBA'))[..., 3]
    if before.shape != after.shape or not np.array_equal(before, after):
        n = int((before != after).sum()) if before.shape == after.shape else -1
        os.remove(out_path)
        sys.exit(f'FAIL: alpha changed in {out_path} ({n} bytes differ). Output deleted.')
    return int(before.size)


# --- plumbing ---------------------------------------------------------------

def source_for(path, src_dir):
    """`bat-brown-arriving-raw.png` and `bat-brown-arriving.png` both find
    `apps/game/public/assets/animals/bat-brown-arriving.png`."""
    stem = os.path.basename(path)[:-4]
    for cand in (stem, stem[:-4] if stem.endswith('-raw') else stem):
        p = os.path.join(src_dir, cand + '.png')
        if os.path.exists(p):
            return p
    return None


def line(name, r, wrote):
    s, b, a = r['source'], r['before'], r['after']
    print(f'{name}')
    print(f'  saturation   mean    median  p90')
    print(f'    source     {s["mean"]:.3f}   {s["median"]:.3f}   {s["p90"]:.3f}')
    print(f'    before     {b["mean"]:.3f}   {b["median"]:.3f}   {b["p90"]:.3f}'
          f'   ({b["mean"] / s["mean"]:.2f}x source)')
    print(f'    after      {a["mean"]:.3f}   {a["median"]:.3f}   {a["p90"]:.3f}'
          f'   ({a["mean"] / s["mean"]:.2f}x source)')
    print(f'  hue drift  mean {r["hue_drift_mean"]:.5f} turn, max {r["hue_drift_max"]:.5f} '
          f'(max {r["hue_drift_lit"]:.5f} above the key line); value drift max {r["value_drift"]:.5f}')
    print(f'  alpha {"unchanged, asserted on disk" if wrote else "unchanged in memory"}')


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('restyled', nargs='?', help='one restyled PNG')
    ap.add_argument('--dir', help='a directory of restyled PNGs instead')
    ap.add_argument('--source', help='the source sprite (default: matched by name in assets)')
    ap.add_argument('--src-dir', default=ASSETS, help='where sources live (default %(default)s)')
    ap.add_argument('--out', help='output path for a single file')
    ap.add_argument('--out-dir', help='output directory for --dir')
    ap.add_argument('--check', action='store_true', help='report before/after, write nothing')
    ap.add_argument('--alpha-min', type=int, default=ALPHA_MIN,
                    help='alpha at or above which a pixel counts as the animal (default %(default)s)')
    args = ap.parse_args()

    if bool(args.restyled) == bool(args.dir):
        ap.error('give exactly one of <restyled.png> or --dir')
    if args.dir and not (args.check or args.out_dir):
        ap.error('--dir needs --out-dir, or --check')
    if args.restyled and not (args.check or args.out):
        ap.error('give --out, or --check')

    todo = ([args.restyled] if args.restyled else
            [os.path.join(args.dir, f) for f in sorted(os.listdir(args.dir)) if f.endswith('.png')])
    if not todo:
        sys.exit('nothing to grade')

    done = missing = 0
    for p in todo:
        srcp = args.source if (args.source and args.restyled) else source_for(p, args.src_dir)
        if not srcp:
            print(f'{os.path.basename(p)}: no source in {args.src_dir} — skipped')
            missing += 1
            continue
        out, rep = regrade(p, srcp, args.alpha_min)
        if not rep['alpha_equal_in_memory']:
            sys.exit(f'FAIL: {p} alpha moved before writing — this is a bug, not a file problem.')
        wrote = False
        if not args.check:
            dest = args.out if args.restyled else os.path.join(
                args.out_dir, os.path.basename(p).replace('-raw.png', '.png'))
            write_and_assert_alpha(out, p, dest)
            wrote = True
        line(f'{os.path.basename(p)}  <- {os.path.basename(srcp)}'
             + ('' if args.check else f'  -> {dest}'), rep, wrote)
        done += 1
    print(f'\n{done} graded{" (check only, nothing written)" if args.check else ""}'
          + (f', {missing} without a source' if missing else ''))


if __name__ == '__main__':
    main()
