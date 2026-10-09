/**
 * The motion setting: what the device says, what the player says, and
 * which of them wins.
 *
 * The three-way is the part worth testing hardest. A boolean would
 * have been easy and wrong — it cannot express "my system setting is
 * not right for me", which is the case the switch exists for — so each
 * of the three states is checked against each of the two device
 * answers, all six.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getMotionSetting,
  isMotionReduced,
  onMotionChange,
  resetMotionPreference,
  setMotionSetting,
  systemPrefersReduced,
} from '../motion-preference';

/**
 * A `matchMedia` that can be changed and that tells its listeners —
 * jsdom has none at all, and the behaviour under test is precisely
 * what happens when the device's answer moves.
 */
function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_: string, fn: () => void) => { listeners.add(fn); },
    removeEventListener: (_: string, fn: () => void) => { listeners.delete(fn); },
    addListener: (fn: () => void) => { listeners.add(fn); },
    removeListener: (fn: () => void) => { listeners.delete(fn); },
  };
  return {
    list,
    bound: () => listeners.size,
    /** The carer reaches for the device's accessibility settings. */
    set(value: boolean) {
      list.matches = value;
      for (const fn of [...listeners]) fn();
    },
  };
}

function install(initial: boolean) {
  const media = fakeMatchMedia(initial);
  vi.stubGlobal('matchMedia', () => media.list);
  return media;
}

beforeEach(() => {
  localStorage.clear();
  resetMotionPreference();
});

afterEach(() => {
  resetMotionPreference();
  vi.unstubAllGlobals();
});

describe('what the device says', () => {
  it('is read from the media query at boot', () => {
    install(true);
    expect(systemPrefersReduced()).toBe(true);
    expect(isMotionReduced()).toBe(true);
  });

  it('is false when the device says nothing', () => {
    install(false);
    expect(systemPrefersReduced()).toBe(false);
    expect(isMotionReduced()).toBe(false);
  });

  it('is false, not a crash, where there is no matchMedia at all', () => {
    // An older WKWebView, or a test environment. The game still runs;
    // it just has nothing to seed itself from.
    vi.stubGlobal('matchMedia', undefined);
    expect(systemPrefersReduced()).toBe(false);
    expect(isMotionReduced()).toBe(false);
  });

  it('is asked again every time, so a change mid-session is answered', () => {
    // **The case the whole thing is for**: a carer turns the setting
    // on while the child is in the game. Nothing caches the answer, so
    // the next thing to ask gets the new one.
    const media = install(false);
    expect(isMotionReduced()).toBe(false);
    media.set(true);
    expect(isMotionReduced()).toBe(true);
    media.set(false);
    expect(isMotionReduced()).toBe(false);
  });
});

describe('what the player says wins', () => {
  const CASES: Array<[ 'system' | 'reduced' | 'full', boolean, boolean ]> = [
    ['system', false, false],
    ['system', true, true],
    ['reduced', false, true],
    ['reduced', true, true],
    ['full', false, false],
    ['full', true, false],
  ];

  it.each(CASES)('%s with the device at %s is %s', (setting, device, expected) => {
    install(device);
    setMotionSetting(setting);
    expect(isMotionReduced()).toBe(expected);
  });

  it('follows the device until somebody says otherwise', () => {
    install(true);
    expect(getMotionSetting()).toBe('system');
    expect(isMotionReduced()).toBe(true);
  });

  it('stops following the device once the player has chosen', () => {
    const media = install(false);
    setMotionSetting('reduced');
    media.set(false);
    expect(isMotionReduced(), 'the player asked for reduced').toBe(true);
    setMotionSetting('full');
    media.set(true);
    expect(isMotionReduced(), 'the player asked for full').toBe(false);
  });

  it('goes back to following the device when told to', () => {
    const media = install(true);
    setMotionSetting('full');
    expect(isMotionReduced()).toBe(false);
    setMotionSetting('system');
    expect(isMotionReduced()).toBe(true);
    media.set(false);
    expect(isMotionReduced()).toBe(false);
  });
});

describe('the choice survives a reload', () => {
  it('is still there when the module is asked afresh', () => {
    install(false);
    setMotionSetting('reduced');
    // A reload is a new module state against the same storage, which
    // is what `resetMotionPreference` leaves behind.
    resetMotionPreference();
    expect(getMotionSetting()).toBe('reduced');
    expect(isMotionReduced()).toBe(true);
  });

  it('writes nothing for the default, so there is nothing to migrate', () => {
    install(false);
    setMotionSetting('reduced');
    expect(localStorage.getItem('arc_motion')).toBe('reduced');
    setMotionSetting('system');
    expect(localStorage.getItem('arc_motion')).toBeNull();
  });

  it('ignores a stored value that is not one of the three', () => {
    install(false);
    localStorage.setItem('arc_motion', 'sideways');
    expect(getMotionSetting()).toBe('system');
  });

  it('still answers when storage refuses, for this session', () => {
    // A private window, or an iOS clip with site data blocked. A
    // switch that does nothing when pressed is worse than one that
    // forgets.
    install(false);
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getMotionSetting()).toBe('system');
    setMotionSetting('reduced');
    expect(isMotionReduced()).toBe(true);
    get.mockRestore();
    set.mockRestore();
    remove.mockRestore();
  });
});

describe('being told when it changes', () => {
  it('tells a subscriber the device moved', () => {
    const media = install(false);
    const heard: boolean[] = [];
    const off = onMotionChange((reduced) => heard.push(reduced));
    media.set(true);
    media.set(false);
    expect(heard).toEqual([true, false]);
    off();
  });

  it('tells a subscriber the player moved', () => {
    install(false);
    const heard: boolean[] = [];
    const off = onMotionChange((reduced) => heard.push(reduced));
    setMotionSetting('reduced');
    setMotionSetting('system');
    expect(heard).toEqual([true, false]);
    off();
  });

  it('says nothing when the answer has not actually changed', () => {
    install(true);
    const heard: boolean[] = [];
    const off = onMotionChange((reduced) => heard.push(reduced));
    // The device already says reduced, so choosing reduced changes
    // the setting without changing the answer.
    setMotionSetting('reduced');
    expect(heard).toEqual([]);
    off();
  });

  it('binds the device listener only while somebody is listening', () => {
    const media = install(false);
    expect(media.bound()).toBe(0);
    const off1 = onMotionChange(() => {});
    const off2 = onMotionChange(() => {});
    expect(media.bound(), 'one listener for any number of subscribers').toBe(1);
    off1();
    expect(media.bound()).toBe(1);
    off2();
    expect(media.bound(), 'and released when the last one goes').toBe(0);
  });
});
