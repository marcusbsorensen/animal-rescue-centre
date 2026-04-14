import type { Animal, Species } from '@arc/shared-types';

// ── Walk System ────────────────────────────────────────────────
// Animals can go on walks — they encounter roads where the player
// must press "Stop" to teach road safety. Successful walks boost
// bond and happiness. Training with treats teaches new tricks.

export type WalkZone = 'park' | 'town' | 'beach' | 'forest';
export type WalkEvent = 'road_crossing' | 'friendly_animal' | 'treat_found' | 'puddle' | 'bird_chase' | 'rest_spot';

export interface WalkState {
  animal: Animal;
  zone: WalkZone;
  steps: number;
  maxSteps: number;
  leadOn: boolean;
  events: WalkEvent[];
  currentEventIndex: number;
  roadSafetyScore: number;    // 0–100, how well they did at crossings
  incidentCount: number;       // failed road crossings
  treatsUsed: number;
  completed: boolean;
}

export interface WalkEventDef {
  type: WalkEvent;
  emoji: string;
  description: string;
  requiresAction: boolean;
}

export const WALK_EVENTS: WalkEventDef[] = [
  { type: 'road_crossing',  emoji: '🚗', description: 'A road! Remember to stop and look both ways!', requiresAction: true },
  { type: 'friendly_animal', emoji: '🐿️', description: 'A friendly squirrel waves hello!', requiresAction: false },
  { type: 'treat_found',    emoji: '🍬', description: 'Found a treat on the path!', requiresAction: false },
  { type: 'puddle',         emoji: '💧', description: 'A big puddle! Splish splash!', requiresAction: false },
  { type: 'bird_chase',     emoji: '🐦', description: 'A cheeky bird is teasing!', requiresAction: false },
  { type: 'rest_spot',      emoji: '🪑', description: 'A nice bench for a rest.', requiresAction: false },
];

export const WALK_ZONES: Array<{ zone: WalkZone; emoji: string; label: string; description: string }> = [
  { zone: 'park',   emoji: '🌳', label: 'Park',   description: 'A lovely green park with paths and ponds.' },
  { zone: 'town',   emoji: '🏘️', label: 'Town',   description: 'The town centre with shops and crossings.' },
  { zone: 'beach',  emoji: '🏖️', label: 'Beach',  description: 'Sandy beach with waves and seagulls.' },
  { zone: 'forest', emoji: '🌲', label: 'Forest', description: 'A quiet forest full of wildlife.' },
];

/** Species that can go on walks */
export const WALKABLE_SPECIES: Species[] = ['cat', 'dog', 'fox', 'bunny'];

export function canGoOnWalk(animal: Animal): boolean {
  return (
    WALKABLE_SPECIES.includes(animal.species) &&
    animal.state !== 'arriving' &&
    animal.hunger < 70 &&
    animal.tiredness < 70
  );
}

/**
 * Generate a walk's event sequence based on the zone.
 * Town has more road crossings; park/beach/forest have fewer.
 */
export function generateWalkEvents(zone: WalkZone, steps: number): WalkEvent[] {
  const events: WalkEvent[] = [];
  const roadFrequency = zone === 'town' ? 0.4 : zone === 'park' ? 0.2 : 0.1;

  for (let i = 0; i < steps; i++) {
    const roll = Math.random();
    if (roll < roadFrequency) {
      events.push('road_crossing');
    } else if (roll < roadFrequency + 0.15) {
      events.push('friendly_animal');
    } else if (roll < roadFrequency + 0.25) {
      events.push('treat_found');
    } else if (roll < roadFrequency + 0.35) {
      events.push('puddle');
    } else if (roll < roadFrequency + 0.45) {
      events.push('bird_chase');
    } else {
      events.push('rest_spot');
    }
  }

  // Ensure at least one road crossing for educational value
  if (!events.includes('road_crossing') && events.length > 0) {
    events[Math.floor(events.length / 2)] = 'road_crossing';
  }

  return events;
}

/**
 * Start a new walk.
 */
export function startWalk(animal: Animal, zone: WalkZone): WalkState {
  const maxSteps = zone === 'town' ? 6 : 5;
  return {
    animal,
    zone,
    steps: 0,
    maxSteps,
    leadOn: true,
    events: generateWalkEvents(zone, maxSteps),
    currentEventIndex: 0,
    roadSafetyScore: 100,
    incidentCount: 0,
    treatsUsed: 0,
    completed: false,
  };
}

