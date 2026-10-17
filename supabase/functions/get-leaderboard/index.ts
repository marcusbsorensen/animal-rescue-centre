/**
 * get-leaderboard — the player and their friends ranked by animals rescued,
 * as the Village Hall board shows them.
 *
 * Three reads that the public key could never satisfy: `friendships`,
 * `rescue_stats` and `game_states` all carry rules keyed on `auth.uid()`,
 * which ARC's own sessions never set, so the board came back empty for
 * everyone and the client returned `[]` without saying why. Same trap, same
 * fix, as get-friends and get-gifts (.claude/TRAPS.md).
 *
 * Read with the service role, for the account the session (`x-arc-session`)
 * belongs to. A user id in the body is never read.
 *
 * The player is on their own board, so the list is their friends plus
 * themselves. Of each, only what another player may see (00016): the display
 * name from the word lists and the avatar, never the name they typed. The
 * rescue total and the level are the board's whole point, and a friend is
 * someone this player has already added by code.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireSession } from '../_shared/session.ts';

/** The board shows a handful of friends, not a league table. */
const MAX_ROWS = 20;

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

    const { data: friendships, error: friendsError } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', session.userId);
    if (friendsError) {
      console.error('get-leaderboard friendships read failed', friendsError);
      return jsonResponse({ error: 'Could not load the board', code: 'failed' }, 500);
    }

    // A player with no friends still sees themselves, which is the board
    // telling them what it is for rather than showing them nothing.
    const ids = [
      ...(friendships ?? []).map((f: { friend_id: string }) => f.friend_id),
      session.userId,
    ];

    const { data: stats, error: statsError } = await supabase
      .from('rescue_stats')
      .select(
        'user_id, total_rescued, ' +
        'user:users!rescue_stats_user_id_fkey (display_name, avatar_emoji)',
      )
      .in('user_id', ids)
      .order('total_rescued', { ascending: false })
      .limit(MAX_ROWS);
    if (statsError) {
      console.error('get-leaderboard stats read failed', statsError);
      return jsonResponse({ error: 'Could not load the board', code: 'failed' }, 500);
    }

    const { data: levels, error: levelsError } = await supabase
      .from('game_states')
      .select('user_id, level')
      .in('user_id', ids);
    if (levelsError) {
      console.error('get-leaderboard levels read failed', levelsError);
      return jsonResponse({ error: 'Could not load the board', code: 'failed' }, 500);
    }

    const levelFor = new Map(
      (levels ?? []).map((l: { user_id: string; level: number }) => [l.user_id, l.level]),
    );

    const rows = (stats ?? []) as Array<Record<string, unknown>>;
    const board = rows.map((row) => {
      const user = row.user as Record<string, string> | null;
      return {
        displayName: user?.display_name ?? 'Unknown',
        avatarEmoji: user?.avatar_emoji ?? '🐾',
        totalRescued: (row.total_rescued as number) ?? 0,
        level: levelFor.get(row.user_id as string) ?? 1,
      };
    });

    return jsonResponse({ board });
  } catch (err) {
    console.error('get-leaderboard error:', err);
    return jsonResponse({ error: 'Internal server error', code: 'failed' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
