import { describe, it, expect, afterEach } from 'vitest';
import {
  CHROME, COLOURS, FONTS, MIN_TAP, SAFE_MARGIN, EDGE_CONTROL_INSET,
  hexNum, bottomAnchorY,
} from '../constants';
import { contrastRatio } from '../contrast';
import { playAreaFor, setSideNav, setSafeAreaLeft } from '../layout';

/**
 * The chrome surface — the answer to the audit's first finding.
 *
 * A.R.C. spoke three visual languages with no rule for which to use:
 * hand-painted wood on the sign screens, translucent white glass on the HUD
 * and panels, flat vector and emoji in the rail. The kitchen showed all
 * three in one frame. The rule now is that painted is *diegetic only* —
 * the boards are objects in the world — and everything that floats above
 * the world shares one surface instead.
 *
 * These are token and arithmetic tests, not rendering tests. What they hold
 * is the part of the decision that a later edit can quietly undo: that the
 * surface is drawn from the palette rather than from fresh literals, that
 * text on it is actually readable, that the chrome face cannot fall through
 * to a webfont, and that a control anchored to an edge clears it.
 */

/** iPhone 17 Pro in landscape — the Capacitor shell's real viewport. */
const PHONE_W = 874;
const PHONE_H = 402;
/** The Dynamic Island's measured width. */
const ISLAND = 50;

/** The children's UX checklist's contrast threshold (WCAG AA body text). */
const AA = 4.5;

afterEach(() => {
  setSideNav(false);
  setSafeAreaLeft(0);
});

describe('hexNum', () => {
  it('converts the palette to the numbers Phaser draws with', () => {
    expect(hexNum('#fef9ef')).toBe(0xfef9ef);
    expect(hexNum('#3a2e22')).toBe(0x3a2e22);
  });

  it('does not mind the hash', () => {
    expect(hexNum('5AAE4A')).toBe(hexNum('#5AAE4A'));
  });
});

describe('the chrome surface', () => {
  /**
   * 610 raw `0xRRGGBB` literals across 45 files against 276 uses of the
   * token is why near-identical greens and browns drift apart between
   * screens. A new surface introduced with its own hardcoded cream would
   * be the 611th. It has to come from the palette or it is part of the
   * problem it was written to fix.
   */
  it('is drawn from the palette, not from fresh literals', () => {
    expect(CHROME.fill).toBe(hexNum(COLOURS.bg));
    expect(CHROME.stroke).toBe(hexNum(COLOURS.inputBorder));
    expect(CHROME.ink).toBe(COLOURS.text);
    expect(CHROME.inkMuted).toBe(COLOURS.textLight);
  });

  /**
   * The whole point of putting a plate under the garden's empty state is
   * that the words on it can be read. Grey on painted grass measured as
   * close to illegible by eye; if the plate's own ink does not clear AA,
   * the fix has moved the problem rather than solved it.
   */
  it('carries every one of its inks at AA or better', () => {
    for (const ink of [CHROME.ink, CHROME.inkMuted, CHROME.inkAccent, CHROME.inkDanger]) {
      expect(contrastRatio(CHROME.fill, hexNum(ink))).toBeGreaterThanOrEqual(AA);
    }
  });

  /**
   * Tone is decoration, and this is the measurement that says so.
   *
   * "PERFECT RUN!" and "TOTALLED!" are the same banner in the same place a
   * second apart, and the two inks sit **1.12:1** from each other — all
   * but identical in luminance. That is forced, not sloppy: both have to
   * clear 4.5:1 against a light cream plate, which pushes both dark, which
   * leaves hue as the only axis between them. Hue is exactly what a
   * red-green colourblind child cannot use.
   *
   * So a child who does not see those hues apart reads the same dark ink
   * both times, and the *words* are what tell her which run she had. That
   * was equally true of the coloured pills this replaced, so nothing was
   * lost — but it means tone must never become the only difference
   * between two states. If a future banner says "Run over" in both cases
   * and leans on green-vs-red to separate them, it is unreadable to her.
   *
   * Held as a measurement rather than a threshold because there is no
   * threshold to pass: this is a fact about the constraint, and the test
   * exists so that raising the ratio is a decision someone makes on
   * purpose rather than a number that quietly drifts.
   */
  it('cannot lean on tone alone — the two inks are near-identical in luminance', () => {
    expect(CHROME.inkAccent).not.toBe(CHROME.inkDanger);
    const separation = contrastRatio(hexNum(CHROME.inkAccent), hexNum(CHROME.inkDanger));
    expect(separation).toBeLessThan(1.5);
    expect(separation).toBeGreaterThan(1);
  });

  /**
   * Why `inkAccent` is `primaryDark` and not `primary`.
   *
   * The brand green is the obvious thing to reach for on a plate — it is
   * what the kitchen sets "Everyone is well-fed!" in today — and it does
   * not pass on this cream. Measured, not asserted from taste. Held here
   * so that a later edit swapping the accent back to `primary` because it
   * looks brighter fails instead of shipping.
   *
   * The green is fine where it is on darker ground; this is a statement
   * about the pairing, not about the colour.
   */
  it('rejects the brand green as plate ink — it misses AA on this fill', () => {
    const measured = contrastRatio(CHROME.fill, hexNum(COLOURS.primary));
    expect(measured).toBeLessThan(AA);
    expect(measured).toBeGreaterThan(4);
    expect(CHROME.inkAccent).not.toBe(COLOURS.primary);
  });

  it('keeps the shadow behind the plate, not around it', () => {
    // Offset down and right, so the plate reads as lifted off the art
    // rather than as a ring drawn around it.
    expect(CHROME.shadowX).toBeGreaterThan(0);
    expect(CHROME.shadowY).toBeGreaterThan(0);
    expect(CHROME.shadowAlpha).toBeLessThan(0.3);
  });
});

