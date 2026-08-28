/**
 * Three-way merge of two divergent shelters — save sync, phase 2.
 *
 * Phase 1 detected the collision and stopped there: the newest write won
 * whole, and the losing device's afternoon survived only as a copy on disk
 * nobody read. This decides what the shelter actually becomes.
 *
 * ## Why three-way
 *
 * Animals leave the shelter by being removed from the array — adoption,
 * rewilding, a working role, or passing (see docs/animal-exits.md). Nothing
 * is left behind in `animals` to say so. With only the two divergent copies
 * to compare, "in mine and not in theirs" is unreadable: it means either
 * *I rescued this since we last agreed* or *they adopted it out since we
 * last agreed*, and the two demand opposite answers. A union resurrects
 * adopted animals; a pick deletes rescued ones.
 *
 * The common ancestor resolves it. `base` is the last state this device
 * knew the server held — kept by localSave under a ::base key, written
 * whenever a save is confirmed or a cloud load lands. Against it, presence
 * has a direction: in base and gone from one side is a removal, absent from
 * base and present on one side is an addition.
 *
 * ## The rules, and why each field gets the one it does
 *
 * - **Entities keyed by id** (animals, decorations, visitors, apprentices,
 *   grants, garden returns): three-way by id, as above. When both sides
 *   edited the same entity, this device wins — it is the one with a child
 *   in front of it, about to write. Two exceptions on animals, below.
 * - **Append-only history** (rehomed, rewilded): union. These only grow,
 *   and an exit recorded on either device really happened.
 * - **Sets** (badges, upgrades, charms): three-way set — additions from
 *   both, removals honoured.
 * - **Lifetime counters** (totalRescued, totalBonded, event counters):
 *   additive from base. Both devices' progress is real progress.
 * - **Economy**: additive from base, floored at zero. A child who earned
 *   40 coins on the iPad and spent 60 on the phone should end up down 20,
 *   not up 40 or down 60 depending on which device saved last. Floored
 *   because two devices can each spend most of a balance offline, and a
 *   negative purse is worse than a slightly generous one.
 * - **One-way flags** (wildVisitsUnlocked, hasCompletedFirstDrive): OR.
 *   They only ever turn on.
 * - **Ephemeral session state** (timeProgress, gardenWeather, calendar):
 *   the server's copy, which is the later wall-clock write. There is
 *   nothing to merge in "it is currently afternoon".
 * - **Depot**: its own rules — daily sessions consumed by both devices are
 *   both gone, its counters add, its inventory adds per item.
 * - **Anything unrecognised**: a generic three-way scalar — the side that
 *   changed it wins, this device if both did. A field added by a later
 *   build is carried through rather than dropped by an older merge.
 *
 * The result is deliberately silent. The child gets their shelter with
 * everything they did on both devices in it; `notes` is for the console
 * and the next person reading a bug report, not for a seven-year-old.
 */

type Save = Record<string, unknown>;

export interface MergeLevels {
  mine: number;
  theirs: number;
}

export interface MergeResult {
  /** The merged save, in the shape loadSaveState persists. */
  state: Save;
  /** Merged level. Stored in its own column, so it travels separately. */
  level: number;
  /** What the merge did, for logging. Never shown to the player. */
  notes: string[];
}

/** Lists merged by entity id. The id field is `id` for all of them. */
const ID_LISTS = [
  'animals',
  'placedDecorations',
  'visitors',
  'apprentices',
  'gardenReturns',
  'grantsReceived',
] as const;

/** History that only ever grows. Keyed by every field, so duplicates collapse. */
const HISTORY_LISTS = ['rehomed', 'rewilded'] as const;

/** Sets of plain strings. */
const STRING_SETS = ['earnedBadges', 'houseUpgrades', 'unlockedCharms'] as const;

/** Counters where both devices' progress should show up in the total. */
const ADDITIVE_NUMBERS = ['totalRescued', 'totalBonded'] as const;

/** Flags that only ever turn on. */
const ONE_WAY_FLAGS = ['wildVisitsUnlocked', 'hasCompletedFirstDrive'] as const;

/** Session state with nothing mergeable in it; the later write stands. */
const NEWEST_WINS = ['timeProgress', 'gardenWeather', 'calendar', 'equippedCharm'] as const;

/**
 * Animal `state` only ever advances, so the further of two values is never
 * the wrong answer — losing a bond a child spent an afternoon on because
 * the other device also touched that animal would be.
 */
const ANIMAL_STATE_ORDER = ['arriving', 'sheltered', 'bonding', 'pet'];

