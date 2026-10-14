import type Phaser from 'phaser';
import { MIN_TEXT } from './adoption-match-layout';

export interface FitBox {
  /** The widest a line may be. */
  w: number;
  /** The tallest the whole block may be. */
  h: number;
}

export interface FitOptions {
  /** The most lines allowed. Default: as many as fit. */
  maxLines?: number;
  /** The smallest the type is shrunk to. Default `MIN_TEXT`. */
  minFont?: number;
}

/**
 * Make a Phaser Text fit a box. It wraps at the box's width, and if the result
 * has too many lines, is taller than the box, or has a word too long for a
 * line, it shrinks the type a pixel at a time towards `minFont`, and as a last
 * resort drops words from the end and closes with an ellipsis. The text may
 * therefore be smaller than the size it was made at, or shortened, but it can
 * never spill out of its box or run over its neighbour.
 *
 * Returns what it did, for the layout tests and the Playwright checks.
 */
export function fitText(
  text: Phaser.GameObjects.Text,
  box: FitBox,
  options: FitOptions = {},
): { font: number; trimmed: boolean } {
  const maxLines = options.maxLines ?? Number.POSITIVE_INFINITY;
  const minFont = options.minFont ?? MIN_TEXT;
  const full = text.text;
  text.setWordWrapWidth(Math.max(1, box.w), true);

  const fits = (): boolean =>
    text.getWrappedText().length <= maxLines && text.height <= box.h + 0.5 && text.width <= box.w + 0.5;

  let font = Number.parseFloat(String(text.style.fontSize)) || minFont;
  while (!fits() && font > minFont) {
    font -= 1;
    text.setFontSize(font);
  }

  let trimmed = false;
  if (!fits()) {
    const words = full.split(/\s+/);
    for (let keep = words.length - 1; keep >= 1 && !fits(); keep--) {
      text.setText(`${words.slice(0, keep).join(' ')}…`);
      trimmed = true;
    }
  }
  return { font, trimmed };
}