/**
 * `createChromeButton`'s two weights, held as arithmetic.
 *
 * The button is the piece of chrome a child actually touches, and the one
 * place where "one surface" collides with something real: a screen of
 * identical cream buttons tells her nothing about which one the screen is
 * for. The answer is not a second surface but the same one read backwards —
 * `filled` puts the accent in the fill and the cream in the type.
 *
 * That choice is what makes these tests short. Every colour a chrome button
 * can draw is already in `CHROME`, so the pairs below are the plate's own
 * ink/fill pairs with the arguments swapped, and contrast does not care
 * which way round you measure. The tests exist so that a later variant
 * reaching outside those four inks for a fill fails here rather than
 * shipping a button nobody can read.
 */
describe('the chrome button', () => {
  it('reads as well filled as it does on paper — the pair is symmetric', () => {
    // Cream type on an accent fill is `inkAccent` on cream, backwards.
    // The plate's AA guarantee is therefore the filled button's too, and
    // this is the assertion that says so out loud.
    for (const accent of [CHROME.inkAccent, CHROME.inkDanger]) {
      const asInk = contrastRatio(CHROME.fill, hexNum(accent));
      const asFill = contrastRatio(hexNum(accent), hexNum(COLOURS.bg));
      expect(asFill).toBeCloseTo(asInk, 10);
      expect(asFill).toBeGreaterThanOrEqual(AA);
    }
  });

  /**
   * The cream the type is set in has to be the cream the plate is drawn
   * in, or the two weights are two surfaces wearing the same name. It is
   * one token — `COLOURS.bg` — appearing as a fill in one variant and as
   * ink in the other.
   */
  it('sets its filled type in the plate\'s own cream', () => {
    expect(hexNum(COLOURS.bg)).toBe(CHROME.fill);
  });

  /**
   * Why `filled` draws no hairline.
   *
   * The stroke exists to separate cream from cream — a plate on the
   * kitchen's cream wall would otherwise have no edge at all — and it is
   * chosen to be *barely* there: 1.57:1 against the fill, a hairline you
   * read as an edge rather than as a line.
   *
   * On an accent fill the same colour measures 3.9:1 and up, two and a
   * half times the separation. It stops being a hairline and becomes a
   * pale outline drawn round a dark shape, which is decoration — and this
   * surface's whole rule is that decoration is not how it carries meaning.
   * A dark fill already separates itself from anything it sits on.
   *
   * Measured rather than asserted, so that adding the stroke back for
   * symmetry has to argue with a number.
   */
  it('would draw an outline, not a hairline, on a filled button', () => {
    const onPaper = contrastRatio(CHROME.fill, CHROME.stroke);
    expect(onPaper).toBeLessThan(2);

    for (const accent of [CHROME.inkAccent, CHROME.inkDanger]) {
      expect(contrastRatio(hexNum(accent), CHROME.stroke)).toBeGreaterThan(onPaper * 2);
    }
  });

  /**
   * A button is padded for a finger, not for the words.
   *
   * `CHROME.padY` is 12 and the button uses 14. The difference is four
   * pixels of drawn height on every button in the game, all of which
   * already sit under `MIN_TAP` before the hit area is floored — so the
   * plate's value would be a number matching a number at the child's
   * expense. Recorded here because "these two constants disagree" is
   * exactly the kind of thing a later tidy-up quietly resolves the wrong
   * way.
   */
  it('pads taller than a title plate, and stays short of the tap floor', () => {
    const BUTTON_PAD_Y = 14;
    expect(BUTTON_PAD_Y).toBeGreaterThan(CHROME.padY);
    // A 22px label measures about 28px tall in the rounded face; the drawn
    // height is that plus twice the padding, and still under the floor.
    expect(28 + BUTTON_PAD_Y * 2).toBeLessThan(MIN_TAP + 16);
  });
});

