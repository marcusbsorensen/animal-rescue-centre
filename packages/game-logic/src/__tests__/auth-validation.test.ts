import { describe, it, expect } from 'vitest';
import {
  validatePin,
  validateUsername,
  validateJoinCode,
  validateAvatarEmoji,
  validateAvatarBgColour,
  isUsernameSafe,
  validatePinHint,
  getHintIdeas,
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

  it('rejects invalid formats', () => {
    expect(validateJoinCode('FOX428')).toMatchObject({ valid: false });
    expect(validateJoinCode('FO-428')).toMatchObject({ valid: false });
    expect(validateJoinCode('FOXX-42')).toMatchObject({ valid: false });
    expect(validateJoinCode('')).toMatchObject({ valid: false });
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

describe('validatePinHint', () => {
  it('accepts a sensible word-based hint', () => {
    expect(validatePinHint("my dog's birthday", '1234')).toEqual({ valid: true });
    expect(validatePinHint('the year mum was born', '1985')).toEqual({ valid: true });
    expect(validatePinHint('door number plus 10', '4711')).toEqual({ valid: true });
  });

  it('rejects empty / too short / too long', () => {
    expect(validatePinHint('', '1234')).toMatchObject({ valid: false });
    expect(validatePinHint('a', '1234')).toMatchObject({ valid: false });
    expect(validatePinHint('A'.repeat(80), '1234')).toMatchObject({ valid: false });
  });

  it('rejects literal PIN substring', () => {
    expect(validatePinHint('my pin is 1234', '1234')).toMatchObject({ valid: false });
    expect(validatePinHint('the code 0000 is mine', '0000')).toMatchObject({ valid: false });
  });

  it('rejects 3+ consecutive digits of the PIN', () => {
    expect(validatePinHint('starts with 123 something', '1234')).toMatchObject({ valid: false });
    expect(validatePinHint('ends in 234 today', '1234')).toMatchObject({ valid: false });
  });

  it('rejects any 3+ digit numeric run (defensive)', () => {
    expect(validatePinHint('flat 999 minnis road', '1234')).toMatchObject({ valid: false });
    expect(validatePinHint('see page 100', '1234')).toMatchObject({ valid: false });
  });

  it('rejects only-digits hints', () => {
    expect(validatePinHint('1 2 3 4', '1234')).toMatchObject({ valid: false });
    expect(validatePinHint('5678', '1234')).toMatchObject({ valid: false });
  });

  it('rejects spelled-out PIN digits (single words)', () => {
    expect(validatePinHint('one two three four', '1234')).toMatchObject({ valid: false });
    expect(validatePinHint('zero zero zero zero is the code', '0000')).toMatchObject({ valid: false });
    expect(validatePinHint('say one and two and three and four', '1234')).toMatchObject({ valid: false });
  });

  it('rejects spelled-out compound forms', () => {
    expect(validatePinHint('twelve thirty four', '1234')).toMatchObject({ valid: false });
    expect(validatePinHint('twelve thirty-four', '1234')).toMatchObject({ valid: false });
  });

  it('accepts hints that mention small numbers as words but not the PIN', () => {
    expect(validatePinHint('my favourite is two', '5678')).toEqual({ valid: true });
    expect(validatePinHint('three little pigs', '5678')).toEqual({ valid: true });
  });
});

describe('getHintIdeas', () => {
  it('returns 4 ideas', () => {
    expect(getHintIdeas('Lily')).toHaveLength(4);
  });

  it('is deterministic for the same seed', () => {
    expect(getHintIdeas('Lily')).toEqual(getHintIdeas('Lily'));
  });

  it('returns different sets for different kids', () => {
    // 20-deep pool, picking 4 — clash across two random kids should be
    // < all-four-match in practice. Compare two pairs.
    const lily = getHintIdeas('Lily');
    const ben = getHintIdeas('Ben');
    const sam = getHintIdeas('Sam');
    // At least one of (Lily vs Ben) and (Lily vs Sam) should differ.
    const lilyBenDiffer = JSON.stringify(lily) !== JSON.stringify(ben);
    const lilySamDiffer = JSON.stringify(lily) !== JSON.stringify(sam);
    expect(lilyBenDiffer || lilySamDiffer).toBe(true);
  });

  it('returns no duplicates within a kid\'s set', () => {
    const ideas = getHintIdeas('Charlie');
    expect(new Set(ideas).size).toBe(ideas.length);
  });
});
