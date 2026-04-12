/**
 * Pure validation functions for auth inputs.
 * These run on both client and server — no crypto, just validation.
 */

export function validatePin(pin: string): { valid: boolean; error?: string } {
  if (!pin || typeof pin !== 'string') return { valid: false, error: 'PIN is required' };
  if (pin.length !== 4) return { valid: false, error: 'PIN must be exactly 4 digits' };
  if (!/^\d{4}$/.test(pin)) return { valid: false, error: 'PIN must contain only numbers' };
  return { valid: true };
}

export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || typeof username !== 'string') return { valid: false, error: 'Username is required' };
  if (username.length < 6) return { valid: false, error: 'Username too short' };
  if (username.length > 18) return { valid: false, error: 'Username too long' };
  return { valid: true };
}

export function validateJoinCode(code: string): { valid: boolean; error?: string } {
  if (!code || typeof code !== 'string') return { valid: false, error: 'Join code is required' };
  const normalised = code.toUpperCase().trim();
  if (!/^[A-Z]{3}-\d{3}$/.test(normalised)) {
    return { valid: false, error: 'Join code must be like FOX-428' };
  }
  return { valid: true };
}

export function validateAvatarEmoji(emoji: string): { valid: boolean; error?: string } {
  if (!emoji || typeof emoji !== 'string') return { valid: false, error: 'Avatar emoji is required' };
  if (emoji.length > 4) return { valid: false, error: 'Invalid emoji' }; // allow multi-byte
  return { valid: true };
}

export function validateAvatarBgColour(colour: string): { valid: boolean; error?: string } {
  if (!colour || typeof colour !== 'string') return { valid: false, error: 'Background colour is required' };
  if (!/^#[0-9A-Fa-f]{6}$/.test(colour)) return { valid: false, error: 'Invalid hex colour' };
  return { valid: true };
}

/**
 * Check a username against the moderation filters from §5.3.
 * Returns true if the name is safe.
 */
export function isUsernameSafe(username: string): { safe: boolean; reason?: string } {
  const lower = username.toLowerCase();

  // No numbers or special characters (except internal caps)
  if (/[^a-zA-Z]/.test(username)) {
    return { safe: false, reason: 'No numbers or special characters allowed' };
  }

  // Length check
  if (username.length < 6 || username.length > 18) {
    return { safe: false, reason: 'Must be 6–18 characters' };
  }

  // Blocklist (minimal — expand in production)
  const blocklist = [
    'admin', 'moderator', 'system', 'support', 'official',
    'password', 'login', 'signup', 'delete', 'null', 'undefined',
  ];
  if (blocklist.some((w) => lower.includes(w))) {
    return { safe: false, reason: 'Contains blocked word' };
  }

  return { safe: true };
}
