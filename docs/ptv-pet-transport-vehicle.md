# PTV — Pet Transport Vehicle

*v0.2 — Claude-authored design. See also [driving-systems.md](driving-systems.md) for how PTV fits alongside Supply Runs and the Depot.*

> **⚠ Provenance note.** Marcus's original `ARC_PTV_spec.md` was referenced in the [Depot & Supply Run spec](original-depot-supply-spec.md) but **never pasted into any Claude Code session**. The vehicle names, crate types, and adjacency matrix below are Claude's own design, written overnight while interpreting the Depot spec's forward-reference. If Marcus has the authoritative PTV spec locally, it overrides this doc.

## What PTV is (and is not)

**PTV is the system for moving animals.** You pick a vehicle, load animals into crates, arrange them in the vehicle grid so they don't wind each other up, and drive. The core puzzle is the **crate-stacking adjacency matrix**: prey-and-predator pairings block departure, stress pairings cost arrival happiness, compatible pairings give small bonuses.

**PTV is NOT Supply Runs.** Supply Runs are cargo-free — a deliberate tonal shift where the player smashes obstacles at speed for coins. Both use the painted-vehicle aesthetic and the coin economy, but they answer different needs:

- **Supply Runs** → stress relief + coins (no animals, no adjacency, no crates).
- **PTV** → careful, tactical, teaches species welfare (animals, crates, adjacency, gentler driving).

The original spec noted Supply Runs were built "standalone" with the expectation that a real PTV engine would follow. This doc is that engine.

---

## When PTV drives happen

| Trigger | Cargo | Destination | Reward framing |
|---|---|---|---|
| **Adoption delivery** | 1 adopted animal | Adopter household | Farewell letter, +bond echo |
| **Rewilding drive** | 1 rewild-eligible animal | Wild habitat (destinations.ts) | Wistful ceremony, +conservation badge |
| **Collection drive** | 1 new arrival from a sister centre | The A.R.C. | Arrival popup as normal |
| **Multi-stop adoption run** (L8+) | 2–3 adopted animals | Multiple households in one trip | Coin bonus for no-stress runs |

PTV drives fire **on top of** existing rescue events — the adoption ceremony still plays, and the PTV loading screen opens afterwards as "shall we drive them home?". The player can postpone ("we'll drive them tomorrow") in which case the drive queues for the next daily reset.

---

## Vehicles

Implemented in [`crate-stacking.ts`](../packages/game-logic/src/crate-stacking.ts) → `VEHICLE_DEFS`.

| Vehicle | Slots | Grid | Fuel/Drive | Unlock | Notes |
|---|---|---|---|---|---|
| **Trikey** (pedal trike) | 2 | 1×2 | 0 | L0 | Cute opener; single-pet drives |
| **Henry** (small van) | 4 | 2×2 | 5 | L2 | Workhorse; first real choice |
| **Bea** (long van) | 6 | 3×2 | 10 | L5 | Multi-stop runs |
| **Big Tilly** (animal lorry) | 9 | 3×3 | 20 | L10 | Rewilding + large adoptions |
| **Spark** (electric mini-bus) | 6 | 3×2 | 5 | L12 | Fast + premium; smoother for anxious animals |

Fuel is paid in coins from the Supply-Run / Depot economy. Spark's smoother-ride property is a design hook — not implemented yet — for future "anxious animal penalty reduction" rules.

---

## Crates

Implemented in [`crate-stacking.ts`](../packages/game-logic/src/crate-stacking.ts) → `CRATE_DEFS` and `CRATE_PREFERENCE`.

| Crate | Icon | Right for | Wrong for |
|---|---|---|---|
| Standard | 📦 | cat, dog, bunny, fox | bat (needs dark), snake (needs warmth) |
| Secure | 🔒 | large dogs, anxious foxes | small timid animals |
| Quiet | 🌙 | bat (required), anxious cat | boisterous dog |
| Ventilated basket | 🧺 | bunny, small cat | snake (escape risk) |
| Warm vivarium | 🟨 | snake (required) | everything else |
| Perch carrier | 🪺 | parrot (required) | everything else |

