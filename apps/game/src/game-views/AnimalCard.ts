import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import {
  SPECIES_COLOURS,
  canLetOutside,
  getUrgentNeed,
  getGarmentForSpecies,
  needsCoat,
  pickRandomFact,
  walkBlockReason,
  type IllnessDef,
} from '@arc/game-logic';
import { createChromeButton } from '../ui/UIButton';
import { createAnimalSprite } from '../ui/sprites';
import { COLOURS, FONTS, TEXT_RESOLUTION, COLLAR_COLOURS, MIN_TAP, MIN_TAP_GAP } from '../ui/constants';
import {
  animalCardLayout, moreGridLayout, CARD_PAD, MORE_REASON_H,
  type AnimalCardLayout, type Rect,
} from '../ui/animal-card-layout';
import type { GameStateStore } from '../game-state';

/**
 * AnimalCard — what a child sees when she taps an animal.
 *
 * Replaces AnimalDetailsPopup, which showed five stat bars with
 * percentages on them, the arrival story, and up to eight action buttons
 * in one column, then sized itself by adding all of that up. On a
 * landscape phone the sum reached 466px against a 375px screen and there
 * is nothing in GameScene that scrolls.
 *
 * The redesign is in docs/ux-review-2026-08-29.md. Three things a child is
 * actually deciding between, in this order:
 *
 *   1. Who is this?          portrait, name, species
 *   2. How are they?         one state sentence, four need rows, bond
 *   3. What can I do?        two primary actions that never move, plus More
 *
 * Everything conditional is on the More face, where each action is always
 * present and greyed with the reason when it is unavailable — a button
 * that vanishes teaches nothing, one that says "Too sleepy for a walk"
 * teaches the rule. The story and the fact get their own face, reached by
 * tapping the portrait, so they cost a child who does not want them
 * nothing.
 *
 * The card is a modal: it renders into its own container at depth 800,
 * above the HUD and the nav bar. The old popup drew into gameContainer at
 * depth 0, so the chrome stayed lit and stayed tappable behind it.
 *
 * Stateless with respect to the game: every mutation and scene transition
 * is a callback, exactly as before, so the flow stays owned by the scene.
 */

export interface AnimalCardCallbacks {
  /** Close the card (the scene destroys the container and re-renders). */
  onClose: () => void;
  /** Feed action — mutate + SFX + bond check + close + rerender. */
  onFeed: () => void;
  /** Play action — same shape as onFeed. */
  onPlay: () => void;
  /** Open WalkScene with a completion callback. */
  onWalk: () => void;
  /** Open GroomingScene. */
  onGroom: () => void;
  /** Open the vet flow for a shelter animal. */
  onHeal: () => void;
  /** Open the vet flow for a pet. */
  onTakeToVet: () => void;
  /** Navigate to the garden view. */
  onVisitGarden: () => void;
  /** Let a sheltered/bonding animal out into the garden. */
  onLetOutside: () => void;
  /** Bring an outsider back indoors. */
  onBringInside: () => void;
  /** Open the wardrobe picker for the species' garment. */
  onEquipWardrobe: () => void;
  /** Open the Paths panel. Unlocks at PATHS_UNLOCK_BOND. */
  onOpenPaths?: () => void;
}

/** Bond level at which the Paths panel unlocks. */
export const PATHS_UNLOCK_BOND = 50;

/** Cleanliness below which grooming is offered. */
const GROOM_THRESHOLD = 60;

/** Which face of the card is showing. */
type Face = 'main' | 'more' | 'story';

/**
 * One entry on the More face. `run` undefined means unavailable, and then
 * `reason` says why — the two always travel together.
 */
interface CardAction {
  label: string;
  icon?: string;
  /** 'glyph' for the white line drawings — see `createChromeButton`. */
  iconStyle?: 'artwork' | 'glyph';
  run?: () => void;
  reason?: string;
}

