import Phaser from 'phaser';
import { COLOURS, FONTS } from '../ui/constants';
import { createButton } from '../ui/UIButton';
import { AudioManager } from '../audio/AudioManager';
import type { Economy } from '@arc/shared-types';
import {
  createDriveState,
  shiftLane,
  changeSpeed,
  speedLabel,
  speedScrollRate,
  NUM_LANES,
  MAX_SPEED_STEP,
  type DriveState,
  type DriveType,
} from '../driving/drive-state';
import {
  drawTopDownRoad,
  drawTopDownVan,
  roadGeometry,
  laneCentreX,
} from '../driving/drive-render';

/** Decorative (non-consequential) other road user, drifting down as we pass. */
interface TrafficCar {
  gfx: Phaser.GameObjects.Graphics;
  lane: number;
  y: number;
  speed: number; // how much slower than us it travels (relative drift factor)
}

export interface PtvDriveInit {
  driveType?: DriveType;
  destinationId?: string;
  level?: number;
  economy?: Economy;
  weather?: string;
  /** Scene to return to on exit. Omitted in standalone/demo boots. */
  returnTo?: string;
}

/**
 * PtvDriveScene — the hybrid-camera PTV drive.
 *
 * Slice 1: top-down travel mode only. A gentle daylight bird's-eye road, the
 * van fixed near the lower third while the world scrolls past, snap lane
 * changes, discrete speed steps, and a couple of decorative other vehicles.
 * No events, cab, or cargo yet — those arrive in Slices 2+.
 */
export class PtvDriveScene extends Phaser.Scene {
  private container!: Phaser.GameObjects.Container;
  private drive!: DriveState;
  private returnTo?: string;

  // Travel-mode render state
  private roadGfx?: Phaser.GameObjects.Graphics;
  private vanGfx?: Phaser.GameObjects.Graphics;
  private traffic: TrafficCar[] = [];
  private scrollY = 0;
  private driveTimer?: Phaser.Time.TimerEvent;
  private laneTween?: Phaser.Tweens.Tween;

  // Van geometry (set in renderView from canvas size)
  private vanY = 0;
  private vanW = 46;
  private vanH = 74;

  // HUD
  private speedLabelText?: Phaser.GameObjects.Text;
  private speedPips: Phaser.GameObjects.Arc[] = [];

