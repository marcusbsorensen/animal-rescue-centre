import { describe, it, expect } from 'vitest';
import type { Animal, Weather } from '@arc/shared-types';
import {
  generateDailyWeather,
  advanceWeatherToPhase,
  getSpeciesRainTolerance,
  getSpeciesColdTolerance,
  isRainy,
  isCold,
  needsCoat,
  rainHappinessDelta,
  markWet,
  dry,
  shouldAutoDry,
  applyShakeOff,
  WET_DURATION_MS,
} from '../weather';

function makeAnimal(id: string, overrides: Partial<Animal> = {}): Animal {
  return {
    id,
    name: 'T ' + id,
    species: 'cat',
    state: 'sheltered',
    arrivalStory: '',
    hunger: 30,
    tiredness: 20,
    happiness: 50,
    health: 100,
    bondLevel: 50,
    roomId: 'room-cat',
    ...overrides,
  };
}

// ── generateDailyWeather ─────────────────────────────────────

describe('generateDailyWeather', () => {
  const day = { year: 2026, month: 4, day: 19 };

  it('returns 4 phase slots + a current slot', () => {
    const w = generateDailyWeather(day, 'spring_bloom');
    expect(w.forecast.morning).toBeDefined();
    expect(w.forecast.afternoon).toBeDefined();
    expect(w.forecast.evening).toBeDefined();
    expect(w.forecast.night).toBeDefined();
    expect(w.current).toBe(w.forecast.morning);
    expect(w.forDay).toBe('2026-04-19');
  });

  it('is deterministic given (day, season, seed)', () => {
    const a = generateDailyWeather(day, 'spring_bloom', 42);
    const b = generateDailyWeather(day, 'spring_bloom', 42);
    expect(a.forecast).toEqual(b.forecast);
  });

  it('different seasons produce different distributions over many days', () => {
    const winterSamples: Weather[] = [];
    const summerSamples: Weather[] = [];
    for (let d = 1; d <= 28; d++) {
      winterSamples.push(generateDailyWeather({ year: 2026, month: 1, day: d }, 'winter_cosy').forecast.afternoon);
      summerSamples.push(generateDailyWeather({ year: 2026, month: 7, day: d }, 'summer_warmth').forecast.afternoon);
    }
    // Winter should have at least some snow; summer should have none.
    expect(winterSamples.filter((w) => w === 'snow').length).toBeGreaterThan(0);
    expect(summerSamples.filter((w) => w === 'snow').length).toBe(0);
    // Summer should be sunny more often than winter is.
    const summerSunny = summerSamples.filter((w) => w === 'sunny').length;
    const winterSunny = winterSamples.filter((w) => w === 'sunny').length;
    expect(summerSunny).toBeGreaterThan(winterSunny);
  });

  it('never stacks two extreme events in one day', () => {
    // Hammer many days and check no day has >1 extreme event
    for (let d = 1; d <= 31; d++) {
      const w = generateDailyWeather({ year: 2026, month: 1, day: d }, 'winter_cosy');
      const extremes = Object.values(w.forecast).filter((x) => x === 'heavy_rain' || x === 'snow').length;
      expect(extremes).toBeLessThanOrEqual(1);
    }
  });
});

// ── advanceWeatherToPhase ────────────────────────────────────

describe('advanceWeatherToPhase', () => {
  it('updates current when phase changes', () => {
    const w = generateDailyWeather({ year: 2026, month: 4, day: 19 }, 'spring_bloom', 1);
    const advanced = advanceWeatherToPhase(w, 'afternoon');
    expect(advanced.current).toBe(w.forecast.afternoon);
  });
  it('returns same reference if current already matches', () => {
    const w = generateDailyWeather({ year: 2026, month: 4, day: 19 }, 'spring_bloom', 1);
    const sameCurrent = advanceWeatherToPhase(w, 'morning');
    expect(sameCurrent).toBe(w);
  });
});

// ── tolerance tables ─────────────────────────────────────────

