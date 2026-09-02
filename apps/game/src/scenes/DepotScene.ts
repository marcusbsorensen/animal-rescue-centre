import Phaser from 'phaser';
import {
  COLOURS, FONTS, TEXT_RESOLUTION, MIN_FONT, MIN_TAP, bottomAnchorY, CHROME, hexNum,
} from '../ui/constants';
import {
  createChromeButton, createTextButton, createChromeTitle, createChromePlate,
} from '../ui/UIButton';
import { useRetinaText } from '../ui/retina-text';
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
/**
 * The Depot's palette — a workbench, not a nightclub.
 *
 * This screen used to be deep purple and near-black with a golden accent:
 * a *fourth* visual language, after the painted world, the chrome surface
 * and the old glass HUD. It read fine on its own and badly next to
 * anything else, and a child walks here from a cream corridor.
 *
 * So it is the game's own colours now. The browns are sampled from the
 * corridor art rather than invented — `#b77e4e` is its floor and `#f5e1be`
 * the light panels on its doors — which is what makes this a room in the
 * same building rather than a warmer version of the old screen.
 *
 * The board is wood and the tiles sit on light panels, so the emoji that
 * are the actual game read the same way they did on the purple. Everything
 * that floats above the board is chrome and comes from `CHROME`.
 */
const DEPOT_COLOURS = {
  /** The cream every other screen in the game starts from. */
  bg: hexNum(COLOURS.bg),
  /** The corridor's floor: the bench you are building on. */
  boardBg: 0xb77e4e,
  /** The corridor doors' light panels: a tile to put a thing on. */
  cellBg: 0xf5e1be,
  /** One step brighter than a resting cell, so hover reads as lifted. */
  cellHover: hexNum(COLOURS.bg),
  /**
   * A chrome-weight bar, not a dark one. The header carries the mode name
   * and the score in the same ink as everything else in the game, which is
   * only possible if it stays light.
   */
  headerBg: hexNum(COLOURS.bgDark),
  /** The brand orange, where the golden yellow was. */
  accent: hexNum(COLOURS.warm),
  text: COLOURS.text,
  textDim: COLOURS.textLight,
  green: hexNum(COLOURS.primaryDark),
  red: hexNum(COLOURS.accent),
};

