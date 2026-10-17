#!/usr/bin/env python3
"""recolour-topdown.py — recolour a top-down vehicle's bodywork by arithmetic, not by a model.

    python3 tools/recolour-topdown.py apps/game/public/assets/driving/topdown/vehicle-topdown-henry.png \\
        --target 142,52,54 --out /tmp/henry-maroon.png --check
    python3 tools/recolour-topdown.py <in.png> --target R,G,B --out <out.png> \\
        [--keep-box x0,y0,x1,y1 ...] [--no-plate-cut] [--seed-share F] [--include-box x0,y0,x1,y1 ...] [--res-limits S,G[,NS,NG]] [--debug-dir <dir>]

PILOT, 2026-10-11, one file: vehicle-topdown-henry.png, cream to maroon (142,52,54).
It worked: see RESULT. Nothing is installed by this script; it writes beside the
original and refuses to write over its input.

WHY THIS EXISTS. The portraits were repainted on 2026-10-09 to Henry maroon
(142,52,54), Bea slate blue (74,112,164) and Spark leaf green (116,156,102).
The top-downs are still cream and white, 200-275 RGB units from their master.
That is a recolour, not a redraw, and a from-scratch redraw is the known
failure here (Bea came back a featureless slab). Colour is also the one thing
that can be set arithmetically from art we already have; tools/regrade-to-source.py
does the same for animal saturation, and HANDOVER.md records that asking a
model for "muted" returned 1.14x MORE saturated.

HOW IT WORKS.

1. Paint reference. The modal colour of the opaque pixels (51% of Henry) is the
   body's paint; its median in CIELAB is `ref`. Nothing is hard-coded to Henry.

2. Colour membership. Each pixel is asked "could this be the body paint,
   possibly mixed with the black ink line?". A mix of paint and ink lies on a
   straight line in (L*, a*, b*) from ink to paint, so the question is how far
   the pixel's (a*, b*) is from `t * ref_ab`, t being how far up that line its
   lightness puts it. Shading and antialiased ink edges sit on the line
   (residual under about 12). Gold slivers and lamps, the rose bumper and the
   teal glass are 18-60 off it. A pixel LESS yellow than the line predicts counts
   double, which is what pushes grey-white chrome away from cream paint.

3. Spatial membership. Colour alone would take the tyres too: grey-black lies on
   the ink-to-paint line as well. So the body is a REGION, found as follows.
   Confident-paint pixels are opened once to pick a seed (the one big piece);
   the body is the whole connected piece of unopened paint that holds that seed;
   it is closed with a 10 px disk to fill the pockets between a lamp, the bumper
   and the nose; and every other separate piece of 1000 px or more is treated as
   a feature (the two chrome plates) and cut out. Holes are not filled, because
   the windscreen is a hole. Only pixels within a few px of this footprint are
   eligible, and the colour limits are relaxed right at its edge, where paint
   shades through tan and ochre on its way to the ink line.

4. Tone transfer. r = how far up the ink-to-paint line a pixel is (0 ink, 1
   paint), measured from the ink and not from black. New L* = ink + (target - ink)
   * curve(r). The curve is the identity below r = 0.55, so ink and its
   antialiased edge come across as the same mixture of target and ink, with no
   cream halo; above it, it steepens to slope 1.6 at r = 1, because cream is the
   top of the tonal range, its shading is a few L* units, and carried 1:1 onto
   a dark maroon it would read as flat. (a*, b*) are the target's, scaled with
   lightness, plus half of the old pixel's chroma deviation (the painted wash).

5. Blend. result = w * recoloured + (1 - w) * original. Alpha is copied, and
   ASSERTED byte-identical after the file has been written and read back, the
   way regrade-to-source.py does it.

RESULT, vehicle-topdown-henry.png (561x1309), against the audit method
(crop to opaque pixels, dominant colour of bands at 0-6, 6-20, 35-55, 75-92%):

                    current (cream)        recoloured
    band             dist   luma         dominant       dist  luma
    0-6%             269    241          (140,51,52)    3.1   77.5
    6-20%            271    242          (141,51,53)    1.4   78.4
    35-55%           272    242          (141,51,54)    1.1   78.5
    75-92%           270    241          (139,50,52)    4.1   76.9

    target (142,52,54), luma 79.1. Silhouette IoU 1.000 (install-vehicles gate).
    Alpha byte-identical. L* structure kept: Pearson r 0.989 old vs new inside the body.
    Lamps, oak slivers, glass, bumper, tyres and both chrome plates unchanged
    (plates: 0 of 8,505 pixels changed; 101 of 124,093 pixels changed more than
    8 px from the body: dark ink and tyre-edge pixels at the tail of the 8 px
    spatial ramp, mean change 11 of 255).

WHAT IT CANNOT DO. Read before running it on anything else.

* The "separate piece of 1000 px or more is a chrome plate" rule is the one that
  does NOT generalise. On Henry the plates are the only large separate pieces.
  On the REAR views the body is cut into door panels by ink lines, so each door
  is a large separate piece and gets cut out as if it were chrome: probed
  (segmentation only, nothing recoloured) on bea-rear, henry-rear and spark-rear,
  the rear doors fall outside the footprint. `--no-plate-cut` turns the rule
  off; `--keep-box x0,y0,x1,y1` (repeatable, pixel coordinates) then protects the
  genuine plates by hand. Checked on Henry: with the rule off, 1,263 plate pixels
  recolour; with two tight boxes round the plates, the result matches the
  default to within 224 pixels. Expect to look at every output. NOTE (fleet run,
  below): turning the rule off does not BRING a separate piece into the body, it only
  stops cutting it out, so a door the ink lines have cut off the main region stays
  cream. --seed-share and --include-box are what bring such pieces in.
* White has no chroma. Spark's paint has chroma 0.5, so there is nothing for the
  colour test to separate chrome highlights from, and the whole job rides on the
  spatial step. His cream bolt and lettering are the same cluster as the
  flank paint. Both are small and thin; neither has been tried.
* It recolours ONE colour. A two-tone livery (Bea's gold trim, brown skirt)
  works only because those are other colours that the test already refuses;
  a same-colour feature on the body (a paw-heart in the body's own cream) is
  recoloured with it, so it would need a --keep-box.
* It cannot add detail that was never drawn, and it carries over what was:
  the faint lozenge streaks in the cream (a generator artefact) come through
  as faint streaks in the maroon. gamma 1.6 shows them just enough; at 2.4
  they read as stains.
* The rose bumper (167,56,74) is left as drawn; it is a different pink-red from
  the maroon body. Whether to harmonise it is a design call.
* OUTPUT IS RGBA, AND IT IS NOT FOR tools/install-vehicles.py. That tool skews
  every file not in skew-topdown's ALREADY_CORRECT set by taper 0.88, and the
  installed henry, bea and spark already have that skew, so installing a
  recolour through it would warp it a second time. Install a recolour by
  quantising and copying: Image.quantize(256, FASTOCTREE) then solid_palette()
  from install-vehicles. Measured on Henry, that brings the file from 308 KB to
  106 KB (the original is 144 KB), moves 1,934 soft-edge alpha values by up to 45
  (the same effect the original has already been through, so "byte-identical
  alpha" holds for this script's output and not for the installed file), and
  leaves the IoU at 1.000 and the band colours within 1 unit.

FLEET RUN, 2026-10-11: the other five, and what each one needed.

  Three flags were added for the files where the body is not one connected piece
  of paint (all default to the pilot's behaviour; henry front is byte-identical).

  --seed-share F      a paint piece with this share of the visible pixels is body
                      (default 0.05). Bea's cab has ink lines round the bonnet, the
                      scuttle and both wings: five pieces, all body, none the biggest.
  --include-box BOX   any paint piece the box touches is body, whatever its size. A
                      6 px box on the thickest point of a piece is enough. For when a
                      size threshold cannot tell the body from a marking: Spark's
                      flank slivers (marking, left alone) are bigger than his nose
                      wings (body, wanted).
  --res-limits S,G[,NS,NG]
                      the four colour limits. Henry's rear paint shades through ochre
                      under the lamps and round the paw (a*b* 17-48 off the line,
                      limit 12-40); at the defaults those patches stay cream. 30,45,40,60
                      takes them without touching the lamps, paw or glass; 60,80,70,90
                      starts to take a lamp.

  Recipes (target, then flags; pixel boxes are for the shipped files):
    henry       142,52,54                (none)
    henry-rear  142,52,54  --include-box 487,1081,493,1087 --res-limits 30,45,40,60
    bea         74,112,164 --no-plate-cut --seed-share 0.0005 and --keep-box on both
                mirrors (502,905,578,982 / 0,905,78,982) and the grille surround
                (150,1305,415,1368)
    bea-rear    74,112,164 --no-plate-cut --seed-share 0.002 and --keep-box on both
                mirrors (0,139,56,205 + 56,153,80,205 / 522,139,578,205 + 500,153,522,205)
    spark       116,156,102 --include-box on the four pieces 27,1631,33,1637
                604,1670,610,1676 (nose wings) 523,108,529,114 112,102,118,108 (roof corners)
    spark-rear  116,156,102 --include-box 400,1620,406,1626 (the tailgate panel)

  On henry-rear and spark-rear the doors and tailgate are seeded by --include-box and
  the plate rule is left ON: it then does what it was written for and protects the
  bumper rim and number plate without a keep-box.

  Left as drawn, on purpose: Bea's cream mirrors and grille surround, Spark's white
  mirrors, bumper and number plate, Henry's cream rear bumper and plate, every lamp,
  the glass, Spark's flank slivers (white) and green flank stripe, Henry's paw-heart.
  Spark's flank green stripe is a more saturated green than the leaf target.

  Known imperfection: Bea's gold windscreen trim is one to three px wide and its
  muted gold sits 17-21 a*b* units off the line, so a few of its pixels go part-way
  blue. It is a dotted line at 1:1 and nothing at the size the game draws it.

  Install by quantising and copying, never through install-vehicles.py (above).
"""
import argparse
import importlib.util
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

