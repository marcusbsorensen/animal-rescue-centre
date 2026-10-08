/**
 * forecourt.ts — the A.R.C. car park, drawn once.
 *
 * The building on gravel, the tarmac apron in front of it and the exit
 * road along the bottom are the *place* two phases of a drive happen in:
 * the vehicle picker, and the loading screen a moment later. They were
 * one painting written twice, which is how two screens standing in the
 * same spot came to disagree about where the ground was — the loading
 * screen had gravel and nothing else, no building, no tarmac, no road.
 *
 * So the picker's rendering moved here whole and the loading screen
 * calls it too. Each phase passes the band its own content needs; this
 * decides where the ground goes and hands back the geometry, so a caller
 * can stand a vehicle on the apron without re-deriving it.
 */

import Phaser from 'phaser';

export interface ForecourtOptions {
  width: number;
  height: number;
  /** The first y below the title plate — the building is sized from it. */
  contentTop: number;
  /** Top edge of the tarmac apron. */
  apronTop: number;
  /** Height of the tarmac apron. */
  apronH: number;
  /**
   * Where the building's ground line sits. It runs *under* the tarmac —
   * the slab is drawn after it and crops the building's own base, which
   * is what the far edge of a car park does to the building behind it.
   *
   * Defaults to 30% into the apron, which is what the picker wants with
   * its shallow band of bays. A screen with a tall apron passes a line
   * just inside its top edge instead, or the building ends up standing
   * in the middle of the tarmac.
   */
  buildingBase?: number;
  /** Apron width; defaults to the picker's 92% of the viewport, capped. */
  apronW?: number;
  /** Apron left edge; defaults to centred, which is what the picker wants. */
  apronX?: number;
  /**
   * Where the building stands, left to right. Defaults to the middle of
   * the viewport.
   *
   * A screen whose apron is one bay off to one side wants the building
   * over that bay — a van parked in front of the rescue centre — rather
   * than in the middle, where the slab's corner takes a bite out of it.
   */
  buildingCx?: number;
}

export interface Forecourt {
  /** The tarmac, in screen coordinates. */
  apron: { x: number; y: number; w: number; h: number };
  /** Top edge of the exit road along the bottom. */
  roadY: number;
}

/**
 * Draw gravel, the A.R.C. building, the tarmac apron and the exit road
 * into `container`, back to front. Returns where they landed.
 */
export function drawForecourt(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  options: ForecourtOptions,
): Forecourt {
  const { width, height, contentTop, apronTop, apronH } = options;

  // Gravel, everywhere.
  if (scene.textures.exists('site-gravel')) {
    container.add(scene.add.tileSprite(0, 0, width, height, 'site-gravel').setOrigin(0));
  } else {
    container.add(scene.add.rectangle(width / 2, height / 2, width, height, 0xcbb79a));
  }

  // The building at the back of its own forecourt, filling the band
  // between the title and the tarmac rather than a fixed fraction of the
  // viewport — which on a landscape phone drew it tiny in the middle of
  // an empty gravel field and on a desktop at nearly half the screen.
  if (scene.textures.exists('site-arc-building')) {
    const base = options.buildingBase ?? apronTop + apronH * 0.3;
    const target = Math.max(0, Math.min(base - contentTop, width * 0.46));
    const cx = options.buildingCx ?? width / 2;
    const b = scene.add.image(cx, base - target / 2, 'site-arc-building').setOrigin(0.5);
    b.setDisplaySize(target, target);
    container.add(b);
  }

  const areaW = options.apronW ?? Math.min(width * 0.92, 1080);
  const left = options.apronX ?? (width - areaW) / 2;

  const slab = scene.add.graphics();
  slab.fillStyle(0x39383a, 1);
  slab.fillRoundedRect(left - 8, apronTop - 8, areaW + 16, apronH + 16, 12);
  container.add(slab);

  // Exit road along the bottom.
  const roadY = height * 0.93;
  const road = scene.add.graphics();
  road.fillStyle(0x6b6f76, 1);
  road.fillRect(0, roadY, width, height - roadY);
  road.fillStyle(0xfdf6e3, 0.9);
  for (let rx = 10; rx < width; rx += 54) {
    road.fillRect(rx, roadY + (height - roadY) / 2 - 2, 30, 4);
  }
  container.add(road);

  return { apron: { x: left, y: apronTop, w: areaW, h: apronH }, roadY };
}

/**
 * A painted parking bay on the tarmac — two side lines and a stop bar
 * across the back, in the cream the picker already paints its bay
 * dividers in.
 *
 * The picker's bays are divided by single lines because they sit in a
 * row; a screen showing one vehicle draws the whole bay round it, which
 * is what says "this van is parked at the rescue centre" rather than
 * "this van is a picture of a van".
 */
export function drawParkingBay(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  box: { x: number; y: number; w: number; h: number },
): void {
  const gfx = scene.add.graphics();
  gfx.fillStyle(0xf2ead6, 0.8);
  gfx.fillRect(box.x, box.y, 4, box.h);
  gfx.fillRect(box.x + box.w - 4, box.y, 4, box.h);
  gfx.fillRect(box.x, box.y, box.w, 4);
  container.add(gfx);
}
