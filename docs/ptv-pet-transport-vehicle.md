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

### Visual references + art direction

Moving from mechanic-spec into visual-spec. Marcus's note (2026-04-24): *"visualising helps to make it real and then we can see the gaps."* This section carries specific art references for iconic world-objects — use these directly when briefing Manus / GPT-Image.

#### West-entrance car-wash — Wavy-arm guy

- **Placement**: left side of the road on the **west entrance to Birchie** (the main road approach from the Herne Bay direction).
- **Exact reference**: the **blue-dungarees + red-shirt + blue cap** inflatable from the three-tube-man reference set (AliExpress listing Marcus shared). **Right arm is the one that flaps**, waving drivers in. Left arm stays low.
- **Visual**: a classic fan-powered inflatable tube-man. Big painted smile. Eyes full of cheer. Red "CAR WASH" letters running down the tube vertically. Anchored on a black fan base.
- **Motion**: the right arm flaps rhythmically — big flap, flop, big flap, flop — while the whole tube body whips side-to-side in a drunken, rhythmic sway. Head sways with the body. Left arm stays low on Birchie's unit even though the demo video shows it moving on other units. Deliberately janky — no smooth curves, no easing; the over-inflated floppy jerk is the whole charm. **Video reference** saved locally at `apps/game/public/admin/mockup-assets/reference/birchie-west-entrance/wavy-arm-motion-demo.mp4`, plus 8 extracted stills in `motion-frames/` for quick browsing. Use the video for animation timing + real-light colour pulls, not the static photo alone.
- **Use in game**:
  - **Supply Runs**: drive past him to trigger a mild steering jitter + visual laugh beat.
  - **PTV drives**: pull in for a wash (cosmetic cleaner-van sprite + small on-board happiness bump). Cost a coin.
- **Reference photo**: saved to `apps/game/public/admin/mockup-assets/reference/birchie-west-entrance/` (see §"Reference image library" below).

#### Petrol station — east of the car wash, right side

- **Placement**: right side of the road, **shortly after the car wash** when entering Birchie from the west. The two landmarks pair as a "you're arriving in Birchie" beat.
- **Function in game**: integral to the driving dynamics.
  - **Refuelling**: each vehicle burns fuel per drive (already in `VEHICLE_DEFS.fuelCost`). The petrol station is where that fuel is physically paid for — not an abstract menu cost. Pulling up to the pump plays a small mini-beat: pick a pump, tap-and-hold to fill, release when the gauge is full, pay the attendant.
  - **Pay-at-pump vs pay-inside shop**: pay at pump is quick; going into the shop lets you pick up snacks (small consumables — an energy treat for the driver, a tin of travel biscuits for the onboard pet).
  - **Running out of fuel**: if you skipped a fuel-up and the tank empties mid-drive, the vehicle coasts to a stop. Trigger a **breakdown rescue** mini-event (a local mechanic tows you in for a coin penalty — the kind of small crisis that teaches planning without being punishing).
  - **Fuel economy differs per vehicle**: Trikey is free (pedal), Spark is half-cost (electric), Big Tilly burns 4× the base rate. Makes vehicle choice matter beyond just slot count.
- **Visual cues**: small forecourt, two pumps, a little kiosk shop with bunting across the window. Classic British-petrol-station proportions — low overhang, fluorescent lit at night.
- **Naming**: generic (no Shell / BP / Esso). Maybe a made-up brand sign: "BIRCHIE FUEL" in painted wood or "THE PUMP" as a village nickname.

#### Reference image library

Set up a persistent reference folder for visual anchors Marcus shares during brainstorming. This becomes Manus's source of truth for Birchie art.

```
apps/game/public/admin/mockup-assets/reference/
  birchie-west-entrance/
    wavy-arm-car-wash-guy.jpg   ← reference from AliExpress listing
    petrol-station-*.jpg         ← to come
  birchie-coast/
    minnis-bay-*.jpg
    beach-huts-*.jpg
    chalk-cliffs-*.jpg
  wyx-park/
    gnarled-oak-reference.jpg
    alpaca-reference.jpg
    folk-fair-reference.jpg
  all-saints-church/
    ...
  cast-facsimiles/
    ...
```

Rules:
- Reference images live in `apps/game/public/admin/` so they're browsable from the admin UI.
- Each subfolder gets a `README.md` quoting the Marcus-context for why the ref was added and linking to relevant sections in `ptv-pet-transport-vehicle.md`.
- Never ship these to production bundles (they're admin-only, not game-runtime assets).
- Accept that we can't ship copyrighted images. Each ref is a **target for Manus to re-illustrate** in the A.R.C. storybook style, not a direct asset.

### Hedgehog crossings — stop the vehicle

Marcus's note (2026-04-24): **hedgehogs occasionally cross the roads and the vehicle must stop for them.**

This is a universal rule across both driving modes — it's not mode-specific. Hitting a hedgehog is off-limits in this game's world.

#### Mechanic

- While driving (PTV **or** Supply Run), a hedgehog trundles onto the road at a random moment, near one of the Bay Road hedgehog-crossing signs.
- A warning beat plays: the **roadside hedgehog-sign lights up**, a soft chime, AND **a big flashing road-warning triangle** appears prominently in the driver's view — red-edged triangle with a white background and a black hedgehog silhouette inside. The text prompt ("Stop for hedgehog!") appears alongside it.
- **Accessibility principle (Marcus, 2026-04-24):** any "stop for an animal in the road" warning must have a **visual-only fallback** so a kid who reads slowly can still react from the symbol alone. The triangle flashes red / pulses to catch the eye; the text is supplementary. This rule applies to every future roadside-animal event (duckling trains in spring, grass snakes in summer, migrating toads in autumn rain, etc) — each gets its own symbol in the same red-triangle frame.
- Player must **release the accelerator and brake** before reaching the hedgehog.
- Stop in time → hedgehog trundles safely across → player gets a small **kindness bonus** (+1 happiness for onboard PTV animals; +coin bonus on Supply Runs; unlocks the "Hedgehog Helper" sticker on first save).
- Fail to stop → **cannot actually hit the hedgehog** (game nudges the vehicle to brake hard at the last moment; the hedgehog is never visibly harmed) but:
  - Cargo-comfort meter drops significantly (PTV).
  - Score + coin penalty (Supply Run); neon HUD flashes with an apologetic animation.
  - A chiding line from the narrator ("Oopsie! We need to watch out for hedgehogs!") — teaches without shaming.
  - On Supply Runs, repeated misses disable the Smash Spree bonus for the run (kindness still comes first).

#### Why this rule is universal

Supply Runs are the chaos outlet — but the **coherent world** principle means animals are never collateral. A careless driving mode that *could* harm animals would break the game's core message. Hedgehogs crossing the road are the hard line: even when you're letting off steam, you still brake for the little ones.

#### Frequency + variety

- One to three hedgehog crossings per drive, random placement, weighted toward the Bay Road / residential zones.
- Occasionally other small creatures instead, as the animal roster expands: a duckling train in spring, a grass snake in summer, a migrating toad in autumn rain.
- Always signposted beforehand (the sign lights up) — no gotcha deaths.

#### Hooks forward

- Ties into the planned **hedgehog animal batch** — the first rescued hedgehog can be one the player saves at a crossing, triggering the Herne Bay hedgehog-rescue sister-centre unlock.
- Ties into **skill-training destinations**: a confident brake-for-animals record unlocks guide-dog-in-training storylines ("this driver is safe with precious cargo").

### Setting — modelled on Birchington-on-Sea, Kent

Marcus's note (2026-04-24): the compact city is modelled on **Birchington-on-Sea**, the Kent coastal village where Marcus and Lily actually live. Not a generic seaside-resort stereotype — the real place has the right mix of features: North Sea coastline, chalk cliffs, four sandy bays, a large country estate (Quex Park), a 13th-century church, farmland behind, and it sits between the larger towns of Herne Bay and Margate on the Isle of Thanet. Population ~10,500 — genuinely compact.

Lily being able to recognise her home town in the game is part of the point. Naming is open (full treatment as "Birchington-on-Sea" vs a light fictionalisation like "Birchbay-on-Sea" — both preserve recognisability; Marcus to pick).

#### Landmark → game-world mapping (first pass)

| Real Birchington feature | In-game role |
|---|---|
| **Minnis Bay** (western sandy bay, paddling pool, sailing) | Family beach area — pet-show fête venue, dog walks, gentle coastal drives |
| **Grenham Bay / Beresford Gap / Epple Bay** | Smaller beaches — chalk cliffs, sea caves, cliff stacks | Sea Cliffs rewilding habitat (parrots / seabirds) |
| **Chalk cliffs + sea caves** between bays | Rewilding habitat for seabirds; visual signature of the coastline |
| **Quex Park Estate** (country house, deer park, grounds) | The A.R.C. itself — the Centre is set in an estate-like grounds with outbuildings |
| **Waterloo Tower** (Quex Park bell tower, 1818) | Landmark on the map, visible on the horizon; maybe a pet-show venue or Centre flavour |
| **All Saints' Church** (13th-century, Rossetti's grave) | Village-heart pin — visual anchor, possible adoption delivery route landmark |
| **Farmland inland / south of village** | Bramble Farm supply run — the real fields Marcus drives past |
| **Train station / village centre** | Adopter-household cluster, pet shops, the Depot shed tucked behind it |
| **North Sea horizon** | Backdrop, harbour/Cove Harbour implied further along the coast toward Margate |
| **Road toward Margate / Herne Bay** | Outskirts drives; leads to specialist destinations (Pinebark Medical etc) |

