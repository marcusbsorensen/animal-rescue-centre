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
 * Every animal a join code can start with: 150 of them, 3 to 7 letters.
 *
 * The first twenty are the original list and must stay, because codes made
 * from them are in children's hands. The rest were added on 2026-10-16.
 *
 * Why it grew: twenty words times 900 numbers is 18,000 codes, and
 * `users.join_code` is unique, so 18,000 was the most accounts A.R.C. could
 * ever have. It fails long before that — signup tries five codes and then
 * inserts anyway, so at 9,000 accounts about 3% of signups die on the
 * constraint for no reason a child could see. 150 words gives 135,000.
 *
 * It is also what makes guessing hopeless. Somebody working through the
 * space at the 20 wrong guesses per 15 minutes `add-friend` allows needed
 * nine days for 18,000 codes; 135,000 takes them about seventy.
 *
 * The rules for adding more: an animal a child of eight knows, 3 to 7
 * letters so it reads aloud and types easily, nothing that sounds like a
 * different word a child might type instead (no EWE, GNU, DOE or BOAR), and
 * nothing whose letters spell something a playground would enjoy. Widen
 * `JOIN_CODE_PATTERN` in packages/game-logic/src/auth-validation.ts if a
 * longer word is ever wanted.
 */
const JOIN_CODE_ANIMALS = [
  'FOX', 'OWL', 'BAT', 'CAT', 'DOG', 'BEE', 'ELK', 'RAM', 'YAK', 'COW',
  'HEN', 'JAY', 'KOI', 'EMU', 'APE', 'BUG', 'FLY', 'PIG', 'RAT', 'COD',
  'BADGER', 'BEAVER', 'BISON', 'CAMEL', 'CRANE', 'DEER', 'DINGO', 'DONKEY', 'DOVE', 'DRAKE',
  'DUCK', 'EAGLE', 'FALCON', 'FERRET', 'FINCH', 'FROG', 'GECKO', 'GOAT', 'GOOSE', 'GULL',
  'HARE', 'HAWK', 'HERON', 'HORSE', 'IBEX', 'IBIS', 'KOALA', 'LAMB', 'LARK', 'LEMUR',
  'LLAMA', 'LYNX', 'MOLE', 'MOTH', 'MOUSE', 'NEWT', 'OTTER', 'PANDA', 'PONY', 'PUFFIN',
  'QUAIL', 'RABBIT', 'RAVEN', 'ROBIN', 'SEAL', 'SHEEP', 'SHREW', 'SKUNK', 'SLOTH', 'SNAIL',
  'SNAKE', 'SQUID', 'STOAT', 'STORK', 'SWAN', 'TAPIR', 'TOAD', 'TROUT', 'TURTLE', 'VOLE',
  'WALRUS', 'WASP', 'WEASEL', 'WHALE', 'WOLF', 'WOMBAT', 'WREN', 'ZEBRA', 'PIGEON', 'PARROT',
  'FOAL', 'CALF', 'CHICK', 'JOEY', 'CUB', 'PUP', 'LION', 'TIGER', 'BEAR', 'MONKEY',
  'GIRAFFE', 'MARMOT', 'GERBIL', 'HAMSTER', 'GUPPY', 'SALMON', 'CARP', 'EEL', 'CRAB', 'PRAWN',
  'OYSTER', 'MUSSEL', 'URCHIN', 'BEETLE', 'CRICKET', 'MANTIS', 'HORNET', 'LOCUST', 'SPIDER', 'COBRA',
  'VIPER', 'ADDER', 'PYTHON', 'IGUANA', 'LIZARD', 'SKINK', 'OSPREY', 'KESTREL', 'MERLIN', 'BUZZARD',
  'MAGPIE', 'SWIFT', 'SWALLOW', 'MARTIN', 'CUCKOO', 'ORIOLE', 'PLOVER', 'CURLEW', 'AVOCET', 'DUNLIN',
  'PELICAN', 'TOUCAN', 'MACAW', 'BUDGIE', 'CANARY', 'PEACOCK', 'TURKEY', 'OSTRICH', 'PENGUIN', 'DOLPHIN',
];

/**
 * Generate a join code like "FOX-428" or "OTTER-317".
 */
export function generateJoinCode(): string {
  const word = JOIN_CODE_ANIMALS[Math.floor(Math.random() * JOIN_CODE_ANIMALS.length)];
  const num = String(Math.floor(Math.random() * 900) + 100); // 100-999
  return `${word}-${num}`;
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
