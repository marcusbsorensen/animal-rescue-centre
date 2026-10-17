#!/usr/bin/env python3
"""measure-wardrobe-anchors.py — where each animal wears its garment.

    python3 tools/measure-wardrobe-anchors.py                   # rewrite wardrobe-anchors.json
    python3 tools/measure-wardrobe-anchors.py --check           # fail if the file is out of date
    python3 tools/measure-wardrobe-anchors.py --qc DIR --grid   # also contact sheets of every placement
    python3 tools/measure-wardrobe-anchors.py --qc DIR --grid --marks --cell 330 --cols 2 \
        --only dog-collie-eating,dog-collie-sick                # a few sprites, large, with the circles
    python3 tools/measure-wardrobe-anchors.py --species cat     # one species (does not write)

Needs numpy, scipy and Pillow. About ninety seconds for the 459 sprites;
`WARDROBE_MEASURE_CACHE=/some/file.pkl` keeps the measurements between runs
while you change how they become anchors.

Writes `apps/game/public/data/wardrobe-anchors.json`, which
`getWardrobeAnchor` (packages/game-logic/src/wardrobe.ts) reads through
`apps/game/src/lib/WardrobeAnchors.ts`, and
`apps/game/src/lib/__tests__/wardrobe-anchors.test.ts` checks against the art.

**Why one entry per sprite and not per species.** The restyled sprites are
not consistent within a species. Each variant's pose was drawn on its own: the
ginger cat's "sheltered" is a loaf with its head on the left, the siamese's
sits upright, the tuxedo's "playing" is a bow where the ginger's lies down. A
garment placed from a species average lands on a flank. So the key is the
texture the game will draw — `dog-husky-sheltered`, or `dog-sheltered` for the
species-level fallback — and the value is measured from that file. Arriving
sprites get none: she is in her box and not yet anyone's to dress.

**How it measures.** From the alpha and the pixels.

1. *The head.* The face is where a sprite's strongest compact contrasts
   cluster — pupils, irises, a nose — so a difference of Gaussians at four
   scales finds round spots of both polarities (a dark pupil in light fur, a
   bright iris in dark fur; ink lines are rejected by the Hessian), and of the
   silhouette's six largest inscribed circles the one that holds the most of
   them for its size is the head. Her centre is pulled to the spots' centroid;
   her radius is capped at 0.12 to 0.30 of the animal's size, because a
   curled-up fox is one lobe and the head is not all of her.
2. *The torso.* Of the remaining circles, the large one that touches the head,
   not above it and not a leg: a fox's tail is bigger than the rest of her.
3. *The garment,* per kind (`place`). A scarf's centre goes where the head
   meets the neck, between "toward the torso" and "down", turned to follow
   the neck and upside down on a bat that hangs by her feet; its size is the
   head's, grown for the small animals (`presence`) so it still reads at the
   size the game draws a bat. A hat sits on the head, as low and wide as a hat
   can be, because it may not go above her bounding box. A coat covers the
   torso, mirrored to the way she faces, and the game clips it to her
   silhouette. A scarf or a coat also carries the head as a circle to erase,
   so it tucks behind her instead of across her face.
4. *The clamp.* Every garment is moved into the animal's bounding box (plus
   two pixels). The game draws an animal from a frame cut to that box
   (`ui/sprites.ts`, `subjectFrame`); anything outside it is cut off, and
   anything that grew it would shrink her and move her feet.

**Where it is wrong.** It cannot read a closed eye, a face on a dark animal
with dark eyes (the collie, the black cat), a snake coiled round her own head,
or a fennec's ears. `UNSURE` is any sprite with fewer than two face spots in
her head circle. Those and the ones that landed visibly wrong on the QC sheets
are set by eye in `tools/wardrobe-landmarks.json` — a head and sometimes a
torso circle — and listed as HAND-SET. Everything else is measured.

The anchor is `{dx, dy, widthFrac, heightFrac, rotation, flip?, maskDx?,
maskDy?, maskRadiusFrac?}` — see `WardrobeAnchor`.
"""
import argparse
import copy
import json
import math
import os
import pickle
import re
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ANIMALS = os.path.join(ROOT, 'apps/game/public/assets/animals')
OUT = os.path.join(ROOT, 'apps/game/public/data/wardrobe-anchors.json')

