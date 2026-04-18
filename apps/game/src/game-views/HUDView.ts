import Phaser from 'phaser';
import {
  getRequiredRescuesForLevel,
  getUrgentNeed,
  getMaxShelterAnimals,
} from '@arc/game-logic';
import { AudioManager } from '../audio/AudioManager';
import { COLOURS, FONTS, TEXT_RESOLUTION } from '../ui/constants';
import type { GameStateStore } from '../game-state';

/**
 * HUDView — the always-on top strip: level orb, XP bar, arrival /
 * needs-care alert badges, audio toggle, coin + shelter pills.
 *
 * Phase 6 extraction. The HUD is a pure function of the store plus a
 * couple of tap callbacks — no internal state, no animation besides
 * the two pulsing alert badges.
 */

export interface HUDCallbacks {
  /** Tap the green level orb — opens AccountScene (stats/badges). */
  onLevelOrbTap: () => void;
  /** Tap the red arrivals alert — jump to corridor. */
  onArrivalAlertTap: () => void;
  /** Tap the amber needs-care alert — jump to corridor. */
  onCareAlertTap: () => void;
  /** Tap the music-on/off orb — scene toggles audio + re-renders HUD. */
  onAudioToggle: () => void;
}

export function renderHUD(
  scene: Phaser.Scene,
  store: GameStateStore,
  uiContainer: Phaser.GameObjects.Container,
  callbacks: HUDCallbacks,
): void {
  uiContainer.removeAll(true);
  const { width } = scene.scale;
  const required = getRequiredRescuesForLevel(store.level);

  // "in care" is the live count of animals in the shelter or garden,
  // NOT the cumulative totalRescued counter. Kids read what they can
  // see in the rooms, so this matches.
  const welcomedCount = store.animals.filter(
    (a) => a.state === 'sheltered' || a.state === 'bonding' || a.state === 'pet',
  ).length;
  const arrivingCount = store.animals.filter((a) => a.state === 'arriving').length;
  const needsCareCount = store.animals.filter((a) => {
    if (a.state !== 'sheltered' && a.state !== 'bonding') return false;
    return getUrgentNeed(a) !== null || store.sickAnimals.has(a.id);
  }).length;
  const xpProgress = Math.min(store.totalRescued / required, 1);
  const shelteredCount = store.animals.filter(
    (a) => a.state === 'sheltered' || a.state === 'bonding',
  ).length;
  const maxShelter = getMaxShelterAnimals(store.level);

  // Constrain to 600px centred for large screens
  const maxW = Math.min(width, 600);
  const leftEdge = (width - maxW) / 2 + 10;
  const rightEdge = width - (width - maxW) / 2 - 10;
  const orbY = 30;
  const orbH = 44;

  // ── LEFT: Level orb with XP bar ───────────────────────────
  const leftOrbW = 170;
  const leftX = leftEdge;
  const leftGfx = scene.add.graphics();
  leftGfx.fillStyle(0x000000, 0.14);
  leftGfx.fillRoundedRect(leftX + 2, orbY - orbH / 2 + 3, leftOrbW, orbH, orbH / 2);
  leftGfx.fillStyle(0xffffff, 0.96);
  leftGfx.fillRoundedRect(leftX, orbY - orbH / 2, leftOrbW, orbH, orbH / 2);
  uiContainer.add(leftGfx);

  // Green level circle
  const lvlCx = leftX + orbH / 2;
  const lvlCircle = scene.add.graphics();
  lvlCircle.fillStyle(0x5AAE4A, 1);
  lvlCircle.fillCircle(lvlCx, orbY, orbH / 2 - 4);
  uiContainer.add(lvlCircle);
  uiContainer.add(
    scene.add.text(lvlCx, orbY, `${store.level}`, {
      fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: '#ffffff', resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5),
  );

  // "in care" label + XP bar
  const xpX = leftX + orbH + 2;
  const xpW = leftOrbW - orbH - 14;
  uiContainer.add(
    scene.add.text(xpX, orbY - 9, `${welcomedCount} in care`, {
      fontSize: '10px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0.5),
  );
  const xpBar = scene.add.graphics();
  xpBar.fillStyle(0xe6e2d8, 1);
  xpBar.fillRoundedRect(xpX, orbY + 3, xpW, 7, 3.5);
  if (xpProgress > 0) {
    xpBar.fillStyle(0x5AAE4A, 1);
    xpBar.fillRoundedRect(xpX, orbY + 3, Math.max(6, xpW * xpProgress), 7, 3.5);
  }
  uiContainer.add(xpBar);

  // Level orb tappable
  const orbHit = scene.add.circle(lvlCx, orbY, orbH / 2, 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  orbHit.on('pointerdown', () => callbacks.onLevelOrbTap());
  uiContainer.add(orbHit);

  // ── Red alert: animals waiting in the lobby ──────────────
  if (arrivingCount > 0) {
    drawAlertBadge(scene, uiContainer, {
      cx: leftX + leftOrbW + 14,
      cy: orbY,
      radius: 13,
      fillColour: 0xe74c3c,
      count: arrivingCount,
      pulseScale: 1.18,
      pulseDuration: 550,
      onTap: callbacks.onArrivalAlertTap,
    });
  }

  // ── Amber badge: animals in rooms that need attention ────
  // Shown right of the red alert (or where it would be if none). Lets
  // kids spot "someone needs me" without popping into every room.
  if (needsCareCount > 0) {
    drawAlertBadge(scene, uiContainer, {
      cx: leftX + leftOrbW + 14 + (arrivingCount > 0 ? 32 : 0),
      cy: orbY,
      radius: 13,
      fillColour: 0xe3b04b,
      count: needsCareCount,
      pulseScale: 1.14,
      pulseDuration: 700,
      onTap: callbacks.onCareAlertTap,
    });
  }

  // ── RIGHT SIDE: stack orbs from right edge leftward ─────
  let rx = rightEdge;
  const orbSize = 40;

  // Audio toggle orb (right-most)
  const audioState = AudioManager.getInstance().getState();
  const audioKey = audioState.musicEnabled ? 'icon-music-on' : 'icon-music-off';
  rx = drawIconOrb(scene, uiContainer, {
    iconKey: audioKey,
    fallback: audioState.musicEnabled ? 'ON' : 'OFF',
    cx: rx - orbSize / 2,
    cy: orbY,
    size: orbSize,
    onTap: callbacks.onAudioToggle,
  });

  // Coin pill (painterly hud-coins sign)
  if (store.economy.coins > 0) {
    const coinIcon = scene.textures.exists('hud-coins') ? 'hud-coins' : 'icon-hud-coins';
    rx = drawValuePill(scene, uiContainer, {
      value: `${store.economy.coins}`,
      iconKey: coinIcon,
      iconTint: 0xe3b04b,
      rightEdge: rx,
      cy: orbY,
      orbH,
    });
  }

  // Shelter pill (painterly hud-homes sign)
  if (shelteredCount > 0) {
    const homesIcon = scene.textures.exists('hud-homes') ? 'hud-homes' : 'icon-hud-homes';
    drawValuePill(scene, uiContainer, {
      value: `${shelteredCount}/${maxShelter}`,
      iconKey: homesIcon,
      iconTint: 0x8B6914,
      rightEdge: rx,
      cy: orbY,
      orbH,
    });
  }
}

// ── Helpers ────────────────────────────────────────────────

interface AlertBadgeOpts {
  cx: number; cy: number;
  radius: number;
  fillColour: number;
  count: number;
  pulseScale: number;
  pulseDuration: number;
  onTap: () => void;
}

function drawAlertBadge(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  opts: AlertBadgeOpts,
): void {
  const { cx, cy, radius, fillColour, count, pulseScale, pulseDuration, onTap } = opts;
  const gfx = scene.add.graphics();
  gfx.fillStyle(0x000000, 0.2);
  gfx.fillCircle(cx + 1, cy + 2, radius);
  gfx.fillStyle(fillColour, 1);
  gfx.fillCircle(cx, cy, radius);
  gfx.lineStyle(2, 0xffffff, 1);
  gfx.strokeCircle(cx, cy, radius);
  container.add(gfx);
  container.add(
    scene.add.text(cx, cy, `${count}`, {
      fontSize: '13px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: '#ffffff', resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5),
  );

  // Pulse so it draws the eye
  const pulseTarget = { s: 1 };
  scene.tweens.add({
    targets: pulseTarget,
    s: pulseScale,
    duration: pulseDuration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    onUpdate: () => {
      gfx.setScale(pulseTarget.s, pulseTarget.s);
      gfx.x = cx * (1 - pulseTarget.s);
      gfx.y = cy * (1 - pulseTarget.s);
    },
  });

  const hit = scene.add.circle(cx, cy, radius + 4, 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerdown', onTap);
  container.add(hit);
}

interface IconOrbOpts {
  iconKey: string; fallback: string;
  cx: number; cy: number; size: number;
  onTap: () => void;
}

/** Returns the next-available-rx after drawing. */
function drawIconOrb(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  opts: IconOrbOpts,
): number {
  const { iconKey, fallback, cx, cy, size, onTap } = opts;
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.14);
  shadow.fillCircle(cx + 2, cy + 3, size / 2);
  shadow.fillStyle(0xffffff, 0.96);
  shadow.fillCircle(cx, cy, size / 2);
  container.add(shadow);

  if (scene.textures.exists(iconKey)) {
    const img = scene.add.image(cx, cy, iconKey).setDisplaySize(28, 28).setOrigin(0.5);
    scene.textures.get(iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
    container.add(img);
  } else {
    container.add(
      scene.add.text(cx, cy, fallback, {
        fontSize: '11px', fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  }

  const hit = scene.add.circle(cx, cy, size / 2, 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerdown', onTap);
  container.add(hit);

  return cx - size / 2 - 6;  // next rx
}

interface ValuePillOpts {
  value: string; iconKey: string; iconTint: number;
  rightEdge: number; cy: number; orbH: number;
}

function drawValuePill(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  opts: ValuePillOpts,
): number {
  const { value, iconKey, iconTint, rightEdge, cy, orbH } = opts;
  const pillW = 70;
  const x0 = rightEdge - pillW;

  const gfx = scene.add.graphics();
  gfx.fillStyle(0x000000, 0.14);
  gfx.fillRoundedRect(x0 + 2, cy - orbH / 2 + 3, pillW, orbH, orbH / 2);
  gfx.fillStyle(0xffffff, 0.96);
  gfx.fillRoundedRect(x0, cy - orbH / 2, pillW, orbH, orbH / 2);
  container.add(gfx);

  const circ = scene.add.graphics();
  circ.fillStyle(iconTint, 1);
  circ.fillCircle(x0 + orbH / 2, cy, orbH / 2 - 5);
  container.add(circ);

  if (scene.textures.exists(iconKey)) {
    scene.textures.get(iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
    container.add(
      scene.add.image(x0 + orbH / 2, cy, iconKey).setDisplaySize(28, 28).setOrigin(0.5),
    );
  }

  container.add(
    scene.add.text(x0 + orbH + 2, cy, value, {
      fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0.5),
  );

  return x0 - 6;  // next rx
}
