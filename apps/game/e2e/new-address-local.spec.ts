import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { waitForGameReady, waitForScene } from './helpers';

/**
 * Saves on a new address, on a LOCAL Supabase stack only.
 *
 * The web game moves from its Vercel address to play.arcgame.app. A
 * browser keeps localStorage, IndexedDB and service-worker caches per
 * site, so the new address starts with none of what the old one kept.
 * This plays on one address, then signs in on another in the same
 * browser, and records what the server gives back and what stays behind.
 *
 * Two ports stand in for the two addresses: to a browser they are two
 * sites, each with its own storage, exactly as the vercel.app address
 * and play.arcgame.app are.
 *
 * Skipped unless ARC_E2E_LOCAL_STACK=1 and ARC_E2E_SECOND_URL are set. To
 * run it:
 *   1. a local stack, as for account-local.spec.ts;
 *   2. two dev servers on two ports (never 5173), both with
 *      VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set to the local stack's;
 *   3. ARC_E2E_LOCAL_STACK=1 ARC_E2E_BASE_URL=http://127.0.0.1:<a> \
 *        ARC_E2E_SECOND_URL=http://127.0.0.1:<b> ARC_BROWSER_CHANNEL=chrome \
 *        pnpm exec playwright test e2e/new-address-local.spec.ts
 *
 * Any request to a hosted Supabase project (*.supabase.co) is blocked and
 * fails the run.
 */

const LOCAL = process.env.ARC_E2E_LOCAL_STACK === '1';
const SECOND = process.env.ARC_E2E_SECOND_URL ?? '';
const PIN = '4821';

test.describe.configure({ timeout: 180_000 });
test.skip(!LOCAL || !SECOND, 'needs a local Supabase stack and two dev servers (see the comment at the top)');

interface Guarded { hosted: string[]; functions: string[] }

async function guard(page: Page): Promise<Guarded> {
  const seen: Guarded = { hosted: [], functions: [] };
  await page.route(
    (url) => url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in'),
    async (route) => { seen.hosted.push(route.request().url()); await route.abort('blockedbyclient'); },
  );
  page.on('response', (res) => {
    const u = new URL(res.url());
    if (u.pathname.startsWith('/functions/v1/')) seen.functions.push(`${u.pathname.slice(14)} ${res.status()}`);
  });
  await page.route(/\/assets\/audio\/.*\.(mp3|ogg|wav)(\?.*)?$/, (route) => route.abort());
  return seen;
}

function screen(page: Page, name: string): FrameLocator {
  return page.frameLocator(`iframe[aria-label="A.R.C. ${name} screen"]`);
}

async function typePin(frame: FrameLocator, stage: string, pin: string): Promise<void> {
  for (const digit of pin) {
    await frame.locator(`${stage} .keypad .key`, { hasText: new RegExp(`^${digit}$`) }).click();
  }
  await frame.locator(`${stage} #pin-confirm`).click();
}

/** Everything this site keeps in the browser: localStorage, IndexedDB, caches. */
async function deviceStorage(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const local: Record<string, unknown> = {};
    for (const key of Object.keys(localStorage).sort()) {
      const raw = localStorage.getItem(key) ?? '';
      if (key === 'arc_session') {
        // Never the token itself.
        const s = JSON.parse(raw) as Record<string, unknown>;
        local[key] = { username: s.username, hasToken: typeof s.token === 'string' };
      } else {
        local[key] = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
      }
    }
    const dbs = (await indexedDB.databases()).map((d) => d.name).filter(Boolean) as string[];
    const saves: Array<Record<string, unknown>> = [];
    if (dbs.includes('arc-save')) {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('arc-save');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const rows = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const r = db.transaction('saves', 'readonly').objectStore('saves').getAll();
        r.onsuccess = () => resolve(r.result as Array<Record<string, unknown>>);
        r.onerror = () => reject(r.error);
      });
      db.close();
      for (const row of rows) {
        const state = (row.state ?? {}) as { economy?: { coins?: number } };
        saves.push({
          record: String(row.key).replace(/^[0-9a-f-]{36}/, '<user>'),
          synced: row.synced, version: row.version, coins: state.economy?.coins ?? null,
        });
      }
    }
    const caches = 'caches' in window ? await window.caches.keys() : [];
    return { localStorage: local, indexedDB: dbs, saves, caches };
  });
}

