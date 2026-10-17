import type { Animal } from '@arc/shared-types';
import type { Applicant } from './adoption';
import { ADOPTER_HOUSEHOLD_DEFS } from './adopter-roster';

/**
 * Adoption hand-over dialogue — the little staged conversation that plays
 * when a family is matched to an animal, before the painted adoption
 * ceremony. Modelled on a story-driven mobile game's cutscene dialogue
 * (see docs/adoption-dialogue-presentation-2026-05-19.md): a large
 * waist-up portrait anchored to one side, a name pill, a short line or
 * two, referenced names highlighted, tap-to-advance, SKIP.
 *
 * This module is the PURE data layer — it builds the beat script. The
 * Phaser presentation lives in apps/game/src/ui/DialogueRunner.ts. The
 * runner + types are deliberately generic (two speakers, side-alternation,
 * optional choices) so the same runner can drive apprentice, return-visit
 * and vet conversations later.
 */

export type DialogueExpression =
  | 'neutral'
  | 'happy'
  | 'greeting'
  | 'worried'
  | 'pleading';

export type DialogueSide = 'left' | 'right';

/**
 * Whose side a speaker is on. The warden is the player's own character and
 * gets the honey-amber name pill; everyone else is a guest and gets soft blue.
 */
export type DialogueRole = 'warden' | 'guest';

/** A reply the player can pick on a choice beat. */
export interface DialogueChoice {
  id: string;
  label: string;
}

export interface DialogueBeat {
  /** Display name shown in the dashed name pill. */
  speaker: string;
  /** Stable id used to resolve the portrait texture (householdId, 'warden', …). */
  speakerId: string;
  /** Which edge the portrait + name pill sit on. Alternates for two-speaker chats. */
  side: DialogueSide;
  /** Selects the portrait expression variant (falls back to neutral). */
  expression: DialogueExpression;
  /** Body copy — short, ≤ ~2 lines. */
  text: string;
  /** Animal names in `text`, drawn in green. */
  highlights?: string[];
  /** Person names in `text`, drawn in amber. */
  people?: string[];
  /** Warden or guest, which sets the name pill's colour. Defaults from `speakerId`. */
  role?: DialogueRole;
  /**
   * The recorded line this beat plays, if one exists. Stable across releases:
   * it names the audio file, so the voice booth, the script in
   * docs/voice-recording-plan-2026-10-14.md and the game all agree.
   */
  lineId?: string;
  /** Reply pills the player picks from. A beat with choices waits for one. */
  choices?: DialogueChoice[];
}

export interface DialogueSequence {
  id: string;
  beats: DialogueBeat[];
}

/**
 * The A.R.C. shelter warden — the fixed "us" side of every hand-over
 * conversation (Marcus's decision, 2026-07-05). The portrait is resolved in
 * the app layer; game-logic only needs the id + display name.
 */
export const WARDEN_SPEAKER = { id: 'warden', name: 'Marnie' } as const;

/** The role a beat is spoken in: explicit if given, else the warden by id, else a guest. */
export function roleOf(beat: Pick<DialogueBeat, 'role' | 'speakerId'>): DialogueRole {
  return beat.role ?? (beat.speakerId === WARDEN_SPEAKER.id ? 'warden' : 'guest');
}

// ── The hand-over script ────────────────────────────────────────

interface HandoverLine {
  /** 1-based position in the conversation; part of the line id. */
  n: number;
  who: 'warden' | 'household';
  expression: DialogueExpression;
  /**
   * What is shown and what is recorded: one text, word for word. Children read
   * along while they listen, so the screen carries exactly the words that are
   * heard. No line says the animal's name (a recording cannot say ninety of
   * them); the name stays on the match picker, the ceremony and the toasts.
   */
  text: string;
  /** Person names that appear in the text; the runner draws them amber. */
  people?: string[];
}

