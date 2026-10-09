/**
 * vehicle-change.ts
 *
 * Moving from one bay to the next, with animals already aboard.
 *
 * The loading screen is one vehicle zoomed in, with an arrow either side
 * that steps to the next bay along: fewer spaces to the left, more to the
 * right, so a child who finds she has too many animals for the van — or
 * too few for the lorry — can change her mind without starting again.
 * Two questions follow from that, and both are rules rather than
 * drawing, so they live here and not in the view:
 *
 *  1. Which vehicle is next, and is there one? (`vehicleNeighbours`)
 *  2. What becomes of the animals already aboard? (`changeVehicle`)
 *
 * **The second is the one with a person in it.** Going to a smaller
 * vehicle can leave animals with nowhere to sit, and the way that is
 * handled is the whole of how the screen treats her: nothing is lost,
 * nothing is punished, and the animals who are waiting again are named,
 * so she can see exactly what changed and put them back with one tap
 * each. Going to a larger vehicle never moves anybody.
 *
 * Pure and immutable, like everything in `crate-loading.ts` — it takes a
 * session and returns a new one, so the view can draw from a value and a
 * half-applied change cannot exist.
 */

import {
  VEHICLE_DEFS,
  neighbourIndices,
  previewPlacement,
  type CrateGrid,
  type LoadedCrate,
  type VehicleDef,
  type VehicleType,
} from './crate-stacking';
import {
  describePair,
  emptyGridFor,
  aboard,
  animalById,
  type LoadableAnimal,
  type LoadingSession,
} from './crate-loading';

// ── Which bay is next ────────────────────────────────────────

/**
 * The fleet, fewest spaces first.
 *
 * The direction of travel: left is less room and right is more. Two
 * vehicles hold the same number (Bea and Spark, six each), and the tie
 * is broken by unlock level, so the order is the order a child meets
 * them in as she plays and does not depend on how the table happens to
 * be written.
 *
 * Derived from `VEHICLE_DEFS` rather than written out, so a vehicle
 * whose capacity changes moves to its new place by itself.
 */
export const VEHICLES_BY_ROOM: readonly VehicleType[] = (Object.values(VEHICLE_DEFS) as VehicleDef[])
  .slice()
  .sort((a, b) => a.slots - b.slots || a.unlockLevel - b.unlockLevel)
  .map((v) => v.id);

export interface VehicleNeighbours {
  /** The next vehicle with fewer spaces — null at the smallest. */
  fewer: VehicleType | null;
  /** The next vehicle with more spaces — null at the largest. */
  more: VehicleType | null;
}

/**
 * The bays either side of this one.
 *
 * **There is no wrapping.** The ends are ends: a child who has gone as
 * small as the fleet goes finds the arrow dimmed, not the biggest
 * vehicle, so she can always tell which way she has been going and can
 * never be taken somewhere she did not choose.
 *
 * `playerLevel`, where it is given, leaves out the vehicles she has not
 * unlocked: the arrows are for moving between vehicles she could have
 * picked, and a locked one is coned off in the picker for the same
 * reason. The vehicle she is in is always in the list, however it got
 * there.
 */
export function vehicleNeighbours(current: VehicleType, playerLevel?: number): VehicleNeighbours {
  const reachable = VEHICLES_BY_ROOM.filter(
    (id) => id === current || playerLevel === undefined || VEHICLE_DEFS[id].unlockLevel <= playerLevel,
  );
  const at = reachable.indexOf(current);
  if (at < 0) return { fewer: null, more: null };
  return {
    fewer: at > 0 ? reachable[at - 1] : null,
    more: at < reachable.length - 1 ? reachable[at + 1] : null,
  };
}

// ── What happens to the animals aboard ───────────────────────

export interface VehicleChange {
  /** The session in the new vehicle. The input is never edited. */
  session: LoadingSession;
  /** Everybody still aboard, in grid order. */
  kept: LoadableAnimal[];
  /**
   * Everybody who is waiting to board again, in the order they were
   * sitting in the old vehicle. Empty when nobody was left out.
   */
  returned: LoadableAnimal[];
  /**
   * What to tell her, in plain words — null when nobody was returned,
   * because a change that cost nothing has nothing to say.
   */
  message: string | null;
}

/** `Bear`, `Bear and Noodle`, `Bear, Noodle and Pip`. */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The row and column of a slot — the grid is row-major. */
function cellOf(slot: number, cols: number): { row: number; col: number } {
  return { row: Math.floor(slot / cols), col: slot % cols };
}

