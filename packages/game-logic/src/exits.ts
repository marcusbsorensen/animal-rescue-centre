// ── Exits: where an animal goes when it leaves the centre ──────
// docs/animal-exits.md: every animal leaves one way or another, and the
// shelter's caps exist because one child cannot care for hundreds — so
// leaving is the good outcome, never a failure to keep or a way of getting
// rid. This module holds the rules for three of those exits:
//
//   adopt   a household takes it home  (./adoption — the 29 households)
//   rewild  it goes back to its wild habitat  (here)
//   place   expert keepers look after it for good  (here)
//
// Which exits an animal has is a fact about the species, with one gate on
// top: whether the animal can be released. Cats and dogs are adopted; bunny
// and snake have the child's choice of adoption and the wild; a parrot is
// adopted and nothing else (it is not British wildlife, so it is never
// released here — see SPECIES_HABITATS in ./destinations); a fox, a bat and
// a hedgehog go back to the wild. An animal that cannot be released (its
// `chronicIllness` flag) is not offered the wild, and where adoption has no
// household for it a placement takes it instead. `exitsForAnimal` is the one
// place that says so, and every animal has at least one exit either way.
//
// The habitat for each species is `habitatForSpecies` in ./destinations,
// which is the animal-exits.md table (fox→moorland, bunny→woodland,
// hedgehog→woodland, bat→deep forest, snake→wetlands). Nothing here repeats
// it.
//
// Pure logic: no scene deps, no I/O.

import type { Animal, Species } from '@arc/shared-types';
import { PLACEMENT_ID_PREFIX, isAdoptableSpecies } from './adoption';
import type { AdoptionStoreLike, RehomedEntry } from './adoption';
import { HOG_HOSPITAL_NAME, getDestination, habitatForSpecies } from './destinations';
import type { RewildingHabitat } from './destinations';

export type ExitKind = 'adopt' | 'rewild' | 'place';

export interface SpeciesExits {
  adopt: boolean;
  rewild: boolean;
  place: boolean;
}

/** What the exit rules need to know about an animal. A whole `Animal` fits. */
export type ExitSubject = Pick<Animal, 'species' | 'chronicIllness'>;

/**
 * Can this animal not go back to the wild? True when it carries a lasting
 * condition (`Animal.chronicIllness`).
 *
 * This is the one gate on the wild. It is not `sickAnimals`: an animal that
 * is poorly now gets better and is released like any other, so poorly is not
 * a reason to send it to keepers. Only a condition that will not mend is.
 */
export function isUnreleasable(animal: Pick<Animal, 'chronicIllness'>): boolean {
  return animal.chronicIllness === true;
}

/**
 * Which of the exits above this animal has right now. A healthy fox has the
 * wild and nothing else; the same fox with a lasting condition has the
 * keepers and not the wild.
 */
export function exitsForAnimal(animal: ExitSubject): SpeciesExits {
  return {
    adopt: isAdoptableSpecies(animal.species),
    rewild: habitatForSpecies(animal.species) !== undefined && !isUnreleasable(animal),
    place: placementFor(animal) !== undefined,
  };
}

/** The exits of a healthy animal of this species. Every spawnable species has one. */
export function exitsForSpecies(species: Species): SpeciesExits {
  return exitsForAnimal({ species });
}

// ── Placements ─────────────────────────────────────────────────

/** When a placement takes a species: always, or only when it cannot be released. */
export type PlacementGate = 'always' | 'unreleasable';

/**
 * A place whose keepers look after an animal for good. It is a map
 * destination (`kind: 'placement'`, so there is a pin to drive to) and a row
 * of this table (which species it takes, and when).
 */
export interface Placement {
  /** Written to `RehomedEntry.householdId`; starts with PLACEMENT_ID_PREFIX. */
  id: string;
  /** The map destination. Its `label` is the name the child hears. */
  destinationId: string;
  /** Who goes there. Point another species at a place by adding it here. */
  takes: Readonly<Partial<Record<Species, PlacementGate>>>;
}

const HOG_HOSPITAL_ID = `${PLACEMENT_ID_PREFIX}hog-hospital`;

/**
 * Who is placed where.
 *
 * - The hog hospital takes a hedgehog that cannot be released. It is also
 *   the helper who sees a hedgehog that can be released back to the woods
 *   (REWILDING_HELPERS below): both sides of the same gate.
 * - The wildlife park takes a snake whenever the child chooses it, and a fox
 *   or a bat that cannot be released. It is the home for any animal that
 *   needs expert care the shelter cannot give, so a new species is one more
 *   line here.
 */
export const PLACEMENTS: readonly Placement[] = [
  {
    id: HOG_HOSPITAL_ID,
    destinationId: 'hog-hospital',
    takes: { hedgehog: 'unreleasable' },
  },
  {
    id: `${PLACEMENT_ID_PREFIX}wilderwood`,
    destinationId: 'wilderwood',
    takes: { snake: 'always', fox: 'unreleasable', bat: 'unreleasable' },
  },
];

