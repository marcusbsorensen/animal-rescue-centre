import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Species } from '@arc/shared-types';
import {
  SPECIES_AWAITING_GARMENT_ART,
  getGarmentForSpecies,
  getWardrobeTextureKey,
  type WardrobeAnchor,
} from '@arc/game-logic';
import { WardrobeAnchors, splitTextureKey } from '../WardrobeAnchors';
import { animalSpriteBounds } from '../../ui/animal-sprite-bounds';

const ANIMALS = path.join(__dirname, '../../../public/assets/animals');
const ANCHORS = path.join(__dirname, '../../../public/data/wardrobe-anchors.json');
const ALL: Species[] = ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake', 'hedgehog'];
const POSES = ['arriving', 'sheltered', 'eating', 'sleeping', 'walking', 'growling', 'grumpy', 'scared', 'sick', 'playing'];

const anchors = JSON.parse(fs.readFileSync(ANCHORS, 'utf8')) as Record<string, WardrobeAnchor>;

/** Width and height of a PNG, read from its header and not decoded. */
function pngSize(file: string): { width: number; height: number } {
  const head = fs.readFileSync(file).subarray(0, 24);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

describe('splitTextureKey', () => {
  it('takes a variant sprite apart', () => {
    expect(splitTextureKey('dog', 'dog-husky-sheltered')).toEqual({ variant: 'husky', pose: 'sheltered' });
  });

  it('takes a species-level sprite apart: a pose and no variant', () => {
    expect(splitTextureKey('dog', 'dog-sheltered')).toEqual({ pose: 'sheltered' });
  });

  it('answers nothing for a key that is not a sprite of this species', () => {
    expect(splitTextureKey('dog', 'cat-ginger-sheltered')).toEqual({});
    expect(splitTextureKey('dog', 'dog-coat')).toEqual({});
    expect(splitTextureKey('dog', 'dog-husky-sheltered+dog-coat@c0392b')).toEqual({});
  });
});

describe('WardrobeAnchors', () => {
  it('answers for the sprite that is drawn, and for the species-level one by its own entry', () => {
    const entry = (dx: number): WardrobeAnchor => ({ dx, dy: 0, widthFrac: 0.2, heightFrac: 0.1, rotation: 0 });
    const w = new WardrobeAnchors();
    w.setData({ 'dog-husky-sheltered': entry(0.1), 'dog-sheltered': entry(0.2) });
    expect(w.get('dog', 'dog-husky-sheltered').dx).toBe(0.1);
    expect(w.get('dog', 'dog-sheltered').dx).toBe(0.2);
  });

  it('answers from the defaults before the file has loaded, so the garment is somewhere sensible', () => {
    const w = new WardrobeAnchors();
    expect(w.isLoaded()).toBe(false);
    const a = w.get('cat', 'cat-ginger-sheltered');
    expect(a.widthFrac).toBeGreaterThan(0);
    expect(a.heightFrac).toBeGreaterThan(0);
  });
});

/**
 * `public/data/wardrobe-anchors.json` is measured by
 * `tools/measure-wardrobe-anchors.py` from the sprites on disk. These are the
 * properties of it that the sprite layer relies on, and that go wrong
 * quietly: a sprite with no entry is drawn with the species default, which is
 * a coat in the middle of the room.
 */
describe('wardrobe-anchors.json', () => {
  const dressedSpecies = ALL.filter((s) => !SPECIES_AWAITING_GARMENT_ART.has(s));

  /** Every sprite a dressed animal can be drawn from: not arriving, species with garment art. */
  const sprites = fs.readdirSync(ANIMALS)
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.slice(0, -4))
    .filter((key) => {
      const parts = key.split('-');
      return (parts.length === 2 || parts.length === 3)
        && POSES.includes(parts[parts.length - 1])
        && parts[parts.length - 1] !== 'arriving'
        && dressedSpecies.includes(parts[0] as Species);
    });

  it('has an entry for every sprite a dressed animal can be drawn from', () => {
    const missing = sprites.filter((k) => !anchors[k]);
    expect(missing).toEqual([]);
  });

  it('has no entry for a sprite that does not exist, or that is never dressed', () => {
    const known = new Set(sprites);
    expect(Object.keys(anchors).filter((k) => !known.has(k))).toEqual([]);
  });

  it('has sane numbers', () => {
    for (const [key, a] of Object.entries(anchors)) {
      expect(Math.abs(a.dx), key).toBeLessThanOrEqual(0.55);
      expect(Math.abs(a.dy), key).toBeLessThanOrEqual(0.55);
      expect(a.widthFrac, key).toBeGreaterThan(0.04);
      expect(a.widthFrac, key).toBeLessThanOrEqual(0.7);
      expect(a.heightFrac, key).toBeGreaterThan(0.02);
      expect(a.heightFrac, key).toBeLessThanOrEqual(0.7);
      expect(Math.abs(a.rotation), key).toBeLessThanOrEqual(180);
      if (a.maskRadiusFrac !== undefined) {
        expect(a.maskDx, key).toBeDefined();
        expect(a.maskDy, key).toBeDefined();
        expect(a.maskRadiusFrac, key).toBeGreaterThan(0.03);
        expect(a.maskRadiusFrac, key).toBeLessThan(0.4);
      }
    }
  });

  /**
   * The animal is drawn from a frame cut to her bounds, and her garment must
   * not make that frame bigger or push her about: anything outside it is cut
   * off, and anything that grew it would shrink her. So a garment has to sit
   * inside the box the animal already occupies.
   */
  it('keeps every garment inside the box its animal already occupies', () => {
    const TOL = 6 / 512;
    const outside: string[] = [];
    for (const key of sprites) {
      const a = anchors[key];
      const b = animalSpriteBounds(key);
      if (!b) continue;
      const species = key.split('-')[0] as Species;
      const art = pngSize(path.join(ANIMALS, `${getWardrobeTextureKey(species)}.png`));
      const k = Math.min(a.widthFrac / art.width, a.heightFrac / art.height);
      const w = art.width * k;
      const h = art.height * k;
      const t = (a.rotation * Math.PI) / 180;
      const hx = (Math.abs(w * Math.cos(t)) + Math.abs(h * Math.sin(t))) / 2;
      const hy = (Math.abs(w * Math.sin(t)) + Math.abs(h * Math.cos(t))) / 2;
      const cx = 0.5 + a.dx;
      const cy = 0.5 + a.dy;
      const bx0 = b.x / b.canvasW;
      const by0 = b.y / b.canvasH;
      const bx1 = (b.x + b.w) / b.canvasW;
      const by1 = (b.y + b.h) / b.canvasH;
      if (cx - hx < bx0 - TOL || cx + hx > bx1 + TOL || cy - hy < by0 - TOL || cy + hy > by1 + TOL) {
        outside.push(key);
      }
    }
    expect(outside).toEqual([]);
  });
});