/**
 * Handle a road crossing — player pressed STOP in time.
 */
export function handleRoadCrossingSuccess(state: WalkState): WalkState {
  return { ...state };  // Score stays at 100, no penalty
}

/**
 * Handle a road crossing — player missed the STOP.
 */
export function handleRoadCrossingFail(state: WalkState): WalkState {
  return {
    ...state,
    roadSafetyScore: Math.max(0, state.roadSafetyScore - 25),
    incidentCount: state.incidentCount + 1,
  };
}

/**
 * Advance to the next event on the walk.
 */
export function advanceWalk(state: WalkState): WalkState {
  const nextIndex = state.currentEventIndex + 1;
  const completed = nextIndex >= state.events.length;

  return {
    ...state,
    currentEventIndex: nextIndex,
    steps: state.steps + 1,
    completed,
  };
}

/**
 * Calculate walk rewards when completed.
 */
export function calculateWalkRewards(state: WalkState): {
  bondIncrease: number;
  happinessIncrease: number;
  tirednessIncrease: number;
  perfectWalk: boolean;
} {
  const perfectWalk = state.incidentCount === 0;
  return {
    bondIncrease: perfectWalk ? 8 : 5,
    happinessIncrease: perfectWalk ? 15 : 10,
    tirednessIncrease: 20, // Walks are tiring!
    perfectWalk,
  };
}

// ── Training System ──────────────────────────────────────────

export type Trick = 'sit' | 'paw' | 'spin' | 'fetch' | 'roll_over' | 'high_five';

export interface TrickDef {
  trick: Trick;
  emoji: string;
  label: string;
  treatsRequired: number;
  speciesAllowed: Species[];
}

export const TRICKS: TrickDef[] = [
  { trick: 'sit',        emoji: '🪑', label: 'Sit',        treatsRequired: 1, speciesAllowed: ['cat', 'dog', 'fox', 'bunny'] },
  { trick: 'paw',        emoji: '🐾', label: 'Give Paw',   treatsRequired: 2, speciesAllowed: ['cat', 'dog', 'fox'] },
  { trick: 'spin',       emoji: '🔄', label: 'Spin',       treatsRequired: 2, speciesAllowed: ['dog', 'fox', 'parrot'] },
  { trick: 'fetch',      emoji: '🎾', label: 'Fetch',      treatsRequired: 3, speciesAllowed: ['dog', 'fox'] },
  { trick: 'roll_over',  emoji: '🤸', label: 'Roll Over',  treatsRequired: 3, speciesAllowed: ['dog', 'cat'] },
  { trick: 'high_five',  emoji: '🖐️', label: 'High Five',  treatsRequired: 4, speciesAllowed: ['parrot', 'bat'] },
];

/**
 * Get available tricks for a species that haven't been learned yet.
 */
export function getAvailableTricks(species: Species, learnedTricks: Trick[]): TrickDef[] {
  return TRICKS.filter(
    (t) => t.speciesAllowed.includes(species) && !learnedTricks.includes(t.trick)
  );
}

/**
 * Check if training can proceed (enough treats).
 */
export function canTrain(treatsAvailable: number, trick: TrickDef): boolean {
  return treatsAvailable >= trick.treatsRequired;
}

// ═══════════════════════════════════════════════════════════════
// Grid Walk Explorer System
// ═══════════════════════════════════════════════════════════════

export type WalkTileType =
  | 'grass' | 'path' | 'road' | 'sand' | 'water'
  | 'tree' | 'bush' | 'flower' | 'bench' | 'bin'
  | 'fence' | 'rock' | 'exit';

export interface WalkTile {
  type: WalkTileType;
  walkable: boolean;
  interactable: boolean;
  interacted: boolean;
  variant: number;     // visual variety (0-2)
}

export type WalkDirection = 'up' | 'down' | 'left' | 'right';
export type NPCTemperament = 'friendly' | 'nervous' | 'grumpy';

export interface WalkNPC {
  id: string;
  type: 'animal' | 'person';
  species?: Species;
  temperament?: NPCTemperament;
  row: number;
  col: number;
  patrolPath?: { row: number; col: number }[];
  patrolIndex: number;
  interacted: boolean;
  label: string;
}

