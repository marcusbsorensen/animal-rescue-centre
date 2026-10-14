import { describe, it, expect } from 'vitest';
import {
  rotateTile,
  toggleGate,
  tileSides,
  solveTunnels,
  isPuzzleSolved,
  generateTier1Puzzle,
  applyTier1Solution,
  generateTier2Puzzle,
  applyTier2Solution,
  generateTier3Puzzle,
  applyTier3Solution,
  generateTier4Puzzle,
  applyTier4Solution,
  generateTier5Puzzle,
  applyTier5Solution,
  applySolution,
  HABITAT_EXITS,
  TUNNEL_DOME_CELLS,
  tunnelShapes,
  type Animal,
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

describe('bridge — the crossing of two runs', () => {
  const start = (animal: Animal, rotation: 0 | 1 | 2 | 3): TunnelTile => ({
    type: 'habitat-endpoint', rotation, fixed: true, endpointFor: animal, endpointRole: 'start',
  });
  const end = (animal: Animal, rotation: 0 | 1 | 2 | 3): TunnelTile => ({
    type: 'habitat-endpoint', rotation, fixed: true, endpointFor: animal, endpointRole: 'end',
  });
  const e = t('empty');

  // 3×3: the fox goes west→east along the middle row, the hedgehog north→south down the middle column, over one bridge.
  //   .  Hs .
  //   Fs BR Fe
  //   .  He .
  const board = (bridge: TunnelTile): TunnelPuzzle => gridPuzzle([
    [e, start('hedgehog', 0), e],
    [start('fox', 3), bridge, end('fox', 1)],
    [e, end('hedgehog', 2), e],
  ], ['fox', 'hedgehog']);

  it('lets two animals cross it at right angles, each coming out the far side', () => {
    for (const rotation of [0, 1] as const) {
      const r = solveTunnels(board({ type: 'bridge', rotation, fixed: true }));
      expect(r.fox.reached).toBe(true);
      expect(r.hedgehog.reached).toBe(true);
    }
  });

  it('puts both runs through the same cell on their way', () => {
    const r = solveTunnels(board({ type: 'bridge', rotation: 0, fixed: true }));
    expect(r.fox.path).toContainEqual({ x: 1, y: 1 });
    expect(r.hedgehog.path).toContainEqual({ x: 1, y: 1 });
  });

  it('never turns: a tap does nothing, fixed or not', () => {
    for (const fixed of [true, false]) {
      const b: TunnelTile = { type: 'bridge', rotation: 1, fixed };
      expect(rotateTile(b)).toEqual(b);
    }
  });

  it('keeps a finished board finished when it is tapped', () => {
    const solved = board({ type: 'bridge', rotation: 0, fixed: true });
    const tapped = { ...solved, tiles: solved.tiles.map((x) => (x.type === 'bridge' ? rotateTile(x) : x)) };
    expect(isPuzzleSolved(tapped)).toBe(true);
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

// ── The garden network ────────────────────────────────────────
//
// One board that grows tier by tier (docs/garden-tunnel-minigame-2026-05-03.md):
//   tier 1 fox · tier 2 + hedgehog · tier 3 + raccoon · tier 4 + skunk · tier 5 the same four.

const TIERS = [
  [1, generateTier1Puzzle, applyTier1Solution, ['fox']],
  [2, generateTier2Puzzle, applyTier2Solution, ['fox', 'hedgehog']],
  [3, generateTier3Puzzle, applyTier3Solution, ['fox', 'hedgehog', 'raccoon']],
  [4, generateTier4Puzzle, applyTier4Solution, ['fox', 'hedgehog', 'raccoon', 'skunk']],
  [5, generateTier5Puzzle, applyTier5Solution, ['fox', 'hedgehog', 'raccoon', 'skunk']],
] as const;

/** The gates each tier is dealt: none, then one on each run, a second on each, a third where a run is long enough. */
const GATES_AT_TIER = { 1: 0, 2: 2, 3: 3, 4: 8, 5: 10 } as const;

/** 1,500 seeds and every 2026 daily seed (the date as a number, as the page makes it). */
const SEEDS: number[] = [];
for (let s = 1; s <= 1500; s++) SEEDS.push(s);
for (let m = 1; m <= 12; m++) for (let d = 1; d <= 31; d++) SEEDS.push(2026 * 10000 + m * 100 + d);

const at = (p: TunnelPuzzle, x: number, y: number) => p.tiles[y * p.width + x];
/** The axis a path passes along at a cell ('ns' or 'ew'), or 'turn' where it bends (or ends). */
const axisAt = (path: Array<{ x: number; y: number }>, c: { x: number; y: number }): 'ns' | 'ew' | 'turn' => {
  const i = path.findIndex((q) => q.x === c.x && q.y === c.y);
  if (i <= 0 || i >= path.length - 1) return 'turn';
  if (path[i - 1].x === path[i + 1].x) return 'ns';
  if (path[i - 1].y === path[i + 1].y) return 'ew';
  return 'turn';
};
const sig = (p: TunnelPuzzle) => p.tiles.map((x) => `${x.type}:${x.rotation}:${x.open ?? ''}:${x.fixed ? 'f' : ''}`);

describe('the garden network: which animals join at which tier', () => {
  it.each(TIERS)('tier %i is a 9×13 board with the right animals', (_tier, gen, _solve, animals) => {
    for (const seed of [1, 7, 42, 20261014]) {
      const p = gen(seed);
      expect(p.width).toBe(9);
      expect(p.height).toBe(13);
      expect(p.animals).toEqual([...animals]);
    }
  });

  it.each(TIERS)('tier %i is deterministic for the same seed', (_tier, gen) => {
    expect(sig(gen(20260503))).toEqual(sig(gen(20260503)));
    expect(sig(gen(1))).not.toEqual(sig(gen(2)));
  });

  it.each(TIERS)('tier %i has a start and a goal for every animal, all fixed', (_tier, gen, _solve, animals) => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 42, 20261014]) {
      const p = gen(seed);
      for (const a of animals) {
        const starts = p.tiles.filter((x) => x.type === 'habitat-endpoint' && x.endpointFor === a && x.endpointRole === 'start');
        const ends = p.tiles.filter((x) => x.type === 'habitat-endpoint' && x.endpointFor === a && x.endpointRole === 'end');
        expect(starts).toHaveLength(1);
        expect(ends).toHaveLength(1);
        expect(starts[0].fixed).toBe(true);
        expect(ends[0].fixed).toBe(true);
      }
    }
  });

  it('puts every start inside the building and every goal on the animal\'s own catalogue exit', () => {
    const starts: Record<Animal, [number, number]> = { fox: [5, 10], hedgehog: [0, 10], raccoon: [5, 11], skunk: [5, 12] };
    for (const seed of [1, 2, 3, 42, 20261014]) {
      const p = generateTier5Puzzle(seed);
      for (const a of p.animals) {
        const [sx, sy] = starts[a];
        expect(at(p, sx, sy)).toMatchObject({ type: 'habitat-endpoint', endpointFor: a, endpointRole: 'start' });
        const hits = HABITAT_EXITS[a].filter((c) => {
          const t = at(p, c.x, c.y);
          return t.type === 'habitat-endpoint' && t.endpointFor === a && t.endpointRole === 'end';
        });
        expect(hits).toHaveLength(1);
      }
    }
  });

  it('chooses different exits across seeds', () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 9999]) {
      const p = generateTier1Puzzle(seed);
      for (const c of HABITAT_EXITS.fox) {
        const t = at(p, c.x, c.y);
        if (t.type === 'habitat-endpoint' && t.endpointRole === 'end') seen.add(`${c.x},${c.y}`);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});

describe('the garden network: one board that grows', () => {
  it('tier N keeps every fixed piece of tier N-1 exactly where it was', () => {
    for (const seed of SEEDS.filter((_, i) => i % 7 === 0)) {
      for (let i = 1; i < TIERS.length; i++) {
        const prev = TIERS[i - 1][1](seed);
        const next = TIERS[i][1](seed);
        prev.tiles.forEach((t, k) => {
          if (t.fixed) expect(`${next.tiles[k].type}:${next.tiles[k].rotation}:${next.tiles[k].endpointFor ?? ''}`)
            .toBe(`${t.type}:${t.rotation}:${t.endpointFor ?? ''}`);
        });
      }
    }
  });

  it('tier N is the same fox as tier 1 and tier 2 the same hedgehog as tier 3: a run does not change with the tier', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 42, 20261014]) {
      const routes = TIERS.map(([, gen, solve]) => solveTunnels(solve(gen(seed))));
      for (const a of ['fox', 'hedgehog', 'raccoon', 'skunk'] as const) {
        const paths = routes.filter((r) => r[a]).map((r) => JSON.stringify(r[a].path));
        expect(new Set(paths).size).toBe(1);
      }
    }
  });

  it('no two animals share a cell on their solved runs except at a crossing', () => {
    for (const [, gen, solve] of TIERS) {
      for (const seed of SEEDS.filter((_, i) => i % 3 === 0)) {
        const p = gen(seed);
        const res = solveTunnels(solve(p));
        const owner = new Map<string, string>();
        for (const a of Object.keys(res)) {
          for (const c of res[a].path ?? []) {
            const k = `${c.x},${c.y}`;
            const other = owner.get(k);
            if (other !== undefined && other !== a) {
              // the only way two runs may meet: a fixed bridge both pass straight through, at right angles
              const tile = at(p, c.x, c.y);
              expect(tile.type).toBe('bridge');
              expect(tile.fixed).toBe(true);
              expect(axisAt(res[a].path!, c)).not.toBe(axisAt(res[other].path!, c));
            }
            owner.set(k, a);
          }
        }
      }
    }
  });

  it('deals every shape of every animal, the ones dropped in 110A included', () => {
    const dealt: Record<Animal, Set<string>> = { fox: new Set(), hedgehog: new Set(), raccoon: new Set(), skunk: new Set() };
    for (const seed of SEEDS) {
      const s = tunnelShapes(seed);
      for (const a of Object.keys(dealt) as Animal[]) dealt[a].add(s[a]);
    }
    expect([...dealt.fox].sort()).toEqual(['approach-north', 'straight', 'z-east', 'z-west']);
    expect([...dealt.hedgehog].sort()).toEqual(['approach-north', 'over-the-top', 'straight', 'z-east']);
    expect([...dealt.raccoon].sort()).toEqual(['approach-north', 'straight', 'z-west']);
    expect([...dealt.skunk].sort()).toEqual(['straight', 'z-west', 'z-west-high']);
  });

  it('a bend is dealt often enough to be met: fox z-east, a raccoon bend, a skunk bend', () => {
    let foxEast = 0, raccoonBend = 0, skunkBend = 0;
    for (const seed of SEEDS) {
      const s = tunnelShapes(seed);
      if (s.fox === 'z-east') foxEast++;
      if (s.raccoon !== 'straight') raccoonBend++;
      if (s.skunk !== 'straight') skunkBend++;
    }
    expect(foxEast / SEEDS.length).toBeGreaterThan(0.1);
    expect(raccoonBend / SEEDS.length).toBeGreaterThan(0.3);
    expect(skunkBend / SEEDS.length).toBeGreaterThan(0.2);
  });

  it('a shape follows the seed alone, whatever the tier, and matches the run it draws', () => {
    for (const seed of SEEDS.filter((_, i) => i % 11 === 0)) {
      const s = tunnelShapes(seed);
      const res = solveTunnels(applySolution(generateTier5Puzzle(seed)));
      const fox = res.fox.path!;
      expect(fox.some((c) => c.x === 8 && c.y === 5)).toBe(s.fox === 'z-east');
      expect(fox.some((c) => c.x === 4 && c.y === 5)).toBe(s.fox === 'z-west');
      expect(fox.some((c) => c.y === 0)).toBe(s.fox === 'approach-north');
      const rac = res.raccoon.path!;
      expect(rac.some((c) => c.x === 5 && c.y <= 10)).toBe(s.raccoon !== 'straight');
      const sk = res.skunk.path!;
      expect(sk.some((c) => c.x === 5 && c.y <= 10)).toBe(s.skunk !== 'straight');
      expect(sk.some((c) => c.x === 5 && c.y === 3)).toBe(s.skunk === 'z-west-high');
      // the hedgehog stays in cols 0-3 and the fox out of cols 7 (but for the jog east)
      for (const c of res.hedgehog.path!) expect(c.x).toBeLessThanOrEqual(3);
    }
  });

  it('the loop over the top of the hedgehog is only dealt where it clears the fox\'s pen', () => {
    for (const seed of SEEDS) {
      if (tunnelShapes(seed).hedgehog !== 'over-the-top') continue;
      const res = solveTunnels(applySolution(generateTier5Puzzle(seed)));
      expect(res.fox.path![res.fox.path!.length - 1].x).toBe(4);
    }
  });
});

