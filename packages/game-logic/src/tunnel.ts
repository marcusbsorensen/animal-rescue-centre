/**
 * Garden tunnel mini-game — pure logic.
 *
 * Pipe-rotation puzzle. The player rotates square tunnel tiles on a
 * grid so that each animal's source endpoint connects to its OWN
 * destination endpoint (NOT another animal's endpoint).
 *
 * See:
 *   - docs/garden-tunnel-minigame-2026-05-03.md (design brief)
 *   - docs/garden-tunnel-tile-inventory-2026-05-03.md (tile spec)
 *
 * No Phaser deps. TDD'd, mirrors `crate-stacking.ts` in style.
 */

// ── Tile inventory ────────────────────────────────────────────

/**
 * The 9 tile types. Most have rotational variants the player cycles
 * through with a click; `cross`, `empty`, `viewing-dome` and
 * `habitat-endpoint` are visually rotation-invariant.
 *
 * Bridges have an unusual property: two tunnels that pass over/under
 * each other WITHOUT mixing — N↔S flow is independent of E↔W flow.
 */
export type TileType =
  | 'empty'
  | 'straight'
  | 'corner'
  | 't-junction'
  | 'cross'
  | 'bridge'
  | 'gate'
  | 'habitat-endpoint'
  | 'viewing-dome';

export type Animal = 'fox' | 'skunk' | 'hedgehog' | 'raccoon';

export type Rotation = 0 | 1 | 2 | 3;

export interface TunnelTile {
  type: TileType;
  /** 0–3, each step = 90° clockwise. */
  rotation: Rotation;
  /** Fixed tiles can't be rotated by the player (puzzle givens). */
  fixed?: boolean;
  /** Gates only — true = passable, false = sealed. */
  open?: boolean;
  /** Habitat endpoints only — which animal owns this start/end. */
  endpointFor?: Animal;
  /** Habitat endpoints only — start (animal source) or end (destination). */
  endpointRole?: 'start' | 'end';
}

export interface TunnelPuzzle {
  /** Columns. */
  width: number;
  /** Rows. */
  height: number;
  /** Row-major: tiles[row * width + col]. */
  tiles: TunnelTile[];
  /** Animals participating in the puzzle. */
  animals: Animal[];
}

// ── Tile connectivity ─────────────────────────────────────────

