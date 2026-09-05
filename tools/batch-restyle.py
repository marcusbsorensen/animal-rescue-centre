#!/usr/bin/env python3
"""batch-restyle.py — restyle animal sprites through OpenAI's Batch API.

    python3 tools/batch-restyle.py submit --test          # 2 sprites, proves the shape
    python3 tools/batch-restyle.py submit                 # all 600
    python3 tools/batch-restyle.py submit --species cat   # one species
    python3 tools/batch-restyle.py status <batch_id>
    python3 tools/batch-restyle.py fetch  <batch_id>      # write the PNGs

**Why batch rather than the serial script.** gpt-image-2 at high takes about
two minutes an image; 600 of them serially is roughly twenty hours. Batch
runs them asynchronously with its own rate limits and bills at half price —
$0.1096 an image against $0.2192, measured from the API rather than
estimated. Turnaround is up to 24h and usually far less.

**Two constraints Batch imposes.** Multipart uploads are not supported, so
the source image cannot be attached the way `gpt-image-regen.sh` attaches
it. It goes by reference instead — and every sprite is already publicly
served from the Vercel deployment, so `image_url` costs nothing to use and
avoids 600 file uploads.

The request shape for image edits in Batch is not documented with an
example, which is why `--test` exists: it submits two lines and reports
exactly what came back, so 598 more are never sent into a shape that does
not work.
"""
import argparse
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'apps/game/public/assets/animals')
DRAFTS = os.path.join(ROOT, 'asset-drafts/batch-restyle')
BASE_URL = 'https://animal-rescue-centre.vercel.app/assets/animals'
API = 'https://api.openai.com/v1'

POSES = ['arriving', 'sheltered', 'eating', 'sleeping', 'walking',
         'playing', 'sick', 'scared', 'grumpy', 'growling']

MODEL = os.environ.get('GPT_IMAGE_MODEL', 'gpt-image-2')
QUALITY = os.environ.get('GPT_IMAGE_QUALITY', 'high')

# Marcus, 2026-09-05, on the first six prototypes:
#   - the ginger cat came back "too 2D" against the others' fur texture,
#     highlights and deeper shadows;
#   - the key line ranges from almost none (white cat) to visible (dog),
#     and should be consistently BLACK, as the snake and the ginger cat are.
# Hence the two clauses below are stated as requirements rather than as
# description: a pale animal is the case that loses its line, and a flat
# source is the case that stays flat unless modelling is demanded.
STYLE = (
    "KEY LINE — every form is enclosed by a distinct BLACK key line, clearly visible on EVERY animal "
    "whatever its colour. On pale, cream and white animals the key line must be just as present and just as "
    "dark as on a dark animal; a pale animal must never lose its outline into the background. The line varies "
    "in weight — heavier where forms overlap or turn away, finer along the lit edge — but it is always "
    "unmistakably there, and it is black, not a tint of the fur. "
    "THREE-DIMENSIONAL FORM — the animal must read as a solid volume in space, never as a flat shape with an "
    "outline drawn round it. Visible specular highlights where the light strikes fur, scale or eye; deep "
    "occlusion shadow in the crevices and wherever one form crosses another; a clear light-to-shadow gradient "
    "across every rounded mass. "
    "TEXTURE — real painted surface: fur as visible painted strands with tonal variation within each mass, "
    "scales as painted scales, feathers as painted barbs. No flat fills anywhere. "
    "LIGHT — from the upper left, consistently. "
    "PALETTE — warm, limited and MUTED; pigment-like rather than bright. Lower the saturation from the "
    "reference. "
    "The eye keeps an iris, a round pupil and ONE small specular highlight, sized in proportion to the head. "
    "NO blushed cheeks, NO cel shading, NO flat vector fill, NO plastic sheen, NO glow, NO even-width outline. "
    "Transparent background, no ground, no floor, NO drop shadow or smudge beneath the feet."
)
KEEP = ("Keep the species, the exact markings and colouring, the face and the proportions identical to the "
        "reference.")
STRIP = ("THE OUTPUT MUST CONTAIN THE ANIMAL AND NOTHING ELSE — delete any bowl, dish, food, mat, blanket, "
         "cushion, bed, box, crate, toy, ball, branch, perch, collar, lead or harness present in the reference "
         "and replace it with empty transparency.")

