/**
 * car-park.ts — one bay of the A.R.C. car park, seen from above, with the
 * vehicle being loaded standing in it.
 *
 * **One vehicle, zoomed in.** This was the picker's whole row at a larger
 * scale: five bays, the chosen vehicle in the middle and her neighbours
 * either side, tinted back and cut off by the frame. Marcus, 9 October
 * 2026: "We don't need to show other vehicles in the parking lot. We can
 * just zoom in on the one that is currently being loaded." So the other
 * four are gone, and with them the far kerb, the strip of gravel beyond
 * it and the road. What is left is what is there when you stand over one
 * space: tarmac, the white lines either side of it, the vehicle, and the
 * shadow it throws.
 *
 * **Everything in it is in one projection, and that is the rule this
 * file is kept to.** `docs/manus-sprite-rules.md` Rule 8: the game stays
 * inside its simulated 3D world, nothing is shown cropped, and the
 * scenes are real scenes with real interactions in them. The ground is
 * seen from above, the vehicle is seen from above, the shadow is the
 * vehicle's own outline thrown to one side, and the bay lines are
 * measured in metres off the vehicle's own width. There is no building
 * here for the same reason as before — the only A.R.C. building the
 * game owns is a front elevation, and it meets this tarmac along a
 * horizontal line, which reads as a building sunk into the car park —
 * and there is no road, because at this zoom one lane is wider than the
 * viewport is tall.
 *
 * **Nothing is cropped.** The vehicle is fitted to the whole column, less
 * a margin of ground fore and aft, and is parked in the middle of it.
 * `VEHICLE_VISIBLE_FRAC` is 1.
 *
 * **The ground is allowed to be taller than the column.** The column is
 * what the loading view's layout leaves between the title and the tray —
 * 335px at 820x620 — and Spark's bays need her drawn 361px tall at the
 * 40px tap floor, 387px with the ground she is owed. The floor does not
 * move, so the ground does: where a vehicle will not stand in the column
 * with a margin of tarmac in front of her, she is parked with that margin
 * and her rear rises above the top of the column, into the band beside
 * the Back button and the title, and the tarmac begins just above her
 * head line. Her rear is the narrow end of her and both pieces of
 * chrome stand clear of it at every width the screen is composed for
 * (a test holds that), so nothing is hidden behind them. `PARK_CEILING`
 * is the highest it may rise.
 *
 * What is left is a vehicle that does not stand whole in the ground the
 * screen has above the tray, and that is the landscape phone, where the
 * column is 145px and every vehicle needs 255 to 361: the bays are
 * whole, the front runs off, and the layout is where it is fixed. See
 * `.claude/notes/car-park-one-world.md`.
 *
 * **Arrows either side move to the next bay.** Fewer spaces to the left,
 * more to the right, in the order `@arc/game-logic`'s `vehicleNeighbours`
 * gives, and dimmed at the ends rather than wrapping so a child cannot
 * lose her place. The arrows report the choice through `onVehicleChange`
 * and change nothing themselves: what happens to the animals already
 * aboard is `changeVehicle`'s to decide, and redrawing is the owning
 * scene's. See `CarParkOptions.onVehicleChange`.
 *
 * Nothing here moves, flashes or is on a timer.
 */

import Phaser from 'phaser';
import { VEHICLE_DEFS, vehicleNeighbours, type VehicleType } from '@arc/game-logic';
import { createChromePlate } from '../ui/UIButton';
import { CHROME, FONTS, MIN_FONT, MIN_TAP, SAFE_MARGIN, TEXT_RESOLUTION, hexNum } from '../ui/constants';
import { CAR_PARK_VEHICLE_KEY, drawApron, drawGravel } from './forecourt';
import { VEHICLE_SPRITE, VEHICLE_WIDTH_M, bayWidthM } from './fleet-art';

export interface Rect { x: number; y: number; w: number; h: number }

/** A painted bay line is 100mm of white thermoplastic. */
const BAY_LINE_M = 0.1;
const BAY_LINE = 0xf2ead6;
const BAY_LINE_ALPHA = 0.8;

