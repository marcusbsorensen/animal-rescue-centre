import { test, expect, type Page, type FrameLocator, type BrowserContext, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { waitForGameReady, waitForScene } from '../e2e/helpers';

/**
 * The live client (this commit, main) against a LOCAL Supabase stack that
 * runs the server about to be deployed. Proof for a deploy, not a unit test:
 * a child with this build (or its cached PWA) keeps using it after the
 * server moves on.
 *
 * Recipe (first used 2026-10-14 for migrations 00017/00018):
 *   1. A checkout of the server commit, NOT linked to any project:
 *      `supabase start`, then `supabase status -o env > stack.env` and
 *      `supabase functions serve --env-file <file with RATE_LIMIT_ADDRESS_KEY>`.
 *   2. Here, build with ONLY the local values in the environment (no
 *      .env.local): VITE_SUPABASE_URL=http://127.0.0.1:54321 and
 *      VITE_SUPABASE_ANON_KEY=<ANON_KEY from stack.env>; `pnpm build`, then
 *      `vite preview --host 127.0.0.1 --port 4417 --strictPort`. Never 5173.
 *   3. Optionally the new client the same way on another port (ARC_NEW_URL).
 *   4. ARC_E2E_LOCAL_STACK=1 ARC_LOCAL_STACK_ENV=stack.env \
 *        pnpm exec playwright test -c e2e-compat/playwright.config.ts
 *
 *   ARC_OLD_URL   the old client (default http://127.0.0.1:4417)
 *   ARC_NEW_URL   the new client (optional; continuity tests skip without it)
 *   ARC_LOCAL_STACK_ENV  `supabase status -o env` output, for the anon key
 *   ARC_COMPAT_OUT  where results (compat-results.json) and screenshots go
 *   ARC_COMPAT_LABEL  a tag for this run's results (e.g. "new-server")
 *   ARC_COMPAT_EXISTING  "Name:field:value", an account from an earlier run
 *                        (e.g. made before the migrations), used instead of
 *                        a new one; run with -g to pick the tests that fit
 *
 * Accounts. A child on an old build can still SIGN IN, and everything an
 * existing account does through the old screens is checked below. What the
 * old screens can no longer do is make a NEW account: since d72a170
 * (2026-10-17) the server makes one only from a name off the list
 * (`readyMadeName: true`), and the old screens have the child type a name.
 * The first test records that refusal as the expected answer. The accounts
 * the rest of the run uses are made by calling `signup` the way the new
 * screens do (`makeAccount`), which needs the name pool filled (migration
 * 00017 does that).
 *
 * Every request to a hosted Supabase project is aborted and fails the test,
 * and the browser cannot resolve *.supabase.co at all.
 */

const LOCAL = process.env.ARC_E2E_LOCAL_STACK === '1';
const OLD = process.env.ARC_OLD_URL ?? 'http://127.0.0.1:4417';
const NEW = process.env.ARC_NEW_URL ?? '';
const OUT = process.env.ARC_COMPAT_OUT ?? 'test-results/compat';
const LABEL = process.env.ARC_COMPAT_LABEL ?? 'run';
const API = 'http://127.0.0.1:54321';
const PIN = '4821';
const WRONG_PIN = '1357';

test.describe.configure({ mode: 'serial', timeout: 180_000 });
test.skip(!LOCAL, 'needs a local Supabase stack: set ARC_E2E_LOCAL_STACK=1');

fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

// ── Results, kept across runs by label ─────────────────────────────
const RESULTS = path.join(OUT, 'compat-results.json');
function note(key: string, value: unknown): void {
  let all: Record<string, Record<string, unknown>> = {};
  try { all = JSON.parse(fs.readFileSync(RESULTS, 'utf8')); } catch { /* first write */ }
  all[LABEL] = { ...(all[LABEL] ?? {}), [key]: value };
  fs.writeFileSync(RESULTS, JSON.stringify(all, null, 2));
}
async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(OUT, 'shots', `${LABEL}-${name}.png`) });
}

function anonKey(): string {
  const file = process.env.ARC_LOCAL_STACK_ENV;
  if (!file) throw new Error('ARC_LOCAL_STACK_ENV is not set');
  const m = fs.readFileSync(file, 'utf8').match(/^ANON_KEY="?([^"\n]+)"?$/m);
  if (!m) throw new Error('no ANON_KEY in the stack env file');
  return m[1];
}

// ── Accounts made by this run ──────────────────────────────────────
function letters(n: number): string {
  const pool = 'bfgjkmqvwxz';
  let s = '';
  for (let i = 0; i < n; i++) s += pool[Math.floor(Math.random() * pool.length)];
  return s;
}
// What the old screens are given to type. No typed name makes an account any
// more (see the first test), so this only ever meets the refusal.
const typed = { name: `Marlo${letters(5)}`, hint: 'my favourite football shirt' };
// The accounts the run signs in to, made through the list by makeAccount().
const acct = { name: '' };
const acct2 = { name: '' };
const newAcct = { name: '', clue: '' };
const saved = { field: '', value: 0 };
// An account an earlier run made (e.g. under today's server, before the
// migrations): "Name:field:value". The tests then use it instead of a new one.
const EXISTING = process.env.ARC_COMPAT_EXISTING;
if (EXISTING) {
  const [n, f, v] = EXISTING.split(':');
  acct.name = n;
  saved.field = f;
  saved.value = Number(v);
}

