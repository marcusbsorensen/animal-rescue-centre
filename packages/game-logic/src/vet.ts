import type { Animal, Species } from '@arc/shared-types';

// ── Vet System ─────────────────────────────────────────────────
// Animals can get sick. Players can self-heal minor illnesses or
// transport to the vet for serious ones. House upgrades unlock
// at milestones (every 50 pets).

export type Illness = 'cold' | 'tummy_ache' | 'sore_paw' | 'sniffles' | 'tired_wings' | 'scale_itch' | 'tick_trouble';
export type Severity = 'minor' | 'moderate' | 'serious';

export interface IllnessDef {
  illness: Illness;
  emoji: string;
  label: string;
  severity: Severity;
  species: Species[] | 'all';
  healSteps: number;       // how many care actions to heal (self-heal)
  description: string;
}

export const ILLNESSES: IllnessDef[] = [
  {
    illness: 'cold',
    emoji: '🤧',
    label: 'Cold',
    severity: 'minor',
    species: 'all',
    healSteps: 2,
    description: 'A bit sneezy and shivery. Needs warmth and rest.',
  },
  {
    illness: 'tummy_ache',
    emoji: '🤢',
    label: 'Tummy Ache',
    severity: 'minor',
    species: 'all',
    healSteps: 2,
    description: 'Ate something funny. Needs gentle food and water.',
  },
  {
    illness: 'sore_paw',
    emoji: '🩹',
    label: 'Sore Paw',
    severity: 'moderate',
    species: ['cat', 'dog', 'fox', 'bunny'],
    healSteps: 3,
    description: 'Stepped on something sharp. Needs a bandage and rest.',
  },
  {
    illness: 'sniffles',
    emoji: '😤',
    label: 'Sniffles',
    severity: 'minor',
    species: 'all',
    healSteps: 2,
    description: 'Runny nose and watery eyes. A blanket will help!',
  },
  {
    illness: 'tired_wings',
    emoji: '🪶',
    label: 'Tired Wings',
    severity: 'moderate',
    species: ['bat', 'parrot'],
    healSteps: 3,
    description: 'Wings are sore from too much flying. Needs perch rest.',
  },
  {
    illness: 'scale_itch',
    emoji: '✨',
    label: 'Scale Itch',
    severity: 'moderate',
    species: ['snake'],
    healSteps: 3,
    description: 'Scales are itchy from shedding. Needs a warm bath.',
  },
  {
    illness: 'tick_trouble',
    emoji: '🐛',
    label: 'Tick Trouble',
    severity: 'moderate',
    species: ['hedgehog'],
    healSteps: 3,
    description: 'Picked up ticks out foraging. Needs a warm bath and rest.',
  },
];

export type HealAction = 'blanket' | 'water' | 'bandage' | 'rest' | 'warm_bath';

export interface HealActionDef {
  action: HealAction;
  emoji: string;
  label: string;
  description: string;
}

export const HEAL_ACTIONS: HealActionDef[] = [
  { action: 'blanket',   emoji: '🧣', label: 'Warm Blanket', description: 'Wrap them up warm and cosy' },
  { action: 'water',     emoji: '💧', label: 'Fresh Water',  description: 'Give them cool fresh water' },
  { action: 'bandage',   emoji: '🩹', label: 'Bandage',      description: 'Carefully bandage the sore spot' },
  { action: 'rest',      emoji: '😴', label: 'Rest Time',    description: 'Let them sleep it off' },
  { action: 'warm_bath', emoji: '🛁', label: 'Warm Bath',    description: 'A gentle warm bath' },
];

/** Which heal actions work for which illnesses */
const EFFECTIVE_ACTIONS: Record<Illness, HealAction[]> = {
  cold:        ['blanket', 'rest', 'water'],
  tummy_ache:  ['water', 'rest'],
  sore_paw:    ['bandage', 'rest'],
  sniffles:    ['blanket', 'water'],
  tired_wings: ['rest', 'blanket'],
  scale_itch:  ['warm_bath', 'rest'],
  tick_trouble: ['warm_bath', 'rest'],
};

/**
 * Check if an animal might get sick this tick.
 * Sickness chance increases with low happiness and high hunger/tiredness.
 */
