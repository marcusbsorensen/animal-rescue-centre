/**
 * remove-friend — end a friendship, for both players (146A).
 *
 * The friends screen asks "Remove MossyOtter from your friends?", and on
 * "Remove" sends the friend's id here. There is no report button in the
 * game: a grown-up reports anything worrying through the support page.
 *
 *   - The session (`x-arc-session`) says whose friendship it is. A user id
 *     in the body is never read, so a player can only end their own
 *     friendships: one side of the pair is always the caller.
 *   - The ending itself is one SQL function, `remove_friend`
 *     (migrations/00020_remove_friend.sql): both rows of the friendship,
 *     and the gifts between the two that nobody has claimed yet, in one
 *     transaction.
 *   - Asking again, or for someone who is not a friend, removes nothing
 *     and still answers `removed: true`: either way they are not friends
 *     now, which is what the screen shows.
 *   - The two can become friends again by swapping codes (add-friend).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { requireSession } from '../_shared/session.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const session = await requireSession(req, supabase);
    if (!session) {
      return jsonResponse({ error: 'Not authenticated', code: 'signed_out' }, 401);
    }
    const userId = session.userId;

    const { friendId } = await req.json();
    if (typeof friendId !== 'string' || !UUID.test(friendId) || friendId === userId) {
      return jsonResponse({ error: 'Friend required', code: 'bad_friend' }, 400);
    }

    // 30 per account per 15 minutes: far more than a child with a full
    // friends list needs, and keyed by the user id, so delete_account
    // clears it with the account.
    const rl = await checkRateLimit(supabase, `remove-friend:${userId}`, 30, 15 * 60 * 1000);
    if (!rl.allowed) {
      return jsonResponse(
        { error: 'Too many tries', code: 'too_many_tries', retryAfterMs: rl.retryAfterMs },
        429,
      );
    }

    const { data: removed, error } = await supabase.rpc('remove_friend', {
      p_user_id: userId,
      p_friend_id: friendId,
    });
    if (error) {
      console.error('remove_friend failed; nothing was removed', error);
      return jsonResponse({ error: 'Could not remove the friend', code: 'failed' }, 500);
    }

    // Counts only: no name, no id.
    console.log('friend removed', removed);
    return jsonResponse({ removed: true });
  } catch (err) {
    console.error('remove-friend error:', err);
    return jsonResponse({ error: 'Internal server error', code: 'failed' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
