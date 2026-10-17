/**
 * get-friends — the signed-in player's friends, as the friends screen
 * shows them.
 *
 * The game used to read `friendships` with the public key, under rules
 * keyed on `auth.uid()`, which ARC's own sessions never set: the list came
 * back empty for everyone (.claude/TRAPS.md). This reads it with the
 * service role, for the account the session (`x-arc-session`) belongs to.
 * A user id in the body is never read.
 *
 * Each friend is what another player may see (00016): the id the screen
 * needs to remove them, the display name from the word lists and the
 * avatar. Never the name they typed, which is their login.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireSession } from '../_shared/session.ts';

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

    const { data, error } = await supabase
      .from('friendships')
      .select('created_at, friend:users!friendships_friend_id_fkey (id, display_name, avatar_emoji, avatar_bg_colour)')
      .eq('user_id', session.userId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('get-friends read failed', error);
      return jsonResponse({ error: 'Could not load friends', code: 'failed' }, 500);
    }

    const rows = (data ?? []) as Array<{ friend?: Record<string, unknown> | null }>;
    const friends = rows
      .map((row) => row.friend)
      .filter((f): f is Record<string, unknown> => !!f && typeof f.id === 'string')
      .map((f) => ({
        id: f.id,
        displayName: f.display_name,
        avatarEmoji: f.avatar_emoji,
        avatarBgColour: f.avatar_bg_colour,
      }));

    return jsonResponse({ friends });
  } catch (err) {
    console.error('get-friends error:', err);
    return jsonResponse({ error: 'Internal server error', code: 'failed' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
