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
 * The vehicle box the loading screen hands out, measured off its own
 * layout at the three viewports it is checked at.
 *
 * **Re-measured 2026-10-09 against the car park**, and the narrow one
 * was wrong before that. It said 391 where the screen was handing out
 * 287: the loading screen drops its tray to a full-width strip at
 * 820x620 and the number here predated that, so three of the five
 * vehicles had been overflowing their box at that viewport while a
 * test asserted none of them did. The fixture, not the code, was what
 * made it pass.
 *
 * The box is the car-park column: `PAGE_MARGIN` to the gutter across,
 * and down from the title to the tray. Less, where the column is tall
 * enough to spare it, the ground the vehicle keeps clear of the frame
 * fore and aft (`carParkBackdropH`) — and **no longer divided by
 * anything**. It was divided by `VEHICLE_VISIBLE_FRAC` (0.78), so the
 * vehicle was sized for a box 28% taller than the column and the
 * bottom of her was cut off at a kerb; with the fraction at 1 she is
 * sized for what is left and stands whole inside the column.
 */
const RAW_COLUMNS = {
  'desktop 1024x700': { x: 24, y: 93, w: 542, h: 527 },
  'narrow 820x620': { x: 24, y: 93, w: 424, h: 335 },
  'landscape phone 874x402': { x: 24, y: 93, w: 455, h: 145 },
};
/** The two the screen is composed for. */
const ROOMY = ['desktop 1024x700', 'narrow 820x620'] as const;
/** The viewport widths, for where the chrome stands. */
const WIDTH_OF: Record<keyof typeof RAW_COLUMNS, number> = {
  'desktop 1024x700': 1024,
  'narrow 820x620': 820,
  'landscape phone 874x402': 874,
};

type Viewport = keyof typeof RAW_COLUMNS;
const boxFor = (c: { w: number; h: number }) => ({
  w: c.w,
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

  it('spends the slack at 1024x700 too, where it is exactly enough', () => {
    // The same behaviour on a real screen: at the desktop viewport
    // Spark's box is 486px, her bare bays come out at 39.6px - four
    // tenths under the floor - and the slack is what saves her.
    const box = COLUMNS['desktop 1024x700'];
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

  it('moves only the vehicles whose room ran out, and leaves the other three where they were', () => {
    // At 820x620 the box is 309px: Trikey, Henry and Big Tilly are fitted
    // to it and stand in the middle of the column exactly as they did
    // before the ground was allowed above it. Bea (323) and Spark (361)
    // are the two that need more than the column's middle can give them.
    const label = 'narrow 820x620';
    const column = RAW_COLUMNS[label];
    const moved: VehicleType[] = [];
    for (const v of EVERY_VEHICLE) {
      const fit = fitIn(COLUMNS[label], v);
      const centred = column.y + (column.h - fit.spriteH) / 2;
      if (Math.abs(parkTopFor(label, fit.spriteH) - centred) > 1.01) moved.push(v.id);
    }
    expect(moved.sort()).toEqual(['electric-minibus', 'long-van']);
  });

  it('keeps every bay whole on a landscape phone, where the front of the vehicle still runs off', () => {
    // The one screen where "nothing is cropped" cannot hold: the column is
    // 145px and every vehicle needs 255 to 361. What the rising rear buys
    // is that the bays are whole and tappable - they used to spill over
    // the tray - and each vehicle stands at the ceiling.
    const label = 'landscape phone 874x402';
    for (const v of EVERY_VEHICLE) {
      const fit = fitIn(COLUMNS[label], v);
      expect(fit.overflows, v.name).toBe(true);
      expect(parkTopFor(label, fit.spriteH), v.name).toBe(PARK_CEILING);
      expect(fit.slotW, v.name).toBeGreaterThanOrEqual(BAY_MIN);
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
    // vehicle standing whole in it - and two lanes, the carriageway a
    // centre line claims, are taller than the viewport.
    const fit = fitIn(COLUMNS['desktop 1024x700'], VEHICLE_DEFS['small-van']);
    const pxPerMetre = fit.spriteW / VEHICLE_WIDTH_M['small-van'];
    expect(fit.spriteH + LANE_WIDTH_M * pxPerMetre).toBeGreaterThan(RAW_COLUMNS['desktop 1024x700'].h);
    expect(2 * LANE_WIDTH_M * pxPerMetre).toBeGreaterThan(700);
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

  it('keeps ground round the vehicle at the sizes the screen is composed for, and none on a phone', () => {
    for (const label of ROOMY) {
      expect(carParkBackdropH(RAW_COLUMNS[label].h), label).toBeGreaterThan(0);
    }
    // The landscape phone's whole column is shorter than one van, so
    // every pixel goes to the vehicle and none to a margin round her.
    expect(carParkBackdropH(RAW_COLUMNS['landscape phone 874x402'].h)).toBe(0);
  });

  it('takes the ground from a few pixels of vehicle and not from the bays', () => {
    // Henry's bays with ground round him against the box the screen
    // handed him before there was a car park at all - 524x471, measured
    // off the layout this replaced. The margin comes off the column and
    // what is left is the box, so the bays come out within a pixel.
    const withPark = fitIn(COLUMNS['desktop 1024x700'], VEHICLE_DEFS['small-van']);
    const before = fitIn({ w: 524, h: 471 }, VEHICLE_DEFS['small-van']);
    expect(withPark.slotW).toBeGreaterThanOrEqual(before.slotW - 1);
    expect(withPark.slotH).toBeGreaterThanOrEqual(before.slotH - 1);
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
