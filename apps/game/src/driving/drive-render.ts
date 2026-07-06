/**
 * drive-render.ts
 *
 * Pure-ish drawing helpers for the PTV top-down travel view. Bird's-eye,
 * daylight, gentle — the "same readable space as the tunnel grid" the
 * hybrid-camera proposal asks for, NOT the pseudo-3D projection SupplyRun
 * uses. Kept separate from `PtvDriveScene` so the scene stays readable.
 *
 * Helpers take a Phaser.Graphics and geometry and draw; they hold no state of
 * their own (scroll offset is passed in), so the scene owns the animation.
 */
import Phaser from 'phaser';
import { NUM_LANES } from './drive-state';
import type { TrafficKind } from './traffic';
import { totalLanes, medianUnits, type RoadConfig, type RoadSurface } from './road-config';

/** Top-down palette — soft daylight, tuned to the ARC brand cream/green. */
export const DRIVE_COLOURS = {
  skyGrass: 0x8fce7e,     // verge green
  vergeEdge: 0x74b463,    // darker verge band
  tarmac: 0x6b6f76,       // road surface
  laneDash: 0xfdf6e3,     // warm off-white lane markings
  roadEdgeLine: 0xf2e9d0, // solid edge line
  reservation: 0x7ec06a,  // grass central reservation
  treeCanopy: 0x4f9a43,
  treeCanopyLight: 0x63b455,
  treeTrunk: 0x6b4a2e,
  hedge: 0x5a8f42,
} as const;

/** Surface fills per road type: tarmac, rural gravel, coastal sand. */
export const SURFACE_COLOURS: Record<RoadSurface, { road: number; edge: number; dash: number }> = {
  tarmac: { road: 0x6b6f76, edge: 0xf2e9d0, dash: 0xfdf6e3 },
  gravel: { road: 0xa89a7e, edge: 0x8a7d62, dash: 0xe8ddc2 },
  sand:   { road: 0xd6c79c, edge: 0xbfae84, dash: 0xf0e6cc },
};

export interface RoadGeometry {
  roadLeft: number;
  roadWidth: number;
  laneWidth: number;
  totalLanes: number;
  playerLanes: number;
  medianUnits: number;
}

/**
 * Compute the road box for a given canvas. Width scales with the number of
 * lanes (a country lane is narrow, the Thanet Way dual carriageway is wide).
 * Called without a config it falls back to the legacy NUM_LANES road.
 */
export function roadGeometry(width: number, config?: RoadConfig): RoadGeometry {
  const total = config ? totalLanes(config) : NUM_LANES;
  const median = config ? medianUnits(config) : 0;
  const playerLanes = config ? config.playerLanes : NUM_LANES;
  const units = total + median;
  const roadWidth = config
    ? Math.min(width * (0.40 + 0.12 * units), 760)
    : Math.min(width * 0.72, 620);
  const roadLeft = (width - roadWidth) / 2;
  return { roadLeft, roadWidth, laneWidth: roadWidth / units, totalLanes: total, playerLanes, medianUnits: median };
}

/** Centre x of a lane index (0..total-1, left→right), accounting for a central
 *  reservation gap before the oncoming lanes. */
export function laneCentreX(geo: RoadGeometry, lane: number): number {
  const unitsBefore = lane + (lane >= geo.playerLanes ? geo.medianUnits : 0);
  return geo.roadLeft + geo.laneWidth * (unitsBefore + 0.5);
}

/** Van footprint sized to the lane it sits in (~58% of lane width). Vehicles
 *  were "much too small in relation to the lanes" — this fills the lane far
 *  more convincingly. */
export function vanSizeForLane(laneWidth: number): { w: number; h: number } {
  const w = Math.round(laneWidth * 0.58);
  return { w, h: Math.round(w * 1.7) };
}

/**
 * Draw the whole top-down road for one frame. `scrollY` accumulates as the
 * van drives, sliding the dashed lane lines downward so the world reads as
 * moving past the (screen-fixed) van. Handles reverse (negative scroll) too.
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

  // Dashed lane dividers, scrolling with the drive. Longer dashes per the
  // eyeball feedback — they read as motion far better.
  const dashLen = 64;
  const dashGap = 34;
  const pitch = dashLen + dashGap;
  const offset = ((scrollY % pitch) + pitch) % pitch;
  gfx.fillStyle(DRIVE_COLOURS.laneDash, 0.95);
  const dashW = 6;
  for (let divider = 1; divider < NUM_LANES; divider++) {
    const x = geo.roadLeft + geo.laneWidth * divider - dashW / 2;
    for (let y = offset - pitch; y < height; y += pitch) {
      gfx.fillRect(x, y, dashW, dashLen);
    }
  }
}

/**
 * Draw a road for a given config: the surface (tarmac / gravel / sand),
 * same-direction dashed lane dividers (scrolling), and the divide between the
 * two directions — a solid centre line, or a grass central reservation on a
 * dual carriageway. The player's lanes are the leftmost `geo.playerLanes`.
 */
