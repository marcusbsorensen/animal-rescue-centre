/**
 * get-gifts — the gifts waiting for the signed-in player, as the Village
 * Hall inbox shows them.
 *
 * This is the read that made gifts look like they never arrived. The game
 * read `gifts` with the public key, under a rule keyed on `auth.uid()`
 * (00002: `gifts_read_received ... using (to_user = auth.uid())`), and ARC's
 * own sessions never set a Supabase auth session, so `auth.uid()` was always
 * null and the inbox was always empty. The client then swallowed the error
 * and showed nothing, so sending worked and receiving silently did not.
 * Same trap, same fix, as get-friends (.claude/TRAPS.md).
 *
 * Read with the service role, for the account the session (`x-arc-session`)
 * belongs to. A user id in the body is never read: a player may only ever
 * see their own inbox.
 *
 * Of the sender, only what another player may see (00016): the display name
 * from the word lists and the avatar. Never the name they typed, which is
 * their login.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireSession } from '../_shared/session.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const session = await requireSession(req, supabase);
    if (!session) {
      return jsonResponse({ error: 'Not authenticated', code: 'signed_out' }, 401);
    }

    const { data, error } = await supabase
      .from('gifts')
      .select(
        'id, gift_type, message_preset_code, sent_at, ' +
        'sender:users!gifts_from_user_fkey (display_name, avatar_emoji)',
      )
      .eq('to_user', session.userId)
      .is('claimed_at', null)
      .order('sent_at', { ascending: false });
    if (error) {
      console.error('get-gifts read failed', error);
      return jsonResponse({ error: 'Could not load gifts', code: 'failed' }, 500);
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const gifts = rows.map((row) => {
      const sender = row.sender as Record<string, string> | null;
      return {
        id: row.id,
        fromDisplayName: sender?.display_name ?? 'Unknown',
        fromAvatarEmoji: sender?.avatar_emoji ?? '🐾',
        giftType: row.gift_type,
        messagePresetCode: row.message_preset_code,
        sentAt: row.sent_at,
      };
    });

    return jsonResponse({ gifts });
  } catch (err) {
    console.error('get-gifts error:', err);
    return jsonResponse({ error: 'Internal server error', code: 'failed' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
