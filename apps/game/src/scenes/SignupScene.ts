import Phaser from 'phaser';
import { COLOURS, FONTS, AVATAR_EMOJIS, AVATAR_BG_COLOURS } from '../ui/constants';
import { createChromeButton, createTextButton, createPanel, createChromeTitle, createAmbientParticles } from '../ui/UIButton';
import { getAvailableUsernames, signup } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { mountAuth, unmountAuth } from '../auth-overlay/AuthOverlay';

type SignupStep = 'username' | 'avatar' | 'pin' | 'parent';

export class SignupScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;
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

  /** Optional context from the previous scene — used to pass through
   *  reasons like "not-in-chips" when the kid arrives here from the
   *  login screen's "Not here? Type your name" plank, so the signup
   *  iframe can show a contextual greeting. */
  private initData: { reason?: string } = {};

  constructor() {
    super({ key: 'SignupScene' });
  }

  init(data?: { reason?: string }): void {
    this.initData = data ?? {};
  }

  create(): void {
    const USE_OVERLAY = true as boolean;
    if (USE_OVERLAY) {
      // Signup → straight to MainMenuScene. The old orientation screen
      // (welcome-new.html) was redundant per Marcus 2026-05-02 — kid
      // already saw the painted scene during signup, doesn't need a
      // second "Welcome, X!" screen with a stale building picture.
      const unmount = mountAuth('signup', {
        onAction: (action, _session) => {
          if (action === 'back-to-welcome') { unmount(); this.scene.start('MainMenuScene'); return; }
          if (action === 'login')           { unmount(); this.scene.start('LoginScene'); return; }
          if (action === 'auth-success-new') {
            unmount();
            this.scene.start('MainMenuScene');
            return;
          }
        },
      }, { reason: this.initData.reason });
      this.events.once('shutdown', unmountAuth);
      this.events.once('destroy', unmountAuth);
      return;
    }

    const { width, height } = this.scale;

    // Background fill
    this.add.rectangle(width / 2, height / 2, width, height,
      Phaser.Display.Color.HexStringToColor(COLOURS.bgDark).color);

    // Ambient particles behind everything
    createAmbientParticles(this, [], {
      count: 10, minAlpha: 0.06, maxAlpha: 0.15,
    });

    // Central card panel
    createPanel(this, width / 2, height / 2, width - 40, height - 40, {
      fillColour: 0xffffff, fillAlpha: 0.92, radius: 20,
    });

    this.container = this.add.container(0, 0);

    this.errorText = this.add.text(width / 2, height - 40, '', {
      fontSize: '16px',
      fontFamily: FONTS.body,
      color: COLOURS.error,
    }).setOrigin(0.5);

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

    // Fade-in transition
    this.cameras.main.fadeIn(300, 245, 235, 224);

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
      createChromeTitle(this, width / 2, 60, "Let's make your rescue centre!", { fontSize: '24px' })
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
      const btn = createChromeButton(this, width / 2, y, name, () => {
        this.selectedUsername = name;
        this.showAvatarStep();
      }, { width: 300 });
      this.container.add(btn);
    });

    // "Show me different ones" link
    this.container.add(
      createTextButton(this, width / 2, startY + this.usernameOptions.length * 70 + 20,
        'Show me different ones', () => this.showUsernameStep())
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
      createChromeTitle(this, width / 2, 40, `Hi, ${this.selectedUsername}!`, { fontSize: '22px' })
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

    // Panel behind emoji grid
    const emojiRows = Math.ceil(AVATAR_EMOJIS.length / cols);
    this.container.add(
      createPanel(this, width / 2, startY + (emojiRows * emojiSize) / 2 - emojiSize / 2,
        cols * emojiSize + 20, emojiRows * emojiSize + 16, {
        fillColour: 0xf5efe4, fillAlpha: 0.6, radius: 12,
        borderColour: 0xd4c8b8, borderWidth: 1,
      })
    );

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

    // Panel behind colour swatches
    this.container.add(
      createPanel(this, width / 2, colourStartY + 50,
        AVATAR_BG_COLOURS.length * colourSize + 20, 60, {
        fillColour: 0xf5efe4, fillAlpha: 0.6, radius: 12,
        borderColour: 0xd4c8b8, borderWidth: 1,
      })
    );

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
      createChromeButton(this, width / 2, nextY, 'Next →', () => {
        if (!this.selectedEmoji) { this.showError('Pick an animal!'); return; }
        if (!this.selectedBgColour) { this.showError('Pick a colour!'); return; }
        this.showPinStep();
      }, { variant: 'filled' })
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

  private pinDisplay!: Phaser.GameObjects.Text;
  private pinStatusText!: Phaser.GameObjects.Text;
  private pinTitleText!: Phaser.GameObjects.Text;
  private keyboardListener?: (event: KeyboardEvent) => void;

  private showPinStep(confirmMode = false): void {
    this.step = 'pin';
    if (!confirmMode) {
      this.pin = '';
      this.pinConfirm = '';
      this.enteringConfirm = false;
    } else {
      this.pinConfirm = '';
      this.enteringConfirm = true;
    }
    this.clearContainer();

    // Remove any previous keyboard listener
    if (this.keyboardListener) {
      this.input.keyboard?.off('keydown', this.keyboardListener);
    }

    const { width } = this.scale;

    const pinTitleContainer = createChromeTitle(this, width / 2, 60,
      confirmMode ? 'Confirm your PIN' : 'Choose a secret PIN', {
      fontSize: '22px',
    });
    this.pinTitleText = pinTitleContainer.list.find(
      (obj): obj is Phaser.GameObjects.Text => obj instanceof Phaser.GameObjects.Text
    )!;
    this.container.add(pinTitleContainer);

    this.container.add(
      this.add.text(width / 2, 100,
        confirmMode ? 'Type the same 4 numbers again:' : 'Type 4 numbers to keep your account safe:', {
        fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // PIN dots panel
    this.container.add(
      createPanel(this, width / 2, 160, 220, 60, {
        fillColour: 0xf5efe4, fillAlpha: 1, radius: 12,
        borderColour: 0xd4c8b8, borderWidth: 2,
      })
    );

    // PIN display (dots)
    this.pinDisplay = this.add.text(width / 2, 160, '○ ○ ○ ○', {
      fontSize: '40px', fontFamily: FONTS.body, color: COLOURS.text,
    }).setOrigin(0.5);
    this.container.add(this.pinDisplay);

    this.pinStatusText = this.add.text(width / 2, 210, '', {
      fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
    }).setOrigin(0.5);
    this.container.add(this.pinStatusText);

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

        // Same keypad as LoginScene, same reasoning — see the comment
        // there. White type on '#f5efe4' measured 1.06:1.
        const btn = createChromeButton(this, x, y, digit, () => this.handlePinInput(digit), {
          width: btnSize, height: btnSize, radius: 12,
          variant: digit === '✓' ? 'filled' : 'plate',
          tone: digit === '⌫' ? 'danger' : 'default',
          fontSize: (digit === '✓' || digit === '⌫') ? '24px' : '28px',
        });
        this.container.add(btn);
      });
    });

    // Keyboard input: number keys + Backspace + Enter
    this.keyboardListener = (event: KeyboardEvent) => {
      if (this.step !== 'pin') return;
      if (/^[0-9]$/.test(event.key)) {
        this.handlePinInput(event.key);
      } else if (event.key === 'Backspace') {
        this.handlePinInput('⌫');
      } else if (event.key === 'Enter') {
        this.handlePinInput('✓');
      }
    };
    this.input.keyboard?.on('keydown', this.keyboardListener);

    this.container.add(
      createTextButton(this, width / 2, padStartY + 4 * (btnSize + gap) + 20,
        '← Back', () => {
          if (this.keyboardListener) this.input.keyboard?.off('keydown', this.keyboardListener);
          this.showAvatarStep();
        })
    );
  }

  private handlePinInput(digit: string): void {
    if (digit === '⌫') {
      if (this.enteringConfirm) {
        this.pinConfirm = this.pinConfirm.slice(0, -1);
      } else {
        this.pin = this.pin.slice(0, -1);
      }
    } else if (digit === '✓') {
      this.handlePinSubmit();
      return;
    } else {
      if (this.enteringConfirm) {
        if (this.pinConfirm.length < 4) this.pinConfirm += digit;
      } else {
        if (this.pin.length < 4) this.pin += digit;
      }
    }
    this.refreshPinDots();
  }

  private refreshPinDots(): void {
    const currentPin = this.enteringConfirm ? this.pinConfirm : this.pin;
    const dots = Array.from({ length: 4 }, (_, i) =>
      i < currentPin.length ? '●' : '○'
    ).join(' ');
    this.pinDisplay.setText(dots);
  }

  private handlePinSubmit(): void {
    if (!this.enteringConfirm) {
      if (this.pin.length !== 4) {
        this.showError('PIN must be 4 digits');
        return;
      }
      // Move to confirm mode — keep this.pin intact, re-render for confirm
      this.showPinStep(true);
    } else {
      if (this.pinConfirm.length !== 4) {
        this.showError('Type all 4 digits again');
        return;
      }
      if (this.pin !== this.pinConfirm) {
        this.showError('PINs don\'t match — try again');
        this.showPinStep(false);
        return;
      }
      // PINs match — proceed
      if (this.keyboardListener) this.input.keyboard?.off('keydown', this.keyboardListener);
      this.showParentStep();
    }
  }

  // ── Step 4: Parent Gate ────────────────────────────────────────

  private showParentStep(): void {
    this.step = 'parent';
    this.clearContainer();
    const { width, height } = this.scale;

    this.container.add(
      createChromeTitle(this, width / 2, 60, 'Almost there!', { fontSize: '24px' })
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
      createChromeButton(this, width / 2, height / 2 + 20, 'Skip — start playing!', () => {
        this.doSignup();
      }, { width: 320, variant: 'filled' })
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
