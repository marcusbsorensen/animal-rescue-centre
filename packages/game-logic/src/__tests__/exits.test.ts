import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Animal, Species } from '@arc/shared-types';
import { getSpeciesUnlocksForLevel } from '../progression';
import { getDestination, habitatForSpecies } from '../destinations';
import { commitAdoption, getEligibleApplicants } from '../adoption';
import { GRANTS } from '../charity';
import {
  HABITAT_PHRASES,
  REWILDING_HELPERS,
  canReleaseAt,
  commitRewilding,
  exitsForSpecies,
  lifetimeRescuedCount,
  rewildingCopy,
  rewildingPlanFor,
  type RewildedEntry,
  type RewildingStoreLike,
} from '../exits';
import type { RehomedEntry } from '../adoption';

function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'a1',
    name: 'Bramble',
    species: 'hedgehog',
    state: 'pet',
    arrivalStory: 'found at the gate',
    hunger: 0,
    tiredness: 0,
    happiness: 100,
    health: 100,
    bondLevel: 100,
    roomId: 'room-hedgehog',
    ...overrides,
  };
}

interface Shelter extends RewildingStoreLike {
  rehomed: RehomedEntry[];
}

const freshShelter = (animals: Animal[] = []): Shelter => ({
  animals: [...animals],
  rehomed: [],
  rewilded: [],
});

const NOW = 1_800_000_000_000;

/** Every species a child can meet by the top of the unlock table. */
const ALL_SPECIES: Species[] = getSpeciesUnlocksForLevel(99);

const CAST_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../apps/game/public/data/cast.json',
);
const CAST = (
  JSON.parse(readFileSync(CAST_PATH, 'utf8')) as {
    cast: Array<{ id: string; species: Species[]; category: string; return_rhythm?: string }>;
  }
).cast;

describe('which exits each species has', () => {
  it.each([
    ['cat', true, false],
    ['dog', true, false],
    ['bunny', true, true],
    ['parrot', true, true],
    ['snake', true, true],
    ['fox', false, true],
    ['bat', false, true],
    ['hedgehog', false, true],
  ] as Array<[Species, boolean, boolean]>)('%s: adopt=%s rewild=%s', (species, adopt, rewild) => {
    expect(exitsForSpecies(species)).toEqual({ adopt, rewild });
  });

  it('covers every species the game can spawn', () => {
    expect(ALL_SPECIES).toHaveLength(8);
    for (const s of ALL_SPECIES) {
      const e = exitsForSpecies(s);
      expect(e.adopt || e.rewild, `${s} has no way out`).toBe(true);
    }
  });
});

describe('every species reaches an ending on a fresh save', () => {
  // The bug: six of eight species had no ending, and "try again in a few
  // days" was true of no number of days. Take each species in at the top of
  // the unlock table and send it out by whatever exit it has.
  it.each(ALL_SPECIES)('%s leaves the centre', (species) => {
    const animal = makeAnimal({ id: `end-${species}`, species });
    const shelter = freshShelter([animal]);
    const exits = exitsForSpecies(species);

    if (exits.adopt) {
      const first = getEligibleApplicants(animal, shelter, NOW)[0];
      expect(first, `${species}: nobody to adopt it`).toBeDefined();
      commitAdoption(animal, first.householdId, shelter, NOW);
      expect(shelter.rehomed).toHaveLength(1);
    } else {
      commitRewilding(animal, shelter, NOW);
      expect(shelter.rewilded).toHaveLength(1);
    }
    expect(shelter.animals).toHaveLength(0);
  });

  it('a species with both exits can use either', () => {
    for (const species of ['bunny', 'parrot', 'snake'] as Species[]) {
      const a = makeAnimal({ id: 'adopt', species });
      const s1 = freshShelter([a]);
      commitAdoption(a, getEligibleApplicants(a, s1, NOW)[0].householdId, s1, NOW);
      expect(s1.rehomed, `${species} adopted`).toHaveLength(1);

      const b = makeAnimal({ id: 'rewild', species });
      const s2 = freshShelter([b]);
      commitRewilding(b, s2, NOW);
      expect(s2.rewilded, `${species} rewilded`).toHaveLength(1);
    }
  });

  it('sends fox, bat and hedgehog to the wild and nowhere else', () => {
    for (const species of ['fox', 'bat', 'hedgehog'] as Species[]) {
      const animal = makeAnimal({ species });
      const shelter = freshShelter([animal]);
      expect(() => commitAdoption(animal, '01-priya', shelter, NOW)).toThrow();
      commitRewilding(animal, shelter, NOW);
      expect(shelter.rehomed).toHaveLength(0);
      expect(shelter.rewilded.map((r) => r.species)).toEqual([species]);
    }
  });
});

