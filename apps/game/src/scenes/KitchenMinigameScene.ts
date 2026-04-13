import Phaser from 'phaser';
import type { Animal, Species } from '@arc/shared-types';
import { COLOURS, FONTS } from '../ui/constants';
import { createButton, createTextButton, createPillTitle, createPanel, createAmbientParticles } from '../ui/UIButton';
import {
  generateKitchenRound,
  isFoodValidForSpecies,
  applyFeeding,
  SPECIES_COLOURS,
} from '@arc/game-logic';
import type { FoodDefinition } from '@arc/game-logic';
import { createFoodSprite } from '../ui/sprites';
import { AudioManager } from '../audio/AudioManager';

/**
 * KitchenMinigameScene — Phase 3 food-sorting drag-drop game.
 *
 * Hungry animals sit at bowls around the edges.
 * Food items are scattered on a central prep surface.
 * Drag the right food to the right animal's bowl → feeding animation.
 * Wrong pairing → food bounces back with a gentle wobble.
 */
export class KitchenMinigameScene extends Phaser.Scene {
  /** Hungry animals passed in from GameScene */
  private hungryAnimals: Animal[] = [];
  /** All animals (so we can update the fed ones) */
  private allAnimals: Animal[] = [];
  /** Callback to return updated animals to GameScene */
  private onComplete?: (animals: Animal[]) => void;

  /** Food items for this round */
  private foodItems: FoodDefinition[] = [];
  /** Track which animals have been fed (by id) */
  private fedAnimals: Set<string> = new Set();

  /** Phaser containers */
  private prepContainer!: Phaser.GameObjects.Container;
  private bowlsContainer!: Phaser.GameObjects.Container;
  private feedbackText?: Phaser.GameObjects.Text;
  private progressText?: Phaser.GameObjects.Text;

  /** Bowl positions keyed by animal id */
  private bowlPositions: Map<string, { x: number; y: number; species: Species }> = new Map();
  /** Food sprite origin positions keyed by food index */
  private foodOrigins: Map<number, { x: number; y: number }> = new Map();

  /** Score tracking */
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
    const { width, height } = this.scale;
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('kitchen');

    // Fade-in transition
    this.cameras.main.fadeIn(400, 245, 235, 224);

