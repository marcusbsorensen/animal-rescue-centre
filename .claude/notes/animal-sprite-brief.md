# Animal sprite round — scale respecification and brief

2026-10-09. Prepared, **not submitted**. Nothing has been sent to any provider.

---

## 1. What the measurement says

Measured all 600 state sprites in `apps/game/public/assets/animals`
(10 states × 60 species-variants) — opaque alpha bounding box as a fraction
of the file, alpha floor 8. Script and raw numbers:
`.../scratchpad/measure.py`, `measurements.json`.

**The finding holds, but the stated range is too tight.** Across the whole
set the subject's long side runs **0.62 to 1.00** of its file, mean 0.849;
`sheltered` alone runs **0.64 to 0.94**, mean 0.819. Only 53% of `sheltered`
sits inside 0.75–0.86. The spread is per-sprite noise, not species.

What is exactly as described is the thing that matters — **no state carries
any species scale at all**:

| state | smallest species | largest species | ratio | spread (cv) |
|---|---|---|---|---|
| arriving | hedgehog 0.79 | fox 0.93 | 1.19 | 0.048 |
| eating | hedgehog 0.78 | raccoon 0.89 | 1.14 | 0.037 |
| growling | snake 0.81 | bunny 0.90 | 1.10 | 0.033 |
| grumpy | hedgehog 0.76 | bat 0.88 | 1.15 | 0.038 |
| playing | hedgehog 0.79 | fox 0.93 | 1.17 | 0.046 |
| scared | raccoon 0.72 | dog 0.87 | 1.22 | 0.055 |
| sheltered | raccoon 0.72 | fox 0.85 | 1.19 | 0.051 |
| sick | hedgehog 0.80 | bat 0.94 | 1.17 | 0.047 |
| sleeping | hedgehog 0.77 | dog 0.92 | 1.19 | 0.052 |
| walking | dog 0.80 | raccoon 0.93 | 1.15 | 0.051 |

The widest any state separates its largest species from its smallest is
**1.22×**. `SPECIES_SIZE` asks for **3.3×** between dog and bat. On
`sheltered`, against a dog at 1.000: fox 1.033, cat 1.001, bunny 1.005,
snake 1.001, parrot 1.013, hedgehog 0.904, bat 0.976. The hedgehog is
fractionally smaller and that is the whole of it. **No pose varies usefully
with species; there is nothing here not to fix.**

Height fraction varies more (hedgehog 0.57, parrot 0.81 across all states),
but that is body shape — a hedgehog is squat — not scale. It separates
species by 1.42× at most, still a quarter of what the table wants.

### Two things the measurement turned up that change the answer

**(a) The art is not what normalises the sprites. The install step is.**
`tools/install-restyled.py:66-70` crops each sprite to its subject and
rebuilds a square canvas `MARGIN = 1.06` times the subject's long edge. The
90 restyled cats already staged in `asset-drafts/batch-restyle/staged-512/`
measure **0.9434 to 0.9453** on the long side — a spread of 0.002 across 90
sprites, and 1/1.06 = 0.94340. That number is the constant, not the drawing.

The consequence is the key one for this round: **a scale clause in the
generator prompt would be deleted at install, deterministically.** Buying
scale from the model is buying something the pipeline then throws away.

**(b) The premise that the table grows by 510 is wrong, and the real gap is
worse.** `SPECIES_SIZE` is keyed by species, and `Species`
(`packages/shared-types/src/index.ts:4`) has eight members. The 510 are
restyles of species that already exist, so the table would not grow by one
entry. What is actually true:

- **Raccoon and skunk have 10 sprites each and no entry in `SPECIES_SIZE`.**
  Art shipped, scale missing, today. That is the failure mode in miniature.
- **The art has 60 species-variants and the table has 8 rows.** A macaw and
  a budgie, a fennec and an arctic fox, a pug and a collie cannot differ in
  a table keyed by species. They can differ on a canvas.
- **`SPECIES_SIZE` is used in exactly one place** — the loose row in
  `crate-loading-view.ts`. Everywhere else (`VetScene`, `GroomingScene`,
  `WalkScene`, `PlayScene`, `KitchenMinigameScene`, `AdoptionMatchScene`)
  goes through `createAnimalSprite`, which contain-fits the whole texture
  into a fixed box (`sprites.ts:124`). On every one of those screens a
  hedgehog is drawn the size of a dog, right now.

### Other faults found in passing

- **42 sprites are not 512px**: 40 at 128×128 and 2 at 256×256, all of them
  legacy base-species files (`dog-walking`, `cat-sheltered`, `parrot-*`,
  `raccoon-walking`, `skunk-walking` and so on). They are still served —
  `GameScene.ts:1401` falls back to `<species>-sheltered.png`.
