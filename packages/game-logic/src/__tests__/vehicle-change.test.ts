import { describe, it, expect } from 'vitest';
import {
  VEHICLES_BY_ROOM,
  changeVehicle,
  vehicleNeighbours,
} from '../vehicle-change';
import {
  aboard,
  bestCrateFor,
  canSetOff,
  createLoadingSession,
  emptyGridFor,
  holdFromTray,
  waitingToBoard,
  type LoadableAnimal,
  type LoadingSession,
} from '../crate-loading';
import { VEHICLE_DEFS, type LoadedCrate, type VehicleType } from '../crate-stacking';

const FLEET = Object.keys(VEHICLE_DEFS) as VehicleType[];

/** Eight cats. All the same species, so any seating is a happy one. */
const CATS: LoadableAnimal[] = ['Tiger', 'Marble', 'Pumpkin', 'Ziggy', 'Juniper', 'Pip', 'Luna', 'Biscuit']
  .map((name, i) => ({ id: `cat-${i}`, name, species: 'cat' as const }));

const LUNA: LoadableAnimal = { id: 'luna', name: 'Luna', species: 'cat' };
const CLOVER: LoadableAnimal = { id: 'clover', name: 'Clover', species: 'bunny' };

/**
 * A session with these animals in exactly these slots. `null` leaves a
 * slot empty. Anybody offered but not seated is waiting in the tray.
 */
function sitting(
  vehicle: VehicleType,
  seats: Array<LoadableAnimal | null>,
  waiting: LoadableAnimal[] = [],
): LoadingSession {
  const crates: LoadedCrate[] = [];
  seats.forEach((animal, slotIndex) => {
    if (!animal) return;
    crates.push({
      slotIndex,
      animalId: animal.id,
      species: animal.species,
      crateType: bestCrateFor(animal.species),
    });
  });
  const offered = [...seats.filter((a): a is LoadableAnimal => a !== null), ...waiting];
  return { grid: { ...emptyGridFor(vehicle), crates }, offered, heldId: null };
}

const slotOf = (session: LoadingSession, id: string) =>
  session.grid.crates.find((c) => c.animalId === id)?.slotIndex;
const namesOf = (animals: LoadableAnimal[]) => animals.map((a) => a.name);

describe('the order of the fleet', () => {
  it('runs from the fewest spaces to the most, every vehicle once', () => {
    expect([...VEHICLES_BY_ROOM]).toEqual([
      'pedal-trike', 'small-van', 'long-van', 'electric-minibus', 'animal-lorry',
    ]);
    expect(new Set(VEHICLES_BY_ROOM).size).toBe(FLEET.length);
    const named = VEHICLES_BY_ROOM.map((id) => VEHICLE_DEFS[id].name);
    expect(named).toEqual(['Trikey', 'Henry', 'Bea', 'Spark', 'Big Tilly']);
  });

  it('never gets smaller going right, and breaks the Bea and Spark tie by unlock level', () => {
    const slots = VEHICLES_BY_ROOM.map((id) => VEHICLE_DEFS[id].slots);
    expect(slots).toEqual([2, 4, 6, 6, 8]);
    expect(VEHICLE_DEFS['long-van'].unlockLevel).toBeLessThan(VEHICLE_DEFS['electric-minibus'].unlockLevel);
  });
});

describe('vehicleNeighbours', () => {
  it('names the bay either side', () => {
    expect(vehicleNeighbours('pedal-trike')).toEqual({ fewer: null, more: 'small-van' });
    expect(vehicleNeighbours('small-van')).toEqual({ fewer: 'pedal-trike', more: 'long-van' });
    expect(vehicleNeighbours('long-van')).toEqual({ fewer: 'small-van', more: 'electric-minibus' });
    expect(vehicleNeighbours('electric-minibus')).toEqual({ fewer: 'long-van', more: 'animal-lorry' });
    expect(vehicleNeighbours('animal-lorry')).toEqual({ fewer: 'electric-minibus', more: null });
  });

  it('does not wrap: the ends are ends', () => {
    // Walking right from the smallest reaches the biggest and then
    // stops; walking left from the biggest does the same the other way.
    const right: VehicleType[] = ['pedal-trike'];
    for (let n = vehicleNeighbours(right[0]).more; n; n = vehicleNeighbours(n).more) right.push(n);
    expect(right).toEqual([...VEHICLES_BY_ROOM]);

    const left: VehicleType[] = ['animal-lorry'];
    for (let n = vehicleNeighbours(left[0]).fewer; n; n = vehicleNeighbours(n).fewer) left.push(n);
    expect(left).toEqual([...VEHICLES_BY_ROOM].reverse());
  });

  it('leaves out what the player has not unlocked', () => {
    // Henry L2, Bea L5, Big Tilly L10, Spark L12.
    expect(vehicleNeighbours('small-van', 2).more).toBeNull();
    expect(vehicleNeighbours('long-van', 5)).toEqual({ fewer: 'small-van', more: null });
    // At level 10 Spark is still locked, so Bea steps straight to the lorry.
    expect(vehicleNeighbours('long-van', 10).more).toBe('animal-lorry');
    expect(vehicleNeighbours('animal-lorry', 10).fewer).toBe('long-van');
    expect(vehicleNeighbours('pedal-trike', 0)).toEqual({ fewer: null, more: null });
  });

  it('always includes the vehicle she is in, however she got there', () => {
    expect(vehicleNeighbours('animal-lorry', 0)).toEqual({ fewer: 'pedal-trike', more: null });
  });
});

