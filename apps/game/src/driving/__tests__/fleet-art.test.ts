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
  bayWidthM, bedProbePoints, fitLoadBed, minScaleForBays, wholeVehicleHeight,
} from '../fleet-art';
import {
  ARROW_DIMMED_INK, ARROW_DIMMED_PAPER, ARROW_H, ARROW_W,
  arrowLayout, carParkBackdropH, vehicleParkTop,
} from '../car-park';
import { MIN_TAP } from '../../ui/constants';
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
  'desktop 1024x700': { w: 532, h: 526 },
  'narrow 820x620': { w: 424, h: 334 },
  'landscape phone 874x402': { w: 455, h: 144 },
};
/** The two the screen is composed for. */
const ROOMY = ['desktop 1024x700', 'narrow 820x620'] as const;

type Viewport = keyof typeof RAW_COLUMNS;
const boxFor = (c: { w: number; h: number }) => ({
  w: c.w,
  h: (c.h - carParkBackdropH(c.h)) / VEHICLE_VISIBLE_FRAC,
});
const COLUMNS = Object.fromEntries(
  Object.entries(RAW_COLUMNS).map(([k, c]) => [k, boxFor(c)]),
) as Record<Viewport, { w: number; h: number }>;

/**
 * How much of each column is on screen: all of it.
 *
 * It was the column less a strip of gravel above a far kerb, and the
 * bound that mattered was that a bay below it was a tap target cut in
 * half. The kerb is gone, so the bound is the column. A vehicle is
 * parked by `vehicleParkTop`, which is not always the top of it.
 */
const VISIBLE = Object.fromEntries(
  Object.entries(RAW_COLUMNS).map(([k, c]) => [k, c.h]),
) as Record<Viewport, number>;

/** Where a vehicle of this fit actually stands in its column. */
const parkTopFor = (label: Viewport, spriteH: number) =>
  vehicleParkTop({ x: 0, y: 0, w: RAW_COLUMNS[label].w, h: RAW_COLUMNS[label].h }, spriteH);

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
      // Measured from where she is actually parked: in the middle of the
      // column when she fits and at the top of it when she does not
      // (`vehicleParkTop`), not from the top of the box. What may never
      // be cut is a bay: half a bay is half a tap target, on a screen
      // whose whole job is tapping them.
      const top = parkTopFor(label, fit.spriteH);
      expect(top + fit.grid.y, `${v.name} first row`).toBeGreaterThanOrEqual(-0.5);
      expect(top + fit.grid.y + fit.gridH, `${v.name} last row`)
        .toBeLessThanOrEqual(VISIBLE[label] + 0.5);
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

  it('keeps every vehicle whole, bar the one the layout cannot yet hold', () => {
    // **Rewritten 2026-10-09 for the car park with no kerb.** It used to
    // assert that every load bed ended inside the visible 78% of its
    // sprite, which is what let the nose be cut off. The rule is now the
    // plain one - Marcus's: nothing is shown cropped - and the question
    // is whether the whole vehicle stands in its column.
    //
    // `wholeVehicleHeight` is how tall a vehicle must be drawn for its
    // bays to be tappable, and it does not depend on the screen. A
    // column at least that tall holds her whole. Where it is shorter
    // `fitLoadBed` keeps the bays at the floor and lets the vehicle grow
    // past the ground, and the front is cut off at the edge of it: the
    // trade it has always made, recorded rather than hidden.
    //
    // **That happens in exactly one place on the screens the loading
    // view is composed for: Spark at 820x620**, who needs 361px and is
    // handed 334. It is listed here so the day the layout gives her the
    // height this test fails and says to delete the entry, and so a new
    // vehicle that does not fit is a failure rather than a surprise.
    const NOT_YET_WHOLE: Partial<Record<Viewport, VehicleType[]>> = {
      'narrow 820x620': ['electric-minibus'],
    };
    for (const label of ROOMY) {
      const raw = RAW_COLUMNS[label];
      for (const v of EVERY_VEHICLE) {
        const fit = fitIn(COLUMNS[label], v);
        const whole = fit.spriteH <= raw.h + 0.5;
        const expectedCut = NOT_YET_WHOLE[label]?.includes(v.id) ?? false;
        expect(whole, `${v.name} whole at ${label}`).toBe(!expectedCut);
        // The vehicle that cannot be whole is exactly the one whose
        // tappable height is more than the column, never a different one.
        expect(
          wholeVehicleHeight(v.id, v.cols, v.rows) > raw.h + 0.5,
          `${v.name} needs more than ${raw.h}px at ${label}`,
        ).toBe(expectedCut);
      }
    }
  });

  it('keeps the whole vehicle clear of the edge of the ground where it can', () => {
    // Whole is not enough if her bumper is touching the edge of the
    // picture, which reads as cropped whatever the pixels say.
    for (const label of ROOMY) {
      const raw = RAW_COLUMNS[label];
      const margin = carParkBackdropH(raw.h) / 2;
      for (const v of EVERY_VEHICLE) {
        const fit = fitIn(COLUMNS[label], v);
        if (fit.spriteH > raw.h) continue;
        const top = parkTopFor(label, fit.spriteH);
        expect(top, `${v.name} rear at ${label}`).toBeGreaterThanOrEqual(0);
        expect(raw.h - (top + fit.spriteH), `${v.name} front at ${label}`)
          .toBeGreaterThanOrEqual(Math.min(margin, (raw.h - fit.spriteH) / 2) - 0.5);
      }
    }
  });

  it('keeps the bays whole when the vehicle cannot be, and pins her rear to the top', () => {
    const label = 'narrow 820x620';
    const spark = VEHICLE_DEFS['electric-minibus'];
    const fit = fitIn(COLUMNS[label], spark);
    expect(fit.overflows).toBe(true);
    expect(fit.slotW).toBeGreaterThanOrEqual(BAY_MIN);
    expect(parkTopFor(label, fit.spriteH)).toBe(0);
    expect(fit.grid.y + fit.gridH).toBeLessThanOrEqual(VISIBLE[label] + 0.5);
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
    expect(fit.spriteH + LANE_WIDTH_M * pxPerMetre).toBeGreaterThan(VISIBLE['desktop 1024x700']);
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
    expect(BAY_LENGTH_M * pxPerMetre).toBeGreaterThan(VISIBLE['desktop 1024x700']);
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

  it('stands her in the middle of the ground when she fits', () => {
    expect(vehicleParkTop(column, 300)).toBe(100 + 17);
    expect(vehicleParkTop(column, 334)).toBe(100);
  });

  it('pins her rear to the top when she does not, so it is the front that has no ground', () => {
    expect(vehicleParkTop(column, 361)).toBe(100);
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
    const column = { x: 24, y: 100, w: raw.w, h: raw.h };
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
