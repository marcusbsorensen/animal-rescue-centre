import { describe, it, expect } from 'vitest';
import {
  canGoOnWalk,
  generateWalkEvents,
  startWalk,
  advanceWalk,
  handleRoadCrossingSuccess,
  handleRoadCrossingFail,
  calculateWalkRewards,
  getAvailableTricks,
  canTrain,
  TRICKS,
  WALKABLE_SPECIES,
} from '../walks';
import type { Animal } from '@arc/shared-types';

function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'w1',
    name: 'Buddy',
    species: 'dog',
    state: 'sheltered',
    arrivalStory: 'Found at the park',
    hunger: 30,
    tiredness: 20,
    happiness: 70,
    health: 100,
    bondLevel: 50,
    roomId: 'r1',
    ...overrides,
  };
}

describe('canGoOnWalk', () => {
  it('allows walkable species in good condition', () => {
    expect(canGoOnWalk(makeAnimal())).toBe(true);
    expect(canGoOnWalk(makeAnimal({ species: 'cat' }))).toBe(true);
    expect(canGoOnWalk(makeAnimal({ species: 'fox' }))).toBe(true);
  });

  it('rejects non-walkable species', () => {
    expect(canGoOnWalk(makeAnimal({ species: 'snake' }))).toBe(false);
    expect(canGoOnWalk(makeAnimal({ species: 'parrot' }))).toBe(false);
  });

  it('rejects arriving animals', () => {
    expect(canGoOnWalk(makeAnimal({ state: 'arriving' }))).toBe(false);
  });

  it('rejects too hungry animals', () => {
    expect(canGoOnWalk(makeAnimal({ hunger: 80 }))).toBe(false);
  });

  it('rejects too tired animals', () => {
    expect(canGoOnWalk(makeAnimal({ tiredness: 75 }))).toBe(false);
  });
});

describe('generateWalkEvents', () => {
  it('generates the right number of events', () => {
    const events = generateWalkEvents('park', 5);
    expect(events).toHaveLength(5);
  });

  it('always includes at least one road crossing', () => {
    // Run multiple times to account for randomness
    for (let i = 0; i < 10; i++) {
      const events = generateWalkEvents('beach', 5);
      expect(events).toContain('road_crossing');
    }
  });

  it('town has more road crossings on average', () => {
    let townRoads = 0;
    let parkRoads = 0;
    const runs = 100;

    for (let i = 0; i < runs; i++) {
      townRoads += generateWalkEvents('town', 6).filter((e) => e === 'road_crossing').length;
      parkRoads += generateWalkEvents('park', 6).filter((e) => e === 'road_crossing').length;
    }

    expect(townRoads).toBeGreaterThan(parkRoads);
  });
});

describe('walk flow', () => {
  it('starts a walk correctly', () => {
    const animal = makeAnimal();
    const state = startWalk(animal, 'park');
    expect(state.zone).toBe('park');
    expect(state.steps).toBe(0);
    expect(state.completed).toBe(false);
    expect(state.leadOn).toBe(true);
    expect(state.roadSafetyScore).toBe(100);
  });

  it('advances through events', () => {
    const state = startWalk(makeAnimal(), 'park');
    const next = advanceWalk(state);
    expect(next.steps).toBe(1);
    expect(next.currentEventIndex).toBe(1);
  });

  it('completes when all events done', () => {
    let state = startWalk(makeAnimal(), 'park');
    while (!state.completed) {
      state = advanceWalk(state);
    }
    expect(state.completed).toBe(true);
    expect(state.steps).toBe(state.maxSteps);
  });

  it('road crossing success keeps score at 100', () => {
    const state = startWalk(makeAnimal(), 'park');
    const after = handleRoadCrossingSuccess(state);
    expect(after.roadSafetyScore).toBe(100);
  });

  it('road crossing fail reduces score', () => {
    const state = startWalk(makeAnimal(), 'park');
    const after = handleRoadCrossingFail(state);
    expect(after.roadSafetyScore).toBe(75);
    expect(after.incidentCount).toBe(1);
  });
});

describe('calculateWalkRewards', () => {
  it('gives higher rewards for perfect walks', () => {
    const state = startWalk(makeAnimal(), 'park');
    const perfect = calculateWalkRewards({ ...state, incidentCount: 0, completed: true });
    const imperfect = calculateWalkRewards({ ...state, incidentCount: 1, completed: true });
    expect(perfect.bondIncrease).toBeGreaterThan(imperfect.bondIncrease);
    expect(perfect.perfectWalk).toBe(true);
    expect(imperfect.perfectWalk).toBe(false);
  });

  it('always increases tiredness', () => {
    const state = startWalk(makeAnimal(), 'park');
    const rewards = calculateWalkRewards({ ...state, completed: true });
    expect(rewards.tirednessIncrease).toBeGreaterThan(0);
  });
});

