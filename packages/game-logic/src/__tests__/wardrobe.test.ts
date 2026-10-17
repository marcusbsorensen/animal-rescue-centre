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
  animalNeedsGarment,
  canBeDressed,
  SPECIES_AWAITING_GARMENT_ART,
  WARDROBE_COLOURS,
  DEFAULT_WARDROBE_HEX,
  normaliseHex,
  parseWardrobe,
  formatWardrobe,
  wardrobeHex,
} from '../wardrobe';
import { needsCoat } from '../weather';

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

describe('getWardrobeAnchor — one entry per sprite', () => {
  const entry = (dx: number) => ({ dx, dy: 0, widthFrac: 0.3, heightFrac: 0.2, rotation: 0 });
  const table = {
    'cat-ginger-sheltered': entry(0.1),   // the variant's own sprite
    'cat-sheltered': entry(0.2),          // the species-level fallback sprite
    'cat-ginger': entry(0.3),
    'cat': entry(0.4),
  };

  it('prefers the sprite itself, then the species-level sprite for the pose', () => {
    expect(getWardrobeAnchor('cat', 'ginger', table, 'sheltered').dx).toBe(0.1);
    // Her variant art has not arrived: the species-level sprite is drawn, and
    // the caller says so by passing no variant. Its anchor is its own.
    expect(getWardrobeAnchor('cat', undefined, table, 'sheltered').dx).toBe(0.2);
  });

  it('falls back from a pose with no entry to the variant, then the species', () => {
    expect(getWardrobeAnchor('cat', 'ginger', table, 'sleeping').dx).toBe(0.3);
    expect(getWardrobeAnchor('cat', 'black', table, 'sleeping').dx).toBe(0.4);
  });

  it('answers from the built-in default when there is no table at all', () => {
    const a = getWardrobeAnchor('dog', 'husky', undefined, 'walking');
    expect(a.widthFrac).toBeGreaterThan(0);
    expect(a.heightFrac).toBeGreaterThan(0);
  });
});

describe('what animal.wardrobe says', () => {
  it('reads the garment and the colour the child picked', () => {
    expect(parseWardrobe('coat:#c0392b')).toEqual({ garment: 'coat', hex: '#c0392b' });
    expect(parseWardrobe('scarf:#2C3E50')).toEqual({ garment: 'scarf', hex: '#2c3e50' });
    expect(parseWardrobe('hat:#abc')).toEqual({ garment: 'hat', hex: '#aabbcc' });
  });

  it('reads a bare garment, which is what equipWardrobe has always written', () => {
    expect(parseWardrobe('scarf')).toEqual({ garment: 'scarf' });
  });

  it('keeps the garment when the colour cannot be read, and refuses a name that is no garment', () => {
    expect(parseWardrobe('coat:#nope')).toEqual({ garment: 'coat' });
    expect(parseWardrobe('cape:#c0392b')).toBeNull();
    expect(parseWardrobe('')).toBeNull();
    expect(parseWardrobe(undefined)).toBeNull();
  });

  it('round-trips through formatWardrobe', () => {
    for (const { hex } of WARDROBE_COLOURS) {
      expect(parseWardrobe(formatWardrobe('hat', hex))).toEqual({ garment: 'hat', hex });
    }
    expect(formatWardrobe('coat')).toBe('coat');
    expect(formatWardrobe('coat', 'rubbish')).toBe('coat');
  });

  it('wears the default colour when the code names none', () => {
    expect(wardrobeHex('coat')).toBe(DEFAULT_WARDROBE_HEX);
    expect(wardrobeHex(undefined)).toBe(DEFAULT_WARDROBE_HEX);
    expect(wardrobeHex('coat:#27ae60')).toBe('#27ae60');
  });

  it('offers six colours, each a hex that reads back as itself', () => {
    expect(WARDROBE_COLOURS).toHaveLength(6);
    for (const { hex } of WARDROBE_COLOURS) expect(normaliseHex(hex)).toBe(hex);
    expect(new Set(WARDROBE_COLOURS.map((c) => c.hex)).size).toBe(6);
  });

  it('equipWardrobe writes the colour when given one, so it can be drawn', () => {
    const cat = makeAnimal('c', { species: 'cat' });
    expect(equipWardrobe(cat, 'scarf', '#e3b04b').wardrobe).toBe('scarf:#e3b04b');
    expect(equipWardrobe(cat, 'scarf').wardrobe).toBe('scarf');
  });
});

describe('a species with no garment art drawn yet', () => {
  const hedgehog = makeAnimal('h', { species: 'hedgehog', variant: 'brown' });

  it('is the hedgehog, and only the hedgehog', () => {
    expect([...SPECIES_AWAITING_GARMENT_ART]).toEqual(['hedgehog']);
    expect(canBeDressed('hedgehog')).toBe(false);
    expect(canBeDressed('cat')).toBe(true);
  });

  it('is not made to wear one: snow is a reason to dress a cat and not a hedgehog', () => {
    // The weather alone says a hedgehog needs a scarf ...
    expect(needsCoat(hedgehog, 'snow')).toBe(true);
    // ... but there is none to put on, so the gate must not ask for it.
    expect(animalNeedsGarment(hedgehog, 'snow')).toBe(false);
    expect(isDressedForWeather(hedgehog, 'snow')).toBe(true);
    expect(dressingBlockReason(hedgehog, 'snow')).toBeNull();
    // Everyone else is unchanged.
    const cat = makeAnimal('c', { species: 'cat' });
    expect(animalNeedsGarment(cat, 'snow')).toBe(true);
    expect(isDressedForWeather(cat, 'snow')).toBe(false);
  });
});
