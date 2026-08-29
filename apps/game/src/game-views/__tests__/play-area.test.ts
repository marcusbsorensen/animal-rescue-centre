import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  playAreaFor, railBoundsFor, railReservedWidth,
  RAIL_WIDTH, RAIL_TAB_WIDTH,
} from '../../ui/layout';

/**
 * The left rail is opaque and mounted at depth 50, over everything the game
 * draws at depth 0. Before the play area existed, every view laid out across
 * the full scene width and the rail simply covered the first 280px of it —
 * 36 of the 100 hand-authored anchors on a landscape phone, including the
 * snake and fox door signs, which are the control a child taps to enter a
 * room.
 *
 * These are arithmetic tests, not rendering tests: they check that the box
 * views are told to lay out inside actually clears the rail, and that the
 * anchors on disk still map into it. A future anchor edit that drags a
 * sprite back under the rail should fail here.
 */

/** Widest sign drawn at the door slots (CorridorView: 140 * scale, scale 1). */
const SIGN_W = 140;

/** Leftmost procedural door slot — bat, far left (CorridorView DOOR_SLOTS). */
const LEFTMOST_DOOR_FRAC = 0.14;

/** width, height pairs. Landscape phone is the case that used to break. */
const DEVICES: [string, number, number][] = [
  ['landscape phone', 812, 375],
  ['iPad landscape', 1024, 768],
  ['iPad portrait', 768, 1024],
];

describe('playAreaFor', () => {
  it('reserves only the tab on a landscape phone', () => {
    // 812x375 is a landscape iPhone. 280px of it is 24% of the screen for
    // counts a child reads once, so the rail collapses to its tab and
    // gives the animals the other 224px back.
    expect(railBoundsFor(812, 375).mode).toBe('tab');
    const play = playAreaFor(812, 375);
    expect(play.x).toBe(RAIL_TAB_WIDTH);
    expect(play.w).toBe(812 - RAIL_TAB_WIDTH);
  });

  it('reserves the full rail on iPad', () => {
    expect(railBoundsFor(1024, 768).mode).toBe('side');
    const play = playAreaFor(1024, 768);
    expect(play.x).toBe(RAIL_WIDTH);
    expect(play.w).toBe(1024 - RAIL_WIDTH);
  });

  it('splits the fleet at the breakpoint: every iPhone tabs, every iPad does not', () => {
    // Widest iPhone in landscape (17 Pro Max) against the narrowest iPad
    // (mini). Nothing shipping lands between them.
    expect(railBoundsFor(956, 440).mode).toBe('tab');
    expect(railBoundsFor(1133, 744).mode).toBe('side');
  });

  it('does not reflow the scene when the collapsed rail slides open', () => {
    // The opened rail is an overlay. If the play area moved with it, the
    // whole room would shift under the child's finger and the animals
    // would jump.
    const open = railBoundsFor(812, 375, true);
    expect(open.mode).toBe('overlay');
    expect(open.w).toBe(RAIL_WIDTH);
    expect(railReservedWidth(812)).toBe(RAIL_TAB_WIDTH);
    expect(playAreaFor(812, 375).x).toBe(RAIL_TAB_WIDTH);
  });

  it('ignores the open flag where the rail already stands open', () => {
    expect(railBoundsFor(1024, 768, true).mode).toBe('side');
  });
});

describe('content laid out in the play area clears the rail', () => {
  it.each(DEVICES)('leftmost door sign is fully clear on %s', (_name, w, h) => {
    const play = playAreaFor(w, h);
    // Mirrors the clamp in CorridorView: the outermost slots sit less than
    // half a sign width into the play area once the rail has its column, so
    // the sign is pushed in rather than allowed to clip under the rail.
    const cx = Math.min(
      Math.max(play.x + play.w * LEFTMOST_DOOR_FRAC, play.x + SIGN_W / 2),
      play.x + play.w - SIGN_W / 2,
    );
    expect(cx - SIGN_W / 2).toBeGreaterThanOrEqual(railReservedWidth(w));
  });

  it.each(DEVICES)('every hand-authored anchor is clear on %s', (_name, w, h) => {
    const raw = fs.readFileSync(
      path.join(__dirname, '../../../public/data/room-anchors.json'),
      'utf-8',
    );
    const xs = [...raw.matchAll(/"x":\s*(-?[\d.]+)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => Number.isFinite(n));
    expect(xs.length).toBeGreaterThan(0);

    const play = playAreaFor(w, h);
    const covered = xs.filter((frac) => play.x + play.w * frac < railReservedWidth(w));
    expect(covered).toEqual([]);
  });
});
