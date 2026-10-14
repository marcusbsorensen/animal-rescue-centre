import { describe, it, expect, afterEach, vi } from 'vitest';
import { mountInGame, unmountInGame, waitingInGame, type InGameAction } from '../InGameOverlay';

/**
 * The overlay bridge with a real DOM (jsdom): what is on the screen, and in
 * what order, when an arrival or a badge or a visitor comes while the garden
 * tunnel is open (119A).
 */

const frames = () => [...document.querySelectorAll('iframe')] as HTMLIFrameElement[];
const pagesUp = () => frames().map((f) => f.getAttribute('aria-label'));
const noop = { onAction: () => {} };

afterEach(() => { unmountInGame(); document.body.innerHTML = ''; });

describe('the tunnel is never replaced by something she did not ask for', () => {
  it('mounts an arrival over nothing straight away, as it always did', () => {
    mountInGame('arrival', noop);
    expect(pagesUp()).toEqual(['A.R.C. arrival']);
    expect(waitingInGame()).toEqual([]);
  });

  it('keeps the tunnel up when an arrival comes, and holds the arrival', () => {
    mountInGame('tunnel', noop);
    mountInGame('arrival', noop, { animalName: 'Rusty' });
    expect(pagesUp()).toEqual(['A.R.C. tunnel']);
    expect(waitingInGame()).toEqual(['arrival']);
  });

  it('shows the held arrival when the tunnel is closed (Done or Close), and nothing is left waiting', () => {
    const closeTunnel = mountInGame('tunnel', noop);
    mountInGame('arrival', noop, { animalName: 'Rusty' });
    closeTunnel();
    expect(pagesUp()).toEqual(['A.R.C. arrival']);
    expect(waitingInGame()).toEqual([]);
  });

  it('holds several, and shows them one at a time, in the order they came', () => {
    const closeTunnel = mountInGame('tunnel', noop);
    const closeA = mountInGame('arrival', noop, { animalName: 'Rusty' });
    const closeB = mountInGame('badge', noop, { badgeCode: 'x' });
    const closeC = mountInGame('visitor', noop, { visitId: 'v1' });
    expect(waitingInGame()).toEqual(['arrival', 'badge', 'visitor']);

    closeTunnel();
    expect(pagesUp()).toEqual(['A.R.C. arrival']);
    expect(waitingInGame()).toEqual(['badge', 'visitor']);

    closeA();
    expect(pagesUp()).toEqual(['A.R.C. badge']);
    closeB();
    expect(pagesUp()).toEqual(['A.R.C. visitor']);
    closeC();
    expect(pagesUp()).toEqual([]);
    expect(waitingInGame()).toEqual([]);
  });

  it('keeps a run in order when another comes while the first of them is on screen', () => {
    const closeTunnel = mountInGame('tunnel', noop);
    const closeA = mountInGame('arrival', noop);
    mountInGame('badge', noop);
    closeTunnel();                       // arrival is up, badge waiting
    mountInGame('visitor', noop);        // comes now: must not displace the arrival
    expect(pagesUp()).toEqual(['A.R.C. arrival']);
    expect(waitingInGame()).toEqual(['badge', 'visitor']);
    closeA();
    expect(pagesUp()).toEqual(['A.R.C. badge']);
  });

  it('shows a later arrival at once once the queue has been shown and closed', () => {
    const closeTunnel = mountInGame('tunnel', noop);
    const closeA = mountInGame('arrival', noop);
    closeTunnel();
    closeA();
    mountInGame('badge', noop);
    expect(pagesUp()).toEqual(['A.R.C. badge']);
    expect(waitingInGame()).toEqual([]);
  });

  it('gives a screen that waited its own handlers and its own init payload when its turn comes', () => {
    const seen: Array<[InGameAction, unknown]> = [];
    const closeTunnel = mountInGame('tunnel', noop);
    mountInGame('arrival', { onAction: (a, p) => seen.push([a, p]) }, { animalName: 'Rusty', species: 'fox' });
    closeTunnel();

    const frame = frames()[0];
    const post = vi.fn();
    Object.defineProperty(frame, 'contentWindow', { value: { postMessage: post }, configurable: true });
    frame.dispatchEvent(new Event('load'));
    expect(post).toHaveBeenCalledWith({ source: 'arc-game-host', type: 'init', payload: { animalName: 'Rusty', species: 'fox' } }, '*');

    window.dispatchEvent(new MessageEvent('message', { data: { source: 'arc-arrival', type: 'welcome-hi', payload: { n: 1 } }, source: frame.contentWindow as Window }));
    expect(seen).toEqual([['welcome-hi', { n: 1 }]]);
  });

  it('closing the tunnel from the tunnel\'s own handler (a message from the page) shows what waited', () => {
    let closeTunnel = () => {};
    closeTunnel = mountInGame('tunnel', { onAction: (a) => { if (a === 'tunnel-cancel') closeTunnel(); } });
    mountInGame('arrival', noop);
    const tunnelFrame = frames()[0];
    Object.defineProperty(tunnelFrame, 'contentWindow', { value: window, configurable: true });
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'arc-tunnel', type: 'tunnel-cancel' }, source: window }));
    expect(pagesUp()).toEqual(['A.R.C. arrival']);
  });

  it('a screen still waiting can be withdrawn by its own handle, and is not shown', () => {
    const closeTunnel = mountInGame('tunnel', noop);
    const withdraw = mountInGame('arrival', noop);
    mountInGame('badge', noop);
    withdraw();
    expect(waitingInGame()).toEqual(['badge']);
    closeTunnel();
    expect(pagesUp()).toEqual(['A.R.C. badge']);
  });

  it('a handle whose screen was replaced does nothing to the one that replaced it', () => {
    const closeBadge = mountInGame('badge', noop);
    mountInGame('arrival', noop);          // plain replacement: the badge is gone
    closeBadge();
    expect(pagesUp()).toEqual(['A.R.C. arrival']);
  });

  it('forgets what is waiting when the scene shuts down (unmountInGame), so nothing stale appears later', () => {
    const closeTunnel = mountInGame('tunnel', noop);
    mountInGame('arrival', noop);
    unmountInGame();
    expect(pagesUp()).toEqual([]);
    expect(waitingInGame()).toEqual([]);
    closeTunnel();                          // late call from a dead scene
    expect(pagesUp()).toEqual([]);
  });

  it('does not hold anything back while a plaque, not the tunnel, is up: a badge replaces an arrival as before', () => {
    mountInGame('arrival', noop);
    mountInGame('badge', noop);
    expect(pagesUp()).toEqual(['A.R.C. badge']);
    expect(waitingInGame()).toEqual([]);
  });

  it('lets the tunnel be mounted again over itself (a fresh board), and still holds the arrival', () => {
    mountInGame('tunnel', noop);
    mountInGame('arrival', noop);
    mountInGame('tunnel', noop);
    expect(pagesUp()).toEqual(['A.R.C. tunnel']);
    expect(waitingInGame()).toEqual(['arrival']);
  });
});
