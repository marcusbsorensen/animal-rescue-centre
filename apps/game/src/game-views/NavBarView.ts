import Phaser from 'phaser';
import { createChromeButton } from '../ui/UIButton';
import { COLOURS, FONTS, TEXT_RESOLUTION, SAFE_MARGIN, MIN_TAP_GAP, TYPE, PAGE_MARGIN } from '../ui/constants';
import { viewportIsShort, navBarMetrics, playAreaFor } from '../ui/layout';
import type { GameStateStore } from '../game-state';

/**
 * NavBarView — the bottom navigation bar with 2 left tabs, a central
 * Supplies FAB, and 2 right tabs. Also exports the Games popup that
 * fires from the FAB, and a generic showQuickToast for short
 * navigation feedback ("No pets ready for a walk yet").
 *
 * Phase 6 extraction. Rendered at the top of every view in the scene.
 */

type NavTab = {
  iconKey: string;
  label: string;
  active: boolean;
  action: () => void;
};

export interface NavBarCallbacks {
  onBack: () => void;
  onHome: () => void;
  onCare: () => void;
  onWalk: () => void;
  onSocial: () => void;
  onFab: () => void;
}

export interface NavBarOptions {
  showBack?: boolean;
  /** Which view mode is currently active — drives tab highlighting. */
  activeMode: 'corridor' | 'room' | 'kitchen' | 'garden';
}