describe('getSpeciesRainTolerance', () => {
  it('cats hate rain, dogs love it, foxes tolerate', () => {
    expect(getSpeciesRainTolerance('cat')).toBe('hates');
    expect(getSpeciesRainTolerance('dog')).toBe('loves');
    expect(getSpeciesRainTolerance('fox')).toBe('tolerant');
    expect(getSpeciesRainTolerance('bunny')).toBe('dislikes');
  });
});

describe('getSpeciesColdTolerance', () => {
  it('base tolerance per species', () => {
    expect(getSpeciesColdTolerance('parrot')).toBe('very_low');
    expect(getSpeciesColdTolerance('snake')).toBe('very_low');
    expect(getSpeciesColdTolerance('fox')).toBe('high');
    expect(getSpeciesColdTolerance('cat')).toBe('low');
  });
  it('variants override species base', () => {
    expect(getSpeciesColdTolerance('dog', 'husky')).toBe('very_high');
    expect(getSpeciesColdTolerance('dog', 'pug')).toBe('medium');
    expect(getSpeciesColdTolerance('fox', 'arctic')).toBe('very_high');
    expect(getSpeciesColdTolerance('fox', 'red')).toBe('high');
    expect(getSpeciesColdTolerance('cat', 'white')).toBe('very_high');
    expect(getSpeciesColdTolerance('bunny', 'arctic')).toBe('very_high');
    // angora is no longer cold-hardy — arctic bunny replaced it for winter
    expect(getSpeciesColdTolerance('bunny', 'angora')).toBe('low');
  });
});

// ── classifiers ──────────────────────────────────────────────

describe('isRainy / isCold', () => {
  it('classifies rain states', () => {
    expect(isRainy('light_rain')).toBe(true);
    expect(isRainy('heavy_rain')).toBe(true);
    expect(isRainy('sunny')).toBe(false);
    expect(isRainy('snow')).toBe(false);
  });
  it('classifies cold states', () => {
    expect(isCold('snow')).toBe(true);
    expect(isCold('fog')).toBe(true);
    expect(isCold('sunny')).toBe(false);
  });
});

// ── needsCoat ────────────────────────────────────────────────

describe('needsCoat', () => {
  const cat    = makeAnimal('c', { species: 'cat' });
  const husky  = makeAnimal('h', { species: 'dog',   variant: 'husky' });
  const pug    = makeAnimal('p', { species: 'dog',   variant: 'pug' });
  const fox    = makeAnimal('f', { species: 'fox',   variant: 'red' });
  const parrot = makeAnimal('b', { species: 'parrot' });

  it('returns false when weather is warm', () => {
    expect(needsCoat(cat, 'sunny')).toBe(false);
    expect(needsCoat(cat, 'cloudy')).toBe(false);
    expect(needsCoat(cat, 'light_rain')).toBe(false);
  });
  it('husky + arctic fox ignore cold entirely', () => {
    expect(needsCoat(husky, 'snow')).toBe(false);
    expect(needsCoat(husky, 'fog')).toBe(false);
  });
  it('high-tolerance species still need coat in snow', () => {
    expect(needsCoat(fox, 'snow')).toBe(true);
    expect(needsCoat(fox, 'fog')).toBe(false);
  });
  it('cold-intolerant species always need coat in cold', () => {
    expect(needsCoat(cat, 'snow')).toBe(true);
    expect(needsCoat(pug, 'snow')).toBe(true);
    expect(needsCoat(parrot, 'fog')).toBe(true);
  });
});

// ── rainHappinessDelta ───────────────────────────────────────

