/**
 * delete-account — delete the signed-in player's account, and everything
 * held about it.
 *
 * Apple guideline 5.1.1(v): an app that lets a child make an account must
 * let them start its deletion inside the app. The account screen asks,
 * explains what goes, and then asks for the PIN.
 *
 * Two checks, both the ones the game already uses:
 *   - the session (`x-arc-session`) says whose account it is. A user id
 *     in the body is never read.
 *   - the PIN, as at login. A session is a device token that lives for 90
 *     days on a family iPad; the PIN is what says the person holding the
 *     iPad is the player, or the grown-up helping them.
 *
 * The deleting itself is one SQL function, `delete_account`
 * (migrations/00015_delete_account.sql), so it happens in one
 * transaction: every table or none.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyPin } from '../_shared/crypto.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
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
    const userId = session.userId;

    const { pin } = await req.json();
    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return jsonResponse({ error: 'PIN must be exactly 4 digits', code: 'bad_pin' }, 400);
    }

    // 5 wrong PINs per account per 15 minutes, as login allows. Keyed by
    // the user id, which the deletion removes along with the account.
    const rl = await checkRateLimit(supabase, `delete-account:${userId}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return jsonResponse(
        { error: 'Too many tries', code: 'too_many_tries', retryAfterMs: rl.retryAfterMs },
        429,
      );
    }

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('pin_hash')
      .eq('id', userId)
      .single();
    if (userErr || !user) {
      return jsonResponse({ error: 'Not authenticated', code: 'signed_out' }, 401);
    }

    if (!(await verifyPin(pin, user.pin_hash))) {
      return jsonResponse({ error: 'Wrong PIN', code: 'wrong_pin' }, 403);
    }

    const { data: removed, error: deleteErr } = await supabase.rpc('delete_account', {
      p_user_id: userId,
    });
    if (deleteErr) {
      console.error('delete_account failed; nothing was deleted', deleteErr);
      return jsonResponse({ error: 'Could not delete the account', code: 'failed' }, 500);
    }

    // Counts only: no name, no id.
    console.log('account deleted', removed);
    return jsonResponse({ deleted: true });
  } catch (err) {
    console.error('delete-account error:', err);
    return jsonResponse({ error: 'Internal server error', code: 'failed' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
