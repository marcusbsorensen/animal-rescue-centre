#!/usr/bin/env python3
"""glass-rears.py — finish the glass canon on the two rear top-downs: Henry's rear doors tinted, Spark's far windscreen clear.

    python3 tools/glass-rears.py --out /tmp/rears                # both, gated, written to /tmp/rears
    python3 tools/glass-rears.py --out /tmp/rears --install      # and install each file that passes its gates

Nothing is installed unless `--install` is given. The rears are read from git (`SOURCE_REV`, the commit
that installed the shortened top-downs), so a second run after installing starts from the originals and
writes the same bytes. Run it after `redraw-fronts.py --install`: one of its gates compares Spark's two
windscreens, and the front is read from the installed file.

WHY. `docs/fleet-canon.md` section 4: the animal space is tinted and the cab is clear. `tint-glass.py` and
`redraw-fronts.py` brought the portraits and the fronts to it and left the two rears alone, because the
rears are the camera reference (section 3) and a reference is not edited in passing. Glass is not the
camera: nothing here moves a pixel of the silhouette, and Marcus has approved the section. Two rears
still disagreed with it, and two of the children's three views of each van disagreed with the third:

    vehicle-topdown-henry-rear   two CLEAR teal windows in the rear doors. That is animal space.
    vehicle-topdown-spark-rear   a DARK windscreen slot at its far end. That is the cab, which his new front
                                 draws clear, so his two ends disagreed.

HENRY. The two panes (the teal pieces inside the ink of each window, holes filled) are filled with Spark's
rear window, which is the one treatment the canon defines: smoked charcoal, neutral, fully opaque, base RGB
(53, 55, 54) with the diagonal sheen streaks rising to about (102, 102, 103). It is not matched to those
numbers, it is those pixels: `tint-glass.py` cut a piece of that glass for Spark's portrait and so does
this, the left pane from the left of it and the right pane from the right, so the two doors do not carry
one reflection twice. The ink round each window, the door seam and the paw-heart below are not touched.

SPARK. The slot is the one dark piece of the far end, with its ink line and the soft edge of it left as
drawn, and it is mapped to clear glass by `redraw-fronts.lighten_glass`, the function that cleared his
front's windscreen, so the two ends have one glass: the pale mottled blue-grey of the windscreens, 138,160,180
to 196,210,220, with the streaks the generator drew. His rear window, at the other end, is the tinted one the
canon wants and is not touched.

THE PALETTE. These are 256-colour files and a pale blue-grey is not in Spark's. `decorate-roof.grow_palette`
makes room in place (the repo's own method for this): the cheapest near-duplicate shades are merged into their
neighbours and the slots they free take the new glass's colours. Every pixel keeps its alpha exactly, and every
pixel outside the glass keeps its palette index; the few that had a merged shade (7 on Henry, 83 on Spark, none
by more than 18 of 255) change by that much. Henry's paw-heart entries are locked so that nothing is merged out of
them, and so are the shades of Spark's rear window.

GATES, run on every file and `--install` installs nothing that fails:
  alpha     the file's alpha is byte-identical to the original's: silhouette, width, length, fringe cannot move
  canvas    the canvas, which `PtvDriveScene` scales by, is the same
  outside   outside the glass at most 150 pixels change colour, by at most 24 of 255 (a merged near-duplicate)
  paw       Henry: not one pixel differs in the box round the paw-heart
  glass     Henry: both panes are the canon's tint (mean within 15 RGB units of (69,71,71), 95th percentile
            of luma under 125, none brighter than 140, the reference's own) and no teal is left in them;
            Spark: the slot is one piece of clear glass, as pale as the front's windscreen
  agree     Spark: the rear's windscreen and the front's are the same glass (mean within 20 RGB units)
  tail      Spark: the rear window at the other end is the pixels it was
  livery    the four bands of the audit (0-6, 6-20, 35-55, 75-92% of painted height) within 60 RGB of maroon
            (142,52,54) / leaf green (116,156,102)
  file      mode P, <=256 colours, tight crop, opaque body (`install-vehicles.verify`)
"""
import argparse
import importlib.util
import io
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, binary_fill_holes, binary_opening, label

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'apps/game/public/assets/driving/topdown')
ASSETS_REL = 'apps/game/public/assets/driving/topdown'
SOURCE_REV = 'f4cc906'          # the commit that installed the shortened top-downs, as in redraw-fronts.py


def _load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rf = _load_module('redraw_fronts', os.path.join(ROOT, 'tools', 'redraw-fronts.py'))
tg = _load_module('tint_glass', os.path.join(ROOT, 'tools', 'tint-glass.py'))
dr = _load_module('decorate_roof', os.path.join(ROOT, 'tools', 'decorate-roof.py'))
iv, rc = rf.iv, rf.rc

