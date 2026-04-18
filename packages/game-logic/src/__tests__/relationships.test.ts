import { describe, it, expect } from 'vitest';
import type { Animal, AnimalRelationship } from '@arc/shared-types';
import {
  setRelationship,
  clearRelationship,
  getRelationship,
  getRelationshipsFor,
  hasAllyPresent,
  syncSiblingIds,
  relationshipsFromSiblingIds,
} from '../relationships';

function makeAnimal(id: string, overrides: Partial<Animal> = {}): Animal {
  return {
    id,
    name: 'Test ' + id,
    species: 'cat',
    state: 'sheltered',
    arrivalStory: '',
    hunger: 50,
    tiredness: 30,
    happiness: 80,
    health: 100,
    bondLevel: 10,
    roomId: 'room-cat',
    ...overrides,
  };
}

describe('setRelationship', () => {
  it('adds both directions of a new relationship', () => {
    const result = setRelationship([], 'a', 'b', 'sibling');
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ fromId: 'a', toId: 'b', type: 'sibling' });
    expect(result).toContainEqual({ fromId: 'b', toId: 'a', type: 'sibling' });
  });

  it('replaces existing relationship between the same pair', () => {
    let rels = setRelationship([], 'a', 'b', 'sibling');
    rels = setRelationship(rels, 'a', 'b', 'enemy');
    expect(rels).toHaveLength(2);
    expect(rels.every((r) => r.type === 'enemy')).toBe(true);
  });

  it('is idempotent on repeated calls with same type', () => {
    let rels = setRelationship([], 'a', 'b', 'friend');
    rels = setRelationship(rels, 'a', 'b', 'friend');
    expect(rels).toHaveLength(2);
  });

  it('refuses to self-relate', () => {
    const result = setRelationship([], 'a', 'a', 'sibling');
    expect(result).toHaveLength(0);
  });

  it('does not mutate input list', () => {
    const input: AnimalRelationship[] = [];
    setRelationship(input, 'a', 'b', 'sibling');
    expect(input).toHaveLength(0);
  });
});

describe('clearRelationship', () => {
  it('removes both directions', () => {
    const rels = setRelationship([], 'a', 'b', 'sibling');
    const cleared = clearRelationship(rels, 'a', 'b');
    expect(cleared).toHaveLength(0);
  });

  it('no-op for absent pair', () => {
    const rels = setRelationship([], 'a', 'b', 'sibling');
    const result = clearRelationship(rels, 'c', 'd');
    expect(result).toEqual(rels);
  });
});

describe('getRelationship', () => {
  it('returns the type in either lookup direction', () => {
    const rels = setRelationship([], 'a', 'b', 'friend');
    expect(getRelationship(rels, 'a', 'b')).toBe('friend');
    expect(getRelationship(rels, 'b', 'a')).toBe('friend');
  });

  it('returns undefined for unrelated pair', () => {
    expect(getRelationship([], 'a', 'b')).toBeUndefined();
  });
});

describe('getRelationshipsFor', () => {
  it('returns edges outgoing from this animal', () => {
    let rels = setRelationship([], 'a', 'b', 'sibling');
    rels = setRelationship(rels, 'a', 'c', 'friend');
    rels = setRelationship(rels, 'd', 'e', 'enemy');
    const forA = getRelationshipsFor(rels, 'a');
    expect(forA).toHaveLength(2);
    expect(forA.map((r) => r.toId).sort()).toEqual(['b', 'c']);
  });
});

describe('hasAllyPresent', () => {
  it('true when a sibling is sheltered', () => {
    const a = makeAnimal('a');
    const b = makeAnimal('b', { state: 'sheltered' });
    const rels = setRelationship([], 'a', 'b', 'sibling');
    expect(hasAllyPresent(rels, a, [a, b], 'sibling')).toBe(true);
  });

  it('false when the only sibling is still arriving', () => {
    const a = makeAnimal('a');
    const b = makeAnimal('b', { state: 'arriving' });
    const rels = setRelationship([], 'a', 'b', 'sibling');
    expect(hasAllyPresent(rels, a, [a, b], 'sibling')).toBe(false);
  });

  it('false when no relationship of this type exists', () => {
    const a = makeAnimal('a');
    const b = makeAnimal('b');
    const rels = setRelationship([], 'a', 'b', 'enemy');
    expect(hasAllyPresent(rels, a, [a, b], 'sibling')).toBe(false);
    expect(hasAllyPresent(rels, a, [a, b], 'friend')).toBe(false);
  });

  it('distinguishes types — a friend is not a sibling', () => {
    const a = makeAnimal('a');
    const b = makeAnimal('b');
    const rels = setRelationship([], 'a', 'b', 'friend');
    expect(hasAllyPresent(rels, a, [a, b], 'friend')).toBe(true);
    expect(hasAllyPresent(rels, a, [a, b], 'sibling')).toBe(false);
  });
});

describe('syncSiblingIds', () => {
  it('sets siblingId from first sibling relationship', () => {
    const a = makeAnimal('a');
    const b = makeAnimal('b');
    const rels = setRelationship([], 'a', 'b', 'sibling');
    const synced = syncSiblingIds([a, b], rels);
    expect(synced[0].siblingId).toBe('b');
    expect(synced[1].siblingId).toBe('a');
  });

  it('clears siblingId when relationship is removed', () => {
    const a = makeAnimal('a', { siblingId: 'b' });
    const b = makeAnimal('b', { siblingId: 'a' });
    const synced = syncSiblingIds([a, b], []);
    expect(synced[0].siblingId).toBeUndefined();
    expect(synced[1].siblingId).toBeUndefined();
  });

  it('does not touch animals whose siblingId already matches', () => {
    const a = makeAnimal('a', { siblingId: 'b' });
    const b = makeAnimal('b', { siblingId: 'a' });
    const rels = setRelationship([], 'a', 'b', 'sibling');
    const synced = syncSiblingIds([a, b], rels);
    // Object identity preserved when no change needed
    expect(synced[0]).toBe(a);
    expect(synced[1]).toBe(b);
  });

  it('does not set siblingId for friend relationships', () => {
    const a = makeAnimal('a');
    const b = makeAnimal('b');
    const rels = setRelationship([], 'a', 'b', 'friend');
    const synced = syncSiblingIds([a, b], rels);
    expect(synced[0].siblingId).toBeUndefined();
  });
});

describe('relationshipsFromSiblingIds', () => {
  it('produces two directed edges per sibling pair', () => {
    const animals = [
      makeAnimal('a', { siblingId: 'b' }),
      makeAnimal('b', { siblingId: 'a' }),
    ];
    const rels = relationshipsFromSiblingIds(animals);
    expect(rels).toHaveLength(2);
  });

  it('deduplicates symmetric pairs', () => {
    // If both animals reference each other, we should only emit one pair
    const animals = [
      makeAnimal('a', { siblingId: 'b' }),
      makeAnimal('b', { siblingId: 'a' }),
      makeAnimal('c', { siblingId: 'd' }),
      makeAnimal('d', { siblingId: 'c' }),
    ];
    const rels = relationshipsFromSiblingIds(animals);
    expect(rels).toHaveLength(4);  // 2 pairs × 2 directions
  });

  it('skips orphaned siblingIds', () => {
    const animals = [makeAnimal('a', { siblingId: 'ghost' })];
    const rels = relationshipsFromSiblingIds(animals);
    expect(rels).toHaveLength(0);
  });
});
