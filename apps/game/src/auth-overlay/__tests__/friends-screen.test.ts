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
const addFriendByCode = vi.fn();
vi.mock('../../lib/friends', () => ({
  getFriends: () => getFriends(),
  removeFriend: (id: string) => removeFriend(id),
  addFriendByCode: (code: string) => addFriendByCode(code),
  // As the real one: a message, and the code the server put on the refusal.
  FriendError: class FriendError extends Error {
    constructor(message: string, readonly code: string, readonly retryAfterMs?: number) { super(message); }
  },
}));
vi.mock('../../lib/supabase', () => ({ isSupabaseConfigured: () => true }));

const { mountAuth, unmountAuth } = await import('../AuthOverlay');
const { FriendError } = await import('../../lib/friends');

/**
 * The friends screen (146A): the host sends the list once the page has
 * loaded, and carries a removal the child confirmed to the server, then
 * tells the page how it went. The code box works the same way: the
 * child types a friend's code, the host asks the server, and the page is told
 * the friend or the reason.
 */

const BO = { id: 'bo-id', displayName: 'MossyOtter', avatarEmoji: '🐰', avatarBgColour: '#d0f0c0' };
const HERON = { id: 'heron-id', displayName: 'QuietHeron', avatarEmoji: '🦢', avatarBgColour: '#e0d0f0' };

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
  addFriendByCode.mockReset();
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

