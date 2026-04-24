# Extracted Driving/Depot Spec — from session `81fbb806…`

> **⚠ SUPERSEDED** by the verbatim recovery at [`original-depot-supply-spec.md`](original-depot-supply-spec.md). That file is Marcus's original text, captured from a queue-enqueue entry on 2026-04-13. This file is a **secondary** reconstruction from implementation code + plan summaries — kept as a correlation reference between the spec and the shipped code, not as the source of truth.

---

**Important note on provenance.** This file was written before the verbatim spec was recovered. The original user-pasted spec ("A.R.C. — The Depot & Supply Run System") was thought to be in a session that was **context-compacted before this transcript begins**. What survives in this transcript are:

1. The **continuation-summary** at line 2219 that references the spec.
2. The **approved plan** `/Users/marcus/.claude/plans/ticklish-sprouting-wave.md` (lines 2136, 2148, 2164, 2165, 3712) — this is the distilled, approved version of the spec.
3. The **agent-dispatch prompts** the assistant wrote to kick off implementation — these re-state spec details concisely with direct quotes.
4. The **implemented code files** (supply-runs.ts, depot-inventory.ts, DepotScene.ts, SupplyRunScene.ts, shared-types) which encode the spec as data.
5. An **implementation summary** at line 2322.

**No verbatim spec titled "A.R.C. — The Depot & Supply Run System" appears in this transcript.** Nothing labelled "PTV" (Pet Transport Vehicle) appears — see gaps section at bottom. The phrases "chaos-outlet", "Hall of Fame", and "Pet Transport Vehicle" appear only incidentally in plan docs, not the user's own words.

Below is everything relevant, quoted as literally as the transcript preserves it.

---

## 1. Supply Runs — definition & tonal intent

From the assistant's agent-dispatch prompt (line 2203, paraphrasing the user's original spec directly):

> Supply Runs are **cargo-free drives** — the player drives fast, smashes through obstacles, earns money. It's a **deliberate tonal shift** from the gentle care gameplay.

From the header comment of the implemented `supply-runs.ts` (line 2254, user-pasted code):

```ts
// ── Supply Run System ────────────────────────────────────────
// Supply Runs are cargo-free drives — the player drives fast,
// smashes through obstacles, earns money. A deliberate tonal
// shift from the gentle care gameplay.
```

### Destinations (3 total)

| destination | label | emoji | description | distance | basePay | unlockLevel | obstacleFreq | trafficDensity |
|---|---|---|---|---|---|---|---|---|
| `bramble_farm` | Bramble Farm Supplies | 🌾 | Hay, straw, feed, and bedding for the animals | 100 | 50 | 0 | 0.3 | 0.2 |
| `cove_harbour` | Cove Harbour Fish Market | 🐟 | Fresh fish for cats, foxes, and bats | 150 | 75 | 5 | 0.4 | 0.3 |
| `pinebark_medical` | Pinebark Medical Wholesale | 💊 | Bandages, medicines, and equipment | 200 | 120 | 10 | 0.5 | 0.4 |

### Obstacles (8 types)

| type | emoji | damageOnHit | smashable | scoreOnSmash |
|---|---|---|---|---|
| cardboard_boxes | 📦 | 2 | yes | 10 |
| traffic_cones | 🪧 | 3 | yes | 15 |
| hay_bales | 🌾 | 5 | yes | 20 |
| wooden_crates | 🧰 | 8 | yes | 30 |
| puddles | 💧 | 1 | no | 0 |
| oil_drums | 🛢️ | 12 | no | 0 |
| tyre_stacks | ⭕ | 6 | yes | 25 |
| barriers | 🚧 | 15 | no | 0 |

### Damage thresholds (progressive, feeds repair cost)

| type | threshold | severity | repairParts |
|---|---|---|---|
| scratches | 10 | cosmetic | `{ polish: 1 }` |
| dents | 20 | minor | `{ panel_filler: 1, polish: 1 }` |
| rattles | 35 | minor | `{ bolts: 2, wrench_kit: 1 }` |
| broken_lights | 45 | moderate | `{ bulb_set: 1, wiring: 1 }` |
| suspension | 60 | moderate | `{ spring_kit: 2, bolts: 4 }` |
| engine_trouble | 75 | major | `{ spark_plugs: 2, oil_can: 1, gasket: 1 }` |
| bodywork | 85 | major | `{ panel_filler: 3, welding_kit: 1, paint: 2 }` |
| total | 95 | catastrophic | `{ engine_rebuild: 1, chassis_parts: 4, welding_kit: 2, paint: 3 }` |

