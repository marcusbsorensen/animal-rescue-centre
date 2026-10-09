#!/usr/bin/env python3
"""check-sprite-scale.py — the acceptance check for the animal sprite round.

    python3 tools/check-sprite-scale.py --gate                # what CI runs
    python3 tools/check-sprite-scale.py --emit-bounds          # rebuild the table
    python3 tools/check-sprite-scale.py --drafts asset-drafts/batch-restyle
    python3 tools/check-sprite-scale.py                       # installed sprites
    python3 tools/check-sprite-scale.py --species dog --verbose

It also emits `apps/game/src/ui/animal-sprite-bounds.ts` — where the animal
actually is inside each file — which is what lets the sprite layer apply the
scale ladder to the animal rather than to her canvas. `--gate` checks that
table against the art and runs the DRAWN checks, allowing only the sprites
listed in `tools/sprite-scale-known-failures.txt`, and complaining when one of
those starts passing so the list gets pruned.

Two different things are checked, because two different parties can fail.

**DRAWN (`--drafts`)** is what the generator owes: the animal whole, alone,
on clean alpha, drawn big enough to downsample from. Nothing here is about
relative size — the generator is never asked to make a hedgehog smaller than
a dog, because `install-restyled.py` re-crops and re-squares every sprite it
installs and would throw any such instruction away. Measured over the 90-cat
pilot staged in `asset-drafts/batch-restyle/staged-512/`, every one of the 90
came out between 0.9434 and 0.9453 of its canvas on the long side: that is
1/1.06, the `MARGIN` constant at `install-restyled.py:55`, not anything the
model drew.

**SCALE (installed)** is what the install step owes: each animal placed on a
512 canvas at its species' share of it, bottom-aligned so a row of canvases
drawn to one ground line stands on that line. This is where relative size
lives, because the game contain-fits the whole texture (`sprites.ts:124`), so
the canvas fraction *is* the drawn size, with no game code involved.

`SPECIES_SIZE` is read out of the game source rather than copied, so there is
one table and not two.
"""
import argparse
import json
import os
import re
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'apps/game/public/assets/animals')
# The one table, read rather than copied. It used to be `SPECIES_SIZE` in
# `apps/game/src/driving/crate-loading-view.ts`, which had eight rows and no
# way to say that a macaw is not a budgie; `animal-scale.ts` is the same eight
# figures plus raccoon, skunk and the eight variant exceptions.
SIZE_SRC = os.path.join(ROOT, 'packages/game-logic/src/animal-scale.ts')
BOUNDS_TS = os.path.join(ROOT, 'apps/game/src/ui/animal-sprite-bounds.ts')
KNOWN_FAILURES = os.path.join(ROOT, 'tools/sprite-scale-known-failures.txt')

POSES = {'arriving', 'sheltered', 'eating', 'sleeping', 'walking',
         'playing', 'sick', 'scared', 'grumpy', 'growling'}

# Read out of `animal-scale.ts` by `scale_constants()`; these are the
# fallbacks if the parse ever loses them, and the values the note specifies.
CAP = 0.80
FOOT_MARGIN = 0.04        # transparent band under the feet, share of canvas
TOL = 0.015               # how far a sprite may sit from its target fraction

# What the DRAWN check wants of the raw generator output.
MIN_DRAWN = 0.70          # long side of the subject, share of its canvas
EDGE_PAD = 2              # px of transparency required at every canvas edge
STRAY_FRAC = 0.02         # a second blob this big is a second object


def _block(src, name):
    m = re.search(name + r'[^{]*\{(.*?)\n\}', src, re.S)
    if not m:
        sys.exit(f'could not find {name} in {SIZE_SRC}')
    rows = re.findall(r"'?([\w-]+)'?\s*:\s*([0-9.]+)", m.group(1))
    if not rows:
        sys.exit(f'{name} parsed empty')
    return {k: float(v) for k, v in rows}


def species_size():
    """Parse the species ladder out of the game source.

    Returns units of a dog, keyed by species — the eight `Species` rungs plus
    raccoon and skunk, which have art but are tunnel animals rather than
    shelter residents. See the header comment in `animal-scale.ts`.
    """
    with open(SIZE_SRC) as fh:
        src = fh.read()
    return _block(src, r'export const SPECIES_UNIT')


_VARIANTS = None


def variant_size():
    """Parse the variant exceptions out of the game source. Cached."""
    global _VARIANTS
    if _VARIANTS is None:
        with open(SIZE_SRC) as fh:
            src = fh.read()
        _VARIANTS = _block(src, r'export const VARIANT_UNIT')
    return _VARIANTS


