import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { VEHICLES_BY_ROOM, VEHICLE_DEFS, type VehicleType } from '@arc/game-logic';

/**
 * Phaser, stubbed away — as `crate-loading-view.test.ts` does, and for
 * the same reason. Nothing here draws anything, but `car-park.ts` now
 * imports `ui/UIButton` for the arrows' plates, which imports Phaser,
 * and Phaser probes a canvas the moment it is loaded; jsdom has none, so
 * the probe throws before a single test runs. Added 2026-10-09 with the
 * arrows. The functions under test (`carParkBackdropH`, `arrowLayout`,
 * `vehicleParkTop`) are arithmetic and never touch it.
 */
vi.mock('phaser', () => ({ default: {} }));
import {
  BAY_GAP, BAY_LENGTH_M, BAY_MAX_RATIO, BAY_MIN, BAY_WIDTH_M, BED_PAD, BED_SLACK, LANE_WIDTH_M,
  VEHICLE_BED, VEHICLE_BED_SOURCE, VEHICLE_SPRITE, VEHICLE_VISIBLE_FRAC, VEHICLE_WIDTH_M,
  PICKER_CHIP_H, PICKER_CHIP_ROW, PICKER_EXIT_GROUND, PICKER_LABEL_H, PICKER_MIN_BAY, PICKER_MIN_HIT,
  PICKER_PAD_BOTTOM, PICKER_PAD_TOP, PICKER_SIDE_PAD,
  bayWidthM, bedProbePoints, fitLoadBed, fleetBySize, minScaleForBays, pickerLayout, vehicleLengthM,
  wholeVehicleHeight,
} from '../fleet-art';
import {
  ARROW_DIMMED_INK, ARROW_DIMMED_PAPER, ARROW_H, ARROW_W, PARK_CEILING,
  arrowLayout, carParkBackdropH, vehicleParkTop,
} from '../car-park';
import { MIN_TAP, SAFE_MARGIN } from '../../ui/constants';
import { contrastRatio } from '../../ui/contrast';

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
 * The car-park column the loading screen hands out, and the width the
 * vehicle herself may be drawn in it, read off the running screen in
 * Chrome at each viewport.
 *
 * **Re-measured 2026-10-09, twice, and both times the fixture was what
 * had gone stale.** The first set said 391 where the screen handed out
 * 287. This set replaces 335/527/145, which were measured on the car
 * park's own branch before the loading screen's floor band grew from
 * 104px to 142: the two branches merged, the band took 32 to 40px off
 * every column, and nothing re-measured. A fixture that describes a
 * layout the screen no longer has is a test that passes for the wrong
 * reason, which is what both of these were.
 *
 * **The landscape phone is a different shape now.** Below 599px of
 * viewport height the loading screen lays itself out in three columns
 * and gives the car park the whole height of the screen rather than a
 * share of it, so the phone's column is `SAFE_MARGIN` to `SAFE_MARGIN`
 * — 370px, not 145 — and the vehicle in it is drawn no wider than her
 * bays need (132) so the arrows have room either side. See
 * `loadingColumns` in `crate-loading-view.ts`.
 *
 * The box the vehicle is fitted to is that width by the column's height
 * less the ground she is owed fore and aft (`carParkBackdropH`), and
 * **no longer divided by anything**: it used to be divided by
 * `VEHICLE_VISIBLE_FRAC` (0.78), so she was sized for a box 28% taller
 * than the column and cut off at a kerb.
 */
const RAW_COLUMNS = {
  'tablet 1024x768': { x: 24, y: 97, w: 542, h: 437, vehicleW: 542 },
  'desktop 1024x700': { x: 24, y: 97, w: 542, h: 369, vehicleW: 542 },
  'narrow 820x620': { x: 24, y: 97, w: 424, h: 295, vehicleW: 424 },
  'landscape phone 874x402': { x: 24, y: 16, w: 360, h: 370, vehicleW: 132 },
};
/** The three laid out in the tall shape: two columns over a full-width floor. */
const ROOMY = ['tablet 1024x768', 'desktop 1024x700', 'narrow 820x620'] as const;
/** The viewport widths, for where the chrome stands. */
const WIDTH_OF: Record<keyof typeof RAW_COLUMNS, number> = {
  'tablet 1024x768': 1024,
  'desktop 1024x700': 1024,
  'narrow 820x620': 820,
  'landscape phone 874x402': 874,
};

type Viewport = keyof typeof RAW_COLUMNS;
const boxFor = (c: { w: number; h: number; vehicleW: number }) => ({
  w: c.vehicleW,
  h: (c.h - carParkBackdropH(c.h)) / VEHICLE_VISIBLE_FRAC,
});
const COLUMNS = Object.fromEntries(
  Object.entries(RAW_COLUMNS).map(([k, c]) => [k, boxFor(c)]),
) as Record<Viewport, { w: number; h: number }>;

/** Where the ground ends: the bottom of the column, above the tray. */
const GROUND_BOTTOM = Object.fromEntries(
  Object.entries(RAW_COLUMNS).map(([k, c]) => [k, c.y + c.h]),
) as Record<Viewport, number>;

/**
 * Where a vehicle of this fit actually stands, as a y on the screen.
 *
 * Not the top of the column: she is parked in the middle of it when she
 * has room and rises above it when she has not (`vehicleParkTop`).
 */
