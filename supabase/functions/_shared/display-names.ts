/**
 * The name other players see: an adjective and an animal from these two
 * lists, for example MossyOtter, with a number on the end when that one
 * is taken. A child never types it.
 *
 * A copy of packages/game-logic/src/display-names.ts, because Edge
 * Functions cannot import from the workspace packages.
 * `display-names-copies.test.ts` there fails if the lists differ.
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

/** Never put on the end of a name: 14 and 88 (white-supremacist codes),
 *  18 (a neo-Nazi group's number), 69 (sexual). */
export const DISPLAY_NAME_SKIPPED_NUMBERS = [14, 18, 69, 88] as const;

/** Every number that may follow a taken name, 2 to 99, lowest first. */
export function allowedDisplayNameNumbers(): number[] {
  const skipped = new Set<number>(DISPLAY_NAME_SKIPPED_NUMBERS);
  const out: number[] = [];
  for (let n = 2; n <= 99; n++) if (!skipped.has(n)) out.push(n);
  return out;
}

function pick<T>(list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(Math.random() * list.length))];
}

/** A name from the lists, without a number. */
export function randomDisplayName(): string {
  return pick(DISPLAY_NAME_ADJECTIVES) + pick(DISPLAY_NAME_ANIMALS);
}

/** True for an adjective and an animal from the lists, with no number. */
export function isDisplayNameBase(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return DISPLAY_NAME_ADJECTIVES.some((a) =>
    value.startsWith(a) && (DISPLAY_NAME_ANIMALS as readonly string[]).includes(value.slice(a.length)));
}

/**
 * A display name nobody has yet, starting from `base`: the base itself
 * if it is free, otherwise the base with a free number picked at random.
 * If every number is taken too, it starts again from another pair.
 *
 * One query per pair tried. The unique index on users.display_name is
 * still the last word; signup retries if an insert loses a race.
 */
// deno-lint-ignore no-explicit-any
export async function freeDisplayName(supabase: any, base: string): Promise<string> {
  let current = base;
  for (let round = 0; round < 5; round++) {
    const candidates = [current, ...allowedDisplayNameNumbers().map((n) => `${current}${n}`)];
    const { data } = await supabase
      .from('users')
      .select('display_name')
      .in('display_name', candidates);
    const taken = new Set(((data ?? []) as Array<{ display_name: string }>).map((r) => r.display_name));
    if (!taken.has(current)) return current;
    const free = candidates.slice(1).filter((c) => !taken.has(c));
    if (free.length > 0) return pick(free);
    current = randomDisplayName();
  }
  return current;
}
