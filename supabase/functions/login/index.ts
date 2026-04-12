import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyPin, generateToken } from '../_shared/crypto.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

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

    // Rate limit: 5 attempts per username per 15 minutes
    const rl = checkRateLimit(`login:${username}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      const retryMinutes = Math.ceil(rl.retryAfterMs / 60_000);
      return jsonResponse(
        { error: `Too many attempts. Try again in ${retryMinutes} minutes.` },
        429
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

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

    // Update last seen
    await supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', user.id);

    // Generate session token
    const token = generateToken();

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
