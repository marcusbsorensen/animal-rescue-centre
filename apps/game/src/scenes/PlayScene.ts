import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { COLOURS, FONTS, TEXT_RESOLUTION } from '../ui/constants';
import { createChromeButton, createAmbientParticles } from '../ui/UIButton';
import { applyPlay, TOY_DEFS, DEFAULT_TOY_FOR_SPECIES, getPlayToyId, getToyBondBonus } from '@arc/game-logic';
import { createAnimalSprite } from '../ui/sprites';
import { AudioManager } from '../audio/AudioManager';

type Phase = 'intro' | 'playing' | 'done';

interface PlayResult {
  perfect: boolean;
}

type AnimalSprite = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

/**
 * PlayScene — species-routed play mini-game.
 *
 * Each species has its own tiny game built around the same shared HUD
 * (honey-amber wooden plank, back pill, goal text, paw progress). The
 * router in `renderView()` picks the right `renderXxxGame()` method; all
 * of them end at `finishGame()` which applies the `applyPlay` reward
 * plus a "perfect" bond/happiness bonus and then shows `renderDone()`.
 */
export class PlayScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;

  private animal!: Animal;
  private allAnimals: Animal[] = [];
  /** Toy chosen for this play session — see getPlayToyId. */
  private toyId: string = 'tennis-ball';
  /** Bond bonus earned for using a favourite toy. Added in finishGame. */
  private toyBondBonus = 0;
  private onComplete?: (updatedAnimals: Animal[], result: PlayResult) => void;

  private phase: Phase = 'intro';
  private container!: Phaser.GameObjects.Container;

  // Shared progress state — every species uses paw progress dots.
  private targetCount = 3;
  private progressCount = 0;
  private pawDots: Phaser.GameObjects.Text[] = [];

  // Dog ball-throw state
  private ball?: Phaser.GameObjects.Container;
  private ballHome = { x: 0, y: 0 };
  private dogTarget = { x: 0, y: 0 };
  private animalSprite?: AnimalSprite;
  private isDraggingBall = false;
  private throwInFlight = false;

  // Cat feather-chase state
  private feather?: Phaser.GameObjects.Text;
  private featherLastPos = { x: 0, y: 0 };
  private featherVelAccum = 0;
  private catPounceCooldown = 0;

  // Bunny leaf-pile state
  private bunnyLeafPile?: Phaser.GameObjects.Container;
  private bunnyBusy = false;

  // Fox dig state
  private foxPatches: {
    container: Phaser.GameObjects.Container;
    hasTreat: boolean;
    dug: boolean;
  }[] = [];
  private foxBusy = false;

  // Bat mealworm state
  private batWorms: Phaser.GameObjects.Text[] = [];
  private batSpawned = 0;
  private batSpawnCap = 6;
  private batBusy = false;

  // Parrot rhythm state
  private parrotRound = 0;
  private parrotPattern: number[] = []; // gap durations (ms)
  private parrotBell?: Phaser.GameObjects.Container;
  private parrotTapTimes: number[] = [];
  private parrotListening = false;
  private parrotReplayInProgress = false;
  private parrotStatusText?: Phaser.GameObjects.Text;

  // Snake warm-rock state
  private snakeRock?: Phaser.GameObjects.Container;
  private snakeWarmth = 0; // 0..1
  private snakeHolding = false;
  private snakeBarFill?: Phaser.GameObjects.Rectangle;
  private snakeBarFullWidth = 0;
  private snakeUpdateEvent?: Phaser.Time.TimerEvent;
  private snakeComplete = false;

  constructor() {
    super({ key: 'PlayScene' });
  }

  init(data: {
    animal: Animal;
    allAnimals: Animal[];
    onComplete?: (updatedAnimals: Animal[], result: PlayResult) => void;
  }): void {
    this.animal = data.animal;
    this.allAnimals = [...(data.allAnimals || [])];
    this.onComplete = data.onComplete;
    this.phase = 'intro';
    this.resetAllState();
  }

  private resetAllState(): void {
    this.targetCount = 3;
    this.progressCount = 0;
    this.pawDots = [];
    this.ball = undefined;
    this.animalSprite = undefined;
    this.isDraggingBall = false;
    this.throwInFlight = false;
    this.feather = undefined;
    this.featherVelAccum = 0;
    this.catPounceCooldown = 0;
    this.bunnyLeafPile = undefined;
    this.bunnyBusy = false;
    this.foxPatches = [];
    this.foxBusy = false;
    this.batWorms = [];
    this.batSpawned = 0;
    this.batBusy = false;
    this.parrotRound = 0;
    this.parrotPattern = [];
    this.parrotBell = undefined;
    this.parrotTapTimes = [];
    this.parrotListening = false;
    this.parrotReplayInProgress = false;
    this.parrotStatusText = undefined;
    this.snakeRock = undefined;
    this.snakeWarmth = 0;
    this.snakeHolding = false;
    this.snakeBarFill = undefined;
    this.snakeBarFullWidth = 0;
    this.snakeUpdateEvent = undefined;
    this.snakeComplete = false;
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('vet');

    this.cameras.main.fadeIn(400, 245, 235, 224);

    this.container = this.add.container(0, 0);

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

    this.events.once('shutdown', () => this.cleanupTimers());

    this.phase = 'playing';
    // Choose the equipped toy for this session — defaults to the species
    // default when the animal has no favourite set (back-compat for old
    // saves without toys/favouriteToy fields).
    this.toyId = getPlayToyId(this.animal);
    this.toyBondBonus = getToyBondBonus(this.animal, this.toyId);
    this.configureSpeciesTarget();
    this.renderView();
  }

  private cleanupTimers(): void {
    if (this.snakeUpdateEvent) {
      this.snakeUpdateEvent.remove(false);
      this.snakeUpdateEvent = undefined;
    }
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.input.removeAllListeners();
  }

  private configureSpeciesTarget(): void {
    switch (this.animal.species) {
      case 'dog':    this.targetCount = 3; break;
      case 'cat':    this.targetCount = 5; break;
      case 'bunny':  this.targetCount = 4; break;
      case 'fox':    this.targetCount = 3; break;
      case 'bat':    this.targetCount = 4; break;
      case 'parrot': this.targetCount = 3; break;
      case 'snake':  this.targetCount = 1; break;
      default:       this.targetCount = 3; break;
    }
  }

  private clearView(): void {
    this.container.removeAll(true);
    this.pawDots = [];
    this.ball = undefined;
    this.animalSprite = undefined;
    this.feather = undefined;
    this.bunnyLeafPile = undefined;
    this.foxPatches = [];
    this.batWorms = [];
    this.parrotBell = undefined;
    this.parrotStatusText = undefined;
    this.snakeRock = undefined;
    this.snakeBarFill = undefined;
    if (this.snakeUpdateEvent) {
      this.snakeUpdateEvent.remove(false);
      this.snakeUpdateEvent = undefined;
    }
  }

  private renderView(): void {
    this.clearView();
    const { width, height } = this.scale;

    this.renderBackground(width, height);

    if (this.phase === 'done') {
      this.renderDone(width, height);
      return;
    }

    switch (this.animal.species) {
      case 'dog':    this.renderDogGame(width, height); break;
      case 'cat':    this.renderCatGame(width, height); break;
      case 'bunny':  this.renderBunnyGame(width, height); break;
      case 'fox':    this.renderFoxGame(width, height); break;
      case 'bat':    this.renderBatGame(width, height); break;
      case 'parrot': this.renderParrotGame(width, height); break;
      case 'snake':  this.renderSnakeGame(width, height); break;
      default:       this.renderPlaceholder(width, height); break;
    }
  }

  /** Garden background, lightly darkened via a cream overlay. */
  private renderBackground(width: number, height: number): void {
    const bgKey = this.textures.exists('garden-lawn-summer-morning')
      ? 'garden-lawn-summer-morning'
      : this.textures.exists('bg-garden')
        ? 'bg-garden'
        : null;

    if (bgKey) {
      const bg = this.add.image(width / 2, height / 2, bgKey);
      const scale = Math.max(width / bg.width, height / bg.height);
      bg.setScale(scale);
      bg.setTint(0xe8e0cc);
      this.container.add(bg);
    } else {
      this.container.add(
        this.add.rectangle(width / 2, height / 2, width, height, 0xd6e8c8)
      );
    }

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0xfef9ef, 0.25);
    this.container.add(overlay);
  }

  /** Honey-amber wooden-plank HUD across the top of the scene. */
  private renderHud(width: number, goalText: string): number {
    const hudH = 58;
    const hudY = hudH / 2;

    const plank = this.add.graphics();
    plank.fillStyle(0xc88436, 1);
    plank.fillRect(0, 0, width, hudH);
    plank.fillStyle(0xe7a84a, 1);
    plank.fillRect(0, 0, width, hudH * 0.32);
    plank.fillStyle(0xa2651c, 1);
    plank.fillRect(0, hudH * 0.78, width, hudH * 0.22);
    plank.fillStyle(0x7a4b15, 1);
    plank.fillRect(0, hudH - 3, width, 3);
    this.container.add(plank);

    for (const nx of [14, width - 14]) {
      const nail = this.add.circle(nx, hudY, 5, 0x3c2a18);
      nail.setStrokeStyle(1, 0x1f140a, 1);
      this.container.add(nail);
    }

    const backBg = this.add.graphics();
    const bbx = 70;
    const bby = hudY;
    const bbW = 100;
    const bbH = 34;
    backBg.fillStyle(0x3f5d32, 1);
    backBg.fillRoundedRect(bbx - bbW / 2, bby - bbH / 2, bbW, bbH, 17);
    backBg.fillStyle(0x5d7f4a, 0.6);
    backBg.fillRoundedRect(bbx - bbW / 2 + 2, bby - bbH / 2 + 2, bbW - 4, bbH * 0.45, { tl: 15, tr: 15, bl: 0, br: 0 });
    this.container.add(backBg);
    const backText = this.add.text(bbx, bby - 1, '← Back', {
      fontSize: '15px',
      fontFamily: FONTS.chalk,
      fontStyle: 'bold',
      color: '#fffbe8',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    this.container.add(backText);
    const backHit = this.add.rectangle(bbx, bby, bbW + 10, bbH + 10, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    backHit.on('pointerup', () => this.exitScene(false));
    this.container.add(backHit);

    const goal = this.add.text(width / 2, hudY - 1, goalText, {
      fontSize: '19px',
      fontFamily: FONTS.chalk,
      fontStyle: 'bold',
      color: '#fffbe8',
      resolution: TEXT_RESOLUTION,
      shadow: { offsetX: 2, offsetY: 2, color: 'rgba(0,0,0,0.5)', blur: 0, fill: true },
    }).setOrigin(0.5);
    this.container.add(goal);

    const pawRightEdge = width - 32;
    const pawSpacing = 26;
    this.pawDots = [];
    for (let i = 0; i < this.targetCount; i++) {
      const px = pawRightEdge - (this.targetCount - 1 - i) * pawSpacing;
      const paw = this.add.text(px, hudY - 1, '🐾', {
        fontSize: '22px',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);
      this.container.add(paw);
      this.pawDots.push(paw);
    }
    this.updatePawDots();

    return hudH;
  }

  private updatePawDots(): void {
    for (let i = 0; i < this.pawDots.length; i++) {
      const filled = i < this.progressCount;
      this.pawDots[i].setAlpha(filled ? 1 : 0.35);
      this.pawDots[i].setScale(filled ? 1.1 : 0.9);
    }
  }

  private renderHintStrip(width: number, height: number, text: string): void {
    const hint = this.add.text(width / 2, height - 24, text, {
      fontSize: '18px',
      fontFamily: '"Caveat", "Kalam", "Patrick Hand", cursive',
      fontStyle: 'italic',
      color: '#5d3a18',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    this.container.add(hint);
  }

  private spawnSprite(width: number, height: number, scaleFactor = 1.1): AnimalSprite {
    const cx = width / 2;
    const cy = height / 2 + 40;
    // 720/640 and a factor above 1 look wrong until you know the sprite is
    // fitted inside this box and the box is a fraction of the screen: on a
    // 812x375 phone the height branch binds at 412, which is already more
    // than the screen is tall. Sizing this scene against the play band is
    // its own piece of work — this is the size it has always drawn at.
    const spriteW = Math.min(720, width * scaleFactor);
    const spriteH = Math.min(640, height * scaleFactor);
    const sprite = createAnimalSprite(this, cx, cy, this.animal, {
      width: spriteW,
      height: spriteH,
      stateOverride: 'playing',
    });
    this.container.add(sprite);
    this.tweens.add({
      targets: sprite,
      y: cy - 6,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.animalSprite = sprite;
    return sprite;
  }

  private emitSparkles(x: number, y: number, count = 5, colour = '✨'): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const sparkle = this.add.text(x, y, colour, {
        fontSize: '20px',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);
      this.container.add(sparkle);
      this.tweens.add({
        targets: sparkle,
        x: x + Math.cos(angle) * 60,
        y: y + Math.sin(angle) * 60,
        alpha: 0,
        scale: { from: 1, to: 1.6 },
        duration: 500 + i * 40,
        ease: 'Quad.easeOut',
        onComplete: () => sparkle.destroy(),
      });
    }
  }

  private bumpSprite(): void {
    if (!this.animalSprite) return;
    const s = this.animalSprite as Phaser.GameObjects.Image;
    this.tweens.add({
      targets: s,
      scaleX: s.scaleX * 1.07,
      scaleY: s.scaleY * 1.07,
      duration: 120,
      yoyo: true,
    });
  }

  private incrementProgress(): void {
    this.progressCount += 1;
    this.updatePawDots();
    if (this.progressCount >= this.targetCount) {
      this.time.delayedCall(400, () => this.finishGame());
    }
  }

  // ──────────────────────────────────────────────────────────────
  // DOG — ball throw × 3
  // ──────────────────────────────────────────────────────────────

  private renderDogGame(width: number, height: number): void {
    const toy = TOY_DEFS[this.toyId] ?? TOY_DEFS[DEFAULT_TOY_FOR_SPECIES.dog];
    const goalCopy = this.toyId === DEFAULT_TOY_FOR_SPECIES.dog
      ? `${toy.emoji} Throw the ball ${this.targetCount} times!`
      : `${toy.emoji} Toss the ${toy.label.toLowerCase()} for ${this.animal.name}!`;
    this.renderHud(width, goalCopy);

    const dogCX = width / 2;
    const dogCY = height / 2 + 40;
    const spriteW = Math.min(720, width * 1.1);
    const spriteH = Math.min(640, height * 1.1);
    const sprite = createAnimalSprite(this, dogCX, dogCY, this.animal, {
      width: spriteW,
      height: spriteH,
      stateOverride: 'playing',
    });
    this.container.add(sprite);
    this.animalSprite = sprite;
    // Where the thrown ball lands — a little above the dog's centre, so it
    // reads as caught rather than dropped. Off the drawn height, which is
    // the smaller of the two box dimensions fitted to square art, not off
    // `spriteH`: those were the same number until the box stopped meaning
    // half the sprite, and this offset is the size it has always been.
    this.dogTarget = { x: dogCX, y: dogCY - sprite.displayHeight * 0.05 };

    this.tweens.add({
      targets: sprite,
      y: dogCY - 6,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const ballSize = 80;
    const ballX = width - ballSize / 2 - 30;
    const ballY = height - ballSize / 2 - 70;
    this.ballHome = { x: ballX, y: ballY };
    this.ball = this.makeBallContainer(ballX, ballY, ballSize);
    this.container.add(this.ball);

    const label = this.add.text(ballX, ballY - ballSize / 2 - 14, 'drag me!', {
      fontSize: '18px',
      fontFamily: '"Caveat", "Kalam", cursive',
      fontStyle: 'italic',
      color: '#3f5d32',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5).setAngle(-6);
    this.container.add(label);

    this.renderHintStrip(width, height, 'tap or drag the ball to throw it for the dog…');
  }

  private makeBallContainer(x: number, y: number, size: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    const frame = this.add.graphics();
    frame.fillStyle(0x7a4b15, 1);
    frame.fillCircle(0, 0, size / 2 + 2);
    frame.fillStyle(0xf5ecd0, 1);
    frame.fillCircle(0, 0, size / 2 - 2);
    c.add(frame);

    const ballEmoji = this.add.text(0, 0, TOY_DEFS[this.toyId]?.emoji ?? '🎾', {
      fontSize: `${Math.floor(size * 0.75)}px`,
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    c.add(ballEmoji);

    c.setSize(size + 20, size + 20);
    c.setInteractive({ useHandCursor: true, draggable: true });
    this.input.setDraggable(c);

    this.tweens.add({
      targets: c,
      scale: { from: 1, to: 1.06 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    c.on('pointerdown', () => {
      this.isDraggingBall = true;
    });

    c.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      if (this.throwInFlight) return;
      c.setPosition(dragX, dragY);
    });

    c.on('dragend', () => {
      if (this.throwInFlight) return;
      this.isDraggingBall = false;
      this.throwBall();
    });

    c.on('pointerup', () => {
      if (this.throwInFlight) return;
      if (!this.isDraggingBall) {
        this.throwBall();
      }
    });

    return c;
  }

  private throwBall(): void {
    if (!this.ball || this.throwInFlight) return;
    this.throwInFlight = true;

    this.tweens.killTweensOf(this.ball);

    const target = this.dogTarget;
    this.tweens.add({
      targets: this.ball,
      x: target.x,
      y: target.y,
      scale: 0.5,
      duration: 450,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.bumpSprite();
        this.ball?.setVisible(false);
        this.emitSparkles(target.x, target.y);
        this.progressCount += 1;
        this.updatePawDots();

        this.time.delayedCall(350, () => {
          if (this.progressCount >= this.targetCount) {
            this.finishGame();
            return;
          }
          if (this.ball) {
            this.ball.setPosition(this.ballHome.x, this.ballHome.y);
            this.ball.setScale(1);
            this.ball.setVisible(true);
          }
          this.throwInFlight = false;
          this.isDraggingBall = false;
        });
      },
    });
  }

  // ──────────────────────────────────────────────────────────────
  // CAT — feather-chase × 5
  // ──────────────────────────────────────────────────────────────

  private renderCatGame(width: number, height: number): void {
    const toy = TOY_DEFS[this.toyId] ?? TOY_DEFS[DEFAULT_TOY_FOR_SPECIES.cat];
    const goalCopy = this.toyId === DEFAULT_TOY_FOR_SPECIES.cat
      ? `${toy.emoji} Make the cat pounce ${this.targetCount} times!`
      : `${toy.emoji} Wiggle the ${toy.label.toLowerCase()} for ${this.animal.name}!`;
    this.renderHud(width, goalCopy);
    const sprite = this.spawnSprite(width, height);

    const featherX = width / 2;
    const featherY = height - 140;
    const feather = this.add.text(featherX, featherY, toy.emoji, {
      fontSize: '44px',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    feather.setAngle(-20);
    this.container.add(feather);
    this.feather = feather;
    this.featherLastPos = { x: featherX, y: featherY };

    // Gentle idle wobble
    this.tweens.add({
      targets: feather,
      angle: { from: -25, to: -15 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.feather) return;
      if (this.progressCount >= this.targetCount) return;
      this.feather.setPosition(pointer.x, pointer.y);
      const dx = pointer.x - this.featherLastPos.x;
      const dy = pointer.y - this.featherLastPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      this.featherVelAccum += dist;
      this.featherLastPos = { x: pointer.x, y: pointer.y };

      // If cursor is moving fast enough AND within range of the cat, pounce.
      const now = this.time.now;
      if (now < this.catPounceCooldown) return;
      const cat = sprite;
      const toCatX = pointer.x - cat.x;
      const toCatY = pointer.y - cat.y;
      const distToCat = Math.sqrt(toCatX * toCatX + toCatY * toCatY);
      if (this.featherVelAccum > 180 && distToCat < 260) {
        this.featherVelAccum = 0;
        this.catPounceCooldown = now + 900;
        this.doCatPounce(pointer.x, pointer.y);
      }
    });

    // Decay velocity accumulator so standing still doesn't stockpile pounces.
    this.time.addEvent({
      delay: 120,
      loop: true,
      callback: () => {
        this.featherVelAccum = Math.max(0, this.featherVelAccum - 30);
      },
    });

    this.renderHintStrip(width, height, 'swish the feather around to tempt the cat…');
  }

  private doCatPounce(x: number, y: number): void {
    this.bumpSprite();
    this.emitSparkles(x, y, 4);
    this.incrementProgress();
  }

  // ──────────────────────────────────────────────────────────────
  // BUNNY — leaf-pile rustle × 4 binkies (60% chance per tap)
  // ──────────────────────────────────────────────────────────────

  private renderBunnyGame(width: number, height: number): void {
    const toy = TOY_DEFS[this.toyId] ?? TOY_DEFS[DEFAULT_TOY_FOR_SPECIES.bunny];
    const goalCopy = this.toyId === DEFAULT_TOY_FOR_SPECIES.bunny
      ? `🍃 Rustle until the bunny binkies ${this.targetCount} times!`
      : `${toy.emoji} Wiggle the ${toy.label.toLowerCase()} for ${this.animal.name}!`;
    this.renderHud(width, goalCopy);
    this.spawnSprite(width, height);

    const pileX = width / 2;
    const pileY = height - 130;
    const pile = this.add.container(pileX, pileY);
    const leafEmojis = ['🍂', '🍃', '🍂', '🍃', '🍂'];
    const arranged: Phaser.GameObjects.Text[] = [];
    for (let i = 0; i < leafEmojis.length; i++) {
      const angle = (i / leafEmojis.length) * Math.PI * 2;
      const lx = Math.cos(angle) * 32;
      const ly = Math.sin(angle) * 12;
      const leaf = this.add.text(lx, ly, leafEmojis[i], {
        fontSize: '38px',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);
      leaf.setAngle((i - 2) * 12);
      pile.add(leaf);
      arranged.push(leaf);
    }
    pile.setSize(160, 60);
    pile.setInteractive(new Phaser.Geom.Rectangle(-80, -30, 160, 60), Phaser.Geom.Rectangle.Contains);
    this.container.add(pile);
    this.bunnyLeafPile = pile;

    pile.on('pointerdown', () => {
      if (this.bunnyBusy || this.progressCount >= this.targetCount) return;
      this.bunnyBusy = true;
      // Rustle — shake leaves
      for (const leaf of arranged) {
        this.tweens.add({
          targets: leaf,
          angle: leaf.angle + (Math.random() - 0.5) * 40,
          duration: 120,
          yoyo: true,
        });
      }
      const binky = Math.random() < 0.6;
      this.time.delayedCall(260, () => {
        if (binky) {
          this.doBunnyBinky();
        }
        this.bunnyBusy = false;
      });
    });

    this.renderHintStrip(width, height, 'tap the leaves — maybe the bunny will binky!');
  }

  private doBunnyBinky(): void {
    if (!this.animalSprite) { this.incrementProgress(); return; }
    const s = this.animalSprite;
    const startY = s.y;
    this.tweens.add({
      targets: s,
      y: startY - 50,
      duration: 240,
      ease: 'Sine.easeOut',
      yoyo: true,
      onYoyo: () => this.emitSparkles(s.x, s.y - 20, 4),
      onComplete: () => {
        s.setY(startY);
        this.incrementProgress();
      },
    });
  }

  // ──────────────────────────────────────────────────────────────
  // FOX — treat-dig × 3 (6 patches, 3 hide treats)
  // ──────────────────────────────────────────────────────────────

  private renderFoxGame(width: number, height: number): void {
    const toy = TOY_DEFS[this.toyId] ?? TOY_DEFS[DEFAULT_TOY_FOR_SPECIES.fox];
    const goalCopy = this.toyId === DEFAULT_TOY_FOR_SPECIES.fox
      ? `🍖 Help the fox find ${this.targetCount} treats!`
      : `${toy.emoji} Hunt down ${this.targetCount} ${toy.label.toLowerCase()}s for ${this.animal.name}!`;
    this.renderHud(width, goalCopy);
    this.spawnSprite(width, height);

    // 6 patches arranged along the bottom band
    const patchCount = 6;
    const band = height - 110;
    const marginX = 80;
    const step = (width - marginX * 2) / (patchCount - 1);
    const treatIndices = new Set<number>();
    while (treatIndices.size < 3) {
      treatIndices.add(Math.floor(Math.random() * patchCount));
    }

    this.foxPatches = [];
    for (let i = 0; i < patchCount; i++) {
      const px = marginX + i * step;
      const py = band + (i % 2 === 0 ? -10 : 10);
      const c = this.add.container(px, py);
      const dirt = this.add.circle(0, 0, 22, 0x8b5a2b);
      dirt.setStrokeStyle(2, 0x5a3816);
      c.add(dirt);
      const top = this.add.circle(0, -4, 16, 0xa97344).setAlpha(0.8);
      c.add(top);
      c.setSize(48, 48);
      c.setInteractive(new Phaser.Geom.Rectangle(-24, -24, 48, 48), Phaser.Geom.Rectangle.Contains);
      const entry = {
        container: c,
        hasTreat: treatIndices.has(i),
        dug: false,
      };
      this.foxPatches.push(entry);
      c.on('pointerdown', () => this.doFoxDig(entry));
      this.container.add(c);
    }

    this.renderHintStrip(width, height, 'tap a dirt patch to dig — some hide treats!');
  }

  private doFoxDig(patch: { container: Phaser.GameObjects.Container; hasTreat: boolean; dug: boolean }): void {
    if (this.foxBusy || patch.dug || this.progressCount >= this.targetCount) return;
    patch.dug = true;
    this.foxBusy = true;

    const s = this.animalSprite;
    if (s) {
      this.tweens.add({
        targets: s,
        scaleY: (s as Phaser.GameObjects.Image).scaleY * 0.9,
        duration: 150,
        yoyo: true,
      });
    }

    this.tweens.add({
      targets: patch.container,
      scaleY: 0.6,
      duration: 200,
      yoyo: true,
      onComplete: () => {
        if (patch.hasTreat) {
          this.emitSparkles(patch.container.x, patch.container.y, 4);
          const treat = this.add.text(patch.container.x, patch.container.y - 20, '🍖', {
            fontSize: '28px',
            resolution: TEXT_RESOLUTION,
          }).setOrigin(0.5);
          this.container.add(treat);
          this.tweens.add({
            targets: treat,
            y: treat.y - 30,
            alpha: 0,
            duration: 900,
            onComplete: () => treat.destroy(),
          });
          this.incrementProgress();
        } else {
          // "nope" wobble, fade out empty patch
          this.tweens.add({
            targets: patch.container,
            angle: { from: -8, to: 8 },
            duration: 80,
            yoyo: true,
            repeat: 1,
          });
          this.tweens.add({
            targets: patch.container,
            alpha: 0.3,
            duration: 400,
            delay: 200,
          });
        }
        this.foxBusy = false;
      },
    });
  }

  // ──────────────────────────────────────────────────────────────
  // BAT — mealworm-catch × 4 (6 spawned)
  // ──────────────────────────────────────────────────────────────

  private renderBatGame(width: number, height: number): void {
    const toy = TOY_DEFS[this.toyId] ?? TOY_DEFS[DEFAULT_TOY_FOR_SPECIES.bat];
    const goalCopy = `${toy.emoji} Catch ${this.targetCount} ${toy.label.toLowerCase()}s!`;
    this.renderHud(width, goalCopy);
    this.spawnSprite(width, height);

    // Spawn 6 worms staggered across ~12 seconds
    this.batSpawned = 0;
    this.batSpawnCap = 6;
    const spawnOne = () => {
      if (this.batSpawned >= this.batSpawnCap) return;
      if (this.progressCount >= this.targetCount) return;
      this.batSpawned += 1;
      this.spawnMealworm(width, height);
      this.time.delayedCall(1500 + Math.random() * 700, spawnOne);
    };
    this.time.delayedCall(400, spawnOne);

    this.renderHintStrip(width, height, 'tap the flying mealworms — quick!');
  }

  private spawnMealworm(width: number, height: number): void {
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? -40 : width + 40;
    const endX = fromLeft ? width + 40 : -40;
    const y = 90 + Math.random() * 120;
    const worm = this.add.text(startX, y, '🐛', {
      fontSize: '30px',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    this.container.add(worm);
    worm.setInteractive({ useHandCursor: true });
    this.batWorms.push(worm);

    let caught = false;
    worm.on('pointerdown', () => {
      if (caught || this.batBusy) return;
      if (this.progressCount >= this.targetCount) return;
      caught = true;
      this.batBusy = true;
      this.tweens.killTweensOf(worm);
      const catchX = worm.x;
      const catchY = worm.y;
      this.emitSparkles(catchX, catchY, 4);

      // Bat swoops toward worm
      const s = this.animalSprite;
      if (s) {
        const originX = s.x;
        const originY = s.y;
        const midX = (originX + catchX) / 2;
        const midY = (originY + catchY) / 2;
        this.tweens.add({
          targets: s,
          x: midX,
          y: midY,
          duration: 180,
          yoyo: true,
          onComplete: () => {
            s.setPosition(originX, originY);
            this.batBusy = false;
          },
        });
      } else {
        this.batBusy = false;
      }

      this.tweens.add({
        targets: worm,
        alpha: 0,
        scale: 0.2,
        duration: 220,
        onComplete: () => worm.destroy(),
      });
      this.incrementProgress();
    });

    this.tweens.add({
      targets: worm,
      x: endX,
      y: y + (Math.random() - 0.5) * 80,
      duration: 4500 + Math.random() * 1500,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (!caught) worm.destroy();
      },
    });
  }

  // ──────────────────────────────────────────────────────────────
  // PARROT — bell rhythm × 3 rounds (3, 4, 5 beats)
  // ──────────────────────────────────────────────────────────────

  private renderParrotGame(width: number, height: number): void {
    const toy = TOY_DEFS[this.toyId] ?? TOY_DEFS[DEFAULT_TOY_FOR_SPECIES.parrot];
    const goalCopy = this.toyId === DEFAULT_TOY_FOR_SPECIES.parrot
      ? `🔔 Match the parrot's rhythm!`
      : `${toy.emoji} Match ${this.animal.name}'s rhythm!`;
    this.renderHud(width, goalCopy);
    this.spawnSprite(width, height);

    const bellX = width - 110;
    const bellY = height / 2 + 40;
    const bell = this.add.container(bellX, bellY);
    const halo = this.add.circle(0, 0, 52, 0xfff3c4, 0.4);
    bell.add(halo);
    const bellEmoji = this.add.text(0, 0, TOY_DEFS[this.toyId]?.emoji ?? '🔔', {
      fontSize: '72px',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    bell.add(bellEmoji);
    bell.setSize(110, 110);
    bell.setInteractive(new Phaser.Geom.Rectangle(-55, -55, 110, 110), Phaser.Geom.Rectangle.Contains);
    this.container.add(bell);
    this.parrotBell = bell;

    bell.on('pointerdown', () => this.parrotTap());

    const status = this.add.text(width / 2, height - 70, '', {
      fontSize: '22px',
      fontFamily: FONTS.chalk,
      fontStyle: 'bold',
      color: '#5d3a18',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    this.container.add(status);
    this.parrotStatusText = status;

    this.renderHintStrip(width, height, 'watch the bell flash, then tap to repeat…');

    this.time.delayedCall(600, () => this.startParrotRound());
  }

  private startParrotRound(): void {
    if (this.progressCount >= this.targetCount) return;
    const beats = 3 + this.parrotRound; // 3, 4, 5
    const pattern: number[] = [];
    for (let i = 0; i < beats - 1; i++) {
      pattern.push(Math.random() < 0.5 ? 320 : 640);
    }
    this.parrotPattern = pattern;
    this.playParrotPattern(beats);
  }

  private playParrotPattern(beats: number): void {
    if (!this.parrotStatusText) return;
    this.parrotReplayInProgress = true;
    this.parrotListening = false;
    this.parrotStatusText.setText('listen…');

    let t = 0;
    const flashOnce = () => {
      this.flashBell();
    };
    // First flash immediately
    this.time.delayedCall(0, flashOnce);
    for (let i = 0; i < beats - 1; i++) {
      t += this.parrotPattern[i];
      this.time.delayedCall(t, flashOnce);
    }
    this.time.delayedCall(t + 500, () => {
      if (!this.parrotStatusText) return;
      this.parrotStatusText.setText('your turn!');
      this.parrotListening = true;
      this.parrotReplayInProgress = false;
      this.parrotTapTimes = [];
    });
  }

  private flashBell(): void {
    if (!this.parrotBell) return;
    this.tweens.add({
      targets: this.parrotBell,
      scale: { from: 1, to: 1.2 },
      duration: 120,
      yoyo: true,
    });
    const note = this.add.text(this.parrotBell.x, this.parrotBell.y - 50, '🎵', {
      fontSize: '26px',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    this.container.add(note);
    this.tweens.add({
      targets: note,
      y: note.y - 30,
      alpha: 0,
      duration: 500,
      onComplete: () => note.destroy(),
    });
  }

  private parrotTap(): void {
    if (this.parrotReplayInProgress) return;
    if (!this.parrotListening) return;
    const now = this.time.now;
    this.parrotTapTimes.push(now);
    this.flashBell();

    const beats = 3 + this.parrotRound;
    if (this.parrotTapTimes.length >= beats) {
      this.parrotListening = false;
      // Evaluate
      let ok = true;
      for (let i = 0; i < this.parrotPattern.length; i++) {
        const expected = this.parrotPattern[i];
        const actual = this.parrotTapTimes[i + 1] - this.parrotTapTimes[i];
        if (Math.abs(actual - expected) > 400) { ok = false; break; }
      }
      if (ok) {
        if (this.parrotStatusText) this.parrotStatusText.setText('match! squawk!');
        this.doParrotWiggle();
        this.parrotRound += 1;
        this.incrementProgress();
        if (this.progressCount < this.targetCount) {
          this.time.delayedCall(900, () => this.startParrotRound());
        }
      } else {
        if (this.parrotStatusText) this.parrotStatusText.setText('hmm, again…');
        this.doParrotSadTilt();
        this.time.delayedCall(900, () => this.startParrotRound());
      }
    }
  }

  private doParrotWiggle(): void {
    if (!this.animalSprite) return;
    this.tweens.add({
      targets: this.animalSprite,
      angle: { from: -8, to: 8 },
      duration: 100,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.animalSprite && this.animalSprite.setAngle(0),
    });
    this.emitSparkles(this.animalSprite.x, this.animalSprite.y - 40, 4, '🎵');
  }

  private doParrotSadTilt(): void {
    if (!this.animalSprite) return;
    this.tweens.add({
      targets: this.animalSprite,
      angle: 12,
      duration: 300,
      yoyo: true,
      onComplete: () => this.animalSprite && this.animalSprite.setAngle(0),
    });
  }

  // ──────────────────────────────────────────────────────────────
  // SNAKE — warm-rock × 1 (~12s sustained hold)
  // ──────────────────────────────────────────────────────────────

  private renderSnakeGame(width: number, height: number): void {
    const toy = TOY_DEFS[this.toyId] ?? TOY_DEFS[DEFAULT_TOY_FOR_SPECIES.snake];
    const goalCopy = this.toyId === DEFAULT_TOY_FOR_SPECIES.snake
      ? `🪨 Keep the rock warm for the snake!`
      : `${toy.emoji} Keep the ${toy.label.toLowerCase()} warm for ${this.animal.name}!`;
    this.renderHud(width, goalCopy);
    this.spawnSprite(width, height);

    // Warmth bar (below HUD)
    const barY = 90;
    const barW = Math.min(420, width - 80);
    const barX = (width - barW) / 2;
    const barBg = this.add.rectangle(barX, barY, barW, 18, 0x3c2a18, 0.5).setOrigin(0, 0.5);
    this.container.add(barBg);
    const barFill = this.add.rectangle(barX + 2, barY, 0, 14, 0xff8c42).setOrigin(0, 0.5);
    this.container.add(barFill);
    this.snakeBarFill = barFill;
    this.snakeBarFullWidth = barW - 4;
    const barLabel = this.add.text(width / 2, barY - 20, 'warmth', {
      fontSize: '14px',
      fontFamily: FONTS.chalk,
      color: '#5d3a18',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    this.container.add(barLabel);

    // Drifting rock
    const rockStartX = width * 0.35;
    const rockStartY = height * 0.55;
    const rock = this.add.container(rockStartX, rockStartY);
    const glow = this.add.circle(0, 0, 42, 0xff8c42, 0.3);
    rock.add(glow);
    const rockShape = this.add.circle(0, 0, 28, 0x8b6b4a);
    rockShape.setStrokeStyle(2, 0x5a4228);
    rock.add(rockShape);
    const rockFace = this.add.text(0, 0, '🪨', {
      fontSize: '38px',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    rock.add(rockFace);
    rock.setSize(80, 80);
    rock.setInteractive(new Phaser.Geom.Rectangle(-40, -40, 80, 80), Phaser.Geom.Rectangle.Contains);
    this.container.add(rock);
    this.snakeRock = rock;

    // Gentle drift
    const driftTween = this.tweens.add({
      targets: rock,
      x: { from: rockStartX - 60, to: rockStartX + 60 },
      y: { from: rockStartY - 30, to: rockStartY + 30 },
      duration: 3500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Hold detection via global pointer events
    rock.on('pointerdown', () => { this.snakeHolding = true; });
    this.input.on('pointerup', () => { this.snakeHolding = false; });
    this.input.on('pointerupoutside', () => { this.snakeHolding = false; });
    rock.on('pointerout', () => {
      // Only drop hold if the pointer has left the rock entirely
      // We check in the tick whether pointer is still overlapping.
    });

    // Tick: 12 seconds to fill fully while holding; drain at half-speed otherwise.
    const fullFillMs = 12000;
    const tickMs = 80;
    this.snakeUpdateEvent = this.time.addEvent({
      delay: tickMs,
      loop: true,
      callback: () => {
        if (this.snakeComplete) return;
        // Check if the pointer is actually within the rock bounds right now.
        const pointer = this.input.activePointer;
        const held = this.snakeHolding && pointer.isDown;
        const over = held && this.rockContainsPointer(rock, pointer);

        if (over) {
          this.snakeWarmth = Math.min(1, this.snakeWarmth + tickMs / fullFillMs);
          glow.setAlpha(0.3 + this.snakeWarmth * 0.5);
          rock.setScale(1 + this.snakeWarmth * 0.1);
        } else {
          this.snakeWarmth = Math.max(0, this.snakeWarmth - (tickMs / fullFillMs) * 0.5);
          glow.setAlpha(0.3 + this.snakeWarmth * 0.5);
        }

        if (this.snakeBarFill) {
          this.snakeBarFill.setSize(this.snakeBarFullWidth * this.snakeWarmth, 14);
        }

        // Snake slithers toward the rock & coils as warmth grows.
        if (this.animalSprite) {
          const s = this.animalSprite;
          const targetX = rock.x - 20;
          const targetY = rock.y + 30;
          const ease = 0.04 * (0.5 + this.snakeWarmth);
          s.setPosition(s.x + (targetX - s.x) * ease, s.y + (targetY - s.y) * ease);
          s.setAngle(Math.min(25, this.snakeWarmth * 25));
        }

        if (this.snakeWarmth >= 1) {
          this.snakeComplete = true;
          driftTween.stop();
          this.emitSparkles(rock.x, rock.y, 6, '💤');
          this.bumpSprite();
          this.incrementProgress();
        }
      },
    });

    this.renderHintStrip(width, height, 'press and hold the warm rock — the snake loves a sunbeam…');
  }

  private rockContainsPointer(rock: Phaser.GameObjects.Container, pointer: Phaser.Input.Pointer): boolean {
    const dx = pointer.x - rock.x;
    const dy = pointer.y - rock.y;
    return dx * dx + dy * dy < 40 * 40;
  }

  // ──────────────────────────────────────────────────────────────
  // Shared finish / done / placeholder / exit
  // ──────────────────────────────────────────────────────────────

  private finishGame(): void {
    if (this.phase === 'done') return;
    const idx = this.allAnimals.findIndex((a) => a.id === this.animal.id);
    if (idx >= 0) {
      const played = applyPlay(this.allAnimals[idx]);
      const baseBond = 3;
      played.bondLevel = Math.min(100, played.bondLevel + baseBond + this.toyBondBonus);
      played.happiness = Math.min(100, played.happiness + 2);
      this.allAnimals[idx] = played;
      this.animal = played;
    }
    this.phase = 'done';
    this.renderView();
  }

  private renderDone(width: number, height: number): void {
    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height, 0xe8f5e9, 0.85)
    );

    this.renderHud(width, '🎾 Great game!');

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const sparkle = this.add.circle(
        width / 2 + Math.cos(angle) * 120,
        height / 2 - 40 + Math.sin(angle) * 80,
        9, 0x7CC76E
      ).setAlpha(0);
      this.container.add(sparkle);
      this.tweens.add({
        targets: sparkle,
        alpha: 1,
        scale: { from: 0.3, to: 1 },
        duration: 500,
        delay: i * 80,
        yoyo: true,
        repeat: -1,
        hold: 800,
      });
    }

    this.container.add(
      this.add.text(width / 2, height / 2 - 90, 'Good game!', {
        fontSize: '38px',
        fontFamily: FONTS.title,
        fontStyle: 'bold',
        color: COLOURS.primary,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 - 40,
        `${this.animal.name} had a brilliant time!`, {
          fontSize: '20px',
          fontFamily: FONTS.body,
          color: COLOURS.text,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
    );

    const totalBond = 3 + this.toyBondBonus;
    const bondCopy = this.toyBondBonus > 0
      ? `+${totalBond} bond +2 happiness  (favourite toy!)`
      : `+${totalBond} bond +2 happiness`;
    this.container.add(
      this.add.text(width / 2, height / 2 - 8,
        bondCopy, {
          fontSize: '22px',
          fontFamily: FONTS.chalk,
          fontStyle: 'bold',
          color: COLOURS.accent,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 + 24,
        '+15 happiness   +10 tiredness', {
          fontSize: '14px',
          fontFamily: FONTS.body,
          color: COLOURS.textLight,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
    );

    this.container.add(
      createAmbientParticles(this, [], { count: 10, minAlpha: 0.1, maxAlpha: 0.25 })
    );

    this.container.add(
      createChromeButton(this, width / 2, height / 2 + 90, 'Back to Centre', () => {
        this.exitScene(true);
      }, { width: 240, variant: 'filled' })
    );
  }

  private renderPlaceholder(width: number, height: number): void {
    this.renderHud(width, '🎾 Playtime!');
    this.spawnSprite(width, height, 1.0);
    this.container.add(
      this.add.text(width / 2, 100, 'Coming soon!', {
        fontSize: '32px',
        fontFamily: FONTS.title,
        fontStyle: 'bold',
        color: COLOURS.primary,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );
    this.container.add(
      createChromeButton(this, width / 2, height - 90, 'Done playing!', () => {
        this.exitScene(false);
      }, { width: 240, variant: 'filled' })
    );
  }

  private exitScene(perfect: boolean): void {
    if (this.onComplete) {
      this.onComplete(this.allAnimals, { perfect });
    }
    this.scene.start('GameScene');
  }
}
