import Phaser from 'phaser';
import type { Animal, Species, GameState } from '@arc/shared-types';
import { COLOURS, FONTS, pluralSpecies } from '../ui/constants';
import { createButton, createTextButton, createPillTitle, createPanel, createAmbientParticles } from '../ui/UIButton';
import { createAnimalSprite } from '../ui/sprites';
import { AudioManager } from '../audio/AudioManager';
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
  syncNextId,
  shouldSpawnConflict,
  generateConflict,
  isResolutionEffective,
  resolveConflict,
  RESOLUTION_ACTIONS,
} from '@arc/game-logic';
import type { IllnessDef, Conflict, ResolutionDef } from '@arc/game-logic';
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
  private activeConflict?: Conflict;
  private conflictsResolved = 0;

  private viewMode: ViewMode = 'corridor';
  private currentRoomSpecies?: Species;
  private gameContainer!: Phaser.GameObjects.Container;
  private uiContainer!: Phaser.GameObjects.Container;
  private needsTimer?: Phaser.Time.TimerEvent;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private selectedAnimal?: Animal;
  private processing = false;         // double-click guard
  private showingCollarPicker = false; // bond race guard
  private static readonly MAX_ANIMALS = 30; // population cap

  constructor() {
    super({ key: 'GameScene' });
  }

  async create(): Promise<void> {
    const { width, height } = this.scale;

    // Initialise audio
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('corridor');

    this.gameContainer = this.add.container(0, 0);
    this.uiContainer = this.add.container(0, 0);

    // Load saved state if available
    await this.loadState();

    // Check if returning from a minigame with updated animals
    const updatedAnimals = this.registry.get('updatedAnimals') as Animal[] | undefined;
    if (updatedAnimals) {
      this.animals = updatedAnimals;
      this.registry.remove('updatedAnimals');

      // Check for vet results (clear sickness if healed)
      const vetResult = this.registry.get('vetResult') as { healed: boolean; animalId?: string } | undefined;
      if (vetResult?.healed && vetResult.animalId) {
        this.sickAnimals.delete(vetResult.animalId);
      }
      this.registry.remove('vetResult');
      this.registry.remove('walkResult');

      this.saveState();
    }

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

        // Sync ID counter to avoid collisions with loaded animals
        syncNextId(this.animals);
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
    // Population cap — don't overcrowd the centre
    const nonPets = this.animals.filter((a) => a.state !== 'pet').length;
    if (nonPets >= GameScene.MAX_ANIMALS) return;

    const species = pickRandomSpecies(this.unlockedSpecies);

    if (shouldSpawnSiblings()) {
      const [a, b] = spawnSiblingPair(species);
      this.animals.push(a, b);
      this.totalRescued += 2;
    } else {
      const animal = spawnAnimal(species, undefined, this.animals.map(a => a.name));
      this.animals.push(animal);
      this.totalRescued += 1;
    }

    // Check level progression
    const required = getRequiredRescuesForLevel(this.level);
    if (this.totalRescued >= required) {
      this.level++;
      this.unlockedSpecies = getSpeciesUnlocksForLevel(this.level);
      const newSpecies = getSpeciesUnlocksForLevel(this.level).filter(
        (s) => !getSpeciesUnlocksForLevel(this.level - 1).includes(s),
      );
      this.showLevelUpCelebration(this.level, newSpecies);
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

    // Check for conflicts (only when no active conflict and viewing corridor/room)
    if (!this.activeConflict && this.viewMode !== 'garden') {
      const shelteredAnimals = this.animals.filter((a) => a.state === 'sheltered' || a.state === 'bonding');
      if (shelteredAnimals.length >= 2 && shouldSpawnConflict(shelteredAnimals)) {
        // Pick two random animals for the conflict
        const shuffled = [...shelteredAnimals].sort(() => Math.random() - 0.5);
        this.activeConflict = generateConflict(shuffled[0], shuffled[1]);
        this.showConflictPopup(this.activeConflict);
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
    // Transition music to match current view
    const audio = AudioManager.getInstance();
    const sceneMap: Record<ViewMode, 'corridor' | 'room' | 'kitchen' | 'garden'> = {
      corridor: 'corridor', room: 'room', kitchen: 'kitchen', garden: 'garden',
    };
    audio.playSceneMusic(sceneMap[this.viewMode]);

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
    const petCount = this.animals.filter((a) => a.state === 'pet').length;
    const required = getRequiredRescuesForLevel(this.level);
    const xpProgress = Math.min(this.totalRescued / required, 1);

    // ── Background bar with gradient feel ──────────────────────
    const barH = 44;
    const barGfx = this.add.graphics();
    barGfx.fillStyle(0x2d1f14, 0.92);
    barGfx.fillRoundedRect(0, 0, width, barH, { tl: 0, tr: 0, bl: 12, br: 12 });
    this.uiContainer.add(barGfx);

    // Thin accent line at bottom of bar
    const accentGfx = this.add.graphics();
    accentGfx.fillStyle(0x5AAE4A, 0.6);
    accentGfx.fillRect(0, barH - 3, width, 3);
    this.uiContainer.add(accentGfx);

    // ── Level badge (left side) ─────────────────────────────────
    const lvlX = 12;
    const lvlY = barH / 2;
    const lvlBadge = this.add.graphics();
    lvlBadge.fillStyle(0x5AAE4A, 1);
    lvlBadge.fillRoundedRect(lvlX, lvlY - 14, 56, 28, 14);
    this.uiContainer.add(lvlBadge);

    this.uiContainer.add(
      this.add.text(lvlX + 28, lvlY, `Lv ${this.level}`, {
        fontSize: '14px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
      }).setOrigin(0.5)
    );

    // ── XP progress bar ──────────────────────────────────────────
    const xpX = 78;
    const xpW = 90;
    const xpY = lvlY;
    // Background track
    const xpTrack = this.add.graphics();
    xpTrack.fillStyle(0x000000, 0.3);
    xpTrack.fillRoundedRect(xpX, xpY - 5, xpW, 10, 5);
    this.uiContainer.add(xpTrack);
    // Fill
    if (xpProgress > 0) {
      const xpFill = this.add.graphics();
      xpFill.fillStyle(0x6dd58c, 1);
      xpFill.fillRoundedRect(xpX, xpY - 5, Math.max(10, xpW * xpProgress), 10, 5);
      this.uiContainer.add(xpFill);
    }
    // XP label
    this.uiContainer.add(
      this.add.text(xpX + xpW / 2, xpY, `${this.totalRescued}/${required}`, {
        fontSize: '9px', fontFamily: FONTS.body, fontStyle: 'bold', color: '#ffffff',
      }).setOrigin(0.5)
    );

    // ── Stat chips (centre) ──────────────────────────────────────
    const chipY = barH / 2;
    const chips: { emoji: string; value: string; colour: number }[] = [
      { emoji: '🐾', value: `${this.totalRescued}`, colour: 0x5B8C3E },
      { emoji: '🏠', value: `${this.animals.length}`, colour: 0x6B5B3E },
    ];
    if (petCount > 0) {
      chips.push({ emoji: '👑', value: `${petCount}`, colour: 0xB8860B });
    }

    const chipStartX = 185;
    const chipSpacing = 68;
    chips.forEach((chip, i) => {
      const cx = chipStartX + i * chipSpacing;
      const chipGfx = this.add.graphics();
      chipGfx.fillStyle(chip.colour, 0.85);
      chipGfx.fillRoundedRect(cx - 28, chipY - 12, 56, 24, 12);
      this.uiContainer.add(chipGfx);

      this.uiContainer.add(
        this.add.text(cx, chipY, `${chip.emoji} ${chip.value}`, {
          fontSize: '13px', fontFamily: FONTS.body, fontStyle: 'bold', color: '#ffffff',
        }).setOrigin(0.5)
      );
    });

    // ── Icon buttons (right side) ────────────────────────────────
    const btnY = barH / 2;
    const btnSize = 32;

    // Audio toggle
    const audioState = AudioManager.getInstance().getState();
    const audioBg = this.add.graphics();
    audioBg.fillStyle(0x000000, 0.3);
    audioBg.fillCircle(width - 62, btnY, btnSize / 2);
    this.uiContainer.add(audioBg);

    const audioBtn = this.add.text(width - 62, btnY,
      audioState.musicEnabled ? '🔊' : '🔇', {
      fontSize: '18px',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    audioBtn.on('pointerdown', () => {
      const enabled = AudioManager.getInstance().toggleMusic();
      audioBtn.setText(enabled ? '🔊' : '🔇');
    });
    this.uiContainer.add(audioBtn);

    // Save button
    const saveBg = this.add.graphics();
    saveBg.fillStyle(0x000000, 0.3);
    saveBg.fillCircle(width - 24, btnY, btnSize / 2);
    this.uiContainer.add(saveBg);

    const saveBtn = this.add.text(width - 24, btnY, '💾', {
      fontSize: '18px',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    saveBtn.on('pointerdown', () => this.saveState());
    this.uiContainer.add(saveBtn);
  }

  // ── Bottom Navigation Bar ────────────────────────────────────

  private renderNavBar(options?: { showBack?: boolean }): void {
    const { width, height } = this.scale;
    const pets = this.animals.filter((a) => a.state === 'pet');

    // ── Tab definitions with individual colours ──
    type NavTab = {
      icon: string; label: string; colour: number;
      active: boolean; action: () => void;
    };
    const tabs: NavTab[] = [];

    if (options?.showBack) {
      tabs.push({
        icon: '⬅️', label: 'Back', colour: 0x6b5a4a,
        active: false,
        action: () => { this.viewMode = 'corridor'; this.renderView(); },
      });
    }

    tabs.push(
      {
        icon: '🏠', label: 'Home', colour: 0x8b6914,
        active: this.viewMode === 'corridor',
        action: () => { this.viewMode = 'corridor'; this.renderView(); },
      },
      {
        icon: '🍽️', label: 'Kitchen', colour: 0xc27830,
        active: this.viewMode === 'kitchen',
        action: () => { this.viewMode = 'kitchen'; this.renderView(); },
      },
      {
        icon: '🌳', label: `Garden${pets.length > 0 ? ` ${pets.length}` : ''}`, colour: 0x3a9e50,
        active: this.viewMode === 'garden',
        action: () => { this.viewMode = 'garden'; this.renderView(); },
      },
      {
        icon: '💌', label: 'Social', colour: 0x9b59b6,
        active: false,
        action: () => { this.saveState(); this.scene.start('SocialScene'); },
      },
      {
        icon: '🏗️', label: 'Depot', colour: 0x5a3d8a,
        active: false,
        action: () => { this.saveState(); this.scene.start('DepotScene', { level: this.level }); },
      },
      {
        icon: '🚛', label: 'Supply', colour: 0xd46020,
        active: false,
        action: () => { this.saveState(); this.scene.start('SupplyRunScene', { level: this.level }); },
      },
      {
        icon: '🚪', label: 'Menu', colour: 0x6b5a4a,
        active: false,
        action: () => { this.saveState(); this.scene.start('MainMenuScene'); },
      },
    );

    // ── Layout: compact dock centred at bottom ──
    const btnW = 72;
    const btnH = 48;
    const gap = 6;
    const dockW = tabs.length * btnW + (tabs.length - 1) * gap + 20; // 10px padding each side
    const maxDockW = Math.min(dockW, width - 20);
    const actualBtnW = (maxDockW - 20 - (tabs.length - 1) * gap) / tabs.length;
    const dockX = (width - maxDockW) / 2;
    const dockY = height - btnH - 14;
    const dockH = btnH + 12; // padding top/bottom

    // Dock background — frosted dark panel
    const dockGfx = this.add.graphics();
    dockGfx.fillStyle(0x2d1f14, 0.88);
    dockGfx.fillRoundedRect(dockX, dockY - 6, maxDockW, dockH, 16);
    // Subtle inner glow at top
    dockGfx.fillStyle(0xffffff, 0.06);
    dockGfx.fillRoundedRect(dockX + 2, dockY - 5, maxDockW - 4, 3, { tl: 16, tr: 16, bl: 0, br: 0 });
    this.gameContainer.add(dockGfx);

    // ── Render each tab button ──
    tabs.forEach((tab, i) => {
      const tx = dockX + 10 + i * (actualBtnW + gap) + actualBtnW / 2;
      const ty = dockY + dockH / 2 - 5;

      // Coloured pill background for each button
      const pillGfx = this.add.graphics();
      if (tab.active) {
        // Active: bright coloured pill
        pillGfx.fillStyle(tab.colour, 0.9);
        pillGfx.fillRoundedRect(tx - actualBtnW / 2, ty - btnH / 2, actualBtnW, btnH, 10);
        // Bright top edge
        pillGfx.fillStyle(0xffffff, 0.15);
        pillGfx.fillRoundedRect(tx - actualBtnW / 2 + 1, ty - btnH / 2 + 1, actualBtnW - 2, btnH * 0.4, { tl: 9, tr: 9, bl: 0, br: 0 });
      } else {
        // Inactive: subtle tinted background
        pillGfx.fillStyle(tab.colour, 0.25);
        pillGfx.fillRoundedRect(tx - actualBtnW / 2, ty - btnH / 2, actualBtnW, btnH, 10);
      }
      this.gameContainer.add(pillGfx);

      // Icon (larger for active)
      const iconSize = tab.active ? '20px' : '17px';
      this.gameContainer.add(
        this.add.text(tx, ty - 7, tab.icon, { fontSize: iconSize }).setOrigin(0.5)
      );

      // Label
      const labelColour = tab.active ? '#ffffff' : '#d4c8b8';
      this.gameContainer.add(
        this.add.text(tx, ty + 14, tab.label, {
          fontSize: '9px', fontFamily: FONTS.body, fontStyle: 'bold',
          color: labelColour,
          shadow: tab.active
            ? { offsetX: 0, offsetY: 1, color: 'rgba(0,0,0,0.4)', blur: 2, fill: true }
            : undefined,
        }).setOrigin(0.5)
      );

      // Hit area
      const hitArea = this.add.rectangle(tx, ty, actualBtnW, btnH, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hitArea.on('pointerover', () => {
        if (!tab.active) pillGfx.setAlpha(1.4);
      });
      hitArea.on('pointerout', () => pillGfx.setAlpha(1));
      hitArea.on('pointerdown', tab.action);
      this.gameContainer.add(hitArea);
    });
  }

  // ── Corridor View ───────────────────────────────────────────

  private renderCorridor(): void {
    const { width, height } = this.scale;

    // Background
    if (this.textures.exists('bg-corridor')) {
      const bg = this.add.image(width / 2, height / 2, 'bg-corridor');
      bg.setDisplaySize(width, height - 40);
      this.gameContainer.add(bg);
    } else {
      this.gameContainer.add(
        this.add.rectangle(width / 2, height / 2, width, height - 40,
          Phaser.Display.Color.HexStringToColor('#f5efe4').color
        ).setOrigin(0.5)
      );
      this.gameContainer.add(
        createAmbientParticles(this, ['\uD83D\uDC3E', '\u2B50'], { count: 8, minAlpha: 0.04, maxAlpha: 0.1 })
      );
    }

    // Title
    this.gameContainer.add(
      createPillTitle(this, width / 2, 55, '🏠 Rescue Centre', { bgColour: 0x8B6914, fontSize: '20px' })
    );

    // Room doors (one per unlocked species) — solid card panels
    const doorWidth = 130;
    const doorHeight = 90;
    const doorsPerRow = Math.min(this.unlockedSpecies.length, 4);
    const startX = width / 2 - ((doorsPerRow - 1) * (doorWidth + 16)) / 2;
    const doorY = 145;

    this.unlockedSpecies.forEach((species, i) => {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const x = startX + col * (doorWidth + 16);
      const y = doorY + row * (doorHeight + 20);

      const roomAnimals = this.animals.filter((a) => a.species === species && a.state !== 'arriving');
      const count = roomAnimals.length;
      const colour = SPECIES_COLOURS[species];

      // Solid white card with coloured top stripe + shadow
      const cardGfx = this.add.graphics();
      cardGfx.fillStyle(0x000000, 0.1);
      cardGfx.fillRoundedRect(x - doorWidth / 2 + 3, y - doorHeight / 2 + 4, doorWidth, doorHeight, 12);
      cardGfx.fillStyle(0xffffff, 0.92);
      cardGfx.fillRoundedRect(x - doorWidth / 2, y - doorHeight / 2, doorWidth, doorHeight, 12);
      cardGfx.fillStyle(colour, 1);
      cardGfx.fillRoundedRect(x - doorWidth / 2, y - doorHeight / 2, doorWidth, 8, { tl: 12, tr: 12, bl: 0, br: 0 });
      this.gameContainer.add(cardGfx);

      // Hit area over card
      const hitArea = this.add.rectangle(x, y, doorWidth, doorHeight, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hitArea.on('pointerover', () => cardGfx.setAlpha(0.85));
      hitArea.on('pointerout', () => cardGfx.setAlpha(1));
      hitArea.on('pointerdown', () => {
        this.currentRoomSpecies = species;
        this.viewMode = 'room';
        this.renderView();
      });
      this.gameContainer.add(hitArea);

      // Species emoji
      this.gameContainer.add(
        this.add.text(x, y - 12, this.speciesEmoji(species), {
          fontSize: '30px',
        }).setOrigin(0.5)
      );

      // Count + species name (proper grammar)
      this.gameContainer.add(
        this.add.text(x, y + 22, `${count} ${pluralSpecies(species, count)}`, {
          fontSize: '13px', fontFamily: FONTS.body, fontStyle: 'bold', color: COLOURS.text,
        }).setOrigin(0.5)
      );
    });

    // ── Arriving animals section ──────────────────────────────────
    const arriving = this.animals.filter((a) => a.state === 'arriving');
    if (arriving.length > 0) {
      const arriveY = doorY + Math.ceil(this.unlockedSpecies.length / 4) * (doorHeight + 20) + 20;

      // Arrivals banner pill
      this.gameContainer.add(
        createPillTitle(this, width / 2, arriveY,
          `📬 ${arriving.length} new arrival${arriving.length > 1 ? 's' : ''}!`,
          { bgColour: 0xE67E22, fontSize: '17px' })
      );

      // Story cards — one per animal, stacked vertically
      const storyCardW = Math.min(420, width - 40);
      const storyCardH = 120;
      const storyGap = 12;
      let nextCardY = arriveY + 40;

      arriving.forEach((animal) => {
        nextCardY += storyCardH / 2 + 4;
        const cy = nextCardY;
        const cx = width / 2;
        const speciesColour = SPECIES_COLOURS[animal.species];

        // Card background with shadow + species-coloured left accent
        const storyGfx = this.add.graphics();
        // Drop shadow
        storyGfx.fillStyle(0x000000, 0.1);
        storyGfx.fillRoundedRect(cx - storyCardW / 2 + 3, cy - storyCardH / 2 + 4, storyCardW, storyCardH, 12);
        // White card
        storyGfx.fillStyle(0xffffff, 0.95);
        storyGfx.fillRoundedRect(cx - storyCardW / 2, cy - storyCardH / 2, storyCardW, storyCardH, 12);
        // Species-coloured left accent strip
        storyGfx.fillStyle(speciesColour, 1);
        storyGfx.fillRoundedRect(cx - storyCardW / 2, cy - storyCardH / 2, 8, storyCardH, { tl: 12, tr: 0, bl: 12, br: 0 });
        // Subtle orange top border
        storyGfx.lineStyle(1.5, 0xE67E22, 0.3);
        storyGfx.strokeRoundedRect(cx - storyCardW / 2, cy - storyCardH / 2, storyCardW, storyCardH, 12);
        this.gameContainer.add(storyGfx);

        // Animal sprite on left side
        const spriteX = cx - storyCardW / 2 + 58;
        const sprite = createAnimalSprite(this, spriteX, cy - 4, animal, { width: 90, height: 74, interactive: true });
        sprite.on('pointerdown', () => this.showAnimalDetails(animal));
        this.gameContainer.add(sprite);

        // Species emoji below sprite
        this.gameContainer.add(
          this.add.text(spriteX, cy + 36, this.speciesEmoji(animal.species), {
            fontSize: '16px',
          }).setOrigin(0.5)
        );

        // Name + species label (right of sprite)
        const textX = cx - storyCardW / 2 + 115;
        const speciesLabel = animal.variant
          ? `${animal.variant} ${animal.species}`
          : animal.species;
        this.gameContainer.add(
          this.add.text(textX, cy - storyCardH / 2 + 16, `${animal.name} the ${speciesLabel}`, {
            fontSize: '15px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
          }).setOrigin(0)
        );

        // Arrival story text (the key part — shows who they are)
        const storyTextW = storyCardW - 140;
        this.gameContainer.add(
          this.add.text(textX, cy - storyCardH / 2 + 36, `"${animal.arrivalStory}"`, {
            fontSize: '12px', fontFamily: FONTS.body, color: COLOURS.textLight,
            fontStyle: 'italic', wordWrap: { width: storyTextW }, lineSpacing: 2,
          }).setOrigin(0)
        );

        // Per-animal "Welcome" text button on right
        const welcomeX = cx + storyCardW / 2 - 16;
        const welcomeBtn = this.add.text(welcomeX, cy, '🏠', {
          fontSize: '22px',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        welcomeBtn.on('pointerdown', () => {
          if (this.processing) return;
          this.processing = true;
          animal.state = 'sheltered';
          AudioManager.getInstance().playSfx('animal_arrive');
          this.saveState();
          this.time.delayedCall(100, () => {
            this.processing = false;
            this.renderView();
          });
        });
        welcomeBtn.on('pointerover', () => welcomeBtn.setScale(1.2));
        welcomeBtn.on('pointerout', () => welcomeBtn.setScale(1));
        this.gameContainer.add(welcomeBtn);

        nextCardY += storyCardH / 2 + storyGap;
      });

      // "Welcome all" button at bottom
      const acceptBtnY = nextCardY + 20;
      this.gameContainer.add(
        createButton(this, width / 2, acceptBtnY, '✅ Welcome them all in!', () => {
          if (this.processing) return;
          this.processing = true;
          arriving.forEach((a) => { a.state = 'sheltered'; });
          AudioManager.getInstance().playSfx('animal_arrive');
          this.saveState();
          this.time.delayedCall(100, () => {
            this.processing = false;
            this.renderView();
          });
        }, { width: 300, fontSize: '18px' })
      );
    }

    // Bottom navigation bar
    this.renderNavBar();
  }

  // ── Room View ───────────────────────────────────────────────

  private renderRoom(): void {
    const { width, height } = this.scale;
    const species = this.currentRoomSpecies!;
    const roomAnimals = this.animals.filter(
      (a) => a.species === species && a.state !== 'arriving'
    );

    // Background — use species-specific or generic room background
    const roomBgKey = this.textures.exists(`bg-room-${species}`) ? `bg-room-${species}` : 'bg-room-generic';
    if (this.textures.exists(roomBgKey)) {
      const bg = this.add.image(width / 2, height / 2, roomBgKey);
      bg.setDisplaySize(width, height - 40);
      this.gameContainer.add(bg);
    } else {
      const colour = SPECIES_COLOURS[species];
      this.gameContainer.add(
        this.add.rectangle(width / 2, height / 2, width, height - 40, colour, 0.1)
      );
    }

    this.gameContainer.add(
      createPillTitle(this, width / 2, 55, `${this.speciesEmoji(species)} ${species.charAt(0).toUpperCase() + species.slice(1)} Room`, { bgColour: 0x5AAE4A, fontSize: '20px' })
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

        // Animal sprite (real art or fallback rectangle)
        const size = animal.state === 'pet' ? 110 : 95;
        const sprite = createAnimalSprite(this, x, y, animal, {
          width: size, height: size * 0.8, interactive: true,
        });

        // Pet gold border (if sprite is a rectangle fallback)
        if (animal.state === 'pet' && sprite instanceof Phaser.GameObjects.Rectangle) {
          sprite.setStrokeStyle(3, 0xffd700, 0.8);
        }

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

    // Bottom navigation bar with back button
    this.renderNavBar({ showBack: true });
  }

  // ── Animal Details Popup ────────────────────────────────────

  private showAnimalDetails(animal: Animal): void {
    this.selectedAnimal = animal;
    const { width, height } = this.scale;

    // Overlay
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5)
      .setInteractive();
    this.gameContainer.add(overlay);

    // Card with shadow
    const cardW = 380;
    const cardH = 400;
    const cardShadow = this.add.graphics();
    cardShadow.fillStyle(0x000000, 0.1);
    cardShadow.fillRoundedRect(width / 2 - cardW / 2 + 3, height / 2 - cardH / 2 + 4, cardW, cardH, 14);
    this.gameContainer.add(cardShadow);
    const card = this.add.rectangle(width / 2, height / 2, cardW, cardH, 0xffffff)
      .setStrokeStyle(2, 0x000000, 0.2);
    this.gameContainer.add(card);

    const cx = width / 2;
    const cy = height / 2 - cardH / 2 + 30;

    // Species sprite
    const detailSprite = createAnimalSprite(this, cx, cy + 10, animal, { width: 160, height: 128 });
    this.gameContainer.add(detailSprite);

    // Name + species (with variant if available)
    const speciesLabel = animal.variant
      ? `${animal.variant} ${animal.species}`
      : animal.species;
    this.gameContainer.add(
      this.add.text(cx, cy + 55, `${animal.name} the ${speciesLabel}`, {
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
          if (this.processing) return;
          this.processing = true;
          const idx = this.animals.findIndex((a) => a.id === animal.id);
          if (idx >= 0) {
            this.animals[idx] = applyFeeding(this.animals[idx]);
            const bondGain = calculateBondIncrease(this.animals[idx], 'feed');
            this.animals[idx].bondLevel = Math.min(100, this.animals[idx].bondLevel + bondGain);
            AudioManager.getInstance().playSfx('animal_fed');
            this.checkBondComplete(this.animals[idx]);
          }
          this.closePopup();
          this.renderView();
          this.processing = false;
        }, { width: 95, fontSize: '15px' })
      );

      this.gameContainer.add(
        createButton(this, cx, btnY, '🎾 Play', () => {
          if (this.processing) return;
          this.processing = true;
          const idx = this.animals.findIndex((a) => a.id === animal.id);
          if (idx >= 0) {
            this.animals[idx] = applyPlay(this.animals[idx]);
            const bondGain = calculateBondIncrease(this.animals[idx], 'play');
            this.animals[idx].bondLevel = Math.min(100, this.animals[idx].bondLevel + bondGain);
            AudioManager.getInstance().playSfx('animal_happy');
            this.checkBondComplete(this.animals[idx]);
          }
          this.closePopup();
          this.renderView();
          this.processing = false;
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

      // Heal button for sick pets (pets can get sick in the garden too)
      const petIllness = this.sickAnimals.get(animal.id);
      if (petIllness) {
        this.gameContainer.add(
          this.add.text(cx, btnY + 65,
            `${petIllness.emoji} Sick: ${petIllness.label}`, {
            fontSize: '14px', fontFamily: FONTS.body, color: '#c0392b',
          }).setOrigin(0.5)
        );

        this.gameContainer.add(
          createButton(this, cx, btnY + 95, '🏥 Take to Vet', () => {
            this.closePopup();
            this.saveState();
            this.scene.start('VetScene', {
              animal,
              illness: petIllness,
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
          }, { width: 180, fontSize: '15px', bgColour: '#e74c3c' })
        );
      }
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

    // Kitchen background
    if (this.textures.exists('bg-kitchen')) {
      const bg = this.add.image(width / 2, height / 2, 'bg-kitchen');
      bg.setDisplaySize(width, height - 40);
      this.gameContainer.add(bg);
    } else {
      this.gameContainer.add(
        this.add.rectangle(width / 2, height / 2, width, height - 40,
          Phaser.Display.Color.HexStringToColor('#fff8e7').color)
      );
    }

    this.gameContainer.add(
      createPillTitle(this, width / 2, 55, '🍽️ Kitchen', { bgColour: 0xD4A017, fontSize: '20px' })
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

      // Show hungry animals as sprite preview
      const previewAnimals = hungry.slice(0, 6);
      const previewStartX = width / 2 - ((previewAnimals.length - 1) * 55) / 2;
      previewAnimals.forEach((a, i) => {
        const sprite = createAnimalSprite(this, previewStartX + i * 55, height / 2 - 20, a, { width: 100, height: 80 });
        this.gameContainer.add(sprite);
      });

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

    this.renderNavBar({ showBack: true });
  }

  // ── Garden View ─────────────────────────────────────────────

  private renderGarden(): void {
    const { width, height } = this.scale;
    const pets = this.animals.filter((a) => a.state === 'pet');

    // Garden background
    if (this.textures.exists('bg-garden')) {
      const bg = this.add.image(width / 2, height / 2, 'bg-garden');
      bg.setDisplaySize(width, height - 40);
      this.gameContainer.add(bg);
    } else {
      this.gameContainer.add(
        this.add.rectangle(width / 2, height / 2, width, height - 40, 0xe8f5e9)
      );
    }

    this.gameContainer.add(
      createPillTitle(this, width / 2, 55, '🌳 Garden', { bgColour: 0x2E8B57, fontSize: '20px' })
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

        // Pet sprite (larger than shelter animals, with collar colour ring)
        const sprite = createAnimalSprite(this, cx, cy, pet, { width: 100, height: 80, interactive: true });
        if (sprite instanceof Phaser.GameObjects.Rectangle) {
          sprite.setStrokeStyle(3, collarColour);
        }

        // Collar colour dot below name
        this.gameContainer.add(
          this.add.circle(cx, cy + 42, 5, collarColour)
        );

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

        // Sick indicator — alert player this pet needs vet attention
        const petSickIllness = this.sickAnimals.get(pet.id);
        if (petSickIllness) {
          const sickLabel = this.add.text(cx, cy + 50, `${petSickIllness.emoji} Sick!`, {
            fontSize: '12px', fontFamily: FONTS.body, color: '#c0392b',
          }).setOrigin(0.5);
          this.gameContainer.add(sickLabel);
          // Pulse to draw attention
          this.tweens.add({
            targets: sickLabel,
            alpha: 0.4,
            duration: 800,
            yoyo: true,
            repeat: -1,
          });
        }

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

    this.renderNavBar({ showBack: true });
  }

  // ── Bond Completion + Collar Picker ────────────────────────

  /**
   * Check if animal just reached full bond, and if so, show collar picker.
   */
  private checkBondComplete(animal: Animal): void {
    if (isBondComplete(animal) && animal.state !== 'pet' && !this.showingCollarPicker) {
      this.showingCollarPicker = true;
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
    const collarSprite = createAnimalSprite(this, width / 2, 170, animal, { width: 160, height: 128 });
    if (collarSprite instanceof Phaser.GameObjects.Rectangle) {
      collarSprite.setStrokeStyle(3, 0xffd700);
    }
    this.gameContainer.add(collarSprite);

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
    this.showingCollarPicker = false;
    const idx = this.animals.findIndex((a) => a.id === animal.id);
    if (idx >= 0) {
      if (this.animals[idx].state === 'pet') return; // already bonded (race guard)
      this.animals[idx].state = 'pet';
      this.animals[idx].collarColour = collarColour;
      this.totalBonded++;
    }

    AudioManager.getInstance().playSfx('bond_complete');

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
        conflictsResolved: this.conflictsResolved,
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
    AudioManager.getInstance().playSfx('badge_earned');

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

  // ── Conflict System ─────────────────────────────────────────

  private showConflictPopup(conflict: Conflict): void {
    this.clearView();
    const { width, height } = this.scale;

    // Background
    this.gameContainer.add(
      this.add.rectangle(width / 2, height / 2, width, height, 0xfff3e0)
    );

    // Title
    this.gameContainer.add(
      this.add.text(width / 2, 60, `⚡ ${conflict.type.replace('_', ' ').toUpperCase()}!`, {
        fontSize: '26px', fontFamily: FONTS.title, color: '#e74c3c',
      }).setOrigin(0.5)
    );

    // Description — use the pre-built description from generateConflict
    const animal1 = this.animals.find((a) => a.id === conflict.animal1Id);
    const animal2 = this.animals.find((a) => a.id === conflict.animal2Id);

    this.gameContainer.add(
      this.add.text(width / 2, 110, conflict.description, {
        fontSize: '17px', fontFamily: FONTS.body, color: COLOURS.text,
        wordWrap: { width: width - 60 }, align: 'center',
      }).setOrigin(0.5)
    );

    // Animal sprites
    if (animal1) {
      const sprite1 = createAnimalSprite(this, width / 2 - 50, 170, animal1, { width: 130, height: 104 });
      this.gameContainer.add(sprite1);
    }
    if (animal2) {
      const sprite2 = createAnimalSprite(this, width / 2 + 50, 170, animal2, { width: 130, height: 104 });
      this.gameContainer.add(sprite2);
    }

    // Prompt
    this.gameContainer.add(
      this.add.text(width / 2, 220, 'How do you want to help?', {
        fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // Resolution buttons
    const actions = RESOLUTION_ACTIONS;
    const startY = 270;
    actions.forEach((action, i) => {
      const btn = createButton(this, width / 2, startY + i * 60,
        `${action.emoji}  ${action.label}`, () => {
          this.resolveActiveConflict(action);
        }, { width: 280 }
      );
      this.gameContainer.add(btn);
    });
  }

  private resolveActiveConflict(actionDef: ResolutionDef): void {
    if (!this.activeConflict) return;

    const result = resolveConflict(this.activeConflict.type, actionDef.action);

    // Apply happiness boost to both conflict animals
    for (const animalId of [this.activeConflict.animal1Id, this.activeConflict.animal2Id]) {
      const idx = this.animals.findIndex((a) => a.id === animalId);
      if (idx >= 0) {
        this.animals[idx] = {
          ...this.animals[idx],
          happiness: Math.min(100, this.animals[idx].happiness + result.happinessBoost),
        };
      }
    }

    const effective = result.effective;
    if (effective) {
      this.conflictsResolved++;
      AudioManager.getInstance().playSfx('heal_complete');
    } else {
      AudioManager.getInstance().playSfx('food_wrong');
    }
    this.activeConflict = undefined;

    // Show result feedback
    this.clearView();
    const { width, height } = this.scale;

    this.gameContainer.add(
      this.add.rectangle(width / 2, height / 2, width, height,
        effective ? 0xe8f5e9 : 0xfff9c4)
    );

    this.gameContainer.add(
      this.add.text(width / 2, height / 2 - 30,
        effective ? '✨ Great job!' : '🤔 That helped a little...', {
        fontSize: '28px', fontFamily: FONTS.title,
        color: effective ? COLOURS.primary : '#f39c12',
      }).setOrigin(0.5)
    );

    this.gameContainer.add(
      this.add.text(width / 2, height / 2 + 20,
        effective
          ? 'The animals feel much happier now! (+10 happiness)'
          : 'The animals calmed down a bit. (+3 happiness)', {
        fontSize: '15px', fontFamily: FONTS.body, color: COLOURS.text,
        wordWrap: { width: width - 60 }, align: 'center',
      }).setOrigin(0.5)
    );

    this.gameContainer.add(
      createButton(this, width / 2, height / 2 + 80, '← Back', () => {
        this.viewMode = 'corridor';
        this.renderView();
      }, { width: 180 })
    );

    this.checkBadges();
  }

  // ── Level-Up Celebration ────────────────────────────────────

  private showLevelUpCelebration(newLevel: number, unlockedSpecies: Species[]): void {
    const { width, height } = this.scale;

    // Play sound effect
    AudioManager.getInstance().playSfx('upgrade_unlock');

    // Container for all celebration elements (renders above everything)
    const container = this.add.container(0, 0).setDepth(1000);

    // Semi-transparent overlay
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55)
      .setInteractive();
    container.add(overlay);

    // Main title
    const title = this.add.text(width / 2, height / 2 - 60, `\u{1F389} Level Up! \u{1F389}`, {
      fontSize: '36px', fontFamily: FONTS.title, color: '#ffd700',
    }).setOrigin(0.5);
    container.add(title);

    // Level number
    const levelText = this.add.text(width / 2, height / 2 - 20, `Level ${newLevel}`, {
      fontSize: '24px', fontFamily: FONTS.body, color: COLOURS.white,
    }).setOrigin(0.5);
    container.add(levelText);

    // Unlocked species list
    if (unlockedSpecies.length > 0) {
      const lines = unlockedSpecies.map(
        (s) => `${this.speciesEmoji(s)} ${s.charAt(0).toUpperCase() + s.slice(1)} unlocked!`,
      );
      const unlockText = this.add.text(width / 2, height / 2 + 25, lines.join('\n'), {
        fontSize: '20px', fontFamily: FONTS.body, color: '#2ecc71',
        align: 'center',
      }).setOrigin(0.5);
      container.add(unlockText);
    }

    // Tap to dismiss hint
    const hint = this.add.text(width / 2, height / 2 + 90, 'Tap to continue', {
      fontSize: '14px', fontFamily: FONTS.body, color: '#aaa',
    }).setOrigin(0.5);
    container.add(hint);

    // Animated sparkles / stars
    const sparkleChars = ['\u2728', '\u2B50', '\u{1F31F}', '\u2734\uFE0F'];
    const sparkles: Phaser.GameObjects.Text[] = [];
    for (let i = 0; i < 12; i++) {
      const sx = Phaser.Math.Between(40, width - 40);
      const sy = Phaser.Math.Between(40, height - 40);
      const sparkle = this.add.text(sx, sy,
        sparkleChars[Phaser.Math.Between(0, sparkleChars.length - 1)],
        { fontSize: `${Phaser.Math.Between(16, 30)}px` },
      ).setOrigin(0.5).setAlpha(0);
      container.add(sparkle);
      sparkles.push(sparkle);

      this.tweens.add({
        targets: sparkle,
        alpha: { from: 0, to: 1 },
        y: sy - Phaser.Math.Between(20, 50),
        duration: 800,
        delay: Phaser.Math.Between(0, 600),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Title pulse animation
    this.tweens.add({
      targets: title,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Dismiss handler
    const dismiss = () => {
      this.tweens.killTweensOf(title);
      sparkles.forEach((s) => this.tweens.killTweensOf(s));
      container.destroy(true);
    };

    // Auto-dismiss after 3 seconds
    const timer = this.time.delayedCall(3000, dismiss);

    // Tap to dismiss early
    overlay.on('pointerdown', () => {
      timer.destroy();
      dismiss();
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