/** The parts of the loaded shelter this test changes. */
async function shelter(page: Page): Promise<Record<string, unknown>> {
  await page.waitForFunction(
    () => !!(window as unknown as { __PHASER_GAME__?: { registry: { get: (k: string) => unknown } } })
      .__PHASER_GAME__?.registry.get('gameStore'),
    undefined,
    { timeout: 30_000 },
  );
  return page.evaluate(() => {
    const store = (window as unknown as { __PHASER_GAME__: { registry: { get: (k: string) => Record<string, unknown> } } })
      .__PHASER_GAME__.registry.get('gameStore') as {
        level: number; totalRescued: number; earnedBadges: string[]; playedDays: string[];
        economy: { coins: number; lifetimeEarnings: number };
      };
    return {
      level: store.level,
      coins: store.economy.coins,
      lifetimeEarnings: store.economy.lifetimeEarnings,
      totalRescued: store.totalRescued,
      earnedBadges: [...store.earnedBadges],
      playedDays: [...store.playedDays],
    };
  });
}

/**
 * Change the shelter and save it, through the game's own save path
 * (saveGameState: this device first, then save-game). The change is made
 * on the store the menu loaded, as a scene's action handler would make it.
 */
async function playAndSave(page: Page, change: { coins: number; badge?: string; rescued?: number; day?: string }): Promise<void> {
  await page.evaluate(async (change) => {
    const g = (window as unknown as { __PHASER_GAME__: { registry: { get: (k: string) => unknown }; scene: { getScene: (k: string) => unknown } } }).__PHASER_GAME__;
    const store = g.registry.get('gameStore') as {
      totalRescued: number; earnedBadges: string[]; playedDays: string[];
      economy: { coins: number; lifetimeEarnings: number };
    };
    store.economy.coins += change.coins;
    store.economy.lifetimeEarnings += change.coins;
    if (change.badge) store.earnedBadges.push(change.badge);
    if (change.rescued) store.totalRescued += change.rescued;
    if (change.day) store.playedDays.push(change.day);
    const specifier = '/src/game-state/loadSaveState.ts';
    const { saveGameState } = await import(/* @vite-ignore */ specifier);
    await saveGameState(g.scene.getScene('MainMenuScene'), store);
  }, change);
}