export function renderAnimalCard(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  callbacks: AnimalCardCallbacks,
): void {
  const draw = (face: Face) => {
    container.removeAll(true);
    const { width, height } = scene.scale;
    const layout = animalCardLayout(width, height);
    const accent = SPECIES_COLOURS[animal.species] ?? 0xd9c8a8;

    drawScrim(scene, container, width, height, callbacks.onClose);
    drawCardBody(scene, container, layout.card, accent);

    if (face === 'main') drawMainFace(scene, store, container, animal, layout, accent, callbacks, draw);
    else if (face === 'more') drawMoreFace(scene, store, container, animal, layout, callbacks, draw);
    else drawStoryFace(scene, container, animal, layout, callbacks, draw);
  };

  draw('main');
}

// ── Chrome ───────────────────────────────────────────────────────

/**
 * Full-screen dim. Interactive, so it both darkens the scene and swallows
 * every tap that misses the card — including taps on the HUD orbs and the
 * nav bar, which the old popup left live underneath itself.
 */
function drawScrim(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  height: number,
  onClose: () => void,
): void {
  const scrim = scene.add
    .rectangle(width / 2, height / 2, width, height, 0x000000, 0.42)
    .setInteractive();
  scrim.on('pointerdown', () => onClose());
  container.add(scrim);
}

function drawCardBody(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  card: Rect,
  accent: number,
): void {
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.24);
  shadow.fillRoundedRect(card.x + 4, card.y + 7, card.w, card.h, 22);
  container.add(shadow);

  const body = scene.add.graphics();
  body.fillStyle(0xfffaf0, 1);
  body.fillRoundedRect(card.x, card.y, card.w, card.h, 22);
  body.lineStyle(3, accent, 0.6);
  body.strokeRoundedRect(card.x, card.y, card.w, card.h, 22);
  container.add(body);
}

/**
 * A glyph with a MIN_TAP hit circle behind it.
 *
 * A bare interactive text gave Phaser an ~11x18px hit box — a quarter of
 * the target floor — which is what the close X used to be.
 */
