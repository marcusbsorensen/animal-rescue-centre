/**
 * Crate-stacking — the core mechanic of the PTV (Pet Transport
 * Vehicle) system. Animals loaded into a vehicle's crate grid react
 * to their orthogonal neighbours. Teaches prey/predator awareness,
 * species welfare, and spatial planning.
 *
 * NOT to be confused with Supply Runs (supply-runs.ts), which are
 * cargo-FREE chaos drives for coins + stress relief. PTV and Supply
 * Runs share vehicle aesthetics and the coin economy but are
 * different systems — see docs/driving-systems.md.
 *
 * Full mechanic design: docs/ptv-pet-transport-vehicle.md. This
 * module is the pure game-logic layer: the compatibility matrix,
 * arrival-happiness calculation, and helpers for the UI to ask
 * "can I place animal X in this slot?".
 */

import type { Species, Animal } from '@arc/shared-types';

export type CompatibilityLevel = 'happy' | 'stressed' | 'blocked';

/**
 * Symmetric species-to-species compatibility. Indexing either way
 * gives the same answer. See `getCompatibility` for the lookup.
 *
 * - happy:    same-species OR both-calm pairings — small bonus
 * - stressed: tolerated with a happiness penalty on arrival
 * - blocked:  prey/predator pairings the game should warn + refuse to
 *             let the drive start
 */
const MATRIX: Record<Species, Record<Species, CompatibilityLevel>> = {
  cat: {
    cat: 'happy', dog: 'stressed', bunny: 'blocked', fox: 'stressed',
    bat: 'stressed', parrot: 'blocked', snake: 'blocked', hedgehog: 'stressed',
  },
  dog: {
    cat: 'stressed', dog: 'happy', bunny: 'blocked', fox: 'stressed',
    bat: 'blocked', parrot: 'stressed', snake: 'blocked', hedgehog: 'stressed',
  },
  bunny: {
    cat: 'blocked', dog: 'blocked', bunny: 'happy', fox: 'blocked',
    bat: 'stressed', parrot: 'stressed', snake: 'blocked', hedgehog: 'happy',
  },
  fox: {
    cat: 'stressed', dog: 'stressed', bunny: 'blocked', fox: 'happy',
    bat: 'stressed', parrot: 'blocked', snake: 'blocked', hedgehog: 'blocked',
  },
  bat: {
    cat: 'stressed', dog: 'blocked', bunny: 'stressed', fox: 'stressed',
    bat: 'happy', parrot: 'stressed', snake: 'happy', hedgehog: 'stressed',
  },
  parrot: {
    cat: 'blocked', dog: 'stressed', bunny: 'stressed', fox: 'blocked',
    bat: 'stressed', parrot: 'happy', snake: 'blocked', hedgehog: 'stressed',
  },
  snake: {
    cat: 'blocked', dog: 'blocked', bunny: 'blocked', fox: 'blocked',
    bat: 'happy', parrot: 'blocked', snake: 'happy', hedgehog: 'blocked',
  },
  // Prickly, solitary and small. Foxes and snakes predate them (blocked);
  // fellow-gentle bunnies are fine (happy); everyone else merely tense.
  hedgehog: {
    cat: 'stressed', dog: 'stressed', bunny: 'happy', fox: 'blocked',
    bat: 'stressed', parrot: 'stressed', snake: 'blocked', hedgehog: 'happy',
  },
};

/**
 * Look up the compatibility level between two species. Symmetric —
 * (cat, bunny) and (bunny, cat) give the same result.
 */
export function getCompatibility(a: Species, b: Species): CompatibilityLevel {
  return MATRIX[a][b];
}

// ── Crate types ──────────────────────────────────────────────

export type CrateType =
  | 'standard'
  | 'secure'
  | 'quiet'
  | 'ventilated-basket'
  | 'warm-vivarium'
  | 'perch-carrier';

export interface CrateDef {
  id: CrateType;
  label: string;
  emoji: string;
}

export const CRATE_DEFS: Record<CrateType, CrateDef> = {
  'standard':          { id: 'standard',          label: 'Standard crate',    emoji: '📦' },
  'secure':            { id: 'secure',            label: 'Secure crate',      emoji: '🔒' },
  'quiet':             { id: 'quiet',             label: 'Quiet crate',       emoji: '🌙' },
  'ventilated-basket': { id: 'ventilated-basket', label: 'Wicker basket',     emoji: '🧺' },
  'warm-vivarium':     { id: 'warm-vivarium',     label: 'Warm vivarium',     emoji: '🟨' },
  'perch-carrier':     { id: 'perch-carrier',     label: 'Perch carrier',     emoji: '🪺' },
};

/**
 * Returns the best-fit crates for a species — ordered preference.
 * First entry is the "right crate" that gives a small happiness bonus;
 * other entries are tolerated; anything NOT in the list is "wrong crate"
 * and gives a happiness penalty on arrival.
 */
const CRATE_PREFERENCE: Record<Species, CrateType[]> = {
  cat:    ['standard', 'ventilated-basket', 'quiet'],
  dog:    ['standard', 'secure'],
  bunny:  ['ventilated-basket', 'standard'],
  fox:    ['secure', 'standard'],
  bat:    ['quiet'],                // required
  parrot: ['perch-carrier'],        // required
  snake:  ['warm-vivarium'],        // required
  hedgehog: ['ventilated-basket', 'quiet', 'standard'],
};

export function getPreferredCrates(species: Species): CrateType[] {
  return CRATE_PREFERENCE[species];
}

export function isCrateSuitable(species: Species, crate: CrateType): boolean {
  return CRATE_PREFERENCE[species].includes(crate);
}

