# Animal sprite pose specification

_2026-09-05. The contract every animal sprite is drawn to. Written from
what the game actually composites, verified in code, not from what a pose
sounds like it should contain._

The rule behind all of it: **the sprite draws the animal; the game draws
everything the player chose.** A collar, a bowl, a toy and a food item are
all things a child picks. If the sprite carries one, the player's choice
either doubles up or is contradicted.

There is a second, purely mechanical reason. `apps/game/src/ui/sprites.ts:131`
fits sprites with `Math.min(w / img.width, h / img.height)` — contain-fit on
square art. **Any baked-in prop inflates the bounding box and shrinks the
animal proportionally at every call site.** A cat with a bowl is a smaller
cat everywhere in the game.

## Where each pose is actually drawn

`deriveVisualState` (`apps/game/src/ui/sprites.ts:31`) only ever returns
five states: `arriving`, `sick`, `sleeping`, `eating`, `sheltered`. Two more
arrive by explicit `stateOverride` — `walking` (`WalkScene.ts:558`) and
`playing` (`PlayScene.ts:372`, `GardenView.ts:512`).

| Pose | Drawn in game | Where |
|---|---|---|
| arriving | yes | `CorridorView.ts:542`, `AnimalCard.ts:288` |
| sheltered | yes | rooms, garden, vet, grooming, adoption, pickers |
| eating | yes | `KitchenMinigameScene.ts:197`, rooms when hunger ≥ 70 |
| sleeping | yes | rooms and garden when tiredness ≥ 70 |
| walking | yes | `WalkScene.ts:556` only |
| playing | yes | `PlayScene.ts:369`, `GardenView.ts:523` |
| sick | yes | anywhere, when `store.sickAnimals` has the id |
| scared | **not yet** | intended for `ConflictView`; today offline only — `tools/build-mirror-mood-sprites.ts:49` |
| grumpy | **not yet** | as scared |
| growling | **not yet** | as scared |

The last three are drawn for the animal-interaction screens and are not
reaching them — see "The conflict screen never asks for its poses" below.
Today their only consumer is one 128px `<species>-stressed.png` for the PTV
rear-view mirror, built offline from a single source sprite per species.

## The contract, pose by pose

Every pose, without exception: **transparent background, no ground, no
painted floor, no baked drop shadow.** The corridor supplies its own shadow
(`CorridorView.ts:546`); a second one baked into the art double-prints.

| Pose | The sprite contains | The sprite must NOT contain | Because the game draws |
|---|---|---|---|
| **arriving** | the animal alone, uncertain and a little hunched | any prop, box, crate, blanket, pouch or toy — **baked in** | the prop is a SEPARATE composited object; see "Arrival props" below |
| **sheltered** | the animal alone, settled and content | any object at all | name pill, status chips, bond bar, sibling icon, mud and flies |
| **eating** | the animal head-down in the act of eating, mouth to an *implied* spot on the ground | **bowl, dish, plate, mat, food, scattered kibble** | the bowl is painted into `bg-kitchen.png`; the food is a separate draggable `food-*.png` that tweens into that painted bowl |
| **sleeping** | the animal curled and asleep | bed, basket, cushion, blanket, floating Z's | 💤 status chip, name pill |
| **walking** | the animal mid-stride, neck and chest clear and unobstructed | **collar, lead, harness, tag, bandana** | the collar is drawn procedurally as vector at `WalkScene.ts:585`, positioned from `collar-anchors.json` — the player picks its colour |
| **playing** | the animal in its play body-language, paws and mouth empty | ball, feather, yarn, leaves, bell, rock, any toy | toys are separate objects near the screen bottom, chosen from `TOY_DEFS` |
| **sick** | the animal low and subdued, pitiful rather than frightening | bandage, thermometer, ice pack, bed, blanket, text, sad-face icon | 🩹 chip, a pulsing "Sick!" label, illness name and description |
| **scared** | tucked small and low, afraid | any object | nothing — must also survive a 128px square crop |
| **grumpy** | half-hunched, narrow-eyed, sulky | any object | as scared |
| **growling** | low and tense, cross but never scary | any object | as scared |

## The three failure modes this replaces

Marcus, 2026-09-05, named three. Each traces to a specific line.

1. **Collars on walking poses.** The old brief
   (`tools/analyze-set-consistency.sh:80`) says only "walking: NO OBJECTS",
   which a model does not read as covering a collar — a walking dog
   obviously wears one. Now named explicitly, with the reason.
2. **Arrival props that made no sense — a tiny box.** The old brief
   (`:75`) *required* a comfort object painted into the sprite, and tried to
   exclude the failure by saying "NEVER a tiny gift-like box". It failed
   anyway, because the object was the model's to invent. Props move out of
   the sprite entirely — see "Arrival props are their own objects".
3. **Bowls and food on eating poses.** The old brief (`:78`) *required*
   "a bowl or the animal holding food". This is the root cause, and it is
   directly contradicted by `KitchenMinigameScene.ts:21`.

## Arrival props are their own objects

Marcus, 2026-09-05: props stay, for the animals whose backstory earns one,
but as **a separate sprite composited partly in front of or behind the
animal** rather than painted into it.

That gets both things. The animal sprite stays a clean square, so
contain-fit draws it at full size everywhere; and the corridor keeps the
narrative beat of an animal arriving with the one object it came in with.
It also makes the prop reusable, re-orderable and independently fixable —
the tiny-box failure becomes a one-file correction rather than a re-render.

`ARRIVAL_STORIES` in `packages/game-logic/src/animals.ts:7` already gives
each species five arrival stories. The prop should be chosen to match the
story that was rolled, not the species in general: "left in a cardboard box
outside a shop" earns a box; "found shivering under a car in the rain" does
not.

This is a separate piece of work from the 600 sprites — new art, an anchor
per species, a z-order flag for in-front or behind, and a renderer in
`CorridorView`. **The 600 animal sprites are unblocked by it**, because in
both designs they carry no baked prop.

## The conflict screen never asks for its poses

`scared`, `grumpy` and `growling` are drawn for the animal-interaction
screens — two dogs squabbling over a toy and the rest. Those screens exist:
`ConflictView.ts` renders all four `CONFLICT_TYPES` from
`packages/game-logic/src/conflicts.ts:26`.

But `ConflictView.ts:86` maps every one of them to `sheltered`, `sleeping`
or `eating`. The screen that says *"Siblings {a1} and {a2} are bickering
about toys!"* draws both animals content and settled. The art is not the
problem; the mapping is. Proposed:

| Conflict | a1 (instigator) | a2 (disturbed) | Today |
|---|---|---|---|
| `space_sharing` | `sheltered` | `grumpy` | sheltered / sheltered |
| `food_jealousy` | `eating` | `grumpy` | eating / sheltered |
| `noise_complaint` | `playing` | `sleeping` | sheltered / sleeping |
| `sibling_squabble` | `growling` | `grumpy` | sheltered / sheltered |

Six lines, and it is what makes three of the ten poses visible in the game
rather than only in the PTV mirror.

`tools/analyze-set-consistency.sh` must be corrected to match this file, or
it will keep grading new sprites against the rules that caused the problem.

## Keeping the wardrobe option open

`packages/game-logic/src/wardrobe.ts` describes compositing garments onto
each pose. The seven garment PNGs exist; `wardrobe-anchors.json` does not,
and nothing renders them — `docs/audit-2026-08-22.md:332` already lists them
as orphaned. If that system is ever finished, it needs **clean, unobstructed
necks, backs and heads in every pose**, which the rules above give for free.
Worth honouring even though nothing uses it yet.