Catastrophic cutoff: `totalDamage > 90` → `outcome: 'totalled'`, earnings = 0.

### Controls (from SupplyRunScene.ts, line 2280)

- 3-lane road. Start in middle lane (lane = 1). Clamped 0–2.
- Keyboard: Left/A = steer left, Right/D = steer right, Space = smash.
- Touch: left/right/center screen zones.
- Lane change tween: 120ms Power2.
- Smash detection: obstacle in same lane within 60px of truck y-position. Smashable obstacles take 30 % of their normal damage when smashed.

### Rewards / bonuses

- Base pay per destination (see table).
- **Perfect Run (+50 %)** — 0 damage.
- **Cargo Intact (+25 %)** — < 20 total damage (and not perfect).
- **Time Trial Beat (+30 %)** — optional time-trial toggle; limit = `distance × 200 ms`.
- **Smash Spree (+20 %)** — 5+ obstacles destroyed.
- **Daily contract bonus** — first run of the day = 1.5× multiplier.
- **Sticker** — `speed_demon` awarded for perfect run with 3+ smashes.
- Totalled vehicle earns nothing (`"Vehicle Totalled - No Earnings"`).

### Visual / tonal design (SupplyRunScene)

- **Neon cyberpunk aesthetic** — deliberate tonal shift.
- Deep-dark bg, neon lane lines (`NEON.laneActive` accent), truck rendered as rounded rect + windshield + headlights + 🚛 label.
- HUD: destination label, distance progress bar, smashed counter (💥), damage % (green < 30, orange 30-60, red > 60).
- SFX: `obstacle_smash` on successful smash, score popup +N floating up.

### Hall of Fame leaderboard

Only a single mention, from the approved plan (line 2164, Phase 5):

> - Hall of Fame leaderboard (friend-scoped)
> - Supabase migration for `supply_run_records`

No detailed leaderboard mechanics appear. `SupplyRunsStats` persisted fields (shared-types, line 2255):

```ts
export interface SupplyRunsStats {
  totalRunsCompleted: number;
  runsPerDestination: Record<SupplyDestination, number>;
  totalEarnings: number;
  biggestSmash: number;       // highest single-run damage value
  fastestTimes: Record<SupplyDestination, number>;  // ms
}
```

---

## 2. The Depot — tap-to-collapse mini-game

From the plan (line 2164):

> **Phase 3: Tap-to-Collapse Engine (2-3 sessions)**
> - Grid representation (2D array of Tile)
> - Group detection (flood fill / BFS for adjacent same-type tiles)
> - Tap handler (remove group, apply gravity, refill from top)
> - Power-up creation (5+ → rocket, 7+ → bomb, 10+ → rainbow)
> - Power-up detonation and chain reactions
> - Board state serialization for mid-session persistence
> - Performance: 60fps during complex cascades

From the implementation summary (line 2322):

> **`depot-board.ts`** — Tap-to-collapse puzzle engine: BFS group detection, gravity cascade, board refill, power-ups (🚀 rocket at 5+, 💣 bomb at 7+, 🌈 rainbow at 10+), chain reactions up to depth 5.

### Four Depot modes

| Mode | Board | Unlock | Tiles |
|---|---|---|---|
| `parts_and_tools` | 9 × 9 | L1 | spanner, cog, nut, bolt, screwdriver, wire_coil |
| `treats_kitchen` | 8 × 8 | L1 | biscuit, cheese_cube, seed, pellet, crunchy, fish_flake |
| `decorations` | 10 × 8 | L1 | **season-dependent** (see below) |
| `medical_supplies` | 7 × 9 | L15 | bandage, pill, thermometer, ice_pack, splint, ointment |

Goal summaries (line 2164):

