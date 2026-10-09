#!/usr/bin/env python3
"""openai-spend.py - what OpenAI actually billed, from the invoice rather than arithmetic.

    python3 tools/openai-spend.py                # today, by line item
    python3 tools/openai-spend.py --days 7       # the last week, by day
    python3 tools/openai-spend.py --check        # just say whether the key works

**Why this exists.** Every cost figure in the 2026-10-09 sprite rounds was
arithmetic on the `usage` object each response returns - tokens multiplied by a
rate read from documentation. That is an estimate, and it was wrong once
already: $51.84 was 473 x gpt-image-2's batch rate, and the round went to a
different model at a different price. This asks the billing system instead.

**It needs an ADMIN key, which is not the key the rest of the project uses.**
`/v1/organization/*` refuses a project key (`sk-proj-`) with a bare 403 and no
explanation, which is what made this look like a bug rather than a credential
type. Create one at platform.openai.com -> Settings -> Organization -> Admin
keys, then put it in `.env.local` (already gitignored) as:

    OPENAI_ADMIN_KEY=sk-admin-...

Nothing else in the project reads that variable, and this script reads nothing
else: it will NOT fall back to the project key, because a silent fallback is
how an estimate gets reported as an invoice.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VAR = 'OPENAI_ADMIN_KEY'


def admin_key():
    """The admin key, from the environment or .env.local. Never the project key."""
    if os.environ.get(VAR):
        return os.environ[VAR]
    for name in ('.env.local', '.env'):
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            continue
        for line in open(path):
            m = re.match(r'\s*(?:export\s+)?' + VAR + r'\s*=\s*["\']?([^"\'\s]+)', line)
            if m:
                return m.group(1)
    return None


def get(path, key):
    req = urllib.request.Request('https://api.openai.com/v1' + path,
                                 headers={'Authorization': 'Bearer ' + key})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def explain(code, key):
    if code not in (401, 403):
        return f'HTTP {code}.'
    kind = 'a project key (sk-proj-)' if key.startswith('sk-proj-') else 'this key'
    return (f'HTTP {code}. The costs endpoint takes an ADMIN key, and it was given {kind}.\n'
            f'   Create one at platform.openai.com -> Settings -> Organization -> Admin keys,\n'
            f'   then add it to .env.local as {VAR}=sk-admin-...\n'
            f'   Or read it in the browser instead: platform.openai.com/usage')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=1, help='how many days back (default 1, today)')
    ap.add_argument('--check', action='store_true', help='report whether the key works, then stop')
    a = ap.parse_args()

    key = admin_key()
    if not key:
        print(f'No {VAR} set.\n' + explain(403, 'sk-proj-'))
        return 2
    if not key.startswith('sk-admin-'):
        print(f'{VAR} is set but does not look like an admin key (expected sk-admin-).')

    start = int(time.time()) - a.days * 86400
    try:
        d = get(f'/organization/costs?start_time={start}&bucket_width=1d'
                f'&group_by=line_item&limit={max(a.days, 1) + 1}', key)
    except urllib.error.HTTPError as e:
        print('Could not read costs. ' + explain(e.code, key))
        return 1

    if a.check:
        print('Admin key works; the costs endpoint answered.')
        return 0

    total = 0.0
    for bucket in d.get('data', []):
        rows = bucket.get('results') or []
        if not rows:
            continue
        day = time.strftime('%Y-%m-%d', time.gmtime(bucket.get('start_time', start)))
        print(f'\n{day}')
        for r in sorted(rows, key=lambda r: -float((r.get('amount') or {}).get('value') or 0)):
            v = float((r.get('amount') or {}).get('value') or 0)
            cur = (r.get('amount') or {}).get('currency', 'usd').upper()
            total += v
            print(f'   {(r.get("line_item") or "unattributed"):<44} {v:>9.4f} {cur}')
    plural = 's' if a.days != 1 else ''
    print(f'\n{"TOTAL":<47} {total:>9.4f} USD   ({a.days} day{plural} to now)')
    if total == 0:
        print('\nZero is a real answer: failed batch requests are not billed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
