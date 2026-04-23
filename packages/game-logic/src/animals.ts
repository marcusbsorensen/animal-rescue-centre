import type { Animal, Species } from '@arc/shared-types';

/**
 * Arrival stories per species — randomly selected when an animal spawns.
 */
const ARRIVAL_STORIES: Record<Species, string[]> = {
  cat: [
    'Found shivering under a car in the rain.',
    'Left in a cardboard box outside a shop.',
    'Wandered into town looking hungry and lost.',
    'Rescued from a roof — too scared to come down!',
    'Found hiding behind some bins, very shy.',
  ],
  dog: [
    'Found tied to a railing with no owner in sight.',
    'Spotted running along a busy road, dodging cars.',
    'Brought in by a kind stranger who found them in the park.',
    'Left behind when a family moved house.',
    'Found digging through bins looking for food.',
  ],
  fox: [
    'Found limping near a hedge with a sore paw.',
    'A tiny cub found alone — mum didn\'t come back.',
    'Spotted in someone\'s garden, too weak to run.',
    'Rescued from a drain — got stuck exploring!',
    'Found curled up in an old shed, very thin.',
  ],
  bunny: [
    'Dumped in a field in a small cage.',
    'Found hopping along the pavement all alone.',
    'Rescued from a garden where they were unwanted.',
    'A baby bunny found in a hedge, no family nearby.',
    'Brought in with very long nails — not looked after.',
  ],
  bat: [
    'Found grounded in a garden, unable to fly.',
    'Discovered clinging to a curtain inside a house.',
    'A baby bat found on the floor — fell from the roost.',
    'Rescued from a cat\'s mouth, wing slightly hurt.',
    'Found tangled in some netting, very stressed.',
  ],
  parrot: [
    'Flew out of an open window and got lost.',
    'Found perched on a bench in the high street!',
    'Handed in — owner couldn\'t look after them anymore.',
    'Rescued from a very small cage with no toys.',
    'Found in a tree in winter, too cold to fly home.',
  ],
  snake: [
    'Found in someone\'s garden — an escaped pet.',
    'Handed in by a nervous neighbour!',
    'Rescued from a too-small tank with no heat.',
    'Found hiding under a garden shed.',
    'Brought in after being spotted near a school.',
  ],
};

/**
 * Preset animal names per species (no free text — spec §3).
 */
const ANIMAL_NAMES: Record<Species, string[]> = {
  cat: ['Whiskers', 'Mittens', 'Luna', 'Shadow', 'Ginger', 'Mochi', 'Pepper', 'Biscuit', 'Cleo', 'Felix',
        'Willow', 'Patches', 'Smokey', 'Misty', 'Tiger', 'Pumpkin', 'Olive', 'Socks', 'Marble', 'Nala'],
  dog: ['Buddy', 'Bella', 'Daisy', 'Rocky', 'Rosie', 'Scout', 'Poppy', 'Bear', 'Milo', 'Biscuit',
        'Toffee', 'Bramble', 'Sage', 'Ziggy', 'Rolo', 'Patch', 'Winnie', 'Barnaby', 'Pickle', 'Lola'],
  fox: ['Rusty', 'Amber', 'Bracken', 'Fern', 'Blaze', 'Maple', 'Thorn', 'Willow', 'Flicker', 'Bramble',
        'Copper', 'Ember', 'Sorrel', 'Rowan', 'Hawthorn', 'Clover', 'Acorn', 'Juniper', 'Sage', 'Conker'],
  bunny: ['Clover', 'Thumper', 'Hazel', 'Snowdrop', 'Pippin', 'Flopsy', 'Nutmeg', 'Blossom', 'Pebble', 'Bramble',
          'Dandelion', 'Cotton', 'Daisy', 'Maple', 'Parsley', 'Cinnamon', 'Juniper', 'Muffin', 'Crumble', 'Clementine'],
  bat: ['Echo', 'Dusk', 'Shadow', 'Pip', 'Velvet', 'Midnight', 'Sonar', 'Moth', 'Starling', 'Flicker',
        'Luna', 'Cobweb', 'Twilight', 'Berry', 'Storm', 'Dewdrop', 'Jasper', 'Cosmo', 'Nettle', 'Fig'],
  parrot: ['Rio', 'Kiwi', 'Mango', 'Sky', 'Sunny', 'Pepper', 'Jade', 'Coral', 'Ziggy', 'Biscuit',
           'Tango', 'Papaya', 'Bluebell', 'Tutti', 'Skittles', 'Rainbow', 'Dazzle', 'Samba', 'Pico', 'Calypso'],
  snake: ['Noodle', 'Pretzel', 'Zigzag', 'Scales', 'Slither', 'Ribbon', 'Copper', 'Marble', 'Ivy', 'Basil',
          'Coil', 'Twizzle', 'Bramble', 'Mossy', 'Pebble', 'Russet', 'Juniper', 'Fern', 'Flint', 'Thistle'],
};

