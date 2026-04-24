// ── Species Facts ──────────────────────────────────────────────
// Kid-friendly "did you know?" facts surfaced in the arrival popup
// when the player meets a new species (or variant). Short enough to
// fit on a painted cream-paper inset card without wrapping awkwardly.
//
// Rules of the road for facts:
//   - Under 90 characters (including punctuation).
//   - True-ish. Aim for delightful rather than textbook-exact.
//   - No scary/adult content — the audience is 7–9 year olds.
//   - Variant-specific facts are a nice-to-have for species with
//     especially distinct breeds (Siamese, Dalmatian, etc.).

import type { Species } from '@arc/shared-types';

export interface SpeciesFact {
  species: Species;
  variant?: string;
  fact: string;
  icon: string;
}

export const SPECIES_FACTS: SpeciesFact[] = [
  // ── Cats ──
  { species: 'cat', fact: 'Cats have 32 muscles in each ear for tracking tiny squeaks.', icon: '👂' },
  { species: 'cat', fact: 'A group of kittens is called a kindle!', icon: '🐾' },
  { species: 'cat', fact: 'Cats purr at a frequency that can help bones heal.', icon: '🎵' },
  { species: 'cat', variant: 'siamese', fact: 'Siamese cats were once temple guardians in Thailand.', icon: '🏯' },
  { species: 'cat', variant: 'persian', fact: 'Persian cats travelled the silk road with Italian traders.', icon: '🧳' },

  // ── Dogs ──
  { species: 'dog', fact: 'Dogs can learn over 150 words and simple human gestures.', icon: '💬' },
  { species: 'dog', fact: 'Every dog nose-print is as unique as a human fingerprint.', icon: '👃' },
  { species: 'dog', fact: 'Dogs sweat through their paws — that is why they pant to cool off.', icon: '🐾' },
  { species: 'dog', variant: 'dalmatian', fact: 'Dalmatians are born pure white — their spots appear later.', icon: '⚪' },
  { species: 'dog', variant: 'husky', fact: 'Huskies have two coats to stay warm at –50°C.', icon: '❄️' },

  // ── Bunnies ──
  { species: 'bunny', fact: 'Bunnies do happy jumps called "binkies" when they feel safe.', icon: '🎉' },
  { species: 'bunny', fact: 'A bunny has almost 360° vision — only a tiny blind spot in front.', icon: '👀' },
  { species: 'bunny', fact: 'Bunnies "purr" by softly grinding their teeth together.', icon: '🎵' },
  { species: 'bunny', variant: 'lionhead', fact: 'Lionhead bunnies get their fluffy manes from a single special gene.', icon: '🦁' },

  // ── Foxes ──
  { species: 'fox', fact: 'Foxes use the Earth\'s magnetic field to aim their pouncing.', icon: '🧭' },
  { species: 'fox', fact: 'A fox has whiskers on its legs as well as its face.', icon: '〰️' },
  { species: 'fox', fact: 'Foxes make over 40 different sounds, from barks to giggles.', icon: '🔊' },

  // ── Bats ──
  { species: 'bat', fact: 'Bats use echolocation — they "see" with their ears in the dark.', icon: '📡' },
  { species: 'bat', fact: 'A tiny pipistrelle bat weighs less than a £1 coin.', icon: '⚖️' },
  { species: 'bat', fact: 'Bats are the only mammals that can truly fly.', icon: '🦇' },
  { species: 'bat', variant: 'fruit', fact: 'Fruit bats help rainforests by spreading seeds as they fly.', icon: '🌳' },

  // ── Parrots ──
  { species: 'parrot', fact: 'Some parrots live past 80 — longer than many humans!', icon: '🎂' },
  { species: 'parrot', fact: 'Parrots can dance in time to music on purpose.', icon: '💃' },
  { species: 'parrot', fact: 'African greys can learn the meaning of over 100 words.', icon: '💬' },

  // ── Snakes ──
  { species: 'snake', fact: 'Snakes "smell" by flicking their tongue to catch tiny scent clues.', icon: '👅' },
  { species: 'snake', fact: 'A snake\'s jaw isn\'t really hinged — it stretches super stretchy.', icon: '🦴' },
  { species: 'snake', fact: 'Some snakes can go a whole year between big meals.', icon: '🍽️' },
];

/**
 * Pick a fact for the given species. When a variant is supplied and a
 * variant-specific fact exists, we prefer it — otherwise fall back to a
 * random general fact for the species.
 *
 * `rng` defaults to Math.random; pass a seeded fn in tests for
 * deterministic choices.
 */
export function pickRandomFact(
  species: Species,
  variant?: string,
  rng: () => number = Math.random,
): SpeciesFact | undefined {
  const all = SPECIES_FACTS.filter((f) => f.species === species);
  if (all.length === 0) return undefined;

  if (variant) {
    const variantMatches = all.filter((f) => f.variant === variant);
    if (variantMatches.length > 0) {
      return variantMatches[Math.floor(rng() * variantMatches.length)];
    }
  }

  // Prefer general (non-variant) facts when the variant didn't match.
  const general = all.filter((f) => !f.variant);
  const pool = general.length > 0 ? general : all;
  return pool[Math.floor(rng() * pool.length)];
}

/** Count facts available for a given species — handy for tests. */
export function countFactsForSpecies(species: Species): number {
  return SPECIES_FACTS.filter((f) => f.species === species).length;
}
