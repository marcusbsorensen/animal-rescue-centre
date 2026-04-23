import { describe, it, expect } from 'vitest';
import type { Animal, AnimalRelationship, Species } from '@arc/shared-types';
import {
  getSpeciesTemperament,
  getOutsideBondThreshold,
  hasChaperoneInGarden,
  inGarden,
  canLetOutside,
  assignGardenZone,
  letOutside,
  bringInside,
  switchZone,
  gardenOccupants,
  partitionByZone,
} from '../garden';

function makeAnimal(id: string, overrides: Partial<Animal> = {}): Animal {
  return {
    id,
    name: 'Test ' + id,
    species: 'cat',
    state: 'sheltered',
    arrivalStory: '',
    hunger: 30,
    tiredness: 20,
    happiness: 80,
    health: 100,
    bondLevel: 50,
    roomId: 'room-cat',
    ...overrides,
  };
}

const noRels: AnimalRelationship[] = [];
const noSick = new Map<string, unknown>();

// ── getSpeciesTemperament ────────────────────────────────────

describe('getSpeciesTemperament', () => {
  it('returns social for cat/dog/bunny/parrot', () => {
    const social: Species[] = ['cat', 'dog', 'bunny', 'parrot'];
    for (const sp of social) expect(getSpeciesTemperament(sp)).toBe('social');
  });
  it('returns cautious for fox/bat', () => {
    expect(getSpeciesTemperament('fox')).toBe('cautious');
    expect(getSpeciesTemperament('bat')).toBe('cautious');
  });
  it('returns solitary for snake', () => {
    expect(getSpeciesTemperament('snake')).toBe('solitary');
  });
});

// ── getOutsideBondThreshold ──────────────────────────────────

describe('getOutsideBondThreshold', () => {
  it('uses base 10/25/40 without chaperone', () => {
    expect(getOutsideBondThreshold('cat', false)).toBe(10);
    expect(getOutsideBondThreshold('fox', false)).toBe(25);
    expect(getOutsideBondThreshold('snake', false)).toBe(40);
  });
  it('halves threshold with chaperone', () => {
    expect(getOutsideBondThreshold('cat', true)).toBe(5);
    expect(getOutsideBondThreshold('fox', true)).toBe(12);
    expect(getOutsideBondThreshold('snake', true)).toBe(20);
  });
});

// ── inGarden ─────────────────────────────────────────────────

describe('inGarden', () => {
  it('true for pet state', () => {
    expect(inGarden(makeAnimal('a', { state: 'pet' }))).toBe(true);
  });
  it('true when outsideAt is set', () => {
    expect(inGarden(makeAnimal('a', { outsideAt: '2026-04-18T12:00:00Z' }))).toBe(true);
  });
  it('false for sheltered without outsideAt', () => {
    expect(inGarden(makeAnimal('a', { state: 'sheltered' }))).toBe(false);
  });
});

// ── hasChaperoneInGarden ─────────────────────────────────────

describe('hasChaperoneInGarden', () => {
  it('true when same-species pet is in garden', () => {
    const incoming = makeAnimal('incoming', { species: 'dog', state: 'sheltered' });
    const pet = makeAnimal('pet', { species: 'dog', state: 'pet' });
    expect(hasChaperoneInGarden(incoming, [incoming, pet])).toBe(true);
  });
  it('false when same-species pet is NOT in garden (non-pet state)', () => {
    const incoming = makeAnimal('incoming', { species: 'dog', state: 'sheltered' });
    const other   = makeAnimal('other',    { species: 'dog', state: 'sheltered' });
    expect(hasChaperoneInGarden(incoming, [incoming, other])).toBe(false);
  });
  it('false when pet is a different species', () => {
    const incoming = makeAnimal('incoming', { species: 'dog', state: 'sheltered' });
    const catPet   = makeAnimal('pet',      { species: 'cat', state: 'pet' });
    expect(hasChaperoneInGarden(incoming, [incoming, catPet])).toBe(false);
  });
  it('ignores self', () => {
    const self = makeAnimal('a', { species: 'dog', state: 'pet' });
    expect(hasChaperoneInGarden(self, [self])).toBe(false);
  });
});

// ── canLetOutside ────────────────────────────────────────────

