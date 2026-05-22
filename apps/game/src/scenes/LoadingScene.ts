import Phaser from 'phaser';
import { COLOURS, FONTS, TEXT_RESOLUTION } from '../ui/constants';
import { AssetLoader } from '../lib/AssetLoader';
import { createAmbientParticles } from '../ui/UIButton';

/**
 * LoadingScene — fun animated loading screen for kids.
 *
 * Shown when Play is tapped before background loading finishes.
 * Features bouncing animal emojis, a paw-print progress trail,
 * and playful rotating messages.
 */

const LOADING_MESSAGES = [
  'Filling the food bowls...',
  'Finding the squeaky toys...',
  'Fluffing the blankets...',
  'Calling the animals...',
  'Sweeping the corridors...',
  'Stocking the vet supplies...',
  'Tying little bows...',
  'Opening the doors...',
  'Hiding treats everywhere...',
  'Watering the garden...',
  'Following paw prints...',
  'Putting on gloves...',
];

// Emoji-only bounce animals. Previously these were text pills with
// species names — which reads as "broken" for a kid (they look like
// placeholders, not animals). Using emoji keeps the load screen
// playful and diagnostic-free even when the sprite assets haven't
// decoded yet.
const BOUNCE_ANIMALS = ['🐱', '🐶', '🐰', '🦊', '🦜', '🦇', '🐍'];

// If loading stalls for this long, we give the player a "Play anyway"
// escape hatch so they're never trapped on the loading screen. The
// game will lazy-load any missing textures on-demand at render time
// (sprites.ts falls back to coloured rectangles until the texture
// arrives), so playing early is safe.
const ESCAPE_HATCH_MS = 20_000;

