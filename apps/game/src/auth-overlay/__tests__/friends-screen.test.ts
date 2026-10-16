// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('../../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => ({ isMusicOn: () => false, toggleMusic: () => false }) },
}));
vi.mock('../../lib/auth', () => ({
  login: vi.fn(), signup: vi.fn(), checkUsername: vi.fn(), offerSignInNames: vi.fn(),
  SignupError: class extends Error {}, getRememberedUsernames: () => [],
}));
const getFriends = vi.fn();
const removeFriend = vi.fn();
vi.mock('../../lib/friends', () => ({
  getFriends: () => getFriends(),
  removeFriend: (id: string) => removeFriend(id),
}));
vi.mock('../../lib/supabase', () => ({ isSupabaseConfigured: () => true }));

const { mountAuth, unmountAuth } = await import('../AuthOverlay');

/**
 * The friends screen (146A): the host sends the list once the page has
 * loaded, and carries a removal the child confirmed to the server, then
 * tells the page how it went.
 */

const BO = { id: 'bo-id', displayName: 'MossyOtter', avatarEmoji: '🐰', avatarBgColour: '#d0f0c0' };

type Msg = { type?: string; payload?: Record<string, unknown> };
const sent = (spy: { mock: { calls: unknown[][] } }, type: string): Msg[] =>
  spy.mock.calls.map((c) => c[0] as Msg).filter((m) => m.type === type);

/** Mount the friends page, let it load, and spy on what it is sent. */
function openFriends() {
  mountAuth('friends', { onAction: () => {} }, { recruited: [] });
  const frame = document.querySelector('iframe')!;
  const spy = vi.spyOn(frame.contentWindow!, 'postMessage');
  frame.dispatchEvent(new Event('load'));
  return { frame, spy };
}

/** A message from the page, as the iframe would post it. */
function fromPage(frame: HTMLIFrameElement, type: string, payload: unknown): void {
  window.dispatchEvent(new MessageEvent('message', {
    data: { source: 'arc-auth', type, payload },
    source: frame.contentWindow,
  }));
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  getFriends.mockReset();
  removeFriend.mockReset();
});
afterEach(() => unmountAuth());

describe('the friends screen', () => {
  it('is sent the friends, in its own shape, once they have loaded', async () => {
    getFriends.mockResolvedValue([BO]);
    const { spy } = openFriends();
    await settle();
    expect(sent(spy, 'friends').map((m) => m.payload)).toEqual([
      { friends: [{ id: 'bo-id', displayName: 'MossyOtter', emoji: '🐰', bg: '#d0f0c0' }] },
    ]);
  });

  it('is sent an empty list when the friends cannot be loaded', async () => {
    getFriends.mockRejectedValue(new Error('offline'));
    const { spy } = openFriends();
    await settle();
    expect(sent(spy, 'friends').map((m) => m.payload)).toEqual([{ friends: [] }]);
  });

  it('removes a friend the child confirmed, and says so', async () => {
    getFriends.mockResolvedValue([BO]);
    removeFriend.mockResolvedValue(undefined);
    const { frame, spy } = openFriends();
    fromPage(frame, 'remove-friend', { id: 'bo-id' });
    await settle();
    expect(removeFriend).toHaveBeenCalledWith('bo-id');
    expect(sent(spy, 'friend-removed').map((m) => m.payload)).toEqual([{ id: 'bo-id' }]);
    expect(sent(spy, 'friend-remove-failed')).toEqual([]);
  });

  it('says when the removal failed, so the friend stays', async () => {
    getFriends.mockResolvedValue([BO]);
    removeFriend.mockRejectedValue(new Error('Too many tries'));
    const { frame, spy } = openFriends();
    fromPage(frame, 'remove-friend', { id: 'bo-id' });
    await settle();
    expect(sent(spy, 'friend-remove-failed').map((m) => m.payload)).toEqual([{ id: 'bo-id' }]);
    expect(sent(spy, 'friend-removed')).toEqual([]);
  });

  it('sends a late answer to nobody once the child has left the screen', async () => {
    getFriends.mockResolvedValue([BO]);
    let finish: () => void = () => {};
    removeFriend.mockReturnValue(new Promise<void>((r) => { finish = r; }));
    const { frame } = openFriends();
    fromPage(frame, 'remove-friend', { id: 'bo-id' });

    mountAuth('menu', { onAction: () => {} });
    const menu = document.querySelector('iframe')!;
    const menuSpy = vi.spyOn(menu.contentWindow!, 'postMessage');
    finish();
    await settle();
    expect(sent(menuSpy, 'friend-removed')).toEqual([]);
  });
});
