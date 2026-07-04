import { describe, it, expect } from 'vitest';
import {
  SPECIES_VARIANTS,
  SPECIES_COLOURS,
  spawnAnimal,
} from '../animals';
import { getSpeciesUnlocksForLevel } from '../progression';
import { WALKABLE_SPECIES } from '../walks';
import { getFoodsForSpecies } from '../food';
import { countFactsForSpecies } from '../species-facts';
import { getPreferredCrates, getCompatibility } from '../crate-stacking';
import { DEFAULT_TOY_FOR_SPECIES, getAvailableToys } from '../toys';
import { getGarmentForSpecies, getWardrobeAnchor } from '../wardrobe';
import { getSpeciesTemperament } from '../garden';
import { habitatForSpecies } from '../destinations';
import { getSpeciesRainTolerance } from '../weather';
import type { Species } from '@arc/shared-types';

// The hedgehog is the flagship new species for the L7 content pass. It
// already appears in the garden-tunnel mini-game and the woodland
// rewilding habitat, so making it a real rescuable species closes those
// continuity gaps. This suite pins the cross-module contract a new
// species must satisfy to feel finished (per docs/adding-a-new-species.md).

const ALL_OTHER_SPECIES: Species[] = ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake'];

describe('hedgehog species', () => {
  it('unlocks at level 7, not before', () => {
    expect(getSpeciesUnlocksForLevel(6)).not.toContain('hedgehog');
    expect(getSpeciesUnlocksForLevel(7)).toContain('hedgehog');
  });

  it('has at least 5 visual variants', () => {
    expect(SPECIES_VARIANTS.hedgehog.length).toBeGreaterThanOrEqual(5);
  });

  it('has a placeholder colour', () => {
    expect(typeof SPECIES_COLOURS.hedgehog).toBe('number');
  });

  it('spawns a valid animal with a name and arrival story', () => {
    const h = spawnAnimal('hedgehog');
    expect(h.species).toBe('hedgehog');
    expect(h.name.length).toBeGreaterThan(0);
    expect(h.arrivalStory.length).toBeGreaterThan(0);
    expect(SPECIES_VARIANTS.hedgehog).toContain(h.variant);
  });

  it('does NOT lead-walk — it snuffles in the garden instead', () => {
    // Deliberate design decision: hedgehogs are not collar-walkable.
    expect(WALKABLE_SPECIES).not.toContain('hedgehog');
  });

  it('has at least one valid food so the kitchen mini-game is solvable', () => {
    expect(getFoodsForSpecies('hedgehog').length).toBeGreaterThanOrEqual(1);
  });

  it('has at least 3 "did you know?" facts for the arrival popup', () => {
    expect(countFactsForSpecies('hedgehog')).toBeGreaterThanOrEqual(3);
  });

  it('has a preferred crate and symmetric compatibility with every species', () => {
    expect(getPreferredCrates('hedgehog').length).toBeGreaterThan(0);
    for (const other of [...ALL_OTHER_SPECIES, 'hedgehog' as Species]) {
      expect(getCompatibility('hedgehog', other)).toBe(getCompatibility(other, 'hedgehog'));
    }
  });

  it('has a default toy that is actually playable for a hedgehog', () => {
    const h = spawnAnimal('hedgehog');
    const toyIds = getAvailableToys(h).map((t) => t.id);
    expect(toyIds).toContain(DEFAULT_TOY_FOR_SPECIES.hedgehog);
    expect(toyIds.length).toBeGreaterThan(0);
  });

  it('has a garment, wardrobe anchor, temperament and rain tolerance', () => {
    expect(getGarmentForSpecies('hedgehog')).toBeDefined();
    expect(getWardrobeAnchor('hedgehog')).toBeDefined();
    expect(getSpeciesTemperament('hedgehog')).toBeDefined();
    expect(getSpeciesRainTolerance('hedgehog')).toBeDefined();
  });

  it('rewilds to the woodland habitat (closes the existing continuity gap)', () => {
    expect(habitatForSpecies('hedgehog')).toBe('woodland');
  });
});
