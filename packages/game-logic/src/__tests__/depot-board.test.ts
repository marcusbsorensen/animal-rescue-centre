import { describe, it, expect } from 'vitest';
import type { BoardState, BoardGoal, Tile } from '@arc/shared-types';
import {
  createBoard,
  findGroup,
  tapCell,
  applyGravity,
  refillBoard,
  activatePowerUp,
  checkGoals,
  generateGoals,
  serialiseBoard,
  deserialiseBoard,
  MODE_TILE_TYPES,
} from '../depot-board';

// ── Helpers ─────────────────────────────────────────────────────

const TILE_TYPES = ['A', 'B', 'C', 'D', 'E'];

/** Build a grid from a string template. '.' = null, letters = tile types. */
function gridFromTemplate(template: string): (Tile | null)[][] {
  return template
    .trim()
    .split('\n')
    .map(line =>
      line
        .trim()
        .split('')
        .map(ch => (ch === '.' ? null : { type: ch })),
    );
}

/** Make a minimal BoardState from a grid. */
function makeBoard(grid: (Tile | null)[][]): BoardState {
  return {
    grid,
    rows: grid.length,
    cols: grid[0].length,
    mode: 'parts_and_tools',
    moves: 0,
    score: 0,
    goals: [],
    isComplete: false,
    startedAt: new Date().toISOString(),
  };
}

// ── createBoard ─────────────────────────────────────────────────

describe('createBoard', () => {
  it('returns correct dimensions', () => {
    const grid = createBoard(8, 10, TILE_TYPES);
    expect(grid.length).toBe(10); // rows
    expect(grid[0].length).toBe(8); // cols
  });

  it('fills every cell (no nulls)', () => {
    const grid = createBoard(6, 6, TILE_TYPES);
    for (const row of grid) {
      for (const cell of row) {
        expect(cell).not.toBeNull();
        expect(cell!.type).toBeTruthy();
      }
    }
  });

  it('only uses provided tile types', () => {
    const types = ['X', 'Y'];
    const grid = createBoard(5, 5, types);
    for (const row of grid) {
      for (const cell of row) {
        expect(types).toContain(cell!.type);
      }
    }
  });

  it('has no pre-existing groups of 5+', () => {
    // Run multiple times to exercise the retry logic
    for (let i = 0; i < 10; i++) {
      const grid = createBoard(8, 8, ['A', 'B']);
      // Check every cell's group
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const group = findGroup(grid, r, c);
          // findGroup returns [] for groups < 2, so any returned group is >= 2
          // We just need to verify none are >= 5
          expect(group.length).toBeLessThan(5);
        }
      }
    }
  });

  it('throws on empty tileTypes', () => {
    expect(() => createBoard(5, 5, [])).toThrow();
  });

  it('throws on invalid dimensions', () => {
    expect(() => createBoard(0, 5, TILE_TYPES)).toThrow();
    expect(() => createBoard(5, 0, TILE_TYPES)).toThrow();
  });
});

// ── findGroup ───────────────────────────────────────────────────

describe('findGroup', () => {
  it('returns correct cells for a known 3-tile group', () => {
    const grid = gridFromTemplate(`
AABB
ABBB
CCDD
`);
    const group = findGroup(grid, 1, 1);
    // B at (0,2), (0,3), (1,1), (1,2), (1,3)
    expect(group.length).toBe(5);
    const coords = group.map(g => `${g.row},${g.col}`).sort();
    expect(coords).toEqual(['0,2', '0,3', '1,1', '1,2', '1,3']);
  });

  it('returns empty array for a single isolated tile (group < 2)', () => {
    const grid = gridFromTemplate(`
ABC
DEF
GHI
`);
    const group = findGroup(grid, 1, 1); // 'E' is isolated
    expect(group).toEqual([]);
  });

  it('returns empty array for null cell', () => {
    const grid = gridFromTemplate(`
A.B
CDE
`);
    const group = findGroup(grid, 0, 1); // null
    expect(group).toEqual([]);
  });

  it('does not cross diagonals', () => {
    const grid = gridFromTemplate(`
AB
BA
`);
    // A at (0,0) and (1,1) are diagonal — should NOT be grouped
    const group = findGroup(grid, 0, 0);
    expect(group).toEqual([]);
  });

  it('finds a large L-shaped group', () => {
    const grid = gridFromTemplate(`
AABB
AABB
AABB
BBBB
`);
    // A group starting at (0,0): (0,0),(0,1),(1,0),(1,1),(2,0),(2,1) = 6 cells
    const group = findGroup(grid, 0, 0);
    expect(group.length).toBe(6);
  });

  it('handles group at board edge', () => {
    const grid = gridFromTemplate(`
AAB
BAA
BBA
`);
    const group = findGroup(grid, 0, 0);
    // A at (0,0), (0,1) then (1,1), (1,2), (2,2) = 5
    expect(group.length).toBe(5);
  });
});

