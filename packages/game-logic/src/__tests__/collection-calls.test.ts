import { describe, it, expect } from 'vitest';
import type { Animal, Species } from '@arc/shared-types';
import {
  collectionDestinations,
  unlockedCollectionDestinations,
  collectionRoom,
  hasRoomToCollect,
  pendingCall,
  offerableCalls,
  issueCollectionCall,
  dropCall,
  admitCollection,
  callSummary,
  collectionArrivalStory,
  type CollectionCall,
} from '../collection-calls';
import { DESTINATIONS } from '../destinations';
import { spawnAnimal } from '../animals';
import { getMaxShelterAnimals, getMaxArrivals } from '../progression';

/**
 * Collection calls — the inbound half of the care loop.
 *
 * What these pin down, in the order they matter:
 *
 * 1. A collection arrival puts a new animal in the shelter, once.
 * 2. The shelter's cap is respected *before* the child drives, and
 *    deliberately not at the gate — an animal in a crate at the far end
 *    of a finished drive cannot be turned away.
 * 3. A call names a species the place would plausibly have and the
 *    child has actually met.
 *
 * Every one of them fails without the feature: `collection-calls.ts`
 * does not exist, and `DESTINATIONS` had no inbound row in it.
 */

function animalIn(state: Animal['state'], species: Species = 'cat'): Animal {
  return { ...spawnAnimal(species), state };
}

/** A shelter with `n` animals settled in and `q` still in the hallway. */
function shelter(n: number, q = 0): Animal[] {
  return [
    ...Array.from({ length: n }, () => animalIn('sheltered')),
    ...Array.from({ length: q }, () => animalIn('arriving')),
  ];
}

const call = (destinationId: string, species: Species = 'dog'): CollectionCall => ({
  id: `call-${destinationId}-test`,
  destinationId,
  species,
  variant: undefined,
  calledAt: 1_700_000_000_000,
});

describe('the collection destinations', () => {
  it('puts at least one inbound pin on the map', () => {
    // Before this, all eleven destinations were outbound: the PTV could
    // take an animal away and had nowhere to fetch one from.
    expect(collectionDestinations().length).toBeGreaterThan(0);
    for (const d of collectionDestinations()) {
      expect(d.arrival).toBe('collection');
    }
  });

  it('includes Goose End Farm, the onboarding call', () => {
    const farm = collectionDestinations().find((d) => d.id === 'goose-end-farm');
    expect(farm).toBeDefined();
    expect(farm?.suitableSpecies?.length).toBeGreaterThan(0);
  });

  it('names the species each place could plausibly ring about', () => {
    // A call for an animal the place would never have is a vignette
    // that does not land. The farm has no bats in its fields.
    for (const d of collectionDestinations()) {
      expect(d.suitableSpecies).toBeDefined();
      expect(d.suitableSpecies?.length).toBeGreaterThan(0);
    }
  });

  it('gates each one behind a level, and opens with the level', () => {
    for (const d of collectionDestinations()) {
      expect(unlockedCollectionDestinations(d.unlockLevel).map((x) => x.id))
        .toContain(d.id);
      if (d.unlockLevel > 0) {
        expect(unlockedCollectionDestinations(d.unlockLevel - 1).map((x) => x.id))
          .not.toContain(d.id);
      }
    }
  });

  it('is a subset of the one destinations table', () => {
    const ids = new Set(DESTINATIONS.map((d) => d.id));
    for (const d of collectionDestinations()) expect(ids.has(d.id)).toBe(true);
  });
});

describe('collectionRoom', () => {
  it('counts the shelter cap at the player level', () => {
    // L5 holds 10 settled animals.
    expect(getMaxShelterAnimals(5)).toBe(10);
    expect(collectionRoom(5, shelter(7))).toBe(getMaxArrivals(5));  // queue is the tighter one
    expect(collectionRoom(5, shelter(10))).toBe(0);
  });

  it('counts the welcoming hallway as well as the shelter', () => {
    // The hallway is the shorter queue of the two, so a child with
    // three animals waiting to be welcomed has no room for a fourth
    // even in an otherwise empty centre.
    const maxQueue = getMaxArrivals(5);
    expect(collectionRoom(5, shelter(0, maxQueue))).toBe(0);
    expect(collectionRoom(5, shelter(0, maxQueue - 1))).toBe(1);
  });

  it('never goes negative when a centre is over its cap', () => {
    expect(collectionRoom(1, shelter(30, 30))).toBe(0);
  });

  it('counts bonding animals as settled, and pets as neither', () => {
    // L2 holds 4 settled animals. Four bonding animals fill it; four
    // pets do not touch it, because a pet has a family and a bed of
    // her own rather than a place in the shelter.
    const bonding = Array.from({ length: 4 }, () => animalIn('bonding'));
    const pets = Array.from({ length: 4 }, () => animalIn('pet'));
    expect(getMaxShelterAnimals(2)).toBe(4);
    expect(collectionRoom(2, bonding)).toBe(0);
    expect(collectionRoom(2, [...bonding, ...pets])).toBe(0);
    expect(collectionRoom(2, pets)).toBeGreaterThan(0);
  });

  it('asks the cap the way the gate asks it — by level alone', () => {
    // `spawnNewAnimal` calls `getMaxShelterAnimals(level)` with no
    // species and no apprentice bag, and an apprentice's extra slots
    // only apply to a named species. A collection does not know what
    // will turn up, so the two paths agree by asking the same question.
    for (let level = 1; level <= 12; level++) {
      const justFull = shelter(getMaxShelterAnimals(level));
      expect(hasRoomToCollect(level, justFull)).toBe(false);
      expect(hasRoomToCollect(level, shelter(getMaxShelterAnimals(level) - 1))).toBe(true);
    }
  });
});

