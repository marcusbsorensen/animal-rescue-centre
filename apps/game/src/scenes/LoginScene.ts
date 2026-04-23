import Phaser from 'phaser';
import { COLOURS, FONTS } from '../ui/constants';
import { createButton, createTextButton, createPanel, createPillTitle, createAmbientParticles } from '../ui/UIButton';
import { getRememberedUsernames, login, searchUsername } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { mountAuth, unmountAuth } from '../auth-overlay/AuthOverlay';

export class LoginScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;
  private selectedUsername = '';
  private pin = '';
  private container!: Phaser.GameObjects.Container;
  private errorText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'LoginScene' });
  }

  create(): void {
    // HTML overlay — mounts the painted-sign login mockup over Phaser. The
    // Phaser fallback path below still exists for when we wire real auth.
    const USE_OVERLAY = true as boolean;
    if (USE_OVERLAY) {
      const unmount = mountAuth('login', {
        onAction: (action) => {
          if (action === 'back-to-welcome')       { unmount(); this.scene.start('MainMenuScene'); return; }
          if (action === 'signup')                { unmount(); this.scene.start('SignupScene'); return; }
          if (action === 'auth-success-existing') {
            unmount();
            // Existing players land straight in the game.
            this.scene.start('MainMenuScene');
            return;
          }
        },
      });
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
      fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.error,
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

    this.showUsernameSelect();
  }

  private clearContainer(): void {
    this.container.removeAll(true);
    this.errorText.setText('');
  }

  private showError(msg: string): void {
    this.errorText.setText(msg);
  }

  // ── Step 1: Select username ──────────────────────────────────

  private showUsernameSelect(): void {
    this.clearContainer();
    const { width, height } = this.scale;

    this.container.add(
      createPillTitle(this, width / 2, 60, 'Welcome back!', {
        bgColour: 0x5AAE4A, fontSize: '28px',
      })
    );

    this.container.add(
      this.add.text(width / 2, 110, 'What\'s your username?', {
        fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // Show remembered usernames from this device
    const remembered = getRememberedUsernames();

    if (remembered.length > 0) {
      let y = 170;
      remembered.forEach((name) => {
        this.container.add(
          createButton(this, width / 2, y, name, () => {
            this.selectedUsername = name;
            this.showPinEntry();
          }, { width: 280 })
        );
        y += 60;
      });

      this.container.add(
        createTextButton(this, width / 2, y + 10,
          'I\'m on a new device', () => this.showUsernameSearch())
      );
    } else {
      // No remembered usernames — go straight to search
      this.showUsernameSearch();
      return;
    }

    this.container.add(
      createTextButton(this, width / 2, height - 80,
        'I\'m new — create an account', () => this.scene.start('SignupScene'))
    );
  }

  // ── Username search (new device) ─────────────────────────────

  private showUsernameSearch(): void {
    this.clearContainer();
    const { width, height } = this.scale;

    this.container.add(
      createPillTitle(this, width / 2, 60, 'Find your username', {
        bgColour: 0x5AAE4A, fontSize: '24px',
      })
    );

    this.container.add(
      this.add.text(width / 2, 110, 'Type the first few letters:', {
        fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // Simple text input simulation using keyboard events
    let query = '';
    const queryDisplay = this.add.text(width / 2, 160, '|', {
      fontSize: '28px', fontFamily: FONTS.body, color: COLOURS.text,
      backgroundColor: COLOURS.inputBg,
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5);
    this.container.add(queryDisplay);

    const resultsContainer = this.add.container(0, 0);
    this.container.add(resultsContainer);

    // Listen for keyboard input
    this.input.keyboard?.on('keydown', async (event: KeyboardEvent) => {
      if (event.key === 'Backspace') {
        query = query.slice(0, -1);
      } else if (event.key.length === 1 && /[a-zA-Z]/.test(event.key)) {
        query += event.key;
      }
      queryDisplay.setText(query.length > 0 ? query : '|');

      // Search when we have 2+ chars
      if (query.length >= 2) {
        resultsContainer.removeAll(true);
        try {
          let results: string[];
          if (!isSupabaseConfigured()) {
            // Demo mode
            results = ['BrambleFox', 'CloverPaws', 'MoonBunny']
              .filter((n) => n.toLowerCase().includes(query.toLowerCase()));
          } else {
            results = await searchUsername(query);
          }
          results.forEach((name, i) => {
            resultsContainer.add(
              createButton(this, width / 2, 220 + i * 55, name, () => {
                this.selectedUsername = name;
                this.showPinEntry();
              }, { width: 280, fontSize: '20px' })
            );
          });
        } catch {
          // silently fail on search errors
        }
      }
    });

    this.container.add(
      createTextButton(this, width / 2, height - 80,
        '← Back', () => this.showUsernameSelect())
    );

    this.container.add(
      createTextButton(this, width / 2, height - 120,
        'I\'m new — create an account', () => this.scene.start('SignupScene'))
    );
  }

  // ── Step 2: PIN entry ────────────────────────────────────────

  private showPinEntry(): void {
    this.pin = '';
    this.clearContainer();
    const { width } = this.scale;

    this.container.add(
      createPillTitle(this, width / 2, 60, `Hi, ${this.selectedUsername}!`, {
        bgColour: 0x5AAE4A, fontSize: '24px',
      })
    );

    this.container.add(
      this.add.text(width / 2, 110, 'Enter your PIN:', {
        fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // PIN dots panel
    this.container.add(
      createPanel(this, width / 2, 170, 220, 60, {
        fillColour: 0xf5efe4, fillAlpha: 1, radius: 12,
        borderColour: 0xd4c8b8, borderWidth: 2,
      })
    );

    const pinDisplay = this.add.text(width / 2, 170, '○ ○ ○ ○', {
      fontSize: '40px', fontFamily: FONTS.body, color: COLOURS.text,
    }).setOrigin(0.5);
    this.container.add(pinDisplay);

    // Number pad
    const numPad = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['⌫', '0', '✓'],
    ];

    const padStartY = 240;
    const btnSize = 60;
    const gap = 10;

    const handleInput = (digit: string) => {
      if (digit === '⌫') {
        this.pin = this.pin.slice(0, -1);
      } else if (digit === '✓') {
        this.doLogin();
        return;
      } else if (this.pin.length < 4) {
        this.pin += digit;
      }
      const dots = Array.from({ length: 4 }, (_, i) =>
        i < this.pin.length ? '●' : '○'
      ).join(' ');
      pinDisplay.setText(dots);
    };

    numPad.forEach((row, ri) => {
      row.forEach((digit, ci) => {
        const x = width / 2 + (ci - 1) * (btnSize + gap);
        const y = padStartY + ri * (btnSize + gap);

        const isAction = digit === '✓' || digit === '⌫';
        const bgColour = digit === '✓' ? COLOURS.primary
          : digit === '⌫' ? COLOURS.warm : '#f5efe4';
        const btn = createButton(this, x, y, digit, () => handleInput(digit), {
          width: btnSize, height: btnSize, radius: 12,
          bgColour,
          fontSize: isAction ? '24px' : '28px',
        });
        this.container.add(btn);
      });
    });

    // Keyboard input: number keys + Backspace + Enter
    const keyHandler = (event: KeyboardEvent) => {
      if (/^[0-9]$/.test(event.key)) {
        handleInput(event.key);
      } else if (event.key === 'Backspace') {
        handleInput('⌫');
      } else if (event.key === 'Enter') {
        handleInput('✓');
      }
    };
    this.input.keyboard?.on('keydown', keyHandler);

    this.container.add(
      createTextButton(this, width / 2, padStartY + 4 * (btnSize + gap) + 20,
        '← Not me', () => {
          this.input.keyboard?.off('keydown', keyHandler);
          this.showUsernameSelect();
        })
    );
  }

  // ── Submit ───────────────────────────────────────────────────

  private async doLogin(): Promise<void> {
    if (this.pin.length !== 4) {
      this.showError('Enter all 4 digits');
      return;
    }

    this.clearContainer();
    const { width, height } = this.scale;

    this.container.add(
      this.add.text(width / 2, height / 2, 'Logging in...', {
        fontSize: '24px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    try {
      if (!isSupabaseConfigured()) {
        console.log('Demo login:', this.selectedUsername);
        this.scene.start('MainMenuScene');
        return;
      }

      await login({ username: this.selectedUsername, pin: this.pin });
      this.scene.start('MainMenuScene');
    } catch (err) {
      this.showError(err instanceof Error ? err.message : 'Login failed');
      this.showPinEntry();
    }
  }
}
