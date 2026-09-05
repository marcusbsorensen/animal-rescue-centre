#!/usr/bin/env python3
"""rembg-cut.py — matte a generated sprite to a clean transparent cut-out.

    ~/.arc-rembg-venv/bin/python tools/rembg-cut.py <in.png> <out.png>

Why this exists rather than `rembg i in out`: the venv at ~/.arc-rembg-venv
carries the library and its ONNX runtime but not the `[cli]` extra, so the
`rembg` console script reports "CLI dependencies are not installed". The
Python API is present and is all the pipeline actually needs.

`gpt-image-regen.sh` already asks OpenAI for `background=transparent`, so
the raw is usually transparent before this runs. rembg still earns its
place: on the 2026-07 hedgehog set it tightened roughly 3% of the opaque
pixels, all of it at the fuzzy spine and fur edges that the API's own
matte leaves soft. Cheap insurance against a halo.
"""
import sys

from PIL import Image
from rembg import remove


def main():
    if len(sys.argv) != 3:
        sys.exit(f'usage: {sys.argv[0]} <in.png> <out.png>')
    src, dst = sys.argv[1], sys.argv[2]
    im = Image.open(src)
    out = remove(im)
    if out.mode != 'RGBA':
        out = out.convert('RGBA')
    out.save(dst)


if __name__ == '__main__':
    main()
