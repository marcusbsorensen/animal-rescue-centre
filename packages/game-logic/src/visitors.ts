/**
 * Return-visit rhythms — rehomed and rewilded animals (and their humans)
 * drop back in periodically to say hello, donate supplies, adopt again,
 * or send a painted postcard. See docs/rehoming-cast.md ("Return-visit
 * rhythms") for the narrative design.
 *
 * This is a pure logic module: no Phaser, no I/O. Scenes call these
 * functions each dawn (schedule) and each tick (due).
 */

// ── Types ────────────────────────────────────────────────────────────

export type VisitType =
  | 'drop-by'
  | 'donation'
  | 'second-adopt'
  | 'photo-letter'
  | 'wild-visit';

export interface VisitorEntry {
  id: string;
  householdId: string;
  animalId?: string;
  type: VisitType;
  scheduledFor: number;
  seen: boolean;
  payload?: {
    gift?: { kind: 'toys' | 'food' | 'coins'; amount: number };
    message?: string;
    photoCaption?: string;
  };
}

// Minimal shape the visitor module needs — keeps us decoupled from the
// concrete GameStateStore class in apps/game, so this file stays in
// @arc/game-logic without a circular dep.
export interface VisitorStoreShape {
  rehomed: Array<{
    animalId: string;
    animalName: string;
    householdId: string;
    date: number;
  }>;
  rewilded: Array<{
    animalId: string;
    animalName: string;
    date: number;
  }>;
  visitors: VisitorEntry[];
}

// ── Tuning knobs ─────────────────────────────────────────────────────

/** Daily chance that a given rehomed animal's household drops by. */
export const REHOMED_VISIT_CHANCE = 0.05;
/** Daily chance that a given rewilded animal pops back through. */
export const REWILDED_VISIT_CHANCE = 0.03;
/** An in-game "next day" window — visits scheduled up to this far ahead. */
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Weighted distributions. Wild-visit is only valid for rewilded animals;
// second-adopt only makes sense for rehomed (households).
const REHOMED_WEIGHTS: Array<{ type: VisitType; w: number }> = [
  { type: 'drop-by',       w: 40 },
  { type: 'donation',      w: 25 },
  { type: 'photo-letter',  w: 20 },
  { type: 'second-adopt',  w: 10 },
  { type: 'wild-visit',    w: 0 },
];

const REWILDED_WEIGHTS: Array<{ type: VisitType; w: number }> = [
  { type: 'drop-by',       w: 40 },
  { type: 'donation',      w: 25 },
  { type: 'photo-letter',  w: 20 },
  { type: 'second-adopt',  w: 0 },
  { type: 'wild-visit',    w: 15 }, // re-normalised from the 5 hint in the design doc, so the weight actually registers for rewilders
];

function pickWeighted(weights: Array<{ type: VisitType; w: number }>): VisitType {
  const total = weights.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const entry of weights) {
    r -= entry.w;
    if (r <= 0) return entry.type;
  }
  return weights[0].type;
}

function makeId(): string {
  return `v_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function buildPayload(type: VisitType, animalName: string): VisitorEntry['payload'] {
  switch (type) {
    case 'donation': {
      // 50/30/20 mix of toys / food / coins, modest amounts.
      const r = Math.random();
      const kind: 'toys' | 'food' | 'coins' = r < 0.5 ? 'toys' : r < 0.8 ? 'food' : 'coins';
      const amount =
        kind === 'coins' ? 10 + Math.floor(Math.random() * 15) : 1 + Math.floor(Math.random() * 2);
      return { gift: { kind, amount }, message: `Thought you could use these!` };
    }
    case 'photo-letter':
      return {
        photoCaption: `${animalName} on the sofa, paws crossed — pure nobility.`,
        message: `A painted postcard arrived for you.`,
      };
    case 'second-adopt':
      return { message: `They're ready to welcome another friend home.` };
    case 'wild-visit':
      return { message: `${animalName} was spotted at the hedge — come say hi!` };
    case 'drop-by':
    default:
      return { message: `${animalName} dropped by to see you!` };
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Dawn pass: for each rehomed/rewilded animal, roll a small chance of
 * a visit being scheduled sometime in the next 24h. Returns the new
 * entries to push — the caller decides when to mutate the store.
 *
 * Not idempotent — call once per in-game dawn.
 */
export function scheduleVisitsForDay(store: VisitorStoreShape): VisitorEntry[] {
  const now = Date.now();
  const newEntries: VisitorEntry[] = [];

  for (const r of store.rehomed) {
    if (Math.random() < REHOMED_VISIT_CHANCE) {
      const type = pickWeighted(REHOMED_WEIGHTS);
      newEntries.push({
        id: makeId(),
        householdId: r.householdId,
        animalId: r.animalId,
        type,
        scheduledFor: now + Math.floor(Math.random() * ONE_DAY_MS),
        seen: false,
        payload: buildPayload(type, r.animalName),
      });
    }
  }

  for (const w of store.rewilded) {
    if (Math.random() < REWILDED_VISIT_CHANCE) {
      const type = pickWeighted(REWILDED_WEIGHTS);
      newEntries.push({
        id: makeId(),
        // Rewilded animals have no household — tag with a synthetic id
        // so UI can still resolve "who sent this".
        householdId: `wild-${w.animalId}`,
        animalId: w.animalId,
        type,
        scheduledFor: now + Math.floor(Math.random() * ONE_DAY_MS),
        seen: false,
        payload: buildPayload(type, w.animalName),
      });
    }
  }

  return newEntries;
}

/** Visitors whose scheduled time has arrived and haven't been dismissed. */
export function getDueVisitors(store: VisitorStoreShape, now: number): VisitorEntry[] {
  return store.visitors.filter((v) => !v.seen && v.scheduledFor <= now);
}

/**
 * Flip `seen` to true for the given visit id. Mutates the entry in place
 * but preserves the array identity and length — the entry stays on the
 * store as part of visitor history.
 */
export function markVisitSeen(store: VisitorStoreShape, visitId: string): void {
  const idx = store.visitors.findIndex((v) => v.id === visitId);
  if (idx < 0) return;
  store.visitors[idx] = { ...store.visitors[idx], seen: true };
}
