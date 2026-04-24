/**
 * InGameOverlay — mounts the HTML in-game mockups (paths, adopters,
 * adoption, rewilding) as a full-viewport iframe over the running Phaser
 * scene. Unlike AuthOverlay (which is for scene-switching moments like
 * welcome/login), these are modal over the live game and the scene keeps
 * running underneath.
 *
 * Handshake:
 *   - parent → iframe: {source:'arc-game-host', type:'init', payload:{...}}
 *   - iframe → parent: {source:'arc-game' | 'arc-adopters' | 'arc-adoption' |
 *                       'arc-rewild' | 'arc-auth', type:'...', payload:{...}}
 *
 * All in-game mockups postMessage up when their primary actions fire.
 * This bridge accepts the union of those sources and forwards them to
 * the host scene's onAction handler.
 */

export type InGamePage =
  | 'paths' | 'adopters' | 'adoption' | 'rewilding' | 'conflict' | 'visitor' | 'vet'
  | 'arrival' | 'badge';

export type InGameAction =
  | 'close'
  | 'aspire-rehome'
  | 'aspire-rewild'
  | 'aspire-stay'
  | 'back-to-menu'
  | 'meet-adopter'
  | 'adoption-confirm'
  | 'adoption-cancel'
  | 'rewild-confirm'
  | 'rewild-cancel'
  | 'give-space'
  | 'split-toy'
  | 'treat'
  | 'visitor-seen'
  | 'treatment-rest'
  | 'treatment-vet'
  | 'treatment-home'
  | 'welcome-space'
  | 'welcome-hi'
  | 'welcome-treat'
  | 'badge-seen';

export interface InGameOverlayHandlers {
  onAction: (action: InGameAction, payload?: Record<string, unknown>) => void;
}

const PAGE_URLS: Record<InGamePage, string> = {
  paths:     '/admin/mockup-paths.html?embed=1',
  adopters:  '/admin/mockup-adopters.html?embed=1',
  adoption:  '/admin/mockup-adoption.html?embed=1',
  rewilding: '/admin/mockup-rewilding.html?embed=1',
  conflict:  '/admin/mockup-conflict.html?embed=1',
  visitor:   '/admin/mockup-visitor.html?embed=1',
  vet:       '/admin/mockup-vet.html?embed=1',
  arrival:   '/admin/mockup-arrival.html?embed=1',
  badge:     '/admin/mockup-badge.html?embed=1',
};

/** Valid postMessage source names we'll forward. */
const VALID_SOURCES = new Set([
  'arc-game', 'arc-auth', 'arc-adopters', 'arc-adoption', 'arc-rewild', 'arc-visitor', 'arc-vet',
  'arc-arrival', 'arc-badge',
]);

let activeFrame: HTMLIFrameElement | null = null;
let activeListener: ((e: MessageEvent) => void) | null = null;

function postToFrame(type: string, payload?: unknown): void {
  if (!activeFrame?.contentWindow) return;
  activeFrame.contentWindow.postMessage({ source: 'arc-game-host', type, payload }, '*');
}

export function mountInGame(
  page: InGamePage,
  handlers: InGameOverlayHandlers,
  initPayload?: Record<string, unknown>,
): () => void {
  unmountInGame();

  const frame = document.createElement('iframe');
  frame.src = PAGE_URLS[page];
  frame.style.cssText = [
    'position: fixed', 'inset: 0',
    'width: 100%', 'height: 100%',
    'border: 0', 'z-index: 9998',     // one below AuthOverlay
  ].join(';');
  frame.setAttribute('aria-label', `A.R.C. ${page}`);
  document.body.appendChild(frame);
  activeFrame = frame;

  frame.addEventListener('load', () => {
    if (initPayload) postToFrame('init', initPayload);
  });

  activeListener = (e: MessageEvent) => {
    if (frame.contentWindow && e.source !== frame.contentWindow) return;
    const msg = e.data;
    if (!msg || typeof msg.type !== 'string' || !VALID_SOURCES.has(msg.source)) return;
    handlers.onAction(msg.type as InGameAction, msg.payload);
  };
  window.addEventListener('message', activeListener);
  return unmountInGame;
}

export function unmountInGame(): void {
  if (activeListener) {
    window.removeEventListener('message', activeListener);
    activeListener = null;
  }
  if (activeFrame) {
    activeFrame.remove();
    activeFrame = null;
  }
}
