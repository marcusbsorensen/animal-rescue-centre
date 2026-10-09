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
 * **These go stale when the art is redrawn, and that is expected.** What
 * must not happen is them being *silently* wrong, so
 * `VEHICLE_BED_SOURCE` records the sprite each one was measured
 * against and `bedProbePoints` gives a dev check something to sample:
 * a bed that has drifted off the painted body says so in the console
 * the first time the screen draws.
 *
 * **Re-measured 2026-10-08 against the proportion pass**, which made
 * every vehicle but Trikey between 1.4x and 1.9x longer for its width:
 * Big Tilly went from 513x1012 to 738x2071. The guard fired on all
 * four, which is it working. Method as before — a 5% grid laid over
 * `apps/game/public/assets/driving/topdown/vehicle-topdown-*.png` and
 * read off, with a row-and-column colour scan of the same files to
 * settle the edges the grid left between two lines. Not arithmetic on
 * the old numbers: the fore-and-aft figures moved by more than the
 * length change, because a van that grew only in length grew only in
 * the part of itself the bed is.
 *
 *   Trikey      the open wooden box behind the saddle. Not redrawn, so
 *               not re-measured: the box is 0.08..0.92 across and
 *               0.02..0.33 down, and these numbers still sit in it.
 *   Henry       the van body, rear doors (0.02) to the bulkhead behind
 *               the windscreen (0.67); sides 0.10..0.90
 *   Bea         the same, longer: 0.02 to 0.64; sides 0.16..0.84 —
 *               narrower than Henry's *as a fraction*, because her
 *               wing mirrors are what make her file wide
 *   Big Tilly   inside her open wooden load bed, tailgate (0.01) to
 *               headboard (0.59); walls 0.08..0.92
 *   Spark       the minibus cabin, rear (0.02) to windscreen (0.72);
 *               sides 0.14..0.87
 */
export interface LoadBed { x: number; y: number; w: number; h: number }

