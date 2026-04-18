import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import {
  SPECIES_COLOURS,
  canGoOnWalk,
  getNeedSpeech,
  type IllnessDef,
} from '@arc/game-logic';
import { createButton } from '../ui/UIButton';
import { COLOURS, FONTS, TEXT_RESOLUTION, COLLAR_COLOURS } from '../ui/constants';
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
}

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

  const panelW = 320;
  const speech = getNeedSpeech(animal);
  const speechH = speech ? 30 : 0;

  // Action button layout — always 2 primary (Feed/Play) on one row.
  // Extra rows for Walk/Groom/Heal/VisitGarden as needed.
  const extraActionRows =
    (isPet ? 1 : 0) +                // Visit garden
    (isPet && isSick ? 1 : 0) +      // Take to Vet
    (!isPet && isSick ? 1 : 0) +     // Heal
    (!isPet && canGroom ? 1 : 0) +   // Groom
    (!isPet && canWalk && !canGroom && !isSick ? 0 : canWalk ? 1 : 0);  // Walk
  const baseActionRows = isPet ? 0 : 1;
  const actionRows = baseActionRows + extraActionRows;
  const panelH = 44 + 44 + speechH + 5 * 18 + actionRows * 46 + 28;

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
      fontSize: '11px', fontFamily: FONTS.body, color: COLOURS.textLight,
      resolution: TEXT_RESOLUTION,
    }),
  );

  const closeX = scene.add.text(panelLeft + panelW - 20, panelTop + 10, '✕', {
    fontSize: '18px', color: '#999', resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
  closeX.on('pointerdown', () => callbacks.onClose());
  container.add(closeX);

  // ── Arrival story (compact, italic) ────────────────────────
  let cursorY = panelTop + 60;
  const storyText = scene.add.text(panelLeft + 18, cursorY,
    `"${animal.arrivalStory}"`, {
      fontSize: '11px', fontFamily: FONTS.body, color: COLOURS.textLight,
      fontStyle: 'italic', wordWrap: { width: panelW - 36 },
      resolution: TEXT_RESOLUTION,
    });
  container.add(storyText);
  cursorY += Math.max(32, storyText.height) + 6;

  // ── Need speech (if animal wants something) ────────────────
  if (speech) {
    const speechText = scene.add.text(panelLeft + 18, cursorY, `"${speech}"`, {
      fontSize: '12px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: '#c0392b', wordWrap: { width: panelW - 36 },
      resolution: TEXT_RESOLUTION,
    });
    container.add(speechText);
    cursorY += speechText.height + 6;
  }

  // ── Compact stat bars ──────────────────────────────────────
  //
  // Hunger and Tired are "problem" stats — bar shows the problem level,
  // not its inverse. Very hungry animal = full red bar, DROPS as the
  // player feeds them. Matches how kids expect a problem bar to read.
  const barX = panelLeft + 18;
  const barW = panelW - 36;
  const statRowH = 18;
  const statDefs: Array<[string, number, number]> = [
    ['Hunger', animal.hunger,    0xe74c3c],
    ['Tired',  animal.tiredness, 0x3498db],
    ['Happy',  animal.happiness, 0xf1c40f],
    ['Health', animal.health,    0x2ecc71],
    ['Bond',   animal.bondLevel, 0xff6b9d],
  ];
  statDefs.forEach(([label, value, colour]) => {
    container.add(
      scene.add.text(barX, cursorY, label, {
        fontSize: '11px', fontFamily: FONTS.body, color: COLOURS.text,
        resolution: TEXT_RESOLUTION,
      }),
    );
    const trackX = barX + 56;
    const trackW = barW - 56 - 36;
    const track = scene.add.graphics();
    track.fillStyle(0xe6e2d8, 1);
    track.fillRoundedRect(trackX, cursorY + 3, trackW, 8, 4);
    if (value > 0) {
      track.fillStyle(colour, 1);
      track.fillRoundedRect(trackX, cursorY + 3, Math.max(6, trackW * value / 100), 8, 4);
    }
    container.add(track);
    container.add(
      scene.add.text(barX + barW, cursorY, `${Math.round(value)}%`, {
        fontSize: '10px', fontFamily: FONTS.body, color: '#888',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(1, 0),
    );
    cursorY += statRowH;
  });
  cursorY += 6;

  // ── Action buttons ─────────────────────────────────────────
  const btnRow1Y = cursorY + 14;

  if (!isPet) {
    container.add(
      createButton(scene, panelLeft + panelW / 2 - 70, btnRow1Y, 'Feed',
        () => callbacks.onFeed(),
        { width: 120, fontSize: '14px', icon: 'icon-kitchen' }),
    );
    container.add(
      createButton(scene, panelLeft + panelW / 2 + 70, btnRow1Y, 'Play',
        () => callbacks.onPlay(),
        { width: 120, fontSize: '14px' }),
    );

    let extraY = btnRow1Y + 46;

    if (canWalk) {
      container.add(
        createButton(scene, panelLeft + panelW / 2, extraY, 'Go for a Walk',
          () => callbacks.onWalk(),
          { width: 250, fontSize: '14px', bgColour: '#27ae60', icon: 'icon-walk' }),
      );
      extraY += 46;
    }
    if (canGroom) {
      container.add(
        createButton(scene, panelLeft + panelW / 2, extraY, 'Groom',
          () => callbacks.onGroom(),
          { width: 250, fontSize: '14px', bgColour: '#5A9CB8' }),
      );
      extraY += 46;
    }
    if (illness) {
      container.add(
        createButton(scene, panelLeft + panelW / 2, extraY,
          `Heal (${illness.label})`,
          () => callbacks.onHeal(),
          { width: 250, fontSize: '14px', bgColour: '#e74c3c', icon: 'icon-heal' }),
      );
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
        fontSize: '12px', fontFamily: FONTS.body, color: COLOURS.text,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    );

    container.add(
      createButton(scene, panelLeft + panelW / 2, btnRow1Y + 16, 'Visit in Garden',
        () => callbacks.onVisitGarden(),
        { width: 250, fontSize: '14px', bgColour: '#2ecc71' }),
    );

    if (illness) {
      container.add(
        createButton(scene, panelLeft + panelW / 2, btnRow1Y + 62,
          `Take to Vet (${illness.label})`,
          () => callbacks.onTakeToVet(),
          { width: 250, fontSize: '14px', bgColour: '#e74c3c', icon: 'icon-vet' }),
      );
    }
  }

  // Tap overlay to close
  overlay.on('pointerdown', () => callbacks.onClose());
}
