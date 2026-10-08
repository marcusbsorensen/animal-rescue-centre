/**
 * crate-loading-view.ts
 *
 * The loading screen — where the child decides who travels and who
 * sits next to whom, between picking a vehicle and pulling out of the
 * bay.
 *
 * **The animals go into the actual vehicle.** The grid is not a grid: it
 * is the load bed of the van she just chose, drawn at the size the van
 * is, with a cutaway panel over it so she can see inside. That is why
 * Trikey holds two and Big Tilly holds nine — a fact the screen used to
 * state in a sentence under an abstract slab and never show. The bays
 * are laid on the painting; `fleet-art.ts` says where each vehicle's bed
 * is and how big to draw the vehicle so the bays stay tappable.
 *
 * **It is also a place.** The vehicle stands in a painted bay on the
 * A.R.C. tarmac, the building behind it and the exit road along the
 * bottom — the same forecourt the picker draws, through the same
 * `drawForecourt`, because this is that car park one moment later.
 *
 * **The big panel on the right is the teaching surface.** It is not a
 * status line, it is the point of the screen: it answers in words a
 * child can read whether these two animals may sit together, and why.
 * It has a fixed home that never moves between renders. Nothing here is
 * on a timer, nothing flashes, and nothing a child taps can lose her
 * work.
 *
 * The rules, the state machine and every sentence live in
 * `@arc/game-logic`'s `crate-loading` module — this file draws a
 * session and reports taps. It holds exactly one piece of state of its
 * own, the message panel's current text, because a pointer moving over
 * a slot should repaint two lines of type rather than the whole screen.
 *
 * Pattern follows the other view modules: a `render*` function taking
 * the scene, a container and a callbacks bag, with the owning scene
 * keeping the session and redrawing after every tap.
 */

import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import {
  FEELING,
  FEELING_MARK,
  crateDefFor,
  heldAnimal,
  settledNotes,
  slotNotes,
  slotOutlook,
  waitingToBoard,
  aboard,
  blockingNotes,
  canSetOff,
  crateAt,
  slotCount,
  type AdjacencyNote,
  type CompatibilityLevel,
  type CrateDef,
  type LoadableAnimal,
  type LoadingSession,
  type VehicleDef,
  type VehicleType,
} from '@arc/game-logic';
import { createAnimalSprite } from '../ui/sprites';
import { createChromeButton, createChromeTitle, createChromePlate } from '../ui/UIButton';
import {
  CHROME, COLOURS, FONTS, MIN_FONT, MIN_TAP, PAGE_MARGIN, SAFE_MARGIN, SPACE,
  TEXT_RESOLUTION, TITLE_CY, TYPE, bottomAnchorY, contentTopFor, hexNum,
} from '../ui/constants';
import { fitChipGrid } from '../ui/layout';
import { drawForecourt, drawVehicleShadow } from './forecourt';
import {
  BAY_GAP, BAY_MAX_H, BAY_MAX_W, BED_PAD, VEHICLE_BED, VEHICLE_BED_SOURCE,
  VEHICLE_SPRITE, bedProbePoints, fitLoadBed, type BedFit,
} from './fleet-art';

/**
 * The three feelings, as a surface each.
 *
 * Colour reinforces here, it never carries: every badge draws its mark
 * *and* its word, and the sentence in the panel says the same thing a
 * third time. A child who does not see red and green apart reads the
 * screen exactly as well as one who does.
 */
const FEELING_SKIN: Record<CompatibilityLevel, { fill: number; stroke: number; ink: string }> = {
  happy:    { fill: 0xd9efdd, stroke: hexNum(COLOURS.primaryDark), ink: COLOURS.primaryDark },
  stressed: { fill: 0xfdeec2, stroke: 0x8a6a1f,                    ink: '#6b5112' },
  blocked:  { fill: 0xf7dcd6, stroke: hexNum(COLOURS.accent),      ink: COLOURS.accent },
};

/** Gap between crate bays, and between tray chips. */
const GAP = BAY_GAP;

/**
 * The cutaway floor the bays sit on — the inside of the vehicle, seen
 * with the roof lifted off.
 *
 * Four of the five vehicles are closed boxes, so there has to be a
 * convention for seeing in, and it has to be the same one every time or
 * the open trike and the closed lorry teach two different lessons. A
 * warm cream floor inset into the vehicle's own body, with a soft dark
 * rim where the walls would be, reads as a friendly cutaway in this
 * hand-drawn register. On Trikey, whose box really is open, the same
 * panel simply lands on the floor of the box, which is the honest case
 * the convention is built from.
 *
 * Duller than `CHROME.fill`, deliberately: the chrome plates floating
 * over this screen have to stay readable *as* chrome, and two creams a
 * shade apart is what keeps the paper above the world from dissolving
 * into it.
 */
const BED_FLOOR = 0xf0e4cc;
const BED_WALL = 0x3a3027;

/**
 * An empty bay: the well, the shade down its near wall, and the lip of
 * light on its far one.
 *
 * It used to be the cutaway floor with a wash of `BED_WALL` over it,
 * which came out at about (193,181,161) — four per cent darker than
 * the floor and a shade cooler. At Trikey's 130px bays the lip and the
 * inner stroke carried the depth anyway; at Big Tilly's 40px ones they
 * had nothing to work with, and nine cool grey rounded squares on warm
 * oak read as tiles laid on the lorry rather than holes cut in it.
 *
 * So the well now carries the depth on its own: a warm tan a full step
 * darker than the floor, which is the colour a shadowed cream floor
 * actually goes, and which keeps the whole vehicle on one side of the
 * warm/cool line. The strokes stay, and at Trikey's size they still do
 * what they always did.
 */
const BAY_WELL = 0xcdb792;
const BAY_WELL_SHADE = 0x6f5737;
const BAY_WELL_LIP = 0xfdf5e4;

/**
 * The tray is a grid of chips in whatever room the right-hand column
 * has left. A chip is as big as that allows, within these.
 */
const CHIP_MAX_W = 128;
const CHIP_MAX_H = 104;
/**
 * Narrower than this and a chip shows "Wh…" where it meant "Whiskers",
 * which is the tray's whole job. A column that can only manage it goes
 * to the full-width strip instead, where six chips have the room.
 */
const CHIP_NAME_MIN_W = 76;