OPAQUE = 240            # alpha at or above this is "body" for statistics
INK_L = 2.0             # L* of the black ink the paint mixes with at an edge
RES_SOLID = 12.0        # residual (a*, b* units) under which a pixel is paint ...
RES_GONE = 22.0         # ... and over which it is not, away from the body
NEAR_SOLID = 28.0       # the same two limits, relaxed right at the body's edge, where paint
NEAR_GONE = 40.0        # shades into tan and ochre on its way to the ink line
LESS_YELLOW = 2.0       # a pixel paler/greyer than the line predicts counts this many times over
MAIN_SHARE = 0.05       # a seed piece must hold this share of the visible pixels to be "the body"
SEPARATE = 1000         # px; a separate piece this big is a feature (a chrome plate), not body
CLOSE_R = 10            # px; radius that fills the pockets between lamp, bumper and body
EDGE_NEAR = 2.0         # px outside the body at which the relaxed limits end ...
EDGE_FULL = 3.0         # ... eligible at full strength out to here ...
EDGE_END = 8.0          # ... and fading to nothing by here
GAMMA = 1.6             # slope of the tone curve at the paint (1 = no stretch; must be < 2)
KNEE = 0.55             # below this fraction of the way up from ink to paint, the curve is the identity
CHROMA_KEEP = 0.7       # exponent: (a*, b*) scale with the lightness above ink ** this
WASH = 0.5              # share of the old pixel's chroma deviation carried over


