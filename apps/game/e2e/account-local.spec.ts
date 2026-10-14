import { test, expect, type Page, type FrameLocator, type BrowserContext } from '@playwright/test';
import { waitForGameReady, waitForScene } from './helpers';

/**
 * The account flows end to end, on a LOCAL Supabase stack only.
 *
 * A child signs up with a ready-made secret name, signs in again on the
 * same device, finds the clue for her number, signs in on a new device by
 * typing her secret name in other capitals (131A, hub 96), and deletes
 * the account. Every step goes through the real screens, the real Edge
 * Functions and the real database, which is why this never runs against
 * production: nobody makes accounts there (a court order means a police
 * notification for each one).
 *
 * Skipped unless ARC_E2E_LOCAL_STACK=1. To run it:
 *   1. `supabase start` in a workdir that is NOT linked to a project, with
 *      `supabase functions serve` and RATE_LIMIT_ADDRESS_KEY set;
 *   2. a dev server whose VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are
 *      the local stack's (env overrides beat apps/game/.env.local);
 *   3. ARC_E2E_LOCAL_STACK=1 ARC_E2E_BASE_URL=http://127.0.0.1:<port> \
 *        ARC_BROWSER_CHANNEL=chrome pnpm exec playwright test e2e/account-local.spec.ts
 *
 * Any request to a hosted Supabase project (*.supabase.co) is blocked and
 * fails the run, so a dev server pointed at production cannot make an
 * account by accident.
 */

const LOCAL = process.env.ARC_E2E_LOCAL_STACK === '1';
const PIN = '4821';

test.describe.configure({ mode: 'serial', timeout: 120_000 });
test.skip(!LOCAL, 'needs a local Supabase stack: set ARC_E2E_LOCAL_STACK=1 (see the comment at the top)');

/** What the run created, shared by the steps in order. */
const account = { name: '', clue: '' };
let newDevice: BrowserContext | null = null;

/** Block hosted Supabase, and record that the local one was used. */
async function guard(page: Page): Promise<{ hosted: string[]; local: string[] }> {
  const seen = { hosted: [] as string[], local: [] as string[] };
  await page.route(
    (url) => url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in'),
    async (route) => { seen.hosted.push(route.request().url()); await route.abort('blockedbyclient'); },
  );
  page.on('request', (req) => {
    const u = new URL(req.url());
    if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && u.port === '54321') seen.local.push(u.pathname);
  });
  // The game's music decodes to hundreds of megabytes and nothing here listens.
  await page.route(/\/assets\/audio\/.*\.(mp3|ogg|wav)(\?.*)?$/, (route) => route.abort());
  return seen;
}

function screen(page: Page, name: string): FrameLocator {
  return page.frameLocator(`iframe[aria-label="A.R.C. ${name} screen"]`);
}

async function session(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('arc_session');
    return raw ? JSON.parse(raw) : null;
  });
}

async function openLogin(page: Page): Promise<FrameLocator> {
  await page.goto('/');
  await waitForGameReady(page, 60_000);
  await screen(page, 'welcome').getByRole('button', { name: 'I already have an account' }).click();
  return screen(page, 'login');
}

async function typePin(frame: FrameLocator, stage: string, pin: string): Promise<void> {
  for (const digit of pin) {
    await frame.locator(`${stage} .keypad .key`, { hasText: new RegExp(`^${digit}$`) }).click();
  }
  await frame.locator(`${stage} #pin-confirm`).click();
}

