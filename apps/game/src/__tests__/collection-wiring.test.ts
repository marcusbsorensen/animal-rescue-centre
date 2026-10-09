import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The wiring a collection drive depends on, asserted against the source.
 *
 * `GameScene` and `PtvDriveScene` have no unit tests — Phaser probes a
 * canvas the moment either of them is imported — so the things here are
 * checked the way `ui/__tests__/animal-scale-wiring.test.ts` checks its
 * own: by reading the file. That buys less than a running scene would,
 * and it buys the one thing that matters most about this feature, which
 * is that three decisions stay decided.
 *
 * Each of these is a line somebody would plausibly "tidy" into a bug:
 *
 * 1. **Every arrival kind has somewhere to arrive.** A destination whose
 *    `arrival` has no `case` falls through to a toast, which is the
 *    "Drive to X coming soon!" defect the arrival switch was written to
 *    end. Adding a kind and forgetting the case is how it comes back.
 * 2. **A collection goes out with an empty bed.** `cargo`'s presence is
 *    what opens the loading screen, and `setOffFromLoading` refuses to
 *    depart with nobody aboard — so handing a collection the shelter's
 *    animals would ask a child to load the cat she already has into a
 *    van driving away from her, and refuse to leave until she did.
 * 3. **Nobody is seated for her.** The crate she travels in is the whole
 *    choice the screen exists to offer; preloading her would make it a
 *    control with no consequence.
 */

const SRC = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const GAME_SCENE = read('scenes/GameScene.ts');
const DRIVE_SCENE = read('scenes/PtvDriveScene.ts');
const DESTINATIONS = fs.readFileSync(
  path.join(SRC, '../../../packages/game-logic/src/destinations.ts'),
  'utf8',
);

/**
 * The `ArrivalKind` union's members, read off the type itself.
 *
 * The line comments come off first, and that is not tidiness: one of
 * them is "the centre itself; arriving is going home", and a split on
 * the semicolon that ends the type found that one instead — so the
 * union read as a single member and every assertion below passed by
 * checking nothing.
 */
function arrivalKinds(): string[] {
  const block = DESTINATIONS
    .split('export type ArrivalKind =')[1]
    ?.replace(/\/\/[^\n]*/g, '')
    .split(';')[0] ?? '';
  return [...block.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
}

describe('arrival kinds', () => {
  it('reads more than one kind off the type', () => {
    // If this fails the regex has stopped finding the union and every
    // assertion below it has quietly stopped checking anything.
    expect(arrivalKinds().length).toBeGreaterThan(4);
  });

  it('includes the one inbound kind', () => {
    expect(arrivalKinds()).toContain('collection');
  });

  it('gives every kind a case in handleArrival', () => {
    const switchBody = GAME_SCENE
      .split('private handleArrival(): void {')[1]
      ?.split('private applyArrivalComfort')[0] ?? '';
    expect(switchBody).not.toBe('');
    for (const kind of arrivalKinds()) {
      expect(switchBody).toContain(`case '${kind}':`);
    }
  });
});

describe('the collection drive', () => {
  it('sets off with an empty cargo list', () => {
    const body = GAME_SCENE
      .split('private driveToCollect(')[1]
      ?.split('\n  }')[0] ?? '';
    expect(body).not.toBe('');
    expect(body).toMatch(/cargo:\s*\[\]/);
    expect(body).toMatch(/collect:\s*collected/);
  });

  it('spawns the animal when the van leaves, not when the phone rings', () => {
    // An id on the save for an animal who has not been collected is an
    // id `syncNextId` cannot see and could hand out to somebody else.
    const body = GAME_SCENE
      .split('private driveToCollect(')[1]
      ?.split('\n  }')[0] ?? '';
    expect(body).toContain('spawnAnimal(call.species');
  });

  it('admits her before the journey is scored', () => {
    // `applyArrivalComfort` and `rewardSafeDrive` both resolve animals
    // out of `store.animals` by id, so an admission after them scores
    // an empty van.
    const handle = GAME_SCENE
      .split('private handleArrival(): void {')[1]
      ?.split('private applyArrivalComfort')[0] ?? '';
    const admit = handle.indexOf('admitCollection(');
    const comfort = handle.indexOf('this.applyArrivalComfort(');
    expect(admit).toBeGreaterThan(-1);
    expect(comfort).toBeGreaterThan(-1);
    expect(admit).toBeLessThan(comfort);
  });

  it('opens the loading screen at the pickup with nobody seated', () => {
    const body = DRIVE_SCENE
      .split('private beginCollectionLoad(')[1]
      ?.split('\n  }')[0] ?? '';
    expect(body).not.toBe('');
    // The third argument to `createLoadingSession` is the preload list,
    // and an empty one is what leaves her in the tray for the child to
    // pick up herself.
    expect(body).toMatch(/createLoadingSession\(this\.vehicleId, this\.loadableCargo\(\), \[\]\)/);
    expect(body).toMatch(/this\.preloadIds = \[\]/);
    expect(body).toMatch(/this\.phase = 'loading'/);
  });

  it('ends the drive when the homeward load sets off', () => {
    // On every other drive "Let's go!" moves to the forecourt and the
    // road. Here the road is behind her: the grid goes home instead.
    const body = DRIVE_SCENE
      .split('private setOffFromLoading(')[1]
      ?.split('\n  }')[0] ?? '';
    expect(body).toMatch(/if \(this\.collect\) \{ this\.finishArrival\(\); return; \}/);
  });
});