/**
 * The ground the vehicle keeps clear of the frame, fore and aft, as the
 * two margins together.
 *
 * Exported because the caller has to know it *before* it measures the
 * vehicle: it is taken off the column, the vehicle is fitted to what is
 * left, and then this module parks her in the middle of the column. Two
 * readings of one number would be the vehicle and the ground disagreeing
 * about where the car park starts.
 *
 * **It used to be a 42px strip of gravel above a far kerb, paid for in
 * bumper** — the vehicle was sized as if the column were taller and the
 * kerb cut her nose off. It is now ground on both sides of her and is
 * paid for in nothing but a few pixels of vehicle: 4% of the column a
 * side, between 8 and 20px, which is enough tarmac that a bumper is not
 * touching the edge of the picture and little enough that the bays stay
 * as large as the layout allows.
 *
 * A column too short to spare it gets none, and the vehicle has every
 * pixel — on the landscape phone the whole column is shorter than one
 * van, and a vehicle is worth more than a margin.
 */
export function carParkBackdropH(columnH: number): number {
  if (columnH < 210) return 0;
  return 2 * Math.max(8, Math.min(20, Math.round(columnH * 0.04)));
}

/**
 * The highest the vehicle's rear may stand, as a y on the screen: the
 * `SAFE_MARGIN` the chrome keeps from every edge.
 */
export const PARK_CEILING = SAFE_MARGIN;

/**
 * Where the vehicle's rear sits, in screen coordinates.
 *
 * **In the middle of the ground when she has room**, so there is as much
 * tarmac in front of her as behind and neither end of her is near the
 * edge of the picture. **When she has not**, the ground in front of her
 * is the one that is kept — the margin below her nose — and her rear
 * rises above the column to make it, as far as `PARK_CEILING`. Where
 * even that is not enough she stands at the ceiling, her bays are whole,
 * and it is the front of her that runs out of ground.
 *
 * A pure function of the column and her height so a test can hold the
 * promise at every viewport — the loading view reads the answer back
 * from `CarPark.parkTop` and never works it out for itself.
 */
export function vehicleParkTop(column: Rect, vehicleH: number | undefined): number {
  const margin = carParkBackdropH(column.h) / 2;
  if (vehicleH === undefined) return column.y + margin;
  const spare = (column.h - vehicleH) / 2;
  // One pixel of give: a vehicle fitted to the box the layout hands out
  // comes back within a pixel of it, and 12.9 is not a reason to move her.
  if (spare >= margin - 1) return column.y + spare;
  return Math.max(PARK_CEILING, column.y + column.h - margin - vehicleH);
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
  /**
   * The child chose another bay. Passing this draws the arrows; omitting
   * it draws none, so a screen that has not been wired for changing
   * vehicle shows no control that does nothing.
   *
   * `to` is the vehicle in the next bay and `direction` is which arrow
   * it was — `fewer` the left one, `more` the right. **Nothing has been
   * changed when this fires.** The owner decides what the move means: it
   * should run `changeVehicle(session, to)` from `@arc/game-logic` so
   * animals who no longer fit go back to the waiting area and are named,
   * keep its own record of the vehicle, and redraw the screen, which
   * calls `drawCarPark` again with `chosen: to`. The arrows are rebuilt
   * on every redraw, so there is nothing to tear down.
   */
  onVehicleChange?: (to: VehicleType, direction: VehicleDirection) => void;
  /**
   * The player's level, so the arrows skip vehicles she has not unlocked.
   * Omit to offer the whole fleet.
   */
  playerLevel?: number;
}

/** Which arrow: the one to the bay with fewer spaces, or the one with more. */
export type VehicleDirection = 'fewer' | 'more';

export interface CarPark {
  /** The chosen vehicle's bay, in screen coordinates. */
  bay: Rect;
  /**
   * Where the vehicle's rear sits: the top edge of the vehicle, in
   * screen coordinates. The vehicle is centred in the column when it
   * fits, so this is not a fixed line — it is wherever leaves the same
   * ground in front of her as behind.
   */
  parkTop: number;
  /** Pixels to the metre, for anything else that wants to be measured. */
  pxPerMetre: number;
  /**
   * Where the ground ends — the line a vehicle is cut off at.
   *
   * Two lines past the bottom of the vehicle when she fits, so she is
   * never touched, and the bottom of the tarmac when she does not.
   */
  kerbY: number;
  /** The vehicle's drawn height, when its sprite is loaded. */
  vehicleH?: number;
  /** The rectangle the vehicle will be drawn in. */
  vehicleRect: Rect;
}

/**
 * Draw the car park into `container`, back to front, and say where the
 * chosen vehicle's bay landed.
 *
 * Ground, tarmac, bay lines and — when `onVehicleChange` is given — the
 * arrows. The vehicle itself and its shadow are the caller's, drawn on
 * top; `drawVehicleShadow` finds out which vehicle it is shading from a
 * note this leaves on the container.
 */