// ── applyGravity ────────────────────────────────────────────────

describe('applyGravity', () => {
  it('tiles fall to the bottom', () => {
    const grid = gridFromTemplate(`
A..
.B.
..C
`);
    const result = applyGravity(grid);
    // Column 0: A falls to row 2
    expect(result[2][0]?.type).toBe('A');
    expect(result[1][0]).toBeNull();
    expect(result[0][0]).toBeNull();
    // Column 1: B falls to row 2
    expect(result[2][1]?.type).toBe('B');
    // Column 2: C stays at row 2
    expect(result[2][2]?.type).toBe('C');
  });

  it('satisfies invariant: no tile has null below it', () => {
    const grid = gridFromTemplate(`
.A.B
A..B
..AB
A...
`);
    const result = applyGravity(grid);
    for (let c = 0; c < result[0].length; c++) {
      let seenTile = false;
      // Walk bottom-to-top: once we see a tile, no nulls above it should
      // have tiles above *them*. Easier: walk top-to-bottom and verify
      // null section is contiguous at the top.
      for (let r = result.length - 1; r >= 0; r--) {
        if (result[r][c] !== null) {
          seenTile = true;
        } else if (seenTile) {
          // Null below a tile (when reading bottom-up, null after seeing tile)
          // Actually: reading bottom-up, if we've seen tiles and now see null,
          // all remaining cells above should also be null.
          for (let r2 = r; r2 >= 0; r2--) {
            if (result[r2][c] !== null) {
              expect.fail(`Gravity invariant violated at (${r2}, ${c}): tile above a gap`);
            }
          }
          break;
        }
      }
    }
  });

  it('already-settled board is unchanged', () => {
    const grid = gridFromTemplate(`
ABCD
ABCD
ABCD
`);
    const result = applyGravity(grid);
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[0].length; c++) {
        expect(result[r][c]?.type).toBe(grid[r][c]?.type);
      }
    }
  });

  it('handles fully empty column', () => {
    const grid = gridFromTemplate(`
A.B
A.B
A.B
`);
    const result = applyGravity(grid);
    for (let r = 0; r < 3; r++) {
      expect(result[r][1]).toBeNull();
    }
  });

  it('preserves grid dimensions', () => {
    const grid = gridFromTemplate(`
A..
...
..B
`);
    const result = applyGravity(grid);
    expect(result.length).toBe(3);
    expect(result[0].length).toBe(3);
  });
});

// ── refillBoard ─────────────────────────────────────────────────

describe('refillBoard', () => {
  it('fills all null cells', () => {
    const grid = gridFromTemplate(`
...
.A.
...
`);
    const result = refillBoard(grid, TILE_TYPES);
    for (const row of result) {
      for (const cell of row) {
        expect(cell).not.toBeNull();
      }
    }
  });

  it('does not overwrite existing tiles', () => {
    const grid = gridFromTemplate(`
.A.
BAB
.A.
`);
    const result = refillBoard(grid, ['X']);
    expect(result[0][1]?.type).toBe('A');
    expect(result[1][0]?.type).toBe('B');
    expect(result[1][1]?.type).toBe('A');
    expect(result[1][2]?.type).toBe('B');
    expect(result[2][1]?.type).toBe('A');
    // Refilled cells should be 'X'
    expect(result[0][0]?.type).toBe('X');
    expect(result[0][2]?.type).toBe('X');
    expect(result[2][0]?.type).toBe('X');
    expect(result[2][2]?.type).toBe('X');
  });
});

// ── tapCell ─────────────────────────────────────────────────────

