#!/usr/bin/env python3
"""shorten-topdown.py — make a top-down vehicle shorter by taking length out of the middle of its body.

    python3 tools/shorten-topdown.py --out /tmp/short                  # all of them, gated, written to /tmp/short
    python3 tools/shorten-topdown.py --out /tmp/short --only spark     # one file (a substring of the stem)
    python3 tools/shorten-topdown.py --out /tmp/short --install        # and install each file that passes its gates

Deterministic: the same originals give the same bytes. The originals are read from git
(`ORIGINALS_REV`), not from the working tree, so running it again after the files have been
installed shortens the originals again rather than shortening the result twice. `--src DIR`
reads them from a directory instead.

WHY. Marcus, 2026-10-11: eight top-down sprites were too long against their own portraits
(`assets/driving/vehicles/vehicle-<name>.png`, drawn length over height). He chose the
portraits' proportions as the targets. This is the inverse of the lengthening of 2026-10-08
(`.claude/HANDOVER.md`, "One true scale"), and the reasoning is the same run backwards: a
vertical squash at 0.64 to 0.91 turns round headlamps into ovals and thins the ink along one
axis. So nothing is scaled. The nose and the tail are copied byte for byte, and the length
comes out of the part of the body that is the same from one row to the next: the roof, the
flank slivers, the bed. The wheels sit closer together, which is what a shorter van has.

WIDTH DOES NOT CHANGE. `PtvDriveScene` scales a vehicle by its width
(`img.setScale(vanW * VEHICLE_SIZE[id] / img.width)`, lines 774, 1660, 1794, 1980), so with
the canvas width and the opaque width untouched the on-screen size stays what
`VEHICLE_SIZE` says and only the length moves.

HOW. For each file the recipe names one or more cuts, `[lo, hi)`: a stretch of body with
straight flanks and nothing in it but plain paint. Every row outside the cuts is kept as it
was (the "kept bands": nose, tail, windscreen, lamps, wheels, the chrome, Henry's paw-heart).
Inside a cut, `dh` rows come out:

1. FIND THE SEAM. The two halves of the cut are rows `y` and rows `y + dh` of the original,
   and they must meet. Each row of the cut is resampled to a common width, so the taper
   (below) drops out, and for every `dh` within half a per cent of the target and every
   seam position, the squared difference between row `y` and row `y + dh` is summed over
   a window of `OVERLAP` rows. That is the cost of putting the seam there, and it is what
   lets a flank's motifs (Henry's oak slivers, Spark's leaf flashes) meet instead of being
   cut in half; it is also why `dh` may stray half a per cent from the target.
2. CUT IT THROUGH THE PAINT, NOT ACROSS IT. The best two dozen are settled by the real
   thing: a minimum-error path from the left edge to the right through the overlap, which
   goes round an ink line or a motif that does not match rather than through it. Above the
   path is the upper half, below it the lower, with a 6-row soft edge.
3. KEEP THE SKEW. `skew-topdown.py` gave most of these files a perspective taper, the far end
   narrower than the near by 3-12% (the `ALREADY_CORRECT` files, `henry-rear`, `bea-rear` and
   both Big Tillys, are parallel-sided, so this does nothing for them). Taking rows out of a
   taper leaves a step in the outline equal to the taper's rate times `dh`: 3.7px on Bea,
   7.6 on Henry, 18 on Spark and 38 on Spark's rear, which would be a visible shelf in the
   flank. So inside a cut every row is rescaled about its centreline so the outline runs from
   the width of the kept band above to the width of the kept band below along one smooth curve
   that leaves each band at the angle it arrived. The rescale is horizontal only, never
   vertical, and measures 2.2% at most on Henry, 1.0% on Bea, 3.7% on Spark, 7.2% on Spark's
   rear (whose flank flares inside the cut) and 2.3% on Big Tilly's; a row already within a
   third of a pixel of where it belongs is copied, not resampled. The cost of keeping both
   ends exact is that the taper is spread over fewer rows, so the outline bends more inside the
   cut: on Spark from 0.8 to 4.3 degrees a side (10.7px over the cut), on Spark's rear from
   1.6 to 6.9. It reads as a van a little wider at the front.
4. BACK TO THE ORIGINAL 256 COLOURS. The installed set is mode P (see `install-vehicles.py`).
   The palette is kept as it is, kept rows keep their indices, and the changed rows take the
   nearest palette entry in premultiplied colour with alpha counted three times. Nothing is
   re-quantised, so the bands outside the cuts are identical as RGBA, not just close.

GATES, run on every file before it is installed, and `--install` installs nothing that fails:
length (L/W within 2% of the portrait's; for Big Tilly the bed floor instead, see below),
width unchanged, kept rows identical as RGBA, palette identical, livery (the four bands of
the audit in `recolour-topdown.py`, 0-6 / 6-20 / 35-55 / 75-92% of painted height, each
dominant colour within 60 RGB units of maroon 142,52,54, slate blue 74,112,164 or leaf green
116,156,102), and the join: no translucent pixel in the body and none beyond the outline in
the changed rows, no step in the outline larger than the original's, and no row-to-row
jump at the seam larger than the original's own largest.

RECIPES (rows are rows of the original at `ORIGINALS_REV`; a row is kept if it is outside
every cut). L/W is of the opaque pixels, as `tools/scale-check.py` measures it. Seam row is
where the two halves meet in the new file; the kept rows above and below the cut are
verbatim and say what is at each end.

    file             was    target  now     cut         removed  seam   kept top / bottom
    henry            2.337  2.02    2.029   290-830     173      517    290 (tail, rear wheels) / 479 (windscreen, mirrors, lamps, bumper)
    henry-rear       2.396  2.02    2.016   430-880     213      592    430 (nose, lamps) / 464 (rear windows, doors, paw-heart)
    bea              2.453  2.23    2.230   305-696     129      428    305 (hatch, roofline arc) / 722 (windscreen, mirrors, grille)
    bea-rear         2.497  2.23    2.228   400-1025    155      730    400 (windscreen slot, mirrors) / 418 (doors, handles, tail lamps)
    spark            2.922  1.88    1.886   362-1167    663      402    362 (sunroof, rear wheels) / 703 (windscreen, mirrors, lamps)
    spark-rear       2.920  1.88    1.880   420-1280    667      513    420 (nose, mirrors) / 592 (hatch, rear window, plate, lamps)
    big-tilly        2.806  1.79    --      declined, see below
    big-tilly-rear   2.816  1.79    2.516   600-1400    221      1014   600 (cab) / 670 (tailgate, rear wheels): the bed only

Spark's seam sits against the top of its cut because the cut is 805 rows and 663 of them go,
which leaves 142: the seam has 40 rows of room either side of it.

BIG TILLY cannot reach 1.79 and `big-tilly.png` is left as drawn. Her 2x4 load needs a bed
about 2:1 (`crate-stacking.ts:260`: 8 slots, 2 cols, 4 rows), measured on the files:

  * Front: the bed rectangle `VEHICLE_BED` lays the crates in is 531 x 1077, 2.03:1, and the
    plank floor is 507 x 1118, 2.20:1. Nothing can come out of the bed without leaving
    "about 2:1" long before it matters to the length.
  * Front cab: rows 1290-2071, 38% of her length, and made of features. Its plain part is the
    roof, rows 1300-1530, and a cut through it is clean down the middle and ragged at the
    sides, where the cab's side windows, the diagonal pillar bars, the foot of the bed wall
    and the rear tyre all sit: nothing in them lines up with itself 60 rows further down.
    Tried at 56, 80, 95 and 124 rows removed, in the roof and above the windows. At 3x all four
    show the same tear, where a pillar bar begins in the middle of a window; 80 rows is the most
    that passes at 1:1, and that is under 4% of her length. The bonnet is worse: windscreen
    frame, panel arc, lamps and front tyre leave 30 free rows. So 2.806 stands.
  * Rear: the file shows a bed floor of 508 x 1339, 2.64:1, which is not the front's 2.20:1,
    so the two views disagreed about the bed. It is cut to the front's shape (221 rows, 2.816
    to 2.516), through plain planks with the posts and knots going round. The rear's own limit
    is a floor of 2.0:1, which is `dh` 329 and L/W 2.37; the gate holds it to the front's 2.20.

To shorten the front as well, the cab has to be redrawn, or the load has to be 2x3.
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
from scipy.interpolate import CubicHermiteSpline
from scipy.ndimage import gaussian_filter1d
from scipy.spatial import cKDTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'apps/game/public/assets/driving/topdown')
ASSETS_REL = 'apps/game/public/assets/driving/topdown'
# The commit whose sprites these recipes' row numbers are read from.
ORIGINALS_REV = '9267ec583e32944600ad9857448bfbc9791f9468'

# --------------------------------------------------------------------------
# Recipes. All rows are ROW NUMBERS OF THE ORIGINAL FILE.
#   target : length over width the portrait draws
#   cuts   : where the length comes out. Each cut is a stretch of body [lo, hi) with nothing
#            in it but straight flank and plain roof or bed; rows outside every cut are kept.
#            `dh` is how many rows it gives up (default: its share of the target),
#            `overlap` the rows over which the halves may trade places, `slack` how many
#            rows either side of `dh` it may take to find a better seam, `outline`
#            'keep' to leave the outline alone.
#   floor  : (first row, last row, width) of a bed's plank floor, for the bed gate
# --------------------------------------------------------------------------
RECIPES = {
    'vehicle-topdown-henry':       dict(target=2.02, cuts=[dict(lo=290, hi=830)]),
    'vehicle-topdown-henry-rear':  dict(target=2.02, cuts=[dict(lo=430, hi=880)]),
    'vehicle-topdown-bea':         dict(target=2.23, cuts=[dict(lo=305, hi=696)]),
    'vehicle-topdown-bea-rear':    dict(target=2.23, cuts=[dict(lo=400, hi=1025)]),
    'vehicle-topdown-spark':       dict(target=1.88, cuts=[dict(lo=362, hi=1167, overlap=80)]),
    'vehicle-topdown-spark-rear':  dict(target=1.88, cuts=[dict(lo=420, hi=1280, overlap=80)]),
    'vehicle-topdown-big-tilly-rear': dict(
        target=1.79, floor=(402, 1741, 508), floor_to=2.205,
        cuts=[dict(lo=600, hi=1400, dh=220, slack=12)]),
}

DECLINED = {
    'vehicle-topdown-big-tilly':
        'bed rectangle 531x1077 (2.03:1) and plank floor 507x1118 (2.20:1) are at the limit of a 2x4, '
        'and no cut through the cab (rows 1300-1530) joins cleanly at the side windows and pillars',
}

OVERLAP = 120       # rows over which the two halves of the van are allowed to trade places
FEATHER = 6         # rows of soft edge along the chosen seam path
WIGGLE = 400.0      # cost, in squared grey levels, of the path stepping a row between columns
ALPHA_W = np.array([1.0, 1.0, 1.0, 3.0])   # alpha counts three times a colour when choosing a palette entry
RINGING = 4.0       # alpha (0-255) below which a resampled pixel is taken to be empty
SLACK = 0.005       # how far L/W may stray from the target to find a better seam (fraction of target)

LIVERY = {'henry': (142, 52, 54), 'bea': (74, 112, 164), 'spark': (116, 156, 102)}
LIVERY_MAX = 60
LENGTH_TOL = 0.02


# ---------------------------------------------------------------- image helpers

def load(source, stem):
    """The original sprite as (PIL image, RGBA array): from `source` if given, else from git."""
    if source:
        im = Image.open(os.path.join(source, stem + '.png'))
    else:
        blob = subprocess.run(['git', 'show', f'{ORIGINALS_REV}:{ASSETS_REL}/{stem}.png'],
                              cwd=ROOT, check=True, capture_output=True).stdout
        im = Image.open(io.BytesIO(blob))
    im.load()
    return im, np.array(im.convert('RGBA'))


def premult(rgba):
    f = rgba.astype(np.float64)
    f[..., :3] *= f[..., 3:4] / 255.0
    return f


def edges(alpha):
    """Sub-pixel left and right edge of the body on every row, from alpha (0-255)."""
    al = alpha.astype(np.float64) / 255.0
    w = al.shape[1]
    c = w // 2
    return (1.0 - al[:, :c]).sum(1), w - (1.0 - al[:, c:]).sum(1)


def opaque_box(rgba, thr=24):
    ys, xs = np.nonzero(rgba[..., 3] > thr)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def aspect(rgba):
    x0, y0, x1, y1 = opaque_box(rgba)
    return (y1 - y0) / (x1 - x0)


def cubic_rows(prem, ysrc, xsrc):
    """Catmull-Rom sample of premultiplied rows. prem (H,W,4); ysrc (n,) ints; xsrc (n,K) floats.

    At whole-pixel positions the weights are (0,1,0,0), so a row that needs no
    horizontal change comes back exactly as it went in."""
    n, k = xsrc.shape
    w = prem.shape[1]
    out = np.zeros((n, k, 4))
    for i in range(n):
        row = prem[int(ysrc[i])]
        xs = xsrc[i]
        x0 = np.floor(xs).astype(int)
        t = (xs - x0)[:, None]
        wts = ((-t ** 3 + 2 * t ** 2 - t) / 2, (3 * t ** 3 - 5 * t ** 2 + 2) / 2,
               (-3 * t ** 3 + 4 * t ** 2 + t) / 2, (t ** 3 - t ** 2) / 2)
        acc = np.zeros((k, 4))
        for j, wt in enumerate(wts):
            idx = x0 + (j - 1)
            ok = (idx >= 0) & (idx < w)
            vals = np.zeros((k, 4))
            vals[ok] = row[idx[ok]]
            acc += wt * vals
        out[i] = acc
    return out


# ---------------------------------------------------------------- the middle

class Middle:
    """Geometry of one stretch of body that is allowed to change.

    Where the sprite carries the taper of the skew warp, the outline is measured, smoothed,
    and replaced inside the stretch by one smooth curve between the two end bands, so the
    van keeps its width at both ends and has no step where the length came out. Where it
    does not (`outline='keep'`) rows are never re-fitted and the two halves are simply made
    to agree."""

    SMOOTH = 8.0        # rows of Gaussian smoothing on the measured outline
    SLOPE_ROWS = 60     # rows either side of each boundary used to read the outline's direction

    def __init__(self, prem, lo, hi, outline='fit'):
        self.h, self.w = prem.shape[:2]
        self.lo, self.hi = lo, hi
        self.fit = outline == 'fit'
        xl, xr = edges(prem[..., 3])
        self.xl, self.xr = xl, xr
        self.sl = gaussian_filter1d(xl, self.SMOOTH, mode='nearest')
        self.sr = gaussian_filter1d(xr, self.SMOOTH, mode='nearest')

    @staticmethod
    def _slope(e, a, b):
        ys = np.arange(a, b)
        return np.polyfit(ys, e[ys], 1)[0]

    def source_edges(self, y):
        y = np.asarray(y).astype(int)
        return self.sl[y], self.sr[y]

    def target_edges(self, yout, new_len):
        """The outline of the shortened stretch: the same two end widths and the same two end
        directions, joined by one smooth curve."""
        yout = np.asarray(yout, float)
        out = []
        for s in (self.sl, self.sr):
            k = min(self.SLOPE_ROWS, (self.hi - self.lo) // 3)
            spl = CubicHermiteSpline(
                [self.lo, self.lo + new_len],
                [s[self.lo], s[self.hi]],
                [self._slope(s, self.lo, self.lo + k), self._slope(s, self.hi - k, self.hi)])
            out.append(spl(yout))
        return out[0], out[1]

    def rows(self, prem, yout, offset, new_len):
        """Output rows `yout`, drawn from source rows yout+offset, each fitted to the new outline.
        A row that is already within a third of a pixel of where it should be is copied as it is."""
        yout = np.asarray(yout)
        ysrc = yout + offset
        if not self.fit:
            return prem[ysrc].copy()
        tl, tr = self.target_edges(yout, new_len)
        sl, sr = self.source_edges(ysrc)
        x = np.arange(self.w, dtype=float)[None, :]
        scale = ((sr - sl) / (tr - tl))[:, None]
        xs = sl[:, None] + (x - tl[:, None]) * scale
        still = (np.abs(tl - sl) < 0.35) & (np.abs(tr - sr) < 0.35)
        xs[still] = np.broadcast_to(x, xs.shape)[still]
        return cubic_rows(prem, ysrc, xs)

    def normalised(self, prem, margin=0.03, k=None):
        """Every row of the stretch resampled to the same width, so two rows can be compared
        whatever the taper."""
        ys = np.arange(self.lo, self.hi)
        if not self.fit:
            return prem[ys]
        k = k or int(self.w * (1 + 2 * margin))
        u = np.linspace(-margin, 1 + margin, k)[None, :]
        sl, sr = self.source_edges(ys)
        xs = sl[:, None] + u * (sr - sl)[:, None]
        return cubic_rows(prem, ys, xs)


def candidate_seams(norm, dh_range, hw):
    """For each removed length, the cost of putting the seam at each output row, from the matching of the rows."""
    n = norm.shape[0]
    out = []
    for dh in dh_range:
        if n - dh < 2 * hw + 2:
            continue
        d = ((norm[:n - dh] - norm[dh:]) ** 2).sum(-1).mean(-1)          # row y vs row y+dh
        c = np.concatenate([[0.0], np.cumsum(d)])
        for s in range(hw, n - dh - hw):
            out.append((c[s + hw] - c[s - hw], dh, s))
    out.sort()
    return out


def min_cut(a, b, wiggle=WIGGLE):
    """Cheapest left-to-right path through the rows of the overlap: above it use a, below it use b."""
    e = ((a - b) ** 2).sum(-1)                  # (rows, cols)
    r, w = e.shape
    acc = np.zeros_like(e)
    back = np.zeros((r, w), dtype=np.int8)
    acc[:, 0] = e[:, 0]
    for x in range(1, w):
        prev = acc[:, x - 1]
        up = np.concatenate([[np.inf], prev[:-1]]) + wiggle
        dn = np.concatenate([prev[1:], [np.inf]]) + wiggle
        stack = np.stack([up, prev, dn])
        k = stack.argmin(0)
        acc[:, x] = e[:, x] + stack[k, np.arange(r)]
        back[:, x] = k - 1                       # -1 came from the row above, +1 from below
    path = np.zeros(w, dtype=int)
    path[-1] = acc[:, -1].argmin()
    for x in range(w - 1, 0, -1):
        path[x - 1] = path[x] + back[path[x], x]
    return path, acc[:, -1].min()


def blend(a, b, path, feather=FEATHER):
    r = a.shape[0]
    y = np.arange(r)[:, None]
    m = np.clip((y - path[None, :] + 0.5) / feather + 0.5, 0.0, 1.0)[..., None]
    return a * (1 - m) + b * m


def apply_cut(prem, pristine, cut, log=print):
    """Take `cut['dh']` rows out of rows [lo, hi) of `prem`. Returns the shorter image, the row ledger and what was done."""
    h, w = prem.shape[:2]
    lo, hi, dh0 = cut['lo'], cut['hi'], cut['dh']
    hw = cut.get('overlap', OVERLAP) // 2
    mid = Middle(prem, lo, hi, cut.get('outline', 'fit'))
    slack = cut.get('slack', 1)
    norm = mid.normalised(prem)
    cands = candidate_seams(norm, range(dh0 - slack, dh0 + slack + 1), hw)
    assert cands, f'no room for a seam: {hi - lo} rows, remove {dh0}, window {2 * hw}'
    # Take the best few by matching, then settle them by the real cut through the overlap.
    best, seen = None, set()
    for cost, dh, s in cands[:600]:
        if (dh, s // 6) in seen:
            continue
        seen.add((dh, s // 6))
        if len(seen) > 24:
            break
        new_len = (hi - lo) - dh
        ya = np.arange(lo + s - hw, lo + s + hw)
        a = mid.rows(prem, ya, 0, new_len)
        b = mid.rows(prem, ya, dh, new_len)
        path, pc = min_cut(a, b)
        score = pc + 40.0 * abs(dh - dh0) * w
        if best is None or score < best[0]:
            best = (score, dh, s, path, a, b)
    score, dh, s, path, a, b = best
    new_len = (hi - lo) - dh
    log(f'    rows {lo}-{hi}: removed {dh} (wanted {dh0}); seam at output row {lo + s} '
        f'(window {lo + s - hw}..{lo + s + hw}); cut cost {score:.0f}')

    out = np.zeros((h - dh, w, 4))
    out[:lo] = prem[:lo]
    out[lo + new_len:] = prem[hi:]
    ya = np.arange(lo, lo + s - hw)
    if len(ya):
        out[ya] = mid.rows(prem, ya, 0, new_len)
    out[lo + s - hw:lo + s + hw] = blend(a, b, path)
    yb = np.arange(lo + s + hw, lo + new_len)
    if len(yb):
        out[yb] = mid.rows(prem, yb, dh, new_len)
    changed = out[lo:lo + new_len]
    changed[changed[..., 3] < RINGING] = 0.0          # the faintest tails of the cubic filter, under 1.5% alpha
    ledger = np.concatenate([pristine[:lo], -np.ones(new_len, dtype=int), pristine[hi:]])
    return out, ledger, dict(lo=lo, hi=hi, dh=dh, seam=lo + s, hw=hw, new_len=new_len)


def shorten(rgba, recipe, log=print):
    """Returns (premultiplied float image, ledger, cuts). The ledger says, for each output row,
    which row of the original it is verbatim, or -1 if it was changed."""
    h = rgba.shape[0]
    x0, y0, x1, y1 = opaque_box(rgba)
    ow = x1 - x0
    cuts = [dict(c) for c in recipe['cuts']]
    if not all('dh' in c for c in cuts):
        total = h - round(recipe['target'] * ow)
        weights = [c['hi'] - c['lo'] for c in cuts]
        for c, wt in zip(cuts, weights):
            c.setdefault('dh', round(total * wt / sum(weights)))
        cuts[0]['slack'] = max(1, round(SLACK * recipe['target'] * ow))
    prem = premult(rgba)
    ledger = np.arange(h)
    infos = []
    for cut in sorted(cuts, key=lambda c: -c['lo']):          # lowest first: the rows above keep their numbers
        prem, ledger, info = apply_cut(prem, ledger, cut, log)
        infos.append(info)
    return prem, ledger, sorted(infos, key=lambda i: i['lo'])


# ---------------------------------------------------------------- palette

def to_palette(prem, ledger, src_im):
    """Back to the original's own 256 colours. Rows that were not touched keep their original indices."""
    pal = np.array(src_im.getpalette()[:768], dtype=float).reshape(-1, 3)
    tr = np.full(len(pal), 255.0)
    t = src_im.info.get('transparency')
    if isinstance(t, (bytes, bytearray)):
        tr[:len(t)] = np.frombuffer(t, dtype=np.uint8)
    tree = cKDTree(np.concatenate([pal * tr[:, None] / 255.0, tr[:, None]], axis=1) * ALPHA_W)
    src_idx = np.array(src_im)
    idx = np.zeros(prem.shape[:2], dtype=np.uint8)
    keep = ledger >= 0
    idx[keep] = src_idx[ledger[keep]]
    _, nn = tree.query(prem[~keep].reshape(-1, 4) * ALPHA_W)
    idx[~keep] = nn.reshape(-1, prem.shape[1]).astype(np.uint8)
    out = Image.fromarray(idx, 'P')
    out.putpalette(src_im.getpalette())
    out.info['transparency'] = src_im.info.get('transparency')
    return out


