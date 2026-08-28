/**
 * load-game — read the caller's saved game.
 *
 * The client used to select from `game_states` directly with the anon key.
 * Every policy in 00002_rls_policies.sql keys on auth.uid(), and the game
 * never establishes a Supabase auth session (login mints its own token, not
 * a JWT) — so auth.uid() was permanently NULL, the select matched no rows,
 * and every child was treated as a brand-new player on every visit.
 *
 * Going through an Edge Function keeps the RLS policies as the backstop
 * they are meant to be: only the service role reaches the table, and the
 * row it reaches is chosen by the verified session, not by the caller.
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
    if (!session) return jsonResponse({ error: 'Not authenticated' }, 401);

    const { data, error } = await supabase
      .from('game_states')
      .select('state, level, version, updated_at')
      .eq('user_id', session.userId)
      .maybeSingle();

    if (error) {
      console.error('load-game query error:', error);
      return jsonResponse({ error: 'Could not load your game' }, 500);
    }

    // No row is the honest answer for a first-time player — the client
    // keeps its defaults. Distinguished from an error so the client does
    // not show a retry overlay to someone who simply has no save yet.
    // The client records "no row" as a null version, which is what makes
    // its first save an insert rather than an overwrite.
    if (!data) {
      return jsonResponse({ save: null });
    }

    return jsonResponse({
      save: {
        state: data.state ?? {},
        level: data.level ?? 1,
        // Echoed back on the next save. Without it the client has nothing
        // to claim it is replacing, and save-game cannot tell a fresh write
        // from one built on a copy another device has already superseded.
        version: data.version,
        updatedAt: data.updated_at,
      },
    });
  } catch (err) {
    console.error('load-game error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
