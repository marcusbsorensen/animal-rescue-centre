#!/usr/bin/env python3
"""redraw-fronts.py — bring the front top-downs of Bea, Spark and Big Tilly to the camera of their rear views.

    python3 tools/redraw-fronts.py --out /tmp/fronts                 # all three, gated, written to /tmp/fronts
    python3 tools/redraw-fronts.py --out /tmp/fronts --only bea      # one (a substring of the stem)
    python3 tools/redraw-fronts.py --out /tmp/fronts --sheet s.jpg   # and the comparison sheet
    python3 tools/redraw-fronts.py --out /tmp/fronts --install       # and install each file that passes its gates

Nothing is installed unless `--install` is given. Deterministic: the sources are read from git
(`SOURCE_REV`, the commit that installed the shortened top-downs), not from the working tree, so
running it again after the fronts have been installed redraws the same originals rather than
redrawing the redraw. The rears are only ever read.

WHY. Marcus, 2026-10-11, looking at the fleet from above: the REAR views are right and the FRONTS are
not ("That is not the same vehicle being seen from the front and the back. The back view is much
better, undistorted"). `docs/fleet-canon.md` section 3 has the finding: a camera audit in September
had already put `bea-rear` and `big-tilly-rear` in "camera right, leave alone" and the fronts in "flat
plan view", and a flat plan view given a taper (`skew-topdown.py` narrows every file not in its
ALREADY_CORRECT set to 0.88 at the far end) does exactly what he saw: the body thins towards the back,
and it shows faces that a camera in front of and above the van cannot reach. On Bea's front a line near
the top that reads as the rear hatch; on Spark's a black rectangle that is his blacked-out rear window
and reads as a sunroof.

THE METHOD, which is programmatic and no model is involved. The rear view is the camera, so the front is
built against it and not drawn again:

1. THE BODY IS THE REAR'S. The rear's outline is measured row by row (`ref_profile`). Where the front's
   roof is a roof (rows `ya` to `yb` of the recipe) every row is scaled about its own centreline until it is
   as wide as the rear is on the same row, so the two sprites have one silhouette along the roof by
   construction (`scale_profile`, `row_scale`). Above `ya` the factor is held, so the far end keeps its own
   rounding; below `yb` it eases to 1.0 by `yc`, so the windscreen, the panel line of the bonnet, the lamps
   and the grille are the front's own art at, or very nearly at, the size they were drawn. Bea's roof was
   401px against the rear's 487 and thinned to 310 at the far end; it is now 487 all the way (the factor is
   1.32 at the far end, 1.14 at the windscreen, 1.0 at the lamps). Spark's rear tapers and so does the roof
   it gives his front (499px at the far end, 556 at the windscreen).
2. THE MIRRORS ARE NOT SCALED. A wing mirror is an object on an arm, not part of the body, and stretching
   it 15% turns it oval, which is the fault `shorten-topdown.py` exists to avoid. They are found by colour
   (Bea's cream shells and gold brackets, Spark's white ones), cut out with their ink and shadow, replaced in
   the flank by a clean piece of flank taken from outside their rows (`remove_pods`), and laid back on at the
   pixels they came from. The mirrors and the wings are also what set the sprite's width, which is why it
   does not change.
3. THE FACES THE CAMERA CANNOT SEE ARE PAINTED OUT. From in front of and above the van the roof ends and the
   tail is out of sight. The inside of the roof at the far end, down to `fill.to`, is replaced by roof taken
   `fill.dy` rows lower (`interior_fill`): Bea's hatch panel and its arc, Spark's rear window. The trim, the
   outline, the flank stripe and the marks on the flank are kept: the paint is found by its colour, so only
   paint is replaced. The fill is feathered into the roof that was there over `fill.feather` rows, and the ink
   line it removes lies wholly inside the unfeathered part.
4. THE GLASS FOLLOWS THE CANON (`docs/fleet-canon.md` section 4): the cab is clear, the animal space is
   tinted. Spark's windscreen was the same charcoal as his rear window; it is mapped to the pale mottled
   blue-grey of Bea's and Big Tilly's windscreens (`clear_glass`), keeping the streaks the generator drew.
   The rears' glass is not touched (see WHAT IT LEAVES).
5. BACK TO 256 COLOURS the way the installed set is made (FASTOCTREE, then the body opaque), because every
   pixel of a front has moved and there is no untouched row left to keep.

BIG TILLY is a different problem (her front was parallel-sided already and her fault is length) and
`build_tilly` has the account of it.

RESULT, on the sources of `SOURCE_REV` (L/W of the opaque pixels, as `scale-check.py` measures it):

    file          size before   size after    L/W front  L/W rear   width     what changed
    bea           579 x 1289    579 x 1289    2.234      2.228      same      roof 401->487 (rear 487), hatch gone
    spark         640 x 1207    640 x 1207    1.886      1.880      same      roof 476-519 -> 499-556 (rear), sunroof gone, windscreen clear
    big-tilly     738 x 2071    738 x 1849    2.505      2.516      same      2.806 -> 2.505; bed rows untouched

The sizes of Bea's and Spark's files do not change, so `VEHICLE_BED_SOURCE` and the beds' rows stand for them.
Big Tilly's file is 222 rows shorter, so on installing it `fleet-art.ts` needs `VEHICLE_BED_SOURCE['animal-lorry']`
= 738x1849 and her bed as `{ x: 0.14, y: 0.045, w: 0.72, h: 0.582 }` (the same 531x1077 rectangle on rows 83-1160,
which no row of this tool touches), and the numbers the two test files record for her move with her height.

WHAT IT LEAVES.
  * Bea's and Spark's bodies are now 0.84 and 0.78-0.86 of their width where they were 0.68 and 0.74, so their beds
    in `VEHICLE_BED` sit with more paint round them than the fleet's 0.855 of the body. At that ratio, measured
    the way `fleet-art.ts` says (the median extent over the bed's own rows) they are Bea `x 0.141, w 0.719`
    and Spark `x 0.165, w 0.670`. Not changed here: it is a decision about the loading screen.
  * `vehicle-topdown-spark-rear.png`'s far end carries a DARK windscreen slot, and `vehicle-topdown-henry-rear.png`'s
    two rear-door windows are CLEAR teal: both disagree with canon section 4 and neither is touched, because the
    rears are the reference. The front windscreen is clear, so on Spark the two ends now differ. (Finished by
    `tools/glass-rears.py`, which changes the glass and nothing else in either file.)
  * Bea's rear shows the front tyres at its far end; her new front shows no rear tyres at its own. Her old front
    did not either, and Spark's does.
  * `decorate-roof.py` finds the roof on the sprite it is given, and the new fronts have longer roofs (Bea's 739
    rows where the hatch line cut it to 557, Spark's 652 where the sunroof cut it to 431), so it must be re-run on them. It was run here on Bea and
    Spark (design A, to /tmp, nothing kept) and finds the roof, covers 0 clipped pixels and keeps the livery bands.

GATES, run on every file and `--install` installs nothing that fails:
  width     the canvas, which `PtvDriveScene` scales by, is the same, and the body to within a pixel (alpha > 128)
  agree-w   front and rear bodies are the same width to 1%
  agree-l/w front and rear L/W agree to 2%
  livery    Bea and Spark: the four bands of the audit (`recolour-topdown.py`: 0-6, 6-20, 35-55, 75-92% of
            painted height) within 60 RGB of slate blue (74,112,164) and leaf green (116,156,102)
  roof      vans: inside the roof above the windscreen no more than 2% ink or glass, and a third of what it was
  glass     Spark: one piece of glass in the cab and it is pale; Big Tilly: one piece, the windscreen
  bed       Big Tilly: the rows that hold her load bed are untouched
  flip      the nose end matches the old nose, and the pair match better as drawn than reversed
  fringe    no more translucent pixels inside the body, soft edge no deeper and no paler, than the original's
  file      mode P, 256 colours, tight crop, opaque body (`install-vehicles.verify`)
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
from scipy.ndimage import (binary_closing, binary_dilation, binary_erosion, binary_fill_holes,
                           binary_opening, gaussian_filter1d, label)

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'apps/game/public/assets/driving/topdown')
ASSETS_REL = 'apps/game/public/assets/driving/topdown'
# The commit whose sprites these recipes' row numbers are read from: the one that installed the
# shortened top-downs (`shorten-topdown.py`).
SOURCE_REV = 'f4cc906'


def _load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sh = _load_module('shorten_topdown', os.path.join(ROOT, 'tools', 'shorten-topdown.py'))
rc = _load_module('recolour_topdown', os.path.join(ROOT, 'tools', 'recolour-topdown.py'))
iv = _load_module('install_vehicles', os.path.join(ROOT, 'tools', 'install-vehicles.py'))

LIVERY = {'bea': (74, 112, 164), 'spark': (116, 156, 102)}
LIVERY_MAX = 60
LENGTH_TOL = 0.02          # front and rear L/W may differ by this much

# ---------------------------------------------------------------------------------- recipes
# All rows are rows of the SOURCE sprite (SOURCE_REV).
#
# Vans (Bea, Spark):
#   roof        (ya, yb, yc): from ya to yb the rows are scaled to the rear's width; above ya the factor is held;
#               from yb it eases to 1.0 at yc, where the wings and the nose begin
#   ref_rows    the rear's rows whose outline is the roof (no cab, no mirrors, no tail face)
#   pods        the mirrors: `y0`-`y1` the rows they are in, `strip` px of flank to re-lay, `split` the row from
#               which the flank is taken from below (a marking that ends under the mirror), `kind` how to find them
#   fill        the far end to paint out: down to row `to`, from `dy` rows lower, `feather` rows of blend,
#               `ref` plain roof rows to read the paint colour from and `tol` how far from it a pixel may be and still be paint,
#               `close`/`erode` the trim kept
#   clean_rows  where the roof must hold nothing but paint, for the gate
#
# Big Tilly: see `build_tilly`.
RECIPES = {
    'bea': dict(
        roof=(200, 690, 1010), ref_rows=(400, 900),
        pods=dict(y0=770, y1=872, strip=26, kind='cream'),
        fill=dict(to=230, dy=330, feather=24, ref=(500, 560), tol=48, close=4, erode=3),
        clean_rows=(0, 640)),
    'spark': dict(
        roof=(400, 667, 880), ref_rows=(400, 800),
        pods=dict(y0=700, y1=822, split=726, strip=46, kind='white'),
        fill=dict(to=300, dy=330, feather=30, ref=(500, 560), tol=48, close=5, erode=4),
        clear_windscreen=True,
        clean_rows=(0, 640)),
    'big-tilly': dict(
        kind='tilly', centre=370,
        # side windows: the polygon `WINDOW`, filled from the roof `donor_dx` px across (rows from `donor_flip`
        # down are taken `donor_up` rows higher, so the donor never reaches the windscreen)
        donor_dx=130, donor_flip=1500, donor_up=240,
        # the cuts, rows of the original. The bonnet takes whatever the roof does not, so that the front ends up
        # exactly as long as the rear. The roof is cut in three column bands: the middle band through the roof,
        # the two side bands through the flank, 150 rows each
        bonnet=dict(lo=1750, hi=1882, dh='rest', overlap=40, slack=0),
        bands=(160, 578, 12),
        roof_mid=dict(lo=1290, hi=1512, dh=150, overlap=50, slack=0),
        roof_side=dict(lo=1405, hi=1575, dh=150, overlap=16, slack=0),
        # the rear's two roof lamps: rectangles of the rear, and where they land on the front
        cubes=dict(src=[(222, 134, 308, 206), (442, 134, 524, 208)], dx=5, dy=1143),
        bed_rows=1260),
}


# ---------------------------------------------------------------------------------- images

def load_src(stem, src=None):
    if src:
        im = Image.open(os.path.join(src, stem + '.png'))
    else:
        blob = subprocess.run(['git', 'show', f'{SOURCE_REV}:{ASSETS_REL}/{stem}.png'],
                              cwd=ROOT, check=True, capture_output=True).stdout
        im = Image.open(io.BytesIO(blob))
    im.load()
    return im, np.array(im.convert('RGBA'))


def smooth(v, s):
    return gaussian_filter1d(np.asarray(v, float), s, mode='nearest')


def straight(prem):
    """Premultiplied float (H, W, 4) back to straight uint8 RGBA."""
    a = prem[..., 3:4]
    rgb = np.where(a > 1e-3, prem[..., :3] * 255.0 / np.maximum(a, 1e-3), 0.0)
    return np.clip(np.rint(np.concatenate([rgb, a], axis=-1)), 0, 255).astype(np.uint8)


def over(top, bottom):
    """Straight-alpha uint8 RGBA, `top` over `bottom`."""
    t, b = top.astype(float), bottom.astype(float)
    ta, ba = t[..., 3:4] / 255.0, b[..., 3:4] / 255.0
    a = ta + ba * (1 - ta)
    rgb = np.where(a > 1e-4, (t[..., :3] * ta + b[..., :3] * ba * (1 - ta)) / np.maximum(a, 1e-4), 0)
    return np.clip(np.rint(np.concatenate([rgb, a * 255.0], -1)), 0, 255).astype(np.uint8)


def checker(rgba, grey=(215, 215, 215)):
    bg = Image.new('RGBA', (rgba.shape[1], rgba.shape[0]), grey + (255,))
    bg.alpha_composite(Image.fromarray(rgba))
    return bg.convert('RGB')


# ---------------------------------------------------------------------------------- reference

def ref_profile(rear_rgba, rows):
    """The rear's outline: sub-pixel left and right edge on every row, and the roof's width over `rows`."""
    xl, xr = sh.edges(rear_rgba[..., 3])
    lo, hi = rows
    return xl, xr, float(np.median((xr - xl)[lo:hi]))


# ---------------------------------------------------------------------------------- wing mirrors

def pod_mask(rgba, cfg):
    """Pixels of the two mirrors: shell, bracket, their ink and their shadow."""
    r, g, b, a = [rgba[..., i].astype(int) for i in range(4)]
    h, w = a.shape
    y0, y1 = cfg['y0'], cfg['y1']
    sel = np.zeros((h, w), bool)
    sel[y0:y1] = True
    xs = np.arange(w)[None, :]
    if cfg['kind'] == 'cream':
        shell = (r > 200) & (g > 185) & (b > 130)
        gold = (r >= 158) & (g >= 85) & (b <= 100) & (r - b >= 90)      # the bracket; the sill is browner
        seed = (shell | gold) & (a > 128) & sel & ((xs < 100) | (xs > w - 101))
        minsize, grow = 60, 5
    else:
        white = (r > 190) & (g > 190) & (b > 180) & (a > 200) & sel
        # a 13px opening takes the white flank sliver away and keeps the shells
        seed = binary_opening(white, structure=np.ones((13, 13))) & ((xs < 130) | (xs > w - 131))
        minsize, grow = 1500, 9
    lab, n = label(seed)
    keep = np.zeros_like(seed)
    for i in range(1, n + 1):
        if (lab == i).sum() > minsize:
            keep |= lab == i
    return binary_dilation(keep, iterations=grow) & sel & (a > 0)


def remove_pods(rgba, cfg):
    """Replace the mirror window by flank taken from outside it, laid along the outline that runs
    between the rows either side. Rows above `split` take the flank of the row above the window,
    rows from `split` down take the flank of the row below it (a marking that ends under the
    mirror, Spark's white sliver, must not run on beneath it). Returns the clean sprite."""
    h, w = rgba.shape[:2]
    y0, y1, strip = cfg['y0'], cfg['y1'], cfg['strip']
    split = cfg.get('split', y1)
    xl, xr = sh.edges(rgba[..., 3])
    top, bot = y0 - 5, y1 + 3
    out = rgba.copy()
    prem = sh.premult(rgba)
    for y in range(y0, y1):
        t = (y - y0) / float(y1 - y0)
        l = xl[top] * (1 - t) + xl[bot] * t
        r = xr[top] * (1 - t) + xr[bot] * t
        ysrc = top if y < split else bot
        for side in (0, 1):
            if side == 0:
                dst = np.arange(0, int(np.ceil(l)) + strip + 2)
                src = xl[ysrc] + (dst - l)
            else:
                dst = np.arange(int(np.floor(r)) - strip - 2, w)
                src = xr[ysrc] + (dst - r)
            seg = sh.cubic_rows(prem, np.array([ysrc]), src[None, :])[0]
            seg[seg[:, 3] < sh.RINGING] = 0
            out[y, dst] = straight(seg[None])[0]
    return out


# ---------------------------------------------------------------------------------- the body

def row_scale(rgba, s_of_y):
    """Every row scaled about its own centreline by s(y), cubic, in premultiplied colour."""
    h, w = rgba.shape[:2]
    prem = sh.premult(rgba)
    xl, xr = sh.edges(rgba[..., 3])
    xl, xr = smooth(xl, 6), smooth(xr, 6)
    c, wsrc = (xl + xr) / 2, xr - xl
    x = np.arange(w, dtype=float)[None, :]
    tl, tr = c - wsrc * s_of_y / 2, c + wsrc * s_of_y / 2
    xs = xl[:, None] + (x - tl[:, None]) * ((xr - xl) / (tr - tl))[:, None]
    out = sh.cubic_rows(prem, np.arange(h), xs)
    out[out[..., 3] < sh.RINGING] = 0
    return straight(out)


def scale_profile(body, ref_xl, ref_xr, roof, ref_rows):
    """s(y): the factor that makes the front's roof the rear's width, and eases off to 1 below it.

    The rear's width is read from its own roof rows (`ref_rows`) and held at the ends of that range, so
    the rear's cab and tail face, which the front does not have at those rows, do not leak in."""
    h = body.shape[0]
    xl, xr = sh.edges(body[..., 3])
    B = smooth(xr - xl, 6)
    Rw = smooth(ref_xr - ref_xl, 6)
    lo, hi = ref_rows
    ref = lambda y: Rw[int(np.clip(y, lo, hi - 1))]
    ya, yb, yc = roof
    s = np.ones(h)
    for y in range(h):
        if y <= yb:
            s[y] = ref(max(y, ya)) / B[max(y, ya)] if y <= ya else ref(y) / B[y]
        elif y <= yc:
            T = ref(yb) + (B[yc] - ref(yb)) * (y - yb) / float(yc - yb)
            s[y] = T / B[y]
    return smooth(s, 12)


# ---------------------------------------------------------------------------------- the far end

def paint_mask(rgba, cfg):
    """Pixels the colour of the roof paint (within `tol` RGB units of its median, taken from the plain roof
    rows `ref`): not the bright flank stripe, the white sliver, the trim or the ink."""
    h, w = rgba.shape[:2]
    r0, r1 = cfg['ref']
    xl, xr = sh.edges(rgba[..., 3])
    c = int((xl[r0:r1].mean() + xr[r0:r1].mean()) / 2)
    ref = np.median(rgba[r0:r1, c - 40:c + 40, :3].reshape(-1, 3).astype(float), axis=0)
    d = np.linalg.norm(rgba[..., :3].astype(float) - ref, axis=-1)
    return (d < cfg['tol']) & (rgba[..., 3] > 200)


def interior_fill(rgba, cfg):
    """Replace everything inside the trim, down to cfg['to'], by roof taken cfg['dy'] rows lower."""
    h, w = rgba.shape[:2]
    to, dy, feather = cfg['to'], cfg['dy'], cfg['feather']
    cr, er = cfg['close'], cfg['erode']
    pm = paint_mask(rgba, cfg)
    sel = np.zeros((h, w), bool)
    sel[:to + feather] = True
    pm &= sel
    yy, xx = np.ogrid[-cr:cr + 1, -cr:cr + 1]
    pm = binary_closing(np.pad(pm, cr), structure=(xx * xx + yy * yy <= cr * cr))[cr:-cr, cr:-cr]
    pm = binary_fill_holes(pm)
    pm = binary_erosion(pm, iterations=er) & sel
    ys = np.arange(h)
    wgt = (np.clip((to + feather - ys) / float(feather), 0, 1)[:, None] * pm)[..., None]
    src = rgba[np.clip(ys + dy, 0, h - 1)]
    out = rgba.astype(float)
    out[..., :3] = rgba[..., :3] * (1 - wgt) + src[..., :3] * wgt
    return np.clip(np.rint(out), 0, 255).astype(np.uint8), pm


# ---------------------------------------------------------------------------------- glass

def clear_glass(rgba, region):
    """Dark glass to clear glass inside `region` (a boolean mask): the streaks the generator drew stay,
    on the pale, mottled blue-grey of Bea's and Big Tilly's windscreens."""
    out = rgba.copy()
    px = rgba[..., :3].astype(float)
    luma = px @ np.array([0.299, 0.587, 0.114])
    lo, hi = np.percentile(luma[region], [5, 95])
    t = np.clip((luma - lo) / max(hi - lo, 1.0), 0, 1)[..., None]
    base, sheen = np.array([138., 160., 180.]), np.array([196., 210., 220.])
    new = base * (1 - t) + sheen * t
    out[..., :3] = np.where(region[..., None], np.clip(np.rint(new), 0, 255), px).astype(np.uint8)
    return out


def glass_region(rgba, rows):
    """The dark windscreen: the largest dark, un-green, opaque piece in `rows`, with its holes filled."""
    r, g, b, a = [rgba[..., i].astype(int) for i in range(4)]
    luma = rgba[..., :3].astype(float) @ np.array([0.299, 0.587, 0.114])
    dark = (luma < 135) & (g - r < 25) & (a > 200)
    sel = np.zeros(dark.shape, bool)
    sel[rows[0]:rows[1]] = True
    dark = binary_opening(dark & sel, structure=np.ones((3, 3)))
    lab, n = label(dark)
    sizes = [(lab == i).sum() for i in range(1, n + 1)]
    comp = lab == (int(np.argmax(sizes)) + 1)
    return binary_fill_holes(comp), luma


def lighten_glass(rgba, region, luma):
    ink = np.clip((luma - 18.0) / 28.0, 0, 1)[..., None]          # the ink line and its soft edge stay as drawn
    mapped = clear_glass(rgba, region)
    out = rgba.astype(float)
    m = region[..., None] * ink
    out[..., :3] = rgba[..., :3] * (1 - m) + mapped[..., :3] * m
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------------- vans

def build_van(name, rec, src=None, log=print):
    f_im, F = load_src(f'vehicle-topdown-{name}', src)
    r_im, R = load_src(f'vehicle-topdown-{name}-rear', src)
    rxl, rxr, roof_w = ref_profile(R, rec['ref_rows'])
    pods = pod_mask(F, rec['pods'])
    body = remove_pods(F, rec['pods'])
    s = scale_profile(body, rxl, rxr, rec['roof'], rec['ref_rows'])
    log(f'    rear roof {roof_w:.0f}px; row scale {" ".join(f"{s[y]:.2f}" for y in range(0, len(s), 150))} (every 150 rows)')
    out = row_scale(body, s)
    layer = F.copy()
    layer[~pods] = 0
    out = over(layer, out)
    out, interior = interior_fill(out, rec['fill'])
    if rec.get('clear_windscreen'):
        region, luma = glass_region(out, (640, 860))
        out = lighten_glass(out, region, luma)
    return f_im, F, R, out


# ---------------------------------------------------------------------------------- Big Tilly
#
# BIG TILLY. Her front was parallel-sided already (`skew-topdown.py` leaves her alone) and what is
# wrong with it is LENGTH: the front was 738x2071 (2.81) and the rear, shortened by `shorten-topdown.py`,
# is 735x1849 (2.52), so she contradicted herself. `shorten-topdown.py` could not shorten the cab: it is
# windscreen, mirrors, side windows, pillars and tyres with no plain stretch, and every cut tore a side
# window. So it is made so that it can be cut, and cut:
#
# 1. The two side windows come out. They are an almond of glass with a pillar bar across it, on the
#    FLANK of the cab, and from in front of and above the cab a flank is a face the camera cannot
#    reach (the rear shows no side window either). Each is a polygon (`WINDOW`, the left one; the
#    right is its mirror about the centreline) filled with cab paint cloned from the plain roof and
#    corrected to the colour just outside it (`poisson_clone`), so the roof texture runs through.
# 2. The cab is then plain red from the headboard to the windscreen apart from its outline, so the ROOF
#    is cut, in THREE COLUMN BANDS: the middle one through the roof (rows 1290-1512) and the two side
#    ones through the flank (rows 1405-1575), 150 rows each, because the roof's shoulders and the bed's
#    rails and tyres sit beside the roof at the rows the middle can spare and the flank is plain at the
#    rows the sides can. Each band is cut by `shorten-topdown.py`'s own seam finder (the cut through the
#    paint, the outline fitted so there is no step), on a copy of itself mirrored about its inner edge
#    so that the outline fit, which works about the centreline, holds for a band with an outline on one
#    side. The bands are laid back together with a 24px cross-fade through plain paint.
# 3. The BONNET is cut full width (rows 1750-1882, 72 rows out): its panel line keeps its shape because
#    the panel's sides are nearly straight, the wings and the tyres go with it at the outline's own slope.
#    This takes whatever the roof does not, so that the front ends up exactly as long as the rear.
# 4. The rear has two red roof lamps on the cab. The front had none. They are copied across, because a
#    mark that is on the roof at one end must be on it at the other (canon section 5). They are the same
#    from either end, so nothing is turned.
#
# RESULT: 738x1849, L/W 2.505, against the rear's 735x1849, 2.516. Nothing above row 1260 is touched,
# so the bed is what it was: the rectangle `VEHICLE_BED` lays the crates in is 531x1077 (2.03:1) on rows
# 83-1160, which is what a 2x4 of eight square crates needs (`crate-stacking.ts`: 2 columns, 4 rows).
#
# WHY NOT 1.79, her portrait's L/W. 1.79 is a 1321-row sprite. The bed rectangle ends at row 1160 and
# everything below it is the headboard and the cab, now 689 rows; 1321 would leave 161 for them, which is
# shorter than her windscreen alone (about 140) with nothing for the roof, the bonnet, the lamps or the
# grille. What 1.79 buys is a bed of about 1:1, which is a 2x2 load. The cab is as short as it goes with
# the roof cut to about 150 rows and the bonnet panel to about 120; the bed cannot go. The two ends now agree, which is
# what the principle needs, at 2.5.

WINDOW = [(120, 1318), (137, 1330), (145, 1360), (148, 1420), (147, 1480), (143, 1530), (138, 1570), (132, 1610),
          (124, 1645), (112, 1652), (104, 1632), (96, 1600), (88, 1550), (84, 1490), (88, 1440), (98, 1390), (110, 1345)]


def window_mask(shape, centre):
    from PIL import ImageDraw
    h, w = shape
    out = np.zeros((h, w), bool)
    for flip in (False, True):
        im = Image.new('L', (w, h), 0)
        ImageDraw.Draw(im).polygon([((2 * centre - x) if flip else x, y) for x, y in WINDOW], fill=255)
        out |= np.array(im) > 0
    return out


def poisson_clone(rgba, mask, donor_fn, ring=(3, 9), sigma=6):
    """Fill `mask` with donor pixels, corrected by the smooth difference between the donor and what is
    known (red paint only) just outside the mask, so the fill meets its surroundings without a seam."""
    from scipy.ndimage import gaussian_filter
    h, w = mask.shape
    don = np.zeros((h, w, 3))
    ring_m = binary_dilation(mask, iterations=ring[1]) & ~binary_dilation(mask, iterations=ring[0])
    for m in (mask, ring_m):
        ys, xs = np.nonzero(m)
        don[ys, xs] = donor_fn(ys, xs)
    img = rgba[..., :3].astype(float)
    luma = img @ np.array([0.299, 0.587, 0.114])
    good = ring_m & (img[..., 0] > img[..., 1] + 70) & (luma > 100)
    res = np.zeros((h, w, 3))
    res[good] = (img - don)[good]
    wgt = good.astype(float)
    s = sigma
    while True:
        num = np.stack([gaussian_filter(res[..., c], s) for c in range(3)], -1)
        den = gaussian_filter(wgt, s)[..., None]
        if (den[..., 0][mask] > 1e-3).all() or s > 80:
            break
        s *= 1.6
    corr = num / np.maximum(den, 1e-6)
    out = rgba.copy()
    out[..., :3][mask] = np.clip(don[mask] + corr[mask], 0, 255).astype(np.uint8)
    return out


def cut_band(prem, x0, x1, cut, edge, log=print):
    """One column band through `shorten-topdown.py`'s cut. A band with an outline on one side is mirrored
    about its inner edge first, so that the outline fit (which works about the centreline) holds."""
    h = prem.shape[0]
    strip = prem[:, x0:x1]
    cut = dict(cut)
    if edge == 'L':
        sym, cut['outline'] = np.concatenate([strip, strip[:, ::-1]], axis=1), 'fit'
    elif edge == 'R':
        sym, cut['outline'] = np.concatenate([strip[:, ::-1], strip], axis=1), 'fit'
    else:
        sym, cut['outline'] = strip, 'keep'
    smoothing, sh.Middle.SMOOTH = sh.Middle.SMOOTH, (2.5 if edge else sh.Middle.SMOOTH)   # a mirror pod 10 rows below must not pull the outline
    try:
        out, ledger, info = sh.apply_cut(sym, np.arange(h), cut, log)
    finally:
        sh.Middle.SMOOTH = smoothing
    n = x1 - x0
    return (out[:, :n] if edge == 'L' else out[:, n:] if edge == 'R' else out), info


def build_tilly(name, rec, src=None, log=print):
    f_im, F = load_src('vehicle-topdown-big-tilly', src)
    r_im, R = load_src('vehicle-topdown-big-tilly-rear', src)
    h, w = F.shape[:2]
    centre = rec['centre']
    # 1. the side windows
    wm = window_mask((h, w), centre)
    left, right = wm.copy(), wm.copy()
    left[:, centre:] = False
    right[:, :centre] = False
    img = F.copy()
    for m, dx in ((left, rec['donor_dx']), (right, -rec['donor_dx'])):
        def donor(ys, xs, dx=dx):
            yy = np.where(ys < rec['donor_flip'], ys, ys - rec['donor_up'])
            return img[yy, np.clip(xs + dx, 0, w - 1), :3].astype(float)
        img = poisson_clone(img, m, donor)
    prem = sh.premult(img)
    # 3. the bonnet, full width
    b = dict(rec['bonnet'])
    if b['dh'] == 'rest':            # whatever the roof does not take: the front ends up as long as the rear
        b['dh'] = h - R.shape[0] - rec['roof_mid']['dh']
        log(f'    the front is {h} rows and the rear {R.shape[0]}: the roof takes {rec["roof_mid"]["dh"]}, the bonnet {b["dh"]}')
    prem, ledger, info = sh.apply_cut(prem, np.arange(h), b, log)
    # 2. the roof, in three bands
    x_l, x_r, fade = rec['bands']
    pieces = []
    for (x0, x1, edge, cut) in ((0, x_l + fade, 'L', rec['roof_side']), (x_l - fade, x_r + fade, None, rec['roof_mid']),
                                (x_r - fade, w, 'R', rec['roof_side'])):
        band, info = cut_band(prem, x0, x1, cut, edge, log)
        pieces.append((x0, x1, band))
    nh = pieces[0][2].shape[0]
    assert all(p[2].shape[0] == nh for p in pieces), [p[2].shape for p in pieces]
    out = np.zeros((nh, w, 4))
    wsum = np.zeros((1, w, 1))
    for i, (x0, x1, band) in enumerate(pieces):
        wt = np.ones(x1 - x0)
        if i > 0:
            wt[:2 * fade] = np.linspace(0, 1, 2 * fade)
        if i < len(pieces) - 1:
            wt[-2 * fade:] = np.linspace(1, 0, 2 * fade)
        out[:, x0:x1] += band * wt[None, :, None]
        wsum[0, x0:x1, 0] += wt
    out /= np.maximum(wsum, 1e-6)
    res = straight(out)
    res = paste_patches(res, R, rec['cubes'])
    return f_im, F, R, res


def paste_patches(front, rear, cfg, feather=5):
    """Copy rectangles of the rear onto the front, shifted by (dx, dy), edges feathered into the paint
    round them. The rear's two roof lamps are the same lamps from either end, so no turning is needed."""
    from scipy.ndimage import gaussian_filter
    out = front.astype(float)
    for (x0, y0, x1, y1) in cfg['src']:
        patch = rear[y0:y1, x0:x1].astype(float)
        m = np.zeros(patch.shape[:2])
        m[feather:-feather, feather:-feather] = 1.0
        m = gaussian_filter(m, feather / 2.0)[..., None]
        ty0, tx0 = y0 + cfg['dy'], x0 + cfg['dx']
        region = out[ty0:ty0 + patch.shape[0], tx0:tx0 + patch.shape[1], :3]
        out[ty0:ty0 + patch.shape[0], tx0:tx0 + patch.shape[1], :3] = region * (1 - m) + patch[..., :3] * m
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------------- palette

def to_palette(rgba, like=None):
    """256 colours the way the installed set is made: FASTOCTREE, then the body opaque."""
    q = Image.fromarray(rgba).quantize(colors=256, method=Image.FASTOCTREE)
    return iv.solid_palette(q)


def save_png(im, path):
    tr = im.info.get('transparency')
    if tr is not None:
        im.save(path, transparency=tr, optimize=True)
    else:
        im.save(path, optimize=True)


# ---------------------------------------------------------------------------------- gates

def silhouette_ends(rgba, band=0.5, size=256):
    """Head and tail of the silhouette (long axis down the rows), each `band` widths deep, on a fixed width."""
    return iv.end_mask(Image.fromarray(rgba), False), band


def iou(a, b):
    return (a & b).sum() / max(1, (a | b).sum())


def end_ious(new, old):
    """(head, tail, reversed head, reversed tail): the nose is the TAIL of a front, at the bottom of the image."""
    n, o = iv.end_mask(Image.fromarray(new), False), iv.end_mask(Image.fromarray(old), False)
    b = round(iv.GATE_SIZE * iv.END_BAND)
    head, tail = iou(n[:b], o[:b]), iou(n[-b:], o[-b:])
    rhead, rtail = iou(n[:b], o[-b:][::-1]), iou(n[-b:], o[:b][::-1])
    return head, tail, rhead, rtail


def roof_dark_share(rgba, rows, inset=48):
    """Share of the roof's interior (inside the outline by `inset` px) that is ink or glass rather than paint."""
    h, w = rgba.shape[:2]
    xl, xr = sh.edges(rgba[..., 3])
    xs = np.arange(w)[None, :]
    inside = (xs > xl[:, None] + inset) & (xs < xr[:, None] - inset)
    sel = np.zeros((h, w), bool)
    sel[rows[0]:rows[1]] = True
    m = inside & sel & (rgba[..., 3] > 250)
    luma = rgba[..., :3].astype(float) @ np.array([0.299, 0.587, 0.114])
    paint = np.median(luma[m])
    return float((luma[m] < 0.55 * paint).mean()), float(paint)


def glass_pieces(rgba, rows, minsize=400):
    """Number of separate pieces of glass-coloured pixels (blue-grey, not paint) in `rows`."""
    r, g, b, a = [rgba[..., i].astype(int) for i in range(4)]
    glass = (b > r + 8) & (a > 200) & (b > 120)
    sel = np.zeros(glass.shape, bool)
    sel[rows[0]:rows[1]] = True
    lab, n = label(glass & sel)
    return sum(1 for i in range(1, n + 1) if (lab == i).sum() >= minsize)


def edge_stats(rgba):
    """What a fringe is made of: translucent pixels with no empty pixel near them (inside the body); the depth of
    the soft edge, translucent pixels per pixel of outline; and how much lighter the soft edge is than the opaque
    paint next to it (a pale halo is the one that shows on tarmac)."""
    from scipy.ndimage import distance_transform_edt, binary_erosion as ero
    a = rgba[..., 3]
    soft = (a > 16) & (a < 250)
    solid = a >= 250
    empty = a <= 16
    near_empty = binary_dilation(empty, iterations=3)
    inside = int((soft & ~near_empty).sum())
    perim = int((solid & ~ero(solid)).sum())
    luma = rgba[..., :3].astype(float) @ np.array([0.299, 0.587, 0.114])
    idx = distance_transform_edt(~solid, return_distances=False, return_indices=True)
    nearest = luma[idx[0], idx[1]]
    halo = float((luma[soft] - nearest[soft]).mean()) if soft.any() else 0.0
    return dict(inside=inside, soft=float(soft.sum()) / max(perim, 1), halo=halo)


def gates(name, rec, src_rgba, rear_rgba, raw, im):
    """[(name, ok, detail)]. `raw` is the straight-alpha RGBA before the palette, `im` the written file."""
    out = np.array(Image.open(im).convert('RGBA'))
    res = []
    xi, xo, xr_ = sh.opaque_box(src_rgba, 128), sh.opaque_box(out, 128), sh.opaque_box(rear_rgba, 128)
    wi, wo, wr = xi[2] - xi[0], xo[2] - xo[0], xr_[2] - xr_[0]
    res.append(('width', Image.open(im).size[0] == src_rgba.shape[1] and abs(wo - wi) <= 1,
                f'canvas {src_rgba.shape[1]} -> {Image.open(im).size[0]} (what PtvDriveScene scales by), body {wi} -> {wo}'))
    res.append(('agree-w', abs(wo - wr) <= max(2, 0.01 * wr), f'front {wo}px, rear {wr}px'))
    lw_f, lw_r = sh.aspect(out), sh.aspect(rear_rgba)
    err = lw_f / lw_r - 1
    res.append(('agree-l/w', abs(err) <= LENGTH_TOL,
                f'front {lw_f:.3f} ({out.shape[0]}x{out.shape[1]}), rear {lw_r:.3f} ({rear_rgba.shape[0]}x{rear_rgba.shape[1]}), '
                f'{err * 100:+.2f}% (limit {LENGTH_TOL * 100:.0f}%); was {sh.aspect(src_rgba):.3f}'))
    if name in LIVERY:
        want = np.array(LIVERY[name])
        d = [float(np.linalg.norm(b['dominant'] - want)) for b in rc.band_colours(out)]
        res.append(('livery', max(d) <= LIVERY_MAX, 'bands 0-6/6-20/35-55/75-92: ' + ' '.join(f'{v:.1f}' for v in d) +
                    f' RGB units from {tuple(LIVERY[name])} (limit {LIVERY_MAX})'))
    if rec.get('clear_windscreen'):
        r, g, b, a = [out[..., i].astype(int) for i in range(4)]
        pale = (b > r + 8) & (a > 200) & (b > 120)
        pieces = glass_pieces(out, (rec['clean_rows'][1], int(out.shape[0] * 0.75)))
        luma = out[..., :3].astype(float) @ np.array([0.299, 0.587, 0.114])
        res.append(('glass', pieces == 1 and float(np.median(luma[pale])) >= 140,
                    f'{pieces} piece of glass in the cab, median luma {np.median(luma[pale]):.0f}: the windscreen, and it is clear'))
    if rec.get('kind') == 'tilly':
        diff = int(np.abs(raw[:rec['bed_rows']].astype(int) - src_rgba[:rec['bed_rows']].astype(int)).max())
        res.append(('bed', diff <= 2, f'the top {rec["bed_rows"]} rows, which hold the load bed (the 2x4 rectangle is 531x1077, 2.03:1, rows 83-1160), differ from the original by at most {diff}/255'))
        pieces = glass_pieces(out, (rec['bed_rows'], out.shape[0]))
        res.append(('glass', pieces == 1, f'{pieces} piece(s) of glass in the cab: the windscreen only (the side windows were flank)'))
    else:
        share, paint = roof_dark_share(out, rec['clean_rows'])
        old = roof_dark_share(src_rgba, rec['clean_rows'])[0]
        res.append(('roof', share <= 0.02 and share <= 0.35 * old,
                    f'ink or glass on the roof above the windscreen: {share * 100:.2f}% of it, was {old * 100:.2f}% '
                    f'(limit 2% and a third of what it was)'))
    head, tail, rhead, rtail = end_ious(out, src_rgba)
    res.append(('flip', tail >= 0.9 and head >= 0.75 and head + tail > rhead + rtail,
                f'nose end IoU {tail:.3f}, far end {head:.3f}; reversed {rtail:.3f}/{rhead:.3f}'))
    e1, e0 = edge_stats(out), edge_stats(src_rgba)
    res.append(('fringe', e1['inside'] <= e0['inside'] * 1.25 + 20 and e1['soft'] <= e0['soft'] * 1.25 + 0.2 and e1['halo'] <= e0['halo'] + 12,
                f'translucent pixels inside the body {e1["inside"]} (original {e0["inside"]}); soft edge {e1["soft"]:.2f}px deep '
                f'(original {e0["soft"]:.2f}); colour of the soft edge against the paint beside it {e1["halo"]:+.1f} (original {e0["halo"]:+.1f})'))
    problems = iv.verify(im, Image.open(im).size)
    res.append(('file', not problems, 'mode P, <=256 colours, tight crop, opaque body' if not problems else '; '.join(problems)))
    return res


# ---------------------------------------------------------------------------------- the sheet

def font(size):
    from PIL import ImageFont
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def make_sheet(out_dir, path, portraits=None, limit=390_000, game_scale=0.155):
    """Per character: master portrait, rear (the reference), old front, new front; then every front and rear at
    the size the game draws them (`PtvDriveScene` scales a vehicle to `vanW * VEHICLE_SIZE`, which for
    Henry at a 150px lane is 87px of his 561: 0.155 of the file)."""
    from PIL import ImageDraw
    pdir = portraits or os.path.join(ROOT, 'apps/game/public/assets/driving/vehicles')
    H, pad, lab = 430, 14, 22
    f_lab = font(15)
    blocks = []
    for name in RECIPES:
        pic = []
        ppath = os.path.join(pdir, f'vehicle-{name}.png')
        if not os.path.exists(ppath):            # a portrait that needed no change is not rewritten
            ppath = os.path.join(ROOT, 'apps/game/public/assets/driving/vehicles', f'vehicle-{name}.png')
        port = Image.open(ppath).convert('RGBA')
        pc = Image.new('RGBA', port.size, (232, 228, 218, 255))
        pc.alpha_composite(port)
        port = pc.convert('RGB').resize((H, H // 2), Image.LANCZOS)
        cols = []
        for label, im in (('rear (reference)', load_src(f'vehicle-topdown-{name}-rear')[0]),
                          ('old front', load_src(f'vehicle-topdown-{name}')[0]),
                          ('new front', Image.open(os.path.join(out_dir, f'vehicle-topdown-{name}.png')))):
            c = checker(np.array(im.convert('RGBA')), (232, 228, 218))
            cols.append((label, c.resize((round(c.width * H / c.height), H), Image.LANCZOS)))
        blocks.append((name, port, cols))
    W = max(blk[1].width + sum(c[1].width for c in blk[2]) + pad * 4 for blk in blocks)
    # the game-scale row
    small = []
    for name in RECIPES:
        for label, im in (('rear', load_src(f'vehicle-topdown-{name}-rear')[0]),
                          ('old', load_src(f'vehicle-topdown-{name}')[0]),
                          ('new', Image.open(os.path.join(out_dir, f'vehicle-topdown-{name}.png')))):
            c = checker(np.array(im.convert('RGBA')), (232, 228, 218))
            small.append((f'{name} {label}', c.resize((round(c.width * game_scale), round(c.height * game_scale)), Image.LANCZOS)))
    row_h = max(s[1].height for s in small) + lab
    sheet = Image.new('RGB', (max(W, sum(s[1].width + pad for s in small) + pad),
                              len(blocks) * (H + lab + pad) + row_h + lab + pad * 2), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    y = 0
    for name, port, cols in blocks:
        x = pad
        tinted = os.path.exists(os.path.join(pdir, f'vehicle-{name}.png'))
        d.text((x, y + 2), f'{name}: master portrait' + (' (rear glass tinted)' if tinted else ' (no rear side glass: as installed)'), fill=(40, 40, 40), font=f_lab)
        sheet.paste(port, (x, y + lab + (H - port.height) // 2))
        x += port.width + pad
        for label, c in cols:
            d.text((x, y + 2), label, fill=(40, 40, 40), font=f_lab)
            sheet.paste(c, (x, y + lab))
            x += c.width + pad
        y += H + lab + pad
    d.text((pad, y + 2), f'true game scale ({game_scale}x of the file: Henry 87px wide, a 150px lane)', fill=(40, 40, 40), font=f_lab)
    x = pad
    for label, c in small:
        d.text((x, y + lab + 2), label, fill=(90, 90, 90), font=font(11))
        sheet.paste(c, (x, y + lab + 16))
        x += c.width + pad
    sheet = sheet.crop((0, 0, sheet.width, y + lab + 16 + max(s[1].height for s in small) + pad))
    for q in (80, 74, 68, 62, 56, 50, 44):
        sheet.save(path, quality=q, optimize=True)
        if os.path.getsize(path) <= limit:
            break
    return os.path.getsize(path), q


# ---------------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', help='where the files are written (default: a temp dir)')
    ap.add_argument('--only', help='only the stems that contain this')
    ap.add_argument('--src', help='read the sources from this directory instead of git')
    ap.add_argument('--sheet', help='also write the comparison sheet (a JPEG under 400KB) here')
    ap.add_argument('--portraits', help='the master portraits for the sheet (default: the installed ones)')
    ap.add_argument('--install', action='store_true', help='copy each file that passes its gates over the one in assets/')
    args = ap.parse_args()
    out_dir = args.out or tempfile.mkdtemp(prefix='redraw-fronts-')
    os.makedirs(out_dir, exist_ok=True)
    failed = []
    for name, rec in RECIPES.items():
        if args.only and args.only not in name:
            continue
        print(name)
        builder = build_tilly if rec.get('kind') == 'tilly' else build_van
        f_im, F, R, raw = builder(name, rec, args.src)
        path = os.path.join(out_dir, f'vehicle-topdown-{name}.png')
        save_png(to_palette(raw), path)
        results = gates(name, rec, F, R, raw, path)
        for gname, ok, detail in results:
            print(f'    [{"pass" if ok else "FAIL"}] {gname:10s} {detail}')
        if all(ok for _, ok, _ in results):
            if args.install:
                with open(path, 'rb') as fh:
                    data = fh.read()
                with open(os.path.join(ASSETS, f'vehicle-topdown-{name}.png'), 'wb') as fh:
                    fh.write(data)
                print(f'    installed vehicle-topdown-{name}.png ({raw.shape[1]}x{raw.shape[0]})')
        else:
            failed.append(name)
            print('    NOT installed')
    if args.sheet:
        size, q = make_sheet(out_dir, args.sheet, args.portraits)
        print(f'sheet {args.sheet}: {size / 1000:.0f}KB at quality {q}')
    print('written to', out_dir)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