describe('rainHappinessDelta', () => {
  it('zero for non-rain weather', () => {
    expect(rainHappinessDelta(makeAnimal('a'), 'sunny')).toBe(0);
    expect(rainHappinessDelta(makeAnimal('a'), 'snow')).toBe(0);
  });
  it('dogs LOVE rain (+2 light, +4 heavy)', () => {
    const dog = makeAnimal('d', { species: 'dog' });
    expect(rainHappinessDelta(dog, 'light_rain')).toBe(2);
    expect(rainHappinessDelta(dog, 'heavy_rain')).toBe(4);
  });
  it('cats HATE rain (-3 light, -6 heavy)', () => {
    const cat = makeAnimal('c', { species: 'cat' });
    expect(rainHappinessDelta(cat, 'light_rain')).toBe(-3);
    expect(rainHappinessDelta(cat, 'heavy_rain')).toBe(-6);
  });
  it('bunny dislikes rain lightly', () => {
    const bunny = makeAnimal('b', { species: 'bunny' });
    expect(rainHappinessDelta(bunny, 'light_rain')).toBe(-1);
  });
  it('fox is tolerant', () => {
    const fox = makeAnimal('f', { species: 'fox' });
    expect(rainHappinessDelta(fox, 'heavy_rain')).toBe(0);
  });
});

// ── wet / shake-off ──────────────────────────────────────────

describe('markWet / dry / shouldAutoDry', () => {
  it('markWet sets wet + wetUntil', () => {
    const now = new Date('2026-04-19T12:00:00Z');
    const a = markWet(makeAnimal('a'), now);
    expect(a.wet).toBe(true);
    const ms = new Date(a.wetUntil!).getTime() - now.getTime();
    expect(ms).toBe(WET_DURATION_MS);
  });
  it('dry clears wet + wetUntil', () => {
    const wet = markWet(makeAnimal('a'));
    const dried = dry(wet);
    expect(dried.wet).toBeUndefined();
    expect(dried.wetUntil).toBeUndefined();
  });
  it('dry is a no-op for already-dry animals', () => {
    const a = makeAnimal('a');
    expect(dry(a)).toBe(a);
  });
  it('shouldAutoDry true only after timer expires', () => {
    const now = new Date('2026-04-19T12:00:00Z');
    const wet = markWet(makeAnimal('a'), now);
    expect(shouldAutoDry(wet, now)).toBe(false);
    const later = new Date(now.getTime() + WET_DURATION_MS + 1);
    expect(shouldAutoDry(wet, later)).toBe(true);
  });
});

describe('applyShakeOff', () => {
  const dog = makeAnimal('shaker', { species: 'dog' });

  it('splashed cats lose happiness', () => {
    const cat = makeAnimal('c', { species: 'cat', happiness: 70 });
    const { splashed, splashes } = applyShakeOff(dog, [cat]);
    expect(splashed[0].happiness).toBe(67);
    expect(splashes[0]).toEqual({ id: 'c', delta: -3 });
  });

  it('other dogs gain happiness (join in)', () => {
    const buddy = makeAnimal('d2', { species: 'dog', happiness: 60 });
    const { splashed } = applyShakeOff(dog, [buddy]);
    expect(splashed[0].happiness).toBe(62);
  });

  it('splashing caps happiness within 0..100', () => {
    const happyCat = makeAnimal('c', { species: 'cat', happiness: 1 });
    const { splashed } = applyShakeOff(dog, [happyCat]);
    expect(splashed[0].happiness).toBe(0);

    const happyBuddy = makeAnimal('d2', { species: 'dog', happiness: 99 });
    const { splashed: s2 } = applyShakeOff(dog, [happyBuddy]);
    expect(s2[0].happiness).toBe(100);
  });

  it('ignores the shaker itself', () => {
    const { splashed } = applyShakeOff(dog, [dog]);
    expect(splashed).toHaveLength(0);
  });

  it('snake/fox/bat are neutral (delta 0)', () => {
    const snake = makeAnimal('s', { species: 'snake', happiness: 50 });
    const fox   = makeAnimal('f', { species: 'fox',   happiness: 50 });
    const bat   = makeAnimal('b', { species: 'bat',   happiness: 50 });
    const { splashed } = applyShakeOff(dog, [snake, fox, bat]);
    for (const a of splashed) expect(a.happiness).toBe(50);
  });

  it('does not mutate inputs', () => {
    const cat = makeAnimal('c', { species: 'cat', happiness: 70 });
    applyShakeOff(dog, [cat]);
    expect(cat.happiness).toBe(70);
  });
});
