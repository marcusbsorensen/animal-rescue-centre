import Phaser from 'phaser';
import type { Animal, Species, GameState, DepotState, Economy } from '@arc/shared-types';
import { COLOURS, FONTS, pluralSpecies, TEXT_RESOLUTION, COLLAR_COLOURS } from '../ui/constants';
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
  isSiblingPresent,
  pickConflictPair,
  hasAllyPresent,
  isBondComplete,
  canGoOnWalk,
  shouldGetSick,
  pickIllness,
  applySickness,
  getAvailableUpgrades,
  getUnlockedUpgrades,
  shouldSpawnConflict,
  generateConflict,
  isResolutionEffective,
  resolveConflict,
  RESOLUTION_ACTIONS,
  getMaxShelterAnimals,
  getMaxArrivals,
  placeDecoration,
  removeDecoration,
  getRoomDecorations,
  getAvailableDecorationCounts,
} from '@arc/game-logic';
import type { IllnessDef, Conflict, ResolutionDef } from '@arc/game-logic';
import { evaluateBadges, BADGE_DEFINITIONS } from '@arc/badges';
import { showToast } from '../ui/ErrorOverlay';
import { buildDecoratePanel, getDecorationEmoji, getDecorationLabel } from '../ui/DecoratePanel';
import { GameStateStore, loadGameState, saveGameState } from '../game-state';
import {
  renderGarden,
  renderKitchen,
  showBadgeNotification,
  showLevelUpCelebration,
  renderConflictPopup,
  renderConflictResult,
  renderCollarPicker,
  renderPetCreated,
  renderAnimalDetails,
  renderHUD,
  renderNavBar,
  renderGamesPopup,
  showQuickToast,
} from '../game-views';

type ViewMode = 'corridor' | 'room' | 'kitchen' | 'garden';

