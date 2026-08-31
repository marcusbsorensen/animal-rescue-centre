import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { checkRateLimit, clientIp } from '../_shared/rate-limit.ts';
import { requireSession } from '../_shared/session.ts';

const VALID_GIFT_TYPES = ['treat_bundle', 'toy', 'blanket_pattern', 'decoration'];

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const body = await req.json();
    const { toUserId, giftType, messagePresetCode } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // The sender is whoever holds the session — taking it from the body
    // meant anyone could send gifts in another child's name, and spend
    // their rate-limit budget doing it.
    const session = await requireSession(req, supabase);
    if (!session) return jsonResponse({ error: 'Not authenticated' }, 401);
    const userId = session.userId;

    if (!toUserId) return jsonResponse({ error: 'Recipient required' }, 400);
    if (!giftType || !VALID_GIFT_TYPES.includes(giftType)) {
      return jsonResponse({ error: 'Invalid gift type' }, 400);
    }
    if (!messagePresetCode || typeof messagePresetCode !== 'string') {
      return jsonResponse({ error: 'Message preset required' }, 400);
    }
    if (userId === toUserId) {
      return jsonResponse({ error: "Can't send a gift to yourself!" }, 400);
    }

    // Rate limit: 10 gifts per 15 minutes per user
    const { allowed, retryAfterMs } = await checkRateLimit(
      supabase, `gift:${userId}`, 10, 15 * 60 * 1000
    );
    if (!allowed) {
      return jsonResponse({
        error: 'Too many gifts sent! Try again later.',
        retryAfterMs,
      }, 429);
    }

    // And by address: 60 per 15 minutes. The per-sender budget above
    // counts one account, so somebody running several from one place
    // gets ten times however many accounts they hold. Set well clear of
    // a household — six accounts could each spend their full budget
    // before this is felt.
    const ip = clientIp(req);
    if (ip) {
      const ipRl = await checkRateLimit(
        supabase, `gift-ip:${ip}`, 60, 15 * 60 * 1000,
      );
      if (!ipRl.allowed) {
        return jsonResponse({
          error: 'Too many gifts sent! Try again later.',
          retryAfterMs: ipRl.retryAfterMs,
        }, 429);
      }
    } else {
      console.error('no client IP header; address limit skipped');
    }

    // Verify they are friends
    const { data: friendship } = await supabase
      .from('friendships')
      .select('user_id')
      .eq('user_id', userId)
      .eq('friend_id', toUserId)
      .single();

    if (!friendship) {
      return jsonResponse({ error: 'You can only send gifts to friends' }, 403);
    }

    // And 5 per hour to any one friend.
    //
    // The budgets above are spread across everyone a child knows, so
    // nothing yet stops all ten of them landing on the same person,
    // every fifteen minutes, all day. Being on the receiving end of that
    // is the thing worth preventing here, and it arrives from an
    // accepted friend, so the friendship check is no help against it.
    //
    // Five an hour is more than an excited child sends and less than a
    // pestering one wants. It leaves the wider budget intact: to spend
    // all ten in a quarter of an hour you now have to think of two
    // different people.
    //
    // Checked after the friendship, so a stranger's rejected attempts
    // never eat into a real friend's allowance.
    const pairRl = await checkRateLimit(
      supabase, `gift-pair:${userId}:${toUserId}`, 5, 60 * 60 * 1000,
    );
    if (!pairRl.allowed) {
      const retryMinutes = Math.ceil(pairRl.retryAfterMs / 60_000);
      return jsonResponse({
        error: `That friend has had lots of gifts from you! Try again in ${retryMinutes} minutes.`,
        retryAfterMs: pairRl.retryAfterMs,
      }, 429);
    }

    // Insert gift
    const { data: gift, error: insertErr } = await supabase
      .from('gifts')
      .insert({
        from_user: userId,
        to_user: toUserId,
        gift_type: giftType,
        message_preset_code: messagePresetCode,
      })
      .select('id, gift_type, message_preset_code, sent_at')
      .single();

    if (insertErr) {
      console.error('Gift insert error:', insertErr);
      return jsonResponse({ error: 'Failed to send gift' }, 500);
    }

    // Increment sender's gifts_sent_count.
    //
    // This used to try an `increment_stat` RPC first and fall back to the
    // read-modify-write below. Two things were wrong with that: no migration
    // ever defined `increment_stat`, and a PostgREST builder is only
    // `PromiseLike` — it has `then`, not `catch` — so the `.catch(...)` meant
    // to absorb the missing RPC threw a TypeError instead. The gift row had
    // already been inserted by then, so the sender was told the gift failed
    // while it sat in the recipient's list, and a retry sent a second one.
    const { data: stats } = await supabase
      .from('rescue_stats')
      .select('gifts_sent_count')
      .eq('user_id', userId)
      .single();

    if (stats) {
      await supabase
        .from('rescue_stats')
        .update({ gifts_sent_count: (stats.gifts_sent_count ?? 0) + 1 })
        .eq('user_id', userId);
    }

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: userId,
      action: 'gift_sent',
      target_id: toUserId,
      metadata: { gift_id: gift.id, gift_type: giftType },
    });

    return jsonResponse({ gift });
  } catch (err) {
    console.error('Send gift error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
