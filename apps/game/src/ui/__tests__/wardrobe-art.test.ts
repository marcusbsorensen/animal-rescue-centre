import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import type { WardrobeAnchor } from '@arc/game-logic';
import {
  CREAM_RGB,
  GARMENT_TONES,
  INK_RGB,
  dressedKey,
  ensureDressedTexture,
  garmentPlacement,
  hexToRgb,
  paintDressed,
  tintGarmentLuminance,
  tintGarmentRgb,
  tintTable,
  tintedGarmentKey,
  type GarmentPlacement,
} from '../wardrobe-art';

/**
 * The garment is drawn in greys by `tools/draw-garments.py` and coloured here.
 * Two files that have to agree about four numbers is exactly the thing that
 * drifts, so the first test reads the drawing tool and compares.
 */
describe('the tone convention shared with tools/draw-garments.py', () => {
  const py = fs.readFileSync(path.join(__dirname, '../../../../../tools/draw-garments.py'), 'utf8');
  const tone = (name: string): number => {
    const m = py.match(new RegExp(`^${name} = '#([0-9a-f]{6})'`, 'm'));
    if (!m) throw new Error(`${name} is not defined in tools/draw-garments.py`);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };

  it('has the same shade, base and light the game maps from', () => {
    expect(tone('SHADE')).toBeCloseTo(GARMENT_TONES.shade, 2);
    expect(tone('BASE')).toBeCloseTo(GARMENT_TONES.base, 2);
    expect(tone('LIGHT')).toBeCloseTo(GARMENT_TONES.light, 2);
  });

  it('draws cream at or above the luminance the game reads as cream', () => {
    expect(tone('CREAM')).toBeGreaterThanOrEqual(GARMENT_TONES.cream);
  });

  it('draws its ink where the game takes it to be ink', () => {
    const m = py.match(/^INK = '#([0-9a-f]{6})'/m)!;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    expect([r, g, b]).toEqual([...INK_RGB]);
  });
});

describe('tintGarmentLuminance', () => {
  const rust = hexToRgb('#c0392b');

  it('is the colour the child picked, at the base tone', () => {
    const c = tintGarmentLuminance(GARMENT_TONES.base, rust);
    expect(c.map(Math.round)).toEqual([...rust]);
  });

  it('is darker in the shade and lighter in the light, in the same hue', () => {
    const shade = tintGarmentLuminance(GARMENT_TONES.shade, rust);
    const light = tintGarmentLuminance(GARMENT_TONES.light, rust);
    expect(shade[0]).toBeCloseTo(rust[0] * 0.68, 5);
    expect(shade[1]).toBeCloseTo(rust[1] * 0.68, 5);
    expect(light[0]).toBeGreaterThan(rust[0]);
    expect(light[1]).toBeGreaterThan(rust[1]);
    expect(light[2]).toBeGreaterThan(rust[2]);
  });

  it('leaves cream trim cream whatever colour was picked', () => {
    for (const hex of ['#c0392b', '#2c3e50', '#e3b04b']) {
      expect(tintGarmentLuminance(1, hexToRgb(hex))).toEqual([...CREAM_RGB]);
    }
  });

  it('keeps the ink as drawn, and blends to it at an anti-aliased edge', () => {
    expect(tintGarmentLuminance(0.106, rust).map(Math.round)).toEqual([...INK_RGB]);
    const edge = tintGarmentLuminance(0.36, rust);
    expect(edge[0]).toBeGreaterThan(INK_RGB[0]);
    expect(edge[0]).toBeLessThan(rust[0] * 0.68);
  });

  it('is darker for darker luminance, all the way down, for every colour', () => {
    for (const hex of ['#c0392b', '#2c3e50', '#e3b04b', '#27ae60', '#8e44ad', '#16a085']) {
      let last = -1;
      for (let i = 0; i <= 255; i++) {
        const c = tintGarmentLuminance(i / 255, hexToRgb(hex));
        const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
        expect(lum).toBeGreaterThanOrEqual(last - 1e-6);
        last = lum;
      }
    }
  });

  it('is the same from an 8-bit pixel, and from the table', () => {
    const table = tintTable(rust);
    for (const grey of [30, 100, 158, 204, 235, 255]) {
      const direct = tintGarmentRgb(grey, grey, grey, rust);
      expect(table[grey * 3]).toBe(Math.round(direct[0]));
      expect(table[grey * 3 + 1]).toBe(Math.round(direct[1]));
      expect(table[grey * 3 + 2]).toBe(Math.round(direct[2]));
    }
  });

  it('turns a hex that cannot be read into the default colour and not a crash', () => {
    expect([...hexToRgb('nonsense')]).toEqual([0xc0, 0x39, 0x2b]);
    expect([...hexToRgb('#27ae60')]).toEqual([0x27, 0xae, 0x60]);
  });
});

