// ── Adoption ───────────────────────────────────────────────────
// How an animal goes to a household: which households could take it right
// now, and the commit that moves it from the shelter to `store.rehomed`.
// Intentionally pure-logic — no scene deps, no I/O — so the adoption-office
// iframe and the GameScene can both call the same primitives.
//
// The households themselves live in ./adopter-roster, built from
// apps/game/public/data/cast.json. Adoption is one of the exits in
// docs/animal-exits.md; rewilding is another (./exits).

import type { Animal, Species } from '@arc/shared-types';
import { ADOPTER_HOUSEHOLD_DEFS } from './adopter-roster';
import { inGameDaysBetween } from './calendar';

/** A household applicant card shown in the adoption office. */
export interface Applicant {
  householdId: string;       // the cast.json id, e.g. '01-priya'
  name: string;              // display name, e.g. 'Priya "Pri" Kaur'
  avatarSrc: string;         // path to painted portrait under apps/game/public
  blurb: string;             // 1-sentence painted-storybook blurb
  speciesPreferences: Species[];
  /**
   * How many animals they take in within one cooldown window
   * (ADOPTION_COOLDOWN_DAYS). Once that many adoptions are fresh the
   * household is busy; it frees up again as the oldest one ages out.
   */
  capacity: number;
}

/**
 * A placement (a hog hospital, a wildlife park — PLACEMENTS in ./exits) is
 * recorded in `store.rehomed` like an adoption, under an id that starts with
 * this. No cast.json household has an id like it, so nothing mistakes a
 * keeper for a family; the visit scheduler asks `isPlacementId` to give a
 * placed animal's visitors the right things to say.
 */
export const PLACEMENT_ID_PREFIX = 'place:';

export function isPlacementId(householdId: string): boolean {
  return householdId.startsWith(PLACEMENT_ID_PREFIX);
}

/** A completed adoption — appended to store.rehomed. */
export interface RehomedEntry {
  animalId: string;
  animalName: string;
  species: Species;
  variant?: string;
  /** The cast.json household that took it, or a placement id (`isPlacementId`). */
  householdId: string;
  date: number; // epoch ms
}

/** Narrow shape of GameStateStore that this module needs. */
export interface AdoptionStoreLike {
  animals: Animal[];
  rehomed: RehomedEntry[];
}

/**
 * How long a household is busy settling in a new animal before it can take
 * another: 21 in-game days.
 *
 * "In-game day" is the calendar's (calendar.ts: one real week is a 30-day
 * month), so 21 days is about five real days — long enough that a child
 * meets a different family, short enough that nobody is used up forever.
 * The phase-per-task clock in time.ts keeps no day count, so the days are
 * counted from `RehomedEntry.date`, which every entry already carries.
 * Nothing new is stored.
 *
 * **One unit is in doubt.** "Decisions LOCKED 2026-05-03" §6 in
 * docs/animal-flow-implementation-plan-2026-05-03.md is headed "21 IN-GAME
 * DAYS" and then says "(3 in-game months)" — and at the calendar's rate
 * three in-game months is 21 REAL days, about 90 in-game days. One of the two
 * is a slip. This follows the heading. If three months was meant, the change
 * is this number: 90.
 *
 * **PROVISIONAL.** Marcus decides after playing it. The alternative is 90
 * in-game days, which is the "3 in-game months" the spec's own parenthetical
 * asks for (about 21 real days to a child, where 21 in-game days is about
 * five). Until he has, it stays at 21.
 */
export const ADOPTION_COOLDOWN_DAYS = 21;

/** The households that adopt. Re-exported here because callers ask adoption.ts. */
export { ADOPTER_HOUSEHOLD_DEFS };

/**
 * The ids the first five households carried before they were reconciled
 * with cast.json, mapped to the ids they carry now.
 *
 * A save is never rewritten to use the new ids. `store.rehomed` is
 * append-only history that merges across devices by union of whole
 * entries (merge-save.ts), so a device that rewrote its copy would meet a
 * server copy still holding the old ids and keep both — every adoption
 * doubled. Readers translate instead: anything that matches a stored
 * `householdId` against a household, or looks one up in cast.json, goes
 * through `canonicalHouseholdId` or `householdUseCount` first. A save
 * written under the old ids therefore keeps its history, and a household
 * that adopted under the old id is busy under the new one.
 *
 * Add to this map only when an id is renamed. Never remove an entry: a
 * save written under that id may still exist.
 */
export const LEGACY_HOUSEHOLD_IDS: Readonly<Record<string, string>> = {
  '01-pri-kaur': '01-priya',
  '03-nova-adebayo': '03-nova',
  '04-babcia-kowalska': '04-babcia',
  '06-hiro-nakamura': '06-hiro',
  '07-anjali-sam-patel-green': '07-patel-greens',
};

/** The current id for a household id read from a save, a visit or a caller. */
export function canonicalHouseholdId(householdId: string): string {
  return Object.prototype.hasOwnProperty.call(LEGACY_HOUSEHOLD_IDS, householdId)
    ? LEGACY_HOUSEHOLD_IDS[householdId]
    : householdId;
}

/**
 * How many rehomed animals a household has ever taken, counting entries
 * written under either of its ids. History, not availability: whether the
 * household can take another now is `householdActiveUseCount`.
 */
export function householdUseCount(
  rehomed: ReadonlyArray<{ householdId: string }>,
  householdId: string,
): number {
  const wanted = canonicalHouseholdId(householdId);
  return rehomed.filter((r) => canonicalHouseholdId(r.householdId) === wanted).length;
}

