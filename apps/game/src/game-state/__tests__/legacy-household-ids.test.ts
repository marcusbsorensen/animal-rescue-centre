import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Saves written under the adoption roster's original household ids.
 *
 * The five L1 households were first called '01-pri-kaur', '03-nova-adebayo'
 * and so on, which cast.json never knew; they are now '01-priya',
 * '03-nova' and so on. A child who adopted an animal out before the change
 * has `rehomed` entries under the old id. Three things must hold for her:
 *
 * 1. The history comes back from the save exactly as it was written. It is
 *    not rewritten on load, because `rehomed` merges across devices by
 *    union of whole entries — a device that rewrote its copy would meet a
 *    server copy still holding the old id and keep both, so every
 *    adoption would count twice.
 * 2. The household she filled is still busy. An old id that quietly
 *    stopped matching would hand it back its capacity. Busy is for the
 *    21-day cooldown, not forever: an entry that has aged out frees the
 *    household, as a current-id entry would.
 * 3. The readers that bypass `getEligibleApplicants` translate too —
 *    `GameScene.findCast` and `AdoptionMatchScene`'s headroom count. Both
 *    live in Phaser scenes that cannot be imported under test, so they are
 *    read, the way `__tests__/collection-wiring.test.ts` reads the arrival
 *    switch.
 *
 * Same stubs as `collection-calls-save.test.ts`, for the same reasons.
 */

vi.mock('phaser', () => ({ default: {} }));

vi.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() }, from: vi.fn() },
  isSupabaseConfigured: () => true,
}));

vi.mock('../../ui/ErrorOverlay', () => ({
  showToast: vi.fn(),
  showBlocking: vi.fn(),
}));

const { supabase } = await import('../../lib/supabase');
const { loadGameState, saveGameState, resetSaveTracking } = await import('../loadSaveState');
const { GameStateStore } = await import('../GameStateStore');
const { clearLocalSave } = await import('../localSave');
const { getEligibleApplicants, commitAdoption, mergeSaveState, spawnAnimal } = await import('@arc/game-logic');

/** A game day is 7/30 of a real one (calendar.ts), so 3 game days ago is recent and 60 is not. */
const GAME_DAY_MS = (7 * 86_400_000) / 30;
const NOW = Date.now();

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;
const scene = {} as Parameters<typeof saveGameState>[0];
const USER = 'child-legacy-households';

/** Nova, adopted from under her original id, three game days ago. */
const OLD_NOVA = {
  animalId: 'old-cat-1',
  animalName: 'Mittens',
  species: 'cat',
  householdId: '03-nova-adebayo',
  date: NOW - 3 * GAME_DAY_MS,
};

/** The same adoption, long enough ago that Nova has settled and is free again. */
const OLD_NOVA_LONG_AGO = { ...OLD_NOVA, date: NOW - 60 * GAME_DAY_MS };

function cat() {
  return { ...spawnAnimal('cat'), state: 'pet' as const, bondLevel: 100 };
}

describe('a save holding old-style household ids', () => {
  beforeEach(async () => {
    localStorage.setItem('arc_session', JSON.stringify({
      userId: USER,
      username: 'BrambleFox',
      avatarEmoji: '🦊',
      avatarBgColour: '#fff',
      joinCode: 'FOX-428',
      token: 'a'.repeat(64),
    }));
    await clearLocalSave(USER);
    resetSaveTracking();
    invoke.mockReset();
  });

  async function loadSaveWith(rehomed: unknown[]) {
    invoke.mockResolvedValueOnce({
      data: { save: { state: { rehomed }, level: 4, version: 2 }, },
      error: null,
    });
    const store = new GameStateStore();
    await loadGameState(scene, store);
    return store;
  }

  it('comes back from the save as it was written', async () => {
    const store = await loadSaveWith([OLD_NOVA]);
    expect(store.rehomed).toEqual([OLD_NOVA]);
  });

  it('still counts the household as busy', async () => {
    const store = await loadSaveWith([OLD_NOVA]);
    const eligible = getEligibleApplicants(cat(), store, NOW).map((h) => h.householdId);

    expect(eligible).not.toContain('03-nova');
    // ...and nobody else was caught by it.
    for (const id of ['01-priya', '04-babcia', '06-hiro', '07-patel-greens']) {
      expect(eligible).toContain(id);
    }
  });

  it('frees the household once the old entry is past the cooldown, without rewriting it', async () => {
    const store = await loadSaveWith([OLD_NOVA_LONG_AGO]);
    const eligible = getEligibleApplicants(cat(), store, NOW).map((h) => h.householdId);

    expect(eligible).toContain('03-nova');
    expect(store.rehomed).toEqual([OLD_NOVA_LONG_AGO]);
  });

  it('writes the old entry back unchanged beside a new adoption under the current id', async () => {
    const store = await loadSaveWith([OLD_NOVA]);
    const second = cat();
    store.animals = [second];
    commitAdoption(second, '06-hiro', store, NOW);

    invoke.mockResolvedValueOnce({ data: { saved: true, version: 3 }, error: null });
    await saveGameState(scene, store);

    const body = invoke.mock.calls[invoke.mock.calls.length - 1][1].body;
    const rehomed = (body.state as { rehomed: Array<{ householdId: string }> }).rehomed;
    expect(rehomed.map((r) => r.householdId)).toEqual(['03-nova-adebayo', '06-hiro']);
  });

  it('does not double against a copy of the save that holds the same entry', () => {
    // The reason the entries are left alone: merge-save unions `rehomed` by
    // whole entry, so identical entries collapse and a rewritten one would
    // not. Two devices holding the old id merge to one adoption.
    const merged = mergeSaveState(
      { rehomed: [OLD_NOVA] },
      { rehomed: [OLD_NOVA] },
      { rehomed: [OLD_NOVA] },
    );
    expect(merged.state.rehomed).toEqual([OLD_NOVA]);
  });
});

describe('the readers that bypass getEligibleApplicants', () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

  it('looks a household up in cast.json by its current id', () => {
    const findCast = read('scenes/GameScene.ts')
      .split('private findCast(')[1]
      ?.split('\n  }\n')[0] ?? '';

    // If this fails the split has stopped finding the method and the
    // assertion below it is checking nothing.
    expect(findCast).toContain('this.castData');
    expect(findCast).toContain('canonicalHouseholdId(householdId)');
  });

  it('counts a household\'s headroom across both of its ids', () => {
    const source = read('scenes/AdoptionMatchScene.ts');

    expect(source).toContain('householdActiveUseCount(this.store.rehomed, applicant.householdId, this.now)');
    expect(source).not.toMatch(/rehomed\.filter\(\(r\) => r\.householdId ===/);
  });
});
