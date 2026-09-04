import Phaser from 'phaser';
import { COLOURS, FONTS, TYPE, TITLE_CY, PAGE_MARGIN } from '../ui/constants';
import { createChromeButton, createTextButton, createAmbientParticles, createChromeTitle, createChromePlate } from '../ui/UIButton';
import { getSession } from '../lib/auth';
import { addFriendByCode, getFriends, type Friend } from '../lib/friends';
import { isSupabaseConfigured } from '../lib/supabase';

export class FriendsScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;
  private container!: Phaser.GameObjects.Container;
  private errorText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'FriendsScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.container = this.add.container(0, 0);
    this.errorText = this.add.text(width / 2, height - 40, '', {
      fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.error,
    }).setOrigin(0.5);

    // Fade-in transition
    this.cameras.main.fadeIn(300, 245, 235, 224);

    // Viewport resize handling
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      const w = gameSize.width;
      const h = gameSize.height;
      if (Math.abs(w - this._lastWidth) > 50 || Math.abs(h - this._lastHeight) > 50) {
        this._lastWidth = w;
        this._lastHeight = h;
        this.scene.restart();
      }
    });
    this._lastWidth = this.scale.width;
    this._lastHeight = this.scale.height;

    // Subtle ambient particles
    createAmbientParticles(this, [], {
      count: 8, minAlpha: 0.06, maxAlpha: 0.15, speed: 0.5,
    }).setDepth(-1);

    // Subtle heart outlines background pattern
    const bgPattern = this.add.graphics();
    bgPattern.lineStyle(1.2, 0xd4c8b8, 0.06);
    for (let hx = 40; hx < width; hx += 100) {
      for (let hy = 40; hy < height; hy += 100) {
        const ox = ((hy / 100) % 2) * 50;
        const x = hx + ox, y = hy;
        bgPattern.beginPath();
        bgPattern.arc(x - 5, y - 3, 6, Math.PI, 0, false);
        bgPattern.arc(x + 5, y - 3, 6, Math.PI, 0, false);
        bgPattern.lineTo(x, y + 10);
        bgPattern.closePath();
        bgPattern.strokePath();
      }
    }
    bgPattern.setDepth(-1);

    this.showFriendsList();
  }

  private clearContainer(): void {
    this.container.removeAll(true);
    this.errorText.setText('');
  }

  private async showFriendsList(): Promise<void> {
    this.clearContainer();
    const { width, height } = this.scale;
    const session = getSession();

    this.container.add(
      createChromeTitle(this, width / 2, TITLE_CY, 'Friends', {
        icon: 'icon-friends',
        iconSize: 24,
      })
    );

    // Show join code prominently
    if (session) {
      this.container.add(
        this.add.text(width / 2, 100,
          `Your friend code: ${session.joinCode}`, {
          fontSize: TYPE.lead, fontFamily: FONTS.body, color: COLOURS.primary,
          backgroundColor: COLOURS.inputBg,
          padding: { x: 16, y: 8 },
        }).setOrigin(0.5)
      );

      this.container.add(
        this.add.text(width / 2, 135,
          'Tell a friend this code so they can add you!', {
          fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );
    }

    // Add friend button
    this.container.add(
      createChromeButton(this, width / 2, 185, 'Add a friend', () => {
        this.showAddFriend();
      }, { width: 240, variant: 'filled' })
    );

    // Friends list
    let friends: Friend[] = [];
    try {
      if (isSupabaseConfigured()) {
        friends = await getFriends();
      }
    } catch {
      // silently fail
    }

    if (friends.length === 0) {
      this.container.add(
        this.add.text(width / 2, 280,
          'No friends yet!\nShare your code with someone to get started.', {
          fontSize: TYPE.body, fontFamily: FONTS.body, color: COLOURS.textLight,
          align: 'center',
        }).setOrigin(0.5)
      );
    } else {
      let y = 260;
      friends.forEach((friend) => {
        // Shadow card behind each friend row
        this.container.add(
          createChromePlate(this, width / 2, y, width - PAGE_MARGIN * 2, 44)
        );
        const row = this.add.text(width / 2, y,
          `${friend.avatarEmoji}  ${friend.username}`, {
          fontSize: TYPE.lead, fontFamily: FONTS.body, color: COLOURS.text,
          padding: { x: 16, y: 8 },
        }).setOrigin(0.5);
        this.container.add(row);
        y += 50;
      });
    }

    // Back button
    this.container.add(
      createTextButton(this, width / 2, height - 80,
        '← Back to menu', () => this.scene.start('MainMenuScene'))
    );
  }

  private showAddFriend(): void {
    this.clearContainer();
    const { width, height } = this.scale;

    this.container.add(
      this.add.text(width / 2, 60, 'Add a Friend', {
        fontSize: TYPE.title, fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, 110,
        'Type their friend code (like FOX-428):', {
        fontSize: TYPE.body, fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    let code = '';
    const codeDisplay = this.add.text(width / 2, 170, '___-___', {
      fontSize: '36px', fontFamily: FONTS.body, color: COLOURS.text,
      backgroundColor: COLOURS.inputBg,
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5);
    this.container.add(codeDisplay);

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Backspace') {
        code = code.slice(0, -1);
        // Remove dash if we just deleted past it
        if (code.length === 3 && code.endsWith('-')) {
          code = code.slice(0, -1);
        }
      } else if (event.key === 'Enter' && code.length >= 6) {
        this.doAddFriend(code);
      } else if (/^[a-zA-Z]$/.test(event.key) && code.replace('-', '').length < 6) {
        if (code.length === 3 && !code.includes('-')) {
          code += '-';
        }
        code += event.key.toUpperCase();
      } else if (/^\d$/.test(event.key) && code.replace('-', '').length < 6) {
        if (code.length === 3 && !code.includes('-')) {
          code += '-';
        }
        code += event.key;
      }
      codeDisplay.setText(code || '___-___');
    });

    this.container.add(
      createChromeButton(this, width / 2, 250, 'Add Friend', () => {
        if (code.length >= 6) this.doAddFriend(code);
        else this.errorText.setText('Enter the full code');
      }, { variant: 'filled' })
    );

    this.container.add(
      createTextButton(this, width / 2, height - 80,
        '← Back', () => this.showFriendsList())
    );
  }

  private async doAddFriend(code: string): Promise<void> {
    try {
      if (!isSupabaseConfigured()) {
        console.log('Demo add friend:', code);
        this.showFriendsList();
        return;
      }
      await addFriendByCode(code);
      this.showFriendsList();
    } catch (err) {
      this.errorText.setText(err instanceof Error ? err.message : 'Failed to add friend');
    }
  }
}