export function drawCarPark(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  options: CarParkOptions,
): CarPark {
  const { width, height, column, chosen, spriteW } = options;

  drawGravel(scene, container, width, height);

  const pxPerMetre = spriteW / VEHICLE_WIDTH_M[chosen];

  // How tall she is drawn, if the painting is there to ask.
  const key = VEHICLE_SPRITE[chosen];
  let vehicleH: number | undefined;
  if (scene.textures.exists(key)) {
    const source = scene.textures.get(key).getSourceImage();
    vehicleH = spriteW * (source.height / source.width);
  }

  const groundBottom = column.y + column.h;
  const margin = carParkBackdropH(column.h) / 2;
  const parkTop = vehicleParkTop(column, vehicleH);
  // She is whole where her nose is on the ground.
  const whole = vehicleH !== undefined && parkTop + vehicleH <= groundBottom + 0.5;

  // The chosen vehicle's bay, centred in her column.
  const bayW = bayWidthM(chosen) * pxPerMetre;
  const bayCx = column.x + column.w / 2;
  const lineW = Math.max(3, Math.min(10, BAY_LINE_M * pxPerMetre));
  const headY = parkTop - lineW - 3;
  // The tarmac begins just above the head line, which is the column's top
  // unless she has risen above it.
  const groundTop = Math.min(column.y, headY - 6);
  const bay: Rect = { x: bayCx - bayW / 2, y: groundTop, w: bayW, h: groundBottom - groundTop };

  // ── The tarmac ──
  //
  // It runs off the left edge of the frame and stops at the column's
  // right, because the car park is bigger than the screen and the chrome
  // column is paper laid over a place rather than a panel on a black
  // field. It has no kerb: at this zoom the lot carries on past the top
  // and bottom of the picture, and a kerb would be a decoration for an
  // edge that is not on screen.
  drawApron(scene, container, {
    x: -24,
    y: groundTop,
    w: column.x + column.w + 24,
    h: groundBottom - groundTop,
  }, 8, { kerb: false });

  // ── The bay ──
  //
  // Two side lines the full height of the ground and a head line behind
  // the vehicle's rear, in metres: 100mm of paint, and a bay as wide as
  // `bayWidthM` says this vehicle needs.
  const lines = scene.add.graphics();
  lines.fillStyle(BAY_LINE, BAY_LINE_ALPHA);
  lines.fillRect(bay.x - lineW / 2, headY, lineW, groundBottom - headY);
  lines.fillRect(bay.x + bay.w - lineW / 2, headY, lineW, groundBottom - headY);
  lines.fillRect(bay.x - lineW / 2, headY, bay.w + lineW, lineW);
  container.add(lines);

  const vehicleRect: Rect = {
    x: bayCx - spriteW / 2,
    y: parkTop,
    w: spriteW,
    h: vehicleH ?? column.h - 2 * margin,
  };

  // The shadow, one call later, asks the container who is standing in
  // it. The column and the rectangle go with it so a screenshot tool can
  // draw the arrows from exactly the numbers this used.
  if (vehicleH !== undefined) {
    container.setData(CAR_PARK_VEHICLE_KEY, { key, w: spriteW, column, vehicleRect });
  }

  if (options.onVehicleChange) {
    drawVehicleArrows(scene, container, {
      chosen,
      column,
      vehicleRect,
      onVehicleChange: options.onVehicleChange,
      playerLevel: options.playerLevel,
    });
  }

  return {
    bay,
    parkTop,
    pxPerMetre,
    kerbY: whole ? Math.max(groundBottom, parkTop + (vehicleH ?? 0)) + 2 : groundBottom,
    vehicleH,
    vehicleRect,
  };
}

// ── The arrows ───────────────────────────────────────────────

/**
 * How big an arrow is.
 *
 * Generous on purpose: Marcus asked for it, and it is the one control on
 * this screen a child uses without being told what it does. 104x112 is
 * more than twice `MIN_TAP` each way, and the whole plate answers a tap
 * — the chevron, the name and the number of spaces — rather than a
 * glyph-sized corner of it.
 */
export const ARROW_W = 104;
export const ARROW_H = 112;
/**
 * A dimmed arrow's paper and ink: 5.0:1, which clears the 4.5 text floor.
 * Exported so a test can hold the pair to it.
 */
export const ARROW_DIMMED_PAPER = 0xd9d3c5;
export const ARROW_DIMMED_INK = '#5a5448';
const DIMMED_INK = ARROW_DIMMED_INK;
/** The air between an arrow and the vehicle beside it. */
const ARROW_GAP = 10;