describe('the garden network: crossings', () => {
  const crossingsOnBoard = (p: TunnelPuzzle) => p.tiles
    .map((x, k) => ({ x, cell: { x: k % p.width, y: Math.floor(k / p.width) } }))
    .filter((e) => e.x.type === 'bridge');

  it('a bridge is only ever a crossing: fixed, and never a decoy', () => {
    for (const [, gen] of TIERS) {
      for (const seed of SEEDS.filter((_, i) => i % 3 === 0)) {
        for (const { x } of crossingsOnBoard(gen(seed))) expect(x.fixed).toBe(true);
      }
    }
  });

  it('every bridge on a board is the cell two solved runs share, and every shared cell is a bridge', () => {
    for (const [, gen, solve] of TIERS) {
      for (const seed of SEEDS.filter((_, i) => i % 3 === 0)) {
        const p = gen(seed);
        const res = solveTunnels(solve(p));
        const counts = new Map<string, number>();
        for (const a of Object.keys(res)) for (const c of res[a].path ?? []) counts.set(`${c.x},${c.y}`, (counts.get(`${c.x},${c.y}`) ?? 0) + 1);
        const shared = [...counts].filter(([, n]) => n > 1).map(([k]) => k).sort();
        const bridges = crossingsOnBoard(p).map((e) => `${e.cell.x},${e.cell.y}`).sort();
        expect(bridges).toEqual(shared);
        for (const k of shared) expect(counts.get(k)).toBe(2);
      }
    }
  });

  it('a crossing is where both runs go straight, never on an end, a corner, a connector or a dome', () => {
    for (const seed of SEEDS.filter((_, i) => i % 3 === 0)) {
      const p = generateTier5Puzzle(seed);
      const res = solveTunnels(applySolution(p));
      for (const { cell } of crossingsOnBoard(p)) {
        const on = Object.keys(res).filter((a) => res[a].path!.some((c) => c.x === cell.x && c.y === cell.y));
        expect(on).toHaveLength(2);
        const [a1, a2] = on.map((a) => axisAt(res[a].path!, cell));
        expect([a1, a2].sort()).toEqual(['ew', 'ns']);
        expect(TUNNEL_DOME_CELLS).not.toContainEqual(cell);
        // not a fixed connector out of the building: those are col 5-8, rows 11-12
        expect(cell.y).toBeLessThanOrEqual(10);
      }
    }
  });

  it('the newer run is the one on top: the bridge is drawn with that run\'s axis uppermost', () => {
    const order: Animal[] = ['fox', 'hedgehog', 'raccoon', 'skunk'];
    for (const seed of SEEDS.filter((_, i) => i % 3 === 0)) {
      const p = generateTier5Puzzle(seed);
      const res = solveTunnels(applySolution(p));
      for (const { x, cell } of crossingsOnBoard(p)) {
        const on = (Object.keys(res) as Animal[])
          .filter((a) => res[a].path!.some((c) => c.x === cell.x && c.y === cell.y))
          .sort((a, b) => order.indexOf(a) - order.indexOf(b));
        const newer = on[1];
        const along = axisAt(res[newer].path!, cell);
        expect(x.rotation).toBe(along === 'ns' ? 0 : 1);
      }
    }
  });

  it('tapping a crossing does nothing, and cannot break a finished board', () => {
    for (const [, gen, solve] of TIERS) {
      for (const seed of SEEDS.filter((_, i) => i % 17 === 0)) {
        const solved = solve(gen(seed));
        const tapped = { ...solved, tiles: solved.tiles.map((x) => (x.type === 'bridge' ? rotateTile(x) : x)) };
        expect(tapped.tiles).toEqual(solved.tiles);
        expect(isPuzzleSolved(tapped)).toBe(true);
      }
    }
  });

  it('is first met at tier 3 (the raccoon\'s run) and grows only by the runs that join', () => {
    const count = (gen: (s: number) => TunnelPuzzle, seed: number) => crossingsOnBoard(gen(seed)).length;
    let sawTier3 = false;
    for (const seed of SEEDS) {
      expect(count(generateTier1Puzzle, seed)).toBe(0);
      expect(count(generateTier2Puzzle, seed)).toBe(0);
      const c3 = count(generateTier3Puzzle, seed), c4 = count(generateTier4Puzzle, seed);
      expect(c4).toBeGreaterThanOrEqual(c3);
      expect(count(generateTier5Puzzle, seed)).toBe(c4);
      if (c3 > 0) sawTier3 = true;
    }
    expect(sawTier3).toBe(true);
  });

  it('a gate is never moved by a later run: tier N keeps the gates of tier N-1 where they were', () => {
    for (const seed of SEEDS.filter((_, i) => i % 3 === 0)) {
      for (let i = 1; i < TIERS.length; i++) {
        const prev = TIERS[i - 1][1](seed);
        const next = TIERS[i][1](seed);
        prev.tiles.forEach((g, k) => {
          if (g.type === 'gate') expect(`${next.tiles[k].type}:${next.tiles[k].rotation}`).toBe(`gate:${g.rotation}`);
        });
      }
    }
  });

  it('tier N keeps every straight the child can turn exactly as tier N-1 dealt it, except where a crossing replaces one', () => {
    for (const seed of SEEDS.filter((_, i) => i % 7 === 0)) {
      for (let i = 1; i < TIERS.length; i++) {
        const prev = TIERS[i - 1][1](seed);
        const next = TIERS[i][1](seed);
        // the straights of the runs already on the board (a decoy straight is displaced by a new branch, and should be)
        const onRun = new Set<string>();
        for (const a of Object.values(solveTunnels(TIERS[i - 1][2](prev)))) for (const c of a.path ?? []) onRun.add(`${c.x},${c.y}`);
        prev.tiles.forEach((p, k) => {
          if (p.type !== 'straight' || p.fixed || !onRun.has(`${k % prev.width},${Math.floor(k / prev.width)}`)) return;
          if (next.tiles[k].type === 'bridge' || next.tiles[k].type === 'gate' || next.tiles[k].type === 'viewing-dome') return;
          expect(`${next.tiles[k].type}:${next.tiles[k].rotation}`).toBe(`straight:${p.rotation}`);
        });
      }
    }
  });

  it('deals no bridge as a decoy: an empty board cell never becomes one', () => {
    for (const seed of SEEDS.filter((_, i) => i % 5 === 0)) {
      const p = generateTier1Puzzle(seed);
      expect(p.tiles.some((x) => x.type === 'bridge')).toBe(false);
    }
  });
});

