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
 * The bridge is the CROSSING (118A): two tunnels that pass over/under
 * each other WITHOUT mixing — N↔S flow is independent of E↔W flow. It is
 * fixed and never turns (a tap does nothing, like a goal tile). Its
 * `rotation` is only the picture: 0 draws the north-south run on top, 1 the
 * east-west run.
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
 *  - `bridge`   treat the connectivity as "all 4" — but the walk goes
 *               straight on (`bridgeExitSide`), so N↔S and E↔W streams
 *               don't mix.
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
 * (cross, empty) return a copy unchanged, and so does a bridge: a crossing
 * never turns, fixed or not. Endpoints DO rotate conceptually, but most are
 * `fixed:true` in practice so the rotation call won't fire from the UI.
 */
export function rotateTile(tile: TunnelTile): TunnelTile {
  if (tile.fixed) return { ...tile };
  // cross is symmetric; empty has no orientation; a bridge (crossing) never turns
  if (tile.type === 'cross' || tile.type === 'empty' || tile.type === 'bridge') return { ...tile };
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
 * A bridge carries N↔S as one channel and E↔W as a separate channel. Which
 * one is on top is only the picture (rotation 0/2 north-south over, 1/3
 * east-west over); the generator sets it and nothing else turns it.
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

    // Endpoint check — we've arrived. Endpoint must be open on the
    // side we entered from. The END tile is fixed (the child cannot
    // turn it), so this only fails when the pipe that reaches it
    // approaches from the wrong side — which also fixes the 'fox got
    // there anyway' bug where a happy accident through decoys would
    // otherwise let it through.
    if (tile.type === 'habitat-endpoint') {
      path.push({ x, y });
      const sides = tileSides(tile);
      if (!sides[enterSide]) return { reached: false, path, reason: 'dead-end' };
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

// ── Habitat exit-point catalogue ──────────────────────────────

/**
 * Each habitat enclosure has a SET of valid tile coords where the
 * tunnel can break the surface (the habitat-endpoint cell). The
 * puzzle generator picks one per seed → different daily layouts
 * use different exit points, so the tunnel grid stays varied as
 * the kid replays.
 *
 * Constraints honoured by every exit position:
 *  - sits INSIDE the painted habitat region (so the fox doesn't
 *    "exit into the street" beyond the ARC site boundary)
 *  - leaves at least one tile of straight tunnel between itself
 *    and the trunk corner (so the puzzle has rotation choices)
 *  - sits on the row that the trunk's branch turns onto
 *
 * Tier 1 only uses fox; skunk/hedgehog/raccoon entries become
 * live in tiers 2-4. All coords reference the 9×13 grid.
 */
export const HABITAT_EXITS: Record<Animal, ReadonlyArray<{ x: number; y: number }>> = {
  // Fox enclosure (cols 0-6, rows 0-3) — 4×2 exits in rows 1-2.
  fox: [
    { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 },
    { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
  ],
  // Skunk enclosure (cols 7-9) — cols 7 + 8 inside the painted
  // region. Tier 4 uses the col-8 entries so the skunk trunk can
  // sit east of the raccoon trunk (col 7).
  skunk: [
    { x: 7, y: 1 }, { x: 7, y: 2 },
    { x: 8, y: 1 }, { x: 8, y: 2 },
  ],
  // Hedgehog enclosure — 4×2 exits in rows 4-5 (matches the
  // hedgehog patch which sits at rows 4-6 in overlay-mode).
  hedgehog: [
    { x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 },
    { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 },
  ],
  // Raccoon enclosure — col 7, rows 4-5.
  raccoon: [
    { x: 7, y: 4 }, { x: 7, y: 5 },
  ],
};


// ── The garden network: one board that grows tier by tier ─────

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
 * THE DESIGN (docs/garden-tunnel-minigame-2026-05-03.md): the tunnel is ONE
 * network that mirrors the aboveground site, and it grows the way the site
 * grows. Difficulty is not a different shape per tier; it is the same board
 * with more of it live:
 *
 *   tier 1  fox                         the intro: one run, no gates
 *   tier 2  fox + hedgehog              a second run, and gates arrive
 *   tier 3  fox + hedgehog + raccoon    a third run
 *   tier 4  all four (skunk joins)      four runs, a second gate on each
 *   tier 5  all four, rush hour         a third gate where a run is long enough
 *
 * Each run is built from the seed alone, whatever the tier, so for one seed
 * tier N is tier N-1 plus a branch: same fox, same hedgehog, and the decoys
 * (below) sit on the same cells. That is what "built by inheritance" means
 * here, and it is checked in the tests.
 *
 * CROSSINGS (118A). The fox owns col 6, the raccoon col 7, the skunk col 8:
 * three adjacent columns. A fox that jogs east, or a raccoon or skunk that
 * jogs west, has to get past another animal's run, and the way past is a
 * crossing: one `bridge` tile where two runs pass straight through at right
 * angles, one over the other. The crossing is FIXED (a tap does nothing, like
 * a goal tile), so the child never has to work out which way round it goes;
 * what she works out is the rest of the two runs. Three rules keep it honest:
 *
 *   - only plain straight-through pieces cross: never an endpoint, a corner,
 *     the connectors out of the building, a dome, or a gate the board already
 *     has when the newer run arrives;
 *   - the run laid LATER is the one that goes over (the tunnel dug last goes
 *     above the older one), so `rotation` on a bridge says which axis is on
 *     top: 0 north-south over, 1 east-west over;
 *   - two runs share a cell nowhere else.
 *
 * Each run is dealt from a list of shapes, and only the shapes that fit beside
 * the runs already laid are dealt; the next run must still have a way through
 * (a one-step look-ahead), so the board is always buildable. The hedgehog has
 * cols 1-3 to itself and never crosses anything.
 */

/**
 * Where the glass viewing domes of the site map stand: col 6, rows 2, 5 and
 * 8, the painted central path. They are a fact about the map above the
 * tunnels, not about wherever a run happens to go, so the page draws them
 * from here and not from the tiles. A run that passes under one has a fixed
 * `viewing-dome` tile there; one that jogs away leaves it over plain soil.
 * A crossing is never built under a dome.
 */
export const TUNNEL_DOME_CELLS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 6, y: 2 }, { x: 6, y: 5 }, { x: 6, y: 8 },
];

const NET_W = 9;
const NET_H = 13;

type Dir = 'n' | 'e' | 's' | 'w';
type Cell = [number, number];

/** One animal's run: start endpoint first, end endpoint last, tunnel pieces between. */
interface Route {
  animal: Animal;
  shape: string;
  path: Cell[];
  /** Straights this many cells after the start are factory-fixed (the connector out of the building). */
  fixedLead: number;
  /** False for a run that must stay out of every other run's way (the hedgehog's). */
  crosses: boolean;
  /**
   * One entry per gate level this run carries (gate level 1 arrives at tier 2,
   * 2 at tier 4, 3 at tier 5): the cells the gate prefers, tried in order.
   * When none of them is free (a crossing took it) the first free rotatable
   * straight on the run is used, so a run always has all its gates.
   */
  gates: Cell[][];
}

const key = (c: Cell) => c[0] + ',' + c[1];
const DOME_KEYS = new Set(TUNNEL_DOME_CELLS.map((d) => d.x + ',' + d.y));

function dirBetween(a: Cell, b: Cell): Dir {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx > 0) return 'e';
  if (dx < 0) return 'w';
  return dy > 0 ? 's' : 'n';
}

