# TestFlight, and the plan for the gaps

2026-10-10. Marcus asked for a working build on his iPhone with the new logo
and some actual gameplay, chose TestFlight as the channel, and asked for a plan
that closes as many gaps as it can rather than only the worst ones.

Two read-only audits were run first, one over the gameplay gaps and one over the
art. **Both found the handover stale in material ways.** Those corrections are
recorded here; `.claude/HANDOVER.md` should be read against this file, not
instead of it.

---

## 1. TestFlight — done today

| Thing | Value |
|---|---|
| App Store Connect app | `A.R.C. Animal Rescue Centre`, id `6821467142` |
| Bundle ID | `com.healingishere.arc`, portal id `A5BNMTCJHL` |
| Team | Interfulgent Limited, `R94VDZ56RY` |
| Distribution cert | `78A5WSB26G`, expires 2027-08-13 |
| Provisioning profile | `ARC App Store`, `F5HKW4UZ86`, installed locally |
| First upload | build 1, 101 MB, delivery `cc7582af-8e3f-40e8-a10e-ca674126131c` |

Later builds go up with one command:

```
pnpm testflight
```

`scripts/testflight.mjs` picks the next build number off App Store Connect,
stages the pruned web bundle, archives, exports and uploads. `--build <n>` sets
the number by hand, `--no-upload` stops at the `.ipa`.

### Two traps the script already works around

- **Homebrew's rsync breaks `xcodebuild -exportArchive`.** Xcode's packaging
  step runs `/usr/bin/rsync -8aPhhE`, which spawns its server process from
  PATH. Homebrew rsync 3.5.1 (installed 2026-10-09) answers, rejects Apple's
  `--extended-attributes`, and the export dies as `Copy failed` with no clue
  what failed. The fix is running the Xcode steps with `/opt/homebrew/bin` off
  PATH. This will bite every other iOS project on this machine.
- **Automatic signing fails.** `Cloud signing permission error` — the App Store
  Connect API key is not authorised to mint certificates. The script signs
  manually against the existing distribution certificate and the `ARC App
  Store` profile, which needs no extra permission.

Also added: `ITSAppUsesNonExemptEncryption = false` in `Info.plist`. Without it
every upload parks at "Missing Compliance" and testers cannot install. It is
true of this app — HTTPS to Supabase and nothing else cryptographic, and plain
HTTPS is exempt.

**App records cannot be created through the API** (`apps` allows only
GET/UPDATE), so that one step was done in the web UI.

---

## 2. What the gameplay audit found

Verified against `claude/crate-loading`, not taken from the handover.

| Claim in the handover | Verdict |
|---|---|
| Adoption caps at 5 and takes only cats and dogs | **True**, and there is a worse bug underneath it |
| 18 charms painted but never drawn | **Partly false.** 17, and the picker does draw them |
| `doFeed` never saves | **True.** One line |
| 11 of 25 badges unreachable | **True on the count**, wrong on the cause |
| The tunnel is implemented twice | **True**, and the two are behaviourally identical |
| No garden feeding or play areas | **True**, but nothing specifies what should exist |
| `scared`/`grumpy`/`growling` never rendered | **Stale.** Only `growling` is unrendered |

### 2.1 Adoption — the biggest hole, and not where it was thought to be

`packages/game-logic/src/adoption.ts:49-95` holds five hand-picked households,
each `capacity: 1`. Five adoptions per save, and `rehomed` is append-only
(`merge-save.ts:30,88`) with nothing to reset it. Only Pri and Babcia take dogs,
so at most two dogs ever. **Fox, bunny, bat, parrot, snake and hedgehog have no
taker at all**, though the game spawns all eight (`progression.ts:14-22`). The
child meets a dead end reading "Try again in a few days", and no number of days
helps.

Neither limit is a deliberate rule. Comments at `adoption.ts:8-11,41-47` call
the roster a placeholder for "a later phase", and that phase
(`docs/animal-flow-implementation-plan-2026-05-03.md:267-300`) was never built.

