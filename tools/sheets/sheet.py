"""Shared furniture for the A.R.C. contact sheets.

The sheets are drawn in the game's own chrome language — cream paper,
ink type, a hairline and a soft shadow — so that looking at a sheet and
looking at the game are the same act of looking.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

# Where the finished sheets land. The repo root is gitignored for `/*.png`,
# which is where `icon-sheet.png` already goes, so a rebuild never dirties
# the tree. `ARC_SHEET_OUT` moves them somewhere else for a one-off.
OUT = os.environ.get('ARC_SHEET_OUT', REPO)


def out_path(name):
    os.makedirs(OUT, exist_ok=True)
    return os.path.join(OUT, name)

# ── the palette, from apps/game/src/ui/constants.ts ──
PAPER      = (239, 230, 214)   # #efe6d6  the sheet ground
PAPER_ALT  = (246, 239, 227)   # #f6efe3  alternating cell
PLATE      = (250, 245, 236)   # chrome plate
INK        = (58, 46, 34)      # #3a2e22
INK_SOFT   = (107, 90, 74)     # #6b5a4a
HAIRLINE   = (196, 180, 158)
RULE       = (214, 200, 178)

# brand hues, one per nav destination
# sampled off the shipped rail rather than guessed
HUE = {
    'home':  (61, 138, 46),    # COLOURS.primary
    'care':  (168, 90, 40),    # COLOURS.warm
    'walk':  (46, 107, 138),   # COLOURS.info
    'map':   (168, 32, 32),    # COLOURS.accent
}
GOOD    = (61, 138, 46)
MISSING = (183, 82, 62)
NOTE    = (150, 118, 52)

ROUNDED = '/System/Library/Fonts/SFNSRounded.ttf'
MONO    = '/System/Library/Fonts/SFNSMono.ttf'
TEXT    = '/System/Library/Fonts/SFNS.ttf'

_cache = {}


def font(kind, size, weight='Regular'):
    key = (kind, size, weight)
    if key not in _cache:
        path = {'r': ROUNDED, 'm': MONO, 't': TEXT}[kind]
        f = ImageFont.truetype(path, size)
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
        _cache[key] = f
    return _cache[key]


def text_w(d, s, f):
    return d.textbbox((0, 0), s, font=f)[2]


def fit(im, box_w, box_h):
    """Uniform contain — never a stretch, which is the whole point."""
    w, h = im.size
    s = min(box_w / w, box_h / h)
    return im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)


def load(path):
    return Image.open(path if path.startswith('/') else os.path.join(REPO, path)).convert('RGBA')


def paste_fit(sheet, im, cx, cy, box_w, box_h, shadow=False, bottom=None):
    """Centre an image in a box (or sit it on `bottom`), optional soft shadow."""
    r = fit(im, box_w, box_h)
    x = int(cx - r.width / 2)
    y = int(bottom - r.height) if bottom is not None else int(cy - r.height / 2)
    if shadow:
        sh = Image.new('RGBA', (r.width + 40, r.height + 40), (0, 0, 0, 0))
        sh.paste(Image.new('RGBA', r.size, (58, 46, 34, 70)), (20, 24), r)
        sh = sh.filter(ImageFilter.GaussianBlur(9))
        sheet.alpha_composite(sh, (x - 20, y - 20))
    sheet.alpha_composite(r, (x, y))
    return (x, y, r.width, r.height)


def plate(d, x, y, w, h, fill=PLATE, radius=14, outline=HAIRLINE, width=2):
    d.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill,
                        outline=outline, width=width)


def shadowed_plate(sheet, x, y, w, h, fill=PLATE, radius=14, outline=HAIRLINE):
    sh = Image.new('RGBA', (w + 48, h + 48), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([24, 28, 24 + w, 28 + h], radius=radius,
                                         fill=(58, 46, 34, 46))
    sheet.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)), (x - 24, y - 24))
    d = ImageDraw.Draw(sheet)
    plate(d, x, y, w, h, fill=fill, radius=radius, outline=outline)
    return d


def header(sheet, title, standfirst, meta, W, pad=64, hue=INK):
    """The sheet's masthead. Returns the y the content starts at."""
    d = ImageDraw.Draw(sheet)
    y = pad
    f = font('r', 68, 'Heavy')
    d.text((pad, y), title, font=f, fill=hue)
    y += 84
    fs = font('t', 27, 'Regular')
    for line in standfirst:
        d.text((pad, y), line, font=fs, fill=INK_SOFT)
        y += 37
    y += 10
    fm = font('m', 20, 'Regular')
    d.text((pad, y), meta, font=fm, fill=HAIRLINE)
    y += 34
    d.line([pad, y, W - pad, y], fill=RULE, width=3)
    return y + 40


def section(sheet, y, label, W, pad=64, sub=None, hue=INK):
    d = ImageDraw.Draw(sheet)
    d.text((pad, y), label, font=font('r', 38, 'Bold'), fill=hue)
    if sub:
        d.text((pad, y + 50), sub, font=font('t', 24), fill=INK_SOFT)
        y += 34
    y += 60
    d.line([pad, y, W - pad, y], fill=RULE, width=2)
    return y + 30


def tag_size(d, label, size=19, pad_x=12, pad_y=6):
    return text_w(d, label, font('r', size, 'Bold')) + pad_x * 2, size + pad_y * 2


def tag(d, x, y, label, fill, ink=(255, 255, 255), size=19, pad_x=12, pad_y=6):
    f = font('r', size, 'Bold')
    w, h = tag_size(d, label, size, pad_x, pad_y)
    d.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, fill=fill)
    d.text((x + pad_x, y + pad_y - 2), label, font=f, fill=ink)
    return w, h


def wrap_text(d, s, f, max_w):
    """Greedy word wrap. Returns the lines."""
    lines, cur = [], ''
    for word in s.split(' '):
        t = (cur + ' ' + word).strip()
        if cur and text_w(d, t, f) > max_w:
            lines.append(cur)
            cur = word
        else:
            cur = t
    if cur:
        lines.append(cur)
    return lines


def tag_row(d, x, y, items, max_w, gap=8, line_h=34):
    """A row of tags that wraps onto further lines. Returns the height used."""
    tx, ty = x, y
    for label, colour in items:
        w, _ = tag_size(d, label)
        if tx > x and tx - x + w > max_w:
            tx, ty = x, ty + line_h
        tag(d, tx, ty, label, colour)
        tx += w + gap
    return ty - y + line_h


def footer(sheet, W, H, text, pad=64):
    d = ImageDraw.Draw(sheet)
    d.line([pad, H - pad - 44, W - pad, H - pad - 44], fill=RULE, width=2)
    d.text((pad, H - pad - 30), text, font=font('m', 19), fill=HAIRLINE)


def new_sheet(W, H, bg=PAPER):
    return Image.new('RGBA', (W, H), bg + (255,))


def save(sheet, path, max_h=None):
    if max_h and sheet.height > max_h:
        s = max_h / sheet.height
        sheet = sheet.resize((int(sheet.width * s), max_h), Image.LANCZOS)
    sheet.convert('RGB').save(path, quality=94)
    print(f'{path}  {sheet.width}x{sheet.height}')
