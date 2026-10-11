import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DISPLAY_NAME_ADJECTIVES,
  DISPLAY_NAME_ANIMALS,
  DISPLAY_NAME_SKIPPED_NUMBERS,
} from '../display-names';

/**
 * The display-name word lists live in places that cannot share code: the
 * game (here), the Edge Functions (Deno) and the database, which makes a
 * name for an account that arrives without one and checks every name
 * against the lists. These tests hold the copies to one list.
 */

const ROOT = path.resolve(__dirname, '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

/** The first non-empty [...] from `at`: skips a type such as `text[]`. */
function listBounds(source: string, at: number): [number, number] {
  let open = source.indexOf('[', at);
  while (open >= 0 && source[open + 1] === ']') open = source.indexOf('[', open + 1);
  return [open, source.indexOf(']', open)];
}

/** The quoted words in the first [...] after `marker`. */
function wordsAfter(source: string, marker: string): string[] {
  const at = source.indexOf(marker);
  expect(at, `${marker} is in the file`).toBeGreaterThanOrEqual(0);
  const [open, close] = listBounds(source, at);
  return [...source.slice(open, close).matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
}

/** The numbers in the first [...] after `marker`. */
function numbersAfter(source: string, marker: string): number[] {
  const at = source.indexOf(marker);
  expect(at, `${marker} is in the file`).toBeGreaterThanOrEqual(0);
  const [open, close] = listBounds(source, at);
  return [...source.slice(open, close).matchAll(/\d+/g)].map((m) => Number(m[0]));
}

describe('display names: one list everywhere', () => {
  it('the Edge Functions use the same words and skip the same numbers', () => {
    const src = read('supabase/functions/_shared/display-names.ts');
    expect(wordsAfter(src, 'DISPLAY_NAME_ADJECTIVES =')).toEqual([...DISPLAY_NAME_ADJECTIVES]);
    expect(wordsAfter(src, 'DISPLAY_NAME_ANIMALS =')).toEqual([...DISPLAY_NAME_ANIMALS]);
    expect(numbersAfter(src, 'DISPLAY_NAME_SKIPPED_NUMBERS =')).toEqual([...DISPLAY_NAME_SKIPPED_NUMBERS]);
  });

  it('the database makes and checks names from the same words', () => {
    const sql = read('supabase/migrations/00014_display_names.sql');
    expect(wordsAfter(sql, 'function arc_display_name_adjectives()')).toEqual([...DISPLAY_NAME_ADJECTIVES]);
    expect(wordsAfter(sql, 'function arc_display_name_animals()')).toEqual([...DISPLAY_NAME_ANIMALS]);
    expect(numbersAfter(sql, 'function arc_display_name_skipped_numbers()')).toEqual([...DISPLAY_NAME_SKIPPED_NUMBERS]);
  });
});