// ── Power-up visual config ───────────────────────────────────
const POWER_UP_DISPLAY: Record<PowerUpType, { emoji: string; colour: number }> = {
  rocket: { emoji: 'BOOST', colour: hexNum(COLOURS.warm) },
  bomb:   { emoji: 'BOMB', colour: hexNum(COLOURS.accent) },
  rainbow: { emoji: 'WILD', colour: hexNum(COLOURS.info) },
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
    // Most styles here set a resolution; five did not.
    useRetinaText(this);

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
      createChromeTitle(this, width / 2, 45, 'The Depot', {
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
    // Cogs, at the same weight they had on the purple — the ink changes
    // side because the ground did.
    const bgPattern = this.add.graphics();
    bgPattern.lineStyle(1, hexNum(COLOURS.text), 0.05);
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
      // Four hues, one per mode, and they have to be four — `warm` and
      // `warmDark` are two shades of the same orange and read as the same
      // dot at 18px. The labels are what a child reads; these only need to
      // be telling apart at a glance, which near-identical browns are not.
      { mode: 'parts_and_tools', colour: hexNum(COLOURS.warm), label: 'Parts & Tools', desc: 'Fix up the rescue van!' },
      { mode: 'treats_kitchen', colour: hexNum(COLOURS.primaryDark), label: 'Treats Kitchen', desc: 'Bake tasty treats for animals!' },
      { mode: 'decorations', colour: hexNum(COLOURS.info), label: 'Decorations', desc: 'Brighten up the centre!' },
      { mode: 'medical_supplies', colour: hexNum(COLOURS.accent), label: 'Medical Supplies', desc: 'Stock up the vet clinic!' },
    ];

    modes.forEach((m, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cardX = gridX + col * (cardW + colGap);
      const cx = cardX + cardW / 2;
      const y = firstCy + row * rowPitch;
      const unlocked = canAccessMode(m.mode, this.playerLevel);
      const alpha = unlocked ? 1 : 0.4;

      // Card background — a chrome plate, like every other thing in the
      // game that floats above a surface. It was 18% white glass with a
      // gold outline, which is the old HUD's language.
      const card = createChromePlate(this, cx, y, cardW, cardH);
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
          color: unlocked ? DEPOT_COLOURS.text : COLOURS.textLight,
        }).setOrigin(0, 0.5).setAlpha(alpha)
      );

      // Description
      this.container.add(
        this.add.text(cardX + 70, y + 14, unlocked ? m.desc : `Unlocks at level ${m.mode === 'medical_supplies' ? 15 : 1}`, {
          fontSize: '14px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
          color: unlocked ? DEPOT_COLOURS.textDim : COLOURS.textLight,
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
        fontSize: '16px', fontFamily: FONTS.body, color: CHROME.inkAccent,
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
      // y - 42, not y - 30. The cards are 58 tall and centred on y, so
      // their top edge is at y - 29 and a 12px label centred at y - 30 ran
      // five pixels into it. It was equally wrong on the purple and simply
      // did not show: pale gold on dark, over a 10%-white card.
      this.add.text(width / 2, y - 42, 'MATCH THESE:', {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
        color: CHROME.inkAccent, resolution: TEXT_RESOLUTION,
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
      // A chrome plate, with a green rim once the target is met — the one
      // place a fill is allowed to change, because "done" is the thing this
      // card exists to say and the count beside it says it too.
      const card = this.add.graphics();
      card.fillStyle(CHROME.fill, CHROME.fillAlpha);
      card.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
      card.lineStyle(2, done ? DEPOT_COLOURS.green : CHROME.stroke, done ? 1 : CHROME.strokeAlpha);
      card.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
      this.container.add(card);

      if (emoji) {
        this.container.add(
          this.add.text(x, y - 10, emoji, {
            fontSize: '34px',
          }).setOrigin(0.5)
        );
      } else {
        // Every board's first goal is `clear_count` — "clear any N tiles" —
        // and it carries no target tile, so this branch is the one a child
        // meets every single game. It drew an anonymous coloured circle,
        // which asks a question rather than answering one. The word does
        // the job the emoji does on the other cards.
        this.container.add(
          this.add.text(x, y - 10, goal.type === 'clear_count' ? 'Any' : '?', {
            fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold',
            color: CHROME.inkMuted, resolution: TEXT_RESOLUTION,
          }).setOrigin(0.5)
        );
      }

      this.container.add(
        this.add.text(x, y + 18, progress, {
          fontSize: '15px', fontFamily: FONTS.body, fontStyle: 'bold',
          resolution: TEXT_RESOLUTION,
          color: done ? CHROME.inkAccent : CHROME.ink,
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
      // Dark ink with a cream halo, which is the way round that works over
      // both grounds this floats across — the wood bench and the light
      // cells. It was white type with a gold glow, which needed the purple.
      color: extra ? CHROME.inkAccent : CHROME.ink,
      shadow: { offsetX: 0, offsetY: 0, color: COLOURS.bg, blur: 6, fill: true },
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
      createChromeTitle(this, width / 2, 50,
        allGoalsMet ? 'Session Complete!' : 'Out of Moves!', {
        tone: allGoalsMet ? 'success' : 'default',
        fontSize: '24px',
      })
    );

    // Score summary
    this.container.add(
      this.add.text(width / 2, 100, `Score: ${this.boardState?.score ?? 0}`, {
        fontSize: '22px', fontFamily: FONTS.title, color: CHROME.inkAccent,
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
      row.fillStyle(done ? DEPOT_COLOURS.green : DEPOT_COLOURS.red, 0.14);
      row.fillRoundedRect(width / 2 - rowW / 2, cy - 22, rowW, 44, 22);
      this.container.add(row);

      // Status circle
      const statusCircle = this.add.circle(width / 2 - rowW / 2 + 22, cy, 14,
        done ? DEPOT_COLOURS.green : DEPOT_COLOURS.red);
      this.container.add(statusCircle);
      this.container.add(
        this.add.text(width / 2 - rowW / 2 + 22, cy, done ? '✓' : '×', {
          fontSize: '20px', fontFamily: FONTS.body, fontStyle: 'bold',
          color: COLOURS.bg, resolution: TEXT_RESOLUTION,
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
          color: done ? CHROME.inkAccent : CHROME.inkDanger, resolution: TEXT_RESOLUTION,
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
        const cardGfx = createChromePlate(this, rx, ry + 9, 60, 58, { radius: 8 });
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
          6, DEPOT_COLOURS.accent
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
      createChromeButton(this, width / 2, height - 85, 'Play Again', () => {
        this.phase = 'mode_select';
        this.renderView();
      }, { width: 200, variant: 'filled' })
    );

    this.container.add(
      createChromeButton(this, width / 2, height - 35, 'Back to Centre', () => {
        this.scene.start('GameScene');
      }, { width: 200, icon: 'icon-back', iconStyle: 'glyph' })
    );
  }
}
