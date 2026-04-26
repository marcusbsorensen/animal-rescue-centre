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

/**
 * PIN-hint validator — used at signup to prevent kids from accidentally
 * leaking their PIN inside their hint.
 *
 * Reject if the hint contains:
 *   1) the literal PIN as a substring
 *   2) any 3+ consecutive digits of the PIN
 *   3) the PIN spelled out in words ("one two three four", "twelve
 *      thirty four", "one thousand two hundred thirty four")
 *   4) any 3+ digit numeric run anywhere (defensive — even unrelated
 *      numeric strings are a leak risk)
 *   5) only digits / no letters at all
 *
 * Also rejects empty hints + length > 60.
 *
 * See `docs/forgot-pin-recovery.md` for the full design.
 */
export function validatePinHint(
  hint: string,
  pin: string,
): { valid: boolean; error?: string } {
  if (!hint || typeof hint !== 'string') {
    return { valid: false, error: 'Hint is required' };
  }
  const trimmed = hint.trim();
  if (trimmed.length < 4) {
    return { valid: false, error: 'Hint is too short — write a few words' };
  }
  if (trimmed.length > 60) {
    return { valid: false, error: 'Hint is too long — keep it short' };
  }

  const digitsOnly = /^[0-9\s\-_,.]+$/.test(trimmed);
  if (digitsOnly) {
    return {
      valid: false,
      error: 'Your hint should be words, not numbers',
    };
  }

  // Must contain at least one letter to count as a hint.
  if (!/[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      error: 'Your hint should include some words',
    };
  }

  // 1) Literal PIN substring
  if (pin && pin.length >= 4 && trimmed.includes(pin)) {
    return {
      valid: false,
      error: 'That hint gives away your secret number — try again',
    };
  }

  // 2) Any 3+ consecutive digits of the PIN appearing in the hint
  if (pin && pin.length >= 4) {
    for (let i = 0; i + 3 <= pin.length; i++) {
      const run = pin.slice(i, i + 3);
      if (trimmed.includes(run)) {
        return {
          valid: false,
          error: 'That hint gives away part of your secret number',
        };
      }
    }
  }

  // 4) Any 3+ digit numeric run in the hint (defensive)
  if (/\d{3,}/.test(trimmed)) {
    return {
      valid: false,
      error: 'Your hint should not contain a number — write a clue in words',
    };
  }

  // 3) Spelled-out PIN digits — check every reasonable English wording
  const lower = trimmed.toLowerCase().replace(/[^a-z\s-]/g, ' ');
  const tokens = lower.split(/[\s-]+/).filter(Boolean);
  const digitWords: Record<string, string> = {
    zero: '0', oh: '0', nought: '0', nil: '0',
    one: '1', two: '2', three: '3', four: '4',
    five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  };
  // Build a digit-string from sequential digit-word tokens (ignoring
  // any non-digit-word tokens between them — being generous to the
  // attacker so we catch "one and two and three and four" etc.)
  let digitsFromWords = '';
  for (const tok of tokens) {
    if (digitWords[tok]) {
      digitsFromWords += digitWords[tok];
    }
  }
  if (pin && digitsFromWords.includes(pin)) {
    return {
      valid: false,
      error: 'That hint spells out your secret number — try again',
    };
  }

  // Compound forms: "twelve thirty four" → 12 34, "twelve thirty-four"
  // already covered via tokenisation; "one thousand two hundred thirty
  // four" → 1234. Catch the 12-34 pattern by mapping common 11-19 +
  // tens prefixes.
  const teens: Record<string, string> = {
    ten: '10', eleven: '11', twelve: '12', thirteen: '13',
    fourteen: '14', fifteen: '15', sixteen: '16',
    seventeen: '17', eighteen: '18', nineteen: '19',
  };
  const tens: Record<string, string> = {
    twenty: '2', thirty: '3', forty: '4', fifty: '5',
    sixty: '6', seventy: '7', eighty: '8', ninety: '9',
  };
  let compound = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (teens[t]) {
      compound += teens[t];
    } else if (tens[t]) {
      const next = tokens[i + 1];
      if (next && digitWords[next]) {
        compound += tens[t] + digitWords[next];
        i++;
      } else {
        compound += tens[t] + '0';
      }
    } else if (digitWords[t]) {
      compound += digitWords[t];
    }
  }
  if (pin && compound.includes(pin)) {
    return {
      valid: false,
      error: 'That hint spells out your secret number — try again',
    };
  }

  return { valid: true };
}

/**
 * Per-kid hint-idea generator. Used in the signup flow when the kid
 * answers "Can someone else guess your secret code using your hint?
 * → Yes, want help?" — we hand them a few starter ideas so they don't
 * stare at a blank box.
 *
 * Different kids must see DIFFERENT ideas, otherwise a sibling who
 * read this list could reverse-engineer their friend's PIN by knowing
 * which prompts were on offer. We hash the seed (typically the kid's
 * username) and use it to pick a deterministic-but-varied subset.
 *
 * Returns 4 ideas drawn from the full pool, keyed by the seed.
 */
export function getHintIdeas(seed: string): string[] {
  // Hints must map to FOUR DIGITS — the PIN is numeric, so the kid's
  // hint needs to point at a number they'll remember, not a feeling
  // or a word. Each prompt below resolves to digits via dates, ages,
  // counts, addresses, jersey numbers, doubled-up numbers, etc.
  const pool = [
    "the day and month your pet was born",
    "the year mum was born",
    "the year dad was born",
    "the year you started school",
    "your house number, twice",
    "your age and your sibling's age together",
    "the number on your favourite team shirt",
    "your phone's last four numbers",
    "your birthday backwards",
    "two of your favourite numbers, then again",
    "the day you got your first pet",
    "your house number plus your age",
    "your age, four times",
    "the year your best friend was born",
    "your favourite player's shirt number, twice",
    "your school year and your age, mixed",
    "your birthday day, twice",
    "your bus or class number, twice",
    "your age now and when you started school",
    "the number of pets you wish you had, four times",
  ];
  // Tiny hash → deterministic shuffle. Same seed → same 4 ideas.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  const indexed = pool.map((idea, i) => ({
    idea,
    sort: ((h ^ (i * 2654435761)) >>> 0),
  }));
  indexed.sort((a, b) => a.sort - b.sort);
  return indexed.slice(0, 4).map((x) => x.idea);
}