#### Confirmed naming + local details (Marcus, 2026-04-24)

**Town name: "Birchie-on-Sea"** (light fictionalisation; preserves recognition).

**Streets:**
- Minnis Road → **Bay Road** (fictionalised — avoids using the real home address)
- Station Road → **Station Road** (kept — generic enough)

**Confirmed landmarks + local details to fold into the map:**

- **Parade of colourful beach huts** — signature Minnis Bay visual. Painted as a rainbow strip along the promenade. Cosmetic anchor for the coastal drive.
- **Town library** — village-centre landmark, good calm beat; possible skill-training venue (parrot intelligence reading-comprehension?).
- **Best fish & chip shop** — paired with **Christy's wine bar across the road**. A pairing the game can surface ("drive past the chippy and Christy's on the way to the vet"). Adult-flavour nod; could be where apprentices hang out after shifts.
- **Wyx Park** — the estate standing in for the real Quex Park. Woodlands, **alpacas**, farm adventure area, frequent events. This is a **multi-purpose destination**:
  - **Pet-show venue** (their events calendar is perfect for fête / county-tier shows)
  - **Skill-training assessment centre** (the farmland + woodland = pre-rewilding foraging training; the alpacas + farm animals = socialisation training for guide-dog candidates)
  - **Seasonal treks** — ties into the in-game calendar (spring bloom walk, autumn-hush leaf walks, winter cosy lantern trek). Each trek is a drive + guided walk event.
  - **Tonal note (Marcus, 2026-04-24):** Wyx Park leans **witchy-woodland**, NOT futuristic or cartoon-whimsy. Think ancient-tree-country-estate: gnarled oaks, lichen-draped gates, moss on stone steps, woodsmoke on cold mornings, a faint mist in the morning lanes. The alpacas feel like gentle witches' familiars, not petting-zoo exhibits. Events have a folk-fair flavour (lanterns, wooden stalls, fiddle music) rather than a theme-park flavour.
- **Hand car wash at the west entrance to Birchie** with its famous **inflatable wavy arm-man**. Two game uses:
  - **Supply Run hazard/gag**: driving through the wavy-arm zone creates a little chaos — random steering jitter, visual comedy.
  - **Vehicle wash destination**: a calm-mode use — take a dusty PTV van through, pay a coin, emerge sparkling (cosmetic bonus, visible cleaner vehicle sprite, small mood lift to whoever's on board). Lily will love the inflatable guy as a recurring character.
- **Hedgehog crossing signs** — Birchie is locally famous for these cute warning signs. Put them on the roadside as ambient props AND set up the hedgehog storyline for the future animal batch. A hedgehog's arrival story could literally be "found by the Bay Road hedgehog-crossing sign."
- **Hedgehog rescue centre near Herne Bay** (real place) — two options:
  - Sister-centre collection destination (drive there to pick up a rescued hedgehog).
  - Inspiration/namesake only; A.R.C. itself handles the rehab.
  - Decision deferred until the hedgehog batch lands.
- **Minnis Bay beach** — tidal-aware dog destination:
  - **Huge at low tide, almost gone at high tide**. The in-game tide state determines whether the beach drive is worthwhile.
  - **Dog-friendly Sept–April on the main beach**; more distant sections only during the summer season.
  - **Tidal pool** — gentle paddling for scared or recovering dogs.
  - Use: drive dogs there for a splash + dig + sand romp → big happiness boost, mud-meter fills (connects to bath / grooming loop).
  - Crowd density: "tonnes of dog walkers" — real social scene; good for cast-walk-by cameos.
- **Kids' playground next to The Dip** — a sunken multifunctional sports ground (below ground level to keep balls, wind, and waves out). Visible landmark from the coast road. Possible enclosed **pet-show venue** (the sunk bowl shape is natural seating).

#### Whole-town layout + west-entrance + Wyx Park span + Rock On Academy (Marcus, 2026-04-24)

Marcus shared the wider-area map (saved at `apps/game/public/admin/mockup-assets/reference/birchie-area/birchie-area-map.png`). Extra pins and corrections from the new view:

**West-entrance confirmed:**
- **Fishbone Grill** (real restaurant, south-west edge of town on the main road out) → the **wavy-arm car-wash location**. Approach from Herne Bay direction hits Fishbone Grill first, then the Esso.
- **Esso petrol station** (real, visible on the map next to Fishbone Grill) → the in-game petrol station. Naming: recommend generic ("Bay Fuel" / "The Pump") since Esso is a global brand; the real location stays as the reference. Marcus to confirm.

**Wyx Park's full span** (bottom-right of the map):
- Runs from the **Recreation Ground** at the top down to **Quex Glamping** at the bottom.
- Includes **Quex Barn**, **The Carriage Livery at Tilleys Glamping** (far south-east), and **Crape Park** (south-east edge).
- **Birchington CE Primary School** is adjacent at the north edge — could be a cameo (school-group visits to the A.R.C. for open days? pet-show spectators?).
- **Powell-Cotton Museum** still present on the real map — still **dropped from game** (taxidermy).
- Note: **"Tilleys" glamping** echoes our animal-lorry "Big Tilly" — happy coincidence, keep as-is.

**Rhubarb's Rock On Music Academy** (Marcus's note): next to **Jungle Jim's Ltd** (real softplay centre on the map). Where apprentice Rhubarb learns guitar, drums, and keyboard.