/** Click the centre of a Phaser text object, found by its words. */
async function clickCanvasText(page: Page, sceneKey: string, label: string): Promise<void> {
  const at = await page.waitForFunction(
    ({ sceneKey, label }) => {
      type Obj = { type: string; text?: string; visible: boolean; list?: Obj[]; getBounds?: () => { centerX: number; centerY: number } };
      const g = (window as unknown as { __PHASER_GAME__?: { canvas: HTMLCanvasElement; scale: { width: number; height: number }; scene: { getScene: (k: string) => { children: { list: Obj[] } } | null } } }).__PHASER_GAME__;
      const scene = g?.scene.getScene(sceneKey);
      if (!g || !scene) return null;
      const stack = [...scene.children.list];
      while (stack.length) {
        const o = stack.pop()!;
        if (o.type === 'Text' && o.text === label && o.visible && o.getBounds) {
          const b = o.getBounds();
          const r = g.canvas.getBoundingClientRect();
          return { x: r.left + (b.centerX * r.width) / g.scale.width, y: r.top + (b.centerY * r.height) / g.scale.height };
        }
        if (o.list) stack.push(...o.list);
      }
      return null;
    },
    { sceneKey, label },
    { timeout: 20_000 },
  );
  const { x, y } = (await at.jsonValue()) as { x: number; y: number };
  // A panel's buttons take input once it has finished coming in.
  await page.waitForTimeout(600);
  await page.mouse.click(x, y);
}

async function canvasHasText(page: Page, sceneKey: string, label: string): Promise<void> {
  await page.waitForFunction(
    ({ sceneKey, label }) => {
      type Obj = { type: string; text?: string; list?: Obj[] };
      const g = (window as unknown as { __PHASER_GAME__?: { scene: { getScene: (k: string) => { children: { list: Obj[] } } | null } } }).__PHASER_GAME__;
      const scene = g?.scene.getScene(sceneKey);
      if (!scene) return false;
      const stack = [...scene.children.list];
      while (stack.length) {
        const o = stack.pop()!;
        if (o.type === 'Text' && o.text === label) return true;
        if (o.list) stack.push(...o.list);
      }
      return false;
    },
    { sceneKey, label },
    { timeout: 30_000 },
  );
}

test('signs up with a ready-made secret name', async ({ page }) => {
  const seen = await guard(page);
  await page.goto('/');
  await waitForGameReady(page, 60_000);
  await screen(page, 'welcome').getByRole('button', { name: 'New? Create account' }).click();

  const signup = screen(page, 'signup');
  // Three names from the pool, offered by the local signup function.
  const cards = signup.locator('.sign-in-name-card');
  await expect(cards).toHaveCount(3, { timeout: 20_000 });
  await cards.first().click();
  account.name = (await cards.first().innerText()).trim();
  expect(account.name).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d*$/);

  await signup.locator('#next-btn').click();
  await expect(signup.locator('#stage-pin')).toBeVisible({ timeout: 15_000 });
  await typePin(signup, '#stage-pin', PIN);
  // The same four numbers again, once the sign has asked for them.
  await expect(signup.locator('#pin-subtitle')).toHaveText(/again/);
  await expect(signup.locator('#stage-pin .pin-dot.filled')).toHaveCount(0);
  await typePin(signup, '#stage-pin', PIN);

  await expect(signup.locator('#stage-hint')).toBeVisible();
  const clue = signup.locator('.clue-card').first();
  account.clue = (await clue.innerText()).trim();
  await clue.click();
  await signup.locator('#hint-next-btn').click();

  await expect(signup.locator('#stage-name')).toBeVisible();
  await signup.locator('#next-btn').click();

  await expect.poll(async () => (await session(page))?.username, { timeout: 30_000 }).toBe(account.name);
  expect(seen.hosted).toEqual([]);
  expect(seen.local.some((p) => p.endsWith('/functions/v1/signup'))).toBe(true);
});

test('signs in again on the same device, from the saved name', async ({ page }) => {
  // The same device: its saved names, and no session.
  await guard(page);
  await page.addInitScript((name) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('arc_remembered_usernames', JSON.stringify([name]));
      localStorage.setItem('arc_skip_intro', 'true');
      sessionStorage.setItem('seeded', '1');
    }
  }, account.name);
  const login = await openLogin(page);
  await login.locator('.chip', { hasText: account.name }).click();
  await typePin(login, '#stage-pin', PIN);
  await expect.poll(async () => (await session(page))?.username, { timeout: 30_000 }).toBe(account.name);
});

test('shows the clue she picked for her number', async ({ page }) => {
  await guard(page);
  await page.addInitScript((name) => {
    localStorage.setItem('arc_remembered_usernames', JSON.stringify([name]));
  }, account.name);
  const login = await openLogin(page);
  await login.locator('.chip', { hasText: account.name }).click();
  await login.locator('#forgot-pin-btn').click();
  await expect(screen(page, 'forgot-pin').locator('#hint-card')).toHaveText(account.clue, { timeout: 20_000 });
});

