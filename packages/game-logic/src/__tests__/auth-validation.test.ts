import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  validatePin,
  validateUsername,
  validateJoinCode,
  validateAvatarEmoji,
  validateAvatarBgColour,
  isUsernameSafe,
  validateAnimalName,
} from '../auth-validation';

describe('validatePin', () => {
  it('accepts valid 4-digit PINs', () => {
    expect(validatePin('1234')).toEqual({ valid: true });
    expect(validatePin('0000')).toEqual({ valid: true });
    expect(validatePin('9999')).toEqual({ valid: true });
  });

  it('rejects empty/missing', () => {
    expect(validatePin('')).toMatchObject({ valid: false });
    expect(validatePin(null as unknown as string)).toMatchObject({ valid: false });
  });

  it('rejects wrong length', () => {
    expect(validatePin('123')).toMatchObject({ valid: false });
    expect(validatePin('12345')).toMatchObject({ valid: false });
  });

  it('rejects non-numeric', () => {
    expect(validatePin('abcd')).toMatchObject({ valid: false });
    expect(validatePin('12a4')).toMatchObject({ valid: false });
  });
});

describe('validateUsername', () => {
  it('accepts valid usernames', () => {
    expect(validateUsername('BrambleFox')).toEqual({ valid: true });
    expect(validateUsername('CloverPaws')).toEqual({ valid: true });
    // Short kid names allowed (min 2 chars)
    expect(validateUsername('Lily')).toEqual({ valid: true });
    expect(validateUsername('Ben')).toEqual({ valid: true });
    expect(validateUsername('Hi')).toEqual({ valid: true });
  });

  it('rejects too-short names', () => {
    expect(validateUsername('A')).toMatchObject({ valid: false });
  });

  it('rejects long names', () => {
    expect(validateUsername('A'.repeat(19))).toMatchObject({ valid: false });
  });

  it('rejects empty', () => {
    expect(validateUsername('')).toMatchObject({ valid: false });
  });
});

describe('validateJoinCode', () => {
  it('accepts valid codes', () => {
    expect(validateJoinCode('FOX-428')).toEqual({ valid: true });
    expect(validateJoinCode('owl-123')).toEqual({ valid: true }); // case insensitive
    expect(validateJoinCode('BAT-999')).toEqual({ valid: true });
  });

  it('accepts the longer animals the word list grew in 2026-10', () => {
    // The shape did not change, only how long the animal may be. A code
    // minted before the list grew is still in a child's hands.
    expect(validateJoinCode('OTTER-317')).toEqual({ valid: true });
    expect(validateJoinCode('badger-902')).toEqual({ valid: true });
    expect(validateJoinCode('PENGUIN-100')).toEqual({ valid: true });
  });

  it('rejects invalid formats', () => {
    expect(validateJoinCode('FOX428')).toMatchObject({ valid: false });
    expect(validateJoinCode('FO-428')).toMatchObject({ valid: false });
    expect(validateJoinCode('FOXX-42')).toMatchObject({ valid: false });
    expect(validateJoinCode('ELEPHANTS-428')).toMatchObject({ valid: false });
    expect(validateJoinCode('')).toMatchObject({ valid: false });
  });
});

describe('the animals a join code can start with', () => {
  /**
   * The list lives in an Edge Function and the pattern that admits it
   * lives here, in another package, so the two can drift apart without
   * anything failing until a child cannot add a friend. This reads the
   * list as the generator has it and holds the two together.
   */
  const ROOT = path.resolve(__dirname, '../../../..');
  const source = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/crypto.ts'), 'utf-8');
  const block = source.match(/const JOIN_CODE_ANIMALS = \[([\s\S]*?)\];/);
  const animals = (block?.[1] ?? '').match(/'([A-Z]+)'/g)?.map((s) => s.slice(1, -1)) ?? [];

  it('every one of them makes a code this validator accepts', () => {
    expect(animals.length).toBeGreaterThan(0);
    expect(animals.filter((a) => !validateJoinCode(`${a}-428`).valid)).toEqual([]);
  });

  it('holds at least 150 animals, so the code space is not a ceiling', () => {
    // 20 animals gave 18,000 codes, and join_code is unique: that was the
    // most accounts the game could ever have. 150 gives 135,000.
    expect(animals.length).toBeGreaterThanOrEqual(150);
    expect(animals.length * 900).toBeGreaterThanOrEqual(135_000);
  });

  it('has no duplicates, which would quietly shrink the space', () => {
    expect(animals.length - new Set(animals).size).toBe(0);
  });

  it('keeps the first twenty, because those codes are already in use', () => {
    expect(animals.slice(0, 20)).toEqual([
      'FOX', 'OWL', 'BAT', 'CAT', 'DOG', 'BEE', 'ELK', 'RAM', 'YAK', 'COW',
      'HEN', 'JAY', 'KOI', 'EMU', 'APE', 'BUG', 'FLY', 'PIG', 'RAT', 'COD',
    ]);
  });

  it('is readable aloud: 3 to 7 letters, nothing else', () => {
    expect(animals.filter((a) => !/^[A-Z]{3,7}$/.test(a))).toEqual([]);
  });

  it('is admitted by every copy of the pattern, not just this one', () => {
    // The friends page and the overlay each normalise a typed code with
    // their own regex, because one is in an iframe and the other is not.
    // Three copies of a rule drift, and the drift shows up as a child
    // being told a perfectly good code is wrong.
    const longest = animals.reduce((a, b) => (b.length > a.length ? b : a), '');
    for (const rel of [
      'apps/game/public/admin/friends.html',
      'apps/game/src/auth-overlay/AuthOverlay.ts',
    ]) {
      const copy = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
      const pattern = copy.match(/\/\^\(\[A-Z\]\{(\d+),(\d+)\}\)/);
      expect(pattern, `${rel} has no join-code pattern`).not.toBeNull();
      const [, min, max] = pattern!;
      expect(Number(min), rel).toBeLessThanOrEqual(3);
      expect(Number(max), rel).toBeGreaterThanOrEqual(longest.length);
    }
  });

  it('avoids the animals that sound like another word a child would type', () => {
    // EWE/you, GNU/new, DOE/dough, BOAR/bore. A code is often read out to
    // a friend, and a homophone turns that into a code that does not work.
    expect(animals.filter((a) => ['EWE', 'GNU', 'DOE', 'BOAR'].includes(a))).toEqual([]);
  });
});