/**
 * How many of a household's adoptions are still inside the cooldown, counting
 * entries written under either of its ids. This is what capacity is measured
 * against.
 *
 * An entry with no usable date counts as long past. It cannot be placed in
 * time, and the alternative is a household that never frees up.
 */
export function householdActiveUseCount(
  rehomed: ReadonlyArray<{ householdId: string; date: number }>,
  householdId: string,
  now: number = Date.now(),
): number {
  const wanted = canonicalHouseholdId(householdId);
  return rehomed.filter(
    (r) =>
      canonicalHouseholdId(r.householdId) === wanted &&
      Number.isFinite(r.date) &&
      inGameDaysBetween(r.date, now) < ADOPTION_COOLDOWN_DAYS,
  ).length;
}

/** The households that would take this species, whether or not they are free. */
export function householdsForSpecies(species: Species): Applicant[] {
  return ADOPTER_HOUSEHOLD_DEFS.filter((h) => h.speciesPreferences.includes(species));
}

/**
 * Does any household adopt this species? False for fox, bat and hedgehog:
 * those animals leave by rewilding, or when they cannot be released by a
 * placement (both in exits.ts), and the adoption office has nothing to show
 * for them.
 */
export function isAdoptableSpecies(species: Species): boolean {
  return householdsForSpecies(species).length > 0;
}

/**
 * Filter: which households are eligible for THIS animal right now? Filters by:
 *   - speciesPreferences includes animal.species
 *   - capacity > the household's adoptions still inside the 21-day cooldown
 *
 * Returns [] if none eligible (caller decides what to show). That means
 * every household for this species is busy; it is not a permanent state, and
 * it is only ever true of a species `isAdoptableSpecies` says has households.
 *
 * `now` is epoch ms; tests pass it, the game leaves it.
 */
export function getEligibleApplicants(
  animal: Animal,
  store: AdoptionStoreLike,
  now: number = Date.now(),
): Applicant[] {
  return householdsForSpecies(animal.species).filter(
    (h) => householdActiveUseCount(store.rehomed, h.householdId, now) < h.capacity,
  );
}

/** Households the adoption office offers at once. Three cards a child can read. */
export const OFFERED_APPLICANTS = 3;

/** FNV-1a — a small stable hash, so the offer varies by animal without a random roll. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The few households the office puts in front of the child.
 *
 * With 29 households and 16 of them taking cats, showing everyone who is
 * eligible would be a wall of cards a child cannot read, so the office
 * offers three. Which three is not random, because the screen redraws on
 * every resize and a different family each time would be maddening:
 *
 *   1. Households that have waited longest come first — never-adopted
 *      before anyone, then by the date of their latest adoption. A family
 *      that has just freed up from its cooldown is behind the ones who have
 *      been waiting all along, so the faces rotate as the shelter works
 *      through the cast.
 *   2. Ties break on a hash of the animal's id and the household's, so two
 *      animals do not see the same three families.
 *
 * Everything returned is eligible. `commitAdoption` accepts any eligible
 * household, not only these.
 */
export function pickApplicants(
  animal: Animal,
  store: AdoptionStoreLike,
  now: number = Date.now(),
  limit: number = OFFERED_APPLICANTS,
): Applicant[] {
  const lastAdopted = (householdId: string): number => {
    const wanted = canonicalHouseholdId(householdId);
    let last = 0;
    for (const r of store.rehomed) {
      if (canonicalHouseholdId(r.householdId) === wanted && Number.isFinite(r.date)) {
        last = Math.max(last, r.date);
      }
    }
    return last;
  };
  return getEligibleApplicants(animal, store, now)
    .map((h) => ({
      h,
      last: lastAdopted(h.householdId),
      tie: hashString(`${animal.id}|${h.householdId}`),
    }))
    .sort((a, b) => a.last - b.last || a.tie - b.tie)
    .slice(0, Math.max(0, limit))
    .map((x) => x.h);
}

/**
 * Atomic commit:
 *   1. Verify animal exists in store.animals
 *   2. Verify household is currently eligible (defensive)
 *   3. Remove animal from store.animals
 *   4. Push RehomedEntry onto store.rehomed
 *   5. Return the entry
 *
 * Throws if the animal has already been removed (caller shouldn't
 * double-fire; we'd rather surface the bug than silently no-op).
 */
export function commitAdoption(
  animal: Animal,
  householdId: string,
  store: AdoptionStoreLike,
  now: number = Date.now(),
): RehomedEntry {
  const idx = store.animals.findIndex((a) => a.id === animal.id);
  if (idx < 0) {
    throw new Error(
      `commitAdoption: animal ${animal.id} (${animal.name}) not in store.animals`,
    );
  }

  // A caller still holding an old id gets the household it meant, and the
  // entry is written under the current one.
  const canonicalId = canonicalHouseholdId(householdId);
  const eligible = getEligibleApplicants(animal, store, now);
  if (!eligible.some((h) => h.householdId === canonicalId)) {
    throw new Error(
      `commitAdoption: household ${householdId} is not eligible for ${animal.id} (${animal.species})`,
    );
  }

  const entry: RehomedEntry = {
    animalId: animal.id,
    animalName: animal.name,
    species: animal.species,
    householdId: canonicalId,
    date: now,
  };
  if (animal.variant !== undefined) entry.variant = animal.variant;

  // All guards passed and the entry is fully built — only now mutate
  // the store, so a future guard added above can't leave us half-committed.
  store.animals.splice(idx, 1);
  store.rehomed.push(entry);
  return entry;
}
