/**
 * Depot Board — Toon Blast-style tap-to-collapse puzzle engine.
 *
 * Pure game logic: no Phaser, no UI. Operates on a 2D grid where
 * row 0 is the TOP of the board and gravity pulls tiles downward
 * (toward higher row indices).
 */

import type {
  Tile,
  BoardState,
  BoardGoal,
  PowerUpType,
  DepotMode,
} from '@arc/shared-types';

// ── Helpers ─────────────────────────────────────────────────────

/** Pick a random element from an array. */
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Deep-clone a grid (each cell is a small object or null). */
function cloneGrid(grid: (Tile | null)[][]): (Tile | null)[][] {
  return grid.map(row => row.map(cell => (cell ? { ...cell } : null)));
}

// ── Board Creation ──────────────────────────────────────────────

/**
 * Create a new randomised board.
 *
 * Every cell is filled with a random tile type. If any group of 5+
 * identical adjacent tiles exists the board is re-shuffled (up to 100
 * attempts) to prevent instant power-up creation on start.
 */
export function createBoard(
  width: number,
  height: number,
  tileTypes: string[],
): (Tile | null)[][] {
  if (tileTypes.length === 0) throw new Error('tileTypes must not be empty');
  if (width < 1 || height < 1) throw new Error('Board dimensions must be >= 1');

  for (let attempt = 0; attempt < 100; attempt++) {
    const grid: (Tile | null)[][] = [];
    for (let r = 0; r < height; r++) {
      const row: (Tile | null)[] = [];
      for (let c = 0; c < width; c++) {
        row.push({ type: pick(tileTypes) });
      }
      grid.push(row);
    }

    if (!hasLargeGroup(grid, 5)) return grid;
  }

  // Fallback: deterministic striping that guarantees no group >= 5
  const grid: (Tile | null)[][] = [];
  for (let r = 0; r < height; r++) {
    const row: (Tile | null)[] = [];
    for (let c = 0; c < width; c++) {
      row.push({ type: tileTypes[(r + c) % tileTypes.length] });
    }
    grid.push(row);
  }
  return grid;
}

/** Returns true if the grid contains any connected group >= `minSize`. */
function hasLargeGroup(grid: (Tile | null)[][], minSize: number): boolean {
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (visited[r][c] || !grid[r][c]) continue;
      const group = floodFill(grid, r, c, visited);
      if (group.length >= minSize) return true;
    }
  }
  return false;
}

// ── Group Detection (BFS flood-fill) ────────────────────────────

/**
 * Find the group of adjacent same-type tiles containing (row, col).
 *
 * Uses BFS with orthogonal adjacency only. Returns an empty array if
 * the cell is null or the group has fewer than 2 tiles.
 */
export function findGroup(
  grid: (Tile | null)[][],
  row: number,
  col: number,
): { row: number; col: number }[] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  const cell = grid[row]?.[col];
  if (!cell) return [];

  const visited = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  const group = floodFill(grid, row, col, visited);

  return group.length >= 2 ? group : [];
}

/** Internal BFS — marks visited and returns list of coordinates. */
function floodFill(
  grid: (Tile | null)[][],
  startRow: number,
  startCol: number,
  visited: boolean[][],
): { row: number; col: number }[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const cell = grid[startRow][startCol];
  if (!cell) return [];

  const type = cell.type;
  const group: { row: number; col: number }[] = [];
  const queue: { row: number; col: number }[] = [{ row: startRow, col: startCol }];
  visited[startRow][startCol] = true;

  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  while (queue.length > 0) {
    const { row: r, col: c } = queue.shift()!;
    group.push({ row: r, col: c });

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (visited[nr][nc]) continue;
      const neighbour = grid[nr][nc];
      if (neighbour && neighbour.type === type) {
        visited[nr][nc] = true;
        queue.push({ row: nr, col: nc });
      }
    }
  }

  return group;
}

// ── Gravity ─────────────────────────────────────────────────────

/**
 * Apply gravity: compact each column so non-null tiles sink to the
 * bottom.
 *
 * INVARIANT: after gravity, no tile has a null cell below it.
 */
export function applyGravity(grid: (Tile | null)[][]): (Tile | null)[][] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const result = cloneGrid(grid);

  for (let c = 0; c < cols; c++) {
    // Collect non-null tiles top-to-bottom
    const tiles: Tile[] = [];
    for (let r = 0; r < rows; r++) {
      const cell = result[r][c];
      if (cell) tiles.push(cell);
    }
    // Place them at the bottom
    const gap = rows - tiles.length;
    for (let r = 0; r < rows; r++) {
      result[r][c] = r < gap ? null : tiles[r - gap];
    }
  }
  return result;
}

