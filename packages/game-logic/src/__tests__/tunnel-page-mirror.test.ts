import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  generateTier1Puzzle,
  generateTier2Puzzle,
  generateTier3Puzzle,
  generateTier4Puzzle,
  generateTier5Puzzle,
  solveTunnels,
  rotateTile,
  toggleGate,
  tileSides,
  tunnelShapes,
  TUNNEL_DOME_CELLS,
  type TunnelPuzzle,
  type TunnelTile,
} from '../tunnel';

/**
 * apps/game/public/admin/tunnel.html carries its own copy of the tunnel logic
 * (it is a static page in an iframe and cannot import the package). The host
 * re-checks a win with this module, so the two must agree: the same board for
 * the same seed in every tier, and the same verdict on the same board.
 *
 * The page's copy is lifted out of the repo's own HTML (from its first helper
 * to the tier picker) and run in a fresh context here.
 */

const html = readFileSync(new URL('../../../../apps/game/public/admin/tunnel.html', import.meta.url), 'utf8');
const from = html.indexOf('function baseSides(type)');
const to = html.indexOf('// Tier picker');
if (from < 0 || to < from) throw new Error('could not find the page\'s tunnel logic in tunnel.html');

const page = runInNewContext(
  `${html.slice(from, to)}\n({ generateTier1, generateTier2, generateTier3, generateTier4, generateTier5, solvePuzzle, rotateTile, tileSides, DOME_CELLS })`,
) as {
  generateTier1: (s: number) => TunnelPuzzle;
  generateTier2: (s: number) => TunnelPuzzle;
  generateTier3: (s: number) => TunnelPuzzle;
  generateTier4: (s: number) => TunnelPuzzle;
  generateTier5: (s: number) => TunnelPuzzle;
  solvePuzzle: (p: TunnelPuzzle) => Record<string, { reached: boolean; reason?: string }>;
  rotateTile: (t: TunnelTile) => TunnelTile;
  tileSides: (t: TunnelTile) => ReturnType<typeof tileSides>;
  DOME_CELLS: Array<{ x: number; y: number }>;
};

const PAIRS = [
  [1, generateTier1Puzzle, page.generateTier1],
  [2, generateTier2Puzzle, page.generateTier2],
  [3, generateTier3Puzzle, page.generateTier3],
  [4, generateTier4Puzzle, page.generateTier4],
  [5, generateTier5Puzzle, page.generateTier5],
] as const;

const SEEDS: number[] = [];
for (let s = 1; s <= 1500; s++) SEEDS.push(s);
for (let m = 1; m <= 12; m++) for (let d = 1; d <= 31; d++) SEEDS.push(2026 * 10000 + m * 100 + d);

const norm = (p: TunnelPuzzle) => JSON.stringify([
  p.width, p.height, p.animals,
  p.tiles.map((t) => [t.type, t.type === 'empty' ? 0 : t.rotation, !!t.fixed, t.type === 'gate' ? t.open : null, t.endpointFor ?? null, t.endpointRole ?? null]),
]);