/**
 * Below this a bay cannot carry a name row without the name taking more
 * of the bay than the crate in it. Big Tilly's nine bays are the case —
 * 40 wide by 54 deep, where a 20px name row would leave a 34px crate
 * with a 19px animal inside it. Her names live in the panel and on the
 * tray chips instead.
 *
 * It was 46, measured when a bay held a bare animal sprite and the name
 * came off the sprite's own slack. A crate has no slack: what the name
 * takes, the animal loses twice over, once for the rim and once for the
 * floor inside it.
 */
const BAY_NAME_MIN_H = 60;
/**
 * Below this the animal is drawn on her own rather than in her crate.
 *
 * Under about 32px the rim is most of what is left and the animal on
 * the floor inside stops being anybody in particular — and who she is
 * is the thing a child is reading. One rule for both places, measured
 * on the drawn art rather than on the box it sits in, because the box
 * runs out on different axes in each: a bay is pinched for width, and
 * a tray chip in the landscape-phone strip is pinched for height.
 *
 * Every bay in the fleet clears it, Big Tilly's 36px nine included —
 * the load where matching crates matters most. What does not clear it
 * is that bottom strip on a short viewport, and the no-texture
 * fallback, where bays are sized off the raw box.
 */
const CRATE_ART_MIN = 32;

export interface CrateLoadingCallbacks {
  /** An animal in the tray was tapped — pick it up. */
  onHoldFromTray: (animalId: string) => void;
  /** A loaded bay was tapped — lift that animal out into the child's hands. */
  onLiftFromSlot: (slotIndex: number) => void;
  /** An empty bay was tapped while holding an animal. */
  onPlaceInSlot: (slotIndex: number) => void;
  /** The held animal goes back on the pavement. */
  onPutBack: () => void;
  /** Everything is loaded and the van may set off. */
  onSetOff: () => void;
  onBack: () => void;
}

export interface CrateLoadingState {
  session: LoadingSession;
  vehicle: VehicleDef;
  /** Where the van is going, already in title case. */
  destinationName: string;
  /**
   * The full animal records, by id, for the painted sprites.
   *
   * `LoadableAnimal` is the three fields the rules need; drawing an
   * animal needs its variant and its state as well, and that is the
   * caller's record rather than something the rules should carry.
   */
  animalsById: Map<string, Animal>;
  /**
   * What just happened, if the child needs telling — a refused bay, or
   * an empty van asked to set off. Shown instead of the standing
   * message until the next tap, and never on a timer.
   */
  notice?: { level: CompatibilityLevel | null; text: string } | null;
}

/** Lines the panel shows, and which feeling (if any) tints its heading. */
interface PanelCopy {
  heading: string;
  tone: CompatibilityLevel | null;
  body: string[];
}

interface Box { x: number; y: number; w: number; h: number }

/**
 * A label that always fits its box.
 *
 * Animal names run from "Pip" to "Clementine", and a name wider than
 * its bay would either overhang into the neighbour's or have to be
 * drawn below the 16px floor. Neither is acceptable, so an over-long
 * name is shortened — and the full name is still in the panel sentence
 * whenever that animal is part of one.
 */
function fitLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  name: string,
  maxWidth: number,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, name, style).setOrigin(0.5);
  if (text.width <= maxWidth) return text;
  for (let keep = name.length - 1; keep >= 1; keep -= 1) {
    text.setText(`${name.slice(0, keep)}…`);
    if (text.width <= maxWidth) break;
  }
  return text;
}

/**
 * How much of a painted crate is clear floor.
 *
 * All six are drawn from directly above, open and empty, with a pale
 * cream floor in the middle. Measured off the files as the largest
 * centred square of clear floor: the warm vivarium has 0.59, the
 * secure crate 0.58, the standard crate 0.55, the quiet bed 0.53 and
 * the round ventilated basket 0.44 — the basket is a circle, so its
 * square is the smallest while its *width* at the middle is as wide as
 * anybody's. 0.56 puts an animal on the floor of five of the six and
 * lets the corners of a sprite in the basket brush the weave, which is
 * what an animal in a basket looks like.
 *
 * The perch carrier measures zero because its perch crosses the
 * middle, and a bird drawn over its perch is a bird perching.
 */
const CRATE_FLOOR = 0.56;

/**
 * The crate an animal travels in, drawn — a painted crate when there is
 * one, the emoji on a cream disc when there is not.
 *
 * All six are installed in `assets/driving/crates/`, so the fallback is
 * now only reached if a file goes missing or a load fails: the full
 * game picks them up from the asset manifest by filename and the
 * `?ptvDemo=1` boot self-loads them. It stays because a crate is how a
 * child tells a snake's travel box from a bat's, and a screen that
 * drops that fact entirely on a failed fetch is worse than one that
 * falls back to a glyph.
 */
function makeCrateFace(
  scene: Phaser.Scene,
  x: number,
  y: number,
  crate: CrateDef,
  size: number,
): Phaser.GameObjects.GameObject {
  const key = `crate-${crate.id}`;
  if (scene.textures.exists(key)) {
    const img = scene.add.image(x, y, key).setOrigin(0.5);
    img.setScale(size / Math.max(img.width, img.height));
    return img;
  }

  const r = size / 2;
  const gfx = scene.add.graphics();
  gfx.fillStyle(CHROME.fill, CHROME.fillAlpha);
  gfx.fillCircle(0, 0, r);
  gfx.lineStyle(1.5, CHROME.stroke, CHROME.strokeAlpha);
  gfx.strokeCircle(0, 0, r);

  const glyph = scene.add.text(0, 0, crate.emoji, {
    fontSize: `${Math.round(size * 0.62)}px`,
    fontFamily: FONTS.body,
  }).setOrigin(0.5);

  return scene.add.container(x, y, [gfx, glyph]);
}

/**
 * An animal in the crate she travels in, drawn from above.
 *
 * One picture rather than two, and it is the picture the crates were
 * painted empty for: the animal sits *on the crate's floor*, inside the
 * rim, the way she will travel. It replaced an animal with a small
 * crate badge pinned to her shoulder, which said the same thing twice
 * and said neither of them at the size Big Tilly's bays run to.
 *
 * The same object in the tray and in the bay, so the thing a child taps
 * and the thing that lands in the van are visibly one object.
 *
 * Where there is no painted crate the badge comes back — the animal at
 * full size with the glyph in the corner, exactly as the screen drew it
 * before the art existed.
 */
