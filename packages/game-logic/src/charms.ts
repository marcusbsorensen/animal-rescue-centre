/**
 * Dangly charms — rear-view-mirror customisation for the PTV
 * (Pet Transport Vehicle). Cosmetic-only: no gameplay effect
 * beyond a physical wobble on the mirror sprite. Pure
 * personalisation + sense-of-progress.
 *
 * The canonical catalogue + unlock triggers live in
 * `docs/ptv-pet-transport-vehicle.md` §"Rear-view mirror —
 * per vehicle + dangly charm customisation". If you edit this
 * file, keep that doc in sync.
 *
 * Design notes:
 *  - Three charms unlock by default (`kind: 'always'`): Bone,
 *    Lucky Teddy, Bicycle Bell. Two of them are the default
 *    on Henry and Trikey respectively — looked up via
 *    `getDefaultCharmForVehicle`.
 *  - Most unlocks are single-event (first vet run, first fox
 *    tail rewilding drive, etc.). A few are count-threshold
 *    milestones: Silver Horseshoe (10 comfort-safe drives),
 *    Reflective Safety Star (5 clean hedgehog brakes),
 *    Golden Driving Medal (100 drives).
 *  - This module is pure: no store integration, no UI, no I/O.
 *    Callers pass a `CharmsStoreSlice`; helpers mutate-and-return
 *    in the same idiom as `apprentices.ts`.
 */

// ── Types ──────────────────────────────────────────────────────

export type CharmId =
  | 'bone'
  | 'lucky-teddy'
  | 'bicycle-bell'
  | 'hedgehog-plushie'
  | 'arc-pawprint-medal'
  | 'silver-horseshoe'
  | 'viking-longship'
  | 'goose-end-feather'
  | 'fox-tail'
  | 'treble-clef'
  | 'miniature-alpaca'
  | 'painted-pickle-cat'
  | 'chequered-flag-pin'
  | 'carrot'
  | 'reflective-safety-star'
  | 'golden-driving-medal'
  | 'smiley-poop';

export type CharmUnlockEvent =
  | 'first-hedgehog-brake'
  | 'clean-hedgehog-brake'
  | 'first-vet-run'
  | 'no-comfort-drop-drive'
  | 'first-viking-road-adoption'
  | 'first-goose-end-collection'
  | 'first-rewilding-drive'
  | 'first-rock-on-supply-run'
  | 'first-wyx-park-show'
  | 'first-cat-adoption'
  | 'first-bunny-adoption'
  | 'first-clean-overtake'
  | 'crate-accident-cleanup'
  | 'drive-completed'
  | 'drive-completed-with-comfort';

export type CharmUnlockRule =
  | { kind: 'always' }
  | { kind: 'event'; event: CharmUnlockEvent }
  | { kind: 'count'; event: CharmUnlockEvent; target: number };

export type CharmVehicle = 'trikey' | 'henry' | 'bea' | 'big-tilly' | 'spark';

export interface CharmDef {
  id: CharmId;
  label: string;
  emoji?: string;
  description: string;
  unlockRule: CharmUnlockRule;
  defaultOnVehicle?: CharmVehicle;
}

export interface CharmsStoreSlice {
  unlockedCharms: CharmId[];
  equippedCharm: CharmId | null;
  eventCounters: Partial<Record<CharmUnlockEvent, number>>;
}

// ── Catalogue ──────────────────────────────────────────────────

/**
 * The 17-charm catalogue. Order here is the canonical display
 * order used by `getUnlockedCharms` when sorting.
 */
export const CHARMS: Record<CharmId, CharmDef> = {
  bone: {
    id: 'bone',
    label: 'Bone',
    emoji: '🦴',
    description: 'Default for Henry, always available.',
    unlockRule: { kind: 'always' },
    defaultOnVehicle: 'henry',
  },
  'lucky-teddy': {
    id: 'lucky-teddy',
    label: 'Lucky Teddy',
    emoji: '🧸',
    description: 'Default option, always available.',
    unlockRule: { kind: 'always' },
  },
  'bicycle-bell': {
    id: 'bicycle-bell',
    label: 'Bicycle Bell',
    emoji: '🔔',
    description: 'Default on Trikey.',
    unlockRule: { kind: 'always' },
    defaultOnVehicle: 'trikey',
  },
  'hedgehog-plushie': {
    id: 'hedgehog-plushie',
    label: 'Hedgehog Plushie',
    description: 'First clean hedgehog brake.',
    unlockRule: { kind: 'event', event: 'first-hedgehog-brake' },
  },
  'arc-pawprint-medal': {
    id: 'arc-pawprint-medal',
    label: 'A.R.C. Pawprint Medal',
    description: 'First vet run completed.',
    unlockRule: { kind: 'event', event: 'first-vet-run' },
  },
  'silver-horseshoe': {
    id: 'silver-horseshoe',
    label: 'Silver Horseshoe',
    description: '10 drives without a cargo-comfort drop.',
    unlockRule: { kind: 'count', event: 'drive-completed-with-comfort', target: 10 },
  },
  'viking-longship': {
    id: 'viking-longship',
    label: 'Viking Longship',
    description: "A nod to Lily's heritage — gifted on first adoption to a Viking-road household.",
    unlockRule: { kind: 'event', event: 'first-viking-road-adoption' },
  },
  'goose-end-feather': {
    id: 'goose-end-feather',
    label: 'Goose-End-Farm Feather',
    description: 'First collection from Goose End.',
    unlockRule: { kind: 'event', event: 'first-goose-end-collection' },
  },
  'fox-tail': {
    id: 'fox-tail',
    label: 'Fox Tail',
    description: 'First rewilding drive.',
    unlockRule: { kind: 'event', event: 'first-rewilding-drive' },
  },
  'treble-clef': {
    id: 'treble-clef',
    label: 'Treble Clef',
    emoji: '🎼',
    description: 'First Rock On Music Academy supply run.',
    unlockRule: { kind: 'event', event: 'first-rock-on-supply-run' },
  },
  'miniature-alpaca': {
    id: 'miniature-alpaca',
    label: 'Miniature Alpaca',
    description: 'First Wyx Park pet show visit.',
    unlockRule: { kind: 'event', event: 'first-wyx-park-show' },
  },
  'painted-pickle-cat': {
    id: 'painted-pickle-cat',
    label: 'Painted Pickle the Cat',
    description: 'First cat adoption.',
    unlockRule: { kind: 'event', event: 'first-cat-adoption' },
  },
  'chequered-flag-pin': {
    id: 'chequered-flag-pin',
    label: 'Chequered Flag Pin',
    emoji: '🏁',
    description: 'First clean overtake.',
    unlockRule: { kind: 'event', event: 'first-clean-overtake' },
  },
  carrot: {
    id: 'carrot',
    label: 'Carrot',
    emoji: '🥕',
    description: 'First bunny adopted.',
    unlockRule: { kind: 'event', event: 'first-bunny-adoption' },
  },
  'reflective-safety-star': {
    id: 'reflective-safety-star',
    label: 'Reflective Safety Star',
    description: '5 clean hedgehog brakes.',
    unlockRule: { kind: 'count', event: 'clean-hedgehog-brake', target: 5 },
  },
  'golden-driving-medal': {
    id: 'golden-driving-medal',
    label: 'Golden Driving Medal',
    description: '100 total drives.',
    unlockRule: { kind: 'count', event: 'drive-completed', target: 100 },
  },
  'smiley-poop': {
    id: 'smiley-poop',
    label: 'Smiley Poop',
    emoji: '💩',
    description: "Cleaned up after a crate accident on a PTV drive — Lily's pick.",
    unlockRule: { kind: 'event', event: 'crate-accident-cleanup' },
  },
};

