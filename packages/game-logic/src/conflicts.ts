import type { Animal, Species } from '@arc/shared-types';

// ── Conflict Detection ─────────────────────────────────────────
// Animals can have minor conflicts (not getting along).
// Player resolves them by moving animals or giving treats.
// This is gentle — no fighting, just mild grumbles.

export type ConflictType = 'space_sharing' | 'food_jealousy' | 'noise_complaint' | 'sibling_squabble';

export interface Conflict {
  id: string;
  animal1Id: string;
  animal2Id: string;
  type: ConflictType;
  emoji: string;
  description: string;
  resolved: boolean;
}

export interface ConflictDef {
  type: ConflictType;
  emoji: string;
  descriptions: string[];
}

export const CONFLICT_TYPES: ConflictDef[] = [
  {
    type: 'space_sharing',
    emoji: '😤',
    descriptions: [
      '{a1} and {a2} both want the same cosy spot!',
      '{a1} is sitting in {a2}\'s favourite bed!',
    ],
  },
  {
    type: 'food_jealousy',
    emoji: '😒',
    descriptions: [
      '{a1} thinks {a2} got a bigger meal!',
      '{a2} keeps eyeing {a1}\'s food bowl!',
    ],
  },
  {
    type: 'noise_complaint',
    emoji: '🙉',
    descriptions: [
      '{a1} is being too noisy for {a2}!',
      '{a2} can\'t sleep because {a1} is playing!',
    ],
  },
  {
    type: 'sibling_squabble',
    emoji: '👯',
    descriptions: [
      '{a1} and {a2} are having a sibling tiff!',
      'Siblings {a1} and {a2} are bickering about toys!',
    ],
  },
];

/**
 * Check if a conflict should spawn between animals in a room.
 * Conflicts are more likely when animals have low happiness or
 * there are many animals in one room.
 *
 * Tuned DOWN from the original values — playtesting showed squabbles
 * interrupted kids too often, making the shelter feel stressful rather
 * than cosy. Roughly ~1/4 of the old frequency, and we only start to
 * factor in low happiness once it actually dips below 60.
 */
export function shouldSpawnConflict(roomAnimals: Animal[]): boolean {
  if (roomAnimals.length < 2) return false;

  const avgHappiness = roomAnimals.reduce((sum, a) => sum + a.happiness, 0) / roomAnimals.length;
  // Only unhappy animals drive extra conflicts — if they're all content,
  // the shelter should feel calm.
  const unhappiness = Math.max(0, 60 - avgHappiness) / 60; // 0..1 below 60
  const crowding = Math.max(0, roomAnimals.length - 3) / 6; // 0..1 beyond 3 animals

  // Base ~0.25% chance, up to ~1% when animals are genuinely unhappy and
  // the room is crowded. That's well below the old 1–4% range so kids
  // aren't interrupted every few ticks.
  const chance = 0.0025 + unhappiness * 0.005 + crowding * 0.003;
  return Math.random() < chance;
}

/**
 * Generate a conflict between two animals.
 */
export function generateConflict(animal1: Animal, animal2: Animal): Conflict {
  // Siblings get sibling squabbles
  const isSiblings = animal1.siblingId === animal2.id;
  const typeDef = isSiblings
    ? CONFLICT_TYPES.find((c) => c.type === 'sibling_squabble')!
    : CONFLICT_TYPES[Math.floor(Math.random() * 3)]; // first 3 types

  const descTemplate = typeDef.descriptions[Math.floor(Math.random() * typeDef.descriptions.length)];
  const description = descTemplate
    .replace('{a1}', animal1.name)
    .replace('{a2}', animal2.name);

  return {
    id: `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    animal1Id: animal1.id,
    animal2Id: animal2.id,
    type: typeDef.type,
    emoji: typeDef.emoji,
    description,
    resolved: false,
  };
}

export type ResolutionAction = 'give_treat' | 'separate' | 'pet_both' | 'play_together';

export interface ResolutionDef {
  action: ResolutionAction;
  emoji: string;
  label: string;
  description: string;
}

export const RESOLUTION_ACTIONS: ResolutionDef[] = [
  { action: 'give_treat',    emoji: '🍬', label: 'Give Treats',    description: 'Distract them both with yummy treats' },
  { action: 'separate',      emoji: '↔️', label: 'Separate',       description: 'Give them some space apart' },
  { action: 'pet_both',      emoji: '🤗', label: 'Comfort Both',   description: 'Pet and comfort them both' },
  { action: 'play_together', emoji: '🎾', label: 'Play Together',  description: 'Start a game they can share' },
];

/** Effective resolutions per conflict type */
const EFFECTIVE_RESOLUTIONS: Record<ConflictType, ResolutionAction[]> = {
  space_sharing:    ['separate', 'play_together'],
  food_jealousy:    ['give_treat', 'pet_both'],
  noise_complaint:  ['separate', 'pet_both'],
  sibling_squabble: ['play_together', 'give_treat'],
};

/**
 * Check if a resolution action works for a conflict type.
 */
export function isResolutionEffective(conflictType: ConflictType, action: ResolutionAction): boolean {
  return EFFECTIVE_RESOLUTIONS[conflictType]?.includes(action) ?? false;
}

/**
 * Apply a conflict resolution. Returns happiness changes.
 */
export function resolveConflict(
  conflictType: ConflictType,
  action: ResolutionAction
): { effective: boolean; happinessBoost: number } {
  const effective = isResolutionEffective(conflictType, action);
  return {
    effective,
    happinessBoost: effective ? 10 : 3,
  };
}
