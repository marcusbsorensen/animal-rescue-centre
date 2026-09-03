import Phaser from 'phaser';
import type { Species } from '@arc/shared-types';
import { AudioManager } from '../audio/AudioManager';
import { BADGE_DEFINITIONS } from '@arc/badges';
import { COLOURS, FONTS, TEXT_RESOLUTION, TYPE } from '../ui/constants';

/**
 * CelebrationViews — stateless overlay animations for badge unlocks
 * and level-ups.
 *
 * Extracted from GameScene as phase 4 of the refactor plan. These
 * views take no game state (the data they need is passed as args)
 * and make no mutations — purely visual payoff moments.
 *
 * Both auto-dismiss; level-up is also tap-to-dismiss-early.
 */

/** Slide-in toast at the top of the screen for a newly-earned badge. */
export function showBadgeNotification(scene: Phaser.Scene, badgeCode: string): void {
  const { width } = scene.scale;
  AudioManager.getInstance().playSfx('badge_earned');

  // Look up the real badge definition — the stored list uses `code` as
  // the stable identifier but the player should see the friendly name
  // and description, not the raw variable id.
  const def = BADGE_DEFINITIONS.find((b) => b.code === badgeCode);
  const title = def ? def.name : badgeCode;
  const subtitle = def ? def.description : 'Nice work!';

  const toast = scene.add.container(width / 2, -80);
  toast.setDepth(200);

  const cardW = Math.min(360, width - 40);
  const cardH = 92;

  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.22);
  shadow.fillRoundedRect(-cardW / 2 + 3, -cardH / 2 + 4, cardW, cardH, 18);
  toast.add(shadow);

  const bg = scene.add.graphics();
  bg.fillStyle(0xfff4d6, 1);
  bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
  bg.lineStyle(3, 0xe3b04b, 1);
  bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 18);
  toast.add(bg);

  // Medal/rosette icon on the left — use painterly badge art if we
  // happen to have it loaded, otherwise a gold disc with a star.
  const iconX = -cardW / 2 + 38;
  const iconKey = `badge-${badgeCode}`;
  if (scene.textures.exists(iconKey)) {
    toast.add(scene.add.image(iconX, 0, iconKey).setDisplaySize(52, 52));
  } else if (scene.textures.exists('icon-badge')) {
    toast.add(scene.add.image(iconX, 0, 'icon-badge').setDisplaySize(52, 52));
  } else {
    const medal = scene.add.graphics();
    medal.fillStyle(0xf1c40f, 1);
    medal.fillCircle(iconX, 0, 22);
    medal.lineStyle(3, 0xffffff, 1);
    medal.strokeCircle(iconX, 0, 22);
    toast.add(medal);
    toast.add(
      scene.add.text(iconX, 0, '\u2605', {
        fontSize: '26px', fontFamily: FONTS.title, color: '#ffffff',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  }

  // Text block
  const textX = iconX + 36;
  toast.add(
    scene.add.text(textX, -14, 'New badge!', {
      fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold',
      color: '#b88213', resolution: TEXT_RESOLUTION,
    }),
  );
  toast.add(
    scene.add.text(textX, -2, title, {
      fontSize: TYPE.body, fontFamily: FONTS.title, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }),
  );
  toast.add(
    scene.add.text(textX, 22, subtitle, {
      fontSize: TYPE.caption, fontFamily: FONTS.body,
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
      wordWrap: { width: cardW - (textX + cardW / 2 + 14) },
    }),
  );

  scene.tweens.add({
    targets: toast,
    y: 70,
    duration: 500,
    ease: 'Back.easeOut',
    hold: 2800,
    yoyo: true,
    onComplete: () => toast.destroy(),
  });
}

/** Full-screen level-up celebration with sparkles, pulsing title,
 *  auto-dismiss after 3s or tap to dismiss early. */
export function showLevelUpCelebration(
  scene: Phaser.Scene,
  newLevel: number,
  unlockedSpecies: Species[],
): void {
  const { width, height } = scene.scale;

  AudioManager.getInstance().playSfx('upgrade_unlock');

  const container = scene.add.container(0, 0).setDepth(1000);

  // Semi-transparent overlay
  const overlay = scene.add
    .rectangle(width / 2, height / 2, width, height, 0x000000, 0.55)
    .setInteractive();
  container.add(overlay);

  // Main title
  const title = scene.add.text(width / 2, height / 2 - 60, 'Level Up!', {
    fontSize: TYPE.display, fontFamily: FONTS.title, color: '#ffd700',
  }).setOrigin(0.5);
  container.add(title);

  // Level number
  const levelText = scene.add.text(width / 2, height / 2 - 20, `Level ${newLevel}`, {
    fontSize: TYPE.heading, fontFamily: FONTS.body, color: COLOURS.white,
  }).setOrigin(0.5);
  container.add(levelText);

  // Unlocked species list
  if (unlockedSpecies.length > 0) {
    const lines = unlockedSpecies.map(
      (s) => `${s.charAt(0).toUpperCase() + s.slice(1)} unlocked!`,
    );
    const unlockText = scene.add.text(width / 2, height / 2 + 25, lines.join('\n'), {
      fontSize: TYPE.lead, fontFamily: FONTS.body, color: '#2ecc71',
      align: 'center',
    }).setOrigin(0.5);
    container.add(unlockText);
  }

  // Tap to dismiss hint
  const hint = scene.add.text(width / 2, height / 2 + 90, 'Tap to continue', {
    fontSize: TYPE.caption, fontFamily: FONTS.body, color: '#aaa',
  }).setOrigin(0.5);
  container.add(hint);

  // Animated sparkles
  const sparkleColours = [0xffd700, 0xffec8b, 0xffa500, 0xfffacd];
  const sparkles: Phaser.GameObjects.Arc[] = [];
  for (let i = 0; i < 12; i += 1) {
    const sx = Phaser.Math.Between(40, width - 40);
    const sy = Phaser.Math.Between(40, height - 40);
    const r = Phaser.Math.Between(4, 10);
    const sparkle = scene.add.circle(
      sx, sy, r,
      sparkleColours[Phaser.Math.Between(0, sparkleColours.length - 1)],
    ).setAlpha(0);
    container.add(sparkle);
    sparkles.push(sparkle);

    scene.tweens.add({
      targets: sparkle,
      alpha: { from: 0, to: 1 },
      y: sy - Phaser.Math.Between(20, 50),
      duration: 800,
      delay: Phaser.Math.Between(0, 600),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // Title pulse
  scene.tweens.add({
    targets: title,
    scaleX: 1.1,
    scaleY: 1.1,
    duration: 500,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  const dismiss = () => {
    scene.tweens.killTweensOf(title);
    sparkles.forEach((s) => scene.tweens.killTweensOf(s));
    container.destroy(true);
  };

  // Auto-dismiss after 3 seconds
  const timer = scene.time.delayedCall(3000, dismiss);

  // Tap to dismiss early
  overlay.on('pointerdown', () => {
    timer.destroy();
    dismiss();
  });
}
