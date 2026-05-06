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

    // Endpoint check — we've arrived. Endpoint must be open on the
    // side we entered from (kid spins the END tile to face their
    // approach). This means a wrongly-rotated final tile breaks
    // the path — fixes the 'fox got there anyway' bug where a happy
    // accident through decoys would otherwise let it through.
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
 * Pad EMPTY cells in a rectangular zone with random rotatable
 * pieces ("decoys") so the kid sees more tunnel pieces on the
 * board than the required path strictly needs. Adds proper puzzle
 * to the rotation work — kid has to figure out which pieces matter
 * and which are red herrings, AND can rotate decoys to create
 * alternative routes if they want to (Marcus 2026-05-05).
 *
 * Won't overwrite non-empty cells (so existing trunk + endpoints
 * are preserved).
 *
 * `density` 0..1 — fraction of empty cells in the zone that get
 * a decoy. 0.55 leaves visible breathing room.
 */
function fillWithDecoyTiles(
  tiles: TunnelTile[],
  W: number,
  zone: { x0: number; y0: number; x1: number; y1: number },
  rng: () => number,
  density = 0.55,
): void {
  // Weighted bag: more straights and corners than fancy pieces so
  // the puzzle stays approachable. Bridges add the over/under
  // 'crossing' choice the kid uses for advanced routing.
  const decoyTypes: TileType[] = [
    'straight', 'straight', 'straight',
    'corner',   'corner',   'corner',
    't-junction', 't-junction',
    'bridge',
  ];
  const randR = (): Rotation => Math.floor(rng() * 4) as Rotation;
  for (let y = zone.y0; y <= zone.y1; y++) {
    for (let x = zone.x0; x <= zone.x1; x++) {
      const i = y * W + x;
      if (tiles[i].type !== 'empty') continue;
      if (rng() > density) continue;
      const type = decoyTypes[Math.floor(rng() * decoyTypes.length)];
      tiles[i] = { type, rotation: randR() };
    }
  }
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
  // Grid is 9 cols × 13 rows. The bottom 11 rows correspond to the
  // aboveground site map (anchored bottom). Top 2 rows are EXTRA
  // soil that extends ABOVE the site map — kid sees the soil
  // "wrap around" the site, reinforcing that the tunnels are
  // contained underground (Marcus 2026-05-04).
  //
  // Tunnel network shifts up by 3 rows from the previous layout so
  // 3 rows of building footprint sit BELOW the start tile, allowing
  // the painted ARC building to render fully opaque underneath.
  const W = 9, H = 13;
  const tiles: TunnelTile[] = [];
  for (let i = 0; i < W * H; i++) tiles.push(emptyTile());

  const set = (x: number, y: number, t: TunnelTile) => {
    tiles[y * W + x] = t;
  };

  const rng = mulberry32(seed);
  const randR = (): Rotation => Math.floor(rng() * 4) as Rotation;

  // Trunk runs UP col 6 (= 2/3 across) from the building tunnel-mouth
  // at (6, 9), aligning with the painted central gravel path on the
  // overlay (which sits at 60-66% of overlay width = col 5.5-6 of
  // the 9-col grid). Corner at the top (6, 0) turns west into the
  // fox branch. The painted ARC building sits in the bottom-LEFT of
  // the soil (cols -0.5 to 4.5), clear of the trunk column
  // (Marcus 2026-05-04).

  // Building tunnel mouth at (5, 10) — INSIDE the building footprint
  // (cols 0-5). Opens east (r=3) so the fox emerges from the house
  // going east into the trunk. A fixed corner just outside the
  // building at (6, 10) turns the path from west to north,
  // visually anchoring the tunnel as "coming out of the house".
  // Same pattern will apply to every habitat in higher tiers
  // (Marcus 2026-05-04).
  set(5, 10, {
    type: 'habitat-endpoint', rotation: 3, fixed: true,
    endpointFor: 'fox', endpointRole: 'start',
  });

  // Building-side corner at (6, 10) — fixed ┘ shape (N+W open).
  // Receives fox from west (from building), redirects north up trunk.
  set(6, 10, { type: 'corner', rotation: 0, fixed: true });

  // Trunk straights at (6, y) for y=2..9 — player rotates to vertical.
  // Trunk topology — pick from a small library of shapes per seed
  // so each daily puzzle has a different solution path geometry
  // (Marcus 2026-05-06: 'we can have a whole host of simple to
  // intricate tunnel solutions with detours, bends').
  //   'straight' — direct vertical trunk (the historical default)
  //   'z-east'   — trunk jogs east via col 7-8 mid-way
  // More templates (z-west, big-u, bridge-cross, approach-north)
  // will land in subsequent passes.
  const TIER1_TEMPLATES = ['straight', 'z-east', 'z-west', 'approach-north'] as const;
  const trunkTemplate = TIER1_TEMPLATES[Math.floor(rng() * TIER1_TEMPLATES.length)];

  // Pick fox exit FIRST so we can constrain by template if needed.
  // approach-north only supports row-1 exits (the path comes south
  // into the endpoint via row 0, so a row-2 exit needs an extra
  // straight at (foxExit.x, 1) — handled below).
  const foxExits = HABITAT_EXITS.fox;
  const foxExit = foxExits[Math.floor(rng() * foxExits.length)];

  if (trunkTemplate === 'straight') {
    for (let y = 2; y <= 9; y++) {
      set(6, y, { type: 'straight', rotation: randR() });
    }
    // Three viewing domes along the trunk, evenly spaced.
    set(6, 2, { type: 'viewing-dome', rotation: 0, fixed: true });
    set(6, 5, { type: 'viewing-dome', rotation: 0, fixed: true });
    set(6, 8, { type: 'viewing-dome', rotation: 0, fixed: true });
  } else if (trunkTemplate === 'z-east') {
    // z-east: trunk jogs east at row 7 over to col 8, climbs col 8
    // to row 4, then jogs back west to col 6 to reach the top corner.
    set(6, 9, { type: 'straight', rotation: randR() });
    set(6, 8, { type: 'viewing-dome', rotation: 0, fixed: true });
    set(6, 7, { type: 'corner', rotation: 2, fixed: true }); // ┌ S+E
    set(7, 7, { type: 'straight', rotation: randR() });
    set(8, 7, { type: 'corner', rotation: 0, fixed: true }); // ┘ N+W
    set(8, 6, { type: 'straight', rotation: randR() });
    set(8, 5, { type: 'viewing-dome', rotation: 0, fixed: true });
    set(8, 4, { type: 'corner', rotation: 3, fixed: true }); // ┐ S+W
    set(7, 4, { type: 'straight', rotation: randR() });
    set(6, 4, { type: 'corner', rotation: 1, fixed: true }); // └ N+E
    set(6, 3, { type: 'straight', rotation: randR() });
    set(6, 2, { type: 'viewing-dome', rotation: 0, fixed: true });
  } else if (trunkTemplate === 'z-west') {
    // z-west: mirror of z-east — trunk jogs WEST at row 7 over to
    // col 4, climbs col 4 to row 4, then jogs back east to col 6.
    set(6, 9, { type: 'straight', rotation: randR() });
    set(6, 8, { type: 'viewing-dome', rotation: 0, fixed: true });
    set(6, 7, { type: 'corner', rotation: 3, fixed: true }); // ┐ S+W
    set(5, 7, { type: 'straight', rotation: randR() });
    set(4, 7, { type: 'corner', rotation: 1, fixed: true }); // └ N+E
    set(4, 6, { type: 'straight', rotation: randR() });
    set(4, 5, { type: 'viewing-dome', rotation: 0, fixed: true });
    set(4, 4, { type: 'corner', rotation: 2, fixed: true }); // ┌ S+E
    set(5, 4, { type: 'straight', rotation: randR() });
    set(6, 4, { type: 'corner', rotation: 0, fixed: true }); // ┘ N+W
    set(6, 3, { type: 'straight', rotation: randR() });
    set(6, 2, { type: 'viewing-dome', rotation: 0, fixed: true });
  } else {
    // approach-north: trunk continues UP past row 1 to row 0, west
    // along row 0 to (foxExit.x, 0), then south into the endpoint
    // from above. Row 1 is just a vertical pass-through (no top
    // corner, no west-bound branch).
    for (let y = 1; y <= 9; y++) {
      set(6, y, { type: 'straight', rotation: randR() });
    }
    set(6, 2, { type: 'viewing-dome', rotation: 0, fixed: true });
    set(6, 5, { type: 'viewing-dome', rotation: 0, fixed: true });
    set(6, 8, { type: 'viewing-dome', rotation: 0, fixed: true });
  }

  // Top corner + branch — only for non-approach-north templates.
  if (trunkTemplate !== 'approach-north') {
    set(6, 1, { type: 'corner', rotation: 3, fixed: true });
    // Branch — horizontal straights along row 1 from (foxExit.x+1)
    // to col 5 inclusive.
    for (let x = foxExit.x + 1; x <= 5; x++) {
      set(x, 1, { type: 'straight', rotation: randR() });
    }
    if (foxExit.y === 2) {
      set(foxExit.x, 1, { type: 'corner', rotation: 2, fixed: true }); // ┌ S+E
    }
  } else {
    // approach-north top: trunk col 6 climbs to row 0 via a fixed
    // ┐ S+W corner that turns west; row 0 horizontals westward;
    // ┌ S+E corner at (foxExit.x, 0) turns south into the endpoint.
    set(6, 0, { type: 'corner', rotation: 3, fixed: true }); // ┐ S+W
    for (let x = foxExit.x + 1; x <= 5; x++) {
      set(x, 0, { type: 'straight', rotation: randR() });
    }
    set(foxExit.x, 0, { type: 'corner', rotation: 2, fixed: true }); // ┌ S+E
    if (foxExit.y === 2) {
      // Path enters endpoint from north past row 1 — need a vertical
      // straight at (foxExit.x, 1) to bridge.
      set(foxExit.x, 1, { type: 'straight', rotation: randR() });
    }
  }

  // Fox pen entry — ROTATABLE so kid can spin to match their
  // approach. Default rotation matches the canonical approach side:
  //   y=1 + non-approach-north: from E → r=3 (E-open)
  //   y=2 + non-approach-north: from N → r=2 (N-open)
  //   approach-north (any y):   from N → r=2 (N-open)
  let foxEndRotation: Rotation;
  if (trunkTemplate === 'approach-north') foxEndRotation = 2;
  else foxEndRotation = (foxExit.y === 1 ? 3 : 2) as Rotation;
  set(foxExit.x, foxExit.y, {
    type: 'habitat-endpoint', rotation: foxEndRotation, fixed: false,
    endpointFor: 'fox', endpointRole: 'end',
  });

  // Pad with decoy tiles so the puzzle isn't just "rotate every
  // straight to vertical". Decoy zone covers the area around the
  // fox network (cols 1-7, rows 2-9).
  fillWithDecoyTiles(tiles, W, { x0: 0, y0: 0, x1: 8, y1: 12 }, rng, 0.85);

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
  // Vertical-straight rotation 0; horizontal rotation 1. The solver
  // is rotation-agnostic across templates — we just rotate every
  // straight on the trunk col(s) to vertical and the branch row to
  // horizontal. The z-east template adds straights on col 7+8 +
  // horizontal jog cells at (7, 4) + (7, 7); we cover them all.
  const verticalSets = [
    { x: 6, y0: 2, y1: 9 }, // straight col 6 (all templates)
    { x: 8, y0: 6, y1: 6 }, // z-east col 8 vertical run
    { x: 4, y0: 6, y1: 6 }, // z-west col 4 vertical run
  ];
  for (const v of verticalSets) {
    for (let y = v.y0; y <= v.y1; y++) {
      const t = tiles[idx(v.x, y)];
      if (t.type === 'straight') t.rotation = 0;
    }
  }
  // Horizontal jog straights — z-east at col 7, z-west at col 5.
  for (const c of [
    { x: 7, y: 4 }, { x: 7, y: 7 }, // z-east jogs
    { x: 5, y: 4 }, { x: 5, y: 7 }, // z-west jogs
  ]) {
    const t = tiles[idx(c.x, c.y)];
    if (t.type === 'straight') t.rotation = 1;
  }
  // Detect template by checking (6, 1) — for non-approach-north it's
  // the top corner; for approach-north it's a vertical straight.
  // approach-north never places the row-1 west branch.
  const isApproachNorth = tiles[idx(6, 1)].type !== 'corner';
  if (isApproachNorth) {
    // Row 0 horizontal jog (only the connector straights, not decoys).
    // Connector straights live BETWEEN the (6, 0) ┐ corner and the
    // (foxExit.x, 0) ┌ corner. Find both corners, rotate everything
    // between them to horizontal.
    let cornerWestX = -1;
    for (let x = 5; x >= 0; x--) {
      const t = tiles[idx(x, 0)];
      if (t.type === 'corner' && t.fixed) { cornerWestX = x; break; }
    }
    if (cornerWestX >= 0) {
      for (let x = cornerWestX + 1; x <= 5; x++) {
        const t = tiles[idx(x, 0)];
        if (t.type === 'straight') t.rotation = 1;
      }
      // y=2 bridge: vertical straight at (cornerWestX, 1).
      const bridge = tiles[idx(cornerWestX, 1)];
      if (bridge.type === 'straight') bridge.rotation = 0;
    }
  } else {
    // Branch row 1 horizontal — the regular west-bound branch.
    for (let x = 1; x <= 5; x++) {
      const t = tiles[idx(x, 1)];
      if (t.type === 'straight') t.rotation = 1;
    }
  }
  return { ...puzzle, tiles };
}

