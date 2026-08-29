import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import {
  SPECIES_COLOURS,
  canGoOnWalk,
  canLetOutside,
  getNeedSpeech,
  getGarmentForSpecies,
  needsCoat,
  type IllnessDef,
} from '@arc/game-logic';
import { createButton } from '../ui/UIButton';
import { COLOURS, FONTS, TEXT_RESOLUTION, COLLAR_COLOURS, MIN_TAP } from '../ui/constants';
import type { GameStateStore } from '../game-state';

/**
 * AnimalDetailsPopup — the speech-bubble-style info/action panel that
 * pops up when an animal is tapped.
 *
 * Phase 5 extraction. This is the largest single popup in the game —
 * ~400 LOC of panel geometry + stats + action buttons depending on
 * animal state (shelter vs pet, sick vs healthy, walkable vs not).
 *
 * Stateless render function. State mutation + scene transitions live
 * in the scene's callbacks so the flow remains owned by the scene.
 */

export interface AnimalDetailsCallbacks {
  /** Close the popup (scene typically sets selectedAnimal = undefined + renderView). */
  onClose: () => void;
  /** Feed action — mutate + SFX + bond check + close + rerender. */
  onFeed: () => void;
  /** Play action — same shape as onFeed. */
  onPlay: () => void;
  /** Open WalkScene with a completion callback. */
  onWalk: () => void;
  /** Open GroomingScene. */
  onGroom: () => void;
  /** Open VetScene (shelter animal variant). */
  onHeal: () => void;
  /** Open VetScene (pet variant). */
  onTakeToVet: () => void;
  /** Navigate to the garden view. */
  onVisitGarden: () => void;

  /**
   * Let a sheltered/bonding animal out into the garden. Applies the
   * letOutside mutation from game-logic, records a `garden_let_out`
   * care-task tick, saves state, and re-renders. Caller should first
   * verify via `canLetOutside(animal, ..., weather).ok === true`.
   */
  onLetOutside: () => void;

  /**
   * Bring an outsider (animal with `outsideAt` set) back indoors.
   * If they're a rain-loving species that got wet, also marks `wet: true`
   * so the shake-off comedy can fire.
   */
  onBringInside: () => void;

  /**
   * Open the wardrobe picker to equip the species' garment
   * (coat / scarf / hat depending on species). The picker UI is
   * handled by the scene; this popup just triggers it.
   */
  onEquipWardrobe: () => void;

  /**
   * Open the Paths panel (Forever family / Rewild / Stay at A.R.C.).
   * Only shown for shelter animals whose bondLevel has reached ≥ 50 —
   * the player has "earned knowing this animal" and can aspire to a
   * future for them.
   */
  onOpenPaths?: () => void;
}

/** Bond level at which the Paths panel unlocks. */
const PATHS_UNLOCK_BOND = 50;

