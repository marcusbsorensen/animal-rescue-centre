import { describe, it, expect } from 'vitest';
import {
  rotateTile,
  toggleGate,
  tileSides,
  solveTunnels,
  isPuzzleSolved,
  generateTier1Puzzle,
  applyTier1Solution,
  type TunnelTile,
  type TunnelPuzzle,
} from '../tunnel';

const t = (type: TunnelTile['type'], extra: Partial<TunnelTile> = {}): TunnelTile =>
  ({ type, rotation: 0, ...extra });

describe('rotateTile', () => {
  it('cycles straight through 4 rotations back to start', () => {
    let tile: TunnelTile = t('straight');
    for (let i = 0; i < 4; i++) tile = rotateTile(tile);
    expect(tile.rotation).toBe(0);
  });

  it('rotates corner one step clockwise', () => {
    const a = t('corner');
    const b = rotateTile(a);
    expect(b.rotation).toBe(1);
  });

  it('does not rotate fixed tiles', () => {
    const a = t('straight', { fixed: true, rotation: 0 });
    expect(rotateTile(a).rotation).toBe(0);
  });

  it('cross is symmetric — rotating is a no-op', () => {
    const a = t('cross');
    expect(rotateTile(a).rotation).toBe(0);
  });

  it('empty does not rotate', () => {
    expect(rotateTile(t('empty')).rotation).toBe(0);
  });
});

describe('tileSides', () => {
  it('straight vertical at r=0 opens N+S only', () => {
    expect(tileSides(t('straight', { rotation: 0 }))).toEqual({
      n: true, e: false, s: true, w: false,
    });
  });

  it('straight rotated once is horizontal (E+W)', () => {
    expect(tileSides(t('straight', { rotation: 1 }))).toEqual({
      n: false, e: true, s: false, w: true,
    });
  });

  it('corner ┘ at r=0 opens N+W', () => {
    expect(tileSides(t('corner', { rotation: 0 }))).toEqual({
      n: true, e: false, s: false, w: true,
    });
  });

  it('corner rotated once = ┌ (N→E, W→N) which opens E+N', () => {
    // r=0: N+W → r=1 cw: N becomes E, W becomes N → E+N open
    expect(tileSides(t('corner', { rotation: 1 }))).toEqual({
      n: true, e: true, s: false, w: false,
    });
  });

  it('t-junction at r=0 opens N+E+W', () => {
    expect(tileSides(t('t-junction', { rotation: 0 }))).toEqual({
      n: true, e: true, s: false, w: true,
    });
  });

  it('cross opens all 4 sides at every rotation', () => {
    for (const r of [0, 1, 2, 3] as const) {
      expect(tileSides(t('cross', { rotation: r }))).toEqual({
        n: true, e: true, s: true, w: true,
      });
    }
  });

  it('bridge at r=0 reports all 4 open (channels resolved during pathfinding)', () => {
    expect(tileSides(t('bridge', { rotation: 0 }))).toEqual({
      n: true, e: true, s: true, w: true,
    });
  });

  it('gate when shut reports all closed', () => {
    expect(tileSides(t('gate', { rotation: 0, open: false }))).toEqual({
      n: false, e: false, s: false, w: false,
    });
  });

  it('gate when open behaves like a straight', () => {
    expect(tileSides(t('gate', { rotation: 0, open: true }))).toEqual({
      n: true, e: false, s: true, w: false,
    });
  });

  it('empty has no sides open', () => {
    expect(tileSides(t('empty'))).toEqual({
      n: false, e: false, s: false, w: false,
    });
  });
});

describe('toggleGate', () => {
  it('flips open ↔ shut', () => {
    const open = t('gate', { open: true });
    const shut = toggleGate(open);
    expect(shut.open).toBe(false);
    expect(toggleGate(shut).open).toBe(true);
  });

  it('treats undefined open as open → toggling closes it', () => {
    const tile = t('gate');
    expect(toggleGate(tile).open).toBe(false);
  });

  it('is a no-op on non-gate tiles', () => {
    const a = t('straight');
    expect(toggleGate(a).open).toBeUndefined();
  });
});

// Helper: build a 1×N or M×1 puzzle inline.
function gridPuzzle(rows: TunnelTile[][], animals: TunnelPuzzle['animals']): TunnelPuzzle {
  const height = rows.length;
  const width = rows[0].length;
  const tiles: TunnelTile[] = [];
  for (const row of rows) for (const tile of row) tiles.push(tile);
  return { width, height, tiles, animals };
}

