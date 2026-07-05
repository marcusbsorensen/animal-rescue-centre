import { describe, it, expect } from 'vitest';
import { getSpeciesUnlocksForLevel, getRequiredRescuesForLevel } from '../progression';

describe('getSpeciesUnlocksForLevel', () => {
  it('level 1 has cats and dogs', () => {
    const species = getSpeciesUnlocksForLevel(1);
    expect(species).toContain('cat');
    expect(species).toContain('dog');
    expect(species).toHaveLength(2);
  });

  it('level 2 adds foxes and bunnies', () => {
    const species = getSpeciesUnlocksForLevel(2);
    expect(species).toContain('fox');
    expect(species).toContain('bunny');
    expect(species).toHaveLength(4);
  });

  it('level 3 adds bats and parrots', () => {
    const species = getSpeciesUnlocksForLevel(3);
    expect(species).toContain('bat');
    expect(species).toContain('parrot');
    expect(species).toHaveLength(6);
  });

  it('level 4 adds snakes', () => {
    const species = getSpeciesUnlocksForLevel(4);
    expect(species).toContain('snake');
    expect(species).toHaveLength(7);
  });

  it('level 6 has not unlocked hedgehog yet', () => {
    const species = getSpeciesUnlocksForLevel(6);
    expect(species).not.toContain('hedgehog');
    expect(species).toHaveLength(7);
  });

  it('level 7 adds hedgehog (fills the previously empty level)', () => {
    const species = getSpeciesUnlocksForLevel(7);
    expect(species).toContain('hedgehog');
    expect(species).toHaveLength(8);
  });

  it('defaults to zero extra slots when not specified', () => {
    expect(getSpeciesUnlocksForLevel(1)).toEqual(getSpeciesUnlocksForLevel(1, 0));
  });

  it('extraSpeciesSlots=1 at a level without parrot unlocks parrot', () => {
    // Level 2 normally has cat/dog/fox/bunny. Kofi's slot peeks parrot
    // (the next species in the canonical order).
    const species = getSpeciesUnlocksForLevel(2, 1);
    expect(species).toContain('parrot');
    expect(species).not.toContain('snake');
    expect(species).toHaveLength(5);
  });

  it('extraSpeciesSlots=1 after parrot is already unlocked adds snake', () => {
    // Level 3 already has parrot, so Kofi peeks snake instead.
    const species = getSpeciesUnlocksForLevel(3, 1);
    expect(species).toContain('parrot');
    expect(species).toContain('snake');
    expect(species).toHaveLength(7);
  });

  it('extraSpeciesSlots=1 when both parrot and snake already unlocked → no change', () => {
    const baseline = getSpeciesUnlocksForLevel(4);
    const withSlot = getSpeciesUnlocksForLevel(4, 1);
    expect(withSlot).toEqual(baseline);
  });

  it('extraSpeciesSlots=1 at level 1 unlocks parrot first', () => {
    const species = getSpeciesUnlocksForLevel(1, 1);
    expect(species).toContain('cat');
    expect(species).toContain('dog');
    expect(species).toContain('parrot');
    expect(species).toHaveLength(3);
  });
});

describe('getRequiredRescuesForLevel', () => {
  it('level 1 requires 5 rescues', () => {
    expect(getRequiredRescuesForLevel(1)).toBe(5);
  });

  it('level 10 requires 50 rescues', () => {
    expect(getRequiredRescuesForLevel(10)).toBe(50);
  });
});
