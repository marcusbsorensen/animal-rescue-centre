import Phaser from 'phaser';
import type { Animal, Species, GameState, CalendarState, DepotState, Economy } from '@arc/shared-types';
import { COLOURS, FONTS, pluralSpecies, TEXT_RESOLUTION } from '../ui/constants';
import { createButton, createTextButton, createPillTitle, createPanel, createAmbientParticles } from '../ui/UIButton';
import { createAnimalSprite } from '../ui/sprites';
import { RoomAnchors, type Anchor } from '../lib/RoomAnchors';
import { createSpeechBubble } from '../ui/SpeechBubble';
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
  createCalendarState,
  advanceCalendar,
  isDailyReset,
  resetDailySessions,
  getMaxShelterAnimals,
  getMaxArrivals,
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
  private _lastWidth = 0;
  private _lastHeight = 0;
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
  private calendar!: CalendarState;
  private depot!: DepotState;
  private economy: Economy = { coins: 0, lifetimeEarnings: 0 };

  private viewMode: ViewMode = 'corridor';
  private currentRoomSpecies?: Species;
  private gameContainer!: Phaser.GameObjects.Container;
  private navContainer!: Phaser.GameObjects.Container;
  private uiContainer!: Phaser.GameObjects.Container;
  private needsTimer?: Phaser.Time.TimerEvent;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private selectedAnimal?: Animal;
  private processing = false;         // double-click guard
  private showingCollarPicker = false; // bond race guard
  private scrollY = 0;
  private maxScrollY = 0;
  private scrollDragStartY = 0;
  private scrollDragStartOffset = 0;
  private isDragging = false;

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
    this.navContainer = this.add.container(0, 0);  // fixed above scrollable content
    this.uiContainer = this.add.container(0, 0);

    // ── Scroll support (drag + mouse wheel) ──
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.scrollDragStartY = pointer.y;
      this.scrollDragStartOffset = this.scrollY;
      this.isDragging = false;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this.maxScrollY <= 0) return;
      const dy = pointer.y - this.scrollDragStartY;
      if (Math.abs(dy) > 8) this.isDragging = true;
      if (this.isDragging) {
        this.scrollY = Phaser.Math.Clamp(this.scrollDragStartOffset + dy, -this.maxScrollY, 0);
        this.gameContainer.y = this.scrollY;
      }
    });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gos: unknown, _dx: number, dy: number) => {
      if (this.maxScrollY <= 0) return;
      this.scrollY = Phaser.Math.Clamp(this.scrollY - dy * 0.5, -this.maxScrollY, 0);
      this.gameContainer.y = this.scrollY;
    });

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
      this.registry.remove('groomResult');

      this.saveState();
    }

    // Check if returning from depot/supply with updated economy
    const updatedEconomy = this.registry.get('updatedEconomy') as Economy | undefined;
    if (updatedEconomy) {
      this.economy = updatedEconomy;
      this.registry.remove('updatedEconomy');
      this.saveState();
    }
    const updatedDepot = this.registry.get('updatedDepot') as DepotState | undefined;
    if (updatedDepot) {
      this.depot = updatedDepot;
      this.registry.remove('updatedDepot');
      this.saveState();
    }

    // Start needs decay timer (every 2 seconds = 1 game-minute)
    this.needsTimer = this.time.addEvent({
      delay: 2000,
      callback: this.tickAllNeeds,
      callbackScope: this,
      loop: true,
    });

    // Spawn a new animal periodically (every 45 seconds — gentle pace for kids)
    this.spawnTimer = this.time.addEvent({
      delay: 45000,
      callback: this.spawnNewAnimal,
      callbackScope: this,
      loop: true,
    });

    // Start with an animal if none exist
    if (this.animals.length === 0) {
      this.spawnNewAnimal();
    }

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

        // Calendar
        if (saved.calendar && typeof saved.calendar === 'object') {
          this.calendar = saved.calendar as CalendarState;
        }
        // Depot
        if (saved.depot && typeof saved.depot === 'object') {
          this.depot = saved.depot as DepotState;
        }
        // Economy
        if (saved.economy && typeof saved.economy === 'object') {
          this.economy = saved.economy as Economy;
        }
      }
    } catch {
      // First time — no saved state
    }

    // Initialize subsystems with defaults if not loaded from save
    if (!this.calendar) {
      this.calendar = createCalendarState(new Date().toISOString());
    }
    if (!this.depot) {
      this.depot = {
        sessionsRemainingToday: 3,
        sessionsMaxToday: 3,
        lastSessionDay: '',
        totalSessionsPlayed: 0,
        inventory: {
          parts: {}, tools: {}, treats: {}, superTreats: {},
          decorations: {}, medicalSupplies: {},
        },
      };
    }

    // Advance calendar and check for daily reset
    this.calendar = advanceCalendar(this.calendar, this.calendar.gameStartedAt);
    if (isDailyReset(this.calendar, new Date())) {
      this.depot = resetDailySessions(this.depot);
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
            calendar: this.calendar,
            depot: this.depot,
            economy: this.economy,
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
    // Level-based population cap — don't overcrowd the centre
    const sheltered = this.animals.filter((a) => a.state === 'sheltered' || a.state === 'bonding').length;
    const maxShelter = getMaxShelterAnimals(this.level);
    if (sheltered >= maxShelter) return;

    // Level-based arrival queue cap
    const arriving = this.animals.filter((a) => a.state === 'arriving');
    const maxArrivals = getMaxArrivals(this.level);
    if (arriving.length >= maxArrivals) return;

    // Pick a species not already in the arrival queue (variety for the player)
    const arrivingSpecies = new Set(arriving.map((a) => a.species));
    const availableSpecies = this.unlockedSpecies.filter((s) => !arrivingSpecies.has(s));
    if (availableSpecies.length === 0) return;

    const species = pickRandomSpecies(availableSpecies);

    if (shouldSpawnSiblings() && sheltered + 2 <= maxShelter) {
      const [a, b] = spawnSiblingPair(species);
      this.animals.push(a, b);
    } else {
      const animal = spawnAnimal(species, undefined, this.animals.map(a => a.name));
      this.animals.push(animal);
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
    this.navContainer.removeAll(true);
    this.scrollY = 0;
    this.maxScrollY = 0;
    this.gameContainer.y = 0;
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
    const required = getRequiredRescuesForLevel(this.level);
    const xpProgress = Math.min(this.totalRescued / required, 1);
    const shelteredCount = this.animals.filter((a) => a.state === 'sheltered' || a.state === 'bonding').length;
    const maxShelter = getMaxShelterAnimals(this.level);

    // Constrain to 600px centred for large screens
    const maxW = Math.min(width, 600);
    const leftEdge = (width - maxW) / 2 + 10;
    const rightEdge = width - (width - maxW) / 2 - 10;
    const orbY = 30;
    const orbH = 44;

    // ── LEFT: Level orb with XP bar ───────────────────────────
    const leftOrbW = 170;
    const leftX = leftEdge;
    const leftGfx = this.add.graphics();
    leftGfx.fillStyle(0x000000, 0.14);
    leftGfx.fillRoundedRect(leftX + 2, orbY - orbH / 2 + 3, leftOrbW, orbH, orbH / 2);
    leftGfx.fillStyle(0xffffff, 0.96);
    leftGfx.fillRoundedRect(leftX, orbY - orbH / 2, leftOrbW, orbH, orbH / 2);
    this.uiContainer.add(leftGfx);

    // Green level circle
    const lvlCx = leftX + orbH / 2;
    const lvlCircle = this.add.graphics();
    lvlCircle.fillStyle(0x5AAE4A, 1);
    lvlCircle.fillCircle(lvlCx, orbY, orbH / 2 - 4);
    this.uiContainer.add(lvlCircle);
    this.uiContainer.add(
      this.add.text(lvlCx, orbY, `${this.level}`, {
        fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    // XP label + bar
    const xpX = leftX + orbH + 2;
    const xpW = leftOrbW - orbH - 14;
    this.uiContainer.add(
      this.add.text(xpX, orbY - 9, `${this.totalRescued} / ${required} rescued`, {
        fontSize: '10px', fontFamily: FONTS.body, fontStyle: 'bold', color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5)
    );
    const xpBar = this.add.graphics();
    xpBar.fillStyle(0xe6e2d8, 1);
    xpBar.fillRoundedRect(xpX, orbY + 3, xpW, 7, 3.5);
    if (xpProgress > 0) {
      xpBar.fillStyle(0x5AAE4A, 1);
      xpBar.fillRoundedRect(xpX, orbY + 3, Math.max(6, xpW * xpProgress), 7, 3.5);
    }
    this.uiContainer.add(xpBar);

    // ── RIGHT SIDE: stack orbs from right edge leftward ─────
    let rx = rightEdge;
    const orbSize = 40;

    // Helper — round icon button orb
    const drawIconOrb = (iconKey: string, textFallback: string, onTap: () => void) => {
      const cx = rx - orbSize / 2;
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.14);
      shadow.fillCircle(cx + 2, orbY + 3, orbSize / 2);
      shadow.fillStyle(0xffffff, 0.96);
      shadow.fillCircle(cx, orbY, orbSize / 2);
      this.uiContainer.add(shadow);
      if (this.textures.exists(iconKey)) {
        const img = this.add.image(cx, orbY, iconKey).setDisplaySize(22, 22).setOrigin(0.5);
        this.uiContainer.add(img);
      } else {
        this.uiContainer.add(
          this.add.text(cx, orbY, textFallback, {
            fontSize: '11px', fontFamily: FONTS.body, fontStyle: 'bold', color: COLOURS.text, resolution: TEXT_RESOLUTION,
          }).setOrigin(0.5)
        );
      }
      const hit = this.add.circle(cx, orbY, orbSize / 2, 0x000000, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', onTap);
      this.uiContainer.add(hit);
      rx -= orbSize + 6;
    };

    // Helper — pill showing a value next to a coloured circle icon
    const drawValuePill = (value: string, iconKey: string, iconTint: number) => {
      const pillW = 70;
      const x0 = rx - pillW;
      const gfx = this.add.graphics();
      gfx.fillStyle(0x000000, 0.14);
      gfx.fillRoundedRect(x0 + 2, orbY - orbH / 2 + 3, pillW, orbH, orbH / 2);
      gfx.fillStyle(0xffffff, 0.96);
      gfx.fillRoundedRect(x0, orbY - orbH / 2, pillW, orbH, orbH / 2);
      this.uiContainer.add(gfx);
      const circ = this.add.graphics();
      circ.fillStyle(iconTint, 1);
      circ.fillCircle(x0 + orbH / 2, orbY, orbH / 2 - 5);
      this.uiContainer.add(circ);
      if (this.textures.exists(iconKey)) {
        this.uiContainer.add(
          this.add.image(x0 + orbH / 2, orbY, iconKey).setDisplaySize(22, 22).setOrigin(0.5)
        );
      }
      this.uiContainer.add(
        this.add.text(x0 + orbH + 2, orbY, value, {
          fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold', color: COLOURS.text, resolution: TEXT_RESOLUTION,
        }).setOrigin(0, 0.5)
      );
      rx = x0 - 6;
    };

    // Audio toggle orb (right-most — save is now automatic, no button needed)
    const audioState = AudioManager.getInstance().getState();
    const audioKey = audioState.musicEnabled ? 'icon-music-on' : 'icon-music-off';
    drawIconOrb(audioKey, audioState.musicEnabled ? 'ON' : 'OFF', () => {
      AudioManager.getInstance().toggleMusic();
      this.renderHUD();
    });

    // Coin pill (painterly hud-coins sign)
    if (this.economy.coins > 0) {
      const coinIcon = this.textures.exists('hud-coins') ? 'hud-coins' : 'icon-hud-coins';
      drawValuePill(`${this.economy.coins}`, coinIcon, 0xe3b04b);
    }

    // Shelter pill (painterly hud-homes sign)
    if (shelteredCount > 0) {
      const homesIcon = this.textures.exists('hud-homes') ? 'hud-homes' : 'icon-hud-homes';
      drawValuePill(`${shelteredCount}/${maxShelter}`, homesIcon, 0x8B6914);
    }
  }

  // ── Bottom Navigation Bar ────────────────────────────────────

  private renderNavBar(options?: { showBack?: boolean }): void {
    const { width, height } = this.scale;

    type NavTab = {
      iconKey: string; label: string; active: boolean; action: () => void;
    };

    // Painterly nav icons live in signs/ — fall back to older icons/ keys if texture missing
    const homeKey = this.textures.exists('nav-home') ? 'nav-home' : 'icon-home';
    const careKey = this.textures.exists('nav-care') ? 'nav-care' : 'icon-kitchen';
    const socialKey = this.textures.exists('nav-social') ? 'nav-social' : 'icon-social';
    const playKey = this.textures.exists('nav-play') ? 'nav-play' : 'icon-games';

    // Layout: 2 tabs LEFT of centre, central A.R.C. FAB, 2 tabs RIGHT of centre
    const leftTabs: NavTab[] = options?.showBack
      ? [
          { iconKey: 'icon-back', label: 'Back', active: false,
            action: () => { this.viewMode = 'corridor'; this.renderView(); } },
          { iconKey: careKey, label: 'Care', active: this.viewMode === 'kitchen' || this.viewMode === 'garden',
            action: () => { this.viewMode = 'kitchen'; this.renderView(); } },
        ]
      : [
          { iconKey: homeKey, label: 'Home', active: this.viewMode === 'corridor',
            action: () => { this.viewMode = 'corridor'; this.renderView(); } },
          { iconKey: careKey, label: 'Care', active: this.viewMode === 'kitchen' || this.viewMode === 'garden',
            action: () => { this.viewMode = 'kitchen'; this.renderView(); } },
        ];

    // Right tabs: Play (opens games popup) + Social
    const rightTabs: NavTab[] = [
      { iconKey: playKey, label: 'Play', active: false,
        action: () => this.showGamesPopup() },
      { iconKey: socialKey, label: 'Social', active: false,
        action: () => { this.saveState(); this.scene.start('SocialScene'); } },
    ];

    // ── Bar geometry ──────────────────────────────────────
    const tabW = 74;
    const tabH = 60;
    const fabSize = 68;
    const fabGap = 12;
    const tabsSide = leftTabs.length; // 2
    const barW = Math.min(width - 20, tabsSide * 2 * tabW + fabSize + fabGap * 2 + 28);
    const barH = tabH + 16;
    const barX = (width - barW) / 2;
    const barY = height - barH - 16;

    // Glass bar background
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.14);
    bg.fillRoundedRect(barX + 2, barY + 4, barW, barH, barH / 2);
    bg.fillStyle(0xffffff, 0.92);
    bg.fillRoundedRect(barX, barY, barW, barH, barH / 2);
    // Inner top highlight
    bg.fillStyle(0xffffff, 0.6);
    bg.fillRoundedRect(barX + 2, barY + 2, barW - 4, 6, { tl: barH / 2, tr: barH / 2, bl: 0, br: 0 });
    this.navContainer.add(bg);

    // ── Tab drawer ────────────────────────────────────────
    const drawTab = (tab: NavTab, tx: number, ty: number) => {
      if (tab.active) {
        const pill = this.add.graphics();
        pill.fillStyle(0x5AAE4A, 0.18);
        pill.fillRoundedRect(tx - tabW / 2 + 3, ty - tabH / 2 + 2, tabW - 6, tabH - 4, 16);
        this.navContainer.add(pill);
      }
      const iconPx = tab.active ? 40 : 36;
      if (this.textures.exists(tab.iconKey)) {
        const img = this.add.image(tx, ty - 9, tab.iconKey).setDisplaySize(iconPx, iconPx).setOrigin(0.5);
        if (!tab.active) img.setAlpha(0.78);
        this.navContainer.add(img);
      } else {
        this.navContainer.add(
          this.add.text(tx, ty - 9, tab.label.slice(0, 2), {
            fontSize: `${iconPx}px`, fontFamily: FONTS.title, fontStyle: 'bold',
            color: tab.active ? '#3d8a2e' : '#6b5a4a', resolution: TEXT_RESOLUTION,
          }).setOrigin(0.5)
        );
      }
      this.navContainer.add(
        this.add.text(tx, ty + 18, tab.label, {
          fontSize: tab.active ? '12px' : '11px',
          fontFamily: FONTS.body, fontStyle: 'bold',
          color: tab.active ? '#3d8a2e' : '#6b5a4a', resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
      );
      const hit = this.add.rectangle(tx, ty, tabW, tabH, 0x000000, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', tab.action);
      this.navContainer.add(hit);
    };

    // Positions — divide bar into left/FAB/right regions
    const ty = barY + barH / 2;
    const fabX = barX + barW / 2;
    const fabY = barY - 14;

    const leftStart = barX + 10;
    const leftAvail = (barW / 2) - (fabSize / 2 + fabGap) - 10;
    leftTabs.forEach((tab, i) => {
      const tx = leftStart + leftAvail * ((i + 0.5) / leftTabs.length);
      drawTab(tab, tx, ty);
    });

    const rightStart = barX + barW / 2 + fabSize / 2 + fabGap;
    const rightAvail = (barW / 2) - (fabSize / 2 + fabGap) - 10;
    rightTabs.forEach((tab, i) => {
      const tx = rightStart + rightAvail * ((i + 0.5) / rightTabs.length);
      drawTab(tab, tx, ty);
    });

    // ── Central FAB: A.R.C. signboard → MainMenuScene ─────
    const fabShadow = this.add.graphics();
    fabShadow.fillStyle(0x000000, 0.28);
    fabShadow.fillCircle(fabX + 2, fabY + 5, fabSize / 2);
    this.navContainer.add(fabShadow);

    if (this.textures.exists('fab-arc')) {
      // Painterly signboard — no coloured disc behind it, let the art breathe
      const fabIcon = this.add.image(fabX, fabY, 'fab-arc').setDisplaySize(fabSize + 8, fabSize + 8).setOrigin(0.5);
      this.navContainer.add(fabIcon);
    } else {
      // Fallback: cream disc with "A.R.C." lettering
      const fabBg = this.add.graphics();
      fabBg.fillStyle(0xE67E22, 1);
      fabBg.fillCircle(fabX, fabY, fabSize / 2);
      fabBg.lineStyle(3, 0xffffff, 1);
      fabBg.strokeCircle(fabX, fabY, fabSize / 2);
      fabBg.fillStyle(0xffffff, 0.22);
      fabBg.fillCircle(fabX, fabY - fabSize / 6, fabSize / 4);
      this.navContainer.add(fabBg);
      this.navContainer.add(
        this.add.text(fabX, fabY, 'A.R.C.', {
          fontSize: '12px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff', resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
      );
    }

    const fabHit = this.add.circle(fabX, fabY, (fabSize + 8) / 2, 0x000000, 0).setInteractive({ useHandCursor: true });
    fabHit.on('pointerdown', () => { this.saveState(); this.scene.start('MainMenuScene'); });
    this.navContainer.add(fabHit);
  }

  // ── Games Popup ─────────────────────────────────────────────

  private showGamesPopup(): void {
    const { width, height } = this.scale;

    // Overlay to capture taps outside the popup
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4)
      .setInteractive();
    this.gameContainer.add(overlay);

    // Popup panel
    const popupW = Math.min(300, width - 40);
    const popupH = 200;
    const popupX = width / 2;
    const popupY = height / 2 - 40;

    // Panel shadow
    const popupGfx = this.add.graphics();
    popupGfx.fillStyle(0x000000, 0.15);
    popupGfx.fillRoundedRect(popupX - popupW / 2 + 4, popupY - popupH / 2 + 5, popupW, popupH, 16);
    popupGfx.fillStyle(0xfef9ef, 1);
    popupGfx.fillRoundedRect(popupX - popupW / 2, popupY - popupH / 2, popupW, popupH, 14);
    popupGfx.lineStyle(2, 0x5a3d8a, 0.6);
    popupGfx.strokeRoundedRect(popupX - popupW / 2, popupY - popupH / 2, popupW, popupH, 14);
    this.gameContainer.add(popupGfx);

    // Title
    this.gameContainer.add(
      this.add.text(popupX, popupY - popupH / 2 + 30, 'Games', {
        fontSize: '22px', fontFamily: FONTS.title, fontStyle: 'bold',
        color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Depot button
    const btnW = Math.min(220, popupW - 40);
    this.gameContainer.add(
      createButton(this, popupX, popupY - 10, 'Depot', () => {
        this.saveState();
        this.scene.start('DepotScene', { level: this.level, depot: this.depot, economy: this.economy });
      }, { width: btnW, fontSize: '20px', bgColour: '#4a2d7a', icon: 'icon-depot' })
    );

    // Supply Run button
    this.gameContainer.add(
      createButton(this, popupX, popupY + 52, 'Supply Run', () => {
        this.saveState();
        this.scene.start('SupplyRunScene', { level: this.level, economy: this.economy });
      }, { width: btnW, fontSize: '20px', bgColour: '#d46020', icon: 'icon-supply-run' })
    );

    // Tap overlay to close
    overlay.on('pointerdown', () => {
      // Remove popup elements by re-rendering
      this.renderView();
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

    // Subtle brick/building interior pattern
    const bgPattern = this.add.graphics();
    bgPattern.lineStyle(1, 0xd4c8b8, 0.05);
    for (let bx = 0; bx < width; bx += 50) {
      for (let by = 0; by < height; by += 25) {
        const ox = ((by / 25) % 2) * 25;
        bgPattern.strokeRect(bx + ox, by, 48, 23);
      }
    }
    this.gameContainer.add(bgPattern);

    // Title
    this.gameContainer.add(
      createPillTitle(this, width / 2, 55, 'Rescue Centre', { bgColour: 0x8B6914, fontSize: '20px', icon: 'icon-rescue-centre' })
    );

    // Painted corridor has 7 doors in perspective. Map unlocked species to door slots
    // (outer doors first — biggest / most visible), placing a wooden nameplate sign
    // overlay with species icon + count. The sign, not a white card, is the hit target.
    const DOOR_SLOTS: { xFrac: number; yFrac: number; scale: number }[] = [
      { xFrac: 0.09, yFrac: 0.56, scale: 1.00 }, // far left
      { xFrac: 0.91, yFrac: 0.56, scale: 1.00 }, // far right
      { xFrac: 0.22, yFrac: 0.55, scale: 0.82 }, // left-2
      { xFrac: 0.78, yFrac: 0.55, scale: 0.82 }, // right-2
      { xFrac: 0.36, yFrac: 0.54, scale: 0.68 }, // left-3
      { xFrac: 0.64, yFrac: 0.54, scale: 0.68 }, // right-3
      { xFrac: 0.50, yFrac: 0.53, scale: 0.60 }, // centre (furthest)
    ];
    const doorBodyH = height - 40;
    const doorBodyTop = 20;

    this.unlockedSpecies.forEach((species, i) => {
      const slot = DOOR_SLOTS[i] ?? DOOR_SLOTS[DOOR_SLOTS.length - 1];
      const x = width * slot.xFrac;
      const y = doorBodyTop + doorBodyH * slot.yFrac;
      const s = slot.scale;

      const roomAnimals = this.animals.filter((a) => a.species === species && a.state !== 'arriving');
      const count = roomAnimals.length;
      const colour = SPECIES_COLOURS[species];

      // Painted door sign (sign-cat.png, sign-dog.png, …). Fall back to the old
      // programmatic plank + icon combo only if the painted asset is missing.
      const signKey = `sign-${species}`;
      const hasPainted = this.textures.exists(signKey);

      // Sign display size scales with the door slot (preserve painted aspect ratio)
      const signW = 140 * s;
      const signDisplay = hasPainted
        ? (() => {
            const tex = this.textures.get(signKey).getSourceImage() as HTMLImageElement;
            const ratio = tex && tex.height ? tex.width / tex.height : 2.2;
            const w = signW;
            const h = w / ratio;
            return { w, h };
          })()
        : { w: 120 * s, h: 56 * s };

      let signDisplayObj: Phaser.GameObjects.GameObject;

      if (hasPainted) {
        const signImg = this.add.image(x, y, signKey)
          .setDisplaySize(signDisplay.w, signDisplay.h)
          .setOrigin(0.5);
        this.gameContainer.add(signImg);
        signDisplayObj = signImg;
      } else {
        // Fallback: programmatic wooden plank with species icon + name + count.
        const signGfx = this.add.graphics();
        const sw = signDisplay.w, sh = signDisplay.h;
        signGfx.fillStyle(0x000000, 0.22);
        signGfx.fillRoundedRect(x - sw / 2 + 2, y - sh / 2 + 3, sw, sh, 10);
        signGfx.fillStyle(0xd4a574, 1);
        signGfx.fillRoundedRect(x - sw / 2, y - sh / 2, sw, sh, 10);
        signGfx.fillStyle(0xe8c48d, 1);
        signGfx.fillRoundedRect(x - sw / 2 + 4, y - sh / 2 + 4, sw - 8, sh - 8, 7);
        signGfx.fillStyle(colour, 1);
        signGfx.fillRoundedRect(x - sw / 2 + 4, y - sh / 2 + 4, 5, sh - 8, { tl: 7, tr: 0, bl: 7, br: 0 });
        signGfx.lineStyle(2, 0x8b5a2b, 0.85);
        signGfx.strokeRoundedRect(x - sw / 2, y - sh / 2, sw, sh, 10);
        this.gameContainer.add(signGfx);

        const iconX = x - sw / 2 + 22 * s;
        const iconPx = 34 * s;
        const speciesIconKey = `icon-${species}`;
        if (this.textures.exists(speciesIconKey)) {
          this.gameContainer.add(
            this.add.image(iconX, y, speciesIconKey).setDisplaySize(iconPx, iconPx).setOrigin(0.5)
          );
        } else {
          const fg = this.add.graphics();
          fg.fillStyle(colour, 1);
          fg.fillCircle(iconX, y, iconPx / 2);
          this.gameContainer.add(fg);
        }

        const textX = iconX + iconPx / 2 + 6;
        const nameLabel = species.charAt(0).toUpperCase() + species.slice(1);
        this.gameContainer.add(
          this.add.text(textX, y - 9, nameLabel, {
            fontSize: `${Math.round(13 * s)}px`, fontFamily: FONTS.title, fontStyle: 'bold',
            color: '#4a2d14', resolution: TEXT_RESOLUTION,
          }).setOrigin(0, 0.5)
        );
        this.gameContainer.add(
          this.add.text(textX, y + 9, `${count} ${pluralSpecies(species, count)}`, {
            fontSize: `${Math.round(11 * s)}px`, fontFamily: FONTS.body, fontStyle: 'bold',
            color: '#6b4020', resolution: TEXT_RESOLUTION,
          }).setOrigin(0, 0.5)
        );
        signDisplayObj = signGfx;
      }

      // Count badge in the top-right corner of the sign (painted signs only — the
      // programmatic fallback already shows the count inline).
      if (hasPainted && count > 0) {
        const badgeR = Math.max(10, 14 * s);
        const badgeX = x + signDisplay.w / 2 - badgeR * 0.4;
        const badgeY = y - signDisplay.h / 2 + badgeR * 0.4;
        const badgeGfx = this.add.graphics();
        badgeGfx.fillStyle(0x000000, 0.28);
        badgeGfx.fillCircle(badgeX + 1, badgeY + 2, badgeR);
        badgeGfx.fillStyle(colour, 1);
        badgeGfx.fillCircle(badgeX, badgeY, badgeR);
        badgeGfx.lineStyle(2, 0xffffff, 0.95);
        badgeGfx.strokeCircle(badgeX, badgeY, badgeR);
        this.gameContainer.add(badgeGfx);
        this.gameContainer.add(
          this.add.text(badgeX, badgeY, String(count), {
            fontSize: `${Math.round(badgeR * 1.2)}px`, fontFamily: FONTS.title,
            fontStyle: 'bold', color: '#ffffff', resolution: TEXT_RESOLUTION,
          }).setOrigin(0.5)
        );
      }

      // Hit area over the sign
      const hitArea = this.add.rectangle(x, y, signDisplay.w, signDisplay.h, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hitArea.on('pointerover', () => {
        if ('setAlpha' in signDisplayObj) (signDisplayObj as Phaser.GameObjects.Image).setAlpha(0.85);
      });
      hitArea.on('pointerout', () => {
        if ('setAlpha' in signDisplayObj) (signDisplayObj as Phaser.GameObjects.Image).setAlpha(1);
      });
      hitArea.on('pointerdown', () => {
        this.currentRoomSpecies = species;
        this.viewMode = 'room';
        this.renderView();
      });
      this.gameContainer.add(hitArea);
    });

    // ── Arriving animals — stand on the corridor floor with speech bubbles ──
    const arriving = this.animals.filter((a) => a.state === 'arriving');
    // Floor placed well above the FAB/nav dock so the animal doesn't collide with it.
    // Nav dock sits at ~height - 80; FAB raises above that by 14px + its radius (31).
    // So the FAB-top is roughly at height - 125. Keep the animal's feet clear above.
    const navDockTopEst = height - 80 - 45; // with FAB lift room
    const floorY = Math.max(height * 0.68, navDockTopEst);

    if (arriving.length > 0) {
      // Banner pill positioned between the painted doors and the floor
      const bannerY = Math.min(height * 0.62, floorY - 80);
      this.gameContainer.add(
        createPillTitle(this, width / 2, bannerY,
          `${arriving.length} new arrival${arriving.length > 1 ? 's' : ''}!`,
          { bgColour: 0xE67E22, fontSize: '17px', icon: 'icon-inbox' })
      );

      // Subtle floor line across the corridor
      const floorGfx = this.add.graphics();
      floorGfx.fillStyle(0x000000, 0.08);
      floorGfx.fillRect(20, floorY + 1, width - 40, 2);
      this.gameContainer.add(floorGfx);

      // Layout animals evenly along the floor
      const n = arriving.length;
      const slotW = Math.min(280, (width - 40) / n);
      const startX = width / 2 - ((n - 1) * slotW) / 2;

      // Corridor uses procedural even-spacing — existing corridor.*.arriving
      // anchors only define a single spot per species, so multiple animals of
      // the same species would stack on top of each other. Spread them evenly
      // along the floor instead.
      arriving.forEach((animal, i) => {
        const ax = startX + i * slotW;
        const spriteW = 90;
        const spriteH = 74;
        const spriteCy = floorY - spriteH / 2 + 2;

        // Drop shadow anchoring sprite to the floor
        const shadowFeetY = spriteCy + spriteH / 2;
        const shadow = this.add.ellipse(ax, shadowFeetY + 4, spriteW * 0.65, spriteH * 0.16, 0x000000, 0.28);
        this.gameContainer.add(shadow);

        // Sprite sits with its bottom on the floor line
        const sprite = createAnimalSprite(
          this, ax, spriteCy, animal,
          { width: spriteW, height: spriteH, interactive: true }
        );
        sprite.on('pointerdown', () => this.showAnimalDetails(animal));
        this.gameContainer.add(sprite);

        // Gentle idle bob so the sprite feels alive
        this.tweens.add({
          targets: sprite, y: sprite.y - 3,
          duration: 1400 + i * 120, yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut', delay: i * 200,
        });

        // Speech bubble above — tail points at the top of the sprite
        const bubbleAnchorY = floorY - spriteH - 4;
        const speciesLabel = animal.variant
          ? `${animal.variant} ${animal.species}`
          : animal.species;
        const title = `${animal.name} the ${speciesLabel}`;
        const bubbleW = Math.min(260, slotW - 20);
        const bubble = createSpeechBubble(this, ax, bubbleAnchorY, {
          title,
          body: animal.arrivalStory,
          actionLabel: 'Welcome',
          actionBgHex: '#e74c3c',
          actionIcon: 'icon-welcome',
          accentColour: SPECIES_COLOURS[animal.species],
          maxWidth: bubbleW,
          onAction: () => {
            if (this.processing) return;
            this.processing = true;
            animal.state = 'sheltered';
            this.totalRescued += 1;
            this.checkLevelProgression();
            AudioManager.getInstance().playSfx('animal_arrive');
            this.saveState();
            this.processing = false;
            this.renderView();
          },
        });
        this.gameContainer.add(bubble);
      });

      // "Welcome them all" shortcut if more than one — pinned below the doors banner
      if (arriving.length > 1) {
        this.gameContainer.add(
          createButton(this, width / 2, bannerY + 36, 'Welcome them all', () => {
            if (this.processing) return;
            this.processing = true;
            arriving.forEach((a) => { a.state = 'sheltered'; });
            this.totalRescued += arriving.length;
            this.checkLevelProgression();
            AudioManager.getInstance().playSfx('animal_arrive');
            this.saveState();
            this.processing = false;
            this.renderView();
          }, { width: 240, fontSize: '14px', icon: 'icon-welcome' })
        );
      }
    }

    // Corridor never needs scroll — everything fits in viewport (doors + floor)
    this.maxScrollY = 0;

    // Bottom navigation bar
    this.renderNavBar();
  }

  // ── Anchor placement helpers ────────────────────────────────

  /** Derive sprite visual state (mirrors sprites.ts) for anchor lookup. */
  private deriveAnchorState(animal: Animal): string {
    if (animal.state === 'arriving') return 'arriving';
    if (animal.tiredness >= 70) return 'sleeping';
    if (animal.hunger >= 70) return 'eating';
    return 'sheltered';
  }

  /**
   * Convert an Anchor (feet position in fractional bg coords) into a pixel
   * sprite-centre position, plus the size to render at. Returns null if no
   * anchor is supplied so caller can fall back to procedural layout.
   */
  private resolveAnchor(
    anchor: Anchor | null,
    bgTopY: number, bgW: number, bgH: number,
    baseW: number, baseH: number,
  ): { cx: number; cy: number; w: number; h: number; flipX: boolean } | null {
    if (!anchor) return null;
    const s = anchor.scale ?? 1;
    const w = baseW * s;
    const h = baseH * s;
    const feetX = anchor.x * bgW;
    const feetY = bgTopY + anchor.y * bgH;
    return {
      cx: feetX,
      cy: feetY - h / 2,
      w, h,
      flipX: anchor.facing === 'left',
    };
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
      createPillTitle(this, width / 2, 55, `${species.charAt(0).toUpperCase() + species.slice(1)} Room`, { bgColour: 0x5AAE4A, fontSize: '28px', padX: 36, padY: 14 })
    );

    if (roomAnimals.length === 0) {
      this.gameContainer.add(
        this.add.text(width / 2, height / 2, 'No animals here yet.', {
          fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );
    } else {
      // Grid of animals — positioned at floor level (~65% screen height)
      const cols = Math.min(roomAnimals.length, 4);
      const colSpacing = Math.min(140, (width - 60) / cols);
      const startX = width / 2 - ((cols - 1) * colSpacing) / 2;
      const floorY = height * 0.55;

      // Anchor-driven placement when available (falls back to grid otherwise)
      const anchors = RoomAnchors.getInstance();
      const roomKey = `room-${species}`;
      const bgTopY = 20, bgW = width, bgH = height - 40;

      roomAnimals.forEach((animal, i) => {
        const baseSize = animal.state === 'pet' ? 120 : 100;
        const visualState = this.deriveAnchorState(animal);
        const anchor = anchors.pick(roomKey, animal.species, visualState, i);
        const placed = this.resolveAnchor(anchor, bgTopY, bgW, bgH, baseSize, baseSize * 0.8);

        const x = placed ? placed.cx : startX + (i % 4) * colSpacing;
        const y = placed ? placed.cy : floorY + Math.floor(i / 4) * 150;
        const size = placed ? placed.w : baseSize;

        // Animal sprite (real art or fallback rectangle)
        const sprite = createAnimalSprite(this, x, y, animal, {
          width: size, height: size * 0.8, interactive: true,
        });
        if (placed?.flipX && 'setFlipX' in sprite) {
          (sprite as Phaser.GameObjects.Image).setFlipX(true);
        }

        // Pet gold border (if sprite is a rectangle fallback)
        if (animal.state === 'pet' && sprite instanceof Phaser.GameObjects.Rectangle) {
          sprite.setStrokeStyle(3, 0xffd700, 0.8);
        }

        // Name pill badge
        const namePillGfx = this.add.graphics();
        const nameText = this.add.text(x, y + size / 2 + 14, animal.name, {
          fontSize: '16px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff', resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5);
        const nw = nameText.width + 20;
        const nh = nameText.height + 8;
        namePillGfx.fillStyle(SPECIES_COLOURS[animal.species], 0.85);
        namePillGfx.fillRoundedRect(x - nw / 2, y + size / 2 + 14 - nh / 2, nw, nh, 10);
        this.gameContainer.add(namePillGfx);
        this.gameContainer.add(nameText);

        // Sick indicator (icon-based, priority over need)
        const sickIllness = this.sickAnimals.get(animal.id);
        if (sickIllness) {
          const sickIconKey = 'icon-heal';
          if (this.textures.exists(sickIconKey)) {
            const sickIcon = this.add.image(x + size / 2 - 6, y - size * 0.4 - 6, sickIconKey)
              .setDisplaySize(22, 22).setOrigin(0.5);
            this.gameContainer.add(sickIcon);
          } else {
            const sickDot = this.add.circle(x + size / 2 - 6, y - size * 0.4 - 6, 8, 0xe74c3c)
              .setStrokeStyle(1, 0xffffff, 0.8);
            this.gameContainer.add(sickDot);
          }
        } else {
          // Need indicator — use icons where available
          const need = getUrgentNeed(animal);
          if (need) {
            const needIconMap: Record<string, string> = {
              hunger: 'icon-feed', tiredness: 'icon-rest', happiness: 'icon-play', health: 'icon-heal',
            };
            const needIcon = needIconMap[need];
            if (needIcon && this.textures.exists(needIcon)) {
              const ni = this.add.image(x + size / 2 - 6, y - size * 0.4 - 6, needIcon)
                .setDisplaySize(20, 20).setOrigin(0.5);
              this.gameContainer.add(ni);
            } else {
              const needColour = need === 'hunger' ? 0xe74c3c : need === 'tiredness' ? 0x3498db : need === 'happiness' ? 0xf1c40f : 0x2ecc71;
              const needDot = this.add.circle(x + size / 2 - 6, y - size * 0.4 - 6, 7, needColour)
                .setStrokeStyle(1, 0xffffff, 0.8);
              this.gameContainer.add(needDot);
            }
          }
        }

        // Bond indicator
        if (animal.bondLevel > 0) {
          const barW = 50;
          const barY = y + size / 2 + 32;
          const bondBar = this.add.rectangle(x, barY, barW, 5, 0xdddddd, 0.6).setOrigin(0.5);
          const bondFill = this.add.rectangle(
            x - barW / 2 + (animal.bondLevel / 100) * barW / 2, barY,
            (animal.bondLevel / 100) * barW, 5, 0xff6b9d
          ).setOrigin(0.5);
          this.gameContainer.add(bondBar);
          this.gameContainer.add(bondFill);
        }

        // Sibling indicator — small link icon or text
        if (animal.siblingId) {
          const sibIconKey = 'icon-friends';
          if (this.textures.exists(sibIconKey)) {
            const sibIcon = this.add.image(x - size / 2 + 6, y - size * 0.4 - 6, sibIconKey)
              .setDisplaySize(18, 18).setOrigin(0.5);
            this.gameContainer.add(sibIcon);
          } else {
            // Sibling link dot
            const sibDot = this.add.circle(x - size / 2 + 6, y - size * 0.4 - 6, 6, 0x9b59b6)
              .setStrokeStyle(1, 0xffffff, 0.8);
            this.gameContainer.add(sibDot);
          }
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

    // Card with shadow — taller to fit content
    const cardW = 400;
    const cardH = 480;
    const cardShadow = this.add.graphics();
    cardShadow.fillStyle(0x000000, 0.1);
    cardShadow.fillRoundedRect(width / 2 - cardW / 2 + 3, height / 2 - cardH / 2 + 4, cardW, cardH, 14);
    this.gameContainer.add(cardShadow);
    const card = this.add.rectangle(width / 2, height / 2, cardW, cardH, 0xffffff)
      .setStrokeStyle(2, 0x000000, 0.2);
    this.gameContainer.add(card);

    const cx = width / 2;
    const cardTop = height / 2 - cardH / 2;

    // Species sprite — constrained to fit inside card
    const detailSprite = createAnimalSprite(this, cx, cardTop + 65, animal, { width: 90, height: 72 });
    this.gameContainer.add(detailSprite);

    // Name + species (with variant if available)
    const speciesLabel = animal.variant
      ? `${animal.variant} ${animal.species}`
      : animal.species;
    this.gameContainer.add(
      this.add.text(cx, cardTop + 115, `${animal.name} the ${speciesLabel}`, {
        fontSize: '20px', fontFamily: FONTS.title, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Story
    this.gameContainer.add(
      this.add.text(cx, cardTop + 145, `"${animal.arrivalStory}"`, {
        fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.textLight,
        fontStyle: 'italic', wordWrap: { width: cardW - 40 }, align: 'center',
      }).setOrigin(0.5)
    );

    // Need speech
    const speech = getNeedSpeech(animal);
    if (speech) {
      this.gameContainer.add(
        this.add.text(cx, cardTop + 178, `"${speech}"`, {
          fontSize: '14px', fontFamily: FONTS.body, color: '#c0392b',
        }).setOrigin(0.5)
      );
    }

    // Stats bars
    const statsY = cardTop + 205;
    this.renderStatBar('Hunger', animal.hunger, 0xe74c3c, cx - 120, statsY, true);
    this.renderStatBar('Tiredness', animal.tiredness, 0x3498db, cx - 120, statsY + 28, true);
    this.renderStatBar('Happiness', animal.happiness, 0xf1c40f, cx - 120, statsY + 56, false);
    this.renderStatBar('Health', animal.health, 0x2ecc71, cx - 120, statsY + 84, false);
    this.renderStatBar('Bond', animal.bondLevel, 0xff6b9d, cx - 120, statsY + 112, false);

    // Action buttons
    const btnY = statsY + 155;

    if (animal.state !== 'pet') {
      this.gameContainer.add(
        createButton(this, cx - 120, btnY, 'Feed', () => {
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
        }, { width: 95, fontSize: '15px', icon: 'icon-kitchen' })
      );

      this.gameContainer.add(
        createButton(this, cx, btnY, 'Play', () => {
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
          createButton(this, cx + 120, btnY, 'Walk', () => {
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
          }, { width: 95, fontSize: '15px', bgColour: '#27ae60', icon: 'icon-walk' })
        );
      }

      // Groom button (only if animal is grubby)
      const cleanliness = animal.cleanliness ?? 100;
      const isSick = this.sickAnimals.has(animal.id);
      if (cleanliness < 60 && !isSick) {
        this.gameContainer.add(
          createButton(this, cx, btnY + 40, 'Groom', () => {
            this.closePopup();
            this.saveState();
            this.scene.start('GroomingScene', {
              animal,
              allAnimals: this.animals,
              onComplete: (updatedAnimals: Animal[]) => {
                this.animals = updatedAnimals;
                this.saveState();
              },
            });
          }, { width: 130, fontSize: '15px', bgColour: '#5A9CB8' })
        );
      }

      // Heal button (when animal is sick)
      const illness = this.sickAnimals.get(animal.id);
      if (illness) {
        this.gameContainer.add(
          this.add.text(cx, btnY + 40,
            `Sick: ${illness.label}`, {
            fontSize: '14px', fontFamily: FONTS.body, color: '#c0392b',
          }).setOrigin(0.5)
        );

        this.gameContainer.add(
          createButton(this, cx, btnY + 70, 'Heal!', () => {
            if (this.processing) return;
            this.processing = true;
            // Re-fetch illness in case it was cleared by a needs tick
            const currentIllness = this.sickAnimals.get(animal.id);
            if (!currentIllness) {
              this.processing = false;
              this.closePopup();
              this.renderView();
              return;
            }
            // Re-fetch the animal from the live array to avoid stale data
            const liveAnimal = this.animals.find((a) => a.id === animal.id);
            if (!liveAnimal) {
              this.processing = false;
              this.closePopup();
              this.renderView();
              return;
            }
            this.closePopup();
            this.saveState();
            this.scene.start('VetScene', {
              animal: liveAnimal,
              illness: currentIllness,
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
            this.processing = false;
          }, { width: 130, fontSize: '15px', bgColour: '#e74c3c', icon: 'icon-heal' })
        );
      }
    } else {
      // Pet — show collar colour swatch + name, and "Visit in garden" button
      const collarHexVal = animal.collarColour ?? '#ff6b9d';
      const collarName = COLLAR_COLOURS.find((c) => c.hex === collarHexVal)?.name ?? 'Custom';
      const collarSwatchColour = Phaser.Display.Color.HexStringToColor(collarHexVal).color;
      const collarSwatchGfx = this.add.circle(cx - 60, btnY - 10, 8, collarSwatchColour)
        .setStrokeStyle(1, 0x000000, 0.2);
      this.gameContainer.add(collarSwatchGfx);
      this.gameContainer.add(
        this.add.text(cx - 44, btnY - 10,
          `${collarName} Collar`, {
          fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
        }).setOrigin(0, 0.5)
      );

      this.gameContainer.add(
        createButton(this, cx, btnY + 30, 'Visit in Garden', () => {
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
            `Sick: ${petIllness.label}`, {
            fontSize: '14px', fontFamily: FONTS.body, color: '#c0392b',
          }).setOrigin(0.5)
        );

        this.gameContainer.add(
          createButton(this, cx, btnY + 95, 'Take to Vet', () => {
            if (this.processing) return;
            this.processing = true;
            const currentPetIllness = this.sickAnimals.get(animal.id);
            if (!currentPetIllness) {
              this.processing = false;
              this.closePopup();
              this.renderView();
              return;
            }
            const livePet = this.animals.find((a) => a.id === animal.id);
            if (!livePet) {
              this.processing = false;
              this.closePopup();
              this.renderView();
              return;
            }
            this.closePopup();
            this.saveState();
            this.scene.start('VetScene', {
              animal: livePet,
              illness: currentPetIllness,
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
            this.processing = false;
          }, { width: 180, fontSize: '15px', bgColour: '#e74c3c', icon: 'icon-vet' })
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
        fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.text, resolution: TEXT_RESOLUTION,
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
        fontSize: '14px', fontFamily: FONTS.body, color: '#888', resolution: TEXT_RESOLUTION,
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
      createPillTitle(this, width / 2, 55, 'Kitchen', { bgColour: 0xD4A017, fontSize: '20px', icon: 'icon-kitchen' })
    );

    // Find hungry animals
    const hungry = this.animals.filter((a) => a.hunger > 60 && a.state !== 'arriving');
    // Count of pets living in the Garden (the only ones actually rendered there)
    const petCount = this.animals.filter((a) => a.state === 'pet').length;

    // ── Semi-transparent card behind the text + buttons ───────────────
    // Sits over the painted counter so body text stays readable against the
    // busy kitchen background.
    const panelW = Math.min(420, width - 40);
    const panelH = hungry.length > 0 ? 260 : 140;
    const panelCy = height / 2 + 10;
    this.gameContainer.add(
      createPanel(this, width / 2, panelCy, panelW, panelH, {
        fillColour: 0xffffff,
        fillAlpha: 0.92,
        borderColour: 0xd4a017,
        borderWidth: 2,
        radius: 18,
      })
    );

    if (hungry.length === 0) {
      this.gameContainer.add(
        this.add.text(width / 2, panelCy - 10, 'Everyone is well-fed!', {
          fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.primary,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
      );
      this.gameContainer.add(
        this.add.text(width / 2, panelCy + 18, 'Check back when someone gets peckish.', {
          fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.textLight,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
      );
    } else {
      // Title
      this.gameContainer.add(
        this.add.text(width / 2, panelCy - 90,
          `${hungry.length} animal${hungry.length > 1 ? 's are' : ' is'} hungry!`, {
          fontSize: '22px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
      );

      // Subtitle
      this.gameContainer.add(
        this.add.text(width / 2, panelCy - 62,
          'Sort the right food into each animal\'s bowl!', {
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.textLight,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
      );

      // Species icons strip — small coloured dots for each hungry animal
      const iconSize = 32;
      const iconY = panelCy - 20;
      const iconSpacing = 40;
      const shownHungry = hungry.slice(0, Math.min(hungry.length, 8));
      const iconsStartX = width / 2 - ((shownHungry.length - 1) * iconSpacing) / 2;
      shownHungry.forEach((a, i) => {
        const ix = iconsStartX + i * iconSpacing;
        const bg = this.add.graphics();
        bg.fillStyle(SPECIES_COLOURS[a.species], 0.25);
        bg.fillCircle(ix, iconY, iconSize / 2 + 2);
        this.gameContainer.add(bg);
        const speciesIconKey = `icon-${a.species}`;
        if (this.textures.exists(speciesIconKey)) {
          this.gameContainer.add(
            this.add.image(ix, iconY, speciesIconKey).setDisplaySize(iconSize, iconSize).setOrigin(0.5)
          );
        } else {
          const c = this.add.graphics();
          c.fillStyle(SPECIES_COLOURS[a.species], 1);
          c.fillCircle(ix, iconY, iconSize / 2);
          this.gameContainer.add(c);
        }
      });

      // Launch minigame button
      this.gameContainer.add(
        createButton(this, width / 2, panelCy + 30, 'Start Sorting!', () => {
          this.scene.start('KitchenMinigameScene', {
            hungryAnimals: hungry,
            allAnimals: this.animals,
            onComplete: (updatedAnimals: Animal[]) => {
              this.animals = updatedAnimals;
              this.saveState();
            },
          });
        }, { width: 240 })
      );

      // Quick-feed option for accessibility
      this.gameContainer.add(
        createTextButton(this, width / 2, panelCy + 78,
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

    // Garden shortcut — always show below kitchen content
    // Label reflects pets only, because that's what the Garden actually shows.
    const gardenBtnY = panelCy + panelH / 2 + 30;
    const gardenLabel = petCount === 0
      ? 'Garden (empty)'
      : `Garden (${petCount} ${petCount === 1 ? 'pet' : 'pets'})`;
    this.gameContainer.add(
      createButton(this, width / 2, gardenBtnY, gardenLabel, () => {
        this.viewMode = 'garden';
        this.renderView();
      }, { width: 240, fontSize: '15px', bgColour: '#2ecc71', icon: 'icon-walk' })
    );

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
      createPillTitle(this, width / 2, 55, 'Garden', { bgColour: 0x2E8B57, fontSize: '22px', icon: 'icon-garden' })
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
          'Keep caring for your animals — when their bond\nreaches 100%, they become your pet forever!', {
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

      // Scatter pets on the grass (lower 40% of screen, above nav bar)
      const anchors = RoomAnchors.getInstance();
      const bgTopY = 20, bgW = width, bgH = height - 40;

      pets.forEach((pet, i) => {
        // Place on grass area — between 60% and 85% of screen height
        const grassTop = height * 0.6;
        const gardenLeft = width * 0.15;
        const gardenRight = width * 0.85;
        const cols = Math.min(pets.length, 4);
        const spacing = (gardenRight - gardenLeft) / (cols + 1);

        const visualState = this.deriveAnchorState(pet);
        const anchor = anchors.pick('garden', pet.species, visualState, i);
        const placed = this.resolveAnchor(anchor, bgTopY, bgW, bgH, 100, 80);

        const cx = placed
          ? placed.cx
          : gardenLeft + spacing * ((i % cols) + 1) + (Math.random() - 0.5) * 30;
        const cy = placed
          ? placed.cy
          : grassTop + Math.floor(i / cols) * 80 + (Math.random() * 20);
        const spriteW = placed ? placed.w : 100;
        const spriteH = placed ? placed.h : 80;

        // Collar colour ring
        const collarHex = pet.collarColour ?? '#ff6b9d';
        const collarColour = Phaser.Display.Color.HexStringToColor(collarHex).color;

        // Pet sprite (larger than shelter animals, with collar colour ring)
        const sprite = createAnimalSprite(this, cx, cy, pet, { width: spriteW, height: spriteH, interactive: true });
        if (placed?.flipX && 'setFlipX' in sprite) {
          (sprite as Phaser.GameObjects.Image).setFlipX(true);
        }
        if (sprite instanceof Phaser.GameObjects.Rectangle) {
          sprite.setStrokeStyle(3, collarColour);
        }

        // Collar colour dot below name
        this.gameContainer.add(
          this.add.circle(cx, cy + 42, 5, collarColour)
        );

        // Collar colour dot above pet
        this.gameContainer.add(
          this.add.circle(cx, cy - 44, 6, collarColour).setStrokeStyle(1, 0xffffff, 0.8)
        );

        // Name with collar colour dot
        this.gameContainer.add(
          this.add.text(cx, cy + 30, pet.name, {
            fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.text, resolution: TEXT_RESOLUTION,
          }).setOrigin(0.5)
        );

        // Happiness indicator — coloured dot (green=happy, yellow=ok, red=sad)
        const happyColour = pet.happiness > 70 ? 0x2ecc71 : pet.happiness > 40 ? 0xf1c40f : 0xe74c3c;
        this.gameContainer.add(
          this.add.circle(cx + 30, cy - 20, 6, happyColour).setStrokeStyle(1, 0xffffff, 0.8)
        );

        // Sick indicator — alert player this pet needs vet attention
        const petSickIllness = this.sickAnimals.get(pet.id);
        if (petSickIllness) {
          const sickLabel = this.add.text(cx, cy + 50, 'Sick!', {
            fontSize: '14px', fontFamily: FONTS.body, color: '#c0392b', resolution: TEXT_RESOLUTION,
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
      const upgradeNames = unlocked.map((u) => u.name).join(', ');
      this.gameContainer.add(
        this.add.text(width / 2, height - 110, `Upgrades: ${upgradeNames}`, {
          fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5)
      );
    }

    // Check for new available upgrades
    const available = getAvailableUpgrades(pets.length, this.houseUpgrades);
    if (available.length > 0) {
      this.gameContainer.add(
        createTextButton(this, width / 2, height - 85,
          `New upgrade available: ${available[0].name}!`, () => {
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
          `${this.earnedBadges.length} badge${this.earnedBadges.length > 1 ? 's' : ''} earned`, {
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

    // Star burst celebration — golden circles
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const sx = width / 2 + Math.cos(angle) * 120;
      const sy = height / 2 - 80 + Math.sin(angle) * 80;
      const star = this.add.circle(sx, sy, 12, 0xffd700)
        .setStrokeStyle(2, 0xdaa520).setAlpha(0);

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

    // Celebration text — above sprite
    this.gameContainer.add(
      createPillTitle(this, width / 2, 55, 'Full Bond!', { bgColour: 0xB8860B, fontSize: '26px', padX: 32, padY: 12 })
    );

    this.gameContainer.add(
      this.add.text(width / 2, 95,
        `${animal.name} loves you so much — they want to be your pet forever!`, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
        align: 'center', wordWrap: { width: width - 80 },
      }).setOrigin(0.5)
    );

    // Animal sprite — smaller, centred in upper area
    const spriteY = height * 0.28;
    const collarSprite = createAnimalSprite(this, width / 2, spriteY, animal, { width: 100, height: 80 });
    if (collarSprite instanceof Phaser.GameObjects.Rectangle) {
      collarSprite.setStrokeStyle(3, 0xffd700);
    }
    this.gameContainer.add(collarSprite);

    // Collar picker prompt
    const promptY = height * 0.42;
    this.gameContainer.add(
      this.add.text(width / 2, promptY, 'Choose a collar colour for your new pet:', {
        fontSize: '17px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Collar colour grid
    const colsPerRow = 4;
    const collarStartX = width / 2 - ((colsPerRow - 1) * 80) / 2;
    const collarStartY = promptY + 35;

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
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.text, resolution: TEXT_RESOLUTION,
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

    // Heart graphic
    const heartGfx = this.add.graphics();
    heartGfx.fillStyle(0xff6b9d, 1);
    heartGfx.fillCircle(width / 2 - 14, height / 2 - 68, 16);
    heartGfx.fillCircle(width / 2 + 14, height / 2 - 68, 16);
    heartGfx.fillTriangle(width / 2 - 28, height / 2 - 60, width / 2 + 28, height / 2 - 60, width / 2, height / 2 - 36);
    this.gameContainer.add(heartGfx);

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
      createButton(this, width / 2, height / 2 + 110, 'Visit Garden', () => {
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
    const text = this.add.text(0, 0, `New Badge: ${badgeCode}!`, {
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
      this.add.text(width / 2, 80, `${conflict.type.replace('_', ' ').toUpperCase()}!`, {
        fontSize: '26px', fontFamily: FONTS.title, color: '#e74c3c',
      }).setOrigin(0.5)
    );

    // Description — use the pre-built description from generateConflict
    const animal1 = this.animals.find((a) => a.id === conflict.animal1Id);
    const animal2 = this.animals.find((a) => a.id === conflict.animal2Id);

    this.gameContainer.add(
      this.add.text(width / 2, 130, conflict.description, {
        fontSize: '17px', fontFamily: FONTS.body, color: COLOURS.text,
        wordWrap: { width: width - 80 }, align: 'center',
      }).setOrigin(0.5)
    );

    // Animal sprites — match the conflict narrative so visuals reflect text.
    // a1 = instigator, a2 = disturbed party (matches description order).
    const stateByRole: Record<string, [string, string]> = {
      noise_complaint: ['sheltered', 'sleeping'],   // one being noisy, the other trying to sleep
      food_jealousy:   ['eating', 'sheltered'],     // one eating, one watching
      space_sharing:   ['sleeping', 'sheltered'],   // one resting, one wanting the spot
      sibling_squabble:['sheltered', 'sheltered'],  // both active
    };
    const [s1State, s2State] = stateByRole[conflict.type] ?? ['sheltered', 'sheltered'];

    const spriteW = 110, spriteH = 88;
    const spriteRowY = 225;
    if (animal1) {
      const sprite1 = createAnimalSprite(this, width / 2 - 80, spriteRowY, animal1, { width: spriteW, height: spriteH, stateOverride: s1State });
      this.gameContainer.add(sprite1);
    }
    if (animal2) {
      const sprite2 = createAnimalSprite(this, width / 2 + 80, spriteRowY, animal2, { width: spriteW, height: spriteH, stateOverride: s2State });
      this.gameContainer.add(sprite2);
    }

    // Prompt — below sprites
    this.gameContainer.add(
      this.add.text(width / 2, 305, 'How do you want to help?', {
        fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // Resolution buttons
    const actions = RESOLUTION_ACTIONS;
    const startY = 350;
    actions.forEach((action, i) => {
      const btn = createButton(this, width / 2, startY + i * 60,
        action.label, () => {
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
        effective ? 'Great job!' : 'That helped a little...', {
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

  // ── Level Progression ──────────────────────────────────────

  private checkLevelProgression(): void {
    // Use while loop so accepting multiple animals at once can trigger multiple level-ups
    while (true) {
      const required = getRequiredRescuesForLevel(this.level);
      if (this.totalRescued < required) break;
      this.level++;
      this.unlockedSpecies = getSpeciesUnlocksForLevel(this.level);
      const newSpecies = getSpeciesUnlocksForLevel(this.level).filter(
        (s) => !getSpeciesUnlocksForLevel(this.level - 1).includes(s),
      );
      this.showLevelUpCelebration(this.level, newSpecies);
    }
  }

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
    const title = this.add.text(width / 2, height / 2 - 60, 'Level Up!', {
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
        (s) => `${s.charAt(0).toUpperCase() + s.slice(1)} unlocked!`,
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

    // Animated sparkles — golden circles
    const sparkleColours = [0xffd700, 0xffec8b, 0xffa500, 0xfffacd];
    const sparkles: Phaser.GameObjects.Arc[] = [];
    for (let i = 0; i < 12; i++) {
      const sx = Phaser.Math.Between(40, width - 40);
      const sy = Phaser.Math.Between(40, height - 40);
      const r = Phaser.Math.Between(4, 10);
      const sparkle = this.add.circle(sx, sy, r,
        sparkleColours[Phaser.Math.Between(0, sparkleColours.length - 1)]
      ).setAlpha(0);
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

  shutdown(): void {
    this.needsTimer?.destroy();
    this.spawnTimer?.destroy();
    this.saveState();
  }
}
