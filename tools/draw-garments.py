#!/usr/bin/env python3
"""draw-garments.py — draws the seven garments, in the register of the animals.

    python3 tools/draw-garments.py            # write apps/game/public/assets/animals/*-{coat,scarf,hat}.png
    python3 tools/draw-garments.py --preview out.png   # also a contact sheet, in three colours

**Why these are drawn and not the painted originals.** The seven PNGs that sat
in `assets/animals/` from August (see `dd7d18d`) were painterly product shots:
soft gradients, a drop-shadow blob under the bat's scarf, a ring-shaped scarf
whose back half would land across an animal's face, and a human tweed blazer
for the fox. The animals were repainted on 2026-10-10 into a flat line-and-wash
register (`712022e`), so the old art would have read as stuck on, and it could
not be laid over an animal at all. These are flat shapes with the same thin
dark key-line the animals carry, drawn in code so they can be redrawn the same
way. They cost no image-model spend.

**The tone convention — this is the contract with the game.** A garment is
authored in greys and is *coloured at render time* by the colour the child
picked (`ui/wardrobe-art.ts`, `tintGarmentPixel`), which is what the `:#hex`
on `animal.wardrobe` is. Four fills and one ink, told apart by luminance:

    CREAM  255   trim that stays cream whatever colour was picked
    LIGHT  235   the picked colour, lifted — highlights
    BASE   204   the picked colour
    SHADE  158   the picked colour, darkened — folds, undersides
    INK          the key-line, kept as drawn

If you change these four numbers change `TONES` in `ui/wardrobe-art.ts` too;
`ui/__tests__/wardrobe-art.test.ts` pins the pairing.

**Shapes and where they go.** Each file is cropped to its content, the
coordinates are free, and `wardrobe-anchors.json` says where on each sprite it
goes (`tools/measure-wardrobe-anchors.py`). The art is drawn upright, the way
it hangs: a scarf with its tail down, a hat with its crown up, a coat with its
collar to the right.

**The outline** is the union's outline — every shape is stroked first and
filled second, so overlapping shapes read as one cut-out with one key-line —
plus a few explicit interior lines where one piece lies over another.
"""
import argparse
import io
import os
import sys

import cairosvg
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT_DIR = os.path.join(ROOT, 'apps/game/public/assets/animals')

INK = '#241814'
CREAM = '#ffffff'
LIGHT = '#ebebeb'
BASE = '#cccccc'
SHADE = '#9e9e9e'
LINE = 7          # key-line width, outside the shape's edge, in art pixels
INNER = 5         # interior lines


def shape(d, fill, tag='path', extra=''):
    """One filled shape; the outline pass draws the same geometry stroked."""
    return dict(tag=tag, d=d, fill=fill, extra=extra)


def svg(w, h, shapes, inner='', defs=''):
    """Stroke every shape first (one union outline), then fill them, then
    the interior lines."""
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">']
    if defs:
        out.append(f'<defs>{defs}</defs>')
    out.append(f'<g stroke="{INK}" stroke-width="{LINE * 2}" stroke-linejoin="round" '
               f'stroke-linecap="round" fill="{INK}">')
    for s in shapes:
        out.append(_el(s, stroke=True))
    out.append('</g>')
    out.append('<g stroke="none">')
    for s in shapes:
        out.append(_el(s, stroke=False))
    out.append('</g>')
    if inner:
        out.append(f'<g fill="none" stroke="{INK}" stroke-width="{INNER}" '
                   f'stroke-linejoin="round" stroke-linecap="round">{inner}</g>')
    out.append('</svg>')
    return '\n'.join(out)


def _el(s, stroke):
    attrs = s['extra']
    if s['tag'] == 'path':
        return f'<path d="{s["d"]}" fill="{INK if stroke else s["fill"]}" {attrs}/>'
    # raw element, e.g. circle/ellipse/rect given as attribute string in d
    return f'<{s["tag"]} {s["d"]} fill="{INK if stroke else s["fill"]}" {attrs}/>'


