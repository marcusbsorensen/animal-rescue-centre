import Phaser from 'phaser';
import type { Animal, Species } from '@arc/shared-types';
import { COLOURS, FONTS, TEXT_RESOLUTION, SAFE_MARGIN, MIN_FONT } from '../ui/constants';
import { createChromeButton, createTextButton, createChromeTitle, createPanel, createAmbientParticles } from '../ui/UIButton';
import {
  generateKitchenRound,
  isFoodValidForSpecies,
  applyFeeding,
  SPECIES_COLOURS,
} from '@arc/game-logic';
import type { FoodDefinition } from '@arc/game-logic';
import { createFoodSprite, createAnimalSprite } from '../ui/sprites';
import { pillFor } from '../ui/contrast';
import { useRetinaText } from '../ui/retina-text';
import { AudioManager } from '../audio/AudioManager';
import { RoomAnchors } from '../lib/RoomAnchors';

/**
 * KitchenMinigameScene — food-sorting drag-drop game.
 *
 * The painted bowls on the `bg-kitchen.png` background are the real drop
 * targets. Hungry animal sprites sit on the counter above "their" bowl via
 * kitchen-bowls anchors (editable via /admin/anchors.html). Food items live
 * on a prep tray along the bottom; drag them onto the bowl in front of the
 * correct animal.
 */

/**
 * Fallback bowl slots used when `kitchen-bowls` anchors aren't defined in
 * room-anchors.json. Coordinates are fractions of the kitchen background
 * (bg-kitchen.png — 4 bowls left→right: blue, yellow, red, green).
 */
const FALLBACK_BOWL_SLOTS: { x: number; y: number }[] = [
  { x: 0.245, y: 0.560 }, // blue
  { x: 0.420, y: 0.560 }, // yellow
  { x: 0.605, y: 0.595 }, // red
  { x: 0.790, y: 0.565 }, // green
];