POSES = ['arriving', 'sheltered', 'eating', 'sleeping', 'walking',
         'growling', 'grumpy', 'scared', 'sick', 'playing']
# No garment is drawn on an arriving animal: she is in her box, and not yet ours to dress.
DRESSED_POSES = [p for p in POSES if p != 'arriving']
GARMENT = {'dog': 'coat', 'fox': 'coat', 'cat': 'scarf', 'bunny': 'scarf', 'bat': 'scarf',
           'parrot': 'hat', 'snake': 'hat', 'hedgehog': 'scarf'}
N = 512


# ── reading a sprite ───────────────────────────────────────────────

def load(path):
    im = Image.open(path).convert('RGBA')
    if im.size != (N, N):
        im = im.resize((N, N), Image.LANCZOS)
    return im


def silhouette(alpha):
    m = alpha >= 128
    lab, n = ndi.label(m)
    if n <= 1:
        return m
    sizes = ndi.sum(m, lab, range(1, n + 1))
    big = sizes.max()
    return np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 0.08 * big])


def masked_gauss(L, m, s):
    return ndi.gaussian_filter(L * m, s) / np.maximum(ndi.gaussian_filter(m.astype(float), s), 1e-3)


def blobs(rgb, m, dt):
    """Round, contrasty spots — pupils, irises, noses — of both polarities.

    A difference of Gaussians finds anything with an edge round it, which
    includes every ink line, so each peak is kept only where the Hessian says
    it is round in both directions and not a stroke.
    """
    L = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    mf = m.astype(float)
    # transparent pixels take the neighbours' value, so the silhouette's edge is not a feature
    Lf = masked_gauss(L, mf, 1.0)
    Lf = np.where(m, L, Lf)
    out = []
    for s in (4, 6, 9, 13):
        dog = masked_gauss(Lf, mf, s) - masked_gauss(Lf, mf, s * 2.0)
        hxx = ndi.gaussian_filter(Lf, s, order=(0, 2))
        hyy = ndi.gaussian_filter(Lf, s, order=(2, 0))
        hxy = ndi.gaussian_filter(Lf, s, order=(1, 1))
        tr = hxx + hyy
        det = hxx * hyy - hxy * hxy
        disc = np.sqrt(np.maximum(tr * tr / 4 - det, 0))
        l1, l2 = tr / 2 + disc, tr / 2 - disc            # l1 >= l2
        for pol in (-1, 1):
            r = pol * dog
            # dark spot: Hessian positive in both directions; bright spot: negative in both
            lo, hi = (l2, l1) if pol == -1 else (-l1, -l2)   # lo <= hi, both positive for a spot
            roundness = np.where(hi > 1e-6, lo / np.maximum(hi, 1e-6), 0)
            peak = ((r == ndi.maximum_filter(r, size=int(s * 3))) & (r > 18) & (dt >= 6) & m
                    & (lo > 0) & (roundness >= 0.35))
            for y, x in zip(*np.nonzero(peak)):
                k = int(s * 1.6)
                y0, y1, x0, x1 = max(0, y - k), min(N, y + k + 1), max(0, x - k), min(N, x + k + 1)
                patch = L[y0:y1, x0:x1][m[y0:y1, x0:x1]]
                out.append(dict(x=float(x), y=float(y), s=float(s), pol=pol, resp=float(r[y, x]),
                                rng=float(patch.max() - patch.min()) if patch.size else 0.0))
    return out


def inscribed(m, k=5):
    dt = ndi.distance_transform_edt(m)
    work = dt.copy()
    yy, xx = np.mgrid[0:N, 0:N]
    out, r1 = [], None
    for _ in range(k):
        i = int(np.argmax(work))
        y, x = divmod(i, N)
        r = float(dt[y, x])
        if r1 is None:
            r1 = r
        if r < 0.18 * r1 or r < 10:
            break
        out.append((float(x), float(y), r))
        work[(xx - x) ** 2 + (yy - y) ** 2 <= (r * 1.1) ** 2] = 0
    return out


class Marks:
    """Everything measured about one sprite: `bbox`, `head`, `body` (x, y, r), `torso_x`, `head_top`, `sure`."""


