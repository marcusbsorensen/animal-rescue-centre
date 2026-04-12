import { supabase } from './supabase';

export interface SignupData {
  username: string;
  pin: string;
  avatarEmoji: string;
  avatarBgColour: string;
  parentEmailHash?: string;
}

export interface LoginData {
  username: string;
  pin: string;
}

export interface AuthSession {
  userId: string;
  username: string;
  avatarEmoji: string;
  avatarBgColour: string;
  joinCode: string;
  token: string;
}

const SESSION_KEY = 'arc_session';
const REMEMBERED_USERNAMES_KEY = 'arc_remembered_usernames';

/**
 * Sign up a new player via the Edge Function.
 */
export async function signup(data: SignupData): Promise<AuthSession> {
  const { data: result, error } = await supabase.functions.invoke('signup', {
    body: data,
  });

  if (error) throw new Error(error.message ?? 'Signup failed');
  if (result.error) throw new Error(result.error);

  const session: AuthSession = result.session;
  saveSession(session);
  rememberUsername(session.username);
  return session;
}

/**
 * Log in an existing player via the Edge Function.
 */
export async function login(data: LoginData): Promise<AuthSession> {
  const { data: result, error } = await supabase.functions.invoke('login', {
    body: data,
  });

  if (error) throw new Error(error.message ?? 'Login failed');
  if (result.error) throw new Error(result.error);

  const session: AuthSession = result.session;
  saveSession(session);
  rememberUsername(session.username);
  return session;
}

/**
 * Log out the current player.
 */
export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Get the current session from localStorage.
 */
export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

/**
 * Save session to localStorage.
 */
function saveSession(session: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Remember a username on this device for quick login.
 */
function rememberUsername(username: string): void {
  const existing = getRememberedUsernames();
  if (!existing.includes(username)) {
    existing.unshift(username);
    localStorage.setItem(REMEMBERED_USERNAMES_KEY, JSON.stringify(existing.slice(0, 10)));
  }
}

/**
 * Get usernames this device has previously logged in with.
 */
export function getRememberedUsernames(): string[] {
  try {
    const raw = localStorage.getItem(REMEMBERED_USERNAMES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

/**
 * Fetch 3 random available usernames from the pool.
 */
export async function getAvailableUsernames(count = 3): Promise<string[]> {
  const { data, error } = await supabase
    .from('username_pool')
    .select('username')
    .is('claimed_at', null)
    .limit(50);

  if (error) throw new Error('Failed to fetch usernames');
  if (!data || data.length === 0) return [];

  // Shuffle and pick `count`
  const shuffled = data.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((row) => row.username);
}

/**
 * Search for a username (for "I'm on a new device" flow).
 */
export async function searchUsername(query: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('users')
    .select('username')
    .ilike('username', `%${query}%`)
    .eq('is_active', true)
    .limit(10);

  if (error) throw new Error('Failed to search usernames');
  return (data ?? []).map((row) => row.username);
}
