/**
 * AuthOverlay — mounts the HTML welcome/login/signup mockups as a full-
 * viewport iframe over the Phaser canvas. The mockup pages postMessage
 * primary actions (PLAY!, submit, nav) back to us; we bridge into the
 * real auth API (lib/auth.ts) and route the host Phaser scene.
 *
 * Handshake:
 *   - parent → iframe: {type:'init', payload:{usernames:string[]}}  (once loaded)
 *   - iframe → parent: {type:'play'|'login'|'signup'|'back-to-welcome'}
 *   - iframe → parent: {type:'login-submit', payload:{username,pin}}
 *   - iframe → parent: {type:'signup-submit', payload:{username,pin,avatarEmoji,avatarBgColour}}
 *   - parent → iframe: {type:'auth-error', payload:{message}}   (on failure, iframe shakes+clears)
 */

import { login, signup, getRememberedUsernames, type AuthSession } from '../lib/auth';

export type AuthAction =
  | 'play'
  | 'login'
  | 'signup'
  | 'friends'
  | 'logout'
  | 'back-to-menu'
  | 'back-to-welcome'
  | 'recruit-apprentice'
  | 'auth-success-existing'      // login() resolved
  | 'auth-success-new';           // signup() resolved — route to welcome-new

export interface AuthOverlayHandlers {
  onAction: (action: AuthAction, session?: AuthSession, payload?: Record<string, unknown>) => void;
}

export interface MenuStats {
  totalAnimals?: number;
  happyToday?: number;
  needFeeding?: number;
}

export type AuthPage = 'welcome' | 'login' | 'signup' | 'welcome-new' | 'menu' | 'friends';

const PAGE_URLS: Record<AuthPage, string> = {
  welcome:      '/admin/mockup-welcome.html?embed=1',
  login:        '/admin/mockup-login.html?embed=1',
  signup:       '/admin/mockup-signup.html?embed=1',
  'welcome-new': '/admin/mockup-welcome-new.html?embed=1',
  menu:         '/admin/mockup-menu.html?embed=1',
  friends:      '/admin/mockup-friends.html?embed=1',
};

let activeFrame: HTMLIFrameElement | null = null;
let activeListener: ((e: MessageEvent) => void) | null = null;

/** Send a message from parent → iframe (used for init + error feedback). */
function postToFrame(type: string, payload?: unknown): void {
  if (!activeFrame?.contentWindow) return;
  activeFrame.contentWindow.postMessage({ source: 'arc-auth-host', type, payload }, '*');
}

export function mountAuth(
  page: AuthPage,
  handlers: AuthOverlayHandlers,
  context?: { name?: string; session?: AuthSession; stats?: MenuStats; recruited?: string[] },
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

  // After iframe loads, send any per-page init data it needs.
  frame.addEventListener('load', () => {
    if (page === 'login') {
      const usernames = getRememberedUsernames();
      postToFrame('init', { usernames });
    }
    if (page === 'menu' && context?.session) {
      postToFrame('init', { ...context.session, stats: context.stats });
    }
    if (page === 'friends') {
      postToFrame('init', {
        joinCode: context?.session?.joinCode,
        recruited: context?.recruited ?? [],
      });
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
        msg.type === 'back-to-menu') {
      handlers.onAction(msg.type as AuthAction);
      return;
    }
    // Friends-page: recruit-apprentice carries a {id} payload up to
    // the host scene, which calls the game-logic recruit function.
    if (msg.type === 'recruit-apprentice') {
      handlers.onAction('recruit-apprentice', undefined, msg.payload);
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
    if (msg.type === 'signup-submit') {
      try {
        const session = await signup(msg.payload);
        handlers.onAction('auth-success-new', session);
      } catch (err) {
        postToFrame('auth-error', { message: err instanceof Error ? err.message : 'Signup failed' });
      }
      return;
    }
  };
  window.addEventListener('message', activeListener);

  return unmountAuth;
}

export function unmountAuth(): void {
  if (activeListener) {
    window.removeEventListener('message', activeListener);
    activeListener = null;
  }
  if (activeFrame) {
    activeFrame.remove();
    activeFrame = null;
  }
}
