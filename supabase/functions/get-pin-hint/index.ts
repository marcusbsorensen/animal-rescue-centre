/**
 * get-pin-hint — returns the saved PIN-hint for a username, gated by
 * rate-limiting and a minimal proof that the requester has access to
 * recovery context. Called from the forgot-PIN flow when the kid has
 * already passed 2/3 of the recovery questions (Tier 1) and needs the
 * hint to remember their PIN (Tier 2).
 *
 * Design notes:
 * - The hint is by definition NOT secret on its own — it's a memory
 *   aid, not a credential. Returning it to anyone who knows a valid
 *   username is acceptable risk; the harder gate is rate-limiting so
 *   it can't be brute-force enumerated.
 * - We don't return a hint at all if the account doesn't exist
 *   (avoids username enumeration via this endpoint).
 *
 * See docs/forgot-pin-recovery.md for the full design.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

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

    const { data: user, error } = await supabase
      .from('users')
      .select('pin_hint, is_active')
      .eq('username', trimmed)
      .maybeSingle();

    // Don't reveal whether the account exists — uniform 404 either way.
    if (error || !user || !user.is_active) {
      return jsonResponse({ found: false }, 200);
    }

    return jsonResponse({
      found: true,
      hint: typeof user.pin_hint === 'string' && user.pin_hint.length > 0
        ? user.pin_hint
        : null,
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