_CACHE = {}
_CACHE_PATH = os.environ.get('WARDROBE_MEASURE_CACHE')       # a speed-up for iterating on the placement rules


def measure(path):
    """What the pixels say about one sprite, cached on disk if asked."""
    if _CACHE_PATH and not _CACHE and os.path.exists(_CACHE_PATH):
        with open(_CACHE_PATH, 'rb') as fh:
            _CACHE.update(pickle.load(fh))
    stamp = (path, os.path.getmtime(path), os.path.getsize(path))
    if stamp not in _CACHE:
        _CACHE[stamp] = _measure(path)
        if _CACHE_PATH:
            with open(_CACHE_PATH, 'wb') as fh:
                pickle.dump(_CACHE, fh)
    return copy.copy(_CACHE[stamp])


def _measure(path):
    im = load(path)
    arr = np.array(im).astype(float)
    m = silhouette(arr[..., 3])
    dt = ndi.distance_transform_edt(m)
    ys, xs = np.nonzero(m)
    k = Marks()
    k.bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    bl = blobs(arr[..., :3], m, dt)
    cs = inscribed(m, 6) or [((k.bbox[0] + k.bbox[2]) / 2, (k.bbox[1] + k.bbox[3]) / 2, 60.0)]
    r1 = cs[0][2]
    # The face is where the sprite's strongest compact contrasts cluster: the
    # eyes, the nose, the mouth. A lobe of the silhouette that holds more of
    # them, for its size, than any other is the head.
    feats = [b for b in bl if b['rng'] >= 90 and b['s'] >= 4]

    def face_score(c):
        inside = [b for b in feats if math.hypot(b['x'] - c[0], b['y'] - c[1]) <= 0.95 * c[2]]
        # faces are usually in the upper part of an animal, a little
        return (sum(b['resp'] * min(1.0, b['rng'] / 200.0) for b in inside)
                / math.sqrt(c[2]) * (1.3 - 0.6 * c[1] / N)), inside

    scored = [(face_score(c), c) for c in cs if c[2] >= 0.45 * r1]
    (fs, inside), best = max(scored, key=lambda t: t[0][0])
    k.sure = fs > 0 and len(inside) >= 2
    scale = math.sqrt(float(m.sum()))                    # the animal's size, from her area
    hr = float(np.clip(best[2], 0.12 * scale, 0.30 * scale))   # a head is a quarter of her, not all of her
    if len(inside) >= 2:
        w = np.array([b['resp'] for b in inside])
        fx = float(np.average([b['x'] for b in inside], weights=w))
        fy = float(np.average([b['y'] for b in inside], weights=w))
        k.head = (0.25 * best[0] + 0.75 * fx, 0.25 * best[1] + 0.75 * fy, hr)
    else:
        k.head = (best[0], best[1], hr)
    _derive(m, k, k.head)
    return k


def _derive(m, k, head, body=None):
    """Everything that follows from where the head is: the torso, and the top of the head."""
    k.head = head
    hx, hy, hr = head
    yy, xx = np.mgrid[0:N, 0:N]
    # The torso is the lobe next to the head, not the biggest lobe: a fox's tail
    # is bigger than the rest of her. Of the inscribed circles that are not the
    # head, the one that is large and touches (or nearly touches) it.
    pool = inscribed(m, 8)
    best_b, best_s = None, -1.0
    for (cx_, cy_, cr) in pool:
        dist = math.hypot(cx_ - hx, cy_ - hy)
        if dist < 0.55 * (hr + cr):
            continue                                   # that is the head itself
        if cr < 0.4 * hr:
            continue                                   # a leg or a tuft: not a torso
        gap = max(0.0, dist - hr - cr)
        sc = cr / (1.0 + 1.5 * gap / hr)
        if cy_ < hy - 0.3 * hr:
            sc *= 0.15                                 # a torso is not above her head: that is an ear, or a bat
        if sc > best_s:
            best_b, best_s = (cx_, cy_, cr), sc
    k.body = body or best_b or (hx, min(N - 1.0, hy + 1.2 * hr), hr)
    rest = m & ((xx - hx) ** 2 + (yy - hy) ** 2 > (hr * 1.05) ** 2)
    # the extent of the torso along x: pixels of the rest that are thick enough not to be tail or leg
    rdt = ndi.distance_transform_edt(rest)
    thick = rdt >= 0.35 * k.body[2]
    lab, n = ndi.label(thick)
    if n:
        lbl = lab[min(N - 1, int(k.body[1])), min(N - 1, int(k.body[0]))] or int(
            np.argmax(ndi.sum(thick, lab, range(1, n + 1))) + 1)
        cols = np.nonzero((lab == lbl).any(0))[0]
        k.torso_x = (float(cols.min()), float(cols.max()))
    else:
        k.torso_x = (k.body[0] - k.body[2], k.body[0] + k.body[2])
    # the top of the head: the highest silhouette pixel inside her head circle
    in_head = m & ((xx - hx) ** 2 + (yy - hy) ** 2 <= hr ** 2)
    rows = np.nonzero(in_head.any(1))[0]
    k.head_top = float(rows.min()) if rows.size else hy - hr