/** One of the local Edge Functions, called as the game calls it. */
async function callFunction(name: string, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const key = anonKey();
  const res = await fetch(`${API}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/**
 * An account made the way the signup screens make one now: ask for three
 * names, take one, and sign up with `readyMadeName: true`. The old screens
 * cannot do this (see the first test), and what this run is for is what an
 * account that exists can still do through them. The same idiom as
 * `newPlayer` in e2e/account-local.spec.ts. Returns the name.
 */
async function makeAccount(): Promise<string> {
  const offer = await callFunction('signup', { offerNames: true });
  expect(offer.status, JSON.stringify(offer.json)).toBe(200);
  const [name] = offer.json.names as string[];
  expect(name, 'the pool offered no names — is it seeded?').toBeTruthy();

  const r = await callFunction('signup', {
    username: name, readyMadeName: true, pin: PIN, avatarEmoji: '🦊', avatarBgColour: '#ffd0a0',
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  expect((r.json.session as { username?: string }).username).toBe(name);
  return name;
}

// ── A device: its own context, guarded ─────────────────────────────
interface Device {
  ctx: BrowserContext;
  page: Page;
  hosted: string[];
  calls: string[];
  failed: string[];
  errors: string[];
}

async function device(browser: Browser, base: string): Promise<Device> {
  const ctx = await browser.newContext({ baseURL: base });
  const d: Device = { ctx, page: null as unknown as Page, hosted: [], calls: [], failed: [], errors: [] };
  await ctx.route(
    (url) => /(^|\.)supabase\.(co|in|com)$/.test(url.hostname),
    async (route) => { d.hosted.push(route.request().url()); await route.abort('blockedbyclient'); },
  );
  // The game's music decodes to hundreds of megabytes and nothing here listens.
  await ctx.route(/\/assets\/audio\/.*\.(mp3|ogg|wav|m4a)(\?.*)?$/, (route) => route.abort());
  ctx.on('response', (res) => {
    const u = new URL(res.url());
    if (u.port === '54321' && res.request().method() !== 'OPTIONS') {
      d.calls.push(`${res.request().method()} ${u.pathname}${u.pathname.startsWith('/rest') ? decodeURIComponent(u.search) : ''} -> ${res.status()}`);
    }
  });
  ctx.on('requestfailed', (req) => {
    const u = new URL(req.url());
    if (!/\/assets\/audio\//.test(u.pathname)) d.failed.push(`${req.method()} ${u.host}${u.pathname} ${req.failure()?.errorText ?? ''}`);
  });
  d.page = await ctx.newPage();
  d.page.on('pageerror', (e) => d.errors.push(`pageerror: ${e.message}`));
  d.page.on('console', (m) => {
    // The audio this run blocks on purpose logs a failed load each time.
    if (/\/assets\/audio\//.test(m.location().url ?? '')) return;
    if (m.type() === 'error' || m.type() === 'warning') d.errors.push(`${m.type()}: ${m.text().slice(0, 300)} @ ${(m.location().url ?? '').replace(/^https?:\/\/[^/]+/, '')}`);
  });
  return d;
}

async function finish(d: Device, key: string): Promise<void> {
  note(`${key}.network`, { calls: d.calls, failed: d.failed, consoleErrors: d.errors.slice(0, 40), hosted: d.hosted });
  await d.ctx.close();
  expect(d.hosted, 'a request went to a hosted Supabase project').toEqual([]);
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

async function typePin(frame: FrameLocator, stage: string, pin: string): Promise<void> {
  for (const digit of pin) {
    await frame.locator(`${stage} .keypad .key`, { hasText: new RegExp(`^${digit}$`) }).click();
  }
  await frame.locator(`${stage} #pin-confirm`).click();
}

function fnResponse(page: Page, name: string) {
  return page.waitForResponse(
    (r) => r.url().endsWith(`/functions/v1/${name}`) && r.request().method() === 'POST',
    { timeout: 30_000 },
  );
}

async function bodyOf(res: { json: () => Promise<unknown>; text: () => Promise<string> }): Promise<unknown> {
  try { return await res.json(); } catch { return await res.text(); }
}

/** Strip the session token before anything is written down. */
function redact(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v ?? null, (k, val) => (k === 'token' ? '<token>' : val)));
}

/** Visible Phaser texts in a scene, for "what does the child see". */
async function sceneTexts(page: Page, sceneKey: string): Promise<string[]> {
  return page.evaluate((sceneKey) => {
    type Obj = { type: string; text?: string; visible: boolean; list?: Obj[] };
    const g = (window as unknown as { __PHASER_GAME__?: { scene: { getScene: (k: string) => { children: { list: Obj[] } } | null } } }).__PHASER_GAME__;
    const scene = g?.scene.getScene(sceneKey);
    if (!scene) return [];
    const out: string[] = [];
    const stack = [...scene.children.list];
    while (stack.length) {
      const o = stack.pop()!;
      if (o.type === 'Text' && o.visible && o.text) out.push(o.text);
      if (o.list) stack.push(...o.list);
    }
    return out.reverse();
  }, sceneKey);
}