# ── scarves ────────────────────────────────────────────────────────
# A wide shallow band that goes round the neck, a knot, and one tail that
# hangs from it. The band's mid-line is where the animal's chin is; the head
# is masked out of the garment at render time so the top of the band tucks
# behind the head.

SCARF_W, SCARF_H = 440, 340

BAND = ('M 18,40 C 22,150 120,214 220,214 C 320,214 418,150 422,40 '
        'L 342,54 C 332,114 292,140 220,140 C 148,140 108,114 98,54 Z')
TAIL = ('M 250,150 L 348,146 C 354,200 362,262 370,312 '
        'C 332,328 292,326 256,314 C 258,262 254,200 250,150 Z')
KNOT = 'x="254" y="128" width="96" height="72" rx="30"'
KNOT_T = 'transform="rotate(-6 302 164)"'
FRINGE = 'M 272,322 L 268,340 M 298,326 L 296,344 M 326,326 L 326,344 M 354,322 L 358,340'


def _scarf(shapes, extra, inner, clips):
    return _compose(svg(SCARF_W, SCARF_H, shapes, defs=clips), extra, inner)


def scarf_cat():
    """A plain knit scarf: one long tail with two cream bands and a fringe."""
    clips = f'<clipPath id="tail"><path d="{TAIL}"/></clipPath><clipPath id="band"><path d="{BAND}"/></clipPath>'
    shapes = [shape(TAIL, BASE), shape(BAND, BASE), shape(KNOT, BASE, tag='rect', extra=KNOT_T)]
    extra = (
        f'<g clip-path="url(#band)"><path d="M 10,128 C 140,196 300,196 430,128 L 430,260 L 10,260 Z" fill="{SHADE}"/></g>'
        f'<g clip-path="url(#tail)"><path d="M 240,236 L 380,230 L 380,256 L 240,262 Z" fill="{CREAM}"/>'
        f'<path d="M 240,280 L 380,274 L 380,298 L 240,304 Z" fill="{CREAM}"/>'
        f'<path d="M 340,140 L 380,140 L 380,330 L 346,330 Z" fill="{SHADE}" opacity="0.55"/></g>'
        f'<rect {KNOT} {KNOT_T} fill="{BASE}"/>'
    )
    inner = f'<path d="{BAND}"/><path d="{FRINGE}"/><rect {KNOT} {KNOT_T}/>'
    return _scarf(shapes, extra, inner, clips)


def scarf_bunny():
    """A candy-striped scarf: diagonal cream stripes down band and tail."""
    clips = f'<clipPath id="tail"><path d="{TAIL}"/></clipPath><clipPath id="band"><path d="{BAND}"/></clipPath>'
    shapes = [shape(TAIL, BASE), shape(BAND, BASE), shape(KNOT, LIGHT, tag='rect', extra=KNOT_T)]
    stripes = ''.join(
        f'<path d="M {x},0 L {x + 30},0 L {x - 70},340 L {x - 100},340 Z" fill="{CREAM}"/>'
        for x in range(40, 640, 62)
    )
    extra = (
        f'<g clip-path="url(#band)">{stripes}'
        f'<path d="M 10,150 C 140,206 300,206 430,150 L 430,260 L 10,260 Z" fill="{SHADE}" opacity="0.5"/></g>'
        f'<g clip-path="url(#tail)">{stripes}</g>'
        f'<rect {KNOT} {KNOT_T} fill="{LIGHT}"/>'
    )
    inner = f'<path d="{BAND}"/><path d="{FRINGE}"/><rect {KNOT} {KNOT_T}/>'
    return _scarf(shapes, extra, inner, clips)