# ── garment placement ──────────────────────────────────────────────

def _ladder():
    """`SPECIES_UNIT` and `VARIANT_UNIT`, read out of the game source rather than copied,
    so there is one ladder and not two (as `check-sprite-scale.py` does)."""
    src = open(os.path.join(ROOT, 'packages/game-logic/src/animal-scale.ts')).read()
    species = dict(re.findall(r"^\s+(\w+):\s+([0-9.]+),", src[src.index('export const SPECIES_UNIT'):], re.M))
    variants = dict(re.findall(r"^\s+'([\w-]+)':\s+([0-9.]+),", src[src.index('export const VARIANT_UNIT'):], re.M))
    return {k: float(v) for k, v in species.items()}, {k: float(v) for k, v in variants.items()}


_SPECIES_UNIT, _VARIANT_UNIT = _ladder()


def presence(key):
    """How much bigger than life to draw a garment on this animal.

    A bat is drawn a third the size of a dog, so a scarf in proportion to her
    is a smudge. Garments grow as the animal shrinks, from a cat (1.0) up to
    half as large again on a bat, which keeps them readable at the size the game
    draws them and still sitting where the head and neck are. Hats are not
    grown (`place`): a hat is as tall as the forehead it sits on, or it is on
    her eyes.
    """
    parts = key.split('-')
    species = parts[0]
    unit = _VARIANT_UNIT.get(f'{parts[0]}-{parts[1]}') if len(parts) == 3 else None
    unit = unit if unit is not None else _SPECIES_UNIT.get(species, 0.74)
    return max(1.0, min(1.5, (0.74 / unit) ** 0.9))


def kind_of(species):
    return GARMENT[species]


def art_size(species):
    p = os.path.join(ANIMALS, f'{species}-{GARMENT[species]}.png')
    with Image.open(p) as im:
        return im.size


# where, as a fraction of the art, the garment meets the animal
REF = {'scarf': (0.5, 0.50), 'hat': (0.5, 0.90), 'coat': (0.5, 0.5)}