/**
 * Where the two arrows sit: one in the ground either side of the
 * vehicle, in the middle of whatever room there is, level with the
 * middle of her.
 *
 * Pure arithmetic, so a test can hold the two promises that matter at
 * every viewport the screen is composed for: the arrows are inside the
 * column — the reading panel is the next thing along, and a control on
 * it would take its taps — and they do not touch the vehicle.
 *
 * Where a column is too narrow for both promises the arrow stays in the
 * column and overlaps the vehicle's paint, which is the lesser fault: a
 * control that has gone missing cannot be used at all.
 */
export function arrowLayout(column: Rect, vehicle: Rect): Record<VehicleDirection, Rect> {
  const w = ARROW_W;
  const h = ARROW_H;
  const left = Math.max(column.x, SAFE_MARGIN);
  const right = column.x + column.w;
  // `lo` and `hi` are the nearest and furthest the arrow's centre may be
  // while clear of the vehicle and inside the column. Where there is no
  // such place (`hi < lo`) the column wins: the arrow goes to the column's
  // own edge, and it is the vehicle's paint it covers.
  const place = (lo: number, hi: number, wanted: number, edge: number) =>
    hi < lo ? edge : Math.max(lo, Math.min(hi, wanted));

  const vehicleRight = vehicle.x + vehicle.w;
  const fewerCx = place(left + w / 2, vehicle.x - w / 2 - ARROW_GAP, (left + vehicle.x) / 2, left + w / 2);
  const moreCx = place(
    vehicleRight + w / 2 + ARROW_GAP, right - w / 2, (vehicleRight + right) / 2, right - w / 2,
  );

  // Level with the middle of the part of the vehicle that is on screen.
  const bottom = column.y + column.h;
  const visibleMid = vehicle.y + Math.min(vehicle.h, bottom - vehicle.y) / 2;
  const cy = column.h < h + 8
    ? column.y + column.h / 2
    : Math.max(column.y + h / 2 + 4, Math.min(bottom - h / 2 - 4, visibleMid));

  return {
    fewer: { x: fewerCx - w / 2, y: cy - h / 2, w, h },
    more: { x: moreCx - w / 2, y: cy - h / 2, w, h },
  };
}

export interface VehicleArrowsOptions {
  chosen: VehicleType;
  /** The column the car park fills. */
  column: Rect;
  /** Where the vehicle is drawn, so the arrows can stand clear of her. */
  vehicleRect: Rect;
  /** See `CarParkOptions.onVehicleChange`. */
  onVehicleChange: (to: VehicleType, direction: VehicleDirection) => void;
  playerLevel?: number;
  /**
   * Answer the left and right arrow keys as well. Default true.
   *
   * The keys are listened for only while the arrows are on screen and
   * are let go when they are destroyed — the owning scene clears its
   * container on every redraw, which destroys them — so a redraw does
   * not leave a listener behind to fire twice.
   */
  keyboard?: boolean;
}

/**
 * The two arrows: the bay with fewer spaces to the left, the bay with
 * more to the right.
 *
 * **A plate says where it goes.** Each shows the next vehicle's name and
 * how many animals it holds, so a child can see what pressing it will
 * give her before she presses it — she is choosing a size, and the
 * number is the size. At either end the arrow is dimmed, not hidden, and
 * says `Smallest` or `Largest`: the layout does not shift, nothing
 * wraps, and a dimmed control that explains itself is not a broken one.
 *
 * **The tap target is the whole plate**, 104x112, named
 * `vehicle-arrow-fewer` and `vehicle-arrow-more` so a test or a
 * screenshot tool can find them by name.
 */
export function drawVehicleArrows(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  options: VehicleArrowsOptions,
): Partial<Record<VehicleDirection, Phaser.GameObjects.Container>> {
  const { chosen, column, vehicleRect, onVehicleChange } = options;
  const next = vehicleNeighbours(chosen, options.playerLevel);
  const layout = arrowLayout(column, vehicleRect);
  const made: Partial<Record<VehicleDirection, Phaser.GameObjects.Container>> = {};
  const keys: Array<() => void> = [];

  for (const direction of ['fewer', 'more'] as const) {
    const target = next[direction];
    const rect = layout[direction];
    const plate = buildArrow(scene, direction, target, rect, onVehicleChange);
    container.add(plate.container);
    made[direction] = plate.container;

    if (target && (options.keyboard ?? true) && scene.input.keyboard) {
      const event = direction === 'fewer' ? 'keydown-LEFT' : 'keydown-RIGHT';
      const handler = (e: KeyboardEvent) => {
        // A held key would walk the whole fleet in half a second.
        if (!e.repeat) plate.activate();
      };
      scene.input.keyboard.on(event, handler);
      keys.push(() => scene.input.keyboard?.off(event, handler));
    }
  }

  // Let the keys go when the arrows do. Either one is enough: the
  // owner's `removeAll(true)` destroys both, and the scene shutting
  // down destroys the container they are in.
  const release = () => { keys.splice(0).forEach((off) => off()); };
  for (const arrow of Object.values(made)) arrow.once(Phaser.GameObjects.Events.DESTROY, release);

  return made;
}