export function mergeSaveState(
  base: Save | null | undefined,
  mine: Save,
  theirs: Save,
  levels?: MergeLevels,
): MergeResult {
  const notes: string[] = [];
  const level = Math.max(levels?.mine ?? 1, levels?.theirs ?? 1);

  // No base — an older build, or IndexedDB cleared between the load and
  // the conflict. Union everything rather than pick: with nothing to
  // compare against, keeping an adopted animal a little too long is a far
  // smaller harm than deleting one the child rescued this afternoon.
  const ancestor = base ?? null;
  if (!ancestor) {
    notes.push('no base snapshot; merged as a two-way union');
  }
  const b: Save = ancestor ?? {};

  const out: Save = {};
  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(b)]);

  for (const key of keys) {
    const mv = mine[key];
    const tv = theirs[key];
    const bv = b[key];

    if ((ID_LISTS as readonly string[]).includes(key)) {
      out[key] = mergeById(key, bv, mv, tv, !!ancestor, notes);
    } else if ((HISTORY_LISTS as readonly string[]).includes(key)) {
      out[key] = unionByValue(mv, tv);
    } else if ((STRING_SETS as readonly string[]).includes(key)) {
      out[key] = mergeSet(bv, mv, tv, !!ancestor);
    } else if ((ADDITIVE_NUMBERS as readonly string[]).includes(key)) {
      out[key] = addFromBase(num(bv), num(mv), num(tv), !!ancestor);
    } else if ((ONE_WAY_FLAGS as readonly string[]).includes(key)) {
      out[key] = mv === true || tv === true;
    } else if ((NEWEST_WINS as readonly string[]).includes(key)) {
      out[key] = tv !== undefined ? tv : mv;
    } else if (key === 'economy') {
      out[key] = mergeEconomy(bv, mv, tv, !!ancestor);
    } else if (key === 'depot') {
      out[key] = mergeDepot(bv, mv, tv, !!ancestor);
    } else if (key === 'sickAnimals') {
      out[key] = mergeRecord(bv, mv, tv, !!ancestor);
    } else if (key === 'eventCounters') {
      out[key] = mergeCounterRecord(bv, mv, tv, !!ancestor);
    } else if (key === 'relationships') {
      out[key] = unionByValue(mv, tv);
    } else if (key === 'lastGrantCheckAt') {
      out[key] = Math.max(num(mv), num(tv)) || undefined;
    } else {
      out[key] = pickScalar(bv, mv, tv);
    }
  }

  return { state: out, level, notes };
}

// ── entity lists ─────────────────────────────────────────────

/**
 * Three-way merge of a list of `{ id }` entities.
 *
 * Presence is decided against the base: an id in the base and missing from
 * one side was removed on that side and stays removed. An id absent from
 * the base and present on one side is new and is kept. Where both sides
 * still hold the entity, whichever of them differs from the base wins, and
 * this device wins a tie — see the file header.
 */
function mergeById(
  key: string,
  bv: unknown,
  mv: unknown,
  tv: unknown,
  hasBase: boolean,
  notes: string[],
): unknown {
  const mineList = asArray(mv);
  const theirsList = asArray(tv);
  if (!mineList) return theirsList ?? [];
  if (!theirsList) return mineList;

  const baseById = byId(asArray(bv) ?? []);
  const mineById = byId(mineList);
  const theirsById = byId(theirsList);

  const merged: Record<string, unknown>[] = [];
  let added = 0;
  let removed = 0;

  // Order follows this device's list, then whatever the other device has
  // that this one does not — so the shelter a child is looking at does not
  // reshuffle under them when a merge lands.
  const ids = [...mineById.keys()];
  for (const id of theirsById.keys()) if (!mineById.has(id)) ids.push(id);

  for (const id of ids) {
    const inBase = baseById.has(id);
    const m = mineById.get(id);
    const t = theirsById.get(id);

    if (m && t) {
      merged.push(key === 'animals' ? mergeAnimal(baseById.get(id), m, t) : pickEntity(baseById.get(id), m, t));
      continue;
    }

    // Only one side has it. With a base, absence is a removal; without
    // one, it is indistinguishable from an addition, so keep it.
    const only = (m ?? t) as Record<string, unknown>;
    if (hasBase && inBase) {
      removed++;
      continue;
    }
    if (!inBase) added++;
    merged.push(only);
  }

  if (added || removed) {
    notes.push(`${key}: +${added} from the other device, ${removed} removed there`);
  }
  return merged;
}

/**
 * One entity held by both sides. The side that moved away from the base
 * wins; this device wins when both did.
 */
