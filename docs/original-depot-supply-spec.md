# Original Depot & Supply Run Spec — verbatim extractions

Extracted from Claude Code session JSONL history. These are messages Marcus typed into the Claude Code input box, captured verbatim from the session logs. Chronological order.

**Note:** `queue-enqueue` means the text was typed into the input box while Claude was still working and got queued. It is the raw user input exactly as typed.

---

## Extraction #1

- **Timestamp:** 2026-04-13T07:41:20.718Z
- **Source file:** `/Users/marcus/.claude/projects/-Users-marcus-Projects-animal-rescue-centre/81fbb806-d505-4eaa-8fe9-03d4cf186e3c.jsonl`
- **Line:** 2029
- **Kind:** `queue-enqueue`
- **Length:** 28427 chars
- **Keyword hits (15):** depot, supply run, super-treat, tap-to-collapse, rainbow biscuit, bongo bone, infinity kibble, sock treat, sky-high sausage, thunder crunch, hamster hat, bramble farm, cove harbour, pinebark medical, ptv

### Verbatim text

````markdown
we have a new spec for a driving game also. You will need to plan this one!

# A.R.C. — The Depot & Supply Run System
## Standalone Feature Specification

*Companion document to ARC_spec_v2.md and ARC_PTV_spec.md. Covers two interconnected systems: the tap-to-collapse mini-game ("The Depot") and the cargo-free chaos-drive mode ("Supply Runs"). Together they form the player's economic and emotional-regulation backbone.*

---

## 1. Purpose & Design Intent

These two systems share a single underlying design philosophy: **a care-sim game needs escape valves.** Constant mindful behaviour is exhausting, especially for neurodivergent players. The Depot and Supply Runs give players sanctioned, narratively justified ways to be chaotic, fast, or simply mindless without breaking the game's ethical spine.

**The Depot** is a tap-to-collapse mini-game available any time at the Rescue Centre. Low-stakes, pattern-matching, satisfying. Generates in-game resources (tools, parts, treats, decorations, later medical supplies). Doubles as a self-regulation tool.

**Supply Runs** are cargo-free drives for Bramble Farm Supplies, Pinebark Medical Wholesale, or Cove Harbour Fish Market. No animal stress meter. No speed limits enforced. Drive like a maniac, take damage, earn money, feel great.

Neither system requires the main care loop to progress. Both integrate with it.

**Important framing correction from original design:** Supply Runs are *not* a penalty for poor animal care. They are a always-available alternative income source with their own loyal fanbase. Framing them as penalties would perversely incentivise players to stress animals in order to unlock them. Instead: supply runs are a respected trade, the vet clinics genuinely need the stock, and kids who enjoy driving can make a career of it.

---

## 2. Integration with Existing Codebase

| Existing system | New interaction |
|---|---|
| PTV system | Supply Run is a new drive mode, uses same vehicle + road infrastructure, swaps cargo puzzle for inventory receipt, hides stress HUD |
| Economy | Depot generates items; supply runs generate cash; both are additional economy sources |
| Vehicle damage | Repair costs met by Depot parts + tools rather than cash sinks |
| Badge system | New badge packs for Depot mastery + supply run achievements |
| In-game calendar | New subsystem — drives seasonal Depot modes |
| Leaderboards | New board: Supply Run Hall of Fame |
| Assets | Modest asset additions for Depot tile sets + supply run UI reskin |

**No breaking changes** to existing schema.

---

## 3. The Depot (Tap-to-Collapse Mini-Game)

### 3.1 Location & Framing

The Depot is a physical building in the A.R.C. grounds, unlocked from game start. Visually: a shed-turned-workshop with crates stacked inside, accessed via a side path from the main Centre. Entering shows a clipboard showing available modes plus current session allowance.

### 3.2 Core Mechanic

**Tap-to-collapse** (Toon Blast / Blast Puzzle style), not classic swap-to-match.

- Board is a grid of coloured/themed tiles
- Tap any group of 2+ adjacent tiles of the same type
- Group disappears, tiles above fall down, new tiles drop from top
- Groups of 5+ create a **rocket** (clears a row or column)
- Groups of 7+ create a **bomb** (clears 3×3 area)
- Groups of 10+ create a **rainbow** (clears all tiles of one type on board)
- Combining two power-ups creates bigger effects

