import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Shared helpers for A.R.C. e2e tests.
 *
 * Canvas-based Phaser games present two testing challenges:
 * 1. Nothing in the DOM to assert against — we work with the canvas
 *    size + window object.
 * 2. Scene transitions and tweens need to settle before we screenshot.
 *
 * These helpers paper over the basics.
 */

/**
 * Wait for Phaser's game object to exist on window — it is exposed in
 * dev mode via main.ts (`window.__PHASER_GAME__`). Returns the current
 * active scene key, or null if the object isn't present (prod build).
 */
export async function waitForGameReady(page: Page, timeoutMs = 25_000): Promise<string | null> {
  await page.waitForFunction(
    () => {
      const g = (window as unknown as { __PHASER_GAME__?: { scene: { scenes: Array<{ sys: { settings: { key: string; active: boolean } } }> } } }).__PHASER_GAME__;
      if (!g) return false;
      // Ready when at least one scene is active and beyond the Boot phase.
      return g.scene.scenes.some((s) => s.sys.settings.active);
    },
    { timeout: timeoutMs },
  );

  return await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__?: { scene: { scenes: Array<{ sys: { settings: { key: string; active: boolean } } }> } } }).__PHASER_GAME__;
    if (!g) return null;
    const active = g.scene.scenes.find((s) => s.sys.settings.active);
    return active?.sys.settings.key ?? null;
  });
}

/**
 * Wait for a specific scene key to become active.
 */
export async function waitForScene(page: Page, key: string, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const g = (window as unknown as { __PHASER_GAME__?: { scene: { scenes: Array<{ sys: { settings: { key: string; active: boolean } } }> } } }).__PHASER_GAME__;
      if (!g) return false;
      return g.scene.scenes.some((s) => s.sys.settings.active && s.sys.settings.key === expected);
    },
    key,
    { timeout: timeoutMs },
  );
}

/**
 * Seed a fake session into localStorage so the game treats us as
 * signed-in.
 *
 * This gets you past the login gate and no further. The token is not one
 * Supabase minted, so `load-game` answers 401, `loadGameState` calls
 * `requireSignIn`, and an in-canvas "sign in again" panel goes up over
 * whatever you were trying to look at. Anything that has to be *seen*
 * unoccluded — the nav bar, the corridor, an overlay — wants
 * `mintRealSession` instead. This one is still right for measuring a
 * scene that never loads a save.
 */
export async function seedFakeSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('arc_session', JSON.stringify({
      userId: '00000000-0000-0000-0000-000000000001',
      username: 'TestKid',
      avatarEmoji: '🦊',
      avatarBgColour: '#BAE1FF',
      joinCode: 'TEST-0001',
      token: 'playwright-fake-token',
    }));
  });
}

// ── Real sessions ───────────────────────────────────────────────────────
//
// The harness account. One durable row in the live `users` table, reused
// by every run: signup creates it the first time, login re-mints a token
// after that. A per-run account would leave a trail of orphans behind,
// and there is no staging project to point at — `.env.local` names one
// Supabase and the game reads it through a symlink into `apps/game/`.
//
// Its credentials sit in `.env.local` beside the Supabase keys. This file
// is public and that one is not, and the account is real: it holds a live
// session against production.

export interface ArcSession {
  userId: string;
  username: string;
  avatarEmoji: string;
  avatarBgColour: string;
  joinCode: string;
  token: string;
}

const ENV_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.env.local',
);

/** Read one key out of `.env.local`; Playwright does not load it. */
function envValue(key: string): string {
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing from ${ENV_PATH}`);
  return line.slice(key.length + 1).trim();
}

function supabaseEnv(): { url: string; anonKey: string } {
  return {
    url: envValue('VITE_SUPABASE_URL'),
    anonKey: envValue('VITE_SUPABASE_ANON_KEY'),
  };
}

function harnessAccount(): { username: string; pin: string } {
  return {
    username: envValue('ARC_HARNESS_USERNAME'),
    pin: envValue('ARC_HARNESS_PIN'),
  };
}

async function callFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const { url, anonKey } = supabaseEnv();
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: (await res.json()) as Record<string, unknown> };
}

/**
 * Mint a session Supabase will actually accept, by logging the harness
 * account in — or signing it up the first time it is asked for.
 *
 * Returns the session rather than writing it, so callers can hand it to
 * `installSession` (browser) or to a device page (simulator).
 */
export async function mintRealSession(): Promise<ArcSession> {
  const { username, pin } = harnessAccount();

  const login = await callFunction('login', { username, pin });
  if (login.ok && login.json.session) return login.json.session as ArcSession;

  const signup = await callFunction('signup', {
    username,
    pin,
    avatarEmoji: '🦊',
    avatarBgColour: '#BAE1FF',
  });
  if (signup.ok && signup.json.session) return signup.json.session as ArcSession;

  throw new Error(
    `could not mint a session: login said ${JSON.stringify(login.json)}, ` +
    `signup said ${JSON.stringify(signup.json)}`,
  );
}

/**
 * Write a session into localStorage *before the app boots*, along with
 * the two keys that skip the intro map.
 *
 * Must be called before `page.goto`. Setting these after load and
 * reloading works too, but costs a boot; `addInitScript` lands them on
 * the first one. `arc_intro_seen` is not a key — setting it does nothing.
 */
export async function installSession(page: Page, session: ArcSession): Promise<void> {
  await page.addInitScript((s) => {
    localStorage.setItem('arc_session', JSON.stringify(s));
    localStorage.setItem('arc_skip_intro', 'true');
    localStorage.setItem('arc_intro_played', '1');
  }, session);
}

/**
 * Collect any JavaScript runtime errors reported via the page console.
 * Attach at the start of a test, check at the end.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}
