import { describe, it, expect } from 'vitest';
import { checkCharityGrants, MS_PER_GRANT_MONTH, GRANTS } from '../charity';
import type { GrantCheckStore } from '../charity';

function makeStore(overrides: Partial<GrantCheckStore> = {}): GrantCheckStore {
  return {
    level: 1,
    rewilded: [],
    rehomed: [],
    economy: { coins: 0, lifetimeEarnings: 0 },
    lastGrantCheckAt: 0,
    ...overrides,
  };
}

describe('checkCharityGrants', () => {
  it('seeds lastGrantCheckAt on first call and pays nothing', () => {
    const store = makeStore({ lastGrantCheckAt: 0, level: 20, rewilded: [1,2,3,4], rehomed: [1,2,3,4,5,6] });
    const awards = checkCharityGrants(store, 1_000_000);
    expect(awards).toEqual([]);
    expect(store.lastGrantCheckAt).toBe(1_000_000);
  });

  it('pays nothing within the same month', () => {
    const start = 2_000_000;
    const store = makeStore({ lastGrantCheckAt: start, rewilded: [1,2,3,4] });
    const awards = checkCharityGrants(store, start + MS_PER_GRANT_MONTH - 1);
    expect(awards).toEqual([]);
    expect(store.lastGrantCheckAt).toBe(start);
  });

  it('pays Wildlife Trust monthly once ≥ 3 animals rewilded', () => {
    const start = 3_000_000;
    const store = makeStore({
      lastGrantCheckAt: start,
      rewilded: [1, 2, 3],
    });
    const awards = checkCharityGrants(store, start + MS_PER_GRANT_MONTH);
    expect(awards).toHaveLength(1);
    expect(awards[0].grantId).toBe('wildlife_trust');
    expect(awards[0].amount).toBe(30);
  });

  it('does NOT pay Wildlife Trust with only 2 rewilded', () => {
    const start = 4_000_000;
    const store = makeStore({ lastGrantCheckAt: start, rewilded: [1, 2] });
    const awards = checkCharityGrants(store, start + MS_PER_GRANT_MONTH);
    expect(awards.find((a) => a.grantId === 'wildlife_trust')).toBeUndefined();
  });

  it('pays Community Foundation once ≥ 5 adoptions', () => {
    const start = 5_000_000;
    const store = makeStore({ lastGrantCheckAt: start, rehomed: [1,2,3,4,5] });
    const awards = checkCharityGrants(store, start + MS_PER_GRANT_MONTH);
    expect(awards).toHaveLength(1);
    expect(awards[0].grantId).toBe('community_foundation');
    expect(awards[0].amount).toBe(20);
  });

  it('does NOT pay Community Foundation at 4 adoptions', () => {
    const start = 6_000_000;
    const store = makeStore({ lastGrantCheckAt: start, rehomed: [1,2,3,4] });
    const awards = checkCharityGrants(store, start + MS_PER_GRANT_MONTH);
    expect(awards).toEqual([]);
  });

  it('pays Rescue Charity at level 10', () => {
    const start = 7_000_000;
    const store = makeStore({ lastGrantCheckAt: start, level: 10 });
    const awards = checkCharityGrants(store, start + MS_PER_GRANT_MONTH);
    expect(awards.find((a) => a.grantId === 'rescue_charity')?.amount).toBe(40);
  });

  it('does NOT pay Rescue Charity below level 10', () => {
    const start = 8_000_000;
    const store = makeStore({ lastGrantCheckAt: start, level: 9 });
    const awards = checkCharityGrants(store, start + MS_PER_GRANT_MONTH);
    expect(awards.find((a) => a.grantId === 'rescue_charity')).toBeUndefined();
  });

  it('pays all three grants when every condition is met', () => {
    const start = 9_000_000;
    const store = makeStore({
      lastGrantCheckAt: start,
      level: 10,
      rewilded: [1, 2, 3],
      rehomed: [1, 2, 3, 4, 5],
    });
    const awards = checkCharityGrants(store, start + MS_PER_GRANT_MONTH);
    expect(awards).toHaveLength(3);
    const ids = awards.map((a) => a.grantId).sort();
    expect(ids).toEqual(['community_foundation', 'rescue_charity', 'wildlife_trust']);
  });

  it('pays N months of grants when catching up from a long break', () => {
    const start = 10_000_000;
    const store = makeStore({ lastGrantCheckAt: start, level: 10 });
    const awards = checkCharityGrants(store, start + 3 * MS_PER_GRANT_MONTH);
    expect(awards).toHaveLength(3); // 3 months × 1 grant
    expect(awards.every((a) => a.grantId === 'rescue_charity')).toBe(true);
  });

  it('caps catch-up at 12 months', () => {
    const start = 11_000_000;
    const store = makeStore({ lastGrantCheckAt: start, level: 10 });
    const awards = checkCharityGrants(store, start + 50 * MS_PER_GRANT_MONTH);
    expect(awards).toHaveLength(12);
  });

  it('advances the cursor by whole months only', () => {
    const start = 12_000_000;
    const store = makeStore({ lastGrantCheckAt: start, level: 10 });
    const now = start + 2 * MS_PER_GRANT_MONTH + 500;
    checkCharityGrants(store, now);
    expect(store.lastGrantCheckAt).toBe(start + 2 * MS_PER_GRANT_MONTH);
  });

  it('exposes 3 grants via GRANTS', () => {
    expect(GRANTS).toHaveLength(3);
  });
});
