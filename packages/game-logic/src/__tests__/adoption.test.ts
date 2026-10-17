import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Animal, Species } from '@arc/shared-types';
import { ADOPTER_HOUSEHOLD_DEFS, NON_ADOPTING_HOUSEHOLDS } from '../adopter-roster';
import {
  ADOPTION_COOLDOWN_DAYS,
  OFFERED_APPLICANTS,
  LEGACY_HOUSEHOLD_IDS,
  canonicalHouseholdId,
  householdUseCount,
  householdActiveUseCount,
  householdsForSpecies,
  isAdoptableSpecies,
  getEligibleApplicants,
  pickApplicants,
  commitAdoption,
  type AdoptionStoreLike,
} from '../adoption';
import { inGameDaysBetween } from '../calendar';

function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'a1',
    name: 'Whiskers',
    species: 'cat',
    state: 'pet',
    arrivalStory: 'found at the gate',
    hunger: 0,
    tiredness: 0,
    happiness: 100,
    health: 100,
    bondLevel: 100,
    roomId: 'room-cat',
    ...overrides,
  };
}

function makeStore(animals: Animal[] = []): AdoptionStoreLike {
  return {
    animals: [...animals],
    rehomed: [],
  };
}

/** A fixed "now" so no test depends on the day it runs. */
const NOW = 1_800_000_000_000;

/**
 * Milliseconds in N in-game days: a real week is a 30-day in-game month, so
 * a game day is 7/30 of a real one. 20_160_000 ms exactly.
 */
const GAME_DAY_MS = (7 * 86_400_000) / 30;
const daysAgo = (n: number) => NOW - n * GAME_DAY_MS;

function adopted(householdId: string, date: number, animalId = `old-${householdId}-${date}`) {
  return {
    animalId,
    animalName: 'Mittens',
    species: 'cat' as Species,
    householdId,
    date,
  };
}

const PUBLIC_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../apps/game/public',
);

interface CastEntry {
  id: string;
  name: string;
  category: string;
  species: Species[];
  return_rhythm?: string;
}

const CAST: CastEntry[] = (
  JSON.parse(readFileSync(resolve(PUBLIC_ROOT, 'data/cast.json'), 'utf8')) as {
    cast: CastEntry[];
  }
).cast;

/** The ids cast.json carries — the only ones `findCast` can find. */
const CAST_IDS: string[] = CAST.map((c) => c.id);

const ADOPTING_CATEGORIES = [
  'solo', 'couple', 'family', 'housemates', 'institutional', 'two-houses',
];

const roster = (id: string) => ADOPTER_HOUSEHOLD_DEFS.find((h) => h.householdId === id);
const ids = (list: Array<{ householdId: string }>) => list.map((h) => h.householdId);

