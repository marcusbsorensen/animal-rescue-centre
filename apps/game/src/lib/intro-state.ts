/**
 * intro-state — localStorage wrappers for the new-player intro flags.
 *
 * Two flags:
 *   - arc_skip_intro     : 'true' | 'false'  — kid's skip-walk-in preference
 *   - arc_intro_played   : '1'               — set after the first ever play,
 *                                              used to default-mute brand-new
 *                                              accounts on their very first walk
 *
 * Both flags are per-device (localStorage). v2 may migrate to a Supabase
 * column on the user record so the prefs follow across devices.
 */

const SKIP_KEY = 'arc_skip_intro';
const PLAYED_KEY = 'arc_intro_played';

export function getSkipIntro(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSkipIntro(value: boolean): void {
  try {
    localStorage.setItem(SKIP_KEY, value ? 'true' : 'false');
  } catch {
    // localStorage unavailable (e.g. private mode) — silent no-op.
  }
}

export function hasPlayedBefore(): boolean {
  try {
    return localStorage.getItem(PLAYED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPlayed(): void {
  try {
    localStorage.setItem(PLAYED_KEY, '1');
  } catch {
    // silent
  }
}
