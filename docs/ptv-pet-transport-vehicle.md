# PTV — Pet Transport Vehicle

*v0.2 — Claude-authored design. See also [driving-systems.md](driving-systems.md) for how PTV fits alongside Supply Runs and the Depot.*

> **⚠ Provenance note.** Marcus's original `ARC_PTV_spec.md` was referenced in the [Depot & Supply Run spec](original-depot-supply-spec.md) but **never written as a standalone document**. A deep search of every Claude Code session (project + home directory, ~420 MB total) returned zero hits — confirmed 2026-04-24. Marcus's own words: "no specs were written locally ever, everything was discussed in this chat." The vehicle names (Trikey / Henry / Bea / Big Tilly / Spark), crate types, and adjacency matrix below are Claude's own design from the overnight session. Authoritative design notes Marcus has added since are captured in §"User-dictated additions" at the bottom of this doc and should be treated as canonical where they contradict the Claude-authored body.

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

## User-dictated additions

Canonical design notes from Marcus, added in chat. Where these contradict the Claude-authored body above, these take priority.

### Weather matters on PTV drives

Animals can **overheat** in the vehicle. Weather is a tactical concern during cargo drives — unlike Supply Runs where weather is atmospheric only. Implications:

- Hot weather + underventilated crate + long drive → animal arrives with a health hit.
- Rain / cold + wet animal → exacerbates anxious animals, bigger happiness penalty.
- Fog / low visibility → harder to avoid scenery jolts, more cargo-comfort drain.
- The player should be able to **check the weather before picking the vehicle** — Spark's cooling matters on a hot day; Big Tilly's slow pace hurts when there's a heat advisory.

Weather-aware vehicle selection becomes a small strategy beat on top of the crate-stacking puzzle. Cargo-comfort meter should visibly tick down faster under bad weather.

### Economic feedback loop with Supply Runs

This is the core tonal mechanic tying the two systems together — **PTV is the reason Supply Runs exist**:

1. PTV drives require careful, mindful play. Kids have to drive slow, watch the weather, pick the right crate, get adjacencies right.
2. That carefulness is **tiring**. Kids (especially neurodivergent ones) need an escape valve.
3. Supply Runs are that escape valve: pulse-raising motor madness, smash everything, no animals to worry about.
4. But Supply Runs aren't *just* stress relief — they're also how you **pay the vet bill when PTV goes wrong.**
5. A botched PTV drive (wrong weather, bad adjacency, stressed arrival) → animals end up at the vet longer → higher vet bills → player needs more Supply Run income to cover them.
6. The economic loop reinforces the tonal dichotomy: care mode has real consequences; chaos mode pays for the consequences.

This framing matters for UI copy, reward tuning, and art direction. Supply Runs should feel **cathartic**, not penance. The vet-bill pressure is a gentle nudge, never a guilt-trip.

### PTV destinations — the full set

Marcus's note (2026-04-24): the PTV world map needs destinations beyond the three supply-run sites and five rewilding habitats already in [`destinations.ts`](../packages/game-logic/src/destinations.ts). Full category list:

#### 1. Normal vet
- General-practice vet clinic for routine illness, injury recovery, vaccinations.
- Aligns with the "vet trip" flow already in game — this makes it a proper map destination instead of an abstract menu action.
- Suggested naming: **Greystone Veterinary** or **Haven Vets** (both names appeared in the original Depot spec).
- Driving stress matters: if the animal arrives stressed the stay is longer (more expensive) — direct feed into the Supply-Run economic loop.

#### 2. Specialist prosthetics vet
- Higher-tier vet for disabled animals: prosthetic legs, wheeled carts, hearing aids, custom mobility gear.
- Level-gated (mid-to-late unlock).
- Turns disability into a visible storyline — animals returning with new prosthetics/wheels are a *proud* outcome, not a sad one.
- Generates its own cast of "happy regulars" — a three-legged cat who runs faster on a cart, a parrot with a prosthetic beak etc.

#### 3. Skill-training assessment centres
- Multiple sub-venues for different training pathways, visited as a PTV drive. Each is its own destination on the map; some unlock later:
  - **Guide-dog potential testing** — labrador / retriever / poodle temperament assessment. Passing opens a "guide-dog-in-training" storyline, special adopter households (vision-impaired families).
  - **Police / sniffer dog academy** — scent-work assessment, agility. Passing → working-dog career arc.
  - **Parrot intelligence testing** — African Greys especially. Counting, problem-solving, vocabulary challenges. Passing → "therapy parrot" or "university research partner" outcomes.
  - **Pre-rewilding specialist training** — food-foraging, hunting, weather survival, flock / pack dynamics. Gates whether a wild-rescue can safely be released. A failed assessment means longer rehab; re-attempt after more bond + wellness.
- Framing: assessment is a *gentle gate*, not a pass/fail verdict. Failed animals aren't rejected — they just get different storylines (therapy pet, sanctuary resident).

#### 4. Rewilding locations
- Already captured in [`destinations.ts`](../packages/game-logic/src/destinations.ts): Moorland (fox), Woodland (bunny / hedgehog / squirrel), Sea Cliffs (parrot / seabird), Deep Forest (bat), Wetlands (snake). ✓