describe('tapCell', () => {
  it('removes a group and increments score and moves', () => {
    const grid = gridFromTemplate(`
AABB
AABB
CCDD
`);
    const board = makeBoard(grid);
    const result = tapCell(board, 0, 0, TILE_TYPES);

    expect(result.tilesRemoved).toBe(4); // 4 A's
    expect(result.board.moves).toBe(1);
    expect(result.board.score).toBe(16); // 4^2
  });

  it('returns unchanged board when tapping group of 1', () => {
    const grid = gridFromTemplate(`
ABC
DEF
GHI
`);
    const board = makeBoard(grid);
    const result = tapCell(board, 1, 1, TILE_TYPES); // 'E' isolated

    expect(result.tilesRemoved).toBe(0);
    expect(result.board.moves).toBe(0);
    expect(result.board.score).toBe(0);
    expect(result.board).toBe(board); // same reference
  });

  it('creates rocket for group of 5-6', () => {
    // 5 A's in an L
    const grid: (Tile | null)[][] = [
      [{ type: 'A' }, { type: 'A' }, { type: 'B' }, { type: 'C' }],
      [{ type: 'A' }, { type: 'B' }, { type: 'C' }, { type: 'D' }],
      [{ type: 'A' }, { type: 'B' }, { type: 'C' }, { type: 'D' }],
      [{ type: 'A' }, { type: 'B' }, { type: 'C' }, { type: 'D' }],
    ];
    const board = makeBoard(grid);
    const result = tapCell(board, 0, 0, TILE_TYPES);

    expect(result.tilesRemoved).toBe(5);
    expect(result.powerUpCreated).toBe('rocket');
  });

  it('creates bomb for group of 7-9', () => {
    // 7 A's in a cross pattern
    const grid: (Tile | null)[][] = [
      [{ type: 'A' }, { type: 'A' }, { type: 'A' }, { type: 'A' }, { type: 'B' }],
      [{ type: 'A' }, { type: 'B' }, { type: 'C' }, { type: 'D' }, { type: 'B' }],
      [{ type: 'A' }, { type: 'B' }, { type: 'C' }, { type: 'D' }, { type: 'B' }],
      [{ type: 'A' }, { type: 'B' }, { type: 'C' }, { type: 'D' }, { type: 'B' }],
    ];
    const board = makeBoard(grid);
    const result = tapCell(board, 0, 0, TILE_TYPES);

    expect(result.tilesRemoved).toBe(7);
    expect(result.powerUpCreated).toBe('bomb');
  });

  it('creates rainbow for group of 10+', () => {
    // 10 A's filling top rows
    const grid: (Tile | null)[][] = [
      [{ type: 'A' }, { type: 'A' }, { type: 'A' }, { type: 'A' }, { type: 'A' }],
      [{ type: 'A' }, { type: 'A' }, { type: 'A' }, { type: 'A' }, { type: 'A' }],
      [{ type: 'B' }, { type: 'C' }, { type: 'D' }, { type: 'B' }, { type: 'C' }],
      [{ type: 'D' }, { type: 'B' }, { type: 'C' }, { type: 'D' }, { type: 'B' }],
    ];
    const board = makeBoard(grid);
    const result = tapCell(board, 0, 0, TILE_TYPES);

    expect(result.tilesRemoved).toBe(10);
    expect(result.powerUpCreated).toBe('rainbow');
  });

  it('returns unchanged when tapping null cell', () => {
    const grid = gridFromTemplate(`
A.B
CDE
`);
    const board = makeBoard(grid);
    const result = tapCell(board, 0, 1, TILE_TYPES);
    expect(result.tilesRemoved).toBe(0);
  });

  it('board has no nulls after tap (gravity + refill invariant)', () => {
    const grid = gridFromTemplate(`
AABB
AABB
CCDD
`);
    const board = makeBoard(grid);
    const result = tapCell(board, 0, 0, TILE_TYPES);

    for (const row of result.board.grid) {
      for (const cell of row) {
        expect(cell).not.toBeNull();
      }
    }
  });

  it('preserves grid dimensions after tap', () => {
    const grid = gridFromTemplate(`
AABB
AABB
CCDD
`);
    const board = makeBoard(grid);
    const result = tapCell(board, 0, 0, TILE_TYPES);

    expect(result.board.grid.length).toBe(3);
    expect(result.board.grid[0].length).toBe(4);
  });

  it('score uses quadratic formula', () => {
    // Group of 3 should give 9 points
    const grid = gridFromTemplate(`
AAA
BCD
EFG
`);
    const board = makeBoard(grid);
    const result = tapCell(board, 0, 0, TILE_TYPES);

    expect(result.tilesRemoved).toBe(3);
    expect(result.board.score).toBe(9); // 3^2
  });
});