// ── Tier 2 puzzle generator ───────────────────────────────────

/**
 * Tier 2 — adds the HEDGEHOG branch and introduces GATES.
 *
 * Layout (9×13):
 *  - Fox network: identical to tier 1 (col-6 trunk, branch on row 1)
 *  - Hedgehog network: NEW second trunk on col 1
 *      - Hedgehog start (0, 10) inside building, opens east
 *      - Building corner (1, 10) ┘ N+W (fixed) — turns north
 *      - Trunk straights (1, hedgeExit.y+1)..(1, 9)
 *      - Hedgehog endpoint at (1, hedgeExit.y) — y=4 or 5
 *  - Gates: ONE gate per trunk (default closed). Kid must:
 *      a) rotate every straight along both trunks
 *      b) toggle BOTH gates open before submitting
 *
 * Gates are placed at trunk row 7 (between mid-dome and bottom area)
 * for the fox trunk and at row 7 of the hedgehog trunk.
 */
export function generateTier2Puzzle(seed: number): TunnelPuzzle {
  const W = 9, H = 13;
  const tiles: TunnelTile[] = [];
  for (let i = 0; i < W * H; i++) tiles.push(emptyTile());
  const set = (x: number, y: number, t: TunnelTile) => { tiles[y * W + x] = t; };
  const rng = mulberry32(seed);
  const randR = (): Rotation => Math.floor(rng() * 4) as Rotation;

  // ── FOX NETWORK (mirrors tier 1) ────────────────────────────
  set(5, 10, {
    type: 'habitat-endpoint', rotation: 3, fixed: true,
    endpointFor: 'fox', endpointRole: 'start',
  });
  set(6, 10, { type: 'corner', rotation: 0, fixed: true });
  for (let y = 2; y <= 9; y++) {
    set(6, y, { type: 'straight', rotation: randR() });
  }
  set(6, 2, { type: 'viewing-dome', rotation: 0, fixed: true });
  set(6, 5, { type: 'viewing-dome', rotation: 0, fixed: true });
  // Fox-trunk gate at row 7 (replaces a straight at that position).
  // Default closed — kid clicks to open. Vertical orientation
  // (rotation 0) so it gates the trunk's NS flow.
  set(6, 7, { type: 'gate', rotation: 0, open: false });
  set(6, 1, { type: 'corner', rotation: 3, fixed: true });
  const foxExits = HABITAT_EXITS.fox;
  const foxExit = foxExits[Math.floor(rng() * foxExits.length)];
  for (let x = foxExit.x + 1; x <= 5; x++) {
    set(x, 1, { type: 'straight', rotation: randR() });
  }
  if (foxExit.y === 2) {
    set(foxExit.x, 1, { type: 'corner', rotation: 2, fixed: true });
  }
  // Tier-2 fox endpoint mirrors tier-1 logic.
  const t2FoxRot = foxExit.y === 1 ? 3 : 2;
  set(foxExit.x, foxExit.y, {
    type: 'habitat-endpoint', rotation: t2FoxRot, fixed: false,
    endpointFor: 'fox', endpointRole: 'end',
  });

  // ── HEDGEHOG NETWORK (new) ──────────────────────────────────
  // Start inside the building's west edge at (0, 10), opens east.
  set(0, 10, {
    type: 'habitat-endpoint', rotation: 3, fixed: true,
    endpointFor: 'hedgehog', endpointRole: 'start',
  });
  // Building-side corner ┘ N+W just east of the start tile.
  set(1, 10, { type: 'corner', rotation: 0, fixed: true });

  // Pick hedgehog exit from col-1 entries (rows 4 + 5).
  const hedgeCol1Exits = HABITAT_EXITS.hedgehog.filter((e) => e.x === 1);
  const hedgeExit = hedgeCol1Exits[Math.floor(rng() * hedgeCol1Exits.length)];

  // Hedgehog trunk template — pick straight or z-east per seed.
  const HEDGE_TEMPLATES = ['straight', 'z-east'] as const;
  const hedgeTemplate = HEDGE_TEMPLATES[Math.floor(rng() * HEDGE_TEMPLATES.length)];
  let hedgeEndRotation: Rotation;

  if (hedgeTemplate === 'straight') {
    // Direct vertical trunk col 1 from (1, hedgeExit.y+1) to (1, 9).
    for (let y = hedgeExit.y + 1; y <= 9; y++) {
      set(1, y, { type: 'straight', rotation: randR() });
    }
    set(1, 7, { type: 'gate', rotation: 0, open: false });
    hedgeEndRotation = 0; // S-open (approach from below)
  } else {
    // z-east jog at row 7 over to col 3, climbs to row 5, west back.
    set(1, 9, { type: 'straight', rotation: randR() });
    set(1, 8, { type: 'gate', rotation: 0, open: false });
    set(1, 7, { type: 'corner', rotation: 2, fixed: true }); // ┌ S+E
    set(2, 7, { type: 'straight', rotation: randR() });
    set(3, 7, { type: 'corner', rotation: 0, fixed: true }); // ┘ N+W
    set(3, 6, { type: 'straight', rotation: randR() });
    set(3, 5, { type: 'corner', rotation: 3, fixed: true }); // ┐ S+W
    set(2, 5, { type: 'straight', rotation: randR() });
    if (hedgeExit.y === 4) {
      // └ corner at (1, 5) turning E→N into endpoint at (1, 4).
      set(1, 5, { type: 'corner', rotation: 1, fixed: true });
      hedgeEndRotation = 0; // S-open (approach from below)
    } else {
      hedgeEndRotation = 3; // E-open (path arrives from east)
    }
  }

  set(1, hedgeExit.y, {
    type: 'habitat-endpoint', rotation: hedgeEndRotation, fixed: false,
    endpointFor: 'hedgehog', endpointRole: 'end',
  });

  // Decoy fill — covers the central span between hedgehog (col 1)
  // and fox (col 6) trunks plus a strip east of fox.
  fillWithDecoyTiles(tiles, W, { x0: 0, y0: 0, x1: 8, y1: 12 }, rng, 0.85);

  return { width: W, height: H, tiles, animals: ['fox', 'hedgehog'] };
}

