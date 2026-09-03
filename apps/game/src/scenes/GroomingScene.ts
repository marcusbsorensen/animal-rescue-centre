import Phaser from 'phaser';
import type { Animal, Species } from '@arc/shared-types';
import { COLOURS, FONTS, TEXT_RESOLUTION, MIN_FONT, bottomAnchorY, TYPE } from '../ui/constants';
import { createChromeButton, createTextButton, createChromeTitle, createAmbientParticles } from '../ui/UIButton';
import { applyGrooming } from '@arc/game-logic';
import { createAnimalSprite } from '../ui/sprites';
import { AudioManager } from '../audio/AudioManager';

type Phase = 'intro' | 'brushing' | 'done';

// Grooming tool per species — we match the real-world tool kids would
// associate with that animal's care rather than a generic shampoo bottle.
// Furry animals get a brush; snakes get a soft cloth; parrots get a
// water-mist (birds are "bathed" by gentle misting).
const GROOMING_TOOL: Record<Species, { emoji: string; label: string; verb: string }> = {
  cat:    { emoji: '🪮', label: 'Brush',    verb: 'Brush brush!' },
  dog:    { emoji: '🪮', label: 'Brush',    verb: 'Brush brush!' },
  fox:    { emoji: '🪮', label: 'Brush',    verb: 'Brush brush!' },
  bunny:  { emoji: '🪮', label: 'Brush',    verb: 'Brush brush!' },
  bat:    { emoji: '🪮', label: 'Brush',    verb: 'Brush brush!' },
  snake:  { emoji: '🧽', label: 'Cloth',    verb: 'Wipe wipe!' },
  parrot: { emoji: '💧', label: 'Mist',     verb: 'Spritz spritz!' },
  hedgehog: { emoji: '🪥', label: 'Soft brush', verb: 'Gentle brush!' },
};

interface DirtSpot {
  gfx: Phaser.GameObjects.Arc;
  x: number;
  y: number;
  cleared: boolean;
}

/**
 * GroomingScene — brush minigame.
 *
 * Player drags across the animal to clear dirt spots. When all dirt is cleared,
 * applyGrooming runs (cleanliness=100, +5 happiness, +2 bond).
 */
