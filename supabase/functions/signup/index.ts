import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { hashPin, hashEmail, generateToken, generateJoinCode } from '../_shared/crypto.ts';
import { createSession } from '../_shared/session.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { username, pin, avatarEmoji, avatarBgColour, parentEmail, pinHint } = await req.json();

    // Validate inputs
    if (!username || typeof username !== 'string') {
      return jsonResponse({ error: 'Username is required' }, 400);
    }
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 2 || trimmedUsername.length > 18) {
      return jsonResponse({ error: 'Name must be 2–18 characters' }, 400);
    }
    if (!/^[A-Za-z][A-Za-z\s'\-]*[A-Za-z]$|^[A-Za-z]$/.test(trimmedUsername)) {
      return jsonResponse({ error: 'Names use letters only — no numbers or symbols' }, 400);
    }
    // Light profanity blocklist — same family as packages/game-logic
    // isUsernameSafe(). Server-side enforcement so the pool isn't the
    // only line of defence.
    const usernameLower = trimmedUsername.toLowerCase().replace(/[^a-z]/g, '');
    const blocklist = [
      'admin', 'system', 'support', 'official', 'password', 'login',
      'signup', 'delete', 'null', 'undefined', 'fuck', 'shit', 'cunt',
      'bitch', 'arse', 'damn', 'dick', 'cock', 'piss', 'twat', 'wank',
      'bastard', 'prick', 'slut', 'nazi', 'retard',
    ];
    if (blocklist.some((w) => usernameLower.includes(w))) {
      return jsonResponse({ error: 'Try a different name' }, 400);
    }
    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return jsonResponse({ error: 'PIN must be exactly 4 digits' }, 400);
    }
    if (!avatarEmoji || !avatarBgColour) {
      return jsonResponse({ error: 'Avatar emoji and background colour are required' }, 400);
    }
    // Hint is optional (back-compat with older signup payloads). If
    // present, it must be a string of reasonable length; we don't
    // re-run the leak-detection rules server-side because that runs
    // client-side already and the kid has already gut-checked it.
    //
    // Cap bumped 60 → 100 chars 2026-05-02 — Lily's "Danish numbers
    // (the language no-one speaks here)" was 73 chars and had to be
    // truncated to 49 on her account. 100 gives room for one full
    // sentence of context + parenthesis without feeling cramped.
    let cleanHint: string | null = null;
    if (typeof pinHint === 'string') {
      const t = pinHint.trim();
      if (t.length > 100) {
        return jsonResponse({ error: 'Hint is too long' }, 400);
      }
      if (t.length >= 4) cleanHint = t;
    }

    // Service role client for writes
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Pre-check: is this username already claimed by another user?
    // The unique constraint on users.username handles the race, but
    // we surface a friendlier error early — and offer 3 quick
    // alternatives so the kid doesn't have to think of a new name
    // from scratch.
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', trimmedUsername)
      .maybeSingle();
    if (existingUser) {
      const suggestions = await suggestAvailableUsernames(supabase, trimmedUsername);
      return jsonResponse(
        {
          error: 'That name is taken — try another',
          suggestions,
        },
        400,
      );
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
        username: trimmedUsername,
        pin_hash: pinHash,
        pin_hint: cleanHint,
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
      // Surface unique-violation as a friendly error.
      if ((userErr as { code?: string }).code === '23505') {
        return jsonResponse({ error: 'That name is taken — try another' }, 400);
      }
      return jsonResponse({ error: 'Failed to create account' }, 500);
    }

    // Best-effort: if this username is in the legacy pool, mark it
    // claimed. The pool is no longer required for signup — kids can
    // choose any safe name — but pool-claim keeps old data consistent.
    await supabase
      .from('username_pool')
      .update({ claimed_at: new Date().toISOString(), claimed_by: user.id })
      .eq('username', trimmedUsername);

    // Create initial game state
    await supabase.from('game_states').insert({
      user_id: user.id,
      state: {},
      level: 1,
    });

    // Create initial rescue stats
    await supabase.from('rescue_stats').insert({ user_id: user.id });

    // Mint a session token and store it, so the authenticated functions
    // can verify who is calling instead of trusting a userId in the body.
    const token = generateToken();
    await createSession(supabase, user.id, token);

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

/**
 * Generate up to 3 username suggestions similar to the requested one
 * that are confirmed-available. Variants:
 *   - <name><n> for small numbers (Lily1, Lily2, Lily3, …)
 *   - <name><name> repeated (LilyLily)
 *   - <name><suffix> with a kid-friendly word (LilyFox, LilyBunny, …)
 *   - <prefix><name> (BraveLily, SunnyLily)
 *
 * We bulk-check candidates in one query, return the first 3 that are
 * free. Keeps the candidate set bounded so we never fan out forever
 * even on a wildly-collided name.
 */
async function suggestAvailableUsernames(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  base: string,
): Promise<string[]> {
  const SUFFIX_WORDS = ['Fox', 'Bunny', 'Bear', 'Star', 'Cat', 'Dog', 'Owl', 'Pup'];
  const PREFIX_WORDS = ['Brave', 'Sunny', 'Cosy', 'Tiny', 'Happy', 'Wild'];
  const candidates: string[] = [];
  // Numeric suffixes — try 1..9 first, then 10..29 randomised.
  for (let n = 1; n <= 9; n++) candidates.push(`${base}${n}`);
  const teens = Array.from({ length: 20 }, (_, i) => i + 10).sort(() => Math.random() - 0.5);
  for (const n of teens) candidates.push(`${base}${n}`);
  // Word variants — randomised so different kids don't all see the
  // same first 3 options.
  const shuffledSuffix = [...SUFFIX_WORDS].sort(() => Math.random() - 0.5);
  for (const w of shuffledSuffix) candidates.push(`${base}${w}`);
  const shuffledPrefix = [...PREFIX_WORDS].sort(() => Math.random() - 0.5);
  for (const w of shuffledPrefix) candidates.push(`${w}${base}`);
  // Doubled name (LilyLily) — sweet for short names, redundant for long ones.
  if (base.length <= 6) candidates.push(`${base}${base}`);

  // Cap at the first 18 unique candidates and length 18.
  const uniq = Array.from(new Set(candidates)).filter((c) => c.length <= 18).slice(0, 18);

  // Bulk check which ones already exist in users.
  const { data: claimed } = await supabase
    .from('users')
    .select('username')
    .in('username', uniq);
  const claimedSet = new Set(((claimed ?? []) as Array<{ username: string }>).map((r) => r.username));

  // Return the first 3 that aren't claimed.
  const free = uniq.filter((c) => !claimedSet.has(c)).slice(0, 3);
  return free;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
