import { ADOPTER_HOUSEHOLD_DEFS, handoverVoiceScript, WARDEN_SPEAKER } from '@arc/game-logic';

/**
 * The voice cast: who speaks in the adoption hand-over, and how each might
 * sound. Suggestions drawn from the roster's own blurbs, for the people who
 * will record them (docs/voice-recording-plan-2026-10-14.md). They steer a
 * performance; they do not ask anyone to do a voice or an accent they do not
 * have. A natural voice that is warm and clear beats a character voice.
 *
 * One voice is enough for a household of two or more people. A friend may take
 * several households as long as they sound different from one another.
 */
export const VOICE_NOTES: Readonly<Record<string, string>> = {
  warden: 'Warm, unhurried, mid-thirties. A friendly shelter warden who has done this many times and still loves it. A smile in the voice.',
  '01-priya': 'Soft and quiet-spoken, a little shy and delighted. A young woman who rarely raises her voice.',
  '02-jan': 'Calm, slow and kind. A patient beekeeper; a low, easy voice, never hurried.',
  '03-nova': 'Bright and playful, musical, laughs easily. A young artist.',
  '04-babcia': 'An older woman, a loving grandmother. Slow, warm, a little crackle is welcome.',
  '05-finn': 'Energetic and cheerful, quick and breathy, just back from a run. A young man.',
  '06-hiro': 'Very quiet and gentle, an older man who speaks carefully and softly.',
  '18-tali': 'Warm, dry and cheerful, a potter with clay on her hands.',
  '19-linny': 'Crisp, bright and friendly. A young blogger who talks to a camera all day.',
  '20-lei': 'Sunny and relaxed with a little singsong. Someone who plays the ukulele.',
  '21-mara': 'Strong, warm and joyful. A tailor who runs a busy shop and loves it.',
  '29-wenna': 'Hearty, weathered and kind. Someone who lives by the sea in all weathers.',
  '07-patel-greens': 'Calm and unhurried, a retired couple. One gentle voice speaks for both.',
  '08-walkers': 'Friendly and practical, a workshop-warm voice. One of the two speaks for both.',
  '09-okonkwo-harts': 'Playful, laughing, a pair of bakers who finish each other\'s sentences.',
  '10-dani-rex': 'Hearty and open-air, loud and happy, a farmhouse voice.',
  '22-yilmaz': 'Warm and cheerful, a bakery couple. One voice speaks for both.',
  '23-wiri-harper': 'Calm, clear and steady, a pair of forest rangers who talk without rushing.',
  '11-vargas-chen': 'A busy, cheerful family; a parent\'s voice, quick and kind.',
  '12-odenkirks': 'Quiet and bookish, gentle; Helen and Bo, who watch birds and read a lot.',
  '13-kumar-ishii': 'Friendly and capable, a vet mum: kind and brisk at once.',
  '14-theo-grandkids': 'A gentle grandfather, low and warm. Theo speaks; the grandkids need not.',
  '24-perera-fernando': 'Kind and calm, parents of twins. Soft, patient, a little tired and very happy.',
  '31-estrada-train': 'Loud, cheerful chaos. A lively adult lead; an adult may do the whole train.',
  '25-bramble-house': 'Relaxed young friends, chilled and friendly. One voice speaks for the house.',
  '26-aisha-childrens-home': 'A warm carer with a steady, reassuring voice.',
  '27-tomas-care-home': 'Gentle, with a lilt. A carer or a resident who loves a lap.',
  '28-iris-teacher': 'A bright primary-school teacher. A class chorus is welcome but not needed.',
  '30-two-houses': 'A cheerful family with two homes and one skateboard. Marcus\'s own voice fits here.',
  '16-tata': 'Capable, warm and steady, a farmer, fond of her dog Rufus.',
};

/** The shape of public/admin/voice-script.json, which the voice booth reads. */
export interface VoiceScriptFile {
  /** What generated the file; do not edit by hand. */
  note: string;
  speakers: Array<{
    id: string;
    name: string;
    role: 'warden' | 'guest';
    voiceNote: string;
    lines: Array<{
      lineId: string;
      n: number;
      expression: string;
      /** The text the game shows now. `{animal}` stands for the animal's name. */
      text: string;
      /** The name-free draft (option A in the voice plan). */
      textNameFree: string;
      usesAnimalName: boolean;
    }>;
  }>;
}

/** Build the booth's script file from the game's own hand-over lines. */
export function buildVoiceScriptFile(): VoiceScriptFile {
  const lines = handoverVoiceScript();
  const order = [WARDEN_SPEAKER.id, ...ADOPTER_HOUSEHOLD_DEFS.map((h) => h.householdId)];
  const speakers: VoiceScriptFile['speakers'] = order.map((id) => {
    const mine = lines.filter((l) => l.speakerId === id);
    return {
      id,
      name: mine[0].speakerName,
      role: mine[0].role,
      voiceNote: VOICE_NOTES[id] ?? '',
      lines: mine.map((l) => ({
        lineId: l.lineId,
        n: l.n,
        expression: l.expression,
        text: l.text,
        textNameFree: l.textNameFree,
        usesAnimalName: l.usesAnimalName,
      })),
    };
  });
  return {
    note: 'Generated from packages/game-logic/src/adoption-dialogue.ts by apps/game/src/voice/__tests__/voice-script.test.ts (UPDATE_VOICE_SCRIPT=1). Do not edit by hand.',
    speakers,
  };
}
