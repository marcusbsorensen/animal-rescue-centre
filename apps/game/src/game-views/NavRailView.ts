import Phaser from 'phaser';
import { FONTS, TEXT_RESOLUTION, MIN_TAP, MIN_TAP_GAP, TYPE } from '../ui/constants';
import { NAV_RAIL_WIDTH, getSafeAreaLeft } from '../ui/layout';
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

/** Height of one rail cell — icon above label, clearing MIN_TAP by 8. */
const CELL_H = 56;
/**
 * Gap between cells. MIN_TAP_GAP is a floor, not a suggestion — two
 * targets that pass on size and fail on separation are, for a child
 * aiming at Care and hitting Walk, the same defect as being too small.
 * This was 10 and the measured run caught it.
 */
const CELL_GAP = MIN_TAP_GAP;
/**
 * Space left below the last cell.
 *
 * UNVERIFIED against the home indicator. 10 leaves the bottom cell 10pt
 * clear, and the Home Screen web clip reports `safe-area-inset-bottom:
 * 20px` (the Capacitor app reports 0 — see .claude/TRAPS.md, they are
 * different viewports). `ui/safe-area.ts` only reads the left inset, so
 * there is no bottom reading to lay this out against; on the clip the
 * last control may sit under the indicator. Same gap as the right-hand
 * inset the arrivals rail has, and the same fix.
 */
const BOTTOM_MARGIN = 10;

type RailItem = {
  iconKey: string;
  label: string;
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
      ? { iconKey: 'icon-back', label: 'Back', active: false, action: callbacks.onBack }
      : { iconKey: homeKey, label: 'Home', active: options.activeMode === 'corridor', action: callbacks.onHome },
    {
      iconKey: careKey,
      label: 'Care',
      active: options.activeMode === 'kitchen' || options.activeMode === 'garden',
      action: callbacks.onCare,
    },
    { iconKey: walkKey, label: 'Walk', active: false, action: callbacks.onWalk },
    { iconKey: socialKey, label: 'Social', active: false, action: callbacks.onSocial },
  ];

  const railX = getSafeAreaLeft();
  const railW = NAV_RAIL_WIDTH;
  const cx = railX + railW / 2;

  // ── Rail background ───────────────────────────────────
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.12);
  bg.fillRoundedRect(railX + 2, 8, railW, height - 16, railW / 2);
  bg.fillStyle(0xffffff, 0.92);
  bg.fillRoundedRect(railX, 6, railW, height - 12, railW / 2);
  navContainer.add(bg);

  // ── Cells, stacked upward from the bottom ─────────────
  const stackH = items.length * CELL_H + (items.length - 1) * CELL_GAP;
  const stackTop = height - BOTTOM_MARGIN - stackH;

  items.forEach((item, i) => {
    const cy = stackTop + i * (CELL_H + CELL_GAP) + CELL_H / 2;

    if (item.active) {
      const pill = scene.add.graphics();
      pill.fillStyle(0x5AAE4A, 0.18);
      pill.fillRoundedRect(railX + 5, cy - CELL_H / 2 + 2, railW - 10, CELL_H - 4, 16);
      navContainer.add(pill);
    }

    const iconPx = item.active ? 34 : 31;
    if (scene.textures.exists(item.iconKey)) {
      const img = scene.add.image(cx, cy - 9, item.iconKey)
        .setDisplaySize(iconPx, iconPx)
        .setOrigin(0.5);
      scene.textures.get(item.iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
      if (!item.active) img.setAlpha(0.82);
      navContainer.add(img);
    } else {
      navContainer.add(
        scene.add.text(cx, cy - 9, item.label.slice(0, 2), {
          fontSize: `${iconPx}px`, fontFamily: FONTS.title, fontStyle: 'bold',
          color: item.active ? '#3d8a2e' : '#6b5a4a', resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
      );
    }

    navContainer.add(
      scene.add.text(cx, cy + 15, item.label, {
        fontSize: item.active ? TYPE.caption : TYPE.caption,
        fontFamily: FONTS.body, fontStyle: 'bold',
        color: item.active ? '#3d8a2e' : '#6b5a4a', resolution: TEXT_RESOLUTION,
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
  return itemCount * CELL_H + Math.max(0, itemCount - 1) * CELL_GAP;
}