def scale_constants():
    """Parse the cap and the foot band, so this script cannot disagree."""
    global CAP, FOOT_MARGIN
    with open(SIZE_SRC) as fh:
        src = fh.read()
    for name, attr in (('ANIMAL_CANVAS_CAP', 'CAP'), ('ANIMAL_FOOT_BAND', 'FOOT_MARGIN')):
        m = re.search(r'export const ' + name + r'\s*=\s*([0-9.]+)', src)
        if not m:
            sys.exit(f'could not find {name} in {SIZE_SRC}')
        globals()[attr] = float(m.group(1))
    return CAP, FOOT_MARGIN


def target(stem, table, variants=None):
    """The share of its canvas this stem's subject should fill."""
    if variants is None:
        variants = variant_size()
    if stem in variants:
        return variants[stem] * CAP
    species = stem.split('-')[0]
    unit = table.get(species)
    if unit is None:
        return None
    return unit * CAP


def measure(path):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im)[:, :, 3]
    W, H = im.size
    mask = a > 8
    if not mask.any():
        return None
    ys = np.where(mask.any(axis=1))[0]
    xs = np.where(mask.any(axis=0))[0]
    return dict(W=W, H=H, x0=int(xs[0]), x1=int(xs[-1]), y0=int(ys[0]), y1=int(ys[-1]),
                bw=int(xs[-1] - xs[0] + 1), bh=int(ys[-1] - ys[0] + 1),
                area=int(mask.sum()), mask=mask)


def stray_blobs(mask, frac, stride=4):
    """Opaque islands larger than `frac` of the largest one. A second object.

    The mask is decimated by `stride` first — there is no scipy in this venv
    and a pure-python flood fill over 262144 pixels costs seconds a sprite.
    A second object big enough to matter survives a 4x decimation; a stray
    antialiased pixel does not, which is the point.
    """
    mask = mask[::stride, ::stride]
    lab = np.zeros(mask.shape, dtype=np.int32)
    nxt = 1
    sizes = {}
    H, W = mask.shape
    # Iterative flood fill — no scipy in this venv.
    for sy in range(0, H, 1):
        row = mask[sy]
        if not row.any():
            continue
        for sx in np.where(row)[0]:
            if lab[sy, sx]:
                continue
            stack = [(sy, int(sx))]
            lab[sy, sx] = nxt
            n = 0
            while stack:
                y, x = stack.pop()
                n += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = nxt
                        stack.append((ny, nx))
            sizes[nxt] = n
            nxt += 1
    if not sizes:
        return 0
    big = max(sizes.values())
    return sum(1 for n in sizes.values() if n != big and n > big * frac)


def check_drawn(path, name):
    m = measure(path)
    if m is None:
        return ['fully transparent']
    bad = []
    longest = max(m['bw'] / m['W'], m['bh'] / m['H'])
    if longest < MIN_DRAWN:
        bad.append(f'drawn small: long side {longest:.3f} of canvas, want >= {MIN_DRAWN}')
    if (m['x0'] < EDGE_PAD or m['y0'] < EDGE_PAD
            or m['x1'] > m['W'] - 1 - EDGE_PAD or m['y1'] > m['H'] - 1 - EDGE_PAD):
        bad.append(f'cropped: bbox ({m["x0"]},{m["y0"]})-({m["x1"]},{m["y1"]}) of {m["W"]}x{m["H"]}'
                   f' — Rule 8, nothing is shown cropped')
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im)[:, :, 3]
    corners = [a[0, 0], a[0, -1], a[-1, 0], a[-1, -1]]
    if max(int(c) for c in corners) > 8:
        bad.append(f'painted background: corner alpha {[int(c) for c in corners]} — Rule 2')
    n = stray_blobs(m['mask'], STRAY_FRAC)
    if n:
        bad.append(f'{n} separate object(s) beside the animal — no prop, no bowl, no cast shadow')
    return bad