- **12 sprites touch a canvas edge**, i.e. are cropped, against Rule 8:
  `bat-arriving`, `bat-brown-grumpy`, `bat-fruit-sheltered`,
  `bat-fruit-sleeping`, `bat-pipistrelle-grumpy`, `bat-white-scared`,
  `fox-arriving`, `fox-silver-arriving`, `fox-silver-playing`,
  `parrot-macaw-growling`, `snake-hognose-playing`, `snake-python-playing`.
- **Rule 3's ≥10% clearance is widely broken**: 191 of 600 have less than
  10% above the head, 206 less than 10% below the feet.

---

## 2. The scale specification

**Recommended: a shared canvas with each species drawn to a stated fraction
of it.** Not real-world metres, not a reference animal in frame.

**Why a canvas fraction.**

1. It is the only one of the three the engine already honours.
   `createAnimalSprite` contain-fits the whole texture, so the canvas
   fraction *is* the drawn size, on every screen, with no game code changed.
   Metres-per-pixel would need a change in each of the six scenes.
2. It is checkable from the PNG alone — one alpha bounding box. No reference
   object to identify, no human judgement, no eye.
3. It carries **variant** scale, which the code cannot. 60 species-variants,
   8 table rows.
4. A reference animal in frame (option c) is ruled out twice over: Rule 8
   forbids a second object in a sprite scene, and the handover records the
   exact failure — "A style reference image is drawn as content. Passing the
   python as a second reference produced a snake and a cat nose to nose."
5. Real-world metres (option b) is right for the fleet —
   `tools/scale-check.py` uses it — but wrong here, because the game
   deliberately compresses. `SPECIES_SIZE`'s own comment: a bat is "a tenth
   of his length in life and a third of his height here, because a bat drawn
   at a tenth of a dog would be four pixels." Metres stay in the spec as the
   *derivation* of the fraction, not as the delivered unit.

**And the scale is set after generation, not asked for in the prompt** —
because of finding (a). The generator is asked only for what only it can
give: the animal whole, alone, large, on clean alpha. `tools/place-at-scale.py`
then sets the size arithmetically from `SPECIES_SIZE`, read out of the game
source so there is one table and not two. This also means **respecifying
scale costs nothing in generation**: it is a post-process over art we
already have.

### The numbers

Canvas fraction = `SPECIES_SIZE` × **0.80**. The cap is 0.80 so the largest
animal keeps Rule 3's 10% clear above its head, with the foot margin below.

| species | `SPECIES_SIZE` | body length used | canvas fraction | px @1024 | px @512 |
|---|---|---|---|---|---|
| dog | 1.00 | 0.90 m | 0.800 | 819 | 410 |
| fox | 0.88 | 0.67 m | 0.704 | 721 | 360 |
| cat | 0.74 | 0.46 m | 0.592 | 606 | 303 |
| bunny | 0.58 | 0.40 m | 0.464 | 475 | 238 |
| snake | 0.56 | 0.32 m coiled | 0.448 | 459 | 229 |
| parrot | 0.50 | 0.33 m | 0.400 | 410 | 205 |
| hedgehog | 0.38 | 0.23 m | 0.304 | 311 | 156 |
| bat | 0.30 | 0.22 m span | 0.240 | 246 | 123 |
| **raccoon** | **0.70** (new) | 0.55 m | 0.560 | 573 | 287 |
| **skunk** | **0.66** (new) | 0.50 m | 0.528 | 541 | 270 |

Variants inherit their species unless named here:

| variant | fraction of a dog | canvas fraction | from |
|---|---|---|---|
| dog-pug | 0.50 | 0.400 | 0.33 m |
| dog-terrier | 0.62 | 0.496 | 0.45 m |
| fox-fennec | 0.52 | 0.416 | 0.35 m |
| bunny-lionhead | 0.44 | 0.352 | 0.28 m, a dwarf breed |
| parrot-macaw | 0.96 | 0.768 | 0.85 m with tail |
| parrot-budgie | 0.32 | 0.256 | 0.18 m |
| parrot-lovebird | 0.29 | 0.232 | 0.15 m |
| bat-fruit | 0.45 | 0.360 | judgement, see below |

**The rule that places a new species without anyone measuring art:**

> fraction of a dog = (body length in metres ÷ 0.90) ^ 0.70, rounded to 0.02.
> Canvas fraction = that × 0.80.

The exponent is fitted to the eight shipped rungs; residuals are at most
0.12 (cat) and 0.045 on average. Where the rule and `SPECIES_SIZE` disagree,
**`SPECIES_SIZE` wins** — it is what the game ships and what the tooling
reads. Raccoon, skunk and the variants above have no shipped value, so they
come straight from the rule. `bat-fruit` does not: the bat's own rung is
already a deliberate fudge, so extending the rule to a flying fox would be
false precision. 0.45 is a judgement.