**Rationale for tap-to-collapse over swap-match:**
- Simpler motor control (better for 8yo and for ADHD precision issues)
- Touch-native (no awkward swap gestures on iPad)
- More forgiving (no "you made an illegal move" frustration)
- Less cognitively loaded (find groups, not plan swaps)

### 3.3 Session Economy

**3 free sessions per in-game day.** Sessions persist board state if abandoned mid-way; you resume exactly where you left off. This matters for ADHD regulation: no pressure to finish in one sitting.

**No paid top-ups. Ever.** Extra sessions earnable via:
- Completing animal care streaks (feed all animals in a day → +1 session)
- Successful vet deliveries (peaceful outcome → +1 session chance, 30%)
- Daily login bonus (+1 session)
- Badges (milestone badges sometimes award +permanent session limit)

Maximum session cap: 10/day. This prevents extreme grinding while leaving room for committed players.

**Why this matters:** real-money microtransactions are non-negotiable-no for a children's game. Session limits must feel generous, not predatory. Current limits are a starting point; Claude Code should make them runtime-configurable for easy tuning.

### 3.4 Modes

Each mode has distinct tile sets + goal structure. Mode selected at Depot entrance.

#### Mode 1: Parts & Tools Workshop (unlocked from start)
- Tile set: spanners, cogs, nuts, bolts, screwdrivers, wire coils, oil cans
- Goal types: clear X target tiles, drop target items to bottom, clear obstacles
- Rewards: repair parts, toolbox items, metal scraps, fuel cans
- Used for: vehicle repairs (main sink), Centre building maintenance

#### Mode 2: Treats Kitchen (unlocked from start)
- Tile set: biscuits, cheese cubes, seeds, pellets, crunchies, fish flakes, fruit pieces
- Goal types: match target quantities per treat type
- Rewards: species-appropriate treats, super-treats (see §3.6), training treats
- Used for: training sessions, bonding boosts, gift items for friends (non-match-3-origin treats only transferable; match-3 treats are locked to owner — see §3.7)

#### Mode 3: Decorations Workshop (unlocked from start, content varies by season)
- Tile set: rotates with in-game season
- Goal types: collect set numbers per decoration type, build complete sets
- Rewards: decorative items for Centre rooms, garden, vehicle interior; seasonal limited items
- Used for: cosmetic Centre customisation; some items grant minor ambient bonuses (e.g., cosy blanket collection → slight tiredness reduction in that room — very modest effects only)

#### Mode 4: Medical Supplies Bay (unlocks at level 15)
- Tile set: bandages, pills, syringes, thermometers, ice packs, splints, eye drops, ointment
- Goal types: fulfil medical orders (e.g., "collect 5 bandages and 3 splints this session")
- Rewards: self-heal vet kit items (reduces need for Greystone/Haven vet trips for minor issues)
- Used for: treating animals in the Centre without a vet drive; significantly expands player's vet-skill autonomy

### 3.5 Seasonal Calendar (In-Game)

A.R.C. operates an in-game calendar: **1 real-world week = 1 in-game month.** Seasons cycle:

| In-game season | Real-world duration | Decorations Workshop theme | Special tiles |
|---|---|---|---|
| Spring Bloom | 3 weeks | Flower garlands, pastel bunting | Daffodils, bluebells, seedlings |
| Summer Warmth | 3 weeks | Sun-shades, picnic blankets, bird feeders | Suns, butterflies, ice lollies |
| Autumn Hush | 3 weeks | Lanterns, woven wreaths, acorn baskets | Leaves, pumpkins, conkers |
| Winter Cosy | 3 weeks | Fairy lights, knitted throws, snow globes | Snowflakes, hot cocoa, stars |

