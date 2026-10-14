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

  it('says the four lines it was given, exactly (121A)', () => {
    const seq = buildHandoverDialogue(makeAnimal(), priya);
    expect(seq.beats.map((b) => b.text)).toEqual([
      'Meet our little friend! This one has been hoping for the perfect home.',
      "Hello, little one! We've come all this way to meet you.",
      "Look after them for us, won't you?",
      'Thank you, Marnie! We promise to love them forever.',
    ]);
  });

  it('never says the animal\'s name, so one recording of each line fits every animal (121A)', () => {
    // Names from every species the game rehomes, including ones that are also
    // ordinary words and ones that are short.
    const names = ['Pumpkin', 'Clementine', 'Daisy', 'Biscuit', 'Pepper', 'Sky', 'Bear', 'Pip', 'Sage', 'Rio', 'Noodle', 'Ziggy'];
    const reference = buildHandoverDialogue(makeAnimal({ name: names[0] }), priya).beats.map((b) => b.text);
    for (const name of names) {
      const seq = buildHandoverDialogue(makeAnimal({ name }), priya);
      // The words do not depend on the animal at all...
      expect(seq.beats.map((b) => b.text), name).toEqual(reference);
      // ...so the name is not in any of them, and nothing is drawn green for it.
      for (const beat of seq.beats) {
        expect(beat.text.toLowerCase().split(/[^a-z']+/), `${name} in "${beat.text}"`).not.toContain(name.toLowerCase());
        expect(beat.highlights ?? [], `${name} highlighted`).toEqual([]);
      }
    }
  });

  it('is the same for every household, apart from who says it', () => {
    const texts = (h: (typeof ADOPTER_HOUSEHOLD_DEFS)[number]) => buildHandoverDialogue(makeAnimal(), h).beats.map((b) => b.text);
    for (const h of ADOPTER_HOUSEHOLD_DEFS) expect(texts(h)).toEqual(texts(priya));
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

  it('colours a person named in the text as a person, so Marnie keeps her amber', () => {
    for (const h of ADOPTER_HOUSEHOLD_DEFS) {
      const seq = buildHandoverDialogue(makeAnimal(), h);
      const thanks = seq.beats[3];
      expect(thanks.text, h.householdId).toContain(WARDEN_SPEAKER.name);
      expect(thanks.people, h.householdId).toEqual([WARDEN_SPEAKER.name]);
      // Every person named is really in the text, and none is also an animal.
      for (const beat of seq.beats) {
        for (const p of beat.people ?? []) {
          expect(beat.text).toContain(p);
          expect(beat.highlights ?? []).not.toContain(p);
        }
      }
    }
  });

  it('names no person in a text without listing them, so no name goes uncoloured', () => {
    // Every capitalised word that is not the first word of a sentence is a name.
    const seq = buildHandoverDialogue(makeAnimal(), priya);
    for (const beat of seq.beats) {
      const names = [...beat.text.matchAll(/(?<![.!?]\s)(?<!^)\b[A-Z][a-z]+/g)].map((m) => m[0]);
      for (const n of names) expect(beat.people ?? [], `"${n}" in "${beat.text}"`).toContain(n);
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

  it('uses the same ids and text the game builds, word for word, so recordings cannot drift from the screen', () => {
    // Every household, not just one: each records its own two lines.
    for (const h of ADOPTER_HOUSEHOLD_DEFS) {
      const seq = buildHandoverDialogue(makeAnimal({ name: 'Pumpkin' }), h);
      for (const beat of seq.beats) {
        const entry = script.find((l) => l.lineId === beat.lineId);
        expect(entry, beat.lineId).toBeDefined();
        expect(entry!.text).toBe(beat.text);
        expect(entry!.speakerName).toBe(beat.speaker);
        expect(entry!.role).toBe(beat.role);
        expect(entry!.expression).toBe(beat.expression);
      }
    }
  });

  it('has the lines to record in the script, every one of them whole: no template, no animal name', () => {
    for (const l of script) {
      expect(l.text, l.lineId).not.toMatch(/[{}]/);
      expect(l.text.length, l.lineId).toBeGreaterThan(10);
      expect(l.text.length, l.lineId).toBeLessThanOrEqual(120);
      expect(l.text.split(/[.!?]/).filter((s) => s.trim().length > 0).length, l.lineId).toBeLessThanOrEqual(2);
    }
    expect(HANDOVER_LINES.map((l) => l.text)).toEqual(script.filter((l) => l.speakerId === WARDEN_SPEAKER.id || l.speakerId === ADOPTER_HOUSEHOLD_DEFS[0].householdId).sort((a, b) => a.n - b.n).map((l) => l.text));
    // The warden's name is fixed, so a line may say it and be recorded.
    expect(script.find((l) => l.lineId === 'handover-01-priya-4')!.text).toContain('Marnie');
  });

  it('builds ids the way handoverLineId does', () => {
    expect(handoverLineId('warden', 1)).toBe('handover-warden-1');
    expect(handoverLineId('16-tata', 4)).toBe('handover-16-tata-4');
  });

  it('makes ids that are safe as file names', () => {
    for (const l of script) expect(l.lineId).toMatch(/^[a-z0-9-]+$/);
  });
});