describe('garmentPlacement', () => {
  const anchor: WardrobeAnchor = {
    dx: 0.1, dy: -0.2, widthFrac: 0.4, heightFrac: 0.4, rotation: 90,
    maskDx: 0, maskDy: -0.25, maskRadiusFrac: 0.1,
  };

  it('puts the centre where the fractions say, on the sprite it is given', () => {
    const p = garmentPlacement(anchor, { width: 400, height: 200 }, { width: 512, height: 512 });
    expect(p.cx).toBeCloseTo(256 + 51.2, 5);
    expect(p.cy).toBeCloseTo(256 - 102.4, 5);
  });

  it('keeps the drawing\'s own proportions inside the box', () => {
    const p = garmentPlacement(anchor, { width: 400, height: 200 }, { width: 512, height: 512 });
    expect(p.w / p.h).toBeCloseTo(2, 5);
    expect(p.w).toBeCloseTo(0.4 * 512, 5);
    // a taller drawing is limited by the box's height instead
    const tall = garmentPlacement(anchor, { width: 100, height: 400 }, { width: 512, height: 512 });
    expect(tall.h).toBeCloseTo(0.4 * 512, 5);
    expect(tall.w).toBeCloseTo(0.1 * 512, 5);
  });

  it('works on a 128 pixel fallback sprite the same way, in its own pixels', () => {
    const p = garmentPlacement(anchor, { width: 400, height: 200 }, { width: 128, height: 128 });
    expect(p.cx).toBeCloseTo(64 + 12.8, 5);
    expect(p.w).toBeCloseTo(0.4 * 128, 5);
  });

  it('converts degrees to radians and carries the flip and the head mask', () => {
    const p = garmentPlacement({ ...anchor, flip: true }, { width: 400, height: 200 }, { width: 512, height: 512 });
    expect(p.rotation).toBeCloseTo(Math.PI / 2, 8);
    expect(p.flip).toBe(true);
    expect(p.mask).toEqual({ cx: 256, cy: 256 - 128, r: 51.2 });
  });

  it('has no mask when the anchor names none, and does not flip', () => {
    const bare: WardrobeAnchor = { dx: 0, dy: 0, widthFrac: 0.2, heightFrac: 0.2, rotation: 0 };
    const p = garmentPlacement(bare, { width: 10, height: 10 }, { width: 512, height: 512 });
    expect(p.mask).toBeUndefined();
    expect(p.flip).toBe(false);
  });
});

