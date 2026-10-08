/**
 * crate-loading.ts
 *
 * The loading screen's rules and its words.
 *
 * `crate-stacking.ts` is the engine: it answers "may these two travel
 * side by side?" and "what is this grid worth on arrival?". It does not
 * answer "what is the child holding?", "what happens when she taps an
 * empty space?" or "what do we tell her when the answer is no" — and
 * those three are the whole of the loading screen, so they live here
 * rather than in the Phaser view. A view that owns its own state
 * machine is a state machine that can only be tested by drawing it.
 *
 * **The words are logic too.** The loading screen is where an autistic
 * child learns which animals can sit next to which, so the sentence it
 * shows is the feature, not decoration. Keeping the sentences beside
 * the rule that produces them is what stops the screen saying
 * "incompatible" in one place and "not allowed" in another.
 *
 * Every mutator returns a fresh session rather than editing one, so the
 * view can redraw from a value and nothing half-applies.
 */

import type { Species } from '@arc/shared-types';
import {
  CRATE_DEFS,
  VEHICLE_DEFS,
  getPreferredCrates,
  pairFeeling,
  isDriveable,
  neighbourIndices,
  previewPlacement,
  type CompatibilityLevel,
  type CrateDef,
  type CrateGrid,
  type CrateType,
  type LoadedCrate,
  type VehicleType,
} from './crate-stacking';

// ── Vocabulary ───────────────────────────────────────────────

/**
 * One word per feeling, and the only word for it.
 *
 * It is used on the slot badge, inside the sentence and in the
 * can't-set-off message, so a child meets the same word every time she
 * meets the same fact. A screen that says "worried" on the badge and
 * "unsettled" in the sentence has asked her to learn a synonym on top
 * of learning the animals, which is the opposite of the job.
 */
export const FEELING: Record<CompatibilityLevel, string> = {
  happy: 'Happy',
  stressed: 'Worried',
  blocked: 'Frightened',
};

/**
 * The mark drawn on a slot — always *beside* the word and the sentence,
 * never instead of them. A bare red cross tells a child she is wrong
 * and nothing else.
 */
export const FEELING_MARK: Record<CompatibilityLevel, string> = {
  happy: '✓',
  stressed: '!',
  blocked: '✕',
};

/**
 * Who the sentence names as the cause.
 *
 * `MATRIX` is symmetric: it knows that a cat and a bunny cannot travel
 * side by side, and not which of the two is frightened. A child needs
 * it the other way round — "the cat makes the bunny frightened" teaches
 * her something she can use in the next vehicle, "this pair is not
 * allowed" teaches her to guess. So this ranks the species by how much
 * they alarm the others, and the higher rank becomes the subject of the
 * sentence.
 *
 * **It chooses wording, never a rule.** Whether a pair may travel is
 * `getCompatibility` and nothing in this file can change that. The
 * ranks are only ever compared with each other, never read as a
 * quantity, and an equal pair gets the "each other" phrasing instead of
 * a made-up direction.
 */
const ALARM_RANK: Record<Species, number> = {
  fox: 4,
  dog: 3,
  cat: 2,
  snake: 1,
  bat: 0,
  parrot: 0,
  bunny: 0,
  hedgehog: 0,
};

// ── The animals on offer ─────────────────────────────────────

/** An animal the loading screen may put in a crate. */
export interface LoadableAnimal {
  id: string;
  name: string;
  species: Species;
  /**
   * This animal is unwell — the caller's `sickAnimals` map says so.
   *
   * It changes who minds whom (`feelingToward`) and what the screen
   * says about it, so the rules need it; it is not a `AnimalState`
   * and there is no second flag to invent.
   */
  poorly?: boolean;
}

/**
 * One neighbour relationship, in plain words.
 *
 * `slotIndex` is the slot being judged — for a hypothetical placement
 * that is the empty slot the child is pointing at, so a note always
 * knows where on the grid it belongs.
 */
export interface AdjacencyNote {
  level: CompatibilityLevel;
  slotIndex: number;
  neighbourSlotIndex: number;
  animalId: string;
  neighbourId: string;
  /** What happens and why, in one or two sentences. */
  text: string;
  /**
   * The stress here is one of them being unwell, not the two species
   * disagreeing — so the screen marks it as a need rather than as
   * friction. Never set on a blocked pair.
   */
  needsQuiet?: boolean;
}

/** `Luna the cat` — the phrase both animals are named by, everywhere. */
function named(animal: LoadableAnimal): string {
  return `${animal.name} the ${animal.species}`;
}