/** An endpoint opens one side: r0 south, r1 west, r2 north, r3 east. */
const ENDPOINT_ROTATION: Record<Dir, Rotation> = { s: 0, w: 1, n: 2, e: 3 };

/** A corner's rotation from the two sides it joins: r0 N+W, r1 N+E, r2 S+E, r3 S+W. */
function cornerRotation(a: Dir, b: Dir): Rotation {
  const has = (d: Dir) => a === d || b === d;
  if (has('n') && has('w')) return 0;
  if (has('n') && has('e')) return 1;
  if (has('s') && has('e')) return 2;
  return 3;
}

/** Cells (x, y0) to (x, y1) inclusive, in either direction. */
function colRun(x: number, y0: number, y1: number): Cell[] {
  const out: Cell[] = [];
  const step = y1 >= y0 ? 1 : -1;
  for (let y = y0; y !== y1 + step; y += step) out.push([x, y]);
  return out;
}

/** Cells (x0, y) to (x1, y) inclusive, in either direction. */
function rowRun(y: number, x0: number, x1: number): Cell[] {
  const out: Cell[] = [];
  const step = x1 >= x0 ? 1 : -1;
  for (let x = x0; x !== x1 + step; x += step) out.push([x, y]);
  return out;
}

/** The axis a run passes along at cell i, if that cell is a plain straight-through piece. */
function throughAxis(route: Route, i: number): 'ns' | 'ew' | null {
  if (i <= 0 || i >= route.path.length - 1) return null;
  const a = route.path[i - 1];
  const b = route.path[i + 1];
  if (a[0] === b[0]) return 'ns';
  if (a[1] === b[1]) return 'ew';
  return null;
}