- **Keep the name verbatim** — "Rock On" is already on-brand; pair with the heavy-metal Supply Run music target.
- **Supply-run destination**: collect fresh instruments or gig merch for local events, deliver equipment to Wyx Park for a pet show's stage, drop Rhubarb off before a lesson. A Rock On Academy supply run plays the full Metallica-style track on the dashboard — thematically, it's Rhubarb's playlist from music school scoring the drive.
- **Thematic tie-in**: the Supply Run heavy-metal soundtrack now has an in-world origin story — it's the music Rhubarb plays around the Centre when she's off shift, and the Academy is the source of it.
- **Jungle Jim's** next door — low-stakes flavour (kid adopters go there after a Centre visit, cast walk-bys).

**The Cow Shed** (visible on the map, south-central) — pub / restaurant. Optional cameo; good name for a low-tier pet-show venue if one's ever needed.

#### Confirmed Bay Road (Minnis Road) geography (Marcus, 2026-04-24)

Marcus shared a zoomed map of Birchie centre. Transcribing faithfully so the in-game arterial can mirror the real layout — which means every drive through town passes a familiar sequence of landmarks in the same order Lily knows them.

**Bay Road (real: Minnis Road), west → east:**

1. **West entrance** (off-map, further west) — wavy-arm inflatable car-wash + petrol station (already specified).
2. **Gore End Farm** (real, western end of Minnis Road) — working farm plot, open fields to the south. **Strong A.R.C. candidate — see below.**
3. **Birchington Medical Centre** (south side, set back from the road, adjacent to open green / farmland) — our GP+pharmacy errand destination.
4. **Parish of the Holy Family** (church, south side) — possible quiet-moment landmark / adoption route marker.
5. **Birchington-on-Sea train station** (north side, where the rail line crosses Minnis Road) — cast-walk-by cluster point (commuters, apprentices arriving).
6. **Thanet Vets Birchington** (south side, just east of the rail crossing) — real vet. Use the location but rename generically (e.g. "Bay Road Vets"). **This is our normal-vet destination**, no need to invent one.
7. **Birchington Auto Repairs** (right next to the vets, south side) — real garage. In-game: **vehicle repair destination**, physically paired with the vet. Lovely accidental gameplay gift: a PTV drive that goes wrong → animal to the vet AND van to the garage, both on the same short side of the street.
8. **Christies Wine Bar** (north side, opposite the vets) — already canonical adult-flavour beat. The chippy across from Christies is just off-map here.
9. **FitUnion gym** (south side, by the vet) — minor landmark, optional cameo.
10. **Eastfield Road retail cluster** (further east) — Sainsbury's Local, Co-op, Mandy's Deli, Maria's Kitchen, Wimpy, The Bottle Shop. Cast errands and pet-shop foot traffic happen here.

**Side streets visible on the real map** (lift verbatim or fictionalise; most are fine to keep as-is):
- Side-streets south off Minnis Road: **Gordon Square, Rutland Gardens, Sussex Gardens, Kent Gardens, Prospect Road, Westfield Road**.
- Going north off Minnis near the station: **Beach Road, Lyell Road, Rossetti Road** (Rossetti Road is named after the poet buried at All Saints — real historical link, worth preserving).
- Further north: **Cunningham Crescent, Hunting Gate**.

**Game convention for the transcription:**
- Minnis Road → **Bay Road** (already decided).
- Other streets: keep real names — they're generic enough and add authenticity for Lily.
- Real businesses: rename where we have specific in-game use (vet, auto repairs, chippy, pharmacy, pet supplies) per the "keep generic" rule; leave peripheral/background shops as loose references.

**Reference:** Marcus's zoomed Birchie-centre screenshot (shared in chat 2026-04-24). If saved, goes into `apps/game/public/admin/mockup-assets/reference/birchie-centre/` with a README caption.

#### A.R.C. location — coastal green south of The Dip, between Canute / Viking / Dane roads (Marcus, 2026-04-24)

**Location: the open green space immediately south of The Dip**, bounded to the south/east by **Canute Road, Viking Road, and Dane Road** (the Viking-heritage cluster). A minute's walk north to Minnis Bay. Marcus pinned it from a zoomed map of the Minnis Bay / Dip area. Reference folder: `apps/game/public/admin/mockup-assets/reference/birchie-minnis-bay/`.

This is a **coastal** A.R.C., not a west-end-of-Bay-Road A.R.C. as previously sketched.

**Naming (Marcus, 2026-04-24):** **A.R.C.** is the formal name. In dialogue and narrator copy, locals refer to the Centre affectionately as **"The Arc"** — echoing **"The Dip"** next door and carrying a gentle **Noah's Ark** allusion (a place that keeps all the animals safe). The acronym / nickname pairing is the whole identity; no additional placename needed.

Canonical usage:
- **Written**: "A.R.C." (brand / map pin / signage / menus).
- **Spoken in-game**: "The Arc." Narrator: *"welcome to The Arc!"*. Adopters: *"we'll bring her back to see everyone at The Arc soon."*
- **Entrance-gate sign**: *"A.R.C. — Animal Rescue Centre"* in painted wooden letters.
- **Gentle Noah's-Ark echo**: when things are at their most hopeful (a big rescue, an adoption ceremony, an entire storm-night of strays coming in), leaning a fraction into the Ark imagery is fine — never overtly religious; just the warm "everyone safe here" flavour.

##### What's right next to A.R.C.

Taking the coastal location seriously reshapes the local neighbourhood:

- **The Dip** (directly north of the A.R.C. plot) — the sunken multifunctional sports ground. Already canonical as a possible pet-show venue; now **literally next door**. Every fête-tier show is a walk, not a drive.
- **Minnis Bay beach + paddling pool** (~1 min walk north past The Dip) — the tidal dog-beach destination and the gentle paddling pool for scared / recovering dogs. Dog rehab is on the doorstep.
- **The Parade** — the seafront road with its **rainbow beach huts** — directly north. A.R.C. staff / apprentices walk dogs here daily.
- **Dapper Dogs** (real dog groomer on the map) — **natural grooming partner**. Could be:
  - a visiting apprentice's own business (walk-in cameos),
  - a paid errand destination (drive a dog in for a trim, cosmetic clean-up mood bump),
  - an apprentice-unlockable upgrade ("on-site grooming").
- **Wagtails Cafe & Bar** (real café on the map) — thematic name is already perfect; **keep the real name verbatim** (this is the exception to the generic-shop-names rule; "Wagtails" is too on-brand to fictionalise). Canonically the cafe where apprentices hang out between shifts and visitors stop in on their Centre visits.
- **Kearns Hall** (real local hall) — community hall; possible low-tier pet-show or adoption-day venue.
- **The Bay United Reformed Church** — quiet-moment landmark on the coast-road walk.
- **Bay Lodge** — possible adopter household pin / apprentice residence.
- **Waves Bed & Breakfast** — friendly flavour landmark (visitors staying overnight?).

