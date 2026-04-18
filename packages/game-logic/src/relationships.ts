/**
 * Player-defined relationships between animals — pure helpers.
 *
 * The player (typically the adult running the admin panel, but also
 * the child via an in-game editor) can link any two animals as:
 *   - sibling  — bond bonus + sibling_squabble style conflicts
 *   - friend   — bond bonus + no conflict risk between this pair
 *   - enemy    — elevated conflict risk between this pair
 *
 * All three types are bidirectional by convention. setRelationship
 * writes both directions; queries consult both.
 *
 * Storage shape: GameState.relationships (shared-types), a flat list
 * of directed edges. Keeping it flat rather than nested on each Animal
 * makes merging/editing straightforward and avoids mutation of
 * Animal records when a relationship changes.
 */

import type { AnimalRelationship, RelationshipType, Animal } from '@arc/shared-types';

/**
 * Set a relationship between two animals. If a relationship of any
 * type already exists between this pair, it's replaced.
 *
 * Returns a new list — does not mutate inputs.
 */
export function setRelationship(
  relationships: AnimalRelationship[],
  a: string,
  b: string,
  type: RelationshipType,
): AnimalRelationship[] {
  if (a === b) return relationships;  // can't relate to self
  // Remove any existing edges in either direction between this pair
  const cleaned = relationships.filter(
    (r) => !((r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a)),
  );
  return [
    ...cleaned,
    { fromId: a, toId: b, type },
    { fromId: b, toId: a, type },
  ];
}

/**
 * Clear any relationship between two animals. Returns a new list.
 */
export function clearRelationship(
  relationships: AnimalRelationship[],
  a: string,
  b: string,
): AnimalRelationship[] {
  return relationships.filter(
    (r) => !((r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a)),
  );
}

/**
 * Look up the relationship type between two animals, or undefined if
 * none is set. Checks both directions.
 */
export function getRelationship(
  relationships: AnimalRelationship[],
  a: string,
  b: string,
): RelationshipType | undefined {
  const hit = relationships.find(
    (r) => (r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a),
  );
  return hit?.type;
}

/**
 * Find all relationships involving this animal. Returns directed
 * edges where fromId === animalId — i.e. "from this animal's point of
 * view", useful for rendering a per-animal relationship list.
 */
export function getRelationshipsFor(
  relationships: AnimalRelationship[],
  animalId: string,
): AnimalRelationship[] {
  return relationships.filter((r) => r.fromId === animalId);
}

/**
 * True if the animal has any sibling, friend, or enemy link to another
 * animal that is currently in the shelter (not still arriving).
 */
export function hasAllyPresent(
  relationships: AnimalRelationship[],
  animal: Animal,
  allAnimals: Animal[],
  type: RelationshipType,
): boolean {
  const mine = getRelationshipsFor(relationships, animal.id).filter((r) => r.type === type);
  if (mine.length === 0) return false;
  for (const r of mine) {
    const other = allAnimals.find((a) => a.id === r.toId);
    if (other && other.state !== 'arriving') return true;
  }
  return false;
}

/**
 * Synchronise the legacy `Animal.siblingId` field with the
 * relationships list. Returns a new animals array where each animal's
 * siblingId matches its first 'sibling' relationship (if any), and is
 * cleared if that relationship has been removed.
 *
 * Used when the relationships list is edited — keeps the older
 * conflict system (which reads siblingId directly) in sync without
 * having to migrate it all at once.
 */
export function syncSiblingIds(
  animals: Animal[],
  relationships: AnimalRelationship[],
): Animal[] {
  return animals.map((a) => {
    const mySibling = relationships.find(
      (r) => r.fromId === a.id && r.type === 'sibling',
    );
    const nextSiblingId = mySibling?.toId;
    if (nextSiblingId === a.siblingId) return a;
    const next = { ...a };
    if (nextSiblingId) next.siblingId = nextSiblingId;
    else delete next.siblingId;
    return next;
  });
}

/**
 * Build a relationships list from the legacy `siblingId` fields on a
 * set of animals. Used for migration — a save that pre-dates the
 * relationships feature will have siblingId set but no relationships
 * array. Each sibling pair becomes two directed edges.
 */
export function relationshipsFromSiblingIds(animals: Animal[]): AnimalRelationship[] {
  const result: AnimalRelationship[] = [];
  const seen = new Set<string>();
  for (const a of animals) {
    if (!a.siblingId) continue;
    const key = [a.id, a.siblingId].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    // Only link if the partner actually exists in the animals list
    if (!animals.find((x) => x.id === a.siblingId)) continue;
    result.push({ fromId: a.id, toId: a.siblingId, type: 'sibling' });
    result.push({ fromId: a.siblingId, toId: a.id, type: 'sibling' });
  }
  return result;
}
