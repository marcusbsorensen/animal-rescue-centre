import Phaser from 'phaser';
import { COLOURS, FONTS } from '../ui/constants';
import { createButton, createTextButton, createPillTitle } from '../ui/UIButton';
import { AudioManager } from '../audio/AudioManager';
import {
  canAccessDestination,
  startSupplyRun,
  generateObstacle,
  applyObstacleHit,
  applySmash,
  changeLane,
  advanceDistance,
  checkCompletion,
  isCatastrophicDamage,
  calculateSupplyRewards,
  SUPPLY_DESTINATIONS,
  OBSTACLES,
  DAMAGE_THRESHOLDS,
} from '@arc/game-logic';
import type { SupplyDestination } from '@arc/shared-types';
import type { SupplyRunLaneState, ObstacleDef, DestinationDef } from '@arc/game-logic';

// ── Neon colour palette (tonal shift from gentle care) ───────
const NEON = {
  bg: 0x0a0a1a,              // near-black
  road: 0x1a1a2e,            // dark blue-grey
  lane: 0x2a2a4e,            // lane markings
  laneActive: 0x00ff88,      // neon green for player lane
  hud: 0x0d0d24,             // HUD bar background
  hudBorder: 0x00ccff,       // cyan HUD border
  accent: 0xff6600,          // orange accent
  danger: 0xff2244,          // red danger
  success: 0x00ff88,         // green success
  gold: 0xffd700,            // gold for money
  text: '#00ffcc',           // cyan text
  textWhite: '#ffffff',
  textDim: '#667788',
  neonPink: 0xff00aa,
  neonBlue: 0x00aaff,
};

// Obstacle display config
const OBSTACLE_LANE_Y_OFFSET = -200; // start above screen
const ROAD_SCROLL_SPEED = 3;         // pixels per tick

/**
 * SupplyRunScene — Chaos driving minigame with neon aesthetic.
 *
 * Pick a destination → drive through obstacles → earn money.
 * Smash through smashable obstacles or dodge the dangerous ones.
 * Deliberately different tone from the gentle care gameplay.
 */
export class SupplyRunScene extends Phaser.Scene {
  private phase: 'destination_select' | 'driving' | 'results' = 'destination_select';
  private container!: Phaser.GameObjects.Container;
  private playerLevel = 1;

  // Run state
  private runState?: SupplyRunLaneState;
  private destDef?: DestinationDef;