async function clickCanvasText(page: Page, sceneKey: string, label: string | RegExp): Promise<void> {
  const src = typeof label === 'string' ? `^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$` : label.source;
  const at = await page.waitForFunction(
    ({ sceneKey, src }) => {
      type Obj = { type: string; text?: string; visible: boolean; list?: Obj[]; getBounds?: () => { centerX: number; centerY: number } };
      const g = (window as unknown as { __PHASER_GAME__?: { canvas: HTMLCanvasElement; scale: { width: number; height: number }; scene: { getScene: (k: string) => { children: { list: Obj[] } } | null } } }).__PHASER_GAME__;
      const scene = g?.scene.getScene(sceneKey);
      if (!g || !scene) return null;
      const re = new RegExp(src);
      const stack = [...scene.children.list];
      while (stack.length) {
        const o = stack.pop()!;
        if (o.type === 'Text' && o.text && re.test(o.text) && o.visible && o.getBounds) {
          const b = o.getBounds();
          const r = g.canvas.getBoundingClientRect();
          return { x: r.left + (b.centerX * r.width) / g.scale.width, y: r.top + (b.centerY * r.height) / g.scale.height };
        }
        if (o.list) stack.push(...o.list);
      }
      return null;
    },
    { sceneKey, src },
    { timeout: 20_000 },
  );
  const { x, y } = (await at.jsonValue()) as { x: number; y: number };
  await page.waitForTimeout(600);
  await page.mouse.click(x, y);
}

/** Seed a device's saved names (as the old client keeps them), once. */
async function rememberOnDevice(page: Page, names: string[]): Promise<void> {
  await page.addInitScript((names) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('arc_remembered_usernames', JSON.stringify(names));
      sessionStorage.setItem('seeded', '1');
    }
  }, names);
}

/** Old client: welcome → login → tap the saved name → PIN. */
async function oldSignInFromChip(page: Page, chip: string, pin = PIN): Promise<FrameLocator> {
  await page.goto('/');
  await waitForGameReady(page, 60_000);
  await screen(page, 'welcome').getByRole('button', { name: 'I already have an account' }).click();
  const login = screen(page, 'login');
  await login.locator('.chip', { hasText: chip }).first().click();
  await typePin(login, '#stage-pin', pin);
  return login;
}

/**
 * Old client: the signup screens, from the typed name to the clue. The name
 * check on the way is answered, and the last step is refused (the first
 * test says why), so this returns what the server said at each.
 */
async function oldSignupThroughScreens(page: Page, name: string, hint: string): Promise<{ check: unknown; signup: unknown; status: number }> {
  const s = screen(page, 'signup');
  await s.locator('.name-field').fill(name);
  await s.locator('.chip.avatar-pick').nth(1).click();
  const checkP = fnResponse(page, 'signup');
  await s.locator('#next-btn').click();
  const check = await bodyOf(await checkP);
  await expect(s.locator('#stage-pin')).toBeVisible({ timeout: 15_000 });
  await typePin(s, '#stage-pin', PIN);
  await expect(s.locator('#pin-subtitle')).toHaveText(/again/);
  await expect(s.locator('#stage-pin .pin-dot.filled')).toHaveCount(0);
  await typePin(s, '#stage-pin', PIN);
  await expect(s.locator('#stage-hint')).toBeVisible({ timeout: 15_000 });
  await s.locator('#hint-input').fill(hint);
  await s.locator('#hint-next-btn').click();
  const signupP = fnResponse(page, 'signup');
  await s.locator('#hint-safe-btn').click();
  const res = await signupP;
  return { check, signup: redact(await bodyOf(res)), status: res.status() };
}

/** Click through the four intro panels into the game. */
async function playIntoGame(page: Page): Promise<void> {
  await screen(page, 'menu').locator('#continue-btn').click();
  const intro = screen(page, 'intro');
  for (let i = 0; i < 8; i++) {
    const inGame = await page.evaluate(() => {
      const g = (window as unknown as { __PHASER_GAME__?: { scene: { scenes: Array<{ sys: { settings: { key: string; active: boolean } } }> } } }).__PHASER_GAME__;
      return !!g?.scene.scenes.some((s) => s.sys.settings.active && s.sys.settings.key === 'GameScene');
    });
    if (inGame) return;
    try { await intro.locator('#stage').click({ timeout: 5_000 }); } catch { /* frame gone: the game is starting */ }
    await page.waitForTimeout(900);
  }
  await waitForScene(page, 'GameScene', 30_000);
}

// ════════════════════════════════════════════════════════════════════
// The old client, against whatever server the stack runs
// ════════════════════════════════════════════════════════════════════