### Placement, not just size

Each sprite is a **512×512 canvas, subject centred horizontally, bottom
aligned with a 4% transparent band under the feet.** Because every canvas is
the same size and every subject sits the same share of it above the floor, a
row of them drawn to one ground line stands on that line, at any scale —
which is Rule 8's "real ground with a shadow" and "true relative scale,
never thumbnailed into equal cells". Install currently *centres*, which
leaves a bat floating at the middle of its box while a dog's feet reach the
bottom.

### Proven end to end

    python3 tools/place-at-scale.py --out /tmp/scaled
    python3 tools/check-sprite-scale.py --src /tmp/scaled

556 of the existing 600 placed and **556/556 pass**. The 44 that fail are 41
of the 42 legacy low-resolution files, which would need enlarging
(`bat-arriving` squeaks through), plus `dog-chocolate-walking`,
`dog-dalmatian-growling` and `dog-husky-scared` — three 512px dogs drawn too
small in their own canvas to reach dog scale. Against the current installed
set the same check is **0/600**.

A before-and-after strip is at
`.../scratchpad/scale-before-after.png`.

---

## 3. The brief, ready to paste

The restyle goes to OpenAI `/v1/images/edits` via `tools/batch-restyle.py`,
not to Manus (Rule 6). In that harness **style is words only** — the
handover's trap list is explicit that a style reference image gets drawn as
content — and each sprite's own deployment URL is its sole reference image.
So the paragraphs below are prompt text, and the only URLs are the per-sprite
sources the tool already builds.

Added to the settled prompt: a FRAME clause (Rule 8), an explicit PROJECTION
clause (Rules 7 and 8), and a tightening of the existing ground prohibition.
Nothing else is touched — the prompt is settled after five rounds and three
attempted improvements that were measured, failed and reverted.

