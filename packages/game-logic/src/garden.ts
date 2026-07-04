/**
 * Garden let-out mechanics — pure logic.
 *
 * The garden is no longer pets-only. Sheltered/bonding animals can be
 * let outside by the player for a mood boost, and if a bonded pet of
 * the same species ("chaperone") is already in the garden the bond /
 * happiness lift is bigger — modelling real-world soft-socialisation
 * training where a confident, safe pet helps newcomers settle.
 *
 * Two zones (`lawn`, `quiet`) let incompatible pairs (enemies,
 * intolerant) use the garden simultaneously without clashing — each
 * can still chaperone their own species' visitors in their own zone.
 *
 * Everything here is pure — no IO, no mutation. Inputs are the store
 * shape; outputs are new animals / zones / decisions.
 */

import type {
  Animal,
  Species,
  GardenZone,
  AnimalRelationship,
  Weather,
} from '@arc/shared-types';
import { getRelationship } from './relationships';
import { getSpeciesRainTolerance } from './weather';
import { isDressedForWeather, dressingBlockReason } from './wardrobe';

// ── Temperament ──────────────────────────────────────────────

type Temperament = 'social' | 'cautious' | 'solitary';

/**
 * Natural outdoor-tolerance of each species. Drives the default zone
 * and the bond threshold required before the player can let the
 * animal out unsupervised.
 */
const SPECIES_TEMPERAMENT: Record<Species, Temperament> = {
  cat:    'social',     // though stereotypically aloof, gardens are cat heaven
  dog:    'social',
  bunny:  'social',
  parrot: 'social',
  fox:    'cautious',   // wild but recoverable — mid range
  bat:    'cautious',
  snake:  'solitary',   // prefers quiet corner; doesn't love crowds
  hedgehog: 'cautious', // shy wild mammal — settles with patience, like fox/bat
};

export function getSpeciesTemperament(species: Species): Temperament {
  return SPECIES_TEMPERAMENT[species];
}

/**
 * Minimum bond level required before the player can let this animal
 * outside unsupervised. A chaperone (bonded pet of same species
 * already in the garden) halves the threshold — a confident pet
 * tempers the newcomer's wariness, matching the real-world "older
 * friendly pet helps the rescue settle in" dynamic Marcus mentioned
 * re: his golden retriever.
 */
export function getOutsideBondThreshold(
  species: Species,
  hasChaperone: boolean,
): number {
  const base = SPECIES_TEMPERAMENT[species] === 'social' ? 10
    : SPECIES_TEMPERAMENT[species] === 'cautious' ? 25
    : 40;  // solitary
  return hasChaperone ? Math.floor(base / 2) : base;
}

// ── Chaperone lookup ─────────────────────────────────────────

/**
 * Is a bonded pet of the same species currently in the garden
 * (permanently as a pet, OR temporarily let-out)? True means the
 * incoming animal gets the softer bond threshold and the bigger
 * happiness lift when let outside.
 */
export function hasChaperoneInGarden(
  animal: Animal,
  allAnimals: Animal[],
): boolean {
  return allAnimals.some((a) =>
    a.id !== animal.id
    && a.species === animal.species
    && a.state === 'pet'
    && inGarden(a),
  );
}

/** Is this animal currently in the garden (as pet or outside-visitor)? */
export function inGarden(animal: Animal): boolean {
  if (animal.state === 'pet') return true;
  return !!animal.outsideAt;
}

// ── Gating: can the player let this animal outside? ──────────

