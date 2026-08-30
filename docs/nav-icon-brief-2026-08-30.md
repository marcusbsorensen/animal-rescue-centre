# Nav bar icon commission — brief, 30 August 2026

Review phase 4, item 13. Fixes finding 10: *the primary navigation is four
icons from three different sets*.

**Not yet sent.** Marcus to approve before anything is commissioned.

## Which tool

`docs/manus-sprite-rules.md` Rule 6 is unambiguous, and it applies here:

> **Hard rule:** if a sprite needs to preserve character identity, match
> existing art, or sit in a set alongside others, use OpenAI's
> `/v1/images/edits` via `tools/gpt-image-regen.sh` — NOT Manus.

Every piece below has to sit in a set alongside `nav-home.png`. Manus is
listed as acceptable only for brand-new work with no cross-reference
constraints, and its failure mode — proceeding from the description when it
cannot fetch the references — is exactly what would sink this. The brief
below is written so it can go either way; the commands at the bottom are
the OpenAI route, which is the one the rules point at.

## What is actually on disk

All five files exist. The problem is that they are not one set.

| Tab | File | What it is | Badge? |
|---|---|---|---|
| Home | `signs/nav-home.png` | thatched fairy-tale cottage | cream disc, brown ring |
| Care | `signs/nav-care.png` | grooming brush **and** a bowl of food | cream disc, brown ring |
| Social | `signs/nav-social.png` | red postbox | cream disc, brown ring |
| Walk | `signs/nav-play.png` | orange paw print | **none** — bare glyph |
| Supplies (FAB) | `signs/fab-arc.png` | square wooden plaque lettered "A.R.C." | **square sign, not a badge** |

So three share a treatment and two do not, and two of the three carry the
wrong idea:

- **Care** puts two objects in one 46px circle. At that size a brush and a
  bowl merge into a beige blob. One icon, one object.
- **Social** is a postbox. A child of 7–10 in 2026 has, for the most part,
  never posted a letter; postbox → messages → friends is an adult's
  three-step metaphor. The scene it opens is friends and gifts.
- **Walk** is a bare paw with no badge, so it reads as weightless beside
  three saturated discs.
- **Supplies** is a lettered wooden sign. It is the most prominent control
  on the screen, it is the only one carrying *words*, and a pre-reader gets
  nothing from it.

`nav-home` is a cottage where "Home" means the rescue centre corridor. The
review notes the A.R.C. building would be prettier and truer, but did not
put it on the fix list — it is offered as optional below.

## References (fetch before drawing — publicly reachable, all verified 200)

The badge treatment to match, in order of how well each shows it:

- https://animal-rescue-centre.vercel.app/assets/signs/nav-home.png
- https://animal-rescue-centre.vercel.app/assets/signs/nav-social.png
- https://animal-rescue-centre.vercel.app/assets/signs/nav-care.png

If you cannot fetch these URLs, STOP and report back — do not generate from
description alone.

## Shared rules

- **Dimensions**: 256×256 PNG, transparent outside the badge. The set is
  256 and the bar draws them at 46–54px, so detail below about 8px of
  source will not survive.
- **The badge is the constant.** Every piece is one cream-to-buff disc with
  a warm brown ink ring, a soft inner shadow at the top-left and the object
  sitting proud in the middle — exactly as `nav-home.png` does it. Same
  disc diameter, same ring weight, same palette, on all of them.
- **One object per badge.** Not a scene, not a pair, not an object plus a
  smaller object. At 46px a second thing is noise.
- **Front elevation**, filling roughly 60–70% of the disc, centred, with
  clear cream margin all round so the ring never crowds it.
- **Style**: painted watercolour storybook — warm ink outlines, soft colour
  washes, painted imperfections. Julia Donaldson / Raymond Briggs /
  Aardman-adjacent. Storybook warmth, not cartoon sweetness.
- **BLOCKLIST** (will be rejected): anime · manga · chibi · big-eyed kawaii
  · vector flat-shading · comic-book cel-shading · photorealism · sci-fi ·
  neon palettes · generic Pixar 3D · any lettering or words in the artwork.
- **No ground context.** Nothing beneath the object but the badge itself.

## Pieces to generate

Filenames exact, one file each.

1. **`fab-supplies.png`** — a small stack of supplies: one open wooden crate
   with a sack and a rolled bundle just visible in it, warm brown and straw
   tones. Reads as "things to fetch", not as a vehicle and not as a shop.
   This one is drawn largest in the game (a 68px FAB lifted proud of the
   bar), so it can carry a touch more detail than the others.

2. **`nav-social.png`** — a wrapped gift: one box, warm red or teal paper, a
   soft ribbon and a bow, slightly three-quarter so the lid reads. Replaces
   the postbox. *Alternative if the gift feels thin:* two animals side by
   side, shoulders touching — but that is two objects, so the gift is the
   safer answer to the rule above.

3. **`nav-care.png`** — a single food bowl, seen from a low three-quarter
   angle, filled, with a paw-print glazed on the side. Nothing else in the
   badge. The grooming brush moves out; grooming has its own flow and its
   own icon elsewhere.

4. **`nav-play.png`** — the existing orange paw, redrawn *inside* the badge
   so it matches the other four. Same paw shape, same orange, on the cream
   disc with the brown ring.

   **Overwrite `nav-play.png`, do not add `nav-walk.png`.** `NavBarView`
   checks `nav-play` *first* and only falls back to `nav-walk`, so a new
   `nav-walk.png` would sit on disk unused — which is the exact mistake
   that produced this finding: the file that was made while the tab looked
   for a filename that was never made.

### Optional, ask Marcus first

5. **`nav-home.png`** — the A.R.C. rescue centre building rather than a
   thatched cottage: the front elevation the game already uses elsewhere,
   in the same badge. Truer to what the tab does. Only worth doing if he
   wants the cottage gone.

## Self-check before delivery

For each piece: *put it beside `nav-home.png` at 46px. Is it obviously from
the same set — same disc, same ring, same palette, same weight of paint?
Can a seven-year-old name the object without being told?* If either answer
is no, redo it before shipping.

## The OpenAI route, ready to run

From the repo root, with `OPENAI_API_KEY` in `.env.local`:

```bash
cd /Users/marcus/Projects/animal-rescue-centre && GPT_IMAGE_SIZE=1024x1024 GPT_IMAGE_QUALITY=high tools/gpt-image-regen.sh apps/game/public/assets/signs/nav-care.png "A single filled food bowl seen from a low three-quarter angle, a paw print glazed on its side, sitting proud in the centre of a cream-to-buff circular badge with a warm brown ink ring and a soft inner shadow at the top left. Match the badge, palette, ring weight and painted watercolour storybook treatment of the reference images exactly. One object only. No lettering. Transparent outside the badge." apps/game/public/assets/signs/nav-home.png apps/game/public/assets/signs/nav-social.png
```

Then downscale to the set's 256 and re-run the quantiser:

```bash
cd /Users/marcus/Projects/animal-rescue-centre && sips -Z 256 apps/game/public/assets/signs/nav-care.png && apps/game/node_modules/.bin/tsx tools/optimise-sprites.ts --base=apps/game/public/assets signs
```

That second command is a dry run — `optimise-sprites.ts` only writes with
`--write`, and re-quantising an already-quantised PNG is not a no-op, so
read the report before adding it.

The other three follow the same shape with their own prompt. Keep
`nav-home.png` and `nav-social.png` as the reference pair on every call —
three references triangulate better than one, and the pair carries both the
badge and the object-in-badge proportion.