##### Revised drive arterial

The drive into town no longer *starts* on Bay Road — the A.R.C. is now north of the village. Heading east into the centre:

> A.R.C. gate → walk or drive south through **residential streets** (King's Avenue / Ethelbert Road / Dane Road) → join **Bay Road (Minnis Road)** near the Parish → east past **Medical Centre + pharmacy** → **train station** → **Bay Road Vets + Bay Road Garage** (paired) → **Christies + chippy** → **retail cluster** (Sainsbury's, Co-op, Mandy's, Maria's, Wimpy).

Heading west (out of town, for supply runs):

> A.R.C. gate → south to Bay Road → west past **Goose End Farm** (real Gore End Farm — now a working farm / collection source) and the farmland belt → **Esso petrol station** (right side) → **Fishbone Grill + wavy-arm car-wash** (left side) → leave town toward Herne Bay.

Heading north (beach / dog rehab / seabird watching):

> A.R.C. gate → straight onto **The Parade** → **beach huts** → **paddling pool** → **Minnis Bay beach** (tidal rules apply).

Heading south (Wyx Park + Bramble Farm + wider countryside):

> A.R.C. gate → residential streets → Bay Road → south off Bay Road via **Gordon Square or Old Farm Road** → **Wyx Park estate** → **steampunk-barn prosthetics vet** (further south, in the countryside) → Bramble Farm supply run.

Every cardinal direction has its own flavour. Nicely varied for a real-time driving game.

##### A.R.C. layout within the green plot

Borrowing what the real site offers:

- The plot is an **open green** — room for a sprawling sanctuary rather than a cramped courtyard.
- Main building runs parallel to The Parade along the north edge — so the sea view is built into the kitchen, play room, corridor.
- Corridor / vet / kitchen / play rooms in the main building.
- Outside grounds wrap around to the south: garden, pond, outhouse, paddocks for larger rehab runs (horses / ponies if the roster ever expands).
- Apprentice bothy + tool shed (the Depot can live here) at the back.
- A painted wooden sign at the entrance gate: *A.R.C. — Animal Rescue Centre*. Locals call it "The Arc".

##### Viking / Danish heritage in the street names

Marcus's note (2026-04-24): *"ARC will then be placed between Viking, Canute and Dane-named roads, which is perfect as Lily and I are Viking descendants — we are literally Danish nationals."*

The residential cluster wrapping around the A.R.C. plot is themed on Anglo-Saxon / Viking heritage — **Dane Road**, **Canute Road** (named for Cnut the Great, Danish king of England), **Viking Road**, and **Horsa Road** (the legendary Saxon-Norse leader). **Ingoldsby** is also Old Norse in origin. The A.R.C. sits **between Canute, Viking, and Dane roads** specifically — per Marcus's map pin.

Design implications:

- This is a **lovely personal coherent-world detail** — Lily is Danish, her family walks streets named after her own heritage, and the A.R.C. is planted right in the middle of that cluster. Keep all these street names verbatim; they're both authentic to real Birchie and personally resonant.
- An occasional flavour line on the map or in narrator copy can nod to it — *"The Centre sits where the Viking lanes meet the sea"* — without being a lecture.
- **Future animal storyline hook**: a Viking-themed rescue arc is now naturally available. A dog named Canute or Ragnar who washes up on Minnis Bay. Horsa-the-horse if the roster expands. Earned, not forced.
- Optional badge set: "Viking Descendants" — awarded for completing rehomings to households along Dane/Viking/Canute/Horsa roads.

##### Real-world renaming cheatsheet for this map

| Real place | In-game |
|---|---|
| The green south of The Dip (between Canute / Viking / Dane roads) | **A.R.C.** — "The Arc" in dialogue |
| The Dip | **The Dip** — kept (descriptive, affectionate name) |
| Minnis Bay + paddling pool | **Bay beach + paddling pool** (Minnis → Bay to match Minnis-Road → Bay-Road rule) |
| The Parade | **The Parade** — kept (generic, descriptive) |
| Dapper Dogs | kept or renamed (**"Dapper Dogs"** is already great — recommend keep) |
| Wagtails Cafe & Bar | **keep verbatim** — too on-brand to fictionalise |
| Kearns Hall | fictionalise lightly (**Kearns Hall** fine, or "Bay Hall" / "Dip Hall") |
| Bay United Reformed Church | **Bay Chapel** or kept |
| Bay Lodge | **Bay Lodge** — fine |
| King's Avenue, Ethelbert Road, Alfred Road, Dane Road, Old Farm Road, Horsa Road, Ingoldsby Road, Grenham Bay Avenue, Reculver Avenue | **Keep all real names** — authentic and safe |
| Rose of Sharon Complementary Therapy | background flavour only; don't reference in-game |
| Waves Bed & Breakfast | keep (lovely for visitor storylines) |

**Vet-and-garage pairing is still a gameplay gift.** The vet + garage are on Bay Road (the real Thanet Vets / Birchington Auto Repairs stretch). A broken-down van with a sick animal onboard still lands both problems on the same strip; the difference now is the A.R.C. is a short drive north of them, not west of them.

##### Goose End Farm — a separate collection-source location (Marcus, 2026-04-24)

**Goose End Farm is NOT the A.R.C.** It's a **separate working farm** (the real Gore End Farm plot out west on Bay Road), with its own in-game functions:

- **Hay supply** — fields grow hay; the A.R.C. drives out to collect when stores run low. Seasonal hay-cutting day in late summer.
- **Border-collie training ground** — the farm's paddocks and livestock (sheep / ducks) support working-dog herding training. Border collies arriving at the A.R.C. can be driven out to Goose End for assessment and training sessions. Opens the "working dog" career arc.
- **Stray collection source** — farmers find strays on their own land; the farm becomes a **call-in location** where the PTV is dispatched to collect. The farmer's voice line on the phone might be a recurring character: kind, practical, slightly gruff.

Positioned at the west tip of Bay Road — the old-Gore-End plot — so every supply-run drive west also passes it as a familiar landmark. Its own visible map pin, its own small cameo cast member.

##### A.R.C. drop-off (separate from Goose End)

At the A.R.C. itself, a smaller low-friction arrival channel continues:

- **Front-gate stray drop-off** — locals bring strays they've found in the village directly to the Centre gate. Low-pressure onboarding arrival mechanic. Gate bell rings, Lily answers. Phase-1 arrivals (before PTV collection drives unlock) all happen this way.

#### Collection drives — PTV goes out to fetch animals

Marcus's note (2026-04-24): *"we also need the PTV to go collect animals later on in the game so they don't just appear in the welcoming hallway."* This is a major arrival-mechanic evolution.

**Phase 1 (onboarding):** animals arrive at the Centre gate — the magic "they're just here" rhythm — the existing arrival popup. Low friction, keeps the first hour of play gentle.

**Phase 2 (PTV unlocks collection):** once the player has a working PTV and the first adoption / rewilding drives under their belt, arrivals shift to a **call-and-collect** rhythm:

