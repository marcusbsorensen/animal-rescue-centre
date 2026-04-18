/**
 * Decoration placement — pure logic for placing earned decorations in
 * species rooms. Decorations are earned via the `decorations` depot
 * mode (see depot-inventory.ts); once in the player's inventory, they
 * can be placed in any species room at any fractional position.
 *
 * Storage shape lives on `GameState.placedDecorations` (shared-types).
 * The depot inventory tracks quantities per-code in DepotState.
 *
 * The player's flow is:
 *   1. Win decorations in the depot minigame -> quantity in inventory
 *   2. Open "Decorate" in a species room -> pick from inventory
 *   3. Tap to place -> inventory decrements, placedDecorations grows
 *   4. Long-press placed -> remove (inventory regains it)
 *
 * All functions here are pure — no IO, no mutation of inputs.
 */

import type { PlacedDecoration, DepotState } from '@arc/shared-types';

// Monotonic id generator. Restored from persisted state on load via
// syncPlacedDecorationId below — same pattern as animals.ts.
let nextId = 1;

export function syncPlacedDecorationId(existing: PlacedDecoration[]): void {
  let maxNum = 0;
  for (const d of existing) {
    const m = /^deco-(\d+)$/.exec(d.id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  nextId = maxNum + 1;
}

/**
 * Place a decoration in a room. Returns null if the player doesn't
 * have any of that code in their depot inventory, otherwise the
 * updated state tuple {placed, depot}.
 */
export function placeDecoration(
  placed: PlacedDecoration[],
  depot: DepotState,
  code: string,
  roomId: string,
  x: number,
  y: number,
): { placed: PlacedDecoration[]; depot: DepotState } | null {
  const current = depot.inventory.decorations[code] ?? 0;
  if (current <= 0) return null;

  // Clamp coordinates to [0, 1] so we can't place off-canvas
  const cx = Math.max(0, Math.min(1, x));
  const cy = Math.max(0, Math.min(1, y));

  const newDeco: PlacedDecoration = {
    id: 'deco-' + nextId++,
    code,
    roomId,
    x: cx,
    y: cy,
    placedAt: new Date().toISOString(),
  };

  const nextDepot: DepotState = {
    ...depot,
    inventory: {
      ...depot.inventory,
      decorations: {
        ...depot.inventory.decorations,
        [code]: current - 1,
      },
    },
  };

  return {
    placed: [...placed, newDeco],
    depot: nextDepot,
  };
}

/**
 * Remove a placed decoration by id. Returns the updated tuple with
 * the decoration's quantity restored to the depot inventory. Returns
 * null if the id isn't in the placed list.
 */
export function removeDecoration(
  placed: PlacedDecoration[],
  depot: DepotState,
  id: string,
): { placed: PlacedDecoration[]; depot: DepotState } | null {
  const target = placed.find((d) => d.id === id);
  if (!target) return null;

  const nextDepot: DepotState = {
    ...depot,
    inventory: {
      ...depot.inventory,
      decorations: {
        ...depot.inventory.decorations,
        [target.code]: (depot.inventory.decorations[target.code] ?? 0) + 1,
      },
    },
  };

  return {
    placed: placed.filter((d) => d.id !== id),
    depot: nextDepot,
  };
}

/**
 * Move a placed decoration to new fractional coordinates. Returns
 * null if the id isn't in the placed list.
 */
export function moveDecoration(
  placed: PlacedDecoration[],
  id: string,
  x: number,
  y: number,
): PlacedDecoration[] | null {
  const idx = placed.findIndex((d) => d.id === id);
  if (idx < 0) return null;

  const cx = Math.max(0, Math.min(1, x));
  const cy = Math.max(0, Math.min(1, y));

  const next = [...placed];
  next[idx] = { ...next[idx], x: cx, y: cy };
  return next;
}

/**
 * Filter placed decorations for a given room.
 */
export function getRoomDecorations(
  placed: PlacedDecoration[],
  roomId: string,
): PlacedDecoration[] {
  return placed.filter((d) => d.roomId === roomId);
}

/**
 * Count available decorations (by code) in the depot inventory.
 * Useful for rendering the placement palette.
 */
export function getAvailableDecorationCounts(
  depot: DepotState,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [code, count] of Object.entries(depot.inventory.decorations)) {
    if (count > 0) result[code] = count;
  }
  return result;
}
