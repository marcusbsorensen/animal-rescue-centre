"""Sheet 4 — every game screen, and the animals that belong on it."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw
from sheet import *

W, PAD = 2400, 64
CW = W - PAD * 2
UX = os.path.join(REPO, 'apps/game/e2e/__ux__')
AN = os.path.join(REPO, 'apps/game/public/assets/animals')
BG = os.path.join(REPO, 'apps/game/public/assets/bg')

# species → the variant this sheet draws, and its display name
REP = {
    'cat': ('cat-ginger', 'Cat'), 'dog': ('dog-golden', 'Dog'), 'fox': ('fox-red', 'Fox'),
    'bunny': ('bunny-lop', 'Bunny'), 'bat': ('bat-brown', 'Bat'), 'parrot': ('parrot-macaw', 'Parrot'),
    'snake': ('snake-corn', 'Snake'), 'hedgehog': ('hedgehog-chocolate', 'Hedgehog'),
    'raccoon': ('raccoon', 'Raccoon'), 'skunk': ('skunk', 'Skunk'),
}
ALL8 = ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake', 'hedgehog']


def sprite(species, pose):
    """What the game would draw — with the game's own fallback to `sheltered`."""
    v = REP[species][0]
    for cand in (f'{v}-{pose}.png', f'{species}-{pose}.png', f'{v}-sheltered.png', f'{v}-walking.png'):
        p = os.path.join(AN, cand)
        if os.path.exists(p):
            return load(p), cand.endswith(f'-{pose}.png')
    raise FileNotFoundError(f'{species} {pose}')


# screen file, title, scene, pose, species, note
ROWS = [
    ('GameScene-phone.png', 'The corridor', 'GameScene · CorridorView', 'arriving', ALL8,
     'Every species arrives here. The door signs stay painted; the arrival gives way to them when they cannot both have the room.'),
    ('GameScene-animal-card-phone.png', 'An animal card', 'GameScene · AnimalCard', 'sheltered', ALL8,
     'The portrait is one of the five things that stay painted rather than drawn.'),
    ('KitchenMinigameScene-phone.png', 'The kitchen', 'KitchenMinigameScene', 'eating', ALL8,
     'Four painted bowls are the real drop targets; the animal sits at the back rim so it reads as eating from the bowl.'),
    ('GameScene-paths-phone.png', 'The three futures', 'GameScene · adoption dialogue', 'sheltered', ALL8,
     'Forever family, back to the wild, or stay at A.R.C. — every species can be offered all three.'),
    ('GameScene-adoption-office-phone.png', 'The adoption office', 'GameScene · adoption', 'sheltered', ALL8,
     'The adopters are painted cast portraits; the animal on offer is its sheltered sprite.'),
    ('GameScene-rewilding-phone.png', 'The farewell', 'GameScene · rewilding', 'walking',
     ['fox', 'bunny', 'hedgehog', 'parrot', 'bat', 'snake'],
     'Only a species with a habitat can be released. Fox→Moorland, bunny+hedgehog→Woodland, parrot→Sea Cliffs, bat→Deep Forest, snake→Wetlands.'),
    ('GameScene-tunnel-phone.png', 'The garden tunnel', 'GameScene · tunnel minigame', 'walking',
     ['fox', 'skunk', 'hedgehog', 'raccoon'],
     'Its own cast of four. Skunk and raccoon appear nowhere else in the game; as of 2026-09-05 they carry all ten poses anyway.'),
    ('GameScene-map-phone.png', 'The map', 'GameScene · openMapOverlay', 'sick', ALL8,
     'Heal opens the map with the poorly animal already aboard, so the sick sprite is the one that travels.'),
    ('PtvDriveScene-phone.png', 'The drive picker', 'PtvDriveScene · select', 'sick', ALL8,
     'The animal rides in a crate. Trikey takes two, Big Tilly nine.'),
    ('AccountScene-phone.png', 'My A.R.C.', 'AccountScene', 'sheltered', ALL8,
     '"Animals you\'ve met" is a row of species chips — the only place all eight appear at once.'),
    ('SupplyRunScene-phone.png', 'Supply run', 'SupplyRunScene', None, [],
     'Errands, not animals. Three destinations, two of them locked until level 5 and level 10.'),
    ('DepotScene-phone.png', 'The depot', 'DepotScene', None, [],
     'Crate stacking and building. No animal is drawn here.'),
    ('SocialScene-phone.png', 'Social', 'SocialScene', None, [],
     'Now reached through the village hall on the map rather than a tab on the rail.'),
    ('MainMenuScene-phone.png', 'The front door', 'MainMenuScene', None, [],
     'Only the player\'s own avatar — a fox — and the friend code.'),
]

