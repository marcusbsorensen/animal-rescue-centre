#!/usr/bin/env python3
"""tint-glass.py — the animal space is tinted, the cab is clear: bring the master portraits to the top-downs.

    python3 tools/tint-glass.py --out /tmp/portraits             # write the changed portraits, gated
    python3 tools/tint-glass.py --out /tmp/portraits --install   # and install each one that passes

Nothing is installed unless `--install` is given. The portraits are read from git (`SOURCE_REV`), so a
second run after installing tints the originals again rather than the tint.

WHY. `docs/fleet-canon.md` section 4, decided 2026-10-11: Spark's rear window is black from above and
clear in his portrait, and the resolution is that animals travel better behind tinted glass (privacy from
faces at the window, less heat, a calmer animal), so the top-downs are right and the PORTRAITS change.
The cab windscreen and the cab side windows stay clear: the child needs to see who is driving.

THE ONE TREATMENT, measured off the glass the canon calls correct (`vehicle-topdown-spark-rear.png`, the
rear window, 77,014 px):

    smoked charcoal, neutral, fully opaque. Base RGB (53, 55, 54) (luma 54), the diagonal sheen streaks
    rising to RGB (102, 102, 103) at their strongest, mean (69, 71, 71).

It is not a colour that was chosen to match: it IS those pixels. The portrait's window is filled with a
piece of the top-down's own glass texture, cut to the pane's size, so the same streaks run the same way
at the same grain. Nothing about the glass is a number to keep in step. (The other glass in the fleet:
clear glass is the pale mottled blue-grey of the windscreens, 138,160,180 to 196,210,220, which
`redraw-fronts.py` gives Spark's windscreen.)

WHICH PORTRAITS HAVE REAR SIDE GLASS. Only Spark. Bea and Henry are panel vans: their side view has a cab
door window and a windscreen and nothing aft of the cab (Henry's rear door windows are on the REAR of
the van, which no side view can show). Big Tilly's cab has a windscreen and a door window and behind it the
bed is open. So Bea, Henry and Big Tilly have no rear side glass to tint and are left exactly as they are, and
the tool says so. Trikey's basket is open to the air.

HOW. The pane is found as the piece of non-ink, non-body pixels inside the ink outline of the window (flood
fill from a seed in each half, either side of the door seam, which is ink and stays). It is dilated 2px into
the soft edge so no cream halo is left round the dark glass, and then each pixel takes the nearest entry of
the portrait's OWN 256-colour palette, so nothing outside the window changes by a single index.

GATES: everything outside the window is byte-identical (so the cab windscreen and cab window stay clear);
the window is dark (95th percentile luma under 125, nothing brighter than the top-down glass's own brightest
pixel, 140); its mean colour is within 15 RGB units of the top-down's glass (the palette's greys run warm).
"""
import argparse
import io
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, binary_fill_holes, gaussian_filter, label

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
PORTRAITS = os.path.join(ROOT, 'apps/game/public/assets/driving/vehicles')
PORTRAITS_REL = 'apps/game/public/assets/driving/vehicles'
TOPDOWN_REL = 'apps/game/public/assets/driving/topdown'
SOURCE_REV = 'f4cc906'

# Where the glass is in the top-down the canon calls correct: its rows and columns in spark-rear (the pane's
# interior, clear of its ink outline).
REFERENCE = dict(stem='vehicle-topdown-spark-rear', rows=(668, 832), cols=(120, 520))
TINT_MEAN = np.array([69.0, 71.0, 71.0])

# Per portrait: the windows to tint (a box that contains the pane and its ink outline, and a seed in each
# half of the pane), or None with the reason there is nothing to tint.
RECIPES = {
    'spark': dict(box=(462, 128, 812, 246), seeds=[(560, 190), (720, 190)]),
    'bea': None,
    'henry': None,
    'big-tilly': None,
}
NONE_BECAUSE = {
    'bea': 'a panel van: a cab door window and the windscreen, nothing aft of the cab',
    'henry': 'a panel van: a cab door window and the windscreen; his rear door windows are on the rear, which a side view cannot show',
    'big-tilly': 'a cab with a windscreen and a door window, and an open bed behind it',
}


def load_git(rel, stem):
    blob = subprocess.run(['git', 'show', f'{SOURCE_REV}:{rel}/{stem}.png'], cwd=ROOT, check=True,
                          capture_output=True).stdout
    im = Image.open(io.BytesIO(blob))
    im.load()
    return im


def glass_texture(h, w):
    """A h x w piece of the reference glass, cut from its middle."""
    ref = np.array(load_git(TOPDOWN_REL, REFERENCE['stem']).convert('RGBA'))
    r0, r1 = REFERENCE['rows']
    c0, c1 = REFERENCE['cols']
    cy, cx = (r0 + r1) // 2, (c0 + c1) // 2
    y0, x0 = cy - h // 2, cx - w // 2
    assert y0 >= r0 - 4 and x0 >= c0 - 4 and y0 + h <= r1 + 4 and x0 + w <= c1 + 4, 'the pane is bigger than the glass it is cut from'
    tex = ref[y0 - 3:y0 + h + 3, x0 - 3:x0 + w + 3, :3].astype(float)
    # a light blur: the generator's grain turns to isolated pale pixels once every one is snapped to a palette grey
    tex = np.stack([gaussian_filter(tex[..., c], 1.0) for c in range(3)], -1)
    return tex[3:-3, 3:-3]