/** Sides of a square tile. */
export interface Sides {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

const ALL_CLOSED: Sides = { n: false, e: false, s: false, w: false };

/**
 * Base sides at rotation 0. We rotate clockwise to derive the others.
 *
 * Conventions:
 *  - `straight` r=0 = vertical (N+S open)
 *  - `corner`   r=0 = ┘ (N+W open)  — turning from north into west
 *  - `t-junction` r=0 = ┴ (N+E+W open) — sealed south
 *  - `cross`    all 4
 *  - `bridge`   treat the connectivity as "all 4" — but `bridgeChannels`
 *               separates N↔S from E↔W so streams don't mix.
 *  - `gate`     same as straight when open, all-closed when shut. Gate
 *               orientation is rotation-driven (NS at r=0/2; EW at 1/3).
 *  - `habitat-endpoint` opens ONE side toward the tunnel network.
 *               r=0 = south (endpoint sits at top, exits downward),
 *               r=1 = west, r=2 = north, r=3 = east.
 *  - `viewing-dome` cosmetic — connects on the trunk axis as a
 *               straight (vertical at r=0/2; horizontal at 1/3).
 *  - `empty`    no connections.
 */
function baseSides(type: TileType): Sides {
  switch (type) {
    case 'empty':           return { ...ALL_CLOSED };
    case 'straight':        return { n: true,  e: false, s: true,  w: false };
    case 'corner':          return { n: true,  e: false, s: false, w: true  };
    case 't-junction':      return { n: true,  e: true,  s: false, w: true  };
    case 'cross':           return { n: true,  e: true,  s: true,  w: true  };
    case 'bridge':          return { n: true,  e: true,  s: true,  w: true  };
    case 'gate':            return { n: true,  e: false, s: true,  w: false };
    case 'habitat-endpoint':return { n: false, e: false, s: true,  w: false };
    case 'viewing-dome':    return { n: true,  e: false, s: true,  w: false };
  }
}

/** Rotate a sides record clockwise N times. */
function rotateSides(sides: Sides, r: Rotation): Sides {
  // 1 cw step: N→E, E→S, S→W, W→N
  let { n, e, s, w } = sides;
  for (let i = 0; i < r; i++) {
    const nn = w, ee = n, ss = e, ww = s;
    n = nn; e = ee; s = ss; w = ww;
  }
  return { n, e, s, w };
}

/**
 * Return which sides of a tile are open after considering its rotation
 * and (for gates) its open/shut state.
 */
export function tileSides(tile: TunnelTile): Sides {
  if (tile.type === 'empty') return { ...ALL_CLOSED };
  if (tile.type === 'gate' && tile.open === false) return { ...ALL_CLOSED };
  return rotateSides(baseSides(tile.type), tile.rotation);
}

/**
 * Rotate a tile 90° clockwise. Fixed tiles + symmetric tiles
 * (cross, empty) return a copy unchanged. Endpoints DO rotate
 * conceptually, but most are `fixed:true` in practice so the rotation
 * call won't fire from the UI.
 */
export function rotateTile(tile: TunnelTile): TunnelTile {
  if (tile.fixed) return { ...tile };
  // cross is symmetric; empty has no orientation
  if (tile.type === 'cross' || tile.type === 'empty') return { ...tile };
  const next: Rotation = (((tile.rotation + 1) % 4) as Rotation);
  return { ...tile, rotation: next };
}

/** Toggle a gate's open/shut state. No-op on non-gates. */
export function toggleGate(tile: TunnelTile): TunnelTile {
  if (tile.type !== 'gate') return { ...tile };
  return { ...tile, open: tile.open === false ? true : false };
}

// ── Puzzle helpers ────────────────────────────────────────────

function tileAt(puzzle: TunnelPuzzle, x: number, y: number): TunnelTile | undefined {
  if (x < 0 || y < 0 || x >= puzzle.width || y >= puzzle.height) return undefined;
  return puzzle.tiles[y * puzzle.width + x];
}

/**
 * Find all habitat endpoints for a given animal: { start, end } cells.
 */
function findEndpoints(puzzle: TunnelPuzzle, animal: Animal):
  { start?: { x: number; y: number }; end?: { x: number; y: number } } {
  let start: { x: number; y: number } | undefined;
  let end: { x: number; y: number } | undefined;
  for (let y = 0; y < puzzle.height; y++) {
    for (let x = 0; x < puzzle.width; x++) {
      const t = tileAt(puzzle, x, y);
      if (!t || t.type !== 'habitat-endpoint' || t.endpointFor !== animal) continue;
      if (t.endpointRole === 'start') start = { x, y };
      else if (t.endpointRole === 'end') end = { x, y };
    }
  }
  return { start, end };
}

/**
 * Bridge channels: at rotation 0/2 the tile carries N↔S as one channel
 * and E↔W as a separate channel. At rotation 1/3 the channels swap
 * (still N↔S vs E↔W — bridge is essentially symmetric, but we track
 * rotation so the painted "over" plank visibly switches).
 *
 * For pathfinding what matters is: ENTERING from one side limits the
 * EXIT side — you exit the OPPOSITE side, never a perpendicular one.
 */
function bridgeExitSide(enterSide: 'n' | 'e' | 's' | 'w'): 'n' | 'e' | 's' | 'w' {
  switch (enterSide) {
    case 'n': return 's';
    case 's': return 'n';
    case 'e': return 'w';
    case 'w': return 'e';
  }
}

const OPPOSITE: Record<'n' | 'e' | 's' | 'w', 'n' | 'e' | 's' | 'w'> = {
  n: 's', s: 'n', e: 'w', w: 'e',
};

const DELTA: Record<'n' | 'e' | 's' | 'w', { dx: number; dy: number }> = {
  n: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },
  e: { dx: 1, dy: 0 },
  w: { dx: -1, dy: 0 },
};

// ── Pathfinding ───────────────────────────────────────────────

export type SolveReason = 'wrong-destination' | 'dead-end' | 'gate-closed' | 'no-start';

export interface SolveResult {
  reached: boolean;
  path?: Array<{ x: number; y: number }>;
  reason?: SolveReason;
}