/** One arrow plate: chevron, name, spaces, and a hit area the size of the plate. */
function buildArrow(
  scene: Phaser.Scene,
  direction: VehicleDirection,
  target: VehicleType | null,
  rect: Rect,
  onChange: (to: VehicleType, direction: VehicleDirection) => void,
): { container: Phaser.GameObjects.Container; activate: () => void } {
  const enabled = target !== null;
  const ink = hexNum(CHROME.ink);
  // A dimmed arrow is paper in a quieter tone with no shadow, not the
  // same plate turned translucent: a translucent one shows the painted
  // bay line through it, and a line through a control reads as a crack.
  const plate = createChromePlate(scene, 0, 0, rect.w, rect.h, enabled
    ? { radius: 20 }
    : { radius: 20, shadow: false, tint: { fill: ARROW_DIMMED_PAPER, stroke: 0xaaa28f } });

  // The chevron: two rounded bars meeting at the tip. Drawn, not set in
  // a font, so it is the same shape on every device.
  const sign = direction === 'more' ? 1 : -1;
  const chevron = scene.add.graphics();
  chevron.fillStyle(enabled ? ink : 0x8a8374, 1);
  const barL = 26;
  const barT = 9;
  const cy = -rect.h / 2 + 36;
  for (const turn of [-1, 1]) {
    chevron.save();
    // The tip is 5px past the middle in the direction of travel and each
    // bar's centre is 9px back along its own arm from it.
    chevron.translateCanvas(-sign * 4, cy + turn * 9);
    chevron.rotateCanvas(sign * turn * -Math.PI / 4);
    chevron.fillRoundedRect(-barL / 2, -barT / 2, barL, barT, barT / 2);
    chevron.restore();
  }

  const textStyle = {
    fontFamily: FONTS.title,
    color: CHROME.ink,
    resolution: TEXT_RESOLUTION,
  };
  const children: Phaser.GameObjects.GameObject[] = [plate, chevron];
  if (target) {
    const def = VEHICLE_DEFS[target];
    children.push(
      scene.add.text(0, 14, def.name, {
        ...textStyle, fontSize: `${MIN_FONT.small}px`, fontStyle: 'bold',
      }).setOrigin(0.5),
      scene.add.text(0, 36, `${def.slots} spaces`, {
        ...textStyle, fontSize: `${MIN_FONT.small}px`,
      }).setOrigin(0.5),
    );
  } else {
    children.push(
      scene.add.text(0, 26, direction === 'fewer' ? 'Smallest' : 'Largest', {
        ...textStyle, fontSize: `${MIN_FONT.small}px`, color: DIMMED_INK,
      }).setOrigin(0.5),
    );
  }

  const container = scene.add.container(rect.x + rect.w / 2, rect.y + rect.h / 2, children);
  container.setSize(rect.w, rect.h);
  container.setName(`vehicle-arrow-${direction}${enabled ? '' : '-end'}`);
  if (!enabled) return { container, activate: () => undefined };

  let done = false;
  const activate = () => {
    if (done || !target) return;
    done = true;
    onChange(target, direction);
  };

  const hit = scene.add.rectangle(0, 0, Math.max(rect.w, MIN_TAP), Math.max(rect.h, MIN_TAP), 0x000000, 0)
    .setInteractive({ useHandCursor: true })
    .setName(`vehicle-arrow-${direction}`);
  hit.on('pointerover', () => container.setScale(1.05));
  hit.on('pointerout', () => container.setScale(1));
  hit.on('pointerdown', () => {
    scene.tweens.add({
      targets: container, scaleX: 0.94, scaleY: 0.94, duration: 60, yoyo: true,
      onComplete: activate,
    });
  });
  container.add(hit);

  return { container, activate };
}
