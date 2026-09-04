import Phaser from 'phaser';
import {
  FONTS, TEXT_RESOLUTION, MIN_TAP, MIN_TAP_GAP, TYPE, NAV_COLOURS, hexNum,
  SPACE, statusRowCy, SAFE_MARGIN, COLOURS,
} from '../ui/constants';
import { NAV_RAIL_WIDTH, railEdgeInset } from '../ui/layout';
import type { NavBarCallbacks, NavBarOptions } from './NavBarView';

/**
 * NavRailView — the vertical navigation rail down the left edge, the
 * side-nav counterpart to NavBarView's bottom bar.
 *
 * Drawn only while `sideNavEnabled()`; see `ui/layout.ts` for the switch
 * and `docs/landscape-relayout-2026-08-31.md` for why the layout exists.
 * It answers the same callbacks as the bar, so GameScene picks one or
 * the other and nothing downstream knows the difference.
 *
 * Two things here are deliberate and are the things to look at on a
 * device:
 *
 * **The controls are bottom-anchored, not spread.** Held in landscape, a
 * child's thumbs sit near the bottom corners; a rail distributed evenly
 * top to bottom puts its first items where small hands cannot reach
 * without regripping. So the stack grows upward from the bottom margin.
 *
 * **The labels survive.** The doc proposed icons only. The bar's 15/16px
 * type was set at the readability floor for a 7-11 year old and was
 * explicitly not traded for layout, so it is not traded here either —
 * 72pt is wide enough for "Social" at 15px bold (~52pt). If the stack
 * turns out to be too tall on a device, the item count is the thing to
 * cut, not the type.
 */

/**
 * The tallest a rail cell wants to be — icon above label, clearing MIN_TAP
 * by 8. It shrinks toward `MIN_TAP` where the header above leaves less; see
 * `cellHeightFor`.
 */
const CELL_H_MAX = 56;
/**
 * Radius of a header status chip — the rail's column starts below them.
 * Same number as `HUDView`'s `CHIP_R`; the two rows have to agree and the
 * header is the one that sets it.
 */
const CHIP_R = 22;
/**
 * Gap between cells. MIN_TAP_GAP is a floor, not a suggestion — two
 * targets that pass on size and fail on separation are, for a child
 * aiming at Care and hitting Walk, the same defect as being too small.
 * This was 10 and the measured run caught it.
 */
const CELL_GAP = MIN_TAP_GAP;
/**
 * Room the label takes under the disc.
 *
 * `TYPE.caption` bold in `FONTS.body` measures ~18 tall. Hard-coded rather
 * than measured because the disc has to be sized before the text exists,
 * and every cell's label is the same size — if the type scale moves, this
 * moves with it.
 */
const LABEL_H = 18;
/**
 * Space left below the last cell.
 *
 * `SAFE_MARGIN`, because the edge sweep scores this edge: at 10 the bottom
 * cell measured 10px from the screen on all four viewports and L3 called
 * it, which is the same rule that moved the arrivals pull-tab off the left
 * edge. Six points off the stack; the stack is bottom-anchored and has
 * them.
 *
 * Still UNVERIFIED against the home indicator, which is a different
 * question from the sweep's. The Home Screen web clip reports
 * `safe-area-inset-bottom: 20px` and the Capacitor app reports 0 — see
 * .claude/TRAPS.md, they are different viewports — and `ui/safe-area.ts`
 * only reads the left inset, so there is no bottom reading to lay this out
 * against. On the clip the last control may still sit under the indicator.
 */
const BOTTOM_MARGIN = SAFE_MARGIN;

