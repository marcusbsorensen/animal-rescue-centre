import type { DepotMode, DepotState, BoardGoal, Season } from '@arc/shared-types';

// ── Depot Inventory ───────────────────────────────────────────
// Item catalogues for the 4 Depot puzzle modes: tile sets,
// reward tables, super-treats, and session helpers.
// All functions are pure; no side-effects.

// ── Tile Definitions ──────────────────────────────────────────

export interface TileDefinition {
  type: string;
  emoji: string;
  label: string;
  mode: DepotMode;
}

export const PARTS_TILES: TileDefinition[] = [
  { type: 'spanner',      emoji: '🔧', label: 'Spanner',       mode: 'parts_and_tools' },
  { type: 'cog',          emoji: '⚙️',  label: 'Cog',           mode: 'parts_and_tools' },
  { type: 'nut',          emoji: '🔩', label: 'Nut',           mode: 'parts_and_tools' },
  { type: 'bolt',         emoji: '🪛', label: 'Bolt',          mode: 'parts_and_tools' },
  { type: 'screwdriver',  emoji: '🪠', label: 'Screwdriver',   mode: 'parts_and_tools' },
  { type: 'wire_coil',    emoji: '🧲', label: 'Wire Coil',     mode: 'parts_and_tools' },
];

export const TREATS_TILES: TileDefinition[] = [
  { type: 'biscuit',      emoji: '🍪', label: 'Biscuit',       mode: 'treats_kitchen' },
  { type: 'cheese_cube',  emoji: '🧀', label: 'Cheese Cube',   mode: 'treats_kitchen' },
  { type: 'seed',         emoji: '🌻', label: 'Seed',          mode: 'treats_kitchen' },
  { type: 'pellet',       emoji: '🟤', label: 'Pellet',        mode: 'treats_kitchen' },
  { type: 'crunchy',      emoji: '🥜', label: 'Crunchy',       mode: 'treats_kitchen' },
  { type: 'fish_flake',   emoji: '🐟', label: 'Fish Flake',    mode: 'treats_kitchen' },
];

export const DECORATIONS_TILES: Record<Season, TileDefinition[]> = {
  spring_bloom: [
    { type: 'daisy',        emoji: '🌼', label: 'Daisy',         mode: 'decorations' },
    { type: 'butterfly',    emoji: '🦋', label: 'Butterfly',     mode: 'decorations' },
    { type: 'watering_can', emoji: '🚿', label: 'Watering Can',  mode: 'decorations' },
    { type: 'egg_basket',   emoji: '🧺', label: 'Egg Basket',    mode: 'decorations' },
    { type: 'birdhouse',    emoji: '🏠', label: 'Birdhouse',     mode: 'decorations' },
    { type: 'rainbow',      emoji: '🌈', label: 'Rainbow',       mode: 'decorations' },
  ],
  summer_warmth: [
    { type: 'sunflower',    emoji: '🌻', label: 'Sunflower',     mode: 'decorations' },
    { type: 'beach_ball',   emoji: '🏖️',  label: 'Beach Ball',    mode: 'decorations' },
    { type: 'ice_lolly',    emoji: '🍦', label: 'Ice Lolly',     mode: 'decorations' },
    { type: 'parasol',      emoji: '⛱️',  label: 'Parasol',       mode: 'decorations' },
    { type: 'seashell',     emoji: '🐚', label: 'Seashell',      mode: 'decorations' },
    { type: 'sandcastle',   emoji: '🏰', label: 'Sandcastle',    mode: 'decorations' },
  ],
  autumn_hush: [
    { type: 'maple_leaf',   emoji: '🍁', label: 'Maple Leaf',    mode: 'decorations' },
    { type: 'acorn',        emoji: '🌰', label: 'Acorn',         mode: 'decorations' },
    { type: 'pumpkin',      emoji: '🎃', label: 'Pumpkin',       mode: 'decorations' },
    { type: 'toadstool',    emoji: '🍄', label: 'Toadstool',     mode: 'decorations' },
    { type: 'pine_cone',    emoji: '🌲', label: 'Pine Cone',     mode: 'decorations' },
    { type: 'lantern',      emoji: '🏮', label: 'Lantern',       mode: 'decorations' },
  ],
  winter_cosy: [
    { type: 'snowflake',    emoji: '❄️',  label: 'Snowflake',     mode: 'decorations' },
    { type: 'bauble',       emoji: '🔴', label: 'Bauble',        mode: 'decorations' },
    { type: 'candy_cane',   emoji: '🍬', label: 'Candy Cane',    mode: 'decorations' },
    { type: 'woolly_hat',   emoji: '🧶', label: 'Woolly Hat',    mode: 'decorations' },
    { type: 'hot_cocoa',    emoji: '☕', label: 'Hot Cocoa',     mode: 'decorations' },
    { type: 'star',         emoji: '⭐', label: 'Star',          mode: 'decorations' },
  ],
};