/**
 * The sentence for one pair of neighbours.
 *
 * Exported because the departure message, the slot preview and the
 * settled grid all need the same sentence for the same pair; a second
 * copy of this wording is a second vocabulary.
 */
export function describePair(
  animal: LoadableAnimal,
  neighbour: LoadableAnimal,
): { level: CompatibilityLevel; text: string; needsQuiet?: boolean } {
  const { level, needsQuiet } = pairFeeling(animal, neighbour);

  if (needsQuiet) {
    // **The subject is the poorly animal and the verb is a need.**
    //
    // The same mechanic can be worded two ways and they teach
    // opposite things. "Biscuit does not like sitting next to
    // Truffle" makes the patient something to be avoided and the
    // healthy animal the one with the valid preference. "Truffle is
    // poorly and needs a quiet space" asks the child to give somebody
    // room. This is a game about a rescue centre, played by children
    // some of whom have been the one nobody would sit beside, and it
    // is not a close call: it is always the second one.
    //
    // So the well animal is never named as minding, and never named
    // first. The shape follows the `stressed` sentence below — a fact,
    // then what it means for sitting together — and the cost in the
    // second clause lands on the patient's comfort rather than on the
    // neighbour's patience.
    const ill = animal.poorly ? animal : neighbour;
    return {
      level,
      needsQuiet,
      text: `${named(ill)} is poorly and needs a quiet space. `
        + `They can sit next to each other, but ${ill.name} would rest better on their own.`,
    };
  }

  if (level === 'happy') {
    return {
      level,
      needsQuiet,
      text: `${named(animal)} and ${named(neighbour)} are happy next to each other.`,
    };
  }

  const rankA = ALARM_RANK[animal.species];
  const rankB = ALARM_RANK[neighbour.species];

  if (rankA === rankB) {
    const verb = level === 'blocked' ? 'frighten' : 'make';
    const object = level === 'blocked' ? 'each other' : 'each other worried';
    const tail = level === 'blocked'
      ? 'They cannot sit next to each other.'
      : 'They can sit next to each other, but neither will enjoy the journey.';
    return {
      level,
      needsQuiet,
      text: `${named(animal)} and ${named(neighbour)} ${verb} ${object}. ${tail}`,
    };
  }

  const bolder = rankA > rankB ? animal : neighbour;
  const timid = rankA > rankB ? neighbour : animal;
  const feeling = level === 'blocked' ? 'frightened' : 'worried';
  const tail = level === 'blocked'
    ? 'They cannot sit next to each other.'
    : `They can sit next to each other, but ${timid.name} will not enjoy the journey.`;

  return {
    level,
    needsQuiet,
    text: `${named(bolder)} makes ${named(timid)} ${feeling}. ${tail}`,
  };
}

// ── Crates ───────────────────────────────────────────────────

/**
 * The crate an animal travels in.
 *
 * The first entry of `CRATE_PREFERENCE` is the right crate for the
 * species, so picking it is always the +3 crate-fit on arrival and
 * never the -10. **Choosing the crate is deliberately not the child's
 * job in this slice**: the screen teaches one thing — who may sit next
 * to whom — and a second, differently-scored decision on the same
 * screen would blur which of the two a wrong answer came from. When
 * crate choice does arrive it replaces this function and nothing else.
 */
export function bestCrateFor(species: Species): CrateType {
  return getPreferredCrates(species)[0];
}

/** The crate definition an animal travels in — label and placeholder emoji. */
export function crateDefFor(species: Species): CrateDef {
  return CRATE_DEFS[bestCrateFor(species)];
}

// ── The session ──────────────────────────────────────────────

/**
 * Everything the loading screen is, as a value.
 *
 * `heldId` is the animal in the child's hands: lifted out of the tray
 * or out of a slot, and belonging to neither until she puts it down.
 * One held animal and one rule — tap an animal to pick it up, tap a
 * space to put it down — is the whole interaction, with no modes to
 * be in and nothing that can only be undone one way.
 */
export interface LoadingSession {
  grid: CrateGrid;
  offered: LoadableAnimal[];
  heldId: string | null;
}

/** An empty grid at the vehicle's own dimensions. */
export function emptyGridFor(vehicle: VehicleType): CrateGrid {
  const def = VEHICLE_DEFS[vehicle];
  return { vehicle, cols: def.cols, rows: def.rows, crates: [] };
}

/**
 * Open the loading screen for a vehicle and a list of animals.
 *
 * `preloadedIds` are animals the trip already has a reason to carry —
 * the poorly one on a vet run — and they go aboard before the child
 * arrives, into the first slot that does not frighten anybody. An
 * animal that cannot be seated safely stays in the tray rather than
 * being forced into a grid the child would then be unable to drive.
 */