describe('the hedgehog goes back to the woods', () => {
  it('is rewilded to the woodland, per docs/animal-exits.md', () => {
    expect(exitsForSpecies('hedgehog')).toEqual({ adopt: false, rewild: true });
    expect(habitatForSpecies('hedgehog')).toBe('woodland');
    const plan = rewildingPlanFor('hedgehog');
    expect(plan?.habitat).toBe('woodland');
    expect(plan?.habitatLabel).toBe('Woodland');
    expect(plan?.habitatPhrase).toBe('the woods');
  });

  it('has no named helper, and none is invented', () => {
    expect(rewildingPlanFor('hedgehog')?.helper).toBeUndefined();
    expect(REWILDING_HELPERS.hedgehog).toBeUndefined();
    // cast.json has no hedgehog household to lend one.
    expect(CAST.filter((c) => (c.species as string[]).includes('hedgehog'))).toEqual([]);
  });

  it('removes the hedgehog from the centre and records it under rewilded, not rehomed', () => {
    const hog = makeAnimal({ id: 'hog-1', name: 'Bramble', variant: 'brown' });
    const shelter = freshShelter([hog, makeAnimal({ id: 'cat-1', species: 'cat' })]);
    const entry = commitRewilding(hog, shelter, 4242);

    expect(shelter.animals.map((a) => a.id)).toEqual(['cat-1']);
    expect(shelter.rehomed).toHaveLength(0);
    expect(shelter.rewilded).toEqual([entry]);
    expect(entry).toEqual({
      animalId: 'hog-1',
      animalName: 'Bramble',
      species: 'hedgehog',
      variant: 'brown',
      date: 4242,
      habitat: 'woodland',
    });
    expect(entry.helperHouseholdId).toBeUndefined();
  });

  it('feeds the Wildlife Trust grant and leaves the Community Foundation alone', () => {
    const wildlife = GRANTS.find((g) => g.id === 'wildlife_trust');
    const community = GRANTS.find((g) => g.id === 'community_foundation');
    const shelter = freshShelter();
    const asGrantStore = () => ({
      level: 1,
      economy: { coins: 0, lifetimeEarnings: 0 },
      rewilded: shelter.rewilded,
      rehomed: shelter.rehomed,
    });

    for (let i = 0; i < 3; i++) {
      const hog = makeAnimal({ id: `hog-${i}` });
      shelter.animals.push(hog);
      commitRewilding(hog, shelter, NOW + i);
    }
    expect(wildlife?.qualifies(asGrantStore())).toBe(true);
    expect(community?.qualifies(asGrantStore())).toBe(false);
  });

  it('is released at the woodland and nowhere else', () => {
    expect(canReleaseAt('hedgehog', 'woodland')).toBe(true);
    for (const place of ['moorland', 'sea-cliffs', 'deep-forest', 'wetlands', 'vet', 'arc']) {
      expect(canReleaseAt('hedgehog', place), place).toBe(false);
    }
  });

  describe('what the child sees and hears', () => {
    const plan = rewildingPlanFor('hedgehog');
    if (!plan) throw new Error('no plan for hedgehog');
    const copy = rewildingCopy('Bramble', plan);

    it('says where the hedgehog is going, in the register of the adoption plaque', () => {
      expect(copy.title).toBe('A wild home for Bramble');
      expect(copy.subtitle).toBe('Bramble is going home to the woods');
      expect(copy.button).toBe('WAVE THEM OFF!');
      expect(copy.toast).toBe('🌲 Bramble has gone home to the woods!');
    });

    it('thanks the child in the hedgehog’s own words', () => {
      expect(copy.letter).toContain('Thank you for taking such good care of me.');
      expect(copy.letter).toContain('Now I\'m going home to the woods, where I belong.');
      expect(copy.sign).toBe('Your friend always — Bramble');
      expect(copy.rememberLine).toBe('Bramble will remember you');
    });
  });
});

