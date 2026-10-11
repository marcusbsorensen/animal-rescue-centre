#!/usr/bin/env python3
"""decorate-roof.py: put the master portrait's own side markings on a top-down vehicle's roof.

    python3 tools/decorate-roof.py apps/game/public/assets/driving/topdown/vehicle-topdown-spark-rear.png \\
        --design A --out /tmp/spark-rear-A.png --check
    python3 tools/decorate-roof.py --cutouts /tmp/cutouts      # write the extracted motifs as PNGs, nothing else

WHY. The six van top-downs were recoloured to match their portraits and then read as one flat slab of
colour from above, which is what the driving game and the parking scenes show a child most. Marcus asked
for the graphic touches on the vehicle's sides to be echoed on the roof: Spark's lightning flash, Bea's
calligraphic floral scrollwork, Henry's oak panel of pink and sage flowers. His standing principle for
the fleet is that autistic children will spot marks that do not match between viewpoints, so nothing is
drawn here and no model is involved. The roof carries the pixels the flank carries.

WHAT IS EXTRACTED (all from apps/game/public/assets/driving/vehicles/vehicle-<name>.png; boxes are in
the master's own 1024x512 grid and are the only absolute pixel numbers in this file).

  spark  extract_spark_flash   the cream flash, 494 x 115 master px, 11,630 painted. Matte against the
                               leaf-green flank by projection on the green-to-cream line (cream is
                               (250,244,215)). The two door seams, 1 to 3 px of dark ink, cross it and
                               are closed row by row from the cream either side, the only retouch
                               anywhere. Its torn top edge and its pointed tip are the master's.
  bea    extract_bea_scroll    the scrollwork on the cargo panel (not the small one on the door), 383 x
                               60, 5,714 painted: the swirls, five roses, leaves. Matte by distance from
                               the slate-blue paint, 14 to 28 units; the gilt beading under it is cut off
                               by a line that follows it. The master drew these strokes with a stepped
                               edge, so the matte is blurred 0.8 px (colour averaged only with marks).
  henry  extract_henry_flowers the flowers on the oak flank panel as separate pieces: 2 pink, 2 sage, 7
                               leaves, 8,268 painted. Told from the oak by hue (oak is orange, the
                               flowers pink and sage); each is grown 3 px to keep its pale halo and the
                               dark hairline round the petals, which belong to how it is drawn.
         extract_henry_inlay   a piece of the oak panel as painted, grain, hairline and flowers on it,
                               121 x 116 master px from the part the wheel arch does not touch,
                               bookmatched about its open end into 242 x 116 so it has a border on all
                               four sides. The mirror is the one thing not on the flank; it joins oak
                               to oak.

HOW IT IS PLACED. Nothing is placed in pixels. Marcus shortened the fleet's top-downs to their
portraits' proportions (shorten-topdown.py, f4cc906) while this was being made, and a recipe that
survives that has to be written against the roof it finds, so:

  1. Roof(rgba) finds the roof on the sprite it is given: the biggest piece of the body's paint,
     then the longest run of rows whose centre strip (55% of the half-width) is 97% clean paint.
     A vent, a seam, a windscreen or the rear glass breaks the run, so the roof is what is left
     between them. It measures the length (rows of that run), the centre line and half-width of
     the paint on every row, and a mask of the paint a motif may cover (clean, 2 px in from any
     edge, stray dots painted over, anything bigger left alone).
  2. Every size and position is then a share of that roof's length L or width W: a flash is 62% of
     W thick and 86% of L long; a flower is 46% of W across; a garland has a flower every 0.62 W.
     The perspective taper is followed: a sprite pixel reaches the motif through its own row's
     centre and half-width, so a motif narrows where the roof does.
  3. The FRONT sprite has its nose at the bottom (windscreen, bonnet), the REAR sprite has it at the
     top. The rear is drawn on the roof turned half way round, so the pair are two views of one
     roof: the flash points at the nose in both and Henry's pink flower is the one nearest it in both.
  4. Motifs are turned a quarter turn (never mirrored, except where a design says so) and resampled
     once, cubic, straight from the master pixels. Light and shade of the roof paint round it
     are applied to the motif at half strength so it sits in the same light.
  5. Pixels that are not clean roof paint are never touched; the render counts any motif pixel that
     fell there ("clipped") and every design measures 0.

DESIGNS (one letter each, parameters named at the top of each block below; * = recommended).

  spark A* one flash down the roof, tip at the nose. 86% of L long, up to 62% of W thick; on a short
           roof it gives up at most 35% of its length before it gets thinner instead.
        B  one flash at its painted shape, turned 40 degrees off the roof's line, as big as fits.
  bea   A  the whole scroll once down the centre line, 40% of W across, at most 90% of L long.
        B* the same scroll twice, the second its mirror image across the centre line, 29% of W each,
           so the pair is symmetrical about the roof's long centre line: roses outward, the long flourishes
           toward the centre, a clear strip (3% of W) between.
  henry A* a garland down the centre line: pink flower, leaves, sage flower, leaves, pink ..., a
           flower every 0.62 W (46% of W across for pink, 35% for sage), pink nearest the nose.
        B  the oak inlay, 40% of W across, as many as fit (one on both current roofs).

WHEN THE ROOF GETS SHORTER. Measured on the committed sprites before and after the shortening
(roof length over width 2.22 -> 1.78 on Henry front, 2.87 -> 1.11 on Spark front), the same recipe, no change:
  henry A  flowers 4 -> 3 (their spacing gives a little, so front and rear always agree); B  2 inlays -> 1
  bea   A, B  one scroll either way; it shrinks to stay at most 90% of L, giving up at most 15% of its
              shape first; share of roof 7.7% -> 6.3% (A), 13.6% -> 12.5% (B)
  spark A  one flash either way; it thins (share of roof 11% -> 6%) rather than lose its length
        B  grows relative to its roof, 2% -> 5%, because a natural-shape flash is limited by width on a
           long roof and by length on a short one
A design that is one motif at a share of the roof gets smaller; one that repeats loses repeats. None is
stretched to fit.

THE SPRITE IS NOT REDRAWN. The input is a recoloured top-down in its installed form, a 256-colour PNG.
A palette sprite has no pink, so grow_palette() makes room in place: the opaque palette entries that
cost least to lose (pixels using them, those off the roof counting 5x, times their distance to the
nearest other entry) are merged into that neighbour, and the slots they free take the motif's own
colours, as few as keep their mean error under 6 of 255 (6 slots for Spark, 12 to 16 for Bea, 24 for Henry).
Every pixel outside the motif keeps its palette index, so its alpha is EXACTLY what it was (0 px
differ in all twelve outputs, so the silhouette gate has nothing to find) and its colour is what it
was unless its entry was merged (at most 1,300 near-duplicate roof shades per file, largest step 32
of 255). Henry's rear paw-heart entries are protected from merging and never lent to the motif, so
nothing but the paw is paw-coloured. Do not run the result back through install-vehicles.py, which
would taper it a second time (see recolour-topdown.py). A source that is not a palette image falls
back to quantising as the fleet was (FASTOCTREE, solid_palette).

--check prints, per file: the roof it found; how much of it the motif covers; the four livery
bands (0-6, 6-20, 35-55, 75-92% of painted height) as distance of the dominant colour from maroon
(142,52,54), slate blue (74,112,164) or leaf green (116,156,102), before and after; install-
vehicles.gate IoU against the input; alpha differences; and, on Henry's rear, the paw. The bands are
a poor detector of a heavy motif (Henry B moves them by 0.2 although oak covers 19% of the roof),
so the share of the roof is printed beside them. Look at it as well.

RECIPE, one line per file (A or B as chosen; the files are not installed by this script):

  for f in henry henry-rear bea bea-rear spark spark-rear; do
    python3 tools/decorate-roof.py apps/game/public/assets/driving/topdown/vehicle-topdown-$f.png \\
        --design $D --out /tmp/$f.png --check
  done                                  # $D: henry A, bea B, spark A (recommended)

KNOWN LIMITS. The flash's torn edge and Bea's stepped strokes show a little at 1:1 and nowhere at the
46 to 92 px the game draws these at. Bea's scrollwork is fine work and the faintest of the three at
46 px. Spark's roof, after shortening, is as wide as it is long, so a flash of its painted shape is
smaller than it was on the long roof; A lets it fatten along its width by up to 1.5x before shrinking.
"""
import argparse
import importlib.util
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
MASTERS = os.path.join(ROOT, 'apps', 'game', 'public', 'assets', 'driving', 'vehicles')


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rt = _load('recolour_topdown', os.path.join(ROOT, 'tools', 'recolour-topdown.py'))


