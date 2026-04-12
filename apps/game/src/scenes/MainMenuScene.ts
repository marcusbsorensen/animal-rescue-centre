import Phaser from 'phaser';
import { COLOURS, FONTS } from '../ui/constants';
import { createButton, createTextButton } from '../ui/UIButton';
import { getSession, logout } from '../lib/auth';
import { AudioManager } from '../audio/AudioManager';

export class MainMenuScene extends Phaser.Scene {
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

    // Logo image (with fallback to text)
    if (this.textures.exists('logo-full')) {
      const logo = this.add.image(width / 2, height / 4, 'logo-full')
        .setOrigin(0.5);
      // Scale to fit nicely
      const maxW = width * 0.6;
      const maxH = 150;
      const scale = Math.min(maxW / logo.width, maxH / logo.height, 1);
      logo.setScale(scale);
    } else {
      // Fallback text logo
      this.add.text(width / 2, height / 4, '🐾 A.R.C. 🐾', {
        fontSize: '64px', fontFamily: FONTS.title, color: COLOURS.primary,
      }).setOrigin(0.5);

      this.add.text(width / 2, height / 4 + 80, 'Animal Rescue Centre', {
        fontSize: '28px', fontFamily: FONTS.title, color: COLOURS.textLight,
      }).setOrigin(0.5);
    }

    if (session) {
      // Logged in — show user info and play button
      this.add.text(width / 2, height / 2 - 20,
        `Welcome back, ${session.username}! ${session.avatarEmoji}`, {
        fontSize: '22px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5);

      createButton(this, width / 2, height / 2 + 50, '▶  Enter your centre', () => {
        this.scene.start('GameScene');
      }, { width: 300 });

      createButton(this, width / 2, height / 2 + 120, '👥  Friends', () => {
        this.scene.start('FriendsScene');
      }, { width: 300, bgColour: COLOURS.textLight });

      createTextButton(this, width / 2, height - 60, 'Log out', () => {
        logout();
        this.scene.start('MainMenuScene');
      });

      // Show join code
      this.add.text(width / 2, height - 100,
        `Your friend code: ${session.joinCode}`, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5);
    } else {
      // Not logged in — show signup/login
      createButton(this, width / 2, height / 2 + 30, '▶  Play', () => {
        this.scene.start('GameScene');
      }, { width: 240 });

      createTextButton(this, width / 2, height / 2 + 80,
        'Create an account to save progress', () => {
        this.scene.start('SignupScene');
      });

      createTextButton(this, width / 2, height / 2 + 100,
        'I already have an account', () => {
        this.scene.start('LoginScene');
      });
    }
  }
}
