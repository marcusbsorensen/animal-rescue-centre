#!/usr/bin/env python3
"""Build the A.R.C. contact sheets.

    python3 tools/sheets/build.py            # all four
    python3 tools/sheets/build.py 2 3        # just those two
    python3 tools/sheets/build.py vehicles   # by name, too

Each sheet is a separate module so one can be re-run on its own while its
art is still moving — see README.md for what feeds which.
"""
import importlib
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

SHEETS = [
    ('1', 'buildings', 's1_buildings_map', 'buildings and the map'),
    ('2', 'vehicles', 's2_vehicles', 'the fleet and the traffic'),
    ('3', 'icons', 's3_icons', 'the interface set, drawn and in situ'),
    ('4', 'screens', 's4_screens_animals', 'every screen and its animals'),
]


def wanted(argv):
    if not argv:
        return SHEETS
    picked, unknown = [], []
    for a in argv:
        hit = [s for s in SHEETS if a == s[0] or a.lower() in s[1]]
        picked.extend(hit) if hit else unknown.append(a)
    if unknown:
        sys.exit(f'unknown sheet(s): {", ".join(unknown)}\n'
                 f'pick from: ' + ', '.join(f'{n} ({k})' for n, k, _, _ in SHEETS))
    # de-duplicate, keep sheet order
    return [s for s in SHEETS if s in picked]


def main():
    jobs = wanted(sys.argv[1:])
    for num, key, mod, blurb in jobs:
        print(f'── sheet {num}: {blurb}')
        # A subprocess per sheet: each module runs its work at import time and
        # they share global names, so importing two into one interpreter would
        # have the second inherit the first's `y`.
        r = subprocess.run([sys.executable, os.path.join(HERE, f'{mod}.py')])
        if r.returncode:
            sys.exit(f'sheet {num} failed')


if __name__ == '__main__':
    main()
