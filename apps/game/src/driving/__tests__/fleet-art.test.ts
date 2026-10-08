import { describe, it, expect } from 'vitest';
import { VEHICLE_DEFS, type VehicleType } from '@arc/game-logic';
import {
  BAY_GAP, BAY_MAX_RATIO, BAY_MIN, BED_PAD, BED_SLACK,
  VEHICLE_BED, VEHICLE_BED_SOURCE, VEHICLE_SPRITE, bedProbePoints, fitLoadBed,
} from '../fleet-art';

/**
 * How wide each vehicle's painted body actually is at the load area, as
 * fractions of its sprite — read off the same files `VEHICLE_BED` was
 * measured on.
 *
 * Here so a test can ask the question the bed numbers exist to answer:
 * does the cutaway floor stay on the vehicle? The slack is allowed to
 * spread the floor past the measured bed, and the only thing stopping
 * it spreading past the lorry is `BED_SLACK` being smaller than the
 * margin the paint has. That is a relationship between two numbers in
 * two different places, which is exactly the kind that rots quietly.
 */
const PAINTED_BODY: Record<VehicleType, { left: number; right: number }> = {
  'pedal-trike': { left: 0.08, right: 0.92 },
  'small-van': { left: 0.10, right: 0.90 },
  'long-van': { left: 0.164, right: 0.839 },
  'animal-lorry': { left: 0.081, right: 0.920 },
  'electric-minibus': { left: 0.14, right: 0.87 },
};

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

  it.each(ROOMY)('never draws a vehicle wider than its box at %s', (label) => {
    const box = COLUMNS[label];
    for (const v of EVERY_VEHICLE) {
      // Running off the bottom is a picture; running off the side is
      // the message panel.
      expect(fitIn(box, v).spriteW, `${v.name} drawn width`).toBeLessThanOrEqual(box.w + 0.5);
    }
  });

  it.each(ROOMY)('keeps every bay in frame at %s', (label) => {
    const box = COLUMNS[label];
    for (const v of EVERY_VEHICLE) {
      const fit = fitIn(box, v);
      // The vehicle is pinned to the top of its box when it overflows,
      // so the grid is measured from there. Three of the five are now
      // too long to fit whole and lose a bumper to the kerb (see
      // `fitLoadBed`), and Spark loses a strip of empty cutaway with
      // it. What may never be cut is a bay: half a bay is half a tap
      // target, on a screen whose whole job is tapping them.
      const top = fit.overflows ? 0 : (box.h - fit.spriteH) / 2;
      expect(top + fit.grid.y, `${v.name} first row`).toBeGreaterThanOrEqual(-0.5);
      expect(top + fit.grid.y + fit.gridH, `${v.name} last row`)
        .toBeLessThanOrEqual(box.h + 0.5);
    }
  });

  it.each(ROOMY)('keeps the cutaway and the crates on the painted vehicle at %s', (label) => {
    const box = COLUMNS[label];
    for (const v of EVERY_VEHICLE) {
      const fit = fitIn(box, v);
      const body = PAINTED_BODY[v.id];
      expect(fit.floor.x / fit.spriteW, `${v.name} floor left`)
        .toBeGreaterThanOrEqual(body.left - 0.001);
      expect((fit.floor.x + fit.floor.w) / fit.spriteW, `${v.name} floor right`)
        .toBeLessThanOrEqual(body.right + 0.001);
      // The grid is the one allowed past the bed, so it is the one
      // that can run off the vehicle. `BED_SLACK` is what stops it.
      expect(fit.grid.x / fit.spriteW, `${v.name} first column`)
        .toBeGreaterThanOrEqual(body.left - 0.001);
      expect((fit.grid.x + fit.gridW) / fit.spriteW, `${v.name} last column`)
        .toBeLessThanOrEqual(body.right + 0.001);
    }
  });

  it('never draws a bay much taller than it is wide', () => {
    for (const [, box] of Object.entries(COLUMNS)) {
      for (const v of EVERY_VEHICLE) {
        const fit = fitIn(box, v);
        expect(fit.slotH, `${v.name} bay height`)
          .toBeLessThanOrEqual(Math.max(BAY_MIN, fit.slotW * BAY_MAX_RATIO) + 0.5);
      }
    }
  });

  it('centres the grid on the bed, and the floor is the bed', () => {
    for (const [, box] of Object.entries(COLUMNS)) {
      for (const v of EVERY_VEHICLE) {
        const fit = fitIn(box, v);
        expect(fit.floor, `${v.name} floor`).toEqual(fit.bed);
        expect(fit.grid.x + fit.gridW / 2).toBeCloseTo(fit.bed.x + fit.bed.w / 2, 5);
        expect(fit.grid.y + fit.gridH / 2).toBeCloseTo(fit.bed.y + fit.bed.h / 2, 5);
      }
    }
  });

  it('never spreads the grid past the bed and its slack', () => {
    for (const [, box] of Object.entries(COLUMNS)) {
      for (const v of EVERY_VEHICLE) {
        const fit = fitIn(box, v);
        expect(fit.gridW, `${v.name} grid width`)
          .toBeLessThanOrEqual(fit.bed.w * BED_SLACK + 1);
        expect(fit.gridH, `${v.name} grid height`)
          .toBeLessThanOrEqual(fit.bed.h * BED_SLACK + 1);
      }
    }
  });

  it('spends the bed slack before it grows the vehicle', () => {
    const box = COLUMNS['desktop 1024x700'];
    const id = 'electric-minibus';
    const bed = VEHICLE_BED[id];
    const sprite = spriteOf(id);

    // Spark's bed is the narrowest in the fleet as a fraction of her
    // sprite, and two bays still do not fit across it at the size the
    // box allows — the premise the slack exists to answer, asserted
    // rather than assumed.
    const fitScale = Math.min(box.w / sprite.w, box.h / sprite.h);
    const bare = (sprite.w * fitScale * bed.w - BED_PAD * 2 - BAY_GAP) / 2;
    expect(bare).toBeLessThan(BAY_MIN);

    const fit = fitIn(box, VEHICLE_DEFS[id]);
    expect(fit.slotW).toBeGreaterThanOrEqual(BAY_MIN);
    expect(fit.gridW, 'the grid spread into the slack').toBeGreaterThan(fit.bed.w - BED_PAD * 2);
    // And having spent it she is still whole in the frame, which is
    // what the slack is for: it buys a tappable bay without the
    // vehicle having to grow out of the picture to supply one.
    expect(fit.overflows, 'Spark still fits').toBe(false);
  });

  it('keeps the whole fleet in frame now that none of them is three across', () => {
    // **What the 2026-10-09 reshape bought, as an assertion.** Three
    // bays across a bed two-and-a-half times longer than it is wide
    // forced the vehicle to be drawn big enough to supply the width,
    // and Bea ran 28px past the bottom of the tarmac at this viewport
    // while Spark ran 86 — 108 and 166 at the narrow one. Two columns
    // ask for less than the bed already has, so nothing is clipped.
    // This is the regression that would otherwise return silently the
    // next time a grid is widened.
    for (const label of ROOMY) {
      for (const v of EVERY_VEHICLE) {
        expect(fitIn(COLUMNS[label], v).overflows, `${v.name} at ${label}`).toBe(false);
      }
    }
  });

  it('grows the vehicle past the box rather than drop a bay below the tap floor', () => {
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
