import { describe, it, expect } from 'vitest';
import {
  buildRouteJunctions,
  nextJunction,
  nextChoiceJunction,
  inDecisionWindow,
} from '../junctions';
import { buildAdjacency, type RoadGraph } from '../road-router';
import { worldYForProgress } from '../road-transition';

// A small route: node0 → node1 (bend) → node2 (bend) → node3 (FORK) → node4.
// Node 3 has a third real road (to node5), making it a genuine fork.
//   0 --x-- 1
//           |            (1→2 turns down, 2→3 turns right: two cosmetic bends)
//           2 --x-- 3 --x-- 4
//                   |
//                   5      (branch off the fork)
function graph(forkClass = 'residential'): RoadGraph {
  return {
    nodes: [
      [0.1, 0.5], // 0 start
      [0.3, 0.5], // 1 bend
      [0.3, 0.3], // 2 bend
      [0.5, 0.3], // 3 fork
      [0.7, 0.3], // 4 end
      [0.5, 0.1], // 5 branch
    ],
    edges: [
      [0, 1, 'residential'],
      [1, 2, 'residential'],
      [2, 3, 'residential'],
      [3, 4, 'residential'],
      [3, 5, forkClass], // the third road at node 3
    ],
  };
}

const FROM = { fx: 0.1, fy: 0.5 };
const TO = { fx: 0.7, fy: 0.3 };

describe('buildRouteJunctions', () => {
  it('emits the two bends and the fork, skipping straight-through non-forks', () => {
    const g = graph();
    const js = buildRouteJunctions(g, buildAdjacency(g), FROM, TO);
    expect(js.map((j) => j.nodeIndex)).toEqual([1, 2, 3]);
  });

  it('marks the degree-3 node a choice (straight through) and the bends not', () => {
    const g = graph();
    const js = buildRouteJunctions(g, buildAdjacency(g), FROM, TO);
    const fork = js.find((j) => j.nodeIndex === 3)!;
    expect(fork.isChoice).toBe(true);
    expect(fork.realDegree).toBe(3);
    expect(fork.turn).toBeNull(); // the route goes straight through the crossroads
    for (const bend of js.filter((j) => j.nodeIndex !== 3)) {
      expect(bend.isChoice).toBe(false);
      expect(bend.turn).not.toBeNull(); // a real heading change
    }
  });

  it('does NOT treat a fork as a choice when its third road is a minor stub', () => {
    const g = graph('track'); // node 3's third edge is a farm track
    const js = buildRouteJunctions(g, buildAdjacency(g), FROM, TO);
    // Node 3 now has real-degree 2 and the route passes straight → not emitted.
    expect(js.some((j) => j.nodeIndex === 3)).toBe(false);
    expect(js.map((j) => j.nodeIndex)).toEqual([1, 2]);
  });

  it('keys junctions to world-Y via the shared transition clock, in order', () => {
    const g = graph();
    const js = buildRouteJunctions(g, buildAdjacency(g), FROM, TO);
    for (let i = 1; i < js.length; i++) {
      expect(js[i].atProgress).toBeGreaterThan(js[i - 1].atProgress);
    }
    for (const j of js) {
      expect(j.worldY).toBeCloseTo(worldYForProgress(j.atProgress));
      expect(j.atProgress).toBeGreaterThan(0);
      expect(j.atProgress).toBeLessThan(1);
    }
  });

  it('returns nothing for an empty graph', () => {
    expect(buildRouteJunctions({ nodes: [], edges: [] }, [], FROM, TO)).toEqual([]);
  });
});

describe('junction lookups', () => {
  const g = graph();
  const js = buildRouteJunctions(g, buildAdjacency(g), FROM, TO);
  const fork = js.find((j) => j.nodeIndex === 3)!;

  it('nextChoiceJunction skips bends and finds the fork', () => {
    expect(nextChoiceJunction(js, 0)!.nodeIndex).toBe(3);
    expect(nextJunction(js, 0)!.nodeIndex).toBe(1); // nextJunction includes bends
  });

  it('nextChoiceJunction returns undefined once past the fork', () => {
    expect(nextChoiceJunction(js, fork.atProgress + 0.01)).toBeUndefined();
  });

  it('inDecisionWindow is generous around the junction world-Y', () => {
    expect(inDecisionWindow(fork, fork.worldY)).toBe(true);
    expect(inDecisionWindow(fork, fork.worldY + 100)).toBe(true);
    expect(inDecisionWindow(fork, fork.worldY + 500)).toBe(false);
  });
});
