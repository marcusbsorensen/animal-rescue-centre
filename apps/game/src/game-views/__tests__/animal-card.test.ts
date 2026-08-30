import { describe, it, expect } from 'vitest';
import {
  animalCardLayout, moreGridLayout,
  ACTION_COUNT, ACTION_H, CARD_PAD, MORE_COLS, MORE_GAP,
  CARD_W_COMPACT, CARD_H_COMPACT,
  type Rect,
} from '../../ui/animal-card-layout';
import { MIN_TAP, MIN_TAP_GAP, SAFE_MARGIN } from '../../ui/constants';

/**
 * The animal card exists because the panel it replaces sized itself by
 * adding its contents up:
 *
 *     const panelH = 44 + 44 + speechH + 5 * statRowH + actionRows * 46 + 28;
 *
 * A shelter animal that was sick AND walkable AND outside AND needed a
 * coat reached 466px on a 375px screen, with its last two or three action
 * buttons — including the entry point to the whole adoption endgame —
 * drawn below the bottom edge. Nothing in GameScene scrolls; `maxScrollY`
 * is only ever set to 0.
 *
 * So these are arithmetic tests over the fixed geometry, in the same
 * spirit as play-area.test.ts. The load-bearing one is
 * "does not grow with the action count": that is the property the old
 * panel did not have, and the one a future edit is most likely to lose.
 */

/** width, height. The web clip is the shortest viewport we support. */
const DEVICES: [string, number, number][] = [
  ['web clip', 812, 325],
  ['landscape phone app', 812, 375],
  ['landscape phone, widest', 956, 440],
  ['iPad landscape', 1024, 768],
  ['iPad portrait', 768, 1024],
];

/** Every action count the More face can be asked for: pet 2, shelter 6. */
const ACTION_COUNTS = [1, 2, 3, 4, 5, 6];

function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w
    && inner.y + inner.h <= outer.y + outer.h;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w
    && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The rect a circular tap target occupies. */
function circleRect(spot: { cx: number; cy: number; r: number }): Rect {
  return { x: spot.cx - spot.r, y: spot.cy - spot.r, w: spot.r * 2, h: spot.r * 2 };
}

describe('animalCardLayout', () => {
  it.each(DEVICES)('fits inside %s with its safe margin', (_name, w, h) => {
    const { card } = animalCardLayout(w, h);
    expect(card.x).toBeGreaterThanOrEqual(SAFE_MARGIN);
    expect(card.y).toBeGreaterThanOrEqual(SAFE_MARGIN);
    expect(card.x + card.w).toBeLessThanOrEqual(w - SAFE_MARGIN);
    expect(card.y + card.h).toBeLessThanOrEqual(h - SAFE_MARGIN);
  });

  it.each(DEVICES)('keeps every part of itself inside the card on %s', (_name, w, h) => {
    const l = animalCardLayout(w, h);
    const parts: Array<[string, Rect]> = [
      ['close', circleRect(l.close)],
      ['portrait', {
        x: l.portrait.cx - l.portrait.size / 2,
        y: l.portrait.cy - l.portrait.size / 2,
        w: l.portrait.size,
        h: l.portrait.size,
      }],
      ['chip', l.chip],
      ['bond', l.bond],
      ['dots', l.dots],
      ['fact', { x: l.fact.x, y: l.fact.y, w: l.fact.w, h: 20 }],
      ['actions', {
        x: l.actions.xs[0] - l.actions.w / 2,
        y: l.actions.y,
        w: l.actions.xs[ACTION_COUNT - 1] + l.actions.w / 2 - (l.actions.xs[0] - l.actions.w / 2),
        h: l.actions.h,
      }],
    ];
    for (const [label, rect] of parts) {
      expect(`${label}: ${contains(l.card, rect)}`).toBe(`${label}: true`);
    }
  });

  it.each(DEVICES)('never overlaps the dots strip with the actions or the fact on %s', (_name, w, h) => {
    const l = animalCardLayout(w, h);
    const actions: Rect = { x: l.card.x, y: l.actions.y, w: l.card.w, h: l.actions.h };
    const fact: Rect = { x: l.fact.x, y: l.fact.y, w: l.fact.w, h: 20 };
    expect(overlaps(l.dots, actions)).toBe(false);
    expect(overlaps(l.dots, fact)).toBe(false);
    expect(overlaps(actions, fact)).toBe(false);
    // The head block sits above the dots strip, not through it.
    expect(overlaps(l.bond, l.dots)).toBe(false);
    expect(overlaps(l.chip, l.bond)).toBe(false);
  });

  it.each(DEVICES)('gives three primary actions above the tap floor on %s', (_name, w, h) => {
    const l = animalCardLayout(w, h);
    expect(l.actions.xs).toHaveLength(ACTION_COUNT);
    expect(l.actions.h).toBeGreaterThanOrEqual(MIN_TAP);
    expect(l.actions.w).toBeGreaterThanOrEqual(MIN_TAP);
    for (let i = 1; i < l.actions.xs.length; i++) {
      const gap = (l.actions.xs[i] - l.actions.w / 2)
        - (l.actions.xs[i - 1] + l.actions.w / 2);
      expect(gap).toBeGreaterThanOrEqual(MIN_TAP_GAP - 0.001);
    }
  });

  it.each(DEVICES)('gives the close control a full-size hit area on %s', (_name, w, h) => {
    const { close } = animalCardLayout(w, h);
    expect(close.r * 2).toBeGreaterThanOrEqual(MIN_TAP);
  });

  it('is the compact size on every landscape phone and the regular size on iPad', () => {
    // 480 is the short-viewport breakpoint the rest of the layout uses.
    expect(animalCardLayout(812, 375).card.w).toBe(CARD_W_COMPACT);
    expect(animalCardLayout(812, 375).card.h).toBe(CARD_H_COMPACT);
    expect(animalCardLayout(1024, 768).card.w).toBeGreaterThan(CARD_W_COMPACT);
    expect(animalCardLayout(1024, 768).card.h).toBeGreaterThan(CARD_H_COMPACT);
  });

  it('is the same shape whatever the animal can do', () => {
    // The signature is the guarantee: there is no animal, no action list
    // and no row count in it, so the arithmetic that put the Paths button
    // off the bottom of the old panel has nowhere to live. If a later
    // edit adds a parameter here, this stops compiling — which is the
    // point of asserting it.
    const a = animalCardLayout(812, 375);
    const b = animalCardLayout(812, 375);
    expect(a).toEqual(b);
    expect(animalCardLayout.length).toBe(2);
  });
});

