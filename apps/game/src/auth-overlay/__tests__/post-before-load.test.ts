// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => ({ isMusicOn: () => false, toggleMusic: () => false }) },
}));
vi.mock('../../lib/auth', () => ({
  login: vi.fn(), signup: vi.fn(), checkUsername: vi.fn(), offerSignInNames: vi.fn(),
  SignupError: class extends Error {}, getRememberedUsernames: () => [],
}));
// The friends screen's list and removal (146A); none of these pages ask.
vi.mock('../../lib/friends', () => ({ getFriends: vi.fn(), removeFriend: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ isSupabaseConfigured: () => false }));

const { mountAuth, unmountAuth, postToActiveFrame } = await import('../AuthOverlay');

/**
 * ForgotPinScene fetches the clue for the PIN and posts it to the
 * forgot-PIN page. A message posted before the page has loaded goes to the
 * iframe's blank first document and is lost, so it waits for the page.
 * (The account e2e on a local stack, where the server answers quickly,
 * found the screen saying "No clue saved" for a clue that was there.)
 */
describe('a message for the auth page sent while it is loading', () => {
  afterEach(() => unmountAuth());

  function hintMessages(spy: { mock: { calls: unknown[][] } }): unknown[] {
    return spy.mock.calls
      .map((c) => c[0] as { type?: string; payload?: { hint?: string } })
      .filter((m) => m.type === 'init' && m.payload?.hint)
      .map((m) => m.payload!.hint);
  }

  it('waits for the page, then arrives', () => {
    mountAuth('forgot-pin', { onAction: () => {} });
    const frame = document.querySelector('iframe')!;
    const spy = vi.spyOn(frame.contentWindow!, 'postMessage');

    postToActiveFrame('init', { username: 'PebbleKite', hint: 'A birthday' });
    expect(hintMessages(spy)).toEqual([]);

    frame.dispatchEvent(new Event('load'));
    expect(hintMessages(spy)).toEqual(['A birthday']);
  });

  it('goes straight through once the page has loaded', () => {
    mountAuth('forgot-pin', { onAction: () => {} });
    const frame = document.querySelector('iframe')!;
    const spy = vi.spyOn(frame.contentWindow!, 'postMessage');
    frame.dispatchEvent(new Event('load'));

    postToActiveFrame('init', { username: 'PebbleKite', hint: 'A birthday' });
    expect(hintMessages(spy)).toEqual(['A birthday']);
  });

  it('is dropped, not delivered to the next page, when the page is taken down first', () => {
    mountAuth('forgot-pin', { onAction: () => {} });
    postToActiveFrame('init', { username: 'PebbleKite', hint: 'A birthday' });
    unmountAuth();

    mountAuth('login', { onAction: () => {} });
    const frame = document.querySelector('iframe')!;
    const spy = vi.spyOn(frame.contentWindow!, 'postMessage');
    frame.dispatchEvent(new Event('load'));
    expect(hintMessages(spy)).toEqual([]);
  });
});