# ------------------------------------------------------------------ master extraction
#
# A motif is a float (h, w, 4) array: straight (non-premultiplied) RGB 0..255 and
# alpha 0..1, in the master's own pixel grid. Nothing is drawn: every RGB value in a
# motif is a value the master portrait already holds. Colour is not touched, alpha is
# a matte worked out against the paint the mark sits on, and the only pixels that are
# ever rewritten are the ones a door seam or an ink hairline has overwritten (Spark).
#
# Source boxes are in the MASTER's pixel space (1024x512, fixed). They are not roof
# measurements and do not move when the top-downs are resized.

def load_master(name):
    return np.array(Image.open(os.path.join(MASTERS, f'vehicle-{name}.png')).convert('RGBA')).astype(float)


def _two_colour_matte(rgb, paint, ink):
    """Alpha of a mark of colour `ink` lying on paint of colour `paint`: the projection of
    (pixel - paint) on (ink - paint), clipped to 0..1, and the distance of the pixel from
    that line (large = a third colour: a seam, a shadow, a window)."""
    d = ink - paint
    t = ((rgb - paint) @ d) / (d @ d)
    res = np.linalg.norm(rgb - (paint + np.clip(t, 0, 1)[..., None] * d), axis=-1)
    return t, res


def extract_spark_flash(master=None):
    """Spark's cream flash: the one cream piece on the flank below the window line.

    Matte against the leaf-green flank. Two doors' seams (dark, 1 to 3 px, vertical)
    cross the flash and would punch dark slits through a cut-out; they are closed
    horizontally and the colour across the gap is carried over from either side."""
    m = load_master('spark') if master is None else master
    rgb = m[..., :3]
    x0, y0, x1, y1 = 330, 232, 860, 372            # the flank under the window; the flash lives here
    sub = rgb[y0:y1, x0:x1]
    paint = np.array([116., 156., 102.])
    cream = np.median(sub[(sub[..., 0] > 235) & (sub[..., 1] > 228) & (sub[..., 2] > 190)], axis=0)
    t, res = _two_colour_matte(sub, paint, cream)
    core = (t > 0.55) & (res < 40)
    lbl, n = ndimage.label(core, structure=np.ones((3, 3)))
    sizes = ndimage.sum(core, lbl, range(1, n + 1))
    piece = lbl == (int(np.argmax(sizes)) + 1)       # the flash is the biggest cream piece
    # close the seam slits: horizontal closing only, so the ragged edge keeps its teeth
    closed = ndimage.binary_closing(np.pad(piece, ((0, 0), (8, 8))), structure=np.ones((1, 7)))[:, 8:-8]
    fill = closed & ~piece
    alpha = np.clip((t - 0.15) / 0.55, 0, 1)         # soft edge from the master's own antialiasing
    alpha = np.where(res < 45, alpha, 0.0)
    # keep only the flash piece and its immediate fringe
    near = ndimage.binary_dilation(closed, iterations=2)
    alpha = np.where(near, alpha, 0.0)
    alpha[fill] = 1.0
    out = sub.copy()
    # carry the colour across a closed slit from the left and right pixels of the same row
    for yy, xx in zip(*np.nonzero(fill)):
        row = piece[yy]
        l = xx
        while l > 0 and not row[l]:
            l -= 1
        r = xx
        while r < row.size - 1 and not row[r]:
            r += 1
        if row[l] and row[r] and r > l:
            f = (xx - l) / (r - l)
            out[yy, xx] = sub[yy, l] * (1 - f) + sub[yy, r] * f
        else:
            out[yy, xx] = cream
    ys, xs = np.nonzero(alpha > 0.02)
    pad = 2
    ya, yb = max(0, ys.min() - pad), ys.max() + 1 + pad
    xa, xb = max(0, xs.min() - pad), xs.max() + 1 + pad
    motif = np.dstack([out, alpha])[ya:yb, xa:xb]
    return motif


def _crop_motif(rgb, alpha, pad=2, origin=False):
    """Trim an (rgb, alpha) pair to the alpha's bounding box plus `pad`, as a motif array
    (with origin=True, also the (row, col) of its corner in the array it was cut from)."""
    ys, xs = np.nonzero(alpha > 0.02)
    ya, yb = max(0, ys.min() - pad), ys.max() + 1 + pad
    xa, xb = max(0, xs.min() - pad), xs.max() + 1 + pad
    out = np.dstack([rgb, alpha])[ya:yb, xa:xb].copy()
    return (out, (ya, xa)) if origin else out