// ── The shapes ────────────────────────────────────────────────

/** A shape of one animal's run, and where it ends. */
interface Variant {
  id: string;
  shape: string;
  route: Route;
}

// Shapes are dealt by weight (a shape listed twice is dealt twice as often).
const FOX_SHAPES = ['straight', 'z-west', 'z-west', 'z-east', 'approach-north', 'approach-north'] as const;
const HEDGEHOG_SHAPES = ['straight', 'z-east', 'z-east', 'approach-north', 'approach-north', 'over-the-top', 'over-the-top'] as const;
const RACCOON_SHAPES = ['straight', 'z-west', 'z-west', 'approach-north', 'approach-north'] as const;
const SKUNK_SHAPES = ['straight', 'z-west', 'z-west', 'z-west-high'] as const;

/**
 * Fox: building mouth (5, 10), corner (6, 10), then col 6 north to the pen.
 *   straight        straight up, west along row 1
 *   z-west          jogs west at row 7, climbs col 4, back east at row 4
 *   z-east          jogs east at row 7 (over the raccoon's col 7), climbs col 8
 *                   to row 4 and back west
 *   approach-north  climbs to row 0, west along row 0, down into the pen
 */
function foxRoute(shape: string, exit: { x: number; y: number }, n: number): Variant {
  const row = shape === 'approach-north' ? 0 : 1;
  const path: Cell[] = [[5, 10]];
  if (shape === 'z-west') {
    path.push(...colRun(6, 10, 8), [6, 7], [5, 7], [4, 7], ...colRun(4, 6, 4), [5, 4], [6, 4], ...colRun(6, 3, 1));
  } else if (shape === 'z-east') {
    path.push(...colRun(6, 10, 8), [6, 7], [7, 7], [8, 7], ...colRun(8, 6, 4), [7, 4], [6, 4], ...colRun(6, 3, 1));
  } else {
    path.push(...colRun(6, 10, row));
  }
  path.push(...rowRun(row, 5, exit.x));
  for (let y = row + 1; y <= exit.y; y++) path.push([exit.x, y]);
  const gates: Cell[][] = shape === 'z-west' ? [[[4, 6]], [[6, 9]], [[5, 4]]]
    : shape === 'z-east' ? [[[8, 6]], [[8, 5]], [[7, 4]]]
      : [[[6, 7]], [[6, 9]], [[6, 4]]];
  return { id: `fox:${shape}:${n}`, shape, route: { animal: 'fox', shape, path, fixedLead: 0, crosses: true, gates } };
}

/**
 * Hedgehog: building mouth (0, 10), corner (1, 10), then col 1 north.
 *   straight        straight up to the pen
 *   z-east          jogs east at row 7, climbs col 3, back west at row 5
 *   approach-north  jogs east at row 6, climbs col 3 past the pen, back
 *                   west along row 4 and down into it
 *   over-the-top    the wide loop: up col 3 to row 1, west, down col 1
 */
function hedgehogRoute(shape: string, exitY: number): Variant {
  const path: Cell[] = [[0, 10]];
  if (shape === 'straight') {
    path.push(...colRun(1, 10, exitY));
  } else if (shape === 'z-east') {
    path.push(...colRun(1, 10, 7), [2, 7], [3, 7], [3, 6], [3, 5], [2, 5], [1, 5]);
    if (exitY === 4) path.push([1, 4]);
  } else if (shape === 'approach-north') {
    path.push(...colRun(1, 10, 6), [2, 6], [3, 6], [3, 5], [3, 4], [2, 4], [1, 4], [1, 5]);
  } else {
    path.push(...colRun(1, 10, 6), [2, 6], [3, 6], ...colRun(3, 5, 1), [2, 1], [1, 1], [1, 2], [1, 3], [1, 4]);
  }
  return {
    id: `hedgehog:${shape}:${exitY}`,
    shape,
    route: { animal: 'hedgehog', shape, path, fixedLead: 0, crosses: false, gates: [[[1, 7], [1, 8]], [[1, 9]]] },
  };
}