describe('changeVehicle', () => {
  it('does nothing when the vehicle is the same', () => {
    const session = sitting('small-van', [CATS[0], CATS[1]]);
    const out = changeVehicle(session, 'small-van');
    expect(out.session).toBe(session);
    expect(out.returned).toEqual([]);
    expect(out.message).toBeNull();
    expect(namesOf(out.kept)).toEqual(['Tiger', 'Marble']);
  });

  it('opens an empty vehicle at its own size, with nothing to say', () => {
    const out = changeVehicle(sitting('small-van', [], CATS.slice(0, 3)), 'animal-lorry');
    expect(out.session.grid).toMatchObject({ vehicle: 'animal-lorry', cols: 2, rows: 4, crates: [] });
    expect(out.message).toBeNull();
    // The animals were in the tray and they are still in the tray.
    expect(namesOf(waitingToBoard(out.session))).toEqual(['Tiger', 'Marble', 'Pumpkin']);
  });

  it('moves nobody and says nothing when the new vehicle is bigger and the same shape', () => {
    // Bea (2x3) holds six; Spark is the same shape and Big Tilly adds a row.
    const full = sitting('long-van', CATS.slice(0, 6));
    for (const to of ['electric-minibus', 'animal-lorry'] as VehicleType[]) {
      const out = changeVehicle(full, to);
      expect(out.message, to).toBeNull();
      expect(out.returned, to).toEqual([]);
      for (let slot = 0; slot < 6; slot += 1) {
        expect(slotOf(out.session, CATS[slot].id), `${to} slot ${slot}`).toBe(slot);
      }
    }
  });

  it('keeps each animal in the same row and column going from the trike to Henry', () => {
    // The trike is one wide: slot 1 is the second row. Henry is two
    // wide, so the same place is slot 2 — and not slot 1, which would
    // put her beside her neighbour instead of below her.
    const out = changeVehicle(sitting('pedal-trike', [CATS[0], CATS[1]]), 'small-van');
    expect(out.message).toBeNull();
    expect(slotOf(out.session, CATS[0].id)).toBe(0);
    expect(slotOf(out.session, CATS[1].id)).toBe(2);
  });

  it('keeps what fits in grid order and returns the rest, naming them', () => {
    // Spark holds six; Henry holds four. The last two in the grid wait.
    const out = changeVehicle(sitting('electric-minibus', CATS.slice(0, 6)), 'small-van');
    expect(namesOf(out.kept)).toEqual(['Tiger', 'Marble', 'Pumpkin', 'Ziggy']);
    expect(namesOf(out.returned)).toEqual(['Juniper', 'Pip']);
    expect(out.message).toBe('Henry has 4 spaces, so Juniper and Pip are waiting to board again.');
    // Those who stayed did not move.
    for (let slot = 0; slot < 4; slot += 1) {
      expect(slotOf(out.session, CATS[slot].id)).toBe(slot);
    }
  });

  it('puts the trike\'s 1x2 first in line: the first two stay and everyone else waits', () => {
    const out = changeVehicle(sitting('animal-lorry', CATS.slice(0, 8)), 'pedal-trike');
    expect(out.session.grid).toMatchObject({ vehicle: 'pedal-trike', cols: 1, rows: 2 });
    expect(namesOf(out.kept)).toEqual(['Tiger', 'Marble']);
    expect(namesOf(out.returned)).toEqual(['Pumpkin', 'Ziggy', 'Juniper', 'Pip', 'Luna', 'Biscuit']);
    expect(out.message).toBe(
      'Trikey has 2 spaces, so Pumpkin, Ziggy, Juniper, Pip, Luna and Biscuit are waiting to board again.',
    );
    // Row 0, column 0 stays where it was; the animal that sat beside her
    // takes the only other space the trike has.
    expect(slotOf(out.session, CATS[0].id)).toBe(0);
    expect(slotOf(out.session, CATS[1].id)).toBe(1);
  });

  it('says "is" for one animal and "are" for several', () => {
    const one = changeVehicle(sitting('small-van', CATS.slice(0, 3)), 'pedal-trike');
    expect(namesOf(one.returned)).toEqual(['Pumpkin']);
    expect(one.message).toBe('Trikey has 2 spaces, so Pumpkin is waiting to board again.');
  });

  it('puts the animals it returns back on the pavement, and loses nobody', () => {
    const session = sitting('animal-lorry', CATS.slice(0, 7), [CATS[7]]);
    const out = changeVehicle(session, 'long-van');
    const everyone = new Set(out.session.offered.map((a) => a.id));
    expect(everyone.size).toBe(8);
    expect(out.session.offered).toEqual(session.offered);
    expect(namesOf(waitingToBoard(out.session))).toEqual(['Luna', 'Biscuit']);
    // Aboard plus returned is exactly who was aboard.
    expect([...out.kept, ...out.returned].map((a) => a.id).sort())
      .toEqual(aboard(session).map((a) => a.id).sort());
  });

  it('leaves the animal in her hands in her hands', () => {
    let session = sitting('long-van', CATS.slice(0, 5), [CATS[5]]);
    session = holdFromTray(session, CATS[5].id);
    const out = changeVehicle(session, 'pedal-trike');
    expect(out.session.heldId).toBe(CATS[5].id);
    expect(waitingToBoard(out.session).map((a) => a.id)).not.toContain(CATS[5].id);
  });

  it('does not edit the session it was given', () => {
    const session = sitting('animal-lorry', CATS.slice(0, 8));
    const before = JSON.stringify(session);
    changeVehicle(session, 'pedal-trike');
    expect(JSON.stringify(session)).toBe(before);
  });

  it('takes the lowest empty space for an animal whose own place has gone', () => {
    // Bea's third row has no place in Henry, so the animal in it moves up.
    const session = sitting('long-van', [CATS[0], null, CATS[2], null, CATS[4], null]);
    const out = changeVehicle(session, 'small-van');
    expect(out.message).toBeNull();
    expect(slotOf(out.session, CATS[0].id)).toBe(0);
    expect(slotOf(out.session, CATS[2].id)).toBe(2);
    expect(slotOf(out.session, CATS[4].id)).toBe(1);
  });

  it('never sits an animal next to somebody who frightens her', () => {
    // In Henry the cat and the bunny sit on a diagonal, which is allowed.
    // The trike is one wide, so any two animals in it are neighbours, and
    // the bunny has nowhere to go that is not beside the cat.
    const session = sitting('small-van', [null, CLOVER, LUNA, null]);
    expect(canSetOff(session)).toBe(true);

    const out = changeVehicle(session, 'pedal-trike');
    expect(namesOf(out.kept)).toEqual(['Luna']);
    expect(namesOf(out.returned)).toEqual(['Clover']);
    expect(canSetOff(out.session)).toBe(true);
    // The sentence the screen already uses for the pair, then what it means.
    expect(out.message).toBe(
      'Luna the cat makes Clover the bunny frightened. They cannot sit next to each other. '
      + 'There is no other space in Trikey for Clover, so Clover is waiting to board again.',
    );
  });

  it('keeps a drivable load drivable across every pair of vehicles', () => {
    // A mixed cast, seated the way the screen would seat them: each in the
    // first space that frightens nobody. Then every move from every
    // vehicle to every other must leave nobody beside somebody who
    // frightens them, nobody in two places and nobody outside the grid.
    const CAST: LoadableAnimal[] = [
      { id: 'a', name: 'Tiger', species: 'cat' },
      { id: 'b', name: 'Clover', species: 'bunny' },
      { id: 'c', name: 'Buddy', species: 'dog' },
      { id: 'd', name: 'Truffle', species: 'hedgehog' },
      { id: 'e', name: 'Echo', species: 'bat' },
      { id: 'f', name: 'Noodle', species: 'snake' },
      { id: 'g', name: 'Skye', species: 'parrot' },
      { id: 'h', name: 'Rusty', species: 'fox' },
    ];
    const ids = CAST.map((a) => a.id);
    for (const from of FLEET) {
      for (const order of [ids, [...ids].reverse(), [ids[3], ids[1], ids[4], ids[0], ids[2]]]) {
        const start = createLoadingSession(from, CAST, order);
        expect(canSetOff(start), `${from} start`).toBe(true);
        for (const to of FLEET) {
          const out = changeVehicle(start, to);
          const label = `${from} -> ${to}`;
          const capacity = VEHICLE_DEFS[to].slots;
          expect(canSetOff(out.session), label).toBe(true);
          const seats = out.session.grid.crates.map((c) => c.slotIndex);
          expect(new Set(seats).size, label).toBe(seats.length);
          expect(seats.every((s) => s >= 0 && s < capacity), label).toBe(true);
          const kept = out.kept.map((a) => a.id);
          const returned = out.returned.map((a) => a.id);
          expect(kept.filter((id) => returned.includes(id)), label).toEqual([]);
          expect([...kept, ...returned].sort(), label)
            .toEqual(aboard(start).map((a) => a.id).sort());
          expect(out.message === null, label).toBe(returned.length === 0);
        }
      }
    }
  });
});
