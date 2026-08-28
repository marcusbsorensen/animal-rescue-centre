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
  mergeSaveState,
} from '@arc/game-logic';
import type { IllnessDef, ApprenticeEntry, CharmId, CharmUnlockEvent } from '@arc/game-logic';
import { getSession, sessionHeaders } from '../lib/auth';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { showToast, showBlocking } from '../ui/ErrorOverlay';
import { GameStateStore } from './GameStateStore';
import {
  getLocalSave,
  putLocalSave,
  putRejectedSave,
  putBaseSave,
  getBaseSave,
  markLocalSaveSynced,
} from './localSave';

/**
 * loadSaveState — persistence for the game state store: this device first,
 * then Supabase.
 *
 * Extracted from GameScene so the load/save surface can be tested
 * (and swapped — e.g. for a localStorage fallback) without reaching
 * into scene internals. The scene is passed in only so we can surface
 * error UI on its layer.
 *
 * Two things changed here after the August audit, and both are about a
 * shelter surviving something ordinary:
 *
 *  - Every save is written to IndexedDB before it is posted (see
 *    localSave.ts). Persistence used to be cloud-only, so a flaky
 *    connection meant an afternoon's play existed nowhere at all.
 *  - Every save claims the version it is replacing, and the server refuses
 *    one built on a copy that has since moved on. Two devices on one
 *    account used to overwrite each other in silence.
 *
 * Two divergent shelters are now merged rather than picked between. Both
 * places that can discover the divergence — a rejected save, and a launch
 * that finds an unsynced local copy against a cloud one that has moved on —
 * run the same three-way merge against the ancestor kept by localSave. The
 * child is not told; if the merge is right there is nothing for them to do.
 * See packages/game-logic/src/merge-save.ts for the per-field rules.
 *
 * Both functions are no-ops when the player isn't signed in or
 * Supabase isn't configured — the game will still play, just without
 * cloud persistence.
 */

/**
 * The server version this device believes it holds, per player.
 *
 * Module-scoped rather than on the store for the same reason the toast
 * throttle is: it describes the conversation with the server, not the
 * shelter. `null` means "no server row that we know of" — which is what
 * makes a first save an insert the server can safely refuse, rather than an
 * overwrite it cannot.
 */
let known: { userId: string; version: number | null } | null = null;

/** What to claim on the next save for this player. */
function knownVersionFor(userId: string): number | null {
  return known?.userId === userId ? known.version : null;
}

function rememberVersion(userId: string, version: number | null): void {
  known = { userId, version };
}

/**
 * Hydrate the store: from Supabase, or from this device if Supabase cannot
 * be reached. On first-time-player (row doesn't exist), returns cleanly —
 * the store keeps its defaults.
 *
 * The blocking retry overlay now appears only when the cloud fails *and*
 * this device holds no copy either. Before there was a local copy, an
 * unreachable server meant a retry wall for a child who had done nothing
 * wrong; now it means they play from the iPad and sync when they can.
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
  const userId = session.userId;

  // Shared inner function so the error-overlay retry can re-run exactly
  // this logic without re-entering loadGameState (which also initialises
  // subsystems at the end).
  const attempt = async (): Promise<boolean> => {
    // Goes through the load-game Edge Function rather than selecting from
    // game_states directly. The table's RLS policies key on auth.uid(),
    // and this game never establishes a Supabase auth session — login
    // mints its own token, not a JWT — so a direct select matched no rows
    // and quietly presented every returning child as a new player.
    const { data: payload, error } = await supabase.functions.invoke('load-game', {
      headers: sessionHeaders(),
    });

    if (error) throw error;

    // `save: null` is the honest first-time-player answer, and is
    // deliberately distinct from an error — no retry overlay for someone
    // who simply hasn't saved yet.
    const data = (payload as { save: CloudSave | null } | null)?.save ?? null;

    // Record the version before anything else can go wrong. It is what the
    // next save claims to be replacing, and a wrong value here is precisely
    // how one device silently erases another.
    rememberVersion(userId, typeof data?.version === 'number' ? data.version : null);

    if (data?.state && typeof data.state === 'object') {
      const resolved = await reconcileWithLocal(userId, data);
      applySavedState(store, resolved.state, resolved.level);
      await seedLocalFromCloud(userId, data, resolved.merged);
    }
    return true;
  };

  try {
    await attempt();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong loading your shelter.';
    console.warn('[loadGameState] cloud load failed:', msg);

    // The cloud is unreachable, but this device may still hold the shelter.
    // Opening that beats a retry wall — a child on a train has done nothing
    // wrong, and the version the local copy carries means their next save is
    // still checked against the server rather than assumed to be safe.
    const local = await getLocalSave(userId);
    if (local) {
      applySavedState(store, local.state, local.level);
      rememberVersion(userId, local.version);
      showToast(scene, "No internet just now — playing from this device's copy.");
    } else {
      // Nothing here and nothing there: without game state there is
      // nothing to render, so this one has to block.
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
  }

  initialiseSubsystems(store);
}

/** What load-game returns, and what a 409 from save-game returns. */
interface CloudSave {
  state: unknown;
  level: number;
  version?: number;
  updatedAt?: string;
}