def pane_mask(rgba, box, seeds):
    """The pane: non-ink, non-body pixels inside the ink outline, grown 2px into the soft edge.

    The old frosting is full of TRANSPARENT pixels (the generator matted its pale flecks out), so the
    background showed through the window as light specks: they count as pane, and are filled."""
    rgb, alpha = rgba[..., :3], rgba[..., 3]
    r, g, b = [rgb[..., i].astype(int) for i in range(3)]
    luma = rgb.astype(float) @ np.array([0.299, 0.587, 0.114])
    hole = alpha < 128
    body = (g > r + 12) & (g > b + 22) & ~hole
    x0, y0, x1, y1 = box
    inside = np.zeros(luma.shape, bool)
    inside[y0:y1, x0:x1] = True
    free = inside & ~body & ((luma > 120) | hole)
    lab, _ = label(free)
    keep = np.zeros_like(free)
    for sx, sy in seeds:
        assert lab[sy, sx] > 0, f'seed {sx},{sy} is not in the pane'
        keep |= lab == lab[sy, sx]
    keep = binary_fill_holes(keep)          # the frosting left islands the fill could not reach
    grown = binary_dilation(keep, iterations=2) & inside & ~body & ((luma > 55) | hole)
    return grown


def tint_portrait(name, rec):
    im = load_git(PORTRAITS_REL, f'vehicle-{name}')
    idx = np.array(im)
    rgba = np.array(im.convert('RGBA'))
    mask = pane_mask(rgba, rec['box'], rec['seeds'])
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    tex = glass_texture(y1 - y0, x1 - x0)
    new = np.zeros(rgba.shape[:2] + (3,))
    new[y0:y1, x0:x1] = tex
    pal = np.array(im.getpalette()[:768], float).reshape(-1, 3)
    t = im.info.get('transparency')
    ok = np.ones(len(pal), bool)
    if isinstance(t, (bytes, bytearray)):
        ok[:len(t)] = np.frombuffer(t, np.uint8) == 255
    cand = np.nonzero(ok)[0]
    px = new[mask]
    d = ((px[:, None, :] - pal[cand][None, :, :]) ** 2).sum(-1)
    out_idx = idx.copy()
    out_idx[mask] = cand[d.argmin(1)].astype(np.uint8)
    out = Image.fromarray(out_idx, 'P')
    out.putpalette(im.getpalette())
    out.info['transparency'] = im.info.get('transparency')
    return im, out, mask


def gate(name, before, after, mask):
    a, b = np.array(before), np.array(after)
    res = []
    same = bool((a[~mask] == b[~mask]).all())
    res.append(('outside', same, f'{int((~mask).sum())} pixels outside the window are the same palette index as before '
                                 f'(the cab windscreen and the cab window are among them)'))
    rgb = np.array(after.convert('RGBA'))[..., :3].astype(float)
    luma = rgb @ np.array([0.299, 0.587, 0.114])
    lm = luma[mask]
    inner = mask & (luma > 28)
    p95, mx = float(np.percentile(lm, 95)), float(lm.max())
    res.append(('dark', p95 < 125 and mx <= 140,
                f'window luma: median {np.median(lm):.0f}, 95th percentile {p95:.0f}, brightest {mx:.0f} '
                f'(the top-down glass: median 71, 95th percentile 106, brightest 140)'))
    mean = rgb[inner].mean(0)
    dist = float(np.linalg.norm(mean - TINT_MEAN))
    res.append(('same-glass', dist <= 15, f'mean colour {tuple(int(round(v)) for v in mean)}, {dist:.1f} RGB units from the '
                                          f'top-down glass {tuple(int(v) for v in TINT_MEAN)}'))
    pal_same = after.getpalette() == before.getpalette() and after.info.get('transparency') == before.info.get('transparency')
    res.append(('palette', pal_same and after.mode == 'P', f'mode {after.mode}, palette and transparency identical to the original'))
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', help='where the changed portraits are written (default: a temp dir)')
    ap.add_argument('--install', action='store_true', help='copy each portrait that passes its gates over the one in assets/')
    args = ap.parse_args()
    out_dir = args.out or tempfile.mkdtemp(prefix='tint-glass-')
    os.makedirs(out_dir, exist_ok=True)
    failed = []
    for name, rec in RECIPES.items():
        print(name)
        if rec is None:
            print(f'    no rear side glass: {NONE_BECAUSE[name]}. Left as it is.')
            continue
        before, after, mask = tint_portrait(name, rec)
        path = os.path.join(out_dir, f'vehicle-{name}.png')
        tr = after.info.get('transparency')
        after.save(path, transparency=tr, optimize=True) if tr is not None else after.save(path, optimize=True)
        after = Image.open(path)
        after.load()
        results = gate(name, before, after, mask)
        for g, ok, detail in results:
            print(f'    [{"pass" if ok else "FAIL"}] {g:10s} {detail}')
        if all(ok for _, ok, _ in results):
            if args.install:
                with open(path, 'rb') as fh:
                    data = fh.read()
                with open(os.path.join(PORTRAITS, f'vehicle-{name}.png'), 'wb') as fh:
                    fh.write(data)
                print(f'    installed vehicle-{name}.png')
        else:
            failed.append(name)
            print('    NOT installed')
    print('written to', out_dir)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