LIVERY = {'henry': (142, 52, 54), 'spark': (116, 156, 102)}
LIVERY_MAX = 60
LUMA = np.array([0.299, 0.587, 0.114])

# Henry's windows: the box that holds both panes (x0, y0, x1, y1). The left pane is cut from the left half of the
# reference glass and the right pane from the right half, so the two doors do not carry one reflection twice; in its
# half each takes the piece whose colour is nearest the treatment's own (mean (69,71,71), 95th percentile of luma 106),
# stepping `step` px, because a cut from the middle is all streak and a cut from an edge is none.
HENRY = dict(box=(85, 800, 475, 935), min_pane=5000, step=4, p95=106.0)
# Spark's far-end windscreen: the dark piece through the seed (x, y), found among the dark, un-green, opaque
# pixels of the rows above `rows`, the way `redraw-fronts.glass_region` finds his front's. His rear window, at the
# other end, is the rows `tail_rows`.
SPARK = dict(seed=(320, 130), rows=(0, 400), tail_rows=(640, 860))
GATE = dict(outside_px=150, outside_step=24, tint_dist=15.0, tint_p95=125, tint_max=140, agree=20.0)
# The mean colour error the glass's own palette slots may have (`grow_palette` takes the fewest that meet it). The
# repo's default is 6 of 255, which is made for a motif. The cut of the canon's glass that Henry's panes take has 15
# distinct colours, so 0 gives it exactly, in 16 slots (it tries 4, 6, 8, 12, 16...); anything looser leaves some of the brighter streak pixels on the
# nearest teal in the palette, which is a few hundred pixels of teal in a charcoal pane. Spark's clear glass is 12 slots
# at 1.5 (mean error 0.2 of 255) and 16 at 0.25, which is 100 more pixels shifted in the body for an error already under one.
PALETTE_ERR = {'henry': 0.0, 'spark': 1.5}


# ---------------------------------------------------------------------------------- sources

def load_rear(name):
    blob = subprocess.run(['git', 'show', f'{SOURCE_REV}:{ASSETS_REL}/vehicle-topdown-{name}-rear.png'],
                          cwd=ROOT, check=True, capture_output=True).stdout
    im = Image.open(io.BytesIO(blob))
    im.load()
    return im, np.array(im.convert('RGBA'))


def installed_rgba(stem):
    return np.array(Image.open(os.path.join(ASSETS, stem + '.png')).convert('RGBA'))


# ---------------------------------------------------------------------------------- Henry

def henry_panes(rgba):
    """The two window panes of Henry's rear doors, left then right: the teal pieces inside each window's ink
    (anything greener than it is red, which the maroon and the ink are not), holes filled."""
    r, g, a = [rgba[..., i].astype(int) for i in (0, 1, 3)]
    x0, y0, x1, y1 = HENRY['box']
    box = np.zeros(a.shape, bool)
    box[y0:y1, x0:x1] = True
    lab, n = label((g > r) & (a > 200) & box)
    sizes = [int((lab == i).sum()) for i in range(1, n + 1)]
    big = [i + 1 for i, s in enumerate(sizes) if s >= HENRY['min_pane']]
    assert len(big) == 2, f'expected two panes of at least {HENRY["min_pane"]} px, found sizes {sorted(sizes)[-4:]}'
    panes = [binary_fill_holes(lab == i) for i in big]
    panes.sort(key=lambda m: int(np.nonzero(m)[1].min()))
    return panes


def tint_henry(rgba):
    """New RGB for Henry's panes: pieces of Spark's rear window, the canon's one tint. -> (new rgba, mask)."""
    ref = np.array(tg.load_git(tg.TOPDOWN_REL, tg.REFERENCE['stem']).convert('RGBA'))
    r0, r1 = tg.REFERENCE['rows']
    c0, c1 = tg.REFERENCE['cols']
    cx = (c0 + c1) // 2
    new = rgba.copy()
    panes = henry_panes(rgba)
    for pane, half in zip(panes, ((c0, cx), (cx, c1))):
        ys, xs = np.nonzero(pane)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        h, w = y1 - y0, x1 - x0
        m = pane[y0:y1, x0:x1]
        assert h <= r1 - r0 and w <= half[1] - half[0], 'the pane is bigger than the glass it is cut from'
        best = None
        for ty in range(r0, r1 - h + 1, HENRY['step']):
            for tx in range(half[0], half[1] - w + 1, HENRY['step']):
                px = ref[ty:ty + h, tx:tx + w, :3][m].astype(float)
                score = float(np.linalg.norm(px.mean(0) - tg.TINT_MEAN)) + 0.5 * abs(float(np.percentile(px @ LUMA, 95)) - HENRY['p95'])
                score += 100.0 * int((px[:, 1] > px[:, 0] + 12).sum())      # a pixel of Spark's body at the edge of the glass
                if best is None or score < best[0]:
                    best = (score, ty, tx)
        _, ty, tx = best
        sub = new[y0:y1, x0:x1, :3]
        sub[m] = ref[ty:ty + h, tx:tx + w, :3][m]
    return new, panes[0] | panes[1]


