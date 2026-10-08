import { describe, it, expect } from 'vitest';
import { VEHICLE_DEFS, type VehicleType } from '@arc/game-logic';
import {
  BAY_GAP, BAY_MIN, BED_PAD, BED_SLACK,
  VEHICLE_BED, VEHICLE_BED_SOURCE, VEHICLE_SPRITE, bedProbePoints, fitLoadBed,
} from '../fleet-art';

/**
 * The vehicle box the loading screen hands out, measured off its own
 * layout at the three viewports it is checked at: the tarmac, inset far
 * enough on every side for the vehicle to have air round it.
 */
const COLUMNS = {
  'desktop 1024x700': { w: 524, h: 471 },
  'narrow 820x620': { w: 400, h: 391 },
  'landscape phone 874x402': { w: 431, h: 98 },
};
/** The two the vehicle is required to fit whole. */
const ROOMY = ['desktop 1024x700', 'narrow 820x620'] as const;

const EVERY_VEHICLE = Object.values(VEHICLE_DEFS);
const spriteOf = (id: VehicleType) => VEHICLE_BED_SOURCE[id];
const fitIn = (box: { w: number; h: number }, v: { id: VehicleType; cols: number; rows: number }) =>
  fitLoadBed(box, spriteOf(v.id), VEHICLE_BED[v.id], v.cols, v.rows);

describe('fleet art', () => {
  it('has a sprite key, a load bed and a measured source for every vehicle', () => {
    for (const v of EVERY_VEHICLE) {
      expect(VEHICLE_SPRITE[v.id]).toBeTruthy();
      expect(VEHICLE_BED[v.id]).toBeTruthy();
      expect(VEHICLE_BED_SOURCE[v.id]).toBeTruthy();
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

  it('probes nine points, all of them on the bed', () => {
    for (const v of EVERY_VEHICLE) {
      const bed = VEHICLE_BED[v.id];
      const points = bedProbePoints(bed);
      expect(points).toHaveLength(9);
      for (const { u, v: pv } of points) {
        expect(u).toBeGreaterThanOrEqual(bed.x);
        expect(u).toBeLessThanOrEqual(bed.x + bed.w);
        expect(pv).toBeGreaterThanOrEqual(bed.y);
        expect(pv).toBeLessThanOrEqual(bed.y + bed.h);
      }
    }
  });
});

describe('fitLoadBed', () => {
  it.each(Object.entries(COLUMNS))('gives tappable bays at %s', (_label, box) => {
    for (const v of EVERY_VEHICLE) {
      const fit = fitIn(box, v);
      // At or above the floor, the hit areas floored at MIN_TAP cannot
      // overlap their neighbours — which is what the floor is for.
      expect(fit.slotW, `${v.name} bay width`).toBeGreaterThanOrEqual(BAY_MIN);
      expect(fit.slotH, `${v.name} bay height`).toBeGreaterThanOrEqual(BAY_MIN);
    }
  });

  it.each(ROOMY)('draws the whole vehicle inside its box at %s', (label) => {
    const box = COLUMNS[label];
    for (const v of EVERY_VEHICLE) {
      const fit = fitIn(box, v);
      expect(fit.overflows, `${v.name} overflows`).toBe(false);
      expect(fit.spriteH, `${v.name} drawn height`).toBeLessThanOrEqual(box.h + 0.5);
      expect(fit.spriteW, `${v.name} drawn width`).toBeLessThanOrEqual(box.w + 0.5);
    }
  });

  it('keeps the grid on the floor, and the floor within the bed and its slack', () => {
    for (const [, box] of Object.entries(COLUMNS)) {
      for (const v of EVERY_VEHICLE) {
        const fit = fitIn(box, v);
        expect(fit.gridW, `${v.name} grid width`).toBeLessThanOrEqual(fit.floor.w - BED_PAD);
        expect(fit.gridH, `${v.name} grid height`).toBeLessThanOrEqual(fit.floor.h - BED_PAD);
        expect(fit.floor.w, `${v.name} floor width`)
          .toBeLessThanOrEqual(fit.bed.w * BED_SLACK + 1);
        expect(fit.floor.h, `${v.name} floor height`)
          .toBeLessThanOrEqual(fit.bed.h * BED_SLACK + 1);
      }
    }
  });

  it('centres the floor on the bed', () => {
    const box = COLUMNS['desktop 1024x700'];
    for (const v of EVERY_VEHICLE) {
      const { bed, floor } = fitIn(box, v);
      expect(floor.x + floor.w / 2).toBeCloseTo(bed.x + bed.w / 2, 5);
      expect(floor.y + floor.h / 2).toBeCloseTo(bed.y + bed.h / 2, 5);
    }
  });

  it('spends the bed slack rather than growing the lorry out of frame', () => {
    const box = COLUMNS['desktop 1024x700'];
    const lorry = VEHICLE_DEFS['animal-lorry'];
    const bed = VEHICLE_BED['animal-lorry'];
    const sprite = spriteOf('animal-lorry');

    // Nine bays do not fit her measured bed at the size the box allows —
    // the premise the slack exists to answer, asserted rather than
    // assumed.
    const fitScale = Math.min(box.w / sprite.w, box.h / sprite.h);
    const bare = (sprite.h * fitScale * bed.h - BED_PAD * 2 - BAY_GAP * 2) / 3;
    expect(bare).toBeLessThan(BAY_MIN);

    const fit = fitIn(box, lorry);
    expect(fit.overflows).toBe(false);
    expect(fit.slotH).toBeGreaterThanOrEqual(BAY_MIN);
    expect(fit.floor.h).toBeGreaterThan(fit.bed.h);
  });

  it('only grows past the box where the box cannot hold a tappable grid', () => {
    const phone = fitIn(COLUMNS['landscape phone 874x402'], VEHICLE_DEFS['pedal-trike']);
    expect(phone.overflows).toBe(true);
    expect(phone.slotH).toBeGreaterThanOrEqual(BAY_MIN);
  });

  it('gives a bigger grid smaller bays in the same vehicle', () => {
    const box = COLUMNS['desktop 1024x700'];
    const sprite = spriteOf('small-van');
    const bed = VEHICLE_BED['small-van'];
    const twoByTwo = fitLoadBed(box, sprite, bed, 2, 2);
    const threeByThree = fitLoadBed(box, sprite, bed, 3, 3);
    expect(threeByThree.slotW).toBeLessThan(twoByTwo.slotW);
  });

  it('never returns a zero or negative bay, however small the box', () => {
    const fit = fitLoadBed(
      { w: 40, h: 30 }, spriteOf('animal-lorry'), VEHICLE_BED['animal-lorry'], 3, 3,
    );
    expect(fit.slotW).toBeGreaterThan(0);
    expect(fit.slotH).toBeGreaterThan(0);
  });
});
