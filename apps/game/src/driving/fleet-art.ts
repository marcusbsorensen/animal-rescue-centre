/**
 * fleet-art.ts — what each fleet vehicle looks like from above, and where
 * inside that painting the animals actually travel.
 *
 * Two facts live here and nowhere else: the texture key for a vehicle's
 * top-down sprite, and the rectangle of that sprite which is its load
 * area. Both are art facts rather than rules, so they are deliberately
 * kept out of `@arc/game-logic` — the rules know Big Tilly holds nine,
 * this module knows where the nine go.
 *
 * No Phaser import: this is arithmetic, so a test can run it without a
 * canvas.
 */

import type { VehicleType } from '@arc/game-logic';

/** The painted top-down sprite the player drives, per fleet vehicle. */
export const VEHICLE_SPRITE: Record<VehicleType, string> = {
  'pedal-trike': 'vehicle-topdown-trikey',
  'small-van': 'vehicle-topdown-henry',
  'long-van': 'vehicle-topdown-bea',
  'animal-lorry': 'vehicle-topdown-big-tilly',
  'electric-minibus': 'vehicle-topdown-spark',
};

/**
 * A vehicle's load area, as fractions of its drawn sprite — x/y from the
 * sprite's top-left, w/h of the sprite's size.
 *
 * **Fractions, not pixels, and that is the point.** Every top-down fleet
 * sprite is painted nose-down with its load behind the cab, so the load
 * area is always a band across the top of the frame. Measured against
 * the painted silhouette rather than the file's pixel dimensions, these
 * survive a repaint at a different canvas size, and they survive the
 * livery pass — a van redrawn in a new colour with the same proportions
 * needs no edit here. A van redrawn with a *different* cab-to-body
 * proportion does, and that is the one thing to check when the art
 * changes.
 *
 * They sit a little inside the painted body on purpose. The bays are
 * drawn on a cutaway panel laid over this rectangle, and a panel that
 * reached the silhouette's edge would read as a sticker covering the
 * vehicle; leaving a margin of the vehicle's own paint around it — the
 * trike's wooden rim, the van's roofline — reads as the roof lifted
 * off.
 *
 * **These will go stale, and that is expected.** They were measured by
 * eye off one set of files; the fleet is being redrawn at corrected
 * proportions, and a van a third longer for its width moves every
 * number here. What must not happen is them being *silently* wrong, so
 * `VEHICLE_BED_SOURCE` records the sprite each one was measured
 * against and `bedProbePoints` gives a dev check something to sample:
 * a bed that has drifted off the painted body says so in the console
 * the first time the screen draws.
 *
 * Measured 2026-10-08 with a 5% grid overlay, off the sprites in
 * `apps/game/public/assets/driving/topdown/vehicle-topdown-*.png` as
 * they stood after that day's livery pass:
 *
 *   Trikey      the open wooden box behind the saddle
 *   Henry       the van body between the rear doors and the windscreen
 *   Bea         the same, a third longer
 *   Big Tilly   inside the walls of her open wooden load bed
 *   Spark       the minibus cabin between the rear window and the screen
 */
export interface LoadBed { x: number; y: number; w: number; h: number }

export const VEHICLE_BED: Record<VehicleType, LoadBed> = {
  'pedal-trike':      { x: 0.11, y: 0.04, w: 0.78, h: 0.28 },
  'small-van':        { x: 0.15, y: 0.06, w: 0.70, h: 0.37 },
  'long-van':         { x: 0.16, y: 0.06, w: 0.68, h: 0.35 },
  'animal-lorry':     { x: 0.13, y: 0.06, w: 0.74, h: 0.31 },
  'electric-minibus': { x: 0.17, y: 0.07, w: 0.66, h: 0.33 },
};

/**
 * The sprite each bed in `VEHICLE_BED` was measured against, in the
 * file's own pixels.
 *
 * A texture that no longer measures this has been redrawn since, so the
 * fractions beside it are a guess about a different painting. The dev
 * check in the loading screen compares the two and says so.
 */
export const VEHICLE_BED_SOURCE: Record<VehicleType, { w: number; h: number }> = {
  'pedal-trike': { w: 364, h: 851 },
  'small-van': { w: 666, h: 960 },
  'long-van': { w: 606, h: 1022 },
  'animal-lorry': { w: 513, h: 1012 },
  'electric-minibus': { w: 621, h: 959 },
};

