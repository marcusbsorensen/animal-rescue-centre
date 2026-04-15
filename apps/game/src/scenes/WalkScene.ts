import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { COLOURS, FONTS, TEXT_RESOLUTION } from '../ui/constants';
import { createButton, createTextButton, createPillTitle, createPanel } from '../ui/UIButton';
import {
  startGridWalk,
  movePlayer,
  interactWithTile,
  handleAnimalEncounter,
  handleGridRoadCrossing,
  advanceNPCs,
  calculateGridWalkRewards,
  canGoOnWalk,
  WALK_ZONES,
  TILE_DEFS,
  SPECIES_COLOURS,
} from '@arc/game-logic';
import type {
  WalkGridState, WalkZone, WalkDirection, WalkNPC,
  InteractionResult, EncounterResult, MoveTrigger,
} from '@arc/game-logic';
import { createAnimalSprite } from '../ui/sprites';
import { AudioManager } from '../audio/AudioManager';

type WalkPhase = 'collar' | 'select_zone' | 'exploring' | 'road_crossing' | 'interaction' | 'encounter' | 'results';

/**
 * WalkScene — Grid-based pet walking exploration game.
 *
 * Put collar on → pick zone → explore grid with arrow keys →
 * interact with objects, meet animals, cross roads → results.
 */
