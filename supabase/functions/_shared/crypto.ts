/**
 * Hash a PIN using PBKDF2 (Web Crypto API — Deno/Edge compatible).
 * Produces a storable string: `salt:hash` (both hex-encoded).
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return toHex(salt) + ':' + toHex(new Uint8Array(derived));
}

/**
 * Verify a PIN against a stored hash string.
 */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;

  const salt = fromHex(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return toHex(new Uint8Array(derived)) === hashHex;
}

/**
 * Generate a simple session token (random hex string).
 */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

/**
 * Generate a join code like "FOX-428".
 */
export function generateJoinCode(): string {
  const words = [
    'FOX', 'OWL', 'BAT', 'CAT', 'DOG', 'BEE', 'ELK', 'RAM', 'YAK', 'COW',
    'HEN', 'JAY', 'KOI', 'EMU', 'APE', 'BUG', 'FLY', 'PIG', 'RAT', 'COD',
  ];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = String(Math.floor(Math.random() * 900) + 100); // 100-999
  return `${word}-${num}`;
}

/**
 * Hash an email for parent gate (SHA-256, hex).
 */
export async function hashEmail(email: string): Promise<string> {
  const data = new TextEncoder().encode(email.toLowerCase().trim());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(hash));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
