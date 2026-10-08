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
  feelingToward,
  pairFeeling,
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

  // 3x3 is no vehicle in the fleet — since 2026-10-09 nothing is more
  // than two crates wide, so no cell anywhere has four neighbours.
  // These two stay because they test the arithmetic rather than the
  // fleet, and a grid shape the game does not currently use is
  // exactly the case a generic function should still get right.
  it('edge slot in 3x3 has 3 neighbours', () => {
    expect(neighbourIndices(1, 3, 3).sort()).toEqual([0, 2, 4]);
  });

  it('centre slot in 3x3 has 4 neighbours', () => {
    expect(neighbourIndices(4, 3, 3).sort()).toEqual([1, 3, 5, 7]);
  });

  it('no cell in the fleet has four neighbours, because none is three wide', () => {
    for (const def of Object.values(VEHICLE_DEFS)) {
      expect(def.cols, `${def.name} is ${def.cols} across`).toBeLessThanOrEqual(2);
      for (let slot = 0; slot < def.cols * def.rows; slot += 1) {
        expect(neighbourIndices(slot, def.cols, def.rows).length)
          .toBeLessThanOrEqual(3);
      }
    }
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
    expect(previewPlacement(grid([]), 0, { species: 'cat' })).toBe('happy');
  });

  it('placing a bunny next to a cat is blocked', () => {
    const g = grid([{ slotIndex: 0, animalId: 'a', species: 'cat', crateType: 'standard' }]);
    expect(previewPlacement(g, 1, { species: 'bunny' })).toBe('blocked');
  });

  it('placing a dog next to a cat is stressed', () => {
    const g = grid([{ slotIndex: 0, animalId: 'a', species: 'cat', crateType: 'standard' }]);
    expect(previewPlacement(g, 1, { species: 'dog' })).toBe('stressed');
  });

  it('placing a cat next to a cat is happy', () => {
    const g = grid([{ slotIndex: 0, animalId: 'a', species: 'cat', crateType: 'standard' }]);
    expect(previewPlacement(g, 1, { species: 'cat' })).toBe('happy');
  });

  it('diagonal is ignored (placing bunny at 3 next to cat at 0 is happy, not blocked)', () => {
    const g = grid([{ slotIndex: 0, animalId: 'a', species: 'cat', crateType: 'standard' }]);
    expect(previewPlacement(g, 3, { species: 'bunny' })).toBe('happy');
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
    // Bea's left-hand column, top to bottom: she is two across and
    // three deep, so a run of three is vertical now rather than
    // across. The arithmetic under test does not care which, and the
    // grid is written as a shape the fleet actually has.
    const g: CrateGrid = {
      vehicle: 'long-van', cols: 2, rows: 3,
      crates: [
        { slotIndex: 0, animalId: 'a', species: 'cat',   crateType: 'standard' },
        { slotIndex: 2, animalId: 'b', species: 'dog',   crateType: 'standard' },
        { slotIndex: 4, animalId: 'c', species: 'cat',   crateType: 'standard' },
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

  it('bat in quiet crate next to snake = +3 (crate fit; happy neighbours only score when same species)', () => {
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

// ── Illness ──────────────────────────────────────────────────

describe('a poorly animal, and the animal beside it', () => {
  const well = (species: Parameters<typeof getCompatibility>[0]) => ({ species });
  const ill = (species: Parameters<typeof getCompatibility>[0]) => ({
    species, poorly: true,
  });

  it('minds nothing it would merely have been tense about', () => {
    // cat + dog is stressed between two well animals.
    expect(getCompatibility('cat', 'dog')).toBe('stressed');
    expect(feelingToward(ill('cat'), well('dog'))).toBe('happy');
  });

  it('is still frightened of what would frighten it, and still blocks', () => {
    // **The one a future change is most likely to break.** Stressed is
    // a preference and illness can outweigh a preference. Blocked is
    // safety, and a poorly bunny beside a fox is in more danger than a
    // well one, not less.
    expect(getCompatibility('bunny', 'fox')).toBe('blocked');
    expect(feelingToward(ill('bunny'), well('fox'))).toBe('blocked');
    expect(feelingToward(well('fox'), ill('bunny'))).toBe('blocked');
    expect(pairFeeling(ill('bunny'), well('fox')).level).toBe('blocked');
    // And it is never dressed up as a need: safety takes the wording.
    expect(pairFeeling(ill('bunny'), well('fox')).needsQuiet).toBe(false);

    const g: CrateGrid = {
      vehicle: 'small-van', cols: 2, rows: 2,
      crates: [
        { slotIndex: 0, animalId: 'a', species: 'bunny', crateType: 'standard', poorly: true },
        { slotIndex: 1, animalId: 'b', species: 'fox', crateType: 'secure' },
      ],
    };
    expect(isDriveable(g), 'a sick animal does not unblock a blocked pair').toBe(false);
  });

  it('makes the well animal beside it mind mildly, whatever the species', () => {
    // Same species, normally the happiest pairing there is.
    expect(getCompatibility('bunny', 'bunny')).toBe('happy');
    expect(feelingToward(well('bunny'), ill('bunny'))).toBe('stressed');
    expect(pairFeeling(well('bunny'), ill('bunny'))).toEqual({
      level: 'stressed', needsQuiet: true,
    });
  });

  it('leaves two poorly animals minding each other not at all', () => {
    expect(feelingToward(ill('cat'), ill('dog'))).toBe('happy');
    expect(feelingToward(ill('dog'), ill('cat'))).toBe('happy');
    expect(pairFeeling(ill('cat'), ill('dog'))).toEqual({
      level: 'happy', needsQuiet: false,
    });
  });

  it('reads the same whichever way round the pair is given', () => {
    expect(pairFeeling(ill('cat'), well('dog')))
      .toEqual(pairFeeling(well('dog'), ill('cat')));
  });
});

describe('illness and the scoring', () => {
  const grid = (crates: CrateGrid['crates']): CrateGrid => ({
    vehicle: 'small-van', cols: 2, rows: 2, crates,
  });
  const noAnimals = new Map<string, Animal>();

  it('counts a well animal beside a patient, and not two patients', () => {
    expect(countStressedAdjacencies(grid([
      { slotIndex: 0, animalId: 'a', species: 'bunny', crateType: 'standard', poorly: true },
      { slotIndex: 1, animalId: 'b', species: 'bunny', crateType: 'standard' },
    ])), 'one patient, one well').toBe(1);

    expect(countStressedAdjacencies(grid([
      { slotIndex: 0, animalId: 'a', species: 'cat', crateType: 'standard', poorly: true },
      { slotIndex: 1, animalId: 'b', species: 'dog', crateType: 'standard', poorly: true },
    ])), 'both poorly — neither minds').toBe(0);
  });

  it('charges the journey to the animal that actually minds it', () => {
    const deltas = calculateArrivalHappinessDelta(grid([
      { slotIndex: 0, animalId: 'ill', species: 'cat', crateType: 'standard', poorly: true },
      { slotIndex: 1, animalId: 'well', species: 'dog', crateType: 'standard' },
    ]), noAnimals);
    // Both are in a crate that suits them: +3 each. The patient pays
    // nothing for the dog it does not mind; the dog pays the ordinary
    // -5 for a journey spent beside somebody who needs quiet.
    expect(deltas.get('ill')).toBe(3);
    expect(deltas.get('well')).toBe(3 - 5);
  });

  it('still lets a patient take comfort from one of its own kind', () => {
    const deltas = calculateArrivalHappinessDelta(grid([
      { slotIndex: 0, animalId: 'ill', species: 'bunny', crateType: 'ventilated-basket', poorly: true },
      { slotIndex: 1, animalId: 'well', species: 'bunny', crateType: 'ventilated-basket' },
    ]), noAnimals);
    expect(deltas.get('ill'), 'a friend in the next crate').toBe(3 + 1);
    expect(deltas.get('well'), 'giving somebody space').toBe(3 - 5);
  });
});