export const MEDICAL_TILES: TileDefinition[] = [
  { type: 'bandage',      emoji: '🩹', label: 'Bandage',       mode: 'medical_supplies' },
  { type: 'pill',         emoji: '💊', label: 'Pill',          mode: 'medical_supplies' },
  { type: 'thermometer',  emoji: '🌡️',  label: 'Thermometer',   mode: 'medical_supplies' },
  { type: 'ice_pack',     emoji: '🧊', label: 'Ice Pack',      mode: 'medical_supplies' },
  { type: 'splint',       emoji: '🦴', label: 'Splint',        mode: 'medical_supplies' },
  { type: 'ointment',     emoji: '🧴', label: 'Ointment',      mode: 'medical_supplies' },
];

// ── Board Dimensions ──────────────────────────────────────────

const BOARD_DIMENSIONS: Record<DepotMode, { width: number; height: number }> = {
  parts_and_tools:  { width: 9, height: 9 },
  treats_kitchen:   { width: 8, height: 8 },
  decorations:      { width: 10, height: 8 },
  medical_supplies: { width: 7, height: 9 },
};

// ── Reward Items ──────────────────────────────────────────────

export interface RewardItem {
  code: string;
  emoji: string;
  label: string;
  category: 'part' | 'tool' | 'treat' | 'super_treat' | 'decoration' | 'medical';
  rarity: 'common' | 'uncommon' | 'rare' | 'very_rare' | 'ultra_rare';
  description: string;
  giftable: boolean;
}

// Parts & Tools rewards
const PARTS_REWARDS: RewardItem[] = [
  { code: 'rusty_bolt',        emoji: '🔩', label: 'Rusty Bolt',        category: 'part',  rarity: 'common',    description: 'A slightly rusty bolt. Still perfectly usable!',                 giftable: false },
  { code: 'shiny_cog',         emoji: '⚙️',  label: 'Shiny Cog',         category: 'part',  rarity: 'common',    description: 'A bright golden cog that spins like a dream.',                   giftable: false },
  { code: 'copper_wire',       emoji: '🧲', label: 'Copper Wire',       category: 'part',  rarity: 'common',    description: 'A coil of bendy copper wire for fixing things.',                 giftable: false },
  { code: 'mini_spanner',      emoji: '🔧', label: 'Mini Spanner',      category: 'tool',  rarity: 'uncommon',  description: 'A tiny spanner for small repairs around the centre.',            giftable: false },
  { code: 'rubber_mallet',     emoji: '🔨', label: 'Rubber Mallet',     category: 'tool',  rarity: 'uncommon',  description: 'A gentle mallet that never hurts the furniture.',                giftable: false },
  { code: 'turbo_wrench',      emoji: '🪛', label: 'Turbo Wrench',      category: 'tool',  rarity: 'rare',      description: 'A super-fast wrench. Fixes things in a flash!',                  giftable: false },
  { code: 'golden_screwdriver', emoji: '✨', label: 'Golden Screwdriver', category: 'tool', rarity: 'very_rare', description: 'The fanciest screwdriver in all the land.',                       giftable: false },
  { code: 'wonder_toolkit',    emoji: '🧰', label: 'Wonder Toolkit',    category: 'tool',  rarity: 'ultra_rare', description: 'A legendary toolkit that can build absolutely anything!',        giftable: false },
];