export function renderNavBar(
  scene: Phaser.Scene,
  navContainer: Phaser.GameObjects.Container,
  options: NavBarOptions,
  callbacks: NavBarCallbacks,
): void {
  const { width, height } = scene.scale;

  // Painterly nav icons live in signs/ — fall back to older icons/ keys
  const homeKey = scene.textures.exists('nav-home') ? 'nav-home' : 'icon-home';
  const careKey = scene.textures.exists('nav-care') ? 'nav-care' : 'icon-kitchen';
  const socialKey = scene.textures.exists('nav-social') ? 'nav-social' : 'icon-social';
  // 'nav-walk' has never existed on disk, and still doesn't. Keep reading
  // 'nav-play' first: signs/nav-play.png is the file that exists, and adding
  // a nav-walk.png would be dead art — the file made, unused, while the tab
  // looked for a filename that was never made. Overwrite nav-play.png.
  const walkKey = scene.textures.exists('nav-play')
    ? 'nav-play'
    : (scene.textures.exists('nav-walk')
        ? 'nav-walk'
        : (scene.textures.exists('icon-walk') ? 'icon-walk' : 'icon-games'));
  // 'fab-supplies' now exists — an open crate, commissioned 2026-08-30 with
  // the rest of the set, replacing fab-arc's lettered wooden plaque. The
  // plaque was the only control on the bar carrying words, which a
  // pre-reader gets nothing from. fab-arc stays on disk as the fallback.
  const fabKey = scene.textures.exists('fab-supplies')
    ? 'fab-supplies'
    : (scene.textures.exists('fab-arc')
        ? 'fab-arc'
        : (scene.textures.exists('icon-supply-run') ? 'icon-supply-run' : 'icon-depot'));

  const leftTabs: NavTab[] = options.showBack
    ? [
      { iconKey: 'icon-back', label: 'Back',  active: false, action: callbacks.onBack },
      { iconKey: careKey,     label: 'Care',  active: options.activeMode === 'kitchen' || options.activeMode === 'garden', action: callbacks.onCare },
    ]
    : [
      { iconKey: homeKey, label: 'Home', active: options.activeMode === 'corridor', action: callbacks.onHome },
      { iconKey: careKey, label: 'Care', active: options.activeMode === 'kitchen' || options.activeMode === 'garden', action: callbacks.onCare },
    ];

  const rightTabs: NavTab[] = [
    { iconKey: walkKey,   label: 'Walk',   active: false, action: callbacks.onWalk },
    { iconKey: socialKey, label: 'Social', active: false, action: callbacks.onSocial },
  ];

  // ── Bar geometry ──────────────────────────────────────
  //
  // On a landscape phone the bar is measured against a 325px viewport, so
  // its full-size 96px was 30% of the screen on its own. The short branch
  // trims the tab box and the bottom margin — never the type, which is at
  // its readability floor for a 7-11 year old — and hands the animals the
  // difference. NAV_HEIGHT_SHORT in ui/layout.ts is this arithmetic; the
  // play band is computed from it, so the two must move together.
  const short = viewportIsShort(height);
  const tabW = 74;
  // 64, up from 60: the tab labels went from 11px to 15/16px and need the
  // extra few pixels of vertical room. Costs 4px of bar height — still
  // under 10% of a 375x812 screen, well inside the HUD budget. 54 on a
  // short viewport still clears MIN_TAP (48) by 6.
  const { tabH, fabSize, fabLift, barH, barY } = navBarMetrics(height);
  const fabGap = 12;
  const tabsSide = leftTabs.length;
  // width - 32 rather than - 20, so the outermost tab's tap area clears the
  // 16px safe margin instead of sitting 13px from the edge.
  //
  // Each tab is budgeted tabW *plus* MIN_TAP_GAP. Without the gap the bar
  // was exactly wide enough to hold four 74px tabs and the tabs ended up
  // 2px apart — four targets that pass on size and fail on separation,
  // which for a child aiming at Shelter and hitting Garden is the same
  // thing as being too small. There is width to spare in landscape.
  const barW = Math.min(
    width - SAFE_MARGIN * 2,
    tabsSide * 2 * (tabW + MIN_TAP_GAP) + fabSize + fabGap * 2 + 28,
  );
  /**
   * Centred on the **play area**, not the screen — the same origin every
   * view title and the HUD already use.
   *
   * The HUD was moved onto the play origin when the side nav landed, and the
   * comment there explains why. The nav bar was left centring on `width`, so
   * the corridor showed three vertical axes at once: the title plate at
   * 441.5, the phase/weather pill pair at 427, and this bar and its FAB at
   * 406. Three near-misses 35px apart, on the screen a child spends most of
   * her time on, which reads as wobble rather than as a style.
   *
   * It is worse on an iPad, not better: the play centre is 660 against a
   * screen centre of 512, and the open rail (x 16..296) already drew over
   * this bar's left edge at barX 286.
   */
  const play = playAreaFor(width, height);
  const barX = play.x + (play.w - barW) / 2;

  // Glass bar background
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.14);
  bg.fillRoundedRect(barX + 2, barY + 4, barW, barH, barH / 2);
  bg.fillStyle(0xffffff, 0.92);
  bg.fillRoundedRect(barX, barY, barW, barH, barH / 2);
  bg.fillStyle(0xffffff, 0.6);
  bg.fillRoundedRect(barX + 2, barY + 2, barW - 4, 6, { tl: barH / 2, tr: barH / 2, bl: 0, br: 0 });
  navContainer.add(bg);

  // ── Tab drawer ────────────────────────────────────────
  // The icon rides above the label inside the tab box, so both offsets
  // come in with the box when it shrinks. Only the icon loses size — the
  // label keeps its 15/16px.
  const iconDy = short ? -9 : -11;
  const labelDy = short ? 16 : 19;
  const drawTab = (tab: NavTab, tx: number, ty: number) => {
    if (tab.active) {
      const pill = scene.add.graphics();
      pill.fillStyle(0x5AAE4A, 0.18);
      pill.fillRoundedRect(tx - tabW / 2 + 3, ty - tabH / 2 + 2, tabW - 6, tabH - 4, 16);
      navContainer.add(pill);
    }

    // Bumped up from 36/40 → 46/52. The painterly icons are 256-px
    // source art, so a larger display size reduces the downscale factor
    // (which is the real cause of the "pixellated" look on retina).
    const iconPx = short ? (tab.active ? 42 : 38) : (tab.active ? 52 : 46);
    if (scene.textures.exists(tab.iconKey)) {
      const img = scene.add.image(tx, ty + iconDy, tab.iconKey)
        .setDisplaySize(iconPx, iconPx)
        .setOrigin(0.5);
      scene.textures.get(tab.iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
      if (!tab.active) img.setAlpha(0.82);
      navContainer.add(img);
    } else {
      navContainer.add(
        scene.add.text(tx, ty + iconDy, tab.label.slice(0, 2), {
          fontSize: `${iconPx}px`, fontFamily: FONTS.title, fontStyle: 'bold',
          color: tab.active ? '#3d8a2e' : '#6b5a4a', resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
      );
    }
    // 16/15px, up from 12/11. These label the primary navigation for the
    // whole game and were the smallest type on the busiest screen — under
    // the 14px floor for a 7-11 year old reader (ux-review F2/F5). The
    // longest label is "Social", ~52px bold at 16px, so it still sits
    // inside the 74px tab.
    navContainer.add(
      scene.add.text(tx, ty + labelDy, tab.label, {
        fontSize: tab.active ? '16px' : TYPE.caption,
        fontFamily: FONTS.body, fontStyle: 'bold',
        color: tab.active ? '#3d8a2e' : '#6b5a4a', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );

    const hit = scene.add.rectangle(tx, ty, tabW, tabH, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', tab.action);
    navContainer.add(hit);
  };

  // ── Positions ─────────────────────────────────────────
  const ty = barY + barH / 2;
  const fabX = barX + barW / 2;
  const fabY = barY + fabLift;

  const leftStart = barX + 10;
  const leftAvail = (barW / 2) - (fabSize / 2 + fabGap) - 10;
  leftTabs.forEach((tab, i) => {
    const tx = leftStart + leftAvail * ((i + 0.5) / leftTabs.length);
    drawTab(tab, tx, ty);
  });

  const rightStart = barX + barW / 2 + fabSize / 2 + fabGap;
  const rightAvail = (barW / 2) - (fabSize / 2 + fabGap) - 10;
  rightTabs.forEach((tab, i) => {
    const tx = rightStart + rightAvail * ((i + 0.5) / rightTabs.length);
    drawTab(tab, tx, ty);
  });

  // ── Central FAB: Supplies / Depot runs ────────────────
  const fabShadow = scene.add.graphics();
  fabShadow.fillStyle(0x000000, 0.3);
  fabShadow.fillCircle(fabX + 2, fabY + 5, fabSize / 2);
  navContainer.add(fabShadow);

  const fabBg = scene.add.graphics();
  fabBg.fillStyle(0xffffff, 0.98);
  fabBg.fillCircle(fabX, fabY, fabSize / 2);
  fabBg.lineStyle(3, 0xE67E22, 1);
  fabBg.strokeCircle(fabX, fabY, fabSize / 2 - 1);
  navContainer.add(fabBg);

  if (scene.textures.exists(fabKey)) {
    const fabIcon = scene.add.image(fabX, fabY - 2, fabKey)
      .setDisplaySize(fabSize - 14, fabSize - 14).setOrigin(0.5);
    navContainer.add(fabIcon);
  } else {
    navContainer.add(
      scene.add.text(fabX, fabY - 2, '📦', {
        fontSize: '28px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  }

  /**
   * Caption under the FAB, on the same line as the four tab labels.
   *
   * It used to sit at `fabY + fabSize / 2 - 4`, which is its own coordinate
   * system: 13.5px above the labels either side of it, with its top 4px
   * behind the FAB's own hit circle. The centre label of the primary
   * navigation, out of line with the four beside it, on every viewport —
   * the report scored it at 44-45% covered on all three.
   *
   * `ty + labelDy` is the tab-label line. The -8 lifts it far enough to keep
   * the row optically level given the FAB sits higher than the tabs, and
   * still leaves 11px between the caption and the circle above it.
   */
  navContainer.add(
    scene.add.text(fabX, ty + labelDy - 8, 'Supplies', {
      fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold',
      color: '#6b5a4a', resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5, 0),
  );

  const fabHit = scene.add.circle(fabX, fabY, (fabSize + 8) / 2, 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  fabHit.on('pointerdown', () => callbacks.onFab());
  navContainer.add(fabHit);
}

// ── Games popup (from the central FAB) ──────────────────────

export interface GamesPopupCallbacks {
  onDepot: () => void;
  onSupplyRun: () => void;
  onCharms?: () => void;
  onDismiss: () => void;
}

export function renderGamesPopup(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  callbacks: GamesPopupCallbacks,
): void {
  const { width, height } = scene.scale;

  const overlay = scene.add
    .rectangle(width / 2, height / 2, width, height, 0x000000, 0.4)
    .setInteractive();
  container.add(overlay);

  const popupW = Math.min(300, width - PAGE_MARGIN * 2);
  const popupH = callbacks.onCharms ? 264 : 200;
  const popupX = width / 2;
  const popupY = height / 2 - 40;

  const popupGfx = scene.add.graphics();
  popupGfx.fillStyle(0x000000, 0.15);
  popupGfx.fillRoundedRect(popupX - popupW / 2 + 4, popupY - popupH / 2 + 5, popupW, popupH, 16);
  popupGfx.fillStyle(0xfef9ef, 1);
  popupGfx.fillRoundedRect(popupX - popupW / 2, popupY - popupH / 2, popupW, popupH, 14);
  popupGfx.lineStyle(2, 0x5a3d8a, 0.6);
  popupGfx.strokeRoundedRect(popupX - popupW / 2, popupY - popupH / 2, popupW, popupH, 14);
  container.add(popupGfx);

  container.add(
    scene.add.text(popupX, popupY - popupH / 2 + 30, 'Games', {
      fontSize: TYPE.lead, fontFamily: FONTS.title, fontStyle: 'bold',
      color: COLOURS.text,
    }).setOrigin(0.5),
  );

  // All three filled, and this is the one place the "one per screen" rule
  // does not apply. The popup is drawn in the chrome cream, so a plate here
  // would be a button the same colour as the thing it sits on — and these
  // are three peer destinations, not one action with two alternatives.
  const btnW = Math.min(220, popupW - 40);
  container.add(
    createChromeButton(scene, popupX, popupY - 10, 'Depot',
      () => callbacks.onDepot(),
      { width: btnW, fontSize: TYPE.lead, icon: 'icon-depot', variant: 'filled' }),
  );
  container.add(
    createChromeButton(scene, popupX, popupY + 52, 'Supply Run',
      () => callbacks.onSupplyRun(),
      { width: btnW, fontSize: TYPE.lead, icon: 'icon-supply-run', variant: 'filled' }),
  );
  if (callbacks.onCharms) {
    container.add(
      createChromeButton(scene, popupX, popupY + 114, 'Charms',
        () => callbacks.onCharms!(),
        { width: btnW, fontSize: TYPE.lead, variant: 'filled' }),
    );
  }

  overlay.on('pointerdown', () => callbacks.onDismiss());
}

// ── showQuickToast ──────────────────────────────────────────
//
// Used by the Walk tab to say "no pets ready for a walk". Different
// visual treatment from the error toast in ErrorOverlay.ts — shorter-
// lived, plain dark pill, near-bottom placement.

export function showQuickToast(scene: Phaser.Scene, message: string): void {
  const { width, height } = scene.scale;
  const toast = scene.add.container(width / 2, height - 140).setDepth(200);
  const padX = 18;
  const label = scene.add.text(0, 0, message, {
    fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold',
    color: '#ffffff', resolution: TEXT_RESOLUTION,
    wordWrap: { width: Math.min(width - PAGE_MARGIN * 2, 360) },
    align: 'center',
  }).setOrigin(0.5);
  const w = label.width + padX * 2;
  const h = label.height + 18;
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.78);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  toast.add([bg, label]);
  toast.setAlpha(0);
  scene.tweens.add({
    targets: toast, alpha: 1, duration: 180,
    hold: 1800, yoyo: true,
    onComplete: () => toast.destroy(),
  });
}