export class KitchenMinigameScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;
  private hungryAnimals: Animal[] = [];
  private allAnimals: Animal[] = [];
  private onComplete?: (animals: Animal[]) => void;

  private foodItems: FoodDefinition[] = [];
  private fedAnimals: Set<string> = new Set();

  private feedbackText?: Phaser.GameObjects.Text;
  private progressText?: Phaser.GameObjects.Text;

  /** Bowl positions keyed by animal id */
  private bowlPositions: Map<string, { x: number; y: number; species: Species }> = new Map();
  /** Food sprite origin positions keyed by food index */
  private foodOrigins: Map<number, { x: number; y: number }> = new Map();

  private correctCount = 0;

  constructor() {
    super({ key: 'KitchenMinigameScene' });
  }

  init(data: {
    hungryAnimals: Animal[];
    allAnimals: Animal[];
    onComplete: (animals: Animal[]) => void;
  }): void {
    this.hungryAnimals = data.hungryAnimals || [];
    this.allAnimals = [...(data.allAnimals || [])];
    this.onComplete = data.onComplete;
    this.fedAnimals = new Set();
    this.correctCount = 0;
    this.bowlPositions = new Map();
    this.foodOrigins = new Map();
  }

  create(): void {
    // One straggler out of ten styles here, which is exactly the shape
    // this helper exists for — a list of call sites nobody can keep whole.
    useRetinaText(this);

    const { width, height } = this.scale;
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('kitchen');

    // Fade-in transition
    this.cameras.main.fadeIn(400, 245, 235, 224);

    // Painted kitchen background — this is what we're going to interact with
    if (this.textures.exists('bg-kitchen')) {
      const bg = this.add.image(width / 2, height / 2, 'bg-kitchen');
      bg.setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0xfff8e7);
    }

    // Title pill
    createChromeTitle(this, width / 2, 34, 'Sort the Food!', {
      fontSize: '20px', icon: 'icon-kitchen',
    });

    // Top info card — progress + instructions on a translucent pill so they
    // stay readable against the painted counter.
    this.createTopInfoPanel(width);

    // Generate food round
    const hungrySpecies = this.hungryAnimals.map((a) => a.species);
    this.foodItems = generateKitchenRound(hungrySpecies, Math.min(4, 15 - hungrySpecies.length));

    // Layout: animals on counter above painted bowls + prep tray along the bottom
    this.createBowlsAndAnimals(width, height);
    this.createPrepTray(width, height);

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

    // Back button — proper button, not a floating text link.
    //
    // Anchored by its left edge rather than by a guessed centre. The 59
    // here was half of the 110 the caller asked for plus a bit, and the
    // button actually measures 121 wide, so its edge landed at 14px —
    // inside the margin, on every viewport. `anchor` makes the number
    // written the number measured.
    createChromeButton(this, SAFE_MARGIN, height - SAFE_MARGIN, 'Back', () => this.exitMinigame(), {
      width: 110, fontSize: '14px', icon: 'icon-back', iconStyle: 'glyph',
      anchor: { x: 'left', y: 'bottom' },
    });
  }

  /**
   * Top info panel — shows "Fed X/Y" + "Drag food to the bowl in front of
   * each animal" on a rounded translucent card so the text stays legible
   * against the busy painted counter.
   */
  private createTopInfoPanel(width: number): void {
    const panelCy = 78;
    const panelW = Math.min(520, width - 40);
    const panelH = 44;
    createPanel(this, width / 2, panelCy, panelW, panelH, {
      fillColour: 0xffffff, fillAlpha: 0.92,
      borderColour: 0xd4a017, borderWidth: 2, radius: 22, shadow: false,
    });

    const n = this.hungryAnimals.length;
    this.progressText = this.add.text(width / 2 - panelW / 2 + 18, panelCy,
      `Fed 0 / ${n}`, {
      fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0.5);

    this.add.text(width / 2 + 20, panelCy,
      'Drag food to the bowl in front of each animal', {
      fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body,
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5, 0.5);
  }

  /**
   * Place hungry animals on the counter above their bowl, and wire each
   * painted bowl to an invisible drop zone.
   *
   * Uses anchors from room-anchors.json under `kitchen-bowls.slot.eating` if
   * present (editable via /admin/anchors.html), otherwise falls back to
   * hardcoded fractional coords measured from bg-kitchen.png.
   */
  private createBowlsAndAnimals(width: number, height: number): void {
    const slots = this.loadBowlSlots(width, height);
    const animals = this.hungryAnimals.slice(0, slots.length);

    const spriteW = 192;
    const spriteH = 184;

    for (let i = 0; i < animals.length; i++) {
      const animal = animals[i];
      const bowl = slots[i];

      // Animal sprite sits on the counter just behind/above the bowl — feet
      // near the back rim so it reads "eating from bowl". The 0.26 was a
      // 0.52 of a box that drew at twice its size; the offset on screen is
      // unchanged.
      const animalCy = bowl.y - spriteH * 0.26;
      const sprite = createAnimalSprite(this, bowl.x, animalCy, animal, {
        width: spriteW, height: spriteH,
      });
      // Gentle idle bob
      this.tweens.add({
        targets: sprite,
        y: sprite.y - 2,
        duration: 1400 + i * 120,
        yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 180,
      });

      // Name plate above the sprite. Off the drawn top edge, not off the
      // box: `animalCy - spriteH * 0.5 - 16` was 30px *inside* the animal's
      // head, because the sprite drew at twice the box the plate measured
      // itself against. Clamped so a tall animal near the top of the
      // counter does not push its own name off the screen.
      const nameY = Math.max(20, sprite.getBounds().top - 14);
      // White on the species colour is the same failure as the room's name
      // pills — 1.50:1 on a bunny. Ink and fill both come from luminance.
      const pill = pillFor(SPECIES_COLOURS[animal.species]);
      const pillHex = pill.fill.toString(16).padStart(6, '0');
      const nameText = this.add.text(bowl.x, nameY, animal.name, {
        fontSize: `${MIN_FONT.small}px`,
        fontFamily: FONTS.body,
        fontStyle: 'bold',
        color: pill.ink,
        padding: { x: 10, y: 3 },
        backgroundColor: `#${pillHex}`,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);
      // Subtle shadow behind the pill
      const pillShadow = this.add.graphics();
      pillShadow.fillStyle(0x000000, 0.22);
      pillShadow.fillRoundedRect(
        nameText.x - nameText.width / 2,
        nameText.y - nameText.height / 2 + 1,
        nameText.width, nameText.height, 6
      );
      pillShadow.setDepth(nameText.depth - 1);

      // Soft highlight ring on the painted bowl so kids can see the drop target
      const ring = this.add.graphics();
      ring.lineStyle(3, SPECIES_COLOURS[animal.species], 0.85);
      ring.strokeEllipse(bowl.x, bowl.y, 100, 40);
      this.tweens.add({
        targets: ring, alpha: 0.35,
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });

      // Invisible drop zone covering the painted bowl
      const dropZone = this.add.rectangle(bowl.x, bowl.y, 120, 60, 0xffffff, 0)
        .setInteractive({ dropZone: true })
        .setData('animalId', animal.id)
        .setData('species', animal.species);
      // Phaser wants the zone referenced to avoid GC; setData serves that.
      void dropZone;

      this.bowlPositions.set(animal.id, { x: bowl.x, y: bowl.y, species: animal.species });
    }

    // If more animals are hungry than we have bowls, show a little note so
    // kids know they'll be back to the queue next time.
    if (this.hungryAnimals.length > slots.length) {
      const left = this.hungryAnimals.length - slots.length;
      this.add.text(width / 2, height * 0.68,
        `+${left} more waiting in the corridor…`, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'italic',
        color: '#6b4020',
        backgroundColor: '#fff6e8',
        padding: { x: 10, y: 4 },
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);
    }
  }

  /**
   * Resolve bowl slot positions. Prefers anchors from room-anchors.json so
   * Marcus can tune them visually in /admin/anchors.html. Falls back to the
   * hardcoded fractional coords if anchors aren't loaded yet or the
   * kitchen-bowls entry is missing.
   */
  private loadBowlSlots(width: number, height: number): { x: number; y: number }[] {
    const anchors = RoomAnchors.getInstance();
    const fromJson = anchors.get('kitchen-bowls', 'slot', 'eating');
    const source = fromJson.length > 0 ? fromJson : FALLBACK_BOWL_SLOTS;
    return source.map((a) => ({ x: a.x * width, y: a.y * height }));
  }

  /**
   * Prep tray along the bottom — rounded translucent panel holding the
   * draggable food items.
   */
  private createPrepTray(width: number, height: number): void {
    const trayH = 110;
    const trayCy = height - trayH / 2 - 80;
    const trayW = Math.min(width - 40, 900);

    // Panel behind the tray
    createPanel(this, width / 2, trayCy, trayW, trayH, {
      fillColour: 0xfff6e8, fillAlpha: 0.94,
      borderColour: 0xd4a017, borderWidth: 2, radius: 18,
    });

    // Label sitting ABOVE the tray (not inside — avoids overlap with food)
    this.add.text(width / 2, trayCy - trayH / 2 - 12, 'Prep Surface', {
      fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
      color: '#6b4020', resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);

    // Place food items evenly along the tray
    const count = this.foodItems.length;
    if (count === 0) return;
    const itemSpacing = Math.min(140, (trayW - 60) / count);
    const startX = width / 2 - ((count - 1) * itemSpacing) / 2;

    for (let i = 0; i < count; i++) {
      const food = this.foodItems[i];
      const x = startX + i * itemSpacing;
      const y = trayCy;
      this.foodOrigins.set(i, { x, y });
      this.createDraggableFood(food, x, y, i);
    }

    // Drag events (one listener, reads data attributes to route correctly)
    this.input.on('drag', (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.Container,
      dragX: number, dragY: number,
    ) => {
      gameObject.x = dragX;
      gameObject.y = dragY;
    });

    this.input.on('drop', (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.Container,
      dropZone: Phaser.GameObjects.Rectangle,
    ) => {
      const foodType = gameObject.getData('foodType') as string;
      const foodIdx = gameObject.getData('foodIdx') as number;
      const species = dropZone.getData('species') as Species;
      const animalId = dropZone.getData('animalId') as string;

      if (this.fedAnimals.has(animalId)) {
        this.bounceBack(gameObject, foodIdx, 'Already fed!');
        return;
      }

      if (isFoodValidForSpecies(foodType, species)) {
        this.handleCorrectDrop(gameObject, animalId, species);
      } else {
        this.bounceBack(gameObject, foodIdx, 'Hmm, that\'s not quite right! Try another bowl.');
      }
    });

    this.input.on('dragend', (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.Container,
      dropped: boolean,
    ) => {
      if (!dropped) {
        const foodIdx = gameObject.getData('foodIdx') as number;
        this.bounceBack(gameObject, foodIdx);
      }
    });
  }

  /** Create a single draggable food item. */
  private createDraggableFood(food: FoodDefinition, x: number, y: number, index: number): void {
    const bg = this.add.circle(0, 0, 40, 0xffffff, 0.85)
      .setStrokeStyle(2, 0xd4c8b8, 0.85);
    const foodSprite = createFoodSprite(this, 0, -8, food.type, food.emoji, 50);
    const label = this.add.text(0, 26, food.label, {
      fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, foodSprite, label]);
    container.setSize(84, 84);
    container.setInteractive({ draggable: true, useHandCursor: true });
    container.setData('foodType', food.type);
    container.setData('foodIdx', index);

    container.on('dragstart', () => {
      container.setScale(1.15);
      container.setDepth(10);
    });
    container.on('dragend', () => {
      container.setScale(1);
      container.setDepth(0);
    });

    this.input.setDraggable(container);
  }

  private handleCorrectDrop(
    gameObject: Phaser.GameObjects.Container,
    animalId: string,
    _species: Species,
  ): void {
    this.fedAnimals.add(animalId);
    this.correctCount++;
    AudioManager.getInstance().playSfx('food_correct');

    if (this.progressText) {
      this.progressText.setText(`Fed ${this.fedAnimals.size} / ${this.hungryAnimals.length}`);
    }

    // Apply feeding to the animal in our local state
    const idx = this.allAnimals.findIndex((a) => a.id === animalId);
    if (idx >= 0) {
      this.allAnimals[idx] = applyFeeding(this.allAnimals[idx]);
      this.allAnimals[idx].bondLevel = Math.min(100, this.allAnimals[idx].bondLevel + 3);
    }

    const bowl = this.bowlPositions.get(animalId);

    // Success animation — food shrinks into the painted bowl
    this.tweens.add({
      targets: gameObject,
      x: bowl?.x ?? gameObject.x,
      y: bowl?.y ?? gameObject.y,
      scaleX: 0,
      scaleY: 0,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => gameObject.destroy(),
    });

    this.showFeedback('Yum! That\'s perfect! +3 bond', COLOURS.primary);
    if (bowl) this.createStarBurst(bowl.x, bowl.y);

    if (this.fedAnimals.size >= Math.min(this.hungryAnimals.length, this.bowlPositions.size)) {
      this.time.delayedCall(800, () => this.showCompletionScreen());
    }
  }

  private bounceBack(
    gameObject: Phaser.GameObjects.Container,
    foodIdx: number,
    message?: string,
  ): void {
    const origin = this.foodOrigins.get(foodIdx);
    if (!origin) return;

    if (message) {
      AudioManager.getInstance().playSfx('food_wrong');
      this.showFeedback(message, COLOURS.textLight);
    }

    this.tweens.add({
      targets: gameObject,
      x: origin.x, y: origin.y,
      duration: 350, ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: gameObject,
      angle: { from: -8, to: 8 },
      duration: 80, yoyo: true, repeat: 2,
      onComplete: () => gameObject.setAngle(0),
    });
  }

  private showFeedback(message: string, colour: string): void {
    if (this.feedbackText) this.feedbackText.destroy();

    const { width } = this.scale;
    this.feedbackText = this.add.text(width / 2, 132, message, {
      fontSize: '16px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: colour,
      backgroundColor: '#ffffff',
      padding: { x: 14, y: 6 },
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: this.feedbackText, alpha: 1, duration: 200 });
    this.time.delayedCall(2000, () => {
      if (this.feedbackText) {
        this.tweens.add({ targets: this.feedbackText, alpha: 0, duration: 400 });
      }
    });
  }

  private createStarBurst(x: number, y: number): void {
    const starColours = [0xffd700, 0xffaa00, 0xff8800, 0xffdd00, 0xffcc44];
    for (let i = 0; i < 5; i++) {
      const star = this.add.circle(x, y, 8, starColours[i % starColours.length]);
      const angle = (i / 5) * Math.PI * 2;
      this.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * 50,
        y: y + Math.sin(angle) * 50,
        alpha: 0, scale: 0.3,
        duration: 600, ease: 'Power2',
        onComplete: () => star.destroy(),
      });
    }
  }

  private showCompletionScreen(): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4);

    const panelW = 380, panelH = 240;
    createPanel(this, width / 2, height / 2, panelW, panelH, {
      fillColour: 0xffffff, fillAlpha: 1,
      borderColour: Phaser.Display.Color.HexStringToColor(COLOURS.primary).color,
      borderWidth: 3, radius: 16,
    });

    this.add.text(width / 2, height / 2 - 70, 'All Fed!', {
      fontSize: '32px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: COLOURS.primary, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 20,
      `You sorted ${this.correctCount} meal${this.correctCount === 1 ? '' : 's'} correctly!`, {
      fontSize: '18px', fontFamily: FONTS.body,
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 10, 'Every animal got a tasty meal!', {
      fontSize: '15px', fontFamily: FONTS.body,
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);

    createAmbientParticles(this, [], { count: 10, minAlpha: 0.1, maxAlpha: 0.25 });

    createChromeButton(this, width / 2, height / 2 + 60, 'Back to Centre', () => {
      this.exitMinigame();
    }, { width: 220, icon: 'icon-back', iconStyle: 'glyph', variant: 'filled' });
  }

  private exitMinigame(): void {
    this.registry.set('updatedAnimals', this.allAnimals);
    this.scene.start('GameScene');
  }
}