// Treats rewards
const TREATS_REWARDS: RewardItem[] = [
  { code: 'peanut_nibble',     emoji: '🥜', label: 'Peanut Nibble',     category: 'treat', rarity: 'common',    description: 'A crunchy peanut treat. All animals love it.',                   giftable: false },
  { code: 'cheesy_puff',       emoji: '🧀', label: 'Cheesy Puff',       category: 'treat', rarity: 'common',    description: 'A light and fluffy cheese puff. Irresistible!',                  giftable: false },
  { code: 'honey_crumble',     emoji: '🍯', label: 'Honey Crumble',     category: 'treat', rarity: 'common',    description: 'Sweet crumbly biscuit drizzled with honey.',                     giftable: false },
  { code: 'berry_blast',       emoji: '🫐', label: 'Berry Blast',       category: 'treat', rarity: 'uncommon',  description: 'A burst of mixed berries packed into a tiny ball.',              giftable: false },
  { code: 'carrot_crisp',      emoji: '🥕', label: 'Carrot Crisp',      category: 'treat', rarity: 'uncommon',  description: 'Thin carrot slices baked until perfectly crunchy.',              giftable: false },
  { code: 'starlight_seed',    emoji: '🌟', label: 'Starlight Seed',    category: 'treat', rarity: 'rare',      description: 'A seed that glows faintly in the dark. Tastes like sunshine.',   giftable: false },
  { code: 'golden_kibble',     emoji: '🥇', label: 'Golden Kibble',     category: 'treat', rarity: 'very_rare', description: 'Premium kibble coated in edible gold. Fancy!',                   giftable: false },
];

// Super-Treats (all 13 from spec)
const SUPER_TREATS: RewardItem[] = [
  { code: 'rainbow_biscuit',   emoji: '🌈', label: 'Rainbow Biscuit',    category: 'super_treat', rarity: 'rare',      description: 'A biscuit with every colour of the rainbow baked in.',             giftable: false },
  { code: 'sky_high_sausage',  emoji: '🌭', label: 'Sky-high Sausage',   category: 'super_treat', rarity: 'rare',      description: 'A sausage so tall it nearly touches the clouds.',                  giftable: false },
  { code: 'thunder_crunch',    emoji: '⚡', label: 'Thunder Crunch',     category: 'super_treat', rarity: 'rare',      description: 'Crunch into this and hear a teeny tiny thunderclap!',              giftable: false },
  { code: 'hamster_hat',       emoji: '🎩', label: 'Hamster Hat',        category: 'super_treat', rarity: 'very_rare', description: 'A treat shaped like a tiny top hat. Adorable and tasty.',          giftable: false },
  { code: 'worry_wafer',       emoji: '😌', label: 'Worry Wafer',        category: 'super_treat', rarity: 'rare',      description: 'Nibble one and your worries float away like bubbles.',             giftable: false },
  { code: 'grumble_gum',       emoji: '😤', label: 'Grumble Gum',        category: 'super_treat', rarity: 'rare',      description: 'Chew this and all your grumbles turn into giggles.',               giftable: false },
  { code: 'the_biggest_biscuit', emoji: '🍪', label: 'The Biggest Biscuit', category: 'super_treat', rarity: 'very_rare', description: 'It is, in fact, the biggest biscuit anyone has ever seen.',       giftable: false },
  { code: 'silly_sardine',     emoji: '🐟', label: 'Silly Sardine',      category: 'super_treat', rarity: 'rare',      description: 'A sardine that makes you do a silly dance after eating it.',       giftable: false },
  { code: 'sock_treat',        emoji: '🧦', label: 'Sock Treat',         category: 'super_treat', rarity: 'very_rare', description: 'Looks exactly like a sock but tastes like strawberries.',           giftable: false },
  { code: 'cloud_custard',     emoji: '☁️',  label: 'Cloud Custard',      category: 'super_treat', rarity: 'rare',      description: 'Fluffy custard scooped straight from a passing cloud.',            giftable: false },
  { code: 'bongo_bone',        emoji: '🥁', label: 'Bongo Bone',         category: 'super_treat', rarity: 'rare',      description: 'A bone-shaped treat that plays a little drum beat when you bite.', giftable: false },
  { code: 'infinity_kibble',   emoji: '♾️',  label: 'Infinity Kibble',    category: 'super_treat', rarity: 'ultra_rare', description: 'One piece of kibble that never seems to run out.',                giftable: false },
  { code: 'secret_sprinkle',   emoji: '✨', label: 'Secret Sprinkle',    category: 'super_treat', rarity: 'ultra_rare', description: 'Nobody knows what flavour it is. Every animal tastes something different.', giftable: false },
];

