import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const body = await req.json();
    const { userId, giftId } = body;

    if (!userId) return jsonResponse({ error: 'Not authenticated' }, 401);
    if (!giftId) return jsonResponse({ error: 'Gift ID required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch the gift — must be for this user and unclaimed
    const { data: gift, error: fetchErr } = await supabase
      .from('gifts')
      .select('*')
      .eq('id', giftId)
      .eq('to_user', userId)
      .is('claimed_at', null)
      .single();

    if (fetchErr || !gift) {
      return jsonResponse({ error: 'Gift not found or already claimed' }, 404);
    }

    // Mark as claimed
    const { error: updateErr } = await supabase
      .from('gifts')
      .update({ claimed_at: new Date().toISOString() })
      .eq('id', giftId);

    if (updateErr) {
      return jsonResponse({ error: 'Failed to claim gift' }, 500);
    }

    // Increment recipient's gifts_received_count
    const { data: stats } = await supabase
      .from('rescue_stats')
      .select('gifts_received_count')
      .eq('user_id', userId)
      .single();

    if (stats) {
      await supabase
        .from('rescue_stats')
        .update({ gifts_received_count: (stats.gifts_received_count ?? 0) + 1 })
        .eq('user_id', userId);
    }

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: userId,
      action: 'gift_claimed',
      metadata: { gift_id: giftId, gift_type: gift.gift_type, from_user: gift.from_user },
    });

    return jsonResponse({
      gift: {
        id: gift.id,
        giftType: gift.gift_type,
        messagePresetCode: gift.message_preset_code,
        fromUser: gift.from_user,
      },
    });
  } catch (err) {
    console.error('Claim gift error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
