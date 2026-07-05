import { describe, it, expect } from 'vitest';
import type { Animal } from '@arc/shared-types';
import { L1_CURTAILED_HOUSEHOLD_DEFS } from '../adoption';
import { buildHandoverDialogue, WARDEN_SPEAKER } from '../adoption-dialogue';

function makeAnimal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'animal-7',
    name: 'Pumpkin',
    species: 'cat',
    variant: 'ginger',
    state: 'bonding',
    arrivalStory: 'Found under a car.',
    hunger: 20, tiredness: 20, happiness: 80, health: 100,
    bondLevel: 60, roomId: 'room-cat',
    ...overrides,
  };
}

const priya = L1_CURTAILED_HOUSEHOLD_DEFS[0]; // Priya "Pri" Kaur, cat/dog

describe('buildHandoverDialogue', () => {
  it('produces a short 4-beat hand-over conversation', () => {
    const seq = buildHandoverDialogue(makeAnimal(), priya);
    expect(seq.beats).toHaveLength(4);
    expect(seq.id).toContain('animal-7');
  });

  it('alternates the warden (left) and the adopter (right)', () => {
    const seq = buildHandoverDialogue(makeAnimal(), priya);
    expect(seq.beats.map((b) => b.side)).toEqual(['left', 'right', 'left', 'right']);
    // Odd beats are the warden; even beats are the adopting household.
    expect(seq.beats[0].speakerId).toBe(WARDEN_SPEAKER.id);
    expect(seq.beats[0].speaker).toBe(WARDEN_SPEAKER.name);
    expect(seq.beats[1].speakerId).toBe(priya.householdId);
    expect(seq.beats[1].speaker).toBe(priya.name);
    expect(seq.beats[2].speakerId).toBe(WARDEN_SPEAKER.id);
    expect(seq.beats[3].speakerId).toBe(priya.householdId);
  });

  it('names the animal in every beat and highlights it', () => {
    const seq = buildHandoverDialogue(makeAnimal({ name: 'Pumpkin' }), priya);
    for (const beat of seq.beats) {
      expect(beat.text).toContain('Pumpkin');
      expect(beat.highlights).toContain('Pumpkin');
    }
  });

  it('opens neutral and warms to a greeting expression', () => {
    const seq = buildHandoverDialogue(makeAnimal(), priya);
    expect(seq.beats[0].expression).toBe('neutral');
    expect(seq.beats[seq.beats.length - 1].expression).toBe('greeting');
  });

  it('keeps each line short enough for a child (<= 120 chars, <= 2 sentences)', () => {
    const seq = buildHandoverDialogue(makeAnimal(), priya);
    for (const beat of seq.beats) {
      expect(beat.text.length).toBeLessThanOrEqual(120);
      expect(beat.text.split(/[.!?]/).filter((s) => s.trim().length > 0).length).toBeLessThanOrEqual(2);
    }
  });

  it('returns an empty sequence when the applicant is missing (safe fall-through)', () => {
    const seq = buildHandoverDialogue(makeAnimal(), undefined);
    expect(seq.beats).toHaveLength(0);
  });
});
