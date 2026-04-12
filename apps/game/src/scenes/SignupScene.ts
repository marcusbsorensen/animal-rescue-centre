import Phaser from 'phaser';
import { COLOURS, FONTS, AVATAR_EMOJIS, AVATAR_BG_COLOURS } from '../ui/constants';
import { createButton, createTextButton } from '../ui/UIButton';
import { getAvailableUsernames, signup } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';

type SignupStep = 'username' | 'avatar' | 'pin' | 'parent';

export class SignupScene extends Phaser.Scene {
  private step: SignupStep = 'username';
  private selectedUsername = '';
  private selectedEmoji = '';
  private selectedBgColour = '';
  private pin = '';
  private pinConfirm = '';
  private enteringConfirm = false;
  private usernameOptions: string[] = [];
  private container!: Phaser.GameObjects.Container;
  private errorText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'SignupScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.container = this.add.container(0, 0);

    this.errorText = this.add.text(width / 2, height - 40, '', {
      fontSize: '16px',
      fontFamily: FONTS.body,
      color: COLOURS.error,
    }).setOrigin(0.5);

    this.showUsernameStep();
  }

  private clearContainer(): void {
    this.container.removeAll(true);
    this.errorText.setText('');
  }

  private showError(msg: string): void {
    this.errorText.setText(msg);
  }

  // ── Step 1: Username Selection ─────────────────────────────────

  private async showUsernameStep(): Promise<void> {
    this.step = 'username';
    this.clearContainer();
    const { width, height } = this.scale;

    this.container.add(
      this.add.text(width / 2, 60, "Let's make your rescue centre!", {
        fontSize: '32px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, 110, 'Pick a name for yourself:', {
        fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // Show loading
    const loading = this.add.text(width / 2, height / 2, 'Finding names...', {
      fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.textLight,
    }).setOrigin(0.5);
    this.container.add(loading);

    try {
      if (!isSupabaseConfigured()) {
        // Demo mode — use placeholder names
        this.usernameOptions = ['BrambleFox', 'CloverPaws', 'MoonBunny'];
      } else {
        this.usernameOptions = await getAvailableUsernames(3);
      }
    } catch {
      this.usernameOptions = ['BrambleFox', 'CloverPaws', 'MoonBunny'];
    }

    loading.destroy();
    this.renderUsernameButtons();
  }

  private renderUsernameButtons(): void {
    const { width, height } = this.scale;
    const startY = 170;

    this.usernameOptions.forEach((name, i) => {
      const y = startY + i * 70;
      const btn = createButton(this, width / 2, y, name, () => {
        this.selectedUsername = name;
        this.showAvatarStep();
      }, { width: 300 });
      this.container.add(btn);
    });

    // "Show me different ones" link
    this.container.add(
      createTextButton(this, width / 2, startY + this.usernameOptions.length * 70 + 20,
        '🔄 Show me different ones', () => this.showUsernameStep())
    );

    // Back to login
    this.container.add(
      createTextButton(this, width / 2, height - 80,
        'I already have an account', () => this.scene.start('LoginScene'))
    );
  }

  // ── Step 2: Avatar ─────────────────────────────────────────────

  private showAvatarStep(): void {
    this.step = 'avatar';
    this.clearContainer();
    const { width } = this.scale;

    this.container.add(
      this.add.text(width / 2, 40, `Hi, ${this.selectedUsername}!`, {
        fontSize: '28px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, 80, 'Choose your animal avatar:', {
        fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // Emoji grid
    const cols = 10;
    const emojiSize = 48;
    const startX = width / 2 - (cols * emojiSize) / 2 + emojiSize / 2;
    const startY = 120;

    AVATAR_EMOJIS.forEach((emoji, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const emojiText = this.add.text(
        startX + col * emojiSize, startY + row * emojiSize, emoji, {
          fontSize: '32px',
        }
      ).setOrigin(0.5).setInteractive({ useHandCursor: true });

      emojiText.on('pointerdown', () => {
        this.selectedEmoji = emoji;
        this.highlightSelected(emojiText, 'emoji');
      });

      this.container.add(emojiText);
    });

    // Colour picker
    const colourStartY = startY + Math.ceil(AVATAR_EMOJIS.length / cols) * emojiSize + 30;
    this.container.add(
      this.add.text(width / 2, colourStartY, 'Pick a background colour:', {
        fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    const colourSize = 50;
    const colourStartX = width / 2 - (AVATAR_BG_COLOURS.length * colourSize) / 2 + colourSize / 2;

    AVATAR_BG_COLOURS.forEach((colour, i) => {
      const swatch = this.add.rectangle(
        colourStartX + i * colourSize, colourStartY + 50,
        40, 40,
        Phaser.Display.Color.HexStringToColor(colour).color
      ).setInteractive({ useHandCursor: true })
        .setStrokeStyle(2, 0x000000, 0.2);

      swatch.on('pointerdown', () => {
        this.selectedBgColour = colour;
        this.highlightSelected(swatch, 'colour');
      });

      this.container.add(swatch);
    });

    // Preview + Next button
    const nextY = colourStartY + 130;
    this.container.add(
      createButton(this, width / 2, nextY, 'Next →', () => {
        if (!this.selectedEmoji) { this.showError('Pick an animal!'); return; }
        if (!this.selectedBgColour) { this.showError('Pick a colour!'); return; }
        this.showPinStep();
      })
    );

    this.container.add(
      createTextButton(this, width / 2, nextY + 50, '← Back', () => this.showUsernameStep())
    );
  }

  private selectedEmojiHighlight?: Phaser.GameObjects.GameObject;
  private selectedColourHighlight?: Phaser.GameObjects.GameObject;

  private highlightSelected(obj: Phaser.GameObjects.GameObject, type: 'emoji' | 'colour'): void {
    if (type === 'emoji') {
      if (this.selectedEmojiHighlight && 'setAlpha' in this.selectedEmojiHighlight) {
        (this.selectedEmojiHighlight as Phaser.GameObjects.Text).setAlpha(1);
      }
      (obj as Phaser.GameObjects.Text).setAlpha(0.5);
      this.selectedEmojiHighlight = obj;
    } else {
      if (this.selectedColourHighlight && 'setStrokeStyle' in this.selectedColourHighlight) {
        (this.selectedColourHighlight as Phaser.GameObjects.Rectangle).setStrokeStyle(2, 0x000000, 0.2);
      }
      (obj as Phaser.GameObjects.Rectangle).setStrokeStyle(3, 0x000000, 1);
      this.selectedColourHighlight = obj;
    }
  }

  // ── Step 3: PIN ────────────────────────────────────────────────

  private showPinStep(): void {
    this.step = 'pin';
    this.pin = '';
    this.pinConfirm = '';
    this.enteringConfirm = false;
    this.clearContainer();
    const { width } = this.scale;

    this.container.add(
      this.add.text(width / 2, 60, 'Choose a secret PIN', {
        fontSize: '28px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, 100, 'Type 4 numbers to keep your account safe:', {
        fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // PIN display (dots)
    const pinDisplay = this.add.text(width / 2, 160, '○ ○ ○ ○', {
      fontSize: '40px', fontFamily: FONTS.body, color: COLOURS.text,
    }).setOrigin(0.5);
    this.container.add(pinDisplay);

    const statusText = this.add.text(width / 2, 210, '', {
      fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
    }).setOrigin(0.5);
    this.container.add(statusText);

    // Number pad
    const numPad = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['⌫', '0', '✓'],
    ];

    const padStartY = 260;
    const btnSize = 60;
    const gap = 10;

    numPad.forEach((row, ri) => {
      row.forEach((digit, ci) => {
        const x = width / 2 + (ci - 1) * (btnSize + gap);
        const y = padStartY + ri * (btnSize + gap);

        const bg = this.add.rectangle(x, y, btnSize, btnSize,
          Phaser.Display.Color.HexStringToColor(COLOURS.inputBg).color
        ).setInteractive({ useHandCursor: true })
          .setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(COLOURS.inputBorder).color);

        const label = this.add.text(x, y, digit, {
          fontSize: '28px', fontFamily: FONTS.body, color: COLOURS.text,
        }).setOrigin(0.5);

        bg.on('pointerdown', () => {
          if (digit === '⌫') {
            if (this.enteringConfirm) {
              this.pinConfirm = this.pinConfirm.slice(0, -1);
            } else {
              this.pin = this.pin.slice(0, -1);
            }
          } else if (digit === '✓') {
            this.handlePinSubmit();
          } else {
            if (this.enteringConfirm) {
              if (this.pinConfirm.length < 4) this.pinConfirm += digit;
            } else {
              if (this.pin.length < 4) this.pin += digit;
            }
          }
          this.updatePinDisplay(pinDisplay, statusText);
        });

        this.container.add(bg);
        this.container.add(label);
      });
    });

    this.container.add(
      createTextButton(this, width / 2, padStartY + 4 * (btnSize + gap) + 20,
        '← Back', () => this.showAvatarStep())
    );
  }

  private updatePinDisplay(display: Phaser.GameObjects.Text, status: Phaser.GameObjects.Text): void {
    const currentPin = this.enteringConfirm ? this.pinConfirm : this.pin;
    const dots = Array.from({ length: 4 }, (_, i) =>
      i < currentPin.length ? '●' : '○'
    ).join(' ');
    display.setText(dots);
    status.setText(this.enteringConfirm ? 'Type it again to confirm:' : '');
  }

  private handlePinSubmit(): void {
    if (!this.enteringConfirm) {
      if (this.pin.length !== 4) {
        this.showError('PIN must be 4 digits');
        return;
      }
      this.enteringConfirm = true;
      this.showPinStep(); // Refresh display for confirm step
      this.enteringConfirm = true; // re-set after clear
    } else {
      if (this.pinConfirm.length !== 4) {
        this.showError('Type all 4 digits again');
        return;
      }
      if (this.pin !== this.pinConfirm) {
        this.showError('PINs don\'t match — try again');
        this.pin = '';
        this.pinConfirm = '';
        this.enteringConfirm = false;
        this.showPinStep();
        return;
      }
      this.showParentStep();
    }
  }

  // ── Step 4: Parent Gate ────────────────────────────────────────

  private showParentStep(): void {
    this.step = 'parent';
    this.clearContainer();
    const { width, height } = this.scale;

    this.container.add(
      this.add.text(width / 2, 60, 'Almost there!', {
        fontSize: '28px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, 110, 'Ask a grown-up to read this:', {
        fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, 170,
        'We only use a parent email if you ever\nwant to delete this account.\nYou can skip this step.', {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
        align: 'center',
      }).setOrigin(0.5)
    );

    // Skip button (prominent — skipping is fine)
    this.container.add(
      createButton(this, width / 2, height / 2 + 20, 'Skip — start playing! 🎮', () => {
        this.doSignup();
      }, { width: 320 })
    );

    // "Enter email" option (secondary)
    this.container.add(
      createTextButton(this, width / 2, height / 2 + 80,
        'A grown-up wants to add their email →', () => {
        // For now, just proceed without email
        // Full email input UI would use DOM overlay — Phase 1 enhancement
        this.doSignup();
      })
    );

    this.container.add(
      createTextButton(this, width / 2, height - 80, '← Back', () => this.showPinStep())
    );
  }

  // ── Submit ─────────────────────────────────────────────────────

  private async doSignup(parentEmail?: string): Promise<void> {
    this.clearContainer();
    const { width, height } = this.scale;

    this.container.add(
      this.add.text(width / 2, height / 2, 'Creating your rescue centre...', {
        fontSize: '24px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    try {
      if (!isSupabaseConfigured()) {
        // Demo mode — skip actual signup
        console.log('Demo signup:', {
          username: this.selectedUsername,
          emoji: this.selectedEmoji,
          colour: this.selectedBgColour,
          pin: '****',
        });
        this.scene.start('MainMenuScene');
        return;
      }

      await signup({
        username: this.selectedUsername,
        pin: this.pin,
        avatarEmoji: this.selectedEmoji,
        avatarBgColour: this.selectedBgColour,
        parentEmailHash: parentEmail,
      });

      // Success — go to game
      this.scene.start('MainMenuScene');
    } catch (err) {
      this.showError(err instanceof Error ? err.message : 'Signup failed');
      this.showUsernameStep();
    }
  }
}
