import { supabase } from './supabase';
import { getSession, sessionHeaders } from './auth';

/** Another player as this one sees them. `displayName` is the name from
 *  the word lists (MossyOtter); the name they typed is their login and
 *  is never sent to anyone else. */
export interface Friend {
  id: string;
  displayName: string;
  avatarEmoji: string;
  avatarBgColour: string;
}

/**
 * Why a friend could not be added, in a word the screen can switch on.
 *
 * supabase-js turns any non-2xx into one generic "Edge Function returned a
 * non-2xx status code" and leaves the real body in `error.context`. Without
 * reading it, "that code is not ours", "that's your own code" and "you have
 * tried too many times" all reach a child as the same sentence, and the
 * sentence is about edge functions.
 */
export class FriendError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'FriendError';
  }
}

/** The JSON body behind a supabase-js function error, when there is one. */
async function refusal(error: unknown): Promise<Record<string, unknown>> {
  const context = (error as { context?: { json?: () => Promise<unknown> } })?.context;
  if (!context || typeof context.json !== 'function') return {};
  try {
    const body = await context.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    // A refusal with no JSON body (a gateway error, say) is still a refusal.
    return {};
  }
}

/**
 * Add a friend by their join code (e.g., "FOX-428").
 * Creates a mutual friendship via Edge Function.
 *
 * Throws a {@link FriendError} whose `code` names the reason, so the screen
 * can say it in its own words rather than showing the server's English.
 */
export async function addFriendByCode(joinCode: string): Promise<Friend> {
  const session = getSession();
  if (!session) throw new FriendError('Not logged in', 'signed_out');

  // The function derives the caller from x-arc-session; it no longer
  // accepts a userId in the body. Overriding Authorization with our own
  // non-JWT token would also trip the platform's verify_jwt.
  const { data, error } = await supabase.functions.invoke('add-friend', {
    body: { joinCode },
    headers: sessionHeaders(),
  });

  if (error) {
    const body = await refusal(error);
    throw new FriendError(
      typeof body.error === 'string' ? body.error : (error.message ?? 'Failed to add friend'),
      typeof body.code === 'string' ? body.code : 'failed',
      typeof body.retryAfterMs === 'number' ? body.retryAfterMs : undefined,
    );
  }
  if (data?.error) {
    throw new FriendError(
      data.error,
      typeof data.code === 'string' ? data.code : 'failed',
      typeof data.retryAfterMs === 'number' ? data.retryAfterMs : undefined,
    );
  }

  return data.friend;
}

/**
 * Remove a friend, for both players (146A). The function takes the caller
 * from the session, ends both rows of the friendship and deletes the gifts
 * between the two that nobody has claimed. Asking again is harmless.
 *
 * This used to delete the two rows itself, with the public key. The rules
 * on `friendships` key on `auth.uid()`, which ARC's own sessions never
 * set, so it deleted nothing and reported no error.
 */
export async function removeFriend(friendId: string): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  const { data, error } = await supabase.functions.invoke('remove-friend', {
    body: { friendId },
    headers: sessionHeaders(),
  });

  if (error) throw new Error(error.message ?? 'Failed to remove friend');
  if (data?.error) throw new Error(data.error);
  if (data?.removed !== true) throw new Error('Failed to remove friend');
}

/**
 * Get all friends for the current user, from the get-friends function.
 *
 * This used to read `friendships` with the public key, under the same
 * `auth.uid()` rules, so it always came back empty (.claude/TRAPS.md).
 */
export async function getFriends(): Promise<Friend[]> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  const { data, error } = await supabase.functions.invoke('get-friends', {
    body: {},
    headers: sessionHeaders(),
  });

  if (error || data?.error || !Array.isArray(data?.friends)) {
    throw new Error('Failed to fetch friends');
  }

  return (data.friends as Array<Record<string, unknown>>)
    .filter((f) => typeof f.id === 'string')
    .map((f) => ({
      id: f.id as string,
      displayName: typeof f.displayName === 'string' ? f.displayName : '',
      avatarEmoji: typeof f.avatarEmoji === 'string' ? f.avatarEmoji : '🐾',
      avatarBgColour: typeof f.avatarBgColour === 'string' ? f.avatarBgColour : '#ffd0a0',
    }));
}

/**
 * Get the current user's join code.
 */
export async function getMyJoinCode(): Promise<string> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');
  return session.joinCode;
}