describe('the adopter roster', () => {
  it('uses ids that cast.json knows', () => {
    // The bug this guards: the roster once said '01-pri-kaur' where cast.json
    // says '01-priya', so GameScene.findCast missed for every household —
    // no +15 species bonus, "The family" in every toast, and a returning
    // visitor degraded to a toast.
    for (const h of ADOPTER_HOUSEHOLD_DEFS) {
      expect(CAST_IDS, `${h.householdId} is not in cast.json`).toContain(h.householdId);
    }
  });

  it('has no household twice', () => {
    const all = ids(ADOPTER_HOUSEHOLD_DEFS);
    expect(new Set(all).size).toBe(all.length);
  });

  it('points each avatar at a portrait that exists on disk', () => {
    // Regression guard: asserts the path resolves to a real asset under
    // apps/game/public rather than a guessed convention, so a bad path
    // fails here instead of silently dropping to the painted-initials
    // fallback in-game.
    for (const h of ADOPTER_HOUSEHOLD_DEFS) {
      expect(h.avatarSrc, h.householdId).toBe(`/admin/scene-assets/cast/${h.householdId}.png`);
      const onDisk = resolve(PUBLIC_ROOT, `.${h.avatarSrc}`);
      expect(existsSync(onDisk), `${h.householdId}: missing ${h.avatarSrc}`).toBe(true);
    }
  });

  it('takes the species each household lists in cast.json, no more and no fewer', () => {
    for (const h of ADOPTER_HOUSEHOLD_DEFS) {
      const c = CAST.find((x) => x.id === h.householdId);
      expect([...h.speciesPreferences].sort(), h.householdId).toEqual([...(c?.species ?? [])].sort());
    }
  });

  it('gives every household a name, a blurb and room for at least one animal', () => {
    for (const h of ADOPTER_HOUSEHOLD_DEFS) {
      expect(h.name.trim().length, h.householdId).toBeGreaterThan(0);
      expect(h.blurb.trim().length, h.householdId).toBeGreaterThan(0);
      expect(h.capacity, h.householdId).toBeGreaterThanOrEqual(1);
    }
  });

  describe('follows cast.json categories instead of treating the 32 as one pool', () => {
    it('includes every household that is an adopter by category', () => {
      for (const c of CAST.filter((x) => ADOPTING_CATEGORIES.includes(x.category))) {
        expect(roster(c.id), `${c.id} (${c.category}) should adopt`).toBeDefined();
      }
    });

    it('includes a return visitor only when their rhythm is repeat-adopter', () => {
      for (const c of CAST.filter((x) => x.category === 'return-visitor')) {
        const adopts = c.return_rhythm === 'repeat-adopter';
        expect(roster(c.id) !== undefined, `${c.id} (${c.return_rhythm})`).toBe(adopts);
      }
    });

    it('lists every other household as non-adopting, with a reason', () => {
      const adopters = new Set(ids(ADOPTER_HOUSEHOLD_DEFS));
      const rest = CAST_IDS.filter((id) => !adopters.has(id)).sort();
      expect(Object.keys(NON_ADOPTING_HOUSEHOLDS).sort()).toEqual(rest);
      for (const reason of Object.values(NON_ADOPTING_HOUSEHOLDS)) {
        expect(reason.length).toBeGreaterThan(0);
      }
    });

    it('does not make adopters of the Khans, Benji, or Simeon & Karo', () => {
      for (const id of ['15-khans', '17-benji', '32-simeon-karo']) {
        expect(roster(id), id).toBeUndefined();
        expect(id in NON_ADOPTING_HOUSEHOLDS, id).toBe(true);
      }
    });

    it('keeps Tata, the repeat adopter, as a dog household', () => {
      expect(roster('16-tata')?.speciesPreferences).toEqual(['dog']);
    });

    it('holds the Two-Houses family to one animal at a time', () => {
      expect(roster('30-two-houses')?.capacity).toBe(1);
    });
  });

  describe('Nova and Hiro take cats', () => {
    // docs/rehoming-cast.md rows 3 and 6, and Marcus on 2026-10-11. The
    // "Decisions LOCKED" table in animal-flow-implementation-plan-2026-05-03.md
    // says dogs and is older and wrong. If this fails, do not fix the test.
    it.each(['03-nova', '06-hiro'])('%s adopts a cat and not a dog', (id) => {
      expect(roster(id)?.speciesPreferences).toEqual(['cat']);
      expect(ids(householdsForSpecies('dog'))).not.toContain(id);
    });
  });
});

describe('which species the adoption office can serve', () => {
  it('has households for cat, dog, bunny, parrot and snake', () => {
    for (const s of ['cat', 'dog', 'bunny', 'parrot', 'snake'] as Species[]) {
      expect(isAdoptableSpecies(s), s).toBe(true);
    }
  });

  it('has none for fox, bat or hedgehog, which are rewilded', () => {
    for (const s of ['fox', 'bat', 'hedgehog'] as Species[]) {
      expect(isAdoptableSpecies(s), s).toBe(false);
    }
  });

  it('has two bunny households, so the first-bunny-adoption charm can be earned', () => {
    // GameScene.commitAdoption fires 'first-bunny-adoption' for a bunny. With
    // the five-household roster nobody took bunnies and it could never fire.
    expect(ids(householdsForSpecies('bunny')).sort()).toEqual(['02-jan', '30-two-houses']);
  });
});

