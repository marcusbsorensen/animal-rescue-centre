// ── Exits: where an animal goes when it leaves the centre ──────
// docs/animal-exits.md: every animal leaves one way or another, and the
// shelter's caps exist because one child cannot care for hundreds — so
// leaving is the good outcome, never a failure to keep or a way of getting
// rid. This module holds the rules for two of those exits:
//
//   adopt   a household takes it home  (./adoption — the 29 households)
//   rewild  it goes back to its wild habitat  (here)
//
// Which exit a species has is a fact about the species, not a flag on the
// animal: cats and dogs are adopted; fox, bat and hedgehog are rewilded
// (nobody adopts them); bunny, parrot and snake have both, and the child
// chooses on the Paths panel. `exitsForSpecies` is the one place that says so.
//
// The habitat for each species is `habitatForSpecies` in ./destinations,
// which is the animal-exits.md table (fox→moorland, bunny→woodland,
// hedgehog→woodland, parrot→sea cliffs, bat→deep forest, snake→wetlands).
// Nothing here repeats it.
//
// Pure logic: no scene deps, no I/O.

import type { Animal, Species } from '@arc/shared-types';
import { isAdoptableSpecies } from './adoption';
import { getDestination, habitatForSpecies } from './destinations';
import type { RewildingHabitat } from './destinations';

export type ExitKind = 'adopt' | 'rewild';

export interface SpeciesExits {
  adopt: boolean;
  rewild: boolean;
}

/** Which of the exits above this species has. Every spawnable species has one. */
export function exitsForSpecies(species: Species): SpeciesExits {
  return {
    adopt: isAdoptableSpecies(species),
    rewild: habitatForSpecies(species) !== undefined,
  };
}

// ── Rewilding helpers ──────────────────────────────────────────

/** A cast household that helps an animal go back to the wild, and is named when it does. */
export interface RewildingHelper {
  householdId: string;   // the cast.json id
  /** How the ending says it: "Simeon & Karo", "Benji". */
  name: string;
  avatarSrc: string;
}

/**
 * The people who see a species back to the wild. Not adopters: this is how
 * cast.json's return visitors are used. `return_rhythm` says what each is
 * for — 'bat-rewilding-helper' (Simeon & Karo, Lily's aunt and uncle, with
 * Simeon the bat specialist) and 'wild-visit' (Benji, who helped rewild a red
 * fox a year ago). The test holds this table to cast.json.
 *
 * A species with no entry is rewilded without a named helper, and reads as
 * well as one with. The hedgehog is one: no household in cast.json has to do
 * with hedgehogs, and none is invented for it.
 */
export const REWILDING_HELPERS: Readonly<Partial<Record<Species, RewildingHelper>>> = {
  bat: {
    householdId: '32-simeon-karo',
    name: 'Simeon & Karo',
    avatarSrc: '/admin/scene-assets/cast/32-simeon-karo.png',
  },
  fox: {
    householdId: '17-benji',
    name: 'Benji',
    avatarSrc: '/admin/scene-assets/cast/17-benji.png',
  },
};

/** The habitat as a child hears it: "home to ___". */
export const HABITAT_PHRASES: Readonly<Record<RewildingHabitat, string>> = {
  moorland: 'the moor',
  woodland: 'the woods',
  'sea-cliffs': 'the sea cliffs',
  'deep-forest': 'the deep forest',
  wetlands: 'the wetlands',
};

/** Everything the release ceremony needs to know about where, and with whom. */
export interface RewildingPlan {
  species: Species;
  habitat: RewildingHabitat;
  /** The map destination's label, e.g. 'Woodland'. */
  habitatLabel: string;
  /** e.g. 'the woods'. */
  habitatPhrase: string;
  helper?: RewildingHelper;
}

/** The plan for releasing this species, or undefined for one that is not released (cats, dogs). */
export function rewildingPlanFor(species: Species): RewildingPlan | undefined {
  const habitat = habitatForSpecies(species);
  if (!habitat) return undefined;
  const plan: RewildingPlan = {
    species,
    habitat,
    habitatLabel: getDestination(habitat)?.label ?? habitat,
    habitatPhrase: HABITAT_PHRASES[habitat],
  };
  const helper = REWILDING_HELPERS[species];
  if (helper) plan.helper = helper;
  return plan;
}

/**
 * Is the van at the right place to release this species? The map has always
 * listed `suitableSpecies` on each habitat; the drive's arrival did not ask,
 * so a cat could be driven to the moor and let go. This asks, and it asks the
 * mapping and the destination both so the two tables cannot disagree quietly.
 */
export function canReleaseAt(species: Species, destinationId: string): boolean {
  if (habitatForSpecies(species) !== destinationId) return false;
  return getDestination(destinationId)?.suitableSpecies?.includes(species) ?? false;
}

