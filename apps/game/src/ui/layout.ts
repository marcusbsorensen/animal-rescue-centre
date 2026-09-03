/**
 * Pure layout geometry — no Phaser, so it can be unit-tested.
 *
 * The rail maths lives here rather than in LeftRailView because that module
 * imports Phaser transitively (via UIButton), and Phaser touches canvas at
 * import time, which jsdom cannot do. LeftRailView re-exports thin
 * scene-taking wrappers so callers see no difference.
 */

// The one import, and it is Phaser-free: `constants.ts` has no imports of
// its own, so pulling SAFE_MARGIN in keeps this module unit-testable in
// jsdom. Duplicating the number here instead is how the rail and the rest
// of the game would drift apart about what "clear of the edge" means.
import { SAFE_MARGIN } from './constants';

/** Width of the rail when it is shown in full. */
export const RAIL_WIDTH = 280;

/**
 * Width of the collapsed rail — the pull-tab a child taps to bring the
 * full rail in. Wide enough to carry the ARC paw and an arrivals badge,
 * and to clear MIN_TAP on its own.
 */
/**
 * The collapsed arrivals tab's width.
 *
 * Stays 56. A review put "waiting" at bold `TYPE.caption` at about 58px and
 * called the word wider than the tab it sits on; measured, it is **55.8** —
 * it fits, with 0.2px to spare. Widening to 60 would have cost 4px of a play
 * box that is already 1.73 against art authored at 1.78, which is a trade
 * with a recorded decision behind it (see `railBoundsFor`, and the
 * side-nav-layout test that holds `play.w` at 696).
 *
 * Recorded because the number is that tight: any longer word here, or a
 * heavier weight, does not fit.
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
 * NOTE: there was a `SPRITE_RENDER_SCALE = 2` here until 2026-08-30 —
 * createAnimalSprite doubled the fit scale, so every caller had to halve
 * the box it wanted and the sizing helpers below had to divide by it.
 * The box a caller asks for is now the box that gets drawn, so the
 * constant has nothing left to say. Do not reintroduce it: the reason
 * decorations kept landing inside the animals was that the size a caller
 * held and the size on screen were two different numbers.
 */

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
 * `halfH` should still come from the sprite's rendered height rather than
 * the box handed to it. The two now agree on the tall axis of a square
 * source, but a caller that asks for a wide box gets an animal narrower
 * than it, and an anchor's own `scale` multiplies the result again.
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

/**
 * How far the left edge is unusable, in pixels.
 *
 * Ambient rather than a parameter because it is a property of the
 * device, not of the call: it is the same for every caller at any given
 * moment, and threading it through four view signatures would say
 * otherwise. Defaults to 0, so unit tests and every existing caller keep
 * the behaviour they had.
 *
 * Set from `readSafeAreaInsets().left` at boot and on resize — see
 * ui/safe-area.ts for why it cannot be read once and kept.
 */
let safeAreaLeft = 0;

/** Set the left inset. The only mutation point; call it on resize. */
export function setSafeAreaLeft(px: number): void {
  safeAreaLeft = Number.isFinite(px) && px > 0 ? px : 0;
}

/** The current left inset, for callers that need to reason about it. */
export function getSafeAreaLeft(): number {
  return safeAreaLeft;
}

/**
 * Width of the vertical navigation rail in the side-nav layout.
 *
 * 72 carries a 56px icon target — MIN_TAP plus 8 — with 8px of margin
 * each side. The whole argument for the layout is that width is the
 * plentiful axis in landscape and height is not: 72 of 874 buys back the
 * 78px nav bar and the 110px HUD strip, both of which came out of the
 * 402 we cannot spare.
 */
export const NAV_RAIL_WIDTH = 72;

/**
 * Side-nav layout: navigation down the left edge, arrivals down the
 * right, the room in between and no horizontal chrome at all.
 *
 * Ambient for the same reason the safe-area inset is — a property of the
 * build rather than of the call — and off by default, so every existing
 * caller and every test keeps the layout it had. Set from `?sideRail` at
 * boot; see `docs/landscape-relayout-2026-08-31.md`.
 *
 * This is a prototype switch, not a finished second layout. While it is
 * on the HUD is not drawn at all: its counts are already in the arrivals
 * rail, but the level orb, XP bar, coins and audio toggle are not, and
 * they have nowhere to live yet.
 */
let sideNav = false;

/** Turn the side-nav layout on or off. The only mutation point. */
export function setSideNav(on: boolean): void {
  sideNav = on;
}

/** True where the side-nav layout is active. */
export function sideNavEnabled(): boolean {
  return sideNav;
}

/** True where the rail collapses to a tab rather than standing open. */
export function railIsCollapsible(width: number): boolean {
  return width < RAIL_COLLAPSE_BREAKPOINT;
}

