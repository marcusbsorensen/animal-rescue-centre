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

  it('no two animals share a cell on their solved runs', () => {
    for (const [, gen, solve] of TIERS) {
      for (const seed of SEEDS.filter((_, i) => i % 3 === 0)) {
        const res = solveTunnels(solve(gen(seed)));
        const owner = new Map<string, string>();
        for (const a of Object.keys(res)) {
          for (const c of res[a].path ?? []) {
            const k = `${c.x},${c.y}`;
            expect(owner.get(k) ?? a).toBe(a);
            owner.set(k, a);
          }
        }
      }
    }
  });

  it('deals each animal\'s shapes, and only the ones that fit beside the others', () => {
    const shapes: Record<string, Set<string>> = { fox: new Set(), hedgehog: new Set() };
    for (const seed of SEEDS.slice(0, 400)) {
      const p = generateTier5Puzzle(seed);
      const res = solveTunnels(applySolution(p));
      const fox = res.fox.path!;
      shapes.fox.add(fox.some((c) => c.x === 4 && c.y === 5) ? 'z-west' : fox.some((c) => c.y === 0) ? 'approach-north' : 'straight');
      const h = res.hedgehog.path!;
      shapes.hedgehog.add(h.some((c) => c.y === 1 && c.x === 3) ? 'over-the-top'
        : h.some((c) => c.y === 4 && c.x === 2) ? 'approach-north'
          : h.some((c) => c.x === 3) ? 'z-east' : 'straight');
      // the loop that climbs into the fox's pen rows is only dealt when the fox's pen is in col 4
      if (shapes.hedgehog.has('over-the-top') && h.some((c) => c.y === 1 && c.x === 3)) {
        const foxEnd = fox[fox.length - 1];
        expect(foxEnd.x).toBe(4);
      }
      // nobody runs through col 7-8 but the raccoon and the skunk
      for (const c of fox) expect(c.x).toBeLessThanOrEqual(6);
      for (const c of h) expect(c.x).toBeLessThanOrEqual(3);
    }
    expect([...shapes.fox].sort()).toEqual(['approach-north', 'straight', 'z-west']);
    expect([...shapes.hedgehog].sort()).toEqual(['approach-north', 'over-the-top', 'straight', 'z-east']);
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
