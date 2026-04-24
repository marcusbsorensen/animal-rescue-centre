import { describe, it, expect } from 'vitest';
import {
  CHARMS,
  initCharmsStore,
  recordCharmEvent,
  isCharmUnlocked,
  getUnlockedCharms,
  equipCharm,
  unequipCharm,
  getDefaultCharmForVehicle,
  type CharmId,
} from '../charms';

describe('CHARMS catalogue', () => {
  it('defines exactly 17 charms', () => {
    expect(Object.keys(CHARMS)).toHaveLength(17);
  });

  it('has three always-unlocked charms: bone, lucky-teddy, bicycle-bell', () => {
    const always = Object.values(CHARMS)
      .filter((c) => c.unlockRule.kind === 'always')
      .map((c) => c.id)
      .sort();
    expect(always).toEqual(['bicycle-bell', 'bone', 'lucky-teddy']);
  });

  it('wires default-vehicle charms for trikey and henry', () => {
    expect(CHARMS['bicycle-bell'].defaultOnVehicle).toBe('trikey');
    expect(CHARMS.bone.defaultOnVehicle).toBe('henry');
  });
});

describe('initCharmsStore', () => {
  it('unlocks the three always-charms, equips nothing, empty counters', () => {
    const store = initCharmsStore();
    expect(store.unlockedCharms.sort()).toEqual(['bicycle-bell', 'bone', 'lucky-teddy']);
    expect(store.equippedCharm).toBeNull();
    expect(store.eventCounters).toEqual({});
  });

  it('does not unlock any event-gated charm at init', () => {
    const store = initCharmsStore();
    expect(isCharmUnlocked(store, 'arc-pawprint-medal')).toBe(false);
    expect(isCharmUnlocked(store, 'fox-tail')).toBe(false);
    expect(isCharmUnlocked(store, 'golden-driving-medal')).toBe(false);
  });
});

describe('recordCharmEvent — single-event triggers', () => {
  it('unlocks arc-pawprint-medal on first vet run', () => {
    const store = initCharmsStore();
    const { newlyUnlocked } = recordCharmEvent(store, 'first-vet-run');
    expect(newlyUnlocked).toEqual(['arc-pawprint-medal']);
    expect(isCharmUnlocked(store, 'arc-pawprint-medal')).toBe(true);
  });

  it('does not double-unlock on a second vet-run event', () => {
    const store = initCharmsStore();
    recordCharmEvent(store, 'first-vet-run');
    const { newlyUnlocked } = recordCharmEvent(store, 'first-vet-run');
    expect(newlyUnlocked).toEqual([]);
    expect(store.eventCounters['first-vet-run']).toBe(2);
  });

  it('unlocks smiley-poop on first crate-accident-cleanup', () => {
    const store = initCharmsStore();
    const { newlyUnlocked } = recordCharmEvent(store, 'crate-accident-cleanup');
    expect(newlyUnlocked).toEqual(['smiley-poop']);
  });
});

describe('recordCharmEvent — count-threshold triggers', () => {
  it('unlocks silver-horseshoe on the 10th comfort-safe drive, not before or after', () => {
    const store = initCharmsStore();
    const unlocksSeen: CharmId[] = [];
    for (let i = 1; i <= 12; i++) {
      const { newlyUnlocked } = recordCharmEvent(store, 'drive-completed-with-comfort');
      unlocksSeen.push(...newlyUnlocked);
      if (i < 10) {
        expect(isCharmUnlocked(store, 'silver-horseshoe')).toBe(false);
      }
    }
    expect(unlocksSeen).toEqual(['silver-horseshoe']);
    expect(store.eventCounters['drive-completed-with-comfort']).toBe(12);
  });

  it('unlocks reflective-safety-star on the 5th clean hedgehog brake', () => {
    const store = initCharmsStore();
    for (let i = 1; i < 5; i++) {
      const { newlyUnlocked } = recordCharmEvent(store, 'clean-hedgehog-brake');
      expect(newlyUnlocked).toEqual([]);
    }
    const { newlyUnlocked } = recordCharmEvent(store, 'clean-hedgehog-brake');
    expect(newlyUnlocked).toEqual(['reflective-safety-star']);
  });

  it('unlocks golden-driving-medal on the 100th drive-completed', () => {
    const store = initCharmsStore();
    for (let i = 1; i < 100; i++) {
      const { newlyUnlocked } = recordCharmEvent(store, 'drive-completed');
      expect(newlyUnlocked).toEqual([]);
    }
    const { newlyUnlocked } = recordCharmEvent(store, 'drive-completed');
    expect(newlyUnlocked).toEqual(['golden-driving-medal']);

    // And a 101st call doesn't re-fire.
    const again = recordCharmEvent(store, 'drive-completed');
    expect(again.newlyUnlocked).toEqual([]);
  });
});

describe('equipCharm / unequipCharm', () => {
  it('throws when equipping a locked charm', () => {
    const store = initCharmsStore();
    expect(() => equipCharm(store, 'viking-longship')).toThrow();
    expect(store.equippedCharm).toBeNull();
  });

  it('succeeds after the unlock event fires', () => {
    const store = initCharmsStore();
    recordCharmEvent(store, 'first-viking-road-adoption');
    equipCharm(store, 'viking-longship');
    expect(store.equippedCharm).toBe('viking-longship');
  });

  it('allows equipping always-charms without any events', () => {
    const store = initCharmsStore();
    equipCharm(store, 'lucky-teddy');
    expect(store.equippedCharm).toBe('lucky-teddy');
  });

  it('clears equippedCharm on unequip', () => {
    const store = initCharmsStore();
    equipCharm(store, 'bone');
    unequipCharm(store);
    expect(store.equippedCharm).toBeNull();
  });
});

describe('getUnlockedCharms', () => {
  it('returns catalogue-ordered CharmDef entries', () => {
    const store = initCharmsStore();
    const defs = getUnlockedCharms(store);
    expect(defs.map((d) => d.id)).toEqual(['bone', 'lucky-teddy', 'bicycle-bell']);
  });

  it('includes newly unlocked charms in catalogue order', () => {
    const store = initCharmsStore();
    recordCharmEvent(store, 'first-bunny-adoption'); // carrot
    recordCharmEvent(store, 'first-vet-run');        // arc-pawprint-medal
    const ids = getUnlockedCharms(store).map((d) => d.id);
    // arc-pawprint-medal comes before carrot in the catalogue
    expect(ids).toEqual([
      'bone',
      'lucky-teddy',
      'bicycle-bell',
      'arc-pawprint-medal',
      'carrot',
    ]);
  });
});

describe('getDefaultCharmForVehicle', () => {
  it('returns bicycle-bell for trikey', () => {
    expect(getDefaultCharmForVehicle('trikey')).toBe('bicycle-bell');
  });

  it('returns bone for henry', () => {
    expect(getDefaultCharmForVehicle('henry')).toBe('bone');
  });

  it('returns null for vehicles with no configured default', () => {
    expect(getDefaultCharmForVehicle('bea')).toBeNull();
    expect(getDefaultCharmForVehicle('big-tilly')).toBeNull();
    expect(getDefaultCharmForVehicle('spark')).toBeNull();
  });
});
