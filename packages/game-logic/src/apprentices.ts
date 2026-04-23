/**
 * Apprentice system — the growth mechanic that turns three specific
 * kids from the neighbouring households into A.R.C. volunteers.
 *
 * Each apprentice, once recruited, unlocks a different capacity
 * expansion (extra daily care task, extra cat slot, extra species
 * slot). The cast for A.R.C. defines the three apprentice-eligible
 * kids in `docs/rehoming-cast.md`; this module is the runtime.
 *
 * Design notes:
 *  - We persist the full apprentice list on the save, plus a cached
 *    `apprenticeUnlocks` bag derived from it. The cache is never the
 *    source of truth — `recruitApprentice` rebuilds it from the list
 *    every time — but it's read hot in HUD / rescue code and keeping
 *    a cached summary avoids threading the fold through every caller.
 *  - Preconditions are deliberately gentle. The apprentice system is
 *    the sparkle-and-celebrate part of the game; the gate (level ≥ 2,
 *    household must exist in cast) is there to pace discovery, not to
 *    punish.
 */
export interface ApprenticeUnlocks {
  extraCareTasksPerDay: number;
  extraCatSlots: number;
  extraSpeciesSlots: number;
}

export interface ApprenticeEntry {
  id: string;
  householdId: string;
  recruitedAt: number;
  role: string;
}

export interface ApprenticeStoreSlice {
  level: number;
  apprentices: ApprenticeEntry[];
  apprenticeUnlocks: ApprenticeUnlocks;
}

export type ApprenticeId = 'rhubarb' | 'amara' | 'kofi';

interface ApprenticeDef {
  id: ApprenticeId;
  householdId: string;
  name: string;
  role: string;
  unlockDescription: string;
  applyUnlock: (u: ApprenticeUnlocks) => ApprenticeUnlocks;
}

/**
 * Canonical apprentice registry. Household IDs match the cast JSON
 * entries referenced in `docs/rehoming-cast.md`.
 */
export const APPRENTICE_DEFS: Record<ApprenticeId, ApprenticeDef> = {
  rhubarb: {
    id: 'rhubarb',
    householdId: '30-two-houses',
    name: 'Rhubarb',
    role: 'feeder',
    unlockDescription: 'Unlocks an extra daily care task',
    applyUnlock: (u) => ({ ...u, extraCareTasksPerDay: u.extraCareTasksPerDay + 1 }),
  },
  amara: {
    id: 'amara',
    householdId: '13-kumar-ishii',
    name: 'Amara',
    role: 'cat-whisperer',
    unlockDescription: 'Unlocks an extra cat rescue slot',
    applyUnlock: (u) => ({ ...u, extraCatSlots: u.extraCatSlots + 1 }),
  },
  kofi: {
    id: 'kofi',
    householdId: '14-theo-grandkids',
    name: 'Kofi',
    role: 'bookworm',
    unlockDescription: 'Unlocks a new species slot',
    applyUnlock: (u) => ({ ...u, extraSpeciesSlots: u.extraSpeciesSlots + 1 }),
  },
};

/** Minimum level required before the apprentice system opens up. */
export const APPRENTICE_MIN_LEVEL = 2;

/** Which cast household IDs the player must have encountered for an
 *  apprentice to be recruitable. A hard-coded mirror of cast.json —
 *  good enough for the MVP since these IDs never change; if cast.json
 *  is ever refactored this list comes with it. */
const KNOWN_HOUSEHOLD_IDS: readonly string[] = [
  '13-kumar-ishii',
  '14-theo-grandkids',
  '30-two-houses',
];

export interface CanRecruitResult {
  ok: boolean;
  reason?: string;
}

/**
 * Gate check for the recruit button. Deliberately permissive: we only
 * block impossible states (unknown apprentice, missing household,
 * already recruited, under-levelled).
 */
export function canRecruit(
  apprenticeId: string,
  store: ApprenticeStoreSlice,
): CanRecruitResult {
  const def = APPRENTICE_DEFS[apprenticeId as ApprenticeId];
  if (!def) return { ok: false, reason: 'Unknown apprentice.' };
  if (!KNOWN_HOUSEHOLD_IDS.includes(def.householdId)) {
    return { ok: false, reason: "You haven't met their family yet." };
  }
  if (isApprenticeRecruited(apprenticeId, store)) {
    return { ok: false, reason: `${def.name} is already an apprentice.` };
  }
  if ((store.level ?? 1) < APPRENTICE_MIN_LEVEL) {
    return { ok: false, reason: `Reach level ${APPRENTICE_MIN_LEVEL} first.` };
  }
  return { ok: true };
}

/**
 * Recruit an apprentice. Mutates the passed store (we follow the
 * existing A.R.C. pattern of mutable store mutation rather than
 * immutable returns). Safe to call after a precondition miss —
 * throws synchronously so callers can surface the reason.
 */
export function recruitApprentice(
  apprenticeId: string,
  store: ApprenticeStoreSlice,
): ApprenticeStoreSlice {
  const check = canRecruit(apprenticeId, store);
  if (!check.ok) throw new Error(check.reason ?? 'Cannot recruit.');
  const def = APPRENTICE_DEFS[apprenticeId as ApprenticeId];
  store.apprentices.push({
    id: def.id,
    householdId: def.householdId,
    recruitedAt: Date.now(),
    role: def.role,
  });
  store.apprenticeUnlocks = recomputeApprenticeUnlocks(store.apprentices);
  return store;
}

/** Fold the current apprentice list into the derived unlock cache. */
export function recomputeApprenticeUnlocks(
  apprentices: ApprenticeEntry[],
): ApprenticeUnlocks {
  let unlocks: ApprenticeUnlocks = {
    extraCareTasksPerDay: 0,
    extraCatSlots: 0,
    extraSpeciesSlots: 0,
  };
  for (const entry of apprentices) {
    const def = APPRENTICE_DEFS[entry.id as ApprenticeId];
    if (!def) continue;  // unknown id — ignore rather than crash on save migration
    unlocks = def.applyUnlock(unlocks);
  }
  return unlocks;
}

export function isApprenticeRecruited(
  apprenticeId: string,
  store: ApprenticeStoreSlice,
): boolean {
  return (store.apprentices ?? []).some((a) => a.id === apprenticeId);
}