def scarf_bat():
    """A chevron-knit scarf: rows of cream zig-zags down band and tail."""
    clips = f'<clipPath id="tail"><path d="{TAIL}"/></clipPath><clipPath id="band"><path d="{BAND}"/></clipPath>'
    shapes = [shape(TAIL, BASE), shape(BAND, BASE), shape(KNOT, BASE, tag='rect', extra=KNOT_T)]
    # horizontal zig-zag rows, 24px peaks; across the whole art, clipped to each piece
    def zig(y0):
        pts = ' '.join(f'{x},{y0 + (16 if (x // 24) % 2 else 0)}' for x in range(0, 460, 24))
        return f'<polyline points="{pts}" fill="none" stroke="{CREAM}" stroke-width="12" stroke-linejoin="miter"/>'
    rows = ''.join(zig(y) for y in range(8, 340, 48))
    # the band curves, so its zig-zags follow it: vertical rows instead, which read as knit ribs
    ribs = ''.join(
        f'<path d="M {x},0 L {x + 12},40 L {x},80 L {x + 12},120 L {x},160 L {x + 12},200 L {x},240 L {x + 12},280 L {x},320" '
        f'fill="none" stroke="{CREAM}" stroke-width="11" stroke-linejoin="miter"/>'
        for x in range(30, 440, 52)
    )
    extra = (
        f'<g clip-path="url(#band)">{ribs}'
        f'<path d="M 10,150 C 140,206 300,206 430,150 L 430,260 L 10,260 Z" fill="{SHADE}" opacity="0.5"/></g>'
        f'<g clip-path="url(#tail)">{rows}'
        f'<path d="M 340,140 L 380,140 L 380,330 L 346,330 Z" fill="{SHADE}" opacity="0.5"/></g>'
        f'<rect {KNOT} {KNOT_T} fill="{BASE}"/>'
    )
    inner = f'<path d="{BAND}"/><path d="{FRINGE}"/><rect {KNOT} {KNOT_T}/>'
    return _scarf(shapes, extra, inner, clips)


# ── coats ──────────────────────────────────────────────────────────
# A blanket coat: a rounded back panel with a contrasting stripe along the
# back, a cream collar down the front edge (drawn on the right, where the neck
# is), and two belly straps that hang below the hem. Drawn level; the game turns
# it to follow the animal's back, and clips it to her silhouette so it lies on
# her instead of floating over her.

COAT_W, COAT_H = 420, 300

COAT = ('M 28,84 C 26,52 58,34 108,34 L 300,30 C 336,30 358,44 364,76 '
        'C 374,118 378,160 366,200 C 358,228 332,240 300,240 L 118,246 '
        'C 66,246 30,226 28,172 Z')
STRAP_A = 'M 120,238 L 166,238 L 168,280 C 154,292 134,292 118,280 Z'
STRAP_B = 'M 236,238 L 282,238 L 284,280 C 270,292 250,292 234,280 Z'


def _coat(body_extra, seams):
    clips = f'<clipPath id="coat"><path d="{COAT}"/></clipPath>'
    shapes = [shape(STRAP_A, SHADE), shape(STRAP_B, SHADE), shape(COAT, BASE)]
    extra = (
        f'<g clip-path="url(#coat)">'
        f'<path d="M 10,176 C 120,222 300,222 410,176 L 410,270 L 10,270 Z" fill="{SHADE}"/>'
        f'{body_extra}'
        # the collar: cream, down the front edge
        f'<path d="M 306,10 C 326,70 326,170 304,262 L 440,262 L 440,10 Z" fill="{CREAM}"/>'
        f'</g>'
        f'<rect x="136" y="256" width="24" height="16" rx="5" fill="{CREAM}"/>'
        f'<rect x="252" y="256" width="24" height="16" rx="5" fill="{CREAM}"/>'
    )
    inner = (
        f'{seams}'
        f'<path d="M 306,32 C 326,84 326,176 304,244"/>'
        f'<path d="M 120,240 L 166,240 M 236,240 L 282,240"/>'
        f'<rect x="136" y="256" width="24" height="16" rx="5"/>'
        f'<rect x="252" y="256" width="24" height="16" rx="5"/>'
    )
    return _compose(svg(COAT_W, COAT_H, shapes, defs=clips), extra, inner)


def coat_dog():
    """A quilted blanket coat: a piping stripe, two quilting seams, a cream collar, two straps."""
    stripe = f'<path d="M 10,74 L 420,66 L 420,96 L 10,104 Z" fill="{LIGHT}"/>'
    seams = ''.join(f'<path d="M {x},40 C {x - 8},110 {x - 8},180 {x - 2},244"/>' for x in (130, 218))
    return _coat(stripe, seams)