export interface WalkGridMap {
  tiles: WalkTile[][];     // [row][col]
  rows: number;
  cols: number;
  playerStart: { row: number; col: number };
  exitTile: { row: number; col: number };
  roadRows: number[];
  npcs: WalkNPC[];
}

export interface WalkGridState {
  animal: Animal;
  zone: WalkZone;
  map: WalkGridMap;
  playerRow: number;
  playerCol: number;
  collarOn: boolean;
  interactionsCompleted: number;
  totalInteractables: number;
  animalsApproached: number;
  animalsIgnored: number;
  roadCrossingsPassed: number;
  roadCrossingsFailed: number;
  totalRoadCrossings: number;
  crossedRoadRows: number[];
  completed: boolean;
}

export interface InteractionResult {
  message: string;
  emoji: string;
  happinessChange: number;
  tirednessChange: number;
  bondChange: number;
  foundTreat: boolean;
}

export interface EncounterResult {
  message: string;
  happinessChange: number;
  bondChange: number;
  fled: boolean;       // nervous animal ran away
}

// ── Tile definitions ────────────────────────────────────────
export const TILE_DEFS: Record<WalkTileType, {
  walkable: boolean; interactable: boolean;
  emoji: string; colour: number; label: string;
}> = {
  grass:  { walkable: true,  interactable: false, emoji: '',   colour: 0x7ec850, label: 'Grass' },
  path:   { walkable: true,  interactable: false, emoji: '',   colour: 0xc4a675, label: 'Path' },
  road:   { walkable: false, interactable: false, emoji: '',   colour: 0x888888, label: 'Road' },
  sand:   { walkable: true,  interactable: false, emoji: '',   colour: 0xf0d890, label: 'Sand' },
  water:  { walkable: false, interactable: false, emoji: '💧', colour: 0x4499cc, label: 'Water' },
  tree:   { walkable: false, interactable: false, emoji: '🌳', colour: 0x2d5a1e, label: 'Tree' },
  bush:   { walkable: true,  interactable: true,  emoji: '🌿', colour: 0x3a7a2e, label: 'Bush' },
  flower: { walkable: true,  interactable: true,  emoji: '🌸', colour: 0x7ec850, label: 'Flower' },
  bench:  { walkable: true,  interactable: true,  emoji: '🪑', colour: 0x8b6914, label: 'Bench' },
  bin:    { walkable: true,  interactable: true,  emoji: '🗑️', colour: 0x555555, label: 'Bin' },
  fence:  { walkable: false, interactable: false, emoji: '',   colour: 0x8b6914, label: 'Fence' },
  rock:   { walkable: false, interactable: false, emoji: '🪨', colour: 0x999999, label: 'Rock' },
  exit:   { walkable: true,  interactable: false, emoji: '🚩', colour: 0x44aa44, label: 'Exit' },
};

// ── Zone map templates ──────────────────────────────────────
// Compact: G=grass, P=path, R=road, T=tree, F=fence, W=water
// B=bush, L=flower, H=bench, N=bin, K=rock, S=sand, X=exit
const TILE_CODES: Record<string, WalkTileType> = {
  G: 'grass', P: 'path', R: 'road', T: 'tree', F: 'fence',
  W: 'water', B: 'bush', L: 'flower', H: 'bench', N: 'bin',
  K: 'rock',  S: 'sand', X: 'exit',
};

const PARK_MAPS: string[][] = [
  [
    'TTTGGLGGGGGLGTTT',
    'TGGLGBGGGLGGGBGT',
    'GGLGPPPPPPPPGLGG',
    'GGBGPGGGHGGPGGBG',
    'GLGGPGLGGBGPGLGG',
    'RRRRRRRRRRRRRRRR',
    'GGLGPGGGLGGPGGGG',
    'GGBGPGWWWGGPGLGG',
    'GGLGPGWWWBGPGGBG',
    'GGGGPPPPPPPPGGGG',
    'TGGLGGBNGLGGGXGT',
    'TTTGGGGGGGGGGTTT',
  ],
  [
    'TTTTTGGGLGGGTGGT',
    'TGLGGBGGLGGGBGGT',
    'GGPPPPPPPPPPPPGG',
    'GLPGGHGLGGNGPGGG',
    'GGPGGLGGBGGPGLGT',
    'GGPGGGGGLGGPGGGG',
    'RRRRRRRRRRRRRRRR',
    'GGPGGLGGHGGPGGGG',
    'GLPGGBGGGLGPGGBT',
    'GGPPPPPPPPPPPPGG',
    'TGGGLGBLGGGLGGGT',
    'TTTGGGGGGGGXGTTT',
  ],
];

