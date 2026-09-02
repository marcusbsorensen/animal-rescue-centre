import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { COLOURS, FONTS, TEXT_RESOLUTION, MIN_FONT, bottomAnchorY } from '../ui/constants';
import { createChromeButton, createTextButton, createChromeTitle, createPanel, createAmbientParticles } from '../ui/UIButton';
import {
  applyHealStep,
  HEAL_ACTIONS,
  ILLNESSES,
  SPECIES_COLOURS,
} from '@arc/game-logic';
import { createAnimalSprite } from '../ui/sprites';
import { AudioManager } from '../audio/AudioManager';
import type { IllnessDef, HealAction } from '@arc/game-logic';

/**
 * VetScene — Phase 8 self-heal minigame.
 *
 * Player chooses healing actions to cure a sick animal.
 * Effective actions progress the heal bar faster.
 * After enough correct actions, the animal is healed!
 */
export class VetScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;
  private animal!: Animal;
  private illness!: IllnessDef;
  private allAnimals: Animal[] = [];
  private onComplete?: (animals: Animal[], healed: boolean) => void;

  private healStep = 0;
  private healed = false;
  private container!: Phaser.GameObjects.Container;
  private feedbackText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'VetScene' });
  }

  init(data: {
    animal: Animal;
    illness: IllnessDef;
    allAnimals: Animal[];
    onComplete: (animals: Animal[], healed: boolean) => void;
  }): void {
    this.animal = data.animal;
    this.illness = data.illness;
    this.allAnimals = [...(data.allAnimals || [])];
    this.onComplete = data.onComplete;
    this.healStep = 0;
    this.healed = false;
  }

  create(): void {
    // Start vet music
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('vet');

    // Fade-in transition
    this.cameras.main.fadeIn(400, 245, 235, 224);

    this.container = this.add.container(0, 0);

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

    this.renderView();
  }

  private clearView(): void {
    this.container.removeAll(true);
  }

  private renderView(): void {
    this.clearView();
    const { width, height } = this.scale;

    if (this.healed) {
      this.renderHealed(width, height);
      return;
    }

    // Background — vet clinic feel (with subtle inner shadow via slightly offset dark rect)
    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height, 0xf0f8ff)
    );
    // Soft inner shadow at top edge
    this.container.add(
      this.add.rectangle(width / 2, 3, width, 6, 0x000000, 0.04)
    );

    // Subtle medical cross/plus background pattern
    const bgPattern = this.add.graphics();
    bgPattern.lineStyle(1.5, 0xd4c8b8, 0.05);
    for (let mx = 50; mx < width; mx += 100) {
      for (let my = 50; my < height; my += 100) {
        const ox = ((my / 100) % 2) * 50;
        const x = mx + ox, y = my;
        bgPattern.strokeRect(x - 3, y - 10, 6, 20);
        bgPattern.strokeRect(x - 10, y - 3, 20, 6);
      }
    }
    this.container.add(bgPattern);

    // Title
    this.container.add(
      createChromeTitle(this, width / 2, 35, 'Vet Clinic', { fontSize: '20px', icon: 'icon-vet-clinic' })
    );

    // ── Patient card: sprite on the left, name + illness on the right ────
    // Sprite sits fully below the title pill (title has ~30px height → bottom ~50).
    const spriteW = 200, spriteH = 180;
    const spriteX = width / 2 - 110;
    const spriteY = 120;
    const animalSprite = createAnimalSprite(this, spriteX, spriteY, this.animal, { width: spriteW, height: spriteH });
    if (animalSprite instanceof Phaser.GameObjects.Rectangle) {
      animalSprite.setStrokeStyle(2, 0xff6b6b);
    }
    this.container.add(animalSprite);

    // Name + illness label, left-aligned next to sprite
    const textX = width / 2 - 40;
    this.container.add(
      this.add.text(textX, spriteY - 18,
        `${this.animal.name}`, {
        fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5)
    );
    this.container.add(
      this.add.text(textX, spriteY + 4,
        `has ${this.illness.emoji} ${this.illness.label}`, {
        fontSize: '15px', fontFamily: FONTS.body, color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5)
    );
    this.container.add(
      this.add.text(textX, spriteY + 24, this.illness.description, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: COLOURS.textLight,
        fontStyle: 'italic', resolution: TEXT_RESOLUTION,
        wordWrap: { width: Math.min(260, width - textX - 20) },
      }).setOrigin(0, 0.5)
    );

    // ── Health bar ──────────────────────────────────────────────
    const barY = 200;
    const barW = 220;
    const barX = width / 2 - barW / 2;
    this.container.add(
      this.add.text(width / 2, barY - 14, 'Health', {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );
    // Track
    const trackGfx = this.add.graphics();
    trackGfx.fillStyle(0xdddddd, 1);
    trackGfx.fillRoundedRect(barX, barY, barW, 14, 7);
    this.container.add(trackGfx);
    // Fill
    const healthPct = Math.max(0, Math.min(1, this.animal.health / 100));
    const healthColour = healthPct > 0.5 ? 0x2ecc71 : healthPct > 0.25 ? 0xf1c40f : 0xe74c3c;
    if (healthPct > 0.01) {
      const fillGfx = this.add.graphics();
      fillGfx.fillStyle(healthColour, 1);
      fillGfx.fillRoundedRect(barX, barY, Math.max(14, barW * healthPct), 14, 7);
      this.container.add(fillGfx);
    }
    // Percentage on the right
    this.container.add(
      this.add.text(barX + barW + 8, barY + 7, `${Math.round(this.animal.health)}%`, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5)
    );

    // ── Progress ────────────────────────────────────────────────
    this.container.add(
      this.add.text(width / 2, 238,
        `Healing progress: ${this.healStep}/${this.illness.healSteps}`, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.primary, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    // Progress dots
    for (let i = 0; i < this.illness.healSteps; i++) {
      const dotX = width / 2 - ((this.illness.healSteps - 1) * 22) / 2 + i * 22;
      this.container.add(
        this.add.circle(dotX, 260, 7,
          i < this.healStep ? 0x2ecc71 : 0xe6e6e6
        ).setStrokeStyle(1, 0xb8b8b8)
      );
    }

    // ── Heal action buttons ─────────────────────────────────────
    this.container.add(
      this.add.text(width / 2, 288, 'Choose a treatment', {
        fontSize: '15px', fontFamily: FONTS.title, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    const actionsPerRow = Math.min(3, HEAL_ACTIONS.length);
    const sidePad = 16;
    const cardGap = 10;
    const cardW = (width - sidePad * 2 - cardGap * (actionsPerRow - 1)) / actionsPerRow;
    const cardH = 86;
    const cardsTop = 320;
    HEAL_ACTIONS.forEach((action, i) => {
      const col = i % actionsPerRow;
      const row = Math.floor(i / actionsPerRow);
      const x = sidePad + col * (cardW + cardGap) + cardW / 2;
      const y = cardsTop + row * (cardH + 12) + cardH / 2;

      // Card (shadow + rounded white panel with species-coloured accent bar)
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.12);
      shadow.fillRoundedRect(x - cardW / 2 + 2, y - cardH / 2 + 4, cardW, cardH, 12);
      this.container.add(shadow);

      const cardGfx = this.add.graphics();
      cardGfx.fillStyle(0xffffff, 1);
      cardGfx.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 12);
      cardGfx.lineStyle(1.5, 0xe6d8bf, 1);
      cardGfx.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 12);
      // Accent bar down the left (red clinic theme)
      cardGfx.fillStyle(0xE74C3C, 0.85);
      cardGfx.fillRoundedRect(x - cardW / 2, y - cardH / 2, 4, cardH, { tl: 12, tr: 0, bl: 12, br: 0 });
      this.container.add(cardGfx);

      const emojiY = y - cardH / 2 + 22;
      this.container.add(
        this.add.text(x, emojiY, action.emoji, { fontSize: '30px' }).setOrigin(0.5)
      );
      this.container.add(
        this.add.text(x, emojiY + 24, action.label, {
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.title, fontStyle: 'bold',
          color: COLOURS.text, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
      );
      this.container.add(
        this.add.text(x, emojiY + 42, action.description, {
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: COLOURS.textLight,
          resolution: TEXT_RESOLUTION, wordWrap: { width: cardW - 16 }, align: 'center',
        }).setOrigin(0.5)
      );

      const hit = this.add.rectangle(x, y, cardW, cardH, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => cardGfx.setAlpha(0.85));
      hit.on('pointerout', () => cardGfx.setAlpha(1));
      hit.on('pointerdown', () => this.applyAction(action.action));
      this.container.add(hit);
    });

    // Feedback area (below cards, above back button)
    if (this.feedbackText) {
      this.container.add(this.feedbackText);
    }

    // Back button
    this.container.add(
      createTextButton(this, width / 2, bottomAnchorY(height),
        '← Back to centre (leave sick)', () => {
          this.registry.set('updatedAnimals', this.allAnimals);
          this.registry.set('vetResult', { healed: false });
          this.scene.start('GameScene');
        })
    );
  }

  private applyAction(action: HealAction): void {
    const result = applyHealStep(this.animal, this.illness, action, this.healStep);

    // Update animal in our local state
    this.animal = result.animal;
    const idx = this.allAnimals.findIndex((a) => a.id === this.animal.id);
    if (idx >= 0) {
      this.allAnimals[idx] = this.animal;
    }

    if (result.effective) {
      this.healStep++;
      this.showFeedback(`${action} is helping! Good choice!`, COLOURS.primary);
    } else {
      this.showFeedback(`That didn't help much... try something else!`, COLOURS.textLight);
    }

    if (result.healed) {
      this.healed = true;
      this.time.delayedCall(500, () => this.renderView());
    } else {
      this.renderView();
    }
  }

  private showFeedback(message: string, colour: string): void {
    const { width } = this.scale;
    if (this.feedbackText) this.feedbackText.destroy();

    this.feedbackText = this.add.text(width / 2, 500, message, {
      fontSize: '16px', fontFamily: FONTS.body, color: colour,
      backgroundColor: '#ffffff', padding: { x: 10, y: 4 },
    }).setOrigin(0.5);
  }

  private renderHealed(width: number, height: number): void {
    // Clear any lingering treatment feedback toast
    if (this.feedbackText) {
      this.feedbackText.destroy();
      this.feedbackText = undefined;
    }
    // Happy background
    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height, 0xe8f5e9)
    );

    // Celebration — green circles
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const healCircle = this.add.circle(
        width / 2 + Math.cos(angle) * 80,
        height / 2 - 60 + Math.sin(angle) * 60,
        10, 0x2ecc71
      ).setAlpha(0);
      this.container.add(healCircle);
      this.tweens.add({
        targets: healCircle,
        alpha: 1, scale: { from: 0.3, to: 1 },
        duration: 500, delay: i * 100,
        yoyo: true, repeat: -1, hold: 1000,
      });
    }

    this.container.add(
      this.add.text(width / 2, height / 2 - 80, 'All Better!', {
        fontSize: '32px', fontFamily: FONTS.title, color: COLOURS.primary,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 - 30,
        `${this.animal.name} is feeling great again!`, {
        fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 + 5,
        'You\'re an amazing vet! +8 bond', {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // Apply bond bonus
    const idx = this.allAnimals.findIndex((a) => a.id === this.animal.id);
    if (idx >= 0) {
      this.allAnimals[idx].bondLevel = Math.min(100, this.allAnimals[idx].bondLevel + 8);
    }

    // Ambient celebration particles (empty = no emoji particles)
    this.container.add(
      createAmbientParticles(this, [], { count: 10, minAlpha: 0.1, maxAlpha: 0.25 })
    );

    this.container.add(
      createChromeButton(this, width / 2, height / 2 + 70, 'Back to Centre', () => {
        this.registry.set('updatedAnimals', this.allAnimals);
        this.registry.set('vetResult', { healed: true, animalId: this.animal.id });
        this.scene.start('GameScene');
      }, { width: 240, icon: 'icon-back', iconStyle: 'glyph', variant: 'filled' })
    );
  }
}