# ---------------------------------------------------------------- colour maths

_M = np.array([[0.4124564, 0.3575761, 0.1804375],
               [0.2126729, 0.7151522, 0.0721750],
               [0.0193339, 0.1191920, 0.9503041]])
_WHITE = np.array([0.95047, 1.0, 1.08883])


def _lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _delin(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def rgb_to_lab(rgb):
    """(..., 3) sRGB in 0..1 -> CIELAB (D65)."""
    xyz = _lin(rgb) @ _M.T / _WHITE
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16,
                     500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])], -1)


def lab_to_rgb(lab):
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > 216 / 24389, f ** 3, (116 * f - 16) / (24389 / 27)) * _WHITE
    return _delin(xyz @ np.linalg.inv(_M).T)


def luma(rgb):
    """Rec.601 luma on 0..255 sRGB: the 'lightness' the van-repaint note quotes (79 for Henry)."""
    rgb = np.asarray(rgb, dtype=float)
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def contrast(r, gamma, knee=KNEE):
    """Tone curve on r (0 ink, 1 paint). Identity below the knee, so the ink line and its
    antialiased edge are carried across unchanged; above it, slope `gamma` at r = 1, so
    the paint's few-L* shading is stretched. Continuous at both ends; gamma must be < 2."""
    h = (gamma - 1.0) / (1.0 - knee)
    return np.where(r > knee, r - (r - knee) * (1.0 - r) * h, r)


# ---------------------------------------------------------------- segmentation

def _modal_bin(px):
    """Mask of the pixels in the most populated 16-level RGB bin, plus its neighbours."""
    q = (px // 16).astype(int)
    key = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]
    u, c = np.unique(key, return_counts=True)
    k = u[np.argmax(c)]
    kr, kg, kb = k // 256, (k // 16) % 16, k % 16
    return (np.abs(q[:, 0] - kr) <= 1) & (np.abs(q[:, 1] - kg) <= 1) & (np.abs(q[:, 2] - kb) <= 1)