export function shouldGetSick(animal: Animal): boolean {
  if (animal.state === 'arriving') return false;
  if (animal.health < 50) return false; // already sick-ish

  const stressLevel =
    (animal.hunger / 100) * 0.3 +
    (animal.tiredness / 100) * 0.3 +
    ((100 - animal.happiness) / 100) * 0.4;

  // ~0.5% chance per tick when stressed, scaling up to ~2% at max stress
  return Math.random() < stressLevel * 0.02;
}

/**
 * Pick a random illness appropriate for the species.
 */
export function pickIllness(species: Species): IllnessDef {
  const valid = ILLNESSES.filter(
    (i) => i.species === 'all' || i.species.includes(species)
  );
  return valid[Math.floor(Math.random() * valid.length)];
}

/**
 * Make an animal sick — reduces health.
 */
export function applySickness(animal: Animal, illness: IllnessDef): Animal {
  const healthDrop = illness.severity === 'minor' ? 20
    : illness.severity === 'moderate' ? 35
    : 50;

  return {
    ...animal,
    health: Math.max(0, animal.health - healthDrop),
  };
}

/**
 * Check if a heal action is effective for an illness.
 */
export function isHealActionEffective(illness: Illness, action: HealAction): boolean {
  return EFFECTIVE_ACTIONS[illness]?.includes(action) ?? false;
}

/**
 * Apply a healing step. Returns health increase.
 */
export function applyHealStep(
  animal: Animal,
  illness: IllnessDef,
  action: HealAction,
  currentStep: number
): { animal: Animal; effective: boolean; healed: boolean } {
  const effective = isHealActionEffective(illness.illness, action);
  const healthGain = effective ? Math.ceil(30 / illness.healSteps) : 5;
  const newHealth = Math.min(100, animal.health + healthGain);
  const step = effective ? currentStep + 1 : currentStep;
  const healed = step >= illness.healSteps;

  return {
    animal: {
      ...animal,
      health: healed ? 100 : newHealth,
      happiness: Math.min(100, animal.happiness + (effective ? 5 : 0)),
    },
    effective,
    healed,
  };
}

// ── House Upgrades ───────────────────────────────────────────

export interface HouseUpgrade {
  code: string;
  name: string;
  emoji: string;
  description: string;
  petThreshold: number;  // total pets needed to unlock
}

export const HOUSE_UPGRADES: HouseUpgrade[] = [
  {
    code: 'garden_pond',
    name: 'Garden Pond',
    emoji: '🏊',
    description: 'A lovely pond for your garden! Animals love to watch the fish.',
    petThreshold: 5,
  },
  {
    code: 'play_area',
    name: 'Play Area',
    emoji: '🎪',
    description: 'A fun outdoor play area with toys and tunnels!',
    petThreshold: 10,
  },
  {
    code: 'cosy_nook',
    name: 'Cosy Nook',
    emoji: '🛋️',
    description: 'A warm reading nook where pets come to snuggle.',
    petThreshold: 20,
  },
  {
    code: 'treehouse',
    name: 'Treehouse',
    emoji: '🌳',
    description: 'A wooden treehouse! Parrots and bats love it up there.',
    petThreshold: 30,
  },
  {
    code: 'rainbow_bridge',
    name: 'Rainbow Bridge',
    emoji: '🌈',
    description: 'A beautiful rainbow bridge connecting your garden paths.',
    petThreshold: 40,
  },
  {
    code: 'grand_hall',
    name: 'Grand Hall',
    emoji: '🏰',
    description: 'A grand entrance hall with portraits of all your pets!',
    petThreshold: 50,
  },
];

/**
 * Get upgrades available at a given pet count.
 */
export function getAvailableUpgrades(
  totalPets: number,
  unlockedCodes: string[]
): HouseUpgrade[] {
  return HOUSE_UPGRADES.filter(
    (u) => totalPets >= u.petThreshold && !unlockedCodes.includes(u.code)
  );
}

/**
 * Get all unlocked upgrades.
 */
export function getUnlockedUpgrades(unlockedCodes: string[]): HouseUpgrade[] {
  return HOUSE_UPGRADES.filter((u) => unlockedCodes.includes(u.code));
}
