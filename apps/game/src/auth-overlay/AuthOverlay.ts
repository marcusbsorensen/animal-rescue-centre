/**
 * AuthOverlay — mounts the HTML welcome/login/signup screens as a full-
 * viewport iframe over the Phaser canvas. The screen pages postMessage
 * primary actions (PLAY!, submit, nav) back to us; we bridge into the
 * real auth API (lib/auth.ts) and route the host Phaser scene.
 *
 * Handshake:
 *   - parent → iframe: {type:'init', payload:{usernames:string[]}}  (once loaded)
 *   - iframe → parent: {type:'play'|'login'|'signup'|'back-to-welcome'}
 *   - iframe → parent: {type:'login-submit', payload:{username,pin}}
 *   - iframe → parent: {type:'need-names'}   (the signup name screen wants ready-made names)
 *   - parent → iframe: {type:'sign-in-names', payload:{names:string[]}}   (empty on failure)
 *   - iframe → parent: {type:'signup-complete', payload:{username,pin,avatarEmoji,avatarBgColour,hintCode?,displayName?,readyMadeName?}}
 *   - parent → iframe: {type:'auth-error', payload:{message, suggestions?}}   (on failure, iframe shakes+clears)
 *
 * The friends screen (146A):
 *   - parent → iframe: {type:'friends', payload:{friends:[{id,displayName,emoji,bg}]}}   (once loaded; [] on failure)
 *   - iframe → parent: {type:'remove-friend', payload:{id}}   (after the child chose Remove on the card)
 *   - parent → iframe: {type:'friend-removed'|'friend-remove-failed', payload:{id}}
 *   - iframe → parent: {type:'add-friend', payload:{joinCode}}   (a code typed in the box, as FOX-428)
 *   - parent → iframe: {type:'friend-added', payload:{friend:{id,displayName,emoji,bg}, friends?:[...]}}
 *       (`friends` is the list as the server now holds it, when it could be had)
 *   - parent → iframe: {type:'friend-add-failed', payload:{reason}}
 *       (reason: not-found | own-code | already-friends | too-many-tries | bad-code | failed;
 *        the page has the words for each)
 */

import { login, signup, checkUsername, offerSignInNames, SignupError, getRememberedUsernames, type AuthSession } from '../lib/auth';
import { addFriendByCode, FriendError, getFriends, removeFriend, type Friend } from '../lib/friends';
import { isSupabaseConfigured } from '../lib/supabase';
import { AudioManager } from '../audio/AudioManager';
import { isPinHintCode, isDisplayNameBase } from '@arc/game-logic';

export type AuthAction =
  | 'play'
  | 'login'
  | 'signup'
  | 'friends'
  | 'logout'
  | 'back-to-menu'
  | 'back-to-welcome'
  | 'forgot-pin'                  // login → "Forgot your secret code?" → recovery flow
  | 'recruit-apprentice'
  | 'auth-success-existing'      // login() resolved
  | 'auth-success-new'            // signup() resolved — route to welcome-new
  | 'intro-complete'              // panel 4 tapped — IntroScene starts GameScene
  | 'set-skip-intro'              // skip-future toggle changed — IntroScene writes localStorage
  | 'intro-climactic-sfx';        // panel 4 tapped — IntroScene plays sfx-arrive + species + voice

export interface AuthOverlayHandlers {
  onAction: (action: AuthAction, session?: AuthSession, payload?: Record<string, unknown>) => void;
}

export interface MenuStats {
  totalAnimals?: number;
  happyToday?: number;
  needFeeding?: number;
}

export type AuthPage = 'welcome' | 'login' | 'signup' | 'welcome-new' | 'menu' | 'friends' | 'forgot-pin' | 'intro';

const PAGE_URLS: Record<AuthPage, string> = {
  welcome:      '/admin/welcome.html?embed=1',
  login:        '/admin/login.html?embed=1',
  signup:       '/admin/signup.html?embed=1',
  'welcome-new': '/admin/welcome-new.html?embed=1',
  menu:         '/admin/menu.html?embed=1',
  friends:      '/admin/friends.html?embed=1',
  'forgot-pin': '/admin/forgot-pin.html?embed=1',
  intro:        '/admin/intro.html?embed=1',
};

