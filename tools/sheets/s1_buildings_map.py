"""Sheet 1 — the buildings, and the map as it stands."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw
from sheet import *

W, PAD = 2400, 64
CW = W - PAD * 2

UX = 'apps/game/e2e/__ux__'
TD = 'apps/game/public/assets/driving/topdown'

# id, label, art, kind, unlock, distance, fx, fy, note
DEST = [
    ('arc', 'A.R.C.', 'site-arc-building.png', 'adoption-home', 0, 0, .1811, .3541,
     'Home base. Seeded from the real OSM plot.'),
    ('vet', 'Bay Road Vets', 'site-vet-building.png', 'vet-general', 0, 6, .47, .44,
     'Never locked — a poorly animal can arrive on day one.'),
    ('village-hall', 'Village Hall', 'site-village-hall-building.png', 'village-hall', 0, 5, .33, .55,
     'Never locked — Social used to be a permanent tab.'),
    ('bramble-farm', 'Bramble Farm', 'site-bramble-farm-building.png', 'supply-run', 0, 12, .18, .80,
     'Hay, straw, feed, bedding.'),
    ('cove-harbour', 'Cove Harbour', 'site-cove-harbour-building.png', 'supply-run', 5, 18, .11, .52,
     'Fresh fish from the dockside market.'),
    ('pinebark-medical', 'Pinebark Medical', 'site-pinebark-medical-building.png', 'supply-run', 10, 24, .72, .55,
     'Bandages, medicines, vet supplies.'),
    ('moorland', 'Moorland', 'site-moorland-place.png', 'rewilding-habitat', 3, 28, .08, .68,
     'fox'),
    ('woodland', 'Woodland', 'site-woodland-place.png', 'rewilding-habitat', 3, 16, .80, .88,
     'bunny · hedgehog · squirrel'),
    ('sea-cliffs', 'Sea Cliffs', 'site-sea-cliffs-place.png', 'rewilding-habitat', 6, 34, .88, .34,
     'parrot · seabird'),
    ('deep-forest', 'Deep Forest', 'site-deep-forest-place.png', 'rewilding-habitat', 8, 40, .96, .72,
     'bat'),
    ('wetlands', 'Wetlands', 'site-wetlands-place.png', 'rewilding-habitat', 9, 22, .45, .88,
     'snake'),
]

KIND_HUE = {
    'adoption-home': HUE['home'],
    'vet-general': (168, 88, 96),
    'village-hall': HUE['map'],
    'supply-run': HUE['walk'],
    'rewilding-habitat': HUE['care'],
}

MAPS = [
    (f'{UX}/tmp-map/10-level-0.png', 'Level 0', 'Four pins. A.R.C., the vet, the hall, Bramble Farm.'),
    (f'{UX}/tmp-map/10-level-5.png', 'Level 5', 'Cove Harbour and the first two habitats are in reach.'),
    (f'{UX}/tmp-map/10-level-10.png', 'Level 10', 'All ten. The extent is `contain`, so the reach reads in the zoom.'),
]

BEATS = [
    (f'{UX}/tmp-map/02-card-vet.png', 'A tap opens a card', 'Name, what is inside, how far. Then "Drive here!".'),
    (f'{UX}/tmp-map/03-card-locked.png', 'A locked pin says *when*', 'Not "no" — the level it opens at.'),
    (f'{UX}/tmp-map/04-drive-picker.png', 'The drive picker', 'Title line, chrome unlock chips, the building behind its car park.'),
    (f'{UX}/tmp-arrivals/vet.png', 'The arrival is a beat', 'The van comes off the road and parks in front of the building.'),
]

# ── measure ──
MAP_W = (CW - 2 * 28) // 3
MAP_H = int(MAP_W * 402 / 874)
BEAT_W = (CW - 3 * 22) // 4
BEAT_H = int(BEAT_W * 402 / 874)
TILE_W = (CW - 3 * 24) // 4
ART_H, META_H = 400, 176
TILE_H = ART_H + META_H

NOTE_H = 150
H = (300 + 100 + MAP_H + 96 + 100 + BEAT_H + 100 + 100
     + 3 * TILE_H + 2 * 24 + 40 + NOTE_H + 170)
sheet = new_sheet(W, H)
d = ImageDraw.Draw(sheet)

y = header(sheet, 'Buildings, and the map as it stands', [
    'Every pin is a place; tapping one drives there; arriving opens what is inside.',
    'Eleven destinations, eleven pieces of art — six buildings as flat elevations, five habitats as vignettes.',
], 'A.R.C.  ·  contact sheet 1 of 4  ·  2026-09-04  ·  captures at the app\'s own 874×402', W)

# ── A. the map ──
y = section(sheet, y, 'The map, at three reaches', W,
            sub='Screenshots, not mock-ups. `mapExtentFor` decides the crop; `fx/fy` on the destination decides the pin.')
for i, (p, cap, sub) in enumerate(MAPS):
    x = PAD + i * (MAP_W + 28)
    im = fit(load(p), MAP_W, MAP_H)
    sheet.alpha_composite(im, (x, y))
    d.rounded_rectangle([x, y, x + im.width, y + im.height], radius=8, outline=HAIRLINE, width=2)
    d.text((x, y + MAP_H + 14), cap, font=font('r', 27, 'Bold'), fill=INK)
    d.text((x, y + MAP_H + 48), sub, font=font('t', 20), fill=INK_SOFT)
y += MAP_H + 96

# ── B. the beats ──
y = section(sheet, y, 'What a pin does', W,
            sub='A journey is minutes long, so a stray finger on a map full of pins costs a card, not a drive.')
for i, (p, cap, sub) in enumerate(BEATS):
    x = PAD + i * (BEAT_W + 22)
    im = fit(load(p), BEAT_W, BEAT_H)
    sheet.alpha_composite(im, (x, y))
    d.rounded_rectangle([x, y, x + im.width, y + im.height], radius=8, outline=HAIRLINE, width=2)
    d.text((x, y + BEAT_H + 12), cap, font=font('r', 24, 'Bold'), fill=INK)
    d.text((x, y + BEAT_H + 42), sub, font=font('t', 18), fill=INK_SOFT)
y += BEAT_H + 100

# ── C. the art ──
y = section(sheet, y, 'Every destination has art', W,
            sub='Briefed against Birchington/Thanet vernacular — knapped flint with brick quoins, Kent peg tiles, '
                'tarred weatherboard, oast cowls, stuccoed seaside villas. A habitat gets a chalk pull-in, not tarmac.')

for i, (did, label, art, kind, lvl, dist, fx, fy, note) in enumerate(DEST):
    cx = PAD + (i % 4) * (TILE_W + 24)
    cy = y + (i // 4) * (TILE_H + 24)
    bg = PAPER_ALT if (i // 4 + i) % 2 == 0 else (243, 235, 221)
    d.rounded_rectangle([cx, cy, cx + TILE_W, cy + TILE_H], radius=16, fill=bg, outline=HAIRLINE, width=2)

    paste_fit(sheet, load(f'{TD}/{art}'), cx + TILE_W / 2, 0, TILE_W - 60, ART_H - 40,
              shadow=True, bottom=cy + ART_H - 14)

    ty = cy + ART_H
    d.text((cx + 22, ty), label, font=font('r', 30, 'Bold'), fill=INK)
    d.text((cx + 22, ty + 40), f'{did}', font=font('m', 19), fill=HAIRLINE)
    d.text((cx + TILE_W - 22 - text_w(d, f'fx {fx:.2f}  fy {fy:.2f}', font('m', 18)), ty + 40),
           f'fx {fx:.2f}  fy {fy:.2f}', font=font('m', 18), fill=HAIRLINE)

    tx = cx + 22
    for lab, col in [(kind, KIND_HUE[kind]),
                     ('always open' if lvl == 0 else f'level {lvl}',
                      GOOD if lvl == 0 else (176, 160, 136)),
                     (f'{dist} km', (176, 160, 136))]:
        tw, _ = tag(d, tx, ty + 72, lab, col)
        tx += tw + 8

    d.text((cx + 22, ty + 124), note, font=font('t', 19), fill=INK_SOFT)

y += 3 * TILE_H + 2 * 24 + 40

# ── the one thing the sheet is for ──
d.rounded_rectangle([PAD, y, PAD + CW, y + NOTE_H], radius=16,
                    fill=(247, 241, 228), outline=NOTE, width=3)
d.text((PAD + 30, y + 24), 'Seen side by side', font=font('r', 30, 'Bold'), fill=NOTE)
for i, line in enumerate([
    "A.R.C.'s own building is a softer, lighter hand than the other ten — thinner line, paler wash, less weight in the "
    "shadow. The five commissioned buildings and the five habitats read as one set with each other;",
    "A.R.C. reads as the odd one, and it is the building a child sees most. Re-rendering it to match is a taste call, "
    "and this row is the evidence for it. The vet cottage stays as drawn.",
]):
    d.text((PAD + 30, y + 68 + i * 32), line, font=font('t', 21), fill=INK_SOFT)
y += NOTE_H

footer(sheet, W, H,
       'source  apps/game/public/assets/driving/topdown/site-*.png  ·  packages/game-logic/src/destinations.ts  ·  '
       'apps/game/e2e/__ux__/tmp-map, tmp-arrivals')

save(sheet, out_path('sheet-1-buildings-map.png'))
