import { describe, it, expect } from 'vitest';
import {
  SPECIES_FACTS,
  pickRandomFact,
  countFactsForSpecies,
} from '../species-facts';
import type { Species } from '@arc/shared-types';

const ALL_SPECIES: Species[] = ['cat', 'dog', 'bunny', 'fox', 'bat', 'parrot', 'snake'];

describe('SPECIES_FACTS catalogue', () => {
  it('has at least 3 facts for every species', () => {
    for (const s of ALL_SPECIES) {
      expect(countFactsForSpecies(s)).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps every fact under 90 characters', () => {
    for (const f of SPECIES_FACTS) {
      expect(f.fact.length).toBeLessThanOrEqual(90);
    }
  });

  it('every fact has a non-empty icon', () => {
    for (const f of SPECIES_FACTS) {
      expect(f.icon.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('pickRandomFact', () => {
  it('returns a fact for a known species', () => {
    const f = pickRandomFact('cat', undefined, () => 0);
    expect(f).toBeDefined();
    expect(f!.species).toBe('cat');
  });

  it('prefers a variant-specific fact when one exists', () => {
    const f = pickRandomFact('cat', 'siamese', () => 0);
    expect(f).toBeDefined();
    expect(f!.variant).toBe('siamese');
  });

  it('falls back to a general fact when variant has no specific entry', () => {
    const f = pickRandomFact('fox', 'nonexistent-variant', () => 0);
    expect(f).toBeDefined();
    expect(f!.species).toBe('fox');
    expect(f!.variant).toBeUndefined();
  });

  it('returns different facts across seeds for general pool', () => {
    const first = pickRandomFact('dog', undefined, () => 0);
    const last = pickRandomFact('dog', undefined, () => 0.999);
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    // At least the general pool has multiple entries; with rng 0 and
    // rng ~1 we should get the first and last items respectively.
    expect(first).not.toStrictEqual(last);
  });

  it('works for every species', () => {
    for (const s of ALL_SPECIES) {
      const f = pickRandomFact(s, undefined, () => 0);
      expect(f).toBeDefined();
      expect(f!.species).toBe(s);
    }
  });
});
