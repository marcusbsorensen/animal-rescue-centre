import Phaser from 'phaser';
import type {
  Animal,
  CalendarState,
  DepotState,
  Economy,
  PlacedDecoration,
  AnimalRelationship,
  TimeProgress,
  GardenWeather,
} from '@arc/shared-types';
import {
  getSpeciesUnlocksForLevel,
  syncNextId,
  syncPlacedDecorationId,
  createCalendarState,
  advanceCalendar,
  isDailyReset,
  resetDailySessions,
  relationshipsFromSiblingIds,
  createTimeProgress,
  generateDailyWeather,
  countFullyBondedPets,
  isWeekend,
  recomputeApprenticeUnlocks,
} from '@arc/game-logic';
import type { IllnessDef, ApprenticeEntry, CharmId, CharmUnlockEvent } from '@arc/game-logic';
import { getSession } from '../lib/auth';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { showToast, showBlocking } from '../ui/ErrorOverlay';
import { GameStateStore } from './GameStateStore';

/**
 * loadSaveState — Supabase-backed persistence for the game state store.
 *
 * Extracted from GameScene so the load/save surface can be tested
 * (and swapped — e.g. for a localStorage fallback) without reaching
 * into scene internals. The scene is passed in only so we can surface
 * error UI on its layer.
 *
 * Both functions are no-ops when the player isn't signed in or
 * Supabase isn't configured — the game will still play, just without
 * cloud persistence.
 */

/**
 * Hydrate the store from Supabase. On genuine failure (network, 5xx)
 * pops a blocking retry overlay on the scene. On first-time-player
 * (row doesn't exist), returns cleanly — the store keeps its defaults.
 *
 * Always ensures `store.calendar` and `store.depot` end up populated,
 * even if the load failed — so callers can proceed to render.
 */
