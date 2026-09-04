"""Sheet 2 — the vehicle set, in its three views."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw
from sheet import *

W, PAD = 2400, 64
CW = W - PAD * 2
TD = os.path.join(REPO, 'apps/game/public/assets/driving/topdown')

# key, name, id, slots, fuel, unlock, note
FLEET = [
    ('trikey',    'Trikey',    'pedal-trike',      2, 0,  0,  'Pedal power — free to run, slow in top gear.'),
    ('henry',     'Henry',     'small-van',        4, 5,  2,  'The default van. Heart-paw badge on the rear doors.'),
    ('bea',       'Bea',       'long-van',         6, 10, 5,  'Re-rendered flat after the strong-3/4 version read as driving diagonally.'),
    ('big-tilly', 'Big Tilly', 'animal-lorry',     9, 20, 10, 'Nine crates, three by three.'),
    ('spark',     'Spark',     'electric-minibus', 6, 5,  12, 'Electric — cheap to run for its size.'),
]

TRAFFIC = [
    ('car-red', 'Car (red)'), ('car-blue', 'Car (blue)'), ('car-yellow', 'Car (yellow)'),
    ('pickup', 'Pickup'), ('truck', 'Truck'),
    ('tractor', 'Tractor (green)'), ('tractor-red', 'Tractor (red)'), ('tractor-blue', 'Tractor (blue)'),
    ('ambulance', 'Ambulance'), ('fireengine', 'Fire engine'),
    ('bus', 'Open-top bus'), ('binlorry', 'Bin lorry'), ('motorbike', 'Motorbike'),
]

SKIP = [('skiptruck-empty', 'empty'), ('skiptruck-1', 'load 1'), ('skiptruck-2', 'load 2'),
        ('skiptruck-3', 'load 3'), ('skiptruck-4', 'load 4'), ('skiptruck-5', 'load 5')]


def has(key):
    return os.path.exists(os.path.join(TD, f'vehicle-topdown-{key}.png'))


def art(key):
    return load(os.path.join(TD, f'vehicle-topdown-{key}.png'))


# ── measure ──
ROW_H = 460
VIEW_W = 330            # each of the three fleet view columns
NAME_W = 330
SIDE_W = 700            # the side view is landscape and wants the room
TRAF_COLS = 7
TRAF_W = (CW - (TRAF_COLS - 1) * 20) // TRAF_COLS
TRAF_H = 300
SKIP_W = (CW - 5 * 20) // 6
SKIP_H = 260

H = (300
     + 110 + 60 + 5 * ROW_H + 60            # fleet
     + 110 + 2 * (TRAF_H + 24) + 90         # traffic
     + 110 + SKIP_H + 60                    # skip loads
     + 200 + 150)                           # findings + footer

sheet = new_sheet(W, H)
d = ImageDraw.Draw(sheet)

y = header(sheet, 'The fleet, and everything else on the road', [
    'Every vehicle is one flat top-down view with a slight forward bias, plus a rear view for driving away.',
    'The player always sees the back of their own van; oncoming traffic shows its face.',
], 'A.R.C.  ·  contact sheet 2 of 4  ·  2026-09-04  ·  sprites at source resolution, contained not stretched', W)

# ── A. the fleet ──
y = section(sheet, y, 'The A.R.C. fleet, in three views', W,
            sub='Above / front-bias (parked, picker, oncoming)  ·  Above / rear (driving away)  ·  Side (pulling up and parking).')

# column headings
cx0 = PAD + NAME_W
heads = [('above · front bias', VIEW_W), ('above · rear', VIEW_W), ('side · pulling in', SIDE_W)]
hx = cx0
for lab, w in heads:
    d.text((hx + w // 2 - text_w(d, lab, font('m', 21)) // 2, y), lab, font=font('m', 21), fill=HAIRLINE)
    hx += w + 20
y += 44

for i, (key, name, vid, slots, fuel, lvl, note) in enumerate(FLEET):
    ry = y + i * ROW_H
    if i % 2 == 0:
        d.rounded_rectangle([PAD, ry, PAD + CW, ry + ROW_H - 16], radius=16, fill=PAPER_ALT)

    # name block
    d.text((PAD + 24, ry + 40), name, font=font('r', 44, 'Heavy'), fill=INK)
    d.text((PAD + 24, ry + 96), vid, font=font('m', 21), fill=HAIRLINE)
    tags_h = tag_row(d, PAD + 24, ry + 134, [
        (f'{slots} crates', HUE['care']),
        ('free' if fuel == 0 else f'{fuel} coins', HUE['walk']),
        ('from the start' if lvl == 0 else f'level {lvl}',
         GOOD if lvl == 0 else (176, 160, 136)),
    ], NAME_W - 40)

    for j, line in enumerate(wrap_text(d, note, font('t', 20), NAME_W - 40)):
        d.text((PAD + 24, ry + 142 + tags_h + j * 28), line, font=font('t', 20), fill=INK_SOFT)

    # the three views
    box_h = ROW_H - 90
    vx = cx0
    for view, w in [('', VIEW_W), ('-rear', VIEW_W), ('-side', SIDE_W)]:
        k = key + view
        cell_cx = vx + w / 2
        if has(k):
            paste_fit(sheet, art(k), cell_cx, ry + ROW_H / 2 - 24, w - 40, box_h, shadow=True)
        else:
            d.rounded_rectangle([vx + 30, ry + 60, vx + w - 30, ry + ROW_H - 76],
                                radius=14, outline=(200, 172, 160), width=3)
            msg = 'not drawn'
            d.text((cell_cx - text_w(d, msg, font('r', 26, 'Bold')) / 2, ry + ROW_H / 2 - 40),
                   msg, font=font('r', 26, 'Bold'), fill=MISSING)
            sub = 'no side view'
            d.text((cell_cx - text_w(d, sub, font('m', 19)) / 2, ry + ROW_H / 2 - 4),
                   sub, font=font('m', 19), fill=(200, 172, 160))
        vx += w + 20

y += 5 * ROW_H + 60

# ── B. traffic ──
y = section(sheet, y, 'Traffic', W,
            sub='Same-direction traffic draws the rear sprite at angle 0; oncoming draws the front as-is. '
                'A vehicle with no rear keeps the old single-sprite 180° flip.')
for i, (key, label) in enumerate(TRAFFIC):
    col, row = i % TRAF_COLS, i // TRAF_COLS
    cx = PAD + col * (TRAF_W + 20)
    cy = y + row * (TRAF_H + 24)
    d.rounded_rectangle([cx, cy, cx + TRAF_W, cy + TRAF_H], radius=14,
                        fill=PAPER_ALT, outline=HAIRLINE, width=2)
    half = (TRAF_W - 30) / 2
    paste_fit(sheet, art(key), cx + 15 + half / 2, cy + TRAF_H / 2 - 22, half, TRAF_H - 96)
    if has(key + '-rear'):
        paste_fit(sheet, art(key + '-rear'), cx + 15 + half * 1.5, cy + TRAF_H / 2 - 22, half, TRAF_H - 96)
    else:
        d.rounded_rectangle([cx + 15 + half + 12, cy + 26, cx + TRAF_W - 18, cy + TRAF_H - 62],
                            radius=10, outline=(200, 172, 160), width=3)
        m = 'no rear'
        d.text((cx + 15 + half * 1.5 - text_w(d, m, font('r', 20, 'Bold')) / 2, cy + TRAF_H / 2 - 40),
               m, font=font('r', 20, 'Bold'), fill=MISSING)
    d.text((cx + 15, cy + TRAF_H - 48), label, font=font('r', 23, 'Bold'), fill=INK)
    d.text((cx + 15, cy + TRAF_H - 22), 'front · rear' if has(key + '-rear') else 'front only',
           font=font('m', 17), fill=HAIRLINE)
y += 2 * (TRAF_H + 24) + 60

# ── C. skip loads ──
y = section(sheet, y, 'The skip truck, loaded', W,
            sub='One vehicle, six load states — the skip fills as the supply run goes on.')
for i, (key, label) in enumerate(SKIP):
    cx = PAD + i * (SKIP_W + 20)
    d.rounded_rectangle([cx, y, cx + SKIP_W, y + SKIP_H], radius=14,
                        fill=PAPER_ALT, outline=HAIRLINE, width=2)
    paste_fit(sheet, art(key), cx + SKIP_W / 2, y + SKIP_H / 2 - 20, SKIP_W - 50, SKIP_H - 80)
    d.text((cx + 16, y + SKIP_H - 42), label, font=font('r', 24, 'Bold'), fill=INK)
y += SKIP_H + 60

# ── findings ──
d.rounded_rectangle([PAD, y, PAD + CW, y + 200], radius=16,
                    fill=(247, 241, 228), outline=NOTE, width=3)
d.text((PAD + 30, y + 22), 'Two gaps this sheet makes visible', font=font('r', 30, 'Bold'), fill=NOTE)
for i, line in enumerate([
    'The three Henry side sprites — `-side`, `-side-left`, `-side-right` — are not referenced anywhere in the app. '
    'Nothing preloads them, so the pull-in and the parked van in the bay both draw the',
    'top-down front sprite instead. The side view is art with no call site, which is the same shape of problem '
    '`openDriveOverlay` is. The other four fleet vehicles have no side view drawn at all.',
    '',
    'The open-top bus was on the 2026-07-10 flagged list for a rear view and never got one, so it is the one piece '
    'of same-direction traffic still spinning its own face round to drive away.',
]):
    d.text((PAD + 30, y + 68 + i * 32), line, font=font('t', 21), fill=INK_SOFT)

footer(sheet, W, H,
       'source  apps/game/public/assets/driving/topdown/vehicle-topdown-*.png  ·  '
       'packages/game-logic/src/crate-stacking.ts VEHICLE_DEFS  ·  apps/game/src/scenes/PtvDriveScene.ts makeVan')

save(sheet, out_path('sheet-2-vehicles.png'))
