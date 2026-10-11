import { describe, it, expect } from 'vitest';
import { mergeSaveState } from '../merge-save';

/**
 * Three-way merge of two divergent shelters.
 *
 * `base` is the last state both devices agreed on — the copy this device
 * had when it last synced. `mine` is what this device is trying to save.
 * `theirs` is what the server came back with in the 409. Every rule below
 * exists because two-way (base-less) merging gets that case wrong.
 */

const animal = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `A${id}`,
  species: 'cat',
  state: 'sheltered',
  arrivalStory: '',
  hunger: 20,
  tiredness: 20,
  happiness: 80,
  health: 100,
  bondLevel: 0,
  roomId: 'room-cat',
  ...over,
});

/** A minimal but structurally honest save. */
const save = (over: Record<string, unknown> = {}) => ({
  animals: [],
  totalRescued: 0,
  totalBonded: 0,
  earnedBadges: [],
  houseUpgrades: [],
  sickAnimals: {},
  economy: { coins: 0, lifetimeEarnings: 0 },
  placedDecorations: [],
  relationships: [],
  rehomed: [],
  rewilded: [],
  visitors: [],
  apprentices: [],
  gardenReturns: [],
  grantsReceived: [],
  unlockedCharms: [],
  eventCounters: {},
  wildVisitsUnlocked: false,
  hasCompletedFirstDrive: false,
  ...over,
});

describe('mergeSaveState — animals', () => {
  it('keeps animals rescued on either device', () => {
    const base = save({ animals: [animal('1')] });
    const mine = save({ animals: [animal('1'), animal('2')] });
    const theirs = save({ animals: [animal('1'), animal('3')] });

    const { state } = mergeSaveState(base, mine, theirs);
    expect((state.animals as Array<{ id: string }>).map((a) => a.id).sort())
      .toEqual(['1', '2', '3']);
  });

  it('does not resurrect an animal the other device adopted out', () => {
    // The case a union gets wrong. Animal 2 is in base and in mine, and
    // gone from theirs — that is an exit, not a stale copy.
    const base = save({ animals: [animal('1'), animal('2')] });
    const mine = save({ animals: [animal('1'), animal('2')] });
    const theirs = save({ animals: [animal('1')] });

    const { state } = mergeSaveState(base, mine, theirs);
    expect((state.animals as Array<{ id: string }>).map((a) => a.id)).toEqual(['1']);
  });

  it('does not delete an animal this device rescued', () => {
    // The mirror case, which a naive "take theirs" gets wrong. Animal 2
    // is absent from base and from theirs because it did not exist yet.
    const base = save({ animals: [animal('1')] });
    const mine = save({ animals: [animal('1'), animal('2')] });
    const theirs = save({ animals: [animal('1')] });

    const { state } = mergeSaveState(base, mine, theirs);
    expect((state.animals as Array<{ id: string }>).map((a) => a.id)).toEqual(['1', '2']);
  });

  it('takes the other device edits when this one did not touch the animal', () => {
    const base = save({ animals: [animal('1', { happiness: 50 })] });
    const mine = save({ animals: [animal('1', { happiness: 50 })] });
    const theirs = save({ animals: [animal('1', { happiness: 90 })] });

    const { state } = mergeSaveState(base, mine, theirs);
    expect((state.animals as Array<{ happiness: number }>)[0].happiness).toBe(90);
  });

  it('prefers this device when both edited the same animal', () => {
    const base = save({ animals: [animal('1', { happiness: 50 })] });
    const mine = save({ animals: [animal('1', { happiness: 70 })] });
    const theirs = save({ animals: [animal('1', { happiness: 90 })] });

    const { state } = mergeSaveState(base, mine, theirs);
    expect((state.animals as Array<{ happiness: number }>)[0].happiness).toBe(70);
  });

  it('keeps the furthest-along state even when the other device wins the animal', () => {
    // Care stats churn; a bond is a thing the child worked for. State only
    // ever advances, so the further of the two is never the wrong answer.
    const base = save({ animals: [animal('1', { state: 'sheltered', bondLevel: 10 })] });
    const mine = save({ animals: [animal('1', { state: 'sheltered', bondLevel: 20 })] });
    const theirs = save({ animals: [animal('1', { state: 'pet', bondLevel: 100 })] });

    const { state } = mergeSaveState(base, mine, theirs);
    const merged = (state.animals as Array<Record<string, unknown>>)[0];
    expect(merged.state).toBe('pet');
    expect(merged.bondLevel).toBe(100);
  });
});

