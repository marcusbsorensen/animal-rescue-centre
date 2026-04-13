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

const BOUNCE_ANIMALS = ['cat', 'dog', 'bunny', 'fox', 'parrot', 'bat', 'snake'];

export class LoadingScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;
  private messageText?: Phaser.GameObjects.Text;
  private messageIndex = 0;
  private barFillGfx?: Phaser.GameObjects.Graphics;
  private barW = 300;
  private barH = 24;
  private barX = 0;
  private barY = 0;

  constructor() {
    super({ key: 'LoadingScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const loader = AssetLoader.getInstance();

    // If already loaded, skip straight to game
    if (loader.isFullyLoaded) {
      this.scene.start('GameScene');
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

    const ANIMAL_COLOURS = [0xff7eb3, 0xa0c878, 0xf9d56e, 0xff8c5a, 0x7bcfff, 0xc87bff, 0x78e0c8];
    BOUNCE_ANIMALS.forEach((label, i) => {
      const animal = this.add.text(startX + i * spacing, animalY, label, {
        fontSize: '14px', fontFamily: FONTS.body, color: '#ffffff',
        backgroundColor: '#' + ANIMAL_COLOURS[i % ANIMAL_COLOURS.length].toString(16).padStart(6, '0'),
        padding: { x: 6, y: 4 },
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

    // ── Wire up progress ────────────────────────────────────
    loader.onProgress((pct) => {
      this.drawBarFill(pct);
    });

    loader.onComplete(() => {
      this.drawBarFill(1);
      // Celebration flash then go
      this.time.delayedCall(300, () => {
        loader.clearCallbacks();
        this.tweens.add({
          targets: this.cameras.main,
          alpha: 0,
          duration: 300,
          onComplete: () => this.scene.start('GameScene'),
        });
      });
    });

    // Start/continue background loading
    loader.startBackgroundLoad(this);

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
}