export class GroomingScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;
  private animal!: Animal;
  private allAnimals: Animal[] = [];
  private onComplete?: (animals: Animal[]) => void;

  private phase: Phase = 'intro';
  private container!: Phaser.GameObjects.Container;
  private dirtSpots: DirtSpot[] = [];
  private totalDirt = 0;
  private isDragging = false;
  private brushIcon?: Phaser.GameObjects.Text;
  private cleanlinessFill?: Phaser.GameObjects.Graphics;
  private cleanlinessLabel?: Phaser.GameObjects.Text;
  private encouragementText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GroomingScene' });
  }

  init(data: {
    animal: Animal;
    allAnimals: Animal[];
    onComplete?: (animals: Animal[]) => void;
  }): void {
    this.animal = data.animal;
    this.allAnimals = [...(data.allAnimals || [])];
    this.onComplete = data.onComplete;
    this.phase = 'intro';
    this.dirtSpots = [];
    this.totalDirt = 0;
    this.isDragging = false;
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

    this.renderView();
  }

  private clearView(): void {
    this.container.removeAll(true);
    this.dirtSpots = [];
    this.brushIcon = undefined;
    this.cleanlinessFill = undefined;
    this.cleanlinessLabel = undefined;
    this.encouragementText = undefined;
  }

  private renderView(): void {
    this.clearView();
    const { width, height } = this.scale;

    // Background — sudsy cream
    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height, 0xf0f8ff)
    );

    // Title pill
    this.container.add(
      createChromeTitle(this, width / 2, 35, 'Grooming', { fontSize: '20px' })
    );

    if (this.phase === 'intro') {
      this.renderIntro(width, height);
    } else if (this.phase === 'brushing') {
      this.renderBrushing(width, height);
    } else {
      this.renderDone(width, height);
    }
  }

  private renderIntro(width: number, height: number): void {
    const cy = height / 2 - 40;

    // Big animal sprite
    const sprite = createAnimalSprite(this, width / 2, cy, this.animal, { width: 360, height: 320 });
    this.container.add(sprite);

    // Tailor intro copy to the species so brush/cloth/mist reads naturally.
    const tool = GROOMING_TOOL[this.animal.species];
    const introMsg: Record<Species, string> = {
      cat:    `${this.animal.name} needs a good brush!`,
      dog:    `${this.animal.name} needs a good brush!`,
      fox:    `${this.animal.name} needs a good brush!`,
      bunny:  `${this.animal.name} needs a good brush!`,
      bat:    `${this.animal.name} needs a good brush!`,
      snake:  `${this.animal.name} needs a gentle wipe down!`,
      parrot: `${this.animal.name} needs a light mist!`,
      hedgehog: `${this.animal.name} needs a gentle soft-brush!`,
    };
    this.container.add(
      this.add.text(width / 2, cy + 110, introMsg[this.animal.species], {
        fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    const startLabel: Record<Species, string> = {
      cat:    'Start brushing!',
      dog:    'Start brushing!',
      fox:    'Start brushing!',
      bunny:  'Start brushing!',
      bat:    'Start brushing!',
      snake:  'Start wiping!',
      parrot: 'Start misting!',
      hedgehog: 'Start brushing!',
    };
    this.container.add(
      createChromeButton(this, width / 2, cy + 170, startLabel[this.animal.species], () => {
        this.phase = 'brushing';
        this.renderView();
      }, { width: 240, variant: 'filled' })
    );

    // Back button
    this.container.add(
      createTextButton(this, width / 2, bottomAnchorY(height), '← Back to centre', () => {
        this.exitScene();
      })
    );
  }

  private renderBrushing(width: number, height: number): void {
    // Cleanliness bar at top
    const barY = 75;
    const barW = 260;
    const barX = width / 2 - barW / 2;
    this.container.add(
      this.add.text(width / 2, barY - 14, 'Cleanliness', {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );
    const track = this.add.graphics();
    track.fillStyle(0xdddddd, 1);
    track.fillRoundedRect(barX, barY, barW, 14, 7);
    this.container.add(track);

    this.cleanlinessFill = this.add.graphics();
    this.container.add(this.cleanlinessFill);

    this.cleanlinessLabel = this.add.text(barX + barW + 8, barY + 7, '0%', {
      fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0.5);
    this.container.add(this.cleanlinessLabel);

    // Encouragement text — verb matches the tool (brush/cloth/mist)
    const tool = GROOMING_TOOL[this.animal.species];
    this.encouragementText = this.add.text(width / 2, barY + 36, tool.verb, {
      fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: COLOURS.info, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    this.container.add(this.encouragementText);

    // Animal sprite centre
    const spriteCX = width / 2;
    const spriteCY = height / 2 + 20;
    const sprite = createAnimalSprite(this, spriteCX, spriteCY, this.animal, { width: 520, height: 440 });
    this.container.add(sprite);

    // Dirt spots, scattered over the middle two fifths of the animal that
    // is actually on screen. Off the drawn size, not the box: the box is
    // 520 wide and the square art fits to 440, so a spread taken from the
    // box would put spots on the floor either side of the animal.
    const dirtCount = 10;
    const halfW = sprite.displayWidth * 0.2;
    const halfH = sprite.displayHeight * 0.2;
    for (let i = 0; i < dirtCount; i++) {
      const dx = spriteCX + (Math.random() * 2 - 1) * halfW;
      const dy = spriteCY + (Math.random() * 2 - 1) * halfH;
      const radius = 10 + Math.random() * 6;
      const colour = Math.random() > 0.5 ? 0x8b6f47 : 0x6b5a4a;
      const spot = this.add.circle(dx, dy, radius, colour, 0.65)
        .setStrokeStyle(1, 0x3a2e22, 0.4);
      this.container.add(spot);
      this.dirtSpots.push({ gfx: spot, x: dx, y: dy, cleared: false });
    }
    this.totalDirt = this.dirtSpots.length;

    // Grooming-tool cursor that follows pointer — a brush for fur, a cloth
    // for snakes, a water mist for parrots. Matches what the animal would
    // actually want so kids learn real-world care.
    this.brushIcon = this.add.text(-100, -100, tool.emoji, {
      fontSize: '40px', fontFamily: FONTS.body
    }).setOrigin(0.5).setDepth(1000);
    this.container.add(this.brushIcon);

    // Pointer handlers
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.events.once('shutdown', () => {
      this.input.off('pointerdown', this.handlePointerDown, this);
      this.input.off('pointermove', this.handlePointerMove, this);
      this.input.off('pointerup', this.handlePointerUp, this);
    });

    this.updateCleanlinessBar();

    // Back button
    this.container.add(
      createTextButton(this, width / 2, bottomAnchorY(height), '← Back to centre', () => {
        this.exitScene();
      })
    );
  }

  private handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    this.isDragging = true;
    this.brushPass(pointer.x, pointer.y);
  };

  private handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.brushIcon) {
      this.brushIcon.setPosition(pointer.x + 18, pointer.y - 12);
    }
    if (!this.isDragging) return;
    this.brushPass(pointer.x, pointer.y);
  };

  private handlePointerUp = (): void => {
    this.isDragging = false;
  };

  private brushPass(px: number, py: number): void {
    const threshold = 25;
    let clearedThisPass = false;
    for (const spot of this.dirtSpots) {
      if (spot.cleared) continue;
      const dx = spot.x - px;
      const dy = spot.y - py;
      if (dx * dx + dy * dy <= threshold * threshold) {
        spot.cleared = true;
        clearedThisPass = true;
        this.tweens.add({
          targets: spot.gfx,
          scale: 0,
          alpha: 0,
          duration: 200,
          onComplete: () => spot.gfx.destroy(),
        });
      }
    }
    if (clearedThisPass) {
      this.updateCleanlinessBar();
      const remaining = this.dirtSpots.filter((s) => !s.cleared).length;
      if (remaining === 0) {
        this.time.delayedCall(300, () => this.finishBrushing());
      }
    }
  }

  private updateCleanlinessBar(): void {
    if (!this.cleanlinessFill || !this.cleanlinessLabel) return;
    const cleared = this.dirtSpots.filter((s) => s.cleared).length;
    const pct = this.totalDirt > 0 ? cleared / this.totalDirt : 1;
    const { width } = this.scale;
    const barW = 260;
    const barX = width / 2 - barW / 2;
    const barY = 75;
    this.cleanlinessFill.clear();
    if (pct > 0.01) {
      this.cleanlinessFill.fillStyle(0x5A9CB8, 1);
      this.cleanlinessFill.fillRoundedRect(barX, barY, Math.max(14, barW * pct), 14, 7);
    }
    this.cleanlinessLabel.setText(`${Math.round(pct * 100)}%`);
    if (this.encouragementText) {
      const tool = GROOMING_TOOL[this.animal.species];
      if (pct >= 1) {
        this.encouragementText.setText('Sparkly clean!');
      } else if (pct >= 0.6) {
        this.encouragementText.setText('Almost there!');
      } else {
        this.encouragementText.setText(tool.verb);
      }
    }
  }

  private finishBrushing(): void {
    // Apply grooming to the entry in `allAnimals`, NOT to `this.animal`.
    //
    // `this.animal` is the object GameScene captured when it drew the
    // details popup, and `applyGrooming` spreads whatever it is given —
    // so grooming the captured copy and writing the result back over the
    // live entry silently reverts every field that changed while the
    // popup was open. GameScene's needs tick runs every 2 seconds, and
    // it is also where `applySickness` writes, so a groom could roll back
    // an illness the animal had just developed while leaving it in
    // `store.sickAnimals` — health restored, still listed as sick.
    //
    // WalkScene already does it this way (it spreads `allAnimals[idx]`).
    const idx = this.allAnimals.findIndex((a) => a.id === this.animal.id);
    const groomed = applyGrooming(idx >= 0 ? this.allAnimals[idx] : this.animal);
    this.animal = groomed;
    if (idx >= 0) {
      this.allAnimals[idx] = groomed;
    }
    this.phase = 'done';
    this.renderView();
  }

  private renderDone(width: number, height: number): void {
    // Happy green wash
    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height, 0xe8f5e9)
    );

    // Celebration sparkles
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const sparkle = this.add.circle(
        width / 2 + Math.cos(angle) * 100,
        height / 2 - 40 + Math.sin(angle) * 70,
        8, 0x7CC76E
      ).setAlpha(0);
      this.container.add(sparkle);
      this.tweens.add({
        targets: sparkle,
        alpha: 1, scale: { from: 0.3, to: 1 },
        duration: 500, delay: i * 80,
        yoyo: true, repeat: -1, hold: 800,
      });
    }

    this.container.add(
      createChromeTitle(this, width / 2, 35, 'Grooming', { fontSize: '20px' })
    );

    this.container.add(
      this.add.text(width / 2, height / 2 - 80, 'All clean!', {
        fontSize: '32px', fontFamily: FONTS.title, color: COLOURS.primary,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 - 30,
        `${this.animal.name} looks sparkly!`, {
        fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 + 5,
        '+5 happiness   +2 bond   cleanliness 100', {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    this.container.add(
      createAmbientParticles(this, [], { count: 10, minAlpha: 0.1, maxAlpha: 0.25 })
    );

    this.container.add(
      createChromeButton(this, width / 2, height / 2 + 70, 'Back to Centre', () => {
        this.exitScene();
      }, { width: 240, icon: 'icon-back', iconStyle: 'glyph', variant: 'filled' })
    );
  }

  private exitScene(): void {
    this.registry.set('updatedAnimals', this.allAnimals);
    this.registry.set('groomResult', { animalId: this.animal.id, cleaned: this.phase === 'done' });
    if (this.onComplete) {
      this.onComplete(this.allAnimals);
    }
    this.scene.start('GameScene');
  }
}
