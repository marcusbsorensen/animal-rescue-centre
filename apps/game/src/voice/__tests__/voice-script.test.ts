import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADOPTER_HOUSEHOLD_DEFS, handoverVoiceScript } from '@arc/game-logic';
import { buildVoiceScriptFile, VOICE_NOTES } from '../voice-cast';

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

  it('is printed in full in the recording plan, every line id', () => {
    const plan = fs.readFileSync(PLAN, 'utf8');
    for (const l of handoverVoiceScript()) {
      expect(plan, `the plan is missing ${l.lineId}`).toContain(`\`${l.lineId}\``);
    }
  });
});
