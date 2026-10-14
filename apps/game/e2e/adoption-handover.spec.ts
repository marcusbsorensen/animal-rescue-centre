import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { waitForGameReady, waitForScene } from './helpers';

/**
 * One real adoption, played end to end: the picker, the hand-over
 * conversation, the ceremony, the commit. It is played once at a sideways
 * phone (844x390) and once at an iPad (1024x768), each at its own size from
 * the first frame (a window resized mid-game is a different, stale layout, and
 * restarts the scene), and every beat is photographed.
 *
 * Nothing leaves the machine. The session is a fake one (the same shape
 * helpers.seedFakeSession writes), the shelter is a first-time player's with
 * one seeded animal, and every request to Supabase is answered here: the load
 * says "no save yet", and anything else is refused. The test fails if the page
 * tried to reach any other service.
 *
 * Why a fake session and not mintRealSession: minting logs a real account in
 * against the live project. The price is that nothing here exercises the
 * server; the adoption itself is local game logic, so nothing is lost.
 *
 *   ARC_E2E_BASE_URL=http://localhost:5173 ARC_BROWSER_CHANNEL=chrome \
 *   ARC_SHOTS_DIR=/some/folder \
 *     pnpm --filter @arc/game exec playwright test e2e/adoption-handover.spec.ts
 */

const PHONE = { width: 844, height: 390 };
const TABLET = { width: 1024, height: 768 };

const ANIMAL = {
  id: 'e2e-pumpkin', name: 'Pumpkin', species: 'cat', variant: 'ginger',
  state: 'bonding', arrivalStory: 'Found under a hedge in the rain.',
  hunger: 30, tiredness: 20, happiness: 85, health: 95,
  bondLevel: 70, cleanliness: 80, roomId: 'room-cat',
};

interface Rect { x: number; y: number; w: number; h: number }
interface Snapshot {
  beat: number; beatCount: number; viewport: { w: number; h: number }; side: 'left' | 'right'; role: 'warden' | 'guest';
  speakerId: string; lineId: string | null; text: string; portrait: Rect; box: Rect; skip: Rect; choices: Rect[];
  words: Array<{ text: string; kind: 'animal' | 'person' | null }>;
}

type PhaserGame = {
  scene: {
    getScene: (k: string) => Record<string, unknown> | null;
    scenes: Array<{ sys: { settings: { key: string; active: boolean } } }>;
    start: (k: string) => void;
    stop: (k: string) => void;
  };
};

const shotsDir = (): string => {
  const dir = process.env.ARC_SHOTS_DIR ?? test.info().outputPath('shots');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/** Photograph the current screen. */
async function shoot(page: Page, name: string, size: { width: number; height: number }): Promise<void> {
  await page.screenshot({ path: path.join(shotsDir(), `${name}-${size.width}x${size.height}.png`) });
}

async function dialogueSnapshot(page: Page): Promise<Snapshot | null> {
  return page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    const gs = g.scene.getScene('GameScene') as { children: { getByName: (n: string) => { getData: (k: string) => unknown } | null } } | null;
    return (gs?.children.getByName('dialogue-root')?.getData('snapshot') as never) ?? null;
  });
}

