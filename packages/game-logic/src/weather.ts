/**
 * Garden weather — pure logic.
 *
 * Weather is rolled deterministically per in-game DAY (not per real time),
 * weighted by the current season. Each day produces a forecast of four
 * weather states — one per TimeOfDay phase — which the garden view and
 * the let-outside gate both read.
 *
 * Because it's deterministic given (day, seed), reloading the game
 * does NOT reshuffle the weather Lily was already expecting.
 *
 * Weather advances at phase boundaries, not on its own clock — the
 * clock is task-driven (see time.ts), so the player stays in control.
 *
 * Also exported: per-species tolerance tables that gate let-outside
 * decisions (cats refuse rain, dogs love it, snake freezes in cold,
 * husky loves snow, etc.) and the wet/shake-off mechanics that make
 * rainy-day play physically comedic.
 */

import type {
  Species,
  Animal,
  Weather,
  TimeOfDay,
  Season,
  GardenWeather,
} from '@arc/shared-types';

// ── Deterministic RNG (mulberry32) ───────────────────────────

/**
 * Mulberry32 — a tiny fast PRNG. We seed it from (day-of-year + year)
 * so two runs of the same game-day produce the same forecast.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick<T>(items: Array<[T, number]>, rand: () => number): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

// ── Seasonal probability tables ──────────────────────────────

/**
 * Per-season weather weights. Sums per season don't have to total 100
 * — weightedPick normalises.
 *
 * Patterns reflect a temperate northern-hemisphere garden:
 *   spring_bloom — mixed, wet mornings, sunny spells
 *   summer_warmth — mostly sunny, occasional heavy rain
 *   autumn_hush — cloudy, windy, dewy, leaves blowing
 *   winter_cosy — snow, overcast, fog, rare sunny days
 */
const SEASON_WEATHER_WEIGHTS: Record<Season, Array<[Weather, number]>> = {
  spring_bloom: [
    ['sunny', 35], ['cloudy', 25], ['light_rain', 25],
    ['overcast', 10], ['windy', 5],
  ],
  summer_warmth: [
    ['sunny', 55], ['cloudy', 25], ['heavy_rain', 10],
    ['overcast', 5], ['windy', 5],
  ],
  autumn_hush: [
    ['cloudy', 30], ['overcast', 25], ['light_rain', 20],
    ['windy', 15], ['fog', 5], ['sunny', 5],
  ],
  winter_cosy: [
    ['overcast', 30], ['snow', 25], ['cloudy', 20],
    ['light_rain', 10], ['fog', 10], ['sunny', 5],
  ],
};

// ── Forecast generation ──────────────────────────────────────

/**
 * Deterministically generate a 4-phase forecast for a given in-game day.
 * Seeded from the day itself so the same day always produces the same
 * weather — reloading the game doesn't reshuffle.
 *
 * Rule: max ONE extreme event (heavy_rain or snow) per day, to avoid
 * triple-blizzard chaos that would feel unfair.
 */