describe('validateAvatarEmoji', () => {
  it('accepts emoji', () => {
    expect(validateAvatarEmoji('🐱')).toEqual({ valid: true });
    expect(validateAvatarEmoji('🐿️')).toEqual({ valid: true }); // multi-byte
  });

  it('rejects empty', () => {
    expect(validateAvatarEmoji('')).toMatchObject({ valid: false });
  });
});

describe('validateAvatarBgColour', () => {
  it('accepts hex colours', () => {
    expect(validateAvatarBgColour('#FFB3BA')).toEqual({ valid: true });
    expect(validateAvatarBgColour('#000000')).toEqual({ valid: true });
  });

  it('rejects non-hex', () => {
    expect(validateAvatarBgColour('red')).toMatchObject({ valid: false });
    expect(validateAvatarBgColour('#GGG')).toMatchObject({ valid: false });
    expect(validateAvatarBgColour('')).toMatchObject({ valid: false });
  });
});

describe('isUsernameSafe', () => {
  it('approves safe usernames', () => {
    expect(isUsernameSafe('BrambleFox')).toEqual({ safe: true });
    expect(isUsernameSafe('MoonBunny')).toEqual({ safe: true });
    expect(isUsernameSafe('ZigzagZephyr')).toEqual({ safe: true });
  });

  it('rejects names with numbers', () => {
    expect(isUsernameSafe('Fox123')).toMatchObject({ safe: false });
  });

  it('rejects names with special characters', () => {
    expect(isUsernameSafe('Fox-Paw')).toMatchObject({ safe: false });
    expect(isUsernameSafe('Fox_Paw')).toMatchObject({ safe: false });
  });

  it('rejects blocklisted words', () => {
    expect(isUsernameSafe('AdminFox')).toMatchObject({ safe: false });
    expect(isUsernameSafe('SystemPaws')).toMatchObject({ safe: false });
  });

  it('rejects too short', () => {
    expect(isUsernameSafe('Fox')).toMatchObject({ safe: false });
  });

  it('rejects too long', () => {
    expect(isUsernameSafe('A'.repeat(19))).toMatchObject({ safe: false });
  });
});

describe('validateAnimalName', () => {
  it('accepts ordinary kid-chosen names', () => {
    expect(validateAnimalName('Marmalade')).toEqual({ valid: true });
    expect(validateAnimalName('Pumpkin')).toEqual({ valid: true });
    expect(validateAnimalName('Pip')).toEqual({ valid: true });
    expect(validateAnimalName("O'Malley")).toEqual({ valid: true });
    expect(validateAnimalName('Mary-Anne')).toEqual({ valid: true });
    expect(validateAnimalName('Sir Whiskers')).toEqual({ valid: true });
  });

  it('rejects empty / too short / too long', () => {
    expect(validateAnimalName('')).toMatchObject({ valid: false });
    expect(validateAnimalName('A')).toMatchObject({ valid: false });
    expect(validateAnimalName('A'.repeat(20))).toMatchObject({ valid: false });
  });

  it('rejects digits and special characters', () => {
    expect(validateAnimalName('Cat42')).toMatchObject({ valid: false });
    expect(validateAnimalName('Mr. Whiskers')).toMatchObject({ valid: false });
    expect(validateAnimalName('@@@')).toMatchObject({ valid: false });
  });

  it('rejects toilet humour (the Lily list)', () => {
    expect(validateAnimalName('Poop')).toMatchObject({ valid: false });
    expect(validateAnimalName('Poopy')).toMatchObject({ valid: false });
    expect(validateAnimalName('Mr Poopface')).toMatchObject({ valid: false });
    expect(validateAnimalName('Fart')).toMatchObject({ valid: false });
    expect(validateAnimalName('Bumface')).toMatchObject({ valid: false });
    expect(validateAnimalName('Wee Wee')).toMatchObject({ valid: false });
  });

  it('rejects swears and slurs', () => {
    expect(validateAnimalName('Shitcat')).toMatchObject({ valid: false });
    expect(validateAnimalName('Fucky')).toMatchObject({ valid: false });
    expect(validateAnimalName('Bastardo')).toMatchObject({ valid: false });
  });

  it('rejects system reserved words', () => {
    expect(validateAnimalName('Admin')).toMatchObject({ valid: false });
    expect(validateAnimalName('SystemCat')).toMatchObject({ valid: false });
  });
});
