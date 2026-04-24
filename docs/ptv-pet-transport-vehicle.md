# Driving game: vehicle choice + crate stacking

*v0.1 draft — sketching the mechanic for review.*

## Purpose

A deliberate tonal shift inside the game: the rescue centre is slow and caring, the driving game is quick, tactical, teaches adjacency and spatial planning. The existing SupplyRunScene covers **cargo-free** drives (smash obstacles, earn coins). This doc extends the driving mechanic to **cargo drives** — animals in crates, where WHAT you load and WHERE you put them matters.

When a cargo drive happens:

- **Rewilding drive** — one rewild-eligible animal → their wild habitat
- **Adoption delivery drive** — adopted animal → new home (visit the adopter together)
- **Collection drive** — pick up a new arrival from another centre
- **Multi-stop adoption run** — 2-3 adoption deliveries in one trip (unlocks later)

All cargo drives use the same crate-stacking mechanic: you pick a vehicle, you load animals into crates, you arrange them in the vehicle, then you drive.

---

## Vehicles (pick one per drive)

Unlocked by player level / coins earned.

| Vehicle | Slots | Grid | Speed | Fuel/Drive | Unlock | Vibes |
|---|---|---|---|---|---|---|
| **Pedal trike** | 2 | 1×2 | Slow | free | 0 | cute opener, single-pet adoptions |
| **Small van** ("Henry") | 4 | 2×2 | Medium | 5 coins | 2 | family-sized, the workhorse |
| **Long van** ("Bea") | 6 | 3×2 | Medium | 10 coins | 5 | multi-stop, first big drive |
| **Animal lorry** ("Big Tilly") | 9 | 3×3 | Slow | 20 coins | 10 | rewilding runs, lots of precious cargo |
| **Electric mini-bus** ("Spark") | 6 | 3×2 | Fast | 5 coins | 12 | fast + premium; for anxious animals (smoother ride) |

Each vehicle has a signature **painted sprite** (storybook-warm, same aesthetic as the animals). The *inside view* is the crate-loading grid; the *outside view* appears on the road during the drive phase.

---

## Crates (pick one per animal)

Different crate types match different species/temperaments. A wrong crate = animal arrives stressed (small happiness penalty). A right crate = animal arrives content.

| Crate | Icon | Best for | Worst for |
|---|---|---|---|
| **Standard** | 📦 | cat, dog, bunny, fox | bat (needs dark), snake (needs warmth) |
| **Secure** | 🔒 | large dogs, anxious predators | small timid animals |
| **Quiet** | 🌙 | bat, anxious cat, recovering animal | boisterous dog |
| **Ventilated basket** | 🧺 | small bunny, small cat, parrot | snake (escape risk) |
| **Warm vivarium** | 🟨 | snake, lizard | everything else |
| **Perch carrier** | 🪺 | parrot | everything else |

Per-species best fit:

```
cat:    standard | quiet (if cleanliness<50) | ventilated-basket
dog:    standard | secure (if large breed)
bunny:  ventilated-basket | standard
fox:    secure | standard
bat:    quiet (required)
parrot: perch-carrier (required)
snake:  warm-vivarium (required)
```

---

## Adjacency compatibility — the core puzzle

Animals in adjacent slots (N/S/E/W) react to each other. Diagonal doesn't count.

### Compatibility matrix (symmetric)

|  | cat | dog | bunny | fox | bat | parrot | snake |
|---|---|---|---|---|---|---|---|
| **cat** | ✅ | ⚠ | 🚫 | ⚠ | ⚠ | 🚫 | 🚫 |
| **dog** | ⚠ | ✅ | 🚫 | ⚠ | 🚫 | ⚠ | 🚫 |
| **bunny** | 🚫 | 🚫 | ✅ | 🚫 | ⚠ | ⚠ | 🚫 |
| **fox** | ⚠ | ⚠ | 🚫 | ✅ | ⚠ | 🚫 | 🚫 |
| **bat** | ⚠ | 🚫 | ⚠ | ⚠ | ✅ | ⚠ | ✅ |
| **parrot** | 🚫 | ⚠ | ⚠ | 🚫 | ⚠ | ✅ | 🚫 |
| **snake** | 🚫 | 🚫 | 🚫 | 🚫 | ✅ | 🚫 | ✅ |