def _soften(rgb, alpha, sigma, gain=1.0):
    """Blur a matte (and, premultiplied, its colour) by `sigma` master px so a mark the master
    painted with a stair-stepped edge upsamples to a smooth one; `gain` takes back the width the
    blur costs a thin stroke. Colour stays the master's: it is only averaged with its neighbours
    that are also part of the mark."""
    a = ndimage.gaussian_filter(alpha, sigma)
    pm = np.stack([ndimage.gaussian_filter(rgb[..., c] * alpha, sigma) for c in range(3)], -1)
    out = np.where(a[..., None] > 1e-4, pm / np.maximum(a, 1e-4)[..., None], rgb)
    return out, np.clip(a * gain, 0, 1)


def _hsv(rgb):
    """(h degrees, s, v) of 0..255 RGB, vectorised."""
    c = rgb / 255.0
    mx, mn = c.max(-1), c.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    h = np.where(nz & (mx == r), ((g - b) / np.where(nz, d, 1)) % 6, h)
    h = np.where(nz & (mx == g) & (mx != r), (b - r) / np.where(nz, d, 1) + 2, h)
    h = np.where(nz & (mx == b) & (mx != r) & (mx != g), (r - g) / np.where(nz, d, 1) + 4, h)
    return h * 60.0, np.where(mx > 0, d / np.where(mx > 0, mx, 1), 0), mx


def extract_henry_flowers(master=None):
    """The pink and sage flowers and leaves printed on Henry's oak flank panel, one motif each.

    Colour test against the oak: oak is orange (hue 25 to 40, saturation 0.5 to 0.7); the
    flowers are pink (hue below 10 or above 300) and sage (hue 50 to 100, saturation 0.2 to
    0.35). Each flower is a connected piece of those colours, its yellow centre filled in,
    grown by 3 px to take in its pale halo and the dark hairline round the petals, which
    are part of how it is drawn. Returns a list of dicts: kind ('pink', 'sage', 'leaf'),
    centre (master x, y), motif."""
    m = load_master('henry') if master is None else master
    x0, y0, x1, y1 = 592, 232, 880, 346            # inside the oak panel's gilt border
    sub = m[y0:y1, x0:x1, :3]
    h, s, v = _hsv(sub)
    pink = ((h < 12) | (h > 300)) & (s > 0.12) & (v > 0.6)
    sage = (h > 48) & (h < 110) & (s > 0.14) & (v > 0.5)
    mark = ndimage.binary_opening(pink | sage, structure=np.ones((2, 2)))
    mark = ndimage.binary_closing(mark, structure=np.ones((3, 3)))
    mark = ndimage.binary_fill_holes(mark)
    lbl, n = ndimage.label(mark)
    items = []
    for i in range(1, n + 1):
        piece = lbl == i
        area = int(piece.sum())
        if area < 120:
            continue
        ys, xs = np.nonzero(piece)
        grown = ndimage.binary_dilation(piece, structure=_disk(1), iterations=3)
        dist = ndimage.distance_transform_edt(~piece)
        alpha = np.clip((3.6 - dist) / 1.4, 0, 1)
        alpha[~grown & ~piece] = 0
        n_pink = int((pink & piece).sum())
        ext = (np.ptp(ys), np.ptp(xs))
        kind = 'pink' if n_pink > 0.5 * area else ('leaf' if max(ext) < 52 and min(ext) < 26 else 'sage')
        # fill the soft rim with the colour of the nearest solid pixel, so no oak shows at the edge
        idx = ndimage.distance_transform_edt(~piece, return_distances=False, return_indices=True)
        rgb = sub[idx[0], idx[1]]
        rgb[piece] = sub[piece]
        rgb = np.where(grown[..., None], sub, rgb)
        motif, (oy, ox) = _crop_motif(rgb, alpha, origin=True)
        cov = np.cov(np.stack([xs, ys]).astype(float))
        phi = 0.5 * np.degrees(np.arctan2(2 * cov[0, 1], cov[0, 0] - cov[1, 1]))    # long axis, from master +x toward +y
        items.append(dict(kind=kind, area=area, centre=(x0 + xs.mean(), y0 + ys.mean()),
                          motif=motif, origin=(y0 + oy, x0 + ox), axis=float(phi),
                          elong=float(np.sqrt(max(cov[0, 0], cov[1, 1]) / max(min(cov[0, 0], cov[1, 1]), 1e-6)))))
    return items


def henry_cluster(items, box):
    """The flowers whose centres lie in box (x0, y0, x1, y1), put back together in the arrangement the
    flank has them in: one motif, the union of their mattes on the master's own grid."""
    x0, y0, x1, y1 = box
    chosen = [it for it in items if x0 <= it['centre'][0] < x1 and y0 <= it['centre'][1] < y1]
    rgb = np.zeros((y1 - y0, x1 - x0, 3))
    alpha = np.zeros((y1 - y0, x1 - x0))
    for it in chosen:
        mo = it['motif']
        oy, ox = it['origin'][0] - y0, it['origin'][1] - x0
        h, w = mo.shape[:2]
        ya, xa = max(0, oy), max(0, ox)
        yb, xb = min(y1 - y0, oy + h), min(x1 - x0, ox + w)
        part = mo[ya - oy:yb - oy, xa - ox:xb - ox]
        a = part[..., 3]
        old = alpha[ya:yb, xa:xb]
        rgb[ya:yb, xa:xb] = part[..., :3] * (a / np.maximum(a + old * (1 - a), 1e-6))[..., None] + \
            rgb[ya:yb, xa:xb] * ((old * (1 - a)) / np.maximum(a + old * (1 - a), 1e-6))[..., None]
        alpha[ya:yb, xa:xb] = a + old * (1 - a)
    return _crop_motif(rgb, alpha), len(chosen)


def extract_henry_inlay(master=None):
    """A piece of Henry's oak flank panel as it is painted: the oak, its grain, the dark hairline round it
    and the flowers on it, cut as a rounded rectangle from the part of the panel the wheel arch does not
    touch (master x 589..710, y 233..349), and bookmatched about its open end so the inlay has a border on
    all four sides, the way a cabinet-maker closes a veneer. Colour is untouched; the mirror is the only
    thing not on the flank, and it joins oak to oak."""
    m = load_master('henry') if master is None else master
    x0, y0, x1, y1 = 589, 233, 710, 349
    half = m[y0:y1, x0:x1, :3]
    rgb = np.concatenate([half, half[:, ::-1]], axis=1)
    h, w = rgb.shape[:2]
    r = 5.0
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    dx = np.maximum(np.maximum(r - xx, xx - (w - 1 - r)), 0)
    dy = np.maximum(np.maximum(r - yy, yy - (h - 1 - r)), 0)
    inside = np.clip(r + 0.5 - np.hypot(dx, dy), 0, 1)                 # rounded corners, one pixel of antialias
    alpha = ndimage.gaussian_filter(inside, 0.5)
    return np.dstack([rgb, alpha])