/** Every placement that would take this animal now, in table order. */
export function placementsFor(animal: ExitSubject): Placement[] {
  return PLACEMENTS.filter((p) => {
    const gate = p.takes[animal.species];
    return gate === 'always' || (gate === 'unreleasable' && isUnreleasable(animal));
  });
}

/** The placement the Paths card goes to: the first that would take this animal. */
export function placementFor(animal: ExitSubject): Placement | undefined {
  return placementsFor(animal)[0];
}

/** Everything the ceremony needs to know about where the animal is going. */
export interface PlacementPlan {
  species: Species;
  placement: Placement;
  /** The map destination, e.g. 'wilderwood'. */
  destinationId: string;
  /** The place as a child hears it. The destination's label, so it is written once. */
  name: string;
  /** The map pin's glyph, for the Paths card. */
  emoji: string;
}

/** The plan for placing this animal, or undefined if no placement would take it. */
export function placementPlanFor(animal: ExitSubject): PlacementPlan | undefined {
  const placement = placementFor(animal);
  if (!placement) return undefined;
  const dest = getDestination(placement.destinationId);
  return {
    species: animal.species,
    placement,
    destinationId: placement.destinationId,
    name: dest?.label ?? placement.destinationId,
    emoji: dest?.emoji ?? '🏡',
  };
}

/**
 * Has the van reached a place that will take this animal? The twin of
 * `canReleaseAt`: it asks the placement table and the destination both, so
 * the two cannot disagree quietly.
 */
export function canPlaceAt(animal: ExitSubject, destinationId: string): boolean {
  if (getDestination(destinationId)?.arrival !== 'placement') return false;
  return placementsFor(animal).some((p) => p.destinationId === destinationId);
}

// ── Rewilding helpers ──────────────────────────────────────────

/** Someone, or somewhere, that helps an animal go back to the wild, and is named when it does. */
export interface RewildingHelper {
  /**
   * The cast.json id of a household, or the id of a placement when the helper
   * is a place. Written to `RewildedEntry.helperHouseholdId`.
   */
  householdId: string;
  /** How the ending says it: "Simeon & Karo", "Benji". */
  name: string;
  /** A household's portrait. A place has none. */
  avatarSrc?: string;
}

/**
 * Who sees a species back to the wild. Not adopters: this is how
 * cast.json's return visitors are used. `return_rhythm` says what each is
 * for — 'bat-rewilding-helper' (Simeon & Karo, Lily's aunt and uncle, with
 * Simeon the bat specialist) and 'wild-visit' (Benji, who helped rewild a red
 * fox a year ago). The hedgehog's helper is a place, not a household: the
 * hog hospital, which also keeps the hedgehogs that cannot be released (the
 * placement above). The test holds the households to cast.json.
 *
 * A species with no entry is rewilded without a named helper, and reads as
 * well as one with.
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
  hedgehog: {
    householdId: HOG_HOSPITAL_ID,
    name: HOG_HOSPITAL_NAME,
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

/**
 * The plan for releasing a healthy animal of this species, or undefined for a
 * species that is not released (cats, dogs, parrots). For a particular animal
 * ask `rewildingPlanForAnimal`, which also refuses one that cannot be released.
 */
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

/** The plan for releasing this animal, or undefined if it is not released or cannot be. */
export function rewildingPlanForAnimal(animal: ExitSubject): RewildingPlan | undefined {
  return isUnreleasable(animal) ? undefined : rewildingPlanFor(animal.species);
}

/**
 * Is the van at the right place to release this? The map has always
 * listed `suitableSpecies` on each habitat; the drive's arrival did not ask,
 * so a cat could be driven to the moor and let go. This asks, and it asks the
 * mapping and the destination both so the two tables cannot disagree quietly.
 *
 * Given a whole animal it also refuses one that cannot be released.
 */
export function canReleaseAt(subject: Species | ExitSubject, destinationId: string): boolean {
  const animal: ExitSubject = typeof subject === 'string' ? { species: subject } : subject;
  if (isUnreleasable(animal)) return false;
  if (habitatForSpecies(animal.species) !== destinationId) return false;
  return getDestination(destinationId)?.suitableSpecies?.includes(animal.species) ?? false;
}