Plus **four week-long events per year** (real-world anchored where it makes sense):
- Animal Adoption Week (in-game Spring)
- Rescue Anniversary (player's account creation date + 1 year)
- Winter Giving (late Winter Cosy)
- Player Birthday (optional; requires parent to set date)

Event weeks: the Decorations mode features exclusive tiles and limited-availability decorations.

### 3.6 Super-Treats & Power Items

From the Treats Kitchen, rare drops:

| Item | Effect | Rarity |
|---|---|---|
| **Rainbow Biscuit** | Instantly fills bond meter on one animal | Very rare |
| **Sky-high Sausage** | Makes any dog do a 2-metre jump of joy. Purely decorative. | Rare |
| **Thunder Crunch** | Next walk: no road-crossing prompt misses count against you | Uncommon |
| **Hamster Hat** | Turns any animal's cage into a tiny hat shop for 30 seconds. Cosmetic only. | Rare |
| **Worry Wafer** | Halves one animal's stress immediately | Uncommon |
| **Grumble Gum** | Makes a grumpy animal purr-grumble for an hour. Doesn't help anything. Lily will love this. | Common |
| **The Biggest Biscuit** | It's just a very big biscuit. Animals stare at it in awe. Takes three days to eat. | Ultra rare |
| **Silly Sardine** | Cats go briefly bananas in a cute way. No other effect. | Uncommon |
| **Sock Treat** | It's actually a sock. No one knows why it's here. Parrots love it. | Common |
| **Cloud Custard** | Animal floats 5cm off the ground for 10 seconds. Can't do anything useful with this. | Rare |
| **Bongo Bone** | One dog will drum on things for an hour. Delightful, useless. | Uncommon |
| **Infinity Kibble** | Never runs out. Goes up in dramatic sparkles when finally eaten after a full week. | Very rare |
| **Secret Sprinkle** | A mystery. Sprinkle it on an animal and something happens. You'll have to find out. | Rare |

These are deliberately a mix of useful (Rainbow Biscuit, Worry Wafer) and pure silly (Sock Treat, Sky-high Sausage). The silly ones matter more than the useful ones for the game's soul.

### 3.7 Gifting Restrictions

**Match-3-generated items CANNOT be gifted to friends.** Rationale: preventing grind-and-dump economy where one player mass-produces treats and gifts them to empty their inventory.

Friends can still gift each other:
- Standard treats purchased from shop
- Standard decorations from main game progression
- Rescue milestone items

This keeps the gifting economy healthy and makes friends-gifts feel chosen rather than dumped.

### 3.8 Depot Board State Design

Board sizes by mode:
- Parts & Tools: 9×9
- Treats Kitchen: 8×8
- Decorations: 10×8 (wider for decorative tile variety)
- Medical: 7×9 (tighter, more tactical)

Tile variety per board: 5-6 base types + 1-2 special tiles (obstacles, goal tiles, power-ups in-progress).

**Difficulty scaling:** boards get subtly harder as player levels up, but never cruel. No timer. No move limit by default.

**Optional "Focus Mode":** accessible via settings — slower animations, reduced visual particles, larger tiles. For players who find standard mode overstimulating. Not a difficulty setting; just a sensory-load setting.

---

## 4. Supply Run Mode (Chaos Drive)

### 4.1 Framing

Three supply destinations, all legitimate businesses that need stock delivered regularly:

| Destination | Supplies | Pay rate | Unlock |
|---|---|---|---|
| **Bramble Farm Supplies** | Hay, straw, feed, bedding | Medium | Start |
| **Pinebark Medical Wholesale** | Bandages, medicines, equipment | High | Level 10 |
| **Cove Harbour Fish Market** | Fish for carnivore diets | Medium-high | Level 5 |

Player is hired on a per-run basis. No animals, ever. Empty cargo area on outbound; crates on return (cosmetic — no cargo mechanic).

### 4.2 Tonal Shift

Complete tonal break from main PTV gameplay:

| Element | PTV (care mode) | Supply Run (chaos mode) |
|---|---|---|
| Music | Gentle, situational | Energetic rock/electronic/funk (no vocals) |
| HUD colour | Warm pastels | High-contrast neon |
| Stress meter | Present, central | **Removed entirely** |
| Speed limits | Enforced via stress | No enforcement |
| Road surface effects | Stress penalty | Damage accumulation only (visual/mechanical) |
| Weather | Tactical concern | Atmospheric only (rain looks cool) |
| Obstacles | Avoided carefully | Smash through cardboard boxes, traffic cones, hay bales |
| Environment | Country lanes, villages | Industrial zones, ring roads, port areas, back-lot shortcuts |
| Dashboard banner | None | "SUPPLY RUN" in bold neon |

**Lily's words:** "complete tonal shift" — so commit to it. Players should feel like they've entered a different game for 5 minutes and then return refreshed.

### 4.3 Mechanics

**The drive itself:**
- Full PTV driving engine reused
- All stress/animal-event code paths disabled
- Road surface effects still apply to damage accumulation
- Collision damage still applied (see §4.4)
- Weather affects visibility only, not stress
- Traffic present but more aggressive / more fun to weave through
- Shortcuts and off-road sections exist (rewarded, can't do in care mode)

**Time pressure (optional, unlocked by preference):**
- Pure time trial mode available: beat the clock for bonus pay
- Off by default — for players who find time pressure unpleasant
- Toggleable per-run

**Damage philosophy:**
- Vehicle takes visible damage (dents, scratches, rattles)
- Damage is mechanical — affects handling in current run but not after repair
- **Catastrophic damage** (driving into a wall at full speed, etc.) can cause mission failure: vehicle totals, pay reduced to 30%, tow home required
- Regular rough driving: accepted, just costs Depot parts to repair after
- No penalty beyond repair cost + possible mission pay reduction

### 4.4 Damage Types & Repair Resources

Damage categorisation — mapped to Depot resources needed for repair:

| Damage | Trigger | Repair resource | Severity |
|---|---|---|---|
| Scratches | Grazing obstacles | Paint + buffer | Cosmetic |
| Dents | Minor collisions | Panel + hammer | Minor |
| Rattles | Persistent rough roads | Nuts & bolts + spanner | Minor |
| Broken lights | Collisions | New light unit + wiring | Moderate |
| Suspension damage | Pothole mastery | Suspension parts + jack | Moderate |
| Engine trouble | Long fast driving + no cooling | Engine parts + toolkit | Major |
| Bodywork damage | Significant crashes | Panels + welder + paint | Major |
| Total | Wall/cliff/head-on | Full rebuild + toolkit | Catastrophic |

Damage visible on vehicle model in garage. Fixing restores visual + mechanical. Players can *choose* not to fix cosmetic damage (some wear the scars proudly).

### 4.5 Rewards

**Per run:**
- Base pay (varies by destination)
- Time bonus (if time trial mode on and beaten)
- Cargo-intact bonus (if return cargo undamaged — this re-introduces *very mild* incentive to drive well, but failure is still fun)
- Possible sticker drops (some stickers only earned in supply mode — "Road Rage Rainbow," "Hay Bale Hero," etc.)

**Daily supply contract bonus:** first supply run of each in-game day pays 1.5×. Gentle encouragement to make it part of routine.

**Weekly supply champion:** most supply runs completed in a week earns a time-limited sticker. Competitive players will want it; others can ignore.

### 4.6 Supply Run Hall of Fame

Friend-scoped leaderboard, separate tab from main leaderboards.

Categories:
- **Most Runs This Week** (weekly reset)
- **Biggest Smash** (most damage taken in a single run)
- **Cleanest Dirty Run** (most obstacles destroyed with least damage to vehicle)
- **Speed Demon** (fastest delivery time per destination)
- **The Collector** (most supply-run-exclusive stickers)
- **Repair Bill of Shame** (highest repair costs in a week — yes, this one's a joke, but kids love it)

All leaderboards friend-scoped. Never global. No usernames visible to non-friends.

---

## 5. Data Model Additions

```typescript
// Extends GameState
interface GameState {
  // ...existing fields
  depot: DepotState;
  supplyRuns: SupplyRunsState;
  calendar: CalendarState;
}

interface DepotState {
  sessionsRemainingToday: number;
  sessionsMaxToday: number;         // Default 3, earnable up to 10
  lastSessionDay: string;           // YYYY-MM-DD for reset logic
  activeBoardStates: {
    partsAndTools?: BoardState;
    treatsKitchen?: BoardState;
    decorations?: BoardState;
    medicalSupplies?: BoardState;
  };
  totalSessionsPlayed: number;
  inventory: DepotInventory;
}

interface BoardState {
  grid: Tile[][];                   // persisted for resume
  startedAt: timestamptz;
  moves: number;
  score: number;
  goals: Goal[];
  isComplete: boolean;
}

interface DepotInventory {
  parts: Record<PartCode, number>;
  tools: Record<ToolCode, number>;
  treats: Record<TreatCode, number>;
  superTreats: Record<SuperTreatCode, number>;
  decorations: Record<DecorationCode, number>;
  medicalSupplies: Record<MedicalCode, number>;
}

interface SupplyRunsState {
  totalRunsCompleted: number;
  runsPerDestination: Record<SupplyDestination, number>;
  totalEarnings: number;
  biggestSmash: { runId: string; damageValue: number };
  fastestTimes: Record<SupplyDestination, number>;
  supplyOnlyStickersEarned: string[];
}

interface CalendarState {
  gameStartedAt: timestamptz;
  currentInGameDate: { year: number; month: number; day: number };
  currentSeason: 'spring_bloom' | 'summer_warmth' | 'autumn_hush' | 'winter_cosy';
  activeEvents: string[];
  timeToNextSeason: number;         // days
}
```

### Supabase tables

```sql
create table depot_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users on delete cascade,
  mode text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  completed boolean default false,
  score int,
  rewards jsonb,
  board_final_state jsonb
);

create table supply_run_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users on delete cascade,
  destination text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  earnings numeric,
  damage_taken numeric,
  time_taken_seconds int,
  obstacles_destroyed int,
  outcome text,
  time_trial_mode boolean default false
);

create table calendar_events (
  event_code text primary key,
  display_name text not null,
  description text,
  season_association text,
  start_rule jsonb not null,
  duration_days int not null
);

create table depot_inventory_ledger (
  id bigserial primary key,
  user_id uuid references users on delete cascade,
  item_code text not null,
  change int not null,
  source text not null,
  balance_after int,
  created_at timestamptz default now()
);
```

RLS: all user tables readable/writable only by owner. Catalogue tables public-read.

**Why the ledger?** Depot inventory changes often. An append-only ledger lets us audit economy balance, detect bugs early (negative balances), and replay history if we ever need to rebalance. For a children's game, this is overkill; but economy bugs are easy to ship, and this pattern makes them trivially debuggable.

---

## 6. Art Direction Additions

**Depot style prompt addendum:**
> *"[main style prompt], Depot interior is a cluttered-but-cosy workshop shed, wooden walls, tools hanging on pegboards, crates stacked with visible labels, afternoon light through a dusty window, warm and inviting."*

**Supply Run style prompt addendum:**
> *"[main style prompt], supply run environments shift to industrial warmth — red-brick warehouses, harbour cranes in the distance, back-lots with puddles, the occasional spray of graffiti rendered as children's-book-friendly colourful shapes, chunkier road markings, lots of cardboard boxes stacked everywhere."*

**Asset estimates:**

**Depot:**
- 4 mode entry illustrations
- Tile sets: 6-8 tiles per mode × 4 modes = ~30 base tiles + power-up variants (~15)
- Board frame + UI chrome (~10)
- Super-treat illustrations (~15)
- Decoration items for placement (~40, varies by season)
- Depot building exterior + interior = 2 scenes

**Supply Run:**
- 3 destination exteriors + loading bays = 6
- Industrial road scenery tiles (~20)
- Smashable obstacles (cardboard boxes, cones, hay bales, crates) = 8
- Neon HUD reskin = 12 UI elements
- Damage overlay sprites for each vehicle = 6 × 6 vehicles = 36
- Supply-exclusive stickers = 15

**Approximate total: 220 new assets** for both systems together.

---

## 7. Build Phases & Test Gates

This module builds on a working A.R.C. with PTV. Phased as follows:

### Depot Phase A: Calendar + Depot Foundations
- Calendar system (server-authoritative date logic)
- Season transitions
- Depot scene shell
- Mode selection UI
- Session economy logic
- Inventory ledger tables

**Gate A:**
- Unit tests: calendar rollover, season calculation, session reset at day boundary
- RLS tests for new tables
- Integration: session counts persist correctly across logouts

### Depot Phase B: Tap-to-Collapse Engine
- Core board logic (grid, taps, group detection, gravity, refill)
- Power-up creation and detonation
- Board state persistence mid-session
- Placeholder tiles (coloured squares)

**Gate B:**
- Extensive unit tests: group detection, cascade resolution, power-up rules — this is where bugs hide
- Property-based testing for gravity/refill invariants
- Performance: 60fps during complex cascades on iPad
- E2E: start a session, make moves, close game, resume

### Depot Phase C: All Four Modes
- Parts & Tools mode with reward catalogue
- Treats Kitchen mode with super-treat drops
- Decorations mode with season awareness
- Medical Supplies mode (gated behind level 15)

**Gate C:**
- Unit tests: reward distribution matches expected probabilities
- Integration: rewards correctly added to inventory, ledger entries correct
- Balance check: 100-session simulation produces sane inventory totals

### Depot Phase D: Art Pass + Super-Treats
- Manus asset generation (tile sets, super-treats, UI)
- Sensory/accessibility "Focus Mode" setting
- Animation polish
- Audio: satisfying tap/collapse/power-up sounds

**Gate D:**
- Visual regression baselines
- Audio balance review
- Accessibility audit: Focus Mode reduces particle count + animation complexity correctly

### Supply Run Phase A: Cargo-Free Drive Mode
- Supply Run scene launcher at Centre
- PTV engine reused with stress paths disabled
- Damage tracking system
- Three destinations navigable
- Temporary HUD reskin

**Gate A:**
- Unit tests: damage accumulation logic per obstacle/collision type
- Verify stress code paths are fully bypassed (no phantom stress updates)
- E2E: complete a supply run end-to-end

### Supply Run Phase B: Tonal Shift Polish
- Full neon HUD
- Music swap on mode entry/exit
- Environment assets (industrial zones)
- Smashable obstacle variety
- Banner animations

**Gate B:**
- Visual regression
- Audio: verify music crossfades between modes, no overlap bleed
- Playtesting: does the mode *feel* different? Lily sign-off required.

### Supply Run Phase C: Economy + Hall of Fame
- Pay rates + daily/weekly bonuses
- Supply-exclusive sticker drops
- Hall of Fame leaderboard queries + UI
- Damage-to-Depot-part mapping for repairs

**Gate C:**
- Integration: earnings correctly banked, leaderboards populated
- Balance check: supply runs economically viable vs main game but not dominant

### Integration Phase: Cross-System Wiring
- Depot-generated parts flow into PTV vehicle repair
- Depot-generated treats flow into main game training + bonding
- Depot-generated medical supplies flow into self-heal vet system
- Depot-generated decorations flow into Centre customisation scene

**Gate I:**
- E2E: damage vehicle on supply run → go to Depot → earn parts → repair vehicle → drive again
- E2E: earn Rainbow Biscuit → use on animal → bond meter fills
- Balance check: no resource starvation or runaway inflation

---

## 8. Badges Added by This Module

### Depot badges

| Code | Name | Criterion |
|---|---|---|
| `first_depot` | Apprentice Sorter | Complete your first Depot session |
| `depot_regular` | Depot Regular | 50 sessions completed |
| `depot_master` | Depot Master | 500 sessions completed |
| `super_treat_first` | Something Special | Earn your first super-treat |
| `infinity_kibble` | The Forever Snack | Earn the Infinity Kibble |
| `decoration_collector` | Interior Designer | Collect 50 decorations |
| `seasonal_completionist` | Four Seasons | Collect a complete decoration set from every season |
| `rainbow_power` | Rainbow Power | Create 10 rainbow-tier power-ups |
| `medical_graduate` | Medical Graduate | Unlock Medical Supplies mode |
| `self_heal_hero` | Home Healer | Treat 10 animals using self-heal kits |
| `silly_sardine_enjoyer` | Cat Chaos Curator | Feed a Silly Sardine to every cat you've rescued |

### Supply Run badges

| Code | Name | Criterion |
|---|---|---|
| `first_supply` | Delivery Debut | Complete your first supply run |
| `bramble_regular` | Bramble Regular | 25 runs to Bramble Farm |
| `pinebark_regular` | Medical Courier | 25 runs to Pinebark |
| `harbour_regular` | Salt & Scales | 25 runs to Cove Harbour |
| `hay_bale_hero` | Hay Bale Hero | Smash 100 hay bales |
| `road_rage_rainbow` | Road Rage Rainbow | Take catastrophic damage and still complete the run |
| `wheels_of_steel` | Wheels of Steel | 10 supply runs with zero damage taken |
| `mixed_life` | Balanced Life | 50 care deliveries + 50 supply runs |
| `biggest_smash` | Biggest Smash | Top Biggest Smash weekly board once |
| `speed_demon` | Speed Demon | Top Speed Demon weekly board once |

---

## 9. Design Notes & Principles

### On the match-3 as emotional regulation

The Depot serves a purpose beyond economy. For an ADHD/autistic player, having a predictable, low-stakes, exit-at-any-time activity inside the game matters. When Lily is dysregulated, the Depot is a place she can *be* without needing to care about anything complex. This is a feature, not an accident.

Claude Code should preserve this property throughout development:
- No lose state
- No timer (except optional time trial)
- No punishment for slow play
- Resume-anywhere state persistence
- Focus Mode available

### On supply runs as catharsis

Kids need permission to be chaotic. The genius of your design is that chaos is framed as *work* — it's a job, and you're paid for it. No shame, no penalty vibe. A player having a tough day can clock in for 5 minutes of smashing cardboard boxes and clock out feeling better.

This must be preserved against any future pressure to "balance" the mode. Supply runs should *always* be an option, *always* pay reasonably, *never* feel like a punishment path.

### On economy philosophy

Four income streams:
1. Care deliveries (main PTV) — primary income
2. Supply runs — secondary income, emotional regulation
3. Depot (sells some items shop-ward) — tertiary, slow
4. Gift economy (reciprocal) — social

No one path should dominate. Claude Code should monitor balance via the ledger tables and surface imbalance reports in the admin panel.

### On cosmetic-only progression

Reiterating from the PTV spec: no item earned from any system provides stat boosts to the main care loop. Decorations grant atmospheric-scale ambient effects only (a cosy blanket reduces tiredness *slightly* in that one room). Super-treats have small effects or no effects. This is intentional. The second stat-boosts enter, the game becomes about optimising numbers rather than caring for animals, and Lily's original emotional design is lost.

---

## 10. Open Questions for Lily (non-blocking)

- Music genre for Supply Runs — punk, funk, electronic, something else?
- More super-treats needed — she'll have better ideas than I do
- Seasonal event naming — does she want to co-design the four anniversary events?
- Depot building name — is "The Depot" right, or something more fun?
- Supply destination names — are Bramble Farm / Pinebark / Cove Harbour okay, or should she rename them?
- Should there be a "junk drawer" mode in the Depot — no goals, just clear tiles for the satisfaction of it? (I'd say yes. Pure zen mode.)
- Supply vehicles — same fleet as care mode, or does she want a separate scruffier fleet for supply runs?

---

## 11. Integration Checklist for Claude Code

When this spec is given to Claude Code against an existing A.R.C. + PTV build:

1. Read both prior specs + existing codebase. Understand what's in place.
2. Calendar system is foundational for this module — build first, thoroughly test rollover logic.
3. Depot and Supply Run are substantial independent modules — can be built in parallel by separate sessions if desired.
4. Tap-to-collapse engine is high-risk for subtle bugs. Invest in property-based tests early.
5. When reusing PTV engine for supply runs, branch via mode flag, never fork code. Shared engine, different config.
6. All new Supabase migrations additive. No destructive changes.
7. Admin panel: add economy balance dashboard (total items generated per user over time, detect runaway inflation).
8. Do not add any real-money purchase code paths, ever. Not even commented-out. Not even "for future use." If the codebase contains no purchase plumbing, there's no accidental activation risk.

---

## 12. Next Actions

 **Claude Code:** Do not begin Depot Phase A until PTV Phase H is complete (art pass on main PTV). The two art passes can batch together via Manus for efficiency.
````

