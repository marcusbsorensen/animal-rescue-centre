/**
 * crate-loading-view.ts
 *
 * The loading screen — where the child decides who travels and who
 * sits next to whom, between picking a vehicle and pulling out of the
 * bay.
 *
 * **This screen is the teaching surface.** Everything it draws exists
 * to answer one question in words a child can read: can these two
 * animals sit next to each other, and why. So the big panel on the
 * right is not a status line, it is the point of the screen, and it has
 * a fixed home that never moves between renders. Nothing here is on a
 * timer, nothing flashes, and nothing a child taps can lose her work.
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
} from '@arc/game-logic';
import { createAnimalSprite } from '../ui/sprites';
import { createChromeButton, createChromeTitle, createChromePlate } from '../ui/UIButton';
import {
  CHROME, COLOURS, FONTS, MIN_FONT, MIN_TAP, PAGE_MARGIN, SAFE_MARGIN, SPACE,
  TEXT_RESOLUTION, TITLE_CY, TYPE, bottomAnchorY, contentTopFor, hexNum,
} from '../ui/constants';

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
const GAP = SPACE.s;
/** A bay never grows past this, however much screen there is. */
const SLOT_MAX_W = 132;
const SLOT_MAX_H = 108;
/**
 * The tray is one row, so a chip is as wide as the row allows, within
 * these. The floor is the tap minimum rather than a width that reads
 * nicely: nine animals — the largest grid in the fleet — on the
 * narrowest landscape phone is the case that has to stay tappable, and
 * a name too wide for the chip is handled by `fitLabel`.
 */
const CHIP_MAX_W = 128;
const CHIP_MIN_W = MIN_TAP;

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
 * The crate an animal travels in, drawn.
 *
 * **No crate art exists yet**, so the crate reads as the emoji already
 * on its `CrateDef`. This function is the only place that decides how a
 * crate looks: when the art lands, it draws an image here and nothing
 * else in the screen changes.
 */
