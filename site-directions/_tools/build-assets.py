#!/usr/bin/env python3
"""
Copy the game's own art into site-directions/assets/, trimmed and as WebP,
and print each animal's outline ink (its own darkest fur colour, the same
analysis scripts/sign-animal-ink.py uses for the sign screens).

    python3 site-directions/_tools/build-assets.py           # the mock-ups' assets
    python3 site-directions/_tools/build-assets.py --site    # the real site's assets

--site writes site/assets/img (each picture at two widths for srcset), the
generated site/assets/ink.css (one class per animal, so no inline styles are
needed under the site's strict CSP), the favicons and the 1200x630 share image.
Henry the van is painted in a different style from the animals, so his outline
is baked into his WebP: the same darkest-palette-colour ink, 1px at the 1x
width and 2px at the 2x width.

Needs Pillow and numpy. Fonts are copied as-is (woff2, latin + latin-ext).
"""
import importlib.util, json, os, shutil
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PUB = os.path.join(ROOT, 'apps', 'game', 'public')
OUT = os.path.join(ROOT, 'site-directions', 'assets')

spec = importlib.util.spec_from_file_location('ink', os.path.join(ROOT, 'scripts', 'sign-animal-ink.py'))
ink = importlib.util.module_from_spec(spec); spec.loader.exec_module(ink)

# name: (source, max long side, trim?, quality)
SCENE = {
    'bg-lawn':      ('assets/bg/garden-lawn-summer-morning.png', 1280, False, 72),
    'bg-quiet':     ('assets/bg/garden-quiet-summer-afternoon.png', 1280, False, 72),
    'map-birchie':  ('admin/scene-assets/reference/manus-test-2026-04-29/birchie-base-map.png', 1600, False, 72),
    'arc-cottage':  ('admin/scene-assets/arc-exterior.png', 720, False, 76),
    'oak':          ('admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-tree-oak-summer.png', 640, True, 74),
    'grass-clump':  ('admin/scene-assets/grass-clump.png', 900, True, 76),
    'logo':         ('assets/logo/arc-logo-full.png', 512, True, 88),
    'van-henry':    ('assets/driving/vehicles/vehicle-henry.png', 700, True, 80),
    'sign-20':      ('assets/driving/topdown/decor/decor-sign-speed-20.png', 260, True, 80),
    'sign-hedgehog':('assets/driving/topdown/decor/decor-sign-hedgehog.png', 260, True, 80),
    'van-topdown':  ('assets/driving/topdown/vehicle-topdown-henry.png', 200, True, 82),
    'bench':        ('assets/tiles/tile-bench.png', 256, True, 80),
    'family-priya': ('admin/scene-assets/cast/01-priya.png', 420, True, 80),
    'warden':       ('admin/scene-assets/cast/warden-marnie-happy.png', 420, True, 80),
}
ANIMALS = {
    'dog-golden':    'assets/animals/dog-golden-walking.png',
    'dog-beagle':    'assets/animals/dog-beagle-playing.png',
    'dog-collie':    'assets/animals/dog-collie-walking.png',
    'dog-terrier-scared': 'assets/animals/dog-terrier-scared.png',
    'cat-ginger':    'assets/animals/cat-ginger-playing.png',
    'cat-calico-sleeping': 'assets/animals/cat-calico-sleeping.png',
    'cat-tuxedo':    'assets/animals/cat-tuxedo-walking.png',
    'bunny-lop':     'assets/animals/bunny-lop-eating.png',
    'bunny-dutch':   'assets/animals/bunny-dutch-sheltered.png',
    'fox-scared':    'assets/animals/fox-red-scared.png',
    'hedgehog':      'assets/animals/hedgehog-brown-walking.png',
    'parrot':        'admin/scene-assets/parrot-macaw-nobranch.png',
    'duck':          'assets/animals/duck-walking.png',
}

def trim(im):
    box = im.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
    return im.crop(box) if box else im

def save(im, name, size, q):
    im.thumbnail((size, size), Image.LANCZOS)
    p = os.path.join(OUT, 'img', name + '.webp')
    im.save(p, 'WEBP', quality=q, method=6)
    return im.size, os.path.getsize(p)