async function waitForBeat(page: Page, beat: number): Promise<Snapshot> {
  await page.waitForFunction(
    (n) => {
      const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
      const gs = g.scene.getScene('GameScene') as { children: { getByName: (n: string) => { getData: (k: string) => { beat: number } } | null } } | null;
      return gs?.children.getByName('dialogue-root')?.getData('snapshot')?.beat === n;
    },
    beat,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(350);
  return (await dialogueSnapshot(page))!;
}

interface Booted {
  before: { coins: number };
  external: string[];
  supabaseSeen: string[];
}

/**
 * Boot the game into a first-time player's shelter at `size`, with one animal
 * in it and every Supabase request answered here.
 */
async function bootShelter(page: Page, size: { width: number; height: number }): Promise<Booted> {
  // ── Keep everything on the machine ──
  const external: string[] = [];
  const supabaseSeen: string[] = [];
  await page.route(
    (url) => url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in'),
    async (route) => {
      const url = route.request().url();
      supabaseSeen.push(`${route.request().method()} ${new URL(url).pathname}`);
      if (url.includes('/functions/v1/load-game')) {
        // A first-time player: no save, no stats.
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ save: null }) });
      } else {
        await route.abort('blockedbyclient');
      }
    },
  );
  // Sound is off for this run. The music tracks decode to about half a gigabyte
  // in the page, and nothing in this flow listens to them.
  await page.route(/\.(mp3|ogg|wav)(\?.*)?$/, (route) => route.abort());
  page.on('request', (req) => {
    const u = new URL(req.url());
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:';
    // Web fonts carry no player data; everything else off the machine is reported.
    const font = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
    if (!local && !font && !u.hostname.endsWith('.supabase.co')) external.push(req.url());
  });

  // ── A fake session, past the login gate and the intro ──
  await page.addInitScript(() => {
    localStorage.setItem('arc_session', JSON.stringify({
      userId: '00000000-0000-0000-0000-000000000001',
      username: 'TestKid',
      avatarEmoji: '🦊',
      avatarBgColour: '#BAE1FF',
      joinCode: 'TEST-0001',
      token: 'playwright-fake-token',
    }));
    localStorage.setItem('arc_skip_intro', 'true');
    localStorage.setItem('arc_intro_played', '1');
  });

  await page.setViewportSize(size);
  await page.goto('/');
  await waitForGameReady(page);
  await page.waitForTimeout(1500);

  // GameScene, the way ux-review gets there.
  await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    for (const s of g.scene.scenes) {
      if (s.sys.settings.active) { try { g.scene.stop(s.sys.settings.key); } catch { /* ignore */ } }
    }
    g.scene.start('GameScene');
  });
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(2500);

  // A new shelter greets its player with an arrival popup. Dismiss it the way a
  // player would, so the adoption happens on a clear screen.
  const arrival = page.frameLocator('iframe[aria-label="A.R.C. arrival"]');
  const gentle = arrival.getByText('Give them space');
  if (await gentle.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true, () => false)) {
    await gentle.click();
    await page.waitForFunction(() => !document.querySelector('iframe[aria-label="A.R.C. arrival"]'), null, { timeout: 5_000 });
  }

  // A shelter with one animal in it, and no earlier adoptions.
  const before = await page.evaluate((animal) => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    const gs = g.scene.getScene('GameScene') as { store: { animals: unknown[]; rehomed: unknown[]; economy: { coins: number } } };
    gs.store.animals = [animal];
    gs.store.rehomed = [];
    return { coins: gs.store.economy.coins };
  }, ANIMAL);

  return { before, external, supabaseSeen };
}

/** Open the picker for the seeded animal and tap the first family card. */
async function pickFirstFamily(page: Page): Promise<void> {
  await page.evaluate((animal) => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    const gs = g.scene.getScene('GameScene') as { openAdoptionMatchOverlay: (a: unknown) => void; store: { animals: unknown[] } };
    gs.openAdoptionMatchOverlay(gs.store.animals[0] ?? animal);
  }, ANIMAL);
  await waitForScene(page, 'AdoptionMatchScene');
  await page.waitForTimeout(1200);
  await tapFirstCard(page);
}

async function tapFirstCard(page: Page): Promise<void> {
  // Each card is an invisible interactive rectangle added in order, and the
  // "not yet" button's is added last, so the cards are all but the last. (At
  // 844x390 the cards are squashed to a strip, so no size test finds them.)
  const card = await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    const sc = g.scene.getScene('AdoptionMatchScene') as unknown as {
      container: { list: Array<{ type: string; input?: { enabled: boolean }; getBounds: () => { x: number; y: number; width: number; height: number } }> };
    };
    const hits = sc.container.list
      .filter((o) => o.type === 'Rectangle' && o.input?.enabled)
      .map((o) => o.getBounds());
    const cards = hits.slice(0, -1);
    return cards.length ? { x: cards[0].x + cards[0].width / 2, y: cards[0].y + cards[0].height / 2, n: cards.length } : null;
  });
  expect(card, 'the picker offers family cards').not.toBeNull();
  expect(card!.n).toBe(3);
  await page.mouse.click(card!.x, card!.y);
}

test.use({ deviceScaleFactor: 1 });

