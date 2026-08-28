import { describe, it, expect } from 'vitest';
import { isOvertakingZone, blendRoadGeometry, roadGeometry, CENTRE_LINE_ZONE_LEN as Z } from '../drive-render';
import { ROADS } from '../road-config';

describe('blendRoadGeometry', () => {
  const W = 900;
  const dual = roadGeometry(W, ROADS['thanet-way']);   // wide, 4 lanes + median
  const single = roadGeometry(W, ROADS['country-lane']); // narrow, 2 lanes

  it('returns the endpoints at t=0 and t=1', () => {
    expect(blendRoadGeometry(dual, single, 0)).toMatchObject({ roadWidth: dual.roadWidth });
    expect(blendRoadGeometry(dual, single, 1)).toMatchObject({ roadWidth: single.roadWidth });
  });

  it('narrows monotonically across the merge, keeping lane width fixed', () => {
    const mid = blendRoadGeometry(dual, single, 0.5);
    expect(mid.roadWidth).toBeLessThan(dual.roadWidth);
    expect(mid.roadWidth).toBeGreaterThan(single.roadWidth);
    expect(mid.laneWidth).toBe(dual.laneWidth); // lanes drop, they don't squeeze
    expect(mid.medianUnits).toBeCloseTo((dual.medianUnits + single.medianUnits) / 2);
  });

  it('flips the discrete lane count at the midpoint', () => {
    expect(blendRoadGeometry(dual, single, 0.49).totalLanes).toBe(dual.totalLanes);
    expect(blendRoadGeometry(dual, single, 0.51).totalLanes).toBe(single.totalLanes);
  });

  it('clamps t outside 0..1', () => {
    expect(blendRoadGeometry(dual, single, -1).roadWidth).toBe(dual.roadWidth);
    expect(blendRoadGeometry(dual, single, 2).roadWidth).toBe(single.roadWidth);
  });
});

describe('isOvertakingZone', () => {
  it('the first band from the road origin is dashed (overtaking permitted)', () => {
    expect(isOvertakingZone(0, 0)).toBe(true);
    expect(isOvertakingZone(0, Z - 1)).toBe(true);
  });

  it('alternates dashed / solid every zone length', () => {
    expect(isOvertakingZone(0, Z * 0 + 10)).toBe(true); // band 0 dashed
    expect(isOvertakingZone(0, Z * 1 + 10)).toBe(false); // band 1 solid
    expect(isOvertakingZone(0, Z * 2 + 10)).toBe(true); // band 2 dashed
    expect(isOvertakingZone(0, Z * 3 + 10)).toBe(false); // band 3 solid
  });

  it('scrolls with the road: the same world stretch keeps its marking', () => {
    // A fixed screen point sees dashed/solid flip as the road scrolls under it.
    expect(isOvertakingZone(0, 100)).toBe(true); // band 0
    expect(isOvertakingZone(-Z, 100)).toBe(false); // scrolled up one band → band 1
    expect(isOvertakingZone(-2 * Z, 100)).toBe(true); // band 2
  });

  it('handles points above the origin without spilling into the wrong band', () => {
    expect(isOvertakingZone(100, 50)).toBe(false); // k = floor(-0.11) = -1 → solid
    expect(isOvertakingZone(100, 150)).toBe(true); // k = 0 → dashed
  });
});
