#!/usr/bin/env python3
"""check-sprite-refs.py — is every reference the batch will fetch the art we have?

    python3 tools/check-sprite-refs.py                 # all 600 state sprites
    python3 tools/check-sprite-refs.py --species dog    # one species
    python3 tools/check-sprite-refs.py --exclude cat    # the 510

`batch-restyle.py` passes each sprite's **deployment URL** as the reference
image for its own restyle (`images: [{image_url: …}]`, line 234). So a sprite
that is committed locally but not deployed is a request spent restyling the
old art, or a 404 — either way, money spent on nothing. The handover's trap
list says to run this check before every submit; until now it was done by
hand for the 90-cat pilot and nowhere else.

This fetches every URL the submit would use and compares the bytes to the
local file. Exit 0 only when every one is reachable and identical.
"""
import argparse
import concurrent.futures as cf
import hashlib
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'apps/game/public/assets/animals')
BASE_URL = 'https://animal-rescue-centre.vercel.app/assets/animals'

POSES = {'arriving', 'sheltered', 'eating', 'sleeping', 'walking',
         'playing', 'sick', 'scared', 'grumpy', 'growling'}


def check(name):
    local = os.path.join(ASSETS, name)
    with open(local, 'rb') as fh:
        want = hashlib.sha256(fh.read()).hexdigest()
    url = f'{BASE_URL}/{name}'
    try:
        with urllib.request.urlopen(url, timeout=40) as resp:
            body = resp.read()
    except urllib.error.HTTPError as e:
        return name, f'HTTP {e.code}'
    except Exception as e:                                  # noqa: BLE001
        return name, f'{type(e).__name__}: {e}'
    got = hashlib.sha256(body).hexdigest()
    if got != want:
        return name, f'DIFFERENT (live {len(body)}B {got[:12]} vs local {os.path.getsize(local)}B {want[:12]})'
    return name, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--species', help='only this species (stem or stem-variant prefix)')
    ap.add_argument('--exclude', help='skip this species')
    ap.add_argument('--jobs', type=int, default=8)
    args = ap.parse_args()

    names = []
    for f in sorted(os.listdir(ASSETS)):
        if not f.endswith('.png'):
            continue
        stem, _, pose = f[:-4].rpartition('-')
        if pose not in POSES or not stem:
            continue
        if args.species and not (stem == args.species or stem.startswith(args.species + '-')):
            continue
        if args.exclude and (stem == args.exclude or stem.startswith(args.exclude + '-')):
            continue
        names.append(f)

    print(f'checking {len(names)} references against {BASE_URL}')
    bad = []
    with cf.ThreadPoolExecutor(max_workers=args.jobs) as ex:
        for i, (name, err) in enumerate(ex.map(check, names), 1):
            if err:
                bad.append((name, err))
                print(f'  ! {name}: {err}')
            if i % 100 == 0:
                print(f'  … {i}/{len(names)}')

    print(f'\n{len(names) - len(bad)}/{len(names)} reachable and byte-identical')
    if bad:
        print(f'{len(bad)} would be spent on stale or missing art — deploy before submitting')
        sys.exit(1)
    print('safe to submit')


if __name__ == '__main__':
    main()
