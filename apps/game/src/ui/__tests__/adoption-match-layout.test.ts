import { describe, it, expect } from 'vitest';
import {
  computePickerLayout,
  pickerMode,
  rectInside,
  rectsOverlap,
  MIN_TEXT,
  STICKER_H,
  STICKER_W,
  type PickerInput,
  type PickerLayout,
  type Rect,
} from '../adoption-match-layout';
import { MIN_TAP, MIN_TAP_GAP, SAFE_MARGIN } from '../constants';

/**
 * The geometry of the adoption match picker, at the screens it is used on.
 *
 * Before this file the picker was one fixed column sized for a tablet; at
 * 844x390 its three cards were left 28px of height and collapsed to a strip with
 * their text printed across each other. These tests hold, for every screen
 * below, what the Playwright check then measures on the drawn canvas: nothing
 * overlaps, nothing leaves the screen, and everything a child taps is at least
 * `MIN_TAP` square.
 */

const SCREENS: Array<{ name: string; width: number; height: number; mode: PickerLayout['mode'] }> = [
  { name: 'iPhone SE held sideways', width: 667, height: 375, mode: 'rows' },
  { name: 'iPhone 13 held sideways', width: 844, height: 390, mode: 'rows' },
  { name: 'iPhone 15 held sideways', width: 852, height: 393, mode: 'rows' },
  { name: 'iPhone Pro Max held sideways', width: 932, height: 430, mode: 'rows' },
  { name: 'iPad held sideways', width: 1024, height: 768, mode: 'columns' },
  { name: 'iPad Air held sideways', width: 1180, height: 820, mode: 'columns' },
  { name: 'iPad Pro 12.9 held sideways', width: 1366, height: 1024, mode: 'columns' },
  { name: 'a wide, short desktop window', width: 1024, height: 600, mode: 'rows' },
  { name: 'a phone held upright (not shipped; must still hold together)', width: 390, height: 844, mode: 'stack' },
];

/** What a landscape iPhone with a notch reports: the island on one side, the home bar below. */
const NOTCH = { safeLeft: 59, safeRight: 0, safeTop: 0, safeBottom: 21 };

const COUNTS = [1, 2, 3];

function layoutOf(s: { width: number; height: number }, count = 3, extra: Partial<PickerInput> = {}): PickerLayout {
  return computePickerLayout({ width: s.width, height: s.height, count, ...extra });
}

/** Every top-level box on the screen, with a name, for the overlap checks. */
function blocks(l: PickerLayout): Array<[string, Rect]> {
  const out: Array<[string, Rect]> = [['header', l.header], ['notYet', l.notYet]];
  if (l.polaroid.h > 0) out.push(['polaroid', l.polaroid]);
  l.cards.forEach((c, i) => out.push([`card ${i}`, c.rect]));
  return out;
}

describe('the picker picks an arrangement by what the screen can hold', () => {
  it.each(SCREENS)('$name ($width x $height) is laid out as $mode', (s) => {
    expect(pickerMode({ width: s.width, height: s.height, count: 3 })).toBe(s.mode);
    expect(layoutOf(s).mode).toBe(s.mode);
  });

  it('keeps a sideways phone off the tablet arrangement whatever its width', () => {
    for (const width of [667, 740, 844, 896, 932, 1000]) {
      expect(pickerMode({ width, height: 430, count: 3 }), `${width}x430`).not.toBe('columns');
    }
  });
});

