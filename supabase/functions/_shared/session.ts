/**
 * Session verification for the authenticated Edge Functions.
 *
 * Before this existed, the authenticated functions read `userId` from the
 * request body and treated its presence as proof of identity — so the
 * public anon key was enough to act as any child. Every function that acts
 * on behalf of a player must now call `requireSession` and use the userId
 * it returns, never one supplied by the caller.
 *
 * The token is the random 32-byte value login/signup mint and store in the
 * `sessions` table. It travels in `x-arc-session` rather than
 * `Authorization`, so the anon-key JWT stays in Authorization where the
 * platform's verify_jwt expects it. A `Bearer` token in Authorization is
 * still accepted as a fallback for older clients.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface Session {
  token: string;
  userId: string;
}

/** Pull the session token off the request, whichever header carries it. */
export function readSessionToken(req: Request): string | null {
  const own = req.headers.get('x-arc-session');
  if (own && own.trim()) return own.trim();

  const auth = req.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    // Ignore JWTs — that is the anon key doing its normal job, not a
    // session. Our tokens are 64 hex characters.
    if (/^[0-9a-f]{64}$/.test(token)) return token;
  }
  return null;
}

/**
 * Resolve the caller's session, or null if there isn't a valid one.
 * Touches `last_used_at` so an active player's session stays warm.
 */
export async function requireSession(
  req: Request,
  supabase: SupabaseClient,
): Promise<Session | null> {
  const token = readSessionToken(req);
  if (!token) return null;

  const { data, error } = await supabase
    .from('sessions')
    .select('token, user_id, expires_at')
    .eq('token', token)
    .single();

  if (error || !data) return null;

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    // Tidy up as we go, so expired rows don't accumulate.
    await supabase.from('sessions').delete().eq('token', token);
    return null;
  }

  await supabase
    .from('sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('token', token);

  return { token, userId: data.user_id };
}

/**
 * Store a freshly minted token for a user, and drop any of that user's
 * sessions that have already expired.
 */
export async function createSession(
  supabase: SupabaseClient,
  userId: string,
  token: string,
): Promise<void> {
  await supabase
    .from('sessions')
    .delete()
    .eq('user_id', userId)
    .lt('expires_at', new Date().toISOString());

  await supabase.from('sessions').insert({ user_id: userId, token });
}
