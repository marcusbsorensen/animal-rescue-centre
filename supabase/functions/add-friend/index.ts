import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { checkRateLimit, addressKey } from '../_shared/rate-limit.ts';
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
      return jsonResponse({ error: 'Not authenticated', code: 'signed_out' }, 401);
    }
    const requestUserId = session.userId;

    if (!joinCode || typeof joinCode !== 'string') {
      return jsonResponse({ error: 'Join code is required', code: 'no_code' }, 400);
    }

    const normalised = joinCode.toUpperCase().trim();

    // Validate join code format (e.g., "FOX-428")
    if (!/^[A-Z]{3}-\d{3}$/.test(normalised)) {
      return jsonResponse({ error: 'Invalid join code format', code: 'bad_format' }, 400);
    }

    // Rate limits, spent before the lookup so a miss costs as much as a hit.
    //
    // A join code is a word and three digits (generateJoinCode in
    // _shared/crypto.ts): 20 words times 900 numbers, 18,000 codes in all.
    // A miss here answers 404 and a hit adds the caller as a friend of
    // whoever holds the code, so with no limit anyone with an account
    // could try every code and become a friend of every child in the game.
    // Format mistakes are refused above and never reach this point.
    //
    // 20 per 15 minutes per account. Keyed by the user id, so
    // delete_account clears it with the account (it removes any
    // rate_limits key that holds the id: 00015, 00018).
    const rl = await checkRateLimit(supabase, `add-friend:${requestUserId}`, 20, 15 * 60 * 1000);
    if (!rl.allowed) return tooManyTries(rl.retryAfterMs);

    // And 20 per 15 minutes per address. This is the real defence: every
    // new account starts with a full budget of its own, so a limit per
    // account only tidies up. One address at 20 tries per 15 minutes
    // needs about nine days to sweep 18,000 codes (900 windows of 15
    // minutes), which is slow enough for somebody to notice. A household
    // shares the budget, which is why it is not lower.
    //
    // Keyed by a hash of the address, never the address (addressKey);
    // 00012 refuses any `-ip:` key that is not 64 hex characters. With no
    // address or no secret the key is null and only the account limit
    // applies, as in send-gift.
    const addr = await addressKey(req);
    if (addr) {
      const ipRl = await checkRateLimit(supabase, `add-friend-ip:${addr}`, 20, 15 * 60 * 1000);
      if (!ipRl.allowed) return tooManyTries(ipRl.retryAfterMs);
    }

    // Find the friend by join code. Only what a friend may see: the
    // display name from the word lists, never the name they typed, which
    // is their login.
    const { data: friend, error: friendErr } = await supabase
      .from('users')
      .select('id, display_name, avatar_emoji, avatar_bg_colour')
      .eq('join_code', normalised)
      .eq('is_active', true)
      .single();

    if (friendErr || !friend) {
      return jsonResponse({ error: 'No player found with that code', code: 'not_found' }, 404);
    }

    // Can't friend yourself
    if (friend.id === requestUserId) {
      return jsonResponse({ error: "That's your own code!", code: 'own_code' }, 400);
    }

    // Check if already friends
    const { data: existing } = await supabase
      .from('friendships')
      .select('user_id')
      .eq('user_id', requestUserId)
      .eq('friend_id', friend.id)
      .single();

    if (existing) {
      return jsonResponse({ error: 'Already friends!', code: 'already_friends' }, 400);
    }

    // Create mutual friendship (two rows)
    const { error: insertErr } = await supabase.from('friendships').insert([
      { user_id: requestUserId, friend_id: friend.id },
      { user_id: friend.id, friend_id: requestUserId },
    ]);

    if (insertErr) {
      console.error('Friendship insert error:', insertErr);
      return jsonResponse({ error: 'Failed to add friend', code: 'failed' }, 500);
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
        displayName: friend.display_name,
        avatarEmoji: friend.avatar_emoji,
        avatarBgColour: friend.avatar_bg_colour,
      },
    });
  } catch (err) {
    console.error('Add friend error:', err);
    return jsonResponse({ error: 'Internal server error', code: 'failed' }, 500);
  }
});

function tooManyTries(retryAfterMs: number) {
  return jsonResponse(
    { error: 'Too many tries', code: 'too_many_tries', retryAfterMs },
    429,
  );
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