// ── Tier 3 puzzle generator ───────────────────────────────────

/**
 * Tier 3 — adds the RACCOON network to tier 2's fox + hedgehog.
 *
 * Raccoon enters the trunk system from the south of the building:
 *   - Start at (5, 11) inside building, opens east
 *   - Fixed horizontal straight at (6, 11) crossing east of building
 *   - Fixed ┘ corner at (7, 11) turning the path north
 *   - Trunk straights up col 7 from row (raccExit.y + 1) to row 10
 *   - Gate at (7, 7) (default closed) — kid stages opens
 *   - Endpoint at (7, raccExit.y) — y=4 or 5
 *
 * Animation runs animals SEQUENTIALLY (fox → hedgehog → raccoon),
 * giving kids the timing-window experience the design doc spec'd.
 */
export function generateTier3Puzzle(seed: number): TunnelPuzzle {
  const base = generateTier2Puzzle(seed);
  const tiles = base.tiles.map((t) => ({ ...t }));
  const set = (x: number, y: number, t: TunnelTile) => { tiles[y * base.width + x] = t; };
  // Use a different RNG sequence from tier 2 so raccoon's exit
  // pick + straight rotations aren't correlated with the others.
  const rng = mulberry32((seed * 31 + 17) >>> 0);
  const randR = (): Rotation => Math.floor(rng() * 4) as Rotation;

  set(5, 11, {
    type: 'habitat-endpoint', rotation: 3, fixed: true,
    endpointFor: 'raccoon', endpointRole: 'start',
  });
  // Horizontal connector + corner — both fixed (puzzle givens) so
  // the kid only rotates the trunk straights up col 7.
  set(6, 11, { type: 'straight', rotation: 1, fixed: true });
  set(7, 11, { type: 'corner', rotation: 0, fixed: true });

  const raccoonExits = HABITAT_EXITS.raccoon;
  const raccoonExit = raccoonExits[Math.floor(rng() * raccoonExits.length)];

  for (let y = raccoonExit.y + 1; y <= 10; y++) {
    set(7, y, { type: 'straight', rotation: randR() });
  }
  // Raccoon-trunk gate at row 7 (matches the row chosen for fox
  // and hedgehog gates so all three sit on the same horizontal
  // level — kid sees a 'row of gates' to open).
  set(7, 7, { type: 'gate', rotation: 0, open: false });
  set(7, raccoonExit.y, {
    type: 'habitat-endpoint', rotation: 0, fixed: false,
    endpointFor: 'raccoon', endpointRole: 'end',
  });

  // Decoy fill — fills gaps between the now-three trunks.
  fillWithDecoyTiles(tiles, base.width, { x0: 0, y0: 0, x1: 8, y1: 12 }, rng, 0.85);

  return { ...base, tiles, animals: ['fox', 'hedgehog', 'raccoon'] };
}