/**
 * The four lines of every hand-over (Marcus, 2026-10-14, 121A). One list feeds
 * the game (through `buildHandoverDialogue`) and the voice recording script
 * (through `handoverVoiceScript`), so what is recorded cannot drift from what
 * is shown.
 *
 * The adopters thank the warden by name. "Marnie" is fixed, so a recording can
 * say it; each household records its own lines, so a household's own name could
 * be said too. The animal's name could not (docs/voice-recording-plan-2026-10-14.md).
 */
export const HANDOVER_LINES: readonly HandoverLine[] = [
  {
    n: 1,
    who: 'warden',
    expression: 'neutral',
    text: 'Meet our little friend! This one has been hoping for the perfect home.',
  },
  {
    n: 2,
    who: 'household',
    expression: 'neutral',
    text: "Hello, little one! We've come all this way to meet you.",
  },
  {
    n: 3,
    who: 'warden',
    expression: 'happy',
    text: "Look after them for us, won't you?",
  },
  {
    n: 4,
    who: 'household',
    expression: 'greeting',
    text: `Thank you, ${WARDEN_SPEAKER.name}! We promise to love them forever.`,
    people: [WARDEN_SPEAKER.name],
  },
];

/** The id of one recorded hand-over line: `handover-warden-1`, `handover-01-priya-2`. */
export function handoverLineId(speakerId: string, n: number): string {
  return `handover-${speakerId}-${n}`;
}

/**
 * Build the hand-over conversation for a matched (animal, applicant): a short
 * back-and-forth between the warden (left) and the adopting family (right).
 * The words are the same for every animal, so the one recording of each line
 * fits whoever is being adopted; the animal only gives the sequence its id.
 *
 * Returns an EMPTY sequence when the applicant is missing, so a caller can
 * safely fall through to the ceremony without a dialogue if anything is off
 * — a dialogue bug must never strand an adoption.
 */
export function buildHandoverDialogue(
  animal: Animal,
  applicant: Applicant | undefined,
): DialogueSequence {
  if (!applicant) {
    return { id: `handover-${animal.id}-none`, beats: [] };
  }

  const beats = HANDOVER_LINES.map((line): DialogueBeat => {
    const warden = line.who === 'warden';
    const speakerId = warden ? WARDEN_SPEAKER.id : applicant.householdId;
    return {
      speaker: warden ? WARDEN_SPEAKER.name : applicant.name,
      speakerId,
      side: warden ? 'left' : 'right',
      role: warden ? 'warden' : 'guest',
      expression: line.expression,
      text: line.text,
      ...(line.people ? { people: [...line.people] } : {}),
      lineId: handoverLineId(speakerId, line.n),
    };
  });

  return { id: `handover-${animal.id}-${applicant.householdId}`, beats };
}

// ── The recording script ────────────────────────────────────────

export interface VoiceLine {
  lineId: string;
  speakerId: string;
  speakerName: string;
  role: DialogueRole;
  n: number;
  expression: DialogueExpression;
  /** The words the game shows and the words to record: the same, exactly. */
  text: string;
}

/**
 * Every hand-over line that could be recorded: Marnie's two, and the two of
 * each household that adopts. The voice booth lists these, and the recording
 * plan prints them.
 */
export function handoverVoiceScript(
  households: readonly Applicant[] = ADOPTER_HOUSEHOLD_DEFS,
): VoiceLine[] {
  const speakers = [
    { id: WARDEN_SPEAKER.id, name: WARDEN_SPEAKER.name, who: 'warden' as const },
    ...households.map((h) => ({ id: h.householdId, name: h.name, who: 'household' as const })),
  ];
  const lines: VoiceLine[] = [];
  for (const s of speakers) {
    for (const line of HANDOVER_LINES.filter((l) => l.who === s.who)) {
      lines.push({
        lineId: handoverLineId(s.id, line.n),
        speakerId: s.id,
        speakerName: s.name,
        role: s.who === 'warden' ? 'warden' : 'guest',
        n: line.n,
        expression: line.expression,
        text: line.text,
      });
    }
  }
  return lines;
}
