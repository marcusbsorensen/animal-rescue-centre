# Adding a New Species to A.R.C.

A runbook for bringing a new animal into the rescue centre end-to-end — from
type definitions all the way to the door in the corridor the child taps to
meet it. Use this when adding **squirrel**, **hedgehog**, or anything else
Lily dreams up.

The existing seven species (cat, dog, fox, bunny, bat, parrot, snake) are the
reference — follow the same shape and you can't go far wrong.

---

## 0. Before you start — decide three things

| Decision | Why it matters |
|---|---|
| **Can it walk on a lead?** | Controls `WALKABLE_SPECIES` and whether the collar is a neck collar or a leg/ankle ring. Bats and parrots fly, so they get anklets; snakes may get a bandana/tail ribbon. |
| **Which variants?** | 5 is the minimum (so each incident screen can show a different individual). Mammals tend to be 6–8, birds 5. |
| **At what level does it unlock?** | L1 = cats+dogs, L2 = +foxes+bunnies, L3 = +bats+parrots, L4 = +snakes. New species usually slots in at L5 or L6. |

Once those are settled, proceed.

---

## 1. Core type definitions

### `packages/shared-types/src/index.ts`

Add the species to the union:

```ts
export type Species = 'cat' | 'dog' | 'fox' | 'bunny' | 'bat' | 'parrot' | 'snake' | 'squirrel';
```

This is the only place the species name is a first-class enum value — TypeScript
will then force you to update every place that switches on `Species`, which is
exactly what you want.

### `packages/game-logic/src/animals.ts`

Add three records keyed on the new species:

- `ARRIVAL_STORIES[squirrel]` — 4–5 short child-friendly rescue blurbs.
- `ANIMAL_NAMES[squirrel]` — ~20 presets, no free text per spec §3.
- `SPECIES_VARIANTS[squirrel]` — the visual variant list (e.g. `['red', 'grey', 'black', 'flying', 'fox', 'chipmunk']`).
- `SPECIES_COLOURS[squirrel]` — a hex colour used as a fallback when sprite assets haven't landed yet.

### `packages/game-logic/src/progression.ts`

Extend `getSpeciesUnlocksForLevel` so the new species shows up at the chosen
level. Update any associated tests in
`packages/game-logic/src/__tests__/progression.test.ts`.

### `packages/game-logic/src/walks.ts`

If the animal walks on a lead, add it to `WALKABLE_SPECIES`. The walks test
file asserts on this list and will fail until you update it.

### Other switches to audit

Run a project-wide search for `Species` to catch anything else that switches on it:

```bash
# (use the Grep tool inside Claude Code)
Species\b
```

Expected hits include:
- `packages/game-logic/src/conflicts.ts` — species-vs-species conflict rules
- `packages/game-logic/src/vet.ts` — illness lists
- `packages/game-logic/src/food.ts` — food preferences
- `packages/game-logic/src/rooms.ts` — room metadata

TypeScript will flag each exhaustive switch; fill them in.

---

## 2. Sprite assets

Everything lives in `apps/game/public/assets/animals/` with the convention:

```
{species}-{variant}-{state}.png   ← per-variant (preferred, used in game)
{species}-{state}.png             ← species-level fallback (used by sprite code
                                    when no variant art exists)
```

**Format**: 128×128 px, transparent background, ~10–25 KB.

### States required (9 per variant + 9 fallbacks)

| Group | States |
|---|---|
| **Basic** (always visible in-game) | `arriving`, `sheltered`, `eating`, `sleeping`, `walking` |
| **Emotional** (conflict/incident screens, sickness) | `growling`, `grumpy`, `scared`, `sick` |

For a squirrel with 6 variants that's 6 × 9 = 54 per-variant sprites + 9 species-level
fallbacks = **63 sprites**. Generate the species-level fallbacks first so the
game has something to draw even while per-variant art is still landing.

### Generating with Manus