describe('mergeSaveState — economy', () => {
  it('applies both devices spending and earning', () => {
    // Base 100. This device earned 30, the other spent 40. Newest-wins
    // would show either 130 or 60; neither is what happened.
    const base = save({ economy: { coins: 100, lifetimeEarnings: 100 } });
    const mine = save({ economy: { coins: 130, lifetimeEarnings: 130 } });
    const theirs = save({ economy: { coins: 60, lifetimeEarnings: 100 } });

    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.economy).toEqual({ coins: 90, lifetimeEarnings: 130 });
  });

  it('never lands a negative balance', () => {
    const base = save({ economy: { coins: 100, lifetimeEarnings: 100 } });
    const mine = save({ economy: { coins: 10, lifetimeEarnings: 100 } });
    const theirs = save({ economy: { coins: 20, lifetimeEarnings: 100 } });

    const { state } = mergeSaveState(base, mine, theirs);
    expect((state.economy as { coins: number }).coins).toBe(0);
  });

  it('leaves the balance alone when only one device moved it', () => {
    const base = save({ economy: { coins: 100, lifetimeEarnings: 100 } });
    const mine = save({ economy: { coins: 100, lifetimeEarnings: 100 } });
    const theirs = save({ economy: { coins: 175, lifetimeEarnings: 175 } });

    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.economy).toEqual({ coins: 175, lifetimeEarnings: 175 });
  });
});

describe('mergeSaveState — counters, sets and flags', () => {
  it('adds both devices progress to lifetime counters', () => {
    const base = save({ totalRescued: 10, totalBonded: 4 });
    const mine = save({ totalRescued: 12, totalBonded: 4 });
    const theirs = save({ totalRescued: 13, totalBonded: 6 });

    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.totalRescued).toBe(15);
    expect(state.totalBonded).toBe(6);
  });

  it('counts two devices that each rescued the same number', () => {
    // Both on 7 from a base of 5 is two rescues each, not two shared. Had
    // the +2 come from one write, this device would have recorded that
    // confirmation and its base would read 7 too.
    const base = save({ totalRescued: 5 });
    const same = save({ totalRescued: 7 });

    const { state } = mergeSaveState(base, same, same);
    expect(state.totalRescued).toBe(9);
  });

  it('leaves a counter neither device moved alone', () => {
    const base = save({ totalRescued: 5 });
    const same = save({ totalRescued: 5 });

    const { state } = mergeSaveState(base, same, same);
    expect(state.totalRescued).toBe(5);
  });

  it('unions badges and upgrades earned on either device', () => {
    const base = save({ earnedBadges: ['first-rescue'], houseUpgrades: [] });
    const mine = save({ earnedBadges: ['first-rescue', 'ten-rescues'], houseUpgrades: ['vet-room'] });
    const theirs = save({ earnedBadges: ['first-rescue', 'first-bond'], houseUpgrades: [] });

    const { state } = mergeSaveState(base, mine, theirs);
    expect((state.earnedBadges as string[]).sort())
      .toEqual(['first-bond', 'first-rescue', 'ten-rescues']);
    expect(state.houseUpgrades).toEqual(['vet-room']);
  });

  it('honours a removal from a set rather than re-adding it', () => {
    const base = save({ houseUpgrades: ['vet-room', 'garden'] });
    const mine = save({ houseUpgrades: ['vet-room', 'garden'] });
    const theirs = save({ houseUpgrades: ['vet-room'] });

    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.houseUpgrades).toEqual(['vet-room']);
  });

  it('leaves a one-way flag on once either device flipped it', () => {
    const base = save({ wildVisitsUnlocked: false, hasCompletedFirstDrive: false });
    const mine = save({ wildVisitsUnlocked: false, hasCompletedFirstDrive: true });
    const theirs = save({ wildVisitsUnlocked: true, hasCompletedFirstDrive: false });

    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.wildVisitsUnlocked).toBe(true);
    expect(state.hasCompletedFirstDrive).toBe(true);
  });

  it('adds event counters from both devices', () => {
    const base = save({ eventCounters: { walk_completed: 3 } });
    const mine = save({ eventCounters: { walk_completed: 5 } });
    const theirs = save({ eventCounters: { walk_completed: 4, groom_completed: 2 } });

    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.eventCounters).toEqual({ walk_completed: 6, groom_completed: 2 });
  });
});

