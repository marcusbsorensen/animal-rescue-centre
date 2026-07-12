import { describe, it, expect } from 'vitest';
import {
  PROGRESS_PER_SCROLL,
  worldYForProgress,
  worldYForRow,
  buildRoadTransitions,
  transitionAt,
  dropWorldY,
} from '../road-transition';
import type { RoadClassRun } from '../road-router';
import type { RoadId } from '../road-config';

// Same mapping the scene uses.
const roadIdForClass = (cls: string): RoadId =>
  cls === 'trunk' ? 'thanet-way' : cls === 'track' ? 'rural-track' : 'country-lane';

describe('road-transition', () => {
  describe('world-Y mapping', () => {
    it('progress and scrollY are the same signal', () => {
      // progress = scrollY * PROGRESS_PER_SCROLL  ⇒  worldY(progress) = progress / rate
      expect(worldYForProgress(0.5)).toBeCloseTo(0.5 / PROGRESS_PER_SCROLL);
      expect(worldYForProgress(0)).toBe(0);
    });
    it('rows above the van are further ahead (larger world-Y)', () => {
      const scrollY = 1000, vanY = 400;
      const ahead = worldYForRow(scrollY, vanY, 100); // near the top
      const atVan = worldYForRow(scrollY, vanY, vanY);
      const behind = worldYForRow(scrollY, vanY, 700); // below the van
      expect(atVan).toBe(scrollY);
      expect(ahead).toBeGreaterThan(atVan);
      expect(behind).toBeLessThan(atVan);
    });
  });

  describe('buildRoadTransitions', () => {
    const profile: RoadClassRun[] = [
      { roadClass: 'residential', untilProgress: 0.3 }, // country-lane
      { roadClass: 'trunk', untilProgress: 0.7 },        // thanet-way
      { roadClass: 'residential', untilProgress: 1.0 },  // country-lane
    ];

    it('makes one zone per rendered-road change, centred on the boundary', () => {
      const zones = buildRoadTransitions(profile, roadIdForClass, 500);
      expect(zones).toHaveLength(2);
      expect(zones[0]).toMatchObject({ fromRoad: 'country-lane', toRoad: 'thanet-way' });
      expect(zones[0].centreWorldY).toBeCloseTo(worldYForProgress(0.3));
      expect(zones[1]).toMatchObject({ fromRoad: 'thanet-way', toRoad: 'country-lane' });
      expect(zones[1].centreWorldY).toBeCloseTo(worldYForProgress(0.7));
    });

    it('emits no zone when a class change maps to the same rendered road', () => {
      const same: RoadClassRun[] = [
        { roadClass: 'residential', untilProgress: 0.5 }, // country-lane
        { roadClass: 'unclassified', untilProgress: 1.0 }, // also country-lane
      ];
      expect(buildRoadTransitions(same, roadIdForClass, 500)).toHaveLength(0);
    });
  });

  describe('transitionAt', () => {
    const zones = buildRoadTransitions(
      [
        { roadClass: 'residential', untilProgress: 0.5 },
        { roadClass: 'trunk', untilProgress: 1.0 },
      ],
      roadIdForClass,
      400,
    );
    const centre = zones[0].centreWorldY;

    it('returns null outside every zone', () => {
      expect(transitionAt(zones, centre - 1000)).toBeNull();
      expect(transitionAt(zones, centre + 1000)).toBeNull();
    });
    it('blends 0→1 from the near edge to the far edge', () => {
      expect(transitionAt(zones, centre - 200)!.t).toBeCloseTo(0);
      expect(transitionAt(zones, centre)!.t).toBeCloseTo(0.5);
      expect(transitionAt(zones, centre + 200)!.t).toBeCloseTo(1);
    });
    it('carries the zone so the caller knows from/to', () => {
      const s = transitionAt(zones, centre)!;
      expect(s.zone.fromRoad).toBe('country-lane');
      expect(s.zone.toRoad).toBe('thanet-way');
    });
  });

  describe('dropWorldY', () => {
    it('sits ~70% through the zone by default', () => {
      const [zone] = buildRoadTransitions(
        [
          { roadClass: 'residential', untilProgress: 0.5 },
          { roadClass: 'trunk', untilProgress: 1.0 },
        ],
        roadIdForClass,
        400,
      );
      // near edge = centre-200, far edge = centre+200; 70% ⇒ centre+80.
      expect(dropWorldY(zone)).toBeCloseTo(zone.centreWorldY + 80);
    });
  });
});
