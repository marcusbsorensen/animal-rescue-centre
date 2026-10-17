import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Animal, Species } from '@arc/shared-types';
import { getSpeciesUnlocksForLevel } from '../progression';
import {
  DESTINATIONS,
  HOG_HOSPITAL_NAME,
  WILDLIFE_PARK_NAME,
  getDestination,
  habitatForSpecies,
} from '../destinations';
import {
  commitAdoption,
  getEligibleApplicants,
  householdsForSpecies,
  isPlacementId,
  PLACEMENT_ID_PREFIX,
} from '../adoption';
import { GRANTS } from '../charity';
import {
  HABITAT_PHRASES,
  PLACEMENTS,
  REWILDING_HELPERS,
  canPlaceAt,
  canReleaseAt,
  commitPlacement,
  commitRewilding,
  exitsForAnimal,
  exitsForSpecies,
  isUnreleasable,
  lifetimeRescuedCount,
  placementCard,
  placementCopy,
  placementFor,
  placementPlanFor,
  placementsFor,
  rewildingCopy,
  rewildingPlanFor,
  rewildingPlanForAnimal,
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
    // A healthy animal. species, adopt, rewild, place
    ['cat', true, false, false],
    ['dog', true, false, false],
    ['bunny', true, true, false],
    ['parrot', true, false, false],
    ['snake', true, true, true],
    ['fox', false, true, false],
    ['bat', false, true, false],
    ['hedgehog', false, true, false],
  ] as Array<[Species, boolean, boolean, boolean]>)('%s: adopt=%s rewild=%s place=%s', (species, adopt, rewild, place) => {
    expect(exitsForSpecies(species)).toEqual({ adopt, rewild, place });
  });

  it.each([
    // The same animal with a lasting condition: never the wild.
    ['cat', true, false, false],
    ['dog', true, false, false],
    ['bunny', true, false, false],
    ['parrot', true, false, false],
    ['snake', true, false, true],
    ['fox', false, false, true],
    ['bat', false, false, true],
    ['hedgehog', false, false, true],
  ] as Array<[Species, boolean, boolean, boolean]>)('%s that cannot be released: adopt=%s rewild=%s place=%s', (species, adopt, rewild, place) => {
    expect(exitsForAnimal({ species, chronicIllness: true })).toEqual({ adopt, rewild, place });
  });

  it('covers every species the game can spawn, healthy or not', () => {
    expect(ALL_SPECIES).toHaveLength(8);
    for (const s of ALL_SPECIES) {
      for (const chronicIllness of [false, true]) {
        const e = exitsForAnimal({ species: s, chronicIllness });
        expect(e.adopt || e.rewild || e.place, `${s} (chronic=${chronicIllness}) has no way out`).toBe(true);
      }
    }
  });
});

describe('every species reaches an ending on a fresh save', () => {
  // The bug: six of eight species had no ending, and "try again in a few
  // days" was true of no number of days. Take each species in at the top of
  // the unlock table and send it out by whatever exit it has — healthy, and
  // with a lasting condition, because an animal that cannot be released
  // needs an ending as much as one that can.
  describe.each([false, true])('with a lasting condition: %s', (chronicIllness) => {
    it.each(ALL_SPECIES)('%s leaves the centre', (species) => {
      const animal = makeAnimal({ id: `end-${species}`, species, chronicIllness });
      const shelter = freshShelter([animal]);
      const exits = exitsForAnimal(animal);

      if (exits.adopt) {
        const first = getEligibleApplicants(animal, shelter, NOW)[0];
        expect(first, `${species}: nobody to adopt it`).toBeDefined();
        commitAdoption(animal, first.householdId, shelter, NOW);
        expect(shelter.rehomed).toHaveLength(1);
      } else if (exits.rewild) {
        commitRewilding(animal, shelter, NOW);
        expect(shelter.rewilded).toHaveLength(1);
      } else {
        commitPlacement(animal, shelter, NOW);
        expect(shelter.rehomed).toHaveLength(1);
      }
      expect(shelter.animals).toHaveLength(0);
    });
  });

  it('a species with more than one exit can use each', () => {
    for (const species of ['bunny', 'snake'] as Species[]) {
      const a = makeAnimal({ id: 'adopt', species });
      const s1 = freshShelter([a]);
      commitAdoption(a, getEligibleApplicants(a, s1, NOW)[0].householdId, s1, NOW);
      expect(s1.rehomed, `${species} adopted`).toHaveLength(1);

      const b = makeAnimal({ id: 'rewild', species });
      const s2 = freshShelter([b]);
      commitRewilding(b, s2, NOW);
      expect(s2.rewilded, `${species} rewilded`).toHaveLength(1);
    }
    const c = makeAnimal({ id: 'place', species: 'snake' });
    const s3 = freshShelter([c]);
    commitPlacement(c, s3, NOW);
    expect(s3.rehomed, 'snake placed').toHaveLength(1);
  });

  it('sends a healthy fox, bat or hedgehog to the wild and nowhere else', () => {
    for (const species of ['fox', 'bat', 'hedgehog'] as Species[]) {
      const animal = makeAnimal({ species });
      const shelter = freshShelter([animal]);
      expect(() => commitAdoption(animal, '01-priya', shelter, NOW)).toThrow();
      expect(() => commitPlacement(animal, shelter, NOW), `${species}: placement is not for a healthy one`).toThrow();
      commitRewilding(animal, shelter, NOW);
      expect(shelter.rehomed).toHaveLength(0);
      expect(shelter.rewilded.map((r) => r.species)).toEqual([species]);
    }
  });
});