export const VEHICLE_BED: Record<VehicleType, LoadBed> = {
  'pedal-trike':      { x: 0.11, y: 0.04, w: 0.78, h: 0.28 },
  'small-van':        { x: 0.15, y: 0.05, w: 0.70, h: 0.56 },
  'long-van':         { x: 0.21, y: 0.05, w: 0.58, h: 0.54 },
  'animal-lorry':     { x: 0.14, y: 0.04, w: 0.72, h: 0.52 },
  'electric-minibus': { x: 0.19, y: 0.05, w: 0.62, h: 0.63 },
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
  'small-van': { w: 561, h: 1309 },
  'long-van': { w: 579, h: 1418 },
  'animal-lorry': { w: 738, h: 2071 },
  'electric-minibus': { w: 640, h: 1870 },
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

/**
 * Gap between two bays, and the margin the grid keeps inside the bed
 * where the bed is roomy enough to have one.
 */
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
 * How much taller than wide a bay may be drawn.
 *
 * A bay holds a crate, the crates are painted square, and the
 * proportion pass made every load bed two to three times longer than
 * it is wide. Left to fill the bed, Henry's four bays came out 55x117
 * — letterboxes with a 48px crate marooned in the middle of each. The
 * cap spends the length on floor instead, which is what a van with
 * four crates in it actually looks like from above.
 *
 * Only the tall direction is capped. A bay wider than it is deep is
 * Trikey, whose box really is wide and shallow, and `drawAnimalTile`
 * has a row layout that puts the spare width to work carrying the
 * name. There is no equivalent use for spare height.
 */
export const BAY_MAX_RATIO = 1.35;

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
 * **1.15 is measured, not picked, and it fell when the art changed.**
 * It used to be 1.3, bought from Tilly's depth — the axis the
 * proportion pass made enormous. The axis that now matters is her
 * width, and the slack there is small: her bed is 0.14..0.86 of her
 * sprite and her painted wooden walls run 0.08..0.92, so there is
 * 0.84/0.72 = 1.165x of her recorded width before a cutaway would be
 * drawn on tarmac rather than on the lorry. Bea has 1.164 and Spark
 * 1.177, so 1.15 is inside all three with nothing to spare, and it is
 * the number that decides whether a three-across grid stays on the
 * paint or floats off the side of the vehicle.
 */
export const BED_SLACK = 1.15;

export interface BedFit {
  /** Multiplier on the sprite's natural size. */
  scale: number;
  /** The drawn sprite. */
  spriteW: number;
  spriteH: number;
  /** The measured load bed in drawn px, from the sprite's top-left. */
  bed: { x: number; y: number; w: number; h: number };
  /**
   * The cutaway floor the bays are laid on — the vehicle's interior,
   * seen with the roof lifted off. The measured bed, in drawn px.
   *
   * The same rectangle as `bed`, and kept as its own field because it
   * is a different question: `bed` is where the load area *is*, and
   * this is what gets painted. They were different once and may be
   * again.
   */
  floor: { x: number; y: number; w: number; h: number };
  /**
   * The grid's own top-left — where bay 0 starts.
   *
   * Centred on the bed, which is usually larger than the grid (a van
   * with four crates in it has floor fore and aft of them) and
   * occasionally smaller, where three bays at the tap floor need more
   * width than the bed has.
   */
  grid: { x: number; y: number };
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
 * **The vehicle stays in frame where it can.** It is drawn as large as
 * its box allows and no larger, so it sits on the tarmac with air round
 * it rather than hanging off the bottom of the slab. Where the bed is
 * then too tight for the bays, the floor spreads into the bed's slack
 * (`BED_SLACK`) instead of the vehicle growing.
 *
 * Only when that is not enough does the vehicle grow past its box, and
 * the caller clips it at the tarmac's edge.
 *
 * **Since the proportion pass that is the normal case for the
 * three-across vehicles, and the arithmetic says it cannot be
 * otherwise.** A bay is floored at 40px drawn so its hit area can be
 * floored at `MIN_TAP` without reaching into its neighbour's, which
 * puts a hard floor of 152px on a three-column grid. Big Tilly's bed
 * is 0.72 of her sprite's width and she is 2.81 times taller than she
 * is wide, so 152px of bed means 515px of lorry — against a band of
 * about 476px at 1024x700 and 400px at 820x620. Bea and Spark are
 * worse. Nothing in the layout buys 40 more pixels of height, so the
 * choice is a grid a child mis-taps, a cutaway floating off the side
 * of the vehicle, or a bumper that runs out of the picture. It is the
 * bumper: the sprite is pinned to the top of its box, so what goes is
 * always the front, and the load bed — the thing the screen is about
 * — is whole every time.
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

  /** The room a row or column of `n` bays of `slot` takes, gaps and all. */
  const span = (slot: number, n: number) => slot * n + gap * (n - 1);
  /**
   * The biggest bay a run of `avail` can hold, `n` across.
   *
   * The epsilon is binary arithmetic, not slop. The growth below solves
   * for the scale at which a bay is exactly `minSlot`, and a scale that
   * came back as 39.99999999999999 floored to 39 — one pixel under the
   * tap floor, from a calculation whose whole purpose was to land on
   * it.
   */
  const slotIn = (avail: number, n: number) => (avail - gap * (n - 1)) / n + 1e-6;

  const measure = (scale: number) => {
    const bedW = sprite.w * scale * bed.w;
    const bedH = sprite.h * scale * bed.h;
    // The grid keeps `pad` inside the bed where the bed is roomy, and
    // gives the padding up — then spreads into the bed's slack, out to
    // the vehicle's own sides — where it is not. Padding is a margin
    // on a floor the grid already fits in; a grid wider than its floor
    // has nothing to be a margin of.
    const availW = Math.max(bedW - pad * 2, Math.min(span(minSlot, cols), bedW * BED_SLACK));
    const availH = Math.max(bedH - pad * 2, Math.min(span(minSlot, rows), bedH * BED_SLACK));
    const slotW = Math.max(1, Math.min(Math.floor(slotIn(availW, cols)), BAY_MAX_W));
    return {
      bedW,
      bedH,
      slotW,
      // A bay is never much taller than it is wide: the crates are
      // painted square, so depth past the width is floor, not bay.
      slotH: Math.max(1, Math.min(
        Math.floor(slotIn(availH, rows)),
        BAY_MAX_H,
        Math.max(minSlot, Math.round(slotW * BAY_MAX_RATIO)),
      )),
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
  // The cutaway *is* the bed. It used to be the grid and its padding,
  // which on the short art was the bed to within a rounding error; on
  // the long art it is not, and a floor sized to a three-across grid
  // came out wider than Big Tilly's wooden walls — a cream slab laid
  // over the lorry instead of a look inside it. Where the grid wants
  // more than the bed has, it is the grid that spends the slack, and
  // the outer crates sit against the vehicle's sides, which is where
  // crates in a full van sit.
  const floor = bedRect;
  const gridW = m.slotW * cols + gap * (cols - 1);
  const gridH = m.slotH * rows + gap * (rows - 1);

  return {
    scale,
    spriteW,
    spriteH,
    bed: bedRect,
    floor,
    grid: {
      x: bedRect.x + (bedRect.w - gridW) / 2,
      y: bedRect.y + (bedRect.h - gridH) / 2,
    },
    slotW: m.slotW,
    slotH: m.slotH,
    gridW,
    gridH,
    overflows: spriteH > box.h + 0.5,
  };
}

// ── The fleet at real size ───────────────────────────────────

/**
 * How wide each fleet vehicle is, in metres.
 *
 * **This is the one number that lets anything else on a screen be
 * measured.** A top-down sprite has no scale of its own: it is however
 * many pixels wide the layout drew it, and until something says what
 * those pixels are worth, every road, kerb, bay line and dash beside it
 * is drawn by eye. The loading screen's exit road was — 48px of
 * carriageway against a van drawn 204px wide, which is a road 42cm
 * across.
 *
 * Taken from the proportion pass of 2026-10-08 (`.claude/HANDOVER.md`,
 * "One true scale"), which redrew every sprite to its real aspect and
 * recorded what each vehicle is: Henry a 1.75m x 4.2m small van, Bea a
 * 1.8m van, Spark a 2.0m minibus, Big Tilly a 2.3m lorry. They are
 * `VEHICLE_SIZE` x Henry, which is how that table was built, so the two
 * stay in step — a test holds them to each other.
 *
 * Trikey was not in the pass because she was not redrawn; 0.75m is her
 * `VEHICLE_SIZE` of 0.43 against Henry, and a 0.75m-wide cargo trike is
 * about right.
 *
 * Length comes free from the sprite's own aspect and is not recorded
 * here: every file now carries its vehicle's true proportion, so
 * `width_m * spriteH / spriteW` is the length, within 3% of the
 * handover's table for all four.
 */
export const VEHICLE_WIDTH_M: Record<VehicleType, number> = {
  'pedal-trike': 0.75,
  'small-van': 1.75,
  'long-van': 1.80,
  'electric-minibus': 2.00,
  'animal-lorry': 2.30,
};

/**
 * A marked UK parking bay: 2.4m across, 4.8m deep.
 *
 * The loading screen paints the width and never the far end, because
 * at the scale it draws the chosen vehicle a 4.8m bay is deeper than
 * the band it has — the bay runs off the bottom of the frame with the
 * vehicle in it, which is the same thing the road does.
 */
export const BAY_WIDTH_M = 2.4;
export const BAY_LENGTH_M = 4.8;

/**
 * A UK traffic lane on a single carriageway, in metres.
 *
 * Here to be measured against rather than drawn: at the size the
 * loading screen draws the chosen vehicle, one lane is wider than the
 * viewport is tall, which is the arithmetic that took the exit road off
 * that screen.
 */
export const LANE_WIDTH_M = 3.3;

/**
 * The clearance a standard bay leaves Henry — 65cm, shared between the
 * two sides.
 *
 * This is the whole rule for a bay's width, and the 2.4m standard is
 * what it gives a 1.75m van. Squeezing the rest of the fleet into 2.4
 * would leave Big Tilly 5cm, which is a line painted on a lorry; and
 * giving a pedal trike a car's bay draws a 0.75m trike alone in the
 * middle of 2.4m of tarmac. Marcus's forecourt was always drawn with
 * different-sized spaces for exactly this reason — it is in the
 * picker's own comment — so this is that design, in metres.
 */
export const BAY_CLEARANCE_M = BAY_WIDTH_M - VEHICLE_WIDTH_M['small-van'];

/** How wide this vehicle's bay is painted, in metres. */
export function bayWidthM(id: VehicleType): number {
  return VEHICLE_WIDTH_M[id] + BAY_CLEARANCE_M;
}

/**
 * How much of a fleet sprite has to stay in frame.
 *
 * Every load bed in `VEHICLE_BED` ends by 0.68 of its sprite — they are
 * all a band across the top, behind the cab — so a vehicle whose top
 * 78% is on screen has its whole bed on screen with a tenth of the
 * sprite to spare. What goes is the bumper, which is the trade
 * `fitLoadBed` already makes when a vehicle has to grow for its bays.
 *
 * It is what the car park behind the vehicle is paid for with: the
 * backdrop takes the slack between the bed's near end and the bottom of
 * the band, and never a pixel of the bays.
 */
export const VEHICLE_VISIBLE_FRAC = 0.78;
