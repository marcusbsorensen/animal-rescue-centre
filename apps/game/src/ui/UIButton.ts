import Phaser from 'phaser';
import { COLOURS, FONTS } from './constants';

/**
 * Reusable styled button for game UI.
 */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options?: {
    fontSize?: string;
    bgColour?: string;
    width?: number;
  }
): Phaser.GameObjects.Container {
  const fontSize = options?.fontSize ?? '24px';
  const bgColour = options?.bgColour ?? COLOURS.primary;
  const minWidth = options?.width ?? 200;

  const text = scene.add.text(0, 0, label, {
    fontSize,
    fontFamily: FONTS.body,
    color: COLOURS.white,
  }).setOrigin(0.5);

  const padX = 24;
  const padY = 12;
  const w = Math.max(text.width + padX * 2, minWidth);
  const h = text.height + padY * 2;

  const bg = scene.add.rectangle(0, 0, w, h, Phaser.Display.Color.HexStringToColor(bgColour).color, 1)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  // Rounded corners via graphics
  const container = scene.add.container(x, y, [bg, text]);

  bg.on('pointerover', () => bg.setAlpha(0.85));
  bg.on('pointerout', () => bg.setAlpha(1));
  bg.on('pointerdown', onClick);

  return container;
}

/**
 * Small text-only button (for links, "Show me different ones", etc.).
 */
export function createTextButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void
): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, label, {
    fontSize: '18px',
    fontFamily: FONTS.body,
    color: COLOURS.primary,
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });

  text.on('pointerover', () => text.setStyle({ color: COLOURS.primaryDark }));
  text.on('pointerout', () => text.setStyle({ color: COLOURS.primary }));
  text.on('pointerdown', onClick);

  return text;
}
