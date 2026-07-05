# Plan — New content for Lily (content-density pass)

> Scoping doc, 2026-07-04. Work stream: **New content for Lily** — the
> additions the actual player feels most directly. Grounded in the
> current code, not the stale status docs. Nothing here is implemented
> yet; this is the plan + catalogue.

---

## 0. TL;DR

- The single highest-value / lowest-friction addition is **add the
  hedgehog as a real, adoptable species, unlocking at L6** — the one
  level that is genuinely empty of new content, and the one species
  Lily has *already met* in the tunnel mini-game and the woodland
  rewilding habitat but can't yet rescue.
- Two big wishlist items are **already built** and should be struck
  from the "to build" list: the **adoption-matching mini-game**
  (`AdoptionMatchScene.ts` + `getEligibleApplicants`) and the
  **educational "did you know?" content** (`species-facts.ts`, shown on
  arrival). The stale progression doc still lists these as future work.
- Several stale claims in `level-progression-overview-2026-05-03.md`
  are corrected below (capacity curve, Sea Cliffs level, tunnel
  animals that don't exist as species).

---

## 1. Verified level progression (L1–L10+)

Read from the live code today, file by file. Sources:
`progression.ts`, `destinations.ts`, `supply-runs.ts`, `time.ts`,
`apprentices.ts`, `GameScene.ts` (tunnel tier picker).

| Level | Rescues to next | Genuinely NEW this level (verified) |
|---|---|---|
| **L1** | 5 | cat, dog; capacity 2; 1 arrival; Bramble Farm; tunnel tier 1 (fox); 12 tasks/phase |
| **L2** | 10 | **★ fox, bunny**; **★ apprentices unlock** (`APPRENTICE_MIN_LEVEL = 2`); capacity 4 |
| **L3** | 15 | **★ bat, parrot**; **★ Moorland + Woodland** rewilding; capacity 6; **★ 10 tasks/phase**; arrivals → 2 |
| **L4** | 20 | **★ snake**; **★ tunnel tier 2**; capacity 8 |
| **L5** | 25 | **★ Cove Harbour** (fish supply + fish market depot); capacity 10 |
| **L6** | 30 | **★ Sea Cliffs** rewilding *(pulled L7→L6 in code — see below)*; **★ tunnel tier 3**; capacity 12; **★ 8 tasks/phase**; arrivals → 3 |
| **L7** | 35 | capacity 14 — **nothing else new** |
| **L8** | 40 | **★ Deep Forest** rewilding; **★ tunnel tier 4**; capacity 15 |
| **L9** | 45 | **★ Wetlands** rewilding; capacity 17; **★ 6 tasks/phase** |
| **L10+** | 5×N | **★ Pinebark Medical** (vet supply + depot); **★ Wildlife Trust grant** qualifier; **★ tunnel tier 5**; capacity 18, then +2/level to a 30 cap |

### Corrections to the 2026-05-03 status doc (it is stale)

1. **Capacity is NOT capped at 12.** The doc's master table says "12
   (cap)" from L6. The live `getMaxShelterAnimals` runs L6=12, L7=14,
   L8=15, L9=17, L10=18, then +2/level to a **hard ceiling of 30**.
2. **Sea Cliffs unlocks at L6, not L7.** `destinations.ts` has an
   explicit comment: *"Pulled L7 → L6 (Marcus pacing review
   2026-05-03) — fills the previously empty L6."* So the doc's own
   "L6 is empty" warning is already partly addressed.
3. **The tunnel's four animals are not all real species.** Tunnel tiers
   feature fox, **hedgehog, raccoon, skunk** (`tunnel.ts` `type Animal
   = 'fox' | 'skunk' | 'hedgehog' | 'raccoon'`). Only **fox** exists as
   a rescuable species. Hedgehog/raccoon/skunk are puzzle labels with
   no `bg-room-*`, no `sign-*`, no `animals.ts` entry, no `Species`
   union membership. Same for **woodland** rewilding habitat, whose
   `suitableSpecies` lists `bunny, hedgehog, squirrel` — two of which
   don't exist.

### Where the genuine gaps are (verified)

- **L7 is the only truly empty level.** Its sole change is capacity
  14 → nothing a child notices. This is the real dead beat.
