import { describe, it, expect } from 'vitest';
import { fitChipGrid } from '../layout';
import { MIN_TAP } from '../constants';

/**
 * The tray boxes the crate loading screen hands out, measured off its
 * own layout at the three viewports it is checked at.
 */
const COLUMN_1024 = { w: 420, h: 151 };   // under the message panel, desktop
const COLUMN_820 = { w: 340, h: 71 };     // under the message panel, narrow window
const STRIP_874 = { w: 826, h: 76 };      // full-width strip, landscape phone

const CHIPS = { gap: 8, maxW: 128, maxH: 104 };
const fit = (n: number, box: { w: number; h: number }) => fitChipGrid(n, box, CHIPS);

describe('fitChipGrid', () => {
  it('seats everybody', () => {
    for (const count of [1, 2, 4, 6, 9]) {
      const { rows, perRow } = fit(count, COLUMN_1024);
      expect(rows * perRow).toBeGreaterThanOrEqual(count);
    }
  });

  it('stays inside its box', () => {
    for (const box of [COLUMN_1024, COLUMN_820, STRIP_874]) {
      for (const count of [1, 2, 4, 6, 9]) {
        const { rows, perRow, chipW, chipH } = fit(count, box);
        expect(chipW * perRow + CHIPS.gap * (perRow - 1)).toBeLessThanOrEqual(box.w);
        expect(chipH * rows + CHIPS.gap * (rows - 1)).toBeLessThanOrEqual(box.h);
      }
    }
  });

  it('wraps rather than shrinking chips, where the box has the depth', () => {
    // Six animals in the desktop column: three across and two deep, not
    // a single row of 63px chips.
    const six = fit(6, COLUMN_1024);
    expect(six.rows).toBe(2);
    expect(six.chipW).toBeGreaterThanOrEqual(MIN_TAP);
    expect(six.chipH).toBeGreaterThanOrEqual(MIN_TAP);
  });

  it('takes a single row when stacking would break the tap floor', () => {
    const six = fit(6, COLUMN_820);
    expect(six.rows).toBe(1);
    expect(six.chipH).toBeGreaterThanOrEqual(MIN_TAP);
  });

  it('fills the full-width strip in one row', () => {
    const six = fit(6, STRIP_874);
    expect(six.rows).toBe(1);
    expect(six.chipW).toBeGreaterThanOrEqual(MIN_TAP);
  });

  it('never returns a zero chip, however small the box', () => {
    const squeezed = fit(9, { w: 60, h: 40 });
    expect(squeezed.chipW).toBeGreaterThan(0);
    expect(squeezed.chipH).toBeGreaterThan(0);
  });
});