const TOWN_MAPS: string[][] = [
  [
    'FFPPPPPFFPPPPPFF',
    'FGPNGHPFGPNGHPFG',
    'GGPGGBPGGPGGBPGG',
    'RRRRRRRRRRRRRRRR',
    'GGPGGLPGGPGGLPGG',
    'FGPHGNPFGPHGNPFG',
    'FFPPPPPFFPPPPPFF',
    'FGPGBLPFGPGBLPFG',
    'GGPGGHPGGPGGHPGG',
    'RRRRRRRRRRRRRRRR',
    'GGPGGBPGGPGGNPGG',
    'FFPPPPPFFPPPXPFF',
  ],
  [
    'FFGGPPPPPGGPPPPF',
    'FGNHPGBLPNHPGLPF',
    'GGGGPGGBPGGPGGGG',
    'RRRRRRRRRRRRRRRR',
    'GGGGPGGGLGGPGGGG',
    'FGBHPGGGPBHPGGPF',
    'FFGGPPPPPGGPPPPF',
    'FGNLPGGHPNLPGGPF',
    'GGGGPGGBPGGPGGGG',
    'RRRRRRRRRRRRRRRR',
    'GGGGPGGLPGGPGGGG',
    'FFGGPPPPPXGPPPPF',
  ],
];

const BEACH_MAPS: string[][] = [
  [
    'TTGGGGSSSSSSSWWW',
    'TGBGGLSSSSKSWWWW',
    'GGLGPPSSSSSSWWWW',
    'GGBGPPSSSHSSWWWW',
    'GLGGPPSSSBSSWWWW',
    'GGGGPPSSSSSSWWWW',
    'RRRRRRRRRRRRRRRR',
    'GGGLPPSSSLSSWWWW',
    'GGLGPPSSSKSSWWWW',
    'TGBGPPSSSSSSWWWW',
    'TTGGPPSSSHSSWWWW',
    'TTTGPPSSSSXSWWWW',
  ],
];

const FOREST_MAPS: string[][] = [
  [
    'TTTTGBGLGTTTTGTT',
    'TTGLPPPPPPGBGTTT',
    'TGBGPTTTTGPGGLTT',
    'GGGGPTWWTGPGGGTT',
    'TLBGPTWWTBPGGBGT',
    'TTGGPPPPPPPPGGTT',
    'TTGLGBPTTGBPGLTT',
    'TGGGGGPTTGGPGGGT',
    'GGBLGGPTTBLPGBGG',
    'TGGLHGPPPPPPGGTT',
    'TTGGBGLGNGGLXGTT',
    'TTTTTGGGGGGTTTTT',
  ],
];

const ZONE_TEMPLATES: Record<WalkZone, string[][]> = {
  park: PARK_MAPS,
  town: TOWN_MAPS,
  beach: BEACH_MAPS,
  forest: FOREST_MAPS,
};

// ── Map generation ──────────────────────────────────────────

function parseTileCode(code: string, variant: number): WalkTile {
  const type = TILE_CODES[code] ?? 'grass';
  const def = TILE_DEFS[type];
  return {
    type,
    walkable: def.walkable,
    interactable: def.interactable,
    interacted: false,
    variant,
  };
}