def modal_colour_lab(rgb8, mask):
    """Median LAB of the modal colour among masked pixels. Paint straddles bin edges, hence the neighbours."""
    px = rgb8[mask]
    return np.median(rgb_to_lab(px[_modal_bin(px)] / 255.0), axis=0)


def residual(lab, ref):
    """Distance of each pixel's (a*, b*) from the ink-to-paint line. Large = not paint."""
    t = np.clip((lab[..., 0] - INK_L) / (ref[0] - INK_L), 0.0, 1.25)
    da = lab[..., 1] - t * ref[1]
    db = lab[..., 2] - t * ref[2]
    db = np.where(db < 0, db * LESS_YELLOW, db)
    return np.hypot(da, db), da, db


def _disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def body_mask(res, lab, alpha, plate_cut=True, seed_share=MAIN_SHARE, include_boxes=()):
    """(footprint, plates, n_seed_pieces, biggest_sizes). See step 3 of the module docstring."""
    paint = (res <= RES_SOLID) & (lab[..., 0] >= 55) & (alpha >= OPAQUE)
    core = ndimage.binary_opening(paint, structure=np.ones((3, 3)), iterations=1)
    lbl, n = ndimage.label(core)
    if n == 0:
        raise SystemExit('no paint-coloured region found; wrong sprite or wrong reference')
    sizes = ndimage.sum(core, lbl, range(1, n + 1))
    seed = np.isin(lbl, [i + 1 for i, s in enumerate(sizes) if s >= seed_share * (alpha > 16).sum()])
    if not seed.any():
        seed = lbl == (int(np.argmax(sizes)) + 1)
    for x0, y0, x1, y1 in include_boxes:       # --include-box: any paint piece a box touches is body
        box = np.zeros_like(core)
        box[y0:y1, x0:x1] = True
        seed |= core & box
    # The opening only picked the seed. The body is the whole connected piece of
    # UNopened paint that contains it, which brings back the rim and the wedges
    # of paint the opening trimmed off.
    lab0, n0 = ndimage.label(paint)
    sz0 = ndimage.sum(paint, lab0, range(1, n0 + 1))
    touching = np.unique(lab0[seed])
    touching = touching[touching > 0]
    main = np.isin(lab0, touching)
    foot = ndimage.binary_closing(np.pad(main, CLOSE_R), structure=_disk(CLOSE_R))[CLOSE_R:-CLOSE_R, CLOSE_R:-CLOSE_R]
    plates = np.zeros_like(foot)
    if plate_cut:
        for i, s_ in enumerate(sz0):
            if s_ >= SEPARATE and (i + 1) not in touching:
                plates |= lab0 == (i + 1)
        plates = ndimage.binary_dilation(plates, structure=np.ones((3, 3)), iterations=2)
        foot &= ~plates
    return foot, plates, n, sorted(sizes, reverse=True)[:6]


# ---------------------------------------------------------------- recolour

