// ── Charity & Adoption Fees ────────────────────────────────────
// Two extra revenue streams that make the rescue centre feel viable:
//   1. Adoption fees — a small donation from the adopter family per
//      successful adoption, with small bonuses for high-bond and
//      species-match outcomes.
//   2. Charity grants — monthly recurring donations from three named
//      grantors, each with their own unlock condition and per-month
//      payout. Grants fire at most once per in-game month, gated by
//      `store.lastGrantCheckAt` so the same month never double-pays.
//
// Intentionally a pure-logic module: no scene dependencies, no I/O.
// GameScene wires the inputs (store + cast lookup) and renders toasts.

import type { Animal, Species } from '@arc/shared-types';

// ── Adoption fees ──────────────────────────────────────────────

export const ADOPTION_FEE_BASE = 20;
export const ADOPTION_FEE_BOND_BONUS = 10;      // +10 if bond ≥ 80
export const ADOPTION_FEE_SPECIES_MATCH = 15;   // +15 if species matches household preference
export const ADOPTION_FEE_CAP = 50;
export const ADOPTION_FEE_BOND_THRESHOLD = 80;

/** Minimal shape of a cast.json household entry we need for fee calc. */
export interface HouseholdLike {
  id?: string;
  species?: Species[];
}

/**
 * Calculate the one-off adoption-fee donation. Household may be missing
 * (unknown id, cast failed to load) — in that case we only apply the
 * base fee + bond bonus.
 */
export function calculateAdoptionFee(
  animal: Pick<Animal, 'species' | 'bondLevel'>,
  household?: HouseholdLike | null,
): number {
  let fee = ADOPTION_FEE_BASE;
  if ((animal.bondLevel ?? 0) >= ADOPTION_FEE_BOND_THRESHOLD) {
    fee += ADOPTION_FEE_BOND_BONUS;
  }
  if (household?.species && household.species.includes(animal.species)) {
    fee += ADOPTION_FEE_SPECIES_MATCH;
  }
  return Math.min(fee, ADOPTION_FEE_CAP);
}

// ── Charity grants ─────────────────────────────────────────────

export type GrantId = 'wildlife_trust' | 'community_foundation' | 'rescue_charity';

export interface GrantDef {
  id: GrantId;
  label: string;          // short painted-toast label
  emoji: string;
  amount: number;         // coins per month
  /** Is the grant unlocked & still qualifying for the player? */
  qualifies: (store: GrantCheckStore) => boolean;
}

/** Narrow shape of GameStateStore that checkCharityGrants needs. */
export interface GrantCheckStore {
  level: number;
  rewilded: Array<unknown>;
  rehomed: Array<unknown>;
  economy: { coins: number; lifetimeEarnings: number };
  lastGrantCheckAt?: number;
  grantsReceived?: Array<GrantAward>;
}

export interface GrantAward {
  grantId: GrantId;
  amount: number;
  atMs: number;
}

export const GRANTS: GrantDef[] = [
  {
    id: 'wildlife_trust',
    label: 'Wildlife Trust donation',
    emoji: '🏛',
    amount: 30,
    qualifies: (s) => s.rewilded.length >= 3,
  },
  {
    id: 'community_foundation',
    label: 'Community Foundation donation',
    emoji: '🏛',
    amount: 20,
    qualifies: (s) => s.rehomed.length >= 5,
  },
  {
    id: 'rescue_charity',
    label: 'Rescue Charity donation',
    emoji: '🏛',
    amount: 40,
    qualifies: (s) => s.level >= 10,
  },
];

export const MS_PER_GRANT_MONTH = 7 * 24 * 60 * 60 * 1000; // 1 real week = 1 in-game month

/**
 * Roll for grants that should fire now. Returns the list of new grants
 * to credit (caller is responsible for adding to economy + toasting).
 *
 * Semantics:
 *   - First call (no lastGrantCheckAt) seeds the timer; no grants fire.
 *   - Subsequent calls fire one payout per full in-game month elapsed,
 *     per qualifying grant, up to a sensible cap (12 months) to keep
 *     catch-up sane if the player returns after a long break.
 *
 * `now` is epoch ms; defaults to Date.now() for convenience but tests
 * should always pass an explicit value.
 */
export function checkCharityGrants(
  store: GrantCheckStore,
  now: number = Date.now(),
): GrantAward[] {
  const MAX_CATCH_UP_MONTHS = 12;
  const last = store.lastGrantCheckAt ?? 0;

  if (last === 0) {
    // Seed the timer without paying anything — avoids instant free
    // money for brand-new saves and avoids a spurious grant for old
    // saves loading for the first time with this feature.
    store.lastGrantCheckAt = now;
    return [];
  }

  const elapsedMs = now - last;
  if (elapsedMs < MS_PER_GRANT_MONTH) return [];

  const monthsElapsed = Math.min(
    MAX_CATCH_UP_MONTHS,
    Math.floor(elapsedMs / MS_PER_GRANT_MONTH),
  );
  if (monthsElapsed <= 0) return [];

  const awards: GrantAward[] = [];
  for (const grant of GRANTS) {
    if (!grant.qualifies(store)) continue;
    for (let i = 0; i < monthsElapsed; i++) {
      awards.push({ grantId: grant.id, amount: grant.amount, atMs: now });
    }
  }

  // Advance the cursor by the whole months we just paid for, so the
  // fractional remainder rolls into the next check.
  store.lastGrantCheckAt = last + monthsElapsed * MS_PER_GRANT_MONTH;
  return awards;
}

/** Get a grant definition by id — for toast labels etc. */
export function getGrantDef(id: GrantId): GrantDef | undefined {
  return GRANTS.find((g) => g.id === id);
}