describe('mergeSaveState — the badge counters', () => {
  it('adds the conflicts, heals and safe walks done on each device', () => {
    const base = save({ conflictsResolved: 4, selfHealed: 1, walksWithoutIncident: 3 });
    const mine = save({ conflictsResolved: 6, selfHealed: 1, walksWithoutIncident: 5 });
    const theirs = save({ conflictsResolved: 5, selfHealed: 3, walksWithoutIncident: 3 });

    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.conflictsResolved).toBe(7);
    expect(state.selfHealed).toBe(3);
    expect(state.walksWithoutIncident).toBe(5);
  });

  it('merges across a base that predates them, counting from zero', () => {
    // The first conflict after this ships: the ancestor is the last
    // confirmed save, which was written by a build with no such fields.
    const base = save();
    const mine = save({ conflictsResolved: 2, selfHealed: 1 });
    const theirs = save({ conflictsResolved: 3 });

    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.conflictsResolved).toBe(5);
    expect(state.selfHealed).toBe(1);
    expect(state.walksWithoutIncident).toBeUndefined();
  });

  it('keeps the larger count when there is no base to take deltas from', () => {
    const { state } = mergeSaveState(
      null, save({ selfHealed: 4 }), save({ selfHealed: 7 }),
    );
    expect(state.selfHealed).toBe(7);
  });

  it('unions the days played, counting a day both devices opened once', () => {
    const base = save({ playedDays: ['2026-10-10', '2026-10-11'] });
    const mine = save({ playedDays: ['2026-10-10', '2026-10-11', '2026-10-12'] });
    const theirs = save({ playedDays: ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'] });

    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.playedDays).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
  });

  it('takes the days from the side that has any, when the other predates the list', () => {
    const { state } = mergeSaveState(
      save(), save(), save({ playedDays: ['2026-10-12'] }),
    );
    expect(state.playedDays).toEqual(['2026-10-12']);
  });

  it('leaves the exit ledgers to their own union rule', () => {
    // The badge counters sit beside rehomed and rewilded in the save; the
    // ledgers merge by union of whole entries and nothing here touches that.
    const entry = (id: string) => ({ animalId: id, animalName: id, species: 'cat', householdId: 'h', date: 1 });
    const wild = (id: string) => ({ animalId: id, animalName: id, species: 'fox', date: 2 });
    const base = save({ rehomed: [entry('1')], rewilded: [], selfHealed: 0 });
    const mine = save({ rehomed: [entry('1'), entry('2')], rewilded: [wild('9')], selfHealed: 1 });
    const theirs = save({ rehomed: [entry('1'), entry('3')], rewilded: [], selfHealed: 2 });

    const { state } = mergeSaveState(base, mine, theirs);
    expect((state.rehomed as Array<{ animalId: string }>).map((r) => r.animalId).sort()).toEqual(['1', '2', '3']);
    expect((state.rewilded as Array<{ animalId: string }>).map((r) => r.animalId)).toEqual(['9']);
    expect(state.selfHealed).toBe(3);
  });
});

describe('mergeSaveState — the calendar', () => {
  const calendar = (lastRealDayChecked: string, over: Record<string, unknown> = {}) => ({
    gameStartedAt: '2026-10-01T09:00:00.000Z',
    currentInGameDate: { year: 1, month: 2, day: 4 },
    currentSeason: 'spring_bloom',
    activeEvents: [],
    dayOfYear: 34,
    lastRealDayChecked,
    ...over,
  });

  it('takes the server calendar but not an older real day than this device has', () => {
    // This device opened the game today and ran the daily reset; the other
    // device last saved yesterday. The server's calendar stands, but the day
    // it records must not roll back or tomorrow's reset runs a second time today.
    const mine = save({ calendar: calendar('2026-10-12') });
    const theirs = save({ calendar: calendar('2026-10-11', { dayOfYear: 40 }) });

    const { state } = mergeSaveState(save({ calendar: calendar('2026-10-11') }), mine, theirs);
    const merged = state.calendar as { lastRealDayChecked: string; dayOfYear: number };
    expect(merged.lastRealDayChecked).toBe('2026-10-12');
    expect(merged.dayOfYear).toBe(40);
  });

  it('takes the later day from the server when it is the later', () => {
    const mine = save({ calendar: calendar('2026-10-11') });
    const theirs = save({ calendar: calendar('2026-10-12') });
    const { state } = mergeSaveState(null, mine, theirs);
    expect((state.calendar as { lastRealDayChecked: string }).lastRealDayChecked).toBe('2026-10-12');
  });

  it('keeps whichever calendar exists when only one side has one', () => {
    const only = calendar('2026-10-12');
    expect(mergeSaveState(null, save({ calendar: only }), save()).state.calendar).toEqual(only);
    expect(mergeSaveState(null, save(), save({ calendar: only })).state.calendar).toEqual(only);
  });
});

