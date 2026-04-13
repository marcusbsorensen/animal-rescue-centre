import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { COLOURS, FONTS } from '../ui/constants';
import { createButton, createTextButton } from '../ui/UIButton';
import {
  startWalk,
  advanceWalk,
  handleRoadCrossingSuccess,
  handleRoadCrossingFail,
  calculateWalkRewards,
  canGoOnWalk,
  WALK_EVENTS,
  WALK_ZONES,
  SPECIES_COLOURS,
} from '@arc/game-logic';
import { createAnimalSprite } from '../ui/sprites';
import { AudioManager } from '../audio/AudioManager';
import type { WalkState, WalkZone, WalkEventDef } from '@arc/game-logic';

/**
 * WalkScene — Phase 7 walk minigame.
 *
 * Pick a zone, then walk through events. At road crossings,
 * player must press STOP within 3 seconds. Rewards at the end.
 */
export class WalkScene extends Phaser.Scene {
  private animal!: Animal;
  private allAnimals: Animal[] = [];
  private onComplete?: (animals: Animal[], walkResult: { perfectWalk: boolean }) => void;

  private walkState?: WalkState;
  private phase: 'select_zone' | 'walking' | 'road_event' | 'results' = 'select_zone';
  private container!: Phaser.GameObjects.Container;
  private roadTimer?: Phaser.Time.TimerEvent;
  private roadTimeLeft = 3000;
  private roadKeys: Phaser.Input.Keyboard.Key[] = [];

  constructor() {
    super({ key: 'WalkScene' });
  }

  init(data: {
    animal: Animal;
    allAnimals: Animal[];
    onComplete: (animals: Animal[], walkResult: { perfectWalk: boolean }) => void;
  }): void {
    this.animal = data.animal;
    this.allAnimals = [...(data.allAnimals || [])];
    this.onComplete = data.onComplete;
    this.walkState = undefined;
    this.phase = 'select_zone';
  }

  create(): void {
    // Start walk music
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('walk');

    this.container = this.add.container(0, 0);
    this.renderView();

    // Clean up keyboard listeners when scene shuts down
    this.events.on('shutdown', () => {
      this.cleanupRoadKeys();
      if (this.roadTimer) {
        this.roadTimer.destroy();
        this.roadTimer = undefined;
      }
    });
  }

  private clearView(): void {
    this.container.removeAll(true);
    if (this.roadTimer) {
      this.roadTimer.destroy();
      this.roadTimer = undefined;
    }
    // Clean up any lingering keyboard handlers from road crossing
    this.cleanupRoadKeys();
  }

  private cleanupRoadKeys(): void {
    for (const key of this.roadKeys) {
      key.removeAllListeners();
      this.input.keyboard?.removeKey(key);
    }
    this.roadKeys = [];
  }

