#!/usr/bin/env python3
"""
Write each sign animal's outline colour (`--animal-ink`) into the ink table at the
end of apps/game/public/admin/_signpost-physics.css.

WHAT IT DOES
  The sign screens (welcome, login, signup, menu, friends, news, conflict, vet, ...)
  draw a one-pixel outline round every animal in the animal's OWN darkest fur or
  feather colour, so it matches the painted line work round it and is never one
  ink for the lot. This script finds that colour for every animal the screens can
  show and rewrites the table between the markers
      /* ink-table:begin */  ...  /* ink-table:end */
  in the CSS. The table has one rule per sprite: `--animal-ink`, and for the story
  plaques' sprites (conflict, vet, arrival) `--edge-y` and `--top-y`, the bottom and top of
  the painted body as fractions of the image height, which stand the animal on the floor
  and put the vet's floating 🤒 just above its head.

  Which sprites: every <img> in the sign screens' HTML whose class is one of the
  animal classes (intro-cat, play-parrot, ground-bunny, bee-flyer, conflict-anim,
  arrival-anim), plus every assets/animals/*-sick.png and *-arriving.png, because
  vet.html and arrival.html swap in the sprite of whichever animal is ill or has
  just arrived, of any species.

HOW THE COLOUR IS CHOSEN (Marcus, 2026-10-14, 115A/116A)
  1. Only the animal's opaque pixels (alpha >= 230), so antialiased edges that
     blend with the transparent background do not count.
  2. k-means (k=12, RGB) groups them into palette colours, darkest first.
  3. Eyes, pupils, noses, claws, beak tips and any other small dark mark must NOT
     set the colour: "we just want the darkest part of the fur or feathers". So
     each palette colour is first morphologically OPENED (a 3px square at 256px
     wide, which removes lines thinner than that: the painted rim, whiskers, eye
     lines), and only connected regions that are at least MIN_REGION (1.5%) of the
     animal's opaque area are kept (an eye or a nose is 1.1% at most, a patch of
     fur or a wing 2% and up). The ink starts as the
     mean colour of the darkest palette colour that still has such a region: the
     darkest substantial fur or feather. If nothing survives, the thresholds are
     relaxed step by step (so tiny or striped art, like the bee, still gets one).
  4. NEVER PURE BLACK (Marcus, 116A). An outline lighter than L_FLOOR is lifted to
     it: HSL lightness 20% (by eye, 18-22% all read as a deep tone; 20 keeps a black
     cat's charcoal and a rabbit's black patch a dark brown without turning them
     into a mid-tone). Hue and saturation stay the colour's own, and if it is
     nearly grey (saturation below 12%) they come from the animal's main body
     colour instead (the most common palette colour that is neither near-white nor
     near-black). Saturation is capped at 45%, because HSL saturation of a very
     dark colour is exaggerated and would otherwise lift into a vivid tone.

USAGE
  python3 scripts/sign-animal-ink.py            # print the table, change nothing
  python3 scripts/sign-animal-ink.py --write    # rewrite the table in the CSS
  python3 scripts/sign-animal-ink.py --debug DIR  # also save, per animal, the sprite
                                                  # with the pixels the ink was taken
                                                  # from painted magenta (review aid)
  Needs Pillow and numpy. Re-run it when art changes or an animal is added; the
  fallback in the CSS for a sprite that is not in the table is a warm dark brown.
"""
import colorsys
import glob
import os
import re
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PUBLIC = os.path.join(ROOT, 'apps', 'game', 'public')
ADMIN = os.path.join(PUBLIC, 'admin')
CSS = os.path.join(ADMIN, '_signpost-physics.css')
BEGIN, END = '/* ink-table:begin */', '/* ink-table:end */'
ANIMAL_CLASSES = ('intro-cat', 'play-parrot', 'ground-bunny', 'bee-flyer', 'conflict-anim', 'arrival-anim')
STORY_CLASSES = ('conflict-anim', 'arrival-anim')   # sprites that stand on a floor and need --edge-y

K = 12                # palette colours
ALPHA_MIN = 230       # opaque
WORK = 256            # analyse at most this many px on the long side
OPEN_FRAC = 0.004     # opening radius as a fraction of the long side: 1px at 256 (lines <= 2px go)
MIN_REGION = 0.015    # a region this share of the opaque area is fur or feathers (an eye is up to ~1.1%)
MIN_TOTAL = 0.015     # the level counts once its fur regions add up to this share
L_FLOOR = 0.20        # HSL lightness floor: no outline is ever near-black
S_CAP = 0.45
S_NEUTRAL = 0.12