/**
 * How far the rail sits from the edge it is anchored to.
 *
 * The notch inset where there is one, and `SAFE_MARGIN` where there is
 * not — never zero. The collapsed pull-tab used to start at
 * `safeAreaLeft`, which is 0 in the landscape orientation that puts the
 * Dynamic Island on the *other* side, and `ux-review.spec.ts` scored it as
 * the only 0px control in the game.
 *
 * A tab flush to the edge is arguably what a pull-tab is. It is still
 * wrong here: the rule the project wrote down says nothing a child has to
 * hit sits in the margin, and a 56px tab has room to give 16 of them back.
 * The alternative — an exemption for "edge affordances" — is the kind of
 * clause that later hides a real defect.
 *
 * `railReservedWidth` and `playAreaFor` add this to what they reserve, so
 * content starts clear of the tab rather than under it.
 */
export function railEdgeInset(): number {
  return Math.max(safeAreaLeft, SAFE_MARGIN);
}

export function railBoundsFor(width: number, height: number, open = false): RailBounds {
  // Under the side-nav layout the arrivals rail moves to the right edge:
  // the left belongs to navigation. It spans the full height because
  // there is no HUD strip above it to start below.
  //
  // No right-hand safe-area inset is applied. In the orientation this was
  // prototyped in the Dynamic Island is on the left, where the nav rail
  // already clears it; rotated the other way the Island lands on this
  // edge and `ui/safe-area.ts` has no right reading to give. That is a
  // known gap, listed in the relayout doc.
  if (sideNav) {
    const mode: RailMode = !railIsCollapsible(width)
      ? 'side'
      : (open ? 'overlay' : 'tab');
    // Flush to the right edge, deliberately, where the left-hand tab is
    // held off by `railEdgeInset`.
    //
    // Not an oversight and not consistency for its own sake. Insetting
    // this one costs 16px of play width, and the play box under side-nav
    // is 696x402 — an aspect of 1.77 against room art authored at 1.78,
    // which is the one place in the game where the art fits the box it is
    // given. 680 wide puts it back to letterboxing. The left-hand tab has
    // no such price and is the edge `ux-review.spec.ts` actually scores.
    //
    // So: a measured defect on one edge, a real cost and no measurement on
    // the other. If the right edge is ever worth the same 16, the art fit
    // is what it is being spent from — decide it there, not here.
    const w = mode === 'tab' ? RAIL_TAB_WIDTH : RAIL_WIDTH;
    return { x: width - w, y: 0, w, h: height, mode };
  }

  const y = HUD_HEIGHT;
  const h = height - HUD_HEIGHT;
  // Start clear of the notch, or of the safe margin where there is no
  // notch — see `railEdgeInset`. The tab keeps its full width and moves
  // right; shrinking it instead would have taken a 56-wide target down to
  // 6 on the device that needs it most.
  const x = railEdgeInset();
  if (!railIsCollapsible(width)) {
    return { x, y, w: RAIL_WIDTH, h, mode: 'side' };
  }
  return open
    ? { x, y, w: RAIL_WIDTH, h, mode: 'overlay' }
    : { x, y, w: RAIL_TAB_WIDTH, h, mode: 'tab' };
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
  // The inset is reserved too: the rail starts after it, so content laid
  // out from the bare rail width would slide under the rail rather than
  // under the notch.
  return railEdgeInset() + (railIsCollapsible(width) ? RAIL_TAB_WIDTH : RAIL_WIDTH);
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
  // Side-nav: both bars are gone, so the band is the whole height. The
  // nav rail reserves on the left (after the notch) and the arrivals tab
  // reserves on the right, exactly as it used to reserve on the left —
  // an opened rail still slides over the scene rather than reflowing it.
  //
  // On an iPhone 17 Pro (874x402, 50pt of Island) that is 696x402, an
  // aspect of 1.77 against room art authored at 1.78. The art fits the
  // box it is given for the first time.
  if (sideNav) {
    const left = safeAreaLeft + NAV_RAIL_WIDTH;
    const right = railIsCollapsible(width) ? RAIL_TAB_WIDTH : RAIL_WIDTH;
    return { x: left, y: 0, w: width - left - right, h: height };
  }

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
  // Side-nav draws the art into the play box, so the anchor rect and the
  // art rect are the same rect again and the compromise described above
  // has nothing left to correct. This is the quieter prize in the
  // relayout: not the extra height, but art and anchors agreeing.
  if (sideNav) return { top: area.y, h: area.h };
  if (!viewportIsShort(height)) return { top: 20, h: height - 40 };
  return { top: area.y, h: area.h };
}

/**
 * The box to hand createAnimalSprite so the animal *and* its labels fit
 * the play band.
 *
 * `base` is the size the animal wants to be drawn at where there is room
 * — the same units createAnimalSprite now takes. On a 325px screen the
 * two cats in the Cat Room measured 256 and 288px, with their name pills
 * and bond bars entirely below y=325; capping against the band is what
 * stops that. On an iPad the cap is far above the base and nothing moves.
 */
export function animalBoxFor(area: PlayArea, base: number, labelled = true): number {
  const labels = labelled ? ANIMAL_LABEL_HEIGHT : 0;
  const room = Math.max(0, area.h - labels);
  return Math.min(base, room);
}