// ── Tier 4 puzzle generator ───────────────────────────────────

/**
 * Tier 4 — adds the SKUNK network. All four garden-habitat animals
 * (fox, hedgehog, raccoon, skunk) routing through their own trunks.
 *
 * Skunk layout:
 *  - Start at (5, 12) inside building bottom row, opens east
 *  - Three fixed horizontal connectors east at row 12 across to col 8
 *  - Fixed ┘ corner at (8, 12) turning north
 *  - Trunk straights up col 8 from (skunkExit.y + 1) to row 11
 *  - Gate at (8, 7) — same row as the other gates
 *  - Endpoint at (8, skunkExit.y) — y=1 or 2
 */
export function generateTier4Puzzle(seed: number): TunnelPuzzle {
  const base = generateTier3Puzzle(seed);
  const tiles = base.tiles.map((t) => ({ ...t }));
  const set = (x: number, y: number, t: TunnelTile) => { tiles[y * base.width + x] = t; };
  const rng = mulberry32((seed * 53 + 31) >>> 0);
  const randR = (): Rotation => Math.floor(rng() * 4) as Rotation;

  set(5, 12, {
    type: 'habitat-endpoint', rotation: 3, fixed: true,
    endpointFor: 'skunk', endpointRole: 'start',
  });
  // Three horizontal connectors (fixed) heading east along row 12.
  set(6, 12, { type: 'straight', rotation: 1, fixed: true });
  set(7, 12, { type: 'straight', rotation: 1, fixed: true });
  set(8, 12, { type: 'corner', rotation: 0, fixed: true });

  const skunkCol8 = HABITAT_EXITS.skunk.filter((e) => e.x === 8);
  const skunkExit = skunkCol8[Math.floor(rng() * skunkCol8.length)];

  for (let y = skunkExit.y + 1; y <= 11; y++) {
    set(8, y, { type: 'straight', rotation: randR() });
  }
  set(8, 7, { type: 'gate', rotation: 0, open: false });
  set(8, skunkExit.y, {
    type: 'habitat-endpoint', rotation: 0, fixed: false,
    endpointFor: 'skunk', endpointRole: 'end',
  });

  // Tier-4 difficulty bump: a SECOND gate on every trunk at row 9
  // (always a straight on all four trunks, regardless of which exit
  // the seed picked). Kid manages 8 gates total — twice the staging
  // work of tier 3.
  for (const col of [1, 6, 7, 8]) {
    if (tiles[9 * base.width + col]?.type === 'straight') {
      set(col, 9, { type: 'gate', rotation: 0, open: false });
    }
  }

  // Decoy fill at tier 4 — wall-to-wall pieces so the kid has to
  // work out which rotations matter and which are noise.
  fillWithDecoyTiles(tiles, base.width, { x0: 0, y0: 0, x1: 8, y1: 12 }, rng, 0.9);

  return { ...base, tiles, animals: ['fox', 'hedgehog', 'raccoon', 'skunk'] };
}