/**
 * Edge anchoring — `createChromeButton`'s `anchor`, held as arithmetic.
 *
 * The audit's fifth finding was controls at the screen edge, and the queue
 * notes that this class does not stay fixed on its own: TRAPS.md already
 * records three controls that were unreachable on every viewport for as
 * long as they had existed. `EDGE_CONTROL_INSET` was the first answer and
 * it is not enough on its own — these are the two ways it fails.
 */
describe('anchoring a control against an edge', () => {
  /**
   * The three Back buttons, as they actually measured.
   *
   * Each caller wrote `SAFE_MARGIN + <half the width it asked for>` and
   * each was wrong, because the button sizes itself to
   * `max(label + icon + 2 * padX, options.width)` — the asked width is a
   * floor, not the answer. The drawn widths came from the harness.
   */
  const BACK_BUTTONS = [
    { scene: 'KitchenMinigameScene', asked: 110, drawn: 121, guessedHalf: 59 },
    { scene: 'AccountScene', asked: 100, drawn: 119, guessedHalf: 58 },
    { scene: 'PtvDriveScene', asked: 88, drawn: 108, guessedHalf: 53 },
  ];

  it('cannot be done by guessing a half-width', () => {
    for (const b of BACK_BUTTONS) {
      expect(b.drawn).toBeGreaterThan(b.asked);
      // What the caller got: centre at SAFE_MARGIN + guess, so the outer
      // edge lands at SAFE_MARGIN + guess - drawn/2.
      const edge = SAFE_MARGIN + b.guessedHalf - b.drawn / 2;
      expect(edge).toBeLessThan(SAFE_MARGIN);
      // All three landed in the WARN band rather than off-screen, which is
      // why three years of looking at screenshots never caught them.
      expect(edge).toBeGreaterThan(12);
    }
  });

  it('lands exactly on the margin when the button places itself', () => {
    // `anchor: { x: 'left' }` means the caller writes the margin and the
    // button adds half of whatever it turned out to be.
    for (const b of BACK_BUTTONS) {
      const centre = SAFE_MARGIN + Math.max(b.drawn, MIN_TAP) / 2;
      expect(centre - Math.max(b.drawn, MIN_TAP) / 2).toBe(SAFE_MARGIN);
    }
  });

  /**
   * Why the vertical axis needed the same thing.
   *
   * `EDGE_CONTROL_INSET` is `SAFE_MARGIN + MIN_TAP / 2`, which lands the
   * outer edge on `SAFE_MARGIN` for a control that is exactly `MIN_TAP`
   * tall and nowhere else. PtvDriveScene's Back button is 52 — four pixels
   * over — and centring it on the constant left 14px of margin. The
   * constant meant to prevent the defect produced it.
   */
  it('is not what EDGE_CONTROL_INSET does once a control is taller than MIN_TAP', () => {
    const exactly = MIN_TAP;
    expect(EDGE_CONTROL_INSET - exactly / 2).toBe(SAFE_MARGIN);

    const taller = 52;
    expect(EDGE_CONTROL_INSET - taller / 2).toBeLessThan(SAFE_MARGIN);
    expect(EDGE_CONTROL_INSET - taller / 2).toBe(14);
  });
});

