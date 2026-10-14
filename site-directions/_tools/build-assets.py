#!/usr/bin/env python3
"""
Copy the game's own art into site-directions/assets/, trimmed and as WebP,
and print each animal's outline ink (its own darkest fur colour, the same
analysis scripts/sign-animal-ink.py uses for the sign screens).

    python3 site-directions/_tools/build-assets.py

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

main()