describe('solveTunnels — trivial', () => {
  it('reports reached=true on a single-step start→end puzzle', () => {
    // Layout (1 row × 3 cols): [foxStart(E)] [straight horizontal] [foxEnd(W)]
    const start: TunnelTile = {
      type: 'habitat-endpoint', rotation: 3, fixed: true,
      endpointFor: 'fox', endpointRole: 'start',
    };
    const mid: TunnelTile = { type: 'straight', rotation: 1 };
    const end: TunnelTile = {
      type: 'habitat-endpoint', rotation: 1, fixed: true,
      endpointFor: 'fox', endpointRole: 'end',
    };
    const puzzle = gridPuzzle([[start, mid, end]], ['fox']);
    const result = solveTunnels(puzzle);
    expect(result.fox.reached).toBe(true);
  });

  it('reports dead-end when middle straight is rotated wrong', () => {
    const start: TunnelTile = {
      type: 'habitat-endpoint', rotation: 3, fixed: true,
      endpointFor: 'fox', endpointRole: 'start',
    };
    const mid: TunnelTile = { type: 'straight', rotation: 0 }; // vertical, doesn't connect
    const end: TunnelTile = {
      type: 'habitat-endpoint', rotation: 1, fixed: true,
      endpointFor: 'fox', endpointRole: 'end',
    };
    const puzzle = gridPuzzle([[start, mid, end]], ['fox']);
    expect(solveTunnels(puzzle).fox.reached).toBe(false);
    expect(solveTunnels(puzzle).fox.reason).toBe('dead-end');
  });

  it('reports gate-closed when a closed gate sits on the path', () => {
    const start: TunnelTile = {
      type: 'habitat-endpoint', rotation: 3, fixed: true,
      endpointFor: 'fox', endpointRole: 'start',
    };
    const gate: TunnelTile = { type: 'gate', rotation: 1, open: false };
    const end: TunnelTile = {
      type: 'habitat-endpoint', rotation: 1, fixed: true,
      endpointFor: 'fox', endpointRole: 'end',
    };
    const puzzle = gridPuzzle([[start, gate, end]], ['fox']);
    expect(solveTunnels(puzzle).fox.reason).toBe('gate-closed');
  });

  it('reports wrong-destination when path lands at another animal\'s endpoint', () => {
    const start: TunnelTile = {
      type: 'habitat-endpoint', rotation: 3, fixed: true,
      endpointFor: 'fox', endpointRole: 'start',
    };
    const mid: TunnelTile = { type: 'straight', rotation: 1 };
    // Skunk's end on the connected path; fox's own end exists but is
    // unreachable (off in another row), so the puzzle is well-formed
    // but the fox arrives at the wrong door.
    const skunkEnd: TunnelTile = {
      type: 'habitat-endpoint', rotation: 1, fixed: true,
      endpointFor: 'skunk', endpointRole: 'end',
    };
    const empty: TunnelTile = { type: 'empty', rotation: 0 };
    const foxEndOffPath: TunnelTile = {
      type: 'habitat-endpoint', rotation: 1, fixed: true,
      endpointFor: 'fox', endpointRole: 'end',
    };
    const puzzle = gridPuzzle(
      [[start, mid, skunkEnd], [empty, empty, foxEndOffPath]],
      ['fox'],
    );
    expect(solveTunnels(puzzle).fox.reason).toBe('wrong-destination');
  });
});

describe('bridge — independent NS / EW channels', () => {
  it('NS flow passes straight through a bridge tile', () => {
    // 3 rows × 1 col: [start exits S] [bridge] [end opens N]
    const start: TunnelTile = {
      type: 'habitat-endpoint', rotation: 0, fixed: true,
      endpointFor: 'fox', endpointRole: 'start',
    };
    const bridge: TunnelTile = { type: 'bridge', rotation: 0 };
    const end: TunnelTile = {
      type: 'habitat-endpoint', rotation: 2, fixed: true,
      endpointFor: 'fox', endpointRole: 'end',
    };
    const puzzle = gridPuzzle([[start], [bridge], [end]], ['fox']);
    expect(solveTunnels(puzzle).fox.reached).toBe(true);
  });
});

describe('isPuzzleSolved', () => {
  it('returns true only when ALL animals reach their own endpoint', () => {
    const start: TunnelTile = {
      type: 'habitat-endpoint', rotation: 3, fixed: true,
      endpointFor: 'fox', endpointRole: 'start',
    };
    const mid: TunnelTile = { type: 'straight', rotation: 1 };
    const end: TunnelTile = {
      type: 'habitat-endpoint', rotation: 1, fixed: true,
      endpointFor: 'fox', endpointRole: 'end',
    };
    const ok = gridPuzzle([[start, mid, end]], ['fox']);
    expect(isPuzzleSolved(ok)).toBe(true);

    const broken = gridPuzzle([[start, { ...mid, rotation: 0 }, end]], ['fox']);
    expect(isPuzzleSolved(broken)).toBe(false);
  });
});

describe('generateTier1Puzzle', () => {
  it('is deterministic for the same seed', () => {
    const a = generateTier1Puzzle(20260503);
    const b = generateTier1Puzzle(20260503);
    expect(a.tiles.map((t) => t.rotation)).toEqual(b.tiles.map((t) => t.rotation));
  });

  it('produces a 9×9 fox-only puzzle', () => {
    const p = generateTier1Puzzle(1);
    expect(p.width).toBe(9);
    expect(p.height).toBe(9);
    expect(p.animals).toEqual(['fox']);
  });

  it('is solvable when the canonical solution is applied', () => {
    for (const seed of [1, 2, 3, 42, 9999, 20260503]) {
      const p = generateTier1Puzzle(seed);
      const solved = applyTier1Solution(p);
      expect(isPuzzleSolved(solved)).toBe(true);
    }
  });

  it('places fox start at the centred tunnel mouth (4, 8) and fox end at (0, 1)', () => {
    const p = generateTier1Puzzle(7);
    const idx = (x: number, y: number) => y * p.width + x;
    const startTile = p.tiles[idx(4, 8)];
    const endTile = p.tiles[idx(0, 1)];
    expect(startTile.type).toBe('habitat-endpoint');
    expect(startTile.endpointFor).toBe('fox');
    expect(startTile.endpointRole).toBe('start');
    expect(endTile.type).toBe('habitat-endpoint');
    expect(endTile.endpointFor).toBe('fox');
    expect(endTile.endpointRole).toBe('end');
  });
});