function pickEntity(
  bv: Record<string, unknown> | undefined,
  m: Record<string, unknown>,
  t: Record<string, unknown>,
): Record<string, unknown> {
  if (!bv) return m;
  const mineChanged = !same(bv, m);
  const theirsChanged = !same(bv, t);
  if (theirsChanged && !mineChanged) return t;
  return m;
}

/**
 * As pickEntity, but two fields survive losing. `state` only advances, and
 * `bondLevel` is the thing a child works at for days; taking the further of
 * the two costs nothing and stops a merge quietly undoing an adoption or a
 * bond that completed on the other device.
 */
function mergeAnimal(
  bv: Record<string, unknown> | undefined,
  m: Record<string, unknown>,
  t: Record<string, unknown>,
): Record<string, unknown> {
  const winner = { ...pickEntity(bv, m, t) };
  const furthest = furthestState(m.state, t.state);
  if (furthest !== undefined) winner.state = furthest;
  const bond = Math.max(num(m.bondLevel), num(t.bondLevel));
  if (Number.isFinite(bond)) winner.bondLevel = bond;
  return winner;
}

function furthestState(a: unknown, b: unknown): unknown {
  const ai = ANIMAL_STATE_ORDER.indexOf(a as string);
  const bi = ANIMAL_STATE_ORDER.indexOf(b as string);
  if (ai < 0 && bi < 0) return undefined;
  return bi > ai ? b : a;
}

// ── sets, records and numbers ────────────────────────────────