/** Catalogue order for deterministic sorting. */
const CHARM_ORDER: readonly CharmId[] = Object.keys(CHARMS) as CharmId[];

// ── Helpers ────────────────────────────────────────────────────

/**
 * Default store: every `always`-rule charm unlocked, nothing
 * equipped, empty counters. Use this when initialising a new
 * save or bootstrapping a slice on an older save that predates
 * charms.
 */
export function initCharmsStore(): CharmsStoreSlice {
  const unlockedCharms: CharmId[] = [];
  for (const id of CHARM_ORDER) {
    if (CHARMS[id].unlockRule.kind === 'always') {
      unlockedCharms.push(id);
    }
  }
  return {
    unlockedCharms,
    equippedCharm: null,
    eventCounters: {},
  };
}

export function isCharmUnlocked(store: CharmsStoreSlice, id: CharmId): boolean {
  return store.unlockedCharms.includes(id);
}

/**
 * Record a trigger event. Increments the counter for the event
 * then walks the catalogue to find any charm whose unlock rule
 * was satisfied by *this* call (i.e. the threshold was crossed
 * exactly on this increment). Already-unlocked charms are never
 * returned a second time — even if the underlying counter keeps
 * climbing.
 *
 * Returns the (mutated) store plus the list of charms that were
 * newly unlocked so callers can fire celebratory toasts.
 */
export function recordCharmEvent(
  store: CharmsStoreSlice,
  event: CharmUnlockEvent,
): { next: CharmsStoreSlice; newlyUnlocked: CharmId[] } {
  const prevCount = store.eventCounters[event] ?? 0;
  const nextCount = prevCount + 1;
  store.eventCounters[event] = nextCount;

  const newlyUnlocked: CharmId[] = [];
  for (const id of CHARM_ORDER) {
    if (store.unlockedCharms.includes(id)) continue;
    const rule = CHARMS[id].unlockRule;
    if (rule.kind === 'always') continue;
    if (rule.event !== event) continue;

    let triggered = false;
    if (rule.kind === 'event') {
      // First occurrence crosses the threshold.
      triggered = prevCount === 0 && nextCount >= 1;
    } else if (rule.kind === 'count') {
      triggered = prevCount < rule.target && nextCount >= rule.target;
    }

    if (triggered) {
      store.unlockedCharms.push(id);
      newlyUnlocked.push(id);
    }
  }

  return { next: store, newlyUnlocked };
}

/** All unlocked charm defs, sorted by catalogue order. */
export function getUnlockedCharms(store: CharmsStoreSlice): CharmDef[] {
  return CHARM_ORDER
    .filter((id) => store.unlockedCharms.includes(id))
    .map((id) => CHARMS[id]);
}

/**
 * Equip a charm. Throws if the charm hasn't been unlocked yet —
 * the charm-picker UI should gate this, but the invariant holds
 * at the logic layer too.
 */
export function equipCharm(
  store: CharmsStoreSlice,
  id: CharmId,
): CharmsStoreSlice {
  if (!isCharmUnlocked(store, id)) {
    throw new Error(`Charm "${id}" is not unlocked.`);
  }
  store.equippedCharm = id;
  return store;
}

export function unequipCharm(store: CharmsStoreSlice): CharmsStoreSlice {
  store.equippedCharm = null;
  return store;
}

/** The charm that should dangle by default on a given vehicle. */
export function getDefaultCharmForVehicle(vehicle: CharmVehicle): CharmId | null {
  for (const id of CHARM_ORDER) {
    if (CHARMS[id].defaultOnVehicle === vehicle) return id;
  }
  return null;
}