> **PROJECTION AND CAMERA.** One world, one camera, one hand. Every animal
> is a front-elevation stamp on transparent ground, seen from a child's eye
> level and square on — the same convention as every building, tree and prop
> in this game. Never top-down, never isometric, never a three-quarter
> ground plane, never a tilted horizon. The animal stands or lies on an
> implied flat floor that is not drawn.
>
> **FRAME — NOTHING IS SHOWN CROPPED.** The whole animal is inside the
> image: every paw, ear, tail, wing-tip, snout and whisker. No part touches
> or crosses the canvas edge. Leave clear transparent margin on all four
> sides — at least 2% of the width, and more above the head. The animal is
> drawn large within that margin: its longest dimension should reach at
> least 70% of the canvas, so that the sprite carries real painted detail.
> Do not shrink the animal to make something else fit; there is nothing else
> in the image.
>
> **GROUND.** Transparent beneath the feet and everywhere else. No pavement,
> road, grass, straw, bedding, floor, kerb or painted ground plane. **No
> cast shadow, smudge, oval or contact patch of any kind** — animals in this
> game are composited onto scenes that draw their own ground and their own
> shadow. (This is stricter than Rule 2's allowance of a soft oval, and it
> is the established animal convention: the clause is already in
> `batch-restyle.py`'s `STYLE`.)
>
> **THE ANIMAL AND NOTHING ELSE.** Delete any bowl, dish, food, mat,
> blanket, cushion, bed, box, crate, toy, ball, branch, perch, collar, lead
> or harness present in the reference and replace it with empty
> transparency. The sprite draws the animal; the game draws what the player
> chose.
>
> **KEEP.** The species, the exact markings and colouring, the face and the
> proportions identical to the reference.
>
> **STYLE.** [`STYLE` verbatim from `tools/batch-restyle.py` — KEY LINE,
> THREE-DIMENSIONAL FORM, TEXTURE, LIGHT, PALETTE, the eye clause and the
> blocklist. Plus `VOLUME` for the stems in `SMOOTH_COATED`.]
>
> **POSE.** [`POSE_RESTATE[pose]`, or "identical to the reference".]
>
> **SIZE.** 1024×1024 PNG, transparent background, one image.
>
> **SELF-CHECK BEFORE DELIVERY.** For each sprite: is the whole animal
> inside the frame with clear margin on all four sides? Is there anything in
> the image other than the animal — including a shadow? Would someone
> looking at this recognise it as the same animal, with the same markings,
> as the reference? If not, redo it before shipping.

**Relative scale is deliberately absent from the prompt.** It is set
afterwards by `tools/place-at-scale.py` from the table in §2, because
`install-restyled.py` would otherwise overwrite anything the model drew. The
table belongs in the handover and in the tooling, not in the prompt.

### Acceptance criteria, as measurements

Both halves are checked by **`tools/check-sprite-scale.py`** (written for
this round; nothing existed).

**DRAWN — what the generator owes.** `check-sprite-scale.py --drafts <dir>`:

| criterion | threshold |
|---|---|
| subject's long side | ≥ 0.70 of the canvas |
| transparent margin at every canvas edge | ≥ 2 px — nothing cropped (Rule 8) |
| alpha at all four corners | ≤ 8 — no painted background (Rule 2) |
| separate opaque objects beside the animal | 0, counted at >2% of the main blob — no prop, no bowl, no shadow |
| fully transparent output | rejected |

Run against the 90 staged restyled cats: **90/90 pass.** The generator
already delivers this; the clause makes it enforceable rather than lucky.

**SCALE — what the install step owes.** `check-sprite-scale.py` (default):

| criterion | threshold |
|---|---|
| canvas | exactly 512×512 |
| subject's long side | species fraction from §2, ±0.015 |
| transparent band under the feet | 0.04 of the canvas, ±0.015 |
| subject midline | 0.50 of the width, ±0.03 |
| species with no entry | rejected by name |

`SPECIES_SIZE` is parsed out of `crate-loading-view.ts`, so the check and the
game cannot drift apart, and an unknown species fails loudly instead of
silently defaulting.

**Pre-submit, over the sources.** `tools/check-sprite-refs.py` (also written
for this round) fetches every URL the batch will use and compares bytes to
the local file. See §4.

---

## 4. The deployment trap — checked, and clear for animals

The fleet problem is real: HEAD is `b6b97e8` on `claude/picker-no-building`
and `git branch -r --contains HEAD` returns nothing, so those commits are on
no remote and the repo URLs serve the old plasticine art.

**It does not apply to the animal sprites.** Verified three ways:

1. The last commit touching `apps/game/public/assets/animals` is `72272b9`,
   and `git branch -r --contains 72272b9` returns `origin/main`.
2. `git diff origin/main..HEAD -- apps/game/public/assets/animals` is empty,
   and `git status` shows nothing uncommitted there.
3. **All 510 source URLs fetched and compared byte for byte**:
   `python3 tools/check-sprite-refs.py --exclude cat` →
   *510/510 reachable and byte-identical · safe to submit*. Ten of them were
   also checked by hand with `curl` + `shasum -a 256`, including
   `snake-python-sheltered`, `hedgehog-brown-sheltered`, `raccoon-walking`
   and `skunk-walking`.

This matters more than usual here, because `batch-restyle.py:234` passes
**each sprite's own deployment URL as its reference image**. A sprite
committed but not deployed is a request spent restyling old art, or a 404.
The handover lists this as a trap and it was previously done by hand for the
cats only; it is now a script, and it should run immediately before submit,
not today-and-assume.

**Where attachment is needed instead of a link.** The style anchor for the
new register is the 90 restyled cats, and they are **not reachable**: they
live in `asset-drafts/batch-restyle/staged-512/`, which `.gitignore:27`
excludes, so they are untracked, unpushed and undeployed. For this round
that costs nothing — the OpenAI harness takes style in words only, and
passing an image as a style reference is a known failure. **But if this
round or any future one goes to a human illustrator or to Manus, the
restyled cats must be attached as files, not linked.** The only linkable
style anchor is `snake-python-sheltered.png`, the declared target, verified
identical to local.

---

## 5. Cost, and one round or two

### The currency is dollars

$0.1096 per image on the Batch API (half the $0.2192 serial rate). 510 ×
$0.1096 = **$55.90**. The figure that has been circulating as "£55.90" is
the handover's dollar figure. At roughly 0.75 that is **about £42** — check
the card rate rather than quote this.

### What the round buys

510 sprites = 51 species-variants × 10 states. Everything except the cats,
whose 90 are already generated and staged.

| species | variants | sprites | cost |
|---|---|---|---|
| dog | 9 | 90 | $9.86 |
| bunny | 8 | 80 | $8.77 |
| fox | 7 | 70 | $7.67 |
| hedgehog | 7 | 70 | $7.67 |
| snake | 6 | 60 | $6.58 |
| parrot | 6 | 60 | $6.58 |
| bat | 6 | 60 | $6.58 |
| raccoon | 1 | 10 | $1.10 |
| skunk | 1 | 10 | $1.10 |
| **total** | **51** | **510** | **$55.90** |

States: `arriving`, `eating`, `growling`, `grumpy`, `playing`, `scared`,
`sheltered`, `sick`, `sleeping`, `walking`.

It buys the **restyle** — key line, three-dimensional form, texture, palette.
Measured on the cats: ink 0.764 → 0.913 against a target of 0.923, spread
halved 0.170 → 0.099, saturation 0.357 → 0.383 against the reference's 0.360.
It does **not** buy scale, which is free and is a post-process.

### One round, with one carve-out

**No evidence that a scale instruction would be ignored, because this project
has never given one.** `tools/batch-restyle.py` and
`docs/sprite-pose-spec-2026-09-05.md` contain no scale, size or relative-size
language anywhere — the only hits for "scale" are "scales as painted scales".
So the risk Marcus asked about cannot be assessed from history. It is also
moot: the recommendation does not ask the provider for scale at all, so a
provider that would ignore it costs nothing.

That removes the main argument for splitting. The round introduces one new
clause the pilot did not test — FRAME — and the pilot result says the
generator already satisfies it unprompted (90/90 on the DRAWN check).

**Recommendation: one round of 473 sprites at $51.84, and hold back 37.**

The 37 are the legacy low-resolution base-species files within the 510 — 35
at 128×128, plus `raccoon-walking` and `skunk-walking` at 256×256. Restyling
them means handing gpt-image-2 a 128px reference and asking for 1024px out,
which is not a restyle but an invented redraw, and it is the one part of the
round with no pilot evidence behind it. $4.06 held back, submitted separately
with eyes on it.

Two things worth knowing before submitting, neither of which changes the
recommendation:

- **Pale and long-haired animals are the known weak case.** `cat-white` came
  back at ink 0.677 against the set's 0.913, and all ten weakest sprites in
  the pilot were cat-white. The remaining set holds `dog-golden`,
  `dog-husky`, `bunny-angora`, `bunny-arctic`, `fox-arctic`,
  `hedgehog-albino`, `hedgehog-blonde`, `bat-white` — 80 sprites, $8.77, at
  the same risk. Expect to re-roll some.
- **Snake, parrot and bat were not in the pilot.** Scales, feathers and wing
  membrane have never been measured under the KEY LINE clause. The style
  target is itself a snake, which helps.

---

## Open questions

1. **The macaw at 0.96 of a dog** — a scarlet macaw really is 85 cm with its
   tail, so the rule says it is nearly dog-sized. Honest, and possibly
   startling on screen. Keep 0.96, or cap parrots at the species' 0.50?
   *Recommend keeping 0.96: Rule 8's "true relative scale" is the point, and
   a surprisingly big parrot is a thing a child learns.*
2. **`bat-fruit` at 0.45** is a judgement, not a derivation. Accept, or pick
   a number?
3. **Raccoon and skunk need adding to `Species`** before the check can pass
   on them from the game's own table. Twenty sprites are affected and I have
   not touched `packages/` or `apps/game/src/`. Want that as a separate
   change?
4. **The 42 low-resolution legacy sprites** are a problem independent of this
   round — they are 128px files in a 512px set, still served as the
   no-variant fallback. Redraw, or retire the fallback?

## Could not settle

- Whether the single-animal screens (`GroomingScene`, `VetScene`,
  `PlayScene`, `KitchenMinigameScene`) should divide out the species
  fraction so one hedgehog fills its frame. With scale in the canvas, a lone
  hedgehog on the grooming screen draws at 30% of the box. It wants a `fill`
  option on `createAnimalSprite`; I have not touched `apps/game/src/`.
- Whether `install-restyled.py` should be changed to place at scale, or
  whether `place-at-scale.py` should stay a separate step after it. Left
  separate and non-destructive for now — it writes new files and overwrites
  nothing.
- Whether failed batch requests bill. Still unverified against the invoice,
  as the handover says.

## Files written

- `.claude/notes/animal-sprite-brief.md` — this note.
- `tools/check-sprite-scale.py` — the acceptance check, both halves.
- `tools/place-at-scale.py` — sets the size from `SPECIES_SIZE`. Writes new
  files, overwrites nothing.
- `tools/check-sprite-refs.py` — the pre-submit byte check over every
  reference URL.

Nothing under `apps/game/src/` or `packages/` was touched, and nothing was
submitted.

---

# Part two — the scale system, landed

2026-10-09, later the same day, on `claude/animal-scale` off
`claude/crate-loading` (`ffda5cb`). Everything above stands as written
except for **where the fraction lives**, which moved, for four reasons set
out below. Nothing was submitted and no Manus tool was called.

## The one departure: the fraction is in the code, not in the PNG

§2 recommends baking each species' share into the sprite's own canvas, so
that `createAnimalSprite`'s contain-fit *is* the scale with no game code
changed. Having put the call sites in front of me, the evidence goes the
other way, and the numbers in §2 are used unchanged — just applied by the
sprite layer rather than painted in.

1. **Six consumers are not Phaser at all.** The adoption office, the
   adoption ceremony, the rewilding farewell, the visitor card
   (`GameScene.ts:1400, 1526, 1566, 2287`), the intro panel
   (`IntroScene.ts:105`) and the update banner (`UpdateBanner.ts:83`) each
   hand a sprite URL to an HTML overlay that draws it in an `<img>`. None of
   them has any way to divide a species fraction back out. With the fraction
   in the PNG, a bat portrait on the farewell screen draws at 24% of its
   frame; with it in the code, those six are untouched and correct.
2. **It would square the fraction in `crate-loading-view.ts`.** `looseRow`
   already multiplies its box by `SPECIES_SIZE` before the sprite layer sees
   it (`crate-loading-view.ts:3910`), so art carrying the fraction as well
   would draw a hedgehog at 0.38² — 2.6x too small beside the dog. That file
   was being rewritten by somebody else and was out of bounds, so the fix
   had to be one that does not need it.
3. **It breaks the size contract.** With the fraction in the PNG, a `fill`
   sprite has to be drawn *larger* than the box to make the animal fill it,
   so `displayWidth` stops bounding the drawing. Nineteen call sites lay
   labels out against that box, and `ui/__tests__/sprites.test.ts` holds the
   contract precisely because it has been broken before.
4. **One number, one line.** Changing a rung in the code is an edit;
   changing it in the art is 600 files and a regenerated table.

§2's three arguments for the canvas, measured against this: "the engine
already honours it" is true only where nothing else sizes the box and
nothing measures `displayWidth` — false for the DOM and false for
crate-loading. "Checkable from the PNG alone" is unaffected. "It carries
variant scale, which the code cannot" stopped being true the moment the code
got a variant table, which Job 1 asked for anyway.

## What is in the branch

**`packages/game-logic/src/animal-scale.ts`** — the ladder. The eight
shipped rungs, plus raccoon 0.70 and skunk 0.66, plus the eight variant
exceptions, plus `ANIMAL_CANVAS_CAP = 0.80` and `ANIMAL_FOOT_BAND = 0.04`.
`animalScaleUnit(species, variant)` falls back to the species and returns
`undefined` — never a guess — for a species with no rung.
`tools/check-sprite-scale.py` now parses this file instead of
`crate-loading-view.ts`, so the tooling and the game read one table.

**Raccoon and skunk did not join `Species`, deliberately.** They are the
tunnel minigame's habitat animals (`tunnel.ts:36`,
`'fox' | 'skunk' | 'hedgehog' | 'raccoon'`); nothing spawns a raccoon into
the shelter and nothing adopts a skunk. Admitting them would be a feature,
and the compiler says so: more than twenty `Record<Species, ...>` maps would
each need a row — arrival stories, names, variants, colours, temperament,
rain and cold tolerance, crate compatibility, crate preference, alarm rank,
grooming tools, toys, garments, wardrobe anchors, the species emoji, the
species sound — plus `SPECIES_SIZE` itself, which is in the file that was
out of bounds. `unlockedSpecies` in the save file would also start carrying
a value older saves have never seen.
(`docs/plan-lily-content-2026-07-04.md:159` already records this as six hard
breaks; it is more than twenty now.) So they are carried by `ScaledSpecies`,
where the only question is how big the drawing is, and a test asserts every
`HABITAT_EXITS` key has a rung.

