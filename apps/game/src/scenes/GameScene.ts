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
  calculateBondIncrease,
  isBondComplete,
  canGoOnWalk,
  shouldGetSick,
  pickIllness,
  applySickness,
  getAvailableUpgrades,
  getUnlockedUpgrades,
} from '@arc/game-logic';
import type { IllnessDef } from '@arc/game-logic';
import { evaluateBadges } from '@arc/badges';
import { getSession } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { isSupabaseConfigured } from '../lib/supabase';

type ViewMode = 'corridor' | 'room' | 'kitchen' | 'garden';

const COLLAR_COLOURS = [
  { name: 'Red',     hex: '#e74c3c' },
  { name: 'Blue',    hex: '#3498db' },
  { name: 'Green',   hex: '#2ecc71' },
  { name: 'Purple',  hex: '#9b59b6' },
  { name: 'Orange',  hex: '#e67e22' },
  { name: 'Pink',    hex: '#ff6b9d' },
  { name: 'Gold',    hex: '#f1c40f' },
  { name: 'Teal',    hex: '#1abc9c' },
];

export class GameScene extends Phaser.Scene {
  private animals: Animal[] = [];
  private level = 1;
  private totalRescued = 0;
  private totalBonded = 0;
  private unlockedSpecies: Species[] = ['cat', 'dog'];
  private earnedBadges: string[] = [];
  private houseUpgrades: string[] = [];
  private sickAnimals: Map<string, IllnessDef> = new Map();

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
        if (typeof saved.totalBonded === 'number') this.totalBonded = saved.totalBonded;
        if (Array.isArray(saved.earnedBadges)) this.earnedBadges = saved.earnedBadges as string[];
        if (Array.isArray(saved.houseUpgrades)) this.houseUpgrades = saved.houseUpgrades as string[];
        if (saved.sickAnimals && typeof saved.sickAnimals === 'object') {
          this.sickAnimals = new Map(Object.entries(saved.sickAnimals as Record<string, IllnessDef>));
        }
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
            totalBonded: this.totalBonded,
            earnedBadges: this.earnedBadges,
            houseUpgrades: this.houseUpgrades,
            sickAnimals: Object.fromEntries(this.sickAnimals),
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

