// Ready-made sign-in names (migrations/00017_ready_made_sign_in_names.sql).
//
// The pool lives in the database, which offers names at random, settles
// two signups picking the same name, and tops itself up when it runs
// low. These wrappers only call it, and turn any failure into "no names"
// or "not claimed", never an exception.

// deno-lint-ignore no-explicit-any
type Client = any;

/** Up to `count` free names, at random. Empty if the database fails. */
export async function offerSignInNames(supabase: Client, count = 3): Promise<string[]> {
  const { data, error } = await supabase.rpc('arc_offer_sign_in_names', { p_count: count });
  if (error) {
    console.error('arc_offer_sign_in_names failed', error);
    return [];
  }
  if (!Array.isArray(data)) return [];
  // A set-returning function comes back as plain values; older PostgREST
  // versions wrap each in an object named after the function.
  return data
    .map((row: unknown) =>
      typeof row === 'string'
        ? row
        : (row as Record<string, unknown> | null)?.arc_offer_sign_in_names)
    .filter((name: unknown): name is string => typeof name === 'string');
}

/** Take one free name for one signup. False if somebody else has it. */
export async function claimSignInName(supabase: Client, name: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('arc_claim_sign_in_name', { p_name: name });
  if (error) {
    console.error('arc_claim_sign_in_name failed', error);
    return false;
  }
  return data === true;
}

/**
 * Give a claimed name back when its account could not be made. Only a
 * claim with no account on it: a name that belongs to a player stays.
 */
export async function releaseSignInName(supabase: Client, name: string): Promise<void> {
  const { error } = await supabase
    .from('username_pool')
    .update({ claimed_at: null })
    .eq('username', name)
    .is('claimed_by', null);
  if (error) console.error('releasing a sign-in name failed', error);
}
