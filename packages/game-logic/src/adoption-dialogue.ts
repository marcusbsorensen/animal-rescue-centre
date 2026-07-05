import type { Animal } from '@arc/shared-types';
import type { Applicant } from './adoption';

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
 * and vet conversations later; Tier 1 uses a single-speaker adopter
 * hand-over, which is faithful to the single-speaker reference shots.
 */

export type DialogueExpression =
  | 'neutral'
  | 'happy'
  | 'greeting'
  | 'worried'
  | 'pleading';

export type DialogueSide = 'left' | 'right';

/** Reserved for future branching dialogue — unused by the Tier 1 runner. */
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
  /** Substrings in `text` to colour (person/animal names). */
  highlights?: string[];
  /** Reserved for branching; unused in Tier 1. */
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

/**
 * Build the hand-over conversation for a matched (animal, applicant): a short
 * back-and-forth between the warden (left) and the adopting family (right).
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

  const name = animal.name;
  const warden = (expression: DialogueExpression, text: string): DialogueBeat => ({
    speaker: WARDEN_SPEAKER.name,
    speakerId: WARDEN_SPEAKER.id,
    side: 'left',
    expression,
    text,
    highlights: [name],
  });
  const adopter = (expression: DialogueExpression, text: string): DialogueBeat => ({
    speaker: applicant.name,
    speakerId: applicant.householdId,
    side: 'right',
    expression,
    text,
    highlights: [name],
  });

  return {
    id: `handover-${animal.id}-${applicant.householdId}`,
    beats: [
      warden('neutral', `This is ${name}. ${name} has been hoping for the perfect home.`),
      adopter('neutral', `Hello little ${name}! We've come all this way to meet you.`),
      warden('happy', `Look after ${name} for us, won't you?`),
      adopter('greeting', `We'll love ${name} forever. Promise!`),
    ],
  };
}
