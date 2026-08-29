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
 * Viewport height below which the chrome compresses and content is laid
 * out in the band between the two bars rather than across the screen.
 *
 * 480 splits the fleet the way RAIL_COLLAPSE_BREAKPOINT splits it on
 * width: every iPhone in landscape is shorter (the tallest, a 17 Pro Max,
 * is 440) and every iPad in landscape is taller (the shortest, an iPad
 * mini, is 744). Above it nothing changes, so the iPad keeps the layout
 * it already has.
 *
 * Why compress at all: HUD 110 + nav 96 is 206 of the 812x325 a web clip
 * gives us — 63% of the screen spent on chrome, leaving the animals 119px.
 * Measured in the corridor, an arriving dog rendered y158..306 against a
 * nav bar starting at 229, so the child saw it from the chest up.
 */
export const SHORT_VIEWPORT_HEIGHT = 480;

/**
 * Nav bar height on a short viewport.
 *
 * The bar loses 10px of its own height (a 54px tab still clears MIN_TAP
 * by 6) and 8px of bottom margin — the web clip already sits above a
 * 50px OS-reserved strip, so the full 16 is belt and braces there. The
 * type does not shrink: 15/16px is the floor for a 7-11 year old reader
 * and is not a size to trade for layout.
 */
export const NAV_HEIGHT_SHORT = 78;

/** True where the viewport is too short to carry the full-size chrome. */
export function viewportIsShort(height: number): boolean {
  return height < SHORT_VIEWPORT_HEIGHT;
}

/** Height the nav bar occupies at this viewport height. */
export function navHeightFor(height: number): number {
  return viewportIsShort(height) ? NAV_HEIGHT_SHORT : NAV_HEIGHT;
}

/**
 * The nav bar's own geometry, in one place.
 *
 * NavBarView draws from this and the play band is computed from it, so
 * the bar cannot change height without the band following. They used to
 * be independent — a 96px NAV_HEIGHT constant beside a bar that measured
 * itself from `tabH + 16 + SAFE_MARGIN` — which is the kind of pair that
 * agrees until someone edits one of them.
 *
 * `fabTop` is above `barY`: the Supplies FAB is lifted proud of the bar,
 * so it is the lowest line a view may draw to in the centre column even
 * though the band runs to `barY`.
 */
export interface NavBarMetrics {
  tabH: number;
  fabSize: number;
  fabLift: number;
  barH: number;
  barMargin: number;
  barY: number;
  fabTop: number;
}

export function navBarMetrics(height: number): NavBarMetrics {
  const short = viewportIsShort(height);
  const tabH = short ? 54 : 64;
  const fabSize = short ? 56 : 68;
  const fabLift = short ? 4 : 6;
  const barH = tabH + 16;
  const barMargin = short ? 8 : 16;
  const barY = height - barH - barMargin;
  return {
    tabH, fabSize, fabLift, barH, barMargin, barY,
    fabTop: barY + fabLift - fabSize / 2,
  };
}

/**
 * How much larger a sprite renders than the box createAnimalSprite is
 * handed — see the `* 2` in ui/sprites.ts, which reads this.
 *
 * It lives here rather than there because it is a layout fact: a caller
 * sizing an animal to fit a band has to know it, and layout.ts is the
 * Phaser-free module the sizing helpers can be unit-tested in.
 */
export const SPRITE_RENDER_SCALE = 2;

/**
 * Vertical room taken under an animal by its name pill and bond bar.
 *
 * RoomView draws the pill at halfH + 14 (18px tall) and the bond bar at
 * halfH + 32 (5px), so the last ink is ~37px below the sprite's bottom
 * edge; 42 leaves a few px of breathing room.
 */
export const ANIMAL_LABEL_HEIGHT = 42;

/**
 * Pull an animal — and with it every label placed off its centre — back
 * inside the play band.
 *
 * This is the guarantee, not the anchor data: 32 of the 100 hand-authored
 * anchors resolve below the band bottom even on an iPad, because they are
 * fractions of the background art and the art runs behind the nav bar.
 * Sizing and the anchor space narrow the problem; this closes it.
 *
 * `halfH` must come from the sprite's rendered height, not the box it was
 * handed: createAnimalSprite renders at SPRITE_RENDER_SCALE times that box
 * and an anchor's own scale multiplies it again, so a clamp computed from
 * the requested size leaves the real lower edge inside the bar.
 *
 * Returns the adjusted centre y. Only ever moves an animal up, so on a
 * viewport with room to spare it returns `y` untouched.
 */
export function clampAnimalIntoBand(
  y: number,
  halfH: number,
  area: PlayArea,
  labelled = true,
): number {
  const lastInk = y + halfH + (labelled ? ANIMAL_LABEL_HEIGHT : 0);
  const spill = lastInk - (area.y + area.h);
  return spill > 0 ? y - spill : y;
}

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

/** The box game content may use: clear of the rail, HUD and nav bar. */
export interface PlayArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The slice of the scene that game content may use.
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
 *
 * `y`/`h` are the same idea on the vertical: the HUD is drawn into
 * uiContainer and the nav into navContainer, both added after
 * gameContainer, so anything a view puts in those strips is covered and
 * loses the tap. On an iPad that leaves 562 of 768 and nothing has to
 * move; on a landscape phone it is 137 of 325, which is why the animals
 * have to be sized from this box rather than from a constant.
 */
export function playAreaFor(width: number, height: number): PlayArea {
  const reserved = railReservedWidth(width);
  return {
    x: reserved,
    y: HUD_HEIGHT,
    w: width - reserved,
    h: height - HUD_HEIGHT - navHeightFor(height),
  };
}

/**
 * The rect that fractional anchor coordinates are resolved against.
 *
 * Anchors are fractions of the background art, and the art is drawn to
 * fill the screen (inset 20px top and bottom) — so on a tall viewport
 * this is that same rect and the maths is unchanged. 59 of the 100
 * hand-authored anchors sit below 0.7, which on a 325px screen resolves
 * to y >= 219 — behind a nav bar that starts at 229. On a short viewport
 * the anchors therefore resolve against the play band instead.
 *
 * The trade that buys: the art still fills the screen, so there are no
 * blank strips behind the chrome, but the anchor space is compressed
 * relative to it, so an animal the art puts on the painted floor stands
 * a little above that floor line. Visible, and better than being drawn
 * behind the nav bar — but it is a compromise, not a free win.
 */
export function anchorSpaceFor(area: PlayArea, height: number): { top: number; h: number } {
  if (!viewportIsShort(height)) return { top: 20, h: height - 40 };
  return { top: area.y, h: area.h };
}

/**
 * The box to hand createAnimalSprite so the animal *and* its labels fit
 * the play band.
 *
 * Sprites render at SPRITE_RENDER_SCALE times the box asked for, so
 * RoomView's 100px request came out 200px tall — on a 325px screen the
 * two cats measured 256 and 288px, running off the bottom edge with
 * their name pills and bond bars entirely below y=325. Capping the box
 * against the band is what stops that; on an iPad the cap is far above
 * the base size and nothing changes.
 */
export function animalBoxFor(area: PlayArea, base: number, labelled = true): number {
  const labels = labelled ? ANIMAL_LABEL_HEIGHT : 0;
  const room = Math.max(0, area.h - labels);
  return Math.min(base, room / SPRITE_RENDER_SCALE);
}
