import type { Animal } from '@arc/shared-types';

/**
 * Decay rates per tick (called once per game-minute, roughly every 2 real seconds).
 * Higher = decays faster.
 */
const DECAY_RATES = {
  hunger: 0.3,      // gets hungry over time
  tiredness: 0.2,   // gets tired over time
  happiness: -0.1,  // happiness slowly drops when not interacted with
  cleanliness: -0.08, // cleanliness slowly drops (slower than happiness)
};

/**
 * Apply one tick of needs decay to an animal.
 * Returns a new animal object (immutable).
 */
export function tickNeeds(animal: Animal): Animal {
  const currentCleanliness = animal.cleanliness ?? 100;
  return {
    ...animal,
    hunger: clamp(animal.hunger + DECAY_RATES.hunger, 0, 100),
    tiredness: clamp(animal.tiredness + DECAY_RATES.tiredness, 0, 100),
    happiness: clamp(animal.happiness + DECAY_RATES.happiness, 0, 100),
    cleanliness: clamp(currentCleanliness + DECAY_RATES.cleanliness, 0, 100),
  };
}

/**
 * Apply feeding effect — reduces hunger, small happiness boost.
 */
export function applyFeeding(animal: Animal): Animal {
  return {
    ...animal,
    hunger: clamp(animal.hunger - 40, 0, 100),
    happiness: clamp(animal.happiness + 5, 0, 100),
  };
}

/**
 * Apply sleep effect — reduces tiredness significantly.
 */
export function applySleep(animal: Animal): Animal {
  return {
    ...animal,
    tiredness: clamp(animal.tiredness - 50, 0, 100),
    happiness: clamp(animal.happiness + 3, 0, 100),
  };
}

/**
 * Apply play/walk effect — happiness boost, slight tiredness increase.
 */
export function applyPlay(animal: Animal): Animal {
  return {
    ...animal,
    happiness: clamp(animal.happiness + 15, 0, 100),
    tiredness: clamp(animal.tiredness + 10, 0, 100),
    hunger: clamp(animal.hunger + 5, 0, 100),
  };
}

/**
 * Apply grooming effect — fully cleans the animal, small happiness + bond boost.
 */
export function applyGrooming(animal: Animal): Animal {
  return {
    ...animal,
    cleanliness: 100,
    happiness: clamp(animal.happiness + 5, 0, 100),
    bondLevel: clamp(animal.bondLevel + 2, 0, 100),
  };
}

/**
 * Get the most urgent need for an animal.
 */
export function getUrgentNeed(animal: Animal): 'hunger' | 'tiredness' | 'happiness' | 'health' | 'cleanliness' | null {
  if (animal.health < 30) return 'health';
  if (animal.hunger > 80) return 'hunger';
  if (animal.tiredness > 80) return 'tiredness';
  if ((animal.cleanliness ?? 100) < 25) return 'cleanliness';
  if (animal.happiness < 20) return 'happiness';
  return null;
}

/**
 * Get a speech bubble message based on the animal's current needs.
 */
export function getNeedSpeech(animal: Animal): string | null {
  const need = getUrgentNeed(animal);
  switch (need) {
    case 'hunger': return "I'm really hungry...";
    case 'tiredness': return "I'm so sleepy...";
    case 'happiness': return "I'm feeling lonely...";
    case 'health': return "I don't feel well...";
    case 'cleanliness': return "I feel all grubby...";
    default: return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
