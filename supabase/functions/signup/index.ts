import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { hashPin, hashEmail, generateToken, generateJoinCode } from '../_shared/crypto.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { username, pin, avatarEmoji, avatarBgColour, parentEmail } = await req.json();

    // Validate inputs
    if (!username || typeof username !== 'string') {
      return jsonResponse({ error: 'Username is required' }, 400);
    }
    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return jsonResponse({ error: 'PIN must be exactly 4 digits' }, 400);
    }
    if (!avatarEmoji || !avatarBgColour) {
      return jsonResponse({ error: 'Avatar emoji and background colour are required' }, 400);
    }

    // Service role client for writes
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check username is in the pool and unclaimed
    const { data: poolEntry, error: poolErr } = await supabase
      .from('username_pool')
      .select('username')
      .eq('username', username)
      .is('claimed_at', null)
      .single();

    if (poolErr || !poolEntry) {
      return jsonResponse({ error: 'Username is not available' }, 400);
    }

    // Hash PIN
    const pinHash = await hashPin(pin);

    // Hash parent email if provided
    let parentEmailHash: string | null = null;
    if (parentEmail && typeof parentEmail === 'string' && parentEmail.includes('@')) {
      parentEmailHash = await hashEmail(parentEmail);
    }

    // Generate join code (retry if collision)
    let joinCode = generateJoinCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('join_code', joinCode)
        .single();
      if (!existing) break;
      joinCode = generateJoinCode();
    }

    // Create user
    const { data: user, error: userErr } = await supabase
      .from('users')
      .insert({
        username,
        pin_hash: pinHash,
        avatar_emoji: avatarEmoji,
        avatar_bg_colour: avatarBgColour,
        parent_email_hash: parentEmailHash,
        join_code: joinCode,
        last_seen_at: new Date().toISOString(),
      })
      .select('id, username, avatar_emoji, avatar_bg_colour, join_code')
      .single();

    if (userErr) {
      console.error('User creation failed:', userErr);
      return jsonResponse({ error: 'Failed to create account' }, 500);
    }

    // Claim the username in the pool
    await supabase
      .from('username_pool')
      .update({ claimed_at: new Date().toISOString(), claimed_by: user.id })
      .eq('username', username);

    // Create initial game state
    await supabase.from('game_states').insert({
      user_id: user.id,
      state: {},
      level: 1,
    });

    // Create initial rescue stats
    await supabase.from('rescue_stats').insert({ user_id: user.id });

    // Generate session token
    const token = generateToken();

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'signup',
      metadata: { username },
    });

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
    console.error('Signup error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