ROOMS = [('cat', 'bg-room-cat.png'), ('dog', 'bg-room-dog.png'), ('fox', 'bg-room-fox.png'),
         ('bunny', 'bg-room-bunny.png'), ('bat', 'bg-room-bat.png'), ('parrot', 'bg-room-parrot.png'),
         ('snake', 'bg-room-snake.png'), ('hedgehog', 'bg-room-generic.png')]

STATES = ['arriving', 'sheltered', 'eating', 'sleeping', 'playing', 'walking',
          'sick', 'scared', 'grumpy', 'growling']

# ── measure ──
SHOT_W = 520
SHOT_H = int(SHOT_W * 402 / 874)
ROW_H = 316
STRIP_X = PAD + SHOT_W + 34
STRIP_W = CW - SHOT_W - 34

ROOM_COLS = 4
ROOM_W = (CW - (ROOM_COLS - 1) * 22) // ROOM_COLS
ROOM_H = int(ROOM_W * 446 / 800) + 62

OUT_COLS = 3
OUT_W = (CW - (OUT_COLS - 1) * 22) // OUT_COLS
OUT_H = int(OUT_W * 402 / 874) + 62

ST_W = (CW - 9 * 14) // 10
ST_H = ST_W + 56

H = (300
     + 118 + len(ROWS) * ROW_H + 60
     + 118 + 2 * (ROOM_H + 22) + 60
     + 118 + OUT_H + 60
     + 118 + ST_H + 60
     + 236 + 150)

sheet = new_sheet(W, H)
d = ImageDraw.Draw(sheet)

y = header(sheet, 'Every screen, and who is on it', [
    'Fourteen screens at the app\'s own 874×402, each beside the animals it actually draws, in the pose it draws them in.',
    'Eight species live at the centre; two more exist only inside the garden tunnel.',
], 'A.R.C.  ·  contact sheet 4  ·  animals as at 2026-09-05  ·  captures from e2e/ux-review.spec.ts, sprites at source', W)

# ── A. screen by screen ──
y = section(sheet, y, 'Screen by screen', W,
            sub='The pose chip is the sprite key the screen asks for; a hollow chip means that species falls back to `sheltered`.')

for i, (f, title, scene_name, pose, species, note) in enumerate(ROWS):
    ry = y + i * ROW_H
    if i % 2 == 0:
        d.rounded_rectangle([PAD - 14, ry - 10, PAD + CW + 14, ry + ROW_H - 26], radius=16, fill=PAPER_ALT)

    im = fit(load(os.path.join(UX, f)), SHOT_W, SHOT_H)
    sheet.alpha_composite(im, (PAD, ry))
    d.rounded_rectangle([PAD, ry, PAD + im.width, ry + im.height], radius=8, outline=HAIRLINE, width=2)

    d.text((PAD, ry + SHOT_H + 12), title, font=font('r', 30, 'Bold'), fill=INK)
    d.text((PAD, ry + SHOT_H + 50), scene_name, font=font('m', 18), fill=HAIRLINE)

    if not species:
        d.rounded_rectangle([STRIP_X, ry + 20, PAD + CW, ry + SHOT_H - 20], radius=14,
                            outline=HAIRLINE, width=3)
        msg = 'No animal is drawn on this screen'
        d.text((STRIP_X + (STRIP_W - text_w(d, msg, font('r', 30, 'Bold'))) / 2, ry + SHOT_H / 2 - 34),
               msg, font=font('r', 30, 'Bold'), fill=HAIRLINE)
        d.text((STRIP_X + 30, ry + SHOT_H / 2 + 16), note, font=font('t', 21), fill=INK_SOFT)
        continue

    tw, _ = tag(d, STRIP_X, ry + 2, f'{pose}', HUE['care'])
    d.text((STRIP_X + tw + 14, ry + 5), note, font=font('t', 21), fill=INK_SOFT)

    n = len(species)
    slot = STRIP_W / n
    for j, sp in enumerate(species):
        im_a, exact = sprite(sp, pose)
        cx = STRIP_X + slot * (j + 0.5)
        paste_fit(sheet, im_a, cx, 0, slot - 22, SHOT_H - 82, bottom=ry + SHOT_H + 4)
        lab = REP[sp][1]
        fl = font('r', 22, 'Bold' if exact else 'Regular')
        d.text((cx - text_w(d, lab, fl) / 2, ry + SHOT_H + 16), lab, font=fl,
               fill=INK if exact else HAIRLINE)
        sub = REP[sp][0] if exact else f'{REP[sp][0]} · sheltered'
        d.text((cx - text_w(d, sub, font('m', 15)) / 2, ry + SHOT_H + 44), sub,
               font=font('m', 15), fill=HAIRLINE)