def _disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def extract_bea_scroll(master=None):
    """Bea's calligraphic floral scroll from the cargo panel (not the small one on the door).

    Matte against the slate-blue flank: alpha is the pixel's distance from the paint, 3 to
    28 units, so a gold or copper stroke is opaque, its antialiased fringe keeps the master's
    own blend, and the blue between strokes is left to the roof, which is the same blue.
    The gilt beading under the scroll is a long separate stroke and is cut off by a line
    that follows it. Returns the whole scroll as one motif."""
    m = load_master('bea') if master is None else master
    x0, y0, x1, y1 = 534, 228, 922, 292
    sub = m[y0:y1, x0:x1, :3]
    paint = np.median(m[130:200, 600:800, :3].reshape(-1, 3), axis=0)
    d = np.linalg.norm(sub - paint, axis=-1)
    # the beading runs from (525, 296) to (925, 279) in master px; stay 6 px above it
    xx = np.arange(x0, x1)[None, :]
    yy = np.arange(y0, y1)[:, None]
    above = yy < (296.0 - (xx - 525.0) * (17.0 / 400.0) - 6.0)
    mark = (d > 20) & above
    mark = ndimage.binary_opening(mark, structure=np.ones((2, 2))) | ((d > 45) & above)
    lbl, n = ndimage.label(ndimage.binary_dilation(mark, iterations=2))
    sizes = ndimage.sum(mark, lbl, range(1, n + 1))
    keep = np.isin(lbl, [i + 1 for i, sz in enumerate(sizes) if sz >= 18])
    alpha = np.clip((d - 14.0) / 14.0, 0, 1) * (ndimage.binary_dilation(keep, iterations=1) & above)
    sub, alpha = _soften(sub, alpha, 0.8, 1.35)
    return _crop_motif(sub, alpha, pad=3)


# ------------------------------------------------------------------ the roof, measured off the sprite
#
# Everything below is a measurement of the sprite in front of it. No row, column or
# length in pixels is written down anywhere: the roof is found, and every size and
# position after that is a fraction of the roof's own length (top to bottom of the run
# of clean paint) or of its width (per row, so the perspective taper is followed).

CORRIDOR = 0.55         # the centre strip of the roof, as a share of its half-width, that must be clean paint
CLEAN_ROWS = 0.97       # share of that strip that must be paint for a row to count as roof
L_BAND = 14.0           # L* either side of the roof's median in which a pixel still counts as paint
SPECK = 0.0003          # a hole in the roof paint smaller than this share of the roof is a stray dot, and is painted over
RES_PAINT = 12.0        # a*b* distance from the ink-to-paint line in which a pixel still counts as paint