/**
 * Raccoon: mouth (5, 11), a fixed connector east, then up col 7.
 *   straight        straight up col 7
 *   z-west          jogs west at row 9 (over the fox's col 6), climbs col 5 to
 *                   row 6 and back east over col 6 again
 *   approach-north  climbs to row 7, jogs west at row 6, climbs col 5 past the
 *                   pen and comes back east along row 4 into it from above
 */
function raccoonRoute(shape: string, exitY: number): Variant {
  const path: Cell[] = [[5, 11], [6, 11], [7, 11]];
  let gates: Cell[][];
  if (shape === 'straight') {
    path.push(...colRun(7, 10, exitY));
    gates = [[[7, 7], [7, 8]], [[7, 9]]];
  } else if (shape === 'z-west') {
    path.push([7, 10], [7, 9], [6, 9], [5, 9], [5, 8], [5, 7], [5, 6], [6, 6], [7, 6]);
    if (exitY === 4) path.push([7, 5]);
    path.push([7, exitY]);
    gates = [[[5, 7]], [[7, 10]]];
  } else {
    path.push(...colRun(7, 10, 7), [7, 6], [6, 6], [5, 6], [5, 5], [5, 4], [6, 4], [7, 4], [7, 5]);
    gates = [[[7, 7]], [[7, 9]]];
  }
  return { id: `raccoon:${shape}:${exitY}`, shape, route: { animal: 'raccoon', shape, path, fixedLead: 1, crosses: true, gates } };
}

/**
 * Skunk: mouth (5, 12), two fixed connectors east, then up col 8.
 *   straight        straight up col 8
 *   z-west          jogs west at row 9 (over the raccoon's col 7 and the fox's
 *                   col 6), climbs col 5 to row 6 and back east over both
 *   z-west-high     the same jog out, but climbs col 5 to row 3 and comes back
 *                   east there: the way round when the fox has taken col 8
 */
function skunkRoute(shape: string, exitY: number): Variant {
  const path: Cell[] = [[5, 12], [6, 12], [7, 12], [8, 12]];
  let gates: Cell[][];
  if (shape === 'straight') {
    path.push(...colRun(8, 11, exitY));
    gates = [[[8, 7], [8, 8]], [[8, 9]], [[8, 4], [8, 5]]];
  } else if (shape === 'z-west') {
    path.push([8, 11], [8, 10], [8, 9], [7, 9], [6, 9], [5, 9], [5, 8], [5, 7], [5, 6], [6, 6], [7, 6], [8, 6], ...colRun(8, 5, exitY));
    gates = [[[5, 7]], [[8, 10]], [[8, 5], [8, 4]]];
  } else {
    path.push([8, 11], [8, 10], [8, 9], [7, 9], [6, 9], [5, 9], ...colRun(5, 8, 4), [5, 3], [6, 3], [7, 3], [8, 3], ...colRun(8, 2, exitY));
    gates = [[[5, 7]], [[8, 10]], [[5, 5]]];
  }
  return { id: `skunk:${shape}:${exitY}`, shape, route: { animal: 'skunk', shape, path, fixedLead: 2, crosses: true, gates } };
}

/** Every shape each animal can be dealt, with each of its exits. Built once. */
const ORDER: readonly Animal[] = ['fox', 'hedgehog', 'raccoon', 'skunk'];
const SHAPES: ReadonlyArray<readonly string[]> = [FOX_SHAPES, HEDGEHOG_SHAPES, RACCOON_SHAPES, SKUNK_SHAPES];