- Parts & Tools: clear X target tiles.
- Treats Kitchen: match target quantities per treat type, **super-treat drops**.
- Decorations: season-aware tile sets.
- Medical Supplies: gated behind level 15.

Max moves: 25 (from DepotScene.ts `this.maxMoves = 25`).

### Seasonal decoration tile sets (from depot-inventory.ts, line 2248)

- **spring_bloom**: daisy, butterfly, watering_can, egg_basket, birdhouse, rainbow
- **summer_warmth**: sunflower, beach_ball, ice_lolly, parasol, seashell, sandcastle
- **autumn_hush**: maple_leaf, acorn, pumpkin, toadstool, pine_cone, lantern
- **winter_cosy**: snowflake, bauble, candy_cane, woolly_hat, hot_cocoa, star

### Power-ups

- 🚀 **Rocket** — formed by clearing a group of 5+.
- 💣 **Bomb** — formed by clearing 7+.
- 🌈 **Rainbow** — formed by clearing 10+.
- Chain reactions up to depth 5.

Power-up visual config (DepotScene):
```ts
rocket:  { emoji: '🚀', colour: 0xff6b35 }
bomb:    { emoji: '💣', colour: 0xff4444 }
rainbow: { emoji: '🌈', colour: 0xaa55ff }
```

### Session economy

- **3 free sessions/day**, **earnable up to 10**.
- Runtime-configurable. Stored in `DepotState.sessionsRemainingToday` / `sessionsMaxToday`.
- Daily reset tied to `lastSessionDay` (YYYY-MM-DD).
- Append-only `depot_inventory_ledger` audit table.
- **Match-3-generated items CANNOT be gifted** (`giftable: false` on every RewardItem in the catalogue).

### Visual / tonal design (DepotScene)

- **Deep purple theme** — `bg: 0x2d1b4e`, `boardBg: 0x1a1030`, `cellBg: 0x3d2a5e`, `accent: 0xf0c040` (golden yellow).
- Mode-select → interactive tap-collapse board → rewards screen with animated star bursts.
- Title: 🏗️ The Depot.
- Mode labels:
  - 🔧 Parts & Tools — "Fix up the rescue van!"
  - 🍪 Treats Kitchen — "Bake tasty treats for animals!"
  - 🎨 Decorations — "Brighten up the centre!"
  - 🩹 Medical Supplies — "Stock up the vet clinic!"

### Reward rarity weights

```
common:    50
uncommon:  28
rare:      14
very_rare:  6
ultra_rare: 2
```

Reward count formula: `max(1, min(6, floor(score/500) + completedGoals))`. Bonus super-treat roll on high scores.

---

## 3. Super-Treats catalogue (all 13)

From depot-inventory.ts (line 2248), exact text preserved:

| code | emoji | label | rarity | description |
|---|---|---|---|---|
| rainbow_biscuit | 🌈 | Rainbow Biscuit | rare | A biscuit with every colour of the rainbow baked in. |
| sky_high_sausage | 🌭 | Sky-high Sausage | rare | A sausage so tall it nearly touches the clouds. |
| thunder_crunch | ⚡ | Thunder Crunch | rare | Crunch into this and hear a teeny tiny thunderclap! |
| hamster_hat | 🎩 | Hamster Hat | very_rare | A treat shaped like a tiny top hat. Adorable and tasty. |
| worry_wafer | 😌 | Worry Wafer | rare | Nibble one and your worries float away like bubbles. |
| grumble_gum | 😤 | Grumble Gum | rare | Chew this and all your grumbles turn into giggles. |
| the_biggest_biscuit | 🍪 | The Biggest Biscuit | very_rare | It is, in fact, the biggest biscuit anyone has ever seen. |
| silly_sardine | 🐟 | Silly Sardine | rare | A sardine that makes you do a silly dance after eating it. |
| sock_treat | 🧦 | Sock Treat | very_rare | Looks exactly like a sock but tastes like strawberries. |
| cloud_custard | ☁️ | Cloud Custard | rare | Fluffy custard scooped straight from a passing cloud. |
| bongo_bone | 🥁 | Bongo Bone | rare | A bone-shaped treat that plays a little drum beat when you bite. |
| infinity_kibble | ♾️ | Infinity Kibble | ultra_rare | One piece of kibble that never seems to run out. |
| secret_sprinkle | ✨ | Secret Sprinkle | ultra_rare | Nobody knows what flavour it is. Every animal tastes something different. |

