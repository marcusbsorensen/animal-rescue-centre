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
