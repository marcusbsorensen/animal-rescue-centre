import { test, expect, type Page, type FrameLocator, type BrowserContext } from '@playwright/test';
import { waitForGameReady, waitForScene, installSession, type ArcSession } from './helpers';

/**
 * The account flows end to end, on a LOCAL Supabase stack only.
 *
 * A child signs up with a ready-made secret name, signs in again on the
 * same device, finds the clue for her number, signs in on a new device by
 * typing her secret name in other capitals (131A, hub 96), and deletes
 * the account. Then two players become friends, one removes the other from
 * the friends screen (146A), and they add each other again. Every step goes
 * through the real Edge Functions and the real database, and every step a
 * child takes goes through the real screens, which is why this never runs
 * against production: nobody makes accounts there (a court order means a
 * police notification for each one).
 *
 * Skipped unless ARC_E2E_LOCAL_STACK=1. To run it:
 *   1. `supabase start` in a workdir that is NOT linked to a project, with
 *      `supabase functions serve` and RATE_LIMIT_ADDRESS_KEY set;
 *   2. a dev server whose VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are
 *      the local stack's (env overrides beat apps/game/.env.local);
 *   3. ARC_E2E_LOCAL_STACK=1 ARC_E2E_BASE_URL=http://127.0.0.1:<port> \
 *        ARC_BROWSER_CHANNEL=chrome pnpm exec playwright test e2e/account-local.spec.ts
 *   The friends steps also call the local functions and read the local
 *   database directly, so they need the stack's address and its two keys
 *   (`supabase status -o env`): ARC_E2E_SUPABASE_URL (default
 *   http://127.0.0.1:54321), ARC_E2E_SUPABASE_ANON_KEY and
 *   ARC_E2E_SUPABASE_SERVICE_KEY.
 *
 * Any request to a hosted Supabase project (*.supabase.co) is blocked and
 * fails the run, so a dev server pointed at production cannot make an
 * account by accident. The test's own calls go only to an address on this
 * machine: any other ARC_E2E_SUPABASE_URL stops the run before it starts.
 */

const LOCAL = process.env.ARC_E2E_LOCAL_STACK === '1';
const PIN = '4821';
const API = new URL(process.env.ARC_E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321');
if (LOCAL && !['127.0.0.1', 'localhost', '[::1]'].includes(API.hostname)) {
  throw new Error(`ARC_E2E_SUPABASE_URL must be a local stack on this machine, not ${API.hostname}`);
}

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
    if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && u.port === API.port) seen.local.push(u.pathname);
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

// ── Friends: remove a friend (146A) ──────────────────────────────────────
//
// Two players make accounts and become friends through the local functions,
// as their devices would. Everything a child does after that is on the
// friends screen: open it, choose Remove on a card, choose Keep, then Remove
// for real. The gift checks read the local database with its service key.

const ANON = process.env.ARC_E2E_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.ARC_E2E_SUPABASE_SERVICE_KEY ?? '';

type Player = ArcSession & { displayName: string };
const pair: { a: Player | null; b: Player | null } = { a: null, b: null };
/** A's gift to Bo, never claimed; Bo's gift to A, claimed before the removal. */
const gifts = { waiting: '', claimed: '' };
const devices: { a: BrowserContext | null; b: BrowserContext | null } = { a: null, b: null };
let removedAt = '';
/** What each device's guard saw; hosted Supabase must stay empty. */
const watched: Array<{ hosted: string[]; local: string[] }> = [];