    // Background — kitchen art or warm colour fallback
    if (this.textures.exists('bg-kitchen')) {
      const bg = this.add.image(width / 2, height / 2, 'bg-kitchen');
      bg.setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0xfff8e7);
    }

    // Title
    createPillTitle(this, width / 2, 30, '🍽️ Sort the Food!', { bgColour: 0xD4A017, fontSize: '20px' });

    // Progress counter — shows how many animals still need feeding
    this.progressText = this.add.text(width / 2, 62,
      `Fed: 0 / ${this.hungryAnimals.length}`, {
      fontSize: '16px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.text,
    }).setOrigin(0.5);

    this.add.text(width / 2, 82, 'Drag each food to the right animal\'s bowl', {
      fontSize: '16px',
      fontFamily: FONTS.body,
      color: COLOURS.textLight,
    }).setOrigin(0.5);

    // Generate food round
    const hungrySpecies = this.hungryAnimals.map((a) => a.species);
    this.foodItems = generateKitchenRound(hungrySpecies, Math.min(4, 15 - hungrySpecies.length));

    // Layout bowls and prep surface
    this.createBowls(width, height);
    this.createPrepSurface(width, height);
    this.createFeedbackArea(width, height);

    // Back button
    createTextButton(this, width / 2, height - 25, '← Back to centre', () => {
      this.exitMinigame();
    });
  }

  /**
   * Create animal bowls around the bottom half.
   */
  private createBowls(width: number, height: number): void {
    const animals = this.hungryAnimals.slice(0, 6); // Max 6 bowls
    const bowlY = height - 120;
    const spacing = Math.min(160, (width - 100) / Math.max(animals.length, 1));
    const startX = width / 2 - ((animals.length - 1) * spacing) / 2;

    for (let i = 0; i < animals.length; i++) {
      const animal = animals[i];
      const x = startX + i * spacing;

      // Bowl shadow + background
      this.add.rectangle(x + 3, bowlY + 4, 120, 90, 0x000000, 0.1);
      const bowlBg = this.add.rectangle(x, bowlY, 120, 90, 0xffffff)
        .setStrokeStyle(2, SPECIES_COLOURS[animal.species], 0.8);

      // Species colour dot
      this.add.circle(x - 40, bowlY - 25, 10, SPECIES_COLOURS[animal.species]);

      // Animal name + emoji
      const speciesEmoji = this.getSpeciesEmoji(animal.species);
      this.add.text(x, bowlY - 28, `${speciesEmoji} ${animal.name}`, {
        fontSize: '14px',
        fontFamily: FONTS.body,
        color: COLOURS.text,
      }).setOrigin(0.5);

      // Bowl icon
      this.add.text(x, bowlY + 5, '🥣', {
        fontSize: '28px',
      }).setOrigin(0.5);

      // Hunger indicator
      const hungerPct = animal.hunger / 100;
      this.add.rectangle(x, bowlY + 32, 80, 6, 0xdddddd);
      this.add.rectangle(
        x - 40 + hungerPct * 40, bowlY + 32,
        hungerPct * 80, 6,
        0xe74c3c
      );

      this.bowlPositions.set(animal.id, { x, y: bowlY, species: animal.species });

      // Drop zone — invisible rect for hit detection
      const dropZone = this.add.rectangle(x, bowlY, 120, 90, 0x000000, 0)
        .setInteractive({ dropZone: true })
        .setData('animalId', animal.id)
        .setData('species', animal.species);
    }
  }

  /**
   * Create the prep surface with draggable food items.
   */
  private createPrepSurface(width: number, height: number): void {
    // Prep surface area
    const surfaceY = 160;
    const surfaceH = 200;

    // Prep surface shadow
    this.add.rectangle(width / 2 + 3, surfaceY + surfaceH / 2 + 4, width - 60, surfaceH, 0x000000, 0.1);
    this.add.rectangle(width / 2, surfaceY + surfaceH / 2, width - 60, surfaceH, 0xf5efe4)
      .setStrokeStyle(2, 0xd4c8b8);

    this.add.text(width / 2, surfaceY + 10, '🧑‍🍳 Prep Surface', {
      fontSize: '14px',
      fontFamily: FONTS.body,
      color: COLOURS.textLight,
    }).setOrigin(0.5);

    // Place food items in a scattered layout
    const itemCount = this.foodItems.length;
    const cols = Math.min(itemCount, 5);
    const rows = Math.ceil(itemCount / cols);
    const cellW = (width - 120) / cols;
    const cellH = (surfaceH - 40) / Math.max(rows, 1);
    const startX = 60 + cellW / 2;
    const startY = surfaceY + 40;

    for (let i = 0; i < this.foodItems.length; i++) {
      const food = this.foodItems[i];
      const col = i % cols;
      const row = Math.floor(i / cols);

      // Add some scatter randomness
      const jitterX = (Math.random() - 0.5) * 20;
      const jitterY = (Math.random() - 0.5) * 10;
      const x = startX + col * cellW + jitterX;
      const y = startY + row * cellH + jitterY;

      this.foodOrigins.set(i, { x, y });
      this.createDraggableFood(food, x, y, i);
    }

    // Set up drag events
    this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container, dragX: number, dragY: number) => {
      gameObject.x = dragX;
      gameObject.y = dragY;
    });

    this.input.on('drop', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container, dropZone: Phaser.GameObjects.Rectangle) => {
      const foodType = gameObject.getData('foodType') as string;
      const foodIdx = gameObject.getData('foodIdx') as number;
      const species = dropZone.getData('species') as Species;
      const animalId = dropZone.getData('animalId') as string;

      if (this.fedAnimals.has(animalId)) {
        // Already fed — bounce back
        this.bounceBack(gameObject, foodIdx, 'Already fed! 😊');
        return;
      }

      if (isFoodValidForSpecies(foodType, species)) {
        // Correct!
        this.handleCorrectDrop(gameObject, animalId, species);
      } else {
        // Wrong — bounce back gently
        this.bounceBack(gameObject, foodIdx, 'Hmm, that\'s not quite right! Try another bowl 🤔');
      }
    });

    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container, dropped: boolean) => {
      if (!dropped) {
        const foodIdx = gameObject.getData('foodIdx') as number;
        this.bounceBack(gameObject, foodIdx);
      }
    });
  }

  /**
   * Create a single draggable food item.
   */
  private createDraggableFood(food: FoodDefinition, x: number, y: number, index: number): void {
    // Food sprite (uses real art if available, emoji fallback)
    const foodSprite = createFoodSprite(this, 0, -10, food.type, food.emoji, 56);

    // Label below
    const label = this.add.text(0, 28, food.label, {
      fontSize: '14px',
      fontFamily: FONTS.body,
      color: COLOURS.text,
    }).setOrigin(0.5);

    // Background circle for better hit area
    const bg = this.add.circle(0, 0, 42, 0xffffff, 0.5);

    const container = this.add.container(x, y, [bg, foodSprite, label]);
    container.setSize(84, 84);
    container.setInteractive({ draggable: true, useHandCursor: true });
    container.setData('foodType', food.type);
    container.setData('foodIdx', index);

    // Visual feedback on drag
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

  /**
   * Handle a correct food drop — feeding animation.
   */
  private handleCorrectDrop(
    gameObject: Phaser.GameObjects.Container,
    animalId: string,
    species: Species
  ): void {
    this.fedAnimals.add(animalId);
    this.correctCount++;
    AudioManager.getInstance().playSfx('food_correct');

    if (this.progressText) {
      this.progressText.setText(`Fed: ${this.fedAnimals.size} / ${this.hungryAnimals.length}`);
    }

    // Apply feeding to the animal in our local state
    const idx = this.allAnimals.findIndex((a) => a.id === animalId);
    if (idx >= 0) {
      this.allAnimals[idx] = applyFeeding(this.allAnimals[idx]);
      this.allAnimals[idx].bondLevel = Math.min(100, this.allAnimals[idx].bondLevel + 3);
    }

    // Get bowl position for animation target
    const bowl = this.bowlPositions.get(animalId);

    // Success animation — food shrinks into the bowl
    this.tweens.add({
      targets: gameObject,
      x: bowl?.x ?? gameObject.x,
      y: bowl?.y ?? gameObject.y,
      scaleX: 0,
      scaleY: 0,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
        gameObject.destroy();
      },
    });

    // Show happy feedback
    const emoji = this.getSpeciesEmoji(species);
    this.showFeedback(`${emoji} Yum! That's perfect! +3 bond ❤️`, COLOURS.primary);

    // Star burst particles at the bowl
    if (bowl) {
      this.createStarBurst(bowl.x, bowl.y);
    }

    // Check if all animals fed
    if (this.fedAnimals.size >= this.hungryAnimals.length) {
      this.time.delayedCall(800, () => this.showCompletionScreen());
    }
  }

  /**
   * Bounce a food item back to its origin with a gentle wobble.
   */
  private bounceBack(
    gameObject: Phaser.GameObjects.Container,
    foodIdx: number,
    message?: string
  ): void {
    const origin = this.foodOrigins.get(foodIdx);
    if (!origin) return;

    if (message) {
      AudioManager.getInstance().playSfx('food_wrong');
      this.showFeedback(message, COLOURS.textLight);
    }

    // Wobble animation back to origin
    this.tweens.add({
      targets: gameObject,
      x: origin.x,
      y: origin.y,
      duration: 350,
      ease: 'Back.easeOut',
    });

    // Quick shake effect
    this.tweens.add({
      targets: gameObject,
      angle: { from: -8, to: 8 },
      duration: 80,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        gameObject.setAngle(0);
      },
    });
  }

  /**
   * Show feedback text (fades out).
   */
  private showFeedback(message: string, colour: string): void {
    if (this.feedbackText) {
      this.feedbackText.destroy();
    }

    const { width } = this.scale;
    this.feedbackText = this.add.text(width / 2, 90, message, {
      fontSize: '18px',
      fontFamily: FONTS.body,
      color: colour,
      backgroundColor: '#ffffff',
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: this.feedbackText,
      alpha: 1,
      duration: 200,
    });

    this.time.delayedCall(2000, () => {
      if (this.feedbackText) {
        this.tweens.add({
          targets: this.feedbackText,
          alpha: 0,
          duration: 400,
        });
      }
    });
  }

  /**
   * Create a feedback area.
   */
  private createFeedbackArea(_width: number, _height: number): void {
    // Score display in top right
    const { width } = this.scale;
    this.add.text(width - 20, 30, `🎯 ${this.hungryAnimals.length} to feed`, {
      fontSize: '16px',
      fontFamily: FONTS.body,
      color: COLOURS.textLight,
    }).setOrigin(1, 0.5);
  }

  /**
   * Star burst visual effect on correct answer.
   */
  private createStarBurst(x: number, y: number): void {
    const stars = ['⭐', '✨', '💫', '🌟'];
    for (let i = 0; i < 5; i++) {
      const star = this.add.text(x, y, stars[i % stars.length], {
        fontSize: '20px',
      }).setOrigin(0.5);

      const angle = (i / 5) * Math.PI * 2;
      this.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * 50,
        y: y + Math.sin(angle) * 50,
        alpha: 0,
        scale: 0.3,
        duration: 600,
        ease: 'Power2',
        onComplete: () => star.destroy(),
      });
    }
  }

  /**
   * Show the completion screen when all animals are fed.
   */
  private showCompletionScreen(): void {
    const { width, height } = this.scale;

    // Overlay
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4);

    // Panel
    const panelW = 360;
    const panelH = 240;
    this.add.rectangle(width / 2, height / 2, panelW, panelH, 0xffffff)
      .setStrokeStyle(3, Phaser.Display.Color.HexStringToColor(COLOURS.primary).color);

    this.add.text(width / 2, height / 2 - 70, '🎉 All Fed! 🎉', {
      fontSize: '32px',
      fontFamily: FONTS.title,
      color: COLOURS.primary,
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 20,
      `You sorted ${this.correctCount} meals correctly!`, {
      fontSize: '18px',
      fontFamily: FONTS.body,
      color: COLOURS.text,
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 10, 'Every animal got a tasty meal 😊', {
      fontSize: '16px',
      fontFamily: FONTS.body,
      color: COLOURS.textLight,
    }).setOrigin(0.5);

    // Ambient celebration particles
    createAmbientParticles(this, ['🍽️', '⭐'], { count: 10, minAlpha: 0.1, maxAlpha: 0.25 });

    createButton(this, width / 2, height / 2 + 60, '✅ Back to Centre', () => {
      this.exitMinigame();
    }, { width: 220 });
  }

  /**
   * Exit and return updated animals to GameScene.
   */
  private exitMinigame(): void {
    // Store updated animals in registry so GameScene can pick them up
    this.registry.set('updatedAnimals', this.allAnimals);
    this.scene.start('GameScene');
  }

  private getSpeciesEmoji(species: Species): string {
    const emojis: Record<Species, string> = {
      cat: '🐱', dog: '🐶', fox: '🦊', bunny: '🐰',
      bat: '🦇', parrot: '🦜', snake: '🐍',
    };
    return emojis[species];
  }
}