export function generateDailyWeather(
  day: { year: number; month: number; day: number },
  season: Season,
  seed = 0,
): GardenWeather {
  const dayKey = day.year * 10000 + day.month * 100 + day.day;
  const rand = mulberry32(dayKey + seed);
  const table = SEASON_WEATHER_WEIGHTS[season];

  const phases: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];
  const forecast: Record<TimeOfDay, Weather> = {
    morning: 'sunny', afternoon: 'sunny', evening: 'sunny', night: 'sunny',
  };

  let extremeUsed = false;
  for (const phase of phases) {
    let pick = weightedPick(table, rand);
    // Demote a second extreme event to its lighter cousin.
    if ((pick === 'heavy_rain' || pick === 'snow') && extremeUsed) {
      pick = pick === 'heavy_rain' ? 'light_rain' : 'overcast';
    }
    if (pick === 'heavy_rain' || pick === 'snow') extremeUsed = true;
    forecast[phase] = pick;
  }

  const forDay = `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
  return {
    current: forecast.morning,
    forecast,
    setAt: new Date().toISOString(),
    forDay,
  };
}

/**
 * Advance the current weather slot to match the given phase. Called
 * by the game loop whenever time.ts reports a phase change.
 */
export function advanceWeatherToPhase(
  weather: GardenWeather,
  phase: TimeOfDay,
  now: Date = new Date(),
): GardenWeather {
  const next = weather.forecast[phase];
  if (next === weather.current) return weather;
  return {
    ...weather,
    current: next,
    setAt: now.toISOString(),
  };
}

// ── Tolerance tables ─────────────────────────────────────────

/**
 * Per-species rain tolerance. Used to gate the let-outside decision
 * and to compute happiness effects when an animal is outdoors in rain.
 *
 * - hates:     refuses to go out; forcing = happiness penalty
 * - dislikes:  goes out glumly; small happiness penalty
 * - tolerant:  neutral
 * - loves:     happiness bonus + wet state on return (dog shake-off)
 */
export type RainTolerance = 'hates' | 'dislikes' | 'tolerant' | 'loves';
const RAIN_TOLERANCE: Record<Species, RainTolerance> = {
  cat:    'hates',
  dog:    'loves',
  bunny:  'dislikes',
  parrot: 'hates',
  fox:    'tolerant',
  bat:    'hates',
  snake:  'hates',
};

export type ColdTolerance = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
/**
 * Base per-species cold tolerance. Variants can override this — huskies
 * are 'very_high' dogs, arctic foxes are 'very_high' foxes — see
 * `getSpeciesColdTolerance` below.
 */
const COLD_TOLERANCE: Record<Species, ColdTolerance> = {
  cat:    'low',
  dog:    'medium',
  bunny:  'low',
  parrot: 'very_low',
  fox:    'high',
  bat:    'medium',
  snake:  'very_low',
};

/** Variants that bump their species' cold tolerance to 'very_high'. */
const COLD_HARDY_VARIANTS: Record<string, true> = {
  'dog-husky': true,
  'fox-arctic': true,
  'cat-white': true,       // thick fluffy white cats
  'bat-white': true,       // arctic-tolerant bat variant
  'bunny-arctic': true,    // new purpose-built winter bunny — replaces
                           // misuse of angora for cold-weather play
};

export function getSpeciesRainTolerance(species: Species): RainTolerance {
  return RAIN_TOLERANCE[species];
}

export function getSpeciesColdTolerance(
  species: Species,
  variant?: string,
): ColdTolerance {
  if (variant && COLD_HARDY_VARIANTS[`${species}-${variant}`]) return 'very_high';
  return COLD_TOLERANCE[species];
}

// ── Weather classification ───────────────────────────────────

/** Is this weather "rainy" (triggers wet effects)? */
export function isRainy(w: Weather): boolean {
  return w === 'light_rain' || w === 'heavy_rain';
}
/** Is this weather "cold" (triggers coat-required checks)? */
export function isCold(w: Weather): boolean {
  return w === 'snow' || w === 'fog';
}

// ── Coat-required gate ──────────────────────────────────────

/**
 * Does this animal need a wardrobe item (coat/scarf/hat) to safely
 * go outside in the current weather? Used by `canLetOutside` gating
 * in garden.ts (which imports this helper).
 */
export function needsCoat(animal: Animal, weather: Weather): boolean {
  if (isCold(weather) || weather === 'snow') {
    const tol = getSpeciesColdTolerance(animal.species, animal.variant);
    // very_high ignores cold; high needs coat only in snow; otherwise yes
    if (tol === 'very_high') return false;
    if (tol === 'high' && weather !== 'snow') return false;
    return true;
  }
  return false;
}

// ── Rain happiness effect ───────────────────────────────────

/**
 * Per-tick happiness change for an animal outdoors in a given weather.
 * Positive = animal enjoys the weather; negative = distressed.
 * Returns the delta — caller applies it (see GameScene tick loop).
 */
export function rainHappinessDelta(animal: Animal, weather: Weather): number {
  if (!isRainy(weather)) return 0;
  const tol = RAIN_TOLERANCE[animal.species];
  const intensity = weather === 'heavy_rain' ? 2 : 1;
  switch (tol) {
    case 'loves':    return +2 * intensity;
    case 'tolerant': return 0;
    case 'dislikes': return -1 * intensity;
    case 'hates':    return -3 * intensity;
  }
}

// ── Wet + shake-off mechanics ───────────────────────────────

/**
 * Duration an animal stays "wet" (in ms). Auto-dries after this unless
 * the player towels them off (instant) or grooms them.
 */
export const WET_DURATION_MS = 2 * 60 * 1000;  // 2 real minutes

/**
 * Mark an animal as wet with an auto-dry timestamp. Called when a
 * rain-lover (or any animal forced out in rain) is brought back in.
 */
export function markWet(
  animal: Animal,
  now: Date = new Date(),
): Animal {
  const until = new Date(now.getTime() + WET_DURATION_MS).toISOString();
  return { ...animal, wet: true, wetUntil: until };
}

/**
 * Dry an animal (via toweling or time expiry). Clears `wet` + `wetUntil`.
 */
export function dry(animal: Animal): Animal {
  if (!animal.wet && !animal.wetUntil) return animal;
  const next = { ...animal };
  delete next.wet;
  delete next.wetUntil;
  return next;
}

/**
 * Check whether an animal's wet timer has expired and it should auto-dry.
 */
export function shouldAutoDry(animal: Animal, now: Date = new Date()): boolean {
  if (!animal.wet || !animal.wetUntil) return false;
  return new Date(animal.wetUntil).getTime() <= now.getTime();
}

export interface ShakeOffEffect {
  /** The wet dog after shaking — still wet, just shook off some water */
  shaker: Animal;
  /** Nearby animals after being splashed — with happiness delta applied */
  splashed: Animal[];
  /** Informational: which species were splashed and their delta */
  splashes: Array<{ id: string; delta: number }>;
}

/**
 * The big comedy moment: a wet dog shakes off, splashing nearby animals.
 * Each nearby animal gets a happiness delta based on their species:
 *
 * - Cats: hate it, −3 (with grumpy reaction trigger for the UI)
 * - Dogs: love it, +2 (join-in energy)
 * - Bunny/Parrot: slight dislike −1
 * - Fox/Bat/Snake: neutral 0
 *
 * The shaker stays wet (one shake doesn't fully dry) and caller can
 * optionally auto-dry or decrement the wet timer.
 */
export function applyShakeOff(
  shaker: Animal,
  nearbyAnimals: Animal[],
): ShakeOffEffect {
  const splashReaction: Record<Species, number> = {
    cat:    -3,
    dog:    +2,
    bunny:  -1,
    parrot: -1,
    fox:     0,
    bat:     0,
    snake:   0,
  };
  const splashed: Animal[] = [];
  const splashes: Array<{ id: string; delta: number }> = [];
  for (const a of nearbyAnimals) {
    if (a.id === shaker.id) continue;
    const delta = splashReaction[a.species];
    const newHappiness = Math.max(0, Math.min(100, a.happiness + delta));
    splashed.push({ ...a, happiness: newHappiness });
    splashes.push({ id: a.id, delta });
  }
  return { shaker, splashed, splashes };
}
