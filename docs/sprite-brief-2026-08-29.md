# Sprite brief — 21 low-res poses → 512px (2026-08-29)

**Status: DRAFT, awaiting Marcus's approval. Do not spend credits until approved.**

Four characters are shipping with a mix of 512px art and surviving 128px
originals, so the same animal changes fidelity as its state changes. This brief
regenerates the 21 remaining 128px poses at 1024px, to be downsampled to 512.

Verified 2026-08-29: all 21 targets are 128×128 on disk; all anchor and
character-lock references cited below are 512×512, live, and byte-identical
between the repo and the Vercel deployment. `apps/game/public/admin/regen-v3-sprites/`
is empty — there is no unshipped source, so these must be generated.

---

## Recommendation before anything else: this should not go to Manus

The handover names Manus. Rule 6 of `docs/manus-sprite-rules.md` — your own
hard rule, 2026-04-24 — says the opposite:

> **Hard rule:** if a sprite needs to preserve character identity, match
> existing art, or sit in a set alongside others, use OpenAI's
> `/v1/images/edits` via `tools/gpt-image-regen.sh` — NOT Manus.
> [...] canonical choice for: **Animal sprite regens in a consistent style.
> Any sprite that belongs to a set that must match.**

This job is that description exactly: 21 poses that must sit beside existing
art of the same four characters. Every precedent in the repo went the OpenAI
route — `regen-hedgehog.sh` (the 0.4% match the handover holds up as the bar),
`regen-bunnies.sh`, `regen-round4.sh`. There is no precedent for animal sprites
via Manus.

There is a second reason, which is the one that actually decides it. The whole
public-URL apparatus in the handover exists *only* because Manus cannot read
the filesystem. OpenAI takes references as multipart file uploads — so on that
route there is no URL-fetch race, no silent-drift failure mode, and we can use
better references than the web ones, including the 2752px masters under
`manus-variants/` that Manus can never reach.

**Both routes are written up below.** The sprite content — style, pose rules,
framing targets, filenames — is identical either way; only the reference block
changes. Recommendation is the OpenAI route.

| | OpenAI (`gpt-image-regen.sh`) | Manus |
|---|---|---|
| References | local files, multipart | public URLs, fetch may silently fail |
| Best refs usable | yes, incl. 2752px masters | no, `apps/game/public/` only |
| Precedent for animals | hedgehog, bunnies, round4 | none |
| Cost, 21 sprites | ~$0.88 medium / ~$3.51 high | Manus credits |
| Rule 6 | compliant | violates |

---

## Shared rules

**Style base** — verbatim from `regen-bunnies.sh` / `regen-round4.sh`:

> Painterly children's-book illustration in chibi style (large rounded head
> about 45% of body, expressive large eyes, soft visible outlines, warm
> saturated palette). Transparent PNG background, NO floor shadow, NO
> background scenery, single animal centred. NOT photo-realistic, NOT
> anthropomorphised. NO watermarks, NO text. The FIRST reference image is a
> POSE ANCHOR — match its body geometry (body angle, feet position, ear
> position, head direction) precisely. The remaining references are the
> CHARACTER — match that exact animal's face, colouring and markings.

⚠️ **Do NOT paste Rule 4's style paragraph into this brief.** Rule 4 is the
*cast-portrait* style and its blocklist says "NOT chibi, NOT big-headed" —
the exact opposite of the animal set, which is deliberately chibi with a head
~45% of body. Using it here would guarantee drift.

**Other shared constraints**

- 1024×1024 PNG, transparent background. Downsample to 512 in post.
- **NO COLLAR** on any dog — collars are player-added in-game.
- No props except where a pose rule explicitly calls for one (`arriving` only).
- No ground, pavement, grass or kerb. No cast shadow either — unlike the cast
  sprites, this set is shadowless (`NO floor shadow` is in the style base).
- Filenames exactly as enumerated, one per sprite.

**Framing — the acceptance bar.** Sprites jump between states if alpha
bounding boxes drift, so each target below carries a measured framing spec:
the median alpha box of the *same state across sibling variants already at
512px* (n=5–7 per state). Match within ~5% on each axis. Note the shape is
driven by state, not character — `sick` is wide and flat at ~48% height,
`sheltered` is tall and narrow at ~68% width.