# Removing an object can take the pose with it — the cat with its bowl
# deleted came back standing rather than eating. These restate the pose for
# the ones where an object was doing the explaining.
POSE_RESTATE = {
    # Deleting the bowl left the cat in a rear-up stalking crouch, which is
    # the CAT PLAY POUNCE the brief defines elsewhere — the object had been
    # carrying the meaning. Hence "rear down, four feet planted".
    # Two iterations to land this. Removing the bowl first gave a rear-up
    # stalking crouch (the CAT PLAY POUNCE, so `eating` and `playing` became
    # confusable); adding "rear down" fixed the posture but the model then
    # scattered kibble on the ground to make eating legible. The ground has
    # to be forbidden as explicitly as the bowl was.
    'eating': ("POSE: head lowered, muzzle down toward the ground, absorbed and content, REAR END DOWN and "
               "all four feet planted flat — a standing animal with its head down to feed, NOT crouched, NOT "
               "with its rear raised, NOT about to pounce. THE GROUND BENEATH THE MUZZLE IS COMPLETELY EMPTY: "
               "no food, no kibble, no crumbs, no scattered morsels, no bowl, nothing at all — the eating "
               "reads from the posture alone."),
    'arriving': ("POSE: keep it sitting on all fours, uncertain and a little hunched, wide worried eyes. It "
                 "must still read as newly arrived and unsure even with any prop gone."),
    'walking': ("POSE: keep it mid-stride, neck and chest completely BARE — no collar, no tag, no ribbon."),
    'playing': ("POSE: keep its play body-language exactly, with paws and mouth EMPTY."),
    'sleeping': ("POSE: keep it curled and asleep, resting on nothing."),
}


def key():
    k = os.environ.get('OPENAI_API_KEY')
    if not k:
        with open(os.path.join(ROOT, '.env.local')) as fh:
            for line in fh:
                if line.startswith('OPENAI_API_KEY='):
                    k = line.split('=', 1)[1].strip()
                    break
    if not k:
        sys.exit('OPENAI_API_KEY not found in env or .env.local')
    return k


def org():
    o = os.environ.get('OPENAI_ORG_ID')
    if not o and os.path.exists(os.path.join(ROOT, '.env.local')):
        with open(os.path.join(ROOT, '.env.local')) as fh:
            for line in fh:
                if line.startswith('OPENAI_ORG_ID='):
                    o = line.split('=', 1)[1].strip()
                    break
    return o