**Variant scale** is a second table keyed `species-variant`, consulted
first, falling back to the species. Eight exceptions; the other 52
species-variants inherit. One note on the numbers as given: `parrot-lovebird`
at 0.29 is not on the 0.02 grid the rule in §2 states — the rule gives
0.2853, which rounds to 0.28. Kept at 0.29 as specified; worth a decision.

**`createAnimalSprite` gained `scale: 'species' | 'fill'`**, and the claim is
made at every call site rather than inferred.

- `'species'` draws the animal's long side at her fraction of the box's
  shorter side. It is applied against a **Phaser frame cut to the animal**,
  from a generated table of measured bounds, rather than against her canvas.
  That is what takes out the 0.62-to-1.00 spread §1 measured — and the
  pose-to-pose jitter inside one animal, which is the same fault seen from
  closer up: today a grooming subject changes size when she changes mood. It
  also makes `displayWidth` finally mean the animal rather than her
  transparent margin, which is what the shadows, name pills, status chips and
  dirt spreads have all been measuring.
- `'fill'` is the old whole-canvas fit, unchanged. It fills the frame because
  the install step already normalises every sprite to fill its canvas, so a
  solo screen needs no arithmetic — and its hand-measured decorations stay
  where they were measured.

**`apps/game/src/ui/animal-sprite-bounds.ts`** — generated, 600 rows, 27 KB:
`key canvasW canvasH x y w h`. Emitted by
`python3 tools/check-sprite-scale.py --emit-bounds` from the same measurement
the checks use.