const parkTopFor = (label: Viewport, spriteH: number) =>
  vehicleParkTop(RAW_COLUMNS[label], spriteH);

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

  it.each(Object.keys(RAW_COLUMNS) as Viewport[])('keeps every bay in frame at %s', (label) => {
    const box = COLUMNS[label];
    for (const v of EVERY_VEHICLE) {
      const fit = fitIn(box, v);
      // Measured from where she is actually parked (`vehicleParkTop`), as
      // a y on the screen. What may never be cut is a bay: half a bay is
      // half a tap target, on a screen whose whole job is tapping them.
      // **This now holds on the landscape phone as well**, where the
      // vehicle is taller than the ground and used to spill its lower
      // bays over the tray: she rises above the column and her bays
      // stand on the tarmac, and it is only her front that runs off.
      const top = parkTopFor(label, fit.spriteH);
      expect(top + fit.grid.y, `${v.name} first row`).toBeGreaterThanOrEqual(0);
      expect(top + fit.grid.y + fit.gridH, `${v.name} last row`)
        .toBeLessThanOrEqual(GROUND_BOTTOM[label] + 0.5);
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
    // **Rewritten 2026-10-09, and the premise moved with it.** This used
    // to be measured at 820x620 against `COLUMNS['narrow 820x620']`, where
    // the box was 374px tall - the visible 292px divided by
    // `VEHICLE_VISIBLE_FRAC` (0.78) - and Spark "still fit" in it. She
    // fit a box that was 28% taller than the screen: the kerb cut her
    // nose off, which is the fault Marcus saw and the reason that
    // fraction is now 1. Against the box the column really offers (308)
    // she cannot fit at 820x620 at all: see the test below. So the
    // premise "the slack lets her fit at 820x620" was never true of the
    // screen, only of the fixture.
    //
    // What the premise was *for* is the behaviour, and that does not
    // depend on a screen: there is a window of vehicle heights in which
    // the bare bays are under the floor and the floor spread into the
    // bed's slack is not, and inside it the slack must be spent before
    // the vehicle grows. For Spark that window is 361px to 490px. 420 is
    // inside it, so this asserts the behaviour against a box chosen for
    // the purpose, with the premise asserted rather than assumed.
    const box = { w: 532, h: 420 };
    const id = 'electric-minibus';
    const bed = VEHICLE_BED[id];
    const sprite = spriteOf(id);

    const fitScale = Math.min(box.w / sprite.w, box.h / sprite.h);
    const bare = (sprite.w * fitScale * bed.w - BED_PAD * 2 - BAY_GAP) / 2;
    expect(bare).toBeLessThan(BAY_MIN);

    const fit = fitIn(box, VEHICLE_DEFS[id]);
    expect(fit.slotW).toBeGreaterThanOrEqual(BAY_MIN);
    expect(fit.gridW, 'the grid spread into the slack').toBeGreaterThan(fit.bed.w - BED_PAD * 2);
    // And having spent it she is still whole in the box, which is what
    // the slack is for: it buys a tappable bay without the vehicle having
    // to grow out of the picture to supply one.
    expect(fit.overflows, 'Spark still fits').toBe(false);
    expect(fit.spriteH).toBeCloseTo(box.h, 5);
  });

  it('spends the slack at 1024x768 too, where it is exactly enough', () => {
    // The same behaviour on a real screen. **It used to be asserted at
    // 1024x700 and that viewport has stopped being the case**, because
    // the loading screen's floor band grew from 104px to 142: the
    // desktop column fell from 527 to 369 and Spark now needs 22px more
    // than the slack can buy her there, so she grows and her rear
    // rises. The iPad's 1024x768 is where the slack is now exactly
    // enough - her box is 403px, her bare bays come out at 38.7px, two
    // under the floor, and the slack is what saves her from growing.
    const box = COLUMNS['tablet 1024x768'];
    const id = 'electric-minibus';
    const bed = VEHICLE_BED[id];
    const sprite = spriteOf(id);
    const fitScale = Math.min(box.w / sprite.w, box.h / sprite.h);
    expect((sprite.w * fitScale * bed.w - BED_PAD * 2 - BAY_GAP) / 2).toBeLessThan(BAY_MIN);
    const fit = fitIn(box, VEHICLE_DEFS[id]);
    expect(fit.slotW).toBeGreaterThanOrEqual(BAY_MIN);
    expect(fit.overflows).toBe(false);
  });

  it.each(ROOMY)('stands every vehicle whole on the ground at %s', (label) => {
    // **Rewritten 2026-10-09, twice.** It first said "whole, bar Spark at
    // 820x620", a known exception recorded so that it could not hide. Marcus
    // then decided the exception was to be paid for and not accepted: the
    // 40px tap floor does not move, so Spark gets the ground her bays
    // need. The layout still hands the car park a 335px column at 820x620,
    // so the ground is taller than the column - she is parked with her
    // margin of tarmac in front of her and her rear rises above the top of
    // the column (`vehicleParkTop`, `PARK_CEILING`). Nothing is listed as
    // an exception any more, and a vehicle that does not fit is a failure.
    //
    // `wholeVehicleHeight` is how tall a vehicle must be drawn for its bays
    // to be tappable and does not depend on the screen. She is whole when
    // it, and the ground she is owed in front of her, fit between the
    // ceiling and the bottom of the ground.
    const bottom = GROUND_BOTTOM[label];
    const margin = carParkBackdropH(RAW_COLUMNS[label].h) / 2;
    for (const v of EVERY_VEHICLE) {
      const fit = fitIn(COLUMNS[label], v);
      const top = parkTopFor(label, fit.spriteH);
      expect(top + fit.spriteH, `${v.name} nose at ${label}`).toBeLessThanOrEqual(bottom + 0.5);
      expect(top, `${v.name} rear at ${label}`).toBeGreaterThanOrEqual(PARK_CEILING);
      expect(
        PARK_CEILING + wholeVehicleHeight(v.id, v.cols, v.rows) + margin,
        `${v.name} fits between the ceiling and the ground at ${label}`,
      ).toBeLessThanOrEqual(bottom + 0.5);
    }
  });

  it('keeps the ground in front of every vehicle that she is owed', () => {
    // Whole is not enough if her bumper is touching the edge of the
    // picture, which reads as cropped whatever the pixels say. Bea at
    // 820x620 used to stand with five pixels of tarmac in front of her
    // instead of thirteen; she now has the thirteen, and so has Spark.
    for (const label of ROOMY) {
      const margin = carParkBackdropH(RAW_COLUMNS[label].h) / 2;
      for (const v of EVERY_VEHICLE) {
        const fit = fitIn(COLUMNS[label], v);
        const top = parkTopFor(label, fit.spriteH);
        expect(GROUND_BOTTOM[label] - (top + fit.spriteH), `${v.name} nose at ${label}`)
          .toBeGreaterThanOrEqual(margin - 1.01);
      }
    }
  });

  it('moves only the vehicles whose room ran out, and by how much', () => {
    // **Re-derived 2026-10-09 against the column the screen really
    // hands out.** It used to say two vehicles move at 820x620 and
    // three stand centred; that was measured against a 335px column,
    // and the merge that brought the loading screen's floor band up to
    // 142px left 295. In 295 only Henry fits centred with his margin.
    // The others are the arithmetic of a shorter column, not a change
    // of rule: a vehicle whose own height plus her ground will not fit
    // in the middle of the column keeps the ground in front of her and
    // rises, and the rest stand exactly where they stood.
    //
    // Recorded with the distances, because they are the measure of how
    // much work the rising rear is doing: if the layout ever frees the
    // height, these fall to nothing and the rise can go.
    const label = 'narrow 820x620';
    const column = RAW_COLUMNS[label];
    const risen: Record<string, number> = {};
    for (const v of EVERY_VEHICLE) {
      const fit = fitIn(COLUMNS[label], v);
      const centred = column.y + (column.h - fit.spriteH) / 2;
      const moved = centred - parkTopFor(label, fit.spriteH);
      if (moved > 1.01) risen[v.id] = Math.round(moved);
    }
    expect(risen).toEqual({
      'pedal-trike': 1,
      'animal-lorry': 18,
      'long-van': 26,
      'electric-minibus': 45,
    });
  });

  it('needs the rising rear at three of the four viewports, and says which', () => {
    // **The answer to "is the rise still doing anything".** It is: only
    // the iPad's column is tall enough to stand every vehicle centred
    // with her ground. Spark rises at 1024x700 and at 874x402 as well
    // as at 820x620, where three others join her. Recorded as one table
    // so that a layout change which frees the height shows up here as
    // the number that can go, rather than being discovered by eye.
    const rising = Object.fromEntries(
      (Object.keys(RAW_COLUMNS) as Viewport[]).map((label) => {
        const column = RAW_COLUMNS[label];
        const who = EVERY_VEHICLE.filter((v) => {
          const fit = fitIn(COLUMNS[label], v);
          const centred = column.y + (column.h - fit.spriteH) / 2;
          // Two pixels, not one: Trikey comes out 1.15px off centre at
          // 820x620 because her grown height lands a hair over the box
          // she was fitted to, and a pixel of rounding is not a rise.
          // The distances themselves are in the test above.
          return centred - parkTopFor(label, fit.spriteH) > 2;
        }).map((v) => v.id).sort();
        return [label, who];
      }),
    );
    expect(rising).toEqual({
      'tablet 1024x768': [],
      'desktop 1024x700': ['electric-minibus'],
      'narrow 820x620': ['animal-lorry', 'electric-minibus', 'long-van'],
      'landscape phone 874x402': ['electric-minibus'],
    });
  });

  it('stands every vehicle whole on a landscape phone as well, now the column is the screen', () => {
    // **Rewritten 2026-10-09, and the premise is the one that changed.**
    // It used to say the landscape phone was the one screen where
    // "nothing is cropped" could not hold: the column was 145px and
    // every vehicle needed 255 to 361, so the bays were whole and the
    // front of the vehicle ran off. Marcus chose a short-viewport
    // layout over a crop, and the loading screen now lays itself out in
    // three columns below 599px of height and gives the car park
    // `SAFE_MARGIN` to `SAFE_MARGIN` - 370px at 402 - with the animals
    // beside the vehicle rather than under her. Every vehicle stands
    // whole in that, Spark by nine pixels. See `loadingColumns`.
    const label = 'landscape phone 874x402';
    const bottom = GROUND_BOTTOM[label];
    for (const v of EVERY_VEHICLE) {
      const fit = fitIn(COLUMNS[label], v);
      const top = parkTopFor(label, fit.spriteH);
      expect(top, `${v.name} rear`).toBeGreaterThanOrEqual(PARK_CEILING);
      expect(top + fit.spriteH, `${v.name} nose`).toBeLessThanOrEqual(bottom + 0.5);
      expect(fit.slotW, `${v.name} bay`).toBeGreaterThanOrEqual(BAY_MIN);
      expect(fit.slotH, `${v.name} bay`).toBeGreaterThanOrEqual(BAY_MIN);
    }
  });

  it('keeps the risen rear clear of the Back button and the title', () => {
    // The assumption the rising rear stands on, held here because nothing
    // else will notice if it stops being true. Where a vehicle rises above
    // the top of the column it stands in the band beside two pieces of
    // chrome: Back, on the left, and the title plate, centred, which the
    // loading view draws on top. Measured at 820x620 the plate is 240px
    // wide (290 to 530); 125 either side of the middle is allowed here. The
    // painted body is the part that matters - the wing mirrors are at the
    // front, which is down in the column and nowhere near the plate.
    const BACK_RIGHT = SAFE_MARGIN + 88 + 8;
    const TITLE_HALF = 125;
    for (const label of Object.keys(RAW_COLUMNS) as Viewport[]) {
      const column = RAW_COLUMNS[label];
      for (const v of EVERY_VEHICLE) {
        const fit = fitIn(COLUMNS[label], v);
        const top = parkTopFor(label, fit.spriteH);
        if (top >= column.y) continue;
        const body = PAINTED_BODY[v.id];
        const left = column.x + column.w / 2 - fit.spriteW / 2;
        const bodyLeft = left + body.left * fit.spriteW;
        const bodyRight = left + body.right * fit.spriteW;
        expect(bodyLeft, `${v.name} clear of Back at ${label}`).toBeGreaterThan(BACK_RIGHT);
        expect(bodyRight, `${v.name} clear of the title at ${label}`)
          .toBeLessThan(WIDTH_OF[label] / 2 - TITLE_HALF);
      }
    }
  });

  it('grows the vehicle past the box rather than drop a bay below the tap floor', () => {
    // Spark on the landscape phone: her box is 340px once the ground
    // she is owed is taken off the 370px column, she needs 361, and
    // what gives is the ground and not the bay. She still stands whole
    // in the column - the test above - because the margin she gives up
    // is exactly what she grows into.
    const phone = fitIn(COLUMNS['landscape phone 874x402'], VEHICLE_DEFS['electric-minibus']);
    expect(phone.overflows).toBe(true);
    expect(phone.slotW).toBeGreaterThanOrEqual(BAY_MIN);
    expect(phone.slotH).toBeGreaterThanOrEqual(BAY_MIN);
  });

  it('gives a bigger grid smaller bays in the same vehicle', () => {
    // At the iPad's column, where Henry's bays are above the floor and
    // so have room to differ. At 1024x700 both grids come back at
    // exactly `BAY_MIN`, which says nothing about the rule.
    const box = COLUMNS['tablet 1024x768'];
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

describe('the fleet at real size', () => {
  /**
   * What the proportion pass of 2026-10-08 recorded each vehicle as —
   * `.claude/HANDOVER.md`, "One true scale". Here rather than imported
   * because it is the external fact `VEHICLE_WIDTH_M` and the sprites
   * are both answerable to, and a copy either of them drifts from is
   * the point of having it.
   */
  const REAL: Partial<Record<VehicleType, { w: number; l: number }>> = {
    'small-van': { w: 1.75, l: 4.2 },
    'long-van': { w: 1.8, l: 4.5 },
    'electric-minibus': { w: 2.0, l: 5.9 },
    'animal-lorry': { w: 2.3, l: 6.5 },
  };

  it('has a width in metres for every vehicle, matching the proportion pass', () => {
    for (const v of EVERY_VEHICLE) {
      expect(VEHICLE_WIDTH_M[v.id], `${v.name} width`).toBeGreaterThan(0);
      const real = REAL[v.id];
      if (real) expect(VEHICLE_WIDTH_M[v.id], `${v.name} width`).toBeCloseTo(real.w, 2);
    }
  });

  it('gets each vehicle its real length free, from the sprite it was repainted to', () => {
    // The whole reason lengths are not written down: every file now
    // carries its vehicle's true aspect, so the width is the only fact
    // that has to be stated. Within 5% of the handover's table.
    for (const v of EVERY_VEHICLE) {
      const real = REAL[v.id];
      if (!real) continue;
      const sprite = spriteOf(v.id);
      const length = VEHICLE_WIDTH_M[v.id] * (sprite.h / sprite.w);
      expect(length, `${v.name} length`).toBeGreaterThan(real.l * 0.95);
      expect(length, `${v.name} length`).toBeLessThan(real.l * 1.05);
    }
  });

  it('paints Henry the UK standard bay and everyone else their own', () => {
    expect(bayWidthM('small-van')).toBeCloseTo(BAY_WIDTH_M, 5);
    for (const v of EVERY_VEHICLE) {
      const clear = bayWidthM(v.id) - VEHICLE_WIDTH_M[v.id];
      expect(clear, `${v.name} clearance`).toBeCloseTo(BAY_WIDTH_M - VEHICLE_WIDTH_M['small-van'], 5);
    }
    // Sized to the vehicle, which is what the picker's forecourt
    // always claimed to do: a trike's space is not a lorry's.
    expect(bayWidthM('pedal-trike')).toBeLessThan(bayWidthM('animal-lorry'));
  });

  it('cannot fit a traffic lane in front of the chosen vehicle, which is why there is no road', () => {
    // The arithmetic that took the exit road off this screen, as an
    // assertion rather than a comment.
    //
    // **Restated 2026-10-09.** It used to say one lane is wider than the
    // whole band of car park the vehicle stands in. That was true while
    // the vehicle was drawn 28% too large for its column and cut off at
    // a kerb: Henry was 267px wide, 152px to the metre, and a lane was
    // 502px against a 484px band. Drawn whole he is 208px wide and 119px
    // to the metre, a lane is 392px, and a lane now *fits* inside the
    // column on its own. The conclusion stands in the form that was
    // always the real one: the vehicle and one lane in front of her are
    // taller than the column, so a road cannot share the picture with a
    // vehicle standing whole in it.
    //
    // **The second half of this went with the column, 2026-10-09.** It
    // also claimed two lanes were taller than the viewport, which held
    // while Henry was drawn 208px wide; against the 369px column he is
    // 145 and a carriageway is 548px against 700. The conclusion does
    // not rest on it, and a claim that has stopped being true is worse
    // than no claim, so it is gone rather than re-tuned.
    const fit = fitIn(COLUMNS['desktop 1024x700'], VEHICLE_DEFS['small-van']);
    const pxPerMetre = fit.spriteW / VEHICLE_WIDTH_M['small-van'];
    expect(fit.spriteH + LANE_WIDTH_M * pxPerMetre).toBeGreaterThan(RAW_COLUMNS['desktop 1024x700'].h);
  });

  it('cannot paint the far end of the bay either, for the same reason', () => {
    // A UK bay is 4.8m deep and the column the car park has at the
    // desktop viewport is about 4.4m of it at the scale Henry is drawn,
    // so the bay runs off the bottom of the frame with the vehicle
    // standing in it. That is why what is painted is the two side lines
    // and the head, and never a near end: a bay closed at a line the
    // van is sticking out of would read as a van parked badly.
    const fit = fitIn(COLUMNS['desktop 1024x700'], VEHICLE_DEFS['small-van']);
    const pxPerMetre = fit.spriteW / VEHICLE_WIDTH_M['small-van'];
    expect(BAY_LENGTH_M * pxPerMetre).toBeGreaterThan(RAW_COLUMNS['desktop 1024x700'].h);
  });

  it('keeps the whole vehicle on screen: the fraction is one', () => {
    // It was 0.78, and the last 22% of every vehicle ran under a kerb and
    // was cut off. Marcus, 9 October 2026: nothing is shown cropped
    // (`docs/manus-sprite-rules.md`, Rule 8). Anyone who wants the
    // backdrop back by trading a bumper for it fails here, and has to
    // argue with the rule rather than with a number.
    expect(VEHICLE_VISIBLE_FRAC).toBe(1);
  });

  it('keeps ground round the vehicle at every size the screen is composed for', () => {
    // **The phone has ground now too, and that is the short layout.**
    // This used to assert the opposite — that a 145px column was
    // shorter than one van, so every pixel went to the vehicle and none
    // to a margin. The landscape phone's column is 370px today, which
    // is a 30px margin and a vehicle standing whole inside it.
    for (const label of Object.keys(RAW_COLUMNS) as Viewport[]) {
      expect(carParkBackdropH(RAW_COLUMNS[label].h), label).toBeGreaterThan(0);
    }
    // And it is still nothing at all where a column really is shorter
    // than a van, which is the rule the 145px case was an instance of.
    expect(carParkBackdropH(145)).toBe(0);
  });

  it('takes the ground from the vehicle and never from a bay\'s tap floor', () => {
    // What the margin round the vehicle costs, asked of the same column
    // with and without it.
    //
    // **Re-pointed 2026-10-09, and the claim is narrower than it was.**
    // It used to compare against a fixed 524x471 — the box the screen
    // handed out two layouts ago — and say the bays came out "within a
    // pixel". Against the real columns that is only true where the bays
    // are already at the floor and cannot shrink: on the iPad, where
    // Henry's bays have room above it, 34px of ground costs him five
    // pixels of bay. What holds everywhere, and is what the margin is
    // answerable to, is that it never pushes a bay under the tap floor.
    for (const label of ROOMY) {
      const raw = RAW_COLUMNS[label];
      const withGround = fitIn(COLUMNS[label], VEHICLE_DEFS['small-van']);
      const bare = fitIn({ w: raw.vehicleW, h: raw.h }, VEHICLE_DEFS['small-van']);
      expect(withGround.slotW, `${label} bay width`).toBeGreaterThanOrEqual(BAY_MIN);
      expect(withGround.slotH, `${label} bay height`).toBeGreaterThanOrEqual(BAY_MIN);
      expect(bare.slotW - withGround.slotW, `${label} bay width cost`).toBeLessThanOrEqual(5);
      expect(bare.slotH - withGround.slotH, `${label} bay height cost`).toBeLessThanOrEqual(7);
    }
  });
});

describe('how tall a vehicle must be to stand whole', () => {
  it('is the height fitLoadBed grows an under-boxed vehicle to', () => {
    // One formula in two places is how they come to disagree. A box that
    // is wide and one pixel tall forces the growth, and what comes back
    // is `wholeVehicleHeight`.
    for (const v of EVERY_VEHICLE) {
      const fit = fitLoadBed({ w: 100000, h: 1 }, spriteOf(v.id), VEHICLE_BED[v.id], v.cols, v.rows);
      expect(fit.spriteH, v.name).toBeCloseTo(wholeVehicleHeight(v.id, v.cols, v.rows), 3);
      expect(fit.slotW, v.name).toBeGreaterThanOrEqual(BAY_MIN);
      expect(fit.slotH, v.name).toBeGreaterThanOrEqual(BAY_MIN);
    }
  });

  it('is what each vehicle needs, to the pixel, so a layout can be asked for it', () => {
    // Recorded so the number in the notes file is a number a test holds.
    // Trikey 1x2: 273. Henry 2x2: 255. Bea 2x3: 323. Big Tilly 2x4: 308.
    // Spark 2x3: 361 - the tallest, and the one 820x620 cannot hold. Bea
    // is the other one to watch: 323 stands in the 334px column with five
    // pixels of ground fore and aft instead of the thirteen she is owed.
    const tall = Object.fromEntries(
      EVERY_VEHICLE.map((v) => [v.id, Math.round(wholeVehicleHeight(v.id, v.cols, v.rows))]),
    );
    expect(tall).toEqual({
      'pedal-trike': 273,
      'small-van': 255,
      'long-van': 323,
      'animal-lorry': 308,
      'electric-minibus': 361,
    });
  });

  it('has a smallest scale that grows with the grid', () => {
    const sprite = spriteOf('small-van');
    const bed = VEHICLE_BED['small-van'];
    expect(minScaleForBays(sprite, bed, 2, 4)).toBeGreaterThan(minScaleForBays(sprite, bed, 2, 2));
  });
});

describe('where the car park puts the vehicle', () => {
  const column = { x: 24, y: 100, w: 424, h: 334 };
  // Thirteen pixels of tarmac in front of her, from a 334px column.
  const margin = carParkBackdropH(334) / 2;

  it('stands her in the middle of the ground when she has room', () => {
    expect(vehicleParkTop(column, 300)).toBe(100 + 17);
    // A vehicle fitted to the box the layout hands out comes back within
    // a pixel of it, and 12.9px of tarmac is not a reason to move her.
    expect(vehicleParkTop(column, 334 - 2 * margin + 0.5)).toBeCloseTo(100 + margin - 0.25, 5);
  });

  it('keeps the tarmac in front of her and lets her rear rise when she does not', () => {
    // **Rewritten 2026-10-09.** She used to be pinned to the top of the
    // column when she did not fit, so it was the front of her that ran
    // off. The 40px tap floor does not move, so the ground does: her
    // nose keeps its margin and the rear rises above the column.
    expect(vehicleParkTop(column, 334)).toBe(100 + 334 - margin - 334);
    expect(vehicleParkTop(column, 361)).toBe(100 + 334 - margin - 361);
    // Rising, so above the top of the column in both cases.
    expect(vehicleParkTop(column, 361)).toBeLessThan(column.y);
  });

  it('never lets her rear rise past the ceiling', () => {
    // Spark's 361px at 820x620 rises to 60 in this column; a column low
    // enough that she would have to go off the top of the screen stands
    // her at the ceiling and lets the front run off.
    expect(vehicleParkTop({ x: 24, y: 93, w: 455, h: 145 }, 361)).toBe(PARK_CEILING);
    expect(PARK_CEILING).toBe(SAFE_MARGIN);
  });

  it('leaves a margin of ground when there is no painting to measure', () => {
    expect(vehicleParkTop(column, undefined)).toBe(100 + carParkBackdropH(334) / 2);
  });

  it('asks for more ground in a taller column, within bounds', () => {
    expect(carParkBackdropH(334)).toBe(2 * 13);
    expect(carParkBackdropH(526)).toBe(2 * 20);
    expect(carParkBackdropH(210)).toBe(2 * 8);
    expect(carParkBackdropH(209)).toBe(0);
  });
});

describe('the arrows', () => {
  /** The vehicle's rectangle as the car park draws it, for each fleet vehicle. */
  const vehicleRect = (label: Viewport, id: VehicleType) => {
    const v = VEHICLE_DEFS[id];
    const raw = RAW_COLUMNS[label];
    const fit = fitIn(COLUMNS[label], v);
    const column = { ...raw };
    return {
      column,
      vehicle: {
        x: column.x + column.w / 2 - fit.spriteW / 2,
        y: vehicleParkTop(column, fit.spriteH),
        w: fit.spriteW,
        h: fit.spriteH,
      },
    };
  };

  it.each(ROOMY)('are inside the column and clear of the vehicle at %s', (label) => {
    for (const v of EVERY_VEHICLE) {
      const { column, vehicle } = vehicleRect(label, v.id);
      const { fewer, more } = arrowLayout(column, vehicle);
      // Inside the column: the reading panel is the next thing along, and
      // a control over it would take its taps.
      expect(fewer.x, `${v.name} left arrow`).toBeGreaterThanOrEqual(column.x - 0.5);
      expect(more.x + more.w, `${v.name} right arrow`).toBeLessThanOrEqual(column.x + column.w + 0.5);
      // Clear of the vehicle, on the correct side of her.
      expect(fewer.x + fewer.w, `${v.name} left arrow`).toBeLessThanOrEqual(vehicle.x);
      expect(more.x, `${v.name} right arrow`).toBeGreaterThanOrEqual(vehicle.x + vehicle.w);
      // And inside the column vertically.
      for (const a of [fewer, more]) {
        expect(a.y, v.name).toBeGreaterThanOrEqual(column.y);
        expect(a.y + a.h, v.name).toBeLessThanOrEqual(column.y + column.h);
      }
    }
  });

  it('are still inside the column on a landscape phone, where nothing else fits', () => {
    for (const v of EVERY_VEHICLE) {
      const { column, vehicle } = vehicleRect('landscape phone 874x402', v.id);
      const { fewer, more } = arrowLayout(column, vehicle);
      expect(fewer.x, v.name).toBeGreaterThanOrEqual(column.x - 0.5);
      expect(more.x + more.w, v.name).toBeLessThanOrEqual(column.x + column.w + 0.5);
      for (const a of [fewer, more]) {
        expect(a.y, v.name).toBeGreaterThanOrEqual(column.y - 0.5);
        expect(a.y + a.h, v.name).toBeLessThanOrEqual(column.y + column.h + 0.5);
      }
    }
  });

  it('are level with each other and generous to hit', () => {
    const { column, vehicle } = vehicleRect('desktop 1024x700', 'small-van');
    const { fewer, more } = arrowLayout(column, vehicle);
    expect(fewer.y).toBe(more.y);
    // More than twice the tap floor each way: Marcus asked for generous.
    for (const a of [fewer, more]) {
      expect(a.w).toBeGreaterThanOrEqual(MIN_TAP * 2);
      expect(a.h).toBeGreaterThanOrEqual(MIN_TAP * 2);
    }
    expect(ARROW_W).toBeGreaterThanOrEqual(MIN_TAP * 2);
    expect(ARROW_H).toBeGreaterThanOrEqual(MIN_TAP * 2);
  });

  it('stay inside the column even where the column is too narrow for both promises', () => {
    // A column barely wider than the vehicle: the arrow keeps to the
    // column and overlaps her paint, because a control that has gone
    // missing cannot be used at all.
    const column = { x: 24, y: 100, w: 200, h: 334 };
    const vehicle = { x: 24 + 40, y: 110, w: 120, h: 300 };
    const { fewer, more } = arrowLayout(column, vehicle);
    expect(fewer.x).toBeGreaterThanOrEqual(16);
    expect(more.x + more.w).toBeLessThanOrEqual(column.x + column.w + 0.5);
  });

  it('keeps a dimmed arrow readable: its ink clears 4.5:1 on its paper', () => {
    const ink = Number.parseInt(ARROW_DIMMED_INK.replace('#', ''), 16);
    expect(contrastRatio(ink, ARROW_DIMMED_PAPER)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the picker', () => {
  /**
   * The forecourt picker is the only place the fleet stands side by side.
   * It used to fit every sprite to one height (108px at 820x620, a 1.75m
   * trike exactly as tall as a 6.5m lorry), which is the fixed-cell
   * thumbnail the handover warns against: it normalises the vehicles and
   * discards the comparison. These hold it to true relative scale.
   */
  const IDS = EVERY_VEHICLE.map((v) => v.id);
  const CONTENT_TOP = 93;
  const SIZES: Array<[number, number]> = [[820, 620], [1024, 700], [874, 402], [1024, 768]];
  const layoutAt = (w: number, h: number) =>
    pickerLayout({ width: w, height: h, contentTop: CONTENT_TOP, ids: IDS });
  /** Shortest to longest, which is also smallest to largest. */
  const BY_SIZE: VehicleType[] = ['pedal-trike', 'small-van', 'long-van', 'electric-minibus', 'animal-lorry'];

  it.each(SIZES)('draws all five at one scale, driven by their width in metres, at %ix%i', (w, h) => {
    const layout = layoutAt(w, h);
    for (const bay of layout.bays) {
      expect(bay.spriteW / VEHICLE_WIDTH_M[bay.id], `${bay.id} width`).toBeCloseTo(layout.pxPerMetre, 6);
      expect(bay.spriteH / vehicleLengthM(bay.id), `${bay.id} length`).toBeCloseTo(layout.pxPerMetre, 6);
    }
  });

  it.each(SIZES)('parks them smallest to largest, left to right, at %ix%i', (w, h) => {
    // **A size comparison that is not in size order is half a
    // comparison.** The bays followed `VEHICLE_DEFS`, which puts Big Tilly
    // fourth and Spark fifth, so the line stepped up, up, up, down — which
    // showed nowhere while every sprite was thumbnailed to one height, and
    // showed the moment they were drawn to length.
    const bays = layoutAt(w, h).bays;
    expect(bays.map((b) => b.id)).toEqual(BY_SIZE);
    for (let i = 1; i < bays.length; i += 1) {
      expect(bays[i].x, `${bays[i].id} stands right of ${bays[i - 1].id}`)
        .toBeGreaterThan(bays[i - 1].x);
      expect(bays[i].spriteH, `${bays[i].id} longer than ${bays[i - 1].id}`)
        .toBeGreaterThan(bays[i - 1].spriteH);
    }
    // Whatever order it is handed, which is what stops a new vehicle in
    // `VEHICLE_DEFS` landing in the middle of the row.
    const shuffled = pickerLayout({
      width: w, height: h, contentTop: CONTENT_TOP, ids: [...IDS].reverse(),
    });
    expect(shuffled.bays.map((b) => b.id)).toEqual(BY_SIZE);
  });

  it('parks them in the order the vehicle-change arrows walk', () => {
    // The picker sorts by drawn size and the arrows by capacity, with
    // unlock level breaking Bea and Spark's tie at six spaces each
    // (`VEHICLES_BY_ROOM`). A bigger vehicle holds more, so the two agree,
    // and a child who learns the fleet's order on one screen keeps it on
    // the other. They are derived separately — one from the art, one from
    // the rules — so this is what says the day they stop agreeing.
    expect(fleetBySize(IDS)).toEqual([...VEHICLES_BY_ROOM]);
    expect(layoutAt(820, 620).bays.map((b) => b.id)).toEqual([...VEHICLES_BY_ROOM]);
    // Non-decreasing capacity, which is the reason they agree.
    const slots = VEHICLES_BY_ROOM.map((id) => VEHICLE_DEFS[id].slots);
    expect(slots).toEqual([...slots].sort((a, b) => a - b));
  });

  it.each(SIZES)('is not a fixed cell: Trikey is smallest and Big Tilly largest, in both ways, at %ix%i', (w, h) => {
    const bays = Object.fromEntries(layoutAt(w, h).bays.map((b) => [b.id, b])) as
      Record<VehicleType, ReturnType<typeof layoutAt>['bays'][number]>;
    for (let i = 1; i < BY_SIZE.length; i += 1) {
      const smaller = bays[BY_SIZE[i - 1]];
      const larger = bays[BY_SIZE[i]];
      expect(larger.spriteW, `${larger.id} wider than ${smaller.id}`).toBeGreaterThan(smaller.spriteW);
      // A few pixels at least: two vehicles the same height is the bug.
      expect(larger.spriteH, `${larger.id} longer than ${smaller.id}`).toBeGreaterThan(smaller.spriteH + 3);
    }
    // And by the right amount: a 6.5m lorry is about 3.7 trikes long.
    const ratio = bays['animal-lorry'].spriteH / bays['pedal-trike'].spriteH;
    expect(ratio).toBeCloseTo(vehicleLengthM('animal-lorry') / vehicleLengthM('pedal-trike'), 6);
    expect(ratio).toBeGreaterThan(3.5);
  });

  it.each(SIZES)('stands every vehicle whole, in its own bay, on the tarmac, at %ix%i', (w, h) => {
    const layout = layoutAt(w, h);
    const { apron } = layout;
    // Whole: from the rear, against the head line, to a nose that stops
    // above the row the unlock chip and the name take.
    const noseLimit = layout.chipY - PICKER_CHIP_H / 2;
    let edge = layout.bays[0].x;
    for (const bay of layout.bays) {
      expect(bay.rearY, `${bay.id} rear`).toBeGreaterThanOrEqual(apron.y);
      expect(bay.rearY + bay.spriteH, `${bay.id} nose`).toBeLessThanOrEqual(noseLimit + 0.5);
      expect(bay.cx - bay.spriteW / 2, `${bay.id} left`).toBeGreaterThanOrEqual(bay.x);
      expect(bay.cx + bay.spriteW / 2, `${bay.id} right`).toBeLessThanOrEqual(bay.x + bay.w);
      // The bays are side by side with nothing between them.
      expect(bay.x, `${bay.id} bay`).toBeCloseTo(edge, 6);
      edge += bay.w;
    }
    // On the screen, with the tarmac round the bays.
    expect(apron.x).toBeGreaterThanOrEqual(0);
    expect(apron.x + apron.w).toBeLessThanOrEqual(w);
    expect(layout.bays[0].x - apron.x).toBeCloseTo(PICKER_SIDE_PAD, 6);
  });

  it.each(SIZES)('gives the longest vehicle all the room there is, at %ix%i', (w, h) => {
    // The scale is the biggest at which the longest vehicle stands whole,
    // so her nose is at the limit and nobody is drawn smaller than they
    // need to be.
    const layout = layoutAt(w, h);
    const lorry = layout.bays.find((b) => b.id === 'animal-lorry')!;
    // Her nose stops a few pixels of air short of the chip row, and no
    // further: the 6 is the row's own padding (`PICKER_CHIP_ROW` less the
    // chip it holds), not slack.
    const gap = layout.chipY - PICKER_CHIP_H / 2 - (lorry.rearY + lorry.spriteH);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(PICKER_CHIP_ROW - PICKER_CHIP_H);
  });

  it.each(SIZES)('ends the band where the fleet ends, not at a share of the screen, at %ix%i', (w, h) => {
    // **The fault the building's removal exposed, and the fix.** The scale
    // answers to two limits — the band's height and five bays' width — and
    // with the band 90% taller the tighter one at 1024x768 became the
    // width: 76.8px to the metre against the 78.6 the height would allow.
    // The height the width would not let the vehicles spend used to sit as
    // dead ground under their noses, because the chip row and the names
    // hung off the bottom of a band sized as a share of the screen: the
    // lorry stopped 14.3px short of a row the arithmetic says she reaches.
    //
    // So the band is the fleet's extent — padding, the longest vehicle as
    // drawn, and the two rows — whichever limit binds.
    const layout = layoutAt(w, h);
    const longest = Math.max(...layout.bays.map((b) => b.spriteH));
    const rows = PICKER_PAD_TOP + PICKER_CHIP_ROW + PICKER_LABEL_H + PICKER_PAD_BOTTOM;
    expect(layout.apron.h).toBeCloseTo(longest + rows, 0);
    // And the car park ends on ground rather than at the frame: there is
    // gravel below the tarmac for the cone at the mouth of a locked bay to
    // stand on (it is 34px tall, 4px below the near edge) and for the
    // chosen vehicle to drive across on her way out.
    expect(h - (layout.apron.y + layout.apron.h)).toBeGreaterThanOrEqual(PICKER_EXIT_GROUND - 1);
    expect(layout.coneY + 17).toBeLessThan(h);
  });

  it.each([[820, 620], [1024, 768]])('is capped by the width at %ix%i, and loses no height to it', (w, h) => {
    // The two viewports where five bays across decide the scale rather
    // than the band's height — one when the exit road came off and gave
    // the band its 43px, the other from the start. Named so that the test
    // above reads as the general rule and these as the cases that broke
    // it.
    const layout = layoutAt(w, h);
    const usable = Math.min(w * 0.92, 1080) - PICKER_SIDE_PAD * 2;
    expect(layout.bays.reduce((sum, b) => sum + b.w, 0)).toBeCloseTo(usable, 1);

    // The width is the tighter of the two limits here, so the scale is
    // under what the height alone would allow.
    const rows = PICKER_PAD_TOP + PICKER_CHIP_ROW + PICKER_LABEL_H + PICKER_PAD_BOTTOM;
    const longestM = Math.max(...IDS.map(vehicleLengthM));
    const bandMax = Math.round(h - PICKER_EXIT_GROUND - layout.apron.y);
    expect(layout.pxPerMetre).toBeLessThan((bandMax - rows) / longestM);

    // And the band is exactly the fleet, so the height the width would not
    // let her spend is below the tarmac rather than under her nose. This
    // is the relationship the 14.3px gap broke; it was a loose "within
    // 20px of the band there is" before, which only held while the width
    // cost little.
    expect(layout.apron.h).toBeLessThan(bandMax);
    expect(layout.apron.h).toBe(Math.round(longestM * layout.pxPerMetre) + rows);
  });

  it.each(SIZES)('keeps every bay a tap target, whatever size its vehicle is, at %ix%i', (w, h) => {
    const layout = layoutAt(w, h);
    for (const bay of layout.bays) {
      // The whole bay answers the tap (less 3px a side), so the smallest
      // vehicle's target is her bay and not her 19px outline.
      expect(bay.w - 6, `${bay.id} bay`).toBeGreaterThanOrEqual(MIN_TAP);
      expect(layout.apron.h, `${bay.id} height`).toBeGreaterThanOrEqual(MIN_TAP);
    }
    expect(PICKER_MIN_HIT).toBe(MIN_TAP);
    expect(PICKER_MIN_BAY - 6).toBeGreaterThanOrEqual(MIN_TAP);
  });

  it.each(SIZES)('has no building, and gives the vehicles the band it stood in, at %ix%i', (w, h) => {
    // **Marcus's decision, 9 October 2026: no building at any size.** It
    // was a height threshold — on above 560px, off below — and the band it
    // left the vehicles at 620px tall was 236px against 448 without it.
    // Two reasons, both the same way: the vehicles are what this screen is
    // for, and it is the only screen where the fleet's relative size can
    // be seen at all, because the loading screen zooms each vehicle to
    // fill its own bay; and a front elevation standing among plan-view
    // vehicles is the Rule 8 mismatch already taken off the loading
    // screen. The seam is kept (`PickerLayout.building`) for a roof-down
    // building, which does not exist yet.
    expect(layoutAt(w, h).building).toBe(false);
  });

  it('gives the vehicles the whole band, which is the larger one', () => {
    // 471px of band at 620px tall: 236 with the building, 448 once it came
    // off, and the last 23 from the exit road going too. The number is
    // here so that putting either of them back — the two changes that
    // would halve it — cannot be done quietly.
    expect(layoutAt(820, 620).apron.h).toBe(471);
    expect(layoutAt(820, 620).apron.h).toBeGreaterThan(236 * 1.8);
    // And the taller the screen, the more band: the band follows the
    // fleet, and the fleet is as large as the room allows.
    expect(layoutAt(820, 620).apron.h).toBeGreaterThan(layoutAt(874, 402).apron.h);
    expect(layoutAt(1024, 768).apron.h).toBeGreaterThan(layoutAt(1024, 700).apron.h);
  });

  it('records how large the smallest vehicle is drawn, so a change that shrinks her is seen', () => {
    // The numbers from the layout itself, at all four viewports. With the
    // building gone and then the exit road, Trikey is drawn 2.5 times the
    // size she was — 18x43 at 820x620, then 43x101, now 46x107 — and that
    // growth is the whole point of both decisions. Her landscape-phone
    // figure moved least, 19x45 to 21x48: the building was already off
    // there and what limits that screen is its 402px of height.
    const trike = (w: number, h: number) => layoutAt(w, h).bays.find((b) => b.id === 'pedal-trike')!;
    expect([Math.round(trike(820, 620).spriteW), Math.round(trike(820, 620).spriteH)]).toEqual([46, 107]);
    expect([Math.round(trike(1024, 700).spriteW), Math.round(trike(1024, 700).spriteH)]).toEqual([55, 129]);
    expect([Math.round(trike(1024, 768).spriteW), Math.round(trike(1024, 768).spriteH)]).toEqual([58, 135]);
    expect([Math.round(trike(874, 402).spriteW), Math.round(trike(874, 402).spriteH)]).toEqual([21, 48]);
  });

  it('shrinks the scale, never the bays, when the screen is too narrow for five', () => {
    // 420px wide: five 64px bays and the tarmac round them leave no room
    // for the scale the height allows, so the vehicles are drawn smaller.
    const wide = layoutAt(1024, 700);
    const narrow = layoutAt(420, 700);
    expect(narrow.pxPerMetre).toBeLessThan(wide.pxPerMetre);
    for (const bay of narrow.bays) expect(bay.w).toBeGreaterThanOrEqual(PICKER_MIN_BAY - 1e-6);
    expect(narrow.apron.x).toBeGreaterThanOrEqual(0);
    expect(narrow.apron.x + narrow.apron.w).toBeLessThanOrEqual(420 + 1e-6);
    // Still true to scale.
    for (const bay of narrow.bays) {
      expect(bay.spriteW / VEHICLE_WIDTH_M[bay.id]).toBeCloseTo(narrow.pxPerMetre, 6);
    }
  });
});

/**
 * **The fixtures, checked against the paint they describe.**
 *
 * Added 2026-10-09, after Trikey's portrait was repainted and the first
 * question asked of the change — "which of her numbers moved?" — could
 * only be answered by opening the files by hand. Everything above this
 * point is arithmetic on three records of what the art looks like:
 * `VEHICLE_BED` (where the load area is), `VEHICLE_BED_SOURCE` (which
 * painting it was measured on) and `PAINTED_BODY` (how wide the body is
 * there). All three were written by eye and none of them was checked
 * against a file by anything that runs.
 *
 * `warnOnStaleBed` in `crate-loading-view.ts` is the existing guard and
 * it is a `console.warn` at draw time: it fires in a browser, on the
 * first frame, for whoever happens to be looking. A repaint therefore
 * reached a commit and a CI run with nothing said. On 2026-10-08 the
 * whole fleet was repainted at new canvas sizes and the beds were
 * re-measured by hand afterwards, which is the right outcome by the
 * wrong mechanism.
 *
 * So these read the installed PNGs and measure them, by the methods the
 * constants' own comments name:
 *
 *   - the canvas, from the file header, against `VEHICLE_BED_SOURCE`;
 *   - the nine `bedProbePoints`, against the sprite's alpha, so a bed
 *     that has drifted off the painted body fails here rather than
 *     warning there;
 *   - the median opaque extent across the bed's rows — median, so one
 *     wing mirror cannot skew it, which is the mistake the Spark
 *     comment in `fleet-art.ts` records — against `PAINTED_BODY`.
 *
 * **What they cannot catch**, said plainly: nothing here knows what the
 * art is *of*. A repaint at the same canvas size that keeps a body of
 * the same width in the same place, and moves the load area within it,
 * passes. Trikey is about to be that case — her load area becomes a
 * rear rack — so her re-measure is still a person's job. What these
 * stop is the silent half: art replaced and numbers left behind.
 */
const TOPDOWN = path.join(__dirname, '../../../public/assets/driving/topdown');

/** A decoded sprite: its canvas, and the alpha of any pixel in it. */
interface Sprite {
  w: number;
  h: number;
  alphaAt: (x: number, y: number) => number;
}

/**
 * Enough of a PNG reader to answer "is there paint here?".
 *
 * Hand-rolled on purpose. `sharp` is a root dev dependency of the
 * monorepo and resolves from here only because Node walks up to the
 * root `node_modules`; it is not a dependency of `@arc/game`, and a
 * test that leans on that is a test that breaks the first time the
 * install layout changes. Everything below is `node:zlib` and
 * arithmetic.
 *
 * Handles what the fleet actually is — bit depth 8, non-interlaced,
 * colour type 6 (RGBA, Trikey) or 3 (palette + `tRNS`, the other four
 * after the installer's quantise) — and throws on anything else rather
 * than guessing, so a future sprite in a format this does not read
 * fails loudly instead of reporting every pixel opaque.
 */
function readSprite(file: string): Sprite {
  const buf = fs.readFileSync(file);
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const [i, byte] of SIGNATURE.entries()) {
    if (buf[i] !== byte) throw new Error(`${file} is not a PNG`);
  }

  let w = 0;
  let h = 0;
  let depth = 0;
  let colour = 0;
  let interlace = 0;
  let trns: Buffer | undefined;
  const idat: Buffer[] = [];

  for (let at = 8; at + 8 <= buf.length;) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString('ascii', at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      depth = body[8];
      colour = body[9];
      interlace = body[12];
    } else if (type === 'tRNS') {
      trns = Buffer.from(body);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(body));
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + len;
  }

  if (depth !== 8 || interlace !== 0 || (colour !== 6 && colour !== 3)) {
    throw new Error(
      `${path.basename(file)}: bit depth ${depth}, colour type ${colour}, `
      + `interlace ${interlace} — this reader handles depth 8, types 3 and 6, `
      + 'non-interlaced only. Teach it the new format rather than skipping it.',
    );
  }

  // One byte per pixel for a palette image, four for RGBA.
  const bpp = colour === 6 ? 4 : 1;
  const stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * h);

  // Un-filter, scanline by scanline. Each line is prefixed with its
  // filter type and is reconstructed from the pixel to its left (`a`)
  // and the line above (`b`, `c` being up-and-left). Straight out of
  // the PNG specification's filter definitions; `raw` is the filtered
  // bytes and `out` the picture.
  for (let y = 0; y < h; y += 1) {
    const filter = raw[y * (stride + 1)];
    const from = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[from + i];
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= bpp ? out[(y - 1) * stride + i - bpp] : 0;
      let value: number;
      if (filter === 0) value = x;
      else if (filter === 1) value = x + a;
      else if (filter === 2) value = x + b;
      else if (filter === 3) value = x + ((a + b) >> 1);
      else if (filter === 4) {
        // Paeth: whichever of the three neighbours the gradient a+b−c
        // is nearest to.
        const p = a + b - c;
        const da = Math.abs(p - a);
        const db = Math.abs(p - b);
        const dc = Math.abs(p - c);
        value = x + (da <= db && da <= dc ? a : db <= dc ? b : c);
      } else throw new Error(`${path.basename(file)}: unknown filter ${filter}`);
      out[y * stride + i] = value & 0xff;
    }
  }

  const alphaAt = colour === 6
    ? (x: number, y: number) => out[y * stride + x * 4 + 3]
    // A palette entry with no `tRNS` byte is opaque.
    : (x: number, y: number) => trns?.[out[y * stride + x]] ?? 255;

  return { w, h, alphaAt };
}

/** Opaque, at the threshold the sprite measurements have always used. */
const PAINT = 16;

/**
 * The painted body across a bed's own rows, as fractions of the sprite:
 * the median first and last opaque pixel.
 *
 * The median is the whole method. A wing mirror, a lamp or a handlebar
 * reaches wider than the body on a handful of rows, and taking the
 * extreme would measure mirror to mirror and call it bodywork — which
 * is exactly how Spark's bed was "corrected" to a wrong number on
 * 2026-10-09 and reverted. See `VEHICLE_BED`.
 */
function paintedBodyOf(sprite: Sprite, bed: { y: number; h: number }) {
  const lefts: number[] = [];
  const rights: number[] = [];
  const top = Math.round(bed.y * sprite.h);
  const bottom = Math.round((bed.y + bed.h) * sprite.h);
  for (let y = Math.max(0, top); y <= Math.min(sprite.h - 1, bottom); y += 1) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < sprite.w; x += 1) {
      if (sprite.alphaAt(x, y) > PAINT) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first >= 0) {
      lefts.push(first);
      rights.push(last);
    }
  }
  lefts.sort((a, b) => a - b);
  rights.sort((a, b) => a - b);
  return {
    left: lefts[lefts.length >> 1] / sprite.w,
    right: (rights[rights.length >> 1] + 1) / sprite.w,
  };
}