- ✅ **happy** — same species, or both calm (bat ↔ snake both quiet)
- ⚠ **stressed** — tolerated but small happiness penalty
- 🚫 **blocked** — game will warn and ask you to rearrange (prey-predator, total incompatibility)

### Bonuses

- **Sibling pair adjacent** → +1 bond to each when they arrive
- **Same-species pair adjacent** → +1 happiness to each
- **Dog next to a recovering animal** (sick/scared) → +1 happiness to the recovering one (dog as emotional support)

### Temperament overrides

Individual animal's state can shift the matrix:
- An anxious dog is treated as incompatible with cat/bunny/bat (shift one column right)
- A confident calm cat can sit next to a bunny without a warning (shift back to ⚠)

Teaching moment: the player LEARNS which combos are OK by trying them — warnings are informative, not punishing. First wrong placement is a "Try again!" banner; subsequent wrong placements just silently penalise.

---

## Loading flow UI

1. **Vehicle-pick screen** — a row of painted vehicle sprites. Tap one to select. Show slot count + unlock status.
2. **Loading screen** — two halves:
   - Left: the selected vehicle's interior as a grid of slots (wood-coloured slats), each slot empty or holding a crate
   - Right: a carousel of animals to be transported, each draggable as a crate icon
3. **Crate picker** (optional modal per animal) — pick the crate type before placing
4. **Drag to grid** — drag an animal-in-crate onto an empty slot
5. **Live warnings** — when placed next to an incompatible neighbour, a small 🚫 or ⚠ icon appears between the two crates (like the conflict UI). Tap the icon to see what's wrong: "Luna is scared of Max"
6. **"Drive!" button** — active only when all required animals are loaded AND no 🚫 blockers remain; ⚠ warnings are allowed (they cost happiness on arrival but don't prevent the drive)
7. After drive → existing SupplyRunScene with the vehicle's speed/fuel profile + cargo effects (more cargo = harder to manoeuvre = slower top speed)

---

## Arrival calculation

On reaching the destination:

```
for each animal:
  base happinessOnArrival = animal.happiness
  - 5 per ⚠ adjacency (stressed)
  - 15 per 🚫 adjacency (blocked — shouldn't happen if Drive button gate works)
  - 10 if wrong crate type
  + 3 if right crate type
  + 1 per same-species neighbour
  + 1 per sibling neighbour
```

On rewilding drive, stressed animals return to the wild "reluctantly" — a wistful line, small fade-out in ceremony.

On adoption drive, stressed animals still arrive safely but the happy-letter-home arrives later (7 days instead of 3).

---

## Learning outcomes

- **Prey-predator awareness** — "a fox can't sit next to a bunny"
- **Species welfare** — "bats need the quiet crate"
- **Spatial planning** — fitting 4 animals into a 2x2 grid with constraints
- **Consequences** — wrong choices don't block play but cost the animals comfort

---

## Phase-1 build scope

For the first real implementation, build a minimum-viable version:

- **One vehicle** — small van (Henry, 2x2 grid)
- **One cargo drive** — adoption delivery to the newly-chosen adopter family
- **Adjacency matrix** in game-logic with tests
- **Crate picker skipped** — all animals ride in standard crates for v1 (species-specific crates come in v2)
- **Visual warnings** between slots — the 🚫 / ⚠ icons
- **Drive gate** — button disabled while any 🚫 remains
- **Drive scene** — reuse SupplyRunScene with a "cargo" flag that halves top speed and shows the van sprite

Once v1 plays well, layer in:
- Multi-vehicle choice
- Crate picker
- Sibling / bonding bonuses
- Speed penalties with cargo load
- Multi-stop adoption runs

---

## Open questions for review

1. **Triggering**: cargo drives fire ON TOP of the current gameplay (adoption ceremony pops up THEN cargo drive screen) or REPLACE a step (adoption ceremony → drive → the adoption-farewell letter)?
2. **Player choice or auto-assigned?** When a player adopts Luna to the Kumar-Ishii family, do we force a cargo drive, or can the player skip ("We'll drive her over tomorrow")?
3. **Failed drives**: if the player loses the supply-run (too much damage), does the adoption fall through? Or does the animal just arrive stressed but intact?
4. **Anxious/calm overrides**: should the matrix be *dynamic* per-animal (bond, recent care) or *static* per species (simpler)?
5. **Multi-stop design**: does a 3-stop adoption run mean 3 separate adjacency puzzles on 3 legs, or one shared vehicle with all 3 pets and their families visiting in order?