/** A 2d context that writes down what it was asked to do, in order. */
function recorder(name: string, log: string[]) {
  const ctx: Record<string, unknown> = {
    canvas: { name: `${name}-canvas` },
    globalCompositeOperation: 'source-over',
  };
  for (const fn of ['clearRect', 'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'arc', 'fill']) {
    ctx[fn] = (...args: unknown[]) => { log.push(`${name}.${fn}(${args.map((a) => (typeof a === 'number' ? +a.toFixed(2) : a)).join(',')})`); };
  }
  ctx.drawImage = (img: { name?: string }, ...args: unknown[]) => {
    log.push(`${name}.drawImage(${img.name ?? 'canvas'},${args.map((a) => +(a as number).toFixed(2)).join(',')}) op=${ctx.globalCompositeOperation}`);
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

describe('paintDressed', () => {
  const size = { width: 512, height: 512 };
  const base = { name: 'base' } as unknown as CanvasImageSource;
  const garment = { name: 'garment' } as unknown as CanvasImageSource;
  const placement: GarmentPlacement = {
    cx: 200, cy: 150, w: 100, h: 60, rotation: 0.5, flip: false,
    mask: { cx: 210, cy: 120, r: 40 },
  };

  it('draws the animal first, the garment on a layer, and the layer over her', () => {
    const log: string[] = [];
    paintDressed(recorder('ctx', log), recorder('layer', log), base, garment, placement, 'scarf', size);
    expect(log[0]).toBe('ctx.drawImage(base,0,0,512,512) op=source-over');
    expect(log).toContain('layer.translate(200,150)');
    expect(log).toContain('layer.rotate(0.5)');
    expect(log).toContain('layer.drawImage(garment,-50,-30,100,60) op=source-over');
    expect(log[log.length - 1]).toBe('ctx.drawImage(layer-canvas,0,0) op=source-over');
  });

  it('cuts the head out of the garment, so a scarf tucks behind it', () => {
    const log: string[] = [];
    paintDressed(recorder('ctx', log), recorder('layer', log), base, garment, placement, 'scarf', size);
    const arc = log.indexOf('layer.arc(210,120,40,0,6.28)');
    expect(arc).toBeGreaterThan(log.indexOf('layer.drawImage(garment,-50,-30,100,60) op=source-over'));
    expect(log.indexOf('layer.fill()')).toBeGreaterThan(arc);
  });

  it('mirrors a flipped garment before it is rotated', () => {
    const log: string[] = [];
    paintDressed(recorder('ctx', log), recorder('layer', log), base, garment, { ...placement, flip: true }, 'coat', size);
    expect(log.indexOf('layer.rotate(0.5)')).toBeLessThan(log.indexOf('layer.scale(-1,1)'));
    expect(log.indexOf('layer.scale(-1,1)')).toBeLessThan(log.indexOf('layer.drawImage(garment,-50,-30,100,60) op=source-over'));
  });

  it('clips a coat to the animal\'s silhouette and nothing else', () => {
    const coat: string[] = [];
    paintDressed(recorder('ctx', coat), recorder('layer', coat), base, garment, placement, 'coat', size);
    expect(coat).toContain('layer.drawImage(base,0,0,512,512) op=destination-in');

    for (const kind of ['scarf', 'hat'] as const) {
      const other: string[] = [];
      paintDressed(recorder('ctx', other), recorder('layer', other), base, garment, placement, kind, size);
      expect(other.some((l) => l.includes('destination-in'))).toBe(false);
    }
  });

  it('puts the compositing mode back, so the next animal is not drawn with it', () => {
    const layer = recorder('layer', []);
    paintDressed(recorder('ctx', []), layer, base, garment, placement, 'coat', size);
    expect((layer as unknown as { globalCompositeOperation: string }).globalCompositeOperation).toBe('source-over');
  });
});

describe('texture keys', () => {
  it('name the colour, so a recoloured garment is a different texture', () => {
    expect(tintedGarmentKey('dog-coat', '#C0392B')).toBe('dog-coat@c0392b');
    expect(dressedKey('dog-husky-sheltered', 'dog-coat', '#c0392b'))
      .toBe('dog-husky-sheltered+dog-coat@c0392b');
    expect(dressedKey('dog-husky-sheltered', 'dog-coat', '#2c3e50'))
      .not.toBe(dressedKey('dog-husky-sheltered', 'dog-coat', '#c0392b'));
  });
});

describe('ensureDressedTexture — when she is drawn as she is', () => {
  function animal(over: Partial<Animal>): Pick<Animal, 'species' | 'wardrobe'> {
    return { species: 'cat', ...over } as Pick<Animal, 'species' | 'wardrobe'>;
  }

  /** A scene whose texture manager can paint, with only `have` on disk. */
  function paintingScene(have: string[]) {
    const created: string[] = [];
    const scene = {
      textures: {
        exists: (k: string) => have.includes(k) || created.includes(k),
        get: () => ({ getSourceImage: () => ({ width: 512, height: 512 }) }),
        createCanvas: (k: string) => { created.push(k); return { getContext: () => recorder('c', []), refresh() {} }; },
        remove: (k: string) => { created.splice(created.indexOf(k), 1); },
      },
    } as unknown as Phaser.Scene;
    return { scene, created };
  }

  it('has nothing on, or something that is no garment', () => {
    const { scene } = paintingScene(['cat-ginger-sheltered', 'cat-scarf']);
    expect(ensureDressedTexture(scene, 'cat-ginger-sheltered', animal({}))).toBeNull();
    expect(ensureDressedTexture(scene, 'cat-ginger-sheltered', animal({ wardrobe: 'cape:#c0392b' }))).toBeNull();
  });

  it('is in her arriving box', () => {
    const { scene, created } = paintingScene(['cat-ginger-arriving', 'cat-scarf']);
    expect(ensureDressedTexture(scene, 'cat-ginger-arriving', animal({ wardrobe: 'scarf:#c0392b' }))).toBeNull();
    expect(created).toEqual([]);
  });

  it('is a species whose garment has not been drawn yet', () => {
    const { scene, created } = paintingScene(['hedgehog-brown-sheltered', 'hedgehog-scarf']);
    expect(ensureDressedTexture(scene, 'hedgehog-brown-sheltered', animal({ species: 'hedgehog', wardrobe: 'scarf' }))).toBeNull();
    expect(created).toEqual([]);
  });

  it('has a garment whose art is not loaded: bare, not a box', () => {
    const { scene, created } = paintingScene(['cat-ginger-sheltered']);       // no cat-scarf
    expect(ensureDressedTexture(scene, 'cat-ginger-sheltered', animal({ wardrobe: 'scarf:#c0392b' }))).toBeNull();
    expect(created).toEqual([]);
  });

  it('is in a scene that cannot paint, as every unit-test scene is', () => {
    const scene = { textures: { exists: () => true } } as unknown as Phaser.Scene;
    expect(ensureDressedTexture(scene, 'cat-ginger-sheltered', animal({ wardrobe: 'scarf' }))).toBeNull();
  });

  it('is handed a texture manager that throws: bare, and no half-made texture left behind', () => {
    const created: string[] = [];
    const scene = {
      textures: {
        exists: (k: string) => ['cat-ginger-sheltered', 'cat-scarf'].includes(k) || created.includes(k),
        get: () => { throw new Error('GPU lost'); },
        createCanvas: (k: string) => { created.push(k); return { getContext: () => recorder('c', []), refresh() {} }; },
        remove: (k: string) => { created.splice(created.indexOf(k), 1); },
      },
    } as unknown as Phaser.Scene;
    expect(ensureDressedTexture(scene, 'cat-ginger-sheltered', animal({ wardrobe: 'scarf' }))).toBeNull();
    expect(created).toEqual([]);
  });
});

describe('ensureDressedTexture — when she is dressed', () => {
  it('asks for one texture per sprite and colour, and answers from it the second time', () => {
    const created: string[] = [];
    const canvas = vi.spyOn(document, 'createElement').mockImplementation(
      () => ({ width: 0, height: 0, getContext: () => recorder('layer', []) }) as unknown as HTMLCanvasElement,
    );
    const scene = {
      textures: {
        exists: (k: string) => ['cat-ginger-sheltered', 'cat-scarf'].includes(k) || created.includes(k),
        get: () => ({ getSourceImage: () => ({ width: 512, height: 512 }) }),
        createCanvas: (k: string) => {
          created.push(k);
          return {
            getContext: () => ({
              drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(512 * 512 * 4) }),
              putImageData() {}, clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
              scale() {}, beginPath() {}, arc() {}, fill() {}, canvas: {},
            }),
            refresh() {},
          };
        },
        remove() {},
      },
    } as unknown as Phaser.Scene;
    const a = { species: 'cat', wardrobe: 'scarf:#c0392b' } as Pick<Animal, 'species' | 'wardrobe'>;

    const first = ensureDressedTexture(scene, 'cat-ginger-sheltered', a);
    expect(first).toBe('cat-ginger-sheltered+cat-scarf@c0392b');
    expect(created).toEqual(['cat-scarf@c0392b', 'cat-ginger-sheltered+cat-scarf@c0392b']);

    const again = ensureDressedTexture(scene, 'cat-ginger-sheltered', a);
    expect(again).toBe(first);
    expect(created).toHaveLength(2);

    const blue = ensureDressedTexture(scene, 'cat-ginger-sheltered', { ...a, wardrobe: 'scarf:#2c3e50' });
    expect(blue).toBe('cat-ginger-sheltered+cat-scarf@2c3e50');
    canvas.mockRestore();
  });
});