- **L4 and L5** each land exactly one thing (snake+tunnel-tier-2; Cove
  Harbour). Thin but not empty.
- **L6** the doc flags as empty is actually the *busiest* mid-game
  level once you read the live code (Sea Cliffs + tier 3 + cap + tasks
  drop + arrivals bump).

So the doc's "L4/L6/L7-9 are quiet" claim is **partly wrong**: L6 is
fine, L7 is the standout gap, and L4/L5 are thin-but-alive.

---

## 2. What's already built (strike from wishlist)

Grepped to avoid proposing existing work. `future-features-lily.md`
items #4 (adoption/exits) and #6 (educational) are **substantially
done**:

- **Adoption-matching mini-game** — `AdoptionMatchScene.ts` (580 lines),
  backed by `getEligibleApplicants` / `Applicant` in game-logic, wired
  into `GameScene.openAdoptionMatchOverlay(animal)` (called at
  GameScene.ts:1047). Households, per-card match scoring, painted
  storybook UI. **This is item #4's core loop, live.** The status doc's
  suggestion to "add it as an L8-9 unlock" is moot — it ships
  event-driven, not level-gated.
- **Educational content** — `species-facts.ts`: 40+ kid-friendly "did
  you know?" facts, ≤90 chars, surfaced in the arrival popup per
  species and (for some) per variant. **This is item #6's headline
  feature, live.**

Still genuinely unbuilt: **outhouse corridor** (no `outhouse` anywhere),
**pond / aquatic area** (only false-positive matches — a `garden_pond`
vet decoration and a walk-zone description; no aquatic gameplay),
**mini-map HUD** (no `minimap`/`worldMap` in the app).

---

## 3. Ranked shortlist (value-to-Lily ÷ build-effort)