class Roof:
    """What the decorator needs to know about one top-down sprite's roof.

    top, bottom   first and last row of the roof run (rows, inclusive)
    length        bottom - top + 1
    cx, hw        arrays over rows top..bottom: centre column and half-width of the paint
    hw_ref        median half-width, the unit the canvas is drawn in
    ok            (H, W) bool: paint a motif may cover (clean, inside the roof run, 2 px from anything else)
    ref_rgb       the paint's colour (modal)"""

    def __init__(self, rgba):
        alpha = rgba[..., 3]
        rgb8 = rgba[..., :3]
        lab = rt.rgb_to_lab(rgb8 / 255.0)
        ref = rt.modal_colour_lab(rgb8, alpha >= rt.OPAQUE)
        res = rt.residual(lab, ref)[0]
        clean = (alpha >= 250) & (res <= RES_PAINT) & (np.abs(lab[..., 0] - ref[0]) <= L_BAND)
        clean = ndimage.binary_opening(clean, structure=np.ones((5, 5)))
        lbl, n = ndimage.label(clean)
        piece = lbl == (int(np.argmax(ndimage.sum(clean, lbl, range(1, n + 1)))) + 1)   # the roof is the biggest paint piece
        self.ref_lab = ref
        self.ref_rgb = tuple(int(v) for v in np.rint(rt.lab_to_rgb(ref) * 255))
        self.lab_l = lab[..., 0]
        H, W = piece.shape
        filled = ndimage.binary_closing(np.pad(piece, 12), structure=np.ones((1, 25)))[12:-12, 12:-12]
        filled = ndimage.binary_fill_holes(filled)
        cols = np.arange(W)[None, :]
        cnt = filled.sum(1)
        left = np.where(cnt > 0, np.where(filled, cols, W).min(1), 0)
        right = np.where(cnt > 0, np.where(filled, cols, -1).max(1), 0)
        width = (right - left + 1).astype(float) * (cnt > 0)
        medw = np.median(width[width > 0])
        # clean share of the centre strip, row by row
        cxr = (left + right) / 2.0
        hwr = (right - left + 1) / 2.0
        strip = (np.abs(cols - cxr[:, None]) <= CORRIDOR * hwr[:, None]) & (cnt > 0)[:, None]
        share = (piece & strip).sum(1) / np.maximum(strip.sum(1), 1)
        good = (share >= CLEAN_ROWS) & (width >= 0.6 * medw)
        good = ndimage.binary_closing(np.pad(good, 8), structure=np.ones(9))[8:-8]     # bridge specks, not seams
        gl, gn = ndimage.label(good)
        run = gl == (int(np.argmax(ndimage.sum(good, gl, range(1, gn + 1)))) + 1)
        rows = np.nonzero(run)[0]
        self.top, self.bottom = int(rows.min()), int(rows.max())
        self.length = self.bottom - self.top + 1
        sl = slice(self.top, self.bottom + 1)
        k = max(9, (self.length // 25) | 1)
        self.cx = ndimage.gaussian_filter1d(ndimage.median_filter(cxr[sl], size=k, mode='nearest'), k / 3, mode='nearest')
        self.hw = ndimage.gaussian_filter1d(ndimage.median_filter(hwr[sl], size=k, mode='nearest'), k / 3, mode='nearest')
        self.hw_ref = float(np.median(self.hw))
        self.width = 2 * self.hw_ref
        ok = ndimage.binary_closing(np.pad(piece, 4), structure=_disk(2))[4:-4, 4:-4]
        # a stray dot of ink in the paint is a speck, not a feature: holes smaller than SPECK of the roof are painted over
        holes = ndimage.binary_fill_holes(ok) & ~ok
        hl, hn = ndimage.label(holes)
        if hn:
            hs = ndimage.sum(holes, hl, range(1, hn + 1))
            ok |= np.isin(hl, [i + 1 for i, z in enumerate(hs) if z <= SPECK * filled.sum()])
        ok = ndimage.binary_erosion(ok, structure=_disk(2))
        ok[:self.top] = False
        ok[self.bottom + 1:] = False
        self.ok = ok
        self.shape = (H, W)

    def describe(self):
        return (f'roof rows {self.top}..{self.bottom} (length {self.length}), width {self.width:.0f}, '
                f'length/width {self.length / self.width:.2f}, paint {self.ref_rgb}')


# ------------------------------------------------------------------ placing a motif on the roof
#
# The roof is drawn on a canvas whose axes are v (along the roof, 0 at the tail, `length`
# at the nose) and u (across, in pixels of the median roof width, 0 on the centre line).
# A sprite pixel reaches the canvas through the roof's own centre line and half-width at
# its row, so a motif narrows where the roof does. The FRONT sprite has its nose at the
# bottom, the REAR sprite has it at the top, and its canvas is turned half way round, which
# is what makes the pair two views of one roof: a motif that points at the nose in one
# points at the nose in the other.
#
# A master motif is turned a quarter turn (never mirrored, unless the design says so) so
# that the master's left, which is the van's nose, points at the canvas's +v.

def place(motif, u0, v0, sa, sc, flip_along=False, flip_across=False, turn=0.0):
    """One placement: motif centre at canvas (u0, v0); sa and sc are canvas pixels per master pixel
    along and across the roof; `turn` is extra rotation in degrees, from the nose-ward direction toward
    +u (use it only with sa == sc, as a turn of an anisotropic motif would shear it)."""
    return dict(motif=motif, u0=u0, v0=v0, sa=sa, sc=sc, flip_along=flip_along, flip_across=flip_across, turn=turn)


def render(roof, view, placements, shade=0.5):
    """(rgb float (H, W, 3) 0..255, alpha float (H, W)) of the placements over the whole sprite."""
    H, W = roof.shape
    rows = np.arange(H)
    ri = np.clip(rows - roof.top, 0, roof.length - 1)          # the roof's own row, held at its ends outside the run
    X = np.arange(W, dtype=float)[None, :]
    u = (X - roof.cx[ri][:, None]) / roof.hw[ri][:, None] * roof.hw_ref
    if view == 'rear':
        u = -u
        v = np.repeat((roof.bottom - rows)[:, None].astype(float), W, 1)
    else:
        v = np.repeat((rows - roof.top)[:, None].astype(float), W, 1)
    rgb = np.zeros((H, W, 3))
    alpha = np.zeros((H, W))
    # the roof's own light and shade, so a motif sits in the same light as the paint round it
    okf = roof.ok.astype(float)
    sig = max(4.0, 0.02 * roof.length)
    lsm = ndimage.gaussian_filter(roof.lab_l * okf, sig) / np.maximum(ndimage.gaussian_filter(okf, sig), 1e-3)
    factor = np.clip(lsm / roof.ref_lab[0], 0.7, 1.3) ** shade
    for p in placements:
        mo = p['motif']
        mh, mw = mo.shape[:2]
        pp = v - p['v0']
        qq = u - p['u0']
        if p['flip_along']:
            pp = -pp
        if p['flip_across']:
            qq = -qq
        if p['turn']:
            c, sn = np.cos(np.radians(p['turn'])), np.sin(np.radians(p['turn']))
            pp, qq = pp * c + qq * sn, -pp * sn + qq * c
        mx = (mw - 1) / 2.0 - pp / p['sa']
        my = (mh - 1) / 2.0 + qq / p['sc']
        inside = (mx > -2) & (mx < mw + 1) & (my > -2) & (my < mh + 1)
        inside[:roof.top] = False
        inside[roof.bottom + 1:] = False
        if not inside.any():
            continue
        ys, xs = np.nonzero(inside)
        sl = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
        coords = np.stack([my[sl], mx[sl]])
        a = np.clip(ndimage.map_coordinates(mo[..., 3], coords, order=3, mode='constant'), 0, 1)
        premult = np.stack([ndimage.map_coordinates(mo[..., c] * mo[..., 3], coords, order=3, mode='constant')
                            for c in range(3)], -1)
        premult = np.clip(premult, 0, 255 * a[..., None])
        # over: this placement above whatever is already there
        prev_a = alpha[sl]
        rgb[sl] = premult * factor[sl][..., None] + rgb[sl] * (1 - a[..., None])
        alpha[sl] = a + prev_a * (1 - a)
    return rgb, alpha


def composite(rgba, roof, rgb, alpha):
    """Lay the rendered motif on the sprite, only on paint the roof allows. Returns (new rgba, stats)."""
    a = alpha * roof.ok
    out = rgba[..., :3].astype(float) * (1 - a[..., None]) + rgb * roof.ok[..., None]
    out8 = np.clip(np.rint(out), 0, 255).astype(np.uint8)
    new = np.dstack([out8, rgba[..., 3]])
    strong = alpha > 0.5
    stats = dict(covered=int((a > 0.5).sum()), clipped=int((strong & ~roof.ok).sum()),
                 share_of_roof=float((a > 0.5).sum() / max(1, roof.ok.sum())))
    return new, stats


# ------------------------------------------------------------------ the designs
#
# Every number here is a share of the roof's own length (L) or width (W), or a count that
# is worked out from them. A sprite that comes back 30% shorter gets the same recipe and
# fewer repeats or a smaller single motif, never a stretched one.

def _row_of(n, length, gap, roof_length):
    """Centres (canvas v) of n equal items of `length` with `gap` between, centred on the roof."""
    total = n * length + (n - 1) * gap
    start = (roof_length - total) / 2.0
    return [start + length / 2.0 + i * (length + gap) for i in range(n)]


def _fit_count(roof_length, length, gap, use=0.94):
    return max(1, int((use * roof_length + gap) // (length + gap)))


# Spark ---------------------------------------------------------------------------
FLASH_A_LEN = 0.86      # A: one flash down the roof, this share of L long ...
FLASH_A_THICK = 0.62    # ... and up to this share of W thick (its bounding box; the blade itself is a third of that)
FLASH_STRETCH = 1.3     # along-the-roof stretch the flash may take over its painted shape before it gives ground
FLASH_SQUASH = 0.65     # and the most it gives up along the roof, on a short roof, before it gets thinner instead
FLASH_B_TURN = 40.0     # B: one flash at its painted shape, turned this many degrees off the line of the roof ...
FLASH_B_FIT = 0.90      # ... as big as fits inside this share of the roof's length and of its width


def spark_a(roof, M):
    mo = M['flash']
    mh, mw = mo.shape[:2]
    sc0 = FLASH_A_THICK * roof.width / mh
    sa = min(FLASH_A_LEN * roof.length / mw, FLASH_STRETCH * sc0)
    sc = min(sc0, sa / FLASH_SQUASH)
    return [place(mo, 0.0, roof.length / 2.0, sa, sc)]


def spark_b(roof, M):
    mo = M['flash']
    mh, mw = mo.shape[:2]
    c, sn = np.cos(np.radians(FLASH_B_TURN)), np.sin(np.radians(FLASH_B_TURN))
    s = min(FLASH_B_FIT * roof.length / (mw * c + mh * sn), FLASH_B_FIT * roof.width / (mw * sn + mh * c))
    return [place(mo, 0.0, roof.length / 2.0, s, s, turn=FLASH_B_TURN)]


# Bea -----------------------------------------------------------------------------
SCROLL_A_CROSS = 0.40   # A: the whole scroll down the centre line, this share of W across ...
SCROLL_FIT = 0.90       # ... and never more than this share of L along
SCROLL_SQUASH = 0.85    # ... giving up at most this much of its shape along the roof before it shrinks instead
SCROLL_B_CROSS = 0.29   # B: a mirrored pair, each scroll this share of W across (the pair is twice that)
SCROLL_B_GAP = 0.12     # B: the gap between repeats, as a share of a scroll's length
SCROLL_B_SPLIT = 0.04   # B: the clear strip between the pair, as a share of W


def _fit_scales(mh, mw, width, length, cross, fit, squash):
    """(along, across) canvas px per master px for a motif mh x mw that should be `cross` of the width
    across and no more than `fit` of the length along, giving up at most `squash` of its shape."""
    sc = cross * width / mh
    sa = sc
    if mw * sa > fit * length:
        sa = max(fit * length / mw, squash * sc)
    if mw * sa > fit * length:
        sa = fit * length / mw
        sc = sa / squash
    return sa, sc


def bea_a(roof, M):
    mo = M['scroll']
    mh, mw = mo.shape[:2]
    sa, sc = _fit_scales(mh, mw, roof.width, roof.length, SCROLL_A_CROSS, SCROLL_FIT, SCROLL_SQUASH)
    return [place(mo, 0.0, roof.length / 2.0, sa, sc)]


def bea_b(roof, M):
    mo = M['scroll']
    mh, mw = mo.shape[:2]
    sa, sc = _fit_scales(mh, mw, roof.width, roof.length, SCROLL_B_CROSS, SCROLL_FIT, SCROLL_SQUASH)
    length = mw * sa
    gap = SCROLL_B_GAP * length
    n = _fit_count(roof.length, length, gap)
    off = mh * sc / 2.0 + SCROLL_B_SPLIT * roof.width / 2.0
    out = []
    for v in _row_of(n, length, gap, roof.length):
        out.append(place(mo, -off, v, sa, sc))                      # one side as painted ...
        out.append(place(mo, +off, v, sa, sc, flip_across=True))    # ... the other as its mirror image
    return out


# Henry ---------------------------------------------------------------------------
GARLAND_PITCH = 0.62    # A: one flower every this many W down the centre line, pink first from the nose, then sage
PINK_ACROSS = 0.46      # A: the big pink flower's width, as a share of W
SAGE_ACROSS = 0.35      # A: the sage flower's width, as a share of W
LEAF_LONG = 0.19        # A: a leaf's length, as a share of W; two leaves splay into a sprig between the flowers
LEAF_SPLAY = 38.0       # A: degrees each leaf of a sprig turns off the line of the roof
LEAF_OFF = 0.085        # A: how far each leaf of a sprig stands off the centre line, as a share of W


def _henry_picks(items):
    pinks = sorted((it for it in items if it['kind'] == 'pink'), key=lambda it: -it['area'])
    sages = sorted((it for it in items if it['kind'] == 'sage'), key=lambda it: -it['area'])
    leaves = sorted((it for it in items if it['kind'] == 'leaf' and it['elong'] > 1.5 and it['area'] > 150),
                    key=lambda it: -it['area'])
    return pinks[0], sages[0], leaves[0]


def henry_a(roof, M):
    pink, sage, leaf = _henry_picks(M['items'])
    room = 0.94 * roof.length - PINK_ACROSS * roof.width            # centres of the first and last flower may be this far apart
    n = max(1, int(round(room / (GARLAND_PITCH * roof.width))) + 1)
    pitch = room / (n - 1) if n > 1 else 0.0                          # the spacing gives a little so front and rear count the same
    out = []
    for j in range(n):                                                # j = 0 is the flower nearest the nose
        v = roof.length / 2.0 + room / 2.0 - j * pitch if n > 1 else roof.length / 2.0
        it, across = (pink, PINK_ACROSS) if j % 2 == 0 else (sage, SAGE_ACROSS)
        mo = it['motif']
        s = across * roof.width / max(mo.shape)
        out.append(place(mo, 0.0, v, s, s, turn=(37.0 * j)))                # a flower has no up: turn each to its own angle
        if j + 1 < n:                                                        # a sprig of two leaves half way to the next
            lm = leaf['motif']
            ls = LEAF_LONG * roof.width / max(lm.shape)
            v2 = v - pitch / 2.0
            # the leaf's long axis, from master +x toward +y, sits at canvas angle (180 - axis) from the nose direction
            for side in (-1, 1):
                out.append(place(lm, side * LEAF_OFF * roof.width, v2, ls, ls, turn=side * LEAF_SPLAY - (180.0 - leaf['axis'])))
    return out


INLAY_CROSS = 0.40      # B: an oak inlay is this share of W across
INLAY_GAP = 0.14        # B: the gap between inlays, as a share of an inlay's length


def henry_b(roof, M):
    mo = M['inlay']
    mh, mw = mo.shape[:2]
    s = INLAY_CROSS * roof.width / mh
    length = mw * s
    gap = INLAY_GAP * length
    n = _fit_count(roof.length, length, gap)
    return [place(mo, 0.0, v, s, s) for v in _row_of(n, length, gap, roof.length)]


DESIGNS = {('spark', 'A'): spark_a, ('spark', 'B'): spark_b,
           ('bea', 'A'): bea_a, ('bea', 'B'): bea_b,
           ('henry', 'A'): henry_a, ('henry', 'B'): henry_b}


def motifs_for(vehicle):
    if vehicle == 'spark':
        return {'flash': extract_spark_flash()}
    if vehicle == 'bea':
        return {'scroll': extract_bea_scroll()}
    return {'items': extract_henry_flowers(), 'inlay': extract_henry_inlay()}


# ------------------------------------------------------------------ the gates

TARGETS = {'henry': (142, 52, 54), 'bea': (74, 112, 164), 'spark': (116, 156, 102)}   # the portraits' body colours


def stem_info(path):
    """('henry', 'rear') from .../vehicle-topdown-henry-rear.png."""
    stem = os.path.splitext(os.path.basename(path))[0].replace('vehicle-topdown-', '')
    view = 'rear' if stem.endswith('-rear') else 'front'
    return stem.replace('-rear', ''), view


def quantise(rgba, iv):
    """Quantise exactly as the committed fleet was: 256 colours, FASTOCTREE, near-opaque entries lifted to 255.
    Only for a source that is not already a 256-colour sprite; see grow_palette."""
    return iv.solid_palette(Image.fromarray(rgba, 'RGBA').quantize(colors=iv.COLOURS, method=Image.FASTOCTREE))


MOTIF_ERR = 6.0         # mean colour error (of 255) the motif's palette may have; the fewest slots that meet it are used
OFF_ROOF = 5.0          # losing a shade costs this many times more off the roof than on it


def _motif_palette(want, err_limit):
    """The fewest colours (MEDIANCUT) that put the motif's pixels within err_limit of themselves, on average."""
    strip = Image.fromarray(want.reshape(-1, 1, 3), 'RGB')
    for k in (4, 6, 8, 12, 16, 24, 32, 40, 48, 56, 64):
        q = strip.quantize(colors=k, method=Image.MEDIANCUT)
        pal = np.array(q.getpalette(), dtype=np.uint8).reshape(-1, 3)[:k]
        err = np.abs(pal[np.array(q)].astype(float) - want.reshape(-1, 1, 3)).mean()
        if err <= err_limit or k == 64:
            return pal, float(err)


def grow_palette(src_img, new_rgba, protect=None, roof=None, err_limit=MOTIF_ERR):
    """Put the new pixels into the sprite's own 256-colour file without touching the pixels that did not change.

    A palette sprite cannot hold a pink flower, so room is made: opaque palette entries are merged into their
    nearest neighbour, cheapest first (pixels using it times distance to that neighbour, the pixels off the
    roof counting OFF_ROOF times, so the near-duplicate shades of the roof go first), and the freed slots take
    the motif's own colours, as few as keep it within `err_limit`. Every pixel outside the motif keeps its
    index, so its alpha is exactly what it was and its colour is exactly what it was unless its entry was one
    of the near-duplicates. `protect` is a bool mask whose entries are never merged away and never used for the
    motif (Henry's paw: no pixel but the paw's own may be paw-coloured).
    Returns (P image, stats)."""
    from scipy.spatial import cKDTree
    idx = np.array(src_img).astype(np.int32)
    pal = np.array(src_img.getpalette('RGBA'), dtype=np.uint8).reshape(-1, 4)
    trns = src_img.info.get('transparency')           # a loaded PNG keeps its per-entry alpha here, not in the palette
    if isinstance(trns, bytes):
        pal[:len(trns), 3] = np.frombuffer(trns, np.uint8)
    elif isinstance(trns, int):
        pal[trns, 3] = 0
    base = pal[idx]
    changed = (new_rgba[..., :3] != base[..., :3]).any(-1) & (base[..., 3] == 255)
    want = np.clip(new_rgba[..., :3][changed], 0, 255).astype(np.uint8)
    mp, perr = _motif_palette(want, err_limit)
    n_new = len(mp)
    full = np.zeros((256, 4), np.uint8)
    full[:len(pal)] = pal
    free = list(range(len(pal), 256))
    on_roof = np.zeros(idx.shape, bool) if roof is None else roof
    cnt_off = np.bincount(idx[~changed & ~on_roof], minlength=256).astype(float)
    cnt_on = np.bincount(idx[~changed & on_roof], minlength=256).astype(float)
    locked = set(np.unique(idx[protect & ~changed]).tolist()) if protect is not None else set()
    alive = {i for i in range(len(pal)) if pal[i, 3] == 255}
    moved = {}
    while len(free) < n_new:
        sl = sorted(alive)
        cols = full[sl, :3].astype(float)
        d = np.linalg.norm(cols[:, None] - cols[None], axis=-1)
        np.fill_diagonal(d, 1e9)
        nn = d.argmin(1)
        w = np.array([OFF_ROOF * cnt_off[e] + cnt_on[e] for e in sl])
        cost = w * d[np.arange(len(sl)), nn]
        cost[[k for k, e in enumerate(sl) if e in locked]] = np.inf
        k = int(cost.argmin())
        e, tgt = sl[k], sl[nn[k]]
        idx[idx == e] = tgt
        cnt_off[tgt] += cnt_off[e]
        cnt_on[tgt] += cnt_on[e]
        cnt_off[e] = cnt_on[e] = 0
        alive.discard(e)
        moved[e] = tgt
        free.append(e)
    for slot, c in zip(free[-n_new:], mp):
        full[slot] = (c[0], c[1], c[2], 255)
        alive.add(slot)
    sl = sorted(alive - locked)           # a protected entry (the paw's rust) is never lent to the motif either
    tree = cKDTree(full[sl, :3].astype(float))
    _, nearest = tree.query(want.astype(float))
    idx[changed] = np.array(sl)[nearest]
    out = Image.fromarray(idx.astype(np.uint8), 'P')
    out.putpalette(full.flatten().tolist(), 'RGBA')
    result = np.array(out.convert('RGBA'))
    shifted = (result != base).any(-1) & ~changed
    stats = dict(merged=len(moved), slots=n_new, motif_err=float(np.abs(result[..., :3][changed].astype(float) - new_rgba[..., :3][changed]).mean()),
                 shifted=int(shifted.sum()),
                 shifted_max=int(np.abs(result[..., :3].astype(int) - base[..., :3].astype(int)).max(-1)[shifted].max()) if shifted.any() else 0)
    return out, stats


# The paw-heart's five rust shades on Henry's rear door, from the installed palette, and how near a pixel
# must be to one of them (RGB distance) to be called paw-coloured. The maroon body is 37 away from the
# nearest, Henry's amber lamps 50, oak and its gilt 35.
PAW_SHADES = ((172, 72, 47), (181, 85, 52), (195, 89, 58), (202, 103, 70), (211, 117, 81))
PAW_TOL = 10.0


def paw_pixels(rgba):
    """Mask of paw-coloured pixels."""
    rgb = rgba[..., :3].astype(float)
    near = np.zeros(rgba.shape[:2], bool)
    for c in PAW_SHADES:
        near |= np.linalg.norm(rgb - np.array(c, float), axis=-1) <= PAW_TOL
    return near & (rgba[..., 3] >= 240)


def report(src_path, out_path, src_rgba, new_rgba_raw, roof, stats, vehicle, view, design):
    iv = rt.load_gate()
    back = rt.load_rgba(out_path)
    tgt = np.array(TARGETS[vehicle], float)
    print(f'\n{vehicle} {view} design {design}: {roof.describe()}')
    if 'palette' in stats:
        g = stats['palette']
        print(f'palette grown in place: {g["merged"]} near-duplicate shades merged to make {g["slots"]} slots; '
              f'motif colour error {g["motif_err"]:.2f} of 255; {g["shifted"]} px outside the motif shifted by a merge, largest shift {g["shifted_max"]} of 255')
    print(f'motif covers {stats["covered"]} px = {stats["share_of_roof"]:.1%} of the clean roof; '
          f'{stats["clipped"]} motif px fell on something that was not clean paint and were not drawn')
    print(f'livery bands (0-6, 6-20, 35-55, 75-92% of painted height), dominant colour, distance from {tuple(TARGETS[vehicle])}:')
    for tag, img in (('  before', src_rgba), ('  after ', back)):
        d = [float(np.linalg.norm(b['dominant'] - tgt)) for b in rt.band_colours(img)]
        print(f'{tag}  ' + '  '.join(f'{x:5.1f}' for x in d))
    ok, why = iv.gate(out_path, src_path, False, iv.MIN_IOU)
    print(f'silhouette gate (install-vehicles.gate) against {os.path.basename(src_path)}: {"PASS" if ok else "FAIL"}  {why}')
    a0, a1 = src_rgba[..., 3].astype(int), back[..., 3].astype(int)
    moved = a0 != a1
    print(f'alpha: {int(moved.sum())} of {int((a0 > 0).sum())} visible px differ from the source, '
          f'largest step {int(np.abs(a0 - a1).max())}; px going from visible to invisible or back: '
          f'{int(((a0 > 16) != (a1 > 16)).sum())}')
    vis = (a0 > 16) & (a1 > 16)
    near = ndimage.binary_dilation(stats['mask'], iterations=6)
    far = vis & ~near
    dd = np.abs(back[..., :3].astype(int) - src_rgba[..., :3].astype(int)).max(-1)
    print(f'outside the motif: mean colour change {dd[far].mean():.2f} of 255, {int((dd[far] > 24).sum())} of {int(far.sum())} px moved by more than 24 (re-quantising)')
    if vehicle == 'henry' and view == 'rear':
        before, after = paw_pixels(src_rgba), paw_pixels(back)
        lab_, n_ = ndimage.label(before)
        big = np.zeros_like(before)
        if n_:
            sizes = ndimage.sum(before, lab_, range(1, n_ + 1))
            big = lab_ == (int(np.argmax(sizes)) + 1)
        roof_zone = np.zeros_like(before)
        roof_zone[:roof.bottom + 1] = True
        print(f'paw: {int(big.sum())} px in the paw piece before; {int((after & ~roof_zone).sum())} paw-coloured px below the roof line after '
              f'({int((before & ~roof_zone).sum())} before); {int((after & roof_zone).sum())} paw-coloured px on the roof '
              f'({int((before & roof_zone).sum())} before); changed inside the paw piece: '
              f'{int((np.abs(back[..., :3].astype(int) - src_rgba[..., :3].astype(int)).max(-1) > 0)[ndimage.binary_dilation(big, iterations=2)].sum())}')


def write_cutouts(folder):
    os.makedirs(folder, exist_ok=True)

    def save(name, motif):
        Image.fromarray(np.clip(np.rint(np.dstack([motif[..., :3], motif[..., 3:] * 255])), 0, 255).astype(np.uint8), 'RGBA').save(
            os.path.join(folder, name))
        print(f'{name}: {motif.shape[1]} x {motif.shape[0]} master px, {int((motif[..., 3] > 0.5).sum())} painted')

    save('spark-flash.png', extract_spark_flash())
    save('bea-scroll.png', extract_bea_scroll())
    save('henry-inlay.png', extract_henry_inlay())
    for i, it in enumerate(sorted(extract_henry_flowers(), key=lambda t: (t['kind'], -t['area']))):
        save(f'henry-{it["kind"]}-{i}.png', it['motif'])


def decorate(src, vehicle, view, design, check=False, out=None):
    rgba = rt.load_rgba(src)
    roof = Roof(rgba)
    M = motifs_for(vehicle)
    placements = DESIGNS[(vehicle, design)](roof, M)
    rgb, alpha = render(roof, view, placements)
    new, stats = composite(rgba, roof, rgb, alpha)
    stats['mask'] = (alpha * roof.ok) > 0.02
    return rgba, roof, new, stats


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('src', nargs='?', help="a recoloured top-down sprite (the installed P file, or the recolour tool's RGBA output)")
    ap.add_argument('--design', help='A or B, per the table in the docstring')
    ap.add_argument('--out')
    ap.add_argument('--cutouts', metavar='DIR', help='write the motifs extracted from the three masters here, as RGBA PNGs, and stop')
    ap.add_argument('--vehicle', help='henry, bea or spark (default: from the file name)')
    ap.add_argument('--view', choices=['front', 'rear'], help='default: from the file name')
    ap.add_argument('--check', action='store_true', help='print the gates')
    ap.add_argument('--raw', help='also write the unquantised RGBA here')
    args = ap.parse_args()
    if args.cutouts:
        write_cutouts(args.cutouts)
        return
    if not (args.src and args.design and args.out):
        ap.error('src, --design and --out are needed (or --cutouts DIR)')
    veh, view = stem_info(args.src)
    veh = args.vehicle or veh
    view = args.view or view
    if (veh, args.design) not in DESIGNS:
        sys.exit(f'no design {args.design} for {veh}; have {sorted(k[1] for k in DESIGNS if k[0] == veh)}')
    src, out = os.path.abspath(args.src), os.path.abspath(args.out)
    if src == out:
        sys.exit('refusing to write over the source')
    rgba, roof, new, stats = decorate(src, veh, view, args.design)
    if args.raw:
        Image.fromarray(new, 'RGBA').save(args.raw)
    src_img = Image.open(src)
    if src_img.mode == 'P':
        pm = paw_pixels(rgba)
        protect = None
        if veh == 'henry' and view == 'rear' and pm.any():
            lbl_, n_ = ndimage.label(ndimage.binary_dilation(pm, iterations=2))
            big = lbl_ == (int(np.argmax(ndimage.sum(pm, lbl_, range(1, n_ + 1)))) + 1)
            ys, xs = np.nonzero(big & pm)
            protect = np.zeros_like(pm)
            protect[max(0, ys.min() - 6):ys.max() + 7, max(0, xs.min() - 6):xs.max() + 7] = True
        roof_zone = np.zeros(rgba.shape[:2], bool)
        roof_zone[roof.top:roof.bottom + 1] = True
        q, gstats = grow_palette(src_img, new, protect=protect, roof=roof_zone)
        stats['palette'] = gstats
    else:
        q = quantise(new, rt.load_gate())
    q.save(out, optimize=True)
    print(f'wrote {out} ({os.path.getsize(out) / 1024:.0f} KB)')
    if args.check:
        report(src, out, rgba, new, roof, stats, veh, view, args.design)


if __name__ == '__main__':
    main()