function generateNPCs(zone: WalkZone, map: WalkTile[][]): WalkNPC[] {
  const npcs: WalkNPC[] = [];
  const rows = map.length;
  const cols = map[0].length;

  // Find walkable grass/path tiles for NPC placement
  const walkableTiles: { row: number; col: number }[] = [];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (map[r][c].walkable && !map[r][c].interactable && map[r][c].type !== 'road' && map[r][c].type !== 'exit') {
        walkableTiles.push({ row: r, col: c });
      }
    }
  }

  // Shuffle and pick spots
  const shuffled = walkableTiles.sort(() => Math.random() - 0.5);

  const ANIMAL_NPCS: Array<{ species: Species; label: string }> = [
    { species: 'dog', label: 'A friendly labrador' },
    { species: 'cat', label: 'A curious tabby' },
    { species: 'fox', label: 'A cautious fox' },
    { species: 'bunny', label: 'A hopping bunny' },
  ];

  const PERSON_LABELS = [
    'A jogger', 'A dog walker', 'An elderly person', 'A child playing',
    'A park ranger', 'A fisherman',
  ];

  const temperaments: NPCTemperament[] = ['friendly', 'friendly', 'nervous', 'grumpy'];

  // 2-3 animals
  const numAnimals = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < numAnimals && i < shuffled.length; i++) {
    const pos = shuffled[i];
    const animalDef = ANIMAL_NPCS[i % ANIMAL_NPCS.length];
    npcs.push({
      id: `npc-animal-${i}`,
      type: 'animal',
      species: animalDef.species,
      temperament: temperaments[i % temperaments.length],
      row: pos.row,
      col: pos.col,
      patrolIndex: 0,
      interacted: false,
      label: animalDef.label,
    });
  }

  // 2 people
  const personStart = numAnimals;
  for (let i = 0; i < 2 && personStart + i < shuffled.length; i++) {
    const pos = shuffled[personStart + i];
    npcs.push({
      id: `npc-person-${i}`,
      type: 'person',
      row: pos.row,
      col: pos.col,
      patrolIndex: 0,
      interacted: false,
      label: PERSON_LABELS[Math.floor(Math.random() * PERSON_LABELS.length)],
    });
  }

  return npcs;
}

export function generateWalkGrid(zone: WalkZone): WalkGridMap {
  const templates = ZONE_TEMPLATES[zone];
  const template = templates[Math.floor(Math.random() * templates.length)];

  const rows = template.length;
  const cols = template[0].length;
  const tiles: WalkTile[][] = [];
  const roadRows: number[] = [];
  let exitTile = { row: rows - 1, col: cols - 1 };
  let playerStart = { row: 0, col: 0 };

  for (let r = 0; r < rows; r++) {
    const row: WalkTile[] = [];
    for (let c = 0; c < cols; c++) {
      const code = template[r][c];
      const variant = Math.floor(Math.random() * 3);
      const tile = parseTileCode(code, variant);
      row.push(tile);

      if (tile.type === 'road' && !roadRows.includes(r)) {
        roadRows.push(r);
      }
      if (tile.type === 'exit') {
        exitTile = { row: r, col: c };
      }
    }
    tiles.push(row);
  }

  // Player starts on the first walkable path tile in top rows
  for (let r = 0; r < 3 && playerStart.row === 0 && playerStart.col === 0; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r][c].type === 'path' || tiles[r][c].type === 'grass') {
        playerStart = { row: r, col: c };
        break;
      }
    }
  }

  const npcs = generateNPCs(zone, tiles);

  return { tiles, rows, cols, playerStart, exitTile, roadRows, npcs };
}

// ── Grid walk state ─────────────────────────────────────────

export function startGridWalk(animal: Animal, zone: WalkZone): WalkGridState {
  const map = generateWalkGrid(zone);

  // Count total interactables
  let totalInteractables = 0;
  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.interactable) totalInteractables++;
    }
  }

  return {
    animal,
    zone,
    map,
    playerRow: map.playerStart.row,
    playerCol: map.playerStart.col,
    collarOn: false,
    interactionsCompleted: 0,
    totalInteractables,
    animalsApproached: 0,
    animalsIgnored: 0,
    roadCrossingsPassed: 0,
    roadCrossingsFailed: 0,
    totalRoadCrossings: map.roadRows.length,
    crossedRoadRows: [],
    completed: false,
  };
}

// ── Movement ────────────────────────────────────────────────

export type MoveTrigger = 'road_crossing' | 'npc_encounter' | 'exit' | null;