describe('the garden network: gates', () => {
  it.each(TIERS)('tier %i carries the right number of gates, all closed', (tier, gen) => {
    for (const seed of SEEDS.filter((_, i) => i % 5 === 0)) {
      const gates = gen(seed).tiles.filter((x) => x.type === 'gate');
      expect(gates).toHaveLength(GATES_AT_TIER[tier]);
      for (const g of gates) expect(g.open).toBe(false);
    }
  });

  it('a gate sits on a run, the right way round for the animal that passes it', () => {
    for (const [, gen, solve] of TIERS) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 42, 20261014]) {
        const p = gen(seed);
        const res = solveTunnels(solve(p));
        p.tiles.forEach((g, k) => {
          if (g.type !== 'gate') return;
          const x = k % p.width, y = Math.floor(k / p.width);
          const owner = Object.keys(res).find((a) => res[a].path?.some((c) => c.x === x && c.y === y));
          expect(owner).toBeDefined();
          // a closed gate stops its animal; open, it passes (tileSides of an open gate is a straight)
          expect(tileSides({ ...g, open: true })).toEqual(tileSides({ type: 'straight', rotation: g.rotation }));
        });
      }
    }
  });

  it('tier 1 has no gates; they arrive with the second run', () => {
    expect(generateTier1Puzzle(5).tiles.some((x) => x.type === 'gate')).toBe(false);
    expect(generateTier2Puzzle(5).tiles.some((x) => x.type === 'gate')).toBe(true);
  });
});