Effect hook (from verification plan, line 2164):
> - E2E: earn Rainbow Biscuit → use on animal → bond meter fills instantly

All super-treats are `giftable: false`.

---

## 4. Seasonal calendar

From the agent-dispatch prompt (line 2205):

> The in-game calendar: **1 real-world week = 1 in-game month**. Seasons cycle every 3 in-game months (3 real weeks).

```
// 1 real day = ~4.3 in-game days (30 days / 7 real days)
// months 1-3 = spring_bloom, 4-6 = summer_warmth,
// 7-9 = autumn_hush, 10-12 = winter_cosy
```

`CalendarState`:
```ts
export interface CalendarState {
  gameStartedAt: string;
  currentInGameDate: { year: number; month: number; day: number };
  currentSeason: Season;
  activeEvents: string[];
  dayOfYear: number;
  lastRealDayChecked: string; // YYYY-MM-DD — for daily reset logic
}
```

Key helpers the spec names:
- `createCalendarState(gameStartedAt: string): CalendarState`
- `updateCalendar(state, now): CalendarState` — advances in-game date from real elapsed time
- `getCurrentSeason(inGameMonth): Season`
- `isDailyReset(state, now): boolean` — true if real-world day changed
- `getActiveEvents(state, now): string[]` — seasonal events, player birthday, etc.
- `SEASON_THEMES: Record<Season, { label, emoji, description }>`

Calendar ties:
- Decorations depot mode tile sets rotate with `currentSeason`.
- Daily session reset in Depot uses `lastRealDayChecked`.
- Seasonal events drive `activeEvents` array.
- Supabase table `calendar_events` holds event definitions.

---

## 5. PTV (Pet Transport Vehicle)

**NOT in this transcript.** The approved plan explicitly calls this out (line 2164):

> **Key Design Decisions**
> - **No PTV exists yet** — Supply Runs spec says "reuses PTV engine" but there's no driving engine. We need to build a basic driving engine from scratch, or defer Supply Runs until PTV is built.

> **Phase 5: Supply Run — Standalone Driving Engine (2-3 sessions)**
> Build a basic top-down driving minigame (no PTV dependency — standalone engine):
> …
> - When PTV is eventually built, this engine can be replaced/upgraded

So the original spec referenced a "PTV engine" that was **never documented in the surviving transcript** — the crate-loading / species-adjacency / happiness mechanics the caller is looking for are NOT here. They were in the compacted prior session.

---

## 6. Integration / progression / unlock rules (cross-system)

From the approved plan and agent prompts:

- **Depot items → vehicle repair**: Supply Run damage thresholds demand specific depot parts (polish, bolts, bulb_set, spark_plugs, welding_kit, etc.). Repair cost is computed per damage threshold accumulated.
- **Depot treats → main game bonding/training.** Super-treats have special effects on animals (e.g. Rainbow Biscuit fills bond meter instantly).
- **Depot medical supplies → self-heal vet.**
- **Depot decorations → Centre customisation** (seasonal).
- **Supply Runs earn coins** — only currency in the game.
- **Currency**: `Economy.coins` (+ `lifetimeEarnings` never-decreasing).
- **Level gates**:
  - Bramble Farm: L0 (start)
  - Cove Harbour: L5
  - Pinebark Medical: L10
  - Medical Supplies depot mode: L15
- **No real-money purchases anywhere** — verification plan explicitly asserts this.
- **Focus Mode** (accessibility): reduces particle count, animation speed, tile size across all scenes.
- **Gifting restrictions**: any item generated by the tap-to-collapse puzzle has `giftable: false`. Needs a `source` field on inventory items.
- **Ledger pattern**: append-only `depot_inventory_ledger` for economy auditing.
- **21 new badges**: 11 depot + 10 supply run.
- **~220 new assets** planned (tile sets, depot building, supply HUD, obstacles, damage overlays, stickers).
- **New audio scenes**: `depot` (energetic but focused), `supply_run` (high-energy), ~10 new SFX (tap, collapse, power-up, truck, smash, etc.).

