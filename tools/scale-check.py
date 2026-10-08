#!/usr/bin/env python3
"""Line the fleet up at ONE scale, and say where the drawings disagree with it.

Two separate things can be wrong and they need telling apart:

  1. The SPRITE's own proportions — how long each vehicle is for its width,
     which is fixed in the drawing and only a repaint can change.
  2. The GAME's VEHICLE_SIZE — a single scalar applied to WIDTH, which decides
     how big each one draws beside the others.

PtvDriveScene scales by `img.width`, the whole texture, so transparent padding
counts. Two sprites with the same vehicle but different padding draw at
different sizes, which is measured here as well.
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

A = '/Users/marcus/Projects/animal-rescue-centre/apps/game/public/assets/driving/topdown'
OUT = os.path.dirname(os.path.abspath(__file__))

# Real vehicles these are drawn from, in metres: (width, length).
# Henry is a 1960s small van, Bea a 1970s van, Spark a Sprinter-ish minibus,
# Tilly a flatbed lorry, Trikey a cargo trike.
REAL = {
    'trikey':    (0.75, 2.0),
    'henry':     (1.75, 4.2),
    'bea':       (1.80, 4.5),
    'spark':     (2.00, 5.9),
    'big-tilly': (2.30, 6.5),
}
# What the game currently does, relative to Henry, applied to WIDTH.
VEHICLE_SIZE = {'trikey': 0.55, 'henry': 1.0, 'bea': 1.12,
                'spark': 1.18, 'big-tilly': 1.5}


def bbox(path):
    a = np.array(Image.open(path).convert('RGBA'))
    ys, xs = np.nonzero(a[..., 3] > 24)
    if len(xs) == 0:
        return None
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1), a.shape[1], a.shape[0]


print(f'{"sprite":<18} {"texture":>11} {"drawn w x h":>12} {"pad%":>5} '
      f'{"aspect":>7} {"real":>6} {"implied len":>12} {"vs real":>8}')
rows = {}
for name in ('trikey', 'henry', 'bea', 'spark', 'big-tilly'):
    for suffix in ('', '-rear'):
        p = os.path.join(A, f'vehicle-topdown-{name}{suffix}.png')
        if not os.path.exists(p):
            continue
        box, tw, th = bbox(p)
        w, h = box[2] - box[0], box[3] - box[1]
        aspect = w / h                       # width over length
        rw, rl = REAL[name]
        real_aspect = rw / rl
        implied_len = rw / aspect            # if the width is right, how long is it?
        pad = 100 * (1 - (w * h) / (tw * th))
        flag = '' if abs(implied_len - rl) < 0.6 else '  <-- off'
        print(f'{name + suffix:<18} {tw}x{th:<6} {w:>5}x{h:<6} {pad:>4.0f}% '
              f'{aspect:>7.3f} {real_aspect:>6.3f} {implied_len:>9.1f} m '
              f'{implied_len - rl:>+7.1f}{flag}')
        rows[name + suffix] = (p, box, rw, rl)

print()
print('VEHICLE_SIZE is applied to WIDTH. Width ratios against Henry:')
for name in ('trikey', 'henry', 'bea', 'spark', 'big-tilly'):
    rw, rl = REAL[name]
    true_w = rw / REAL['henry'][0]
    true_l = rl / REAL['henry'][1]
    print(f'  {name:<10} true width {true_w:.2f}   true length {true_l:.2f}   '
          f'game uses {VEHICLE_SIZE[name]:.2f}'
          + ('   <-- a LENGTH ratio used as a WIDTH ratio'
             if abs(VEHICLE_SIZE[name] - true_l) < 0.12
             and abs(VEHICLE_SIZE[name] - true_w) > 0.12 else ''))

# ---- the sheet: one scale for everything, front row and rear row ----
PX_PER_M = 86.0
PAPER, INK = (247, 244, 238), (45, 41, 36)
try:
    f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 14)
    fb = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 17)
except Exception:
    f = fb = ImageFont.load_default()


def row(names, title, y0, sheet, d):
    x = 30
    d.text((30, y0), title, font=fb, fill=INK)
    y0 += 26
    maxh = 0
    for key in names:
        if key not in rows:
            continue
        p, box, rw, rl = rows[key]
        im = Image.open(p).convert('RGBA').crop(box)
        # Scale so the DRAWN WIDTH equals the real width at a fixed px/metre.
        target_w = max(1, int(rw * PX_PER_M))
        target_h = max(1, int(im.height * target_w / im.width))
        im = im.resize((target_w, target_h), Image.LANCZOS)
        sheet.paste(im, (x, y0), im)
        d.text((x, y0 + target_h + 4), key, font=f, fill=INK)
        maxh = max(maxh, target_h)
        x += target_w + 34
    return y0 + maxh + 30


W, H = 1180, 1180
sheet = Image.new('RGB', (W, H), PAPER)
d = ImageDraw.Draw(sheet)
d.text((30, 18), 'The fleet at ONE scale — every vehicle at its real width, 86px to the metre',
       font=fb, fill=INK)
d.text((30, 40), 'Cropped to the drawing, so transparent padding cannot distort it. '
                 'Length is whatever each sprite was drawn at.', font=f, fill=(110, 100, 90))
y = row(['trikey', 'henry', 'bea', 'spark', 'big-tilly'], 'Front', 74, sheet, d)
y = row(['henry-rear', 'bea-rear', 'spark-rear', 'big-tilly-rear'], 'Rear', y, sheet, d)
sheet.crop((0, 0, W, min(H, y + 10))).save(os.path.join(OUT, 'fleet-scale.jpg'), quality=86)
print('\nsheet', os.path.getsize(os.path.join(OUT, 'fleet-scale.jpg')) // 1024, 'KB')
