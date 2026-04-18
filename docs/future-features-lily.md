# A.R.C. — Future Features (Lily's Wishlist)

Captured 2026-04-18 from Marcus. Not prioritised — ideas to brainstorm.
Each section needs design before implementation.

---

## 1. Outhouse corridor — second species-room area

Extend the game world with a second navigable area dedicated to species
that aren't obvious cats/dogs/bunnies/etc:

- **Mammals (less domestic):** hedgehog, squirrel, skunk, raccoon
- **Reptiles (dry):** lizards (separate from snakes)
- **More to come** — leave room for Lily to add

The outhouse entrance would be reached from the main corridor. Each
species gets its own door (same sign/door pattern as the existing
corridor). Rooms behind the outhouse doors follow the same pattern as
existing species rooms.

**Required work:**
- New corridor scene (or extend existing CorridorView per refactor plan)
- Door signs for each new species
- Room backgrounds
- Full sprite set per variant (use `docs/adding-a-new-species.md` runbook)
- Unlock gating by level

## 2. Sheltered pond area — aquatic species

Small pond environment for:
- Goldfish (various)
- Koi?
- Frogs / tadpoles?
- Turtles / terrapins?

Distinct interaction model — no walking/collars. Feed flakes, clean
water, watch them swim. Happiness-driven gameplay without the
"bond → pet" progression (since fish don't become pets in the
conventional sense).

**Design questions:**
- How do fish "arrive"? Net-rescue mini-scene?
- What are the needs? Water cleanliness, food, temperature?
- Do fish have variants + a full state matrix like land animals,
  or a lighter shape?

## 3. World navigation — mini-map

Once the world has corridor + outhouse + pond + garden + depot + etc.,
kids need a quick way to see it all and jump around:

- Small persistent mini-map in the HUD, or tappable button to open
  full map
- Areas grey out when locked; unlock as levels progress
- Current area highlighted
- Visual pins for "something needs your attention here" (sick animal,
  conflict, new arrival)

**Design notes:**
- Keep it skimmable by a 7-year-old — 6–8 locations max at peak
- Animated reveal when a new area unlocks ("New! Tap to visit")

## 4. Animal exit points — where do they go?

Lily will accumulate hundreds of animals over time. She can't bond
with every one. Needs meaningful exit paths so the shelter doesn't
overflow.

### Adoption / rehoming — the core loop
Match unbonded animals to new homes:
- Families (various profiles)
- Individuals (elderly, student, active, etc.)
- Charities — guide dogs, hearing dogs
- Zoos / petting zoos
- Wildlife trusts (for rewilding)
- Rare-breed programmes
- Research programmes (ethical ones — educational content about
  conservation)

**As a mini-game:** each applicant has preferences (species,
temperament, activity level, allergies, home size). Lily matches them
to a suitable animal. Good match → adoption fee + happiness boost.
Bad match → animal comes back (gently, with an educational message).

### Rewilding mini-game
For wild species (fox, hedgehog, squirrel) — rehabilitation then
release. Could be a mini-game of its own: soft release into a habitat,
watch the animal adapt over time.

## 5. Revenue streams — making the shelter viable

Currently: coins from supply runs + depot. Additions:

- **Adoption fees** — a small donation when an animal is rehomed.
  Higher for rare breeds, special needs, guide-dog-suitable, etc.
- **Charity grants** — monthly revenue from partner orgs, gated by
  rescues-of-type completed (e.g. "Rescue 10 wild animals this month
  → wildlife trust donation arrives")
- **Sponsorship** — kids can "name" a sponsored animal (from a preset
  list) for additional revenue
- **Adopt-a-bed** — a named pet bed triggers a small monthly donation
  from the sponsor

## 6. Educational content

Animal welfare is a natural teaching vehicle. Opportunities:

- "Did you know?" popups when a new species arrives
- Species-specific care facts unlocked via the vet scene
- Conservation status (common, endangered, etc.) shown on animal profiles
- Age-appropriate content on ethical rehoming, rewilding, animal
  rights, rare-breed preservation

---

## Priority discussion needed

Before any of these land, we should agree:

1. Which area is the next unlock? (Outhouse seems natural — expands
   the species list; pond is more novel but needs new mechanics.)
2. Mini-map first vs extending corridor first? (Mini-map may need to
   exist before outhouse ships, otherwise the nav will feel cramped.)
3. Exit-points: is the adoption matching mini-game the right first
   step? (It solves the capacity problem and adds revenue, both
   high-value.)

**Suggested rough order:**
1. GameScene refactor (enables rest — see gamescene-refactor-plan.md)
2. Mini-map HUD (groundwork for multi-area navigation)
3. Adoption matching mini-game (solves capacity, adds revenue)
4. Outhouse corridor + one new species (e.g. hedgehog) as a proof
5. Pond area (biggest mechanical departure — build last once the
   pattern for new areas is established)
