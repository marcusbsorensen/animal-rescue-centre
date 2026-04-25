/**
 * Tier 1 recovery — multiple-choice challenge questions drawn from
 * the kid's actual game state. Used when a player taps "I forgot my
 * secret number" after enough wrong PIN attempts.
 *
 * Design lives in docs/forgot-pin-recovery.md. Briefly:
 *  - 3 questions per attempt, drawn from the question pool.
 *  - 3/3 correct → unlock + force PIN reset
 *  - 2/3 correct → fall through to PIN-hint (Tier 2)
 *  - 0–1/3       → parent help (Tier 3, parked)
 *
 * The whole module is a pure function. Callers (UI / API) own the
 * "did the player answer correctly" plumbing; this just builds the
 * questions.
 *
 * Determinism: questions + distractor ordering are seeded by a
 * combination of the kid's username + the attempt index, so two
 * reloads of the same attempt show the same question (no
 * re-roll-the-dice attacks), but a follow-up attempt shows fresh
 * questions.
 */
import type { ApprenticeStoreSlice } from './apprentices';
import { APPRENTICE_DEFS } from './apprentices';
import type { CharmsStoreSlice, CharmId } from './charms';
import { CHARMS } from './charms';

/** Minimal cast-snapshot — caller passes in what they have. */
export interface AdopterSnapshot {
  /** Last-placed adopter household ID, most-recent first. */
  recentlyPlacedIds: string[];
  /** Map of household-id → display label, for picking the prompt + distractors. */
  householdLabels: Record<string, string>;
}

/**
 * Early-game inputs — these are populated within the first session
 * (signup + first animal arrival) and work as recovery questions
 * BEFORE the kid has placed adopters, recruited apprentices, or
 * unlocked charms. Without these the question pool would be empty
 * for new players, forcing the recovery flow straight into hint
 * fallback. With them we can always offer at least 1–2 questions.
 */
export interface EarlyGameSnapshot {
  /** The animal emoji the kid picked on the signup avatar grid. */
  signupAvatar?: string;
  /** Name of the first animal that arrived at the rescue centre — the
   *  kid CHOSE this name during the first-arrival flow (the animal
   *  arrives without a tag, kid types a name). */
  firstAnimalName?: string;
  /** Species of the first animal that arrived (for a 2nd early-game Q). */
  firstAnimalSpecies?: string;
  /** Optional sprite path for the first animal — if provided, the
   *  first-animal-name question renders as 3 visual cards each
   *  showing this same sprite with a different name tag, and the kid
   *  taps the one whose tag matches the name they picked. Much more
   *  visual + memorable than a plain text-MCQ. */
  firstAnimalSpriteSrc?: string;
}

export interface RecoverySnapshot {
  username: string;
  attemptIndex: number; // 0 for first attempt, 1 for second…
  early?: EarlyGameSnapshot;
  adopters?: AdopterSnapshot;
  apprentices?: ApprenticeStoreSlice;
  charms?: CharmsStoreSlice;
}

export interface RecoveryQuestion {
  id: string;
  prompt: string;
  options: string[];
  /** Index into options[] of the correct answer. */
  correct: number;
  /**
   * Optional: render options as visual cards rather than plain text.
   * Used by the "first-animal-name" question — three identical sprite
   * cards with different name tags. UI consults `sharedSprite` to
   * render the same animal across all three options.
   */
  display?: 'text' | 'cards';
  /** When `display === 'cards'`, all cards show this sprite. */
  sharedSprite?: string;
}

const QUESTION_POOL = [
  // Early-game (work from session 1, before any adopters/apprentices/charms)
  'signup-avatar',
  'first-animal-name',
  'first-animal-species',
  // Mid- to late-game
  'recently-placed-adopter',
  'bonded-apprentice',
  'locked-charm',
] as const;
type QuestionKind = (typeof QUESTION_POOL)[number];

