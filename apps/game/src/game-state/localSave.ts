/**
 * localSave — the copy of a child's shelter that lives on their device.
 *
 * Saving used to be cloud-only: `saveGameState` posted to an Edge Function
 * and, if that failed, showed a toast and dropped the snapshot on the floor.
 * On a train, on hotel wifi, on an iPad that has wandered out of range of
 * the router, an afternoon's play simply stopped existing. There was no
 * local copy anywhere — not localStorage, not IndexedDB, nothing.
 *
 * So every save is written here first and posted second. IndexedDB rather
 * than localStorage because a shelter with fifty animals is comfortably
 * past localStorage's ~5 MB and, more to the point, localStorage writes
 * block the main thread — on a save-on-every-interaction game that is a
 * stutter a child can feel.
 *
 * Records are keyed by user id: a family iPad has several children on it,
 * and one signing in must never see another's shelter.
 *
 * Nothing in here throws. A browser in private mode, a device with storage
 * disabled, a quota that has run out — all of them degrade to "no local
 * copy", which is where the game already was. A local-save failure must
 * never be the reason a save does not reach the cloud.
 */

const DB_NAME = 'arc-save';
const DB_VERSION = 1;
const STORE = 'saves';

/**
 * Three records per player, under one key each.
 *
 * - `live` is this device's current snapshot, written before every post.
 * - `rejected` is the server copy a 409 handed back.
 * - `base` is the last state this device knew the server held: the common
 *   ancestor a three-way merge needs. Written whenever a save is confirmed
 *   or a cloud load lands, which are exactly the moments the two agree.
 *
 * Without `base`, "in mine and not in theirs" cannot be read — it means
 * either *I rescued this* or *they adopted it out*, and the two want
 * opposite answers. See packages/game-logic/src/merge-save.ts.
 */
type SaveVariant = 'live' | 'rejected' | 'base';
const SUFFIX: Record<SaveVariant, string> = {
  live: '',
  rejected: '::rejected',
  base: '::base',
};

export interface LocalSave {
  /** Owner. Also the record key — see `keyFor`. */
  userId: string;
  state: Record<string, unknown>;
  level: number;
  /**
   * The server version this snapshot was built on, echoed back on the next
   * save. `null` means "no server row that this device knows of", which is
   * what turns the first save into an insert rather than an overwrite.
   */
  version: number | null;
  /** True once save-game has accepted this exact snapshot. */
  synced: boolean;
  /**
   * Device clock, milliseconds. Useful when a human is looking at two
   * divergent shelters; never a tie-breaker, because a child's iPad with
   * the wrong date would otherwise win every conflict forever. The server
   * clock is the only one that decides anything.
   */
  savedAt: number;
}

function keyFor(userId: string, variant: SaveVariant = 'live'): string {
  return `${userId}${SUFFIX[variant]}`;
}

/** True when this browser will let us store anything at all. */
export function isLocalSaveAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    // Some privacy modes throw on the property access itself.
    return false;
  }
}

/**
 * Memoised handle. Opening the database on every save would add a round
 * trip to an operation that runs on almost every tap. Cleared when an open
 * fails or the connection is closed under us, so a later save can retry.
 */
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the schema closes this handle. Forget it so
      // the next call opens a fresh one instead of using a dead connection.
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
    request.onblocked = () => reject(new Error('indexedDB open blocked by another tab'));
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

/** Run one transaction, resolving when it commits rather than when the
 *  request fires — otherwise a "successful" write can still be rolled back. */
function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        let result: T;
        request.onsuccess = () => { result = request.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? request.error ?? new Error('indexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('indexedDB transaction aborted'));
      }),
  );
}

/**
 * Write the snapshot for this player, replacing whatever was there.
 *
 * Resolves either way: `false` means the device would not store it, which
 * is worth knowing but is never a reason to stop.
 */
export async function putLocalSave(save: LocalSave): Promise<boolean> {
  if (!isLocalSaveAvailable()) return false;
  try {
    await withStore('readwrite', (store) =>
      store.put({ key: keyFor(save.userId), ...save }),
    );
    return true;
  } catch (err) {
    console.warn('[localSave] could not write local save:', err);
    return false;
  }
}

/** The snapshot last written on this device, or null if there isn't one. */
export async function getLocalSave(userId: string): Promise<LocalSave | null> {
  if (!isLocalSaveAvailable()) return null;
  try {
    const row = await withStore<Record<string, unknown> | undefined>(
      'readonly',
      (store) => store.get(keyFor(userId)) as IDBRequest<Record<string, unknown> | undefined>,
    );
    return row ? toLocalSave(row) : null;
  } catch (err) {
    console.warn('[localSave] could not read local save:', err);
    return null;
  }
}