export class GameScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;

  /**
   * All persistent game state lives in a separate store object. The
   * store is also placed in `this.registry` so that if Phaser restarts
   * this scene (resize handler, hot-reload), `create()` can pick up
   * the same store and no in-memory state is lost.
   *
   * Every closure that assigns back to state after a scene return
   * (WalkScene.onComplete etc) captures `this.store` rather than the
   * scene instance, which keeps those assignments correct even across
   * scene restarts.
   */
  private store!: GameStateStore;

  private decorateMode = false;
  private decoratePanelDispose?: () => void;

  private viewMode: ViewMode = 'corridor';
  private currentRoomSpecies?: Species;
  private gameContainer!: Phaser.GameObjects.Container;
  private navContainer!: Phaser.GameObjects.Container;
  private uiContainer!: Phaser.GameObjects.Container;
  // Persistent layer for cross-fading sprites during state transitions.
  // NOT cleared by gameContainer.removeAll() so ghost sprites can outlive
  // a re-render while fading out.
  private transitionLayer!: Phaser.GameObjects.Container;
  // Last rendered visual state per animal id, used to detect transitions.
  // Absent entry → first render, no cross-fade.
  private lastVisualStates = new Map<string, string>();
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

    // Reuse the store across scene restarts (resize handler calls
    // scene.restart). Only build a fresh one on first boot.
    const existingStore = this.registry.get('gameStore') as GameStateStore | undefined;
    this.store = existingStore ?? new GameStateStore();
    this.registry.set('gameStore', this.store);

    this.gameContainer = this.add.container(0, 0);
    this.transitionLayer = this.add.container(0, 0).setDepth(500);
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

    // Load saved state (only on fresh boot — on a restart the store
    // already has everything). Skipping re-load avoids a brief flicker
    // where the resized scene shows defaults before Supabase returns.
    if (!existingStore) {
      await loadGameState(this, this.store);
    }

    // Check if returning from a minigame with updated animals
    const updatedAnimals = this.registry.get('updatedAnimals') as Animal[] | undefined;
    if (updatedAnimals) {
      this.store.animals = updatedAnimals;
      this.registry.remove('updatedAnimals');

      // Check for vet results (clear sickness if healed)
      const vetResult = this.registry.get('vetResult') as { healed: boolean; animalId?: string } | undefined;
      if (vetResult?.healed && vetResult.animalId) {
        this.store.sickAnimals.delete(vetResult.animalId);
      }
      this.registry.remove('vetResult');
      this.registry.remove('walkResult');
      this.registry.remove('groomResult');

      this.saveState();
    }

    // Check if returning from depot/supply with updated economy
    const updatedEconomy = this.registry.get('updatedEconomy') as Economy | undefined;
    if (updatedEconomy) {
      this.store.economy = updatedEconomy;
      this.registry.remove('updatedEconomy');
      this.saveState();
    }
    const updatedDepot = this.registry.get('updatedDepot') as DepotState | undefined;
    if (updatedDepot) {
      this.store.depot = updatedDepot;
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
    if (this.store.animals.length === 0) {
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

  /** Thin wrapper so existing call sites keep working — forwards to the
   *  extracted saveGameState in ../game-state. Kept until subsequent
   *  refactor phases migrate callers to import the module function. */
  private async saveState(): Promise<void> {
    return saveGameState(this, this.store);
  }

  // ── Animal Spawning ─────────────────────────────────────────

  private spawnNewAnimal(): void {
    // Level-based population cap — don't overcrowd the centre
    const sheltered = this.store.animals.filter((a) => a.state === 'sheltered' || a.state === 'bonding').length;
    const maxShelter = getMaxShelterAnimals(this.store.level);
    if (sheltered >= maxShelter) return;

    // Level-based arrival queue cap
    const arriving = this.store.animals.filter((a) => a.state === 'arriving');
    const maxArrivals = getMaxArrivals(this.store.level);
    if (arriving.length >= maxArrivals) return;

    // Pick a species not already in the arrival queue (variety for the player)
    const arrivingSpecies = new Set(arriving.map((a) => a.species));
    const availableSpecies = this.store.unlockedSpecies.filter((s) => !arrivingSpecies.has(s));
    if (availableSpecies.length === 0) return;

    const species = pickRandomSpecies(availableSpecies);

    if (shouldSpawnSiblings() && sheltered + 2 <= maxShelter) {
      const [a, b] = spawnSiblingPair(species);
      this.store.animals.push(a, b);
    } else {
      const animal = spawnAnimal(species, undefined, this.store.animals.map(a => a.name));
      this.store.animals.push(animal);
    }

    this.saveState();
    if (this.viewMode === 'corridor') this.renderView();
    this.renderHUD();
  }

  // ── Needs System ────────────────────────────────────────────

  private tickAllNeeds(): void {
    this.store.animals = this.store.animals.map((a) => tickNeeds(a));

    // Check for sickness on each tick
    for (const animal of this.store.animals) {
      if (!this.store.sickAnimals.has(animal.id) && shouldGetSick(animal)) {
        const illness = pickIllness(animal.species);
        const idx = this.store.animals.findIndex((a) => a.id === animal.id);
        if (idx >= 0) {
          this.store.animals[idx] = applySickness(this.store.animals[idx], illness);
          this.store.sickAnimals.set(animal.id, illness);
        }
      }
    }

    // Check for conflicts (only when no active conflict and viewing corridor/room).
    // A 90-second cooldown after the last conflict keeps the shelter from
    // feeling like constant triage — kids resolve one, then get a real
    // stretch of calm play before another one can appear.
    const CONFLICT_COOLDOWN_MS = 90_000;
    const cooledDown = Date.now() - this.store.lastConflictAt > CONFLICT_COOLDOWN_MS;
    if (!this.store.activeConflict && this.viewMode !== 'garden' && cooledDown) {
      const shelteredAnimals = this.store.animals.filter((a) => a.state === 'sheltered' || a.state === 'bonding');
      if (shelteredAnimals.length >= 2 && shouldSpawnConflict(shelteredAnimals)) {
        // Relationship-aware pair selection: enemies weighted 5x,
        // intolerant 2x, siblings 1.5x, friends filtered out,
        // unrelated pairs 1x. Falls back to random when the result
        // set is empty (everyone in the room is friends — calm).
        const pair = pickConflictPair(shelteredAnimals, this.store.relationships);
        if (pair) {
          this.store.activeConflict = generateConflict(pair[0], pair[1]);
          this.store.lastConflictAt = Date.now();
          this.showConflictPopup(this.store.activeConflict);
        }
      }
    }

    // Refresh if viewing a room
    if (this.viewMode === 'room' && this.selectedAnimal) {
      const updated = this.store.animals.find((a) => a.id === this.selectedAnimal!.id);
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

  /** Thin wrapper — delegates to HUDView.renderHUD. */
  private renderHUD(): void {
    renderHUD(this, this.store, this.uiContainer, {
      onLevelOrbTap: () => {
        this.saveState();
        this.scene.start('AccountScene', {
          level: this.store.level,
          totalRescued: this.store.totalRescued,
          totalBonded: this.store.totalBonded,
          earnedBadges: this.store.earnedBadges,
          animals: this.store.animals,
          economy: this.store.economy,
        });
      },
      onArrivalAlertTap: () => {
        this.viewMode = 'corridor';
        this.renderView();
      },
      onCareAlertTap: () => {
        this.viewMode = 'corridor';
        this.renderView();
      },
      onAudioToggle: () => {
        AudioManager.getInstance().toggleMusic();
        this.renderHUD();
      },
    });
  }

  // ── Bottom Navigation Bar + helpers (thin wrappers) ─────────

  /** Thin wrapper — delegates to NavBarView.renderNavBar. */
  private renderNavBar(options?: { showBack?: boolean }): void {
    renderNavBar(this, this.navContainer,
      { showBack: options?.showBack, activeMode: this.viewMode },
      {
        onBack: () => { this.viewMode = 'corridor'; this.renderView(); },
        onHome: () => { this.viewMode = 'corridor'; this.renderView(); },
        onCare: () => { this.viewMode = 'kitchen'; this.renderView(); },
        onWalk: () => this.handleWalkTap(),
        onSocial: () => { this.saveState(); this.scene.start('SocialScene'); },
        onFab: () => this.showGamesPopup(),
      },
    );
  }

  /** Walk-tab guard: empty shelter-animal list → friendly toast. */
  private handleWalkTap(): void {
    const walkable = this.store.animals.filter(
      (a) => (a.state === 'sheltered' || a.state === 'bonding') && canGoOnWalk(a),
    );
    if (walkable.length === 0) {
      showQuickToast(this, 'No pets are ready for a walk right now. Build a bond first!');
      return;
    }
    this.saveState();
    this.scene.start('WalkScene', {
      animals: this.store.animals,
      level: this.store.level,
      economy: this.store.economy,
    });
  }

  /** Thin wrapper — delegates to NavBarView.renderGamesPopup. */
  private showGamesPopup(): void {
    renderGamesPopup(this, this.gameContainer, {
      onDepot: () => {
        this.saveState();
        this.scene.start('DepotScene', {
          level: this.store.level,
          depot: this.store.depot,
          economy: this.store.economy,
        });
      },
      onSupplyRun: () => {
        this.saveState();
        this.scene.start('SupplyRunScene', {
          level: this.store.level,
          economy: this.store.economy,
        });
      },
      onDismiss: () => this.renderView(),
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

    // The painted corridor is now a flat view: 7 same-sized doors across
    // the back wall. We place signs starting from the MIDDLE of the
    // corridor and radiate outward as more species unlock — so at L1
    // (cat + dog only) the two signs sit side-by-side near the centre,
    // and the outer doors fill in as kids level up. No perspective
    // scaling needed; all doors are equal.
    // Unlock order: cat=0, dog=1, fox=2, bunny=3, bat=4, parrot=5, snake=6.
    const DOOR_SLOTS: { xFrac: number; yFrac: number; scale: number }[] = [
      { xFrac: 0.40, yFrac: 0.38, scale: 1.00 }, // 0 cat   — left-of-centre
      { xFrac: 0.60, yFrac: 0.38, scale: 1.00 }, // 1 dog   — right-of-centre
      { xFrac: 0.27, yFrac: 0.38, scale: 1.00 }, // 2 fox
      { xFrac: 0.73, yFrac: 0.38, scale: 1.00 }, // 3 bunny
      { xFrac: 0.14, yFrac: 0.38, scale: 1.00 }, // 4 bat   — far left
      { xFrac: 0.86, yFrac: 0.38, scale: 1.00 }, // 5 parrot — far right
      { xFrac: 0.50, yFrac: 0.38, scale: 1.00 }, // 6 snake — dead centre (fills last)
    ];
    const doorBodyH = height - 40;
    const doorBodyTop = 20;

    // If the anchor editor has placed sign decor for the corridor, prefer
    // those hand-tuned positions over the hardcoded DOOR_SLOTS. This lets
    // signs be repositioned per background art without redeploying code.
    const corridorDecor = RoomAnchors.getInstance().getDecor('corridor');

    this.store.unlockedSpecies.forEach((species, i) => {
      const fallbackSlot = DOOR_SLOTS[i] ?? DOOR_SLOTS[DOOR_SLOTS.length - 1];
      const placedAnchors = corridorDecor[`sign-${species}`] ?? [];
      const placed = placedAnchors[0];
      const x = placed ? width * placed.x : width * fallbackSlot.xFrac;
      const y = placed ? doorBodyTop + doorBodyH * placed.y : doorBodyTop + doorBodyH * fallbackSlot.yFrac;
      const s = placed ? placed.scale : fallbackSlot.scale;

      const roomAnimals = this.store.animals.filter((a) => a.species === species && a.state !== 'arriving');
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

      // Chalkboard hung on the door right under the sign, showing the current
      // number of inhabitants in chalk-writing. Feels like something a child
      // would have scribbled at the rescue centre rather than an app-style
      // notification badge. Painted signs only — the programmatic fallback
      // already renders the count inline.
      if (hasPainted && count > 0) {
        const boardW = Math.max(44, 58 * s);
        const boardH = Math.max(30, 38 * s);
        const boardX = x;
        const boardY = y + signDisplay.h / 2 + boardH / 2 + 6 * s;
        // Slight hand-hung tilt, seeded by species so it's stable across frames.
        const tiltSeed = species.charCodeAt(0) % 5;
        const tilt = Phaser.Math.DegToRad(-2 + tiltSeed);

        // Draw the board in local coords so rotation pivots on its centre.
        const innerPad = Math.max(3, 4 * s);
        const boardGfx = this.add.graphics();
        boardGfx.x = boardX;
        boardGfx.y = boardY;
        boardGfx.setRotation(tilt);
        // Soft drop shadow
        boardGfx.fillStyle(0x000000, 0.22);
        boardGfx.fillRoundedRect(-boardW / 2 + 2, -boardH / 2 + 3, boardW, boardH, 4);
        // Wooden frame
        boardGfx.fillStyle(0x6b4423, 1);
        boardGfx.fillRoundedRect(-boardW / 2, -boardH / 2, boardW, boardH, 4);
        // Slate surface
        boardGfx.fillStyle(0x1e3a2a, 1);
        boardGfx.fillRoundedRect(
          -boardW / 2 + innerPad, -boardH / 2 + innerPad,
          boardW - innerPad * 2, boardH - innerPad * 2, 2
        );
        // Chalk smudge highlight so the slate doesn't read as a flat block
        boardGfx.fillStyle(0xffffff, 0.05);
        boardGfx.fillEllipse(0, -boardH * 0.18, boardW * 0.6, boardH * 0.25);
        this.gameContainer.add(boardGfx);

        // Tiny hanging string from sign to chalkboard
        const stringGfx = this.add.graphics();
        stringGfx.lineStyle(1, 0x3a2a1a, 0.55);
        stringGfx.lineBetween(
          boardX - boardW * 0.25, y + signDisplay.h / 2 + 1,
          boardX - boardW * 0.25, boardY - boardH / 2
        );
        stringGfx.lineBetween(
          boardX + boardW * 0.25, y + signDisplay.h / 2 + 1,
          boardX + boardW * 0.25, boardY - boardH / 2
        );
        this.gameContainer.add(stringGfx);

        const chalkText = this.add.text(boardX, boardY + 2 * s, String(count), {
          fontSize: `${Math.round(boardH * 0.85)}px`,
          fontFamily: FONTS.chalk,
          fontStyle: 'bold',
          color: '#fffaf0',
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5).setRotation(tilt).setAlpha(0.95);
        this.gameContainer.add(chalkText);
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
    const arriving = this.store.animals.filter((a) => a.state === 'arriving');
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
        sprite.on('pointerdown', () => this.showAnimalDetails(animal, { x: ax, y: spriteCy, size: spriteW }));
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
          // Green because welcoming is a positive, safe action — the old
          // red read like a "delete" / warning, which scared kids off
          // tapping it. `icon-accept` is a simple tick, unambiguous.
          actionBgHex: '#3D8A2E',
          actionIcon: 'icon-accept',
          accentColour: SPECIES_COLOURS[animal.species],
          maxWidth: bubbleW,
          onAction: () => {
            if (this.processing) return;
            this.processing = true;
            animal.state = 'sheltered';
            this.store.totalRescued += 1;
            this.checkLevelProgression();
            AudioManager.getInstance().playSfx('animal_arrive');
            this.saveState();
            this.processing = false;
            this.renderView();
          },
        });
        this.gameContainer.add(bubble);
      });

      // "Welcome them all" shortcut if more than one — pinned ABOVE the
      // banner (the previous position below the banner sat right on top
      // of the speech bubbles and the sprite heads). Green to match the
      // per-animal Welcome buttons.
      if (arriving.length > 1) {
        this.gameContainer.add(
          createButton(this, width / 2, bannerY - 34, 'Welcome them all', () => {
            if (this.processing) return;
            this.processing = true;
            arriving.forEach((a) => { a.state = 'sheltered'; });
            this.store.totalRescued += arriving.length;
            this.checkLevelProgression();
            AudioManager.getInstance().playSfx('animal_arrive');
            this.saveState();
            this.processing = false;
            this.renderView();
          }, { width: 240, fontSize: '14px', icon: 'icon-accept', bgColour: '#3D8A2E' })
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
    const roomAnimals = this.store.animals.filter(
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

    // Render any decorations the player has placed in this room.
    // Drawn before animals so animals always sit in front of decor.
    this.renderRoomDecorations(width, height);

    // Floating "Decorate" button — only visible if the player has any
    // decorations in their depot inventory. Opens the DecoratePanel.
    const availableDecorCount = Object.values(
      getAvailableDecorationCounts(this.store.depot)
    ).reduce((sum, n) => sum + n, 0);
    if (availableDecorCount > 0 || this.store.placedDecorations.some((d) => d.roomId === `room-${species}`)) {
      this.renderDecorateButton(width);
    }

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

        // Cross-fade when this animal's visual state has changed since the
        // last render — a ghost of the old sprite fades out while the new
        // sprite fades in, so kids see the mood/need change rather than a
        // jarring hard swap.
        const prevVisualState = this.lastVisualStates.get(animal.id);
        const stateChanged = prevVisualState !== undefined && prevVisualState !== visualState;

        // Animal sprite (real art or fallback rectangle)
        const sprite = createAnimalSprite(this, x, y, animal, {
          width: size, height: size * 0.8, interactive: true,
        });
        if (placed?.flipX && 'setFlipX' in sprite) {
          (sprite as Phaser.GameObjects.Image).setFlipX(true);
        }

        if (stateChanged) {
          // Old-state ghost lives in the persistent transition layer so it
          // survives the next gameContainer.removeAll() cleanly.
          const ghost = createAnimalSprite(this, x, y, animal, {
            width: size, height: size * 0.8, stateOverride: prevVisualState,
          });
          if (placed?.flipX && 'setFlipX' in ghost) {
            (ghost as Phaser.GameObjects.Image).setFlipX(true);
          }
          this.transitionLayer.add(ghost);
          this.tweens.add({
            targets: ghost,
            alpha: 0,
            duration: 400,
            ease: 'Sine.easeOut',
            onComplete: () => ghost.destroy(),
          });
          // New sprite fades in on top
          sprite.setAlpha(0);
          this.tweens.add({
            targets: sprite,
            alpha: 1,
            duration: 400,
            ease: 'Sine.easeIn',
          });
        }
        this.lastVisualStates.set(animal.id, visualState);

        // Pet gold border (if sprite is a rectangle fallback)
        if (animal.state === 'pet' && sprite instanceof Phaser.GameObjects.Rectangle) {
          sprite.setStrokeStyle(3, 0xffd700, 0.8);
        }

        // ── Dirty overlay (mud spots + flies buzzing) ───────
        // When cleanliness drops below 60 the animal looks visibly grubby:
        // a few muddy smudges sit on the sprite and one or two flies buzz
        // in a lazy loop above it. Kids learn to read the visuals (mud =
        // needs a brush) rather than a tiny icon.
        const cleanliness = animal.cleanliness ?? 100;
        if (cleanliness < 60 && animal.state !== 'pet') {
          // Deterministic-ish spot placement seeded by id so mud doesn't
          // dance around every re-render.
          const seed = animal.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const rand = (n: number) => {
            const x = Math.sin(seed * 9999 + n) * 10000;
            return x - Math.floor(x); // 0..1
          };
          // More mud the dirtier they are (3 spots at 59, up to 6 at 0)
          const spotCount = 3 + Math.floor((60 - cleanliness) / 15);
          const halfW = size * 0.28;
          const halfH = size * 0.22;
          for (let si = 0; si < spotCount; si++) {
            const ox = (rand(si * 2) * 2 - 1) * halfW;
            const oy = (rand(si * 2 + 1) * 2 - 1) * halfH + size * 0.05;
            const r = 4 + rand(si * 3) * 4;
            const tone = rand(si * 5) > 0.5 ? 0x8b6f47 : 0x6b5a4a;
            const mud = this.add.ellipse(x + ox, y + oy, r * 2, r * 1.4, tone, 0.72);
            this.gameContainer.add(mud);
          }
          // Flies — one at 40-59 cleanliness, two below. They fly a tiny
          // figure-8 above the animal's head.
          const flyCount = cleanliness < 40 ? 2 : 1;
          for (let fi = 0; fi < flyCount; fi++) {
            const flyOriginX = x + (fi === 0 ? -size * 0.18 : size * 0.18);
            const flyOriginY = y - size * 0.48;
            const fly = this.add.text(flyOriginX, flyOriginY, '🐝', {
              fontSize: '12px', resolution: TEXT_RESOLUTION,
            }).setOrigin(0.5).setAlpha(0.85);
            this.gameContainer.add(fly);
            // Gentle orbit — looks like buzzing
            const phase = fi * Math.PI;
            const orbit = { t: phase };
            this.tweens.add({
              targets: orbit,
              t: phase + Math.PI * 2,
              duration: 1800 + fi * 300,
              repeat: -1,
              onUpdate: () => {
                fly.x = flyOriginX + Math.cos(orbit.t) * 12;
                fly.y = flyOriginY + Math.sin(orbit.t * 2) * 6;
              },
            });
          }
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

        // ── Status icon stack (right side of sprite) ─────────
        // We build a short list of status "chips" in priority order so kids
        // can read at a glance what the animal needs: sickness first (most
        // urgent, red heart), then unmet needs (hunger/tired/sad). Each chip
        // is a soft white disc with a painterly icon on top, gently pulsing
        // so it draws the eye without being alarming.
        type StatusChip = { iconKey: string; tint: number; emoji: string; pulse: boolean };
        const chips: StatusChip[] = [];
        const sickIllness = this.store.sickAnimals.get(animal.id);
        if (sickIllness) {
          chips.push({ iconKey: 'icon-heal', tint: 0xe74c3c, emoji: '🩹', pulse: true });
        }
        // Multiple unmet needs can show at once — the stack teaches body
        // language (hungry + tired = "she's had a rough day").
        if (animal.hunger >= 70) {
          chips.push({ iconKey: 'icon-feed', tint: 0xe67e22, emoji: '🍽️', pulse: !sickIllness });
        }
        if (animal.tiredness >= 70) {
          chips.push({ iconKey: 'icon-rest', tint: 0x3498db, emoji: '💤', pulse: false });
        }
        if (animal.happiness <= 30) {
          chips.push({ iconKey: 'icon-play', tint: 0xf1c40f, emoji: '🙁', pulse: false });
        }

        // Cap at 3 chips to keep the room uncluttered — if we ever exceed
        // three, the fourth is a silent "…more" dot that the popup surfaces.
        const visibleChips = chips.slice(0, 3);
        visibleChips.forEach((chip, ci) => {
          const chipX = x + size / 2 - 4;
          const chipY = y - size * 0.4 - 4 + ci * 28;
          const chipR = 14;
          // Soft shadow + white disc backing
          const bg = this.add.graphics();
          bg.fillStyle(0x000000, 0.18);
          bg.fillCircle(chipX + 1, chipY + 2, chipR);
          bg.fillStyle(0xfffaf0, 1);
          bg.fillCircle(chipX, chipY, chipR);
          bg.lineStyle(2, chip.tint, 0.9);
          bg.strokeCircle(chipX, chipY, chipR);
          this.gameContainer.add(bg);
          // Icon (painterly) or emoji fallback
          if (this.textures.exists(chip.iconKey)) {
            const ic = this.add.image(chipX, chipY, chip.iconKey)
              .setDisplaySize(20, 20).setOrigin(0.5);
            this.textures.get(chip.iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
            this.gameContainer.add(ic);
          } else {
            const em = this.add.text(chipX, chipY, chip.emoji, {
              fontSize: '16px', resolution: TEXT_RESOLUTION,
            }).setOrigin(0.5);
            this.gameContainer.add(em);
          }
          // Gentle pulse for the top chip only — draws the eye without a
          // wall of wobbling icons. Sickness always pulses because it's
          // the most urgent.
          if (chip.pulse) {
            const p = { s: 1 };
            this.tweens.add({
              targets: p,
              s: 1.2,
              duration: 650,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
              onUpdate: () => {
                bg.setScale(p.s, p.s);
                bg.x = chipX * (1 - p.s);
                bg.y = chipY * (1 - p.s);
              },
            });
          }
        });

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

        sprite.on('pointerdown', () => this.showAnimalDetails(animal, { x, y, size }));
        this.gameContainer.add(sprite);
      });
    }

    // Bottom navigation bar with back button
    this.renderNavBar({ showBack: true });
  }

  // ── Animal Details Popup ────────────────────────────────────

  /**
   * Show the animal details as a speech-bubble style modal anchored near
   * the tapped sprite. We deliberately avoid redrawing the animal inside
   * the panel — the player can still see the animal on the room floor,
   * with the panel "speaking" from it via a little tail. A light overlay
   * dims the rest of the scene without fully hiding the animal.
   *
   * The `anchor` argument is the tapped sprite's world position + size.
   * It's optional so legacy callers keep working (they get a centered
   * card as before).
   */
  /**
   * Thin wrapper — delegates rendering to AnimalDetailsPopup. All
   * action handlers live here so state mutation and scene transitions
   * remain the scene's responsibility; the view is purely rendering.
   */
  private showAnimalDetails(
    animal: Animal,
    anchor?: { x: number; y: number; size: number },
  ): void {
    this.selectedAnimal = animal;

    const doFeed = () => {
      if (this.processing) return;
      this.processing = true;
      const idx = this.store.animals.findIndex((a) => a.id === animal.id);
      if (idx >= 0) {
        this.store.animals[idx] = applyFeeding(this.store.animals[idx]);
        const sibPresent = isSiblingPresent(this.store.animals[idx], this.store.animals)
          || hasAllyPresent(this.store.relationships, this.store.animals[idx], this.store.animals, 'friend');
        const bondGain = calculateBondIncrease(this.store.animals[idx], 'feed', sibPresent);
        this.store.animals[idx].bondLevel = Math.min(100, this.store.animals[idx].bondLevel + bondGain);
        AudioManager.getInstance().playSfx('animal_fed');
        if (sibPresent) showToast(this, '💫 Sibling nearby — extra bond!');
        this.checkBondComplete(this.store.animals[idx]);
      }
      this.closePopup();
      this.renderView();
      this.processing = false;
    };

    const doPlay = () => {
      if (this.processing) return;
      this.processing = true;
      const idx = this.store.animals.findIndex((a) => a.id === animal.id);
      if (idx >= 0) {
        this.store.animals[idx] = applyPlay(this.store.animals[idx]);
        const sibPresent = isSiblingPresent(this.store.animals[idx], this.store.animals)
          || hasAllyPresent(this.store.relationships, this.store.animals[idx], this.store.animals, 'friend');
        const bondGain = calculateBondIncrease(this.store.animals[idx], 'play', sibPresent);
        this.store.animals[idx].bondLevel = Math.min(100, this.store.animals[idx].bondLevel + bondGain);
        AudioManager.getInstance().playSfx('animal_happy');
        if (sibPresent) showToast(this, '💫 Sibling nearby — extra bond!');
        this.checkBondComplete(this.store.animals[idx]);
      }
      this.closePopup();
      this.renderView();
      this.processing = false;
    };

    const doWalk = () => {
      this.closePopup();
      this.saveState();
      this.scene.start('WalkScene', {
        animal,
        allAnimals: this.store.animals,
        onComplete: (updatedAnimals: Animal[], _walkResult: { perfectWalk: boolean }) => {
          this.store.animals = updatedAnimals;
          this.checkBadges();
          this.saveState();
        },
      });
    };

    const doGroom = () => {
      this.closePopup();
      this.saveState();
      this.scene.start('GroomingScene', {
        animal,
        allAnimals: this.store.animals,
        onComplete: (updatedAnimals: Animal[]) => {
          this.store.animals = updatedAnimals;
          this.saveState();
        },
      });
    };

    // Vet flow — shared between shelter-animal "Heal" and pet "Take to Vet".
    // The processing guard + liveness checks are the same; only the button
    // label differs upstream in the popup.
    const doVetVisit = () => {
      if (this.processing) return;
      this.processing = true;
      const currentIllness = this.store.sickAnimals.get(animal.id);
      if (!currentIllness) {
        this.processing = false; this.closePopup(); this.renderView();
        return;
      }
      const liveAnimal = this.store.animals.find((a) => a.id === animal.id);
      if (!liveAnimal) {
        this.processing = false; this.closePopup(); this.renderView();
        return;
      }
      this.closePopup();
      this.saveState();
      this.scene.start('VetScene', {
        animal: liveAnimal,
        illness: currentIllness,
        allAnimals: this.store.animals,
        onComplete: (updatedAnimals: Animal[], healed: boolean) => {
          this.store.animals = updatedAnimals;
          if (healed) this.store.sickAnimals.delete(animal.id);
          this.checkBadges();
          this.saveState();
        },
      });
      this.processing = false;
    };

    renderAnimalDetails(this, this.store, this.gameContainer, animal, anchor, {
      onClose: () => this.closePopup(),
      onFeed: doFeed,
      onPlay: doPlay,
      onWalk: doWalk,
      onGroom: doGroom,
      onHeal: doVetVisit,
      onTakeToVet: doVetVisit,
      onVisitGarden: () => {
        this.closePopup();
        this.viewMode = 'garden';
        this.renderView();
      },
    });
  }


  private closePopup(): void {
    this.selectedAnimal = undefined;
    this.renderView();
  }

  // ── Room Decorations ────────────────────────────────────────

  /** Render any decorations the player has placed in the current room. */
  private renderRoomDecorations(width: number, height: number): void {
    const species = this.currentRoomSpecies;
    if (!species) return;
    const roomId = `room-${species}`;
    const inRoom = getRoomDecorations(this.store.placedDecorations, roomId);
    if (inRoom.length === 0) return;

    // Room background area is roughly the top of the screen to the
    // nav bar. Decorations are positioned via fractional coords within
    // this box.
    const roomBounds = { x: 0, y: 20, width, height: height - 40 };

    for (const deco of inRoom) {
      const px = roomBounds.x + deco.x * roomBounds.width;
      const py = roomBounds.y + deco.y * roomBounds.height;
      const emojiText = this.add
        .text(px, py, getDecorationEmoji(deco.code), { fontSize: '32px' })
        .setOrigin(0.5)
        .setResolution(TEXT_RESOLUTION);
      // Ensure they sit below animals but above the background.
      emojiText.setDepth(5);
      this.gameContainer.add(emojiText);
    }
  }

  /** Floating "🎀 Decorate" button in the top-right of the room. */
  private renderDecorateButton(width: number): void {
    const btnBg = this.add
      .rectangle(width - 70, 55, 120, 40, 0xffffff, 0.96)
      .setStrokeStyle(2, 0xd4783c)
      .setInteractive({ useHandCursor: true });
    const btnText = this.add
      .text(width - 70, 55, '🎀 Decorate', {
        fontSize: '14px',
        fontFamily: FONTS.title,
        color: COLOURS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(TEXT_RESOLUTION);
    btnBg.on('pointerdown', () => this.enterDecorateMode());
    this.gameContainer.add([btnBg, btnText]);
  }

  /** Open the decorate panel. */
  private enterDecorateMode(): void {
    if (this.decorateMode || !this.currentRoomSpecies) return;
    this.decorateMode = true;

    const species = this.currentRoomSpecies;
    const { width, height } = this.scale;
    const roomId = `room-${species}`;
    const roomBounds = { x: 0, y: 20, width, height: height - 40 };

    const { dispose } = buildDecoratePanel(this, {
      depot: this.store.depot,
      placedInRoom: getRoomDecorations(this.store.placedDecorations, roomId),
      roomBounds,
      callbacks: {
        onPlace: (code, x, y) => this.handlePlaceDecoration(code, roomId, x, y),
        onRemove: (id) => this.handleRemoveDecoration(id),
        onExit: () => this.exitDecorateMode(),
      },
    });
    this.decoratePanelDispose = dispose;
  }

  private exitDecorateMode(): void {
    this.decorateMode = false;
    if (this.decoratePanelDispose) {
      this.decoratePanelDispose();
      this.decoratePanelDispose = undefined;
    }
    this.saveState();
    this.renderView();
  }

  private handlePlaceDecoration(code: string, roomId: string, x: number, y: number): void {
    const result = placeDecoration(this.store.placedDecorations, this.store.depot, code, roomId, x, y);
    if (!result) {
      showToast(this, "Out of stock for that decoration — earn more at the depot.");
      return;
    }
    this.store.placedDecorations = result.placed;
    this.store.depot = result.depot;
    // Re-render the whole room + panel so the new item shows and the
    // palette count updates.
    this.refreshDecoratePanel();
  }

  private handleRemoveDecoration(id: string): void {
    const result = removeDecoration(this.store.placedDecorations, this.store.depot, id);
    if (!result) return;
    this.store.placedDecorations = result.placed;
    this.store.depot = result.depot;
    const label = getDecorationLabel(this.store.placedDecorations.find((d) => d.id === id)?.code ?? '');
    if (label) showToast(this, `${label} returned to inventory`);
    this.refreshDecoratePanel();
  }

  /** Re-open the panel after a state change so counts and placed items
   *  stay in sync. Cheap — we rebuild the small UI, not the whole scene. */
  private refreshDecoratePanel(): void {
    if (!this.decorateMode || !this.currentRoomSpecies) return;
    if (this.decoratePanelDispose) {
      this.decoratePanelDispose();
      this.decoratePanelDispose = undefined;
    }
    // Redraw the background room decorations (cheap full view refresh).
    this.renderView();
    // Re-enter decorate mode without toggling the flag off.
    this.decorateMode = false;
    this.enterDecorateMode();
  }

  // ── Kitchen View ────────────────────────────────────────────

  /** Thin wrapper — delegates to the extracted KitchenView module. */
  private renderKitchen(): void {
    renderKitchen(this, this.store, this.gameContainer, {
      launchMinigame: (hungry) => {
        this.scene.start('KitchenMinigameScene', {
          hungryAnimals: hungry,
          allAnimals: this.store.animals,
          onComplete: (updatedAnimals: Animal[]) => {
            this.store.animals = updatedAnimals;
            this.saveState();
          },
        });
      },
      onQuickFedAnimal: (animal) => this.checkBondComplete(animal),
      goToGarden: () => {
        this.viewMode = 'garden';
        this.renderView();
      },
      rerender: () => this.renderView(),
      save: () => this.saveState(),
      renderNavBar: (opts) => this.renderNavBar(opts),
    });
  }

  // ── Garden View ─────────────────────────────────────────────

  /**
   * Thin wrapper — delegates to the extracted GardenView module
   * (apps/game/src/game-views/GardenView.ts). Kept as a private method
   * for now so the existing `renderView()` dispatcher doesn't need to
   * change shape. Subsequent phases do the same for the other views.
   */
  private renderGarden(): void {
    renderGarden(this, this.store, this.gameContainer, {
      deriveAnchorState: (animal) => this.deriveAnchorState(animal),
      resolveAnchor: (anchor, bgTopY, bgW, bgH, baseW, baseH) =>
        this.resolveAnchor(anchor, bgTopY, bgW, bgH, baseW, baseH),
      showAnimalDetails: (pet, pos) => this.showAnimalDetails(pet, pos),
      onUpgradeClaimed: (code) => {
        this.store.houseUpgrades.push(code);
        this.checkBadges();
        this.saveState();
        this.renderView();
      },
      renderNavBar: (opts) => this.renderNavBar(opts),
    });
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
  /** Thin wrapper — delegates to CollarPickerView.renderCollarPicker. */
  private showCollarPicker(animal: Animal): void {
    this.clearView();
    renderCollarPicker(this, this.gameContainer, animal, {
      onCollarChosen: (hex) => this.completeBonding(animal, hex),
    });
  }

  /** Complete the bonding process — animal becomes a pet. Mutations live
   *  here; the celebration is rendered by CollarPickerView.renderPetCreated. */
  private completeBonding(animal: Animal, collarColour: string): void {
    this.showingCollarPicker = false;
    const idx = this.store.animals.findIndex((a) => a.id === animal.id);
    if (idx >= 0) {
      if (this.store.animals[idx].state === 'pet') return; // race guard
      this.store.animals[idx].state = 'pet';
      this.store.animals[idx].collarColour = collarColour;
      this.store.totalBonded++;
    }

    AudioManager.getInstance().playSfx('bond_complete');

    this.checkBadges();
    this.saveState();

    this.clearView();
    renderPetCreated(this, this.gameContainer, animal, {
      onVisitGarden: () => {
        this.viewMode = 'garden';
        this.renderView();
      },
    });
  }

  // ── Badge Evaluation ───────────────────────────────────────

  private checkBadges(): void {
    const pets = this.store.animals.filter((a) => a.state === 'pet');
    const siblingPairs = this.store.animals.filter(
      (a) => a.siblingId && a.state !== 'arriving'
    ).length / 2;

    const stats = {
      userId: '',
      catsRescued: this.store.animals.filter((a) => a.species === 'cat').length,
      dogsRescued: this.store.animals.filter((a) => a.species === 'dog').length,
      bunniesRescued: this.store.animals.filter((a) => a.species === 'bunny').length,
      foxesRescued: this.store.animals.filter((a) => a.species === 'fox').length,
      snakesRescued: this.store.animals.filter((a) => a.species === 'snake').length,
      parrotsRescued: this.store.animals.filter((a) => a.species === 'parrot').length,
      batsRescued: this.store.animals.filter((a) => a.species === 'bat').length,
      totalRescued: this.store.totalRescued,
      badgesUnlockedCount: this.store.earnedBadges.length,
      giftsSentCount: 0,
      giftsReceivedCount: 0,
      extras: {
        totalBonded: this.store.totalBonded,
        siblingPairsReunited: Math.floor(siblingPairs),
        selfHealed: 0,
        walksWithoutIncident: 0,
        animalsTrained: 0,
        conflictsResolved: this.store.conflictsResolved,
        houseUpgrades: 0,
        totalPets: pets.length,
        consecutiveDays: 1,
        totalDaysPlayed: 1,
        playerNumber: 999, // placeholder
        level: this.store.level,
      },
    };

    const newBadges = evaluateBadges(stats, stats.extras, this.store.earnedBadges);
    if (newBadges.length > 0) {
      this.store.earnedBadges.push(...newBadges);
      // Show badge notification for first new badge
      this.showBadgeNotification(newBadges[0]);
    }
  }

  /** Thin wrapper — delegates to the extracted CelebrationViews module. */
  private showBadgeNotification(badgeCode: string): void {
    showBadgeNotification(this, badgeCode);
  }

  // ── Conflict System ─────────────────────────────────────────

  /** Thin wrapper — delegates to ConflictView.renderConflictPopup.
   *  Keeps the `clearView()` + container-reuse ceremony here since that's
   *  a scene concern; the view just renders into the provided container. */
  private showConflictPopup(conflict: Conflict): void {
    this.clearView();
    renderConflictPopup(this, this.store, this.gameContainer, conflict, {
      onResolve: (action) => this.resolveActiveConflict(action),
    });
  }

  /**
   * State mutation + result-screen rendering for a conflict resolution.
   * Mutations stay here (scene owns state via store); the calm-after
   * render delegates to ConflictView.renderConflictResult.
   */
  private resolveActiveConflict(actionDef: ResolutionDef): void {
    if (!this.store.activeConflict) return;

    const result = resolveConflict(this.store.activeConflict.type, actionDef.action);

    // Apply happiness boost to both conflict animals
    for (const animalId of [this.store.activeConflict.animal1Id, this.store.activeConflict.animal2Id]) {
      const idx = this.store.animals.findIndex((a) => a.id === animalId);
      if (idx >= 0) {
        this.store.animals[idx] = {
          ...this.store.animals[idx],
          happiness: Math.min(100, this.store.animals[idx].happiness + result.happinessBoost),
        };
      }
    }

    const effective = result.effective;
    if (effective) {
      this.store.conflictsResolved++;
      AudioManager.getInstance().playSfx('heal_complete');
    } else {
      AudioManager.getInstance().playSfx('food_wrong');
    }
    this.store.activeConflict = undefined;
    // Restart the cooldown from the moment of resolution so another
    // conflict can't immediately jump in.
    this.store.lastConflictAt = Date.now();

    this.clearView();
    renderConflictResult(this, this.gameContainer, effective, {
      onBack: () => {
        this.viewMode = 'corridor';
        this.renderView();
      },
    });

    this.checkBadges();
  }

  // ── Level Progression ──────────────────────────────────────

  private checkLevelProgression(): void {
    // Use while loop so accepting multiple animals at once can trigger multiple level-ups
    while (true) {
      const required = getRequiredRescuesForLevel(this.store.level);
      if (this.store.totalRescued < required) break;
      this.store.level++;
      this.store.unlockedSpecies = getSpeciesUnlocksForLevel(this.store.level);
      const newSpecies = getSpeciesUnlocksForLevel(this.store.level).filter(
        (s) => !getSpeciesUnlocksForLevel(this.store.level - 1).includes(s),
      );
      this.showLevelUpCelebration(this.store.level, newSpecies);
    }
  }

  /** Thin wrapper — delegates to the extracted CelebrationViews module. */
  private showLevelUpCelebration(newLevel: number, unlockedSpecies: Species[]): void {
    showLevelUpCelebration(this, newLevel, unlockedSpecies);
  }

  // ── Helpers ─────────────────────────────────────────────────

  shutdown(): void {
    this.needsTimer?.destroy();
    this.spawnTimer?.destroy();
    this.saveState();
  }
}