describe('getEligibleApplicants on a fresh save', () => {
  it('returns every dog household for a dog', () => {
    const animal = makeAnimal({ species: 'dog' });
    const eligible = getEligibleApplicants(animal, makeStore([animal]), NOW);
    expect(ids(eligible)).toEqual(ids(householdsForSpecies('dog')));
    expect(ids(eligible)).toContain('01-priya');
    expect(ids(eligible)).toContain('04-babcia');
    expect(ids(eligible)).toContain('16-tata');
  });

  it('returns a household for a parrot, a snake and a bunny', () => {
    for (const species of ['parrot', 'snake', 'bunny'] as Species[]) {
      const animal = makeAnimal({ species });
      expect(getEligibleApplicants(animal, makeStore([animal]), NOW).length, species).toBeGreaterThan(0);
    }
  });

  it('returns the snake households and only them for a snake', () => {
    const animal = makeAnimal({ species: 'snake' });
    expect(ids(getEligibleApplicants(animal, makeStore([animal]), NOW)).sort()).toEqual([
      '02-jan', '12-odenkirks', '28-iris-teacher', '31-estrada-train',
    ]);
  });

  it('returns [] for a fox, a bat and a hedgehog', () => {
    for (const species of ['fox', 'bat', 'hedgehog'] as Species[]) {
      const animal = makeAnimal({ species });
      expect(getEligibleApplicants(animal, makeStore([animal]), NOW), species).toEqual([]);
    }
  });
});

describe('the 21-day cooldown', () => {
  it('is 21 in-game days, which is about five real days', () => {
    expect(ADOPTION_COOLDOWN_DAYS).toBe(21);
    expect(inGameDaysBetween(0, 21 * GAME_DAY_MS)).toBe(21);
    expect(21 * GAME_DAY_MS / 86_400_000).toBeCloseTo(4.9, 5);
  });

  it('counts a day only once it is whole', () => {
    expect(inGameDaysBetween(0, 21 * GAME_DAY_MS - 1)).toBe(20);
    expect(inGameDaysBetween(0, 21 * GAME_DAY_MS)).toBe(21);
  });

  it('counts a span that runs backwards as no days', () => {
    // An entry stamped by a device whose clock ran ahead.
    expect(inGameDaysBetween(NOW + 5 * GAME_DAY_MS, NOW)).toBe(0);
    expect(inGameDaysBetween(Number.NaN, NOW)).toBe(0);
  });

  it('takes a household out of the offer as soon as it adopts', () => {
    const animal = makeAnimal({ species: 'cat' });
    const store = makeStore([animal]);
    store.rehomed.push(adopted('03-nova', NOW));
    expect(ids(getEligibleApplicants(animal, store, NOW))).not.toContain('03-nova');
  });

  it('keeps it out until the 21st day, and frees it on that day', () => {
    const animal = makeAnimal({ species: 'cat' });
    const store = makeStore([animal]);
    store.rehomed.push(adopted('03-nova', NOW - 20 * GAME_DAY_MS));
    expect(ids(getEligibleApplicants(animal, store, NOW))).not.toContain('03-nova');

    store.rehomed[0] = adopted('03-nova', NOW - 21 * GAME_DAY_MS);
    expect(ids(getEligibleApplicants(animal, store, NOW))).toContain('03-nova');
  });

  it('lets the same household adopt again after the cooldown', () => {
    const first = makeAnimal({ id: 'c1' });
    const store = makeStore([first]);
    commitAdoption(first, '03-nova', store, NOW);

    const second = makeAnimal({ id: 'c2', name: 'Tabby' });
    store.animals.push(second);
    expect(() => commitAdoption(second, '03-nova', store, NOW + 5 * GAME_DAY_MS)).toThrow();

    const entry = commitAdoption(second, '03-nova', store, NOW + 21 * GAME_DAY_MS);
    expect(entry.householdId).toBe('03-nova');
    expect(store.rehomed).toHaveLength(2);
  });

  it('keeps the whole history — the cooldown frees a household without erasing what it adopted', () => {
    const rehomed = [adopted('03-nova', daysAgo(100)), adopted('03-nova', daysAgo(3))];
    expect(householdUseCount(rehomed, '03-nova')).toBe(2);
    expect(householdActiveUseCount(rehomed, '03-nova', NOW)).toBe(1);
  });

  it('measures capacity per window: a two-animal household needs two fresh adoptions to be busy', () => {
    const lodge = roster('27-tomas-care-home');
    expect(lodge?.capacity).toBe(2);
    const animal = makeAnimal({ species: 'cat' });
    const store = makeStore([animal]);

    store.rehomed.push(adopted('27-tomas-care-home', daysAgo(2)));
    expect(ids(getEligibleApplicants(animal, store, NOW))).toContain('27-tomas-care-home');

    store.rehomed.push(adopted('27-tomas-care-home', daysAgo(1)));
    expect(ids(getEligibleApplicants(animal, store, NOW))).not.toContain('27-tomas-care-home');

    // The older of the two ages out first, which opens one place.
    expect(ids(getEligibleApplicants(animal, store, NOW + 20 * GAME_DAY_MS))).toContain('27-tomas-care-home');
  });

  it('is what turns "try again in a few days" from a lie into the truth', () => {
    // The bunny has two households. Fill both, and a third bunny has nobody;
    // wait out the cooldown and she has somebody again. Before the cooldown
    // no number of days ever helped.
    const store = makeStore();
    const bunnies = ['b1', 'b2', 'b3'].map((id) => makeAnimal({ id, species: 'bunny', name: id }));
    store.animals.push(...bunnies);

    commitAdoption(bunnies[0], '02-jan', store, NOW);
    commitAdoption(bunnies[1], '30-two-houses', store, NOW);
    expect(getEligibleApplicants(bunnies[2], store, NOW + 10 * GAME_DAY_MS)).toEqual([]);

    const later = getEligibleApplicants(bunnies[2], store, NOW + 21 * GAME_DAY_MS);
    expect(ids(later).sort()).toEqual(['02-jan', '30-two-houses']);
  });
});