// ── Refill ──────────────────────────────────────────────────────

/**
 * Fill every null cell with a random tile. After gravity, nulls
 * should be at the top of each column.
 *
 * INVARIANT: after refill, no null cells exist on the board.
 */
export function refillBoard(
  grid: (Tile | null)[][],
  tileTypes: string[],
): (Tile | null)[][] {
  const result = cloneGrid(grid);
  for (let r = 0; r < result.length; r++) {
    for (let c = 0; c < result[0].length; c++) {
      if (!result[r][c]) {
        result[r][c] = { type: pick(tileTypes) };
      }
    }
  }
  return result;
}

// ── Power-Up Activation ─────────────────────────────────────────

/**
 * Activate a power-up at (row, col).
 *
 * - rocket: clear entire row OR column (whichever has more tiles)
 * - bomb: clear 3x3 area centred on cell
 * - rainbow: clear ALL tiles matching the most common type on board
 *
 * Chain-activates any revealed power-ups (max depth 5).
 */
export function activatePowerUp(
  grid: (Tile | null)[][],
  row: number,
  col: number,
  _depth: number = 0,
): { grid: (Tile | null)[][]; tilesRemoved: number } {
  const MAX_CHAIN_DEPTH = 5;
  if (_depth >= MAX_CHAIN_DEPTH) return { grid: cloneGrid(grid), tilesRemoved: 0 };

  const cell = grid[row]?.[col];
  if (!cell?.powerUp) return { grid: cloneGrid(grid), tilesRemoved: 0 };

  let result = cloneGrid(grid);
  const rows = result.length;
  const cols = result[0].length;
  let removed = 0;

  // Collect power-ups revealed during clearing for chain reactions
  const chainTargets: { row: number; col: number }[] = [];

  const clearCell = (r: number, c: number) => {
    const t = result[r]?.[c];
    if (!t) return;
    // If it has a power-up and isn't the originator, queue chain
    if (t.powerUp && !(r === row && c === col)) {
      chainTargets.push({ row: r, col: c });
    }
    result[r][c] = null;
    removed++;
  };

  const powerUp = cell.powerUp;

  if (powerUp === 'rocket') {
    // Count tiles in row vs column
    let rowCount = 0;
    let colCount = 0;
    for (let c2 = 0; c2 < cols; c2++) if (result[row][c2]) rowCount++;
    for (let r2 = 0; r2 < rows; r2++) if (result[r2][col]) colCount++;

    if (rowCount >= colCount) {
      for (let c2 = 0; c2 < cols; c2++) clearCell(row, c2);
    } else {
      for (let r2 = 0; r2 < rows; r2++) clearCell(r2, col);
    }
  } else if (powerUp === 'bomb') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          clearCell(nr, nc);
        }
      }
    }
  } else if (powerUp === 'rainbow') {
    // Find most common tile type on the board
    const counts: Record<string, number> = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = result[r][c];
        if (t) counts[t.type] = (counts[t.type] || 0) + 1;
      }
    }
    // The rainbow tile itself is already cleared or about to be — exclude null
    let maxType = '';
    let maxCount = 0;
    for (const [type, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxType = type;
        maxCount = count;
      }
    }
    // Clear the rainbow cell first
    clearCell(row, col);
    // Clear all of the most common type
    if (maxType) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (result[r][c]?.type === maxType) clearCell(r, c);
        }
      }
    }
  }

  // Chain reactions
  for (const target of chainTargets) {
    if (result[target.row]?.[target.col]) {
      // It might have been cleared by a prior chain — skip if null
      continue;
    }
    // The cell was already cleared but we saved the target; we need to
    // check if there's still a power-up to activate. Since we cleared it,
    // we actually need to track power-ups *before* clearing.
  }

  // Better approach: collect chain targets before clearing
  // Re-do with proper chain handling
  return activatePowerUpImpl(grid, row, col, _depth);
}

