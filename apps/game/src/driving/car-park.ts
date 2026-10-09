/**
 * car-park.ts — the A.R.C. forecourt as seen from inside one bay.
 *
 * `forecourt.ts` draws the car park the vehicle picker stands in: the
 * whole row at a distance, five vans a thumbnail each. This draws the
 * same car park from much closer, with one vehicle filling the frame —
 * the loading screen, a moment after the pick.
 *
 * **It is the picker's layout, not a new one.** Gravel, the A.R.C.
 * building at the back, a tarmac apron with the fleet parked nose-down
 * in bays sized to each vehicle, and the chosen one in the middle. The
 * only thing that changes is the scale, and the scale is now measured:
 * `VEHICLE_WIDTH_M` says what the chosen vehicle's drawn width is worth
 * in metres, and every bay, line and kerb here is laid out in metres
 * and converted once.
 *
 * **The exit road is not in this picture, and that is the arithmetic.**
 * At 1024x700 Henry is drawn 202px wide, so his 1.75m is 116 pixels to
 * the metre. One 3.3m lane is 382px — wider than the whole band of car
 * park he stands in — and the two-way carriageway a centre line claims
 * is 763, taller than the viewport. The road the screen used to draw
 * along the bottom was 48px, which at that scale is 42cm of tarmac
 * with a centre line down it: a lane an eighth of a van across. There
 * is no size it could have been drawn at that would have been honest,
 * so what runs off the bottom of this frame is the car park, and the
 * road is somewhere past the edge. The picker, where a van is 55px,
 * keeps its road and keeps it right.
 *
 * **Depth, not size.** The chosen vehicle is the subject and must stay
 * the subject, so the fleet beside her is drawn at the same true scale
 * — same car park, same metre — and pushed back with tint and alpha
 * instead, with the frame cutting the outer ones. The building behind
 * is large and soft: the lesson from the attempt that drew it at 130px
 * was that a small building reads as a sticker, so this one is sized
 * off the band it stands in and cropped by the apron's kerb, the way a
 * building behind a car park is cropped by the car park.
 *
 * Nothing here moves, flashes or is on a timer.
 */

import Phaser from 'phaser';
import { VEHICLE_DEFS, type VehicleType } from '@arc/game-logic';
import { drawApron, drawGravel } from './forecourt';
import { VEHICLE_SPRITE, VEHICLE_WIDTH_M, bayWidthM } from './fleet-art';

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * The band the building stands in, above the apron — a share of the
 * column, with a floor and a ceiling.
 *
 * Under about 84px there is no building, only a smear of roof, and the
 * honest thing is gravel: that is what the landscape phone gets, where
 * the whole column is shorter than one van. Past about 200 it stops
 * buying legibility and starts costing the bays.
 *
 * 0.30 is what the trade is worth. The band comes out of the vehicle's
 * *length*, never its width — see `VEHICLE_VISIBLE_FRAC` — so at
 * 1024x700 it leaves her drawn 201px wide with 58px bays against the
 * 204 and 59 she had with no car park at all. The picture behind her
 * is free; what pays for it is her bumper.
 */
const BACKDROP_FRAC = 0.30;
const BACKDROP_MIN = 84;
const BACKDROP_MAX = 200;

/**
 * The widest the building is drawn, as a share of the column it stands
 * behind and of the frame.
 *
 * **The lesson from the attempt that failed was scale.** A rescue
 * centre drawn 130px wide behind a 200px van is a sticker, because a
 * building is not the size of a van. So this one is drawn about as
 * wide as the whole car park column and cropped at its own ground
 * line: what shows is the flat roof, the aviary dome and the flagpole,
 * and what is hidden is everything a car park in front of a building
 * hides. A big building mostly behind something reads as a big
 * building; a small whole one reads as a model.
 */
const BUILDING_W_FRAC = 1.0;
const BUILDING_W_MIN = 240;
const BUILDING_W_MAX_FRAME = 0.5;
/** Never so little of it that it is a line of roof. */
const BUILDING_KEEP_MAX = 0.72;

/** A painted bay line is 100mm of white thermoplastic. */
const BAY_LINE_M = 0.1;
const BAY_LINE = 0xf2ead6;
const BAY_LINE_ALPHA = 0.8;

/**
 * How far back the rest of the fleet sits.
 *
 * Tint and alpha, not size: they are in the same car park, on the same
 * tarmac, a bay away, so drawing them smaller would be drawing a
 * different car park. What makes the chosen vehicle unmistakable is
 * that she is the only one in full colour, the only one with a shadow
 * under her and the only one with her roof lifted off.
 *
 * A first pass had them at 0.62 alpha on a grey tint and they read as
 * stains on the tarmac rather than as vans. Over a near-black surface
 * a muted vehicle has to stay *light* to stay a vehicle; what takes it
 * back is the colour leaving it, not the light.
 */
