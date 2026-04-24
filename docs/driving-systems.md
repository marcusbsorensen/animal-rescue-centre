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

- [`ptv-pet-transport-vehicle.md`](ptv-pet-transport-vehicle.md) — the animal-transport system (vehicle pick → crate-stacking puzzle → drive → arrival happiness deltas).
- [`extracted-driving-spec.md`](extracted-driving-spec.md) — reconstruction of the original Supply Runs + Depot + calendar spec from a compacted prior session. Canonical reference for those two systems until the user provides a fresher source.
- There is **no dedicated Supply Runs or Depot doc yet** — the implementations in `supply-runs.ts` / `depot-*.ts` are the source of truth, and the extracted-driving-spec captures the design intent.

## Naming discipline

A prior design doc (`driving-crate-stacking.md`, v0.1) used "cargo drive" for both PTV drives and Supply Runs, which is wrong — Supply Runs have never carried cargo. From here on:

- "**PTV drive**" = animal transport, uses crate-stacking.
- "**Supply Run**" = cargo-free chaos drive.
- "**Depot session**" = tap-to-collapse mini-game.

Don't mix them in new writing or code.
