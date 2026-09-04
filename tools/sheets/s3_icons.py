"""Sheet 3 — the drawn interface set, and the same icons in place."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw
from sheet import *

W, PAD = 2400, 64
CW = W - PAD * 2
ICO = os.path.join(REPO, 'apps/game/public/assets/icons')
SITU = os.path.join(REPO, 'apps/game/e2e/__ux__/tmp-icons')

GROUPS = [
    ('Navigation', 'One hue per destination, drawn white and tinted by the rail.', HUE['map'], [
        ('nav-home', HUE['home']), ('nav-care', HUE['care']),
        ('nav-walk', HUE['walk']), ('nav-map', HUE['map'])]),
    ('Chrome actions', 'On a plate they are ink; on a filled button they are cream. One asset, both.', INK, [
        ('icon-back', INK), ('icon-accept', GOOD), ('icon-close', INK), ('icon-menu', INK)]),
    ('Caring for an animal', 'The seven things a child does to an animal.', HUE['care'], [
        ('icon-feed', (198, 126, 34)), ('icon-heal', (168, 88, 96)), ('icon-vet', (168, 88, 96)),
        ('icon-play', HUE['care']), ('icon-walk', HUE['walk']), ('icon-groom', HUE['care']),
        ('icon-rest', HUE['map'])]),
    ('Places and things to do', '', HUE['walk'], [
        ('icon-garden', HUE['care']), ('icon-kitchen', (198, 126, 34)), ('icon-depot', HUE['walk']),
        ('icon-supply-run', HUE['walk']), ('icon-games', HUE['home'])]),
    ('Friends', 'The village hall, which is a pin on the map rather than a tab.', HUE['map'], [
        ('icon-friends', HUE['map']), ('icon-send-gift', HUE['home']), ('icon-leaderboard', HUE['walk']),
        ('icon-share', HUE['map']), ('icon-welcome', HUE['care']), ('icon-inbox', HUE['map']),
        ('icon-social', HUE['map'])]),
    ('Account', 'Five of these live on scenes the harness cannot reach.', INK, [
        ('icon-login', INK), ('icon-logout', INK), ('icon-save', GOOD),
        ('icon-create-account', HUE['map']), ('icon-settings', INK)]),
    ('Sound', 'Two separate toggles. Full colour on; grey and struck through off.', HUE['home'], [
        ('icon-music-on', HUE['home']), ('icon-music-off', (150, 140, 128)),
        ('icon-sfx-on', HUE['home']), ('icon-sfx-off', (150, 140, 128))]),
    ('The world\'s state', 'Wordless chips under the room title. Each one passes its own tint.', HUE['walk'], [
        ('icon-hud-animals', HUE['care']), ('icon-hud-coins', (198, 158, 44)),
        ('icon-hud-homes', HUE['home']), ('icon-hud-level', HUE['map']),
        ('icon-hud-time', HUE['map']), ('icon-hud-progress', HUE['care']),
        ('icon-hud-score', (198, 158, 44)), ('icon-hud-damage', (168, 88, 96)),
        ('icon-hud-smash', (168, 88, 96))]),
    ('Weather', 'One cloud, reused eight times, so a cloud is the same cloud in all of them.', HUE['map'], [
        ('weather-sunny', (214, 160, 44)), ('weather-cloudy', (128, 142, 156)),
        ('weather-overcast', (120, 128, 138)), ('weather-light-rain', (86, 124, 158)),
        ('weather-heavy-rain', (66, 100, 140)), ('weather-fog', (150, 150, 148)),
        ('weather-snow', (128, 152, 176)), ('weather-windy', (110, 138, 150))]),
]

ALIASES = {
    'icon-home': 'nav-home', 'icon-care': 'nav-care', 'icon-map': 'nav-map',
    'nav-play': 'nav-walk', 'icon-walk-scene': 'nav-walk',
    'icon-social-scene': 'icon-social', 'icon-friends-scene': 'icon-friends',
    'icon-badge': 'icon-hud-score', 'icon-arc-badge': 'icon-hud-score',
    'icon-rescue-centre': 'icon-hud-homes', 'icon-vet-clinic': 'icon-vet',
    'icon-depot-scene': 'icon-depot', 'icon-heal-scene': 'icon-heal',
    'hud-coins': 'icon-hud-coins', 'hud-homes': 'icon-hud-homes',
}


def glyph(name, size, colour):
    """The white source, tinted — exactly what Phaser's multiply tint does."""
    im = load(os.path.join(ICO, f'{name}.png'))
    im = im.resize((size, size), Image.LANCZOS)
    solid = Image.new('RGBA', im.size, colour + (255,))
    solid.putalpha(im.getchannel('A'))
    return solid