let activeFrame: HTMLIFrameElement | null = null;
/** True once the mounted page has loaded and can hear a message. */
let activeFrameLoaded = false;
/** Messages for the mounted page sent before it had loaded. */
let pendingPosts: Array<{ type: string; payload?: unknown }> = [];
let activeListener: ((e: MessageEvent) => void) | null = null;

/** Send a message from parent → iframe (used for init + error feedback). */
function postToFrame(type: string, payload?: unknown): void {
  if (!activeFrame?.contentWindow) return;
  activeFrame.contentWindow.postMessage({ source: 'arc-auth-host', type, payload }, '*');
}

/** Public version — host scenes can post to whichever auth iframe is
 *  currently mounted. Used by ForgotPinScene to push the kid's
 *  freshly-fetched PIN-hint. A message sent before the page has loaded
 *  waits for it: posted earlier, it would reach the blank document the
 *  iframe starts with, and be lost. */
export function postToActiveFrame(type: string, payload?: unknown): void {
  if (!activeFrame) return;
  if (!activeFrameLoaded) {
    pendingPosts.push({ type, payload });
    return;
  }
  postToFrame(type, payload);
}

export function mountAuth(
  page: AuthPage,
  handlers: AuthOverlayHandlers,
  context?: { name?: string; session?: AuthSession; stats?: MenuStats; recruited?: string[]; reason?: string;
              skipIntro?: boolean; speciesForArrival?: string; arrivingSpriteSrc?: string; musicOn?: boolean },
): () => void {
  unmountAuth();

  const frame = document.createElement('iframe');
  let src = PAGE_URLS[page];
  if (page === 'welcome-new' && context?.name) {
    src += '&name=' + encodeURIComponent(context.name);
  }
  frame.src = src;
  frame.style.cssText = [
    'position: fixed', 'inset: 0',
    'width: 100%', 'height: 100%',
    'border: 0', 'z-index: 9999',
    'background: #fef9ef',
  ].join(';');
  frame.setAttribute('aria-label', `A.R.C. ${page} screen`);
  document.body.appendChild(frame);
  activeFrame = frame;
  activeFrameLoaded = false;
  pendingPosts = [];

  // The friends list, asked for while the page loads and sent once it has.
  const friendsList = page === 'friends' ? friendsForScreen() : null;

  // After iframe loads, send any per-page init data it needs.
  frame.addEventListener('load', () => {
    if (page === 'login') {
      const usernames = getRememberedUsernames();
      postToFrame('init', { usernames });
    }
    if (page === 'signup' && context?.reason) {
      // Pass the "why we're here" reason to the signup iframe, for a
      // page that has a note to show for it.
      postToFrame('init', { reason: context.reason });
    }
    if (page === 'menu' && context?.session) {
      postToFrame('init', { ...context.session, stats: context.stats });
    }
    if (page === 'friends') {
      postToFrame('init', {
        joinCode: context?.session?.joinCode,
        recruited: context?.recruited ?? [],
      });
      void friendsList?.then((friends) => {
        if (activeFrame === frame) postToFrame('friends', { friends });
      });
    }
    if (page === 'intro' && context) {
      postToFrame('init', {
        skipIntro: context.skipIntro ?? false,
        speciesForArrival: context.speciesForArrival,
        arrivingSpriteSrc: context.arrivingSpriteSrc,
        musicOn: context.musicOn ?? AudioManager.getInstance().isMusicOn(),
      });
    }
    // Always sync the current music-on state so the speaker emoji
    // starts in the right 🔊/🔇 position regardless of page.
    postToFrame('music-state', { enabled: AudioManager.getInstance().isMusicOn() });
    // Then anything a scene sent while the page was still loading.
    if (activeFrame === frame) {
      activeFrameLoaded = true;
      const queued = pendingPosts;
      pendingPosts = [];
      for (const m of queued) postToFrame(m.type, m.payload);
    }
  });

  activeListener = async (e: MessageEvent) => {
    if (frame.contentWindow && e.source !== frame.contentWindow) return;
    const msg = e.data;
    if (!msg || msg.source !== 'arc-auth' || typeof msg.type !== 'string') return;

    // Navigation-style actions — pass straight through to the host scene.
    if (msg.type === 'play' || msg.type === 'login' ||
        msg.type === 'signup' || msg.type === 'back-to-welcome' ||
        msg.type === 'friends' || msg.type === 'logout' ||
        msg.type === 'back-to-menu' ||
        msg.type === 'forgot-pin' ||
        msg.type === 'intro-complete' || msg.type === 'set-skip-intro' ||
        msg.type === 'intro-climactic-sfx') {
      handlers.onAction(msg.type as AuthAction, undefined, msg.payload);
      return;
    }
    // Friends-page: recruit-apprentice carries a {id} payload up to
    // the host scene, which calls the game-logic recruit function.
    if (msg.type === 'recruit-apprentice') {
      handlers.onAction('recruit-apprentice', undefined, msg.payload);
      return;
    }
    // Friends-page: the child chose Remove on a friend's card and then on
    // the question. The answer goes back to the same page only: if the
    // child has left it, there is nothing to update.
    if (msg.type === 'remove-friend') {
      const id = String((msg.payload as { id?: unknown })?.id ?? '');
      let removed = false;
      try {
        await removeFriend(id);
        removed = true;
      } catch {
        removed = false;
      }
      if (activeFrame === frame) postToFrame(removed ? 'friend-removed' : 'friend-remove-failed', { id });
      return;
    }
    // Friends-page: the child typed a friend's code and chose Add. The answer
    // goes back to the same page only, as with Remove. What is not three to
    // seven letters and three numbers is not sent: the server would refuse it,
    // and the page can say so without the round trip.
    if (msg.type === 'add-friend') {
      const joinCode = joinCodeFrom((msg.payload as { joinCode?: unknown })?.joinCode);
      if (!joinCode) {
        if (activeFrame === frame) postToFrame('friend-add-failed', { reason: 'bad-code' });
        return;
      }
      let friend: Friend;
      try {
        friend = await addFriendByCode(joinCode);
      } catch (err) {
        if (activeFrame === frame) postToFrame('friend-add-failed', { reason: addFailure(err) });
        return;
      }
      // The list as it now stands, so the board is the server's; without it
      // (the call failed) the page puts the new friend on the end of its own.
      const friends = await friendsOnScreen();
      if (activeFrame === frame) {
        postToFrame('friend-added', { friend: screenFriend(friend), ...(friends ? { friends } : {}) });
      }
      return;
    }
    // Speaker icon in the screen — toggle music, then echo the state
    // back so the icon flips between 🔊 and 🔇. This runs inside the
    // user-activation bubble of the click, so the AudioContext is
    // allowed to start (browsers block autoplay without a gesture).
    if (msg.type === 'toggle-music') {
      const enabled = AudioManager.getInstance().toggleMusic();
      postToFrame('music-state', { enabled });
      return;
    }

    // Name availability, asked from the name screen before it advances.
    // Always answers — `checkUsername` fails open — so the iframe never
    // waits forever on a dead network.
    if (msg.type === 'check-name') {
      const name = String((msg.payload as { username?: unknown })?.username ?? '');
      const result = await checkUsername(name);
      postToFrame('name-checked', { username: name, ...result });
      return;
    }

    // Ready-made sign-in names for the name screen: three when it opens,
    // three more for each "Show another". Always answers, with an empty
    // list on failure, so the button never stays disabled.
    if (msg.type === 'need-names') {
      postToFrame('sign-in-names', { names: await offerSignInNames() });
      return;
    }

    // Real auth submissions — call lib/auth, route on success, shake on failure.
    if (msg.type === 'login-submit') {
      try {
        const session = await login(msg.payload);
        handlers.onAction('auth-success-existing', session);
      } catch (err) {
        postToFrame('auth-error', { message: err instanceof Error ? err.message : 'Login failed' });
      }
      return;
    }
    // Signup completion — the iframe sends 'signup-complete' once the
    // whole multi-stage flow (name+animal → PIN → clue) is done. Older
    // 'signup-submit' kept as an alias for back-compat with any external
    // callers still using the original event name. The payload carries
    // `hintCode`, a code from the fixed clue list; typed text is never
    // passed on, even if an old page sends it. `displayName` is the name
    // other players see, as the page showed it: passed on only if it is a
    // pair from the word lists, and the server checks again.
    if (msg.type === 'signup-complete' || msg.type === 'signup-submit') {
      try {
        const raw = (msg.payload ?? {}) as Record<string, unknown>;
        const data = {
          username: String(raw.username ?? ''),
          pin: String(raw.pin ?? ''),
          avatarEmoji: String(raw.avatarEmoji ?? raw.animal ?? ''),
          avatarBgColour: String(raw.avatarBgColour ?? '#ffd0a0'),
          pinHintCode: isPinHintCode(raw.hintCode) ? raw.hintCode : undefined,
          displayName: isDisplayNameBase(raw.displayName) ? raw.displayName : undefined,
          // Picked from the offered names, not typed: the server claims it.
          readyMadeName: raw.readyMadeName === true ? true : undefined,
        };
        const session = await signup(data);
        handlers.onAction('auth-success-new', session);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Signup failed';
        const suggestions = err instanceof SignupError ? err.suggestions : undefined;
        postToFrame('auth-error', { message, suggestions });
      }
      return;
    }
  };
  window.addEventListener('message', activeListener);

  return unmountAuth;
}

