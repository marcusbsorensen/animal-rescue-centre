import { describe, it, expect, beforeEach } from 'vitest';
import type { Animal, Species } from '@arc/shared-types';
import {
  L1_CURTAILED_HOUSEHOLD_DEFS,
  getEligibleApplicants,
  commitAdoption,
  type AdoptionStoreLike,
} from '../adoption';

function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'a1',
    name: 'Whiskers',
    species: 'cat',
    state: 'pet',
    arrivalStory: 'found at the gate',
    hunger: 0,
    tiredness: 0,
    happiness: 100,
    health: 100,
    bondLevel: 100,
    roomId: 'room-cat',
    ...overrides,
  };
}

function makeStore(animals: Animal[] = []): AdoptionStoreLike {
  return {
    animals: [...animals],
    rehomed: [],
  };
}

describe('L1_CURTAILED_HOUSEHOLD_DEFS', () => {
  it('contains exactly 5 hand-picked starter households', () => {
    expect(L1_CURTAILED_HOUSEHOLD_DEFS).toHaveLength(5);
  });

  it('uses the documented household IDs', () => {
    expect(L1_CURTAILED_HOUSEHOLD_DEFS.map((h) => h.householdId).sort()).toEqual([
      '01-pri-kaur',
      '03-nova-adebayo',
      '04-babcia-kowalska',
      '06-hiro-nakamura',
      '07-anjali-sam-patel-green',
    ]);
  });

  it('points each avatar at /admin/scene-assets/cast/<id>.png', () => {
    for (const h of L1_CURTAILED_HOUSEHOLD_DEFS) {
      expect(h.avatarSrc).toBe(`/admin/scene-assets/cast/${h.householdId}.png`);
    }
  });
});

describe('getEligibleApplicants', () => {
  it('returns the dog-loving subset for a dog animal (Pri + Babcia)', () => {
    const animal = makeAnimal({ species: 'dog' });
    const eligible = getEligibleApplicants(animal, makeStore([animal]));
    const ids = eligible.map((h) => h.householdId).sort();
    expect(ids).toEqual(['01-pri-kaur', '04-babcia-kowalska']);
  });

  it('returns all 5 households for a cat animal', () => {
    const animal = makeAnimal({ species: 'cat' });
    const eligible = getEligibleApplicants(animal, makeStore([animal]));
    expect(eligible).toHaveLength(5);
  });

  it('returns [] for a snake (none of the L1 households take snakes)', () => {
    const animal = makeAnimal({ species: 'snake' });
    const eligible = getEligibleApplicants(animal, makeStore([animal]));
    expect(eligible).toEqual([]);
  });

  it('excludes a household whose capacity is already met', () => {
    const animal = makeAnimal({ species: 'cat' });
    const store = makeStore([animal]);
    store.rehomed.push({
      animalId: 'old-1',
      animalName: 'Mittens',
      species: 'cat',
      householdId: '03-nova-adebayo',
      date: 1,
    });
    const eligible = getEligibleApplicants(animal, store);
    expect(eligible.map((h) => h.householdId)).not.toContain('03-nova-adebayo');
    expect(eligible).toHaveLength(4);
  });

  it('includes a household with capacity 1 and zero prior rehomings', () => {
    const animal = makeAnimal({ species: 'cat' });
    const eligible = getEligibleApplicants(animal, makeStore([animal]));
    expect(eligible.map((h) => h.householdId)).toContain('06-hiro-nakamura');
  });
});

describe('commitAdoption', () => {
  let animal: Animal;
  let store: AdoptionStoreLike;

  beforeEach(() => {
    animal = makeAnimal();
    store = makeStore([animal]);
  });

  it('removes the animal from store.animals', () => {
    commitAdoption(animal, '03-nova-adebayo', store, 1000);
    expect(store.animals).toHaveLength(0);
  });

  it('appends a RehomedEntry with correct fields', () => {
    const entry = commitAdoption(animal, '03-nova-adebayo', store, 1234);
    expect(store.rehomed).toHaveLength(1);
    expect(entry).toEqual({
      animalId: 'a1',
      animalName: 'Whiskers',
      species: 'cat',
      householdId: '03-nova-adebayo',
      date: 1234,
    });
    expect(store.rehomed[0]).toEqual(entry);
  });

  it('preserves variant from the animal if set', () => {
    animal.variant = 'ginger';
    const entry = commitAdoption(animal, '03-nova-adebayo', store, 1000);
    expect(entry.variant).toBe('ginger');
    expect(store.rehomed[0].variant).toBe('ginger');
  });

  it('uses the now argument for the date field', () => {
    const entry = commitAdoption(animal, '03-nova-adebayo', store, 99999);
    expect(entry.date).toBe(99999);
  });

  it('throws if the animal is not in store.animals', () => {
    const orphan = makeAnimal({ id: 'ghost' });
    expect(() => commitAdoption(orphan, '03-nova-adebayo', store, 1000)).toThrow();
  });

  it('throws if the household is not eligible (wrong species)', () => {
    const dogAnimal = makeAnimal({ species: 'dog' });
    const dogStore = makeStore([dogAnimal]);
    // Nova only takes cats
    expect(() => commitAdoption(dogAnimal, '03-nova-adebayo', dogStore, 1000)).toThrow();
  });

  it('after a commit, eligible applicants for a 2nd same-species animal exclude that household', () => {
    commitAdoption(animal, '03-nova-adebayo', store, 1000);
    const second = makeAnimal({ id: 'a2', name: 'Tabby' });
    store.animals.push(second);
    const eligible = getEligibleApplicants(second, store);
    expect(eligible.map((h) => h.householdId)).not.toContain('03-nova-adebayo');
  });

  it('mutates the rehomed array reference (does not replace it)', () => {
    const ref = store.rehomed;
    commitAdoption(animal, '03-nova-adebayo', store, 1000);
    expect(store.rehomed).toBe(ref);
  });

  it('throws if capacity is already exhausted at commit time (race-tap guard)', () => {
    // Simulate two UI taps racing: a prior commit for the same household
    // already used its only capacity slot. The second commit must refuse
    // rather than over-fill.
    store.rehomed.push({
      animalId: 'old-1',
      animalName: 'Mittens',
      species: 'cat',
      householdId: '03-nova-adebayo',
      date: 1,
    });
    expect(() => commitAdoption(animal, '03-nova-adebayo', store, 1000)).toThrow();
    // And the store must be untouched — animal still present, no new entry.
    expect(store.animals).toHaveLength(1);
    expect(store.rehomed).toHaveLength(1);
  });
});