// Decoration rewards
const DECORATION_REWARDS: RewardItem[] = [
  { code: 'flower_pot',        emoji: '🪴', label: 'Flower Pot',        category: 'decoration', rarity: 'common',    description: 'A cheerful pot with a happy little plant inside.',              giftable: false },
  { code: 'bunting',           emoji: '🎏', label: 'Bunting',           category: 'decoration', rarity: 'common',    description: 'Colourful triangle flags to string up anywhere.',               giftable: false },
  { code: 'fairy_lights',     emoji: '💡', label: 'Fairy Lights',      category: 'decoration', rarity: 'common',    description: 'Tiny twinkling lights that make everything magical.',            giftable: false },
  { code: 'wind_chime',       emoji: '🎐', label: 'Wind Chime',        category: 'decoration', rarity: 'uncommon',  description: 'Tinkles softly in the breeze. Animals find it calming.',         giftable: false },
  { code: 'garden_gnome',     emoji: '🧑‍🌾', label: 'Garden Gnome',      category: 'decoration', rarity: 'uncommon',  description: 'A jolly gnome to watch over the garden.',                        giftable: false },
  { code: 'mosaic_stepping_stone', emoji: '🪨', label: 'Mosaic Stone',  category: 'decoration', rarity: 'rare',      description: 'A beautiful hand-painted stepping stone for the path.',          giftable: false },
  { code: 'golden_bird_bath', emoji: '🛁', label: 'Golden Bird Bath',  category: 'decoration', rarity: 'very_rare', description: 'A gleaming bird bath fit for the fanciest feathered friends.',    giftable: false },
  { code: 'wishing_fountain', emoji: '⛲', label: 'Wishing Fountain',  category: 'decoration', rarity: 'ultra_rare', description: 'Toss a coin and make a wish! Sometimes wishes come true.',       giftable: false },
];

// Medical rewards
const MEDICAL_REWARDS: RewardItem[] = [
  { code: 'cotton_ball',       emoji: '☁️',  label: 'Cotton Ball',       category: 'medical', rarity: 'common',    description: 'Soft and fluffy. Perfect for cleaning small scrapes.',           giftable: false },
  { code: 'plaster',           emoji: '🩹', label: 'Plaster',           category: 'medical', rarity: 'common',    description: 'A colourful plaster with little paw prints on it.',              giftable: false },
  { code: 'soothing_balm',    emoji: '🧴', label: 'Soothing Balm',     category: 'medical', rarity: 'common',    description: 'A gentle balm that takes the sting away.',                       giftable: false },
  { code: 'mini_stethoscope', emoji: '🩺', label: 'Mini Stethoscope',  category: 'medical', rarity: 'uncommon',  description: 'Listen to tiny heartbeats! Thump-thump, thump-thump.',           giftable: false },
  { code: 'warming_blanket',  emoji: '🧣', label: 'Warming Blanket',   category: 'medical', rarity: 'uncommon',  description: 'Extra warm and extra snuggly for poorly animals.',               giftable: false },
  { code: 'herbal_tonic',     emoji: '🍵', label: 'Herbal Tonic',      category: 'medical', rarity: 'rare',      description: 'A special brew of herbs that helps animals feel better fast.',   giftable: false },
  { code: 'miracle_salve',    emoji: '💎', label: 'Miracle Salve',     category: 'medical', rarity: 'very_rare', description: 'A legendary healing salve passed down through generations.',      giftable: false },
  { code: 'phoenix_feather',  emoji: '🪶', label: 'Phoenix Feather',   category: 'medical', rarity: 'ultra_rare', description: 'A magical feather that can cure even the worst sniffles.',       giftable: false },
];

/** All reward items across all modes, for look-ups. */
export const ALL_REWARDS: RewardItem[] = [
  ...PARTS_REWARDS,
  ...TREATS_REWARDS,
  ...SUPER_TREATS,
  ...DECORATION_REWARDS,
  ...MEDICAL_REWARDS,
];

// ── Mode Unlock Levels ────────────────────────────────────────