function makeCrateFace(
  scene: Phaser.Scene,
  x: number,
  y: number,
  crate: CrateDef,
  size: number,
): Phaser.GameObjects.GameObject {
  return scene.add.text(x, y, crate.emoji, {
    fontSize: `${size}px`,
    fontFamily: FONTS.body,
  }).setOrigin(0.5);
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
        'Tap a space in the van to put them down.',
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
      heading: 'The van is empty',
      tone: null,
      body: [
        'Tap an animal waiting to board, then tap a space in the van.',
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

  // ── Ground ──
  if (scene.textures.exists('site-gravel')) {
    container.add(scene.add.tileSprite(0, 0, width, height, 'site-gravel').setOrigin(0));
  } else {
    container.add(scene.add.rectangle(width / 2, height / 2, width, height, 0xcbb79a));
  }

  const title = createChromeTitle(scene, width / 2, TITLE_CY, `Load ${vehicle.name}`, {
    fontSize: TYPE.lead,
    subtitle: `off to ${state.destinationName}`,
  });
  container.add(title);

  // ── Bands ──
  const bandTop = contentTopFor(title);
  const buttonCy = bottomAnchorY(height);
  const trayH = Math.min(96, Math.max(76, height * 0.19));
  const trayTop = buttonCy - MIN_TAP / 2 - SPACE.m - trayH;
  const bandBottom = trayTop - SPACE.m;
  const bandH = Math.max(120, bandBottom - bandTop);

  const usable = width - PAGE_MARGIN * 2;
  const colGap = SPACE.xl;
  const gridColW = Math.round((usable - colGap) * 0.54);
  const panelColW = usable - colGap - gridColW;
  const gridColX = PAGE_MARGIN;
  const panelColX = gridColX + gridColW + colGap;

  // The panel first, because the grid and the tray both repaint it on
  // hover and need the setter it hands back. It is sized for its
  // longest copy — a heading and five lines — rather than for the band,
  // and pinned to the top of it: a panel that changed height with its
  // contents would move the words a child is reading.
  const panelH = Math.min(bandH, CHROME.padY * 2 + 34 + 5 * 26);
  const setMessage = drawPanel(scene, container, state, {
    x: panelColX, y: bandTop, w: panelColW, h: panelH,
  });

  drawGrid(scene, container, state, callbacks, setMessage, {
    x: gridColX, y: bandTop, w: gridColW, h: bandH,
  });

  drawTray(scene, container, state, callbacks, setMessage, {
    x: PAGE_MARGIN, y: trayTop, w: usable, h: trayH,
  });

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

// ── The grid ─────────────────────────────────────────────────

interface Box { x: number; y: number; w: number; h: number }

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

function drawGrid(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  box: Box,
): void {
  const { session, vehicle } = state;
  const { cols, rows } = session.grid;

  const slotW = Math.min(SLOT_MAX_W, Math.floor((box.w - GAP * (cols - 1) - SPACE.m * 2) / cols));
  const slotH = Math.min(SLOT_MAX_H, Math.floor((box.h - GAP * (rows - 1) - SPACE.m * 2) / rows));
  const gridW = slotW * cols + GAP * (cols - 1);
  const gridH = slotH * rows + GAP * (rows - 1);
  const originX = box.x + (box.w - gridW) / 2;
  const originY = box.y + (box.h - gridH) / 2;

  // The van floor the bays sit on — the same dark brown this scene's
  // destination strip already uses, so the fleet screens agree.
  const floor = scene.add.graphics();
  floor.fillStyle(0x4a3f2e, 0.92);
  floor.fillRoundedRect(
    originX - SPACE.m, originY - SPACE.m, gridW + SPACE.m * 2, gridH + SPACE.m * 2, 12,
  );
  container.add(floor);

  container.add(
    scene.add.text(
      originX + gridW / 2, originY - SPACE.m - SPACE.s,
      `${vehicle.name} has ${vehicle.slots} ${vehicle.slots === 1 ? 'space' : 'spaces'}`,
      {
        // Ink, not the bay-label cream the picker uses: this line sits on
        // the gravel above the van floor, not on the dark slab, and cream
        // on gravel is the one pairing in this screen that does not read.
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui, fontStyle: 'bold',
        color: CHROME.ink, resolution: TEXT_RESOLUTION,
      },
    ).setOrigin(0.5, 1),
  );

  const slotCentre = (slot: number) => ({
    x: originX + (slot % cols) * (slotW + GAP) + slotW / 2,
    y: originY + Math.floor(slot / cols) * (slotH + GAP) + slotH / 2,
  });

  for (let slot = 0; slot < slotCount(session); slot += 1) {
    const { x: cx, y: cy } = slotCentre(slot);
    const crate = crateAt(session, slot);
    const outlook = slotOutlook(session, slot);

    const bay = scene.add.graphics();
    if (crate) {
      bay.fillStyle(CHROME.fill, CHROME.fillAlpha);
      bay.fillRoundedRect(cx - slotW / 2, cy - slotH / 2, slotW, slotH, 10);
      bay.lineStyle(2, CHROME.stroke, 1);
      bay.strokeRoundedRect(cx - slotW / 2, cy - slotH / 2, slotW, slotH, 10);
    } else if (outlook) {
      // Holding an animal lights every empty bay with what it would do
      // to her — the one moment this screen uses colour at full
      // strength, and it still carries the mark and the word on top.
      const skin = FEELING_SKIN[outlook];
      bay.fillStyle(skin.fill, 0.95);
      bay.fillRoundedRect(cx - slotW / 2, cy - slotH / 2, slotW, slotH, 10);
      bay.lineStyle(3, skin.stroke, 1);
      bay.strokeRoundedRect(cx - slotW / 2, cy - slotH / 2, slotW, slotH, 10);
    } else {
      // An empty bay is a recess in the van floor with a painted
      // outline, which is what the picker's parking bays already are —
      // darker than the floor rather than a paler crate, so "there is
      // nobody here" never has to be read as "there is something here".
      bay.fillStyle(0x2f2820, 0.38);
      bay.fillRoundedRect(cx - slotW / 2, cy - slotH / 2, slotW, slotH, 10);
      bay.lineStyle(2, 0xf2ead6, 0.7);
      bay.strokeRoundedRect(cx - slotW / 2, cy - slotH / 2, slotW, slotH, 10);
    }
    container.add(bay);

    if (crate) {
      const animal = state.animalsById.get(crate.animalId);
      const nameRow = MIN_FONT.small + 4;
      const artH = slotH - nameRow - 8;
      if (animal) {
        container.add(
          createAnimalSprite(scene, cx, cy - nameRow / 2, animal, {
            width: slotW - 16, height: artH,
          }),
        );
        container.add(
          fitLabel(scene, cx, cy + slotH / 2 - nameRow / 2 - 2, animal.name, slotW - 8, {
            fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui, fontStyle: 'bold',
            color: CHROME.ink, resolution: TEXT_RESOLUTION,
          }),
        );
      }
      container.add(
        makeCrateFace(
          scene, cx - slotW / 2 + 14, cy - slotH / 2 + 14, crateDefFor(crate.species), 18,
        ),
      );
    } else if (outlook) {
      container.add(makeFeelingBadge(scene, cx, cy, outlook, { withWord: slotH >= 62 }));
    }

    // Hit area floored at MIN_TAP, per the idiom on that constant.
    const hit = scene.add.rectangle(
      cx, cy, Math.max(slotW, MIN_TAP), Math.max(slotH, MIN_TAP), 0x000000, 0,
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
 */
function drawPanel(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  box: Box,
): (copy: PanelCopy | null) => void {
  const plate = createChromePlate(scene, box.x + box.w / 2, box.y + box.h / 2, box.w, box.h);
  container.add(plate);

  const innerW = box.w - CHROME.padX * 2;
  const headingY = box.y + CHROME.padY + SPACE.xs;

  const heading = scene.add.text(box.x + CHROME.padX, headingY, '', {
    fontSize: TYPE.lead, fontFamily: FONTS.ui, fontStyle: 'bold',
    color: CHROME.ink, wordWrap: { width: innerW }, resolution: TEXT_RESOLUTION,
  }).setOrigin(0, 0);
  container.add(heading);

  const body = scene.add.text(box.x + CHROME.padX, headingY + 34, '', {
    fontSize: TYPE.body, fontFamily: FONTS.ui, color: CHROME.ink,
    lineSpacing: 6, wordWrap: { width: innerW }, resolution: TEXT_RESOLUTION,
  }).setOrigin(0, 0);
  container.add(body);

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

function drawTray(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  box: Box,
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

  const rowTop = box.y + label.height + SPACE.s;
  const rowH = Math.max(MIN_TAP, box.h - (label.height + SPACE.s));

  if (waiting.length === 0) {
    container.add(
      scene.add.text(
        box.x + SPACE.s, rowTop + rowH / 2,
        heldAnimal(session)
          ? 'Everybody else is already in the van.'
          : 'Everybody is in the van.',
        {
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui,
          color: CHROME.inkMuted, resolution: TEXT_RESOLUTION,
        },
      ).setOrigin(0, 0.5),
    );
    return;
  }

  const chipW = Math.max(
    CHIP_MIN_W,
    Math.min(CHIP_MAX_W, Math.floor((box.w - GAP * (waiting.length - 1)) / waiting.length)),
  );
  const stripW = chipW * waiting.length + GAP * (waiting.length - 1);
  const startX = box.x + Math.max(0, (box.w - stripW) / 2);

  waiting.forEach((animal, i) => {
    drawChip(scene, container, state, callbacks, setMessage, animal, {
      x: startX + i * (chipW + GAP), y: rowTop, w: chipW, h: rowH,
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
    createChromePlate(scene, cx, cy, box.w, box.h, { radius: 10, shadow: false }),
  );

  const nameRow = MIN_FONT.small + 2;
  const record = state.animalsById.get(animal.id);
  if (record) {
    container.add(
      createAnimalSprite(scene, cx, cy - nameRow / 2, record, {
        width: box.w - 12, height: box.h - nameRow - 8,
      }),
    );
  }
  container.add(
    fitLabel(scene, cx, box.y + box.h - nameRow / 2 - 2, animal.name, box.w - 8, {
      fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui, fontStyle: 'bold',
      color: CHROME.ink, resolution: TEXT_RESOLUTION,
    }),
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
