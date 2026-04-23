/**
 * AuthOverlay — mounts the HTML/CSS welcome / login / signup mockups as a
 * full-viewport iframe over the Phaser canvas. The mockup pages receive
 * `?embed=1`, strip their design-review chrome, and postMessage primary
 * actions back up to us. Unmount removes the iframe.
 *
 * This lets the game ship the pixel-perfect welcome design Marcus approved
 * without porting hundreds of lines of CSS into Phaser Graphics calls.
 */

export type AuthAction =
  | 'play'
  | 'login'
  | 'signup'
  | 'back-to-welcome';

export interface AuthOverlayHandlers {
  onAction: (action: AuthAction) => void;
}

export type AuthPage = 'welcome' | 'login' | 'signup';

const PAGE_URLS: Record<AuthPage, string> = {
  welcome: '/admin/mockup-welcome.html?embed=1',
  login:   '/admin/mockup-login.html?embed=1',
  signup:  '/admin/mockup-signup.html?embed=1',
};

let activeFrame: HTMLIFrameElement | null = null;
let activeListener: ((e: MessageEvent) => void) | null = null;

/** Mount the chosen auth page as a full-viewport iframe. */
export function mountAuth(page: AuthPage, handlers: AuthOverlayHandlers): () => void {
  unmountAuth(); // only one active overlay at a time

  const frame = document.createElement('iframe');
  frame.src = PAGE_URLS[page];
  frame.style.cssText = [
    'position: fixed',
    'inset: 0',
    'width: 100%',
    'height: 100%',
    'border: 0',
    'z-index: 9999',
    'background: #fef9ef',
  ].join(';');
  frame.setAttribute('aria-label', `A.R.C. ${page} screen`);
  document.body.appendChild(frame);
  activeFrame = frame;

  activeListener = (e: MessageEvent) => {
    if (frame.contentWindow && e.source !== frame.contentWindow) return;
    const msg = e.data;
    if (!msg || msg.source !== 'arc-auth' || typeof msg.type !== 'string') return;
    handlers.onAction(msg.type as AuthAction);
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
