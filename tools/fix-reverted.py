#!/usr/bin/env python3
"""Replace the five sprites that came down as the REVERTED camera round.

"Last attachment wins" is right for a re-roll (car-blue) and for a re-attach,
but wrong for a round that was rejected. The camera round (message 9) was
reverted because asking Manus to change the camera destroyed the artwork —
Bea came back a featureless slab, Henry's tyres came back as blobs. The good
version of these five is the PILOT (message 4). Geometry is done in code by
tools/skew-topdown.py instead.
"""
import json
import os
import subprocess

SRC = ('/Users/marcus/.claude/projects/-Users-marcus-Projects-animal-rescue-centre/'
       'cf0b1264-730a-4126-9f9f-22caf5987837/tool-results/'
       'mcp-manus-manus_list_output_messages-1791312288775.txt')
OUT = '/Users/marcus/Projects/animal-rescue-centre/manus-output/vehicles-all'
REVERTED_DIR = 'animal_rescue_sprite_camera_fix'

doc = json.load(open(SRC))
best = {}
for m in doc['messages']:
    for k in ('user_message', 'assistant_message', 'agent_message', 'message'):
        b = m.get(k)
        if not isinstance(b, dict):
            continue
        for a in b.get('attachments') or []:
            fn, path, url = a.get('filename', ''), a.get('path', ''), a.get('url')
            if not (fn.startswith('vehicle-topdown-') and url and path):
                continue
            if REVERTED_DIR in path:        # never take the reverted round
                continue
            best[fn] = (path.split('/')[3], url)

want = ['vehicle-topdown-bea.png', 'vehicle-topdown-car-red.png',
        'vehicle-topdown-henry-rear.png', 'vehicle-topdown-henry.png',
        'vehicle-topdown-tractor.png']
for fn in want:
    if fn not in best:
        print(f'  MISSING a non-reverted version of {fn}')
        continue
    run, url = best[fn]
    dst = os.path.join(OUT, fn)
    for attempt in (1, 2, 3):
        r = subprocess.run(['curl', '-sS', '--retry', '2', '--max-time', '120',
                            '-w', '%{http_code}', '-o', dst, url],
                           capture_output=True, text=True)
        code = (r.stdout or '').strip()[-3:]
        size = os.path.getsize(dst) if os.path.exists(dst) else 0
        if code == '200' and size > 2000:
            print(f'ok  {size // 1024:>5} KB  {fn}   <- {run}')
            break
        print(f'  try{attempt} http {code} {size}B  {fn}')
