import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { peekRateLimit, bumpRateLimit, addressKey } from '../_shared/rate-limit.ts';
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

    // Rate limits, and they count MISSES ONLY — a code that turns out to be
    // real costs nothing.
    //
    // A join code is a word and three digits (generateJoinCode in
    // _shared/crypto.ts): 20 words times 900 numbers, 18,000 codes in all.
    // A miss answers 404 and a hit adds the caller as a friend of whoever
    // holds the code, so with no limit anyone with an account could try
    // every code and become a friend of every child in the game. Format
    // mistakes are refused above and never reach this point.
    //
    // Counting only misses is what lets the limit be tight. Someone
    // sweeping the code space misses almost every time, so 20 misses per
    // 15 minutes still costs them about nine days (900 windows) to try
    // 18,000 codes. A classroom swapping codes at break hits almost every
    // time and never meets the limit at all — which matters, because a
    // school shares one address and 30 children typing real codes would
    // otherwise lock each other out. That is why peek and bump exist
    // rather than one check: see 00008_rate_limit_peek.sql.
    //
    // The account key holds the user id, so delete_account clears it with
    // the account (00015, 00018). The address key is a hash, never the
    // address (addressKey); 00012 refuses any `-ip:` key that is not 64
    // hex characters. With no address or no secret the key is null and
    // only the account limit applies, as in send-gift.
    const accountKey = `add-friend:${requestUserId}`;
    const addr = await addressKey(req);
    const ipKey = addr ? `add-friend-ip:${addr}` : null;

    const accountRl = await peekRateLimit(supabase, accountKey, 20);
    if (!accountRl.allowed) return tooManyTries(accountRl.retryAfterMs);
    if (ipKey) {
      const ipRl = await peekRateLimit(supabase, ipKey, 20);
      if (!ipRl.allowed) return tooManyTries(ipRl.retryAfterMs);
    }

    /** Charge a wrong guess to both buckets. A right one is free. */
    const chargeMiss = async () => {
      await bumpRateLimit(supabase, accountKey, 15 * 60 * 1000);
      if (ipKey) await bumpRateLimit(supabase, ipKey, 15 * 60 * 1000);
    };

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
      // The only answer a guesser gets, so it is the only one that costs.
      await chargeMiss();
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
