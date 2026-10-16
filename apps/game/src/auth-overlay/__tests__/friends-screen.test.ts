// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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

/**
 * The page itself, run: its inline script is executed by jsdom, sent what the
 * host sends it, and read for what a child would see and what it posts back.
 * The way `exits-wiring.test.ts` runs the Paths panel.
 */
const FRIENDS_HTML = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'public', 'admin', 'friends.html'), 'utf8');

const pageListeners: Array<EventListenerOrEventListenerObject> = [];
const realAdd = window.addEventListener.bind(window);

/** The page, mounted as `?embed=1`; returns what it has posted to its host so far. */
function mountPage(): { posted: Msg[]; host: (type: string, payload?: unknown) => void } {
  const parsed = new DOMParser().parseFromString(FRIENDS_HTML, 'text/html');
  const scripts = [...parsed.body.querySelectorAll('script')].map((el) => el.textContent ?? '');
  parsed.body.querySelectorAll('script').forEach((el) => el.remove());
  document.body.replaceChildren(...[...parsed.body.childNodes].map((n) => document.importNode(n, true)));
  window.history.pushState({}, '', '/admin/friends.html?embed=1');
  window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions) => {
    if (type === 'message') pageListeners.push(fn);
    return realAdd(type, fn, opts);
  }) as typeof window.addEventListener;
  try {
    for (const code of scripts) {
      const el = document.createElement('script');
      el.textContent = `(function () {\n${code}\n})();`;
      document.body.appendChild(el);
    }
  } finally {
    window.addEventListener = realAdd as typeof window.addEventListener;
  }
  // The page posts to `parent`, which is the window itself here.
  const posted: Msg[] = [];
  const hear = ((e: MessageEvent) => { if (e.data?.source === 'arc-auth') posted.push(e.data as Msg); }) as EventListener;
  realAdd('message', hear);
  pageListeners.push(hear);
  return {
    posted,
    host: (type, payload) => {
      window.dispatchEvent(new MessageEvent('message', { data: { source: 'arc-auth-host', type, payload } }));
    },
  };
}

afterEach(() => {
  for (const fn of pageListeners.splice(0)) window.removeEventListener('message', fn);
  document.body.replaceChildren();
});

const OTTER = { id: 'otter-id', displayName: 'MossyOtter', emoji: '🦦', bg: '#d0f0c0' };
const DORMOUSE = { id: 'dormouse-id', displayName: 'CuriousDormouse99', emoji: '🐭', bg: '#ffd0a0' };

const cards = () => Array.from(document.querySelectorAll<HTMLElement>('.friend-card'));
/** The names on the board, as read (the page lets a long one break between its two words). */
const names = () => cards().map((c) => (c.querySelector('.friend-name')?.textContent ?? '').replace(/\u200B/g, ''));

describe('a friend card shows only what it has been told', () => {
  beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });

  it('has no last-visit line and no medal for a friend the game sent neither for', () => {
    const { host } = mountPage();
    host('friends', { friends: [OTTER, DORMOUSE] });
    expect(cards()).toHaveLength(2);
    expect(document.querySelectorAll('.friend-visit')).toHaveLength(0);
    expect(document.querySelectorAll('.friend-medal-wrap')).toHaveLength(0);
    expect(document.getElementById('friends-list')!.textContent).not.toContain('Last visit');
    expect(document.getElementById('friends-list')!.textContent).not.toContain('Sprout');
    // What stays: the face, the name and Remove.
    expect(names()[0]).toBe('MossyOtter');
    expect(cards()[0].querySelector('.remove-btn')).not.toBeNull();
  });

  it.each([[''], ['   '], [null], [3], [undefined]])('has no last-visit line for %j', (lastVisit) => {
    const { host } = mountPage();
    host('friends', { friends: [{ ...OTTER, lastVisit }] });
    expect(document.querySelectorAll('.friend-visit')).toHaveLength(0);
  });

  it('has the last-visit line once the game sends one', () => {
    const { host } = mountPage();
    host('friends', { friends: [{ ...OTTER, lastVisit: 'Yesterday' }] });
    expect(document.querySelector('.friend-visit')?.textContent).toBe('Last visit: Yesterday');
  });

  it.each([[0], [-1], [1.5], ['3'], [null], [undefined], [NaN]])('has no medal for a bond of %j', (bond) => {
    const { host } = mountPage();
    host('friends', { friends: [{ ...OTTER, bond }] });
    expect(document.querySelectorAll('.friend-medal-wrap')).toHaveLength(0);
  });

  it.each([[1, 'Sprout'], [3, 'Bloom'], [5, 'Champion'], [9, 'Champion']])('has the medal for a bond of %i: %s', (bond, label) => {
    const { host } = mountPage();
    host('friends', { friends: [{ ...OTTER, bond }] });
    expect(document.querySelector('.friend-medal-label')?.textContent).toBe(label);
  });
});
