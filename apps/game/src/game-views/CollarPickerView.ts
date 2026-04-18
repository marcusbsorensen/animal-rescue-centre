import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { createButton, createPillTitle } from '../ui/UIButton';
import { createAnimalSprite } from '../ui/sprites';
import { COLOURS, FONTS, TEXT_RESOLUTION, COLLAR_COLOURS } from '../ui/constants';

/**
 * CollarPickerView + PetCreatedView
 *
 * Renders the full-bond celebration (star burst, animal sprite, colour
 * grid) and the post-bond "they're your pet now!" screen.
 *
 * Phase 4 extraction. State mutations happen in GameScene.completeBonding;
 * this module is purely rendering plus two tap callbacks.
 */

export interface CollarPickerCallbacks {
  /** Player picked a collar colour — GameScene mutates state, plays
   *  SFX, persists, then calls renderPetCreated to show the result. */
  onCollarChosen: (hex: string) => void;
}

export function renderCollarPicker(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  callbacks: CollarPickerCallbacks,
): void {
  const { width, height } = scene.scale;

  // Celebration background
  container.add(
    scene.add.rectangle(width / 2, height / 2, width, height, 0xfff8e7),
  );

  // Star burst — 8 golden circles animating around the sprite
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const sx = width / 2 + Math.cos(angle) * 120;
    const sy = height / 2 - 80 + Math.sin(angle) * 80;
    const star = scene.add
      .circle(sx, sy, 12, 0xffd700)
      .setStrokeStyle(2, 0xdaa520)
      .setAlpha(0);
    container.add(star);
    scene.tweens.add({
      targets: star,
      alpha: 1,
      scale: { from: 0.3, to: 1 },
      duration: 500,
      delay: i * 100,
      yoyo: true,
      repeat: -1,
      hold: 1000,
    });
  }

  // Celebration pill title
  container.add(
    createPillTitle(scene, width / 2, 55, 'Full Bond!', {
      bgColour: 0xB8860B, fontSize: '26px', padX: 32, padY: 12,
    }),
  );

  container.add(
    scene.add.text(width / 2, 95,
      `${animal.name} loves you so much — they want to be your pet forever!`, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
        align: 'center', wordWrap: { width: width - 80 },
      }).setOrigin(0.5),
  );

  // Animal sprite in upper area
  const spriteY = height * 0.28;
  const sprite = createAnimalSprite(scene, width / 2, spriteY, animal, {
    width: 100, height: 80,
  });
  if (sprite instanceof Phaser.GameObjects.Rectangle) {
    sprite.setStrokeStyle(3, 0xffd700);
  }
  container.add(sprite);

  // Prompt
  const promptY = height * 0.42;
  container.add(
    scene.add.text(width / 2, promptY,
      'Choose a collar colour for your new pet:', {
        fontSize: '17px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5),
  );

  // Collar grid
  const colsPerRow = 4;
  const collarStartX = width / 2 - ((colsPerRow - 1) * 80) / 2;
  const collarStartY = promptY + 35;

  COLLAR_COLOURS.forEach((collar, i) => {
    const col = i % colsPerRow;
    const row = Math.floor(i / colsPerRow);
    const x = collarStartX + col * 80;
    const y = collarStartY + row * 65;

    const colour = Phaser.Display.Color.HexStringToColor(collar.hex).color;

    const swatch = scene.add.circle(x, y, 22, colour)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, 0xffffff);

    container.add(
      scene.add.text(x, y + 30, collar.name, {
        fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.text,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );

    swatch.on('pointerover', () => swatch.setStrokeStyle(3, 0x000000));
    swatch.on('pointerout', () => swatch.setStrokeStyle(2, 0xffffff));
    swatch.on('pointerdown', () => callbacks.onCollarChosen(collar.hex));

    container.add(swatch);
  });
}

export interface PetCreatedCallbacks {
  onVisitGarden: () => void;
}

/** Post-bond "they're your pet!" screen shown after the collar is chosen. */
export function renderPetCreated(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  callbacks: PetCreatedCallbacks,
): void {
  const { width, height } = scene.scale;

  container.add(
    scene.add.rectangle(width / 2, height / 2, width, height, 0xe8f5e9),
  );

  // Heart graphic
  const heartGfx = scene.add.graphics();
  heartGfx.fillStyle(0xff6b9d, 1);
  heartGfx.fillCircle(width / 2 - 14, height / 2 - 68, 16);
  heartGfx.fillCircle(width / 2 + 14, height / 2 - 68, 16);
  heartGfx.fillTriangle(
    width / 2 - 28, height / 2 - 60,
    width / 2 + 28, height / 2 - 60,
    width / 2, height / 2 - 36,
  );
  container.add(heartGfx);

  container.add(
    scene.add.text(width / 2, height / 2 + 10, `${animal.name} is now your pet!`, {
      fontSize: '24px', fontFamily: FONTS.title, color: COLOURS.primary,
    }).setOrigin(0.5),
  );

  container.add(
    scene.add.text(width / 2, height / 2 + 50,
      "They'll live in the garden from now on.", {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5),
  );

  container.add(
    createButton(scene, width / 2, height / 2 + 110, 'Visit Garden',
      () => callbacks.onVisitGarden(), {
        width: 220, bgColour: '#2ecc71',
      }),
  );
}
