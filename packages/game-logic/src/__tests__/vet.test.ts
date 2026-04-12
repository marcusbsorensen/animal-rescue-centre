import { describe, it, expect } from 'vitest';
import {
  shouldGetSick,
  pickIllness,
  applySickness,
  isHealActionEffective,
  applyHealStep,
  getAvailableUpgrades,
  getUnlockedUpgrades,
  ILLNESSES,
  HOUSE_UPGRADES,
} from '../vet';
import type { Animal } from '@arc/shared-types';

function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'v1',
    name: 'Whiskers',
    species: 'cat',
    state: 'sheltered',
    arrivalStory: 'Found in a garden',
    hunger: 30,
    tiredness: 20,
    happiness: 70,
    health: 100,
    bondLevel: 50,
    roomId: 'r1',
    ...overrides,
  };
}

describe('ILLNESSES', () => {
  it('has illnesses for every species', () => {
    const species = ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake'] as const;
    for (const s of species) {
      const valid = ILLNESSES.filter(
        (i) => i.species === 'all' || i.species.includes(s)
      );
      expect(valid.length).toBeGreaterThan(0);
    }
  });

  it('all illnesses have healSteps > 0', () => {
    for (const illness of ILLNESSES) {
      expect(illness.healSteps).toBeGreaterThan(0);
    }
  });

  it('has no duplicate illness codes', () => {
    const codes = ILLNESSES.map((i) => i.illness);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('shouldGetSick', () => {
  it('never sickens arriving animals', () => {
    const animal = makeAnimal({ state: 'arriving' });
    let gotSick = false;
    for (let i = 0; i < 1000; i++) {
      if (shouldGetSick(animal)) { gotSick = true; break; }
    }
    expect(gotSick).toBe(false);
  });

  it('never sickens already-sick animals (health < 50)', () => {
    const animal = makeAnimal({ health: 30 });
    let gotSick = false;
    for (let i = 0; i < 1000; i++) {
      if (shouldGetSick(animal)) { gotSick = true; break; }
    }
    expect(gotSick).toBe(false);
  });

  it('can sicken stressed animals (high hunger/tiredness, low happiness)', () => {
    const animal = makeAnimal({ hunger: 90, tiredness: 90, happiness: 10 });
    let gotSick = false;
    for (let i = 0; i < 5000; i++) {
      if (shouldGetSick(animal)) { gotSick = true; break; }
    }
    expect(gotSick).toBe(true);
  });
});

describe('pickIllness', () => {
  it('picks valid illness for cats', () => {
    const illness = pickIllness('cat');
    expect(illness.species === 'all' || illness.species.includes('cat')).toBe(true);
  });

  it('picks valid illness for snakes (includes scale_itch)', () => {
    const illnesses = new Set<string>();
    for (let i = 0; i < 100; i++) {
      illnesses.add(pickIllness('snake').illness);
    }
    expect(illnesses.has('scale_itch')).toBe(true);
  });

  it('picks valid illness for bats (includes tired_wings)', () => {
    const illnesses = new Set<string>();
    for (let i = 0; i < 100; i++) {
      illnesses.add(pickIllness('bat').illness);
    }
    expect(illnesses.has('tired_wings')).toBe(true);
  });
});

describe('applySickness', () => {
  it('reduces health for minor illness', () => {
    const illness = ILLNESSES.find((i) => i.severity === 'minor')!;
    const sick = applySickness(makeAnimal(), illness);
    expect(sick.health).toBe(80);
  });

  it('reduces health more for moderate illness', () => {
    const illness = ILLNESSES.find((i) => i.severity === 'moderate')!;
    const sick = applySickness(makeAnimal(), illness);
    expect(sick.health).toBe(65);
  });

  it('clamps health at 0', () => {
    const illness = ILLNESSES.find((i) => i.severity === 'moderate')!;
    const sick = applySickness(makeAnimal({ health: 10 }), illness);
    expect(sick.health).toBe(0);
  });
});

describe('isHealActionEffective', () => {
  it('blanket works for cold', () => {
    expect(isHealActionEffective('cold', 'blanket')).toBe(true);
  });

  it('bandage works for sore_paw', () => {
    expect(isHealActionEffective('sore_paw', 'bandage')).toBe(true);
  });

  it('warm_bath works for scale_itch', () => {
    expect(isHealActionEffective('scale_itch', 'warm_bath')).toBe(true);
  });

  it('bandage does NOT work for cold', () => {
    expect(isHealActionEffective('cold', 'bandage')).toBe(false);
  });
});

describe('applyHealStep', () => {
  it('effective action heals more', () => {
    const illness = ILLNESSES.find((i) => i.illness === 'cold')!;
    const animal = makeAnimal({ health: 60 });
    const { animal: healed, effective } = applyHealStep(animal, illness, 'blanket', 0);
    expect(effective).toBe(true);
    expect(healed.health).toBeGreaterThan(60);
  });

  it('ineffective action heals less', () => {
    const illness = ILLNESSES.find((i) => i.illness === 'cold')!;
    const animal = makeAnimal({ health: 60 });
    const { animal: healed, effective } = applyHealStep(animal, illness, 'bandage', 0);
    expect(effective).toBe(false);
    expect(healed.health).toBe(65); // only +5
  });

  it('heals completely after enough effective steps', () => {
    const illness = ILLNESSES.find((i) => i.illness === 'cold')!; // 2 steps
    const animal = makeAnimal({ health: 60 });
    const step1 = applyHealStep(animal, illness, 'blanket', 0);
    expect(step1.healed).toBe(false);
    const step2 = applyHealStep(step1.animal, illness, 'rest', 1);
    expect(step2.healed).toBe(true);
    expect(step2.animal.health).toBe(100);
  });
});

describe('house upgrades', () => {
  it('returns upgrades at the right threshold', () => {
    expect(getAvailableUpgrades(4, []).length).toBe(0);
    expect(getAvailableUpgrades(5, []).length).toBe(1);
    expect(getAvailableUpgrades(50, []).length).toBe(6);
  });

  it('excludes already unlocked upgrades', () => {
    const available = getAvailableUpgrades(50, ['garden_pond', 'play_area']);
    expect(available.length).toBe(4);
    expect(available.some((u) => u.code === 'garden_pond')).toBe(false);
  });

  it('getUnlockedUpgrades returns correct set', () => {
    const unlocked = getUnlockedUpgrades(['garden_pond', 'treehouse']);
    expect(unlocked.length).toBe(2);
    expect(unlocked[0].code).toBe('garden_pond');
  });

  it('HOUSE_UPGRADES are sorted by threshold', () => {
    for (let i = 1; i < HOUSE_UPGRADES.length; i++) {
      expect(HOUSE_UPGRADES[i].petThreshold).toBeGreaterThanOrEqual(
        HOUSE_UPGRADES[i - 1].petThreshold
      );
    }
  });
});