## Solo against comparative — the decision

**Marcus's view holds, and the call sites support it.** Comparative scale
means something only where there is something to compare with, so every row,
bay, queue, pairing and grid uses true scale and a lone animal fills her
frame.

The evidence that settled it, beyond the principle: on the four solo screens
the animal *is* the playfield. The grooming dirt spots are spread over
`sprite.displayWidth * 0.2`, the thrown toy lands at
`dogCY - sprite.displayHeight * 0.05`, the kitchen name plate sits on
`sprite.getBounds().top`, and the vet's name and illness are set beside the
sprite at a hand-measured x. Drawing a hedgehog at 0.304 of those frames
would not only read as a mistake, it would shrink the thing a child has to
brush, and it would put the vet's label inside the animal. None of those
screens has a second animal to be wrong against.

**Nine drawing situations across six screens were wrong** — every species the
same size, beside another species:

| screen | what is beside what |
|---|---|
| `CorridorView.ts:542` | the arrivals queue, every species, one floor |
| `RoomView.ts:183`, `:224` | a room's residents and the cross-fade ghost |
| `GardenView.ts:382`, `:523` | the lawn and the nook, plus the wild returners |
| `ConflictView.ts:136` | the pair having the falling-out |
| `KitchenMinigameScene.ts:197` | the row of hungry animals at their bowls |
| `WalkScene.ts:673` | the animal passers-by on the grid |