**Right crate**: +3 arrival happiness.
**Wrong crate**: −10 arrival happiness.

The three "required" crates (quiet / warm vivarium / perch carrier) are the main species-welfare teaching beats.

---

## Adjacency — the core puzzle

Animals in orthogonally-adjacent slots (N/S/E/W, no diagonals) react to each other. Full matrix in `crate-stacking.ts` → `MATRIX`.

### Compatibility classes

- ✅ **happy** — same species OR both-calm pairing (bat ↔ snake). +1 per same-species neighbour.
- ⚠ **stressed** — tolerated with a small arrival-happiness penalty (−5 each side).
- 🚫 **blocked** — prey/predator or total incompatibility. The **Drive button is disabled** until the player resolves all blockers.

| | cat | dog | bunny | fox | bat | parrot | snake |
|---|---|---|---|---|---|---|---|
| **cat** | ✅ | ⚠ | 🚫 | ⚠ | ⚠ | 🚫 | 🚫 |
| **dog** | ⚠ | ✅ | 🚫 | ⚠ | 🚫 | ⚠ | 🚫 |
| **bunny** | 🚫 | 🚫 | ✅ | 🚫 | ⚠ | ⚠ | 🚫 |
| **fox** | ⚠ | ⚠ | 🚫 | ✅ | ⚠ | 🚫 | 🚫 |
| **bat** | ⚠ | 🚫 | ⚠ | ⚠ | ✅ | ⚠ | ✅ |
| **parrot** | 🚫 | ⚠ | ⚠ | 🚫 | ⚠ | ✅ | 🚫 |
| **snake** | 🚫 | 🚫 | 🚫 | 🚫 | ✅ | 🚫 | ✅ |

### Bonuses (stacked on top of the base matrix)

- Same-species adjacent → **+1 happiness** each (already in the engine).
- Sibling pair adjacent → **+1 bond** each (TODO: not yet wired — needs sibling lookup in `calculateArrivalHappinessDelta`).
- Dog adjacent to a recovering animal (sick/scared) → **+1 happiness** to the recovering one, emotional-support effect (TODO: needs animal-state lookup).

### Temperament overrides (future)

An individual animal's state can shift the matrix one notch:
- Anxious dog → treat as stressed with cat / bunny / bat even if matrix says happy.
- Confident calm cat → sit next to bunny as stressed instead of blocked.

Not yet implemented. When it lands it should be a per-animal adjustment passed into `previewPlacement` / `calculateArrivalHappinessDelta`, not a matrix mutation.

---

## Loading flow (UI)

1. **Vehicle pick** — row of painted vehicle sprites. Tap one. Shows slot count + unlock + fuel cost.
2. **Crate-loading screen** — two halves:
   - Left: the vehicle's interior grid (wooden slats).
   - Right: carousel of to-be-transported animals as draggable crate tiles.
3. **Per-animal crate picker** (modal) — pick the crate type before placing. Default to right-crate.
4. **Drag to grid** — drop onto an empty slot. `previewPlacement()` evaluates live.
5. **Live warnings** — between incompatible neighbours, a small ⚠ / 🚫 icon appears. Tap for details: "Luna is scared of Max".
6. **Drive button gate** — `isDriveable(grid)` must return true. ⚠ warnings are allowed (they cost arrival happiness); 🚫 is not.
7. **Drive scene** — a painted-sprite-plus-road drive cut-scene. Short, gentle. Not the Supply-Run neon chaos.

---

## Arrival calculation

On reaching the destination, for each loaded animal:

```text
delta = 0
if crate is suitable for species:   delta += 3
else:                               delta -= 10

for each orthogonal neighbour:
  case blocked   → delta -= 15   (should be impossible if drive gate worked)
  case stressed  → delta -= 5
  case happy + same species → delta += 1

animal.happiness += delta
```

(Implementation: `calculateArrivalHappinessDelta`.)