for (const size of [PHONE, TABLET]) {
test(`plays one real adoption at ${size.width}x${size.height}: match, hand-over, ceremony, commit`, async ({ page }) => {
  test.setTimeout(180_000);

  const { before, external, supabaseSeen } = await bootShelter(page, size);
  await shoot(page, '00-shelter', size);

  // ── Match: the picker ──
  await page.evaluate((animal) => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    const gs = g.scene.getScene('GameScene') as { openAdoptionMatchOverlay: (a: unknown) => void; store: { animals: unknown[] } };
    gs.openAdoptionMatchOverlay(gs.store.animals[0] ?? animal);
  }, ANIMAL);
  await waitForScene(page, 'AdoptionMatchScene');
  await page.waitForTimeout(1200);
  await shoot(page, '01-match', size);
  await tapFirstCard(page);

  // ── Hand-over: four beats ──
  const seen: Snapshot[] = [];
  for (let beat = 0; beat < 4; beat++) {
    const s = await waitForBeat(page, beat);
    seen.push(s);
    await shoot(page, `02-handover-beat${beat + 1}`, size);
    await page.mouse.click(s.box.x + s.box.w / 2, s.box.y + 30);
  }
  expect(seen.map((s) => s.side)).toEqual(['left', 'right', 'left', 'right']);
  expect(seen.map((s) => s.role)).toEqual(['warden', 'guest', 'warden', 'guest']);
  expect(seen[0].text).toContain('Pumpkin');
  expect(seen[3].words.some((w) => w.kind === 'person' && w.text.includes('Marnie'))).toBe(true);

  // ── Ceremony: the painted overlay ──
  const frame = page.frameLocator('iframe[aria-label="A.R.C. adoption"]');
  await expect(frame.locator('#wave-btn')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  expect(await dialogueSnapshot(page), 'the dialogue is gone once the ceremony is up').toBeNull();
  await shoot(page, '03-ceremony', size);

  // ── Commit ──
  await frame.locator('#wave-btn').click();
  await page.waitForFunction(() => !document.querySelector('iframe[aria-label="A.R.C. adoption"]'), null, { timeout: 10_000 });
  // Read the shelter before anything resizes: a restart of an empty shelter
  // welcomes a new arrival, which would muddy the count.
  const after = await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    const gs = g.scene.getScene('GameScene') as { store: { animals: unknown[]; rehomed: Array<{ animalName: string; householdId: string }>; economy: { coins: number } } };
    return {
      animals: gs.store.animals.length,
      rehomed: gs.store.rehomed.map((r) => ({ name: r.animalName, household: r.householdId })),
      coins: gs.store.economy.coins,
    };
  });
  expect(after.animals).toBe(0);
  expect(after.rehomed).toHaveLength(1);
  expect(after.rehomed[0].name).toBe('Pumpkin');
  expect(after.coins).toBeGreaterThan(before.coins);

  await page.waitForTimeout(700);
  await shoot(page, '04-adopted', size);


  // Nothing went anywhere it should not have.
  expect(external, 'requests to anything but the machine and web fonts').toEqual([]);
  console.log(`[adoption-handover ${size.width}x${size.height}] Supabase requests answered here, none sent: ${supabaseSeen.join(', ') || 'none'}`);
});
}

test('a window resize mid-conversation keeps the conversation, and the adoption goes on', async ({ page }) => {
  test.setTimeout(120_000);
  await bootShelter(page, PHONE);
  await pickFirstFamily(page);

  await waitForBeat(page, 0);
  let s = (await dialogueSnapshot(page))!;
  await page.mouse.click(s.box.x + s.box.w / 2, s.box.y + 30);
  s = await waitForBeat(page, 1);
  expect(s.viewport.w).toBe(PHONE.width);

  // Turn the "phone" into an iPad half way through a sentence. GameScene used
  // to restart on this, which destroyed the dialogue and dropped the adoption.
  await page.setViewportSize(TABLET);
  await page.waitForTimeout(1200);
  const after = await dialogueSnapshot(page);
  expect(after, 'the conversation survives the resize').not.toBeNull();
  expect(after!.beat).toBe(1);
  expect(after!.viewport).toEqual({ w: TABLET.width, h: TABLET.height });
  // And it laid itself out again for the new size: the speaker is 55-65% tall.
  expect(after!.portrait.h / TABLET.height).toBeGreaterThanOrEqual(0.55);
  expect(after!.portrait.h / TABLET.height).toBeLessThanOrEqual(0.65);

  // It still leads to the ceremony.
  for (let beat = 1; beat < 4; beat++) {
    const cur = (await dialogueSnapshot(page))!;
    await page.mouse.click(cur.box.x + cur.box.w / 2, cur.box.y + 30);
    if (beat < 3) await waitForBeat(page, beat + 1);
  }
  await expect(page.frameLocator('iframe[aria-label="A.R.C. adoption"]').locator('#wave-btn')).toBeVisible({ timeout: 15_000 });
});