const VARIANTS: Variant[][] = (() => {
  const uniq = (l: readonly string[]) => [...new Set(l)];
  const fox: Variant[] = [];
  uniq(FOX_SHAPES).forEach((s) => HABITAT_EXITS.fox.forEach((e, n) => fox.push(foxRoute(s, e, n))));
  const hedgehog: Variant[] = [];
  uniq(HEDGEHOG_SHAPES).forEach((s) => {
    const ys = s === 'approach-north' ? [5] : s === 'over-the-top' ? [4] : HABITAT_EXITS.hedgehog.filter((e) => e.x === 1).map((e) => e.y);
    ys.forEach((y) => hedgehog.push(hedgehogRoute(s, y)));
  });
  const raccoon: Variant[] = [];
  uniq(RACCOON_SHAPES).forEach((s) => (s === 'approach-north' ? [5] : HABITAT_EXITS.raccoon.map((e) => e.y)).forEach((y) => raccoon.push(raccoonRoute(s, y))));
  const skunk: Variant[] = [];
  uniq(SKUNK_SHAPES).forEach((s) => HABITAT_EXITS.skunk.filter((e) => e.x === 8).forEach((e) => skunk.push(skunkRoute(s, e.y))));
  return [fox, hedgehog, raccoon, skunk];
})();

// ── Crossings and gates ───────────────────────────────────────

interface Crossing {
  cell: Cell;
  /** Index (in the routes given) of the older run, which passes underneath. */
  under: number;
  /** Index of the newer run, which goes over. */
  over: number;
  /** The axis the newer run travels along, which is the one on top. */
  overAxis: 'ns' | 'ew';
}

/**
 * Every cell two of these runs share, as crossings; null if any shared cell is
 * not a proper one (see THE DESIGN). The newer run, later in the list, is over.
 */
function crossingsOf(routes: Route[]): Map<string, Crossing> | null {
  const out = new Map<string, Crossing>();
  for (let a = 0; a < routes.length; a++) {
    const at = new Map<string, number>();
    routes[a].path.forEach((c, i) => at.set(key(c), i));
    for (let b = a + 1; b < routes.length; b++) {
      for (let j = 0; j < routes[b].path.length; j++) {
        const c = routes[b].path[j];
        const i = at.get(key(c));
        if (i === undefined) continue;
        const ax = throughAxis(routes[a], i);
        const bx = throughAxis(routes[b], j);
        if (!ax || !bx || ax === bx) return null;
        if (!routes[a].crosses || !routes[b].crosses) return null;
        if (i <= routes[a].fixedLead || j <= routes[b].fixedLead) return null;
        if (DOME_KEYS.has(key(c)) || out.has(key(c))) return null;
        out.set(key(c), { cell: c, under: a, over: b, overAxis: bx });
      }
    }
  }
  return out;
}

/** The straights of a run the child can turn: not the ends, corners, fixed connectors, domes or crossings. */
function rotatableCells(route: Route, crossings: Map<string, Crossing>): Cell[] {
  const out: Cell[] = [];
  for (let i = 1; i < route.path.length - 1; i++) {
    const c = route.path[i];
    if (!throughAxis(route, i) || i <= route.fixedLead) continue;
    if (DOME_KEYS.has(key(c)) || crossings.has(key(c))) continue;
    out.push(c);
  }
  return out;
}

/** Where each of a run's first `levels` gates sits, or null if it cannot carry them. */
function placeGates(route: Route, crossings: Map<string, Crossing>, levels: number): Cell[] | null {
  const free = rotatableCells(route, crossings);
  const used = new Set<string>();
  const out: Cell[] = [];
  for (let g = 0; g < levels && g < route.gates.length; g++) {
    const ok = (c: Cell) => !used.has(key(c)) && free.some((f) => key(f) === key(c));
    const pick = route.gates[g].find(ok) ?? free.find((c) => !used.has(key(c)));
    if (!pick) return null;
    used.add(key(pick));
    out.push(pick);
  }
  return out;
}

/** How many gate levels the board has at a tier: none, one on each run, two, three. */
function gateLevelsAt(tier: number): number {
  return tier >= 5 ? 3 : tier >= 4 ? 2 : tier >= 2 ? 1 : 0;
}

/** Gate levels already on the board when each run joins (the tier before it): a crossing must not take one of those gates. */
const GATES_ALREADY = ORDER.map((_, k) => gateLevelsAt(k));

const fitMemo = new Map<string, boolean>();
const dealMemo = new Map<string, Variant[]>();