describe('the hedgehog goes back to the woods', () => {
  it('is rewilded to the woodland, per docs/animal-exits.md', () => {
    expect(exitsForSpecies('hedgehog')).toEqual({ adopt: false, rewild: true, place: false });
    expect(habitatForSpecies('hedgehog')).toBe('woodland');
    const plan = rewildingPlanFor('hedgehog');
    expect(plan?.habitat).toBe('woodland');
    expect(plan?.habitatLabel).toBe('Woodland');
    expect(plan?.habitatPhrase).toBe('the woods');
  });

  it('is seen home by the hog hospital, a place and not a household', () => {
    const helper = REWILDING_HELPERS.hedgehog;
    expect(helper?.name).toBe(HOG_HOSPITAL_NAME);
    expect(rewildingPlanFor('hedgehog')?.helper).toBe(helper);
    // The name is the map destination's label, so it is written once.
    expect(getDestination('hog-hospital')?.label).toBe(helper?.name);
    // cast.json has no hedgehog household, and the helper is not pretending to be one.
    expect(CAST.filter((c) => (c.species as string[]).includes('hedgehog'))).toEqual([]);
    expect(isPlacementId(helper?.householdId ?? '')).toBe(true);
    expect(PLACEMENTS.some((p) => p.id === helper?.householdId)).toBe(true);
    expect(helper?.avatarSrc).toBeUndefined();
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
      helperHouseholdId: `${PLACEMENT_ID_PREFIX}hog-hospital`,
    });
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
      expect(copy.button).toBe('WAVE THEM OFF!');
    });

    it('names its helper: the hog hospital takes Bramble home', () => {
      expect(copy.subtitle).toBe(`${HOG_HOSPITAL_NAME} will take Bramble home to the woods`);
      expect(copy.toast).toBe(`🌲 ${HOG_HOSPITAL_NAME} took Bramble home to the woods!`);
    });

    it('thanks the child in the hedgehog’s own words', () => {
      expect(copy.letter).toContain('Thank you for taking such good care of me.');
      expect(copy.letter).toContain(`${HOG_HOSPITAL_NAME} will take me home to the woods, where I belong.`);
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

  it('only names households that exist and have a portrait path, or places that exist', () => {
    for (const [species, helper] of Object.entries(REWILDING_HELPERS)) {
      if (isPlacementId(helper?.householdId ?? '')) {
        expect(PLACEMENTS.some((p) => p.id === helper?.householdId), species).toBe(true);
        continue;
      }
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
    for (const species of ['bunny', 'parrot', 'snake'] as Species[]) {
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
    expect(habitatForSpecies('bat')).toBe('deep-forest');
    expect(habitatForSpecies('snake')).toBe('wetlands');
    // And not the parrot: see 'a parrot is never released' below.
    expect(habitatForSpecies('parrot')).toBeUndefined();
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

// ── Parrots: adoption only ─────────────────────────────────────

describe('a parrot is never released', () => {
  // A parrot is not native British wildlife. Letting a pet one go in the
  // British countryside is illegal and harms the birds that live there, and a
  // rescue game that teaches children to do it is the opposite of its point.
  // It used to map to the sea cliffs; if this fails because that mapping came
  // back as a "missing route", the mapping is the mistake, not this test.
  const SIX_HOUSEHOLDS = [
    '12-odenkirks',
    '20-lei',
    '21-mara',
    '28-iris-teacher',
    '30-two-houses',
    '31-estrada-train',
  ];

  it('has adoption and nothing else', () => {
    expect(exitsForSpecies('parrot')).toEqual({ adopt: true, rewild: false, place: false });
  });

  it('has no habitat, no plan and no destination that takes it', () => {
    expect(habitatForSpecies('parrot')).toBeUndefined();
    expect(rewildingPlanFor('parrot')).toBeUndefined();
    for (const d of DESTINATIONS.filter((x) => x.kind === 'rewilding-habitat')) {
      expect(d.suitableSpecies ?? [], `${d.id} lists parrot`).not.toContain('parrot');
      expect(canReleaseAt('parrot', d.id), `parrot at ${d.id}`).toBe(false);
    }
    expect(getDestination('sea-cliffs')?.suitableSpecies).not.toContain('parrot');
  });

  it('is refused by commitRewilding and left where it is', () => {
    const parrot = makeAnimal({ species: 'parrot' });
    const shelter = freshShelter([parrot]);
    expect(() => commitRewilding(parrot, shelter, NOW)).toThrow(/does not go back to the wild/);
    expect(shelter.animals).toHaveLength(1);
    expect(shelter.rewilded).toHaveLength(0);
  });

  it('is taken by exactly the six households that list it, with no new cast needed', () => {
    expect(householdsForSpecies('parrot').map((h) => h.householdId).sort()).toEqual(SIX_HOUSEHOLDS);
    // ...and cast.json agrees with the roster about who they are.
    const inCast = CAST.filter((c) => c.species.includes('parrot') && c.category !== 'return-visitor');
    expect(inCast.map((c) => c.id).sort()).toEqual(SIX_HOUSEHOLDS);
  });

  it('can be adopted on a fresh save', () => {
    const parrot = makeAnimal({ species: 'parrot' });
    const shelter = freshShelter([parrot]);
    const offered = getEligibleApplicants(parrot, shelter, NOW);
    expect(offered.length).toBeGreaterThan(0);
    commitAdoption(parrot, offered[0].householdId, shelter, NOW);
    expect(shelter.rehomed.map((r) => r.species)).toEqual(['parrot']);
  });

  it('is not released even with a lasting condition, and is still adopted', () => {
    expect(exitsForAnimal({ species: 'parrot', chronicIllness: true })).toEqual({
      adopt: true, rewild: false, place: false,
    });
  });
});

// ── Snake: both routes, and a third ────────────────────────────

describe('a snake keeps both routes', () => {
  // A grass snake is British wildlife and belongs in wetlands; snakes are
  // also legitimate pets. Both stay, and the wildlife park is a third.
  it('is adopted by its four households and released to the wetlands', () => {
    expect(householdsForSpecies('snake').map((h) => h.householdId).sort()).toEqual([
      '02-jan', '12-odenkirks', '28-iris-teacher', '31-estrada-train',
    ]);
    expect(habitatForSpecies('snake')).toBe('wetlands');
    expect(rewildingPlanFor('snake')?.habitat).toBe('wetlands');
    expect(canReleaseAt('snake', 'wetlands')).toBe(true);
    expect(getDestination('wetlands')?.suitableSpecies).toContain('snake');
  });

  it('has adoption, the wild and the wildlife park', () => {
    expect(exitsForSpecies('snake')).toEqual({ adopt: true, rewild: true, place: true });
  });

  it('is rewilded with no named helper, as before', () => {
    expect(rewildingPlanFor('snake')?.helper).toBeUndefined();
  });

  it('can go to the wildlife park whether or not it could be released', () => {
    for (const chronicIllness of [false, true]) {
      expect(placementFor({ species: 'snake', chronicIllness })?.destinationId).toBe('wilderwood');
    }
  });
});

// ── Fox and bat: the wild, or keepers when they cannot be released ──

describe.each(['fox', 'bat'] as Species[])('a %s', (species) => {
  const habitat = species === 'fox' ? 'moorland' : 'deep-forest';

  it('that is healthy goes back to the wild', () => {
    const animal = makeAnimal({ id: 'well', species });
    expect(isUnreleasable(animal)).toBe(false);
    expect(exitsForAnimal(animal)).toEqual({ adopt: false, rewild: true, place: false });

    const shelter = freshShelter([animal]);
    const entry = commitRewilding(animal, shelter, NOW);
    expect(entry.habitat).toBe(habitat);
    expect(shelter.rewilded).toHaveLength(1);
    expect(shelter.rehomed).toHaveLength(0);
  });

  it('that cannot be released goes to the wildlife park, and is not released', () => {
    const animal = makeAnimal({ id: 'hurt', species, chronicIllness: true });
    expect(isUnreleasable(animal)).toBe(true);
    expect(exitsForAnimal(animal)).toEqual({ adopt: false, rewild: false, place: true });
    expect(rewildingPlanForAnimal(animal)).toBeUndefined();
    expect(canReleaseAt(animal, habitat)).toBe(false);
    expect(placementPlanFor(animal)?.destinationId).toBe('wilderwood');
    expect(canPlaceAt(animal, 'wilderwood')).toBe(true);

    const shelter = freshShelter([animal]);
    expect(() => commitRewilding(animal, shelter, NOW)).toThrow(/lasting condition/);
    expect(shelter.animals).toHaveLength(1);
    expect(shelter.rewilded).toHaveLength(0);

    const entry = commitPlacement(animal, shelter, NOW);
    expect(entry.householdId).toBe(`${PLACEMENT_ID_PREFIX}wilderwood`);
    expect(entry.species).toBe(species);
    expect(shelter.animals).toHaveLength(0);
    expect(shelter.rehomed).toEqual([entry]);
    expect(shelter.rewilded).toHaveLength(0);
  });

  it('that is healthy is not offered the wildlife park', () => {
    const animal = makeAnimal({ id: 'well', species });
    expect(placementFor(animal)).toBeUndefined();
    expect(canPlaceAt(animal, 'wilderwood')).toBe(false);
    const shelter = freshShelter([animal]);
    expect(() => commitPlacement(animal, shelter, NOW)).toThrow(/no placement takes/);
    expect(shelter.animals).toHaveLength(1);
    expect(shelter.rehomed).toHaveLength(0);
  });

  it('is judged by the animal in the centre, not by a copy the caller holds', () => {
    // A stale healthy copy must not release an animal the store knows cannot be.
    const inStore = makeAnimal({ id: 'x', species, chronicIllness: true });
    const staleCopy = makeAnimal({ id: 'x', species });
    const shelter = freshShelter([inStore]);
    expect(() => commitRewilding(staleCopy, shelter, NOW)).toThrow(/lasting condition/);
    expect(shelter.animals).toHaveLength(1);

    // And a flagged copy must not place an animal the store says is well.
    const well = makeAnimal({ id: 'y', species });
    const flaggedCopy = makeAnimal({ id: 'y', species, chronicIllness: true });
    const shelter2 = freshShelter([well]);
    expect(() => commitPlacement(flaggedCopy, shelter2, NOW)).toThrow();
    expect(shelter2.animals).toHaveLength(1);
  });

  it('still has nobody to adopt it, even with the wildlife park', () => {
    const animal = makeAnimal({ species, chronicIllness: true });
    expect(getEligibleApplicants(animal, freshShelter([animal]), NOW)).toEqual([]);
  });
});

describe('what makes an animal unreleasable', () => {
  it('is the lasting flag and nothing else', () => {
    expect(isUnreleasable({})).toBe(false);
    expect(isUnreleasable({ chronicIllness: false })).toBe(false);
    expect(isUnreleasable({ chronicIllness: true })).toBe(true);
  });

  it('is not being poorly: a fox with a cold or a sore paw is released like any other', () => {
    // `sickAnimals` and low health are about now. They heal, and an animal
    // that heals goes home. Sending it to keepers would read as the shelter
    // giving up on an animal that only needed a day.
    const poorly = makeAnimal({ species: 'fox', health: 5, happiness: 5 });
    expect(exitsForAnimal(poorly)).toEqual({ adopt: false, rewild: true, place: false });
    const shelter = freshShelter([poorly]);
    expect(() => commitRewilding(poorly, shelter, NOW)).not.toThrow();
  });
});

// ── Hedgehog: both sides of the gate ───────────────────────────

describe('a hedgehog that cannot be released goes to the hog hospital', () => {
  const hog = makeAnimal({ id: 'hog-2', name: 'Prickle', variant: 'brown', chronicIllness: true });

  it('is offered the hospital and not the woods', () => {
    expect(exitsForAnimal(hog)).toEqual({ adopt: false, rewild: false, place: true });
    expect(placementPlanFor(hog)?.name).toBe(HOG_HOSPITAL_NAME);
    expect(canPlaceAt(hog, 'hog-hospital')).toBe(true);
    expect(canReleaseAt(hog, 'woodland')).toBe(false);
  });

  it('is the same place that sees a healthy hedgehog back to the woods', () => {
    expect(REWILDING_HELPERS.hedgehog?.householdId).toBe(placementFor(hog)?.id);
    expect(REWILDING_HELPERS.hedgehog?.name).toBe(placementPlanFor(hog)?.name);
  });

  it('is recorded as rehomed under the hospital, and counts as rescued', () => {
    const shelter = freshShelter([hog]);
    const entry = commitPlacement(hog, shelter, 777);
    expect(entry).toEqual({
      animalId: 'hog-2',
      animalName: 'Prickle',
      species: 'hedgehog',
      variant: 'brown',
      householdId: `${PLACEMENT_ID_PREFIX}hog-hospital`,
      date: 777,
    });
    expect(lifetimeRescuedCount('hedgehog', shelter)).toBe(1);
  });

  it('is not turned away: a placement has no cooldown and no capacity', () => {
    const shelter = freshShelter();
    for (let i = 0; i < 12; i++) {
      const h = makeAnimal({ id: `h${i}`, chronicIllness: true });
      shelter.animals.push(h);
      expect(() => commitPlacement(h, shelter, NOW + i)).not.toThrow();
    }
    expect(shelter.rehomed).toHaveLength(12);
  });
});

// ── The placement table ────────────────────────────────────────

describe('placements', () => {
  it('are map destinations of their own kind, with a pin and an arrival', () => {
    for (const p of PLACEMENTS) {
      const dest = getDestination(p.destinationId);
      expect(dest, p.id).toBeDefined();
      expect(dest?.kind, p.id).toBe('placement');
      expect(dest?.arrival, p.id).toBe('placement');
      expect(isPlacementId(p.id), p.id).toBe(true);
    }
    expect(new Set(PLACEMENTS.map((p) => p.id)).size).toBe(PLACEMENTS.length);
  });

  it('are named by their destination, and each name is a constant', () => {
    expect(getDestination('hog-hospital')?.label).toBe(HOG_HOSPITAL_NAME);
    expect(getDestination('wilderwood')?.label).toBe(WILDLIFE_PARK_NAME);
  });

  it('take whoever their table lists, so a new species is one line', () => {
    for (const p of PLACEMENTS) {
      for (const [species, gate] of Object.entries(p.takes) as Array<[Species, 'always' | 'unreleasable']>) {
        const flagged = { species, chronicIllness: true };
        expect(placementsFor(flagged).map((x) => x.id), `${species} that cannot be released`).toContain(p.id);
        const well = placementsFor({ species });
        if (gate === 'always') {
          expect(well.map((x) => x.id), `${species} that is well`).toContain(p.id);
        } else {
          expect(well.map((x) => x.id), `${species} that is well`).not.toContain(p.id);
        }
      }
    }
  });

  it('list only species the game can spawn', () => {
    for (const p of PLACEMENTS) {
      for (const species of Object.keys(p.takes)) {
        expect(ALL_SPECIES, `${p.id}: ${species}`).toContain(species);
      }
    }
  });

  it('are driven to only by an animal they take, at the place they are', () => {
    const fox = makeAnimal({ species: 'fox', chronicIllness: true });
    expect(canPlaceAt(fox, 'wilderwood')).toBe(true);
    expect(canPlaceAt(fox, 'hog-hospital')).toBe(false);
    expect(canPlaceAt(fox, 'moorland')).toBe(false);
    expect(canPlaceAt(makeAnimal({ species: 'cat' }), 'wilderwood')).toBe(false);
    expect(canPlaceAt(fox, 'nowhere')).toBe(false);
  });

  it('need no cast.json household: nothing in the cast has a placement id', () => {
    for (const c of CAST) expect(isPlacementId(c.id), c.id).toBe(false);
  });
});

describe('the words of a placement', () => {
  // Read aloud to a child who cannot read them, like a release: a place the
  // animal is going TO, kind people there, happy. Nothing about why, and
  // nothing darker than that.
  const FORBIDDEN =
    /\b(not|never|no|none|nobody|nothing|cannot|can't|won't|couldn't|failed|fail|reject\w*|sorry|too|sad|lost|without|unable|only|instead|because|getting rid|give up|gave up)\b/i;
  const DARK =
    /\b(injur\w*|hurt|poorly|sick|ill|illness|disab\w*|wound\w*|die[ds]?|dead|death|euthan\w*|put to sleep|permanent\w*|for good|cage\w*|locked)\b/i;

  const cases = PLACEMENTS.flatMap((p) =>
    (Object.keys(p.takes) as Species[]).map((species) => [p.id, species] as const),
  );

  it.each(cases)('%s / %s: positive, short and names the place', (_id, species) => {
    const plan = placementPlanFor({ species, chronicIllness: true });
    if (!plan) throw new Error(`no plan for ${species}`);
    const copy = placementCopy('Pip', plan);

    for (const [field, text] of Object.entries(copy)) {
      expect(text, `${species}.${field}`).not.toMatch(FORBIDDEN);
      expect(text, `${species}.${field}`).not.toMatch(DARK);
    }
    for (const sentence of copy.letter.split(/(?<=[.!])\s+/)) {
      expect(sentence.split(/\s+/).length, `${species}: "${sentence}"`).toBeLessThanOrEqual(14);
    }
    expect(copy.subtitle).toContain(plan.name);
    expect(copy.letter).toContain(plan.name);
    expect(copy.toast).toContain(plan.name);
    expect(copy.toast).toContain('Pip');
    expect(copy.button).toBe('WAVE THEM OFF!');
  });

  it('reads as a safe home for the hedgehog, in the animal’s own voice', () => {
    const plan = placementPlanFor({ species: 'hedgehog', chronicIllness: true });
    if (!plan) throw new Error('no plan');
    const copy = placementCopy('Bramble', plan);
    expect(copy.title).toBe('A safe home for Bramble');
    expect(copy.subtitle).toBe(`${HOG_HOSPITAL_NAME} will look after Bramble`);
    expect(copy.letter).toContain('Thank you for taking such good care of me.');
    expect(copy.letter).toContain(`Now I'm going to ${HOG_HOSPITAL_NAME}.`);
    expect(copy.sign).toBe('Your friend always — Bramble');
    expect(copy.visitLine).toBe(`Visit ${HOG_HOSPITAL_NAME} any time`);
  });

  it('is not a wild release: nothing about the wild, a release or a family', () => {
    const plan = placementPlanFor({ species: 'snake' });
    if (!plan) throw new Error('no plan');
    const all = Object.values(placementCopy('Pip', plan)).join(' ');
    expect(all).not.toMatch(/\bwild\b|release|adopt|forever home|family|rehome|woods|moor/i);
  });

  it('falls back to a generic name when the animal has none', () => {
    const plan = placementPlanFor({ species: 'snake' });
    if (!plan) throw new Error('no plan');
    expect(placementCopy('   ', plan).title).toBe('A safe home for your friend');
  });

  it('puts the place on the Paths card, under a short title', () => {
    const plan = placementPlanFor({ species: 'hedgehog', chronicIllness: true });
    if (!plan) throw new Error('no plan');
    expect(placementCard('Bramble', plan)).toEqual({
      badge: '🦔',
      name: 'A safe home',
      blurb: `${HOG_HOSPITAL_NAME} will look after Bramble`,
    });
  });
});

describe('the two placeholder names are written once', () => {
  // Marcus is confirming these. A rename must be one line in
  // destinations.ts, so no other source file may spell either name.
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const SKIP = /(__tests__|node_modules|\.test\.|[\\/]dist[\\/]|[\\/]assets[\\/])/;

  function sources(dir: string, exts: string[]): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = resolve(dir, name);
      if (SKIP.test(full)) continue;
      if (statSync(full).isDirectory()) out.push(...sources(full, exts));
      else if (exts.some((e) => name.endsWith(e))) out.push(full);
    }
    return out;
  }

  const files = [
    ...sources(resolve(ROOT, 'packages/game-logic/src'), ['.ts']),
    ...sources(resolve(ROOT, 'apps/game/src'), ['.ts']),
    ...['paths.html', 'rewilding.html', 'map.html'].map((f) => resolve(ROOT, 'apps/game/public/admin', f)),
  ].filter((f) => !f.endsWith('game-logic/src/destinations.ts'));

  it('reads some files, so the check below is checking something', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('is spelt in destinations.ts and nowhere else', () => {
    const offenders = files.filter((f) => /Freckle|Wilderwood/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