describe('garment art on disk', () => {
  it('is drawn for every species but the ones waiting for it, and for none of those', () => {
    for (const species of ALL) {
      const file = path.join(ANIMALS, `${getWardrobeTextureKey(species)}.png`);
      if (SPECIES_AWAITING_GARMENT_ART.has(species)) {
        // When this fails the art has landed: take the species out of
        // SPECIES_AWAITING_GARMENT_ART, add it to GARMENT in
        // tools/measure-wardrobe-anchors.py (it is there) and re-run the tool.
        expect(fs.existsSync(file), `${species} has art: remove it from SPECIES_AWAITING_GARMENT_ART`).toBe(false);
      } else {
        expect(fs.existsSync(file), `${getWardrobeTextureKey(species)}.png`).toBe(true);
      }
    }
  });

  it('is the garment the species wears', () => {
    expect(getWardrobeTextureKey('cat')).toBe(`cat-${getGarmentForSpecies('cat')}`);
  });

  it('is a real picture, not a placeholder: transparent, cropped to its content, a sensible size', () => {
    for (const species of ALL.filter((s) => !SPECIES_AWAITING_GARMENT_ART.has(s))) {
      const { width, height } = pngSize(path.join(ANIMALS, `${getWardrobeTextureKey(species)}.png`));
      expect(width, species).toBeGreaterThan(200);
      expect(width, species).toBeLessThanOrEqual(512);
      expect(height, species).toBeGreaterThan(150);
      expect(height, species).toBeLessThanOrEqual(512);
    }
  });
});
