import { describe, it, expect } from 'vitest';
import { spawnAnimal, spawnSiblingPair, pickRandomSpecies, shouldSpawnSiblings, pickRandomVariant, SPECIES_VARIANTS } from '../animals';

describe('spawnAnimal', () => {
  it('creates an animal with correct species', () => {
    const cat = spawnAnimal('cat');
    expect(cat.species).toBe('cat');
    expect(cat.state).toBe('arriving');
    expect(cat.bondLevel).toBe(0);
    expect(cat.roomId).toBe('room-cat');
  });

  it('has a name and arrival story', () => {
    const dog = spawnAnimal('dog');
    expect(dog.name.length).toBeGreaterThan(0);
    expect(dog.arrivalStory.length).toBeGreaterThan(0);
  });

  it('starts with reasonable needs values', () => {
    const fox = spawnAnimal('fox');
    expect(fox.hunger).toBeGreaterThanOrEqual(60);
    expect(fox.hunger).toBeLessThan(90);
    expect(fox.happiness).toBeLessThan(30);
  });

  it('can have a sibling link', () => {
    const a = spawnAnimal('cat', 'sib-123');
    expect(a.siblingId).toBe('sib-123');
  });
});

describe('spawnSiblingPair', () => {
  it('creates two animals of the same species linked to each other', () => {
    const [a, b] = spawnSiblingPair('bunny');
    expect(a.species).toBe('bunny');
    expect(b.species).toBe('bunny');
    expect(a.siblingId).toBe(b.id);
    expect(b.siblingId).toBe(a.id);
  });
});

describe('pickRandomSpecies', () => {
  it('returns a species from the unlocked set', () => {
    const unlocked = ['cat', 'dog'] as const;
    for (let i = 0; i < 20; i++) {
      const s = pickRandomSpecies([...unlocked]);
      expect(unlocked).toContain(s);
    }
  });
});

describe('shouldSpawnSiblings', () => {
  it('returns a boolean', () => {
    const result = shouldSpawnSiblings();
    expect(typeof result).toBe('boolean');
  });
});

describe('pickRandomVariant', () => {
  it('returns a valid variant for each species', () => {
    for (const [species, variants] of Object.entries(SPECIES_VARIANTS)) {
      for (let i = 0; i < 10; i++) {
        const v = pickRandomVariant(species as any);
        expect(variants).toContain(v);
      }
    }
  });
});

describe('animal variant assignment', () => {
  it('spawned animals get a variant', () => {
    const cat = spawnAnimal('cat');
    expect(cat.variant).toBeDefined();
    expect(SPECIES_VARIANTS.cat).toContain(cat.variant);
  });

  it('sibling pairs get independent variants', () => {
    const [a, b] = spawnSiblingPair('dog');
    expect(a.variant).toBeDefined();
    expect(b.variant).toBeDefined();
    expect(SPECIES_VARIANTS.dog).toContain(a.variant);
    expect(SPECIES_VARIANTS.dog).toContain(b.variant);
  });
});
