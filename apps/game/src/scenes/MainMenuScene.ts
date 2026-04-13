import Phaser from 'phaser';
import { COLOURS, FONTS } from '../ui/constants';
import { createButton, createTextButton } from '../ui/UIButton';
import { getSession, logout } from '../lib/auth';
import { AudioManager } from '../audio/AudioManager';
import { SPECIES_VARIANTS } from '@arc/game-logic';
import type { Species } from '@arc/shared-types';

/**
 * MainMenuScene — welcome screen with branding, pet previews,
 * game description and credits.
 *
 * Designed by Lily (age 8) 💜
 */
export class MainMenuScene extends Phaser.Scene {
  private petSprites: Phaser.GameObjects.Image[] = [];
  private petTweens: Phaser.Tweens.Tween[] = [];

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const session = getSession();

    // Start menu music
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('menu');

    // ── Warm background gradient effect ─────────────────────
    this.add.rectangle(width / 2, height / 2, width, height, 0xfef9ef);
    // Subtle top accent bar
    this.add.rectangle(width / 2, 0, width, 6, 0x4a9c5d).setOrigin(0.5, 0);

    // ── Logo ────────────────────────────────────────────────
    let logoBottom = 120;

    if (this.textures.exists('logo-full')) {
      const logo = this.add.image(width / 2, 80, 'logo-full').setOrigin(0.5);
      const maxW = width * 0.65;
      const maxH = 130;
      const scale = Math.min(maxW / logo.width, maxH / logo.height, 1);
      logo.setScale(scale);
      logoBottom = 80 + (logo.height * scale) / 2 + 10;
    } else {
      // Fallback text logo
      this.add.text(width / 2, 45, '🐾 A.R.C. 🐾', {
        fontSize: '52px', fontFamily: FONTS.title, color: COLOURS.primary,
      }).setOrigin(0.5);

      this.add.text(width / 2, 105, 'Animal Rescue Centre', {
        fontSize: '22px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5);

      logoBottom = 130;
    }

    // ── Tagline ─────────────────────────────────────────────
    this.add.text(width / 2, logoBottom, 'Rescue, care for and rehome animals in need! 🏠', {
      fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
      fontStyle: 'italic', align: 'center',
      wordWrap: { width: width - 60 },
    }).setOrigin(0.5);

    // ── Pet Preview Row ─────────────────────────────────────
    const previewY = logoBottom + 50;
    this.renderPetPreviews(width, previewY);

    // ── Game Description ────────────────────────────────────
    const descY = previewY + 65;
    const descLines = [
      'Feed hungry animals, play with them, take them on walks,',
      'cure them when they\'re sick, and find them forever homes!',
    ];
    descLines.forEach((line, i) => {
      this.add.text(width / 2, descY + i * 20, line, {
        fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.text,
        align: 'center',
      }).setOrigin(0.5);
    });

    // ── Action Buttons ──────────────────────────────────────
    const btnStart = descY + 60;

    if (session) {
      // Logged in
      this.add.text(width / 2, btnStart,
        `Welcome back, ${session.username}! ${session.avatarEmoji}`, {
        fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5);

      createButton(this, width / 2, btnStart + 45, '▶  Enter your centre', () => {
        this.scene.start('GameScene');
      }, { width: 300 });

      createButton(this, width / 2, btnStart + 105, '👥  Friends', () => {
        this.scene.start('FriendsScene');
      }, { width: 300, bgColour: COLOURS.textLight });

      // Friend code
      this.add.text(width / 2, btnStart + 155,
        `Your friend code: ${session.joinCode}`, {
        fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5);

      createTextButton(this, width / 2, btnStart + 185, 'Log out', () => {
        logout();
        this.scene.start('MainMenuScene');
      });
    } else {
      // Not logged in
      createButton(this, width / 2, btnStart + 10, '▶  Play', () => {
        this.scene.start('GameScene');
      }, { width: 260 });

      createTextButton(this, width / 2, btnStart + 60,
        'Create an account to save progress', () => {
        this.scene.start('SignupScene');
      });

      createTextButton(this, width / 2, btnStart + 82,
        'I already have an account', () => {
        this.scene.start('LoginScene');
      });
    }

    // ── Credits ─────────────────────────────────────────────
    this.add.text(width / 2, height - 42, 'Designed by Lily (age 8) 💜', {
      fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.primary,
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.add.text(width / 2, height - 22, 'Built with love by Dad 🛠️', {
      fontSize: '12px', fontFamily: FONTS.body, color: COLOURS.textLight,
    }).setOrigin(0.5);

    // ── Music Toggle ────────────────────────────────────────
    const musicOn = audio.isMusicOn();
    const musicBtn = this.add.text(width - 15, 15, musicOn ? '🔊' : '🔇', {
      fontSize: '24px',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    musicBtn.on('pointerdown', () => {
      audio.toggleMusic();
      musicBtn.setText(audio.isMusicOn() ? '🔊' : '🔇');
    });
  }

  /**
   * Render a row of animated pet preview sprites from loaded textures.
   * Shows one animal per species with a gentle idle bob animation.
   */
  private renderPetPreviews(sceneWidth: number, y: number): void {
    this.petSprites = [];
    this.petTweens = [];

    // Pick one showcase variant per species
    const showcaseSpecies: Species[] = ['cat', 'dog', 'bunny', 'fox', 'parrot', 'bat', 'snake'];
    const showcaseVariants: { species: Species; variant: string }[] = [];

    for (const sp of showcaseSpecies) {
      const variants = SPECIES_VARIANTS[sp];
      // Pick first variant that has a loaded texture
      let found = false;
      for (const v of variants) {
        const key = `${sp}-${v}-sheltered`;
        if (this.textures.exists(key)) {
          showcaseVariants.push({ species: sp, variant: v });
          found = true;
          break;
        }
      }
      if (!found) {
        // Try generic species texture
        const genericKey = `${sp}-sheltered`;
        if (this.textures.exists(genericKey)) {
          showcaseVariants.push({ species: sp, variant: '' });
        }
      }
    }

    if (showcaseVariants.length === 0) {
      // No textures loaded — show emoji fallback
      const emojis = ['🐱', '🐶', '🐰', '🦊', '🦜', '🦇', '🐍'];
      const spacing = Math.min(55, (sceneWidth - 60) / emojis.length);
      const startX = sceneWidth / 2 - ((emojis.length - 1) * spacing) / 2;
      emojis.forEach((emoji, i) => {
        const txt = this.add.text(startX + i * spacing, y, emoji, {
          fontSize: '36px',
        }).setOrigin(0.5);

        this.tweens.add({
          targets: txt,
          y: y - 5,
          duration: 800 + i * 100,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          delay: i * 120,
        });
      });
      return;
    }

    const count = showcaseVariants.length;
    const spacing = Math.min(65, (sceneWidth - 80) / count);
    const startX = sceneWidth / 2 - ((count - 1) * spacing) / 2;

    showcaseVariants.forEach(({ species, variant }, i) => {
      const textureKey = variant
        ? `${species}-${variant}-sheltered`
        : `${species}-sheltered`;

      const sprite = this.add.image(startX + i * spacing, y, textureKey)
        .setOrigin(0.5);

      // Scale to thumbnail size
      const targetSize = 48;
      const scale = Math.min(targetSize / sprite.width, targetSize / sprite.height, 1);
      sprite.setScale(scale);

      this.petSprites.push(sprite);

      // Gentle idle bob — staggered so they don't all move in sync
      const tween = this.tweens.add({
        targets: sprite,
        y: y - 6,
        duration: 900 + i * 80,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 150,
      });
      this.petTweens.push(tween);
    });
  }
}