def coat_fox():
    """A tartan blanket coat: crossed stripes, a cream collar, two straps."""
    vert = ''.join(f'<path d="M {x},0 L {x + 24},0 L {x + 24},260 L {x},260 Z" fill="{SHADE}"/>' for x in (80, 190))
    horiz = ''.join(f'<path d="M 0,{y} L 440,{y} L 440,{y + 20} L 0,{y + 20} Z" fill="{SHADE}"/>' for y in (84, 150))
    thin = ''.join(f'<path d="M {x},0 L {x},260" stroke="{CREAM}" stroke-width="6"/>' for x in (140, 250))
    return _coat(f'{vert}{horiz}{thin}', '')


# ── hats ───────────────────────────────────────────────────────────
# Low and wide. The game draws an animal from a frame cut to her own bounds, so
# a hat can go no higher than the top of her head, which makes it sit *down* on
# her face by however much it is tall. These are as short as a hat can be and
# still be one, so the brim lands on her forehead and not across her eyes.

HAT_W, HAT_H = 340, 215


def hat_parrot():
    """A bobble hat: low dome, ribbed cuff, cream pom-pom."""
    dome = 'M 44,150 C 36,84 100,48 170,48 C 240,48 304,84 296,150 Z'
    cuff = 'x="24" y="138" width="292" height="52" rx="20"'
    pom = 'cx="170" cy="40" r="32"'
    clip = f'<clipPath id="dome"><path d="{dome}"/></clipPath>'
    shapes = [shape(dome, BASE), shape(cuff, LIGHT, tag='rect'), shape(pom, CREAM, tag='circle')]
    s = svg(HAT_W, HAT_H, shapes, defs=clip)
    extra = (
        f'<g clip-path="url(#dome)"><path d="M 236,50 C 310,86 310,140 310,150 L 196,150 C 236,120 246,84 236,50 Z" '
        f'fill="{SHADE}"/>'
        f'<path d="M 58,112 C 84,76 130,64 160,64 L 124,88 C 96,98 78,112 68,134 Z" fill="{LIGHT}"/></g>'
    )
    ribs = ''.join(f'<path d="M {x},146 L {x},184"/>' for x in range(54, 310, 32))
    inner = (
        f'{ribs}'
        f'<path d="M 44,150 C 36,84 100,48 170,48 C 240,48 304,84 296,150"/>'
        f'<path d="M 150,34 C 156,44 162,48 170,48"/>'
    )
    return _compose(s, extra, inner)


def hat_snake():
    """A top hat: crown, cream band, flat brim."""
    brim = 'cx="190" cy="206" rx="176" ry="34"'
    crown = 'M 90,200 L 100,62 C 102,38 278,38 280,62 L 290,200 A 100,26 0 0 1 90,200 Z'
    topface = 'cx="190" cy="62" rx="90" ry="22"'
    clip = f'<clipPath id="crown"><path d="{crown}"/></clipPath>'
    shapes = [shape(brim, SHADE, tag='ellipse'), shape(crown, BASE)]
    s = svg(380, 250, shapes, defs=clip)
    extra = (
        f'<ellipse {brim} fill="{BASE}" transform="translate(0,-8)"/>'
        f'<g clip-path="url(#crown)"><path d="M 226,34 L 300,34 L 300,260 L 230,260 Z" fill="{SHADE}"/>'
        f'<path d="M 80,148 L 300,148 L 300,184 L 80,184 Z" fill="{CREAM}"/></g>'
        f'<ellipse {topface} fill="{LIGHT}"/>'
    )
    inner = (
        f'<ellipse {brim} transform="translate(0,-8)"/>'
        f'<path d="M 90,200 L 100,62 M 290,200 L 280,62"/>'
        f'<path d="M 86,150 L 296,150 M 88,184 L 294,184" stroke-width="4"/>'
        f'<ellipse {topface}/>'
        f'<path d="M 90,200 A 100,26 0 0 0 290,200"/>'
    )
    return _compose(s, extra, inner)