def save_png(im, path):
    tr = im.info.get('transparency')
    if tr is not None:
        im.save(path, transparency=tr, optimize=True)
    else:
        im.save(path, optimize=True)


# ---------------------------------------------------------------- gates

def _load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _row_jump(rgba):
    """Mean colour change from each row to the next, over pixels that are body on both."""
    a = rgba.astype(float)
    d = np.abs(a[1:, :, :3] - a[:-1, :, :3]).sum(-1)
    m = (a[1:, :, 3] > 250) & (a[:-1, :, 3] > 250)
    return (d * m).sum(1) / np.maximum(m.sum(1), 1)


def _leaks(al, xl, xr, rows):
    """Translucent pixels inside the body; and, beyond the outline by more than 2px, the number of
    pixels, the alpha they add up to per row, and the strongest."""
    inside = halo = mass = top = 0
    for y in rows:
        row = al[y].astype(int)
        l, r = int(np.ceil(xl[y])) + 3, int(np.floor(xr[y])) - 3
        inside += int((row[l:r] < 250).sum())
        out = np.concatenate([row[:max(0, int(xl[y]) - 2)], row[int(xr[y]) + 3:]])
        halo += int((out > 0).sum())
        mass += int(out.sum())
        top = max(top, int(out.max()) if len(out) else 0)
    return inside, halo, mass / max(1, len(rows)), top