---

## Reference strategy (two-part, per sprite)

1. **Pose anchor** — a sibling variant at the *same state*, already 512px.
   This is what fixes geometry and framing.
2. **Character lock** — 2–3 of the target character's *own* 512px sprites,
   any state. This is what fixes identity.

This resolves the handover's worry that `dog-dalmatian` is thin on references:
it has only two of its own sprites, but the pose anchor comes from a sibling
breed, so only the character lock is short — topped up with its reference sheet.

**OpenAI route** — pass local paths, `$ASSETS` = `apps/game/public/assets/animals/`.
Prefer the 2752px masters in `manus-variants/` for character lock where one exists.

**Manus route** — public URLs only, `https://animal-rescue-centre.vercel.app/assets/animals/<file>.png`
and `/assets/reference/<file>-reference.png`. All confirmed live and 200 today.
Do **not** cite `manus-variants/` or `asset-drafts/` — not served, and a brief
citing them silently gets no reference at all. Include verbatim:

> If you cannot fetch these URLs, STOP and report back — do not generate
> sprites from description alone.

---

## Character descriptions (verbatim from proven scripts)

- **dog-dalmatian** — "A YOUNG dalmatian dog (white coat with distinctive black
  spots all over, floppy ears, bright eyes, no greying — puppy-to-young-adult
  age, NOT an older dog)."
- **dog-beagle** — "A young adult beagle (tri-colour: white, tan and black
  patches, classic beagle markings, long floppy ears, short smooth coat)."
- **bunny-spotted** — "A SPOTTED bunny with a WHITE base coat and SCATTERED
  DARK BROWN/BLACK spots all over the body and head, standing upright ears,
  plump round body. Must be PLUMP AND FAT to match the rest of the set — NOT
  slim, NOT athletic."
- **bunny-dutch** — "A DUTCH bunny with distinctive BLACK-AND-WHITE markings:
  WHITE blaze up the forehead, WHITE saddle around the shoulders and front
  body, BLACK from the back/flanks to the hindquarters, WHITE paws, standing
  upright ears."

## Pose rules

Dogs (`arriving`/`growling`/`scared`/`sick` verbatim from `regen-round4.sh`):

| State | Rule |
|---|---|
| `arriving` | Insecure/cautious arrival, sitting next to a worn folded knitted blanket (NOT a box) or an old squeaky toy, wide worried eyes, head tilted. |
| `eating` | Head down at a full food bowl, tail up, content and absorbed. Facing 3/4 to camera-right. |
| `growling` | Low warning pose: lips slightly raised showing small teeth, ears back, body tense. Kid-appropriate. |
| `grumpy` | Sulking, not scared: lying with chin on paws, big disapproving eyes looking up, unimpressed expression, ears slightly back. NOT a fearful crouch. |
| `scared` | Low crouched, tail tucked, ears flat, wide worried eyes. |
| `sheltered` | Sitting upright and settled, content relaxed expression, facing 3/4 to camera-right. No props. |
| `sick` | Lying down head on paws, droopy sad eyes, tail limp, unwell but recoverable. NO warping perspective. |
| `sleeping` | Curled on its side asleep, eyes closed, body relaxed and low, peaceful. NO bed or cushion. |
| `walking` | Mid-stride, side view, HEAD FACING RIGHT, one front paw lifted. Playful energetic expression. |

Bunnies (verbatim from `regen-bunnies.sh`):

| State | Rule |
|---|---|
| `arriving` | Bunny sitting on all fours, facing 3/4 to camera-right, looking insecure/uncertain with wide worried eyes, ears slightly back. Next to a folded soft chunky knitted BLANKET (NOT a box, NOT a gift), proportionately sized. |
| `eating` | Bunny sitting up on haunches with front paws in a neutral bunny position, nibbling a small piece of food (carrot, lettuce or pellet). Facing 3/4 to camera-right. |
| `grumpy` | Bunny sitting with ears half-back, narrowed eyes, small frown, sulky. All four paws on the ground. NO arms akimbo, NO standing on hind legs, NO human postures, NO scarves. |
| `scared` | Bunny crouched low, body pressed to the ground, ears FLAT against the back, wide frightened eyes, tail tucked. Genuine fear posture. |
| `sheltered` | Bunny in a classic loaf-sitting pose, content expression, facing 3/4 to camera-right. NO objects, NO props. |
| `sick` | Bunny lying on its side or belly, head low, half-closed sad eyes, droopy ears. Unwell but recoverable — pitiful, not scary. NO bed or cushion underneath. |
| `sleeping` | Bunny curled up asleep with eyes closed, body low, ears flat against the back, peaceful. No bed. |