// ── activatePowerUp ─────────────────────────────────────────────

describe('activatePowerUp', () => {
  it('rocket clears row or column (whichever has more tiles)', () => {
    const grid: (Tile | null)[][] = [
      [{ type: 'A' }, { type: 'B' }, { type: 'C', powerUp: 'rocket' }, { type: 'D' }, { type: 'E' }],
      [{ type: 'A' }, { type: 'B' }, { type: 'C' }, { type: 'D' }, { type: 'E' }],
      [{ type: 'A' }, { type: 'B' }, { type: 'C' }, { type: 'D' }, { type: 'E' }],
    ];
    // Row at (0) has 5 tiles, col at (2) has 3 tiles — row is bigger
    const result = activatePowerUp(grid, 0, 2);
    // Entire row 0 should be cleared
    expect(result.grid[0].every(c => c === null)).toBe(true);
    expect(result.tilesRemoved).toBe(5);
  });

  it('bomb clears 3x3 area', () => {
    const grid: (Tile | null)[][] = [
      [{ type: 'A' }, { type: 'B' }, { type: 'C' }, { type: 'D' }],
      [{ type: 'E' }, { type: 'F', powerUp: 'bomb' }, { type: 'G' }, { type: 'H' }],
      [{ type: 'I' }, { type: 'J' }, { type: 'K' }, { type: 'L' }],
      [{ type: 'M' }, { type: 'N' }, { type: 'O' }, { type: 'P' }],
    ];
    const result = activatePowerUp(grid, 1, 1);
    // 3x3 centred on (1,1) = rows 0-2, cols 0-2
    for (let r = 0; r <= 2; r++) {
      for (let c = 0; c <= 2; c++) {
        expect(result.grid[r][c]).toBeNull();
      }
    }
    // Outside 3x3 should remain
    expect(result.grid[0][3]?.type).toBe('D');
    expect(result.grid[1][3]?.type).toBe('H');
    expect(result.grid[3][0]?.type).toBe('M');
    expect(result.tilesRemoved).toBe(9);
  });

  it('bomb at corner clears partial 3x3', () => {
    const grid: (Tile | null)[][] = [
      [{ type: 'A', powerUp: 'bomb' }, { type: 'B' }],
      [{ type: 'C' }, { type: 'D' }],
    ];
    const result = activatePowerUp(grid, 0, 0);
    // Only 4 cells in the valid 3x3 area
    expect(result.tilesRemoved).toBe(4);
    expect(result.grid[0][0]).toBeNull();
    expect(result.grid[0][1]).toBeNull();
    expect(result.grid[1][0]).toBeNull();
    expect(result.grid[1][1]).toBeNull();
  });

  it('rainbow clears all tiles of the most common type', () => {
    const grid: (Tile | null)[][] = [
      [{ type: 'A' }, { type: 'A' }, { type: 'B', powerUp: 'rainbow' }],
      [{ type: 'A' }, { type: 'B' }, { type: 'C' }],
      [{ type: 'A' }, { type: 'C' }, { type: 'C' }],
    ];
    // Most common type (excluding rainbow cell): A=4, B=1, C=3 → clears A
    const result = activatePowerUp(grid, 0, 2);
    // Rainbow cell cleared + all 4 A's = 5
    expect(result.tilesRemoved).toBe(5);
    // All A's should be null
    expect(result.grid[0][0]).toBeNull();
    expect(result.grid[0][1]).toBeNull();
    expect(result.grid[1][0]).toBeNull();
    expect(result.grid[2][0]).toBeNull();
    // B and C should remain (except rainbow cell itself)
    expect(result.grid[1][1]?.type).toBe('B');
    expect(result.grid[1][2]?.type).toBe('C');
  });

  it('returns unchanged if cell has no power-up', () => {
    const grid: (Tile | null)[][] = [
      [{ type: 'A' }, { type: 'B' }],
      [{ type: 'C' }, { type: 'D' }],
    ];
    const result = activatePowerUp(grid, 0, 0);
    expect(result.tilesRemoved).toBe(0);
  });

  it('chain-activates power-ups in blast zone', () => {
    const grid: (Tile | null)[][] = [
      [{ type: 'A', powerUp: 'bomb' }, { type: 'B', powerUp: 'bomb' }, { type: 'C' }, { type: 'D' }],
      [{ type: 'E' }, { type: 'F' }, { type: 'G' }, { type: 'H' }],
      [{ type: 'I' }, { type: 'J' }, { type: 'K' }, { type: 'L' }],
    ];
    const result = activatePowerUp(grid, 0, 0);
    // First bomb clears 3x3 around (0,0), which includes bomb at (0,1)
    // Second bomb clears 3x3 around (0,1)
    // Combined should clear more than just one bomb's area
    expect(result.tilesRemoved).toBeGreaterThan(6);
  });
});