// ── Committing a release ───────────────────────────────────────

/** A completed release — appended to store.rewilded. */
export interface RewildedEntry {
  animalId: string;
  animalName: string;
  species: Species;
  variant?: string;
  date: number; // epoch ms
  /** Where it went. Absent on entries written before this was recorded. */
  habitat?: RewildingHabitat;
  /** Who helped, when someone did. Absent for most species. */
  helperHouseholdId?: string;
}

/** Narrow shape of GameStateStore that this module needs. */
export interface RewildingStoreLike {
  animals: Animal[];
  rewilded: RewildedEntry[];
}

/**
 * Atomic commit, the rewilding twin of `commitAdoption`:
 *   1. Verify the animal is in store.animals
 *   2. Verify its species can go back to the wild (not a cat or a dog)
 *   3. Remove it from store.animals
 *   4. Push a RewildedEntry onto store.rewilded
 *
 * `rewilded` is kept apart from `rehomed` on purpose: two different grants
 * read them (Wildlife Trust and Community Foundation, charity.ts).
 *
 * Throws rather than quietly doing nothing, so a bad caller shows up.
 */
export function commitRewilding(
  animal: Animal,
  store: RewildingStoreLike,
  now: number = Date.now(),
): RewildedEntry {
  const idx = store.animals.findIndex((a) => a.id === animal.id);
  if (idx < 0) {
    throw new Error(
      `commitRewilding: animal ${animal.id} (${animal.name}) not in store.animals`,
    );
  }
  const current = store.animals[idx];
  const plan = rewildingPlanFor(current.species);
  if (!plan) {
    throw new Error(
      `commitRewilding: ${current.id} is a ${current.species}, which does not go back to the wild`,
    );
  }

  const entry: RewildedEntry = {
    animalId: current.id,
    animalName: current.name,
    species: current.species,
    date: now,
    habitat: plan.habitat,
  };
  if (current.variant !== undefined) entry.variant = current.variant;
  if (plan.helper) entry.helperHouseholdId = plan.helper.householdId;

  store.animals.splice(idx, 1);
  store.rewilded.push(entry);
  return entry;
}

// ── What the child reads and hears ─────────────────────────────

export interface RewildingCopy {
  title: string;
  subtitle: string;
  /** The animal's own words, first person. */
  letter: string;
  sign: string;
  /** The button that completes it. Same words as the adoption plaque's. */
  button: string;
  rememberLine: string;
  /** The toast once it is done. */
  toast: string;
}

/**
 * The words of a release, in the register of the adoption plaque ("A forever
 * home for X" / "X are here to take X home" / "WAVE THEM OFF!"), because this
 * is the other half of the same good ending.
 *
 * Written to be read aloud to a child who cannot read it: short sentences,
 * the animal's own voice, a place it is going TO. Nothing in it is a
 * negative, a reason, or a comparison. The animal is not too wild, too
 * difficult or too many; it is going home to where it belongs, and thanks
 * the child for the care. Do not add a sentence that explains why.
 */
export function rewildingCopy(animalName: string, plan: RewildingPlan): RewildingCopy {
  const name = animalName.trim() || 'your friend';
  const where = plan.habitatPhrase;
  const who = plan.helper?.name;
  return {
    title: `A wild home for ${name}`,
    subtitle: who
      ? `${who} will take ${name} home to ${where}`
      : `${name} is going home to ${where}`,
    letter:
      'Thank you for taking such good care of me. ' +
      (who
        ? `${who} will take me home to ${where}, where I belong. `
        : `Now I'm going home to ${where}, where I belong. `) +
      "I'll be so happy there! I might pop back to say hello.",
    sign: `Your friend always — ${name}`,
    button: 'WAVE THEM OFF!',
    rememberLine: `${name} will remember you`,
    toast: who
      ? `🌲 ${who} took ${name} home to ${where}!`
      : `🌲 ${name} has gone home to ${where}!`,
  };
}

// ── Counting rescues across exits ──────────────────────────────

/**
 * How many animals of a species the child has rescued, in the centre or
 * since gone home. Species badges used to count only who was in the building,
 * which was a bug waiting for exits to work: every animal that left took the
 * child's progress with it.
 *
 * Disjoint by construction — an animal leaves `animals` when it is adopted or
 * released — so nothing is counted twice.
 */
export function lifetimeRescuedCount(
  species: Species,
  store: {
    animals: ReadonlyArray<{ species: Species }>;
    rehomed: ReadonlyArray<{ species: Species }>;
    rewilded: ReadonlyArray<{ species: Species }>;
  },
): number {
  const is = (x: { species: Species }) => x.species === species;
  return store.animals.filter(is).length + store.rehomed.filter(is).length + store.rewilded.filter(is).length;
}
