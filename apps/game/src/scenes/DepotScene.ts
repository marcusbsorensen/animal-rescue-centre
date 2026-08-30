import Phaser from 'phaser';
import { COLOURS, FONTS, TEXT_RESOLUTION, MIN_FONT, MIN_TAP, bottomAnchorY } from '../ui/constants';
import { createButton, createTextButton, createPillTitle } from '../ui/UIButton';
import { AudioManager } from '../audio/AudioManager';
import {
  createBoard,
  findGroup,
  tapCell,
  applyGravity,
  refillBoard,
  activatePowerUp,
  generateGoals,
  getTilesForMode,
  getBoardDimensions,
  canAccessMode,
  generateRewards,
  getSeasonForMonth,
} from '@arc/game-logic';
import type { DepotMode, Tile, BoardState, BoardGoal, PowerUpType, DepotState, Economy } from '@arc/shared-types';
import type { TileDefinition, RewardItem } from '@arc/game-logic';

// ── Colour palette for the depot ─────────────────────────────
const DEPOT_COLOURS = {
  bg: 0x2d1b4e,          // deep purple
  boardBg: 0x1a1030,     // darker purple
  cellBg: 0x3d2a5e,      // cell background
  cellHover: 0x5a3d8a,   // hover state
  headerBg: 0x4a2d7a,    // header bar
  accent: 0xf0c040,      // golden yellow
  text: '#f5e6ff',
  textDim: '#b89dd6',
  green: 0x4adc7b,
  red: 0xe74c3c,
};

// ── Power-up visual config ───────────────────────────────────
const POWER_UP_DISPLAY: Record<PowerUpType, { emoji: string; colour: number }> = {
  rocket: { emoji: 'BOOST', colour: 0xff6b35 },
  bomb:   { emoji: 'BOMB', colour: 0xff4444 },
  rainbow: { emoji: 'WILD', colour: 0xaa55ff },
};

/**
 * DepotScene — The Depot puzzle minigame.
 *
 * Mode selection → tap-to-collapse board → rewards screen.
 * Four modes: Parts & Tools, Treats Kitchen, Decorations, Medical Supplies.
 */