  private renderView(): void {
    this.clearView();
    const { width, height } = this.scale;

    // Background
    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height, 0xe8f5e9)
    );

    switch (this.phase) {
      case 'select_zone': this.renderZoneSelect(width, height); break;
      case 'walking': this.renderWalkEvent(width, height); break;
      case 'road_event': this.renderRoadCrossing(width, height); break;
      case 'results': this.renderResults(width, height); break;
    }
  }

  // ── Zone Selection ─────────────────────────────────────────

  private renderZoneSelect(width: number, height: number): void {
    this.container.add(
      this.add.text(width / 2, 40, `🐾 Walk with ${this.animal.name}!`, {
        fontSize: '26px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, 75, 'Choose where to go:', {
        fontSize: '17px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    WALK_ZONES.forEach((zone, i) => {
      const y = 130 + i * 100;

      const bg = this.add.rectangle(width / 2, y, width - 80, 80, 0xffffff)
        .setStrokeStyle(2, 0xd4c8b8)
        .setInteractive({ useHandCursor: true });

      this.container.add(bg);

      this.container.add(
        this.add.text(width / 2 - 140, y - 12,
          `${zone.emoji} ${zone.label}`, {
          fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.text,
        }).setOrigin(0, 0.5)
      );

      this.container.add(
        this.add.text(width / 2 - 140, y + 15, zone.description, {
          fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0, 0.5)
      );

      bg.on('pointerdown', () => this.startWalkInZone(zone.zone));
    });

    this.container.add(
      createTextButton(this, width / 2, height - 30,
        '← Back to centre', () => {
          this.scene.start('GameScene');
        })
    );
  }

  // ── Walk Events ────────────────────────────────────────────

  private startWalkInZone(zone: WalkZone): void {
    this.walkState = startWalk(this.animal, zone);
    this.phase = 'walking';
    this.showNextEvent();
  }

  private showNextEvent(): void {
    if (!this.walkState || this.walkState.completed) {
      this.phase = 'results';
      this.renderView();
      return;
    }

    const eventType = this.walkState.events[this.walkState.currentEventIndex];

    if (eventType === 'road_crossing') {
      this.phase = 'road_event';
    } else {
      this.phase = 'walking';
    }

    this.renderView();
  }

  private renderWalkEvent(width: number, height: number): void {
    if (!this.walkState) return;

    const eventType = this.walkState.events[this.walkState.currentEventIndex];
    const eventDef = WALK_EVENTS.find((e) => e.type === eventType);

    // Progress bar
    this.renderProgressBar(width);

    // Animal walking
    const walkSprite = createAnimalSprite(this, width / 2, height / 2 - 40, this.animal, { width: 60, height: 48 });
    this.container.add(walkSprite);

    // Event display
    this.container.add(
      this.add.text(width / 2, height / 2 + 30, eventDef?.emoji ?? '🐾', {
        fontSize: '48px',
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 + 80,
        eventDef?.description ?? 'Walking along...', {
        fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.text,
        align: 'center', wordWrap: { width: width - 60 },
      }).setOrigin(0.5)
    );

    // "Continue walking" button
    this.container.add(
      createButton(this, width / 2, height / 2 + 140,
        '🐾 Keep walking', () => {
          this.walkState = advanceWalk(this.walkState!);
          this.showNextEvent();
        }, { width: 220 })
    );

    // Lead toggle
    this.container.add(
      createTextButton(this, width / 2, height - 50,
        `Lead: ${this.walkState.leadOn ? '✅ On' : '❌ Off'}`, () => {
          this.walkState!.leadOn = !this.walkState!.leadOn;
          this.renderView();
        })
    );
  }

  // ── Road Crossing ──────────────────────────────────────────

  private renderRoadCrossing(width: number, height: number): void {
    if (!this.walkState) return;

    this.renderProgressBar(width);

    // Danger zone visual
    this.container.add(
      this.add.rectangle(width / 2, height / 2 - 20, width - 40, 200, 0xffe0e0)
        .setStrokeStyle(3, 0xe74c3c)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 - 80, '🚗 ROAD! 🚗', {
        fontSize: '36px', fontFamily: FONTS.title, color: '#c0392b',
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 - 40,
        'Quick! Press STOP to keep your animal safe!', {
        fontSize: '17px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // STOP button (big, red, obvious)
    this.container.add(
      createButton(this, width / 2, height / 2 + 20, '🛑 STOP!', () => {
        if (this.roadTimer) {
          this.roadTimer.destroy();
          this.roadTimer = undefined;
        }
        this.walkState = handleRoadCrossingSuccess(this.walkState!);
        this.showRoadResult(true);
      }, { width: 200, fontSize: '24px', bgColour: '#c0392b' })
    );

    // Countdown timer (3 seconds)
    this.roadTimeLeft = 3000;
    const timerText = this.add.text(width / 2, height / 2 + 80,
      'Time: 3.0s', {
      fontSize: '20px', fontFamily: FONTS.body, color: '#c0392b',
    }).setOrigin(0.5);
    this.container.add(timerText);

    // Update timer display
    this.roadTimer = this.time.addEvent({
      delay: 100,
      callback: () => {
        this.roadTimeLeft -= 100;
        const secs = Math.max(0, this.roadTimeLeft / 1000).toFixed(1);
        timerText.setText(`Time: ${secs}s`);

        if (this.roadTimeLeft <= 0) {
          this.roadTimer?.destroy();
          this.roadTimer = undefined;
          this.walkState = handleRoadCrossingFail(this.walkState!);
          this.showRoadResult(false);
        }
      },
      loop: true,
    });

    // Keyboard support — Space or Enter to stop
    this.cleanupRoadKeys(); // ensure no stale keys from previous crossing
    const spaceKey = this.input.keyboard?.addKey('SPACE');
    const enterKey = this.input.keyboard?.addKey('ENTER');
    if (spaceKey) this.roadKeys.push(spaceKey);
    if (enterKey) this.roadKeys.push(enterKey);
    const handler = () => {
      if (this.roadTimer) {
        this.roadTimer.destroy();
        this.roadTimer = undefined;
        this.cleanupRoadKeys();
        this.walkState = handleRoadCrossingSuccess(this.walkState!);
        this.showRoadResult(true);
      }
    };
    spaceKey?.on('down', handler);
    enterKey?.on('down', handler);
  }

  private showRoadResult(success: boolean): void {
    this.clearView();
    const { width, height } = this.scale;

    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height,
        success ? 0xe8f5e9 : 0xffe0e0)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 - 40,
        success ? '✅ Great job!' : '⚠️ Oops!', {
        fontSize: '32px', fontFamily: FONTS.title,
        color: success ? COLOURS.primary : '#c0392b',
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 + 10,
        success
          ? `${this.animal.name} stopped safely! Good road safety! 🚶`
          : `${this.animal.name} didn't stop in time. Remember: always stop and look! 👀`, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
        align: 'center', wordWrap: { width: width - 80 },
      }).setOrigin(0.5)
    );

    this.container.add(
      createButton(this, width / 2, height / 2 + 80, '🐾 Continue walk', () => {
        this.walkState = advanceWalk(this.walkState!);
        this.showNextEvent();
      }, { width: 220 })
    );
  }

  // ── Results ────────────────────────────────────────────────

  private renderResults(width: number, height: number): void {
    if (!this.walkState) return;

    const rewards = calculateWalkRewards(this.walkState);

    // Apply rewards to animal
    const idx = this.allAnimals.findIndex((a) => a.id === this.animal.id);
    if (idx >= 0) {
      this.allAnimals[idx] = {
        ...this.allAnimals[idx],
        bondLevel: Math.min(100, this.allAnimals[idx].bondLevel + rewards.bondIncrease),
        happiness: Math.min(100, this.allAnimals[idx].happiness + rewards.happinessIncrease),
        tiredness: Math.min(100, this.allAnimals[idx].tiredness + rewards.tirednessIncrease),
      };
    }

    this.container.add(
      this.add.text(width / 2, 50,
        rewards.perfectWalk ? '🌟 Perfect Walk! 🌟' : '🐾 Walk Complete!', {
        fontSize: '28px', fontFamily: FONTS.title, color: COLOURS.primary,
      }).setOrigin(0.5)
    );

    // Star burst for perfect walks
    if (rewards.perfectWalk) {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const star = this.add.text(
          width / 2 + Math.cos(angle) * 80,
          50 + Math.sin(angle) * 40,
          '⭐', { fontSize: '24px' }
        ).setOrigin(0.5).setAlpha(0);
        this.container.add(star);
        this.tweens.add({
          targets: star,
          alpha: 1, scale: { from: 0.3, to: 1.2 },
          duration: 500, delay: i * 100,
          yoyo: true, repeat: -1, hold: 800,
        });
      }
    }

    // Summary
    const summaryY = 120;
    const zone = WALK_ZONES.find((z) => z.zone === this.walkState!.zone);

    this.container.add(
      this.add.text(width / 2, summaryY,
        `${zone?.emoji} Walked through ${zone?.label}`, {
        fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Rewards display
    const rewardLines = [
      `❤️ Bond: +${rewards.bondIncrease}`,
      `😊 Happiness: +${rewards.happinessIncrease}`,
      `😴 Tiredness: +${rewards.tirednessIncrease}`,
    ];

    if (rewards.perfectWalk) {
      rewardLines.push('🛡️ Road safety: Perfect!');
    } else {
      rewardLines.push(`⚠️ Road incidents: ${this.walkState!.incidentCount}`);
    }

    rewardLines.forEach((line, i) => {
      this.container.add(
        this.add.text(width / 2, summaryY + 40 + i * 30, line, {
          fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
        }).setOrigin(0.5)
      );
    });

    this.container.add(
      createButton(this, width / 2, height - 80, '✅ Back to Centre', () => {
        this.registry.set('updatedAnimals', this.allAnimals);
        this.registry.set('walkResult', { perfectWalk: rewards.perfectWalk });
        this.scene.start('GameScene');
      }, { width: 240 })
    );
  }

  // ── Helpers ────────────────────────────────────────────────

  private renderProgressBar(width: number): void {
    if (!this.walkState) return;

    const progress = this.walkState.currentEventIndex / this.walkState.events.length;
    const barY = 25;

    // Background
    this.container.add(
      this.add.rectangle(width / 2, barY, width - 40, 12, 0xdddddd)
    );
    // Fill
    if (progress > 0) {
      this.container.add(
        this.add.rectangle(
          20 + ((width - 40) * progress) / 2, barY,
          (width - 40) * progress, 12, 0x4a9c5d
        ).setOrigin(0, 0.5)
      );
    }
    // Label
    this.container.add(
      this.add.text(width / 2, barY,
        `Step ${this.walkState.currentEventIndex + 1}/${this.walkState.events.length}`, {
        fontSize: '10px', fontFamily: FONTS.body, color: '#ffffff',
      }).setOrigin(0.5)
    );
  }
}