**Underneath it is a bug nobody had noticed.** The household IDs in
`adoption.ts` do not match `apps/game/public/data/cast.json` — `01-pri-kaur`
against `01-priya`, `04-babcia-kowalska` against `04-babcia`, and so on. So
`findCast` (`GameScene.ts:2229,2451`) misses every time: the +15 species fee
bonus (`charity.ts:43`) is never paid, every toast says "The family", and
returning-visitor popups degrade to a toast.

`cast.json` carries 32 households with species lists, and all 32 portraits exist
in `public/admin/scene-assets/cast/`. The fix is to build applicants from it.

One conflict to settle first: the plan doc's locked table
(`animal-flow-implementation-plan-2026-05-03.md:423-433`) says Nova and Hiro
want dogs; `docs/rehoming-cast.md:27,30` and the code say cats. And **no
household in cast.json lists hedgehog.**

### 2.2 `doFeed`

`GameScene.ts:1230-1247` changes hunger and bond, redraws, and never saves. The
fix is `this.saveState();` in the caller at `:1430`, after `tickClock` rather
than inside `doFeed`, so the clock and weather changes go with it.

Overstated in one respect: the next save from anything else carries the feed,
because `snapshot()` serialises the whole store. But there is no pagehide or
visibilitychange flush anywhere, so feed-then-close loses it. A regression test
is already named for it in
`apps/game/src/game-state/__tests__/collection-calls-save.test.ts:10`.

### 2.3 Badges — hard-coded zeros, not thresholds

`GameScene.checkBadges` (`:2840-2881`) passes literal values at `:2857-2870`.
Eleven badges are therefore unreachable whatever the player does.

| Badge | Blocked by | Size |
|---|---|---|
| `cosy_centre` | `houseUpgrades: 0`, while `store.houseUpgrades` exists | **one line** |
| `giver`, `generous`, `receiver` | client never reads `rescue_stats`, which the server already increments (`send-gift/index.ts:125-143`) | tens of lines |
| `vet_apprentice`, `vet_pro` | `selfHealed: 0`; the `healed` flag reaches `GameScene.ts:1342` | new counter |
| `good_walker` | `walksWithoutIncident: 0`; `perfectWalk` ignored at `:1297` | new counter |
| `daily_week`, `daily_month` | no day tracking exists | new counters |
| `trainer` | `TRICKS`/`canTrain` (`walks.ts:186-221`) have no UI | subsystem, or drop it |
| `early_supporter` | needs server-side signup order | cross-stack |

Two more are fragile rather than dead: `peacekeeper` counts
`conflictsResolved`, which is in neither `snapshot()` nor `applySavedState`, so
it resets every load and needs ten resolutions in one sitting at a 90-second
cooldown. The species badges count *current* population, so adopting an animal
takes its badge away again, and hedgehogs are not counted at all.

### 2.4 The tunnel

`public/admin/tunnel.html:788-1212` reimplements the generator, solver and RNG
that `packages/game-logic/src/tunnel.ts` already provides with 37 tests. The
game runs the HTML copy (`InGameOverlay.ts:77`); the TypeScript has no consumer
outside its own tests.

They are **exactly at parity today** — identical puzzles on seeds 1-300 across
all five tiers, matching solver results on 1000 scrambled boards. So this is
debt, not a live bug. Keep the HTML for its UI, animation, audio and seasonal
soil; delete its ~425 lines of duplicated logic and import `@arc/game-logic`,
which needs a Vite-processed entry because `public/admin` is static.

Noticed in passing and worth a separate look: every tunnel re-dig posts
`tunnel-override-reroll` for +10 coins with no limit (`tunnel.html:2025-2037`,
`GameScene.ts:1993-2005`).

### 2.5 Charms and garments

Seventeen charms, not eighteen, and `public/admin/charm-select.html:279-298`
draws all of them. What is true is narrower and still worth fixing:

- **The equipped charm is drawn nowhere in the game.** `equippedCharm` is saved
  and read by nothing. There is no mirror in the drive HUD to hang it on.
- **Nine of the seventeen can never unlock** — their events are never fired.
  Only five are wired (`GameScene.ts:623-625,2125-2128,2246-2247,2269`).
- **Garments are never composited.** Seven PNGs exist in `assets/animals/`;
  `getWardrobeTextureKey`/`getWardrobeAnchor` (`wardrobe.ts:52,107`) have zero
  consumers; the picker shows colour swatches and writes `"coat:#hex"`, which
  nothing reads. A garment is *mandatory* in bad weather
  (`garden.ts:159-160`) and invisible on the animal.
- Missing files: `hedgehog-scarf.png` and `wardrobe-anchors.json`.

### 2.6 The garden

The two-zone carousel, weather gating, wild returners and the animal card all
exist (`GardenView.ts:146-611`). What does not is any effect from the six house
upgrades in `vet.ts:199-245` — garden_pond, play_area, cosy_nook, treehouse,
rainbow_bridge, grand_hall. They render as the string "Upgrades: ...", have no
art and change nothing.

**No document specifies what they should do.** This one needs a design decision
before any code, and the upgrade descriptions are the closest thing to a spec.

### 2.7 Conflict poses

The handover is out of date. `driving/crate-loading-view.ts:390-394` maps
`stressed`→`grumpy` and `blocked`→`scared` and renders both (commits `7eeb12c`,
`c1a7bec`, 8-9 Oct). Only `growling` is unrendered. `ConflictView.ts:85-91`
still draws all four conflict types as content poses; the proposed mapping is
`docs/sprite-pose-spec-2026-09-05.md:114-119`, and it never uses `scared`.

---

## 3. What the art audit found

**Three of the five passes in the handover are already done.** One needs
redoing for a reason the handover could not have known, and one has not started.

| Pass | Handover says | Actually |
|---|---|---|
| 1. Trikey portrait to a trike | queued | **Done** (`ad521be`) |
| 2. Livery against the master | queued | **Done 10-08, and now invalid** |
| 3. Bus redesign | queued | Not started |
| 4. One true scale | queued | **Done** for 8 sprites (`a08ab96`) |
| 5. Crate fittings | approved, not commissioned | **Done** (`3ffd10a`) |

### Why the livery pass has to be done again

It ran on 2026-10-08 against the masters as they then were: cream Henry, ivory
Bea, white Spark. **The portraits were repainted on 10-09** (`ad49610`) to Henry
maroon (141,51,53), Bea slate blue (75,113,165), Spark leaf green (116,156,102).
Measured today, eleven of the thirteen fleet top-downs are 200-275 RGB units
away from their master — the car park still draws cream and white vans for
maroon, blue and green characters.

Big Tilly's two files are the exception and are correct: red cab, open oak bed,
within 12 and 38 units.

### The commission list

**Six recolours, safe** — repaint, do not redraw. Gate each on target RGB,
lightness and silhouette IoU against the current file; `tools/install-vehicles.py`
already does the IoU gate. From-scratch redraws are what returned Bea as a
featureless slab.

| File | Now | Target |
|---|---|---|
| `vehicle-topdown-henry.png` | cream | maroon (142,52,54), roof included; keep oak slivers, lamps, chrome |
| `vehicle-topdown-henry-rear.png` | cream | maroon; the paw-heart stays, in cream |
| `vehicle-topdown-bea.png` | cream | slate blue (74,112,164), roof included; keep gold trim |
| `vehicle-topdown-bea-rear.png` | cream | slate blue |
| `vehicle-topdown-spark.png` | white | leaf green (116,156,102); bolt and lettering cream, flanks only |
| `vehicle-topdown-spark-rear.png` | white | leaf green |