const PARKED_TINT = 0xbcb7ad;
const PARKED_ALPHA = 0.76;
const BUILDING_TINT = 0xe4dfd4;
const BUILDING_ALPHA = 0.88;

/**
 * How much of a car-park column goes to the building behind it.
 *
 * Exported because the caller has to know it *before* it measures the
 * vehicle: the band is taken off the top of the column, the vehicle is
 * fitted to what is left plus the length she may hang past the kerb,
 * and then this draws the band. Two readings of one number would be
 * the vehicle and the ground disagreeing about where the car park
 * starts.
 */
export function carParkBackdropH(columnH: number): number {
  const want = Math.min(columnH * BACKDROP_FRAC, BACKDROP_MAX);
  return want >= BACKDROP_MIN ? want : 0;
}

export interface CarParkOptions {
  width: number;
  height: number;
  /** The first y below the title plate — the building is sized from it. */
  contentTop: number;
  /** The column the chosen vehicle is drawn in, and its bay centred in it. */
  column: Rect;
  /** The chosen vehicle. Her bay is left empty for the caller to fill. */
  chosen: VehicleType;
  /**
   * The chosen vehicle's drawn width, already decided by `fitLoadBed` —
   * the bays lead, so the vehicle's size is not this module's to pick.
   * The whole car park is measured off it: this width is
   * `VEHICLE_WIDTH_M` metres, and everything else follows.
   */
  spriteW: number;
}

export interface CarPark {
  /** The chosen vehicle's bay, in screen coordinates. */
  bay: Rect;
  /**
   * Where a vehicle's rear sits in its bay — reversed in, a little
   * inside the painted head of the bay. The same line for everyone in
   * the row, so the fleet reads as parked rather than scattered.
   */
  parkTop: number;
  /** Pixels to the metre, for anything else that wants to be measured. */
  pxPerMetre: number;
  /** Where the apron ends — the line a vehicle is cut off at. */
  kerbY: number;
}

/**
 * Draw the car park into `container`, back to front, and say where the
 * chosen vehicle's bay landed.
 */