/** Internal implementation with proper chain-reaction tracking. */
function activatePowerUpImpl(
  grid: (Tile | null)[][],
  row: number,
  col: number,
  depth: number,
): { grid: (Tile | null)[][]; tilesRemoved: number } {
  const MAX_CHAIN_DEPTH = 5;
  if (depth >= MAX_CHAIN_DEPTH) return { grid: cloneGrid(grid), tilesRemoved: 0 };

  const cell = grid[row]?.[col];
  if (!cell?.powerUp) return { grid: cloneGrid(grid), tilesRemoved: 0 };

  let result = cloneGrid(grid);
  const rows = result.length;
  const cols = result[0].length;
  let removed = 0;
  const powerUp = cell.powerUp;

  // Identify cells to clear based on power-up type
  const toClear: { row: number; col: number }[] = [];

  if (powerUp === 'rocket') {
    let rowCount = 0;
    let colCount = 0;
    for (let c2 = 0; c2 < cols; c2++) if (result[row][c2]) rowCount++;
    for (let r2 = 0; r2 < rows; r2++) if (result[r2][col]) colCount++;

    if (rowCount >= colCount) {
      for (let c2 = 0; c2 < cols; c2++) {
        if (result[row][c2]) toClear.push({ row, col: c2 });
      }
    } else {
      for (let r2 = 0; r2 < rows; r2++) {
        if (result[r2][col]) toClear.push({ row: r2, col });
      }
    }
  } else if (powerUp === 'bomb') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && result[nr][nc]) {
          toClear.push({ row: nr, col: nc });
        }
      }
    }
  } else if (powerUp === 'rainbow') {
    // Find most common type (excluding the rainbow cell itself)
    const counts: Record<string, number> = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = result[r][c];
        if (t && !(r === row && c === col)) {
          counts[t.type] = (counts[t.type] || 0) + 1;
        }
      }
    }
    let maxType = '';
    let maxCount = 0;
    for (const [type, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxType = type;
        maxCount = count;
      }
    }
    // Clear the rainbow cell
    toClear.push({ row, col });
    // Clear all of most common type
    if (maxType) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (result[r][c]?.type === maxType) {
            toClear.push({ row: r, col: c });
          }
        }
      }
    }
  }

  // Collect chain targets (power-ups in the blast zone, excluding originator)
  const chainTargets: { row: number; col: number; powerUp: PowerUpType }[] = [];
  for (const pos of toClear) {
    const t = result[pos.row][pos.col];
    if (t?.powerUp && !(pos.row === row && pos.col === col)) {
      chainTargets.push({ row: pos.row, col: pos.col, powerUp: t.powerUp });
    }
  }

  // Clear cells
  for (const pos of toClear) {
    if (result[pos.row][pos.col]) {
      result[pos.row][pos.col] = null;
      removed++;
    }
  }

  // Chain-activate revealed power-ups
  for (const target of chainTargets) {
    // Temporarily restore the power-up cell so activatePowerUpImpl can read it
    result[target.row][target.col] = { type: 'chain', powerUp: target.powerUp };
    const chain = activatePowerUpImpl(result, target.row, target.col, depth + 1);
    result = chain.grid;
    removed += chain.tilesRemoved;
  }

  return { grid: result, tilesRemoved: removed };
}

// ── Tap Cell ────────────────────────────────────────────────────

/**
 * Tap a cell: find group, remove, maybe create power-up, apply
 * gravity, refill, update score/moves/goals.
 */
export function tapCell(
  board: BoardState,
  row: number,
  col: number,
  tileTypes: string[],
): {
  board: BoardState;
  tilesRemoved: number;
  powerUpCreated?: PowerUpType;
  chainReactions: number;
} {
  const group = findGroup(board.grid, row, col);

  if (group.length < 2) {
    return { board, tilesRemoved: 0, chainReactions: 0 };
  }

  let grid = cloneGrid(board.grid);
  const removedTypes: Record<string, number> = {};
  let chainReactions = 0;

  // Track types being removed (for goal tracking)
  for (const pos of group) {
    const cell = grid[pos.row][pos.col];
    if (cell) {
      removedTypes[cell.type] = (removedTypes[cell.type] || 0) + 1;
    }
  }

  // Determine power-up
  let powerUpCreated: PowerUpType | undefined;
  if (group.length >= 10) {
    powerUpCreated = 'rainbow';
  } else if (group.length >= 7) {
    powerUpCreated = 'bomb';
  } else if (group.length >= 5) {
    powerUpCreated = 'rocket';
  }

  // Remove group tiles
  for (const pos of group) {
    // Check if tile had a power-up — activate it
    const cell = grid[pos.row][pos.col];
    if (cell?.powerUp) {
      const activation = activatePowerUpImpl(grid, pos.row, pos.col, 0);
      grid = activation.grid;
      chainReactions++;
    } else {
      grid[pos.row][pos.col] = null;
    }
  }

  // Place power-up at tap location (after clearing)
  if (powerUpCreated) {
    grid[row][col] = { type: removedTypes ? Object.keys(removedTypes)[0] : tileTypes[0], powerUp: powerUpCreated };
  }

  // Apply gravity
  grid = applyGravity(grid);

  // Refill
  grid = refillBoard(grid, tileTypes);

  // Update goals
  const goalsResult = checkGoals([...board.goals.map(g => ({ ...g }))], removedTypes);

  // Score: tilesRemoved^2 for combo feel
  const tilesRemoved = group.length;
  const scoreIncrease = tilesRemoved * tilesRemoved;

  const newBoard: BoardState = {
    ...board,
    grid,
    moves: board.moves + 1,
    score: board.score + scoreIncrease,
    goals: goalsResult.goals,
    isComplete: goalsResult.allComplete,
  };

  return {
    board: newBoard,
    tilesRemoved,
    powerUpCreated,
    chainReactions,
  };
}