/**
 * Move the load into another vehicle.
 *
 * **Keep what fits, in grid order, and send the rest back to the
 * pavement.** The animals aboard are read in the order they sit in the
 * old grid — row by row, left to right — and the first of them that the
 * new vehicle has room for stay; the rest are waiting to board again,
 * exactly where they were before they were loaded: in the tray, one tap
 * from being put back.
 *
 * **Nobody moves who does not have to.** An animal whose own row and
 * column exist in the new vehicle sits in the same place in it. That is
 * every animal on every step between the two-wide vehicles, which share
 * one grid shape, so Bea to Spark moves nobody and Henry to Big Tilly
 * only adds rows underneath. Only an animal whose place has gone — the
 * bottom row of Bea when Henry has two — takes the lowest empty space,
 * and only on the one step that changes the number of columns (the
 * trike is one wide and the rest are two) does anyone sit differently
 * to the neighbour they had.
 *
 * **A change never seats anybody next to somebody who frightens them.**
 * Placing animals one at a time through `previewPlacement`, the same
 * check the tap goes through, keeps the rule the screen exists to teach
 * true after a change as well as after a tap. It can only bite across
 * the trike's step, where the neighbours change; an animal it cannot
 * seat is returned with the sentence the screen already uses for that
 * pair, so the reason is a sentence she has met before.
 *
 * The animal in her hands, if any, stays in her hands: she was part of
 * the way through something and the change has no business finishing it.
 */
export function changeVehicle(session: LoadingSession, to: VehicleType): VehicleChange {
  const def = VEHICLE_DEFS[to];
  if (!def || session.grid.vehicle === to) {
    return { session, kept: aboard(session), returned: [], message: null };
  }

  const { cols, rows } = def;
  const capacity = cols * rows;
  const inGridOrder = [...session.grid.crates].sort((a, b) => a.slotIndex - b.slotIndex);
  const hasRoom = inGridOrder.slice(0, capacity);
  const noRoom = inGridOrder.slice(capacity);

  // Those whose own place survives are seated first, so nobody who can
  // stay put is displaced by somebody whose place has gone.
  const staysPut = (c: LoadedCrate) => {
    const { row, col } = cellOf(c.slotIndex, session.grid.cols);
    return col < cols && row < rows;
  };
  const seatingOrder = [...hasRoom.filter(staysPut), ...hasRoom.filter((c) => !staysPut(c))];

  let grid: CrateGrid = emptyGridFor(to);
  const unseated: Array<{ crate: LoadedCrate; blocker?: LoadableAnimal }> = [];

  for (const crate of seatingOrder) {
    const free: number[] = [];
    for (let slot = 0; slot < capacity; slot += 1) {
      if (!grid.crates.some((c) => c.slotIndex === slot)) free.push(slot);
    }
    const own = (() => {
      if (!staysPut(crate)) return undefined;
      const { row, col } = cellOf(crate.slotIndex, session.grid.cols);
      return row * cols + col;
    })();
    const candidates = own !== undefined
      ? [own, ...free.filter((s) => s !== own)]
      : free;

    const slot = candidates.find((s) => previewPlacement(grid, s, crate) !== 'blocked');
    if (slot === undefined) {
      // Name who it is that frightens her, from the first place she
      // would have been put: that is the neighbour the sentence is about.
      const first = candidates[0];
      const neighbour = first === undefined ? undefined : neighbourIndices(first, cols, rows)
        .map((n) => grid.crates.find((c) => c.slotIndex === n))
        .find((c) => c !== undefined
          && previewPlacement({ ...grid, crates: [c] }, first, crate) === 'blocked');
      unseated.push({
        crate,
        blocker: neighbour ? animalById(session, neighbour.animalId) : undefined,
      });
      continue;
    }
    grid = { ...grid, crates: [...grid.crates, { ...crate, slotIndex: slot }] };
  }
  grid = { ...grid, crates: [...grid.crates].sort((a, b) => a.slotIndex - b.slotIndex) };

  const next: LoadingSession = { ...session, grid };

  const oldOrder = new Map(inGridOrder.map((c, i) => [c.animalId, i]));
  const returnedCrates = [...noRoom, ...unseated.map((u) => u.crate)]
    .sort((a, b) => (oldOrder.get(a.animalId) ?? 0) - (oldOrder.get(b.animalId) ?? 0));
  const returned = returnedCrates
    .map((c) => animalById(session, c.animalId))
    .filter((a): a is LoadableAnimal => a !== undefined);

  const sentences: string[] = [];
  const noRoomAnimals = noRoom
    .map((c) => animalById(session, c.animalId))
    .filter((a): a is LoadableAnimal => a !== undefined);
  if (noRoomAnimals.length > 0) {
    const names = noRoomAnimals.map((a) => a.name);
    sentences.push(
      `${def.name} has ${capacity} ${capacity === 1 ? 'space' : 'spaces'}, `
      + `so ${listNames(names)} ${names.length === 1 ? 'is' : 'are'} waiting to board again.`,
    );
  }
  for (const { crate, blocker } of unseated) {
    const animal = animalById(session, crate.animalId);
    if (!animal) continue;
    sentences.push(blocker
      ? `${describePair(animal, blocker).text} There is no other space in ${def.name} for `
        + `${animal.name}, so ${animal.name} is waiting to board again.`
      : `There is no space in ${def.name} where ${animal.name} can sit safely, `
        + `so ${animal.name} is waiting to board again.`);
  }

  return {
    session: next,
    kept: aboard(next),
    returned,
    message: sentences.length > 0 ? sentences.join(' ') : null,
  };
}