export function movePlayer(
  state: WalkGridState,
  direction: WalkDirection,
): { state: WalkGridState; blocked: boolean; trigger: MoveTrigger; npcId?: string } {
  const dr = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  const dc = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  const newRow = state.playerRow + dr;
  const newCol = state.playerCol + dc;

  // Bounds check
  if (newRow < 0 || newRow >= state.map.rows || newCol < 0 || newCol >= state.map.cols) {
    return { state, blocked: true, trigger: null };
  }

  const tile = state.map.tiles[newRow][newCol];

  // Road crossing check — trigger event if road not yet crossed
  if (tile.type === 'road' && !state.crossedRoadRows.includes(newRow)) {
    return { state, blocked: false, trigger: 'road_crossing' };
  }

  // Solid tile check
  if (!tile.walkable) {
    return { state, blocked: true, trigger: null };
  }

  // Check for NPC at destination
  const npc = state.map.npcs.find((n) => n.row === newRow && n.col === newCol && !n.interacted);
  if (npc && npc.type === 'animal') {
    return {
      state: { ...state, playerRow: newRow, playerCol: newCol },
      blocked: false,
      trigger: 'npc_encounter',
      npcId: npc.id,
    };
  }

  // Exit tile
  if (tile.type === 'exit') {
    return {
      state: { ...state, playerRow: newRow, playerCol: newCol, completed: true },
      blocked: false,
      trigger: 'exit',
    };
  }

  // Normal movement
  return {
    state: { ...state, playerRow: newRow, playerCol: newCol },
    blocked: false,
    trigger: null,
  };
}

// ── Tile interactions ───────────────────────────────────────

export function interactWithTile(state: WalkGridState): {
  state: WalkGridState;
  result: InteractionResult | null;
} {
  const tile = state.map.tiles[state.playerRow][state.playerCol];

  if (!tile.interactable || tile.interacted) {
    // Check adjacent tiles too
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of dirs) {
      const r = state.playerRow + dr;
      const c = state.playerCol + dc;
      if (r >= 0 && r < state.map.rows && c >= 0 && c < state.map.cols) {
        const adj = state.map.tiles[r][c];
        if (adj.interactable && !adj.interacted) {
          return doInteraction(state, r, c);
        }
      }
    }
    return { state, result: null };
  }

  return doInteraction(state, state.playerRow, state.playerCol);
}

function doInteraction(state: WalkGridState, row: number, col: number): {
  state: WalkGridState;
  result: InteractionResult;
} {
  const tile = state.map.tiles[row][col];
  const newTiles = state.map.tiles.map((r, ri) =>
    r.map((t, ci) => (ri === row && ci === col ? { ...t, interacted: true } : t))
  );

  let result: InteractionResult;

  switch (tile.type) {
    case 'flower':
      result = {
        message: `${state.animal.name} sniffs the flowers! Lovely!`,
        emoji: '🌸', happinessChange: 2, tirednessChange: 0, bondChange: 1, foundTreat: false,
      };
      break;
    case 'bush':
      result = {
        message: `${state.animal.name} marks the bush. Good ${state.animal.species}!`,
        emoji: '🌿', happinessChange: 1, tirednessChange: 0, bondChange: 1, foundTreat: false,
      };
      break;
    case 'bin':
      if (Math.random() < 0.3) {
        result = {
          message: `${state.animal.name} found a treat in the bin!`,
          emoji: '🎁', happinessChange: 3, tirednessChange: 0, bondChange: 2, foundTreat: true,
        };
      } else {
        result = {
          message: `${state.animal.name} sniffs the bin... nothing interesting.`,
          emoji: '🗑️', happinessChange: 0, tirednessChange: 0, bondChange: 0, foundTreat: false,
        };
      }
      break;
    case 'bench':
      result = {
        message: `${state.animal.name} rests on the bench. Ahh, nice!`,
        emoji: '🪑', happinessChange: 1, tirednessChange: -5, bondChange: 1, foundTreat: false,
      };
      break;
    default:
      result = {
        message: `${state.animal.name} sniffs around.`,
        emoji: '🐾', happinessChange: 0, tirednessChange: 0, bondChange: 0, foundTreat: false,
      };
  }

  return {
    state: {
      ...state,
      map: { ...state.map, tiles: newTiles },
      interactionsCompleted: state.interactionsCompleted + 1,
    },
    result,
  };
}

// ── NPC encounters ──────────────────────────────────────────