---

## The 21 sprites

Framing = median alpha box across sibling 512px variants at that state
(width% × height% of canvas, top padding%).

### dog-dalmatian — 8 sprites
Character lock (revised after the pilot): `dog-dalmatian-playing.png`, a
**face crop of that same sprite** showing the eye patch large, and
`manus-variants/dogs/dog-dalmatian-reference.png` (the 2752px Pongo sheet —
local only, far better than the 256px public copy).

**Do NOT include `dog-dalmatian-walking.png`.** It has no eye patch and
contradicts the canonical face; including it is what made pilot v1 drop the
patch entirely. Canon is the bold black eye patch on the viewer's left plus a
solid black ear on the viewer's right — state it in viewer-relative terms, as
dog-relative wording gets mirrored. Ignore the sheet's brown ears.

| Filename | Pose anchor | Framing target |
|---|---|---|
| `dog-dalmatian-arriving.png` | `dog-golden-arriving.png` | 85% × 81%, top 11% |
| `dog-dalmatian-eating.png` | `dog-golden-eating.png` | 83% × 82%, top 9% |
| `dog-dalmatian-growling.png` | `dog-golden-growling.png` | 84% × 71%, top 15% |
| `dog-dalmatian-grumpy.png` | `dog-golden-grumpy.png` | 82% × 78%, top 12% |
| `dog-dalmatian-scared.png` | `dog-golden-scared.png` | 88% × 68%, top 19% |
| `dog-dalmatian-sheltered.png` | `dog-golden-sheltered.png` | 68% × 83%, top 10% |
| `dog-dalmatian-sick.png` | `dog-golden-sick.png` | 86% × 48%, top 27% |
| `dog-dalmatian-sleeping.png` | `dog-golden-sleeping.png` | 93% × 58%, top 22% |

### dog-beagle — 5 sprites
Character lock: `dog-beagle-arriving.png`, `dog-beagle-growling.png`,
`dog-beagle-playing.png`.

| Filename | Pose anchor | Framing target |
|---|---|---|
| `dog-beagle-eating.png` | `dog-golden-eating.png` | 83% × 82%, top 9% |
| `dog-beagle-grumpy.png` | `dog-golden-grumpy.png` | 82% × 78%, top 12% |
| `dog-beagle-sheltered.png` | `dog-golden-sheltered.png` | 68% × 83%, top 10% |
| `dog-beagle-sleeping.png` | `dog-golden-sleeping.png` | 93% × 58%, top 22% |
| `dog-beagle-walking.png` | `dog-dalmatian-walking.png` | 77% × 74%, top 14% |

### bunny-spotted — 6 sprites
Character lock: `bunny-spotted-growling.png`, `bunny-spotted-walking.png`,
`bunny-spotted-sleeping.png` — all three plump, four paws down.
**Never use `bunny-spotted-playing.png` as a reference** (see the playing-pose
note below); it is also slimmer than the rest of the set.

| Filename | Pose anchor | Framing target |
|---|---|---|
| `bunny-spotted-arriving.png` | `bunny-arctic-arriving.png` | 90% × 70%, top 15% |
| `bunny-spotted-eating.png` | `bunny-arctic-eating.png` | 75% × 82%, top 10% |
| `bunny-spotted-grumpy.png` | `bunny-arctic-grumpy.png` | 75% × 71%, top 15% |
| `bunny-spotted-scared.png` | `bunny-arctic-scared.png` | 86% × 53%, top 26% |
| `bunny-spotted-sheltered.png` | `bunny-dutch-sheltered.png` | 75% × 78%, top 11% |
| `bunny-spotted-sick.png` | `bunny-arctic-sick.png` | 93% × 57%, top 23% |