describe('tunnel.html mirrors tunnel.ts', () => {
  it.each(PAIRS)('tier %i: the page makes the same board as the package, on every seed', (_tier, gen, pageGen) => {
    for (const seed of SEEDS) {
      if (norm(gen(seed)) !== norm(pageGen(seed))) throw new Error(`seed ${seed}: the page's board differs from tunnel.ts`);
    }
  });

  it('the page deals the same crossings: the same bridges, fixed, on the same cells', () => {
    let bridges = 0;
    for (const [, gen, pageGen] of PAIRS) {
      for (const seed of SEEDS.filter((_, i) => i % 4 === 0)) {
        const mine = gen(seed).tiles.map((t, k) => (t.type === 'bridge' ? `${k}:${t.rotation}:${!!t.fixed}` : '')).filter(Boolean);
        const theirs = pageGen(seed).tiles.map((t, k) => (t.type === 'bridge' ? `${k}:${t.rotation}:${!!t.fixed}` : '')).filter(Boolean);
        expect(theirs).toEqual(mine);
        bridges += mine.length;
      }
    }
    expect(bridges).toBeGreaterThan(0);
  });

  it('the page and the package turn every kind of tile the same way, and neither turns a bridge', () => {
    const types: TunnelTile['type'][] = ['empty', 'straight', 'corner', 't-junction', 'cross', 'bridge', 'gate', 'habitat-endpoint', 'viewing-dome'];
    for (const type of types) {
      for (const fixed of [false, true]) {
        for (const rotation of [0, 1, 2, 3] as const) {
          const t: TunnelTile = { type, rotation, fixed, open: type === 'gate' ? false : undefined };
          expect(page.rotateTile({ ...t })).toEqual(rotateTile({ ...t }));
          expect(page.tileSides({ ...t })).toEqual(tileSides({ ...t }));
          if (type === 'bridge') expect(page.rotateTile({ ...t }).rotation).toBe(rotation);
        }
      }
    }
  });

  it('the page ignores a tap on a crossing, the way it ignores a goal tile', () => {
    // the click handler's list of tiles that do nothing when tapped
    const tap = html.slice(html.indexOf('function onTileClick'), html.indexOf('function onSubmit'));
    expect(tap).toMatch(/t\.type === 'habitat-endpoint'[^\n]*t\.type === 'bridge'/);
  });

  it('the page draws the crossing as a bridge: planks and rails over a dark-mouthed passage', () => {
    const at0 = html.indexOf('// The crossing of two runs');
    const art = html.slice(at0, html.indexOf("tile.type === 'gate'", at0));
    expect(at0).toBeGreaterThan(0);
    expect(art).toContain('plank deck');
    expect(art).toContain('rail');
    expect(art).toContain('dark mouths');
  });

  it('the page deals a bridge for every seed the package does, and the shapes agree with the package\'s own', () => {
    // a dealt shape is a fact about the seed: spot-check the page's tier-5 board against tunnelShapes
    for (const seed of SEEDS.filter((_, i) => i % 29 === 0)) {
      const s = tunnelShapes(seed);
      const board = page.generateTier5(seed);
      const at = (x: number, y: number) => board.tiles[y * board.width + x];
      expect(at(8, 7).type === 'corner' && !!at(8, 7).fixed).toBe(s.fox === 'z-east');
      expect(at(4, 7).type === 'corner' && !!at(4, 7).fixed).toBe(s.fox === 'z-west');
      expect(at(5, 3).type === 'corner' && !!at(5, 3).fixed).toBe(s.skunk === 'z-west-high');
    }
  });

  it('the page\'s domes stand where the package says', () => {
    expect(page.DOME_CELLS.map((c) => ({ x: c.x, y: c.y }))).toEqual(TUNNEL_DOME_CELLS.map((c) => ({ x: c.x, y: c.y })));
  });

  it('the page and the package give the same verdict on boards a child has been tapping', () => {
    let s = 12345;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (const [, gen] of PAIRS) {
      for (let i = 0; i < 120; i++) {
        const p = gen(1 + Math.floor(rnd() * 3000));
        const taps = Math.floor(rnd() * 60);
        for (let c = 0; c < taps; c++) {
          const k = Math.floor(rnd() * p.tiles.length);
          const t = p.tiles[k];
          if (t.type === 'empty' || t.fixed) continue;
          p.tiles[k] = t.type === 'gate' ? toggleGate(t) : rotateTile(t);
        }
        const mine = solveTunnels(p);
        const theirs = page.solvePuzzle(JSON.parse(JSON.stringify(p)));
        for (const a of p.animals) {
          expect(!!theirs[a].reached).toBe(!!mine[a].reached);
          expect(theirs[a].reason).toBe(mine[a].reason);
        }
      }
    }
  });
});