/**
 * Nine points on a bed, as fractions of the sprite, for a dev check to
 * sample the art at.
 *
 * The centre, the four edge midpoints and the four corners — the
 * corners pulled a tenth of the bed inward, the edges a twentieth,
 * because a painted body has rounded shoulders and a bed measured
 * correctly to its widest point still has air at the exact corner. A
 * bed sitting on the vehicle hits paint at all nine; one that has
 * drifted off the body since the art was redrawn does not.
 */
export function bedProbePoints(bed: LoadBed): Array<{ u: number; v: number }> {
  const insetX = bed.w * 0.1;
  const insetY = bed.h * 0.1;
  const l = bed.x + insetX;
  const r = bed.x + bed.w - insetX;
  const t = bed.y + insetY;
  const b = bed.y + bed.h - insetY;
  const cx = bed.x + bed.w / 2;
  const cy = bed.y + bed.h / 2;
  const edgeT = bed.y + bed.h * 0.05;
  const edgeB = bed.y + bed.h * 0.95;
  const edgeL = bed.x + bed.w * 0.05;
  const edgeR = bed.x + bed.w * 0.95;
  return [
    { u: cx, v: cy },
    { u: cx, v: edgeT }, { u: cx, v: edgeB },
    { u: edgeL, v: cy }, { u: edgeR, v: cy },
    { u: l, v: t }, { u: r, v: t }, { u: l, v: b }, { u: r, v: b },
  ];
}

/** Gap between two bays, and the margin between the bays and the bed's edge. */
export const BAY_GAP = 8;
export const BED_PAD = 8;

/**
 * The smallest a bay may be drawn.
 *
 * Not `MIN_TAP`, and not an aesthetic choice: a bay's hit area is floored
 * at `MIN_TAP` (48) on top of whatever is drawn, so two bays a `BAY_GAP`
 * apart stop overlapping each other's hit areas at a drawn size of
 * 48 − 8 = 40. Below that the floored rectangles collide and a tap near
 * the edge of one bay answers for its neighbour, which in this screen
 * means picking up the wrong animal.
 */
export const BAY_MIN = 40;

/** A bay never grows past this, however much vehicle there is. */
export const BAY_MAX_W = 132;
export const BAY_MAX_H = 108;

/**
 * How far past the measured bed the cutaway floor may spread to keep a
 * bay tappable.
 *
 * `VEHICLE_BED` is a rectangle drawn over a painted shape, and it is
 * deliberately inset from the body — so there is paint to spare on all
 * four sides, and a floor a few per cent larger is still inside the
 * vehicle. Spending that slack is what lets Big Tilly's nine bays reach
 * the tap floor with the whole lorry still in frame, which is the trade
 * the other way round from the one this used to make.
 *
 * **1.3 is measured, not picked.** Tilly is the vehicle that spends it
 * and she has the least to spare: her bed is recorded as 0.06..0.37 of
 * her sprite and her painted wooden load bed runs about 0.01..0.42, so
 * there is 1.32x of her recorded depth before the floor would reach the
 * cab. At her tightest viewport she spends 1.26 of it. Anything past
 * this and a cutaway would start being drawn on paint that is not the
 * load bed, which is the thing the rectangle exists to prevent.
 */
export const BED_SLACK = 1.3;

export interface BedFit {
  /** Multiplier on the sprite's natural size. */
  scale: number;
  /** The drawn sprite. */
  spriteW: number;
  spriteH: number;
  /** The measured load bed in drawn px, from the sprite's top-left. */
  bed: { x: number; y: number; w: number; h: number };
  /**
   * The cutaway floor the bays are actually laid on — the grid plus its
   * padding, centred on the bed. Usually the bed to within a rounding
   * error; a little larger where the bed had to give, a little smaller
   * where the bays hit their cap.
   */
  floor: { x: number; y: number; w: number; h: number };
  /** One bay, drawn. */
  slotW: number;
  slotH: number;
  /** The whole grid, drawn. */
  gridW: number;
  gridH: number;
  /**
   * The vehicle is drawn taller than the box it was given.
   *
   * A last resort, and on the sizes this game runs at it does not
   * happen: see `fitLoadBed`.
   */
  overflows: boolean;
}