- **Rewilding drive**: if the rewilded animal arrived stressed, the ceremony line is wistful ("they hesitated at the treeline") instead of jubilant.
- **Adoption drive**: if adoptee arrived stressed, the happy-letter-home lands 7 in-game days later instead of 3.
- **Collection drive**: arrivals that travelled stressed get an immediate need spike (hunger/rest) on first intake.

---

## Driving phase

PTV drives are intentionally **much gentler** than Supply Runs:

- 3-lane top-down road, same as Supply Runs, but
- Slower top speed (cargo load halves it).
- **No smashing** — no obstacle-smash bonus, no neon HUD.
- Obstacles exist but are easy-to-avoid scenery (logs, puddles); hitting one jolts the cargo and inflicts −2 happiness per onboard animal.
- No time trial, no damage-% meter; instead a **cargo-comfort meter** that drains with jolts and restores slightly between events.
- Rewards are conversational — the adopter's "welcome!" voice line, a bonding letter home — not coin multipliers.

The goal: drive feels like a *transition*, not a mini-game. If the player wants chaos + coins they take a Supply Run instead.

---

## Integration with the rest of the game

- **Coins**: fuel is paid from `Economy.coins`. Successful drives return nothing (the reward is narrative); failed / aborted drives refund half the fuel.
- **Depot**: damage from PTV jolts accumulates on the same vehicle-damage state the Supply Run uses; Depot parts repair both.
- **Calendar**: adoption / rewilding drives fire on real events, not on a schedule, so the seasonal calendar doesn't gate them. Multi-stop runs (L8+) have a daily cap of 1 to keep them rare.
- **Badges**: proposed — `first_drive`, `smooth_operator` (5 drives with no stressed animals), `wild_and_free` (10 rewilding drives).

---

## Phase-1 build scope (MVP)

Small enough to ship:

- **One vehicle** — Henry (2×2), hardcoded.
- **One drive type** — adoption delivery, fired from the existing adoption ceremony.
- **Crate-stacking engine** — already built in `crate-stacking.ts`, 32 tests passing.
- **Standard crate only** — no crate picker in v1; species-specific crates come in v2.
- **Loading UI** — drag-and-drop grid overlay, ⚠ / 🚫 between adjacent tiles, Drive button gated by `isDriveable`.
- **Drive cut-scene** — minimal: road pan for ~5 s with vehicle sprite, plus the adopter's welcome voice clip from the Manus sound pack.
- **Arrival delta** — applied on arrival, happiness shown in the adoption-farewell screen.

Layered in after v1:
- Multi-vehicle choice + crate picker.
- Sibling / recovering-animal bonuses (require animal-state lookup).
- Temperament overrides per individual.
- Multi-stop adoption runs.
- Rewilding drives on top of the existing rewild flow.

---

## Open questions

1. **Dynamic vs static temperament**: should the matrix be per-species (simple, current state) or per-animal (richer, more code)? Leaning per-species for v1; per-animal modifier as a stretch.
2. **Failed PTV drive**: if the cargo-comfort meter empties, does the adoption fall through? Current thinking: no — the animal arrives but "arrived upset", letter-home delayed to 7 days.
3. **Multi-stop topology**: 3 separate adjacency puzzles on 3 legs, or one shared grid with stops picking animals off one by one? Leaning one shared grid; adjacency is evaluated continuously.
4. **Drive button copy**: "Drive!" vs "Off we go!" — Lily-facing copy pending Marcus's ear.
5. **Voice-clip hooks**: which of the Manus voice clips (`voice-forever-home`, `voice-running-free`, `voice-new-arrival`) plays when, per drive type.

---

## References

- [`crate-stacking.ts`](../packages/game-logic/src/crate-stacking.ts) — engine + 32 unit tests in `__tests__/crate-stacking.test.ts`.
- [`destinations.ts`](../packages/game-logic/src/destinations.ts) — rewild habitat lookup.
- [`driving-systems.md`](driving-systems.md) — how PTV / Supply Runs / Depot fit together.
- [`extracted-driving-spec.md`](extracted-driving-spec.md) — original Supply Run + Depot spec reconstruction.
