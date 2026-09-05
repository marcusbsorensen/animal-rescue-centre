#!/usr/bin/env python3
"""audit-animal-style.py — how far is each sprite from the house style?

    python3 tools/audit-animal-style.py                     # ranked report
    python3 tools/audit-animal-style.py --ref snake-corn    # a different target
    python3 tools/audit-animal-style.py --json out.json     # for the sheet
    python3 tools/audit-animal-style.py --per-file          # sprite rows, not character rows

Marcus, 2026-09-05, named the axes: **key line, shading, texture and level
of detail**. Each becomes a measurement rather than an opinion, so that a
re-run after a regeneration says whether the set actually moved.

    key line   rim_contrast   how much darker the inked edge is than the
                              body it encloses, and how dark the darkest
                              ink goes at all
    texture    detail         high-frequency energy inside the subject —
                              scales, fur, hatching
    shading    modelling      luminance spread after a blur, which leaves
                              form-shading and removes texture
    palette    sat / colours   flat cartoon fills read as few, saturated
                              colours; painted work as many, muted ones

Every sprite is resampled so its SUBJECT is the same height before these
are measured. Without that, resolution alone would decide the answer — but
resolution is not thereby excused: a 128px sprite genuinely cannot carry
the reference's detail, so `px` is reported alongside and is usually the
real story.

Distances are in standard deviations across the whole set, so "2.4" means
this character sits two and a half sigma from the reference. The absolute
number means nothing; the ranking is the point.
"""
import argparse
import json
import os
import sys
from collections import defaultdict

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'apps/game/public/assets/animals')

NORM_H = 256          # every subject resampled to this height before measuring
RIM_FRAC = 0.045      # rim band as a fraction of subject height

POSES = {'arriving', 'sheltered', 'eating', 'sleeping', 'walking',
         'playing', 'sick', 'scared', 'grumpy', 'growling'}

# `modelling` and `sat_mean` are confounded by what the animal IS: a coiled
# snake has little large-scale luminance variation whatever hand drew it, so
# including them rewarded flatness and ranked the richly-painted collie as
# further from the snake than the 128px chibi puppy. The axes kept here are
# the ones that describe the DRAWING rather than the subject.
FEATURES = ['rim_contrast', 'edge_uniformity', 'ink_darkness',
            'detail', 'detail_native', 'colours']


