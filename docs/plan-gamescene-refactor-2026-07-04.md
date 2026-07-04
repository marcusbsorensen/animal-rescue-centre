# GameScene Refactor — Refreshed Plan (2026-07-04)

*Supersedes `docs/gamescene-refactor-plan.md` (2026-04-18), which is now largely out of date: the store + view-module extraction it proposed has since shipped. This doc measures the current file, marks what's done, and scopes the small amount of work that remains.*

## Headline

**The 2026-04-18 plan has mostly been executed.** GameScene is down from a cited **2,979 LOC to 2,275 LOC**. Both proposed directories exist and are populated:

- `apps/game/src/game-state/` — `GameStateStore.ts`, `loadSaveState.ts`, `index.ts` (all present, dated May)
- `apps/game/src/game-views/` — 15 view modules, more than the plan proposed

The single highest-value item — the **`GameStateStore` extraction that fixes stale-closure-after-restart** — is done and verified in the live code. What remains is genuinely optional cleanup, not foundational risk. **My recommendation: stop here unless a specific pain point recurs.** Detail below.

---

## 1. Current-State Measurement (grounded in the file today)

**File:** `apps/game/src/scenes/GameScene.ts` — **2,275 lines**, ~55 methods.

Sibling scenes for scale: WalkScene 1,438 · PlayScene 1,325 · SupplyRunScene 1,174 · DepotScene 827 · SocialScene 587 · AdoptionMatchScene 580. GameScene is still the largest, but it is now a coordinator, not a god-object.

### Responsibilities still living in GameScene

| Cluster | Methods | Notes |
|---|---|---|
| **Scene lifecycle / bootstrap** | `create` (163 LOC), `init`, `shutdown` | Legitimately scene-owned. Reads registry hand-offs (`updatedAnimals`, `vetResult`, `updatedEconomy`, `updatedDepot`) from returning sub-scenes. |
| **Timers** (needs tick, spawn, visitor) | `tickAllNeeds`, `spawnNewAnimal`, `tickClock` | Correctly kept in the scene per the original design decision — Phaser pauses `time` on sleeping scenes, so these must stay with a live scene. |
| **View dispatch (thin wrappers)** | `renderView`, `renderCorridor`, `renderRoom`, `renderRail`, `renderHUD`, `renderNavBar`, `renderKitchen`, `renderGarden` | Already delegate to `game-views/*`. `renderRoom` (265 LOC) is the exception — see below. |
| **Overlay openers** | 12 `open*Overlay` methods (arrival, paths, adoption office, adoption match, adoption, rewilding, map, tunnel, charm, vet, drive, badge) | HTML-iframe + sub-scene launchers. Thin-ish but numerous. |
| **Visitor / cast system** | `scheduleDailyVisitors`, `checkDueVisitors`, `checkAndCreditCharityGrants`, `ensureCastLoaded`, `findCast`, `applyVisitSideEffects`, `showVisitorPopup`, `showVisitorToastFallback`, `buildVisitorToastMessage` | ~73 lines of matches. This is the **largest un-extracted domain cluster** and the strongest remaining extraction candidate. |
| **Action handlers** | `commitAdoption`, `commitRewilding`, `completeBonding`, `setAspiration`, `recruitApprenticeInGame`, `resolveActiveConflict`, `checkBadges`, `checkLevelProgression`, `checkBondComplete` | State mutations passed to views via callback bags. Reasonable to keep — they orchestrate store + save + re-render + audio. |
| **Decorate mode** | `enterDecorateMode`, `exitDecorateMode`, `handlePlaceDecoration`, `handleRemoveDecoration`, `refreshDecoratePanel`, `renderDecorateButton`, `renderRoomDecorations` | ~7 methods, self-contained. A clean extraction candidate. |

### Biggest remaining methods (by span)

`renderRoom` 265 · `create` 163 · `openTunnelOverlay` 91 · `openVetOverlay` 71 · `showVisitorPopup` 70 · `spawnNewAnimal` 58 · `openAdoptionOfficeOverlay` 54 · `mountVetPopup` 52.

`renderRoom` is a wrapper that delegates to `RoomView.renderRoom` but still carries the anchor-resolution helpers (`deriveAnchorState`, `resolveAnchor`) and a large callbacks bag — the 265 is mostly the delegation plumbing, not un-extracted rendering.

### Stale-closure / state-duplication risk — status: **largely neutralised**