/**
 * The height a cell may take, given the room between the header and the
 * bottom margin.
 *
 * The stack was a fixed 4 x 56 + 3 x 12 = 260 and the header leaves 247 on
 * a 402pt screen, so the top cell rode up *through* the status chips — the
 * Back button and the time-of-day disc overlapping by 4.5px, which is what
 * Marcus saw. A fixed stack under a fixed header is two constants that
 * agree until one of them moves.
 *
 * Floored at `MIN_TAP`: a cell is a tap target before it is a layout, and
 * where even that will not fit the item count is what has to give — the
 * same conclusion the four-not-five arithmetic reached above.
 */
function cellHeightFor(available: number, count: number): number {
  const gaps = Math.max(0, count - 1) * CELL_GAP;
  return Phaser.Math.Clamp((available - gaps) / count, MIN_TAP, CELL_H_MAX);
}

type RailItem = {
  iconKey: string;
  label: string;
  /** The destination's brand hue — see NAV_COLOURS for why each is its own. */
  colour: string;
  active: boolean;
  action: () => void;
};

export function renderNavRail(
  scene: Phaser.Scene,
  navContainer: Phaser.GameObjects.Container,
  options: NavBarOptions,
  callbacks: NavBarCallbacks,
): void {
  const { height } = scene.scale;

  // Same fallback chains as the bar — the painterly set lives in signs/
  // and older icons/ keys stand in where a piece was never commissioned.
  const homeKey = scene.textures.exists('nav-home') ? 'nav-home' : 'icon-home';
  const careKey = scene.textures.exists('nav-care') ? 'nav-care' : 'icon-kitchen';
  const socialKey = scene.textures.exists('nav-social') ? 'nav-social' : 'icon-social';
  const walkKey = scene.textures.exists('nav-play')
    ? 'nav-play'
    : (scene.textures.exists('icon-walk') ? 'icon-walk' : 'icon-games');
  // Four items, not five, and this is the arithmetic that decided it.
  //
  // A cell is 56 (MIN_TAP plus 8) and cells are MIN_TAP_GAP apart, so
  // five need 328 of a 402pt screen: bottom-anchor them and the stack
  // still starts 16% down, which is not a rail a child's thumb can work
  // without regripping. Four need 260 and start 33% down — the lower
  // two-thirds the relayout asked for.
  //
  // Supplies is the one that goes. The FAB gave it the most prominent
  // control in the game, and the primary loop is caring for animals, not
  // restocking the depot; it lives in Care now. Its raised-centre shape
  // meant nothing in a vertical stack either way.
  const items: RailItem[] = [
    options.showBack
      ? { iconKey: 'icon-back', label: 'Back', colour: NAV_COLOURS.back, active: false, action: callbacks.onBack }
      : {
        iconKey: homeKey, label: 'Home', colour: NAV_COLOURS.home,
        active: options.activeMode === 'corridor', action: callbacks.onHome,
      },
    {
      iconKey: careKey,
      label: 'Care',
      colour: NAV_COLOURS.care,
      active: options.activeMode === 'kitchen' || options.activeMode === 'garden',
      action: callbacks.onCare,
    },
    { iconKey: walkKey, label: 'Walk', colour: NAV_COLOURS.walk, active: false, action: callbacks.onWalk },
    { iconKey: socialKey, label: 'Social', colour: NAV_COLOURS.social, active: false, action: callbacks.onSocial },
  ];

  const railX = railEdgeInset();
  const railW = NAV_RAIL_WIDTH;
  const cx = railX + railW / 2;

  // ── Rail background ───────────────────────────────────
  //
  // The column starts below the header, not at the top of the screen.
  //
  // The room title is drawn by the view into `gameContainer`, which is
  // under `navContainer`, so a title running onto a full-height rail is a
  // title with its icon behind an opaque column — and the fix is not to
  // fight the z-order but to stop the column reaching that far. The title
  // and the status chips share the rail's left edge instead, which is what
  // ties them together; the cells are bottom-anchored and were never using
  // the top third anyway.
  const bgTop = statusRowCy(CHIP_R) + CHIP_R + SPACE.s;
  const bgH = height - bgTop - 6;
  const CELL_H = cellHeightFor(height - bgTop - BOTTOM_MARGIN, items.length);
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.12);
  bg.fillRoundedRect(railX + 2, bgTop + 2, railW, bgH, railW / 2);
  bg.fillStyle(0xffffff, 0.92);
  bg.fillRoundedRect(railX, bgTop, railW, bgH, railW / 2);
  navContainer.add(bg);

  // ── Cells, stacked upward from the bottom ─────────────
  const stackH = items.length * CELL_H + (items.length - 1) * CELL_GAP;
  const stackTop = height - BOTTOM_MARGIN - stackH;

  items.forEach((item, i) => {
    const cy = stackTop + i * (CELL_H + CELL_GAP) + CELL_H / 2;

    const hue = hexNum(item.colour);

    // Disc and label are sized *from the cell*, not from constants, and
    // that is the whole lesson of this pass: the cell height is itself
    // derived from what the header leaves, so a fixed 44px disc plus an
    // 18px label came to 64 in a 53px cell and the label hung out of the
    // bottom of its own tap target. `ux-review` reads a label that is only
    // partly inside its control as text cut by a control, which is exactly
    // what it is.
    const discD = Math.max(MIN_TAP - 20, CELL_H - LABEL_H - 2);
    const discR = discD / 2;
    const iconPx = discD - 12;
    const iconCy = cy - CELL_H / 2 + discR;

    // **The disc is the colour, not a wash behind it.**
    //
    // The first attempt tinted the label and put a 0.2-alpha halo behind
    // the icon — and behind the icon's own opaque cream disc, which is
    // where it stayed. The rail still read as four identical cream circles
    // with small coloured words under them, which is the thing the colour
    // was meant to fix.
    //
    // So the painted icon is drawn smaller than the disc and sits *on* it:
    // a solid ring of the destination's hue, wide enough to read at arm's
    // length. Inactive cells carry it at 0.55 so the one you are standing
    // in is still the loudest.
    const disc = scene.add.graphics();
    if (item.active) {
      disc.fillStyle(hue, 0.16);
      disc.fillRoundedRect(railX + 5, cy - CELL_H / 2 + 2, railW - 10, CELL_H - 4, 16);
    }
    disc.fillStyle(hue, item.active ? 1 : 0.55);
    disc.fillCircle(cx, iconCy, discR);
    navContainer.add(disc);

    if (scene.textures.exists(item.iconKey)) {
      const img = scene.add.image(cx, iconCy, item.iconKey)
        .setDisplaySize(iconPx, iconPx)
        .setOrigin(0.5);
      scene.textures.get(item.iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
      if (!item.active) img.setAlpha(0.9);
      navContainer.add(img);
    } else {
      navContainer.add(
        scene.add.text(cx, iconCy, item.label.slice(0, 2), {
          fontSize: `${iconPx}px`, fontFamily: FONTS.title, fontStyle: 'bold',
          color: COLOURS.bg, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
      );
    }

    navContainer.add(
      scene.add.text(cx, cy + CELL_H / 2 - LABEL_H / 2, item.label, {
        fontSize: TYPE.caption,
        fontFamily: FONTS.body, fontStyle: 'bold',
        color: item.colour, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );

    const hit = scene.add.rectangle(cx, cy, Math.max(railW, MIN_TAP), Math.max(CELL_H, MIN_TAP), 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', item.action);
    navContainer.add(hit);
  });
}

/**
 * The vertical space the rail's controls need.
 *
 * Five cells is 320 of a 402pt screen, which is why the stack reaches
 * nearly to the top despite being bottom-anchored: five accessible
 * targets and a genuinely thumb-reachable rail do not both fit, and the
 * item count is the first thing to cut if the device says so.
 */
export function navRailStackHeight(itemCount: number): number {
  return itemCount * CELL_H_MAX + Math.max(0, itemCount - 1) * CELL_GAP;
}