export async function loadGameState(
  scene: Phaser.Scene,
  store: GameStateStore,
): Promise<void> {
  const session = getSession();
  if (!session || !isSupabaseConfigured()) {
    initialiseSubsystems(store);
    return;
  }

  // Shared inner function so the error-overlay retry can re-run exactly
  // this logic without re-entering loadGameState (which also initialises
  // subsystems at the end).
  const attempt = async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from('game_states')
      .select('state, level')
      .eq('user_id', session.userId)
      .maybeSingle();

    // maybeSingle returns null (not an error) when the row doesn't
    // exist yet — that's the first-time-player case. Only genuine
    // network / server errors should surface the retry UI.
    if (error) throw error;

    if (data?.state && typeof data.state === 'object') {
      const saved = data.state as Record<string, unknown>;
      if (Array.isArray(saved.animals)) store.animals = saved.animals as Animal[];
      if (typeof saved.totalRescued === 'number') store.totalRescued = saved.totalRescued;
      if (typeof saved.totalBonded === 'number') store.totalBonded = saved.totalBonded;
      if (Array.isArray(saved.earnedBadges)) store.earnedBadges = saved.earnedBadges as string[];
      if (Array.isArray(saved.houseUpgrades)) store.houseUpgrades = saved.houseUpgrades as string[];
      if (saved.sickAnimals && typeof saved.sickAnimals === 'object') {
        store.sickAnimals = new Map(Object.entries(saved.sickAnimals as Record<string, IllnessDef>));
      }
      store.level = data.level ?? 1;
      // unlockedSpecies is recomputed after apprentices hydrate (below) so
      // Kofi's extra-species-slot is reflected on load. Keep a sensible
      // fallback here in case the later apprentice block is skipped.
      store.unlockedSpecies = getSpeciesUnlocksForLevel(store.level);

      // Sync ID counter to avoid collisions with loaded animals
      syncNextId(store.animals);

      if (saved.calendar && typeof saved.calendar === 'object') {
        store.calendar = saved.calendar as CalendarState;
      }
      if (saved.depot && typeof saved.depot === 'object') {
        store.depot = saved.depot as DepotState;
      }
      if (saved.economy && typeof saved.economy === 'object') {
        store.economy = saved.economy as Economy;
      }
      if (Array.isArray(saved.placedDecorations)) {
        store.placedDecorations = saved.placedDecorations as PlacedDecoration[];
        syncPlacedDecorationId(store.placedDecorations);
      }
      // Relationships: load the saved list if present, otherwise
      // migrate from legacy `siblingId` fields on the animals. Keeps
      // older save files functional without a separate migration.
      if (Array.isArray(saved.relationships)) {
        store.relationships = saved.relationships as AnimalRelationship[];
      } else {
        store.relationships = relationshipsFromSiblingIds(store.animals);
      }
      if (saved.timeProgress && typeof saved.timeProgress === 'object') {
        store.timeProgress = saved.timeProgress as TimeProgress;
      }
      if (saved.gardenWeather && typeof saved.gardenWeather === 'object') {
        store.gardenWeather = saved.gardenWeather as GardenWeather;
      }
      // Back-compat: older saves won't have rehomed/rewilded/visitors;
      // keep the empty-array defaults in that case.
      if (Array.isArray(saved.rehomed)) {
        store.rehomed = saved.rehomed as GameStateStore['rehomed'];
      }
      if (Array.isArray(saved.rewilded)) {
        store.rewilded = saved.rewilded as GameStateStore['rewilded'];
      }
      if (Array.isArray(saved.visitors)) {
        store.visitors = saved.visitors as GameStateStore['visitors'];
      }
      // Apprentices — empty on older saves. Always recompute the
      // derived unlocks bag from the list so the cache can't drift
      // from the source of truth even if the save had a stale value.
      if (Array.isArray(saved.apprentices)) {
        store.apprentices = saved.apprentices as ApprenticeEntry[];
      }
      store.apprenticeUnlocks = recomputeApprenticeUnlocks(store.apprentices);
      // Re-derive the species list now apprentices are known — Kofi's
      // extraSpeciesSlots unlocks the next species in canonical order.
      store.unlockedSpecies = getSpeciesUnlocksForLevel(
        store.level,
        store.apprenticeUnlocks.extraSpeciesSlots,
      );

      // Back-compat: wildVisitsUnlocked (Benji's first wild-visit flips
      // this flag; older saves won't have the field).
      if (typeof saved.wildVisitsUnlocked === 'boolean') {
        store.wildVisitsUnlocked = saved.wildVisitsUnlocked;
      }
      if (typeof saved.hasCompletedFirstDrive === 'boolean') {
        store.hasCompletedFirstDrive = saved.hasCompletedFirstDrive;
      }
      if (Array.isArray(saved.gardenReturns)) {
        store.gardenReturns = saved.gardenReturns as GameStateStore['gardenReturns'];
      }

      // Back-compat: lastGrantCheckAt (gate for monthly charity grants).
      // Leave undefined for brand-new / older saves — charity.ts seeds
      // on first call without paying a spurious grant.
      if (typeof saved.lastGrantCheckAt === 'number') {
        store.lastGrantCheckAt = saved.lastGrantCheckAt;
      }
      if (Array.isArray(saved.grantsReceived)) {
        store.grantsReceived = saved.grantsReceived as GameStateStore['grantsReceived'];
      }

      // Charms — back-compat: older saves predate the slice. Default
      // unlockedCharms covers the three `kind: 'always'` charms; the
      // GameStateStore initialiser sets that already, so we only
      // override when the save has the field.
      if (Array.isArray(saved.unlockedCharms)) {
        store.unlockedCharms = saved.unlockedCharms as CharmId[];
      }
      if (typeof saved.equippedCharm === 'string' || saved.equippedCharm === null) {
        store.equippedCharm = saved.equippedCharm as CharmId | null;
      }
      if (saved.eventCounters && typeof saved.eventCounters === 'object') {
        store.eventCounters = saved.eventCounters as Partial<Record<CharmUnlockEvent, number>>;
      }
    }
    return true;
  };

  try {
    await attempt();
  } catch (err) {
    // Load is blocking — without game state there's nothing to render.
    // Surface a retry modal and let the player try again.
    const msg = err instanceof Error ? err.message : 'Something went wrong loading your shelter.';
    console.warn('[loadGameState] failed:', msg);
    showBlocking(
      scene,
      'We couldn\'t reach the server to load your shelter.\nCheck your internet and try again.',
      async () => {
        try {
          await attempt();
          initialiseSubsystems(store);
          return true;
        } catch {
          return false;
        }
      },
    );
  }

  initialiseSubsystems(store);
}

