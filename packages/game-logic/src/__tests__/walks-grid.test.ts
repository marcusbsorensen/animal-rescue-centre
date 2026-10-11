import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Animal } from '@arc/shared-types';
import {
  calculateGridWalkRewards,
  generateWalkGrid,
  startGridWalk,
} from '../walks';
import type { WalkGridMap, WalkGridState, WalkZone } from '../walks';

/**
 * The grid walk's end-of-walk reckoning, as the Pavement Pro badge reads it.
 *
 * `good_walker` is "complete 10 walks without a road incident". The walk's
 * `perfectWalk` flag also wants 60% of the things on the route explored, which
 * that badge never mentions, so the badge counts `roadSafe`. The second block
 * checks that the exploration half of a perfect walk is within reach on every
 * map the game can draw, because a flag nobody can raise is the same defect
 * the badge itself had.
 */

const ZONES: WalkZone[] = ['park', 'town', 'beach', 'forest'];

const animal: Animal = {
  id: 'w1',
  name: 'Buddy',
  species: 'dog',
  state: 'sheltered',
  arrivalStory: 'Found at the park',
  hunger: 30,
  tiredness: 20,
  happiness: 70,
  health: 100,
  bondLevel: 50,
  roomId: 'r1',
};

/** A walk state with the tallies set directly. */
function walk(over: Partial<WalkGridState>): WalkGridState {
  return { ...startGridWalk(animal, 'park'), ...over };
}

describe('calculateGridWalkRewards — roadSafe', () => {
  it('is true when no crossing went wrong, however little was explored', () => {
    const rewards = calculateGridWalkRewards(walk({
      roadCrossingsFailed: 0, interactionsCompleted: 0, totalInteractables: 10,
    }));
    expect(rewards.roadSafe).toBe(true);
    expect(rewards.perfectWalk).toBe(false);
    expect(rewards.explorationPercent).toBe(0);
  });

  it('is false after any failed crossing, however much was explored', () => {
    const rewards = calculateGridWalkRewards(walk({
      roadCrossingsFailed: 1, interactionsCompleted: 10, totalInteractables: 10,
    }));
    expect(rewards.roadSafe).toBe(false);
    expect(rewards.perfectWalk).toBe(false);
  });

  it('is true on a walk with no road in it', () => {
    const rewards = calculateGridWalkRewards(walk({
      totalRoadCrossings: 0, roadCrossingsFailed: 0, interactionsCompleted: 5, totalInteractables: 5,
    }));
    expect(rewards.roadSafe).toBe(true);
  });

  it('makes a walk perfect only with both halves', () => {
    const base = { roadCrossingsFailed: 0, totalInteractables: 10 };
    expect(calculateGridWalkRewards(walk({ ...base, interactionsCompleted: 5 })).perfectWalk).toBe(false);
    expect(calculateGridWalkRewards(walk({ ...base, interactionsCompleted: 6 })).perfectWalk).toBe(true);
    expect(calculateGridWalkRewards(walk({ ...base, interactionsCompleted: 6, roadCrossingsFailed: 1 })).perfectWalk).toBe(false);
  });
});

/**
 * Which interactable tiles a child could actually interact with before the
 * exit ends the walk. Walkable tiles are explored outwards from the start;
 * a road row is passable (crossing it is a minigame, and a safe crossing is
 * possible by definition); the exit is not entered, because stepping on it
 * completes the walk. A tile can be interacted with from itself or from any
 * of its four neighbours, as `interactWithTile` allows.
 */
function explorableShare(map: WalkGridMap): { reachable: number; total: number } {
  const key = (r: number, c: number) => r * map.cols + c;
  const inBounds = (r: number, c: number) => r >= 0 && r < map.rows && c >= 0 && c < map.cols;
  const seen = new Set<number>();
  const queue: Array<[number, number]> = [[map.playerStart.row, map.playerStart.col]];
  seen.add(key(map.playerStart.row, map.playerStart.col));

  while (queue.length) {
    const [r, c] = queue.shift()!;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      if (seen.has(key(nr, nc))) continue;
      const tile = map.tiles[nr][nc];
      if (tile.type === 'exit') continue;
      if (!tile.walkable && tile.type !== 'road') continue;
      seen.add(key(nr, nc));
      queue.push([nr, nc]);
    }
  }

  let total = 0;
  let reachable = 0;
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      if (!map.tiles[r][c].interactable) continue;
      total++;
      const from = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
      if (from.some(([dr, dc]) => inBounds(r + dr, c + dc) && seen.has(key(r + dr, c + dc)))) {
        reachable++;
      }
    }
  }
  return { reachable, total };
}

describe('the exploration half of a perfect walk', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const zone of ZONES) {
    it(`can reach 60% of the ${zone} on every map the zone draws`, () => {
      // The first random number generateWalkGrid draws picks the template,
      // so steering it walks every template in turn. Twenty steps cover a
      // zone with up to twenty maps; the count check below fails first if
      // a zone ever grows past that and this stops seeing all of it.
      const seen = new Set<string>();
      for (let step = 0; step < 20; step++) {
        vi.spyOn(Math, 'random').mockReturnValueOnce((step + 0.5) / 20);
        const map = generateWalkGrid(zone);
        seen.add(map.tiles.map((row) => row.map((t) => t.type[0]).join('')).join('/'));
        vi.restoreAllMocks();

        const { reachable, total } = explorableShare(map);
        if (total === 0) continue; // 100% by definition, as calculateGridWalkRewards has it
        expect(reachable / total, `${zone} map ${step}`).toBeGreaterThanOrEqual(0.6);
      }
      expect(seen.size, `${zone} has more than twenty maps`).toBeLessThan(20);
    });
  }
});