Eleven more are now explicitly `'fill'`: `GroomingScene` (2), `VetScene`,
`PlayScene` (2), `ToyPickerView`, `CollarPickerView`, `AnimalCard`,
`AdoptionMatchScene`, `WalkScene:213`, and `WalkScene:556`.

**`WalkScene:556` is the one place the comparative claim is knowingly not
made**, and the comment says so. The player's pet is already drawn to a
different box from the passers-by (1.7 cells against 1.4), so that screen has
never compared them; and the collar is positioned by a table of per-variant
anchor fractions tuned by eye against this box, for sixty animals. Re-basing
it on the drawn animal is right and is a change nobody can check except by
looking at all sixty.

Four comparative screens also now stand their animals on a **ground line
measured off what was drawn** rather than off the box — Corridor, Room,
Conflict and Kitchen. Without that a hedgehog at 0.304 of her box hangs two
thirds of a box above the floor her room-mate is standing on, which looks
worse than the bug it fixes.

`apps/game/src/ui/__tests__/animal-scale-wiring.test.ts` fails if any call
site in `apps/game/src` leaves the question open. One exemption, named with
its reason: `driving/crate-loading-view.ts`, ten call sites, all of them "the
animal fills the box this screen already worked out" — the default is right
for every one, so nothing there is drawn wrong, but the claims are not yet
written down. **The one-line follow-up** is to delete `SPECIES_SIZE` from
that file and re-export the shared table; a test currently asserts the two
literals agree rung for rung so they cannot drift meanwhile.

## The thing true scale breaks, and the fix

**Drawing an animal honestly shrinks the thing a child has to hit**, and it
shrinks it most for the animals a child most wants to prod. A bat at 0.24 of
a 148px corridor box is 36px across, against the 48 the rest of the game
holds itself to; the corridor, the rooms and the garden all pass
`interactive: true`. So `createAnimalSprite` now grows the hit area back to
`MIN_TAP` around the animal's middle whenever she is drawn under it, in frame
units so Phaser scales it with the sprite. An animal already big enough keeps
her own silhouette as the target. The picture shrinks; the target does not.
Two tests hold both halves.

One trap found doing it, worth knowing: naming anything from `Phaser.Geom` as
a *value* in `ui/sprites.ts` makes the Phaser import survive the build, and
loading Phaser for real under jsdom throws on its canvas probe — every sprite
test fails before it runs. The hit rectangle and its `contains` are written
out by hand so the import stays type-only and is erased.

## The art, placed and verified — and not installed

    python3 tools/place-at-scale.py --out <dir>     # 556 placed, 44 failed
    python3 tools/check-sprite-scale.py --src <dir> # 556/556 pass

Reproduced exactly as §2 reports. The 44 are the 41 legacy base-species files
(40 at 128px, 2 at 256px) plus `dog-chocolate-walking`,
`dog-dalmatian-growling` and `dog-husky-scared`, three 512px dogs drawn too
small in their own canvas; all would have to be enlarged, and
`place-at-scale.py` names every one of them on each run. They are not fudged
and not hidden.

**The placed set is not installed, and should not be while the fraction lives
in the code** — the two are alternatives, not complements. Installing it would
halve the drawn size of every animal on the solo screens and in the crates,
and square the fraction in the loose row. The frame-based lookup means
`'species'` would draw correctly either way, which is worth knowing, but
`'fill'` and the ten unannotated call sites would not.

