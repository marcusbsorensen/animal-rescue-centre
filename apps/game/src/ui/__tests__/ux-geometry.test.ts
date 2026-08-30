import { describe, it, expect } from 'vitest';
import {
  intersectionArea, centreOffScreen, reachability,
  overlappingControls, textCutByControls, gapBetween, quadOf, type UxRect,
} from '../ux-geometry';

/**
 * These are the defects from docs/ux-review-2026-08-29.md, with the
 * geometry the review measured, handed back to the checks that are meant
 * to catch them.
 *
 * The point is not that the arithmetic works. It is that a harness which
 * quietly stops biting is worse than no harness: after the exemptions for
 * scrolling containers and sticky footers went in, L7, L8 and L9 passed
 * on all 42 scene/viewport combinations, which is either a clean game or
 * a check that has been excused into uselessness. This file is how you
 * tell those apart.
 */

const r = (label: string, x: number, y: number, w: number, h: number, extra: Partial<UxRect> = {}): UxRect =>
  ({ label, x, y, w, h, ...extra });

/** The web clip: 812x325, the shortest viewport that ships. */
const CLIP: [number, number] = [812, 325];

describe('reachability — finding 1 and 2, the two dead ends', () => {
  it('catches the Paths exit hanging 8px off the bottom', () => {
    // The measured defect: "← Back to Luna" 285..333 on a 325px screen.
    // Its centre is at 309 and comfortably on screen, so the review's own
    // proposed rule — centre inside the viewport — would have passed it.
    // This is the case that made `spilling` a separate verdict.
    const exit = r('← Back to Luna', 270, 285, 280, 48);
    const v = reachability([exit], ...CLIP);
    expect(v.unreachable).toEqual([]);
    expect(v.spilling.map((c) => c.label)).toEqual(['← Back to Luna']);
    expect(centreOffScreen(exit, ...CLIP)).toBe(false);
  });

  it('passes it once it is back on screen', () => {
    // Where it sits after fb06be7: 270..319, 6px of clearance.
    const exit = r('← Back to Luna', 270, 270, 280, 49);
    const v = reachability([exit], ...CLIP);
    expect(v.unreachable).toEqual([]);
    expect(v.spilling).toEqual([]);
  });

  it('separates gone from half-gone', () => {
    const half = r('← Not yet', 372, 740, 280, 48);   // 740..788 of 768
    const gone = r('← Not yet', 372, 790, 280, 48);   // entirely past it
    const v = reachability([half, gone], 1024, 768);
    expect(v.spilling.map((c) => c.y)).toEqual([740]);
    expect(v.unreachable.map((c) => c.y)).toEqual([790]);
  });

  it('does not call a masked badge tile unreachable', () => {
    // AccountScene masks its badge wall and scrolls it; forty-odd tiles
    // sit below the fold and every one of them is reachable. Scoring
    // these was the harness's first false finding on this rule.
    const tile = r('badge', 192, 744, 120, 120, { clipped: true });
    const v = reachability([tile], 1024, 768);
    expect(v.unreachable).toEqual([]);
    expect(v.spilling).toEqual([]);
    expect(v.belowFold).toHaveLength(1);
  });

  it('a control fully on screen is none of the three', () => {
    const v = reachability([r('Play', 100, 100, 200, 56)], ...CLIP);
    expect(v.unreachable).toEqual([]);
    expect(v.spilling).toEqual([]);
    expect(v.belowFold).toEqual([]);
  });
});

