import { supabase } from './supabase';
import { getSession } from './auth';

export interface Friend {
  id: string;
  username: string;
  avatarEmoji: string;
  avatarBgColour: string;
}

/**
 * Add a friend by their join code (e.g., "FOX-428").
 * Creates a mutual friendship via Edge Function.
 */
export async function addFriendByCode(joinCode: string): Promise<Friend> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  const { data, error } = await supabase.functions.invoke('add-friend', {
    body: { joinCode },
    headers: { Authorization: `Bearer ${session.token}` },
  });

  if (error) throw new Error(error.message ?? 'Failed to add friend');
  if (data.error) throw new Error(data.error);

  return data.friend;
}

/**
 * Remove a friend (both directions).
 */
export async function removeFriend(friendId: string): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  const { error: err1 } = await supabase
    .from('friendships')
    .delete()
    .eq('user_id', session.userId)
    .eq('friend_id', friendId);

  const { error: err2 } = await supabase
    .from('friendships')
    .delete()
    .eq('user_id', friendId)
    .eq('friend_id', session.userId);

  if (err1 || err2) throw new Error('Failed to remove friend');
}

/**
 * Get all friends for the current user.
 */
export async function getFriends(): Promise<Friend[]> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  const { data, error } = await supabase
    .from('friendships')
    .select(`
      friend:users!friendships_friend_id_fkey (
        id, username, avatar_emoji, avatar_bg_colour
      )
    `)
    .eq('user_id', session.userId);

  if (error) throw new Error('Failed to fetch friends');

  return (data ?? []).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = (row as any).friend as Record<string, string>;
    return {
      id: f.id,
      username: f.username,
      avatarEmoji: f.avatar_emoji,
      avatarBgColour: f.avatar_bg_colour,
    };
  });
}

/**
 * Get the current user's join code.
 */
export async function getMyJoinCode(): Promise<string> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');
  return session.joinCode;
}