**The 90 staged restyled cats pass the DRAWN check 90/90** and the scale
system makes installing them safe — their drawn size now comes from the
ladder, not from the file. Installing them is still a **separate decision and
not one taken here**: they are a restyle in a new visual register, and
shipping them would leave the cats looking different from the other 510
animals until that round runs. If they go in, regenerate the bounds table;
the gate fails until it is.

## The gate

`.github/workflows/ci.yml` runs `python3 tools/check-sprite-scale.py --gate`
before typecheck, and `pnpm check:sprites` is the same command by hand. It
does two things a typecheck cannot:

- **The bounds table against the art.** A stale row makes the sprite layer
  cut its frame from the wrong box. Verified both ways: a single altered
  number fails the gate with `rc=1`.
- **The drawn checks over the installed set** — cropped, painted corner,
  stray object beside the animal, drawn small. 557/600 pass today. The 43
  that do not are listed with their reason in
  `tools/sprite-scale-known-failures.txt`, which is the record of what still
  needs art: the gate fails on anything not in it, **and fails when something
  in it starts passing**, so the list only ever shrinks.

## The picture

`.../scratchpad/animal-scale-before-after.png` — three bands drawn by
`createAnimalSprite` in real Chrome through real Phaser, each standing on one
ground line: `'species'` (dog through bat, descending), `'fill'` (the same
eight at one size — the bug, drawn), and the variant row (macaw against
lovebird, collie against pug). The page is
`apps/game/public/admin/animal-scale-review.html`, dev server only.

**The six real screens could not be screenshotted here.** `apps/game/.env.local`
does not exist in this worktree, so `supabase.ts` throws on boot and the game
never reaches a scene; the Room, Corridor and Garden all sit behind the login
gate, and TRAPS records that `ErrorOverlay`'s scrim covers them anyway without
a session. The review page exists because of that: same function, same engine,
same browser.

## Still open

1. `parrot-lovebird` at 0.29 is off the rule's 0.02 grid (it gives 0.28).
2. The macaw at 0.96 and `bat-fruit` at 0.45 are unchanged from §2's open
   questions and are both now in shipped code.
3. `SPECIES_SIZE` is still declared in `crate-loading-view.ts`, pinned to the
   shared table by a test. One line to remove, once that file is free.
4. The 44 unplaceable sprites and the 43 drawn failures overlap but are not
   the same list; both need art, neither is a code problem.

---

## 2026-10-09, later: the round was submitted and every request failed

Both batches went out at 16:52 and produced **nothing**.

| group | batch id | total | failed |
|---|---|---|---|
| untested | `batch_6ac90dac99dc8190ad259b0810111291` | 234 | 234 |
| proven | `batch_6ac90dcdb75481909eca47e1ce153351` | 239 | 203, then cancelled |

One cause, every request:

```
code=invalid_value  "Transparent background is not supported for this model."
```

`gpt-image-2` does not accept `background: transparent`. `batch-restyle.py:43`
defaults `MODEL` to `gpt-image-2` and `:224` sets `'background': 'transparent'`,
so the two have never been compatible. The probe batch the request shape was
taken from (`batch_6a9c19bb`) evidently did not exercise this pair.

**Nothing was billed for generation.** The Batch API charges completed requests;
zero completed. The $51.84 is unspent.

**Two things were right** and should not be re-litigated: references were linked
under `images[].image_url` and verified byte-identical to local by
`check-sprite-refs.py` first (the Batch API takes no multipart body, so linking
is forced and verification substitutes for attaching); and the split into two
batches put the untested surfaces in their own group.

### The fix, measured

`gpt-image-1.5` is on the account and **does** accept transparency. Probed with
this round's real 4,777-character prompt at high quality, on `bat-brown-arriving`
(a species the pilot never covered):

| | source | restyled |
|---|---|---|
| transparent | 59% | 68% |
| ink, luma < 0.35 | 32.0% | 29.4% |
| corner alpha | 0,0,0,0 | 0,0,0,0 |
| distinct colours | 249 | **46,632** |

Alpha is genuine and ink coverage is in range. The colour count is 187x the
source and more than upscaling accounts for: it suggests smooth gradient shading
where the existing art uses flat posterised washes. **Marcus is judging that from
the picture before any batch is resubmitted.**

Also unverified: the price. $51.84 was 473 x $0.1096, which is *gpt-image-2's*
batch rate. gpt-image-1.5 may differ and `/organization/costs` returns 403 with
the key in `.env.local`, so an admin key is needed to confirm actual spend.

### To resume
`asset-drafts/animal-restyle-2026-10-09/{untested,proven}/requests.jsonl` are
already built, 234 and 239 lines. Swapping `body.model` to `gpt-image-1.5` is the
only change needed. Do NOT rebuild the prompt.
