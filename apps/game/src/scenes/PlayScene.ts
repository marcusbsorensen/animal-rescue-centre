import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { COLOURS, FONTS, TEXT_RESOLUTION } from '../ui/constants';
import { createButton, createAmbientParticles } from '../ui/UIButton';
import { applyPlay } from '@arc/game-logic';
import { createAnimalSprite } from '../ui/sprites';
import { AudioManager } from '../audio/AudioManager';

type Phase = 'intro' | 'playing' | 'done';

interface PlayResult {
  perfect: boolean;
}

/**
 * PlayScene — species-routed play mini-game.
 *
 * For dogs, runs a ball-throw mini-game: player drags a tennis ball
 * toward the dog three times. Each throw fills a paw indicator on the
 * HUD; completing all three awards a "perfect" bond bonus.
 *
 * For every other species we currently show a "Coming soon!" placeholder
 * with the playing-pose sprite and a done button — this keeps the Play
 * action working end-to-end for every animal while we iterate on each
 * species' own game.
 */
export class PlayScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;

  private animal!: Animal;
  private allAnimals: Animal[] = [];
  private onComplete?: (updatedAnimals: Animal[], result: PlayResult) => void;

  private phase: Phase = 'intro';
  private container!: Phaser.GameObjects.Container;

  // Dog ball-throw state
  private throwsNeeded = 3;
  private throwsDone = 0;
  private pawDots: Phaser.GameObjects.Text[] = [];
  private ball?: Phaser.GameObjects.Container;
  private ballHome = { x: 0, y: 0 };
  private dogTarget = { x: 0, y: 0 };
  private dogSprite?: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private isDraggingBall = false;
  private throwInFlight = false;

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
    this.throwsDone = 0;
    this.pawDots = [];
    this.ball = undefined;
    this.dogSprite = undefined;
    this.isDraggingBall = false;
    this.throwInFlight = false;
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

    // Dog gets the real game; everything else falls through to placeholder.
    if (this.animal.species === 'dog') {
      this.phase = 'playing';
    } else {
      this.phase = 'intro';
    }

    this.renderView();
  }

  private clearView(): void {
    this.container.removeAll(true);
    this.pawDots = [];
    this.ball = undefined;
    this.dogSprite = undefined;
  }

  private renderView(): void {
    this.clearView();
    const { width, height } = this.scale;

    this.renderBackground(width, height);

    if (this.animal.species !== 'dog') {
      this.renderPlaceholder(width, height);
      return;
    }

    if (this.phase === 'playing') {
      this.renderDogGame(width, height);
    } else if (this.phase === 'done') {
      this.renderDone(width, height);
    }
  }

  /** Garden background, lightly blurred-feeling via a cream overlay. */
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
      // Soft darkening/washing so the dog pops. We can't blur cheaply in
      // Phaser without a pipeline, so a cream overlay gives the same
      // "depth-of-field" feel as the mockup.
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
    // Lighter top-highlight strip
    plank.fillStyle(0xe7a84a, 1);
    plank.fillRect(0, 0, width, hudH * 0.32);
    // Bottom darker strip
    plank.fillStyle(0xa2651c, 1);
    plank.fillRect(0, hudH * 0.78, width, hudH * 0.22);
    // Bottom border
    plank.fillStyle(0x7a4b15, 1);
    plank.fillRect(0, hudH - 3, width, 3);
    this.container.add(plank);

    // Iron nails at the ends
    for (const nx of [14, width - 14]) {
      const nail = this.add.circle(nx, hudY, 5, 0x3c2a18);
      nail.setStrokeStyle(1, 0x1f140a, 1);
      this.container.add(nail);
    }

    // Back button (green pill on the plank)
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

    // Centre goal text
    const goal = this.add.text(width / 2, hudY - 1, goalText, {
      fontSize: '19px',
      fontFamily: FONTS.chalk,
      fontStyle: 'bold',
      color: '#fffbe8',
      resolution: TEXT_RESOLUTION,
      shadow: { offsetX: 2, offsetY: 2, color: 'rgba(0,0,0,0.5)', blur: 0, fill: true },
    }).setOrigin(0.5);
    this.container.add(goal);

    // Paw progress (right side)
    const pawRightEdge = width - 32;
    const pawSpacing = 26;
    this.pawDots = [];
    for (let i = 0; i < this.throwsNeeded; i++) {
      const px = pawRightEdge - (this.throwsNeeded - 1 - i) * pawSpacing;
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
      const filled = i < this.throwsDone;
      this.pawDots[i].setAlpha(filled ? 1 : 0.35);
      this.pawDots[i].setScale(filled ? 1.1 : 0.9);
    }
  }

  /** Bottom whispered caveat-style hint strip. */
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

  // ──────────────────────────────────────────────────────────────
  // Dog ball-throw mini-game
  // ──────────────────────────────────────────────────────────────

  private renderDogGame(width: number, height: number): void {
    this.renderHud(width, `🎾 Throw the ball ${this.throwsNeeded} times!`);

    // Dog sprite, centre-bottom. Use the playing-pose when available —
    // createAnimalSprite falls back to sheltered/etc. otherwise.
    const dogCX = width / 2;
    const dogCY = height / 2 + 40;
    const spriteW = Math.min(360, width * 0.55);
    const spriteH = Math.min(320, height * 0.55);
    const sprite = createAnimalSprite(this, dogCX, dogCY, this.animal, {
      width: spriteW,
      height: spriteH,
      stateOverride: 'playing',
    });
    this.container.add(sprite);
    this.dogSprite = sprite;
    this.dogTarget = { x: dogCX, y: dogCY - spriteH * 0.1 };

    // Subtle excited bounce
    this.tweens.add({
      targets: sprite,
      y: dogCY - 6,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Tennis-ball button at bottom-right
    const ballSize = 80;
    const ballX = width - ballSize / 2 - 30;
    const ballY = height - ballSize / 2 - 70;
    this.ballHome = { x: ballX, y: ballY };
    this.ball = this.makeBallContainer(ballX, ballY, ballSize);
    this.container.add(this.ball);

    // "drag me!" label above the ball
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

    // Cream circular frame
    const frame = this.add.graphics();
    frame.fillStyle(0x7a4b15, 1);
    frame.fillCircle(0, 0, size / 2 + 2);
    frame.fillStyle(0xf5ecd0, 1);
    frame.fillCircle(0, 0, size / 2 - 2);
    c.add(frame);

    // Ball emoji inside
    const ballEmoji = this.add.text(0, 0, '🎾', {
      fontSize: `${Math.floor(size * 0.75)}px`,
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    c.add(ballEmoji);

    c.setSize(size + 20, size + 20);
    c.setInteractive({ useHandCursor: true, draggable: true });
    this.input.setDraggable(c);

    // Gentle pulse
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

    // Tap-only fallback — if player just taps without dragging, dragend
    // still fires, so we also treat a plain pointerup as a throw in case
    // the drag system didn't engage.
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

    // Tween ball to dog, arcing slightly (approximated with a scale dip)
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
        // Dog leans forward briefly
        if (this.dogSprite) {
          this.tweens.add({
            targets: this.dogSprite,
            scaleX: (this.dogSprite as Phaser.GameObjects.Image).scaleX * 1.04,
            scaleY: (this.dogSprite as Phaser.GameObjects.Image).scaleY * 1.04,
            duration: 120,
            yoyo: true,
          });
        }

        // Ball vanishes, count the throw, reset for next throw.
        this.ball?.setVisible(false);
        this.throwsDone += 1;
        this.updatePawDots();

        // Small sparkle at the dog
        this.emitCatchSparkles(target.x, target.y);

        this.time.delayedCall(350, () => {
          if (this.throwsDone >= this.throwsNeeded) {
            this.finishGame();
            return;
          }
          // Respawn ball at home
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

  private emitCatchSparkles(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const sparkle = this.add.text(x, y, '✨', {
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

  private finishGame(): void {
    // Apply the gameplay reward up-front so the done screen can display
    // final values if we ever want to; the onComplete callback will
    // receive the mutated animals array.
    const idx = this.allAnimals.findIndex((a) => a.id === this.animal.id);
    if (idx >= 0) {
      const played = applyPlay(this.allAnimals[idx]);
      // "Perfect" bonus — +3 bond on top of the usual play reward.
      played.bondLevel = Math.min(100, played.bondLevel + 3);
      played.happiness = Math.min(100, played.happiness + 2);
      this.allAnimals[idx] = played;
      this.animal = played;
    }
    this.phase = 'done';
    this.renderView();
  }

  private renderDone(width: number, height: number): void {
    // Happy green wash
    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height, 0xe8f5e9, 0.85)
    );

    this.renderHud(width, '🎾 Great game!');

    // Sparkles around the title
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

    this.container.add(
      this.add.text(width / 2, height / 2 - 8,
        '+2 bond!', {
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
      createButton(this, width / 2, height / 2 + 90, 'Back to Centre', () => {
        this.exitScene(true);
      }, { width: 240 })
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Non-dog placeholder
  // ──────────────────────────────────────────────────────────────

  private renderPlaceholder(width: number, height: number): void {
    this.renderHud(width, '🎾 Playtime!');

    const cy = height / 2 + 20;
    const spriteW = Math.min(320, width * 0.5);
    const spriteH = Math.min(280, height * 0.5);
    const sprite = createAnimalSprite(this, width / 2, cy, this.animal, {
      width: spriteW,
      height: spriteH,
      stateOverride: 'playing',
    });
    this.container.add(sprite);
    this.tweens.add({
      targets: sprite,
      y: cy - 6,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.container.add(
      this.add.text(width / 2, 100, 'Coming soon!', {
        fontSize: '32px',
        fontFamily: FONTS.title,
        fontStyle: 'bold',
        color: COLOURS.primary,
        resolution: TEXT_RESOLUTION,
        shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,0.25)', blur: 3, fill: true },
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, 140,
        `A play game for ${this.animal.name} is on the way.`, {
          fontSize: '16px',
          fontFamily: FONTS.body,
          color: COLOURS.text,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
    );

    this.container.add(
      createButton(this, width / 2, height - 90, 'Done playing!', () => {
        this.exitScene(false);
      }, { width: 240, bgColour: COLOURS.primary })
    );

    this.renderHintStrip(width, height, 'the keepers are still building this one…');
  }

  // ──────────────────────────────────────────────────────────────
  // Exit
  // ──────────────────────────────────────────────────────────────

  private exitScene(perfect: boolean): void {
    if (this.onComplete) {
      this.onComplete(this.allAnimals, { perfect });
    }
    this.scene.start('GameScene');
  }
}