/**
 * Record that the server has accepted the stored snapshot, and at what
 * version — so the next save claims the right one.
 *
 * A no-op when there is no local record, which is the case on a device
 * that cannot store one. The server already has the state either way.
 */
export async function markLocalSaveSynced(userId: string, version: number): Promise<void> {
  const existing = await getLocalSave(userId);
  if (!existing) return;
  const synced = { ...existing, version, synced: true };
  await putLocalSave(synced);
  // This is one of the two moments the two copies provably agree, so it is
  // also the moment to record the ancestor the next merge will need. The
  // live record cannot serve: the next save overwrites it before posting.
  await putBaseSave(synced);
}

/**
 * Keep the server state that a rejected save was told about.
 *
 * The 409 payload is the only copy of what the *other* device did that this
 * device will ever hold. Discarding it and carrying on is how the losing
 * side of a conflict disappears — which is the whole failure this work
 * exists to stop. Stored under its own key so the live save is untouched,
 * and left there for the resolution pass to pick up.
 */
export async function putRejectedSave(save: LocalSave): Promise<boolean> {
  if (!isLocalSaveAvailable()) return false;
  try {
    await withStore('readwrite', (store) =>
      store.put({ key: keyFor(save.userId, 'rejected'), ...save }),
    );
    return true;
  } catch (err) {
    console.warn('[localSave] could not keep the rejected save:', err);
    return false;
  }
}

/**
 * Record the state this device and the server agree on.
 *
 * The merge's common ancestor. Written on a confirmed save and on a cloud
 * load — never on an ordinary local write, which by definition is a change
 * the server has not seen. A device with no base record merges as a union,
 * which is a worse answer but not a lost afternoon.
 */
export async function putBaseSave(save: LocalSave): Promise<boolean> {
  if (!isLocalSaveAvailable()) return false;
  try {
    await withStore('readwrite', (store) =>
      store.put({ key: keyFor(save.userId, 'base'), ...save }),
    );
    return true;
  } catch (err) {
    console.warn('[localSave] could not record the merge base:', err);
    return false;
  }
}

/** The last state this device knew the server held, if any. */
export async function getBaseSave(userId: string): Promise<LocalSave | null> {
  return readVariant(userId, 'base', 'merge base');
}

/** The server copy kept from the last rejected save, if any. */
export async function getRejectedSave(userId: string): Promise<LocalSave | null> {
  return readVariant(userId, 'rejected', 'rejected save');
}

/** Shared read for the two secondary records. */
async function readVariant(
  userId: string,
  variant: SaveVariant,
  label: string,
): Promise<LocalSave | null> {
  if (!isLocalSaveAvailable()) return null;
  try {
    const row = await withStore<Record<string, unknown> | undefined>(
      'readonly',
      (store) => store.get(keyFor(userId, variant)) as IDBRequest<Record<string, unknown> | undefined>,
    );
    return row ? toLocalSave(row) : null;
  } catch (err) {
    console.warn(`[localSave] could not read the ${label}:`, err);
    return null;
  }
}

/** Drop this player's records. Used by tests; not wired to sign-out, because
 *  the same child signing back in on the same iPad wants their shelter. */
export async function clearLocalSave(userId: string): Promise<void> {
  if (!isLocalSaveAvailable()) return;
  try {
    for (const variant of ['live', 'rejected', 'base'] as SaveVariant[]) {
      await withStore('readwrite', (store) => store.delete(keyFor(userId, variant)));
    }
  } catch (err) {
    console.warn('[localSave] could not clear local save:', err);
  }
}

/** Forget the memoised connection. Tests swap the IndexedDB implementation
 *  under us; without this they would keep talking to the previous one. */
export function resetLocalSaveConnection(): void {
  dbPromise = null;
}

/**
 * Rebuild a record read back from storage.
 *
 * Anything stored by an older build of the game could be missing fields, so
 * every one is defaulted rather than trusted. A record whose version is
 * absent becomes `null` — "unknown", which makes the next save an insert
 * that the server can safely refuse, rather than an overwrite it cannot.
 */
function toLocalSave(row: Record<string, unknown>): LocalSave {
  return {
    userId: String(row.userId ?? ''),
    state: (row.state && typeof row.state === 'object' ? row.state : {}) as Record<string, unknown>,
    level: typeof row.level === 'number' ? row.level : 1,
    version: typeof row.version === 'number' ? row.version : null,
    synced: row.synced === true,
    savedAt: typeof row.savedAt === 'number' ? row.savedAt : 0,
  };
}