def check_scale(path, name, table):
    stem, _, pose = name[:-4].rpartition('-')
    want = target(stem, table)
    m = measure(path)
    if m is None:
        return ['fully transparent']
    bad = []
    if (m['W'], m['H']) != (512, 512):
        bad.append(f'canvas {m["W"]}x{m["H"]}, want 512x512')
    if want is None:
        bad.append(f'no scale for species "{stem.split("-")[0]}" — add a rung to '
                   f'SPECIES_UNIT in packages/game-logic/src/animal-scale.ts')
        return bad
    longest = max(m['bw'] / m['W'], m['bh'] / m['H'])
    if abs(longest - want) > TOL:
        bad.append(f'scale {longest:.3f} of canvas, want {want:.3f} +/- {TOL}')
    foot = (m['H'] - 1 - m['y1']) / m['H']
    if abs(foot - FOOT_MARGIN) > TOL:
        bad.append(f'feet {foot:.3f} above the canvas floor, want {FOOT_MARGIN} +/- {TOL}'
                   f' — a row of canvases must stand on one ground line')
    cx = (m['x0'] + m['x1'] + 1) / 2 / m['W']
    if abs(cx - 0.5) > 0.03:
        bad.append(f'off centre: subject midline at {cx:.3f} of the width')
    return bad


# ── the bounds table the sprite layer draws from ──────────────────────────
#
# **This is what makes the scale system independent of the art.** The size a
# species is drawn at is set in `animal-scale.ts`, and `createAnimalSprite`
# applies it to the animal's *measured* bounds rather than to her canvas — so
# the 0.62-to-1.00 spread in how much of its file each sprite fills, and the
# pose-to-pose jitter inside one animal, both come out. The table below is how
# the sprite layer knows where the animal is inside her file.
#
# Emitted from the same measurement the checks use, so the table and the
# checker cannot disagree. `--check-bounds` is the gate: it re-measures and
# fails if the committed table has gone stale, which is the one way this
# system can silently break.

BOUNDS_HEADER = '''\
/**
 * Where the animal actually is inside each sprite file.
 *
 * **Generated — do not edit by hand.** Rebuild with:
 *
 *     python3 tools/check-sprite-scale.py --emit-bounds
 *
 * and CI fails if this file and the art disagree
 * (`--check-bounds`, wired in `.github/workflows/ci.yml`).
 *
 * Each row is `key canvasW canvasH x y w h`: the texture key, the file's own
 * size, and the opaque bounding box of the animal within it at alpha > 8.
 *
 * **Why the sprite layer needs this.** Every animal file is normalised to
 * fill its own canvas, so the canvas says nothing about how big the animal
 * is; `animal-scale.ts` says that. But *how much* of its canvas a sprite
 * fills runs from 0.62 to 1.00 across the 600 files, and varies pose to pose
 * within a single animal, so scaling the canvas leaves the animal changing
 * size when she changes mood. `createAnimalSprite` draws a Phaser frame cut
 * to the box below instead, which sets the animal's size outright: the
 * spread and the jitter both disappear, and `displayWidth` finally means the
 * animal rather than her transparent margin.
 *
 * A key missing from this table is not an error — the sprite layer falls
 * back to fitting the whole canvas, which is what every call site did before
 * the scale system. It is simply less exact.
 */
'''


def bounds_rows(src, names):
    """Measure the subject box of every sprite, for the generated table."""
    out = []
    for f, base in names:
        m = measure(os.path.join(src, f))
        if m is None:
            continue
        out.append((base[:-4], m['W'], m['H'], m['x0'], m['y0'], m['bw'], m['bh']))
    return sorted(out)


def bounds_source(rows):
    body = '\n'.join(' '.join(str(v) for v in r) for r in rows)
    return (
        BOUNDS_HEADER
        + '\nexport interface AnimalSpriteBounds {\n'
        + '  /** The file\'s own size, so a stale row can be spotted rather than drawn. */\n'
        + '  canvasW: number;\n  canvasH: number;\n'
        + '  /** The opaque bounding box of the animal within that canvas. */\n'
        + '  x: number;\n  y: number;\n  w: number;\n  h: number;\n}\n'
        + '\n/** `key canvasW canvasH x y w h`, one sprite per line. */\n'
        + 'const ROWS = `\n' + body + '\n`;\n'
        + '''
const BOUNDS: ReadonlyMap<string, AnimalSpriteBounds> = (() => {
  const map = new Map<string, AnimalSpriteBounds>();
  for (const line of ROWS.split('\\n')) {
    if (!line) continue;
    const [key, cw, ch, x, y, w, h] = line.split(' ');
    map.set(key, {
      canvasW: Number(cw), canvasH: Number(ch),
      x: Number(x), y: Number(y), w: Number(w), h: Number(h),
    });
  }
  return map;
})();

/** How many sprites the table describes. Used by the sprite-layer tests. */
export const ANIMAL_SPRITE_BOUNDS_COUNT = BOUNDS.size;

/**
 * The animal's own box inside this texture, or `undefined` when the texture
 * is not one of the measured animal sprites.
 */
export function animalSpriteBounds(textureKey: string): AnimalSpriteBounds | undefined {
  return BOUNDS.get(textureKey);
}
'''
    )


