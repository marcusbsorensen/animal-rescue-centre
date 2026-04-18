import { describe, it, expect, beforeEach } from 'vitest';
import type { DepotState, PlacedDecoration } from '@arc/shared-types';
import {
  placeDecoration,
  removeDecoration,
  moveDecoration,
  getRoomDecorations,
  getAvailableDecorationCounts,
  syncPlacedDecorationId,
} from '../decorations';

function makeDepot(decorations: Record<string, number> = {}): DepotState {
  return {
    sessionsRemainingToday: 3,
    sessionsMaxToday: 3,
    lastSessionDay: '',
    totalSessionsPlayed: 0,
    inventory: {
      parts: {},
      tools: {},
      treats: {},
      superTreats: {},
      decorations,
      medicalSupplies: {},
    },
  };
}

describe('placeDecoration', () => {
  beforeEach(() => syncPlacedDecorationId([]));

  it('consumes one from inventory and appends to placed list', () => {
    const depot = makeDepot({ flower_pot: 3 });
    const result = placeDecoration([], depot, 'flower_pot', 'room-cat', 0.5, 0.5);

    expect(result).not.toBeNull();
    expect(result!.placed).toHaveLength(1);
    expect(result!.placed[0].code).toBe('flower_pot');
    expect(result!.placed[0].roomId).toBe('room-cat');
    expect(result!.placed[0].x).toBe(0.5);
    expect(result!.placed[0].y).toBe(0.5);
    expect(result!.depot.inventory.decorations.flower_pot).toBe(2);
  });

  it('returns null when inventory has none of that code', () => {
    const depot = makeDepot({ flower_pot: 0 });
    expect(placeDecoration([], depot, 'flower_pot', 'room-cat', 0.5, 0.5)).toBeNull();
  });

  it('returns null when code is absent from inventory', () => {
    const depot = makeDepot({});
    expect(placeDecoration([], depot, 'flower_pot', 'room-cat', 0.5, 0.5)).toBeNull();
  });

  it('clamps out-of-range coordinates to [0, 1]', () => {
    const depot = makeDepot({ bunting: 1 });
    const result = placeDecoration([], depot, 'bunting', 'room-cat', -0.5, 2.5);
    expect(result!.placed[0].x).toBe(0);
    expect(result!.placed[0].y).toBe(1);
  });

  it('gives each placement a unique id', () => {
    const depot = makeDepot({ flower_pot: 3 });
    let state: { placed: PlacedDecoration[]; depot: DepotState } = {
      placed: [],
      depot,
    };
    for (let i = 0; i < 3; i += 1) {
      state = placeDecoration(state.placed, state.depot, 'flower_pot', 'room-cat', 0.1 * i, 0.1 * i)!;
    }
    const ids = state.placed.map((d) => d.id);
    expect(new Set(ids).size).toBe(3);
    expect(state.depot.inventory.decorations.flower_pot).toBe(0);
  });

  it('does not mutate inputs', () => {
    const placed: PlacedDecoration[] = [];
    const depot = makeDepot({ flower_pot: 1 });
    const frozenDepot = JSON.parse(JSON.stringify(depot));
    placeDecoration(placed, depot, 'flower_pot', 'room-cat', 0.5, 0.5);
    expect(placed).toHaveLength(0);
    expect(depot.inventory.decorations.flower_pot).toBe(frozenDepot.inventory.decorations.flower_pot);
  });
});

describe('removeDecoration', () => {
  beforeEach(() => syncPlacedDecorationId([]));

  it('removes the placed item and restores inventory', () => {
    const depot = makeDepot({ flower_pot: 0 });
    const placed: PlacedDecoration[] = [
      { id: 'deco-1', code: 'flower_pot', roomId: 'room-cat', x: 0.5, y: 0.5, placedAt: '2026-01-01T00:00:00Z' },
    ];
    const result = removeDecoration(placed, depot, 'deco-1');
    expect(result).not.toBeNull();
    expect(result!.placed).toHaveLength(0);
    expect(result!.depot.inventory.decorations.flower_pot).toBe(1);
  });

  it('returns null for unknown id', () => {
    const depot = makeDepot({ flower_pot: 0 });
    const result = removeDecoration([], depot, 'deco-999');
    expect(result).toBeNull();
  });

  it('restores inventory even if that code was absent', () => {
    const depot = makeDepot({});
    const placed: PlacedDecoration[] = [
      { id: 'deco-1', code: 'bunting', roomId: 'room-dog', x: 0.2, y: 0.8, placedAt: '2026-01-01T00:00:00Z' },
    ];
    const result = removeDecoration(placed, depot, 'deco-1');
    expect(result!.depot.inventory.decorations.bunting).toBe(1);
  });
});

describe('moveDecoration', () => {
  it('updates the coordinates and clamps out-of-range', () => {
    const placed: PlacedDecoration[] = [
      { id: 'deco-1', code: 'bunting', roomId: 'room-cat', x: 0.5, y: 0.5, placedAt: '' },
    ];
    const result = moveDecoration(placed, 'deco-1', 1.5, -0.2);
    expect(result).not.toBeNull();
    expect(result![0].x).toBe(1);
    expect(result![0].y).toBe(0);
  });

  it('returns null for unknown id', () => {
    expect(moveDecoration([], 'deco-999', 0.5, 0.5)).toBeNull();
  });
});

describe('getRoomDecorations', () => {
  it('filters by roomId', () => {
    const placed: PlacedDecoration[] = [
      { id: 'deco-1', code: 'a', roomId: 'room-cat', x: 0, y: 0, placedAt: '' },
      { id: 'deco-2', code: 'b', roomId: 'room-dog', x: 0, y: 0, placedAt: '' },
      { id: 'deco-3', code: 'c', roomId: 'room-cat', x: 0, y: 0, placedAt: '' },
    ];
    expect(getRoomDecorations(placed, 'room-cat')).toHaveLength(2);
    expect(getRoomDecorations(placed, 'room-dog')).toHaveLength(1);
    expect(getRoomDecorations(placed, 'room-fox')).toHaveLength(0);
  });
});

describe('getAvailableDecorationCounts', () => {
  it('returns only codes with positive counts', () => {
    const depot = makeDepot({ flower_pot: 3, bunting: 0, fairy_lights: 1 });
    const result = getAvailableDecorationCounts(depot);
    expect(result).toEqual({ flower_pot: 3, fairy_lights: 1 });
    expect(result.bunting).toBeUndefined();
  });
});

describe('syncPlacedDecorationId', () => {
  it('resumes id counter above the highest existing id', () => {
    const placed: PlacedDecoration[] = [
      { id: 'deco-5', code: 'a', roomId: 'room-cat', x: 0, y: 0, placedAt: '' },
      { id: 'deco-12', code: 'b', roomId: 'room-cat', x: 0, y: 0, placedAt: '' },
      { id: 'deco-3', code: 'c', roomId: 'room-cat', x: 0, y: 0, placedAt: '' },
    ];
    syncPlacedDecorationId(placed);

    const depot = makeDepot({ flower_pot: 1 });
    const result = placeDecoration([], depot, 'flower_pot', 'room-cat', 0, 0);
    expect(result!.placed[0].id).toBe('deco-13');
  });

  it('starts at 1 when there are no existing items', () => {
    syncPlacedDecorationId([]);
    const depot = makeDepot({ flower_pot: 1 });
    const result = placeDecoration([], depot, 'flower_pot', 'room-cat', 0, 0);
    expect(result!.placed[0].id).toBe('deco-1');
  });
});