describe('issueCollectionCall', () => {
  const unlocked: Species[] = ['cat', 'dog', 'fox', 'bunny'];
  const always = () => 0;   // always picks the first candidate

  it('rings about a place the child can reach', () => {
    const issued = issueCollectionCall({
      playerLevel: 5, animals: shelter(0), calls: [],
      unlockedSpecies: unlocked, rng: always,
    });
    expect(issued).not.toBeNull();
    expect(unlockedCollectionDestinations(5).map((d) => d.id))
      .toContain(issued?.destinationId);
  });

  it('stays silent when the centre is full', () => {
    // The cap, enforced at the one moment that cannot strand anybody:
    // before the call exists at all.
    const issued = issueCollectionCall({
      playerLevel: 5, animals: shelter(getMaxShelterAnimals(5)), calls: [],
      unlockedSpecies: unlocked, rng: always,
    });
    expect(issued).toBeNull();
  });

  it('stays silent when the hallway is full', () => {
    const issued = issueCollectionCall({
      playerLevel: 5, animals: shelter(0, getMaxArrivals(5)), calls: [],
      unlockedSpecies: unlocked, rng: always,
    });
    expect(issued).toBeNull();
  });

  it('stays silent before any collection place has opened', () => {
    const earliest = Math.min(...collectionDestinations().map((d) => d.unlockLevel));
    const issued = issueCollectionCall({
      playerLevel: earliest - 1, animals: shelter(0), calls: [],
      unlockedSpecies: unlocked, rng: always,
    });
    expect(issued).toBeNull();
  });

  it('never rings the same place twice over', () => {
    const open = unlockedCollectionDestinations(10);
    const taken = open.map((d) => call(d.id));
    const issued = issueCollectionCall({
      playerLevel: 10, animals: shelter(0), calls: taken,
      unlockedSpecies: unlocked, rng: always,
    });
    expect(issued).toBeNull();
  });

  it('only names species the child has met', () => {
    for (let i = 0; i < 40; i++) {
      const issued = issueCollectionCall({
        playerLevel: 10, animals: shelter(0), calls: [],
        unlockedSpecies: ['cat'],
      });
      if (!issued) continue;
      expect(issued.species).toBe('cat');
    }
  });

  it('only names species the place would have', () => {
    for (let i = 0; i < 60; i++) {
      const issued = issueCollectionCall({
        playerLevel: 10, animals: shelter(0), calls: [],
        unlockedSpecies: ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake', 'hedgehog'],
      });
      if (!issued) continue;
      const dest = collectionDestinations()
        .find((d) => d.id === issued.destinationId);
      expect(dest?.suitableSpecies).toContain(issued.species);
    }
  });

  it('stays silent when no open place has a species she has met', () => {
    // A fox is not a farm stray or a churchyard animal in this game.
    const issued = issueCollectionCall({
      playerLevel: 10, animals: shelter(0), calls: [],
      unlockedSpecies: ['fox'], rng: always,
    });
    expect(issued).toBeNull();
  });

  it('rolls a coat the species actually has', () => {
    const coats = ['ginger', 'black'];
    const issued = issueCollectionCall({
      playerLevel: 10, animals: shelter(0), calls: [],
      unlockedSpecies: ['cat'], variantsFor: () => coats, rng: always,
    });
    expect(coats).toContain(issued?.variant);
  });

  it('carries no coat when the species has none on file', () => {
    const issued = issueCollectionCall({
      playerLevel: 10, animals: shelter(0), calls: [],
      unlockedSpecies: ['cat'], variantsFor: () => [], rng: always,
    });
    expect(issued?.variant).toBeUndefined();
  });
});

