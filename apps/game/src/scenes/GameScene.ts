import Phaser from 'phaser';
import type { Animal, Species, GameState } from '@arc/shared-types';
import { COLOURS, FONTS } from '../ui/constants';
import { createButton, createTextButton } from '../ui/UIButton';
import {
  spawnAnimal,
  spawnSiblingPair,
  pickRandomSpecies,
  shouldSpawnSiblings,
  getSpeciesUnlocksForLevel,
  getRequiredRescuesForLevel,
  tickNeeds,
  getUrgentNeed,
  getNeedSpeech,
  SPECIES_COLOURS,
  applyFeeding,
  applyPlay,
} from '@arc/game-logic';
import { getSession } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { isSupabaseConfigured } from '../lib/supabase';

type ViewMode = 'corridor' | 'room' | 'kitchen';

export class GameScene extends Phaser.Scene {
  private animals: Animal[] = [];
  private level = 1;
  private totalRescued = 0;
  private unlockedSpecies: Species[] = ['cat', 'dog'];

  private viewMode: ViewMode = 'corridor';
  private currentRoomSpecies?: Species;
  private gameContainer!: Phaser.GameObjects.Container;
  private uiContainer!: Phaser.GameObjects.Container;
  private needsTimer?: Phaser.Time.TimerEvent;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private selectedAnimal?: Animal;

  constructor() {
    super({ key: 'GameScene' });
  }

  async create(): Promise<void> {
    const { width, height } = this.scale;

    this.gameContainer = this.add.container(0, 0);
    this.uiContainer = this.add.container(0, 0);

    // Load saved state if available
    await this.loadState();

    // Start needs decay timer (every 2 seconds = 1 game-minute)
    this.needsTimer = this.time.addEvent({
      delay: 2000,
      callback: this.tickAllNeeds,
      callbackScope: this,
      loop: true,
    });

    // Spawn a new animal periodically (every 15 seconds)
    this.spawnTimer = this.time.addEvent({
      delay: 15000,
      callback: this.spawnNewAnimal,
      callbackScope: this,
      loop: true,
    });

    // Start with an animal if none exist
    if (this.animals.length === 0) {
      this.spawnNewAnimal();
    }

    this.renderView();
    this.renderHUD();
  }

  // ── State Management ────────────────────────────────────────

  private async loadState(): Promise<void> {
    const session = getSession();
    if (!session || !isSupabaseConfigured()) return;

    try {
      const { data } = await supabase
        .from('game_states')
        .select('state, level')
        .eq('user_id', session.userId)
        .single();

      if (data?.state && typeof data.state === 'object') {
        const saved = data.state as Record<string, unknown>;
        if (Array.isArray(saved.animals)) this.animals = saved.animals as Animal[];
        if (typeof saved.totalRescued === 'number') this.totalRescued = saved.totalRescued;
        this.level = data.level ?? 1;
        this.unlockedSpecies = getSpeciesUnlocksForLevel(this.level);
      }
    } catch {
      // First time — no saved state
    }
  }

  private async saveState(): Promise<void> {
    const session = getSession();
    if (!session || !isSupabaseConfigured()) return;

    try {
      await supabase
        .from('game_states')
        .upsert({
          user_id: session.userId,
          state: {
            animals: this.animals,
            totalRescued: this.totalRescued,
          },
          level: this.level,
          updated_at: new Date().toISOString(),
        });
    } catch {
      // Silently fail on save errors
    }
  }

  // ── Animal Spawning ─────────────────────────────────────────

  private spawnNewAnimal(): void {
    const species = pickRandomSpecies(this.unlockedSpecies);

    if (shouldSpawnSiblings()) {
      const [a, b] = spawnSiblingPair(species);
      this.animals.push(a, b);
      this.totalRescued += 2;
    } else {
      const animal = spawnAnimal(species);
      this.animals.push(animal);
      this.totalRescued += 1;
    }

    // Check level progression
    const required = getRequiredRescuesForLevel(this.level);
    if (this.totalRescued >= required) {
      this.level++;
      this.unlockedSpecies = getSpeciesUnlocksForLevel(this.level);
    }

    this.saveState();
    if (this.viewMode === 'corridor') this.renderView();
    this.renderHUD();
  }

  // ── Needs System ────────────────────────────────────────────