/**
 * Visual variants per species — each variant is a different character design.
 * The sprite key becomes `{species}-{variant}-{state}`.
 * Fallback: if no variant art exists, `{species}-{state}` is used.
 */
export const SPECIES_VARIANTS: Record<Species, string[]> = {
  cat: ['ginger', 'black', 'calico', 'grey', 'siamese', 'white', 'tuxedo', 'tortie'],
  dog: ['golden', 'dalmatian', 'chocolate', 'beagle', 'husky', 'pug', 'collie', 'terrier'],
  fox: ['red', 'arctic', 'silver', 'cross', 'marble', 'fennec'],
  bunny: ['dutch', 'lop', 'lionhead', 'rex', 'angora', 'spotted', 'arctic'],
  bat: ['brown', 'fruit', 'longeared', 'pipistrelle', 'white'],
  parrot: ['budgie', 'cockatiel', 'grey', 'macaw', 'lovebird'],
  snake: ['corn', 'python', 'king', 'garter', 'hognose'],
};

/**
 * Pick a random variant for a species.
 */
export function pickRandomVariant(species: Species): string {
  const variants = SPECIES_VARIANTS[species];
  return variants[Math.floor(Math.random() * variants.length)];
}

/**
 * Colours for placeholder rectangle sprites per species.
 */
export const SPECIES_COLOURS: Record<Species, number> = {
  cat: 0xf4a460,    // sandy brown
  dog: 0x8b6914,    // golden brown
  fox: 0xd45500,    // orange-red
  bunny: 0xd3d3d3,  // light grey
  bat: 0x4a4a4a,    // dark grey
  parrot: 0x2ecc71, // green
  snake: 0x6b8e23,  // olive
};

let nextId = 1;

/**
 * Sync the ID counter to avoid collisions with loaded animals.
 * Call this after loading saved state.
 */
export function syncNextId(existingAnimals: { id: string }[]): void {
  let maxId = 0;
  for (const a of existingAnimals) {
    const match = a.id.match(/^animal-(\d+)$/);
    if (match) {
      maxId = Math.max(maxId, parseInt(match[1], 10));
    }
  }
  nextId = maxId + 1;
}

/**
 * Spawn a new animal with random story and name.
 * Optionally link to a sibling. Pass existingNames to avoid duplicates.
 */
export function spawnAnimal(
  species: Species,
  siblingId?: string,
  existingNames?: string[]
): Animal {
  const id = `animal-${nextId++}`;
  const stories = ARRIVAL_STORIES[species];
  const names = ANIMAL_NAMES[species];

  // Pick a name not already in use (if possible)
  let name: string;
  if (existingNames && existingNames.length > 0) {
    const available = names.filter((n) => !existingNames.includes(n));
    name = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : names[Math.floor(Math.random() * names.length)];
  } else {
    name = names[Math.floor(Math.random() * names.length)];
  }

  return {
    id,
    name,
    species,
    variant: pickRandomVariant(species),
    state: 'arriving',
    arrivalStory: stories[Math.floor(Math.random() * stories.length)],
    hunger: 60 + Math.floor(Math.random() * 30),       // 60–89 (hungry)
    tiredness: 40 + Math.floor(Math.random() * 30),     // 40–69
    happiness: 10 + Math.floor(Math.random() * 20),     // 10–29 (unhappy)
    health: 70 + Math.floor(Math.random() * 30),        // 70–99
    bondLevel: 0,
    siblingId,
    roomId: `room-${species}`,
  };
}

/**
 * Spawn a sibling pair — two animals of the same species, linked.
 */
export function spawnSiblingPair(species: Species): [Animal, Animal] {
  const a = spawnAnimal(species);
  const b = spawnAnimal(species, a.id);
  a.siblingId = b.id;
  return [a, b];
}

/**
 * Pick a random species from the unlocked set.
 */
export function pickRandomSpecies(unlocked: Species[]): Species {
  return unlocked[Math.floor(Math.random() * unlocked.length)];
}

/**
 * Decide whether the next spawn should be a sibling pair (20% chance).
 */
export function shouldSpawnSiblings(): boolean {
  return Math.random() < 0.2;
}

/**
 * Get a random name for a species (for display).
 */
export function getRandomName(species: Species): string {
  const names = ANIMAL_NAMES[species];
  return names[Math.floor(Math.random() * names.length)];
}