/** Does this shape of run k fit beside the runs already laid? */
function fits(k: number, v: Variant, placed: Variant[]): boolean {
  const memo = k + '|' + placed.map((p) => p.id).join(',') + '|' + v.id;
  const known = fitMemo.get(memo);
  if (known !== undefined) return known;
  const before = placed.map((p) => p.route);
  const routes = [...before, v.route];
  let ok = true;
  const crossings = crossingsOf(routes);
  if (!crossings) {
    ok = false;
  } else {
    if (GATES_ALREADY[k] > 0 && crossings.size > 0) {
      const beforeCrossings = crossingsOf(before)!;
      for (const r of before) {
        for (const c of placeGates(r, beforeCrossings, GATES_ALREADY[k]) ?? []) {
          if (crossings.has(key(c))) ok = false;
        }
      }
    }
    // and every run, the new one included, still has a cell for each gate it carries
    if (ok) for (const r of routes) if (!placeGates(r, crossings, r.gates.length)) ok = false;
  }
  fitMemo.set(memo, ok);
  return ok;
}

/** The shapes of run k that fit beside what is laid and leave the next run a way through. */
function dealable(k: number, placed: Variant[]): Variant[] {
  const memo = k + '|' + placed.map((p) => p.id).join(',');
  const known = dealMemo.get(memo);
  if (known) return known;
  const out = VARIANTS[k].filter((v) => fits(k, v, placed)
    && (k === ORDER.length - 1 || VARIANTS[k + 1].some((n) => fits(k + 1, n, [...placed, v]))));
  dealMemo.set(memo, out);
  return out;
}

/**
 * Deal run k: a shape by weight from those that fit, then one of that shape's
 * exits. Both draws are made up front from the run's own stream, so what is
 * dealt never depends on the tier.
 */
function deal(k: number, placed: Variant[], u1: number, u2: number): Variant {
  const fitting = dealable(k, placed);
  const shapes = SHAPES[k].filter((s) => fitting.some((v) => v.shape === s));
  if (shapes.length === 0) throw new Error(`tunnel: no shape of the ${ORDER[k]}'s run fits beside the others`);
  const shape = shapes[Math.floor(u1 * shapes.length)];
  const exits = fitting.filter((v) => v.shape === shape);
  return exits[Math.floor(u2 * exits.length)];
}

const SEED_MIX: Array<(seed: number) => number> = [
  (s) => s,
  (s) => (s * 31 + 17) >>> 0,
  (s) => (s * 53 + 31) >>> 0,
  (s) => (s * 97 + 13) >>> 0,
];

/** The first `count` animals' runs for a seed, each with the stream it goes on drawing its tiles' turns from. */
function dealNetwork(count: number, seed: number): Array<{ variant: Variant; rng: () => number }> {
  const out: Array<{ variant: Variant; rng: () => number }> = [];
  const placed: Variant[] = [];
  for (let k = 0; k < count; k++) {
    const rng = mulberry32(SEED_MIX[k](seed));
    const u1 = rng();
    const u2 = rng();
    const variant = deal(k, placed, u1, u2);
    placed.push(variant);
    out.push({ variant, rng });
  }
  return out;
}

/** The shape each animal is dealt for a seed (all four, whatever the tier): for tests and the contact sheet. */
export function tunnelShapes(seed: number): Record<Animal, string> {
  const dealt = dealNetwork(4, seed);
  return Object.fromEntries(dealt.map((d) => [d.variant.route.animal, d.variant.shape])) as Record<Animal, string>;
}

// ── Laying the board ──────────────────────────────────────────

/**
 * Lay one run on the board. Corners are fixed (the shape of the run is the
 * given), connectors out of the building are fixed, every other straight
 * starts at a random rotation for the child to turn, and the two endpoints
 * are fixed so a tap on the sticker cannot break a finished route. Where the
 * run crosses another the tile is a fixed bridge. Gates (closed) then replace
 * the rotatable straights each gate level names.
 */
