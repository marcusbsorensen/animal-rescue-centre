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

  it('level 4 adds snakes (all species)', () => {
    const species = getSpeciesUnlocksForLevel(4);
    expect(species).toContain('snake');
    expect(species).toHaveLength(7);
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
