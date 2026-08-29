/**
 * Pure layout geometry — no Phaser, so it can be unit-tested.
 *
 * The rail maths lives here rather than in LeftRailView because that module
 * imports Phaser transitively (via UIButton), and Phaser touches canvas at
 * import time, which jsdom cannot do. LeftRailView re-exports thin
 * scene-taking wrappers so callers see no difference.
 */

/** Width of the rail on iPad / desktop. iPhone collapses it. */
export const RAIL_WIDTH = 280;

/** Viewport width below which the rail becomes a bottom drawer. */
export const RAIL_DRAWER_BREAKPOINT = 600;

/**
 * NOTE: the drawer path below is currently unreachable, and deliberately
 * left that way.
 *
 * The app is landscape-locked, so the narrowest shipping viewport is 812
 * (667 on an SE) and always clears 600 — renderDrawer and
 * drawMiniArrivalCard have never run on a real device.
 *
 * Making the breakpoint height-aware would wake them on a landscape phone,
 * and it was tried: it is worse. Nav (96) plus drawer (130) leaves the game
 * 812x149 between them, against 532x375 with the side rail. For a game whose
 * central problem is that the animals are not the focus, a 149px-tall strip
 * is the wrong trade. The drawer was drawn for a portrait phone, which this
 * app never shows.
 *
 * So: either the app gains a portrait mode and this code becomes live, or
 * the drawer path should be deleted. It should not be woken as-is.
 */

/**
 * Height of the HUD strip along the top. Views must lay their own chrome out
 * below this: the HUD is drawn into uiContainer, which is added after
 * gameContainer, so anything a view puts in the top 110px is both covered by
 * the HUD and loses the tap to it. The room's Decorate button used to overlap
 * the audio toggle by 48x27px — a child aiming at Decorate turned the music
 * off, with no model for why.
 */
export const HUD_HEIGHT = 110;

/** Height of the nav bar along the bottom, including its safe margin. */
export const NAV_HEIGHT = 96;

export interface RailBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: 'side' | 'drawer';
}

export function railBoundsFor(width: number, height: number): RailBounds {
  if (width < RAIL_DRAWER_BREAKPOINT) {
    // Phone: bottom drawer (peek state ~120px above the nav)
    const drawerH = 130;
    // Was 84, described as "matches NavBarView's render height" — it does not;
    // NavBarView renders 96 including its safe margin, so the drawer sat 12px
    // under the nav.
    return { x: 0, y: height - NAV_HEIGHT - drawerH, w: width, h: drawerH, mode: 'drawer' };
  }
  // Tablet / desktop: full-height left rail
  return { x: 0, y: HUD_HEIGHT, w: RAIL_WIDTH, h: height - HUD_HEIGHT, mode: 'side' };
}

/**
 * The horizontal slice of the scene that game content may use.
 *
 * The side rail is opaque and mounted at depth 50, over everything the game
 * draws at depth 0. Laying content out across the full scene width therefore
 * hides whatever falls in the first RAIL_WIDTH pixels — which was 36 of the
 * 100 hand-authored room anchors on a landscape phone, including the snake
 * and fox door signs a child taps to enter a room.
 *
 * Views must lay out inside this box rather than the full width, and must
 * draw their background into it too: anchors are fractions of the background
 * art, so if the art and the anchors do not move together, animals stop
 * landing on the marks the art was painted for.
 */
export function playAreaFor(width: number, height: number): { x: number; w: number } {
  const rail = railBoundsFor(width, height);
  return rail.mode === 'side'
    ? { x: rail.w, w: width - rail.w }
    : { x: 0, w: width };
}
