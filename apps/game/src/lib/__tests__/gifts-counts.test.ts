import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../supabase', () => ({
  supabase: { functions: { invoke: vi.fn() }, from: vi.fn() },
  isSupabaseConfigured: () => true,
}));

const { supabase } = await import('../supabase');
const { sendGift, claimGift } = await import('../gifts');
const { recordGiftCounts } = await import('../../game-state/gift-counts');
const { GameStateStore } = await import('../../game-state/GameStateStore');

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

/**
 * The gift badges (`giver`, `generous`, `receiver`) read counts the server
 * keeps. `send-gift` and `claim-gift` now say what the count became, and
 * these pin that the client passes it on: to the caller, and from there to
 * the store the badge check reads. A server that has not been redeployed
 * says nothing, and that must still be a successful send.
 */

describe('gift replies carry the server\'s count', () => {
  beforeEach(() => {
    localStorage.setItem('arc_session', JSON.stringify({
      userId: 'u-1', username: 'BrambleFox', avatarEmoji: '🦊',
      avatarBgColour: '#fff', joinCode: 'FOX-428', token: 'a'.repeat(64),
    }));
    invoke.mockReset();
  });

  it('sendGift resolves with the sent count', async () => {
    invoke.mockResolvedValueOnce({ data: { gift: { id: 'g1' }, giftsSentCount: 5 }, error: null });
    await expect(sendGift('u-2', 'toy', 'hello')).resolves.toEqual({ giftsSentCount: 5 });
  });

  it('sendGift still succeeds against a server that sends no count', async () => {
    invoke.mockResolvedValueOnce({ data: { gift: { id: 'g1' } }, error: null });
    await expect(sendGift('u-2', 'toy', 'hello')).resolves.toEqual({});
  });

  it('sendGift still throws the server\'s own reason when it refuses', async () => {
    invoke.mockResolvedValueOnce({ data: { error: 'Try again in 3 minutes.' }, error: null });
    await expect(sendGift('u-2', 'toy', 'hello')).rejects.toThrow('Try again in 3 minutes.');
  });

  it('claimGift resolves with the claimed count beside the gift', async () => {
    invoke.mockResolvedValueOnce({
      data: { gift: { id: 'g1', giftType: 'toy' }, giftsReceivedCount: 10 },
      error: null,
    });
    await expect(claimGift('g1')).resolves.toEqual({ giftType: 'toy', giftsReceivedCount: 10 });
  });

  it('claimGift still succeeds against a server that sends no count', async () => {
    invoke.mockResolvedValueOnce({ data: { gift: { id: 'g1', giftType: 'toy' } }, error: null });
    await expect(claimGift('g1')).resolves.toEqual({ giftType: 'toy' });
  });

  it('a send, then a claim, reach the store the badge check reads', async () => {
    const store = new GameStateStore();

    invoke.mockResolvedValueOnce({ data: { gift: { id: 'g1' }, giftsSentCount: 5 }, error: null });
    recordGiftCounts(store, await sendGift('u-2', 'toy', 'hello'));
    expect(store.giftsSentCount).toBe(5);
    expect(store.giftsReceivedCount).toBe(0);

    invoke.mockResolvedValueOnce({
      data: { gift: { id: 'g2', giftType: 'toy' }, giftsReceivedCount: 1 },
      error: null,
    });
    recordGiftCounts(store, await claimGift('g2'));
    expect(store.giftsSentCount).toBe(5);
    expect(store.giftsReceivedCount).toBe(1);
  });
});
