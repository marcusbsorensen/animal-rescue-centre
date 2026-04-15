import { describe, it, expect } from 'vitest';
import { tickNeeds, applyFeeding, applySleep, applyPlay, applyGrooming, getUrgentNeed, getNeedSpeech } from '../needs';
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

describe('cleanliness', () => {
  it('tickNeeds decays cleanliness slowly from default clean state', () => {
    const animal = makeAnimal(); // cleanliness undefined → defaults to 100
    const after = tickNeeds(animal);
    expect(after.cleanliness).toBeCloseTo(99.92);
  });

  it('applyGrooming restores cleanliness to 100 and boosts happiness + bond', () => {
    const animal = makeAnimal({ cleanliness: 10, happiness: 50, bondLevel: 30 });
    const after = applyGrooming(animal);
    expect(after.cleanliness).toBe(100);
    expect(after.happiness).toBe(55);
    expect(after.bondLevel).toBe(32);
  });

  it('getUrgentNeed returns cleanliness when below 25 and speech is grubby', () => {
    const dirty = makeAnimal({ cleanliness: 20, hunger: 40, tiredness: 40, happiness: 50 });
    expect(getUrgentNeed(dirty)).toBe('cleanliness');
    expect(getNeedSpeech(dirty)).toContain('grubby');
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

// ── Edge cases an 8-year-old might trigger ──

describe('needs edge cases', () => {
  it('tickNeeds on animal with all stats at 0', () => {
    const animal = makeAnimal({ hunger: 0, tiredness: 0, happiness: 0 });
    const after = tickNeeds(animal);
    // hunger increases by 0.3, tiredness by 0.2
    expect(after.hunger).toBeCloseTo(0.3);
    expect(after.tiredness).toBeCloseTo(0.2);
    // happiness at 0 minus 0.1 should clamp to 0
    expect(after.happiness).toBe(0);
  });

  it('tickNeeds on animal with all stats at 100', () => {
    const animal = makeAnimal({ hunger: 100, tiredness: 100, happiness: 100 });
    const after = tickNeeds(animal);
    // hunger and tiredness at 100 + decay should clamp at 100
    expect(after.hunger).toBe(100);
    expect(after.tiredness).toBe(100);
    // happiness at 100 - 0.1 = 99.9
    expect(after.happiness).toBeCloseTo(99.9);
  });

  it('tickNeeds called 1000 times does not exceed bounds', () => {
    let animal = makeAnimal({ hunger: 50, tiredness: 50, happiness: 50 });
    for (let i = 0; i < 1000; i++) {
      animal = tickNeeds(animal);
    }
    expect(animal.hunger).toBeLessThanOrEqual(100);
    expect(animal.hunger).toBeGreaterThanOrEqual(0);
    expect(animal.tiredness).toBeLessThanOrEqual(100);
    expect(animal.tiredness).toBeGreaterThanOrEqual(0);
    expect(animal.happiness).toBeLessThanOrEqual(100);
    expect(animal.happiness).toBeGreaterThanOrEqual(0);
  });

  it('tickNeeds 1000 times drives hunger and tiredness to 100, happiness to 0', () => {
    let animal = makeAnimal({ hunger: 50, tiredness: 50, happiness: 50 });
    for (let i = 0; i < 1000; i++) {
      animal = tickNeeds(animal);
    }
    expect(animal.hunger).toBe(100);
    expect(animal.tiredness).toBe(100);
    expect(animal.happiness).toBe(0);
  });

  it('applyFeeding on animal with hunger=0 keeps hunger at 0', () => {
    const animal = makeAnimal({ hunger: 0 });
    const after = applyFeeding(animal);
    expect(after.hunger).toBe(0);
  });

  it('applyFeeding on animal with happiness=100 caps happiness at 100', () => {
    const animal = makeAnimal({ happiness: 100 });
    const after = applyFeeding(animal);
    expect(after.happiness).toBe(100);
  });

  it('applySleep on animal with tiredness=0 keeps tiredness at 0', () => {
    const animal = makeAnimal({ tiredness: 0 });
    const after = applySleep(animal);
    expect(after.tiredness).toBe(0);
  });

  it('applyPlay on animal with happiness=100 caps at 100', () => {
    const animal = makeAnimal({ happiness: 100, tiredness: 90, hunger: 95 });
    const after = applyPlay(animal);
    expect(after.happiness).toBe(100);
    expect(after.tiredness).toBe(100);
    expect(after.hunger).toBe(100);
  });

  it('getUrgentNeed prioritises health over hunger', () => {
    const animal = makeAnimal({ health: 20, hunger: 90 });
    expect(getUrgentNeed(animal)).toBe('health');
  });

  it('getUrgentNeed at exact boundary values', () => {
    // health < 30 triggers
    expect(getUrgentNeed(makeAnimal({ health: 29 }))).toBe('health');
    expect(getUrgentNeed(makeAnimal({ health: 30 }))).toBeNull();
    // hunger > 80 triggers
    expect(getUrgentNeed(makeAnimal({ hunger: 81 }))).toBe('hunger');
    expect(getUrgentNeed(makeAnimal({ hunger: 80 }))).toBeNull();
    // tiredness > 80 triggers
    expect(getUrgentNeed(makeAnimal({ tiredness: 81, hunger: 50 }))).toBe('tiredness');
    expect(getUrgentNeed(makeAnimal({ tiredness: 80, hunger: 50 }))).toBeNull();
    // happiness < 20 triggers
    expect(getUrgentNeed(makeAnimal({ happiness: 19, hunger: 50, tiredness: 50 }))).toBe('happiness');
    expect(getUrgentNeed(makeAnimal({ happiness: 20, hunger: 50, tiredness: 50 }))).toBeNull();
  });
});
