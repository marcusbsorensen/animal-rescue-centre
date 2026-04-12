import Phaser from 'phaser';
import { COLOURS, FONTS } from '../ui/constants';
import { createButton, createTextButton } from '../ui/UIButton';
import { getSession, logout } from '../lib/auth';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const session = getSession();

    // Title
    this.add
      .text(width / 2, height / 4, '🐾 A.R.C. 🐾', {
        fontSize: '64px',
        fontFamily: FONTS.title,
        color: COLOURS.primary,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 4 + 80, 'Animal Rescue Centre', {
        fontSize: '28px',
        fontFamily: FONTS.title,
        color: COLOURS.textLight,
      })
      .setOrigin(0.5);

    if (session) {
      // Logged in — show user info and play button
      this.add
        .text(width / 2, height / 2 - 20,
          `Welcome back, ${session.username}! ${session.avatarEmoji}`, {
          fontSize: '22px',
          fontFamily: FONTS.body,
          color: COLOURS.text,
        })
        .setOrigin(0.5);

      createButton(this, width / 2, height / 2 + 50, '▶  Enter your centre', () => {
        // Future: transition to game scene
        console.log('Entering game — coming in Phase 2');
      }, { width: 300 });

      createButton(this, width / 2, height / 2 + 120, '👥  Friends', () => {
        this.scene.start('FriendsScene');
      }, { width: 300, bgColour: COLOURS.textLight });

      createTextButton(this, width / 2, height - 60, 'Log out', () => {
        logout();
        this.scene.start('MainMenuScene');
      });

      // Show join code
      this.add
        .text(width / 2, height - 100,
          `Your friend code: ${session.joinCode}`, {
          fontSize: '16px',
          fontFamily: FONTS.body,
          color: COLOURS.textLight,
        })
        .setOrigin(0.5);
    } else {
      // Not logged in — show signup/login
      createButton(this, width / 2, height / 2 + 30, '▶  Play', () => {
        this.scene.start('SignupScene');
      }, { width: 240 });

      createTextButton(this, width / 2, height / 2 + 100,
        'I already have an account', () => {
        this.scene.start('LoginScene');
      });
    }
  }
}
