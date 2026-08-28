/**
 * save-game — write the caller's saved game.
 *
 * Counterpart to load-game. The row written is always the one belonging to
 * the verified session, so a caller cannot overwrite another child's save
 * by passing someone else's id.
 *
 * Writes are conditional on `expectedVersion` — the version the client last
 * saw. Before that existed this was a blind upsert, so a second device
 * saving from a stale copy erased whatever the first had done since, with
 * nothing anywhere recording that it had happened. Now a stale write matches
 * no row and comes back as 409 carrying the current server state, which the
 * client keeps rather than discards.
 *
 * This function only *detects* the collision. Deciding what to do with two
 * divergent shelters is a separate job (see docs/audit-2026-08-22.md and the
 * client's handling in loadSaveState.ts).
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

/** Postgres unique-violation — someone inserted the row between our read
 *  and our insert. Treated as a conflict, not an error. */
const UNIQUE_VIOLATION = '23505';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const body = await req.json();
    const { state, level } = body;
    const expectedVersion = body.expectedVersion;

    if (state === null || typeof state !== 'object' || Array.isArray(state)) {
      return jsonResponse({ error: 'state must be an object' }, 400);
    }
    if (!Number.isInteger(level) || level < 1 || level > 999) {
      return jsonResponse({ error: 'level must be a positive integer' }, 400);
    }
    // Three meanings, deliberately distinct:
    //   number     the client loaded this version and expects to replace it
    //   null       the client believes it has no server row at all
    //   undefined  an old client that predates versioning (see below)
    const hasVersion = expectedVersion !== undefined;
    const claimsNoRow = expectedVersion === null;
    if (hasVersion && !claimsNoRow
        && (!Number.isInteger(expectedVersion) || expectedVersion < 0)) {
      return jsonResponse({ error: 'expectedVersion must be a non-negative integer or null' }, 400);
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

    const userId = session.userId;
    // `version` and `updated_at` are set by the game_states_touch trigger,
    // never by us — see 00006_game_state_version.sql.
    const row = { state, level };

    let saved: { version: number; updated_at: string } | null = null;

    if (!hasVersion) {
      // Legacy client: a browser still running JS cached from before
      // versioning shipped. Refusing it would lock a child out of saving
      // until their service worker updated, which is a worse failure than
      // the last-write-wins it has always had. It gets the old behaviour,
      // and the trigger still moves the version on so a *new* client that
      // was holding the previous one finds out.
      console.log('save-game: unversioned write from a pre-versioning client', { userId });
      const { data, error } = await supabase
        .from('game_states')
        .upsert({ user_id: userId, ...row })
        .select('version, updated_at')
        .single();
      if (error) {
        console.error('save-game legacy upsert error:', error);
        return jsonResponse({ error: 'Could not save your game' }, 500);
      }
      saved = data;
    } else if (claimsNoRow) {
      // First save on a brand-new account. Insert only — if a row is
      // already there, this client's picture of the world is wrong and it
      // must not paper over whatever is stored.
      const { data, error } = await supabase
        .from('game_states')
        .insert({ user_id: userId, ...row })
        .select('version, updated_at')
        .single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return conflict(supabase, userId);
        console.error('save-game insert error:', error);
        return jsonResponse({ error: 'Could not save your game' }, 500);
      }
      saved = data;
    } else {
      // The normal path. One statement: the filter and the write are the
      // same operation, so two devices racing cannot both succeed.
      const { data, error } = await supabase
        .from('game_states')
        .update(row)
        .eq('user_id', userId)
        .eq('version', expectedVersion)
        .select('version, updated_at')
        .maybeSingle();

      if (error) {
        console.error('save-game update error:', error);
        return jsonResponse({ error: 'Could not save your game' }, 500);
      }
      // No row matched: either the version has moved on under us, or there
      // is no row yet (a client that lost its local record but kept a
      // version number). conflict() tells the two apart.
      if (!data) return conflict(supabase, userId);
      saved = data;
    }

    if (!saved) {
      // Unreachable: every branch above either assigns or returns. Kept so
      // the response below does not need a non-null assertion to compile.
      console.error('save-game: write reported success with no row');
      return jsonResponse({ error: 'Could not save your game' }, 500);
    }

    // Keep last_seen_at moving so the admin view reflects real activity.
    await supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', userId);

    return jsonResponse({
      saved: true,
      version: saved.version,
      updatedAt: saved.updated_at,
    });
  } catch (err) {
    console.error('save-game error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

/**
 * Answer a rejected write with what is actually stored.
 *
 * The client needs the server's state, not just "no": without it the only
 * recovery is to reload, and a reload after a rejected save is exactly when
 * a child's last few minutes disappear. Shape matches load-game's `save`
 * so the client has one thing to parse.
 */
async function conflict(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<Response> {
  const { data, error } = await supabase
    .from('game_states')
    .select('state, level, version, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('save-game conflict read error:', error);
    return jsonResponse({ error: 'Could not save your game' }, 500);
  }

  // No row and yet the write did not land — the row was deleted between the
  // two statements (account deletion). Nothing to conflict with; say so
  // plainly rather than handing back a half-empty conflict payload.
  if (!data) {
    return jsonResponse({ error: 'No saved game for this player' }, 404);
  }

  return jsonResponse(
    {
      error: 'Your game was saved somewhere else since this device last loaded it',
      conflict: true,
      save: {
        state: data.state ?? {},
        level: data.level ?? 1,
        version: data.version,
        updatedAt: data.updated_at,
      },
    },
    409,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
