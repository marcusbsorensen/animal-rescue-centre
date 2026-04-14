import Phaser from 'phaser';
import { COLOURS, FONTS, TEXT_RESOLUTION } from './constants';
import { createButton } from './UIButton';

/**
 * Speech bubble attached to a character — genre-standard pet-care game pattern.
 *
 * Renders above a subject (the tail points down at `(anchorX, anchorBottomY)`).
 * Contains a bold name/title line, an optional body text block, and an optional
 * inline action button — all three look "attached" to the animal rather than
 * floating in a separate UI panel.
 *
 * Returns the container (origin 0,0). Caller can freely reposition or dispose.
 */
export function createSpeechBubble(
  scene: Phaser.Scene,
  anchorX: number,
  anchorBottomY: number,
  opts: {
    title: string;
    body?: string;
    actionLabel?: string;
    onAction?: () => void;
    accentColour?: number; // hex number, e.g. 0xE67E22
    actionBgHex?: string;  // hex string for action button, e.g. '#e74c3c'
    actionIcon?: string;   // texture key
    maxWidth?: number;
  }
): Phaser.GameObjects.Container {
  const maxW = opts.maxWidth ?? 260;
  const innerW = maxW - 24; // padding 12 each side
  const accent = opts.accentColour ?? 0xE67E22;

  // Build content first to measure height
  const title = scene.add.text(0, 0, opts.title, {
    fontSize: '14px', fontFamily: FONTS.title, fontStyle: 'bold',
    color: COLOURS.text, resolution: TEXT_RESOLUTION,
    wordWrap: { width: innerW },
  }).setOrigin(0, 0);

  let body: Phaser.GameObjects.Text | null = null;
  if (opts.body) {
    body = scene.add.text(0, 0, `"${opts.body}"`, {
      fontSize: '12px', fontFamily: FONTS.body, fontStyle: 'italic',
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
      wordWrap: { width: innerW }, lineSpacing: 2,
    }).setOrigin(0, 0);
  }

  let action: Phaser.GameObjects.Container | null = null;
  if (opts.actionLabel && opts.onAction) {
    action = createButton(scene, 0, 0, opts.actionLabel, opts.onAction, {
      width: 120, fontSize: '13px',
      bgColour: opts.actionBgHex ?? '#e74c3c',
      icon: opts.actionIcon,
    });
  }

  // Layout vertically
  const padX = 12;
  const padY = 10;
  const gap = 8;
  let cursorY = padY;
  title.setPosition(padX, cursorY);
  cursorY += title.height + (body ? gap : 0);
  if (body) {
    body.setPosition(padX, cursorY);
    cursorY += body.height + (action ? gap + 4 : 0);
  }

  // Reserve space for the button (it's centred horizontally below)
  const actionH = action ? 36 : 0;
  const bubbleInnerContentH = cursorY + actionH + padY;
  const bubbleW = maxW;
  const bubbleH = bubbleInnerContentH;
  const tailH = 10;
  const totalH = bubbleH + tailH;

  // Bubble position: tail tip at (anchorX, anchorBottomY).
  // Container origin will be top-left.
  const contX = anchorX - bubbleW / 2;
  const contY = anchorBottomY - totalH;

  const container = scene.add.container(contX, contY);

  // Background — shadow, body, border, tail
  const gfx = scene.add.graphics();
  // Shadow
  gfx.fillStyle(0x000000, 0.15);
  gfx.fillRoundedRect(2, 3, bubbleW, bubbleH, 12);
  // Body
  gfx.fillStyle(0xffffff, 0.98);
  gfx.fillRoundedRect(0, 0, bubbleW, bubbleH, 12);
  // Accent top border
  gfx.fillStyle(accent, 1);
  gfx.fillRoundedRect(0, 0, bubbleW, 5, { tl: 12, tr: 12, bl: 0, br: 0 });
  // Soft outline
  gfx.lineStyle(1.5, accent, 0.45);
  gfx.strokeRoundedRect(0, 0, bubbleW, bubbleH, 12);
  // Tail (triangle pointing down)
  const tailCx = bubbleW / 2;
  gfx.fillStyle(0xffffff, 0.98);
  gfx.fillTriangle(tailCx - 10, bubbleH - 0.5, tailCx + 10, bubbleH - 0.5, tailCx, bubbleH + tailH);
  gfx.lineStyle(1.5, accent, 0.45);
  gfx.beginPath();
  gfx.moveTo(tailCx - 10, bubbleH);
  gfx.lineTo(tailCx, bubbleH + tailH);
  gfx.lineTo(tailCx + 10, bubbleH);
  gfx.strokePath();

  container.add(gfx);
  container.add(title);
  if (body) container.add(body);
  if (action) {
    action.setPosition(bubbleW / 2, bubbleH - padY - 18);
    container.add(action);
  }

  return container;
}