describe('canLetOutside', () => {
  it('blocks pets', () => {
    const a = makeAnimal('a', { state: 'pet' });
    expect(canLetOutside(a, [a], noSick).ok).toBe(false);
  });
  it('blocks arriving', () => {
    const a = makeAnimal('a', { state: 'arriving' });
    expect(canLetOutside(a, [a], noSick).ok).toBe(false);
  });
  it('blocks already-outside', () => {
    const a = makeAnimal('a', { outsideAt: '2026-04-18T12:00:00Z' });
    expect(canLetOutside(a, [a], noSick).ok).toBe(false);
  });
  it('blocks sick animals', () => {
    const a = makeAnimal('a');
    const sick = new Map<string, unknown>([['a', { any: 'thing' }]]);
    expect(canLetOutside(a, [a], sick).ok).toBe(false);
  });
  it('blocks unhappy (<30)', () => {
    const a = makeAnimal('a', { happiness: 20 });
    expect(canLetOutside(a, [a], noSick).ok).toBe(false);
  });
  it('blocks when bond is below species threshold', () => {
    const a = makeAnimal('a', { species: 'snake', bondLevel: 20 }); // needs 40
    const res = canLetOutside(a, [a], noSick);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('40');
  });
  it('allows a bonded cat with bond 10', () => {
    const a = makeAnimal('a', { species: 'cat', bondLevel: 10 });
    expect(canLetOutside(a, [a], noSick).ok).toBe(true);
  });
  it('allows a snake with bond 20 when chaperone present (halved threshold)', () => {
    const incoming  = makeAnimal('snk', { species: 'snake', bondLevel: 20 });
    const chaperone = makeAnimal('chap', { species: 'snake', state: 'pet' });
    expect(canLetOutside(incoming, [incoming, chaperone], noSick).ok).toBe(true);
  });

  it('weather gate ignored when weather arg omitted', () => {
    const cat = makeAnimal('c', { species: 'cat', bondLevel: 50 });
    expect(canLetOutside(cat, [cat], noSick).ok).toBe(true);
  });

  it('cat refuses to go out in rain', () => {
    const cat = makeAnimal('c', { species: 'cat', bondLevel: 50, name: 'Whiskers' });
    const res = canLetOutside(cat, [cat], noSick, 'light_rain');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('rain');
  });

  it('dog happily accepts rain', () => {
    const dog = makeAnimal('d', { species: 'dog', variant: 'golden', bondLevel: 50 });
    expect(canLetOutside(dog, [dog], noSick, 'heavy_rain').ok).toBe(true);
  });

  it('parrot blocked in snow without hat', () => {
    const parrot = makeAnimal('p', { species: 'parrot', bondLevel: 50 });
    const res = canLetOutside(parrot, [parrot], noSick, 'snow');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('hat');
  });

  it('parrot allowed in snow once wearing hat', () => {
    const parrot = makeAnimal('p', { species: 'parrot', bondLevel: 50, wardrobe: 'hat' });
    expect(canLetOutside(parrot, [parrot], noSick, 'snow').ok).toBe(true);
  });

  it('husky not blocked by snow even without coat', () => {
    const husky = makeAnimal('h', { species: 'dog', variant: 'husky', bondLevel: 50 });
    expect(canLetOutside(husky, [husky], noSick, 'snow').ok).toBe(true);
  });
});

// ── assignGardenZone ─────────────────────────────────────────

describe('assignGardenZone', () => {
  it('sends solitary species to quiet', () => {
    const snake = makeAnimal('s', { species: 'snake', state: 'pet' });
    expect(assignGardenZone(snake, [snake], noRels)).toBe('quiet');
  });

  it('defaults social species to lawn', () => {
    const cat = makeAnimal('c', { species: 'cat', state: 'pet' });
    expect(assignGardenZone(cat, [cat], noRels)).toBe('lawn');
  });

  it('routes to quiet if enemy is on the lawn', () => {
    const foe = makeAnimal('foe', { species: 'dog', state: 'pet', gardenZone: 'lawn' });
    const newcomer = makeAnimal('n', { species: 'cat', state: 'pet' });
    const rels: AnimalRelationship[] = [
      { fromId: 'n', toId: 'foe', type: 'enemy' },
      { fromId: 'foe', toId: 'n', type: 'enemy' },
    ];
    expect(assignGardenZone(newcomer, [newcomer, foe], rels)).toBe('quiet');
  });

  it('routes to lawn if enemy is in quiet', () => {
    const foe = makeAnimal('foe', { species: 'dog', state: 'pet', gardenZone: 'quiet' });
    const newcomer = makeAnimal('n', { species: 'cat', state: 'pet' });
    const rels: AnimalRelationship[] = [
      { fromId: 'n', toId: 'foe', type: 'enemy' },
      { fromId: 'foe', toId: 'n', type: 'enemy' },
    ];
    expect(assignGardenZone(newcomer, [newcomer, foe], rels)).toBe('lawn');
  });

  it('follows same-species pet chaperone zone', () => {
    const chap = makeAnimal('chap', { species: 'dog', state: 'pet', gardenZone: 'quiet' });
    const newcomer = makeAnimal('n', { species: 'dog', state: 'sheltered' });
    expect(assignGardenZone(newcomer, [newcomer, chap], noRels)).toBe('quiet');
  });

  it('enemy separation takes precedence over chaperone follow', () => {
    const chap = makeAnimal('chap', { species: 'dog', state: 'pet', gardenZone: 'lawn' });
    const foe  = makeAnimal('foe',  { species: 'cat', state: 'pet', gardenZone: 'lawn' });
    const newcomer = makeAnimal('n', { species: 'dog', state: 'sheltered' });
    const rels: AnimalRelationship[] = [
      { fromId: 'n', toId: 'foe', type: 'enemy' },
      { fromId: 'foe', toId: 'n', type: 'enemy' },
    ];
    // Enemy is on lawn → newcomer pushed to quiet even though chaperone is on lawn.
    expect(assignGardenZone(newcomer, [newcomer, chap, foe], rels)).toBe('quiet');
  });
});

