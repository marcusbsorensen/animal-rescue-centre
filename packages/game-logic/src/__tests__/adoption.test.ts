import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Animal, Species } from '@arc/shared-types';
import {
  L1_CURTAILED_HOUSEHOLD_DEFS,
  LEGACY_HOUSEHOLD_IDS,
  canonicalHouseholdId,
  householdUseCount,
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

const PUBLIC_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../apps/game/public',
);

/** The ids cast.json carries — the only ones `findCast` can find. */
const CAST_IDS: string[] = (
  JSON.parse(readFileSync(resolve(PUBLIC_ROOT, 'data/cast.json'), 'utf8')) as {
    cast: Array<{ id: string }>;
  }
).cast.map((c) => c.id);

describe('L1_CURTAILED_HOUSEHOLD_DEFS', () => {
  it('contains exactly 5 hand-picked starter households', () => {
    expect(L1_CURTAILED_HOUSEHOLD_DEFS).toHaveLength(5);
  });

  it('uses the documented household IDs', () => {
    expect(L1_CURTAILED_HOUSEHOLD_DEFS.map((h) => h.householdId).sort()).toEqual([
      '01-priya',
      '03-nova',
      '04-babcia',
      '06-hiro',
      '07-patel-greens',
    ]);
  });

  it('uses ids that cast.json knows', () => {
    // The bug this guards: the roster said '01-priya' where cast.json
    // says '01-priya', so GameScene.findCast missed for every household —
    // no +15 species bonus, "The family" in every toast, and a returning
    // visitor degraded to a toast.
    for (const h of L1_CURTAILED_HOUSEHOLD_DEFS) {
      expect(CAST_IDS, `${h.householdId} is not in cast.json`).toContain(h.householdId);
    }
  });

  it('points each avatar at a portrait that exists on disk', () => {
    // Regression guard: asserts the path resolves to a real asset under
    // apps/game/public rather than a guessed convention, so a bad path
    // fails here instead of silently dropping to the painted-initials
    // fallback in-game.
    for (const h of L1_CURTAILED_HOUSEHOLD_DEFS) {
      expect(h.avatarSrc.startsWith('/admin/scene-assets/cast/')).toBe(true);
      const onDisk = resolve(PUBLIC_ROOT, `.${h.avatarSrc}`);
      expect(existsSync(onDisk), `${h.householdId}: missing ${h.avatarSrc}`).toBe(true);
    }
  });
});

describe('getEligibleApplicants', () => {
  it('returns the dog-loving subset for a dog animal (Pri + Babcia)', () => {
    const animal = makeAnimal({ species: 'dog' });
    const eligible = getEligibleApplicants(animal, makeStore([animal]));
    const ids = eligible.map((h) => h.householdId).sort();
    expect(ids).toEqual(['01-priya', '04-babcia']);
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
      householdId: '03-nova',
      date: 1,
    });
    const eligible = getEligibleApplicants(animal, store);
    expect(eligible.map((h) => h.householdId)).not.toContain('03-nova');
    expect(eligible).toHaveLength(4);
  });

  it('includes a household with capacity 1 and zero prior rehomings', () => {
    const animal = makeAnimal({ species: 'cat' });
    const eligible = getEligibleApplicants(animal, makeStore([animal]));
    expect(eligible.map((h) => h.householdId)).toContain('06-hiro');
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
    commitAdoption(animal, '03-nova', store, 1000);
    expect(store.animals).toHaveLength(0);
  });

  it('appends a RehomedEntry with correct fields', () => {
    const entry = commitAdoption(animal, '03-nova', store, 1234);
    expect(store.rehomed).toHaveLength(1);
    expect(entry).toEqual({
      animalId: 'a1',
      animalName: 'Whiskers',
      species: 'cat',
      householdId: '03-nova',
      date: 1234,
    });
    expect(store.rehomed[0]).toEqual(entry);
  });

  it('preserves variant from the animal if set', () => {
    animal.variant = 'ginger';
    const entry = commitAdoption(animal, '03-nova', store, 1000);
    expect(entry.variant).toBe('ginger');
    expect(store.rehomed[0].variant).toBe('ginger');
  });

  it('uses the now argument for the date field', () => {
    const entry = commitAdoption(animal, '03-nova', store, 99999);
    expect(entry.date).toBe(99999);
  });

  it('throws if the animal is not in store.animals', () => {
    const orphan = makeAnimal({ id: 'ghost' });
    expect(() => commitAdoption(orphan, '03-nova', store, 1000)).toThrow();
  });

  it('throws if the household is not eligible (wrong species)', () => {
    const dogAnimal = makeAnimal({ species: 'dog' });
    const dogStore = makeStore([dogAnimal]);
    // Nova only takes cats
    expect(() => commitAdoption(dogAnimal, '03-nova', dogStore, 1000)).toThrow();
  });

  it('after a commit, eligible applicants for a 2nd same-species animal exclude that household', () => {
    commitAdoption(animal, '03-nova', store, 1000);
    const second = makeAnimal({ id: 'a2', name: 'Tabby' });
    store.animals.push(second);
    const eligible = getEligibleApplicants(second, store);
    expect(eligible.map((h) => h.householdId)).not.toContain('03-nova');
  });

  it('mutates the rehomed array reference (does not replace it)', () => {
    const ref = store.rehomed;
    commitAdoption(animal, '03-nova', store, 1000);
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
      householdId: '03-nova',
      date: 1,
    });
    expect(() => commitAdoption(animal, '03-nova', store, 1000)).toThrow();
    // And the store must be untouched — animal still present, no new entry.
    expect(store.animals).toHaveLength(1);
    expect(store.rehomed).toHaveLength(1);
  });
});

