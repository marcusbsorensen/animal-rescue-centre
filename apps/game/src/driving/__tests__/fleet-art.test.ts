import { describe, it, expect } from 'vitest';
import { VEHICLE_DEFS, type VehicleType } from '@arc/game-logic';
import {
  BAY_GAP, BAY_LENGTH_M, BAY_MAX_RATIO, BAY_MIN, BAY_WIDTH_M, BED_PAD, BED_SLACK, LANE_WIDTH_M,
  VEHICLE_BED, VEHICLE_BED_SOURCE, VEHICLE_SPRITE, VEHICLE_VISIBLE_FRAC, VEHICLE_WIDTH_M,
  bayWidthM, bedProbePoints, fitLoadBed,
} from '../fleet-art';
import { carParkBackdropH } from '../car-park';

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
 * The box is now the car-park column: `PAGE_MARGIN` to the gutter
 * across, and down from the title to the tray — divided, where there
 * is a building behind, by `VEHICLE_VISIBLE_FRAC`, because the vehicle
 * is sized for the whole band and then parked below the backdrop.
 */
const RAW_COLUMNS = {
  'desktop 1024x700': { w: 532, h: 526 },
  'narrow 820x620': { w: 424, h: 334 },
  'landscape phone 874x402': { w: 455, h: 144 },
};
/** The two the screen is composed for. */
const ROOMY = ['desktop 1024x700', 'narrow 820x620'] as const;

type Viewport = keyof typeof RAW_COLUMNS;
const boxFor = (c: { w: number; h: number }) => {
  const backdrop = carParkBackdropH(c.h);
  return { w: c.w, h: backdrop > 0 ? (c.h - backdrop) / VEHICLE_VISIBLE_FRAC : c.h };
};
const COLUMNS = Object.fromEntries(
  Object.entries(RAW_COLUMNS).map(([k, c]) => [k, boxFor(c)]),
) as Record<Viewport, { w: number; h: number }>;

/**
 * How much of each column is actually on screen — the column less the
 * band the building stands in.
 *
 * This is the bound that matters: a bay below it is a tap target cut
 * in half.
 */
const VISIBLE = Object.fromEntries(
  Object.entries(RAW_COLUMNS).map(([k, c]) => [k, c.h - carParkBackdropH(c.h)]),
) as Record<Viewport, number>;

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
      // The vehicle's rear sits on the head of her bay, so the grid is
      // measured from the top of the box in every case. Several of
      // them are too long to fit the visible band and lose a bumper to
      // the kerb (see `fitLoadBed`), and Spark loses a strip of empty
      // cutaway with it. What may never be cut is a bay: half a bay is
      // half a tap target, on a screen whose whole job is tapping them.
      expect(fit.grid.y, `${v.name} first row`).toBeGreaterThanOrEqual(-0.5);
      expect(fit.grid.y + fit.gridH, `${v.name} last row`)
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

  it('keeps every load bed whole, whatever runs off the kerb', () => {
    // **What the 2026-10-09 reshape bought, restated against the
    // thing that actually matters.** It used to assert `overflows ===
    // false` for the whole fleet at both roomy viewports, which read
    // as "nothing is clipped" and was never true at the narrow one —
    // see `COLUMNS`. And it stopped being the right question once the
    // car park went in behind the vehicle: she is now *sized* for the
    // whole column and *parked* below the backdrop, so reaching the
    // kerb is the design rather than the fault.
    //
    // The fault would be a bed that reached it. Every bed in the fleet
    // ends by `VEHICLE_VISIBLE_FRAC` of its sprite, which is what lets
    // the picture behind her be paid for in bumper; this holds that
    // relationship, because the next vehicle painted with a longer
    // load area is what would quietly break it.
    for (const v of EVERY_VEHICLE) {
      const bed = VEHICLE_BED[v.id];
      expect(bed.y + bed.h, `${v.name} load bed`).toBeLessThanOrEqual(VEHICLE_VISIBLE_FRAC);
    }
    // The exception is a vehicle `fitLoadBed` had to grow past her box
    // to keep her bays tappable — she is then taller than the band
    // was ever going to be, and what the kerb takes is the empty end
    // of her cutaway. Even then the bays themselves are whole, which
    // is the line that matters and is asserted above.
    for (const label of ROOMY) {
      for (const v of EVERY_VEHICLE) {
        const fit = fitIn(COLUMNS[label], v);
        if (fit.overflows) continue;
        expect(fit.bed.y + fit.bed.h, `${v.name} bed at ${label}`)
          .toBeLessThanOrEqual(VISIBLE[label] + 0.5);
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

  it('cannot fit a traffic lane beside the chosen vehicle, which is why there is no road', () => {
    // The arithmetic that took the exit road off this screen, as an
    // assertion rather than a comment. The screen used to draw a 48px
    // carriageway with a centre line down it beside a van drawn 202px
    // wide — 42cm of road against 1.75m of van, a lane an eighth of a
    // van across. Drawn right, one lane is wider than the whole band
    // of car park the vehicle stands in, and the two-way carriageway
    // the centre line claimed is taller than the viewport. There is no
    // size the road could have been drawn at that would have been
    // honest, which is why what runs off the bottom of this frame is
    // the car park.
    const fit = fitIn(COLUMNS['desktop 1024x700'], VEHICLE_DEFS['small-van']);
    const pxPerMetre = fit.spriteW / VEHICLE_WIDTH_M['small-van'];
    expect(LANE_WIDTH_M * pxPerMetre).toBeGreaterThan(VISIBLE['desktop 1024x700']);
    expect(2 * LANE_WIDTH_M * pxPerMetre).toBeGreaterThan(700);
  });

  it('cannot paint the far end of the bay either, for the same reason', () => {
    // A UK bay is 4.8m deep and the band the car park has at the
    // desktop viewport is about 3.2m of it, so the bay runs off the
    // bottom of the frame with the vehicle standing in it. That is why
    // what is painted is the two side lines and the head, and never a
    // near end: a bay closed at a line the van is sticking out of
    // would read as a van parked badly.
    const fit = fitIn(COLUMNS['desktop 1024x700'], VEHICLE_DEFS['small-van']);
    const pxPerMetre = fit.spriteW / VEHICLE_WIDTH_M['small-van'];
    expect(BAY_LENGTH_M * pxPerMetre).toBeGreaterThan(VISIBLE['desktop 1024x700']);
  });

  it('gives the car park a band at the sizes the screen is composed for, and none on a phone', () => {
    for (const label of ROOMY) {
      expect(carParkBackdropH(RAW_COLUMNS[label].h), label).toBeGreaterThan(0);
    }
    // The landscape phone's whole column is shorter than one van, so
    // it keeps the picture it had: gravel, and every pixel to the bays.
    expect(carParkBackdropH(RAW_COLUMNS['landscape phone 874x402'].h)).toBe(0);
  });

  it('pays for the band out of the bumper and not out of the bays', () => {
    // Henry's bays with a car park behind him against the box the
    // screen handed him before there was one — 524x471, measured off
    // the layout this replaced. The backdrop comes off the top of the
    // column and what is left is divided by the share of him that has
    // to stay in frame, so the bays come out within a pixel.
    const withPark = fitIn(COLUMNS['desktop 1024x700'], VEHICLE_DEFS['small-van']);
    const before = fitIn({ w: 524, h: 471 }, VEHICLE_DEFS['small-van']);
    expect(withPark.slotW).toBeGreaterThanOrEqual(before.slotW - 1);
    expect(withPark.slotH).toBeGreaterThanOrEqual(before.slotH - 1);
  });
});
