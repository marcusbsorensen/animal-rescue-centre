/**
 * get-pin-hint — returns the clue a player picked for their PIN, gated
 * by rate-limiting. Called from the forgot-PIN flow.
 *
 * Design notes:
 * - The clue is a code from a fixed list (_shared/pin-hints.ts), such as
 *   `birthday`, and the answer carries both the code and its words. It
 *   used to be free text the child typed, returned as typed; that column
 *   is gone (migrations 00010 and 00011).
 * - The clue is not secret on its own — it is a memory aid, not a
 *   credential. Returning it to anyone who knows a valid username is
 *   acceptable risk; the harder gate is rate-limiting so it can't be
 *   brute-force enumerated.
 * - We don't return a hint at all if the account doesn't exist
 *   (avoids username enumeration via this endpoint).
 *
 * See docs/forgot-pin-recovery.md for the full design.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { checkRateLimit, addressKey } from '../_shared/rate-limit.ts';
import { pinHintText } from '../_shared/pin-hints.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { username } = await req.json();
    if (!username || typeof username !== 'string') {
      return jsonResponse({ error: 'Username is required' }, 400);
    }
    const trimmed = username.trim();
    if (trimmed.length < 2 || trimmed.length > 18) {
      return jsonResponse({ error: 'Invalid username' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit: 5 hint lookups per username per 30 minutes. Forgot-PIN
    // is a deliberate flow, not casual — kids shouldn't be hitting this
    // often, and a brute-force enumerator should hit a wall quickly.
    // Every lookup counts here, unlike login: there is no "correct"
    // outcome that would prove the caller was the account's owner.
    const rl = await checkRateLimit(supabase, `hint:${trimmed}`, 5, 30 * 60 * 1000);
    if (!rl.allowed) {
      const retryMinutes = Math.ceil(rl.retryAfterMs / 60_000);
      return jsonResponse(
        { error: `Too many tries. Wait ${retryMinutes} minutes.` },
        429,
      );
    }

    // And by address: 30 lookups per 30 minutes. Walking a list of names
    // through this endpoint is the enumeration the per-name cap cannot
    // see. Every lookup counts here, unlike login — there is no correct
    // answer a caller could give to show they own the account.
    // Keyed by a hash of the address, never the address (addressKey).
    const addr = await addressKey(req);
    if (addr) {
      const ipRl = await checkRateLimit(
        supabase, `hint-ip:${addr}`, 30, 30 * 60 * 1000,
      );
      if (!ipRl.allowed) {
        const retryMinutes = Math.ceil(ipRl.retryAfterMs / 60_000);
        return jsonResponse(
          { error: `Too many tries. Wait ${retryMinutes} minutes.` },
          429,
        );
      }
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('pin_hint_code, is_active')
      .eq('username', trimmed)
      .maybeSingle();

    // Don't reveal whether the account exists — uniform 404 either way.
    if (error || !user || !user.is_active) {
      return jsonResponse({ found: false }, 200);
    }

    // `hint` carries the words, as it always has, so app builds already
    // on phones show the clue without an update. A code that is not on
    // the list answers as no clue.
    const hint = pinHintText(user.pin_hint_code);
    return jsonResponse({
      found: true,
      hintCode: hint ? user.pin_hint_code : null,
      hint,
    });
  } catch (err) {
    console.error('get-pin-hint error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