/**
 * Apply the canonical tier-4 solution.
 */
export function applyTier4Solution(puzzle: TunnelPuzzle): TunnelPuzzle {
  const t3 = applyTier3Solution(puzzle);
  const tiles = t3.tiles.map((t) => ({ ...t }));
  const idx = (x: number, y: number) => y * puzzle.width + x;
  for (let y = 1; y <= 11; y++) {
    const t = tiles[idx(8, y)];
    if (t.type === 'straight') t.rotation = 0;
  }
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].type === 'gate') tiles[i] = { ...tiles[i], open: true };
  }
  return { ...puzzle, tiles };
}

// ── Tier 5 puzzle generator ───────────────────────────────────

/**
 * Tier 5 — HARDEST puzzle. Marcus 2026-05-06 priority shift: harder
 * puzzles trump simultaneous animation. So tier 5 keeps tier 4's
 * 4-animal topology AND adds a THIRD gate to each trunk (12 gates
 * total, all closed by default). Kid has to:
 *   - rotate every straight on every trunk
 *   - toggle 12 gates open before submitting
 *   - work around 90% decoy fill across the whole grid
 *
 * Future enhancement: simultaneous animation + path-collision
 * detection (bridges become routing-required).
 */
export function generateTier5Puzzle(seed: number): TunnelPuzzle {
  const base = generateTier4Puzzle(seed);
  const tiles = base.tiles.map((t) => ({ ...t }));
  const set = (x: number, y: number, t: TunnelTile) => { tiles[y * base.width + x] = t; };
  // Add a THIRD gate per trunk at row 4 (only fox + skunk have a
  // straight there — hedgehog and raccoon trunks don't reach that
  // far up). 2 extra gates → 10 total in tier 5.
  for (const col of [6, 8]) {
    if (tiles[4 * base.width + col]?.type === 'straight') {
      set(col, 4, { type: 'gate', rotation: 0, open: false });
    }
  }
  return { ...base, tiles };
}

