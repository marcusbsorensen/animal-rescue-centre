/**
 * drive-events.ts
 *
 * Pure event model for the PTV drive. No Phaser import — this is the "what
 * happens on the route and what it's worth" layer, so it can be unit-tested
 * deterministically and shared between the top-down travel view (marker
 * placement) and the cab-event view (resolution deltas).
 *
 * MVP (Slice 3) only *builds* the hedgehog-crossing tableau, but the model
 * carries the other event types so later slices are additive, not rewrites.
 */
import { NUM_LANES } from './drive-state';

export type DriveEventType =
  | 'hedgehog-crossing'
  | 'level-crossing'
  | 'traffic-light'
  | 'roadside-animal'
  | 'arrival';

export interface DriveEvent {
  id: string;
  type: DriveEventType;
  /** Position along the route, 0..1. The `arrival` event is always at 1. */
  at: number;
  /** Lane the event sits in (0..NUM_LANES-1), where lane matters for markers. */
  lane: number;
  /** Whether the player has already passed/handled this event. */
  resolved: boolean;
}

/** Deltas produced by resolving an event. All are signed; apply additively. */
export interface EventOutcome {
  /** Change to cargo comfort (0..100 scale), can be negative. */
  cargoComfort: number;
  /** Change to the transported animals' happiness. */
  happiness: number;
  /** Coins awarded. */
  coins: number;
  /** "Kindness" points — fuel for caring-driver charms/badges. */
  kindness: number;
  /** Narrator line to speak on resolution (empty = say nothing). */
  narrate: string;
}

export interface RouteOptions {
  /** Number of non-arrival events to place. Defaults to a seeded 2 or 3. */
  eventCount?: number;
  /** Event types eligible for this route (MVP default: hedgehog only). */
  allowedTypes?: Exclude<DriveEventType, 'arrival'>[];
  numLanes?: number;
}

/** Mulberry32 — small deterministic PRNG. Same seed → same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a deterministic route for a seed: a handful of events spaced along
 * the drive, always finishing with an `arrival` at 1.0. Events are sorted by
 * position and never overlap the very start or the arrival.
 */
export function generateRoute(seed: number, opts: RouteOptions = {}): DriveEvent[] {
  const rng = mulberry32(seed);
  const numLanes = opts.numLanes ?? NUM_LANES;
  const allowed = opts.allowedTypes ?? ['hedgehog-crossing'];
  const count = opts.eventCount ?? (rng() < 0.5 ? 2 : 3);

  // Spread events across the middle 70% of the route so none crowd the
  // start or the arrival, each in its own band to avoid clustering.
  const events: DriveEvent[] = [];
  const bandStart = 0.15;
  const bandEnd = 0.85;
  const bandWidth = (bandEnd - bandStart) / Math.max(1, count);
  for (let i = 0; i < count; i++) {
    const jitter = rng() * bandWidth * 0.7;
    const at = Math.min(bandEnd, bandStart + i * bandWidth + jitter);
    const type = allowed[Math.floor(rng() * allowed.length)];
    const lane = Math.floor(rng() * numLanes);
    events.push({ id: `evt-${seed}-${i}`, type, at, lane, resolved: false });
  }

  events.sort((a, b) => a.at - b.at);
  events.push({ id: `evt-${seed}-arrival`, type: 'arrival', at: 1, lane: Math.floor(numLanes / 2), resolved: false });
  return events;
}

/**
 * The next unresolved event at or ahead of the current progress (0..1), or
 * undefined if none remain. Used by the travel loop to know what marker is
 * coming and when to trigger the dive.
 */
export function pickNextEvent(events: DriveEvent[], progress: number): DriveEvent | undefined {
  let best: DriveEvent | undefined;
  for (const e of events) {
    if (e.resolved) continue;
    if (e.at < progress) continue;
    if (!best || e.at < best.at) best = e;
  }
  return best;
}

/**
 * Resolve an event into gameplay deltas. `success` means the player did the
 * kind thing (e.g. braked for the hedgehog). Crucially, failure never harms
 * the animal — the penalty is a comfort/kindness cost and a gentle chide,
 * matching the game's caring-not-punishing tone.
 */
export function resolveEvent(type: DriveEventType, success: boolean): EventOutcome {
  const zero: EventOutcome = { cargoComfort: 0, happiness: 0, coins: 0, kindness: 0, narrate: '' };
  switch (type) {
    case 'hedgehog-crossing':
      return success
        ? { ...zero, happiness: 1, kindness: 1, narrate: 'You stopped for the little hedgehog. Well done!' }
        : { ...zero, cargoComfort: -8, narrate: "Whoops — we whizzed past the hedgehog. Let's slow down for the next one." };
    case 'level-crossing':
      return success
        ? { ...zero, kindness: 1, narrate: 'Waited for the train. Safe and steady.' }
        : { ...zero, cargoComfort: -6, narrate: 'That crossing needs a proper stop next time.' };
    case 'traffic-light':
      return success
        ? { ...zero, narrate: 'Green light — off we go.' }
        : { ...zero, cargoComfort: -4, narrate: 'Red means stop. No rush — the animals are comfy.' };
    case 'roadside-animal':
      return success
        ? { ...zero, happiness: 1, kindness: 1, narrate: 'You spotted the animal by the road and eased off. Kind driving.' }
        : { ...zero, cargoComfort: -5, narrate: 'Eyes peeled for animals near the road.' };
    case 'arrival':
      // Arrival isn't pass/fail; a calm arrival gives a small comfort settle.
      return { ...zero, cargoComfort: 2, narrate: "We're here. Gently does it." };
  }
}