#### 5. Pet shows
- Competition venues where animals win prizes for **skills** (agility, obedience, tricks, scent-work, dressage-style routines) and **looks** (coat, confirmation, "best rescue story" — rescue-specific category is important).
- Multiple pet-show venues around the map: village fête (easy, starter), county show (mid-tier), national championship (end-game).
- Rewards: coins + unique trophies / rosettes (decorative, display in Centre), prestige points, occasionally adopter-interest spikes (families saw the animal on TV).
- Win conditions feed off bond level, skill-training progress, happiness, and specific trained tricks — so pet shows are a *consequence* of good care, not a separate grind.

### Driving UX — Lily's spec

Marcus's note (2026-04-24), carrying Lily's direct design requests. Applies to both PTV drives and Supply Runs (it's the shared driving interface).

**Road view — fake 3D.** The driving viewport shows the road rushing *towards* the player (classic Pole Position / OutRun pseudo-3D), not top-down. Painted storybook hedgerows, trees, houses sweep past on either side. Distant hills parallax at the horizon line. Road bends are rendered by shifting the centre-line horizontally. Fake-3D is explicitly fine — no real 3D renderer needed; sprite-scaling and painted depth layers are the target.

**Cockpit view.** The drive scene wraps the fake-3D road viewport inside a chunky, painted-storybook cockpit, not a pure arcade HUD. Elements on screen:

- **GPS map** — the navigation surface. Re-uses the painted world map (existing `mockup-map.html`). Player picks the destination on the GPS before / during the drive; route draws as a painted dotted line across the map. During the drive a "you are here" marker creeps along the route. The GPS stays visible in a corner / dashboard panel while driving.
- **Steering wheel** — physically turns when the player steers. Drag / swipe on mobile, arrow keys on desktop. The angle of the wheel is visible feedback that reinforces the physicality. Wooden painted wheel with painted-leather grip dots for the aesthetic.
- **Ignition button** — explicit "start the engine" beat before the drive begins. Tactile: press and hold for a beat, engine note, vibration (on mobile), then the ignition lamp glows. Teaches the kid the ritual of starting a vehicle.
- **Accelerator & brake pedals** — two on-screen pedal icons. Tap-and-hold accelerator to go faster; tap brake to slow. PTV cargo-comfort drains faster under heavy accelerator use; Supply Runs reward it.
- **Horn** — a tappable button that plays a **funny little tune** rather than a real car horn. Kid-facing design reason: *"so it doesn't scare the animals."* Non-scary horn is a first-class design principle here, not a cosmetic choice.

**Horn tune notes:**
- Short (<1.5 s), cheerful, a five-note glockenspiel or ukulele lick. Never harsh. Never blaring.
- Multiple unlockable horn tunes over time (bicycle bell, kazoo, steel drum, little trumpet fanfare). Swap from a Centre menu.
- Using the horn on PTV drives → passing animals on the roadside react cutely (bunny pops up, bird chirps back). Never stresses the cargo.
- Using the horn on Supply Runs → bystanders cheer, small score boost per unique use.

**Layout intent (not final):**
- Top: GPS mini-map.
- Middle: the fake-3D road viewport (road receding to horizon, hedgerows sweeping past).
- Bottom centre: steering wheel.
- Bottom left: accelerator + brake stacked.
- Bottom right: horn button + ignition lamp.
- Tonal swap applies: PTV dashboard is warm wood + painted pastels; Supply Run dashboard flips to neon + metal-chrome for the tonal shift (see music note below).

**Audio hooks** (already in the Manus pack, re-usable here):
- `ui-paw-tap.ogg` — button presses on pedals / ignition.
- `ui-sign-drop.ogg` — GPS destination committed.
- `ui-bell.ogg` — horn default tune (first candidate; regen a proper horn-tune set when ready).
- `music-corridor.ogg` / `music-play.ogg` — PTV ambient (gentle). Supply Run music replaces with the heavy-metal brief below.

### Supply Run music: heavy metal

Marcus's note (2026-04-24): *"supply run music probably needs to be more in the heavy metal genre (Lily loves Metallica!) and that works well for pulse-raising chaos-creating motor madness"*.

Overrides the original verbatim spec's "energetic rock / electronic / funk" line — heavy metal with no vocals (per existing no-vocals rule) is the target. When regenerating the Supply Run music loop with Manus, brief for **Metallica-style driving metal, instrumental, no vocals, 40–60s seamless loop**. Chugging rhythm guitar, double-bass drums, melodic lead lines; kid-friendly energy but NOT watered-down — Lily can handle real metal energy.

---

## References

- [`crate-stacking.ts`](../packages/game-logic/src/crate-stacking.ts) — engine + 32 unit tests in `__tests__/crate-stacking.test.ts`.
- [`destinations.ts`](../packages/game-logic/src/destinations.ts) — rewild habitat lookup.
- [`driving-systems.md`](driving-systems.md) — how PTV / Supply Runs / Depot fit together.
- [`extracted-driving-spec.md`](extracted-driving-spec.md) — original Supply Run + Depot spec reconstruction.
