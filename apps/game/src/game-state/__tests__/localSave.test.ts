import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  putLocalSave,
  getLocalSave,
  markLocalSaveSynced,
  putRejectedSave,
  getRejectedSave,
  clearLocalSave,
  isLocalSaveAvailable,
  type LocalSave,
} from '../localSave';

/**
 * The on-device copy of a shelter.
 *
 * Persistence used to be cloud-only, so a save that failed to post existed
 * nowhere. These pin the two properties that make the local copy worth
 * having: it survives a failed request, and it is fenced off per child —
 * one family iPad, several accounts, and no child may ever open another's
 * shelter.
 */

function save(overrides: Partial<LocalSave> = {}): LocalSave {
  return {
    userId: 'child-1',
    state: { animals: [{ id: 1, name: 'Pip' }], totalRescued: 4 },
    level: 3,
    version: 7,
    synced: false,
    savedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('localSave', () => {
  beforeEach(async () => {
    await clearLocalSave('child-1');
    await clearLocalSave('child-2');
  });

  it('is available in a browser with IndexedDB', () => {
    expect(isLocalSaveAvailable()).toBe(true);
  });

  it('round-trips a save', async () => {
    expect(await putLocalSave(save())).toBe(true);
    expect(await getLocalSave('child-1')).toEqual(save());
  });

  it('has nothing for a player who has never saved', async () => {
    expect(await getLocalSave('nobody')).toBeNull();
  });

  it('keeps each child on the iPad separate', async () => {
    await putLocalSave(save({ userId: 'child-1', level: 3 }));
    await putLocalSave(save({ userId: 'child-2', level: 9 }));

    expect((await getLocalSave('child-1'))?.level).toBe(3);
    expect((await getLocalSave('child-2'))?.level).toBe(9);
  });

  it('replaces the previous snapshot rather than accumulating', async () => {
    await putLocalSave(save({ level: 3 }));
    await putLocalSave(save({ level: 4 }));

    expect((await getLocalSave('child-1'))?.level).toBe(4);
  });

  it('records the version the server accepted, leaving the state alone', async () => {
    await putLocalSave(save({ version: 7, synced: false }));
    await markLocalSaveSynced('child-1', 8);

    const stored = await getLocalSave('child-1');
    expect(stored?.version).toBe(8);
    expect(stored?.synced).toBe(true);
    expect(stored?.state).toEqual(save().state);
  });

  it('does not invent a record when marking a device with no local copy', async () => {
    await markLocalSaveSynced('child-1', 8);
    expect(await getLocalSave('child-1')).toBeNull();
  });

  it('keeps a rejected save beside the live one, not on top of it', async () => {
    await putLocalSave(save({ level: 3 }));
    await putRejectedSave(save({ level: 11, synced: true }));

    // The losing half of a conflict is the thing that used to vanish.
    expect((await getLocalSave('child-1'))?.level).toBe(3);
    expect((await getRejectedSave('child-1'))?.level).toBe(11);
  });

  it('clears both records for a player', async () => {
    await putLocalSave(save());
    await putRejectedSave(save());
    await clearLocalSave('child-1');

    expect(await getLocalSave('child-1')).toBeNull();
    expect(await getRejectedSave('child-1')).toBeNull();
  });

  it('reads a record written by an older build as version-unknown', async () => {
    // A save from before versioning has no version field. Reading it back
    // as null rather than 0 is what makes the next save an insert the
    // server can refuse, instead of an overwrite it cannot.
    const legacy = { userId: 'child-1', state: { totalRescued: 1 }, level: 2 };
    await putLocalSave(legacy as unknown as LocalSave);

    const stored = await getLocalSave('child-1');
    expect(stored?.version).toBeNull();
    expect(stored?.synced).toBe(false);
    expect(stored?.level).toBe(2);
  });
});