| Rank | Addition | Value to Lily | Effort | Why the ratio |
|---|---|---|---|---|
| **1** | **Hedgehog as a real species, unlocks L6** *(see §4)* | High — a brand-new animal to rescue, and one she's already met in the tunnel; also retro-fills the woodland habitat's broken `suitableSpecies` | Medium (species runbook; sprite commission is the only long pole) | Existing runbook + existing dynamic corridor + existing rewilding slot = mostly a fill-in, not new machinery |
| **2** | **Fill L7 with an existing mechanic** (no new art): move the adoption-matching *unlock ceremony* or a second adopter-household cluster / a new vehicle to L7 | Medium — closes the one dead level | **Very low** — pure config/level-gate, systems already exist | Cheapest possible density win; no assets |
| **3** | **Make raccoon or skunk real** (the other tunnel animals) | High per animal | Medium each — same shape as hedgehog | Same continuity argument as hedgehog; do after hedgehog proves the pattern |
| **4** | **Mini-map HUD** (`future-features` #3) | Medium now, high once ≥3 areas exist | Medium-high — new persistent UI, lock/unlock states, attention pins | Groundwork item; only pays off once outhouse/pond land. Not felt yet with today's single navigable area |
| **5** | **Outhouse corridor + 1 new species** (#1) | High — a whole new area | High — new scene/area work *plus* a full species | Bundles area-building cost with species cost; do after the mini-map exists so nav isn't cramped (the doc's own caveat) |
| **6** | **Pond / aquatic area** (#2) | High novelty | **Highest** — new interaction model (no collars/walks), new needs, new sprites, new scene | Biggest mechanical departure; explicitly "build last" in Lily's own suggested order |

**Recommendation: do #2 and #1 together** as a single small content
pass — #2 is nearly free and fixes the L7 dead beat; #1 is the flagship
"new animal" moment and rides on machinery that already exists.

---

## 4. TOP recommendation — build plan: hedgehog species, unlock L6

**Why hedgehog specifically:**
- It is already a first-class citizen of the game world — a tunnel
  trunk (`tunnel.ts` tier 2 is *the hedgehog puzzle*) and a
  `suitableSpecies` of the **woodland** rewilding habitat. Adding it as
  a rescuable species closes a continuity gap the child can already
  sense.
- Small, gentle, UK-native — squarely on-brand for a Birchington
  rescue centre and age-appropriate.
- The corridor renders doors dynamically from
  `getSpeciesUnlocksForLevel` (GameScene.ts:381), so a new species door
  appears automatically the moment it unlocks — no bespoke corridor
  work.

**Unlock level:** L6. Rationale: L6 currently has plenty; L7 is the
dead level — so pair this with §5 item and put the *hedgehog unlock at
L6* only if we'd rather not overload L7. **Alternative worth a
decision (see §5): unlock hedgehog at L7 instead, to fill the one empty
level with the flagship new-animal beat.** Recommended: **L7** — it
turns the dead level into the best one.

### Files to touch (per `adding-a-new-species.md`)

Type + logic (all hard TypeScript breaks — the compiler will list them):
- `packages/shared-types/src/index.ts` — add `'hedgehog'` to `Species`.
- `packages/game-logic/src/animals.ts` — `SPECIES_VARIANTS.hedgehog`
  (e.g. `['brown', 'albino', 'pinto', 'salt-and-pepper', 'algerian']`),
  `SPECIES_COLOURS.hedgehog`, `ARRIVAL_STORIES.hedgehog` (4–5 blurbs),
  `ANIMAL_NAMES.hedgehog` (~20 presets).
- `packages/game-logic/src/progression.ts` —
  `getSpeciesUnlocksForLevel`: `if (level >= 7) unlocks.push('hedgehog')`
  (or L6). Update `progression.test.ts`.
- `packages/game-logic/src/walks.ts` — add `'hedgehog'` to
  `WALKABLE_SPECIES`? **Design call**: hedgehogs don't lead-walk;
  likely leave OFF (they snuffle in the garden, not on a collar).
  Update `walks.test.ts` accordingly.
- **Six `Record<Species>` maps hard-break at typecheck** and must each
  get a hedgehog key: `animals.ts`, `garden.ts`, `crate-stacking.ts`,
  `wardrobe.ts`, `toys.ts`, `weather.ts`. (This is the true, bounded
  cost of "add an animal" — the compiler enumerates it for you.)
- Content switches to fill so it doesn't feel unfinished:
  `vet.ts` (hedgehog ailments — e.g. balled-up-stress, tick, "wobbly
  hedgehog"), `food.ts` (mealworms/cat-food, NOT bread/milk — teachable),
  `conflicts.ts` (hedgehog-vs-? rules), `rooms.ts` (room metadata),
  `species-facts.ts` (2–3 "did you know?" facts — the educational hook).
- `destinations.ts` — woodland already lists hedgehog in
  `suitableSpecies` and `SPECIES_HABITATS.hedgehog = 'woodland'` is
  **already present**; nothing to add there. Rewilding just starts
  working once hedgehog is real.

Assets (the only long pole — see §6 risks):
- `apps/game/public/assets/animals/hedgehog-*.png` — 9 species-level
  fallback states first (`arriving, sheltered, eating, sleeping,
  walking, growling, grumpy, scared, sick`), then per-variant (5
  variants × 9 = 45) as they land. 128×128, transparent.
- `apps/game/public/assets/signs/sign-hedgehog.png` — corridor door sign.
- `apps/game/public/assets/bg/bg-room-hedgehog.png` — room background
  (falls back to `bg-room-generic` until it lands, so not blocking).
- `apps/game/public/data/collar-anchors.json` — a default anchor (leg
  anklet model if not collar-walkable; or skip collar entirely if
  hedgehog isn't a walk species).
- `apps/game/public/data/corridor-decor.json` — sign placement (via
  admin anchors page).

Admin pages: add hedgehog to `sprite-grid.html`, `collar-anchors.html`,
`anchors.html` `SPECIES_VARIANTS` constants.

Tests: extend `animals.test.ts`, `progression.test.ts`, `walks.test.ts`,
`vet.test.ts`, `food.test.ts`.

Ship: `pnpm -r typecheck && pnpm -r test && pnpm --filter game build`,
then commit + push (Vercel auto-deploys `main`).

### Effort estimate

- **Logic + content + tests:** ~half a day of focused work. The
  TypeScript compiler drives the checklist; the six `Record<Species>`
  maps plus vet/food/conflicts/rooms/facts are mechanical.
- **Sprites:** the schedule-driver. 9 fallbacks unblock playability;
  full 45-sprite variant set lands incrementally via Manus/OpenAI over
  a few batches. Game is playable (generic fallbacks) throughout.
- **Fallbacks mean it can ship half-arted:** unlock the species with
  placeholder colour + generic room the same day; art catches up.

---

## 5. What needs Marcus's / Lily's input

Batched decisions, recommended option first:

1. **Which unlock level for hedgehog — L7 (recommended, fills the one
   dead level) or L6?**
2. **Is hedgehog the right first new species, or does Lily want
   raccoon / skunk / squirrel first?** (Hedgehog recommended: tier-2
   tunnel already stars it, and it's the gentlest.) — *ask Lily.*
3. **Does hedgehog walk on a lead?** Recommended **no** — garden-snuffle
   only, which is more true-to-life and skips collar-anchor work.
4. **The near-free L7 filler (§3 rank 2):** if hedgehog goes to L6
   instead of L7, what fills L7? Options: a second adopter-household
   cluster, a new PTV vehicle, or an adoption "graduation ceremony"
   cinematic. Recommended: just put hedgehog at L7 and skip this.
5. **Confirm the two "already built" items are considered done** for
   this pass (adoption-matching, species-facts) so we don't
   re-scope them.

---

## 6. Risks

- **Sprite continuity — the OpenAI-only rule.** Per Marcus's memory,
  any continuity-critical sprite work goes through OpenAI
  (`tools/gpt-image-regen.sh`), *never Manus*. The runbook still says
  "generate with Manus" — that guidance is superseded for
  continuity-critical work. **Follow the OpenAI path for the hedgehog
  sprite set** so line weight, palette, and shadow treatment match the
  existing seven species. This is the single biggest risk to a
  cohesive result.
- **Asset-commission dependency = the schedule long pole.** 9 + 45
  sprites, a sign, and a room background. Mitigation: fallbacks exist
  at every layer (colour rectangle, `bg-room-generic`), so logic can
  ship first and art streams in. Don't gate the code on the art.
- **Incomplete switch = crash risk.** Skipping `vet.ts` illness entries
  can crash on a hedgehog vet visit (runbook warns of this). The six
  `Record<Species>` maps won't compile if missed — that's a safety net,
  but the *content* switches (vet/food/conflicts) are not all exhaustive
  and need manual attention.
- **Tunnel/rewilding phantom-species debt.** Making hedgehog real fixes
  woodland's `suitableSpecies` for hedgehog but leaves **squirrel**
  still phantom in the same list, and **raccoon/skunk** still phantom in
  the tunnel. Not a blocker, but flag it: the world advertises animals
  that don't exist yet. Worth a follow-up to either make them real
  (§3 rank 3) or soften the copy.
- **Doc drift.** `level-progression-overview-2026-05-03.md` is stale
  (capacity cap, Sea Cliffs level). Recommend refreshing it in the same
  pass so it stops misleading future planning — but that's a docs task,
  out of scope for "content Lily feels."

---

## Source files consulted (all verified live, 2026-07-04)

- `packages/game-logic/src/progression.ts` — levels, species unlocks, capacity, arrivals
- `packages/game-logic/src/destinations.ts` — rewilding + supply destinations, `SPECIES_HABITATS`
- `packages/game-logic/src/supply-runs.ts` — depot unlock levels
- `packages/game-logic/src/time.ts` — `baseTasksPerPhase`
- `packages/game-logic/src/apprentices.ts` — `APPRENTICE_MIN_LEVEL = 2`
- `packages/game-logic/src/animals.ts` — `SPECIES_VARIANTS`, `SPECIES_COLOURS`
- `packages/game-logic/src/walks.ts` — `WALKABLE_SPECIES`
- `packages/game-logic/src/tunnel.ts` — tunnel `Animal` type (fox/skunk/hedgehog/raccoon)
- `packages/game-logic/src/species-facts.ts` — educational facts (already built)
- `apps/game/src/scenes/AdoptionMatchScene.ts` — adoption mini-game (already built)
- `apps/game/src/scenes/GameScene.ts` — dynamic corridor, tunnel tier picker, adoption overlay
- `apps/game/public/assets/{bg,signs}/` — confirmed 7-species asset coverage only
- `docs/adding-a-new-species.md` — runbook driving §4