const MODE_UNLOCK_LEVELS: Record<DepotMode, number> = {
  parts_and_tools:  1,
  treats_kitchen:   1,
  decorations:      1,
  medical_supplies: 15,
};

// ── Rarity Weights (used for reward selection) ────────────────

const RARITY_WEIGHTS: Record<RewardItem['rarity'], number> = {
  common:    50,
  uncommon:  28,
  rare:      14,
  very_rare: 6,
  ultra_rare: 2,
};

// ── Helper: weighted random pick ──────────────────────────────

function weightedPick<T extends { rarity: RewardItem['rarity'] }>(items: T[]): T {
  const totalWeight = items.reduce((sum, item) => sum + RARITY_WEIGHTS[item.rarity], 0);
  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= RARITY_WEIGHTS[item.rarity];
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

// ── Public Functions ──────────────────────────────────────────

/**
 * Get the tile set for a given depot mode.
 * Decorations mode requires a season; defaults to spring_bloom.
 */
export function getTilesForMode(mode: DepotMode, season?: Season): TileDefinition[] {
  switch (mode) {
    case 'parts_and_tools':  return PARTS_TILES;
    case 'treats_kitchen':   return TREATS_TILES;
    case 'decorations':      return DECORATIONS_TILES[season ?? 'spring_bloom'];
    case 'medical_supplies': return MEDICAL_TILES;
  }
}

/**
 * Get the board dimensions (width x height) for a depot mode.
 */
export function getBoardDimensions(mode: DepotMode): { width: number; height: number } {
  return BOARD_DIMENSIONS[mode];
}

/**
 * Generate reward items after completing a depot session.
 * Higher scores yield more items; goal completion adds bonus rolls.
 */
export function generateRewards(mode: DepotMode, score: number, goals: BoardGoal[]): RewardItem[] {
  const completedGoals = goals.filter((g) => g.currentCount >= g.targetCount).length;

  // Base rewards: 1 per 500 score, plus 1 per completed goal, min 1, max 6
  const rewardCount = Math.max(1, Math.min(6,
    Math.floor(score / 500) + completedGoals
  ));

  const pool = getRewardPoolForMode(mode);
  const rewards: RewardItem[] = [];

  for (let i = 0; i < rewardCount; i++) {
    rewards.push(weightedPick(pool));
  }

  // Bonus: high scores get a chance at a super-treat
  const superTreat = rollForSuperTreat(score);
  if (superTreat) {
    rewards.push(superTreat);
  }

  return rewards;
}

/**
 * Roll for a super-treat drop based on score.
 * Returns null if the roll fails.
 *
 * Probability: score / 50_000, capped at 20%.
 * At 1000 score: 2% chance. At 5000 score: 10% chance.
 */
export function rollForSuperTreat(score: number): RewardItem | null {
  const chance = Math.min(0.2, score / 50_000);
  if (Math.random() >= chance) return null;
  return weightedPick(SUPER_TREATS);
}

/**
 * Check whether a player can access a depot mode at their current level.
 * Medical supplies unlock at level 15; all others available from level 1.
 */
export function canAccessMode(mode: DepotMode, playerLevel: number): boolean {
  return playerLevel >= MODE_UNLOCK_LEVELS[mode];
}

/**
 * Calculate the effective session limit after bonuses.
 * Hard cap at 10 sessions per day.
 */
export function getSessionLimit(baseLimit: number, bonuses: number): number {
  return Math.min(10, baseLimit + bonuses);
}

/**
 * Reset daily depot sessions. Called at the start of each new day.
 * Optionally override the base session limit (default 3).
 */
export function resetDailySessions(state: DepotState, baseLimit = 3): DepotState {
  return {
    ...state,
    sessionsRemainingToday: baseLimit,
    sessionsMaxToday: baseLimit,
  };
}

// ── Internal Helpers ──────────────────────────────────────────

function getRewardPoolForMode(mode: DepotMode): RewardItem[] {
  switch (mode) {
    case 'parts_and_tools':  return PARTS_REWARDS;
    case 'treats_kitchen':   return TREATS_REWARDS;
    case 'decorations':      return DECORATION_REWARDS;
    case 'medical_supplies': return MEDICAL_REWARDS;
  }
}
