import { describe, it, expect, beforeEach } from 'vitest';
import type Phaser from 'phaser';
import type { Animal, Species } from '@arc/shared-types';
import { SPECIES_UNIT, animalScaleFraction } from '@arc/game-logic';
import { createAnimalSprite, registerSickAnimals } from '../sprites';
import { animalSpriteBounds } from '../animal-sprite-bounds';

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

/**
 * The scale decision: solo against comparative.
 *
 * A screen that draws two animals at once is making a claim about how big
 * they are relative to each other, and until `scale: 'species'` existed it
 * made that claim wrongly on every screen but one — `SPECIES_SIZE` was read
 * in a single place and everywhere else contain-fitted the whole texture, so
 * a hedgehog was drawn the size of a dog in the corridor, the garden, a room,
 * a falling-out, the kitchen counter and the walk.
 *
 * A screen that draws one animal alone is making no such claim, and drawing
 * her at a third of her frame there would read as a mistake rather than as a
 * small animal. So the two modes are not a preference: they are two different
 * questions, and `'species'` is only ever the answer to the second one.
 */

/**
 * Scene stub that can carry a frame, as real Phaser does.
 *
 * `add.image(x, y, key, frame)` answers with the frame's own size when one is
 * asked for, which is what makes the species scale land on the animal rather
 * than on her transparent margin.
 */
function framedScene(available: string[], bounds: Record<string, BoundsLike>) {
  const frames = new Map<string, Map<string, BoundsLike>>();
  return {
    textures: {
      exists: (key: string) => available.includes(key),
      get: (key: string) => {
        const b = bounds[key];
        if (!b) return { source: [], has: () => false, add: () => null };
        if (!frames.has(key)) frames.set(key, new Map());
        const own = frames.get(key)!;
        return {
          source: [{ width: b.canvasW, height: b.canvasH }],
          has: (name: string) => own.has(name),
          add: (name: string, _i: number, x: number, y: number, w: number, h: number) => {
            own.set(name, { canvasW: b.canvasW, canvasH: b.canvasH, x, y, w, h });
            return {};
          },
        };
      },
    },
    add: {
      image: (_x: number, _y: number, key: string, frame?: string) => {
        const b = bounds[key];
        const src = frame && b ? { w: b.w, h: b.h } : { w: b?.canvasW ?? 512, h: b?.canvasH ?? 512 };
        return {
          width: src.w,
          height: src.h,
          displayWidth: src.w,
          displayHeight: src.h,
          setScale(s: number) {
            this.displayWidth = src.w * s;
            this.displayHeight = src.h * s;
            return this;
          },
          setInteractive() { return this; },
        };
      },
      rectangle: (_x: number, _y: number, w: number, h: number) => ({
        displayWidth: w,
        displayHeight: h,
        setStrokeStyle() { return this; },
        setInteractive() { return this; },
      }),
    },
  } as unknown as Phaser.Scene;
}

interface BoundsLike {
  canvasW: number; canvasH: number; x: number; y: number; w: number; h: number;
}

/** A real row of bounds, taken from the committed table. */
function boundsFor(...keys: string[]): Record<string, BoundsLike> {
  const out: Record<string, BoundsLike> = {};
  for (const key of keys) {
    const b = animalSpriteBounds(key);
    if (!b) throw new Error(`no committed bounds for ${key} — regenerate the table`);
    out[key] = { ...b };
  }
  return out;
}

const DOG = 'dog-collie-sheltered';
const HEDGEHOG = 'hedgehog-brown-sheltered';
const BAT = 'bat-brown-sheltered';

function drawLongSide(key: string, species: Species, variant: string, box: [number, number],
                      scale: 'species' | 'fill') {
  const sprite = createAnimalSprite(
    framedScene([key], boundsFor(key)), 0, 0,
    animal({ species, variant }),
    { width: box[0], height: box[1], scale },
  );
  return Math.max(sprite.displayWidth, sprite.displayHeight);
}

