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

## Rule 6: References are ATTACHED, never linked (Marcus, 2026-04-24; narrowed 2026-10-09)

**Hard rule:** if a sprite needs to preserve character identity, match existing art, or
sit in a set alongside others, its references are **attached as files**. Never linked. If a
brief must rely on a URL, `shasum` what that URL actually serves against the local file
first. The PROVIDER is then chosen per job on measured acceptance, not named in advance.

This rule was narrowed on 2026-10-09. It used to read "OpenAI ONLY ... NOT Manus" and to
mandate `tools/gpt-image-regen.sh`. Its reason survived testing; its remedy did not, twice
over, and the evidence is in the dated section below. What generalises is attach-don't-link.
Which provider is safer is a question about one specific job, answered by measuring what
comes back.

Why: Manus's NanoBanana re-composes scenes with only loose adherence to references, and — critically — will silently proceed without fetching references if it can't reach them (which it can't if references are local paths, and sometimes even with public URLs). That's an unacceptable failure mode for cast / cameo work.

OpenAI's `/v1/images/edits` takes the reference image(s) as multipart input — no URL-fetch race, no silent drift. It's the canonical choice for:

- Cast walking / waving / greeting poses.
- Cast crop regens (preserving identity while fixing framing).
- Animal sprite regens in a consistent style.
- Any sprite that belongs to a set that must match.
- Any sprite that must match a specific pre-existing character.

Work with NO character-continuity stakes — brand-new sprites with nothing to match — carries
none of this weight. Things like:

- The original dangly-charm set (17 new items, no prior art to match).
- The initial painted mirrors (5 new pieces, vehicle-specific vibes but no cross-reference constraints).
- One-off backdrop illustrations, landscape scenes, unique props.

**If there's any doubt, attach the references and measure what comes back.** A set that must
share an exact footprint is the hardest case either provider faces, because each image is a
separate call with no knowledge of its siblings: check the footprints against each other
before anything is installed, whoever painted them.

### STOP on reference-fetch failure

Every brief for continuity work, to any provider, must include: "if you cannot load the
reference images, STOP and report back — do not generate from description alone." This is the
safeguard that matters most, because the failure it catches is SILENT: a provider that cannot
reach a reference may paint from the words alone and say nothing about it.

### Tested 2026-10-09: the reason holds, the remedy has two limits

The rule's **reason** was confirmed twice in one day. Both are the same failure: a brief pointing at a URL that does not serve what the brief thinks it serves.

1. **The plasticine style anchor.** The first crate brief gave Manus `vehicle-topdown-henry.png` at the Vercel address as a style reference. That URL serves the OLD clay render, not the repainted line-and-wash one. The pilot was anchored to exactly the style it must not have. Round 3's brief had to carry an explicit withdrawal of reference 3 (`.claude/notes/commissions-2026-10-09.md`, section 3).
2. **The unpushed top-downs serving stale bytes.** The repaint commits `b829999` and `a08ab96` are on no remote branch, so every `topdown/vehicle-topdown-*.png` URL serves the pre-repaint plasticine version. Checked by `shasum` against the local file: all six differ (`commissions-2026-10-09.md` section 7; `van-repaint-2026-10-09.md` section 4). A URL returning HTTP 200 proves nothing about which bytes it returns.

**So: attach references as files, do not link them, and `shasum` any URL a brief does rely on.** That much is settled.

The **remedy** — routing this work to `/v1/images/edits` — was then tried on the day's three commissions and hit two hard limits worth knowing before the next brief:

- **The endpoint cannot make a 1024×512 canvas.** Probed directly: `Invalid size '1024x512'. Supported sizes are 1024x1024, 1024x1536, 1536x1024, and auto.` Every vehicle portrait is 1024×512, so no portrait can be re-cut this way without a canvas change, which Rule 8 ("nothing is shown cropped") then has to rule on.
- **One probe at 1024×1024 drifted harder than Manus had.** A single crate edit, references attached and the STOP line included, came back with an invented cartoon dog and cat peeking over the rim and a "RESCUE ANIMALS" sign across the opening — big-eyed kawaii and flat cel-shading, both on Rule 4's blocklist — with the centre not clear, the footprint 885×955 instead of 932×932, and 69,394 colours against a brief asking for under 200. The Manus set it was asked to match passed all three tests. Saved at `manus-output/openai-probe/` with the numbers in `.claude/notes/openai-recommission-2026-10-09.md`.

Neither limit repeals the rule. `/v1/images/edits` still takes references as multipart input, which is the thing Manus cannot be relied on to do. But "use OpenAI" is not automatically the safer choice for a **set** that must share an exact footprint, because each image is a separate call with no knowledge of its siblings, and it is not available at all for the 2:1 portraits. **Settled by Marcus, 2026-10-09:** neither. The rule narrows to attach-don't-link, and the
provider is chosen per job on measured acceptance. Portrait work therefore stays wherever it
can actually be done — today that is Manus for a 1024x512 canvas — under attach-and-verify,
and the portrait canvas does not change. What is NOT optional is the measuring: every one of
the day's three Manus commissions was checked against its brief by script before being kept,
and that is the discipline this rule now carries.

---

## Rule 7: Map-art uses TWO projections, never one (Marcus, 2026-04-29)

When commissioning anything that lands on the in-game world map, **the painted-storybook convention is hybrid**:

- **Ground features = top-down / bird's-eye.** Roads, gardens, lawns, paths, gravel forecourts, beaches, fields, sea, scrub. Painted as if the camera is straight up.
- **Buildings, trees, props, characters = front-elevation.** Each one is its own little stage facing the reader. Windows + doors face the kid like a face. Trees stand upright with their full canopy + trunk visible. Viewing domes, flagpoles, benches, signs all rendered as elevations.

Reference: Adobe Stock #1248673531 (fantasy kingdom map) and #286944577 (modular hand-drawn icons) — both use this exact hybrid. Same convention you'll see in every painted children's storybook map (Beatrix Potter, Julia Donaldson, the Hundred-Acre-Wood).

**Do not ask Manus for "consistent perspective" or "isometric" on map art.** That produces billboard-vs-3/4-vs-top-down chaos because the model invents perspective per element. Instead, lock the brief like this:

> Render the GROUND in soft top-down view (roads + gardens + paths painted as if seen from directly above). Render every BUILDING and TREE and PROP as a front-elevation stamp on a transparent background — front facade visible, like a sticker-book figure. Do not attempt to make the buildings sit perspectivally on the ground; treat each as its own little painting.

**Map art = ground tiles + elevation stamps composited in HTML/CSS at landmark coordinates.** Don't ask Manus to paint the whole map as a single integrated scene — that's where v1's perspective-mixing came from. Brief each piece in isolation.

---

## Rule 8: We stay inside the simulated 3D world, nothing is shown cropped, and scenes are real scenes (Marcus, 2026-10-09)

Marcus, looking at the loading screen's car park, where one vehicle was drawn as a 3D clay object in a different style from the others and another had its front cut off:

> "We need to stay within the 3D world or simulated 3D world of the game at all times. We don't show cropped versions of things. Instead, we work with real scenes with real interactions in them."

This governs every sprite we commission and every screen the sprites go on. Three parts:

- **One world, one projection, one drawn style.** Everything that stands in a scene is seen from the same camera and drawn in the same hand. A scene never mixes a clay render, a flat icon and a line-and-wash painting, and never puts one object in plan view beside another in elevation. When one piece in a set is off-style, the fix is to bring that piece in, not to hide it or shrink it. For a brief: name the projection and the camera (the fleet's top-downs are an elevated bird's-eye view, far end 88% of the near end), name the style by pointing at the repainted pieces, and say what the piece must not look like (plasticine, 3D render, glossy specular highlights).
- **Nothing is shown cropped.** Every object is drawn whole and shown whole. That rules out a fixed-height cell, an overflow clip, a mask, a kerb the object runs under, a canvas edge it is cut by, and any scale that assumes how much of the sprite is "the important part". If an object does not fit, the layout gives it more room or the scene is simplified; the object's front is never what goes. A brief asks for a full silhouette with clear margin, and says so for the rear view and the side view as well.
- **Real scenes with real interactions.** A screen is a place with real things in it that the player can act on, standing on a real ground with a shadow, not a row of icons on a backdrop. Show the one thing the player is acting on, zoomed in, with only the context that is really there at that distance. Where several pieces are compared, they are shown at their true relative scale and never thumbnailed into equal cells (the fleet: `.claude/HANDOVER.md`, "One true scale", 2026-10-08).

**How it has been applied so far.** The loading screen's car park shows one vehicle at a time, whole, in a single bay with its own shadow, and moves between vehicles with arrows (`apps/game/src/driving/car-park.ts`; `VEHICLE_VISIBLE_FRAC` is 1 and a test holds it there). It has no A.R.C. building because the only building art is a front elevation, and no road because at that zoom one lane is wider than the screen is tall.

**Not settled by this rule, for Marcus.** Rule 7's two-projection map convention (top-down ground with front-elevation buildings) describes the world *map*, and this rule has not been read as repealing it. Whether the map itself should also stay in one projection is his to say.

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
