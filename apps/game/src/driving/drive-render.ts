/**
 * drive-render.ts
 *
 * Pure-ish drawing helpers for the PTV top-down travel view. Bird's-eye,
 * daylight, gentle — the "same readable space as the tunnel grid" the
 * hybrid-camera proposal asks for, NOT the pseudo-3D projection SupplyRun
 * uses. Kept separate from `PtvDriveScene` so the scene stays readable.
 *
 * These take a Phaser.Graphics and geometry and draw; they hold no state of
 * their own (scroll offset is passed in), so the scene owns the animation.
 */
import Phaser from 'phaser';
import { NUM_LANES } from './drive-state';

/** Top-down palette — soft daylight, tuned to the ARC brand cream/green. */
export const DRIVE_COLOURS = {
  skyGrass: 0x8fce7e,     // verge green
  vergeEdge: 0x74b463,    // darker verge band
  tarmac: 0x6b6f76,       // road surface
  tarmacEdge: 0x585c62,   // road shoulder
  laneDash: 0xfdf6e3,     // warm off-white lane markings
  roadEdgeLine: 0xf2e9d0, // solid edge line
} as const;

export interface RoadGeometry {
  roadLeft: number;
  roadWidth: number;
  laneWidth: number;
}

/**
 * Compute the road box for a given canvas. The road occupies the central
 * ~72% of the width; the rest is grass verge on either side.
 */
export function roadGeometry(width: number): RoadGeometry {
  const roadWidth = Math.min(width * 0.72, 620);
  const roadLeft = (width - roadWidth) / 2;
  return { roadLeft, roadWidth, laneWidth: roadWidth / NUM_LANES };
}

/** Centre x of a given lane (0..NUM_LANES-1). */
export function laneCentreX(geo: RoadGeometry, lane: number): number {
  return geo.roadLeft + geo.laneWidth * (lane + 0.5);
}

/**
 * Draw the whole top-down road for one frame. `scrollY` accumulates as the
 * van drives, sliding the dashed lane lines downward so the world reads as
 * moving past the (screen-fixed) van.
 */
export function drawTopDownRoad(
  gfx: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  scrollY: number,
): void {
  gfx.clear();
  const geo = roadGeometry(width);

  // Grass verges (full-bleed background).
  gfx.fillStyle(DRIVE_COLOURS.skyGrass, 1);
  gfx.fillRect(0, 0, width, height);

  // A subtly darker band right beside the road so the tarmac reads as sunk in.
  gfx.fillStyle(DRIVE_COLOURS.vergeEdge, 1);
  gfx.fillRect(geo.roadLeft - 10, 0, 10, height);
  gfx.fillRect(geo.roadLeft + geo.roadWidth, 0, 10, height);

  // Tarmac.
  gfx.fillStyle(DRIVE_COLOURS.tarmac, 1);
  gfx.fillRect(geo.roadLeft, 0, geo.roadWidth, height);

  // Solid warm edge lines just inside the tarmac.
  gfx.fillStyle(DRIVE_COLOURS.roadEdgeLine, 0.9);
  gfx.fillRect(geo.roadLeft + 3, 0, 3, height);
  gfx.fillRect(geo.roadLeft + geo.roadWidth - 6, 0, 3, height);

  // Dashed lane dividers between the NUM_LANES lanes, scrolling with the drive.
  const dashLen = 34;
  const dashGap = 30;
  const pitch = dashLen + dashGap;
  const offset = ((scrollY % pitch) + pitch) % pitch;
  gfx.fillStyle(DRIVE_COLOURS.laneDash, 0.95);
  const dashW = 5;
  for (let divider = 1; divider < NUM_LANES; divider++) {
    const x = geo.roadLeft + geo.laneWidth * divider - dashW / 2;
    for (let y = offset - pitch; y < height; y += pitch) {
      gfx.fillRect(x, y, dashW, dashLen);
    }
  }
}

/**
 * Draw a simple top-down van into a Graphics object, centred on (0,0) so the
 * caller can position/tween it via the container transform. Placeholder art
 * for Slice 1 — painted top-down vehicle sprites are later polish.
 *
 * `bodyColour` lets decorative traffic reuse the same shape in other hues.
 */
export function drawTopDownVan(
  gfx: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  bodyColour: number,
): void {
  gfx.clear();
  const hw = w / 2;
  const hh = h / 2;

  // Soft shadow.
  gfx.fillStyle(0x000000, 0.15);
  gfx.fillRoundedRect(-hw + 3, -hh + 5, w, h, 10);

  // Body.
  gfx.fillStyle(bodyColour, 1);
  gfx.fillRoundedRect(-hw, -hh, w, h, 10);

  // Roof highlight strip.
  gfx.fillStyle(0xffffff, 0.12);
  gfx.fillRoundedRect(-hw + 4, -hh + 4, w - 8, h * 0.4, 8);

  // Windscreen (front = toward top of screen, the direction of travel).
  gfx.fillStyle(0xbfe6f2, 0.95);
  gfx.fillRoundedRect(-hw + 6, -hh + 6, w - 12, h * 0.22, 6);

  // Wheels (peeking out on the sides).
  gfx.fillStyle(0x2b2b2b, 1);
  const wheelW = 5;
  const wheelH = h * 0.18;
  gfx.fillRoundedRect(-hw - wheelW + 2, -hh + h * 0.2, wheelW, wheelH, 2);
  gfx.fillRoundedRect(-hw - wheelW + 2, hh - h * 0.2 - wheelH, wheelW, wheelH, 2);
  gfx.fillRoundedRect(hw - 2, -hh + h * 0.2, wheelW, wheelH, 2);
  gfx.fillRoundedRect(hw - 2, hh - h * 0.2 - wheelH, wheelW, wheelH, 2);
}