/**
 * Decide what this launch actually opens, when the cloud copy and an
 * unsynced local one both exist.
 *
 * A save left on this device that the server never accepted is an
 * afternoon played offline. The cloud copy is what another device did in
 * the meantime. Phase 1 opened the cloud copy and left the local one on
 * disk unread, which was honest about not having decided and no use to the
 * child whose afternoon it was.
 *
 * It is the same collision as a 409, discovered a moment earlier, so it
 * gets the same answer: merge both against the ancestor. Returning
 * `merged: true` tells the caller not to record this cloud copy as the new
 * ancestor — the merged state has not been accepted by the server yet.
 */
async function reconcileWithLocal(
  userId: string,
  data: CloudSave,
): Promise<{ state: Record<string, unknown>; level: number | undefined; merged: boolean }> {
  const cloudState = (data.state ?? {}) as Record<string, unknown>;
  const local = await getLocalSave(userId);
  if (!local || local.synced) {
    return { state: cloudState, level: data.level, merged: false };
  }

  const base = await getBaseSave(userId);
  const merged = mergeSaveState(base?.state ?? null, local.state, cloudState, {
    mine: local.level,
    theirs: data.level ?? 1,
  });
  console.warn('[loadGameState] merged an unsynced device save with the cloud copy', {
    localVersion: local.version,
    cloudVersion: data.version,
    base: base?.version ?? 'none',
    notes: merged.notes,
  });
  return { state: merged.state, level: merged.level, merged: true };
}

/**
 * Put the server's copy on this device, so a later launch without a
 * connection has something to open, and record it as the ancestor the next
 * merge will measure against.
 *
 * Skipped after a merge. The state now in play is neither copy, and the
 * server has not seen it — calling it the ancestor would tell the next
 * merge that everything in it was already agreed, which is how a merge
 * quietly undoes itself. The unsynced local record stays as it is and the
 * next save posts the merged state properly.
 */
async function seedLocalFromCloud(
  userId: string,
  data: CloudSave,
  merged: boolean,
): Promise<void> {
  if (merged) return;

  const save = {
    userId,
    state: (data.state ?? {}) as Record<string, unknown>,
    level: data.level ?? 1,
    version: typeof data.version === 'number' ? data.version : null,
    // Synced by definition: this *is* what the server holds.
    synced: true,
    savedAt: Date.now(),
  };
  await putLocalSave(save);
  // One of the two moments the device and the server provably agree; the
  // other is a confirmed save. See localSave's `base` record.
  await putBaseSave(save);
}

/**
 * Hydrate the store from a saved snapshot, wherever it came from — the
 * cloud, or this device's own copy. Every field is guarded, because a save
 * written by an older build of the game will be missing whatever had not
 * been added yet.
 */
