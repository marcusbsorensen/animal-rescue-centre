import Phaser from 'phaser';
import type { Animal, Species, DepotState, Economy } from '@arc/shared-types';
import { COLOURS, FONTS, TEXT_RESOLUTION } from '../ui/constants';
import { type Anchor } from '../lib/RoomAnchors';
import { AudioManager } from '../audio/AudioManager';
import { AssetLoader } from '../lib/AssetLoader';
import {
  spawnAnimal,
  spawnSiblingPair,
  pickRandomSpecies,
  shouldSpawnSiblings,
  getSpeciesUnlocksForLevel,
  getRequiredRescuesForLevel,
  tickNeeds,
  applyFeeding,
  calculateBondIncrease,
  isSiblingPresent,
  pickConflictPair,
  hasAllyPresent,
  isBondComplete,
  canGoOnWalk,
  shouldGetSick,
  pickIllness,
  applySickness,
  shouldSpawnConflict,
  generateConflict,
  resolveConflict,
  getMaxShelterAnimals,
  getMaxArrivals,
  placeDecoration,
  removeDecoration,
  getRoomDecorations,
  letOutside,
  bringInside,
  markWet,
  isRainy,
  getSpeciesRainTolerance,
  recordCareTask,
} from '@arc/game-logic';
import type { Conflict, ResolutionDef } from '@arc/game-logic';
import { mountInGame, unmountInGame } from '../game-overlay/InGameOverlay';
import { evaluateBadges } from '@arc/badges';
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
  renderWardrobePicker,
  renderHUD,
  renderNavBar,
  renderGamesPopup,
  showQuickToast,
  renderCorridor,
  renderRoom,
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

    // Re-ensure the essential tier in case the player tapped the
    // LoadingScene's "Play now" escape hatch with essentials still
    // loading — this picks up any stragglers. Idempotent.
    // Then kick off the variant-sprite tier silently behind the game.
    const loader = AssetLoader.getInstance();
    loader.clearCallbacks();  // no UI to notify now
    loader.startBackgroundLoad(this);
    loader.startVariantLoad(this);
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

  /** Thin wrapper — delegates to CorridorView.renderCorridor. */
  private renderCorridor(): void {
    renderCorridor(this, this.store, this.gameContainer, {
      onEnterRoom: (species) => {
        this.currentRoomSpecies = species;
        this.viewMode = 'room';
        this.renderView();
      },
      onShowAnimalDetails: (animal, anchor) => this.showAnimalDetails(animal, anchor),
      onWelcomeOne: (animal) => {
        animal.state = 'sheltered';
        this.store.totalRescued += 1;
        this.checkLevelProgression();
        AudioManager.getInstance().playSfx('animal_arrive');
        this.saveState();
        this.renderView();
      },
      onWelcomeAll: (arriving) => {
        arriving.forEach((a) => { a.state = 'sheltered'; });
        this.store.totalRescued += arriving.length;
        this.checkLevelProgression();
        AudioManager.getInstance().playSfx('animal_arrive');
        this.saveState();
        this.renderView();
      },
      renderNavBar: () => this.renderNavBar(),
      setMaxScrollY: (m) => { this.maxScrollY = m; },
    }, {
      isProcessing: () => this.processing,
      setProcessing: (v) => { this.processing = v; },
    });
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

  /** Thin wrapper — delegates to RoomView.renderRoom. */
  private renderRoom(): void {
    renderRoom(this, this.store, this.gameContainer, {
      species: this.currentRoomSpecies!,
      lastVisualStates: this.lastVisualStates,
      transitionLayer: this.transitionLayer,
    }, {
      deriveAnchorState: (animal) => this.deriveAnchorState(animal),
      resolveAnchor: (anchor, bgTopY, bgW, bgH, baseW, baseH) =>
        this.resolveAnchor(anchor, bgTopY, bgW, bgH, baseW, baseH),
      onShowAnimalDetails: (animal, anchor) => this.showAnimalDetails(animal, anchor),
      onEnterDecorateMode: () => this.enterDecorateMode(),
      renderNavBar: (opts) => this.renderNavBar(opts),
    });
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
      this.closePopup();
      this.saveState();
      this.scene.start('PlayScene', {
        animal,
        allAnimals: this.store.animals,
        onComplete: (updatedAnimals: Animal[], _result: { perfect: boolean }) => {
          this.store.animals = updatedAnimals;
          this.checkBadges();
          this.saveState();
        },
      });
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

    // ── Garden actions ──────────────────────────────────────
    // Letting an animal outside applies the letOutside mutation
    // (happiness bonus + gardenZone auto-pick), records a care-task
    // tick so the clock advances, and bounces the view into the garden
    // so the player sees where the animal landed.
    const doLetOutside = () => {
      if (this.processing) return;
      this.processing = true;
      const idx = this.store.animals.findIndex((a) => a.id === animal.id);
      if (idx >= 0) {
        this.store.animals[idx] = letOutside(
          this.store.animals[idx],
          this.store.animals,
          this.store.relationships,
        );
        this.tickClock('garden_let_out');
      }
      this.closePopup();
      this.viewMode = 'garden';
      this.renderView();
      this.saveState();
      this.processing = false;
    };

    const doBringInside = () => {
      if (this.processing) return;
      this.processing = true;
      const idx = this.store.animals.findIndex((a) => a.id === animal.id);
      if (idx >= 0) {
        let updated = bringInside(this.store.animals[idx]);
        // If they were outside in the rain AND their species loves rain
        // (dogs!), flag them as wet so the shake-off comedy fires when
        // the player next interacts with them indoors.
        const w = this.store.gardenWeather?.current;
        if (w && isRainy(w) && getSpeciesRainTolerance(updated.species) === 'loves') {
          updated = markWet(updated);
        }
        this.store.animals[idx] = updated;
        this.tickClock('garden_bring_in');
      }
      this.closePopup();
      this.renderView();
      this.saveState();
      this.processing = false;
    };

    const doEquipWardrobe = () => {
      // Open the wardrobe picker — player chooses a colour for the
      // species' garment. Picker renders into the gameContainer on top
      // of everything else; its own overlay blocks input to lower
      // layers. Equip/remove/close all close the popup then re-render.
      this.closePopup();
      renderWardrobePicker(this, this.gameContainer, animal, {
        onEquip: (wardrobeCode) => {
          const idx = this.store.animals.findIndex((a) => a.id === animal.id);
          if (idx >= 0) {
            this.store.animals[idx] = { ...this.store.animals[idx], wardrobe: wardrobeCode };
            showToast(this, `${animal.name} is now dressed for the weather.`);
          }
          this.renderView();
          this.saveState();
        },
        onRemove: () => {
          const idx = this.store.animals.findIndex((a) => a.id === animal.id);
          if (idx >= 0) {
            const next = { ...this.store.animals[idx] };
            delete next.wardrobe;
            this.store.animals[idx] = next;
          }
          this.renderView();
          this.saveState();
        },
        onClose: () => this.renderView(),
      });
    };

    renderAnimalDetails(this, this.store, this.gameContainer, animal, anchor, {
      onClose: () => this.closePopup(),
      onFeed: () => { doFeed(); this.tickClock('feed'); },
      onPlay: () => { doPlay(); this.tickClock('play'); },
      onWalk: doWalk,
      onGroom: doGroom,
      onHeal: doVetVisit,
      onTakeToVet: doVetVisit,
      onVisitGarden: () => {
        this.closePopup();
        this.viewMode = 'garden';
        this.renderView();
      },
      onLetOutside: doLetOutside,
      onBringInside: doBringInside,
      onEquipWardrobe: doEquipWardrobe,
      onOpenPaths: () => {
        this.closePopup();
        this.openPathsOverlay(animal);
      },
    });
  }

  /**
   * Mount the HTML Paths panel as an iframe overlay over Phaser.
   * Aspiring to a path will be persisted when we wire the store side;
   * for now the ceremony / adopter flows chain off the aspiration choice.
   */
  private openPathsOverlay(animal: Animal): void {
    const unmount = mountInGame('paths', {
      onAction: (action) => {
        if (action === 'close' || action === 'back-to-menu') {
          unmount();
          return;
        }
        if (action === 'aspire-rehome') {
          this.setAspiration(animal, 'rehome');
          unmount();
          this.openAdoptersOverlay(animal);
          return;
        }
        if (action === 'aspire-rewild') {
          this.setAspiration(animal, 'rewild');
          unmount();
          this.openRewildingOverlay(animal);
          return;
        }
        if (action === 'aspire-stay') {
          // Aspiration saved — final commit happens later via a working-
          // animal slot. For now dismiss back to the game.
          this.setAspiration(animal, 'stay');
          unmount();
          return;
        }
      },
    }, { animalName: animal.name, animalSpecies: animal.species, bond: animal.bondLevel });
    this.events.once('shutdown', unmountInGame);
  }

  private openAdoptersOverlay(animal: Animal): void {
    const unmount = mountInGame('adopters', {
      onAction: (action, payload) => {
        if (action === 'back-to-menu') { unmount(); return; }
        if (action === 'meet-adopter') {
          unmount();
          this.openAdoptionOverlay(animal, (payload?.id as string) ?? '');
          return;
        }
      },
    }, { animalName: animal.name, animalSpecies: animal.species });
    this.events.once('shutdown', unmountInGame);
  }

  private openAdoptionOverlay(animal: Animal, householdId: string): void {
    const unmount = mountInGame('adoption', {
      onAction: (action) => {
        if (action === 'adoption-cancel') { unmount(); return; }
        if (action === 'adoption-confirm') {
          this.commitAdoption(animal, householdId);
          unmount();
          return;
        }
      },
    }, { animalId: animal.id, animalName: animal.name, householdId });
    this.events.once('shutdown', unmountInGame);
  }

  private openRewildingOverlay(animal: Animal): void {
    const unmount = mountInGame('rewilding', {
      onAction: (action) => {
        if (action === 'rewild-cancel') { unmount(); return; }
        if (action === 'rewild-confirm') {
          this.commitRewilding(animal);
          unmount();
          return;
        }
      },
    }, { animalId: animal.id, animalName: animal.name });
    this.events.once('shutdown', unmountInGame);
  }

  /** Persist a non-committing aspiration onto the animal. Can be changed. */
  private setAspiration(animal: Animal, aspiration: 'rehome' | 'rewild' | 'stay'): void {
    const idx = this.store.animals.findIndex((a) => a.id === animal.id);
    if (idx < 0) return;
    this.store.animals[idx] = { ...this.store.animals[idx], aspiration };
    this.saveState();
  }

  /** Commit: remove animal from centre, record in rehomed history, save. */
  private commitAdoption(animal: Animal, householdId: string): void {
    const idx = this.store.animals.findIndex((a) => a.id === animal.id);
    if (idx < 0) return;
    const a = this.store.animals[idx];
    this.store.rehomed.push({
      animalId: a.id,
      animalName: a.name,
      species: a.species,
      variant: a.variant,
      householdId,
      date: Date.now(),
    });
    this.store.animals.splice(idx, 1);
    this.store.sickAnimals.delete(a.id);
    AudioManager.getInstance().playSfx('animal_happy');
    showToast(this, `💚 ${a.name} found their forever home!`);
    this.saveState();
    this.renderView();
  }

  /** Commit: remove animal from centre, record in rewilded list, save. */
  private commitRewilding(animal: Animal): void {
    const idx = this.store.animals.findIndex((a) => a.id === animal.id);
    if (idx < 0) return;
    const a = this.store.animals[idx];
    this.store.rewilded.push({
      animalId: a.id,
      animalName: a.name,
      species: a.species,
      variant: a.variant,
      date: Date.now(),
    });
    this.store.animals.splice(idx, 1);
    this.store.sickAnimals.delete(a.id);
    AudioManager.getInstance().playSfx('animal_happy');
    showToast(this, `🌲 ${a.name} is running free in the wild — they'll come to visit!`);
    this.saveState();
    this.renderView();
  }

  /**
   * Record a care-task tick against the in-game clock. If the tick
   * advances the phase, update the weather to the new phase's forecast
   * entry and surface a small toast so Lily sees the world respond.
   */
  private tickClock(task: Parameters<typeof recordCareTask>[1]): void {
    if (!this.store.timeProgress) return;
    const result = recordCareTask(this.store.timeProgress, task);
    this.store.timeProgress = result.progress;
    if (result.phaseAdvanced) {
      // Advance weather slot to the new phase
      if (this.store.gardenWeather) {
        const next = this.store.gardenWeather.forecast[result.newPhase];
        this.store.gardenWeather = {
          ...this.store.gardenWeather,
          current: next,
          setAt: new Date().toISOString(),
        };
      }
      const capPhase = result.newPhase[0].toUpperCase() + result.newPhase.slice(1);
      showToast(this, `${capPhase} has come.`);
    }
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