    // Check for sickness on each tick
    for (const animal of this.animals) {
      if (!this.sickAnimals.has(animal.id) && shouldGetSick(animal)) {
        const illness = pickIllness(animal.species);
        const idx = this.animals.findIndex((a) => a.id === animal.id);
        if (idx >= 0) {
          this.animals[idx] = applySickness(this.animals[idx], illness);
          this.sickAnimals.set(animal.id, illness);
        }
      }
    }

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
      case 'garden': this.renderGarden(); break;
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
    const petCount = this.animals.filter((a) => a.state === 'pet').length;
    this.uiContainer.add(
      this.add.text(280, 12, `🏠 ${this.animals.length} in centre`, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.white,
      })
    );

    if (petCount > 0) {
      this.uiContainer.add(
        this.add.text(450, 12, `👑 ${petCount} pet${petCount > 1 ? 's' : ''}`, {
          fontSize: '16px', fontFamily: FONTS.body, color: '#ffd700',
        })
      );
    }

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

    // Bottom buttons row
    const pets = this.animals.filter((a) => a.state === 'pet');
    const btnRowY = height - 80;

    this.gameContainer.add(
      createButton(this, width / 2 - 160, btnRowY, '🍽️ Kitchen', () => {
        this.viewMode = 'kitchen';
        this.renderView();
      }, { width: 135, fontSize: '15px', bgColour: '#8b6914' })
    );

    this.gameContainer.add(
      createButton(this, width / 2, btnRowY,
        `🌳 Garden (${pets.length})`, () => {
        this.viewMode = 'garden';
        this.renderView();
      }, { width: 135, fontSize: '15px', bgColour: '#2ecc71' })
    );

    this.gameContainer.add(
      createButton(this, width / 2 + 160, btnRowY, '💌 Social', () => {
        this.saveState();
        this.scene.start('SocialScene');
      }, { width: 135, fontSize: '15px', bgColour: '#9b59b6' })
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

        // Sick indicator (priority over need)
        const sickIllness = this.sickAnimals.get(animal.id);
        if (sickIllness) {
          this.gameContainer.add(
            this.add.text(x + 20, y - 20, sickIllness.emoji, { fontSize: '16px' })
          );
        } else {
          // Need indicator
          const need = getUrgentNeed(animal);
          if (need) {
            const needEmoji = need === 'hunger' ? '🍽️' : need === 'tiredness' ? '😴' : need === 'happiness' ? '💔' : '🏥';
            this.gameContainer.add(
              this.add.text(x + 20, y - 20, needEmoji, { fontSize: '16px' })
            );
          }
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

    if (animal.state !== 'pet') {
      this.gameContainer.add(
        createButton(this, cx - 120, btnY, '🍽️ Feed', () => {
          const idx = this.animals.findIndex((a) => a.id === animal.id);
          if (idx >= 0) {
            this.animals[idx] = applyFeeding(this.animals[idx]);
            const bondGain = calculateBondIncrease(this.animals[idx], 'feed');
            this.animals[idx].bondLevel = Math.min(100, this.animals[idx].bondLevel + bondGain);
            this.checkBondComplete(this.animals[idx]);
          }
          this.closePopup();
          this.renderView();
        }, { width: 95, fontSize: '15px' })
      );

      this.gameContainer.add(
        createButton(this, cx, btnY, '🎾 Play', () => {
          const idx = this.animals.findIndex((a) => a.id === animal.id);
          if (idx >= 0) {
            this.animals[idx] = applyPlay(this.animals[idx]);
            const bondGain = calculateBondIncrease(this.animals[idx], 'play');
            this.animals[idx].bondLevel = Math.min(100, this.animals[idx].bondLevel + bondGain);
            this.checkBondComplete(this.animals[idx]);
          }
          this.closePopup();
          this.renderView();
        }, { width: 95, fontSize: '15px' })
      );

      // Walk button (only for walkable species in good condition)
      if (canGoOnWalk(animal)) {
        this.gameContainer.add(
          createButton(this, cx + 120, btnY, '🐾 Walk', () => {
            this.closePopup();
            this.saveState();
            this.scene.start('WalkScene', {
              animal,
              allAnimals: this.animals,
              onComplete: (updatedAnimals: Animal[], walkResult: { perfectWalk: boolean }) => {
                this.animals = updatedAnimals;
                this.checkBadges();
                this.saveState();
              },
            });
          }, { width: 95, fontSize: '15px', bgColour: '#27ae60' })
        );
      }

      // Heal button (when animal is sick)
      const illness = this.sickAnimals.get(animal.id);
      if (illness) {
        this.gameContainer.add(
          this.add.text(cx, btnY + 40,
            `${illness.emoji} Sick: ${illness.label}`, {
            fontSize: '14px', fontFamily: FONTS.body, color: '#c0392b',
          }).setOrigin(0.5)
        );

        this.gameContainer.add(
          createButton(this, cx, btnY + 70, '🏥 Heal!', () => {
            this.closePopup();
            this.saveState();
            this.scene.start('VetScene', {
              animal,
              illness,
              allAnimals: this.animals,
              onComplete: (updatedAnimals: Animal[], healed: boolean) => {
                this.animals = updatedAnimals;
                if (healed) {
                  this.sickAnimals.delete(animal.id);
                }
                this.checkBadges();
                this.saveState();
              },
            });
          }, { width: 130, fontSize: '15px', bgColour: '#e74c3c' })
        );
      }
    } else {
      // Pet — show collar and "Visit in garden" button
      this.gameContainer.add(
        this.add.text(cx, btnY - 10,
          `🎀 Collar: ${animal.collarColour ?? 'None'}`, {
          fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
        }).setOrigin(0.5)
      );

      this.gameContainer.add(
        createButton(this, cx, btnY + 30, '🌳 Visit in Garden', () => {
          this.closePopup();
          this.viewMode = 'garden';
          this.renderView();
        }, { width: 200, fontSize: '16px', bgColour: '#2ecc71' })
      );
    }

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
              const bondGain = calculateBondIncrease(this.animals[idx], 'feed');
              this.animals[idx].bondLevel = Math.min(100, this.animals[idx].bondLevel + bondGain);
              this.checkBondComplete(this.animals[idx]);
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

  // ── Garden View ─────────────────────────────────────────────

  private renderGarden(): void {
    const { width, height } = this.scale;
    const pets = this.animals.filter((a) => a.state === 'pet');

    // Garden background — green and peaceful
    this.gameContainer.add(
      this.add.rectangle(width / 2, height / 2, width, height - 40, 0xe8f5e9)
    );

    this.gameContainer.add(
      this.add.text(width / 2, 65, '🌳 Garden 🌳', {
        fontSize: '24px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    if (pets.length === 0) {
      this.gameContainer.add(
        this.add.text(width / 2, height / 2 - 30,
          'No pets yet!', {
          fontSize: '22px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );
      this.gameContainer.add(
        this.add.text(width / 2, height / 2 + 10,
          'Keep caring for your animals — when their bond\nreaches 100%, they become your pet forever! 💕', {
          fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
          align: 'center',
        }).setOrigin(0.5)
      );
    } else {
      this.gameContainer.add(
        this.add.text(width / 2, 95,
          `${pets.length} pet${pets.length > 1 ? 's' : ''} living their best life!`, {
          fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );

      // Scatter pets across the garden with gentle roaming positions
      const margin = 80;
      pets.forEach((pet, i) => {
        // Distribute in a natural-looking pattern
        const angle = (i / Math.max(pets.length, 1)) * Math.PI * 2;
        const radius = Math.min(width, height) * 0.25;
        const cx = width / 2 + Math.cos(angle) * radius * (0.6 + Math.random() * 0.4);
        const cy = height / 2 + 20 + Math.sin(angle) * radius * 0.5 * (0.6 + Math.random() * 0.4);

        // Collar colour ring
        const collarHex = pet.collarColour ?? '#ff6b9d';
        const collarColour = Phaser.Display.Color.HexStringToColor(collarHex).color;

        // Pet sprite (larger than shelter animals, with gold border + collar)
        const sprite = this.add.rectangle(cx, cy, 55, 44, SPECIES_COLOURS[pet.species])
          .setInteractive({ useHandCursor: true })
          .setStrokeStyle(3, collarColour);

        // Crown / pet indicator
        this.gameContainer.add(
          this.add.text(cx, cy - 30, '👑', { fontSize: '16px' }).setOrigin(0.5)
        );

        // Name with collar colour dot
        this.gameContainer.add(
          this.add.text(cx, cy + 30, pet.name, {
            fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.text,
          }).setOrigin(0.5)
        );

        // Happiness indicator
        const happyEmoji = pet.happiness > 70 ? '😊' : pet.happiness > 40 ? '😐' : '😢';
        this.gameContainer.add(
          this.add.text(cx + 30, cy - 20, happyEmoji, { fontSize: '14px' })
        );

        sprite.on('pointerdown', () => this.showAnimalDetails(pet));
        this.gameContainer.add(sprite);

        // Gentle floating animation
        this.tweens.add({
          targets: sprite,
          y: cy - 4,
          duration: 2000 + Math.random() * 1000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      });
    }

    // Upgrades display
    const unlocked = getUnlockedUpgrades(this.houseUpgrades);
    if (unlocked.length > 0) {
      const upgradeEmojis = unlocked.map((u) => u.emoji).join(' ');
      this.gameContainer.add(
        this.add.text(width / 2, height - 110, upgradeEmojis, {
          fontSize: '20px',
        }).setOrigin(0.5)
      );
    }

    // Check for new available upgrades
    const available = getAvailableUpgrades(pets.length, this.houseUpgrades);
    if (available.length > 0) {
      this.gameContainer.add(
        createTextButton(this, width / 2, height - 85,
          `🏗️ New upgrade available: ${available[0].name}!`, () => {
            this.houseUpgrades.push(available[0].code);
            this.checkBadges();
            this.saveState();
            this.renderView();
          })
      );
    }

    // Badge display
    if (this.earnedBadges.length > 0) {
      this.gameContainer.add(
        this.add.text(width / 2, height - 65,
          `🏅 ${this.earnedBadges.length} badge${this.earnedBadges.length > 1 ? 's' : ''} earned`, {
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.primary,
        }).setOrigin(0.5)
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

  // ── Bond Completion + Collar Picker ────────────────────────

  /**
   * Check if animal just reached full bond, and if so, show collar picker.
   */
  private checkBondComplete(animal: Animal): void {
    if (isBondComplete(animal) && animal.state !== 'pet') {
      // Delay to show after current UI update
      this.time.delayedCall(300, () => {
        this.showCollarPicker(animal);
      });
    }
  }

  /**
   * Show collar colour picker when an animal reaches full bond.
   */
  private showCollarPicker(animal: Animal): void {
    this.clearView();
    const { width, height } = this.scale;

    // Celebration background
    this.gameContainer.add(
      this.add.rectangle(width / 2, height / 2, width, height, 0xfff8e7)
    );

    // Star burst celebration
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const star = this.add.text(
        width / 2 + Math.cos(angle) * 120,
        height / 2 - 80 + Math.sin(angle) * 80,
        '⭐', { fontSize: '28px' }
      ).setOrigin(0.5).setAlpha(0);

      this.gameContainer.add(star);
      this.tweens.add({
        targets: star,
        alpha: 1,
        scale: { from: 0.3, to: 1 },
        duration: 500,
        delay: i * 100,
        yoyo: true,
        repeat: -1,
        hold: 1000,
      });
    }

    // Celebration text
    this.gameContainer.add(
      this.add.text(width / 2, 60, '🎉 Full Bond! 🎉', {
        fontSize: '32px', fontFamily: FONTS.title, color: COLOURS.primary,
      }).setOrigin(0.5)
    );

    this.gameContainer.add(
      this.add.text(width / 2, 100,
        `${animal.name} the ${animal.species} loves you so much\nthey want to be your pet forever!`, {
        fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.text,
        align: 'center',
      }).setOrigin(0.5)
    );

    // Animal sprite (big, central)
    this.gameContainer.add(
      this.add.rectangle(width / 2, 170, 70, 56, SPECIES_COLOURS[animal.species])
        .setStrokeStyle(3, 0xffd700)
    );
    this.gameContainer.add(
      this.add.text(width / 2, 170, this.speciesEmoji(animal.species), {
        fontSize: '36px',
      }).setOrigin(0.5)
    );

    // Collar picker prompt
    this.gameContainer.add(
      this.add.text(width / 2, 220, 'Choose a collar colour for your new pet:', {
        fontSize: '17px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Collar colour grid
    const colsPerRow = 4;
    const collarStartX = width / 2 - ((colsPerRow - 1) * 80) / 2;
    const collarStartY = 265;

    COLLAR_COLOURS.forEach((collar, i) => {
      const col = i % colsPerRow;
      const row = Math.floor(i / colsPerRow);
      const x = collarStartX + col * 80;
      const y = collarStartY + row * 65;

      const colour = Phaser.Display.Color.HexStringToColor(collar.hex).color;

      // Colour swatch
      const swatch = this.add.circle(x, y, 22, colour)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(2, 0xffffff);

      // Label
      this.gameContainer.add(
        this.add.text(x, y + 30, collar.name, {
          fontSize: '12px', fontFamily: FONTS.body, color: COLOURS.text,
        }).setOrigin(0.5)
      );

      swatch.on('pointerover', () => swatch.setStrokeStyle(3, 0x000000));
      swatch.on('pointerout', () => swatch.setStrokeStyle(2, 0xffffff));
      swatch.on('pointerdown', () => {
        this.completeBonding(animal, collar.hex);
      });

      this.gameContainer.add(swatch);
    });
  }

  /**
   * Complete the bonding process — animal becomes a pet.
   */
  private completeBonding(animal: Animal, collarColour: string): void {
    const idx = this.animals.findIndex((a) => a.id === animal.id);
    if (idx >= 0) {
      this.animals[idx].state = 'pet';
      this.animals[idx].collarColour = collarColour;
      this.totalBonded++;
    }

    // Check for new badges
    this.checkBadges();
    this.saveState();

    // Show celebration then go to garden
    this.clearView();
    const { width, height } = this.scale;

    this.gameContainer.add(
      this.add.rectangle(width / 2, height / 2, width, height, 0xe8f5e9)
    );

    this.gameContainer.add(
      this.add.text(width / 2, height / 2 - 60, '💕', {
        fontSize: '64px',
      }).setOrigin(0.5)
    );

    this.gameContainer.add(
      this.add.text(width / 2, height / 2 + 10,
        `${animal.name} is now your pet!`, {
        fontSize: '24px', fontFamily: FONTS.title, color: COLOURS.primary,
      }).setOrigin(0.5)
    );

    this.gameContainer.add(
      this.add.text(width / 2, height / 2 + 50,
        'They\'ll live in the garden from now on.', {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    this.gameContainer.add(
      createButton(this, width / 2, height / 2 + 110, '🌳 Visit Garden', () => {
        this.viewMode = 'garden';
        this.renderView();
      }, { width: 220, bgColour: '#2ecc71' })
    );
  }

  // ── Badge Evaluation ───────────────────────────────────────

  private checkBadges(): void {
    const pets = this.animals.filter((a) => a.state === 'pet');
    const siblingPairs = this.animals.filter(
      (a) => a.siblingId && a.state !== 'arriving'
    ).length / 2;

    const stats = {
      userId: '',
      catsRescued: this.animals.filter((a) => a.species === 'cat').length,
      dogsRescued: this.animals.filter((a) => a.species === 'dog').length,
      bunniesRescued: this.animals.filter((a) => a.species === 'bunny').length,
      foxesRescued: this.animals.filter((a) => a.species === 'fox').length,
      snakesRescued: this.animals.filter((a) => a.species === 'snake').length,
      parrotsRescued: this.animals.filter((a) => a.species === 'parrot').length,
      batsRescued: this.animals.filter((a) => a.species === 'bat').length,
      totalRescued: this.totalRescued,
      badgesUnlockedCount: this.earnedBadges.length,
      giftsSentCount: 0,
      giftsReceivedCount: 0,
      extras: {
        totalBonded: this.totalBonded,
        siblingPairsReunited: Math.floor(siblingPairs),
        selfHealed: 0,
        walksWithoutIncident: 0,
        animalsTrained: 0,
        conflictsResolved: 0,
        houseUpgrades: 0,
        totalPets: pets.length,
        consecutiveDays: 1,
        totalDaysPlayed: 1,
        playerNumber: 999, // placeholder
        level: this.level,
      },
    };

    const newBadges = evaluateBadges(stats, stats.extras, this.earnedBadges);
    if (newBadges.length > 0) {
      this.earnedBadges.push(...newBadges);
      // Show badge notification for first new badge
      this.showBadgeNotification(newBadges[0]);
    }
  }

  private showBadgeNotification(badgeCode: string): void {
    const { width } = this.scale;

    // Simple toast notification at top
    const toast = this.add.container(width / 2, -50);
    const bg = this.add.rectangle(0, 0, 300, 50, 0xffd700)
      .setStrokeStyle(2, 0xdaa520);
    const text = this.add.text(0, 0, `🏅 New Badge: ${badgeCode}!`, {
      fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
    }).setOrigin(0.5);

    toast.add([bg, text]);
    toast.setDepth(100);

    this.tweens.add({
      targets: toast,
      y: 70,
      duration: 500,
      ease: 'Back.easeOut',
      hold: 3000,
      yoyo: true,
      onComplete: () => toast.destroy(),
    });
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
