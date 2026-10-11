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
  // Min 2 characters — short kid names like Lily / Ben / Eve / Sam / Max all valid.
  if (username.length < 2) return { valid: false, error: 'Username too short' };
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

/**
 * Animal-name validator. Used when the kid names their first pet
 * (and any subsequent pet). Three jobs:
 *   1) length sanity (2-16 chars)
 *   2) letters-only-with-internal-spaces (no digits, no punctuation soup)
 *   3) blocklist of toilet humour + mild swears + slurs — kid-friendly
 *      rejection message ("Let's pick something nicer for Pet's tag")
 *
 * The blocklist deliberately covers the obvious 8-year-old attempts
 * (Lily WILL try "Poop") plus the standard adult swear set. Substring
 * match against a normalised lower-case form, so "Poopy", "Poopface",
 * "PoopMcPoop" all reject.
 */
const ANIMAL_NAME_BLOCKLIST: readonly string[] = [
  // Toilet humour (the Lily list)
  'poo', 'poop', 'pee', 'wee', 'fart', 'butt', 'bum',
  'turd', 'snot', 'bogey', 'bogie', 'booger', 'crap',
  // Standard adult swears (substring match)
  'shit', 'fuck', 'cunt', 'bitch', 'arse', 'ass',
  'damn', 'dick', 'cock', 'piss', 'twat', 'bollock',
  'wank', 'bastard', 'prick', 'slut',
  // Slurs / hateful — short list, expand in production
  'nazi', 'retard',
  // Reserved system words — same family as username blocklist
  'admin', 'system', 'null', 'undefined',
];

export function validateAnimalName(
  name: string,
): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Please give your pet a name' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { valid: false, error: 'That name is a bit short — try a longer one' };
  }
  if (trimmed.length > 16) {
    return { valid: false, error: 'That name is too long — keep it short' };
  }
  // Letters + internal spaces only. Apostrophes + hyphens allowed for
  // names like "O'Malley" or "Mary-Anne".
  if (!/^[A-Za-z][A-Za-z\s'\-]*[A-Za-z]$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Names use letters only — no numbers or symbols',
    };
  }
  // Blocklist substring check on a stripped lower-case form.
  const stripped = trimmed.toLowerCase().replace(/[^a-z]/g, '');
  for (const bad of ANIMAL_NAME_BLOCKLIST) {
    if (stripped.includes(bad)) {
      return {
        valid: false,
        error: "Hmm, let's pick a nicer name for your pet",
      };
    }
  }
  return { valid: true };
}