/** Avatar emoji pool from the signup picker — kept in sync with
 *  mockup-signup.html. 8 options; we use 7 distractors when the kid
 *  picked their one. */
const SIGNUP_AVATAR_POOL = ['🦊', '🐱', '🐰', '🐶', '🦇', '🦜', '🐍', '🦔'];

/** Species pool — for the first-animal-species early-game question. */
const SPECIES_POOL = ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake'];

/** Plausible first-animal name distractors. Kept short on purpose so
 *  they read believably alongside whatever name the player chose. */
const FIRST_ANIMAL_NAME_DISTRACTORS = [
  'Pip', 'Scout', 'Marbles', 'Biscuit', 'Pickle', 'Honey', 'Daisy',
  'Sprout', 'Tilly', 'Rufus', 'Nutmeg', 'Coco', 'Smudge', 'Bumble',
  'Willow', 'Ziggy', 'Pepper', 'Mochi', 'Fern', 'Toffee',
];

/**
 * Build up to 3 challenge questions from the snapshot. Returns fewer
 * than 3 (or none) if there isn't enough game state to support them
 * — caller should fall through to the hint flow in that case.
 */
export function buildRecoveryQuestions(
  snap: RecoverySnapshot,
): RecoveryQuestion[] {
  const seed = hashSeed(`${snap.username}::${snap.attemptIndex}`);
  const rng = mulberry32(seed);

  const candidates: QuestionKind[] = [];
  // Early-game first — these usually exist before mid-game state does,
  // and a brand-new player will have at least one of them.
  if (canAskSignupAvatar(snap)) candidates.push('signup-avatar');
  if (canAskFirstAnimalName(snap)) candidates.push('first-animal-name');
  if (canAskFirstAnimalSpecies(snap)) candidates.push('first-animal-species');
  // Mid-/late-game — only available once the kid has progressed.
  if (canAskAdopter(snap)) candidates.push('recently-placed-adopter');
  if (canAskApprentice(snap)) candidates.push('bonded-apprentice');
  if (canAskCharm(snap)) candidates.push('locked-charm');

  // Shuffle deterministically and pick up to 3.
  const order = shuffleSeeded(candidates, rng);
  const picks = order.slice(0, 3);

  const out: RecoveryQuestion[] = [];
  for (const kind of picks) {
    const q = buildOne(kind, snap, rng);
    if (q) out.push(q);
  }
  return out;
}

// ── Per-kind builders ────────────────────────────────────────────

function canAskSignupAvatar(s: RecoverySnapshot): boolean {
  const emoji = s.early?.signupAvatar;
  if (!emoji) return false;
  return SIGNUP_AVATAR_POOL.includes(emoji);
}

function canAskFirstAnimalName(s: RecoverySnapshot): boolean {
  const name = s.early?.firstAnimalName?.trim();
  if (!name) return false;
  // Need 3 distractors that aren't the same name.
  const distractors = FIRST_ANIMAL_NAME_DISTRACTORS.filter(
    (n) => n.toLowerCase() !== name.toLowerCase(),
  );
  return distractors.length >= 3;
}

function canAskFirstAnimalSpecies(s: RecoverySnapshot): boolean {
  const sp = s.early?.firstAnimalSpecies;
  if (!sp) return false;
  return SPECIES_POOL.includes(sp);
}

function canAskAdopter(s: RecoverySnapshot): boolean {
  if (!s.adopters) return false;
  const recent = s.adopters.recentlyPlacedIds;
  if (!recent || recent.length < 1) return false;
  // Need 3 distractors (4 total options) we can draw from the label
  // map that aren't the correct one.
  const labels = s.adopters.householdLabels;
  const distractors = Object.keys(labels).filter((id) => id !== recent[0]);
  return distractors.length >= 3;
}

function canAskApprentice(s: RecoverySnapshot): boolean {
  // Need at least one bonded apprentice. We pick the most-recently-
  // recruited one as the correct answer; distractors are the other 2
  // canonical apprentices (bonded or not — they're public knowledge
  // among returning players).
  const recruited = s.apprentices?.apprentices ?? [];
  return recruited.length >= 1;
}

