import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { COLOURS, FONTS, TEXT_RESOLUTION, COLLAR_COLOURS, MIN_FONT, bottomAnchorY, TYPE, TITLE_CY, PAGE_MARGIN } from '../ui/constants';
import { createChromeButton, createTextButton, createChromeTitle, createPanel } from '../ui/UIButton';
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
import { CollarAnchors } from '../lib/CollarAnchors';

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
  private selectedCollarHex: string = '#ff6b9d';

  // Containers
  private container!: Phaser.GameObjects.Container;
  private gridContainer!: Phaser.GameObjects.Container;
  private hudContainer!: Phaser.GameObjects.Container;
  private dpadContainer!: Phaser.GameObjects.Container;
  private overlayContainer!: Phaser.GameObjects.Container;

  // Player sprite on grid — wrapped in a container together with the
  // collar overlay so they move and flip as one unit.
  private playerContainer?: Phaser.GameObjects.Container;
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
    // Pets keep their collar colour between walks; non-pets get a default pink.
    this.selectedCollarHex = this.animal.collarColour ?? '#ff6b9d';
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
    this.playerContainer = undefined;
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
      // 'road_crossing' does not redraw everything — it's an overlay on
      // top of the existing grid, handled by showRoadCrossingOverlay().
      case 'results': this.renderResults(width, height); break;
    }
  }

  // ── Phase 1: Collar ───────────────────────────────────────

  private collarRing?: Phaser.GameObjects.Graphics;
  private collarBow?: Phaser.GameObjects.Graphics;
  private collarSwatches: Phaser.GameObjects.Arc[] = [];

  private renderCollarPhase(width: number, height: number): void {
    this.container.add(
      createChromeTitle(this, width / 2, TITLE_CY, `Walk time for ${this.animal.name}!`, { fontSize: TYPE.lead })
    );

    this.container.add(
      this.add.text(width / 2, 80, 'Choose a collar colour, then head out!', {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // Animal sprite — positioned so the collar ring sits at the neck
    const spriteCx = width / 2;
    const spriteCy = height * 0.30;
    const sprite = createAnimalSprite(this, spriteCx, spriteCy, this.animal, { width: 240, height: 192 });
    this.container.add(sprite);

    // Collar ring + bow (redrawn whenever colour changes)
    this.collarRing = this.add.graphics();
    this.collarBow = this.add.graphics();
    this.container.add(this.collarRing);
    this.container.add(this.collarBow);
    this.drawCollarPreview(spriteCx, spriteCy);

    // Name pill below sprite
    this.container.add(
      this.add.text(spriteCx, spriteCy + 70, this.animal.name, {
        fontSize: TYPE.body, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Collar swatch grid (2 rows of 4)
    const pickerY = height * 0.55;
    this.container.add(
      this.add.text(width / 2, pickerY - 50, 'Pick a collar', {
        fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
      }).setOrigin(0.5)
    );

    const colsPerRow = 4;
    const swatchGap = 64;
    const rowGap = 58;
    const startX = width / 2 - ((colsPerRow - 1) * swatchGap) / 2;
    this.collarSwatches = [];

    COLLAR_COLOURS.forEach((collar, i) => {
      const col = i % colsPerRow;
      const row = Math.floor(i / colsPerRow);
      const cx = startX + col * swatchGap;
      const cy = pickerY - 12 + row * rowGap;
      const rgb = Phaser.Display.Color.HexStringToColor(collar.hex).color;

      const swatch = this.add.circle(cx, cy, 20, rgb)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(2, 0xffffff);
      swatch.setData('hex', collar.hex);
      this.collarSwatches.push(swatch);

      this.container.add(swatch);
      this.container.add(
        this.add.text(cx, cy + 28, collar.name, {
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
      );

      swatch.on('pointerdown', () => {
        this.selectedCollarHex = collar.hex;
        AudioManager.getInstance().playSfx('collar_pick');
        this.drawCollarPreview(spriteCx, spriteCy);
        this.updateCollarSwatchHighlights();
      });
      swatch.on('pointerover', () => swatch.setScale(1.12));
      swatch.on('pointerout', () => swatch.setScale(1));
    });

    this.updateCollarSwatchHighlights();

    // Let's go button
    this.container.add(
      createChromeButton(this, width / 2, height * 0.85, 'Let\'s go!', () => {
        AudioManager.getInstance().playSfx('collar_pick');
        // Persist the chosen collar colour to the animal (and the live copy
        // the caller will receive when the scene exits).
        const idx = this.allAnimals.findIndex((a) => a.id === this.animal.id);
        if (idx >= 0) this.allAnimals[idx].collarColour = this.selectedCollarHex;
        this.animal = { ...this.animal, collarColour: this.selectedCollarHex };
        if (this.gridState) this.gridState.collarOn = true;
        this.phase = 'select_zone';
        this.renderPhase();
      }, { width: 220, fontSize: TYPE.body, icon: 'icon-walk', iconStyle: 'glyph', variant: 'filled' })
    );

    this.container.add(
      createTextButton(this, width / 2, bottomAnchorY(height), '← Back to centre', () => {
        this.scene.start('GameScene');
      })
    );
  }

  /**
   * Draw (or redraw) the collar preview — a thin ring + dangling bow tag in
   * the selected colour — positioned at the animal's neck.
   */
  private drawCollarPreview(spriteCx: number, spriteCy: number): void {
    if (!this.collarRing || !this.collarBow) return;
    const rgb = Phaser.Display.Color.HexStringToColor(this.selectedCollarHex).color;
    const neckY = spriteCy + 24;

    this.collarRing.clear();
    this.collarRing.lineStyle(5, rgb, 1);
    this.collarRing.strokeEllipse(spriteCx, neckY, 70, 14);
    this.collarRing.lineStyle(1, 0xffffff, 0.7);
    this.collarRing.strokeEllipse(spriteCx, neckY, 70, 14);

    this.collarBow.clear();
    // Small dangling tag (heart-ish) at the front of the collar
    this.collarBow.fillStyle(rgb, 1);
    this.collarBow.fillCircle(spriteCx, neckY + 10, 6);
    this.collarBow.fillStyle(0xffd700, 1);
    this.collarBow.fillCircle(spriteCx, neckY + 10, 3);
    this.collarBow.lineStyle(1, 0xffffff, 0.8);
    this.collarBow.strokeCircle(spriteCx, neckY + 10, 6);
  }

  /** Highlight the currently-selected collar swatch with a dark ring. */
  private updateCollarSwatchHighlights(): void {
    for (const s of this.collarSwatches) {
      if (s.getData('hex') === this.selectedCollarHex) {
        s.setStrokeStyle(4, 0x2d1f14);
      } else {
        s.setStrokeStyle(2, 0xffffff);
      }
    }
  }

  // ── Phase 2: Zone Select ──────────────────────────────────

  /**
   * Tile-strip recipes per zone, so each card previews what the zone actually
   * contains. Uses the painterly tile PNGs we already load. Each strip is
   * rendered as a horizontal band along the right side of the card.
   */
  private static readonly ZONE_SCENERY: Record<WalkZone, Array<{ base: 'grass' | 'path' | 'sand'; feature?: string }>> = {
    park:   [
      { base: 'grass', feature: 'tree' }, { base: 'path' }, { base: 'grass', feature: 'flower' },
      { base: 'grass', feature: 'bench' }, { base: 'path' }, { base: 'grass', feature: 'bush' },
    ],
    town:   [
      { base: 'path' }, { base: 'path', feature: 'bin' }, { base: 'path' },
      { base: 'grass', feature: 'fence' }, { base: 'path' }, { base: 'path', feature: 'bench' },
    ],
    beach:  [
      { base: 'sand' }, { base: 'sand', feature: 'rock' }, { base: 'sand' },
      { base: 'sand', feature: 'rock' }, { base: 'sand' }, { base: 'sand' },
    ],
    forest: [
      { base: 'grass', feature: 'tree' }, { base: 'grass', feature: 'bush' }, { base: 'path' },
      { base: 'grass', feature: 'tree' }, { base: 'grass', feature: 'flower' }, { base: 'grass', feature: 'tree' },
    ],
  };

  private renderZoneSelect(width: number, height: number): void {
    this.container.add(
      createChromeTitle(this, width / 2, TITLE_CY, `Where shall we walk?`, { fontSize: TYPE.lead })
    );

    const zones = WALK_ZONES;
    const cardW = Math.min(520, width - PAGE_MARGIN * 2);
    const cardH = 110;
    const gap = 14;
    const totalH = zones.length * cardH + (zones.length - 1) * gap;
    const startY = Math.max(90, (height - totalH) / 2 - 20);

    zones.forEach((zone, i) => {
      const y = startY + i * (cardH + gap) + cardH / 2;

      // Card background (shadow + body)
      const cardGfx = this.add.graphics();
      cardGfx.fillStyle(0x000000, 0.10);
      cardGfx.fillRoundedRect(width / 2 - cardW / 2 + 3, y - cardH / 2 + 3, cardW, cardH, 14);
      cardGfx.fillStyle(0xffffff, 0.96);
      cardGfx.fillRoundedRect(width / 2 - cardW / 2, y - cardH / 2, cardW, cardH, 14);
      this.container.add(cardGfx);

      const hitArea = this.add.rectangle(width / 2, y, cardW, cardH, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });
      this.container.add(hitArea);

      // Title + description on the left half
      this.container.add(
        this.add.text(width / 2 - cardW / 2 + 22, y - 28, zone.label, {
          fontSize: TYPE.lead, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
        }).setOrigin(0, 0.5)
      );

      this.container.add(
        this.add.text(width / 2 - cardW / 2 + 22, y - 4, zone.description, {
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
          wordWrap: { width: cardW * 0.55 },
        }).setOrigin(0, 0.5)
      );

      // Scenery strip along the bottom of the card
      this.renderZoneSceneryStrip(
        zone.zone,
        width / 2 - cardW / 2 + 20,
        y + cardH / 2 - 26,
        cardW - 40,
        36,
      );

      hitArea.on('pointerdown', () => this.startExploring(zone.zone));
      hitArea.on('pointerover', () => {
        hitArea.setFillStyle(0x2E8B57, 0.08);
      });
      hitArea.on('pointerout', () => hitArea.setFillStyle(0xffffff, 0));
    });

    this.container.add(
      createTextButton(this, width / 2, bottomAnchorY(height), '← Back', () => {
        this.phase = 'collar';
        this.renderPhase();
      })
    );
  }

  /**
   * Paint a mini horizontal band of tiles on each zone card so kids can see
   * what "Park" / "Forest" etc. actually look like before choosing. Uses the
   * painterly tile PNGs already loaded for the grid.
   */
  private renderZoneSceneryStrip(
    zone: WalkZone, x: number, y: number, w: number, h: number,
  ): void {
    const recipe = WalkScene.ZONE_SCENERY[zone];
    const tileSize = Math.min(h, Math.floor(w / recipe.length));
    const totalW = tileSize * recipe.length;
    const startX = x + (w - totalW) / 2 + tileSize / 2;
    const cy = y;

    // Rounded clip via a background panel so tiles feel contained.
    const bg = this.add.graphics();
    bg.fillStyle(0xe9f3e4, 1);
    bg.fillRoundedRect(x + (w - totalW) / 2 - 4, cy - h / 2 - 2, totalW + 8, h + 4, 8);
    this.container.add(bg);

    recipe.forEach((cell, i) => {
      const cx = startX + i * tileSize;
      const baseKey = `tile-${cell.base}`;
      if (this.textures.exists(baseKey)) {
        this.container.add(
          this.add.image(cx, cy, baseKey).setDisplaySize(tileSize, tileSize)
        );
      } else {
        const colour = cell.base === 'path' ? 0xc9a87a : cell.base === 'sand' ? 0xf5e7b0 : 0x9ac97a;
        this.container.add(this.add.rectangle(cx, cy, tileSize, tileSize, colour));
      }

      if (cell.feature) {
        const featKey = `tile-${cell.feature}`;
        if (this.textures.exists(featKey)) {
          this.container.add(
            this.add.image(cx, cy, featKey).setDisplaySize(tileSize * 0.95, tileSize * 0.95)
          );
        }
      }
    });
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
    // `collarBasis` is the number drawWalkCollar's anchor fractions are
    // authored against, and they were tuned by eye while the sprite was
    // drawn at twice the box it was handed. So the box below doubles and
    // this does not — the pet stays exactly the size it was and the collar
    // stays on its neck. Re-basing the collar on `sprite.displayWidth` is
    // the right end state, but it means rescaling a table of fractions
    // that can only be checked by looking at it.
    const collarBasis = this.cellSize * 0.85;

    // Container so the sprite + collar move and flip together. Phaser
    // containers don't flip children with setFlipX, so we mirror via
    // scaleX = -1. That keeps the visual offset of the collar on the
    // front of the body correct whichever way the pet is walking.
    const container = this.add.container(x, y);

    // Use 'walking' state so we pick up walking-pose art when it exists.
    // createAnimalSprite falls back to 'sheltered' for species that don't
    // yet have a dedicated walking sprite.
    const sprite = createAnimalSprite(this, 0, 0, this.gridState.animal, {
      width: collarBasis * 2, height: collarBasis * 1.6,
      stateOverride: 'walking',
    });
    container.add(sprite);

    // Collar overlay — visible proof that the kid's chosen/earned collar
    // is actually being worn by their pet on the walk. Drawn on top of
    // the walking sprite at an anatomically-reasonable neck position.
    const collar = this.drawWalkCollar(collarBasis);
    container.add(collar);

    this.gridContainer.add(container);
    this.playerContainer = container;
    this.playerSprite = sprite;
  }

  /**
   * Build the collar overlay for the walking sprite: a thin ring around
   * the neck in the chosen collar colour, plus a small gold-centred tag
   * dangling just below. Returns a Container positioned relative to the
   * sprite centre (0, 0). Anchor positions come from the hand-placed
   * /data/collar-anchors.json (see admin/collar-anchors.html).
   *
   * If the anchor defines a neck mask (maskDx/maskDy/maskWidthFrac/
   * maskHeightFrac) the portion of the collar inside that ellipse is
   * hidden via an inverted geometry mask — this sells the illusion that
   * the back of the collar is hidden behind the animal's neck.
   */
  private drawWalkCollar(spriteSize: number): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    if (!this.gridState) return container;

    const { species, variant } = this.gridState.animal;
    const anchor = CollarAnchors.getInstance().get(species, variant);

    const cx = anchor.dx * spriteSize;
    const cy = anchor.dy * spriteSize;
    const ellipseW = anchor.widthFrac * spriteSize;
    const ellipseH = Math.max(3, spriteSize * (anchor.heightFrac ?? 0.09));
    const strokeW = Math.max(1.5, spriteSize * 0.035);

    const rgb = Phaser.Display.Color.HexStringToColor(this.selectedCollarHex).color;

    // Draw collar geometry relative to (0, 0) so we can position + rotate
    // the whole Graphics around the collar centre (cx, cy).
    const g = this.add.graphics();
    g.lineStyle(strokeW, rgb, 1);
    g.strokeEllipse(0, 0, ellipseW, ellipseH);
    g.lineStyle(Math.max(1, strokeW * 0.4), 0xffffff, 0.7);
    g.strokeEllipse(0, 0, ellipseW, ellipseH);

    // Dangling tag — coloured circle with gold centre dot. Positioned
    // below the ring in the collar's local frame so it rotates with it.
    const tagR = Math.max(2, spriteSize * 0.06);
    const tagYOffset = ellipseH * 0.55 + tagR * 0.3;
    g.fillStyle(rgb, 1);
    g.fillCircle(0, tagYOffset, tagR);
    g.fillStyle(0xffd700, 1);
    g.fillCircle(0, tagYOffset, Math.max(1, tagR * 0.5));
    g.lineStyle(1, 0xffffff, 0.85);
    g.strokeCircle(0, tagYOffset, tagR);

    g.setPosition(cx, cy);
    const rotationDeg = anchor.rotation ?? 0;
    if (rotationDeg !== 0) g.setRotation(rotationDeg * Math.PI / 180);

    container.add(g);

    // Apply the neck mask if the anchor defines one. Geometry masks in
    // Phaser use world-space coordinates, so the mask shape has to live
    // on the player container (not on this inner container) — we add it
    // to the player container later in renderPlayer(), but its position
    // still needs to track the sprite. Simplest: build the mask graphics
    // here with coords relative to the sprite centre, add it to this
    // container alongside the collar, hide it, and use it as the mask.
    if (
      anchor.maskWidthFrac != null &&
      anchor.maskHeightFrac != null &&
      anchor.maskDx != null &&
      anchor.maskDy != null
    ) {
      const maskShape = this.add.graphics();
      maskShape.fillStyle(0xffffff, 1);
      maskShape.fillEllipse(
        anchor.maskDx * spriteSize,
        anchor.maskDy * spriteSize,
        anchor.maskWidthFrac * spriteSize,
        anchor.maskHeightFrac * spriteSize,
      );
      maskShape.setVisible(false);
      container.add(maskShape);

      const geomMask = maskShape.createGeometryMask();
      geomMask.setInvertAlpha(true);
      g.setMask(geomMask);
    }

    return container;
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
          width: this.cellSize * 1.4, height: this.cellSize * 1.2,
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

    // Collar colour dot + zone label (collar is a persistent cue during the walk)
    const rgb = Phaser.Display.Color.HexStringToColor(this.selectedCollarHex).color;
    const collarDot = this.add.graphics();
    collarDot.fillStyle(rgb, 1);
    collarDot.fillCircle(barX + 18, cy, 8);
    collarDot.lineStyle(2, 0xffffff, 0.9);
    collarDot.strokeCircle(barX + 18, cy, 8);
    this.hudContainer.add(collarDot);

    const zoneLabel = WALK_ZONES.find((z) => z.zone === this.gridState!.zone)?.label ?? '';
    this.hudContainer.add(
      this.add.text(barX + 34, cy, zoneLabel, {
        fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
      }).setOrigin(0, 0.5)
    );

    // Interactions progress
    const intDone = this.gridState.interactionsCompleted;
    const intTotal = this.gridState.totalInteractables;
    this.hudContainer.add(
      this.add.text(barX + maxW / 2, cy, `Explored: ${intDone}/${intTotal}`, {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: '#aaddaa', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    // Road crossings
    const roads = this.gridState.crossedRoadRows.length;
    const totalRoads = this.gridState.totalRoadCrossings;
    this.hudContainer.add(
      this.add.text(barX + maxW - 16, cy, `Roads: ${roads}/${totalRoads}`, {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: '#ffccaa', resolution: TEXT_RESOLUTION,
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
          fontSize: TYPE.lead, fontFamily: FONTS.body, color: '#333333',
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
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold', color: '#ffffff',
      }).setOrigin(0.5)
    );

    // Exit button (find exit)
    this.dpadContainer.add(
      createTextButton(this, width / 2, bottomAnchorY(height), 'Find Exit', () => {
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

    if (this.playerContainer) {
      // Face the direction we're moving. Walking sprites are side-facing,
      // so we mirror the whole container (sprite + collar overlay) via
      // scaleX = -1 when moving left. Up/down leave the facing unchanged.
      // A plain Image fallback (no container) is handled below.
      if (direction === 'left') this.playerContainer.setScale(-1, 1);
      else if (direction === 'right') this.playerContainer.setScale(1, 1);

      // Small vertical bob to suggest a step.
      const baseY = y;
      this.tweens.add({
        targets: this.playerContainer,
        x, y: baseY - 3,
        duration: 50,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          if (this.playerContainer) this.playerContainer.y = baseY;
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
        // Keep grid visible; show STOP overlay in-scene instead of full-screen.
        this.phase = 'road_crossing';
        this.showRoadCrossingOverlay();
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
    const panelW = Math.min(340, width - PAGE_MARGIN * 2);
    const panelH = 90;
    const py = this.gridOffsetY - 5;

    this.overlayContainer.removeAll(true);

    this.overlayContainer.add(
      createPanel(this, width / 2, py, panelW, panelH, {
        fillColour: 0xffffff, borderColour: 0x2E8B57, borderWidth: 2, shadow: true,
      })
    );

    this.overlayContainer.add(
      this.add.text(width / 2, py - 12, result.emoji, { fontSize: '24px', fontFamily: FONTS.body }).setOrigin(0.5)
    );

    this.overlayContainer.add(
      this.add.text(width / 2, py + 16, result.message, {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.text,
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
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: '#2E8B57', resolution: TEXT_RESOLUTION,
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

    const panelW = Math.min(360, width - PAGE_MARGIN * 2);
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
        fontSize: TYPE.body, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.overlayContainer.add(
      this.add.text(width / 2, py - 30, `This animal ${tempText}`, {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    this.overlayContainer.add(
      this.add.text(width / 2, py - 5,
        'What should we do?', {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Approach button
    this.overlayContainer.add(
      createChromeButton(this, width / 2 - 80, py + 40, 'Say hello', () => {
        if (!this.gridState) return;
        const { state, result } = handleAnimalEncounter(this.gridState, npc.id, 'approach');
        this.gridState = state;
        this.overlayContainer.removeAll(true);
        this.showEncounterResult(result);
      }, { width: 130, fontSize: TYPE.caption })
    );

    // Ignore button
    this.overlayContainer.add(
      createChromeButton(this, width / 2 + 80, py + 40, 'Walk past', () => {
        if (!this.gridState) return;
        const { state, result } = handleAnimalEncounter(this.gridState, npc.id, 'ignore');
        this.gridState = state;
        this.overlayContainer.removeAll(true);
        this.showEncounterResult(result);
      }, { width: 130, fontSize: TYPE.caption })
    );
  }

  private showEncounterResult(result: EncounterResult): void {
    const { width } = this.scale;
    const py = this.gridOffsetY - 5;

    this.overlayContainer.removeAll(true);

    const colour = result.happinessChange > 0 ? 0x2E8B57 : result.happinessChange < 0 ? 0xe74c3c : 0x888888;

    this.overlayContainer.add(
      createPanel(this, width / 2, py, Math.min(340, width - PAGE_MARGIN * 2), 70, {
        fillColour: 0xffffff, borderColour: colour, borderWidth: 2, shadow: true,
      })
    );

    this.overlayContainer.add(
      this.add.text(width / 2, py, result.message, {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.text,
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
    this.playerContainer = undefined;

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
          fontSize: `${Math.max(10, this.cellSize * 0.5)}px`, fontFamily: FONTS.body
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
          fontSize: `${Math.max(10, this.cellSize * 0.5)}px`, fontFamily: FONTS.body
        }).setOrigin(0.5)
      );
    }

    // Interacted checkmark (feature tiles only)
    if (tile.interacted && tile.interactable) {
      this.gridContainer.add(
        this.add.text(x + this.cellSize * 0.3, y - this.cellSize * 0.3, '✓', {
          fontSize: `${this.cellSize * 0.3}px`, fontFamily: FONTS.body, color: '#ffffff',
        }).setOrigin(0.5)
      );
    }
  }

  // ── Phase 4: Road Crossing (overlay on top of the grid) ────

  /**
   * Road crossing is an OVERLAY on the live walk grid, not a new scene.
   * The player can still see the road tile and their pet stopped at the kerb,
   * which reinforces the real-world safety lesson visually.
   */
  private showRoadCrossingOverlay(): void {
    if (!this.gridState) return;

    this.cleanupKeys();
    this.overlayContainer.removeAll(true);

    const { width, height } = this.scale;

    // Highlight the road tile the player is about to step onto so the
    // warning feels connected to the grid below it.
    if (this.pendingRoadRow >= 0) {
      const roadTile = this.gridState.map.tiles[this.pendingRoadRow];
      // Flash the whole road row for emphasis — a car would come from the side.
      for (let c = 0; c < this.gridState.map.cols; c++) {
        if (roadTile[c].type === 'road') {
          const { x, y } = this.tileToScreen(this.pendingRoadRow, c);
          const flash = this.add.rectangle(x, y, this.cellSize, this.cellSize, 0xff3333, 0.4);
          this.tweens.add({
            targets: flash,
            alpha: { from: 0.4, to: 0.1 },
            duration: 500, yoyo: true, repeat: -1,
          });
          this.overlayContainer.add(flash);
        }
      }
    }

    // Compact warning strip along the top of the grid — doesn't cover gameplay.
    const stripH = 88;
    const stripY = Math.max(this.gridOffsetY + stripH / 2, stripH / 2 + 4);
    const stripW = Math.min(520, width - 20);

    this.overlayContainer.add(
      createPanel(this, width / 2, stripY, stripW, stripH, {
        fillColour: 0xffecec, borderColour: 0xe74c3c, borderWidth: 3,
        radius: 14, shadow: true,
      })
    );

    this.overlayContainer.add(
      this.add.text(width / 2 - stripW / 2 + 24, stripY, 'STOP!', {
        fontSize: TYPE.title, fontFamily: FONTS.title, fontStyle: 'bold', color: '#c0392b',
      }).setOrigin(0, 0.5)
    );

    this.overlayContainer.add(
      this.add.text(width / 2 - stripW / 2 + 110, stripY - 10,
        `${this.animal.name} is about to cross!`, {
        fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold', color: '#c0392b',
      }).setOrigin(0, 0.5)
    );

    // Timer text beside the button
    this.roadTimeLeft = 3000;
    const timerText = this.add.text(width / 2 - stripW / 2 + 110, stripY + 12,
      'Look both ways… 3.0s', {
      fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: '#c0392b',
    }).setOrigin(0, 0.5);
    this.overlayContainer.add(timerText);

    // STOP button — small, tucked to the right of the strip. The one
    // control in the game with a clock on it: three seconds to look both
    // ways. Filled and in the danger ink, which is what that ink is for —
    // and the word already says STOP, so the colour reinforces rather
    // than carries it.
    const stopBtn = createChromeButton(this, width / 2 + stripW / 2 - 70, stripY, 'STOP', () => {
      if (!this.roadTimer) return;
      this.roadTimer.destroy();
      this.roadTimer = undefined;
      this.handleRoadResult(true);
    }, { width: 110, fontSize: TYPE.lead, variant: 'filled', tone: 'danger' });
    this.overlayContainer.add(stopBtn);

    this.roadTimer = this.time.addEvent({
      delay: 100,
      callback: () => {
        this.roadTimeLeft -= 100;
        timerText.setText(`Look both ways… ${Math.max(0, this.roadTimeLeft / 1000).toFixed(1)}s`);
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

    // Brief result banner as an overlay — grid stays visible underneath.
    this.overlayContainer.removeAll(true);
    const { width } = this.scale;
    const bannerY = Math.max(this.gridOffsetY + 40, 60);
    const bannerW = Math.min(420, width - PAGE_MARGIN * 2);

    this.overlayContainer.add(
      createPanel(this, width / 2, bannerY, bannerW, 64, {
        fillColour: success ? 0xe8f5e9 : 0xffe0e0,
        borderColour: success ? 0x2E8B57 : 0xe74c3c,
        borderWidth: 2, radius: 12, shadow: true,
      })
    );

    this.overlayContainer.add(
      this.add.text(width / 2, bannerY - 10,
        success ? 'Great road safety!' : 'Oops! Stop and look next time!', {
        fontSize: TYPE.body, fontFamily: FONTS.title, fontStyle: 'bold',
        color: success ? '#2E8B57' : '#c0392b',
      }).setOrigin(0.5)
    );

    this.overlayContainer.add(
      this.add.text(width / 2, bannerY + 14,
        success
          ? `${this.animal.name} crossed safely.`
          : `${this.animal.name} needs more practice.`, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: COLOURS.text,
      }).setOrigin(0.5)
    );

    this.time.delayedCall(1400, () => {
      this.overlayContainer.removeAll(true);
      this.phase = 'exploring';
      this.setupKeys();
      // Re-render tiles so the formerly-dangerous road row shows as crossed.
      this.renderExploringGrid();
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
      createChromeTitle(this, width / 2, TITLE_CY,
        rewards.perfectWalk ? 'Perfect Walk!' : 'Walk Complete!', {
        tone: rewards.perfectWalk ? 'success' : 'default', fontSize: TYPE.heading,
      })
    );

    // Zone
    const zone = WALK_ZONES.find((z) => z.zone === this.gridState!.zone);
    this.container.add(
      this.add.text(width / 2, 95, `Walked through the ${zone?.label}`, {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5)
    );

    // Stats panel
    const panelW = Math.min(380, width - PAGE_MARGIN * 2);
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
          fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold', color: COLOURS.text,
        }).setOrigin(0, 0.5)
      );
      this.container.add(
        this.add.text(width / 2 + panelW / 2 - 20, ly, line.value, {
          fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(1, 0.5)
      );
    });

    // Back button
    this.container.add(
      createChromeButton(this, width / 2, height - 90, 'Back to Centre', () => {
        this.registry.set('updatedAnimals', this.allAnimals);
        this.registry.set('walkResult', { perfectWalk: rewards.perfectWalk });
        this.scene.start('GameScene');
      }, { width: 240, fontSize: TYPE.body, icon: 'icon-back', iconStyle: 'glyph', variant: 'filled' })
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
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: '#ffffff', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    this.time.delayedCall(2000, () => {
      this.overlayContainer.removeAll(true);
    });
  }
}
