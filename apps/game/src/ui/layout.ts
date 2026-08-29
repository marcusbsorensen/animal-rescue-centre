/**
 * Pure layout geometry — no Phaser, so it can be unit-tested.
 *
 * The rail maths lives here rather than in LeftRailView because that module
 * imports Phaser transitively (via UIButton), and Phaser touches canvas at
 * import time, which jsdom cannot do. LeftRailView re-exports thin
 * scene-taking wrappers so callers see no difference.
 */

/** Width of the rail when it is shown in full. */
export const RAIL_WIDTH = 280;

/**
 * Width of the collapsed rail — the pull-tab a child taps to bring the
 * full rail in. Wide enough to carry the ARC paw and an arrivals badge,
 * and to clear MIN_TAP on its own.
 */
export const RAIL_TAB_WIDTH = 56;

/**
 * Viewport width below which the rail collapses to a tab by default.
 *
 * 1024 splits the fleet cleanly: every iPhone in landscape is narrower
 * (the widest, a 17 Pro Max, is 956) and every iPad in landscape is wider
 * (the narrowest, an iPad mini, is 1133). An iPad in Split View lands
 * below it and gets the tab, which is what a narrow window wants anyway.
 *
 * The reason for collapsing at all: 280px of a landscape phone's 812 is
 * 24% of the screen, spent continuously on counts a child reads once. The
 * arrivals it holds are the only urgent thing in it, and a badge says that
 * in 56px. On an iPad there is room for both, so the rail stays open.
 */
export const RAIL_COLLAPSE_BREAKPOINT = 1024;

/**
 * NOTE: this replaced a bottom-drawer path that was never reachable.
 *
 * The app is landscape-locked, so the narrowest shipping viewport is 812
 * (667 on an SE) and always cleared the drawer's 600px breakpoint —
 * renderDrawer and drawMiniArrivalCard never ran on a real device.
 *
 * Making that breakpoint height-aware would have woken them on a landscape
 * phone, and it was tried: it is worse. Nav (96) plus drawer (130) leaves
 * the game 812x149 between them, against 532x375 with the side rail. For a
 * game whose central problem is that the animals are not the focus, a
 * 149px-tall strip is the wrong trade. The drawer was drawn for a portrait
 * phone, which this app never shows.
 *
 * The tab below is the answer instead: it gives the phone back 224px of
 * width without taking any height, and it keeps one rail to maintain
 * rather than two. If the app ever gains a portrait mode, that is a new
 * layout, not the resurrection of this one.
 */

/**
 * Height of the HUD strip along the top. Views must lay their own chrome
 * out below this: the HUD is drawn into uiContainer, which is added after
 * gameContainer, so anything a view puts in the top 110px is both covered
 * by the HUD and loses the tap to it. The room's Decorate button used to
 * overlap the audio toggle by 48x27px — a child aiming at Decorate turned
 * the music off, with no model for why.
 */
export const HUD_HEIGHT = 110;

/** Height of the nav bar along the bottom, including its safe margin. */
export const NAV_HEIGHT = 96;

/**
 * side    — full rail, always shown, and it reserves its own width.
 * tab     — collapsed to a pull-tab; only the tab's width is reserved.
 * overlay — full rail slid in over the scene; still only the tab's width
 *           is reserved, so the scene does not reflow as it opens.
 */
export type RailMode = 'side' | 'tab' | 'overlay';

export interface RailBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: RailMode;
}

/** True where the rail collapses to a tab rather than standing open. */
export function railIsCollapsible(width: number): boolean {
  return width < RAIL_COLLAPSE_BREAKPOINT;
}

export function railBoundsFor(width: number, height: number, open = false): RailBounds {
  const y = HUD_HEIGHT;
  const h = height - HUD_HEIGHT;
  if (!railIsCollapsible(width)) {
    return { x: 0, y, w: RAIL_WIDTH, h, mode: 'side' };
  }
  return open
    ? { x: 0, y, w: RAIL_WIDTH, h, mode: 'overlay' }
    : { x: 0, y, w: RAIL_TAB_WIDTH, h, mode: 'tab' };
}

/**
 * The width along the left edge that game content must stay clear of.
 *
 * Deliberately independent of whether a collapsible rail is currently
 * open: an opened rail slides *over* the scene. If this changed with the
 * open state the whole room would reflow under the child's finger every
 * time she checked her arrivals, and the animals would jump.
 */
export function railReservedWidth(width: number): number {
  return railIsCollapsible(width) ? RAIL_TAB_WIDTH : RAIL_WIDTH;
}

/**
 * The horizontal slice of the scene that game content may use.
 *
 * The rail is opaque and mounted at depth 50, over everything the game
 * draws at depth 0. Laying content out across the full scene width
 * therefore hides whatever falls in the reserved column — which was 36 of
 * the 100 hand-authored room anchors on a landscape phone, including the
 * snake and fox door signs a child taps to enter a room.
 *
 * Views must lay out inside this box rather than the full width, and must
 * draw their background into it too: anchors are fractions of the
 * background art, so if the art and the anchors do not move together,
 * animals stop landing on the marks the art was painted for.
 */
export function playAreaFor(width: number, _height: number): { x: number; w: number } {
  const reserved = railReservedWidth(width);
  return { x: reserved, w: width - reserved };
}