/** One of the local Edge Functions, as the game calls it. */
async function call(name: string, body: Record<string, unknown>, token?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${API.origin}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
      ...(token ? { 'x-arc-session': token } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Rows from the local database, read past the rules with the service key. */
async function rows(table: string, query: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${API.origin}/rest/v1/${table}?${query}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  expect(res.status, `${table}?${query}`).toBe(200);
  return (await res.json()) as Array<Record<string, unknown>>;
}

async function newPlayer(): Promise<Player> {
  // The name has to come off the list: signup refuses a typed one, because
  // arcgame.app tells parents that players pick a name from a list and the
  // server now holds to that. So ask for three and take one, which is what
  // the name screen does.
  const offer = await call('signup', { offerNames: true });
  expect(offer.status, JSON.stringify(offer.json)).toBe(200);
  const [name] = offer.json.names as string[];
  expect(name, 'the pool offered no names — is it seeded?').toBeTruthy();

  const r = await call('signup', {
    username: name, readyMadeName: true, pin: PIN, avatarEmoji: '🦊', avatarBgColour: '#ffd0a0',
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json.session as Player;
}

/** The friends screen, on a device where this player is signed in. */
async function openFriends(device: BrowserContext, who: Player): Promise<{ page: Page; friends: FrameLocator }> {
  const page = device.pages()[0] ?? await device.newPage();
  if (!page.url().startsWith('http')) {
    watched.push(await guard(page));
    await installSession(page, who);
    await page.goto('/');
    await waitForGameReady(page, 60_000);
  } else {
    // Back from the friends screen to the menu, as a child would.
    await screen(page, 'friends').locator('#back-btn').click();
  }
  await screen(page, 'menu').locator('#friends-btn').click({ timeout: 30_000 });
  return { page, friends: screen(page, 'friends') };
}

/** A friend's card, found by the name on it. */
const card = (friends: FrameLocator, who: Player) => friends.getByRole('group', { name: who.displayName, exact: true });

/** The words of an element, without the zero-width breaks in a display name. */
async function words(loc: ReturnType<FrameLocator['locator']>): Promise<string> {
  return ((await loc.textContent()) ?? '').replace(/​/g, '').trim();
}

test.describe('friends: remove a friend (146A)', () => {
  test.skip(LOCAL && (!ANON || !SERVICE), 'set ARC_E2E_SUPABASE_ANON_KEY and ARC_E2E_SUPABASE_SERVICE_KEY to the local stack\'s keys');

  test('two players become friends by code, and each sees the other on the friends screen', async ({ browser }) => {
    pair.a = await newPlayer();
    pair.b = await newPlayer();
    const { a, b } = pair as { a: Player; b: Player };
    expect((await call('add-friend', { joinCode: b.joinCode }, a.token)).status).toBe(200);

    // A gift each way before the removal: A's waits in Bo's inbox, and Bo's
    // to A is claimed.
    const waiting = await call('send-gift', { toUserId: b.userId, giftType: 'toy', messagePresetCode: 'hi' }, a.token);
    expect(waiting.status, JSON.stringify(waiting.json)).toBe(200);
    gifts.waiting = (waiting.json.gift as { id: string }).id;
    const toA = await call('send-gift', { toUserId: a.userId, giftType: 'treat_bundle', messagePresetCode: 'hi' }, b.token);
    gifts.claimed = (toA.json.gift as { id: string }).id;
    expect((await call('claim-gift', { giftId: gifts.claimed }, a.token)).status).toBe(200);

    devices.a = await browser.newContext();
    devices.b = await browser.newContext();
    const onA = await openFriends(devices.a, a);
    await expect(card(onA.friends, b)).toBeVisible({ timeout: 20_000 });
    const onB = await openFriends(devices.b, b);
    await expect(card(onB.friends, a)).toBeVisible({ timeout: 20_000 });
  });

  test('one removes the other: Keep keeps them, Remove removes them for both', async () => {
    const { a, b } = pair as { a: Player; b: Player };
    const { friends } = await openFriends(devices.a!, a);
    const bo = card(friends, b);
    await expect(bo).toBeVisible({ timeout: 20_000 });

    // The question, with Keep ready to press.
    await bo.getByRole('button', { name: `Remove ${b.displayName} from your friends` }).click();
    await expect(friends.locator('.confirm-question')).toBeVisible();
    expect(await words(friends.locator('.confirm-question'))).toBe(`Remove ${b.displayName} from your friends?`);
    const keep = bo.getByRole('button', { name: 'Keep', exact: true });
    await expect(keep).toBeFocused();
    await keep.click();
    await expect(friends.locator('.confirm-question')).toHaveCount(0);
    await expect(bo.getByRole('button', { name: `Remove ${b.displayName} from your friends` })).toBeVisible();

    // And again, this time Remove.
    await bo.getByRole('button', { name: `Remove ${b.displayName} from your friends` }).click();
    removedAt = new Date(Date.now() - 5_000).toISOString();
    await bo.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(bo).toHaveCount(0, { timeout: 20_000 });
    await expect(friends.locator('.friends-empty-line1')).toHaveText('No friends here yet!');

    // Bo opens his friends screen again, and A has gone from it too.
    const onB = await openFriends(devices.b!, b);
    await expect(onB.friends.locator('.friends-empty-line1')).toHaveText('No friends here yet!', { timeout: 20_000 });
    await expect(card(onB.friends, a)).toHaveCount(0);
  });

  test('the gift waiting for Bo went with the friendship; the claimed one stayed', async () => {
    const { a, b } = pair as { a: Player; b: Player };
    // Bo cannot claim it: it is not there.
    const claim = await call('claim-gift', { giftId: gifts.waiting }, b.token);
    expect(claim.status).toBe(404);
    expect(await rows('gifts', `id=eq.${gifts.waiting}&select=id`)).toEqual([]);
    // Bo's gift to A was in A's game already, and its row is the record of it.
    const [kept] = await rows('gifts', `id=eq.${gifts.claimed}&select=from_user,to_user,claimed_at`);
    expect(kept).toMatchObject({ from_user: b.userId, to_user: a.userId });
    expect(kept.claimed_at).not.toBeNull();
    // Nor can a gift go now.
    const late = await call('send-gift', { toUserId: b.userId, giftType: 'toy', messagePresetCode: 'hi' }, a.token);
    expect(late.status).toBe(403);
    // One log line, in counts: no id, no name, no code.
    const log = await rows('audit_log', `action=eq.friend_removed&created_at=gte.${encodeURIComponent(removedAt)}&select=user_id,target_id,metadata`);
    expect(log).toEqual([{ user_id: null, target_id: null, metadata: { removed: { friendships: 2, gifts_unclaimed: 1 } } }]);
    // Removing again is harmless, and says the same.
    const again = await call('remove-friend', { friendId: b.userId }, a.token);
    expect(again).toEqual({ status: 200, json: { removed: true } });
  });

  test('they can add each other again, and both screens show it', async () => {
    const { a, b } = pair as { a: Player; b: Player };
    // This time Bo types A's code.
    expect((await call('add-friend', { joinCode: a.joinCode }, b.token)).status).toBe(200);
    const onA = await openFriends(devices.a!, a);
    await expect(card(onA.friends, b)).toBeVisible({ timeout: 20_000 });
    const onB = await openFriends(devices.b!, b);
    await expect(card(onB.friends, a)).toBeVisible({ timeout: 20_000 });
    // And gifts go between them again.
    expect((await call('send-gift', { toUserId: b.userId, giftType: 'toy', messagePresetCode: 'hi' }, a.token)).status).toBe(200);

    // Done: both accounts go, by the same path a child uses, and with them
    // the friendship and the gift.
    for (const p of [a, b]) expect((await call('delete-account', { pin: PIN }, p.token)).status).toBe(200);
    expect(await rows('friendships', `user_id=in.(${a.userId},${b.userId})&select=user_id`)).toEqual([]);
    await devices.a!.close();
    await devices.b!.close();
    devices.a = devices.b = null;
    // Nothing went to a hosted project, and the screens used the local one.
    expect(watched.flatMap((w) => w.hosted)).toEqual([]);
    const local = watched.flatMap((w) => w.local);
    expect(local.filter((path) => path.endsWith('/functions/v1/get-friends')).length).toBeGreaterThanOrEqual(5);
    expect(local.filter((path) => path.endsWith('/functions/v1/remove-friend'))).toHaveLength(1);
  });
});
