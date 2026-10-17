import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { hashPin, generateToken, generateJoinCode } from '../_shared/crypto.ts';
import { createSession } from '../_shared/session.ts';
import { isPinHintCode } from '../_shared/pin-hints.ts';
import { isDisplayNameBase, randomDisplayName, freeDisplayName } from '../_shared/display-names.ts';
import { offerSignInNames, claimSignInName, releaseSignInName } from '../_shared/sign-in-names.ts';
import { loginKey } from '../_shared/login-name.ts';
import {
  checkRateLimit,
  peekRateLimit,
  bumpRateLimit,
  addressKey,
} from '../_shared/rate-limit.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Fields are read by name, so anything else in the body is never
    // touched. Older builds may still send a parent's email address (no
    // screen ever asked for one) or a typed `pinHint`; neither is read or
    // kept.
    const {
      username, pin, avatarEmoji, avatarBgColour, pinHintCode, displayName, checkOnly,
      offerNames, readyMadeName,
    } = await req.json();

    // `offerNames` asks for three ready-made sign-in names for the name
    // screen to show (00017). It needs no name and creates nothing. It
    // has its own address budget, so a child tapping "Show another" many
    // times does not use up the tries that signing up needs.
    if (offerNames === true) {
      const supabase = serviceClient();
      const addr = await addressKey(req);
      if (addr) {
        const offers = await checkRateLimit(
          supabase, `signup-names-ip:${addr}`, 120, 15 * 60 * 1000,
        );
        if (!offers.allowed) {
          const retryMinutes = Math.ceil(offers.retryAfterMs / 60_000);
          return jsonResponse(
            { error: `Too many tries. Wait ${retryMinutes} minutes.` },
            429,
          );
        }
      }
      return jsonResponse({ names: await offerSignInNames(supabase, 3) });
    }

    // `readyMadeName` says the name was picked from the offered ones, not
    // typed. Such a name is claimed from the pool before the account is
    // made, and refused if somebody else has just taken it.
    //
    // It is now required, not merely honoured. Older builds sent a typed
    // name without it and signed up as before, which left arcgame.app
    // promising parents that "players pick a name from a list" while the
    // server would still take anything a child typed. Marcus chose to
    // close the gap rather than soften the sentence (2026-10-17).
    //
    // What this costs: a child on a cached old build who makes a NEW
    // account is refused and has to reload. Signing in is untouched, and
    // the window shuts anyway when the moved page replaces the old
    // address. See apps/game/e2e-compat/ for what old clients still do.
    const isReadyMade = readyMadeName === true;

    // `checkOnly` answers "is this name free?" and creates nothing.
    //
    // It exists so the name screen can say "that one is taken" while the
    // child is still standing on it. Without it the refusal arrives
    // three screens later — after they have chosen a PIN, confirmed it
    // and picked a clue — and all of that work is thrown away by the
    // check further down this file.
    //
    // It gives away nothing this function did not already give away at
    // the end of the flow, and it spends an attempt from the same
    // address budget, so it opens no new door.
    const isCheck = checkOnly === true;

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
    // A name check has no PIN or animal yet — that is the point of it.
    if (!isCheck && (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin))) {
      return jsonResponse({ error: 'PIN must be exactly 4 digits' }, 400);
    }
    if (!isCheck && (!avatarEmoji || !avatarBgColour)) {
      return jsonResponse({ error: 'Avatar emoji and background colour are required' }, 400);
    }
    // The clue for the PIN is a code from a fixed list
    // (_shared/pin-hints.ts), never typed text. It used to be free text
    // of up to 100 characters, stored as typed, which let a child write
    // anything about themselves into it.
    //
    // Optional, as the hint always was. A `pinHint` string from an app
    // build that still has the typing box is not read at all: the
    // account is made without a clue, so those children can still sign
    // up and nothing they typed is kept.
    let hintCode: string | null = null;
    if (pinHintCode !== undefined && pinHintCode !== null) {
      if (!isPinHintCode(pinHintCode)) {
        return jsonResponse({ error: 'Pick one of the clues' }, 400);
      }
      hintCode = pinHintCode;
    }

    // Service role client for writes
    const supabase = serviceClient();

    // Two address limits, because signup is two different things to
    // abuse and one budget cannot serve both.
    //
    // Attempts (60 per 15 minutes) cover enumeration. "That name is
    // taken" answers a question, and the suggestion list answers it more
    // fully — so anyone can walk a list of names through here and learn
    // which accounts exist, then take that list to login. Note the
    // taken-check below runs before the PIN is hashed, so probing is
    // cheap for them and worth capping early. Trying a few names is
    // normal for a child, hence a budget that comfortably clears it.
    //
    // Creations (20 per day) cover flooding. Every account writes five
    // rows and burns a 100k-iteration hash, and the attempts budget
    // alone would still allow thousands a day. Twenty is far beyond a
    // household and nowhere near useful to a flood.
    //
    // Both come before any database read: the cost starts there.
    //
    // Keyed by a hash of the address, never the address (addressKey).
    const addr = await addressKey(req);
    const createKey = addr ? `signup-create-ip:${addr}` : null;
    if (addr && createKey) {
      const attempts = await checkRateLimit(
        supabase, `signup-ip:${addr}`, 60, 15 * 60 * 1000,
      );
      if (!attempts.allowed) {
        const retryMinutes = Math.ceil(attempts.retryAfterMs / 60_000);
        return jsonResponse(
          { error: `Too many tries. Wait ${retryMinutes} minutes.` },
          429,
        );
      }

      // A name check creates nothing, so it is not charged the daily
      // creation budget — only the attempts one above.
      const creations = isCheck
        ? { allowed: true, retryAfterMs: 0 }
        : await peekRateLimit(supabase, createKey, 20);
      if (!creations.allowed) {
        const retryHours = Math.max(1, Math.ceil(creations.retryAfterMs / 3_600_000));
        return jsonResponse(
          { error: `Too many new accounts from here today. Try again in ${retryHours} hours.` },
          429,
        );
      }
    }

    // An account is only ever made from a name off the list. This sits
    // after the address limits on purpose: an old build that keeps
    // retrying must still be counted, or refusing it here would be a way
    // to make unlimited requests.
    //
    // A check is let through without it, because it creates nothing and
    // answering "is this free?" for an old build costs nobody anything.
    if (!isReadyMade && !isCheck) {
      const offers = await offerSignInNames(supabase, 3);
      return jsonResponse(
        {
          error: 'Pick one of the names we offer',
          code: 'name_not_offered',
          // Under both keys on purpose. The current build reads `names`;
          // the build this refusal is aimed at forwards only `message` and
          // `suggestions` from a signup error, so without the second key a
          // child on an old app is told to pick one of our names and shown
          // none of them.
          names: offers,
          suggestions: offers,
        },
        400,
      );
    }

    // Pre-check: is this username already claimed by another user, in
    // any capitals? A sign-in name ignores capitals (00018), so Lily and
    // lily are one name and only one account may hold it. The unique
    // index on users.username_lower handles the race, but
    // we surface a friendlier error early — and offer 3 ready-made names
    // from the pool, so the child can pick one instead of typing again.
    // Suggestions are never built from the name that was typed: that
    // name is often a child's real one, and "Lily7" or "BraveLily" would
    // carry it into the next try.
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username_lower', loginKey(trimmedUsername))
      .maybeSingle();
    if (isCheck) {
      // 200 either way: "taken" is an answer, not a failure, and the
      // name screen wants to draw suggestions beside the field rather
      // than treat this as an error.
      return jsonResponse({
        available: !existingUser,
        suggestions: existingUser ? await offerSignInNames(supabase, 3) : [],
      });
    }

    if (existingUser) {
      const suggestions = await offerSignInNames(supabase, 3);
      return jsonResponse(
        {
          error: 'That name is taken — try another',
          suggestions,
        },
        400,
      );
    }

    // A ready-made name is taken from the pool now, before the PIN is
    // hashed and the account made. Two children who picked the same name
    // at the same moment cannot both get it: the database gives it to
    // one, and the other is offered three new names.
    if (isReadyMade && !(await claimSignInName(supabase, trimmedUsername))) {
      return jsonResponse(
        {
          error: 'Someone just took that name. Pick another!',
          code: 'name_taken',
          suggestions: await offerSignInNames(supabase, 3),
        },
        409,
      );
    }

    // Hash PIN
    const pinHash = await hashPin(pin);

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

    // The name other players see. The signup page shows the child a pair
    // from the word lists ("Other players see you as MossyOtter") and
    // sends it back; only a pair from the lists, with no number, is taken
    // from the app. Anything else (an older build that sends none, or a
    // name that is not from the lists) gets a pair picked here, because
    // the child has no box to correct it in. A number is added here, and
    // only when the pair is taken. The typed `username` stays the login.
    const wanted = isDisplayNameBase(displayName) ? displayName : randomDisplayName();
    let chosenDisplayName = await freeDisplayName(supabase, wanted);

    // Create user. The unique index on display_name settles a race with
    // another signup between the check above and this insert: lose it,
    // and the account is made with another free name.
    const insertUser = (name: string) => supabase
      .from('users')
      .insert({
        username: trimmedUsername,
        display_name: name,
        pin_hash: pinHash,
        pin_hint_code: hintCode,
        avatar_emoji: avatarEmoji,
        avatar_bg_colour: avatarBgColour,
        join_code: joinCode,
        last_seen_at: new Date().toISOString(),
      })
      .select('id, username, display_name, avatar_emoji, avatar_bg_colour, join_code')
      .single();

    let { data: user, error: userErr } = await insertUser(chosenDisplayName);
    for (let attempt = 0; attempt < 3 && isDisplayNameClash(userErr); attempt++) {
      chosenDisplayName = await freeDisplayName(supabase, randomDisplayName());
      ({ data: user, error: userErr } = await insertUser(chosenDisplayName));
    }

    if (userErr) {
      console.error('User creation failed:', userErr);
      // No account, so the name it claimed goes back in the pool.
      if (isReadyMade) await releaseSignInName(supabase, trimmedUsername);
      // Surface unique-violation as a friendly error.
      if ((userErr as { code?: string }).code === '23505') {
        return jsonResponse(
          { error: 'That name is taken — try another', suggestions: await offerSignInNames(supabase, 3) },
          400,
        );
      }
      return jsonResponse({ error: 'Failed to create account' }, 500);
    }

    // An account exists now, so charge the daily budget. Only successes
    // count here — a child working through taken names has not created
    // anything, and the attempts budget above already covers that.
    if (createKey) await bumpRateLimit(supabase, createKey, 24 * 60 * 60 * 1000);

    // Mark the pool name as this player's. For a ready-made name this
    // completes the claim made above. A typed name from an older build
    // that happens to be in the pool is marked too, so it is not offered
    // to anyone else.
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
        displayName: user.display_name ?? chosenDisplayName,
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

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/** A unique-key failure on the display name, rather than on the login. */
function isDisplayNameClash(err: unknown): boolean {
  const e = err as { code?: string; message?: string; details?: string } | null;
  return e?.code === '23505' && `${e.message ?? ''} ${e.details ?? ''}`.includes('display_name');
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
