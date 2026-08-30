# Nav icon commission — sent log, 30 August 2026

Companion to `nav-icon-brief-2026-08-30.md`, which was written for the OpenAI
route and marked "not yet sent". **It has now been commissioned from Manus**,
on Marcus's instruction, 30 August.

## Deviation from Rule 6, and what was done about it

`manus-sprite-rules.md` Rule 6 points set-matching work at OpenAI's
`/v1/images/edits`, because Manus's failure mode is proceeding from the text
description when it cannot fetch its references. Marcus chose Manus anyway.
The mitigation was to remove the fetch from the equation:

- All five references were **uploaded into the task as attachments** via the
  v2 presigned flow (`POST /v2/file.upload`, then `PUT` to the returned
  `upload_url`), not passed as URLs. Each was confirmed `status: uploaded`
  before the task was created. The public Vercel URLs are in the brief as a
  secondary fallback only.
- The brief opens with a **STOP check**: describe each reference before
  drawing, and stop if you cannot see them. This is the check that catches a
  silent text-only generation regardless of whether the attachment content
  part was shaped correctly.

Upload can be driven from the shell — the MCP `manus_upload_file` tool wants
`content_base64` in the call itself, which for five PNGs is ~100k characters
of tokens. `curl` reads the file off disk instead. Note the presigned `PUT`
must NOT carry the `x-manus-api-key` header.

## Scope

Marcus approved **all five** pieces, including the optional item 5 — so the
thatched cottage is retired and Home becomes the A.R.C. building.

| # | File | What |
|---|---|---|
| 1 | `fab-supplies.png` | open wooden crate, sack + bundle — replaces the lettered "A.R.C." plaque |
| 2 | `nav-social.png` | wrapped gift — replaces the postbox |
| 3 | `nav-care.png` | single food bowl — brush removed |
| 4 | `nav-play.png` | existing orange paw, redrawn inside the badge |
| 5 | `nav-home.png` | A.R.C. building in the badge — replaces the cottage |

Overwrite `nav-play.png`; do **not** add `nav-walk.png` (see the brief —
`NavBarView` checks `nav-play` first, and a `nav-walk.png` would sit unused,
which is the mistake that produced finding 10 in the first place).

## References uploaded

`nav-home.png`, `nav-social.png`, `nav-care.png` (the badge exemplars),
`driving/topdown/site-arc-building.png` (identity for piece 5) and the current
`nav-play.png` (paw shape/colour for piece 4).

The building reference carries "ANIMAL RESCUE CENTRE" lettering and is drawn
in a lighter ink-and-wash style than the badges. The brief asks explicitly for
the lettering to be dropped and the building repainted in the badge style.

## Task

`MhSrzYnKgTzV7L2C2xN3fU` — https://manus.im/app/MhSrzYnKgTzV7L2C2xN3fU
Profile `manus-1.6-max`. Output lands in `manus-output/nav-icons/` (gitignored).

## Post-processing still to do on delivery

1. Mask to a clean circle with alpha (Manus may return flat magenta `#FF00FF`
   instead of transparency — the brief permits it and says to declare which).
2. `sips -Z 256` to the set's native size.
3. `tools/optimise-sprites.ts --base=apps/game/public/assets signs` — dry run
   first; it only writes with `--write`, and re-quantising an already-quantised
   PNG is not a no-op.
4. Compare each against `nav-home.png` at 46px before accepting.

---

## Outcome

**Delivered and installed.** 719 credits, one revision round.

Manus returned real alpha on every piece — the magenta fallback was not
needed — and matched the badge geometry without being given a number: all
five came back with the disc at 0.930 of the canvas, which is
`nav-home.png`'s own proportion to three decimal places.

The STOP check did its job. Manus described moss on the cottage roof, the
envelope in the postbox slot, kibble in a peach bowl, blue-green windows on
the building and gold edging on the paw — none of which appears anywhere in
the brief text. It was reading the images, not the description. **The Rule 6
failure mode did not occur.**

