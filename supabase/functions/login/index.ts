import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyPin, generateToken } from '../_shared/crypto.ts';
import { checkRateLimit, clearRateLimit } from '../_shared/rate-limit.ts';
import { createSession } from '../_shared/session.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { username, pin } = await req.json();

    if (!username || typeof username !== 'string') {
      return jsonResponse({ error: 'Username is required' }, 400);
    }
    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return jsonResponse({ error: 'PIN must be exactly 4 digits' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Rate limit: 5 failed attempts per username per 15 minutes. The
    // counter is cleared once the PIN checks out, so only failures
    // accumulate — a child who plays a lot is never locked out by it.
    const rateLimitKey = `login:${username}`;
    const rl = await checkRateLimit(supabase, rateLimitKey, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      const retryMinutes = Math.ceil(rl.retryAfterMs / 60_000);
      return jsonResponse(
        { error: `Too many attempts. Try again in ${retryMinutes} minutes.` },
        429
      );
    }

    // Find user
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, username, pin_hash, avatar_emoji, avatar_bg_colour, join_code, is_active')
      .eq('username', username)
      .single();

    if (userErr || !user) {
      return jsonResponse({ error: 'Username not found' }, 404);
    }

    if (!user.is_active) {
      return jsonResponse({ error: 'Account is deactivated' }, 403);
    }

    // Verify PIN
    const pinValid = await verifyPin(pin, user.pin_hash);
    if (!pinValid) {
      return jsonResponse({ error: 'Wrong PIN' }, 401);
    }

    // The PIN was right, so this attempt was not an attack. Forget the
    // run of attempts that led here.
    await clearRateLimit(supabase, rateLimitKey);

    // Update last seen
    await supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', user.id);

    // Mint a session token and store it, so the authenticated functions
    // can verify who is calling instead of trusting a userId in the body.
    const token = generateToken();
    await createSession(supabase, user.id, token);

    return jsonResponse({
      session: {
        userId: user.id,
        username: user.username,
        avatarEmoji: user.avatar_emoji,
        avatarBgColour: user.avatar_bg_colour,
        joinCode: user.join_code,
        token,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
