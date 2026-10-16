import { supabase, isSupabaseConfigured } from './supabase';
import { getSession, sessionHeaders } from './auth';

export interface GiftInbox {
  id: string;
  /** The sender's display name from the word lists, never their login. */
  fromDisplayName: string;
  fromAvatarEmoji: string;
  giftType: string;
  messagePresetCode: string;
  sentAt: string;
}

export interface ShowcaseData {
  displayName: string;
  avatarEmoji: string;
  avatarBgColour: string;
  level: number;
  totalRescued: number;
  petCount: number;
  pets: Array<{ name: string; species: string; collarColour?: string }>;
  badges: string[];
  badgeCount: number;
  createdAt: string;
}

/**
 * Send a gift to a friend. Resolves with the sender's gift count as the
 * server now has it, when the server says (`giver` and `generous` read it).
 */
export async function sendGift(
  toUserId: string,
  giftType: string,
  messagePresetCode: string
): Promise<{ giftsSentCount?: number }> {
  const session = getSession();
  if (!session || !isSupabaseConfigured()) throw new Error('Not available');

  // The sender is resolved from the session header — the function no
  // longer accepts a userId in the body, so nobody can send gifts in
  // another child's name.
  const { data, error } = await supabase.functions.invoke('send-gift', {
    body: { toUserId, giftType, messagePresetCode },
    headers: sessionHeaders(),
  });

  if (error) throw new Error(error.message ?? 'Failed to send gift');
  if (data?.error) throw new Error(data.error);

  return typeof data?.giftsSentCount === 'number' ? { giftsSentCount: data.giftsSentCount } : {};
}

/**
 * Get unclaimed gifts for the current user.
 *
 * This used to read `gifts` directly. It could never work: the rule on that
 * table is `to_user = auth.uid()`, and ARC's sessions are its own, so
 * `auth.uid()` is null here and every read came back empty. Sending worked,
 * receiving silently did not, and the gifts looked like they never arrived.
 * The server does the read now, for whoever the session belongs to.
 */
export async function getGiftInbox(): Promise<GiftInbox[]> {
  const session = getSession();
  if (!session || !isSupabaseConfigured()) return [];

  const { data, error } = await supabase.functions.invoke('get-gifts', {
    body: {},
    headers: sessionHeaders(),
  });

  if (error || data?.error || !Array.isArray(data?.gifts)) return [];
  return data.gifts as GiftInbox[];
}

/**
 * Claim a gift from the inbox. Resolves with the recipient's claimed count as
 * the server now has it, when the server says (`receiver` reads it).
 */
export async function claimGift(
  giftId: string,
): Promise<{ giftType: string; giftsReceivedCount?: number }> {
  const session = getSession();
  if (!session || !isSupabaseConfigured()) throw new Error('Not available');

  const { data, error } = await supabase.functions.invoke('claim-gift', {
    body: { giftId },
    headers: sessionHeaders(),
  });

  if (error) throw new Error(error.message ?? 'Failed to claim gift');
  if (data?.error) throw new Error(data.error);

  return {
    giftType: data.gift.giftType,
    ...(typeof data.giftsReceivedCount === 'number' ? { giftsReceivedCount: data.giftsReceivedCount } : {}),
  };
}

/**
 * Create a showcase link to share your centre.
 */
export async function createShowcase(): Promise<{ token: string; expiresAt: string }> {
  const session = getSession();
  if (!session || !isSupabaseConfigured()) throw new Error('Not available');

  const { data, error } = await supabase.functions.invoke('create-showcase', {
    body: {},
    headers: sessionHeaders(),
  });

  if (error) throw new Error(error.message ?? 'Failed to create showcase');
  if (data?.error) throw new Error(data.error);

  return { token: data.token, expiresAt: data.expiresAt };
}

/**
 * Get a showcase by token (public, no auth needed).
 */
export async function getShowcase(token: string): Promise<ShowcaseData | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase.functions.invoke('get-showcase', {
    body: { token },
  });

  if (error || data?.error) return null;
  return data.snapshot as ShowcaseData;
}

/**
 * Get friend leaderboard (top friends by total rescued).
 *
 * Three direct reads — `friendships`, `rescue_stats` and `game_states` —
 * all under rules keyed on `auth.uid()`, which ARC's sessions never set, so
 * the board was empty for everyone. The server does all three now, and a
 * player with no friends sees themselves rather than nothing.
 */
export async function getFriendLeaderboard(): Promise<
  Array<{ displayName: string; avatarEmoji: string; totalRescued: number; level: number }>
> {
  const session = getSession();
  if (!session || !isSupabaseConfigured()) return [];

  const { data, error } = await supabase.functions.invoke('get-leaderboard', {
    body: {},
    headers: sessionHeaders(),
  });

  if (error || data?.error || !Array.isArray(data?.board)) return [];
  return data.board as Array<{
    displayName: string;
    avatarEmoji: string;
    totalRescued: number;
    level: number;
  }>;
}