def req(method, path, data=None, headers=None, raw=None):
    h = {'Authorization': f'Bearer {key()}'}
    if org():
        h['OpenAI-Organization'] = org()
    h.update(headers or {})
    body = raw if raw is not None else (json.dumps(data).encode() if data else None)
    if data is not None and raw is None:
        h['Content-Type'] = 'application/json'
    r = urllib.request.Request(f'{API}{path}', data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        sys.exit(f'HTTP {e.code} on {method} {path}\n{e.read().decode()[:900]}')


def sprites(species=None, poses=None, limit=None):
    out = []
    for f in sorted(os.listdir(ASSETS)):
        if not f.endswith('.png'):
            continue
        stem, _, pose = f[:-4].rpartition('-')
        if pose not in POSES or not stem:
            continue
        if poses and pose not in poses:
            continue
        if species and not (stem == species or stem.startswith(species + '-')):
            continue
        out.append((stem, pose))
    return out[:limit] if limit else out


def line_for(stem, pose):
    prompt = ' '.join(x for x in (STRIP, POSE_RESTATE.get(pose, 'POSE: identical to the reference.'),
                                  KEEP, STYLE) if x)
    return {
        'custom_id': f'{stem}-{pose}',
        'method': 'POST',
        'url': '/v1/images/edits',
        'body': {
            'model': MODEL,
            'prompt': prompt,
            'size': '1024x1024',
            'quality': QUALITY,
            'background': 'transparent',
            'output_format': 'png',
            'n': 1,
            # The parameter is `images`, an ARRAY OF OBJECTS. Established by
            # probe batch batch_6a9c19bb…: a bare URL string gives
            # "expected an object", a `type` key gives "unknown parameter",
            # and `image` (singular) gives "use 'images' (array)". The
            # `input_reference` shape suggested by the docs search is for a
            # different endpoint and fails with "Missing required parameter:
            # 'images'" — which is what a 600-line batch would have returned.
            'images': [{'image_url': f'{BASE_URL}/{stem}-{pose}.png'}],
        },
    }


def cmd_submit(args):
    items = sprites(args.species, args.pose.split(',') if args.pose else None,
                    2 if args.test else None)
    if not items:
        sys.exit('no sprites matched')
    os.makedirs(DRAFTS, exist_ok=True)
    jsonl = os.path.join(DRAFTS, 'requests.jsonl')
    with open(jsonl, 'w') as fh:
        for stem, pose in items:
            fh.write(json.dumps(line_for(stem, pose)) + '\n')
    print(f'{len(items)} requests → {jsonl}')
    print(f'  model {MODEL} quality {QUALITY}')
    print(f'  est. ${len(items) * 0.1096:.2f} at the batch rate')
    if args.dry_run:
        print(json.dumps(line_for(*items[0]), indent=1)[:1200])
        return

    # multipart upload of the JSONL itself (this part IS multipart)
    boundary = '----arcbatch'
    body = b''
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nbatch\r\n'.encode()
    body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
             f'filename="requests.jsonl"\r\nContent-Type: application/jsonl\r\n\r\n').encode()
    body += open(jsonl, 'rb').read() + b'\r\n'
    body += f'--{boundary}--\r\n'.encode()
    up = req('POST', '/files', raw=body,
             headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    print(f'uploaded {up["id"]}')

    b = req('POST', '/batches', data={
        'input_file_id': up['id'],
        'endpoint': '/v1/images/edits',
        'completion_window': '24h',
        'metadata': {'purpose': 'arc animal restyle 2026-09-05'},
    })
    print(f'batch {b["id"]}  status {b["status"]}')
    with open(os.path.join(DRAFTS, 'last-batch-id'), 'w') as fh:
        fh.write(b['id'])
    print(f'\npython3 tools/batch-restyle.py status {b["id"]}')


def cmd_status(args):
    b = req('GET', f'/batches/{args.batch_id}')
    c = b.get('request_counts', {})
    print(f'{b["id"]}  {b["status"]}')
    print(f'  total {c.get("total")}  completed {c.get("completed")}  failed {c.get("failed")}')
    for k in ('created_at', 'in_progress_at', 'completed_at', 'expires_at'):
        if b.get(k):
            print(f'  {k}: {time.strftime("%Y-%m-%d %H:%M", time.localtime(b[k]))}')
    if b.get('errors'):
        print('  errors:', json.dumps(b['errors'])[:600])
    if b.get('error_file_id'):
        print(f'  error_file_id: {b["error_file_id"]}  '
              f'(fetch shows the first few)')


def _download(file_id):
    h = {'Authorization': f'Bearer {key()}'}
    if org():
        h['OpenAI-Organization'] = org()
    r = urllib.request.Request(f'{API}/files/{file_id}/content', headers=h)
    with urllib.request.urlopen(r) as resp:
        return resp.read()


def cmd_fetch(args):
    import base64
    b = req('GET', f'/batches/{args.batch_id}')
    if b['status'] != 'completed':
        print(f'status is {b["status"]}, not completed')
        if not b.get('output_file_id'):
            return
    if b.get('error_file_id'):
        errs = _download(b['error_file_id']).decode().splitlines()
        print(f'{len(errs)} errors; first:')
        for line in errs[:3]:
            print('  ', line[:400])
    if not b.get('output_file_id'):
        return
    os.makedirs(DRAFTS, exist_ok=True)
    out = _download(b['output_file_id']).decode()
    n = 0
    for line in out.splitlines():
        rec = json.loads(line)
        cid = rec['custom_id']
        body = (rec.get('response') or {}).get('body') or {}
        data = body.get('data') or []
        if not data or 'b64_json' not in data[0]:
            print(f'  ! {cid}: {json.dumps(rec.get("error") or body)[:200]}')
            continue
        p = os.path.join(DRAFTS, f'{cid}-raw.png')
        with open(p, 'wb') as fh:
            fh.write(base64.b64decode(data[0]['b64_json']))
        n += 1
    print(f'wrote {n} raw PNGs to {DRAFTS}')
    print('next: matte with tools/rembg-cut.py, resize to 512, then copy over the originals')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('submit')
    s.add_argument('--test', action='store_true', help='2 sprites only')
    s.add_argument('--dry-run', action='store_true', help='write the JSONL, send nothing')
    s.add_argument('--species')
    s.add_argument('--pose')
    s.set_defaults(fn=cmd_submit)
    for name, fn in (('status', cmd_status), ('fetch', cmd_fetch)):
        p = sub.add_parser(name)
        p.add_argument('batch_id')
        p.set_defaults(fn=fn)
    args = ap.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