# ---------------------------------------------------------------------------------- Spark

def spark_slot(rgba):
    """The windscreen slot at Spark's far end: the dark, un-green, opaque piece through the seed, holes filled."""
    r, g, a = [rgba[..., i].astype(int) for i in (0, 1, 3)]
    luma = rgba[..., :3].astype(float) @ LUMA
    dark = (luma < 135) & (g - r < 25) & (a > 200)
    sel = np.zeros(dark.shape, bool)
    sel[SPARK['rows'][0]:SPARK['rows'][1]] = True
    lab, _ = label(binary_opening(dark & sel, structure=np.ones((3, 3))))
    sx, sy = SPARK['seed']
    assert lab[sy, sx] > 0, 'the seed is not in the windscreen slot'
    return binary_fill_holes(lab == lab[sy, sx]), luma


def clear_spark(rgba):
    mask, luma = spark_slot(rgba)
    return rf.lighten_glass(rgba, mask, luma), mask


# ---------------------------------------------------------------------------------- build and gates

def build(name):
    im, rgba = load_rear(name)
    new, mask = tint_henry(rgba) if name == 'henry' else clear_spark(rgba)
    protect = None
    if name == 'henry':
        pm = dr.paw_pixels(rgba)
        assert pm.any(), 'no paw-heart found'
        lab, n = label(binary_dilation(pm, iterations=2))
        big = lab == (int(np.argmax([(lab == i).sum() for i in range(1, n + 1)])) + 1)
        ys, xs = np.nonzero(big & pm)
        protect = np.zeros(pm.shape, bool)
        protect[max(0, ys.min() - 6):ys.max() + 7, max(0, xs.min() - 6):xs.max() + 7] = True
    if name == 'spark':
        # his rear window is the canon's own glass and is not to be touched: its shades are never merged away
        protect = np.zeros(mask.shape, bool)
        protect[SPARK['tail_rows'][0]:SPARK['tail_rows'][1]] = True
    out, stats = dr.grow_palette(im, new, protect=protect, err_limit=PALETTE_ERR[name])
    return im, rgba, new, mask, protect, out, stats


def band_distances(rgba, name):
    want = np.array(LIVERY[name], float)
    return [float(np.linalg.norm(b['dominant'] - want)) for b in rc.band_colours(rgba)]


def pale_glass(rgba, rows):
    r, b, a = [rgba[..., i].astype(int) for i in (0, 2, 3)]
    pale = (b > r + 8) & (a > 200) & (b > 120)
    sel = np.zeros(pale.shape, bool)
    sel[rows[0]:rows[1]] = True
    return pale & sel


