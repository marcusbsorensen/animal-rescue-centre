import { describe, it, expect } from 'vitest';
import {
  getCompatibility,
  getPreferredCrates,
  isCrateSuitable,
  VEHICLE_DEFS,
  getAvailableVehicles,
  neighbourIndices,
  previewPlacement,
  isDriveable,
  countStressedAdjacencies,
  calculateArrivalHappinessDelta,
  type CrateGrid,
} from '../crate-stacking';
import type { Animal } from '@arc/shared-types';

describe('compatibility matrix', () => {
  it('same species always happy', () => {
    (['cat', 'dog', 'bunny', 'fox', 'bat', 'parrot', 'snake'] as const).forEach((s) => {
      expect(getCompatibility(s, s)).toBe('happy');
    });
  });

  it('prey/predator combos are blocked', () => {
    expect(getCompatibility('cat', 'bunny')).toBe('blocked');
    expect(getCompatibility('bunny', 'cat')).toBe('blocked');
    expect(getCompatibility('dog', 'bunny')).toBe('blocked');
    expect(getCompatibility('fox', 'bunny')).toBe('blocked');
    expect(getCompatibility('cat', 'parrot')).toBe('blocked');
    expect(getCompatibility('cat', 'snake')).toBe('blocked');
    expect(getCompatibility('snake', 'parrot')).toBe('blocked');
  });

  it('both-calm pairings are happy (bat + snake)', () => {
    expect(getCompatibility('bat', 'snake')).toBe('happy');
    expect(getCompatibility('snake', 'bat')).toBe('happy');
  });

  it('tolerated-with-penalty pairings are stressed', () => {
    expect(getCompatibility('cat', 'dog')).toBe('stressed');
    expect(getCompatibility('dog', 'parrot')).toBe('stressed');
    expect(getCompatibility('bunny', 'bat')).toBe('stressed');
  });

  it('matrix is symmetric', () => {
    const species = ['cat', 'dog', 'bunny', 'fox', 'bat', 'parrot', 'snake'] as const;
    for (const a of species) {
      for (const b of species) {
        expect(getCompatibility(a, b)).toBe(getCompatibility(b, a));
      }
    }
  });
});