describe('the code box on the friends screen', () => {
  it('adds a friend by their code, and sends the friend with the list as it now stands', async () => {
    getFriends.mockResolvedValueOnce([BO]).mockResolvedValueOnce([BO, HERON]);
    addFriendByCode.mockResolvedValue(HERON);
    const { frame, spy } = openFriends();
    fromPage(frame, 'add-friend', { joinCode: 'OTTER-428' });
    await settle();
    expect(addFriendByCode).toHaveBeenCalledWith('OTTER-428');
    expect(sent(spy, 'friend-added').map((m) => m.payload)).toEqual([{
      friend: { id: 'heron-id', displayName: 'QuietHeron', emoji: '🦢', bg: '#e0d0f0' },
      friends: [
        { id: 'bo-id', displayName: 'MossyOtter', emoji: '🐰', bg: '#d0f0c0' },
        { id: 'heron-id', displayName: 'QuietHeron', emoji: '🦢', bg: '#e0d0f0' },
      ],
    }]);
    expect(sent(spy, 'friend-add-failed')).toEqual([]);
  });

  it('sends the friend on their own when the list cannot be had again', async () => {
    getFriends.mockResolvedValueOnce([BO]).mockRejectedValueOnce(new Error('offline'));
    addFriendByCode.mockResolvedValue(HERON);
    const { frame, spy } = openFriends();
    fromPage(frame, 'add-friend', { joinCode: 'FOX-428' });
    await settle();
    expect(sent(spy, 'friend-added').map((m) => m.payload)).toEqual([
      { friend: { id: 'heron-id', displayName: 'QuietHeron', emoji: '🦢', bg: '#e0d0f0' } },
    ]);
  });

  it.each([
    ['otter428', 'OTTER-428'],
    ['fox 428', 'FOX-428'],
    ['  penguin-902 ', 'PENGUIN-902'],
    ['bat_111', 'BAT-111'],
  ])('asks the server for %s as %s', async (typed, code) => {
    getFriends.mockResolvedValue([BO]);
    addFriendByCode.mockResolvedValue(HERON);
    const { frame } = openFriends();
    fromPage(frame, 'add-friend', { joinCode: typed });
    await settle();
    expect(addFriendByCode).toHaveBeenCalledWith(code);
  });

  it.each([
    ['not_found', 'not-found'],
    ['own_code', 'own-code'],
    ['already_friends', 'already-friends'],
    ['too_many_tries', 'too-many-tries'],
    ['bad_format', 'bad-code'],
    ['no_code', 'bad-code'],
    ['signed_out', 'failed'],
    ['failed', 'failed'],
    ['a_code_from_the_future', 'failed'],
  ])('says why when the server refuses with %s: %s', async (serverCode, reason) => {
    getFriends.mockResolvedValue([BO]);
    addFriendByCode.mockRejectedValue(new FriendError('The server\'s English', serverCode));
    const { frame, spy } = openFriends();
    fromPage(frame, 'add-friend', { joinCode: 'OTTER-428' });
    await settle();
    expect(sent(spy, 'friend-add-failed').map((m) => m.payload)).toEqual([{ reason }]);
    expect(sent(spy, 'friend-added')).toEqual([]);
  });

  it('says it failed for any error that is not a refusal, and sends none of its words', async () => {
    getFriends.mockResolvedValue([BO]);
    addFriendByCode.mockRejectedValue(new Error('No player found with that code'));
    const { frame, spy } = openFriends();
    fromPage(frame, 'add-friend', { joinCode: 'OTTER-428' });
    await settle();
    expect(sent(spy, 'friend-add-failed').map((m) => m.payload)).toEqual([{ reason: 'failed' }]);
  });

  it.each(['hello', '', 'FO-428', 'ELEPHANT-428', 'OTTER-42', 'OTTER-4281', undefined])(
    'does not ask the server about %j, which is not a code',
    async (typed) => {
      getFriends.mockResolvedValue([BO]);
      const { frame, spy } = openFriends();
      fromPage(frame, 'add-friend', { joinCode: typed });
      await settle();
      expect(addFriendByCode).not.toHaveBeenCalled();
      expect(sent(spy, 'friend-add-failed').map((m) => m.payload)).toEqual([{ reason: 'bad-code' }]);
    },
  );

  it('sends a late answer to nobody once the child has left the screen', async () => {
    getFriends.mockResolvedValue([BO]);
    let finish: (f: typeof HERON) => void = () => {};
    addFriendByCode.mockReturnValue(new Promise<typeof HERON>((r) => { finish = r; }));
    const { frame } = openFriends();
    fromPage(frame, 'add-friend', { joinCode: 'OTTER-428' });

    mountAuth('menu', { onAction: () => {} });
    const menu = document.querySelector('iframe')!;
    const menuSpy = vi.spyOn(menu.contentWindow!, 'postMessage');
    finish(HERON);
    await settle();
    expect(sent(menuSpy, 'friend-added')).toEqual([]);
    expect(sent(menuSpy, 'friend-add-failed')).toEqual([]);
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

const HERON_ON_SCREEN = { id: 'heron-id', displayName: 'QuietHeron', emoji: '🦢', bg: '#e0d0f0' };

const input = () => document.getElementById('add-friend-input') as HTMLInputElement;
const addButton = () => document.getElementById('add-friend-btn') as HTMLButtonElement;
const said = () => document.getElementById('add-friend-msg')!.textContent;

/** A child types in the box and chooses Add. */
function typeAndAdd(code: string): void {
  input().value = code;
  addButton().click();
}

describe('the code box, on the page', () => {
  beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });

  it.each([
    ['fox428', 'FOX-428'],
    ['FOX 428', 'FOX-428'],
    ['fox-428', 'FOX-428'],
    [' Otter_428 ', 'OTTER-428'],
    ['penguin 902', 'PENGUIN-902'],
  ])('makes %j the code %s and asks the host for it', async (typed, code) => {
    const { posted } = mountPage();
    typeAndAdd(typed);
    await settle();
    expect(posted.filter((m) => m.type === 'add-friend').map((m) => m.payload)).toEqual([{ joinCode: code }]);
    expect(input().value).toBe(code);
    // Waiting for the answer: the box and the plank are still.
    expect(input().disabled).toBe(true);
    expect(addButton().disabled).toBe(true);
  });

  it.each([
    ['hello', 'A code is like OTTER-428.'],
    ['fox42', 'A code is like OTTER-428.'],
    ['elephant428', 'A code is like OTTER-428.'],
    ['', "Type your friend's code."],
    ['   ', "Type your friend's code."],
  ])('does not ask for %j, and says what a code is', async (typed, words) => {
    const { posted } = mountPage();
    typeAndAdd(typed);
    await settle();
    expect(posted.filter((m) => m.type === 'add-friend')).toEqual([]);
    expect(said()).toBe(words);
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().disabled).toBe(false);
  });

  it("does not ask for the player's own code, which the page knows is not a friend's", async () => {
    const { posted, host } = mountPage();
    host('init', { joinCode: 'FOX-428', recruited: [] });
    typeAndAdd('fox 428');
    await settle();
    expect(posted.filter((m) => m.type === 'add-friend')).toEqual([]);
    expect(said()).toBe("That's your own code!");
  });

  it('asks once while it waits', async () => {
    const { posted } = mountPage();
    typeAndAdd('fox428');
    addButton().click();
    input().closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(posted.filter((m) => m.type === 'add-friend')).toHaveLength(1);
  });

  it.each([
    ['not-found', 'No one has that code.'],
    ['own-code', "That's your own code!"],
    ['already-friends', "You're already friends!"],
    ['too-many-tries', 'Too many tries. Wait a bit.'],
    ['bad-code', 'A code is like OTTER-428.'],
    ['failed', "That didn't work. Try again."],
    ['a-reason-from-the-future', "That didn't work. Try again."],
    ['constructor', "That didn't work. Try again."],
  ])('says %s in words, keeps what was typed and is ready to try again', (reason, words) => {
    const { host } = mountPage();
    host('friends', { friends: [OTTER] });
    typeAndAdd('cat111');
    host('friend-add-failed', { reason });
    expect(said()).toBe(words);
    expect(input().value).toBe('CAT-111');
    expect(input().disabled).toBe(false);
    expect(addButton().disabled).toBe(false);
    expect(cards()).toHaveLength(1);
    // Typing again puts the answer away.
    input().dispatchEvent(new Event('input'));
    expect(said()).toBe('');
  });

  it('puts the new friend on the board without a reload, and empties the box', () => {
    const { host } = mountPage();
    host('friends', { friends: [OTTER] });
    typeAndAdd('cat111');
    host('friend-added', { friend: HERON_ON_SCREEN });
    expect(names()).toEqual(['MossyOtter', 'QuietHeron']);
    expect(said()).toBe('You have a new friend!');
    expect(input().value).toBe('');
    expect(input().getAttribute('aria-invalid')).toBeNull();
    expect(input().disabled).toBe(false);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('shows the list the host sent with the friend, and the friend only once', () => {
    const { host } = mountPage();
    host('friends', { friends: [OTTER] });
    typeAndAdd('cat111');
    host('friend-added', { friend: HERON_ON_SCREEN, friends: [OTTER, DORMOUSE, HERON_ON_SCREEN] });
    expect(cards().map((c) => c.querySelector('.friend-name')?.textContent?.replace(/​/g, '')))
      .toEqual(['MossyOtter', 'CuriousDormouse99', 'QuietHeron']);
  });

  it('turns "No friends here yet!" into the first friend', () => {
    const { host } = mountPage();
    host('friends', { friends: [] });
    expect(document.querySelector('.friends-empty-line1')?.textContent).toBe('No friends here yet!');
    typeAndAdd('cat111');
    host('friend-added', { friend: HERON_ON_SCREEN });
    expect(document.querySelector('.friends-empty')).toBeNull();
    expect(cards()).toHaveLength(1);
  });

  it('ignores an answer it did not ask for', () => {
    const { host } = mountPage();
    host('friends', { friends: [OTTER] });
    host('friend-add-failed', { reason: 'not-found' });
    expect(said()).toBe('');
  });

  it('says its title, in the same place the answers go', () => {
    mountPage();
    expect(document.querySelector('.add-friend-title')?.textContent).toBe('Add a friend!');
    expect(document.getElementById('add-friend-msg')?.getAttribute('role')).toBe('status');
    expect(input().getAttribute('aria-label')).toBe("Type your friend's code");
    // Room for the longest code, PENGUIN-902 with a space for a hyphen.
    expect(Number(input().maxLength)).toBeGreaterThanOrEqual(13);
  });
});
