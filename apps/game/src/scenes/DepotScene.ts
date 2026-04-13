import Phaser from 'phaser';
import { COLOURS, FONTS } from '../ui/constants';
import { createButton, createTextButton, createPillTitle } from '../ui/UIButton';
import { AudioManager } from '../audio/AudioManager';
import {
  createBoard,
  findGroup,
  tapCell,
  applyGravity,
  refillBoard,
  activatePowerUp,
  checkGoals,
  generateGoals,
  getTilesForMode,
  getBoardDimensions,
  canAccessMode,
  generateRewards,
  getSessionLimit,
  getCurrentSeason,
  createCalendarState,
} from '@arc/game-logic';
import type { DepotMode, Tile, BoardGoal, PowerUpType } from '@arc/shared-types';
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
  rocket: { emoji: '🚀', colour: 0xff6b35 },
  bomb:   { emoji: '💣', colour: 0xff4444 },
  rainbow: { emoji: '🌈', colour: 0xaa55ff },
};

/**
 * DepotScene — The Depot puzzle minigame.
 *
 * Mode selection → tap-to-collapse board → rewards screen.
 * Four modes: Parts & Tools, Treats Kitchen, Decorations, Medical Supplies.
 */
export class DepotScene extends Phaser.Scene {
  private phase: 'mode_select' | 'playing' | 'results' = 'mode_select';
  private container!: Phaser.GameObjects.Container;
  private playerLevel = 1;

  // Board state
  private mode?: DepotMode;
  private grid: (Tile | null)[][] = [];
  private tileTypes: string[] = [];
  private tileDefs: TileDefinition[] = [];
  private boardW = 0;
  private boardH = 0;
  private moves = 0;
  private score = 0;
  private goals: BoardGoal[] = [];
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

  init(data?: { level?: number }): void {
    this.playerLevel = data?.level ?? 1;
    this.phase = 'mode_select';
    this.mode = undefined;
    this.grid = [];
    this.moves = 0;
    this.score = 0;
    this.goals = [];
    this.rewards = [];
    this.animating = false;
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('depot');

    this.container = this.add.container(0, 0);
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
      createPillTitle(this, width / 2, 45, '🏗️ The Depot', {
        bgColour: DEPOT_COLOURS.headerBg,
        fontSize: '26px',
      })
    );

    this.container.add(
      this.add.text(width / 2, 85, 'Choose what to build today!', {
        fontSize: '16px', fontFamily: FONTS.body, color: DEPOT_COLOURS.textDim,
      }).setOrigin(0.5)
    );

    const modes: { mode: DepotMode; emoji: string; label: string; desc: string }[] = [
      { mode: 'parts_and_tools', emoji: '🔧', label: 'Parts & Tools', desc: 'Fix up the rescue van!' },
      { mode: 'treats_kitchen', emoji: '🍪', label: 'Treats Kitchen', desc: 'Bake tasty treats for animals!' },
      { mode: 'decorations', emoji: '🎨', label: 'Decorations', desc: 'Brighten up the centre!' },
      { mode: 'medical_supplies', emoji: '🩹', label: 'Medical Supplies', desc: 'Stock up the vet clinic!' },
    ];

    modes.forEach((m, i) => {
      const y = 140 + i * 105;
      const unlocked = canAccessMode(m.mode, this.playerLevel);
      const alpha = unlocked ? 1 : 0.4;

      // Card background
      const card = this.add.graphics();
      card.fillStyle(0xffffff, 0.08);
      card.fillRoundedRect(40, y - 35, width - 80, 85, 14);
      if (unlocked) {
        card.lineStyle(2, DEPOT_COLOURS.accent, 0.3);
        card.strokeRoundedRect(40, y - 35, width - 80, 85, 14);
      }
      card.setAlpha(alpha);
      this.container.add(card);

      // Emoji
      this.container.add(
        this.add.text(75, y, m.emoji, {
          fontSize: '36px',
        }).setOrigin(0.5).setAlpha(alpha)
      );

      // Label
      this.container.add(
        this.add.text(110, y - 12, m.label, {
          fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold',
          color: unlocked ? DEPOT_COLOURS.text : '#666666',
        }).setOrigin(0, 0.5).setAlpha(alpha)
      );

      // Description
      this.container.add(
        this.add.text(110, y + 14, unlocked ? m.desc : `Unlocks at level ${m.mode === 'medical_supplies' ? 15 : 1}`, {
          fontSize: '13px', fontFamily: FONTS.body,
          color: unlocked ? DEPOT_COLOURS.textDim : '#555555',
        }).setOrigin(0, 0.5).setAlpha(alpha)
      );

      if (unlocked) {
        // Invisible hit area over the card
        const hitArea = this.add.rectangle(width / 2, y, width - 80, 85, 0xffffff, 0)
          .setInteractive({ useHandCursor: true });
        hitArea.on('pointerover', () => card.setAlpha(1));
        hitArea.on('pointerout', () => card.setAlpha(alpha));
        hitArea.on('pointerdown', () => this.startMode(m.mode));
        this.container.add(hitArea);
      }
    });

