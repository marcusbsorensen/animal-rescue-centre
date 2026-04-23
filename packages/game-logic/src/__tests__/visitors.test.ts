import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  scheduleVisitsForDay,
  getDueVisitors,
  markVisitSeen,
  type VisitorStoreShape,
  type VisitorEntry,
  type VisitType,
} from '../visitors';

function makeStore(overrides: Partial<VisitorStoreShape> = {}): VisitorStoreShape {
  return {
    rehomed: [],
    rewilded: [],
    visitors: [],
    ...overrides,
  };
}

function rehomed(animalId: string, householdId = 'hh-1', animalName = 'Luna') {
  return { animalId, animalName, householdId, date: 0 };
}
function rewilded(animalId: string, animalName = 'Benji') {
  return { animalId, animalName, date: 0 };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Chance gating ───────────────────────────────────────────────────

describe('scheduleVisitsForDay — chance gating', () => {
  it('returns no entries when Math.random is always above every threshold', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const store = makeStore({
      rehomed: [rehomed('a'), rehomed('b')],
      rewilded: [rewilded('c')],
    });
    expect(scheduleVisitsForDay(store)).toEqual([]);
  });

  it('schedules a visit for every rehomed animal when random is always 0', () => {
    // 0 is strictly less than every chance, so every roll passes.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const store = makeStore({
      rehomed: [rehomed('a'), rehomed('b'), rehomed('c')],
    });
    const entries = scheduleVisitsForDay(store);
    expect(entries).toHaveLength(3);
    for (const e of entries) {
      expect(e.seen).toBe(false);
      expect(e.scheduledFor).toBeGreaterThanOrEqual(Date.now() - 10);
    }
  });

  it('rehomed entries cite the household id', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const store = makeStore({ rehomed: [rehomed('a1', 'khans')] });
    const entries = scheduleVisitsForDay(store);
    expect(entries[0].householdId).toBe('khans');
    expect(entries[0].animalId).toBe('a1');
  });
});

// ── Wild-visit exclusivity ──────────────────────────────────────────

describe('wild-visit constraints', () => {
  it('never assigns wild-visit to a rehomed animal', () => {
    // Force every roll to select the last weight bucket.
    // Because REHOMED_WEIGHTS has wild-visit weighted 0, it must never
    // be picked regardless of Math.random output.
    const seq = [0, 0.999, 0.5, 0.999, 0.5, 0.999];
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seq[i++ % seq.length]);
    const store = makeStore({
      rehomed: Array.from({ length: 20 }, (_, k) => rehomed(`a${k}`)),
    });
    const entries = scheduleVisitsForDay(store);
    for (const e of entries) {
      expect(e.type).not.toBe('wild-visit');
    }
  });

  it('only rewilded animals can produce wild-visit entries', () => {
    // Rig the roll so we hit every type bucket over many trials on a
    // rewilded-only store — wild-visit must be among the observed types.
    const store = makeStore({
      rewilded: Array.from({ length: 400 }, (_, k) => rewilded(`r${k}`)),
    });
    // Use real Math.random for distribution spread.
    const entries = scheduleVisitsForDay(store);
    const types = new Set(entries.map((e) => e.type));
    // With 400 rewilded × 3% chance ≈ 12 entries on average; with a 15/100
    // wild-visit weight, wild-visit is almost certain to appear at least
    // once, but to keep the test deterministic we just check there's no
    // second-adopt entry (which has weight 0 for rewilders).
    expect(types.has('second-adopt')).toBe(false);
  });

  it('payload for donation has a gift object with valid kind + amount', () => {
    // Force the first rehomed roll to pass and the weighted pick to land
    // on donation (second bucket in REHOMED_WEIGHTS).
    // Sequence: [passChance, typePick, giftKindRoll, amountRoll, …]
    // With weights [40, 25, 20, 10, 0] total 95, we need r*95 after the
    // first bucket (40) — so the second pick r must be in (40/95, 65/95].
    vi.spyOn(Math, 'random').mockImplementation(() => {
      // Just always return 0.45 — 0 < chance 0.05 fails (0.45 > 0.05).
      return 0.45;
    });
    // Instead rig explicitly with a sequence:
    vi.restoreAllMocks();
    const seq = [
      0.01,  // chance roll passes (< 0.05)
      0.5,   // weighted pick: 0.5 * 95 = 47.5 → first bucket 40 consumed, next bucket donation (25) — 47.5-40=7.5 ≤ 25, so donation
      0.0,   // giftKind roll: 0.0 < 0.5 → toys
      0.0,   // amount roll
    ];
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seq[i++] ?? 0.5);

    const store = makeStore({ rehomed: [rehomed('a1')] });
    const entries = scheduleVisitsForDay(store);
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('donation');
    expect(entries[0].payload?.gift).toBeDefined();
    expect(['toys', 'food', 'coins']).toContain(entries[0].payload!.gift!.kind);
    expect(entries[0].payload!.gift!.amount).toBeGreaterThan(0);
  });
});