type ScreenFriend = { id: string; displayName: string; emoji: string; bg: string };

/** A friend in the page's own shape. */
function screenFriend(f: Friend): ScreenFriend {
  return { id: f.id, displayName: f.displayName, emoji: f.avatarEmoji, bg: f.avatarBgColour };
}

/** The friends screen's list, in the page's own shape, or null when it can't
 *  be had. */
async function friendsOnScreen(): Promise<ScreenFriend[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    return (await getFriends()).map(screenFriend);
  } catch {
    return null;
  }
}

/** The friends screen's list. Empty when it can't be had: the page then shows
 *  its "No friends here yet!" board. */
async function friendsForScreen(): Promise<ScreenFriend[]> {
  return (await friendsOnScreen()) ?? [];
}

/** What a child typed in the code box as the code the server takes (OTTER-428),
 *  or null. The page tidies it first; this is the same again for a page that
 *  did not (otter428, OTTER 428), so what is sent is always in the server's shape. */
function joinCodeFrom(raw: unknown): string | null {
  const m = /^([A-Z]{3,7})([0-9]{3})$/.exec(String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
  return m ? `${m[1]}-${m[2]}` : null;
}

type AddFailure = 'not-found' | 'own-code' | 'already-friends' | 'too-many-tries' | 'bad-code' | 'failed';

/** Why a friend was not added, as the reason the page has words for. The
 *  server's own sentences are English for a developer and never shown. Anything
 *  that is not a FriendError, or has a code this does not know, is `failed`. */
function addFailure(err: unknown): AddFailure {
  switch (err instanceof FriendError ? err.code : 'failed') {
    case 'not_found': return 'not-found';
    case 'own_code': return 'own-code';
    case 'already_friends': return 'already-friends';
    case 'too_many_tries': return 'too-many-tries';
    case 'bad_format':
    case 'no_code': return 'bad-code';
    default: return 'failed';
  }
}

export function unmountAuth(): void {
  if (activeListener) {
    window.removeEventListener('message', activeListener);
    activeListener = null;
  }
  pendingPosts = [];
  activeFrameLoaded = false;
  if (activeFrame) {
    activeFrame.remove();
    activeFrame = null;
  }
}
