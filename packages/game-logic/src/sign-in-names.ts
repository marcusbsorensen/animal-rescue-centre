/**
 * Ready-made sign-in names: a thing and a thing from these two lists,
 * for example PebbleKite, with a number on the end (PebbleKite2)
 * only once every plain pair is taken.
 *
 * A child picks one at signup from three the server offers, and never
 * types one. It is their secret name for signing in, seen by nobody else.
 * The name friends see is a different one, an adjective and an animal
 * (`display-names.ts`), so the two never look alike: a sign-in name has
 * no animal in it and a display name always ends in one.
 *
 * The server holds the pool (`username_pool`, filled by
 * supabase/migrations/00017_ready_made_sign_in_names.sql) and hands names
 * out. These lists exist here so the tests can read every word and every
 * pair, and so `sign-in-names.test.ts` can hold the database's copy to
 * the same words.
 *
 * Words were chosen to be things a young child knows and can read, with
 * nothing rude across the join. Words left out on purpose, with the
 * reason, are listed in the test.
 */
export const SIGN_IN_NAME_FIRSTS = [
  'Acorn', 'Apple', 'Bean', 'Berry', 'Biscuit', 'Bramble', 'Cactus', 'Candle',
  'Cloud', 'Clover', 'Cocoa', 'Comet', 'Conker', 'Cookie', 'Crumble', 'Cupcake',
  'Fig', 'Gumdrop', 'Jelly', 'Kettle', 'Lantern', 'Lemon', 'Mango', 'Marble',
  'Meadow', 'Moon', 'Nutmeg', 'Pancake', 'Pebble', 'Pickle', 'Pine', 'Planet',
  'Plum', 'Popcorn', 'Puddle', 'Pumpkin', 'Puzzle', 'Rainbow', 'Raindrop', 'Ripple',
  'Rocket', 'Sherbet', 'Sprinkle', 'Sprout', 'Teacup', 'Toffee', 'Tulip', 'Twig',
  'Waffle', 'Walnut',
] as const;

export const SIGN_IN_NAME_SECONDS = [
  'Balloon', 'Basket', 'Bell', 'Bike', 'Blanket', 'Boat', 'Boots', 'Bridge',
  'Bucket', 'Crayon', 'Drum', 'Engine', 'Feather', 'Flag', 'Hat', 'Helmet',
  'Jigsaw', 'Jumper', 'Kazoo', 'Kite', 'Ladder', 'Lamp', 'Mitten',
  'Nest', 'Parcel', 'Pencil', 'Piano', 'Pillow', 'Pocket', 'Puppet', 'Ribbon',
  'Robot', 'Sandal', 'Scarf', 'Ship', 'Slipper', 'Sock', 'Sticker', 'Teapot',
  'Tent', 'Torch', 'Tower', 'Train', 'Trumpet', 'Tunnel', 'Wagon', 'Wand', 'Wheel',
  'Window', 'Yoyo',
] as const;

/**
 * Longest pair the pool holds. A longer one (SprinkleBalloon) does not fit
 * on one line of a name card on a small phone, and a name broken over two
 * lines looks like two words. 2,382 of the 2,500 pairs are this short.
 */
export const SIGN_IN_NAME_MAX_PAIR_LENGTH = 13;

/** Longest a sign-in name can be: a pair and two digits. */
export const SIGN_IN_NAME_MAX_LENGTH = SIGN_IN_NAME_MAX_PAIR_LENGTH + 2;

/** Every pair the pool holds, in list order. */
export function signInNamePairs(): string[] {
  return SIGN_IN_NAME_FIRSTS.flatMap((f) => SIGN_IN_NAME_SECONDS.map((s) => f + s))
    .filter((name) => name.length <= SIGN_IN_NAME_MAX_PAIR_LENGTH);
}

/** True for a plain pair the pool holds, with no number. */
export function isSignInNamePair(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > SIGN_IN_NAME_MAX_PAIR_LENGTH) return false;
  return SIGN_IN_NAME_FIRSTS.some((f) =>
    value.startsWith(f) && (SIGN_IN_NAME_SECONDS as readonly string[]).includes(value.slice(f.length)));
}