/** The five ids the roster carried before it was reconciled with cast.json. */
const OLD_IDS = {
  priya: '01-pri-kaur',
  nova: '03-nova-adebayo',
  babcia: '04-babcia-kowalska',
  hiro: '06-hiro-nakamura',
  patelGreens: '07-anjali-sam-patel-green',
};

describe('household ids written before the roster matched cast.json', () => {
  // A save that has rehomed an animal holds the id the roster used at the
  // time. Those entries are history and are never rewritten (merge-save
  // unions rehomed by whole entry, so a rewrite would double them against
  // a copy that still has the old id), which means the readers have to
  // understand both.

  const oldEntry = (householdId: string, animalId = 'old-1') => ({
    animalId,
    animalName: 'Mittens',
    species: 'cat' as Species,
    householdId,
    date: 1,
  });

  describe('canonicalHouseholdId', () => {
    it('maps every old id to the id cast.json uses', () => {
      expect(canonicalHouseholdId(OLD_IDS.priya)).toBe('01-priya');
      expect(canonicalHouseholdId(OLD_IDS.nova)).toBe('03-nova');
      expect(canonicalHouseholdId(OLD_IDS.babcia)).toBe('04-babcia');
      expect(canonicalHouseholdId(OLD_IDS.hiro)).toBe('06-hiro');
      expect(canonicalHouseholdId(OLD_IDS.patelGreens)).toBe('07-patel-greens');
    });

    it('has exactly the five old ids, each pointing at a roster household in cast.json', () => {
      expect(Object.keys(LEGACY_HOUSEHOLD_IDS).sort()).toEqual(Object.values(OLD_IDS).sort());
      const roster = L1_CURTAILED_HOUSEHOLD_DEFS.map((h) => h.householdId);
      for (const target of Object.values(LEGACY_HOUSEHOLD_IDS)) {
        expect(roster).toContain(target);
        expect(CAST_IDS).toContain(target);
      }
    });

    it('leaves current ids, other cast ids and strangers alone', () => {
      expect(canonicalHouseholdId('01-priya')).toBe('01-priya');
      expect(canonicalHouseholdId('14-theo-grandkids')).toBe('14-theo-grandkids');
      expect(canonicalHouseholdId('wild-a1')).toBe('wild-a1');
      expect(canonicalHouseholdId('')).toBe('');
    });

    it('does not read inherited object keys as aliases', () => {
      expect(canonicalHouseholdId('constructor')).toBe('constructor');
      expect(canonicalHouseholdId('toString')).toBe('toString');
      expect(canonicalHouseholdId('__proto__')).toBe('__proto__');
    });
  });

  describe('householdUseCount', () => {
    it('counts entries written under either id', () => {
      const rehomed = [
        oldEntry(OLD_IDS.nova, 'a'),
        oldEntry('03-nova', 'b'),
        oldEntry('06-hiro', 'c'),
      ];
      expect(householdUseCount(rehomed, '03-nova')).toBe(2);
      expect(householdUseCount(rehomed, OLD_IDS.nova)).toBe(2);
      expect(householdUseCount(rehomed, '06-hiro')).toBe(1);
      expect(householdUseCount(rehomed, '01-priya')).toBe(0);
    });
  });

  describe('a fresh save', () => {
    it('offers every roster household, and each can take its first animal', () => {
      const animal = makeAnimal({ species: 'cat' });
      const store = makeStore([animal]);
      const eligible = getEligibleApplicants(animal, store);
      expect(eligible.map((h) => h.householdId).sort()).toEqual(
        ['01-priya', '03-nova', '04-babcia', '06-hiro', '07-patel-greens'],
      );
      const entry = commitAdoption(animal, '07-patel-greens', store, 1000);
      expect(entry.householdId).toBe('07-patel-greens');
    });

    it('writes a new adoption under the current id, never the old one', () => {
      const animal = makeAnimal({ species: 'dog' });
      const store = makeStore([animal]);
      const entry = commitAdoption(animal, '04-babcia', store, 1000);
      expect(Object.values(OLD_IDS)).not.toContain(entry.householdId);
      expect(store.rehomed[0].householdId).toBe('04-babcia');
    });
  });

  describe('a save holding old-style ids', () => {
    it('does not hand a full household its capacity back', () => {
      const animal = makeAnimal({ species: 'cat' });
      const store = makeStore([animal]);
      store.rehomed.push(oldEntry(OLD_IDS.nova));

      const eligible = getEligibleApplicants(animal, store).map((h) => h.householdId);
      expect(eligible).not.toContain('03-nova');
      expect(eligible).toHaveLength(4);
    });

    it('holds for each of the five households', () => {
      for (const [current, old] of [
        ['01-priya', OLD_IDS.priya],
        ['03-nova', OLD_IDS.nova],
        ['04-babcia', OLD_IDS.babcia],
        ['06-hiro', OLD_IDS.hiro],
        ['07-patel-greens', OLD_IDS.patelGreens],
      ]) {
        const animal = makeAnimal({ species: 'cat' });
        const store = makeStore([animal]);
        store.rehomed.push(oldEntry(old));
        const eligible = getEligibleApplicants(animal, store).map((h) => h.householdId);
        expect(eligible, `${old} should still fill ${current}`).not.toContain(current);
      }
    });

    it('refuses a commit into a household that was filled under the old id', () => {
      const animal = makeAnimal({ species: 'cat' });
      const store = makeStore([animal]);
      store.rehomed.push(oldEntry(OLD_IDS.hiro));

      expect(() => commitAdoption(animal, '06-hiro', store, 1000)).toThrow();
      expect(() => commitAdoption(animal, OLD_IDS.hiro, store, 1000)).toThrow();
      // Untouched: the animal is still here and the history has not grown.
      expect(store.animals).toHaveLength(1);
      expect(store.rehomed).toHaveLength(1);
    });

    it('keeps the old entries exactly as they were', () => {
      const animal = makeAnimal({ species: 'cat' });
      const store = makeStore([animal]);
      const old = oldEntry(OLD_IDS.nova);
      store.rehomed.push(old);

      getEligibleApplicants(animal, store);
      commitAdoption(animal, '06-hiro', store, 1000);

      expect(store.rehomed[0]).toBe(old);
      expect(store.rehomed[0].householdId).toBe(OLD_IDS.nova);
    });

    it('takes a commit that still names the old id, and records the current one', () => {
      const animal = makeAnimal({ species: 'cat' });
      const store = makeStore([animal]);
      const entry = commitAdoption(animal, OLD_IDS.priya, store, 1000);
      expect(entry.householdId).toBe('01-priya');
    });

    it('leaves the other dog household open when one is full under the old id', () => {
      const animal = makeAnimal({ species: 'dog' });
      const store = makeStore([animal]);
      store.rehomed.push(oldEntry(OLD_IDS.priya));
      // Pri is full under her old id; Babcia is the other dog household.
      const eligible = getEligibleApplicants(animal, store).map((h) => h.householdId);
      expect(eligible).toEqual(['04-babcia']);
    });
  });
});