function layRoute(
  set: (x: number, y: number, t: TunnelTile) => void,
  route: Route,
  rng: () => number,
  gateLevels: number,
  crossings: Map<string, Crossing>,
): Array<{ i: number; horizontal: boolean }> {
  const cells = route.path;
  const last = cells.length - 1;
  const rotatable: Array<{ i: number; horizontal: boolean }> = [];
  for (let i = 0; i <= last; i++) {
    const [x, y] = cells[i];
    if (i === 0 || i === last) {
      const toward = dirBetween(cells[i], cells[i === 0 ? 1 : i - 1]);
      set(x, y, {
        type: 'habitat-endpoint', rotation: ENDPOINT_ROTATION[toward], fixed: true,
        endpointFor: route.animal, endpointRole: i === 0 ? 'start' : 'end',
      });
      continue;
    }
    const back = dirBetween(cells[i], cells[i - 1]);
    const fwd = dirBetween(cells[i], cells[i + 1]);
    if (back !== OPPOSITE[fwd]) {
      set(x, y, { type: 'corner', rotation: cornerRotation(back, fwd), fixed: true });
      continue;
    }
    const horizontal = fwd === 'e' || fwd === 'w';
    if (i <= route.fixedLead) {
      set(x, y, { type: 'straight', rotation: horizontal ? 1 : 0, fixed: true });
      continue;
    }
    // Always drawn, so a crossing laid here by a LATER run does not shift the
    // turns of the straights after it: the run is the same in every tier.
    const turn = Math.floor(rng() * 4) as Rotation;
    const crossing = crossings.get(key(cells[i]));
    if (crossing) {
      set(x, y, { type: 'bridge', rotation: crossing.overAxis === 'ns' ? 0 : 1, fixed: true });
    } else {
      set(x, y, { type: 'straight', rotation: turn });
      rotatable.push({ i, horizontal });
    }
  }
  for (const [gx, gy] of placeGates(route, crossings, gateLevels) ?? []) {
    const hit = rotatable.find((r) => cells[r.i][0] === gx && cells[r.i][1] === gy);
    if (!hit) continue;
    set(gx, gy, { type: 'gate', rotation: hit.horizontal ? 1 : 0, open: false });
  }
  return rotatable;
}

/**
 * Pad EMPTY cells with random rotatable pieces ("decoys") so the kid sees
 * more tunnel pieces than the runs strictly need: she has to work out which
 * matter and which are red herrings, and may rotate decoys into alternative
 * routes if she likes (Marcus 2026-05-05). Each cell decides for itself from
 * the seed and its own index, not from a running sequence, so the same cell
 * holds the same decoy in every tier and a new branch only displaces the ones
 * it stands on. Bridges are not decoys: a bridge on the board is a crossing of
 * two runs, so every one she sees means something.
 *
 * `density` 0..1 is the fraction of empty cells that get one.
 */
function fillDecoys(tiles: TunnelTile[], seed: number, density: number): void {
  // Weighted bag: more straights and corners than fancy pieces so the puzzle
  // stays approachable.
  const decoyTypes: TileType[] = [
    'straight', 'straight', 'straight',
    'corner', 'corner', 'corner',
    't-junction', 't-junction',
  ];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].type !== 'empty') continue;
    const r = mulberry32((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0);
    if (r() > density) continue;
    const type = decoyTypes[Math.floor(r() * decoyTypes.length)];
    tiles[i] = { type, rotation: Math.floor(r() * 4) as Rotation };
  }
}

/** The board for a tier: the fox's run, then each animal that has joined by then. */
function buildNetwork(tier: number, seed: number): TunnelPuzzle {
  const tiles: TunnelTile[] = [];
  for (let i = 0; i < NET_W * NET_H; i++) tiles.push(emptyTile());
  const set = (x: number, y: number, t: TunnelTile) => { tiles[y * NET_W + x] = t; };
  const at = (c: Cell) => tiles[c[1] * NET_W + c[0]];
  const gateLevels = gateLevelsAt(tier);

  const dealt = dealNetwork(Math.min(tier, ORDER.length), seed);
  const routes = dealt.map((d) => d.variant.route);
  const crossings = crossingsOf(routes)!;
  const animals: Animal[] = routes.map((r) => r.animal);
  let foxTurns: Array<{ i: number; horizontal: boolean }> = [];
  dealt.forEach((d, k) => {
    const turns = layRoute(set, d.variant.route, d.rng, gateLevels, crossings);
    if (k === 0) foxTurns = turns;
  });
  const fox = routes[0];

  // Where the fox's run passes under a glass dome of the site map, the tile
  // is the dome: fixed, and the fox is seen through the glass as it goes by.
  const foxCells = new Set(fox.path.map(key));
  for (const d of TUNNEL_DOME_CELLS) {
    const t = at([d.x, d.y]);
    if (foxCells.has(d.x + ',' + d.y) && t.type === 'straight' && !t.fixed) {
      set(d.x, d.y, { type: 'viewing-dome', rotation: 0, fixed: true });
    }
  }

  // A run whose straights all landed the right way round by luck would start
  // finished (about 1 board in 250 at tier 1, where there are no gates to
  // close): turn the first one so there is always something to do.
  if (gateLevels === 0) {
    const turnable = foxTurns.filter((r) => {
      const t = at(fox.path[r.i]);
      return t.type === 'straight' && !t.fixed;
    });
    const aligned = (r: { i: number; horizontal: boolean }) => (at(fox.path[r.i]).rotation % 2 === 1) === r.horizontal;
    if (turnable.length > 0 && turnable.every(aligned)) {
      const [cx, cy] = fox.path[turnable[0].i];
      set(cx, cy, { ...at([cx, cy]), rotation: ((at([cx, cy]).rotation + 1) % 4) as Rotation });
    }
  }

  fillDecoys(tiles, seed, tier >= 4 ? 0.9 : 0.85);
  return { width: NET_W, height: NET_H, tiles, animals };
}

