// ── Adoption (L1 unblock) ──────────────────────────────────────
// Lily's first way to "exit" an animal from the shelter: pick a
// curtailed household applicant for a bonded animal and find them a
// home. This module is intentionally pure-logic — no scene deps, no
// I/O — so the adoption-office iframe and the GameScene can both call
// the same primitives.
//
// Phase 1 of docs/animal-flow-implementation-plan-2026-05-03.md.
// The L1 roster is the 5 hand-picked safe starter homes from the
// "Decisions LOCKED 2026-05-03 (Marcus)" section. The wider 32-cast
// roster lands in a later phase along with the 21-day cooldown.

import type { Animal, Species } from '@arc/shared-types';

/** A household applicant card shown in the adoption office. */
export interface Applicant {
  householdId: string;       // the cast.json id, e.g. '01-priya'
  name: string;              // display name, e.g. 'Priya "Pri" Kaur'
  avatarSrc: string;         // path to painted portrait under apps/game/public
  blurb: string;             // 1-sentence painted-storybook blurb
  speciesPreferences: Species[];
  capacity: number;          // how many pets they're willing to host total
}

/** A completed adoption — appended to store.rehomed. */
export interface RehomedEntry {
  animalId: string;
  animalName: string;
  species: Species;
  variant?: string;
  householdId: string;
  date: number; // epoch ms
}

/** Narrow shape of GameStateStore that this module needs. */
export interface AdoptionStoreLike {
  animals: Animal[];
  rehomed: RehomedEntry[];
}

/**
 * L1 curtailed roster — the 5 hand-picked safe starter households per
 * Marcus's locked decisions. These are the only households offered
 * before the centre unlocks the wider 32-household cast.
 *
 * `householdId` is the id `apps/game/public/data/cast.json` uses, because
 * that is how the game finds the household's species list (the +15 fee
 * bonus), its name and its portrait. These five were first written with
 * longer ids ('01-pri-kaur') that cast.json never had, so every lookup
 * missed; see LEGACY_HOUSEHOLD_IDS for how saves written under the old
 * ids are still read.
 *
 * Source: docs/rehoming-cast.md + docs/animal-flow-implementation-plan-2026-05-03.md
 *   (section "Decisions LOCKED 2026-05-03 (Marcus) > 1. L1 curtailed roster").
 */
export const L1_CURTAILED_HOUSEHOLD_DEFS: Applicant[] = [
  {
    householdId: '01-priya',
    name: 'Priya "Pri" Kaur',
    avatarSrc: '/admin/scene-assets/cast/01-priya.png',
    blurb:
      "A quiet flat with a sunny laptop spot — Pri would love a calm cat or a small dog who's happy indoors.",
    speciesPreferences: ['cat', 'dog'],
    capacity: 1,
  },
  {
    householdId: '03-nova',
    name: 'Nova Adebayo',
    avatarSrc: '/admin/scene-assets/cast/03-nova.png',
    blurb:
      'An attic art studio full of paint pots and music — Nova would love a playful cat for company.',
    speciesPreferences: ['cat'],
    capacity: 1,
  },
  {
    householdId: '04-babcia',
    name: 'Babcia Basia Kowalska',
    avatarSrc: '/admin/scene-assets/cast/04-babcia.png',
    blurb:
      'A cosy lap, a biscuit-crumbed pocket, and a cane by the door — Babcia would love a senior cat or tiny dog.',
    speciesPreferences: ['cat', 'dog'],
    capacity: 1,
  },
  {
    householdId: '06-hiro',
    name: 'Hiroshi "Hiro" Nakamura',
    avatarSrc: '/admin/scene-assets/cast/06-hiro.png',
    blurb:
      'A very quiet home with library books stacked by the chair — Hiro would love a sweet older cat for a gentle forever.',
    speciesPreferences: ['cat'],
    capacity: 1,
  },
  {
    householdId: '07-patel-greens',
    name: 'Anjali & Sam Patel-Green',
    avatarSrc: '/admin/scene-assets/cast/07-patel-greens.png',
    blurb:
      "A peaceful retirement home with two patient adults — they'd love a senior cat who needs a calm sunset chapter.",
    speciesPreferences: ['cat'],
    capacity: 1,
  },
];

/**
 * The ids the five L1 households carried before they were reconciled with
 * cast.json, mapped to the ids they carry now.
 *
 * A save is never rewritten to use the new ids. `store.rehomed` is
 * append-only history that merges across devices by union of whole
 * entries (merge-save.ts), so a device that rewrote its copy would meet a
 * server copy still holding the old ids and keep both — every adoption
 * doubled. Readers translate instead: anything that matches a stored
 * `householdId` against a household, or looks one up in cast.json, goes
 * through `canonicalHouseholdId` or `householdUseCount` first. A save
 * written under the old ids therefore keeps its history, and a household
 * that was full under the old id is still full under the new one.
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
 * How many rehomed animals a household has taken, counting entries
 * written under either of its ids.
 */
export function householdUseCount(
  rehomed: ReadonlyArray<{ householdId: string }>,
  householdId: string,
): number {
  const wanted = canonicalHouseholdId(householdId);
  return rehomed.filter((r) => canonicalHouseholdId(r.householdId) === wanted).length;
}

/**
 * Filter: which of the L1 (or wider) applicants are eligible for THIS
 * animal right now? Filters by:
 *   - speciesPreferences includes animal.species
 *   - capacity > number of times this household already appears in store.rehomed
 *   - cooldown (treated as 0 for L1 — Phase 5 lands the real 21-day cooldown)
 *
 * Returns [] if none eligible (caller decides what to show).
 */
export function getEligibleApplicants(
  animal: Animal,
  store: AdoptionStoreLike,
): Applicant[] {
  return L1_CURTAILED_HOUSEHOLD_DEFS.filter((h) => {
    if (!h.speciesPreferences.includes(animal.species)) return false;
    const used = householdUseCount(store.rehomed, h.householdId);
    if (used >= h.capacity) return false;
    return true;
  });
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
  const eligible = getEligibleApplicants(animal, store);
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
