import { describe, it, expect, beforeEach } from 'vitest';
import type Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { createAnimalSprite, registerSickAnimals } from '../sprites';

/**
 * Minimal stand-in for a Phaser scene: enough surface for
 * createAnimalSprite to resolve a texture key and "add" an image.
 * `textures.exists` answers from a fixed set, so each test decides
 * exactly which art is on disk.
 */
function stubScene(available: string[]) {
  const requested: string[] = [];
  return {
    requested,
    scene: {
      textures: { exists: (key: string) => available.includes(key) },
      add: {
        image: (_x: number, _y: number, key: string) => {
          requested.push(key);
          return { width: 512, height: 512, setScale() {}, setInteractive() {} };
        },
        rectangle: () => ({ setStrokeStyle: () => ({ setInteractive() {} }) }),
      },
    } as unknown as Phaser.Scene,
  };
}

function animal(over: Partial<Animal> = {}): Animal {
  return {
    id: 'animal-1',
    name: 'Pip',
    species: 'cat',
    variant: 'ginger',
    state: 'sheltered',
    arrivalStory: '',
    hunger: 0,
    tiredness: 0,
    happiness: 100,
    health: 100,
    bondLevel: 0,
    roomId: 'room-cat',
    ...over,
  } as Animal;
}

const ALL_CAT_ART = [
  'cat-ginger-sheltered', 'cat-ginger-sick', 'cat-ginger-sleeping',
  'cat-ginger-eating', 'cat-ginger-arriving',
  'cat-sheltered', 'cat-sick',
];

describe('createAnimalSprite — sick state', () => {
  beforeEach(() => {
    registerSickAnimals(new Map());
  });

  it('uses the sheltered art for a well animal', () => {
    const { scene, requested } = stubScene(ALL_CAT_ART);
    createAnimalSprite(scene, 0, 0, animal());
    expect(requested).toEqual(['cat-ginger-sheltered']);
  });

  it('uses the sick art once the animal is in sickAnimals', () => {
    registerSickAnimals(new Map([['animal-1', { severity: 'minor' }]]));
    const { scene, requested } = stubScene(ALL_CAT_ART);
    createAnimalSprite(scene, 0, 0, animal());
    expect(requested).toEqual(['cat-ginger-sick']);
  });

  it('reflects healing without re-registering, because the map is live', () => {
    const sick = new Map<string, unknown>([['animal-1', { severity: 'minor' }]]);
    registerSickAnimals(sick);

    const before = stubScene(ALL_CAT_ART);
    createAnimalSprite(before.scene, 0, 0, animal());
    expect(before.requested).toEqual(['cat-ginger-sick']);

    sick.delete('animal-1');

    const after = stubScene(ALL_CAT_ART);
    createAnimalSprite(after.scene, 0, 0, animal());
    expect(after.requested).toEqual(['cat-ginger-sheltered']);
  });

  it('only sickens the animal that is actually ill', () => {
    registerSickAnimals(new Map([['animal-99', { severity: 'minor' }]]));
    const { scene, requested } = stubScene(ALL_CAT_ART);
    createAnimalSprite(scene, 0, 0, animal());
    expect(requested).toEqual(['cat-ginger-sheltered']);
  });

  it('still shows arriving art for a sick animal that has just turned up', () => {
    registerSickAnimals(new Map([['animal-1', { severity: 'minor' }]]));
    const { scene, requested } = stubScene(ALL_CAT_ART);
    createAnimalSprite(scene, 0, 0, animal({ state: 'arriving' }));
    expect(requested).toEqual(['cat-ginger-arriving']);
  });

  it('sickness outranks hunger and tiredness', () => {
    registerSickAnimals(new Map([['animal-1', { severity: 'moderate' }]]));
    const { scene, requested } = stubScene(ALL_CAT_ART);
    createAnimalSprite(scene, 0, 0, animal({ hunger: 95, tiredness: 95 }));
    expect(requested).toEqual(['cat-ginger-sick']);
  });

  it('falls back to species-level sick art when the variant has none', () => {
    registerSickAnimals(new Map([['animal-1', { severity: 'minor' }]]));
    // hedgehog has no variant art at all — species fallback must still
    // pick the sick pose rather than dropping to sheltered.
    const { scene, requested } = stubScene(['hedgehog-sick', 'hedgehog-sheltered']);
    createAnimalSprite(scene, 0, 0, animal({ species: 'hedgehog', variant: 'albino' }));
    expect(requested).toEqual(['hedgehog-sick']);
  });
});