def kmeans(px, k, iters=30, seed=7):
    rng = np.random.default_rng(seed)
    cent = [px[rng.integers(len(px))]]
    for _ in range(k - 1):
        d = np.min(((px[:, None, :] - np.array(cent)[None]) ** 2).sum(-1), axis=1)
        cent.append(px[rng.choice(len(px), p=d / d.sum())] if d.sum() > 0 else px[rng.integers(len(px))])
    cent = np.array(cent, dtype=float)
    for _ in range(iters):
        lab = ((px[:, None, :] - cent[None]) ** 2).sum(-1).argmin(1)
        new = np.array([px[lab == i].mean(0) if (lab == i).any() else cent[i] for i in range(k)])
        if np.allclose(new, cent, atol=0.2):
            break
        cent = new
    return cent


def lum(c):
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def components(mask):
    """8-connected regions of a boolean array: list of arrays of (y, x) indices."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if seen[y0, x0]:
            continue
        stack = [(y0, x0)]
        seen[y0, x0] = True
        pts = []
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        stack.append((yy, xx))
        out.append(np.array(pts))
    return out


def opened(mask, r):
    if r <= 0:
        return mask
    img = Image.fromarray((mask * 255).astype('uint8'))
    size = 2 * r + 1
    img = img.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size))
    return np.asarray(img) > 0


def hls(rgb):
    h, l, s = colorsys.rgb_to_hls(*(float(v) / 255 for v in rgb))
    return h, l, s


def lift(rgb, body):
    """Raise a too-dark colour to L_FLOOR, keeping its hue (or the body colour's if it is grey)."""
    h, l, s = hls(rgb)
    if l >= L_FLOOR:
        return rgb, False
    if s < S_NEUTRAL and body is not None:
        h, _, bs = hls(body)
        s = min(bs, S_CAP)
    s = min(max(s, 0.0), S_CAP)
    r, g, b = colorsys.hls_to_rgb(h, L_FLOOR, s)
    return (r * 255, g * 255, b * 255), True


def analyse(path, debug_dir=None):
    im = Image.open(path).convert('RGBA')
    if max(im.size) > WORK:
        f = WORK / max(im.size)
        im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.BOX)
    a = np.asarray(im)
    opaque = a[..., 3] >= ALPHA_MIN
    area = int(opaque.sum())
    if area < 30:
        opaque = a[..., 3] >= 100
        area = int(opaque.sum())
    rgb = a[..., :3].astype(float)
    px = rgb[opaque]
    samp = px if len(px) <= 40000 else px[np.random.default_rng(3).choice(len(px), 40000, replace=False)]
    cent = kmeans(samp, K)
    lab = np.full(opaque.shape, -1, dtype=int)
    idx = np.nonzero(opaque)
    d = ((rgb[idx][:, None, :] - cent[None]) ** 2).sum(-1)
    lab[idx] = d.argmin(1)
    shares = np.array([(lab == i).sum() for i in range(K)]) / max(area, 1)
    order = np.argsort(lum(cent))

    base_r = max(1, round(OPEN_FRAC * max(im.size)))
    chosen = None
    # Darkest palette colours first, grown one colour at a time (so stripes and shaded folds join up
    # with their neighbours): stop at the first level at which a substantial fur region exists.
    # Strict first, then relaxed so tiny or striped art, like the bee, still gets a colour.
    for r, scale in ((base_r, 1.0), (base_r, 0.6), (base_r, 0.3)):
        grown = np.zeros(opaque.shape, dtype=bool)
        for i in order:
            grown |= (lab == i)
            m = opened(grown, r)
            keep = np.zeros_like(m)
            for comp in components(m):
                if len(comp) >= MIN_REGION * scale * area:
                    keep[comp[:, 0], comp[:, 1]] = True
            if keep.sum() >= max(MIN_TOTAL * scale * area, 1):
                chosen = (keep, r, scale)
                break
        if chosen:
            break
    if chosen is None:
        chosen = (lab == order[0], 0, 0.0)
    keep, r, scale = chosen
    # the ink is the dark band of that fur, not its darkest specks: pixels between the 10th and 40th
    # percentile of luminance (an eye or a nose that joined the region is below the 10th)
    sel = rgb[keep]
    L = lum(sel)
    lo, hi = np.percentile(L, 10), np.percentile(L, 40)
    band = sel[(L >= lo) & (L <= hi)]
    raw = (band if len(band) else sel).mean(0)
    keep = keep & (lum(rgb) >= lo) & (lum(rgb) <= hi)

    # the main body colour: the commonest palette colour that is neither near-white nor near-black
    body = None
    best = -1.0
    for j in range(K):
        L = hls(cent[j])[1]
        if 0.2 < L < 0.85 and shares[j] > best:
            best, body = shares[j], cent[j]
    final, lifted = lift(raw, body)

    if debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        dbg = a.copy()
        dbg[keep, 0], dbg[keep, 1], dbg[keep, 2], dbg[keep, 3] = 255, 0, 200, 255
        Image.fromarray(dbg).save(os.path.join(debug_dir, os.path.basename(path)))
    return {'raw': tuple(raw), 'ink': tuple(final), 'lifted': lifted, 'share': float(keep.sum()) / max(area, 1),
            'r': r, 'scale': scale}


