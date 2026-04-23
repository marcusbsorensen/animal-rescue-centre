import type { Animal, Species } from '@arc/shared-types';

/**
 * A toy that animals can play with. Each toy declares which species can
 * meaningfully interact with it — mealworms for bats, yarn for cats,
 * tennis balls for dogs & foxes, etc. The `bondBonus` is an extra bond
 * point added on top of the normal play reward when this toy is the
 * animal's favourite (arrival-toy-is-favourite rule).
 */
export interface ToyDef {
  id: string;
  label: string;
  emoji: string;
  species: Species[];
  bondBonus?: number;
}

/**
 * The canonical toy catalogue. `id` is the stable identifier persisted
 * on `Animal.toys`, `arrivalToy`, and `favouriteToy`.
 */
export const TOY_DEFS: Record<string, ToyDef> = {
  'tennis-ball': { id: 'tennis-ball', label: 'Tennis ball', emoji: '🎾', species: ['dog', 'fox'], bondBonus: 1 },
  'feather':     { id: 'feather',     label: 'Feather',          emoji: '🪶', species: ['cat'], bondBonus: 1 },
  'leaf-pile':   { id: 'leaf-pile',   label: 'Leaf pile',        emoji: '🍂', species: ['bunny', 'fox'], bondBonus: 1 },
  'mealworm':    { id: 'mealworm',    label: 'Live mealworm',    emoji: '🐛', species: ['bat'], bondBonus: 1 },
  'bell':        { id: 'bell',        label: 'Bell',             emoji: '🔔', species: ['parrot'], bondBonus: 1 },
  'warm-rock':   { id: 'warm-rock',   label: 'Warm rock',        emoji: '🪨', species: ['snake'], bondBonus: 1 },
  'treat':       { id: 'treat',       label: 'Pawsome treat',    emoji: '🍖', species: ['dog', 'cat', 'fox'], bondBonus: 1 },
  'squeaky-toy': { id: 'squeaky-toy', label: 'Squeaky toy',      emoji: '🎉', species: ['dog', 'bunny'], bondBonus: 1 },
  'string':      { id: 'string',      label: 'Piece of string',  emoji: '🧶', species: ['cat'], bondBonus: 1 },
  'yarn-ball':   { id: 'yarn-ball',   label: 'Ball of yarn',     emoji: '🧶', species: ['cat'], bondBonus: 1 },
  'mirror':      { id: 'mirror',      label: 'Pocket mirror',    emoji: '🪞', species: ['parrot'], bondBonus: 1 },
};

/**
 * Default toy per species — matches the hardcoded toys in PlayScene
 * before the toy-inventory refactor. Used when an animal has no
 * favourite equipped (old save compat, or no arrival toy rolled).
 */
export const DEFAULT_TOY_FOR_SPECIES: Record<Species, string> = {
  dog:    'tennis-ball',
  cat:    'feather',
  bunny:  'leaf-pile',
  fox:    'leaf-pile',
  bat:    'mealworm',
  parrot: 'bell',
  snake:  'warm-rock',
};

/** Probability an animal arrives with a toy. Tweakable. */
export const ARRIVAL_TOY_PROBABILITY = 0.4;

/**
 * Roll an arrival-toy for a newly-arriving animal. ~40% of animals
 * arrive with a toy; if they do, it's one of the toys valid for their
 * species (chosen uniformly). That toy becomes their favourite
 * automatically — see spawnAnimal wiring.
 */
export function rollArrivalToy(species: Species): string | undefined {
  if (Math.random() >= ARRIVAL_TOY_PROBABILITY) return undefined;
  const eligible = Object.values(TOY_DEFS).filter((t) => t.species.includes(species));
  if (eligible.length === 0) return undefined;
  return eligible[Math.floor(Math.random() * eligible.length)].id;
}

/**
 * Return the list of toys this animal can currently play with. Always
 * includes the species default; then adds any toys the animal owns
 * (including the arrival toy), de-duplicated and filtered to toys
 * valid for this species.
 */
export function getAvailableToys(animal: Animal): ToyDef[] {
  const ids = new Set<string>();
  ids.add(DEFAULT_TOY_FOR_SPECIES[animal.species]);
  for (const id of animal.toys ?? []) ids.add(id);
  const defs: ToyDef[] = [];
  for (const id of ids) {
    const def = TOY_DEFS[id];
    if (def && def.species.includes(animal.species)) defs.push(def);
  }
  return defs;
}

/**
 * Bond bonus for playing with `toyId`. +1 when it matches the animal's
 * arrival-toy (arrival-toy-is-favourite rule), else 0. Uses the toy's
 * own `bondBonus` if set, defaulting to 1.
 */
export function getToyBondBonus(animal: Animal, toyId: string): number {
  if (!animal.arrivalToy || animal.arrivalToy !== toyId) return 0;
  const def = TOY_DEFS[toyId];
  return def?.bondBonus ?? 1;
}

/**
 * Pick the toy to use in a play session: explicit favourite wins, else
 * species default. Always returns a toyId present in TOY_DEFS.
 */
export function getPlayToyId(animal: Animal): string {
  const fav = animal.favouriteToy;
  if (fav && TOY_DEFS[fav] && TOY_DEFS[fav].species.includes(animal.species)) {
    return fav;
  }
  return DEFAULT_TOY_FOR_SPECIES[animal.species];
}