### bunny-dutch — 2 sprites
Character lock: `bunny-dutch-sheltered.png`, `bunny-dutch-walking.png`,
`bunny-dutch-arriving.png` — all three show the canonical Dutch pattern.
**Never use `bunny-dutch-playing.png`** (playing-pose note below; its ears also
read brown rather than black) **or `bunny-dutch-scared.png`** (off-pattern —
see the anomalies below).

| Filename | Pose anchor | Framing target |
|---|---|---|
| `bunny-dutch-eating.png` | `bunny-arctic-eating.png` | 75% × 82%, top 10% |
| `bunny-dutch-sleeping.png` | `bunny-lionhead-sleeping.png` | 88% × 67%, top 17% |

---

## Set anomalies found while checking the character locks

Checked every shipped 512px sprite for all four characters before running the
batch, because the dalmatian's lock turned out to contradict itself.

**`playing` is a bipedal pose for bunnies, by design.** All seven bunny
`playing` sprites stand upright with both front paws raised. That is a
deliberate convention for the state, not drift — do not "fix" it. It does mean
`playing` is a bad character-lock reference for bunnies: it teaches the wrong
body plan. Excluded from both bunny locks above. (Dog `playing` is a normal
four-legged play-bow and is fine.)

**`bunny-dutch-scared.png` is off-pattern.** It has a white face with black
patches around both eyes, where the other seven Dutch sprites have a black face
with a white blaze up the forehead. `bunny-dutch-sick.png` leans the same way,
less severely. Neither is in this batch — Dutch only needs `eating` and
`sleeping` — so this is logged, not fixed. Worth a decision later, as `scared`
currently reads as a different rabbit.

**`dog-beagle`: clean.** Five shipped sprites, consistent tri-colour, white
blaze, black saddle, white paws and tail tip, no collars. Proportions vary a
little between action and lying poses, which is pose-driven, not drift. No
changes to its character lock.

**`dog-dalmatian`: two contradictions**, both resolved — `playing` and
`walking` disagreed on the eye patch (canon is now the patch, per Marcus), and
`playing` wears a red collar against the project's NO COLLAR rule (being
regenerated as a 22nd sprite in this batch).

## Post-processing

1. Generate to `apps/game/public/admin/regen-v3-sprites/` — never straight over
   live assets, so a bad batch can be rejected without a revert.
2. Matte to transparent only if needed — the dalmatian pilot came back a real
   cut-out at 67% clear, so `rembg` was NOT required. Keep it in reserve for the
   bunnies, whose fur edges are softer (`regen-hedgehog.sh` needed it for spines).
3. `tools/harden-sprite-alpha.py` / `tools/autocrop-alpha.py` to clean edges
   and settle the bounding box against the framing targets.
4. `tools/frame-to-target.py <in> <out> <height%> <top-pad%> 512` — normalise the
   alpha box to the state's framing target. Generated sprites run tall (the
   dalmatian pilot came back at 87.5% height against a 75.0–83.8% peer range).
5. `tools/optimise-sprites.ts` — 512px cap, palette q90. Dry-run first: it must
   report "already quantised, 0 oversized" and no size change on the untouched
   set. It used to degrade art on every re-run (fixed in `4bbce6a`); if the
   animal folder shrinks for no reason, that is what happened.
6. Re-measure alpha boxes against the targets above before promoting.
7. Promote into `apps/game/public/assets/animals/`.

## Acceptance criteria

- All 21 land at 512×512, transparent, no ground, no collar.
- Alpha box within ~5% of the framing target on both axes.
- Identity holds: each sprite recognisably the same animal as its character
  lock refs, at a glance, without being told.
- Style holds: chibi painterly, consistent with the other 129 512px sprites.
- No file in the untouched set changes size.

## Self-check before delivery

For each sprite: "would someone looking at this instantly recognise this as the
same character, and the same style, as the references?" If not, re-do that
sprite before shipping.

---

## Open questions for Marcus

1. **Route** — OpenAI (recommended, Rule 6) or Manus as the handover says?
2. **Quality tier** — medium (~$0.88, what the hedgehog and bunny batches used)
   or high (~$3.51)?
3. **Dalmatian character lock** is the weak spot: two own sprites plus a
   256×143 sheet. Options: accept it, generate `sheltered` first as a
   single-sprite pilot and promote it into the lock for the other seven, or
   commission a proper dalmatian reference sheet first.
