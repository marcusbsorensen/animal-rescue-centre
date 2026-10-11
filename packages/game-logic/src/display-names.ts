/**
 * The name other players see: an adjective and an animal from these two
 * lists, for example MossyOtter, with a number on the end (MossyOtter7)
 * when that one is already taken.
 *
 * A child never types it. The name a child types at signup is their
 * login and stays private to them; friends, gifts, the friends board and
 * a showcase all show this one instead (`users.display_name`).
 *
 * Every word was chosen so that no pair says anything rude, mocking or
 * frightening, and `display-names.test.ts` checks every pair against a
 * deny-list. Words left out on purpose, with the reason, are listed in
 * that test.
 *
 * Copies that must match these lists, checked by
 * `display-names-copies.test.ts`:
 *   - supabase/functions/_shared/display-names.ts (Deno)
 *   - supabase/migrations/00014_display_names.sql (the database makes a
 *     name for any account that arrives without one, and checks each)
 *   - apps/game/public/admin/signup.html (static HTML, no module loader)
 */

export const DISPLAY_NAME_ADJECTIVES = [
  'Brave', 'Breezy', 'Bright', 'Bubbly', 'Calm', 'Cheery', 'Chirpy', 'Clever',
  'Comfy', 'Cosy', 'Curious', 'Daring', 'Gentle', 'Gleeful', 'Happy', 'Helpful',
  'Hopeful', 'Jolly', 'Kind', 'Leafy', 'Lucky', 'Merry', 'Misty', 'Mossy',
  'Nimble', 'Plucky', 'Rosy', 'Snowy', 'Snug', 'Sparkly', 'Starry', 'Sunny',
  'Swift', 'Twinkly', 'Wise', 'Zippy',
] as const;

export const DISPLAY_NAME_ANIMALS = [
  'Alpaca', 'Badger', 'Bee', 'Canary', 'Deer', 'Dolphin', 'Dormouse', 'Fawn',
  'Ferret', 'Finch', 'Flamingo', 'Gecko', 'Gerbil', 'Hamster', 'Hare', 'Hedgehog',
  'Heron', 'Kitten', 'Koala', 'Ladybird', 'Lamb', 'Lemur', 'Llama', 'Meerkat',
  'Otter', 'Owl', 'Panda', 'Pangolin', 'Penguin', 'Pony', 'Puppy', 'Quokka',
  'Rabbit', 'Robin', 'Seal', 'Sparrow', 'Squirrel', 'Starling', 'Swan', 'Tortoise',
  'Toucan', 'Turtle', 'Vole', 'Wombat', 'Wren',
] as const;

/**
 * Numbers never put on the end of a name. 14 and 88 are white-supremacist
 * codes, 18 is a neo-Nazi group's number, 69 is sexual.
 */
export const DISPLAY_NAME_SKIPPED_NUMBERS = [14, 18, 69, 88] as const;

/** Lowest and highest number added when a name is taken. */
export const DISPLAY_NAME_FIRST_NUMBER = 2;
export const DISPLAY_NAME_LAST_NUMBER = 99;

/** Longest a display name can be: seven letters, eight letters, two digits. */
export const DISPLAY_NAME_MAX_LENGTH = 17;

/** Every number that may follow a taken name, lowest first. */
export function allowedDisplayNameNumbers(): number[] {
  const skipped = new Set<number>(DISPLAY_NAME_SKIPPED_NUMBERS);
  const out: number[] = [];
  for (let n = DISPLAY_NAME_FIRST_NUMBER; n <= DISPLAY_NAME_LAST_NUMBER; n++) {
    if (!skipped.has(n)) out.push(n);
  }
  return out;
}

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/** A name from the lists, without a number. */
export function randomDisplayName(random: () => number = Math.random): string {
  return pick(DISPLAY_NAME_ADJECTIVES, random) + pick(DISPLAY_NAME_ANIMALS, random);
}

/** A different name from the one showing, for the "show another" button. */
export function anotherDisplayName(current: string, random: () => number = Math.random): string {
  for (let i = 0; i < 20; i++) {
    const next = randomDisplayName(random);
    if (next !== current) return next;
  }
  // A random source that keeps landing on the same pair: step one word on.
  const adj = DISPLAY_NAME_ADJECTIVES.find((a) => current.startsWith(a)) ?? DISPLAY_NAME_ADJECTIVES[0];
  const next = DISPLAY_NAME_ADJECTIVES[(DISPLAY_NAME_ADJECTIVES.indexOf(adj) + 1) % DISPLAY_NAME_ADJECTIVES.length];
  return next + current.slice(adj.length);
}

/** True for an adjective and an animal from the lists, with no number. */
export function isDisplayNameBase(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return DISPLAY_NAME_ADJECTIVES.some((a) =>
    value.startsWith(a) && (DISPLAY_NAME_ANIMALS as readonly string[]).includes(value.slice(a.length)));
}

/** True for a name from the lists, with or without an allowed number. */
export function isDisplayName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = value.match(/^([A-Za-z]+?)([1-9][0-9]?)?$/);
  if (!m) return false;
  if (m[2] !== undefined && !allowedDisplayNameNumbers().includes(Number(m[2]))) return false;
  return isDisplayNameBase(m[1]);
}