export function createLoadingSession(
  vehicle: VehicleType,
  offered: LoadableAnimal[],
  preloadedIds: string[] = [],
): LoadingSession {
  const def = VEHICLE_DEFS[vehicle];
  let grid = emptyGridFor(vehicle);

  for (const id of preloadedIds) {
    const animal = offered.find((a) => a.id === id);
    if (!animal) continue;
    if (grid.crates.some((c) => c.animalId === id)) continue;

    for (let slot = 0; slot < def.cols * def.rows; slot += 1) {
      if (grid.crates.some((c) => c.slotIndex === slot)) continue;
      if (previewPlacement(grid, slot, animal) === 'blocked') continue;
      grid = { ...grid, crates: [...grid.crates, crateOf(animal, slot)] };
      break;
    }
  }

  return { grid, offered: [...offered], heldId: null };
}

function crateOf(animal: LoadableAnimal, slotIndex: number): LoadedCrate {
  return {
    slotIndex,
    animalId: animal.id,
    species: animal.species,
    crateType: bestCrateFor(animal.species),
    poorly: animal.poorly,
  };
}

/** Total slots in the session's vehicle. */
export function slotCount(session: LoadingSession): number {
  return session.grid.cols * session.grid.rows;
}

export function animalById(session: LoadingSession, id: string): LoadableAnimal | undefined {
  return session.offered.find((a) => a.id === id);
}

export function crateAt(session: LoadingSession, slotIndex: number): LoadedCrate | undefined {
  return session.grid.crates.find((c) => c.slotIndex === slotIndex);
}

/** The animal in the child's hands, if any. */
export function heldAnimal(session: LoadingSession): LoadableAnimal | null {
  return session.heldId ? animalById(session, session.heldId) ?? null : null;
}

/** The animals still on the pavement — neither aboard nor in hand. */
export function waitingToBoard(session: LoadingSession): LoadableAnimal[] {
  const aboard = new Set(session.grid.crates.map((c) => c.animalId));
  return session.offered.filter((a) => a.id !== session.heldId && !aboard.has(a.id));
}

/** The animals actually travelling, in slot order. */
export function aboard(session: LoadingSession): LoadableAnimal[] {
  return [...session.grid.crates]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((c) => animalById(session, c.animalId))
    .filter((a): a is LoadableAnimal => a !== undefined);
}

// ── Picking up and putting down ──────────────────────────────

/** Pick an animal up from the tray. */
export function holdFromTray(session: LoadingSession, animalId: string): LoadingSession {
  if (!animalById(session, animalId)) return session;
  if (session.grid.crates.some((c) => c.animalId === animalId)) return session;
  return { ...session, heldId: animalId };
}

/**
 * Lift the animal in a slot back out into the child's hands.
 *
 * This is both "move" and "remove": the crate leaves the grid, and
 * where it goes next — another slot or back to the tray — is the next
 * tap. One gesture for both means there is no mode to be in and no
 * order to get wrong.
 */
export function liftFromSlot(session: LoadingSession, slotIndex: number): LoadingSession {
  const crate = crateAt(session, slotIndex);
  if (!crate) return session;
  return {
    ...session,
    grid: { ...session.grid, crates: session.grid.crates.filter((c) => c !== crate) },
    heldId: crate.animalId,
  };
}

/** Put the held animal back on the pavement. Always available, never costs anything. */
export function putHeldBack(session: LoadingSession): LoadingSession {
  return { ...session, heldId: null };
}

/** What `placeHeld` did, and what to say about it. */
export interface PlacementOutcome {
  /** False when the slot was refused — the session is handed back unchanged. */
  placed: boolean;
  session: LoadingSession;
  /** The worst feeling at that slot, or null when there was nothing to place. */
  level: CompatibilityLevel | null;
  /** One note per neighbour, worst first. */
  notes: AdjacencyNote[];
}

/**
 * Put the held animal into a slot.
 *
 * A slot that would frighten somebody is **refused, not punished**: the
 * animal stays in the child's hands, the grid is untouched, and the
 * notes say which neighbour and why. Nothing is lost, nothing is on a
 * timer, and the next tap can be anywhere.
 */
