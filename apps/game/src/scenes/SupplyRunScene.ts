import Phaser from 'phaser';
import { COLOURS, FONTS, TEXT_RESOLUTION, MIN_FONT, MIN_TAP, bottomAnchorY, CHROME, hexNum, TYPE } from '../ui/constants';
import {
  createChromeButton, createTextButton, createChromeTitle, createChromePlate,
} from '../ui/UIButton';
import { DRIVE_COLOURS } from '../driving/drive-render';
import { useRetinaText } from '../ui/retina-text';
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
import type { SupplyDestination, Economy } from '@arc/shared-types';
import type { SupplyRunLaneState, ObstacleDef, DestinationDef } from '@arc/game-logic';

// ── Neon colour palette (tonal shift from gentle care) ───────
/**
 * The supply run's palette — a daytime drive, not an arcade cabinet.
 *
 * This was neon on near-black: cyan text, hot pink combos, a lit-window
 * cityscape at midnight. A *fourth* visual language after the painted
 * world, the chrome surface and the old glass HUD, and the one furthest
 * from all three. A child drives here straight out of a cream corridor.
 *
 * It borrows from `DRIVE_COLOURS` rather than inventing a warm palette,
 * because the game already has a driving look — `PtvDriveScene` uses it,
 * and it is described there as tuned to the brand cream and green. Two
 * driving screens in one game should be the same road.
 *
 * The name stays short but no longer says NEON, which it would now be
 * lying about.
 */
const DRIVE = {
  /**
   * The menu and results screens sit on the game's cream, like every
   * other screen. Verge green belongs to the drive and is drawn there.
   */
  bg: hexNum(COLOURS.bg),
  road: DRIVE_COLOURS.tarmac,
  lane: DRIVE_COLOURS.laneDash,
  /** The player's lane, picked out in the brand green rather than neon. */
  laneActive: hexNum(COLOURS.primaryLight),
  /** The dashboard is chrome, like every other panel that floats. */
  hud: CHROME.fill,
  hudBorder: CHROME.stroke,
  accent: hexNum(COLOURS.warm),
  danger: hexNum(COLOURS.accent),
  success: hexNum(COLOURS.primaryDark),
  gold: hexNum(COLOURS.warmDark),
  /** Ink on the dashboard, which is cream — so ink, not cyan. */
  text: CHROME.ink,
  textWhite: CHROME.ink,
  textDim: CHROME.inkMuted,
  /** Where the hot pink was: the combo shout, in the brand red. */
  neonPink: hexNum(COLOURS.accent),
  neonBlue: hexNum(COLOURS.info),
  /** Sky, top to horizon. A clear day over Birchington. */
  skyTop: { r: 0x8f, g: 0xbe, b: 0xdc },
  skyHorizon: { r: 0xfa, g: 0xe8, b: 0xc6 },
  /** The town on the horizon, hazed by distance. */
  skyline: 0x8a9a86,
  skylineWindow: 0x6d7c6a,
};

// ── Pseudo-3D driving constants ──────────────────────────────
const ROAD_ROWS = 100;              // horizontal strips for the road
const BASE_ROAD_SPEED = 3;
const MAX_ROAD_SPEED = 7;
const COMBO_WINDOW_MS = 2000;
const MAX_VISIBLE_OBSTACLES = 8;
const BONNET_ZONE = 0.12;           // worldZ threshold for smash / collision
const STEER_SPEED = 0.04;           // per-tick playerX shift
const STEER_DECAY = 0.92;           // how fast steering centres back
const SPAWN_Z = 1.0;               // obstacles appear at the horizon

// Road colours that alternate to create the speed illusion. The pair has
// to stay close — the flicker between them is the speed, and widening the
// gap to make the road "look nicer" turns a moving road into a strobing
// one. Tarmac and a shade either side of it, per DRIVE_COLOURS.
const ROAD_DARK = DRIVE_COLOURS.tarmac;
const ROAD_LIGHT = 0x7a7e86;
// The shoulder alternates too, but quietly. Red-and-white belongs to an
// arcade cabinet; this is the warm off-white the top-down engine already
// draws its road edge in, against a sand a shade under it.
const RUMBLE_DARK = 0xd8ceae;
const RUMBLE_LIGHT = DRIVE_COLOURS.roadEdgeLine;

/** A single obstacle in the pseudo-3D world. */
interface Obstacle3D {
  worldZ: number;           // 0 = at camera, 1 = at horizon
  laneOffset: number;       // -1 = left lane, 0 = centre, 1 = right lane
  lane: number;             // 0, 1, 2
  obstacle: ObstacleDef;
  emojiText?: Phaser.GameObjects.Text;
  glowGfx?: Phaser.GameObjects.Graphics;
  labelText?: Phaser.GameObjects.Text;
  passed: boolean;          // already checked for collision
}

/**
 * SupplyRunScene — 2.5D first-person driving minigame with neon aesthetic.
 *
 * Pick a destination -> drive through obstacles from a windscreen view -> earn money.
 * Smash through smashable obstacles or dodge the dangerous ones.
 */
export class SupplyRunScene extends Phaser.Scene {
  private phase: 'destination_select' | 'driving' | 'results' = 'destination_select';
  private container!: Phaser.GameObjects.Container;
  private playerLevel = 1;

  // Run state
  private runState?: SupplyRunLaneState;
  private destDef?: DestinationDef;