def gates(stem, recipe, im_in, rgba_in, im_out, ledger, cuts):
    """[(name, ok, detail)] for one file."""
    rgba_out = np.array(im_out.convert('RGBA'))
    h_in, h_out = rgba_in.shape[0], rgba_out.shape[0]
    res = []

    lw_in, lw_out = aspect(rgba_in), aspect(rgba_out)
    if 'floor' in recipe:
        f0, f1, fw = recipe['floor']
        floor = (f1 - f0 - (h_in - h_out)) / fw
        ok = floor >= 2.0 and abs(floor / recipe['floor_to'] - 1) <= LENGTH_TOL
        res.append(('bed', ok, f'plank floor {(f1 - f0) / fw:.2f} -> {floor:.2f}:1 (the front shows {recipe["floor_to"]}; a 2x4 needs about 2.0); '
                               f'L/W {lw_in:.3f} -> {lw_out:.3f}, portrait {recipe["target"]} not reachable'))
    else:
        err = lw_out / recipe['target'] - 1
        res.append(('length', abs(err) <= LENGTH_TOL, f'L/W {lw_in:.3f} -> {lw_out:.3f}, target {recipe["target"]} ({err * 100:+.2f}%)'))

    xi, xo = opaque_box(rgba_in), opaque_box(rgba_out)
    res.append(('width', im_out.size[0] == im_in.size[0] and xo[2] - xo[0] == xi[2] - xi[0],
                f'canvas {im_in.size[0]} -> {im_out.size[0]}, opaque {xi[2] - xi[0]} -> {xo[2] - xo[0]}'))

    keep = ledger >= 0
    same = np.array_equal(rgba_out[keep], rgba_in[ledger[keep]])
    lead = int(np.argmax(ledger < 0))
    trail = int(np.argmax(ledger[::-1] < 0))
    res.append(('ends', same and lead == cuts[0]['lo'] and trail == h_in - cuts[-1]['hi'],
                f'{int(keep.sum())} rows verbatim as RGBA: top {lead}, bottom {trail}'))

    pal_in, pal_out = im_in.getpalette()[:768], im_out.getpalette()[:768]
    same_pal = im_out.mode == 'P' and pal_in == pal_out and im_out.info.get('transparency') == im_in.info.get('transparency')
    res.append(('palette', same_pal, f'mode {im_out.mode}, palette and transparency identical to the original: {same_pal}'))

    base = stem.replace('vehicle-topdown-', '').replace('-rear', '')
    if base in LIVERY:
        rc = _load_module('recolour_topdown', os.path.join(ROOT, 'tools', 'recolour-topdown.py'))
        want = np.array(LIVERY[base])
        dists = [float(np.linalg.norm(b['dominant'] - want)) for b in rc.band_colours(rgba_out)]
        res.append(('livery', max(dists) <= LIVERY_MAX, 'bands 0-6/6-20/35-55/75-92: ' + ' '.join(f'{d:.1f}' for d in dists)
                    + f' RGB units from {tuple(LIVERY[base])} (limit {LIVERY_MAX})'))

    # the join
    xl_o, xr_o = edges(rgba_out[..., 3])
    xl_i, xr_i = edges(rgba_in[..., 3])
    rows_o = [y for c in cuts for y in range(c['lo'], c['lo'] + c['new_len'])]
    rows_i = [y for c in cuts for y in range(c['lo'], c['hi'])]
    in_o, halo_o, mass_o, top_o = _leaks(rgba_out[..., 3], xl_o, xr_o, rows_o)
    in_i, halo_i, mass_i, top_i = _leaks(rgba_in[..., 3], xl_i, xr_i, rows_i)
    res.append(('fringe', in_o <= in_i and top_o <= max(top_i, 16) + 4 and mass_o <= mass_i * 1.5 + 1.0,
                f'translucent body pixels {in_o} (original {in_i}); beyond the outline {halo_o} pixels, '
                f'alpha {mass_o:.1f}/row, strongest {top_o} (original {halo_i}, {mass_i:.1f}/row, {top_i})'))

    step_o = max(max(np.abs(np.diff(xl_o[c['lo'] - 1:c['lo'] + c['new_len'] + 1])).max(),
                     np.abs(np.diff(xr_o[c['lo'] - 1:c['lo'] + c['new_len'] + 1])).max()) for c in cuts)
    step_i = max(max(np.abs(np.diff(xl_i[c['lo'] - 1:c['hi'] + 1])).max(),
                     np.abs(np.diff(xr_i[c['lo'] - 1:c['hi'] + 1])).max()) for c in cuts)
    res.append(('outline', step_o <= step_i + 0.75, f'largest outline step {step_o:.2f}px (original {step_i:.2f}px)'))

    jump_o, jump_i = _row_jump(rgba_out), _row_jump(rgba_in)
    seam_max = max(jump_o[c['seam'] - c['hw'] - 4:c['seam'] + c['hw'] + 4].max() for c in cuts)
    orig_max = max(jump_i[c['lo']:c['hi']].max() for c in cuts)
    res.append(('seam', seam_max <= orig_max * 1.1 + 0.5,
                f'largest row-to-row jump at the seam {seam_max:.2f} (largest in the original body {orig_max:.2f})'))
    return res


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', help='where the shortened files are written (default: a temp dir)')
    ap.add_argument('--only', help='only the recipes whose stem contains this')
    ap.add_argument('--src', help='read the originals from this directory instead of git')
    ap.add_argument('--install', action='store_true', help='copy each file that passes its gates over the one in assets/')
    args = ap.parse_args()
    out_dir = args.out or tempfile.mkdtemp(prefix='shorten-topdown-')
    os.makedirs(out_dir, exist_ok=True)

    failed = []
    for stem, recipe in RECIPES.items():
        if args.only and args.only not in stem:
            continue
        print(stem)
        im, rgba = load(args.src, stem)
        prem_out, ledger, cuts = shorten(rgba, recipe)
        out = to_palette(prem_out, ledger, im)
        path = os.path.join(out_dir, stem + '.png')
        save_png(out, path)
        out = Image.open(path)
        out.load()
        results = gates(stem, recipe, im, rgba, out, ledger, cuts)
        for name, ok, detail in results:
            print(f'    [{"pass" if ok else "FAIL"}] {name:8s} {detail}')
        if all(ok for _, ok, _ in results):
            if args.install:
                with open(path, 'rb') as fh:
                    data = fh.read()
                with open(os.path.join(ASSETS, stem + '.png'), 'wb') as fh:
                    fh.write(data)
                print(f'    installed {stem}.png ({out.size[0]}x{out.size[1]})')
        else:
            failed.append(stem)
            print('    NOT installed')
    for stem, why in DECLINED.items():
        if not args.only or args.only in stem:
            print(f'{stem}\n    declined, left as drawn: {why}')
    print(f'written to {out_dir}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