Supabase tables (migration `00003_depot_supply.sql`):
- `depot_sessions` — session tracking
- `supply_run_records` — run history
- `calendar_events` — seasonal event definitions
- `depot_inventory_ledger` — append-only audit trail

---

## 7. Verification plan (from line 2164)

### Depot
- Unit tests: group detection (BFS), gravity invariant (no floating tiles), power-up thresholds (5/7/10+).
- Property tests: 1000 random boards — all invariants hold after tap+gravity+refill.
- Session economy: daily reset at in-game day boundary, cap at 10 sessions.
- Inventory ledger: every add/subtract has matching ledger entry with correct balance.
- Performance: 60fps during 10+ cascade chain on 10×8 board.
- E2E: start depot session → make moves → close game → resume exactly where left off.

### Supply Runs
- Unit tests: damage accumulation per obstacle type, pay rate calculation, time trial bonus.
- **Verify stress code paths fully absent (no phantom animal stress).** ← confirms the cargo-free / stress-outlet intent.
- E2E: complete supply run → earn money → check balance → repair vehicle with depot parts.

### Integration
- E2E: damage vehicle → earn parts in depot → repair → drive again.
- E2E: earn Rainbow Biscuit → use on animal → bond meter fills instantly.
- Economy check: 100-session simulation produces sane totals (no runaway inflation).
- No real-money purchase code paths exist anywhere.

---

## Gaps / ambiguities

1. **PTV spec is missing entirely.** No crate loading, no species adjacency rules, no happiness-during-transport mechanics appear anywhere in this transcript. The plan treats PTV as a future/unbuilt system; the Supply Run engine was explicitly built as a standalone driving engine that could later be merged with / replaced by PTV.
2. **"Chaos-outlet" phrasing** is my shorthand — it does not appear verbatim. The transcript does confirm the intent via the phrases "cargo-free drives", "deliberate tonal shift from the gentle care gameplay", and the verification test "no phantom animal stress".
3. **Hall of Fame** — mentioned in a single line of the plan as "friend-scoped leaderboard" with Supabase table `supply_run_records`. No UI mock or ranking formula survives.
4. **Tap-to-collapse vs match-3**: the implementation is clearly BFS group-detection (tap a group of same-type tiles to collapse them), not 3-in-a-row match-3. Plan docs and the verification plan sometimes loosely say "match-3-generated items"; treat that as sloppy shorthand — the actual mechanic is tap-to-collapse.
5. **Super-treat effects** are only specified for Rainbow Biscuit ("bond meter fills instantly"). The other 12 are descriptive-only in the catalogue — gameplay effects are TBD.
6. **Calendar events** — `activeEvents: string[]` is defined, but what events exist (beyond "player birthday, seasonal events") is not specified.
7. **"Seasonal content rotation"** beyond decoration tile sets is not defined.
8. The user's own original spec text, titled something like "A.R.C. — The Depot & Supply Run System", existed in the pre-compaction session and is **not recoverable from this transcript**. If you have the original Notion/markdown source, prefer that over this file.

---

## Source references (this transcript)

- `/Users/marcus/.claude/projects/-Users-marcus-Projects-animal-rescue-centre/81fbb806-d505-4eaa-8fe9-03d4cf186e3c.jsonl`
  - Line 2118 — first assistant acknowledgement of the (pre-compaction) spec.
  - Lines 2136, 2148, 2164, 2165, 3712 — approved plan `ticklish-sprouting-wave.md`.
  - Lines 2203, 2205 — agent-dispatch prompts (calendar + depot-inventory briefs).
  - Line 2219 — post-compaction summary confirming spec was pasted earlier.
  - Line 2248 — full `depot-inventory.ts` source (tiles, rewards, all 13 super-treats).
  - Line 2254 — full `supply-runs.ts` source (destinations, obstacles, damage, rewards).
  - Line 2255 — shared-types definitions.
  - Line 2280 — full `DepotScene.ts` source.
  - Line 2282 — full `SupplyRunScene.ts` source.
  - Line 2322 — "committed & deployed" implementation summary.
- `/Users/marcus/.claude/plans/ticklish-sprouting-wave.md` — the surviving canonical plan doc.