def load_known_failures(path):
    """Sprites already known to fail, with the reason, one per line."""
    if not os.path.exists(path):
        return {}
    out = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            name, _, why = line.partition(' ')
            out[name] = why.strip()
    return out


def collect(src, species=None):
    names = []
    for f in sorted(os.listdir(src)):
        if not f.endswith('.png'):
            continue
        base = f[:-8] + '.png' if f.endswith('-raw.png') else f
        stem, _, pose = base[:-4].rpartition('-')
        if pose not in POSES or not stem:
            continue
        if species and not (stem == species or stem.startswith(species + '-')):
            continue
        names.append((f, base))
    return names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--drafts', help='check raw generator output in this directory instead')
    ap.add_argument('--src', help='check installed-shape sprites in this directory '
                                  'instead of apps/game/public/assets/animals')
    ap.add_argument('--species')
    ap.add_argument('--verbose', action='store_true', help='print every sprite, not just failures')
    ap.add_argument('--json', help='write the measurements here')
    ap.add_argument('--emit-bounds', action='store_true',
                    help='rewrite apps/game/src/ui/animal-sprite-bounds.ts from the art')
    ap.add_argument('--check-bounds', action='store_true',
                    help='fail if that generated table and the art disagree')
    ap.add_argument('--gate', action='store_true',
                    help='what CI runs: the drawn checks plus --check-bounds, failing only '
                         'on a sprite that is not already in tools/sprite-scale-known-failures.txt')
    args = ap.parse_args()

    scale_constants()
    table = species_size()
    drawn = args.drafts is not None or args.gate
    src = args.drafts or args.src or ASSETS
    if not os.path.isabs(src):
        src = os.path.join(ROOT, src)

    names = collect(src, args.species)
    if not names:
        sys.exit(f'no sprites found in {src}')

    # ── the generated bounds table ───────────────────────────────────────
    if args.emit_bounds or args.check_bounds or args.gate:
        want = bounds_source(bounds_rows(src, names))
        if args.emit_bounds:
            with open(BOUNDS_TS, 'w') as fh:
                fh.write(want)
            print(f'bounds for {len(names)} sprites → {os.path.relpath(BOUNDS_TS, ROOT)}')
            if not (args.check_bounds or args.gate):
                return
        have = open(BOUNDS_TS).read() if os.path.exists(BOUNDS_TS) else ''
        if have != want:
            print(f'FAIL {os.path.relpath(BOUNDS_TS, ROOT)} does not match the art.')
            print('     The sprite layer cuts its Phaser frames from that table, so a stale')
            print('     row draws the wrong part of the file. Rebuild it with:')
            print('       python3 tools/check-sprite-scale.py --emit-bounds')
            sys.exit(1)
        print(f'bounds table matches the art ({len(names)} sprites)')
        if args.check_bounds and not args.gate:
            return

    known = load_known_failures(KNOWN_FAILURES) if args.gate else {}

    mode = 'DRAWN' if drawn else 'SCALE'
    print(f'{mode}: {len(names)} sprites in {src}')
    if not drawn:
        print(f'  cap {CAP}, foot margin {FOOT_MARGIN}, tolerance +/-{TOL}')

    failures = allowed = fixed = 0
    rows = []
    for f, base in names:
        path = os.path.join(src, f)
        bad = check_drawn(path, base) if drawn else check_scale(path, base, table)
        rows.append(dict(file=base, problems=bad))
        name = base[:-4]
        if bad and name in known:
            allowed += 1
            if args.verbose:
                print(f'  known {base}: {known[name]}')
            continue
        if not bad and name in known:
            fixed += 1
            print(f'  FIXED {base} now passes — drop it from '
                  f'{os.path.relpath(KNOWN_FAILURES, ROOT)}')
            continue
        if bad:
            failures += 1
            print(f'  FAIL {base}')
            for b in bad:
                print(f'       {b}')
        elif args.verbose:
            print(f'  ok   {base}')

    print(f'\n{len(names) - failures - allowed - fixed}/{len(names)} pass {mode}')
    if known:
        print(f'{allowed} known failure(s) allowed, from '
              f'{os.path.relpath(KNOWN_FAILURES, ROOT)}')
    if args.json:
        with open(args.json, 'w') as fh:
            json.dump(rows, fh, indent=1)
        print(f'measurements → {args.json}')
    sys.exit(1 if failures or fixed else 0)


if __name__ == '__main__':
    main()