export class WalkScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;
  private animal!: Animal;
  private allAnimals: Animal[] = [];
  private onComplete?: (animals: Animal[], walkResult: { perfectWalk: boolean }) => void;

  private phase: WalkPhase = 'collar';
  private gridState?: WalkGridState;

  // Containers
  private container!: Phaser.GameObjects.Container;
  private gridContainer!: Phaser.GameObjects.Container;
  private hudContainer!: Phaser.GameObjects.Container;
  private dpadContainer!: Phaser.GameObjects.Container;
  private overlayContainer!: Phaser.GameObjects.Container;

  // Player sprite on grid
  private playerSprite?: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private npcSprites: Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle> = new Map();

  // Input
  private keys?: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
  };
  private moveCooldown = 0;
  private isMoving = false;

  // Timers
  private npcTimer?: Phaser.Time.TimerEvent;
  private roadTimer?: Phaser.Time.TimerEvent;
  private roadTimeLeft = 3000;
  private pendingRoadRow = -1;

  // Grid rendering
  private cellSize = 0;
  private gridOffsetX = 0;
  private gridOffsetY = 0;

  constructor() {
    super({ key: 'WalkScene' });
  }

  init(data: {
    animal: Animal;
    allAnimals: Animal[];
    onComplete?: (animals: Animal[], walkResult: { perfectWalk: boolean }) => void;
  }): void {
    this.animal = data.animal;
    this.allAnimals = [...(data.allAnimals || [])];
    this.onComplete = data.onComplete;
    this.gridState = undefined;
    this.phase = 'collar';
    this.npcSprites.clear();
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('walk');

    this.cameras.main.fadeIn(400, 232, 245, 233);

    this.container = this.add.container(0, 0);
    this.gridContainer = this.add.container(0, 0);
    this.hudContainer = this.add.container(0, 0);
    this.dpadContainer = this.add.container(0, 0);
    this.overlayContainer = this.add.container(0, 0);

    // Viewport resize
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

    this.renderPhase();

    this.events.on('shutdown', () => {
      this.cleanupKeys();
      this.npcTimer?.destroy();
      this.roadTimer?.destroy();
    });
  }

  update(_time: number, delta: number): void {
    if (this.phase !== 'exploring' || !this.gridState || this.isMoving) return;

    this.moveCooldown -= delta;
    if (this.moveCooldown > 0) return;

    let dir: WalkDirection | null = null;
    if (this.keys) {
      if (this.keys.up.isDown || this.keys.w.isDown) dir = 'up';
      else if (this.keys.down.isDown || this.keys.s.isDown) dir = 'down';
      else if (this.keys.left.isDown || this.keys.a.isDown) dir = 'left';
      else if (this.keys.right.isDown || this.keys.d.isDown) dir = 'right';
      else if (this.keys.space.isDown) {
        this.moveCooldown = 300;
        this.handleInteract();
        return;
      }
    }

    if (dir) {
      this.moveCooldown = 180;
      this.handleMove(dir);
    }
  }

  // ── Phase management ──────────────────────────────────────

  private clearAll(): void {
    this.container.removeAll(true);
    this.gridContainer.removeAll(true);
    this.hudContainer.removeAll(true);
    this.dpadContainer.removeAll(true);
    this.overlayContainer.removeAll(true);
    this.playerSprite = undefined;
    this.npcSprites.clear();
  }

  private renderPhase(): void {
    this.clearAll();
    const { width, height } = this.scale;

    // Background for all phases
    this.container.add(this.add.rectangle(width / 2, height / 2, width, height, 0xe8f5e9));

    switch (this.phase) {
      case 'collar': this.renderCollarPhase(width, height); break;
      case 'select_zone': this.renderZoneSelect(width, height); break;
      case 'exploring': this.renderExploring(width, height); break;
      case 'road_crossing': this.renderRoadCrossing(width, height); break;
      case 'results': this.renderResults(width, height); break;
    }
  }

  // ── Phase 1: Collar ───────────────────────────────────────

  private renderCollarPhase(width: number, height: number): void {
    this.container.add(
      createPillTitle(this, width / 2, 50, `Walk time for ${this.animal.name}!`, {
        bgColour: 0x2E8B57, fontSize: '22px',
      })
    );

    this.container.add(
      this.add.text(width / 2, 95, 'First, let\'s put the collar on.', {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // Animal sprite
    const sprite = createAnimalSprite(this, width / 2, height * 0.4, this.animal, { width: 100, height: 80 });
    this.container.add(sprite);

    // Name below sprite
    this.container.add(
      this.add.text(width / 2, height * 0.4 + 55, this.animal.name, {
        fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Put collar on button
    this.container.add(
      createButton(this, width / 2, height * 0.65, 'Put collar on!', () => {
        AudioManager.getInstance().playSfx('collar_pick');
        if (this.gridState) this.gridState.collarOn = true;
        this.phase = 'select_zone';
        this.renderPhase();
      }, { width: 240, fontSize: '18px', bgColour: '#2E8B57', icon: 'icon-walk' })
    );

    this.container.add(
      createTextButton(this, width / 2, height * 0.78, '← Back to centre', () => {
        this.scene.start('GameScene');
      })
    );
  }

  // ── Phase 2: Zone Select ──────────────────────────────────

  private renderZoneSelect(width: number, height: number): void {
    this.container.add(
      createPillTitle(this, width / 2, 45, `Where shall we walk?`, {
        bgColour: 0x2E8B57, fontSize: '20px',
      })
    );

    const zones = WALK_ZONES;
    const cardW = Math.min(420, width - 60);

    zones.forEach((zone, i) => {
      const y = 110 + i * 90;

      // Card
      const cardGfx = this.add.graphics();
      cardGfx.fillStyle(0x000000, 0.08);
      cardGfx.fillRoundedRect(width / 2 - cardW / 2 + 3, y - 32, cardW, 70, 12);
      cardGfx.fillStyle(0xffffff, 0.95);
      cardGfx.fillRoundedRect(width / 2 - cardW / 2, y - 35, cardW, 70, 12);
      this.container.add(cardGfx);

      const hitArea = this.add.rectangle(width / 2, y, cardW, 70, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });
      this.container.add(hitArea);

      this.container.add(
        this.add.text(width / 2 - cardW / 2 + 20, y - 12, zone.label, {
          fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
        }).setOrigin(0, 0.5)
      );

      this.container.add(
        this.add.text(width / 2 - cardW / 2 + 20, y + 12, zone.description, {
          fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
        }).setOrigin(0, 0.5)
      );

      hitArea.on('pointerdown', () => this.startExploring(zone.zone));
      hitArea.on('pointerover', () => hitArea.setFillStyle(0x2E8B57, 0.1));
      hitArea.on('pointerout', () => hitArea.setFillStyle(0xffffff, 0));
    });

    this.container.add(
      createTextButton(this, width / 2, height - 40, '← Back', () => {
        this.phase = 'collar';
        this.renderPhase();
      })
    );
  }

  // ── Phase 3: Grid Exploring ───────────────────────────────

  private startExploring(zone: WalkZone): void {
    this.gridState = startGridWalk(this.animal, zone);
    this.gridState.collarOn = true;
    this.phase = 'exploring';
    this.setupKeys();
    this.renderPhase();

    // NPC patrol timer
    this.npcTimer = this.time.addEvent({
      delay: 2000,
      callback: () => {
        if (this.gridState) {
          this.gridState = advanceNPCs(this.gridState);
          this.updateNPCPositions();
        }
      },
      loop: true,
    });
  }

  private renderExploring(width: number, height: number): void {
    if (!this.gridState) return;

    const { map } = this.gridState;
    const hudH = 50;
    const dpadH = 100;
    const navH = 74;

    // Calculate cell size to fit grid in available space
    const availH = height - hudH - dpadH - navH - 10;
    const availW = width - 20;
    this.cellSize = Math.floor(Math.min(availW / map.cols, availH / map.rows));
    const gridW = this.cellSize * map.cols;
    const gridH = this.cellSize * map.rows;
    this.gridOffsetX = (width - gridW) / 2;
    this.gridOffsetY = hudH + 5;

    // Grid background
    this.container.add(
      this.add.rectangle(width / 2, this.gridOffsetY + gridH / 2, gridW + 4, gridH + 4, 0x3a2e22, 0.3)
    );

    // Render tiles
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        this.drawTileAt(r, c, map.tiles[r][c]);
      }
    }

    // Render NPCs
    this.renderNPCs();

    // Render player
    this.renderPlayer();

    // Render HUD
    this.renderHUD(width);

    // Render D-pad (mobile controls)
    this.renderDPad(width, height);
  }

  private renderPlayer(): void {
    if (!this.gridState) return;
    const { x, y } = this.tileToScreen(this.gridState.playerRow, this.gridState.playerCol);
    const spriteSize = this.cellSize * 0.85;

    this.playerSprite = createAnimalSprite(this, x, y, this.gridState.animal, {
      width: spriteSize, height: spriteSize * 0.8,
    });
    this.gridContainer.add(this.playerSprite);
  }

  private renderNPCs(): void {
    if (!this.gridState) return;

    for (const npc of this.gridState.map.npcs) {
      if (npc.interacted && npc.type === 'animal') continue; // fled or done

      const { x, y } = this.tileToScreen(npc.row, npc.col);
      const emojiSize = Math.max(12, this.cellSize * 0.6);

      if (npc.type === 'animal' && npc.species) {
        // Use animal sprite
        const fakeAnimal: Animal = {
          id: npc.id, name: npc.label, species: npc.species,
          state: 'sheltered', hunger: 0, tiredness: 0, happiness: 100,
          health: 100, bondLevel: 0, arrivalStory: '', roomId: '',
        };
        const sprite = createAnimalSprite(this, x, y, fakeAnimal, {
          width: this.cellSize * 0.7, height: this.cellSize * 0.6,
        });
        this.gridContainer.add(sprite);
        this.npcSprites.set(npc.id, sprite);

        // Temperament indicator (coloured circle)
        const tempColour = npc.temperament === 'friendly' ? 0x4adc7b
          : npc.temperament === 'nervous' ? 0xf0c040 : 0xe74c3c;
        this.gridContainer.add(
          this.add.circle(x, y - this.cellSize * 0.4, Math.max(4, emojiSize * 0.25), tempColour)
        );
      } else {
        // Person NPC as a coloured rectangle
        const personRect = this.add.rectangle(x, y, this.cellSize * 0.5, this.cellSize * 0.7, 0x7da5c8);
        this.gridContainer.add(personRect);
        this.npcSprites.set(npc.id, personRect);
      }
    }
  }

  private updateNPCPositions(): void {
    if (!this.gridState) return;
    for (const npc of this.gridState.map.npcs) {
      const sprite = this.npcSprites.get(npc.id);
      if (sprite) {
        const { x, y } = this.tileToScreen(npc.row, npc.col);
        this.tweens.add({
          targets: sprite,
          x, y,
          duration: 300,
          ease: 'Quad.easeInOut',
        });
      }
    }
  }

  private renderHUD(width: number): void {
    if (!this.gridState) return;

    const barH = 46;
    const maxW = Math.min(width, 600);
    const barX = (width - maxW) / 2;

    const bg = this.add.graphics();
    bg.fillStyle(0x2d1f14, 0.88);
    bg.fillRoundedRect(barX, 0, maxW, barH, { tl: 0, tr: 0, bl: 12, br: 12 });
    this.hudContainer.add(bg);

    const cy = barH / 2;

    // Zone label
    const zoneLabel = WALK_ZONES.find((z) => z.zone === this.gridState!.zone)?.label ?? '';
    this.hudContainer.add(
      this.add.text(barX + 16, cy, zoneLabel, {
        fontSize: '15px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
      }).setOrigin(0, 0.5)
    );

    // Interactions progress
    const intDone = this.gridState.interactionsCompleted;
    const intTotal = this.gridState.totalInteractables;
    this.hudContainer.add(
      this.add.text(barX + maxW / 2, cy, `Explored: ${intDone}/${intTotal}`, {
        fontSize: '14px', fontFamily: FONTS.body, color: '#aaddaa', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    // Road crossings
    const roads = this.gridState.crossedRoadRows.length;
    const totalRoads = this.gridState.totalRoadCrossings;
    this.hudContainer.add(
      this.add.text(barX + maxW - 16, cy, `Roads: ${roads}/${totalRoads}`, {
        fontSize: '14px', fontFamily: FONTS.body, color: '#ffccaa', resolution: TEXT_RESOLUTION,
      }).setOrigin(1, 0.5)
    );
  }

  private renderDPad(width: number, height: number): void {
    const btnSize = 48;
    const gap = 4;
    const dpadX = 70;
    const dpadY = height - 110;

    // D-pad background circle
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.25);
    bg.fillCircle(dpadX, dpadY, btnSize * 1.6);
    this.dpadContainer.add(bg);

    const makeArrow = (x: number, y: number, label: string, dir: WalkDirection) => {
      const btn = this.add.rectangle(x, y, btnSize, btnSize, 0xffffff, 0.7)
        .setStrokeStyle(1, 0x888888, 0.5)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.handleMove(dir));
      this.dpadContainer.add(btn);
      this.dpadContainer.add(
        this.add.text(x, y, label, {
          fontSize: '20px', color: '#333333',
        }).setOrigin(0.5)
      );
    };

    makeArrow(dpadX, dpadY - btnSize - gap, '▲', 'up');
    makeArrow(dpadX, dpadY + btnSize + gap, '▼', 'down');
    makeArrow(dpadX - btnSize - gap, dpadY, '◀', 'left');
    makeArrow(dpadX + btnSize + gap, dpadY, '▶', 'right');

    // Interact button (right side)
    const interactX = width - 80;
    const interactBg = this.add.graphics();
    interactBg.fillStyle(0x2E8B57, 0.85);
    interactBg.fillCircle(interactX, dpadY, 36);
    this.dpadContainer.add(interactBg);

    const interactBtn = this.add.circle(interactX, dpadY, 36, 0x2E8B57, 0)
      .setInteractive({ useHandCursor: true });
    interactBtn.on('pointerdown', () => this.handleInteract());
    this.dpadContainer.add(interactBtn);

    this.dpadContainer.add(
      this.add.text(interactX, dpadY + 8, 'Sniff', {
        fontSize: '13px', fontFamily: FONTS.body, fontStyle: 'bold', color: '#ffffff',
      }).setOrigin(0.5)
    );

    // Exit button (find exit)
    this.dpadContainer.add(
      createTextButton(this, width / 2, height - 35, 'Find Exit', () => {
        // Show exit direction hint
        if (this.gridState) {
          const dr = this.gridState.map.exitTile.row - this.gridState.playerRow;
          const dc = this.gridState.map.exitTile.col - this.gridState.playerCol;
          let hint = 'The exit is ';
          if (dr < -2) hint += 'north';
          else if (dr > 2) hint += 'south';
          if (dc < -2) hint += hint.endsWith('is ') ? 'west' : 'west';
          else if (dc > 2) hint += hint.endsWith('is ') ? 'east' : 'east';
          if (hint === 'The exit is ') hint += 'very close!';
          this.showToast(hint);
        }
      })
    );
  }

  // ── Movement handling ─────────────────────────────────────

  private handleMove(direction: WalkDirection): void {
    if (!this.gridState || this.isMoving || this.phase !== 'exploring') return;

    const result = movePlayer(this.gridState, direction);
    if (result.blocked) return;

    this.gridState = result.state;

    // Animate player movement
    this.isMoving = true;
    const { x, y } = this.tileToScreen(this.gridState.playerRow, this.gridState.playerCol);

    if (this.playerSprite) {
      this.tweens.add({
        targets: this.playerSprite,
        x, y,
        duration: 100,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.isMoving = false;
          this.handleTrigger(result.trigger, direction, result.npcId);
        },
      });
    } else {
      this.isMoving = false;
      this.handleTrigger(result.trigger, direction, result.npcId);
    }
  }

  private handleTrigger(trigger: MoveTrigger, direction: WalkDirection, npcId?: string): void {
    if (!this.gridState) return;

    switch (trigger) {
      case 'road_crossing': {
        // movePlayer returns trigger='road_crossing' without committing the move,
        // so the target road row is the tile one step in `direction` from the
        // player's current position.
        const dr = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
        const dc = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
        const targetRow = this.gridState.playerRow + dr;
        const targetCol = this.gridState.playerCol + dc;
        const targetTile = this.gridState.map.tiles[targetRow]?.[targetCol];
        this.pendingRoadRow = targetTile?.type === 'road' ? targetRow : -1;
        this.phase = 'road_crossing';
        this.renderPhase();
        break;
      }
      case 'npc_encounter': {
        if (npcId) {
          const npc = this.gridState.map.npcs.find((n) => n.id === npcId);
          if (npc) this.showEncounterChoice(npc);
        }
        break;
      }
      case 'exit': {
        this.phase = 'results';
        this.npcTimer?.destroy();
        this.cleanupKeys();
        this.renderPhase();
        break;
      }
    }
  }

  private handleInteract(): void {
    if (!this.gridState || this.phase !== 'exploring') return;

    const { state, result } = interactWithTile(this.gridState);
    this.gridState = state;

    if (result) {
      AudioManager.getInstance().playSfx('animal_happy');
      this.showInteractionPopup(result);
      // Refresh HUD
      this.hudContainer.removeAll(true);
      this.renderHUD(this.scale.width);
    }
  }

  // ── Interaction popup ─────────────────────────────────────

  private showInteractionPopup(result: InteractionResult): void {
    const { width, height } = this.scale;
    const panelW = Math.min(340, width - 40);
    const panelH = 90;
    const py = this.gridOffsetY - 5;

    this.overlayContainer.removeAll(true);

    this.overlayContainer.add(
      createPanel(this, width / 2, py, panelW, panelH, {
        fillColour: 0xffffff, borderColour: 0x2E8B57, borderWidth: 2, shadow: true,
      })
    );

    this.overlayContainer.add(
      this.add.text(width / 2, py - 12, result.emoji, { fontSize: '24px' }).setOrigin(0.5)
    );

    this.overlayContainer.add(
      this.add.text(width / 2, py + 16, result.message, {
        fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.text,
        wordWrap: { width: panelW - 30 }, align: 'center',
      }).setOrigin(0.5)
    );

    // Show stat changes
    const changes: string[] = [];
    if (result.happinessChange > 0) changes.push(`+${result.happinessChange} happy`);
    if (result.bondChange > 0) changes.push(`+${result.bondChange} bond`);
    if (result.tirednessChange < 0) changes.push(`${result.tirednessChange} tired`);
    if (result.foundTreat) changes.push('Found a treat!');

    if (changes.length > 0) {
      this.overlayContainer.add(
        this.add.text(width / 2, py + 34, changes.join(' | '), {
          fontSize: '11px', fontFamily: FONTS.body, color: '#2E8B57', resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
      );
    }

    // Auto dismiss after 1.5s
    this.time.delayedCall(1500, () => {
      this.overlayContainer.removeAll(true);
    });
  }

  // ── NPC encounter choice ──────────────────────────────────

  private showEncounterChoice(npc: WalkNPC): void {
    const { width, height } = this.scale;

    this.overlayContainer.removeAll(true);

    // Dim background
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.3);
    this.overlayContainer.add(dim);

    const panelW = Math.min(360, width - 40);
    const panelH = 180;
    const py = height * 0.4;

    this.overlayContainer.add(
      createPanel(this, width / 2, py, panelW, panelH, {
        fillColour: 0xffffff, borderColour: 0x2E8B57, borderWidth: 2, shadow: true,
      })
    );

    // Temperament indicator
    const tempText = npc.temperament === 'friendly' ? 'looks friendly!'
      : npc.temperament === 'nervous' ? 'looks nervous...'
      : 'looks grumpy!';

    this.overlayContainer.add(
      this.add.text(width / 2, py - 55, npc.label, {
        fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.overlayContainer.add(
      this.add.text(width / 2, py - 30, `This animal ${tempText}`, {
        fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    this.overlayContainer.add(
      this.add.text(width / 2, py - 5,
        'What should we do?', {
        fontSize: '15px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Approach button
    this.overlayContainer.add(
      createButton(this, width / 2 - 80, py + 40, 'Say hello', () => {
        if (!this.gridState) return;
        const { state, result } = handleAnimalEncounter(this.gridState, npc.id, 'approach');
        this.gridState = state;
        this.overlayContainer.removeAll(true);
        this.showEncounterResult(result);
      }, { width: 130, fontSize: '15px', bgColour: '#2E8B57' })
    );

    // Ignore button
    this.overlayContainer.add(
      createButton(this, width / 2 + 80, py + 40, 'Walk past', () => {
        if (!this.gridState) return;
        const { state, result } = handleAnimalEncounter(this.gridState, npc.id, 'ignore');
        this.gridState = state;
        this.overlayContainer.removeAll(true);
        this.showEncounterResult(result);
      }, { width: 130, fontSize: '15px', bgColour: '#888888' })
    );
  }

  private showEncounterResult(result: EncounterResult): void {
    const { width } = this.scale;
    const py = this.gridOffsetY - 5;

    this.overlayContainer.removeAll(true);

    const colour = result.happinessChange > 0 ? 0x2E8B57 : result.happinessChange < 0 ? 0xe74c3c : 0x888888;

    this.overlayContainer.add(
      createPanel(this, width / 2, py, Math.min(340, width - 40), 70, {
        fillColour: 0xffffff, borderColour: colour, borderWidth: 2, shadow: true,
      })
    );

    this.overlayContainer.add(
      this.add.text(width / 2, py, result.message, {
        fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.text,
        wordWrap: { width: 300 }, align: 'center',
      }).setOrigin(0.5)
    );

    this.time.delayedCall(2000, () => {
      this.overlayContainer.removeAll(true);
      // Re-render grid to update NPC visuals
      this.gridContainer.removeAll(true);
      this.npcSprites.clear();
      if (this.gridState) {
        // Re-render tiles + NPCs + player
        this.renderExploringGrid();
      }
    });
  }

  /** Re-render just the grid contents (tiles, NPCs, player) without full phase reset */
  private renderExploringGrid(): void {
    if (!this.gridState) return;
    this.gridContainer.removeAll(true);
    this.npcSprites.clear();
    this.playerSprite = undefined;

    const { map } = this.gridState;
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        this.drawTileAt(r, c, map.tiles[r][c]);
      }
    }

    this.renderNPCs();
    this.renderPlayer();
  }

  // ── Tile drawing helper ────────────────────────────────────
  // Feature tiles sit ON a grass base; base tiles fill the cell.
  private static readonly BASE_TILE_TYPES = new Set(['grass', 'path', 'road', 'sand', 'water', 'exit']);

  private drawTileAt(row: number, col: number, tile: import('@arc/game-logic').WalkTile): void {
    const def = TILE_DEFS[tile.type];
    const { x, y } = this.tileToScreen(row, col);
    const size = this.cellSize - 1;
    const isBase = WalkScene.BASE_TILE_TYPES.has(tile.type);
    const texKey = `tile-${tile.type}`;
    const hasTex = this.textures.exists(texKey);

    // 1. Base layer: for feature tiles, draw grass beneath. For base tiles,
    //    use the tile's own texture/colour as the fill.
    if (isBase) {
      if (hasTex) {
        const img = this.add.image(x, y, texKey).setDisplaySize(size, size);
        if (tile.interacted) img.setAlpha(0.6);
        this.gridContainer.add(img);
      } else {
        const rect = this.add.rectangle(x, y, size, size, def.colour);
        if (tile.interacted) rect.setAlpha(0.6);
        this.gridContainer.add(rect);
      }
    } else {
      // Grass base
      if (this.textures.exists('tile-grass')) {
        this.gridContainer.add(this.add.image(x, y, 'tile-grass').setDisplaySize(size, size));
      } else {
        this.gridContainer.add(this.add.rectangle(x, y, size, size, TILE_DEFS.grass.colour));
      }
      // Feature on top
      if (hasTex) {
        const feat = this.add.image(x, y, texKey).setDisplaySize(size * 0.95, size * 0.95);
        if (tile.interacted) feat.setAlpha(0.4);
        this.gridContainer.add(feat);
      } else if (def.emoji) {
        const emoji = this.add.text(x, y, def.emoji, {
          fontSize: `${Math.max(10, this.cellSize * 0.5)}px`,
        }).setOrigin(0.5);
        if (tile.interacted) emoji.setAlpha(0.4);
        this.gridContainer.add(emoji);
      } else {
        const rect = this.add.rectangle(x, y, size, size, def.colour);
        if (tile.interacted) rect.setAlpha(0.6);
        this.gridContainer.add(rect);
      }
    }

    // Exit flag on top of its green base
    if (tile.type === 'exit' && def.emoji) {
      this.gridContainer.add(
        this.add.text(x, y, def.emoji, {
          fontSize: `${Math.max(10, this.cellSize * 0.5)}px`,
        }).setOrigin(0.5)
      );
    }

    // Interacted checkmark (feature tiles only)
    if (tile.interacted && tile.interactable) {
      this.gridContainer.add(
        this.add.text(x + this.cellSize * 0.3, y - this.cellSize * 0.3, '✓', {
          fontSize: `${this.cellSize * 0.3}px`, color: '#ffffff',
        }).setOrigin(0.5)
      );
    }
  }

  // ── Phase 4: Road Crossing ────────────────────────────────

  private renderRoadCrossing(width: number, height: number): void {
    if (!this.gridState) return;

    this.cleanupKeys();

    this.container.add(
      createPanel(this, width / 2, height / 2 - 20, Math.min(420, width - 40), 220, {
        fillColour: 0xffe0e0, borderColour: 0xe74c3c, borderWidth: 3, shadow: true,
      })
    );

    this.container.add(
      this.add.text(width / 2, height / 2 - 90, 'ROAD!', {
        fontSize: '36px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#c0392b',
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 - 50,
        `Quick! Stop ${this.animal.name} before crossing!`, {
        fontSize: '16px', fontFamily: FONTS.body, color: '#c0392b',
      }).setOrigin(0.5)
    );

    // STOP button
    this.container.add(
      createButton(this, width / 2, height / 2, 'STOP!', () => {
        this.roadTimer?.destroy();
        this.roadTimer = undefined;
        this.handleRoadResult(true);
      }, { width: 200, fontSize: '24px', bgColour: '#c0392b' })
    );

    // Timer
    this.roadTimeLeft = 3000;
    const timerText = this.add.text(width / 2, height / 2 + 60,
      'Time: 3.0s', {
      fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#c0392b',
    }).setOrigin(0.5);
    this.container.add(timerText);

    this.roadTimer = this.time.addEvent({
      delay: 100,
      callback: () => {
        this.roadTimeLeft -= 100;
        timerText.setText(`Time: ${Math.max(0, this.roadTimeLeft / 1000).toFixed(1)}s`);
        if (this.roadTimeLeft <= 0) {
          this.roadTimer?.destroy();
          this.roadTimer = undefined;
          this.handleRoadResult(false);
        }
      },
      loop: true,
    });

    // Keyboard: Space/Enter to stop
    const kb = this.input.keyboard;
    if (kb) {
      const spaceKey = kb.addKey('SPACE');
      const enterKey = kb.addKey('ENTER');
      const handler = () => {
        if (this.roadTimer) {
          this.roadTimer.destroy();
          this.roadTimer = undefined;
          spaceKey.removeAllListeners();
          enterKey.removeAllListeners();
          this.handleRoadResult(true);
        }
      };
      spaceKey.on('down', handler);
      enterKey.on('down', handler);
    }
  }

  private handleRoadResult(success: boolean): void {
    if (!this.gridState) return;

    this.gridState = handleGridRoadCrossing(this.gridState, this.pendingRoadRow, success);

    AudioManager.getInstance().playSfx(success ? 'food_correct' : 'food_wrong');

    // Show brief result
    this.clearAll();
    const { width, height } = this.scale;
    this.container.add(this.add.rectangle(width / 2, height / 2, width, height, success ? 0xe8f5e9 : 0xffe0e0));

    this.container.add(
      this.add.text(width / 2, height / 2 - 30,
        success ? 'Great road safety!' : 'Oops! Remember: always stop and look!', {
        fontSize: '22px', fontFamily: FONTS.title, color: success ? '#2E8B57' : '#c0392b',
        align: 'center', wordWrap: { width: width - 60 },
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, height / 2 + 10,
        success
          ? `${this.animal.name} crossed safely!`
          : `${this.animal.name} needs more practice at road safety.`, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.time.delayedCall(1500, () => {
      this.phase = 'exploring';
      this.setupKeys();
      this.renderPhase();
    });
  }

  // ── Phase 5: Results ──────────────────────────────────────

  private renderResults(width: number, height: number): void {
    if (!this.gridState) return;

    const rewards = calculateGridWalkRewards(this.gridState);

    // Apply rewards
    const idx = this.allAnimals.findIndex((a) => a.id === this.animal.id);
    if (idx >= 0) {
      this.allAnimals[idx] = {
        ...this.allAnimals[idx],
        bondLevel: Math.min(100, this.allAnimals[idx].bondLevel + rewards.bondIncrease),
        happiness: Math.min(100, this.allAnimals[idx].happiness + rewards.happinessIncrease),
        tiredness: Math.min(100, this.allAnimals[idx].tiredness + rewards.tirednessIncrease),
      };
    }

    // Title
    this.container.add(
      createPillTitle(this, width / 2, 50,
        rewards.perfectWalk ? 'Perfect Walk!' : 'Walk Complete!', {
        bgColour: rewards.perfectWalk ? 0xB8860B : 0x2E8B57, fontSize: '24px',
      })
    );

    // Zone
    const zone = WALK_ZONES.find((z) => z.zone === this.gridState!.zone);
    this.container.add(
      this.add.text(width / 2, 95, `Walked through the ${zone?.label}`, {
        fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // Stats panel
    const panelW = Math.min(380, width - 40);
    const panelY = height * 0.42;
    this.container.add(
      createPanel(this, width / 2, panelY, panelW, 200, {
        fillColour: 0xffffff, borderColour: 0x2E8B57, borderWidth: 2, shadow: true,
      })
    );

    const lines = [
      { label: 'Things explored', value: `${this.gridState.interactionsCompleted}/${this.gridState.totalInteractables} (${rewards.explorationPercent}%)` },
      { label: 'Animals met', value: `${this.gridState.animalsApproached} approached, ${this.gridState.animalsIgnored} walked past` },
      { label: 'Road safety', value: this.gridState.roadCrossingsFailed === 0 ? 'Perfect!' : `${this.gridState.roadCrossingsFailed} incident(s)` },
      { label: 'Bond', value: `+${rewards.bondIncrease}` },
      { label: 'Happiness', value: `+${rewards.happinessIncrease}` },
      { label: 'Tiredness', value: `+${rewards.tirednessIncrease}` },
    ];

    lines.forEach((line, i) => {
      const ly = panelY - 75 + i * 28;
      this.container.add(
        this.add.text(width / 2 - panelW / 2 + 20, ly, line.label, {
          fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold', color: COLOURS.text,
        }).setOrigin(0, 0.5)
      );
      this.container.add(
        this.add.text(width / 2 + panelW / 2 - 20, ly, line.value, {
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(1, 0.5)
      );
    });

    // Back button
    this.container.add(
      createButton(this, width / 2, height - 90, 'Back to Centre', () => {
        this.registry.set('updatedAnimals', this.allAnimals);
        this.registry.set('walkResult', { perfectWalk: rewards.perfectWalk });
        this.scene.start('GameScene');
      }, { width: 240, fontSize: '18px', icon: 'icon-back' })
    );
  }

  // ── Helpers ────────────────────────────────────────────────

  private tileToScreen(row: number, col: number): { x: number; y: number } {
    return {
      x: this.gridOffsetX + col * this.cellSize + this.cellSize / 2,
      y: this.gridOffsetY + row * this.cellSize + this.cellSize / 2,
    };
  }

  private setupKeys(): void {
    this.cleanupKeys();
    const kb = this.input.keyboard;
    if (!kb) return;
    this.keys = {
      up: kb.addKey('UP'),
      down: kb.addKey('DOWN'),
      left: kb.addKey('LEFT'),
      right: kb.addKey('RIGHT'),
      w: kb.addKey('W'),
      a: kb.addKey('A'),
      s: kb.addKey('S'),
      d: kb.addKey('D'),
      space: kb.addKey('SPACE'),
    };
  }

  private cleanupKeys(): void {
    if (!this.keys) return;
    const kb = this.input.keyboard;
    if (kb) {
      for (const key of Object.values(this.keys)) {
        key.removeAllListeners();
        kb.removeKey(key);
      }
    }
    this.keys = undefined;
  }

  private showToast(message: string): void {
    const { width } = this.scale;
    this.overlayContainer.removeAll(true);

    const bg = this.add.graphics();
    bg.fillStyle(0x2d1f14, 0.85);
    bg.fillRoundedRect(width / 2 - 150, this.gridOffsetY - 30, 300, 28, 14);
    this.overlayContainer.add(bg);

    this.overlayContainer.add(
      this.add.text(width / 2, this.gridOffsetY - 16, message, {
        fontSize: '13px', fontFamily: FONTS.body, color: '#ffffff', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    this.time.delayedCall(2000, () => {
      this.overlayContainer.removeAll(true);
    });
  }
}