// ── letOutside ───────────────────────────────────────────────

describe('letOutside', () => {
  it('sets outsideAt and assigns a zone', () => {
    const a = makeAnimal('a', { species: 'cat', bondLevel: 15 });
    const now = new Date('2026-04-18T12:00:00Z');
    const result = letOutside(a, [a], noRels, now);
    expect(result.outsideAt).toBe(now.toISOString());
    expect(result.gardenZone).toBe('lawn');
  });

  it('gives +5 happiness without chaperone', () => {
    const a = makeAnimal('a', { species: 'cat', happiness: 50 });
    const result = letOutside(a, [a], noRels);
    expect(result.happiness).toBe(55);
  });

  it('gives +10 happiness with chaperone', () => {
    const incoming = makeAnimal('i', { species: 'dog', happiness: 50 });
    const chap     = makeAnimal('c', { species: 'dog', state: 'pet' });
    const result = letOutside(incoming, [incoming, chap], noRels);
    expect(result.happiness).toBe(60);
  });

  it('caps happiness at 100', () => {
    const a = makeAnimal('a', { species: 'cat', happiness: 98 });
    const result = letOutside(a, [a], noRels);
    expect(result.happiness).toBe(100);
  });

  it('does not mutate input', () => {
    const a = makeAnimal('a', { species: 'cat', happiness: 50 });
    letOutside(a, [a], noRels);
    expect(a.happiness).toBe(50);
    expect(a.outsideAt).toBeUndefined();
  });
});

// ── bringInside ──────────────────────────────────────────────

describe('bringInside', () => {
  it('clears outsideAt but keeps gardenZone', () => {
    const a = makeAnimal('a', { outsideAt: '2026-04-18T12:00:00Z', gardenZone: 'quiet' });
    const result = bringInside(a);
    expect(result.outsideAt).toBeUndefined();
    expect(result.gardenZone).toBe('quiet');
  });
  it('no-op if already inside', () => {
    const a = makeAnimal('a');
    const result = bringInside(a);
    expect(result).toBe(a);
  });
});

// ── switchZone ───────────────────────────────────────────────

describe('switchZone', () => {
  it('flips lawn to quiet for an animal in the garden', () => {
    const a = makeAnimal('a', { state: 'pet', gardenZone: 'lawn' });
    expect(switchZone(a).gardenZone).toBe('quiet');
  });
  it('flips quiet to lawn', () => {
    const a = makeAnimal('a', { state: 'pet', gardenZone: 'quiet' });
    expect(switchZone(a).gardenZone).toBe('lawn');
  });
  it('undefined zone treated as lawn → flips to quiet', () => {
    const a = makeAnimal('a', { state: 'pet' });
    expect(switchZone(a).gardenZone).toBe('quiet');
  });
  it('no-op if not in garden', () => {
    const a = makeAnimal('a', { state: 'sheltered' });
    expect(switchZone(a)).toBe(a);
  });
});

// ── gardenOccupants + partitionByZone ────────────────────────

describe('gardenOccupants', () => {
  it('returns pets and outsiders only', () => {
    const pet       = makeAnimal('pet',       { state: 'pet', gardenZone: 'lawn' });
    const outsider  = makeAnimal('outsider',  { state: 'sheltered', outsideAt: '2026-04-18T12:00:00Z', gardenZone: 'quiet' });
    const sheltered = makeAnimal('sheltered', { state: 'sheltered' });
    const arriving  = makeAnimal('arriving',  { state: 'arriving' });
    const all = [pet, outsider, sheltered, arriving];
    const result = gardenOccupants(all);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id).sort()).toEqual(['outsider', 'pet']);
  });
});

describe('partitionByZone', () => {
  it('splits occupants into lawn and quiet (undefined = lawn)', () => {
    const lawnPet  = makeAnimal('l',  { state: 'pet', gardenZone: 'lawn' });
    const quietPet = makeAnimal('q',  { state: 'pet', gardenZone: 'quiet' });
    const unset    = makeAnimal('u',  { state: 'pet' });
    const outsider = makeAnimal('o',  { state: 'sheltered', outsideAt: '2026-04-18T12:00:00Z', gardenZone: 'quiet' });
    const sheltered = makeAnimal('s', { state: 'sheltered' });
    const { lawn, quiet } = partitionByZone([lawnPet, quietPet, unset, outsider, sheltered]);
    expect(lawn.map((a) => a.id).sort()).toEqual(['l', 'u']);
    expect(quiet.map((a) => a.id).sort()).toEqual(['o', 'q']);
  });
});
