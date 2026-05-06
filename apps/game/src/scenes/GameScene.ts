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
  canRecruit,
  recruitApprentice,
  APPRENTICE_DEFS,
  placeDecoration,
  removeDecoration,
  getRoomDecorations,
  letOutside,
  bringInside,
  markWet,
  isRainy,
  getSpeciesRainTolerance,
  recordCareTask,
  scheduleVisitsForDay,
  scheduleWildReturns,
  getDueVisitors,
  markVisitSeen,
  markAllDueGardenReturnsSeen,
  getAvailableToys,
  calculateAdoptionFee,
  getEligibleApplicants,
  commitAdoption as commitAdoptionLogic,
  checkCharityGrants,
  getGrantDef,
  pickRandomFact,
  getDestination,
  recordCharmEvent,
  CHARMS,
  equipCharm,
  unequipCharm,
} from '@arc/game-logic';
import type { Conflict, ResolutionDef, VisitorEntry, IllnessDef, CharmUnlockEvent, CharmId } from '@arc/game-logic';
import { mountInGame, unmountInGame } from '../game-overlay/InGameOverlay';
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
  renderWardrobePicker,
  renderToyPicker,
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
  /** Last view that was actually rendered — used to detect when the
   *  player navigates *away* from a view (e.g. leaving garden marks
   *  any pending wild-returns as seen). */
  private lastRenderedView?: ViewMode;
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
  private visitorTimer?: Phaser.Time.TimerEvent;
  /** Epoch-ms of the last successful dawn schedule, so we don't re-roll
   *  on every scene restart (resize handler). 1 roll per real-world day. */
  private lastVisitorSchedule = 0;
  /** Id of the visit currently showing as a toast — guards against
   *  stacking multiple toasts if the timer fires mid-show. */
  private activeVisitorToastId?: string;
  /** Cached cast.json (loaded on first visitor event). Null while the
   *  fetch is in flight; undefined if never attempted. */
  private castData?: Array<Record<string, unknown>> | null;
  private castFetchPromise?: Promise<void>;
  private selectedAnimal?: Animal;
  private processing = false;         // double-click guard
  private showingCollarPicker = false; // bond race guard
  private scrollY = 0;
  private maxScrollY = 0;
  private scrollDragStartY = 0;
  private scrollDragStartOffset = 0;
  private isDragging = false;

  /**
   * Optional pre-pick passed by IntroScene so panel-4's revealed
   * animal matches the species we then spawn. Cleared after the
   * first spawnNewAnimal() call so subsequent spawns are random
   * as before.
   */
  private preSelectedSpecies: Species | null = null;
  private preSelectedVariant: string | undefined = undefined;

  init(data?: { preSelectedSpecies?: Species; preSelectedVariant?: string }): void {
    this.preSelectedSpecies = data?.preSelectedSpecies ?? null;
    this.preSelectedVariant = data?.preSelectedVariant;
  }

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

    // Visitors — schedule today's return visits once per scene create
    // (acts as our "dawn" for MVP) and start a slow poll that pops any
    // due visit as a toast. One at a time, marked seen on display.
    this.scheduleDailyVisitors();
    // Pre-load cast.json so the painted popup is ready by the time the
    // first due visit surfaces. The fallback toast kicks in if this races.
    void this.ensureCastLoaded();
    this.visitorTimer = this.time.addEvent({
      delay: 15000,
      callback: this.checkDueVisitors,
      callbackScope: this,
      loop: true,
    });
    // Also check once immediately so past-due visits from previous sessions
    // surface without waiting 15s.
    this.time.delayedCall(1500, () => this.checkDueVisitors());

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

    // Pick a species not already in the arrival queue (variety for the player).
    // Apply Kofi's apprentice peek: extraSpeciesSlots unlocks the next
    // species in the canonical order early (parrot, then snake).
    // If IntroScene pre-picked a species, use it for THIS spawn and
    // clear so subsequent spawns return to the normal random selection.
    let species: Species;
    if (this.preSelectedSpecies !== null) {
      species = this.preSelectedSpecies;
      this.preSelectedSpecies = null;
    } else {
      const unlockedWithApprentice = getSpeciesUnlocksForLevel(
        this.store.level,
        this.store.apprenticeUnlocks.extraSpeciesSlots,
      );
      const arrivingSpecies = new Set(arriving.map((a) => a.species));
      const availableSpecies = unlockedWithApprentice.filter((s) => !arrivingSpecies.has(s));
      if (availableSpecies.length === 0) return;
      species = pickRandomSpecies(availableSpecies);
    }

    let firstNew: Animal;
    if (shouldSpawnSiblings() && sheltered + 2 <= maxShelter) {
      const [a, b] = spawnSiblingPair(species);
      this.store.animals.push(a, b);
      firstNew = a;
    } else {
      const animal = spawnAnimal(species, this.preSelectedVariant ?? undefined, this.store.animals.map(a => a.name));
      this.preSelectedVariant = undefined;
      this.store.animals.push(animal);
      firstNew = animal;
    }

    this.saveState();
    if (this.viewMode === 'corridor') this.renderView();
    this.renderHUD();

    // Celebrate the new arrival with the painted modal. Fires the arrival
    // overlay over the running scene — the player picks a welcome gesture
    // which nudges bond (and for the treat, hunger too).
    this.openArrivalOverlay(firstNew);
  }

  /**
   * Mount the HTML Arrival plaque as an iframe overlay over Phaser. The
   * player's welcome choice applies a small bond bonus to the new animal.
   */
  private openArrivalOverlay(animal: Animal): void {
    const fact = pickRandomFact(animal.species, animal.variant);
    const unmount = mountInGame('arrival', {
      onAction: (action) => {
        const applyAndClose = (bondBonus: number, hungerDelta = 0) => {
          const idx = this.store.animals.findIndex((a) => a.id === animal.id);
          if (idx >= 0) {
            const a = this.store.animals[idx];
            this.store.animals[idx] = {
              ...a,
              bondLevel: Math.min(100, a.bondLevel + bondBonus),
              hunger: Math.max(0, Math.min(100, a.hunger + hungerDelta)),
            };
          }
          this.saveState();
          unmount();
        };
        if (action === 'welcome-space') return applyAndClose(0);
        if (action === 'welcome-hi')    return applyAndClose(2);
        // Treat: +3 bond AND -5 hunger (in this model 0 = full, so eating
        // reduces the hunger value — "+5 fullness" in player-speak).
        if (action === 'welcome-treat') return applyAndClose(3, -5);
        if (action === 'close')         { unmount(); return; }
      },
    }, {
      animalId: animal.id,
      animalName: animal.name,
      species: animal.species,
      variant: animal.variant ?? '',
      fact: fact?.fact ?? '',
      factIcon: fact?.icon ?? '💡',
    });
    this.events.once('shutdown', unmountInGame);
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

    // Leaving the garden → mark any pending wild-return visits as seen
    // (so they don't linger across sessions / other navigations).
    if (this.lastRenderedView === 'garden' && this.viewMode !== 'garden') {
      markAllDueGardenReturnsSeen(this.store, Date.now());
      this.saveState();
    }
    this.lastRenderedView = this.viewMode;

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
      onCharms: () => {
        // Dismiss the popup THEN open the charm-select overlay; the
        // overlay is an HTML iframe over the live scene, so we don't
        // need a scene transition.
        this.renderView();
        this.openCharmSelectOverlay();
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

    const launchPlayScene = (animalToPlayWith: Animal) => {
      this.saveState();
      this.scene.start('PlayScene', {
        animal: animalToPlayWith,
        allAnimals: this.store.animals,
        onComplete: (updatedAnimals: Animal[], _result: { perfect: boolean }) => {
          this.store.animals = updatedAnimals;
          this.checkBadges();
          this.saveState();
        },
      });
    };

    const doPlay = () => {
      if (this.processing) return;

      // Freshest snapshot of the animal — important in case another
      // handler mutated them while the popup was open.
      const liveAnimal = this.store.animals.find((a) => a.id === animal.id) ?? animal;
      const availableToys = getAvailableToys(liveAnimal);

      // Fast-path: one toy only (just species default) → skip the
      // picker entirely. Maintains back-compat for animals without
      // an arrivalToy or explicit favouriteToy.
      if (availableToys.length <= 1) {
        this.closePopup();
        launchPlayScene(liveAnimal);
        return;
      }

      // Multi-toy path: close popup + mount the picker.
      this.closePopup();
      this.openToyPicker(liveAnimal, launchPlayScene);
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
      onHeal: () => {
        // New: route to the HTML Vet popup with treatment choices.
        // doVetVisit is kept as a fallback for onTakeToVet below.
        this.closePopup();
        this.openVetOverlay(animal);
      },
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
   * Mount the in-Phaser toy picker on top of the current view. The
   * player selects a toy (persisted as `animal.favouriteToy`) and then
   * taps "Play now!" to launch PlayScene. Back-tap dismisses without
   * launching the mini-game.
   *
   * Runs in its own container so we can tear it down cleanly without
   * disturbing the underlying corridor/room render.
   */
  private openToyPicker(animal: Animal, launchPlayScene: (a: Animal) => void): void {
    const pickerContainer = this.add.container(0, 0).setDepth(900);

    const dismiss = () => {
      pickerContainer.destroy(true);
    };

    let currentAnimal = animal;

    renderToyPicker(this, pickerContainer, currentAnimal, {
      onPick: (toyId) => {
        const idx = this.store.animals.findIndex((a) => a.id === currentAnimal.id);
        if (idx >= 0) {
          this.store.animals[idx] = { ...this.store.animals[idx], favouriteToy: toyId };
          currentAnimal = this.store.animals[idx];
        }
        this.saveState();
      },
      onPlay: () => {
        const latest = this.store.animals.find((a) => a.id === currentAnimal.id) ?? currentAnimal;
        dismiss();
        launchPlayScene(latest);
      },
      onBack: () => {
        dismiss();
        this.renderView();
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
          this.openAdoptionMatchOverlay(animal);
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

  /**
   * Mount the new adoption-office iframe (L1 curtailed roster).
   *
   * Architecture note: the office iframe reads the animal banner info
   * from URL query params (`animalName`, `species`, `variant`,
   * `animalSpriteSrc`), and listens for a follow-up postMessage of
   * shape `{source:'arc-adoption-office-host', type:'applicants',
   * payload:{applicants}}` to populate its picker. We compute the
   * eligible list here via game-logic and post it after the iframe
   * loads.
   */
  private openAdoptionOfficeOverlay(animal: Animal): void {
    const applicants = getEligibleApplicants(animal, this.store);
    const spriteSrc = animal.variant
      ? `/assets/animals/${animal.species}-${animal.variant}-sheltered.png`
      : `/assets/animals/${animal.species}-sheltered.png`;

    const unmount = mountInGame(
      'adoption-office',
      {
        onAction: (action, payload) => {
          if (action === 'adoption-office-cancel' || action === 'close' || action === 'back-to-menu') {
            unmount();
            return;
          }
          if (action === 'adoption-pick') {
            const householdId = typeof payload?.householdId === 'string' ? payload.householdId : '';
            unmount();
            this.openAdoptionOverlay(animal, householdId);
            return;
          }
        },
      },
      {
        animalId: animal.id,
        animalName: animal.name,
        species: animal.species,
        variant: animal.variant ?? '',
      },
      {
        hostSource: 'arc-adoption-office-host',
        query: {
          animalId: animal.id,
          animalName: animal.name,
          species: animal.species,
          variant: animal.variant ?? '',
          animalSpriteSrc: spriteSrc,
        },
        extraInits: [
          { type: 'applicants', payload: { applicants } },
        ],
      },
    );
    this.events.once('shutdown', unmountInGame);
  }

  /**
   * New native-Phaser adoption-match picker. Replaces the old
   * `adoption-office.html` iframe with a painted Phaser scene that
   * shares the texture cache, audio manager, and registry. Pauses
   * GameScene while the picker is on screen and resumes it on
   * confirm/cancel; on confirm we chain into the existing painted
   * adoption-ceremony iframe (`openAdoptionOverlay`) so the downstream
   * `commitAdoption` path is unchanged.
   */
  public openAdoptionMatchOverlay(animal: Animal): void {
    this.scene.pause();
    this.scene.launch('AdoptionMatchScene', {
      animal,
      store: this.store,
      onComplete: (householdId: string | null) => {
        this.scene.resume();
        if (!householdId) return;
        this.openAdoptionOverlay(animal, householdId);
      },
    });
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

  /**
   * Mount the HTML world-map overlay. Players use this map to pick driving
   * destinations — supply runs, adoption deliveries, rewilding releases,
   * and visits to rewilded animals in their habitats.
   *
   * The map posts a 'drive-to' action with `{ destinationId, context }` when
   * the player taps "Drive here!". For v1 we just toast the intent — wiring
   * to an actual drive scene is v2. The `context` parameter is reserved so
   * later callers can open the map filtered to rewilded-visit destinations
   * (e.g. openMapOverlay('visit-rewilded')).
   */
  public openMapOverlay(context: 'default' | 'visit-rewilded' = 'default'): void {
    const unmount = mountInGame('map', {
      onAction: (action, payload) => {
        if (action === 'close' || action === 'back-to-menu') { unmount(); return; }
        if (action === 'drive-to') {
          const id = typeof payload?.destinationId === 'string' ? payload.destinationId : '';
          const dest = getDestination(id);
          const name = dest?.label ?? id;
          showToast(this, `🗺 Drive to ${name} coming soon!`);
          unmount();
          return;
        }
        // Tunnel-mouth tap on the A.R.C. site map → unmount map and
        // open the garden-tunnel mini-game.
        if ((action as string) === 'open-tunnel') {
          unmount();
          this.openTunnelOverlay();
          return;
        }
      },
    }, { context, playerLevel: this.store.level });
    this.events.once('shutdown', unmountInGame);
  }

  /**
   * Garden-tunnel mini-game.
   *
   * Tier picked from player level per docs/level-progression-overview:
   *   L1-3   → tier 1 (fox)
   *   L4-5   → tier 2 (hedgehog)
   *   L6-7   → tier 3 (raccoon)
   *   L8-9   → tier 4 (skunk)
   *   L10+   → tier 5 (multi-animal coordination)
   *
   * Daily-seed puzzle (host UTC date) so the same board persists
   * across same-day reloads. The iframe runs its own generator using
   * `?tier=N` URL param + the seed from the init handshake.
   *
   * Routing of iframe → host messages:
   *   - tunnel-complete → bump every rescued animal's happiness/bond
   *     (payload.animalsRescued is an array of species strings)
   *   - tunnel-cancel   → dismiss with no side effects
   *   - tunnel-override-reroll → grant +10 coins (centre-infrastructure
   *     reward; intentionally NOT a happiness boost — the kid only
   *     earns animal-care rewards by completing the tunnel).
   */
  public openTunnelOverlay(): void {
    // Pick tier from player level (per level-progression doc).
    const level = this.store.level;
    const tier =
      level >= 10 ? 5 :
      level >= 8  ? 4 :
      level >= 6  ? 3 :
      level >= 4  ? 2 : 1;

    // Daily seed (UTC) so the puzzle stays put across same-day reloads.
    const today = new Date();
    const dailySeed = (today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate()) >>> 0;

    // Pass current season so the iframe picks the matching seasonal soil
    // pool (spring/summer/autumn/winter). Without this, the tunnel falls
    // back to a single soil tile.
    const season = this.store.calendar?.currentSeason ?? 'spring_bloom';

    const unmount = mountInGame('tunnel', {
      onAction: (action, payload) => {
        if (action === 'tunnel-cancel' || action === 'close') {
          unmount();
          return;
        }
        if (action === 'tunnel-complete') {
          // Bump each rescued animal's happiness/bond. payload.animalsRescued
          // is an array of species strings (e.g. ['fox'] for tier 1,
          // ['fox','hedgehog','raccoon','skunk'] for tier 5). For each
          // species, find the FIRST animal of that species in the shelter
          // and bump it. If a species hasn't arrived yet (e.g. kid is at
          // L4 but no hedgehog yet), silently skip it.
          const rescued = (payload as { animalsRescued?: string[] } | undefined)?.animalsRescued
            ?? ['fox'];
          const namesBumped: string[] = [];
          for (const species of rescued) {
            const animal = this.store.animals.find((a) => a.species === (species as Species));
            if (!animal) continue;
            const idx = this.store.animals.findIndex((a) => a.id === animal.id);
            const current = typeof animal.happiness === 'number' ? animal.happiness : 0;
            this.store.animals[idx] = {
              ...animal,
              happiness: Math.min(100, current + 8),
              bondLevel: Math.min(100, animal.bondLevel + 3),
            };
            namesBumped.push(animal.name);
          }
          if (namesBumped.length === 1) {
            this.saveState();
            showToast(this, `${namesBumped[0]} had a great run through the tunnel! +happiness`);
          } else if (namesBumped.length > 1) {
            this.saveState();
            const list = namesBumped.length === 2
              ? namesBumped.join(' and ')
              : `${namesBumped.slice(0, -1).join(', ')} and ${namesBumped[namesBumped.length - 1]}`;
            showToast(this, `${list} all had a great run! +happiness for all`);
          } else {
            showToast(this, 'You built the tunnels — animals arrive soon!');
          }
          unmount();
          return;
        }
        if (action === 'tunnel-override-reroll') {
          // "Re-dig tunnels" override: small centre-infrastructure
          // reward (NOT animal happiness — that only comes from
          // completion). +10 coins as per design doc decision #2.
          const econ = this.store.economy as Economy | undefined;
          if (econ) {
            econ.coins = (econ.coins ?? 0) + 10;
            this.saveState();
            showToast(this, '+10 coins for rebuilding the tunnels');
          }
          // The iframe stays mounted (it re-rolled itself); no unmount.
          return;
        }
      },
    }, { seed: dailySeed, season }, { query: { tier: String(tier), season } });
    this.events.once('shutdown', unmountInGame);
  }

  /**
   * Mount the HTML charm-select overlay so the player can pick a
   * dangly charm for the PTV's rear-view mirror. The overlay reads
   * the player's unlocked + equipped state from the init handshake
   * and posts back two actions:
   *
   *   - charm-equipped: { charmId: CharmId | null, vehicle }
   *     Persist the new equipped value (null = unequipped).
   *   - back-to-cockpit / close: dismiss the overlay.
   *
   * Cosmetic-only: equipping never affects gameplay outcomes.
   */
  public openCharmSelectOverlay(): void {
    const initPayload = {
      unlocked: this.store.unlockedCharms,
      equipped: this.store.equippedCharm,
      // No vehicle picker yet in-game (single PTV) — admin mockup
      // shows tabs across the fleet but the live game just defaults
      // to 'henry' until vehicle-switching ships.
      vehicle: 'henry',
    };
    const unmount = mountInGame('charm-select', {
      onAction: (action, payload) => {
        if (action === 'close' || (action as string) === 'back-to-cockpit') {
          unmount();
          return;
        }
        if ((action as string) === 'charm-equipped') {
          const next = (payload as { charmId?: CharmId | null } | undefined)?.charmId ?? null;
          if (next === null) {
            unequipCharm(this.store);
          } else {
            try {
              equipCharm(this.store, next);
            } catch (err) {
              console.warn('[charm-select] equip failed:', err);
            }
          }
          this.saveState();
          return;
        }
      },
    }, initPayload);
    this.events.once('shutdown', unmountInGame);
  }

  /**
   * Mount the HTML Vet popup over Phaser and wire the three treatment
   * choices back onto the game state.
   *
   *   - treatment-vet  → full heal immediately (costs 20 coins).
   *   - treatment-home → 70% full heal, 30% stays sick.
   *   - treatment-rest → marks a rest countdown; heals after ~2 ticks.
   *
   * sickAnimals is a `Map<string, IllnessDef>` — we keep that shape for
   * back-compat with old saves and stash the rest countdown on a side
   * Map instead of mutating the entry value.
   */
  private openVetOverlay(animal: Animal): void {
    const illness = this.store.sickAnimals.get(animal.id);
    if (!illness) return;

    // PTV first-drive: offer a painted vet-run drive before the vet
    // popup opens. The drive overlay posts `drive-complete` (apply
    // +1 happiness bonus, then open the vet popup) or `drive-skipped`
    // (open the vet popup directly, no bonus). On first completion
    // we flip `hasCompletedFirstDrive` so subsequent vet runs skip
    // the tutorial banner + dashboard-label spotlights.
    this.openDriveOverlay(animal, illness.label?.toLowerCase() ?? 'tummy bug', () => {
      this.mountVetPopup(animal, illness);
    });
  }

  /**
   * Mount the painted drive overlay (CTA → drive → arrival). On
   * completion calls `onArrive` so the caller can open the next
   * screen (today: the vet popup). On skip, calls `onArrive` without
   * the happiness bonus.
   */
  private openDriveOverlay(
    animal: Animal,
    illnessName: string,
    onArrive: () => void,
  ): void {
    const unmount = mountInGame('drive', {
      onAction: (action) => {
        if (action === 'drive-complete') {
          // +1 happiness bonus for the safe drive. Animal.happiness
          // is optional in the type; clamp to a sensible ceiling.
          const idx = this.store.animals.findIndex((a) => a.id === animal.id);
          if (idx >= 0) {
            const a = this.store.animals[idx];
            const current = typeof a.happiness === 'number' ? a.happiness : 0;
            this.store.animals[idx] = { ...a, happiness: Math.min(100, current + 1) };
          }
          const wasFirstDrive = !this.store.hasCompletedFirstDrive;
          this.store.hasCompletedFirstDrive = true;
          // Charms — every PTV drive counts toward the 100-drive
          // Golden Driving Medal and the 10-drive Silver Horseshoe
          // (vet runs are by definition no-comfort-drop drives —
          // there's no cargo crate to wobble). The first vet run
          // also unlocks the A.R.C. Pawprint Medal.
          this.fireCharmEvent('drive-completed');
          this.fireCharmEvent('drive-completed-with-comfort');
          if (wasFirstDrive) {
            this.fireCharmEvent('first-vet-run');
          }
          this.saveState();
          unmount();
          onArrive();
          return;
        }
        if (action === 'drive-skipped' || action === 'close') {
          unmount();
          onArrive();
          return;
        }
      },
    }, {
      petName: animal.name,
      species: animal.species,
      variant: animal.variant,
      illnessName,
      isFirstDrive: !this.store.hasCompletedFirstDrive,
    });
    this.events.once('shutdown', unmountInGame);
  }

  /** Internal: the original vet popup mount, factored out of openVetOverlay. */
  private mountVetPopup(animal: Animal, illness: IllnessDef): void {
    const unmount = mountInGame('vet', {
      onAction: (action) => {
        if (action === 'close') { unmount(); return; }
        if (action === 'treatment-vet') {
          // Full heal immediately (vet visit equivalent to doVetVisit).
          this.store.sickAnimals.delete(animal.id);
          if (this.store.economy?.coins != null && this.store.economy.coins >= 20) {
            this.store.economy.coins -= 20;
          }
          this.checkBadges();
          this.saveState();
          this.renderView();
          unmount();
          return;
        }
        if (action === 'treatment-home') {
          // 70% chance full heal, 30% stays sick.
          if (Math.random() < 0.7) {
            this.store.sickAnimals.delete(animal.id);
            this.checkBadges();
          }
          this.saveState();
          this.renderView();
          unmount();
          return;
        }
        if (action === 'treatment-rest') {
          // Mark a heal-after-2-ticks countdown. Tracked on a side Map
          // so the existing sickAnimals Map<string, IllnessDef> shape
          // (and old saves) stays untouched.
          this.restHealCountdown.set(animal.id, 2);
          this.tickClock('heal');
          this.saveState();
          this.renderView();
          unmount();
          return;
        }
      },
    }, {
      animalName: animal.name,
      animalSpecies: animal.species,
      animalVariant: animal.variant,
      illnessName: illness.label?.toLowerCase() ?? 'tummy bug',
    });
    this.events.once('shutdown', unmountInGame);
  }

  /** In-memory rest heal countdown keyed by animal id. MVP: not persisted. */
  private restHealCountdown: Map<string, number> = new Map();

  /** Persist a non-committing aspiration onto the animal. Can be changed. */
  private setAspiration(animal: Animal, aspiration: 'rehome' | 'rewild' | 'stay'): void {
    const idx = this.store.animals.findIndex((a) => a.id === animal.id);
    if (idx < 0) return;
    this.store.animals[idx] = { ...this.store.animals[idx], aspiration };
    this.saveState();
  }

  /** Commit: remove animal from centre, record in rehomed history, save. */
  private commitAdoption(animal: Animal, householdId: string): void {
    // Snapshot the animal before delegating — game-logic mutates
    // store.animals so we need the pre-removal record for fee +
    // toast copy below.
    const a = animal;
    try {
      const entry = commitAdoptionLogic(a, householdId, this.store);
      this.store.sickAnimals.delete(entry.animalId);
    } catch {
      showToast(this, "Couldn't complete the adoption — try again?");
      return;
    }

    // Adoption-fee donation — base 20 + bond/species bonuses, capped
    // at 50. The household entry might not be loaded yet (cast.json
    // races with adoption on a cold boot); calculateAdoptionFee
    // tolerates an undefined household by skipping the species bonus.
    const castEntry = this.findCast(householdId);
    const householdSpecies = Array.isArray(castEntry?.['species'])
      ? (castEntry['species'] as Species[])
      : undefined;
    const householdName = typeof castEntry?.['name'] === 'string'
      ? (castEntry['name'] as string)
      : 'The family';
    const fee = calculateAdoptionFee(a, { id: householdId, species: householdSpecies });
    this.store.economy.coins += fee;
    this.store.economy.lifetimeEarnings += fee;

    AudioManager.getInstance().playSfx('animal_happy');
    showToast(this, `💚 ${a.name} found their forever home!`);
    this.time.delayedCall(900, () => {
      showToast(this, `💰 ${householdName} donated ${fee} coins, thank you!`);
    });
    // Charms — species-specific first-adoption unlocks.
    if (a.species === 'cat') this.fireCharmEvent('first-cat-adoption');
    if (a.species === 'bunny') this.fireCharmEvent('first-bunny-adoption');
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
    // Charms — first rewilding drive unlocks the Fox Tail.
    this.fireCharmEvent('first-rewilding-drive');
    this.saveState();
    this.renderView();
  }

  /**
   * Recruit a volunteer apprentice. Thin wrapper that delegates the
   * rule-check + state mutation to @arc/game-logic, then persists and
   * surfaces a celebration toast. No-ops (with a reason toast) if the
   * preconditions aren't met, e.g. double-recruit or under-levelled.
   */
  private recruitApprenticeInGame(apprenticeId: string): void {
    const check = canRecruit(apprenticeId, this.store);
    if (!check.ok) {
      showToast(this, check.reason ?? 'Not ready to recruit them yet.');
      return;
    }
    try {
      recruitApprentice(apprenticeId, this.store);
      // Refresh the unlocked species list — Kofi's apprentice slot
      // grants early access to the next species in canonical order.
      this.store.unlockedSpecies = getSpeciesUnlocksForLevel(
        this.store.level,
        this.store.apprenticeUnlocks.extraSpeciesSlots,
      );
    } catch (err) {
      showToast(this, err instanceof Error ? err.message : 'Could not recruit.');
      return;
    }
    const def = APPRENTICE_DEFS[apprenticeId as keyof typeof APPRENTICE_DEFS];
    const name = def?.name ?? 'Your new friend';
    AudioManager.getInstance().playSfx('animal_happy');
    showToast(this, `⭐ ${name} is now a volunteer apprentice!`);
    this.saveState();
    this.renderHUD();
  }

  /**
   * Record a charm-unlock-relevant gameplay event and surface a
   * celebratory toast for any charm whose threshold was crossed by
   * this call. Charm bookkeeping is non-blocking — we never throw
   * out of here, so callers can fire-and-forget alongside their own
   * gameplay work.
   *
   * Wired into the small set of clearly-mapped gameplay choke points:
   *   - PTV vet-run drive completion (`drive-completed`,
   *     `drive-completed-with-comfort`, `first-vet-run`)
   *   - Adoption commit (`first-cat-adoption`, `first-bunny-adoption`)
   *   - Rewilding commit (`first-rewilding-drive`)
   *
   * Other events in the catalogue (`first-clean-overtake`,
   * `crate-accident-cleanup`, etc.) live in mini-games that don't
   * have a clean hook yet — they'll be wired in their own commits.
   */
  private fireCharmEvent(event: CharmUnlockEvent): void {
    try {
      const { newlyUnlocked } = recordCharmEvent(this.store, event);
      for (const id of newlyUnlocked) {
        const def = CHARMS[id];
        showToast(this, `New charm unlocked: ${def.label}`);
      }
    } catch (err) {
      console.warn('[fireCharmEvent] failed:', err);
    }
  }

  /**
   * Record a care-task tick against the in-game clock. If the tick
   * advances the phase, update the weather to the new phase's forecast
   * entry and surface a small toast so Lily sees the world respond.
   */
  private tickClock(task: Parameters<typeof recordCareTask>[1]): void {
    // Decrement any pending rest-heal countdowns set by the Vet popup
    // 'treatment-rest' action. When a countdown hits zero, the animal
    // is healed (sickness cleared from the sickAnimals Map).
    if (this.restHealCountdown?.size) {
      for (const [id, remaining] of this.restHealCountdown) {
        const next = remaining - 1;
        if (next <= 0) {
          this.restHealCountdown.delete(id);
          this.store.sickAnimals.delete(id);
        } else {
          this.restHealCountdown.set(id, next);
        }
      }
    }
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


  // ── Visitors ────────────────────────────────────────────────
  // MVP: schedule once per real-world day on scene create, poll every
  // 15s for due visits, surface one toast at a time. The painted
  // postcard/"visitor at the door" popup is a follow-up (visitor).

  private scheduleDailyVisitors(): void {
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // Charity grants roll alongside the daily scheduler — at most once
    // per in-game month per qualifying grant. `checkCharityGrants` is
    // gated on `store.lastGrantCheckAt` so it's safe to call every
    // scene boot; it returns [] when nothing's due.
    this.checkAndCreditCharityGrants(now);

    if (now - this.lastVisitorSchedule < ONE_DAY) return;
    const entries = scheduleVisitsForDay(this.store);
    // Wild-return pass — rewilded animals dropping by the garden. Only
    // runs once Benji has flipped wildVisitsUnlocked; no-op otherwise.
    const returns = scheduleWildReturns(this.store);
    if (entries.length === 0 && returns.length === 0) {
      this.lastVisitorSchedule = now;
      return;
    }
    if (entries.length) this.store.visitors.push(...entries);
    if (returns.length) this.store.gardenReturns.push(...returns);
    this.lastVisitorSchedule = now;
    this.saveState();
  }

  /**
   * Roll for monthly charity grants. Credits each award to coins +
   * lifetime earnings, logs onto `grantsReceived`, and surfaces one
   * painted toast per award (staggered so multiple grants don't stomp
   * each other on the same frame).
   */
  private checkAndCreditCharityGrants(now: number): void {
    const awards = checkCharityGrants(this.store, now);
    if (awards.length === 0) return;
    for (const award of awards) {
      this.store.economy.coins += award.amount;
      this.store.economy.lifetimeEarnings += award.amount;
      this.store.grantsReceived.push(award);
    }
    awards.forEach((award, idx) => {
      const def = getGrantDef(award.grantId);
      if (!def) return;
      this.time.delayedCall(idx * 1200, () => {
        showToast(this, `${def.emoji} ${def.label} — ${award.amount} coins!`);
      });
    });
    this.saveState();
  }

  private checkDueVisitors(): void {
    if (this.activeVisitorToastId) return;  // one at a time
    const due = getDueVisitors(this.store, Date.now());
    if (due.length === 0) return;
    const next = due[0];
    this.showVisitorPopup(next);
  }

  /** Lazy-load cast.json once per scene; cached on `this.castData`. */
  private ensureCastLoaded(): Promise<void> {
    if (this.castData !== undefined) return Promise.resolve();
    if (this.castFetchPromise) return this.castFetchPromise;
    this.castFetchPromise = fetch('/data/cast.json')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((json) => {
        this.castData = Array.isArray(json?.cast) ? json.cast : null;
      })
      .catch(() => {
        this.castData = null;
      });
    return this.castFetchPromise;
  }

  private findCast(householdId: string): Record<string, unknown> | undefined {
    if (!this.castData) return undefined;
    return this.castData.find((c) => c['id'] === householdId);
  }

  /**
   * Apply the side-effects of a visit (donation depot credit) and mark
   * it seen. Pulled out so both the painted popup and the fallback toast
   * can invoke the same state mutations.
   */
  private applyVisitSideEffects(visit: VisitorEntry): void {
    // First-ever wild-visit (Benji's household) unlocks the wild-return
    // mechanic — rewilded animals can now drop by the garden. Flipped
    // once; a no-op on subsequent wild-visit events.
    if (visit.type === 'wild-visit' && !this.store.wildVisitsUnlocked) {
      this.store.wildVisitsUnlocked = true;
      this.saveState();
    }
    if (visit.type === 'donation' && visit.payload?.gift) {
      const gift = visit.payload.gift;
      if (gift.kind === 'coins') {
        this.store.economy.coins += gift.amount;
        this.store.economy.lifetimeEarnings += gift.amount;
      } else if (gift.kind === 'toys') {
        const key = 'donation-toy';
        const inv = this.store.depot.inventory.decorations;
        inv[key] = (inv[key] ?? 0) + gift.amount;
      } else if (gift.kind === 'food') {
        const key = 'donation-food';
        const inv = this.store.depot.inventory.treats;
        inv[key] = (inv[key] ?? 0) + gift.amount;
      }
    }
  }

  /**
   * Present a visit via the painted iframe popup. Falls back to the
   * legacy toast if cast.json hasn't loaded yet (first visitor event
   * after a fresh install may race the fetch).
   */
  private showVisitorPopup(visit: VisitorEntry): void {
    this.activeVisitorToastId = visit.id;
    this.applyVisitSideEffects(visit);

    // Credit the depot immediately; persist before UI.
    this.saveState();

    // If cast hasn't been fetched, trigger the fetch but render the
    // legacy toast for this one event so we don't block the player.
    if (this.castData === undefined) {
      void this.ensureCastLoaded();
      this.showVisitorToastFallback(visit);
      return;
    }
    if (this.castData === null) {
      // fetch failed — keep the simple toast so visitors still surface.
      this.showVisitorToastFallback(visit);
      return;
    }

    const cast = this.findCast(visit.householdId);
    const rehomed = this.store.rehomed.find((r) => r.animalId === visit.animalId);
    const rewilded = this.store.rewilded.find((w) => w.animalId === visit.animalId);
    const animalRec = rehomed ?? rewilded;

    const animalPayload = animalRec
      ? {
          name: animalRec.animalName,
          sprite: animalRec.variant
            ? `/assets/animals/${animalRec.species}-${animalRec.variant}-sheltered.png`
            : `/assets/animals/${animalRec.species}-sheltered.png`,
        }
      : null;

    const castPayload = cast
      ? { id: cast['id'] as string, name: (cast['name'] as string) ?? '' }
      : null;

    // Without cast data for this household we can't paint a portrait —
    // fall back to the toast.
    if (!castPayload) {
      this.showVisitorToastFallback(visit);
      return;
    }

    const initPayload = {
      visitId: visit.id,
      visitorType: visit.type,
      cast: castPayload,
      animal: animalPayload,
      message: visit.payload?.message ?? this.buildVisitorToastMessage(visit),
      gift: visit.payload?.gift ?? null,
    };

    const unmount = mountInGame('visitor', {
      onAction: (action) => {
        if (action === 'visitor-seen' || action === 'close') {
          markVisitSeen(this.store, visit.id);
          this.saveState();
          unmount();
          this.activeVisitorToastId = undefined;
          // Dequeue the next due visitor, if any.
          this.time.delayedCall(400, () => this.checkDueVisitors());
        }
      },
    }, initPayload);
    this.events.once('shutdown', unmountInGame);
  }

  /** Legacy toast — kept as a fallback when cast.json isn't ready. */
  private showVisitorToastFallback(visit: VisitorEntry): void {
    const msg = this.buildVisitorToastMessage(visit);
    showToast(this, msg);
    markVisitSeen(this.store, visit.id);
    this.saveState();
    this.time.delayedCall(3500, () => {
      this.activeVisitorToastId = undefined;
    });
  }

  private buildVisitorToastMessage(visit: VisitorEntry): string {
    const animalName =
      this.store.rehomed.find((r) => r.animalId === visit.animalId)?.animalName
      ?? this.store.rewilded.find((w) => w.animalId === visit.animalId)?.animalName
      ?? 'A friend';
    switch (visit.type) {
      case 'drop-by':
        return `👋 ${animalName} dropped by to say hi!`;
      case 'donation': {
        const g = visit.payload?.gift;
        if (!g) return `🎁 A donation arrived for A.R.C.!`;
        const label = g.kind === 'coins' ? `${g.amount} coins` : `${g.amount} ${g.kind}`;
        return `🎁 ${animalName}'s family dropped off ${label}!`;
      }
      case 'photo-letter':
        return `💌 ${animalName} sent a photo from their new home!`;
      case 'second-adopt':
        return `🏡 ${animalName}'s family is ready to welcome another friend!`;
      case 'wild-visit':
        return `🌲 ${animalName} was spotted at the hedge — peek out in the garden!`;
      default:
        return `👋 A friend came to visit!`;
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
      // Painted celebration modal replaces the old toast for badge earns.
      this.openBadgeOverlay(newBadges[0]);
    }
  }

  /**
   * Mount the HTML Badge-earned plaque over Phaser. Single HURRAY button;
   * dismissal saves + unmounts.
   */
  private openBadgeOverlay(badgeCode: string): void {
    const def = BADGE_DEFINITIONS.find((b) => b.code === badgeCode);
    const unmount = mountInGame('badge', {
      onAction: (action) => {
        if (action === 'badge-seen' || action === 'close') {
          this.saveState();
          unmount();
        }
      },
    }, {
      badgeCode,
      badgeName: def?.name ?? badgeCode,
      badgeDescription: def?.description ?? '',
    });
    this.events.once('shutdown', unmountInGame);
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
      const extra = this.store.apprenticeUnlocks.extraSpeciesSlots;
      this.store.unlockedSpecies = getSpeciesUnlocksForLevel(this.store.level, extra);
      const newSpecies = getSpeciesUnlocksForLevel(this.store.level, extra).filter(
        (s) => !getSpeciesUnlocksForLevel(this.store.level - 1, extra).includes(s),
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
