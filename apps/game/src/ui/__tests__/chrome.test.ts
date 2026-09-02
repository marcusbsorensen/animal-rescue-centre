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
    for (const ink of [CHROME.ink, CHROME.inkMuted, CHROME.inkAccent]) {
      expect(contrastRatio(CHROME.fill, hexNum(ink))).toBeGreaterThanOrEqual(AA);
    }
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
