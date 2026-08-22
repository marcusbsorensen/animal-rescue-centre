import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
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
    const { allowed, retryAfterMs } = checkRateLimit(
      `gift:${userId}`, 10, 15 * 60 * 1000
    );
    if (!allowed) {
      return jsonResponse({
        error: 'Too many gifts sent! Try again later.',
        retryAfterMs,
      }, 429);
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

    // Increment sender's gifts_sent_count
    await supabase.rpc('increment_stat', {
      p_user_id: userId,
      p_field: 'gifts_sent_count',
    }).catch(() => {
      // If RPC doesn't exist, do manual update
      return supabase
        .from('rescue_stats')
        .update({ gifts_sent_count: supabase.rpc('', {}) }) // fallback below
        .eq('user_id', userId);
    });

    // Manual fallback: increment gifts_sent_count
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