def place(species, k, key=None):
    """Return the anchor dict for this garment on this animal."""
    kind = GARMENT[species]
    aw, ah = art_size(species)
    hx, hy, hr = k.head
    bx, by, br = k.body
    ux, uy = bx - hx, by - hy
    ul = math.hypot(ux, uy) or 1.0
    ux, uy = ux / ul, uy / ul
    x0, y0, x1, y1 = k.bbox
    rot, flip = 0.0, False
    grow = presence(key) if key else 1.0

    mask = None
    if kind == 'scarf':
        w = 1.8 * hr * grow
        h = w * ah / aw
        # the neck is at the back of the chin: between "toward the body" and "down"
        dx_, dy_ = ux, uy + 0.9
        dl = math.hypot(dx_, dy_) or 1.0
        dx_, dy_ = dx_ / dl, dy_ / dl
        if uy < -0.7:
            dx_, dy_ = ux, uy
        tx, ty = hx + dx_ * 1.0 * hr, hy + dy_ * 1.0 * hr
        if uy < -0.7:
            rot = 180.0
        else:
            rot = max(-30.0, min(30.0, math.degrees(math.atan2(-ux, uy))))
        mask = (hx, hy, 0.97 * hr)
    elif kind == 'hat':
        w = {'parrot': 1.3, 'snake': 2.1}.get(species, 1.3) * hr
        h = w * ah / aw
        rot = 0.0
        # the rim sits a quarter of the way into the head from its top
        tx, ty = hx, k.head_top + 0.25 * hr
    else:  # coat
        side = abs(ux) >= 0.6
        if side:
            flip = ux < 0
            x_lo, x_hi = k.torso_x
            length = max(1.4 * br, min(2.6 * br, (x_hi - x_lo) * 1.0))
            w = length
            h = w * ah / aw
            tx = (x_lo + x_hi) / 2
            ty = by - 0.18 * br
        else:
            w = 1.8 * br
            h = w * ah / aw
            tx, ty = bx, by - 0.10 * br
        mask = (hx, hy, 0.97 * hr)
    # the garment's reference point lands on the target
    rx, ry = REF[kind]
    ox, oy = (rx - 0.5) * w, (ry - 0.5) * h
    if flip:
        ox = -ox
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    cx = tx - (ox * c - oy * s)
    cy = ty - (ox * s + oy * c)

    # clamp the rotated rectangle into the sprite's box
    def extent(cx_, cy_):
        pts = [(sx * w / 2, sy * h / 2) for sx in (-1, 1) for sy in (-1, 1)]
        rp = [(cx_ + px * c - py * s, cy_ + px * s + py * c) for px, py in pts]
        return (min(p[0] for p in rp), min(p[1] for p in rp), max(p[0] for p in rp), max(p[1] for p in rp))

    pad = 2.0
    ex0, ey0, ex1, ey1 = extent(cx, cy)
    # A garment bigger than the animal (a scarf on a bat who is lying down) is
    # made to fit her; one that merely hangs over an edge is moved in.
    fit = min(1.0, (x1 - x0 + 2 * pad) / (ex1 - ex0), (y1 - y0 + 2 * pad) / (ey1 - ey0))
    if fit < 1.0:
        w, h = w * fit, h * fit
        ex0, ey0, ex1, ey1 = extent(cx, cy)
    if ex0 < x0 - pad:
        cx += (x0 - pad) - ex0
    if ex1 > x1 + pad:
        cx -= ex1 - (x1 + pad)
    ex0, ey0, ex1, ey1 = extent(cx, cy)
    if ey0 < y0 - pad:
        cy += (y0 - pad) - ey0
    if ey1 > y1 + pad:
        cy -= ey1 - (y1 + pad)

    a = dict(dx=round((cx - N / 2) / N, 4), dy=round((cy - N / 2) / N, 4),
             widthFrac=round(w / N, 4), heightFrac=round(h / N, 4), rotation=round(rot, 1))
    if flip:
        a['flip'] = True
    if mask:
        a['maskDx'] = round((mask[0] - N / 2) / N, 4)
        a['maskDy'] = round((mask[1] - N / 2) / N, 4)
        a['maskRadiusFrac'] = round(mask[2] / N, 4)
    return a


# ── landmarks set by eye ───────────────────────────────────────────
# `tools/wardrobe-landmarks.json`: texture key -> {"head": [x, y, r], "body": [x, y, r]},
# in pixels of the 512 canvas, for the sprites where the measurement put the head
# or the torso on the wrong part of the animal (a dark collie whose eyes are not
# the strongest spots on her; a snake coiled round her own head). Read off the
# QC sheets (`--qc DIR --only KEY,KEY --marks --grid`). Everything not listed
# here was measured.

LANDMARKS = os.path.join(ROOT, 'tools/wardrobe-landmarks.json')


def load_landmarks():
    if not os.path.exists(LANDMARKS):
        return {}
    with open(LANDMARKS) as fh:
        return {k: v for k, v in json.load(fh).items() if not k.startswith('_')}


def apply_override(key, path, k, landmarks):
    o = landmarks.get(key)
    if not o:
        return False
    m = silhouette(np.array(load(path))[..., 3].astype(float))
    head = tuple(float(v) for v in o['head']) if 'head' in o else k.head
    body = tuple(float(v) for v in o['body']) if 'body' in o else None
    _derive(m, k, head, body)
    return True


# ── the run ────────────────────────────────────────────────────────