/** Union of two lists, deduplicated by deep value. Order: mine, then new. */
function unionByValue(mv: unknown, tv: unknown): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const item of [...(asArray(mv) ?? []), ...(asArray(tv) ?? [])]) {
    const k = stable(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/**
 * Three-way set merge: everything either side added, minus anything either
 * side removed. Without a base there is nothing to call a removal, so it
 * degrades to a union.
 */
function mergeSet(bv: unknown, mv: unknown, tv: unknown, hasBase: boolean): unknown[] {
  const baseSet = new Set((asArray(bv) ?? []).map(stable));
  const mineSet = new Set((asArray(mv) ?? []).map(stable));
  const theirsSet = new Set((asArray(tv) ?? []).map(stable));

  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const item of [...(asArray(mv) ?? []), ...(asArray(tv) ?? [])]) {
    const k = stable(item);
    if (seen.has(k)) continue;
    const inBase = baseSet.has(k);
    // Present in the base and dropped by one side: that is a removal.
    if (hasBase && inBase && (!mineSet.has(k) || !theirsSet.has(k))) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** Three-way merge of a `{ key: value }` map, with removals honoured. */
function mergeRecord(bv: unknown, mv: unknown, tv: unknown, hasBase: boolean): Record<string, unknown> {
  const b = asRecord(bv) ?? {};
  const m = asRecord(mv) ?? {};
  const t = asRecord(tv) ?? {};
  const out: Record<string, unknown> = {};

  for (const key of new Set([...Object.keys(m), ...Object.keys(t)])) {
    const inBase = key in b;
    const inMine = key in m;
    const inTheirs = key in t;
    if (hasBase && inBase && (!inMine || !inTheirs)) continue; // removed one side
    out[key] = inMine && inTheirs ? pickScalar(b[key], m[key], t[key]) : (inMine ? m[key] : t[key]);
  }
  return out;
}

/** As mergeRecord, but the values are counters and add rather than pick. */
function mergeCounterRecord(bv: unknown, mv: unknown, tv: unknown, hasBase: boolean): Record<string, number> {
  const b = asRecord(bv) ?? {};
  const m = asRecord(mv) ?? {};
  const t = asRecord(tv) ?? {};
  const out: Record<string, number> = {};
  for (const key of new Set([...Object.keys(m), ...Object.keys(t)])) {
    out[key] = addFromBase(num(b[key]), num(m[key]), num(t[key]), hasBase);
  }
  return out;
}

/**
 * base + both deltas. Without a base the deltas are unknowable, so the
 * larger value stands — for a counter that only grows, that is the closer
 * of the two answers.
 *
 * Two sides holding the same number is *not* a reason to return it. Base 5
 * with both sides on 7 means each device rescued two animals since they
 * last agreed, not that they are looking at the same two: had the two come
 * from one write, this device would have recorded that confirmation and the
 * base would read 7 as well, making both deltas zero on its own. Equality
 * with the base is what makes a delta vanish, not equality with each other.
 */
function addFromBase(b: number, m: number, t: number, hasBase: boolean): number {
  if (!hasBase) return Math.max(m, t);
  return b + (m - b) + (t - b);
}

function mergeEconomy(bv: unknown, mv: unknown, tv: unknown, hasBase: boolean): unknown {
  const b = asRecord(bv);
  const m = asRecord(mv);
  const t = asRecord(tv);
  if (!m) return tv;
  if (!t) return mv;
  return {
    ...m,
    // Floored: two devices can each spend most of the same balance
    // offline, and a child looking at minus forty coins is a bug report.
    coins: Math.max(0, addFromBase(num(b?.coins), num(m.coins), num(t.coins), hasBase)),
    lifetimeEarnings: addFromBase(
      num(b?.lifetimeEarnings), num(m.lifetimeEarnings), num(t.lifetimeEarnings), hasBase,
    ),
  };
}

/**
 * The depot keeps a daily budget, lifetime counters and a parts inventory,
 * and each wants something different. Sessions played on both devices are
 * both spent, so the remaining budget takes both deductions. The board
 * mid-session belongs to whichever device is later.
 */
function mergeDepot(bv: unknown, mv: unknown, tv: unknown, hasBase: boolean): unknown {
  const b = asRecord(bv);
  const m = asRecord(mv);
  const t = asRecord(tv);
  if (!m) return tv;
  if (!t) return mv;

  const maxToday = Math.max(num(m.sessionsMaxToday), num(t.sessionsMaxToday));
  // The daily budget runs the other way to a counter: both devices spent
  // out of the same allowance, so both deductions come off. Same reasoning
  // as addFromBase — two sides on 2 out of a base of 3 means one session
  // played on each, not one shared between them.
  const remaining = hasBase
    ? clamp(
      num(b?.sessionsRemainingToday)
        - (num(b?.sessionsRemainingToday) - num(m.sessionsRemainingToday))
        - (num(b?.sessionsRemainingToday) - num(t.sessionsRemainingToday)),
      0,
      maxToday,
    )
    : Math.min(num(m.sessionsRemainingToday), num(t.sessionsRemainingToday));

  return {
    ...m,
    sessionsMaxToday: maxToday,
    sessionsRemainingToday: remaining,
    totalSessionsPlayed: addFromBase(
      num(b?.totalSessionsPlayed), num(m.totalSessionsPlayed), num(t.totalSessionsPlayed), hasBase,
    ),
    // The later of the two days, so a merge cannot roll the daily reset back.
    lastSessionDay: laterDay(m.lastSessionDay, t.lastSessionDay),
    activeBoardState: t.activeBoardState ?? m.activeBoardState,
    inventory: mergeDepotInventory(b?.inventory, m.inventory, t.inventory, hasBase),
  };
}

/** Every bag in the depot inventory is `{ item: count }`, and counts add. */
function mergeDepotInventory(bv: unknown, mv: unknown, tv: unknown, hasBase: boolean): Record<string, unknown> {
  const b = asRecord(bv) ?? {};
  const m = asRecord(mv) ?? {};
  const t = asRecord(tv) ?? {};
  const out: Record<string, unknown> = {};
  for (const bag of new Set([...Object.keys(m), ...Object.keys(t)])) {
    out[bag] = mergeCounterRecord(b[bag], m[bag], t[bag], hasBase);
  }
  return out;
}

/** The generic rule: whichever side moved away from the base, else mine. */
function pickScalar(bv: unknown, mv: unknown, tv: unknown): unknown {
  if (mv === undefined) return tv;
  if (tv === undefined) return mv;
  const mineChanged = !same(bv, mv);
  const theirsChanged = !same(bv, tv);
  if (theirsChanged && !mineChanged) return tv;
  return mv;
}

// ── small helpers ────────────────────────────────────────────

function asArray(v: unknown): Record<string, unknown>[] | null {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function byId(list: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of list) {
    const id = item && typeof item === 'object' ? item.id : undefined;
    if (typeof id === 'string' || typeof id === 'number') map.set(String(id), item);
  }
  return map;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function laterDay(a: unknown, b: unknown): unknown {
  if (typeof a !== 'string') return b;
  if (typeof b !== 'string') return a;
  return b > a ? b : a;
}

function same(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

/**
 * Key-ordered JSON, so two objects that differ only in key order compare
 * equal. Saves are round-tripped through JSON on every write, and key
 * order is not something a change of build should be allowed to mean.
 */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(
        ([x], [y]) => (x < y ? -1 : x > y ? 1 : 0),
      ));
    }
    return value;
  });
}