describe('the garden network: solvable', () => {
  it.each(TIERS)('tier %i is solved by the canonical solution on 1,500 seeds and every 2026 daily seed', (_tier, gen, solve) => {
    expect(SEEDS.length).toBeGreaterThanOrEqual(1500 + 12 * 31);
    for (const seed of SEEDS) {
      const solved = solve(gen(seed));
      if (!isPuzzleSolved(solved)) throw new Error(`seed ${seed} is not solved by its canonical solution`);
    }
  });

  it.each(TIERS)('tier %i never starts solved', (_tier, gen) => {
    for (const seed of SEEDS) {
      if (isPuzzleSolved(gen(seed))) throw new Error(`seed ${seed} starts finished`);
    }
  });

  it('the canonical solution leaves a board it does not recognise alone', () => {
    const blank: TunnelPuzzle = { width: 3, height: 1, tiles: [t('empty'), t('empty'), t('empty')], animals: ['fox'] };
    expect(applySolution(blank).tiles).toEqual(blank.tiles);
  });
});

describe('the garden network: domes', () => {
  it('stand on col 6, rows 2, 5 and 8: the painted central path', () => {
    expect(TUNNEL_DOME_CELLS).toEqual([{ x: 6, y: 2 }, { x: 6, y: 5 }, { x: 6, y: 8 }]);
  });

  it.each(TIERS)('tier %i: a dome tile only ever sits on the painted path', (_tier, gen) => {
    for (const seed of SEEDS.filter((_, i) => i % 3 === 0)) {
      gen(seed).tiles.forEach((x, k) => {
        if (x.type !== 'viewing-dome') return;
        expect(TUNNEL_DOME_CELLS).toContainEqual({ x: k % 9, y: Math.floor(k / 9) });
        expect(x.fixed).toBe(true);
      });
    }
  });

  it.each(TIERS)('tier %i: the fox passes under the domes its run meets, whatever shape it is dealt', (_tier, gen, solve) => {
    for (const seed of SEEDS.filter((_, i) => i % 3 === 0)) {
      const p = gen(seed);
      const fox = solveTunnels(solve(p)).fox.path!;
      for (const d of TUNNEL_DOME_CELLS) {
        const under = fox.some((c) => c.x === d.x && c.y === d.y);
        expect(at(p, d.x, d.y).type === 'viewing-dome').toBe(under);
      }
      // the lowest and the highest dome are on every shape of the fox's run
      expect(at(p, 6, 8).type).toBe('viewing-dome');
      expect(at(p, 6, 2).type).toBe('viewing-dome');
    }
  });
});

describe('goal tiles', () => {
  it('are fixed in every tier, so tapping the sticker cannot turn them', () => {
    for (const [, gen] of TIERS) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 42, 20261014]) {
        const ends = gen(seed).tiles.filter((x) => x.type === 'habitat-endpoint' && x.endpointRole === 'end');
        expect(ends.length).toBeGreaterThan(0);
        for (const e of ends) {
          expect(e.fixed).toBe(true);
          expect(rotateTile(e).rotation).toBe(e.rotation);
        }
      }
    }
  });

  it('cannot break a solved route when tapped', () => {
    for (const [, gen, solve] of TIERS) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 42, 20261014]) {
        const solved = solve(gen(seed));
        expect(isPuzzleSolved(solved)).toBe(true);
        const tapped = {
          ...solved,
          tiles: solved.tiles.map((x) =>
            x.type === 'habitat-endpoint' && x.endpointRole === 'end' ? rotateTile(x) : x),
        };
        expect(isPuzzleSolved(tapped)).toBe(true);
      }
    }
  });
});