describe.each(SCREENS)('the picker at $name ($width x $height)', (s) => {
  for (const count of COUNTS) {
    for (const [label, extra] of [['no notch', {}], ['a notch on the left', NOTCH]] as const) {
      describe(`${count} famil${count === 1 ? 'y' : 'ies'}, ${label}`, () => {
        const l = layoutOf(s, count, extra);
        const inset = { safeLeft: 0, safeRight: 0, safeTop: 0, safeBottom: 0, ...extra };
        const safeLeft = SAFE_MARGIN + inset.safeLeft;
        const safeRight = s.width - SAFE_MARGIN - inset.safeRight;
        const safeTop = Math.max(SAFE_MARGIN, inset.safeTop);
        const safeBottom = s.height - Math.max(SAFE_MARGIN, inset.safeBottom);

        it('puts the right number of cards on the screen', () => {
          expect(l.cards).toHaveLength(count);
        });

        it('keeps everything a child taps inside the safe area, 16px clear of every edge and the notch', () => {
          for (const [name, r] of [...l.cards.map((c, i) => [`card ${i}`, c.rect] as [string, Rect]), ['notYet', l.notYet] as [string, Rect]]) {
            expect(r.x, `${name} left`).toBeGreaterThanOrEqual(safeLeft - 1e-6);
            expect(r.y, `${name} top`).toBeGreaterThanOrEqual(safeTop - 1e-6);
            expect(r.x + r.w, `${name} right`).toBeLessThanOrEqual(safeRight + 1e-6);
            expect(r.y + r.h, `${name} bottom`).toBeLessThanOrEqual(safeBottom + 1e-6);
          }
        });

        it('keeps the header and the polaroid on the screen', () => {
          const whole: Rect = { x: 0, y: 0, w: s.width, h: s.height };
          expect(rectInside(l.header, whole), 'header').toBe(true);
          expect(rectInside(l.polaroid, whole), 'polaroid').toBe(true);
        });

        it('overlaps nothing with anything', () => {
          const all = blocks(l);
          for (let a = 0; a < all.length; a++) {
            for (let b = a + 1; b < all.length; b++) {
              expect(rectsOverlap(all[a][1], all[b][1]), `${all[a][0]} and ${all[b][0]}`).toBe(false);
            }
          }
        });

        it('keeps a finger\'s width between the things a child can tap', () => {
          const taps: Array<[string, Rect]> = [...l.cards.map((c, i) => [`card ${i}`, c.rect] as [string, Rect]), ['notYet', l.notYet]];
          for (let a = 0; a < taps.length; a++) {
            for (let b = a + 1; b < taps.length; b++) {
              const grown: Rect = { x: taps[a][1].x - MIN_TAP_GAP + 1e-6, y: taps[a][1].y - MIN_TAP_GAP + 1e-6, w: taps[a][1].w + 2 * MIN_TAP_GAP - 2e-6, h: taps[a][1].h + 2 * MIN_TAP_GAP - 2e-6 };
              expect(rectsOverlap(grown, taps[b][1]), `${taps[a][0]} is within ${MIN_TAP_GAP}px of ${taps[b][0]}`).toBe(false);
            }
          }
        });

        it('makes every tap target at least MIN_TAP square', () => {
          for (const c of l.cards) {
            expect(c.rect.w).toBeGreaterThanOrEqual(MIN_TAP);
            expect(c.rect.h).toBeGreaterThanOrEqual(MIN_TAP);
          }
          expect(l.notYet.w).toBeGreaterThanOrEqual(MIN_TAP);
          expect(l.notYet.h).toBeGreaterThanOrEqual(MIN_TAP);
        });

        it('keeps each card\'s pieces inside it, and clear of one another', () => {
          for (const [i, c] of l.cards.entries()) {
            for (const [part, r] of [['portrait', c.portrait], ['sticker', c.sticker], ['name', c.name], ['text', c.text]] as Array<[string, Rect]>) {
              expect(rectInside(r, c.rect, 1e-6), `card ${i} ${part} inside the card`).toBe(true);
            }
            expect(rectsOverlap(c.portrait, c.sticker), `card ${i}: portrait over the pill`).toBe(false);
            expect(rectsOverlap(c.portrait, c.name), `card ${i}: portrait over the name`).toBe(false);
            expect(rectsOverlap(c.sticker, c.name), `card ${i}: the pill over the name`).toBe(false);
            expect(rectsOverlap(c.portrait, c.text), `card ${i}: portrait over the text`).toBe(false);
            // The text column starts at or below the name, and below the pill when they do not share a line.
            expect(c.text.y, `card ${i} text starts at the name`).toBeGreaterThanOrEqual(c.name.y - 1e-6);
            if (!c.stickerInline) expect(c.name.y, `card ${i} name below the pill`).toBeGreaterThanOrEqual(c.sticker.y + c.sticker.h - 1e-6);
            expect(c.sticker.w).toBe(STICKER_W);
            expect(c.sticker.h).toBe(STICKER_H);
          }
        });
      });
    }
  }
});

