import { describe, it, expect } from 'vitest';
import type { Animal } from '@arc/shared-types';
import { ADOPTER_HOUSEHOLD_DEFS } from '../adopter-roster';
import {
  buildHandoverDialogue,
  handoverLineId,
  handoverVoiceScript,
  roleOf,
  HANDOVER_LINES,
  WARDEN_SPEAKER,
} from '../adoption-dialogue';

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

const priya = ADOPTER_HOUSEHOLD_DEFS[0]; // Priya "Pri" Kaur, cat/dog

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

  it('marks the warden as the warden and everyone else as a guest', () => {
    const seq = buildHandoverDialogue(makeAnimal(), priya);
    expect(seq.beats.map((b) => b.role)).toEqual(['warden', 'guest', 'warden', 'guest']);
    expect(seq.beats.map(roleOf)).toEqual(['warden', 'guest', 'warden', 'guest']);
  });

  it('roleOf falls back to the speaker id when a beat has no role', () => {
    expect(roleOf({ speakerId: WARDEN_SPEAKER.id })).toBe('warden');
    expect(roleOf({ speakerId: '01-priya' })).toBe('guest');
    expect(roleOf({ speakerId: '01-priya', role: 'warden' })).toBe('warden');
  });

  it('colours a person named in the text as a person, not an animal', () => {
    const seq = buildHandoverDialogue(makeAnimal(), priya);
    const thanks = seq.beats[3];
    expect(thanks.text).toContain(WARDEN_SPEAKER.name);
    expect(thanks.people).toEqual([WARDEN_SPEAKER.name]);
    // Every person named is really in the text, and none is also an animal.
    for (const beat of seq.beats) {
      for (const p of beat.people ?? []) {
        expect(beat.text).toContain(p);
        expect(beat.highlights ?? []).not.toContain(p);
      }
    }
  });

  it('opens neutral and warms to a greeting expression', () => {
    const seq = buildHandoverDialogue(makeAnimal(), priya);
    expect(seq.beats[0].expression).toBe('neutral');
    expect(seq.beats[seq.beats.length - 1].expression).toBe('greeting');
  });

  it('keeps each line short enough for a child (<= 120 chars, <= 2 sentences)', () => {
    // The longest animal name in the pool, to be fair to the worst case.
    const seq = buildHandoverDialogue(makeAnimal({ name: 'Clementine' }), priya);
    for (const beat of seq.beats) {
      expect(beat.text.length).toBeLessThanOrEqual(120);
      expect(beat.text.split(/[.!?]/).filter((s) => s.trim().length > 0).length).toBeLessThanOrEqual(2);
    }
  });

  it('gives every beat a stable line id that names its speaker and position', () => {
    const seq = buildHandoverDialogue(makeAnimal(), priya);
    expect(seq.beats.map((b) => b.lineId)).toEqual([
      'handover-warden-1',
      'handover-01-priya-2',
      'handover-warden-3',
      'handover-01-priya-4',
    ]);
  });

  it('returns an empty sequence when the applicant is missing (safe fall-through)', () => {
    const seq = buildHandoverDialogue(makeAnimal(), undefined);
    expect(seq.beats).toHaveLength(0);
  });
});

describe('handoverVoiceScript', () => {
  const script = handoverVoiceScript();

  it('lists Marnie once and every adopting household, two lines each', () => {
    const marnie = script.filter((l) => l.speakerId === WARDEN_SPEAKER.id);
    expect(marnie.map((l) => l.n)).toEqual([1, 3]);
    for (const h of ADOPTER_HOUSEHOLD_DEFS) {
      const lines = script.filter((l) => l.speakerId === h.householdId);
      expect(lines.map((l) => l.n)).toEqual([2, 4]);
    }
    expect(script).toHaveLength(2 + ADOPTER_HOUSEHOLD_DEFS.length * 2);
  });

  it('has no duplicate line ids', () => {
    const ids = script.map((l) => l.lineId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses the same ids and text the game builds, so recordings cannot drift from the screen', () => {
    const seq = buildHandoverDialogue(makeAnimal({ name: 'Pumpkin' }), priya);
    for (const beat of seq.beats) {
      const entry = script.find((l) => l.lineId === beat.lineId);
      expect(entry, beat.lineId).toBeDefined();
      expect(entry!.text.split('{animal}').join('Pumpkin')).toBe(beat.text);
      expect(entry!.speakerName).toBe(beat.speaker);
      expect(entry!.role).toBe(beat.role);
    }
  });

  it('flags the lines that need the animal name, which are all of them today', () => {
    expect(HANDOVER_LINES.every((l) => l.template.includes('{animal}'))).toBe(true);
    expect(script.every((l) => l.usesAnimalName)).toBe(true);
  });

  it('drafts a name-free version of every line, short enough for a child, with no name in it', () => {
    for (const l of script) {
      expect(l.textNameFree.length, l.lineId).toBeGreaterThan(10);
      expect(l.textNameFree, l.lineId).not.toContain('{animal}');
      expect(l.textNameFree.length, l.lineId).toBeLessThanOrEqual(120);
      expect(l.textNameFree.split(/[.!?]/).filter((s) => s.trim().length > 0).length, l.lineId).toBeLessThanOrEqual(2);
    }
    // The warden's name is fixed, so a line may say it: it can be recorded.
    expect(script.find((l) => l.lineId === 'handover-01-priya-4')!.textNameFree).toContain('Marnie');
  });

  it('builds ids the way handoverLineId does', () => {
    expect(handoverLineId('warden', 1)).toBe('handover-warden-1');
    expect(handoverLineId('16-tata', 4)).toBe('handover-16-tata-4');
  });

  it('makes ids that are safe as file names', () => {
    for (const l of script) expect(l.lineId).toMatch(/^[a-z0-9-]+$/);
  });
});