describe('the art the bed numbers were measured on', () => {
  const sprites = new Map<VehicleType, Sprite>();
  const spriteOfFile = (id: VehicleType) => {
    let s = sprites.get(id);
    if (!s) {
      s = readSprite(path.join(TOPDOWN, `${VEHICLE_SPRITE[id]}.png`));
      sprites.set(id, s);
    }
    return s;
  };

  it('finds all five sprites, so a missing file cannot pass this file', () => {
    for (const v of EVERY_VEHICLE) {
      const file = path.join(TOPDOWN, `${VEHICLE_SPRITE[v.id]}.png`);
      expect(fs.existsSync(file), file).toBe(true);
    }
    expect(EVERY_VEHICLE).toHaveLength(5);
  });

  it('still measures the canvas VEHICLE_BED_SOURCE records', () => {
    // The claim `VEHICLE_BED_SOURCE`'s own comment makes: a texture
    // that no longer measures this has been redrawn since, and the
    // fractions beside it are then a guess about a different painting.
    // Every fleet repaint so far has changed the canvas, so this is the
    // one that would have caught each of them.
    for (const v of EVERY_VEHICLE) {
      const sprite = spriteOfFile(v.id);
      expect({ w: sprite.w, h: sprite.h }, `${v.name}: ${VEHICLE_SPRITE[v.id]}.png`)
        .toEqual(VEHICLE_BED_SOURCE[v.id]);
    }
  });

  it('keeps Trikey at the sprite her bed was measured on, repaint or not', () => {
    // **Named, because today's repaint was hers and did not touch it.**
    // `assets/driving/vehicles/vehicle-trikey.png` is her portrait: the
    // canon picture every other view of her is painted from, repainted
    // 2026-10-09 with a rear rack and a pennant, which took her drawn
    // width from 605px to 738px of a 1024x512 canvas and her right
    // margin from 181px to 48px. Nothing in the game reads it — the
    // only thing that does is the mock `public/admin/pre-drive.html`,
    // which fits the whole canvas into a 150x84 box.
    //
    // Her bed comes off `topdown/vehicle-topdown-trikey.png`, which is
    // a different file and was not repainted. So her numbers are
    // untouched by the portrait, and the re-measure
    // `.claude/notes/commissions-2026-10-09.md` asks for waits on the
    // top-down being redrawn from the new portrait, which is still to
    // be commissioned.
    expect(VEHICLE_SPRITE['pedal-trike']).toBe('vehicle-topdown-trikey');
    const sprite = spriteOfFile('pedal-trike');
    expect({ w: sprite.w, h: sprite.h }).toEqual({ w: 364, h: 851 });
  });

  it('lands all nine probe points of every bed on paint', () => {
    // The check `warnOnStaleBed` makes in a browser console, made here
    // instead — same points, same question, and it fails a run.
    for (const v of EVERY_VEHICLE) {
      const sprite = spriteOfFile(v.id);
      const off: string[] = [];
      for (const { u, v: vv } of bedProbePoints(VEHICLE_BED[v.id])) {
        const x = Math.min(sprite.w - 1, Math.max(0, Math.round(u * sprite.w)));
        const y = Math.min(sprite.h - 1, Math.max(0, Math.round(vv * sprite.h)));
        if (sprite.alphaAt(x, y) <= 8) off.push(`(${u.toFixed(3)}, ${vv.toFixed(3)})`);
      }
      expect(off, `${v.name}'s bed off the painted body at`).toEqual([]);
    }
  });

  it('keeps PAINTED_BODY inside the paint, and close enough to mean something', () => {
    // The fixture is used as a bound the cutaway floor must stay within,
    // so the direction that matters is one-sided: a fixture *wider*
    // than the body would let the floor be drawn on tarmac and the test
    // above it would still pass. The 0.03 is the other half — a
    // fixture allowed to drift arbitrarily tight stops describing the
    // art at all. Measured 2026-10-09: Trikey 0.0797..0.9231, Henry
    // 0.0945..0.9055, Bea 0.1623..0.8411, Big Tilly 0.0813..0.9228,
    // Spark 0.1266..0.8812.
    for (const v of EVERY_VEHICLE) {
      const measured = paintedBodyOf(spriteOfFile(v.id), VEHICLE_BED[v.id]);
      const fixture = PAINTED_BODY[v.id];
      expect(fixture.left, `${v.name} body left (paint at ${measured.left.toFixed(4)})`)
        .toBeGreaterThanOrEqual(measured.left - 0.001);
      expect(fixture.right, `${v.name} body right (paint at ${measured.right.toFixed(4)})`)
        .toBeLessThanOrEqual(measured.right + 0.001);
      expect(fixture.left - measured.left, `${v.name} body left slack`)
        .toBeLessThan(0.03);
      expect(measured.right - fixture.right, `${v.name} body right slack`)
        .toBeLessThan(0.03);
    }
  });
});