describe('offerableCalls', () => {
  it('offers a call for an open place with room at home', () => {
    const open = unlockedCollectionDestinations(10)[0];
    const offered = offerableCalls([call(open.id)], 10, shelter(0));
    expect(offered.map((c) => c.destinationId)).toEqual([open.id]);
  });

  it('holds a call back while the centre is full, without losing it', () => {
    // The call stays on the save — it comes back when a bed does — but
    // the map will not start a journey that ends in no room.
    const open = unlockedCollectionDestinations(10)[0];
    const calls = [call(open.id)];
    expect(offerableCalls(calls, 10, shelter(getMaxShelterAnimals(10)))).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('holds back a call for a place the child cannot reach yet', () => {
    const late = collectionDestinations()
      .slice()
      .sort((a, b) => b.unlockLevel - a.unlockLevel)[0];
    if (late.unlockLevel === 0) return;
    const offered = offerableCalls([call(late.id)], late.unlockLevel - 1, shelter(0));
    expect(offered).toEqual([]);
  });
});

describe('pendingCall and dropCall', () => {
  it('finds the call at a place', () => {
    const calls = [call('goose-end-farm'), call('bay-chapel')];
    expect(pendingCall(calls, 'bay-chapel')?.destinationId).toBe('bay-chapel');
    expect(pendingCall(calls, 'moorland')).toBeUndefined();
  });

  it('forgets one place and keeps the others', () => {
    const calls = [call('goose-end-farm'), call('bay-chapel')];
    const left = dropCall(calls, 'goose-end-farm');
    expect(left.map((c) => c.destinationId)).toEqual(['bay-chapel']);
    expect(calls).toHaveLength(2);  // the input is untouched
  });
});

describe('admitCollection', () => {
  it('puts the collected animal in the shelter', () => {
    const slice = { animals: shelter(2), collectionCalls: [call('goose-end-farm')] };
    const collected = spawnAnimal('dog');
    const after = admitCollection(slice, collected, 'goose-end-farm');

    expect(after.animals).toHaveLength(3);
    expect(after.animals.map((a) => a.id)).toContain(collected.id);
    // She arrives the way a gate arrival does: waiting to be welcomed.
    expect(after.animals.find((a) => a.id === collected.id)?.state).toBe('arriving');
  });

  it('hangs up the call she was collected on', () => {
    const slice = {
      animals: shelter(0),
      collectionCalls: [call('goose-end-farm'), call('bay-chapel')],
    };
    const after = admitCollection(slice, spawnAnimal('dog'), 'goose-end-farm');
    expect(after.collectionCalls.map((c) => c.destinationId)).toEqual(['bay-chapel']);
  });

  it('admits her once, however many times it is asked', () => {
    // `GameScene.create()` re-runs on a resize-driven `scene.restart()`.
    // An arrival admitted twice would stand in the hallway twice.
    const slice = { animals: shelter(1), collectionCalls: [call('goose-end-farm')] };
    const collected = spawnAnimal('dog');
    const once = admitCollection(slice, collected, 'goose-end-farm');
    const twice = admitCollection(once, collected, 'goose-end-farm');
    expect(twice.animals).toHaveLength(2);
  });

  it('does not mutate what it was handed', () => {
    // The `doFeed` bug is a mutation that never reached `saveState`.
    // A function that hands back new arrays cannot be used that way.
    const animals = shelter(1);
    const calls = [call('goose-end-farm')];
    admitCollection({ animals, collectionCalls: calls }, spawnAnimal('dog'), 'goose-end-farm');
    expect(animals).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('admits her even when the centre has filled up behind her', () => {
    // **The cap is never asked at the gate.** She is already in a crate
    // at the far end of a drive the child has just completed; turning
    // her away there is the one outcome the cap must not buy.
    const full = { animals: shelter(getMaxShelterAnimals(1)), collectionCalls: [call('goose-end-farm')] };
    const collected = spawnAnimal('dog');
    const after = admitCollection(full, collected, 'goose-end-farm');
    expect(after.animals.map((a) => a.id)).toContain(collected.id);
  });
});

describe('callSummary', () => {
  it('says what is waiting, species first, as a sentence', () => {
    expect(callSummary(call('goose-end-farm', 'dog'))).toBe('A dog is waiting');
    expect(callSummary(call('bay-chapel', 'cat'))).toBe('A cat is waiting');
  });

  it('opens on the animal rather than on a negation', () => {
    for (const species of ['cat', 'dog', 'bunny', 'hedgehog'] as Species[]) {
      const line = callSummary(call('goose-end-farm', species));
      expect(line.toLowerCase()).not.toMatch(/^(no|not|nobody|don't|cannot)/);
      expect(line).toContain(species);
    }
  });
});

describe('collectionArrivalStory', () => {
  it('says the child fetched her, and from where', () => {
    // `spawnAnimal`'s own stories all say somebody dropped her off at
    // the Centre. Printed under an animal the child drove out to
    // collect, the plaque's first sentence denies the trip.
    const story = collectionArrivalStory('Goose End Farm');
    expect(story).toContain('Goose End Farm');
    expect(story.toLowerCase()).toContain('you drove out');
    expect(story.toLowerCase()).not.toContain('dropped off');
  });

  it('opens on the child rather than on a negation', () => {
    expect(collectionArrivalStory('Bay Chapel')).toMatch(/^You /);
  });
});