def disc(name, d_size, colour):
    """The nav rail's rendering: white line art on a solid brand disc."""
    im = Image.new('RGBA', (d_size, d_size), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse([0, 0, d_size - 1, d_size - 1], fill=colour + (255,))
    g = load(os.path.join(ICO, f'{name}.png')).resize(
        (int(d_size * 0.62), int(d_size * 0.62)), Image.LANCZOS)
    im.alpha_composite(g, (int(d_size * 0.19), int(d_size * 0.19)))
    return im


# ── measure ──
COLS = 9
CELL_W = (CW - (COLS - 1) * 14) // COLS
CELL_H = 232
group_rows = [((len(g[3]) + COLS - 1) // COLS) for g in GROUPS]
GRID_H = sum(96 + r * CELL_H + 34 for r in group_rows)

AL_COLS = 5
AL_W = (CW - (AL_COLS - 1) * 18) // AL_COLS
AL_H = 96
AL_ROWS = (len(ALIASES) + AL_COLS - 1) // AL_COLS

SITU_W = (CW - 3 * 20) // 4
SITU_H = int(SITU_W * 402 / 874)
CROP_COLS = 5
CROP_W = (CW - (CROP_COLS - 1) * 18) // CROP_COLS
CROP_H = 340

H = (300 + 110 + GRID_H + 70
     + 110 + AL_ROWS * (AL_H + 16) + 70
     + 110 + SITU_H + 78 + 30 + CROP_H + 70
     + 190 + 150)

sheet = new_sheet(W, H)
d = ImageDraw.Draw(sheet)

y = header(sheet, 'The interface set, drawn and in place', [
    'Fifty-three icons as geometry on a 24px grid: 2px stroke, round caps, nothing thinner than the stroke and no hole smaller than it either.',
    'White on transparency — colour arrives at draw time. Shown here at 96px (is it well drawn?) and at 24px (is it any use?).',
], 'A.R.C.  ·  contact sheet 3 of 4  ·  2026-09-04  ·  tools/icons/icon-set.mjs, rasterised at 4× to 96px', W)

# ── A. the set ──
y = section(sheet, y, 'Fifty-three drawn icons', W,
            sub='Each cell: 96px in the button\'s ink · 24px, the size a child actually sees · 40px white on the nav disc.')

for (gname, gsub, ghue, items), rows in zip(GROUPS, group_rows):
    d.text((PAD, y), gname, font=font('r', 28, 'Bold'), fill=ghue)
    if gsub:
        d.text((PAD + text_w(d, gname, font('r', 28, 'Bold')) + 20, y + 6), gsub,
               font=font('t', 20), fill=INK_SOFT)
    y += 46
    for i, (name, hue) in enumerate(items):
        cx = PAD + (i % COLS) * (CELL_W + 14)
        cy = y + (i // COLS) * CELL_H
        d.rounded_rectangle([cx, cy, cx + CELL_W, cy + CELL_H - 14], radius=14,
                            fill=PAPER_ALT, outline=HAIRLINE, width=2)
        # 96px, in the ink
        g96 = glyph(name, 96, INK)
        sheet.alpha_composite(g96, (int(cx + CELL_W / 2 - 48), cy + 18))
        # 24px, and the disc, side by side beneath
        g24 = glyph(name, 24, INK)
        row_y = cy + 132
        sheet.alpha_composite(g24, (int(cx + CELL_W / 2 - 46), row_y + 8))
        sheet.alpha_composite(disc(name, 40, hue), (int(cx + CELL_W / 2 + 6), row_y))
        d.text((cx + 10, cy + CELL_H - 46), name.replace('icon-', '').replace('weather-', ''),
               font=font('m', 16), fill=HAIRLINE)
    y += rows * CELL_H + 34

y += 36

# ── B. aliases ──
y = section(sheet, y, 'Fifteen aliases', W,
            sub='Old keys that still resolve, so nothing had to be renamed at the call sites.')
for i, (alias, target) in enumerate(ALIASES.items()):
    cx = PAD + (i % AL_COLS) * (AL_W + 18)
    cy = y + (i // AL_COLS) * (AL_H + 16)
    d.rounded_rectangle([cx, cy, cx + AL_W, cy + AL_H], radius=12,
                        fill=PAPER_ALT, outline=HAIRLINE, width=2)
    sheet.alpha_composite(glyph(target, 48, INK), (cx + 20, cy + 24))
    d.text((cx + 84, cy + 22), alias, font=font('m', 20), fill=INK)
    d.text((cx + 84, cy + 52), f'→ {target}', font=font('m', 18), fill=HAIRLINE)
y += AL_ROWS * (AL_H + 16) + 40

# ── C. in situ ──
y = section(sheet, y, 'The same icons, in place', W,
            sub='A white icon needs somewhere to take its colour from — the rail\'s disc, the chip\'s tint, the button\'s ink.')
SCREENS = [
    ('01-corridor-rail.png', 'The rail and the header', 'Four coloured discs, the state chips, two sound toggles.'),
    ('02-kitchen.png', 'Kitchen', 'Drawn into the play box, with the rail alongside.'),
    ('03-garden.png', 'Garden', 'Same header, same rail, different room.'),
    ('04-animal-card.png', 'An animal card', 'Feed and Play carry glyphs on a filled button; Close is a plate.'),
]
for i, (f, cap, sub) in enumerate(SCREENS):
    x = PAD + i * (SITU_W + 20)
    im = fit(load(os.path.join(SITU, f)), SITU_W, SITU_H)
    sheet.alpha_composite(im, (x, y))
    d.rounded_rectangle([x, y, x + im.width, y + im.height], radius=8, outline=HAIRLINE, width=2)
    d.text((x, y + SITU_H + 12), cap, font=font('r', 24, 'Bold'), fill=INK)
    d.text((x, y + SITU_H + 42), sub, font=font('t', 18), fill=INK_SOFT)
y += SITU_H + 78 + 30

CROPS = [
    ('01-corridor-rail.png', (12, 128, 90, 398), 'The nav rail',
     'The disc is sized from the cell, so the label always fits inside its own tap target.'),
    ('01-corridor-rail.png', (14, 12, 240, 78), 'The room title',
     'Left-aligned onto the rail, with `nav-home` at the size the set is drawn for.'),
    ('01-corridor-rail.png', (18, 80, 128, 134), 'Sundial and weather',
     'The sundial stays painted — it is one of five exceptions. The weather beside it is drawn.'),
    ('01-corridor-rail.png', (662, 16, 866, 78), 'The player panel',
     'Heart and home are HUD glyphs at 24px, each passing its own tint.'),
    ('01-corridor-rail.png', (748, 82, 868, 138), 'The two sound toggles',
     'Wordless discs, long-press for volume. Grey and struck through when off.'),
]
for i, (f, box, cap, sub) in enumerate(CROPS):
    x = PAD + i * (CROP_W + 18)
    src = load(os.path.join(SITU, f)).crop(box)
    scale = min((CROP_W - 40) / src.width, (CROP_H - 96) / src.height)
    src = src.resize((int(src.width * scale), int(src.height * scale)), Image.NEAREST)
    d.rounded_rectangle([x, y, x + CROP_W, y + CROP_H], radius=14,
                        fill=PAPER_ALT, outline=HAIRLINE, width=2)
    sheet.alpha_composite(src, (int(x + CROP_W / 2 - src.width / 2), y + 18))
    d.text((x + 16, y + CROP_H - 66), cap, font=font('r', 23, 'Bold'), fill=INK)
    d.text((x + 16, y + CROP_H - 36), sub, font=font('t', 17), fill=INK_SOFT)
y += CROP_H + 60

# ── the trap ──
d.rounded_rectangle([PAD, y, PAD + CW, y + 190], radius=16,
                    fill=(247, 241, 228), outline=NOTE, width=3)
d.text((PAD + 30, y + 22), 'The trap the white set set', font=font('r', 30, 'Bold'), fill=NOTE)
for i, line in enumerate([
    'Phaser\'s tint multiplies: it can darken a source, never lighten one. That is why these are drawn white — and why '
    'three call sites written for the painted set broke silently',
    'when it changed. The status chips never tinted at all, the audio discs tinted only when off, and the rail\'s '
    'inactive discs sat at 0.55 alpha, which is 1.9:1 against white.',
    'Anything new that draws an icon has to say what tints it. The exceptions that stay painted are the animal '
    'portraits, the three `icon-resolve-*`, the species door signs and the sundial.',
]):
    d.text((PAD + 30, y + 68 + i * 34), line, font=font('t', 21), fill=INK_SOFT)

footer(sheet, W, H,
       'source  tools/icons/icon-set.mjs (53 drawn, 15 aliased)  ·  apps/game/public/assets/icons/*.png  ·  '
       'in situ from apps/game/e2e/__ux__/tmp-icons at 874×402')

save(sheet, out_path('sheet-3-icons.png'))
