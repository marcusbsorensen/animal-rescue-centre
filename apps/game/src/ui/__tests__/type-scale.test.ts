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

  /**
   * The canvas used 22 distinct sizes; the collapse put 178 type sites onto
   * six. Six is the number that matters — a seventh step added quietly is
   * how a scale goes back to being a continuum, which is what this whole
   * exercise undid.
   */
  it('is six distinct sizes, no more', () => {
    const distinct = new Set(steps.map(([, v]) => v));
    expect([...distinct].sort()).toEqual(['16px', '18px', '20px', '24px', '28px', '32px']);
  });

  it('clears the per-role thresholds the checklist sets', () => {
    const px = (v: string) => Number.parseInt(v, 10);
    // A button label a child has to read *and* hit.
    expect(px(TYPE.button)).toBeGreaterThanOrEqual(MIN_FONT.button);
    // Headings, and the HUD counters that live on the caption step.
    expect(px(TYPE.heading)).toBeGreaterThanOrEqual(MIN_FONT.heading);
    expect(px(TYPE.caption)).toBeGreaterThanOrEqual(MIN_FONT.hud);
    expect(px(TYPE.body)).toBeGreaterThanOrEqual(MIN_FONT.body);
  });

  it('names button and body the same size, since a label is body a child taps', () => {
    expect(TYPE.button).toBe(TYPE.body);
  });
});