- **Store bootstrap is live** (`GameScene.ts:178–180`):
  ```ts
  const existingStore = this.registry.get('gameStore') as GameStateStore | undefined;
  this.store = existingStore ?? new GameStateStore();
  this.registry.set('gameStore', this.store);
  ```
  On `scene.restart()` (resize handler) the store is reused, not reconstructed. Every `onComplete`/callback closure captures `this.store` (a stable reference) rather than scene-instance fields, so the primary correctness bug the old plan flagged (Risk #2) is fixed.
- **No state duplication.** `viewMode`, `scrollY`, `currentRoomSpecies`, `selectedAnimal`, `isDragging` are all scene/view-local and correctly **absent** from `GameStateStore` — they are ephemeral UI state, not persistent game state. There is no shadow copy of store data on the scene.
- **`GameStateStore` is a plain public-field container** — no getters/setters, no reactivity (deliberate, documented in the file's header comment). Views read fields; handlers mutate + call `saveState()`. There are ~65 `saveState()` call sites, which is the one lingering smell (see §3, increment C).
- **Residual latent risk (unchanged from old Risk #1):** tweens targeting destroyed container children are not auto-removed on `clearView()`. Not observed to bite, but still a theoretical leak. Low priority.

---

## 2. Original Plan: Done / Valid / Obsolete

| Original item | Status |
|---|---|
| Extract `GameStateStore` + `loadSaveState` (Phase 1) | **DONE** — both files exist under `game-state/`, imported by GameScene and MainMenuScene. |
| Registry-bootstrap store on restart (Risk #4) | **DONE** — see bootstrap snippet above. |
| Stale-closure fix via `this.store` capture (Risk #2) | **DONE** — this was the whole point; it's live. |
| Extract `GardenView` (Phase 2) | **DONE** — `GardenView.ts` (20 KB). |
| Extract `KitchenView` (Phase 3) | **DONE** — `KitchenView.ts`. |
| Extract Celebrations / Conflict / CollarPicker (Phase 4) | **DONE** — `CelebrationViews.ts`, `ConflictView.ts`, `CollarPickerView.ts`. |
| Extract `AnimalDetailsPopup` (Phase 5) | **DONE** — `AnimalDetailsPopup.ts` (16 KB). |
| Extract `HUDView` + `NavBarView` (Phase 6) | **DONE** — both present; NavBar also owns `renderGamesPopup` + `showQuickToast`. |
| Extract `CorridorView` + `RoomView` (Phase 7, "tricky part") | **DONE** — both present; scroll state stayed scene-local via a callbacks bag (`setMaxScrollY`), exactly as suggested. |
| "Plain functions, not classes" design decision | **VALID & followed** — every view is `renderX(scene, store, container, callbacks)`. |
| "Timers stay in GameScene" | **VALID & followed.** |
| "Rejected: game.registry as state bag" | **PARTIALLY OVERRIDDEN** — registry *is* used, but only as a short-lived hand-off channel between scenes (`updatedAnimals`, `vetResult`, etc.) and to hold the single store reference — not as a typed-any state bag. The spirit holds. |
| Split into CorridorScene / RoomScene / GardenScene | **OBSOLETE / correctly rejected** — never done, and the file confirms the architect's reasoning (view-mode switching is `this.viewMode = x; this.renderView()`, not scene starts). |
| Target "~350-LOC coordinator" | **NOT MET (2,275 LOC), and that target was optimistic.** The un-extracted remainder is real orchestration logic (overlays, visitors, action handlers, decorate mode), not rendering. ~350 was never realistic without also extracting these; see §3 for the honest residual.

**New modules that post-date the old plan** (evidence the pattern kept being applied organically): `LeftRailView`, `ApprenticeDecorations`, `ToyPickerView`, `WardrobePickerView`. The refactor discipline stuck.

---

## 3. Remaining Extraction Order (low-risk, each independently shippable)

These are **optional polish**, ordered smallest/safest first. None is load-bearing. Ship one per session, run the suite + smoke-check between each.

### Increment A — Extract the visitor/cast system → `game-logic` + a thin `VisitorController` (~2–3 h)
Largest un-extracted domain cluster (~9 methods, ~73 line-matches). The *scheduling/eligibility/side-effect* logic (`scheduleDailyVisitors`, `checkDueVisitors`, `checkAndCreditCharityGrants`, `applyVisitSideEffects`, `buildVisitorToastMessage`) is pure and highly testable — move it to `packages/game-logic/src/visitors/` with unit tests. Leave only `showVisitorPopup` / `showVisitorToastFallback` (Phaser rendering) as thin wrappers in a new `game-views/VisitorPopupView.ts`. **Highest-value remaining item** because it adds test coverage to logic that currently has none.

### Increment B — Extract decorate mode → `game-views/DecorateController.ts` (~1–2 h)
`enterDecorateMode`, `exitDecorateMode`, `handlePlaceDecoration`, `handleRemoveDecoration`, `refreshDecoratePanel`, `renderDecorateButton`, `renderRoomDecorations` are self-contained and share only `store.placedDecorations` + `decoratePanelDispose`. Clean lift into a controller object constructed in `create()`.

### Increment C — Consolidate the ~65 `saveState()` calls (~1 h, optional)
Not an extraction — a debounce. 65 scattered `this.saveState()` calls are easy to forget on a new code path and each writes synchronously. Consider a single `markDirty()` + debounced flush, or leave as-is (it works, it's just noisy). **Defer unless save-perf or a "state didn't persist" bug appears.**

### Increment D — Collapse the 12 overlay openers → an `OverlayManager` (~2–3 h, low value)
The `open*Overlay` methods are mostly thin sub-scene/iframe launchers. Grouping them into one module reduces GameScene length but adds an indirection layer for little correctness benefit. **Lowest priority — cosmetic.**

**Explicitly NOT recommended:** further splitting `renderRoom`, or the CorridorScene/RoomScene split. Both are already rejected/handled.

Files to create if pursuing A–B:
```
packages/game-logic/src/visitors/index.ts          (+ __tests__/visitors.test.ts)
apps/game/src/game-views/VisitorPopupView.ts
apps/game/src/game-views/DecorateController.ts
```

---

## 4. Regression Protection

- **Automated suite: `pnpm -r test` — 786 tests** (the old plan's "782" is now 786; effectively the same suite, grown slightly). Test runner is `vitest run` per package. Coverage is concentrated in `packages/game-logic` and `packages/badges`; **there is almost no test coverage of the scene/view layer itself** (only `game-logic/.../garden.test.ts` touches garden logic). This is why Increment A is valuable — moving visitor logic into `game-logic` *creates* testability where a render-layer extraction cannot.
- **Rule:** run `pnpm -r test` after every increment; it must stay green. Also run `tsc`/typecheck (`pnpm -r build` or the game's typecheck) — the callbacks-bag pattern is type-checked, so a broken extraction fails compilation loudly.
- **Manual smoke-checklist** (unchanged from the old plan — still the right list; run after each increment):
  - [ ] Load game → corridor renders
  - [ ] Welcome an arriving animal (single + Welcome-all)
  - [ ] Feed / play / groom / heal
  - [ ] Bond an animal → collar picker fires
  - [ ] Walk a pet (WalkScene round-trip, state returns via registry hand-off)
  - [ ] Depot session (DepotScene round-trip)
  - [ ] Trigger + resolve a conflict
  - [ ] Trigger a level-up → celebration plays
  - [ ] Visitor appears (relevant to Increment A)
  - [ ] Decorate mode: place + remove a decoration (relevant to Increment B)
  - [ ] Resize the window mid-play → scene restarts, **state survives** (guards the store-bootstrap path)
  - [ ] Close tab, reopen → state persists

---

## 5. Effort Estimate

| Increment | Effort | Value |
|---|---|---|
| A — Visitor/cast → game-logic + VisitorPopupView | 2–3 h | **High** (adds test coverage) |
| B — DecorateController | 1–2 h | Medium |
| C — saveState debounce | ~1 h | Low (defer) |
| D — OverlayManager | 2–3 h | Low (cosmetic) |
| **Total if all pursued** | **6–9 h** | — |

Contrast with the old plan's 20–29 h — because ~15–20 of those hours are already spent.

---

## 6. Honest Cost/Benefit

This is **foundational debt with zero visible payoff for an 8-year-old player.** Nothing here makes the game better to play; it makes the code cheaper to change.

**The refactor already paid its dividend.** The store extraction fixed a real correctness class (stale closures after resize-restart) and gave every view module a testable, Phaser-free seam. That was the ~80% that mattered, and it's banked.

**When the remaining 20% is worth doing:**
- **Do Increment A** if/when you next touch the visitor or grant system, or want to add visitor variety — the logic is untested and lives in a 2,275-line file where it's hard to reason about. Extraction pays for itself the moment you need to change it.
- **Do Increment B** opportunistically if you're already in decorate-mode code.
- **Defer C and D indefinitely.** They shorten the file without reducing risk. File length alone is not a reason to refactor a working, shipping scene.

**When to defer everything:** if the near-term roadmap is content and features (new species, new minigames, map/world work — which the recent commit history suggests), leave GameScene alone. It works, it's coherent, and 2,275 lines of well-delegated coordinator is not an emergency. Touch it only when a feature drags you into one of these clusters, then extract *that* cluster as part of the feature work — never as a standalone "cleanup sprint" with no player-facing payoff.

**One-line verdict:** the debt is serviced; the balance is small and non-urgent. Extract on contact, not on schedule.

---

*Grounded in `apps/game/src/scenes/GameScene.ts` @ 2,275 LOC, `game-state/`, `game-views/`, and `pnpm -r test` (786 tests) as of 2026-07-04.*
