import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  playAreaFor, railBoundsFor, railReservedWidth,
  navHeightFor, navBarMetrics, anchorSpaceFor, animalBoxFor,
  viewportIsShort, clampAnimalIntoBand, RAIL_WIDTH, RAIL_TAB_WIDTH,
  HUD_HEIGHT, ANIMAL_LABEL_HEIGHT, SPRITE_RENDER_SCALE,
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

/**
 * The viewport a Home Screen web clip actually gives us, measured with an
 * on-page probe rather than taken from the simulator panel, which reports
 * 780x360 device points. See .claude/TRAPS.md.
 */
const WEB_CLIP: [number, number] = [812, 325];

/** Smallest tap target that a 7-11 year old hits reliably (ui/constants). */
const MIN_TAP = 48;

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


/**
 * The vertical twin of the tests above. The HUD is drawn into uiContainer
 * and the nav into navContainer, both added after gameContainer, so a view
 * that lays out against the full screen height loses its lower content to
 * the nav bar exactly the way it used to lose its left column to the rail.
 *
 * Measured on the 812x325 web clip before this existed: an arriving dog in
 * the corridor rendered y158..306 against a bar starting at 229, and the
 * two cats in the Cat Room rendered 256 and 288px tall with their name
 * pills at y358 and y370 — below the bottom of a 325px screen.
 */
describe('the play band clears the nav bar', () => {
  it.each(DEVICES)('leaves content above the bar on %s', (_name, w, h) => {
    const play = playAreaFor(w, h);
    expect(play.y).toBe(HUD_HEIGHT);
    expect(play.y + play.h).toBe(h - navHeightFor(h));
    expect(play.y + play.h).toBeLessThanOrEqual(navBarMetrics(h).barY);
  });

  it('gives a landscape phone a usable band rather than 119px', () => {
    const [w, h] = WEB_CLIP;
    const play = playAreaFor(w, h);
    // 110 + 96 of chrome left 119. The compressed bar gives back 18.
    expect(play.h).toBe(137);
    expect(play.h / h).toBeGreaterThan(0.4);
  });

  it('changes nothing above the breakpoint', () => {
    expect(viewportIsShort(768)).toBe(false);
    expect(navHeightFor(768)).toBe(96);
    const m = navBarMetrics(768);
    expect(m.tabH).toBe(64);
    expect(m.fabSize).toBe(68);
    expect(m.barY).toBe(768 - 80 - 16);
  });

  it('splits the fleet: every iPhone compresses, every iPad does not', () => {
    // Tallest iPhone in landscape (17 Pro Max) against the shortest iPad
    // (mini). Nothing shipping lands between them.
    expect(viewportIsShort(440)).toBe(true);
    expect(viewportIsShort(744)).toBe(false);
  });

  it('keeps the bar and the height it reserves in step', () => {
    // These used to be independent — a 96px constant beside a bar that
    // measured itself — which is the kind of pair that drifts silently.
    for (const h of [325, 375, 440, 768, 1024]) {
      const m = navBarMetrics(h);
      expect(m.barH + m.barMargin).toBe(navHeightFor(h));
      expect(m.fabTop).toBeLessThan(m.barY);
    }
  });

  it('keeps the compressed nav tab above MIN_TAP', () => {
    // The bar gets shorter on a phone; the thing a child aims at does not
    // get smaller than she can hit.
    expect(navBarMetrics(325).tabH).toBeGreaterThanOrEqual(MIN_TAP);
  });
});

describe('animals are sized and placed for the band they are in', () => {
  it('caps a room animal so it and its labels fit a landscape phone', () => {
    const [w, h] = WEB_CLIP;
    const play = playAreaFor(w, h);
    const box = animalBoxFor(play, 100);
    expect(box).toBeLessThan(100);
    expect(box * SPRITE_RENDER_SCALE + ANIMAL_LABEL_HEIGHT)
      .toBeLessThanOrEqual(play.h);
  });

  it('does not shrink anything on an iPad', () => {
    const play = playAreaFor(1024, 768);
    expect(animalBoxFor(play, 100)).toBe(100);
    expect(animalBoxFor(play, 120)).toBe(120);
    expect(animalBoxFor(play, 74, false)).toBe(74);
  });

  it.each([...DEVICES, ['web clip', ...WEB_CLIP] as [string, number, number]])(
    'lands every hand-authored anchor above the bar on %s', (_name, w, h) => {
      const raw = fs.readFileSync(
        path.join(__dirname, '../../../public/data/room-anchors.json'),
        'utf-8',
      );
      const ys = [...raw.matchAll(/"y":\s*(-?[\d.]+)/g)]
        .map((m) => Number(m[1]))
        .filter((n) => Number.isFinite(n));
      expect(ys.length).toBeGreaterThan(0);

      const play = playAreaFor(w, h);
      const space = anchorSpaceFor(play, h);
      const box = animalBoxFor(play, 100);
      // Mirrors RoomView: the anchor gives a feet position, the sprite
      // renders SPRITE_RENDER_SCALE times the box around it, and the clamp
      // pulls whatever still hangs below the band back up.
      const halfH = (box * 0.8 * SPRITE_RENDER_SCALE) / 2;
      const below = ys.filter((frac) => {
        const feetY = space.top + frac * space.h;
        const y = clampAnimalIntoBand(feetY - halfH, halfH, play);
        return y + halfH + ANIMAL_LABEL_HEIGHT > play.y + play.h + 0.001;
      });
      expect(below).toEqual([]);
    });

  it('needs that clamp — the raw anchors run under the bar on every device', () => {
    // Not a nice-to-have: the anchors are fractions of background art that
    // is drawn behind the nav bar, so a third of them resolve below the
    // band even on an iPad. If this ever passes with zero, the anchor file
    // has been re-authored and the clamp can be revisited.
    const raw = fs.readFileSync(
      path.join(__dirname, '../../../public/data/room-anchors.json'),
      'utf-8',
    );
    const ys = [...raw.matchAll(/"y":\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
    const play = playAreaFor(1024, 768);
    const space = anchorSpaceFor(play, 768);
    const under = ys.filter((frac) => space.top + frac * space.h > play.y + play.h);
    expect(under.length).toBeGreaterThan(0);
  });

  it('never clamps an animal clean out of the top of the band', () => {
    // The clamp only moves animals up, so an over-tight band would push a
    // sprite into the HUD instead. A room animal sized by animalBoxFor has
    // to survive the deepest anchor on the shortest viewport.
    const [w, h] = WEB_CLIP;
    const play = playAreaFor(w, h);
    const halfH = (animalBoxFor(play, 100) * 0.8 * SPRITE_RENDER_SCALE) / 2;
    const y = clampAnimalIntoBand(play.y + play.h - halfH, halfH, play);
    expect(y - halfH).toBeGreaterThanOrEqual(play.y);
  });

  it('leaves the anchor space identical to the art rect on an iPad', () => {
    // The compromise below is a phone-only one: nothing on an iPad moves.
    const play = playAreaFor(1024, 768);
    expect(anchorSpaceFor(play, 768)).toEqual({ top: 20, h: 728 });
  });
});
