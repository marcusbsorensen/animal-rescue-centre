import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId) return jsonResponse({ error: 'Not authenticated' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get user profile (only safe fields — no PII beyond username/avatar)
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('username, avatar_emoji, avatar_bg_colour')
      .eq('id', userId)
      .single();

    if (userErr || !user) {
      return jsonResponse({ error: 'User not found' }, 404);
    }

    // Get game state
    const { data: gameState } = await supabase
      .from('game_states')
      .select('state, level')
      .eq('user_id', userId)
      .single();

    // Get rescue stats
    const { data: stats } = await supabase
      .from('rescue_stats')
      .select('total_rescued, badges_unlocked_count')
      .eq('user_id', userId)
      .single();

    // Get earned badges
    const { data: badges } = await supabase
      .from('badges_earned')
      .select('badge_code, earned_at')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false });

    // Build snapshot — carefully curated, no PII
    const state = gameState?.state as Record<string, unknown> | null;
    const animals = Array.isArray(state?.animals) ? state.animals : [];
    const pets = (animals as Array<Record<string, unknown>>).filter(
      (a) => a.state === 'pet'
    );

    const snapshot = {
      username: user.username,
      avatarEmoji: user.avatar_emoji,
      avatarBgColour: user.avatar_bg_colour,
      level: gameState?.level ?? 1,
      totalRescued: stats?.total_rescued ?? 0,
      petCount: pets.length,
      pets: pets.map((p) => ({
        name: p.name,
        species: p.species,
        collarColour: p.collarColour,
      })),
      badges: (badges ?? []).map((b) => b.badge_code),
      badgeCount: stats?.badges_unlocked_count ?? 0,
      createdAt: new Date().toISOString(),
    };

    // Generate cryptographically random token
    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 32);

    // Expires in 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Insert showcase link
    const { error: insertErr } = await supabase
      .from('showcase_links')
      .insert({
        token,
        user_id: userId,
        snapshot,
        expires_at: expiresAt,
      });

    if (insertErr) {
      console.error('Showcase insert error:', insertErr);
      return jsonResponse({ error: 'Failed to create showcase' }, 500);
    }

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: userId,
      action: 'showcase_created',
      metadata: { token },
    });

    return jsonResponse({ token, expiresAt });
  } catch (err) {
    console.error('Create showcase error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
