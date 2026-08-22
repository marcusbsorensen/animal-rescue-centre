/**
 * save-game — write the caller's saved game.
 *
 * Counterpart to load-game. The row written is always the one belonging to
 * the verified session, so a caller cannot overwrite another child's save
 * by passing someone else's id.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireSession } from '../_shared/session.ts';

/**
 * Guard against a runaway state blob filling the row. A normal save is a
 * few tens of KB; anything approaching a megabyte means something has gone
 * wrong client-side and we would rather fail loudly than store it.
 */
const MAX_STATE_BYTES = 1_000_000;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { state, level } = await req.json();

    if (state === null || typeof state !== 'object' || Array.isArray(state)) {
      return jsonResponse({ error: 'state must be an object' }, 400);
    }
    if (!Number.isInteger(level) || level < 1 || level > 999) {
      return jsonResponse({ error: 'level must be a positive integer' }, 400);
    }

    const encoded = new TextEncoder().encode(JSON.stringify(state)).length;
    if (encoded > MAX_STATE_BYTES) {
      return jsonResponse(
        { error: `Save is too large (${encoded} bytes, limit ${MAX_STATE_BYTES})` },
        413,
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const session = await requireSession(req, supabase);
    if (!session) return jsonResponse({ error: 'Not authenticated' }, 401);

    const { error } = await supabase
      .from('game_states')
      .upsert({
        user_id: session.userId,
        state,
        level,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('save-game upsert error:', error);
      return jsonResponse({ error: 'Could not save your game' }, 500);
    }

    // Keep last_seen_at moving so the admin view reflects real activity.
    await supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', session.userId);

    return jsonResponse({ saved: true });
  } catch (err) {
    console.error('save-game error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