def measure(path):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    alpha = a[..., 3]
    ys, xs = np.nonzero(alpha > 128)
    if len(ys) < 64:
        return None
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = im.crop((x0, y0, x1, y1))

    # normalise the SUBJECT to a fixed height, so style rather than
    # resolution is what the numbers compare
    scale = NORM_H / crop.height
    crop = crop.resize((max(8, int(crop.width * scale)), NORM_H), Image.LANCZOS)
    c = np.array(crop).astype(np.float32)
    mask = c[..., 3] > 128
    if mask.sum() < 256:
        return None

    rgb = c[..., :3]
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)

    body = lum[mask]

    # ── key line ──────────────────────────────────────────────
    # The rim is the band just inside the silhouette. A strong ink line
    # makes it markedly darker than the interior it encloses.
    band = max(2, int(NORM_H * RIM_FRAC))
    interior = ndimage.binary_erosion(mask, iterations=band)
    rim = mask & ~interior
    if rim.sum() > 32 and interior.sum() > 32:
        rim_contrast = float(np.median(lum[interior]) - np.median(lum[rim])) / 255.0
        # An even, deliberate stroke has a consistent darkness all the way
        # round; a painted edge varies with the light. Low = drawn outline.
        edge_uniformity = 1.0 - min(1.0, float(lum[rim].std()) / 64.0)
    else:
        rim_contrast = 0.0
        edge_uniformity = 0.0
    ink_darkness = float(255 - np.percentile(body, 3)) / 255.0

    # ── texture / level of detail ─────────────────────────────
    # High-frequency energy inside the subject, normalised by the subject's
    # own contrast so a dark sprite is not scored as a flat one.
    lap = ndimage.laplace(ndimage.gaussian_filter(lum, 0.6))
    inner = ndimage.binary_erosion(mask, iterations=max(2, band // 2))
    spread = float(body.std()) + 1e-3
    detail = float(np.abs(lap[inner]).mean() / spread) if inner.sum() > 64 else 0.0

    # The same measure at NATIVE scale — not style-fair, deliberately. It
    # answers "how much information is actually in this file", which is the
    # axis a 128px sprite loses on however it was drawn.
    nat = np.array(im.crop((x0, y0, x1, y1)).convert('RGBA')).astype(np.float32)
    nmask = nat[..., 3] > 128
    nlum = nat[..., :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    nin = ndimage.binary_erosion(nmask, iterations=2)
    if nin.sum() > 64:
        nlap = ndimage.laplace(ndimage.gaussian_filter(nlum, 0.6))
        detail_native = float(np.abs(nlap[nin]).mean() / (nlum[nmask].std() + 1e-3))
    else:
        detail_native = 0.0

    # ── shading / modelling ───────────────────────────────────
    # Blur away the texture; what is left is the modelling of form.
    soft = ndimage.gaussian_filter(lum, NORM_H * 0.02)
    modelling = float(soft[mask].std()) / 255.0

    # ── palette ───────────────────────────────────────────────
    sat_mean = float(sat[mask].mean())
    sat_std = float(sat[mask].std())
    q = (rgb[mask] // 16).astype(np.int32)
    colours = len(np.unique(q[:, 0] * 289 + q[:, 1] * 17 + q[:, 2]))
    colours = float(colours / (mask.sum() / 10000.0))   # per 10k subject px

    return {'rim_contrast': rim_contrast, 'edge_uniformity': edge_uniformity,
            'ink_darkness': ink_darkness, 'detail': detail,
            'detail_native': detail_native, 'modelling': modelling,
            'sat_mean': sat_mean, 'sat_std': sat_std, 'colours': colours,
            'px': int(im.size[0]), 'cover': float(nmask.sum()) / alpha.size,
            'bbox_fill': float(nmask.sum()) / max(1, nmask.size),
            # A curled hedgehog can legitimately fill 80% of its box. What
            # separates a painted backdrop CARD is its straight edges: the
            # border of the bounding box is opaque all the way round.
            'bbox_border': float(np.concatenate([
                nmask[0, :], nmask[-1, :], nmask[:, 0], nmask[:, -1]]).mean())}


def stem_of(name):
    """`cat-ginger-sleeping.png` → `cat-ginger`."""
    return name[:-4].rsplit('-', 1)[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', default=None,
                    help='reference CHARACTER — averages all its poses')
    ap.add_argument('--ref-file', default='snake-sheltered.png',
                    help='reference SPRITE (default: snake-sheltered.png). Sharper than '
                         '--ref when a character is not one style across its poses.')
    ap.add_argument('--json', metavar='PATH', help='write full results here')
    ap.add_argument('--per-file', action='store_true')
    ap.add_argument('--top', type=int, default=24)
    args = ap.parse_args()

    files = sorted(f for f in os.listdir(ASSETS)
                   if f.endswith('.png') and f[:-4].rsplit('-', 1)[-1] in POSES)
    rows = {}
    for f in files:
        m = measure(os.path.join(ASSETS, f))
        if m:
            rows[f] = m
    if not rows:
        sys.exit('no sprites measured')

    names = list(rows)
    X = np.array([[rows[n][k] for k in FEATURES] for n in names], dtype=np.float64)
    mu, sd = X.mean(0), X.std(0) + 1e-9
    Z = (X - mu) / sd

    if args.ref:
        ref_idx = [i for i, n in enumerate(names) if stem_of(n) == args.ref]
        ref_label = f'{args.ref} (mean of {len(ref_idx)} poses)'
    else:
        ref_idx = [i for i, n in enumerate(names) if n == args.ref_file]
        ref_label = args.ref_file
    if not ref_idx:
        sys.exit(f'no sprites for reference "{args.ref or args.ref_file}"')
    ref = Z[ref_idx].mean(0)
    dist = np.linalg.norm(Z - ref, axis=1)

    per_stem = defaultdict(list)
    for i, n in enumerate(names):
        per_stem[stem_of(n)].append(i)

    out = {'reference': ref_label,
           'features': FEATURES,
           # the two reported-but-excluded axes ride along so the sheet can
           # show what the reference measures on them
           'ref_raw': {**{k: float(v) for k, v in zip(FEATURES, X[ref_idx].mean(0))},
                       **{k: float(np.mean([rows[names[i]][k] for i in ref_idx]))
                          for k in ('modelling', 'sat_mean')}},
           'files': {n: dict(rows[n], distance=float(dist[i]))
                     for i, n in enumerate(names)},
           'stems': {}}
    for stem, idxs in per_stem.items():
        # Internal spread: how far this character's own poses sit from their
        # own mean. High means the character is not one style across its ten
        # sprites — which is how the base snake turned out to be three.
        own = Z[idxs]
        spread = float(np.linalg.norm(own - own.mean(0), axis=1).mean())
        out['stems'][stem] = {
            'distance': float(dist[idxs].mean()),
            'internal_spread': spread,
            'worst_pose': names[idxs[int(np.argmax(dist[idxs]))]],
            'px': int(np.median([rows[names[i]]['px'] for i in idxs])),
            'n': len(idxs),
            # `modelling` and `sat_mean` are reported but excluded from the
            # distance — see the note on FEATURES.
            **{k: float(np.mean([rows[names[i]][k] for i in idxs]))
               for k in FEATURES + ['modelling', 'sat_mean']},
        }

    backdrops = sorted(((n, rows[n]['bbox_border']) for n in names
                        if rows[n]['bbox_border'] > 0.6), key=lambda kv: -kv[1])
    out['backdrops'] = [{'file': n, 'bbox_border': v,
                         'bbox_fill': rows[n]['bbox_fill']} for n, v in backdrops]

    if args.json:
        with open(args.json, 'w') as fh:
            json.dump(out, fh, indent=1)
        print(f'wrote {args.json}')

    ref_raw = out['ref_raw']
    print(f'reference: {ref_label}')
    print('  ' + '  '.join(f'{k}={ref_raw[k]:.3f}' for k in FEATURES))
    print(f'\n{len(rows)} sprites · {len(per_stem)} characters · '
          f'distance in sigma across the set\n')

    if args.per_file:
        order = sorted(range(len(names)), key=lambda i: -dist[i])[:args.top]
        print(f'{"sprite":34} {"px":>5} {"dist":>6}')
        for i in order:
            print(f'{names[i]:34} {rows[names[i]]["px"]:5} {dist[i]:6.2f}')
        return 0

    rank = sorted(out['stems'].items(), key=lambda kv: -kv[1]['distance'])
    hdr = (f'{"character":24} {"px":>5} {"dist":>6} {"spread":>7}  '
           f'{"line":>6} {"detail":>7} {"shade":>6} {"sat":>5}')
    def row(stem, v):
        return (f'  {stem:22} {v["px"]:5} {v["distance"]:6.2f} {v["internal_spread"]:7.2f}  '
                f'{v["rim_contrast"]:6.3f} {v["detail"]:7.3f} '
                f'{v["modelling"]:6.3f} {v["sat_mean"]:5.2f}')
    print(hdr)
    print('  ── furthest from the reference')
    for stem, v in rank[:args.top]:
        print(row(stem, v))
    print('  ── closest to the reference')
    for stem, v in rank[-8:]:
        print(row(stem, v))

    incoherent = sorted(out['stems'].items(),
                        key=lambda kv: -kv[1]['internal_spread'])[:10]
    print('\n  ── least consistent WITH THEMSELVES (one character, ten styles)')
    for stem, v in incoherent:
        print(f'  {stem:22} spread {v["internal_spread"]:5.2f}   '
              f'worst pose: {v["worst_pose"]}')

    if backdrops:
        print(f'\n  ── painted backdrop or ground baked in ({len(backdrops)} sprites)')
        for n, v in backdrops[:12]:
            print(f'  {n:34} {v:.0%} of its bbox border is opaque '
                  f'(fills {rows[n]["bbox_fill"]:.0%})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