describe('overlappingControls — finding 7, two controls sharing a region', () => {
  it('catches Decorate on top of the audio toggle', () => {
    // The room's Decorate button was 120x40 at (width-70, 55) centred,
    // overlapping the HUD audio toggle's hit circle by 48x27px. The HUD
    // is drawn after gameContainer, so it took the tap: pressing the
    // right half of Decorate turned the music off.
    const decorate = r('Decorate', 1024 - 70 - 60, 55 - 20, 120, 40);
    const audio = r('audio toggle', 1024 - 70 - 60 + 72, 35, 48, 48);
    const pairs = overlappingControls([decorate, audio]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].share).toBeGreaterThan(0.2);
  });

  it('excuses a control measured inside itself', () => {
    // A container and its own child are one control counted twice.
    const card = r('arrival card', 20, 120, 240, 112, { path: '2.1' });
    const inner = r('hit area', 20, 120, 240, 112, { path: '2.1.0' });
    expect(overlappingControls([card, inner])).toEqual([]);
  });

  it('reports a control sitting inside another as stacked, not partial', () => {
    // DepotScene on a landscape phone: "← Back to centre" sits at y 311
    // inside the Decorations card's 500x85 hit rectangle at y 307..392.
    // Only draw order decides which one gets the tap. That is worth
    // saying and not worth failing a run over, so it is its own kind.
    const card = r('Decorations card', 156, 307, 500, 85, { path: 'p4.7' });
    const back = r('← Back to centre', 331, 311, 150, 48, { path: 'p4.9' });
    const pairs = overlappingControls([card, back]);
    expect(pairs.map((p) => p.kind)).toEqual(['stacked']);
  });

  it('tags a genuine half-overlap as partial', () => {
    const a = r('a', 0, 0, 100, 100, { path: 'p1' });
    const b = r('b', 50, 0, 100, 100, { path: 'p2' });
    expect(overlappingControls([a, b]).map((p) => p.kind)).toEqual(['partial']);
  });

  it('does not score a sticky exit over a scrolling list', () => {
    // Review phase 0 pinned these on purpose. Reporting the fix as the
    // bug is how a harness loses its reader.
    const exit = r('← Not yet', 372, 710, 280, 48, { pinned: true });
    const card = r('Babcia Basia Kowalska', 70, 568, 437, 410, { clipped: true });
    expect(overlappingControls([exit, card])).toEqual([]);
  });

  it('does score that same pair when neither is pinned', () => {
    const exit = r('← Not yet', 372, 710, 280, 48);
    const card = r('Babcia Basia Kowalska', 70, 568, 437, 410);
    expect(overlappingControls([exit, card])).toHaveLength(1);
  });

  it('lets a one-pixel graze go', () => {
    const a = r('a', 0, 0, 100, 100);
    const b = r('b', 99, 0, 100, 100);
    expect(overlappingControls([a, b])).toEqual([]);
  });
});

describe('textCutByControls — finding 9 and the createButton trap', () => {
  it('catches the rail card story line printed under its own button', () => {
    // LeftRailView: two lines of story reached y+68 while the Welcome
    // button's top edge was at y+60, so the second line was under it.
    const story = r('"Found under a hedge in the rain."', 32, 44, 216, 32);
    const button = r('Welcome', 20, 60, 240, 48);
    const cut = textCutByControls([story], [button]);
    expect(cut).toHaveLength(1);
    expect(cut[0].by.label).toBe('Welcome');
    expect(cut[0].share).toBeGreaterThan(0.15);
    expect(cut[0].share).toBeLessThan(0.9);
  });

  it('leaves a label sitting inside its own button alone', () => {
    const label = r('Feed her', 60, 216, 96, 20, { path: '1.2.0' });
    const button = r('Feed her', 40, 200, 168, 56, { path: '1.2' });
    expect(textCutByControls([label], [button])).toEqual([]);
  });

  it('leaves text a control fully covers alone, whatever the tree says', () => {
    // `createButton` adds the hit rectangle and the label to the same
    // container as siblings, so a label and a stray control on top of
    // text are indistinguishable from here. Scoring containment turned
    // this check into 140 findings of buttons wearing their own labels.
    const caption = r("Luna's story", 60, 216, 96, 20, { path: '3.4' });
    const button = r('Welcome', 40, 200, 168, 56, { path: '3.9' });
    expect(textCutByControls([caption], [button])).toEqual([]);
  });

  it('catches a label wider than the button that holds it', () => {
    // createButton sizes to max(text + icon + 56, width), so a long label
    // silently widens the button — invisible in a centred row, an overlap
    // in a fixed-cell grid. Here the grid cell did not grow with it.
    const label = r('Vet (Sniffly Nose)', 20, 210, 196, 20);
    const cell = r('Vet', 34, 200, 168, 44);
    expect(textCutByControls([label], [cell])).toHaveLength(1);
  });

  it('scores nothing when the text misses every control', () => {
    expect(textCutByControls([r('title', 0, 0, 200, 30)], [r('btn', 0, 100, 200, 48)])).toEqual([]);
  });
});