// ── Committing an exit ─────────────────────────────────────────

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
 *   2. Verify it can go back to the wild: its species does (not a cat, a dog
 *      or a parrot) and it has no lasting condition
 *   3. Remove it from store.animals
 *   4. Push a RewildedEntry onto store.rewilded
 *
 * `rewilded` is kept apart from `rehomed` on purpose: two different grants
 * read them (Wildlife Trust and Community Foundation, charity.ts).
 *
 * Throws rather than quietly doing nothing, so a bad caller shows up. The
 * checks read the animal in the store, not the copy the caller holds, so a
 * stale copy cannot release an animal that has since been found unreleasable.
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
  if (isUnreleasable(current)) {
    throw new Error(
      `commitRewilding: ${current.id} (${current.name}) has a lasting condition and is not released; it goes to keepers`,
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

/**
 * Atomic commit of a placement. An animal placed with keepers has a home for
 * good, so it is recorded in `store.rehomed` — under the placement's id
 * rather than a household's (`isPlacementId`) — and counts wherever an
 * adoption counts.
 *
 *   1. Verify the animal is in store.animals
 *   2. Verify a placement takes it (its species is on a placement's list,
 *      and where the gate is `unreleasable`, it is)
 *   3. Remove it from store.animals
 *   4. Push a RehomedEntry onto store.rehomed
 *
 * There is no cooldown and no capacity, unlike a household. A household is
 * busy settling in one animal; the keepers are there for exactly these
 * animals, and an animal with nowhere else to go must not meet "try again in
 * a few days".
 *
 * Throws rather than quietly doing nothing, like its twins, and reads the
 * animal in the store rather than the caller's copy.
 */
export function commitPlacement(
  animal: Animal,
  store: AdoptionStoreLike,
  now: number = Date.now(),
): RehomedEntry {
  const idx = store.animals.findIndex((a) => a.id === animal.id);
  if (idx < 0) {
    throw new Error(
      `commitPlacement: animal ${animal.id} (${animal.name}) not in store.animals`,
    );
  }
  const current = store.animals[idx];
  const placement = placementFor(current);
  if (!placement) {
    throw new Error(
      `commitPlacement: no placement takes ${current.id} (${current.name}), a ${current.species}`,
    );
  }

  const entry: RehomedEntry = {
    animalId: current.id,
    animalName: current.name,
    species: current.species,
    householdId: placement.id,
    date: now,
  };
  if (current.variant !== undefined) entry.variant = current.variant;

  store.animals.splice(idx, 1);
  store.rehomed.push(entry);
  return entry;
}

// ── What the child reads and hears ─────────────────────────────

export interface ExitCopy {
  title: string;
  subtitle: string;
  /** The animal's own words, first person. */
  letter: string;
  sign: string;
  /** The button that completes it. Same words as the adoption plaque's. */
  button: string;
  rememberLine: string;
  /**
   * The line about visiting. Absent, the page says its own, which is about a
   * wild home — so a ceremony that is not a release sends one.
   */
  visitLine?: string;
  /** The toast once it is done. */
  toast: string;
}

/** The release ceremony's words. The same shape as a placement's, on the same page. */
export type RewildingCopy = ExitCopy;

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

/**
 * The words of a placement. The same register as a release and for the same
 * reason: this is a good ending, and the animal says so in its own voice.
 *
 * Nothing in it says why the animal is going there, and nothing in it says
 * what it cannot do. Do not add a sentence that explains. It says only where
 * the animal is going, that kind people are there, and that it will be
 * happy; and the place is named from the destination's label, never typed
 * here, so a rename is one line in ./destinations.
 */
export function placementCopy(animalName: string, plan: PlacementPlan): ExitCopy {
  const name = animalName.trim() || 'your friend';
  const where = plan.name;
  return {
    title: `A safe home for ${name}`,
    subtitle: `${where} will look after ${name}`,
    letter:
      'Thank you for taking such good care of me. ' +
      `Now I'm going to ${where}. ` +
      'Kind people there will look after me every day. ' +
      "I'll be so happy there!",
    sign: `Your friend always — ${name}`,
    button: 'WAVE THEM OFF!',
    rememberLine: `${name} will remember you`,
    visitLine: `Visit ${where} any time`,
    toast: `🏡 ${name} has a safe new home at ${where}!`,
  };
}

/**
 * What the Paths card for a placement says, built here so the page holds no
 * table. The title is short like its neighbours' ("Forever family", "Back to
 * the wild"); the blurb carries the place's name.
 */
export interface PlacementCard {
  badge: string;
  name: string;
  blurb: string;
}

export function placementCard(animalName: string, plan: PlacementPlan): PlacementCard {
  const name = animalName.trim() || 'your friend';
  return {
    badge: plan.emoji,
    name: 'A safe home',
    blurb: `${plan.name} will look after ${name}`,
  };
}

// ── Counting rescues across exits ──────────────────────────────

/**
 * How many animals of a species the child has rescued, in the centre or
 * since gone home. Species badges used to count only who was in the building,
 * which was a bug waiting for exits to work: every animal that left took the
 * child's progress with it.
 *
 * Disjoint by construction — an animal leaves `animals` when it is adopted,
 * placed or released — so nothing is counted twice. A placement is in
 * `rehomed`, so it is counted there.
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
