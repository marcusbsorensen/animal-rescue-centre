// A.R.C. Shared Types
// Core domain types used across client and server

export type Species = 'cat' | 'dog' | 'fox' | 'bunny' | 'bat' | 'parrot' | 'snake';

export type AnimalState = 'arriving' | 'sheltered' | 'bonding' | 'pet';

export interface Animal {
  id: string;
  name: string;
  species: Species;
  variant?: string;     // e.g. 'ginger', 'dalmatian' — visual variety
  state: AnimalState;
  arrivalStory: string;
  hunger: number;       // 0–100, 0 = full
  tiredness: number;    // 0–100, 0 = rested
  happiness: number;    // 0–100, 100 = max
  health: number;       // 0–100, 100 = full health
  bondLevel: number;    // 0–100, 100 = fully bonded
  siblingId?: string;   // linked sibling
  roomId: string;
  bedId?: string;
  collarColour?: string; // set when becomes pet
}

export interface GameState {
  userId: string;
  animals: Animal[];
  pets: Animal[];       // animals with state === 'pet'
  level: number;
  totalRescued: number;
  inventory: Inventory;
  unlockedSpecies: Species[];
  houseUpgrades: string[];
  depot?: DepotState;
  supplyRuns?: SupplyRunsStats;
  calendar?: CalendarState;
  economy?: Economy;
}

export interface Inventory {
  food: FoodItem[];
  treats: number;
  pooBags: number;
  toys: string[];
  blankets: string[];
  decorations: string[];
}

export interface FoodItem {
  type: string;
  forSpecies: Species[];
  quantity: number;
}

export interface User {
  id: string;
  username: string;
  avatarEmoji: string;
  avatarBgColour: string;
  joinCode: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface Gift {
  id: string;
  fromUser: string;
  toUser: string;
  giftType: 'treat_bundle' | 'toy' | 'blanket_pattern' | 'decoration';
  messagePresetCode: string;
  sentAt: string;
  claimedAt?: string;
}

export interface Badge {
  code: string;
  name: string;
  description: string;
}

export interface RescueStats {
  userId: string;
  catsRescued: number;
  dogsRescued: number;
  bunniesRescued: number;
  foxesRescued: number;
  snakesRescued: number;
  parrotsRescued: number;
  batsRescued: number;
  totalRescued: number;
  badgesUnlockedCount: number;
  giftsSentCount: number;
  giftsReceivedCount: number;
}

// ── Depot System Types ───────────────────────────────────────

export type DepotMode = 'parts_and_tools' | 'treats_kitchen' | 'decorations' | 'medical_supplies';

export type TileType = string; // mode-specific tile identifier (e.g. 'spanner', 'cog', 'biscuit')

export type PowerUpType = 'rocket' | 'bomb' | 'rainbow';

export interface Tile {
  type: TileType;
  powerUp?: PowerUpType;
}

export interface BoardGoal {
  type: 'clear_count' | 'collect_type' | 'drop_to_bottom';
  targetTile?: TileType;
  targetCount: number;
  currentCount: number;
}

export interface BoardState {
  grid: (Tile | null)[][];     // [row][col], null = empty cell
  rows: number;
  cols: number;
  mode: DepotMode;
  moves: number;
  score: number;
  goals: BoardGoal[];
  isComplete: boolean;
  startedAt: string;           // ISO timestamp
}

export interface DepotInventory {
  parts: Record<string, number>;
  tools: Record<string, number>;
  treats: Record<string, number>;
  superTreats: Record<string, number>;
  decorations: Record<string, number>;
  medicalSupplies: Record<string, number>;
}

export interface DepotState {
  sessionsRemainingToday: number;
  sessionsMaxToday: number;       // Default 3, earnable up to 10
  lastSessionDay: string;         // YYYY-MM-DD for daily reset
  activeBoardState?: BoardState;  // Persisted mid-session board
  totalSessionsPlayed: number;
  inventory: DepotInventory;
}

// ── Supply Run Types ─────────────────────────────────────────

export type SupplyDestination = 'bramble_farm' | 'cove_harbour' | 'pinebark_medical';

export type DamageType = 'scratches' | 'dents' | 'rattles' | 'broken_lights' | 'suspension' | 'engine_trouble' | 'bodywork' | 'total';

export interface DamageEntry {
  type: DamageType;
  severity: number;  // 0-100
}

export interface SupplyRunState {
  destination: SupplyDestination;
  distance: number;           // total distance units
  distanceCovered: number;    // progress
  speed: number;              // current speed
  maxSpeed: number;
  damages: DamageEntry[];
  obstaclesDestroyed: number;
  timeTakenMs: number;
  timeTrialMode: boolean;
  timeTrialLimitMs?: number;
  completed: boolean;
  outcome: 'success' | 'totalled' | 'in_progress';
  earnings: number;
}

export interface SupplyRunsStats {
  totalRunsCompleted: number;
  runsPerDestination: Record<SupplyDestination, number>;
  totalEarnings: number;
  biggestSmash: number;       // highest single-run damage value
  fastestTimes: Record<SupplyDestination, number>;  // ms
}

// ── Calendar Types ───────────────────────────────────────────

export type Season = 'spring_bloom' | 'summer_warmth' | 'autumn_hush' | 'winter_cosy';

export interface CalendarState {
  gameStartedAt: string;
  currentInGameDate: { year: number; month: number; day: number };
  currentSeason: Season;
  activeEvents: string[];
  dayOfYear: number;
  lastRealDayChecked: string; // YYYY-MM-DD — for daily reset logic
}

// ── Economy ──────────────────────────────────────────────────

export interface Economy {
  coins: number;               // earned from supply runs + care deliveries
  lifetimeEarnings: number;    // never decreases
}
