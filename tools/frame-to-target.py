#!/usr/bin/env python3
"""frame-to-target.py — normalise a sprite's alpha bounding box to a target framing.

Generated sprites land close to the right framing but rarely inside the spread
of the existing set, and sprites that disagree on bounding box visibly jump when
the game swaps an animal between states. This rescales the drawn content so its
alpha box matches a target height and top padding, then re-centres it
horizontally on a square canvas.

Scaling is uniform — aspect ratio is never distorted. Height is the binding
constraint because it is what varies most by state (a `sick` animal lies flat at
~48%, a `sheltered` one sits tall at ~83%); width then falls where the pose puts
it, which is correct.

Usage:
  tools/frame-to-target.py <in.png> <out.png> <height%> <top-pad%> [canvas]

Example (dog sheltered, to 512px):
  tools/frame-to-target.py raw.png final.png 83 10 512
"""
import sys
from PIL import Image


def alpha_box(im, threshold=8):
    a = im.getchannel("A")
    box = a.point(lambda v: 255 if v > threshold else 0).getbbox()
    if box is None:
        raise SystemExit("ERROR: image is fully transparent")
    return box


def main():
    if len(sys.argv) not in (5, 6):
        raise SystemExit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]
    target_h = float(sys.argv[3]) / 100.0
    target_top = float(sys.argv[4]) / 100.0
    canvas = int(sys.argv[5]) if len(sys.argv) == 6 else 512

    im = Image.open(src).convert("RGBA")
    x0, y0, x1, y1 = alpha_box(im)
    content = im.crop((x0, y0, x1, y1))
    cw, ch = content.size

    # Uniform scale so the content's height occupies target_h of the canvas.
    # Wide, flat poses (a sleeping bunny, a sick animal lying out) can overflow
    # the canvas at that scale, so clamp to MAX_W and say so — a sprite that
    # touches the frame edge looks clipped in game.
    MAX_W = 0.95
    scale = (target_h * canvas) / ch
    clamped = False
    if cw * scale > MAX_W * canvas:
        scale = (MAX_W * canvas) / cw
        clamped = True
    new_w, new_h = max(1, round(cw * scale)), max(1, round(ch * scale))
    content = content.resize((new_w, new_h), Image.LANCZOS)

    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(content, ((canvas - new_w) // 2, round(target_top * canvas)), content)
    out.save(dst)

    # Report the achieved framing so a caller can assert on it.
    bx0, by0, bx1, by1 = alpha_box(out)
    print(
        f"OK: {dst}  w {100*(bx1-bx0)/canvas:.1f}%  h {100*(by1-by0)/canvas:.1f}%  "
        f"top {100*by0/canvas:.1f}%  (target h {100*target_h:.0f}%, top {100*target_top:.0f}%)"
        + ("  [width-clamped: pose too wide for the height target]" if clamped else "")
    )


if __name__ == "__main__":
    main()