// ── A typed name no longer makes an account, and that is meant ─────
//
// This test used to sign up through the old screens with a typed name and
// expect 200. It now expects the refusal, and the refusal is a decision, not
// a regression.
//
// arcgame.app tells parents that players pick a secret name from a list.
// The signup screens have offered nothing else since migration 00017, but
// the server went on taking whatever an older build typed, so the sentence
// was true of the screen and not of the account. On 2026-10-17 Marcus chose
// to close the gap rather than soften the sentence (d72a170): `signup` now
// makes an account only when the body says `readyMadeName: true`, and
// otherwise answers 400 with `code: 'name_not_offered'` and three names.
//
// The cost was accepted knowingly: a child on a cached old build cannot make
// a NEW account until the page reloads onto the new build. Signing in to an
// account they already have is untouched, and a name check (`checkOnly`) is
// still answered, because it creates nothing. The tests after this one
// protect that: sign in, save, friends, gifts, the board.
//
// So a 200 here means the server has gone back to taking typed names. Any
// other 400 means the refusal has changed meaning. Either way, ask why
// before editing this test to match.
test('old: a typed name is refused at signup with name_not_offered, and no account is made', async ({ browser }) => {
  const d = await device(browser, OLD);
  const { page } = d;
  await page.goto('/');
  await waitForGameReady(page, 60_000);
  await screen(page, 'welcome').getByRole('button', { name: 'New? Create account' }).click();

  // The old screens go all the way to the last step: the name check is
  // answered, so the child chooses a number and a clue and is refused only
  // when the account would be made.
  const r = await oldSignupThroughScreens(page, typed.name, typed.hint);
  expect(r.check, 'the name check is still answered').toMatchObject({ available: true });
  expect(r.status).toBe(400);
  expect(r.signup).toMatchObject({ code: 'name_not_offered' });
  expect((r.signup as { names?: unknown }).names, 'the refusal carries three names').toHaveLength(3);
  expect(await session(page), 'the refused child is not signed in').toBeNull();

  // Nothing was made: the same name is still free.
  const after = await callFunction('signup', { username: typed.name, checkOnly: true });
  expect(after.status).toBe(200);
  expect(after.json.available).toBe(true);

  // What the old screen shows for it: recorded, not asserted.
  await page.waitForTimeout(1500);
  const shown = ((await screen(page, 'signup').locator('#stage-select .error-sticker').textContent({ timeout: 3_000 }).catch(() => '')) ?? '').trim();
  note('old.signup', { typed: typed.name, ...r, whatTheChildSees: shown });
  await shot(page, '01a-typed-name-refused');
  await finish(d, 'old.signup');
});

test('old: signs in to an account made from the list, signs out, signs in again with the same capitals', async ({ browser }) => {
  // The account the rest of this run uses. The old screens cannot make one
  // (the test above), so it is made the way the new screens make it.
  if (!EXISTING) acct.name = await makeAccount();

  const d = await device(browser, OLD);
  const { page } = d;
  await rememberOnDevice(page, [acct.name]);
  const firstP = fnResponse(page, 'login');
  await oldSignInFromChip(page, acct.name);
  const fr = await firstP;
  note('old.login.firstSignIn', { name: acct.name, status: fr.status(), body: redact(await bodyOf(fr)) });
  expect(fr.status()).toBe(200);
  await expect.poll(async () => (await session(page))?.username, { timeout: 30_000 }).toBe(acct.name);
  await expect(screen(page, 'menu').locator('#continue-btn')).toBeVisible({ timeout: 30_000 });
  await shot(page, '01b-after-sign-in-menu');

  // Sign out from the menu.
  await screen(page, 'menu').locator('#logout-btn').click();
  await expect(screen(page, 'welcome').getByRole('button', { name: 'I already have an account' })).toBeVisible({ timeout: 15_000 });
  expect(await session(page)).toBeNull();

  // And back in, from the name this device remembered.
  await screen(page, 'welcome').getByRole('button', { name: 'I already have an account' }).click();
  const login = screen(page, 'login');
  await expect(login.locator('.chip', { hasText: acct.name })).toBeVisible();
  const loginP = fnResponse(page, 'login');
  await login.locator('.chip', { hasText: acct.name }).click();
  await typePin(login, '#stage-pin', PIN);
  const lr = await loginP;
  note('old.login.sameCapitals', { status: lr.status(), body: redact(await bodyOf(lr)) });
  await expect.poll(async () => (await session(page))?.username, { timeout: 30_000 }).toBe(acct.name);
  await expect(screen(page, 'menu').locator('#continue-btn')).toBeVisible({ timeout: 30_000 });
  await finish(d, 'old.signIn');
});

test('old: a taken name in other capitals is refused, and a suggested name is refused at signup', async ({ browser }) => {
  const d = await device(browser, OLD);
  const { page } = d;
  await page.goto('/');
  await waitForGameReady(page, 60_000);
  await screen(page, 'welcome').getByRole('button', { name: 'New? Create account' }).click();
  const s = screen(page, 'signup');
  await s.locator('.name-field').fill(acct.name.toLowerCase());
  await s.locator('.chip.avatar-pick').nth(2).click();
  const checkP = fnResponse(page, 'signup');
  await s.locator('#next-btn').click();
  const check = await bodyOf(await checkP);
  const stickers = s.locator('.name-sticker');
  const note1 = s.locator('#signup-context-note');
  // What this server says about the same name in other capitals.
  const taken = await stickers.first().isVisible({ timeout: 8_000 }).catch(() => false)
    || await note1.isVisible().catch(() => false);
  const onPin = await s.locator('#stage-pin').isVisible();
  note('old.signup.otherCapitals.check', { typed: acct.name.toLowerCase(), check, refused: !onPin, noteText: taken ? await note1.innerText().catch(() => '') : '' });
  await shot(page, '02-taken-name-other-capitals');

  let tried: string;
  if (!onPin) {
    await expect(stickers).toHaveCount(3, { timeout: 15_000 });
    tried = (await stickers.first().innerText()).trim();
    await stickers.first().click();
  } else {
    // This server let the same name in other capitals through: go back
    // and use a different one, so the run can still reach the last step.
    await s.locator('#stage-pin [data-back-sticker]').click();
    tried = `Rowan${letters(5)}`;
    await s.locator('.name-field').fill(tried);
  }
  const r = await (async () => {
    const checkP2 = fnResponse(page, 'signup');
    await s.locator('#next-btn').click();
    const check2 = await bodyOf(await checkP2);
    await expect(s.locator('#stage-pin')).toBeVisible({ timeout: 15_000 });
    await typePin(s, '#stage-pin', PIN);
    await expect(s.locator('#pin-subtitle')).toHaveText(/again/);
    await expect(s.locator('#stage-pin .pin-dot.filled')).toHaveCount(0);
    await typePin(s, '#stage-pin', PIN);
    await expect(s.locator('#stage-hint')).toBeVisible({ timeout: 15_000 });
    await s.locator('#hint-input').fill('the name of my cat');
    await s.locator('#hint-next-btn').click();
    const signupP = fnResponse(page, 'signup');
    await s.locator('#hint-safe-btn').click();
    const res = await signupP;
    return { check2, status: res.status(), body: redact(await bodyOf(res)) };
  })();
  note('old.signup.suggestedName', { name: tried, ...r });
  // Usually the name is one the server itself offered and nobody holds, and
  // it is still refused: what is missing is the flag, not the name. The old
  // screens never send `readyMadeName`, so an offered name ends here too,
  // after the number and the clue. See the first test.
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ code: 'name_not_offered' });
  expect(await session(page), 'the refused child is not signed in').toBeNull();
  await finish(d, 'old.signup.otherCapitals');
});