describe('crate preferences', () => {
  it('each species has at least one preferred crate', () => {
    (['cat', 'dog', 'bunny', 'fox', 'bat', 'parrot', 'snake'] as const).forEach((s) => {
      expect(getPreferredCrates(s).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('snake requires warm-vivarium', () => {
    expect(getPreferredCrates('snake')).toEqual(['warm-vivarium']);
    expect(isCrateSuitable('snake', 'warm-vivarium')).toBe(true);
    expect(isCrateSuitable('snake', 'standard')).toBe(false);
  });

  it('parrot requires perch-carrier', () => {
    expect(getPreferredCrates('parrot')).toEqual(['perch-carrier']);
  });

  it('bat requires quiet crate', () => {
    expect(getPreferredCrates('bat')).toEqual(['quiet']);
  });

  it('standard crate works for cat/dog/bunny/fox', () => {
    expect(isCrateSuitable('cat', 'standard')).toBe(true);
    expect(isCrateSuitable('dog', 'standard')).toBe(true);
    expect(isCrateSuitable('bunny', 'standard')).toBe(true);
    expect(isCrateSuitable('fox', 'standard')).toBe(true);
  });
});

describe('vehicle unlocks', () => {
  it('pedal trike available at level 0', () => {
    const v = getAvailableVehicles(0);
    expect(v.find((x) => x.id === 'pedal-trike')).toBeDefined();
  });

  it('level 2 unlocks Henry the small van', () => {
    const v = getAvailableVehicles(2);
    expect(v.find((x) => x.id === 'small-van')).toBeDefined();
    expect(v.find((x) => x.id === 'long-van')).toBeUndefined();
  });

  it('level 10 unlocks all except Spark', () => {
    const v = getAvailableVehicles(10);
    expect(v.length).toBe(4);
    expect(v.find((x) => x.id === 'electric-minibus')).toBeUndefined();
  });

  it('level 12 unlocks everything', () => {
    const v = getAvailableVehicles(12);
    expect(v.length).toBe(5);
  });
});

describe('neighbour indices', () => {
  it('corner slot in 2x2 has 2 neighbours', () => {
    expect(neighbourIndices(0, 2, 2).sort()).toEqual([1, 2]);
    expect(neighbourIndices(3, 2, 2).sort()).toEqual([1, 2]);
  });

  it('edge slot in 3x3 has 3 neighbours', () => {
    expect(neighbourIndices(1, 3, 3).sort()).toEqual([0, 2, 4]);
  });

  it('centre slot in 3x3 has 4 neighbours', () => {
    expect(neighbourIndices(4, 3, 3).sort()).toEqual([1, 3, 5, 7]);
  });

  it('single-column grid wraps vertically only', () => {
    expect(neighbourIndices(0, 1, 2)).toEqual([1]);
    expect(neighbourIndices(1, 1, 2)).toEqual([0]);
  });
});

describe('placement preview', () => {
  const grid = (crates: CrateGrid['crates']): CrateGrid => ({
    vehicle: 'small-van', cols: 2, rows: 2, crates,
  });

  it('empty slot with no neighbours is happy', () => {
    expect(previewPlacement(grid([]), 0, 'cat')).toBe('happy');
  });

  it('placing a bunny next to a cat is blocked', () => {
    const g = grid([{ slotIndex: 0, animalId: 'a', species: 'cat', crateType: 'standard' }]);
    expect(previewPlacement(g, 1, 'bunny')).toBe('blocked');
  });

  it('placing a dog next to a cat is stressed', () => {
    const g = grid([{ slotIndex: 0, animalId: 'a', species: 'cat', crateType: 'standard' }]);
    expect(previewPlacement(g, 1, 'dog')).toBe('stressed');
  });

  it('placing a cat next to a cat is happy', () => {
    const g = grid([{ slotIndex: 0, animalId: 'a', species: 'cat', crateType: 'standard' }]);
    expect(previewPlacement(g, 1, 'cat')).toBe('happy');
  });

  it('diagonal is ignored (placing bunny at 3 next to cat at 0 is happy, not blocked)', () => {
    const g = grid([{ slotIndex: 0, animalId: 'a', species: 'cat', crateType: 'standard' }]);
    expect(previewPlacement(g, 3, 'bunny')).toBe('happy');
  });
});

describe('isDriveable', () => {
  it('empty grid is driveable', () => {
    const g: CrateGrid = { vehicle: 'small-van', cols: 2, rows: 2, crates: [] };
    expect(isDriveable(g)).toBe(true);
  });

  it('a cat and a bunny side-by-side is NOT driveable', () => {
    const g: CrateGrid = {
      vehicle: 'small-van', cols: 2, rows: 2,
      crates: [
        { slotIndex: 0, animalId: 'a', species: 'cat',   crateType: 'standard' },
        { slotIndex: 1, animalId: 'b', species: 'bunny', crateType: 'standard' },
      ],
    };
    expect(isDriveable(g)).toBe(false);
  });

  it('a cat and a bunny diagonally is driveable', () => {
    const g: CrateGrid = {
      vehicle: 'small-van', cols: 2, rows: 2,
      crates: [
        { slotIndex: 0, animalId: 'a', species: 'cat',   crateType: 'standard' },
        { slotIndex: 3, animalId: 'b', species: 'bunny', crateType: 'standard' },
      ],
    };
    expect(isDriveable(g)).toBe(true);
  });
});

describe('stressed count', () => {
  it('no adjacencies → zero stressed', () => {
    const g: CrateGrid = { vehicle: 'small-van', cols: 2, rows: 2, crates: [] };
    expect(countStressedAdjacencies(g)).toBe(0);
  });

  it('cat next to dog counts once', () => {
    const g: CrateGrid = {
      vehicle: 'small-van', cols: 2, rows: 2,
      crates: [
        { slotIndex: 0, animalId: 'a', species: 'cat', crateType: 'standard' },
        { slotIndex: 1, animalId: 'b', species: 'dog', crateType: 'standard' },
      ],
    };
    expect(countStressedAdjacencies(g)).toBe(1);
  });

  it('three-in-a-row stressed combo counts 2', () => {
    const g: CrateGrid = {
      vehicle: 'long-van', cols: 3, rows: 2,
      crates: [
        { slotIndex: 0, animalId: 'a', species: 'cat',   crateType: 'standard' },
        { slotIndex: 1, animalId: 'b', species: 'dog',   crateType: 'standard' },
        { slotIndex: 2, animalId: 'c', species: 'cat',   crateType: 'standard' },
      ],
    };
    expect(countStressedAdjacencies(g)).toBe(2);
  });
});

describe('arrival happiness delta', () => {
  const baseAnimals = new Map<string, Animal>();

  it('right crate + same-species neighbour → positive delta', () => {
    const g: CrateGrid = {
      vehicle: 'small-van', cols: 2, rows: 2,
      crates: [
        { slotIndex: 0, animalId: 'a', species: 'cat', crateType: 'standard' },
        { slotIndex: 1, animalId: 'b', species: 'cat', crateType: 'standard' },
      ],
    };
    const deltas = calculateArrivalHappinessDelta(g, baseAnimals);
    expect(deltas.get('a')).toBe(4); // +3 crate, +1 same-species
    expect(deltas.get('b')).toBe(4);
  });

  it('wrong crate hurts more than stressed adjacency', () => {
    const g: CrateGrid = {
      vehicle: 'small-van', cols: 2, rows: 2,
      crates: [
        { slotIndex: 0, animalId: 'a', species: 'snake', crateType: 'standard' },
      ],
    };
    const deltas = calculateArrivalHappinessDelta(g, baseAnimals);
    expect(deltas.get('a')).toBe(-10); // wrong crate
  });

  it('bat in quiet crate next to snake = +4 (crate fit + happy neighbour)', () => {
    const g: CrateGrid = {
      vehicle: 'small-van', cols: 2, rows: 2,
      crates: [
        { slotIndex: 0, animalId: 'a', species: 'bat',   crateType: 'quiet' },
        { slotIndex: 1, animalId: 'b', species: 'snake', crateType: 'warm-vivarium' },
      ],
    };
    const deltas = calculateArrivalHappinessDelta(g, baseAnimals);
    expect(deltas.get('a')).toBe(3); // +3 crate + 0 happy (not same species)
    expect(deltas.get('b')).toBe(3);
  });
});