Use the `work-with-manus` skill. Stay under 40 sprites per task — Manus
underdelivers on larger batches. A good batching pattern:

1. One task for all walking sprites (species + variants, one image per prompt).
2. One task per emotional-state sweep (growling for all variants; grumpy for all variants; …).
3. One task for eating + sleeping + arriving + sheltered fallbacks.

Always include 2–3 reference images in each Manus task so style stays consistent
across species. Reuse the established palette — same line weight, painterly
texture, same ground-shadow treatment.

### Verifying after download

```bash
# from apps/game/public/assets/animals/
for f in {species}-*.png; do
  sips -g pixelWidth -g pixelHeight "$f" 2>/dev/null | awk 'NR>1 {printf "%s ", $2}'
  echo "$f"
done
```

Anything not `128 128` gets resized in place:

```bash
sips -Z 128 {species}-*.png
```

Use the admin sprite grid (see §7) to sanity-check visually before committing.

---

## 3. Corridor door sign

The corridor shows one painted door sign per species. File:

```
apps/game/public/assets/signs/sign-{species}.png
```

Same design language as the existing seven — the sign becomes the visual entry
point to the species room. Draft and iterate in `asset-drafts/signs/` (which
is gitignored); only the final approved version goes into `public/assets/signs/`.

`GameScene.ts` picks up `sign-${species}` automatically from the texture cache
(see the sign lookup near line 1036). If the image is missing, it falls back to
a coloured placeholder.

### Corridor placement

Door signs are positioned via `apps/game/public/data/corridor-decor.json`
(keyed by `sign-{species}`). Add an entry for the new species using the admin
anchors page (see §7).

---

## 4. Species room background

```
apps/game/public/assets/bg/bg-room-{species}.png
```

Used by `GameScene.renderRoom` (around line 1346). If no file exists the game
falls back to `bg-room-generic`, so the game stays playable while art lands.

Size: same as other room backgrounds (check an existing one —
`bg-room-cat.png` is the reference). Keep interior elements sparse and low
on the canvas so animal sprites read clearly on top.

---

## 5. Collar anchors

Collars attach to a sprite via fractional coordinates stored in
`apps/game/public/data/collar-anchors.json`. Each species needs a
**default anchor** (the fallback for all variants) and optionally per-variant
overrides.

### Register the species in the admin editor

`apps/game/public/admin/collar-anchors.html` has a `SPECIES_VARIANTS` constant
near the top of its `<script>` block. Add the new species and its variant list:

```js
const SPECIES_VARIANTS = {
  cat:      ['ginger', 'black', /* … */],
  // …
  squirrel: ['red', 'grey', 'black', 'flying', 'fox', 'chipmunk'],
};
```

### Place the anchor

1. Open `/admin/collar-anchors.html` in a browser (published on Vercel).
2. Pick the new species, adjust handles, enable **Neck mask** (or leg/ankle-ring
   for flyers), set rotation.
3. Download the JSON, replace `apps/game/public/data/collar-anchors.json`,
   commit.

### Leg / anklet model (flyers only)

Bats and parrots wear ankle rings rather than neck collars — this limits
"walks" to short flight radii. If the new species flies, follow the bat/parrot
precedent: place the anchor on one lower leg, smaller `widthFrac`, no neck
mask, and add flight-radius logic in `walks.ts`.

---

## 6. Narrative + care content

| File | What to add |
|---|---|
| `animals.ts` → `ARRIVAL_STORIES` | 4–5 rescue blurbs |
| `animals.ts` → `ANIMAL_NAMES` | ~20 preset names |
| `vet.ts` | Species-appropriate illnesses (e.g. squirrels: broken tail, ear-mite, scurvy) |
| `food.ts` | What they eat (nuts, seeds, fruit…) and which depot food items apply |
| `conflicts.ts` | Any species-vs-species conflict rules (squirrels vs. parrots over nuts?) |
| `rooms.ts` | Room metadata (temperature, lighting, enrichment items) |