export class LoadingScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;
  private messageText?: Phaser.GameObjects.Text;
  private progressText?: Phaser.GameObjects.Text;
  private escapeHatchBtn?: Phaser.GameObjects.Container;
  private escapeHatchTimer?: Phaser.Time.TimerEvent;
  private messageIndex = 0;
  private barFillGfx?: Phaser.GameObjects.Graphics;
  private barW = 300;
  private barH = 24;
  private barX = 0;
  private barY = 0;
  private lastProgressAt = 0;

  // IntroScene pre-picks which species/variant arrives first and passes
  // it through. LoadingScene is a pass-through stop on the way to
  // GameScene — it must forward this data, or the first arrival comes
  // out random instead of matching the one panel 4 of the intro teased.
  private preSelectedSpecies?: string;
  private preSelectedVariant?: string;

  constructor() {
    super({ key: 'LoadingScene' });
  }

  init(data?: { preSelectedSpecies?: string; preSelectedVariant?: string }): void {
    this.preSelectedSpecies = data?.preSelectedSpecies;
    this.preSelectedVariant = data?.preSelectedVariant;
  }

  /** Scene data forwarded to GameScene on every hand-off path. */
  private gameSceneData(): { preSelectedSpecies?: string; preSelectedVariant?: string } {
    return {
      preSelectedSpecies: this.preSelectedSpecies,
      preSelectedVariant: this.preSelectedVariant,
    };
  }

  create(): void {
    const { width, height } = this.scale;
    const loader = AssetLoader.getInstance();

    // If already loaded, skip straight to game
    if (loader.isFullyLoaded) {
      this.scene.start('GameScene', this.gameSceneData());
      return;
    }

    // ── Background ──────────────────────────────────────────
    this.add.rectangle(width / 2, height / 2, width, height, 0xfef9ef);

    // Warm center glow
    const glow = this.add.graphics();
    glow.fillStyle(0xffffff, 0.3);
    glow.fillCircle(width / 2, height / 2 - 30, 250);

    // Ambient particles
    createAmbientParticles(this, [], {
      count: 10,
      minAlpha: 0.06,
      maxAlpha: 0.14,
      speed: 0.5,
    });

    // ── Bouncing animals ────────────────────────────────────
    const animalY = height / 2 - 85;
    const spacing = Math.min(68, (width - 100) / BOUNCE_ANIMALS.length);
    const startX = width / 2 - ((BOUNCE_ANIMALS.length - 1) * spacing) / 2;

    BOUNCE_ANIMALS.forEach((emoji, i) => {
      // Emoji-sized text (no background pill, no padding — the emoji
      // itself is the visual). Large enough to be the hero of the
      // loading screen rather than a chip.
      const animal = this.add.text(startX + i * spacing, animalY, emoji, {
        fontSize: '44px', fontFamily: FONTS.body,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);

      // Staggered bounce
      this.tweens.add({
        targets: animal,
        y: animalY - 22,
        duration: 500 + i * 60,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeOut',
        delay: i * 120,
      });

      // Gentle wiggle
      this.tweens.add({
        targets: animal,
        angle: { from: -6, to: 6 },
        duration: 700 + i * 50,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 80,
      });
    });

    // ── Title ───────────────────────────────────────────────
    const title = this.add.text(width / 2, height / 2 - 18, 'Getting everything ready!', {
      fontSize: '22px',
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: COLOURS.primary,
    }).setOrigin(0.5);

    // Gentle pulse
    this.tweens.add({
      targets: title,
      scale: { from: 1, to: 1.03 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ── Progress bar (rounded, with paw prints) ─────────────
    this.barW = Math.min(300, width * 0.4);
    this.barH = 22;
    this.barX = width / 2;
    this.barY = height / 2 + 26;

    // Bar track (rounded)
    const trackGfx = this.add.graphics();
    trackGfx.fillStyle(0x000000, 0.06);
    trackGfx.fillRoundedRect(this.barX - this.barW / 2 + 2, this.barY - this.barH / 2 + 2, this.barW, this.barH, this.barH / 2);
    trackGfx.fillStyle(0xe8e0d4, 1);
    trackGfx.fillRoundedRect(this.barX - this.barW / 2, this.barY - this.barH / 2, this.barW, this.barH, this.barH / 2);

    // Fill bar (drawn dynamically)
    this.barFillGfx = this.add.graphics();
    this.drawBarFill(0);

    // Dots along the track
    const pawCount = 5;
    for (let i = 0; i < pawCount; i++) {
      const px = this.barX - this.barW / 2 + (this.barW / (pawCount - 1)) * i;
      this.add.circle(px, this.barY, 5, 0x5AAE4A, 0.2);
    }

    // ── Rotating fun messages ───────────────────────────────
    this.messageIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
    this.messageText = this.add.text(width / 2, this.barY + 35,
      LOADING_MESSAGES[this.messageIndex], {
      fontSize: '15px',
      fontFamily: FONTS.body,
      color: COLOURS.textLight,
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.time.addEvent({
      delay: 2500,
      loop: true,
      callback: () => this.cycleMessage(),
    });

    // ── Small visible percentage + last-progress marker ──────
    // Helps a worried parent (and future me) see at a glance whether
    // loading is actually progressing. If it stalls, the escape hatch
    // below kicks in.
    this.progressText = this.add.text(width / 2, this.barY + 60, '0%', {
      fontSize: '11px', fontFamily: FONTS.body, color: COLOURS.textLight,
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    this.lastProgressAt = Date.now();

    // ── Wire up progress ────────────────────────────────────
    loader.onProgress((pct) => {
      this.drawBarFill(pct);
      this.lastProgressAt = Date.now();
      if (this.progressText) this.progressText.setText(`${Math.round(pct * 100)}%`);
    });

    loader.onComplete(() => {
      this.drawBarFill(1);
      // Celebration flash, then fade out and start GameScene.
      // BUG HISTORY (2026-05-06): previously used
      //   `this.tweens.add({ targets: cameras.main, alpha: 0,
      //                      onComplete: scene.start })`
      // The tween's onComplete never fired in the brand-new-signup
      // flow (kid stuck on a blank loading screen after the intro).
      // Same root cause + same fix as MainMenuScene.startGame: own the
      // delay via the scene's timer (`time.delayedCall`) and use the
      // built-in `cameras.main.fadeOut` rather than a generic alpha
      // tween. The scene's timer is robust to whatever side-effects
      // (iframe unmount, audio context, asset loader) confuse the
      // tween manager during the handoff.
      this.time.delayedCall(300, () => {
        loader.clearCallbacks();
        this.escapeHatchTimer?.remove();
        this.cameras.main.fadeOut(300);
        this.time.delayedCall(320, () => {
          this.scene.start('GameScene', this.gameSceneData());
        });
      });
    });

    // Start/continue background loading
    loader.startBackgroundLoad(this);

    // ── Escape hatch ─────────────────────────────────────────
    // Reveal a "Play now" button once loading has stalled for a while.
    // Sprite fallback rectangles mean the game renders even without
    // full art — we're not risking anything by letting the player in
    // early, and it beats trapping them on the loading screen.
    this.escapeHatchTimer = this.time.delayedCall(ESCAPE_HATCH_MS, () => {
      // Only surface if we haven't already completed
      if (loader.isFullyLoaded) return;
      this.showEscapeHatch();
    });

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

    // Fade-in entrance
    this.cameras.main.fadeIn(300, 245, 235, 224);
  }

  private drawBarFill(pct: number): void {
    if (!this.barFillGfx) return;
    this.barFillGfx.clear();

    if (pct <= 0) return;

    const fillW = Math.max(this.barH, this.barW * pct); // min width = bar height for rounded end
    this.barFillGfx.fillStyle(0x5AAE4A, 1);
    this.barFillGfx.fillRoundedRect(
      this.barX - this.barW / 2,
      this.barY - this.barH / 2,
      fillW,
      this.barH,
      this.barH / 2
    );

    // Highlight on top of fill bar
    this.barFillGfx.fillStyle(0x7CC76E, 0.5);
    this.barFillGfx.fillRoundedRect(
      this.barX - this.barW / 2 + 2,
      this.barY - this.barH / 2 + 2,
      fillW - 4,
      this.barH * 0.4,
      { tl: this.barH / 2 - 2, tr: this.barH / 2 - 2, bl: 0, br: 0 }
    );
  }

  private cycleMessage(): void {
    if (!this.messageText) return;

    this.tweens.add({
      targets: this.messageText,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        this.messageIndex = (this.messageIndex + 1) % LOADING_MESSAGES.length;
        this.messageText!.setText(LOADING_MESSAGES[this.messageIndex]);
        this.tweens.add({
          targets: this.messageText,
          alpha: 1,
          duration: 200,
        });
      },
    });
  }

  /**
   * Reveal the "Play now" escape hatch after ESCAPE_HATCH_MS of
   * loading. Never takes focus unless things are genuinely slow.
   */
  private showEscapeHatch(): void {
    if (this.escapeHatchBtn) return;
    const { width, height } = this.scale;
    const cy = height - 60;

    const container = this.add.container(width / 2, cy);
    container.setAlpha(0);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.2);
    bg.fillRoundedRect(-110, -22, 220, 44, 22);
    bg.fillStyle(0xE67E22, 1);
    bg.fillRoundedRect(-108, -20, 216, 40, 20);
    container.add(bg);

    const label = this.add.text(0, 0, 'Play now →', {
      fontSize: '16px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: '#ffffff', resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    container.add(label);

    const hit = this.add.rectangle(0, 0, 220, 44, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      // Kill tweens + loader callbacks before leaving so they don't
      // run against a destroyed scene.
      AssetLoader.getInstance().clearCallbacks();
      // Same pattern + reasoning as the loader.onComplete path: the
      // built-in fadeOut + delayedCall fires reliably; the alpha tween
      // pattern would intermittently leave the kid on a black screen.
      this.cameras.main.fadeOut(250);
      this.time.delayedCall(270, () => {
        this.scene.start('GameScene', this.gameSceneData());
      });
    });
    container.add(hit);

    // Small "loading is slow" hint below
    const hint = this.add.text(0, 34, 'Assets will keep loading in the background', {
      fontSize: '11px', fontFamily: FONTS.body, color: COLOURS.textLight,
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    container.add(hint);

    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 300,
      ease: 'Back.easeOut',
    });
    this.escapeHatchBtn = container;
  }
}
