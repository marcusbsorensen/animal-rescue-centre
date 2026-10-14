import { describe, it, expect } from 'vitest';
import { computeLayout, rectsOverlap, PORTRAIT_MAX_WIDTH_SHARE, type Rect } from '../dialogue-layout';

/**
 * The speaker must never be covered. On a sideways phone (844x390) the two
 * reply pills used to run the full width of the box and hid Marnie almost
 * entirely; at 1024x768 they covered her torso. These measure the geometry
 * the runner draws from, at the sizes the game is judged at.
 */

const VIEWPORTS = [
  { name: 'phone 844x390', w: 844, h: 390 },
  { name: 'phone app 874x402', w: 874, h: 402 },
  { name: 'web clip 812x325', w: 812, h: 325 },
  { name: 'tablet 1024x768', w: 1024, h: 768 },
  { name: 'desktop 1280x800', w: 1280, h: 800 },
  { name: 'big tablet 1366x1024', w: 1366, h: 1024 },
];

/** Width over height of what the portraits look like once cropped. */
const ASPECTS = [
  { name: 'Marnie (waist-up, slim)', a: 0.55 },
  { name: 'a single adopter', a: 0.85 },
  { name: 'a pair', a: 1.0 },
];

const inside = (r: Rect, w: number, h: number) =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;

describe('dialogue layout', () => {
  for (const vp of VIEWPORTS) {
    for (const asp of ASPECTS) {
      for (const side of ['left', 'right'] as const) {
        const label = `${vp.name}, ${asp.name}, speaker ${side}`;

        it(`stands the speaker 55-65% of the height: ${label}`, () => {
          const l = computeLayout({ width: vp.w, height: vp.h, side, portraitAspect: asp.a, choiceCount: 0 });
          const share = l.portrait.h / vp.h;
          expect(share).toBeGreaterThanOrEqual(0.55);
          expect(share).toBeLessThanOrEqual(0.65);
          expect(inside(l.portrait, vp.w, vp.h)).toBe(true);
        });

        it(`anchors the speaker to their own edge: ${label}`, () => {
          const l = computeLayout({ width: vp.w, height: vp.h, side, portraitAspect: asp.a, choiceCount: 0 });
          if (side === 'left') expect(l.portrait.x).toBeLessThan(vp.w / 2 - l.portrait.w / 2);
          else expect(l.portrait.x + l.portrait.w).toBeGreaterThan(vp.w / 2 + l.portrait.w / 2);
        });

        for (const n of [2, 3]) {
          it(`keeps ${n} reply pills clear of the speaker, the box and the edges: ${label}`, () => {
            const l = computeLayout({ width: vp.w, height: vp.h, side, portraitAspect: asp.a, choiceCount: n });
            expect(l.choices).toHaveLength(n);
            for (const c of l.choices) {
              expect(rectsOverlap(c, l.portrait), 'pill over the speaker').toBe(false);
              expect(rectsOverlap(c, l.box), 'pill over the box').toBe(false);
              expect(inside(c, vp.w, vp.h), 'pill off screen').toBe(true);
              // Far side: the pill starts beyond the speaker, never beside the speaker's own edge.
              if (side === 'left') expect(c.x).toBeGreaterThanOrEqual(l.portrait.x + l.portrait.w);
              else expect(c.x + c.w).toBeLessThanOrEqual(l.portrait.x);
              // Wide enough to read a short reply on one line.
              expect(c.w).toBeGreaterThanOrEqual(200);
            }
            // They do not overlap each other.
            for (let i = 1; i < l.choices.length; i++) {
              expect(rectsOverlap(l.choices[i - 1], l.choices[i])).toBe(false);
            }
          });
        }
      }
    }
  }

  it('holds the widest groups to three quarters of the width rather than letting them fill the screen', () => {
    for (const vp of VIEWPORTS) {
      const l = computeLayout({ width: vp.w, height: vp.h, side: 'right', portraitAspect: 2.0, choiceCount: 0 });
      expect(l.portrait.w).toBeLessThanOrEqual(vp.w * PORTRAIT_MAX_WIDTH_SHARE + 1);
      expect(l.portrait.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps every real household at 55-65% of the height, arms out or not', () => {
    // The widest crop on file is 1.95 (Dani and Rex with their arms out).
    for (const vp of VIEWPORTS) {
      for (const a of [1.3, 1.6, 1.95]) {
        const l = computeLayout({ width: vp.w, height: vp.h, side: 'right', portraitAspect: a, choiceCount: 0 });
        const share = l.portrait.h / vp.h;
        // At the very widest, a tablet gives up a little height to the width cap.
        expect(share, `${vp.name} aspect ${a}`).toBeGreaterThanOrEqual(a >= 1.9 && vp.h > 700 ? 0.48 : 0.55);
        expect(share, `${vp.name} aspect ${a}`).toBeLessThanOrEqual(0.65);
      }
    }
  });

  it('keeps SKIP inside the box, below the body copy', () => {
    for (const vp of VIEWPORTS) {
      const l = computeLayout({ width: vp.w, height: vp.h, side: 'left', portraitAspect: 0.8, choiceCount: 0 });
      expect(l.skip.x).toBeGreaterThanOrEqual(l.box.x);
      expect(l.skip.x + l.skip.w).toBeLessThanOrEqual(l.box.x + l.box.w);
      expect(l.skip.y + l.skip.h).toBeLessThanOrEqual(l.box.y + l.box.h);
      // Two lines of body copy end above the SKIP pill.
      expect(l.body.y + l.bodyLine * 2).toBeLessThanOrEqual(l.skip.y + 2);
    }
  });

  it('keeps the box and the speaker off a notch', () => {
    const l = computeLayout({
      width: 874, height: 402, side: 'left', portraitAspect: 0.8, choiceCount: 0, safeLeft: 50, safeRight: 0,
    });
    expect(l.portrait.x).toBeGreaterThanOrEqual(50);
    const r = computeLayout({
      width: 874, height: 402, side: 'right', portraitAspect: 0.8, choiceCount: 0, safeLeft: 0, safeRight: 50,
    });
    expect(r.portrait.x + r.portrait.w).toBeLessThanOrEqual(874 - 50);
  });

  it('gives a tall screen a bigger box and larger type than a phone', () => {
    const phone = computeLayout({ width: 844, height: 390, side: 'left', portraitAspect: 0.8, choiceCount: 0 });
    const tablet = computeLayout({ width: 1024, height: 768, side: 'left', portraitAspect: 0.8, choiceCount: 0 });
    expect(tablet.box.h).toBeGreaterThan(phone.box.h);
    expect(tablet.bodyFont).toBeGreaterThan(phone.bodyFont);
  });
});