describe('the words of a release', () => {
  // Read aloud to a child who cannot read them, and the hedgehog must not
  // sound turned away. So: no negatives, no reasons, no comparison, short
  // sentences, and always a place it is going TO.
  const FORBIDDEN =
    /\b(not|never|no|none|nobody|nothing|cannot|can't|won't|couldn't|failed|fail|reject\w*|sorry|too|sad|lost|without|unable|only|instead|because|getting rid|give up|gave up)\b/i;

  const rewildable = ALL_SPECIES.filter((s) => rewildingPlanFor(s));

  it.each(rewildable)('%s: positive, short and names the place', (species) => {
    const plan = rewildingPlanFor(species);
    if (!plan) throw new Error('unreachable');
    const copy = rewildingCopy('Pip', plan);

    for (const [field, text] of Object.entries(copy)) {
      expect(text, `${species}.${field}`).not.toMatch(FORBIDDEN);
    }
    for (const sentence of copy.letter.split(/(?<=[.!])\s+/)) {
      expect(sentence.split(/\s+/).length, `${species}: "${sentence}"`).toBeLessThanOrEqual(14);
    }
    expect(copy.subtitle).toContain(plan.habitatPhrase);
    expect(copy.letter).toContain(plan.habitatPhrase);
    expect(copy.toast).toContain('Pip');
  });

  it('never mentions adoption or a family — those belong to the other exit', () => {
    for (const species of rewildable) {
      const plan = rewildingPlanFor(species);
      if (!plan) continue;
      const all = Object.values(rewildingCopy('Pip', plan)).join(' ');
      expect(all).not.toMatch(/adopt|forever home|family|rehome/i);
    }
  });

  it('falls back to a generic name when the animal has none', () => {
    const plan = rewildingPlanFor('hedgehog');
    if (!plan) throw new Error('no plan');
    expect(rewildingCopy('   ', plan).title).toBe('A wild home for your friend');
  });

  it('has a phrase for every habitat on the map', () => {
    for (const species of rewildable) {
      const habitat = habitatForSpecies(species);
      if (!habitat) throw new Error('no habitat');
      expect(HABITAT_PHRASES[habitat].length).toBeGreaterThan(0);
    }
  });
});

describe('the people who help an animal back to the wild', () => {
  it('names Simeon & Karo for the bat, from a cast.json household that does exactly that', () => {
    const helper = REWILDING_HELPERS.bat;
    expect(helper?.householdId).toBe('32-simeon-karo');
    const c = CAST.find((x) => x.id === helper?.householdId);
    expect(c?.return_rhythm).toBe('bat-rewilding-helper');
    expect(c?.category).toBe('return-visitor');
    expect(c?.species).toContain('bat');
  });

  it('names Benji for the fox', () => {
    const helper = REWILDING_HELPERS.fox;
    expect(helper?.householdId).toBe('17-benji');
    const c = CAST.find((x) => x.id === helper?.householdId);
    expect(c?.return_rhythm).toBe('wild-visit');
    expect(c?.species).toContain('fox');
  });

  it('only names households that exist and have a portrait path', () => {
    for (const [species, helper] of Object.entries(REWILDING_HELPERS)) {
      expect(CAST.some((c) => c.id === helper?.householdId), species).toBe(true);
      expect(helper?.avatarSrc).toBe(`/admin/scene-assets/cast/${helper?.householdId}.png`);
    }
  });

  it('puts the helper in the bat’s ending and on its record', () => {
    const bat = makeAnimal({ id: 'bat-1', name: 'Dusk', species: 'bat' });
    const shelter = freshShelter([bat]);
    const plan = rewildingPlanFor('bat');
    if (!plan) throw new Error('no plan');

    const entry: RewildedEntry = commitRewilding(bat, shelter, NOW);
    expect(entry.habitat).toBe('deep-forest');
    expect(entry.helperHouseholdId).toBe('32-simeon-karo');

    const copy = rewildingCopy('Dusk', plan);
    expect(copy.subtitle).toBe('Simeon & Karo will take Dusk home to the deep forest');
    expect(copy.letter).toContain('Simeon & Karo will take me home to the deep forest, where I belong.');
    expect(copy.toast).toBe('🌲 Simeon & Karo took Dusk home to the deep forest!');
  });

  it('puts Benji in the fox’s ending', () => {
    const plan = rewildingPlanFor('fox');
    if (!plan) throw new Error('no plan');
    expect(rewildingCopy('Rusty', plan).toast).toBe('🌲 Benji took Rusty home to the moor!');
  });

  it('leaves the other species without a helper', () => {
    for (const species of ['bunny', 'parrot', 'snake', 'hedgehog'] as Species[]) {
      expect(rewildingPlanFor(species)?.helper, species).toBeUndefined();
    }
  });
});

describe('cats and dogs are not released', () => {
  it.each(['cat', 'dog'] as Species[])('%s has no wild home', (species) => {
    expect(rewildingPlanFor(species)).toBeUndefined();
    expect(exitsForSpecies(species).rewild).toBe(false);
  });

  it.each(['cat', 'dog'] as Species[])('%s cannot be released anywhere', (species) => {
    for (const place of ['moorland', 'woodland', 'sea-cliffs', 'deep-forest', 'wetlands']) {
      expect(canReleaseAt(species, place), `${species} at ${place}`).toBe(false);
    }
  });

  it.each(['cat', 'dog'] as Species[])('commitRewilding refuses a %s and touches nothing', (species) => {
    const animal = makeAnimal({ species });
    const shelter = freshShelter([animal]);
    expect(() => commitRewilding(animal, shelter, NOW)).toThrow();
    expect(shelter.animals).toHaveLength(1);
    expect(shelter.rewilded).toHaveLength(0);
  });

  it('commitRewilding throws for an animal that is not in the centre', () => {
    const shelter = freshShelter();
    expect(() => commitRewilding(makeAnimal({ id: 'ghost' }), shelter, NOW)).toThrow();
    expect(shelter.rewilded).toHaveLength(0);
  });
});

describe('habitats and the species they take agree', () => {
  it('lists each rewildable species on the destination it maps to', () => {
    for (const species of ALL_SPECIES) {
      const habitat = habitatForSpecies(species);
      if (!habitat) continue;
      const dest = getDestination(habitat);
      expect(dest, `${species} → ${habitat}`).toBeDefined();
      expect(dest?.kind).toBe('rewilding-habitat');
      expect(dest?.suitableSpecies, `${habitat}.suitableSpecies`).toContain(species);
      expect(canReleaseAt(species, habitat), `${species} at ${habitat}`).toBe(true);
    }
  });

  it('follows the table in docs/animal-exits.md', () => {
    expect(habitatForSpecies('fox')).toBe('moorland');
    expect(habitatForSpecies('bunny')).toBe('woodland');
    expect(habitatForSpecies('hedgehog')).toBe('woodland');
    expect(habitatForSpecies('parrot')).toBe('sea-cliffs');
    expect(habitatForSpecies('bat')).toBe('deep-forest');
    expect(habitatForSpecies('snake')).toBe('wetlands');
  });
});

describe('lifetimeRescuedCount', () => {
  it('counts animals in the centre, adopted and released, once each', () => {
    const store = {
      animals: [{ species: 'fox' as Species }, { species: 'cat' as Species }],
      rehomed: [{ species: 'fox' as Species }, { species: 'cat' as Species }],
      rewilded: [{ species: 'fox' as Species }, { species: 'fox' as Species }],
    };
    expect(lifetimeRescuedCount('fox', store)).toBe(4);
    expect(lifetimeRescuedCount('cat', store)).toBe(2);
    expect(lifetimeRescuedCount('bat', store)).toBe(0);
  });

  it('does not lose an animal’s count when it leaves', () => {
    const bat = makeAnimal({ id: 'b', species: 'bat' });
    const shelter = freshShelter([bat]);
    expect(lifetimeRescuedCount('bat', shelter)).toBe(1);
    commitRewilding(bat, shelter, NOW);
    expect(shelter.animals).toHaveLength(0);
    expect(lifetimeRescuedCount('bat', shelter)).toBe(1);
  });
});
