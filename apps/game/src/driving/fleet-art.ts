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
 * Measured 2026-10-08 off the shipping sprites with a 5% grid overlay,
 * after the livery pass landed:
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

export interface BedFit {
  /** Multiplier on the sprite's natural size. */
  scale: number;
  /** The drawn sprite. */
  spriteW: number;
  spriteH: number;
  /** The load bed in drawn px, measured from the sprite's top-left. */
  bed: { x: number; y: number; w: number; h: number };
  /** One bay, drawn. */
  slotW: number;
  slotH: number;
  /** The whole grid, drawn. */
  gridW: number;
  gridH: number;
  /** The vehicle is drawn taller than the box it was given. */
  overflows: boolean;
}

/**
 * Fit a crate grid into a vehicle's load bed, and say how big to draw
 * the vehicle.
 *
 * The bays lead and the vehicle follows, because the bays are what a
 * child has to hit. The whole vehicle is drawn as large as the box
 * allows; if that leaves the bays under `BAY_MIN`, the vehicle grows
 * until they clear it and the caller draws it running off the bottom of
 * the band.
 *
 * **Growth is bounded on one axis only.** Big Tilly is the case: her
 * load bed is a third of her sprite's length — she is mostly cab — so a
 * lorry scaled to fit a 383px band gives nine bays of about 31px, and
 * on a landscape phone a trike scaled to fit gets 15px ones. Letting
 * either run past the bottom of the picture is the right trade, because
 * a lorry too big for the frame is true and a grid whose taps land on
 * the wrong bay is not. Running off the *side* is not a trade at all —
 * that is the message panel — so the column's width is the one hard
 * stop, and a vehicle that hits it keeps smaller bays rather than
 * overlapping hit areas, which `drawBays` guards.
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

  const bedW = (s: number) => sprite.w * s * bed.w;
  const bedH = (s: number) => sprite.h * s * bed.h;
  const slotsAt = (s: number) => ({
    w: (bedW(s) - pad * 2 - gap * (cols - 1)) / cols,
    h: (bedH(s) - pad * 2 - gap * (rows - 1)) / rows,
  });
  /** The scale at which every bay is exactly `slot` on its shorter axis. */
  const scaleForSlot = (slot: number) => Math.max(
    (slot * cols + gap * (cols - 1) + pad * 2) / (sprite.w * bed.w),
    (slot * rows + gap * (rows - 1) + pad * 2) / (sprite.h * bed.h),
  );

  const fitScale = Math.min(box.w / sprite.w, box.h / sprite.h);
  let scale = fitScale;
  const atFit = slotsAt(fitScale);
  if (Math.min(atFit.w, atFit.h) < minSlot) {
    scale = Math.min(
      scaleForSlot(minSlot),
      // Never wider than the box: a vehicle may run off the bottom of a
      // band, never off the side of its column into the message panel.
      box.w / sprite.w,
    );
    scale = Math.max(scale, fitScale);
  }

  const slots = slotsAt(scale);
  const slotW = Math.max(1, Math.min(Math.floor(slots.w), BAY_MAX_W));
  const slotH = Math.max(1, Math.min(Math.floor(slots.h), BAY_MAX_H));

  const spriteW = sprite.w * scale;
  const spriteH = sprite.h * scale;

  return {
    scale,
    spriteW,
    spriteH,
    bed: {
      x: bed.x * spriteW,
      y: bed.y * spriteH,
      w: bed.w * spriteW,
      h: bed.h * spriteH,
    },
    slotW,
    slotH,
    gridW: slotW * cols + gap * (cols - 1),
    gridH: slotH * rows + gap * (rows - 1),
    overflows: spriteH > box.h + 0.5,
  };
}