// ── Goals ───────────────────────────────────────────────────────

/**
 * Check if board goals are met given the tiles just removed.
 */
export function checkGoals(
  goals: BoardGoal[],
  removedTypes: Record<string, number>,
): { goals: BoardGoal[]; allComplete: boolean } {
  const updated = goals.map(g => {
    const copy = { ...g };
    if (g.type === 'clear_count') {
      // Any tile removal counts
      const totalRemoved = Object.values(removedTypes).reduce((a, b) => a + b, 0);
      copy.currentCount = Math.min(g.currentCount + totalRemoved, g.targetCount);
    } else if (g.type === 'collect_type' && g.targetTile) {
      const count = removedTypes[g.targetTile] || 0;
      copy.currentCount = Math.min(g.currentCount + count, g.targetCount);
    }
    // 'drop_to_bottom' would be handled separately by the UI layer
    return copy;
  });

  const allComplete = updated.every(g => g.currentCount >= g.targetCount);
  return { goals: updated, allComplete };
}

/** Tile types available per depot mode. */
const MODE_TILE_TYPES: Record<DepotMode, string[]> = {
  parts_and_tools: ['spanner', 'cog', 'bolt', 'spring', 'nut'],
  treats_kitchen: ['biscuit', 'bone', 'fish', 'carrot', 'berry'],
  decorations: ['ribbon', 'star', 'heart', 'flower', 'gem'],
  medical_supplies: ['bandage', 'syringe', 'pill', 'stethoscope', 'thermometer'],
};

/**
 * Generate goals for a depot session.
 *
 * - difficulty 1-10, scales target counts
 * - 2-4 goals per session
 */
export function generateGoals(mode: string, difficulty: number): BoardGoal[] {
  const clampedDiff = Math.max(1, Math.min(10, difficulty));
  const tiles = MODE_TILE_TYPES[mode as DepotMode] ?? MODE_TILE_TYPES.parts_and_tools;

  // Number of goals: 2 at low difficulty, up to 4 at high
  const goalCount = Math.min(4, Math.max(2, Math.floor(clampedDiff / 3) + 2));
  const goals: BoardGoal[] = [];

  // Always include a clear_count goal
  goals.push({
    type: 'clear_count',
    targetCount: 15 + clampedDiff * 8,
    currentCount: 0,
  });

  // Remaining goals are collect_type
  const shuffled = [...tiles].sort(() => Math.random() - 0.5);
  for (let i = 1; i < goalCount; i++) {
    goals.push({
      type: 'collect_type',
      targetTile: shuffled[(i - 1) % shuffled.length],
      targetCount: 5 + clampedDiff * 3,
      currentCount: 0,
    });
  }

  return goals;
}

// ── Serialisation ───────────────────────────────────────────────

export function serialiseBoard(board: BoardState): string {
  return JSON.stringify(board);
}

export function deserialiseBoard(json: string): BoardState {
  const parsed = JSON.parse(json) as BoardState;
  // Basic validation
  if (!parsed.grid || typeof parsed.rows !== 'number' || typeof parsed.cols !== 'number') {
    throw new Error('Invalid board state JSON');
  }
  return parsed;
}

// Re-export the MODE_TILE_TYPES for external use
export { MODE_TILE_TYPES };
