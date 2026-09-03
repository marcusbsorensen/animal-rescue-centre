import { describe, it, expect } from 'vitest';
import { TYPE, MIN_FONT } from '../constants';

/**
 * The floor is only a floor if nothing is allowed under it.
 *
 * The game drew a third of its text at exactly 14px — 104 call sites, 41 of
 * the review's 84 warnings, every one of them "smallest 14px". That happened
 * because the smallest *sanctioned* size was 14: a floor set at the bottom of
 * the comfortable range stops being a minimum and becomes the default. These
 * tests hold the two halves of the fix together — the floor is 16, and no
 * step of the scale sits below it — so raising one without the other fails
 * here rather than in a child's hands.
 */
describe('the type scale', () => {
  const steps = Object.entries(TYPE) as [keyof typeof TYPE, string][];

  it('covers the roles the game draws', () => {
    expect(steps.length).toBeGreaterThanOrEqual(7);
  });

  it.each(steps)('%s is a px string', (_role, value) => {
    expect(value).toMatch(/^\d+px$/);
  });

  it.each(steps)('%s clears the children-UX floor', (_role, value) => {
    expect(Number.parseInt(value, 10)).toBeGreaterThanOrEqual(MIN_FONT.small);
  });

  it('starts at the floor exactly — caption is the floor, not above it', () => {
    expect(Number.parseInt(TYPE.caption, 10)).toBe(MIN_FONT.small);
  });

  it('rises monotonically, so a bigger name is a bigger size', () => {
    const order: (keyof typeof TYPE)[] = [
      'caption', 'body', 'lead', 'heading', 'title', 'display',
    ];
    const sizes = order.map((k) => Number.parseInt(TYPE[k], 10));
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });

  it('keeps the floor at the checklist pass mark, not the warn mark', () => {
    // F1-F5 bands at 14 (FAIL) / 16 (PASS). 14 is where this started.
    expect(MIN_FONT.small).toBe(16);
  });
});
