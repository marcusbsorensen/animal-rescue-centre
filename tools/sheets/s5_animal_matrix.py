"""Sheet 5 — every variant of a species against every pose.

    python3 tools/sheets/s5_animal_matrix.py                # today's work
    python3 tools/sheets/s5_animal_matrix.py cat dog        # any species
    python3 tools/sheets/s5_animal_matrix.py --all          # all of them

A matrix is the only way to see a pose set as a set: a drift in one cell
is invisible on its own and obvious in a row. Cells are outlined when the
file is missing and flagged when `verify-animal-set.py` would call it
unhealthy, so this sheet and that audit never disagree.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw
from sheet import *

sys.path.insert(0, os.path.join(REPO, 'tools'))
from importlib.machinery import SourceFileLoader
_v = SourceFileLoader('verify_animal_set',
                      os.path.join(REPO, 'tools/verify-animal-set.py')).load_module()

AN = os.path.join(REPO, 'apps/game/public/assets/animals')
POSES = _v.POSES
VARIANTS = _v.declared_variants()

# What today's run touched. `--all` overrides.
DEFAULT = ['hedgehog', 'raccoon', 'skunk']

args = [a for a in sys.argv[1:] if not a.startswith('-')]
if '--all' in sys.argv:
    species = list(VARIANTS) + _v.TUNNEL_ONLY
elif args:
    species = args
else:
    species = DEFAULT


def stems_for(sp):
    """Species-level fallback first, then each declared variant."""
    if sp in _v.TUNNEL_ONLY:
        return [(sp, 'tunnel-only')]
    return [(sp, 'species fallback')] + [(f'{sp}-{v}', v) for v in VARIANTS.get(sp, [])]


W, PAD = 2400, 64
CW = W - PAD * 2
LABEL_W = 250
CELL = (CW - LABEL_W) // len(POSES)
ROW_H = CELL + 30

blocks = [(sp, stems_for(sp)) for sp in species]
total_rows = sum(len(s) for _, s in blocks)
H = 300 + sum(110 + len(s) * ROW_H + 40 for _, s in blocks) + 210 + 150

sheet = new_sheet(W, H)
d = ImageDraw.Draw(sheet)

y = header(sheet, 'Every variant, every pose', [
    'One row per character, one column per pose. A drift in a single sprite is invisible on its own and obvious in a row.',
    f'{total_rows} characters × {len(POSES)} poses. An outlined cell is a missing file; a flagged one fails the health check.',
], 'A.R.C.  ·  contact sheet 5  ·  regenerate with tools/sheets/s5_animal_matrix.py', W)

missing_n = bad_n = 0

for sp, stems in blocks:
    y = section(sheet, y, sp.capitalize(), W,
                sub=f'{len(stems)} character{"s" if len(stems) != 1 else ""} · '
                    f'{"declared in SPECIES_VARIANTS" if sp in VARIANTS else "named directly by tunnel.ts"}')
    # column headings
    for i, p in enumerate(POSES):
        cx = PAD + LABEL_W + i * CELL
        d.text((cx + CELL / 2 - text_w(d, p, font('m', 17)) / 2, y - 24), p,
               font=font('m', 17), fill=HAIRLINE)

    for r, (stem, label) in enumerate(stems):
        ry = y + r * ROW_H
        if r % 2 == 0:
            d.rounded_rectangle([PAD, ry, PAD + CW, ry + ROW_H - 8], radius=12, fill=PAPER_ALT)
        d.text((PAD + 16, ry + CELL / 2 - 26), label, font=font('r', 25, 'Bold'), fill=INK)
        d.text((PAD + 16, ry + CELL / 2 + 4), stem, font=font('m', 16), fill=HAIRLINE)

        for i, p in enumerate(POSES):
            cx = PAD + LABEL_W + i * CELL
            path = os.path.join(AN, f'{stem}-{p}.png')
            if not os.path.exists(path):
                missing_n += 1
                d.rounded_rectangle([cx + 8, ry + 8, cx + CELL - 8, ry + CELL - 8],
                                    radius=10, outline=MISSING, width=3)
                m = 'missing'
                d.text((cx + CELL / 2 - text_w(d, m, font('r', 17, 'Bold')) / 2,
                        ry + CELL / 2 - 9), m, font=font('r', 17, 'Bold'), fill=MISSING)
                continue
            paste_fit(sheet, load(path), cx + CELL / 2, ry + CELL / 2, CELL - 18, CELL - 18)
            ok, _note = _v.health(path)
            if not ok:
                bad_n += 1
                d.rounded_rectangle([cx + 6, ry + 6, cx + CELL - 6, ry + CELL - 6],
                                    radius=10, outline=MISSING, width=4)
                tag(d, cx + 10, ry + 10, '!', MISSING, size=15, pad_x=8)
    y += len(stems) * ROW_H + 40

# ── the standing note ──
d.rounded_rectangle([PAD, y, PAD + CW, y + 210], radius=16,
                    fill=(247, 241, 228), outline=NOTE, width=3)
d.text((PAD + 30, y + 22), 'Reading this sheet', font=font('r', 30, 'Bold'), fill=NOTE)
lines = [
    'Scan along a ROW for character drift — the same animal should be recognisably itself in all ten poses. Scan down a '
    'COLUMN for pose drift: every animal in a column',
    'should be doing the same thing, facing the same way. A column that disagrees with itself is a prompt problem, not '
    'an art problem, and is fixed in the pose_rule table.',
    '',
    f'This run: {missing_n} missing, {bad_n} failing the health check. '
    '`python3 tools/verify-animal-set.py` prints the same two numbers with reasons.',
]
for i, line in enumerate(lines):
    d.text((PAD + 30, y + 68 + i * 34), line, font=font('t', 21), fill=INK_SOFT)

footer(sheet, W, H,
       'source  apps/game/public/assets/animals  ·  variants parsed from '
       'packages/game-logic/src/animals.ts SPECIES_VARIANTS  ·  health from tools/verify-animal-set.py')

name = 'sheet-5-animal-matrix.png' if len(species) > 1 else f'sheet-5-{species[0]}-matrix.png'
save(sheet, out_path(name))
