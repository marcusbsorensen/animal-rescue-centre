import type { Animal, Species } from '@arc/shared-types';

/**
 * Assign a room based on species. Same species share rooms.
 */
export function assignRoom(species: Species): string {
  return `room-${species}`;
}

/**
 * If the animal has a sibling already placed, assign the same bed.
 * Otherwise return undefined (bed assigned separately).
 */
export function assignSiblingBed(animal: Animal, allAnimals: Animal[]): string | undefined {
  if (!animal.siblingId) return undefined;
  const sibling = allAnimals.find((a) => a.id === animal.siblingId);
  return sibling?.bedId;
}
