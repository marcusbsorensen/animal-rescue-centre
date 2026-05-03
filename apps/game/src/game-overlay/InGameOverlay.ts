/**
 * InGameOverlay — mounts the HTML in-game screens (paths, adopters,
 * adoption, rewilding) as a full-viewport iframe over the running Phaser
 * scene. Unlike AuthOverlay (which is for scene-switching moments like
 * welcome/login), these are modal over the live game and the scene keeps
 * running underneath.
 *
 * Handshake:
 *   - parent → iframe: {source:'arc-game-host', type:'init', payload:{...}}
 *     (some pages — e.g. adoption-office — use a dedicated host source name
 *     so they can disambiguate from generic init traffic; see hostSource opt.)
 *   - iframe → parent: {source:'arc-game' | 'arc-adopters' | 'arc-adoption' |
 *                       'arc-adoption-office' | 'arc-rewild' | 'arc-auth',
 *                       type:'...', payload:{...}}
 *
 * All in-game screens postMessage up when their primary actions fire.
 * This bridge accepts the union of those sources and forwards them to
 * the host scene's onAction handler.
 */

export type InGamePage =
  | 'paths' | 'adopters' | 'adoption' | 'adoption-office' | 'rewilding'
  | 'conflict' | 'visitor' | 'vet'
  | 'arrival' | 'badge' | 'map' | 'drive';

export type InGameAction =
  | 'close'
  | 'aspire-rehome'
  | 'aspire-rewild'
  | 'aspire-stay'
  | 'back-to-menu'
  | 'meet-adopter'
  | 'adoption-confirm'
  | 'adoption-cancel'
  | 'adoption-pick'
  | 'adoption-office-cancel'
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
  | 'badge-seen'
  | 'drive-to'
  | 'drive-complete'
  | 'drive-skipped';

export interface InGameOverlayHandlers {
  onAction: (action: InGameAction, payload?: Record<string, unknown>) => void;
}

const PAGE_URLS: Record<InGamePage, string> = {
  paths:             '/admin/paths.html?embed=1',
  adopters:          '/admin/adopters.html?embed=1',
  adoption:          '/admin/adoption.html?embed=1',
  'adoption-office': '/admin/adoption-office.html?embed=1',
  rewilding:         '/admin/rewilding.html?embed=1',
  conflict:          '/admin/conflict.html?embed=1',
  visitor:           '/admin/visitor.html?embed=1',
  vet:               '/admin/vet.html?embed=1',
  arrival:           '/admin/arrival.html?embed=1',
  badge:             '/admin/badge.html?embed=1',
  map:               '/admin/map.html?embed=1',
  drive:             '/admin/drive-overlay.html?embed=1',
};

/** Valid postMessage source names we'll forward. */
const VALID_SOURCES = new Set([
  'arc-game', 'arc-auth', 'arc-adopters', 'arc-adoption', 'arc-adoption-office',
  'arc-rewild', 'arc-visitor', 'arc-vet',
  'arc-arrival', 'arc-badge', 'arc-map', 'arc-drive',
]);

let activeFrame: HTMLIFrameElement | null = null;
let activeListener: ((e: MessageEvent) => void) | null = null;
let activeHostSource: string = 'arc-game-host';

function postToFrame(type: string, payload?: unknown, hostSource?: string): void {
  if (!activeFrame?.contentWindow) return;
  activeFrame.contentWindow.postMessage(
    { source: hostSource ?? activeHostSource, type, payload },
    '*',
  );
}

export interface MountInGameOptions {
  /**
   * Override the postMessage source name used when the host posts to
   * the iframe. Defaults to 'arc-game-host'. Some pages (e.g. the
   * adoption-office) listen for a dedicated source so they can ignore
   * unrelated host traffic.
   */
  hostSource?: string;
  /**
   * Extra messages to post AFTER the primary `init` payload. Used when
   * a page needs a follow-up data payload (e.g. the adoption-office
   * receives `applicants` separately from its `init`).
   */
  extraInits?: Array<{ type: string; payload: unknown }>;
  /**
   * Extra URL query params appended to the iframe `src`. Useful when an
   * iframe (e.g. adoption-office) reads its initial state from query
   * params rather than a postMessage init handshake.
   */
  query?: Record<string, string | undefined>;
}

export function mountInGame(
  page: InGamePage,
  handlers: InGameOverlayHandlers,
  initPayload?: Record<string, unknown>,
  options?: MountInGameOptions,
): () => void {
  unmountInGame();

  let src = PAGE_URLS[page];
  if (options?.query) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== '') usp.set(k, v);
    }
    const extra = usp.toString();
    if (extra) src += (src.includes('?') ? '&' : '?') + extra;
  }

  const frame = document.createElement('iframe');
  frame.src = src;
  frame.style.cssText = [
    'position: fixed', 'inset: 0',
    'width: 100%', 'height: 100%',
    'border: 0', 'z-index: 9998',     // one below AuthOverlay
  ].join(';');
  frame.setAttribute('aria-label', `A.R.C. ${page}`);
  document.body.appendChild(frame);
  activeFrame = frame;
  activeHostSource = options?.hostSource ?? 'arc-game-host';

  frame.addEventListener('load', () => {
    if (initPayload) postToFrame('init', initPayload);
    if (options?.extraInits) {
      for (const m of options.extraInits) postToFrame(m.type, m.payload);
    }
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
  activeHostSource = 'arc-game-host';
}
