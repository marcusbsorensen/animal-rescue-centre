// ── Collection calls ─────────────────────────────────────────
//
// Somebody rings the centre to say an animal needs fetching, and the
// PTV goes out for her. This is the inbound half of the care loop that
// Marcus asked for — "we also need the PTV to go collect animals later
// on in the game so they don't just appear in the welcoming hallway"
// (docs/ptv-pet-transport-vehicle.md §"Collection drives").
//
// A call is a small, persisted fact: a place, a species, and a coat.
// That is deliberately less than an animal. The `Animal` record is only
// spawned when the child actually sets off, because an id sitting on the
// save for somebody who has not been collected yet is an id that
// `syncNextId` cannot see and could hand out twice. What the call holds
// is exactly what the map needs to say what the trip is *for*, and no
// more.
//
// **The species is known before she drives, the animal is not.** A
// pre-reader choosing between pins can read a hedgehog; she cannot read
// "Goose End Farm". So the pin wears the species, and the name, the
// coat and the face are the surprise on the forecourt. See
// docs/collection-drives-2026-10-09.md for why that split and not the
// other one.

import type { Animal, Species } from '@arc/shared-types';
import { DESTINATIONS, type DestinationDef } from './destinations';
import { getMaxShelterAnimals, getMaxArrivals } from './progression';

/**
 * A call waiting on the map.
 *
 * `id` so the save merge can treat a list of these like every other
 * entity list — a call collected on the iPad must stay collected when
 * the phone's save merges in, which is what `mergeById` gives us and a
 * newest-wins field would not.
 */
export interface CollectionCall {
  id: string;
  /** The place that rang. A `DESTINATIONS` id with `arrival: 'collection'`. */
  destinationId: string;
  /** What is waiting. Known before the drive — it is on the pin. */
  species: Species;
  /** Her coat, rolled now so the pin, the forecourt and the shelter agree. */
  variant?: string;
  /** Epoch-ms, for ordering and for a future "this call is getting old". */
  calledAt: number;
}

/** The shape of the store this module reads. Two fields, both persisted. */
export interface CollectionSlice {
  animals: Animal[];
  collectionCalls: CollectionCall[];
}

/** Every place that can ring, at any level. */
export function collectionDestinations(): DestinationDef[] {
  return DESTINATIONS.filter((d) => d.arrival === 'collection');
}

/** The places that can ring at `playerLevel`. */
export function unlockedCollectionDestinations(playerLevel: number): DestinationDef[] {
  return collectionDestinations().filter((d) => d.unlockLevel <= playerLevel);
}

/**
 * How many more animals the centre can take.
 *
 * Both of `spawnNewAnimal`'s caps, because a collected animal lands in
 * the same welcoming hallway a gate arrival does: the shelter's
 * level-based ceiling, and the shorter queue of animals still waiting
 * to be welcomed. The smaller of the two is the honest answer.
 *
 * **Asked exactly as the gate asks it**, which means the level and
 * nothing else. `getMaxShelterAnimals` will take an apprentice's
 * `extraCatSlots`, but only against a named species — Amara's unlock
 * raises the ceiling for cats, not the centre's — so a collection,
 * which does not know yet whether a cat is what turns up, has no
 * species to name. Passing the bag with no species buys nothing, and a
 * parameter that does nothing reads like a rule that is being applied.
 */
export function collectionRoom(
  playerLevel: number,
  animals: Animal[],
): number {
  const sheltered = animals.filter(
    (a) => a.state === 'sheltered' || a.state === 'bonding',
  ).length;
  const arriving = animals.filter((a) => a.state === 'arriving').length;

  const shelterRoom = getMaxShelterAnimals(playerLevel) - sheltered;
  const queueRoom = getMaxArrivals(playerLevel) - arriving;

  return Math.max(0, Math.min(shelterRoom, queueRoom));
}

/**
 * Is there room for one more?
 *
 * **This is asked twice and never at the gate.** Once when a call would
 * be issued, so a full centre is never rung; once when the map is drawn,
 * so a call that has since stopped fitting is held back rather than
 * offered. It is deliberately *not* asked when the van gets home: an
 * animal already in a crate cannot be turned away without stranding the
 * child at the far end of a drive she has just completed, which is the
 * one outcome the cap must not buy.
 */
export function hasRoomToCollect(playerLevel: number, animals: Animal[]): boolean {
  return collectionRoom(playerLevel, animals) > 0;
}