test('signs in on a new device by typing her secret name, in any capitals (131A, hub 96)', async ({ browser }) => {
  // A fresh browser context: no saved names, no session, nothing.
  newDevice = await browser.newContext();
  const page = await newDevice.newPage();
  const seen = await guard(page);
  const login = await openLogin(page);

  // No saved names, so TYPE YOUR NAME is the big sign, and it opens the box.
  await expect(login.locator('.chip')).toHaveCount(0);
  await expect(login.locator('#type-name-btn')).toHaveText(/TYPE YOUR NAME/);
  await login.locator('#type-name-btn').click();
  const field = login.locator('#login-name-field');
  await expect(field).toBeFocused();

  // A name nobody has: back to the box, with the name still in it.
  await field.fill('NoSuchNameHere');
  await login.locator('#name-next-btn').click();
  await typePin(login, '#stage-pin', PIN);
  await expect(login.locator('#login-name-error')).toHaveText(/can't find that name/);
  await expect(login.locator('#stage-type')).toBeVisible();
  await expect(field).toHaveValue('NoSuchNameHere');

  // Her name in small letters, with a space from the keyboard.
  await field.fill(`${account.name.toLowerCase()} `);
  await login.locator('#name-next-btn').click();
  await expect(login.locator('#stage-pin .sign-title')).toHaveText(`Hi, ${account.name.toLowerCase()}!`);
  await typePin(login, '#stage-pin', PIN);

  // Signed in, and the device now remembers the name as it was made.
  await expect.poll(async () => (await session(page))?.username, { timeout: 30_000 }).toBe(account.name);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arc_remembered_usernames') ?? '[]')))
    .toEqual([account.name]);
  await waitForScene(page, 'MainMenuScene', 30_000);
  expect(seen.hosted).toEqual([]);
  expect(seen.local.filter((p) => p.endsWith('/functions/v1/login'))).toHaveLength(2);
});

test('the clue for her number is found from the typed name too, in any capitals', async ({ page }) => {
  await guard(page);
  const login = await openLogin(page);
  await login.locator('#type-name-btn').click();
  await login.locator('#login-name-field').fill(account.name.toUpperCase());
  await login.locator('#forgot-pin-btn').click();
  await expect(screen(page, 'forgot-pin').locator('#hint-card')).toHaveText(account.clue, { timeout: 20_000 });
});

test('deletes the account from the account screen, and the name signs in no more', async () => {
  // On the new device, where she is signed in.
  const page = newDevice!.pages()[0];
  await waitForScene(page, 'MainMenuScene', 30_000);
  await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: { scene: { getScene: (k: string) => { scene: { start: (k: string, d?: unknown) => void } } } } }).__PHASER_GAME__;
    g.scene.getScene('MainMenuScene').scene.start('AccountScene', {});
  });
  await waitForScene(page, 'AccountScene', 30_000);
  await clickCanvasText(page, 'AccountScene', 'Delete this account');
  await clickCanvasText(page, 'AccountScene', 'Delete it');
  await canvasHasText(page, 'AccountScene', 'Ask a grown-up');
  // At a person's pace. Four keys inside one frame reach the panel out of
  // order (4821 arrived as 4484), which no hand types but a script does.
  await page.keyboard.type(PIN, { delay: 150 });
  await page.keyboard.press('Enter');
  await canvasHasText(page, 'AccountScene', 'Your account is deleted');
  expect(await session(page)).toBeNull();

  // Typing the name on a device now finds nobody.
  const fresh = await newDevice!.browser()!.newContext();
  const again = await fresh.newPage();
  await guard(again);
  const login = await openLogin(again);
  await login.locator('#type-name-btn').click();
  await login.locator('#login-name-field').fill(account.name);
  await login.locator('#name-next-btn').click();
  await typePin(login, '#stage-pin', PIN);
  await expect(login.locator('#login-name-error')).toHaveText(/can't find that name/, { timeout: 20_000 });
  await fresh.close();
  await newDevice!.close();
  newDevice = null;
});