// ── checkGoals ──────────────────────────────────────────────────

describe('checkGoals', () => {
  it('increments clear_count goal correctly', () => {
    const goals: BoardGoal[] = [
      { type: 'clear_count', targetCount: 20, currentCount: 5 },
    ];
    const result = checkGoals(goals, { A: 3, B: 2 });
    expect(result.goals[0].currentCount).toBe(10); // 5 + 3 + 2
    expect(result.allComplete).toBe(false);
  });

  it('increments collect_type goal correctly', () => {
    const goals: BoardGoal[] = [
      { type: 'collect_type', targetTile: 'A', targetCount: 10, currentCount: 3 },
    ];
    const result = checkGoals(goals, { A: 5, B: 2 });
    expect(result.goals[0].currentCount).toBe(8); // 3 + 5
  });

  it('detects completion when all goals met', () => {
    const goals: BoardGoal[] = [
      { type: 'clear_count', targetCount: 10, currentCount: 7 },
      { type: 'collect_type', targetTile: 'A', targetCount: 5, currentCount: 4 },
    ];
    const result = checkGoals(goals, { A: 3, B: 5 });
    // clear_count: 7 + 8 = 15 >= 10 ✓ (capped at 10)
    // collect_type A: 4 + 3 = 7 >= 5 ✓ (capped at 5)
    expect(result.allComplete).toBe(true);
  });

  it('does not over-count past target', () => {
    const goals: BoardGoal[] = [
      { type: 'clear_count', targetCount: 5, currentCount: 3 },
    ];
    const result = checkGoals(goals, { A: 10 });
    expect(result.goals[0].currentCount).toBe(5); // capped
  });

  it('ignores unrelated tile types for collect_type', () => {
    const goals: BoardGoal[] = [
      { type: 'collect_type', targetTile: 'A', targetCount: 10, currentCount: 0 },
    ];
    const result = checkGoals(goals, { B: 5, C: 3 });
    expect(result.goals[0].currentCount).toBe(0);
  });
});

// ── generateGoals ───────────────────────────────────────────────

describe('generateGoals', () => {
  it('generates 2-4 goals', () => {
    for (let diff = 1; diff <= 10; diff++) {
      const goals = generateGoals('parts_and_tools', diff);
      expect(goals.length).toBeGreaterThanOrEqual(2);
      expect(goals.length).toBeLessThanOrEqual(4);
    }
  });

  it('first goal is always clear_count', () => {
    const goals = generateGoals('treats_kitchen', 5);
    expect(goals[0].type).toBe('clear_count');
  });

  it('all goals start with currentCount 0', () => {
    const goals = generateGoals('decorations', 3);
    for (const g of goals) {
      expect(g.currentCount).toBe(0);
    }
  });

  it('higher difficulty produces higher targets', () => {
    const easy = generateGoals('parts_and_tools', 1);
    const hard = generateGoals('parts_and_tools', 10);
    expect(hard[0].targetCount).toBeGreaterThan(easy[0].targetCount);
  });

  it('uses valid tile types for the mode', () => {
    const goals = generateGoals('medical_supplies', 5);
    const validTiles = MODE_TILE_TYPES.medical_supplies;
    for (const g of goals) {
      if (g.targetTile) {
        expect(validTiles).toContain(g.targetTile);
      }
    }
  });
});