def main():
    os.makedirs(os.path.join(OUT, 'img'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'fonts'), exist_ok=True)
    meta = {}
    for name, (src, size, do_trim, q) in SCENE.items():
        im = Image.open(os.path.join(PUB, src)).convert('RGBA')
        if do_trim: im = trim(im)
        wh, b = save(im, name, size, q)
        meta[name] = {'w': wh[0], 'h': wh[1]}
        print(f'{name:22} {wh} {b//1024} KB')
    for name, src in ANIMALS.items():
        path = os.path.join(PUB, src)
        im = trim(Image.open(path).convert('RGBA'))
        wh, b = save(im, name, 360, 82)
        colour = ink.hexc(ink.analyse(path)['ink'])
        meta[name] = {'w': wh[0], 'h': wh[1], 'ink': colour}
        print(f'{name:22} {wh} {b//1024} KB ink {colour}')
    for f in os.listdir(os.path.join(PUB, 'fonts')):
        if f.startswith(('fredoka-', 'nunito-')) and f.endswith('.woff2'):
            shutil.copy(os.path.join(PUB, 'fonts', f), os.path.join(OUT, 'fonts', f))
    with open(os.path.join(HERE, 'assets.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)

# --- the real site (site/) -------------------------------------------------
SITE = os.path.join(ROOT, 'site', 'assets')
A = 'assets/animals/'
# name: (source, (1x width, 2x width) or None for the long side, kind)
# kind: 'animal' gets an ink class; 'baked' gets its outline baked in; 'plain' neither.
SITE_IMG = {
    'logo':          ('assets/logo/arc-logo-full.png', (300, 512), 'plain'),
    'oak':           ('admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-tree-oak-summer.png', (320, 640), 'plain'),
    'bench':         ('assets/tiles/tile-bench.png', (160, 256), 'plain'),
    'family-priya':  ('admin/scene-assets/cast/01-priya.png', (90, 180), 'plain'),
    'van-henry':     ('assets/driving/vehicles/vehicle-henry.png', (240, 480), 'baked'),
    'dog-golden':    (A + 'dog-golden-walking.png', (180, 360), 'animal'),
    'hedgehog':      (A + 'hedgehog-brown-walking.png', (150, 300), 'animal'),
    'bunny-lop':     (A + 'bunny-lop-eating.png', (150, 300), 'animal'),
    'fox':           (A + 'fox-red-sheltered.png', (120, 240), 'animal'),
    'cat-ginger':    (A + 'cat-ginger-playing.png', (120, 240), 'animal'),
    'dog-collie':    (A + 'dog-collie-walking.png', (100, 200), 'animal'),
    'bunny-dutch':   (A + 'bunny-dutch-sheltered.png', (110, 220), 'animal'),
    'duck':          (A + 'duck-walking.png', (100, 200), 'animal'),
    'cat-calico-sleeping': (A + 'cat-calico-sleeping.png', (110, 220), 'animal'),
    'dog-beagle':    (A + 'dog-beagle-playing.png', (130, 260), 'animal'),
    'bunny-lop-sitting': (A + 'bunny-lop-sheltered.png', (100, 200), 'animal'),
    'dog-beagle-puzzled': (A + 'dog-beagle-arriving.png', (130, 260), 'animal'),
    'hedgehog-worried':   (A + 'hedgehog-brown-arriving.png', (130, 260), 'animal'),
}

def darkest_ink(path):
    return ink.hexc(ink.analyse(path)['ink'])

def outline(im, px, colour):
    """Grow the alpha by px and paint it in colour under the picture."""
    from PIL import ImageFilter
    a = im.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    grown = a.filter(ImageFilter.MaxFilter(2 * px + 1))
    rgb = tuple(int(colour[i:i + 2], 16) for i in (1, 3, 5))
    out = Image.new('RGBA', im.size, rgb + (0,))
    out.putalpha(grown)
    out.alpha_composite(im)
    return out

def site():
    img = os.path.join(SITE, 'img')
    os.makedirs(img, exist_ok=True)
    os.makedirs(os.path.join(SITE, 'fonts'), exist_ok=True)
    meta, css = {}, ['/* Generated by site-directions/_tools/build-assets.py --site. Each animal\'s',
                     '   outline ink: its own darkest fur colour (scripts/sign-animal-ink.py). */']
    for name, (src, widths, kind) in SITE_IMG.items():
        path = os.path.join(PUB, src)
        base = trim(Image.open(path).convert('RGBA'))
        colour = darkest_ink(path) if kind in ('animal', 'baked') else None
        for i, w in enumerate(widths):
            pad = 2 * (i + 1) if kind == 'baked' else 0
            im = base.copy()
            h = round(im.height * (w - 2 * pad) / im.width)
            im = im.resize((w - 2 * pad, h), Image.LANCZOS)
            if kind == 'baked':
                canvas = Image.new('RGBA', (w, h + 2 * pad), (0, 0, 0, 0))
                canvas.paste(im, (pad, pad))
                im = outline(canvas, i + 1, colour)
            im.save(os.path.join(img, f'{name}-{w}.webp'), 'WEBP', quality=80, method=6)
        meta[name] = {'w': widths, 'h': [Image.open(os.path.join(img, f'{name}-{w}.webp')).height for w in widths]}
        if colour:
            meta[name]['ink'] = colour
        if kind == 'animal':
            css.append(f'.ink-{name} {{ --ink: {colour}; }}')
        print(f'{name:22} {meta[name]}')
    with open(os.path.join(SITE, 'ink.css'), 'w') as fh:
        fh.write('\n'.join(css) + '\n')
    # favicons from the game's paw-heart icon
    icon = trim(Image.open(os.path.join(PUB, 'assets/logo/arc-logo-icon.png')).convert('RGBA'))
    for size, name in ((32, 'favicon-32.png'), (180, 'apple-touch-icon.png')):
        sq = Image.new('RGBA', (size, size), (0, 0, 0, 0) if size == 32 else (251, 248, 241, 255))
        ic = icon.copy(); m = size if size == 32 else round(size * .82)
        ic.thumbnail((m, m), Image.LANCZOS)
        sq.alpha_composite(ic, ((size - ic.width) // 2, (size - ic.height) // 2))
        sq.save(os.path.join(SITE, '..', name))
    # the 1200x630 share image: the summer lawn, the logo, three animals
    og = Image.open(os.path.join(PUB, 'assets/bg/garden-lawn-summer-morning.png')).convert('RGBA')
    f = max(1200 / og.width, 630 / og.height)
    og = og.resize((round(og.width * f), round(og.height * f)), Image.LANCZOS)
    og = og.crop(((og.width - 1200) // 2, og.height - 630, (og.width - 1200) // 2 + 1200, og.height))
    panel = Image.new('RGBA', (600, 250), (251, 248, 241, 235))
    og.alpha_composite(panel, (300, 40))
    logo = trim(Image.open(os.path.join(PUB, 'assets/logo/arc-logo-full.png')).convert('RGBA'))
    logo.thumbnail((540, 220), Image.LANCZOS)
    og.alpha_composite(logo, (600 - logo.width // 2, 165 - logo.height // 2))
    for src, h, x in ((A + 'dog-golden-walking.png', 230, 150), (A + 'hedgehog-brown-walking.png', 130, 560), (A + 'bunny-lop-eating.png', 170, 820)):
        path = os.path.join(PUB, src)
        a = trim(Image.open(path).convert('RGBA'))
        a = a.resize((round(a.width * h / a.height), h), Image.LANCZOS)
        a = outline(a, 2, darkest_ink(path))
        og.alpha_composite(a, (x, 600 - a.height))
    og.convert('RGB').save(os.path.join(SITE, '..', 'share.jpg'), quality=82)
    for f in os.listdir(os.path.join(PUB, 'fonts')):
        if f.startswith(('fredoka-600', 'fredoka-700', 'nunito-400', 'nunito-700', 'nunito-800')) and f.endswith('.woff2'):
            shutil.copy(os.path.join(PUB, 'fonts', f), os.path.join(SITE, 'fonts', f))
    with open(os.path.join(HERE, 'site-assets.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)

import sys
site() if '--site' in sys.argv else main()