export function applyTier5Solution(puzzle: TunnelPuzzle): TunnelPuzzle {
  return applyTier4Solution(puzzle);
}

/**
 * Apply the canonical tier-3 solution.
 */
export function applyTier3Solution(puzzle: TunnelPuzzle): TunnelPuzzle {
  const t2 = applyTier2Solution(puzzle);
  const tiles = t2.tiles.map((t) => ({ ...t }));
  const idx = (x: number, y: number) => y * puzzle.width + x;
  // Raccoon trunk straights vertical
  for (let y = 1; y <= 10; y++) {
    const t = tiles[idx(7, y)];
    if (t.type === 'straight') t.rotation = 0;
  }
  // (Open-every-gate already handled by applyTier2Solution.)
  // But the new raccoon-trunk gate needs to be opened too — the
  // tier 2 helper covered tiles already in the puzzle, but tier 3
  // added a NEW gate after that pass. Open every gate here.
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].type === 'gate') tiles[i] = { ...tiles[i], open: true };
  }
  return { ...puzzle, tiles };
}

/**
 * Apply the canonical tier-2 solution: straighten every straight and
 * open every gate. Useful for tests.
 */
export function applyTier2Solution(puzzle: TunnelPuzzle): TunnelPuzzle {
  const tiles = puzzle.tiles.map((t) => ({ ...t }));
  const idx = (x: number, y: number) => y * puzzle.width + x;
  // Fox trunk straights vertical
  for (let y = 2; y <= 9; y++) {
    const t = tiles[idx(6, y)];
    if (t.type === 'straight') t.rotation = 0;
  }
  // Fox branch straights horizontal
  for (let x = 1; x <= 5; x++) {
    const t = tiles[idx(x, 1)];
    if (t.type === 'straight') t.rotation = 1;
  }
  // Hedgehog templates — handle both 'straight' and 'z-east'.
  // Detect template by checking (1, 7): if it's a corner, this is
  // the z-east template; if it's a straight or gate, it's the
  // straight template.
  const hedgeAtRow7 = tiles[idx(1, 7)];
  const isHedgeStraight = hedgeAtRow7.type !== 'corner';
  if (isHedgeStraight) {
    // All col 1 trunk straights → vertical (rotation 0)
    for (let y = 1; y <= 9; y++) {
      const t = tiles[idx(1, y)];
      if (t.type === 'straight') t.rotation = 0;
    }
  } else {
    // z-east hedgehog: col 1 + col 3 vertical, col 2 horizontal jogs.
    for (const c of [{ x: 1, y: 9 }, { x: 3, y: 6 }]) {
      const t = tiles[idx(c.x, c.y)];
      if (t.type === 'straight') t.rotation = 0;
    }
    for (const c of [{ x: 2, y: 7 }, { x: 2, y: 5 }]) {
      const t = tiles[idx(c.x, c.y)];
      if (t.type === 'straight') t.rotation = 1;
    }
  }
  // Open every gate
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].type === 'gate') tiles[i] = { ...tiles[i], open: true };
  }
  return { ...puzzle, tiles };
}
