import { describe, it, expect } from 'vitest';
import { VEHICLE_DEFS, type VehicleType } from '@arc/game-logic';
import {
  BAY_GAP, BAY_MIN, BED_PAD, VEHICLE_BED, VEHICLE_SPRITE, fitLoadBed,
} from '../fleet-art';

/** The shipping sprites, at the sizes on disk on 2026-10-08. */
const SPRITE_SIZE: Record<VehicleType, { w: number; h: number }> = {
  'pedal-trike': { w: 364, h: 851 },
  'small-van': { w: 666, h: 960 },
  'long-van': { w: 606, h: 1022 },
  'animal-lorry': { w: 513, h: 1012 },
  'electric-minibus': { w: 621, h: 959 },
};

/** The vehicle column the loading screen gives itself, by viewport. */
const COLUMNS = {
  'desktop 1024x700': { w: 532, h: 383 },
  'narrow 820x620': { w: 408, h: 303 },
  'landscape phone 874x402': { w: 443, h: 121 },
};

const EVERY_VEHICLE = Object.values(VEHICLE_DEFS);

describe('fleet art', () => {
  it('has a sprite key and a load bed for every vehicle in the fleet', () => {
    for (const v of EVERY_VEHICLE) {
      expect(VEHICLE_SPRITE[v.id]).toBeTruthy();
      expect(VEHICLE_BED[v.id]).toBeTruthy();
    }
  });

  it('keeps every load bed inside its sprite', () => {
    for (const v of EVERY_VEHICLE) {
      const bed = VEHICLE_BED[v.id];
      expect(bed.x).toBeGreaterThanOrEqual(0);
      expect(bed.y).toBeGreaterThanOrEqual(0);
      expect(bed.x + bed.w).toBeLessThanOrEqual(1);
      expect(bed.y + bed.h).toBeLessThanOrEqual(1);
    }
  });
});

describe('fitLoadBed', () => {
  it.each(Object.entries(COLUMNS))('gives tappable bays at %s', (_label, box) => {
    for (const v of EVERY_VEHICLE) {
      const fit = fitLoadBed(box, SPRITE_SIZE[v.id], VEHICLE_BED[v.id], v.cols, v.rows);
      // At or above the floor, the hit areas floored at MIN_TAP cannot
      // overlap their neighbours — which is what the floor is for.
      expect(fit.slotW, `${v.name} bay width`).toBeGreaterThanOrEqual(BAY_MIN);
      expect(fit.slotH, `${v.name} bay height`).toBeGreaterThanOrEqual(BAY_MIN);
    }
  });

  it('keeps the grid inside the bed, and the vehicle inside its column', () => {
    for (const [, box] of Object.entries(COLUMNS)) {
      for (const v of EVERY_VEHICLE) {
        const fit = fitLoadBed(box, SPRITE_SIZE[v.id], VEHICLE_BED[v.id], v.cols, v.rows);
        expect(fit.gridW, `${v.name} grid width`).toBeLessThanOrEqual(fit.bed.w - BED_PAD);
        expect(fit.gridH, `${v.name} grid height`).toBeLessThanOrEqual(fit.bed.h - BED_PAD);
        // A vehicle may run off the bottom of the picture; never off the
        // side into the message panel.
        expect(fit.spriteW, `${v.name} drawn width`).toBeLessThanOrEqual(box.w + 0.5);
      }
    }
  });

  it('draws the whole vehicle when the bays already clear the floor', () => {
    const box = COLUMNS['desktop 1024x700'];
    const trikey = fitLoadBed(
      box, SPRITE_SIZE['pedal-trike'], VEHICLE_BED['pedal-trike'], 1, 2,
    );
    expect(trikey.overflows).toBe(false);
    expect(trikey.spriteH).toBeLessThanOrEqual(box.h + 0.5);
  });

  it('grows the lorry past its box rather than shrinking nine bays below the floor', () => {
    const box = COLUMNS['desktop 1024x700'];
    const bed = VEHICLE_BED['animal-lorry'];
    const sprite = SPRITE_SIZE['animal-lorry'];

    // Scaled to fit, her bed is far too small for a 3x3 — this is the
    // premise the overscale exists to answer, so assert it rather than
    // assume it.
    const fitScale = Math.min(box.w / sprite.w, box.h / sprite.h);
    const naiveSlotH = (sprite.h * fitScale * bed.h - BED_PAD * 2 - BAY_GAP * 2) / 3;
    expect(naiveSlotH).toBeLessThan(BAY_MIN);

    const fit = fitLoadBed(box, sprite, bed, 3, 3);
    expect(fit.overflows).toBe(true);
    expect(fit.slotH).toBeGreaterThanOrEqual(BAY_MIN);
  });

  it('gives a bigger grid smaller bays in the same vehicle', () => {
    const box = COLUMNS['desktop 1024x700'];
    const sprite = SPRITE_SIZE['small-van'];
    const bed = VEHICLE_BED['small-van'];
    const twoByTwo = fitLoadBed(box, sprite, bed, 2, 2);
    const threeByThree = fitLoadBed(box, sprite, bed, 3, 3);
    expect(threeByThree.slotW).toBeLessThan(twoByTwo.slotW);
  });

  it('never returns a zero or negative bay, however small the box', () => {
    const fit = fitLoadBed({ w: 40, h: 30 }, { w: 513, h: 1012 }, VEHICLE_BED['animal-lorry'], 3, 3);
    expect(fit.slotW).toBeGreaterThan(0);
    expect(fit.slotH).toBeGreaterThan(0);
  });
});
