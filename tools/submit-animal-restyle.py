#!/usr/bin/env python3
"""submit-animal-restyle.py — the 2026-10-09 animal restyle round, as briefed.

    python3 tools/submit-animal-restyle.py plan                     # counts, cost, held-back list
    python3 tools/submit-animal-restyle.py plan --show-prompt       # the full prompt for one sprite
    python3 tools/submit-animal-restyle.py submit --group untested  # batch A
    python3 tools/submit-animal-restyle.py submit --group proven    # batch B
    python3 tools/submit-animal-restyle.py status <batch_id>
    python3 tools/submit-animal-restyle.py fetch  <batch_id> --group untested

**Why this exists rather than `batch-restyle.py submit`.** Three things the
round needs that that script cannot express:

1. **The 37 held back.** `.claude/notes/animal-sprite-brief.md` §5 holds back
   every source that is not 512x512 — 35 at 128px and `raccoon-walking` /
   `skunk-walking` at 256px. Handing gpt-image-2 a 128px reference and asking
   for 1024px out is an invented redraw, not a restyle, and it is the one part
   of the round with no pilot evidence behind it. `batch-restyle.py` filters by
   species and pose only, so the hold-back is stated here as a measurement of
   the source file rather than as a hand-typed list of names.
2. **The three clauses §3 adds** — PROJECTION AND CAMERA (Rules 7 and 8),
   FRAME (Rule 8), and the consolidated NOT-ALLOWED blocklist — plus Rule 6's
   mandatory STOP-on-reference-failure line. `STRIP`, `KEEP` and
   `POSE_RESTATE` are imported verbatim from `batch-restyle.py`.
   **`STYLE` and `VOLUME` are NOT** — they are restated here in the flat
   line-and-wash register Marcus chose on 2026-10-09, for the reasons set out
   above `STYLE` below. `batch-restyle.py` keeps the modelled-volume wording
   because other flows still import it; this round does not use it.
3. **Two groups, two batches.** The untested surfaces (snake, parrot, bat, and
   the pale long-haired variants) go as their own batch so they can be
   fetched, measured and re-rolled without waiting on the pilot-proven half.

**Scale is deliberately absent from the prompt.** §2(a): `install-restyled.py`
crops to the subject and squares at a 1.06 margin, so any scale the artist
draws is deleted at install. Relative scale lives in
`packages/game-logic/src/animal-scale.ts` and is applied by the sprite layer.
Asking for it here invites drift on a property that will be overwritten.

**References are LINKED, not attached, and that is forced.** The Batch API
does not accept multipart bodies (`batch-restyle.py`'s own docstring, and the
reason it passes `images: [{image_url: ...}]`). Attaching would mean the
serial `/v1/images/edits` path at $0.2192 an image — double the approved
spend, and about twenty hours wall-clock. The mitigation is
`tools/check-sprite-refs.py`, which fetches every URL this submit will use
and compares bytes to the local file; run it immediately before submitting,
not today-and-assume.
"""
import argparse
import base64
import importlib.util
import json
import os
import sys
import time

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'apps/game/public/assets/animals')
OUT = os.path.join(ROOT, 'asset-drafts/animal-restyle-2026-10-09')

# $ per image on the Batch API, half the serial rate. MEASURED FOR gpt-image-2,
# which this round can no longer use. Kept as the CEILING the guard holds the
# round to, because it is the rate the approved $51.84 was computed at: if
# sunburst turns out to bill exactly like gpt-image-2 per image, the round
# still lands on the approved number and not a penny above it.
BATCH_RATE = 0.1096
APPROVED = 51.84             # Marcus, 2026-10-09, for 473 sprites
EXPECT_SEND = 473
EXPECT_HELD = 37

# What the round is actually expected to cost, from published per-token rates
# rather than a per-image estimate. developers.openai.com/api/docs/pricing,
# read 2026-10-09: gpt-image-2.5-sunburst standard is $5.00/1M text input,
# $8.00/1M image input, $30.00/1M image output, and the Batch table is exactly
# half of each. Measured usage for one high 1024x1024 sprite on this exact
# path (§28, three probes, all identical in shape): 1,024 image input tokens,
# ~2,537 text input tokens, 1,756 image output tokens, 0 text output.
#
#   image out  1,756 x $15.00/1M = $0.026340
#   text in    2,537 x  $2.50/1M = $0.006343
#   image in   1,024 x  $4.00/1M = $0.004096
#                                  ---------
#                                  $0.036779  per sprite
#
# The text-input figure is the one that moves with the prompt, and it is the
# smallest of the three; `cmd_plan` recomputes it from the longest prompt the
# round will actually send rather than trusting the probe's.
PRICE_BATCH = {'text_in': 2.50e-6, 'image_in': 4.00e-6, 'image_out': 15.00e-6}
IMAGE_IN_TOKENS = 1024       # measured, one 512x512 PNG reference
IMAGE_OUT_TOKENS = 1756      # measured, sunburst high 1024x1024, three probes
CHARS_PER_TOKEN = 4.283      # measured: 10,863-char prompt -> 2,537 text tokens