  // Visual driving state
  private truckY = 0;
  private truckContainer?: Phaser.GameObjects.Container;
  private roadLines: Phaser.GameObjects.Rectangle[] = [];
  private activeObstacles: { obj: Phaser.GameObjects.Container; lane: number; obstacle: ObstacleDef; y: number }[] = [];
  private driveTimer?: Phaser.Time.TimerEvent;
  private obstacleTimer?: Phaser.Time.TimerEvent;
  private keys?: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  };
  private lastSpawnTick = 0;
  private distancePerTick = 0;

  constructor() {
    super({ key: 'SupplyRunScene' });
  }

  init(data?: { level?: number }): void {
    this.playerLevel = data?.level ?? 1;
    this.phase = 'destination_select';
    this.runState = undefined;
    this.destDef = undefined;
    this.activeObstacles = [];
    this.roadLines = [];
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('supply_run');

    this.container = this.add.container(0, 0);
    this.renderView();

    this.events.on('shutdown', () => {
      this.cleanupDriving();
    });
  }

  private cleanupDriving(): void {
    if (this.driveTimer) { this.driveTimer.destroy(); this.driveTimer = undefined; }
    if (this.obstacleTimer) { this.obstacleTimer.destroy(); this.obstacleTimer = undefined; }
    if (this.keys) {
      for (const k of Object.values(this.keys)) {
        k.removeAllListeners();
        this.input.keyboard?.removeKey(k);
      }
      this.keys = undefined;
    }
  }

  private clearView(): void {
    this.cleanupDriving();
    this.container.removeAll(true);
    this.activeObstacles = [];
    this.roadLines = [];
    this.truckContainer = undefined;
  }

  private renderView(): void {
    this.clearView();
    const { width, height } = this.scale;

    // Dark background
    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height, NEON.bg)
    );

    switch (this.phase) {
      case 'destination_select': this.renderDestinationSelect(width, height); break;
      case 'driving': this.renderDrivingMode(width, height); break;
      case 'results': this.renderResults(width, height); break;
    }
  }

  // ── Destination Selection ──────────────────────────────────

  private renderDestinationSelect(width: number, height: number): void {
    // Neon banner
    this.container.add(
      createPillTitle(this, width / 2, 50, '🚛 SUPPLY RUN', {
        bgColour: NEON.accent,
        fontSize: '28px',
      })
    );

    this.container.add(
      this.add.text(width / 2, 95, 'Pick your destination and drive!', {
        fontSize: '15px', fontFamily: FONTS.body, color: NEON.textDim,
      }).setOrigin(0.5)
    );

    SUPPLY_DESTINATIONS.forEach((dest, i) => {
      const y = 155 + i * 120;
      const unlocked = canAccessDestination(dest.destination, this.playerLevel);
      const alpha = unlocked ? 1 : 0.35;

      // Card with neon border
      const card = this.add.graphics();
      card.fillStyle(0xffffff, 0.05);
      card.fillRoundedRect(30, y - 40, width - 60, 100, 12);
      if (unlocked) {
        card.lineStyle(2, NEON.hudBorder, 0.5);
        card.strokeRoundedRect(30, y - 40, width - 60, 100, 12);
      }
      card.setAlpha(alpha);
      this.container.add(card);

      // Emoji
      this.container.add(
        this.add.text(65, y - 5, dest.emoji, {
          fontSize: '36px',
        }).setOrigin(0.5).setAlpha(alpha)
      );

      // Label
      this.container.add(
        this.add.text(100, y - 18, dest.label, {
          fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold',
          color: unlocked ? NEON.textWhite : '#555555',
        }).setOrigin(0, 0.5).setAlpha(alpha)
      );

      // Description + pay
      this.container.add(
        this.add.text(100, y + 5, dest.description, {
          fontSize: '12px', fontFamily: FONTS.body,
          color: unlocked ? NEON.textDim : '#444444',
        }).setOrigin(0, 0.5).setAlpha(alpha)
      );

      this.container.add(
        this.add.text(100, y + 25,
          unlocked ? `💰 Base pay: ${dest.basePay} coins  |  Distance: ${dest.distance}` : `🔒 Unlocks at level ${dest.unlockLevel}`, {
          fontSize: '11px', fontFamily: FONTS.body,
          color: unlocked ? '#ffd700' : '#555555',
        }).setOrigin(0, 0.5).setAlpha(alpha)
      );

      if (unlocked) {
        const hitArea = this.add.rectangle(width / 2, y, width - 60, 100, 0xffffff, 0)
          .setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => this.startRun(dest));
        this.container.add(hitArea);
      }
    });

    this.container.add(
      createTextButton(this, width / 2, height - 35,
        '← Back to centre', () => {
          this.scene.start('GameScene');
        })
    );
  }

  // ── Start Drive ────────────────────────────────────────────

  private startRun(dest: DestinationDef): void {
    this.destDef = dest;
    this.runState = startSupplyRun(dest.destination, false);
    this.distancePerTick = dest.distance / 200; // ~200 ticks to complete
    this.phase = 'driving';
    this.renderView();
  }

  // ── Driving Mode ───────────────────────────────────────────

  private renderDrivingMode(width: number, height: number): void {
    if (!this.runState || !this.destDef) return;

    const laneWidth = Math.floor((width - 40) / 3);
    const roadLeft = 20;
    const roadWidth = laneWidth * 3;
    const roadRight = roadLeft + roadWidth;

    // Road surface
    this.container.add(
      this.add.rectangle(width / 2, height / 2, roadWidth, height, NEON.road)
    );

    // Lane dividers
    for (let i = 1; i < 3; i++) {
      const lx = roadLeft + i * laneWidth;
      for (let dy = 0; dy < height; dy += 40) {
        const line = this.add.rectangle(lx, dy, 3, 20, 0x444466);
        this.container.add(line);
        this.roadLines.push(line);
      }
    }

    // Road edges (neon glow)
    this.container.add(
      this.add.rectangle(roadLeft, height / 2, 3, height, NEON.neonPink)
    );
    this.container.add(
      this.add.rectangle(roadRight, height / 2, 3, height, NEON.neonBlue)
    );

    // Truck
    this.truckY = height - 100;
    const truckX = roadLeft + this.runState.lane * laneWidth + laneWidth / 2;
    this.truckContainer = this.createTruck(truckX, this.truckY);
    this.container.add(this.truckContainer);

    // HUD bar at top
    this.renderDrivingHUD(width);

    // Controls hint
    this.container.add(
      this.add.text(width / 2, height - 20,
        '← → or A/D to steer  |  SPACE to smash!', {
        fontSize: '11px', fontFamily: FONTS.body, color: NEON.textDim,
      }).setOrigin(0.5)
    );

    // Mobile touch controls
    this.renderTouchControls(width, height, laneWidth, roadLeft);

    // Setup keyboard
    this.setupKeyboard(laneWidth, roadLeft);

    // Start the drive loop
    this.startDriveLoop(width, height, laneWidth, roadLeft);
  }

  private createTruck(x: number, y: number): Phaser.GameObjects.Container {
    const body = this.add.graphics();
    // Truck body
    body.fillStyle(NEON.laneActive, 1);
    body.fillRoundedRect(-20, -30, 40, 60, 6);
    // Windscreen
    body.fillStyle(0x001122, 1);
    body.fillRect(-15, -25, 30, 15);
    // Headlights
    body.fillStyle(0xffff00, 0.8);
    body.fillCircle(-15, -30, 4);
    body.fillCircle(15, -30, 4);

    const label = this.add.text(0, 5, '🚛', {
      fontSize: '28px',
    }).setOrigin(0.5);

    return this.add.container(x, y, [body, label]);
  }

  private renderDrivingHUD(width: number): void {
    if (!this.runState || !this.destDef) return;

    const hudH = 50;
    // HUD background
    const hudBg = this.add.graphics();
    hudBg.fillStyle(NEON.hud, 0.9);
    hudBg.fillRect(0, 0, width, hudH);
    hudBg.lineStyle(2, NEON.hudBorder, 0.6);
    hudBg.lineBetween(0, hudH, width, hudH);
    this.container.add(hudBg);

    // Destination label
    this.container.add(
      this.add.text(10, 8, `${this.destDef.emoji} ${this.destDef.label}`, {
        fontSize: '14px', fontFamily: FONTS.title, fontStyle: 'bold',
        color: NEON.text,
      }).setOrigin(0, 0)
    );

    // Distance progress bar
    const progress = this.runState.distanceCovered / this.runState.distance;
    const barW = width - 20;
    this.container.add(
      this.add.rectangle(10, 32, barW, 8, 0x222244).setOrigin(0, 0.5)
    );
    if (progress > 0) {
      this.container.add(
        this.add.rectangle(10, 32, barW * progress, 8, NEON.laneActive).setOrigin(0, 0.5)
      );
    }

    // Score + damage
    const totalDmg = this.runState.damages.reduce((s, d) => s + d.severity, 0);
    this.container.add(
      this.add.text(10, 42, `💥 ${this.runState.obstaclesDestroyed} smashed`, {
        fontSize: '10px', fontFamily: FONTS.body, color: '#ffd700',
      }).setOrigin(0, 0)
    );
    this.container.add(
      this.add.text(width - 10, 42, `🔧 Damage: ${Math.min(totalDmg, 100)}%`, {
        fontSize: '10px', fontFamily: FONTS.body,
        color: totalDmg > 60 ? '#ff2244' : totalDmg > 30 ? '#ffaa00' : '#00ff88',
      }).setOrigin(1, 0)
    );
  }

  private renderTouchControls(width: number, height: number, laneWidth: number, roadLeft: number): void {
    // Left touch zone
    const leftZone = this.add.rectangle(roadLeft + laneWidth * 0.5, height / 2, laneWidth, height, 0xffffff, 0)
      .setInteractive();
    leftZone.on('pointerdown', () => this.steer(-1, laneWidth, roadLeft));
    this.container.add(leftZone);

    // Right touch zone
    const rightZone = this.add.rectangle(roadLeft + laneWidth * 2.5, height / 2, laneWidth, height, 0xffffff, 0)
      .setInteractive();
    rightZone.on('pointerdown', () => this.steer(1, laneWidth, roadLeft));
    this.container.add(rightZone);

    // Center zone = smash
    const centerZone = this.add.rectangle(roadLeft + laneWidth * 1.5, height / 2, laneWidth, height, 0xffffff, 0)
      .setInteractive();
    centerZone.on('pointerdown', () => this.trySmash());
    this.container.add(centerZone);
  }

  private setupKeyboard(laneWidth: number, roadLeft: number): void {
    const kb = this.input.keyboard;
    if (!kb) return;

    this.keys = {
      left: kb.addKey('LEFT'),
      right: kb.addKey('RIGHT'),
      space: kb.addKey('SPACE'),
      a: kb.addKey('A'),
      d: kb.addKey('D'),
    };

    this.keys.left.on('down', () => this.steer(-1, laneWidth, roadLeft));
    this.keys.a.on('down', () => this.steer(-1, laneWidth, roadLeft));
    this.keys.right.on('down', () => this.steer(1, laneWidth, roadLeft));
    this.keys.d.on('down', () => this.steer(1, laneWidth, roadLeft));
    this.keys.space.on('down', () => this.trySmash());
  }

  private steer(direction: -1 | 1, laneWidth: number, roadLeft: number): void {
    if (!this.runState || this.runState.completed) return;
    this.runState = changeLane(this.runState, direction);

    // Animate truck to new lane
    if (this.truckContainer) {
      const newX = roadLeft + this.runState.lane * laneWidth + laneWidth / 2;
      this.tweens.add({
        targets: this.truckContainer,
        x: newX,
        duration: 120,
        ease: 'Power2',
      });
    }
  }

  private trySmash(): void {
    if (!this.runState || this.runState.completed) return;

    // Find obstacle in same lane, near truck
    const hitIdx = this.activeObstacles.findIndex(
      (o) => o.lane === this.runState!.lane && Math.abs(o.y - this.truckY) < 60
    );

    if (hitIdx >= 0) {
      const obs = this.activeObstacles[hitIdx];
      if (obs.obstacle.smashable) {
        this.runState = applySmash(this.runState, obs.obstacle);
        AudioManager.getInstance().playSfx('obstacle_smash');

        // Smash animation
        this.tweens.add({
          targets: obs.obj,
          scaleX: 1.5, scaleY: 0.3, alpha: 0,
          duration: 200,
          onComplete: () => obs.obj.destroy(),
        });

        // Score popup
        const popup = this.add.text(obs.obj.x, obs.obj.y, `+${obs.obstacle.scoreOnSmash}`, {
          fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold',
          color: '#ffd700',
        }).setOrigin(0.5);
        this.container.add(popup);
        this.tweens.add({
          targets: popup,
          y: popup.y - 40, alpha: 0,
          duration: 500,
          onComplete: () => popup.destroy(),
        });

        this.activeObstacles.splice(hitIdx, 1);
      }
    }
  }

  private startDriveLoop(width: number, height: number, laneWidth: number, roadLeft: number): void {
    if (!this.runState) return;

    let tickCount = 0;

    // Main drive tick (60fps-ish)
    this.driveTimer = this.time.addEvent({
      delay: 50,
      callback: () => {
        if (!this.runState || this.runState.completed) return;

        tickCount++;
        this.runState = advanceDistance(this.runState, this.distancePerTick);
        this.runState.timeTakenMs += 50;

        // Scroll road lines
        for (const line of this.roadLines) {
          line.y += ROAD_SCROLL_SPEED;
          if (line.y > height) line.y -= height;
        }

        // Move obstacles down
        for (let i = this.activeObstacles.length - 1; i >= 0; i--) {
          const obs = this.activeObstacles[i];
          obs.y += ROAD_SCROLL_SPEED * 2;
          obs.obj.y = obs.y;

          // Collision check (obstacle reaches truck zone)
          if (obs.y > this.truckY - 30 && obs.y < this.truckY + 30 && obs.lane === this.runState!.lane) {
            // Hit!
            this.runState = applyObstacleHit(this.runState!, obs.obstacle);
            AudioManager.getInstance().playSfx('obstacle_hit');

            // Flash screen red
            const flash = this.add.rectangle(width / 2, height / 2, width, height, NEON.danger, 0.3);
            this.container.add(flash);
            this.tweens.add({
              targets: flash,
              alpha: 0, duration: 200,
              onComplete: () => flash.destroy(),
            });

            // Remove obstacle
            obs.obj.destroy();
            this.activeObstacles.splice(i, 1);

            // Check totalled
            if (isCatastrophicDamage(this.runState!)) {
              this.runState!.completed = true;
              this.runState!.outcome = 'totalled';
              this.endRun();
              return;
            }
            continue;
          }

          // Remove if past bottom
          if (obs.y > height + 50) {
            obs.obj.destroy();
            this.activeObstacles.splice(i, 1);
          }
        }

        // Spawn obstacles periodically
        if (tickCount - this.lastSpawnTick > 30 + Math.random() * 30) {
          this.spawnObstacle(width, laneWidth, roadLeft);
          this.lastSpawnTick = tickCount;
        }

        // Update HUD
        this.updateDrivingHUD(width);

        // Check completion
        this.runState = checkCompletion(this.runState!);
        if (this.runState!.completed && this.runState!.outcome !== 'totalled') {
          this.endRun();
        }
      },
      loop: true,
    });
  }

  private spawnObstacle(width: number, laneWidth: number, roadLeft: number): void {
    if (!this.runState || !this.destDef) return;

    // Random check based on obstacle frequency
    if (Math.random() > this.destDef.obstacleFrequency * 1.5) return;

    const obstacle = generateObstacle(this.destDef.destination);
    const lane = Math.floor(Math.random() * 3);
    const x = roadLeft + lane * laneWidth + laneWidth / 2;
    const y = -30;

    // Obstacle visual
    const obsEmoji = this.add.text(0, 0, obstacle.emoji, {
      fontSize: '32px',
    }).setOrigin(0.5);

    // Smashable indicator
    let indicator: Phaser.GameObjects.Text | undefined;
    if (obstacle.smashable) {
      indicator = this.add.text(0, 22, '💥', {
        fontSize: '12px',
      }).setOrigin(0.5);
    }

    const children: Phaser.GameObjects.GameObject[] = [obsEmoji];
    if (indicator) children.push(indicator);
    const obsContainer = this.add.container(x, y, children);
    this.container.add(obsContainer);

    this.activeObstacles.push({
      obj: obsContainer,
      lane,
      obstacle,
      y,
    });
  }

  private updateDrivingHUD(width: number): void {
    // Simple approach: re-render just the progress bar by updating
    // We'll use a lightweight approach - just the text overlays
    // Full re-render is expensive, so we only update on completion
  }

  private endRun(): void {
    this.cleanupDriving();

    // Brief pause then show results
    this.time.delayedCall(500, () => {
      AudioManager.getInstance().playSfx('supply_complete');
      this.phase = 'results';
      this.renderView();
    });
  }

  // ── Results Screen ─────────────────────────────────────────

  private renderResults(width: number, height: number): void {
    if (!this.runState || !this.destDef) return;

    const rewards = calculateSupplyRewards(this.runState);
    const totalled = this.runState.outcome === 'totalled';

    // Title
    this.container.add(
      createPillTitle(this, width / 2, 50,
        totalled ? '💥 TOTALLED!' : rewards.perfectRun ? '🌟 PERFECT RUN!' : '🏁 RUN COMPLETE!', {
        bgColour: totalled ? NEON.danger : rewards.perfectRun ? NEON.success : NEON.accent,
        fontSize: '24px',
      })
    );

    // Destination
    this.container.add(
      this.add.text(width / 2, 95, `${this.destDef.emoji} ${this.destDef.label}`, {
        fontSize: '16px', fontFamily: FONTS.body, color: NEON.textDim,
      }).setOrigin(0.5)
    );

    // Stats
    const statsY = 135;
    const stats = [
      { label: '💰 Earnings', value: `${rewards.earnings} coins`, colour: '#ffd700' },
      { label: '💥 Obstacles Smashed', value: `${this.runState.obstaclesDestroyed}`, colour: '#ff6600' },
      { label: '🔧 Total Damage', value: `${this.runState.damages.reduce((s, d) => s + d.severity, 0)}%`, colour: totalled ? '#ff2244' : '#00ff88' },
      { label: '⏱️ Time', value: `${(this.runState.timeTakenMs / 1000).toFixed(1)}s`, colour: NEON.text },
    ];

    stats.forEach((stat, i) => {
      const y = statsY + i * 35;
      this.container.add(
        this.add.text(width / 2 - 100, y, stat.label, {
          fontSize: '15px', fontFamily: FONTS.body, color: NEON.textDim,
        }).setOrigin(0, 0.5)
      );
      this.container.add(
        this.add.text(width / 2 + 100, y, stat.value, {
          fontSize: '17px', fontFamily: FONTS.title, fontStyle: 'bold',
          color: stat.colour,
        }).setOrigin(1, 0.5)
      );
    });

    // Bonuses
    if (rewards.bonuses.length > 0) {
      const bonusY = statsY + stats.length * 35 + 15;
      rewards.bonuses.forEach((bonus, i) => {
        this.container.add(
          this.add.text(width / 2, bonusY + i * 22, `⭐ ${bonus}`, {
            fontSize: '14px', fontFamily: FONTS.body,
            color: bonus.includes('No Earnings') ? '#ff2244' : '#ffd700',
          }).setOrigin(0.5)
        );
      });
    }

    // Damage breakdown
    if (this.runState.damages.length > 0) {
      const dmgY = height - 200;
      const totalDmg = this.runState.damages.reduce((s, d) => s + d.severity, 0);

      // Damage bar
      this.container.add(
        this.add.rectangle(width / 2, dmgY, width - 80, 16, 0x222244).setOrigin(0.5)
      );
      const dmgBarW = Math.min(1, totalDmg / 100) * (width - 80);
      this.container.add(
        this.add.rectangle(width / 2 - (width - 80) / 2, dmgY, dmgBarW, 16,
          totalDmg > 60 ? NEON.danger : totalDmg > 30 ? NEON.accent : NEON.success
        ).setOrigin(0, 0.5)
      );

      // Damage category
      const matched = DAMAGE_THRESHOLDS.filter((t) => totalDmg >= t.threshold);
      if (matched.length > 0) {
        const worst = matched[matched.length - 1];
        this.container.add(
          this.add.text(width / 2, dmgY + 18, `${worst.emoji} ${worst.label}`, {
            fontSize: '13px', fontFamily: FONTS.body, color: NEON.textDim,
          }).setOrigin(0.5)
        );
      }
    }

    // Star burst for perfect run
    if (rewards.perfectRun) {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const star = this.add.text(
          width / 2 + Math.cos(angle) * 100,
          50 + Math.sin(angle) * 30,
          '⭐', { fontSize: '18px' }
        ).setOrigin(0.5).setAlpha(0);
        this.container.add(star);
        this.tweens.add({
          targets: star,
          alpha: 1, scale: { from: 0.3, to: 1.3 },
          duration: 400, delay: i * 80,
          yoyo: true, repeat: -1, hold: 600,
        });
      }
    }

    // Buttons
    this.container.add(
      createButton(this, width / 2, height - 85, '🚛 Drive Again', () => {
        this.phase = 'destination_select';
        this.renderView();
      }, { width: 200, bgColour: '#ff6600' })
    );

    this.container.add(
      createButton(this, width / 2, height - 35, '✅ Back to Centre', () => {
        this.scene.start('GameScene');
      }, { width: 200 })
    );
  }
}
