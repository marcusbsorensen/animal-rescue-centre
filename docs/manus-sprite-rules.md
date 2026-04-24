# Manus sprite briefing rules

A.R.C. in-house conventions for briefing Manus / NanoBanana when we need character or object sprites. Learnt the hard way over the 2026-04-24 session — record these and use them as the default brief scaffolding for every future sprite commission.

## Rule 1: Manus CAN'T read the local filesystem

Manus's sandbox has no access to the Mac. "Match the portrait at `apps/game/public/admin/...`" is invisible to it — the brief will be executed from the text description alone and character identity will drift badly.

**Fix:** for any character-continuity work, embed **publicly reachable reference URLs** in the brief. We have a live Vercel deployment serving admin assets:

- Cast portraits: `https://animal-rescue-centre.vercel.app/admin/mockup-assets/cast/<id>.png`
- Apprentice poses: `https://animal-rescue-centre.vercel.app/admin/mockup-assets/cast/apprentices/<name>-<pose>.png`
- Cast variants: `https://animal-rescue-centre.vercel.app/admin/mockup-assets/cast/variants/<id>-<variant>.png`
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

## Rule 4: Style-anchoring paragraph

For painted-storybook work, paste this paragraph verbatim:

> Painted watercolour storybook style, matching the existing cast portraits and animal sprites. Warm ink outlines + soft colour washes. Think Julia Donaldson / Sarah & Duck / Axel Scheffler illustration. Loose painted imperfections welcome. **AVOID:** photorealism, anime, vector flat-shading, sci-fi / cyberpunk, racing-game HUD aesthetics, overly cute saccharine cartoon, neon / Blade Runner palettes.

## Rule 5: Ask for self-check before delivery

End every multi-sprite brief with:

> Before delivering, for each sprite ask yourself: "would someone looking at this instantly recognise this as the same character from the reference portraits / the same style as the existing set?" If not, re-do that sprite before shipping.

This catches drift before it eats review cycles.

## Rule 6: When character-continuity matters most, use GPT-Image-2 instead

For **the highest-fidelity character preservation**, Manus's NanoBanana is not the best tool — it re-composes scenes and can drift even with references. Use the existing `tools/gpt-image-regen.sh` which wraps OpenAI's `/v1/images/edits` with proper reference-image conditioning. We've had better identity-preservation results from that path for animal sprites and cast portraits.

Rule of thumb:
- **Brand-new sprites with loose identity requirements** → Manus with URL references.
- **Regen existing sprites / preserve specific character identity** → GPT-Image-2 via `tools/gpt-image-regen.sh`.

---

## Quick template

Copy-paste and fill in:

```
## References (fetch before drawing — publicly reachable)

[Character Name] ([short ID description]):
- https://animal-rescue-centre.vercel.app/admin/mockup-assets/...
- https://animal-rescue-centre.vercel.app/admin/mockup-assets/...
- https://animal-rescue-centre.vercel.app/admin/mockup-assets/...

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
