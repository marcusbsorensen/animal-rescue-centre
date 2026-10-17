import type { GameStateStore } from './GameStateStore';

/**
 * Gift counts, as the server reports them.
 *
 * `giver`, `generous` and `receiver` read how many gifts a child has sent and
 * how many they have claimed. The server already keeps both (`rescue_stats`,
 * incremented by `send-gift` and `claim-gift`), so the client does not count:
 * a tally here would drift from the server's the first time a send was
 * retried or a claim answered twice. It is told the number and holds it.
 *
 * Three replies carry it - `load-game` for both, `send-gift` for the sent
 * count and `claim-gift` for the claimed count - and any of them may omit
 * it: an older deployment of the function, a missing `rescue_stats` row. A
 * missing or odd value leaves what the store holds alone.
 */
export interface GiftCounts {
  giftsSentCount?: unknown;
  giftsReceivedCount?: unknown;
}

/**
 * Take the counts a reply carries. A count only ever goes up on the server,
 * so a lower one is a reply that arrived late and is ignored.
 */
export function recordGiftCounts(
  store: Pick<GameStateStore, 'giftsSentCount' | 'giftsReceivedCount'>,
  counts: GiftCounts | null | undefined,
): void {
  if (!counts || typeof counts !== 'object') return;
  store.giftsSentCount = higher(store.giftsSentCount, counts.giftsSentCount);
  store.giftsReceivedCount = higher(store.giftsReceivedCount, counts.giftsReceivedCount);
}

function higher(current: number, incoming: unknown): number {
  if (typeof incoming !== 'number' || !Number.isFinite(incoming)) return current;
  return Math.max(current, Math.max(0, Math.floor(incoming)));
}
