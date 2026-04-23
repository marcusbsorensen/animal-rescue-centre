import { describe, it, expect } from 'vitest';
import type { Animal, Species } from '@arc/shared-types';
import {
  TOY_DEFS,
  DEFAULT_TOY_FOR_SPECIES,
  ARRIVAL_TOY_PROBABILITY,
  rollArrivalToy,
  getAvailableToys,
  getToyBondBonus,
  getPlayToyId,
} from '../toys';

function makeAnimal(species: Species, overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'animal-1',
    name: 'Test',
    species,
    state: 'sheltered',
    arrivalStory: '',
    hunger: 30,
    tiredness: 20,
    happiness: 50,
    health: 100,
    bondLevel: 50,
    roomId: `room-${species}`,
    ...overrides,
  };
}

describe('toys catalogue', () => {
  it('provides a default toy for every species', () => {
    const speciesList: Species[] = ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake'];
    for (const s of speciesList) {
      const id = DEFAULT_TOY_FOR_SPECIES[s];
      expect(id, `default toy for ${s}`).toBeTruthy();
      const def = TOY_DEFS[id];
      expect(def, `TOY_DEFS entry for ${id}`).toBeDefined();
      expect(def.species).toContain(s);
    }
  });

  it('has coherent TOY_DEFS entries (id matches key, species non-empty)', () => {
    for (const [key, def] of Object.entries(TOY_DEFS)) {
      expect(def.id).toBe(key);
      expect(def.species.length).toBeGreaterThan(0);
      expect(def.emoji.length).toBeGreaterThan(0);
    }
  });
});

describe('rollArrivalToy', () => {
  it('returns a valid toy id or undefined', () => {
    const seen = new Set<string | undefined>();
    for (let i = 0; i < 200; i++) {
      const r = rollArrivalToy('cat');
      if (r !== undefined) {
        expect(TOY_DEFS[r]).toBeDefined();
        expect(TOY_DEFS[r].species).toContain('cat');
      }
      seen.add(r);
    }
    // over 200 rolls we should see both outcomes
    expect(seen.has(undefined)).toBe(true);
    expect([...seen].some((v) => v !== undefined)).toBe(true);
  });

  it('rolls an arrival toy at roughly the configured probability', () => {
    const N = 4000;
    let hits = 0;
    for (let i = 0; i < N; i++) {
      if (rollArrivalToy('dog') !== undefined) hits += 1;
    }
    const rate = hits / N;
    // Allow generous slack to keep the test non-flaky
    expect(rate).toBeGreaterThan(ARRIVAL_TOY_PROBABILITY - 0.08);
    expect(rate).toBeLessThan(ARRIVAL_TOY_PROBABILITY + 0.08);
  });

  it('always rolls a species-valid toy', () => {
    const species: Species[] = ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake'];
    for (const s of species) {
      for (let i = 0; i < 50; i++) {
        const r = rollArrivalToy(s);
        if (r) expect(TOY_DEFS[r].species).toContain(s);
      }
    }
  });
});

describe('getAvailableToys', () => {
  it('always includes the species default toy', () => {
    const a = makeAnimal('cat');
    const toys = getAvailableToys(a);
    expect(toys.map((t) => t.id)).toContain(DEFAULT_TOY_FOR_SPECIES.cat);
  });

  it('includes owned toys and de-duplicates', () => {
    const a = makeAnimal('cat', { toys: ['string', 'yarn-ball', 'feather'] });
    const ids = getAvailableToys(a).map((t) => t.id).sort();
    expect(ids).toEqual(['feather', 'string', 'yarn-ball']);
  });

  it('filters out toys that do not apply to this species', () => {
    // mealworm is bat-only; a cat carrying it by some bug should be
    // ignored by getAvailableToys.
    const a = makeAnimal('cat', { toys: ['mealworm'] });
    const ids = getAvailableToys(a).map((t) => t.id);
    expect(ids).not.toContain('mealworm');
    expect(ids).toContain('feather');
  });

  it('handles missing toys field (old save) gracefully', () => {
    const a = makeAnimal('dog');
    delete (a as Partial<Animal>).toys;
    const toys = getAvailableToys(a);
    expect(toys.map((t) => t.id)).toEqual([DEFAULT_TOY_FOR_SPECIES.dog]);
  });
});

describe('getToyBondBonus', () => {
  it('returns +1 when the toy matches arrivalToy', () => {
    const a = makeAnimal('cat', { arrivalToy: 'string', favouriteToy: 'string', toys: ['string'] });
    expect(getToyBondBonus(a, 'string')).toBe(1);
  });

  it('returns 0 when no arrivalToy', () => {
    const a = makeAnimal('cat');
    expect(getToyBondBonus(a, 'feather')).toBe(0);
  });

  it('returns 0 when toy does not match arrivalToy', () => {
    const a = makeAnimal('cat', { arrivalToy: 'string' });
    expect(getToyBondBonus(a, 'feather')).toBe(0);
  });
});

describe('getPlayToyId', () => {
  it('defaults to species default when no favourite set', () => {
    const a = makeAnimal('bunny');
    expect(getPlayToyId(a)).toBe(DEFAULT_TOY_FOR_SPECIES.bunny);
  });

  it('uses favouriteToy when valid for species', () => {
    const a = makeAnimal('cat', { favouriteToy: 'yarn-ball' });
    expect(getPlayToyId(a)).toBe('yarn-ball');
  });

  it('falls back to default when favouriteToy is invalid for species', () => {
    const a = makeAnimal('cat', { favouriteToy: 'mealworm' });
    expect(getPlayToyId(a)).toBe(DEFAULT_TOY_FOR_SPECIES.cat);
  });

  it('falls back to default when favouriteToy id is unknown', () => {
    const a = makeAnimal('dog', { favouriteToy: 'made-up-toy' });
    expect(getPlayToyId(a)).toBe(DEFAULT_TOY_FOR_SPECIES.dog);
  });
});