// ── Vehicles ─────────────────────────────────────────────────

export type VehicleType =
  | 'pedal-trike'
  | 'small-van'
  | 'long-van'
  | 'animal-lorry'
  | 'electric-minibus';

export interface VehicleDef {
  id: VehicleType;
  name: string;
  slots: number;
  cols: number;
  rows: number;
  fuelCost: number;   // coins per drive
  unlockLevel: number;
}

export const VEHICLE_DEFS: Record<VehicleType, VehicleDef> = {
  'pedal-trike':      { id: 'pedal-trike',      name: 'Trikey',    slots: 2, cols: 1, rows: 2, fuelCost: 0,  unlockLevel: 0  },
  'small-van':        { id: 'small-van',        name: 'Henry',     slots: 4, cols: 2, rows: 2, fuelCost: 5,  unlockLevel: 2  },
  'long-van':         { id: 'long-van',         name: 'Bea',       slots: 6, cols: 3, rows: 2, fuelCost: 10, unlockLevel: 5  },
  'animal-lorry':     { id: 'animal-lorry',     name: 'Big Tilly', slots: 9, cols: 3, rows: 3, fuelCost: 20, unlockLevel: 10 },
  'electric-minibus': { id: 'electric-minibus', name: 'Spark',     slots: 6, cols: 3, rows: 2, fuelCost: 5,  unlockLevel: 12 },
};

export function getAvailableVehicles(playerLevel: number): VehicleDef[] {
  return Object.values(VEHICLE_DEFS).filter((v) => v.unlockLevel <= playerLevel);
}

// ── Grid + adjacency ─────────────────────────────────────────

/**
 * A crate loaded at a grid slot. The slot index is row-major starting
 * at 0 (top-left), so index = row * cols + col.
 */
export interface LoadedCrate {
  slotIndex: number;
  animalId: string;
  species: Species;
  crateType: CrateType;
}

export interface CrateGrid {
  vehicle: VehicleType;
  cols: number;
  rows: number;
  crates: LoadedCrate[];
}

/**
 * Return N/S/E/W neighbour slot indices for a given slot in a grid.
 * Diagonals intentionally excluded — animals only react to orthogonal
 * neighbours (matches the "side-by-side in crates" physical reality).
 */
export function neighbourIndices(slotIndex: number, cols: number, rows: number): number[] {
  const r = Math.floor(slotIndex / cols);
  const c = slotIndex % cols;
  const out: number[] = [];
  if (r > 0)        out.push((r - 1) * cols + c);
  if (r < rows - 1) out.push((r + 1) * cols + c);
  if (c > 0)        out.push(r * cols + (c - 1));
  if (c < cols - 1) out.push(r * cols + (c + 1));
  return out;
}

/**
 * For a hypothetical placement of animal X in slot S on grid G, return
 * the worst compatibility violation (if any) with current neighbours.
 * 'blocked' trumps 'stressed' trumps 'happy'. Useful for UI previews.
 */
export function previewPlacement(
  grid: CrateGrid,
  slotIndex: number,
  species: Species,
): CompatibilityLevel {
  let worst: CompatibilityLevel = 'happy';
  for (const n of neighbourIndices(slotIndex, grid.cols, grid.rows)) {
    const neighbour = grid.crates.find((c) => c.slotIndex === n);
    if (!neighbour) continue;
    const level = getCompatibility(species, neighbour.species);
    if (level === 'blocked') return 'blocked';
    if (level === 'stressed' && worst === 'happy') worst = 'stressed';
  }
  return worst;
}

/** Is the grid OK to drive? Any 'blocked' violation blocks departure. */
export function isDriveable(grid: CrateGrid): boolean {
  for (const crate of grid.crates) {
    const level = previewPlacement({ ...grid, crates: grid.crates.filter((c) => c !== crate) }, crate.slotIndex, crate.species);
    if (level === 'blocked') return false;
  }
  return true;
}

/** Count the stressed adjacencies in the whole grid. */
export function countStressedAdjacencies(grid: CrateGrid): number {
  let count = 0;
  const seen = new Set<string>();
  for (const crate of grid.crates) {
    for (const n of neighbourIndices(crate.slotIndex, grid.cols, grid.rows)) {
      const neighbour = grid.crates.find((c) => c.slotIndex === n);
      if (!neighbour) continue;
      const key = [crate.slotIndex, n].sort().join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      if (getCompatibility(crate.species, neighbour.species) === 'stressed') count++;
    }
  }
  return count;
}

// ── Arrival happiness ────────────────────────────────────────

/**
 * Compute the delta to each animal's happiness after a drive. Applies
 * adjacency penalties/bonuses + crate-fit penalties/bonuses. The
 * caller applies the returned delta to the animal's happiness field.
 */
export function calculateArrivalHappinessDelta(
  grid: CrateGrid,
  animalsById: Map<string, Animal>,
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const crate of grid.crates) {
    let delta = 0;
    // Crate fit
    if (isCrateSuitable(crate.species, crate.crateType)) {
      delta += 3;
    } else {
      delta -= 10;
    }
    // Adjacency
    for (const n of neighbourIndices(crate.slotIndex, grid.cols, grid.rows)) {
      const neighbour = grid.crates.find((c) => c.slotIndex === n);
      if (!neighbour) continue;
      const level = getCompatibility(crate.species, neighbour.species);
      if (level === 'blocked')  delta -= 15;
      if (level === 'stressed') delta -= 5;
      if (level === 'happy' && crate.species === neighbour.species) delta += 1;
    }
    deltas.set(crate.animalId, delta);
    // Unused for now but kept for future "recovering animal near dog" bonuses
    void animalsById;
  }
  return deltas;
}