test('what a signed-in player gets back on a new address, and what stays on the old one', async ({ browser }) => {
  // One browser, two sites.
  const context = await browser.newContext();
  const report: Record<string, unknown> = {};

  // ── The old address ──────────────────────────────────────────────
  const a = await context.newPage();
  const seenA = await guard(a);
  await a.goto('/');
  await waitForGameReady(a, 60_000);
  await screen(a, 'welcome').getByRole('button', { name: 'New? Create account' }).click();
  const signup = screen(a, 'signup');
  const cards = signup.locator('.sign-in-name-card');
  await expect(cards).toHaveCount(3, { timeout: 20_000 });
  await cards.first().click();
  const name = (await cards.first().innerText()).trim();
  await signup.locator('#next-btn').click();
  await expect(signup.locator('#stage-pin')).toBeVisible({ timeout: 15_000 });
  await typePin(signup, '#stage-pin', PIN);
  await expect(signup.locator('#pin-subtitle')).toHaveText(/again/);
  await expect(signup.locator('#stage-pin .pin-dot.filled')).toHaveCount(0);
  await typePin(signup, '#stage-pin', PIN);
  await expect(signup.locator('#stage-hint')).toBeVisible();
  await signup.locator('.clue-card').first().click();
  await signup.locator('#hint-next-btn').click();
  await expect(signup.locator('#stage-name')).toBeVisible();
  await signup.locator('#next-btn').click();
  await waitForScene(a, 'MainMenuScene', 60_000);

  // Play: coins, a badge, rescues and a day, saved and confirmed.
  await shelter(a);
  await playAndSave(a, { coins: 250, badge: 'first_rescue', rescued: 3, day: '2026-10-13' });
  // Settings, the way each setting writes itself.
  await a.evaluate(async () => {
    const load = (p: string) => import(/* @vite-ignore */ p);
    (await load('/src/lib/motion-preference.ts')).setMotionSetting('reduced');
    (await load('/src/lib/intro-state.ts')).setSkipIntro(true);
    (await load('/src/lib/guide-line-preference.ts')).setGuideLine(false);
    localStorage.setItem('arc-audio-prefs', JSON.stringify({ musicVolume: 0.2, sfxVolume: 0.7, musicEnabled: false, sfxEnabled: true }));
  });
  // A last change made with no connection: kept on this device only.
  await a.route('**/functions/v1/save-game', (route) => route.abort('internetdisconnected'));
  await playAndSave(a, { coins: 7 });
  await a.unroute('**/functions/v1/save-game');

  report.oldAddress = { shelter: await shelter(a), device: await deviceStorage(a), functions: seenA.functions };

  // ── The new address, same browser ────────────────────────────────
  const b = await context.newPage();
  const seenB = await guard(b);
  await b.goto(`${SECOND}/`);
  await waitForGameReady(b, 60_000);
  report.newAddressBeforeSignIn = await deviceStorage(b);

  // The big PLAY sign, with no saved names here, opens sign-up, not sign-in.
  await screen(b, 'welcome').getByRole('button', { name: /PLAY/ }).click();
  await waitForScene(b, 'SignupScene', 30_000);
  report.playOnNewAddressOpens = 'SignupScene';

  // "I already have an account", then her name typed and her number.
  await b.goto(`${SECOND}/`);
  await waitForGameReady(b, 60_000);
  await screen(b, 'welcome').getByRole('button', { name: 'I already have an account' }).click();
  const login = screen(b, 'login');
  await expect(login.locator('.chip')).toHaveCount(0);
  await login.locator('#type-name-btn').click();
  await login.locator('#login-name-field').fill(name);
  await login.locator('#name-next-btn').click();
  await typePin(login, '#stage-pin', PIN);
  await waitForScene(b, 'MainMenuScene', 60_000);

  report.newAddress = { shelter: await shelter(b), device: await deviceStorage(b), functions: seenB.functions };
  await test.info().attach('new-address.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  console.log(`NEW-ADDRESS-REPORT ${JSON.stringify(report)}`);

  const oldShelter = (report.oldAddress as { shelter: Record<string, unknown> }).shelter;
  const newShelter = (report.newAddress as { shelter: Record<string, unknown> }).shelter;
  // The new address starts with nothing of the old one's.
  expect(report.newAddressBeforeSignIn).toEqual({ localStorage: {}, indexedDB: [], saves: [], caches: [] });
  // Back from the server: everything that reached it. Days come back
  // earliest first.
  expect(newShelter).toMatchObject({
    coins: (oldShelter.coins as number) - 7,
    totalRescued: oldShelter.totalRescued,
    earnedBadges: oldShelter.earnedBadges,
    playedDays: [...(oldShelter.playedDays as string[])].sort(),
    level: oldShelter.level,
  });
  // Left behind on the old address: the change made with no connection
  // (an unsynced record there) and the settings.
  const oldSaves = (report.oldAddress as { device: { saves: Array<{ record: string; synced: boolean; coins: number }> } }).device.saves;
  expect(oldSaves.find((s) => s.record === '<user>')).toMatchObject({ synced: false, coins: oldShelter.coins });
  const newLocal = (report.newAddress as { device: { localStorage: Record<string, unknown> } }).device.localStorage;
  for (const key of ['arc_motion', 'arc_skip_intro', 'arc_guide_line', 'arc-audio-prefs']) {
    expect(newLocal[key], key).toBeUndefined();
  }
  expect(seenA.hosted).toEqual([]);
  expect(seenB.hosted).toEqual([]);
  await context.close();
});