describe('training system', () => {
  it('returns available tricks for dogs', () => {
    const available = getAvailableTricks('dog', []);
    expect(available.length).toBeGreaterThanOrEqual(4);
    expect(available.some((t) => t.trick === 'sit')).toBe(true);
    expect(available.some((t) => t.trick === 'fetch')).toBe(true);
  });

  it('excludes already learned tricks', () => {
    const available = getAvailableTricks('dog', ['sit', 'paw']);
    expect(available.some((t) => t.trick === 'sit')).toBe(false);
    expect(available.some((t) => t.trick === 'paw')).toBe(false);
  });

  it('canTrain checks treat count', () => {
    const sit = TRICKS.find((t) => t.trick === 'sit')!;
    expect(canTrain(1, sit)).toBe(true);
    expect(canTrain(0, sit)).toBe(false);
  });

  it('high_five only for parrots and bats', () => {
    const highFive = TRICKS.find((t) => t.trick === 'high_five')!;
    expect(highFive.speciesAllowed).toContain('parrot');
    expect(highFive.speciesAllowed).toContain('bat');
    expect(highFive.speciesAllowed).not.toContain('dog');
  });
});

describe('WALKABLE_SPECIES', () => {
  it('includes mammals that can walk', () => {
    expect(WALKABLE_SPECIES).toContain('dog');
    expect(WALKABLE_SPECIES).toContain('cat');
    expect(WALKABLE_SPECIES).toContain('fox');
    expect(WALKABLE_SPECIES).toContain('bunny');
  });

  it('excludes flying/slithering species', () => {
    expect(WALKABLE_SPECIES).not.toContain('bat');
    expect(WALKABLE_SPECIES).not.toContain('parrot');
    expect(WALKABLE_SPECIES).not.toContain('snake');
  });
});

// ── Edge cases an 8-year-old might trigger ──

describe('walk edge cases', () => {
  it('advanceWalk called after walk is already completed', () => {
    let state = startWalk(makeAnimal(), 'park');
    while (!state.completed) {
      state = advanceWalk(state);
    }
    expect(state.completed).toBe(true);
    // Kid keeps tapping — advance again past the end
    const beyond = advanceWalk(state);
    expect(beyond.completed).toBe(true);
    expect(beyond.steps).toBe(state.steps + 1);
    expect(beyond.currentEventIndex).toBe(state.currentEventIndex + 1);
  });

  it('advanceWalk called many times past completion does not crash', () => {
    let state = startWalk(makeAnimal(), 'park');
    // Advance 20 times regardless of maxSteps
    for (let i = 0; i < 20; i++) {
      state = advanceWalk(state);
    }
    expect(state.completed).toBe(true);
    expect(state.steps).toBe(20);
  });

  it('handleRoadCrossingSuccess called twice keeps score the same', () => {
    const state = startWalk(makeAnimal(), 'park');
    const after1 = handleRoadCrossingSuccess(state);
    const after2 = handleRoadCrossingSuccess(after1);
    expect(after2.roadSafetyScore).toBe(100);
    expect(after2.incidentCount).toBe(0);
  });

  it('handleRoadCrossingFail called twice stacks penalties', () => {
    const state = startWalk(makeAnimal(), 'park');
    const after1 = handleRoadCrossingFail(state);
    const after2 = handleRoadCrossingFail(after1);
    expect(after2.roadSafetyScore).toBe(50);
    expect(after2.incidentCount).toBe(2);
  });

  it('handleRoadCrossingFail called 5 times clamps score at 0', () => {
    let state = startWalk(makeAnimal(), 'park');
    for (let i = 0; i < 5; i++) {
      state = handleRoadCrossingFail(state);
    }
    expect(state.roadSafetyScore).toBe(0);
    expect(state.incidentCount).toBe(5);
  });

  it('handleRoadCrossingFail called 10 times never goes negative', () => {
    let state = startWalk(makeAnimal(), 'park');
    for (let i = 0; i < 10; i++) {
      state = handleRoadCrossingFail(state);
    }
    expect(state.roadSafetyScore).toBe(0);
    expect(state.incidentCount).toBe(10);
  });

  it('calculateWalkRewards with extremely high incidentCount', () => {
    const state = startWalk(makeAnimal(), 'park');
    const rewards = calculateWalkRewards({ ...state, incidentCount: 999, completed: true });
    expect(rewards.perfectWalk).toBe(false);
    expect(rewards.bondIncrease).toBe(5);
  });

  it('generateWalkEvents with 0 steps returns empty array', () => {
    const events = generateWalkEvents('park', 0);
    expect(events).toHaveLength(0);
  });

  it('generateWalkEvents with 1 step ensures road crossing', () => {
    const events = generateWalkEvents('forest', 1);
    expect(events).toHaveLength(1);
    // With 1 step and the guarantee logic, it should be a road crossing
    expect(events).toContain('road_crossing');
  });
});