// ── serialise / deserialise ─────────────────────────────────────

describe('serialise / deserialise', () => {
  it('round-trips correctly', () => {
    const grid = gridFromTemplate(`
AABB
CCDD
`);
    const board = makeBoard(grid);
    board.score = 42;
    board.moves = 3;
    board.goals = [
      { type: 'clear_count', targetCount: 20, currentCount: 10 },
    ];

    const json = serialiseBoard(board);
    const restored = deserialiseBoard(json);

    expect(restored.rows).toBe(board.rows);
    expect(restored.cols).toBe(board.cols);
    expect(restored.score).toBe(42);
    expect(restored.moves).toBe(3);
    expect(restored.goals[0].currentCount).toBe(10);
    expect(restored.grid.length).toBe(board.grid.length);
    expect(restored.grid[0].length).toBe(board.grid[0].length);

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        expect(restored.grid[r][c]?.type).toBe(board.grid[r][c]?.type);
      }
    }
  });

  it('throws on invalid JSON', () => {
    expect(() => deserialiseBoard('{}')).toThrow();
    expect(() => deserialiseBoard('not json')).toThrow();
  });
});

// ── INVARIANT TESTS ─────────────────────────────────────────────

describe('invariant: gravity (no floating tiles)', () => {
  it('holds after 100 random taps', () => {
    let board = makeBoard(createBoard(8, 8, TILE_TYPES));
    board.goals = [{ type: 'clear_count', targetCount: 99999, currentCount: 0 }];

    for (let tap = 0; tap < 100; tap++) {
      const r = Math.floor(Math.random() * 8);
      const c = Math.floor(Math.random() * 8);
      const result = tapCell(board, r, c, TILE_TYPES);
      board = result.board;

      // After tapCell, gravity + refill have been applied.
      // Verify gravity invariant on the grid before refill would have run
      // (tapCell does both, so we just verify the final state has no gaps)
      const grid = board.grid;
      for (let col = 0; col < 8; col++) {
        let seenNull = false;
        for (let row = 0; row < 8; row++) {
          if (grid[row][col] === null) {
            seenNull = true;
          } else if (seenNull) {
            expect.fail(
              `Gravity invariant violated at (${row}, ${col}) after tap ${tap + 1}`,
            );
          }
        }
      }
    }
  });
});

describe('invariant: no nulls after refill', () => {
  it('holds after 100 random taps', () => {
    let board = makeBoard(createBoard(8, 8, TILE_TYPES));
    board.goals = [{ type: 'clear_count', targetCount: 99999, currentCount: 0 }];

    for (let tap = 0; tap < 100; tap++) {
      const r = Math.floor(Math.random() * 8);
      const c = Math.floor(Math.random() * 8);
      const result = tapCell(board, r, c, TILE_TYPES);
      board = result.board;

      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          expect(board.grid[row][col]).not.toBeNull();
        }
      }
    }
  });
});

describe('invariant: grid dimensions never change', () => {
  it('holds after 50 random taps', () => {
    let board = makeBoard(createBoard(7, 9, TILE_TYPES));
    board.goals = [{ type: 'clear_count', targetCount: 99999, currentCount: 0 }];

    for (let tap = 0; tap < 50; tap++) {
      const r = Math.floor(Math.random() * 9);
      const c = Math.floor(Math.random() * 7);
      const result = tapCell(board, r, c, TILE_TYPES);
      board = result.board;

      expect(board.grid.length).toBe(9);
      for (const row of board.grid) {
        expect(row.length).toBe(7);
      }
    }
  });
});

describe('invariant: score only increases', () => {
  it('score never decreases across 100 taps', () => {
    let board = makeBoard(createBoard(8, 8, TILE_TYPES));
    board.goals = [{ type: 'clear_count', targetCount: 99999, currentCount: 0 }];
    let prevScore = 0;

    for (let tap = 0; tap < 100; tap++) {
      const r = Math.floor(Math.random() * 8);
      const c = Math.floor(Math.random() * 8);
      const result = tapCell(board, r, c, TILE_TYPES);
      board = result.board;

      expect(board.score).toBeGreaterThanOrEqual(prevScore);
      prevScore = board.score;
    }
  });
});
