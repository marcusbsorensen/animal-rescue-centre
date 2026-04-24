import { describe, it, expect } from 'vitest';
import {
  DESTINATIONS,
  getDestination,
  getAvailableDestinations,
  habitatForSpecies,
} from '../destinations';

describe('destinations catalogue', () => {
  it('contains the expected 9 destinations (A.R.C. + 8 outward)', () => {
    expect(DESTINATIONS).toHaveLength(9);
    const ids = DESTINATIONS.map((d) => d.id);
    expect(ids).toContain('arc');
    expect(ids).toContain('bramble-farm');
    expect(ids).toContain('cove-harbour');
    expect(ids).toContain('pinebark-medical');
    expect(ids).toContain('moorland');
    expect(ids).toContain('woodland');
    expect(ids).toContain('sea-cliffs');
    expect(ids).toContain('deep-forest');
    expect(ids).toContain('wetlands');
  });

  it('every destination has a sensible mapX/mapY on the [0, 100] range', () => {
    for (const d of DESTINATIONS) {
      expect(d.mapX).toBeGreaterThanOrEqual(0);
      expect(d.mapX).toBeLessThanOrEqual(100);
      expect(d.mapY).toBeGreaterThanOrEqual(0);
      expect(d.mapY).toBeLessThanOrEqual(100);
    }
  });
});

describe('getDestination', () => {
  it('returns the destination by id', () => {
    const bramble = getDestination('bramble-farm');
    expect(bramble).toBeDefined();
    expect(bramble?.label).toBe('Bramble Farm');
    expect(bramble?.kind).toBe('supply-run');
  });

  it('returns undefined for an unknown id', () => {
    expect(getDestination('atlantis')).toBeUndefined();
  });
});

describe('getAvailableDestinations', () => {
  it('returns only the level-0 unlocks at player level 0', () => {
    const available = getAvailableDestinations(0);
    const ids = available.map((d) => d.id);
    expect(ids).toContain('arc');
    expect(ids).toContain('bramble-farm');
    expect(ids).not.toContain('cove-harbour');
    expect(ids).not.toContain('moorland');
  });

  it('unlocks moorland/woodland at level 3', () => {
    const ids = getAvailableDestinations(3).map((d) => d.id);
    expect(ids).toContain('moorland');
    expect(ids).toContain('woodland');
    expect(ids).not.toContain('cove-harbour'); // still level 5
  });

  it('unlocks cove harbour at level 5, sea cliffs at 7, deep forest 8, wetlands 9', () => {
    expect(getAvailableDestinations(5).map((d) => d.id)).toContain('cove-harbour');
    expect(getAvailableDestinations(7).map((d) => d.id)).toContain('sea-cliffs');
    expect(getAvailableDestinations(8).map((d) => d.id)).toContain('deep-forest');
    expect(getAvailableDestinations(9).map((d) => d.id)).toContain('wetlands');
  });

  it('unlocks everything at level 10+', () => {
    const ids = getAvailableDestinations(10).map((d) => d.id);
    expect(ids).toHaveLength(DESTINATIONS.length);
    expect(ids).toContain('pinebark-medical');
  });
});

describe('habitatForSpecies', () => {
  it('maps species to the natural habitat', () => {
    expect(habitatForSpecies('fox')).toBe('moorland');
    expect(habitatForSpecies('bat')).toBe('deep-forest');
    expect(habitatForSpecies('snake')).toBe('wetlands');
    expect(habitatForSpecies('parrot')).toBe('sea-cliffs');
    expect(habitatForSpecies('bunny')).toBe('woodland');
  });

  it('returns undefined for non-rewildable species (cat, dog)', () => {
    expect(habitatForSpecies('cat')).toBeUndefined();
    expect(habitatForSpecies('dog')).toBeUndefined();
  });

  it('returns undefined for an unknown species', () => {
    expect(habitatForSpecies('dragon')).toBeUndefined();
    expect(habitatForSpecies('')).toBeUndefined();
  });
});
