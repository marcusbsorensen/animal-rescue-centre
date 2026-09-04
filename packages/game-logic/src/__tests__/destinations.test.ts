import { describe, it, expect } from 'vitest';
import {
  DESTINATIONS,
  getDestination,
  getAvailableDestinations,
  mapExtentFor,
  MAP_EXTENT_MIN,
  habitatForSpecies,
} from '../destinations';

describe('destinations catalogue', () => {
  it('contains the expected 11 destinations (A.R.C. + 10 outward)', () => {
    expect(DESTINATIONS).toHaveLength(11);
    const ids = DESTINATIONS.map((d) => d.id);
    expect(ids).toContain('arc');
    expect(ids).toContain('vet');
    expect(ids).toContain('village-hall');
    expect(ids).toContain('bramble-farm');
    expect(ids).toContain('cove-harbour');
    expect(ids).toContain('pinebark-medical');
    expect(ids).toContain('moorland');
    expect(ids).toContain('woodland');
    expect(ids).toContain('sea-cliffs');
    expect(ids).toContain('deep-forest');
    expect(ids).toContain('wetlands');
  });

  it('every destination sits on the map, as a [0, 1] fraction of the image', () => {
    for (const d of DESTINATIONS) {
      expect(d.fx).toBeGreaterThanOrEqual(0);
      expect(d.fx).toBeLessThanOrEqual(1);
      expect(d.fy).toBeGreaterThanOrEqual(0);
      expect(d.fy).toBeLessThanOrEqual(1);
    }
  });

  it('every destination names what opens when you arrive', () => {
    // A pin with no arrival is a pin that wastes a journey.
    for (const d of DESTINATIONS) {
      expect(d.arrival).toBeTruthy();
    }
  });

  it('the vet and the village hall are never locked', () => {
    // A poorly animal can arrive on day one, and Social used to be a
    // permanent tab — moving it onto the map must not take it away.
    expect(getDestination('vet')?.unlockLevel).toBe(0);
    expect(getDestination('village-hall')?.unlockLevel).toBe(0);
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

  it('unlocks cove harbour at level 5, sea cliffs at 6, deep forest 8, wetlands 9', () => {
    expect(getAvailableDestinations(5).map((d) => d.id)).toContain('cove-harbour');
    expect(getAvailableDestinations(6).map((d) => d.id)).toContain('sea-cliffs');
    expect(getAvailableDestinations(5).map((d) => d.id)).not.toContain('sea-cliffs');
    expect(getAvailableDestinations(8).map((d) => d.id)).toContain('deep-forest');
    expect(getAvailableDestinations(9).map((d) => d.id)).toContain('wetlands');
  });

  it('unlocks everything at level 10+', () => {
    const ids = getAvailableDestinations(10).map((d) => d.id);
    expect(ids).toHaveLength(DESTINATIONS.length);
    expect(ids).toContain('pinebark-medical');
  });
});

describe('mapExtentFor', () => {
  it('opens tight and grows to the whole map', () => {
    const low = mapExtentFor(0);
    const high = mapExtentFor(10);
    // At or just above the floor — the level-0 pins may ask for a
    // shade more room than MAP_EXTENT_MIN, and containment wins.
    expect(low.half).toBeGreaterThanOrEqual(MAP_EXTENT_MIN);
    expect(low.half).toBeLessThan(0.35);
    expect(high.half).toBeCloseTo(0.5, 5);
  });

  it('never shrinks as the level rises', () => {
    let prev = 0;
    for (let level = 0; level <= 12; level++) {
      const { half } = mapExtentFor(level);
      expect(half).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = half;
    }
  });

  it('keeps the frame on the image at every level', () => {
    // A.R.C. sits at fy 0.31 against a half-extent of 0.28, so an
    // unclamped centre runs the first frame off the top of the map.
    for (let level = 0; level <= 12; level++) {
      const { cx, cy, half } = mapExtentFor(level);
      expect(cx - half).toBeGreaterThanOrEqual(-1e-9);
      expect(cy - half).toBeGreaterThanOrEqual(-1e-9);
      expect(cx + half).toBeLessThanOrEqual(1 + 1e-9);
      expect(cy + half).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('never crops an unlocked destination out of the frame', () => {
    for (let level = 0; level <= 12; level++) {
      const { cx, cy, half } = mapExtentFor(level);
      for (const d of getAvailableDestinations(level)) {
        expect(Math.abs(d.fx - cx)).toBeLessThanOrEqual(half + 1e-9);
        expect(Math.abs(d.fy - cy)).toBeLessThanOrEqual(half + 1e-9);
      }
    }
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