describe('intersectionArea and centreOffScreen', () => {
  it('is zero for rects that only touch', () => {
    expect(intersectionArea(r('a', 0, 0, 10, 10), r('b', 10, 0, 10, 10))).toBe(0);
  });

  it('is the shared rectangle otherwise', () => {
    expect(intersectionArea(r('a', 0, 0, 10, 10), r('b', 5, 5, 10, 10))).toBe(25);
  });

  it('measures the centre, not the edge', () => {
    // A control half off the bottom is still tappable; one whose centre
    // has gone is not, and that is the line the review drew.
    expect(centreOffScreen(r('half', 0, 300, 100, 48), ...CLIP)).toBe(false);
    expect(centreOffScreen(r('gone', 0, 320, 100, 48), ...CLIP)).toBe(true);
  });
});


/**
 * gapBetween — the T4 rotation defect, 30 August.
 *
 * T4 measured the space between two controls from their axis-aligned
 * bounding boxes. For anything rotated that box is bigger than the thing
 * inside it, and the surplus is charged to both neighbours at once.
 *
 * arrival's choice pills hang on `.arrival-plaque`, which is tilted 0.8
 * degrees on purpose. Measured live in the overlay iframe: CSS row-gap
 * 12px, layout gap 12, offsetHeight 48, getBoundingClientRect height 52.2.
 * The rule read 7.8px and failed a layout that was correct — and because
 * the surplus scales with width, the same screen crossed the FAIL boundary
 * between runs purely on how long the animal's name was.
 */
describe('gapBetween — finding T4 and the rotation trap', () => {
  /** A w x h rect centred on (cx, cy), turned `deg` about that centre. */
  const tilted = (
    label: string, cx: number, cy: number, w: number, h: number, deg: number,
  ): UxRect => {
    const r = (deg * Math.PI) / 180;
    const cos = Math.cos(r), sin = Math.sin(r);
    const corners = ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as const)
      .map(([dx, dy]) => [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] as const);
    const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
    return {
      label,
      x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
      quad: corners,
    };
  };

  it('reads the real 12px between two tilted pills, not the 7.8px their boxes imply', () => {
    // 300x48 pills, 12px apart, both on a plaque tilted -0.8 degrees.
    const top = tilted('Give them space', 450, 137, 300, 48, -0.8);
    const bottom = tilted('Say hi gently', 450, 197, 300, 48, -0.8);

    expect(gapBetween(top, bottom)).toBeGreaterThan(11.9);
    expect(gapBetween(top, bottom)).toBeLessThan(12.1);

    // and this is what the old bounding-box arithmetic saw
    const boxGap = bottom.y - (top.y + top.h);
    expect(boxGap).toBeLessThan(8);
  });

  it('still fails pills that really are too close, tilt or no tilt', () => {
    const top = tilted('Give them space', 450, 137, 300, 48, -0.8);
    const crowded = tilted('Say hi gently', 450, 188, 300, 48, -0.8);
    // 3px apart on the plaque — a mis-tap, and the check must say so.
    expect(gapBetween(top, crowded)).toBeLessThan(4);
  });

  it('does not excuse a wide control just because it is tilted', () => {
    // The error grew with width, so a very wide pill was the worst case.
    // Genuinely touching controls must still read 0 however wide they are.
    const a = tilted('wide a', 400, 100, 700, 48, -0.8);
    const b = tilted('wide b', 400, 148, 700, 48, -0.8);
    expect(gapBetween(a, b)).toBe(0);
  });

  it('matches plain arithmetic when nothing is rotated', () => {
    const a: UxRect = { label: 'a', x: 0, y: 0, w: 100, h: 40 };
    const b: UxRect = { label: 'b', x: 0, y: 52, w: 100, h: 40 };
    expect(gapBetween(a, b)).toBeCloseTo(12, 6);
  });

  it('measures corner to corner for controls offset on both axes', () => {
    const a: UxRect = { label: 'a', x: 0, y: 0, w: 10, h: 10 };
    const b: UxRect = { label: 'b', x: 13, y: 14, w: 10, h: 10 };
    expect(gapBetween(a, b)).toBeCloseTo(5, 6); // 3-4-5
  });

  it('is 0 for overlapping controls — whether that is a defect is L8, not T4', () => {
    const a: UxRect = { label: 'a', x: 0, y: 0, w: 100, h: 40 };
    const b: UxRect = { label: 'b', x: 50, y: 20, w: 100, h: 40 };
    expect(gapBetween(a, b)).toBe(0);
  });

  it('falls back to the bounding box when a rect carries no quad', () => {
    const a: UxRect = { label: 'a', x: 0, y: 0, w: 10, h: 10 };
    expect(quadOf(a)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });
});