**Two Trikey redraws, risky.** Both top-downs are cobalt-framed clay with a
terracotta cargo box. They need the lilac frame (180,152,196), an empty
wooden-slat rack for two crates in line, wicker basket, brown saddle, spoked
wheels, GO pennant, three wheels, and the same camera as the fleet. Two edits to
the brief in `car-park-one-world.md` first: line 268 still says duck-egg, and
line 270 gives a deck wider than it is long, which cannot hold a 1×2.
**Do the van recolours before this** — the brief's style anchors are those files.

**One bus redraw.** `vehicle-topdown-bus.png` is clay with seven rows of five
seats wall to wall. It should be open-top, central gangway, two seats a side,
about five rows, passengers from above facing forward. Brief it at aspect 0.415,
which is what `traffic.ts:57` actually sizes it to.

**Defer: the three Henry side elevations.** `henry-side`, `henry-side-left` and
`henry-side-right` are referenced by **no source file in `apps/game/src`** —
only by generated manifests. Not worth a commission.

### Beyond the five passes

**Thirty-one vehicle sprites are still clay** and all but one are used as
traffic (`PtvDriveScene.ts:62-75`): both ambulances, binlorry, bus, both blue
cars, `car-red-rear`, both yellow cars, both fire engines, motorbike, both
pickups, six skiptrucks, all six tractors, both trucks, both Trikeys.

Repaints for these exist locally in the gitignored `manus-output/vehicles-all/`
and were never installed. Quality unchecked, and the handover's tractor revert
says at least some were rejected.

Two corrections to the handover's "six done and installed":
- **`tractor` was never repainted.** It is byte-identical to HEAD and still clay.
- **`car-red` and `decor-cone` are repainted but uncommitted.** `car-red-rear`
  is still clay, so that vehicle currently mixes two styles.

---

## 4. The plan, in the order it should be done

**A. Ship build 1 and get Marcus playing.** Done bar the processing wait.
Everything below lands as build 2, 3, 4 … so each change is testable on the
phone rather than argued about on screen.

**B. Cheap correctness, one sitting.** No art, no design decisions.
1. `doFeed` saves (one line + the named regression test).
2. `cosy_centre` reads `store.houseUpgrades.length` (one line).
3. The adoption/cast ID reconciliation, with an alias map so existing saves keep
   their accounting. This alone restores the species bonus and the named toasts.
4. `ConflictView` takes the spec's pose mapping.

**C. The adoption roster.** The game's whole end state is unreachable for six of
eight species. Build applicants from `cast.json`'s 32 households, add the
planned 21-day cooldown so capacity frees up. Needs two answers first: whether
Nova and Hiro take dogs or cats, and what happens to hedgehogs.

**D. The six van recolours.** The most visible thing in the game that is wrong,
and the safest art job in the list.

**E. Badges that are nearly free.** Gifts (the server already counts them),
`selfHealed`, `walksWithoutIncident`, day tracking. Persist
`conflictsResolved`. Change species badges to count lifetime rescues.

**F. Garments composited.** Needs the hedgehog scarf drawn and
`wardrobe-anchors.json` authored, then per-pose anchor tuning. Mandatory kit the
child cannot see is the worst kind of invisible.

**G. Trikey's two top-downs, then the bus.** Risky redraws, one at a time.

**H. The tunnel de-duplication.** Debt, not a bug — the two are at parity. Worth
doing before anyone edits either copy.

**I. The house upgrades.** Needs a design conversation before any code.

Deferred and recommended as such: the three Henry side elevations; the 31 clay
traffic sprites as a single later batch; the `trainer` badge and
`early_supporter`.

---

## 5. Questions that block work

1. **Nova and Hiro** — dogs (the plan doc) or cats (the cast doc and the code)?
2. **Hedgehogs** — which households take them, or do they need an institutional
   home? No household in `cast.json` lists one.
3. **House upgrades** — what should a pond, play area, treehouse or rainbow
   bridge actually *do*? Six art assets hang off the answer.
4. **The 31 clay traffic sprites** — install the existing local repaints after a
   quality check, or recommission?
