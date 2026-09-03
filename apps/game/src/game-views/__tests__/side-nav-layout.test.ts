import { describe, it, expect, afterEach } from 'vitest';
import {
  playAreaFor, railBoundsFor, anchorSpaceFor,
  setSideNav, sideNavEnabled, setSafeAreaLeft,
  NAV_RAIL_WIDTH, RAIL_TAB_WIDTH, RAIL_WIDTH, HUD_HEIGHT,
} from '../../ui/layout';

/**
 * Side-nav layout — navigation down the left edge, arrivals down the
 * right, no horizontal chrome. See docs/landscape-relayout-2026-08-31.md.
 *
 * These are the numbers the relayout was argued from, held in place so
 * the argument stays checkable. The doc's original version of it was
 * wrong: it read the *play box* aspect (3.59) as the aspect the room art
 * was authored at, concluded every painting would be squashed 1.9x, and
 * costed a re-paint of 27 backgrounds off the back of that. The art is
 * 16:9 and is drawn into a different box entirely — see the aspect test
 * below, which is the one that matters.
 */

/** iPhone 17 Pro in landscape, and the Dynamic Island's measured width. */
const PHONE_W = 874;
const PHONE_H = 402;
const ISLAND = 50;

/** Room backgrounds on disk are 1280x720 or 800x446 — 16:9, uniformly. */
const ART_ASPECT = 1280 / 720;

afterEach(() => {
  setSideNav(false);
  setSafeAreaLeft(0);
});

describe('side-nav switch', () => {
  it('is off by default, so every existing caller keeps its layout', () => {
    expect(sideNavEnabled()).toBe(false);
    const play = playAreaFor(PHONE_W, PHONE_H);
    expect(play.y).toBe(HUD_HEIGHT);
    expect(play.h).toBe(214);
  });

  it('hands back the full height when on', () => {
    setSideNav(true);
    const play = playAreaFor(PHONE_W, PHONE_H);
    expect(play.y).toBe(0);
    expect(play.h).toBe(PHONE_H);
  });
});

describe('play box', () => {
  it('clears the notch and the nav rail on the left', () => {
    setSafeAreaLeft(ISLAND);
    setSideNav(true);
    const play = playAreaFor(PHONE_W, PHONE_H);
    expect(play.x).toBe(ISLAND + NAV_RAIL_WIDTH);
  });

  it('reserves the arrivals tab on the right', () => {
    setSafeAreaLeft(ISLAND);
    setSideNav(true);
    const play = playAreaFor(PHONE_W, PHONE_H);
    // Flush, and 696 is why. The tab on the *left* was moved off the edge
    // by `railEdgeInset` when the edge sweep found it sitting at 0px; this
    // one stays put, because the 16px would come out of a play box whose
    // whole claim is that room art fits it — 696x402 is 1.77 against art
    // authored at 1.78. See the note in `railBoundsFor`.
    expect(play.x + play.w).toBe(PHONE_W - RAIL_TAB_WIDTH);
    expect(play.w).toBe(696);
  });

  it('reserves the full rail on an iPad, where it stands open', () => {
    setSideNav(true);
    const play = playAreaFor(1133, 744);
    expect(play.x + play.w).toBe(1133 - RAIL_WIDTH);
  });

  /**
   * The load-bearing one. The bottom-bar layout draws room art into
   * `play.w x (height - 40)` — 768x362 on this device, an aspect of 2.12
   * against art authored at 1.78, so a 19% horizontal stretch. Side-nav
   * draws it into the play box instead, and that box is very close to
   * the art's own shape.
   */
  it('gives the room a box the art nearly fits', () => {
    setSafeAreaLeft(ISLAND);
    setSideNav(true);
    const play = playAreaFor(PHONE_W, PHONE_H);
    const boxAspect = play.w / play.h;

    const sideNavStretch = boxAspect / ART_ASPECT;
    expect(sideNavStretch).toBeGreaterThan(0.95);
    expect(sideNavStretch).toBeLessThan(1.05);

    setSideNav(false);
    const bar = playAreaFor(PHONE_W, PHONE_H);
    const barStretch = (bar.w / (PHONE_H - 40)) / ART_ASPECT;
    expect(barStretch).toBeGreaterThan(1.15);
    expect(sideNavStretch).toBeLessThan(barStretch);
  });
});

describe('arrivals rail', () => {
  it('moves to the right edge and spans the full height', () => {
    setSideNav(true);
    const bounds = railBoundsFor(PHONE_W, PHONE_H);
    expect(bounds.mode).toBe('tab');
    expect(bounds.x).toBe(PHONE_W - RAIL_TAB_WIDTH);
    expect(bounds.y).toBe(0);
    expect(bounds.h).toBe(PHONE_H);
  });

  it('opens over the scene without moving the play box', () => {
    setSafeAreaLeft(ISLAND);
    setSideNav(true);
    const shut = playAreaFor(PHONE_W, PHONE_H);
    const open = railBoundsFor(PHONE_W, PHONE_H, true);
    expect(open.mode).toBe('overlay');
    expect(open.w).toBe(RAIL_WIDTH);
    // The play area does not consult the open state, so the room cannot
    // reflow under a child's finger while she checks her arrivals.
    expect(playAreaFor(PHONE_W, PHONE_H)).toEqual(shut);
  });

  it('stands open on an iPad', () => {
    setSideNav(true);
    expect(railBoundsFor(1133, 744).mode).toBe('side');
  });
});

describe('anchor space', () => {
  /**
   * The quieter prize. Under the bottom bar, art fills the screen while
   * anchors resolve against the play band, so an animal the art puts on
   * the painted floor stands above that floor line — documented in
   * layout.ts as a compromise rather than a win. Side-nav draws art into
   * the play box, so the two rects are the same rect and there is
   * nothing left to compromise.
   */
  it('is the play box itself, so art and anchors agree', () => {
    setSafeAreaLeft(ISLAND);
    setSideNav(true);
    const play = playAreaFor(PHONE_W, PHONE_H);
    const space = anchorSpaceFor(play, PHONE_H);
    expect(space.top).toBe(play.y);
    expect(space.h).toBe(play.h);
  });

  it('still compresses against the band under the bottom bar', () => {
    const play = playAreaFor(PHONE_W, PHONE_H);
    const space = anchorSpaceFor(play, PHONE_H);
    expect(space.h).toBe(play.h);
    expect(space.h).toBeLessThan(PHONE_H - 40);
  });
});

describe('what the layout costs', () => {
  it('buys 188pt of height for 72 of width', () => {
    setSafeAreaLeft(ISLAND);
    const bar = playAreaFor(PHONE_W, PHONE_H);
    setSideNav(true);
    const rail = playAreaFor(PHONE_W, PHONE_H);

    expect(rail.h - bar.h).toBe(188);
    // Exactly the rail's width, because the arrivals tab did not appear
    // from nowhere — it moved from the left edge to the right, so its 56
    // was already being spent. The rail is the only new reservation.
    //
    // Still exactly, after the edge sweep moved the left-hand tab off the
    // edge: this case sets the Island, and `railEdgeInset` is the larger of
    // the notch and the margin, so 50 was already paying for the clearance
    // 16 would have bought. The sweep bites on the *other* landscape
    // orientation, where there is no notch and the tab used to sit at 0.
    expect(bar.w - rail.w).toBe(NAV_RAIL_WIDTH);
    // 188 points of height for 72 of width, on a screen with 874 across
    // and 402 down. That is the whole case for the layout.
    expect(rail.h / bar.h).toBeGreaterThan(1.8);
  });
});