function canAskCharm(s: RecoverySnapshot): boolean {
  if (!s.charms) return false;
  const all = Object.keys(CHARMS) as CharmId[];
  const unlocked = new Set(s.charms.unlockedCharms);
  const locked = all.filter((c) => !unlocked.has(c));
  // Need at least one locked charm + 3 unlocked distractors.
  return locked.length >= 1 && all.length - locked.length >= 3;
}

function buildOne(
  kind: QuestionKind,
  s: RecoverySnapshot,
  rng: () => number,
): RecoveryQuestion | null {
  if (kind === 'signup-avatar') return buildSignupAvatarQ(s, rng);
  if (kind === 'first-animal-name') return buildFirstAnimalNameQ(s, rng);
  if (kind === 'first-animal-species') return buildFirstAnimalSpeciesQ(s, rng);
  if (kind === 'recently-placed-adopter') return buildAdopterQ(s, rng);
  if (kind === 'bonded-apprentice') return buildApprenticeQ(s, rng);
  if (kind === 'locked-charm') return buildCharmQ(s, rng);
  return null;
}

function buildSignupAvatarQ(
  s: RecoverySnapshot,
  rng: () => number,
): RecoveryQuestion | null {
  const correct = s.early!.signupAvatar!;
  const distractors = takeRandom(
    SIGNUP_AVATAR_POOL.filter((e) => e !== correct),
    3,
    rng,
  );
  if (distractors.length < 3) return null;
  const options = shuffleSeeded([correct, ...distractors], rng);
  return {
    id: 'q-signup-avatar',
    prompt: 'Which animal did you pick when you signed up?',
    options,
    correct: options.indexOf(correct),
  };
}

function buildFirstAnimalNameQ(
  s: RecoverySnapshot,
  rng: () => number,
): RecoveryQuestion | null {
  const correct = s.early!.firstAnimalName!.trim();
  const distractorPool = FIRST_ANIMAL_NAME_DISTRACTORS.filter(
    (n) => n.toLowerCase() !== correct.toLowerCase(),
  );
  const distractors = takeRandom(distractorPool, 2, rng);
  if (distractors.length < 2) return null;
  const options = shuffleSeeded([correct, ...distractors], rng);
  // Cards layout when the sprite is available — three identical sprite
  // cards with different name tags. Kid picks the one with the name
  // they chose.
  const sprite = s.early?.firstAnimalSpriteSrc;
  return {
    id: 'q-first-animal-name',
    prompt: sprite
      ? 'Which one is your first pet? (Tap the right name tag.)'
      : "What was your very first animal's name?",
    options,
    correct: options.indexOf(correct),
    display: sprite ? 'cards' : 'text',
    sharedSprite: sprite,
  };
}

function buildFirstAnimalSpeciesQ(
  s: RecoverySnapshot,
  rng: () => number,
): RecoveryQuestion | null {
  const correct = s.early!.firstAnimalSpecies!;
  const distractors = takeRandom(
    SPECIES_POOL.filter((sp) => sp !== correct),
    3,
    rng,
  );
  if (distractors.length < 3) return null;
  const cap = (sp: string) => sp.charAt(0).toUpperCase() + sp.slice(1);
  const options = shuffleSeeded([correct, ...distractors], rng).map(cap);
  return {
    id: 'q-first-animal-species',
    prompt: 'What kind of animal was the FIRST one to arrive?',
    options,
    correct: options.indexOf(cap(correct)),
  };
}

