/**
 * What `https://esm.sh/@supabase/supabase-js@2` resolves to under test
 * (see vitest.config.ts). `createClient` hands back whichever fake the
 * current test installed with `useFakeSupabase`.
 */
import type { FakeSupabase } from './fake-supabase';

export type SupabaseClient = FakeSupabase;

export function createClient(): FakeSupabase {
  const fake = (globalThis as { __arcFakeSupabase?: FakeSupabase }).__arcFakeSupabase;
  if (!fake) throw new Error('No fake Supabase installed: call useFakeSupabase() first');
  return fake;
}