/**
 * Walk the tunnel network from each animal's start to wherever it
 * ends up. Pure DFS following the unique connected-pipe trail,
 * tracking visited (cell, enter-side) pairs to handle bridges.
 *
 * Returns one result per animal in the puzzle.
 */
export function solveTunnels(puzzle: TunnelPuzzle): Record<string, SolveResult> {
  const out: Record<string, SolveResult> = {};
  for (const animal of puzzle.animals) {
    out[animal] = solveOne(puzzle, animal);
  }
  return out;
}

function solveOne(puzzle: TunnelPuzzle, animal: Animal): SolveResult {
  const { start, end } = findEndpoints(puzzle, animal);
  if (!start || !end) return { reached: false, reason: 'no-start' };

  const startTile = tileAt(puzzle, start.x, start.y);
  if (!startTile) return { reached: false, reason: 'no-start' };
  // The endpoint exits on whichever side the rotation opens (one side).
  const startSides = tileSides(startTile);
  const exitSide = (['n', 'e', 's', 'w'] as const).find((d) => startSides[d]);
  if (!exitSide) return { reached: false, reason: 'dead-end' };

  // Step into the neighbour.
  const path: Array<{ x: number; y: number }> = [{ x: start.x, y: start.y }];
  let x = start.x + DELTA[exitSide].dx;
  let y = start.y + DELTA[exitSide].dy;
  let enterSide: 'n' | 'e' | 's' | 'w' = OPPOSITE[exitSide];

  // Visited (cell + enter side) — bridges allow re-entry from a
  // different side, so we don't blanket-block revisits.
  const visited = new Set<string>();
  const guard = puzzle.width * puzzle.height * 4 + 4;
  for (let step = 0; step < guard; step++) {
    const tile = tileAt(puzzle, x, y);
    if (!tile) return { reached: false, path, reason: 'dead-end' };

    // Endpoint check before any traversal logic — we've arrived.
    if (tile.type === 'habitat-endpoint') {
      path.push({ x, y });
      // Endpoint must be reachable on the side we came in on.
      const sides = tileSides(tile);
      if (!sides[enterSide]) return { reached: false, path, reason: 'dead-end' };
      // Right destination?
      if (tile.endpointFor === animal && tile.endpointRole === 'end') {
        return { reached: true, path };
      }
      return { reached: false, path, reason: 'wrong-destination' };
    }

    // Closed gate?
    if (tile.type === 'gate' && tile.open === false) {
      return { reached: false, path, reason: 'gate-closed' };
    }

    const sides = tileSides(tile);
    if (!sides[enterSide]) {
      // The pipe doesn't actually connect on the side we came in.
      return { reached: false, path, reason: 'dead-end' };
    }

    const key = `${x},${y},${enterSide}`;
    if (visited.has(key)) return { reached: false, path, reason: 'dead-end' };
    visited.add(key);
    path.push({ x, y });

    // Determine exit side from this tile.
    let nextExit: 'n' | 'e' | 's' | 'w' | undefined;
    if (tile.type === 'bridge') {
      nextExit = bridgeExitSide(enterSide);
      // Bridge must have both halves of the relevant channel open.
      if (!sides[nextExit]) return { reached: false, path, reason: 'dead-end' };
    } else {
      // For straight, corner, T, cross, gate(open), viewing-dome:
      // the next-exit is the OTHER open side. For T/cross with > 2
      // sides this is ambiguous — for v1 (tier 1 only puzzles) we
      // pick the FIRST non-enter open side; this is a known
      // limitation noted in the design docs (later tiers will likely
      // require the player to "drive" intent via gate state).
      const candidates = (['n', 'e', 's', 'w'] as const).filter((d) => sides[d] && d !== enterSide);
      if (candidates.length === 0) return { reached: false, path, reason: 'dead-end' };
      nextExit = candidates[0];
    }

    x = x + DELTA[nextExit].dx;
    y = y + DELTA[nextExit].dy;
    enterSide = OPPOSITE[nextExit];
  }
  return { reached: false, path, reason: 'dead-end' };
}

/** True iff every animal in the puzzle reaches its OWN end-endpoint. */
export function isPuzzleSolved(puzzle: TunnelPuzzle): boolean {
  const r = solveTunnels(puzzle);
  return puzzle.animals.every((a) => r[a]?.reached === true);
}