function buildAdopterQ(
  s: RecoverySnapshot,
  rng: () => number,
): RecoveryQuestion | null {
  const a = s.adopters!;
  const correctId = a.recentlyPlacedIds[0];
  const correctLabel = a.householdLabels[correctId];
  if (!correctLabel) return null;
  const distractorPool = Object.entries(a.householdLabels)
    .filter(([id]) => id !== correctId)
    .map(([, label]) => label);
  const distractors = takeRandom(distractorPool, 3, rng);
  if (distractors.length < 3) return null;
  const options = shuffleSeeded([correctLabel, ...distractors], rng);
  return {
    id: 'q-recently-placed-adopter',
    prompt: 'Who did you most recently send your animal home with?',
    options,
    correct: options.indexOf(correctLabel),
  };
}

function buildApprenticeQ(
  s: RecoverySnapshot,
  rng: () => number,
): RecoveryQuestion | null {
  const recruited = s.apprentices!.apprentices;
  if (recruited.length < 1) return null;
  // Most recent recruit is the correct answer.
  const sorted = [...recruited].sort((a, b) => b.recruitedAt - a.recruitedAt);
  const correctId = sorted[0].id as keyof typeof APPRENTICE_DEFS;
  const correctName = APPRENTICE_DEFS[correctId]?.name;
  if (!correctName) return null;
  const distractorNames = (Object.keys(APPRENTICE_DEFS) as Array<keyof typeof APPRENTICE_DEFS>)
    .filter((id) => id !== correctId)
    .map((id) => APPRENTICE_DEFS[id].name);
  const options = shuffleSeeded([correctName, ...distractorNames], rng);
  return {
    id: 'q-bonded-apprentice',
    prompt: 'Which apprentice did you most recently welcome to the centre?',
    options,
    correct: options.indexOf(correctName),
  };
}

function buildCharmQ(
  s: RecoverySnapshot,
  rng: () => number,
): RecoveryQuestion | null {
  const unlocked = new Set(s.charms!.unlockedCharms);
  const allIds = Object.keys(CHARMS) as CharmId[];
  const lockedIds = allIds.filter((id) => !unlocked.has(id));
  const unlockedIds = allIds.filter((id) => unlocked.has(id));
  if (lockedIds.length < 1 || unlockedIds.length < 3) return null;
  const correctId = takeRandom(lockedIds, 1, rng)[0];
  const distractorIds = takeRandom(unlockedIds, 3, rng);
  const correctLabel = CHARMS[correctId].label;
  const distractorLabels = distractorIds.map((id) => CHARMS[id].label);
  const options = shuffleSeeded([correctLabel, ...distractorLabels], rng);
  return {
    id: 'q-locked-charm',
    prompt: 'Which of these charms have you NOT unlocked yet?',
    options,
    correct: options.indexOf(correctLabel),
  };
}

// ── Tiny seedable RNG + helpers ──────────────────────────────────

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, deterministic, good-enough PRNG for shuffles. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function takeRandom<T>(arr: T[], n: number, rng: () => number): T[] {
  return shuffleSeeded(arr, rng).slice(0, n);
}

// ── Verdict from answers ─────────────────────────────────────────

export type RecoveryVerdict =
  | { kind: 'pass'; correctCount: number }
  | { kind: 'fall-through-to-hint'; correctCount: number }
  | { kind: 'parent-help'; correctCount: number };

/**
 * Score a set of answers. `answers[i]` is the index the kid picked
 * for `questions[i]`, or -1 if they skipped.
 */
export function scoreRecovery(
  questions: RecoveryQuestion[],
  answers: number[],
): RecoveryVerdict {
  let correct = 0;
  for (let i = 0; i < questions.length; i++) {
    if (answers[i] === questions[i].correct) correct++;
  }
  if (questions.length === 0) {
    // No game-state questions available → straight to hint.
    return { kind: 'fall-through-to-hint', correctCount: 0 };
  }
  if (correct === questions.length) return { kind: 'pass', correctCount: correct };
  if (correct >= Math.ceil(questions.length * 0.5))
    return { kind: 'fall-through-to-hint', correctCount: correct };
  return { kind: 'parent-help', correctCount: correct };
}