/** The call pending at a place, if there is one. */
export function pendingCall(
  calls: CollectionCall[],
  destinationId: string,
): CollectionCall | undefined {
  return calls.find((c) => c.destinationId === destinationId);
}

/**
 * The calls the map may offer right now.
 *
 * A call survives on the save until it is collected, so this is where
 * "pending" narrows to "drivable": the place has to be unlocked and the
 * centre has to have somewhere to put her. A call for a place the child
 * cannot reach yet, or for a centre that filled up while the call was
 * waiting, stays on the save and comes back when it fits.
 */
export function offerableCalls(
  calls: CollectionCall[],
  playerLevel: number,
  animals: Animal[],
): CollectionCall[] {
  if (!hasRoomToCollect(playerLevel, animals)) return [];
  const open = new Set(unlockedCollectionDestinations(playerLevel).map((d) => d.id));
  return calls.filter((c) => open.has(c.destinationId));
}

export interface IssueCallOptions {
  playerLevel: number;
  animals: Animal[];
  /** The calls already waiting — one place never rings twice over. */
  calls: CollectionCall[];
  /** The species this child has met. A call never names an unmet one. */
  unlockedSpecies: Species[];
  /** The coats each species has, so the call can roll one. */
  variantsFor?: (species: Species) => string[];
  /** Injectable for tests; defaults to `Math.random`. */
  rng?: () => number;
}

/**
 * Ring the centre about an animal, or decide that nobody rings.
 *
 * Returns `null` rather than throwing or forcing a call, because "no
 * call today" is a perfectly good answer and the caller rings on a
 * timer. The three ways to get `null`: the centre is full, every
 * unlocked place already has somebody waiting, or the places that are
 * open have no species in common with the ones this child has met.
 */
export function issueCollectionCall(
  opts: IssueCallOptions,
): CollectionCall | null {
  const {
    playerLevel, animals, calls, unlockedSpecies,
    variantsFor, rng = Math.random,
  } = opts;

  if (!hasRoomToCollect(playerLevel, animals)) return null;

  const taken = new Set(calls.map((c) => c.destinationId));
  const candidates = unlockedCollectionDestinations(playerLevel)
    .filter((d) => !taken.has(d.id))
    .map((d) => ({
      dest: d,
      species: (d.suitableSpecies ?? []).filter(
        (s): s is Species => (unlockedSpecies as string[]).includes(s),
      ),
    }))
    .filter((c) => c.species.length > 0);

  if (candidates.length === 0) return null;

  const pick = candidates[Math.floor(rng() * candidates.length) % candidates.length];
  const species = pick.species[Math.floor(rng() * pick.species.length) % pick.species.length];
  const coats = variantsFor?.(species) ?? [];
  const variant = coats.length > 0
    ? coats[Math.floor(rng() * coats.length) % coats.length]
    : undefined;

  return {
    id: `call-${pick.dest.id}-${Math.floor(rng() * 1e9).toString(36)}`,
    destinationId: pick.dest.id,
    species,
    variant,
    calledAt: Date.now(),
  };
}

/** Forget a call — it has been collected, or the place has gone quiet. */
export function dropCall(
  calls: CollectionCall[],
  destinationId: string,
): CollectionCall[] {
  return calls.filter((c) => c.destinationId !== destinationId);
}

/**
 * The van is home with somebody in the back: put her in the shelter and
 * hang up the phone.
 *
 * Pure, and returns both lists, so the caller assigns them back and
 * saves in one place — the `doFeed` bug is a mutation that never
 * reached `saveState`, and a function that hands back new arrays cannot
 * be used that way by accident.
 *
 * **Idempotent on the animal.** `create()` re-runs on a resize-driven
 * `scene.restart()`, and an arrival that got admitted twice would put
 * the same animal in the hallway twice.
 */
export function admitCollection(
  slice: CollectionSlice,
  animal: Animal,
  destinationId: string,
): CollectionSlice {
  const already = slice.animals.some((a) => a.id === animal.id);
  return {
    animals: already ? slice.animals : [...slice.animals, animal],
    collectionCalls: dropCall(slice.collectionCalls, destinationId),
  };
}

/** Indefinite article for a species name. Only 'otter' would need 'an'. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/**
 * What the pin says this trip is for, in one line.
 *
 * Positive construction and the species first, because the species is
 * the part a child can read and the part that decides whether she wants
 * to go. The place's own name is already on the pin under it.
 */
export function callSummary(call: CollectionCall): string {
  return `${article(call.species)} ${call.species} is waiting`.replace(
    /^./, (c) => c.toUpperCase(),
  );
}