- A **call comes in** — a notification on the GPS map, or a phone-ringing beat at the Centre: "*Hedgehog found in a garden on Horsa Road*", "*Injured fox cub on the moor path*", "*Three kittens dumped near Bramble Farm*".
- Player opens the map, sees the **pickup pin** (distinct icon — a little paw + phone), chooses when to respond. Usually low-urgency; occasionally time-pressured (animal hurt, weather turning).
- Player picks a vehicle, drives to the pickup location, crate-stacks (if multiple animals), drives back.
- The drive back becomes the "arrival ceremony" — animal visible in the van, narrator introduces them, then the arrival popup on return to the Centre.

Good source locations for collection calls (per Marcus's 2026-04-24 additions):

- **Goose End Farm** — the real working farm out west on Bay Road (see naming note below). Farmer rings about a found stray; the PTV goes out to fetch.
- **Westbeach Golf Club** (real: Westgate & Birchington Golf Club, top-right of the wider map — renamed **Westbeach** per Marcus). Injured wildlife found on the fairways (a hedgehog with a golf-ball-sized bruise, a trapped rabbit, birds flown into netting). Good source for both wild and lost-domestic pickups.
- **All Saints' Church / Bay Chapel / Parish of the Holy Family** — strays often turn up on church grounds, with room for genuinely funny + affectionate vignettes:
  - A **grass snake entangled on a gravestone** — vicar rings apologetically, won't touch it.
  - A **parrot up in the rafters singing loudly during the service** — escaped from an adopter's garden, has discovered the acoustics. Hymn verses get joined by an enthusiastic "HELLO! HELLO!" from the ceiling.
  - A cat who's moved into the churchyard and claimed the bell-tower stairwell.
  - Wet kittens abandoned under the porch after the Sunday service.
  - The vicar is a recurring cameo — kind, slightly exasperated, always offers a cup of tea when the PTV arrives.
- **Other farms around Birchie + inland** — farmers find strays; rural collection runs.
- **Roadside pickups** — a hedgehog saved at a crossing sign becomes a resident.
- **Coastline finds** — injured seabirds, oiled gannets after a storm, a seal pup at Epple Bay.
- **Hedgehog rescue near Herne Bay** — sister-centre transfer when their space runs out.
- **Garden reports** — householders in Birchie phone about a fox cub under a shed, bunnies dumped in a park.

##### Naming resolved (Marcus, 2026-04-24)

**Goose End Farm = the separate working farm out west**, NOT the A.R.C. See the shortlist of A.R.C. name candidates at the top of this section.

**Design beats:**

- Collection calls respect the weather and time-of-day rules — a storm night + distressed seal is a higher-drama call than a garden bunny in sunshine.
- The "drive back" re-uses the gentler PTV driving mode, since a new animal is onboard.
- **Phase-gate cleanly**: don't switch arrival modes abruptly. From unlock moment, mix ~50 % gate-arrivals / ~50 % collection-calls, then gradually favour collection as the player levels up. Some gate arrivals keep happening (locals will always bring strays in) but the game's centre of gravity shifts to the truck.
- **Failed collections** — if a call is ignored too long, the narrator mentions it later ("someone else took her in, she's safe") — no shaming. The world doesn't punish missed calls; it just carries on.
- **Onboarding the mechanic** — the very first collection call is the **border-collie training-assessment dog**: a local farmer rings saying a young collie has shown up, needs assessment. Player drives out, collects her, brings her home, and the border-collie training arc begins. Gentle, purposeful, and demonstrates the new mechanic.

This mechanic ties the PTV into the *beginning* of the care loop, not just the end. Previously PTV only handled outbound (adoption, rewilding, delivery); now it also handles inbound (collection). The full loop: **call-in → PTV collection → care at A.R.C. → PTV outbound (adoption / rewilding)**. Completely closed.

#### Other A.R.C. candidates (archived)

Kept in case the plot decision ever reverses:
- Real Gore End Farm (west tip of Bay Road) — now reused as the farmland belt west of town; feeds the Bramble Farm supply run.
- Coast plot near Epple/Grenham Bay — unused, but Grenham Bay Avenue is on the map as a residential road — possibly an adopter-cluster.
- Coastguard station — dropped (no such building obvious from the map).
- Victorian villa — dropped.

#### Village errands — GP pharmacy + pet supplies shop (Marcus, 2026-04-24)

Two real Birchie shops pinned as in-game destinations. Both are **short-hop village errands** — the kind of drive that suits the first-drive lesson and daily routine.

**GP clinic + attached pharmacy** (Birchington Medical Practice, on **Bay Road** / Minnis Road in real life).
- In-game role: **pet medication collection point**.
- Loop: a vet (steampunk-barn prosthetics vet, specialist, or general) prescribes → player drives to the village pharmacy to pick up the prescription → back to the Centre to administer → animal recovers faster.
- Reuses the Depot's medical-supplies catalogue but represents a *prescribed* med (specific to an animal), not a general stock item.
- Good for the second-tier onboarding tutorial after the adoption-delivery lesson — it teaches the drive-errand rhythm without the emotional weight of an adoption.
- Visual cue: white-painted shopfront with the green cross, bench outside, posters in the window for local events.
- Tonally careful: the clinic is a **people** clinic with an attached **pet-med pharmacy**. Not a vet — a vet signs the prescription; the pharmacy fills it. Keeps the tonal line between "adults-go-to-GP" and "pets-go-to-vet" clear so kids don't get confused.

**Pet supplies shop** (real shop on Station Road).
- In-game role: **toys, food top-ups, treats, grooming supplies** — the consumer side of the Centre's running costs.
- Loop: running low on kibble / toys / shampoo → drive to Station Road → pick up → back to Centre.
- Ties into:
  - Existing **toy-picker UI** — toys bought here populate the toy rotation.
  - Existing **food catalogue** — food restock happens here rather than as an abstract menu order.
  - **Arrival-toy probability** (`rollArrivalToy`) — toys physically originate here.
- Sometimes a **cast walk-by** is browsing the shop when the player arrives (aligns with the coherent-world principle — visitors shop for their own pets too).
- Visual cue: chunky painted shop sign with a paw-print logo. Window display of leashes, bags of kibble stacked in the doorway, a water bowl for dogs at the entrance.
- Budget pressure: shop prices are gentle; stock is the main gate, not cost.

Both locations fit the cast-walk-by rule — adopters / visitors / apprentices might be stepping out of the pharmacy with their own prescription, or coming out of the pet shop with a bag. More "coherent world" wins.

#### Candidate locations for the A.R.C. itself

Marcus is mulling where the Centre sits in Birchie. The requirements:

- Enough **outdoor space** for rehab runs, gardens, and the painted-garden-bg tiles already in the repo.
- Several **room types** — corridor, vet, play, sleep, kitchen, outhouse, pond, garden.
- **Car access** for PTV drives (the Centre is the origin of every drive).
- **Slightly out of the main village** so drives into town feel meaningful — but not remote.
- Walking distance to the coast, the chippy, the pet shop (the "coherent world" needs realistic pedestrian reach).

Four candidate sites, pros and cons:

| Candidate | Vibe | Pros | Cons |
|---|---|---|---|
| **1. Converted farm on the village edge, south of Birchie** — halfway between the village proper and Wyx Park | Red-brick barns + stables + fields, working-countryside-turned-sanctuary | Natural neighbour to Wyx Park (easy trek-out for skill training); plenty of outdoor space; car access from the main road; rural-but-walkable | Could compete visually with Wyx Park if both are in the same kind of rural idiom |
| **2. Quieter eastern coast plot — near Epple Bay or Grenham Bay** | Coastal bungalow / former boarding house with a big garden, sea air, cliff walks | Sea views are magical; beach-dog-walks minutes away; echoes the real Birchie coastal identity; good for rewilding-to-Sea-Cliffs drives (short hop) | Limited outdoor run space if close to the cliff edge; weather-exposed |
| **3. Former coastguard / lifeboat station on the coast road** | Stone-and-weatherboard heritage building with a stubby tower, painted Centre signage | Distinctive silhouette Lily could recognise instantly; ties rescue-work heritage into the real coastline feel | Small footprint; limited indoor rooms; retrofit-feel may clash with the cosy-storybook vibe |
| **4. Large Victorian house + walled garden on a quiet Birchie street** | Red-brick Victorian villa, gabled roof, big overgrown garden, iron gate at the front | Walkable to the village; plausible retrofit into a rescue centre (many real rescue centres are in converted houses); works with existing Manus painted-garden backdrops | Limited space for big outdoor rehab runs unless the garden is generous |

Claude's lean: **Candidate 1** (converted farm, village-edge, south). It gives the Centre room to breathe, makes the seasonal treks feel like "walking next door to Wyx Park," sets up the weather-aware-vehicle mechanic (the access road is the first bit of every drive — gives weather a chance to register), and reads as a *rescue centre* rather than a private house.

Candidate 2 (quiet coast plot near Epple Bay) is a close second — the sea air and beach-walk immediacy are lovely, and it's very photogenic.

Marcus to decide — or suggest a real local plot he had in mind.

#### Additional decisions (Marcus, 2026-04-24)

- **Powell-Cotton Museum**: **dropped** from the game. The real museum is full of taxidermy — tonally wrong for a kind-to-animals game. Don't reference it, even as flavour. If a museum is ever needed, invent one.
- **Shop names**: **keep generic** — no real-named shops. "The chippy" and "the wine bar across the road" are fine; pub-sign art on the chippy is an identity without naming it after a real business.
- **Specialist prosthetics vet**: **fictional countryside location**, housed in a **steampunk-converted barn**. Not in Birchie itself; a short drive out into the Kent countryside. Design cues:
  - Red-brick barn with cogs, copper pipes, and a painted chimney stack.
  - Animal-scale prosthetics on workbenches (wheels, springs, paw-braces), rendered playful not clinical.
  - A vet who looks part-blacksmith, part-engineer — leather apron, goggles on the forehead, gentle manner.
  - Workshop windows lit warm at night.
  - Unlock trigger remains story-driven (a dachshund / fennec arrives needing wheels — see §"Destinations discovered through pet needs").

#### Still open — decisions deferred

- How much tidal realism to model (a simple day/night + low/high-tide cycle is enough; no lunar calendar required).

#### Consequences for art + music

- **Art direction**: the game-world reference photos should include real Birchington shots (chalk cliffs, Minnis Bay slipway, Quex tower) so Manus / GPT-Image can match. Red-brick Victorian seaside architecture, not pastel-Cornwall stereotypes.
- **Weather**: North Sea weather — wind, mizzle, bright crisp days, winter storms. Reinforces the PTV weather-aware-vehicle beat.
- **Wildlife reference**: real local species (herring gulls, peregrines on the cliffs, hedgehogs in hedgerows, badgers in Quex grounds) can shape which animals populate the rewilding habitats.

### Living world — households visible on the map + out walking

Marcus's note (2026-04-24):

Every **adopter**, **visitor**, and **apprentice** household has a physical presence in the world:

- Their **house is visible on the GPS world map** as a painted pin, with the household's name / emoji identifier.
- The pin appears as soon as the household first enters the game (first visit, first adoption arranged, apprentice recruited).
- Adopter houses show the adopted pet on the map tile (cute "pet at home" icon) — visible proof the animal found a forever home.
- Apprentice houses similarly carry the apprentice's portrait.

**Out walking their pets.** While the player is driving, the compact-city layer renders **people on the pavements**, and some of them are recognisable faces from the cast:

- Adopters occasionally walking the pets they adopted from the Centre. Seeing Luna the dachshund trotting along next to the Kumar-Ishii family on the way to Pinebark is a gold-standard moment.
- Visitors (regulars who swing by the Centre) out and about in the town.
- Apprentices on their way in or out of shifts.
- Not every pedestrian is a cast member — most are anonymous townsfolk painted as background life. The cast appearances are the treat.

**Design rules:**
- The cast walk-bys are **never required** — it's ambient, feel-good density. Missing one has no penalty.
- Honking at a cast-member cut-scene plays their specific greeting voice line instead of the usual townsfolk reaction (reuses the Manus `voice-hello-friend` etc).
- Pet-adopting walks happen on roads near the adopter's own home pin, not randomly anywhere — reinforces the map geography.
- The denser the player's rescue history (more adoptions, more apprentices, more visitors), the more of these appearances there are. A fully-populated town *feels* populated because the player built it.

This is a core **"coherent world"** design principle — the Centre, the households, the pets, the pavements, the destinations all belong to the same compact city. Every pet placed and every household recruited leaves a visible mark on that city. Nothing is abstract menu-space.

The ramifications are worth spelling out because they should govern downstream decisions:

- **No disconnected screens.** The adoption ceremony doesn't happen in a void — it happens at the adopter's house pin, reached by driving there. The vet visit isn't a menu — it's a building you drive to. The pet show is a fête on a specific street corner.
- **Map is persistent state.** The world remembers where every adopter lives, where every apprentice walks, where rewilded animals were released. Driving past those places *means something*.
- **Consistency across systems.** PTV drives, Supply Runs, visitor arrivals, apprentice recruits, adoption deliveries — all operate on the same painted map with shared geography. A supply-run truck and a PTV van drive the same streets.
- **Art direction consequence.** City and surroundings are a single art-world, not a set of separate scene backdrops. When Manus or another artist is briefed for any location, the brief should reference adjacent locations so styles match.
- **Narrative consequence.** "Drive past Samuel's house on the way to Pinebark" is a sentence the game can plausibly surface. The world is small enough that route overlaps are meaningful.

### Drive format, setting, onboarding, discovery

Marcus's note (2026-04-24):

#### Real-time drive, compact city + surroundings

Drives are **real-time**, not cut-scenes — the player actually drives for the duration of the trip. Setting is a **compact city with its surroundings** (countryside, outskirts, harbour, moorland, etc). "Compact" is the key word: the world is small enough to be traversable at real-time speeds without feeling like a road-trip slog. Destinations are minutes-apart, not hours.

The fake-3D road (see above) renders city blocks, outskirts, and countryside as the player drives through them. Art budget matters: the compact scale keeps the required environment-tile set tractable.

Drive lengths scale with destination distance in [`destinations.ts`](../packages/game-logic/src/destinations.ts) — short trips (~30–60 s) for in-city runs, longer (~90–180 s) for moorland / deep-forest / sea-cliffs rewilding. Kid-appropriate; no 10-minute drives.

#### Onboarding: first drive is a VET RUN (Marcus, 2026-04-24 correction)

The player's **very first PTV drive** is a **vet run**, not an adoption delivery. Adoption happens much later in the game (after full bonding), so it can't be the first-drive trigger.

A vet run fits onboarding perfectly:

- An early animal at The Arc gets sick or needs a check-up (illness is common in the early game by design).
- Only one animal onboard — single pet, single slot, no crate-stacking yet.
- Short destination: A.R.C. gate → south through the residential streets → east along Bay Road to **Bay Road Vets** (paired with Bay Road Garage). Two minutes, kid-appropriate.
- Gentle carefulness matters — a poorly animal + careful drive is exactly the empathy beat the game is about. Teaches *"we go slow because they're not feeling good."*
- The UI spotlights the cockpit piece by piece during the drive: ignition → accelerator → steering → brake → horn. Each element gets a small tutorial beat.
- Success is the payoff: arriving at the vet, the pet gets treatment, player gets a small "safe delivery" happiness bonus.
- **Economic loop hooks in immediately**: vet treatment costs coins → player's motivation to do Supply Runs is established from day one. The chaos-outlet and the vet-bill pressure are introduced in the same play session.

The **second drive** adds the crate-stacking mechanic (see below) by putting a second pet in the vehicle.

**Adoption delivery drives** start MUCH later — once a pet has reached full bond level and an adopter has been committed. By then the player has done plenty of vet runs and understands driving.

#### Crate-stacking introduced on the second drive

The **second** PTV drive adds a second pet. Now the player has to think about crate type and adjacency for the first time. The mechanic is discovered through gentle play:

- "We've got two going out today — let's load them together."
- First conflict spotted mid-load → ⚠ icon appears, short explanation bubble.
- No punishment for messing up the first stacked drive — arrival just comments ("she was a bit unsettled…") and teaches.

This is the opposite of a tutorial wall: the player meets each mechanic on the drive that needs it.

#### Destinations discovered through pet needs, not levels

New destinations unlock because an animal **arrives with a need that requires them**, not because the player hit an XP threshold. This is the dominant unlock logic for PTV destinations — level-gating is a fallback, not the primary mechanism.

Examples:
- A **dachshund** arrives with IVDD (slipped disc) and can't walk on its back legs → unlocks the **specialist prosthetics vet** so the player can drive them there for a wheeled cart.
- A **fennec fox** arrives with hind-leg paralysis → same unlock, but now pre-existing, so the drive is framed as "we know where to take her."
- A clever **African Grey** arrives with a backstory about escaping a bad owner → unlocks **parrot intelligence testing** as a voluntary path.
- A **Labrador pup** shows exceptional calm and focus → unlocks **guide-dog potential testing**.
- A **wild-injured fox cub** needs survival retraining before release → unlocks **pre-rewilding specialist training**.
- Winning a small local **pet show** (fête tier) opens the county-show tier, and so on up the pet-show ladder.

Design intent: the destination list grows alongside the story of which animals have passed through the Centre. Every unlock is a memory of a specific pet.

This implies:
- Each destination has an **unlock trigger** keyed to an arrival event or outcome, not just `unlockLevel`. The current `DestinationDef.unlockLevel` stays as a fallback cap (so destinations don't appear absurdly early), but the primary predicate is a per-destination `canUnlockFrom(store)` check driven by arrivals / bond levels / completed PTV outcomes.
- Arrivals should carry **hidden "story hooks"** (condition, temperament, traits) that can trigger destination unlocks when the player meets them for the first time. The arrival popup shows the story; the map quietly lights up a new pin.

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

### Pre-drive screen vs in-cockpit split (Marcus, 2026-04-24)

Vehicle choice and PTV/Supply-Run mode are set **before** entering the vehicle, on a **pre-drive screen**. Once in the cockpit, those controls are out of the way — the player is focused on driving.

**Pre-drive screen (new):**
- Choose destination (from the GPS / map).
- Choose vehicle (only unlocked ones).
- Choose mode for this trip (PTV for animal transport / Supply Run for cargo-free).
- Review the adjacency-puzzle / crate-load for PTV trips with 2+ pets.
- "Let's go!" button.

**Cockpit (in-vehicle):**
- Road view (dominant).
- Dashboard with: wheel, speedometer, pedals, ignition, hazard button, horn-in-wheel.
- **GPS is mounted ON the dashboard** (like a real in-car GPS unit, not a floating overlay over the road). Small painted-screen panel with the route drawn and a "you are here" marker.
- Cargo-comfort meter (PTV only) as a small dashboard gauge.
- That's it. No vehicle picker. No mode toggle. No pre-drive options visible during driving.

The v1 mockup violates this — it has vehicle picker + mode toggle on-screen during the "drive", and the GPS floats above the road. Marked for rebuild.

### Cockpit layout — emulate a real car (Marcus, 2026-04-24)

The v1 cockpit mockup had elements scattered around the screen (pedals bottom-left, ignition bottom-centre, horn bottom-right, wheel centre). That's **wrong**. The layout should actually emulate how a car is laid out so the kid intuits where things are:

- **Steering wheel** — front-and-centre (unchanged).
- **Horn** — **in the centre of the steering wheel**, like a real car. You *slam the middle of the wheel* to honk. (No more separate bell button off to the side.)
- **Speedometer** — **above or directly beside the wheel**, in the dashboard area the driver naturally looks at. **Goes red when the player is speeding** (over a configurable limit per road — important for care-driving teaching).
- **Accelerator + brake pedals** — **below the steering wheel**, not off to the side. Left pedal = brake, right pedal = accelerator (real-car layout). Player presses down to engage.
- **Ignition** — **to the LEFT of the steering wheel**, like a real car (keyed ignition sits there on most right-hand-drive cars). Interaction varies by vehicle (Marcus, 2026-04-24):
  - **Spark (electric)** → a **button**. Press-and-release once. Lamp lights immediately.
  - **Henry / Bea / Big Tilly** → a **chunky painted car key** visible in the ignition barrel. Click-and-drag the key **45° clockwise** to spark the engine. Holding the key at the 45° position for ~1 s registers as a start (simulates the real "turn and hold"). Release = return to rest. Nice tactile animation: key rotates, a little spark pops, ignition lamp glows warm amber, engine idles.
  - **Trikey (pedal trike)** → no real ignition — a small painted **"GO!" flag** you flip up on the handlebar. Purely ceremonial; immediately "started".
  Each vehicle's ignition animation is part of its dashboard identity (see "Dashboard varies per vehicle" below).
- **Hazard button** — **new element**, to be added. Player presses to switch on hazard lights when pulled over at the roadside, at the petrol station, at the vet door, or when stopped for a hedgehog. Visible orange hazard-lamp indicator on the dashboard while on.
- **GPS** — top area, unchanged.
- **Cargo-comfort meter** (PTV only) — dashboard corner, unchanged.
- **Mode toggle** — dashboard side panel or menu, not driver-facing during a live drive.

The v1 mockup is superseded. Rebuild needed.

### Dashboard varies per vehicle (Marcus, 2026-04-24)

Each vehicle has its own **cockpit dashboard** — the driving UI you see depends on which vehicle the player picked. Same functional elements (steering, pedals, horn, ignition, GPS, speed) but completely different **tone, materials, proportions, and typography**. First-pass vibes:

| Vehicle | Era / feel | Dashboard materials | Type + readouts | Horn |
|---|---|---|---|---|
| **Trikey** (pedal trike) | Kid-on-a-bike, simplest rig | Painted wooden handlebar + wicker basket bolted to the front. No real dash — just a bell, a simple cloth-map holder | Mostly handwritten labels (Kalam) — this rig doesn't need car fonts. Speed "readout" is a painted arrow on a cloth strip | Bicycle bell — literal |
| **Henry** (small van) | 1970s cosy delivery van, the workhorse | Cream-and-chrome painted metal dashboard, wooden steering wheel, bakelite knobs | Condensed sans (Barlow Condensed / Roboto Condensed) for labels; analogue needle gauge with painted numerals; "Henry" in a handwritten glove-box flourish | Classic parp-parp horn |
| **Bea** (long van) | Slightly refined, deco flourishes, more heart | Walnut panelling, brass trim, painted floral decal on the glove box | Same condensed sans as Henry + a small Art-Deco title font for "BEA" across the dash | Two-tone horn |
| **Big Tilly** (animal lorry) | Heavy-duty lorry cabin, trucker-cosy, curtains on the windscreen | Chunky black-painted steel with big rubber-grip switches, chrome rivets, leather seat visible | Bold industrial condensed sans (Oswald), **LED-style numerals** (DSEG7 / Orbitron) on the big central gauge, a warning-lamp row | Deep air-horn (but still friendly) |
| **Spark** (electric minibus) | Modern premium, clean, quiet | Matte-grey painted panel, a single flat screen for info, minimal physical controls | Modern geometric sans-serif (Inter / DM Sans) for labels; digital readouts; everything in low-contrast cool tones | Soft electronic chime |

Shared rule: all dashboards are still **painted-storybook**, just in different subgenres. No vehicle goes into sci-fi territory.

### Cockpit typography — not cartoon (Marcus, 2026-04-24)

The painted-storybook handwritten fonts (Kalam / Caveat / Chalkboard SE) belong to **narrator copy, tutorial callouts, and wooden sign-labels outside the car**. Inside the cockpit, "technical" UI elements need fonts that read as **car dashboard**, not kids'-book cartoon:

- **Speed gauges / numeric readouts** — digital / LED-style numerals (e.g. `Orbitron`, `DSEG7`, or a condensed monospace numeral). Looks like a real speedo.
- **Dashboard labels** ("VEHICLE", "MODE", "GPS — Birchie-on-Sea", "CARGO COMFORT") — a **condensed sans-serif** (e.g. `Barlow Condensed`, `Oswald`, `Roboto Condensed`). Mechanical, no-nonsense.
- **Buttons** ("IGNITION", "ACC", "BRK") — same condensed sans, uppercase, engraved/embossed feel.
- **Narrator lines / tutorial banners / "Nearly there, good driving!"** — keep the handwritten storybook fonts (Kalam). These live *outside* the car's mechanical UI.

The mix creates the right tone: the **car feels real**, but the game around it is still painted-storybook.

### Map layout — workable, not overlapping (Marcus, 2026-04-24)

The v1 map mockup has pins overlapping in the village centre and roads not clearly visible. For the real map:

- **Roads must be clearly drawn** — painted road-ribbons with visible names (Bay Road, Station Road, The Parade) at readable size. The road network is the visual skeleton that organises everything else.
- **Pins must not overlap**. Resolve by:
  - **Zoom-based rendering** — start zoomed out with only major landmarks (A.R.C., Wyx Park, Minnis Bay, Goose End Farm, supply destinations, rewilding habitats); zoom in to reveal minor pins (shops, adopter houses, cameos).
  - **Declutter** the village centre — cluster shops into a single "Village centre" pin that opens a detail panel, rather than six overlapping signs on the same crossroads.
  - **Longer-stem signs** for pins that would otherwise collide — the stem points precisely at the map spot; the label sits offset.
  - **Pin size hierarchy** — hero pins (A.R.C., Wyx Park, Minnis Bay) larger; supporting pins smaller; cameo pins a dot with a hover reveal only.
- **Painted landscape background**, not CSS shapes — the real map needs a Manus-painted backdrop showing sea, cliffs, village grid, farmland, Wyx Park woods. Pins sit on top of the painting.

### Supply Run visual tone — "fun, not Blade Runner" (Marcus, 2026-04-24)

Earlier specs said "neon cyberpunk" for Supply Runs. Marcus's correction: that reads as **sci-fi-shooter / Blade Runner**, which is wrong. Supply Runs are the **fun** version of the serious driving, not a cyberpunk mode.

**Right references:**
- Wacky Races, Top Gear playfulness, Mario Kart painted-arcade, vintage-pinball-machine energy, comic-book speed lines.
- Think *cheeky* painted-storybook-dialled-to-11, not *intimidating* sci-fi HUD.

**Wrong references to avoid:**
- Neon pink + cyan dashboards.
- Cyberpunk / Blade Runner / Tron aesthetics.
- Dark roads with glowing accents.
- Anything that looks like an arcade shooter or vaporwave music video.

**Palette cues:**
- Bright saturated **racing colours** — hot orange, racing yellow, bright red, royal blue — not neon pink/cyan.
- **Sunny daylight** on the road, not dark neon-lit night.
- **Comic-book speed-stripes, sparkles, POW/ZOOM decals** as dashboard accents.
- Painted wooden dashboard still present — maybe with cheeky painted racing stripes across the plank.
- Horn icon might swap for a painted **bicycle-bell-with-tassels** or **pinball-flipper** style element.
- Cargo-comfort meter is hidden in Supply Run mode (no cargo) and replaced with a **smash counter** or **speed streak meter**.

**Consistency rule:** Supply Run should still be recognisably the same painted-storybook universe as PTV. It's the same vehicle on the same road in the same town, just with the volume turned up — kid-fun loud, not sci-fi loud.

### Supply Run music: heavy metal

Marcus's note (2026-04-24): *"supply run music probably needs to be more in the heavy metal genre (Lily loves Metallica!) and that works well for pulse-raising chaos-creating motor madness"*.

Overrides the original verbatim spec's "energetic rock / electronic / funk" line — heavy metal with no vocals (per existing no-vocals rule) is the target. When regenerating the Supply Run music loop with Manus, brief for **Metallica-style driving metal, instrumental, no vocals, 40–60s seamless loop**. Chugging rhythm guitar, double-bass drums, melodic lead lines; kid-friendly energy but NOT watered-down — Lily can handle real metal energy.

---

## References

- [`crate-stacking.ts`](../packages/game-logic/src/crate-stacking.ts) — engine + 32 unit tests in `__tests__/crate-stacking.test.ts`.
- [`destinations.ts`](../packages/game-logic/src/destinations.ts) — rewild habitat lookup.
- [`driving-systems.md`](driving-systems.md) — how PTV / Supply Runs / Depot fit together.
- [`extracted-driving-spec.md`](extracted-driving-spec.md) — original Supply Run + Depot spec reconstruction.