describe('the words fit, at the sizes the game ships', () => {
  // The roster's longest blurb is 120 characters and its longest name 26 (a
  // test in adoption.test.ts reads them off the roster). Nunito's average
  // letter is about half the type size wide; these estimates are on the
  // generous side, and e2e/adoption-handover.spec.ts measures the real thing.
  const LONGEST_BLURB = 120;
  const LONGEST_NAME = 26;
  const lineHeight = (font: number): number => Math.ceil(font * 1.35);

  for (const s of SCREENS.filter((x) => x.mode !== 'stack')) {
    it(`holds the longest blurb and the longest name on every card at ${s.width}x${s.height}`, () => {
      const l = layoutOf(s, 3);
      for (const [i, c] of l.cards.entries()) {
        // The name, at the smallest it will shrink to.
        const nameWidth = LONGEST_NAME * MIN_TEXT * 0.55;
        expect(c.name.w, `card ${i} name width`).toBeGreaterThanOrEqual(nameWidth);

        // The blurb, at the smallest it will shrink to, below the name (and the pill, when it shares its line).
        const flowTop = c.stickerInline ? Math.max(c.name.y + c.name.h, c.sticker.y + c.sticker.h) + 2 : c.name.y + c.nameLines * lineHeight(c.nameFont) + 2;
        const room = c.text.y + c.text.h - flowTop;
        const lines = Math.ceil((LONGEST_BLURB * MIN_TEXT * 0.5) / c.text.w);
        expect(lines * lineHeight(MIN_TEXT), `card ${i}: ${lines} lines of blurb in ${Math.round(room)}px`).toBeLessThanOrEqual(room);
      }
    });
  }

  it('gives a sideways phone the blurb at the full 16px, three lines, on every card', () => {
    for (const s of SCREENS.filter((x) => x.mode === 'rows' && x.height <= 430)) {
      const c = layoutOf(s, 3).cards[0];
      const flowTop = Math.max(c.name.y + c.name.h, c.sticker.y + c.sticker.h) + 2;
      const room = c.text.y + c.text.h - flowTop;
      expect(Math.floor(room / lineHeight(16)), `${s.width}x${s.height}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the rail of a sideways phone tall enough for its header, the animal and the way out', () => {
    for (const s of SCREENS.filter((x) => x.mode === 'rows')) {
      const l = layoutOf(s, 3);
      // Header: a title line and three lines of the question; polaroid: the animal, its name, its bond.
      expect(l.header.h, s.name).toBeGreaterThanOrEqual(8 + 26 + 2 + 3 * 21 + 8 + 8);
      expect(l.polaroid.h, s.name).toBeGreaterThanOrEqual(8 + 40 + 34 + 26);
      // The way out has its short label and its own line.
      expect(l.notYetLabel).toBe('← Not yet');
    }
  });

  it('says the whole sentence where the button has room', () => {
    for (const s of SCREENS.filter((x) => x.mode !== 'rows')) {
      expect(layoutOf(s).notYetLabel, s.name).toBe('← Not yet, let me hug them first');
    }
  });
});

describe('a screen with no one on offer', () => {
  it('still lays out the header, the animal and the way out, and gives the message a place', () => {
    for (const s of SCREENS) {
      const l = layoutOf(s, 0);
      expect(l.cards).toHaveLength(0);
      expect(l.empty.w, s.name).toBeGreaterThan(MIN_TAP);
      expect(l.empty.h, s.name).toBeGreaterThan(MIN_TAP);
      expect(rectsOverlap(l.empty, l.notYet), `${s.name}: the message over the way out`).toBe(false);
    }
  });
});