/**
 * Fit a crate grid into a vehicle's load bed, and say how big to draw
 * the vehicle.
 *
 * **The whole vehicle stays in frame.** It is drawn as large as its box
 * allows and no larger, so it sits on the tarmac with air round it
 * rather than hanging off the bottom of the slab. Where the bed is then
 * too tight for the bays, the *floor* spreads into the bed's slack
 * (`BED_SLACK`) instead of the vehicle growing — Big Tilly's nine bays
 * need about 4% more depth than her measured bed at desktop size, and
 * her painted wooden bed has it.
 *
 * Only when that is not enough does the vehicle grow past its box, and
 * the caller clips it at the tarmac's edge. That is the landscape-phone
 * case, where the band is about 100px and a trike scaled into it has
 * 5px bays: a vehicle too big for the picture beats a grid whose taps
 * land on the wrong bay. It does not happen at 1024x700 or at 820x620.
 */
export function fitLoadBed(
  box: { w: number; h: number },
  sprite: { w: number; h: number },
  bed: LoadBed,
  cols: number,
  rows: number,
  options?: { gap?: number; pad?: number; minSlot?: number },
): BedFit {
  const gap = options?.gap ?? BAY_GAP;
  const pad = options?.pad ?? BED_PAD;
  const minSlot = options?.minSlot ?? BAY_MIN;

  /** The floor a row or column of `n` bays of `slot` needs. */
  const span = (slot: number, n: number) => slot * n + gap * (n - 1) + pad * 2;
  /** The biggest bay a floor of `avail` can hold, `n` across. */
  const slotIn = (avail: number, n: number) => (avail - pad * 2 - gap * (n - 1)) / n;

  const measure = (scale: number) => {
    const bedW = sprite.w * scale * bed.w;
    const bedH = sprite.h * scale * bed.h;
    // The floor takes the bed, and may spread into its slack — but only
    // as far as the bays actually need.
    const availW = Math.max(bedW, Math.min(span(minSlot, cols), bedW * BED_SLACK));
    const availH = Math.max(bedH, Math.min(span(minSlot, rows), bedH * BED_SLACK));
    return {
      bedW,
      bedH,
      slotW: Math.max(1, Math.min(Math.floor(slotIn(availW, cols)), BAY_MAX_W)),
      slotH: Math.max(1, Math.min(Math.floor(slotIn(availH, rows)), BAY_MAX_H)),
    };
  };

  const fitScale = Math.min(box.w / sprite.w, box.h / sprite.h);
  let scale = fitScale;
  let m = measure(scale);

  if (Math.min(m.slotW, m.slotH) < minSlot) {
    // The box is too small for this grid at any honest size. Grow the
    // vehicle until the bays clear the floor, never wider than the box
    // — running off the bottom is a picture, running off the side is
    // the message panel.
    const grown = Math.min(
      Math.max(
        span(minSlot, cols) / (BED_SLACK * sprite.w * bed.w),
        span(minSlot, rows) / (BED_SLACK * sprite.h * bed.h),
      ),
      box.w / sprite.w,
    );
    if (grown > scale) {
      scale = grown;
      m = measure(scale);
    }
  }

  const spriteW = sprite.w * scale;
  const spriteH = sprite.h * scale;
  const bedRect = {
    x: bed.x * spriteW,
    y: bed.y * spriteH,
    w: bed.w * spriteW,
    h: bed.h * spriteH,
  };
  const floorW = span(m.slotW, cols);
  const floorH = span(m.slotH, rows);

  return {
    scale,
    spriteW,
    spriteH,
    bed: bedRect,
    floor: {
      x: bedRect.x + (bedRect.w - floorW) / 2,
      y: bedRect.y + (bedRect.h - floorH) / 2,
      w: floorW,
      h: floorH,
    },
    slotW: m.slotW,
    slotH: m.slotH,
    gridW: m.slotW * cols + gap * (cols - 1),
    gridH: m.slotH * rows + gap * (rows - 1),
    overflows: spriteH > box.h + 0.5,
  };
}
