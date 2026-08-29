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
    const navH = 84; // matches NavBarView's render height
    return { x: 0, y: height - navH - drawerH, w: width, h: drawerH, mode: 'drawer' };
  }
  // Tablet / desktop: full-height left rail
  const hudH = 110; // leave room for the slimmer HUD top strip
  return { x: 0, y: hudH, w: RAIL_WIDTH, h: height - hudH, mode: 'side' };
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