def recolour(rgba, target, gamma=GAMMA, wash=WASH, plate_cut=True, keep_boxes=(), seed_share=MAIN_SHARE, include_boxes=()):
    """rgba uint8 (H, W, 4) -> (new rgba uint8, debug dict). Alpha is copied, never computed.

    keep_boxes: (x0, y0, x1, y1) pixel rectangles inside which nothing is recoloured."""
    rgb8, alpha = rgba[..., :3], rgba[..., 3]
    rgb = rgb8 / 255.0
    lab = rgb_to_lab(rgb)
    ref = modal_colour_lab(rgb8, alpha >= OPAQUE)
    res, da, db = residual(lab, ref)

    body, plates, n_pieces, biggest = body_mask(res, lab, alpha, plate_cut, seed_share, include_boxes)
    dist = ndimage.distance_transform_edt(~body)
    # Tolerance for "is this still paint" is wider right at the body's edge.
    near = np.clip(1.0 - dist / EDGE_NEAR, 0.0, 1.0)
    solid = RES_SOLID + (NEAR_SOLID - RES_SOLID) * near
    gone = RES_GONE + (NEAR_GONE - RES_GONE) * near
    w_col = np.clip((gone - res) / (gone - solid), 0.0, 1.0)
    w_sp = np.clip((EDGE_END - dist) / (EDGE_END - EDGE_FULL), 0.0, 1.0)
    w = w_col * w_sp * ~plates
    for x0, y0, x1, y1 in keep_boxes:
        w[y0:y1, x0:x1] = 0.0

    tgt = rgb_to_lab(np.asarray(target, dtype=float) / 255.0)
    # r is how far up the ink-to-paint line the pixel sits: 0 is ink, 1 is paint.
    # Measuring from the ink, not from black, is what leaves the ink line exactly
    # where it was (a ratio against L* = 0 would push it darker than it was drawn).
    r = np.clip((lab[..., 0] - INK_L) / (ref[0] - INK_L), 0.0, 1.3)
    new_L = INK_L + (tgt[0] - INK_L) * contrast(r, gamma)
    scale = (np.maximum(new_L - INK_L, 0.0) / (tgt[0] - INK_L)) ** CHROMA_KEEP
    new_lab = np.stack([new_L,
                        tgt[1] * scale + wash * da * scale,
                        tgt[2] * scale + wash * db * scale], -1)
    new_rgb = lab_to_rgb(new_lab)

    out = rgb * (1 - w[..., None]) + new_rgb * w[..., None]
    out8 = np.clip(np.rint(out * 255), 0, 255).astype(np.uint8)
    # Transparent pixels carry no colour that matters; leave them exactly as they were.
    out8[alpha == 0] = rgb8[alpha == 0]
    result = np.dstack([out8, alpha])
    return result, dict(ref_lab=ref, ref_rgb=tuple(int(v) for v in np.rint(lab_to_rgb(ref) * 255)),
                        w=w, body=body, plates=plates, pieces=n_pieces,
                        biggest=[int(v) for v in biggest], res=res)


# ---------------------------------------------------------------- measurement

BANDS = ((0.00, 0.06), (0.06, 0.20), (0.35, 0.55), (0.75, 0.92))


def band_colours(rgba, bands=BANDS):
    """The audit method: crop to opaque pixels, dominant colour of horizontal bands of the painted height.

    'Dominant' is the mean of the most populated 16-level RGB bin (with its
    neighbours) among pixels at alpha >= OPAQUE; median and mean are returned too
    so a bimodal band shows up as a disagreement between them."""
    alpha = rgba[..., 3]
    ys = np.nonzero((alpha > 16).any(axis=1))[0]
    y0, y1 = ys.min(), ys.max() + 1
    h = y1 - y0
    rows = []
    for lo, hi in bands:
        a, b = y0 + int(lo * h), y0 + int(hi * h)
        px = rgba[a:b][..., :3][alpha[a:b] >= OPAQUE].astype(float)
        rows.append(dict(band=(lo, hi), dominant=px[_modal_bin(px)].mean(0),
                         median=np.median(px, 0), mean=px.mean(0)))
    return rows


def load_rgba(path):
    return np.array(Image.open(path).convert('RGBA'))