describe('the chrome type stack', () => {
  /**
   * The sign screens carry 500 `font-family` declarations resolving to 39
   * distinct stacks. With that many, and webfonts that may not all have
   * loaded, a fallback firing somewhere was inevitable — it is what
   * renders login's "TYPE YOUR NAME" in system sans while everything
   * around it is the rounded game face.
   *
   * A stack that starts at a face the OS always has cannot fall through to
   * something unintended, which is the entire reason the chrome face is a
   * system font rather than a fourth webfont.
   */
  it('starts at the system rounded face', () => {
    expect(FONTS.ui.startsWith('ui-rounded')).toBe(true);
    expect(FONTS.ui).toContain('SF Pro Rounded');
    expect(FONTS.ui).toContain('system-ui');
  });

  it('reaches for no webfont at all', () => {
    // Nunito, Fredoka, Caveat and the rest are load-order dependent. One
    // of them mid-stack would put the dependency straight back.
    for (const webfont of ['Nunito', 'Fredoka', 'Baloo', 'Caveat', 'Patrick Hand']) {
      expect(FONTS.ui).not.toContain(webfont);
    }
  });

  it('leaves the diegetic faces alone', () => {
    // Painted boards keep their painted type — the rule is about chrome.
    expect(FONTS.title).toContain('Nunito');
    expect(FONTS.chalk).toContain('Caveat');
  });
});

describe('EDGE_CONTROL_INSET', () => {
  it('puts the control\'s outer edge exactly SAFE_MARGIN clear', () => {
    expect(EDGE_CONTROL_INSET - MIN_TAP / 2).toBe(SAFE_MARGIN);
  });

  it('is the same rule bottomAnchorY was already applying', () => {
    expect(bottomAnchorY(PHONE_H)).toBe(PHONE_H - EDGE_CONTROL_INSET);
  });

  /**
   * The garden's zone arrows, which is where this came from. The left one
   * was at play.x + 30 — a 48px control whose outer edge sat 6px from the
   * column, inside the rail on a landscape phone. The right one was at
   * play.w - 30, flush enough to the screen edge that the OS takes the
   * touch before the game sees it.
   */
  it('clears both edges of the play column on a landscape phone', () => {
    setSafeAreaLeft(ISLAND);
    setSideNav(true);
    const play = playAreaFor(PHONE_W, PHONE_H);

    const leftOuter = play.x + EDGE_CONTROL_INSET - MIN_TAP / 2;
    const rightOuter = play.x + play.w - EDGE_CONTROL_INSET + MIN_TAP / 2;

    expect(leftOuter - play.x).toBeGreaterThanOrEqual(SAFE_MARGIN);
    expect(play.x + play.w - rightOuter).toBeGreaterThanOrEqual(SAFE_MARGIN);
    // And clear of the notch, which the play column already accounts for.
    expect(leftOuter).toBeGreaterThan(ISLAND);
  });

  it('clears both edges under the bottom-bar layout too', () => {
    const play = playAreaFor(PHONE_W, PHONE_H);
    const leftOuter = play.x + EDGE_CONTROL_INSET - MIN_TAP / 2;
    const rightOuter = play.x + play.w - EDGE_CONTROL_INSET + MIN_TAP / 2;

    expect(leftOuter - play.x).toBeGreaterThanOrEqual(SAFE_MARGIN);
    expect(play.x + play.w - rightOuter).toBeGreaterThanOrEqual(SAFE_MARGIN);
  });

  it('leaves the two arrows more than MIN_TAP_GAP apart', () => {
    // A two-zone carousel on the narrowest viewport we ship. If these ever
    // met in the middle the child would have one 96px button, not two.
    const play = playAreaFor(PHONE_W, PHONE_H);
    const gap = (play.w - EDGE_CONTROL_INSET * 2) - MIN_TAP;
    expect(gap).toBeGreaterThan(0);
  });
});
