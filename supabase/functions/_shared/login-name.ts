// A sign-in name ignores capitals (migrations/00018, hub 96): PebbleKite,
// pebblekite and PEBBLEKITE are one account, so a child who types her
// secret name on a new device does not have to remember its capitals.
//
// users.username keeps the capitals the name was made with, and is what
// the game shows back. users.username_lower is the same name in small
// letters, made by the database and unique; every lookup by name goes
// through it. The per-name rate limits use this key too, or each way of
// writing one name would get its own budget of tries.

/** The name as the database matches it: no spaces either side, small letters. */
export function loginKey(name: string): string {
  return name.trim().toLowerCase();
}
