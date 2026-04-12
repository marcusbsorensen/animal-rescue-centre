import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Token comes from query string (public endpoint, no auth needed)
    const url = new URL(req.url);
    let token = url.searchParams.get('token');

    // Also accept from body for POST
    if (!token && req.method === 'POST') {
      const body = await req.json();
      token = body.token;
    }

    if (!token || typeof token !== 'string' || token.length < 16) {
      return jsonResponse({ error: 'Invalid showcase token' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch showcase
    const { data: showcase, error: fetchErr } = await supabase
      .from('showcase_links')
      .select('snapshot, expires_at, view_count')
      .eq('token', token)
      .single();

    if (fetchErr || !showcase) {
      return jsonResponse({ error: 'Showcase not found' }, 404);
    }

    // Check expiry
    if (new Date(showcase.expires_at) < new Date()) {
      return jsonResponse({ error: 'This showcase has expired' }, 410);
    }

    // Increment view count (fire-and-forget)
    supabase
      .from('showcase_links')
      .update({ view_count: (showcase.view_count ?? 0) + 1 })
      .eq('token', token)
      .then(() => {});

    return jsonResponse({
      snapshot: showcase.snapshot,
      viewCount: (showcase.view_count ?? 0) + 1,
    });
  } catch (err) {
    console.error('Get showcase error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