describe('createAnimalSprite — comparative scale', () => {
  beforeEach(() => {
    registerSickAnimals(new Map());
  });

  const BOX: [number, number] = [240, 240];

  it('draws a hedgehog a third of a dog, in the same box', () => {
    const dog = drawLongSide(DOG, 'dog', 'collie', BOX, 'species');
    const hedgehog = drawLongSide(HEDGEHOG, 'hedgehog', 'brown', BOX, 'species');
    // 0.38 against 1.00 on the ladder. This is the assertion that fails if
    // anybody ever draws animals beside each other off the canvas again.
    expect(hedgehog / dog).toBeCloseTo(SPECIES_UNIT.hedgehog / SPECIES_UNIT.dog, 2);
    expect(hedgehog).toBeLessThan(dog * 0.5);
  });

  it('sets the animal’s long side to her share of the box, exactly', () => {
    for (const [key, species, variant] of [
      [DOG, 'dog', 'collie'], [HEDGEHOG, 'hedgehog', 'brown'], [BAT, 'bat', 'brown'],
    ] as [string, Species, string][]) {
      const drawn = drawLongSide(key, species, variant, BOX, 'species');
      const want = animalScaleFraction(species, variant)! * Math.min(...BOX);
      expect(drawn, key).toBeCloseTo(want, 4);
    }
  });

  it('is independent of how much of its file a sprite happens to fill', () => {
    // The real reason the frame exists. Across the 600 files the subject
    // covers 0.62 to 1.00 of its canvas, so two animals scaled off their
    // canvases come out up to 60% apart for no reason the ladder knows.
    const spread = boundsFor(DOG);
    const tight = { [DOG]: { ...spread[DOG], w: 500, h: 500, x: 6, y: 6 } };
    const loose = { [DOG]: { ...spread[DOG], w: 320, h: 320, x: 96, y: 96 } };
    const sizes = [tight, loose].map((bounds) => {
      const sprite = createAnimalSprite(
        framedScene([DOG], bounds), 0, 0, animal({ species: 'dog', variant: 'collie' }),
        { width: 240, height: 240, scale: 'species' },
      );
      return Math.max(sprite.displayWidth, sprite.displayHeight);
    });
    expect(sizes[0]).toBeCloseTo(sizes[1], 4);
  });

  it('still draws inside the box it was handed', () => {
    for (const [w, h] of [[200, 160], [240, 240], [40, 300], [1, 1]] as [number, number][]) {
      for (const [key, species, variant] of [
        [DOG, 'dog', 'collie'], [BAT, 'bat', 'brown'],
      ] as [string, Species, string][]) {
        const sprite = createAnimalSprite(
          framedScene([key], boundsFor(key)), 0, 0, animal({ species, variant }),
          { width: w, height: h, scale: 'species' },
        );
        expect(sprite.displayWidth, `${key} in ${w}x${h}`).toBeLessThanOrEqual(w + 0.001);
        expect(sprite.displayHeight, `${key} in ${w}x${h}`).toBeLessThanOrEqual(h + 0.001);
      }
    }
  });

  it('separates a macaw from a budgie, which one parrot row cannot', () => {
    // The art has 60 species-variants and the ladder has ten rungs; without
    // the variant table these two birds are the same size.
    const macaw = animalScaleFraction('parrot', 'macaw')!;
    const budgie = animalScaleFraction('parrot', 'budgie')!;
    const sprite = (fraction: number) => fraction * 240;
    expect(sprite(macaw)).toBeGreaterThan(sprite(budgie) * 2.5);
  });

  it('falls back to the plain fit when the sprite has no measured bounds', () => {
    // A texture the bounds table has never seen — a sprite installed after
    // the table was last built. It is drawn at its species' share of the box
    // off the canvas instead, which is right to within how much of its file
    // that one sprite fills, and is never larger than the box.
    const key = 'cat-unmeasured-sheltered';
    const sprite = createAnimalSprite(
      framedScene([key], {}), 0, 0, animal({ species: 'cat', variant: 'unmeasured' }),
      { width: 240, height: 240, scale: 'species' },
    );
    const drawn = Math.max(sprite.displayWidth, sprite.displayHeight);
    expect(drawn).toBeCloseTo(animalScaleFraction('cat')! * 240, 4);
    expect(drawn).toBeLessThanOrEqual(240);
  });
});

describe('createAnimalSprite — a solo animal fills her frame', () => {
  beforeEach(() => {
    registerSickAnimals(new Map());
  });

  it('draws a hedgehog and a dog the same size when each is alone', () => {
    // The decision, as a test. A screen with one animal on it has nothing to
    // compare her against, so a hedgehog there is drawn as large as the frame
    // allows — the same frame a dog would have had.
    const dog = drawLongSide(DOG, 'dog', 'collie', [240, 240], 'fill');
    const hedgehog = drawLongSide(HEDGEHOG, 'hedgehog', 'brown', [240, 240], 'fill');
    expect(hedgehog).toBeCloseTo(dog, 4);
  });

  it('is the same drawing as before the scale ladder existed', () => {
    // `'fill'` is a claim, not a change: these screens were already right,
    // and their labels, dirt spots and toy rows are measured against this
    // box. Asserting it stops a later tidy-up from quietly resizing them.
    const bounds = boundsFor(HEDGEHOG);
    const withClaim = createAnimalSprite(
      framedScene([HEDGEHOG], bounds), 0, 0, animal({ species: 'hedgehog', variant: 'brown' }),
      { width: 360, height: 320, scale: 'fill' },
    );
    const without = createAnimalSprite(
      framedScene([HEDGEHOG], bounds), 0, 0, animal({ species: 'hedgehog', variant: 'brown' }),
      { width: 360, height: 320 },
    );
    expect(withClaim.displayWidth).toBe(without.displayWidth);
    expect(withClaim.displayHeight).toBe(without.displayHeight);
  });
});