describe('getEligibleApplicants with a busy household', () => {
  it('excludes a household whose capacity is already met', () => {
    const animal = makeAnimal({ species: 'cat' });
    const store = makeStore([animal]);
    const before = getEligibleApplicants(animal, store, NOW).length;
    store.rehomed.push(adopted('03-nova', daysAgo(1)));
    const eligible = getEligibleApplicants(animal, store, NOW);
    expect(ids(eligible)).not.toContain('03-nova');
    expect(eligible).toHaveLength(before - 1);
  });

  it('includes a household with capacity 1 and zero prior rehomings', () => {
    const animal = makeAnimal({ species: 'cat' });
    expect(ids(getEligibleApplicants(animal, makeStore([animal]), NOW))).toContain('06-hiro');
  });
});

describe('pickApplicants', () => {
  it('offers three households for a cat on a fresh save, all of them eligible', () => {
    const animal = makeAnimal({ species: 'cat' });
    const store = makeStore([animal]);
    const picked = pickApplicants(animal, store, NOW);
    expect(picked).toHaveLength(OFFERED_APPLICANTS);
    const eligible = ids(getEligibleApplicants(animal, store, NOW));
    for (const h of picked) expect(eligible).toContain(h.householdId);
    expect(new Set(ids(picked)).size).toBe(picked.length);
  });

  it('offers fewer when fewer are free, and none when none are', () => {
    const bunny = makeAnimal({ species: 'bunny' });
    const store = makeStore([bunny]);
    expect(pickApplicants(bunny, store, NOW)).toHaveLength(2);
    store.rehomed.push(adopted('02-jan', daysAgo(1)), adopted('30-two-houses', daysAgo(1)));
    expect(pickApplicants(bunny, store, NOW)).toEqual([]);
  });

  it('shows the same three every time it is asked, because the screen redraws', () => {
    const animal = makeAnimal({ species: 'dog' });
    const store = makeStore([animal]);
    expect(ids(pickApplicants(animal, store, NOW))).toEqual(ids(pickApplicants(animal, store, NOW + 1000)));
  });

  it('does not show the same three to every animal', () => {
    const store = makeStore();
    const seen = new Set<string>();
    for (const id of ['x1', 'x2', 'x3', 'x4', 'x5', 'x6']) {
      const dog = makeAnimal({ id, species: 'dog' });
      seen.add(ids(pickApplicants(dog, store, NOW)).join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('puts a household that has waited behind none that has just freed up', () => {
    // Every other cat household is fresh; Nova has just come out of her
    // cooldown. She comes last, so the faces rotate.
    const animal = makeAnimal({ species: 'cat' });
    const store = makeStore([animal]);
    store.rehomed.push(adopted('03-nova', daysAgo(25)));
    const all = pickApplicants(animal, store, NOW, 100);
    expect(ids(all)[all.length - 1]).toBe('03-nova');
    expect(ids(pickApplicants(animal, store, NOW))).not.toContain('03-nova');
  });
});

describe('commitAdoption', () => {
  let animal: Animal;
  let store: AdoptionStoreLike;

  beforeEach(() => {
    animal = makeAnimal();
    store = makeStore([animal]);
  });

  it('removes the animal from store.animals', () => {
    commitAdoption(animal, '03-nova', store, 1000);
    expect(store.animals).toHaveLength(0);
  });

  it('appends a RehomedEntry with correct fields', () => {
    const entry = commitAdoption(animal, '03-nova', store, 1234);
    expect(store.rehomed).toHaveLength(1);
    expect(entry).toEqual({
      animalId: 'a1',
      animalName: 'Whiskers',
      species: 'cat',
      householdId: '03-nova',
      date: 1234,
    });
    expect(store.rehomed[0]).toEqual(entry);
  });

  it('preserves variant from the animal if set', () => {
    animal.variant = 'ginger';
    const entry = commitAdoption(animal, '03-nova', store, 1000);
    expect(entry.variant).toBe('ginger');
    expect(store.rehomed[0].variant).toBe('ginger');
  });

  it('uses the now argument for the date field', () => {
    const entry = commitAdoption(animal, '03-nova', store, 99999);
    expect(entry.date).toBe(99999);
  });

  it('throws if the animal is not in store.animals', () => {
    const orphan = makeAnimal({ id: 'ghost' });
    expect(() => commitAdoption(orphan, '03-nova', store, 1000)).toThrow();
  });

  it('throws if the household is not eligible (wrong species)', () => {
    const dogAnimal = makeAnimal({ species: 'dog' });
    const dogStore = makeStore([dogAnimal]);
    // Nova takes cats, not dogs
    expect(() => commitAdoption(dogAnimal, '03-nova', dogStore, 1000)).toThrow();
  });

  it('throws for a hedgehog, which no household takes', () => {
    const hog = makeAnimal({ species: 'hedgehog' });
    const hogStore = makeStore([hog]);
    for (const h of ADOPTER_HOUSEHOLD_DEFS) {
      expect(() => commitAdoption(hog, h.householdId, hogStore, NOW)).toThrow();
    }
    expect(hogStore.animals).toHaveLength(1);
    expect(hogStore.rehomed).toHaveLength(0);
  });

  it('after a commit, eligible applicants for a 2nd same-species animal exclude that household', () => {
    commitAdoption(animal, '03-nova', store, NOW);
    const second = makeAnimal({ id: 'a2', name: 'Tabby' });
    store.animals.push(second);
    expect(ids(getEligibleApplicants(second, store, NOW))).not.toContain('03-nova');
  });

  it('mutates the rehomed array reference (does not replace it)', () => {
    const ref = store.rehomed;
    commitAdoption(animal, '03-nova', store, 1000);
    expect(store.rehomed).toBe(ref);
  });

  it('throws if capacity is already exhausted at commit time (race-tap guard)', () => {
    // Simulate two UI taps racing: a prior commit for the same household
    // already used its only capacity slot. The second commit must refuse
    // rather than over-fill.
    store.rehomed.push(adopted('03-nova', NOW - 1000, 'old-1'));
    expect(() => commitAdoption(animal, '03-nova', store, NOW)).toThrow();
    // And the store must be untouched — animal still present, no new entry.
    expect(store.animals).toHaveLength(1);
    expect(store.rehomed).toHaveLength(1);
  });
});

/** The five ids the first households carried before they matched cast.json. */
const OLD_IDS = {
  priya: '01-pri-kaur',
  nova: '03-nova-adebayo',
  babcia: '04-babcia-kowalska',
  hiro: '06-hiro-nakamura',
  patelGreens: '07-anjali-sam-patel-green',
};

describe('household ids written before the roster matched cast.json', () => {
  // A save that has rehomed an animal holds the id the roster used at the
  // time. Those entries are history and are never rewritten (merge-save
  // unions rehomed by whole entry, so a rewrite would double them against
  // a copy that still has the old id), which means the readers have to
  // understand both. Each is dated, because a household is busy only for
  // the cooldown: a recent old-id entry fills it, an old one does not.

  const recent = (householdId: string, animalId = 'old-1') =>
    adopted(householdId, daysAgo(3), animalId);
  const longAgo = (householdId: string, animalId = 'old-1') =>
    adopted(householdId, daysAgo(60), animalId);

  describe('canonicalHouseholdId', () => {
    it('maps every old id to the id cast.json uses', () => {
      expect(canonicalHouseholdId(OLD_IDS.priya)).toBe('01-priya');
      expect(canonicalHouseholdId(OLD_IDS.nova)).toBe('03-nova');
      expect(canonicalHouseholdId(OLD_IDS.babcia)).toBe('04-babcia');
      expect(canonicalHouseholdId(OLD_IDS.hiro)).toBe('06-hiro');
      expect(canonicalHouseholdId(OLD_IDS.patelGreens)).toBe('07-patel-greens');
    });

    it('has exactly the five old ids, each pointing at a roster household in cast.json', () => {
      expect(Object.keys(LEGACY_HOUSEHOLD_IDS).sort()).toEqual(Object.values(OLD_IDS).sort());
      const rosterIds = ids(ADOPTER_HOUSEHOLD_DEFS);
      for (const target of Object.values(LEGACY_HOUSEHOLD_IDS)) {
        expect(rosterIds).toContain(target);
        expect(CAST_IDS).toContain(target);
      }
    });

    it('leaves current ids, other cast ids and strangers alone', () => {
      expect(canonicalHouseholdId('01-priya')).toBe('01-priya');
      expect(canonicalHouseholdId('14-theo-grandkids')).toBe('14-theo-grandkids');
      expect(canonicalHouseholdId('wild-a1')).toBe('wild-a1');
      expect(canonicalHouseholdId('')).toBe('');
    });

    it('does not read inherited object keys as aliases', () => {
      expect(canonicalHouseholdId('constructor')).toBe('constructor');
      expect(canonicalHouseholdId('toString')).toBe('toString');
      expect(canonicalHouseholdId('__proto__')).toBe('__proto__');
    });
  });

  describe('householdUseCount and householdActiveUseCount', () => {
    it('count entries written under either id', () => {
      const rehomed = [
        recent(OLD_IDS.nova, 'a'),
        recent('03-nova', 'b'),
        recent('06-hiro', 'c'),
      ];
      expect(householdUseCount(rehomed, '03-nova')).toBe(2);
      expect(householdUseCount(rehomed, OLD_IDS.nova)).toBe(2);
      expect(householdUseCount(rehomed, '06-hiro')).toBe(1);
      expect(householdUseCount(rehomed, '01-priya')).toBe(0);
      expect(householdActiveUseCount(rehomed, '03-nova', NOW)).toBe(2);
      expect(householdActiveUseCount(rehomed, OLD_IDS.nova, NOW)).toBe(2);
      expect(householdActiveUseCount(rehomed, '01-priya', NOW)).toBe(0);
    });
  });

  describe('a fresh save', () => {
    it('offers every household that takes cats, and each can take its first animal', () => {
      const animal = makeAnimal({ species: 'cat' });
      const store = makeStore([animal]);
      const eligible = getEligibleApplicants(animal, store, NOW);
      expect(ids(eligible).sort()).toEqual(ids(householdsForSpecies('cat')).sort());
      for (const legacy of Object.values(LEGACY_HOUSEHOLD_IDS)) {
        expect(ids(eligible), legacy).toContain(legacy);
      }
      const entry = commitAdoption(animal, '07-patel-greens', store, NOW);
      expect(entry.householdId).toBe('07-patel-greens');
    });

    it('writes a new adoption under the current id, never the old one', () => {
      const animal = makeAnimal({ species: 'dog' });
      const store = makeStore([animal]);
      const entry = commitAdoption(animal, '04-babcia', store, NOW);
      expect(Object.values(OLD_IDS)).not.toContain(entry.householdId);
      expect(store.rehomed[0].householdId).toBe('04-babcia');
    });
  });

  describe('a save holding old-style ids', () => {
    it('does not hand a busy household its capacity back', () => {
      const animal = makeAnimal({ species: 'cat' });
      const store = makeStore([animal]);
      const before = getEligibleApplicants(animal, store, NOW).length;
      store.rehomed.push(recent(OLD_IDS.nova));

      const eligible = ids(getEligibleApplicants(animal, store, NOW));
      expect(eligible).not.toContain('03-nova');
      expect(eligible).toHaveLength(before - 1);
    });

    it('holds for each of the five households', () => {
      for (const [current, old] of [
        ['01-priya', OLD_IDS.priya],
        ['03-nova', OLD_IDS.nova],
        ['04-babcia', OLD_IDS.babcia],
        ['06-hiro', OLD_IDS.hiro],
        ['07-patel-greens', OLD_IDS.patelGreens],
      ]) {
        const animal = makeAnimal({ species: 'cat' });
        const store = makeStore([animal]);
        store.rehomed.push(recent(old));
        const eligible = ids(getEligibleApplicants(animal, store, NOW));
        expect(eligible, `${old} should still fill ${current}`).not.toContain(current);
      }
    });

    it('frees the household once the old entry has aged out, as it would a current one', () => {
      // The effect on a child whose five households were all used up for
      // good: they come back, which is the point of the cooldown.
      const animal = makeAnimal({ species: 'cat' });
      const store = makeStore([animal]);
      for (const old of Object.values(OLD_IDS)) store.rehomed.push(longAgo(old, `gone-${old}`));
      const eligible = ids(getEligibleApplicants(animal, store, NOW));
      for (const current of Object.values(LEGACY_HOUSEHOLD_IDS)) expect(eligible).toContain(current);
    });

    it('refuses a commit into a household that adopted recently under the old id', () => {
      const animal = makeAnimal({ species: 'cat' });
      const store = makeStore([animal]);
      store.rehomed.push(recent(OLD_IDS.hiro));

      expect(() => commitAdoption(animal, '06-hiro', store, NOW)).toThrow();
      expect(() => commitAdoption(animal, OLD_IDS.hiro, store, NOW)).toThrow();
      // Untouched: the animal is still here and the history has not grown.
      expect(store.animals).toHaveLength(1);
      expect(store.rehomed).toHaveLength(1);
    });

    it('keeps the old entries exactly as they were', () => {
      const animal = makeAnimal({ species: 'cat' });
      const store = makeStore([animal]);
      const old = recent(OLD_IDS.nova);
      store.rehomed.push(old);

      getEligibleApplicants(animal, store, NOW);
      commitAdoption(animal, '06-hiro', store, NOW);

      expect(store.rehomed[0]).toBe(old);
      expect(store.rehomed[0].householdId).toBe(OLD_IDS.nova);
    });

    it('takes a commit that still names the old id, and records the current one', () => {
      const animal = makeAnimal({ species: 'cat' });
      const store = makeStore([animal]);
      const entry = commitAdoption(animal, OLD_IDS.priya, store, NOW);
      expect(entry.householdId).toBe('01-priya');
    });

    it('leaves the other dog households open when one is busy under the old id', () => {
      const animal = makeAnimal({ species: 'dog' });
      const store = makeStore([animal]);
      store.rehomed.push(recent(OLD_IDS.priya));
      // Pri is busy under her old id; Babcia and the rest still take dogs.
      const eligible = ids(getEligibleApplicants(animal, store, NOW));
      expect(eligible).not.toContain('01-priya');
      expect(eligible).toContain('04-babcia');
    });
  });
});
