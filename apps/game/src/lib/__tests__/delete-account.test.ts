import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// loadSaveState (for resetSaveTracking) pulls in Phaser and the overlays,
// which need a real canvas.
vi.mock('phaser', () => ({ default: {} }));
vi.mock('../../ui/ErrorOverlay', () => ({ showToast: vi.fn(), showBlocking: vi.fn() }));

const invoke = vi.fn();
vi.mock('../supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) }, from: vi.fn() },
  isSupabaseConfigured: () => true,
}));

const { deleteAccount } = await import('../delete-account');
const { putLocalSave, getLocalSave, putBaseSave, getBaseSave } = await import('../../game-state/localSave');

/**
 * The device half of deleting an account: ask the server, and only once
 * it says the account is gone, forget it here too. A family iPad holds
 * several children, so one child's deletion must leave the others alone.
 */

const ADA = {
  userId: 'ada-id', username: 'Ada', displayName: 'MossyOtter', avatarEmoji: '🦊',
  avatarBgColour: '#fff', joinCode: 'FOX-111', token: 'a'.repeat(64),
};

function localSave(userId: string) {
  return { userId, state: { animals: [] }, level: 2, version: 3, synced: true, savedAt: 1 };
}

/** What supabase-js hands back for a non-2xx answer from a function. */
function httpError(status: number, body: Record<string, unknown>) {
  return { data: null, error: { context: new Response(JSON.stringify(body), { status }) } };
}

beforeEach(async () => {
  localStorage.clear();
  invoke.mockReset();
  localStorage.setItem('arc_session', JSON.stringify(ADA));
  localStorage.setItem('arc_remembered_usernames', JSON.stringify(['Ada', 'Bo']));
  localStorage.setItem('arc-audio-prefs', '{"music":false}');
  localStorage.setItem('arc-signup-draft', '{"pin":"1234"}');
  await putLocalSave(localSave('ada-id'));
  await putBaseSave(localSave('ada-id'));
  await putLocalSave(localSave('bo-id'));
});

describe('deleteAccount', () => {
  it('sends the PIN with the session header, and no user id', async () => {
    invoke.mockResolvedValue({ data: { deleted: true }, error: null });
    await deleteAccount('4821');
    const [name, options] = invoke.mock.calls[0];
    expect(name).toBe('delete-account');
    expect(options.headers).toEqual({ 'x-arc-session': ADA.token });
    expect(options.body).toEqual({ pin: '4821' });
  });

  it('once deleted, forgets this account on the device and nothing else', async () => {
    invoke.mockResolvedValue({ data: { deleted: true }, error: null });
    expect(await deleteAccount('4821')).toBe('deleted');

    expect(localStorage.getItem('arc_session')).toBeNull();
    expect(JSON.parse(localStorage.getItem('arc_remembered_usernames')!)).toEqual(['Bo']);
    expect(localStorage.getItem('arc-signup-draft')).toBeNull();
    expect(await getLocalSave('ada-id')).toBeNull();
    expect(await getBaseSave('ada-id')).toBeNull();

    // Bo's shelter and the device's own settings stay.
    expect(await getLocalSave('bo-id')).not.toBeNull();
    expect(localStorage.getItem('arc-audio-prefs')).toBe('{"music":false}');
  });

  it.each([
    [403, 'wrong_pin', 'wrong-pin'],
    [429, 'too_many_tries', 'too-many-tries'],
    [401, 'signed_out', 'signed-out'],
    [500, 'failed', 'failed'],
  ])('a %i (%s) keeps everything on the device', async (status, code, outcome) => {
    invoke.mockResolvedValue(httpError(status, { error: 'x', code }));
    expect(await deleteAccount('1111')).toBe(outcome);
    expect(localStorage.getItem('arc_session')).not.toBeNull();
    expect(await getLocalSave('ada-id')).not.toBeNull();
  });

  it('keeps everything when the request never arrives', async () => {
    invoke.mockRejectedValue(new Error('network down'));
    expect(await deleteAccount('4821')).toBe('failed');
    expect(localStorage.getItem('arc_session')).not.toBeNull();
  });

  it('does not ask the server when nobody is signed in', async () => {
    localStorage.removeItem('arc_session');
    expect(await deleteAccount('4821')).toBe('signed-out');
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('the delete panel', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../ui/DeleteAccountPanel.ts'), 'utf-8');

  it('asks inside the game, never with a browser dialog', () => {
    expect(src).not.toMatch(/\b(window\.)?(confirm|prompt|alert)\(/);
  });

  it('is reachable from the account screen', () => {
    const scene = fs.readFileSync(path.resolve(__dirname, '../../scenes/AccountScene.ts'), 'utf-8');
    expect(scene).toContain("'Delete this account'");
    expect(scene).toMatch(/openDeleteAccountPanel\(this,/);
  });
});
