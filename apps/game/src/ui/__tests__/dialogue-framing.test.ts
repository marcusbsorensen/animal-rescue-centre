import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADOPTER_HOUSEHOLD_DEFS } from '@arc/game-logic';
import { DIALOGUE_CROPS, portraitCropFor } from '../dialogue-framing';

/**
 * Adopter portraits are full-figure catalogue shots; the dialogue shows them
 * waist-up. tools/build-dialogue-framing.py writes the crop table, and this
 * keeps it honest against the pictures on disk.
 */

const CAST = path.resolve(__dirname, '../../../public/admin/scene-assets/cast');

describe('dialogue portrait framing', () => {
  it('has a crop for Marnie, both expressions', () => {
    expect(portraitCropFor('/admin/scene-assets/cast/warden-marnie.png')).toBeDefined();
    expect(portraitCropFor('/admin/scene-assets/cast/warden-marnie-happy.png')).toBeDefined();
  });

  it('has a crop for every adopting household, neutral and greeting', () => {
    for (const h of ADOPTER_HOUSEHOLD_DEFS) {
      expect(portraitCropFor(h.avatarSrc), `${h.householdId} neutral`).toBeDefined();
      const greeting = h.avatarSrc.replace(/\/([^/]+)\.png$/, '/variants/$1-greeting.png');
      const file = path.join(CAST, 'variants', path.basename(greeting));
      if (fs.existsSync(file)) {
        expect(portraitCropFor(greeting), `${h.householdId} greeting`).toBeDefined();
      }
    }
  });

  it('keeps every crop inside its picture', () => {
    for (const [key, [x, y, w, h]] of Object.entries(DIALOGUE_CROPS)) {
      expect(x, key).toBeGreaterThanOrEqual(0);
      expect(y, key).toBeGreaterThanOrEqual(0);
      expect(w, key).toBeGreaterThan(0.1);
      expect(h, key).toBeGreaterThan(0.1);
      expect(x + w, key).toBeLessThanOrEqual(1.0001);
      expect(y + h, key).toBeLessThanOrEqual(1.0001);
    }
  });

  it('cuts the full-figure adopters at the waist, not the feet', () => {
    for (const h of ADOPTER_HOUSEHOLD_DEFS) {
      const [, y, , ch] = portraitCropFor(h.avatarSrc)!;
      // Everyone is cropped well short of the bottom of the picture.
      expect(y + ch, h.householdId).toBeLessThan(0.75);
    }
  });

  it("stops Priya's crop at the chair's arm rests, so the chair is not sliced through the wheels", () => {
    const [, y, , h] = portraitCropFor('/admin/scene-assets/cast/01-priya.png')!;
    const bottom = y + h;
    // Her hands and the arm rests are in frame (below 0.5 of the picture)
    // and the wheel, which starts at about 0.53, shows at most as a rim.
    expect(bottom).toBeGreaterThan(0.5);
    expect(bottom).toBeLessThanOrEqual(0.58);
  });

  it('finds a crop from a URL with a query string, and from a bare name', () => {
    expect(portraitCropFor('/admin/scene-assets/cast/01-priya.png?v=2')).toEqual(DIALOGUE_CROPS['01-priya']);
    expect(portraitCropFor('01-priya.png')).toEqual(DIALOGUE_CROPS['01-priya']);
    expect(portraitCropFor('/somewhere/nobody.png')).toBeUndefined();
  });
});
