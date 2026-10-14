/**
 * Rate limiting, backed by Postgres.
 *
 * This used to be a module-level Map. That gave every Edge Function
 * isolate its own private counter, and Supabase starts isolates on demand
 * and recycles them — so a cold one began at zero and a caller spreading
 * requests across them was never limited at all. The counters live in the
 * `rate_limits` table now, where they outlive the isolate.
 *
 * The decision is made inside a single SQL statement, so two simultaneous
 * requests cannot both read the same count and both pass. See
 * supabase/migrations/00007_rate_limits.sql.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

/**
 * Count one attempt against `key` and say whether it may proceed.
 *
 * Fails **closed**: if the database cannot be reached, the attempt is
 * refused. An unreachable limiter is the moment a brute-forcer would most
 * like to be waved through, and a child seeing "try again in a minute"
 * during an outage is the smaller harm.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  maxAttempts: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max: maxAttempts,
    p_window_ms: windowMs,
  });

  if (error) {
    console.error('checkRateLimit failed; refusing the attempt', error);
    return { allowed: false, retryAfterMs: 60_000 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== 'boolean') {
    console.error('checkRateLimit returned nothing usable; refusing', data);
    return { allowed: false, retryAfterMs: 60_000 };
  }

  return {
    allowed: row.allowed,
    retryAfterMs: Number(row.retry_after_ms) || 0,
  };
}

/**
 * Forget a key's attempts, after the thing it was guarding succeeded.
 *
 * Only failures should accumulate. Counting successes too would lock a
 * child out for playing often, which is the opposite of the point.
 */
export async function clearRateLimit(
  supabase: SupabaseClient,
  key: string,
): Promise<void> {
  const { error } = await supabase.rpc('clear_rate_limit', { p_key: key });
  if (error) {
    // Not fatal: the window will expire on its own soon enough.
    console.error('clearRateLimit failed', error);
  }
}

/**
 * Ask whether `key` is within budget, without spending any of it.
 *
 * Pairs with `bumpRateLimit` for buckets that must count failures only —
 * see supabase/migrations/00008_rate_limit_peek.sql for why an address
 * bucket cannot simply be cleared on success.
 *
 * Fails **closed**, for the same reason `checkRateLimit` does.
 */
export async function peekRateLimit(
  supabase: SupabaseClient,
  key: string,
  maxAttempts: number,
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc('peek_rate_limit', {
    p_key: key,
    p_max: maxAttempts,
  });

  if (error) {
    console.error('peekRateLimit failed; refusing the attempt', error);
    return { allowed: false, retryAfterMs: 60_000 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== 'boolean') {
    console.error('peekRateLimit returned nothing usable; refusing', data);
    return { allowed: false, retryAfterMs: 60_000 };
  }

  return { allowed: row.allowed, retryAfterMs: Number(row.retry_after_ms) || 0 };
}

/** Charge one attempt to `key`. Never throws; a lost count is not fatal. */
export async function bumpRateLimit(
  supabase: SupabaseClient,
  key: string,
  windowMs: number,
): Promise<void> {
  const { error } = await supabase.rpc('bump_rate_limit', {
    p_key: key,
    p_window_ms: windowMs,
  });
  if (error) console.error('bumpRateLimit failed', error);
}

/**
 * The caller's address as a rate-limit key: an HMAC-SHA-256 of the
 * address, in hex, keyed with the `RATE_LIMIT_ADDRESS_KEY` function
 * secret. Use it as `login-ip:${key}` and so on.
 *
 * The address itself is never stored. Rows in `rate_limits` used to be
 * `login-ip:<address>`, and since nothing sweeps the table on a timer,
 * a child's address stayed there after its window closed. A keyed hash
 * still lets one address be counted, and cannot be turned back into the
 * address without the secret (a plain hash could: there are only four
 * billion IPv4 addresses to try).
 *
 * Returns null when the request has no address, or when the secret is
 * missing or shorter than 32 characters. Callers then skip the address
 * limit, as they already did with no address header: the per-name and
 * per-account limits still apply, and a missing secret should not take
 * every login down. Marcus sets the secret once, from his own machine:
 *   openssl rand -hex 32
 *   supabase secrets set RATE_LIMIT_ADDRESS_KEY=<that value>
 * Changing it later only restarts every address window.
 */
export async function addressKey(req: Request): Promise<string | null> {
  const ip = clientIp(req);
  if (!ip) {
    console.error('no client IP header; address limit skipped');
    return null;
  }
  const secret = Deno.env.get('RATE_LIMIT_ADDRESS_KEY');
  if (!secret || secret.length < 32) {
    console.error('RATE_LIMIT_ADDRESS_KEY is not set; address limit skipped');
    return null;
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(ip)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The caller's address, as the edge saw it. Only `addressKey` should
 * call this: an address must not reach the database.
 *
 * Supabase sits behind Cloudflare, which sets `cf-connecting-ip` itself
 * and refuses at the edge — 403, before any function runs — when a
 * client tries to send its own. `x-real-ip` is overwritten the same way.
 * `x-forwarded-for` is not forwarded here at all, so nothing reads it.
 * Verified against this project's own edge logs, 2026-08-31.
 *
 * Returns null if neither header is present, which should not happen.
 * Callers skip the address check in that case rather than refusing: the
 * per-username limit is the primary defence, and a platform change to
 * these header names should not take every login in the game down with
 * it.
 */
function clientIp(req: Request): string | null {
  const ip =
    req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip');
  const trimmed = ip?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
