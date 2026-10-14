import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SIGN_IN_NAME_FIRSTS,
  SIGN_IN_NAME_SECONDS,
  SIGN_IN_NAME_MAX_PAIR_LENGTH,
  SIGN_IN_NAME_MAX_LENGTH,
  signInNamePairs,
  isSignInNamePair,
} from '../sign-in-names';
import {
  DISPLAY_NAME_ADJECTIVES,
  DISPLAY_NAME_ANIMALS,
  allowedDisplayNameNumbers,
  isDisplayName,
} from '../display-names';
import { DENIED_INSIDE } from './name-deny-list';

/**
 * A child's secret sign-in name is picked from names the server offers,
 * made from two word lists: a thing and a thing, for example
 * PebbleKite. These tests read every word and every pair, the way
 * `display-names.test.ts` does for the name friends see. The deny-list
 * is a floor, not the review: the lists were also read by hand.
 */

const FIRSTS = [...SIGN_IN_NAME_FIRSTS];
const SECONDS = [...SIGN_IN_NAME_SECONDS];
/** Every pair, including the long ones the pool leaves out. */
const PAIRS = FIRSTS.flatMap((f) => SECONDS.map((s) => f + s));

/**
 * Words left out on purpose, so that one added later is refused with the
 * reason.
 */
const REFUSED = [
  // children's given names: a sign-in name should not look like a real name
  'Daisy', 'Willow', 'Poppy', 'Ruby', 'Holly', 'Hazel', 'River', 'Olive', 'Rose',
  'Lily', 'Ivy', 'Jasper', 'Basil', 'Maple', 'Coral', 'Echo', 'Ember', 'Teddy',
  'Honey', 'Fern', 'Pepper', 'Rocky', 'Sunny',
  // slang for a body, sex or a person's size
  'Muffin', 'Crumpet', 'Pudding', 'Dumpling', 'Melon', 'Cherry', 'Peach', 'Banana',
  'Nuts', 'Doodle', 'Willy', 'Button', 'Butter', 'Peanut', 'Sausage', 'Bun',
  // rude letters inside them
  'Spoon', 'Shoe', 'Shell', 'Paint', 'Compass', 'Glass', 'Grass', 'Grape', 'Spice',
  'Canal', 'Stable', 'Sweet', 'Bumble', 'Cucumber', 'Twine',
  // rude letters across the join (Moon + Igloo)
  'Igloo',
  // a slur or an insult on its own
  'Spade', 'Mug', 'Fiddle', 'Paddle', 'Pig', 'Cow',
  // close to a word in the display names, so the two names would look alike
  'Breeze', 'Moss', 'Mist', 'Star', 'Sun', 'Snow', 'Leaf', 'Sparkle', 'Twinkle',
  'Bubble', 'Cheer',
  // hard for a young child to spell when signing in on a new device
  'Island', 'Castle', 'Whistle', 'Guitar', 'Thimble', 'Apricot', 'Doughnut', 'Pretzel',
];

describe('sign-in names: the word lists', () => {
  it('has fifty words on each list, and 2,382 pairs short enough for the pool', () => {
    expect(FIRSTS).toHaveLength(50);
    expect(SECONDS).toHaveLength(50);
    expect(new Set(PAIRS).size).toBe(2500);
    expect(new Set(signInNamePairs()).size).toBe(2382);
    expect(Math.max(...signInNamePairs().map((n) => n.length))).toBe(SIGN_IN_NAME_MAX_PAIR_LENGTH);
  });

  it('has each word once, as one capitalised word of letters', () => {
    for (const list of [FIRSTS, SECONDS]) {
      expect(new Set(list).size).toBe(list.length);
      for (const w of list) expect(w).toMatch(/^[A-Z][a-z]{2,7}$/);
    }
    expect(FIRSTS.filter((w) => (SECONDS as string[]).includes(w))).toEqual([]);
  });

  it('keeps every name, with its number, inside the name length the server allows', () => {
    const digits = String(Math.max(...allowedDisplayNameNumbers())).length;
    expect(SIGN_IN_NAME_MAX_PAIR_LENGTH + digits).toBeLessThanOrEqual(SIGN_IN_NAME_MAX_LENGTH);
    expect(SIGN_IN_NAME_MAX_LENGTH).toBeLessThanOrEqual(18);
  });

  it('passes the letters-only rule signup applies to every name', () => {
    const rule = /^[A-Za-z][A-Za-z\s'-]*[A-Za-z]$|^[A-Za-z]$/;
    for (const name of PAIRS) expect(rule.test(name), name).toBe(true);
  });

  it('has no refused word on either list', () => {
    expect([...FIRSTS, ...SECONDS].filter((w) => REFUSED.includes(w))).toEqual([]);
  });

  it('makes no denied letters in any pair, across the join or inside a word', () => {
    const bad: string[] = [];
    for (const name of PAIRS) {
      const joined = name.toLowerCase();
      for (const d of DENIED_INSIDE) if (joined.includes(d)) bad.push(`${name} (${d})`);
    }
    expect(bad).toEqual([]);
  });

  it('never makes a name friends could be shown: no word from the display names, no animal', () => {
    const displayWords = [...DISPLAY_NAME_ADJECTIVES, ...DISPLAY_NAME_ANIMALS] as string[];
    expect([...FIRSTS, ...SECONDS].filter((w) => displayWords.includes(w))).toEqual([]);
    for (const name of PAIRS) {
      expect(isDisplayName(name), name).toBe(false);
      for (const n of allowedDisplayNameNumbers()) {
        if (isDisplayName(`${name}${n}`)) throw new Error(`${name}${n} is a display name`);
      }
    }
  });

  it('knows a pair from the lists, and nothing else', () => {
    expect(isSignInNamePair('PebbleRocket')).toBe(false); // Rocket is a first word
    expect(isSignInNamePair('PebbleKite')).toBe(true);
    expect(isSignInNamePair('RocketKite')).toBe(true);
    expect(isSignInNamePair('PebbleKite2')).toBe(false);
    expect(isSignInNamePair('SprinkleBalloon')).toBe(false); // too long for the pool
    expect(isSignInNamePair('Lily')).toBe(false);
    expect(isSignInNamePair(42)).toBe(false);
  });
});

describe('sign-in names: one list everywhere', () => {
  const ROOT = path.resolve(__dirname, '../../../..');
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/00017_ready_made_sign_in_names.sql'),
    'utf-8',
  );

  function wordsAfter(marker: string): string[] {
    const at = sql.indexOf(marker);
    expect(at, `${marker} is in the migration`).toBeGreaterThanOrEqual(0);
    let open = sql.indexOf('[', at);
    while (open >= 0 && sql[open + 1] === ']') open = sql.indexOf('[', open + 1);
    const close = sql.indexOf(']', open);
    return [...sql.slice(open, close).matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
  }

  it('the database fills the pool from the same words, and the same longest pair', () => {
    expect(wordsAfter('function arc_sign_in_name_firsts()')).toEqual(FIRSTS);
    expect(wordsAfter('function arc_sign_in_name_seconds()')).toEqual(SECONDS);
    const limits = [...sql.matchAll(/length\(f \|\| s\) <= (\d+)/g)].map((m) => Number(m[1]));
    expect(limits).toEqual([SIGN_IN_NAME_MAX_PAIR_LENGTH, SIGN_IN_NAME_MAX_PAIR_LENGTH]);
  });
});