    // Board size preview (shows dims for each mode as subtitle)
    this.container.add(
      createTextButton(this, width / 2, height - 35,
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

    // Get tile types for this mode
    const calendarState = createCalendarState();
    const season = getCurrentSeason(calendarState);
    this.tileDefs = getTilesForMode(mode, season);
    this.tileTypes = this.tileDefs.map((t) => t.type);

    // Create the board
    this.grid = createBoard(this.boardW, this.boardH, this.tileTypes);
    this.moves = 0;
    this.score = 0;
    this.maxMoves = mode === 'medical_supplies' ? 20 : 25;
    this.goals = generateGoals(this.tileTypes, mode);

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
      parts_and_tools: '🔧 Parts & Tools',
      treats_kitchen: '🍪 Treats Kitchen',
      decorations: '🎨 Decorations',
      medical_supplies: '🩹 Medical',
    };

    this.container.add(
      this.add.text(15, headerH / 2, modeLabels[this.mode], {
        fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold',
        color: DEPOT_COLOURS.text,
      }).setOrigin(0, 0.5)
    );

    // Score
    this.container.add(
      this.add.text(width - 15, headerH / 2 - 10, `⭐ ${this.score}`, {
        fontSize: '16px', fontFamily: FONTS.body, color: '#f0c040',
      }).setOrigin(1, 0.5)
    );

    // Moves remaining
    this.container.add(
      this.add.text(width - 15, headerH / 2 + 12, `Moves: ${this.maxMoves - this.moves}`, {
        fontSize: '13px', fontFamily: FONTS.body, color: DEPOT_COLOURS.textDim,
      }).setOrigin(1, 0.5)
    );

    // Goals bar
    const goalsY = headerH + 28;
    this.renderGoals(width, goalsY);

    // Calculate cell sizing to fit the board
    const boardAreaTop = goalsY + 35;
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
      createTextButton(this, width / 2, height - 22,
        '🚪 Leave Depot', () => {
          this.phase = 'results';
          this.renderView();
        })
    );
  }

  private renderGoals(width: number, y: number): void {
    const goalCount = this.goals.length;
    const spacing = Math.min(120, (width - 40) / goalCount);
    const startX = width / 2 - ((goalCount - 1) * spacing) / 2;

    this.goals.forEach((goal, i) => {
      const x = startX + i * spacing;
      const def = this.tileDefs.find((t) => t.type === goal.targetTile);
      const done = goal.currentCount >= goal.targetCount;

      const emoji = def?.emoji ?? '⬜';
      const progress = `${Math.min(goal.currentCount, goal.targetCount)}/${goal.targetCount}`;

      this.container.add(
        this.add.text(x, y - 6, emoji, {
          fontSize: '18px',
        }).setOrigin(0.5)
      );

      this.container.add(
        this.add.text(x, y + 14, progress, {
          fontSize: '12px', fontFamily: FONTS.body,
          color: done ? '#4adc7b' : DEPOT_COLOURS.textDim,
          fontStyle: done ? 'bold' : 'normal',
        }).setOrigin(0.5)
      );
    });
  }

  private createCell(row: number, col: number): Phaser.GameObjects.Container | null {
    const tile = this.grid[row]?.[col];
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
      : (def?.emoji ?? '⬜');

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
      if (this.animating) return;
      // Highlight group
      const group = findGroup(this.grid, row, col);
      if (group.length >= 2) {
        bg.clear();
        bg.fillStyle(DEPOT_COLOURS.cellHover, 1);
        bg.fillRoundedRect(-size / 2, -size / 2, size, size, 6);
      }
    });

    hitArea.on('pointerout', () => {
      if (!tile) return;
      bg.clear();
      bg.fillStyle(DEPOT_COLOURS.cellBg, 1);
      bg.fillRoundedRect(-size / 2, -size / 2, size, size, 6);
      if (tile.powerUp) {
        const puInfo = POWER_UP_DISPLAY[tile.powerUp];
        bg.lineStyle(2, puInfo.colour, 0.8);
        bg.strokeRoundedRect(-size / 2, -size / 2, size, size, 6);
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
    const tile = this.grid[row]?.[col];
    if (!tile) return;

    // Power-up activation
    if (tile.powerUp) {
      const result = activatePowerUp(this.grid, row, col, this.tileTypes);
      this.grid = result.grid;
      this.score += result.tilesDestroyed * 15;
      this.moves++;
      this.updateGoals(result.tilesDestroyed, tile.type);

      AudioManager.getInstance().playSfx('power_up_activate');

      // Apply gravity + refill
      this.grid = applyGravity(this.grid);
      this.grid = refillBoard(this.grid, this.tileTypes);
      this.checkEndCondition();
      this.renderView();
      return;
    }

    // Regular tap — need group of 2+
    const group = findGroup(this.grid, row, col);
    if (group.length < 2) return;

    const result = tapCell(this.grid, row, col, this.tileTypes);
    this.grid = result.grid;
    this.score += result.scoreGained;
    this.moves++;

    // Update goal progress
    this.updateGoals(group.length, tile.type);

    // SFX
    if (result.powerUpCreated) {
      AudioManager.getInstance().playSfx('power_up_create');
    } else if (group.length >= 5) {
      AudioManager.getInstance().playSfx('chain_reaction');
    } else {
      AudioManager.getInstance().playSfx('tile_collapse');
    }

    // Apply gravity + refill
    this.grid = applyGravity(this.grid);
    this.grid = refillBoard(this.grid, this.tileTypes);

    this.checkEndCondition();
    this.renderView();
  }

  private updateGoals(tilesCleared: number, tileType: string): void {
    for (const goal of this.goals) {
      if (goal.type === 'clear_count') {
        goal.currentCount += tilesCleared;
      } else if (goal.type === 'collect_type' && goal.targetTile === tileType) {
        goal.currentCount += tilesCleared;
      }
    }
  }

  private checkEndCondition(): void {
    const allGoalsMet = this.goals.every((g) => g.currentCount >= g.targetCount);
    if (allGoalsMet || this.moves >= this.maxMoves) {
      // Small delay before showing results
      this.time.delayedCall(300, () => {
        AudioManager.getInstance().playSfx('depot_complete');
        this.rewards = generateRewards(this.mode!, this.score, this.goals);
        this.phase = 'results';
        this.renderView();
      });
    }
  }

  // ── Results Screen ─────────────────────────────────────────

  private renderResults(width: number, height: number): void {
    const allGoalsMet = this.goals.every((g) => g.currentCount >= g.targetCount);

    // Title
    this.container.add(
      createPillTitle(this, width / 2, 50,
        allGoalsMet ? '🌟 Session Complete!' : '⏱️ Out of Moves!', {
        bgColour: allGoalsMet ? DEPOT_COLOURS.green : DEPOT_COLOURS.headerBg,
        fontSize: '24px',
      })
    );

    // Score summary
    this.container.add(
      this.add.text(width / 2, 100, `Score: ${this.score} ⭐`, {
        fontSize: '22px', fontFamily: FONTS.title, color: '#f0c040',
      }).setOrigin(0.5)
    );

    this.container.add(
      this.add.text(width / 2, 130, `Moves used: ${this.moves} / ${this.maxMoves}`, {
        fontSize: '14px', fontFamily: FONTS.body, color: DEPOT_COLOURS.textDim,
      }).setOrigin(0.5)
    );

    // Goals summary
    const goalY = 165;
    this.goals.forEach((goal, i) => {
      const done = goal.currentCount >= goal.targetCount;
      const def = this.tileDefs.find((t) => t.type === goal.targetTile);
      this.container.add(
        this.add.text(width / 2, goalY + i * 25,
          `${done ? '✅' : '❌'} ${def?.emoji ?? ''} ${goal.currentCount}/${goal.targetCount}`, {
          fontSize: '15px', fontFamily: FONTS.body,
          color: done ? '#4adc7b' : '#e74c3c',
        }).setOrigin(0.5)
      );
    });

    // Rewards
    if (this.rewards.length > 0) {
      const rewardsY = goalY + this.goals.length * 25 + 30;
      this.container.add(
        this.add.text(width / 2, rewardsY, '🎁 Rewards:', {
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
            fontSize: '10px', fontFamily: FONTS.body, color: DEPOT_COLOURS.textDim,
            align: 'center', wordWrap: { width: 60 },
          }).setOrigin(0.5, 0)
        );
      });
    }

    // Star burst for completed sessions
    if (allGoalsMet) {
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const star = this.add.text(
          width / 2 + Math.cos(angle) * 90,
          50 + Math.sin(angle) * 30,
          '✨', { fontSize: '20px' }
        ).setOrigin(0.5).setAlpha(0);
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
      createButton(this, width / 2, height - 85, '🔄 Play Again', () => {
        this.phase = 'mode_select';
        this.renderView();
      }, { width: 200, bgColour: '#4a2d7a' })
    );

    this.container.add(
      createButton(this, width / 2, height - 35, '✅ Back to Centre', () => {
        this.scene.start('GameScene');
      }, { width: 200 })
    );
  }
}