  // 2.5D driving state
  private playerX = 0;             // -1 (left edge) to 1 (right edge)
  private steerInput = 0;          // current steering force
  private roadScroll = 0;          // accumulated scroll for stripe animation
  private roadGfx?: Phaser.GameObjects.Graphics;
  private obstacles3D: Obstacle3D[] = [];
  private driveTimer?: Phaser.Time.TimerEvent;
  private keys?: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  };
  private distancePerTick = 0;
  private tickCount = 0;
  private lastSpawnTick = 0;

  // Dashboard / HUD references
  private dashGfx?: Phaser.GameObjects.Graphics;
  private hudProgressBar?: Phaser.GameObjects.Rectangle;
  private hudProgressBarW = 0;
  private hudSmashText?: Phaser.GameObjects.Text;
  private hudDamageText?: Phaser.GameObjects.Text;
  private hudComboText?: Phaser.GameObjects.Text;
  private hudDestText?: Phaser.GameObjects.Text;
  private hudSpeedText?: Phaser.GameObjects.Text;

  // Sky / parallax
  private cloudTexts: Phaser.GameObjects.Text[] = [];

  // Combo system
  private comboCount = 0;
  private lastSmashTime = 0;
  private currentSpeed = BASE_ROAD_SPEED;

  // Touch steering state
  private touchSteerDir = 0;

  constructor() {
    super({ key: 'SupplyRunScene' });
  }

  private economy: Economy = { coins: 0, lifetimeEarnings: 0 };

  init(data?: { level?: number; economy?: Economy }): void {
    this.playerLevel = data?.level ?? 1;
    this.economy = data?.economy ?? { coins: 0, lifetimeEarnings: 0 };
    this.phase = 'destination_select';
    this.runState = undefined;
    this.destDef = undefined;
    this.obstacles3D = [];
    this.comboCount = 0;
    this.lastSmashTime = 0;
    this.currentSpeed = BASE_ROAD_SPEED;
    this.playerX = 0;
    this.steerInput = 0;
    this.roadScroll = 0;
    this.tickCount = 0;
    this.lastSpawnTick = 0;
    this.hudProgressBar = undefined;
    this.hudSmashText = undefined;
    this.hudDamageText = undefined;
    this.hudComboText = undefined;
    this.hudDestText = undefined;
    this.hudSpeedText = undefined;
    this.cloudTexts = [];
    this.touchSteerDir = 0;
  }

  create(): void {
    // 19 add.text calls, one of which set a resolution.
    useRetinaText(this);

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
    if (this.keys) {
      for (const k of Object.values(this.keys)) {
        k.removeAllListeners();
        this.input.keyboard?.removeKey(k);
      }
      this.keys = undefined;
    }
    this.touchSteerDir = 0;
  }

  private clearView(): void {
    this.cleanupDriving();
    this.container.removeAll(true);
    this.obstacles3D = [];
    this.roadGfx = undefined;
    this.dashGfx = undefined;
    this.cloudTexts = [];
  }

  private renderView(): void {
    this.clearView();
    const { width, height } = this.scale;

    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height, DRIVE.bg)
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
      createChromeTitle(this, width / 2, 50, 'Supply run', {
        fontSize: '28px',
        icon: 'icon-supply-run',
      })
    );

    this.container.add(
      this.add.text(width / 2, 95, 'Pick your destination and drive!', {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: DRIVE.textDim,
      }).setOrigin(0.5)
    );

    // Tyre track pattern background
    // Tyre tracks, at the weight they had — the ink changes side because
    // the ground did.
    const bgPattern = this.add.graphics();
    bgPattern.lineStyle(1.5, hexNum(COLOURS.text), 0.05);
    for (let ty = 0; ty < height; ty += 40) {
      // Left tyre track
      const wobble1 = Math.sin(ty * 0.03) * 15;
      const wobble2 = Math.sin(ty * 0.03 + 0.5) * 15;
      bgPattern.lineBetween(width * 0.3 + wobble1, ty, width * 0.3 + wobble2, ty + 40);
      bgPattern.lineBetween(width * 0.3 + wobble1 + 25, ty, width * 0.3 + wobble2 + 25, ty + 40);
      // Right tyre track
      bgPattern.lineBetween(width * 0.7 + wobble1, ty, width * 0.7 + wobble2, ty + 40);
      bgPattern.lineBetween(width * 0.7 + wobble1 + 25, ty, width * 0.7 + wobble2 + 25, ty + 40);
      // Cross-hatching on treads
      for (let tx = 0; tx < 25; tx += 6) {
        bgPattern.lineBetween(width * 0.3 + wobble1 + tx, ty + (tx % 12), width * 0.3 + wobble1 + tx + 3, ty + (tx % 12) + 8);
        bgPattern.lineBetween(width * 0.7 + wobble1 + tx, ty + (tx % 12), width * 0.7 + wobble1 + tx + 3, ty + (tx % 12) + 8);
      }
    }
    this.container.add(bgPattern);

    // Three cards of 100 at a 120 pitch from y=155 need 395px. A landscape
    // phone has 402, so the third card ran off the bottom with the Back
    // link drawn across it — the same fault the Depot's mode cards had, and
    // fixed the same way: two columns when three rows will not fit.
    //
    // The band runs from under the subtitle to above the Back button.
    const bandTop = 118;
    const bandBottom = bottomAnchorY(height) - MIN_TAP / 2 - 12;
    const cardH = 100;
    const count = SUPPLY_DESTINATIONS.length;
    const rowsFit = Math.floor((bandBottom - bandTop + 20) / (cardH + 20));
    const cols = rowsFit >= count ? 1 : 2;
    const rows = Math.ceil(count / cols);
    const colGap = 16;
    const cardW = cols === 1
      ? Math.min(width - 60, 500)
      : Math.min((width - 60 - colGap) / 2, 420);
    const gridW = cardW * cols + colGap * (cols - 1);
    const gridX = (width - gridW) / 2;
    const topGap = 12;
    const availH = bandBottom - bandTop - topGap;
    const rowPitch = rows > 1 ? Math.min(120, (availH - cardH) / (rows - 1)) : 0;
    const firstCy = bandTop + topGap + cardH / 2;

    SUPPLY_DESTINATIONS.forEach((dest, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cardX = gridX + col * (cardW + colGap);
      const cardCx = cardX + cardW / 2;
      // The card's own drawing is written around a `y` that is its centre
      // minus ten — the emoji sits at y-5 and the three text rows at
      // y-18/+5/+25 — so keep that origin rather than re-deriving five
      // offsets.
      const y = firstCy + row * rowPitch - 10;
      const unlocked = canAccessDestination(dest.destination, this.playerLevel);
      const alpha = unlocked ? 1 : 0.35;

      // A chrome plate, like every other thing in the game that floats
      // above a surface. It was 15% white glass with a cyan rim.
      const card = createChromePlate(this, cardCx, y + 10, cardW, cardH, { radius: 12 });
      card.setAlpha(alpha);
      this.container.add(card);

      // Emoji
      this.container.add(
        this.add.text(cardX + 35, y - 5, dest.emoji, {
          fontSize: '36px', fontFamily: FONTS.body
        }).setOrigin(0.5).setAlpha(alpha)
      );

      // Label
      this.container.add(
        this.add.text(cardX + 70, y - 18, dest.label, {
          fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold',
          color: unlocked ? DRIVE.textWhite : COLOURS.textLight,
        }).setOrigin(0, 0.5).setAlpha(alpha)
      );

      // Description + pay
      this.container.add(
        this.add.text(cardX + 70, y + 5, dest.description, {
          fontSize: TYPE.caption, fontFamily: FONTS.body,
          color: unlocked ? DRIVE.textDim : COLOURS.textLight,
        }).setOrigin(0, 0.5).setAlpha(alpha)
      );

      this.container.add(
        this.add.text(cardX + 70, y + 25,
          unlocked ? `Base pay: ${dest.basePay} coins  |  Distance: ${dest.distance}` : `Unlocks at level ${dest.unlockLevel}`, {
          fontSize: TYPE.caption, fontFamily: FONTS.body,
          color: unlocked ? CHROME.inkAccent : COLOURS.textLight,
        }).setOrigin(0, 0.5).setAlpha(alpha)
      );

      if (unlocked) {
        const hitArea = this.add.rectangle(cardCx, y + 10, cardW, cardH, 0xffffff, 0)
          .setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => this.startRun(dest));
        this.container.add(hitArea);
      }
    });

    this.container.add(
      createTextButton(this, width / 2, bottomAnchorY(height),
        '← Back to centre', () => {
          this.scene.start('GameScene');
        })
    );
  }

  // ── Start Drive ────────────────────────────────────────────

  private startRun(dest: DestinationDef): void {
    this.destDef = dest;
    this.runState = startSupplyRun(dest.destination, false);
    this.distancePerTick = dest.distance / 200;
    this.phase = 'driving';
    this.renderView();
  }

  // ── 2.5D Driving Mode ─────────────────────────────────────

  private renderDrivingMode(width: number, height: number): void {
    if (!this.runState || !this.destDef) return;

    // Layout zones
    const horizonY = Math.floor(height * 0.28);
    const dashboardH = Math.floor(height * 0.22);
    const dashboardTop = height - dashboardH;

    // Sky gradient (static background)
    this.renderSky(width, horizonY);

    // Road graphics object (redrawn each frame)
    this.roadGfx = this.add.graphics();
    this.container.add(this.roadGfx);

    // Dashboard overlay (static, drawn once)
    this.renderDashboard(width, height, dashboardTop, dashboardH);

    // Controls hint
    this.container.add(
      // Cream, not the chrome's muted ink: this line sits on the tarmac,
      // not on the dashboard, and #6b5a4a on #6b6f76 measures 1.2:1 — it
      // was there and unreadable rather than absent, which is worse.
      this.add.text(width / 2, dashboardTop - 8,
        '← → steer  |  SPACE smash!', {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.bg,
      }).setOrigin(0.5, 1).setAlpha(0.9)
    );

    // Setup input
    this.setupKeyboard25D();
    this.setupTouchControls25D(width, height, dashboardTop);

    // Start the drive loop
    this.startDriveLoop25D(width, height, horizonY, dashboardTop);
  }

  private renderSky(width: number, horizonY: number): void {
    const skyGfx = this.add.graphics();
    const strips = 30;
    const stripH = Math.ceil(horizonY / strips);
    // Clear blue overhead, warming to the game's cream at the horizon —
    // the same gradient a painted daytime sky makes, and the reverse of
    // the navy-to-purple night this used to be.
    const { skyTop: a, skyHorizon: b } = DRIVE;
    for (let i = 0; i < strips; i++) {
      const t = i / strips;
      const r = Math.round(a.r + (b.r - a.r) * t);
      const g = Math.round(a.g + (b.g - a.g) * t);
      const bl = Math.round(a.b + (b.b - a.b) * t);
      skyGfx.fillStyle((r << 16) | (g << 8) | bl, 1);
      skyGfx.fillRect(0, i * stripH, width, stripH + 1);
    }

    // Haze along the horizon, where the sunset glow was.
    skyGfx.fillStyle(hexNum(COLOURS.bg), 0.35);
    skyGfx.fillRect(0, horizonY - 20, width, 25);
    this.container.add(skyGfx);

    // Silhouette cityscape on horizon
    const buildingGfx = this.add.graphics();
    buildingGfx.fillStyle(DRIVE.skyline, 1);
    const buildings = [
      { x: 0, w: 60, h: 35 }, { x: 55, w: 40, h: 55 }, { x: 90, w: 30, h: 25 },
      { x: 130, w: 50, h: 45 }, { x: 175, w: 35, h: 30 }, { x: 220, w: 55, h: 65 },
      { x: 270, w: 25, h: 20 }, { x: 310, w: 45, h: 50 }, { x: 350, w: 60, h: 35 },
      { x: 405, w: 30, h: 40 }, { x: 440, w: 50, h: 55 }, { x: 485, w: 35, h: 25 },
    ];
    // Repeat buildings across the full width
    for (let startX = 0; startX < width; startX += 520) {
      for (const b of buildings) {
        buildingGfx.fillRect(startX + b.x, horizonY - b.h, b.w - 3, b.h);
        // Windows. Dark in daylight, not lit — a town at noon with every
        // light on is the one thing that would still read as night.
        for (let wy = horizonY - b.h + 5; wy < horizonY - 4; wy += 8) {
          for (let wx = startX + b.x + 4; wx < startX + b.x + b.w - 8; wx += 10) {
            if (Math.random() > 0.4) {
              buildingGfx.fillStyle(DRIVE.skylineWindow, 0.5 + Math.random() * 0.3);
              buildingGfx.fillRect(wx, wy, 5, 4);
              buildingGfx.fillStyle(DRIVE.skyline, 1);
            }
          }
        }
      }
    }
    this.container.add(buildingGfx);

    // Parallax clouds — bigger, more visible
    const cloudGfx = this.add.graphics();
    for (let i = 0; i < 6; i++) {
      const cx = width * 0.08 + (i / 5) * width * 0.84;
      const cy = 20 + (i % 3) * 25 + Math.random() * 20;
      const cw = 40 + Math.random() * 50;
      const ch = 15 + Math.random() * 10;
      // Cloud, and now actually visible: white at 6% on a night sky was
      // barely there, and on a blue one it is a cloud.
      cloudGfx.fillStyle(0xffffff, 0.45 + Math.random() * 0.2);
      cloudGfx.fillEllipse(cx, cy, cw, ch);
      cloudGfx.fillEllipse(cx - cw * 0.25, cy + 3, cw * 0.6, ch * 0.7);
      cloudGfx.fillEllipse(cx + cw * 0.3, cy + 2, cw * 0.5, ch * 0.8);
    }
    this.container.add(cloudGfx);
    // Keep cloudTexts empty since we use graphics now
    this.cloudTexts = [];
  }

  private renderDashboard(width: number, _height: number, dashTop: number, dashH: number): void {
    if (!this.runState || !this.destDef) return;

    // Semi-transparent dark panel
    this.dashGfx = this.add.graphics();
    // Cream, with the chrome hairline along its top edge. It was a
    // near-black panel with a cyan rule and a pink one under it.
    this.dashGfx.fillStyle(DRIVE.hud, CHROME.fillAlpha);
    this.dashGfx.fillRect(0, dashTop, width, dashH);
    this.dashGfx.lineStyle(CHROME.strokeWidth, DRIVE.hudBorder, CHROME.strokeAlpha);
    this.dashGfx.lineBetween(0, dashTop, width, dashTop);
    this.container.add(this.dashGfx);

    const row1Y = dashTop + 10;
    const row2Y = dashTop + 28;
    const row3Y = dashTop + 46;

    // Row 1: destination + progress bar
    this.hudDestText = this.add.text(10, row1Y, `${this.destDef.emoji} ${this.destDef.label}`, {
      fontSize: '16px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: DRIVE.text,
    }).setOrigin(0, 0);
    this.container.add(this.hudDestText);

    // Progress bar track
    this.hudProgressBarW = width * 0.35;
    const barX = width - 10 - this.hudProgressBarW;
    this.container.add(
      this.add.rectangle(barX, row1Y + 8, this.hudProgressBarW, 12, hexNum(COLOURS.bgDark)).setOrigin(0, 0.5)
    );
    const barBorder = this.add.graphics();
    barBorder.lineStyle(1, DRIVE.hudBorder, CHROME.strokeAlpha);
    barBorder.strokeRect(barX, row1Y + 2, this.hudProgressBarW, 12);
    this.container.add(barBorder);
    this.hudProgressBar = this.add.rectangle(barX, row1Y + 8, 1, 12, DRIVE.laneActive).setOrigin(0, 0.5);
    this.container.add(this.hudProgressBar);

    // Row 2: smash counter, combo, damage
    this.hudSmashText = this.add.text(10, row2Y, '0 smashed', {
      fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold', color: CHROME.inkAccent,
    }).setOrigin(0, 0);
    this.container.add(this.hudSmashText);

    this.hudComboText = this.add.text(width / 2, row2Y, '', {
      fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold', color: CHROME.inkDanger,
    }).setOrigin(0.5, 0).setAlpha(0);
    this.container.add(this.hudComboText);

    this.hudDamageText = this.add.text(width - 10, row2Y, '0%', {
      fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold', color: CHROME.inkAccent,
    }).setOrigin(1, 0);
    this.container.add(this.hudDamageText);

    // Steering wheel indicator (drawn as arc)
    const wheelGfx = this.add.graphics();
    wheelGfx.lineStyle(3, hexNum(COLOURS.textLight), 0.5);
    wheelGfx.strokeCircle(width / 2, row3Y + 10, 14);
    wheelGfx.lineStyle(2, hexNum(COLOURS.textLight), 0.7);
    wheelGfx.lineBetween(width / 2 - 10, row3Y + 10, width / 2 + 10, row3Y + 10);
    wheelGfx.lineBetween(width / 2, row3Y, width / 2, row3Y + 20);
    this.container.add(wheelGfx);
    // Repurpose hudSpeedText as the steering position indicator dot
    this.hudSpeedText = this.add.text(width / 2, row3Y + 10, '●', {
      fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.title, color: CHROME.ink,
    }).setOrigin(0.5);
    this.container.add(this.hudSpeedText);
  }

  // ── Road rendering (pseudo-3D) ────────────────────────────

  private drawRoad(width: number, _height: number, horizonY: number, dashTop: number): void {
    const gfx = this.roadGfx;
    if (!gfx) return;
    gfx.clear();

    const roadBottom = dashTop;
    const roadHeight = roadBottom - horizonY;
    const rowH = roadHeight / ROAD_ROWS;
    const cx = width / 2;

    // Vanishing point offset from steering
    const vpOffsetX = -this.playerX * width * 0.12;

    // Road scroll for the alternating stripe animation
    const stripePhase = Math.floor(this.roadScroll) % 8;

    for (let i = 0; i < ROAD_ROWS; i++) {
      const depth = i / ROAD_ROWS; // 0 = near (bottom), 1 = far (top)
      const y = roadBottom - i * rowH;

      // Road width narrows toward horizon
      const roadW = width * 0.85 * (1 - depth * 0.75);
      // Shoulder width
      const shoulderW = roadW * 0.08;

      // Center offset (slight parallax from steering)
      const rowCx = cx + vpOffsetX * depth;

      // Alternating stripes for speed illusion
      const stripeIdx = (i + stripePhase) % 4;
      const isLight = stripeIdx < 2;

      // Draw grass / off-road
      // Verge green, the two shades the top-down engine uses either side
      // of its road — daylight grass, where this was night-black scrub.
      const grassColour = isLight ? DRIVE_COLOURS.skyGrass : DRIVE_COLOURS.vergeEdge;
      gfx.fillStyle(grassColour, 1);
      gfx.fillRect(0, y, width, rowH + 1);

      // Draw rumble strips (road shoulder)
      const rumbleColour = isLight ? RUMBLE_LIGHT : RUMBLE_DARK;
      gfx.fillStyle(rumbleColour, 1);
      gfx.fillRect(rowCx - roadW / 2 - shoulderW, y, shoulderW, rowH + 1);
      gfx.fillRect(rowCx + roadW / 2, y, shoulderW, rowH + 1);

      // Draw road surface
      const roadColour = isLight ? ROAD_LIGHT : ROAD_DARK;
      gfx.fillStyle(roadColour, 1);
      gfx.fillRect(rowCx - roadW / 2, y, roadW, rowH + 1);

      // Lane markings (two dashed lines dividing into 3 lanes)
      if (isLight && depth < 0.95) {
        const markW = Math.max(1, 2 * (1 - depth));
        const markAlpha = 0.6 * (1 - depth * 0.5);
        gfx.fillStyle(DRIVE_COLOURS.laneDash, markAlpha);
        // Left lane divider
        const laneW = roadW / 3;
        gfx.fillRect(rowCx - roadW / 2 + laneW - markW / 2, y, markW, rowH + 1);
        // Right lane divider
        gfx.fillRect(rowCx - roadW / 2 + laneW * 2 - markW / 2, y, markW, rowH + 1);
      }

      // Neon road edges
      if (depth < 0.9) {
        const edgeAlpha = 0.5 * (1 - depth);
        const edgeW = Math.max(1, 3 * (1 - depth));
        // Left edge: neon pink
        gfx.fillStyle(DRIVE.neonPink, edgeAlpha);
        gfx.fillRect(rowCx - roadW / 2 - edgeW, y, edgeW, rowH + 1);
        // Right edge: neon cyan
        gfx.fillStyle(DRIVE.neonBlue, edgeAlpha);
        gfx.fillRect(rowCx + roadW / 2, y, edgeW, rowH + 1);
      }
    }

    // Roadside posts/poles for depth perception
    for (let i = 0; i < ROAD_ROWS; i += 6) {
      const depth = i / ROAD_ROWS;
      if (depth > 0.92) continue;
      const y = roadBottom - i * rowH;
      const roadW = width * 0.85 * (1 - depth * 0.75);
      const rowCx = cx + vpOffsetX * depth;
      const poleH = Math.max(3, 20 * (1 - depth));
      const poleW = Math.max(1, 3 * (1 - depth));
      const poleAlpha = 0.6 * (1 - depth * 0.7);

      // Left pole
      gfx.fillStyle(DRIVE_COLOURS.laneDash, poleAlpha);
      gfx.fillRect(rowCx - roadW / 2 - poleW * 3, y - poleH, poleW, poleH);
      // Reflector on pole
      gfx.fillStyle(DRIVE.neonPink, poleAlpha * 0.8);
      gfx.fillRect(rowCx - roadW / 2 - poleW * 3, y - poleH, poleW, Math.max(1, poleW));

      // Right pole
      gfx.fillStyle(DRIVE_COLOURS.laneDash, poleAlpha);
      gfx.fillRect(rowCx + roadW / 2 + poleW * 2, y - poleH, poleW, poleH);
      gfx.fillStyle(DRIVE.neonBlue, poleAlpha * 0.8);
      gfx.fillRect(rowCx + roadW / 2 + poleW * 2, y - poleH, poleW, Math.max(1, poleW));
    }
  }

  // ── Obstacle projection ───────────────────────────────────

  private projectObstacle(
    obs: Obstacle3D, width: number, _height: number, horizonY: number, dashTop: number
  ): { x: number; y: number; scale: number; visible: boolean } {
    const roadBottom = dashTop;
    const depth = obs.worldZ; // 0 = near, 1 = far

    if (depth < -0.05 || depth > 1.05) {
      return { x: 0, y: 0, scale: 0, visible: false };
    }

    const clampedDepth = Math.max(0, Math.min(1, depth));
    const screenY = roadBottom - (clampedDepth * (roadBottom - horizonY));

    // Scale: large at near, small at far
    const scale = Math.max(0.1, 1 - clampedDepth * 0.85);

    // Road width at this depth
    const roadW = width * 0.85 * (1 - clampedDepth * 0.75);
    const vpOffsetX = -this.playerX * width * 0.12;
    const rowCx = width / 2 + vpOffsetX * clampedDepth;

    // Lane position: map laneOffset (-1, 0, 1) to X within road
    const laneW = roadW / 3;
    const x = rowCx + obs.laneOffset * laneW;

    return { x, y: screenY, scale, visible: true };
  }

  // ── Input ──────────────────────────────────────────────────

  private setupKeyboard25D(): void {
    const kb = this.input.keyboard;
    if (!kb) return;

    this.keys = {
      left: kb.addKey('LEFT'),
      right: kb.addKey('RIGHT'),
      space: kb.addKey('SPACE'),
      a: kb.addKey('A'),
      d: kb.addKey('D'),
    };

    this.keys.space.on('down', () => this.trySmash());
  }

  private setupTouchControls25D(width: number, _height: number, dashTop: number): void {
    // Left third = steer left, right third = steer right, center third = smash
    const zoneH = dashTop;
    const zoneW = Math.floor(width / 3);

    const leftZone = this.add.rectangle(zoneW / 2, zoneH / 2, zoneW, zoneH, 0xffffff, 0)
      .setInteractive();
    leftZone.on('pointerdown', () => { this.touchSteerDir = -1; });
    leftZone.on('pointerup', () => { if (this.touchSteerDir === -1) this.touchSteerDir = 0; });
    leftZone.on('pointerout', () => { if (this.touchSteerDir === -1) this.touchSteerDir = 0; });
    this.container.add(leftZone);

    const rightZone = this.add.rectangle(width - zoneW / 2, zoneH / 2, zoneW, zoneH, 0xffffff, 0)
      .setInteractive();
    rightZone.on('pointerdown', () => { this.touchSteerDir = 1; });
    rightZone.on('pointerup', () => { if (this.touchSteerDir === 1) this.touchSteerDir = 0; });
    rightZone.on('pointerout', () => { if (this.touchSteerDir === 1) this.touchSteerDir = 0; });
    this.container.add(rightZone);

    const centerZone = this.add.rectangle(width / 2, zoneH / 2, zoneW, zoneH, 0xffffff, 0)
      .setInteractive();
    centerZone.on('pointerdown', () => this.trySmash());
    this.container.add(centerZone);
  }

  private updateSteering(): void {
    // Keyboard continuous steering
    let dir = 0;
    if (this.keys) {
      if (this.keys.left.isDown || this.keys.a.isDown) dir = -1;
      if (this.keys.right.isDown || this.keys.d.isDown) dir = 1;
    }
    // Touch override
    if (this.touchSteerDir !== 0) dir = this.touchSteerDir;

    if (dir !== 0) {
      this.steerInput = dir * STEER_SPEED;
    } else {
      this.steerInput *= STEER_DECAY;
      if (Math.abs(this.steerInput) < 0.001) this.steerInput = 0;
    }

    this.playerX += this.steerInput;
    this.playerX = Math.max(-1, Math.min(1, this.playerX));

    // Update the lane in game logic based on playerX
    if (this.runState) {
      let targetLane: number;
      if (this.playerX < -0.33) targetLane = 0;
      else if (this.playerX > 0.33) targetLane = 2;
      else targetLane = 1;

      if (targetLane !== this.runState.lane) {
        const direction = targetLane > this.runState.lane ? 1 : -1;
        this.runState = changeLane(this.runState, direction as -1 | 1);
      }
    }
  }

  // ── Smash ──────────────────────────────────────────────────

  private trySmash(): void {
    if (!this.runState || this.runState.completed) return;

    // Find an obstacle in the bonnet zone AND the player's current lane
    const hitIdx = this.obstacles3D.findIndex(
      (o) => !o.passed && o.worldZ >= -0.02 && o.worldZ <= BONNET_ZONE && o.lane === this.runState!.lane
    );

    if (hitIdx >= 0) {
      const obs = this.obstacles3D[hitIdx];
      if (obs.obstacle.smashable) {
        // Combo tracking
        const now = this.time.now;
        if (now - this.lastSmashTime < COMBO_WINDOW_MS) {
          this.comboCount++;
        } else {
          this.comboCount = 1;
        }
        this.lastSmashTime = now;

        const comboMultiplier = this.comboCount >= 8 ? 4 : this.comboCount >= 5 ? 3 : this.comboCount >= 3 ? 2 : 1;

        this.runState = applySmash(this.runState, obs.obstacle);
        if (comboMultiplier > 1) {
          this.runState.score += obs.obstacle.scoreOnSmash * (comboMultiplier - 1);
        }
        AudioManager.getInstance().playSfx('obstacle_smash');

        // Score popup
        const { width, height } = this.scale;
        const horizonY = Math.floor(height * 0.28);
        const dashTop = height - Math.floor(height * 0.22);
        const proj = this.projectObstacle(obs, width, height, horizonY, dashTop);

        const scoreStr = comboMultiplier > 1
          ? `+${obs.obstacle.scoreOnSmash * comboMultiplier} x${comboMultiplier}`
          : `+${obs.obstacle.scoreOnSmash}`;
        const popupColour = comboMultiplier >= 3 ? CHROME.inkDanger
          : comboMultiplier >= 2 ? COLOURS.warm : CHROME.inkAccent;

        const popup = this.add.text(proj.x, proj.y, scoreStr, {
          fontSize: comboMultiplier > 1 ? '24px' : '20px',
          fontFamily: FONTS.title, fontStyle: 'bold',
          color: popupColour,
          shadow: { offsetX: 0, offsetY: 0, color: popupColour, blur: 8, fill: true },
        }).setOrigin(0.5);
        this.container.add(popup);
        this.tweens.add({
          targets: popup,
          y: popup.y - 50, alpha: 0, scale: 1.3,
          duration: 600,
          ease: 'Sine.easeOut',
          onComplete: () => popup.destroy(),
        });

        // Debris particles
        const debrisColours = [hexNum(COLOURS.warm), hexNum(COLOURS.warmDark), hexNum(COLOURS.primary)];
        for (let p = 0; p < 4; p++) {
          const particle = this.add.circle(
            proj.x + (Math.random() - 0.5) * 30,
            proj.y,
            4 + Math.random() * 4,
            debrisColours[Math.floor(Math.random() * debrisColours.length)]
          );
          this.container.add(particle);
          this.tweens.add({
            targets: particle,
            x: particle.x + (Math.random() - 0.5) * 80,
            y: particle.y - 30 - Math.random() * 40,
            alpha: 0, scale: 0.3,
            duration: 350 + Math.random() * 200,
            onComplete: () => particle.destroy(),
          });
        }

        // Screen shake on big combos
        if (comboMultiplier >= 3) {
          this.cameras.main.shake(120, 0.005);
        }

        // Remove obstacle visuals
        this.destroyObstacleVisuals(obs);
        obs.passed = true;
        this.obstacles3D.splice(hitIdx, 1);
      }
    }
  }

  // ── Drive loop ─────────────────────────────────────────────

  private startDriveLoop25D(width: number, height: number, horizonY: number, dashTop: number): void {
    if (!this.runState) return;

    this.driveTimer = this.time.addEvent({
      delay: 50,
      callback: () => {
        if (!this.runState || this.runState.completed) return;

        this.tickCount++;
        this.runState = advanceDistance(this.runState, this.distancePerTick);
        this.runState.timeTakenMs += 50;

        // Update steering
        this.updateSteering();

        // Speed ramp
        const progress = Math.min(1, this.runState.distanceCovered / this.runState.distance);
        this.currentSpeed = BASE_ROAD_SPEED + (MAX_ROAD_SPEED - BASE_ROAD_SPEED) * progress;

        // Scroll the road stripes
        this.roadScroll += this.currentSpeed * 0.3;

        // Move obstacles toward camera
        const zSpeed = this.currentSpeed * 0.012;
        for (let i = this.obstacles3D.length - 1; i >= 0; i--) {
          const obs = this.obstacles3D[i];
          obs.worldZ -= zSpeed;

          // Auto-collision: obstacle reaches camera and wasn't smashed
          if (!obs.passed && obs.worldZ <= 0 && obs.lane === this.runState!.lane) {
            obs.passed = true;
            if (!obs.obstacle.smashable || obs.obstacle.damageOnHit > 0) {
              this.runState = applyObstacleHit(this.runState!, obs.obstacle);
              AudioManager.getInstance().playSfx('obstacle_hit');

              // Flash screen red
              const flash = this.add.rectangle(width / 2, height / 2, width, height, DRIVE.danger, 0.3);
              this.container.add(flash);
              this.tweens.add({
                targets: flash,
                alpha: 0, duration: 200,
                onComplete: () => flash.destroy(),
              });

              if (isCatastrophicDamage(this.runState!)) {
                this.runState!.completed = true;
                this.runState!.outcome = 'totalled';
                this.endRun();
                return;
              }
            }
          }

          // Remove obstacles that have gone well past camera
          if (obs.worldZ < -0.2) {
            this.destroyObstacleVisuals(obs);
            this.obstacles3D.splice(i, 1);
          }
        }

        // Spawn obstacles
        const spawnInterval = Math.max(15, 35 - Math.floor(progress * 20)) + Math.random() * 20;
        if (this.tickCount - this.lastSpawnTick > spawnInterval) {
          this.spawnObstacle3D();
          this.lastSpawnTick = this.tickCount;
        }

        // Draw road
        this.drawRoad(width, height, horizonY, dashTop);

        // Update obstacle visuals
        this.updateObstacleVisuals(width, height, horizonY, dashTop);

        // Parallax clouds
        for (const cloud of this.cloudTexts) {
          cloud.x += -this.steerInput * 3;
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

  // ── Obstacle spawning ──────────────────────────────────────

  private spawnObstacle3D(): void {
    if (!this.runState || !this.destDef) return;
    if (this.obstacles3D.length >= MAX_VISIBLE_OBSTACLES) return;

    if (Math.random() > this.destDef.obstacleFrequency * 1.5) return;

    const obstacle = generateObstacle(this.destDef.destination);
    const lane = Math.floor(Math.random() * 3);
    const laneOffset = lane - 1; // -1, 0, 1

    const obs: Obstacle3D = {
      worldZ: SPAWN_Z,
      laneOffset,
      lane,
      obstacle,
      passed: false,
    };

    // Create visual elements (will be positioned in updateObstacleVisuals)
    const glowGfx = this.add.graphics();
    this.container.add(glowGfx);
    obs.glowGfx = glowGfx;

    const emojiText = this.add.text(0, 0, obstacle.emoji ?? '', {
      fontSize: '34px', fontFamily: FONTS.body
    }).setOrigin(0.5).setVisible(false);
    this.container.add(emojiText);
    obs.emojiText = emojiText;

    const labelStr = obstacle.smashable ? '!' : 'X';
    const labelText = this.add.text(0, 0, labelStr, {
      fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
      color: obstacle.smashable ? CHROME.inkAccent : CHROME.inkDanger,
    }).setOrigin(0.5).setVisible(false);
    this.container.add(labelText);
    obs.labelText = labelText;

    this.obstacles3D.push(obs);
  }

  private updateObstacleVisuals(width: number, height: number, horizonY: number, dashTop: number): void {
    for (const obs of this.obstacles3D) {
      const proj = this.projectObstacle(obs, width, height, horizonY, dashTop);

      if (!proj.visible || obs.passed) {
        if (obs.emojiText) obs.emojiText.setVisible(false);
        if (obs.glowGfx) obs.glowGfx.setVisible(false);
        if (obs.labelText) obs.labelText.setVisible(false);
        continue;
      }

      const fontSize = Math.max(8, Math.floor(34 * proj.scale));

      if (obs.emojiText) {
        obs.emojiText.setPosition(proj.x, proj.y);
        obs.emojiText.setFontSize(fontSize);
        obs.emojiText.setVisible(true);
        obs.emojiText.setDepth(10 + Math.floor((1 - obs.worldZ) * 100));
      }

      if (obs.labelText) {
        const labelSize = Math.max(6, Math.floor(10 * proj.scale));
        obs.labelText.setPosition(proj.x, proj.y + fontSize * 0.5 + 2);
        obs.labelText.setFontSize(labelSize);
        obs.labelText.setVisible(proj.scale > 0.3);
        obs.labelText.setDepth(10 + Math.floor((1 - obs.worldZ) * 100));
      }

      // Glow ring
      if (obs.glowGfx) {
        obs.glowGfx.clear();
        obs.glowGfx.setVisible(true);
        obs.glowGfx.setDepth(9 + Math.floor((1 - obs.worldZ) * 100));
        const ringRadius = Math.max(6, 22 * proj.scale);
        if (obs.obstacle.smashable) {
          obs.glowGfx.fillStyle(DRIVE.laneActive, 0.15 * proj.scale);
          obs.glowGfx.fillCircle(proj.x, proj.y, ringRadius);
          obs.glowGfx.lineStyle(Math.max(1, 2 * proj.scale), DRIVE.laneActive, 0.5 * proj.scale);
          obs.glowGfx.strokeCircle(proj.x, proj.y, ringRadius);
        } else {
          obs.glowGfx.fillStyle(DRIVE.danger, 0.1 * proj.scale);
          obs.glowGfx.fillCircle(proj.x, proj.y, ringRadius);
          obs.glowGfx.lineStyle(Math.max(1, 2 * proj.scale), DRIVE.danger, 0.4 * proj.scale);
          obs.glowGfx.strokeCircle(proj.x, proj.y, ringRadius);
        }
      }
    }
  }

  private destroyObstacleVisuals(obs: Obstacle3D): void {
    if (obs.emojiText) { obs.emojiText.destroy(); obs.emojiText = undefined; }
    if (obs.glowGfx) { obs.glowGfx.destroy(); obs.glowGfx = undefined; }
    if (obs.labelText) { obs.labelText.destroy(); obs.labelText = undefined; }
  }

  // ── HUD update ─────────────────────────────────────────────

  private updateDrivingHUD(_width: number): void {
    if (!this.runState || !this.destDef) return;

    // Progress bar
    const progress = Math.min(1, this.runState.distanceCovered / this.runState.distance);
    if (this.hudProgressBar) {
      this.hudProgressBar.width = Math.max(1, this.hudProgressBarW * progress);
      if (progress > 0.8) {
        this.hudProgressBar.fillColor = DRIVE.gold;
      } else if (progress > 0.5) {
        this.hudProgressBar.fillColor = DRIVE.accent;
      }
    }

    // Smash counter
    if (this.hudSmashText) {
      this.hudSmashText.setText(`${this.runState.obstaclesDestroyed} smashed`);
    }

    // Combo display
    const now = this.time.now;
    if (this.comboCount > 1 && now - this.lastSmashTime < COMBO_WINDOW_MS) {
      if (this.hudComboText) {
        this.hudComboText.setText(`x${this.comboCount} COMBO!`);
        this.hudComboText.setAlpha(1);
      }
    } else if (now - this.lastSmashTime >= COMBO_WINDOW_MS) {
      if (this.comboCount > 0) {
        this.comboCount = 0;
        if (this.hudComboText) this.hudComboText.setAlpha(0);
      }
    }

    // Damage meter
    const totalDmg = this.runState.damages.reduce((s, d) => s + d.severity, 0);
    if (this.hudDamageText) {
      this.hudDamageText.setText(`${Math.min(totalDmg, 100)}%`);
      if (totalDmg > 60) {
        this.hudDamageText.setColor(CHROME.inkDanger);
      } else if (totalDmg > 30) {
        this.hudDamageText.setColor(COLOURS.warm);
      } else {
        this.hudDamageText.setColor(CHROME.inkAccent);
      }
    }

    // Steering wheel indicator (rotates with input)
    if (this.hudSpeedText) {
      const wheelChars = ['◑', '◐', '○', '◑', '◐'];
      const idx = Math.floor((this.playerX + 1) / 2 * (wheelChars.length - 1));
      this.hudSpeedText.setText(wheelChars[Math.max(0, Math.min(wheelChars.length - 1, idx))]);
    }
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

    // Credit earnings to economy and publish via registry
    if (rewards.earnings > 0) {
      this.economy.coins += rewards.earnings;
      this.economy.lifetimeEarnings += rewards.earnings;
      this.registry.set('updatedEconomy', { ...this.economy });
    }

    // Title
    this.container.add(
      createChromeTitle(this, width / 2, 50,
        totalled ? 'TOTALLED!' : rewards.perfectRun ? 'PERFECT RUN!' : 'RUN COMPLETE!', {
        tone: totalled ? 'danger' : rewards.perfectRun ? 'success' : 'default',
        fontSize: '24px',
      })
    );

    // Destination
    this.container.add(
      this.add.text(width / 2, 95, `${this.destDef.emoji} ${this.destDef.label}`, {
        fontSize: '16px', fontFamily: FONTS.body, color: DRIVE.textDim,
      }).setOrigin(0.5)
    );

    // Stats
    const statsY = 135;
    const stats = [
      { label: 'Earnings', value: `${rewards.earnings} coins`, colour: CHROME.inkAccent },
      { label: 'Obstacles Smashed', value: `${this.runState.obstaclesDestroyed}`, colour: COLOURS.warm },
      { label: 'Total Damage', value: `${this.runState.damages.reduce((s, d) => s + d.severity, 0)}%`, colour: totalled ? CHROME.inkDanger : CHROME.inkAccent },
      { label: 'Time', value: `${(this.runState.timeTakenMs / 1000).toFixed(1)}s`, colour: DRIVE.text },
    ];

    stats.forEach((stat, i) => {
      const y = statsY + i * 35;
      this.container.add(
        this.add.text(width / 2 - 100, y, stat.label, {
          fontSize: TYPE.caption, fontFamily: FONTS.body, color: DRIVE.textDim,
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
          this.add.text(width / 2, bonusY + i * 22, bonus, {
            fontSize: TYPE.caption, fontFamily: FONTS.body,
            color: bonus.includes('No Earnings') ? CHROME.inkDanger : CHROME.inkAccent,
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
        this.add.rectangle(width / 2, dmgY, width - 80, 16, hexNum(COLOURS.bgDark)).setOrigin(0.5)
      );
      const dmgBarW = Math.min(1, totalDmg / 100) * (width - 80);
      this.container.add(
        this.add.rectangle(width / 2 - (width - 80) / 2, dmgY, dmgBarW, 16,
          totalDmg > 60 ? DRIVE.danger : totalDmg > 30 ? DRIVE.accent : DRIVE.success
        ).setOrigin(0, 0.5)
      );

      // Damage category
      const matched = DAMAGE_THRESHOLDS.filter((t) => totalDmg >= t.threshold);
      if (matched.length > 0) {
        const worst = matched[matched.length - 1];
        this.container.add(
          this.add.text(width / 2, dmgY + 18, `${worst.emoji} ${worst.label}`, {
            fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: DRIVE.textDim,
          }).setOrigin(0.5)
        );
      }
    }

    // Dot burst for perfect run
    if (rewards.perfectRun) {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const star = this.add.circle(
          width / 2 + Math.cos(angle) * 100,
          50 + Math.sin(angle) * 30,
          7, hexNum(COLOURS.warmDark)
        ).setAlpha(0);
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
      createChromeButton(this, width / 2, height - 85, 'Drive Again', () => {
        this.phase = 'destination_select';
        this.renderView();
      }, { width: 200, icon: 'icon-play', variant: 'filled' })
    );

    this.container.add(
      createChromeButton(this, width / 2, height - 35, 'Back to Centre', () => {
        this.scene.start('GameScene');
      }, { width: 200, icon: 'icon-back', iconStyle: 'glyph' })
    );
  }
}
