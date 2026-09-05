"""Sheet 6 — style drift across the animal set, measured against one sprite.

    python3 tools/audit-animal-style.py --json /tmp/style.json
    python3 tools/sheets/s6_style_audit.py /tmp/style.json

Marcus, 2026-09-05, named the target and the axes: the snake's key line,
shading, texture and level of detail. This sheet ranks all sixty characters
against it and shows the numbers next to the art, because a style audit
whose evidence you cannot see is just an assertion with decimals.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
from sheet import *

AN = os.path.join(REPO, 'apps/game/public/assets/animals')
data = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'style.json'))
STEMS, FILES = data['stems'], data['files']
REF_FILE = data['reference']

W, PAD = 2400, 64
CW = W - PAD * 2


def pick(stem, prefer=('sheltered', 'walking', 'arriving')):
    for p in prefer:
        f = f'{stem}-{p}.png'
        if os.path.exists(os.path.join(AN, f)):
            return f
    return f'{stem}-sheltered.png'


rank = sorted(STEMS.items(), key=lambda kv: -kv[1]['distance'])
dmin = min(v['distance'] for _, v in rank)
dmax = max(v['distance'] for _, v in rank)


def heat(dv):
    """Cream → rust, by distance. Colour is decoration; the number carries it."""
    t = (dv - dmin) / max(1e-6, dmax - dmin)
    return (int(246 - 60 * t), int(239 - 130 * t), int(227 - 150 * t))


COLS = 8
CELL_W = (CW - (COLS - 1) * 14) // COLS
CELL_H = CELL_W + 62
ROWS_N = (len(rank) + COLS - 1) // COLS

INC = sorted(STEMS.items(), key=lambda kv: -kv[1]['internal_spread'])[:3]
POSES = ['arriving', 'sheltered', 'eating', 'sleeping', 'walking',
         'playing', 'sick', 'scared', 'grumpy', 'growling']
PW = (CW - 250) // len(POSES)
PROW_H = PW + 26

H = (400
     + 130 + 300                                  # the reference
     + 130 + ROWS_N * (CELL_H + 14) + 40          # the ranking
     + 130 + len(INC) * (PROW_H + 46) + 40        # incoherent characters
     + 130 + 300                                  # backdrop
     + 380 + 150)

sheet = new_sheet(W, H)
d = ImageDraw.Draw(sheet)

y = header(sheet, 'Style drift across the animal set', [
    'Sixty characters, six hundred sprites, measured against one reference on the four axes Marcus named:',
    'key line · shading · texture · level of detail. Distance is in standard deviations across the whole set — the ranking is the point, not the number.',
    'Shading and saturation are measured but excluded from the distance: a coiled snake has little large-scale luminance variation whatever hand drew it, and a macaw is',
    'saturated because macaws are. Those two axes describe the subject, not the drawing. The ranking was then checked by eye against six sprites before being trusted.',
], f'A.R.C.  ·  contact sheet 6  ·  2026-09-05  ·  reference {REF_FILE}  ·  tools/audit-animal-style.py', W)

# ── the reference ──
y = section(sheet, y, 'The target', W,
            sub='Every sprite below is scored by how far it sits from this one.')
ref_stem = REF_FILE[:-4].rsplit('-', 1)[0]
paste_fit(sheet, load(os.path.join(AN, REF_FILE)), PAD + 150, y + 130, 280, 250)
tx = PAD + 330
d.text((tx, y + 20), REF_FILE, font=font('r', 40, 'Heavy'), fill=INK)
d.text((tx, y + 74), 'Naturalistic and painted: a fine variable ink line rather than a uniform stroke, real scale',
       font=font('t', 23), fill=INK_SOFT)
d.text((tx, y + 106), 'texture, form modelled in muted olives, and no cartoon eye. This is the register.',
       font=font('t', 23), fill=INK_SOFT)
rr = data['ref_raw']
labels = [('key line', 'rim_contrast'), ('ink depth', 'ink_darkness'),
          ('texture', 'detail'), ('detail (native)', 'detail_native'),
          ('shading', 'modelling'), ('saturation', 'sat_mean')]
for i, (lab, k) in enumerate(labels):
    bx = tx + (i % 3) * 340
    by = y + 150 + (i // 3) * 66
    d.text((bx, by), lab, font=font('m', 18), fill=HAIRLINE)
    d.text((bx, by + 22), f'{rr[k]:.3f}', font=font('r', 30, 'Bold'), fill=INK)
y += 300

# ── the ranking ──
y = section(sheet, y, 'Every character, furthest first', W,
            sub='Warmer cell = further from the reference. One sprite per character; the full per-pose numbers are in the JSON.')
for i, (stem, v) in enumerate(rank):
    cx = PAD + (i % COLS) * (CELL_W + 14)
    cy = y + (i // COLS) * (CELL_H + 14)
    d.rounded_rectangle([cx, cy, cx + CELL_W, cy + CELL_H], radius=14,
                        fill=heat(v['distance']), outline=HAIRLINE, width=2)
    f = pick(stem)
    p = os.path.join(AN, f)
    if os.path.exists(p):
        paste_fit(sheet, load(p), cx + CELL_W / 2, cy + (CELL_W) / 2 + 6, CELL_W - 26, CELL_W - 30)
    d.text((cx + 10, cy + CELL_W + 6), stem[:22], font=font('r', 20, 'Bold'), fill=INK)
    d.text((cx + 10, cy + CELL_W + 32), f'{v["distance"]:.2f}σ · {v["px"]}px',
           font=font('m', 16), fill=INK_SOFT)
    tag(d, cx + CELL_W - 54, cy + 8, f'{i + 1}', (120, 104, 86), size=15, pad_x=7)
y += ROWS_N * (CELL_H + 14) + 40

# ── characters that disagree with themselves ──
y = section(sheet, y, 'One character, several styles', W,
            sub='Distance to the reference is only half of it. These three disagree with THEMSELVES across their own ten poses — '
                'which is how the reference turned out to be three styles in one folder.')
for stem, v in INC:
    d.text((PAD, y + PW / 2 - 26), stem, font=font('r', 28, 'Bold'), fill=INK)
    d.text((PAD, y + PW / 2 + 6), f'spread {v["internal_spread"]:.2f}σ',
           font=font('m', 18), fill=MISSING)
    for i, p in enumerate(POSES):
        f = os.path.join(AN, f'{stem}-{p}.png')
        cx = PAD + 250 + i * PW
        d.rounded_rectangle([cx, y, cx + PW - 6, y + PW], radius=10,
                            fill=PAPER_ALT, outline=HAIRLINE, width=2)
        if os.path.exists(f):
            paste_fit(sheet, load(f), cx + (PW - 6) / 2, y + PW / 2, PW - 26, PW - 26)
            fd = FILES.get(f'{stem}-{p}.png', {}).get('distance')
            if fd is not None:
                d.text((cx + 8, y + PW - 24), f'{fd:.1f}', font=font('m', 15), fill=INK_SOFT)
        d.text((cx + 8, y + PW + 4), p, font=font('m', 14), fill=HAIRLINE)
    y += PROW_H + 46

# ── the backdrop ──
y = section(sheet, y, 'Ground painted into the sprite', W,
            sub='A cut-out animal leaves most of its bounding box empty. A painted backdrop card has straight, opaque edges.')
bds = data.get('backdrops', [])
if bds:
    b = bds[0]
    paste_fit(sheet, load(os.path.join(AN, b['file'])), PAD + 140, y + 110, 250, 220)
    d.text((PAD + 320, y + 16), b['file'], font=font('r', 34, 'Heavy'), fill=MISSING)
    for i, line in enumerate([
        f"{b['bbox_border']:.0%} of its bounding-box border is opaque and it fills {b['bbox_fill']:.0%} of the box — "
        "a grey card painted behind the snake and its carrying box.",
        "It passes the health check in `verify-animal-set.py`, because the corners are transparent and the coverage is under",
        "that check's ceiling. It still breaks the rule the whole sprite pipeline is built on: the game composites these over",
        "corridor boards, garden grass and tarmac, and a painted grey ground clashes with every one of them.",
        "",
        "It is the only sprite in six hundred that fails this test.",
    ]):
        d.text((PAD + 320, y + 74 + i * 34), line, font=font('t', 21), fill=INK_SOFT)
y += 300

# ── what the numbers say ──
d.rounded_rectangle([PAD, y, PAD + CW, y + 380], radius=16,
                    fill=(247, 241, 228), outline=NOTE, width=3)
d.text((PAD + 30, y + 22), 'What the audit found', font=font('r', 30, 'Bold'), fill=NOTE)
worst = rank[0]
best = rank[-1]
import statistics as _st
_ds = sorted(v['distance'] for v in STEMS.values())
_near = sum(1 for x in _ds if x <= 2.5)
_gap = max(_ds[i + 1] - _ds[i] for i in range(len(_ds) - 1))
for i, line in enumerate([
    f"The spread is {best[1]['distance']:.2f}σ to {worst[1]['distance']:.2f}σ, median {_st.median(_ds):.2f}. "
    f"Only {_near} of {len(_ds)} characters sit within 2.5σ of the target, and the largest",
    f"gap anywhere in the ranking is {_gap:.2f}σ — there is no clean break. The set is a gradient, not two camps, so "
    "'fix the outliers' will not converge on anything.",
    "",
    "The target register is very nearly unoccupied. What the snake has — a fine variable line, real surface texture, muted "
    "colour and no glossy cartoon eye — almost nothing else",
    "in six hundred sprites has. The closest are `bat-longeared`, `cat-grey` and `dog-chocolate`, and they are close by being "
    "restrained rather than by being naturalistic.",
    "",
    "And the reference character is not one style. `snake` has an internal spread of 2.21σ: its ten poses hold a naturalistic "
    "painted snake, a bright lime chibi with blushed cheeks,",
    "and one flat green worm. `snake-garter` and `cat` are the same story. Whichever sprite is the target, most of that "
    "character's own siblings are not it.",
]):
    d.text((PAD + 30, y + 68 + i * 34), line, font=font('t', 21), fill=INK_SOFT)

footer(sheet, W, H,
       'measurements  tools/audit-animal-style.py  ·  600 sprites, 60 characters  ·  '
       'subject normalised to 256px tall before measuring, so style rather than resolution is compared')

save(sheet, out_path('sheet-6-style-audit.png'))