describe('mergeSaveState — history and id-keyed lists', () => {
  it('keeps exit records from both devices', () => {
    const base = save({ rehomed: [{ animalId: '1', date: 1 }] });
    const mine = save({ rehomed: [{ animalId: '1', date: 1 }, { animalId: '2', date: 2 }] });
    const theirs = save({ rehomed: [{ animalId: '1', date: 1 }, { animalId: '3', date: 3 }] });

    const { state } = mergeSaveState(base, mine, theirs);
    expect((state.rehomed as Array<{ animalId: string }>).map((r) => r.animalId).sort())
      .toEqual(['1', '2', '3']);
  });

  it('merges decorations by instance id, honouring a removal', () => {
    const dec = (id: string, over = {}) => ({ id, code: 'c', roomId: 'r', x: 0, y: 0, placedAt: '', ...over });
    const base = save({ placedDecorations: [dec('d1'), dec('d2')] });
    const mine = save({ placedDecorations: [dec('d1'), dec('d2'), dec('d3')] });
    const theirs = save({ placedDecorations: [dec('d1')] });

    const { state } = mergeSaveState(base, mine, theirs);
    expect((state.placedDecorations as Array<{ id: string }>).map((d) => d.id))
      .toEqual(['d1', 'd3']);
  });

  it('merges relationships as a set of directed pairs', () => {
    const rel = (fromId: string, toId: string, type = 'friend') => ({ fromId, toId, type });
    const base = save({ relationships: [rel('1', '2')] });
    const mine = save({ relationships: [rel('1', '2'), rel('3', '4')] });
    const theirs = save({ relationships: [rel('1', '2'), rel('5', '6')] });

    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.relationships).toHaveLength(3);
  });

  it('merges the sick list by animal, honouring a cure', () => {
    const base = save({ sickAnimals: { 1: { id: 'flu' }, 2: { id: 'limp' } } });
    const mine = save({ sickAnimals: { 1: { id: 'flu' }, 2: { id: 'limp' } } });
    const theirs = save({ sickAnimals: { 1: { id: 'flu' } } });

    const { state } = mergeSaveState(base, mine, theirs);
    expect(Object.keys(state.sickAnimals as object)).toEqual(['1']);
  });
});

describe('mergeSaveState — depot', () => {
  it('adds up what both devices collected and spends both daily sessions', () => {
    const depot = (over: Record<string, unknown>) => ({
      sessionsRemainingToday: 3,
      sessionsMaxToday: 3,
      lastSessionDay: '2026-08-28',
      totalSessionsPlayed: 10,
      inventory: { parts: {}, tools: {}, treats: {}, superTreats: {}, decorations: {}, medicalSupplies: {} },
      ...over,
    });
    const base = save({ depot: depot({}) });
    const mine = save({
      depot: depot({
        sessionsRemainingToday: 2,
        totalSessionsPlayed: 11,
        inventory: { parts: { bolt: 2 }, tools: {}, treats: {}, superTreats: {}, decorations: {}, medicalSupplies: {} },
      }),
    });
    const theirs = save({
      depot: depot({
        sessionsRemainingToday: 1,
        totalSessionsPlayed: 12,
        inventory: { parts: { bolt: 1, cog: 3 }, tools: {}, treats: {}, superTreats: {}, decorations: {}, medicalSupplies: {} },
      }),
    });

    const { state } = mergeSaveState(base, mine, theirs);
    const merged = state.depot as {
      sessionsRemainingToday: number;
      totalSessionsPlayed: number;
      inventory: { parts: Record<string, number> };
    };
    // Both devices played, so both sessions are gone: 3 - 1 - 2.
    expect(merged.sessionsRemainingToday).toBe(0);
    expect(merged.totalSessionsPlayed).toBe(13);
    expect(merged.inventory.parts).toEqual({ bolt: 3, cog: 3 });
  });

  it('deducts a session played on each device even when the counts match', () => {
    const depot = (remaining: number) => ({
      sessionsRemainingToday: remaining,
      sessionsMaxToday: 3,
      lastSessionDay: '2026-08-28',
      totalSessionsPlayed: 10,
      inventory: {},
    });
    const base = save({ depot: depot(3) });
    const mine = save({ depot: depot(2) });
    const theirs = save({ depot: depot(2) });

    const { state } = mergeSaveState(base, mine, theirs);
    expect((state.depot as { sessionsRemainingToday: number }).sessionsRemainingToday).toBe(1);
  });

  it('leaves the budget alone when neither device played', () => {
    const depot = {
      sessionsRemainingToday: 3,
      sessionsMaxToday: 3,
      lastSessionDay: '2026-08-28',
      totalSessionsPlayed: 10,
      inventory: {},
    };
    const { state } = mergeSaveState(save({ depot }), save({ depot }), save({ depot }));
    expect((state.depot as { sessionsRemainingToday: number }).sessionsRemainingToday).toBe(3);
  });
});

