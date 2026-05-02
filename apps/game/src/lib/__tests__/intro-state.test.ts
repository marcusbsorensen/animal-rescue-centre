import { describe, it, expect, beforeEach } from 'vitest';
import { getSkipIntro, setSkipIntro, hasPlayedBefore, markPlayed } from '../intro-state';

describe('intro-state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getSkipIntro returns false by default', () => {
    expect(getSkipIntro()).toBe(false);
  });

  it('setSkipIntro(true) then getSkipIntro returns true', () => {
    setSkipIntro(true);
    expect(getSkipIntro()).toBe(true);
  });

  it('setSkipIntro(false) then getSkipIntro returns false', () => {
    setSkipIntro(true);
    setSkipIntro(false);
    expect(getSkipIntro()).toBe(false);
  });

  it('getSkipIntro tolerates corrupted localStorage and returns false', () => {
    localStorage.setItem('arc_skip_intro', 'not-a-bool');
    expect(getSkipIntro()).toBe(false);
  });

  it('hasPlayedBefore returns false on a fresh account', () => {
    expect(hasPlayedBefore()).toBe(false);
  });

  it('markPlayed then hasPlayedBefore returns true', () => {
    markPlayed();
    expect(hasPlayedBefore()).toBe(true);
  });

  it('markPlayed is idempotent', () => {
    markPlayed();
    markPlayed();
    expect(hasPlayedBefore()).toBe(true);
  });
});
