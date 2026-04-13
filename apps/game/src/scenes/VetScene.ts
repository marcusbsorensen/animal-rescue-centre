import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { COLOURS, FONTS } from '../ui/constants';
import { createButton, createTextButton, createPillTitle, createPanel, createAmbientParticles } from '../ui/UIButton';
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
    this.cameras.main.setAlpha(0);
    this.tweens.add({ targets: this.cameras.main, alpha: 1, duration: 400, ease: 'Power2' });

    this.container = this.add.container(0, 0);
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

    // Title
    this.container.add(
      createPillTitle(this, width / 2, 35, '🏥 Vet Clinic', { bgColour: 0xE74C3C, fontSize: '20px' })
    );

    // Animal info
    const animalSprite = createAnimalSprite(this, width / 2, 100, this.animal, { width: 90, height: 72 });
    if (animalSprite instanceof Phaser.GameObjects.Rectangle) {
      animalSprite.setStrokeStyle(2, 0xff6b6b);
    }
    this.container.add(animalSprite);

    this.container.add(
      this.add.text(width / 2, 140,
        `${this.animal.name} has ${this.illness.emoji} ${this.illness.label}`, {
        fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, 165, this.illness.description, {
        fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.textLight,
        fontStyle: 'italic',
      }).setOrigin(0.5)
    );

    // Health bar
    const barY = 200;
    this.container.add(
      this.add.text(width / 2 - 100, barY, 'Health:', {
        fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.text,
      })
    );
    this.container.add(
      this.add.rectangle(width / 2 + 30, barY + 6, 160, 14, 0xdddddd)
    );
    const healthPct = this.animal.health / 100;
    const healthColour = healthPct > 0.5 ? 0x2ecc71 : healthPct > 0.25 ? 0xf1c40f : 0xe74c3c;
    this.container.add(
      this.add.rectangle(
        width / 2 + 30 - 80 + healthPct * 80, barY + 6,
        healthPct * 160, 14, healthColour
      )
    );
    this.container.add(
      this.add.text(width / 2 + 120, barY, `${Math.round(this.animal.health)}%`, {
        fontSize: '13px', fontFamily: FONTS.body, color: '#888',
      })
    );

    // Progress
    this.container.add(
      this.add.text(width / 2, 230,
        `Healing progress: ${this.healStep}/${this.illness.healSteps}`, {
        fontSize: '15px', fontFamily: FONTS.body, color: COLOURS.primary,
      }).setOrigin(0.5)
    );

    // Progress dots
    for (let i = 0; i < this.illness.healSteps; i++) {
      const dotX = width / 2 - ((this.illness.healSteps - 1) * 25) / 2 + i * 25;
      this.container.add(
        this.add.circle(dotX, 255, 8,
          i < this.healStep ? 0x2ecc71 : 0xdddddd
        ).setStrokeStyle(1, 0x999999)
      );
    }

    // Heal action buttons
    this.container.add(
      this.add.text(width / 2, 285, 'Choose a treatment:', {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    const actionsPerRow = 3;
    const actionW = (width - 60) / actionsPerRow;
    HEAL_ACTIONS.forEach((action, i) => {
      const col = i % actionsPerRow;
      const row = Math.floor(i / actionsPerRow);
      const x = 30 + col * actionW + actionW / 2;
      const y = 330 + row * 90;

      // Treatment card shadow
      const cardShadow = this.add.rectangle(x + 3, y + 4, actionW - 10, 75, 0x000000, 0.1);
      this.container.add(cardShadow);

      const bg = this.add.rectangle(x, y, actionW - 10, 75, 0xffffff)
        .setStrokeStyle(2, 0xb8a898)
        .setInteractive({ useHandCursor: true });

      const emoji = this.add.text(x, y - 15, action.emoji, {
        fontSize: '28px',
      }).setOrigin(0.5);

      const label = this.add.text(x, y + 12, action.label, {
        fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5);

      const desc = this.add.text(x, y + 28, action.description, {
        fontSize: '12px', fontFamily: FONTS.body, color: COLOURS.textLight,
        wordWrap: { width: actionW - 20 }, align: 'center',
      }).setOrigin(0.5);

      bg.on('pointerover', () => bg.setFillStyle(0xf5efe4));
      bg.on('pointerout', () => bg.setFillStyle(0xffffff));
      bg.on('pointerdown', () => this.applyAction(action.action));

      this.container.add(bg);
      this.container.add(emoji);
      this.container.add(label);
      this.container.add(desc);
    });

    // Feedback area
    if (this.feedbackText) {
      this.container.add(this.feedbackText);
    }

    // Back button
    this.container.add(
      createTextButton(this, width / 2, height - 25,
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
      this.showFeedback(`✅ ${action} is helping! Good choice!`, COLOURS.primary);
    } else {
      this.showFeedback(`🤔 That didn't help much... try something else!`, COLOURS.textLight);
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
    // Happy background
    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height, 0xe8f5e9)
    );

    // Celebration
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const star = this.add.text(
        width / 2 + Math.cos(angle) * 80,
        height / 2 - 60 + Math.sin(angle) * 60,
        '💚', { fontSize: '28px' }
      ).setOrigin(0.5).setAlpha(0);
      this.container.add(star);
      this.tweens.add({
        targets: star,
        alpha: 1, scale: { from: 0.3, to: 1 },
        duration: 500, delay: i * 100,
        yoyo: true, repeat: -1, hold: 1000,
      });
    }

    this.container.add(
      this.add.text(width / 2, height / 2 - 80, '🎉 All Better! 🎉', {
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
        'You\'re an amazing vet! +8 bond ❤️', {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // Apply bond bonus
    const idx = this.allAnimals.findIndex((a) => a.id === this.animal.id);
    if (idx >= 0) {
      this.allAnimals[idx].bondLevel = Math.min(100, this.allAnimals[idx].bondLevel + 8);
    }

    // Ambient celebration particles
    this.container.add(
      createAmbientParticles(this, ['💚', '⭐', '✨'], { count: 10, minAlpha: 0.1, maxAlpha: 0.25 })
    );

    this.container.add(
      createButton(this, width / 2, height / 2 + 70, '✅ Back to Centre', () => {
        this.registry.set('updatedAnimals', this.allAnimals);
        this.registry.set('vetResult', { healed: true, animalId: this.animal.id });
        this.scene.start('GameScene');
      }, { width: 240 })
    );
  }
}
