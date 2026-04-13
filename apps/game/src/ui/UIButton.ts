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

/**
 * Colourful pill-shaped title banner — used for location headings.
 * Returns a Container with a rounded-rect background + bold white text.
 */
export function createPillTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  options?: {
    bgColour?: number;
    fontSize?: string;
    textColour?: string;
    padX?: number;
    padY?: number;
    shadow?: boolean;
  }
): Phaser.GameObjects.Container {
  const fontSize = options?.fontSize ?? '22px';
  const textColour = options?.textColour ?? '#ffffff';
  const padX = options?.padX ?? 28;
  const padY = options?.padY ?? 10;
  const bgColour = options?.bgColour ?? 0x4a9c5d;
  const shadow = options?.shadow ?? true;

  const text = scene.add.text(0, 0, label, {
    fontSize,
    fontFamily: FONTS.title,
    fontStyle: 'bold',
    color: textColour,
  }).setOrigin(0.5);

  const w = text.width + padX * 2;
  const h = text.height + padY * 2;
  const radius = h / 2;

  // Draw a pill shape using graphics
  const gfx = scene.add.graphics();
  if (shadow) {
    gfx.fillStyle(0x000000, 0.15);
    gfx.fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, radius);
  }
  gfx.fillStyle(bgColour, 1);
  gfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius);

  const container = scene.add.container(x, y, [gfx, text]);
  return container;
}