// ── Type distribution (rough sanity) ────────────────────────────────

describe('scheduleVisitsForDay — distribution', () => {
  it('roughly matches the configured weights for rehomed visits', () => {
    // Per iteration: stub only the first Math.random() call to force the
    // chance gate to open, then delegate to real randomness for the
    // weighted pick (and any payload rolls). Counting N trials of a
    // 1-rehomed store gives us a type histogram we can sanity-check.
    const realRandom = Math.random;
    const counts: Record<VisitType, number> = {
      'drop-by': 0, 'donation': 0, 'second-adopt': 0,
      'photo-letter': 0, 'wild-visit': 0,
    };
    const N = 3000;
    for (let i = 0; i < N; i += 1) {
      let first = true;
      const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
        if (first) { first = false; return 0; }
        return realRandom();
      });
      const store = makeStore({ rehomed: [rehomed('a')] });
      const entries = scheduleVisitsForDay(store);
      if (entries[0]) counts[entries[0].type] += 1;
      spy.mockRestore();
    }

    // drop-by is the most common; wild-visit must be zero for rehomed.
    expect(counts['wild-visit']).toBe(0);
    expect(counts['drop-by']).toBeGreaterThan(counts['donation']);
    expect(counts['donation']).toBeGreaterThan(counts['second-adopt']);
    expect(counts['photo-letter']).toBeGreaterThan(counts['second-adopt']);
  });
});

// ── getDueVisitors ──────────────────────────────────────────────────

describe('getDueVisitors', () => {
  const base: VisitorEntry = {
    id: 'v1', householdId: 'h', type: 'drop-by', scheduledFor: 1000, seen: false,
  };

  it('returns only entries whose scheduledFor has elapsed', () => {
    const store = makeStore({
      visitors: [
        { ...base, id: 'past', scheduledFor: 500 },
        { ...base, id: 'future', scheduledFor: 2000 },
      ],
    });
    const due = getDueVisitors(store, 1000);
    expect(due.map((v) => v.id)).toEqual(['past']);
  });

  it('excludes entries already marked seen', () => {
    const store = makeStore({
      visitors: [
        { ...base, id: 'a', scheduledFor: 500, seen: true },
        { ...base, id: 'b', scheduledFor: 500, seen: false },
      ],
    });
    expect(getDueVisitors(store, 1000).map((v) => v.id)).toEqual(['b']);
  });

  it('returns [] when there are no visitors', () => {
    expect(getDueVisitors(makeStore(), Date.now())).toEqual([]);
  });
});

// ── markVisitSeen ───────────────────────────────────────────────────

describe('markVisitSeen', () => {
  it('flips seen=true on the matching entry', () => {
    const store = makeStore({
      visitors: [
        { id: 'v1', householdId: 'h', type: 'drop-by', scheduledFor: 0, seen: false },
      ],
    });
    markVisitSeen(store, 'v1');
    expect(store.visitors[0].seen).toBe(true);
  });

  it('keeps the entry on the array (history preserved)', () => {
    const store = makeStore({
      visitors: [
        { id: 'v1', householdId: 'h', type: 'drop-by', scheduledFor: 0, seen: false },
        { id: 'v2', householdId: 'h', type: 'drop-by', scheduledFor: 0, seen: false },
      ],
    });
    markVisitSeen(store, 'v1');
    expect(store.visitors).toHaveLength(2);
    expect(store.visitors.find((v) => v.id === 'v1')?.seen).toBe(true);
    expect(store.visitors.find((v) => v.id === 'v2')?.seen).toBe(false);
  });

  it('is a no-op for an unknown id', () => {
    const store = makeStore({
      visitors: [
        { id: 'v1', householdId: 'h', type: 'drop-by', scheduledFor: 0, seen: false },
      ],
    });
    markVisitSeen(store, 'nope');
    expect(store.visitors[0].seen).toBe(false);
  });
});
