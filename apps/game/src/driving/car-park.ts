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
 * instead, with the frame cutting the outer ones.
 *
 * **There is no building in this picture, and the reason is the
 * camera.** `docs/manus-sprite-rules.md` Rule 7 locks the site's art to
 * two projections: ground top-down, buildings and trees as
 * front-elevation stamps, the painted-storybook-map convention. The
 * picker can hold both at once because it is a wide shot — the stamp is
 * a discrete object standing in a field of gravel, read as a picture of
 * a building rather than as a thing in the scene. Move the camera in
 * until one van fills the frame and the convention breaks: the façade
 * is the only thing left in elevation, it meets the tarmac along a
 * horizontal line, and what the eye reports is a building that has sunk
 * into the car park up to its ceiling. Marcus saw it immediately and he
 * is right. No amount of ground under it fixes that, because the fault
 * is not where the building stands, it is which way the camera is
 * pointing at it.
 *
 * The fix is a bird's-eye A.R.C. building — roof, dome and flagpole
 * seen from above, in the projection the tarmac and every vehicle are
 * already in. **That art does not exist.** The only A.R.C. building in
 * the repository is `site-arc-building.png`, which despite its
 * `topdown/` folder is the front elevation commissioned in
 * `docs/arc-site-tier1-brief.md` ("as if standing on Canute Road
 * looking at the front of the building"), and its two other copies are
 * the same painting. Squashing or skewing it would produce a squashed
 * façade, which is the same fault with extra steps, so until the art is
 * commissioned this screen shows what it can honestly show: the car
 * park, from above, with its far kerb and the gravel beyond it. That is
 * not a hole where a building was — it is the back edge of the car
 * park, which is what you see from here.
 *
 * Nothing here moves, flashes or is on a timer.
 */

import Phaser from 'phaser';
import { VEHICLE_DEFS, type VehicleType } from '@arc/game-logic';
import { drawApron, drawGravel } from './forecourt';
import { VEHICLE_SPRITE, VEHICLE_WIDTH_M, bayWidthM } from './fleet-art';

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * The strip of gravel above the apron — the ground the car park ends
 * on, between its far kerb and the top of the frame.
 *
 * **It was 0.30 of the column, 84 to 200 pixels, and it was a band for
 * a building to stand in.** With the building gone (see the note at the
 * top of this file) what it holds is the far edge of the car park, and
 * that edge needs enough gravel above it to read as ground the tarmac
 * stops on rather than as a cut at the top of the picture. A kerb with
 * nothing beyond it is a slab again, which is the failure
 * `f0e4dd0`/`7abdd63` were fixing.
 *
 * 42px is two kerbs' worth of gravel at every viewport this screen
 * runs at, and it is flat rather than a fraction because it is a
 * constant feature of the ground, not a share of the composition. At
 * 1024x700 it hands about 150px back to the vehicle and her bays —
 * which is the one trade this screen is allowed to make in only one
 * direction, because the animals are the subject.
 */
const BACKDROP_H = 42;

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

/**
 * How much of a car-park column is gravel above the apron's far kerb.
 *
 * Exported because the caller has to know it *before* it measures the
 * vehicle: the strip is taken off the top of the column, the vehicle is
 * fitted to what is left plus the length she may hang past the kerb,
 * and then this draws the ground. Two readings of one number would be
 * the vehicle and the ground disagreeing about where the car park
 * starts.
 *
 * A column too short to spare it gets none, and the tarmac runs to the
 * top of the frame — on the landscape phone the whole column is
 * shorter than one van, and a van is worth more than a kerb.
 */
export function carParkBackdropH(columnH: number): number {
  return columnH >= BACKDROP_H * 5 ? BACKDROP_H : 0;
}

export interface CarParkOptions {
  width: number;
  height: number;
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
  const { width, height, column, chosen, spriteW } = options;

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