def extent(path):
    """Top and bottom of the painted body (alpha > 40) as fractions of the image height."""
    a = np.asarray(Image.open(path).convert('RGBA'))[..., 3]
    ys = np.nonzero(a > 40)[0]
    return ys.min() / a.shape[0], (ys.max() + 1) / a.shape[0]


def hexc(c):
    return '#%02x%02x%02x' % tuple(int(round(max(0, min(255, v)))) for v in c)


def resolve(src):
    """/assets/animals/x.png or /admin/scene-assets/x.png -> file on disk."""
    return os.path.join(PUBLIC, src.lstrip('/'))


def discover():
    seen, out = set(), []   # (sprite path on disk, needs --edge-y)
    img = re.compile(r'<img\b[^>]*>', re.S)
    for html in sorted(glob.glob(os.path.join(ADMIN, '*.html'))):
        text = open(html).read()
        if '_signpost-physics.css' not in text:
            continue
        for tag in img.findall(text):
            cm = re.search(r'class="([^"]*)"', tag)
            sm = re.search(r'\bsrc="(/[^"]+\.png)"', tag)
            if not cm or not sm:
                continue
            classes = cm.group(1).split()
            if not any(c in ANIMAL_CLASSES for c in classes):
                continue
            p = resolve(sm.group(1))
            if os.path.exists(p) and p not in seen:
                seen.add(p)
                out.append((p, any(c in STORY_CLASSES for c in classes) or 'vet-sick' in tag))
    for pattern in ('*-sick.png', '*-arriving.png'):
        for p in sorted(glob.glob(os.path.join(PUBLIC, 'assets', 'animals', pattern))):
            if p not in seen:
                seen.add(p)
                out.append((p, True))
    return out


def main():
    write = '--write' in sys.argv
    debug = sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None
    lines = []
    report = []
    for path, needs_edge in discover():
        r = analyse(path, debug)
        name = os.path.splitext(os.path.basename(path))[0]
        top, bottom = extent(path)
        edge = ' --edge-y: %.3f; --top-y: %.3f;' % (bottom, top) if needs_edge else ''
        lines.append('[src$="/%s.png"] { --animal-ink: %s;%s }' % (name, hexc(r['ink']), edge))
        report.append('%-34s raw %s -> ink %s%s  (from %.1f%% of the animal)' % (
            name, hexc(r['raw']), hexc(r['ink']), ' (lifted)' if r['lifted'] else '', r['share'] * 100))
    table = BEGIN + '\n' + '\n'.join(lines) + '\n' + END
    if write:
        css = open(CSS).read()
        if BEGIN not in css or END not in css:
            sys.exit('markers %s ... %s not found in %s' % (BEGIN, END, CSS))
        a, b = css.index(BEGIN), css.index(END) + len(END)
        open(CSS, 'w').write(css[:a] + table + css[b:])
        print('wrote %d rules to %s' % (len(lines), os.path.relpath(CSS, ROOT)))
    else:
        print(table)
    print('\n'.join(report), file=sys.stderr)


if __name__ == '__main__':
    main()