test('old: signs in from a saved name in other capitals', async ({ browser }) => {
  for (const variant of [acct.name.toLowerCase(), acct.name.toUpperCase()]) {
    const d = await device(browser, OLD);
    const { page } = d;
    await rememberOnDevice(page, [variant]);
    const loginP = fnResponse(page, 'login');
    const login = await oldSignInFromChip(page, variant);
    const lr = await loginP;
    const body = redact(await bodyOf(lr));
    await page.waitForTimeout(1500);
    const sess = await session(page);
    const err = lr.status() === 200 ? '' : await login.locator('#login-error-msg').innerText({ timeout: 3_000 }).catch(() => '');
    const remembered = await page.evaluate(() => localStorage.getItem('arc_remembered_usernames'));
    note(`old.login.otherCapitals.${variant === acct.name.toLowerCase() ? 'lower' : 'upper'}`, {
      typed: variant, status: lr.status(), body, signedInAs: sess?.username ?? null, errorShown: err, remembered,
    });
    if (lr.status() !== 200) await shot(page, `03-other-capitals-${variant}`);
    await finish(d, `old.login.otherCapitals.${variant === acct.name.toLowerCase() ? 'lower' : 'upper'}`);
  }
});

test('old: a wrong PIN, then the forgot-PIN clue', async ({ browser }) => {
  const d = await device(browser, OLD);
  const { page } = d;
  await rememberOnDevice(page, [acct.name]);
  const loginP = fnResponse(page, 'login');
  const login = await oldSignInFromChip(page, acct.name, WRONG_PIN);
  const lr = await loginP;
  const errEl = login.locator('#login-error-msg');
  await expect(errEl).toHaveClass(/show/, { timeout: 10_000 });
  const shown = (await errEl.innerText()).trim();
  note('old.wrongPin', { status: lr.status(), body: await bodyOf(lr), shown });
  await shot(page, '04-wrong-pin');
  expect(await session(page)).toBeNull();

  const hintP = fnResponse(page, 'get-pin-hint');
  const forgot = login.locator('#forgot-pin-btn');
  if (!(await forgot.isVisible())) await login.locator('#stage-pin [data-back-sticker]').click();
  await forgot.click();
  const hr = await hintP;
  const hint = await bodyOf(hr);
  const card = screen(page, 'forgot-pin').locator('#hint-card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  note('old.forgotPin', {
    status: hr.status(), body: hint,
    card: (await card.innerText()).trim(),
    subtitle: (await screen(page, 'forgot-pin').locator('#hint-subtitle').innerText({ timeout: 3_000 }).catch(() => '')).trim(),
  });
  await shot(page, '05-forgot-pin');
  await finish(d, 'old.wrongPin');
});