  private tickAllNeeds(): void {
    this.animals = this.animals.map((a) => tickNeeds(a));
    // Refresh if viewing a room
    if (this.viewMode === 'room' && this.selectedAnimal) {
      const updated = this.animals.find((a) => a.id === this.selectedAnimal!.id);
      if (updated) this.selectedAnimal = updated;
    }
  }

  // ── Rendering ───────────────────────────────────────────────

  private clearView(): void {
    this.gameContainer.removeAll(true);
  }

  private renderView(): void {
    this.clearView();
    switch (this.viewMode) {
      case 'corridor': this.renderCorridor(); break;
      case 'room': this.renderRoom(); break;
      case 'kitchen': this.renderKitchen(); break;
    }
  }

  private renderHUD(): void {
    this.uiContainer.removeAll(true);
    const { width } = this.scale;

    // Top bar
    const bar = this.add.rectangle(width / 2, 20, width, 40,
      Phaser.Display.Color.HexStringToColor('#3a2e22').color, 0.85
    );
    this.uiContainer.add(bar);

    // Level + rescued count
    this.uiContainer.add(
      this.add.text(16, 12, `Level ${this.level}`, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.white,
      })
    );

    this.uiContainer.add(
      this.add.text(120, 12, `🐾 ${this.totalRescued} rescued`, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.white,
      })
    );

    // Animals count
    this.uiContainer.add(
      this.add.text(280, 12, `🏠 ${this.animals.length} in centre`, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.white,
      })
    );

    // Next level indicator
    const required = getRequiredRescuesForLevel(this.level);
    const progress = Math.min(this.totalRescued / required, 1);
    this.uiContainer.add(
      this.add.text(width - 200, 12, `Next level: ${this.totalRescued}/${required}`, {
        fontSize: '14px', fontFamily: FONTS.body, color: '#aaa',
      })
    );

    // Save button
    const saveBtn = this.add.text(width - 50, 12, '💾', {
      fontSize: '18px',
    }).setInteractive({ useHandCursor: true });
    saveBtn.on('pointerdown', () => this.saveState());
    this.uiContainer.add(saveBtn);
  }

  // ── Corridor View ───────────────────────────────────────────

  private renderCorridor(): void {
    const { width, height } = this.scale;

    // Background
    this.gameContainer.add(
      this.add.rectangle(width / 2, height / 2, width, height - 40,
        Phaser.Display.Color.HexStringToColor('#f5efe4').color
      ).setOrigin(0.5)
    );

    // Title
    this.gameContainer.add(
      this.add.text(width / 2, 65, '🏠 Rescue Centre', {
        fontSize: '24px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Room doors (one per unlocked species)
    const doorWidth = 120;
    const doorHeight = 100;
    const doorsPerRow = Math.min(this.unlockedSpecies.length, 4);
    const startX = width / 2 - ((doorsPerRow - 1) * (doorWidth + 20)) / 2;
    const doorY = 150;

    this.unlockedSpecies.forEach((species, i) => {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const x = startX + col * (doorWidth + 20);
      const y = doorY + row * (doorHeight + 30);

      const roomAnimals = this.animals.filter((a) => a.species === species);
      const colour = SPECIES_COLOURS[species];

      // Door rectangle
      const door = this.add.rectangle(x, y, doorWidth, doorHeight, colour, 0.3)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(2, colour);

      // Species label
      const label = this.add.text(x, y - 15, this.speciesEmoji(species), {
        fontSize: '32px',
      }).setOrigin(0.5);

      const countText = this.add.text(x, y + 20, `${roomAnimals.length} ${species}s`, {
        fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5);

      door.on('pointerdown', () => {
        this.currentRoomSpecies = species;
        this.viewMode = 'room';
        this.renderView();
      });

      this.gameContainer.add(door);
      this.gameContainer.add(label);
      this.gameContainer.add(countText);
    });

    // Arriving animals section
    const arriving = this.animals.filter((a) => a.state === 'arriving');
    if (arriving.length > 0) {
      const arriveY = doorY + Math.ceil(this.unlockedSpecies.length / 4) * 130 + 30;

      this.gameContainer.add(
        this.add.text(width / 2, arriveY, `📬 ${arriving.length} new arrival${arriving.length > 1 ? 's' : ''}!`, {
          fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.primary,
        }).setOrigin(0.5)
      );

      arriving.slice(0, 4).forEach((animal, i) => {
        const ax = width / 2 - 150 + i * 100;
        const ay = arriveY + 60;

        // Coloured rectangle sprite
        const sprite = this.add.rectangle(ax, ay, 50, 40,
          SPECIES_COLOURS[animal.species]
        ).setInteractive({ useHandCursor: true })
          .setStrokeStyle(1, 0x000000, 0.3);

        // Name
        const name = this.add.text(ax, ay + 30, animal.name, {
          fontSize: '12px', fontFamily: FONTS.body, color: COLOURS.text,
        }).setOrigin(0.5);

        // Speech bubble with arrival story
        sprite.on('pointerdown', () => this.showAnimalDetails(animal));

        this.gameContainer.add(sprite);
        this.gameContainer.add(name);
      });

      // "Accept all" button
      this.gameContainer.add(
        createButton(this, width / 2, arriveY + 120, '✓ Accept into centre', () => {
          arriving.forEach((a) => { a.state = 'sheltered'; });
          this.saveState();
          this.renderView();
        }, { width: 260, fontSize: '18px' })
      );
    }

    // Kitchen button
    this.gameContainer.add(
      createButton(this, width / 2, height - 80, '🍽️ Kitchen', () => {
        this.viewMode = 'kitchen';
        this.renderView();
      }, { width: 160, fontSize: '18px', bgColour: '#8b6914' })
    );

    // Back to menu
    this.gameContainer.add(
      createTextButton(this, width / 2, height - 45,
        '← Main Menu', () => {
          this.saveState();
          this.scene.start('MainMenuScene');
        })
    );
  }

  // ── Room View ───────────────────────────────────────────────

  private renderRoom(): void {
    const { width, height } = this.scale;
    const species = this.currentRoomSpecies!;
    const roomAnimals = this.animals.filter(
      (a) => a.species === species && a.state !== 'arriving'
    );

    // Background
    const colour = SPECIES_COLOURS[species];
    this.gameContainer.add(
      this.add.rectangle(width / 2, height / 2, width, height - 40, colour, 0.1)
    );

    this.gameContainer.add(
      this.add.text(width / 2, 65,
        `${this.speciesEmoji(species)} ${species.charAt(0).toUpperCase() + species.slice(1)} Room`, {
        fontSize: '24px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    if (roomAnimals.length === 0) {
      this.gameContainer.add(
        this.add.text(width / 2, height / 2, 'No animals here yet.', {
          fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );
    } else {
      // Grid of animals
      const cols = Math.min(roomAnimals.length, 5);
      const startX = width / 2 - ((cols - 1) * 100) / 2;
      const startY = 120;

      roomAnimals.forEach((animal, i) => {
        const row = Math.floor(i / 5);
        const col = i % 5;
        const x = startX + col * 100;
        const y = startY + row * 120;

        // Coloured rectangle (placeholder sprite)
        const size = animal.state === 'pet' ? 55 : 45;
        const sprite = this.add.rectangle(x, y, size, size * 0.8, colour)
          .setInteractive({ useHandCursor: true })
          .setStrokeStyle(animal.state === 'pet' ? 3 : 1,
            animal.state === 'pet' ? 0xffd700 : 0x000000, 0.5);

        // Name
        this.gameContainer.add(
          this.add.text(x, y + size / 2 + 8, animal.name, {
            fontSize: '12px', fontFamily: FONTS.body, color: COLOURS.text,
          }).setOrigin(0.5)
        );

        // Need indicator
        const need = getUrgentNeed(animal);
        if (need) {
          const needEmoji = need === 'hunger' ? '🍽️' : need === 'tiredness' ? '😴' : need === 'happiness' ? '💔' : '🏥';
          this.gameContainer.add(
            this.add.text(x + 20, y - 20, needEmoji, { fontSize: '16px' })
          );
        }

        // Bond indicator
        if (animal.bondLevel > 0) {
          const bondBar = this.add.rectangle(x, y + size / 2 + 22, 40, 4, 0xdddddd);
          const bondFill = this.add.rectangle(
            x - 20 + (animal.bondLevel / 100) * 20, y + size / 2 + 22,
            (animal.bondLevel / 100) * 40, 4, 0xff6b9d
          );
          this.gameContainer.add(bondBar);
          this.gameContainer.add(bondFill);
        }

        // Sibling indicator
        if (animal.siblingId) {
          this.gameContainer.add(
            this.add.text(x - 22, y - 18, '👯', { fontSize: '12px' })
          );
        }

        sprite.on('pointerdown', () => this.showAnimalDetails(animal));
        this.gameContainer.add(sprite);
      });
    }

    // Back to corridor
    this.gameContainer.add(
      createTextButton(this, width / 2, height - 50,
        '← Back to corridor', () => {
          this.viewMode = 'corridor';
          this.renderView();
        })
    );
  }

  // ── Animal Details Popup ────────────────────────────────────

  private showAnimalDetails(animal: Animal): void {
    this.selectedAnimal = animal;
    const { width, height } = this.scale;

    // Overlay
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5)
      .setInteractive();
    this.gameContainer.add(overlay);

    // Card
    const cardW = 380;
    const cardH = 400;
    const card = this.add.rectangle(width / 2, height / 2, cardW, cardH, 0xffffff)
      .setStrokeStyle(2, 0x000000, 0.2);
    this.gameContainer.add(card);

    const cx = width / 2;
    const cy = height / 2 - cardH / 2 + 30;

    // Species sprite
    this.gameContainer.add(
      this.add.rectangle(cx, cy + 10, 60, 48, SPECIES_COLOURS[animal.species])
        .setStrokeStyle(1, 0x000000, 0.3)
    );

    // Name + species
    this.gameContainer.add(
      this.add.text(cx, cy + 55, `${animal.name} the ${animal.species}`, {
        fontSize: '22px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Story
    this.gameContainer.add(
      this.add.text(cx, cy + 85, `"${animal.arrivalStory}"`, {
        fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.textLight,
        fontStyle: 'italic', wordWrap: { width: cardW - 40 }, align: 'center',
      }).setOrigin(0.5)
    );

    // Need speech
    const speech = getNeedSpeech(animal);
    if (speech) {
      this.gameContainer.add(
        this.add.text(cx, cy + 125, `💬 "${speech}"`, {
          fontSize: '15px', fontFamily: FONTS.body, color: '#c0392b',
        }).setOrigin(0.5)
      );
    }

    // Stats bars
    const statsY = cy + 160;
    this.renderStatBar('Hunger', animal.hunger, 0xe74c3c, cx - 120, statsY, true);
    this.renderStatBar('Tiredness', animal.tiredness, 0x3498db, cx - 120, statsY + 28, true);
    this.renderStatBar('Happiness', animal.happiness, 0xf1c40f, cx - 120, statsY + 56, false);
    this.renderStatBar('Health', animal.health, 0x2ecc71, cx - 120, statsY + 84, false);
    this.renderStatBar('Bond', animal.bondLevel, 0xff6b9d, cx - 120, statsY + 112, false);

    // Action buttons
    const btnY = statsY + 155;
    this.gameContainer.add(
      createButton(this, cx - 90, btnY, '🍽️ Feed', () => {
        const idx = this.animals.findIndex((a) => a.id === animal.id);
        if (idx >= 0) {
          this.animals[idx] = applyFeeding(this.animals[idx]);
          this.animals[idx].bondLevel = Math.min(100, this.animals[idx].bondLevel + 3);
        }
        this.closePopup();
        this.renderView();
      }, { width: 110, fontSize: '16px' })
    );

    this.gameContainer.add(
      createButton(this, cx + 90, btnY, '🎾 Play', () => {
        const idx = this.animals.findIndex((a) => a.id === animal.id);
        if (idx >= 0) {
          this.animals[idx] = applyPlay(this.animals[idx]);
          this.animals[idx].bondLevel = Math.min(100, this.animals[idx].bondLevel + 5);
        }
        this.closePopup();
        this.renderView();
      }, { width: 110, fontSize: '16px' })
    );

    // Close button
    const closeBtn = this.add.text(cx + cardW / 2 - 20, height / 2 - cardH / 2 + 10, '✕', {
      fontSize: '22px', color: '#999',
    }).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closePopup());
    this.gameContainer.add(closeBtn);

    // Click overlay to close
    overlay.on('pointerdown', () => this.closePopup());
  }

  private renderStatBar(
    label: string, value: number, colour: number,
    x: number, y: number, inverted: boolean
  ): void {
    // For hunger/tiredness, lower is better (inverted)
    const displayValue = inverted ? 100 - value : value;

    this.gameContainer.add(
      this.add.text(x, y, label, {
        fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.text,
      })
    );

    // Background bar
    this.gameContainer.add(
      this.add.rectangle(x + 90 + 75, y + 6, 150, 10, 0xdddddd).setOrigin(0.5)
    );
    // Fill bar
    this.gameContainer.add(
      this.add.rectangle(
        x + 90 + (displayValue / 100) * 75, y + 6,
        (displayValue / 100) * 150, 10, colour
      ).setOrigin(0.5)
    );

    // Value text
    this.gameContainer.add(
      this.add.text(x + 240, y, `${Math.round(displayValue)}%`, {
        fontSize: '12px', fontFamily: FONTS.body, color: '#888',
      })
    );
  }

  private closePopup(): void {
    this.selectedAnimal = undefined;
    this.renderView();
  }

  // ── Kitchen View ────────────────────────────────────────────

  private renderKitchen(): void {
    const { width, height } = this.scale;

    this.gameContainer.add(
      this.add.rectangle(width / 2, height / 2, width, height - 40,
        Phaser.Display.Color.HexStringToColor('#fff8e7').color)
    );

    this.gameContainer.add(
      this.add.text(width / 2, 65, '🍽️ Kitchen', {
        fontSize: '24px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Find hungry animals
    const hungry = this.animals.filter((a) => a.hunger > 60 && a.state !== 'arriving');

    if (hungry.length === 0) {
      this.gameContainer.add(
        this.add.text(width / 2, height / 2, 'Everyone is well-fed! 🎉', {
          fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );
    } else {
      this.gameContainer.add(
        this.add.text(width / 2, height / 2 - 60,
          `${hungry.length} animal${hungry.length > 1 ? 's are' : ' is'} hungry!`, {
          fontSize: '20px', fontFamily: FONTS.body, color: COLOURS.text,
        }).setOrigin(0.5)
      );

      // Show hungry animals as a preview
      const previewEmojis = hungry.slice(0, 6).map((a) => this.speciesEmoji(a.species)).join(' ');
      this.gameContainer.add(
        this.add.text(width / 2, height / 2 - 20, previewEmojis, {
          fontSize: '32px',
        }).setOrigin(0.5)
      );

      this.gameContainer.add(
        this.add.text(width / 2, height / 2 + 20,
          'Sort the right food into each animal\'s bowl!', {
          fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );

      // Launch minigame button
      this.gameContainer.add(
        createButton(this, width / 2, height / 2 + 70, '🍽️ Start Sorting!', () => {
          this.scene.start('KitchenMinigameScene', {
            hungryAnimals: hungry,
            allAnimals: this.animals,
            onComplete: (updatedAnimals: Animal[]) => {
              this.animals = updatedAnimals;
              this.saveState();
            },
          });
        }, { width: 260 })
      );

      // Quick-feed option for accessibility
      this.gameContainer.add(
        createTextButton(this, width / 2, height / 2 + 120,
          'Quick feed all (skip minigame)', () => {
          for (const animal of hungry) {
            const idx = this.animals.findIndex((a) => a.id === animal.id);
            if (idx >= 0) {
              this.animals[idx] = applyFeeding(this.animals[idx]);
              this.animals[idx].bondLevel = Math.min(100, this.animals[idx].bondLevel + 3);
            }
          }
          this.renderView();
          this.saveState();
        })
      );
    }

    this.gameContainer.add(
      createTextButton(this, width / 2, height - 50,
        '← Back to corridor', () => {
          this.viewMode = 'corridor';
          this.renderView();
        })
    );
  }

  // ── Helpers ─────────────────────────────────────────────────

  private speciesEmoji(species: Species): string {
    const emojis: Record<Species, string> = {
      cat: '🐱', dog: '🐶', fox: '🦊', bunny: '🐰',
      bat: '🦇', parrot: '🦜', snake: '🐍',
    };
    return emojis[species];
  }

  shutdown(): void {
    this.needsTimer?.destroy();
    this.spawnTimer?.destroy();
    this.saveState();
  }
}
