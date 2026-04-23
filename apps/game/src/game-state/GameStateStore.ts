import type {
  Animal,
  Species,
  CalendarState,
  DepotState,
  Economy,
  PlacedDecoration,
  AnimalRelationship,
  TimeProgress,
  GardenWeather,
} from '@arc/shared-types';
import type { IllnessDef, Conflict } from '@arc/game-logic';

/**
 * GameStateStore — a plain container holding all mutable game state.
 *
 * Constructed once per play session and held:
 *   - by GameScene (`this.store`)
 *   - by the game registry (`scene.registry.set('gameStore', store)`)
 *
 * Both references are the SAME object. Because we put the store on the
 * registry before any `scene.restart()` (triggered by resize handlers),
 * the post-restart `create()` reads the existing store off the registry
 * rather than constructing a fresh one — so no state is lost and no
 * closure over `this.store` becomes stale.
 *
 * Fields are public-mutable by design. Rendering modules read them;
 * action handlers mutate them and call `saveGameState()`. We intentionally
 * do NOT build a reactive change-notification system here — Phaser's
 * render model is explicit (`renderView()` redraws the current view), and
 * adding a pub/sub layer would hide the call graph rather than simplify it.
 *
 * This lives under `apps/game/src/game-state/` alongside `loadSaveState`,
 * separate from `scenes/` so non-scene modules (views, panels) can import
 * the store without dragging in Phaser scene dependencies.
 */
export class GameStateStore {
  animals: Animal[] = [];
  level = 1;
  totalRescued = 0;
  totalBonded = 0;
  unlockedSpecies: Species[] = ['cat', 'dog'];
  earnedBadges: string[] = [];
  houseUpgrades: string[] = [];
  sickAnimals: Map<string, IllnessDef> = new Map();
  activeConflict?: Conflict;
  conflictsResolved = 0;

  /**
   * Epoch-ms of the last conflict popup (spawned OR resolved). We suppress
   * new conflicts for a generous cooldown so kids get time to breathe
   * rather than feeling perpetually interrupted.
   */
  lastConflictAt = 0;

  calendar!: CalendarState;
  depot!: DepotState;
  economy: Economy = { coins: 0, lifetimeEarnings: 0 };
  placedDecorations: PlacedDecoration[] = [];
  relationships: AnimalRelationship[] = [];

  /**
   * Task-driven in-game clock (morning/afternoon/evening/night). Phase
   * advances when `recordCareTask` is called (feeding, walking, etc.).
   * Optional for backwards-compat with older saves — populated by
   * loadSaveState on first load.
   */
  timeProgress?: TimeProgress;

  /**
   * Today's garden weather forecast (one weather per phase). Re-rolled
   * at dawn using a day-seeded RNG so reloads don't reshuffle. Optional
   * for back-compat; populated by loadSaveState.
   */
  gardenWeather?: GardenWeather;

  /**
   * Animals who have found their forever family. Kept on the save so
   * they can return as visitors (photos, playdates, second-adoption
   * approaches) and so the player sees their lifetime impact.
   */
  rehomed: Array<{
    animalId: string;
    animalName: string;
    species: Species;
    variant?: string;
    householdId: string;
    date: number;        // epoch ms of the adoption
  }> = [];

  /**
   * Animals released back to the wild. They can return as garden-only
   * visitors once the "visit in the wild" mechanic lands.
   */
  rewilded: Array<{
    animalId: string;
    animalName: string;
    species: Species;
    variant?: string;
    date: number;
  }> = [];

  /**
   * Animals who stay at A.R.C. in a working role (therapy, mouser,
   * greeter, etc.). Still visible in the centre but gated from
   * adoption / rewilding flows.
   */
  workingAnimals: Array<{
    animalId: string;
    role: 'therapy' | 'greeter' | 'mouser' | 'ambassador';
    sinceDate: number;
  }> = [];
}
