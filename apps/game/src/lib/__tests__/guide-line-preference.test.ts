/**
 * The guide line setting: on until a parent says otherwise, and still
 * whatever they said after a reload.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isGuideLineOn,
  onGuideLineChange,
  resetGuideLinePreference,
  setGuideLine,
} from '../guide-line-preference';

beforeEach(() => {
  localStorage.clear();
  resetGuideLinePreference();
});

afterEach(() => {
  resetGuideLinePreference();
  vi.restoreAllMocks();
});

describe('the default', () => {
  it('is on, for a device nobody has touched', () => {
    expect(isGuideLineOn()).toBe(true);
  });

  it('is on when the stored value is not one it wrote', () => {
    localStorage.setItem('arc_guide_line', 'sideways');
    expect(isGuideLineOn()).toBe(true);
  });
});

describe('switching it', () => {
  it('turns off and back on', () => {
    setGuideLine(false);
    expect(isGuideLineOn()).toBe(false);
    setGuideLine(true);
    expect(isGuideLineOn()).toBe(true);
  });
});

describe('the choice survives a reload', () => {
  it('is still off when the module is asked afresh', () => {
    setGuideLine(false);
    resetGuideLinePreference();
    expect(isGuideLineOn()).toBe(false);
  });

  it('writes nothing for the default, so there is nothing to migrate', () => {
    setGuideLine(false);
    expect(localStorage.getItem('arc_guide_line')).toBe('off');
    setGuideLine(true);
    expect(localStorage.getItem('arc_guide_line')).toBeNull();
  });

  it('still answers when storage refuses, for this session', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(isGuideLineOn()).toBe(true);
    setGuideLine(false);
    expect(isGuideLineOn()).toBe(false);
    setGuideLine(true);
    expect(isGuideLineOn()).toBe(true);
  });
});

describe('being told when it changes', () => {
  it('tells a subscriber each change, and nothing when it has not changed', () => {
    const heard: boolean[] = [];
    const off = onGuideLineChange((on) => heard.push(on));
    setGuideLine(true);
    setGuideLine(false);
    setGuideLine(false);
    setGuideLine(true);
    expect(heard).toEqual([false, true]);
    off();
    setGuideLine(false);
    expect(heard).toEqual([false, true]);
  });
});