function makeCratedAnimal(
  scene: Phaser.Scene,
  x: number,
  y: number,
  animal: Animal | undefined,
  crate: CrateDef,
  size: number,
): Phaser.GameObjects.GameObject {
  const key = `crate-${crate.id}`;
  if (!scene.textures.exists(key)) {
    const fallback: Phaser.GameObjects.GameObject[] = [];
    if (animal) {
      fallback.push(createAnimalSprite(scene, 0, 0, animal, { width: size, height: size }));
    }
    const badge = Math.round(size * 0.42);
    fallback.push(makeCrateFace(scene, -size / 2 + badge / 2, -size / 2 + badge / 2, crate, badge));
    return scene.add.container(x, y, fallback);
  }

  const children: Phaser.GameObjects.GameObject[] = [
    makeCrateFace(scene, 0, 0, crate, size),
  ];
  if (animal) {
    const inside = Math.round(size * CRATE_FLOOR);
    children.push(
      createAnimalSprite(scene, 0, 0, animal, { width: inside, height: inside }),
    );
  }
  return scene.add.container(x, y, children);
}

/** One feeling badge — the mark, and under it the word. */
function makeFeelingBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  level: CompatibilityLevel,
  options?: { withWord?: boolean },
): Phaser.GameObjects.Container {
  const skin = FEELING_SKIN[level];
  const withWord = options?.withWord ?? false;
  const r = withWord ? 17 : 13;

  const gfx = scene.add.graphics();
  gfx.fillStyle(skin.fill, 1);
  gfx.fillCircle(0, withWord ? -6 : 0, r);
  gfx.lineStyle(2, skin.stroke, 1);
  gfx.strokeCircle(0, withWord ? -6 : 0, r);

  const mark = scene.add.text(0, withWord ? -6 : 0, FEELING_MARK[level], {
    fontSize: withWord ? '20px' : '16px',
    fontFamily: FONTS.ui,
    fontStyle: 'bold',
    color: skin.ink,
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5);

  const children: Phaser.GameObjects.GameObject[] = [gfx, mark];
  if (withWord) {
    children.push(
      scene.add.text(0, 20, FEELING[level], {
        fontSize: `${MIN_FONT.small}px`,
        fontFamily: FONTS.ui,
        fontStyle: 'bold',
        color: skin.ink,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  }
  return scene.add.container(x, y, children);
}

/** Up to `limit` sentences, worst first. */
function sentences(notes: AdjacencyNote[], limit: number): string[] {
  return notes.slice(0, limit).map((n) => n.text);
}

/**
 * What the panel says when nothing has just happened.
 *
 * Holding an animal, it says whose turn it is and what the bays will
 * do. Holding nothing, it reads out the grid as it stands — one
 * sentence per pair of animals who can see each other, which is the
 * thing being taught, rather than a score for the load.
 */
function standingCopy(state: CrateLoadingState): PanelCopy {
  const { session } = state;
  const held = heldAnimal(session);

  if (held) {
    const crate = crateDefFor(held.species);
    return {
      heading: `In your hands: ${held.name} the ${held.species}`,
      tone: null,
      body: [
        `${held.name} travels in a ${crate.label.toLowerCase()}.`,
        `Tap a space in ${state.vehicle.name} to put them down.`,
      ],
    };
  }

  const blockers = blockingNotes(session);
  if (blockers.length > 0) {
    return {
      heading: FEELING.blocked,
      tone: 'blocked',
      body: [...sentences(blockers, 2), 'Tap one of them to move them somewhere else.'],
    };
  }

  const settled = settledNotes(session);
  if (settled.length > 0) {
    return {
      heading: FEELING[settled[0].level],
      tone: settled[0].level,
      body: sentences(settled, 3),
    };
  }

  if (aboard(session).length === 0) {
    return {
      heading: `${state.vehicle.name} is empty`,
      tone: null,
      body: [
        `Tap an animal waiting to board, then tap a space in ${state.vehicle.name}.`,
        'Animals only mind who is beside them, above them or below them.',
      ],
    };
  }

  // "Nobody is worried", not "everyone is comfortable": the screen has
  // three words for how an animal feels and this is one of them. A
  // fourth would be a synonym a child has to learn on top of the thing
  // the screen is teaching.
  return {
    heading: 'Nobody is worried',
    tone: null,
    body: [
      'Nobody is sitting next to anybody, so nobody has a neighbour to mind.',
      'Load another animal, or set off.',
    ],
  };
}

function panelCopy(state: CrateLoadingState): PanelCopy {
  if (state.notice) {
    return {
      heading: state.notice.level ? FEELING[state.notice.level] : 'Wait a moment',
      tone: state.notice.level,
      body: [
        state.notice.text,
        state.notice.level === 'blocked' ? 'Try another space.' : '',
      ].filter((l) => l.length > 0),
    };
  }
  return standingCopy(state);
}

/**
 * Draw the whole loading screen into `container`.
 *
 * The owning scene keeps the session and calls this again after every
 * tap, exactly as `PtvDriveScene` redraws its other phases.
 */
export function renderCrateLoading(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
): void {
  const { width, height } = scene.scale;
  const { session, vehicle } = state;
  const held = heldAnimal(session);

  // The title carries what used to be a floating line of ink on the
  // gravel — "Trikey has 2 spaces". The van on screen now shows its own
  // capacity, so the words belong with the other fact about this trip
  // rather than hovering over the tarmac looking for a home.
  const spaces = `${vehicle.slots} ${vehicle.slots === 1 ? 'space' : 'spaces'}`;
  const title = createChromeTitle(scene, width / 2, TITLE_CY, `Load ${vehicle.name}`, {
    fontSize: TYPE.lead,
    subtitle: `${spaces} — off to ${state.destinationName}`,
  });

  // ── The forecourt, and the bands on it ──
  const contentTop = contentTopFor(title);
  const buttonCy = bottomAnchorY(height);
  const bandBottom = buttonCy - MIN_TAP / 2 - SPACE.m;
  const roadTop = height * 0.93;

  // A strip of gravel above the tarmac, so the car park has a far edge
  // to stand on rather than butting the title. Every pixel of it comes
  // off the vehicle, so it is a fraction of what is going spare and
  // capped at one step of the scale.
  const apronTop = contentTop
    + Math.min(SPACE.xxl, Math.max(0, (bandBottom - contentTop) * 0.06));

  const usable = width - PAGE_MARGIN * 2;
  const colGap = SPACE.xl;
  // The panel is sized first and the vehicle takes what is left: the
  // panel is type, and type has a width below which it stops being
  // readable, while a vehicle simply draws smaller.
  const panelColW = Math.round(Math.max(236, Math.min(usable * 0.44, 420)));
  const vehicleColW = Math.max(160, usable - colGap - panelColW);
  const panelColX = PAGE_MARGIN + vehicleColW + colGap;

  const bandTop = apronTop + SPACE.m;
  const bandH = bandBottom - bandTop;

  // The animals waiting to board stand under the panel, in the same
  // column, which is what buys the vehicle the full height of the band.
  // Where that column cannot give them a chip wide enough to carry a
  // name — a narrow or a short window — they fall back to a strip
  // across the bottom, and the panel and the vehicle give up the height
  // instead. Decided before either is drawn, so the strip can never
  // land on the panel.
  const trayLabelH = MIN_FONT.small + SPACE.xs;
  const trayMinH = trayLabelH + SPACE.s + MIN_TAP;
  const panelWanted = CHROME.padY * 2 + 34 + 5 * 26;
  const waiting = waitingToBoard(session).length;
  const columnTrayTop = bandTop + Math.min(bandH, panelWanted) + SPACE.l;
  const columnTrayH = bandBottom - columnTrayTop;
  const columnChip = trayGrid(
    Math.max(1, waiting), { w: panelColW, h: columnTrayH - trayLabelH - SPACE.s },
  );

  let trayBox: Box;
  let columnsBottom: number;
  if (columnTrayH >= trayMinH && columnChip.chipW >= CHIP_NAME_MIN_W) {
    trayBox = { x: panelColX, y: columnTrayTop, w: panelColW, h: columnTrayH };
    columnsBottom = bandBottom;
  } else {
    // The strip's whole height, label row included — on a landscape
    // phone every pixel it takes comes off the message panel, which is
    // the one thing on this screen that cannot be shortened.
    const trayH = Math.min(104, Math.max(trayLabelH + SPACE.s + MIN_TAP, height * 0.19));
    trayBox = { x: PAGE_MARGIN, y: bandBottom - trayH, w: usable, h: trayH };
    columnsBottom = trayBox.y - SPACE.s;
  }

  // The tarmac is the loading bay, not the whole screen. The picker
  // lays a wide shallow slab because it is showing a row of five bays;
  // here there is one vehicle, so the slab is its bay and the rest of
  // the forecourt stays gravel — which keeps the chrome column reading
  // as paper over a place rather than as a panel on a black field.
  //
  // It ends where the vehicle does rather than always at the road:
  // under the bottom tray strip the extra tarmac is empty, and empty
  // tarmac under a strip of chips reads as a hole rather than a car
  // park.
  //
  // **No building.** The height it would stand in is the height the
  // vehicle needs to sit on the tarmac whole; drawn in what was left it
  // measured about 130px against the picker's 370 and read as a sticker
  // pasted on the slab's top edge. Gravel, tarmac and the exit road
  // carry the place on their own.
  //
  // **And the bay is the vehicle's width, not the column's.** The
  // proportion pass turned every vehicle portrait: Big Tilly draws
  // 169px wide in a 524px column, and a slab filled to the column put
  // 350px of empty tarmac beside her — a car park with one lorry
  // marooned in it, which is the "UI panel with a van on it" reading
  // this slab was cut down to avoid in the first place. So the vehicle
  // is measured first and the tarmac laid round it, with the gravel it
  // no longer covers left as forecourt.
  const apronBottom = Math.min(roadTop - 8, columnsBottom + SPACE.s);
  const roomX = PAGE_MARGIN - SPACE.m;
  const roomW = vehicleColW + SPACE.xl;
  const roomBox = {
    x: roomX + SPACE.l,
    y: apronTop + SPACE.l,
    w: Math.max(120, roomW - SPACE.l * 2),
    h: Math.max(100, apronBottom - SPACE.l - (apronTop + SPACE.l)),
  };
  const fit = vehicleFit(scene, vehicle.id, roomBox, session.grid.cols, session.grid.rows);
  const bayW = fit
    ? Math.min(roomW, Math.max(160, fit.spriteW + SPACE.xxl * 2))
    : roomW;
  const { apron } = drawForecourt(scene, container, {
    width,
    height,
    contentTop,
    apronTop,
    apronH: Math.max(0, apronBottom - apronTop),
    apronX: roomX + (roomW - bayW) / 2,
    apronW: bayW,
    building: false,
  });
  container.add(title);

  // The panel is sized for its longest copy — a heading and five lines —
  // rather than for the band, and pinned to the top of it: a panel that
  // changed height with its contents would move the words a child is
  // reading. It takes the band's height when the band is the smaller.
  const panelH = Math.max(MIN_TAP, Math.min(columnsBottom - bandTop, panelWanted));
  const setMessage = drawPanel(scene, container, state, {
    x: panelColX, y: bandTop, w: panelColW, h: panelH,
  });

  // The vehicle stands *inside* the tarmac, inset far enough on every
  // side to have air round it. A van drawn to the slab's own edges is
  // a van hanging off a panel, which is what this looked like.
  drawVehicle(scene, container, state, callbacks, setMessage, {
    x: apron.x + SPACE.l,
    y: apron.y + SPACE.l,
    w: Math.max(120, apron.w - SPACE.l * 2),
    h: Math.max(100, apronBottom - SPACE.l - (apron.y + SPACE.l)),
  }, apronBottom - 3, fit);
  drawTray(scene, container, state, callbacks, setMessage, trayBox, trayLabelH);

  // ── Bottom row ──
  container.add(
    createChromeButton(scene, SAFE_MARGIN, SAFE_MARGIN, 'Back', () => callbacks.onBack(), {
      width: 88, anchor: { x: 'left', y: 'top' },
    }).setDepth(45),
  );

  const ready = canSetOff(session) && aboard(session).length > 0;
  container.add(
    createChromeButton(scene, width / 2, buttonCy, "Let's go!", () => callbacks.onSetOff(), {
      width: 190,
      // Filled only when the van really may leave. The unready button is
      // not dead and not greyed out — it answers with the reason, in the
      // panel, which is the same calm refusal a frightening bay gives.
      variant: ready ? 'filled' : 'plate',
    }).setDepth(45),
  );

  if (held) {
    container.add(
      createChromeButton(
        scene, width - SAFE_MARGIN, buttonCy, `Put ${held.name} back`,
        () => callbacks.onPutBack(),
        { width: 180, fontSize: TYPE.button, anchor: { x: 'right' } },
      ).setDepth(45),
    );
  }
}

// ── The vehicle, and the bays in it ──────────────────────────

/**
 * The live notes for one bay, as panel copy — what a pointer resting on
 * an empty bay reads out while an animal is held.
 */
function bayHoverCopy(session: LoadingSession, slotIndex: number): PanelCopy | null {
  const outlook = slotOutlook(session, slotIndex);
  if (!outlook) return null;
  const notes = slotNotes(session, slotIndex);
  const held = heldAnimal(session);
  return {
    heading: FEELING[outlook],
    tone: outlook,
    body: notes.length > 0
      ? sentences(notes, 2)
      : [`Nobody is beside this space, so ${held?.name ?? 'they'} would travel on their own.`],
  };
}

/**
 * How big this vehicle wants to be drawn in the room it has — worked
 * out before anything is drawn, so the tarmac can be laid as a bay
 * round it rather than as a slab it sits somewhere on.
 *
 * Undefined where the painted vehicle has not loaded; the caller then
 * falls back to the whole column, which is what the screen did before
 * there was any art to measure.
 */
function vehicleFit(
  scene: Phaser.Scene,
  id: VehicleType,
  box: Box,
  cols: number,
  rows: number,
): BedFit | undefined {
  const key = VEHICLE_SPRITE[id];
  if (!scene.textures.exists(key)) return undefined;
  const source = scene.textures.get(key).getSourceImage();
  return fitLoadBed(
    { w: box.w, h: box.h },
    { w: source.width, h: source.height },
    VEHICLE_BED[id],
    cols, rows,
  );
}

/**
 * The chosen vehicle, parked in a bay on the tarmac, with its load bed
 * cut away and the crate grid laid in it.
 *
 * The bays lead: `fitLoadBed` sizes them for the room there is and then
 * says how big the vehicle has to be drawn for its bed to hold them,
 * which is why Big Tilly draws bigger than the band and a trike does
 * not. The vehicle is centred in its column; when it is bigger than the
 * band it is pinned to the top of it, so the bed is always fully on
 * screen and it is the bumper that runs out of the picture.
 */
function drawVehicle(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  box: Box,
  /**
   * The y the vehicle is cut off at — the tarmac's own bottom edge.
   *
   * Reached by the three-across vehicles at every viewport the screen
   * is checked at (see `fitLoadBed`). Cutting at the kerb rather than
   * at an arbitrary line means the vehicle ends where the ground does,
   * which reads as driving out of the picture.
   */
  clipAt?: number,
  /**
   * The fit the caller already worked out to lay the tarmac round.
   * Recomputing it here would risk the bay and the vehicle in it
   * disagreeing by a pixel over which of them is 169 wide.
   */
  measured?: BedFit,
): void {
  const { session, vehicle } = state;
  const { cols, rows } = session.grid;

  const key = VEHICLE_SPRITE[vehicle.id];
  let slotW: number;
  let slotH: number;
  let floor: Box;
  let originX: number;
  let originY: number;

  if (scene.textures.exists(key)) {
    const sprite = scene.add.image(0, 0, key).setOrigin(0.5);
    warnOnStaleBed(scene, key, vehicle.id, sprite.width, sprite.height);

    const fit = measured ?? fitLoadBed(
      { w: box.w, h: box.h },
      { w: sprite.width, h: sprite.height },
      VEHICLE_BED[vehicle.id],
      cols, rows,
    );
    const left = box.x + (box.w - fit.spriteW) / 2;
    const top = fit.overflows ? box.y : box.y + (box.h - fit.spriteH) / 2;
    // Where the vehicle actually ends on screen: its own bottom edge, or
    // the kerb if it is the bigger vehicle. The shadow is a pool on the
    // ground under it, so it has to stop where the vehicle stops —
    // otherwise a lorry running off the slab casts an ellipse across the
    // exit road and out under the buttons.
    const bottom = fit.overflows && clipAt !== undefined
      ? Math.min(clipAt, top + fit.spriteH)
      : top + fit.spriteH;

    drawVehicleShadow(scene, container, {
      cx: left + fit.spriteW / 2,
      cy: (top + bottom) / 2,
      w: fit.spriteW,
      h: bottom - top,
    });

    sprite.setPosition(left + fit.spriteW / 2, top + fit.spriteH / 2);
    sprite.setDisplaySize(fit.spriteW, fit.spriteH);
    if (fit.overflows && clipAt !== undefined) {
      // `setCrop` is in the texture's own pixels and draws the kept part
      // where it already was, so the bed does not move.
      const keep = (clipAt - top) / fit.spriteH;
      sprite.setCrop(0, 0, sprite.width, sprite.height * Math.max(0, Math.min(1, keep)));
    }
    container.add(sprite);

    slotW = fit.slotW;
    slotH = fit.slotH;
    // The cutaway ends where the vehicle does. Spark's cabin is 0.63 of
    // a sprite drawn taller than the band, so at 820x620 the last strip
    // of her floor is past the kerb — and a cream panel carrying on
    // over the exit road is the one thing worse than a bumper that
    // does. The bays are centred in the floor and well inside it, so
    // nothing tappable is ever what gets cut.
    const floorY = top + fit.floor.y;
    floor = {
      x: left + fit.floor.x,
      y: floorY,
      w: fit.floor.w,
      h: clipAt === undefined ? fit.floor.h : Math.min(fit.floor.h, clipAt - floorY),
    };
    originX = left + fit.grid.x;
    originY = top + fit.grid.y;
  } else {
    // No painted vehicle loaded. The bed is still a bed — the cutaway
    // panel, the bays and every sentence behave identically, so a
    // missing texture costs the picture and nothing else.
    slotW = Math.max(1, Math.min(
      BAY_MAX_W, Math.floor((box.w - BED_PAD * 2 - GAP * (cols - 1)) / cols),
    ));
    slotH = Math.max(1, Math.min(
      BAY_MAX_H, Math.floor((box.h - BED_PAD * 2 - GAP * (rows - 1)) / rows),
    ));
    const w = slotW * cols + GAP * (cols - 1) + BED_PAD * 2;
    const h = slotH * rows + GAP * (rows - 1) + BED_PAD * 2;
    floor = { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
    originX = floor.x + BED_PAD;
    originY = floor.y + BED_PAD;
  }

  drawBedFloor(scene, container, floor);

  drawBays(scene, container, state, callbacks, setMessage, {
    originX,
    originY,
    slotW,
    slotH,
    cols,
  });
}

/** Texture keys already checked, so the sampling happens once a session. */
const bedChecked = new Set<string>();

/**
 * Say so, in dev, when a vehicle's load bed no longer matches its art.
 *
 * `VEHICLE_BED` is nine numbers measured by eye off a painting, and the
 * paintings are being redrawn. Re-measuring them is expected work; what
 * would be bad is the bays quietly drifting onto a lorry's bonnet with
 * nothing to say they had. So this compares the texture against the
 * size it was measured at, and samples the painting at nine points on
 * the bed — a bed that has slid off the body finds transparency, and
 * the console says which vehicle and how far off it is.
 *
 * Dev only, once per texture, and it never changes what is drawn.
 */
function warnOnStaleBed(
  scene: Phaser.Scene,
  key: string,
  id: VehicleType,
  w: number,
  h: number,
): void {
  if (!import.meta.env?.DEV || bedChecked.has(key)) return;
  bedChecked.add(key);

  const source = VEHICLE_BED_SOURCE[id];
  if (source && (source.w !== w || source.h !== h)) {
    console.warn(
      `[crate loading] ${key} is ${w}x${h}; VEHICLE_BED['${id}'] was measured on `
      + `${source.w}x${source.h}. The art has been redrawn — re-measure the bed `
      + 'in apps/game/src/driving/fleet-art.ts.',
    );
  }

  const missed = bedProbePoints(VEHICLE_BED[id]).filter(({ u, v }) => {
    const px = Math.min(w - 1, Math.max(0, Math.round(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.round(v * h)));
    const colour = scene.textures.getPixel(px, py, key);
    return !colour || colour.alpha < 8;
  });
  if (missed.length > 0) {
    console.warn(
      `[crate loading] VEHICLE_BED['${id}'] falls off the painted vehicle at `
      + `${missed.length} of 9 sample points — the bays are being drawn where `
      + `${key} has no paint. Re-measure it in apps/game/src/driving/fleet-art.ts.`,
    );
  }
}

/**
 * The cutaway — a cream floor inset into the vehicle's body with a dark
 * rim where its walls are, so the bays read as being inside the van
 * rather than painted on its roof.
 */
function drawBedFloor(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  bed: Box,
): void {
  const gfx = scene.add.graphics();
  gfx.fillStyle(BED_WALL, 0.38);
  gfx.fillRoundedRect(bed.x - 4, bed.y - 4, bed.w + 8, bed.h + 8, 14);
  gfx.fillStyle(BED_FLOOR, 0.97);
  gfx.fillRoundedRect(bed.x, bed.y, bed.w, bed.h, 11);
  gfx.lineStyle(2, 0x8a7a60, 0.5);
  gfx.strokeRoundedRect(bed.x, bed.y, bed.w, bed.h, 11);
  container.add(gfx);
}

interface GridGeometry {
  originX: number;
  originY: number;
  slotW: number;
  slotH: number;
  cols: number;
}

interface BayGeometry {
  left: number;
  top: number;
  cx: number;
  cy: number;
  slotW: number;
  slotH: number;
  withName: boolean;
  /**
   * Let a wide shallow box lay itself out as a row. Default true.
   *
   * False for the tray, and the difference is what the name is for in
   * each place. In a bay the animal is already placed and her name is a
   * reminder, so trading three letters for a sprite twice the size is a
   * good trade. In the tray the name is how a child decides who to pick
   * up next, and a 108px chip that reads "Sniffl…" has given away the
   * thing it was there to say.
   */
  rowWhenWide?: boolean;
}

/**
 * An animal in her crate, with her name, in a box — a loaded bay in the
 * vehicle, or a chip in the tray waiting to board.
 *
 * Two arrangements, because neither box gets to choose its own shape: a
 * bay is the vehicle's, and a tray chip is whatever the column it wraps
 * into leaves. Roughly square takes a card — the crate above, her name
 * under it. Wide and shallow takes a row — the crate at the left, her
 * name beside it — because a card in a 55px-deep box draws a 17px
 * animal over a 20px name, which is two things neither of which can be
 * read. The same two facts, using the axis that has room.
 *
 * **The crate is the picture now, not a badge beside it.** Where the
 * art comes out under `CRATE_ART_MIN` the animal is drawn on her own,
 * because a crate rim round a 30px sprite leaves 17px of animal and
 * the animal is who the child is choosing.
 */
function drawAnimalTile(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal | undefined,
  name: string,
  crate: CrateDef,
  g: BayGeometry,
): void {
  const nameStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui, fontStyle: 'bold',
    color: CHROME.ink, resolution: TEXT_RESOLUTION,
  };

  /** The animal in her crate, or — too small for a rim — just her. */
  const art = (x: number, y: number, size: number) => {
    if (size >= CRATE_ART_MIN) return makeCratedAnimal(scene, x, y, animal, crate, size);
    if (!animal) return undefined;
    return createAnimalSprite(scene, x, y, animal, { width: size, height: size });
  };

  if ((g.rowWhenWide ?? true) && g.slotW >= g.slotH * 1.6) {
    const size = Math.min(g.slotH - 8, g.slotW * 0.34);
    const piece = art(g.left + 4 + size / 2, g.cy, size);
    if (piece) container.add(piece);
    // The name takes everything to the right of the crate.
    const textLeft = g.left + 4 + size + SPACE.xs;
    const textRight = g.left + g.slotW - 4;
    if (textRight - textLeft >= 36) {
      container.add(
        fitLabel(
          scene, (textLeft + textRight) / 2, g.cy, name, textRight - textLeft, nameStyle,
        ),
      );
    }
    return;
  }

  const nameRow = g.withName ? MIN_FONT.small + 4 : 0;
  // Square, because a crate is: the shorter axis sets the size and the
  // spare on the other one is floor. The inset is 4 rather than the 10
  // an animal had, because a crate painted edge to edge of its file has
  // no margin of its own to give and Big Tilly's bays have none to
  // lend — every pixel taken off the rim comes off the animal inside.
  const size = Math.max(1, Math.min(g.slotW - 4, g.slotH - nameRow - 4));
  const piece = art(g.cx, g.cy - nameRow / 2, size);
  if (piece) container.add(piece);
  if (g.withName) {
    container.add(
      fitLabel(
        scene, g.cx, g.cy + g.slotH / 2 - nameRow / 2 - 2, name, g.slotW - 8, nameStyle,
      ),
    );
  }
}

function drawBays(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  geom: GridGeometry,
): void {
  const { session } = state;
  const { originX, originY, slotW, slotH, cols } = geom;

  const slotCentre = (slot: number) => ({
    x: originX + (slot % cols) * (slotW + GAP) + slotW / 2,
    y: originY + Math.floor(slot / cols) * (slotH + GAP) + slotH / 2,
  });

  const withName = slotH >= BAY_NAME_MIN_H;

  for (let slot = 0; slot < slotCount(session); slot += 1) {
    const { x: cx, y: cy } = slotCentre(slot);
    const crate = crateAt(session, slot);
    const outlook = slotOutlook(session, slot);
    const left = cx - slotW / 2;
    const top = cy - slotH / 2;

    const bay = scene.add.graphics();
    if (outlook) {
      // Holding an animal lights every empty bay with what it would do
      // to her — the one moment this screen uses colour at full
      // strength, and it still carries the mark and the word on top.
      const skin = FEELING_SKIN[outlook];
      bay.fillStyle(skin.fill, 0.95);
      bay.fillRoundedRect(left, top, slotW, slotH, 10);
      bay.lineStyle(3, skin.stroke, 1);
      bay.strokeRoundedRect(left, top, slotW, slotH, 10);
    } else {
      // A bay is a recess *in* the vehicle's floor, not a tile *on*
      // it — darker than the floor rather than a paler crate, so "there
      // is nobody here" never has to be read as "there is something
      // here". Four passes make it a hole: a lip of light peeking out
      // below, where the near edge catches the sun; the well; a shaded
      // wall round it; and a second stroke nudged down and right, which
      // reads as depth without a gradient.
      //
      // The same well under a loaded bay, with the crate standing in
      // it. A loaded bay used to be a chrome plate instead, which was
      // right when a bay held an animal and a badge and wrong the
      // moment it held a painted crate: a cream card with a small
      // wooden box on it reads as two objects, and the second one is
      // not a thing in the van.
      bay.fillStyle(BAY_WELL_LIP, 0.85);
      bay.fillRoundedRect(left, top + 2, slotW, slotH, 10);
      bay.fillStyle(BAY_WELL, 1);
      bay.fillRoundedRect(left, top, slotW, slotH, 10);
      bay.lineStyle(2.5, BAY_WELL_SHADE, 0.55);
      bay.strokeRoundedRect(left, top, slotW, slotH, 10);
      bay.lineStyle(2, BAY_WELL_SHADE, 0.3);
      bay.strokeRoundedRect(left + 1.5, top + 1.5, slotW - 3, slotH - 3, 9);
    }
    container.add(bay);

    if (crate) {
      const record = state.animalsById.get(crate.animalId);
      drawAnimalTile(
        scene, container, record, record?.name ?? '', crateDefFor(crate.species),
        { left, top, cx, cy, slotW, slotH, withName },
      );
    } else if (outlook) {
      container.add(makeFeelingBadge(scene, cx, cy, outlook, { withWord: slotH >= 62 }));
    }

    // Hit area floored at MIN_TAP, per the idiom on that constant —
    // but never past its neighbour. `BAY_MIN` keeps the drawn pitch at
    // or above MIN_TAP so the floor is normally free, and the pitch is
    // the ceiling for the window where it is not: a hit box 4px short
    // of the floor is a smaller target, while one that overlaps the bay
    // next door picks up the wrong animal.
    const hit = scene.add.rectangle(
      cx, cy,
      Math.max(slotW, Math.min(MIN_TAP, slotW + GAP)),
      Math.max(slotH, Math.min(MIN_TAP, slotH + GAP)),
      0x000000, 0,
    ).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      if (crate) {
        const animal = state.animalsById.get(crate.animalId);
        setMessage(animal ? {
          heading: `${animal.name} the ${animal.species}`,
          tone: null,
          body: [
            `${animal.name} is in a ${crateDefFor(crate.species).label.toLowerCase()}.`,
            'Tap to lift them out again.',
          ],
        } : null);
      } else {
        setMessage(bayHoverCopy(session, slot));
      }
    });
    hit.on('pointerout', () => setMessage(null));
    hit.on('pointerdown', () => {
      if (crate) callbacks.onLiftFromSlot(slot);
      else callbacks.onPlaceInSlot(slot);
    });
    container.add(hit);
  }

  // Pair marks on the shared edge between two loaded bays — the same
  // badge the live preview uses, so one mark means one thing.
  //
  // Pushed off the middle of that edge, because the middle is where the
  // animal's name is: a bay's name row runs along its bottom, so a
  // badge centred on a north/south boundary lands on it. A pair above
  // and below each other takes the badge to one side; a pair beside
  // each other takes it up, clear of both name rows.
  for (const note of settledNotes(session)) {
    const a = slotCentre(note.slotIndex);
    const b = slotCentre(note.neighbourSlotIndex);
    const vertical = a.x === b.x;
    container.add(
      makeFeelingBadge(
        scene,
        (a.x + b.x) / 2 + (vertical ? slotW * 0.3 : 0),
        (a.y + b.y) / 2 - (vertical ? 0 : slotH * 0.24),
        note.level,
      ).setDepth(6),
    );
  }
}

// ── The panel ────────────────────────────────────────────────

/**
 * The fixed message panel. Returns a setter the tray and the bays use
 * to repaint it on hover without redrawing the screen.
 *
 * While an animal is held, her painting sits in the panel's bottom
 * corner. "In your hands" is a sentence a seven-year-old has to read
 * and believe; a picture of the animal she is carrying is the same fact
 * at a glance, and it is the one thing on this screen that changes with
 * no visible cause otherwise.
 */
function drawPanel(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  box: Box,
): (copy: PanelCopy | null) => void {
  const plate = createChromePlate(scene, box.x + box.w / 2, box.y + box.h / 2, box.w, box.h);
  container.add(plate);

  const held = heldAnimal(state.session);
  const heldRecord = held ? state.animalsById.get(held.id) : undefined;
  const carrySize = Math.min(56, box.h - CHROME.padY * 2);

  // The sentences keep the full width: the painting sits below them, in
  // the corner the fifth line only reaches when a bay has been refused,
  // and a refusal is never something you are holding an animal through.
  const innerW = box.w - CHROME.padX * 2;

  // On a landscape phone the plate gets about two-thirds the height its
  // longest copy wants, and there is nothing to take it from — the tray
  // and the vehicle are already at their floors. So the padding and the
  // leading close up rather than the words running off the bottom of
  // the paper onto the gravel. The type size does not move; that floor
  // is not negotiable, and it is the only thing here that is not.
  const tight = box.h < CHROME.padY * 2 + 34 + 5 * 26;
  const headingY = box.y + (tight ? SPACE.s : CHROME.padY + SPACE.xs);

  const heading = scene.add.text(box.x + CHROME.padX, headingY, '', {
    fontSize: TYPE.lead, fontFamily: FONTS.ui, fontStyle: 'bold',
    color: CHROME.ink, wordWrap: { width: innerW }, resolution: TEXT_RESOLUTION,
  }).setOrigin(0, 0);
  container.add(heading);

  const body = scene.add.text(box.x + CHROME.padX, headingY + (tight ? 26 : 34), '', {
    fontSize: TYPE.body, fontFamily: FONTS.ui, color: CHROME.ink,
    lineSpacing: tight ? 0 : 6, wordWrap: { width: innerW }, resolution: TEXT_RESOLUTION,
  }).setOrigin(0, 0);
  container.add(body);

  if (heldRecord && carrySize > 24) {
    container.add(
      createAnimalSprite(
        scene,
        box.x + box.w - CHROME.padX - carrySize / 2,
        box.y + box.h - CHROME.padY - carrySize / 2,
        heldRecord,
        { width: carrySize, height: carrySize },
      ).setDepth(4),
    );
  }

  const standing = panelCopy(state);
  const apply = (copy: PanelCopy | null): void => {
    const c = copy ?? standing;
    heading.setText(c.heading);
    heading.setColor(c.tone ? FEELING_SKIN[c.tone].ink : CHROME.ink);
    body.setText(c.body.join('\n'));
  };
  apply(null);
  return apply;
}

// ── The tray ─────────────────────────────────────────────────

/**
 * How the waiting animals are arranged in whatever rectangle the tray
 * was given — `fitChipGrid` with this screen's chip sizes.
 */
function trayGrid(
  count: number,
  box: { w: number; h: number },
): { rows: number; perRow: number; chipW: number; chipH: number } {
  return fitChipGrid(count, box, { gap: GAP, maxW: CHIP_MAX_W, maxH: CHIP_MAX_H });
}

function drawTray(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  box: Box,
  labelH: number,
): void {
  const { session } = state;
  const waiting = waitingToBoard(session);

  const label = scene.add.text(box.x, box.y, 'Waiting to board', {
    fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui, fontStyle: 'bold',
    color: CHROME.ink, resolution: TEXT_RESOLUTION,
  }).setOrigin(0, 0);
  container.add(
    createChromePlate(
      scene, box.x + label.width / 2 + SPACE.s, box.y + label.height / 2,
      label.width + SPACE.l, label.height + SPACE.s, { radius: 8, shadow: false },
    ),
  );
  container.add(label);

  const rowTop = box.y + labelH + SPACE.s;
  const areaH = Math.max(MIN_TAP, box.h - labelH - SPACE.s);

  if (waiting.length === 0) {
    container.add(
      scene.add.text(
        box.x + SPACE.s, rowTop + Math.min(areaH, MIN_TAP) / 2,
        heldAnimal(session)
          ? `Everybody else is already in ${state.vehicle.name}.`
          : `Everybody is in ${state.vehicle.name}.`,
        {
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui,
          color: CHROME.inkMuted, wordWrap: { width: box.w - SPACE.m },
          resolution: TEXT_RESOLUTION,
        },
      ).setOrigin(0, 0.5),
    );
    return;
  }

  const { perRow, chipW, chipH } = trayGrid(waiting.length, { w: box.w, h: areaH });

  waiting.forEach((animal, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = Math.min(perRow, waiting.length - row * perRow);
    const stripW = chipW * inRow + GAP * (inRow - 1);
    const startX = box.x + Math.max(0, (box.w - stripW) / 2);
    drawChip(scene, container, state, callbacks, setMessage, animal, {
      x: startX + col * (chipW + GAP),
      y: rowTop + row * (chipH + GAP),
      w: chipW,
      h: chipH,
    });
  });
}

function drawChip(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  animal: LoadableAnimal,
  box: Box,
): void {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  container.add(
    createChromePlate(scene, cx, cy, box.w, box.h, { radius: 10 }),
  );

  // The same tile a loaded bay draws, so a chip and the bay it lands in
  // are one object before and after the tap. The crate mark rides
  // along: a child can tell before she picks anybody up that the snake
  // wants the warm vivarium and the bat wants the quiet one.
  drawAnimalTile(
    scene, container, state.animalsById.get(animal.id), animal.name,
    crateDefFor(animal.species),
    {
      left: box.x,
      top: box.y,
      cx,
      cy,
      slotW: box.w,
      slotH: box.h,
      withName: true,
      rowWhenWide: false,
    },
  );

  const hit = scene.add.rectangle(
    cx, cy, Math.max(box.w, MIN_TAP), Math.max(box.h, MIN_TAP), 0x000000, 0,
  ).setInteractive({ useHandCursor: true });
  // Hovering a waiting animal reads out what it needs, before any tap.
  hit.on('pointerover', () => setMessage({
    heading: `${animal.name} the ${animal.species}`,
    tone: null,
    body: [
      `${animal.name} travels in a ${crateDefFor(animal.species).label.toLowerCase()}.`,
      'Tap to pick them up.',
    ],
  }));
  hit.on('pointerout', () => setMessage(null));
  hit.on('pointerdown', () => callbacks.onHoldFromTray(animal.id));
  container.add(hit);
}