function applySavedState(
  store: GameStateStore,
  saved: Record<string, unknown>,
  level: number | undefined,
): void {
  if (Array.isArray(saved.animals)) store.animals = saved.animals as Animal[];
  if (typeof saved.totalRescued === 'number') store.totalRescued = saved.totalRescued;
  if (typeof saved.totalBonded === 'number') store.totalBonded = saved.totalBonded;
  if (Array.isArray(saved.earnedBadges)) store.earnedBadges = saved.earnedBadges as string[];
  if (Array.isArray(saved.houseUpgrades)) store.houseUpgrades = saved.houseUpgrades as string[];
  if (saved.sickAnimals && typeof saved.sickAnimals === 'object') {
    store.sickAnimals = new Map(Object.entries(saved.sickAnimals as Record<string, IllnessDef>));
  }
  store.level = level ?? 1;
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

/**
 * Reset everything this module remembers between saves — the toast
 * throttle and the server version this device believes it holds.
 * Useful for tests and on full sign-out; the version in particular must
 * not survive into a different child's session on a shared iPad.
 */
export function resetSaveTracking(): void {
  lastSaveToastAt = 0;
  consecutiveSaveFailures = 0;
  known = null;
}

/** Everything worth keeping, in the shape the server stores it. */
function snapshot(store: GameStateStore): Record<string, unknown> {
  return {
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
  };
}

/**
 * Persist the store: this device first, then Supabase. No-op when not
 * signed in or Supabase isn't configured.
 *
 * The local write happens before the request and is not conditional on it.
 * That ordering is the point — when the network is the thing that fails,
 * the snapshot is already somewhere it will survive a closed lid, and the
 * next successful load can find it. On a cloud failure the child still gets
 * a throttled toast, because a flaky network otherwise spams one on every
 * action (we save on almost every interaction).
 */
export async function saveGameState(
  scene: Phaser.Scene,
  store: GameStateStore,
  /**
   * Internal. A save rejected as stale is re-sent once against the version
   * the server just reported; the retry passes `false` so a third device
   * saving in the gap cannot start a loop.
   */
  retryOnConflict = true,
): Promise<void> {
  const session = getSession();
  if (!session || !isSupabaseConfigured()) return;
  const userId = session.userId;

  const state = snapshot(store);
  const level = store.level;
  const expectedVersion = knownVersionFor(userId);

  // Local first, and never allowed to stop the cloud write — putLocalSave
  // resolves false rather than throwing when the device won't store it.
  await putLocalSave({
    userId, state, level, version: expectedVersion, synced: false, savedAt: Date.now(),
  });

  try {
    // Via the save-game Edge Function — see loadGameState for why the
    // direct table write could never satisfy the RLS policies.
    const { data, error } = await supabase.functions.invoke('save-game', {
      headers: sessionHeaders(),
      body: { state, level, expectedVersion },
    });

    if (error) {
      const rejected = await readConflict(error);
      if (rejected) {
        await handleConflict(scene, store, userId, rejected, retryOnConflict);
        return;
      }
      throw error;
    }

    const version = (data as { version?: number } | null)?.version;
    if (typeof version === 'number') {
      rememberVersion(userId, version);
      await markLocalSaveSynced(userId, version);
    }
    consecutiveSaveFailures = 0;  // reset on success
  } catch (err) {
    consecutiveSaveFailures += 1;
    console.warn('[saveGameState] cloud save failed:', err);
    const now = Date.now();
    if (now - lastSaveToastAt > 30_000) {
      lastSaveToastAt = now;
      showToast(scene, "Couldn't save to the cloud — we'll retry next action.");
    }
  }
}

/**
 * Pull the conflicting server state out of a rejected save.
 *
 * supabase-js reports a non-2xx from an Edge Function as a generic
 * "returned a non-2xx status code"; the status and the body live on the
 * error's `.context`, which is the raw Response. Returns null for anything
 * that is not a 409, so ordinary failures fall through to the retry path.
 */
async function readConflict(error: unknown): Promise<CloudSave | null> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || ctx.status !== 409 || typeof ctx.json !== 'function') return null;
  try {
    const body = await ctx.json() as { conflict?: boolean; save?: CloudSave };
    return body?.conflict && body.save ? body.save : null;
  } catch {
    return null;
  }
}

/**
 * A save was rejected because another device got there first.
 *
 * The server's copy is written to this device first, unconditionally: the
 * 409 body is the only record of what the other device did that this one
 * will ever hold, and dropping it is how the losing half of a conflict
 * disappears. Then the two shelters are merged against their common
 * ancestor and the merged one is what this device plays and re-sends.
 *
 * Applying the merge to the live store matters. Leaving it out would mean
 * the child carries on playing their own copy while the server holds the
 * merged one — and their next save, built on that unmerged store, would
 * overwrite the merge and lose the other device all over again.
 *
 * The child is told nothing. If the merge is right there is nothing for
 * them to do, and "your shelter looks different on this iPad" is true and
 * useless. The notes go to the console for whoever reads the bug report.
 */
async function handleConflict(
  scene: Phaser.Scene,
  store: GameStateStore,
  userId: string,
  serverSave: CloudSave,
  retry: boolean,
): Promise<void> {
  const serverVersion = typeof serverSave.version === 'number' ? serverSave.version : null;
  console.warn('[saveGameState] rejected as stale; another device has saved since', {
    expected: knownVersionFor(userId),
    server: serverVersion,
    serverUpdatedAt: serverSave.updatedAt,
  });

  const theirs = (serverSave.state ?? {}) as Record<string, unknown>;
  const theirLevel = serverSave.level ?? 1;

  await putRejectedSave({
    userId,
    state: theirs,
    level: theirLevel,
    version: serverVersion,
    synced: true,
    savedAt: Date.now(),
  });

  rememberVersion(userId, serverVersion);

  const base = await getBaseSave(userId);
  const merged = mergeSaveState(base?.state ?? null, snapshot(store), theirs, {
    mine: store.level,
    theirs: theirLevel,
  });
  console.warn('[saveGameState] merged two divergent shelters', {
    base: base?.version ?? 'none',
    notes: merged.notes,
  });
  applySavedState(store, merged.state, merged.level);

  if (retry) {
    await saveGameState(scene, store, false);
  } else {
    // Two collisions in a row means a third device is writing, or the
    // version we were handed was already stale. Leave it: the merged
    // snapshot is on this device, and the next action tries again from a
    // fresh version — merging once more against whatever has landed since.
    console.warn('[saveGameState] still stale after one retry; leaving it for the next save');
  }
}
