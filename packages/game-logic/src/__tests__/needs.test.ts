import { describe, it, expect } from 'vitest';
import { tickNeeds, applyFeeding, applySleep, applyPlay, getUrgentNeed, getNeedSpeech } from '../needs';
import type { Animal } from '@arc/shared-types';

function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'test-1',
    name: 'Whiskers',
    species: 'cat',
    state: 'sheltered',
    arrivalStory: 'Found in a box',
    hunger: 50,
    tiredness: 50,
    happiness: 50,
    health: 100,
    bondLevel: 20,
    roomId: 'room-cat',
    ...overrides,
  };
}

describe('tickNeeds', () => {
  it('increases hunger and tiredness over time', () => {
    const animal = makeAnimal({ hunger: 50, tiredness: 50 });
    const after = tickNeeds(animal);
    expect(after.hunger).toBeGreaterThan(50);
    expect(after.tiredness).toBeGreaterThan(50);
  });

  it('decreases happiness over time', () => {
    const animal = makeAnimal({ happiness: 50 });
    const after = tickNeeds(animal);
    expect(after.happiness).toBeLessThan(50);
  });

  it('clamps values to 0-100', () => {
    const full = makeAnimal({ hunger: 100, tiredness: 100, happiness: 0 });
    const after = tickNeeds(full);
    expect(after.hunger).toBeLessThanOrEqual(100);
    expect(after.tiredness).toBeLessThanOrEqual(100);
    expect(after.happiness).toBeGreaterThanOrEqual(0);
  });

  it('does not mutate the original animal', () => {
    const animal = makeAnimal();
    const after = tickNeeds(animal);
    expect(after).not.toBe(animal);
    expect(animal.hunger).toBe(50); // original unchanged
  });
});

describe('applyFeeding', () => {
  it('reduces hunger significantly', () => {
    const animal = makeAnimal({ hunger: 80 });
    const after = applyFeeding(animal);
    expect(after.hunger).toBe(40);
  });

  it('boosts happiness slightly', () => {
    const animal = makeAnimal({ happiness: 50 });
    const after = applyFeeding(animal);
    expect(after.happiness).toBe(55);
  });

  it('clamps hunger at 0', () => {
    const animal = makeAnimal({ hunger: 20 });
    const after = applyFeeding(animal);
    expect(after.hunger).toBe(0);
  });
});

describe('applySleep', () => {
  it('reduces tiredness significantly', () => {
    const animal = makeAnimal({ tiredness: 80 });
    const after = applySleep(animal);
    expect(after.tiredness).toBe(30);
  });
});

describe('applyPlay', () => {
  it('boosts happiness but increases tiredness and hunger', () => {
    const animal = makeAnimal({ happiness: 40, tiredness: 30, hunger: 30 });
    const after = applyPlay(animal);
    expect(after.happiness).toBe(55);
    expect(after.tiredness).toBe(40);
    expect(after.hunger).toBe(35);
  });
});

describe('getUrgentNeed', () => {
  it('returns health when health is critical', () => {
    expect(getUrgentNeed(makeAnimal({ health: 20 }))).toBe('health');
  });

  it('returns hunger when very hungry', () => {
    expect(getUrgentNeed(makeAnimal({ hunger: 85 }))).toBe('hunger');
  });

  it('returns tiredness when exhausted', () => {
    expect(getUrgentNeed(makeAnimal({ tiredness: 90, hunger: 50 }))).toBe('tiredness');
  });

  it('returns happiness when very unhappy', () => {
    expect(getUrgentNeed(makeAnimal({ happiness: 10, hunger: 50, tiredness: 50 }))).toBe('happiness');
  });

  it('returns null when all needs are OK', () => {
    expect(getUrgentNeed(makeAnimal())).toBeNull();
  });
});

describe('getNeedSpeech', () => {
  it('returns speech for hungry animals', () => {
    const speech = getNeedSpeech(makeAnimal({ hunger: 90 }));
    expect(speech).toContain('hungry');
  });

  it('returns null when needs are fine', () => {
    expect(getNeedSpeech(makeAnimal())).toBeNull();
  });
});
