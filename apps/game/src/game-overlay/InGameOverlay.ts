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
 *
 * One screen at a time. Mounting a screen replaces the one that is up, EXCEPT
 * that the garden tunnel (a puzzle she is part-way through) is never replaced
 * by something she did not ask for: an arrival, a visitor or a badge that comes
 * while it is open waits in a queue and is shown, in order, once she closes it
 * (overlay-queue.ts has the rules; 119A).
 */

import { OverlayQueue, mustWait } from './overlay-queue';

export type InGamePage =
  | 'paths' | 'adopters' | 'adoption' | 'adoption-office' | 'rewilding'
  | 'conflict' | 'visitor' | 'vet'
  | 'arrival' | 'badge' | 'map' | 'drive'
  | 'tunnel' | 'charm-select';

export type InGameAction =
  | 'close'
  | 'aspire-rehome'
  | 'aspire-rewild'
  | 'aspire-place'
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
  | 'drive-skipped'
  | 'tunnel-complete'
  | 'tunnel-cancel'
  | 'tunnel-override-reroll'
  | 'charm-equipped'
  | 'back-to-cockpit';

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
  tunnel:            '/admin/tunnel.html?embed=1',
  'charm-select':    '/admin/charm-select.html?embed=1',
};

/** Valid postMessage source names we'll forward. */
const VALID_SOURCES = new Set([
  'arc-game', 'arc-auth', 'arc-adopters', 'arc-adoption', 'arc-adoption-office',
  'arc-rewild', 'arc-visitor', 'arc-vet',
  'arc-arrival', 'arc-badge', 'arc-map', 'arc-drive', 'arc-tunnel',
  'arc-charm-select',
]);

let activeFrame: HTMLIFrameElement | null = null;
let activeListener: ((e: MessageEvent) => void) | null = null;
let activeHostSource: string = 'arc-game-host';
let activePage: InGamePage | null = null;
/** True while the screen up was itself taken off the waiting list. */
let activeFromQueue = false;

/** Everything a mount needs, kept as it was asked for while it waits. */
interface MountRequest {
  page: InGamePage;
  handlers: InGameOverlayHandlers;
  initPayload?: Record<string, unknown>;
  options?: MountInGameOptions;
  /** Called with the request's close handle when its turn comes. */
  shown?: (close: () => void) => void;
}

/** Screens that asked for the screen while the tunnel (or an earlier waiter) held it. */
const waiting = new OverlayQueue<MountRequest>();

function postToFrame(type: string, payload?: unknown, hostSource?: string): void {
  if (!activeFrame?.contentWindow) return;
  activeFrame.contentWindow.postMessage(
    { source: hostSource ?? activeHostSource, type, payload },
    '*',
  );
}

/**
 * Say something to the page that is mounted now, after the first `init`.
 * The tunnel uses it to tell the page what a win or a re-dig earned, so
 * the page can say so in plain words (a toast drawn on the game canvas is
 * hidden behind the iframe while the page is up). A no-op when nothing is
 * mounted.
 */
export function postToInGame(type: string, payload?: unknown): void {
  postToFrame(type, payload);
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

/**
 * Show a screen. Returns the handle that closes it: call it from the screen's
 * own handler when it is done. If the tunnel is up (or other screens are
 * already waiting) the screen waits its turn and the handle, until then,
 * withdraws it.
 */
export function mountInGame(
  page: InGamePage,
  handlers: InGameOverlayHandlers,
  initPayload?: Record<string, unknown>,
  options?: MountInGameOptions,
): () => void {
  reapRemovedScreen();
  if (mustWait({ active: activePage, page, queued: waiting.length, chained: activeFromQueue })) {
    let close: (() => void) | undefined;
    const held = waiting.push(page, { page, handlers, initPayload, options, shown: (c) => { close = c; } });
    return () => { if (close) close(); else waiting.remove(held.id); };
  }
  return show({ page, handlers, initPayload, options }, false);
}

/** Put a screen up now, replacing whatever is showing. */
function show(request: MountRequest, fromQueue: boolean): () => void {
  const { page, handlers, initPayload, options } = request;
  closeActive();

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
  activePage = page;
  activeFromQueue = fromQueue;
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

  // Closing this screen shows the next one that was waiting for it. A handle
  // that outlives its screen (it was replaced) does nothing.
  return () => {
    if (activeFrame !== frame) return;
    closeActive();
    showNextWaiting();
  };
}

/**
 * A screen taken out of the page by anything but its own handle (a test
 * harness, a devtools session) would otherwise leave the bridge believing it
 * is still up, and everything behind it waiting for ever. If the one we think
 * is up has gone, treat it as closed and let the next waiting take its turn.
 */
function reapRemovedScreen(): void {
  if (!activeFrame || activeFrame.isConnected) return;
  closeActive();
  showNextWaiting();
}

/** Take the screen down, leaving whatever is waiting where it is. */
function closeActive(): void {
  if (activeListener) {
    window.removeEventListener('message', activeListener);
    activeListener = null;
  }
  if (activeFrame) {
    activeFrame.remove();
    activeFrame = null;
  }
  activeHostSource = 'arc-game-host';
  activePage = null;
  activeFromQueue = false;
}

/** The screen that has waited longest, if any, takes its turn. */
function showNextWaiting(): void {
  const next = waiting.shift();
  if (!next) return;
  const close = show(next.request, true);
  next.request.shown?.(close);
}

/**
 * Take down whatever is showing and forget everything waiting: the scene that
 * asked for them has shut down, and the closures they carry belong to it.
 * (Closing one screen from its own handler goes through the handle
 * `mountInGame` returned, which also shows the next waiting.)
 */
export function unmountInGame(): void {
  closeActive();
  waiting.clear();
}

/** The pages waiting for the tunnel (or an earlier arrival) to be closed, in the order they will appear. */
export function waitingInGame(): string[] {
  return waiting.pages();
}