export function drawRoadForConfig(
  gfx: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  scrollY: number,
  geo: RoadGeometry,
  config: RoadConfig,
): void {
  gfx.clear();
  const surf = SURFACE_COLOURS[config.surface];
  const lw = geo.laneWidth;

  // Grass verges.
  gfx.fillStyle(DRIVE_COLOURS.skyGrass, 1);
  gfx.fillRect(0, 0, width, height);
  gfx.fillStyle(DRIVE_COLOURS.vergeEdge, 1);
  gfx.fillRect(geo.roadLeft - 10, 0, 10, height);
  gfx.fillRect(geo.roadLeft + geo.roadWidth, 0, 10, height);

  // Road surface + edge lines.
  gfx.fillStyle(surf.road, 1);
  gfx.fillRect(geo.roadLeft, 0, geo.roadWidth, height);
  gfx.fillStyle(surf.edge, 0.9);
  gfx.fillRect(geo.roadLeft + 3, 0, 3, height);
  gfx.fillRect(geo.roadLeft + geo.roadWidth - 6, 0, 3, height);

  // Same-direction dashed dividers (scroll with the drive).
  const dashLen = 64, dashGap = 34, pitch = dashLen + dashGap, dashW = 6;
  const offset = ((scrollY % pitch) + pitch) % pitch;
  gfx.fillStyle(surf.dash, 0.95);
  const drawDashes = (x: number) => {
    for (let y = offset - pitch; y < height; y += pitch) gfx.fillRect(x - dashW / 2, y, dashW, dashLen);
  };
  for (let i = 1; i < geo.playerLanes; i++) drawDashes(geo.roadLeft + lw * i);
  const oncomingStart = geo.playerLanes + geo.medianUnits;
  for (let j = 1; j < config.oncomingLanes; j++) drawDashes(geo.roadLeft + lw * (oncomingStart + j));

  // The divide between the two directions.
  if (config.oncomingLanes > 0) {
    const boundary = geo.roadLeft + lw * geo.playerLanes;
    if (config.divider === 'reservation') {
      gfx.fillStyle(DRIVE_COLOURS.reservation, 1);
      gfx.fillRect(boundary, 0, lw * geo.medianUnits, height);
      gfx.fillStyle(surf.edge, 0.85);
      gfx.fillRect(boundary - 2, 0, 3, height);
      gfx.fillRect(boundary + lw * geo.medianUnits - 1, 0, 3, height);
    } else {
      // Solid centre line — the "don't cross" divide (kept unbroken vs the
      // dashed same-direction dividers a kid may cross).
      gfx.fillStyle(surf.dash, 0.95);
      gfx.fillRect(boundary - 2, 0, 4, height);
    }
  }
}

/**
 * Draw a simple top-down van into a Graphics object, centred on (0,0) so the
 * caller can position/rotate/tween it via the object transform. Placeholder
 * art — painted top-down vehicle sprites are later polish. `bodyColour` lets
 * traffic reuse the same base shape.
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
  const wheelW = Math.max(4, w * 0.11);
  const wheelH = h * 0.18;
  gfx.fillRoundedRect(-hw - wheelW + 2, -hh + h * 0.2, wheelW, wheelH, 2);
  gfx.fillRoundedRect(-hw - wheelW + 2, hh - h * 0.2 - wheelH, wheelW, wheelH, 2);
  gfx.fillRoundedRect(hw - 2, -hh + h * 0.2, wheelW, wheelH, 2);
  gfx.fillRoundedRect(hw - 2, hh - h * 0.2 - wheelH, wheelW, wheelH, 2);
}

/**
 * Draw a decorative traffic vehicle of a given kind, centred on (0,0), facing
 * up. Distinct silhouettes so a child can tell a tractor from a truck from a
 * motorbike at a glance.
 */
