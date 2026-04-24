# Driving systems overview

A.R.C. has **three distinct "driving/vehicle" systems**. They share aesthetics (painted vehicles, coin rewards, garage-style UI) but each answers a different player need. Keeping them separate matters: past design docs have conflated them, which makes the code hard to reason about and the learning outcomes blurry.

| System | Purpose | Cargo? | Tonal register | Primary mechanic | Module |
|---|---|---|---|---|---|
| **PTV — Pet Transport Vehicle** | Move animals between the centre and homes / wild habitats / other centres | **Animals in crates** | Gentle, tactical, caring | Crate-stacking adjacency puzzle on a vehicle grid | [`packages/game-logic/src/crate-stacking.ts`](../packages/game-logic/src/crate-stacking.ts) |
| **Supply Runs** | Earn coins, burn excess energy, repair budget | **None — cargo-free** | Neon chaos, deliberate tonal shift | 3-lane driving / smashing / time trial | [`packages/game-logic/src/supply-runs.ts`](../packages/game-logic/src/supply-runs.ts) |
| **The Depot** | Collect parts / treats / decorations / medical stock used by the rest of the game | n/a (stationary) | Focused, puzzly, purple | Tap-to-collapse groups (BFS, **not** match-3) | [`packages/game-logic/src/depot-board.ts`](../packages/game-logic/src/depot-board.ts), [`depot-inventory.ts`](../packages/game-logic/src/depot-inventory.ts) |

## How they connect

```
        ┌──────────────┐        parts        ┌──────────────┐
        │   The Depot  │──────────────────▶ │  Supply Runs │──── coins ─┐
        │ (tap to      │   treats/decor      │  (cargo-free │             │
        │  collapse)   │◀───────────────────│   chaos)     │             │
        └──────────────┘   vehicle repair    └──────────────┘             │
               │                                                           │
               │ treats, decor,                                            │
               │ medical stock                                             ▼
               ▼                                                    ┌──────────────┐
        ┌──────────────┐                                            │     PTV      │
        │ Rescue       │◀── bond, adopt, rewild, heal ─────────────│  (pet        │
        │ Centre core  │                                            │  transport)  │
        └──────────────┘                                            └──────────────┘
```

- **Supply Runs** take damage → repaired with **Depot** parts → back on the road.
- **Depot** super-treats (Rainbow Biscuit etc) feed bonding in the rescue core.
- **Depot** medical stock stocks the vet.
- **Depot** seasonal decorations customise the centre.
- **PTV** drives happen around real rescue events — adoption delivery, rewilding, collection.

## What each doc covers

- [`original-depot-supply-spec.md`](original-depot-supply-spec.md) — **🟢 canonical verbatim source** for Supply Runs + Depot, recovered from Marcus's original spec paste (queue-enqueued at 2026-04-13T07:41:20Z). Read this first for anything touching those two systems.
- [`ptv-pet-transport-vehicle.md`](ptv-pet-transport-vehicle.md) — the animal-transport system. ⚠ Note: the verbatim **PTV spec itself was never pasted** into the session — it was only referenced as `ARC_PTV_spec.md` in the Depot spec header. The vehicle names (Trikey / Henry / Bea / Big Tilly / Spark), crate types, and adjacency matrix in this doc are Claude's own design, not Marcus's. If Marcus has the original PTV spec locally, it supersedes this doc.
- [`extracted-driving-spec.md`](extracted-driving-spec.md) — earlier partial reconstruction from the compacted post-spec session (implementation code + approved plans). Superseded by the verbatim recovery, kept for the implementation-correlation tables.

## Naming discipline

A prior design doc (`driving-crate-stacking.md`, v0.1) used "cargo drive" for both PTV drives and Supply Runs, which is wrong — Supply Runs have never carried cargo. From here on:

- "**PTV drive**" = animal transport, uses crate-stacking.
- "**Supply Run**" = cargo-free chaos drive.
- "**Depot session**" = tap-to-collapse mini-game.

Don't mix them in new writing or code.

## Divergences to reconcile

Spot-check of current code against the recovered verbatim spec — reconciliation pending:

- **Depot move limit**: spec says *"No timer. No move limit by default."* Current `DepotScene.ts` hardcodes `maxMoves = 25`. Either drop the cap or make it configurable per-mode.
- **Supply Run music**: updated brief (Marcus, 2026-04-24) — **heavy metal, Metallica-style, instrumental, no vocals, 40–60 s seamless loop**. Overrides the original spec's "energetic rock / electronic / funk" line. Current Manus pack has a general acoustic `music-play.ogg` and no dedicated Supply Run track — needs a Manus regen with the new brief.
- **Supply Run framing**: spec is emphatic that Supply Runs are **not** a penalty for poor animal care — they're an always-available alternative income for players who just like driving. The full framing (per Marcus, 2026-04-24): PTV drives require careful mindful play; Supply Runs are the tonal escape valve *and* the way you pay the vet bill when a PTV drive goes wrong. Economic loop reinforces the tonal dichotomy. See [ptv-pet-transport-vehicle.md §User-dictated additions](ptv-pet-transport-vehicle.md#user-dictated-additions).
- **Super-treat effects**: spec defines all 13 effects (Thunder Crunch = next walk immune to road-crossing misses, Worry Wafer = halves stress, Silly Sardine = cats go bananas, etc). Only Rainbow Biscuit's effect is implemented. The other 12 have catalogue entries but no gameplay hooks.
- **Extra-session earning rules**: spec specifies feed-all-animals-in-a-day → +1, vet delivery success → 30 % chance +1, daily login → +1. Unverified whether the current code hooks these up.
- **Hall of Fame categories**: spec has six categories (Most Runs, Biggest Smash, Cleanest Dirty Run, Speed Demon, The Collector, Repair Bill of Shame). `SupplyRunsStats` persists three (`totalRuns`, `biggestSmash`, `fastestTimes`) — rest TBD.

None of these are bugs, just gaps between spec and implementation. Worth a grooming pass when you're ready to polish the driving/depot loop.