export function placeHeld(session: LoadingSession, slotIndex: number): PlacementOutcome {
  const animal = heldAnimal(session);
  if (!animal) return { placed: false, session, level: null, notes: [] };
  if (slotIndex < 0 || slotIndex >= slotCount(session)) {
    return { placed: false, session, level: null, notes: [] };
  }
  if (crateAt(session, slotIndex)) {
    return { placed: false, session, level: null, notes: [] };
  }

  const notes = notesForPlacing(session, slotIndex, animal);
  const level = previewPlacement(session.grid, slotIndex, animal);

  if (level === 'blocked') return { placed: false, session, level, notes };

  return {
    placed: true,
    level,
    notes,
    session: {
      ...session,
      grid: { ...session.grid, crates: [...session.grid.crates, crateOf(animal, slotIndex)] },
      heldId: null,
    },
  };
}

// ── Feedback ─────────────────────────────────────────────────

const WORST_FIRST: Record<CompatibilityLevel, number> = { blocked: 0, stressed: 1, happy: 2 };

function sortNotes(notes: AdjacencyNote[]): AdjacencyNote[] {
  return notes.sort((a, b) => WORST_FIRST[a.level] - WORST_FIRST[b.level]);
}

/**
 * What would happen if `animal` went into `slotIndex` — one note per
 * occupied neighbour, worst first.
 *
 * The level of the worst note is exactly what `previewPlacement`
 * returns; this adds the two names and the reason, which is what the
 * child reads.
 */
export function notesForPlacing(
  session: LoadingSession,
  slotIndex: number,
  animal: LoadableAnimal,
): AdjacencyNote[] {
  const notes: AdjacencyNote[] = [];
  for (const n of neighbourIndices(slotIndex, session.grid.cols, session.grid.rows)) {
    const crate = crateAt(session, n);
    if (!crate) continue;
    const neighbour = animalById(session, crate.animalId);
    if (!neighbour) continue;
    const { level, text, needsQuiet } = describePair(animal, neighbour);
    notes.push({
      level,
      slotIndex,
      neighbourSlotIndex: n,
      animalId: animal.id,
      neighbourId: neighbour.id,
      text,
      needsQuiet,
    });
  }
  return sortNotes(notes);
}

/**
 * The live preview for one slot, for the animal currently held.
 *
 * Null when nothing is held or the slot is taken — the view draws a
 * badge only where there is an answer to give.
 */
export function slotOutlook(session: LoadingSession, slotIndex: number): CompatibilityLevel | null {
  const animal = heldAnimal(session);
  if (!animal) return null;
  if (crateAt(session, slotIndex)) return null;
  return previewPlacement(session.grid, slotIndex, animal);
}

/** The live notes for one slot, for the animal currently held. */
export function slotNotes(session: LoadingSession, slotIndex: number): AdjacencyNote[] {
  const animal = heldAnimal(session);
  if (!animal || crateAt(session, slotIndex)) return [];
  return notesForPlacing(session, slotIndex, animal);
}

/**
 * Every neighbour relationship already in the grid, worst first, each
 * pair once.
 *
 * This is what the screen says when the child is holding nothing: not a
 * score for the load, but the sentence for each pair of animals who can
 * see each other, which is the thing being taught.
 */
export function settledNotes(session: LoadingSession): AdjacencyNote[] {
  const notes: AdjacencyNote[] = [];
  const seen = new Set<string>();

  for (const crate of session.grid.crates) {
    const animal = animalById(session, crate.animalId);
    if (!animal) continue;
    for (const n of neighbourIndices(crate.slotIndex, session.grid.cols, session.grid.rows)) {
      const other = crateAt(session, n);
      if (!other) continue;
      const key = [crate.slotIndex, n].sort((a, b) => a - b).join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      const neighbour = animalById(session, other.animalId);
      if (!neighbour) continue;
      const { level, text, needsQuiet } = describePair(animal, neighbour);
      notes.push({
        level,
        slotIndex: crate.slotIndex,
        neighbourSlotIndex: n,
        animalId: animal.id,
        neighbourId: neighbour.id,
        text,
        needsQuiet,
      });
    }
  }
  return sortNotes(notes);
}

/**
 * Whether the van may set off — the engine's own gate.
 *
 * `placeHeld` refuses a frightening slot, so a grid built on this
 * screen cannot normally reach a blocked pair. The gate is still the
 * thing that decides, and deliberately: a grid can also arrive
 * pre-loaded from the caller, and asking `isDriveable` rather than
 * trusting that no refusal was ever bypassed is the difference between
 * a rule and a habit.
 */
export function canSetOff(session: LoadingSession): boolean {
  return isDriveable(session.grid);
}

/** The pairs stopping the van, each once, with the sentence for each. */
export function blockingNotes(session: LoadingSession): AdjacencyNote[] {
  return settledNotes(session).filter((n) => n.level === 'blocked');
}