export type LetOutsideBlock =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Check whether `animal` is allowed outside right now.
 *
 * Blocks if:
 *   - already a pet (they live there anyway)
 *   - still arriving (not welcomed yet)
 *   - already outside (use bringInside instead)
 *   - sick (belongs at the vet, not out)
 *   - not happy enough (< 30 happiness — they're too distressed)
 *   - bond is below the species threshold (halved if chaperone present)
 *   - weather is cold + animal is cold-intolerant + no coat equipped
 *   - weather is rainy + species HATES rain (cats, parrots, bats, snakes
 *     flat-out refuse — this is kid-comedy gold, the cat-looks-at-rain
 *     moment, not a permission thing)
 *
 * The weather gate is OPTIONAL — if `weather` is undefined, it's
 * skipped (e.g. in tests or legacy code before weather was wired in).
 *
 * Enemies being outside doesn't block — they get routed to the other
 * zone automatically via assignGardenZone.
 */
export function canLetOutside(
  animal: Animal,
  allAnimals: Animal[],
  sickAnimals: Map<string, unknown>,
  weather?: Weather,
): LetOutsideBlock {
  if (animal.state === 'pet') {
    return { ok: false, reason: "They're a pet — they already live in the garden!" };
  }
  if (animal.state === 'arriving') {
    return { ok: false, reason: 'Welcome them into the shelter first.' };
  }
  if (animal.outsideAt) {
    return { ok: false, reason: "They're already outside." };
  }
  if (sickAnimals.has(animal.id)) {
    return { ok: false, reason: 'Too sick to go out — see the vet first.' };
  }
  if (animal.happiness < 30) {
    return { ok: false, reason: 'Too upset right now — cheer them up first.' };
  }

  const hasChap = hasChaperoneInGarden(animal, allAnimals);
  const threshold = getOutsideBondThreshold(animal.species, hasChap);
  if (animal.bondLevel < threshold) {
    const short = threshold - animal.bondLevel;
    const chapHint = hasChap ? '' : ` (or bond with a ${animal.species} pet first)`;
    return {
      ok: false,
      reason: `Bond needs to be at least ${threshold} — ${short} more to go${chapHint}.`,
    };
  }

  if (weather) {
    // Coat gate — cold-intolerant species without appropriate dressing
    if (!isDressedForWeather(animal, weather)) {
      return { ok: false, reason: dressingBlockReason(animal, weather) ?? 'Needs proper clothing first.' };
    }
    // Rain-refusal — cats/parrots/bats/snakes refuse outright
    if ((weather === 'light_rain' || weather === 'heavy_rain')
        && getSpeciesRainTolerance(animal.species) === 'hates') {
      return {
        ok: false,
        reason: `${animal.name} looks at the rain. Then at you. Then at the rain. No way.`,
      };
    }
  }

  return { ok: true };
}

// ── Zone assignment ──────────────────────────────────────────

/**
 * Decide which garden zone an animal should sit in. Called on bonding
 * (pet entering garden for first time) and on let-out.
 *
 * Rules, in order:
 *   1. If any ENEMY is currently in 'lawn', put this animal in 'quiet'
 *      (and vice versa). Keeps incompatible pairs separated while
 *      letting both get garden time.
 *   2. Solitary species default to 'quiet'.
 *   3. If a bonded pet of the same species is in a specific zone,
 *      match that zone (chaperone lines up with its charges).
 *   4. Default: 'lawn'.
 */
export function assignGardenZone(
  animal: Animal,
  allAnimals: Animal[],
  relationships: AnimalRelationship[],
): GardenZone {
  const inLawn  = allAnimals.filter((a) => a.id !== animal.id && inGarden(a) && (a.gardenZone ?? 'lawn') === 'lawn');
  const inQuiet = allAnimals.filter((a) => a.id !== animal.id && inGarden(a) && a.gardenZone === 'quiet');

  // Rule 1: enemy separation
  const enemyInLawn  = inLawn.some((a) => getRelationship(relationships, animal.id, a.id) === 'enemy');
  const enemyInQuiet = inQuiet.some((a) => getRelationship(relationships, animal.id, a.id) === 'enemy');
  if (enemyInLawn && !enemyInQuiet) return 'quiet';
  if (enemyInQuiet && !enemyInLawn) return 'lawn';
  // If enemies on both sides (rare), prefer solitary-temp or lawn fallback.

  // Rule 2: solitary temperament
  if (SPECIES_TEMPERAMENT[animal.species] === 'solitary') return 'quiet';

  // Rule 3: follow same-species pet chaperone
  const chaperone = allAnimals.find((a) =>
    a.id !== animal.id
    && a.species === animal.species
    && a.state === 'pet'
    && inGarden(a),
  );
  if (chaperone && chaperone.gardenZone) {
    return chaperone.gardenZone;
  }

  // Default
  return 'lawn';
}

// ── Mutations (pure — return new Animal) ─────────────────────

/**
 * Transition an animal from indoors to outside. Applies a small
 * happiness lift (bigger if chaperoned) and auto-assigns a zone.
 * Caller must ensure canLetOutside() returned {ok:true} first.
 */
export function letOutside(
  animal: Animal,
  allAnimals: Animal[],
  relationships: AnimalRelationship[],
  now: Date = new Date(),
): Animal {
  const hasChap = hasChaperoneInGarden(animal, allAnimals);
  const happinessLift = hasChap ? 10 : 5;
  const zone = assignGardenZone(animal, allAnimals, relationships);
  return {
    ...animal,
    outsideAt: now.toISOString(),
    gardenZone: zone,
    happiness: Math.min(100, animal.happiness + happinessLift),
  };
}

/** Bring an outside visitor back indoors. Clears outsideAt; leaves
 *  gardenZone intact so a re-let-out defaults to the same zone. */
export function bringInside(animal: Animal): Animal {
  if (!animal.outsideAt) return animal;
  const next = { ...animal };
  delete next.outsideAt;
  return next;
}

/** Move an animal already in the garden to the opposite zone.
 *  No-op if they aren't in the garden. Useful when two compatible
 *  species were auto-routed into different zones and the player
 *  wants them together. */
export function switchZone(animal: Animal): Animal {
  if (!inGarden(animal)) return animal;
  const current = animal.gardenZone ?? 'lawn';
  return { ...animal, gardenZone: current === 'lawn' ? 'quiet' : 'lawn' };
}

// ── Queries for the view layer ───────────────────────────────

/** All animals currently in the garden (pets + outside visitors). */
export function gardenOccupants(allAnimals: Animal[]): Animal[] {
  return allAnimals.filter(inGarden);
}

/** Partition garden occupants into the two zones. Defaults undefined
 *  zone to 'lawn' (matches assignGardenZone's default). */
export function partitionByZone(allAnimals: Animal[]): {
  lawn: Animal[];
  quiet: Animal[];
} {
  const lawn: Animal[] = [];
  const quiet: Animal[] = [];
  for (const a of gardenOccupants(allAnimals)) {
    if (a.gardenZone === 'quiet') quiet.push(a);
    else lawn.push(a);
  }
  return { lawn, quiet };
}