export function handleAnimalEncounter(
  state: WalkGridState,
  npcId: string,
  action: 'approach' | 'ignore',
): { state: WalkGridState; result: EncounterResult } {
  const npcIndex = state.map.npcs.findIndex((n) => n.id === npcId);
  if (npcIndex === -1) {
    return { state, result: { message: '', happinessChange: 0, bondChange: 0, fled: false } };
  }

  const npc = state.map.npcs[npcIndex];
  const newNpcs = state.map.npcs.map((n, i) =>
    i === npcIndex ? { ...n, interacted: true } : n
  );

  if (action === 'ignore') {
    return {
      state: {
        ...state,
        map: { ...state.map, npcs: newNpcs },
        animalsIgnored: state.animalsIgnored + 1,
      },
      result: {
        message: `${state.animal.name} walks past calmly. Good choice!`,
        happinessChange: 0, bondChange: 1, fled: false,
      },
    };
  }

  // Approach
  let result: EncounterResult;
  switch (npc.temperament) {
    case 'friendly':
      result = {
        message: `${npc.label} wants to play! They have a lovely time together.`,
        happinessChange: 3, bondChange: 2, fled: false,
      };
      break;
    case 'nervous':
      result = {
        message: `${npc.label} is nervous and runs away. No worries!`,
        happinessChange: 0, bondChange: 0, fled: true,
      };
      break;
    case 'grumpy':
      result = {
        message: `${npc.label} growls! Better to leave them alone.`,
        happinessChange: -2, bondChange: 0, fled: false,
      };
      break;
    default:
      result = { message: 'Nothing happens.', happinessChange: 0, bondChange: 0, fled: false };
  }

  return {
    state: {
      ...state,
      map: { ...state.map, npcs: newNpcs },
      animalsApproached: state.animalsApproached + 1,
    },
    result,
  };
}

// ── Road crossing results ───────────────────────────────────

export function handleGridRoadCrossing(
  state: WalkGridState,
  roadRow: number,
  success: boolean,
): WalkGridState {
  // Mark all road tiles in this row as walkable
  const newTiles = state.map.tiles.map((r, ri) =>
    ri === roadRow ? r.map((t) => ({ ...t, walkable: true })) : r
  );

  return {
    ...state,
    map: { ...state.map, tiles: newTiles },
    crossedRoadRows: [...state.crossedRoadRows, roadRow],
    roadCrossingsPassed: success ? state.roadCrossingsPassed + 1 : state.roadCrossingsPassed,
    roadCrossingsFailed: success ? state.roadCrossingsFailed : state.roadCrossingsFailed + 1,
  };
}

// ── NPC patrol movement ─────────────────────────────────────

export function advanceNPCs(state: WalkGridState): WalkGridState {
  const newNpcs = state.map.npcs.map((npc) => {
    if (!npc.patrolPath || npc.patrolPath.length === 0 || npc.interacted) return npc;
    const nextIndex = (npc.patrolIndex + 1) % npc.patrolPath.length;
    const next = npc.patrolPath[nextIndex];
    return { ...npc, row: next.row, col: next.col, patrolIndex: nextIndex };
  });
  return { ...state, map: { ...state.map, npcs: newNpcs } };
}

// ── Grid walk rewards ───────────────────────────────────────

export function calculateGridWalkRewards(state: WalkGridState): {
  bondIncrease: number;
  happinessIncrease: number;
  tirednessIncrease: number;
  perfectWalk: boolean;
  explorationPercent: number;
} {
  const explorationPercent = state.totalInteractables > 0
    ? Math.round((state.interactionsCompleted / state.totalInteractables) * 100)
    : 100;

  const perfectRoads = state.roadCrossingsFailed === 0;
  const goodExploration = explorationPercent >= 60;
  const perfectWalk = perfectRoads && goodExploration;

  // Base rewards
  let bondIncrease = 5;
  let happinessIncrease = 8;
  const tirednessIncrease = 15;

  // Bonuses
  if (perfectRoads) bondIncrease += 3;
  if (goodExploration) happinessIncrease += 5;
  if (perfectWalk) {
    bondIncrease += 5;
    happinessIncrease += 5;
  }
  // Each NPC interaction adds a small bonus
  bondIncrease += state.animalsApproached;

  return { bondIncrease, happinessIncrease, tirednessIncrease, perfectWalk, explorationPercent };
}
