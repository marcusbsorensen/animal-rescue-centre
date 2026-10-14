// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { planPublish, ffmpegArgs } from '../voice-publish.mjs';

const REAL_SCRIPT = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../public/admin/voice-script.json'), 'utf8'),
) as { speakers: Array<{ id: string; lines: Array<{ lineId: string; text: string }> }> };

const script = {
  speakers: [
    { id: 'warden', lines: [
      { lineId: 'handover-warden-1', text: 'Meet our little friend! This one has been hoping for the perfect home.' },
      { lineId: 'handover-warden-3', text: 'Look after {animal} for us, won\'t you?' },
    ] },
    { id: '01-priya', lines: [
      { lineId: 'handover-01-priya-2', text: 'Hello, little one! We\'ve come all this way to meet you.' },
    ] },
  ],
};

const kept = (over: Record<string, unknown> = {}) => ({
  lineId: 'handover-warden-1',
  file: 'handover-warden-1.webm',
  text: 'Meet our little friend! This one has been hoping for the perfect home.',
  consent: true,
  ...over,
});

describe('planPublish', () => {
  it('publishes a take whose words are the words the game shows', () => {
    const plan = planPublish(script, [kept()]);
    expect(plan.publish.map((k) => k.lineId)).toEqual(['handover-warden-1']);
    expect(plan.held).toEqual([]);
  });

  it('holds back a take recorded against different words than the game shows', () => {
    const plan = planPublish(script, [kept({ text: 'Here is our little friend. They are hoping for a home.' })]);
    expect(plan.publish).toEqual([]);
    expect(plan.held[0].reason).toContain('not the words the game shows');
  });

  it('holds back a line the game still shows with the animal\'s name in it', () => {
    const plan = planPublish(script, [kept({ lineId: 'handover-warden-3', text: 'Look after them for us, won\'t you?' })]);
    expect(plan.publish).toEqual([]);
    expect(plan.held[0].reason).toContain('animal');
  });

  it('holds back a take with no agreement on it', () => {
    expect(planPublish(script, [kept({ consent: false })]).held[0].reason).toContain('agreed');
    expect(planPublish(script, [kept({ consent: undefined })]).publish).toEqual([]);
  });

  it('holds back a take for a line that is not in the script', () => {
    const plan = planPublish(script, [kept({ lineId: 'handover-nobody-9' })]);
    expect(plan.held[0].reason).toContain('not a line');
  });

  it('reports published files that no longer have a kept take', () => {
    const plan = planPublish(script, [kept()], ['handover-warden-1', 'handover-01-priya-2']);
    expect(plan.orphans).toEqual(['handover-01-priya-2']);
  });
});

describe('planPublish against the real script (121A)', () => {
  const lines = REAL_SCRIPT.speakers.flatMap((sp) => sp.lines);

  it('publishes a take recorded against each of the 60 final lines, the words as the booth saves them', () => {
    expect(lines).toHaveLength(60);
    const takes = lines.map((l) => ({ lineId: l.lineId, file: `${l.lineId}.webm`, text: l.text, consent: true }));
    const plan = planPublish(REAL_SCRIPT, takes);
    expect(plan.held).toEqual([]);
    expect(plan.publish).toHaveLength(60);
  });

  it('holds back a take recorded against anything else, one word out', () => {
    const l = lines[0];
    const plan = planPublish(REAL_SCRIPT, [
      { lineId: l.lineId, file: `${l.lineId}.webm`, text: l.text.replace('little friend', 'friend'), consent: true },
    ]);
    expect(plan.publish).toEqual([]);
    expect(plan.held[0].reason).toContain('not the words the game shows');
  });

  it('no longer holds anything back for the animal\'s name, because no line has it', () => {
    expect(lines.filter((l) => l.text.includes('{animal}'))).toEqual([]);
  });
});

describe('ffmpegArgs', () => {
  it('makes mono 44.1 kHz MP3 at 96 kbps, trimmed and levelled', () => {
    const args = ffmpegArgs('in.webm', 'out.mp3');
    expect(args.slice(-1)).toEqual(['out.mp3']);
    expect(args).toContain('libmp3lame');
    expect(args[args.indexOf('-ac') + 1]).toBe('1');
    expect(args[args.indexOf('-ar') + 1]).toBe('44100');
    expect(args[args.indexOf('-b:a') + 1]).toBe('96k');
    const filter = args[args.indexOf('-af') + 1];
    expect(filter).toContain('silenceremove');
    expect(filter).toContain('loudnorm=I=-16');
  });
});