export function renderAnimalDetails(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  anchor: { x: number; y: number; size: number } | undefined,
  callbacks: AnimalDetailsCallbacks,
): void {
  const { width, height } = scene.scale;

  // Light overlay — dims scene, keeps tapped animal visible.
  // Tapping it closes the panel (standard sheet-dismiss gesture).
  const overlay = scene.add
    .rectangle(width / 2, height / 2, width, height, 0x000000, 0.32)
    .setInteractive();
  container.add(overlay);

  // ── Compute panel dimensions + actions list ────────────────
  const isPet = animal.state === 'pet';
  const illness: IllnessDef | undefined = store.sickAnimals.get(animal.id);
  const isSick = !!illness;
  const cleanliness = animal.cleanliness ?? 100;
  const canWalk = !isPet && canGoOnWalk(animal);
  const canGroom = !isPet && cleanliness < 60 && !isSick;

  // Garden / wardrobe gates
  const isOutside = !!animal.outsideAt;
  const currentWeather = store.gardenWeather?.current;
  const letOutsideCheck = !isPet && !isOutside
    ? canLetOutside(animal, store.animals, store.sickAnimals, currentWeather)
    : { ok: false as const, reason: '' };
  const canLetOut = letOutsideCheck.ok;
  // Show "Get a {garment}" button when weather demands one and the
  // animal isn't already dressed — regardless of other gating.
  const needsGarment = !isPet
    && !!currentWeather
    && needsCoat(animal, currentWeather)
    && !animal.wardrobe;

  const panelW = 360;
  const statRowH = 26;   // icon row: taller than the old 18px text-only row
  const speech = getNeedSpeech(animal);
  const speechH = speech ? 30 : 0;

  // Action button layout — always 2 primary (Feed/Play) on one row.
  // Extra rows for Walk/Groom/Heal/VisitGarden as needed.
  const extraActionRows =
    (isPet ? 1 : 0) +                 // Visit garden
    (isPet && isSick ? 1 : 0) +       // Take to Vet
    (!isPet && isSick ? 1 : 0) +      // Heal
    (!isPet && canGroom ? 1 : 0) +    // Groom
    (!isPet && canWalk ? 1 : 0) +     // Walk
    (isOutside ? 1 : 0) +             // Bring inside
    (canLetOut ? 1 : 0) +             // Let outside
    (needsGarment ? 1 : 0) +          // Equip wardrobe
    // The Paths button at :386 was missing from this sum, so whenever an
    // animal reached the bond threshold the panel was 46px shorter than its
    // own content and the button hung off the bottom of the cream panel.
    (!isPet && animal.bondLevel >= PATHS_UNLOCK_BOND && callbacks.onOpenPaths ? 1 : 0);
  const baseActionRows = isPet ? 0 : 1;
  const actionRows = baseActionRows + extraActionRows;
  // Nothing in GameScene can scroll this — maxScrollY is only ever set to 0
  // (CorridorView is its sole caller) — so the panel has to fit unaided.
  //
  // This cap is a backstop, not a solution. It stops the panel drawing off
  // the screen, and the common 1-3 action rows now fit on a 375px-tall
  // landscape phone. The rare maximum — a shelter animal that is sick AND
  // walkable AND outside AND needs a coat, five action rows — still cannot:
  // header, stats and five rows want ~500px against 375. Capping harder only
  // moves the overflow inside the panel, which looks worse.
  //
  // That case needs the panel redesign in docs/ux-review-2026-08-29.md, not
  // more arithmetic here: eight buttons in one popup is the actual problem.
  const panelH = Math.min(
    44 + 44 + speechH + 5 * statRowH + actionRows * 46 + 28,
    height - 32,
  );

  // ── Smart placement ────────────────────────────────────────
  // Default: centre on screen. If anchor given, pop above the sprite;
  // fall back to below if off the top; last resort centre vertically.
  let px = width / 2;
  let py = height / 2;
  let tailSide: 'bottom' | 'top' | 'none' = 'none';
  let tailX = 0;

  if (anchor) {
    const margin = 12;
    const spriteTop = anchor.y - anchor.size / 2;
    const spriteBottom = anchor.y + anchor.size * 0.4;
    const aboveCy = spriteTop - 16 - panelH / 2;
    const belowCy = spriteBottom + 16 + panelH / 2;
    const topMargin = 40;     // clear of HUD
    const bottomMargin = 80;  // clear of nav bar

    if (aboveCy - panelH / 2 >= topMargin) {
      py = aboveCy;
      tailSide = 'bottom';
    } else if (belowCy + panelH / 2 <= height - bottomMargin) {
      py = belowCy;
      tailSide = 'top';
    } else {
      py = Math.max(
        topMargin + panelH / 2,
        Math.min(height - bottomMargin - panelH / 2, height / 2),
      );
      tailSide = 'none';
    }
    px = Phaser.Math.Clamp(anchor.x, panelW / 2 + margin, width - panelW / 2 - margin);
    tailX = Phaser.Math.Clamp(anchor.x, px - panelW / 2 + 28, px + panelW / 2 - 28);
  }

  const panelLeft = px - panelW / 2;
  const panelTop = py - panelH / 2;

  // ── Drop shadow + body ─────────────────────────────────────
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.22);
  shadow.fillRoundedRect(panelLeft + 4, panelTop + 6, panelW, panelH, 18);
  container.add(shadow);

  const borderColour = SPECIES_COLOURS[animal.species] ?? 0xd9c8a8;
  const body = scene.add.graphics();
  body.fillStyle(0xfffaf0, 1);
  body.fillRoundedRect(panelLeft, panelTop, panelW, panelH, 18);
  body.lineStyle(2, borderColour, 0.55);
  body.strokeRoundedRect(panelLeft, panelTop, panelW, panelH, 18);
  container.add(body);

  // ── Speech-bubble tail ─────────────────────────────────────
  if (tailSide !== 'none' && anchor) {
    const tail = scene.add.graphics();
    const tailW = 22;
    const tailH = 14;
    tail.fillStyle(0xfffaf0, 1);
    tail.lineStyle(2, borderColour, 0.55);
    if (tailSide === 'bottom') {
      const ty = panelTop + panelH;
      tail.beginPath();
      tail.moveTo(tailX - tailW / 2, ty - 1);
      tail.lineTo(tailX + tailW / 2, ty - 1);
      tail.lineTo(tailX, ty + tailH);
      tail.closePath();
      tail.fillPath();
      tail.beginPath();
      tail.moveTo(tailX - tailW / 2, ty);
      tail.lineTo(tailX, ty + tailH);
      tail.lineTo(tailX + tailW / 2, ty);
      tail.strokePath();
    } else {
      const ty = panelTop;
      tail.beginPath();
      tail.moveTo(tailX - tailW / 2, ty + 1);
      tail.lineTo(tailX + tailW / 2, ty + 1);
      tail.lineTo(tailX, ty - tailH);
      tail.closePath();
      tail.fillPath();
      tail.beginPath();
      tail.moveTo(tailX - tailW / 2, ty);
      tail.lineTo(tailX, ty - tailH);
      tail.lineTo(tailX + tailW / 2, ty);
      tail.strokePath();
    }
    container.add(tail);
  }

  // ── Header: name + species + close X ──────────────────────
  const speciesLabel = animal.variant
    ? `${animal.variant} ${animal.species}`
    : animal.species;
  container.add(
    scene.add.text(panelLeft + 18, panelTop + 16, `${animal.name}`, {
      fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }),
  );
  container.add(
    scene.add.text(panelLeft + 18, panelTop + 36, `the ${speciesLabel}`, {
      fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.textLight,
      resolution: TEXT_RESOLUTION,
    }),
  );

  // A bare interactive text gave Phaser an ~11x18px hit box, a quarter of
  // MIN_TAP. The glyph keeps its size; an invisible circle behind it carries
  // the tap.
  const closeCx = panelLeft + panelW - 24;
  const closeCy = panelTop + 22;
  const closeHit = scene.add.circle(closeCx, closeCy, MIN_TAP / 2, 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  closeHit.on('pointerdown', () => callbacks.onClose());
  container.add(closeHit);
  container.add(
    scene.add.text(closeCx, closeCy, '✕', {
      fontSize: '18px', color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5),
  );

  // ── Arrival story (compact, italic) ────────────────────────
  let cursorY = panelTop + 60;
  const storyText = scene.add.text(panelLeft + 18, cursorY,
    `"${animal.arrivalStory}"`, {
      fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.textLight,
      fontStyle: 'italic', wordWrap: { width: panelW - 36 },
      resolution: TEXT_RESOLUTION,
    });
  container.add(storyText);
  cursorY += Math.max(32, storyText.height) + 6;

  // ── Need speech (if animal wants something) ────────────────
  if (speech) {
    const speechText = scene.add.text(panelLeft + 18, cursorY, `"${speech}"`, {
      fontSize: '18px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: '#c0392b', wordWrap: { width: panelW - 36 },
      resolution: TEXT_RESOLUTION,
    });
    container.add(speechText);
    cursorY += speechText.height + 6;
  }

  // ── Stat rows ──────────────────────────────────────────────
  //
  // Every bar reads the same way: fuller is better. Hunger and Tired used
  // to be drawn as "problem" bars that shrank as the player helped, in the
  // identical visual form as the three that grew — the only cue being red
  // against green, the most common colour-vision confusion. A child
  // scanning five identical bars had no way to tell which direction was
  // good, so they are shown as Fed and Rested instead.
  //
  // Each row is labelled with the shipped icon from assets/ui as well as a
  // word. The numeric "47%" is gone: percentages are Year 6 maths in the
  // England curriculum, so for most of this game's audience the number was
  // decoration that cost 36px of panel width.
  const barX = panelLeft + 18;
  const barW = panelW - 36;
  const statDefs: Array<[string, string, number, number]> = [
    ['ui-hunger-icon', 'Fed',    100 - animal.hunger,    0xE8A33D],
    ['ui-sleep-icon',  'Rested', 100 - animal.tiredness, 0x3498db],
    ['ui-happy-icon',  'Happy',  animal.happiness,       0xf1c40f],
    ['ui-health-icon', 'Health', animal.health,          0x2ecc71],
    ['ui-bond-icon',   'Bond',   animal.bondLevel,       0xff6b9d],
  ];
  statDefs.forEach(([iconKey, label, value, colour]) => {
    const rowCy = cursorY + statRowH / 2 - 3;
    if (scene.textures.exists(iconKey)) {
      container.add(
        scene.add.image(barX + 11, rowCy, iconKey)
          .setDisplaySize(22, 22).setOrigin(0.5),
      );
    }
    container.add(
      scene.add.text(barX + 28, rowCy, label, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    );
    const trackX = barX + 96;
    const trackW = barW - 96;
    const track = scene.add.graphics();
    track.fillStyle(0xe6e2d8, 1);
    track.fillRoundedRect(trackX, rowCy - 5, trackW, 10, 5);
    if (value > 0) {
      track.fillStyle(colour, 1);
      track.fillRoundedRect(trackX, rowCy - 5, Math.max(8, trackW * value / 100), 10, 5);
    }
    container.add(track);
    cursorY += statRowH;
  });
  cursorY += 6;

  // ── Action buttons ─────────────────────────────────────────
  const btnRow1Y = cursorY + 14;

  if (!isPet) {
    container.add(
      createButton(scene, panelLeft + panelW / 2 - 70, btnRow1Y, 'Feed',
        () => callbacks.onFeed(),
        { width: 140, fontSize: '18px', icon: 'icon-kitchen' }),
    );
    container.add(
      createButton(scene, panelLeft + panelW / 2 + 70, btnRow1Y, 'Play',
        () => callbacks.onPlay(),
        { width: 140, fontSize: '18px' }),
    );

    let extraY = btnRow1Y + 46;

    if (canWalk) {
      container.add(
        createButton(scene, panelLeft + panelW / 2, extraY, 'Go for a Walk',
          () => callbacks.onWalk(),
          { width: 290, fontSize: '18px', bgColour: '#27ae60', icon: 'icon-walk' }),
      );
      extraY += 46;
    }
    if (canGroom) {
      container.add(
        createButton(scene, panelLeft + panelW / 2, extraY, 'Groom',
          () => callbacks.onGroom(),
          { width: 290, fontSize: '18px', bgColour: '#5A9CB8' }),
      );
      extraY += 46;
    }
    if (illness) {
      container.add(
        createButton(scene, panelLeft + panelW / 2, extraY,
          `Heal (${illness.label})`,
          () => callbacks.onHeal(),
          { width: 290, fontSize: '18px', bgColour: '#e74c3c', icon: 'icon-heal' }),
      );
      extraY += 46;
    }

    // ── Garden actions ─────────────────────────────────────
    if (isOutside) {
      container.add(
        createButton(scene, panelLeft + panelW / 2, extraY, 'Bring inside',
          () => callbacks.onBringInside(),
          { width: 290, fontSize: '18px', bgColour: '#7b5c3a' }),
      );
      extraY += 46;
    } else if (canLetOut) {
      container.add(
        createButton(scene, panelLeft + panelW / 2, extraY, 'Let outside',
          () => callbacks.onLetOutside(),
          { width: 290, fontSize: '18px', bgColour: '#2E8B57' }),
      );
      extraY += 46;
    }

    // ── Wardrobe action ────────────────────────────────────
    if (needsGarment) {
      const garment = getGarmentForSpecies(animal.species);
      container.add(
        createButton(scene, panelLeft + panelW / 2, extraY,
          `Get a ${garment} — weather needs it`,
          () => callbacks.onEquipWardrobe(),
          { width: 290, fontSize: '18px', bgColour: '#8B6914' }),
      );
      extraY += 46;
    }

    // ── Future paths — unlocks at bondLevel ≥ 50 ───────────
    if (animal.bondLevel >= PATHS_UNLOCK_BOND && callbacks.onOpenPaths) {
      container.add(
        createButton(scene, panelLeft + panelW / 2, extraY,
          `💫 What happens to ${animal.name} next?`,
          () => callbacks.onOpenPaths!(),
          { width: 290, fontSize: '18px', bgColour: '#8a6eb2' }),
      );
      extraY += 46;
    }
  } else {
    // Pet — show collar colour + Visit Garden + optional Take to Vet
    const collarHexVal = animal.collarColour ?? '#ff6b9d';
    const collarName = COLLAR_COLOURS.find((c) => c.hex === collarHexVal)?.name ?? 'Custom';
    const collarSwatchColour = Phaser.Display.Color.HexStringToColor(collarHexVal).color;
    container.add(
      scene.add.circle(panelLeft + 28, btnRow1Y - 14, 7, collarSwatchColour)
        .setStrokeStyle(1, 0x000000, 0.2),
    );
    container.add(
      scene.add.text(panelLeft + 42, btnRow1Y - 14, `${collarName} Collar`, {
        fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.text,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    );

    container.add(
      createButton(scene, panelLeft + panelW / 2, btnRow1Y + 16, 'Visit in Garden',
        () => callbacks.onVisitGarden(),
        { width: 290, fontSize: '18px', bgColour: '#2ecc71' }),
    );

    if (illness) {
      container.add(
        createButton(scene, panelLeft + panelW / 2, btnRow1Y + 62,
          `Take to Vet (${illness.label})`,
          () => callbacks.onTakeToVet(),
          { width: 290, fontSize: '18px', bgColour: '#e74c3c', icon: 'icon-vet' }),
      );
    }
  }

  // Tap overlay to close
  overlay.on('pointerdown', () => callbacks.onClose());
}