y += len(ROWS) * ROW_H + 40

# ── B. the eight rooms ──
y = section(sheet, y, 'The eight species rooms', W,
            sub='Room art with its own species standing in it — `bg-room-<species>` plus the sheltered sprite. '
                'Hedgehog has no room of its own and falls back to `bg-room-generic`.')
for i, (sp, bgf) in enumerate(ROOMS):
    cx = PAD + (i % ROOM_COLS) * (ROOM_W + 22)
    cy = y + (i // ROOM_COLS) * (ROOM_H + 22)
    bg = fit(load(os.path.join(BG, bgf)), ROOM_W, ROOM_H - 62)
    sheet.alpha_composite(bg, (cx, cy))
    im_a, _ = sprite(sp, 'sheltered')
    paste_fit(sheet, im_a, cx + ROOM_W * 0.5, 0, ROOM_W * 0.42, bg.height * 0.62,
              bottom=cy + bg.height - int(bg.height * 0.08))
    d.rounded_rectangle([cx, cy, cx + bg.width, cy + bg.height], radius=10, outline=HAIRLINE, width=2)
    d.text((cx, cy + bg.height + 10), REP[sp][1], font=font('r', 26, 'Bold'), fill=INK)
    d.text((cx, cy + bg.height + 40), bgf.replace('.png', ''), font=font('m', 16),
           fill=MISSING if sp == 'hedgehog' else HAIRLINE)
y += 2 * (ROOM_H + 22) + 40

# ── C. outside ──
y = section(sheet, y, 'Outside the rooms', W,
            sub='The garden takes the weather and the hour; the walk takes only the four species that go on one.')
TILES = os.path.join(REPO, 'apps/game/public/assets/tiles')


def walk_grid(cols=11, rows=5, t=128):
    """The walk is a tile grid, not a painted room — so draw one."""
    g = Image.new('RGBA', (cols * t, rows * t), (233, 243, 228, 255))
    grass = load(os.path.join(TILES, 'tile-grass.png')).resize((t, t), Image.LANCZOS)
    for r in range(rows):
        for c in range(cols):
            g.alpha_composite(grass, (c * t, r * t))
    path = load(os.path.join(TILES, 'tile-path.png')).resize((t, t), Image.LANCZOS)
    for c in range(cols):
        g.alpha_composite(path, (c * t, 3 * t))
    for name, (c, r) in [('tile-tree', (1, 0)), ('tile-tree', (7, 0)), ('tile-bush', (4, 1)),
                         ('tile-flower', (9, 1)), ('tile-bench', (2, 4)), ('tile-bin', (8, 4)),
                         ('tile-rock', (6, 4)), ('tile-fence', (0, 2)), ('tile-fence', (10, 2))]:
        p = os.path.join(TILES, f'{name}.png')
        if os.path.exists(p):
            g.alpha_composite(load(p).resize((int(t * .95), int(t * .95)), Image.LANCZOS),
                              (int(c * t + t * .025), int(r * t + t * .025)))
    return g


OUTS = [
    ('garden-lawn-summer-afternoon.png', 'The garden', 'playing',
     ['cat', 'dog', 'fox', 'bunny'], '16 garden backgrounds — lawn or quiet, summer or winter, four hours each.'),
    ('garden-quiet-summer-evening.png', 'The quiet garden', 'sheltered',
     ['bat', 'parrot', 'snake', 'hedgehog'], 'Hedgehog has no `playing` pose and falls back here too.'),
    (None, 'On a walk', 'walking',
     ['cat', 'dog', 'fox', 'bunny'], 'A tile grid, not a painted room. WALKABLE_SPECIES is four — everyone else is told they are "not a going-for-walks sort of animal".'),
]
for i, (bgf, title, pose, species, note) in enumerate(OUTS):
    cx = PAD + i * (OUT_W + 22)
    bg = fit(walk_grid() if bgf is None else load(os.path.join(BG, bgf)), OUT_W, OUT_H - 62)
    sheet.alpha_composite(bg, (cx, y))
    for j, sp in enumerate(species):
        im_a, _ = sprite(sp, pose)
        paste_fit(sheet, im_a, cx + OUT_W * (0.14 + j * 0.245), 0, OUT_W * 0.23, bg.height * 0.5,
                  bottom=y + bg.height - int(bg.height * 0.07))
    d.rounded_rectangle([cx, y, cx + bg.width, y + bg.height], radius=10, outline=HAIRLINE, width=2)
    d.text((cx, y + bg.height + 10), title, font=font('r', 26, 'Bold'), fill=INK)
    d.text((cx, y + bg.height + 40), note, font=font('t', 18), fill=INK_SOFT)
y += OUT_H + 40

# ── D. the pose vocabulary ──
y = section(sheet, y, 'One animal, ten states', W,
            sub='Every species carries the same ten poses — 52 variants × 10, bar a handful. This is the whole vocabulary a screen can ask for.')
for i, st in enumerate(STATES):
    cx = PAD + i * (ST_W + 14)
    d.rounded_rectangle([cx, y, cx + ST_W, y + ST_H], radius=14,
                        fill=PAPER_ALT, outline=HAIRLINE, width=2)
    im_a, _ = sprite('cat', st)
    paste_fit(sheet, im_a, cx + ST_W / 2, y + (ST_H - 56) / 2, ST_W - 30, ST_H - 76)
    d.text((cx + ST_W / 2 - text_w(d, st, font('r', 22, 'Bold')) / 2, y + ST_H - 44),
           st, font=font('r', 22, 'Bold'), fill=INK)
y += ST_H + 50

# ── findings ──
d.rounded_rectangle([PAD, y, PAD + CW, y + 236], radius=16,
                    fill=(247, 241, 228), outline=NOTE, width=3)
d.text((PAD + 30, y + 22), 'What the pairing shows', font=font('r', 30, 'Bold'), fill=NOTE)
for i, line in enumerate([
    'The pose set is complete as of 2026-09-05: 60 characters × 10 poses, all present, all usable cut-outs. '
    '`tools/verify-animal-set.py` measures it against `SPECIES_VARIANTS`,',
    'not against the folder — which is how hedgehog\'s six declared-but-undrawn variants stayed hidden while every '
    'hedgehog in the game rendered as the same one.',
    'What is still open here is scenery, not animals: hedgehog has no room of its own and borrows `bg-room-generic`, '
    'so it is the one species whose room does not belong to it.',
    'Six screens of the fourteen draw no animal at all. Five of the eight species reach the wild; cat and dog never '
    'do, and hedgehog shares Woodland with bunny.',
]):
    d.text((PAD + 30, y + 68 + i * 38), line, font=font('t', 21), fill=INK_SOFT)

footer(sheet, W, H,
       'source  apps/game/public/assets/animals (523 files, 52 variants × 10 states)  ·  '
       'packages/game-logic/src/walks.ts WALKABLE_SPECIES  ·  destinations.ts SPECIES_HABITATS  ·  tunnel.ts')

save(sheet, out_path('sheet-4-screens-animals.png'))