function iconTarget(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  spot: { cx: number; cy: number; r: number },
  glyph: string,
  onTap: () => void,
): void {
  const hit = scene.add.circle(spot.cx, spot.cy, spot.r, 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerdown', onTap);
  container.add(hit);
  container.add(
    scene.add.text(spot.cx, spot.cy, glyph, {
      fontSize: '22px', fontFamily: FONTS.body, color: COLOURS.textLight,
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5),
  );
}

// ── Main face ────────────────────────────────────────────────────

function drawMainFace(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  layout: AnimalCardLayout,
  accent: number,
  callbacks: AnimalCardCallbacks,
  draw: (face: Face) => void,
): void {
  const illness = store.sickAnimals.get(animal.id);

  iconTarget(scene, container, layout.close, '✕', () => callbacks.onClose());

  drawPortrait(scene, container, animal, layout, accent, () => draw('story'));

  // Name and species. The species line is the plain-English answer to
  // "what kind of animal is this?" — a tortoiseshell cat, not `cat`.
  const speciesLabel = animal.variant ? `${animal.variant} ${animal.species}` : animal.species;
  container.add(fitText(
    scene.add.text(layout.name.x, layout.name.y, animal.name, {
      fontSize: '24px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }),
    layout.name.w, 18,
  ));
  container.add(fitText(
    scene.add.text(layout.species.x, layout.species.y, `a ${speciesLabel}`, {
      fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
      resolution: TEXT_RESOLUTION,
    }),
    layout.species.w, 14,
  ));

  drawStateChip(scene, container, animal, illness, layout.chip);
  drawBondHearts(scene, container, animal, layout.bond);
  drawNeedDots(scene, container, animal, layout.dots);
  drawFact(scene, container, animal, layout.fact);

  // Two primary actions and More, always in the same three places
  // whatever the animal's state. This is what removed the variable panel
  // height: the conditional actions no longer live on this face.
  const [feedX, playX, moreX] = layout.actions.xs;
  const btn = { width: layout.actions.w, height: layout.actions.h, fontSize: '18px' };
  // Feed and Play are what a child does to the animal; More… opens a
  // drawer. So the two are filled and the third is a plate — which is the
  // "two primary actions and More" above, said in the surface instead of
  // in a comment. It also puts back the one thing the old orange/green/
  // blue was carrying honestly: that the third button is a different kind
  // of thing. The icons and the labels say which of the first two is
  // which, as they always did.
  container.add(createChromeButton(
    scene, feedX, layout.actions.y + layout.actions.h / 2,
    'Feed', () => callbacks.onFeed(),
    { ...btn, icon: 'icon-feed', variant: 'filled' },
  ));
  container.add(createChromeButton(
    scene, playX, layout.actions.y + layout.actions.h / 2,
    'Play', () => callbacks.onPlay(),
    { ...btn, icon: 'icon-play', variant: 'filled' },
  ));
  container.add(createChromeButton(
    scene, moreX, layout.actions.y + layout.actions.h / 2,
    'More…', () => draw('more'),
    { ...btn },
  ));
}

/**
 * The animal, in the panel that talks about them.
 *
 * Drawn from the same texture the room uses, via the same
 * `createAnimalSprite`, so a sick animal looks sick in her own card.
 * The sprite is fitted inside the box it is handed, so a square box is
 * all this needs — it used to draw at twice the box and had to be
 * measured and refitted afterwards.
 */
function drawPortrait(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  layout: AnimalCardLayout,
  accent: number,
  onTap: () => void,
): void {
  const { cx, cy, size } = layout.portrait;

  const plate = scene.add.graphics();
  plate.fillStyle(accent, 0.14);
  plate.fillRoundedRect(cx - size / 2, cy - size / 2, size, size, 18);
  plate.lineStyle(2, accent, 0.35);
  plate.strokeRoundedRect(cx - size / 2, cy - size / 2, size, size, 18);
  container.add(plate);

  const inner = size - 12;
  const sprite = createAnimalSprite(scene, cx, cy, animal, { width: inner, height: inner });
  container.add(sprite);

  // Tapping the animal turns the card over. The hint is what makes that
  // discoverable — an undiscoverable second face is the same as no
  // second face.
  const hit = scene.add.rectangle(cx, cy, size, size, 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerdown', onTap);
  container.add(hit);
  // The hint sits over the animal's feet — there is no room below the
  // plate on a compact card — so it gets its own ground to be read on.
  const hintCy = cy + size / 2 - 12;
  const hintPill = scene.add.graphics();
  hintPill.fillStyle(0xfffaf0, 0.86);
  // 14px is the floor for body text (review F1-F5); the pill grows with it
  // rather than letting the label crowd its own ground.
  hintPill.fillRoundedRect(cx - 37, hintCy - 10, 74, 20, 10);
  container.add(hintPill);
  container.add(
    scene.add.text(cx, hintCy, 'My story', {
      fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5),
  );
}

/**
 * One state, said as a sentence with the animal's name in it.
 *
 * Five simultaneous readings is not a state a 7-year-old can act on, and
 * the old panel gave five bars with no ranking between them.
 * `getUrgentNeed` already picks the one that matters and the HUD and rail
 * counts already use it, so the card says the same thing they do.
 */
function drawStateChip(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  illness: IllnessDef | undefined,
  rect: Rect,
): void {
  let icon = 'ui-happy-icon';
  let sentence = `${animal.name} is happy and settled.`;
  let tone = 0x3d8a2e;

  if (illness) {
    icon = 'ui-health-icon';
    sentence = `${animal.name} has a ${illness.label.toLowerCase()}.`;
    tone = 0xc0392b;
  } else {
    switch (getUrgentNeed(animal)) {
      case 'hunger':
        icon = 'ui-hunger-icon'; sentence = `${animal.name} is hungry.`; tone = 0xa85a28; break;
      case 'tiredness':
        icon = 'ui-sleep-icon'; sentence = `${animal.name} is sleepy.`; tone = 0x2e6b8a; break;
      case 'happiness':
        icon = 'ui-happy-icon'; sentence = `${animal.name} is feeling lonely.`; tone = 0x2e6b8a; break;
      case 'health':
        icon = 'ui-health-icon'; sentence = `${animal.name} is not feeling well.`; tone = 0xc0392b; break;
      case 'cleanliness':
        icon = 'ui-happy-icon'; sentence = `${animal.name} is feeling grubby.`; tone = 0xa85a28; break;
      default: break;
    }
  }

  const plate = scene.add.graphics();
  plate.fillStyle(tone, 0.1);
  plate.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  container.add(plate);

  const iconCx = rect.x + 6 + rect.h / 2;
  if (scene.textures.exists(icon)) {
    container.add(
      scene.add.image(iconCx, rect.y + rect.h / 2, icon)
        .setDisplaySize(24, 24).setOrigin(0.5),
    );
  }
  const textX = iconCx + rect.h / 2 + 2;
  container.add(fitText(
    scene.add.text(textX, rect.y + rect.h / 2, sentence, {
      fontSize: '19px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0.5),
    rect.x + rect.w - 10 - textX, 15,
  ));
}

/**
 * Bond as five hearts and a count.
 *
 * "Best friends: 3 of 5" is countable; `Bond 47%` is not — percentages
 * are Year 6 in the England curriculum, so for most of this game's
 * audience the number was decoration.
 *
 * The hearts are drawn rather than typed: `♥` falls through to the colour
 * emoji font on iOS, which would put a red heart next to a grey one and
 * make hue the difference rather than fill.
 */
function drawBondHearts(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  rect: Rect,
): void {
  const filled = heartsFor(animal.bondLevel);
  const g = scene.add.graphics();
  const size = 18;
  const pitch = 22;
  for (let i = 0; i < 5; i++) {
    heartPath(g, rect.x + size / 2 + i * pitch, rect.y + rect.h / 2, size,
      i < filled ? 0xd44040 : 0x000000, i < filled ? 1 : 0.14);
  }
  container.add(g);

  container.add(
    scene.add.text(rect.x + 5 * pitch + 6, rect.y + rect.h / 2,
      `Best friends: ${filled} of 5`, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
  );
}

/** Five equal steps, so a full heart is always 20 more bond than the last. */
function heartsFor(bondLevel: number): number {
  return Math.max(0, Math.min(5, Math.floor(bondLevel / 20)));
}

function heartPath(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number, size: number,
  colour: number, alpha: number,
): void {
  const r = size / 4;
  g.fillStyle(colour, alpha);
  g.fillCircle(cx - r * 0.95, cy - r * 0.55, r);
  g.fillCircle(cx + r * 0.95, cy - r * 0.55, r);
  g.fillTriangle(
    cx - r * 1.92, cy - r * 0.15,
    cx + r * 1.92, cy - r * 0.15,
    cx, cy + r * 1.95,
  );
}

/**
 * Four needs, five dots each, and dots always mean the same thing: more
 * dots is more of the good version of that thing.
 *
 * The old panel drew Hunger and Tired as bars that *shrank* as the player
 * helped, in the same visual form as three that grew, with red against
 * green as the only cue — the most common colour-vision confusion. Filled
 * against empty is a shape difference, so nothing here is carried by hue.
 */
function drawNeedDots(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  rect: Rect,
): void {
  const groups: Array<[string, string, number]> = [
    ['ui-hunger-icon', 'Fed', 100 - animal.hunger],
    ['ui-sleep-icon', 'Rested', 100 - animal.tiredness],
    ['ui-happy-icon', 'Happy', animal.happiness],
    ['ui-health-icon', 'Health', animal.health],
  ];
  const groupW = rect.w / groups.length;
  const labelCy = rect.y + 10;
  const dotsCy = rect.y + rect.h - 9;
  const g = scene.add.graphics();

  groups.forEach(([iconKey, label, value], i) => {
    const gcx = rect.x + groupW * (i + 0.5);

    const text = scene.add.text(0, labelCy, label, {
      fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0.5);
    const hasIcon = scene.textures.exists(iconKey);
    const iconW = hasIcon ? 18 : 0;
    const gap = hasIcon ? 5 : 0;
    const startX = gcx - (iconW + gap + text.width) / 2;
    if (hasIcon) {
      container.add(
        scene.add.image(startX + iconW / 2, labelCy, iconKey)
          .setDisplaySize(iconW, iconW).setOrigin(0.5),
      );
    }
    text.setX(startX + iconW + gap);
    container.add(text);

    const filled = dotsFor(value);
    const pitch = 15;
    const dotsL = gcx - (4 * pitch) / 2;
    for (let d = 0; d < 5; d++) {
      if (d < filled) {
        g.fillStyle(0x3a2e22, 0.85);
        g.fillCircle(dotsL + d * pitch, dotsCy, 5.5);
      } else {
        g.fillStyle(0x3a2e22, 0.12);
        g.fillCircle(dotsL + d * pitch, dotsCy, 5.5);
        g.lineStyle(1.5, 0x3a2e22, 0.3);
        g.strokeCircle(dotsL + d * pitch, dotsCy, 5.5);
      }
    }
  });

  container.add(g);
}

/** 0-100 into 0-5 dots. 0 stays empty; anything at all shows one. */
function dotsFor(value: number): number {
  if (value <= 0) return 0;
  return Math.max(1, Math.min(5, Math.round(value / 20)));
}

/**
 * A species fact, from the set already written for the arrival popup and
 * used nowhere else. Seeded off the animal's id rather than random, so a
 * child who reopens Luna's card gets Luna's fact rather than a shuffle.
 */
function drawFact(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  spot: { x: number; y: number; w: number },
): void {
  const fact = pickRandomFact(animal.species, animal.variant, seededRng(animal.id));
  if (!fact) return;
  // No "Did you know?" prefix. Measured: the longest shipped fact is 66
  // characters and renders 470px at 15px, inside the 528 this line has;
  // the prefix adds ~98px, which pushes those facts down to 13px to fit.
  // 15px is the floor for a line meant to be read, and the icon already
  // says what the line is.
  container.add(fitText(
    scene.add.text(spot.x, spot.y, `${fact.icon} ${fact.fact}`, {
      fontSize: '15px', fontFamily: FONTS.body, color: COLOURS.textLight,
      resolution: TEXT_RESOLUTION,
    }),
    spot.w, 13,
  ));
}

// ── More face ────────────────────────────────────────────────────

function drawMoreFace(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  layout: AnimalCardLayout,
  callbacks: AnimalCardCallbacks,
  draw: (face: Face) => void,
): void {
  const actions = buildActions(store, animal, callbacks);
  const grid = moreGridLayout(layout.card, actions.length);

  iconTarget(scene, container, grid.back, '←', () => draw('main'));
  iconTarget(scene, container, grid.close, '✕', () => callbacks.onClose());
  container.add(fitText(
    scene.add.text(grid.title.x, grid.title.y + 15,
      `What else can I do for ${animal.name}?`, {
        fontSize: '19px', fontFamily: FONTS.title, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    grid.title.w, 15,
  ));

  actions.forEach((action, i) => {
    const cell = grid.cells[i];
    const available = !!action.run;
    // An unavailable action is a plate, an available one is filled. The
    // grey fill it used to get said "button, but wrong"; an empty plate
    // beside filled ones reads as not-yet-a-button, which is what it is.
    // The 0.72 stays — it is what separates this from a plate that simply
    // is not the screen's main action.
    const button = createChromeButton(
      scene, cell.x + cell.w / 2, cell.y + grid.buttonH / 2,
      action.label,
      () => action.run?.(),
      {
        width: cell.w,
        height: grid.buttonH,
        fontSize: '17px',
        icon: action.icon,
        iconStyle: action.iconStyle,
        variant: available ? 'filled' : 'plate',
      },
    );
    if (!available) button.setAlpha(0.72);
    container.add(button);

    // The reason is the point of showing an unavailable action at all.
    const caption = available ? '' : (action.reason ?? '');
    if (caption) {
      container.add(
        scene.add.text(cell.x + cell.w / 2, cell.y + grid.buttonH + 5, caption, {
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.textLight,
          align: 'center', wordWrap: { width: cell.w },
          maxLines: Math.max(1, Math.floor(MORE_REASON_H / 17)),
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5, 0),
      );
    }
  });
}

/**
 * Every conditional action, in a fixed order, present whether or not it
 * can be used.
 *
 * Fixed order matters as much as the reasons do: the Walk button is in
 * the same place on every animal on every visit, so a child builds muscle
 * memory instead of re-reading the panel each time. That was impossible
 * on the old popup, where the rows present depended on the animal's
 * state and everything below a missing one moved up.
 */
function buildActions(
  store: GameStateStore,
  animal: Animal,
  callbacks: AnimalCardCallbacks,
): CardAction[] {
  const illness: IllnessDef | undefined = store.sickAnimals.get(animal.id);
  const isPet = animal.state === 'pet';
  const weather = store.gardenWeather?.current;

  if (isPet) {
    return [
      {
        label: 'Visit the\ngarden', icon: 'icon-garden',
        run: () => callbacks.onVisitGarden(),
      },
      // The illness name is in the state chip on the main face, not baked
      // into the button — a label that changes length with the data is
      // what makes a fixed-width cell overflow.
      {
        label: 'See the\nvet', icon: 'icon-vet',
        run: illness ? () => callbacks.onTakeToVet() : undefined,
        reason: illness ? undefined : `${animal.name} is perfectly well.`,
      },
    ];
  }

  const walkBlock = walkBlockReason(animal);
  const cleanliness = animal.cleanliness ?? 100;
  const groomBlock = illness
    ? 'They need to get well first.'
    : cleanliness >= GROOM_THRESHOLD
      ? `${animal.name} is already lovely and clean.`
      : null;

  const isOutside = !!animal.outsideAt;
  const letOut = isOutside
    ? { ok: false as const, reason: '' }
    : canLetOutside(animal, store.animals, store.sickAnimals, weather);

  const garment = getGarmentForSpecies(animal.species);
  const wantsGarment = !!weather && needsCoat(animal, weather);
  const garmentBlock = animal.wardrobe
    ? `Already wearing a ${garment}.`
    : !wantsGarment
      ? 'The weather is fine — no need today.'
      : null;

  return [
    {
      label: 'Go for\na walk', icon: 'icon-walk', iconStyle: 'glyph',
      run: walkBlock ? undefined : () => callbacks.onWalk(),
      reason: walkBlock ?? undefined,
    },
    {
      label: 'Brush\nand groom',
      run: groomBlock ? undefined : () => callbacks.onGroom(),
      reason: groomBlock ?? undefined,
    },
    {
      label: 'See the\nvet', icon: 'icon-vet',
      run: illness ? () => callbacks.onHeal() : undefined,
      reason: illness ? undefined : `${animal.name} is perfectly well.`,
    },
    isOutside
      ? {
        label: 'Bring\ninside', icon: 'icon-home',
        run: () => callbacks.onBringInside(),
      }
      : {
        label: 'Go\noutside', icon: 'icon-garden',
        run: letOut.ok ? () => callbacks.onLetOutside() : undefined,
        reason: letOut.ok ? undefined : letOut.reason,
      },
    {
      label: `Put on\na ${garment}`,
      run: garmentBlock ? undefined : () => callbacks.onEquipWardrobe(),
      reason: garmentBlock ?? undefined,
    },
    {
      label: 'What happens\nnext?',
      run: animal.bondLevel >= PATHS_UNLOCK_BOND && callbacks.onOpenPaths
        ? () => callbacks.onOpenPaths!()
        : undefined,
      reason: animal.bondLevel >= PATHS_UNLOCK_BOND
        ? (callbacks.onOpenPaths ? undefined : 'Not just yet.')
        : `Play together more — ${animal.name} isn't ready to decide.`,
    },
  ];
}

// ── Story face ───────────────────────────────────────────────────

/**
 * The arrival story, the fact in full, and the bond — the things that are
 * lovely and are not decision inputs. On their own face so they cost a
 * child who came to feed an animal nothing, and reward the one who came
 * to know it.
 */
function drawStoryFace(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  layout: AnimalCardLayout,
  callbacks: AnimalCardCallbacks,
  draw: (face: Face) => void,
): void {
  const grid = moreGridLayout(layout.card, 0);
  iconTarget(scene, container, grid.back, '←', () => draw('main'));
  iconTarget(scene, container, grid.close, '✕', () => callbacks.onClose());
  container.add(fitText(
    scene.add.text(grid.title.x, grid.title.y + 15, `${animal.name}'s story`, {
      fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0.5),
    grid.title.w, 16,
  ));

  const left = layout.card.x + CARD_PAD;
  const w = layout.card.w - CARD_PAD * 2;
  let y = layout.card.y + CARD_PAD + MIN_TAP + MIN_TAP_GAP;

  const story = scene.add.text(left, y, `“${animal.arrivalStory}”`, {
    fontSize: '17px', fontFamily: FONTS.body, fontStyle: 'italic',
    color: COLOURS.text, wordWrap: { width: w }, maxLines: 4,
    resolution: TEXT_RESOLUTION,
  });
  container.add(story);
  y += story.height + 12;

  const fact = pickRandomFact(animal.species, animal.variant, seededRng(animal.id));
  if (fact) {
    const factText = scene.add.text(left, y, `${fact.icon} ${fact.fact}`, {
      fontSize: '15px', fontFamily: FONTS.body, color: COLOURS.textLight,
      wordWrap: { width: w }, maxLines: 2, resolution: TEXT_RESOLUTION,
    });
    container.add(factText);
    y += factText.height + 12;
  }

  if (animal.state === 'pet') {
    const hex = animal.collarColour ?? '#ff6b9d';
    const name = COLLAR_COLOURS.find((c) => c.hex === hex)?.name ?? 'Custom';
    container.add(
      scene.add.circle(left + 9, y + 10, 8,
        Phaser.Display.Color.HexStringToColor(hex).color)
        .setStrokeStyle(1, 0x000000, 0.2),
    );
    container.add(
      scene.add.text(left + 26, y + 10, `${name} collar`, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    );
  }

  // Bond hearts pinned to the bottom, so the card ends the same way both
  // faces do however long the story runs.
  drawBondHearts(scene, container, animal, {
    x: left,
    y: layout.card.y + layout.card.h - CARD_PAD - 24,
    w,
    h: 24,
  });
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Shrink a single-line text until it fits, then trim it as a last resort.
 *
 * Names, illness labels and species facts are all data, and a card that
 * is a fixed size has to survive the long ones. The floor is passed in
 * rather than assumed: 15px is the readability floor for a name or a
 * sentence, but a decorative fact line can go lower before it hurts.
 */
function fitText(
  text: Phaser.GameObjects.Text,
  maxW: number,
  minSize: number,
): Phaser.GameObjects.Text {
  if (maxW <= 0) return text;
  let size = parseInt(String(text.style.fontSize), 10) || minSize;
  while (text.width > maxW && size > minSize) {
    size -= 1;
    text.setFontSize(size);
  }
  if (text.width > maxW) {
    const words = text.text.split(' ');
    while (words.length > 1 && text.width > maxW) {
      words.pop();
      text.setText(`${words.join(' ')}…`);
    }
  }
  return text;
}

/**
 * A deterministic 0-1 source keyed on a string.
 *
 * Only used to pick a species fact, so it needs to be stable and spread,
 * not statistically good.
 */
function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
