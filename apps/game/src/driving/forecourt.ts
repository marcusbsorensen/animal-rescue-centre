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
  /**
   * Draw the A.R.C. building behind the tarmac. Default true.
   *
   * False for a screen whose content needs the height the building
   * would stand in. The picker has a shallow band of bays and room for
   * it above them; the loading screen has one vehicle filling the
   * frame, and the building it had room for measured about 130px —
   * which read as a sticker on the slab's top edge rather than as a
   * building standing behind one.
   */
  building?: boolean;
}

export interface Forecourt {
  /** The tarmac, in screen coordinates. */
  apron: { x: number; y: number; w: number; h: number };
  /** Top edge of the exit road along the bottom. */
  roadY: number;
}

/** The gravel the whole site stands on, tiled over the frame. */
export function drawGravel(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  height: number,
): void {
  if (scene.textures.exists('site-gravel')) {
    container.add(scene.add.tileSprite(0, 0, width, height, 'site-gravel').setOrigin(0));
  } else {
    container.add(scene.add.rectangle(width / 2, height / 2, width, height, 0xcbb79a));
  }
}

/**
 * A slab of tarmac, worn the way a car park is worn, with a pale kerb
 * along its far edge.
 *
 * Its own function because two screens lay tarmac at wildly different
 * scales — the picker a shallow band of five bays, the loading screen
 * one bay round a vehicle drawn ten times the size — and the thing that
 * has to stay the same between them is the *surface*, not the rectangle.
 *
 * One flat near-black rectangle is a swatch, not a surface, and it is
 * what made the loading screen read as a UI panel with a van hanging
 * off it. Three cheap things fix that and none of them moves: a warmer,
 * lighter base so it is asphalt rather than a hole; a handful of patches
 * at fixed fractions of the slab, so the ground is worn unevenly the way
 * a car park is; and a pale kerb along the far edge, which is the line
 * that says this is ground seen from above rather than a shape lying on
 * top of it.
 */
export function drawApron(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  rect: { x: number; y: number; w: number; h: number },
  radius = 18,
): void {
  const { x, y, w, h } = rect;
  const slab = scene.add.graphics();
  slab.fillStyle(0x45434a, 1);
  slab.fillRoundedRect(x, y, w, h, radius);
  for (const p of TARMAC_PATCHES) {
    slab.fillStyle(p.light ? 0xffffff : 0x000000, p.alpha);
    slab.fillEllipse(x + w * p.u, y + h * p.v, w * p.w, h * p.h);
  }
  // The kerb: a pale lip along the top, and a thin shadow under it.
  slab.fillStyle(0xcdc0a6, 0.5);
  slab.fillRoundedRect(x, y, w, 4, 2);
  slab.fillStyle(0x000000, 0.22);
  slab.fillRect(x + 6, y + 4, w - 12, 3);
  container.add(slab);
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
  drawGravel(scene, container, width, height);

  // The building at the back of its own forecourt, filling the band
  // between the title and the tarmac rather than a fixed fraction of the
  // viewport — which on a landscape phone drew it tiny in the middle of
  // an empty gravel field and on a desktop at nearly half the screen.
  //
  // A caller with no room for it says so and gets none. A building drawn
  // small enough to be wrong reads as a sticker, and a sticker of the
  // rescue centre is worse than gravel.
  if ((options.building ?? true) && scene.textures.exists('site-arc-building')) {
    const base = options.buildingBase ?? apronTop + apronH * 0.3;
    const target = Math.max(0, Math.min(base - contentTop, width * 0.46));
    const cx = options.buildingCx ?? width / 2;
    const b = scene.add.image(cx, base - target / 2, 'site-arc-building').setOrigin(0.5);
    b.setDisplaySize(target, target);
    container.add(b);
  }

  const areaW = options.apronW ?? Math.min(width * 0.92, 1080);
  const left = options.apronX ?? (width - areaW) / 2;

  // ── The tarmac ──
  drawApron(scene, container, {
    x: left - 8, y: apronTop - 8, w: areaW + 16, h: apronH + 16,
  });

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
 * Worn patches on the tarmac, as fractions of the slab.
 *
 * Fixed rather than random: the screen redraws after every tap, and
 * ground that reshuffled itself each time would be motion — the one
 * thing this game will not spend on decoration. Nine soft ellipses,
 * placed so none of them lands dead centre where the vehicle sits.
 */
const TARMAC_PATCHES: Array<{ u: number; v: number; w: number; h: number; light: boolean; alpha: number }> = [
  { u: 0.18, v: 0.14, w: 0.44, h: 0.16, light: true, alpha: 0.05 },
  { u: 0.82, v: 0.22, w: 0.38, h: 0.13, light: true, alpha: 0.04 },
  { u: 0.30, v: 0.52, w: 0.50, h: 0.20, light: false, alpha: 0.06 },
  { u: 0.86, v: 0.63, w: 0.34, h: 0.17, light: false, alpha: 0.05 },
  { u: 0.12, v: 0.82, w: 0.40, h: 0.15, light: true, alpha: 0.04 },
  { u: 0.68, v: 0.88, w: 0.46, h: 0.13, light: false, alpha: 0.05 },
  { u: 0.50, v: 0.05, w: 0.30, h: 0.08, light: false, alpha: 0.05 },
  { u: 0.05, v: 0.44, w: 0.22, h: 0.26, light: false, alpha: 0.04 },
  { u: 0.95, v: 0.42, w: 0.22, h: 0.24, light: true, alpha: 0.04 },
];

/**
 * The shadow a vehicle casts on the tarmac it is standing on.
 *
 * A top-down sprite dropped onto a flat fill floats; a dark pool under
 * it, offset the way every other shadow in the chrome is offset, puts
 * it on the ground. It is what replaced the painted bay lines: two
 * cream rules down the sides of one vehicle read as guides somebody had
 * left in rather than as paint, and the picker only gets away with them
 * because it has five bays for them to divide.
 *
 * Tight to the silhouette rather than generous. An ellipse the size of
 * the whole sprite on a 470px-tall trike is a vignette over half the
 * screen; one at seven tenths of its width sits under the wheels where
 * a shadow belongs. Drawn before the vehicle, never animated.
 */
export function drawVehicleShadow(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  box: { cx: number; cy: number; w: number; h: number },
): void {
  const gfx = scene.add.graphics();
  gfx.fillStyle(0x000000, 0.09);
  gfx.fillEllipse(box.cx + 11, box.cy + 13, box.w * 0.82, box.h * 0.9);
  gfx.fillStyle(0x000000, 0.13);
  gfx.fillEllipse(box.cx + 6, box.cy + 7, box.w * 0.7, box.h * 0.84);
  container.add(gfx);
}