test('old: plays, saves, reloads and gets the save back, also on a new device', async ({ browser }) => {
  const d = await device(browser, OLD);
  const { page } = d;
  await rememberOnDevice(page, [acct.name]);
  await oldSignInFromChip(page, acct.name);
  await expect(screen(page, 'menu').locator('#continue-btn')).toBeVisible({ timeout: 30_000 });

  const saves: Array<{ status: number; body: unknown }> = [];
  page.on('response', async (r) => {
    if (r.url().endsWith('/functions/v1/save-game') && r.request().method() === 'POST') {
      saves.push({ status: r.status(), body: await bodyOf(r) });
    }
  });
  await playIntoGame(page);
  await page.waitForTimeout(4000);
  const naturalSaves = saves.length;
  await shot(page, '06-in-game');

  // A change the reload must bring back: a number in the economy, saved
  // through the game's own save path.
  const pickedField = await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: { scene: { getScene: (k: string) => Record<string, unknown> } } }).__PHASER_GAME__;
    const gs = g.scene.getScene('GameScene') as unknown as { store: { economy: Record<string, unknown> } };
    const [k, v] = Object.entries(gs.store.economy).find(([, v]) => typeof v === 'number') ?? [];
    return k ? { k, v } : null;
  });
  expect(pickedField, 'the economy has a number to change').not.toBeNull();
  saved.field = pickedField!.k;
  saved.value = 4000 + Math.floor(Math.random() * 900);
  const saveP = fnResponse(page, 'save-game');
  await page.evaluate(({ k, v }) => {
    const g = (window as unknown as { __PHASER_GAME__: { scene: { getScene: (k: string) => Record<string, unknown> } } }).__PHASER_GAME__;
    const gs = g.scene.getScene('GameScene') as unknown as { store: { economy: Record<string, unknown> }; saveState: () => Promise<void> };
    gs.store.economy[k] = v;
    return gs.saveState();
  }, { k: saved.field, v: saved.value });
  const sr = await saveP;
  const saveBody = await bodyOf(sr);
  expect(sr.status()).toBe(200);

  // Reload: the same device, signed in.
  const loadP = fnResponse(page, 'load-game');
  await page.reload();
  const lr = await loadP;
  const loaded = await bodyOf(lr) as { save?: { state?: { economy?: Record<string, unknown> }; version?: number }; stats?: unknown };
  await waitForScene(page, 'MainMenuScene', 30_000);
  await expect(screen(page, 'menu').locator('#continue-btn')).toBeVisible({ timeout: 30_000 });
  note('old.save', {
    naturalSavesBeforeOurs: naturalSaves, naturalSaves: saves.slice(0, naturalSaves),
    field: saved.field, value: saved.value, saveStatus: sr.status(), saveBody,
    reloadLoadStatus: lr.status(), reloadedValue: loaded?.save?.state?.economy?.[saved.field], reloadedVersion: loaded?.save?.version,
    extraKeys: Object.keys(loaded ?? {}),
  });
  expect(loaded?.save?.state?.economy?.[saved.field]).toBe(saved.value);
  await shot(page, '07-after-reload-menu');
  await finish(d, 'old.save');

  // A new device: nothing local, so the shelter can only come from the server.
  const d2 = await device(browser, OLD);
  await rememberOnDevice(d2.page, [acct.name]);
  const load2P = fnResponse(d2.page, 'load-game');
  await oldSignInFromChip(d2.page, acct.name);
  const l2 = await bodyOf(await load2P) as { save?: { state?: { economy?: Record<string, unknown> } } };
  await waitForScene(d2.page, 'MainMenuScene', 30_000);
  await expect(screen(d2.page, 'menu').locator('#continue-btn')).toBeVisible({ timeout: 30_000 });
  const readStore = () => d2.page.evaluate((k) => {
    const g = (window as unknown as { __PHASER_GAME__: { scene: { getScene: (k: string) => Record<string, unknown> } } }).__PHASER_GAME__;
    const mm = g.scene.getScene('MainMenuScene') as unknown as { store?: { economy: Record<string, unknown> } };
    return mm.store?.economy?.[k];
  }, saved.field);
  await expect.poll(readStore, { timeout: 15_000 }).toBe(saved.value).catch(() => {});
  const inStore = await readStore();
  note('old.save.newDevice', { loadedValue: l2?.save?.state?.economy?.[saved.field], inStore });
  expect(inStore).toBe(saved.value);
  await finish(d2, 'old.save.newDevice');
});

