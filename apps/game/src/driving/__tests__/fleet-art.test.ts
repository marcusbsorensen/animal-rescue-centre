import { describe, it, expect, vi } from 'vitest';
import { VEHICLE_DEFS, type VehicleType } from '@arc/game-logic';

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
  PICKER_BUILDING_MIN_H, PICKER_CHIP_H, PICKER_CHIP_ROW, PICKER_MIN_BAY, PICKER_MIN_HIT, PICKER_SIDE_PAD,
  bayWidthM, bedProbePoints, fitLoadBed, minScaleForBays, pickerLayout, vehicleLengthM, wholeVehicleHeight,
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

  it('keeps the building on a screen with room for it and takes it off one without', () => {
    // The building costs the vehicles half their size: 236px of band
    // against 448 at 620px tall. At 402 it would leave nothing to see.
    expect(layoutAt(820, 620).building).toBe(true);
    expect(layoutAt(1024, 700).building).toBe(true);
    expect(layoutAt(874, 402).building).toBe(false);
    expect(PICKER_BUILDING_MIN_H).toBeLessThanOrEqual(620);
    expect(layoutAt(874, 402).apron.h).toBeGreaterThan(layoutAt(820, 620).apron.h);
  });

  it('records how small the smallest vehicle is drawn, so a change that shrinks her is seen', () => {
    // The numbers Marcus was told, from the layout itself. Her bay is 64px
    // wide and she is 18; the comparison with the lorry is what the
    // screen is for, and it holds.
    const trike = (w: number, h: number) => layoutAt(w, h).bays.find((b) => b.id === 'pedal-trike')!;
    expect([Math.round(trike(820, 620).spriteW), Math.round(trike(820, 620).spriteH)]).toEqual([18, 43]);
    expect([Math.round(trike(1024, 700).spriteW), Math.round(trike(1024, 700).spriteH)]).toEqual([22, 51]);
    expect([Math.round(trike(874, 402).spriteW), Math.round(trike(874, 402).spriteH)]).toEqual([19, 45]);
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