describe('mergeSaveState — the rest', () => {
  it('takes the newer clock, weather and calendar wholesale', () => {
    const base = save({ timeProgress: { currentPhase: 'morning' } });
    const mine = save({ timeProgress: { currentPhase: 'afternoon' } });
    const theirs = save({ timeProgress: { currentPhase: 'evening' } });

    // theirs is the server copy and therefore the later wall-clock write.
    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.timeProgress).toEqual({ currentPhase: 'evening' });
  });

  it('takes the higher level', () => {
    const r = mergeSaveState(save(), save(), save(), { mine: 4, theirs: 6 });
    expect(r.level).toBe(6);
  });

  it('carries an unrecognised field through, preferring a side that changed it', () => {
    // Fields added by a later build must not be dropped by an older merge.
    const base = save({ somethingNew: 'a' });
    const mine = save({ somethingNew: 'a' });
    const theirs = save({ somethingNew: 'b' });

    const { state } = mergeSaveState(base, mine, theirs);
    expect(state.somethingNew).toBe('b');
  });

  it('survives a missing base by falling back to a two-way union', () => {
    // First conflict on a device that has no base snapshot yet — an older
    // build, or IndexedDB cleared. Losing an animal is the worse failure,
    // so with nothing to compare against, keep both sides.
    const mine = save({ animals: [animal('1'), animal('2')] });
    const theirs = save({ animals: [animal('1'), animal('3')] });

    const { state, notes } = mergeSaveState(null, mine, theirs);
    expect((state.animals as Array<{ id: string }>).map((a) => a.id).sort())
      .toEqual(['1', '2', '3']);
    expect(notes.join(' ')).toContain('no base');
  });

  it('reports what it did, for the log rather than the child', () => {
    const base = save({ animals: [animal('1')] });
    const mine = save({ animals: [animal('1'), animal('2')] });
    const theirs = save({ animals: [animal('1'), animal('3')] });

    const { notes } = mergeSaveState(base, mine, theirs);
    expect(notes.length).toBeGreaterThan(0);
  });

  it('is a no-op when nothing diverged', () => {
    // The commonest conflict is a collision on one field with the rest of
    // the shelter identical; every untouched field must come out unchanged.
    const same = save({ animals: [animal('1')], totalRescued: 7, houseUpgrades: ['vet-room'] });

    const { state } = mergeSaveState(same, same, same);
    expect(state.totalRescued).toBe(7);
    expect((state.animals as unknown[]).length).toBe(1);
    expect(state.houseUpgrades).toEqual(['vet-room']);
  });

  it('does not mutate any of its three inputs', () => {
    const base = save({ animals: [animal('1')], economy: { coins: 10, lifetimeEarnings: 10 } });
    const mine = save({ animals: [animal('1'), animal('2')], economy: { coins: 20, lifetimeEarnings: 20 } });
    const theirs = save({ animals: [animal('1')], economy: { coins: 5, lifetimeEarnings: 10 } });
    const snapshots = [base, mine, theirs].map((s) => JSON.stringify(s));

    mergeSaveState(base, mine, theirs);
    expect([base, mine, theirs].map((s) => JSON.stringify(s))).toEqual(snapshots);
  });
});
