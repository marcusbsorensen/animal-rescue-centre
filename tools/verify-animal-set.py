#!/usr/bin/env python3
"""verify-animal-set.py — is every animal drawn in every pose, and is each
sprite actually usable?

    python3 tools/verify-animal-set.py           # summary
    python3 tools/verify-animal-set.py --all     # every row, not just problems
    python3 tools/verify-animal-set.py --json    # machine-readable

Two questions, because they fail differently.

**Completeness** is measured against `SPECIES_VARIANTS` in
`packages/game-logic/src/animals.ts`, parsed from the source rather than
retyped here. Measuring the folder against itself is what let the hedgehog
hole hide: all six of its declared variants had zero sprites, every
hedgehog fell back to the species-level art, and a listing of the folder
looked complete because the fallback was there.

**Health** is per file. A sprite that exists but is fully opaque, or is a
transparent square with nothing in it, passes a completeness check and
still breaks the game.
"""
import argparse
import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'apps/game/public/assets/animals')
ANIMALS_TS = os.path.join(ROOT, 'packages/game-logic/src/animals.ts')

POSES = ['arriving', 'sheltered', 'eating', 'sleeping', 'walking',
         'playing', 'sick', 'scared', 'grumpy', 'growling']

# Species that exist only inside the garden tunnel. They have no entry in
# SPECIES_VARIANTS because they are never sheltered animals — tunnel.ts
# names them directly.
TUNNEL_ONLY = ['raccoon', 'skunk']

# Coverage bounds: the fraction of the canvas the animal fills. Below the
# floor the cut-out ate the subject; above the ceiling the matte failed and
# we kept the background.
MIN_COVER, MAX_COVER = 0.02, 0.85


def declared_variants():
    """Parse SPECIES_VARIANTS out of animals.ts, so this cannot drift."""
    src = open(ANIMALS_TS, encoding='utf-8').read()
    m = re.search(r'SPECIES_VARIANTS:\s*Record<Species,\s*string\[\]>\s*=\s*\{(.*?)\n\};',
                  src, re.S)
    if not m:
        sys.exit('could not find SPECIES_VARIANTS in animals.ts — has it moved?')
    out = {}
    for sp, body in re.findall(r"(\w+):\s*\[([^\]]*)\]", m.group(1)):
        out[sp] = re.findall(r"'([^']+)'", body)
    return out


def health(path):
    """Returns (ok, note). Cheap checks only — this runs over 500+ files."""
    try:
        im = Image.open(path)
    except Exception as e:
        return False, f'unreadable ({e.__class__.__name__})'
    im = im.convert('RGBA')
    w, h = im.size
    alpha = im.getchannel('A')
    lo, hi = alpha.getextrema()
    if hi == 0:
        return False, 'fully transparent — nothing drawn'
    if lo == 255:
        return False, 'fully opaque — background was never matted out'
    # Corners opaque means a painted background survived the cut-out.
    corners = [alpha.getpixel(p) for p in
               ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    if min(corners) > 32:
        return False, 'opaque corners — background not removed'
    hist = alpha.histogram()
    cover = sum(hist[128:]) / float(w * h)
    if cover < MIN_COVER:
        return False, f'subject fills only {cover:.1%} — cut-out ate it'
    if cover > MAX_COVER:
        return False, f'subject fills {cover:.1%} — matte likely failed'
    return True, f'{w}x{h} · {cover:.0%} cover'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--all', action='store_true', help='list every sprite, not just problems')
    ap.add_argument('--json', action='store_true', help='machine-readable output')
    ap.add_argument('--skip-health', action='store_true', help='completeness only (fast)')
    args = ap.parse_args()

    variants = declared_variants()

    # Every key the game can ask for: species-level fallback, each declared
    # variant, and the tunnel-only pair.
    keys = []
    for sp, vs in variants.items():
        keys.append((sp, sp, 'fallback'))
        keys.extend((sp, f'{sp}-{v}', 'variant') for v in vs)
    keys.extend((sp, sp, 'tunnel') for sp in TUNNEL_ONLY)

    missing, unhealthy, rows = [], [], []
    for species, stem, kind in sorted(keys):
        gaps, notes = [], []
        for pose in POSES:
            path = os.path.join(ASSETS, f'{stem}-{pose}.png')
            if not os.path.exists(path):
                gaps.append(pose)
                continue
            if not args.skip_health:
                ok, note = health(path)
                if not ok:
                    unhealthy.append((f'{stem}-{pose}.png', note))
                    notes.append(f'{pose}: {note}')
        if gaps:
            missing.append((stem, kind, gaps))
        rows.append({'stem': stem, 'species': species, 'kind': kind,
                     'missing': gaps, 'unhealthy': notes})

    if args.json:
        print(json.dumps({'rows': rows,
                          'missing_total': sum(len(g) for _, _, g in missing),
                          'unhealthy_total': len(unhealthy)}, indent=2))
        return 0 if not missing and not unhealthy else 1

    expected = len(keys) * len(POSES)
    gap_total = sum(len(g) for _, _, g in missing)
    print(f'{len(keys)} sprite sets × {len(POSES)} poses = {expected} expected')
    print(f'{expected - gap_total} present · {gap_total} missing · {len(unhealthy)} unhealthy\n')

    if args.all:
        for r in rows:
            mark = '✗' if r['missing'] else ('!' if r['unhealthy'] else '✓')
            print(f"  {mark} {r['stem']:26} {r['kind']:9} "
                  f"{10 - len(r['missing'])}/10")

    if missing:
        print('MISSING')
        for stem, kind, gaps in missing:
            shown = 'ALL TEN' if len(gaps) == len(POSES) else ' '.join(gaps)
            print(f'  {stem:26} ({kind:8}) {shown}')
        print()
    if unhealthy:
        print('UNHEALTHY')
        for name, note in unhealthy:
            print(f'  {name:34} {note}')
        print()
    if not missing and not unhealthy:
        print('Every animal has every pose, and every sprite is a usable cut-out.')
    return 0 if not missing and not unhealthy else 1


if __name__ == '__main__':
    sys.exit(main())