Each of these drives in-game content. Skipping any one makes the species feel
unfinished — conflict screens will stay empty, vet visits will crash on
illness lookup, etc.

---

## 7. Admin pages

Three admin pages need to know about the new species. All three are static
HTML in `apps/game/public/admin/`:

| Page | What to update |
|---|---|
| `sprite-grid.html` | Add the species to `SPECIES_VARIANTS` so the grid shows every expected sprite cell. Missing files render as red "missing" tiles — this is your source of truth for what's still to generate. |
| `collar-anchors.html` | Already covered in §5 |
| `anchors.html` | Sprite-position anchors (feet coordinates in room backgrounds) — add a species entry. |

Open each at `https://animal-rescue-centre.vercel.app/admin/<page>.html` once
deployed. If the PWA caches the old admin page, hard-refresh (⌘⇧R).

---

## 8. Testing

Add or extend tests alongside the species changes:

- `packages/game-logic/src/__tests__/animals.test.ts` — asserts variant lists, name lists, arrival-story presence.
- `packages/game-logic/src/__tests__/progression.test.ts` — asserts the new species appears at the right level.
- `packages/game-logic/src/__tests__/walks.test.ts` — update `WALKABLE_SPECIES` assertions.
- `packages/game-logic/src/__tests__/vet.test.ts` — illness lookup for the new species.
- `packages/game-logic/src/__tests__/food.test.ts` — food preferences.

Run the whole suite:

```bash
pnpm -r typecheck
pnpm -r test
```

Typecheck will usually catch missing switch cases before tests run.

---

## 9. Build + deploy

```bash
pnpm --filter game build
```

If the build succeeds, `git commit` and `git push origin main`. Vercel
auto-deploys `main` — the stable alias is `animal-rescue-centre.vercel.app`
(public, no auth). No CLI deploy needed.

Smoke-check after deploy:

1. `https://animal-rescue-centre.vercel.app/admin/sprite-grid.html` — new species block, most cells green, known gaps flagged.
2. `/admin/collar-anchors.html` — new species in the dropdown, anchor renders correctly over each variant.
3. The game itself — reach the level where the new species unlocks and confirm arrivals, sheltering, and a conflict screen all render the right sprites.

---

## 10. Local-only iteration files

Previews, backups, and draft art go in `asset-drafts/` at the repo root
(gitignored). Use that folder for:

- `asset-drafts/signs/v5-preview/` — sign iteration rounds
- `asset-drafts/bg/_bg-room-squirrel-v1.png` — earlier room-background drafts

Only the approved final goes into `apps/game/public/assets/`.

---

## Quick checklist

- [ ] `Species` union updated (`shared-types`)
- [ ] `SPECIES_VARIANTS`, `SPECIES_COLOURS`, `ARRIVAL_STORIES`, `ANIMAL_NAMES` updated (`animals.ts`)
- [ ] `getSpeciesUnlocksForLevel` updated (`progression.ts`)
- [ ] `WALKABLE_SPECIES` updated (`walks.ts`) **or** flight/leg-anklet model
- [ ] `conflicts.ts`, `vet.ts`, `food.ts`, `rooms.ts` updated
- [ ] 9 species-level sprite fallbacks
- [ ] Per-variant sprites for all 9 states (or a plan for landing them)
- [ ] `sign-{species}.png` in `public/assets/signs/`
- [ ] Corridor door placement in `public/data/corridor-decor.json`
- [ ] `bg-room-{species}.png` in `public/assets/bg/`
- [ ] Collar anchor in `public/data/collar-anchors.json`
- [ ] `collar-anchors.html`, `anchors.html`, `sprite-grid.html` admin pages updated
- [ ] Tests pass (`pnpm -r test`)
- [ ] Typecheck clean (`pnpm -r typecheck`)
- [ ] Production build succeeds (`pnpm --filter game build`)
- [ ] Committed + pushed; sprite grid + in-game smoke-check pass
