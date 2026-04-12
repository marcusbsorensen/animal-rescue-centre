import { describe, it, expect } from 'vitest';
import {
  validatePin,
  validateUsername,
  validateJoinCode,
  validateAvatarEmoji,
  validateAvatarBgColour,
  isUsernameSafe,
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
  });

  it('rejects short names', () => {
    expect(validateUsername('Hi')).toMatchObject({ valid: false });
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