def textures(species_filter=None):
    """Every (key, species, path) the game can draw a dressed animal from."""
    out = []
    for f in sorted(os.listdir(ANIMALS)):
        if not f.endswith('.png'):
            continue
        parts = f[:-4].split('-')
        if parts[-1] not in DRESSED_POSES or len(parts) not in (2, 3):
            continue
        sp = parts[0]
        if sp not in GARMENT:
            continue
        if species_filter and sp != species_filter:
            continue
        if not os.path.exists(os.path.join(ANIMALS, f'{sp}-{GARMENT[sp]}.png')):
            continue                                    # no art for this garment yet
        out.append((f[:-4], sp, os.path.join(ANIMALS, f)))
    return out


def _draw_garments():
    import importlib.util
    spec = importlib.util.spec_from_file_location('draw_garments', os.path.join(ROOT, 'tools/draw-garments.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def dress(base, art, a, kind):
    """The animal with her garment on, the way the game paints it (`ui/wardrobe-art.ts`)."""
    from PIL import ImageChops
    g = art.resize((max(1, int(a['widthFrac'] * N)), max(1, int(a['heightFrac'] * N))), Image.LANCZOS)
    if a.get('flip'):
        g = g.transpose(Image.FLIP_LEFT_RIGHT)
    g = g.rotate(-a['rotation'], expand=True, resample=Image.BICUBIC)
    cx, cy = N / 2 + a['dx'] * N, N / 2 + a['dy'] * N
    layer = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    layer.paste(g, (int(cx - g.size[0] / 2), int(cy - g.size[1] / 2)))
    if 'maskRadiusFrac' in a:                              # the head is erased from the garment
        mx, my, mr = N / 2 + a['maskDx'] * N, N / 2 + a['maskDy'] * N, a['maskRadiusFrac'] * N
        ImageDraw.Draw(layer).ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=(0, 0, 0, 0))
    if kind == 'coat':                                     # a coat is clipped to her silhouette
        layer.putalpha(ImageChops.multiply(layer.getchannel('A'), base.getchannel('A')))
    out = Image.new('RGBA', (N, N), (245, 236, 218, 255))
    out.alpha_composite(base)
    out.alpha_composite(layer)
    return out.convert('RGB')


def preview_sheet(rows, path, tint_hex='#c0392b', C=96, cols=0, marks=False, grid=False, only=False):
    """Contact sheet: every cell is one sprite with her garment on."""
    dg = _draw_garments()
    arts = {}
    per_row = cols or len(DRESSED_POSES)
    cells = [(label, pose, items.get(pose)) for label, items in rows
             for pose in ([p for p in DRESSED_POSES if p in items] if only else DRESSED_POSES)]
    sheet = Image.new('RGB', (C * per_row, C * -(-len(cells) // per_row)), (245, 236, 218))
    for idx, (label, pose, it) in enumerate(cells):
        if not it:
            continue
        key, sp, path_, a, sure, (head, body) = it
        if sp not in arts:
            arts[sp] = dg.tint(Image.open(os.path.join(ANIMALS, f'{sp}-{GARMENT[sp]}.png')).convert('RGBA'), tint_hex)
        t = dress(load(path_), arts[sp], a, GARMENT[sp])
        d = ImageDraw.Draw(t)
        if marks:
            d.ellipse([head[0] - head[2], head[1] - head[2], head[0] + head[2], head[1] + head[2]], outline=(0, 170, 0), width=7)
            d.ellipse([body[0] - body[2], body[1] - body[2], body[0] + body[2], body[1] + body[2]], outline=(0, 90, 255), width=7)
        if not sure:
            d.rectangle([0, 0, N - 1, N - 1], outline=(255, 0, 0), width=14)
        thumb = t.resize((C, C), Image.LANCZOS)
        if grid:
            d = ImageDraw.Draw(thumb)
            for g in range(1, 8):                          # a faint grid in eighths of the sprite
                col = (150, 140, 120) if g == 4 else (215, 205, 185)
                d.line([g * C / 8, 0, g * C / 8, C], fill=col, width=1)
                d.line([0, g * C / 8, C, g * C / 8], fill=col, width=1)
                if only:                                   # numbered, to read a landmark off
                    d.text((g * C / 8 + 1, C - 12), str(g), fill=(120, 60, 0))
                    d.text((C - 9, g * C / 8 + 1), str(g), fill=(120, 60, 0))
            text = label if only else f'{label}:{pose}'
            d.rectangle([0, 0, 8 + 6 * len(text), 13], fill=(255, 255, 255))
            d.text((3, 1), text, fill=(0, 0, 0))
        r, c = divmod(idx, per_row)
        sheet.paste(thumb, (c * C, r * C))
    sheet.save(path, quality=42, optimize=True)         # small enough to look at; they are for eyes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='fail if wardrobe-anchors.json is out of date')
    ap.add_argument('--qc', help='write contact sheets of every placement into this directory')
    ap.add_argument('--species')
    ap.add_argument('--variant', help='only this variant (QC sheets); `_` is the species-level art')
    ap.add_argument('--cell', type=int, default=96, help='QC thumbnail size in px')
    ap.add_argument('--marks', action='store_true', help='QC: also draw the head (green) and body (blue) circles')
    ap.add_argument('--grid', action='store_true', help='QC: label each cell and draw a faint 1/8 grid')
    ap.add_argument('--only', help='QC: only these texture keys, comma-separated, on one sheet')
    ap.add_argument('--cols', type=int, default=0, help='QC columns (default: one row per variant)')
    args = ap.parse_args()

    anchors, unsure, hand = {}, [], []
    qc = {}
    landmarks = load_landmarks()
    for key, sp, path in textures(args.species):
        k = measure(path)
        if apply_override(key, path, k, landmarks):
            hand.append(key)
            k.sure = True
        a = place(sp, k, key)
        anchors[key] = a
        if not k.sure:
            unsure.append(key)
        parts = key.split('-')
        variant = parts[1] if len(parts) == 3 else '_'
        qc.setdefault(sp, {}).setdefault(variant, {})[parts[-1]] = (key, sp, path, a, k.sure, (k.head, k.body))

    # one sprite to a line: 460 entries, and a diff names the sprite that moved
    lines = [f'{json.dumps(k)}: {json.dumps(v, separators=(",", ":"))}' for k, v in sorted(anchors.items())]
    body = '{\n' + ',\n'.join(lines) + '\n}'
    if args.check:
        have = open(OUT).read() if os.path.exists(OUT) else ''
        if have.strip() != body.strip():
            print('wardrobe-anchors.json is out of date: run tools/measure-wardrobe-anchors.py')
            return 1
        print(f'wardrobe-anchors.json matches the art ({len(anchors)} sprites)')
        return 0

    if not args.species:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, 'w') as fh:
            fh.write(body + '\n')
    print(f'{len(anchors)} sprites measured; {len(unsure)} UNSURE (fewer than two face spots in the head circle); {len(hand)} HAND-SET')
    for u in unsure:
        print('  UNSURE', u)
    for h in hand:
        print('  HAND-SET', h)

    if args.qc and args.only:
        os.makedirs(args.qc, exist_ok=True)
        want = args.only.split(',')
        items = {}
        for sp, variants in qc.items():
            for v, poses in variants.items():
                for pose, it in poses.items():
                    if it[0] in want:
                        items[it[0]] = it
        # preview_sheet lays cells out per (label, pose); give each wanted sprite its own label
        rows = [(key, {key.split('-')[-1]: items[key]}) for key in want if key in items]
        preview_sheet(rows, os.path.join(args.qc, 'only.jpg'), C=args.cell, cols=args.cols or 5,
                      marks=args.marks, grid=args.grid, only=True)
        return 0
    if args.qc:
        os.makedirs(args.qc, exist_ok=True)
        for sp, variants in qc.items():
            names = sorted(variants, key=lambda v: (v != '_', v))
            if args.variant:
                names = [v for v in names if v == args.variant]
            per = 2 if args.cols else 5
            for i in range(0, len(names), per):
                chunk = names[i:i + per]
                tag = args.variant or f'{i // per + 1}'
                preview_sheet([(v, variants[v]) for v in chunk],
                              os.path.join(args.qc, f'{sp}-{tag}.jpg'), C=args.cell, cols=args.cols, marks=args.marks, grid=args.grid)
    return 0


if __name__ == '__main__':
    sys.exit(main())