describe('moreGridLayout', () => {
  it.each(DEVICES)('keeps every cell inside the card on %s', (_name, w, h) => {
    const { card } = animalCardLayout(w, h);
    for (const count of ACTION_COUNTS) {
      const grid = moreGridLayout(card, count);
      expect(grid.cells).toHaveLength(count);
      for (const cell of grid.cells) {
        expect(`${count} cells: ${contains(card, cell)}`).toBe(`${count} cells: true`);
      }
    }
  });

  it.each(DEVICES)('never overlaps two cells on %s', (_name, w, h) => {
    const { card } = animalCardLayout(w, h);
    for (const count of ACTION_COUNTS) {
      const { cells } = moreGridLayout(card, count);
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          expect(`${count}/${i}/${j}: ${overlaps(cells[i], cells[j])}`)
            .toBe(`${count}/${i}/${j}: false`);
        }
      }
    }
  });

  it.each(DEVICES)('keeps every cell button above the tap floor on %s', (_name, w, h) => {
    const { card } = animalCardLayout(w, h);
    for (const count of ACTION_COUNTS) {
      const grid = moreGridLayout(card, count);
      expect(grid.buttonH).toBeGreaterThanOrEqual(MIN_TAP);
      expect(grid.cells[0].w).toBeGreaterThanOrEqual(MIN_TAP);
      // The reason line has to have somewhere to go, or an unavailable
      // action is a greyed button with no explanation — which is the one
      // thing this face is for.
      expect(grid.cells[0].h - grid.buttonH).toBeGreaterThan(16);
    }
  });

  it.each(DEVICES)('keeps back, close and title clear of each other on %s', (_name, w, h) => {
    const { card } = animalCardLayout(w, h);
    const grid = moreGridLayout(card, 6);
    const back = circleRect(grid.back);
    const close = circleRect(grid.close);
    const title: Rect = { x: grid.title.x, y: grid.title.y, w: grid.title.w, h: 30 };
    expect(grid.back.r * 2).toBeGreaterThanOrEqual(MIN_TAP);
    expect(grid.close.r * 2).toBeGreaterThanOrEqual(MIN_TAP);
    expect(overlaps(back, close)).toBe(false);
    expect(overlaps(back, title)).toBe(false);
    expect(overlaps(close, title)).toBe(false);
    expect(contains(card, title)).toBe(true);
    // And the grid starts below all three.
    expect(grid.cells[0].y).toBeGreaterThanOrEqual(back.y + back.h);
  });

  it('does not push a six-action shelter animal past the card, which is the bug', () => {
    // The case the old panel could not draw: sick AND walkable AND
    // outside AND needing a coat AND past the Paths threshold. It wanted
    // five action rows plus a header and five stat rows — about 500px
    // against the 375 the app gets.
    const { card } = animalCardLayout(812, 375);
    const grid = moreGridLayout(card, 6);
    expect(grid.rows).toBe(2);
    expect(grid.cols).toBe(MORE_COLS);
    const last = grid.cells[grid.cells.length - 1];
    expect(last.y + last.h).toBeLessThanOrEqual(card.y + card.h - CARD_PAD + 0.001);
  });

  it('centres a short last row rather than leaving a hole', () => {
    const { card } = animalCardLayout(1024, 768);
    const grid = moreGridLayout(card, 4);
    const lastRow = grid.cells.slice(3);
    const rowCentre = lastRow[0].x + lastRow[0].w / 2;
    expect(rowCentre).toBeCloseTo(card.x + card.w / 2, 1);
  });

  it('does not stretch two pet actions to fill the card', () => {
    const { card } = animalCardLayout(1024, 768);
    const grid = moreGridLayout(card, 2);
    // One row of two in a 328px-tall region would give 328px cells
    // without the cap.
    expect(grid.cells[0].h).toBeLessThanOrEqual(ACTION_H * 2 + MORE_GAP);
  });
});