/**
 * Fill in the calendar + depot defaults if the save didn't provide
 * them (first-time player or older save). Idempotent — safe to call
 * after every load attempt.
 */
function initialiseSubsystems(store: GameStateStore): void {
  if (!store.calendar) {
    store.calendar = createCalendarState(new Date().toISOString());
  }
  if (!store.depot) {
    store.depot = {
      sessionsRemainingToday: 3,
      sessionsMaxToday: 3,
      lastSessionDay: '',
      totalSessionsPlayed: 0,
      inventory: {
        parts: {}, tools: {}, treats: {}, superTreats: {},
        decorations: {}, medicalSupplies: {},
      },
    };
  }

  // Advance calendar and check for daily reset
  store.calendar = advanceCalendar(store.calendar, store.calendar.gameStartedAt);
  if (isDailyReset(store.calendar, new Date())) {
    store.depot = resetDailySessions(store.depot);
  }

  // Time progress — task-driven clock. Init on first load; refreshed
  // elsewhere when level or helper-count changes.
  if (!store.timeProgress) {
    store.timeProgress = createTimeProgress(store.level, {
      fullyBondedPets: countFullyBondedPets(store.animals),
      isWeekend: isWeekend(new Date()),
    });
  }

  // Daily weather — re-roll when the in-game day changes.
  const today = store.calendar.currentInGameDate;
  const todayKey = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
  if (!store.gardenWeather || store.gardenWeather.forDay !== todayKey) {
    store.gardenWeather = generateDailyWeather(today, store.calendar.currentSeason);
  }
}

// ── Save ──────────────────────────────────────────────────────

/**
 * Save toast throttling — module-scoped rather than on the store
 * because it's a UI concern (noise suppression), not game state.
 */
let lastSaveToastAt = 0;
let consecutiveSaveFailures = 0;

/** Reset throttling state — useful for tests and on full sign-out. */
export function resetSaveThrottle(): void {
  lastSaveToastAt = 0;
  consecutiveSaveFailures = 0;
}

/**
 * Persist the store to Supabase. No-op when not signed in or Supabase
 * isn't configured. On failure, shows a throttled toast so a flaky
 * network doesn't spam a toast on every action (we save on almost
 * every interaction).
 */
export async function saveGameState(
  scene: Phaser.Scene,
  store: GameStateStore,
): Promise<void> {
  const session = getSession();
  if (!session || !isSupabaseConfigured()) return;

  try {
    const { error } = await supabase
      .from('game_states')
      .upsert({
        user_id: session.userId,
        state: {
          animals: store.animals,
          totalRescued: store.totalRescued,
          totalBonded: store.totalBonded,
          earnedBadges: store.earnedBadges,
          houseUpgrades: store.houseUpgrades,
          sickAnimals: Object.fromEntries(store.sickAnimals),
          calendar: store.calendar,
          depot: store.depot,
          economy: store.economy,
          placedDecorations: store.placedDecorations,
          relationships: store.relationships,
          timeProgress: store.timeProgress,
          gardenWeather: store.gardenWeather,
          rehomed: store.rehomed,
          rewilded: store.rewilded,
          visitors: store.visitors,
          apprentices: store.apprentices,
          wildVisitsUnlocked: store.wildVisitsUnlocked,
          hasCompletedFirstDrive: store.hasCompletedFirstDrive,
          gardenReturns: store.gardenReturns,
          lastGrantCheckAt: store.lastGrantCheckAt,
          grantsReceived: store.grantsReceived,
          unlockedCharms: store.unlockedCharms,
          equippedCharm: store.equippedCharm,
          eventCounters: store.eventCounters,
        },
        level: store.level,
        updated_at: new Date().toISOString(),
      });
    if (error) throw error;
    consecutiveSaveFailures = 0;  // reset on success
  } catch (err) {
    consecutiveSaveFailures += 1;
    console.warn('[saveGameState] failed:', err);
    const now = Date.now();
    if (now - lastSaveToastAt > 30_000) {
      lastSaveToastAt = now;
      showToast(scene, "Couldn't save to the cloud — we'll retry next action.");
    }
  }
}
