/**
 * The waiting list for in-game overlays (119A).
 *
 * Only one in-game screen can be up at a time (InGameOverlay mounts a single
 * full-viewport iframe), and mounting a second used to remove the first. That
 * is fine for a plaque the child can read again, and ruinous for a puzzle she
 * is part-way through: an animal arriving (arrival.html), a visitor or a badge
 * mounted over the garden tunnel and took it away, so she lost the board with
 * no win.
 *
 * So while a HOLDING page is up, anything else that wants the screen waits its
 * turn here, and is shown, in the order it asked, once the holding page closes
 * (the child pressing Done or Close). Nothing is dropped.
 *
 * This file is the rules and the list, with no DOM, so they can be tested on
 * their own; InGameOverlay.ts is what puts an iframe up.
 */

/** Pages that must not be replaced by an overlay the child did not ask for. */
export const HOLDING_PAGES: ReadonlySet<string> = new Set(['tunnel']);

/** One request to show a screen, kept until its turn. */
export interface Held<T> {
  /** Unique for the life of the queue; how a waiting request is withdrawn. */
  id: number;
  page: string;
  request: T;
}

/** First in, first out, with the ability to withdraw one that is still waiting. */
export class OverlayQueue<T> {
  private items: Array<Held<T>> = [];
  private next = 1;

  /** Add a request at the back. */
  push(page: string, request: T): Held<T> {
    const held = { id: this.next++, page, request };
    this.items.push(held);
    return held;
  }

  /** Take the request that has waited longest, if any. */
  shift(): Held<T> | undefined {
    return this.items.shift();
  }

  /** Withdraw a waiting request; false if it was not waiting (already shown, or never queued). */
  remove(id: number): boolean {
    const at = this.items.findIndex((h) => h.id === id);
    if (at < 0) return false;
    this.items.splice(at, 1);
    return true;
  }

  /** Forget everything waiting (the scene they belonged to has gone). */
  clear(): void {
    this.items = [];
  }

  get length(): number {
    return this.items.length;
  }

  /** The pages waiting, in order. */
  pages(): string[] {
    return this.items.map((h) => h.page);
  }
}

export interface WaitContext {
  /** The page showing now, or null when none is. */
  active: string | null;
  /** The page that wants the screen. */
  page: string;
  /** How many requests are already waiting. */
  queued: number;
  /** True while the page showing now was itself taken off the waiting list. */
  chained: boolean;
}

/**
 * Must this page wait rather than take the screen now?
 *
 *   - A holding page (the tunnel) never waits: it is the thing being protected.
 *   - Anything else waits while a holding page is up.
 *   - It also waits behind requests already waiting, and behind a screen that
 *     was itself shown from the list, so a run of arrivals is shown in order
 *     and not on top of each other.
 */
export function mustWait(ctx: WaitContext): boolean {
  if (HOLDING_PAGES.has(ctx.page)) return false;
  return (ctx.active !== null && HOLDING_PAGES.has(ctx.active)) || ctx.queued > 0 || ctx.chained;
}