export class DepotScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;
  private phase: 'mode_select' | 'playing' | 'results' = 'mode_select';
  private container!: Phaser.GameObjects.Container;
  private playerLevel = 1;

  // Board state
  private mode?: DepotMode;
  private boardState?: BoardState;
  private tileTypes: string[] = [];
  private tileDefs: TileDefinition[] = [];
  private boardW = 0;
  private boardH = 0;
  private maxMoves = 25;

  // Visual grid
  private cellSize = 0;
  private boardOffsetX = 0;
  private boardOffsetY = 0;
  private cellObjects: (Phaser.GameObjects.Container | null)[][] = [];
  private animating = false;

  // Rewards
  private rewards: RewardItem[] = [];

  constructor() {
    super({ key: 'DepotScene' });
  }

  private depotState?: DepotState;
  private economy: Economy = { coins: 0, lifetimeEarnings: 0 };

  init(data?: { level?: number; depot?: DepotState; economy?: Economy }): void {
    this.playerLevel = data?.level ?? 1;
    this.depotState = data?.depot;
    this.economy = data?.economy ?? { coins: 0, lifetimeEarnings: 0 };
    this.phase = 'mode_select';
    this.mode = undefined;
    this.boardState = undefined;
    this.rewards = [];
    this.animating = false;
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('depot');

    this.container = this.add.container(0, 0);

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
  }

  private clearView(): void {
    this.container.removeAll(true);
    this.cellObjects = [];
  }

  private renderView(): void {
    this.clearView();
    const { width, height } = this.scale;

    // Background
    this.container.add(
      this.add.rectangle(width / 2, height / 2, width, height, DEPOT_COLOURS.bg)
    );

    switch (this.phase) {
      case 'mode_select': this.renderModeSelect(width, height); break;
      case 'playing': this.renderBoard(width, height); break;
      case 'results': this.renderResults(width, height); break;
    }
  }

  // ── Mode Selection ─────────────────────────────────────────

  private renderModeSelect(width: number, height: number): void {
    this.container.add(
      createPillTitle(this, width / 2, 45, 'The Depot', {
        bgColour: DEPOT_COLOURS.headerBg,
        fontSize: '26px',
        icon: 'icon-depot',
      })
    );

    this.container.add(
      this.add.text(width / 2, 85, 'Choose what to build today!', {
        fontSize: '16px', fontFamily: FONTS.body, color: DEPOT_COLOURS.textDim,
      }).setOrigin(0.5)
    );

    // Four cards of 85 at a 105 pitch from y=140 need 500px of height.
    // A landscape phone has 375, so the third card hung 17px off the
    // bottom, under the Back button, and the fourth was off the screen
    // entirely once medical supplies unlocks at level 15. Found by the
    // pairwise pass in e2e/ux-review.spec.ts (L7), not by a person.
    //
    // The band runs from under the subtitle to above the Back button.
    // Landscape has width to spare and no height to spare, so when four
    // rows will not fit they go in two columns of two — the same trade
    // the kitchen makes for its three stacked buttons.
    const bandTop = 105;
    const bandBottom = bottomAnchorY(height) - MIN_TAP / 2 - 12;
    const cardH = 85;
    const rowsFit = Math.floor((bandBottom - bandTop + 20) / (cardH + 20));
    const cols = rowsFit >= 4 ? 1 : 2;
    const rows = Math.ceil(4 / cols);
    const colGap = 16;
    const cardW = cols === 1
      ? Math.min(width - 80, 500)
      : Math.min((width - 80 - colGap) / 2, 400);
    const gridW = cardW * cols + colGap * (cols - 1);
    const gridX = (width - gridW) / 2;
    // Anchored under the subtitle rather than centred in the band, so a
    // tall screen keeps the layout it had; the pitch closes up only as
    // far as it must to land the last row above the Back button. On a
    // landscape phone that is a 12px gap between two rows of two.
    const topGap = 12;
    const availH = bandBottom - bandTop - topGap;
    const rowPitch = rows > 1 ? Math.min(105, (availH - cardH) / (rows - 1)) : 0;
    const firstCy = bandTop + topGap + cardH / 2;

    // Subtle gear/cog pattern background
    const bgPattern = this.add.graphics();
    bgPattern.lineStyle(1, 0xffffff, 0.03);
    for (let gx = 60; gx < width; gx += 120) {
      for (let gy = 30; gy < height; gy += 120) {
        const r = 25 + ((gx + gy) % 3) * 8;
        bgPattern.strokeCircle(gx, gy, r);
        // Teeth
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          const tx = gx + Math.cos(a) * (r + 5);
          const ty = gy + Math.sin(a) * (r + 5);
          bgPattern.strokeRect(tx - 3, ty - 3, 6, 6);
        }
      }
    }
    this.container.add(bgPattern);

    const modes: { mode: DepotMode; colour: number; label: string; desc: string }[] = [
      { mode: 'parts_and_tools', colour: 0xff8c35, label: 'Parts & Tools', desc: 'Fix up the rescue van!' },
      { mode: 'treats_kitchen', colour: 0xd4783c, label: 'Treats Kitchen', desc: 'Bake tasty treats for animals!' },
      { mode: 'decorations', colour: 0x9b59b6, label: 'Decorations', desc: 'Brighten up the centre!' },
      { mode: 'medical_supplies', colour: 0xe74c3c, label: 'Medical Supplies', desc: 'Stock up the vet clinic!' },
    ];

    modes.forEach((m, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cardX = gridX + col * (cardW + colGap);
      const cx = cardX + cardW / 2;
      const y = firstCy + row * rowPitch;
      const unlocked = canAccessMode(m.mode, this.playerLevel);
      const alpha = unlocked ? 1 : 0.4;

      // Card background
      const card = this.add.graphics();
      card.fillStyle(0xffffff, 0.18);
      card.fillRoundedRect(cardX, y - cardH / 2, cardW, cardH, 14);
      if (unlocked) {
        card.lineStyle(2, DEPOT_COLOURS.accent, 0.6);
        card.strokeRoundedRect(cardX, y - cardH / 2, cardW, cardH, 14);
      }
      card.setAlpha(alpha);
      this.container.add(card);

      // Colour icon circle
      this.container.add(
        this.add.circle(cardX + 35, y, 18, m.colour).setAlpha(alpha)
      );

      // Label
      this.container.add(
        this.add.text(cardX + 70, y - 12, m.label, {
          fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold',
          color: unlocked ? DEPOT_COLOURS.text : '#666666',
        }).setOrigin(0, 0.5).setAlpha(alpha)
      );

      // Description
      this.container.add(
        this.add.text(cardX + 70, y + 14, unlocked ? m.desc : `Unlocks at level ${m.mode === 'medical_supplies' ? 15 : 1}`, {
          fontSize: '14px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
          color: unlocked ? DEPOT_COLOURS.textDim : '#555555',
        }).setOrigin(0, 0.5).setAlpha(alpha)
      );

      if (unlocked) {
        // Invisible hit area over the card
        const hitArea = this.add.rectangle(cx, y, cardW, cardH, 0xffffff, 0)
          .setInteractive({ useHandCursor: true });
        hitArea.on('pointerover', () => card.setAlpha(1));
        hitArea.on('pointerout', () => card.setAlpha(alpha));
        hitArea.on('pointerdown', () => this.startMode(m.mode));
        this.container.add(hitArea);
      }
    });

    // Board size preview (shows dims for each mode as subtitle)
    this.container.add(
      createTextButton(this, width / 2, bottomAnchorY(height),
        '← Back to centre', () => {
          this.scene.start('GameScene');
        })
    );
  }

  // ── Start a Depot Session ──────────────────────────────────

  private startMode(mode: DepotMode): void {
    this.mode = mode;
    const dims = getBoardDimensions(mode);
    this.boardW = dims.width;
    this.boardH = dims.height;

    // Get tile types for this mode (season-aware for decorations)
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const season = getSeasonForMonth(currentMonth);
    this.tileDefs = getTilesForMode(mode, season);
    this.tileTypes = this.tileDefs.map((t) => t.type);

    // Create the board
    const grid = createBoard(this.boardW, this.boardH, this.tileTypes);
    this.maxMoves = mode === 'medical_supplies' ? 20 : 25;
    const goals = generateGoals(mode, 3); // difficulty 3 for now

    this.boardState = {
      grid,
      rows: this.boardH,
      cols: this.boardW,
      mode,
      moves: 0,
      score: 0,
      goals,
      isComplete: false,
      startedAt: new Date().toISOString(),
    };

    this.phase = 'playing';
    this.renderView();
  }

  // ── Board Rendering ────────────────────────────────────────

  private renderBoard(width: number, height: number): void {
    if (!this.mode) return;

    // Header with mode name + stats
    const headerH = 55;
    this.container.add(
      this.add.rectangle(width / 2, headerH / 2, width, headerH, DEPOT_COLOURS.headerBg)
    );

    const modeLabels: Record<DepotMode, string> = {
      parts_and_tools: 'Parts & Tools',
      treats_kitchen: 'Treats Kitchen',
      decorations: 'Decorations',
      medical_supplies: 'Medical',
    };

    this.container.add(
      this.add.text(15, headerH / 2, modeLabels[this.mode], {
        fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold',
        color: DEPOT_COLOURS.text,
      }).setOrigin(0, 0.5)
    );

    // Score
    this.container.add(
      this.add.text(width - 15, headerH / 2 - 10, `Score: ${this.boardState?.score ?? 0}`, {
        fontSize: '16px', fontFamily: FONTS.body, color: '#f0c040',
      }).setOrigin(1, 0.5)
    );

    // Moves remaining
    const movesLeft = this.maxMoves - (this.boardState?.moves ?? 0);
    this.container.add(
      this.add.text(width - 15, headerH / 2 + 12, `Moves: ${movesLeft}`, {
        fontSize: '14px', fontFamily: FONTS.body, color: DEPOT_COLOURS.textDim, resolution: TEXT_RESOLUTION,
      }).setOrigin(1, 0.5)
    );

    // Goals bar — positioned below header with room for label above + hint below
    const goalsY = headerH + 50;
    this.renderGoals(width, goalsY);

    // Calculate cell sizing to fit the board (goals card H=58, hint ~15, pad)
    const boardAreaTop = goalsY + 60;
    const boardAreaBottom = height - 50;
    const boardAreaH = boardAreaBottom - boardAreaTop;
    const boardAreaW = width - 20;

    this.cellSize = Math.floor(Math.min(
      boardAreaW / this.boardW,
      boardAreaH / this.boardH
    ));
    // Cap cell size for readability
    this.cellSize = Math.min(this.cellSize, 60);

    const totalW = this.cellSize * this.boardW;
    const totalH = this.cellSize * this.boardH;
    this.boardOffsetX = (width - totalW) / 2;
    this.boardOffsetY = boardAreaTop + (boardAreaH - totalH) / 2;

    // Board background
    const boardBg = this.add.graphics();
    boardBg.fillStyle(DEPOT_COLOURS.boardBg, 1);
    boardBg.fillRoundedRect(
      this.boardOffsetX - 4, this.boardOffsetY - 4,
      totalW + 8, totalH + 8, 8
    );
    this.container.add(boardBg);

    // Render all cells
    this.cellObjects = [];
    for (let r = 0; r < this.boardH; r++) {
      this.cellObjects[r] = [];
      for (let c = 0; c < this.boardW; c++) {
        this.cellObjects[r][c] = this.createCell(r, c);
      }
    }

    // Quit button
    this.container.add(
      createTextButton(this, width / 2, bottomAnchorY(height),
        'Leave Depot', () => {
          this.phase = 'results';
          this.renderView();
        })
    );
  }

  private renderGoals(width: number, y: number): void {
    if (!this.boardState) return;
    const goals = this.boardState.goals;
    const goalCount = goals.length;

    // "MATCH THESE:" label above the target cards
    this.container.add(
      this.add.text(width / 2, y - 30, 'MATCH THESE:', {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
        color: '#f0c040', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    const cardW = 72;
    const cardH = 58;
    const spacing = Math.min(90, (width - 40) / goalCount);
    const startX = width / 2 - ((goalCount - 1) * spacing) / 2;

    goals.forEach((goal, i) => {
      const x = startX + i * spacing;
      const def = this.tileDefs.find((t) => t.type === goal.targetTile);
      const done = goal.currentCount >= goal.targetCount;
      const emoji = def?.emoji ?? '';
      const progress = `${Math.min(goal.currentCount, goal.targetCount)}/${goal.targetCount}`;

      // Card background — makes the target icon unmistakable
      const card = this.add.graphics();
      card.fillStyle(done ? 0x27ae60 : 0xffffff, done ? 0.25 : 0.1);
      card.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
      card.lineStyle(2, done ? 0x27ae60 : 0xf0c040, done ? 1 : 0.7);
      card.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
      this.container.add(card);

      if (emoji) {
        this.container.add(
          this.add.text(x, y - 10, emoji, {
            fontSize: '34px',
          }).setOrigin(0.5)
        );
      } else {
        this.container.add(this.add.circle(x, y - 10, 16, 0x9b59b6));
      }

      this.container.add(
        this.add.text(x, y + 18, progress, {
          fontSize: '15px', fontFamily: FONTS.body, fontStyle: 'bold',
          resolution: TEXT_RESOLUTION,
          color: done ? '#4adc7b' : '#ffffff',
        }).setOrigin(0.5)
      );
    });

    // "How to play" hint beneath the cards (only while playing, not overwhelming)
    this.container.add(
      this.add.text(width / 2, y + cardH / 2 + 14,
        'Tap a group of 2+ matching tiles to collapse them.', {
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: DEPOT_COLOURS.textDim,
          resolution: TEXT_RESOLUTION, fontStyle: 'italic',
        }).setOrigin(0.5)
    );
  }

  private createCell(row: number, col: number): Phaser.GameObjects.Container | null {
    const tile = this.boardState?.grid[row]?.[col];
    if (!tile) return null;

    const x = this.boardOffsetX + col * this.cellSize + this.cellSize / 2;
    const y = this.boardOffsetY + row * this.cellSize + this.cellSize / 2;
    const pad = 2;
    const size = this.cellSize - pad * 2;

    // Cell background
    const bg = this.add.graphics();
    bg.fillStyle(DEPOT_COLOURS.cellBg, 1);
    bg.fillRoundedRect(-size / 2, -size / 2, size, size, 6);

    // Power-up glow
    if (tile.powerUp) {
      const puInfo = POWER_UP_DISPLAY[tile.powerUp];
      bg.lineStyle(2, puInfo.colour, 0.8);
      bg.strokeRoundedRect(-size / 2, -size / 2, size, size, 6);
    }

    // Tile emoji
    const def = this.tileDefs.find((t) => t.type === tile.type);
    const displayText = tile.powerUp
      ? POWER_UP_DISPLAY[tile.powerUp].emoji
      : (def?.emoji ?? '');

    const fontSize = Math.max(14, Math.min(this.cellSize - 14, 28));
    const emoji = this.add.text(0, 0, displayText, {
      fontSize: `${fontSize}px`,
    }).setOrigin(0.5);

    const cellContainer = this.add.container(x, y, [bg, emoji]);
    this.container.add(cellContainer);

    // Interactive — tap to collapse
    const hitArea = this.add.rectangle(0, 0, size, size, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    cellContainer.add(hitArea);

    hitArea.on('pointerover', () => {
      if (this.animating || !this.boardState) return;
      // Highlight entire connected group
      const group = findGroup(this.boardState.grid, row, col);
      if (group.length >= 2) {
        for (const g of group) {
          const cell = this.cellObjects[g.row]?.[g.col];
          if (cell) {
            cell.setScale(1.08);
            const cellBg = cell.first as Phaser.GameObjects.Graphics;
            if (cellBg) {
              cellBg.clear();
              cellBg.fillStyle(DEPOT_COLOURS.cellHover, 1);
              cellBg.fillRoundedRect(-size / 2, -size / 2, size, size, 6);
              cellBg.lineStyle(1.5, DEPOT_COLOURS.accent, 0.5);
              cellBg.strokeRoundedRect(-size / 2, -size / 2, size, size, 6);
            }
          }
        }
      }
    });

    hitArea.on('pointerout', () => {
      if (!this.boardState) return;
      const group = findGroup(this.boardState.grid, row, col);
      for (const g of group) {
        const cell = this.cellObjects[g.row]?.[g.col];
        if (cell) {
          cell.setScale(1);
          const cellBg = cell.first as Phaser.GameObjects.Graphics;
          const t = this.boardState.grid[g.row]?.[g.col];
          if (cellBg && t) {
            cellBg.clear();
            cellBg.fillStyle(DEPOT_COLOURS.cellBg, 1);
            cellBg.fillRoundedRect(-size / 2, -size / 2, size, size, 6);
            if (t.powerUp) {
              const puInfo = POWER_UP_DISPLAY[t.powerUp];
              cellBg.lineStyle(2, puInfo.colour, 0.8);
              cellBg.strokeRoundedRect(-size / 2, -size / 2, size, size, 6);
            }
          }
        }
      }
    });

    hitArea.on('pointerdown', () => {
      if (this.animating) return;
      this.handleTap(row, col);
    });

    return cellContainer;
  }

  // ── Tap Handler ────────────────────────────────────────────

  private handleTap(row: number, col: number): void {
    if (!this.boardState || this.animating) return;
    const tile = this.boardState.grid[row]?.[col];
    if (!tile) return;

    const { width } = this.scale;

    // Power-up activation
    if (tile.powerUp) {
      this.animating = true;
      const result = activatePowerUp(this.boardState.grid, row, col);
      let grid = applyGravity(result.grid);
      grid = refillBoard(grid, this.tileTypes);
      const scoreIncrease = result.tilesRemoved * 15;

      // Animate the power-up cell popping out
      this.animateCellsRemoved([{ row, col }], () => {
        this.boardState = {
          ...this.boardState!,
          grid,
          moves: this.boardState!.moves + 1,
          score: this.boardState!.score + scoreIncrease,
        };
        this.showScorePopup(row, col, scoreIncrease, 'BOOST!');
        this.checkEndCondition();
        this.animating = false;
        this.renderView();
      });

      AudioManager.getInstance().playSfx('power_up_activate');
      this.cameras.main.shake(150, 0.008);
      return;
    }

    // Regular tap — need group of 2+
    const group = findGroup(this.boardState.grid, row, col);
    if (group.length < 2) {
      // Shake the tapped cell to indicate "can't collapse this"
      const cell = this.cellObjects[row]?.[col];
      if (cell) {
        this.tweens.add({
          targets: cell, x: cell.x - 3, duration: 40,
          yoyo: true, repeat: 2,
        });
      }
      return;
    }

    this.animating = true;

    // Animate the group collapsing
    this.animateCellsRemoved(group, () => {
      // tapCell handles gravity, refill, goals, scoring internally
      const result = tapCell(this.boardState!, row, col, this.tileTypes);
      const scoreDelta = result.board.score - this.boardState!.score;
      this.boardState = result.board;

      // Score popup
      const sizeLabel = group.length >= 7 ? 'HUGE!' : group.length >= 5 ? 'BIG!' : '';
      this.showScorePopup(row, col, scoreDelta, sizeLabel);

      // SFX
      if (result.powerUpCreated) {
        AudioManager.getInstance().playSfx('power_up_create');
      } else if (group.length >= 5) {
        AudioManager.getInstance().playSfx('chain_reaction');
        this.cameras.main.shake(100, 0.004);
      } else {
        AudioManager.getInstance().playSfx('tile_collapse');
      }

      this.checkEndCondition();
      this.animating = false;
      this.renderView();
    });
  }

  /**
   * Animate cells shrinking and popping before removal.
   */
  private animateCellsRemoved(cells: { row: number; col: number }[], onComplete: () => void): void {
    let completed = 0;
    const total = cells.length;

    if (total === 0) {
      onComplete();
      return;
    }

    cells.forEach((pos, i) => {
      const r = pos.row;
      const c = pos.col;
      const cell = this.cellObjects[r]?.[c];
      if (cell) {
        this.tweens.add({
          targets: cell,
          scaleX: 0.1, scaleY: 0.1, alpha: 0,
          rotation: (Math.random() - 0.5) * 0.5,
          duration: 180,
          delay: i * 15, // staggered
          ease: 'Back.easeIn',
          onComplete: () => {
            completed++;
            if (completed >= total) {
              onComplete();
            }
          },
        });
      } else {
        completed++;
        if (completed >= total) onComplete();
      }
    });
  }

  /**
   * Show a floating score popup at a cell position.
   */
  private showScorePopup(row: number, col: number, score: number, extra: string): void {
    if (score <= 0) return;
    const x = this.boardOffsetX + col * this.cellSize + this.cellSize / 2;
    const y = this.boardOffsetY + row * this.cellSize;

    const text = `+${score} ${extra}`.trim();
    const popup = this.add.text(x, y, text, {
      fontSize: extra ? '18px' : '15px',
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: extra ? '#f0c040' : '#ffffff',
      shadow: { offsetX: 0, offsetY: 0, color: '#f0c040', blur: 6, fill: true },
    }).setOrigin(0.5);
    this.container.add(popup);

    this.tweens.add({
      targets: popup,
      y: y - 40, alpha: 0, scale: 1.3,
      duration: 700,
      ease: 'Sine.easeOut',
      onComplete: () => popup.destroy(),
    });
  }

  private checkEndCondition(): void {
    if (!this.boardState) return;
    const allGoalsMet = this.boardState.isComplete || this.boardState.goals.every((g) => g.currentCount >= g.targetCount);
    if (allGoalsMet || this.boardState.moves >= this.maxMoves) {
      // Small delay before showing results
      this.time.delayedCall(300, () => {
        AudioManager.getInstance().playSfx('depot_complete');
        this.rewards = generateRewards(this.mode!, this.boardState!.score, this.boardState!.goals);
        // Track session in depot state and publish updates via registry
        if (this.depotState) {
          this.depotState.sessionsRemainingToday = Math.max(0, this.depotState.sessionsRemainingToday - 1);
          this.depotState.totalSessionsPlayed += 1;
          this.registry.set('updatedDepot', { ...this.depotState });
        }
        this.phase = 'results';
        this.renderView();
      });
    }
  }

  // ── Results Screen ─────────────────────────────────────────

  private renderResults(width: number, height: number): void {
    const goals = this.boardState?.goals ?? [];
    const allGoalsMet = goals.every((g) => g.currentCount >= g.targetCount);

    // Title
    this.container.add(
      createPillTitle(this, width / 2, 50,
        allGoalsMet ? 'Session Complete!' : 'Out of Moves!', {
        bgColour: allGoalsMet ? DEPOT_COLOURS.green : DEPOT_COLOURS.headerBg,
        fontSize: '24px',
      })
    );

    // Score summary
    this.container.add(
      this.add.text(width / 2, 100, `Score: ${this.boardState?.score ?? 0}`, {
        fontSize: '22px', fontFamily: FONTS.title, color: '#f0c040',
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, 130, `Moves used: ${this.boardState?.moves ?? 0} / ${this.maxMoves}`, {
        fontSize: '14px', fontFamily: FONTS.body, color: DEPOT_COLOURS.textDim,
      }).setOrigin(0.5)
    );

    // Goals summary — show each target as a card with status badge + big icon
    const goalY = 175;
    const rowH = 52;
    goals.forEach((goal, i) => {
      const done = goal.currentCount >= goal.targetCount;
      const def = this.tileDefs.find((t) => t.type === goal.targetTile);
      const cy = goalY + i * rowH;
      const rowW = 240;

      // Row pill background
      const row = this.add.graphics();
      row.fillStyle(done ? 0x27ae60 : 0xe74c3c, 0.18);
      row.fillRoundedRect(width / 2 - rowW / 2, cy - 22, rowW, 44, 22);
      this.container.add(row);

      // Status circle
      const statusCircle = this.add.circle(width / 2 - rowW / 2 + 22, cy, 14,
        done ? 0x27ae60 : 0xe74c3c);
      this.container.add(statusCircle);
      this.container.add(
        this.add.text(width / 2 - rowW / 2 + 22, cy, done ? '✓' : '×', {
          fontSize: '20px', fontFamily: FONTS.body, fontStyle: 'bold',
          color: '#ffffff', resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
      );

      // Big target emoji
      this.container.add(
        this.add.text(width / 2 - 10, cy, def?.emoji ?? '', {
          fontSize: '28px',
        }).setOrigin(0.5)
      );

      // Progress label
      this.container.add(
        this.add.text(width / 2 + rowW / 2 - 22, cy,
          `${goal.currentCount}/${goal.targetCount}`, {
          fontSize: '17px', fontFamily: FONTS.body, fontStyle: 'bold',
          color: done ? '#4adc7b' : '#ffcfcf', resolution: TEXT_RESOLUTION,
        }).setOrigin(1, 0.5)
      );
    });

    // Rewards
    if (this.rewards.length > 0) {
      const rewardsY = goalY + goals.length * 25 + 30;
      this.container.add(
        this.add.text(width / 2, rewardsY, 'Rewards:', {
          fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold',
          color: DEPOT_COLOURS.text,
        }).setOrigin(0.5)
      );

      const cols = Math.min(this.rewards.length, 4);
      const spacing = Math.min(80, (width - 80) / cols);
      const startX = width / 2 - ((cols - 1) * spacing) / 2;

      this.rewards.forEach((reward, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const rx = startX + col * spacing;
        const ry = rewardsY + 40 + row * 70;

        // Reward card
        const cardGfx = this.add.graphics();
        cardGfx.fillStyle(0xffffff, 0.1);
        cardGfx.fillRoundedRect(rx - 30, ry - 20, 60, 58, 8);
        this.container.add(cardGfx);

        this.container.add(
          this.add.text(rx, ry, reward.emoji, {
            fontSize: '28px',
          }).setOrigin(0.5)
        );

        this.container.add(
          this.add.text(rx, ry + 28, reward.label, {
            fontSize: '14px', fontFamily: FONTS.body, color: DEPOT_COLOURS.textDim, resolution: TEXT_RESOLUTION,
            align: 'center', wordWrap: { width: 60 },
          }).setOrigin(0.5, 0)
        );
      });
    }

    // Star burst for completed sessions
    if (allGoalsMet) {
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const star = this.add.circle(
          width / 2 + Math.cos(angle) * 90,
          50 + Math.sin(angle) * 30,
          6, 0xf0c040
        ).setAlpha(0);
        this.container.add(star);
        this.tweens.add({
          targets: star,
          alpha: 1, scale: { from: 0.3, to: 1.2 },
          duration: 400, delay: i * 80,
          yoyo: true, repeat: -1, hold: 600,
        });
      }
    }

    // Buttons
    this.container.add(
      createButton(this, width / 2, height - 85, 'Play Again', () => {
        this.phase = 'mode_select';
        this.renderView();
      }, { width: 200, bgColour: '#4a2d7a' })
    );

    this.container.add(
      createButton(this, width / 2, height - 35, 'Back to Centre', () => {
        this.scene.start('GameScene');
      }, { width: 200, icon: 'icon-back' })
    );
  }
}