def gates(name, src, mask, protect, stats, path):
    out = np.array(Image.open(path).convert('RGBA'))
    res = []
    same_alpha = bool((out[..., 3] == src[..., 3]).all())
    res.append(('alpha', same_alpha, f'{int((out[..., 3] != src[..., 3]).sum())} of {int((src[..., 3] > 0).sum())} visible pixels differ in alpha: silhouette, length and fringe are the original\'s'))
    res.append(('canvas', Image.open(path).size == (src.shape[1], src.shape[0]), f'canvas {src.shape[1]}x{src.shape[0]} (what PtvDriveScene scales by)'))
    changed = (out[..., :3] != src[..., :3]).any(-1)
    near = binary_dilation(mask, iterations=2)
    step = np.abs(out[..., :3].astype(int) - src[..., :3].astype(int)).max(-1)
    far = changed & ~near
    res.append(('outside', int(far.sum()) <= GATE['outside_px'] and (int(step[far].max()) if far.any() else 0) <= GATE['outside_step'],
                f'{int(far.sum())} pixels outside the glass change colour (a merged near-duplicate shade), the largest by '
                f'{int(step[far].max()) if far.any() else 0} of 255; palette: {stats["merged"]} merged, {stats["slots"]} slots for the glass, '
                f'glass colour error {stats["motif_err"]:.2f} of 255'))
    luma = out[..., :3].astype(float) @ LUMA
    if name == 'henry':
        ys, xs = np.nonzero(protect)
        box = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
        d = int((out[box] != src[box]).any(-1).sum())
        res.append(('paw', d == 0, f'{d} pixels differ in the box round the paw-heart (rows {ys.min()}-{ys.max()}, columns {xs.min()}-{xs.max()})'))
        lm = luma[mask]
        mean = out[..., :3][mask].astype(float).mean(0)
        dist = float(np.linalg.norm(mean - tg.TINT_MEAN))
        p95, mx = float(np.percentile(lm, 95)), float(lm.max())
        r, b, a = [out[..., i].astype(int) for i in (0, 2, 3)]
        teal = int((((b > r + 8) & (a > 200))[mask]).sum())
        res.append(('glass', dist <= GATE['tint_dist'] and p95 < GATE['tint_p95'] and mx <= GATE['tint_max'] and teal == 0,
                    f'both panes: mean colour {tuple(int(round(v)) for v in mean)}, {dist:.1f} RGB units from the canon tint {tuple(int(v) for v in tg.TINT_MEAN)}; '
                    f'luma median {np.median(lm):.0f}, 95th percentile {p95:.0f}, brightest {mx:.0f} (limits {GATE["tint_p95"]}, {GATE["tint_max"]}); {teal} teal pixels left'))
    else:
        # the pale pieces round the slot: the windscreen, and nothing else of the far end (the mirrors are white and
        # lie outside the slot's own box)
        ys, xs = np.nonzero(mask)
        zone = np.zeros(mask.shape, bool)
        zone[max(0, ys.min() - 8):ys.max() + 9, max(0, xs.min() - 8):xs.max() + 9] = True
        pale = pale_glass(out, (0, out.shape[0])) & zone
        lab, n = label(pale)
        pieces = [int((lab == i).sum()) for i in range(1, n + 1) if (lab == i).sum() >= 400]
        med = float(np.median(luma[pale])) if pale.any() else 0.0
        res.append(('glass', len(pieces) == 1 and med >= 140,
                    f'{len(pieces)} piece of clear glass at the far end ({pieces[0] if pieces else 0} px), median luma {med:.0f} (a windscreen is 140 or more)'))
        front = installed_rgba('vehicle-topdown-spark')
        fpale = pale_glass(front, SPARK['tail_rows'])
        fmean = front[..., :3][fpale].astype(float).mean(0)
        rmean = out[..., :3][pale].astype(float).mean(0)
        dist = float(np.linalg.norm(fmean - rmean))
        res.append(('agree', dist <= GATE['agree'],
                    f'rear windscreen mean colour {tuple(int(round(v)) for v in rmean)}, the front\'s {tuple(int(round(v)) for v in fmean)}: {dist:.1f} RGB units apart (limit {GATE["agree"]:.0f})'))
        t0, t1 = SPARK['tail_rows']
        d = int((out[t0:t1] != src[t0:t1]).any(-1).sum())
        res.append(('tail', d == 0, f'{d} pixels differ in rows {t0}-{t1}, which hold the rear window'))
    dist = band_distances(out, name)
    res.append(('livery', max(dist) <= LIVERY_MAX, 'bands 0-6/6-20/35-55/75-92: ' + ' '.join(f'{v:.1f}' for v in dist) +
                f' RGB units from {LIVERY[name]} (limit {LIVERY_MAX}); was ' + ' '.join(f'{v:.1f}' for v in band_distances(src, name))))
    problems = iv.verify(path, Image.open(path).size)
    res.append(('file', not problems, 'mode P, <=256 colours, tight crop, opaque body' if not problems else '; '.join(problems)))
    return res


# ---------------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', help='where the files are written (default: a temp dir)')
    ap.add_argument('--only', help='only the stems that contain this')
    ap.add_argument('--install', action='store_true', help='copy each file that passes its gates over the one in assets/')
    args = ap.parse_args()
    out_dir = args.out or tempfile.mkdtemp(prefix='glass-rears-')
    os.makedirs(out_dir, exist_ok=True)
    failed = []
    for name in ('henry', 'spark'):
        if args.only and args.only not in name:
            continue
        print(f'{name}-rear')
        im, src, new, mask, protect, out, stats = build(name)
        path = os.path.join(out_dir, f'vehicle-topdown-{name}-rear.png')
        out.save(path, optimize=True)
        results = gates(name, src, mask, protect, stats, path)
        for gname, ok, detail in results:
            print(f'    [{"pass" if ok else "FAIL"}] {gname:8s} {detail}')
        if all(ok for _, ok, _ in results):
            if args.install:
                with open(path, 'rb') as fh:
                    data = fh.read()
                with open(os.path.join(ASSETS, f'vehicle-topdown-{name}-rear.png'), 'wb') as fh:
                    fh.write(data)
                print(f'    installed vehicle-topdown-{name}-rear.png ({src.shape[1]}x{src.shape[0]})')
        else:
            failed.append(name)
            print('    NOT installed')
    print('written to', out_dir)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