test('old: the friends screen and the village hall', async ({ browser }) => {
  const d = await device(browser, OLD);
  const { page } = d;
  await rememberOnDevice(page, [acct.name]);
  await oldSignInFromChip(page, acct.name);
  const menu = screen(page, 'menu');
  await expect(menu.locator('#continue-btn')).toBeVisible({ timeout: 30_000 });

  await menu.locator('#friends-btn').click();
  const friends = screen(page, 'friends');
  await expect(friends.locator('#back-btn')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const friendsText = (await friends.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 600);
  await shot(page, '08-friends-screen');
  const callsAtFriends = [...d.calls];
  await friends.locator('#back-btn').click();
  await expect(menu.locator('#continue-btn')).toBeVisible({ timeout: 15_000 });

  // The village hall. The map drive there is not what is being tested, so
  // the scene is opened the way the drive's arrival opens it.
  const before = d.calls.length;
  await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: { scene: { getScene: (k: string) => { scene: { start: (k: string) => void } } } } }).__PHASER_GAME__;
    g.scene.getScene('MainMenuScene').scene.start('SocialScene');
  });
  await waitForScene(page, 'SocialScene', 30_000);
  await page.waitForTimeout(3000);
  const inbox = await sceneTexts(page, 'SocialScene');
  const hallCalls = d.calls.slice(before);
  await shot(page, '09-village-hall-inbox');

  await clickCanvasText(page, 'SocialScene', 'Send');
  await page.waitForTimeout(800);
  const send = await sceneTexts(page, 'SocialScene');
  await shot(page, '10-village-hall-send');

  await clickCanvasText(page, 'SocialScene', 'Board');
  await page.waitForTimeout(2000);
  const board = await sceneTexts(page, 'SocialScene');
  await shot(page, '11-village-hall-board');

  await clickCanvasText(page, 'SocialScene', 'Share');
  await page.waitForTimeout(800);
  const csP = fnResponse(page, 'create-showcase');
  await clickCanvasText(page, 'SocialScene', 'Create Showcase Link');
  const cs = await csP;
  const csBody = await bodyOf(cs);
  await page.waitForTimeout(1500);
  const share = await sceneTexts(page, 'SocialScene');
  await shot(page, '12-village-hall-share');

  // The old client's getShowcase reads `snapshot.username`; nothing in its
  // screens calls it, but record what it would get.
  const token = (csBody as { token?: string })?.token;
  let showcase: unknown = null;
  if (token) {
    const r = await page.request.post(`${API}/functions/v1/get-showcase`, {
      headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}`, 'Content-Type': 'application/json' },
      data: { token },
    });
    showcase = { status: r.status(), body: await bodyOf(r) };
  }
  note('old.social', {
    friendsScreenText: friendsText, callsAtFriends,
    hallCalls, inboxTexts: inbox, sendTexts: send, boardTexts: board, shareTexts: share,
    createShowcase: { status: cs.status(), body: csBody }, getShowcase: showcase,
  });
  expect(cs.status()).toBe(200);
  await finish(d, 'old.social');
});

test('old: friend and gift calls, exactly as the old client makes them', async ({ request }) => {
  const key = anonKey();
  const base = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const fn = async (name: string, data: unknown, token?: string) => {
    const r = await request.post(`${API}/functions/v1/${name}`, {
      headers: token ? { ...base, 'x-arc-session': token } : base, data,
    });
    // Replies are read loosely on purpose: the point is what the old client would find.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: r.status(), body: await bodyOf(r) as Record<string, any> };
  };
  const rest = async (pathAndQuery: string) => {
    const r = await request.get(`${API}/rest/v1/${pathAndQuery}`, { headers: base });
    return { status: r.status(), body: await bodyOf(r) };
  };

  // The friend: a second account, made through the list like the first.
  acct2.name = await makeAccount();

  const a = await fn('login', { username: acct.name, pin: PIN });
  const b = await fn('login', { username: acct2.name, pin: PIN });
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  const A = a.body.session, B = b.body.session;

  const addFriend = await fn('add-friend', { joinCode: B.joinCode }, A.token);
  const friends = await rest(`friendships?select=friend:users!friendships_friend_id_fkey(id,username,avatar_emoji,avatar_bg_colour)&user_id=eq.${A.userId}`);
  // `thanks` ("Thanks for being my friend!") is a line the gift screen has
  // offered since the first build; send-gift takes only the fifteen on that
  // screen (_shared/gift-messages.ts). This used to send `thank_you`, which
  // no client ever offered (it first appears in this suite) and the server
  // now refuses.
  const sendGift = await fn('send-gift', { toUserId: B.userId, giftType: 'toy', messagePresetCode: 'thanks' }, A.token);
  const inbox = await rest(`gifts?select=id,gift_type,message_preset_code,sent_at,sender:users!gifts_from_user_fkey(username,avatar_emoji)&to_user=eq.${B.userId}&claimed_at=is.null&order=sent_at.desc`);
  const giftId = sendGift.body?.gift?.id;
  const claim = giftId ? await fn('claim-gift', { giftId }, B.token) : { status: 0, body: { skipped: 'no gift id' } };
  const boardFriendships = await rest(`friendships?select=friend_id&user_id=eq.${A.userId}`);
  const boardStats = await rest(`rescue_stats?select=total_rescued,user:users!rescue_stats_user_id_fkey(username,avatar_emoji)&user_id=in.(${A.userId},${B.userId})&order=total_rescued.desc&limit=20`);
  const boardLevels = await rest(`game_states?select=user_id,level&user_id=in.(${A.userId},${B.userId})`);
  // Dead code in the live screens (USE_OVERLAY is true), recorded for completeness.
  const pickerPool = await rest('username_pool?select=username&claimed_at=is.null&limit=50');
  const searchNames = await rest(`users?select=username&username=ilike.*${acct.name.slice(0, 4)}*&is_active=eq.true&limit=10`);

  note('old.api', {
    addFriend: { status: addFriend.status, body: redact(addFriend.body), oldReads: { 'friend.username': addFriend.body?.friend?.username ?? null } },
    getFriends: friends,
    sendGift: { status: sendGift.status, body: sendGift.body },
    getGiftInbox: inbox,
    claimGift: { status: claim.status, body: claim.body, oldReads: { 'gift.giftType': claim.body?.gift?.giftType ?? null } },
    leaderboard: { friendships: boardFriendships, rescueStats: boardStats, gameStates: boardLevels },
    deadCode: { getAvailableUsernames: pickerPool, searchUsername: searchNames },
  });
  expect(addFriend.status).toBe(200);
  expect(sendGift.status).toBe(200);
  expect(claim.status).toBe(200);
});

// ════════════════════════════════════════════════════════════════════
// Across the move: the new client
// ════════════════════════════════════════════════════════════════════

test('new: an account made by the old client signs in by typing its name, and gets its save back', async ({ browser }) => {
  test.skip(!NEW, 'ARC_NEW_URL not set');
  const d = await device(browser, NEW);
  const { page } = d;
  await page.goto('/');
  await waitForGameReady(page, 60_000);
  await screen(page, 'welcome').getByRole('button', { name: 'I already have an account' }).click();
  const login = screen(page, 'login');
  await login.locator('#type-name-btn').click();
  await login.locator('#login-name-field').fill(acct.name.toLowerCase());
  await login.locator('#name-next-btn').click();
  const loginP = fnResponse(page, 'login');
  const loadP = fnResponse(page, 'load-game');
  await typePin(login, '#stage-pin', PIN);
  const lr = await loginP;
  const lg = await loadP;
  const loaded = await bodyOf(lg) as { save?: { state?: { economy?: Record<string, unknown> } } };
  await expect.poll(async () => (await session(page))?.username, { timeout: 30_000 }).toBe(acct.name);
  await waitForScene(page, 'MainMenuScene', 30_000);
  const readStore = () => page.evaluate((k) => {
    const g = (window as unknown as { __PHASER_GAME__: { scene: { getScene: (k: string) => Record<string, unknown> } } }).__PHASER_GAME__;
    const mm = g.scene.getScene('MainMenuScene') as unknown as { store?: { economy: Record<string, unknown> } };
    return mm.store?.economy?.[k];
  }, saved.field);
  await expect.poll(readStore, { timeout: 15_000 }).toBe(saved.value).catch(() => {});
  const inStore = await readStore();
  await shot(page, '13-new-client-signed-in');
  note('new.continuity', {
    typed: acct.name.toLowerCase(), loginStatus: lr.status(), login: redact(await bodyOf(lr)),
    loadStatus: lg.status(), loadedValue: loaded?.save?.state?.economy?.[saved.field], inStore, expected: saved.value,
  });
  expect(inStore).toBe(saved.value);
  await finish(d, 'new.continuity');
});

test('both ways: an account made on the new client signs in on the old one and shows its clue', async ({ browser }) => {
  test.skip(!NEW, 'ARC_NEW_URL not set');
  const d = await device(browser, NEW);
  const { page } = d;
  await page.goto('/');
  await waitForGameReady(page, 60_000);
  await screen(page, 'welcome').getByRole('button', { name: 'New? Create account' }).click();
  const signup = screen(page, 'signup');
  const cards = signup.locator('.sign-in-name-card');
  await expect(cards).toHaveCount(3, { timeout: 20_000 });
  await cards.first().click();
  newAcct.name = (await cards.first().innerText()).trim();
  await signup.locator('#next-btn').click();
  await expect(signup.locator('#stage-pin')).toBeVisible({ timeout: 15_000 });
  await typePin(signup, '#stage-pin', PIN);
  await expect(signup.locator('#pin-subtitle')).toHaveText(/again/);
  await expect(signup.locator('#stage-pin .pin-dot.filled')).toHaveCount(0);
  await typePin(signup, '#stage-pin', PIN);
  await expect(signup.locator('#stage-hint')).toBeVisible();
  const clue = signup.locator('.clue-card').first();
  newAcct.clue = (await clue.innerText()).trim();
  await clue.click();
  await signup.locator('#hint-next-btn').click();
  await expect(signup.locator('#stage-name')).toBeVisible();
  await signup.locator('#next-btn').click();
  await expect.poll(async () => (await session(page))?.username, { timeout: 30_000 }).toBe(newAcct.name);
  await finish(d, 'new.signup');

  const o = await device(browser, OLD);
  await rememberOnDevice(o.page, [newAcct.name]);
  const loginP = fnResponse(o.page, 'login');
  await oldSignInFromChip(o.page, newAcct.name);
  const lr = await loginP;
  await expect.poll(async () => (await session(o.page))?.username, { timeout: 30_000 }).toBe(newAcct.name);
  await expect(screen(o.page, 'menu').locator('#continue-btn')).toBeVisible({ timeout: 30_000 });
  await finish(o, 'old.signsInNewAccount');

  // The old forgot-PIN screen, as the server answers it, then with the
  // answer held back 800 ms: the old ForgotPinScene posts the clue to an
  // iframe that may not be listening yet (fixed on the new client, 957c6cc).
  const forgotCard = async (delayMs: number) => {
    const o2 = await device(browser, OLD);
    if (delayMs) {
      await o2.ctx.route('**/functions/v1/get-pin-hint', async (route) => {
        await new Promise((r) => setTimeout(r, delayMs));
        await route.continue();
      });
    }
    await rememberOnDevice(o2.page, [newAcct.name]);
    await o2.page.goto('/');
    await waitForGameReady(o2.page, 60_000);
    await screen(o2.page, 'welcome').getByRole('button', { name: 'I already have an account' }).click();
    const login = screen(o2.page, 'login');
    await login.locator('.chip', { hasText: newAcct.name }).click();
    const hintP = fnResponse(o2.page, 'get-pin-hint');
    const forgot = login.locator('#forgot-pin-btn');
    if (!(await forgot.isVisible())) await login.locator('#stage-pin [data-back-sticker]').click();
    await forgot.click();
    const hr = await hintP;
    const card = screen(o2.page, 'forgot-pin').locator('#hint-card');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await o2.page.waitForTimeout(2500);
    const shown = (await card.innerText()).trim();
    await shot(o2.page, `14-old-client-clue-for-new-account-delay${delayMs}`);
    const body = await bodyOf(hr) as { hint?: string | null };
    await finish(o2, `old.clueForNewAccount.delay${delayMs}`);
    return { status: hr.status(), body, shown };
  };
  const quick = await forgotCard(0);
  const slow = await forgotCard(800);
  note('both.newAccountOnOld', { name: newAcct.name, clue: newAcct.clue, loginStatus: lr.status(), quick, slow });
  expect(quick.body.hint).toBe(newAcct.clue);
  expect(slow.shown).toBe(newAcct.clue);
});