// ── Tier 1 puzzle generator ───────────────────────────────────

/**
 * Mulberry32 — small deterministic PRNG. Same seed → same sequence.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emptyTile(): TunnelTile {
  return { type: 'empty', rotation: 0 };
}

/**
 * Build the canonical tier-1 9×9 puzzle, then randomise each player-
 * rotatable tile's rotation using `seed`. Layout (per tile-inventory
 * doc §3 tier 1):
 *
 *  - Trunk in column 6 (0-indexed) — vertical straights row 2..8
 *  - Tunnel mouth at (6, 8) — habitat-endpoint, fox start, exits N
 *  - Corner at (6, 1) (fixed) — connects trunk going N to fox-branch
 *    going W. ┘ shape (N+W).
 *  - Fox branch row 1 columns 1..5 = horizontal straights
 *  - Fox endpoint at (0, 1) — habitat-endpoint, fox end, exits E
 *  - Cosmetic viewing dome at (6, 3) (fixed, non-rotatable, on trunk)
 *
 * The player rotates the 5 trunk straights + 5 branch straights so
 * they connect. The corner at (6,1) is fixed.
 */
export function generateTier1Puzzle(seed: number): TunnelPuzzle {
  const W = 9, H = 9;
  const tiles: TunnelTile[] = [];
  for (let i = 0; i < W * H; i++) tiles.push(emptyTile());

  const set = (x: number, y: number, t: TunnelTile) => {
    tiles[y * W + x] = t;
  };

  const rng = mulberry32(seed);
  const randR = (): Rotation => Math.floor(rng() * 4) as Rotation;

  // Layout: trunk runs UP col 6 (= 2/3 across) matching the
  // aboveground central path's actual position. Marcus 2026-05-04
  // asked for a small visual shift LEFT by ~2/3 tile-width — that's
  // applied as a CSS translate on the grid in tunnel.html, NOT as
  // a column change in the puzzle data (avoids breaking pathfinding
  // grid-cell math).

  // Building tunnel mouth at (6, 8) — south end of trunk. r=2 = N-open.
  set(6, 8, {
    type: 'habitat-endpoint', rotation: 2, fixed: true,
    endpointFor: 'fox', endpointRole: 'start',
  });

  // Trunk straights at (6, y) for y=2..7 — player rotates to vertical.
  for (let y = 2; y <= 7; y++) {
    set(6, y, { type: 'straight', rotation: randR() });
  }

  // Three viewing domes along the trunk (replace the straights).
  set(6, 6, { type: 'viewing-dome', rotation: 0, fixed: true });
  set(6, 4, { type: 'viewing-dome', rotation: 0, fixed: true });
  set(6, 2, { type: 'viewing-dome', rotation: 0, fixed: true });

  // Top of trunk: corner at (6, 1) turning S+W. r=3 = ┐ (S+W).
  set(6, 1, { type: 'corner', rotation: 3, fixed: true });

  // Fox branch — horizontal straights at (x, 1) for x=1..5.
  for (let x = 1; x <= 5; x++) {
    set(x, 1, { type: 'straight', rotation: randR() });
  }

  // Fox pen entry at (0, 1) — west end of branch. r=3 = E-open.
  set(0, 1, {
    type: 'habitat-endpoint', rotation: 3, fixed: true,
    endpointFor: 'fox', endpointRole: 'end',
  });

  return { width: W, height: H, tiles, animals: ['fox'] };
}

/**
 * Apply the canonical solution to a tier-1 puzzle (straighten every
 * straight to align with its corridor). Useful for tests + the
 * "give me the answer" debug path.
 */
export function applyTier1Solution(puzzle: TunnelPuzzle): TunnelPuzzle {
  const tiles = puzzle.tiles.map((t) => ({ ...t }));
  const idx = (x: number, y: number) => y * puzzle.width + x;
  for (let y = 2; y <= 7; y++) {
    const t = tiles[idx(6, y)];
    if (t.type === 'straight') t.rotation = 0;
  }
  for (let x = 1; x <= 5; x++) {
    const t = tiles[idx(x, 1)];
    if (t.type === 'straight') t.rotation = 1;
  }
  return { ...puzzle, tiles };
}
