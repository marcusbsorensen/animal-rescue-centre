/**
 * Deleting a player's account, from the account screen.
 *
 * Apple guideline 5.1.1(v): an app that lets a child make an account must
 * let them start its deletion inside the app. The server half is the
 * `delete-account` Edge Function, which checks the session and the PIN
 * and then removes every row about the account in one transaction (see
 * docs/account-deletion.md). This is the device half: ask for it, then
 * forget the account here too.
 */
import { supabase } from './supabase';
import {
  getSession,
  logout,
  forgetUsername,
  readFunctionErrorBody,
  sessionHeaders,
  type AuthSession,
} from './auth';
import { clearLocalSave } from '../game-state/localSave';
import { resetSaveTracking } from '../game-state/loadSaveState';

/** How a deletion request ended, in the words the panel needs. */
export type DeleteAccountOutcome =
  | 'deleted'
  /** The PIN was not this account's. Nothing was deleted. */
  | 'wrong-pin'
  /** Too many wrong PINs; the server wants a pause. Nothing was deleted. */
  | 'too-many-tries'
  /** The server does not know this device's session. Nothing was deleted. */
  | 'signed-out'
  /** No answer, or an error. Nothing is known to have been deleted. */
  | 'failed';

/**
 * The signup page keeps its choices here while a child signs up, the
 * PIN among them (public/admin/signup.html). It is cleared when signup
 * ends; this makes sure it is gone if that never happened.
 */
const SIGNUP_DRAFT_KEY = 'arc-signup-draft';

/**
 * Ask the server to delete the signed-in account. On success the account
 * is also forgotten on this device, so the caller only has to move on.
 */
export async function deleteAccount(pin: string): Promise<DeleteAccountOutcome> {
  const session = getSession();
  if (!session) return 'signed-out';

  let outcome: DeleteAccountOutcome;
  try {
    const { data, error } = await supabase.functions.invoke('delete-account', {
      headers: sessionHeaders(),
      body: { pin },
    });
    if (error) {
      const body = await readFunctionErrorBody(error);
      outcome = outcomeFor(body?.code);
    } else {
      outcome = (data as { deleted?: boolean } | null)?.deleted === true ? 'deleted' : 'failed';
    }
  } catch (err) {
    console.error('[deleteAccount] request failed', err);
    outcome = 'failed';
  }

  if (outcome === 'deleted') await forgetAccountOnDevice(session);
  return outcome;
}

function outcomeFor(code: string | undefined): DeleteAccountOutcome {
  switch (code) {
    case 'wrong_pin':
    case 'bad_pin':
      return 'wrong-pin';
    case 'too_many_tries':
      return 'too-many-tries';
    case 'signed_out':
      return 'signed-out';
    default:
      return 'failed';
  }
}

/**
 * Remove what this device keeps for one account: the sign-in token, the
 * name on the "who's playing?" list, the saved shelter in IndexedDB and
 * the save tracking held in memory.
 *
 * Settings that belong to the device rather than the player (sound, less
 * movement, screen layout, skipping the intro) stay: another child on
 * the same iPad would lose them otherwise, and none of them says anything
 * about who played.
 */
export async function forgetAccountOnDevice(session: AuthSession): Promise<void> {
  logout();
  forgetUsername(session.username);
  try {
    localStorage.removeItem(SIGNUP_DRAFT_KEY);
  } catch {
    // Storage refused; there is nothing in it to remove.
  }
  resetSaveTracking();
  await clearLocalSave(session.userId);
}
