# Manus sprite briefing rules

A.R.C. in-house conventions for briefing Manus / NanoBanana when we need character or object sprites. Learnt the hard way over the 2026-04-24 session — record these and use them as the default brief scaffolding for every future sprite commission.

## Rule 1: Manus CAN'T read the local filesystem

Manus's sandbox has no access to the Mac. "Match the portrait at `apps/game/public/admin/...`" is invisible to it — the brief will be executed from the text description alone and character identity will drift badly.

**Fix:** for any character-continuity work, embed **publicly reachable reference URLs** in the brief. We have a live Vercel deployment serving admin assets:

- Cast portraits: `https://animal-rescue-centre.vercel.app/admin/scene-assets/cast/<id>.png`
- Apprentice poses: `https://animal-rescue-centre.vercel.app/admin/scene-assets/cast/apprentices/<name>-<pose>.png`
- Cast variants: `https://animal-rescue-centre.vercel.app/admin/scene-assets/cast/variants/<id>-<variant>.png`
- Animal sprites: `https://animal-rescue-centre.vercel.app/assets/animals/<species>-<variant>-<state>.png`
- Driving art (mirrors / charms / etc.): `https://animal-rescue-centre.vercel.app/assets/driving/...`

CORS is wide-open (`Access-Control-Allow-Origin: *`). Manus will cache-fetch any URL you give it.

**Always include 2–3 reference URLs per character** so Manus can triangulate on identity across different poses/expressions. One reference gives less-reliable results than three.

**Include a safeguard line** in the brief:

> "If you cannot fetch these URLs, STOP and report back — do not generate sprites from description alone."

Saves us from silently-drifting outputs that look wrong.

## Rule 2: No ground context under sprites

For any sprite intended to be **composited into a scene at runtime** (walking on streets, dropped on map pins, placed in the game world), Manus must NOT paint ground / environment / road surface underneath.

**Forbidden beneath the character's feet:**
- Pavement / tarmac / road surface
- Zebra crossing stripes
- Kerbs / gutters
- Grass / cobbles / sand
- Any painted ground plane
- Lane markings

**The only acceptable under-foot element** is a **small soft-edged oval cast shadow** — a thin painted smudge that suggests they're standing on something, without defining what. Everything else under the shadow is fully transparent PNG.

**Why:** the game composites sprites over different backgrounds — tarmac for driving, pavement for walk scenes, grass for park scenes, sand for beach scenes. Any painted ground in the sprite will clash when the background changes.

Boilerplate paragraph to drop into every sprite brief:

> **DO NOT paint any pavement, road surface, zebra crossing stripes, kerb, grass, or ground context under the character's feet.** The game will composite these sprites over different surfaces at runtime — any painted ground will clash. The only acceptable element beneath the character is a small soft-edged oval cast shadow directly under their feet; everything else is fully transparent.

## Rule 3: Dimensions, background, naming

Defaults unless a brief overrides:

- **Dimensions**: 1024×1024 PNG for character sprites, 512×512 for small props / charms.
- **Background**: transparent.
- **Clearance**: ≥10 % empty space above head + below feet for full-body sprites. Manus tends to crop tightly if not told; the crop-regen task of 2026-04-24 exists only because this rule was implicit, not explicit.
- **Filenames**: exact filenames specified in the brief, one per expected sprite. Manus occasionally invents filenames; the brief should always say "Filenames (exact): ..." and enumerate.

## Rule 4: Style-anchoring paragraph (tightened 2026-04-24)

For painted-storybook work, paste this paragraph verbatim. The update — after the first walking-pose commission drifted into generic-anime-kid territory — adds explicit blocklist language and stronger positive anchors.

> **Style**: painted watercolour storybook treatment matching the existing in-game cast portraits exactly. Warm ink outlines, soft colour washes, painted imperfections. The reference set is Julia Donaldson, Raymond Briggs, Aardman-adjacent illustration — **small realistic eyes set into soft painted faces**, not big-eyed anime. Storybook warmth, not cartoon sweetness. Natural human proportions even for child characters — NOT chibi, NOT big-headed.
>
> **BLOCKLIST** (do not render in this style — will be rejected): anime · manga · chibi · big-eyed kawaii · vector flat-shading · comic-book cel-shading · photorealism · sci-fi · cyberpunk · neon / Blade Runner palettes · racing-game HUD aesthetics · overly cute saccharine Disney · generic Pixar-style 3D.
>
> The **face treatment** matters most. Small eyes, expressive but understated. If you are drawing child characters, do NOT default to big-eyed chibi / anime; instead render faces the way a children's-picture-book illustrator would — natural-proportion heads, eyes small, painted softly.

## Rule 5: Ask for self-check before delivery

End every multi-sprite brief with:

> Before delivering, for each sprite ask yourself: "would someone looking at this instantly recognise this as the same character from the reference portraits / the same style as the existing set?" If not, re-do that sprite before shipping.

This catches drift before it eats review cycles.

## Rule 6: OpenAI ONLY for anything needing character / style continuity (Marcus, 2026-04-24)

**Hard rule:** if a sprite needs to preserve character identity, match existing art, or sit in a set alongside others, use **OpenAI's `/v1/images/edits`** via `tools/gpt-image-regen.sh` — NOT Manus.

Why: Manus's NanoBanana re-composes scenes with only loose adherence to references, and — critically — will silently proceed without fetching references if it can't reach them (which it can't if references are local paths, and sometimes even with public URLs). That's an unacceptable failure mode for cast / cameo work.

OpenAI's `/v1/images/edits` takes the reference image(s) as multipart input — no URL-fetch race, no silent drift. It's the canonical choice for:

- Cast walking / waving / greeting poses.
- Cast crop regens (preserving identity while fixing framing).
- Animal sprite regens in a consistent style.
- Any sprite that belongs to a set that must match.
- Any sprite that must match a specific pre-existing character.

Manus is acceptable ONLY for brand-new sprites with no character-continuity stakes — things like:

- The original dangly-charm set (17 new items, no prior art to match).
- The initial painted mirrors (5 new pieces, vehicle-specific vibes but no cross-reference constraints).
- One-off backdrop illustrations, landscape scenes, unique props.

**If there's any doubt, use OpenAI.**

### STOP on reference-fetch failure

Every OpenAI brief for continuity work must include: "if you cannot load the reference images, STOP and report back — do not generate from description alone." The `tools/gpt-image-regen.sh` pipeline has built-in reference-loading so this is a safeguard against future tooling changes.

---

## Quick template

Copy-paste and fill in:

```
## References (fetch before drawing — publicly reachable)

[Character Name] ([short ID description]):
- https://animal-rescue-centre.vercel.app/admin/scene-assets/...
- https://animal-rescue-centre.vercel.app/admin/scene-assets/...
- https://animal-rescue-centre.vercel.app/admin/scene-assets/...

If you cannot fetch these URLs, STOP and report back — do not generate sprites from description alone.

## Shared rules

- Dimensions: 1024×1024 PNG, transparent background.
- Full height (head to feet). ≥10% clearance above head and below feet.
- Small soft-edged oval cast shadow beneath the feet. NO pavement / road / grass / crossing stripes / kerb / any ground context. Just the shadow; everything else transparent.
- Painted watercolour storybook style matching the references exactly — warm ink outlines, soft colour washes, Julia Donaldson / Sarah & Duck feel. No photorealism, no vector, no sci-fi.

## Sprites to generate

[Enumerate with exact filenames]

## Self-check before delivery

For each sprite: "would someone looking at this instantly recognise this as the same character / same style as the references?" If not, re-do before shipping.
```
