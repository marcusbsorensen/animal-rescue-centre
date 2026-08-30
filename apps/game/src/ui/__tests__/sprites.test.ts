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

/**
 * The size contract.
 *
 * `width`/`height` are the box the animal is drawn *inside*. The fit
 * scale used to be multiplied by two, so every caller that laid a label
 * out against the box it passed put that label inside the animal: the
 * room's name pill sat 16px inside the animal's feet, its status chips
 * across its chest, and the kitchen's name plate 30px inside its head.
 * Nineteen call sites had to know to ask for half of what they wanted.
 *
 * These tests are the reason it cannot come back.
 */

/** Scene stub whose image models `setScale` the way Phaser does. */
function scalingScene(srcW: number, srcH: number, available: string[]) {
  return {
    textures: { exists: (key: string) => available.includes(key) },
    add: {
      image: () => ({
        width: srcW,
        height: srcH,
        displayWidth: srcW,
        displayHeight: srcH,
        setScale(s: number) {
          this.displayWidth = srcW * s;
          this.displayHeight = srcH * s;
          return this;
        },
        setInteractive() { return this; },
      }),
      rectangle: (_x: number, _y: number, w: number, h: number) => ({
        displayWidth: w,
        displayHeight: h,
        setStrokeStyle() { return this; },
        setInteractive() { return this; },
      }),
    },
  } as unknown as Phaser.Scene;
}

describe('createAnimalSprite \u2014 the size contract', () => {
  beforeEach(() => {
    registerSickAnimals(new Map());
  });

  const BOXES: [number, number][] = [
    [200, 160],  // RoomView
    [240, 240],  // ToyPickerView
    [148, 148],  // CorridorView, procedural
    [520, 440],  // GroomingScene
    [192, 184],  // KitchenMinigameScene
    [40, 300],   // taller than it is wide
    [1, 1],      // degenerate
  ];

  // 512\u00b2 is the shipped animal set; the others cover the 40 legacy 128px
  // files and any non-square art that lands in the folder later.
  const SOURCES: [number, number][] = [[512, 512], [128, 128], [103, 129], [400, 200]];

  it.each(BOXES)('draws inside a %ix%i box, whatever the source', (w, h) => {
    for (const [sw, sh] of SOURCES) {
      const sprite = createAnimalSprite(
        scalingScene(sw, sh, ALL_CAT_ART), 0, 0, animal(), { width: w, height: h },
      );
      expect(sprite.displayWidth).toBeLessThanOrEqual(w + 0.001);
      expect(sprite.displayHeight).toBeLessThanOrEqual(h + 0.001);
    }
  });

  it('fills the box on at least one axis, so a caller gets what it asked for', () => {
    // Contain, not shrink-to-nothing: one dimension must touch the box or
    // the animal is smaller than the space reserved for it.
    for (const [w, h] of BOXES) {
      const sprite = createAnimalSprite(
        scalingScene(512, 512, ALL_CAT_ART), 0, 0, animal(), { width: w, height: h },
      );
      const touches = Math.abs(sprite.displayWidth - w) < 0.001
        || Math.abs(sprite.displayHeight - h) < 0.001;
      expect(touches).toBe(true);
    }
  });

  it('draws square art at exactly the box when the box is square', () => {
    const sprite = createAnimalSprite(
      scalingScene(512, 512, ALL_CAT_ART), 0, 0, animal(), { width: 200, height: 200 },
    );
    expect(sprite.displayWidth).toBe(200);
    expect(sprite.displayHeight).toBe(200);
  });

  it('holds for the fallback rectangle too', () => {
    // The rectangle always drew at exactly the box while the image drew at
    // twice it, so the placeholder was half the size of the art it stood
    // in for. Same contract, both branches.
    const sprite = createAnimalSprite(
      scalingScene(512, 512, []), 0, 0, animal(), { width: 200, height: 160 },
    );
    expect(sprite.displayWidth).toBeLessThanOrEqual(200);
    expect(sprite.displayHeight).toBeLessThanOrEqual(160);
  });
});