export function drawTrafficVehicle(
  gfx: Phaser.GameObjects.Graphics,
  kind: TrafficKind,
  w: number,
  h: number,
  colour: number,
): void {
  gfx.clear();
  const hw = w / 2;
  const hh = h / 2;

  // Shared shadow.
  gfx.fillStyle(0x000000, 0.15);
  gfx.fillRoundedRect(-hw + 3, -hh + 5, w, h, 8);

  switch (kind) {
    case 'motorbike': {
      // Thin body + a rider blob.
      gfx.fillStyle(colour, 1);
      gfx.fillRoundedRect(-hw, -hh, w, h, w / 2);
      gfx.fillStyle(0x8a5a3a, 1); // rider
      gfx.fillCircle(0, 0, w * 0.7);
      break;
    }
    case 'tractor': {
      // Green cab up front, big rear wheels, a yellow hay bale behind.
      gfx.fillStyle(colour, 1);
      gfx.fillRoundedRect(-hw * 0.7, -hh, w * 0.7, h * 0.55, 6); // cab/engine
      gfx.fillStyle(0x2b2b2b, 1); // big rear wheels
      gfx.fillRoundedRect(-hw - 3, hh - h * 0.42, w * 0.22, h * 0.4, 3);
      gfx.fillRoundedRect(hw - w * 0.22 + 3, hh - h * 0.42, w * 0.22, h * 0.4, 3);
      gfx.fillStyle(0xe6c65a, 1); // hay bale
      gfx.fillRoundedRect(-hw * 0.55, hh - h * 0.42, w * 0.55, h * 0.4, 5);
      gfx.lineStyle(1.5, 0xbfa23f, 0.8);
      gfx.strokeRoundedRect(-hw * 0.55, hh - h * 0.42, w * 0.55, h * 0.4, 5);
      break;
    }
    case 'truck': {
      // Cab + a long trailer with a seam.
      gfx.fillStyle(0x4a4a52, 1); // cab
      gfx.fillRoundedRect(-hw, -hh, w, h * 0.24, 6);
      gfx.fillStyle(colour, 1); // trailer
      gfx.fillRoundedRect(-hw, -hh + h * 0.26, w, h * 0.72, 5);
      gfx.lineStyle(2, 0x000000, 0.15);
      gfx.strokeRoundedRect(-hw, -hh + h * 0.26, w, h * 0.72, 5);
      break;
    }
    case 'pickup': {
      // Cab up front, open bed behind.
      gfx.fillStyle(colour, 1);
      gfx.fillRoundedRect(-hw, -hh, w, h, 8);
      gfx.fillStyle(0x000000, 0.18); // bed
      gfx.fillRoundedRect(-hw + 5, 0, w - 10, hh - 6, 5);
      gfx.fillStyle(0xbfe6f2, 0.9); // windscreen
      gfx.fillRoundedRect(-hw + 6, -hh + 6, w - 12, h * 0.2, 5);
      break;
    }
    case 'emergency': {
      // Car body + a blue/red light bar on the roof.
      gfx.fillStyle(colour, 1);
      gfx.fillRoundedRect(-hw, -hh, w, h, 9);
      gfx.fillStyle(0xffffff, 0.9);
      gfx.fillRoundedRect(-hw + 6, -hh + 6, w - 12, h * 0.2, 5); // windscreen
      gfx.fillStyle(0x2233cc, 1);
      gfx.fillRoundedRect(-hw + 5, -2, (w - 10) / 2, 8, 2); // blue
      gfx.fillStyle(0xcc2222, 1);
      gfx.fillRoundedRect(0, -2, (w - 10) / 2, 8, 2); // red
      break;
    }
    case 'car':
    default: {
      gfx.fillStyle(colour, 1);
      gfx.fillRoundedRect(-hw, -hh, w, h, 9);
      gfx.fillStyle(0xffffff, 0.12);
      gfx.fillRoundedRect(-hw + 4, -hh + 4, w - 8, h * 0.4, 7);
      gfx.fillStyle(0xbfe6f2, 0.9);
      gfx.fillRoundedRect(-hw + 6, -hh + 6, w - 12, h * 0.22, 5);
      break;
    }
  }
}

/**
 * Draw a roadside scenery item (tree or hedge), centred on (0,0). Simple
 * painterly blobs for a first cut — richer per-location sets come with the
 * road-system slice.
 */
export function drawSceneryItem(
  gfx: Phaser.GameObjects.Graphics,
  kind: 'tree' | 'hedge',
  size: number,
): void {
  gfx.clear();
  if (kind === 'tree') {
    gfx.fillStyle(0x000000, 0.12);
    gfx.fillCircle(2, 4, size);
    gfx.fillStyle(DRIVE_COLOURS.treeTrunk, 1);
    gfx.fillRect(-size * 0.12, 0, size * 0.24, size * 0.5);
    gfx.fillStyle(DRIVE_COLOURS.treeCanopy, 1);
    gfx.fillCircle(0, 0, size);
    gfx.fillStyle(DRIVE_COLOURS.treeCanopyLight, 0.7);
    gfx.fillCircle(-size * 0.3, -size * 0.3, size * 0.5);
  } else {
    // Hedge — a soft rounded green block.
    gfx.fillStyle(0x000000, 0.1);
    gfx.fillRoundedRect(-size + 2, -size * 0.5 + 3, size * 2, size, 6);
    gfx.fillStyle(DRIVE_COLOURS.hedge, 1);
    gfx.fillRoundedRect(-size, -size * 0.5, size * 2, size, 6);
    gfx.fillStyle(DRIVE_COLOURS.treeCanopyLight, 0.4);
    gfx.fillRoundedRect(-size, -size * 0.5, size * 2, size * 0.4, 6);
  }
}