def load_gate():
    """Reuse install-vehicles.py's silhouette IoU gate rather than writing another."""
    spec = importlib.util.spec_from_file_location('install_vehicles', os.path.join(ROOT, 'tools', 'install-vehicles.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _ints(v):
    return tuple(int(round(x)) for x in v)


def report(src, out, rgba, back, dbg, target):
    tgt = np.array(target, float)
    print(f'\ntarget {target}, luma {luma(tgt):.1f}')
    for tag, img in (('current', rgba), ('recoloured', back)):
        print(f'\n{tag}')
        for b in band_colours(img):
            d = b['dominant']
            print(f'  {b["band"][0] * 100:3.0f}-{b["band"][1] * 100:<3.0f}%  dominant {_ints(d)}  '
                  f'dist {np.linalg.norm(d - tgt):6.1f}  luma {luma(d):5.1f}  median {_ints(b["median"])}')
    iv = load_gate()
    ok, why = iv.gate(out, src, False, iv.MIN_IOU)
    print(f'\nsilhouette gate (install-vehicles.gate): {"PASS" if ok else "FAIL"}  {why}')
    vis = rgba[..., 3] > 0
    changed = (back[..., :3] != rgba[..., :3]).any(axis=2) & vis
    print(f'pixels changed: {changed.sum()} of {vis.sum()} visible ({changed.sum() / vis.sum():.1%})')
    far = ~ndimage.binary_dilation(dbg['body'], iterations=8) & vis
    print(f'pixels changed more than 8 px from the body footprint: {int((changed & far).sum())} of {int(far.sum())}')
    if dbg['plates'].any():
        pl = dbg['plates'] & vis
        print(f'cut-out plates: {int((changed & pl).sum())} of {int(pl.sum())} pixels changed')
    body = dbg['body'] & (rgba[..., 3] >= OPAQUE)
    lo = rgb_to_lab(rgba[..., :3] / 255.0)[..., 0]
    ln = rgb_to_lab(back[..., :3] / 255.0)[..., 0]
    print(f'L* structure inside the body, old vs new: Pearson r {np.corrcoef(lo[body], ln[body])[0, 1]:.4f}')


def main():
    global RES_SOLID, RES_GONE, NEAR_SOLID, NEAR_GONE
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('src')
    ap.add_argument('--target', required=True, help='R,G,B of the body colour wanted')
    ap.add_argument('--out', required=True)
    ap.add_argument('--gamma', type=float, default=GAMMA)
    ap.add_argument('--wash', type=float, default=WASH)
    ap.add_argument('--no-plate-cut', action='store_true',
                    help='do not cut out large separate pieces as chrome (use on multi-panel rear views)')
    ap.add_argument('--seed-share', type=float, default=MAIN_SHARE, metavar='F',
                    help='a paint piece holding this share of the visible pixels counts as body (default %g); '
                         'lower it when ink lines split the body into several big pieces (cab front, rear doors)' % MAIN_SHARE)
    ap.add_argument('--res-limits', metavar='S,G[,NS,NG]',
                    help='override the colour limits (a*b* units off the ink-to-paint line): paint-solid, paint-gone, and '
                         'the same two right at the body edge. Defaults %g,%g,%g,%g. Raise them when the art shades its '
                         'paint through a hue the line does not predict (Henry rear: ochre shadows under the lamps).'
                         % (RES_SOLID, RES_GONE, NEAR_SOLID, NEAR_GONE))
    ap.add_argument('--include-box', action='append', default=[], metavar='x0,y0,x1,y1',
                    help='any paint piece this pixel rectangle touches is body, whatever its size; repeatable')
    ap.add_argument('--keep-box', action='append', default=[], metavar='x0,y0,x1,y1',
                    help='pixel rectangle inside which nothing is recoloured; repeatable')
    ap.add_argument('--debug-dir', help='write the membership map and body footprint here')
    ap.add_argument('--check', action='store_true', help='print the audit bands and the gates')
    args = ap.parse_args()
    if not 1.0 <= args.gamma < 2.0:
        sys.exit('--gamma must be in [1, 2)')

    if args.res_limits:
        lim = [float(v) for v in args.res_limits.split(',')]
        if len(lim) == 2:
            lim += [lim[0] + (NEAR_SOLID - RES_SOLID), lim[1] + (NEAR_GONE - RES_GONE)]
        if len(lim) != 4 or not (0 < lim[0] < lim[1] and lim[0] <= lim[2] < lim[3]):
            sys.exit('--res-limits wants S,G or S,G,NS,NG with S < G and NS < NG')
        RES_SOLID, RES_GONE, NEAR_SOLID, NEAR_GONE = lim
    target = tuple(int(v) for v in args.target.split(','))
    boxes = [tuple(int(v) for v in b.split(',')) for b in args.keep_box]
    inc = [tuple(int(v) for v in b.split(',')) for b in args.include_box]
    src = os.path.abspath(args.src)
    out = os.path.abspath(args.out)
    if src == out:
        sys.exit('refusing to write over the source')
    rgba = load_rgba(src)
    new, dbg = recolour(rgba, target, args.gamma, args.wash, not args.no_plate_cut, boxes, args.seed_share, inc)

    Image.fromarray(new, 'RGBA').save(out)
    back = load_rgba(out)
    if not np.array_equal(back[..., 3], rgba[..., 3]):
        sys.exit('FAIL: alpha channel differs from the source')
    print(f'alpha byte-identical ({rgba[..., 3].size} px); wrote {out}')
    print(f'paint reference rgb {dbg["ref_rgb"]}; seed pieces {dbg["pieces"]}, biggest {dbg["biggest"]}')

    if args.debug_dir:
        os.makedirs(args.debug_dir, exist_ok=True)
        Image.fromarray(np.rint(dbg['w'] * 255).astype(np.uint8)).save(os.path.join(args.debug_dir, 'membership.png'))
        Image.fromarray((dbg['body'] * 255).astype(np.uint8)).save(os.path.join(args.debug_dir, 'footprint.png'))

    if args.check:
        report(src, out, rgba, back, dbg, target)


if __name__ == '__main__':
    main()
