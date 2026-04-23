import { describe, it, expect } from 'vitest';
import type { Animal } from '@arc/shared-types';
import {
  getGarmentForSpecies,
  getWardrobeTextureKey,
  getWardrobeAnchor,
  equipWardrobe,
  unequipWardrobe,
  isDressedForWeather,
  dressingBlockReason,
} from '../wardrobe';

function makeAnimal(id: string, overrides: Partial<Animal> = {}): Animal {
  return {
    id,
    name: 'T ' + id,
    species: 'cat',
    state: 'sheltered',
    arrivalStory: '',
    hunger: 30,
    tiredness: 20,
    happiness: 50,
    health: 100,
    bondLevel: 50,
    roomId: 'room-cat',
    ...overrides,
  };
}

describe('getGarmentForSpecies', () => {
  it('maps species to garment type', () => {
    expect(getGarmentForSpecies('dog')).toBe('coat');
    expect(getGarmentForSpecies('fox')).toBe('coat');
    expect(getGarmentForSpecies('cat')).toBe('scarf');
    expect(getGarmentForSpecies('bunny')).toBe('scarf');
    expect(getGarmentForSpecies('bat')).toBe('scarf');
    expect(getGarmentForSpecies('parrot')).toBe('hat');
    expect(getGarmentForSpecies('snake')).toBe('hat');
  });
});

describe('getWardrobeTextureKey', () => {
  it('produces species-garment key', () => {
    expect(getWardrobeTextureKey('dog')).toBe('dog-coat');
    expect(getWardrobeTextureKey('parrot')).toBe('parrot-hat');
    expect(getWardrobeTextureKey('bat')).toBe('bat-scarf');
  });
});

describe('getWardrobeAnchor', () => {
  it('returns default for every species', () => {
    for (const sp of ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake'] as const) {
      const a = getWardrobeAnchor(sp);
      expect(a.widthFrac).toBeGreaterThan(0);
      expect(a.heightFrac).toBeGreaterThan(0);
    }
  });

  it('variant override wins over species override wins over default', () => {
    const overrides = {
      'cat': { dx: 0.1, dy: 0.1, widthFrac: 0.4, heightFrac: 0.2, rotation: 0 },
      'cat-ginger': { dx: 0.2, dy: 0.2, widthFrac: 0.5, heightFrac: 0.3, rotation: 10 },
    };
    // Default for dog unchanged
    expect(getWardrobeAnchor('dog', undefined, overrides).widthFrac).toBeGreaterThan(0);
    // Species-level override for cat
    expect(getWardrobeAnchor('cat', undefined, overrides).dx).toBe(0.1);
    // Variant override for cat-ginger
    expect(getWardrobeAnchor('cat', 'ginger', overrides).dx).toBe(0.2);
    // Non-matching variant falls back to species override
    expect(getWardrobeAnchor('cat', 'black', overrides).dx).toBe(0.1);
  });
});

describe('equipWardrobe / unequipWardrobe', () => {
  it('equips the correct garment for the species', () => {
    const cat = makeAnimal('c', { species: 'cat' });
    const dressed = equipWardrobe(cat, 'scarf');
    expect(dressed.wardrobe).toBe('scarf');
  });

  it('silently refuses wrong garment for species', () => {
    const cat = makeAnimal('c', { species: 'cat' });
    const result = equipWardrobe(cat, 'coat');
    expect(result.wardrobe).toBeUndefined();
    expect(result).toBe(cat);  // unchanged reference
  });

  it('unequip clears the garment', () => {
    const cat = makeAnimal('c', { species: 'cat', wardrobe: 'scarf' });
    const stripped = unequipWardrobe(cat);
    expect(stripped.wardrobe).toBeUndefined();
  });

  it('unequip is a no-op if nothing equipped', () => {
    const cat = makeAnimal('c', { species: 'cat' });
    expect(unequipWardrobe(cat)).toBe(cat);
  });

  it('does not mutate input', () => {
    const cat = makeAnimal('c', { species: 'cat' });
    equipWardrobe(cat, 'scarf');
    expect(cat.wardrobe).toBeUndefined();
  });
});

describe('isDressedForWeather', () => {
  const cat = makeAnimal('c', { species: 'cat' });
  const catWithScarf = makeAnimal('c', { species: 'cat', wardrobe: 'scarf' });
  const husky = makeAnimal('h', { species: 'dog', variant: 'husky' });
  const pug = makeAnimal('p', { species: 'dog', variant: 'pug' });

  it('true when no coat needed (warm weather)', () => {
    expect(isDressedForWeather(cat, 'sunny')).toBe(true);
    expect(isDressedForWeather(cat, 'cloudy')).toBe(true);
  });

  it('husky does not need a coat even in snow', () => {
    expect(isDressedForWeather(husky, 'snow')).toBe(true);
  });

  it('cold-intolerant animal needs a garment in snow', () => {
    expect(isDressedForWeather(cat, 'snow')).toBe(false);
    expect(isDressedForWeather(catWithScarf, 'snow')).toBe(true);
    expect(isDressedForWeather(pug, 'snow')).toBe(false);
  });
});

describe('dressingBlockReason', () => {
  it('null when no coat needed', () => {
    const cat = makeAnimal('c', { species: 'cat' });
    expect(dressingBlockReason(cat, 'sunny')).toBeNull();
  });

  it('null when animal has appropriate garment', () => {
    const cat = makeAnimal('c', { species: 'cat', wardrobe: 'scarf' });
    expect(dressingBlockReason(cat, 'snow')).toBeNull();
  });

  it('descriptive message when animal needs dressing for snow', () => {
    const cat = makeAnimal('c', { species: 'cat', name: 'Whiskers' });
    const reason = dressingBlockReason(cat, 'snow');
    expect(reason).toContain('Whiskers');
    expect(reason).toContain('scarf');
    expect(reason).toContain('cold');
  });

  it('references the correct garment per species', () => {
    const dog = makeAnimal('d', { species: 'dog', name: 'Rex' });
    expect(dressingBlockReason(dog, 'snow')).toContain('coat');
    const parrot = makeAnimal('p', { species: 'parrot', name: 'Kiwi' });
    expect(dressingBlockReason(parrot, 'snow')).toContain('hat');
  });
});