Four of five passed first time. `nav-home` failed at true size on v1: the
window mullions, railings and balcony lines collapsed into grey-blue stripes,
the dome and flag were lost, and it was the only cool-toned icon in a warm
set. v2 fixed it — paw print as the hero element, cream-to-honey facade, four
plain windows, larger dome, flag dropped.

Worth noting the failure was **not** a continuity failure. Manus drew a
faithful, detailed building; it simply did not survive being shrunk to a
thumbnail. OpenAI's edits endpoint could have made the same mistake. Rule 6
guards against drift from missed references, which is a different problem.

### What this fixed beyond finding 10

The old set disagreed on things the brief never mentioned, because the brief
was written from what the icons *depict* rather than from their pixels:

- **Transparency.** `nav-home` and `nav-play` had alpha corners;
  `nav-social`, `nav-care` and `fab-arc` were fully opaque — white corners on
  the first two, `#EDEDED` on `fab-arc`. Invisible on a light bar, a visible
  box on anything else.
- **Disc size.** Disc-to-canvas ran 0.930 / 0.938 / 0.875 / 0.770 across the
  set, so even the three sharing a treatment were drawn at different scales.

`tools/badge-postprocess.py` normalises both: every piece is now a 238px disc
on a 9px margin with clean alpha (max alpha outside the disc: 4/255).

### Installation

Dropping the files in was the whole change. `NavBarView.ts:66` already
preferred `fab-supplies` over `fab-arc`, and the manifest
(`apps/game/plugins/asset-manifest.ts`) is built by directory scan, so no code
edit was needed to wire the new FAB.

Three stale references were corrected while in the area:

- `NavBarView.ts:62-65` said `'fab-supplies' does not exist`. It does now.
- `admin/assets-preview.html` labelled `nav-play.png` as `(FAB)`. It is the
  Walk tab; the FAB is `fab-supplies.png`, which the page did not list at all.
- The same page had a card for `nav-menu.png`, which has never existed
  anywhere in the repo — a dead reference of exactly the kind that produced
  finding 10. Removed.

`fab-arc.png` stays on disk as the coded fallback and is now unused.

### Verification

- 1120 tests pass (7 badges + 821 game-logic + 292 game). Typecheck, lint clean.
- e2e smoke 3/3.
- ux-review harness: 42 combinations, 27 FAIL / 84 WARN — unchanged from the
  handover baseline, and F10 (the sprite contract) does not appear in the fix
  order, so nothing regressed.
- Display-list inspection in real Chrome at 812x375 confirms all five textures
  resolve and draw in `GameScene`: `nav-home` 42x42 @(213,302), `nav-care`
  38x38 @(303,304), `nav-play` 38x38 @(471,304), `nav-social` 38x38 @(559,304),
  `fab-supplies` 42x42 @(385,278). **`fab-supplies` is what draws — not
  `fab-arc`.**

**Note the real draw sizes are 38-42px, not the 46-54px the brief assumed**,
and the FAB is 42px, not 68. The set was judged at 46px, so it was assessed
slightly larger than it actually ships. It still reads at 38px, but any future
icon should be checked at 38.

### Not verified

The full nav bar could not be screenshotted unoccluded. Entering `GameScene`
in a test raises an arrival card, and dismissing it triggers a "please sign in
again" panel, because `seedFakeSession` writes a token Supabase will not
accept. That panel is drawn inside the canvas, so it cannot be hidden by
suppressing DOM overlays. The icons were confirmed by display-list position
and inspected individually at full resolution and at true render size instead.
Nobody has seen the finished bar on a physical device.

### Trap worth knowing

**`manus_download_output` pulls the task's input attachments alongside its
outputs, and same-named files collide in the output directory.** Three
uploaded references shared filenames with the renders. The 1024x1024 renders
happened to be written last and won, but that is ordering luck. On the
revision round three files called `nav-home.png` landed on one path — input,
v1 and v2. **Verify by dimension or file size, never by filename.**
