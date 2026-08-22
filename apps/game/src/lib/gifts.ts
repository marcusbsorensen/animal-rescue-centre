import { supabase, isSupabaseConfigured } from './supabase';
import { getSession, sessionHeaders } from './auth';

export interface GiftInbox {
  id: string;
  fromUsername: string;
  fromAvatarEmoji: string;
  giftType: string;
  messagePresetCode: string;
  sentAt: string;
}

export interface ShowcaseData {
  username: string;
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
 * Send a gift to a friend.
 */
export async function sendGift(
  toUserId: string,
  giftType: string,
  messagePresetCode: string
): Promise<void> {
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
}

/**
 * Get unclaimed gifts for the current user.
 */
export async function getGiftInbox(): Promise<GiftInbox[]> {
  const session = getSession();
  if (!session || !isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from('gifts')
    .select(`
      id,
      gift_type,
      message_preset_code,
      sent_at,
      sender:users!gifts_from_user_fkey (
        username, avatar_emoji
      )
    `)
    .eq('to_user', session.userId)
    .is('claimed_at', null)
    .order('sent_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sender = (row as any).sender as Record<string, string> | null;
    return {
      id: row.id,
      fromUsername: sender?.username ?? 'Unknown',
      fromAvatarEmoji: sender?.avatar_emoji ?? '🐾',
      giftType: row.gift_type,
      messagePresetCode: row.message_preset_code,
      sentAt: row.sent_at,
    };
  });
}

/**
 * Claim a gift from the inbox.
 */
export async function claimGift(giftId: string): Promise<{ giftType: string }> {
  const session = getSession();
  if (!session || !isSupabaseConfigured()) throw new Error('Not available');

  const { data, error } = await supabase.functions.invoke('claim-gift', {
    body: { giftId },
    headers: sessionHeaders(),
  });

  if (error) throw new Error(error.message ?? 'Failed to claim gift');
  if (data?.error) throw new Error(data.error);

  return { giftType: data.gift.giftType };
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
 */
export async function getFriendLeaderboard(): Promise<
  Array<{ username: string; avatarEmoji: string; totalRescued: number; level: number }>
> {
  const session = getSession();
  if (!session || !isSupabaseConfigured()) return [];

  // Get friend IDs
  const { data: friendships } = await supabase
    .from('friendships')
    .select('friend_id')
    .eq('user_id', session.userId);

  if (!friendships || friendships.length === 0) return [];

  const friendIds = friendships.map((f) => f.friend_id);
  // Include self
  friendIds.push(session.userId);

  // Get rescue stats + user info for friends
  const { data: stats } = await supabase
    .from('rescue_stats')
    .select(`
      total_rescued,
      user:users!rescue_stats_user_id_fkey (
        username, avatar_emoji
      )
    `)
    .in('user_id', friendIds)
    .order('total_rescued', { ascending: false })
    .limit(20);

  if (!stats) return [];

  // Get levels from game_states
  const { data: levels } = await supabase
    .from('game_states')
    .select('user_id, level')
    .in('user_id', friendIds);

  const levelMap = new Map((levels ?? []).map((l) => [l.user_id, l.level]));

  return stats.map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = (row as any).user as Record<string, string> | null;
    return {
      username: user?.username ?? 'Unknown',
      avatarEmoji: user?.avatar_emoji ?? '🐾',
      totalRescued: row.total_rescued ?? 0,
      level: levelMap.get((row as Record<string, unknown>).user_id as string) ?? 1,
    };
  });
}
