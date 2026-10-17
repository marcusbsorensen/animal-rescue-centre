import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADOPTER_HOUSEHOLD_DEFS, HANDOVER_LINES, handoverVoiceScript } from '@arc/game-logic';
import { buildVoiceScriptFile, VOICE_NOTES, WARDEN_PORTRAIT } from '../voice-cast';

/**
 * The voice booth reads public/admin/voice-script.json, and the recording plan
 * prints the same lines. Both come from the game's own hand-over script, so a
 * recording cannot be made against words the game no longer shows.
 *
 * To refresh the JSON after changing the script:
 *   UPDATE_VOICE_SCRIPT=1 pnpm --filter @arc/game exec vitest run src/voice
 */

const GAME = path.resolve(__dirname, '../../..');
const SCRIPT_JSON = path.join(GAME, 'public/admin/voice-script.json');
const PLAN = path.resolve(GAME, '../../docs/voice-recording-plan-2026-10-14.md');
const PUBLIC = path.join(GAME, 'public');

describe('the voice script', () => {
  it('is the file the voice booth reads', () => {
    const wanted = `${JSON.stringify(buildVoiceScriptFile(), null, 2)}\n`;
    if (process.env.UPDATE_VOICE_SCRIPT) fs.writeFileSync(SCRIPT_JSON, wanted);
    const onDisk = fs.readFileSync(SCRIPT_JSON, 'utf8');
    expect(onDisk, 'run UPDATE_VOICE_SCRIPT=1 to refresh public/admin/voice-script.json').toBe(wanted);
  });

  it('lists Marnie first and every adopting household, with their lines', () => {
    const file = buildVoiceScriptFile();
    expect(file.speakers[0].id).toBe('warden');
    expect(file.speakers.map((s) => s.id)).toEqual(['warden', ...ADOPTER_HOUSEHOLD_DEFS.map((h) => h.householdId)]);
    const total = file.speakers.reduce((n, s) => n + s.lines.length, 0);
    expect(total).toBe(handoverVoiceScript().length);
    expect(total).toBe(2 + ADOPTER_HOUSEHOLD_DEFS.length * 2);
  });

  it('has a voice note for every speaker and none for anyone who is not one', () => {
    const ids = ['warden', ...ADOPTER_HOUSEHOLD_DEFS.map((h) => h.householdId)];
    for (const id of ids) expect(VOICE_NOTES[id], id).toBeTruthy();
    expect(Object.keys(VOICE_NOTES).sort()).toEqual([...ids].sort());
  });

  it('lists Marnie and all 29 households, 60 lines, each with a portrait and a voice note to show (122B)', () => {
    const file = buildVoiceScriptFile();
    expect(file.speakers).toHaveLength(30);
    expect(ADOPTER_HOUSEHOLD_DEFS).toHaveLength(29);
    expect(file.speakers.reduce((n, s) => n + s.lines.length, 0)).toBe(60);
    for (const sp of file.speakers) {
      expect(sp.voiceNote.length, `${sp.id} voice note`).toBeGreaterThan(20);
      expect(sp.portrait, `${sp.id} portrait`).toMatch(/^\/admin\/scene-assets\/cast\/[a-z0-9-]+\.png$/);
      expect(fs.existsSync(path.join(PUBLIC, sp.portrait)), `${sp.id}: ${sp.portrait} is on disk`).toBe(true);
    }
    expect(file.speakers[0].portrait).toBe(WARDEN_PORTRAIT);
    // Every speaker is shown by a different picture.
    expect(new Set(file.speakers.map((s) => s.portrait)).size).toBe(30);
  });

  it('has one text per line, which is what is shown and what is recorded', () => {
    for (const sp of buildVoiceScriptFile().speakers) {
      for (const l of sp.lines) {
        expect(Object.keys(l).sort(), l.lineId).toEqual(['expression', 'lineId', 'n', 'text']);
        expect(l.text, l.lineId).not.toMatch(/[{}]/);
      }
    }
  });

  it('is printed in full in the recording plan, every line id and every word', () => {
    const plan = fs.readFileSync(PLAN, 'utf8');
    for (const l of handoverVoiceScript()) {
      expect(plan, `the plan is missing ${l.lineId}`).toContain(`\`${l.lineId}\``);
    }
    // The four lines, as the game says them. The plan prints each once (every
    // household says the same two), so the four texts must be in it verbatim.
    for (const l of HANDOVER_LINES) {
      expect(plan, `the plan does not print: ${l.text}`).toContain(l.text);
    }
  });
});