/** Tier 1 — the intro: the fox's run alone, no gates. */
export function generateTier1Puzzle(seed: number): TunnelPuzzle {
  return buildNetwork(1, seed);
}

/** Tier 2 — the hedgehog's run joins the fox's, and gates arrive (one on each run). */
export function generateTier2Puzzle(seed: number): TunnelPuzzle {
  return buildNetwork(2, seed);
}

/** Tier 3 — the raccoon's run joins the other two. */
export function generateTier3Puzzle(seed: number): TunnelPuzzle {
  return buildNetwork(3, seed);
}

/** Tier 4 — the skunk's run joins: all four, and a second gate on each run. */
export function generateTier4Puzzle(seed: number): TunnelPuzzle {
  return buildNetwork(4, seed);
}

/** Tier 5 — rush hour: the whole network, with a third gate where a run is long enough. */
export function generateTier5Puzzle(seed: number): TunnelPuzzle {
  return buildNetwork(5, seed);
}

/**
 * The canonical solution, for tests and a "give me the answer" path: walk
 * each animal's run from its start, turn every rotatable straight and gate
 * to the way the animal is travelling, open every gate. Corners, connectors,
 * crossings and endpoints are fixed, so the walk has nothing to choose, and it
 * does not care which shape the run was dealt. A board that is not one of ours
 * (a decoy where a run should be) is left as it is.
 */
export function applySolution(puzzle: TunnelPuzzle): TunnelPuzzle {
  const tiles = puzzle.tiles.map((t) => ({ ...t }));
  for (const animal of puzzle.animals) {
    const { start } = findEndpoints({ ...puzzle, tiles }, animal);
    if (!start) continue;
    const startSides = tileSides(tiles[start.y * puzzle.width + start.x]);
    let exit = (['n', 'e', 's', 'w'] as const).find((d) => startSides[d]);
    let x = start.x;
    let y = start.y;
    for (let step = 0; exit && step < puzzle.width * puzzle.height; step++) {
      x += DELTA[exit].dx;
      y += DELTA[exit].dy;
      const enter = OPPOSITE[exit];
      if (x < 0 || y < 0 || x >= puzzle.width || y >= puzzle.height) break;
      const k = y * puzzle.width + x;
      const t = tiles[k];
      if (t.type === 'habitat-endpoint') break;
      if (t.type === 'gate') {
        tiles[k] = { ...t, open: true, rotation: enter === 'n' || enter === 's' ? 0 : 1 };
        exit = OPPOSITE[enter];
      } else if (t.type === 'straight' && !t.fixed) {
        tiles[k] = { ...t, rotation: enter === 'n' || enter === 's' ? 0 : 1 };
        exit = OPPOSITE[enter];
      } else if (t.type === 'bridge') {
        // a crossing carries the animal straight on, whichever run is on top
        exit = OPPOSITE[enter];
      } else if (t.fixed && (t.type === 'corner' || t.type === 'straight' || t.type === 'viewing-dome')) {
        const sides = tileSides(t);
        if (!sides[enter]) break;
        exit = (['n', 'e', 's', 'w'] as const).find((d) => sides[d] && d !== enter);
      } else {
        break;
      }
    }
  }
  return { ...puzzle, tiles };
}

export const applyTier1Solution = applySolution;
export const applyTier2Solution = applySolution;
export const applyTier3Solution = applySolution;
export const applyTier4Solution = applySolution;
export const applyTier5Solution = applySolution;