def expected_rate(prompt_chars):
    """$ per sprite on the Batch API, from published rates and measured usage."""
    return (IMAGE_OUT_TOKENS * PRICE_BATCH['image_out']
            + IMAGE_IN_TOKENS * PRICE_BATCH['image_in']
            + (prompt_chars / CHARS_PER_TOKEN) * PRICE_BATCH['text_in'])


def _load_batch_restyle():
    path = os.path.join(ROOT, 'tools/batch-restyle.py')
    spec = importlib.util.spec_from_file_location('arc_batch_restyle', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


BR = _load_batch_restyle()

# --- the clauses §3 adds, verbatim from the brief -------------------------

PROJECTION = (
    "PROJECTION AND CAMERA. One world, one camera, one hand. Every animal is a front-elevation stamp on "
    "transparent ground, seen from a child's eye level and square on — the same convention as every building, "
    "tree and prop in this game. Never top-down, never isometric, never a three-quarter ground plane, never a "
    "tilted horizon. The animal stands or lies on an implied flat floor that is not drawn."
)

FRAME = (
    "FRAME — NOTHING IS SHOWN CROPPED. The whole animal is inside the image: every paw, ear, tail, wing-tip, "
    "snout and whisker. No part touches or crosses the canvas edge. Leave clear transparent margin on all four "
    "sides — at least 2% of the width, and more above the head. The animal is drawn large within that margin: "
    "its longest dimension should reach at least 70% of the canvas, so that the sprite carries real painted "
    "detail. Do not shrink the animal to make something else fit; there is nothing else in the image. "
    # 2026-10-09: added because this clause was a measurable PRESSURE toward the
    # silhouette drift below. "Drawn large, nothing cropped" is cheapest to
    # satisfy by pulling a spread wing or a trailing leg in, which makes the
    # bounding box compact. Say instead that the frame yields to the animal.
    "If the animal's pose is wide, low or lopsided, FIT THE FRAME TO THE ANIMAL — never the animal to the "
    "frame. Nothing here is a reason to pull a limb, wing or tail in."
)

# 2026-10-09 — the pose-fidelity fix. All three flat-register probes folded in
# the source `bat-brown-arriving`'s outstretched, dragging left wing; silhouette
# IoU 0.617 / 0.641 / 0.660. These are POSE-SPECIFIC sprites (arriving, walking,
# sleeping, eating, scared, sick, sheltered, growling), so a quietly altered
# pose is a sprite that is wrong for the state it is drawn for, 473 times over.
#
# Diagnosed before it was rewritten, and it is BOTH too weak and overridden:
#
#   - `KEEP` enumerates what must stay identical — "species, the exact markings
#     and colouring, the face and the proportions" — and the silhouette is not
#     on the list. An enumerated keep-list licenses changing what it omits.
#   - `POSE_RESTATE['arriving']` says "sitting on all fours ... a little
#     hunched", which is a description of a COMPACT posture and says nothing
#     about wings at all. The model drew the words rather than the picture, and
#     the words argue for the failure.
#   - `SELF_CHECK`'s recognition question tested markings only, so the model's
#     own verification pass could not catch a folded wing.
#   - `FRAME` pushed the same way (see the sentence added above).
#   - Structurally: one unheaded 160-character sentence, ninth of twelve, in a
#     6,449-character prompt where every other rule carries a capitalised head.
#
# So the fix is four-part, not one: this clause (headed, in the KEEP position),
# a lead sentence that subordinates the pose words to the reference, a
# NOT ALLOWED entry, and a SELF-CHECK question. Concrete about the failure
# rather than adjectival: the model is told what tidying looks like.
SILHOUETTE = (
    "SILHOUETTE — NOT YOURS TO REDRAW. Trace the reference's outline and keep it. Every limb, wing, ear, "
    "tail, paw, head and body is at the same angle and the same EXTENSION as the reference puts it: what is "
    "stretched out stays stretched out, what is spread stays spread, what is folded stays folded, what is "
    "dropped or dragging on the ground stays dropped and dragging, what is raised stays raised. "
    "THE FAILURE TO AVOID IS TIDYING. A wing, leg or tail that the reference draws extended, trailing, "
    "drooping or lopsided comes back folded in, tucked up, shortened, or straightened to match the other "
    "side, because the compact shape looks neater and better balanced. It is neater and it is WRONG: these "
    "sprites are drawn one per state, and the state is carried by the pose, so a tidied pose is a sprite "
    "that no longer means what it is used for. IF THE REFERENCE IS ASYMMETRIC, THE RESTYLE IS ASYMMETRIC IN "
    "EXACTLY THE SAME WAY — do not mirror one side onto the other, do not even out a lopsided stance. "
    "Before you draw, go through the reference limb by limb — each wing, each leg, each ear, the tail — and "
    "note for each whether it is extended or folded and which way it points; then reproduce that list "
    "exactly. You are changing only how the INSIDE of this outline is painted: the drawn line and the flat "
    "colours. You are not changing where the outline goes."
)

# 2026-10-09, FINAL: `batch-restyle.py`'s STRIP, unextended.
#
# A 585-character extension used to hang off the end of this — "A PART OF THE
# ANIMAL IS NEVER A PROP … if you are unsure whether a shape is a prop or a
# part of the animal, IT IS PART OF THE ANIMAL — keep it." It was written to
# stop STRIP deleting `bat-brown-arriving`'s "trailing left wing".
#
# **There is no trailing wing.** The source draws both of that bat's wings as
# brown membranes hanging from the shoulders, and separately, on the ground
# beside it, a pale cream cloth carrying sling with knotted corners. §20-21 of
# the note. Every roll keeps both wings; what the rolls delete is the sling,
# and deleting it is precisely what STRIP exists to do.
#
# So the extension was a fix for a fault that does not exist, and its closing
# sentence argues AGAINST STRIP on the sprites that most need it: all 60
# `-arriving` sprites carry a delivery prop — boxes, folded towels, carriers,
# a branch, and for three other bats a folded blanket. Telling the model that
# an uncertain shape is part of the animal is telling it to keep those.
#
# Deleted, which restores STRIP's authority over exactly those 60 sprites.
# The one probe that still carried the extension stripped the sling anyway,
# so removing it can only strengthen prop removal, never weaken it.
STRIP = BR.STRIP

POSE_LEAD = (
    "POSE — the line below names what the reference ALREADY SHOWS, as a reminder, and is about attitude and "
    "expression. It is not a redesign and not a fresh description to draw from. WHERE EVERY LIMB, WING, EAR "
    "AND TAIL SITS IS SETTLED BY THE REFERENCE ALONE, including everything the line below does not mention."
)

# Round-local overrides of `batch-restyle.py`'s POSE_RESTATE, for the same
# reason STYLE and VOLUME are round-local: `batch-restyle.py` is shared with
# other flows, and §8 of the note proves the held request files byte-for-byte
# by rebuilding the old prompt from it, which only works while it is intact.
#
# Only `arriving` is overridden. `eating` carries five rounds of tuning the
# note warns against reopening, and `walking` / `playing` / `sleeping` have no
# measured failure; POSE_LEAD covers all of them.
POSE_RESTATE = dict(
    getattr(BR, 'POSE_RESTATE', {}),
    arriving=("POSE: keep the posture EXACTLY as the reference has it — newly arrived, uncertain, wide "
              "worried eyes. 'Hunched' is about the head, neck and shoulders only; it is NOT permission to "
              "draw a wing, leg, ear or tail closer to the body than the reference draws it. If the "
              "reference has a wing spread, a wing trailing on the ground, or one side held differently "
              "from the other, that is the pose — keep it. It must still read as newly arrived and unsure "
              "even with any prop gone."),
)

GROUND = (
    "GROUND. Transparent beneath the feet and everywhere else. No pavement, road, grass, straw, bedding, floor, "
    "kerb or painted ground plane. NO cast shadow, smudge, oval or contact patch of any kind — animals in this "
    "game are composited onto scenes that draw their own ground and their own shadow."
)

# --- the style, rewritten flat (2026-10-09) -------------------------------
#
# The round's first high-quality probe on gpt-image-1.5 came back, in Marcus's
# words, **too saturated and with the detail lost**. Measured against the
# source `bat-brown-arriving`, scale-matched: distinct colours 249 -> 46,632,
# saturation mean 0.666 -> 0.758, local contrast 9.74 -> 10.41.
#
# Local contrast did NOT fall, so "lost detail" is not lost contrast. The old
# `STYLE` demanded "Visible specular highlights", "deep occlusion shadow in the
# crevices", "a clear light-to-shadow gradient across every rounded mass" and
# "No flat fills anywhere" — and the model obeyed all four. The bat's structure
# stopped being DRAWN and started being LIT. That is the lost detail, and it is
# where the 46,632 colours came from.
#
# The old `PALETTE` line already said "warm, limited and MUTED ... Lower the
# saturation from the reference" and the output came back 1.14x MORE saturated.
# Colour instruction is not honoured, so colour leaves the prompt entirely and
# is set deterministically afterwards by `tools/regrade-to-source.py`.
#
# So: flat line-and-wash, the same family as the vehicles. Detail stays drawn.
# Kept from the old wording, deliberately: the whole KEY LINE paragraph
# (a pale animal losing its outline is a legibility failure, not a style
# preference) with its varying line weight, and the eye clause — in a flat
# register that highlight is a drawn dot, not a render artefact.
STYLE = (
    "STYLE — FLAT LINE AND WASH. This is a drawing, not a render. Every form is built from flat areas of "
    "uniform colour, bounded by a drawn line. LARGE UNBROKEN AREAS OF ONE FLAT COLOUR ARE CORRECT AND ARE "
    "WANTED: a wash does not have to vary across a mass to be finished, and an area of perfectly even colour "
    "is a finished area, not an unfinished one. "
    "KEY LINE — every form is enclosed by a distinct BLACK key line, clearly visible on EVERY animal "
    "whatever its colour. On pale, cream and white animals the key line must be just as present and just as "
    "dark as on a dark animal; a pale animal must never lose its outline into the background. The line varies "
    "in weight — heavier where forms overlap or turn away, finer along the lit edge — but it is always "
    "unmistakably there, and it is black, not a tint of the fur. "
    "DETAIL IS DRAWN, NOT LIT. Every piece of detail in this sprite is a mark someone drew: interior contour "
    "lines where a limb meets the body, an ear meets the head or a wing folds; the animal's own markings as "
    "crisp-edged shapes; the lie and direction of the coat indicated by A FEW DELIBERATE STROKES at the edge "
    "of a mass and at the chest and cheeks, never rendered strand by strand; and the clean boundary between "
    "one flat wash and the next. Build the animal's structure by drawing it. Do NOT build it by shading: no "
    "gradient across a rounded mass, no airbrushed or soft falloff, no specular highlight or glossy hotspot, "
    "no deep occlusion shadow in the crevices, no blurred or feathered edge between two tones. "
    "WHERE A SHADOW IS NEEDED it is ONE further flat tone of the same colour with a clean, drawn edge — a "
    "shape, not a fade — and nothing in between it and the lit tone. Two flat tones to a mass; never three "
    "and never a ramp. LIGHT — the implied light is from the upper left, consistently, so the second tone "
    "falls on the lower right of each form. "
    # 2026-10-09: all three probes drew a large highlight plus extra sparkles.
    # "ONE small highlight" was buried mid-sentence and said nothing about what
    # a second one costs. Now the count is the head of the clause, the model is
    # told to count, and the two things a second dot breaks are named: it is
    # the clearest render tell in the whole sprite, and it changes the
    # expression, which on a pose-specific set is a meaning error.
    "THE EYE — iris, a round pupil, and EXACTLY ONE highlight in each eye. ONE. Not two, not a big one with "
    "a small one beside it, not a scatter of sparkles, not a bright rim. It is a single small dot of flat "
    "colour that someone DREW, sized in proportion to the head and placed in the same position in both "
    "eyes. COUNT THEM BEFORE YOU FINISH: two eyes, two dots, and no other light anywhere in the eye. A "
    "second dot or a sparkle is the clearest sign of the glossy 3D render this sprite must not be, and it "
    "makes the animal read as startled or tearful instead of whatever this pose is meant to show. "
    # 2026-10-09, measured: the SOURCE sprites themselves carry two highlights
    # per eye (six bright blobs in `bat-brown-arriving`'s eye band). So "ONE
    # highlight" has spent five rounds arguing with KEEP's "the face identical
    # to the reference" AND with the picture in front of the model, and losing.
    # The conflict is named and resolved here rather than shouted at again.
    "THE EYE IS THE ONE PLACE WHERE YOU DEPART FROM THE REFERENCE: the reference sprites were painted with "
    "two highlights in each eye, and this style has one. Where the reference eye has two, keep the larger "
    "and drop the other. Everything else about the face — shape, expression, markings, where the animal is "
    "looking — still matches the reference exactly. "
    "NO blushed cheeks, NO plastic sheen, NO glow, NO even-width outline. "
    "Transparent background, no ground, no floor, NO drop shadow or smudge beneath the feet."
)

# `batch-restyle.py`'s `VOLUME` did two different jobs in one paragraph. The
# shoulder and hip "each catch their own highlight" and the belly that "turns
# away into shadow" are modelled shading and are gone. What survives is the
# half that is about where marks are DRAWN — markings wrapping the form rather
# than lying on the silhouette like paint on a cut-out — which is exactly how a
# flat style says "solid" without shading anything.
VOLUME = (
    "MARKINGS FOLLOW THE BODY — this animal is SHORT-COATED, so what makes it read as solid is where the "
    "marks sit, not how it is lit. Its stripes, patches and markings WRAP AROUND the ribcage and the haunch, "
    "curving and compressing as they cross the form, rather than lying flat on the silhouette like paint on a "
    "cut-out. Draw the turn of the body with the markings and with interior contour lines. Do not shade it."
)

# A fresh OpenAI probe on 2026-10-09 (`.claude/notes/openai-recommission-2026-10-09.md`)
# came back with an invented cartoon dog and cat and a "RESCUE ANIMALS" sign
# across a crate that asked for neither, in big-eyed kawaii with flat cel
# shading. References were attached and the STOP line was included. So the
# positive description is not enough on its own: what must not appear is
# stated as a list.
#
# 2026-10-09, flat register: three entries were REMOVED because they now
# contradict what is being asked for — "no cel shading", "no flat vector fill"
# and "no comic-book flats" all forbid flat areas of uniform colour, which is
# the register. What they were really guarding against was the machine-clean
# look, so that is now said precisely (no even-width vector outline, no
# flat-icon geometry, no gradient mesh) instead of by banning flatness.
# Added in their place: everything that produces modelled surface.
NOT_ALLOWED = (
    "NOT ALLOWED — any of these and the sprite is rejected. No second animal, no invented creature, no person, "
    "no face peeking in. No prop of any kind: no bowl, dish, food, kibble, crumb, mat, blanket, cushion, bed, "
    "box, crate, toy, ball, branch, perch, collar, lead, harness, ribbon or tag. No text, no lettering, no "
    "numerals, no sign, no signage, no label, no logo, no watermark, no speech bubble. No background of any "
    "kind: no sky, no wall, no room, no scenery, no vignette, no coloured field, no gradient wash behind the "
    "animal. No ground and NO SHADOW — no cast shadow, contact oval, smudge or darkened patch under or beside "
    "the animal. No part of the animal cropped by, touching, or running off the canvas edge. No kawaii, no "
    "big-eyed chibi, no anime or manga, no photorealism, no photographic lighting, no 3D render, no generic "
    "Pixar-style 3D, no plasticine or clay look, no glossy specular plastic sheen, no neon, no saccharine "
    "Disney sweetness. "
    "AND NOTHING RENDERED: no gradient shading, no smooth colour ramp across a mass, no airbrush, no soft or "
    "feathered falloff, no blurred edge between two tones, no specular highlight or glossy hotspot anywhere on "
    "the coat, no ambient occlusion, no fur rendered as individually painted strands. "
    "No second highlight in an eye — no extra dot, no sparkle, no catchlight ring, no glint: exactly one "
    "drawn dot per eye and nothing else. "
    "NO CHANGE TO THE POSE OR THE SILHOUETTE — no limb, wing, ear or tail folded in, tucked up, extended, "
    "shortened, straightened or moved from where the reference puts it; no lopsided stance evened out; no "
    "asymmetry in the reference made symmetric. "
    "The flatness must still be hand-drawn, so also: no even-width vector outline, no flat-icon or clip-art "
    "geometry, no gradient mesh. No decorative border or frame."
)

SIZE = "SIZE. 1024x1024 PNG, transparent background, one image."

SELF_CHECK = (
    "SELF-CHECK BEFORE DELIVERY. Is the whole animal inside the frame with clear margin on all four sides? Is "
    "there anything in the image other than the animal — including a shadow? Would someone looking at this "
    "recognise it as the same animal, with the same markings, as the reference? "
    # 2026-10-09: the silhouette and the eye-count are asked FIRST, before the
    # register, because a drifted pose is a wrong sprite while a slightly
    # rendered surface is only an ugly one. Both questions are countable, so
    # the model can actually answer them.
    "Then the silhouette, which is the thing most likely to be WRONG rather than merely ugly: lay your "
    "drawing over the reference and go through them limb by limb. Is every wing, leg, ear and tail in the "
    "same place, pointing the same way, at the same extension? Has anything been folded in, tucked up, "
    "shortened or straightened to tidy the shape or to balance the two sides? If the reference is "
    "lopsided, is yours lopsided in the same way? If any of that has moved, put it back. "
    "Then count the eyes' highlights: exactly one drawn dot in each eye, and nothing else bright? "
    "Then the register: could you LIST the handful of flat "
    "colours this drawing is made of, or does the colour drift smoothly across the coat? Is every boundary "
    "between two colours a clean drawn edge rather than a blur? Does any part of the coat carry a highlight, "
    "a sheen or a gradient? Is the structure carried by lines and markings you drew, rather than by light "
    "falling on a surface? Is there a black key line round every form, as dark on a pale animal as on a dark "
    "one? If any answer is wrong, redo it before shipping."
)

# Rule 6, mandatory on every brief for continuity work.
STOP = (
    "REFERENCE. The single image supplied with this request is the sprite being restyled — it is the subject, "
    "not a style sample, and it is the only reference. If you cannot load the reference image, STOP and report "
    "back — do not generate from description alone."
)

# Pale and long-haired animals are the known weak case: `cat-white` came back
# at ink 0.677 against the pilot set's 0.913 and all ten weakest sprites in
# the pilot were cat-white. Snake, parrot and bat were absent from the pilot
# entirely — scales, feathers and wing membrane have never been measured
# under the KEY LINE clause.
UNTESTED_SPECIES = {'snake', 'parrot', 'bat'}
PALE_LONGHAIRED = {'dog-golden', 'dog-husky', 'bunny-angora', 'bunny-arctic',
                   'fox-arctic', 'hedgehog-albino', 'hedgehog-blonde'}
GROUPS = ('untested', 'proven', 'all')


def prompt_for(stem, pose):
    """The brief's §3 prompt, in the order the brief sets it out."""
    parts = [
        STOP,
        PROJECTION,
        FRAME,
        GROUND,
        STRIP,
        BR.KEEP,
        # SILHOUETTE sits with KEEP, before STYLE, so it is read as part of
        # what survives the restyle rather than as a note on how to paint.
        SILHOUETTE,
        STYLE,
        VOLUME if stem in BR.SMOOTH_COATED else '',
        POSE_LEAD,
        POSE_RESTATE.get(pose, 'POSE: identical to the reference — every limb, wing, ear and tail exactly '
                               'where and how the reference draws it.'),
        SIZE,
        NOT_ALLOWED,
        SELF_CHECK,
    ]
    return ' '.join(p for p in parts if p)


def line_for(stem, pose):
    """Same request body as `batch-restyle.py:line_for`, with this round's prompt.

    The body shape is left exactly as the proven one: `images` is an ARRAY OF
    OBJECTS, established by probe batch batch_6a9c19bb. Only the prompt text
    differs, so this submit carries no new shape risk.
    """
    line = BR.line_for(stem, pose)
    line['body']['prompt'] = prompt_for(stem, pose)
    line['body']['model'] = MODEL
    line['body']['quality'] = QUALITY
    return line


# 2026-10-09: the round failed on every one of 473 requests with
# "Transparent background is not supported for this model." `gpt-image-2` is
# the ONLY model on the account that refuses `background: transparent`;
# gpt-image-1.5, gpt-image-2.5-flare, gpt-image-2.5-sunburst, gpt-image-1-mini
# and chatgpt-image-latest all accept it. So the model is a decision this
# round has to make, and the one model that cannot work is refused by name
# rather than left as `batch-restyle.py`'s default.
NO_TRANSPARENCY = {'gpt-image-2', 'gpt-image-2-2026-04-21'}
# 2026-10-09, settled: gpt-image-2.5-sunburst. The flattest of the three
# candidates at every size and the only one that keeps the key line heavier
# than the source rather than thinner (§5); gpt-image-1.5 loses the line and
# bills 4,486 output tokens against sunburst's 1,756.
MODEL = os.environ.get('ARC_RESTYLE_MODEL', 'gpt-image-2.5-sunburst')

# Pinned, not inherited. `batch-restyle.py`'s QUALITY reads GPT_IMAGE_QUALITY
# from the environment, so a stale shell variable could quietly send the round
# at medium. §25 settles this: high for every sprite, no split by coat —
# medium measured flatter on one sprite and less flat on another, and it
# speckles a pale key line at 48px where high reads clean.
QUALITY = 'high'


def check_model():
    if MODEL in NO_TRANSPARENCY:
        sys.exit(f'STOP: {MODEL} rejects background=transparent — the whole round failed on exactly '
                 f'this on 2026-10-09. Set ARC_RESTYLE_MODEL or pass --model.')


def group_of(stem):
    return 'untested' if (stem.split('-')[0] in UNTESTED_SPECIES
                          or stem in PALE_LONGHAIRED) else 'proven'


def census():
    """Every state sprite, with its source size and why it is in or out."""
    send, held = [], []
    for f in sorted(os.listdir(ASSETS)):
        if not f.endswith('.png'):
            continue
        stem, _, pose = f[:-4].rpartition('-')
        if pose not in BR.POSES or not stem:
            continue
        if stem == 'cat' or stem.startswith('cat-'):
            continue                      # the 90-sprite pilot, already generated
        w, h = Image.open(os.path.join(ASSETS, f)).size
        if (w, h) != (512, 512):
            held.append((stem, pose, w, h))
        else:
            send.append((stem, pose))
    return send, held


def guard(send, held):
    """Refuse to spend if the arithmetic has moved away from what was approved."""
    cost = round(len(send) * BATCH_RATE, 2)
    if len(send) != EXPECT_SEND or len(held) != EXPECT_HELD:
        sys.exit(f'STOP: the split is {len(send)}/{len(held)}, not {EXPECT_SEND}/{EXPECT_HELD} '
                 f'as the brief records. Nothing sent.')
    if cost > APPROVED + 0.005:
        sys.exit(f'STOP: ${cost:.2f} is above the approved ${APPROVED:.2f}. Nothing sent.')
    return cost


def cmd_plan(args):
    send, held = census()
    cost = guard(send, held)
    groups = {g: [x for x in send if group_of(x[0]) == g] for g in ('untested', 'proven')}
    lens = sorted(len(prompt_for(s, p)) for s, p in send)
    rate = expected_rate(lens[-1])
    print(f'round: {len(send)} sprites to submit, {len(held)} held back')
    print(f'  model {MODEL} quality {QUALITY}')
    print(f'  prompt {lens[0]}-{lens[-1]} chars ({len(set(lens))} distinct)')
    print(f'  EXPECTED  {len(send)} x ${rate:.6f} = ${len(send) * rate:.2f}  '
          f'(per-token rates, sunburst high, Batch)')
    print(f'  CEILING   {len(send)} x ${BATCH_RATE} = ${cost:.2f}  '
          f'(gpt-image-2 per-image rate; approved ${APPROVED:.2f})')
    print(f'  held back {len(held)} sprites, ${len(held) * rate:.2f} not spent')
    for g, items in groups.items():
        stems = sorted({s for s, _ in items})
        print(f'\n  group {g}: {len(items)} sprites, ${len(items) * rate:.2f} expected, '
              f'{len(stems)} species-variants')
        print(f'    {", ".join(stems)}')
    print(f'\n  held back (source is not 512x512 — a redraw, not a restyle):')
    for stem, pose, w, h in held:
        print(f'    {stem}-{pose}  {w}x{h}')
    if args.show_prompt:
        stem, pose = (args.show_prompt.rsplit('-', 1) if '-' in args.show_prompt
                      else (args.show_prompt, 'sheltered'))
        p = prompt_for(stem, pose)
        print(f'\n--- prompt for {stem}-{pose} ({len(p)} chars) ---\n{p}')
        print(f'\n--- request body ---\n{json.dumps(line_for(stem, pose), indent=1)[:600]}')


def cmd_submit(args):
    check_model()
    send, held = census()
    guard(send, held)
    items = [x for x in send if args.group == 'all' or group_of(x[0]) == args.group]
    if not items:
        sys.exit('no sprites matched')
    rate = expected_rate(max(len(prompt_for(s, p)) for s, p in items))
    d = os.path.join(OUT, args.group)
    os.makedirs(d, exist_ok=True)
    # A dry run writes to its OWN file. It used to write `requests.jsonl`, so
    # `submit --dry-run` silently replaced the request file of a round that had
    # already been built — which happened on 2026-10-09 and had to be rebuilt
    # and byte-checked. A command whose whole promise is "sends nothing" should
    # not overwrite the thing that was going to be sent.
    # The 2026-10-09 gpt-image-2 round's request files are the only record of
    # what the failed round sent, and §8 proves them byte-for-byte. Never
    # overwrite one: move it aside first, once, and refuse to clobber the
    # copy if it is already there.
    jsonl = os.path.join(d, 'requests.dry-run.jsonl' if args.dry_run else 'requests.jsonl')
    keep = os.path.join(d, 'requests.gpt-image-2.jsonl')
    if not args.dry_run and os.path.exists(jsonl) and not os.path.exists(keep):
        os.rename(jsonl, keep)
        print(f'  preserved the old round: {os.path.basename(keep)}')
        bid = os.path.join(d, 'batch-id')
        if os.path.exists(bid) and not os.path.exists(bid + '.gpt-image-2'):
            os.rename(bid, bid + '.gpt-image-2')
    with open(jsonl, 'w') as fh:
        for stem, pose in items:
            fh.write(json.dumps(line_for(stem, pose)) + '\n')
    print(f'group {args.group}: {len(items)} requests -> {jsonl}')
    print(f'  model {MODEL} quality {QUALITY}')
    print(f'  ${len(items) * rate:.2f} expected (round total ${len(send) * rate:.2f}, '
          f'ceiling ${len(send) * BATCH_RATE:.2f}, approved ${APPROVED:.2f})')
    if args.dry_run:
        print('  --dry-run: nothing sent')
        return

    boundary = '----arcbatch'
    body = b''
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nbatch\r\n'.encode()
    body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
             f'filename="requests.jsonl"\r\nContent-Type: application/jsonl\r\n\r\n').encode()
    body += open(jsonl, 'rb').read() + b'\r\n'
    body += f'--{boundary}--\r\n'.encode()
    up = BR.req('POST', '/files', raw=body,
                headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    print(f'uploaded {up["id"]}')

    b = BR.req('POST', '/batches', data={
        'input_file_id': up['id'],
        'endpoint': '/v1/images/edits',
        'completion_window': '24h',
        'metadata': {'purpose': f'arc animal restyle 2026-10-09 ({args.group})'},
    })
    print(f'batch {b["id"]}  status {b["status"]}')
    with open(os.path.join(d, 'batch-id'), 'w') as fh:
        fh.write(b['id'] + '\n')
    if args.confirm_after:
        # One check, not a poll: a batch that fails validation says so within
        # seconds, and knowing that now is the difference between a submitted
        # round and a silently dead one.
        time.sleep(args.confirm_after)
        args.batch_id = b['id']
        cmd_status(args)


def cmd_status(args):
    b = BR.req('GET', f'/batches/{args.batch_id}')
    c = b.get('request_counts', {})
    print(f'{b["id"]}  {b["status"]}  ({(b.get("metadata") or {}).get("purpose", "")})')
    print(f'  total {c.get("total")}  completed {c.get("completed")}  failed {c.get("failed")}')
    for k in ('created_at', 'in_progress_at', 'completed_at', 'expires_at'):
        if b.get(k):
            print(f'  {k}: {time.strftime("%Y-%m-%d %H:%M", time.localtime(b[k]))}')
    if b.get('errors'):
        print('  errors:', json.dumps(b['errors'])[:800])


def cmd_fetch(args):
    b = BR.req('GET', f'/batches/{args.batch_id}')
    if b['status'] != 'completed':
        print(f'status is {b["status"]}, not completed')
    if b.get('error_file_id'):
        errs = BR._download(b['error_file_id']).decode().splitlines()
        print(f'{len(errs)} errors; first:')
        for line in errs[:3]:
            print('  ', line[:400])
    if not b.get('output_file_id'):
        return
    d = os.path.join(OUT, args.group)
    os.makedirs(d, exist_ok=True)
    out = BR._download(b['output_file_id']).decode()
    n = bad = 0
    for line in out.splitlines():
        rec = json.loads(line)
        cid = rec['custom_id']
        body = (rec.get('response') or {}).get('body') or {}
        data = body.get('data') or []
        if not data or 'b64_json' not in data[0]:
            print(f'  ! {cid}: {json.dumps(rec.get("error") or body)[:200]}')
            bad += 1
            continue
        with open(os.path.join(d, f'{cid}-raw.png'), 'wb') as fh:
            fh.write(base64.b64decode(data[0]['b64_json']))
        n += 1
    print(f'wrote {n} raw PNGs to {d} ({bad} without an image)')
    print(f'\nnext:\n'
          f'  python3 tools/install-restyled.py --drafts {d} --stage-only\n'
          f'  python3 tools/check-sprite-scale.py --drafts {d}/staged-512')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)

    p = sub.add_parser('plan')
    p.add_argument('--show-prompt', metavar='STEM-POSE', nargs='?', const='snake-python-sheltered')
    p.add_argument('--model', default=MODEL, help='generator model (default %(default)s)')
    p.set_defaults(fn=cmd_plan)

    s = sub.add_parser('submit')
    s.add_argument('--group', choices=GROUPS, required=True)
    s.add_argument('--dry-run', action='store_true')
    s.add_argument('--model', default=MODEL, help='generator model (default %(default)s)')
    s.add_argument('--confirm-after', type=int, default=30,
                   help='seconds to wait before one status check (0 to skip)')
    s.set_defaults(fn=cmd_submit)

    for name, fn in (('status', cmd_status), ('fetch', cmd_fetch)):
        q = sub.add_parser(name)
        q.add_argument('batch_id')
        q.add_argument('--group', choices=GROUPS, default='untested')
        q.set_defaults(fn=fn)

    args = ap.parse_args()
    if getattr(args, 'model', None):
        globals()['MODEL'] = args.model
    args.fn(args)


if __name__ == '__main__':
    main()