def _compose(base_svg, extra, inner):
    """Insert extra fill layers after the fills and the interior lines last."""
    head, tail = base_svg.rsplit('</svg>', 1)
    # the base svg already ends with an optional inner group; we add ours last
    return head + extra + f'<g fill="none" stroke="{INK}" stroke-width="{INNER}" ' \
        f'stroke-linejoin="round" stroke-linecap="round">{inner}</g></svg>'


GARMENTS = {
    'cat-scarf': scarf_cat,
    'bunny-scarf': scarf_bunny,
    'bat-scarf': scarf_bat,
    'dog-coat': coat_dog,
    'fox-coat': coat_fox,
    'parrot-hat': hat_parrot,
    'snake-hat': hat_snake,
}


def render(name):
    png = cairosvg.svg2png(bytestring=GARMENTS[name]().encode('utf-8'))
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    box = im.getchannel('A').getbbox()
    return im.crop(box)


# ── preview, using the same tint as the game ───────────────────────

TONES = (0.62, 0.80, 0.92, 1.0)     # SHADE, BASE, LIGHT, CREAM in luminance
INK_L = 0.106
CREAM_RGB = (255, 246, 226)


def tint(im, hex_):
    r, g, b = (int(hex_[i:i + 2], 16) for i in (1, 3, 5))
    base = (r, g, b)
    shade = tuple(c * 0.68 for c in base)
    light = tuple(c + (255 - c) * 0.32 for c in base)
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            R, G, B, A = px[x, y]
            if A == 0:
                continue
            L = (0.299 * R + 0.587 * G + 0.114 * B) / 255
            if L >= TONES[3] - 0.02:
                c = CREAM_RGB
            elif L >= TONES[2]:
                t = (L - TONES[2]) / (TONES[3] - TONES[2])
                c = tuple(light[i] + (CREAM_RGB[i] - light[i]) * t for i in range(3))
            elif L >= TONES[1]:
                t = (L - TONES[1]) / (TONES[2] - TONES[1])
                c = tuple(base[i] + (light[i] - base[i]) * t for i in range(3))
            elif L >= TONES[0]:
                t = (L - TONES[0]) / (TONES[1] - TONES[0])
                c = tuple(shade[i] + (base[i] - shade[i]) * t for i in range(3))
            else:
                t = max(0.0, (L - INK_L) / (TONES[0] - INK_L))
                ink = (0x24, 0x18, 0x14)
                c = tuple(ink[i] + (shade[i] - ink[i]) * t for i in range(3))
            px[x, y] = (int(c[0]), int(c[1]), int(c[2]), A)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', help='write a contact sheet here (each garment in three colours)')
    ap.add_argument('--no-write', action='store_true', help='do not write into assets/animals')
    args = ap.parse_args()

    ims = {}
    for name in GARMENTS:
        ims[name] = render(name)
        if not args.no_write:
            path = os.path.join(OUT_DIR, f'{name}.png')
            ims[name].save(path, optimize=True)
            print(f'{name}.png  {ims[name].size[0]}x{ims[name].size[1]}  {os.path.getsize(path)}B')

    if args.preview:
        colours = ['#c0392b', '#2c3e50', '#e3b04b']
        cell = 180
        sheet = Image.new('RGBA', (cell * len(GARMENTS), cell * len(colours)), (245, 236, 218, 255))
        for ci, hx in enumerate(colours):
            for gi, (name, im) in enumerate(ims.items()):
                t = tint(im.copy(), hx)
                k = min((cell - 24) / t.size[0], (cell - 24) / t.size[1])
                t = t.resize((max(1, int(t.size[0] * k)), max(1, int(t.size[1] * k))), Image.LANCZOS)
                sheet.alpha_composite(t, (gi * cell + (cell - t.size[0]) // 2, ci * cell + (cell - t.size[1]) // 2))
        sheet.convert('RGB').save(args.preview, quality=70)


if __name__ == '__main__':
    sys.exit(main())