export function drawCarPark(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  options: CarParkOptions,
): CarPark {
  const { width, height, contentTop, column, chosen, spriteW } = options;

  drawGravel(scene, container, width, height);

  const pxPerMetre = spriteW / VEHICLE_WIDTH_M[chosen];
  const backdropH = carParkBackdropH(column.h);
  const apronTop = column.y + backdropH;
  const apronBottom = column.y + column.h;

  // The chosen vehicle's bay, centred in her column.
  const bayW = bayWidthM(chosen) * pxPerMetre;
  const bayCx = column.x + column.w / 2;
  const bay: Rect = {
    x: bayCx - bayW / 2,
    y: apronTop,
    w: bayW,
    h: apronBottom - apronTop,
  };

  // ── The building, at the back ──
  //
  // Centred on the bay rather than on the frame: the child has parked
  // in front of the rescue centre, and a building centred on a viewport
  // whose vehicle is off to one side is a building standing somewhere
  // else. Its ground line runs under the apron, which is drawn after
  // it, so the kerb crops it the way the far edge of a car park crops
  // whatever is behind it.
  if (backdropH > 0 && scene.textures.exists('site-arc-building')) {
    const img = scene.add.image(bayCx, contentTop, 'site-arc-building').setOrigin(0.5, 0);
    const aspect = img.width / img.height;
    const visible = apronTop - contentTop + 10;
    const wantW = Math.min(
      Math.max(column.w * BUILDING_W_FRAC, BUILDING_W_MIN),
      width * BUILDING_W_MAX_FRAME,
    );
    let drawnH = wantW / aspect;
    let keep = visible / drawnH;
    if (keep > BUILDING_KEEP_MAX) {
      keep = BUILDING_KEEP_MAX;
      drawnH = visible / keep;
    }
    img.setDisplaySize(drawnH * aspect, drawnH);
    // `setCrop` is in the texture's own pixels and leaves the kept part
    // where it already was, so the roofline does not move when the band
    // changes size.
    img.setCrop(0, 0, img.width, img.height * Math.max(0.05, Math.min(1, keep)));
    img.setTint(BUILDING_TINT);
    img.setAlpha(BUILDING_ALPHA);
    container.add(img);
  }

  // ── The apron ──
  //
  // It runs off the left edge of the frame and stops at the column's
  // right, because the car park is bigger than the screen and the
  // chrome column is paper laid over a place rather than a panel on a
  // black field. A slab that stopped neatly either side of one vehicle
  // was the thing that read as a UI panel with a van on it.
  drawApron(scene, container, {
    x: -24,
    y: apronTop,
    w: column.x + column.w + 24,
    h: bay.h,
  }, 0);
  // Its near-side kerb, so the tarmac ends at an edge rather than at a
  // cut. `drawApron` only draws the far one, which is all the picker's
  // band of bays needs.
  const edgeKerb = scene.add.graphics();
  edgeKerb.fillStyle(0xcdc0a6, 0.4);
  edgeKerb.fillRect(column.x + column.w - 4, apronTop, 4, bay.h);
  edgeKerb.fillStyle(0x000000, 0.18);
  edgeKerb.fillRect(column.x + column.w - 7, apronTop + 6, 3, bay.h - 6);
  container.add(edgeKerb);

  // ── The bays, and the rest of the fleet in them ──
  //
  // Laid out from the chosen vehicle's bay outwards in fleet order, so
  // this is the picker's row with the camera moved in: the same five
  // spaces, each as wide as its own vehicle needs, and the outer ones
  // cut by the frame.
  const fleet = Object.values(VEHICLE_DEFS).map((v) => v.id as VehicleType);
  const chosenAt = Math.max(0, fleet.indexOf(chosen));
  const lineW = Math.max(3, Math.min(10, BAY_LINE_M * pxPerMetre));
  const parkTop = apronTop + Math.min(bay.h * 0.08, 0.5 * pxPerMetre);
  const lines = scene.add.graphics();
  lines.fillStyle(BAY_LINE, BAY_LINE_ALPHA);

  // The head of every bay, along the kerb — one rule across the row.
  lines.fillRect(-24, apronTop + lineW * 2, column.x + column.w + 24, lineW);

  const apronRight = column.x + column.w;
  let edge = bay.x;
  for (let i = chosenAt - 1; i >= 0; i -= 1) {
    const w = bayWidthM(fleet[i]) * pxPerMetre;
    edge -= w;
    if (edge + w < -24) break;
    drawParked(scene, container, fleet[i], edge, w, bay, parkTop, apronRight, pxPerMetre);
    lines.fillRect(edge - lineW / 2, apronTop, lineW, bay.h);
  }
  lines.fillRect(bay.x - lineW / 2, apronTop, lineW, bay.h);
  lines.fillRect(bay.x + bay.w - lineW / 2, apronTop, lineW, bay.h);
  edge = bay.x + bay.w;
  for (let i = chosenAt + 1; i < fleet.length; i += 1) {
    const w = bayWidthM(fleet[i]) * pxPerMetre;
    if (edge > apronRight) break;
    drawParked(scene, container, fleet[i], edge, w, bay, parkTop, apronRight, pxPerMetre);
    lines.fillRect(Math.min(edge + w, apronRight) - lineW / 2, apronTop, lineW, bay.h);
    edge += w;
  }
  container.add(lines);

  return { bay, parkTop, pxPerMetre, kerbY: apronBottom };
}

/**
 * One of the other fleet vehicles, parked in the bay beside the chosen
 * one at the same true scale and pushed back with tint and alpha.
 *
 * Reversed in, nose toward the exit, rear on the same line as hers:
 * that is how the picker parks them and it is how you park a van you
 * are going to load. Cropped to the apron's near edge so a neighbour
 * ends where the ground does rather than running out under the chrome.
 */
function drawParked(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  id: VehicleType,
  bayX: number,
  bayW: number,
  bay: Rect,
  top: number,
  apronRight: number,
  pxPerMetre: number,
): void {
  const key = VEHICLE_SPRITE[id];
  if (!scene.textures.exists(key)) return;

  const img = scene.add.image(0, 0, key).setOrigin(0.5, 0);
  const drawnW = VEHICLE_WIDTH_M[id] * pxPerMetre;
  const drawnH = drawnW * (img.height / img.width);
  const left = bayX + bayW / 2 - drawnW / 2;
  img.setPosition(bayX + bayW / 2, top);
  img.setDisplaySize(drawnW, drawnH);

  // Cropped to the tarmac on both axes, in the texture's own pixels: a
  // van is parked on the ground, so where the ground stops she stops.
  // Without it the last one in the row carries on over the gravel and
  // out under the chrome, which reads as a van abandoned on the verge.
  const keepH = Math.max(0, Math.min(1, (bay.y + bay.h - top) / drawnH));
  const keepW = Math.max(0, Math.min(1, (apronRight - left) / drawnW));
  if (keepH < 1 || keepW < 1) {
    img.setCrop(0, 0, img.width * keepW, img.height * keepH);
  }
  img.setTint(PARKED_TINT);
  img.setAlpha(PARKED_ALPHA);
  container.add(img);
}
