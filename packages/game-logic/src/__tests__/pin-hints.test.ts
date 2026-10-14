import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PIN_HINT_CHOICES, isPinHintCode, pinHintText } from '../pin-hints';

/**
 * The PIN clue is a choice from a fixed list, never text a child types.
 *
 * It used to be free text of up to 100 characters, stored as typed and
 * handed back to anyone who knew the player's name. A child could write
 * anything about themselves in it.
 *
 * The list lives in five places that cannot share code: here, the signup
 * page (static HTML), the Edge Functions (Deno), and the database's own
 * check constraint. These tests hold them to one list.
 */

const ROOT = path.resolve(__dirname, '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');
const CODES = PIN_HINT_CHOICES.map((c) => c.code);

/** `{ code: 'x', text: 'Y' }` pairs, in order, from any source file. */
function pairsIn(source: string): Array<{ code: string; text: string }> {
  return [...source.matchAll(/code:\s*'([a-z_]+)',\s*text:\s*'([^']+)'/g)]
    .map((m) => ({ code: m[1], text: m[2] }));
}

describe('PIN clue choices', () => {
  it('has codes that are unique, short and lower case', () => {
    expect(new Set(CODES).size).toBe(CODES.length);
    for (const code of CODES) expect(code).toMatch(/^[a-z_]{2,16}$/);
  });

  it('has words short enough for a child to read at a glance', () => {
    for (const { text } of PIN_HINT_CHOICES) {
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(24);
    }
  });

  it('never suggests a number that is personal data', () => {
    // A phone number, a house number or a school would each point at
    // where a child lives or can be found. The old idea pool suggested
    // "your phone's last four numbers" and "your house number, twice".
    const all = PIN_HINT_CHOICES.map((c) => c.text.toLowerCase()).join(' | ');
    for (const word of ['phone', 'house', 'address', 'street', 'school', 'postcode', 'door']) {
      expect(all).not.toContain(word);
    }
  });

  it('accepts only codes on the list', () => {
    for (const code of CODES) expect(isPinHintCode(code)).toBe(true);
    expect(isPinHintCode('')).toBe(false);
    expect(isPinHintCode('Birthday')).toBe(false);
    expect(isPinHintCode('birthday ')).toBe(false);
    expect(isPinHintCode('my dog was born in 2019')).toBe(false);
    expect(isPinHintCode(null)).toBe(false);
    expect(isPinHintCode(42)).toBe(false);
  });

  it('turns a code into its words, and anything else into null', () => {
    expect(pinHintText(CODES[0])).toBe(PIN_HINT_CHOICES[0].text);
    expect(pinHintText('something a child typed')).toBeNull();
    expect(pinHintText(null)).toBeNull();
  });
});

describe('PIN clue choices: one list everywhere', () => {
  it('the Edge Functions use the same codes and words', () => {
    expect(pairsIn(read('supabase/functions/_shared/pin-hints.ts'))).toEqual([...PIN_HINT_CHOICES]);
  });

  it('the signup page offers the same codes and words', () => {
    expect(pairsIn(read('apps/game/public/admin/signup.html'))).toEqual([...PIN_HINT_CHOICES]);
  });

  it('the signup page has no free-text clue box left', () => {
    const page = read('apps/game/public/admin/signup.html');
    expect(page).not.toContain('id="hint-input"');
    expect(page).not.toMatch(/<input[^>]*hint/i);
  });

  it('the database accepts the same codes and nothing else', () => {
    const sql = read('supabase/migrations/00010_pin_hint_choice.sql');
    const check = sql.match(/pin_hint_code\s+in\s*\(([^)]*)\)/i);
    expect(check, 'a CHECK (pin_hint_code in (...)) constraint').not.toBeNull();
    const allowed = [...check![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(allowed).toEqual(CODES);
  });
});

describe('PIN clue: the free-text column goes', () => {
  it('00010 blanks every typed hint and stops new ones being stored', () => {
    const sql = read('supabase/migrations/00010_pin_hint_choice.sql').toLowerCase();
    expect(sql).toMatch(/update\s+users\s+set\s+pin_hint\s*=\s*null/);
    // Until 00011 drops the column, an older signup function still
    // deployed could write one. The trigger blanks it on the way in.
    expect(sql).toMatch(/before\s+insert\s+or\s+update\s+(of\s+pin_hint\s+)?on\s+users/);
    expect(sql).toMatch(/new\.pin_hint\s*:=\s*null/);
  });

  it('00011 drops the column and its trigger', () => {
    const sql = read('supabase/migrations/00011_drop_pin_hint.sql').toLowerCase();
    expect(sql).toMatch(/alter\s+table\s+users\s+drop\s+column\s+(if\s+exists\s+)?pin_hint\b/);
    expect(sql).toMatch(/drop\s+trigger/);
  });

  it('no function reads or writes the old column', () => {
    for (const fn of ['signup', 'get-pin-hint', 'login']) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src, fn).not.toMatch(/\bpin_hint\b(?!_code)/);
    }
  });
});