  // Input
  private keys?: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super({ key: 'PtvDriveScene' });
  }

  init(data?: PtvDriveInit): void {
    this.drive = createDriveState({
      driveType: data?.driveType,
      destinationId: data?.destinationId,
      weather: data?.weather,
    });
    this.returnTo = data?.returnTo;
    this.scrollY = 0;
    this.traffic = [];
    this.speedPips = [];
    this.roadGfx = undefined;
    this.vanGfx = undefined;
    this.laneTween = undefined;
    this.speedLabelText = undefined;
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    // Reuse the journey/"adventure" track until a dedicated PTV track lands.
    audio.playSceneMusic('walk');

    this.container = this.add.container(0, 0);
    this.renderView();

    this.events.on('shutdown', () => this.cleanup());
  }

  private cleanup(): void {
    if (this.driveTimer) { this.driveTimer.destroy(); this.driveTimer = undefined; }
    if (this.laneTween) { this.laneTween.stop(); this.laneTween = undefined; }
    if (this.keys) {
      for (const k of Object.values(this.keys)) {
        k.removeAllListeners();
        this.input.keyboard?.removeKey(k);
      }
      this.keys = undefined;
    }
  }

  private renderView(): void {
    this.cleanup();
    this.container.removeAll(true);
    this.traffic = [];
    this.speedPips = [];

    const { width, height } = this.scale;

    // Road (redrawn every tick).
    this.roadGfx = this.add.graphics();
    this.container.add(this.roadGfx);

    // Decorative traffic sits between road and van in the draw order.
    this.spawnInitialTraffic(width, height);

    // The van — fixed near the lower third, pointing up (direction of travel).
    // A warm ARC cream body so it reads as "ours" against the grey tarmac.
    this.vanY = height * 0.72;
    this.vanGfx = this.add.graphics();
    drawTopDownVan(this.vanGfx, this.vanW, this.vanH, 0xf3ede0);
    const geo = roadGeometry(width);
    this.vanGfx.setPosition(laneCentreX(geo, this.drive.lane), this.vanY);
    this.vanGfx.setDepth(20);
    this.container.add(this.vanGfx);

    this.renderHud(width, height);
    this.setupInput(width, height);
    this.startDriveLoop();

    // First paint so the road shows before the first tick.
    drawTopDownRoad(this.roadGfx, width, height, this.scrollY);
  }

  // ── Decorative traffic ─────────────────────────────────────

  private spawnInitialTraffic(width: number, height: number): void {
    const geo = roadGeometry(width);
    const hues = [0xd08a6a, 0x6a9fd0, 0x86b878];
    const placements = [
      { lane: 0, y: height * 0.15 },
      { lane: 2, y: height * 0.34 },
      { lane: 1, y: -height * 0.1 },
    ];
    placements.forEach((p, i) => {
      const gfx = this.add.graphics();
      drawTopDownVan(gfx, this.vanW - 6, this.vanH - 10, hues[i % hues.length]);
      gfx.setPosition(laneCentreX(geo, p.lane), p.y);
      gfx.setDepth(15);
      this.container.add(gfx);
      this.traffic.push({ gfx, lane: p.lane, y: p.y, speed: 0.45 + i * 0.12 });
    });
  }

  // ── HUD ────────────────────────────────────────────────────

  private renderHud(width: number, height: number): void {
    // Title pill (top).
    const titlePill = this.add.container(width / 2, 34);
    const t = this.add.text(0, 0, 'Practice Drive', {
      fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.white,
    }).setOrigin(0.5);
    const pad = 18;
    const bg = this.add.graphics();
    bg.fillStyle(0x3d8a2e, 0.92);
    bg.fillRoundedRect(-t.width / 2 - pad, -18, t.width + pad * 2, 36, 18);
    titlePill.add([bg, t]);
    titlePill.setDepth(40);
    this.container.add(titlePill);

    // Back / exit button (top-left).
    this.container.add(
      createButton(this, 54, 34, 'Back', () => this.exit(), {
        width: 88, bgColour: COLOURS.warm,
      }).setDepth(40)
    );

    // Speed control bar (bottom).
    const barY = height - 46;

    // Speed label + pips centred.
    this.speedLabelText = this.add.text(width / 2, barY - 26, speedLabel(this.drive.speedStep), {
      fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
    }).setOrigin(0.5).setDepth(40);
    this.container.add(this.speedLabelText);

    for (let i = 0; i <= MAX_SPEED_STEP; i++) {
      const pip = this.add.circle(width / 2 - 20 + i * 20, barY - 4, 6, 0xcdbfa8).setDepth(40);
      this.speedPips.push(pip);
      this.container.add(pip);
    }
    this.updateSpeedHud();

    // − Slower / Faster + buttons.
    this.container.add(
      createButton(this, width / 2 - 96, barY, 'Slower', () => this.nudgeSpeed(-1), {
        width: 120, bgColour: COLOURS.info,
      }).setDepth(40)
    );
    this.container.add(
      createButton(this, width / 2 + 96, barY, 'Faster', () => this.nudgeSpeed(1), {
        width: 120, bgColour: COLOURS.primary,
      }).setDepth(40)
    );

    // Gentle hint.
    this.container.add(
      this.add.text(width / 2, height - 12, 'Tap left or right to change lane', {
        fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5).setDepth(40)
    );
  }

  private updateSpeedHud(): void {
    this.speedLabelText?.setText(speedLabel(this.drive.speedStep));
    this.speedPips.forEach((pip, i) => {
      pip.setFillStyle(i <= this.drive.speedStep ? 0x3d8a2e : 0xcdbfa8);
    });
  }

  // ── Input ──────────────────────────────────────────────────

  private setupInput(width: number, height: number): void {
    const kb = this.input.keyboard;
    if (kb) {
      this.keys = {
        left: kb.addKey('LEFT'),
        right: kb.addKey('RIGHT'),
        up: kb.addKey('UP'),
        down: kb.addKey('DOWN'),
        a: kb.addKey('A'),
        d: kb.addKey('D'),
      };
      this.keys.left.on('down', () => this.moveLane(-1));
      this.keys.a.on('down', () => this.moveLane(-1));
      this.keys.right.on('down', () => this.moveLane(1));
      this.keys.d.on('down', () => this.moveLane(1));
      this.keys.up.on('down', () => this.nudgeSpeed(1));
      this.keys.down.on('down', () => this.nudgeSpeed(-1));
    }

    // Lane tap zones — left / right halves of the upper driving area only,
    // leaving the bottom speed bar untouched.
    const zoneH = height - 120;
    const leftZone = this.add.rectangle(width * 0.25, zoneH / 2, width * 0.5, zoneH, 0xffffff, 0)
      .setInteractive();
    leftZone.on('pointerdown', () => this.moveLane(-1));
    this.container.add(leftZone);

    const rightZone = this.add.rectangle(width * 0.75, zoneH / 2, width * 0.5, zoneH, 0xffffff, 0)
      .setInteractive();
    rightZone.on('pointerdown', () => this.moveLane(1));
    this.container.add(rightZone);
  }

  private moveLane(dir: -1 | 1): void {
    const next = shiftLane(this.drive.lane, dir);
    if (next === this.drive.lane) return;
    this.drive.lane = next;
    AudioManager.getInstance().playSfx('button_click');

    const geo = roadGeometry(this.scale.width);
    const targetX = laneCentreX(geo, next);
    if (this.laneTween) this.laneTween.stop();
    if (this.vanGfx) {
      this.laneTween = this.tweens.add({
        targets: this.vanGfx,
        x: targetX,
        duration: 120,
        ease: 'Sine.easeOut',
      });
    }
  }

  private nudgeSpeed(dir: -1 | 1): void {
    const next = changeSpeed(this.drive.speedStep, dir);
    if (next === this.drive.speedStep) return;
    this.drive.speedStep = next;
    AudioManager.getInstance().playSfx('button_click');
    this.updateSpeedHud();
  }

  // ── Drive loop ─────────────────────────────────────────────

  private startDriveLoop(): void {
    const { width, height } = this.scale;
    this.driveTimer = this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => {
        const rate = speedScrollRate(this.drive.speedStep);
        this.scrollY += rate;

        // Redraw the road with the new scroll offset.
        if (this.roadGfx) drawTopDownRoad(this.roadGfx, width, height, this.scrollY);

        // Drift decorative traffic downward (we're overtaking them).
        const geo = roadGeometry(width);
        for (const car of this.traffic) {
          car.y += rate * car.speed;
          if (car.y > height + this.vanH) {
            // Recycle to just above the top, in a random lane.
            car.lane = Math.floor(Math.random() * NUM_LANES);
            car.y = -this.vanH - Math.random() * height * 0.4;
            car.gfx.setX(laneCentreX(geo, car.lane));
          }
          car.gfx.setY(car.y);
        }

        // Track progress along the route (not gated in Slice 1).
        this.drive.progress = Math.min(1, this.drive.progress + rate * 0.0004);
      },
    });
  }

  // ── Exit ───────────────────────────────────────────────────

  private exit(): void {
    this.cleanup();
    if (this.returnTo) {
      this.scene.start(this.returnTo);
    } else {
      // Standalone / demo boot — just restart the practice drive.
      this.scene.restart();
    }
  }
}
