import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireSession } from '../_shared/session.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const body = await req.json();
    const { joinCode } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Who is calling comes from the verified session, never from the
    // request body — otherwise anyone with the public anon key could add
    // friends to any child's account.
    const session = await requireSession(req, supabase);
    if (!session) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }
    const requestUserId = session.userId;

    if (!joinCode || typeof joinCode !== 'string') {
      return jsonResponse({ error: 'Join code is required' }, 400);
    }

    const normalised = joinCode.toUpperCase().trim();

    // Validate join code format (e.g., "FOX-428")
    if (!/^[A-Z]{3}-\d{3}$/.test(normalised)) {
      return jsonResponse({ error: 'Invalid join code format' }, 400);
    }

    // Find the friend by join code
    const { data: friend, error: friendErr } = await supabase
      .from('users')
      .select('id, username, avatar_emoji, avatar_bg_colour')
      .eq('join_code', normalised)
      .eq('is_active', true)
      .single();

    if (friendErr || !friend) {
      return jsonResponse({ error: 'No player found with that code' }, 404);
    }

    // Can't friend yourself
    if (friend.id === requestUserId) {
      return jsonResponse({ error: "That's your own code!" }, 400);
    }

    // Check if already friends
    const { data: existing } = await supabase
      .from('friendships')
      .select('user_id')
      .eq('user_id', requestUserId)
      .eq('friend_id', friend.id)
      .single();

    if (existing) {
      return jsonResponse({ error: 'Already friends!' }, 400);
    }

    // Create mutual friendship (two rows)
    const { error: insertErr } = await supabase.from('friendships').insert([
      { user_id: requestUserId, friend_id: friend.id },
      { user_id: friend.id, friend_id: requestUserId },
    ]);

    if (insertErr) {
      console.error('Friendship insert error:', insertErr);
      return jsonResponse({ error: 'Failed to add friend' }, 500);
    }

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: requestUserId,
      action: 'friend_added',
      target_id: friend.id,
      metadata: { join_code: normalised },
    });

    return jsonResponse({
      friend: {
        id: friend.id,
        username: friend.username,
        avatarEmoji: friend.avatar_emoji,
        avatarBgColour: friend.avatar_bg_colour,
      },
    });
  } catch (err) {
    console.error('Add friend error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
