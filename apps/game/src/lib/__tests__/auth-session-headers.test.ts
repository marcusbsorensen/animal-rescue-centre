import { describe, it, expect, beforeEach, vi } from 'vitest';

// lib/auth imports lib/supabase, which builds a real client at module load.
// Stub it — these tests only exercise the header helper.
vi.mock('../supabase', () => ({
  supabase: { functions: { invoke: vi.fn() }, from: vi.fn() },
  isSupabaseConfigured: () => true,
}));

const { sessionHeaders } = await import('../auth');

const SESSION_KEY = 'arc_session';

/**
 * The authenticated Edge Functions resolve the caller from x-arc-session
 * and no longer accept a userId in the request body. If this header stops
 * being sent, every one of them starts returning 401 — so it is worth
 * pinning rather than trusting to inspection.
 */
describe('sessionHeaders', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('carries the session token when signed in', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      userId: 'u-1',
      username: 'BrambleFox',
      avatarEmoji: '🦊',
      avatarBgColour: '#fff',
      joinCode: 'FOX-428',
      token: 'a'.repeat(64),
    }));

    expect(sessionHeaders()).toEqual({ 'x-arc-session': 'a'.repeat(64) });
  });

  it('is empty when signed out, so the function returns its own 401', () => {
    expect(sessionHeaders()).toEqual({});
  });

  it('is empty rather than throwing when the stored session is corrupt', () => {
    localStorage.setItem(SESSION_KEY, 'not-json');
    expect(sessionHeaders()).toEqual({});
  });

  it('never puts the token in Authorization', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      userId: 'u-1', username: 'x', avatarEmoji: '🦊',
      avatarBgColour: '#fff', joinCode: 'FOX-428', token: 'b'.repeat(64),
    }));

    // Overriding Authorization would replace the anon-key JWT supabase-js
    // sets, which the platform's verify_jwt rejects.
    expect(Object.keys(sessionHeaders())).not.toContain('Authorization');
  });
});
