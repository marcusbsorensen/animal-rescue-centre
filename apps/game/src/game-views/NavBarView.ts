import Phaser from 'phaser';
import { createButton } from '../ui/UIButton';
import { COLOURS, FONTS, TEXT_RESOLUTION } from '../ui/constants';
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
  const walkKey = scene.textures.exists('nav-walk')
    ? 'nav-walk'
    : (scene.textures.exists('icon-walk') ? 'icon-walk' : 'icon-games');
  const fabKey = scene.textures.exists('fab-supplies')
    ? 'fab-supplies'
    : (scene.textures.exists('icon-supply-run')
        ? 'icon-supply-run'
        : (scene.textures.exists('icon-depot') ? 'icon-depot' : 'fab-arc'));

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
  const tabW = 74;
  const tabH = 60;
  const fabSize = 68;
  const fabGap = 12;
  const tabsSide = leftTabs.length;
  const barW = Math.min(width - 20, tabsSide * 2 * tabW + fabSize + fabGap * 2 + 28);
  const barH = tabH + 16;
  const barX = (width - barW) / 2;
  const barY = height - barH - 16;

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
    const iconPx = tab.active ? 52 : 46;
    if (scene.textures.exists(tab.iconKey)) {
      const img = scene.add.image(tx, ty - 9, tab.iconKey)
        .setDisplaySize(iconPx, iconPx)
        .setOrigin(0.5);
      scene.textures.get(tab.iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
      if (!tab.active) img.setAlpha(0.82);
      navContainer.add(img);
    } else {
      navContainer.add(
        scene.add.text(tx, ty - 9, tab.label.slice(0, 2), {
          fontSize: `${iconPx}px`, fontFamily: FONTS.title, fontStyle: 'bold',
          color: tab.active ? '#3d8a2e' : '#6b5a4a', resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
      );
    }
    navContainer.add(
      scene.add.text(tx, ty + 18, tab.label, {
        fontSize: tab.active ? '12px' : '11px',
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
  const fabY = barY + 6;

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

  // Caption under the FAB
  navContainer.add(
    scene.add.text(fabX, fabY + fabSize / 2 - 6, 'Supplies', {
      fontSize: '11px', fontFamily: FONTS.body, fontStyle: 'bold',
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

  const popupW = Math.min(300, width - 40);
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
      fontSize: '22px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: COLOURS.text,
    }).setOrigin(0.5),
  );

  const btnW = Math.min(220, popupW - 40);
  container.add(
    createButton(scene, popupX, popupY - 10, 'Depot',
      () => callbacks.onDepot(),
      { width: btnW, fontSize: '20px', bgColour: '#4a2d7a', icon: 'icon-depot' }),
  );
  container.add(
    createButton(scene, popupX, popupY + 52, 'Supply Run',
      () => callbacks.onSupplyRun(),
      { width: btnW, fontSize: '20px', bgColour: '#d46020', icon: 'icon-supply-run' }),
  );
  if (callbacks.onCharms) {
    container.add(
      createButton(scene, popupX, popupY + 114, 'Charms',
        () => callbacks.onCharms!(),
        { width: btnW, fontSize: '20px', bgColour: '#b88a37' }),
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
    fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
    color: '#ffffff', resolution: TEXT_RESOLUTION,
    wordWrap: { width: Math.min(width - 60, 360) },
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
